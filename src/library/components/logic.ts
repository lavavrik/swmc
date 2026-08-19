import { defineComponent } from '../define'
import { asBool } from '../values'
import type { ComponentDef } from '../types'

const onoff = (label: string) => ({ label, signal: 'onoff' as const })

export const logicComponents: ComponentDef[] = [
  defineComponent({
    id: 'logic.and',
    swType: null,
    category: 'logic',
    name: 'AND',
    description: 'Outputs on when both on/off inputs are on.',
    inputs: [onoff('A'), onoff('B')],
    outputs: [onoff('A and B')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [asBool(inputs[0]) && asBool(inputs[1])] }),
  }),
  defineComponent({
    id: 'logic.not',
    swType: null,
    category: 'logic',
    name: 'NOT',
    description: 'Outputs on when the on/off input is off.',
    inputs: [onoff('A')],
    outputs: [onoff('not A')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [!asBool(inputs[0])] }),
  }),
]
