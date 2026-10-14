-- Orchestrates TCP connection, state snapshots, and command handling.

LivemapBridge = {}
LivemapBridge.__index = LivemapBridge

local VEHICLE_INTERVAL_MS = 400 -- ~2.5 Hz
local SLOW_INTERVAL_MS = 5000
local AD_INTERVAL_MS = 2000

function LivemapBridge.new()
    local self = setmetatable({}, LivemapBridge)
    self.tcp = TcpClient.new("0.0.0.0", 18765)
    self.collector = StateCollector.new()
    self.autoDrive = AutoDriveSync.new()
    self.courseplay = CourseplaySync.new()
    self.commands = CommandHandler.new()
    self.vehicleAccum = 0
    self.slowAccum = SLOW_INTERVAL_MS -- force immediate slow refresh
    self.adAccum = 0
    self.wasConnected = false
    self.running = false
    self.updateFn = nil

    local bridge = self
    self.tcp.onLine = function(line)
        bridge:onLine(line)
    end
    return self
end

function LivemapBridge:start()
    if self.running then
        return
    end
    self.running = true
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

function LivemapBridge:sendCourseplay(force)
    if not self.tcp:isConnected() or self.courseplay == nil then
        return
    end
    local message = self.courseplay:collectIfChanged(force)
    if message == nil then
        return
    end
    if not self.tcp:sendLine(Json.encode(message)) then
        self.courseplay:invalidate()
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

function LivemapBridge:update(dt)
    self.tcp:update()
    self:flushNotifications()
    if CourseplaySync ~= nil and CourseplaySync.updateHandoffs ~= nil then
        CourseplaySync.updateHandoffs()
    end

    self.vehicleAccum = self.vehicleAccum + dt
    self.slowAccum = self.slowAccum + dt
    self.adAccum = self.adAccum + dt

    if self.slowAccum >= SLOW_INTERVAL_MS then
        self.slowAccum = 0
        self.collector:refreshSlow()
    end

    local connected = self.tcp:isConnected()
    if connected and not self.wasConnected then
        self:sendAutoDrive(true)
        self:sendCourseplay(true)
        if CourseplaySync ~= nil and CourseplaySync.installFinishHook ~= nil then
            CourseplaySync.installFinishHook()
        end
        self.adAccum = 0
    end
    self.wasConnected = connected

    if connected and self.adAccum >= AD_INTERVAL_MS then
        self.adAccum = 0
        self:sendAutoDrive(false)
        self:sendCourseplay(false)
        if CourseplaySync ~= nil and CourseplaySync.installFinishHook ~= nil then
            CourseplaySync.installFinishHook()
        end
    end

    if self.vehicleAccum >= VEHICLE_INTERVAL_MS then
        self.vehicleAccum = 0
        if self.tcp:isConnected() then
            local snap = self.collector:buildSnapshot()
            self.tcp:sendLine(Json.encode(snap))
        end
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
        self.tcp:sendLine(Json.encode(result))
    elseif msg.type == "hello" then
        Logging.info("[MB Livemap] bridge hello received")
    end
end
