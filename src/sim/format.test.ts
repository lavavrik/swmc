import { describe, expect, it } from 'vitest'
import { formatSignal } from './format'

describe('formatSignal', () => {
  it('shows nothing for an unconnected value', () => {
    expect(formatSignal(undefined)).toBe('')
  })

  it('shows on and off for booleans', () => {
    expect(formatSignal(true)).toBe('on')
    expect(formatSignal(false)).toBe('off')
  })

  it('trims trailing zeros from numbers', () => {
    expect(formatSignal(5)).toBe('5')
    expect(formatSignal(1.5)).toBe('1.5')
    expect(formatSignal(1 / 3)).toBe('0.333')
  })

  it('summarises a composite by how many channels carry something', () => {
    const numbers = Array.from({ length: 32 }, (_, i) => (i < 2 ? 1 : 0))
    const bools = Array.from({ length: 32 }, (_, i) => i === 0)
    expect(formatSignal({ numbers, bools })).toBe('composite (3 set)')
  })

  it('names video and audio channels', () => {
    expect(formatSignal({ kind: 'video', commands: [], width: 32, height: 32 })).toBe('video')
    expect(formatSignal({ kind: 'audio', left: 0, right: 0 })).toBe('audio')
  })
})
