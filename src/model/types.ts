/**
 * Core graph data types.
 *
 * This layer is pure data: no React, no DOM, and — importantly — no knowledge
 * of the component library. Anything that needs to know what ports a component
 * has goes through the `GraphSchema` interface in `schema.ts`, which the
 * library layer implements. That keeps the model independently testable with
 * tiny fake schemas.
 */

/** The five signal types Stormworks wires can carry. */
export type SignalType = 'onoff' | 'number' | 'composite' | 'video' | 'audio'

export const SIGNAL_TYPES: readonly SignalType[] = [
  'onoff',
  'number',
  'composite',
  'video',
  'audio',
] as const

/** Key into the component registry, e.g. `arithmetic.add`. */
export type ComponentTypeId = string

export type NodeId = string
export type WireId = string

export type PortKind = 'in' | 'out'

/** Identifies one port on one node. Indices are 0-based. */
export interface PortId {
  readonly node: NodeId
  readonly kind: PortKind
  readonly index: number
}

export type PropertyValue = number | string | boolean

/** A component placed on the workspace. */
export interface GraphNode {
  readonly id: NodeId
  readonly type: ComponentTypeId
  /** Position in grid units. Always integral — the game snaps to its grid. */
  readonly position: Point
  readonly properties: Readonly<Record<string, PropertyValue>>
  /**
   * Attributes from an imported file that this editor does not model. They are
   * carried through untouched so a round-trip does not lose anything.
   */
  readonly raw?: Readonly<Record<string, string>>
}

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Wire {
  readonly id: WireId
  /** Always an output port. */
  readonly from: PortId
  /** Always an input port. */
  readonly to: PortId
}

export interface MicrocontrollerMeta {
  readonly name: string
  readonly description: string
  /** Physical size of the microcontroller block, in blocks. */
  readonly width: number
  readonly length: number
  /**
   * Attributes of the microprocessor element this editor does not model —
   * notably `sym0`…`sym15`, the 16×16 icon. Preserved verbatim.
   */
  readonly extra?: Readonly<Record<string, string>>
  /** Attributes of the group's `<data>` element, likewise preserved. */
  readonly groupData?: Readonly<Record<string, string>>
}

/**
 * A whole microcontroller.
 *
 * The microcontroller's own external pins are ordinary nodes whose component
 * type belongs to the `io` category — this mirrors how Stormworks stores them
 * (as bridge components) and means wires need only one kind of endpoint.
 * `ioOrder` records the order those pins appear on the block's faces.
 */
export interface Microcontroller {
  readonly meta: MicrocontrollerMeta
  readonly nodes: readonly GraphNode[]
  readonly wires: readonly Wire[]
  readonly ioOrder: readonly NodeId[]
  /** Monotonic source of ids. Kept in the document so ops stay pure. */
  readonly idCounter: number
}
