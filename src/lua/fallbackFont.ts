/**
 * The stand-in monitor font: an original 4×5 pixel face drawn for swmc.
 *
 * Monitors draw in the game's own font when the player links their Stormworks
 * folder (see `gameFont.ts`). Until then this face fills in, so screens work
 * without the game installed. It keeps the game's metrics — one glyph every
 * five pixels, five pixels a line — so layouts measure the same either way;
 * only the letterforms differ.
 *
 * Each glyph is five rows of four cells, `#` lit and `.` dark. At load they
 * become the same shape the game's font parses to: trimmed to their lit pixels,
 * with an offset from the drawing position.
 */

export interface TinyGlyph {
  readonly w: number
  readonly h: number
  /** Offset from the drawing position to the glyph's top-left corner. */
  readonly xo: number
  readonly yo: number
  /** One number per row, bit 0 being the leftmost pixel. */
  readonly rows: readonly number[]
}

/** Every glyph is this many pixels wide, including the gap after it. */
export const TINY_ADVANCE = 5
export const TINY_LINE_HEIGHT = 5

export const FALLBACK_FACE = 'swmc fallback 4x5'

const ART: Readonly<Record<string, string>> = {
  ' ': '.... .... .... .... ....',
  '!': '.#.. .#.. .#.. .... .#..',
  '"': '#.#. #.#. .... .... ....',
  '#': '.#.# #### .#.# #### .#.#',
  $: '.### ##.. .##. ..## ###.',
  '%': '#..# ...# ..#. .#.. #..#',
  '&': '.#.. #.#. .#.. #.#. .#.#',
  "'": '.#.. .#.. .... .... ....',
  '(': '..#. .#.. .#.. .#.. ..#.',
  ')': '.#.. ..#. ..#. ..#. .#..',
  '*': '.... #.#. .#.. #.#. ....',
  '+': '.... .#.. ###. .#.. ....',
  ',': '.... .... .... .#.. #...',
  '-': '.... .... ###. .... ....',
  '.': '.... .... .... .... .#..',
  '/': '...# ..#. ..#. .#.. #...',
  '0': '.##. #.## ##.# #..# .##.',
  '1': '.#.. ##.. .#.. .#.. ###.',
  '2': '.##. #..# ..#. .#.. ####',
  '3': '###. ...# .##. ...# ###.',
  '4': '#..# #..# #### ...# ...#',
  '5': '#### #... ###. ...# ###.',
  '6': '.##. #... ###. #..# .##.',
  '7': '#### ...# ..#. .#.. .#..',
  '8': '.##. #..# .##. #..# .##.',
  '9': '.##. #..# .### ...# .##.',
  ':': '.... .#.. .... .#.. ....',
  ';': '.... .#.. .... .#.. #...',
  '<': '..#. .#.. #... .#.. ..#.',
  '=': '.... ###. .... ###. ....',
  '>': '#... .#.. ..#. .#.. #...',
  '?': '.##. #..# ..#. .... ..#.',
  '@': '.##. #..# #.## #... .###',
  A: '.##. #..# #..# #### #..#',
  B: '###. #..# ###. #..# ###.',
  C: '.### #... #... #... .###',
  D: '###. #..# #..# #..# ###.',
  E: '#### #... ###. #... ####',
  F: '#### #... ###. #... #...',
  G: '.### #... #.## #..# .###',
  H: '#..# #..# #### #..# #..#',
  I: '###. .#.. .#.. .#.. ###.',
  J: '...# ...# ...# #..# .##.',
  K: '#..# #.#. ##.. #.#. #..#',
  L: '#... #... #... #... ####',
  M: '#..# #### #### #..# #..#',
  N: '#..# ##.# #.## #..# #..#',
  O: '.##. #..# #..# #..# .##.',
  P: '###. #..# ###. #... #...',
  Q: '.##. #..# #..# #.#. .#.#',
  R: '###. #..# ###. #.#. #..#',
  S: '.### #... .##. ...# ###.',
  T: '###. .#.. .#.. .#.. .#..',
  U: '#..# #..# #..# #..# .##.',
  V: '#.#. #.#. #.#. #.#. .#..',
  W: '#..# #..# #### #### #..#',
  X: '#..# #..# .##. #..# #..#',
  Y: '#.#. #.#. .#.. .#.. .#..',
  Z: '#### ...# .##. #... ####',
  '[': '.##. .#.. .#.. .#.. .##.',
  '\\': '#... .#.. .#.. ..#. ...#',
  ']': '.##. ..#. ..#. ..#. .##.',
  '^': '.#.. #.#. .... .... ....',
  _: '.... .... .... .... ####',
  '`': '#... .#.. .... .... ....',
  a: '.... .### #..# #..# .###',
  b: '#... ###. #..# #..# ###.',
  c: '.... .### #... #... .###',
  d: '...# .### #..# #..# .###',
  e: '.... .##. #### #... .###',
  f: '..## .#.. ###. .#.. .#..',
  g: '.### #..# .### ...# .##.',
  h: '#... ###. #..# #..# #..#',
  i: '.#.. .... ##.. .#.. ###.',
  j: '..#. .... ..#. ..#. ##..',
  k: '#... #..# ###. #.#. #..#',
  l: '##.. .#.. .#.. .#.. ###.',
  m: '.... ##.# #### #..# #..#',
  n: '.... ###. #..# #..# #..#',
  o: '.... .##. #..# #..# .##.',
  p: '.... ###. #..# ###. #...',
  q: '.... .### #..# .### ...#',
  r: '.... #.## ##.. #... #...',
  s: '.... .### ##.. ..## ###.',
  t: '.#.. #### .#.. .#.. ..##',
  u: '.... #..# #..# #..# .###',
  v: '.... #.#. #.#. #.#. .#..',
  w: '.... #..# #### #### .##.',
  x: '.... #..# .##. .##. #..#',
  y: '.... #..# .### ...# .##.',
  z: '.... #### ..#. .#.. ####',
  '{': '..## .#.. ##.. .#.. ..##',
  '|': '.#.. .#.. .#.. .#.. .#..',
  '}': '##.. ..#. ..## ..#. ##..',
  '~': '.... .#.# #.#. .... ....',
}

/** Five rows of four cells, trimmed to the pixels that are lit. */
function glyphFrom(character: string, art: string): TinyGlyph {
  const grid = art.split(' ')
  if (grid.length !== TINY_LINE_HEIGHT || grid.some((row) => !/^[.#]{4}$/.test(row))) {
    throw new Error(`fallback glyph ${JSON.stringify(character)} is not five rows of four cells`)
  }
  const lit: [number, number][] = []
  grid.forEach((row, y) => [...row].forEach((cell, x) => cell === '#' && lit.push([x, y])))
  if (lit.length === 0) return { w: 0, h: 0, xo: 0, yo: 0, rows: [] }

  const xs = lit.map(([x]) => x)
  const ys = lit.map(([, y]) => y)
  const xo = Math.min(...xs)
  const yo = Math.min(...ys)
  const w = Math.max(...xs) - xo + 1
  const h = Math.max(...ys) - yo + 1
  const rows = Array.from({ length: h }, () => 0)
  for (const [x, y] of lit) rows[y - yo] = (rows[y - yo] ?? 0) | (1 << (x - xo))
  return { w, h, xo, yo, rows }
}

export const FALLBACK_GLYPHS: Readonly<Record<number, TinyGlyph>> = Object.fromEntries(
  Object.entries(ART).map(([character, art]) => [
    character.codePointAt(0) as number,
    glyphFrom(character, art),
  ]),
)
