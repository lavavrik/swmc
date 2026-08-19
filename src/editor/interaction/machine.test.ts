import { describe, expect, it } from 'vitest'
import { GRID_PX } from '../layout'
import { IDLE, reduce, type InteractionContext, type InteractionEvent } from './machine'
import type { PortId } from '@/model/types'

const ctx = (selection: string[] = [], canConnect = true): InteractionContext => ({
  selection,
  canConnect: () => canConnect,
})

const down = (e: Partial<InteractionEvent & { type: 'pointerDown' }> = {}): InteractionEvent => ({
  type: 'pointerDown',
  target: { kind: 'canvas' },
  screen: { x: 0, y: 0 },
  world: { x: 0, y: 0 },
  button: 0,
  shift: false,
  space: false,
  ...e,
})

const move = (world: { x: number; y: number }, hover = { kind: 'canvas' } as const): InteractionEvent => ({
  type: 'pointerMove',
  screen: world,
  world,
  hover,
})

const up = (hover = { kind: 'canvas' } as const): InteractionEvent => ({ type: 'pointerUp', hover })

const out = (port: string, index = 0): PortId => ({ node: port, kind: 'out', index })
const inp = (port: string, index = 0): PortId => ({ node: port, kind: 'in', index })

describe('panning', () => {
  it('pans with the middle button', () => {
    const a = reduce(IDLE, down({ button: 1 }), ctx())
    expect(a.state.kind).toBe('panning')
    const b = reduce(a.state, move({ x: 10, y: 5 }), ctx())
    expect(b.intents).toEqual([{ type: 'pan', delta: { x: 10, y: 5 } }])
    expect(reduce(b.state, up(), ctx()).state).toEqual(IDLE)
  })

  it('pans with the left button while space is held', () => {
    expect(reduce(IDLE, down({ space: true }), ctx()).state.kind).toBe('panning')
  })
})

describe('selection', () => {
  it('selects a node on pointer down and starts a drag', () => {
    const r = reduce(IDLE, down({ target: { kind: 'node', id: 'c1' } }), ctx())
    expect(r.intents).toEqual([{ type: 'selectOnly', ids: ['c1'] }])
    expect(r.state.kind).toBe('draggingNodes')
  })

  it('keeps a multi-selection when dragging one of its members', () => {
    const r = reduce(IDLE, down({ target: { kind: 'node', id: 'c1' } }), ctx(['c1', 'c2']))
    expect(r.intents).toEqual([])
    expect(r.state).toMatchObject({ kind: 'draggingNodes', nodes: ['c1', 'c2'] })
  })

  it('adds to the selection with shift', () => {
    const r = reduce(IDLE, down({ target: { kind: 'node', id: 'c3' }, shift: true }), ctx(['c1']))
    expect(r.intents).toEqual([{ type: 'toggleSelect', id: 'c3' }])
  })

  it('clears the selection when the empty canvas is clicked', () => {
    const r = reduce(IDLE, down(), ctx(['c1']))
    expect(r.intents).toEqual([{ type: 'selectOnly', ids: [] }])
    expect(r.state.kind).toBe('marquee')
  })

  it('selects everything inside the marquee on release', () => {
    const a = reduce(IDLE, down({ world: { x: 10, y: 10 } }), ctx())
    const b = reduce(a.state, move({ x: 60, y: 40 }), ctx())
    const c = reduce(b.state, up(), ctx())
    expect(c.intents).toEqual([
      { type: 'selectIn', bounds: { minX: 10, minY: 10, maxX: 60, maxY: 40 }, additive: false },
    ])
    expect(c.state).toEqual(IDLE)
  })

  it('ignores a marquee that never moved', () => {
    const a = reduce(IDLE, down({ world: { x: 10, y: 10 } }), ctx())
    expect(reduce(a.state, up(), ctx()).intents).toEqual([])
  })
})

describe('dragging nodes', () => {
  it('snaps the drag to whole grid units and commits on release', () => {
    const a = reduce(IDLE, down({ target: { kind: 'node', id: 'c1' } }), ctx(['c1']))
    const b = reduce(a.state, move({ x: GRID_PX * 2 + 3, y: -GRID_PX }), ctx(['c1']))
    expect(b.state).toMatchObject({ gridDelta: { x: 2, y: -1 } })
    const c = reduce(b.state, up(), ctx(['c1']))
    expect(c.intents).toEqual([{ type: 'moveNodes', ids: ['c1'], gridDelta: { x: 2, y: -1 } }])
  })

  it('commits nothing when the node did not move a whole unit', () => {
    const a = reduce(IDLE, down({ target: { kind: 'node', id: 'c1' } }), ctx(['c1']))
    const b = reduce(a.state, move({ x: 2, y: 2 }), ctx(['c1']))
    expect(reduce(b.state, up(), ctx(['c1'])).intents).toEqual([])
  })

  it('abandons the drag on escape', () => {
    const a = reduce(IDLE, down({ target: { kind: 'node', id: 'c1' } }), ctx(['c1']))
    const b = reduce(a.state, move({ x: 100, y: 0 }), ctx(['c1']))
    const c = reduce(b.state, { type: 'escape' }, ctx(['c1']))
    expect(c.state).toEqual(IDLE)
    expect(c.intents).toEqual([])
  })
})

describe('dragging wires', () => {
  it('connects an output dropped onto a compatible input', () => {
    const a = reduce(IDLE, down({ target: { kind: 'port', port: out('c1') } }), ctx())
    expect(a.state.kind).toBe('draggingWire')
    const b = reduce(a.state, up({ kind: 'port', port: inp('c2') } as never), ctx())
    expect(b.intents).toEqual([{ type: 'connect', from: out('c1'), to: inp('c2') }])
  })

  it('orients the wire when dragged from an input to an output', () => {
    const a = reduce(IDLE, down({ target: { kind: 'port', port: inp('c2') } }), ctx())
    const b = reduce(a.state, up({ kind: 'port', port: out('c1') } as never), ctx())
    expect(b.intents).toEqual([{ type: 'connect', from: out('c1'), to: inp('c2') }])
  })

  it('drops the wire when released on an incompatible port', () => {
    const a = reduce(IDLE, down({ target: { kind: 'port', port: out('c1') } }), ctx([], false))
    const b = reduce(a.state, up({ kind: 'port', port: inp('c2') } as never), ctx([], false))
    expect(b.intents).toEqual([])
    expect(b.state).toEqual(IDLE)
  })

  it('drops the wire when released over empty canvas', () => {
    const a = reduce(IDLE, down({ target: { kind: 'port', port: out('c1') } }), ctx())
    expect(reduce(a.state, up(), ctx()).intents).toEqual([])
  })

  it('remembers the hovered port so the view can highlight it', () => {
    const a = reduce(IDLE, down({ target: { kind: 'port', port: out('c1') } }), ctx())
    const b = reduce(a.state, move({ x: 50, y: 0 }, { kind: 'port', port: inp('c2') } as never), ctx())
    expect(b.state).toMatchObject({ hover: inp('c2') })
  })
})
