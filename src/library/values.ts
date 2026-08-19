/** Coercions between signal values, matching how the game treats unconnected inputs. */
import type { CompositeValue, SignalValue } from './types'

export const EMPTY_COMPOSITE: CompositeValue = {
  numbers: Array.from({ length: 32 }, () => 0),
  bools: Array.from({ length: 32 }, () => false),
}

/** An unconnected number input reads as 0. */
export function asNumber(value: SignalValue | undefined): number {
  return typeof value === 'number' ? value : 0
}

/** An unconnected on/off input reads as false. */
export function asBool(value: SignalValue | undefined): boolean {
  return value === true
}

export function asComposite(value: SignalValue | undefined): CompositeValue {
  return value !== undefined && typeof value === 'object' && 'numbers' in value
    ? value
    : EMPTY_COMPOSITE
}
