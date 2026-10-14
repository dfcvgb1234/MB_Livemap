-- Non-blocking client for the local livemap bridge.
-- FS25's Lua sandbox cannot load LuaSocket, so Windows uses a named pipe
-- the Node server hosts. Commands come back through an XML file because the
-- sandbox can read files only via the engine XML API.

TcpClient = {}
TcpClient.__index = TcpClient

local HOST = "127.0.0.1"
local PORT = 18765
local PIPE_PATH = "\\\\.\\pipe\\mb-livemap"
local RECONNECT_INTERVAL_MS = 3000
local COMMAND_POLL_MS = 200
local SESSION_POLL_MS = 2000

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
    self.pipe = nil
    self.connected = false
    self.lastAttempt = 0
    self.recvBuffer = ""
    self.onLine = nil
    self.warnedMissing = false
    self.lastCommandId = nil
    self.lastCommandPoll = 0
    self.lastSessionPoll = 0
    self.sessionId = nil
    self.commandPath = nil
    self.sessionPath = nil
    self:initCommandFiles()
    return self
end

function TcpClient:initCommandFiles()
    if getUserProfileAppPath == nil then
        return
    end
    local ok, base = pcall(getUserProfileAppPath)
    if not ok or type(base) ~= "string" or base == "" then
        return
    end
    local tail = string.sub(base, -1)
    if tail ~= "/" and tail ~= "\\" then
        base = base .. "/"
    end
    local modName = g_currentModName or "FS25_MB_Livemap"
    local dir = base .. "modSettings/" .. modName .. "/"
    pcall(createFolder, base .. "modSettings/")
    pcall(createFolder, dir)
    self.commandPath = dir .. "commands.xml"
    self.sessionPath = dir .. "session.xml"
    if deleteFile ~= nil and fileExists ~= nil and fileExists(self.commandPath) then
        pcall(deleteFile, self.commandPath)
    end
end

function TcpClient:isConnected()
    return self.connected and (self.sock ~= nil or self.pipe ~= nil)
end

function TcpClient:connectPipe()
    local ok, handle = pcall(function()
        return io.open(PIPE_PATH, "w")
    end)
    if not ok or handle == nil then
        if not self.warnedMissing then
            Logging.warning("[MB Livemap] Livemap server pipe is not open (%s). Start it with npm run dev in the server folder, then reload the save.", PIPE_PATH)
            self.warnedMissing = true
        end
        return false
    end

    self.pipe = handle
    self.connected = true
    self.warnedMissing = false
    Logging.info("[MB Livemap] Connected to livemap server via named pipe")
    self:sendLine(Json.encode({ type = "hello", client = "mod" }))
    return true
end

function TcpClient:connect()
    local now = g_time or (os.clock() * 1000)
    if now - self.lastAttempt < RECONNECT_INTERVAL_MS then
        return false
    end
    self.lastAttempt = now

    if self.socketLib == nil then
        return self:connectPipe()
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
    if self.pipe ~= nil then
        pcall(function()
            self.pipe:close()
        end)
    end
    self.sock = nil
    self.pipe = nil
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

    if self.pipe ~= nil then
        local ok = pcall(function()
            self.pipe:write(line)
            self.pipe:flush()
        end)
        if not ok then
            self:disconnect()
            return false
        end
        return true
    end

    local ok, err, partial = self.sock:send(line)
    if not ok and err == "closed" then
        self:disconnect()
        return false
    end
    return ok ~= nil or partial ~= nil
end

function TcpClient:checkSession()
    if self.sessionPath == nil or XMLFile == nil then
        return
    end
    local now = g_time or 0
    if now - self.lastSessionPoll < SESSION_POLL_MS then
        return
    end
    self.lastSessionPoll = now

    local id = nil
    pcall(function()
        local xmlFile = XMLFile.loadIfExists("mbLivemapSession", self.sessionPath)
        if xmlFile == nil then
            return
        end
        id = xmlFile:getString("session#id")
        xmlFile:delete()
    end)
    if id == nil or id == "" then
        return
    end
    if self.sessionId == nil then
        self.sessionId = id
        return
    end
    if id ~= self.sessionId then
        Logging.info("[MB Livemap] Livemap server restarted — reconnecting pipe")
        self.sessionId = id
        self:disconnect()
        self.lastAttempt = 0
        self:connect()
    end
end

function TcpClient:pollCommand()
    if self.commandPath == nil or self.onLine == nil or XMLFile == nil then
        return
    end
    local now = g_time or 0
    if now - self.lastCommandPoll < COMMAND_POLL_MS then
        return
    end
    self.lastCommandPoll = now

    local xmlFile = nil
    local ok = pcall(function()
        xmlFile = XMLFile.loadIfExists("mbLivemapCmd", self.commandPath)
    end)
    if not ok or xmlFile == nil then
        return
    end

    local payload = nil
    pcall(function()
        local idStr = xmlFile:getString("commands#id")
        local action = xmlFile:getString("commands#action")
        local vehicleId = xmlFile:getString("commands#vehicleId")
        local targetId = xmlFile:getString("commands#targetId")
        local mode = xmlFile:getString("commands#mode")
        local secondTargetId = xmlFile:getString("commands#secondTargetId")
        local fillType = xmlFile:getString("commands#fillType")
        if idStr ~= nil and idStr ~= "" and idStr ~= self.lastCommandId and action ~= nil and vehicleId ~= nil then
            self.lastCommandId = idStr
            payload = {
                type = "command",
                id = idStr,
                action = action,
                vehicleId = vehicleId,
            }
            if targetId ~= nil and targetId ~= "" then
                payload.targetId = targetId
            end
            if mode ~= nil and mode ~= "" then
                payload.mode = mode
            end
            if secondTargetId ~= nil and secondTargetId ~= "" then
                payload.secondTargetId = secondTargetId
            end
            if fillType ~= nil and fillType ~= "" then
                payload.fillType = fillType
            end
        end
    end)
    pcall(function()
        xmlFile:delete()
    end)
    if deleteFile ~= nil then
        pcall(deleteFile, self.commandPath)
    end
    if payload ~= nil then
        self.onLine(Json.encode(payload))
    end
end

function TcpClient:updatePipe()
    self:checkSession()
    if self.pipe == nil then
        self:connect()
        return
    end
    self:pollCommand()
end

function TcpClient:update()
    if self.socketLib == nil then
        self:updatePipe()
        return
    end

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
