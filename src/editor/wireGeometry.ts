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
  /** Unit vector along the run the arrows travel, for animating the flow. */
  readonly direction: Point
  /**
   * Distance between arrows. Close to `ARROW_SPACING`, but adjusted so they
   * divide the run evenly — which is also exactly how far the whole set has to
   * travel for the march to repeat.
   */
  readonly arrowSpacing: number
}

export function wirePath(from: Point, to: Point): WirePath {
  const points: Point[] = [from, { x: from.x + STUB, y: from.y }, { x: to.x - STUB, y: to.y }, to]
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const middle = { x: points[2]!.x - points[1]!.x, y: points[2]!.y - points[1]!.y }
  const length = Math.hypot(middle.x, middle.y) || 1
  return {
    points,
    d,
    arrows: arrowsAlong(points[1]!, points[2]!),
    direction: { x: middle.x / length, y: middle.y / length },
    arrowSpacing: length / arrowCount(length),
  }
}

const arrowCount = (length: number): number => Math.max(1, Math.round(length / ARROW_SPACING))

/**
 * Evenly spaced arrowheads along the middle segment, always at least one.
 *
 * One extra sits a full spacing before the start: the whole set is animated
 * forward by exactly one spacing and then snaps back, and the leading arrow is
 * what makes that repeat seamless instead of leaving a gap.
 */
function arrowsAlong(a: Point, b: Point): ArrowPlacement[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  const count = arrowCount(length)
  const step = 1 / count
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = (i - 0.5) * step
    return { x: a.x + dx * t, y: a.y + dy * t, angle }
  })
}
