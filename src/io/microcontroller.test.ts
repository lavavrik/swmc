import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expect as unwrap } from '@/model/result'
import { addIoNode, addNode, connect, createEmpty, setProperty } from '@/model/ops'
import { getComponent, librarySchema } from '@/library/registry'
import { componentHeightUnits } from '@/library/geometry'
import { POSITION_SCALE } from './schema'
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

  it('converts positions into grid units, from the bottom edge the game stores', () => {
    const doc = parse('throttle')
    const clamp = doc.nodes.find((n) => n.type === 'arithmetic.clamp')
    // x=1, y=-1 in the file: four grid units per game unit, y flipped, and the
    // card's half-unit height taken off because the game measures its bottom
    expect(clamp?.position).toEqual({ x: 4, y: 2 })
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
        // channel 5 is the third channel port, which follows the composite input
        { node: write.id, kind: 'in', index: 3 },
      ),
    )
    const xml = serializeMicrocontroller(wired.doc)
    expect(xml).toContain('offset="2"')
    expect(xml).toContain('count="4"')
    expect(xml).toContain('<in3')

    const reloaded = unwrap(parseMicrocontroller(xml))
    expect(reloaded.wires[0]?.to.index).toBe(3)
    expect(
      reloaded.nodes.find((n) => n.type === 'composite.writeNumber')?.properties,
    ).toMatchObject({ channel: 3, count: 4 })
  })
})

describe('a microcontroller saved by the game', () => {
  const doc = parse('thermostat-v3')

  it('reads its metadata and pins', () => {
    expect(doc.meta).toMatchObject({ name: 'Thermostat V3', width: 2, length: 4 })
    expect(doc.ioOrder).toHaveLength(8)
    const first = doc.nodes.find((n) => n.id === doc.ioOrder[0])
    expect(first?.type).toBe('io.in.composite')
    expect(first?.properties.label).toBe('Dispaly')
  })

  it('reads every component, with nothing unrecognised', () => {
    expect(doc.nodes).toHaveLength(51)
    expect(doc.nodes.filter((n) => n.type === 'unknown.component')).toEqual([])
  })

  it('understands a <c> with no type attribute as a NOT', () => {
    // The game omits type="0"; the file has three of them
    expect(doc.nodes.filter((n) => n.type === 'logic.not')).toHaveLength(2)
  })

  it('reads the wires, including the named composite inputs', () => {
    expect(doc.wires).toHaveLength(64)
    // `inc` and `inoff` are the composite and start-channel inputs
    const write = doc.nodes.find((n) => n.id === 'c12')
    expect(write?.type).toBe('composite.writeNumber')
    expect(
      doc.wires
        .filter((w) => w.to.node === 'c12')
        .map((w) => w.to.index)
        .sort(),
    ).toEqual([0, 1, 2])
  })

  it('reads channel offsets, including the one that means "from the wire"', () => {
    expect(doc.nodes.find((n) => n.id === 'c12')?.properties).toMatchObject({
      channel: 7,
      count: 2,
    })
    // offset="-1" decodes to channel 0: the start channel comes from the input
    expect(doc.nodes.find((n) => n.id === 'c55')?.properties.channel).toBe(0)
  })

  it('minifies Lua on export and leaves the document untouched', () => {
    const source = String(doc.nodes.find((n) => n.type === 'data.luaScript')?.properties.script ?? '')
    expect(source.length).toBeGreaterThan(3000)
    const xml = serializeMicrocontroller(doc)
    expect(xml.length).toBeLessThan(fixture('thermostat-v3').length)
    expect(xml).toContain('function onDraw()')
    expect(String(doc.nodes.find((n) => n.type === 'data.luaScript')?.properties.script)).toBe(
      source,
    )
  })

  it('reads a script and its properties', () => {
    const script = doc.nodes.find((n) => n.type === 'data.luaScript')
    expect(String(script?.properties.script)).toContain('function onDraw()')
    const slider = doc.nodes.find((n) => n.properties.name === 'Default Temp (c)')
    expect(slider?.properties).toMatchObject({ min: -50, max: 50, value: 16, increment: 1 })
  })

  it('round-trips without losing anything it understood', () => {
    const again = unwrap(parseMicrocontroller(serializeMicrocontroller(doc, { minifyLua: false })))
    expect(again.nodes).toEqual(doc.nodes)
    expect(again.wires.map((w) => ({ from: w.from, to: w.to }))).toEqual(
      doc.wires.map((w) => ({ from: w.from, to: w.to })),
    )
    expect(again.ioOrder).toEqual(doc.ioOrder)
    expect(again.meta).toEqual(doc.meta)
  })

  it('stacks components that touch in the game so they touch here', () => {
    // In the game these three sit in a column with their edges meeting, which
    // only works out if a saved position names the component's bottom edge
    const stacked = ['c12', 'c41', 'c71'].map((id) => {
      const node = doc.nodes.find((n) => n.id === id)
      if (!node) throw new Error(id)
      const def = getComponent(node.type)
      if (!def) throw new Error(node.type)
      const height = componentHeightUnits(def, node.properties) * POSITION_SCALE
      return { id, top: node.position.y, bottom: node.position.y + height }
    })

    expect(stacked[0]?.bottom).toBe(stacked[1]?.top)
    expect(stacked[1]?.bottom).toBe(stacked[2]?.top)
    // and they are all in the same column
    const column = doc.nodes.filter((n) => ['c12', 'c41', 'c71'].includes(n.id))
    expect(new Set(column.map((n) => n.position.x)).size).toBe(1)
  })

  it('keeps the icon the game stored on it', () => {
    expect(serializeMicrocontroller(doc)).toContain('sym1="960"')
  })
})

describe('attributes this editor does not model', () => {
  it('carries the group data attribute through a round trip', () => {
    const doc = parse('thermostat-v3')
    expect(doc.meta.groupData).toEqual({ type: '1236352852' })
    expect(serializeMicrocontroller(doc)).toContain('type="1236352852"')
  })
})

describe('attributes the game leaves out', () => {
  it('reads a pulse with no mode as on-to-off, the code the game omits', () => {
    const doc = parse('thermostat-v3')
    const pulses = doc.nodes.filter((n) => n.type === 'logic.pulse')
    expect(pulses).toHaveLength(3)
    expect(pulses.every((p) => p.properties.mode === 'onToOff')).toBe(true)
  })
})
