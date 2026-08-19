/**
 * The placeholder for a component type this editor does not recognise.
 *
 * An imported file that contains one still opens, still shows its wires, and
 * still saves correctly: the original element's attributes ride along on the
 * node's `raw` slot, and the port counts are inferred from the wires that
 * touched it.
 */
import { defineComponent } from '../define'
import { num, prop } from '../portHelpers'
import type { ComponentDef } from '../types'

export const unknownComponents: ComponentDef[] = [
  defineComponent({
    id: 'unknown.component',
    swType: null,
    category: 'data',
    name: 'Unrecognised component',
    description: 'A component from the file that this editor does not know. Preserved as-is.',
    inputs: (properties) =>
      Array.from({ length: Math.max(0, prop(properties, 'inputCount', 0)) }, (_, i) =>
        num(`Input ${i + 1}`),
      ),
    outputs: (properties) =>
      Array.from({ length: Math.max(0, prop(properties, 'outputCount', 0)) }, (_, i) =>
        num(`Output ${i + 1}`),
      ),
    properties: [
      { kind: 'number', key: 'swType', label: 'Type number', default: -1 },
      { kind: 'number', key: 'inputCount', label: 'Inputs', default: 0 },
      { kind: 'number', key: 'outputCount', label: 'Outputs', default: 0 },
    ],
    deprecated: true,
    eval: ({ properties }) => ({
      outputs: Array.from({ length: Math.max(0, prop(properties, 'outputCount', 0)) }, () => 0),
    }),
  }),
]
