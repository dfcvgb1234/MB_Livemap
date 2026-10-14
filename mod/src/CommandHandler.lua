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

    local ok, err = pcall(function()
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
        elseif action == "autodrive.stop" then
            if vehicle.stopAutoDrive == nil then
                error("AutoDrive is not available on this vehicle")
            end
            vehicle:stopAutoDrive()
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
    end)

    if ok then
        return { type = "commandResult", id = id, ok = true }
    end
    return { type = "commandResult", id = id, ok = false, error = tostring(err) }
end
