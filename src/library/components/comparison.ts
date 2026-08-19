/** Components that answer questions about numbers with an on/off signal. */
import { defineComponent } from '../define'
import { num, onoff, prop } from '../portHelpers'
import { asNumber } from '../values'
import type { ComponentDef } from '../types'

export const comparisonComponents: ComponentDef[] = [
  defineComponent({
    id: 'comparison.threshold',
    swType: 12,
    category: 'comparison',
    name: 'Threshold',
    description: 'Outputs on while the number input sits inside the given range.',
    inputs: [num('A')],
    outputs: [onoff('In range')],
    properties: [
      {
        kind: 'number',
        key: 'min',
        label: 'Minimum',
        default: 0,
        xml: { form: 'numberElement', name: 'min' },
      },
      {
        kind: 'number',
        key: 'max',
        label: 'Maximum',
        default: 1,
        xml: { form: 'numberElement', name: 'max' },
      },
    ],
    eval: ({ inputs, properties }) => {
      const value = asNumber(inputs[0])
      return {
        outputs: [value >= prop(properties, 'min', 0) && value <= prop(properties, 'max', 1)],
      }
    },
  }),

  defineComponent({
    id: 'comparison.greaterThan',
    swType: 17,
    category: 'comparison',
    name: 'Greater Than',
    description: 'Outputs on when the first number input is greater than the second.',
    inputs: [num('A'), num('B')],
    outputs: [onoff('A > B')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [asNumber(inputs[0]) > asNumber(inputs[1])] }),
  }),

  defineComponent({
    id: 'comparison.lessThan',
    swType: 18,
    category: 'comparison',
    name: 'Less Than',
    description: 'Outputs on when the first number input is less than the second.',
    inputs: [num('A'), num('B')],
    outputs: [onoff('A < B')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [asNumber(inputs[0]) < asNumber(inputs[1])] }),
  }),

  defineComponent({
    id: 'comparison.equal',
    swType: 42,
    category: 'comparison',
    name: 'Equal',
    description: 'Outputs on when the two number inputs match within a tolerance.',
    inputs: [num('A'), num('B')],
    outputs: [onoff('A = B')],
    properties: [
      {
        kind: 'number',
        key: 'epsilon',
        label: 'Tolerance',
        default: 0,
        xml: { form: 'numberElement', name: 'e' },
      },
    ],
    eval: ({ inputs, properties }) => ({
      outputs: [
        Math.abs(asNumber(inputs[0]) - asNumber(inputs[1])) <=
          Math.abs(prop(properties, 'epsilon', 0)),
      ],
    }),
  }),
]
