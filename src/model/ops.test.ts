import { describe, expect as vitestExpect, it } from 'vitest'
import { expect as unwrap } from './result'
import { testSchema } from './test-schema'
import {
  addIoNode,
  addNode,
  cloneSubgraph,
  connect,
  createEmpty,
  disconnect,
  disconnectPort,
  moveNodes,
  removeNodes,
  reorderIoNodes,
  setMeta,
  setProperty,
} from './ops'
import type { Microcontroller, NodeId } from './types'

const expect = vitestExpect

/** Places a node of `type` and returns [doc, id]. */
function place(doc: Microcontroller, type: string, x = 0, y = 0): [Microcontroller, NodeId] {
  const r = unwrap(addNode(testSchema, doc, { type, position: { x, y } }))
  return [r.doc, r.id]
}

describe('createEmpty', () => {
  it('starts with no nodes, wires or io pins', () => {
    const doc = createEmpty()
    expect(doc.nodes).toEqual([])
    expect(doc.wires).toEqual([])
    expect(doc.ioOrder).toEqual([])
  })

  it('accepts meta overrides', () => {
    expect(createEmpty({ name: 'Autopilot' }).meta.name).toBe('Autopilot')
  })
})

describe('addNode', () => {
  it('adds a node with a unique id and empty properties', () => {
    const doc = createEmpty()
    const [d1, a] = place(doc, 'add', 3, 4)
    const [d2, b] = place(d1, 'not')
    expect(a).not.toBe(b)
    expect(d2.nodes).toHaveLength(2)
    expect(d2.nodes[0]).toMatchObject({ type: 'add', position: { x: 3, y: 4 }, properties: {} })
  })

  it('snaps the position to whole grid units', () => {
    const [doc] = place(createEmpty(), 'add', 3.7, -0.2)
    expect(doc.nodes[0]?.position).toEqual({ x: 4, y: 0 })
  })

  it('refuses an unknown component type', () => {
    const r = addNode(testSchema, createEmpty(), { type: 'nope', position: { x: 0, y: 0 } })
    expect(r.ok).toBe(false)
  })

  it('does not mutate the input document', () => {
    const doc = createEmpty()
    place(doc, 'add')
    expect(doc.nodes).toHaveLength(0)
  })
})

describe('connect', () => {
  it('connects a matching output to an input', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'add')
    const { doc } = unwrap(
      connect(
        testSchema,
        d2,
        { node: a, kind: 'out', index: 0 },
        { node: b, kind: 'in', index: 0 },
      ),
    )
    expect(doc.wires).toHaveLength(1)
    expect(doc.wires[0]?.from.node).toBe(a)
    expect(doc.wires[0]?.to.node).toBe(b)
  })

  it('refuses mismatched signal types', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'not')
    const r = connect(
      testSchema,
      d2,
      { node: a, kind: 'out', index: 0 },
      { node: b, kind: 'in', index: 0 },
    )
    expect(r.ok).toBe(false)
  })

  it('refuses output-to-output and input-to-input', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'constant')
    expect(
      connect(
        testSchema,
        d2,
        { node: a, kind: 'out', index: 0 },
        { node: b, kind: 'out', index: 0 },
      ).ok,
    ).toBe(false)
  })

  it('refuses connecting a node to itself', () => {
    const [d1, a] = place(createEmpty(), 'add')
    expect(
      connect(testSchema, d1, { node: a, kind: 'out', index: 0 }, { node: a, kind: 'in', index: 0 })
        .ok,
    ).toBe(false)
  })

  it('refuses a port index the component does not have', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'add')
    expect(
      connect(testSchema, d2, { node: a, kind: 'out', index: 0 }, { node: b, kind: 'in', index: 5 })
        .ok,
    ).toBe(false)
  })

  it('replaces the existing wire when an input is already connected', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'constant')
    const [d3, target] = place(d2, 'add')
    const to = { node: target, kind: 'in', index: 0 } as const
    const { doc: d4 } = unwrap(connect(testSchema, d3, { node: a, kind: 'out', index: 0 }, to))
    const { doc: d5 } = unwrap(connect(testSchema, d4, { node: b, kind: 'out', index: 0 }, to))
    expect(d5.wires).toHaveLength(1)
    expect(d5.wires[0]?.from.node).toBe(b)
  })

  it('allows an output to fan out to several inputs', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'add')
    const from = { node: a, kind: 'out', index: 0 } as const
    const { doc: d3 } = unwrap(connect(testSchema, d2, from, { node: b, kind: 'in', index: 0 }))
    const { doc: d4 } = unwrap(connect(testSchema, d3, from, { node: b, kind: 'in', index: 1 }))
    expect(d4.wires).toHaveLength(2)
  })

  it('refuses a duplicate of an identical wire', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'add')
    const from = { node: a, kind: 'out', index: 0 } as const
    const to = { node: b, kind: 'in', index: 0 } as const
    const { doc: d3 } = unwrap(connect(testSchema, d2, from, to))
    expect(connect(testSchema, d3, from, to).ok).toBe(false)
  })
})

describe('removeNodes', () => {
  it('removes the nodes and every wire touching them', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'add')
    const { doc: d3 } = unwrap(
      connect(
        testSchema,
        d2,
        { node: a, kind: 'out', index: 0 },
        { node: b, kind: 'in', index: 0 },
      ),
    )
    const d4 = removeNodes(d3, [a])
    expect(d4.nodes).toHaveLength(1)
    expect(d4.wires).toHaveLength(0)
  })

  it('drops removed pins from the io order', () => {
    const { doc, id } = unwrap(
      addIoNode(testSchema, createEmpty(), { type: 'io.in.number', position: { x: 0, y: 0 } }),
    )
    expect(doc.ioOrder).toEqual([id])
    expect(removeNodes(doc, [id]).ioOrder).toEqual([])
  })
})

describe('moveNodes', () => {
  it('offsets only the listed nodes and snaps to the grid', () => {
    const [d1, a] = place(createEmpty(), 'add', 1, 1)
    const [d2, b] = place(d1, 'not', 5, 5)
    const d3 = moveNodes(d2, [a], { x: 2.4, y: -1 })
    expect(d3.nodes.find((n) => n.id === a)?.position).toEqual({ x: 3, y: 0 })
    expect(d3.nodes.find((n) => n.id === b)?.position).toEqual({ x: 5, y: 5 })
  })
})

describe('setProperty', () => {
  it('sets a property value', () => {
    const [d1, a] = place(createEmpty(), 'add')
    const d2 = unwrap(setProperty(d1, a, 'label', 'Throttle'))
    expect(d2.nodes[0]?.properties.label).toBe('Throttle')
  })

  it('refuses an unknown node', () => {
    expect(setProperty(createEmpty(), 'missing', 'label', 'x').ok).toBe(false)
  })
})

describe('disconnect', () => {
  it('removes a wire by id and by port', () => {
    const [d1, a] = place(createEmpty(), 'constant')
    const [d2, b] = place(d1, 'add')
    const { doc: d3, wireId } = unwrap(
      connect(
        testSchema,
        d2,
        { node: a, kind: 'out', index: 0 },
        { node: b, kind: 'in', index: 0 },
      ),
    )
    expect(disconnect(d3, wireId).wires).toHaveLength(0)
    expect(disconnectPort(d3, { node: b, kind: 'in', index: 0 }).wires).toHaveLength(0)
  })
})

describe('cloneSubgraph', () => {
  it('copies nodes with fresh ids, offset, keeping internal wires only', () => {
    const [d1, a] = place(createEmpty(), 'constant', 0, 0)
    const [d2, b] = place(d1, 'add', 2, 0)
    const [d3, outside] = place(d2, 'add', 8, 0)
    const { doc: d4 } = unwrap(
      connect(
        testSchema,
        d3,
        { node: a, kind: 'out', index: 0 },
        { node: b, kind: 'in', index: 0 },
      ),
    )
    const { doc: d5 } = unwrap(
      connect(
        testSchema,
        d4,
        { node: a, kind: 'out', index: 0 },
        { node: outside, kind: 'in', index: 0 },
      ),
    )
    const { doc, ids } = unwrap(cloneSubgraph(d5, [a, b], { x: 1, y: 1 }))
    expect(ids).toHaveLength(2)
    expect(doc.nodes).toHaveLength(5)
    // one original internal wire, one crossing wire, one cloned internal wire
    expect(doc.wires).toHaveLength(3)
    const cloned = doc.nodes.find((n) => n.id === ids[0])
    expect(cloned?.position).toEqual({ x: 1, y: 1 })
  })
})

describe('io pins', () => {
  it('appends to the io order and can be reordered', () => {
    const r1 = unwrap(
      addIoNode(testSchema, createEmpty(), { type: 'io.in.number', position: { x: 0, y: 0 } }),
    )
    const r2 = unwrap(
      addIoNode(testSchema, r1.doc, { type: 'io.out.number', position: { x: 0, y: 2 } }),
    )
    expect(r2.doc.ioOrder).toEqual([r1.id, r2.id])
    const reordered = unwrap(reorderIoNodes(r2.doc, [r2.id, r1.id]))
    expect(reordered.ioOrder).toEqual([r2.id, r1.id])
  })

  it('refuses a reorder that is not a permutation of the current pins', () => {
    const { doc } = unwrap(
      addIoNode(testSchema, createEmpty(), { type: 'io.in.number', position: { x: 0, y: 0 } }),
    )
    expect(reorderIoNodes(doc, []).ok).toBe(false)
  })
})

describe('setMeta', () => {
  it('renames the microcontroller', () => {
    expect(setMeta(createEmpty(), { name: 'PID' }).meta.name).toBe('PID')
  })

  it('clamps the block size to the range the game allows', () => {
    expect(setMeta(createEmpty(), { width: 0, length: 99 }).meta).toMatchObject({
      width: 1,
      length: 6,
    })
  })
})
