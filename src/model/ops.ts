/**
 * Every graph mutation lives here as a pure function of the document.
 *
 * Operations that a user can plausibly get wrong return a `Result` with a
 * human-readable reason; operations that cannot fail return the document
 * directly. Nothing here throws on user error, and nothing mutates its input.
 */
import { err, ok, type Result } from './result'
import type { GraphSchema } from './schema'
import type {
  ComponentTypeId,
  GraphNode,
  Microcontroller,
  MicrocontrollerMeta,
  NodeId,
  Point,
  PortId,
  PropertyValue,
  Wire,
  WireId,
} from './types'

const DEFAULT_META: MicrocontrollerMeta = {
  name: 'New microcontroller',
  description: '',
  width: 1,
  length: 1,
}

export function createEmpty(meta: Partial<MicrocontrollerMeta> = {}): Microcontroller {
  return {
    meta: { ...DEFAULT_META, ...meta },
    nodes: [],
    wires: [],
    ioOrder: [],
    idCounter: 1,
  }
}

/** Rounds to whole grid units. `+ 0` normalises -0, which would leak into saved files. */
const snap = (p: Point): Point => ({ x: Math.round(p.x) + 0, y: Math.round(p.y) + 0 })

const samePort = (a: PortId, b: PortId): boolean =>
  a.node === b.node && a.kind === b.kind && a.index === b.index

export interface AddNodeArgs {
  type: ComponentTypeId
  position: Point
  properties?: Record<string, PropertyValue>
}

export interface AddNodeResult {
  doc: Microcontroller
  id: NodeId
}

export function addNode(
  schema: GraphSchema,
  doc: Microcontroller,
  args: AddNodeArgs,
): Result<AddNodeResult> {
  if (!schema.has(args.type)) return err(`unknown component type: ${args.type}`)
  const id: NodeId = `c${doc.idCounter}`
  const node: GraphNode = {
    id,
    type: args.type,
    position: snap(args.position),
    properties: { ...(args.properties ?? {}) },
  }
  return ok({
    doc: { ...doc, nodes: [...doc.nodes, node], idCounter: doc.idCounter + 1 },
    id,
  })
}

/** Adds a node and registers it as one of the microcontroller's external pins. */
export function addIoNode(
  schema: GraphSchema,
  doc: Microcontroller,
  args: AddNodeArgs,
): Result<AddNodeResult> {
  const added = addNode(schema, doc, args)
  if (!added.ok) return added
  return ok({
    id: added.value.id,
    doc: { ...added.value.doc, ioOrder: [...added.value.doc.ioOrder, added.value.id] },
  })
}

export function removeNodes(doc: Microcontroller, ids: readonly NodeId[]): Microcontroller {
  const doomed = new Set(ids)
  if (doomed.size === 0) return doc
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !doomed.has(n.id)),
    wires: doc.wires.filter((w) => !doomed.has(w.from.node) && !doomed.has(w.to.node)),
    ioOrder: doc.ioOrder.filter((id) => !doomed.has(id)),
  }
}

export function moveNodes(
  doc: Microcontroller,
  ids: readonly NodeId[],
  delta: Point,
): Microcontroller {
  const moving = new Set(ids)
  if (moving.size === 0) return doc
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      moving.has(n.id)
        ? { ...n, position: snap({ x: n.position.x + delta.x, y: n.position.y + delta.y }) }
        : n,
    ),
  }
}

/** Places nodes at absolute positions. Used when a drag ends on a known target. */
export function setPositions(
  doc: Microcontroller,
  positions: ReadonlyMap<NodeId, Point>,
): Microcontroller {
  if (positions.size === 0) return doc
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const p = positions.get(n.id)
      return p ? { ...n, position: snap(p) } : n
    }),
  }
}

export interface ConnectResult {
  doc: Microcontroller
  wireId: WireId
}

/**
 * Connects an output to an input. The input's existing wire, if any, is
 * replaced — the game allows only one source per input.
 */
export function connect(
  schema: GraphSchema,
  doc: Microcontroller,
  from: PortId,
  to: PortId,
): Result<ConnectResult> {
  if (from.kind !== 'out') return err('a wire must start at an output')
  if (to.kind !== 'in') return err('a wire must end at an input')
  if (from.node === to.node) return err('a component cannot be wired to itself')

  const source = doc.nodes.find((n) => n.id === from.node)
  const target = doc.nodes.find((n) => n.id === to.node)
  if (!source) return err(`no such component: ${from.node}`)
  if (!target) return err(`no such component: ${to.node}`)

  const fromSignal = schema.portSignal(source.type, 'out', from.index)
  const toSignal = schema.portSignal(target.type, 'in', to.index)
  if (!fromSignal) return err(`output ${from.index} does not exist on ${source.type}`)
  if (!toSignal) return err(`input ${to.index} does not exist on ${target.type}`)
  if (fromSignal !== toSignal) return err(`cannot wire ${fromSignal} to ${toSignal}`)

  if (doc.wires.some((w) => samePort(w.from, from) && samePort(w.to, to)))
    return err('these ports are already connected')

  const wireId: WireId = `w${doc.idCounter}`
  const wire: Wire = { id: wireId, from, to }
  return ok({
    wireId,
    doc: {
      ...doc,
      wires: [...doc.wires.filter((w) => !samePort(w.to, to)), wire],
      idCounter: doc.idCounter + 1,
    },
  })
}

export function disconnect(doc: Microcontroller, wireId: WireId): Microcontroller {
  return { ...doc, wires: doc.wires.filter((w) => w.id !== wireId) }
}

/** Removes every wire attached to a port. */
export function disconnectPort(doc: Microcontroller, port: PortId): Microcontroller {
  return {
    ...doc,
    wires: doc.wires.filter((w) => !samePort(w.from, port) && !samePort(w.to, port)),
  }
}

export function setProperty(
  doc: Microcontroller,
  nodeId: NodeId,
  key: string,
  value: PropertyValue,
): Result<Microcontroller> {
  if (!doc.nodes.some((n) => n.id === nodeId)) return err(`no such component: ${nodeId}`)
  return ok({
    ...doc,
    nodes: doc.nodes.map((n) =>
      n.id === nodeId ? { ...n, properties: { ...n.properties, [key]: value } } : n,
    ),
  })
}

/** Renames or resizes the microcontroller itself. */
export function setMeta(doc: Microcontroller, meta: Partial<MicrocontrollerMeta>): Microcontroller {
  const width = clampSize(meta.width ?? doc.meta.width)
  const length = clampSize(meta.length ?? doc.meta.length)
  return { ...doc, meta: { ...doc.meta, ...meta, width, length } }
}

/** The game allows microcontroller blocks from 1x1 up to 6x6. */
const clampSize = (n: number): number => Math.min(6, Math.max(1, Math.round(n)))

export function reorderIoNodes(
  doc: Microcontroller,
  order: readonly NodeId[],
): Result<Microcontroller> {
  const current = [...doc.ioOrder].sort()
  const next = [...order].sort()
  const same = current.length === next.length && current.every((id, i) => id === next[i])
  if (!same) return err('the new order must contain exactly the current pins')
  return ok({ ...doc, ioOrder: [...order] })
}

export interface Subgraph {
  readonly nodes: readonly GraphNode[]
  readonly wires: readonly Wire[]
}

export interface InsertResult {
  doc: Microcontroller
  /** New ids, in the same order as the incoming nodes. */
  ids: NodeId[]
}

/**
 * Lifts a set of nodes and the wires *between* them out of a document. Wires
 * crossing the selection boundary are deliberately dropped — the same
 * behaviour as copy in the game.
 */
export function extractSubgraph(doc: Microcontroller, ids: readonly NodeId[]): Subgraph {
  const wanted = new Set(ids)
  const nodes = doc.nodes.filter((n) => wanted.has(n.id))
  const wires = doc.wires.filter((w) => wanted.has(w.from.node) && wanted.has(w.to.node))
  return { nodes, wires }
}

/** Adds a subgraph to a document under fresh ids, offset by whole grid units. */
export function insertSubgraph(doc: Microcontroller, sub: Subgraph, offset: Point): InsertResult {
  let counter = doc.idCounter
  const idMap = new Map<NodeId, NodeId>()
  const nodes: GraphNode[] = sub.nodes.map((n) => {
    const id: NodeId = `c${counter++}`
    idMap.set(n.id, id)
    return {
      ...n,
      id,
      position: snap({ x: n.position.x + offset.x, y: n.position.y + offset.y }),
      properties: { ...n.properties },
    }
  })

  const wires: Wire[] = []
  for (const w of sub.wires) {
    const from = idMap.get(w.from.node)
    const to = idMap.get(w.to.node)
    if (!from || !to) continue
    wires.push({ id: `w${counter++}`, from: { ...w.from, node: from }, to: { ...w.to, node: to } })
  }

  return {
    ids: nodes.map((n) => n.id),
    doc: {
      ...doc,
      nodes: [...doc.nodes, ...nodes],
      wires: [...doc.wires, ...wires],
      idCounter: counter,
    },
  }
}

/** Duplicates nodes in place: extract, then insert under new ids. */
export function cloneSubgraph(
  doc: Microcontroller,
  sourceIds: readonly NodeId[],
  offset: Point,
): Result<InsertResult> {
  const sub = extractSubgraph(doc, sourceIds)
  if (sub.nodes.length !== sourceIds.length)
    return err('cannot copy a component that is not present')
  return ok(insertSubgraph(doc, sub, offset))
}
