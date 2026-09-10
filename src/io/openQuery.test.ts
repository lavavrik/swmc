import { describe, expect, it } from 'vitest'
import { openParam, xmlPathFromOpen } from './openQuery'

describe('xmlPathFromOpen', () => {
  it('accepts a slug, with or without .xml', () => {
    expect(xmlPathFromOpen('hybrid-car')).toEqual({
      ok: true,
      value: '/microcontrollers/hybrid-car.xml',
    })
    expect(xmlPathFromOpen('hybrid-car.xml')).toEqual({
      ok: true,
      value: '/microcontrollers/hybrid-car.xml',
    })
  })

  it('takes the basename of a path', () => {
    expect(xmlPathFromOpen('microcontrollers/throttle-limiter.xml')).toEqual({
      ok: true,
      value: '/microcontrollers/throttle-limiter.xml',
    })
  })

  it('refuses a slug that is not a file name', () => {
    expect(xmlPathFromOpen('..').ok).toBe(false)
    expect(xmlPathFromOpen('').ok).toBe(false)
    expect(xmlPathFromOpen('/').ok).toBe(false)
  })
})

describe('openParam', () => {
  it('reads ?open=', () => {
    expect(openParam('?open=hybrid-car')).toBe('hybrid-car')
    expect(openParam('open=hybrid-car')).toBe('hybrid-car')
    expect(openParam('')).toBeNull()
    expect(openParam('?x=1')).toBeNull()
  })
})
