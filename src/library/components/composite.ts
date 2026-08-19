import { defineComponent } from '../define'
import { asComposite } from '../values'
import type { ComponentDef } from '../types'

/** Channels are 1-based in the UI and in saved files; the array index is one lower. */
const channelIndex = (value: unknown): number => {
  const n = typeof value === 'number' ? Math.round(value) : 1
  return Math.min(32, Math.max(1, n)) - 1
}

export const compositeComponents: ComponentDef[] = [
  defineComponent({
    id: 'composite.readOnoff',
    swType: null,
    category: 'composite',
    name: 'Composite Read (on/off)',
    description: 'Reads one on/off channel out of a composite signal.',
    inputs: [{ label: 'Composite', signal: 'composite' }],
    outputs: [{ label: 'Value', signal: 'onoff' }],
    properties: [{ kind: 'number', key: 'channel', label: 'Channel', default: 1 }],
    eval: ({ inputs, properties }) => ({
      outputs: [asComposite(inputs[0]).bools[channelIndex(properties.channel)] ?? false],
    }),
  }),
]
