/**
 * Geometry of a component card.
 *
 * Sizes are derived from the definition — port counts and the number of
 * property lines shown on the card — so no component needs bespoke layout
 * code. Results are memoised per definition because they are recomputed on
 * every render of every node.
 */
import type { Bounds } from './viewport'
import type { ComponentDef, PortDef } from '@/library/types'
import type { Point, PortKind } from '@/model/types'

/** World pixels per grid unit. Node positions in the document are grid units. */
export const GRID_PX = 16

/** Card metrics, chosen to match the proportions of the in-game cards. */
export const CARD = {
  width: 11 * GRID_PX,
  headerHeight: 22,
  /** Vertical gap between adjacent ports. */
  portSpacing: 24,
  /** Distance from the top of the card to the first port. */
  portTop: 34,
  bottomPadding: 10,
  detailLineHeight: 11,
  portRadius: 6,
} as const

export interface NodeSize {
  readonly width: number
  readonly height: number
}

const sizes = new WeakMap<ComponentDef, NodeSize>()

/** Number of grey detail lines drawn under the title, as the game shows them. */
export function detailLineCount(def: ComponentDef): number {
  // "type: ..." plus "desc: ..." wrapped to two lines, matching the game's cards
  return def.category === 'io' ? 3 : def.properties.length > 0 ? 2 : 1
}

export function nodeSize(def: ComponentDef): NodeSize {
  const cached = sizes.get(def)
  if (cached) return cached

  const portCount = Math.max(def.inputs.length, def.outputs.length)
  const portsHeight = CARD.portTop + Math.max(0, portCount - 1) * CARD.portSpacing
  const textHeight = CARD.headerHeight + detailLineCount(def) * CARD.detailLineHeight
  const raw = Math.max(portsHeight, textHeight) + CARD.bottomPadding

  const size: NodeSize = {
    width: def.size ? def.size.w * GRID_PX : CARD.width,
    height: def.size ? def.size.h * GRID_PX : Math.ceil(raw / GRID_PX) * GRID_PX,
  }
  sizes.set(def, size)
  return size
}

/** Port centre, relative to the card's top-left corner, in world pixels. */
export function portPosition(def: ComponentDef, kind: PortKind, index: number): Point {
  const { width } = nodeSize(def)
  return { x: kind === 'in' ? 0 : width, y: CARD.portTop + index * CARD.portSpacing }
}

export function portsOf(def: ComponentDef, kind: PortKind): readonly PortDef[] {
  return kind === 'in' ? def.inputs : def.outputs
}

/** World-space top-left corner of a node placed at a grid position. */
export function nodeOrigin(gridPosition: Point): Point {
  return { x: gridPosition.x * GRID_PX, y: gridPosition.y * GRID_PX }
}

export function nodeBounds(gridPosition: Point, def: ComponentDef): Bounds {
  const origin = nodeOrigin(gridPosition)
  const { width, height } = nodeSize(def)
  return {
    minX: origin.x,
    minY: origin.y,
    maxX: origin.x + width,
    maxY: origin.y + height,
  }
}

/** Absolute world position of a port on a placed node. */
export function portWorldPosition(
  gridPosition: Point,
  def: ComponentDef,
  kind: PortKind,
  index: number,
): Point {
  const origin = nodeOrigin(gridPosition)
  const local = portPosition(def, kind, index)
  return { x: origin.x + local.x, y: origin.y + local.y }
}
