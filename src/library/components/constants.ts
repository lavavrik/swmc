/** Components that emit a fixed value. */
import { defineComponent } from '../define'
import { num, onoff, prop } from '../portHelpers'
import type { ComponentDef } from '../types'

export const constantComponents: ComponentDef[] = [
  defineComponent({
    id: 'const.number',
    swType: 15,
    category: 'data',
    name: 'Constant Number',
    description: 'Outputs a fixed number value.',
    inputs: [],
    outputs: [num('Value')],
    properties: [{ kind: 'number', key: 'value', label: 'Value', default: 0 }],
    eval: ({ properties }) => ({ outputs: [prop(properties, 'value', 0)] }),
  }),

  defineComponent({
    id: 'const.on',
    swType: 16,
    category: 'data',
    name: 'Constant On',
    description: 'Always outputs on.',
    inputs: [],
    outputs: [onoff('On')],
    properties: [],
    eval: () => ({ outputs: [true] }),
  }),
]
