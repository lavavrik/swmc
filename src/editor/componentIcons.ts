/**
 * A glyph for each component, drawn to match the shapes the game uses.
 *
 * Paths are on a 24×24 grid and stroked, so they stay crisp at any zoom rather
 * than blurring the way a small bitmap would. Anything without its own glyph
 * falls back to one for its category, which is what a component imported from a
 * newer version of the game gets.
 */
import type { Category } from '@/library/types'
import type { ComponentTypeId } from '@/model/types'

export interface Glyph {
  /** Stroked outlines. */
  readonly stroke?: readonly string[]
  /** Filled shapes, for solid marks like arrowheads and dots. */
  readonly fill?: readonly string[]
}

/** The body of a logic gate, and the bubble that marks a negated output. */
const AND_BODY = 'M6 4h5a8 8 0 0 1 0 16H6z'
const OR_BODY = 'M5 4c4 0 4 0 8 0a14 14 0 0 1 6 8 14 14 0 0 1-6 8c-4 0-4 0-8 0 3-5 3-11 0-16z'
const XOR_TAIL = 'M2 4c3 5 3 11 0 16'
const BUBBLE = 'M21 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0'

/** A screen, a speaker and a switch, shared by the audio and video components. */
const SCREEN = 'M3 5h13v10H3z'
const SPEAKER = 'M4 9v6h3l4 4V5L7 9z'
const SWITCH = 'M18 18h4M18 18l-3-4'

const GLYPHS: Readonly<Record<ComponentTypeId, Glyph>> = {
  // ---- gates
  'logic.and': { stroke: [AND_BODY] },
  'logic.or': { stroke: [OR_BODY] },
  'logic.not': { stroke: ['M6 4l12 8-12 8z', BUBBLE] },
  'logic.xor': { stroke: [OR_BODY, XOR_TAIL] },
  'logic.nand': { stroke: [AND_BODY, BUBBLE] },
  'logic.nor': { stroke: [OR_BODY, BUBBLE] },

  // ---- arithmetic
  'arithmetic.add': { stroke: ['M12 4v16M4 12h16'] },
  'arithmetic.subtract': { stroke: ['M4 12h16'] },
  'arithmetic.multiply': { stroke: ['M6 6l12 12M18 6L6 18'] },
  'arithmetic.divide': { stroke: ['M5 12h14M12 6.5v.01M12 17.5v.01'] },
  'arithmetic.modulo': { stroke: ['M6 18L18 6M6 6a2 2 0 1 0 .01 0M18 18a2 2 0 1 0 .01 0'] },
  'arithmetic.abs': { stroke: ['M6 4v16M18 4v16M10 16l4-8'] },
  'arithmetic.clamp': {
    stroke: ['M4 6v12M20 6v12M8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3'],
  },
  'arithmetic.delta': { stroke: ['M12 5l7 14H5z'] },
  'arithmetic.function1': { stroke: ['M15 5h-2a3 3 0 0 0-3 3v11M7 12h7'] },
  'arithmetic.function3': { stroke: ['M15 5h-2a3 3 0 0 0-3 3v11M7 12h7', 'M18 15l3 4M21 15l-3 4'] },
  'arithmetic.function8': {
    stroke: ['M13 5h-2a3 3 0 0 0-3 3v11M5 12h7', 'M15 8l6 8M21 8l-6 8'],
  },
  'arithmetic.numericalJunction': { stroke: ['M3 12h8M11 12l8-6M11 12l8 6'] },
  'arithmetic.numericalSwitchbox': { stroke: ['M3 7h7l11-3M3 17h7l11 3M10 7v10'] },
  'arithmetic.upDownCounter': { stroke: ['M8 10l4-5 4 5M8 14l4 5 4-5'] },
  'arithmetic.memoryRegister': { stroke: ['M4 6h16v12H4z', 'M8 10h8M8 14h5'] },
  'arithmetic.pid': { stroke: ['M3 19c5 0 4-12 9-12s4 6 9 6'] },
  'arithmetic.pidAdvanced': { stroke: ['M3 19c5 0 4-12 9-12s4 6 9 6', 'M3 12h18'] },

  // ---- comparison
  'comparison.threshold': { stroke: ['M3 17h6l3-10 3 10h6'] },
  'comparison.greaterThan': { stroke: ['M7 5l10 7-10 7'] },
  'comparison.lessThan': { stroke: ['M17 5L7 12l10 7'] },
  'comparison.equal': { stroke: ['M5 9h14M5 15h14'] },

  // ---- constants and data
  'const.number': { stroke: ['M9 6h3v12M8 18h8'] },
  'const.on': { stroke: ['M12 4v8', 'M7 7a7 7 0 1 0 10 0'] },
  'data.luaScript': { stroke: ['M4 5h16v14H4z', 'M8 9h4M8 13h8M8 16h6'] },
  'tooltip.number': { stroke: ['M3 5h18v11H9l-4 4v-4H3z', 'M11 9h3v4M10 13h6'] },
  'tooltip.onoff': { stroke: ['M3 5h18v11H9l-4 4v-4H3z', 'M12 8v4', 'M9 9.5a4 4 0 1 0 6 0'] },

  // ---- memory and timing
  'logic.srLatch': { stroke: ['M4 5h16v14H4z', 'M8 9h3M8 15h3', 'M14 9h3v6h-3z'] },
  'logic.jkFlipFlop': { stroke: ['M4 5h16v14H4z', 'M8 9h8M8 15h8M12 9v6'] },
  'logic.capacitor': { stroke: ['M3 12h7M14 12h7M10 5v14M14 5v14'] },
  'logic.blinker': {
    stroke: ['M12 5v3M12 16v3M5 12h3M16 12h3', 'M9 9a4.5 4.5 0 1 0 6 6 4.5 4.5 0 1 0-6-6'],
  },
  'logic.pushToToggle': { stroke: ['M6 15h12', 'M12 15V7', 'M9 7h6'] },
  'logic.pulse': { stroke: ['M3 17h5V7h6v10h7'] },
  'logic.function4': { stroke: ['M15 5h-2a3 3 0 0 0-3 3v11M7 12h7', 'M18 16h3'] },
  'logic.function8': { stroke: ['M13 5h-2a3 3 0 0 0-3 3v11M5 12h7', 'M16 16h5'] },
  'timer.ton': { stroke: ['M12 4a8 8 0 1 0 .1 0', 'M12 8v4l3 2'] },
  'timer.tof': { stroke: ['M12 4a8 8 0 1 0 .1 0', 'M12 8v4l-3 2'] },
  'timer.rto': { stroke: ['M12 4a8 8 0 1 0 .1 0', 'M12 8v4l3 2', 'M4 5l3 3'] },
  'timer.rtf': { stroke: ['M12 4a8 8 0 1 0 .1 0', 'M12 8v4l-3 2', 'M4 5l3 3'] },

  // ---- composite
  'composite.readOnoff': { stroke: ['M4 5h8v8H4z', 'M14 13h6v6h-6z', 'M12 9h5v4'] },
  'composite.readNumber': { stroke: ['M4 5h8v8H4z', 'M14 13h6v6h-6z', 'M12 9h5v4'] },
  'composite.writeOnoff': { stroke: ['M12 5h8v8h-8z', 'M4 13h6v6H4z', 'M10 16h5V9'] },
  'composite.writeNumber': { stroke: ['M12 5h8v8h-8z', 'M4 13h6v6H4z', 'M10 16h5V9'] },
  'composite.writeOnoffLegacy': { stroke: ['M12 5h8v8h-8z', 'M4 13h6v6H4z', 'M10 16h5V9'] },
  'composite.writeNumberLegacy': { stroke: ['M12 5h8v8h-8z', 'M4 13h6v6H4z', 'M10 16h5V9'] },
  'composite.switchbox': { stroke: ['M3 7h6l12-3M3 17h6l12 3M9 7v10'] },
  'composite.numberToBinary': { stroke: ['M4 8h5M4 12h5M4 16h5', 'M13 6h7v12h-7z'] },
  'composite.binaryToNumber': { stroke: ['M4 6h7v12H4z', 'M15 8h5M15 12h5M15 16h5'] },

  // ---- properties
  'property.number': { stroke: ['M4 6h16v12H4z', 'M10 10h2v5M9 15h6'] },
  'property.slider': { stroke: ['M3 12h18', 'M12 8a4 4 0 1 0 .1 0'] },
  'property.toggle': {
    stroke: ['M7 8h10a4 4 0 0 1 0 8H7a4 4 0 0 1 0-8z'],
    fill: ['M17 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z'],
  },
  'property.dropdown': { stroke: ['M4 7h16v10H4z', 'M9 11l3 3 3-3'] },
  'property.text': { stroke: ['M6 7h12M12 7v11M9 18h6'] },

  // ---- video and audio
  'av.videoSwitchbox': { stroke: [SCREEN, SWITCH] },
  'av.audioSwitchbox': { stroke: [SPEAKER, SWITCH] },
}

/** What a component gets when it has no glyph of its own. */
const BY_CATEGORY: Readonly<Record<Category, Glyph>> = {
  arithmetic: { stroke: ['M4 12h16M12 4v16'] },
  logic: { stroke: [AND_BODY] },
  comparison: { stroke: ['M5 9h14M5 15h14'] },
  composite: { stroke: ['M4 5h8v8H4z', 'M14 13h6v6h-6z'] },
  video: { stroke: [SCREEN] },
  audio: { stroke: [SPEAKER] },
  data: { stroke: ['M4 5h16v14H4z', 'M4 10h16'] },
  property: { stroke: ['M4 7h16v4H4zM4 14h16v4H4z'] },
  io: { stroke: ['M3 12h9M9 8l4 4-4 4M18 5v14'] },
}

export function glyphFor(id: ComponentTypeId, category: Category): Glyph {
  return GLYPHS[id] ?? BY_CATEGORY[category]
}

/** The grid the paths are drawn on. */
export const GLYPH_SIZE = 24
