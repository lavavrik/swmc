/**
 * A monitor's pixels.
 *
 * Stormworks monitors are small — 32x32 up to 288x160 — and every drawing
 * operation lands on whole pixels, so this rasterises by hand rather than
 * through a canvas: Bresenham lines, a midpoint circle, scanline triangles and
 * the game's own bitmap font. Nothing is smoothed, which is the point: a
 * diagonal is a staircase on a real monitor and it should be one here.
 */
import type { Rgba } from '@/library/video'
import { tinyFont } from './tinyFont'

/** Pixels between the tops of consecutive lines of text. */
export const TEXT_LINE_HEIGHT = tinyFont().lineHeight + 1
export const TEXT_ADVANCE = tinyFont().advance

export class Raster {
  readonly width: number
  readonly height: number
  /** RGBA, row by row, ready to hand to `putImageData`. */
  readonly data: Uint8ClampedArray

  constructor(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.data = new Uint8ClampedArray(this.width * this.height * 4)
  }

  at(x: number, y: number): Rgba {
    const o = (y * this.width + x) * 4
    return {
      r: this.data[o] ?? 0,
      g: this.data[o + 1] ?? 0,
      b: this.data[o + 2] ?? 0,
      a: this.data[o + 3] ?? 0,
    }
  }

  /** Paints one pixel, blending by the colour's alpha. Off-screen is ignored. */
  pixel(x: number, y: number, colour: Rgba): void {
    const px = Math.floor(x)
    const py = Math.floor(y)
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return
    if (colour.a <= 0) return

    const o = (py * this.width + px) * 4
    if (colour.a >= 255) {
      this.data[o] = colour.r
      this.data[o + 1] = colour.g
      this.data[o + 2] = colour.b
      this.data[o + 3] = 255
      return
    }
    const alpha = colour.a / 255
    const keep = 1 - alpha
    this.data[o] = colour.r * alpha + (this.data[o] ?? 0) * keep
    this.data[o + 1] = colour.g * alpha + (this.data[o + 1] ?? 0) * keep
    this.data[o + 2] = colour.b * alpha + (this.data[o + 2] ?? 0) * keep
    this.data[o + 3] = Math.max(this.data[o + 3] ?? 0, colour.a)
  }

  clear(colour: Rgba): void {
    this.fillRect(0, 0, this.width, this.height, colour)
  }

  fillRect(x: number, y: number, w: number, h: number, colour: Rgba): void {
    const left = Math.floor(x)
    const top = Math.floor(y)
    for (let row = 0; row < Math.floor(h); row++) {
      for (let col = 0; col < Math.floor(w); col++) this.pixel(left + col, top + row, colour)
    }
  }

  /**
   * An outline whose size is a distance rather than a count: `strokeRect(x, y,
   * 2, 2)` spans three pixels each way, which is what the game draws.
   */
  strokeRect(x: number, y: number, w: number, h: number, colour: Rgba): void {
    const left = Math.floor(x)
    const top = Math.floor(y)
    const right = left + Math.floor(w)
    const bottom = top + Math.floor(h)
    this.line(left, top, right, top, colour)
    this.line(left, bottom, right, bottom, colour)
    this.line(left, top, left, bottom, colour)
    this.line(right, top, right, bottom, colour)
  }

  /** Bresenham, with both endpoints drawn. */
  line(x1: number, y1: number, x2: number, y2: number, colour: Rgba): void {
    let x = Math.floor(x1)
    let y = Math.floor(y1)
    const endX = Math.floor(x2)
    const endY = Math.floor(y2)
    const dx = Math.abs(endX - x)
    const dy = -Math.abs(endY - y)
    const stepX = x < endX ? 1 : -1
    const stepY = y < endY ? 1 : -1
    let error = dx + dy

    for (;;) {
      this.pixel(x, y, colour)
      if (x === endX && y === endY) return
      const doubled = 2 * error
      if (doubled >= dy) {
        error += dy
        x += stepX
      }
      if (doubled <= dx) {
        error += dx
        y += stepY
      }
    }
  }

  /** Walks the eight-way symmetric points of a midpoint circle. */
  private walkCircle(radius: number, visit: (x: number, y: number) => void): void {
    let x = Math.floor(Math.abs(radius))
    let y = 0
    let error = 1 - x
    while (x >= y) {
      visit(x, y)
      visit(y, x)
      visit(-x, y)
      visit(-y, x)
      visit(-x, -y)
      visit(-y, -x)
      visit(x, -y)
      visit(y, -x)
      y++
      error += error < 0 ? 2 * y + 1 : 2 * (y - --x) + 1
    }
  }

  circle(cx: number, cy: number, radius: number, colour: Rgba): void {
    const centreX = Math.floor(cx)
    const centreY = Math.floor(cy)
    this.walkCircle(radius, (x, y) => this.pixel(centreX + x, centreY + y, colour))
  }

  /** The same circle with its rows joined up, so the fill matches the outline. */
  fillCircle(cx: number, cy: number, radius: number, colour: Rgba): void {
    const centreX = Math.floor(cx)
    const centreY = Math.floor(cy)
    const spans = new Map<number, number>()
    this.walkCircle(radius, (x, y) => spans.set(y, Math.max(spans.get(y) ?? 0, Math.abs(x))))
    for (const [row, span] of spans) {
      this.line(centreX - span, centreY + row, centreX + span, centreY + row, colour)
    }
  }

  triangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    colour: Rgba,
  ): void {
    this.line(x1, y1, x2, y2, colour)
    this.line(x2, y2, x3, y3, colour)
    this.line(x3, y3, x1, y1, colour)
  }

  /** Scanline fill, with the outline drawn so thin triangles keep their shape. */
  fillTriangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    colour: Rgba,
  ): void {
    const points = [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
      { x: x3, y: y3 },
    ]
    const top = Math.floor(Math.min(...points.map((p) => p.y)))
    const bottom = Math.floor(Math.max(...points.map((p) => p.y)))

    for (let y = top; y <= bottom; y++) {
      const crossings: number[] = []
      for (let i = 0; i < 3; i++) {
        const a = points[i] as { x: number; y: number }
        const b = points[(i + 1) % 3] as { x: number; y: number }
        if (a.y === b.y) continue
        const low = Math.min(a.y, b.y)
        const high = Math.max(a.y, b.y)
        if (y < low || y > high) continue
        crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
      if (crossings.length >= 2) {
        this.line(Math.min(...crossings), y, Math.max(...crossings), y, colour)
      }
    }
    this.triangle(x1, y1, x2, y2, x3, y3, colour)
  }

  /** Draws text in the game's bitmap font, one glyph every five pixels. */
  text(x: number, y: number, text: string, colour: Rgba): void {
    const font = tinyFont()
    let cursor = Math.floor(x)
    for (const character of text) {
      const glyph = font.glyphs[character.codePointAt(0) ?? 0]
      if (glyph) {
        for (let row = 0; row < glyph.h; row++) {
          const bits = glyph.rows[row] ?? 0
          for (let col = 0; col < glyph.w; col++) {
            if ((bits >> col) & 1) {
              this.pixel(cursor + glyph.xo + col, Math.floor(y) + glyph.yo + row, colour)
            }
          }
        }
      }
      cursor += font.advance
    }
  }

  /**
   * Wrapped, aligned text. Alignments are -1, 0 and 1 — left, centre and right,
   * then top, middle and bottom.
   */
  textBox(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    horizontal: number,
    vertical: number,
    colour: Rgba,
  ): void {
    const perLine = Math.max(1, Math.floor(w / TEXT_ADVANCE))
    const lines = wrapText(text, perLine)
    const blockHeight = lines.length * TEXT_LINE_HEIGHT - 1

    const top = vertical > 0 ? y + h - blockHeight : vertical < 0 ? y : y + (h - blockHeight) / 2

    lines.forEach((line, index) => {
      const lineWidth = line.length * TEXT_ADVANCE - 1
      const left = horizontal > 0 ? x + w - lineWidth : horizontal < 0 ? x : x + (w - lineWidth) / 2
      this.text(Math.round(left), Math.round(top + index * TEXT_LINE_HEIGHT), line, colour)
    })
  }
}

/** Breaks text on words to fit a line length, keeping explicit line breaks. */
export function wrapText(text: string, perLine: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (candidate.length <= perLine) {
        line = candidate
      } else {
        if (line !== '') lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}
