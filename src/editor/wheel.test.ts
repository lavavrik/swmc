import { describe, expect, it } from 'vitest'
import { isMouseWheel, wheelIntent, type WheelEventLike } from './wheel'

const event = (over: Partial<WheelEventLike>): WheelEventLike => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
})

/** A mouse notch: a coarse, whole-number step straight down the y axis. */
const notch = (deltaY: number) => event({ deltaY })
/** A trackpad swipe: small, often fractional, and usually with some x. */
const swipe = (deltaX: number, deltaY: number) => event({ deltaX, deltaY })

describe('telling the devices apart', () => {
  it('treats coarse vertical notches as a mouse wheel', () => {
    expect(isMouseWheel(notch(100))).toBe(true)
    expect(isMouseWheel(notch(-120))).toBe(true)
    expect(isMouseWheel(event({ deltaY: 3, deltaMode: 1 }))).toBe(true)
  })

  it('treats small or sideways movement as a trackpad', () => {
    expect(isMouseWheel(swipe(0, 4))).toBe(false)
    expect(isMouseWheel(swipe(12, 0))).toBe(false)
    expect(isMouseWheel(swipe(0, 2.5))).toBe(false)
    expect(isMouseWheel(swipe(-3, 100))).toBe(false)
  })
})

describe('wheelIntent', () => {
  it('zooms on a mouse wheel', () => {
    const intent = wheelIntent(notch(-100))
    expect(intent.kind).toBe('zoom')
    if (intent.kind === 'zoom') expect(intent.factor).toBeGreaterThan(1)
    const out = wheelIntent(notch(100))
    if (out.kind === 'zoom') expect(out.factor).toBeLessThan(1)
  })

  it('pans on a two-finger swipe', () => {
    expect(wheelIntent(swipe(10, -6))).toEqual({ kind: 'pan', delta: { x: -10, y: 6 } })
  })

  it('zooms when pinching, which arrives with ctrl held', () => {
    const intent = wheelIntent(event({ deltaY: -8, ctrlKey: true }))
    expect(intent.kind).toBe('zoom')
    if (intent.kind === 'zoom') expect(intent.factor).toBeGreaterThan(1)
  })

  it('zooms when the modifier is held on a mouse too', () => {
    expect(wheelIntent(event({ deltaY: 100, ctrlKey: true })).kind).toBe('zoom')
  })

  it('pans sideways when shift is held with a wheel', () => {
    expect(wheelIntent(event({ deltaY: 100, shiftKey: true }))).toEqual({
      kind: 'pan',
      delta: { x: -100, y: 0 },
    })
  })

  it('keeps a trackpad swipe panning when shift is held', () => {
    expect(wheelIntent(event({ deltaX: 8, deltaY: 2, shiftKey: true }))).toEqual({
      kind: 'pan',
      delta: { x: -8, y: -2 },
    })
  })
})
