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

local function fillTypeInternalName(fillTypeIndex)
    if type(fillTypeIndex) ~= "number" or g_fillTypeManager == nil then
        return nil
    end
    if FillType ~= nil and fillTypeIndex == FillType.UNKNOWN then
        return nil
    end
    local internal = safeCall(function()
        if g_fillTypeManager.getFillTypeNameByIndex ~= nil then
            return g_fillTypeManager:getFillTypeNameByIndex(fillTypeIndex)
        end
        return nil
    end, nil)
    if type(internal) ~= "string" or internal == "" or string.lower(internal) == "unknown" then
        return nil
    end
    return internal
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
local function rawOutlineFromField(field)
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
    return points
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

local function positiveNumber(value)
    if type(value) ~= "number" or value ~= value or value <= 0 or value == math.huge then
        return nil
    end
    return value
end

local function round2(value)
    return math.floor(value * 100 + 0.5) / 100
end

-- A real field is well under 500 ha. Larger numbers are world area in m².
local function asHectares(value)
    local amount = positiveNumber(value)
    if amount == nil then
        return nil
    end
    if amount > 500 then
        amount = amount / 10000
    end
    return round2(amount)
end

local function polygonAreaHa(points)
    if type(points) ~= "table" or #points < 3 then
        return nil
    end
    local sum = 0
    for i = 1, #points do
        local current = points[i]
        local nxt = points[(i % #points) + 1]
        if type(current) ~= "table" or type(nxt) ~= "table" then
            return nil
        end
        if type(current.x) ~= "number" or type(current.z) ~= "number" or type(nxt.x) ~= "number" or type(nxt.z) ~= "number" then
            return nil
        end
        sum = sum + (current.x * nxt.z - nxt.x * current.z)
    end
    local squareMeters = math.abs(sum) * 0.5
    if squareMeters <= 0 then
        return nil
    end
    return round2(squareMeters / 10000)
end

local function fieldAreaHa(field, farmland, points)
    local area = asHectares(field.areaHa)
    if area ~= nil then
        return area
    end
    if type(field.getAreaHa) == "function" then
        area = asHectares(safeCall(function()
            return field:getAreaHa()
        end, nil))
        if area ~= nil then
            return area
        end
    end
    if type(farmland) == "table" then
        area = asHectares(farmland.areaInHa or farmland.areaHa)
        if area ~= nil then
            return area
        end
    end
    return polygonAreaHa(points)
end

local function fruitDescFromIndex(index)
    if not isKnownFruit(index) or g_fruitTypeManager == nil or g_fruitTypeManager.getFruitTypeByIndex == nil then
        return nil
    end
    local desc = safeCall(function()
        return g_fruitTypeManager:getFruitTypeByIndex(index)
    end, nil)
    if type(desc) == "table" then
        return desc
    end
    return nil
end

local function groundMatches(groundType, names)
    if FieldGroundType == nil or type(groundType) ~= "number" then
        return false
    end
    for _, name in ipairs(names) do
        if FieldGroundType[name] ~= nil and groundType == FieldGroundType[name] then
            return true
        end
    end
    return false
end

local function groundStateLabel(groundType)
    if FieldGroundType == nil or type(groundType) ~= "number" then
        return nil
    end
    if groundMatches(groundType, { "NONE" }) then
        return "Empty"
    end
    if groundMatches(groundType, { "STUBBLE_TILLAGE", "GRASS_CUT" }) then
        return "Harvested"
    end
    if groundMatches(groundType, { "CULTIVATED" }) then
        return "Cultivated"
    end
    if groundMatches(groundType, { "PLOWED" }) then
        return "Plowed"
    end
    if groundMatches(groundType, { "SEEDBED" }) then
        return "Seedbed"
    end
    if groundMatches(groundType, { "ROLLER_LINES", "ROLLED_SEEDBED" }) then
        return "Rolled"
    end
    if groundMatches(groundType, { "HARVEST_READY" }) then
        return "Ready to harvest"
    end
    if groundMatches(groundType, { "SOWN", "DIRECT_SOWN", "PLANTED", "RIDGE", "RIDGES", "RICE_PLANTED", "GRASS" }) then
        return "Growing"
    end
    return nil
end

local function isGrassFruit(fruitIndex, desc)
    if FruitType ~= nil and FruitType.GRASS ~= nil and fruitIndex == FruitType.GRASS then
        return true
    end
    if type(desc) == "table" and type(desc.name) == "string" and string.upper(desc.name) == "GRASS" then
        return true
    end
    return false
end

local function cropStateFrom(fruitIndex, growthState, growthMax, groundType)
    if isKnownFruit(fruitIndex) and type(growthState) == "number" then
        local desc = fruitDescFromIndex(fruitIndex)
        if type(desc) == "table" then
            local minHarvest = desc.minHarvestingGrowthState
            local maxHarvest = desc.maxHarvestingGrowthState
            if type(minHarvest) == "number" and type(maxHarvest) == "number" and growthState >= minHarvest and growthState <= maxHarvest then
                return "Ready to harvest"
            end
            local minForage = desc.minForageGrowthState
            if type(minForage) == "number" and growthState >= minForage and (type(minHarvest) ~= "number" or growthState < minHarvest) then
                local maxForage = desc.maxForageGrowthState
                if type(maxForage) ~= "number" or growthState <= maxForage then
                    return "Ready to harvest"
                end
            end
            if type(maxHarvest) == "number" and growthState > maxHarvest then
                local minPrepare = desc.minPreparingGrowthState
                if type(minPrepare) == "number" and growthState >= minPrepare then
                    return "Harvested"
                end
                return "Withered"
            end
        elseif type(growthMax) == "number" and growthMax > 0 and growthState >= growthMax then
            return "Ready to harvest"
        end
        if growthState > 0 then
            return "Growing"
        end
        return "Harvested"
    end
    return groundStateLabel(groundType)
end

local function missionFlag(names)
    local info = g_currentMission and g_currentMission.missionInfo
    if type(info) ~= "table" then
        return nil
    end
    for _, name in ipairs(names) do
        if type(info[name]) == "boolean" then
            return info[name]
        end
    end
    return nil
end

-- Disabled mechanics are null so the card can hide them. Unknown settings still report the field.
local function flagNeed(enabled, needed)
    if enabled == false then
        return nil
    end
    return needed
end

-- Titles match data/maps/maps_weed.xml fieldInfoStates. States 1-2 share the
-- invisible growing title. States 7-9 are the withered result of herbicide.
local function weedLabel(state)
    if type(state) ~= "number" then
        return nil
    end
    local index = math.floor(state + 0.5)
    if index <= 0 then
        return "None"
    end
    if index <= 2 then
        return "Growing"
    end
    if index == 3 then
        return "Small"
    end
    if index == 4 then
        return "Medium"
    end
    if index == 5 then
        return "Large"
    end
    if index == 6 then
        return "Partial"
    end
    if index <= 9 then
        return "Withered"
    end
    return nil
end

local function fertilizerApplicationsMax()
    local maxValue = safeCall(function()
        local mission = g_currentMission
        if mission == nil or mission.fieldGroundSystem == nil or mission.fieldGroundSystem.getMaxValue == nil then
            return nil
        end
        if FieldDensityMap == nil or FieldDensityMap.SPRAY_LEVEL == nil then
            return nil
        end
        return mission.fieldGroundSystem:getMaxValue(FieldDensityMap.SPRAY_LEVEL)
    end, nil)
    if type(maxValue) == "number" and maxValue > 0 then
        return maxValue
    end
    return 2
end

local function fieldNeedsRolling(sampled, fruitIndex, desc)
    if type(sampled) ~= "table" or type(sampled.rollerLevel) ~= "number" then
        return nil
    end
    if isGrassFruit(fruitIndex, desc) or groundMatches(sampled.groundType, { "GRASS", "GRASS_CUT" }) then
        return false
    end
    local sown = isKnownFruit(fruitIndex) and type(sampled.growthState) == "number" and sampled.growthState > 0
    if not sown then
        sown = groundMatches(sampled.groundType, {
            "SOWN",
            "DIRECT_SOWN",
            "PLANTED",
            "RIDGE",
            "RIDGES",
            "RICE_PLANTED",
            "ROLLER_LINES",
            "ROLLED_SEEDBED",
        })
    end
    if not sown then
        return false
    end
    return sampled.rollerLevel <= 0
end

local PF_MOD_NAMES = { "FS25_precisionFarming", "FS25_PrecisionFarming" }
-- Names from the FS25 Precision Farming scripts. The documented readers come first
-- so a similarly named helper cannot win just by existing.
local PF_SOIL_METHODS = {
    "getTypeIndexAtWorldPos",
    "getSoilTypeIndexAtWorldPos",
    "getSoilTypeAtWorldPos",
    "getSoilTypeIndexAtWorldPosition",
    "getValueAtWorldPos",
}
local PF_PH_METHODS = {
    "getLevelAtWorldPos",
    "getPhValueAtWorldPos",
    "getPHValueAtWorldPos",
    "getPhAtWorldPos",
    "getValueAtWorldPos",
}
local PF_NITROGEN_METHODS = {
    "getLevelAtWorldPos",
    "getNitrogenAmountAtWorldPos",
    "getNitrogenLevelAtWorldPos",
    "getNitrogenValueAtWorldPos",
    "getAmountAtWorldPos",
    "getValueAtWorldPos",
}
local PF_PH_RANGE_METHODS = {
    "getOptimalPHRangeAtWorldPos",
    "getOptimalPhRangeAtWorldPos",
    "getOptimalPHAtWorldPos",
    "getPhRangeAtWorldPos",
}
local PF_NITROGEN_TARGET_METHODS = {
    "getTargetLevelAtWorldPos",
    "getNitrogenTargetAtWorldPos",
    "getTargetNitrogenAtWorldPos",
    "getOptimalNitrogenAtWorldPos",
    "getTargetAmountAtWorldPos",
}
local PF_SOIL_FALLBACK = {
    [1] = "Loamy Sand",
    [2] = "Sandy Loam",
    [3] = "Loam",
    [4] = "Silty Clay",
}

local function firstFunction(source, names)
    if type(source) ~= "table" then
        return nil
    end
    for _, name in ipairs(names) do
        if type(source[name]) == "function" then
            return name
        end
    end
    return nil
end

-- Documented readers win. Any other *WorldPos method is only a fallback.
local function worldReader(source, names)
    local method = firstFunction(source, names)
    if method ~= nil then
        return method
    end
    if type(source) ~= "table" then
        return nil
    end
    local fallback = nil
    for key, value in pairs(source) do
        if type(key) == "string" and type(value) == "function" and string.find(key, "WorldPos", 1, true) ~= nil then
            local lower = string.lower(key)
            if string.find(lower, "target", 1, true) == nil and string.find(lower, "optimal", 1, true) == nil then
                return key
            end
            if fallback == nil then
                fallback = key
            end
        end
    end
    return fallback
end

-- Two targets, not an array: a nil map must not stop the search before the mod instance.
local function bindFunction(first, second, names)
    local method = firstFunction(first, names)
    if method ~= nil then
        return first, method
    end
    method = firstFunction(second, names)
    if method ~= nil then
        return second, method
    end
    return nil, nil
end

local function namedTable(source, names)
    if type(source) ~= "table" then
        return nil
    end
    for _, name in ipairs(names) do
        if type(source[name]) == "table" then
            return source[name]
        end
    end
    return nil
end

local function modEnvironment(mod)
    if type(mod) ~= "table" then
        return nil
    end
    if type(mod.modEnv) == "table" then
        return mod.modEnv
    end
    if type(mod.environment) == "table" then
        return mod.environment
    end
    return nil
end

local function singletonFromEnv(env)
    if type(env) ~= "table" then
        return nil
    end
    if type(env.g_precisionFarming) == "table" then
        return env.g_precisionFarming
    end
    if type(env.PrecisionFarming) == "table" and type(env.PrecisionFarming.INSTANCE) == "table" then
        return env.PrecisionFarming.INSTANCE
    end
    if type(env.soilMap) == "table" and (type(env.nitrogenMap) == "table" or type(env.pHMap) == "table" or type(env.phMap) == "table" or type(env.tramlineMap) == "table") then
        return env
    end
    return nil
end

local function functionEnv(fn)
    if type(fn) ~= "function" or getfenv == nil then
        return nil
    end
    local ok, env = pcall(getfenv, fn)
    if ok and type(env) == "table" then
        return env
    end
    return nil
end

local function functionUpvalue(fn, index)
    if debug == nil or debug.getupvalue == nil then
        return nil
    end
    local ok, name, value = pcall(debug.getupvalue, fn, index)
    if not ok then
        return nil
    end
    return name, value
end

-- Precision Farming keeps g_precisionFarming in its own mod environment.
-- A function defined there still has that environment, even from another mod.
local function singletonFromFunction(fn, depth, seen)
    if type(fn) ~= "function" or depth > 4 or seen[fn] then
        return nil
    end
    seen[fn] = true
    local env = functionEnv(fn)
    if env == nil or env == _G then
        return nil
    end
    local found = singletonFromEnv(env)
    if found ~= nil then
        return found
    end
    for index = 1, 8 do
        local name, value = functionUpvalue(fn, index)
        if name == nil then
            break
        end
        if type(value) == "function" then
            found = singletonFromFunction(value, depth + 1, seen)
            if found ~= nil then
                return found
            end
        else
            found = singletonFromEnv(value)
            if found ~= nil then
                return found
            end
        end
    end
    return nil
end

local function mapsFromModule(module)
    if type(module) ~= "table" then
        return nil
    end
    local soil = module.soilMap
    local nitrogen = module.nitrogenMap
    local ph = module.pHMap or module.phMap
    if type(soil) ~= "table" and type(nitrogen) ~= "table" and type(ph) ~= "table" then
        return nil
    end
    return {
        instance = module,
        soilMap = type(soil) == "table" and soil or nil,
        nitrogenMap = type(nitrogen) == "table" and nitrogen or nil,
        phMap = type(ph) == "table" and ph or nil,
    }
end

local function mapsComplete(maps)
    return type(maps) == "table" and maps.soilMap ~= nil and maps.nitrogenMap ~= nil and maps.phMap ~= nil
end

local function absorbMaps(into, extra)
    if extra == nil then
        return into
    end
    if into == nil then
        return {
            instance = extra.instance,
            soilMap = extra.soilMap,
            nitrogenMap = extra.nitrogenMap,
            phMap = extra.phMap,
        }
    end
    if into.instance == nil then
        into.instance = extra.instance
    end
    if into.soilMap == nil then
        into.soilMap = extra.soilMap
    end
    if into.nitrogenMap == nil then
        into.nitrogenMap = extra.nitrogenMap
    end
    if into.phMap == nil then
        into.phMap = extra.phMap
    end
    return into
end

local function moduleFromFunctions(source, seenFunctions)
    if type(source) ~= "table" then
        return nil
    end
    local checked = 0
    local functionsChecked = 0
    for _, value in pairs(source) do
        checked = checked + 1
        if checked > 80 then
            break
        end
        if type(value) == "function" then
            functionsChecked = functionsChecked + 1
            local maps = mapsFromModule(singletonFromEnv(functionEnv(value)))
            if maps ~= nil then
                return maps
            end
            -- One method defined inside Precision Farming is enough.
            if functionsChecked >= 4 then
                break
            end
        end
    end
    return nil
end

-- Courseplay reads these as spec_FS25_precisionFarming.<name> on the vehicle.
local PF_SPEC_SUFFIXES = {
    "extendedSprayer",
    "extendedSowingMachine",
    "extendedCombine",
    "extendedMower",
    "cropSensor",
    "soilSampler",
    "manureSensor",
    "weedSpotSpray",
    "precisionFarmingStatistic",
    "extendedMotorized",
    "extendedWearable",
    "extendedSprayerEffects",
    "rtkStation",
}

local function mapsFromVehicleSpecs(object, seenFunctions)
    if type(object) ~= "table" then
        return nil
    end
    local merged = nil
    for _, suffix in ipairs(PF_SPEC_SUFFIXES) do
        local spec = object["spec_FS25_precisionFarming." .. suffix]
        if type(spec) ~= "table" then
            spec = object["spec_" .. suffix]
        end
        if type(spec) == "table" then
            local viaEnv = moduleFromFunctions(spec, seenFunctions)
            if mapsComplete(viaEnv) then
                return viaEnv
            end
            merged = absorbMaps(merged, viaEnv)
            merged = absorbMaps(merged, mapsFromModule(spec))
            if type(spec.pfModule) == "table" then
                merged = absorbMaps(merged, mapsFromModule(spec.pfModule))
            end
            if mapsComplete(merged) then
                return merged
            end
        end
    end
    return merged
end

local function mapsFromTypeManager(manager, seenFunctions, seenClasses)
    if type(manager) ~= "table" or type(manager.types) ~= "table" then
        return nil
    end
    local merged = nil
    for _, typeDef in pairs(manager.types) do
        if type(typeDef) == "table" then
            local groups = {}
            if type(typeDef.specializations) == "table" then
                groups[#groups + 1] = typeDef.specializations
            end
            if type(typeDef.eventListeners) == "table" then
                for _, listeners in pairs(typeDef.eventListeners) do
                    if type(listeners) == "table" then
                        groups[#groups + 1] = listeners
                    end
                end
            end
            for _, group in ipairs(groups) do
                for _, spec in pairs(group) do
                    local maps = nil
                    if type(spec) == "table" and not seenClasses[spec] then
                        seenClasses[spec] = true
                        maps = moduleFromFunctions(spec, seenFunctions)
                    elseif type(spec) == "function" then
                        maps = mapsFromModule(singletonFromEnv(functionEnv(spec)))
                    end
                    if mapsComplete(maps) then
                        return maps
                    end
                    merged = absorbMaps(merged, maps)
                end
            end
        end
    end
    return merged
end

local PF_HOOKS = {
    { "Sprayer", { "processSprayerArea", "getSprayerFillLevel", "updateSprayerEffects" } },
    { "SowingMachine", { "processSowingMachineArea" } },
    { "Combine", { "processCombineArea" } },
    { "Mower", { "processMowerArea" } },
    { "Cultivator", { "processCultivatorArea" } },
}

local function mapsFromHooks(seenFunctions)
    local merged = nil
    for _, hook in ipairs(PF_HOOKS) do
        local owner = _G[hook[1]]
        if type(owner) == "table" then
            for _, methodName in ipairs(hook[2]) do
                local maps = mapsFromModule(singletonFromFunction(owner[methodName], 0, seenFunctions))
                if mapsComplete(maps) then
                    return maps
                end
                merged = absorbMaps(merged, maps)
            end
        end
    end
    return merged
end

local function objectList(owner, fieldName)
    if type(owner) ~= "table" then
        return nil
    end
    local system = owner[fieldName]
    if type(system) == "table" and type(system.vehicles) == "table" then
        return system.vehicles
    end
    if type(system) == "table" and type(system.placeables) == "table" then
        return system.placeables
    end
    if fieldName == "vehicles" and type(owner.vehicles) == "table" then
        return owner.vehicles
    end
    if fieldName == "placeables" and type(owner.placeables) == "table" then
        return owner.placeables
    end
    return nil
end

-- The singleton stays in the Precision Farming environment. Its specializations are
-- still registered on the shared vehicle types, and loaded vehicles keep the map objects.
local function precisionFarmingFromWorld()
    local seenFunctions = {}
    local seenClasses = {}
    local merged = nil

    local function take(maps)
        if mapsComplete(maps) then
            return maps
        end
        merged = absorbMaps(merged, maps)
        if mapsComplete(merged) then
            return merged
        end
        return nil
    end

    local found = take(mapsFromTypeManager(g_vehicleTypeManager, seenFunctions, seenClasses))
    if found ~= nil then
        return found
    end
    found = take(mapsFromTypeManager(g_placeableTypeManager, seenFunctions, seenClasses))
    if found ~= nil then
        return found
    end
    found = take(mapsFromHooks(seenFunctions))
    if found ~= nil then
        return found
    end

    local mission = g_currentMission
    local function scanList(list)
        if type(list) ~= "table" then
            return nil
        end
        local checked = 0
        for _, object in pairs(list) do
            checked = checked + 1
            if checked > 400 then
                break
            end
            local hit = take(mapsFromVehicleSpecs(object, seenFunctions))
            if hit ~= nil then
                return hit
            end
        end
        return nil
    end
    found = scanList(objectList(mission, "vehicleSystem"))
    if found ~= nil then
        return found
    end
    found = scanList(objectList(mission, "placeableSystem"))
    if found ~= nil then
        return found
    end
    found = scanList(mission ~= nil and mission.vehicles or nil)
    if found ~= nil then
        return found
    end
    found = scanList(mission ~= nil and mission.placeables or nil)
    if found ~= nil then
        return found
    end

    if g_modManager ~= nil and type(g_modManager.getModByName) == "function" then
        for _, name in ipairs(PF_MOD_NAMES) do
            local mod = safeCall(function()
                return g_modManager:getModByName(name)
            end, nil)
            if type(mod) == "table" then
                local singleton = singletonFromEnv(modEnvironment(mod)) or singletonFromEnv(mod)
                if singleton == nil then
                    singleton = singletonFromFunction(mod.load, 0, seenFunctions)
                    if singleton == nil then
                        local checked = 0
                        for _, value in pairs(mod) do
                            checked = checked + 1
                            if checked > 40 then
                                break
                            end
                            singleton = singletonFromEnv(value)
                            if singleton == nil and type(value) == "function" then
                                singleton = singletonFromFunction(value, 0, seenFunctions)
                            end
                            if singleton ~= nil then
                                break
                            end
                        end
                    end
                end
                found = take(mapsFromModule(singleton))
                if found ~= nil then
                    return found
                end
            end
        end
    end

    if type(_G.FS25_precisionFarming) == "table" then
        found = take(mapsFromModule(singletonFromEnv(_G.FS25_precisionFarming) or _G.FS25_precisionFarming))
        if found ~= nil then
            return found
        end
        found = take(moduleFromFunctions(_G.FS25_precisionFarming, seenFunctions))
        if found ~= nil then
            return found
        end
    end

    return merged
end

local function precisionFarmingInstance()
    if type(g_precisionFarming) == "table" then
        return g_precisionFarming
    end
    if g_currentMission ~= nil and type(g_currentMission.precisionFarming) == "table" then
        return g_currentMission.precisionFarming
    end
    if g_modManager == nil or type(g_modManager.getModByName) ~= "function" then
        return nil
    end
    for _, name in ipairs(PF_MOD_NAMES) do
        local mod = safeCall(function()
            return g_modManager:getModByName(name)
        end, nil)
        local env = modEnvironment(mod)
        local singleton = singletonFromEnv(env) or singletonFromEnv(mod)
        if singleton ~= nil then
            return singleton
        end
    end
    return nil
end

local function precisionFarmingLoaded()
    if precisionFarmingInstance() ~= nil then
        return true
    end
    if g_modIsLoaded ~= nil then
        for _, name in ipairs(PF_MOD_NAMES) do
            if g_modIsLoaded[name] then
                return true
            end
        end
    end
    if g_modManager ~= nil and type(g_modManager.getActiveMods) == "function" then
        local mods = safeCall(function()
            return g_modManager:getActiveMods()
        end, nil)
        if type(mods) == "table" then
            for _, mod in pairs(mods) do
                local name = nil
                if type(mod) == "table" then
                    name = mod.modName or mod.name
                elseif type(mod) == "string" then
                    name = mod
                end
                if type(name) == "string" and string.find(string.lower(name), "precisionfarming", 1, true) ~= nil then
                    return true
                end
            end
        end
    end
    return false
end

local function callWorld(target, method, x, z)
    if type(target) ~= "table" or type(method) ~= "string" or x == nil or z == nil then
        return nil
    end
    local fn = target[method]
    if type(fn) ~= "function" then
        return nil
    end
    local ok, first, second = pcall(fn, target, x, z)
    if not ok then
        return nil
    end
    return first, second
end

local function asNumber(value)
    if type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge then
        return value
    end
    if type(value) ~= "table" then
        return nil
    end
    local nested = value.value or value.level or value.amount or value.ph or value.pH or value.nitrogen
    if type(nested) == "number" and nested == nested and nested ~= math.huge and nested ~= -math.huge then
        return nested
    end
    return nil
end

local function displayText(value)
    local named = labelFromValue(value)
    if named == nil then
        return nil
    end
    if g_i18n ~= nil and type(g_i18n.getText) == "function" and string.find(named, " ", 1, true) == nil then
        local translated = safeCall(function()
            local text = g_i18n:getText(named)
            if type(text) == "string" and text ~= "" and text ~= named then
                return text
            end
            return nil
        end, nil)
        if translated ~= nil then
            return translated
        end
    end
    return named
end

local function rangePair(first, second)
    if type(first) == "number" and type(second) == "number" then
        return first, second
    end
    if type(first) == "table" then
        local minValue = first.min or first.minPh or first.minimum or first[1]
        local maxValue = first.max or first.maxPh or first.maximum or first[2]
        if type(minValue) == "number" and type(maxValue) == "number" then
            return minValue, maxValue
        end
    end
    return nil, nil
end

local function phStatus(ph, minPh, maxPh)
    if type(ph) ~= "number" or type(minPh) ~= "number" or type(maxPh) ~= "number" then
        return nil
    end
    if ph < minPh then
        return "Low"
    end
    if ph > maxPh then
        return "High"
    end
    return "Optimal"
end

local function roundPh(value)
    local amount = asNumber(value)
    if amount == nil then
        return nil
    end
    return round2(amount)
end

local function roundNitrogen(value)
    local amount = asNumber(value)
    if amount == nil then
        return nil
    end
    if math.abs(amount) >= 10 then
        return math.floor(amount + 0.5)
    end
    return math.floor(amount * 10 + 0.5) / 10
end

local function integerState(value, maxState)
    if type(value) ~= "number" or value < 0 or value > maxState then
        return nil
    end
    local index = math.floor(value + 0.5)
    if math.abs(value - index) > 0.001 then
        return nil
    end
    return index
end

-- The state lists are often 1-based, so list[state] is the previous state.
-- Match the stored state id instead of the array position.
local function realValueForState(list, state)
    if type(list) ~= "table" then
        return nil
    end
    for _, entry in pairs(list) do
        if type(entry) == "table" and entry.value == state and type(entry.realValue) == "number" then
            return entry.realValue
        end
    end
    return nil
end

local function callMapNumber(map, names, number)
    if type(map) ~= "table" then
        return nil
    end
    for _, name in ipairs(names) do
        local fn = map[name]
        if type(fn) == "function" then
            local ok, value = pcall(fn, map, number)
            if ok then
                local converted = asNumber(value)
                if converted ~= nil then
                    return converted
                end
            end
        end
    end
    return nil
end

-- getLevelAtWorldPos returns a state index. State 5 is 20 kg/ha, not 5.
local function nitrogenKilograms(map, level)
    local amount = asNumber(level)
    if amount == nil then
        return nil
    end
    local maxState = 45
    if type(map) == "table" and type(map.maxValue) == "number" and map.maxValue > 0 and map.maxValue <= 64 then
        maxState = map.maxValue
    end
    local index = integerState(amount, maxState)
    if index == nil then
        return amount
    end
    local step = 5
    if type(map) == "table" and type(map.getNitrogenFromChangedStates) == "function" then
        local ok, value = pcall(map.getNitrogenFromChangedStates, map, 1)
        if ok and type(value) == "number" and value > 0 and value <= 20 then
            step = value
        end
    end
    -- State 0 and 1 are both 0 kg/ha. Each later state adds one step.
    local expected = 0
    if index > 1 then
        expected = (index - 1) * step
    end
    if type(map) == "table" then
        local fromTable = realValueForState(map.nitrogenValues, index)
            or realValueForState(map.values, index)
            or realValueForState(map.levelValues, index)
        if fromTable ~= nil then
            return fromTable
        end
    end
    local converted = callMapNumber(map, {
        "getNitrogenValueFromLevel",
        "getRealValueFromLevel",
        "getNitrogenAmountFromLevel",
        "getNitrogenFromLevel",
        "getRealNitrogenValue",
    }, index)
    if converted ~= nil and math.abs(converted - expected) <= step * 0.51 and math.abs(converted - index) > 0.001 then
        return converted
    end
    return expected
end

-- pH states use the same kind of index. State 0 and 1 are 4.5, then +0.125 each state.
local function phRealValue(map, level)
    local amount = asNumber(level)
    if amount == nil then
        return nil
    end
    local maxState = 31
    if type(map) == "table" and type(map.maxValue) == "number" and map.maxValue > 0 and map.maxValue <= 40 then
        maxState = map.maxValue
    end
    local index = integerState(amount, maxState)
    if index == nil then
        return amount
    end
    local step = 0.125
    local expected = 4.5
    if index > 1 then
        expected = 4.5 + (index - 1) * step
    end
    if type(map) == "table" then
        local fromTable = realValueForState(map.pHValues, index)
            or realValueForState(map.phValues, index)
            or realValueForState(map.values, index)
        if fromTable ~= nil then
            return fromTable
        end
    end
    local converted = callMapNumber(map, {
        "getPHValueFromLevel",
        "getPhValueFromLevel",
        "getRealValueFromLevel",
        "getPHFromLevel",
        "getPhFromLevel",
    }, index)
    if converted ~= nil and math.abs(converted - expected) <= step * 0.51 and math.abs(converted - index) > 0.001 then
        return converted
    end
    return expected
end

local function requirementKilograms(map, fruitIndex, soilIndex)
    if type(map) ~= "table" or type(fruitIndex) ~= "number" or type(soilIndex) ~= "number" then
        return nil
    end
    local lists = {
        map.fruitRequirements,
        map.fruitTypeRequirements,
        map.fruitTypeInfos,
        map.requirements,
    }
    for _, list in ipairs(lists) do
        if type(list) == "table" then
            local fruit = list[fruitIndex]
            if type(fruit) ~= "table" then
                fruit = list[fruitIndex + 1]
            end
            if type(fruit) == "table" then
                local soil = fruit[soilIndex]
                if type(soil) ~= "table" and type(fruit.soils) == "table" then
                    soil = fruit.soils[soilIndex]
                end
                if type(soil) == "table" then
                    local target = soil.targetLevel or soil.target or soil.nTarget
                    if type(target) == "number" then
                        return target
                    end
                end
            end
        end
    end
    return callMapNumber(map, {
        "getFruitRequirement",
        "getNitrogenRequirement",
        "getTargetNitrogenForFruitType",
    }, fruitIndex)
end

-- Returns nTarget, soilTypeIndex, fruitTypeIndex. A bare first value can be the fruit index.
local function nitrogenTargetRaw(map, x, z, level, fruitIndex)
    if type(map) ~= "table" or type(map.getTargetLevelAtWorldPos) ~= "function" then
        return nil
    end
    local defaultIndex = map.nApplyAutoModeFruitRequirementDefaultIndex
        or map.fruitRequirementDefaultIndex
        or map.defaultFruitRequirementIndex
    local ok, first, second, third = pcall(
        map.getTargetLevelAtWorldPos,
        map,
        x,
        z,
        nil,
        fruitIndex,
        nil,
        level,
        defaultIndex
    )
    if not ok then
        ok, first, second, third = pcall(map.getTargetLevelAtWorldPos, map, x, z, nil, nil, nil, level)
    end
    if not ok then
        return nil
    end
    local maxState = 45
    if type(map.maxValue) == "number" and map.maxValue > 0 and map.maxValue <= 64 then
        maxState = map.maxValue
    end
    local function isLevel(value)
        return integerState(value, maxState) ~= nil
    end
    local function isSoil(value)
        local index = integerState(value, 4)
        return index ~= nil
    end
    if isLevel(first) and first ~= fruitIndex then
        return first
    end
    local returns = { first, second, third }
    for _, value in ipairs(returns) do
        if isLevel(value) and value ~= fruitIndex and not isSoil(value) then
            return value
        end
    end
    for _, value in ipairs(returns) do
        if type(value) == "number" and value > maxState and value <= 250 and value ~= fruitIndex then
            return value
        end
    end
    if isLevel(first) then
        return first
    end
    return nil
end

local function soilTypeName(soilMap, value)
    if type(value) == "string" and value ~= "" then
        return value
    end
    if type(value) == "table" then
        local named = displayText(value)
        if named ~= nil then
            return named
        end
        value = value.index or value.typeIndex or value.soilTypeIndex
    end
    if type(value) ~= "number" then
        return nil
    end
    if type(soilMap) == "table" then
        local lists = { soilMap.soilTypes, soilMap.types, soilMap.typeNames }
        for _, list in ipairs(lists) do
            if type(list) == "table" then
                local entry = list[value] or list[value + 1]
                local named = displayText(entry)
                if named ~= nil then
                    return named
                end
            end
        end
    end
    return PF_SOIL_FALLBACK[value]
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
    self.areaCache = {}
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
    self.boundaryRings = {}
    self.boundaryStore = {}
    self.boundaryStoreLoaded = false
    self.boundaryKeyLoaded = nil
    self.boundaryBoundKey = nil
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
                local entry = {
                    name = title,
                    fillLevel = level,
                    capacity = capacity,
                }
                local internal = fillTypeInternalName(fillType)
                if internal ~= nil then
                    entry.fillType = internal
                end
                fills[#fills + 1] = entry
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

function StateCollector:logPrecisionFarming(active, soil, ph, nitrogen)
    local key = "inactive"
    if active then
        if soil and ph and nitrogen then
            key = "found"
        elseif soil or ph or nitrogen then
            key = "partial"
        else
            key = "missing"
        end
    end
    if self.pfLogKey == key then
        return
    end
    self.pfLogKey = key
    if Logging == nil or Logging.info == nil then
        return
    end
    if not active then
        Logging.info("[MB Livemap] precision farming not active")
    elseif key == "found" then
        Logging.info("[MB Livemap] precision farming active, soil/ph/n sampled")
    elseif key == "partial" then
        Logging.info(
            "[MB Livemap] precision farming maps incomplete (soil=%s ph=%s nitrogen=%s)",
            tostring(soil),
            tostring(ph),
            tostring(nitrogen)
        )
    else
        Logging.info("[MB Livemap] precision farming present but soil maps not found")
    end
end

function StateCollector:precisionFarmingProbe()
    if self.pfProbe ~= nil and self.pfProbe.ready then
        return self.pfProbe
    end
    local probe = self.pfProbe or {
        ready = false,
        active = false,
        instance = nil,
        soilMap = nil,
        phMap = nil,
        nitrogenMap = nil,
        soilMethod = nil,
        phMethod = nil,
        nitrogenMethod = nil,
        phRangeTarget = nil,
        phRangeMethod = nil,
        nitrogenTargetTarget = nil,
        nitrogenTargetMethod = nil,
    }
    if not precisionFarmingLoaded() then
        probe.ready = true
        probe.active = false
        self.pfProbe = probe
        self:logPrecisionFarming(false, false, false, false)
        return probe
    end
    probe.active = true
    local instance = precisionFarmingInstance()
    local discovered = nil
    if instance == nil or (instance.soilMap == nil and instance.nitrogenMap == nil and instance.pHMap == nil and instance.phMap == nil) then
        discovered = precisionFarmingFromWorld()
        if discovered ~= nil and instance == nil then
            instance = discovered.instance
        end
    end
    probe.instance = instance
    if instance ~= nil then
        probe.soilMap = namedTable(instance, { "soilMap", "soilTypeMap" })
        probe.phMap = namedTable(instance, { "phMap", "pHMap", "phValueMap" })
        probe.nitrogenMap = namedTable(instance, { "nitrogenMap", "nMap", "nitrogenValueMap" })
    end
    if discovered ~= nil then
        if probe.soilMap == nil then
            probe.soilMap = discovered.soilMap
        end
        if probe.phMap == nil then
            probe.phMap = discovered.phMap
        end
        if probe.nitrogenMap == nil then
            probe.nitrogenMap = discovered.nitrogenMap
        end
    end
    probe.soilMethod = worldReader(probe.soilMap, PF_SOIL_METHODS)
    probe.phMethod = worldReader(probe.phMap, PF_PH_METHODS)
    probe.nitrogenMethod = worldReader(probe.nitrogenMap, PF_NITROGEN_METHODS)
    probe.phRangeTarget, probe.phRangeMethod = bindFunction(probe.phMap, instance, PF_PH_RANGE_METHODS)
    probe.nitrogenTargetTarget, probe.nitrogenTargetMethod = bindFunction(
        probe.nitrogenMap,
        instance,
        PF_NITROGEN_TARGET_METHODS
    )
    local soilOk = probe.soilMethod ~= nil
    local phOk = probe.phMethod ~= nil
    local nitrogenOk = probe.nitrogenMethod ~= nil
    -- Keep looking until soil, pH, and nitrogen can all be read.
    probe.ready = soilOk and phOk and nitrogenOk
    self.pfProbe = probe
    self:logPrecisionFarming(true, soilOk, phOk, nitrogenOk)
    return probe
end

function StateCollector:samplePrecisionFarming(x, z, fruitIndex)
    local probe = self:precisionFarmingProbe()
    if probe == nil or not probe.active or x == nil or z == nil then
        return nil
    end
    if probe.soilMethod == nil and probe.phMethod == nil and probe.nitrogenMethod == nil then
        return nil
    end
    local soilValue = callWorld(probe.soilMap, probe.soilMethod, x, z)
    local phValue = callWorld(probe.phMap, probe.phMethod, x, z)
    local nitrogenValue = callWorld(probe.nitrogenMap, probe.nitrogenMethod, x, z)
    local rangeA, rangeB = callWorld(probe.phRangeTarget, probe.phRangeMethod, x, z)
    local minPh, maxPh = rangePair(rangeA, rangeB)
    local soilIndex = soilValue
    if type(soilIndex) == "table" then
        soilIndex = soilIndex.index or soilIndex.typeIndex or soilIndex.soilTypeIndex
    end
    if type(soilIndex) == "number" then
        soilIndex = math.floor(soilIndex + 0.5)
    else
        soilIndex = nil
    end
    if minPh == nil and type(probe.phMap) == "table" and type(soilIndex) == "number" and soilIndex > 0 then
        local optimalName = firstFunction(probe.phMap, {
            "getOptimalPHValueForSoilTypeIndex",
            "getOptimalPhValueForSoilTypeIndex",
        })
        local optimal = nil
        if optimalName ~= nil then
            local ok, value = pcall(probe.phMap[optimalName], probe.phMap, soilIndex)
            if ok then
                optimal = asNumber(value)
            end
        end
        if optimal ~= nil then
            minPh = optimal - 0.26
            maxPh = optimal + 0.26
        end
    end
    local targetValue = requirementKilograms(probe.nitrogenMap, fruitIndex, soilIndex)
    if targetValue == nil then
        targetValue = nitrogenTargetRaw(probe.nitrogenMap, x, z, asNumber(nitrogenValue), fruitIndex)
    end
    if asNumber(targetValue) == nil then
        targetValue = callWorld(probe.nitrogenTargetTarget, probe.nitrogenTargetMethod, x, z)
    end
    local ph = roundPh(phRealValue(probe.phMap, phValue))
    local info = {
        soilType = soilTypeName(probe.soilMap, soilValue),
        ph = ph,
        phStatus = phStatus(ph, minPh, maxPh),
        nitrogen = roundNitrogen(nitrogenKilograms(probe.nitrogenMap, nitrogenValue)),
        nitrogenTarget = roundNitrogen(nitrogenKilograms(probe.nitrogenMap, targetValue)),
    }
    if info.soilType == nil and info.ph == nil and info.nitrogen == nil then
        return nil
    end
    return info
end

-- Crop, care, and Precision Farming at one world position. The map click uses
-- this instead of the field center, matching the in-game cursor sample.
function StateCollector:sampleFieldPoint(x, z)
    if type(x) ~= "number" or type(z) ~= "number" then
        return nil
    end
    local fruitType = nil
    local growthState = nil
    local growthMax = nil
    local fruitIndex = nil
    local sampledState = nil
    if FieldState ~= nil and FieldState.new ~= nil then
        local sampled = FieldState.new()
        local updated = pcall(function()
            sampled:update(x, z)
        end)
        if updated then
            sampledState = sampled
            if isKnownFruit(sampled.fruitTypeIndex) then
                fruitIndex = sampled.fruitTypeIndex
                growthState = sampled.growthState
            end
        end
    end
    if type(fruitIndex) == "string" then
        fruitType = fruitIndex
    elseif isKnownFruit(fruitIndex) then
        local named, _, maxGrowth = fruitInfoFromIndex(fruitIndex)
        fruitType = named
        growthMax = maxGrowth
    end
    if fruitType == nil then
        local sampledFruit, sampledGrowth, sampledMax = sampleFieldFruit(x, z)
        fruitType = sampledFruit
        if growthState == nil then
            growthState = sampledGrowth
        end
        if growthMax == nil then
            growthMax = sampledMax
        end
    end
    local careState = sampledState
    local desc = fruitDescFromIndex(fruitIndex)
    local groundType = type(careState) == "table" and careState.groundType or nil
    local cropState = cropStateFrom(fruitIndex, growthState, growthMax, groundType)
    local needsRolling = fieldNeedsRolling(careState, fruitIndex, desc)
    local needsFertilizer = nil
    local fertilizerLevel = nil
    local fertilizerMax = nil
    local sprayMax = fertilizerApplicationsMax()
    if type(careState) == "table" and type(careState.sprayLevel) == "number" then
        fertilizerLevel = careState.sprayLevel
        fertilizerMax = sprayMax
        needsFertilizer = careState.sprayLevel < sprayMax
    end
    local weeds = nil
    local weedNeed = nil
    if type(careState) == "table" and type(careState.weedState) == "number" then
        weeds = weedLabel(careState.weedState)
        weedNeed = careState.weedState > 0 and careState.weedState < 7
    end
    local weedsEnabled = missionFlag({ "weedsEnabled", "weedsRequired" })
    local needsSpraying = flagNeed(weedsEnabled, weedNeed)
    weeds = flagNeed(weedsEnabled, weeds)
    local plowNeed = nil
    if type(careState) == "table" and type(careState.plowLevel) == "number" then
        plowNeed = careState.plowLevel <= 0
    end
    local needsPlowing = flagNeed(missionFlag({ "plowingRequiredEnabled", "plowingRequired" }), plowNeed)
    local limeNeed = nil
    if type(careState) == "table" and type(careState.limeLevel) == "number" then
        limeNeed = careState.limeLevel <= 0
    end
    local needsLime = flagNeed(missionFlag({ "limeRequired", "limeRequiredEnabled" }), limeNeed)
    local stoneNeed = nil
    if type(careState) == "table" and type(careState.stoneLevel) == "number" then
        stoneNeed = careState.stoneLevel > 0
    end
    local needsStones = flagNeed(missionFlag({ "stonesEnabled", "stonesRequired" }), stoneNeed)
    return {
        fruitType = fruitType,
        growthState = growthState,
        growthMax = growthMax,
        cropState = cropState,
        needsRolling = needsRolling,
        needsFertilizer = needsFertilizer,
        fertilizerLevel = fertilizerLevel,
        fertilizerMax = fertilizerMax,
        needsSpraying = needsSpraying,
        weeds = weeds,
        needsPlowing = needsPlowing,
        needsLime = needsLime,
        needsStones = needsStones,
        precisionFarming = self:samplePrecisionFarming(x, z, fruitIndex),
    }
end

local function pointInPolygon(x, z, points)
    if type(points) ~= "table" or #points < 3 then
        return false
    end
    local inside = false
    local count = #points
    local previous = count
    for index = 1, count do
        local current = points[index]
        local prior = points[previous]
        if type(current) == "table" and type(prior) == "table" and (current.z > z) ~= (prior.z > z) then
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

local function polygonCentroid(points)
    local x, z = 0, 0
    for _, point in ipairs(points) do
        x = x + point.x
        z = z + point.z
    end
    return x / #points, z / #points
end

-- Polygon cache only lives for this session, so the scene node id is enough.
local function fieldCacheKey(field, id)
    return tostring((type(field) == "table" and (field.fieldId or field.rootNode)) or id)
end

local function xmlEscape(value)
    local text = tostring(value)
    text = text:gsub("&", "&amp;")
    text = text:gsub("<", "&lt;")
    text = text:gsub(">", "&gt;")
    text = text:gsub('"', "&quot;")
    return text
end

local function ringIds(ring)
    local ids = {}
    if type(ring.owner) == "string" then
        ids[ring.owner] = true
    end
    if type(ring.synthetic) == "string" then
        ids[ring.synthetic] = true
    end
    if type(ring.hidden) == "table" then
        for _, id in ipairs(ring.hidden) do
            ids[id] = true
        end
    end
    return ids
end

local function ringsOverlap(old, newRing, newPoints)
    local oldIds = ringIds(old)
    for id in pairs(ringIds(newRing)) do
        if oldIds[id] then
            return true
        end
    end
    if type(old.cx) == "number" and type(old.cz) == "number" and pointInPolygon(old.cx, old.cz, newPoints) then
        return true
    end
    if type(newRing.cx) == "number" and type(newRing.cz) == "number" and type(old.points) == "table" and pointInPolygon(newRing.cx, newRing.cz, old.points) then
        return true
    end
    return false
end

local function normalizeDir(value)
    if type(value) ~= "string" or value == "" then
        return ""
    end
    local text = value:gsub("\\", "/")
    return (text:gsub("/+$", ""))
end

local function directorySlot(value)
    local normal = normalizeDir(value)
    if normal == "" then
        return ""
    end
    return normal:match("([^/]+)$") or normal
end

-- savegame3 and a bare slot index 3 name the same career. Other folder names stay distinct.
local function slotToken(value)
    local slot = directorySlot(value)
    local number = slot:match("^savegame(%d+)$") or slot:match("^slot(%d+)$")
    if number ~= nil then
        return number
    end
    if slot:match("^%d+$") then
        return slot
    end
    return slot:lower()
end

local function splitBoundaryKey(key)
    if type(key) ~= "string" then
        return "", ""
    end
    local sep = key:match("^.*()|")
    if sep == nil then
        return key, ""
    end
    return key:sub(1, sep - 1), key:sub(sep + 1)
end

local function sameBoundarySave(storedSave, saveDir)
    if saveDir == "" or storedSave == "" then
        return false
    end
    if normalizeDir(storedSave):lower() == normalizeDir(saveDir):lower() then
        return true
    end
    return slotToken(storedSave) == slotToken(saveDir)
end

local function fieldsInsideRing(points, centers)
    local inside = {}
    if type(points) ~= "table" then
        return inside
    end
    local cx, cz = polygonCentroid(points)
    for _, field in ipairs(centers) do
        local number = tonumber(field.id)
        if number ~= nil and number > 0 and number < 10000 and pointInPolygon(field.x, field.z, points) then
            local dx = field.x - cx
            local dz = field.z - cz
            inside[#inside + 1] = { id = field.id, dist = dx * dx + dz * dz }
        end
    end
    table.sort(inside, function(a, b)
        return a.dist < b.dist
    end)
    return inside
end

local function ringIdsCurrent(ring, known)
    if type(ring.synthetic) == "string" and ring.owner == nil then
        return true
    end
    if type(ring.owner) ~= "string" or known[ring.owner] ~= true then
        return false
    end
    if type(ring.hidden) == "table" then
        for _, id in ipairs(ring.hidden) do
            if known[id] ~= true then
                return false
            end
        end
    end
    return true
end

local function ringsCoverSameGround(a, b)
    if type(b) == "table" and ringsOverlap(a, b, b.points) then
        return true
    end
    if type(a) ~= "table" or type(a.points) ~= "table" or type(b) ~= "table" or type(b.points) ~= "table" then
        return false
    end
    local ax, az = polygonCentroid(a.points)
    local bx, bz = polygonCentroid(b.points)
    return pointInPolygon(ax, az, b.points) or pointInPolygon(bx, bz, a.points)
end

function StateCollector:boundariesFile()
    if getUserProfileAppPath == nil then
        return nil
    end
    local ok, base = pcall(getUserProfileAppPath)
    if not ok or type(base) ~= "string" or base == "" then
        return nil
    end
    local tail = string.sub(base, -1)
    if tail ~= "/" and tail ~= "\\" then
        base = base .. "/"
    end
    local modName = g_currentModName or "FS25_MB_Livemap"
    local dir = base .. "modSettings/" .. modName .. "/"
    pcall(createFolder, base .. "modSettings/")
    pcall(createFolder, dir)
    return dir .. "fieldBoundaries.xml"
end

function StateCollector:boundaryKeyParts()
    local mapName = ""
    local saveDir = ""
    local info = g_currentMission and g_currentMission.missionInfo
    if type(info) == "table" then
        if type(info.mapTitle) == "string" and info.mapTitle ~= "" then
            mapName = info.mapTitle
        elseif type(info.mapId) == "string" then
            mapName = info.mapId
        end
        -- The map folder is the same for every career on that map, so it cannot identify a save.
        if type(info.savegameDirectory) == "string" and info.savegameDirectory ~= "" then
            saveDir = normalizeDir(info.savegameDirectory)
        elseif info.savegameIndex ~= nil then
            saveDir = "slot" .. tostring(info.savegameIndex)
        end
    end
    if mapName == "" and type(self.mapName) == "string" then
        mapName = self.mapName
    end
    return mapName .. "|" .. saveDir, mapName, saveDir
end

function StateCollector:boundaryKey()
    local key = self:boundaryKeyParts()
    return key
end

function StateCollector:saveBoundaryFile(saveDir)
    if type(saveDir) ~= "string" or saveDir == "" then
        return nil
    end
    return saveDir .. "/mbLivemap_fieldBoundaries.xml"
end

-- Move outlines saved under an older path spelling onto the current save key.
function StateCollector:adoptBoundaryKey(canonical, mapName, saveDir)
    local store = self.boundaryStore
    if type(store) ~= "table" or mapName == "" or saveDir == "" or store[canonical] ~= nil then
        return canonical, false
    end
    local found = nil
    local foundCount = -1
    local aliases = {}
    for key, rings in pairs(store) do
        if key ~= canonical and type(rings) == "table" and #rings > 0 then
            local keyMap, keySave = splitBoundaryKey(key)
            if keyMap == mapName and sameBoundarySave(keySave, saveDir) then
                aliases[#aliases + 1] = key
                if #rings > foundCount then
                    found = key
                    foundCount = #rings
                end
            end
        end
    end
    if found == nil then
        return canonical, false
    end
    store[canonical] = store[found]
    for _, key in ipairs(aliases) do
        store[key] = nil
    end
    return canonical, true
end

function StateCollector:readBoundaryStore(path)
    local store = {}
    path = path or self:boundariesFile()
    if path == nil or XMLFile == nil or XMLFile.loadIfExists == nil then
        return nil
    end
    local xmlFile = nil
    local loaded = pcall(function()
        StateCollector.boundaryXmlSeq = (StateCollector.boundaryXmlSeq or 0) + 1
        xmlFile = XMLFile.loadIfExists("mbLivemapBoundaries" .. tostring(StateCollector.boundaryXmlSeq), path)
    end)
    if not loaded or xmlFile == nil then
        return nil
    end
    pcall(function()
        xmlFile:iterate("fieldBoundaries.save", function(_, saveKey)
            local key = xmlFile:getString(saveKey .. "#key")
            if type(key) ~= "string" or key == "" then
                return
            end
            local rings = {}
            xmlFile:iterate(saveKey .. ".ring", function(_, ringKey)
                local points = {}
                xmlFile:iterate(ringKey .. ".point", function(_, pointKey)
                    local x = xmlFile:getFloat(pointKey .. "#x")
                    local z = xmlFile:getFloat(pointKey .. "#z")
                    if type(x) == "number" and type(z) == "number" then
                        points[#points + 1] = { x = x, z = z }
                    end
                end)
                if #points < 3 then
                    return
                end
                local hidden = {}
                xmlFile:iterate(ringKey .. ".hidden", function(_, hiddenKey)
                    local id = xmlFile:getString(hiddenKey .. "#id")
                    if type(id) == "string" and id ~= "" then
                        hidden[#hidden + 1] = id
                    end
                end)
                local ring = { points = points, hidden = hidden }
                local owner = xmlFile:getString(ringKey .. "#owner")
                local synthetic = xmlFile:getString(ringKey .. "#synthetic")
                if type(owner) == "string" and owner ~= "" then
                    ring.owner = owner
                elseif type(synthetic) == "string" and synthetic ~= "" then
                    ring.synthetic = synthetic
                    ring.cx = xmlFile:getFloat(ringKey .. "#cx")
                    ring.cz = xmlFile:getFloat(ringKey .. "#cz")
                    if type(ring.cx) ~= "number" or type(ring.cz) ~= "number" then
                        ring.cx, ring.cz = polygonCentroid(points)
                    end
                end
                if ring.owner ~= nil or ring.synthetic ~= nil then
                    rings[#rings + 1] = ring
                end
            end)
            store[key] = rings
        end)
    end)
    pcall(function()
        xmlFile:delete()
    end)
    return store
end

function StateCollector:readSaveRings(saveDir)
    local path = self:saveBoundaryFile(saveDir)
    if path == nil then
        return nil
    end
    local store = self:readBoundaryStore(path)
    if store == nil then
        return nil
    end
    local key = self:boundaryKey()
    if type(store[key]) == "table" then
        return store[key]
    end
    for _, rings in pairs(store) do
        if type(rings) == "table" then
            return rings
        end
    end
    return {}
end

function StateCollector:writeBoundaryXml(path, store)
    if path == nil or type(io) ~= "table" or type(io.open) ~= "function" or type(store) ~= "table" then
        return
    end
    local lines = {
        '<?xml version="1.0" encoding="utf-8" standalone="no"?>',
        "<fieldBoundaries>",
    }
    for key, rings in pairs(store) do
        local _, savePart = splitBoundaryKey(key)
        if savePart ~= "" and type(rings) == "table" then
        lines[#lines + 1] = string.format('    <save key="%s">', xmlEscape(key))
        for _, ring in ipairs(rings) do
            if ring.owner ~= nil then
                lines[#lines + 1] = string.format('        <ring owner="%s">', xmlEscape(ring.owner))
            else
                lines[#lines + 1] = string.format(
                    '        <ring synthetic="%s" cx="%.1f" cz="%.1f">',
                    xmlEscape(ring.synthetic),
                    ring.cx or 0,
                    ring.cz or 0
                )
            end
            for _, id in ipairs(ring.hidden or {}) do
                lines[#lines + 1] = string.format('            <hidden id="%s"/>', xmlEscape(id))
            end
            for _, point in ipairs(ring.points or {}) do
                lines[#lines + 1] = string.format('            <point x="%.1f" z="%.1f"/>', point.x, point.z)
            end
            lines[#lines + 1] = "        </ring>"
        end
        lines[#lines + 1] = "    </save>"
        end
    end
    lines[#lines + 1] = "</fieldBoundaries>"
    lines[#lines + 1] = ""
    local handle = io.open(path, "w")
    if handle == nil then
        return
    end
    handle:write(table.concat(lines, "\n"))
    handle:close()
end

function StateCollector:writeBoundaryStore()
    local path = self:boundariesFile()
    if path ~= nil then
        self:writeBoundaryXml(path, self.boundaryStore or {})
    end
    local _, _, saveDir = self:boundaryKeyParts()
    local key = self.boundaryKeyLoaded
    local rings = type(key) == "string" and self.boundaryStore and self.boundaryStore[key] or nil
    local saveFile = self:saveBoundaryFile(saveDir)
    if saveFile ~= nil and type(rings) == "table" then
        self:writeBoundaryXml(saveFile, { [key] = rings })
    end
end

function StateCollector:ensureBoundaries()
    if not self.boundaryStoreLoaded then
        self.boundaryStore = self:readBoundaryStore() or {}
        self.boundaryStoreLoaded = true
    end
    local key, mapName, saveDir = self:boundaryKeyParts()
    if self.boundaryKeyLoaded == key then
        return
    end
    local adopted, migrated = self:adoptBoundaryKey(key, mapName, saveDir)
    local fromSave = self:readSaveRings(saveDir)
    if fromSave ~= nil then
        self.boundaryStore[adopted] = fromSave
        migrated = false
    end
    self.boundaryKeyLoaded = adopted
    self.boundaryRings = self.boundaryStore[adopted] or {}
    self.boundaryBoundKey = nil
    if migrated then
        self.boundaryStore[adopted] = self.boundaryRings
        self:writeBoundaryStore()
    end
end

function StateCollector:boundaryLookups()
    local polygons = {}
    local hidden = {}
    local synthetics = {}
    for _, ring in ipairs(self.boundaryRings or {}) do
        if type(ring.owner) == "string" and type(ring.points) == "table" then
            polygons[ring.owner] = ring.points
        end
        for _, id in ipairs(ring.hidden or {}) do
            hidden[id] = true
        end
        if type(ring.synthetic) == "string" then
            synthetics[#synthetics + 1] = ring
        end
    end
    return polygons, hidden, synthetics
end

function StateCollector:fieldCenters()
    local centers = {}
    local fieldList = nil
    if g_fieldManager ~= nil and g_fieldManager.fields ~= nil then
        fieldList = g_fieldManager.fields
    elseif g_currentMission ~= nil and g_currentMission.fieldManager ~= nil then
        fieldList = g_currentMission.fieldManager.fields
    end
    if type(fieldList) ~= "table" then
        return centers
    end
    for id, field in pairs(fieldList) do
        if type(field) == "table" then
            local fx, fz = nil, nil
            if field.getCenterOfFieldWorldPosition ~= nil then
                local a, b = field:getCenterOfFieldWorldPosition()
                fx, fz = a, b
            elseif field.getCenterOfFieldWorldPos ~= nil then
                local a, b = field:getCenterOfFieldWorldPos()
                fx, fz = a, b
            elseif field.posX ~= nil then
                fx, fz = field.posX, field.posZ
            end
            if type(fx) == "number" and type(fz) == "number" then
                centers[#centers + 1] = { id = fieldDisplayId(field, id), x = fx, z = fz }
            end
        end
    end
    return centers
end

-- Scene node ids change whenever the save loads. Keep each outline on the field number,
-- and drop older scans of the same ground.
function StateCollector:bindBoundaryRings()
    self:ensureBoundaries()
    if self.boundaryBoundKey == self.boundaryKeyLoaded then
        return
    end
    local centers = self:fieldCenters()
    if #centers == 0 then
        return
    end
    local known = {}
    local stableCenters = false
    for _, field in ipairs(centers) do
        known[field.id] = true
        local number = tonumber(field.id)
        if number ~= nil and number > 0 and number < 10000 then
            stableCenters = true
        end
    end
    -- Wait until field numbers exist. Node ids from this load would be stale after the next reload.
    if not stableCenters then
        return
    end
    local changed = false
    local rebound = {}
    for _, source in ipairs(self.boundaryRings or {}) do
        local hidden = {}
        for _, id in ipairs(source.hidden or {}) do
            hidden[#hidden + 1] = id
        end
        local ring = {
            owner = source.owner,
            synthetic = source.synthetic,
            cx = source.cx,
            cz = source.cz,
            points = source.points,
            hidden = hidden,
        }
        if not ringIdsCurrent(ring, known) and type(ring.points) == "table" then
            local inside = fieldsInsideRing(ring.points, centers)
            if #inside == 0 then
                local cx, cz = polygonCentroid(ring.points)
                ring.owner = nil
                ring.synthetic = string.format("scan:%d:%d", math.floor(cx + 0.5), math.floor(cz + 0.5))
                ring.cx = round1(cx)
                ring.cz = round1(cz)
                ring.hidden = {}
            else
                ring.owner = inside[1].id
                ring.synthetic = nil
                ring.cx = nil
                ring.cz = nil
                hidden = {}
                for index = 2, #inside do
                    hidden[#hidden + 1] = inside[index].id
                end
                ring.hidden = hidden
            end
            changed = true
        end
        rebound[#rebound + 1] = ring
    end
    local kept = {}
    for index = #rebound, 1, -1 do
        local ring = rebound[index]
        local covered = false
        for _, newer in ipairs(kept) do
            if ringsCoverSameGround(ring, newer) then
                covered = true
                break
            end
        end
        if not covered then
            table.insert(kept, 1, ring)
        else
            changed = true
        end
    end
    self.boundaryBoundKey = self.boundaryKeyLoaded
    if not changed then
        return
    end
    self.boundaryRings = kept
    if type(self.boundaryKeyLoaded) == "string" then
        self.boundaryStore[self.boundaryKeyLoaded] = kept
        self:writeBoundaryStore()
    end
    if Logging ~= nil and Logging.info ~= nil then
        Logging.info("[MB Livemap] field boundaries restored %d", #kept)
    end
end

function StateCollector:commitScan(points, clickX, clickZ, interiorX, interiorZ)
    if type(points) ~= "table" then
        return false, "Could not trace the field edge"
    end
    self:bindBoundaryRings()
    local simplified = simplifyPolygon(points)
    if simplified == nil then
        return false, "Field outline was too small"
    end
    local rounded = {}
    for _, point in ipairs(simplified) do
        rounded[#rounded + 1] = { x = round1(point.x), z = round1(point.z) }
    end
    if #rounded < 3 then
        return false, "Field outline was too small"
    end
    if type(interiorX) == "number" and type(interiorZ) == "number" and not pointInPolygon(interiorX, interiorZ, rounded) then
        return false, "Could not trace the field edge"
    end

    local inside = {}
    for _, field in ipairs(self:fieldCenters()) do
        local number = tonumber(field.id)
        if number ~= nil and number > 0 and number < 10000 and pointInPolygon(field.x, field.z, rounded) then
            local dx = field.x - (clickX or field.x)
            local dz = field.z - (clickZ or field.z)
            inside[#inside + 1] = { id = field.id, dist = dx * dx + dz * dz }
        end
    end
    table.sort(inside, function(a, b)
        return a.dist < b.dist
    end)

    local ring
    if #inside == 0 then
        local cx, cz = polygonCentroid(rounded)
        ring = {
            synthetic = string.format("scan:%d:%d", math.floor(cx + 0.5), math.floor(cz + 0.5)),
            cx = round1(cx),
            cz = round1(cz),
            points = rounded,
            hidden = {},
        }
    else
        local hidden = {}
        for index = 2, #inside do
            hidden[#hidden + 1] = inside[index].id
        end
        ring = {
            owner = inside[1].id,
            points = rounded,
            hidden = hidden,
        }
    end

    local kept = {}
    for _, old in ipairs(self.boundaryRings) do
        if not ringsOverlap(old, ring, rounded) then
            kept[#kept + 1] = old
        end
    end
    kept[#kept + 1] = ring
    self.boundaryRings = kept
    self.boundaryStore[self.boundaryKeyLoaded] = kept
    self:writeBoundaryStore()
    if Logging ~= nil and Logging.info ~= nil then
        Logging.info("[MB Livemap] field scan saved %d points", #rounded)
    end
    return true
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

        if self.areaCache == nil then
            self.areaCache = {}
        end
        local plowingEnabled = missionFlag({ "plowingRequiredEnabled", "plowingRequired" })
        local limeEnabled = missionFlag({ "limeRequired", "limeRequiredEnabled" })
        local weedsEnabled = missionFlag({ "weedsEnabled", "weedsRequired" })
        local stonesEnabled = missionFlag({ "stonesEnabled", "stonesRequired" })
        local sprayMax = fertilizerApplicationsMax()
        self:bindBoundaryRings()
        local scannedPolygons, hiddenScans = self:boundaryLookups()

        for id, field in pairs(fieldList) do
            local fruitType = nil
            local fruitColor = nil
            local growthState = nil
            local growthMax = nil
            local owned = nil
            local fieldFarmId = nil
            local fx, fz = nil, nil
            local polygon = nil
            local areaHa = nil
            local cropState = nil
            local needsRolling = nil
            local needsFertilizer = nil
            local fertilizerLevel = nil
            local fertilizerMax = nil
            local needsSpraying = nil
            local weeds = nil
            local needsPlowing = nil
            local needsLime = nil
            local needsStones = nil
            local precision = nil
            local cacheKey = fieldCacheKey(field, id)
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

                if self.polygonCache[cacheKey] == nil or self.areaCache[cacheKey] == nil then
                    local rawOutline = rawOutlineFromField(field)
                    if self.polygonCache[cacheKey] == nil then
                        local outline = simplifyPolygon(rawOutline)
                        if outline ~= nil then
                            self.polygonCache[cacheKey] = outline
                        end
                    end
                    if self.areaCache[cacheKey] == nil then
                        local measured = polygonAreaHa(rawOutline)
                        if measured ~= nil then
                            self.areaCache[cacheKey] = measured
                        end
                    end
                end
                polygon = self.polygonCache[cacheKey]

                -- getFieldState() is a cache and can still name the fruit from an older pass.
                -- Care flags still come from a live sample, including fields with no crop.
                local fruitIndex = nil
                local sampledState = nil
                local cachedState = nil
                if fx ~= nil and fz ~= nil and FieldState ~= nil and FieldState.new ~= nil then
                    local sampled = FieldState.new()
                    local updated = pcall(function()
                        sampled:update(fx, fz)
                    end)
                    if updated then
                        sampledState = sampled
                        if isKnownFruit(sampled.fruitTypeIndex) then
                            fruitIndex = sampled.fruitTypeIndex
                            growthState = sampled.growthState
                        end
                    end
                end
                if not isKnownFruit(fruitIndex) then
                    cachedState = field.fieldState
                    if field.getFieldState ~= nil then
                        local live = field:getFieldState()
                        if type(live) == "table" then
                            cachedState = live
                        end
                    end
                    if type(cachedState) == "table" then
                        fruitIndex = cachedState.fruitTypeIndex or cachedState.fruitIndex
                        if growthState == nil then
                            growthState = cachedState.growthState
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

                local careState = sampledState or cachedState
                local desc = fruitDescFromIndex(fruitIndex)
                local groundType = type(careState) == "table" and careState.groundType or nil
                cropState = cropStateFrom(fruitIndex, growthState, growthMax, groundType)
                needsRolling = fieldNeedsRolling(careState, fruitIndex, desc)
                if type(careState) == "table" and type(careState.sprayLevel) == "number" then
                    fertilizerLevel = careState.sprayLevel
                    fertilizerMax = sprayMax
                    needsFertilizer = careState.sprayLevel < sprayMax
                end
                local weedNeed = nil
                if type(careState) == "table" and type(careState.weedState) == "number" then
                    weeds = weedLabel(careState.weedState)
                    -- Withered weeds were already sprayed. Living stages still need a pass.
                    weedNeed = careState.weedState > 0 and careState.weedState < 7
                end
                needsSpraying = flagNeed(weedsEnabled, weedNeed)
                weeds = flagNeed(weedsEnabled, weeds)
                local plowNeed = nil
                if type(careState) == "table" and type(careState.plowLevel) == "number" then
                    plowNeed = careState.plowLevel <= 0
                end
                needsPlowing = flagNeed(plowingEnabled, plowNeed)
                local limeNeed = nil
                if type(careState) == "table" and type(careState.limeLevel) == "number" then
                    limeNeed = careState.limeLevel <= 0
                end
                needsLime = flagNeed(limeEnabled, limeNeed)
                local stoneNeed = nil
                if type(careState) == "table" and type(careState.stoneLevel) == "number" then
                    stoneNeed = careState.stoneLevel > 0
                end
                needsStones = flagNeed(stonesEnabled, stoneNeed)

                local farmland = field.farmland
                if farmland == nil and field.farmlandId ~= nil and g_farmlandManager ~= nil and g_farmlandManager.getFarmlandById ~= nil then
                    farmland = g_farmlandManager:getFarmlandById(field.farmlandId)
                end
                if farmland ~= nil then
                    fieldFarmId = positiveFarmId(farmland.farmId)
                    owned = fieldFarmId ~= nil
                end
                areaHa = fieldAreaHa(field, farmland, nil)
                if areaHa == nil then
                    areaHa = self.areaCache[cacheKey]
                end
                precision = self:samplePrecisionFarming(fx, fz, fruitIndex)

            end, nil)

            local entry = {
                id = cacheKey,
                name = displayId,
                fruitType = fruitType,
                fruitColor = fruitColor,
                growthState = growthState,
                growthMax = growthMax,
                owned = owned,
                farmId = fieldFarmId,
                x = fx,
                z = fz,
                polygon = polygon,
                areaHa = areaHa,
                cropState = cropState,
                needsRolling = needsRolling,
                needsFertilizer = needsFertilizer,
                fertilizerLevel = fertilizerLevel,
                fertilizerMax = fertilizerMax,
                needsSpraying = needsSpraying,
                weeds = weeds,
                needsPlowing = needsPlowing,
                needsLime = needsLime,
                needsStones = needsStones,
            }
            if precision ~= nil then
                entry.precisionFarming = precision
            end
            if scannedPolygons[displayId] ~= nil then
                entry.polygon = scannedPolygons[displayId]
                local measured = polygonAreaHa(scannedPolygons[displayId])
                if measured ~= nil then
                    entry.areaHa = measured
                end
            elseif hiddenScans[displayId] then
                entry.polygon = nil
            end
            fields[#fields + 1] = entry
        end
    end, nil)

    self:ensureBoundaries()
    local _, _, scannedSynthetics = self:boundaryLookups()
    for _, ring in ipairs(scannedSynthetics) do
        local fruit, growth, growthMax = sampleFieldFruit(ring.cx, ring.cz)
        fields[#fields + 1] = {
            id = ring.synthetic,
            name = "Custom",
            fruitType = fruit,
            growthState = growth,
            growthMax = growthMax,
            x = ring.cx,
            z = ring.cz,
            polygon = ring.points,
            areaHa = polygonAreaHa(ring.points),
        }
    end

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

local function addFill(fills, title, level, capacity, usage)
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
            if fill.usage == nil and type(usage) == "string" then
                fill.usage = usage
                fill.role = usage == "product" and "output" or "input"
            end
            return
        end
    end
    local entry = {
        name = title,
        fillLevel = level,
        capacity = capacity,
    }
    if type(usage) == "string" then
        entry.usage = usage
        entry.role = usage == "product" and "output" or "input"
    end
    fills[#fills + 1] = entry
end

local function pushHusbandryFill(fills, placeable, fillType, usage)
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
    addFill(fills, fillTypeName(fillType), level, capacity, usage)
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
                            local enabled = production.enabled ~= false and production.disabled ~= true and production.isEnabled ~= false
                            if lineStatus == "RUNNING" then
                                anyRunning = true
                            end
                            lines[#lines + 1] = {
                                name = lineName,
                                status = lineStatus,
                                enabled = enabled,
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
                                    addFill(fills, title, level, food.capacity or 0, "food")
                                    wroteGroup = true
                                end
                            end
                        end
                        if not wroteGroup and type(food.fillLevels) == "table" then
                            for fillType, level in pairs(food.fillLevels) do
                                addFill(fills, fillTypeName(fillType), level, food.capacity or 0, "food")
                            end
                        end
                    end

                    local water = placeable.spec_husbandryWater
                    if water ~= nil then
                        pushHusbandryFill(fills, placeable, water.fillType, "water")
                    end

                    local straw = placeable.spec_husbandryStraw
                    if straw ~= nil then
                        pushHusbandryFill(fills, placeable, straw.inputFillType, "straw")
                        local manureActive = straw.isManureActive
                        if manureActive == nil then
                            manureActive = placeable.isManureActive
                        end
                        if manureActive ~= false then
                            pushHusbandryFill(fills, placeable, straw.outputFillType, "product")
                        end
                    end

                    local liquidManure = placeable.spec_husbandryLiquidManure
                    if liquidManure ~= nil then
                        pushHusbandryFill(fills, placeable, liquidManure.fillType, "product")
                    end

                    local milk = placeable.spec_husbandryMilk
                    if milk ~= nil and type(milk.fillTypes) == "table" then
                        for _, fillType in ipairs(milk.fillTypes) do
                            pushHusbandryFill(fills, placeable, fillType, "product")
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
                            addFill(fills, fillTypeName(fillType), pallets.fillLevels[fillType], palletCapacity, "product")
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

function StateCollector:refreshMapInfo()
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

function StateCollector:refreshWeather()
    self.cachedWeather = self:collectWeather()
end

function StateCollector:refreshFields()
    self.cachedFields = self:collectFields()
end

function StateCollector:refreshProductions()
    self.cachedProductions = self:collectProductions()
end

function StateCollector:refreshAnimals()
    self.cachedAnimals = self:collectAnimals()
end

function StateCollector:refreshSlow()
    self:refreshMapInfo()
    self:refreshWeather()
    self:refreshFields()
    self:refreshProductions()
    self:refreshAnimals()
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

function StateCollector:buildSnapshot(include)
    local everything = include == nil
    local snapshot = {
        type = "state",
        ts = math.floor((g_time or (os.clock() * 1000))),
        source = "mod",
        mapName = self.mapName,
        mapSize = self.mapSize,
        customEnvironment = self.customEnvironment,
        mapDirectory = self.mapDirectory,
        missionDirectory = self.missionDirectory,
    }
    if everything or include.vehicles then
        snapshot.calendar = self:collectCalendar()
        snapshot.vehicles = self:collectVehicles()
        local ownFarm = localFarmId()
        if ownFarm ~= nil then
            snapshot.localFarmId = ownFarm
        end
        if isHostedMultiplayer() then
            snapshot.multiplayer = true
            snapshot.farms = collectFarms()
            snapshot.players = collectPlayers()
        end
    end
    if everything or include.weather then
        snapshot.weather = self.cachedWeather
    end
    if everything or include.fields then
        snapshot.fields = self.cachedFields
    end
    if everything or include.productions then
        snapshot.productions = self.cachedProductions
    end
    if everything or include.animals then
        snapshot.animals = self.cachedAnimals
    end
    return snapshot
end
