import { defineComponent } from '../define'
import { asNumber } from '../values'
import { evaluateExpression } from '../expression'
import type { ComponentDef } from '../types'

const number = (label: string) => ({ label, signal: 'number' as const })

export const arithmeticComponents: ComponentDef[] = [
  defineComponent({
    id: 'arithmetic.add',
    swType: null,
    category: 'arithmetic',
    name: 'Add',
    description: 'Adds the two number inputs together.',
    inputs: [number('A'), number('B')],
    outputs: [number('A + B')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [asNumber(inputs[0]) + asNumber(inputs[1])] }),
  }),
  defineComponent({
    id: 'arithmetic.subtract',
    swType: null,
    category: 'arithmetic',
    name: 'Subtract',
    description: 'Subtracts the second number input from the first.',
    inputs: [number('A'), number('B')],
    outputs: [number('A - B')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [asNumber(inputs[0]) - asNumber(inputs[1])] }),
  }),
]

export const functionComponent = defineComponent({
  id: 'data.function',
  swType: null,
  category: 'data',
  name: 'Function',
  description: 'Evaluates a mathematical expression of the number inputs x, y and z.',
  inputs: [number('x'), number('y'), number('z')],
  outputs: [number('Result')],
  properties: [{ kind: 'text', key: 'expression', label: 'Expression', default: 'x' }],
  eval: ({ inputs, properties }) => {
    const source = typeof properties.expression === 'string' ? properties.expression : ''
    return {
      outputs: [
        evaluateExpression(source, {
          x: asNumber(inputs[0]),
          y: asNumber(inputs[1]),
          z: asNumber(inputs[2]),
        }),
      ],
    }
  },
})
