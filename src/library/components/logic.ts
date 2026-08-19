/** Boolean components: gates, latches, edge detectors and timing helpers. */
import { defineComponent } from '../define'
import { evaluateExpression } from '../expression'
import { TICKS_PER_SECOND, onoff, prop, textProp } from '../portHelpers'
import { asBool } from '../values'
import type { ComponentDef } from '../types'

const gate = (
  id: string,
  swType: number,
  name: string,
  description: string,
  outLabel: string,
  fn: (a: boolean, b: boolean) => boolean,
) =>
  defineComponent({
    id,
    swType,
    category: 'logic',
    name,
    description,
    inputs: [onoff('A'), onoff('B')],
    outputs: [onoff(outLabel)],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [fn(asBool(inputs[0]), asBool(inputs[1]))] }),
  })

/** Rising-edge detector state shared by the toggling components. */
interface EdgeState {
  readonly value: boolean
  readonly previous: boolean
}

const rose = (previous: boolean, current: boolean) => current && !previous

export const logicComponents: ComponentDef[] = [
  defineComponent({
    id: 'logic.not',
    swType: 0,
    category: 'logic',
    name: 'NOT',
    description: 'Inverts the on/off input.',
    inputs: [onoff('A')],
    outputs: [onoff('not A')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [!asBool(inputs[0])] }),
  }),
  gate('logic.and', 1, 'AND', 'Outputs on when both inputs are on.', 'A and B', (a, b) => a && b),
  gate('logic.or', 2, 'OR', 'Outputs on when either input is on.', 'A or B', (a, b) => a || b),
  gate(
    'logic.xor',
    3,
    'XOR',
    'Outputs on when exactly one input is on.',
    'A xor B',
    (a, b) => a !== b,
  ),
  gate(
    'logic.nand',
    4,
    'NAND',
    'Outputs on unless both inputs are on.',
    'A nand B',
    (a, b) => !(a && b),
  ),
  gate(
    'logic.nor',
    5,
    'NOR',
    'Outputs on when neither input is on.',
    'A nor B',
    (a, b) => !(a || b),
  ),

  defineComponent<boolean>({
    id: 'logic.srLatch',
    swType: 24,
    category: 'logic',
    name: 'SR Latch',
    description: 'Turns on when set, and stays on until reset.',
    inputs: [onoff('Set'), onoff('Reset')],
    outputs: [onoff('Value'), onoff('Inverted')],
    properties: [],
    stateful: true,
    eval: ({ inputs, state }) => {
      // Reset wins when both are asserted, matching the game
      const value = asBool(inputs[1]) ? false : asBool(inputs[0]) ? true : (state ?? false)
      return { outputs: [value, !value], state: value }
    },
  }),

  defineComponent<EdgeState>({
    id: 'logic.jkFlipFlop',
    swType: 25,
    category: 'logic',
    name: 'JK Flip Flop',
    description: 'Flips its output each time the toggle input turns on.',
    inputs: [onoff('Toggle'), onoff('Reset')],
    outputs: [onoff('Value'), onoff('Inverted')],
    properties: [],
    stateful: true,
    eval: ({ inputs, state }) => {
      const previous = state ?? { value: false, previous: false }
      const toggle = asBool(inputs[0])
      let value = rose(previous.previous, toggle) ? !previous.value : previous.value
      if (asBool(inputs[1])) value = false
      return { outputs: [value, !value], state: { value, previous: toggle } }
    },
  }),

  defineComponent<EdgeState>({
    id: 'logic.pushToToggle',
    swType: 28,
    category: 'logic',
    name: 'Push To Toggle',
    description: 'Flips its output each time the input turns on.',
    inputs: [onoff('Push')],
    outputs: [onoff('Value')],
    properties: [],
    stateful: true,
    eval: ({ inputs, state }) => {
      const previous = state ?? { value: false, previous: false }
      const push = asBool(inputs[0])
      const value = rose(previous.previous, push) ? !previous.value : previous.value
      return { outputs: [value], state: { value, previous: push } }
    },
  }),

  defineComponent<{ level: number; value: boolean }>({
    id: 'logic.capacitor',
    swType: 26,
    category: 'logic',
    name: 'Capacitor',
    description: 'Delays the input turning on, and extends it after it turns off.',
    inputs: [onoff('A')],
    outputs: [onoff('Value')],
    properties: [
      {
        kind: 'number',
        key: 'charge',
        label: 'Charge time',
        default: 1,
        xml: { form: 'attributeNumber', name: 'ct' },
      },
      {
        kind: 'number',
        key: 'discharge',
        label: 'Discharge time',
        default: 1,
        xml: { form: 'attributeNumber', name: 'dt' },
      },
    ],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const previous = state ?? { level: 0, value: false }
      const chargeTicks = Math.max(1, prop(properties, 'charge', 1) * TICKS_PER_SECOND)
      const dischargeTicks = Math.max(1, prop(properties, 'discharge', 1) * TICKS_PER_SECOND)
      const on = asBool(inputs[0])
      const level = Math.min(
        1,
        Math.max(0, previous.level + (on ? 1 / chargeTicks : -1 / dischargeTicks)),
      )
      // Full charge switches it on; it stays on until fully discharged
      const value = level >= 1 ? true : previous.value && level > 0
      return { outputs: [value], state: { level, value } }
    },
  }),

  defineComponent<{ ticks: number; value: boolean }>({
    id: 'logic.blinker',
    swType: 27,
    category: 'logic',
    name: 'Blinker',
    description: 'Turns on and off at a set rate while enabled.',
    inputs: [onoff('Enable')],
    outputs: [onoff('Value')],
    properties: [
      {
        kind: 'number',
        key: 'onDuration',
        label: 'On duration',
        default: 0.5,
        xml: { form: 'attributeNumber', name: 'on' },
      },
      {
        kind: 'number',
        key: 'offDuration',
        label: 'Off duration',
        default: 0.5,
        xml: { form: 'attributeNumber', name: 'off' },
      },
    ],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const previous = state ?? { ticks: 0, value: false }
      if (!asBool(inputs[0])) return { outputs: [false], state: { ticks: 0, value: false } }

      const limit = Math.max(
        1,
        Math.round(
          prop(properties, previous.value ? 'onDuration' : 'offDuration', 0.5) * TICKS_PER_SECOND,
        ),
      )
      const ticks = previous.ticks + 1
      const flip = ticks >= limit
      const value = flip ? !previous.value : previous.value
      return { outputs: [value], state: { ticks: flip ? 0 : ticks, value } }
    },
  }),

  defineComponent<boolean>({
    id: 'logic.pulse',
    swType: 48,
    category: 'logic',
    name: 'Pulse',
    description: 'Emits a single tick of on when the input changes.',
    inputs: [onoff('A')],
    outputs: [onoff('Pulse')],
    properties: [
      {
        kind: 'dropdown',
        key: 'mode',
        label: 'Trigger',
        default: 'offToOn',
        xml: { form: 'attributeEnum', name: 'm', values: { onToOff: 0, offToOn: 1, either: 2 } },
        options: [
          { value: 'offToOn', label: 'Off to on' },
          { value: 'onToOff', label: 'On to off' },
          { value: 'either', label: 'Any change' },
        ],
      },
    ],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const previous = state ?? false
      const current = asBool(inputs[0])
      const mode = textProp(properties, 'mode', 'offToOn')
      const changed = current !== previous
      const pulse =
        changed &&
        (mode === 'either' || (mode === 'offToOn' && current) || (mode === 'onToOff' && !current))
      return { outputs: [pulse], state: current }
    },
  }),

  booleanFunction('logic.function4', 46, 'Boolean Function (4 inputs)', ['x', 'y', 'z', 'w']),
  booleanFunction('logic.function8', 47, 'Boolean Function (8 inputs)', [
    'x',
    'y',
    'z',
    'w',
    'a',
    'b',
    'c',
    'd',
  ]),
]

/**
 * A boolean expression over its inputs. The shared expression parser works on
 * numbers, so inputs arrive as 1 and 0 and a non-zero result reads as on.
 */
function booleanFunction(id: string, swType: number, name: string, variables: string[]) {
  return defineComponent({
    id,
    swType,
    category: 'logic',
    name,
    description: `Evaluates a boolean expression of the inputs ${variables.join(', ')}.`,
    inputs: variables.map(onoff),
    outputs: [onoff('Result')],
    properties: [
      {
        kind: 'text',
        key: 'expression',
        label: 'Expression',
        default: 'x',
        xml: { form: 'attribute', name: 'e' },
      },
    ],
    eval: ({ inputs, properties }) => {
      const vars: Record<string, number> = {}
      variables.forEach((name, i) => {
        vars[name] = asBool(inputs[i]) ? 1 : 0
      })
      return { outputs: [evaluateExpression(textProp(properties, 'expression'), vars) !== 0] }
    },
  })
}
