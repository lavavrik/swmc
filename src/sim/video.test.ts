import { describe, expect, it } from 'vitest'
import { librarySchema } from '@/library/registry'
import { addIoNode, addNode, connect, createEmpty } from '@/model/ops'
import { expect as unwrap } from '@/model/result'
import type { Microcontroller, NodeId } from '@/model/types'
import { videoChain } from './video'

class Graph {
  doc: Microcontroller = createEmpty()

  add(type: string): NodeId {
    const r = unwrap(addNode(librarySchema, this.doc, { type, position: { x: 0, y: 0 } }))
    this.doc = r.doc
    return r.id
  }

  pin(type: string): NodeId {
    const r = unwrap(addIoNode(librarySchema, this.doc, { type, position: { x: 0, y: 0 } }))
    this.doc = r.doc
    return r.id
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

describe('videoChain', () => {
  it('finds the script behind an output pin', () => {
    const g = new Graph()
    const script = g.add('data.luaScript')
    const pin = g.pin('io.out.video')
    g.wire(script, 1, pin, 0)

    expect(videoChain(g.doc, { node: pin, kind: 'in', index: 0 })).toEqual([script])
  })

  it('follows both sides of a switchbox', () => {
    const g = new Graph()
    const a = g.add('data.luaScript')
    const b = g.add('data.luaScript')
    const box = g.add('av.videoSwitchbox')
    g.wire(a, 1, box, 0)
    g.wire(b, 1, box, 1)

    const chain = videoChain(g.doc, { node: box, kind: 'out', index: 0 })
    expect(chain).toContain(a)
    expect(chain).toContain(b)
    expect(chain).toContain(box)
  })

  it('ignores signals that are not video', () => {
    const g = new Graph()
    const number = g.add('const.number')
    const box = g.add('av.videoSwitchbox')
    // the switch input is on/off, so nothing upstream of it counts
    expect(videoChain(g.doc, { node: box, kind: 'out', index: 0 })).toEqual([box])
    expect(videoChain(g.doc, { node: number, kind: 'out', index: 0 })).toEqual([number])
  })

  it('reports nothing for an unconnected input', () => {
    const g = new Graph()
    const pin = g.pin('io.out.video')
    expect(videoChain(g.doc, { node: pin, kind: 'in', index: 0 })).toEqual([])
  })

  it('terminates on a loop', () => {
    const g = new Graph()
    const first = g.add('av.videoSwitchbox')
    const second = g.add('av.videoSwitchbox')
    g.wire(first, 0, second, 0)
    g.wire(second, 0, first, 0)
    expect(videoChain(g.doc, { node: first, kind: 'out', index: 0 }).sort()).toEqual(
      [first, second].sort(),
    )
  })
})
