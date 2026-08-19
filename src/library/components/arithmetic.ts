/** Number components: arithmetic, functions, routing, memory and control. */
import { defineComponent } from '../define'
import { evaluateExpression } from '../expression'
import { num, onoff, prop, textProp } from '../portHelpers'
import { asBool, asNumber } from '../values'
import type { ComponentDef } from '../types'

const binary = (
  id: string,
  swType: number,
  name: string,
  description: string,
  outLabel: string,
  fn: (a: number, b: number) => number,
) =>
  defineComponent({
    id,
    swType,
    category: 'arithmetic',
    name,
    description,
    inputs: [num('A'), num('B')],
    outputs: [num(outLabel)],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [fn(asNumber(inputs[0]), asNumber(inputs[1]))] }),
  })

/** A mathematical expression over a fixed set of number inputs. */
function numberFunction(id: string, swType: number, name: string, variables: string[]) {
  return defineComponent({
    id,
    swType,
    category: 'arithmetic',
    name,
    description: `Evaluates a mathematical expression of the inputs ${variables.join(', ')}.`,
    inputs: variables.map(num),
    outputs: [num('Result')],
    properties: [{ kind: 'text', key: 'expression', label: 'Expression', default: 'x' }],
    eval: ({ inputs, properties }) => {
      const vars: Record<string, number> = {}
      variables.forEach((name, i) => {
        vars[name] = asNumber(inputs[i])
      })
      return { outputs: [evaluateExpression(textProp(properties, 'expression'), vars)] }
    },
  })
}

const rose = (previous: boolean, current: boolean) => current && !previous

export const arithmeticComponents: ComponentDef[] = [
  binary(
    'arithmetic.add',
    6,
    'Add',
    'Adds the two number inputs together.',
    'A + B',
    (a, b) => a + b,
  ),
  binary(
    'arithmetic.subtract',
    7,
    'Subtract',
    'Subtracts the second number input from the first.',
    'A - B',
    (a, b) => a - b,
  ),
  binary(
    'arithmetic.multiply',
    8,
    'Multiply',
    'Multiplies the two number inputs.',
    'A × B',
    (a, b) => a * b,
  ),
  binary(
    'arithmetic.divide',
    9,
    'Divide',
    'Divides the first number input by the second.',
    'A ÷ B',
    // Division by zero yields zero rather than an infinity, which would poison
    // everything downstream
    (a, b) => (b === 0 ? 0 : a / b),
  ),
  binary(
    'arithmetic.modulo',
    38,
    'Modulo',
    'The remainder of dividing the first input by the second.',
    'A mod B',
    (a, b) => (b === 0 ? 0 : ((a % b) + b) % b),
  ),

  defineComponent({
    id: 'arithmetic.abs',
    swType: 14,
    category: 'arithmetic',
    name: 'Absolute Value',
    description: 'The magnitude of the number input, ignoring its sign.',
    inputs: [num('A')],
    outputs: [num('|A|')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [Math.abs(asNumber(inputs[0]))] }),
  }),

  defineComponent({
    id: 'arithmetic.clamp',
    swType: 11,
    category: 'arithmetic',
    name: 'Clamp',
    description: 'Holds the number input between a minimum and a maximum.',
    inputs: [num('A')],
    outputs: [num('Value')],
    properties: [
      { kind: 'number', key: 'min', label: 'Minimum', default: 0 },
      { kind: 'number', key: 'max', label: 'Maximum', default: 1 },
    ],
    eval: ({ inputs, properties }) => {
      const min = prop(properties, 'min', 0)
      const max = prop(properties, 'max', 1)
      return { outputs: [Math.min(Math.max(asNumber(inputs[0]), min), max)] }
    },
  }),

  defineComponent<number>({
    id: 'arithmetic.delta',
    swType: 35,
    category: 'arithmetic',
    name: 'Delta',
    description: 'How much the number input changed since the previous tick.',
    inputs: [num('A')],
    outputs: [num('Delta')],
    properties: [],
    stateful: true,
    eval: ({ inputs, state }) => {
      const current = asNumber(inputs[0])
      return { outputs: [current - (state ?? current)], state: current }
    },
  }),

  numberFunction('arithmetic.function1', 45, 'Function (1 input)', ['x']),
  numberFunction('arithmetic.function3', 10, 'Function (3 inputs)', ['x', 'y', 'z']),
  numberFunction('arithmetic.function8', 36, 'Function (8 inputs)', [
    'x',
    'y',
    'z',
    'w',
    'a',
    'b',
    'c',
    'd',
  ]),

  defineComponent({
    id: 'arithmetic.numericalJunction',
    swType: 21,
    category: 'arithmetic',
    name: 'Numerical Junction',
    description: 'Sends the number input down one of two paths.',
    inputs: [num('Value'), onoff('Switch')],
    outputs: [num('Value (off)'), num('Value (on)')],
    properties: [],
    eval: ({ inputs }) => {
      const value = asNumber(inputs[0])
      // The path that is not taken reads as zero, as an unconnected input would
      return { outputs: asBool(inputs[1]) ? [0, value] : [value, 0] }
    },
  }),

  defineComponent({
    id: 'arithmetic.numericalSwitchbox',
    swType: 22,
    category: 'arithmetic',
    name: 'Numerical Switchbox',
    description: 'Passes one of two number inputs through, chosen by the switch.',
    inputs: [num('Value (on)'), num('Value (off)'), onoff('Switch')],
    outputs: [num('Value')],
    properties: [],
    eval: ({ inputs }) => ({
      outputs: [asBool(inputs[2]) ? asNumber(inputs[0]) : asNumber(inputs[1])],
    }),
  }),

  defineComponent<{ value: number; up: boolean; down: boolean; reset: boolean }>({
    id: 'arithmetic.upDownCounter',
    swType: 37,
    category: 'arithmetic',
    name: 'Up/Down Counter',
    description: 'Counts up and down as its inputs are pulsed.',
    inputs: [onoff('Up'), onoff('Down'), onoff('Reset')],
    outputs: [num('Value')],
    properties: [
      { kind: 'number', key: 'increment', label: 'Increment', default: 1 },
      { kind: 'number', key: 'min', label: 'Minimum', default: 0 },
      { kind: 'number', key: 'max', label: 'Maximum', default: 10 },
      { kind: 'number', key: 'resetValue', label: 'Reset value', default: 0 },
      { kind: 'bool', key: 'clamp', label: 'Clamp', default: true },
    ],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const previous = state ?? {
        value: prop(properties, 'resetValue', 0),
        up: false,
        down: false,
        reset: false,
      }
      const up = asBool(inputs[0])
      const down = asBool(inputs[1])
      const reset = asBool(inputs[2])
      const step = prop(properties, 'increment', 1)

      let value = previous.value
      if (rose(previous.up, up)) value += step
      if (rose(previous.down, down)) value -= step
      if (rose(previous.reset, reset)) value = prop(properties, 'resetValue', 0)
      if (properties.clamp !== false) {
        value = Math.min(Math.max(value, prop(properties, 'min', 0)), prop(properties, 'max', 10))
      }
      return { outputs: [value], state: { value, up, down, reset } }
    },
  }),

  defineComponent<number>({
    id: 'arithmetic.memoryRegister',
    swType: 13,
    category: 'arithmetic',
    name: 'Memory Register',
    description: 'Stores a number, holding it until it is written again or reset.',
    inputs: [num('Value'), onoff('Set'), onoff('Reset')],
    outputs: [num('Value')],
    properties: [{ kind: 'number', key: 'resetValue', label: 'Reset value', default: 0 }],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const resetValue = prop(properties, 'resetValue', 0)
      let value = state ?? resetValue
      if (asBool(inputs[1])) value = asNumber(inputs[0])
      if (asBool(inputs[2])) value = resetValue
      return { outputs: [value], state: value }
    },
  }),

  pidController('arithmetic.pid', 23, 'PID Controller', false),
  pidController('arithmetic.pidAdvanced', 39, 'PID Controller (advanced)', true),
]

interface PidState {
  readonly integral: number
  readonly previousError: number
}

/**
 * A discrete PID controller. The basic component takes its gains from
 * properties; the advanced one takes them as inputs so they can be tuned live.
 */
function pidController(id: string, swType: number, name: string, gainsAsInputs: boolean) {
  return defineComponent<PidState>({
    id,
    swType,
    category: 'arithmetic',
    name,
    description: 'Drives the process variable towards the setpoint.',
    inputs: gainsAsInputs
      ? [
          num('Setpoint'),
          num('Process variable'),
          num('Proportional'),
          num('Integral'),
          num('Derivative'),
          onoff('Active'),
        ]
      : [num('Setpoint'), num('Process variable'), onoff('Active')],
    outputs: [num('Output')],
    properties: gainsAsInputs
      ? []
      : [
          { kind: 'number', key: 'kp', label: 'Proportional', default: 1 },
          { kind: 'number', key: 'ki', label: 'Integral', default: 0 },
          { kind: 'number', key: 'kd', label: 'Derivative', default: 0 },
        ],
    stateful: true,
    eval: ({ inputs, properties, state }) => {
      const previous = state ?? { integral: 0, previousError: 0 }
      const active = gainsAsInputs ? asBool(inputs[5]) : asBool(inputs[2])
      if (!active) return { outputs: [0], state: { integral: 0, previousError: 0 } }

      const kp = gainsAsInputs ? asNumber(inputs[2]) : prop(properties, 'kp', 1)
      const ki = gainsAsInputs ? asNumber(inputs[3]) : prop(properties, 'ki', 0)
      const kd = gainsAsInputs ? asNumber(inputs[4]) : prop(properties, 'kd', 0)

      const error = asNumber(inputs[0]) - asNumber(inputs[1])
      const integral = previous.integral + error
      const derivative = error - previous.previousError
      return {
        outputs: [kp * error + ki * integral + kd * derivative],
        state: { integral, previousError: error },
      }
    },
  })
}
