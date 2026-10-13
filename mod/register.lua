-- MB Livemap Bridge — FS25 entry point
-- Loads source modules and starts the livemap specialisation.

local modDirectory = g_currentModDirectory or ""
local modName = g_currentModName or "FS25_MB_Livemap"

source(modDirectory .. "src/Json.lua")
source(modDirectory .. "src/TcpClient.lua")
source(modDirectory .. "src/StateCollector.lua")
source(modDirectory .. "src/CommandHandler.lua")
source(modDirectory .. "src/LivemapBridge.lua")

local function onMissionStarted()
    if g_livemapBridge == nil then
        g_livemapBridge = LivemapBridge.new()
        g_livemapBridge:start()
        Logging.info("[%s] Livemap bridge started", modName)
    end
end

local function onMissionEnded()
    if g_livemapBridge ~= nil then
        g_livemapBridge:stop()
        g_livemapBridge = nil
        Logging.info("[%s] Livemap bridge stopped", modName)
    end
end

FSBaseMission.onStartMission = Utils.appendedFunction(FSBaseMission.onStartMission, onMissionStarted)
FSBaseMission.delete = Utils.appendedFunction(FSBaseMission.delete, onMissionEnded)
