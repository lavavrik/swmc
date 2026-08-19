import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  fitToContent,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './viewport'

describe('viewport', () => {
  it('round-trips a point between screen and world space', () => {
    const vp = { x: 40, y: -12, scale: 1.7 }
    const world = { x: 3.25, y: -8 }
    const screen = worldToScreen(vp, world)
    const back = screenToWorld(vp, screen)
    expect(back.x).toBeCloseTo(world.x)
    expect(back.y).toBeCloseTo(world.y)
  })

  it('pans by a screen-space delta', () => {
    const vp = panBy({ x: 10, y: 10, scale: 2 }, { x: 5, y: -3 })
    expect(vp).toEqual({ x: 15, y: 7, scale: 2 })
  })

  it('keeps the point under the cursor fixed while zooming', () => {
    const vp = { x: 30, y: 20, scale: 1 }
    const cursor = { x: 200, y: 150 }
    const before = screenToWorld(vp, cursor)
    const after = screenToWorld(zoomAt(vp, cursor, 1.25), cursor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps the zoom range', () => {
    const zoomedOut = zoomAt(DEFAULT_VIEWPORT, { x: 0, y: 0 }, 0.001)
    const zoomedIn = zoomAt(DEFAULT_VIEWPORT, { x: 0, y: 0 }, 1000)
    expect(zoomedOut.scale).toBe(MIN_SCALE)
    expect(zoomedIn.scale).toBe(MAX_SCALE)
  })

  it('frames content in the middle of the view', () => {
    const vp = fitToContent(
      { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      { width: 400, height: 400 },
      20,
    )
    const centre = worldToScreen(vp, { x: 50, y: 50 })
    expect(centre.x).toBeCloseTo(200)
    expect(centre.y).toBeCloseTo(200)
    expect(vp.scale).toBeLessThanOrEqual((400 - 40) / 100)
  })

  it('falls back to the default viewport for empty content', () => {
    expect(fitToContent(null, { width: 400, height: 400 }, 20)).toEqual(DEFAULT_VIEWPORT)
  })
})
