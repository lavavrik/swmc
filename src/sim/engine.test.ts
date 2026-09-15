import { describe, expect, it } from 'vitest'
import { librarySchema } from '@/library/registry'
import { setLuaTickHook } from '@/library/hooks'
import { addIoNode, addNode, connect, createEmpty } from '@/model/ops'
import { expect as unwrap } from '@/model/result'
import type { Microcontroller, NodeId, PropertyValue } from '@/model/types'
import { Simulation } from './engine'
import { planEvaluation } from './plan'

/** Small builder so tests read as graphs rather than as operations. */
class Graph {
  doc: Microcontroller = createEmpty()

  add(type: string, properties: Record<string, PropertyValue> = {}): NodeId {
    const result = unwrap(
      addNode(librarySchema, this.doc, { type, position: { x: 0, y: 0 }, properties }),
    )
    this.doc = result.doc
    return result.id
  }

  pin(type: string): NodeId {
    const result = unwrap(addIoNode(librarySchema, this.doc, { type, position: { x: 0, y: 0 } }))
    this.doc = result.doc
    return result.id
  }

  wire(from: NodeId, fromIndex: number, to: NodeId, toIndex: number): void {
    this.doc = unwrap(
      connect(
        librarySchema,
        this.doc,
        { node: from, kind: 'out', index: fromIndex },
        { node: to, kind: 'in', index: toIndex },
      ),
    ).doc
  }
}

describe('evaluation order', () => {
  it('evaluates a producer before its consumer', () => {
    const g = new Graph()
    const source = g.add('const.number', { value: 1 })
    const add = g.add('arithmetic.add')
    g.wire(source, 0, add, 0)
    const plan = planEvaluation(g.doc)
    expect(plan.order.indexOf(source)).toBeLessThan(plan.order.indexOf(add))
    expect(plan.backEdges.size).toBe(0)
  })

  it('marks the wire that closes a loop as a back edge', () => {
    const g = new Graph()
    const a = g.add('arithmetic.add')
    const b = g.add('arithmetic.add')
    g.wire(a, 0, b, 0)
    g.wire(b, 0, a, 0)
    expect(planEvaluation(g.doc).backEdges.size).toBe(1)
  })
})

describe('ticking', () => {
  it('propagates a value through a chain in a single tick', () => {
    const g = new Graph()
    const three = g.add('const.number', { value: 3 })
    const four = g.add('const.number', { value: 4 })
    const add = g.add('arithmetic.add')
    g.wire(three, 0, add, 0)
    g.wire(four, 0, add, 1)

    const sim = new Simulation(g.doc)
    sim.step()
    expect(sim.outputValue({ node: add, kind: 'out', index: 0 })).toBe(7)
    expect(sim.tickCount).toBe(1)
  })

  it('drives the graph from the microcontroller input pins', () => {
    const g = new Graph()
    const input = g.pin('io.in.number')
    const output = g.pin('io.out.number')
    const abs = g.add('arithmetic.abs')
    g.wire(input, 0, abs, 0)
    g.wire(abs, 0, output, 0)

    const sim = new Simulation(g.doc)
    sim.setInput(input, -5)
    sim.step()
    expect(sim.getOutput(output)).toBe(5)
  })

  it('lets a pin after a feedback loop read this tick', () => {
    const g = new Graph()
    const one = g.add('const.number', { value: 1 })
    const add = g.add('arithmetic.add')
    const feedback = g.add('arithmetic.abs')
    const out = g.pin('io.out.number')
    g.wire(one, 0, add, 0)
    g.wire(add, 0, feedback, 0)
    g.wire(feedback, 0, add, 1)
    g.wire(add, 0, out, 0)
    const sim = new Simulation(g.doc)
    sim.step()
    expect(sim.getOutput(out)).toBe(1)
  })

  it('delays a feedback loop by exactly one tick', () => {
    // A counter: add(1, last tick's total) looping back through an Abs
    const g = new Graph()
    const one = g.add('const.number', { value: 1 })
    const add = g.add('arithmetic.add')
    const feedback = g.add('arithmetic.abs')
    g.wire(one, 0, add, 0)
    g.wire(add, 0, feedback, 0)
    g.wire(feedback, 0, add, 1)

    const sim = new Simulation(g.doc)
    const seen: unknown[] = []
    for (let i = 0; i < 4; i++) {
      sim.step()
      seen.push(sim.outputValue({ node: add, kind: 'out', index: 0 }))
    }
    expect(seen).toEqual([1, 2, 3, 4])
  })

  it('keeps component state across ticks', () => {
    const g = new Graph()
    const on = g.add('const.on')
    const toggle = g.add('logic.pushToToggle')
    g.wire(on, 0, toggle, 0)

    const sim = new Simulation(g.doc)
    sim.step()
    expect(sim.outputValue({ node: toggle, kind: 'out', index: 0 })).toBe(true)
    sim.run(5)
    // Held on, so it flipped only on the first tick
    expect(sim.outputValue({ node: toggle, kind: 'out', index: 0 })).toBe(true)
  })

  it('reports what each wire is carrying', () => {
    const g = new Graph()
    const source = g.add('const.number', { value: 9 })
    const abs = g.add('arithmetic.abs')
    g.wire(source, 0, abs, 0)

    const sim = new Simulation(g.doc)
    sim.step()
    const values = [...sim.wireValues().values()]
    expect(values).toEqual([9])
  })

  it('keeps the state of components that survive an edit', () => {
    const g = new Graph()
    const on = g.add('const.on')
    const counter = g.add('arithmetic.upDownCounter', { min: 0, max: 10 })
    const pulse = g.add('logic.pulse')
    g.wire(on, 0, pulse, 0)
    g.wire(pulse, 0, counter, 0)

    const sim = new Simulation(g.doc)
    sim.run(3)
    const before = sim.outputValue({ node: counter, kind: 'out', index: 0 })

    // Adding an unrelated component must not restart the count
    g.add('arithmetic.abs')
    sim.setDocument(g.doc)
    sim.step()
    expect(sim.outputValue({ node: counter, kind: 'out', index: 0 })).toBe(before)
  })

  it('resets back to a blank slate', () => {
    const g = new Graph()
    const on = g.add('const.on')
    const toggle = g.add('logic.pushToToggle')
    g.wire(on, 0, toggle, 0)

    const sim = new Simulation(g.doc)
    sim.run(3)
    sim.reset()
    expect(sim.tickCount).toBe(0)
    expect(sim.outputValue({ node: toggle, kind: 'out', index: 0 })).toBeUndefined()
  })

  it('runs a composite round trip through read and write', () => {
    const g = new Graph()
    const value = g.add('const.number', { value: 42 })
    const write = g.add('composite.writeNumber', { channel: 7, count: 1 })
    const read = g.add('composite.readNumber', { channel: 7 })
    g.wire(value, 0, write, 1)
    g.wire(write, 0, read, 0)

    const sim = new Simulation(g.doc)
    sim.step()
    expect(sim.outputValue({ node: read, kind: 'out', index: 0 })).toBe(42)
  })
})

describe('video', () => {
  it('carries a frame from a script through a switchbox to an output pin', () => {
    const g = new Graph()
    const script = g.add('data.luaScript')
    const box = g.add('av.videoSwitchbox')
    const on = g.add('const.on')
    const pin = g.pin('io.out.video')
    g.wire(script, 1, box, 0)
    g.wire(on, 0, box, 2)
    g.wire(box, 0, pin, 0)

    // Stand in for the interpreter: every tick the script draws one rectangle
    setLuaTickHook(() => ({
      output: { numbers: [], bools: [] },
      frame: {
        kind: 'video',
        width: 32,
        height: 32,
        commands: [{ op: 'rectF', x: 0, y: 0, w: 8, h: 8 }],
      },
    }))
    try {
      const sim = new Simulation(g.doc)
      sim.step()
      const frame = sim.getOutput(pin)
      expect(frame).toMatchObject({ kind: 'video', width: 32 })
      expect((frame as unknown as { commands: unknown[] }).commands).toHaveLength(1)
    } finally {
      setLuaTickHook(null)
    }
  })

  it('passes the video input through when no monitor is watching', () => {
    const g = new Graph()
    const source = g.pin('io.in.video')
    const script = g.add('data.luaScript')
    const pin = g.pin('io.out.video')
    g.wire(source, 0, script, 1)
    g.wire(script, 1, pin, 0)

    setLuaTickHook(() => ({ output: { numbers: [], bools: [] }, frame: null }))
    try {
      const sim = new Simulation(g.doc)
      const incoming = { kind: 'video', width: 64, height: 32, commands: [] } as const
      sim.setInput(source, incoming)
      sim.step()
      expect(sim.getOutput(pin)).toEqual(incoming)
    } finally {
      setLuaTickHook(null)
    }
  })
})
