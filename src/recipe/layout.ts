/**
 * Left-to-right layers from the wiring, packed to keep wires short and level.
 *
 * Positions are grid units, the same space `GraphNode.position` uses. Agents
 * do not have to pick coordinates; an explicit `position` on a node still wins.
 *
 * Columns are a component plus a one-unit wire channel. Stacked cards touch
 * top-to-bottom. Within a column, a node sits at the median y of the nodes
 * that feed it, then packs downward.
 */
import { COMPONENT_WIDTH_UNITS, EDITOR_WIDTH_SCALE, componentHeightUnits } from '@/library/geometry'
import { getComponent } from '@/library/registry'
import { POSITION_SCALE } from '@/io/schema'
import { setPositions } from '@/model/ops'
import type { GraphNode, Microcontroller, NodeId, Point } from '@/model/types'

/** Component width plus one game unit of wire channel. */
export const COL_STRIDE =
  COMPONENT_WIDTH_UNITS * EDITOR_WIDTH_SCALE * POSITION_SCALE + POSITION_SCALE
/** Stacked cards touch; no vertical gap. */
export const ROW_GAP = 0

function heightGrid(node: GraphNode): number {
  const def = getComponent(node.type)
  if (!def) return 2
  return Math.max(2, Math.round(componentHeightUnits(def, node.properties) * POSITION_SCALE))
}

const isInputPin = (n: GraphNode) => n.type.startsWith('io.in.')
const isOutputPin = (n: GraphNode) => n.type.startsWith('io.out.')

/** Internal nodes grouped into columns: producers before consumers. */
export function layeredIds(doc: Microcontroller): NodeId[][] {
  const internal = doc.nodes.filter((n) => !isInputPin(n) && !isOutputPin(n)).map((n) => n.id)
  const remaining = new Set(internal)
  const preds = new Map<NodeId, Set<NodeId>>()
  for (const id of internal) preds.set(id, new Set())
  for (const wire of doc.wires) {
    if (!remaining.has(wire.to.node) || !remaining.has(wire.from.node)) continue
    preds.get(wire.to.node)?.add(wire.from.node)
  }

  const layers: NodeId[][] = []
  while (remaining.size > 0) {
    const ready = internal.filter((id) => {
      if (!remaining.has(id)) return false
      const pred = preds.get(id)
      if (!pred) return true
      for (const p of pred) if (remaining.has(p)) return false
      return true
    })
    const batch = ready.length > 0 ? ready : [remaining.values().next().value as NodeId]
    layers.push(batch)
    for (const id of batch) remaining.delete(id)
  }

  return layers
}

function predecessors(doc: Microcontroller, id: NodeId): NodeId[] {
  return doc.wires.filter((w) => w.to.node === id).map((w) => w.from.node)
}

function medianY(ids: readonly NodeId[], positions: ReadonlyMap<NodeId, Point>): number {
  const ys = ids
    .map((id) => positions.get(id)?.y)
    .filter((y): y is number => y !== undefined)
    .sort((a, b) => a - b)
  if (ys.length === 0) return 0
  const mid = Math.floor(ys.length / 2)
  if (ys.length % 2 === 1) return ys[mid]!
  return Math.round((ys[mid - 1]! + ys[mid]!) / 2)
}

function placeColumn(
  ids: readonly NodeId[],
  x: number,
  doc: Microcontroller,
  into: Map<NodeId, Point>,
  alignToPreds: boolean,
) {
  const order = new Map(ids.map((id, i) => [id, i]))
  const items = ids.flatMap((id) => {
    const node = doc.nodes.find((n) => n.id === id)
    if (!node) return []
    const desired = alignToPreds ? medianY(predecessors(doc, id), into) : 0
    return [{ id, node, desired, order: order.get(id) ?? 0 }]
  })
  items.sort((a, b) => a.desired - b.desired || a.order - b.order)
  let cursor = 0
  for (const item of items) {
    const y = Math.max(item.desired, cursor)
    into.set(item.id, { x, y })
    cursor = y + heightGrid(item.node) + ROW_GAP
  }
}

export function autoLayout(
  doc: Microcontroller,
  explicit: ReadonlyMap<NodeId, Point>,
): Microcontroller {
  const inputs = doc.ioOrder.filter((id) => {
    const n = doc.nodes.find((node) => node.id === id)
    return n && isInputPin(n)
  })
  const outputs = doc.ioOrder.filter((id) => {
    const n = doc.nodes.find((node) => node.id === id)
    return n && isOutputPin(n)
  })
  const layers = layeredIds(doc)
  const positions = new Map<NodeId, Point>()

  let col = 0
  placeColumn(inputs, col * COL_STRIDE, doc, positions, false)
  if (inputs.length > 0) col++
  for (const layer of layers) {
    placeColumn(layer, col * COL_STRIDE, doc, positions, true)
    col++
  }
  placeColumn(outputs, col * COL_STRIDE, doc, positions, true)

  for (const [id, point] of explicit) positions.set(id, point)
  return setPositions(doc, positions)
}
