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
import { componentHeightUnits, componentWidthUnits, heightUnitsForPorts } from '@/library/geometry'
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
  portRadius: 4,
  /** The glyph is the same size on every card, whatever the card's height. */
  iconSize: 14,
  /**
   * Breathing room inside a card, in screen pixels, so the glyph and the text
   * sit clear of the edges instead of against them.
   */
  padding: 7,
  /** Type sizes, in screen pixels — they do not grow with the zoom. */
  titleSize: 11,
  detailSize: 9,
  detailLeading: 10,
} as const

/**
 * How much of a card's contents there is room for on screen.
 *
 * Text is drawn at a fixed size however far the workspace is zoomed, so what
 * changes with the zoom is how much of it fits. Below these widths the card
 * shows its glyph alone, which is what the game's cards look like from far out.
 */
export function cardDetail(screenWidth: number): 'icon' | 'title' | 'full' {
  if (screenWidth < 84) return 'icon'
  if (screenWidth < 150) return 'title'
  return 'full'
}

export interface CardLayout {
  readonly width: number
  readonly height: number
  readonly inputs: readonly PortDef[]
  readonly outputs: readonly PortDef[]
}

const cache = new Map<string, CardLayout>()

/** Height in game units, which is where the game's own sizing lives. */
export const cardHeightUnits = heightUnitsForPorts

export function cardLayout(def: ComponentDef, properties: NodeProperties): CardLayout {
  const inputs = resolvePorts(def, 'in', properties)
  const outputs = resolvePorts(def, 'out', properties)

  // Only the port counts affect geometry, so that is the key
  const key = `${def.id}:${inputs.length}:${outputs.length}`
  const cached = cache.get(key)
  if (cached) return { ...cached, inputs, outputs }

  const layout: CardLayout = {
    inputs,
    outputs,
    width: componentWidthUnits(def) * GAME_UNIT,
    height: componentHeightUnits(def, properties) * GAME_UNIT,
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
