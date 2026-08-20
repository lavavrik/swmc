/**
 * Following a video signal back to whatever produces it.
 *
 * A monitor needs to tell the script at the far end how big its screen is —
 * that is what `screen.getWidth()` answers — and the script may sit behind any
 * number of switchboxes and output pins. This walks the video wires backwards
 * and reports every node the signal passes through on its way.
 */
import { getComponent } from '@/library/registry'
import { resolvePorts } from '@/library/ports'
import type { Microcontroller, NodeId, PortId } from '@/model/types'

/**
 * Every node upstream of `port` along video wires, including the node the port
 * belongs to. Cycles are handled; the graph may contain them.
 */
export function videoChain(doc: Microcontroller, port: PortId): NodeId[] {
  const seen = new Set<NodeId>()
  const queue: NodeId[] = []

  const enter = (id: NodeId) => {
    if (seen.has(id)) return
    seen.add(id)
    queue.push(id)
  }

  // An input port is fed by a wire; start from whatever drives it
  if (port.kind === 'in') {
    const wire = doc.wires.find(
      (w) => w.to.node === port.node && w.to.kind === 'in' && w.to.index === port.index,
    )
    if (!wire) return []
    enter(wire.from.node)
  } else {
    enter(port.node)
  }

  while (queue.length > 0) {
    const id = queue.shift() as NodeId
    const node = doc.nodes.find((n) => n.id === id)
    const def = node && getComponent(node.type)
    if (!node || !def) continue

    resolvePorts(def, 'in', node.properties).forEach((input, index) => {
      if (input.signal !== 'video') return
      const wire = doc.wires.find(
        (w) => w.to.node === id && w.to.kind === 'in' && w.to.index === index,
      )
      if (wire) enter(wire.from.node)
    })
  }

  return [...seen]
}
