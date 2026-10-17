-- Collects farm state snapshots for the livemap bridge.
-- Where an FS25 API is unavailable or unverified, fields are left null.

StateCollector = {}
StateCollector.__index = StateCollector

local function safeCall(fn, default)
    local ok, result = pcall(fn)
    if ok then
        return result
    end
    return default
end

local function isDrivableVehicle(vehicle)
    return vehicle.spec_drivable ~= nil and vehicle.spec_enterable ~= nil
end

local function hotspotTypeName(vehicle)
    if vehicle.typeName == "locomotive" then
        return "TRAIN"
    end
    local index = vehicle.mapHotspotType
    if VehicleHotspot == nil or VehicleHotspot.TYPE == nil or type(index) ~= "number" then
        return nil
    end
    local types = VehicleHotspot.TYPE
    local named = {
        { types.TRACTOR, "TRACTOR" },
        { types.TRUCK, "TRUCK" },
        { types.CAR, "CAR" },
        { types.HARVESTER, "HARVESTER" },
        { types.WHEELLOADER, "WHEELLOADER" },
        { types.TRAILER, "TRAILER" },
        { types.TOOL, "TOOL" },
        { types.TOOL_TRAILED, "TOOL_TRAILED" },
        { types.CUTTER, "CUTTER" },
        { types.OTHER, "OTHER" },
        { types.HORSE, "HORSE" },
        { types.TRAIN, "TRAIN" },
    }
    for _, item in ipairs(named) do
        if item[1] ~= nil and index == item[1] then
            return item[2]
        end
    end
    return nil
end

-- Drivable machines stay "vehicle". Cargo trailers and tools are their own map layers.
local function equipmentCategory(vehicle)
    if isDrivableVehicle(vehicle) then
        return "vehicle"
    end
    local hot = hotspotTypeName(vehicle)
    if hot == "TRAILER" then
        return "trailer"
    end
    if hot == "TOOL" or hot == "TOOL_TRAILED" or hot == "CUTTER" then
        return "implement"
    end
    local typeName = vehicle.typeName
    if type(typeName) == "string" then
        local lower = string.lower(typeName)
        if string.find(lower, "trailer", 1, true) ~= nil then
            return "trailer"
        end
        if string.find(lower, "cutter", 1, true) ~= nil or string.find(lower, "implement", 1, true) ~= nil then
            return "implement"
        end
    end
    if vehicle.spec_attachable ~= nil then
        if vehicle.spec_trailer ~= nil then
            return "trailer"
        end
        return "implement"
    end
    return nil
end

local function labelFromValue(value)
    if type(value) == "string" and value ~= "" then
        return value
    end
    if type(value) == "table" then
        if type(value.name) == "string" and value.name ~= "" then
            return value.name
        end
        if type(value.title) == "string" and value.title ~= "" then
            return value.title
        end
        if type(value.typeName) == "string" and value.typeName ~= "" then
            return value.typeName
        end
    end
    return nil
end

local function fillTypeName(fillTypeIndex)
    if type(fillTypeIndex) ~= "number" or g_fillTypeManager == nil then
        return nil
    end
    local title = safeCall(function()
        if g_fillTypeManager.getFillTypeTitleByIndex ~= nil then
            return g_fillTypeManager:getFillTypeTitleByIndex(fillTypeIndex)
        end
        return nil
    end, nil)
    local named = labelFromValue(title)
    if named ~= nil then
        return named
    end
    local fillType = safeCall(function()
        if g_fillTypeManager.getFillTypeByIndex ~= nil then
            return g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
        end
        return nil
    end, nil)
    named = labelFromValue(fillType)
    if named ~= nil then
        return named
    end
    local internal = safeCall(function()
        if g_fillTypeManager.getFillTypeNameByIndex ~= nil then
            return g_fillTypeManager:getFillTypeNameByIndex(fillTypeIndex)
        end
        return nil
    end, nil)
    return labelFromValue(internal)
end

local function fruitNameFromIndex(index)
    if type(index) ~= "number" or index <= 0 or g_fruitTypeManager == nil then
        return nil
    end
    if FruitType ~= nil and index == FruitType.UNKNOWN then
        return nil
    end
    local desc = safeCall(function()
        if g_fruitTypeManager.getFruitTypeByIndex ~= nil then
            return g_fruitTypeManager:getFruitTypeByIndex(index)
        end
        return nil
    end, nil)
    local named = labelFromValue(desc)
    if named ~= nil and named ~= "unknown" then
        return named
    end
    local internal = safeCall(function()
        if g_fruitTypeManager.getFruitTypeNameByIndex ~= nil then
            return g_fruitTypeManager:getFruitTypeNameByIndex(index)
        end
        return nil
    end, nil)
    named = labelFromValue(internal)
    if named ~= nil and named ~= "unknown" then
        return named
    end
    return nil
end

local function isKnownFruit(index)
    return type(index) == "number" and index > 0 and (FruitType == nil or index ~= FruitType.UNKNOWN)
end

local function channelByte(value)
    if type(value) ~= "number" then
        return nil
    end
    if value <= 1 then
        value = value * 255
    end
    return math.floor(math.max(0, math.min(255, value + 0.5)))
end

-- Fruit map colors are stored as 0-1 RGBA, the same values the in-game map uses.
local function colorToCss(color)
    if type(color) ~= "table" then
        return nil
    end
    local r = channelByte(color[1] or color.r)
    local g = channelByte(color[2] or color.g)
    local b = channelByte(color[3] or color.b)
    if r == nil or g == nil or b == nil then
        return nil
    end
    local a = channelByte(color[4] or color.a or 1) or 255
    return string.format("rgba(%d, %d, %d, %d)", r, g, b, a)
end

local function fruitInfoFromIndex(index)
    if not isKnownFruit(index) or g_fruitTypeManager == nil then
        return nil, nil, nil
    end
    local desc = safeCall(function()
        if g_fruitTypeManager.getFruitTypeByIndex ~= nil then
            return g_fruitTypeManager:getFruitTypeByIndex(index)
        end
        return nil
    end, nil)
    local name = nil
    local color = nil
    local growthMax = nil
    if type(desc) == "table" then
        color = colorToCss(desc.defaultMapColor)
        if type(desc.maxHarvestingGrowthState) == "number" then
            growthMax = desc.maxHarvestingGrowthState
        elseif type(desc.numGrowthStates) == "number" then
            growthMax = desc.numGrowthStates
        end
        if g_fruitTypeManager.getFillTypeByFruitTypeIndex ~= nil then
            local fill = safeCall(function()
                return g_fruitTypeManager:getFillTypeByFruitTypeIndex(index)
            end, nil)
            if type(fill) == "table" and type(fill.title) == "string" and fill.title ~= "" then
                name = fill.title
            else
                name = labelFromValue(fill)
            end
        end
        if name == nil then
            name = labelFromValue(desc)
        end
    end
    if name == nil or name == "unknown" then
        name = fruitNameFromIndex(index)
    end
    if name == "unknown" then
        name = nil
    end
    return name, color, growthMax
end

local function round1(n)
    return math.floor(n * 10 + 0.5) / 10
end

-- The number painted on the in-game map is the field's name or its note, not the table index.
local function cleanFieldNumber(text)
    if type(text) ~= "string" then
        return nil
    end
    local line = text:match("^[^\r\n]+") or text
    line = line:gsub("^%s+", ""):gsub("%s+$", "")
    local digits = line:match("^[Ff]ield[%s_%-]*0*(%d+)$") or line:match("^0*(%d+)$")
    if digits ~= nil and digits ~= "" then
        return digits
    end
    if #line > 0 and #line <= 12 and line:find("%d") ~= nil then
        return line
    end
    return nil
end

-- getNoteNodeText logs an engine error on a transform, even inside pcall.
local function isNoteNode(node)
    if type(node) ~= "number" or node == 0 or getHasClassId == nil or ClassIds == nil or type(ClassIds.NOTE) ~= "number" then
        return false
    end
    local ok, isNote = pcall(getHasClassId, node, ClassIds.NOTE)
    return ok and isNote == true
end

local function noteText(node)
    if not isNoteNode(node) or getNoteNodeText == nil then
        return nil
    end
    local text = safeCall(function()
        return getNoteNodeText(node)
    end, nil)
    if type(text) == "string" and text ~= "" then
        return text
    end
    return nil
end

local function fieldNumberFromIndicator(node)
    local direct = cleanFieldNumber(noteText(node))
    if direct ~= nil then
        return direct
    end
    if type(node) ~= "number" or node == 0 or isNoteNode(node) or getNumOfChildren == nil or getChildAt == nil then
        return nil
    end
    local count = safeCall(function()
        return getNumOfChildren(node)
    end, 0)
    if type(count) ~= "number" or count < 1 then
        return nil
    end
    local limit = math.min(count, 4)
    for i = 0, limit - 1 do
        local fromChild = cleanFieldNumber(noteText(getChildAt(node, i)))
        if fromChild ~= nil then
            return fromChild
        end
    end
    return nil
end

-- Node ids on a loaded map are large. Field numbers are the small ids the game saves.
local function numericId(value, rootNode)
    local number = nil
    if type(value) == "number" then
        number = value
    elseif type(value) == "string" then
        local digits = value:match("^%d+$")
        if digits ~= nil then
            number = tonumber(digits)
        end
    end
    if number == nil or number <= 0 or number >= 10000 or number == rootNode then
        return nil
    end
    return tostring(math.floor(number))
end

local function fieldDisplayId(field, fallbackKey)
    -- The number in the game menu and savegame is getId(), not the i3d node name.
    if field.getId ~= nil then
        local fromGet = numericId(safeCall(function()
            return field:getId()
        end, nil), field.rootNode)
        if fromGet ~= nil then
            return fromGet
        end
    end
    local fromField = numericId(field.fieldId, field.rootNode)
    if fromField ~= nil then
        return fromField
    end
    local fromNote = fieldNumberFromIndicator(field.nameIndicator)
    if fromNote ~= nil then
        return fromNote
    end
    local fromName = cleanFieldNumber(field.name)
    if fromName ~= nil then
        return fromName
    end
    if field.rootNode ~= nil and getName ~= nil then
        local fromNode = cleanFieldNumber(getName(field.rootNode))
        if fromNode ~= nil then
            return fromNode
        end
    end
    return numericId(fallbackKey, field.rootNode) or tostring(fallbackKey)
end

local function distPointToSeg(px, pz, ax, az, bx, bz)
    local dx = bx - ax
    local dz = bz - az
    local len2 = dx * dx + dz * dz
    if len2 < 0.0001 then
        return math.sqrt((px - ax) ^ 2 + (pz - az) ^ 2)
    end
    local t = ((px - ax) * dx + (pz - az) * dz) / len2
    if t < 0 then
        t = 0
    elseif t > 1 then
        t = 1
    end
    local qx = ax + t * dx
    local qz = az + t * dz
    return math.sqrt((px - qx) ^ 2 + (pz - qz) ^ 2)
end

local function douglasPeucker(points, epsilon)
    local n = #points
    if n < 3 then
        return points
    end
    local keep = {}
    local function rec(i, j)
        local maxD = 0
        local idx = nil
        local a = points[i]
        local b = points[j]
        for k = i + 1, j - 1 do
            local d = distPointToSeg(points[k].x, points[k].z, a.x, a.z, b.x, b.z)
            if d > maxD then
                maxD = d
                idx = k
            end
        end
        if idx ~= nil and maxD > epsilon then
            rec(i, idx)
            rec(idx, j)
        else
            keep[i] = true
            keep[j] = true
        end
    end
    rec(1, n)
    local out = {}
    for i = 1, n do
        if keep[i] then
            out[#out + 1] = points[i]
        end
    end
    return out
end

local function simplifyPolygon(points)
    if points == nil or #points < 3 then
        return nil
    end
    local deduped = { points[1] }
    for i = 2, #points do
        local prev = deduped[#deduped]
        local p = points[i]
        local dx = p.x - prev.x
        local dz = p.z - prev.z
        if dx * dx + dz * dz > 0.25 then
            deduped[#deduped + 1] = p
        end
    end
    if #deduped < 3 then
        return nil
    end
    local simplified = douglasPeucker(deduped, 3)
    if #simplified > 160 then
        simplified = douglasPeucker(deduped, 8)
    end
    if #simplified > 160 then
        local stride = math.ceil(#simplified / 120)
        local capped = {}
        for i = 1, #simplified, stride do
            capped[#capped + 1] = simplified[i]
        end
        local last = simplified[#simplified]
        local tail = capped[#capped]
        if tail.x ~= last.x or tail.z ~= last.z then
            capped[#capped + 1] = last
        end
        simplified = capped
    end
    if #simplified < 3 then
        return nil
    end
    return simplified
end

local function pushWorldPoint(points, node)
    if type(node) == "table" and type(node.x) == "number" and type(node.z) == "number" then
        points[#points + 1] = { x = round1(node.x), z = round1(node.z) }
        return
    end
    if type(node) ~= "number" or node == 0 or getWorldTranslation == nil then
        return
    end
    local x, _, z = getWorldTranslation(node)
    if type(x) == "number" and type(z) == "number" then
        points[#points + 1] = { x = round1(x), z = round1(z) }
    end
end

local function pointsFromNode(root)
    if type(root) ~= "number" or root == 0 or getNumOfChildren == nil or getChildAt == nil then
        return nil
    end
    local count = getNumOfChildren(root)
    if type(count) ~= "number" or count < 3 then
        return nil
    end
    local points = {}
    for i = 0, count - 1 do
        pushWorldPoint(points, getChildAt(root, i))
    end
    return points
end

-- FS25 stores each field outline as child nodes of polygonPoints (node ids, not coordinates).
local function outlineFromField(field)
    local points = {}
    if type(field.polygonPoints) == "table" then
        for _, node in ipairs(field.polygonPoints) do
            pushWorldPoint(points, node)
        end
    end
    if #points < 3 and type(field.fieldDimensions) == "number" then
        points = pointsFromNode(field.fieldDimensions) or {}
    end
    if #points < 3 and field.rootNode ~= nil and getUserAttribute ~= nil and I3DUtil ~= nil and I3DUtil.indexToObject ~= nil then
        local polygonIndex = getUserAttribute(field.rootNode, "polygonIndex")
        if polygonIndex ~= nil then
            local root = I3DUtil.indexToObject(field.rootNode, polygonIndex)
            points = pointsFromNode(root) or {}
        end
    end
    return simplifyPolygon(points)
end

local function sampleFieldFruit(x, z)
    if x == nil or z == nil or FSDensityMapUtil == nil or FSDensityMapUtil.getFruitTypeIndexMax == nil then
        return nil, nil, nil
    end
    local fruitIndex = nil
    local ok = pcall(function()
        fruitIndex = FSDensityMapUtil.getFruitTypeIndexMax(x - 2, z - 2, x + 2, z - 2, x - 2, z + 2)
    end)
    if not ok or type(fruitIndex) ~= "number" then
        return nil, nil, nil
    end
    local growthMax = nil
    local desc = safeCall(function()
        if g_fruitTypeManager ~= nil and g_fruitTypeManager.getFruitTypeByIndex ~= nil then
            return g_fruitTypeManager:getFruitTypeByIndex(fruitIndex)
        end
        return nil
    end, nil)
    if type(desc) == "table" then
        growthMax = desc.maxHarvestingGrowthState or desc.numGrowthStates or nil
    end
    local growthState = nil
    if FSDensityMapUtil.getMaxGrowthState ~= nil then
        local sampled = safeCall(function()
            return FSDensityMapUtil.getMaxGrowthState(fruitIndex, x - 2, z - 2, x + 2, z - 2, x - 2, z + 2)
        end, nil)
        if type(sampled) == "number" then
            growthState = sampled
        end
    end
    return fruitNameFromIndex(fruitIndex), growthState, growthMax
end

local function vehicleId(vehicle)
    if vehicle == nil then
        return nil
    end
    if vehicle.id ~= nil then
        return tostring(vehicle.id)
    end
    if vehicle.rootNode ~= nil then
        return tostring(vehicle.rootNode)
    end
    return tostring(vehicle)
end

function StateCollector.new()
    local self = setmetatable({}, StateCollector)
    self.vehicleTickAccum = 0
    self.slowTickAccum = 0
    self.cachedFields = {}
    self.polygonCache = {}
    self.loggedFieldOutlines = false
    self.loggedWeather = false
    self.cachedWeather = {
        condition = nil,
        temperatureC = nil,
        hourly = {},
        daily = {},
    }
    self.cachedProductions = {}
    self.cachedAnimals = {}
    self.mapName = nil
    self.mapSize = nil
    self.customEnvironment = nil
    self.mapDirectory = nil
    self.missionDirectory = nil
    -- Farm ids the dashboard asked to include. Nil means the host farm only.
    self.enabledFarmIds = nil
    return self
end

local function singleSupportedFillType(supported)
    if type(supported) ~= "table" then
        return nil
    end
    local found = nil
    for fillTypeIndex, _ in pairs(supported) do
        if found ~= nil then
            return nil
        end
        found = fillTypeIndex
    end
    return found
end

local function appendVehicleFills(fills, vehicle, sourceName)
    local spec = vehicle and vehicle.spec_fillUnit
    if spec == nil or type(spec.fillUnits) ~= "table" then
        return
    end

    for fillUnitIndex, fillUnit in ipairs(spec.fillUnits) do
        if type(fillUnit) == "table" then
            local capacity = fillUnit.capacity or 0
            if fillUnit.capacityToDisplay ~= nil then
                capacity = fillUnit.capacityToDisplay
            end

            if type(capacity) == "number" and capacity > 0 and fillUnit.showOnHud ~= false then
                local fillType = fillUnit.fillType
                local unknown = FillType ~= nil and FillType.UNKNOWN or nil
                if fillUnit.fillTypeToDisplay ~= nil and fillUnit.fillTypeToDisplay ~= unknown then
                    fillType = fillUnit.fillTypeToDisplay
                elseif fillType == unknown then
                    fillType = singleSupportedFillType(fillUnit.supportedFillTypes)
                    if fillType == nil and vehicle.getFillUnitLastValidFillType ~= nil then
                        local lastValid = safeCall(function()
                            return vehicle:getFillUnitLastValidFillType(fillUnitIndex)
                        end, nil)
                        if lastValid ~= nil and lastValid ~= unknown then
                            fillType = lastValid
                        end
                    end
                end

                local level = fillUnit.fillLevel or 0
                if fillUnit.fillLevelToDisplay ~= nil then
                    level = fillUnit.fillLevelToDisplay
                end
                if type(level) ~= "number" then
                    level = 0
                end

                local title = fillTypeName(fillType) or "Empty"
                if sourceName ~= nil and sourceName ~= "" then
                    title = sourceName .. " · " .. title
                end
                fills[#fills + 1] = {
                    name = title,
                    fillLevel = level,
                    capacity = capacity,
                }
            end
        end
    end
end

local function implementName(obj)
    return safeCall(function()
        if obj ~= nil and obj.getName ~= nil then
            return obj:getName()
        end
        if obj ~= nil then
            return obj.name
        end
        return nil
    end, nil)
end

local function autoDriveModeName(mode)
    if AutoDriveSync == nil or AutoDriveSync.resolve == nil or type(mode) ~= "number" then
        return nil
    end
    local autoDrive = AutoDriveSync.resolve()
    if autoDrive == nil then
        return nil
    end
    if mode == autoDrive.MODE_DRIVETO then
        return "drive"
    end
    if mode == autoDrive.MODE_PICKUPANDDELIVER then
        return "pickup"
    end
    if mode == autoDrive.MODE_DELIVERTO then
        return "deliver"
    end
    if mode == autoDrive.MODE_LOAD then
        return "load"
    end
    if mode == autoDrive.MODE_UNLOAD then
        return "unload"
    end
    return nil
end

local function autoDriveFillTypes(vehicle)
    local ok, list = pcall(function()
        if AutoDriveSync == nil or AutoDriveSync.resolve == nil then
            return nil
        end
        local autoDrive = AutoDriveSync.resolve()
        if autoDrive == nil or autoDrive.getValidSupportedFillTypes == nil then
            return nil
        end
        local indexes = autoDrive.getValidSupportedFillTypes(vehicle)
        if type(indexes) ~= "table" then
            return nil
        end
        local fills = {}
        local seen = {}
        for _, fillIndex in pairs(indexes) do
            if type(fillIndex) == "number" and fillIndex > 0 and seen[fillIndex] == nil then
                seen[fillIndex] = true
                local name = fillTypeName(fillIndex)
                if name == nil or name == "" then
                    name = tostring(fillIndex)
                end
                fills[#fills + 1] = { id = tostring(fillIndex), name = name }
            end
        end
        return fills
    end)
    if ok then
        return list
    end
    return nil
end

local function trimText(value)
    if type(value) ~= "string" then
        return ""
    end
    return (value:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function isDedicatedServer()
    return g_dedicatedServer ~= nil or g_dedicatedServerInfo ~= nil
end

-- A listen server the host is playing on. Dedicated servers and joining clients stay out.
local function isHostedMultiplayer()
    if isDedicatedServer() then
        return false
    end
    local mission = g_currentMission
    if mission == nil then
        return false
    end
    local info = mission.missionDynamicInfo
    if type(info) ~= "table" or info.isMultiplayer ~= true then
        return false
    end
    if mission.getIsServer ~= nil then
        local ok, isServer = pcall(function()
            return mission:getIsServer()
        end)
        if not ok or isServer ~= true then
            return false
        end
    end
    return true
end

local function multiplayerPlayer()
    if g_localPlayer ~= nil then
        return g_localPlayer
    end
    local mission = g_currentMission
    if mission == nil then
        return nil
    end
    if mission.playerSystem ~= nil and mission.playerSystem.getLocalPlayer ~= nil then
        local ok, player = pcall(function()
            return mission.playerSystem:getLocalPlayer()
        end)
        if ok and player ~= nil then
            return player
        end
    end
    return mission.player
end

local function positiveFarmId(value)
    if type(value) == "table" then
        value = value.farmId or value.id
    end
    local id = tonumber(value)
    if id == nil or id <= 0 then
        return nil
    end
    if FarmManager ~= nil and id == FarmManager.SPECTATOR_FARM_ID then
        return nil
    end
    return id
end

local function localFarmId()
    local player = multiplayerPlayer()
    if player ~= nil and player.getFarmId ~= nil then
        local ok, id = pcall(function()
            return player:getFarmId()
        end)
        if ok then
            local farmId = positiveFarmId(id)
            if farmId ~= nil then
                return farmId
            end
        end
    end
    local mission = g_currentMission
    if mission ~= nil and mission.getFarmId ~= nil then
        local ok, id = pcall(function()
            return mission:getFarmId()
        end)
        if ok then
            return positiveFarmId(id)
        end
    end
    return nil
end

local function colorChannel(value)
    local number = tonumber(value)
    if number == nil then
        return nil
    end
    if number >= 0 and number <= 1 then
        return math.floor(number * 255 + 0.5)
    end
    if number >= 0 and number <= 255 then
        return math.floor(number + 0.5)
    end
    return nil
end

local function rgbHex(r, g, b)
    local red = colorChannel(r)
    local green = colorChannel(g)
    local blue = colorChannel(b)
    if red == nil or green == nil or blue == nil then
        return nil
    end
    return string.format("#%02x%02x%02x", red, green, blue)
end

local function tableColor(color)
    if type(color) ~= "table" then
        return nil
    end
    if color[1] ~= nil then
        return rgbHex(color[1], color[2], color[3])
    end
    return rgbHex(color.r or color.x, color.g or color.y, color.b or color.z)
end

local function farmColorHex(farm, farmId)
    if type(farm) == "table" then
        local hex = tableColor(farm.color) or tableColor(farm.uiColor) or tableColor(farm.farmColor)
        if hex ~= nil then
            return hex
        end
        if farm.getColor ~= nil then
            local ok, r, g, b = pcall(function()
                return farm:getColor()
            end)
            if ok then
                hex = type(r) == "table" and tableColor(r) or rgbHex(r, g, b)
                if hex ~= nil then
                    return hex
                end
            end
        end
    end
    if g_farmManager ~= nil and type(farmId) == "number" then
        local palettes = { g_farmManager.farmColors, g_farmManager.colors }
        for index = 1, 2 do
            local colors = palettes[index]
            if type(colors) == "table" then
                local hex = tableColor(colors[farmId])
                if hex ~= nil then
                    return hex
                end
            end
        end
    end
    return nil
end

local function callNumber(object, methodName)
    if type(object) ~= "table" or object[methodName] == nil then
        return nil
    end
    local ok, value = pcall(object[methodName], object)
    if ok and type(value) == "number" then
        return value
    end
    return nil
end

-- "Farm 1" is the empty-slot label. A name the player typed is anything else.
local function genericFarmLabel(name, farmId)
    return name ~= "" and name:lower() == ("farm " .. tostring(farmId))
end

local function rawFarmName(farm)
    if type(farm) ~= "table" then
        return ""
    end
    local fields = { farm.name, farm.farmName, farm.title, farm.customName }
    for index = 1, #fields do
        local name = trimText(fields[index])
        if name ~= "" then
            return name
        end
    end
    if farm.getName ~= nil then
        local ok, value = pcall(function()
            return farm:getName()
        end)
        if ok then
            return trimText(value)
        end
    end
    return ""
end

local function farmPlayerCount(farm)
    local count = callNumber(farm, "getNumPlayers")
    if count ~= nil then
        return count
    end
    if type(farm) == "table" and type(farm.players) == "table" then
        local total = 0
        for _ in pairs(farm.players) do
            total = total + 1
        end
        return total
    end
    return 0
end

-- Array indexes are not farm ids. Resolve the farm object, then read its id.
local function resolveFarm(candidate, key)
    if type(candidate) == "table" then
        local id = positiveFarmId(candidate.farmId or candidate.id)
        if id == nil and candidate.getId ~= nil then
            local ok, value = pcall(function()
                return candidate:getId()
            end)
            if ok then
                id = positiveFarmId(value)
            end
        end
        if id ~= nil then
            return candidate, id
        end
        if candidate.farmId ~= nil or candidate.isSpectator == true then
            return nil, nil
        end
    end
    local id = positiveFarmId(key)
    if id == nil then
        id = positiveFarmId(candidate)
    end
    if id == nil or g_farmManager == nil or g_farmManager.getFarmById == nil then
        return nil, nil
    end
    local ok, farm = pcall(function()
        return g_farmManager:getFarmById(id)
    end)
    if ok and type(farm) == "table" then
        return farm, positiveFarmId(farm.farmId or farm.id) or id
    end
    return nil, nil
end

local function readOwnerFarmId(vehicle)
    if vehicle == nil then
        return nil
    end
    local id = safeCall(function()
        if vehicle.getOwnerFarmId ~= nil then
            return vehicle:getOwnerFarmId()
        end
        return vehicle.ownerFarmId
    end, nil)
    if type(id) == "number" then
        return id
    end
    return tonumber(id)
end

-- Unowned equipment stays. A real farm is included when it is the host farm or the dashboard enabled it.
local function farmIsVisible(farmId, ownFarm, enabled)
    if type(farmId) ~= "number" or farmId <= 0 then
        return true
    end
    if FarmManager ~= nil and farmId == FarmManager.SPECTATOR_FARM_ID then
        return false
    end
    if ownFarm ~= nil and farmId == ownFarm then
        return true
    end
    if type(enabled) == "table" and enabled[farmId] == true then
        return true
    end
    return false
end

local function appendFarm(farms, seen, candidate, key)
    local farm, id = resolveFarm(candidate, key)
    if farm == nil or id == nil or seen[id] == true then
        return
    end
    local name = rawFarmName(farm)
    local players = farmPlayerCount(farm)
    -- Hosted games pre-create empty slots. They have no name and no players.
    if (name == "" or genericFarmLabel(name, id)) and players <= 0 then
        return
    end
    seen[id] = true
    if name == "" or genericFarmLabel(name, id) then
        name = "Farm " .. tostring(id)
    end
    local entry = {
        id = id,
        name = name,
    }
    local color = farmColorHex(farm, id)
    if color ~= nil then
        entry.color = color
    end
    local balance = callNumber(farm, "getBalance")
    if balance == nil and type(farm.money) == "number" then
        balance = farm.money
    end
    local loan = callNumber(farm, "getLoan")
    if loan == nil and type(farm.loan) == "number" then
        loan = farm.loan
    end
    local equity = callNumber(farm, "getEquity")
    if balance ~= nil then
        entry.balance = balance
    end
    if loan ~= nil then
        entry.loan = loan
    end
    if equity ~= nil then
        entry.equity = equity
    end
    farms[#farms + 1] = entry
end

local function collectFarms()
    local farms = {}
    local seen = {}
    if g_farmManager == nil then
        return farms
    end
    local listed = false
    if g_farmManager.getFarms ~= nil then
        local ok, list = pcall(function()
            return g_farmManager:getFarms()
        end)
        if ok and type(list) == "table" then
            listed = true
            for key, farm in pairs(list) do
                appendFarm(farms, seen, farm, key)
            end
        end
    end
    if not listed and type(g_farmManager.farms) == "table" then
        for key, farm in pairs(g_farmManager.farms) do
            appendFarm(farms, seen, farm, key)
        end
    end
    table.sort(farms, function(a, b)
        return a.id < b.id
    end)
    return farms
end

local function worldPose(node)
    if node == nil or node == 0 then
        return nil, nil, nil
    end
    local ok, x, _, z = pcall(function()
        return getWorldTranslation(node)
    end)
    if not ok or x == nil or z == nil then
        return nil, nil, nil
    end
    local heading = nil
    local okDir, dx, _, dz = pcall(function()
        return localDirectionToWorld(node, 0, 0, 1)
    end)
    if okDir and dx ~= nil and dz ~= nil and MathUtil ~= nil and MathUtil.getYRotationFromDirection ~= nil then
        heading = MathUtil.getYRotationFromDirection(dx, dz)
    end
    return x, z, heading
end

local function playerPose(player)
    if player == nil then
        return nil, nil, nil
    end
    local interpolator = player.positionalInterpolator
    if interpolator ~= nil and interpolator.positionInterpolator ~= nil and interpolator.yawInterpolator ~= nil then
        local x = interpolator.positionInterpolator.positionX
        local z = interpolator.positionInterpolator.positionZ
        local heading = interpolator.yawInterpolator.value
        if x ~= nil and z ~= nil then
            return x, z, heading
        end
    end
    if player.rootNode ~= nil and player.rootNode ~= 0 and player.getMapPositionAndLookYaw ~= nil then
        local ok, x, z, heading = pcall(function()
            return player:getMapPositionAndLookYaw()
        end)
        if ok and x ~= nil and z ~= nil then
            return x, z, heading
        end
    end
    if player.getPosition ~= nil then
        local ok, x, _, z = pcall(function()
            return player:getPosition()
        end)
        if ok and x ~= nil and z ~= nil then
            return x, z, player.rotY
        end
    end
    return worldPose(player.rootNode)
end

local function isLocalPlayerInstance(player)
    if player == nil then
        return false
    end
    local host = multiplayerPlayer()
    if host ~= nil and player == host then
        return true
    end
    return player.isOwner == true or player.isLocallyControlled == true
end

local function playerNickname(player, fallback)
    if player ~= nil and player.getNickname ~= nil then
        local ok, name = pcall(function()
            return player:getNickname()
        end)
        name = ok and trimText(name) or ""
        if name ~= "" then
            return name
        end
    end
    return fallback or ""
end

local function numericId(value)
    if type(value) == "number" then
        return value
    end
    return tonumber(value)
end

-- Players, users, and vehicles do not all store the farm on the same field.
local function objectFarmId(object)
    if type(object) ~= "table" then
        return nil
    end
    local getters = { "getFarmId", "getFarm", "getCurrentFarmId", "getActiveFarmId", "getOwnerFarmId" }
    for index = 1, #getters do
        local getter = object[getters[index]]
        if getter ~= nil then
            local ok, value = pcall(getter, object)
            if ok then
                local farmId = positiveFarmId(value)
                if farmId ~= nil then
                    return farmId
                end
            end
        end
    end
    local fields = { object.farmId, object.currentFarmId, object.activeFarmId, object.ownerFarmId }
    for index = 1, #fields do
        local farmId = positiveFarmId(fields[index])
        if farmId ~= nil then
            return farmId
        end
    end
    if type(object.farm) == "table" then
        return positiveFarmId(object.farm.farmId or object.farm.id)
    end
    return nil
end

local function userIdOf(object)
    if type(object) ~= "table" then
        return nil
    end
    if object.getUserId ~= nil then
        local ok, value = pcall(function()
            return object:getUserId()
        end)
        if ok then
            local id = numericId(value)
            if id ~= nil and id > 0 then
                return id
            end
        end
    end
    local id = numericId(object.userId)
    if id ~= nil and id > 0 then
        return id
    end
    return nil
end

local function farmIdForUser(userId)
    userId = numericId(userId)
    if userId == nil or userId <= 0 or g_farmManager == nil or g_farmManager.getFarmByUserId == nil then
        return nil
    end
    local ok, farm = pcall(function()
        return g_farmManager:getFarmByUserId(userId)
    end)
    if ok then
        return positiveFarmId(farm)
    end
    return nil
end

local function farmIdForUniqueUser(uniqueUserId)
    if uniqueUserId == nil or uniqueUserId == "" or g_farmManager == nil or g_farmManager.getFarmForUniqueUserId == nil then
        return nil
    end
    local ok, farm = pcall(function()
        return g_farmManager:getFarmForUniqueUserId(uniqueUserId)
    end)
    if ok then
        return positiveFarmId(farm)
    end
    return nil
end

local function playerFarmId(player, userId, isLocal, farmId)
    farmId = positiveFarmId(farmId) or objectFarmId(player)
    if farmId == nil then
        local uid = numericId(userId)
        if uid == nil or uid <= 0 then
            uid = userIdOf(player)
        end
        farmId = farmIdForUser(uid)
    end
    if farmId == nil and isLocal == true then
        farmId = localFarmId()
    end
    return farmId
end

local function controlledVehicleOf(player, isLocal)
    if isLocal and g_currentMission ~= nil and type(g_currentMission.controlledVehicle) == "table" then
        return g_currentMission.controlledVehicle
    end
    if player == nil then
        return nil
    end
    local function entered(candidate)
        if type(candidate) == "table" and candidate.rootNode ~= nil then
            return candidate
        end
        return nil
    end
    return entered(player.controlledVehicle)
        or entered(player.currentVehicle)
        or entered(player.enteredVehicle)
        or entered(player.vehicle)
end

local function exportablePlayerName(name)
    name = trimText(name)
    if name == "" or name == "Server" or name == "Unknown" then
        return nil
    end
    return name
end

local function collectPlayers()
    local players = {}
    local seen = {}
    local hasLocal = false
    local mission = g_currentMission
    if mission == nil then
        return players
    end

    local function addPlayer(player, id, name, farmId, isLocal)
        name = exportablePlayerName(name)
        if name == nil or player == nil then
            return
        end
        local uid = isLocal and ("local|" .. name) or ("user|" .. tostring(id or 0) .. "|" .. name)
        local x, z, heading = playerPose(player)
        local vehicle = controlledVehicleOf(player, isLocal)
        if vehicle ~= nil then
            local vx, vz, vHeading = worldPose(vehicle.rootNode)
            if vx ~= nil and vz ~= nil then
                x, z = vx, vz
                if vHeading ~= nil then
                    heading = vHeading
                end
            end
        end
        farmId = playerFarmId(player, id, isLocal, farmId)
        if farmId == nil and vehicle ~= nil then
            farmId = positiveFarmId(readOwnerFarmId(vehicle))
        end
        if seen[uid] == true then
            if isLocal then
                hasLocal = true
            end
            if type(farmId) == "number" and farmId > 0 then
                for index = 1, #players do
                    if players[index].id == uid and players[index].farmId == nil then
                        players[index].farmId = farmId
                    end
                end
            end
            return
        end
        if x == nil or z == nil then
            return
        end
        if isLocal ~= true and vehicle == nil and math.abs(x) < 0.001 and math.abs(z) < 0.001 then
            return
        end
        seen[uid] = true
        local entry = {
            id = uid,
            name = name,
            x = x,
            z = z,
            heading = heading or 0,
        }
        if type(farmId) == "number" and farmId > 0 then
            entry.farmId = farmId
        end
        players[#players + 1] = entry
        if isLocal then
            hasLocal = true
        end
    end

    local userManager = mission.userManager
    if userManager ~= nil and userManager.getUsers ~= nil then
        local ok, users = pcall(function()
            return userManager:getUsers()
        end)
        if ok and type(users) == "table" then
            for _, user in pairs(users) do
                if type(user) == "table" then
                    local name = ""
                    if user.getNickname ~= nil then
                        local okName, value = pcall(function()
                            return user:getNickname()
                        end)
                        if okName then
                            name = trimText(value)
                        end
                    end
                    local userId = nil
                    if user.getId ~= nil then
                        local okId, value = pcall(function()
                            return user:getId()
                        end)
                        if okId then
                            userId = tonumber(value)
                        end
                    end
                    if exportablePlayerName(name) ~= nil and user.getConnection ~= nil and mission.connectionsToPlayer ~= nil then
                        local okConnection, connection = pcall(function()
                            return user:getConnection()
                        end)
                        local player = okConnection and connection ~= nil and mission.connectionsToPlayer[connection] or nil
                        if player ~= nil then
                            local farmId = objectFarmId(user) or farmIdForUser(userId)
                            if farmId == nil and user.getUniqueUserId ~= nil then
                                local okUnique, uniqueUserId = pcall(function()
                                    return user:getUniqueUserId()
                                end)
                                if okUnique then
                                    farmId = farmIdForUniqueUser(uniqueUserId)
                                end
                            end
                            addPlayer(player, userId or 0, name, farmId, isLocalPlayerInstance(player))
                        end
                    end
                end
            end
        end
    end

    if mission.playerSystem ~= nil and type(mission.playerSystem.players) == "table" then
        for _, player in pairs(mission.playerSystem.players) do
            if type(player) == "table" then
                local isLocal = isLocalPlayerInstance(player)
                addPlayer(player, userIdOf(player) or 0, playerNickname(player, isLocal and "Player" or ""), objectFarmId(player), isLocal)
            end
        end
    end

    if not hasLocal then
        local player = mission.player or g_localPlayer
        if player ~= nil then
            addPlayer(player, userIdOf(player) or 0, playerNickname(player, "Player"), objectFarmId(player), true)
        end
    end

    return players
end

function StateCollector:collectVehicles()
    local vehicles = {}
    local list = safeCall(function()
        return g_currentMission and g_currentMission.vehicleSystem and g_currentMission.vehicleSystem.vehicles
    end, nil)

    if list == nil then
        list = safeCall(function()
            return g_currentMission and g_currentMission.vehicles
        end, nil)
    end

    if type(list) ~= "table" then
        return vehicles
    end

    local hosted = isHostedMultiplayer()
    local ownFarm = hosted and localFarmId() or nil
    local farmNames = nil
    if hosted then
        farmNames = {}
        for _, farm in ipairs(collectFarms()) do
            farmNames[farm.id] = farm.name
        end
    end

    for _, vehicle in pairs(list) do
        local ownerId = nil
        if hosted and vehicle ~= nil and vehicle.isDeleted ~= true then
            ownerId = readOwnerFarmId(vehicle)
        end
        local category = nil
        if vehicle ~= nil and vehicle.isDeleted ~= true and (not hosted or farmIsVisible(ownerId, ownFarm, self.enabledFarmIds)) then
            category = equipmentCategory(vehicle)
        end
        if category ~= nil then
            local x, y, z = 0, 0, 0
            local heading = 0
            local okPos = pcall(function()
                if vehicle.rootNode ~= nil then
                    x, y, z = getWorldTranslation(vehicle.rootNode)
                    local dx, _, dz = localDirectionToWorld(vehicle.rootNode, 0, 0, 1)
                    heading = MathUtil.getYRotationFromDirection(dx, dz)
                end
            end)

            local speed = safeCall(function()
                if vehicle.getLastSpeed ~= nil then
                    return vehicle:getLastSpeed()
                end
                return 0
            end, 0)

            local occupied = safeCall(function()
                if vehicle.getIsControlled ~= nil then
                    return vehicle:getIsControlled() == true
                end
                local enterable = vehicle.spec_enterable
                if enterable ~= nil then
                    return enterable.isControlled == true
                end
                return false
            end, false)

            local engineOn = safeCall(function()
                if vehicle.getIsMotorStarted ~= nil then
                    return vehicle:getIsMotorStarted()
                end
                if vehicle.spec_motorized ~= nil and vehicle.spec_motorized.isMotorStarted ~= nil then
                    return vehicle.spec_motorized.isMotorStarted
                end
                return false
            end, false)

            local name = safeCall(function()
                if vehicle.getName ~= nil then
                    return vehicle:getName()
                end
                return vehicle.name
            end, "Vehicle")

            local vType = safeCall(function()
                if vehicle.typeName ~= nil then
                    return vehicle.typeName
                end
                return nil
            end, nil)

            local attached = {}
            local fills = {}
            safeCall(function()
                appendVehicleFills(fills, vehicle, nil)
                if vehicle.getAttachedImplements ~= nil then
                    local implements = vehicle:getAttachedImplements()
                    if type(implements) == "table" then
                        for _, impl in pairs(implements) do
                            local obj = impl.object or impl
                            local iname = implementName(obj) or "Implement"
                            attached[#attached + 1] = iname
                            appendVehicleFills(fills, obj, iname)
                        end
                    end
                end
            end, nil)

            local damage = safeCall(function()
                if vehicle.getDamageAmount ~= nil then
                    local amount = vehicle:getDamageAmount()
                    if type(amount) == "number" then
                        return amount
                    end
                end
                local wearable = vehicle.spec_wearable
                if wearable ~= nil and type(wearable.damage) == "number" then
                    return wearable.damage
                end
                return nil
            end, nil)

            local adState = safeCall(function()
                local ad = vehicle.ad
                if ad == nil or ad.stateModule == nil then
                    return nil
                end
                local state = ad.stateModule
                local active = false
                if state.isActive ~= nil then
                    active = state:isActive() == true
                end
                local destination = nil
                if state.getFirstMarkerName ~= nil then
                    destination = state:getFirstMarkerName()
                end
                local second = nil
                if state.getSecondMarkerName ~= nil then
                    second = state:getSecondMarkerName()
                end
                local modeName = nil
                if state.getMode ~= nil then
                    modeName = autoDriveModeName(state:getMode())
                end
                return {
                    active = active,
                    destination = destination,
                    second = second,
                    mode = modeName,
                    fillTypes = autoDriveFillTypes(vehicle),
                }
            end, nil)

            if okPos then
                local entry = {
                    id = vehicleId(vehicle),
                    name = name or "Vehicle",
                    type = vType,
                    category = category,
                    x = x,
                    z = z,
                    heading = heading,
                    speed = speed or 0,
                    engineOn = engineOn and true or false,
                    occupied = occupied and true or false,
                    attached = attached,
                    fills = fills,
                }
                if type(damage) == "number" then
                    entry.damage = damage
                end
                if adState ~= nil then
                    entry.adCapable = true
                    entry.adActive = adState.active and true or false
                    if type(adState.destination) == "string" and adState.destination ~= "" then
                        entry.adDestination = adState.destination
                    end
                    if type(adState.second) == "string" and adState.second ~= "" then
                        entry.adSecondDestination = adState.second
                    end
                    if type(adState.mode) == "string" and adState.mode ~= "" then
                        entry.adMode = adState.mode
                    end
                    if type(adState.fillTypes) == "table" then
                        entry.adFillTypes = adState.fillTypes
                    end
                end
                local cpState = safeCall(function()
                    if vehicle.appendLoadedCpCourse == nil and vehicle.getIsCpActive == nil then
                        return nil
                    end
                    local active = false
                    if vehicle.getIsCpActive ~= nil then
                        active = vehicle:getIsCpActive() == true
                    end
                    local course = nil
                    if vehicle.hasCpCourse ~= nil and vehicle:hasCpCourse() and vehicle.getCurrentCpCourseName ~= nil then
                        course = vehicle:getCurrentCpCourseName()
                    end
                    return {
                        active = active,
                        course = course,
                    }
                end, nil)
                if cpState ~= nil then
                    entry.cpCapable = true
                    entry.cpActive = cpState.active and true or false
                if type(cpState.course) == "string" and cpState.course ~= "" then
                    entry.cpCourse = cpState.course
                end
                end
                if hosted and type(ownerId) == "number" and ownerId > 0 then
                    entry.farmId = ownerId
                    if farmNames ~= nil and type(farmNames[ownerId]) == "string" then
                        entry.farmName = farmNames[ownerId]
                    end
                end
                vehicles[#vehicles + 1] = entry
            end
        end
    end

    return vehicles
end

local function isRecord(value)
    local kind = type(value)
    return kind == "table" or kind == "userdata"
end

local function weatherTypeName(value)
    if type(value) == "string" and value ~= "" then
        return value
    end
    if type(value) == "table" then
        if type(value.name) == "string" and value.name ~= "" then
            return value.name
        end
        if value.index ~= nil then
            return weatherTypeName(value.index)
        end
        return nil
    end
    if type(value) ~= "number" or g_weatherTypeManager == nil or g_weatherTypeManager.getWeatherTypeNameByIndex == nil then
        return nil
    end
    local name = safeCall(function()
        return g_weatherTypeManager:getWeatherTypeNameByIndex(value)
    end, nil)
    if type(name) == "string" and name ~= "" then
        return name
    end
    return nil
end

local function weatherIndexToType(index)
    if WeatherType ~= nil and type(index) == "number" then
        if index == WeatherType.SUN then
            return "SUN"
        elseif index == WeatherType.RAIN then
            return "RAIN"
        elseif index == WeatherType.CLOUDY then
            return "CLOUDY"
        elseif index == WeatherType.SNOW then
            return "SNOW"
        elseif index == WeatherType.TWISTER then
            return "TWISTER"
        elseif index == WeatherType.THUNDER then
            return "THUNDER"
        elseif index == WeatherType.PARTIALLY_CLOUDY then
            return "PARTIALLY_CLOUDY"
        elseif index == WeatherType.HAIL then
            return "HAIL"
        end
    end
    return weatherTypeName(index)
end

local function roundTemp(value)
    if type(value) ~= "number" then
        return nil
    end
    return math.floor(value + 0.5)
end

local function mpsToBeaufort(value)
    if type(value) ~= "number" then
        return nil
    end
    return math.floor((math.ceil(value) / 0.836) ^ (2 / 3))
end

local function windRadians(direction)
    if type(direction) ~= "number" then
        return nil
    end
    return math.rad(direction) + math.pi
end

local function weatherSlot(label, forecastType, temperature, lowTemperature, highTemperature, windDirection, windSpeed)
    return {
        label = label,
        type = weatherIndexToType(forecastType),
        temperatureC = roundTemp(temperature),
        lowTemperatureC = roundTemp(lowTemperature),
        highTemperatureC = roundTemp(highTemperature),
        windRotation = windRadians(windDirection),
        windVelocity = mpsToBeaufort(windSpeed),
    }
end

local function dayLabel(env, day, fallback)
    if g_i18n == nil or g_i18n.formatDayInPeriod == nil or env == nil then
        return fallback
    end
    local period = nil
    local dayInPeriod = nil
    if day ~= nil and env.getPeriodFromDay ~= nil and env.getDayInPeriodFromDay ~= nil then
        period = safeCall(function()
            return env:getPeriodFromDay(day)
        end, nil)
        dayInPeriod = safeCall(function()
            return env:getDayInPeriodFromDay(day)
        end, nil)
    elseif env.currentPeriod ~= nil and env.currentDayInPeriod ~= nil then
        period = env.currentPeriod
        dayInPeriod = env.currentDayInPeriod
    end
    if period == nil or dayInPeriod == nil then
        return fallback
    end
    local formatted = safeCall(function()
        return g_i18n:formatDayInPeriod(dayInPeriod, period, false)
    end, nil)
    if type(formatted) == "string" and formatted ~= "" then
        return formatted
    end
    return fallback
end

local function readScale(system, env, methodName, fieldName)
    if system ~= nil and system[methodName] ~= nil then
        local value = safeCall(function()
            return system[methodName](system)
        end, nil)
        if type(value) == "number" then
            return value
        end
    end
    if system ~= nil and type(system[fieldName]) == "number" then
        return system[fieldName]
    end
    if env ~= nil and type(env[fieldName]) == "number" then
        return env[fieldName]
    end
    return nil
end

local function conditionFromSky(system, env)
    local rain = readScale(system, env, "getRainFallScale", "rainFallScale")
        or readScale(system, env, "getRainScale", "rainScale")
    local fog = readScale(system, env, "getFogScale", "fogScale")
    local cloud = readScale(system, env, "getCloudCoverage", "cloudCoverage")
    if rain == nil and fog == nil and cloud == nil then
        return nil
    end
    rain = rain or 0
    fog = fog or 0
    cloud = cloud or 0
    if cloud > 1 then
        cloud = cloud / 100
    end
    if rain > 0.7 then
        return "Storm"
    end
    if rain > 0.05 then
        return "Rain"
    end
    if fog > 0.3 then
        return "Fog"
    end
    if cloud > 0.7 then
        return "Cloudy"
    end
    if cloud > 0.3 then
        return "PartlyCloudy"
    end
    if rain == 0 and fog == 0 and cloud == 0 and system == nil then
        return nil
    end
    return "Sun"
end

local function findForecast(env)
    local weather = env.weather
    if isRecord(weather) and isRecord(weather.forecast) then
        return weather.forecast, weather
    end
    local system = env.weatherSystem
    if isRecord(system) and isRecord(system.forecast) then
        return system.forecast, system
    end
    return nil, weather or system
end

function StateCollector:collectWeather()
    local weather = {
        condition = nil,
        temperatureC = nil,
        hourly = {},
        daily = {},
    }

    safeCall(function()
        local env = g_currentMission and g_currentMission.environment
        if env == nil then
            return
        end
        local forecast, source = findForecast(env)
        if isRecord(forecast) and forecast.getCurrentWeather ~= nil then
            local current = safeCall(function()
                return forecast:getCurrentWeather()
            end, nil)
            if isRecord(current) then
                local windDirection = current.windDirection
                local windSpeed = current.windSpeed
                if g_currentMission.paused == true and forecast.getHourlyForecast ~= nil then
                    local firstHour = safeCall(function()
                        return forecast:getHourlyForecast(0)
                    end, nil)
                    if isRecord(firstHour) then
                        windDirection = firstHour.windDirection
                        windSpeed = firstHour.windSpeed
                    end
                end
                local now = weatherSlot(
                    dayLabel(env, nil, "Now"),
                    current.forecastType,
                    current.temperature,
                    nil,
                    nil,
                    windDirection,
                    windSpeed
                )
                weather.condition = now.type
                weather.temperatureC = now.temperatureC
                weather.hourly[#weather.hourly + 1] = now
            end
        end

        if isRecord(forecast) and forecast.getHourlyForecast ~= nil then
            for i = 1, 24 do
                if i % 2 == 1 then
                    local info = safeCall(function()
                        return forecast:getHourlyForecast(i - 1)
                    end, nil)
                    if not isRecord(info) then
                        break
                    end
                    local hours = 0
                    if type(info.time) == "number" then
                        hours = math.floor(info.time / 3600000) % 24
                    end
                    weather.hourly[#weather.hourly + 1] = weatherSlot(
                        string.format("%02d:00", hours),
                        info.forecastType,
                        info.temperature,
                        nil,
                        nil,
                        info.windDirection,
                        info.windSpeed
                    )
                end
            end
        end

        if isRecord(forecast) and forecast.getDailyForecast ~= nil then
            for i = 1, 7 do
                local info = safeCall(function()
                    return forecast:getDailyForecast(i)
                end, nil)
                if not isRecord(info) then
                    break
                end
                weather.daily[#weather.daily + 1] = weatherSlot(
                    dayLabel(env, info.day, "Day " .. tostring(i)),
                    info.forecastType,
                    nil,
                    info.lowTemperature,
                    info.highTemperature,
                    info.windDirection,
                    info.windSpeed
                )
            end
        end

        if weather.temperatureC == nil and isRecord(source) then
            local temp = nil
            if source.getCurrentTemperature ~= nil then
                temp = safeCall(function()
                    return source:getCurrentTemperature()
                end, nil)
            elseif type(source.temperature) == "number" then
                temp = source.temperature
            end
            if type(temp) == "number" then
                weather.temperatureC = roundTemp(temp)
            end
        end
        if weather.condition == nil then
            weather.condition = conditionFromSky(source, env)
        end

        if not self.loggedWeather and Logging ~= nil and Logging.info ~= nil then
            self.loggedWeather = true
            Logging.info(
                "[MB Livemap] weather %s, hourly %d, daily %d",
                tostring(weather.condition),
                #weather.hourly,
                #weather.daily
            )
        end
    end, nil)

    return weather
end

function StateCollector:collectFields()
    local fields = {}
    safeCall(function()
        local fieldList = nil
        if g_fieldManager ~= nil and g_fieldManager.fields ~= nil then
            fieldList = g_fieldManager.fields
        elseif g_currentMission ~= nil and g_currentMission.fieldManager ~= nil then
            fieldList = g_currentMission.fieldManager.fields
        end
        if type(fieldList) ~= "table" then
            return
        end

        for id, field in pairs(fieldList) do
            local fruitType = nil
            local fruitColor = nil
            local growthState = nil
            local growthMax = nil
            local owned = nil
            local fx, fz = nil, nil
            local polygon = nil
            local cacheKey = tostring((type(field) == "table" and (field.fieldId or field.rootNode)) or id)
            local displayId = type(field) == "table" and fieldDisplayId(field, id) or tostring(id)

            safeCall(function()
                if field.getCenterOfFieldWorldPosition ~= nil then
                    local a, b = field:getCenterOfFieldWorldPosition()
                    fx, fz = a, b
                elseif field.getCenterOfFieldWorldPos ~= nil then
                    local a, b = field:getCenterOfFieldWorldPos()
                    fx, fz = a, b
                elseif field.posX ~= nil then
                    fx, fz = field.posX, field.posZ
                end

                if self.polygonCache[cacheKey] == nil then
                    local outline = outlineFromField(field)
                    if outline ~= nil then
                        self.polygonCache[cacheKey] = outline
                    end
                end
                polygon = self.polygonCache[cacheKey]

                -- getFieldState() is a cache and can still name the fruit from an older pass.
                local fruitIndex = nil
                if fx ~= nil and fz ~= nil and FieldState ~= nil and FieldState.new ~= nil then
                    local sampled = FieldState.new()
                    local updated = pcall(function()
                        sampled:update(fx, fz)
                    end)
                    if updated and isKnownFruit(sampled.fruitTypeIndex) then
                        fruitIndex = sampled.fruitTypeIndex
                        growthState = sampled.growthState
                    end
                end
                if not isKnownFruit(fruitIndex) then
                    local state = field.fieldState
                    if field.getFieldState ~= nil then
                        local live = field:getFieldState()
                        if type(live) == "table" then
                            state = live
                        end
                    end
                    if type(state) == "table" then
                        fruitIndex = state.fruitTypeIndex or state.fruitIndex
                        if growthState == nil then
                            growthState = state.growthState
                        end
                    end
                end
                if type(fruitIndex) == "string" then
                    fruitType = fruitIndex
                else
                    local named, color, maxGrowth = fruitInfoFromIndex(fruitIndex)
                    fruitType = named
                    fruitColor = color
                    growthMax = maxGrowth
                end
                if fruitType == nil and type(field.fruitType) == "string" then
                    fruitType = field.fruitType
                end
                if fruitType == nil and fx ~= nil and fz ~= nil then
                    local sampledFruit, sampledGrowth, sampledMax = sampleFieldFruit(fx, fz)
                    fruitType = sampledFruit
                    if growthState == nil then
                        growthState = sampledGrowth
                    end
                    if growthMax == nil then
                        growthMax = sampledMax
                    end
                end

                local farmland = field.farmland
                if farmland == nil and field.farmlandId ~= nil and g_farmlandManager ~= nil and g_farmlandManager.getFarmlandById ~= nil then
                    farmland = g_farmlandManager:getFarmlandById(field.farmlandId)
                end
                if farmland ~= nil then
                    owned = farmland.farmId ~= nil and farmland.farmId > 0
                end

            end, nil)

            fields[#fields + 1] = {
                id = cacheKey,
                name = displayId,
                fruitType = fruitType,
                fruitColor = fruitColor,
                growthState = growthState,
                growthMax = growthMax,
                owned = owned,
                x = fx,
                z = fz,
                polygon = polygon,
            }
        end
    end, nil)

    if not self.loggedFieldOutlines and #fields > 0 and Logging ~= nil and Logging.info ~= nil then
        local withPoly = 0
        for _, field in ipairs(fields) do
            if type(field.polygon) == "table" and #field.polygon >= 3 then
                withPoly = withPoly + 1
            end
        end
        Logging.info("[MB Livemap] field outlines %d/%d", withPoly, #fields)
        self.loggedFieldOutlines = true
    end

    return fields
end

local function textValue(value)
    local labeled = labelFromValue(value)
    if labeled ~= nil then
        return labeled
    end
    if type(value) == "number" then
        return tostring(value)
    end
    return nil
end

local function isOwnedFarm(farmId)
    if type(farmId) ~= "number" then
        return false
    end
    if AccessHandler ~= nil then
        if farmId == AccessHandler.EVERYONE or farmId == AccessHandler.NOBODY then
            return false
        end
    end
    return farmId > 0
end

local function productionStatusName(status)
    if type(status) == "string" and status ~= "" then
        return string.upper(status)
    end
    if ProductionPoint ~= nil and type(ProductionPoint.PROD_STATUS) == "table" then
        for name, value in pairs(ProductionPoint.PROD_STATUS) do
            if value == status then
                return name
            end
        end
    end
    if status == 1 then
        return "RUNNING"
    elseif status == 2 then
        return "MISSING_INPUTS"
    elseif status == 3 then
        return "NO_OUTPUT_SPACE"
    end
    return "INACTIVE"
end

local function eachProduction(point, visitor)
    if type(point.productions) ~= "table" then
        return
    end
    local listed = false
    for _, production in ipairs(point.productions) do
        listed = true
        visitor(production)
    end
    if listed then
        return
    end
    for _, production in pairs(point.productions) do
        visitor(production)
    end
end

local function addFill(fills, title, level, capacity)
    if title == nil or title == "" then
        return
    end
    level = type(level) == "number" and level or 0
    capacity = type(capacity) == "number" and capacity or 0
    if capacity <= 0 and level <= 0 then
        return
    end
    for _, fill in ipairs(fills) do
        if fill.name == title then
            fill.fillLevel = (fill.fillLevel or 0) + level
            fill.capacity = math.max(fill.capacity or 0, capacity)
            return
        end
    end
    fills[#fills + 1] = {
        name = title,
        fillLevel = level,
        capacity = capacity,
    }
end

local function pushHusbandryFill(fills, placeable, fillType)
    if fillType == nil or placeable.getHusbandryFillLevel == nil then
        return
    end
    local level = safeCall(function()
        return placeable:getHusbandryFillLevel(fillType)
    end, 0) or 0
    local capacity = 0
    if placeable.getHusbandryCapacity ~= nil then
        capacity = safeCall(function()
            return placeable:getHusbandryCapacity(fillType)
        end, 0) or 0
    end
    addFill(fills, fillTypeName(fillType), level, capacity)
end

function StateCollector:collectProductions()
    local productions = {}
    safeCall(function()
        local placeables = g_currentMission and g_currentMission.placeableSystem and g_currentMission.placeableSystem.placeables
        if type(placeables) ~= "table" then
            return
        end
        for _, placeable in pairs(placeables) do
            local spec = placeable and placeable.spec_productionPoint
            local point = spec and spec.productionPoint
            if point ~= nil and placeable.isDeleted ~= true then
                local farmId = safeCall(function()
                    if point.getOwnerFarmId ~= nil then
                        return point:getOwnerFarmId()
                    end
                    if placeable.getOwnerFarmId ~= nil then
                        return placeable:getOwnerFarmId()
                    end
                    return placeable.ownerFarmId
                end, nil)
                if isOwnedFarm(farmId) then
                    local name = safeCall(function()
                        if placeable.getName ~= nil then
                            return placeable:getName()
                        end
                        return placeable.name
                    end, nil)
                    if name == nil or name == "" then
                        name = "Production"
                    end

                    local lines = {}
                    local anyRunning = false
                    eachProduction(point, function(production)
                        if type(production) == "table" then
                            local lineName = textValue(production.name) or textValue(production.id) or "Production"
                            local lineStatus = "INACTIVE"
                            if production.status ~= nil then
                                lineStatus = productionStatusName(production.status)
                            elseif production.enabled == true then
                                lineStatus = "RUNNING"
                            end
                            if lineStatus == "RUNNING" then
                                anyRunning = true
                            end
                            lines[#lines + 1] = {
                                name = lineName,
                                status = lineStatus,
                            }
                        end
                    end)

                    local fills = {}
                    local storage = point.storage
                    if storage ~= nil then
                        local levels = nil
                        if storage.getFillLevels ~= nil then
                            levels = safeCall(function()
                                return storage:getFillLevels()
                            end, nil)
                        end
                        if type(levels) ~= "table" then
                            levels = storage.fillLevels
                        end
                        if type(levels) == "table" then
                            for fillType, level in pairs(levels) do
                                local capacity = 0
                                if storage.getCapacity ~= nil then
                                    capacity = safeCall(function()
                                        return storage:getCapacity(fillType)
                                    end, 0) or 0
                                end
                                if capacity > 0 then
                                    addFill(fills, fillTypeName(fillType), level, capacity)
                                end
                            end
                        end
                    end

                    productions[#productions + 1] = {
                        id = tostring(placeable.id or placeable.rootNode or name),
                        name = name,
                        status = anyRunning and "active" or "idle",
                        lines = lines,
                        inputs = fills,
                        outputs = {},
                    }
                end
            end
        end
    end, nil)
    return productions
end

function StateCollector:collectAnimals()
    local animals = {}
    safeCall(function()
        local placeables = g_currentMission and g_currentMission.placeableSystem and g_currentMission.placeableSystem.placeables
        if type(placeables) ~= "table" then
            return
        end
        for _, placeable in pairs(placeables) do
            local husbandry = placeable and placeable.spec_husbandryAnimals
            if husbandry ~= nil and placeable.isDeleted ~= true then
                local farmId = safeCall(function()
                    if placeable.getOwnerFarmId ~= nil then
                        return placeable:getOwnerFarmId()
                    end
                    return placeable.ownerFarmId
                end, nil)
                if isOwnedFarm(farmId) then
                    local name = safeCall(function()
                        if placeable.getName ~= nil then
                            return placeable:getName()
                        end
                        return placeable.name
                    end, nil)
                    if name == nil or name == "" then
                        name = "Animal pen"
                    end

                    local count = safeCall(function()
                        if placeable.getNumOfAnimals ~= nil then
                            return placeable:getNumOfAnimals()
                        end
                        return husbandry.numAnimals
                    end, nil)
                    local capacity = safeCall(function()
                        if placeable.getMaxNumOfAnimals ~= nil then
                            return placeable:getMaxNumOfAnimals()
                        end
                        return nil
                    end, nil)

                    local animalType = nil
                    local animalDesc = husbandry.animalType
                    if type(animalDesc) == "table" or type(animalDesc) == "userdata" then
                        animalType = textValue(animalDesc.title) or textValue(animalDesc.name)
                    end
                    animalType = animalType or textValue(animalDesc) or textValue(husbandry.animalTypeName)

                    local herds = {}
                    local healthSum = 0
                    local healthCount = 0
                    local clusterSystem = husbandry.clusterSystem
                    if clusterSystem ~= nil and clusterSystem.getClusters ~= nil then
                        local clusters = safeCall(function()
                            return clusterSystem:getClusters()
                        end, nil)
                        if type(clusters) == "table" then
                            local groups = {}
                            local order = {}
                            for _, cluster in ipairs(clusters) do
                                local herdCount = cluster.numAnimals or 0
                                local herdName = nil
                                if cluster.getName ~= nil then
                                    herdName = safeCall(function()
                                        return cluster:getName()
                                    end, nil)
                                end
                                herdName = textValue(herdName) or textValue(cluster.name)
                                if herdName == nil and g_currentMission.animalSystem ~= nil and cluster.subTypeIndex ~= nil then
                                    local system = g_currentMission.animalSystem
                                    if system.getSubTypeByIndex ~= nil then
                                        local subType = safeCall(function()
                                            return system:getSubTypeByIndex(cluster.subTypeIndex)
                                        end, nil)
                                        herdName = textValue(subType and subType.name)
                                    end
                                end
                                herdName = herdName or "Animals"
                                local group = groups[herdName]
                                if group == nil then
                                    group = { name = herdName, count = 0 }
                                    groups[herdName] = group
                                    order[#order + 1] = group
                                end
                                group.count = group.count + herdCount
                                local clusterHealth = cluster.health
                                if type(clusterHealth) ~= "number" and cluster.getHealth ~= nil then
                                    clusterHealth = safeCall(function()
                                        return cluster:getHealth()
                                    end, nil)
                                end
                                if type(clusterHealth) == "number" then
                                    healthSum = healthSum + clusterHealth
                                    healthCount = healthCount + 1
                                end
                            end
                            for _, group in ipairs(order) do
                                if group.count > 0 then
                                    herds[#herds + 1] = group
                                end
                            end
                        end
                    end

                    local health = nil
                    if healthCount > 0 then
                        health = healthSum / healthCount
                    end

                    local productivity = nil
                    local skipProductivity = false
                    if AnimalType ~= nil and placeable.getAnimalTypeIndex ~= nil then
                        local animalTypeIndex = safeCall(function()
                            return placeable:getAnimalTypeIndex()
                        end, nil)
                        if animalTypeIndex == AnimalType.HORSE or animalTypeIndex == AnimalType.PIG then
                            skipProductivity = true
                        end
                    end
                    if not skipProductivity and placeable.getGlobalProductionFactor ~= nil and placeable.getProductionFactor ~= nil then
                        local globalFactor = safeCall(function()
                            return placeable:getGlobalProductionFactor()
                        end, nil)
                        local factor = safeCall(function()
                            return placeable:getProductionFactor()
                        end, nil)
                        if type(globalFactor) == "number" and type(factor) == "number" then
                            productivity = globalFactor * factor * 100
                        end
                    end

                    local fills = {}
                    local food = placeable.spec_husbandryFood
                    if food ~= nil then
                        local wroteGroup = false
                        local animalFoodSystem = g_currentMission.animalFoodSystem
                        if animalFoodSystem ~= nil and animalFoodSystem.getAnimalFood ~= nil and food.animalTypeIndex ~= nil then
                            local animalFood = safeCall(function()
                                return animalFoodSystem:getAnimalFood(food.animalTypeIndex)
                            end, nil)
                            if animalFood ~= nil and type(animalFood.groups) == "table" then
                                for _, foodGroup in pairs(animalFood.groups) do
                                    local level = 0
                                    if type(foodGroup.fillTypes) == "table" and type(food.fillLevels) == "table" then
                                        for _, fillTypeIndex in pairs(foodGroup.fillTypes) do
                                            level = level + (food.fillLevels[fillTypeIndex] or 0)
                                        end
                                    end
                                    local title = textValue(foodGroup.title) or "Food"
                                    if type(foodGroup.productionWeight) == "number" then
                                        title = string.format("%s (%d%%)", title, math.floor(foodGroup.productionWeight * 100 + 0.5))
                                    end
                                    addFill(fills, title, level, food.capacity or 0)
                                    wroteGroup = true
                                end
                            end
                        end
                        if not wroteGroup and type(food.fillLevels) == "table" then
                            for fillType, level in pairs(food.fillLevels) do
                                addFill(fills, fillTypeName(fillType), level, food.capacity or 0)
                            end
                        end
                    end

                    local water = placeable.spec_husbandryWater
                    if water ~= nil then
                        pushHusbandryFill(fills, placeable, water.fillType)
                    end

                    local straw = placeable.spec_husbandryStraw
                    if straw ~= nil then
                        pushHusbandryFill(fills, placeable, straw.inputFillType)
                        local manureActive = straw.isManureActive
                        if manureActive == nil then
                            manureActive = placeable.isManureActive
                        end
                        if manureActive ~= false then
                            pushHusbandryFill(fills, placeable, straw.outputFillType)
                        end
                    end

                    local liquidManure = placeable.spec_husbandryLiquidManure
                    if liquidManure ~= nil then
                        pushHusbandryFill(fills, placeable, liquidManure.fillType)
                    end

                    local milk = placeable.spec_husbandryMilk
                    if milk ~= nil and type(milk.fillTypes) == "table" then
                        for _, fillType in ipairs(milk.fillTypes) do
                            pushHusbandryFill(fills, placeable, fillType)
                        end
                    end

                    local pallets = placeable.spec_husbandryPallets
                    if pallets ~= nil and type(pallets.fillLevels) == "table" then
                        local listed = pallets.activeFillTypes
                        if type(listed) ~= "table" or #listed == 0 then
                            listed = {}
                            for fillType, _ in pairs(pallets.fillLevels) do
                                listed[#listed + 1] = fillType
                            end
                        end
                        for _, fillType in ipairs(listed) do
                            local palletCapacity = 0
                            if type(pallets.capacities) == "table" then
                                palletCapacity = pallets.capacities[fillType] or 0
                            end
                            addFill(fills, fillTypeName(fillType), pallets.fillLevels[fillType], palletCapacity)
                        end
                    end

                    local palletBlocked = false
                    if pallets ~= nil and pallets.palletLimitReached == true then
                        palletBlocked = true
                    end

                    local x, z = nil, nil
                    pcall(function()
                        if placeable.rootNode ~= nil then
                            x, _, z = getWorldTranslation(placeable.rootNode)
                        end
                    end)

                    animals[#animals + 1] = {
                        id = tostring(placeable.id or placeable.rootNode or name),
                        name = name,
                        animalType = animalType,
                        count = count,
                        capacity = capacity,
                        health = health,
                        productivity = productivity,
                        herds = herds,
                        fills = fills,
                        palletBlocked = palletBlocked,
                        x = x,
                        z = z,
                    }
                end
            end
        end
    end, nil)
    return animals
end

function StateCollector:refreshSlow()
    self.cachedWeather = self:collectWeather()
    self.cachedFields = self:collectFields()
    self.cachedProductions = self:collectProductions()
    self.cachedAnimals = self:collectAnimals()
    self.mapName = safeCall(function()
        return g_currentMission and g_currentMission.missionInfo and g_currentMission.missionInfo.mapTitle
    end, nil)
    self.mapSize = safeCall(function()
        if g_currentMission and g_currentMission.terrainSize then
            return g_currentMission.terrainSize
        end
        return nil
    end, nil)
    self.customEnvironment = safeCall(function()
        local info = g_currentMission and g_currentMission.missionInfo
        local value = info and info.customEnvironment
        if type(value) ~= "string" or value == "" then
            return nil
        end
        return value
    end, nil)
    self.mapDirectory = safeCall(function()
        local value = g_currentMission and g_currentMission.baseDirectory
        if type(value) ~= "string" or value == "" then
            return nil
        end
        return value
    end, nil)
    self.missionDirectory = safeCall(function()
        local info = g_currentMission and g_currentMission.missionInfo
        local value = info and info.baseDirectory
        if type(value) ~= "string" or value == "" then
            return nil
        end
        return value
    end, nil)
end

-- FS25 currentPeriod is 1–12 starting in March (1 = March, 11 = January, 12 = February).
-- The livemap calendar uses calendar months, 1 = January.
local function calendarMonthFromPeriod(period)
    local month = period + 2
    if month > 12 then
        month = month - 12
    end
    if month < 1 then
        month = month + 12
    end
    return month
end

function StateCollector:collectCalendar()
    return safeCall(function()
        local env = g_currentMission and g_currentMission.environment
        if env == nil or env.currentPeriod == nil or env.currentDayInPeriod == nil then
            return nil
        end
        local period = tonumber(env.currentPeriod)
        local day = tonumber(env.currentDayInPeriod)
        if period == nil or day == nil then
            return nil
        end
        local days = tonumber(env.daysPerPeriod) or 1
        if days < 1 then
            days = 1
        end
        return {
            period = calendarMonthFromPeriod(math.floor(period)),
            day = math.floor(day),
            daysPerPeriod = math.floor(days),
        }
    end, nil)
end

function StateCollector:buildSnapshot()
    local snapshot = {
        type = "state",
        ts = math.floor((g_time or (os.clock() * 1000))),
        source = "mod",
        mapName = self.mapName,
        mapSize = self.mapSize,
        customEnvironment = self.customEnvironment,
        mapDirectory = self.mapDirectory,
        missionDirectory = self.missionDirectory,
        calendar = self:collectCalendar(),
        vehicles = self:collectVehicles(),
        weather = self.cachedWeather,
        fields = self.cachedFields,
        productions = self.cachedProductions,
        animals = self.cachedAnimals,
    }
    if isHostedMultiplayer() then
        snapshot.multiplayer = true
        snapshot.localFarmId = localFarmId()
        snapshot.farms = collectFarms()
        snapshot.players = collectPlayers()
    end
    return snapshot
end
