import { describe, expect, it } from 'vitest'
import { expect as unwrap } from './result'
import { testSchema } from './test-schema'
import { addNode, connect, createEmpty } from './ops'
import { incomingWire, isConnectable, nodeById, outgoingWires, wiresTouching } from './queries'

function fixture() {
  const a = unwrap(
    addNode(testSchema, createEmpty(), { type: 'constant', position: { x: 0, y: 0 } }),
  )
  const b = unwrap(addNode(testSchema, a.doc, { type: 'add', position: { x: 4, y: 0 } }))
  const { doc } = unwrap(
    connect(
      testSchema,
      b.doc,
      { node: a.id, kind: 'out', index: 0 },
      { node: b.id, kind: 'in', index: 0 },
    ),
  )
  return { doc, a: a.id, b: b.id }
}

describe('queries', () => {
  it('finds a node by id', () => {
    const { doc, a } = fixture()
    expect(nodeById(doc, a)?.type).toBe('constant')
    expect(nodeById(doc, 'missing')).toBeUndefined()
  })

  it('finds the single wire feeding an input', () => {
    const { doc, a, b } = fixture()
    expect(incomingWire(doc, { node: b, kind: 'in', index: 0 })?.from.node).toBe(a)
    expect(incomingWire(doc, { node: b, kind: 'in', index: 1 })).toBeUndefined()
  })

  it('finds every wire leaving an output', () => {
    const { doc, a } = fixture()
    expect(outgoingWires(doc, { node: a, kind: 'out', index: 0 })).toHaveLength(1)
  })

  it('finds every wire touching a node', () => {
    const { doc, b } = fixture()
    expect(wiresTouching(doc, [b])).toHaveLength(1)
  })

  it('reports whether two ports could be connected', () => {
    const { doc, a, b } = fixture()
    const from = { node: a, kind: 'out', index: 0 } as const
    expect(isConnectable(testSchema, doc, from, { node: b, kind: 'in', index: 1 })).toBe(true)
    // already connected, so not connectable again
    expect(isConnectable(testSchema, doc, from, { node: b, kind: 'in', index: 0 })).toBe(false)
  })
})
