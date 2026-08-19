import type { ComponentTypeId, PortKind, PropertyValue, SignalType } from './types'

/**
 * What the model needs to know about component shapes, without depending on
 * the component library. The library provides the real implementation; tests
 * provide small fakes.
 *
 * Ports are asked for with the node's properties, not just its type, because
 * some components change shape with their settings — a Composite Write exposes
 * as many channel inputs as its channel-count property asks for.
 */
export type NodeProperties = Readonly<Record<string, PropertyValue>>

export interface GraphSchema {
  /** Signal type of a port, or undefined if that port does not exist. */
  portSignal(
    type: ComponentTypeId,
    properties: NodeProperties,
    kind: PortKind,
    index: number,
  ): SignalType | undefined
  /** Number of ports of the given kind, or 0 for an unknown component type. */
  portCount(type: ComponentTypeId, properties: NodeProperties, kind: PortKind): number
  /** Whether the component type is registered at all. */
  has(type: ComponentTypeId): boolean
}
