/**
 * One component card.
 *
 * The game puts a small glyph in the corner and the component's name and
 * settings beside it, all inside a card one game unit wide. This does the same,
 * with one difference: the text is drawn at a fixed size on screen rather than
 * scaling with the workspace, so zooming in does not inflate it. What the zoom
 * changes is how much fits — far out a card is its glyph alone, closer in the
 * name appears, closer still its settings.
 *
 * Drawn entirely in SVG — no `foreignObject` — so a graph of a thousand
 * components stays cheap to render and hit-test.
 */
import { memo } from 'react'
import { signalColor } from '@/ui/signals'
import type { ComponentDef } from '@/library/types'
import type { GraphNode, PortKind } from '@/model/types'
import { CARD, cardDetail, cardLayout, nodeOrigin, portPosition, portsOf } from './layout'
import type { CardLayout } from './layout'
import { ComponentIcon } from './CategoryIcon'

interface Props {
  node: GraphNode
  def: ComponentDef
  selected: boolean
  /** Whether to draw the component's name and settings on the card at all. */
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
        // Inputs are rings and outputs are solid, so which end of a wire is
        // which reads at a glance
        const colour = signalColor(port.signal)
        return (
          <circle
            key={`${kind}${index}`}
            className={`port port-${kind}`}
            data-port-kind={kind}
            data-port-index={index}
            cx={x}
            cy={y}
            r={CARD.portRadius}
            fill={kind === 'in' ? 'var(--card)' : colour}
            stroke={colour}
            strokeWidth={kind === 'in' ? 3 : 1.5}
            opacity={faded ? 0.25 : 1}
          >
            <title>{`${port.label} (${port.signal})`}</title>
          </circle>
        )
      })}
    </>
  )
}

/** The settings worth showing on the card, as the game lists them. */
function detailLines(node: GraphNode, def: ComponentDef): string[] {
  const lines: string[] = []
  const description =
    typeof node.properties.description === 'string' ? node.properties.description.trim() : ''
  if (description) lines.push(description)
  for (const property of def.properties) {
    const value = node.properties[property.key]
    if (value === undefined || value === '') continue
    if (property.key === 'description') continue
    // A script is far too long to sit on a card; its editor is a click away
    if (property.kind === 'text' && String(value).length > 24) continue
    lines.push(`${property.label.toLowerCase()}: ${String(value)}`)
  }
  return lines
}

/** Everything about a component, for the hover tooltip. */
function tooltipFor(node: GraphNode, def: ComponentDef): string {
  return [def.name, def.description, ...detailLines(node, def)]
    .filter((line) => line.length > 0)
    .join('\n')
}

/** Clips text to the pixels available, since the type does not shrink. */
function fit(text: string, pixels: number, size: number): string {
  const perCharacter = size * 0.55
  const room = Math.floor(pixels / perCharacter)
  if (room <= 1) return ''
  return text.length > room ? `${text.slice(0, room - 1)}…` : text
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

  // Text is measured in screen pixels, so the card's world size is converted
  const detail = showNames ? cardDetail(width * scale) : 'icon'
  const pad = CARD.padding / scale
  // The glyph shrinks with the card so it always clears the top and bottom
  const icon = Math.min(CARD.iconSize / scale, height - pad * 2)
  const textLeft = detail === 'icon' ? 0 : pad + icon + pad * 0.7
  const room = (width - textLeft - pad) * scale

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

      <ComponentIcon
        type={def.id}
        category={def.category}
        x={detail === 'icon' ? (width - icon) / 2 : pad}
        y={detail === 'icon' ? (height - icon) / 2 : pad}
        size={icon}
      />

      {detail !== 'icon' && (
        <text
          className="node-title"
          x={textLeft}
          y={pad + (CARD.titleSize * 0.85) / scale}
          fontSize={CARD.titleSize / scale}
          fill="var(--card-title)"
        >
          {fit(name, room, CARD.titleSize)}
        </text>
      )}

      {detail === 'full' &&
        detailLines(node, def).map((line, index) => {
          const top = pad + (CARD.titleSize + 5 + index * CARD.detailLeading) / scale
          // Stop before running off the bottom of the card
          if (top + (CARD.detailSize + CARD.padding) / scale > height) return null
          return (
            <text
              key={index}
              className="node-detail"
              x={textLeft}
              y={top + CARD.detailSize / scale}
              fontSize={CARD.detailSize / scale}
              fill="var(--card-detail)"
            >
              {fit(line, room, CARD.detailSize)}
            </text>
          )
        })}

      <PortDots layout={layout} kind="in" dim={dimPorts} compatible={compatiblePort} />
      <PortDots layout={layout} kind="out" dim={dimPorts} compatible={compatiblePort} />
    </g>
  )
})
