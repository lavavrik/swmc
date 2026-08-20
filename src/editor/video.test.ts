import { describe, expect, it } from 'vitest'
import { librarySchema } from '@/library/registry'
import { addIoNode, addNode, createEmpty } from '@/model/ops'
import { expect as unwrap } from '@/model/result'
import type { Microcontroller } from '@/model/types'
import { canWatchVideo } from './video'

function graph() {
  const script = unwrap(
    addNode(librarySchema, createEmpty(), { type: 'data.luaScript', position: { x: 0, y: 0 } }),
  )
  const outPin = unwrap(
    addIoNode(librarySchema, script.doc, { type: 'io.out.video', position: { x: 8, y: 0 } }),
  )
  const inPin = unwrap(
    addIoNode(librarySchema, outPin.doc, { type: 'io.in.video', position: { x: -8, y: 0 } }),
  )
  return {
    doc: inPin.doc as Microcontroller,
    script: script.id,
    outPin: outPin.id,
    inPin: inPin.id,
  }
}

describe('canWatchVideo', () => {
  const { doc, script, outPin, inPin } = graph()

  it('watches a video output', () => {
    expect(canWatchVideo(doc, { node: script, kind: 'out', index: 1 })).toBe(true)
  })

  it('refuses a video input, which shows nothing a monitor should display', () => {
    expect(canWatchVideo(doc, { node: script, kind: 'in', index: 1 })).toBe(false)
  })

  it('watches a microcontroller output pin, whose port is an input here', () => {
    expect(canWatchVideo(doc, { node: outPin, kind: 'in', index: 0 })).toBe(true)
  })

  it('watches a microcontroller input pin, which feeds video into the graph', () => {
    expect(canWatchVideo(doc, { node: inPin, kind: 'out', index: 0 })).toBe(true)
  })

  it('refuses ports that do not carry video at all', () => {
    expect(canWatchVideo(doc, { node: script, kind: 'out', index: 0 })).toBe(false)
    expect(canWatchVideo(doc, { node: 'missing', kind: 'out', index: 0 })).toBe(false)
  })
})
