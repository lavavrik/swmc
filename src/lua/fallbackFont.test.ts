import { describe, expect, it } from 'vitest'
import { FALLBACK_GLYPHS, TINY_ADVANCE, TINY_LINE_HEIGHT } from './fallbackFont'
import { adoptFallbackFont, tinyFont, usingFallbackFont } from './tinyFont'

describe('the stand-in monitor font', () => {
  it('has a glyph for every printable ASCII character', () => {
    for (let code = 32; code <= 126; code++) {
      const glyph = FALLBACK_GLYPHS[code]
      expect(glyph, String.fromCodePoint(code)).toBeDefined()
      if (!glyph) continue
      expect(glyph.rows).toHaveLength(glyph.h)
      expect(glyph.w).toBeLessThanOrEqual(TINY_ADVANCE - 1)
      expect(glyph.xo + glyph.w).toBeLessThanOrEqual(TINY_ADVANCE - 1)
      expect(glyph.yo + glyph.h).toBeLessThanOrEqual(TINY_LINE_HEIGHT)
      for (const row of glyph.rows) expect(row).toBeLessThan(1 << glyph.w)
    }
    expect(Object.keys(FALLBACK_GLYPHS)).toHaveLength(95)
  })

  it('draws a space as nothing', () => {
    expect(FALLBACK_GLYPHS[32]).toEqual({ w: 0, h: 0, xo: 0, yo: 0, rows: [] })
  })

  it('is what monitors use until the game font is read', () => {
    adoptFallbackFont()
    expect(usingFallbackFont()).toBe(true)
    expect(tinyFont().face).toBe('swmc fallback 4x5')
  })
})
