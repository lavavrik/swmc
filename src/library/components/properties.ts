/**
 * Property components.
 *
 * These are the controls a player sees on the vehicle's tweak panel: the value
 * is set outside the microcontroller and read inside it, so evaluation just
 * emits whatever the property currently holds.
 */
import { defineComponent } from '../define'
import { num, onoff, prop, textProp } from '../portHelpers'
import type { ComponentDef } from '../types'

const nameProperty = { kind: 'text', key: 'name', label: 'Name', default: 'property' } as const

export const propertyComponents: ComponentDef[] = [
  defineComponent({
    id: 'property.number',
    swType: 34,
    category: 'property',
    name: 'Property Number',
    description: 'A number the player can set on the vehicle.',
    inputs: [],
    outputs: [num('Value')],
    properties: [nameProperty, { kind: 'number', key: 'value', label: 'Value', default: 0 }],
    eval: ({ properties }) => ({ outputs: [prop(properties, 'value', 0)] }),
  }),

  defineComponent({
    id: 'property.slider',
    swType: 19,
    category: 'property',
    name: 'Property Slider',
    description: 'A slider the player can set on the vehicle.',
    inputs: [],
    outputs: [num('Value')],
    properties: [
      nameProperty,
      { kind: 'number', key: 'min', label: 'Minimum', default: 0 },
      { kind: 'number', key: 'max', label: 'Maximum', default: 1 },
      { kind: 'number', key: 'increment', label: 'Increment', default: 0.1 },
      { kind: 'slider', key: 'value', label: 'Value', default: 0, min: 0, max: 1, step: 0.01 },
    ],
    eval: ({ properties }) => {
      const min = prop(properties, 'min', 0)
      const max = prop(properties, 'max', 1)
      return { outputs: [Math.min(Math.max(prop(properties, 'value', 0), min), max)] }
    },
  }),

  defineComponent({
    id: 'property.toggle',
    swType: 33,
    category: 'property',
    name: 'Property Toggle',
    description: 'An on/off switch the player can set on the vehicle.',
    inputs: [],
    outputs: [onoff('Value')],
    properties: [
      nameProperty,
      { kind: 'text', key: 'onLabel', label: 'On label', default: 'on' },
      { kind: 'text', key: 'offLabel', label: 'Off label', default: 'off' },
      { kind: 'bool', key: 'value', label: 'Value', default: false },
    ],
    eval: ({ properties }) => ({ outputs: [properties.value === true] }),
  }),

  defineComponent({
    id: 'property.dropdown',
    swType: 20,
    category: 'property',
    name: 'Property Dropdown',
    description: 'A list of choices the player can pick from; outputs the chosen value.',
    inputs: [],
    outputs: [num('Value')],
    properties: [
      nameProperty,
      { kind: 'text', key: 'items', label: 'Items', default: 'first, second' },
      { kind: 'number', key: 'value', label: 'Selected', default: 0 },
    ],
    eval: ({ properties }) => ({ outputs: [prop(properties, 'value', 0)] }),
  }),

  defineComponent({
    id: 'property.text',
    swType: 58,
    category: 'property',
    name: 'Property Text',
    description: 'Text for a Lua script to read with property.getText.',
    inputs: [],
    outputs: [],
    properties: [nameProperty, { kind: 'text', key: 'value', label: 'Value', default: '' }],
    eval: ({ properties }) => {
      // No output port — the value reaches Lua through the property API
      void textProp(properties, 'value')
      return { outputs: [] }
    },
  }),
]
