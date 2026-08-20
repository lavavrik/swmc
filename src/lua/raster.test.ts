import { describe, expect, it } from 'vitest'
import { Raster } from './raster'

const WHITE = { r: 255, g: 255, b: 255, a: 255 }
const RED = { r: 255, g: 0, b: 0, a: 255 }

/** Renders the raster as text, one character per pixel, for exact comparison. */
function show(raster: Raster): string[] {
  const rows: string[] = []
  for (let y = 0; y < raster.height; y++) {
    let line = ''
    for (let x = 0; x < raster.width; x++) line += raster.at(x, y).a > 0 ? '#' : '.'
    rows.push(line)
  }
  return rows
}

const blank = (size = 8) => new Raster(size, size)

describe('rectangles', () => {
  it('fills exactly the pixels asked for', () => {
    const raster = blank()
    raster.fillRect(1, 2, 3, 2, WHITE)
    expect(show(raster).slice(0, 5)).toEqual([
      '........',
      '........',
      '.###....',
      '.###....',
      '........',
    ])
  })

  it('draws an outline through the corner the size names', () => {
    // The game's drawRect(x, y, 2, 2) is a 3x3 outline: the size is a distance
    const raster = blank()
    raster.strokeRect(1, 1, 2, 2, WHITE)
    expect(show(raster).slice(0, 5)).toEqual([
      '........',
      '.###....',
      '.#.#....',
      '.###....',
      '........',
    ])
  })

  it('clips to the screen', () => {
    const raster = blank(4)
    raster.fillRect(-2, -2, 4, 4, WHITE)
    expect(show(raster)).toEqual(['##..', '##..', '....', '....'])
  })
})

describe('lines', () => {
  it('draws horizontal and vertical runs, endpoints included', () => {
    const raster = blank()
    raster.line(1, 1, 4, 1, WHITE)
    raster.line(6, 1, 6, 3, WHITE)
    expect(show(raster).slice(0, 4)).toEqual(['........', '.####.#.', '......#.', '......#.'])
  })

  it('steps a diagonal one pixel at a time, without smoothing', () => {
    const raster = blank()
    raster.line(0, 0, 4, 4, WHITE)
    expect(show(raster).slice(0, 5)).toEqual([
      '#.......',
      '.#......',
      '..#.....',
      '...#....',
      '....#...',
    ])
  })
})

describe('circles', () => {
  it('draws an outline', () => {
    const raster = new Raster(7, 7)
    raster.circle(3, 3, 2, WHITE)
    expect(show(raster)).toEqual([
      '.......',
      '..###..',
      '.#...#.',
      '.#...#.',
      '.#...#.',
      '..###..',
      '.......',
    ])
  })

  it('fills one', () => {
    const raster = new Raster(7, 7)
    raster.fillCircle(3, 3, 2, WHITE)
    expect(show(raster)[3]).toBe('.#####.')
    expect(show(raster)[1]).toBe('..###..')
  })
})

describe('triangles', () => {
  it('outlines three corners', () => {
    const raster = new Raster(6, 6)
    raster.triangle(0, 0, 4, 0, 0, 4, WHITE)
    expect(show(raster).slice(0, 5)).toEqual(['#####.', '#..#..', '#.#...', '##....', '#.....'])
  })

  it('fills them', () => {
    const raster = new Raster(6, 6)
    raster.fillTriangle(0, 0, 4, 0, 0, 4, WHITE)
    expect(show(raster).slice(0, 3)).toEqual(['#####.', '####..', '###...'])
  })
})

describe('colour', () => {
  it('blends by alpha', () => {
    const raster = blank(2)
    raster.fillRect(0, 0, 2, 2, { r: 0, g: 0, b: 0, a: 255 })
    raster.fillRect(0, 0, 1, 1, { r: 255, g: 255, b: 255, a: 128 })
    const blended = raster.at(0, 0)
    expect(blended.r).toBeGreaterThan(100)
    expect(blended.r).toBeLessThan(155)
  })

  it('clears the whole screen', () => {
    const raster = blank(3)
    raster.clear(RED)
    expect(raster.at(2, 2)).toEqual(RED)
  })
})

describe('text', () => {
  it('draws the game’s pixel glyphs', () => {
    const raster = new Raster(5, 5)
    raster.text(0, 0, 'A', WHITE)
    expect(show(raster)).toEqual(['.##..', '#..#.', '####.', '#..#.', '#..#.'])
  })

  it('advances five pixels per character', () => {
    const raster = new Raster(10, 5)
    raster.text(0, 0, 'AA', WHITE)
    expect(show(raster)[0]).toBe('.##..a##..'.replace('a', '.'))
  })

  it('honours each glyph’s own offset', () => {
    // A full stop is one pixel, sitting on the baseline
    const raster = new Raster(5, 5)
    raster.text(0, 0, '.', WHITE)
    expect(show(raster)).toEqual(['.....', '.....', '.....', '.....', '.#...'])
  })

  it('ignores characters it has no glyph for', () => {
    const raster = new Raster(10, 5)
    expect(() => raster.text(0, 0, 'é©', WHITE)).not.toThrow()
  })
})

describe('text boxes', () => {
  it('wraps to the box width and centres by default', () => {
    const raster = new Raster(20, 12)
    raster.textBox(0, 0, 20, 12, 'AB CD', 0, 0, WHITE)
    const rows = show(raster)
    // Two lines of two characters, centred in a four-character-wide box
    expect(rows.some((r) => r.includes('#'))).toBe(true)
  })

  it('aligns to the right and the bottom when asked', () => {
    const left = new Raster(20, 12)
    left.textBox(0, 0, 20, 12, 'A', -1, -1, WHITE)
    const right = new Raster(20, 12)
    right.textBox(0, 0, 20, 12, 'A', 1, 1, WHITE)
    const firstLit = (raster: Raster) => show(raster).findIndex((row) => row.includes('#'))
    expect(firstLit(left)).toBeLessThan(firstLit(right))
  })
})
