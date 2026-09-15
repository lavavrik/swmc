/**
 * The microcontroller's own external pins.
 *
 * These are ordinary nodes so that wires need only one kind of endpoint; the
 * document's `ioOrder` records the order they appear on the block. Their values
 * come from outside the graph, so an input pin's eval yields `undefined` and
 * the tick engine substitutes the value the user set in the I/O panel.
 */
import { SIGNAL_TYPES, type SignalType } from '@/model/types'
import { defineComponent } from '../define'
import type { ComponentDef } from '../types'

const SIGNAL_NAMES: Record<SignalType, string> = {
  onoff: 'on/off',
  number: 'number',
  composite: 'composite',
  video: 'video',
  audio: 'audio',
}

/**
 * `faceX` and `faceZ` place the pin on the block's face in the vehicle, and
 * `nodeId` is the identifier the vehicle uses for it — both come straight from
 * a saved file and are kept so imports round-trip. Face coordinates are hidden
 * in the editor (pin order on the list is what the user edits).
 */
const labelProperties = [
  { kind: 'text', key: 'label', label: 'Name', default: '' },
  { kind: 'text', key: 'description', label: 'Description', default: '' },
  { kind: 'number', key: 'faceX', label: 'Face x', default: 0 },
  { kind: 'number', key: 'faceZ', label: 'Face z', default: 0 },
] as const

export const ioComponents: ComponentDef[] = SIGNAL_TYPES.flatMap((signal) => [
  defineComponent({
    id: `io.in.${signal}`,
    swType: null,
    category: 'io',
    name: `${SIGNAL_NAMES[signal]} input`,
    description: 'An input pin on the microcontroller. Its value comes from the vehicle.',
    inputs: [],
    outputs: [{ label: 'Value', signal }],
    properties: [...labelProperties],
    eval: () => ({ outputs: [undefined] }),
  }),
  defineComponent({
    id: `io.out.${signal}`,
    swType: null,
    category: 'io',
    name: `${SIGNAL_NAMES[signal]} output`,
    description: 'An output pin on the microcontroller. Its value goes to the vehicle.',
    inputs: [{ label: 'Value', signal }],
    outputs: [],
    properties: [...labelProperties],
    eval: () => ({ outputs: [] }),
  }),
])
