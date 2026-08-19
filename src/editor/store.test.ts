import { beforeEach, describe, expect, it } from 'vitest'
import { createEmpty } from '@/model/ops'
import { GRID_PX } from './layout'
import { useEditorStore } from './store'
import { DEFAULT_VIEWPORT } from './viewport'

const store = () => useEditorStore.getState()

const reset = () =>
  useEditorStore.setState({
    doc: createEmpty(),
    selection: [],
    viewport: DEFAULT_VIEWPORT,
    clipboard: null,
    problem: null,
    history: { past: [], future: [] },
  })

/** Places a component at a world position and returns its id. */
const place = (type: string, x = 0, y = 0) => {
  const id = store().addNodeAt(type, { x: x * GRID_PX, y: y * GRID_PX })
  if (!id) throw new Error(`could not place ${type}`)
  return id
}

beforeEach(reset)

describe('editing', () => {
  it('places a component at a grid position and selects it', () => {
    const id = place('arithmetic.add', 3, 2)
    expect(store().doc.nodes).toHaveLength(1)
    expect(store().doc.nodes[0]?.position).toEqual({ x: 3, y: 2 })
    expect(store().selection).toEqual([id])
  })

  it('gives a new component its default property values', () => {
    place('arithmetic.function3')
    expect(store().doc.nodes[0]?.properties.expression).toBe('x')
  })

  it('reports a refused edit instead of throwing', () => {
    store().addNodeAt('nope', { x: 0, y: 0 })
    expect(store().problem).toContain('nope')
  })

  it('deletes the selection along with its wires', () => {
    const a = place('const.number', 0, 0)
    const b = place('arithmetic.add', 8, 0)
    store().connect({ node: a, kind: 'out', index: 0 }, { node: b, kind: 'in', index: 0 })
    expect(store().doc.wires).toHaveLength(1)
    store().selectOnly([a])
    store().deleteSelection()
    expect(store().doc.nodes).toHaveLength(1)
    expect(store().doc.wires).toHaveLength(0)
  })

  it('refuses to wire mismatched signal types and says why', () => {
    const a = place('const.number')
    const b = place('logic.not', 8, 0)
    store().connect({ node: a, kind: 'out', index: 0 }, { node: b, kind: 'in', index: 0 })
    expect(store().doc.wires).toHaveLength(0)
    expect(store().problem).toContain('cannot wire')
  })
})

describe('history', () => {
  it('undoes and redoes a placement', () => {
    place('arithmetic.add')
    store().undo()
    expect(store().doc.nodes).toHaveLength(0)
    store().redo()
    expect(store().doc.nodes).toHaveLength(1)
  })

  it('treats a run of property edits on one field as a single undo step', () => {
    const id = place('const.number')
    store().setProperty(id, 'value', 1)
    store().setProperty(id, 'value', 12)
    store().setProperty(id, 'value', 123)
    store().undo()
    expect(store().doc.nodes[0]?.properties.value).toBe(0)
  })
})

describe('clipboard', () => {
  it('copies and pastes a subgraph, offset and selected', () => {
    const a = place('const.number', 0, 0)
    const b = place('arithmetic.add', 8, 0)
    store().connect({ node: a, kind: 'out', index: 0 }, { node: b, kind: 'in', index: 0 })
    store().selectOnly([a, b])
    store().copy()
    store().paste()
    expect(store().doc.nodes).toHaveLength(4)
    expect(store().doc.wires).toHaveLength(2)
    expect(store().selection).toHaveLength(2)
    const pasted = store().doc.nodes.find((n) => n.id === store().selection[0])
    expect(pasted?.position).toEqual({ x: 1, y: 1 })
  })

  it('cut removes the originals but keeps them pasteable', () => {
    const a = place('const.number')
    store().selectOnly([a])
    store().cut()
    expect(store().doc.nodes).toHaveLength(0)
    store().paste()
    expect(store().doc.nodes).toHaveLength(1)
  })
})

describe('selection', () => {
  it('selects every node touching a marquee', () => {
    const a = place('const.number', 0, 0)
    place('const.number', 40, 40)
    store().selectIn({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, false)
    expect(store().selection).toEqual([a])
  })

  it('adds to the selection when the marquee is additive', () => {
    const a = place('const.number', 0, 0)
    const b = place('const.number', 40, 0)
    store().selectOnly([b])
    store().selectIn({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, true)
    expect([...store().selection].sort()).toEqual([a, b].sort())
  })
})

describe('gestures', () => {
  it('drags a node through the interaction machine and commits one undo step', () => {
    const id = place('arithmetic.add', 0, 0)
    store().dispatch({
      type: 'pointerDown',
      target: { kind: 'node', id },
      screen: { x: 0, y: 0 },
      world: { x: 0, y: 0 },
      button: 0,
      shift: false,
      space: false,
    })
    store().dispatch({
      type: 'pointerMove',
      screen: { x: GRID_PX * 3, y: 0 },
      world: { x: GRID_PX * 3, y: 0 },
      hover: { kind: 'canvas' },
    })
    store().dispatch({ type: 'pointerUp', hover: { kind: 'canvas' } })
    expect(store().doc.nodes[0]?.position).toEqual({ x: 3, y: 0 })
    store().undo()
    expect(store().doc.nodes[0]?.position).toEqual({ x: 0, y: 0 })
  })

  it('wires two ports by dragging between them', () => {
    const a = place('const.number', 0, 0)
    const b = place('arithmetic.add', 12, 0)
    store().dispatch({
      type: 'pointerDown',
      target: { kind: 'port', port: { node: a, kind: 'out', index: 0 } },
      screen: { x: 0, y: 0 },
      world: { x: 0, y: 0 },
      button: 0,
      shift: false,
      space: false,
    })
    store().dispatch({
      type: 'pointerUp',
      hover: { kind: 'port', port: { node: b, kind: 'in', index: 0 } },
    })
    expect(store().doc.wires).toHaveLength(1)
  })

  it('pans the viewport with the middle button', () => {
    store().dispatch({
      type: 'pointerDown',
      target: { kind: 'canvas' },
      screen: { x: 0, y: 0 },
      world: { x: 0, y: 0 },
      button: 1,
      shift: false,
      space: false,
    })
    store().dispatch({
      type: 'pointerMove',
      screen: { x: 20, y: 10 },
      world: { x: 20, y: 10 },
      hover: { kind: 'canvas' },
    })
    expect(store().viewport).toMatchObject({ x: 20, y: 10 })
  })
})

describe('viewport', () => {
  it('frames the whole graph when nothing is selected', () => {
    place('arithmetic.add', 0, 0)
    place('arithmetic.add', 60, 40)
    store().selectOnly([])
    store().zoomToFit({ width: 800, height: 600 })
    expect(store().viewport.scale).toBeLessThan(1)
  })

  it('frames just the selection when there is one', () => {
    place('arithmetic.add', 0, 0)
    const b = place('arithmetic.add', 60, 40)
    store().selectOnly([b])
    store().zoomToFit({ width: 800, height: 600 })
    expect(store().viewport.scale).toBeGreaterThan(1)
  })
})

describe('components that change shape', () => {
  it('drops wires left dangling when a channel count shrinks', () => {
    const source = place('const.number', 0, 0)
    const write = place('composite.writeNumber', 12, 0)
    store().setProperty(write, 'count', 3)
    store().connect({ node: source, kind: 'out', index: 0 }, { node: write, kind: 'in', index: 3 })
    expect(store().doc.wires).toHaveLength(1)
    store().setProperty(write, 'count', 1)
    expect(store().doc.wires).toHaveLength(0)
  })
})

describe('microcontroller pins', () => {
  it('registers a placed pin in the pin order', () => {
    const pin = place('io.in.number', 0, 0)
    place('arithmetic.add', 8, 0)
    expect(store().doc.ioOrder).toEqual([pin])
  })
})
