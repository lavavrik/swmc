import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expect as unwrap } from '@/model/result'
import { addIoNode, addNode, connect, createEmpty, setProperty } from '@/model/ops'
import { librarySchema } from '@/library/registry'
import { parseMicrocontroller, serializeMicrocontroller } from './microcontroller'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', `${name}.xml`), 'utf8')

const parse = (name: string) => unwrap(parseMicrocontroller(fixture(name)))

describe('parsing', () => {
  it('reads the microcontroller metadata', () => {
    const doc = parse('throttle')
    expect(doc.meta).toMatchObject({
      name: 'Throttle Limiter',
      description: 'Clamps the throttle',
      width: 1,
      length: 1,
    })
  })

  it('reads the pins with their labels, directions and signal types', () => {
    const doc = parse('throttle')
    const pins = doc.ioOrder.map((id) => doc.nodes.find((n) => n.id === id))
    expect(pins.map((p) => p?.type)).toEqual(['io.in.number', 'io.out.number'])
    expect(pins[0]?.properties.label).toBe('Throttle In')
    expect(pins[0]?.properties.faceX).toBe(-1)
  })

  it('reads components with their properties', () => {
    const doc = parse('throttle')
    const clamp = doc.nodes.find((n) => n.type === 'arithmetic.clamp')
    expect(clamp?.properties).toMatchObject({ min: 0, max: 0.75 })
    const fn = doc.nodes.find((n) => n.type === 'arithmetic.function3')
    expect(fn?.properties.expression).toBe('x*2')
  })

  it('reads wires, including the one feeding an output pin', () => {
    const doc = parse('throttle')
    expect(doc.wires).toHaveLength(3)
    const intoOutputPin = doc.wires.find((w) => w.to.node === 'c3')
    expect(intoOutputPin?.from.node).toBe('c5')
  })

  it('converts positions into grid units', () => {
    const doc = parse('throttle')
    const clamp = doc.nodes.find((n) => n.type === 'arithmetic.clamp')
    // x=1, y=-1 in the file, four grid units per game unit, y flipped
    expect(clamp?.position).toEqual({ x: 4, y: 4 })
  })

  it('reports a file that is not a microprocessor', () => {
    expect(parseMicrocontroller('<vehicle/>').ok).toBe(false)
  })
})

describe('unknown components', () => {
  it('keeps an unrecognised component, its attributes and its wires', () => {
    const doc = parse('unknown-component')
    const unknown = doc.nodes.find((n) => n.type === 'unknown.component')
    expect(unknown?.properties.swType).toBe(99)
    expect(unknown?.raw?.mystery).toBe('42')
    // one wire into it and one out of it, from output index 1
    expect(doc.wires).toHaveLength(2)
    expect(unknown?.properties.outputCount).toBe(2)
  })

  it('writes it back with its original type number and attributes', () => {
    const xml = serializeMicrocontroller(parse('unknown-component'))
    expect(xml).toContain('type="99"')
    expect(xml).toContain('mystery="42"')
    expect(xml).toContain('node_index="1"')
  })
})

describe('round trips', () => {
  const roundTrip = (name: string) => {
    const first = parse(name)
    const second = unwrap(parseMicrocontroller(serializeMicrocontroller(first)))
    return { first, second }
  }

  it.each(['throttle', 'unknown-component'])('preserves %s', (name) => {
    const { first, second } = roundTrip(name)
    expect(second.meta).toEqual(first.meta)
    expect(second.nodes).toEqual(first.nodes)
    expect(second.wires.map((w) => ({ from: w.from, to: w.to }))).toEqual(
      first.wires.map((w) => ({ from: w.from, to: w.to })),
    )
    expect(second.ioOrder).toEqual(first.ioOrder)
  })

  it('preserves attributes it does not model, such as the icon', () => {
    expect(serializeMicrocontroller(parse('throttle'))).toContain('sym0="255"')
  })

  it('writes a document built in the editor and reads it back', () => {
    const pin = unwrap(
      addIoNode(librarySchema, createEmpty({ name: 'Built here' }), {
        type: 'io.in.number',
        position: { x: 0, y: 0 },
      }),
    )
    const add = unwrap(
      addNode(librarySchema, pin.doc, { type: 'arithmetic.add', position: { x: 8, y: 0 } }),
    )
    const wired = unwrap(
      connect(
        librarySchema,
        add.doc,
        { node: pin.id, kind: 'out', index: 0 },
        { node: add.id, kind: 'in', index: 0 },
      ),
    )
    const labelled = unwrap(setProperty(wired.doc, pin.id, 'label', 'Speed'))

    const reloaded = unwrap(parseMicrocontroller(serializeMicrocontroller(labelled)))
    expect(reloaded.meta.name).toBe('Built here')
    expect(reloaded.nodes.map((n) => n.type)).toEqual(['io.in.number', 'arithmetic.add'])
    expect(reloaded.wires).toHaveLength(1)
    expect(reloaded.nodes[0]?.properties.label).toBe('Speed')
  })

  it('round-trips a composite write, whose ports depend on its channel count', () => {
    const write = unwrap(
      addNode(librarySchema, createEmpty(), {
        type: 'composite.writeNumber',
        position: { x: 0, y: 0 },
        properties: { channel: 3, count: 4 },
      }),
    )
    const source = unwrap(
      addNode(librarySchema, write.doc, { type: 'const.number', position: { x: -8, y: 0 } }),
    )
    const wired = unwrap(
      connect(
        librarySchema,
        source.doc,
        { node: source.id, kind: 'out', index: 0 },
        // channel 5 is the third channel port, which follows composite and start channel
        { node: write.id, kind: 'in', index: 4 },
      ),
    )
    const xml = serializeMicrocontroller(wired.doc)
    expect(xml).toContain('offset="2"')
    expect(xml).toContain('count="4"')
    expect(xml).toContain('<in3')

    const reloaded = unwrap(parseMicrocontroller(xml))
    expect(reloaded.wires[0]?.to.index).toBe(4)
    expect(
      reloaded.nodes.find((n) => n.type === 'composite.writeNumber')?.properties,
    ).toMatchObject({ channel: 3, count: 4 })
  })
})
