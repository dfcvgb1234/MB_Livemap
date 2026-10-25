-- Traces one field outline from the live density map.
-- A scan yields after a sample budget so the game keeps its frame.

FieldBoundaryScanner = {}
FieldBoundaryScanner.__index = FieldBoundaryScanner

local SAMPLE_BUDGET = 400
local STEP = 2
local SEARCH_STEP = 4
local SEARCH_MAX = 48
local LOOKAHEAD = 6
local ANGLE_STEP = math.rad(8)
local MAX_EDGE_STEPS = 4000
local MAX_TRACE_STEPS = 1800
local MAX_ATTEMPTS = 4
local SHARP_TURN = math.rad(15)
local MIN_AREA = 200

local SEARCH_DIRS = {
    { 1, 0 },
    { 0.7071, 0.7071 },
    { 0, 1 },
    { -0.7071, 0.7071 },
    { -1, 0 },
    { -0.7071, -0.7071 },
    { 0, -1 },
    { 0.7071, -0.7071 },
}

local function wrapAngle(angle)
    while angle > math.pi do
        angle = angle - 2 * math.pi
    end
    while angle < -math.pi do
        angle = angle + 2 * math.pi
    end
    return angle
end

-- Giants yaw: local +Z is forward, and y rotation 0 faces world +Z.
local function offset(x, z, yaw, dx, dz)
    local s = math.sin(yaw)
    local c = math.cos(yaw)
    return x + dx * c + dz * s, z - dx * s + dz * c
end

local function lineHit(x1, z1, dx1, dz1, x2, z2, dx2, dz2)
    local det = dx1 * dz2 - dz1 * dx2
    if math.abs(det) < 1e-4 then
        return nil
    end
    local t = ((x2 - x1) * dz2 - (z2 - z1) * dx2) / det
    return x1 + t * dx1, z1 + t * dz1, t
end

local function pointInPolygon(x, z, points)
    local inside = false
    local count = #points
    local previous = count
    for index = 1, count do
        local current = points[index]
        local prior = points[previous]
        if (current.z > z) ~= (prior.z > z) then
            local span = prior.z - current.z
            if span ~= 0 then
                local cross = (prior.x - current.x) * (z - current.z) / span + current.x
                if x < cross then
                    inside = not inside
                end
            end
        end
        previous = index
    end
    return inside
end

local function polygonArea(points)
    local sum = 0
    for index = 1, #points do
        local current = points[index]
        local nxt = points[(index % #points) + 1]
        sum = sum + (current.x * nxt.z - nxt.x * current.z)
    end
    return math.abs(sum) * 0.5
end

local function customFieldPoints(x, z)
    if g_customFieldManager == nil or g_customFieldManager.getCustomField == nil then
        return nil
    end
    local ok, field = pcall(function()
        return g_customFieldManager:getCustomField(x, z)
    end)
    if not ok or type(field) ~= "table" or field.getVertices == nil then
        return nil
    end
    local read, vertices = pcall(function()
        return field:getVertices()
    end)
    if not read or type(vertices) ~= "table" then
        return nil
    end
    local points = {}
    for _, vertex in ipairs(vertices) do
        if type(vertex) == "table" and type(vertex.x) == "number" and type(vertex.z) == "number" then
            points[#points + 1] = { x = vertex.x, z = vertex.z }
        end
    end
    if #points < 3 then
        return nil
    end
    return points
end

function FieldBoundaryScanner.new()
    local self = setmetatable({}, FieldBoundaryScanner)
    self.running = false
    return self
end

function FieldBoundaryScanner:isRunning()
    return self.running == true
end

function FieldBoundaryScanner:start(x, z, onDone)
    if self.running then
        return false, "A field scan is already running"
    end
    if type(x) ~= "number" or type(z) ~= "number" then
        return false, "Missing scan position"
    end
    self.running = true
    self.onDone = onDone
    self.clickX = x
    self.clickZ = z
    self.phase = "search"
    self.searchDist = 0
    self.searchDir = 1
    self.attempt = 0
    self.unavailable = false
    return true
end

function FieldBoundaryScanner:finish(ok, payload)
    self.running = false
    local callback = self.onDone
    self.onDone = nil
    if callback == nil then
        return
    end
    local called, err = pcall(callback, ok, payload)
    if not called and Logging ~= nil and Logging.warning ~= nil then
        Logging.warning("[MB Livemap] field scan callback failed: %s", tostring(err))
    end
end

function FieldBoundaryScanner:onField(x, z)
    self.samples = self.samples + 1
    if FSDensityMapUtil == nil or FSDensityMapUtil.getFieldDataAtWorldPosition == nil then
        self.unavailable = true
        return false
    end
    local y = 0
    if g_currentMission ~= nil and g_currentMission.terrainRootNode ~= nil and getTerrainHeightAtWorldPos ~= nil then
        local ok, height = pcall(getTerrainHeightAtWorldPos, g_currentMission.terrainRootNode, x, 0, z)
        if ok and type(height) == "number" then
            y = height
        end
    end
    local ok, isOn = pcall(FSDensityMapUtil.getFieldDataAtWorldPosition, x, y, z)
    return ok and isOn == true
end

function FieldBoundaryScanner:retryOrFail(message)
    if self.attempt < MAX_ATTEMPTS then
        self:beginAttempt(self.interiorX, self.interiorZ)
        return
    end
    self:finish(false, message)
end

function FieldBoundaryScanner:beginAttempt(x, z)
    self.interiorX = x
    self.interiorZ = z
    self.attempt = self.attempt + 1
    self.px = x
    self.pz = z
    self.yaw = math.pi / 7 + (self.attempt - 1) * (math.pi / 6)
    self.phase = "edgeOut"
    self.edgeSteps = 0
    self.backSteps = 0
    self.traceSteps = 0
    self.points = {}
    self.totalYaw = 0
    self.prevYaw = nil
    self.alignTurned = nil
    self.alignPurpose = nil
end

function FieldBoundaryScanner:foundGround(x, z)
    local custom = customFieldPoints(x, z)
    if custom ~= nil then
        self:finish(true, { points = custom, interiorX = x, interiorZ = z })
        return
    end
    self.attempt = 0
    self:beginAttempt(x, z)
end

function FieldBoundaryScanner:stepSearch()
    if self.searchDist == 0 then
        local custom = customFieldPoints(self.clickX, self.clickZ)
        if custom ~= nil then
            self:finish(true, { points = custom, interiorX = self.clickX, interiorZ = self.clickZ })
            return
        end
        if self:onField(self.clickX, self.clickZ) then
            self:foundGround(self.clickX, self.clickZ)
            return
        end
        self.searchDist = SEARCH_STEP
        self.searchDir = 1
        return
    end

    local dir = SEARCH_DIRS[self.searchDir]
    local x = self.clickX + dir[1] * self.searchDist
    local z = self.clickZ + dir[2] * self.searchDist
    if self:onField(x, z) then
        self:foundGround(x, z)
        return
    end
    self.searchDir = self.searchDir + 1
    if self.searchDir > #SEARCH_DIRS then
        self.searchDir = 1
        self.searchDist = self.searchDist + SEARCH_STEP
        if self.searchDist > SEARCH_MAX then
            self:finish(false, "No field here")
        end
    end
end

function FieldBoundaryScanner:stepEdgeOut()
    if self:onField(self.px, self.pz) then
        self.px, self.pz = offset(self.px, self.pz, self.yaw, 0, STEP)
        self.edgeSteps = self.edgeSteps + 1
        if self.edgeSteps > MAX_EDGE_STEPS then
            self:retryOrFail("Could not find the field edge")
        end
        return
    end
    self.phase = "edgeBack"
    self.backSteps = 0
end

function FieldBoundaryScanner:stepEdgeBack()
    if not self:onField(self.px, self.pz) then
        self.px, self.pz = offset(self.px, self.pz, self.yaw, 0, -0.5)
        self.backSteps = self.backSteps + 1
        if self.backSteps > self.edgeSteps * 4 + 40 then
            self:retryOrFail("Could not find the field edge")
        end
        return
    end
    self.phase = "align"
    self.alignPurpose = "start"
    self.alignTurned = nil
end

function FieldBoundaryScanner:finishAlign()
    self.alignTurned = nil
    if self.alignPurpose == "start" then
        self.points = { { x = self.px, z = self.pz, yaw = self.yaw } }
        self.startX = self.px
        self.startZ = self.pz
        self.prevYaw = self.yaw
        self.totalYaw = 0
        self.traceSteps = 0
        self.alignPurpose = "trace"
        self.phase = "advance"
        return
    end
    self.phase = "advance"
end

function FieldBoundaryScanner:stepAlign()
    local lookX, lookZ = offset(self.px, self.pz, self.yaw, 0, LOOKAHEAD)
    local onEdge = self:onField(lookX, lookZ)
    if self.alignTurned == nil then
        self.alignStart = onEdge
        self.alignTurned = 0
    end
    if self.alignTurned >= math.pi * 2 or onEdge ~= self.alignStart then
        self:finishAlign()
        return
    end
    local direction = onEdge and 1 or -1
    self.yaw = self.yaw + direction * ANGLE_STEP
    self.alignTurned = self.alignTurned + ANGLE_STEP
end

function FieldBoundaryScanner:acceptTrace()
    local points = {}
    for _, point in ipairs(self.points) do
        points[#points + 1] = { x = point.x, z = point.z }
    end
    if #points < 3 or not pointInPolygon(self.interiorX, self.interiorZ, points) or polygonArea(points) < MIN_AREA then
        self:retryOrFail("Could not trace the field edge")
        return
    end
    self:finish(true, { points = points, interiorX = self.interiorX, interiorZ = self.interiorZ })
end

function FieldBoundaryScanner:stepAdvance()
    local delta = wrapAngle(self.yaw - (self.prevYaw or self.yaw))
    if self.traceSteps > 0 and math.abs(delta) > SHARP_TURN then
        local last = self.points[#self.points]
        local fx, fz = math.sin(last.yaw), math.cos(last.yaw)
        local gx, gz = math.sin(self.yaw), math.cos(self.yaw)
        local cornerX, cornerZ, travel = lineHit(last.x, last.z, fx, fz, self.px, self.pz, gx, gz)
        if cornerX ~= nil and travel > 0.5 and travel < LOOKAHEAD * 3 then
            self.points[#self.points + 1] = { x = cornerX, z = cornerZ, yaw = self.yaw }
        end
    end

    self.px, self.pz = offset(self.px, self.pz, self.yaw, 0, STEP)
    self.points[#self.points + 1] = { x = self.px, z = self.pz, yaw = self.yaw }
    if self.prevYaw ~= nil then
        self.totalYaw = self.totalYaw + delta
    end
    self.prevYaw = self.yaw
    self.traceSteps = self.traceSteps + 1

    if self.traceSteps == 1 and math.abs(delta) > math.rad(70) then
        self:retryOrFail("Could not trace the field edge")
        return
    end

    local dx = self.px - self.startX
    local dz = self.pz - self.startZ
    local closed = self.traceSteps > 8 and (dx * dx + dz * dz) <= LOOKAHEAD * LOOKAHEAD and math.abs(self.totalYaw) >= math.pi
    if closed then
        self:acceptTrace()
        return
    end
    if math.abs(self.totalYaw) > math.pi * 3 or self.traceSteps > MAX_TRACE_STEPS then
        self:retryOrFail("Could not trace the field edge")
        return
    end
    self.phase = "align"
    self.alignPurpose = "trace"
    self.alignTurned = nil
end

function FieldBoundaryScanner:step()
    if self.unavailable then
        self:finish(false, "Field scan is not available")
        return
    end
    if self.phase == "search" then
        self:stepSearch()
    elseif self.phase == "edgeOut" then
        self:stepEdgeOut()
    elseif self.phase == "edgeBack" then
        self:stepEdgeBack()
    elseif self.phase == "align" then
        self:stepAlign()
    elseif self.phase == "advance" then
        self:stepAdvance()
    else
        self:finish(false, "Field scan failed")
    end
end

function FieldBoundaryScanner:update()
    if not self.running then
        return
    end
    self.samples = 0
    local guard = 0
    while self.running and self.samples < SAMPLE_BUDGET and guard < SAMPLE_BUDGET * 4 do
        guard = guard + 1
        self:step()
    end
end
