/**
 * The Stormworks Lua API, described once.
 *
 * The same description drives the editor's completions and hover docs and is
 * asserted against the runtime by a test, so the two cannot drift: anything
 * documented here must exist in a live interpreter.
 */
export interface LuaFunctionDoc {
  /** Fully qualified name, e.g. `screen.drawRect`. */
  readonly name: string
  readonly signature: string
  readonly summary: string
}

export interface LuaNamespaceDoc {
  readonly name: string
  readonly summary: string
  readonly functions: readonly LuaFunctionDoc[]
}

export const LUA_API: readonly LuaNamespaceDoc[] = [
  {
    name: 'input',
    summary: 'Values arriving on the composite input, 1 to 32 of each kind.',
    functions: [
      {
        name: 'input.getBool',
        signature: 'input.getBool(index)',
        summary: 'Reads on/off channel `index`. Unconnected channels read as false.',
      },
      {
        name: 'input.getNumber',
        signature: 'input.getNumber(index)',
        summary: 'Reads number channel `index`. Unconnected channels read as 0.',
      },
    ],
  },
  {
    name: 'output',
    summary: 'Values written to the composite output, 1 to 32 of each kind.',
    functions: [
      {
        name: 'output.setBool',
        signature: 'output.setBool(index, value)',
        summary: 'Writes on/off channel `index`.',
      },
      {
        name: 'output.setNumber',
        signature: 'output.setNumber(index, value)',
        summary: 'Writes number channel `index`.',
      },
    ],
  },
  {
    name: 'property',
    summary: 'Values set on the component in the editor, read by name.',
    functions: [
      {
        name: 'property.getBool',
        signature: 'property.getBool(label)',
        summary: 'Reads a Property Toggle by its name.',
      },
      {
        name: 'property.getNumber',
        signature: 'property.getNumber(label)',
        summary: 'Reads a Property Number, Slider or Dropdown by its name.',
      },
      {
        name: 'property.getText',
        signature: 'property.getText(label)',
        summary: 'Reads a Property Text by its name.',
      },
    ],
  },
  {
    name: 'screen',
    summary: 'Drawing, available inside onDraw. Coordinates are in pixels.',
    functions: [
      {
        name: 'screen.getWidth',
        signature: 'screen.getWidth()',
        summary: 'Width of the monitor in pixels.',
      },
      {
        name: 'screen.getHeight',
        signature: 'screen.getHeight()',
        summary: 'Height of the monitor in pixels.',
      },
      {
        name: 'screen.setColor',
        signature: 'screen.setColor(r, g, b, a)',
        summary: 'Sets the colour for later drawing. Channels are 0 to 255; alpha defaults to 255.',
      },
      {
        name: 'screen.drawClear',
        signature: 'screen.drawClear()',
        summary: 'Fills the whole screen with the current colour.',
      },
      {
        name: 'screen.drawLine',
        signature: 'screen.drawLine(x1, y1, x2, y2)',
        summary: 'Draws a line.',
      },
      {
        name: 'screen.drawCircle',
        signature: 'screen.drawCircle(x, y, radius)',
        summary: 'Draws a circle outline.',
      },
      {
        name: 'screen.drawCircleF',
        signature: 'screen.drawCircleF(x, y, radius)',
        summary: 'Draws a filled circle.',
      },
      {
        name: 'screen.drawRect',
        signature: 'screen.drawRect(x, y, width, height)',
        summary: 'Draws a rectangle outline.',
      },
      {
        name: 'screen.drawRectF',
        signature: 'screen.drawRectF(x, y, width, height)',
        summary: 'Draws a filled rectangle.',
      },
      {
        name: 'screen.drawTriangle',
        signature: 'screen.drawTriangle(x1, y1, x2, y2, x3, y3)',
        summary: 'Draws a triangle outline.',
      },
      {
        name: 'screen.drawTriangleF',
        signature: 'screen.drawTriangleF(x1, y1, x2, y2, x3, y3)',
        summary: 'Draws a filled triangle.',
      },
      {
        name: 'screen.drawText',
        signature: 'screen.drawText(x, y, text)',
        summary: 'Draws text at a position. The font is 5 pixels wide and 5 tall.',
      },
      {
        name: 'screen.drawTextBox',
        signature: 'screen.drawTextBox(x, y, width, height, text, horizontal, vertical)',
        summary: 'Draws wrapped text inside a box. Alignments are -1, 0 or 1.',
      },
      {
        name: 'screen.drawMap',
        signature: 'screen.drawMap(x, y, zoom)',
        summary: 'Draws the world map centred on a world position.',
      },
      {
        name: 'screen.setMapColorOcean',
        signature: 'screen.setMapColorOcean(r, g, b, a)',
        summary: 'Sets the colour the map draws deep water in.',
      },
      {
        name: 'screen.setMapColorShallows',
        signature: 'screen.setMapColorShallows(r, g, b, a)',
        summary: 'Sets the colour the map draws shallow water in.',
      },
      {
        name: 'screen.setMapColorLand',
        signature: 'screen.setMapColorLand(r, g, b, a)',
        summary: 'Sets the colour the map draws land in.',
      },
      {
        name: 'screen.setMapColorGrass',
        signature: 'screen.setMapColorGrass(r, g, b, a)',
        summary: 'Sets the colour the map draws grass in.',
      },
      {
        name: 'screen.setMapColorSand',
        signature: 'screen.setMapColorSand(r, g, b, a)',
        summary: 'Sets the colour the map draws sand in.',
      },
      {
        name: 'screen.setMapColorSnow',
        signature: 'screen.setMapColorSnow(r, g, b, a)',
        summary: 'Sets the colour the map draws snow in.',
      },
    ],
  },
  {
    name: 'map',
    summary: 'Converting between world coordinates and pixels on a drawn map.',
    functions: [
      {
        name: 'map.screenToMap',
        signature: 'map.screenToMap(mapX, mapY, zoom, screenW, screenH, pixelX, pixelY)',
        summary: 'World position of a pixel on a map drawn centred at mapX, mapY.',
      },
      {
        name: 'map.mapToScreen',
        signature: 'map.mapToScreen(mapX, mapY, zoom, screenW, screenH, worldX, worldY)',
        summary: 'Pixel position of a world coordinate on a map drawn centred at mapX, mapY.',
      },
    ],
  },
  {
    name: 'async',
    summary: 'HTTP, which only works on a dedicated server. Inert here.',
    functions: [
      {
        name: 'async.httpGet',
        signature: 'async.httpGet(port, url)',
        summary: 'Sends a GET request; the reply arrives at httpReply(port, url, body).',
      },
    ],
  },
]

/** The callbacks the game invokes on a script. */
export const LUA_CALLBACKS: readonly LuaFunctionDoc[] = [
  {
    name: 'onTick',
    signature: 'function onTick()',
    summary: 'Runs once per tick, 60 times a second. Read inputs and write outputs here.',
  },
  {
    name: 'onDraw',
    signature: 'function onDraw()',
    summary: 'Runs after onTick when a monitor is attached. Only draw here.',
  },
  {
    name: 'httpReply',
    signature: 'function httpReply(port, url, body)',
    summary: 'Runs when an async.httpGet request comes back.',
  },
]

/**
 * How long a script may be. The base game allows 4096 characters; the Space DLC
 * raises it to 8192. Both are shown, so a script that would not fit in the base
 * game is obvious even when it is still within the larger limit.
 */
export const SCRIPT_LIMITS = {
  base: 4096,
  spaceDlc: 8192,
} as const

/** The largest a script may be under any version. */
export const SCRIPT_CHARACTER_LIMIT = SCRIPT_LIMITS.spaceDlc
