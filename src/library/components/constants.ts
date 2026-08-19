import { defineComponent } from '../define'
import type { ComponentDef } from '../types'

export const constantComponents: ComponentDef[] = [
  defineComponent({
    id: 'const.number',
    swType: null,
    category: 'data',
    name: 'Constant Number',
    description: 'Outputs a fixed number value.',
    inputs: [],
    outputs: [{ label: 'Value', signal: 'number' }],
    properties: [{ kind: 'number', key: 'value', label: 'Value', default: 0 }],
    eval: ({ properties }) => ({
      outputs: [typeof properties.value === 'number' ? properties.value : 0],
    }),
  }),
  defineComponent({
    id: 'const.onoff',
    swType: null,
    category: 'data',
    name: 'Constant On/Off',
    description: 'Outputs a fixed on/off value.',
    inputs: [],
    outputs: [{ label: 'Value', signal: 'onoff' }],
    properties: [{ kind: 'bool', key: 'value', label: 'Value', default: false }],
    eval: ({ properties }) => ({ outputs: [properties.value === true] }),
  }),
]
