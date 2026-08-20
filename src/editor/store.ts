/**
 * The editor store: document, selection, viewport, gesture state and history.
 *
 * The document is only ever replaced through `model/ops`, so every invariant is
 * enforced in one place. Gestures are previewed from the interaction machine's
 * state and committed here as single undoable edits.
 */
import { create } from 'zustand'
import { getComponent, librarySchema } from '@/library/registry'
import { defaultProperties } from '@/library/defaults'
import {
  addIoNode as addIoNodeOp,
  addNode as addNodeOp,
  connect as connectOp,
  createEmpty,
  disconnect as disconnectOp,
  extractSubgraph,
  insertSubgraph,
  moveNodes as moveNodesOp,
  moveWireEnd as moveWireEndOp,
  removeNodes as removeNodesOp,
  reorderIoNodes as reorderIoNodesOp,
  pruneDanglingWires,
  setMeta as setMetaOp,
  setNodeType as setNodeTypeOp,
  setProperty as setPropertyOp,
  type Subgraph,
} from '@/model/ops'
import { incomingWire, isConnectable } from '@/model/queries'
import type {
  ComponentTypeId,
  Microcontroller,
  MicrocontrollerMeta,
  NodeId,
  Point,
  PortId,
  PropertyValue,
  WireId,
} from '@/model/types'
import { GRID_PX, cardLayout, nodeBounds } from './layout'
import { emptyHistory, push, redo, undo, type History } from './history'
import { IDLE, reduce, type InteractionEvent, type InteractionState } from './interaction/machine'
import {
  DEFAULT_VIEWPORT,
  boundsIntersect,
  fitToContent,
  panBy,
  unionBounds,
  zoomAt,
  type Bounds,
  type Size,
  type Viewport,
} from './viewport'

/** Offset applied to pasted and duplicated components, in grid units. */
const PASTE_OFFSET: Point = { x: 1, y: 1 }

export interface EditorState {
  doc: Microcontroller
  selection: readonly NodeId[]
  viewport: Viewport
  interaction: InteractionState
  history: History<Microcontroller>
  clipboard: Subgraph | null
  /** Last refused edit, for the status line. Cleared by the next successful edit. */
  problem: string | null
  /** The Lua Script component whose editor is open, if any. */
  editingScript: NodeId | null
  /** The port the monitor instrument is watching, if any. */
  monitorPort: PortId | null

  // document edits
  addNodeAt(type: ComponentTypeId, world: Point): NodeId | null
  deleteSelection(): void
  duplicateSelection(): void
  moveNodes(ids: readonly NodeId[], gridDelta: Point): void
  connect(from: PortId, to: PortId): void
  /** Moves a wire's finishing end, as dragging it off one input onto another does. */
  moveWireEnd(wire: WireId, to: PortId): void
  disconnect(wireId: WireId): void
  /** `coalesce` false starts a fresh undo step rather than folding into the last. */
  setProperty(id: NodeId, key: string, value: PropertyValue, coalesce?: boolean): void
  setMeta(meta: Partial<MicrocontrollerMeta>): void
  setNodeType(id: NodeId, type: ComponentTypeId): void
  /** Adds one of the microcontroller's pins, placed clear of the others. */
  addPin(type: ComponentTypeId): NodeId | null
  reorderPins(order: readonly NodeId[]): void

  // clipboard
  copy(): void
  cut(): void
  paste(): void

  // selection
  selectOnly(ids: readonly NodeId[]): void
  toggleSelect(id: NodeId): void
  selectIn(bounds: Bounds, additive: boolean): void
  selectAll(): void

  // viewport
  panBy(delta: Point): void
  zoomAt(anchor: Point, factor: number): void
  zoomToFit(size: Size): void

  // gestures
  dispatch(event: InteractionEvent): void

  undo(): void
  redo(): void
  openScript(id: NodeId | null): void
  watchVideo(port: PortId | null): void
  /** Replaces the whole document, e.g. after an import. Clears history. */
  load(doc: Microcontroller): void
}

/** Bounds of a node in world space, or null if its type is unknown. */
function boundsOf(doc: Microcontroller, id: NodeId): Bounds | null {
  const node = doc.nodes.find((n) => n.id === id)
  const def = node && getComponent(node.type)
  return node && def ? nodeBounds(node.position, cardLayout(def, node.properties)) : null
}

export const useEditorStore = create<EditorState>((set, get) => {
  /** Applies an edit, recording the previous document for undo. */
  const edit = (
    label: string,
    change: (doc: Microcontroller) => Microcontroller | { error: string },
    options: { coalesce?: boolean } = {},
  ) => {
    const { doc, history } = get()
    const next = change(doc)
    if ('error' in next) {
      set({ problem: next.error })
      return
    }
    if (next === doc) return
    set({
      doc: next,
      history: push(history, doc, label, options.coalesce ?? false),
      problem: null,
    })
  }

  return {
    doc: createEmpty(),
    selection: [],
    viewport: DEFAULT_VIEWPORT,
    interaction: IDLE,
    history: emptyHistory<Microcontroller>(),
    clipboard: null,
    problem: null,
    editingScript: null,
    monitorPort: null,

    addNodeAt(type, world) {
      const def = getComponent(type)
      if (!def) {
        set({ problem: `unknown component type: ${type}` })
        return null
      }
      const position = { x: world.x / GRID_PX, y: world.y / GRID_PX }
      let created: NodeId | null = null
      // Pins are registered in the microcontroller's pin order as well
      const add = def.category === 'io' ? addIoNodeOp : addNodeOp
      edit('add component', (doc) => {
        const result = add(librarySchema, doc, {
          type,
          position,
          properties: defaultProperties(def),
        })
        if (!result.ok) return { error: result.error }
        created = result.value.id
        return result.value.doc
      })
      if (created) set({ selection: [created] })
      return created
    },

    deleteSelection() {
      const ids = get().selection
      if (ids.length === 0) return
      edit('delete', (doc) => removeNodesOp(doc, ids))
      set({ selection: [] })
    },

    duplicateSelection() {
      const { doc, selection } = get()
      if (selection.length === 0) return
      const inserted = insertSubgraph(doc, extractSubgraph(doc, selection), PASTE_OFFSET)
      edit('duplicate', () => inserted.doc)
      set({ selection: inserted.ids })
    },

    moveNodes(ids, gridDelta) {
      edit('move', (doc) => moveNodesOp(doc, ids, gridDelta))
    },

    connect(from, to) {
      edit('connect', (doc) => {
        const result = connectOp(librarySchema, doc, from, to)
        return result.ok ? result.value.doc : { error: result.error }
      })
    },

    moveWireEnd(wire, to) {
      edit('move wire', (doc) => {
        const result = moveWireEndOp(librarySchema, doc, wire, to)
        return result.ok ? result.value : { error: result.error }
      })
    },

    disconnect(wireId) {
      edit('disconnect', (doc) => disconnectOp(doc, wireId))
    },

    setProperty(id, key, value, coalesce = true) {
      edit(
        `property:${id}:${key}`,
        (doc) => {
          const result = setPropertyOp(doc, id, key, value)
          if (!result.ok) return { error: result.error }
          // A property change can take ports away — drop any wire left dangling
          return pruneDanglingWires(librarySchema, result.value)
        },
        { coalesce },
      )
    },

    setNodeType(id, type) {
      edit('change type', (doc) => {
        const result = setNodeTypeOp(librarySchema, doc, id, type)
        return result.ok ? result.value : { error: result.error }
      })
    },

    addPin(type) {
      const { doc } = get()
      // Stack new pins down the left of whatever is already there
      const last = doc.ioOrder.length
      const position = { x: 0, y: last * 5 * GRID_PX }
      return get().addNodeAt(type, position)
    },

    reorderPins(order) {
      edit('reorder pins', (doc) => {
        const result = reorderIoNodesOp(doc, order)
        return result.ok ? result.value : { error: result.error }
      })
    },

    setMeta(meta) {
      edit('microcontroller settings', (doc) => setMetaOp(doc, meta), { coalesce: true })
    },

    copy() {
      const { doc, selection } = get()
      if (selection.length === 0) return
      set({ clipboard: extractSubgraph(doc, selection) })
    },

    cut() {
      get().copy()
      get().deleteSelection()
    },

    paste() {
      const { doc, clipboard } = get()
      if (!clipboard || clipboard.nodes.length === 0) return
      const inserted = insertSubgraph(doc, clipboard, PASTE_OFFSET)
      edit('paste', () => inserted.doc)
      set({ selection: inserted.ids })
    },

    selectOnly(ids) {
      set({ selection: [...ids] })
    },

    toggleSelect(id) {
      const selection = get().selection
      set({
        selection: selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id],
      })
    },

    selectIn(bounds, additive) {
      const { doc, selection } = get()
      const hits = doc.nodes
        .filter((n) => {
          const b = boundsOf(doc, n.id)
          return b !== null && boundsIntersect(bounds, b)
        })
        .map((n) => n.id)
      set({ selection: additive ? [...new Set([...selection, ...hits])] : hits })
    },

    selectAll() {
      set({ selection: get().doc.nodes.map((n) => n.id) })
    },

    panBy(delta) {
      set({ viewport: panBy(get().viewport, delta) })
    },

    zoomAt(anchor, factor) {
      set({ viewport: zoomAt(get().viewport, anchor, factor) })
    },

    zoomToFit(size) {
      const { doc, selection } = get()
      const ids = selection.length > 0 ? selection : doc.nodes.map((n) => n.id)
      const all = ids.map((id) => boundsOf(doc, id)).filter((b): b is Bounds => b !== null)
      set({ viewport: fitToContent(unionBounds(all), size) })
    },

    dispatch(event) {
      const { interaction, selection, doc } = get()
      const { state, intents } = reduce(interaction, event, {
        selection,
        canConnect: (from, to) => isConnectable(librarySchema, doc, from, to),
        wireInto: (port) => {
          const wire = incomingWire(doc, port)
          return wire ? { id: wire.id, from: wire.from } : undefined
        },
      })
      set({ interaction: state })
      for (const intent of intents) {
        switch (intent.type) {
          case 'pan':
            get().panBy(intent.delta)
            break
          case 'selectOnly':
            get().selectOnly(intent.ids)
            break
          case 'toggleSelect':
            get().toggleSelect(intent.id)
            break
          case 'selectIn':
            get().selectIn(intent.bounds, intent.additive)
            break
          case 'moveNodes':
            get().moveNodes(intent.ids, intent.gridDelta)
            break
          case 'connect':
            get().connect(intent.from, intent.to)
            break
          case 'moveWireEnd':
            get().moveWireEnd(intent.wire, intent.to)
            break
          case 'disconnect':
            get().disconnect(intent.wire)
            break
        }
      }
    },

    undo() {
      const { history, doc } = get()
      const step = undo(history, doc, 'redo')
      if (step) set({ doc: step.value, history: step.history, selection: [], problem: null })
    },

    redo() {
      const { history, doc } = get()
      const step = redo(history, doc, 'undo')
      if (step) set({ doc: step.value, history: step.history, selection: [], problem: null })
    },

    openScript(id) {
      set({ editingScript: id })
    },

    watchVideo(port) {
      set({ monitorPort: port })
    },

    load(doc) {
      set({
        editingScript: null,
        monitorPort: null,
        doc,
        selection: [],
        history: emptyHistory<Microcontroller>(),
        interaction: IDLE,
        problem: null,
      })
    },
  }
})
