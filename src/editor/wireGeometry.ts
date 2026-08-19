/**
 * Wire path generation.
 *
 * Stormworks draws a wire as a straight run between its two ports, with a short
 * horizontal stub at each end and arrowheads repeated along it to show the
 * direction of flow. That is what this reproduces: a four-point polyline plus a
 * list of arrow placements.
 */
import type { Point } from '@/model/types'

/** Length of the horizontal stub leaving a port. */
export const STUB = 12
/** Target distance between arrowheads along the middle segment. */
export const ARROW_SPACING = 90

export interface ArrowPlacement {
  readonly x: number
  readonly y: number
  /** Radians, measured the same way as `Math.atan2`. */
  readonly angle: number
}

export interface WirePath {
  readonly points: readonly Point[]
  /** SVG path data for the polyline. */
  readonly d: string
  readonly arrows: readonly ArrowPlacement[]
}

export function wirePath(from: Point, to: Point): WirePath {
  const points: Point[] = [
    from,
    { x: from.x + STUB, y: from.y },
    { x: to.x - STUB, y: to.y },
    to,
  ]
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  return { points, d, arrows: arrowsAlong(points[1]!, points[2]!) }
}

/** Evenly spaced arrowheads along a segment, always at least one at its middle. */
function arrowsAlong(a: Point, b: Point): ArrowPlacement[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  const count = Math.max(1, Math.round(length / ARROW_SPACING))
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count
    return { x: a.x + dx * t, y: a.y + dy * t, angle }
  })
}
