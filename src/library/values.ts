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

/** 1-based composite number channel, 0 if missing. */
export function compositeNumber(value: SignalValue | undefined, channel: number): number {
  return asComposite(value).numbers[channel - 1] ?? 0
}

export function withCompositeNumber(
  value: SignalValue | undefined,
  channel: number,
  n: number,
): CompositeValue {
  const base = asComposite(value)
  const numbers = [...base.numbers]
  const index = Math.max(0, Math.min(31, channel - 1))
  numbers[index] = n
  return { numbers, bools: base.bools }
}
