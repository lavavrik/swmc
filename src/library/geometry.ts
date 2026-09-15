/**
 * How large a component is, in the game's own units.
 *
 * This is a property of the component rather than of any particular view, so it
 * lives with the definitions: the canvas turns it into pixels, and the XML
 * codec needs it because a saved position is the component's **bottom** edge —
 * the game measures y upwards, so a component grows from its position towards
 * the top of the screen.
 */
import { resolvePorts } from './ports'
import type { NodeProperties } from '@/model/schema'
import type { ComponentDef } from './types'

/** Every component is one game unit wide, as the game draws them. */
export const COMPONENT_WIDTH_UNITS = 1

/** Editor cards use the same width as the game. */
export const EDITOR_WIDTH_SCALE = 1

/** A port row is a quarter unit, and a card has a quarter unit of surround. */
export const PORT_ROW_UNITS = 0.25

/**
 * Height in game units: a quarter unit per port row, plus a quarter unit of
 * card. This reproduces every height the community library records, from a
 * half-unit composite read to a composite write that grows a quarter unit per
 * channel.
 */
export function heightUnitsForPorts(portCount: number): number {
  return PORT_ROW_UNITS * (Math.max(1, portCount) + 1)
}

export function componentHeightUnits(def: ComponentDef, properties: NodeProperties): number {
  if (def.size) return def.size.h
  const ports = Math.max(
    resolvePorts(def, 'in', properties).length,
    resolvePorts(def, 'out', properties).length,
  )
  return heightUnitsForPorts(ports)
}

export function componentWidthUnits(def: ComponentDef): number {
  return def.size ? def.size.w : COMPONENT_WIDTH_UNITS
}
