/** Read-only questions about a document. No mutation lives here. */
import type { GraphSchema } from './schema'
import type { GraphNode, Microcontroller, NodeId, PortId, Wire } from './types'

const samePort = (a: PortId, b: PortId): boolean =>
  a.node === b.node && a.kind === b.kind && a.index === b.index

export function nodeById(doc: Microcontroller, id: NodeId): GraphNode | undefined {
  return doc.nodes.find((n) => n.id === id)
}

/** The single wire feeding an input, if any. Inputs accept at most one. */
export function incomingWire(doc: Microcontroller, input: PortId): Wire | undefined {
  return doc.wires.find((w) => samePort(w.to, input))
}

/** Every wire leaving an output. Outputs may fan out. */
export function outgoingWires(doc: Microcontroller, output: PortId): Wire[] {
  return doc.wires.filter((w) => samePort(w.from, output))
}

export function wiresTouching(doc: Microcontroller, nodeIds: readonly NodeId[]): Wire[] {
  const set = new Set(nodeIds)
  return doc.wires.filter((w) => set.has(w.from.node) || set.has(w.to.node))
}

/**
 * Whether a wire could be created between these ports right now. Used to dim
 * incompatible ports while dragging a wire.
 */
export function isConnectable(
  schema: GraphSchema,
  doc: Microcontroller,
  from: PortId,
  to: PortId,
): boolean {
  if (from.kind !== 'out' || to.kind !== 'in') return false
  if (from.node === to.node) return false
  const source = nodeById(doc, from.node)
  const target = nodeById(doc, to.node)
  if (!source || !target) return false
  const fromSignal = schema.portSignal(source.type, source.properties, 'out', from.index)
  const toSignal = schema.portSignal(target.type, target.properties, 'in', to.index)
  if (!fromSignal || fromSignal !== toSignal) return false
  return !doc.wires.some((w) => samePort(w.from, from) && samePort(w.to, to))
}

/** Signal type carried by a wire, or undefined if its source is unknown. */
export function wireSignal(schema: GraphSchema, doc: Microcontroller, wire: Wire) {
  const source = nodeById(doc, wire.from.node)
  return source
    ? schema.portSignal(source.type, source.properties, 'out', wire.from.index)
    : undefined
}
