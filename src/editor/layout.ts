/**
 * Geometry of a component card.
 *
 * The game's own measurements, so an imported microcontroller looks the way it
 * looks in the editor it came from: a component is **one game unit wide**, and
 * `0.25 × (ports + 1)` units tall — a rule that reproduces every height the
 * community library records, from a 0.5-unit composite read to a composite
 * write that grows a quarter unit per channel.
 *
 * Everything here is in world pixels; the conversions are `GRID_PX` (a quarter
 * unit, which is what the game snaps to) and `GAME_UNIT`.
 */
import { defaultProperties } from '@/library/defaults'
import { resolvePorts } from '@/library/ports'
import type { ComponentDef, PortDef } from '@/library/types'
import type { NodeProperties } from '@/model/schema'
import type { Point, PortKind } from '@/model/types'
import type { Bounds } from './viewport'

/** World pixels per grid unit. A grid unit is a quarter of a game unit. */
export const GRID_PX = 16

/** Grid units per game unit — the game places components in quarter steps. */
export const GRID_PER_UNIT = 4

/** World pixels per game unit. */
export const GAME_UNIT = GRID_PX * GRID_PER_UNIT

export const CARD = {
  /** A component is one game unit wide, whatever it does. */
  width: GAME_UNIT,
  /** Ports sit a quarter unit apart, starting a quarter unit down. */
  portSpacing: GRID_PX,
  portTop: GRID_PX,
  portRadius: 5,
  /** The glyph is the same size on every card, whatever the card's height. */
  iconSize: 24,
  /** Name label size, in screen pixels — it does not grow with the zoom. */
  labelSize: 11,
} as const

export interface CardLayout {
  readonly width: number
  readonly height: number
  readonly inputs: readonly PortDef[]
  readonly outputs: readonly PortDef[]
}

const cache = new Map<string, CardLayout>()

/**
 * Height in game units: a quarter unit per port row, plus a quarter unit of
 * card around them.
 */
export function cardHeightUnits(portCount: number): number {
  return 0.25 * (Math.max(1, portCount) + 1)
}

export function cardLayout(def: ComponentDef, properties: NodeProperties): CardLayout {
  const inputs = resolvePorts(def, 'in', properties)
  const outputs = resolvePorts(def, 'out', properties)

  // Only the port counts affect geometry, so that is the key
  const key = `${def.id}:${inputs.length}:${outputs.length}`
  const cached = cache.get(key)
  if (cached) return { ...cached, inputs, outputs }

  const ports = Math.max(inputs.length, outputs.length)
  const layout: CardLayout = {
    inputs,
    outputs,
    width: def.size ? def.size.w * GAME_UNIT : CARD.width,
    height: def.size ? def.size.h * GAME_UNIT : cardHeightUnits(ports) * GAME_UNIT,
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
