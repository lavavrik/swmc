/**
 * One component card.
 *
 * Drawn entirely in SVG — no `foreignObject` — so a graph of a thousand
 * components stays cheap to render and hit-test. Everything on the card comes
 * from the component definition, so no component needs its own view code.
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
            strokeWidth={2.5}
            opacity={faded ? 0.25 : 1}
          >
            <title>{`${port.label} (${port.signal})`}</title>
          </circle>
        )
      })}
    </>
  )
}

export const NodeView = memo(function NodeView({
  node,
  def,
  selected,
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
  const title = label.length > 0 ? label : def.name

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
      />
      <CategoryIcon category={def.category} x={6} y={6} />
      <text className="node-title" x={26} y={17} fontSize={CARD.titleSize} fill="var(--card-title)">
        {title}
      </text>
      <NodeDetails def={def} node={node} />
      <PortDots layout={layout} kind="in" dim={dimPorts} compatible={compatiblePort} />
      <PortDots layout={layout} kind="out" dim={dimPorts} compatible={compatiblePort} />
    </g>
  )
})

/** The grey lines under the title, mirroring the game's "type:" / "desc:" rows. */
function NodeDetails({ def, node }: { def: ComponentDef; node: GraphNode }) {
  const lines: string[] = []
  for (const property of def.properties) {
    const value = node.properties[property.key]
    if (value === undefined || value === '') continue
    lines.push(`${property.label.toLowerCase()}: ${String(value)}`)
  }
  if (lines.length === 0) lines.push(def.description)

  return (
    <>
      {lines.slice(0, 3).map((line, i) => (
        <text
          key={i}
          className="node-detail"
          x={26}
          y={CARD.headerHeight + 5 + i * CARD.detailLineHeight}
          fontSize={CARD.detailSize}
          fill="var(--card-detail)"
        >
          {line.length > CARD.detailCharacters
            ? `${line.slice(0, CARD.detailCharacters - 1)}…`
            : line}
        </text>
      ))}
    </>
  )
}
