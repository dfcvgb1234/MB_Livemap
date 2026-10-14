-- Forwards AutoDrive messages (arrived, stuck, path problems) to the livemap bridge.
-- Hooks the two send functions every in-game alert passes through, before localization,
-- so the kind stays tied to the translation key.

AutoDriveNotify = {}

local queue = {}
local installed = false
local nextId = 0
local MAX_QUEUE = 32

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
    return nil
end

local function vehicleName(vehicle)
    if vehicle == nil then
        return nil
    end
    local ok, name = pcall(function()
        if vehicle.ad ~= nil and vehicle.ad.stateModule ~= nil and vehicle.ad.stateModule.getName ~= nil then
            return vehicle.ad.stateModule:getName()
        end
        if vehicle.getName ~= nil then
            return vehicle:getName()
        end
        return vehicle.name
    end)
    if ok and type(name) == "string" and name ~= "" then
        return name
    end
    return nil
end

local function nowMs()
    local ok, seconds = pcall(function()
        return os.time()
    end)
    if ok and type(seconds) == "number" then
        return seconds * 1000
    end
    return 0
end

local function classify(text, messageType)
    if type(text) == "string" then
        if string.find(text, "AD_got_stuck", 1, true) ~= nil then
            return "stuck"
        end
        if string.find(text, "AD_has_reached", 1, true) ~= nil then
            return "arrived"
        end
    end
    if messageType == 2 or messageType == 3 then
        return "problem"
    end
    return "info"
end

local function levelOf(messageType, kind)
    if messageType == 3 or kind == "stuck" then
        return "error"
    end
    if messageType == 2 or kind == "problem" then
        return "warn"
    end
    return "info"
end

local function localize(autoDrive, text)
    if type(text) ~= "string" then
        return ""
    end
    if autoDrive ~= nil and type(autoDrive.localize) == "function" then
        local ok, result = pcall(autoDrive.localize, text)
        if ok and type(result) == "string" and result ~= "" then
            return result
        end
    end
    return text
end

local function enqueue(item)
    queue[#queue + 1] = item
    while #queue > MAX_QUEUE do
        table.remove(queue, 1)
    end
end

local function capture(autoDrive, vehicle, messageType, text, args)
    if type(text) ~= "string" or text == "" then
        return
    end
    local display = localize(autoDrive, text)
    if type(args) == "table" and #args > 0 then
        local ok, formatted = pcall(string.format, display, unpack(args))
        if ok and type(formatted) == "string" and formatted ~= "" then
            display = formatted
        end
    end
    local kind = classify(text, messageType)
    nextId = nextId + 1
    local item = {
        type = "notification",
        id = "ad-" .. tostring(nextId),
        kind = kind,
        level = levelOf(messageType, kind),
        text = display,
        ts = nowMs(),
    }
    local id = vehicleId(vehicle)
    if id ~= nil then
        item.vehicleId = id
    end
    local name = vehicleName(vehicle)
    if name ~= nil then
        item.vehicleName = name
    end
    enqueue(item)
end

function AutoDriveNotify.install(env)
    if installed or type(env) ~= "table" then
        return
    end
    local event = env.AutoDriveMessageEvent
    if type(event) ~= "table" or type(event.sendNotification) ~= "function" or type(event.sendMessage) ~= "function" then
        return
    end

    local autoDrive = env.AutoDrive
    local originalNotify = event.sendNotification
    local originalMessage = event.sendMessage

    local function wrap(original)
        return function(vehicle, messageType, text, duration, ...)
            local args = { ... }
            local ok, err = pcall(capture, autoDrive, vehicle, messageType, text, args)
            if not ok then
                Logging.warning("[MB Livemap] AutoDrive notification capture failed: %s", tostring(err))
            end
            return original(vehicle, messageType, text, duration, unpack(args))
        end
    end

    event.sendNotification = wrap(originalNotify)
    event.sendMessage = wrap(originalMessage)
    installed = true
    Logging.info("[MB Livemap] AutoDrive notifications hooked")
end

function AutoDriveNotify.drain()
    if #queue == 0 then
        return nil
    end
    local items = queue
    queue = {}
    return items
end

function AutoDriveNotify.unshift(item)
    table.insert(queue, 1, item)
    while #queue > MAX_QUEUE do
        table.remove(queue)
    end
end
