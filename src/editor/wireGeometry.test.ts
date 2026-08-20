import { describe, expect, it } from 'vitest'
import { ARROW_SPACING, STUB, wirePath } from './wireGeometry'

describe('wire geometry', () => {
  it('leaves the output and enters the input horizontally', () => {
    const path = wirePath({ x: 0, y: 0 }, { x: 200, y: 40 })
    expect(path.points[0]).toEqual({ x: 0, y: 0 })
    expect(path.points[1]).toEqual({ x: STUB, y: 0 })
    expect(path.points[2]).toEqual({ x: 200 - STUB, y: 40 })
    expect(path.points[3]).toEqual({ x: 200, y: 40 })
  })

  it('produces a drawable path string through every point', () => {
    const path = wirePath({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(path.d.startsWith('M 0 0')).toBe(true)
    expect(path.d.split('L')).toHaveLength(4)
  })

  it('places arrows along the wire, pointing the way the signal flows', () => {
    const path = wirePath({ x: 0, y: 0 }, { x: 300, y: 0 })
    expect(path.arrows.length).toBeGreaterThan(1)
    expect(path.arrows[0]?.angle).toBeCloseTo(0)
    expect(path.direction).toEqual({ x: 1, y: 0 })
    // The leading arrow sits behind the start; the rest are on the wire
    expect(path.arrows.slice(1).every((a) => a.x > 0 && a.x < 300)).toBe(true)
  })

  it('leads with one arrow a whole spacing behind, so the march repeats cleanly', () => {
    const path = wirePath({ x: 0, y: 0 }, { x: 300, y: 0 })
    const [first, second] = path.arrows
    expect(second!.x - first!.x).toBeCloseTo(path.arrowSpacing, 5)
    expect(path.arrowSpacing).toBeCloseTo(ARROW_SPACING, -1)
    expect(first!.x).toBeLessThan(STUB)
  })

  it('spaces arrows out along a long wire', () => {
    const long = wirePath({ x: 0, y: 0 }, { x: ARROW_SPACING * 6, y: 0 })
    const short = wirePath({ x: 0, y: 0 }, { x: ARROW_SPACING, y: 0 })
    expect(long.arrows.length).toBeGreaterThan(short.arrows.length)
  })

  it('points arrows backwards when the wire runs right to left', () => {
    const path = wirePath({ x: 300, y: 0 }, { x: 0, y: 0 })
    expect(Math.abs(path.arrows[0]?.angle ?? 0)).toBeCloseTo(Math.PI)
  })
})
