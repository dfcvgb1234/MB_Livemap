-- Reads Courseplay's saved courses and starts them on a vehicle.
-- Courseplay has its own Lua environment, so g_Courseplay is reached with getfenv
-- of a function defined inside that mod.

CourseplaySync = {}
CourseplaySync.__index = CourseplaySync

local TEMP_MARKER_NAME = "MB Livemap fieldwork"
local SAMPLE_STEP = 8
local HANDOFF_STOP_MS = 8000

local resolvedEnv = nil
local loggedResolve = false
local finishHooked = false
local courseSchema = nil
local handoffs = {}
-- path -> vehicle count. Cleared when a saved course file is newer than the one last sent.
local vehicleCounts = {}
local tempSerial = 0
-- Vehicles currently driving to a temporary destination, keyed by AutoDrive waypoint id.
local tempMarkerUsers = {}

local function nowMs()
    if type(g_time) == "number" then
        return g_time
    end
    return 0
end

local function vehicleKey(vehicle)
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

local function vehicleList()
    if g_currentMission == nil then
        return nil
    end
    if g_currentMission.vehicleSystem ~= nil then
        return g_currentMission.vehicleSystem.vehicles
    end
    return g_currentMission.vehicles
end

local function findVehicleById(vehicleId)
    if vehicleId == nil then
        return nil
    end
    local list = vehicleList()
    if type(list) ~= "table" then
        return nil
    end
    local want = tostring(vehicleId)
    for _, vehicle in pairs(list) do
        if vehicleKey(vehicle) == want then
            return vehicle
        end
    end
    return nil
end

local function envFromFunc(func)
    if getfenv == nil or type(func) ~= "function" then
        return nil
    end
    local ok, env = pcall(getfenv, func)
    if not ok or type(env) ~= "table" or type(env.g_Courseplay) ~= "table" then
        return nil
    end
    if env.g_Courseplay.courseStorage == nil then
        return nil
    end
    return env
end

local function searchTypes()
    local types = g_vehicleTypeManager ~= nil and g_vehicleTypeManager.types or nil
    if type(types) ~= "table" then
        return nil
    end
    for _, typeDef in pairs(types) do
        if type(typeDef) == "table" then
            if type(typeDef.functions) == "table" then
                local env = envFromFunc(typeDef.functions.appendLoadedCpCourse)
                if env ~= nil then
                    return env
                end
            end
            local listeners = typeDef.eventListeners
            if type(listeners) == "table" then
                for _, list in pairs(listeners) do
                    if type(list) == "table" then
                        for _, func in pairs(list) do
                            local env = envFromFunc(func)
                            if env ~= nil then
                                return env
                            end
                        end
                    end
                end
            end
        end
    end
    return nil
end

local function searchVehicles()
    local list = vehicleList()
    if type(list) ~= "table" then
        return nil
    end
    for _, vehicle in pairs(list) do
        if type(vehicle) == "table" then
            local env = envFromFunc(vehicle.appendLoadedCpCourse)
            if env ~= nil then
                return env
            end
        end
    end
    return nil
end

function CourseplaySync.resolve()
    if resolvedEnv ~= nil and resolvedEnv.g_Courseplay ~= nil and resolvedEnv.g_Courseplay.courseStorage ~= nil then
        return resolvedEnv
    end
    resolvedEnv = nil

    if type(g_Courseplay) == "table" and g_Courseplay.courseStorage ~= nil then
        resolvedEnv = _G
    else
        resolvedEnv = searchTypes() or searchVehicles()
    end

    if resolvedEnv ~= nil and not loggedResolve then
        loggedResolve = true
        Logging.info("[MB Livemap] Courseplay courses found")
    end
    return resolvedEnv
end

local function finishedWorkText()
    if g_i18n ~= nil and g_i18n.getText ~= nil then
        local ok, text = pcall(function()
            return g_i18n:getText("CP_infoTexts_workFinished")
        end)
        if ok and type(text) == "string" and text ~= "" and text ~= "CP_infoTexts_workFinished" then
            return text
        end
    end
    return "Finished work"
end

local function notifyCourseFinished(vehicle)
    if AutoDriveNotify == nil or AutoDriveNotify.push == nil or vehicle == nil then
        return
    end
    local name = nil
    if vehicle.getName ~= nil then
        local ok, value = pcall(function()
            return vehicle:getName()
        end)
        if ok and type(value) == "string" and value ~= "" then
            name = value
        end
    end
    AutoDriveNotify.push({
        kind = "finished",
        level = "info",
        text = finishedWorkText(),
        vehicleId = vehicleKey(vehicle),
        vehicleName = name,
    })
end

-- Courseplay raises this when a driver finishes the course, the same message as the in-game info text.
function CourseplaySync.installFinishHook()
    if finishHooked then
        return
    end
    local env = CourseplaySync.resolve()
    if env == nil or type(env.CpAIJob) ~= "table" or type(env.CpAIJob.stop) ~= "function" then
        return
    end
    local original = env.CpAIJob.stop
    env.CpAIJob.stop = function(self, aiMessage, ...)
        local finished = false
        if aiMessage ~= nil and aiMessage.isa ~= nil and AIMessageSuccessFinishedJob ~= nil then
            local ok, isFinished = pcall(function()
                return aiMessage:isa(AIMessageSuccessFinishedJob)
            end)
            finished = ok and isFinished == true
        end
        local vehicle = nil
        if finished and self ~= nil and self.vehicleParameter ~= nil and self.vehicleParameter.getVehicle ~= nil then
            pcall(function()
                vehicle = self.vehicleParameter:getVehicle()
            end)
        end
        local result = original(self, aiMessage, ...)
        if finished then
            pcall(notifyCourseFinished, vehicle)
        end
        return result
    end
    finishHooked = true
    Logging.info("[MB Livemap] Courseplay finish notifications hooked")
end

function CourseplaySync.new()
    local self = setmetatable({}, CourseplaySync)
    self.fingerprint = nil
    self.revision = 0
    self.warned = false
    return self
end

function CourseplaySync:invalidate()
    self.fingerprint = nil
end

function CourseplaySync:isAvailable()
    local env = CourseplaySync.resolve()
    return env ~= nil and env.g_Courseplay ~= nil and env.g_Courseplay.courseStorage ~= nil
end

local function displayName(fileName)
    if type(fileName) ~= "string" or fileName == "" then
        return "Course"
    end
    local lower = string.lower(fileName)
    if string.sub(lower, -4) == ".xml" then
        return string.sub(fileName, 1, -5)
    end
    return fileName
end

-- Courseplay writes course XML with no file extension (for example "F3 Harvest").
-- Older copies may still use .xml. Every file in the course tree is a course.
local function isCourseFile(fileName)
    if type(fileName) ~= "string" or fileName == "" then
        return false
    end
    if string.sub(fileName, 1, 1) == "." then
        return false
    end
    local lower = string.lower(fileName)
    if string.sub(lower, -4) == ".xml" then
        return true
    end
    return string.find(fileName, ".", 1, true) == nil
end

local function cleanFolderName(name)
    name = string.gsub(name, "<", "_")
    name = string.gsub(name, ">", "_")
    name = string.gsub(name, ":", "_")
    name = string.gsub(name, '"', "_")
    name = string.gsub(name, "/", "_")
    name = string.gsub(name, "\\", "_")
    name = string.gsub(name, "|", "_")
    name = string.gsub(name, "?", "_")
    name = string.gsub(name, "*", "_")
    return name
end

-- Courseplay stores courses for a singleplayer save under "Singleplayer",
-- and courses for a hosted game under the server name.
local function modeDirectoryName()
    local mission = g_currentMission
    local info = mission ~= nil and mission.missionDynamicInfo or nil
    if type(info) == "table" and info.isMultiplayer == true then
        local name = info.serverName
        if type(name) == "string" and name ~= "" then
            return cleanFolderName(name)
        end
        return nil
    end
    return "Singleplayer"
end

local function directoryName(directory)
    if type(directory) ~= "table" or directory.getName == nil then
        return nil
    end
    local name = directory:getName()
    if type(name) ~= "string" or name == "" then
        return nil
    end
    return name
end

local function findChildDirectory(directory, want)
    if type(directory) ~= "table" or directory.getDirectories == nil or type(want) ~= "string" then
        return nil
    end
    local children = directory:getDirectories()
    if type(children) ~= "table" then
        return nil
    end
    for _, child in ipairs(children) do
        local name = directoryName(child)
        if type(name) == "string" and string.lower(name) == string.lower(want) then
            return child
        end
    end
    return nil
end

local function childFolder(folder, directory)
    local name = nil
    if type(directory) == "table" and directory.getName ~= nil then
        name = directory:getName()
    end
    if type(name) ~= "string" or name == "" then
        return folder
    end
    if type(folder) == "string" and folder ~= "" then
        return folder .. " / " .. name
    end
    return name
end

-- Giants keeps a loaded XML document under the name it was opened with.
-- A new name each read picks up a course that was saved over the same file.
local function xmlDocumentName(prefix)
    tempSerial = tempSerial + 1
    return prefix .. tostring(nowMs()) .. "_" .. tostring(tempSerial)
end

local function clampVehicleCount(count)
    if type(count) ~= "number" or count < 1 then
        return 1
    end
    if count > 5 then
        return 5
    end
    return count
end

local function readVehicleCount(path)
    local count = nil
    if loadXMLFile == nil or getXMLInt == nil or delete == nil then
        return clampVehicleCount(count)
    end
    local handle = loadXMLFile(xmlDocumentName("mbLivemapCpVehicles"), path)
    if handle ~= nil and handle ~= 0 then
        count = getXMLInt(handle, "Courses.Course(0)#nVehicles")
        delete(handle)
    end
    return clampVehicleCount(count)
end

-- Courseplay stores the convoy size on the course. Missing or unreadable files count as one vehicle.
local function courseVehicleCount(path)
    local cached = vehicleCounts[path]
    if cached ~= nil then
        return cached
    end
    local count = readVehicleCount(path)
    vehicleCounts[path] = count
    return count
end

local function addCourses(directory, courses, folder)
    if type(directory) ~= "table" or directory.getFiles == nil then
        return
    end
    local label = folder
    if type(label) ~= "string" or label == "" then
        label = "Courses"
    end
    local files = directory:getFiles()
    if type(files) == "table" then
        for _, file in ipairs(files) do
            if type(file) == "table" and file.getName ~= nil and file.getFullPath ~= nil then
                local fileName = file:getName()
                local fullPath = file:getFullPath()
                if type(fileName) == "string" and type(fullPath) == "string" and isCourseFile(fileName) then
                    courses[#courses + 1] = {
                        id = fullPath,
                        name = displayName(fileName),
                        folder = label,
                        vehicles = courseVehicleCount(fullPath),
                    }
                end
            end
        end
    end
    if directory.getDirectories ~= nil then
        local children = directory:getDirectories()
        if type(children) == "table" then
            for _, child in ipairs(children) do
                addCourses(child, courses, childFolder(folder, child))
            end
        end
    end
end

local function listCourses()
    local env = CourseplaySync.resolve()
    if env == nil then
        return nil
    end
    local storage = env.g_Courseplay.courseStorage
    if storage == nil or storage.getRootDirectory == nil then
        return nil
    end
    if storage.refresh ~= nil then
        pcall(function()
            storage:refresh()
        end)
    end
    local courses = {}
    local modeName = modeDirectoryName()
    local modeDirectory = findChildDirectory(storage:getRootDirectory(), modeName)
    if modeDirectory ~= nil then
        addCourses(modeDirectory, courses, "")
    end
    table.sort(courses, function(a, b)
        if a.folder == b.folder then
            return a.name < b.name
        end
        return a.folder < b.folder
    end)
    return courses
end

function CourseplaySync:fingerprintOf()
    if not self:isAvailable() then
        return "unavailable"
    end
    local courses = listCourses()
    if courses == nil then
        return "unavailable"
    end
    local ids = {}
    for _, course in ipairs(courses) do
        ids[#ids + 1] = course.folder
            .. "/"
            .. course.name
            .. "="
            .. course.id
            .. "#"
            .. tostring(course.vehicles or 1)
    end
    return table.concat(ids, "|")
end

function CourseplaySync:buildMessage()
    if not self:isAvailable() then
        return { type = "courseplay", available = false }
    end
    local courses = listCourses() or {}
    self.revision = self.revision + 1
    Logging.info("[MB Livemap] Courseplay saved courses: %d in %s", #courses, tostring(modeDirectoryName()))
    return {
        type = "courseplay",
        available = true,
        revision = self.revision,
        courses = courses,
    }
end

function CourseplaySync:collectIfChanged(force)
    if force then
        vehicleCounts = {}
    end
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
            Logging.warning("[MB Livemap] Courseplay course list failed: %s", tostring(message))
        end
        self.fingerprint = nil
        return nil
    end
    self.warned = false
    return message
end

local function samePath(a, b)
    if a == b then
        return true
    end
    if type(a) ~= "string" or type(b) ~= "string" then
        return false
    end
    local left = string.lower((a:gsub("\\", "/")))
    local right = string.lower((b:gsub("\\", "/")))
    return left == right
end

local function findFileIn(directory, courseId)
    if type(directory) ~= "table" or directory.getFiles == nil then
        return nil
    end
    local files = directory:getFiles()
    if type(files) == "table" then
        for _, file in ipairs(files) do
            if type(file) == "table" and file.getFullPath ~= nil and samePath(file:getFullPath(), courseId) then
                return file
            end
        end
    end
    if directory.getDirectories ~= nil then
        local children = directory:getDirectories()
        if type(children) == "table" then
            for _, child in ipairs(children) do
                local found = findFileIn(child, courseId)
                if found ~= nil then
                    return found
                end
            end
        end
    end
    return nil
end

function CourseplaySync.findFile(courseId)
    if type(courseId) ~= "string" or courseId == "" then
        return nil
    end
    local env = CourseplaySync.resolve()
    if env == nil then
        return nil
    end
    local storage = env.g_Courseplay.courseStorage
    if storage == nil or storage.getRootDirectory == nil then
        return nil
    end
    if storage.refresh ~= nil then
        pcall(function()
            storage:refresh()
        end)
    end
    return findFileIn(storage:getRootDirectory(), courseId)
end

local function schemaForCourses()
    if courseSchema ~= nil then
        return courseSchema
    end
    if XMLSchema == nil or XMLValueType == nil or XMLValueType.VECTOR_3 == nil then
        return nil
    end
    courseSchema = XMLSchema.new("mbLivemapCpCourse")
    courseSchema:register(XMLValueType.VECTOR_3, "Courses.Course(?).wp(?)#position", "Waypoint position")
    courseSchema:register(
        XMLValueType.VECTOR_3,
        "Courses.Course(?).multiVehicleData.waypoints(?).wp(?)#position",
        "Multi-vehicle waypoint position"
    )
    return courseSchema
end

local function rememberPoint(points, state, x, z)
    if type(x) ~= "number" or type(z) ~= "number" then
        return
    end
    state.seen = state.seen + 1
    state.last = { x = x, z = z }
    if state.seen == 1 or (state.seen % SAMPLE_STEP) == 0 then
        points[#points + 1] = state.last
    end
end

local function vectorFromAttribute(value)
    if type(value) ~= "string" then
        return nil, nil
    end
    local x, _, z = value:match("([%-]?[%d%.]+)%s+([%-]?[%d%.]+)%s+([%-]?[%d%.]+)")
    return tonumber(x), tonumber(z)
end

-- Single-vehicle courses store wp under Course. Multi-vehicle courses store them
-- under Course.multiVehicleData.waypoints.wp.
local function collectWaypoints(handle, basePath, points, state)
    if getXMLNumOfElements == nil or getXMLString == nil then
        return
    end
    local count = getXMLNumOfElements(handle, basePath)
    if type(count) ~= "number" or count <= 0 then
        return
    end
    for index = 0, count - 1 do
        local value = getXMLString(handle, string.format("%s(%d)#position", basePath, index))
        local x, z = vectorFromAttribute(value)
        rememberPoint(points, state, x, z)
    end
end

function CourseplaySync.coursePoints(courseId)
    local file = CourseplaySync.findFile(courseId)
    if file == nil or file.getFullPath == nil then
        return nil, "Unknown course"
    end
    local schema = schemaForCourses()
    if schema == nil or XMLFile == nil or XMLFile.load == nil then
        return nil, "Course XML is not available"
    end
    local xmlFile = XMLFile.load(xmlDocumentName("mbLivemapCpCourse"), file:getFullPath(), schema)
    if xmlFile == nil then
        return nil, "Could not read course"
    end
    local points = {}
    local state = { seen = 0, last = nil }
    local handle = xmlFile.handle
    if handle ~= nil then
        local courses = 0
        if getXMLNumOfElements ~= nil then
            courses = getXMLNumOfElements(handle, "Courses.Course") or 0
        end
        for courseIndex = 0, courses - 1 do
            local courseKey = string.format("Courses.Course(%d)", courseIndex)
            collectWaypoints(handle, courseKey .. ".wp", points, state)
            local groups = 0
            if getXMLNumOfElements ~= nil then
                groups = getXMLNumOfElements(handle, courseKey .. ".multiVehicleData.waypoints") or 0
            end
            for groupIndex = 0, groups - 1 do
                collectWaypoints(
                    handle,
                    string.format("%s.multiVehicleData.waypoints(%d).wp", courseKey, groupIndex),
                    points,
                    state
                )
            end
        end
    end
    if state.seen == 0 and xmlFile.iterate ~= nil then
        xmlFile:iterate("Courses.Course", function(_, courseKey)
            local function take(wpKey)
                local x, _, z = xmlFile:getValue(wpKey .. "#position")
                rememberPoint(points, state, x, z)
            end
            if xmlFile.iterate ~= nil then
                xmlFile:iterate(courseKey .. ".wp", function(_, wpKey)
                    take(wpKey)
                end)
                xmlFile:iterate(courseKey .. ".multiVehicleData.waypoints", function(_, groupKey)
                    xmlFile:iterate(groupKey .. ".wp", function(_, wpKey)
                        take(wpKey)
                    end)
                end)
            end
        end)
    end
    xmlFile:delete()
    if state.last ~= nil and (points[#points] == nil or points[#points].x ~= state.last.x or points[#points].z ~= state.last.z) then
        points[#points + 1] = state.last
    end
    if #points == 0 then
        return nil, "Course has no waypoints"
    end
    return points
end

function CourseplaySync.closestWaypointId(courseId)
    local points, err = CourseplaySync.coursePoints(courseId)
    if points == nil then
        return nil, err
    end
    local graph = nil
    if AutoDriveSync ~= nil and AutoDriveSync.resolve ~= nil then
        local _
        _, graph = AutoDriveSync.resolve()
    end
    if graph == nil or graph.getWayPoints == nil then
        return nil, "AutoDrive is not loaded"
    end
    local waypoints = graph:getWayPoints()
    if type(waypoints) ~= "table" then
        return nil, "AutoDrive network is empty"
    end
    local bestId = nil
    local bestDist = math.huge
    for _, point in ipairs(points) do
        for key, wp in pairs(waypoints) do
            if type(wp) == "table" and type(wp.x) == "number" and type(wp.z) == "number" then
                local id = wp.id
                if type(id) ~= "number" and type(key) == "number" then
                    id = key
                end
                if type(id) == "number" then
                    local dx = wp.x - point.x
                    local dz = wp.z - point.z
                    local dist = dx * dx + dz * dz
                    if dist < bestDist then
                        bestDist = dist
                        bestId = id
                    end
                end
            end
        end
    end
    if bestId == nil then
        return nil, "AutoDrive network is empty"
    end
    return bestId
end

local function graphOrNil()
    if AutoDriveSync == nil or AutoDriveSync.resolve == nil then
        return nil
    end
    local _, graph = AutoDriveSync.resolve()
    return graph
end

local function markerList(graph)
    if graph == nil or graph.getMapMarkers == nil then
        return nil
    end
    local markers = graph:getMapMarkers()
    if type(markers) ~= "table" then
        return nil
    end
    return markers
end

local function isTempMarker(marker)
    return type(marker) == "table" and marker.isADDebug == true and marker.name == TEMP_MARKER_NAME
end

local function noteMarkerChanges(graph)
    if graph ~= nil and graph.markChanges ~= nil then
        graph:markChanges()
    end
end

-- A destination stored on a vehicle is the marker table itself. Reindexing updates that
-- table in place. Drop the reference when the table was removed from the list.
local function repairVehicleDestinations(markers)
    local vehicles = vehicleList()
    if type(vehicles) ~= "table" then
        return
    end
    for _, vehicle in pairs(vehicles) do
        local state = vehicle.ad ~= nil and vehicle.ad.stateModule or nil
        if state ~= nil then
            if state.getFirstMarker ~= nil and state.setFirstMarker ~= nil and isTempMarker(state:getFirstMarker()) then
                local marker = state:getFirstMarker()
                if markers[marker.markerIndex] ~= marker and markers[1] ~= nil then
                    state:setFirstMarker(1)
                end
            end
            if state.getSecondMarker ~= nil and state.setSecondMarker ~= nil and isTempMarker(state:getSecondMarker()) then
                local marker = state:getSecondMarker()
                if markers[marker.markerIndex] ~= marker and markers[1] ~= nil then
                    state:setSecondMarker(1)
                end
            end
            if state.getCurrentDestination ~= nil and state.setCurrentDestination ~= nil and isTempMarker(state:getCurrentDestination()) then
                local marker = state:getCurrentDestination()
                if markers[marker.markerIndex] ~= marker then
                    state:setCurrentDestination(markers[1])
                end
            end
        end
    end
end

local function removeTempMarkerAt(markers, index, graph)
    table.remove(markers, index)
    for markerIndex, item in ipairs(markers) do
        if type(item) == "table" then
            item.markerIndex = markerIndex
        end
    end
    repairVehicleDestinations(markers)
    noteMarkerChanges(graph)
end

-- Deletes temporary destinations nobody is driving to, including one left behind by an older build.
local function sweepUnusedTempMarkers()
    local graph = graphOrNil()
    local markers = markerList(graph)
    if markers == nil then
        return
    end
    local removed = false
    for index = #markers, 1, -1 do
        local marker = markers[index]
        if isTempMarker(marker) and (tempMarkerUsers[marker.id] or 0) <= 0 then
            table.remove(markers, index)
            removed = true
        end
    end
    if not removed then
        return
    end
    for markerIndex, item in ipairs(markers) do
        if type(item) == "table" then
            item.markerIndex = markerIndex
        end
    end
    repairVehicleDestinations(markers)
    noteMarkerChanges(graph)
end

function CourseplaySync.releaseTempMarker(waypointId)
    if type(waypointId) ~= "number" then
        return
    end
    local count = tempMarkerUsers[waypointId]
    if type(count) ~= "number" or count <= 0 then
        return
    end
    count = count - 1
    if count > 0 then
        tempMarkerUsers[waypointId] = count
        return
    end
    tempMarkerUsers[waypointId] = nil
    local graph = graphOrNil()
    local markers = markerList(graph)
    if markers == nil then
        return
    end
    for index = #markers, 1, -1 do
        local marker = markers[index]
        if isTempMarker(marker) and marker.id == waypointId then
            removeTempMarkerAt(markers, index, graph)
            return
        end
    end
end

local function releaseJobMarker(job)
    if type(job) == "table" and job.usesTemp == true then
        CourseplaySync.releaseTempMarker(job.waypointId)
        job.usesTemp = false
    end
end

-- Reuses a real destination, or one shared temporary destination, for this waypoint.
local function acquireMarker(waypointId)
    local graph = graphOrNil()
    if graph == nil then
        return nil, false, "AutoDrive is not loaded"
    end
    local markers = markerList(graph)
    if markers == nil then
        return nil, false, "AutoDrive network is empty"
    end
    for index, marker in ipairs(markers) do
        if type(marker) == "table" and marker.id == waypointId and not isTempMarker(marker) then
            return index, false
        end
    end
    for index, marker in ipairs(markers) do
        if isTempMarker(marker) and marker.id == waypointId then
            tempMarkerUsers[waypointId] = (tempMarkerUsers[waypointId] or 0) + 1
            return index, true
        end
    end
    local index = #markers + 1
    markers[index] = {
        id = waypointId,
        markerIndex = index,
        name = TEMP_MARKER_NAME,
        group = "All",
        isADDebug = true,
    }
    tempMarkerUsers[waypointId] = (tempMarkerUsers[waypointId] or 0) + 1
    noteMarkerChanges(graph)
    return index, true
end

local function wakeVehicle(vehicle)
    vehicle.forceIsActive = true
    if vehicle.spec_motorized ~= nil then
        vehicle.spec_motorized.stopMotorOnLeave = false
    end
    if vehicle.spec_enterable ~= nil then
        vehicle.spec_enterable.disableCharacterOnLeave = false
    end
    if vehicle.raiseActive ~= nil then
        pcall(function()
            vehicle:raiseActive()
        end)
    end
end

local function startPointValue(mode)
    local env = CourseplaySync.resolve()
    local params = env ~= nil and env.CpFieldWorkJobParameters or nil
    if mode == "nearest" then
        return params ~= nil and params.START_AT_NEAREST_POINT or 1
    end
    if mode == "last" then
        return params ~= nil and params.START_AT_LAST_POINT or 3
    end
    return params ~= nil and params.START_AT_FIRST_POINT or 2
end

local function setJobLane(job, lane)
    if type(job) ~= "table" or job.getCpJobParameters == nil then
        return
    end
    local params = job:getCpJobParameters()
    if params ~= nil and params.laneOffset ~= nil and params.laneOffset.setValue ~= nil then
        params.laneOffset:setValue(lane)
    end
end

-- Negative lanes are left of center, positive lanes are right. 0 is the middle vehicle.
local function applyLane(vehicle, lane)
    if type(lane) ~= "number" then
        return
    end
    local course = nil
    if vehicle.getFieldWorkCourse ~= nil then
        course = vehicle:getFieldWorkCourse()
    end
    if course == nil or course.multiVehicleData == nil or course.getMultiTools == nil or course:getMultiTools() <= 1 or course.setPosition == nil then
        return
    end
    course:setPosition(lane)
    if vehicle.getCpLaneOffsetSetting ~= nil then
        local setting = vehicle:getCpLaneOffsetSetting()
        if setting ~= nil and setting.setValue ~= nil then
            setting:setValue(lane)
        end
    end
    local spec = vehicle.spec_cpAIFieldWorker
    if type(spec) == "table" then
        setJobLane(spec.cpJob, lane)
        setJobLane(spec.cpJobStartAtFirstWp, lane)
        setJobLane(spec.cpJobStartAtLastWp, lane)
    end
    if SpecializationUtil ~= nil and SpecializationUtil.raiseEvent ~= nil then
        pcall(function()
            SpecializationUtil.raiseEvent(vehicle, "onCpCourseChange", course, true)
        end)
    end
end

local function applyStartPoint(vehicle, mode)
    if vehicle.getCpStartingPointSetting == nil then
        return
    end
    local setting = vehicle:getCpStartingPointSetting()
    if setting ~= nil and setting.setValue ~= nil then
        setting:setValue(startPointValue(mode))
    end
end

local function loadCourse(vehicle, courseId)
    if vehicle.appendLoadedCpCourse == nil then
        error("Vehicle does not support Courseplay")
    end
    local file = CourseplaySync.findFile(courseId)
    if file == nil then
        error("Unknown course")
    end
    vehicle:appendLoadedCpCourse(file)
    if vehicle.hasCpCourse == nil or vehicle:hasCpCourse() ~= true then
        error("Could not load course")
    end
end

function CourseplaySync.startCourse(vehicle, courseId, startMode, lane)
    if vehicle.getIsCpActive ~= nil and vehicle:getIsCpActive() then
        error("Courseplay is already running")
    end
    local mode = startMode
    if mode ~= "nearest" and mode ~= "last" then
        mode = "first"
    end
    loadCourse(vehicle, courseId)
    applyLane(vehicle, lane)
    applyStartPoint(vehicle, mode)
    if mode == "last" then
        if vehicle.startCpAtLastWp == nil then
            error("Courseplay cannot start at the last waypoint")
        end
        vehicle:startCpAtLastWp()
    elseif mode == "nearest" then
        if vehicle.cpStartStopDriver == nil then
            error("Courseplay cannot start at the nearest waypoint")
        end
        vehicle:cpStartStopDriver()
    else
        if vehicle.startCpAtFirstWp == nil then
            error("Courseplay cannot start at the first waypoint")
        end
        vehicle:startCpAtFirstWp()
    end
    if vehicle.getIsCpActive ~= nil and vehicle:getIsCpActive() ~= true then
        error("Courseplay did not start")
    end
    wakeVehicle(vehicle)
end

function CourseplaySync.startAtFirst(vehicle, courseId)
    CourseplaySync.startCourse(vehicle, courseId, "first", nil)
end

function CourseplaySync.startNearest(vehicle, courseId, lane)
    CourseplaySync.startCourse(vehicle, courseId, "nearest", lane)
end

function CourseplaySync.stop(vehicle)
    local active = vehicle.getIsCpActive ~= nil and vehicle:getIsCpActive() == true
    if not active then
        return
    end
    -- stopCpDriver only cleans up after a finished job. The start/stop toggle ends a running driver.
    if vehicle.cpStartStopDriver ~= nil then
        vehicle:cpStartStopDriver()
    elseif vehicle.stopCurrentAIJob ~= nil and AIMessageSuccessStoppedByUser ~= nil then
        vehicle:stopCurrentAIJob(AIMessageSuccessStoppedByUser.new())
    else
        error("Courseplay is not available on this vehicle")
    end
    if vehicle.getIsCpActive ~= nil and vehicle:getIsCpActive() then
        error("Courseplay did not stop")
    end
end

function CourseplaySync.noteArrival(vehicleId)
    if vehicleId == nil then
        return
    end
    local job = handoffs[tostring(vehicleId)]
    if job ~= nil and job.arrived ~= true then
        job.arrived = true
        job.arrivedAt = nowMs()
    end
end

function CourseplaySync.cancelHandoff(vehicleId)
    if vehicleId == nil then
        return
    end
    local key = tostring(vehicleId)
    local job = handoffs[key]
    if job == nil then
        return
    end
    releaseJobMarker(job)
    handoffs[key] = nil
end

function CourseplaySync.startFieldwork(vehicle, courseId, lane, startMode)
    local autoDrive = nil
    if AutoDriveSync ~= nil and AutoDriveSync.resolve ~= nil then
        autoDrive = AutoDriveSync.resolve()
    end
    if autoDrive == nil or autoDrive.StartDriving == nil or autoDrive.MODE_DRIVETO == nil then
        error("AutoDrive is not loaded")
    end
    if not CourseplaySync.isAvailable() then
        error("Courseplay is not loaded")
    end
    if vehicle.ad == nil or vehicle.ad.stateModule == nil then
        error("Vehicle does not support AutoDrive")
    end
    if vehicle.appendLoadedCpCourse == nil then
        error("Vehicle does not support Courseplay")
    end
    if vehicle.ad.stateModule.isActive ~= nil and vehicle.ad.stateModule:isActive() then
        error("AutoDrive is already running")
    end
    if vehicle.getIsCpActive ~= nil and vehicle:getIsCpActive() then
        error("Courseplay is already running")
    end
    if CourseplaySync.findFile(courseId) == nil then
        error("Unknown course")
    end

    local key = vehicleKey(vehicle)
    if key == nil then
        error("Vehicle id is not available")
    end
    CourseplaySync.cancelHandoff(key)

    local waypointId, pointErr = CourseplaySync.closestWaypointId(courseId)
    if waypointId == nil then
        error(pointErr or "No AutoDrive waypoint near this course")
    end
    local markerIndex, usesTemp, markerErr = acquireMarker(waypointId)
    if markerIndex == nil then
        error(markerErr or "AutoDrive destination is not available")
    end

    if vehicle.ad.stateModule.setMode ~= nil then
        vehicle.ad.stateModule:setMode(autoDrive.MODE_DRIVETO)
    end
    autoDrive:StartDriving(vehicle, markerIndex, markerIndex, nil, nil, nil)
    if vehicle.ad.stateModule.isActive ~= nil and not vehicle.ad.stateModule:isActive() then
        if usesTemp then
            CourseplaySync.releaseTempMarker(waypointId)
        end
        error("AutoDrive did not start")
    end

    local mode = startMode
    if mode ~= "first" and mode ~= "nearest" and mode ~= "last" then
        mode = "first"
    end
    handoffs[key] = {
        courseId = courseId,
        lane = lane,
        startMode = mode,
        waypointId = waypointId,
        usesTemp = usesTemp,
        arrived = false,
        arrivedAt = 0,
        armedAt = nowMs(),
        stopRequested = false,
    }
    wakeVehicle(vehicle)
end

function CourseplaySync.updateHandoffs()
    for key, job in pairs(handoffs) do
        if job.arrived ~= true then
            local vehicle = findVehicleById(key)
            local active = false
            if vehicle ~= nil and vehicle.ad ~= nil and vehicle.ad.stateModule ~= nil and vehicle.ad.stateModule.isActive ~= nil then
                active = vehicle.ad.stateModule:isActive() == true
            end
            if vehicle == nil or (not active and nowMs() - (job.armedAt or 0) > 1000) then
                releaseJobMarker(job)
                handoffs[key] = nil
            end
        elseif job.arrived == true then
            local vehicle = findVehicleById(key)
            local active = false
            if vehicle ~= nil and vehicle.ad ~= nil and vehicle.ad.stateModule ~= nil and vehicle.ad.stateModule.isActive ~= nil then
                active = vehicle.ad.stateModule:isActive() == true
            end
            if vehicle == nil then
                releaseJobMarker(job)
                handoffs[key] = nil
            elseif active then
                if not job.stopRequested and vehicle.stopAutoDrive ~= nil then
                    job.stopRequested = true
                    pcall(function()
                        vehicle:stopAutoDrive()
                    end)
                end
                if nowMs() - (job.arrivedAt or 0) > HANDOFF_STOP_MS then
                    releaseJobMarker(job)
                    handoffs[key] = nil
                    Logging.warning("[MB Livemap] Courseplay handoff timed out waiting for AutoDrive to stop")
                end
            else
                releaseJobMarker(job)
                handoffs[key] = nil
                local ok, err = pcall(CourseplaySync.startCourse, vehicle, job.courseId, job.startMode, job.lane)
                if not ok then
                    Logging.warning("[MB Livemap] Courseplay handoff failed: %s", tostring(err))
                end
            end
        end
    end
    sweepUnusedTempMarkers()
end
