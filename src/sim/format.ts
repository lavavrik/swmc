/** How signal values read on wires and in the pin panel. */
import type { SignalValue } from '@/library/types'

export function formatSignal(value: SignalValue | undefined): string {
  if (value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    // Three decimals is what the game shows on its own value readouts
    return value.toFixed(3).replace(/\.?0+$/, '')
  }
  if ('numbers' in value) {
    const set = value.numbers.filter((n) => n !== 0).length + value.bools.filter(Boolean).length
    return `composite (${set} set)`
  }
  return value.kind
}
