import { describe, expect, it } from 'vitest'
import { allComponents, getComponent } from '../registry'
import { defaultProperties } from '../defaults'
import { resolvePorts } from '../ports'
import type { PropertyValue } from '@/model/types'
import type { ComponentDef, SignalValue } from '../types'

const def = (id: string): ComponentDef => {
  const d = getComponent(id)
  if (!d) throw new Error(`no component ${id}`)
  return d
}

/** Evaluates one tick. */
function run(
  id: string,
  inputs: (SignalValue | undefined)[],
  props: Record<string, PropertyValue> = {},
) {
  const d = def(id)
  return d.eval({ inputs, properties: { ...defaultProperties(d), ...props }, state: undefined })
    .outputs
}

/** Evaluates a sequence of ticks, threading state, and returns each tick's outputs. */
function ticks(
  id: string,
  sequence: (SignalValue | undefined)[][],
  props: Record<string, PropertyValue> = {},
) {
  const d = def(id)
  const properties = { ...defaultProperties(d), ...props }
  let state: unknown = undefined
  return sequence.map((inputs) => {
    const result = d.eval({ inputs, properties, state })
    state = result.state
    return result.outputs
  })
}

const composite = (over: { numbers?: number[]; bools?: boolean[] } = {}) => ({
  numbers: over.numbers ?? Array.from({ length: 32 }, () => 0),
  bools: over.bools ?? Array.from({ length: 32 }, () => false),
})

describe('catalogue coverage', () => {
  it('covers every Stormworks component type from 0 to 59', () => {
    const types = allComponents()
      .map((d) => d.swType)
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b)
    expect(types).toEqual(Array.from({ length: 60 }, (_, i) => i))
  })

  it('resolves ports for every component at its default properties', () => {
    for (const d of allComponents()) {
      expect(() => resolvePorts(d, 'in', defaultProperties(d)), d.id).not.toThrow()
      expect(() => resolvePorts(d, 'out', defaultProperties(d)), d.id).not.toThrow()
    }
  })
})

describe('logic', () => {
  it('evaluates the gates', () => {
    expect(run('logic.not', [false])).toEqual([true])
    expect(run('logic.and', [true, true])).toEqual([true])
    expect(run('logic.or', [false, true])).toEqual([true])
    expect(run('logic.xor', [true, true])).toEqual([false])
    expect(run('logic.nand', [true, true])).toEqual([false])
    expect(run('logic.nor', [false, false])).toEqual([true])
  })

  it('latches, with reset winning over set', () => {
    const out = ticks('logic.srLatch', [
      [true, false],
      [false, false],
      [false, true],
      [false, false],
      [true, true],
    ])
    expect(out.map((o) => o[0])).toEqual([true, true, false, false, false])
    expect(out[0]?.[1]).toBe(false)
  })

  it('toggles on each rising edge, not while held', () => {
    const out = ticks('logic.pushToToggle', [[true], [true], [false], [true]])
    expect(out.map((o) => o[0])).toEqual([true, true, true, false])
  })

  it('flips a JK flip flop and clears it on reset', () => {
    const out = ticks('logic.jkFlipFlop', [
      [true, false],
      [false, false],
      [true, false],
      [false, true],
    ])
    expect(out.map((o) => o[0])).toEqual([true, true, false, false])
  })

  it('pulses for a single tick on the chosen edge', () => {
    const out = ticks('logic.pulse', [[false], [true], [true], [false]])
    expect(out.map((o) => o[0])).toEqual([false, true, false, false])
    const falling = ticks('logic.pulse', [[true], [false], [false]], { mode: 'onToOff' })
    expect(falling.map((o) => o[0])).toEqual([false, true, false])
  })

  it('delays a capacitor turning on and extends it afterwards', () => {
    const charge = 3 / 60
    const held = Array.from({ length: 4 }, () => [true])
    const released = Array.from({ length: 2 }, () => [false])
    const out = ticks('logic.capacitor', [...held, ...released], {
      charge,
      discharge: charge,
    })
    expect(out[0]?.[0]).toBe(false)
    expect(out[2]?.[0]).toBe(true)
    // still on immediately after release, because it discharges over time
    expect(out[4]?.[0]).toBe(true)
  })

  it('blinks while enabled and rests while disabled', () => {
    const enabled = Array.from({ length: 6 }, () => [true])
    const out = ticks('logic.blinker', [...enabled, [false]], {
      onDuration: 2 / 60,
      offDuration: 2 / 60,
    })
    expect(out.map((o) => o[0])).toEqual([false, true, true, false, false, true, false])
  })

  it('evaluates boolean functions', () => {
    expect(run('logic.function4', [true, false, false, false], { expression: 'x & !y' })).toEqual([
      true,
    ])
    expect(
      run('logic.function8', [false, false, false, false, true, false, false, false], {
        expression: 'a | b',
      }),
    ).toEqual([true])
  })
})

describe('arithmetic', () => {
  it('evaluates the basic operations, treating unconnected inputs as zero', () => {
    expect(run('arithmetic.add', [2, 3])).toEqual([5])
    expect(run('arithmetic.subtract', [2, 3])).toEqual([-1])
    expect(run('arithmetic.multiply', [2, 3])).toEqual([6])
    expect(run('arithmetic.divide', [6, 3])).toEqual([2])
    expect(run('arithmetic.divide', [6, 0])).toEqual([0])
    expect(run('arithmetic.modulo', [-1, 3])).toEqual([2])
    expect(run('arithmetic.abs', [-4])).toEqual([4])
    expect(run('arithmetic.add', [2, undefined])).toEqual([2])
  })

  it('clamps to its configured range', () => {
    expect(run('arithmetic.clamp', [5], { min: 0, max: 1 })).toEqual([1])
    expect(run('arithmetic.clamp', [-5], { min: 0, max: 1 })).toEqual([0])
  })

  it('reports the change since the previous tick, starting at zero', () => {
    expect(ticks('arithmetic.delta', [[5], [7], [7]]).map((o) => o[0])).toEqual([0, 2, 0])
  })

  it('evaluates functions of one, three and eight inputs', () => {
    expect(run('arithmetic.function1', [3], { expression: 'x^2' })).toEqual([9])
    expect(run('arithmetic.function3', [2, 3, 4], { expression: 'x*y+z' })).toEqual([10])
    expect(run('arithmetic.function3', [1, 1, 1], { expression: ')(' })).toEqual([0])
    expect(
      run('arithmetic.function8', [1, 2, 3, 4, 5, 6, 7, 8], { expression: 'x+y+z+w+a+b+c+d' }),
    ).toEqual([36])
  })

  it('routes numbers through junctions and switchboxes', () => {
    expect(run('arithmetic.numericalJunction', [7, false])).toEqual([7, 0])
    expect(run('arithmetic.numericalJunction', [7, true])).toEqual([0, 7])
    expect(run('arithmetic.numericalSwitchbox', [1, 2, true])).toEqual([1])
    expect(run('arithmetic.numericalSwitchbox', [1, 2, false])).toEqual([2])
  })

  it('counts up and down on rising edges, clamped to its limits', () => {
    const out = ticks(
      'arithmetic.upDownCounter',
      [
        [true, false, false],
        [false, false, false],
        [true, false, false],
        [false, true, false],
        [false, false, true],
      ],
      { increment: 1, min: 0, max: 2 },
    )
    expect(out.map((o) => o[0])).toEqual([1, 1, 2, 1, 0])
  })

  it('holds a value in the memory register until written or reset', () => {
    const out = ticks('arithmetic.memoryRegister', [
      [5, true, false],
      [9, false, false],
      [9, false, true],
    ])
    expect(out.map((o) => o[0])).toEqual([5, 5, 0])
  })

  it('drives a PID output towards its setpoint and stays idle when inactive', () => {
    expect(run('arithmetic.pid', [1, 0, false])).toEqual([0])
    const out = ticks(
      'arithmetic.pid',
      [
        [1, 0, true],
        [1, 0, true],
      ],
      { kp: 1, ki: 0.5, kd: 0 },
    )
    expect(out[0]?.[0]).toBeCloseTo(1.5)
    expect(out[1]?.[0]).toBeCloseTo(2)
  })

  it('takes PID gains from inputs in the advanced variant', () => {
    expect(run('arithmetic.pidAdvanced', [2, 0, 3, 0, 0, true])).toEqual([6])
  })
})

describe('comparison', () => {
  it('compares numbers', () => {
    expect(run('comparison.greaterThan', [2, 1])).toEqual([true])
    expect(run('comparison.lessThan', [2, 1])).toEqual([false])
    expect(run('comparison.equal', [1, 1.05], { epsilon: 0.1 })).toEqual([true])
    expect(run('comparison.equal', [1, 1.05], { epsilon: 0 })).toEqual([false])
    expect(run('comparison.threshold', [0.5], { min: 0, max: 1 })).toEqual([true])
    expect(run('comparison.threshold', [1.5], { min: 0, max: 1 })).toEqual([false])
  })
})

describe('constants', () => {
  it('emits fixed values', () => {
    expect(run('const.number', [], { value: 7 })).toEqual([7])
    expect(run('const.on', [])).toEqual([true])
  })
})

describe('timers', () => {
  it('delays turning on until the duration has elapsed', () => {
    const out = ticks(
      'timer.ton',
      [
        [true, 3],
        [true, 3],
        [true, 3],
        [false, 3],
      ],
      { units: 'ticks' },
    )
    expect(out.map((o) => o[0])).toEqual([false, false, true, false])
  })

  it('stays on for the duration after the enable input drops', () => {
    const out = ticks(
      'timer.tof',
      [
        [true, 2],
        [false, 2],
        [false, 2],
        [false, 2],
      ],
      { units: 'ticks' },
    )
    expect(out.map((o) => o[0])).toEqual([true, true, true, false])
  })

  it('accumulates across interruptions until reset', () => {
    const out = ticks(
      'timer.rto',
      [
        [true, 2],
        [false, 2],
        [true, 2],
        [false, 2],
        [false, 2],
      ],
      { units: 'ticks' },
    )
    expect(out.map((o) => o[0])).toEqual([false, false, true, true, true])
    expect(
      ticks(
        'timer.rto',
        [
          [true, 2],
          [false, 2, true],
        ],
        { units: 'ticks' },
      )[1]?.[0],
    ).toBe(false)
  })

  it('counts disabled time in the retentive off-delay', () => {
    const out = ticks(
      'timer.rtf',
      [
        [true, 2],
        [false, 2],
        [false, 2],
        [false, 2],
      ],
      { units: 'ticks' },
    )
    expect(out.map((o) => o[0])).toEqual([true, true, false, false])
  })
})

describe('composite', () => {
  it('reads a channel using 1-based channel numbers', () => {
    const bools = Array.from({ length: 32 }, (_, i) => i === 3)
    expect(run('composite.readOnoff', [composite({ bools })], { channel: 4, count: 1 })).toEqual([
      true,
    ])
    expect(run('composite.readOnoff', [composite({ bools })], { channel: 1, count: 1 })).toEqual([
      false,
    ])
  })

  it('reads several channels at once', () => {
    const numbers = Array.from({ length: 32 }, (_, i) => i)
    const outputs = run('composite.readNumber', [composite({ numbers })], { channel: 2, count: 3 })
    expect(outputs).toEqual([1, 2, 3])
  })

  it('writes channels without disturbing the rest of the signal', () => {
    const numbers = Array.from({ length: 32 }, () => 9)
    const [written] = run('composite.writeNumber', [composite({ numbers }), 1, 2], {
      channel: 5,
      count: 2,
    })
    const result = written as { numbers: number[]; bools: boolean[] }
    expect(result.numbers[4]).toBe(1)
    expect(result.numbers[5]).toBe(2)
    expect(result.numbers[0]).toBe(9)
  })

  it('exposes one input port per channel it writes', () => {
    const write = def('composite.writeOnoff')
    expect(resolvePorts(write, 'in', { channel: 1, count: 4 })).toHaveLength(5)
    expect(resolvePorts(write, 'in', { channel: 1, count: 1 })).toHaveLength(2)
  })

  it('never addresses a channel past 32', () => {
    expect(
      resolvePorts(def('composite.readNumber'), 'out', { channel: 31, count: 8 }),
    ).toHaveLength(2)
  })

  it('switches between two composite signals', () => {
    const on = composite({ numbers: Array.from({ length: 32 }, () => 1) })
    const off = composite()
    expect((run('composite.switchbox', [on, off, true])[0] as typeof on).numbers[0]).toBe(1)
    expect((run('composite.switchbox', [on, off, false])[0] as typeof on).numbers[0]).toBe(0)
  })

  it('round-trips a number through its binary channels', () => {
    const [binary] = run('composite.numberToBinary', [37])
    expect(run('composite.binaryToNumber', [binary])).toEqual([37])
  })
})

describe('properties and tooltips', () => {
  it('emits the configured property values', () => {
    expect(run('property.number', [], { value: 3 })).toEqual([3])
    expect(run('property.toggle', [], { value: true })).toEqual([true])
    expect(run('property.slider', [], { value: 2, min: 0, max: 1 })).toEqual([1])
    expect(run('property.dropdown', [], { value: 2 })).toEqual([2])
    expect(run('property.text', [], { value: 'hello' })).toEqual([])
  })

  it('tooltips consume a value without producing one', () => {
    expect(run('tooltip.number', [5, false])).toEqual([])
    expect(run('tooltip.onoff', [true])).toEqual([])
  })
})

describe('video, audio and lua', () => {
  it('switches video and audio channels', () => {
    const on = { kind: 'video', source: 'a' } as const
    const off = { kind: 'video', source: 'b' } as const
    expect(run('av.videoSwitchbox', [on, off, true])).toEqual([on])
    expect(run('av.audioSwitchbox', [on, off, false])).toEqual([off])
  })

  it('passes signals through the lua script component until the runtime lands', () => {
    const value = composite({ numbers: Array.from({ length: 32 }, () => 4) })
    expect(run('data.luaScript', [value, undefined])[0]).toEqual(value)
  })
})

describe('microcontroller pins', () => {
  it('leaves input pins to be driven from outside the graph', () => {
    expect(run('io.in.number', [])).toEqual([undefined])
    expect(run('io.out.number', [1])).toEqual([])
  })
})
