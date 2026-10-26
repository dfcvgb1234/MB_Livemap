-- Orchestrates TCP connection, state snapshots, and command handling.

LivemapBridge = {}
LivemapBridge.__index = LivemapBridge

-- Normal profile. Matches server/src/settingsStore.ts and web/src/lib/performance.ts.
local NORMAL_INTERVALS = {
    vehicles = 400,
    weather = 5000,
    fields = 5000,
    productions = 5000,
    animals = 5000,
    autodrive = 2000,
    courseplay = 2000,
}

local INTERVAL_LIMITS = {
    vehicles = { min = 100, max = 5000 },
    weather = { min = 500, max = 60000 },
    fields = { min = 1000, max = 60000 },
    productions = { min = 1000, max = 60000 },
    animals = { min = 1000, max = 60000 },
    autodrive = { min = 250, max = 30000 },
    courseplay = { min = 500, max = 30000 },
}

local INTERVAL_GROUPS = {
    "vehicles",
    "weather",
    "fields",
    "productions",
    "animals",
    "autodrive",
    "courseplay",
}

local function clampInterval(group, value)
    local limits = INTERVAL_LIMITS[group]
    local n = tonumber(value)
    if n == nil then
        return NORMAL_INTERVALS[group]
    end
    n = math.floor(n + 0.5)
    if n < limits.min then
        return limits.min
    end
    if n > limits.max then
        return limits.max
    end
    return n
end

local function copyIntervals(source)
    local next = {}
    for _, group in ipairs(INTERVAL_GROUPS) do
        next[group] = clampInterval(group, source and source[group])
    end
    return next
end

function LivemapBridge.new()
    local self = setmetatable({}, LivemapBridge)
    self.tcp = TcpClient.new("0.0.0.0", 18765)
    self.collector = StateCollector.new()
    self.autoDrive = AutoDriveSync.new()
    self.courseplay = CourseplaySync.new()
    self.scanner = FieldBoundaryScanner.new()
    self.commands = CommandHandler.new(self)
    self.intervals = copyIntervals(NORMAL_INTERVALS)
    self.accum = {}
    for _, group in ipairs(INTERVAL_GROUPS) do
        self.accum[group] = 0
    end
    self.courseWatchAccum = 0
    self.courseWatchSeen = nil
    self.wasConnected = false
    self.fullPending = true
    self.running = false
    self.updateFn = nil

    local bridge = self
    self.tcp.onLine = function(line)
        bridge:onLine(line)
    end
    self.tcp.onPerformance = function(raw)
        bridge:applyIntervals(raw)
    end
    return self
end

function LivemapBridge:applyIntervals(raw)
    self.intervals = copyIntervals(raw or NORMAL_INTERVALS)
end

function LivemapBridge:start()
    if self.running then
        return
    end
    self.running = true
    self.fullPending = true
    self.collector:refreshSlow()

    self.updateFn = function(dt)
        if not self.running then
            return
        end
        self:update(dt)
    end

    if g_currentMission ~= nil then
        g_currentMission:addUpdateable(self)
    end
    -- Also hook via appended update if addUpdateable is unavailable.
end

function LivemapBridge:stop()
    self.running = false
    if g_currentMission ~= nil and g_currentMission.removeUpdateable ~= nil then
        pcall(function()
            g_currentMission:removeUpdateable(self)
        end)
    end
    self.tcp:disconnect()
end

function LivemapBridge:courseWatchGeneration()
    local path = self.tcp ~= nil and self.tcp.courseWatchPath or nil
    if type(path) ~= "string" or XMLFile == nil or XMLFile.loadIfExists == nil then
        return nil
    end
    -- io.open cannot read in this sandbox (only mode "w" is allowed), so the
    -- generation lives in XML like the other bridge files.
    local xmlFile = nil
    local ok = pcall(function()
        xmlFile = XMLFile.loadIfExists("mbLivemapCourseWatch", path)
    end)
    if not ok or xmlFile == nil then
        return nil
    end
    local raw = nil
    pcall(function()
        raw = xmlFile:getString("coursewatch#generation")
    end)
    pcall(function()
        xmlFile:delete()
    end)
    local value = tonumber(raw)
    if type(value) ~= "number" then
        return nil
    end
    return value
end

function LivemapBridge:sendCourseplay(force)
    if not self.tcp:isConnected() or self.courseplay == nil then
        return
    end
    local generation = self:courseWatchGeneration()
    if not force and type(generation) == "number" and type(self.courseWatchSeen) == "number" and generation > self.courseWatchSeen then
        force = true
    end
    local message = self.courseplay:collectIfChanged(force)
    if message == nil then
        return
    end
    if not self.tcp:sendLine(Json.encode(message)) then
        self.courseplay:invalidate()
        return
    end
    if type(generation) == "number" then
        self.courseWatchSeen = generation
    elseif self.courseWatchSeen == nil then
        self.courseWatchSeen = 0
    end
end

function LivemapBridge:sendAutoDrive(force)
    if not self.tcp:isConnected() then
        return
    end
    local message = self.autoDrive:collectIfChanged(force)
    if message == nil then
        return
    end
    if not self.tcp:sendLine(Json.encode(message)) then
        self.autoDrive:invalidate()
    end
end

function LivemapBridge:flushNotifications()
    if AutoDriveNotify == nil or not self.tcp:isConnected() then
        return
    end
    local items = AutoDriveNotify.drain()
    if type(items) ~= "table" then
        return
    end
    for index, item in ipairs(items) do
        if not self.tcp:sendLine(Json.encode(item)) then
            for restore = #items, index, -1 do
                AutoDriveNotify.unshift(items[restore])
            end
            return
        end
    end
end

function LivemapBridge:sendSnapshot(include)
    if not self.tcp:isConnected() then
        return
    end
    if include.weather then
        self.collector:refreshWeather()
    end
    if include.fields then
        self.collector:refreshFields()
    end
    if include.productions then
        self.collector:refreshProductions()
    end
    if include.animals then
        self.collector:refreshAnimals()
    end
    if include.weather or include.fields or include.productions or include.animals then
        self.collector:refreshMapInfo()
    end
    self.collector.enabledFarmIds = self.tcp.enabledFarmIds
    local snap = self.collector:buildSnapshot(include)
    self.tcp:sendLine(Json.encode(snap))
end

function LivemapBridge:update(dt)
    self.tcp:update()
    if self.scanner ~= nil then
        self.scanner:update()
    end
    self:flushNotifications()
    if CourseplaySync ~= nil and CourseplaySync.updateHandoffs ~= nil then
        CourseplaySync.updateHandoffs()
    end

    local connected = self.tcp:isConnected()
    if connected and not self.wasConnected then
        self.fullPending = true
        if CourseplaySync ~= nil and CourseplaySync.installFinishHook ~= nil then
            CourseplaySync.installFinishHook()
        end
    end
    self.wasConnected = connected

    self.courseWatchAccum = self.courseWatchAccum + dt
    if connected and self.courseWatchAccum >= 1000 then
        self.courseWatchAccum = 0
        local generation = self:courseWatchGeneration()
        if type(generation) == "number" and type(self.courseWatchSeen) == "number" and generation > self.courseWatchSeen then
            self:sendCourseplay(true)
        end
    end

    if connected and self.fullPending then
        self.fullPending = false
        for _, group in ipairs(INTERVAL_GROUPS) do
            self.accum[group] = 0
        end
        self:sendAutoDrive(true)
        self:sendCourseplay(true)
        self:sendSnapshot({
            vehicles = true,
            weather = true,
            fields = true,
            productions = true,
            animals = true,
        })
        if CourseplaySync ~= nil and CourseplaySync.installFinishHook ~= nil then
            CourseplaySync.installFinishHook()
        end
        return
    end

    local due = {}
    local stateDue = false
    for _, group in ipairs(INTERVAL_GROUPS) do
        self.accum[group] = self.accum[group] + dt
        if self.accum[group] >= self.intervals[group] then
            self.accum[group] = 0
            due[group] = true
            if group ~= "autodrive" and group ~= "courseplay" then
                stateDue = true
            end
        end
    end

    if not connected then
        return
    end
    if due.autodrive then
        self:sendAutoDrive(false)
    end
    if due.courseplay then
        self:sendCourseplay(false)
        if CourseplaySync ~= nil and CourseplaySync.installFinishHook ~= nil then
            CourseplaySync.installFinishHook()
        end
    end
    if stateDue then
        self:sendSnapshot(due)
    end
end

function LivemapBridge:onLine(line)
    local msg, err = Json.decode(line)
    if msg == nil then
        Logging.warning("[MB Livemap] bad command JSON: %s", tostring(err))
        return
    end
    if msg.type == "command" then
        local result = self.commands:handle(msg)
        if result ~= nil then
            self.tcp:sendLine(Json.encode(result))
        end
    elseif msg.type == "refreshCourses" then
        self:sendCourseplay(true)
    elseif msg.type == "hello" then
        Logging.info("[MB Livemap] bridge hello received")
    end
end
