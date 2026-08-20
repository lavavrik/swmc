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
    expect(path.arrowSpacing).toBeCloseTo(ARROW_SPACING, -1)
  })

  it('leaves room to travel one spacing without passing the end', () => {
    // The arrows animate forward by exactly one spacing, so the last one has to
    // start a spacing short of the segment's end or it would leave the wire
    for (const [to, label] of [
      [{ x: 300, y: 0 }, 'rightwards'],
      [{ x: -300, y: 40 }, 'leftwards'],
      [{ x: 26, y: 0 }, 'shorter than one arrow spacing'],
    ] as const) {
      const path = wirePath({ x: 0, y: 0 }, to)
      const start = path.points[1]!
      const end = path.points[2]!
      const along = (p: { x: number; y: number }) =>
        (p.x - start.x) * path.direction.x + (p.y - start.y) * path.direction.y
      const segment = along(end)

      for (const arrow of path.arrows) {
        const travelled = along(arrow) + path.arrowSpacing
        expect(along(arrow), label).toBeGreaterThanOrEqual(0)
        expect(travelled, label).toBeLessThanOrEqual(segment + 0.001)
      }
    }
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
