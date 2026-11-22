// A trusted, read-only load hook. Run inside mpv so upcoming files are checked
// when mpv opens them, without scanning the entire queue or waking other drives.
export const mpvCompatibilityScript = String.raw`
local mp = require('mp')

local function wave_after_id3(file)
    local header = file:read(10)
    if not header or #header ~= 10 or header:sub(1, 3) ~= 'ID3' then return end
    local version = header:byte(4)
    if version < 2 or version > 4 then return end
    local size = 0
    for i = 7, 10 do
        local byte = header:byte(i)
        if byte >= 128 then return end
        size = size * 128 + byte
    end
    local offset = 10 + size
    if version == 4 and math.floor(header:byte(6) / 16) % 2 == 1 then
        offset = offset + 10 -- ID3v2.4 footer
    end
    if not file:seek('set', offset) then return end
    local wave = file:read(12)
    if wave and #wave == 12 and wave:sub(1, 4) == 'RIFF' and wave:sub(9, 12) == 'WAVE' then
        return offset
    end
end

mp.add_hook('on_load', 50, function()
    local path = mp.get_property('path')
    if not path then return end
    local file = io.open(path, 'rb')
    if not file then return end
    local ok, offset = pcall(wave_after_id3, file)
    file:close()
    if ok and offset then
        mp.set_property('file-local-options/demuxer-lavf-o', 'skip_initial_bytes=' .. offset)
    end
end)
`;
