/**
 * The four timer components.
 *
 * TON delays a signal turning on; TOF extends it after it turns off. The
 * retentive pair (RTO, RTF) accumulate elapsed time across interruptions and
 * only start over when reset.
 */
import { defineComponent } from '../define'
import { TICKS_PER_SECOND, num, onoff, textProp } from '../portHelpers'
import { asBool, asNumber } from '../values'
import type { ComponentDef } from '../types'

const unitsProperty = {
  kind: 'dropdown',
  key: 'units',
  label: 'Duration units',
  default: 'seconds',
  options: [
    { value: 'seconds', label: 'Seconds' },
    { value: 'ticks', label: 'Ticks' },
  ],
} as const

/** Duration input converted to whole ticks. */
const durationTicks = (duration: number, properties: Readonly<Record<string, unknown>>): number => {
  const ticks =
    textProp(properties, 'units', 'seconds') === 'ticks' ? duration : duration * TICKS_PER_SECOND
  return Math.max(0, Math.round(ticks))
}

interface TimerState {
  readonly elapsed: number
}

export const timerComponents: ComponentDef[] = [
  defineComponent<TimerState>({
    id: 'timer.ton',
    swType: 49,
    category: 'logic',
    name: 'Timer (TON)',
    description: 'Turns on once the enable input has been on for the full duration.',
    inputs: [onoff('Enable'), num('Duration')],
    outputs: [onoff('Complete')],
    properties: [unitsProperty],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const limit = durationTicks(asNumber(inputs[1]), properties)
      const elapsed = asBool(inputs[0]) ? (state?.elapsed ?? 0) + 1 : 0
      return { outputs: [elapsed >= limit && asBool(inputs[0])], state: { elapsed } }
    },
  }),

  defineComponent<TimerState>({
    id: 'timer.tof',
    swType: 50,
    category: 'logic',
    name: 'Timer (TOF)',
    description: 'Stays on for the full duration after the enable input turns off.',
    inputs: [onoff('Enable'), num('Duration')],
    outputs: [onoff('Timing')],
    properties: [unitsProperty],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const limit = durationTicks(asNumber(inputs[1]), properties)
      const enabled = asBool(inputs[0])
      const elapsed = enabled ? 0 : (state?.elapsed ?? limit) + 1
      return { outputs: [enabled || elapsed <= limit], state: { elapsed } }
    },
  }),

  defineComponent<TimerState>({
    id: 'timer.rto',
    swType: 51,
    category: 'logic',
    name: 'Timer (RTO)',
    description: 'Accumulates enabled time across interruptions, and turns on at the duration.',
    inputs: [onoff('Enable'), num('Duration'), onoff('Reset')],
    outputs: [onoff('Complete')],
    properties: [unitsProperty],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const limit = durationTicks(asNumber(inputs[1]), properties)
      if (asBool(inputs[2])) return { outputs: [false], state: { elapsed: 0 } }
      const elapsed = (state?.elapsed ?? 0) + (asBool(inputs[0]) ? 1 : 0)
      return { outputs: [elapsed >= limit], state: { elapsed } }
    },
  }),

  defineComponent<TimerState>({
    id: 'timer.rtf',
    swType: 52,
    category: 'logic',
    name: 'Timer (RTF)',
    description: 'Accumulates disabled time across interruptions, and turns off at the duration.',
    inputs: [onoff('Enable'), num('Duration'), onoff('Reset')],
    outputs: [onoff('Timing')],
    properties: [unitsProperty],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const limit = durationTicks(asNumber(inputs[1]), properties)
      if (asBool(inputs[2])) return { outputs: [true], state: { elapsed: 0 } }
      const elapsed = (state?.elapsed ?? 0) + (asBool(inputs[0]) ? 0 : 1)
      return { outputs: [elapsed < limit], state: { elapsed } }
    },
  }),
]
