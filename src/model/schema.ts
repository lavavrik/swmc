import type { ComponentTypeId, PortKind, SignalType } from './types'

/**
 * What the model needs to know about component shapes, without depending on
 * the component library. The library provides the real implementation; tests
 * provide small fakes.
 */
export interface GraphSchema {
  /** Signal type of a port, or undefined if that port does not exist. */
  portSignal(type: ComponentTypeId, kind: PortKind, index: number): SignalType | undefined
  /** Number of ports of the given kind, or 0 for an unknown component type. */
  portCount(type: ComponentTypeId, kind: PortKind): number
  /** Whether the component type is registered at all. */
  has(type: ComponentTypeId): boolean
}
