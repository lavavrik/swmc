/**
 * The Lua half of the Stormworks API.
 *
 * Values coming in — channels, properties, the screen size — are read through
 * host functions, and values going out are collected in Lua tables that the
 * host reads once per tick. Tables are created in Lua rather than handed in
 * from JavaScript, because an injected object arrives as a proxy that does not
 * behave like a table under `#` or `ipairs`.
 */
export const PRELUDE = `
-- Values the script produces, collected for the host to read
__out_n, __out_b = {}, {}
__cmds = {}

function __reset()
  __out_n, __out_b, __cmds = {}, {}, {}
end

local function clampChannel(i)
  i = math.floor(tonumber(i) or 1)
  if i < 1 then return 1 elseif i > 32 then return 32 end
  return i
end

input = {
  getNumber = function(i) return __host.inputNumber(clampChannel(i)) end,
  getBool = function(i) return __host.inputBool(clampChannel(i)) end,
}

output = {
  setNumber = function(i, v) __out_n[clampChannel(i)] = tonumber(v) or 0 end,
  setBool = function(i, v) __out_b[clampChannel(i)] = v and true or false end,
}

property = {
  getNumber = function(label) return __host.propertyNumber(tostring(label)) end,
  getBool = function(label) return __host.propertyBool(tostring(label)) end,
  getText = function(label) return __host.propertyText(tostring(label)) end,
}

local function push(command) __cmds[#__cmds + 1] = command end
local function n(v) return tonumber(v) or 0 end

screen = {
  getWidth = function() return __host.screenWidth() end,
  getHeight = function() return __host.screenHeight() end,
  setColor = function(r, g, b, a)
    push({ op = 'color', r = n(r), g = n(g), b = n(b), a = a == nil and 255 or n(a) })
  end,
  drawClear = function() push({ op = 'clear' }) end,
  drawLine = function(x1, y1, x2, y2)
    push({ op = 'line', x1 = n(x1), y1 = n(y1), x2 = n(x2), y2 = n(y2) })
  end,
  drawCircle = function(x, y, r) push({ op = 'circle', x = n(x), y = n(y), r = n(r) }) end,
  drawCircleF = function(x, y, r) push({ op = 'circleF', x = n(x), y = n(y), r = n(r) }) end,
  drawRect = function(x, y, w, h)
    push({ op = 'rect', x = n(x), y = n(y), w = n(w), h = n(h) })
  end,
  drawRectF = function(x, y, w, h)
    push({ op = 'rectF', x = n(x), y = n(y), w = n(w), h = n(h) })
  end,
  drawTriangle = function(x1, y1, x2, y2, x3, y3)
    push({ op = 'triangle', x1 = n(x1), y1 = n(y1), x2 = n(x2), y2 = n(y2), x3 = n(x3), y3 = n(y3) })
  end,
  drawTriangleF = function(x1, y1, x2, y2, x3, y3)
    push({ op = 'triangleF', x1 = n(x1), y1 = n(y1), x2 = n(x2), y2 = n(y2), x3 = n(x3), y3 = n(y3) })
  end,
  drawText = function(x, y, text)
    push({ op = 'text', x = n(x), y = n(y), text = tostring(text) })
  end,
  drawTextBox = function(x, y, w, h, text, ha, va)
    push({
      op = 'textBox', x = n(x), y = n(y), w = n(w), h = n(h),
      text = tostring(text), ha = n(ha), va = n(va),
    })
  end,
  drawMap = function(x, y, zoom) push({ op = 'map', x = n(x), y = n(y), zoom = n(zoom) }) end,
}

for _, name in ipairs({ 'Ocean', 'Shallows', 'Land', 'Grass', 'Sand', 'Snow' }) do
  screen['setMapColor' .. name] = function(r, g, b, a)
    push({ op = 'mapColor', which = name, r = n(r), g = n(g), b = n(b), a = a == nil and 255 or n(a) })
  end
end

-- ASSUMPTION: zoom is treated as metres per pixel. The two conversions are
-- exact inverses of each other, so scripts that round-trip stay consistent
-- even if the constant itself needs correcting against the game.
map = {
  screenToMap = function(mapX, mapY, zoom, screenW, screenH, pixelX, pixelY)
    return n(mapX) + (n(pixelX) - n(screenW) / 2) * n(zoom),
      n(mapY) - (n(pixelY) - n(screenH) / 2) * n(zoom)
  end,
  mapToScreen = function(mapX, mapY, zoom, screenW, screenH, worldX, worldY)
    local z = n(zoom)
    if z == 0 then return 0, 0 end
    return n(screenW) / 2 + (n(worldX) - n(mapX)) / z,
      n(screenH) / 2 - (n(worldY) - n(mapY)) / z
  end,
}

-- HTTP only works on a dedicated server, so it is accepted and ignored here
async = { httpGet = function() end }
`
