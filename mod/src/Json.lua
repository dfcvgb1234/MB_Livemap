-- Minimal JSON encoder/decoder for FS25 Lua (no external deps).
-- Sufficient for livemap protocol payloads (tables, arrays, scalars).

Json = Json or {}

local function escapeString(s)
    s = string.gsub(s, "\\", "\\\\")
    s = string.gsub(s, '"', '\\"')
    s = string.gsub(s, "\n", "\\n")
    s = string.gsub(s, "\r", "\\r")
    s = string.gsub(s, "\t", "\\t")
    return s
end

local function encodeValue(v, stack)
    local t = type(v)
    if t == "nil" then
        return "null"
    elseif t == "boolean" then
        return v and "true" or "false"
    elseif t == "number" then
        if v ~= v or v == math.huge or v == -math.huge then
            return "null"
        end
        return tostring(v)
    elseif t == "string" then
        return '"' .. escapeString(v) .. '"'
    elseif t == "table" then
        if stack[v] then
            return "null"
        end
        stack[v] = true
        local isArray = true
        local maxIndex = 0
        local count = 0
        for k, _ in pairs(v) do
            count = count + 1
            if type(k) ~= "number" or k < 1 or math.floor(k) ~= k then
                isArray = false
                break
            end
            if k > maxIndex then
                maxIndex = k
            end
        end
        if isArray and count == maxIndex then
            local parts = {}
            for i = 1, maxIndex do
                parts[i] = encodeValue(v[i], stack)
            end
            stack[v] = nil
            return "[" .. table.concat(parts, ",") .. "]"
        else
            local parts = {}
            for k, val in pairs(v) do
                if type(k) == "string" or type(k) == "number" then
                    parts[#parts + 1] = '"' .. escapeString(tostring(k)) .. '":' .. encodeValue(val, stack)
                end
            end
            stack[v] = nil
            return "{" .. table.concat(parts, ",") .. "}"
        end
    end
    return "null"
end

function Json.encode(value)
    return encodeValue(value, {})
end

-- Lightweight decoder for command messages from the bridge.
function Json.decode(str)
    if type(str) ~= "string" then
        return nil, "not a string"
    end
    local pos = 1
    local len = #str

    local function peek()
        return string.sub(str, pos, pos)
    end

    local function skipWs()
        while pos <= len do
            local c = peek()
            if c == " " or c == "\t" or c == "\n" or c == "\r" then
                pos = pos + 1
            else
                break
            end
        end
    end

    local parseValue

    local function parseString()
        pos = pos + 1
        local out = {}
        while pos <= len do
            local c = peek()
            if c == '"' then
                pos = pos + 1
                return table.concat(out)
            elseif c == "\\" then
                pos = pos + 1
                local e = peek()
                if e == "n" then
                    out[#out + 1] = "\n"
                elseif e == "t" then
                    out[#out + 1] = "\t"
                elseif e == "r" then
                    out[#out + 1] = "\r"
                else
                    out[#out + 1] = e
                end
                pos = pos + 1
            else
                out[#out + 1] = c
                pos = pos + 1
            end
        end
        error("unterminated string")
    end

    local function parseNumber()
        local start = pos
        if peek() == "-" then
            pos = pos + 1
        end
        while pos <= len and string.match(peek(), "%d") do
            pos = pos + 1
        end
        if peek() == "." then
            pos = pos + 1
            while pos <= len and string.match(peek(), "%d") do
                pos = pos + 1
            end
        end
        return tonumber(string.sub(str, start, pos - 1))
    end

    local function parseArray()
        pos = pos + 1
        local arr = {}
        skipWs()
        if peek() == "]" then
            pos = pos + 1
            return arr
        end
        while true do
            arr[#arr + 1] = parseValue()
            skipWs()
            local c = peek()
            if c == "]" then
                pos = pos + 1
                return arr
            elseif c == "," then
                pos = pos + 1
                skipWs()
            else
                error("expected , or ]")
            end
        end
    end

    local function parseObject()
        pos = pos + 1
        local obj = {}
        skipWs()
        if peek() == "}" then
            pos = pos + 1
            return obj
        end
        while true do
            skipWs()
            if peek() ~= '"' then
                error("expected string key")
            end
            local key = parseString()
            skipWs()
            if peek() ~= ":" then
                error("expected :")
            end
            pos = pos + 1
            obj[key] = parseValue()
            skipWs()
            local c = peek()
            if c == "}" then
                pos = pos + 1
                return obj
            elseif c == "," then
                pos = pos + 1
            else
                error("expected , or }")
            end
        end
    end

    parseValue = function()
        skipWs()
        local c = peek()
        if c == '"' then
            return parseString()
        elseif c == "{" then
            return parseObject()
        elseif c == "[" then
            return parseArray()
        elseif c == "t" and string.sub(str, pos, pos + 3) == "true" then
            pos = pos + 4
            return true
        elseif c == "f" and string.sub(str, pos, pos + 4) == "false" then
            pos = pos + 5
            return false
        elseif c == "n" and string.sub(str, pos, pos + 3) == "null" then
            pos = pos + 4
            return nil
        elseif c == "-" or string.match(c, "%d") then
            return parseNumber()
        end
        error("unexpected token at " .. tostring(pos))
    end

    local ok, result = pcall(parseValue)
    if not ok then
        return nil, result
    end
    return result
end
