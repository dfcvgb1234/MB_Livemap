-- Whitelisted vehicle commands from the tablet dashboard.

CommandHandler = {}
CommandHandler.__index = CommandHandler

local ALLOWED = {
    ["engine.start"] = true,
    ["engine.stop"] = true,
    ["attach"] = true,
    ["detach"] = true,
    ["autodrive.start"] = true,
    ["autodrive.stop"] = true,
    ["courseplay.start"] = true,
    ["courseplay.stop"] = true,
}

local FILL_NAME_CANDIDATES = {
    corn = { "MAIZE", "CORN" },
    redbeet = { "BEETROOT", "REDBEET" },
    grass = { "GRASS_WINDROW", "GRASS" },
}

local function compactName(value)
    return string.lower((tostring(value):gsub("[^%w]", "")))
end

local function fillTypeIndexFromFruit(name)
    if type(name) ~= "string" or name == "" then
        return nil
    end
    local numeric = tonumber(name)
    if numeric ~= nil and numeric > 0 then
        return numeric
    end
    local key = compactName(name)
    local candidates = FILL_NAME_CANDIDATES[key] or { string.upper(name) }
    if g_fillTypeManager ~= nil and g_fillTypeManager.getFillTypeIndexByName ~= nil then
        for _, fillName in ipairs(candidates) do
            local index = g_fillTypeManager:getFillTypeIndexByName(fillName)
            if type(index) == "number" and index > 0 and (FillType == nil or index ~= FillType.UNKNOWN) then
                return index
            end
        end
    end
    if g_fillTypeManager ~= nil and type(g_fillTypeManager.fillTypes) == "table" then
        local wanted = {}
        for _, fillName in ipairs(candidates) do
            wanted[compactName(fillName)] = true
        end
        wanted[key] = true
        for _, fillType in pairs(g_fillTypeManager.fillTypes) do
            if type(fillType) == "table" and type(fillType.name) == "string" and wanted[compactName(fillType.name)] and type(fillType.index) == "number" and fillType.index > 0 then
                return fillType.index
            end
        end
    end
    return nil
end

local function findVehicleById(vehicleId)
    if vehicleId == nil then
        return nil
    end
    local list = nil
    if g_currentMission ~= nil then
        if g_currentMission.vehicleSystem ~= nil then
            list = g_currentMission.vehicleSystem.vehicles
        else
            list = g_currentMission.vehicles
        end
    end
    if type(list) ~= "table" then
        return nil
    end
    local want = tostring(vehicleId)
    for _, vehicle in pairs(list) do
        local id = nil
        if vehicle.id ~= nil then
            id = tostring(vehicle.id)
        elseif vehicle.rootNode ~= nil then
            id = tostring(vehicle.rootNode)
        end
        if id == want then
            return vehicle
        end
    end
    return nil
end

function CommandHandler.new()
    return setmetatable({}, CommandHandler)
end

local function localPlayer()
    if g_localPlayer ~= nil then
        return g_localPlayer
    end
    if g_currentMission ~= nil and g_currentMission.playerSystem ~= nil and g_currentMission.playerSystem.getLocalPlayer ~= nil then
        return g_currentMission.playerSystem:getLocalPlayer()
    end
    return nil
end

local function isHostedMultiplayer()
    if g_dedicatedServer ~= nil or g_dedicatedServerInfo ~= nil then
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

local function rawOwnerFarmId(vehicle)
    if vehicle ~= nil and vehicle.getOwnerFarmId ~= nil then
        local ok, id = pcall(function()
            return vehicle:getOwnerFarmId()
        end)
        if ok and type(id) == "number" then
            return id
        end
    end
    if vehicle ~= nil and type(vehicle.ownerFarmId) == "number" then
        return vehicle.ownerFarmId
    end
    return nil
end

local function commandFarmId()
    local player = localPlayer()
    if player ~= nil and player.getFarmId ~= nil then
        local ok, id = pcall(function()
            return player:getFarmId()
        end)
        if ok and type(id) == "number" and id > 0 then
            return id
        end
    end
    return nil
end

local function ownerFarmId(vehicle)
    local farmId = nil
    if vehicle.getOwnerFarmId ~= nil then
        farmId = vehicle:getOwnerFarmId()
    end
    if type(farmId) ~= "number" or farmId <= 0 then
        local player = localPlayer()
        if player ~= nil and player.getFarmId ~= nil then
            farmId = player:getFarmId()
        end
    end
    if type(farmId) == "number" and farmId > 0 then
        return farmId
    end
    return nil
end

-- Vehicles the player is not sitting in are skipped by the game update.
-- AutoDrive itself kicks onUpdate when the driver presses start; do the same here.
local function wakeVehicle(vehicle, keepActive)
    if keepActive ~= false then
        vehicle.forceIsActive = true
        if vehicle.spec_motorized ~= nil then
            vehicle.spec_motorized.stopMotorOnLeave = false
        end
        if vehicle.spec_enterable ~= nil then
            vehicle.spec_enterable.disableCharacterOnLeave = false
        end
    end
    if vehicle.raiseActive ~= nil then
        pcall(function()
            vehicle:raiseActive()
        end)
    end
    if SpecializationUtil ~= nil and SpecializationUtil.raiseEvent ~= nil then
        pcall(function()
            SpecializationUtil.raiseEvent(vehicle, "onUpdate", 16, false, false, false)
        end)
    end
end

local function claimVehicle(vehicle)
    if vehicle.ad == nil or vehicle.ad.stateModule == nil or vehicle.ad.stateModule.setActualFarmId == nil then
        return
    end
    local farmId = ownerFarmId(vehicle)
    if farmId ~= nil then
        vehicle.ad.stateModule:setActualFarmId(farmId)
    end
end

local function enterVehicle(vehicle)
    local player = localPlayer()
    if player == nil or player.requestToEnterVehicle == nil then
        return
    end
    local current = g_currentMission ~= nil and g_currentMission.controlledVehicle or nil
    if current == vehicle then
        return
    end

    local function requestEnter()
        local again = localPlayer()
        if again ~= nil and again.requestToEnterVehicle ~= nil then
            pcall(function()
                again:requestToEnterVehicle(vehicle)
            end)
        end
    end

    if current ~= nil and player.requestToLeaveVehicle ~= nil then
        pcall(function()
            player:requestToLeaveVehicle()
        end)
        if g_currentMission ~= nil and g_currentMission.addUpdateable ~= nil then
            local tick = {}
            function tick:update()
                g_currentMission:removeUpdateable(self)
                requestEnter()
            end
            g_currentMission:addUpdateable(tick)
            return
        end
    end
    requestEnter()
end

function CommandHandler:handle(cmd)
    if type(cmd) ~= "table" or cmd.type ~= "command" then
        return { type = "commandResult", id = cmd and cmd.id or "unknown", ok = false, error = "Invalid command" }
    end

    local id = cmd.id or "unknown"
    local action = cmd.action
    if not ALLOWED[action] then
        return { type = "commandResult", id = id, ok = false, error = "Unsupported action: " .. tostring(action) }
    end

    local vehicle = findVehicleById(cmd.vehicleId)
    if vehicle == nil then
        return { type = "commandResult", id = id, ok = false, error = "Vehicle not found" }
    end

    if isHostedMultiplayer() then
        local owner = rawOwnerFarmId(vehicle)
        local mine = commandFarmId()
        if type(owner) ~= "number" or owner <= 0 or mine == nil or owner ~= mine then
            return { type = "commandResult", id = id, ok = false, error = "Vehicle is not on your farm" }
        end
    end

    local ok, err = pcall(function()
        claimVehicle(vehicle)
        if action == "engine.start" then
            if vehicle.startMotor ~= nil then
                vehicle:startMotor()
            elseif vehicle.spec_motorized ~= nil and vehicle.setIsMotorStarted ~= nil then
                vehicle:setIsMotorStarted(true)
            else
                error("engine.start API unavailable")
            end
        elseif action == "engine.stop" then
            if vehicle.stopMotor ~= nil then
                vehicle:stopMotor()
            elseif vehicle.setIsMotorStarted ~= nil then
                vehicle:setIsMotorStarted(false)
            else
                error("engine.stop API unavailable")
            end
        elseif action == "attach" then
            -- Attach requires a nearby implement; API surface varies by FS25 build.
            if vehicle.attachImplement ~= nil and cmd.targetId ~= nil then
                local target = findVehicleById(cmd.targetId)
                if target == nil then
                    error("Attach target not found")
                end
                vehicle:attachImplement(target)
            else
                error("attach unsupported or missing targetId")
            end
        elseif action == "autodrive.start" then
            local autoDrive, graph = AutoDriveSync.resolve()
            if autoDrive == nil or graph == nil or autoDrive.StartDriving == nil then
                error("AutoDrive is not loaded")
            end
            if vehicle.ad == nil or vehicle.ad.stateModule == nil then
                error("Vehicle does not support AutoDrive")
            end
            if vehicle.ad.stateModule.isActive ~= nil and vehicle.ad.stateModule:isActive() then
                error("AutoDrive is already running")
            end

            local modeName = cmd.mode
            if modeName == nil or modeName == "" then
                modeName = "drive"
            end
            if modeName == "fieldwork" then
                if CourseplaySync == nil or CourseplaySync.startFieldwork == nil then
                    error("Courseplay is not loaded")
                end
                CourseplaySync.startFieldwork(vehicle, cmd.targetId, tonumber(cmd.cpLane), cmd.cpStart)
            else
            local modeNumber = nil
            local needsSecond = false
            local needsFill = false
            if modeName == "drive" then
                modeNumber = autoDrive.MODE_DRIVETO
            elseif modeName == "pickup" then
                modeNumber = autoDrive.MODE_PICKUPANDDELIVER
                needsSecond = true
                needsFill = true
            elseif modeName == "deliver" then
                modeNumber = autoDrive.MODE_DELIVERTO
            elseif modeName == "load" then
                modeNumber = autoDrive.MODE_LOAD
                needsSecond = true
                needsFill = true
            elseif modeName == "unload" then
                modeNumber = autoDrive.MODE_UNLOAD
                needsSecond = true
            else
                error("Unknown AutoDrive mode")
            end
            if modeNumber == nil then
                error("AutoDrive mode is not available")
            end

            local firstId = tonumber(cmd.targetId)
            if firstId == nil or graph:getMapMarkerById(firstId) == nil then
                error("Unknown destination")
            end
            local secondId = firstId
            if needsSecond then
                secondId = tonumber(cmd.secondTargetId)
                if secondId == nil or graph:getMapMarkerById(secondId) == nil then
                    error("Unknown second destination")
                end
            end

            if vehicle.ad.stateModule.setMode ~= nil then
                vehicle.ad.stateModule:setMode(modeNumber)
                if vehicle.ad.stateModule.getMode ~= nil and vehicle.ad.stateModule:getMode() ~= modeNumber then
                    error("AutoDrive could not switch mode")
                end
            end

            if needsFill then
                local fillIndex = fillTypeIndexFromFruit(cmd.fillType)
                if fillIndex == nil or fillIndex <= 0 then
                    error("Choose a fruit type")
                end
                if vehicle.ad.stateModule.setFillType == nil then
                    error("Fruit type is not available")
                end
                vehicle.ad.stateModule:setFillType(fillIndex)
                if vehicle.ad.stateModule.getFillType ~= nil and vehicle.ad.stateModule:getFillType() ~= fillIndex then
                    error("Fruit type is not supported by this vehicle")
                end
            end

            autoDrive:StartDriving(vehicle, firstId, secondId, nil, nil, nil)
            if vehicle.ad.stateModule.isActive ~= nil and not vehicle.ad.stateModule:isActive() then
                error("AutoDrive did not start")
            end
            end
        elseif action == "autodrive.stop" then
            if CourseplaySync ~= nil and CourseplaySync.cancelHandoff ~= nil then
                local stopId = vehicle.id
                if stopId == nil and vehicle.rootNode ~= nil then
                    stopId = vehicle.rootNode
                end
                CourseplaySync.cancelHandoff(stopId)
            end
            if vehicle.stopAutoDrive == nil then
                error("AutoDrive is not available on this vehicle")
            end
            vehicle:stopAutoDrive()
        elseif action == "courseplay.start" then
            if CourseplaySync == nil or CourseplaySync.startCourse == nil then
                error("Courseplay is not loaded")
            end
            CourseplaySync.startCourse(vehicle, cmd.targetId, cmd.cpStart, tonumber(cmd.cpLane))
        elseif action == "courseplay.stop" then
            if CourseplaySync == nil or CourseplaySync.stop == nil then
                error("Courseplay is not loaded")
            end
            CourseplaySync.stop(vehicle)
        elseif action == "detach" then
            if vehicle.detachImplement ~= nil then
                -- Detach first implement when index API is present.
                local implements = vehicle.getAttachedImplements and vehicle:getAttachedImplements() or nil
                if type(implements) == "table" and implements[1] ~= nil then
                    local joint = implements[1].jointDescIndex or 1
                    vehicle:detachImplement(joint)
                else
                    error("No attached implement to detach")
                end
            else
                error("detach API unavailable")
            end
        end
        wakeVehicle(vehicle, action ~= "engine.stop" and action ~= "autodrive.stop" and action ~= "courseplay.stop")
        enterVehicle(vehicle)
    end)

    if ok then
        return { type = "commandResult", id = id, ok = true }
    end
    return { type = "commandResult", id = id, ok = false, error = tostring(err) }
end
