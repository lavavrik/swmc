/**
 * The one place in the codebase that does screen/world coordinate arithmetic.
 *
 * World space is measured in pixels at scale 1; grid units are converted with
 * `GRID_PX` in `geometry.ts`. The transform is "scale, then translate", which
 * is exactly what the SVG root's `transform` attribute applies.
 */
import type { Point } from '@/model/types'

export interface Viewport {
  /** Screen-space translation, applied after scaling. */
  readonly x: number
  readonly y: number
  readonly scale: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Bounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export const MIN_SCALE = 0.2
export const MAX_SCALE = 4
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 }

const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

export function panBy(vp: Viewport, deltaScreen: Point): Viewport {
  return { ...vp, x: vp.x + deltaScreen.x, y: vp.y + deltaScreen.y }
}

/** Zooms by `factor`, keeping the world point under `anchor` (screen space) still. */
export function zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport {
  const scale = clampScale(vp.scale * factor)
  const world = screenToWorld(vp, anchor)
  return { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale }
}

/** Centres `bounds` in a view of `size`, leaving `padding` screen pixels around it. */
export function fitToContent(bounds: Bounds | null, size: Size, padding = 40): Viewport {
  if (!bounds) return DEFAULT_VIEWPORT
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const scale = clampScale(
    Math.min((size.width - padding * 2) / width, (size.height - padding * 2) / height),
  )
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  return {
    scale,
    x: size.width / 2 - centre.x * scale,
    y: size.height / 2 - centre.y * scale,
  }
}

/** Union of a list of bounds, or null when there is nothing to frame. */
export function unionBounds(all: readonly Bounds[]): Bounds | null {
  if (all.length === 0) return null
  return all.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }))
}

export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.minY >= outer.minY &&
    inner.maxX <= outer.maxX &&
    inner.maxY <= outer.maxY
  )
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY)
}

/** Normalises two corners of a drag into bounds. */
export function boundsFromCorners(a: Point, b: Point): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  }
}
