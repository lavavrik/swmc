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

  // Whatever is left sits in a cycle; append it in document order
  const placed = new Set(order)
  for (const node of doc.nodes) if (!placed.has(node.id)) order.push(node.id)

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
