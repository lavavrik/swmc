/**
 * Which ports a monitor can watch.
 *
 * A monitor is a sink: in the game you wire a video *output* into one. The one
 * port that looks like an input but is really an output is the
 * microcontroller's own video pin — what it sends out to the vehicle — so that
 * counts too.
 */
import { getComponent } from '@/library/registry'
import { resolvePorts } from '@/library/ports'
import type { Microcontroller, PortId } from '@/model/types'

export function canWatchVideo(doc: Microcontroller, port: PortId): boolean {
  const node = doc.nodes.find((n) => n.id === port.node)
  const def = node && getComponent(node.type)
  if (!node || !def) return false
  if (resolvePorts(def, port.kind, node.properties)[port.index]?.signal !== 'video') return false
  return port.kind === 'out' || node.type.startsWith('io.out.')
}
