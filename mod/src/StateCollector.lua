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
    self.cachedWeather = {
        condition = nil,
        temperatureC = nil,
        forecast = nil,
    }
    self.cachedProductions = {}
    self.cachedAnimals = {}
    self.mapName = nil
    self.mapSize = nil
    return self
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

    for _, vehicle in pairs(list) do
        if vehicle ~= nil and vehicle.isDeleted ~= true then
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
            safeCall(function()
                if vehicle.getAttachedImplements ~= nil then
                    local implements = vehicle:getAttachedImplements()
                    if type(implements) == "table" then
                        for _, impl in pairs(implements) do
                            local obj = impl.object or impl
                            local iname = safeCall(function()
                                if obj.getName ~= nil then
                                    return obj:getName()
                                end
                                return obj.name or vehicleId(obj)
                            end, "Implement")
                            attached[#attached + 1] = iname
                        end
                    end
                end
            end, nil)

            if okPos then
                vehicles[#vehicles + 1] = {
                    id = vehicleId(vehicle),
                    name = name or "Vehicle",
                    type = vType,
                    x = x,
                    z = z,
                    heading = heading,
                    speed = speed or 0,
                    engineOn = engineOn and true or false,
                    attached = attached,
                }
            end
        end
    end

    return vehicles
end

function StateCollector:collectWeather()
    local weather = {
        condition = nil,
        temperatureC = nil,
        forecast = nil,
    }

    safeCall(function()
        local w = g_currentMission and g_currentMission.environment and g_currentMission.environment.weather
        if w == nil then
            return
        end
        if w.getCurrentWeatherState ~= nil then
            weather.condition = tostring(w:getCurrentWeatherState())
        elseif w.currentWeatherType ~= nil then
            weather.condition = tostring(w.currentWeatherType)
        end
        if w.getCurrentTemperature ~= nil then
            weather.temperatureC = w:getCurrentTemperature()
        elseif w.temperature ~= nil then
            weather.temperatureC = w.temperature
        end
        -- Forecast API varies by build; leave null when unavailable.
        if w.getForecast ~= nil then
            local forecast = w:getForecast()
            if type(forecast) == "table" then
                weather.forecast = {}
                for i, entry in ipairs(forecast) do
                    weather.forecast[i] = {
                        day = entry.dayName or entry.name or tostring(i),
                        condition = entry.weatherType and tostring(entry.weatherType) or nil,
                        tempMinC = entry.minTemp or entry.tempMin or nil,
                        tempMaxC = entry.maxTemp or entry.tempMax or nil,
                    }
                end
            end
        end
    end, nil)

    return weather
end

function StateCollector:collectFields()
    local fields = {}
    safeCall(function()
        local fieldSystem = g_fieldManager or (g_farmlandManager and g_farmlandManager)
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
            local growthState = nil
            local growthMax = nil
            local owned = nil
            local fx, fz = nil, nil
            local polygon = nil

            safeCall(function()
                if field.fruitType ~= nil then
                    fruitType = tostring(field.fruitType)
                elseif field.getFieldFruitType ~= nil then
                    fruitType = tostring(field:getFieldFruitType())
                end
                if field.growthState ~= nil then
                    growthState = field.growthState
                end
                if field.maxGrowthState ~= nil then
                    growthMax = field.maxGrowthState
                end
                if field.farmlandId ~= nil and g_farmlandManager ~= nil then
                    local farmland = g_farmlandManager:getFarmlandById(field.farmlandId)
                    if farmland ~= nil then
                        owned = farmland.farmId ~= nil and farmland.farmId > 0
                    end
                end
                if field.getCenterOfFieldWorldPos ~= nil then
                    fx, _, fz = field:getCenterOfFieldWorldPos()
                elseif field.posX ~= nil then
                    fx, fz = field.posX, field.posZ
                end
                -- Dense field polygons are expensive; leave null unless a lightweight API exists.
                polygon = nil
            end, nil)

            fields[#fields + 1] = {
                id = tostring(field.fieldId or id),
                fruitType = fruitType,
                growthState = growthState,
                growthMax = growthMax,
                owned = owned,
                x = fx,
                z = fz,
                polygon = polygon,
            }
        end
    end, nil)
    return fields
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
            if spec ~= nil then
                local name = safeCall(function()
                    if placeable.getName ~= nil then
                        return placeable:getName()
                    end
                    return placeable.name or "Production"
                end, "Production")

                local status = "unknown"
                if spec.isOwned ~= nil then
                    status = spec.isOwned and "active" or "unowned"
                end

                local inputs, outputs = {}, {}
                local function collectFills(list, dest)
                    if type(list) ~= "table" then
                        return
                    end
                    for fillName, fill in pairs(list) do
                        dest[#dest + 1] = {
                            name = tostring(fillName),
                            fillLevel = fill.fillLevel or fill.level or nil,
                            capacity = fill.capacity or fill.maxLevel or nil,
                        }
                    end
                end

                collectFills(spec.inputFillLevels or spec.inputs, inputs)
                collectFills(spec.outputFillLevels or spec.outputs, outputs)

                productions[#productions + 1] = {
                    id = tostring(placeable.id or placeable.rootNode or name),
                    name = name,
                    status = status,
                    inputs = inputs,
                    outputs = outputs,
                }
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
            local husbandry = placeable and (placeable.spec_husbandryAnimals or placeable.spec_livestock)
            if husbandry ~= nil then
                local name = safeCall(function()
                    if placeable.getName ~= nil then
                        return placeable:getName()
                    end
                    return placeable.name or "Husbandry"
                end, "Husbandry")

                local count = safeCall(function()
                    if husbandry.getNumOfAnimals ~= nil then
                        return husbandry:getNumOfAnimals()
                    end
                    return husbandry.numAnimals
                end, nil)

                local animalType = safeCall(function()
                    return husbandry.animalTypeName or husbandry.animalType or nil
                end, nil)

                local health = safeCall(function()
                    return husbandry.avgHealth or husbandry.health or nil
                end, nil)

                local productivity = safeCall(function()
                    return husbandry.productivity or husbandry.avgProductivity or nil
                end, nil)

                local x, z = nil, nil
                pcall(function()
                    if placeable.rootNode ~= nil then
                        x, _, z = getWorldTranslation(placeable.rootNode)
                    end
                end)

                animals[#animals + 1] = {
                    id = tostring(placeable.id or placeable.rootNode or name),
                    name = name,
                    animalType = animalType and tostring(animalType) or nil,
                    count = count,
                    health = health,
                    productivity = productivity,
                    x = x,
                    z = z,
                }
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
end

function StateCollector:buildSnapshot()
    return {
        type = "state",
        ts = math.floor((g_time or (os.clock() * 1000))),
        source = "mod",
        mapName = self.mapName,
        mapSize = self.mapSize,
        vehicles = self:collectVehicles(),
        weather = self.cachedWeather,
        fields = self.cachedFields,
        productions = self.cachedProductions,
        animals = self.cachedAnimals,
    }
end
