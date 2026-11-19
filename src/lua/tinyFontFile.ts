/**
 * Reading the pixel font out of the pair of files the game ships it as.
 *
 * `tiny.xml` is a BMFont descriptor and `tiny_0.txtr` is its page: a short
 * header followed by RGBA pixels, magenta where there is nothing and white
 * where the glyph is, stored bottom-up as a TGA would be.
 *
 * The app runs it on the player's own installation; the font is never bundled.
 */
import type { TinyGlyph } from './fallbackFont'

export interface TinyFont {
  readonly advance: number
  readonly lineHeight: number
  readonly glyphs: Readonly<Record<number, TinyGlyph>>
  /** The typeface's name, for showing where a font came from. */
  readonly face: string
}

function attribute(source: string, name: string): number | null {
  const match = source.match(new RegExp(`${name}="(-?\\d+)"`))
  return match ? Number(match[1]) : null
}

const required = (source: string, name: string): number => {
  const value = attribute(source, name)
  if (value === null) throw new Error(`missing ${name}`)
  return value
}

export function parseTinyFont(descriptor: string, page: Uint8Array): TinyFont {
  const common = descriptor.match(/<common [^>]*\/>/)?.[0]
  if (!common) throw new Error('no <common> element in the font descriptor')

  const width = required(common, 'scaleW')
  const height = required(common, 'scaleH')
  const lineHeight = required(common, 'lineHeight')

  // Whatever header the page has, the pixels are the last width × height of it
  const pixels = page.subarray(page.length - width * height * 4)
  if (pixels.length < width * height * 4) throw new Error('the font page is too small to read')

  // Rows count from the bottom, and a glyph pixel is the white one
  const lit = (x: number, y: number) => (pixels[((height - 1 - y) * width + x) * 4 + 1] ?? 0) > 127

  const glyphs: Record<number, TinyGlyph> = {}
  const advances = new Set<number>()

  for (const [element] of descriptor.matchAll(/<char [^>]*\/>/g)) {
    const id = required(element, 'id')
    const gx = required(element, 'x')
    const gy = required(element, 'y')
    const gw = required(element, 'width')
    const gh = required(element, 'height')
    advances.add(required(element, 'xadvance'))

    glyphs[id] = {
      w: gw,
      h: gh,
      xo: required(element, 'xoffset'),
      yo: required(element, 'yoffset'),
      // One number per row, bit 0 being the leftmost pixel
      rows: Array.from({ length: gh }, (_, row) => {
        let bits = 0
        for (let col = 0; col < gw; col++) if (lit(gx + col, gy + row)) bits |= 1 << col
        return bits
      }),
    }
  }

  if (Object.keys(glyphs).length === 0) throw new Error('the font descriptor has no glyphs')
  if (advances.size !== 1) throw new Error(`expected one advance, found ${[...advances]}`)

  return {
    advance: [...advances][0] as number,
    lineHeight,
    glyphs,
    face: descriptor.match(/face="([^"]*)"/)?.[1] ?? 'unknown',
  }
}
