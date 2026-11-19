import { describe, expect, it } from 'vitest'
import { MONITORS, TEXT_ADVANCE, rasterise, wrapText } from './screen'
import type { DrawCommand } from '@/library/video'

const size = { width: 8, height: 8 }

/** The raster as text, one character per pixel. */
const show = (commands: DrawCommand[]) => {
  const raster = rasterise(commands, size)
  const rows: string[] = []
  for (let y = 0; y < raster.height; y++) {
    let line = ''
    for (let x = 0; x < raster.width; x++) {
      const { r, g, b } = raster.at(x, y)
      line += r + g + b > 0 ? '#' : '.'
    }
    rows.push(line)
  }
  return rows
}

describe('rasterise', () => {
  it('starts from a black screen', () => {
    expect(show([])).toEqual(Array.from({ length: 8 }, () => '........'))
  })

  it('fills with the current colour when cleared', () => {
    const rows = show([{ op: 'color', r: 255, g: 0, b: 0, a: 255 }, { op: 'clear' }])
    expect(rows[0]).toBe('########')
  })

  it('draws shapes on whole pixels, with no smoothing', () => {
    const rows = show([
      { op: 'color', r: 255, g: 255, b: 255, a: 255 },
      { op: 'line', x1: 0, y1: 0, x2: 3, y2: 3 },
      { op: 'rectF', x: 5, y: 5, w: 2, h: 2 },
    ])
    expect(rows).toEqual([
      '#.......',
      '.#......',
      '..#.....',
      '...#....',
      '........',
      '.....##.',
      '.....##.',
      '........',
    ])
  })

  it('draws text in the monitor font', () => {
    const rows = show([
      { op: 'color', r: 255, g: 255, b: 255, a: 255 },
      { op: 'text', x: 0, y: 0, text: 'A' },
    ])
    expect(rows.slice(0, 5)).toEqual(['.##.....', '#..#....', '#..#....', '####....', '#..#....'])
  })

  it('respects the colour set before each shape', () => {
    const raster = rasterise(
      [
        { op: 'color', r: 255, g: 0, b: 0, a: 255 },
        { op: 'rectF', x: 0, y: 0, w: 1, h: 1 },
        { op: 'color', r: 0, g: 255, b: 0, a: 255 },
        { op: 'rectF', x: 1, y: 0, w: 1, h: 1 },
      ],
      size,
    )
    expect(raster.at(0, 0)).toMatchObject({ r: 255, g: 0 })
    expect(raster.at(1, 0)).toMatchObject({ r: 0, g: 255 })
  })
})

describe('text layout', () => {
  it('advances five pixels per character, as the game does', () => {
    expect(TEXT_ADVANCE).toBe(5)
  })

  it('wraps on words', () => {
    expect(wrapText('the quick brown fox', 9)).toEqual(['the quick', 'brown fox'])
  })

  it('keeps explicit line breaks', () => {
    expect(wrapText('a\nb', 10)).toEqual(['a', 'b'])
  })
})

describe('monitors', () => {
  it('lists the sizes the game offers, in pixels', () => {
    expect(MONITORS[0]).toEqual({ label: '1×1', width: 32, height: 32 })
    expect(MONITORS.at(-1)?.width).toBe(288)
  })
})
