-- Whitelisted vehicle commands from the tablet dashboard.

CommandHandler = {}
CommandHandler.__index = CommandHandler

local ALLOWED = {
    ["engine.start"] = true,
    ["engine.stop"] = true,
    ["attach"] = true,
    ["detach"] = true,
}

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
