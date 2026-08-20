/**
 * Live signal values drawn on the wires while the simulation runs.
 *
 * Kept in its own component so a refresh redraws only these labels, leaving the
 * node and wire layers untouched.
 */
import { getComponent } from '@/library/registry'
import { formatSignal } from '@/sim/format'
import { useSimulationStore } from '@/sim/store'
import type { Microcontroller, NodeId, Point } from '@/model/types'
import { cardLayout, portWorldPosition } from './layout'
import { STUB } from './wireGeometry'

interface Props {
  doc: Microcontroller
  offsetFor: (id: NodeId) => Point
  scale: number
}

export function WireValues({ doc, offsetFor, scale }: Props) {
  const values = useSimulationStore((s) => s.values)
  if (values.size === 0) return null

  return (
    <g className="layer-values" pointerEvents="none">
      {doc.wires.map((wire) => {
        const text = formatSignal(values.get(wire.id))
        if (text === '') return null
        const source = doc.nodes.find((n) => n.id === wire.from.node)
        const def = source && getComponent(source.type)
        if (!source || !def) return null

        const at = portWorldPosition(
          source.position,
          cardLayout(def, source.properties),
          'out',
          wire.from.index,
        )
        const offset = offsetFor(source.id)
        return (
          <text
            key={wire.id}
            className="wire-value"
            x={at.x + offset.x + (STUB + 4) / scale}
            y={at.y + offset.y - 5 / scale}
            fontSize={11 / scale}
          >
            {text}
          </text>
        )
      })}
    </g>
  )
}
