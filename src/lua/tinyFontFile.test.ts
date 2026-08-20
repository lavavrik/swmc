import { describe, expect, it } from 'vitest'
import { parseTinyFont } from './tinyFontFile'

/**
 * Builds a font page in the layout the game uses: RGBA pixels, white where the
 * glyph is and magenta elsewhere, stored bottom-up, behind a short header.
 */
function page(size: number, lit: (x: number, y: number) => boolean, header = 25): Uint8Array {
  const bytes = new Uint8Array(header + size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stored = size - 1 - y
      const o = header + (stored * size + x) * 4
      const on = lit(x, y)
      bytes[o] = 255
      bytes[o + 1] = on ? 255 : 0
      bytes[o + 2] = 255
      bytes[o + 3] = 255
    }
  }
  return bytes
}

const descriptor = (chars: string) => `<?xml version="1.0"?>
<font>
  <info face="CG pixel 4x5 mono" size="5"/>
  <common lineHeight="5" base="5" scaleW="8" scaleH="8" pages="1"/>
  <chars count="1">${chars}</chars>
</font>`

describe('parseTinyFont', () => {
  it('reads a glyph out of the page, right way up', () => {
    // An L shape in the top-left 3x3
    const shape = new Set(['0,0', '0,1', '0,2', '1,2', '2,2'])
    const font = parseTinyFont(
      descriptor(
        '<char id="76" x="0" y="0" width="3" height="3" xoffset="0" yoffset="0" xadvance="5"/>',
      ),
      page(8, (x, y) => shape.has(`${x},${y}`)),
    )
    expect(font.glyphs[76]?.rows).toEqual([0b001, 0b001, 0b111])
    expect(font.advance).toBe(5)
    expect(font.lineHeight).toBe(5)
    expect(font.face).toBe('CG pixel 4x5 mono')
  })

  it('reads the offsets a glyph carries', () => {
    const font = parseTinyFont(
      descriptor(
        '<char id="46" x="0" y="0" width="1" height="1" xoffset="1" yoffset="4" xadvance="5"/>',
      ),
      page(8, () => true),
    )
    expect(font.glyphs[46]).toMatchObject({ w: 1, h: 1, xo: 1, yo: 4, rows: [1] })
  })

  it('does not mind how long the page’s header is', () => {
    const shape = new Set(['1,1'])
    for (const header of [23, 25, 88]) {
      const font = parseTinyFont(
        descriptor(
          '<char id="65" x="0" y="0" width="3" height="3" xoffset="0" yoffset="0" xadvance="5"/>',
        ),
        page(8, (x, y) => shape.has(`${x},${y}`), header),
      )
      expect(font.glyphs[65]?.rows, `header ${header}`).toEqual([0, 0b010, 0])
    }
  })

  it('refuses a descriptor it cannot read', () => {
    expect(() =>
      parseTinyFont(
        '<font/>',
        page(8, () => false),
      ),
    ).toThrow(/common/)
    expect(() =>
      parseTinyFont(
        descriptor(''),
        page(8, () => false),
      ),
    ).toThrow(/no glyphs/)
    expect(() =>
      parseTinyFont(
        descriptor(
          '<char id="1" x="0" y="0" width="1" height="1" xoffset="0" yoffset="0" xadvance="5"/>',
        ),
        new Uint8Array(4),
      ),
    ).toThrow(/too small/)
  })

  it('refuses a font whose glyphs are not all the same width', () => {
    const chars =
      '<char id="65" x="0" y="0" width="1" height="1" xoffset="0" yoffset="0" xadvance="5"/>' +
      '<char id="66" x="0" y="0" width="1" height="1" xoffset="0" yoffset="0" xadvance="7"/>'
    expect(() =>
      parseTinyFont(
        descriptor(chars),
        page(8, () => true),
      ),
    ).toThrow(/one advance/)
  })
})
