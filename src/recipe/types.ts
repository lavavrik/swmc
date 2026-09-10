/**
 * A microcontroller described with named nodes and named ports.
 *
 * This is what an agent (or a person) writes. `buildRecipe` turns it into a
 * document the rest of the editor already understands, then into game XML.
 *
 * Port endpoints are `node` when that node has one port of the right kind, or
 * `node.port` where `port` is a label slug (`process-variable`), a label, or
 * `in.0` / `out.1`.
 */
import type { ComponentTypeId, Point, PropertyValue, SignalType } from '@/model/types'

export interface Recipe {
  readonly name: string
  readonly description: string
  readonly width: number
  readonly length: number
  readonly pins: readonly PinRecipe[]
  readonly nodes: readonly NodeRecipe[]
  readonly wires: readonly WireRecipe[]
}

export interface PinRecipe {
  readonly id: string
  readonly dir: 'in' | 'out'
  readonly signal: SignalType
  readonly label: string
  readonly description: string
  readonly faceX: number
  readonly faceZ: number
}

export interface NodeRecipe {
  readonly id: string
  readonly type: ComponentTypeId
  readonly properties: Readonly<Record<string, PropertyValue>>
  readonly position?: Point
}

export interface WireRecipe {
  readonly from: string
  readonly to: string
}

export const RECIPE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/
