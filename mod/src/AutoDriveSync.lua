-- Reads the AutoDrive route network and emits it when the graph changes.
-- The full network stays off the 2.5 Hz vehicle snapshot.

AutoDriveSync = {}
AutoDriveSync.__index = AutoDriveSync

-- FS25 gives every mod its own Lua environment, so AutoDrive and ADGraphManager are not globals
-- here. ADFlyover finds the specialization on the vehicle type's onDrawUIInfo listeners, then
-- getfenv() of a function defined inside AutoDrive to reach that mod's environment.
local resolvedAutoDrive = nil
local resolvedGraph = nil
local loggedResolve = false

local function looksLikeAutoDrive(spec)
    return type(spec) == "table"
        and type(spec.onDrawEditorMode) == "function"
        and type(spec.onDrawUIInfo) == "function"
        and type(spec.isEditorShowEnabled) == "function"
end

function AutoDriveSync.resolve()
    if resolvedAutoDrive ~= nil and resolvedGraph ~= nil then
        return resolvedAutoDrive, resolvedGraph
    end

    if AutoDrive ~= nil and ADGraphManager ~= nil and ADGraphManager.getWayPoints ~= nil then
        resolvedAutoDrive = AutoDrive
        resolvedGraph = ADGraphManager
    else
        local types = g_vehicleTypeManager ~= nil and g_vehicleTypeManager.types or nil
        if type(types) == "table" then
            for _, typeDef in pairs(types) do
                local listeners = typeDef.eventListeners ~= nil and typeDef.eventListeners.onDrawUIInfo or nil
                if type(listeners) == "table" then
                    for _, spec in pairs(listeners) do
                        if looksLikeAutoDrive(spec) and getfenv ~= nil then
                            local ok, env = pcall(getfenv, spec.onDrawEditorMode)
                            if ok and type(env) == "table" and env.ADGraphManager ~= nil then
                                resolvedAutoDrive = env.AutoDrive or spec
                                resolvedGraph = env.ADGraphManager
                                break
                            end
                        end
                    end
                end
                if resolvedGraph ~= nil then
                    break
                end
            end
        end
    end

    if resolvedGraph ~= nil and not loggedResolve then
        loggedResolve = true
        Logging.info("[MB Livemap] AutoDrive network found")
    end
    return resolvedAutoDrive, resolvedGraph
end

function AutoDriveSync.new()
    local self = setmetatable({}, AutoDriveSync)
    self.fingerprint = nil
    self.revision = 0
    self.warned = false
    return self
end

function AutoDriveSync:invalidate()
    self.fingerprint = nil
end

function AutoDriveSync:isAvailable()
    local _, graph = AutoDriveSync.resolve()
    return graph ~= nil and graph.getWayPoints ~= nil and graph.getMapMarkers ~= nil
end

local function copyOut(out)
    local ids = {}
    if type(out) ~= "table" then
        return ids
    end
    for _, id in pairs(out) do
        if type(id) == "number" then
            ids[#ids + 1] = id
        end
    end
    return ids
end

function AutoDriveSync:fingerprintOf()
    local _, graph = AutoDriveSync.resolve()
    if graph == nil or graph.getWayPoints == nil or graph.getMapMarkers == nil then
        return "unavailable"
    end

    local count = 0
    local sum = 0
    local waypoints = graph:getWayPoints()
    if type(waypoints) == "table" then
        for _, wp in pairs(waypoints) do
            if type(wp) == "table" and type(wp.x) == "number" and type(wp.z) == "number" then
                count = count + 1
                sum = sum + wp.x + wp.z
                if type(wp.out) == "table" then
                    for _, id in pairs(wp.out) do
                        if type(id) == "number" then
                            sum = sum + id
                        end
                    end
                end
            end
        end
    end

    local names = {}
    local markers = graph:getMapMarkers()
    if type(markers) == "table" then
        for index, marker in pairs(markers) do
            if type(marker) == "table" and marker.isADDebug ~= true then
                names[#names + 1] = tostring(index)
                    .. ":"
                    .. tostring(marker.name)
                    .. ":"
                    .. tostring(marker.id)
            end
        end
    end
    table.sort(names)
    return tostring(count) .. "|" .. string.format("%.3f", sum) .. "|" .. table.concat(names, ",")
end

function AutoDriveSync:buildMessage()
    local _, graph = AutoDriveSync.resolve()
    if graph == nil or graph.getWayPoints == nil or graph.getMapMarkers == nil then
        return { type = "autodrive", available = false }
    end

    local waypoints = {}
    local points = graph:getWayPoints()
    if type(points) == "table" then
        for _, wp in pairs(points) do
            if type(wp) == "table" and type(wp.id) == "number" and type(wp.x) == "number" and type(wp.z) == "number" then
                waypoints[#waypoints + 1] = {
                    id = wp.id,
                    x = wp.x,
                    z = wp.z,
                    out = copyOut(wp.out),
                }
            end
        end
    end

    local markers = {}
    local mapMarkers = graph:getMapMarkers()
    if type(mapMarkers) == "table" then
        for index, marker in pairs(mapMarkers) do
            if type(marker) == "table" and marker.isADDebug ~= true and type(marker.name) == "string" then
                local point = nil
                if marker.id ~= nil and graph.getWayPointById ~= nil then
                    point = graph:getWayPointById(marker.id)
                end
                if type(point) == "table" and type(point.x) == "number" and type(point.z) == "number" then
                    markers[#markers + 1] = {
                        id = marker.markerIndex or index,
                        name = marker.name,
                        x = point.x,
                        z = point.z,
                    }
                end
            end
        end
    end

    self.revision = self.revision + 1
    return {
        type = "autodrive",
        available = true,
        revision = self.revision,
        waypoints = waypoints,
        markers = markers,
    }
end

function AutoDriveSync:collectIfChanged(force)
    local ok, message = pcall(function()
        local fingerprint = self:fingerprintOf()
        if not force and fingerprint == self.fingerprint then
            return nil
        end
        self.fingerprint = fingerprint
        return self:buildMessage()
    end)
    if not ok then
        if not self.warned then
            self.warned = true
            Logging.warning("[MB Livemap] AutoDrive graph read failed: %s", tostring(message))
        end
        self.fingerprint = nil
        return nil
    end
    self.warned = false
    return message
end
