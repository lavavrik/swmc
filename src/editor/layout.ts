/**
 * Geometry of a component card.
 *
 * A card's size comes from its definition and its property values — port counts
 * and the number of detail lines shown — so no component needs bespoke layout
 * code. Because some components change shape with their settings, layout is
 * resolved per node into a `CardLayout` and memoised on the shape that actually
 * matters, not on the definition object.
 */
import { defaultProperties } from '@/library/defaults'
import { resolvePorts } from '@/library/ports'
import type { ComponentDef, PortDef } from '@/library/types'
import type { NodeProperties } from '@/model/schema'
import type { Point, PortKind } from '@/model/types'
import type { Bounds } from './viewport'

/** World pixels per grid unit. Node positions in the document are grid units. */
export const GRID_PX = 16

/** Card metrics, chosen to match the proportions of the in-game cards. */
export const CARD = {
  width: 11 * GRID_PX,
  headerHeight: 24,
  /** Vertical gap between adjacent ports. */
  portSpacing: 24,
  /** Distance from the top of the card to the first port. */
  portTop: 36,
  bottomPadding: 10,
  detailLineHeight: 12,
  portRadius: 6,
  /** Type sizes, in world pixels. */
  titleSize: 12,
  detailSize: 9,
  /** Roughly how many detail characters fit across a card at that size. */
  detailCharacters: 30,
} as const

export interface CardLayout {
  readonly width: number
  readonly height: number
  readonly inputs: readonly PortDef[]
  readonly outputs: readonly PortDef[]
  /** Grey detail lines drawn under the title. */
  readonly detailLines: number
}

const cache = new Map<string, CardLayout>()

/** Number of grey detail lines drawn under the title, as the game shows them. */
function detailLineCount(def: ComponentDef): number {
  if (def.category === 'io') return 3
  return def.properties.length > 0 ? 2 : 1
}

export function cardLayout(def: ComponentDef, properties: NodeProperties): CardLayout {
  const inputs = resolvePorts(def, 'in', properties)
  const outputs = resolvePorts(def, 'out', properties)
  const detailLines = detailLineCount(def)

  // Only the port counts and line count affect geometry, so that is the key
  const key = `${def.id}:${inputs.length}:${outputs.length}:${detailLines}`
  const cached = cache.get(key)
  if (cached) return { ...cached, inputs, outputs }

  const portCount = Math.max(inputs.length, outputs.length)
  const portsHeight = CARD.portTop + Math.max(0, portCount - 1) * CARD.portSpacing
  const textHeight = CARD.headerHeight + detailLines * CARD.detailLineHeight
  const raw = Math.max(portsHeight, textHeight) + CARD.bottomPadding

  const layout: CardLayout = {
    inputs,
    outputs,
    detailLines,
    width: def.size ? def.size.w * GRID_PX : CARD.width,
    height: def.size ? def.size.h * GRID_PX : Math.ceil(raw / GRID_PX) * GRID_PX,
  }
  cache.set(key, layout)
  return layout
}

/** Layout of a component as freshly placed, for menus and previews. */
export function defaultLayout(def: ComponentDef): CardLayout {
  return cardLayout(def, defaultProperties(def))
}

export function portsOf(layout: CardLayout, kind: PortKind): readonly PortDef[] {
  return kind === 'in' ? layout.inputs : layout.outputs
}

/** Port centre, relative to the card's top-left corner, in world pixels. */
export function portPosition(layout: CardLayout, kind: PortKind, index: number): Point {
  return {
    x: kind === 'in' ? 0 : layout.width,
    y: CARD.portTop + index * CARD.portSpacing,
  }
}

/** World-space top-left corner of a node placed at a grid position. */
export function nodeOrigin(gridPosition: Point): Point {
  return { x: gridPosition.x * GRID_PX, y: gridPosition.y * GRID_PX }
}

export function nodeBounds(gridPosition: Point, layout: CardLayout): Bounds {
  const origin = nodeOrigin(gridPosition)
  return {
    minX: origin.x,
    minY: origin.y,
    maxX: origin.x + layout.width,
    maxY: origin.y + layout.height,
  }
}

/** Absolute world position of a port on a placed node. */
export function portWorldPosition(
  gridPosition: Point,
  layout: CardLayout,
  kind: PortKind,
  index: number,
): Point {
  const origin = nodeOrigin(gridPosition)
  const local = portPosition(layout, kind, index)
  return { x: origin.x + local.x, y: origin.y + local.y }
}
