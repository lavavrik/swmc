import { describe, expect, it } from 'vitest'
import { isDecimalDraft, parseDecimal } from './decimal'

describe('isDecimalDraft', () => {
  it('allows a separator before any following digit', () => {
    expect(isDecimalDraft('')).toBe(true)
    expect(isDecimalDraft('-')).toBe(true)
    expect(isDecimalDraft('0.')).toBe(true)
    expect(isDecimalDraft('0,')).toBe(true)
    expect(isDecimalDraft('.5')).toBe(true)
    expect(isDecimalDraft(',5')).toBe(true)
    expect(isDecimalDraft('-0.75')).toBe(true)
  })

  it('rejects a second separator or junk', () => {
    expect(isDecimalDraft('1.2.3')).toBe(false)
    expect(isDecimalDraft('1,2,3')).toBe(false)
    expect(isDecimalDraft('1.2,3')).toBe(false)
    expect(isDecimalDraft('x')).toBe(false)
  })
})

describe('parseDecimal', () => {
  it('reads a point or a comma as the decimal', () => {
    expect(parseDecimal('0.75')).toBe(0.75)
    expect(parseDecimal('0,75')).toBe(0.75)
    expect(parseDecimal('.5')).toBe(0.5)
    expect(parseDecimal(',5')).toBe(0.5)
    expect(parseDecimal('-1.5')).toBe(-1.5)
  })

  it('is null while the draft is incomplete', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('-')).toBeNull()
    expect(parseDecimal('.')).toBeNull()
    expect(parseDecimal(',')).toBeNull()
  })
})
