/**
 * One component card.
 *
 * The game draws a component as a small square with a glyph and its ports on
 * the edges — no text, because at one game unit wide there is no room for any.
 * This does the same, and puts the name underneath when names are switched on,
 * so a graph reads the way it does in the editor it came from.
 *
 * Drawn entirely in SVG — no `foreignObject` — so a graph of a thousand
 * components stays cheap to render and hit-test.
 */
import { memo } from 'react'
import { signalColor } from '@/ui/signals'
import type { ComponentDef } from '@/library/types'
import type { GraphNode, PortKind } from '@/model/types'
import { CARD, cardLayout, nodeOrigin, portPosition, portsOf, type CardLayout } from './layout'
import { CategoryIcon } from './CategoryIcon'

interface Props {
  node: GraphNode
  def: ComponentDef
  selected: boolean
  /** Whether to draw the component's name under its card. */
  showNames?: boolean | undefined
  /** Current zoom, so text keeps the same size on screen at any zoom. */
  scale: number
  /** Live drag offset in world pixels, applied without touching the document. */
  offset?: { x: number; y: number } | undefined
  /** Ports that should be dimmed because the wire being dragged cannot reach them. */
  dimPorts?: boolean | undefined
  compatiblePort?: ((kind: PortKind, index: number) => boolean) | undefined
}

function PortDots({
  layout,
  kind,
  dim,
  compatible,
}: {
  layout: CardLayout
  kind: PortKind
  dim: boolean
  compatible?: ((kind: PortKind, index: number) => boolean) | undefined
}) {
  return (
    <>
      {portsOf(layout, kind).map((port, index) => {
        const { x, y } = portPosition(layout, kind, index)
        const faded = dim && compatible ? !compatible(kind, index) : false
        return (
          <circle
            key={`${kind}${index}`}
            className="port"
            data-port-kind={kind}
            data-port-index={index}
            cx={x}
            cy={y}
            r={CARD.portRadius}
            fill={signalColor(port.signal)}
            stroke="var(--port-ring)"
            strokeWidth={2}
            opacity={faded ? 0.25 : 1}
          >
            <title>{`${port.label} (${port.signal})`}</title>
          </circle>
        )
      })}
    </>
  )
}

/** Everything about a component, for the hover tooltip. */
function tooltipFor(node: GraphNode, def: ComponentDef): string {
  const lines = [def.name, def.description]
  for (const property of def.properties) {
    const value = node.properties[property.key]
    if (value === undefined || value === '') continue
    lines.push(`${property.label}: ${String(value)}`)
  }
  return lines.join('\n')
}

export const NodeView = memo(function NodeView({
  node,
  def,
  selected,
  showNames = false,
  scale,
  offset,
  dimPorts = false,
  compatiblePort,
}: Props) {
  const origin = nodeOrigin(node.position)
  const layout = cardLayout(def, node.properties)
  const { width, height } = layout
  const x = origin.x + (offset?.x ?? 0)
  const y = origin.y + (offset?.y ?? 0)

  const label = typeof node.properties.label === 'string' ? node.properties.label : ''
  const name = label.length > 0 ? label : def.name
  const icon = Math.min(CARD.iconSize, height - 6)

  return (
    <g className="node" data-node-id={node.id} transform={`translate(${x} ${y})`}>
      <rect
        className="node-card"
        width={width}
        height={height}
        rx={2}
        fill="var(--card)"
        stroke={selected ? 'var(--card-selected)' : 'var(--card-border)'}
        strokeWidth={selected ? 2.5 : 1}
      >
        <title>{tooltipFor(node, def)}</title>
      </rect>

      <CategoryIcon
        category={def.category}
        x={(width - icon) / 2}
        y={(height - icon) / 2}
        size={icon}
      />

      {showNames && (
        <text
          className="node-name"
          x={width / 2}
          y={height + (CARD.labelSize + 3) / scale}
          fontSize={CARD.labelSize / scale}
          textAnchor="middle"
        >
          {name.length > 22 ? `${name.slice(0, 21)}…` : name}
        </text>
      )}

      <PortDots layout={layout} kind="in" dim={dimPorts} compatible={compatiblePort} />
      <PortDots layout={layout} kind="out" dim={dimPorts} compatible={compatiblePort} />
    </g>
  )
})
