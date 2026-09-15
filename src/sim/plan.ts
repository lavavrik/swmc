/**
 * Evaluation order for a graph.
 *
 * Components are evaluated in topological order so a value produced this tick
 * reaches its consumer in the same tick. Cycles cannot be ordered that way, so
 * the wires that close them are marked as back edges: they deliver the previous
 * tick's value, which is the one-tick feedback delay the game exhibits.
 */
import type { Microcontroller, NodeId, WireId } from '@/model/types'

export interface EvaluationPlan {
  readonly order: readonly NodeId[]
  /** Wires that carry a value from the previous tick. */
  readonly backEdges: ReadonlySet<WireId>
}

export function planEvaluation(doc: Microcontroller): EvaluationPlan {
  const incoming = new Map<NodeId, number>(doc.nodes.map((n) => [n.id, 0]))
  const dependents = new Map<NodeId, NodeId[]>(doc.nodes.map((n) => [n.id, []]))

  for (const wire of doc.wires) {
    if (!incoming.has(wire.to.node) || !incoming.has(wire.from.node)) continue
    incoming.set(wire.to.node, (incoming.get(wire.to.node) ?? 0) + 1)
    dependents.get(wire.from.node)?.push(wire.to.node)
  }

  // Kahn's algorithm, keeping document order among ready nodes so the result is
  // stable and predictable while editing
  const order: NodeId[] = []
  const ready = doc.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id)
  while (ready.length > 0) {
    const id = ready.shift() as NodeId
    order.push(id)
    for (const next of dependents.get(id) ?? []) {
      const remaining = (incoming.get(next) ?? 0) - 1
      incoming.set(next, remaining)
      if (remaining === 0) ready.push(next)
    }
  }

  // Cycles cannot finish Kahn. Place leftover by the same ready-list rule,
  // breaking a cycle on a node that still feeds someone (not a sink pin), so
  // an output pin after a slew still sees this tick.
  const remaining = new Set(doc.nodes.map((n) => n.id).filter((id) => !order.includes(id)))
  const leftIn = new Map([...remaining].map((id) => [id, 0]))
  for (const wire of doc.wires) {
    if (remaining.has(wire.from.node) && remaining.has(wire.to.node)) {
      leftIn.set(wire.to.node, (leftIn.get(wire.to.node) ?? 0) + 1)
    }
  }
  const nextLeftover = (): NodeId | null => {
    for (const node of doc.nodes) {
      if (remaining.has(node.id) && (leftIn.get(node.id) ?? 0) === 0) return node.id
    }
    for (const node of doc.nodes) {
      if (!remaining.has(node.id)) continue
      if ((dependents.get(node.id) ?? []).some((id) => remaining.has(id))) return node.id
    }
    for (const node of doc.nodes) if (remaining.has(node.id)) return node.id
    return null
  }
  while (remaining.size > 0) {
    const id = nextLeftover()
    if (!id) break
    remaining.delete(id)
    order.push(id)
    for (const next of dependents.get(id) ?? []) {
      if (!remaining.has(next)) continue
      leftIn.set(next, (leftIn.get(next) ?? 1) - 1)
    }
  }

  const position = new Map(order.map((id, i) => [id, i]))
  const backEdges = new Set<WireId>()
  for (const wire of doc.wires) {
    const from = position.get(wire.from.node)
    const to = position.get(wire.to.node)
    // A source evaluated at or after its consumer can only supply last tick's value
    if (from !== undefined && to !== undefined && from >= to) backEdges.add(wire.id)
  }

  return { order, backEdges }
}
