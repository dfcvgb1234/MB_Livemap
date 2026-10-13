-- Non-blocking reconnecting TCP client for FS25 Lua.
-- Uses LuaSocket when available (common in Giants mods via package.loadlib / socket).
-- Falls back to a no-op stub that logs connection attempts so the game never stalls.

TcpClient = {}
TcpClient.__index = TcpClient

local HOST = "127.0.0.1"
local PORT = 18765
local RECONNECT_INTERVAL_MS = 3000

local function tryRequireSocket()
    local ok, sock = pcall(function()
        return require("socket")
    end)
    if ok and sock ~= nil then
        return sock
    end
    return nil
end

function TcpClient.new(host, port)
    local self = setmetatable({}, TcpClient)
    self.host = host or HOST
    self.port = port or PORT
    self.socketLib = tryRequireSocket()
    self.sock = nil
    self.connected = false
    self.lastAttempt = 0
    self.recvBuffer = ""
    self.onLine = nil
    self.warnedMissing = false
    return self
end

function TcpClient:isConnected()
    return self.connected and self.sock ~= nil
end

function TcpClient:connect()
    local now = g_time or (os.clock() * 1000)
    if now - self.lastAttempt < RECONNECT_INTERVAL_MS then
        return false
    end
    self.lastAttempt = now

    if self.socketLib == nil then
        if not self.warnedMissing then
            Logging.warning("[MB Livemap] LuaSocket not available — TCP bridge disabled. Install/enable socket or run the mock bridge for UI testing.")
            self.warnedMissing = true
        end
        return false
    end

    local tcp = self.socketLib.tcp()
    if tcp == nil then
        return false
    end
    tcp:settimeout(0)
    local ok, err = tcp:connect(self.host, self.port)
    -- Non-blocking connect may return "timeout" while in progress; treat as pending success.
    if not ok and err ~= "timeout" and err ~= "Operation already in progress" then
        tcp:close()
        return false
    end

    self.sock = tcp
    self.connected = true
    self.recvBuffer = ""
    Logging.info("[MB Livemap] TCP connecting to %s:%d", self.host, self.port)
    self:sendLine(Json.encode({ type = "hello", client = "mod" }))
    return true
end

function TcpClient:disconnect()
    if self.sock ~= nil then
        pcall(function()
            self.sock:close()
        end)
    end
    self.sock = nil
    self.connected = false
    self.recvBuffer = ""
end

function TcpClient:sendLine(line)
    if not self:isConnected() then
        return false
    end
    if string.sub(line, -1) ~= "\n" then
        line = line .. "\n"
    end
    local ok, err, partial = self.sock:send(line)
    if not ok and err == "closed" then
        self:disconnect()
        return false
    end
    return ok ~= nil or partial ~= nil
end

function TcpClient:update()
    if not self:isConnected() then
        self:connect()
        return
    end

    -- Drain readable data without blocking.
    while true do
        local data, err, partial = self.sock:receive(2048)
        if data then
            self.recvBuffer = self.recvBuffer .. data
        elseif partial and partial ~= "" then
            self.recvBuffer = self.recvBuffer .. partial
        end

        if err == "closed" then
            Logging.info("[MB Livemap] TCP disconnected")
            self:disconnect()
            return
        end

        if err == "timeout" or data == nil then
            break
        end
    end

    while true do
        local idx = string.find(self.recvBuffer, "\n", 1, true)
        if idx == nil then
            break
        end
        local line = string.sub(self.recvBuffer, 1, idx - 1)
        self.recvBuffer = string.sub(self.recvBuffer, idx + 1)
        if self.onLine ~= nil and line ~= "" then
            self.onLine(line)
        end
    end
end
