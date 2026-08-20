/**
 * What a wheel event means.
 *
 * A mouse wheel and a trackpad both arrive as `wheel` events, and they want
 * opposite things: a wheel is for zooming, two fingers on a trackpad are for
 * panning. The browser does not say which device it was, so this tells them
 * apart by the shape of the deltas — trackpads send small, often fractional
 * values and a horizontal component, wheels send coarse notches straight down
 * the y axis.
 *
 * Pinching a trackpad arrives as a wheel event with `ctrlKey` set, which is how
 * every browser reports it, so that always means zoom.
 */
import type { Point } from '@/model/types'

export interface WheelEventLike {
  readonly deltaX: number
  readonly deltaY: number
  /** 0 pixels, 1 lines, 2 pages. Anything but pixels is a wheel. */
  readonly deltaMode: number
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
}

export type WheelIntent =
  | { readonly kind: 'zoom'; readonly factor: number }
  | { readonly kind: 'pan'; readonly delta: Point }

/** Smallest y delta that still looks like a wheel notch rather than a swipe. */
const WHEEL_NOTCH = 40

export function isMouseWheel(event: WheelEventLike): boolean {
  if (event.deltaMode !== 0) return true
  if (event.deltaX !== 0) return false
  return Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= WHEEL_NOTCH
}

export function wheelIntent(event: WheelEventLike): WheelIntent {
  // Pinch, or a deliberate modifier, always zooms
  if (event.ctrlKey || event.metaKey) {
    return { kind: 'zoom', factor: Math.exp(-event.deltaY * 0.01) }
  }
  if (isMouseWheel(event) && !event.shiftKey) {
    return { kind: 'zoom', factor: Math.exp(-event.deltaY * 0.0015) }
  }
  // Shift turns a wheel's single axis into sideways movement
  const [dx, dy] =
    event.shiftKey && event.deltaX === 0 ? [event.deltaY, 0] : [event.deltaX, event.deltaY]
  // Scrolling moves the content the other way from the gesture; `+ 0` keeps a
  // negated zero from surfacing as -0
  return { kind: 'pan', delta: { x: -dx + 0, y: -dy + 0 } }
}
