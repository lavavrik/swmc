/** Tooltip components, which surface a value on the vehicle rather than in the graph. */
import { defineComponent } from '../define'
import { num, onoff } from '../portHelpers'
import type { ComponentDef } from '../types'

const displayProperty = {
  kind: 'dropdown',
  key: 'display',
  label: 'Show',
  default: 'always',
  xml: { form: 'attributeEnum', name: 'm', values: { always: 0, on: 1, off: 2 } },
  options: [
    { value: 'always', label: 'Always' },
    { value: 'on', label: 'When on' },
    { value: 'off', label: 'When off' },
  ],
} as const

export const tooltipComponents: ComponentDef[] = [
  defineComponent({
    id: 'tooltip.number',
    swType: 43,
    category: 'data',
    name: 'Tooltip Number',
    description: 'Shows a number in the vehicle tooltip.',
    inputs: [num('Value'), onoff('Is error')],
    outputs: [],
    properties: [{ kind: 'text', key: 'name', label: 'Label', default: 'value' }, displayProperty],
    eval: () => ({ outputs: [] }),
  }),

  defineComponent({
    id: 'tooltip.onoff',
    swType: 44,
    category: 'data',
    name: 'Tooltip On/Off',
    description: 'Shows an on/off state in the vehicle tooltip.',
    inputs: [onoff('Value')],
    outputs: [],
    properties: [
      {
        kind: 'text',
        key: 'name',
        label: 'Label',
        default: 'state',
        xml: { form: 'attribute', name: 'l' },
      },
      {
        kind: 'text',
        key: 'onLabel',
        label: 'On label',
        default: 'on',
        xml: { form: 'attribute', name: 'on' },
      },
      {
        kind: 'text',
        key: 'offLabel',
        label: 'Off label',
        default: 'off',
        xml: { form: 'attribute', name: 'off' },
      },
      displayProperty,
    ],
    eval: () => ({ outputs: [] }),
  }),
]
