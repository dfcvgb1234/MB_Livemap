-- Orchestrates TCP connection, state snapshots, and command handling.

LivemapBridge = {}
LivemapBridge.__index = LivemapBridge

local VEHICLE_INTERVAL_MS = 400 -- ~2.5 Hz
local SLOW_INTERVAL_MS = 5000

function LivemapBridge.new()
    local self = setmetatable({}, LivemapBridge)
    self.tcp = TcpClient.new("127.0.0.1", 18765)
    self.collector = StateCollector.new()
    self.commands = CommandHandler.new()
    self.vehicleAccum = 0
    self.slowAccum = SLOW_INTERVAL_MS -- force immediate slow refresh
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

function LivemapBridge:update(dt)
    self.tcp:update()

    self.vehicleAccum = self.vehicleAccum + dt
    self.slowAccum = self.slowAccum + dt

    if self.slowAccum >= SLOW_INTERVAL_MS then
        self.slowAccum = 0
        self.collector:refreshSlow()
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
