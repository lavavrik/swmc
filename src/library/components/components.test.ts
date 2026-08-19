import { describe, expect, it } from 'vitest'
import { getComponent } from '../registry'
import { defaultProperties } from '../defaults'
import type { PropertyValue } from '@/model/types'
import type { SignalValue } from '../types'

function run(
  id: string,
  inputs: (SignalValue | undefined)[],
  props: Record<string, PropertyValue> = {},
) {
  const def = getComponent(id)
  if (!def) throw new Error(`no component ${id}`)
  return def.eval({ inputs, properties: { ...defaultProperties(def), ...props }, state: undefined })
    .outputs
}

describe('seed component evaluation', () => {
  it('adds and subtracts numbers, treating unconnected inputs as zero', () => {
    expect(run('arithmetic.add', [2, 3])).toEqual([5])
    expect(run('arithmetic.add', [2, undefined])).toEqual([2])
    expect(run('arithmetic.subtract', [2, 3])).toEqual([-1])
  })

  it('evaluates boolean logic', () => {
    expect(run('logic.and', [true, true])).toEqual([true])
    expect(run('logic.and', [true, false])).toEqual([false])
    expect(run('logic.not', [false])).toEqual([true])
  })

  it('emits constants from properties', () => {
    expect(run('const.number', [], { value: 7 })).toEqual([7])
    expect(run('const.onoff', [], { value: true })).toEqual([true])
  })

  it('reads a boolean channel out of a composite, using 1-based channel numbers', () => {
    const bools = Array.from({ length: 32 }, (_, i) => i === 3)
    const composite = { numbers: Array.from({ length: 32 }, () => 0), bools }
    expect(run('composite.readOnoff', [composite], { channel: 4 })).toEqual([true])
    expect(run('composite.readOnoff', [composite], { channel: 1 })).toEqual([false])
  })

  it('clamps an out-of-range channel into 1..32', () => {
    const bools = Array.from({ length: 32 }, (_, i) => i === 31)
    const composite = { numbers: Array.from({ length: 32 }, () => 0), bools }
    expect(run('composite.readOnoff', [composite], { channel: 99 })).toEqual([true])
  })

  it('evaluates a mathematical function over x, y and z', () => {
    expect(run('data.function', [2, 3, 4], { expression: 'x*y+z' })).toEqual([10])
  })

  it('returns zero from a function with an invalid expression', () => {
    expect(run('data.function', [1, 1, 1], { expression: ')(' })).toEqual([0])
  })

  it('leaves microcontroller input pins to be driven from outside the graph', () => {
    expect(run('io.in.number', [])).toEqual([undefined])
    expect(run('io.out.number', [1])).toEqual([])
  })
})
