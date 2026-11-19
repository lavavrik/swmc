import { describe, expect, it } from 'vitest'
import { assignPinFaces, packIoFaces } from './ioLayout'
import { addIoNode, createEmpty } from './ops'
import { expect as unwrap } from './result'
import { librarySchema } from '@/library/registry'

const auto = (dir: 'in' | 'out') => ({ dir, explicit: false, faceX: 0, faceZ: 0 })

describe('assignPinFaces', () => {
  it('keeps a single pin on a 1×1 block', () => {
    const placed = assignPinFaces([auto('in')], 1, 1)
    expect(placed).toMatchObject({ width: 1, length: 1 })
    expect(placed.faces).toEqual([{ x: 0, z: 0 }])
  })

  it('widens to 2 so an input and an output sit on opposite sides', () => {
    const placed = assignPinFaces([auto('in'), auto('out')], 1, 1)
    expect(placed).toMatchObject({ width: 2, length: 1 })
    expect(placed.faces).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ])
  })

  it('wraps extra pins inward instead of past the body', () => {
    const pins = [
      ...Array.from({ length: 7 }, () => auto('in')),
      ...Array.from({ length: 11 }, () => auto('out')),
    ]
    const placed = assignPinFaces(pins, 3, 6)
    expect(placed).toMatchObject({ width: 3, length: 6 })
    expect(placed.faces).toHaveLength(18)
    const cells = new Set(placed.faces.map((f) => `${f.x},${f.z}`))
    expect(cells.size).toBe(18)
    for (const face of placed.faces) {
      expect(face.x).toBeGreaterThanOrEqual(0)
      expect(face.x).toBeLessThan(3)
      expect(face.z).toBeGreaterThanOrEqual(0)
      expect(face.z).toBeLessThan(6)
    }
    expect(placed.faces[0]).toEqual({ x: 0, z: 0 })
    expect(placed.faces[6]).toEqual({ x: 1, z: 0 })
    expect(placed.faces[7]).toEqual({ x: 2, z: 0 })
  })
})

describe('packIoFaces', () => {
  it('keeps pins that already sit on unique on-body cells', () => {
    const a = unwrap(
      addIoNode(librarySchema, createEmpty(), { type: 'io.in.number', position: { x: 0, y: 0 } }),
    )
    let doc = { ...a.doc, meta: { ...a.doc.meta, width: 3, length: 2 } }
    doc = {
      ...doc,
      nodes: doc.nodes.map((n) =>
        n.id === a.id ? { ...n, properties: { ...n.properties, faceX: 2, faceZ: 1 } } : n,
      ),
    }
    const b = unwrap(
      addIoNode(librarySchema, doc, { type: 'io.out.number', position: { x: 0, y: 0 } }),
    )
    const kept = b.doc.nodes.find((n) => n.id === a.id)
    expect(kept?.properties).toMatchObject({ faceX: 2, faceZ: 1 })
  })

  it('writes faces onto IO nodes and grows a 1×1 that has two pins', () => {
    const a = unwrap(
      addIoNode(librarySchema, createEmpty(), { type: 'io.in.number', position: { x: 0, y: 0 } }),
    )
    const b = unwrap(
      addIoNode(librarySchema, a.doc, { type: 'io.out.number', position: { x: 0, y: 0 } }),
    )
    const doc = packIoFaces(b.doc)
    expect(doc.meta).toMatchObject({ width: 2, length: 1 })
    const inPin = doc.nodes.find((n) => n.id === a.id)
    const outPin = doc.nodes.find((n) => n.id === b.id)
    expect(inPin?.properties).toMatchObject({ faceX: 0, faceZ: 0 })
    expect(outPin?.properties).toMatchObject({ faceX: 1, faceZ: 0 })
  })
})
