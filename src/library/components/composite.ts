/**
 * Composite components.
 *
 * A composite signal carries 32 numbers and 32 booleans. Write components
 * expose one input per channel they touch, so their port lists are resolved
 * from their `count` property rather than being fixed — that is what the
 * "active inputs: 2, 3" line on an in-game card reports.
 *
 * Channel numbers are 1-based everywhere the user sees them, and zero-based in
 * saved files; the `offset` in the XML mapping is the only place that differs.
 */
import type { NodeProperties } from '@/model/schema'
import type { SignalType } from '@/model/types'
import { defineComponent } from '../define'
import { clampChannel, composite, num, onoff, prop } from '../portHelpers'
import { EMPTY_COMPOSITE, asBool, asComposite, asNumber } from '../values'
import type { ComponentDef, CompositeValue, PortDef } from '../types'

const startChannel = (properties: NodeProperties): number =>
  clampChannel(prop(properties, 'channel', 1))

const channelCount = (properties: NodeProperties): number =>
  clampChannel(prop(properties, 'count', 1))

/** Channel ports, labelled with the channel number they actually address. */
function channelPorts(properties: NodeProperties, signal: SignalType): PortDef[] {
  const start = startChannel(properties)
  const count = Math.min(channelCount(properties), 33 - start)
  return Array.from({ length: count }, (_, i) => ({ label: `Channel ${start + i}`, signal }))
}

/**
 * The same setting, under two different attribute names: a read stores it as
 * `i`, a write as `offset`. Both are the channel number less one.
 */
const readChannelProperty = {
  kind: 'number',
  key: 'channel',
  label: 'Start channel',
  default: 1,
  xml: { form: 'attributeNumber', name: 'i', offset: 1 },
} as const

const writeChannelProperty = {
  ...readChannelProperty,
  xml: { form: 'attributeNumber', name: 'offset', offset: 1 },
} as const

/**
 * The start channel comes from a wire rather than the property when the channel
 * is set to 0 — an offset of -1 in a saved file. The port only exists in that
 * case, which is why these components are a quarter unit shorter when the
 * channel is set here.
 */
const takesChannelFromInput = (properties: NodeProperties): boolean =>
  prop(properties, 'channel', 1) <= 0

const leadingPorts = (properties: NodeProperties): PortDef[] =>
  takesChannelFromInput(properties)
    ? [composite('Composite'), num('Start channel')]
    : [composite('Composite')]

const countProperty = {
  kind: 'number',
  key: 'count',
  label: 'Channel count',
  default: 1,
  // The game means 32 channels when the attribute is absent
  xml: { form: 'attributeNumber', name: 'count', absent: 32 },
} as const

/** Replaces a run of channels in a composite value. */
function writeChannels<T>(base: readonly T[], start: number, values: readonly T[]): readonly T[] {
  const next = [...base]
  values.forEach((value, i) => {
    const index = start - 1 + i
    if (index < 32) next[index] = value
  })
  return next
}

function compositeRead(id: string, swType: number, name: string, signal: 'onoff' | 'number') {
  const kind = signal === 'onoff' ? 'on/off' : 'number'
  return defineComponent({
    id,
    swType,
    category: 'composite',
    name,
    description: `Reads one ${kind} channel out of a composite signal.`,
    inputs: (properties) => leadingPorts(properties),
    outputs: [{ label: 'Value', signal }],
    properties: [readChannelProperty],
    eval: ({ inputs, properties }) => {
      const value = asComposite(inputs[0])
      const channel = takesChannelFromInput(properties)
        ? clampChannel(asNumber(inputs[1]))
        : startChannel(properties)
      const source = signal === 'onoff' ? value.bools : value.numbers
      return { outputs: [source[channel - 1] ?? (signal === 'onoff' ? false : 0)] }
    },
  })
}

function compositeWrite(
  id: string,
  swType: number,
  name: string,
  signal: 'onoff' | 'number',
  deprecated = false,
) {
  const kind = signal === 'onoff' ? 'on/off' : 'number'
  return defineComponent({
    id,
    swType,
    category: 'composite',
    name,
    description: `Writes ${kind} values into channels of a composite signal.`,
    inputs: (properties) => [...leadingPorts(properties), ...channelPorts(properties, signal)],
    outputs: [composite('Composite')],
    properties: [writeChannelProperty, countProperty],
    deprecated,
    xml: {
      // The composite and start-channel inputs are named; channels are numbered
      inputNames: (properties) => [
        ...(takesChannelFromInput(properties) ? ['c', 'off'] : ['c']),
        ...channelPorts(properties, signal).map((_, i) => String(i + 1)),
      ],
    },
    eval: ({ inputs, properties }) => {
      const base = asComposite(inputs[0])
      const lead = leadingPorts(properties).length
      const start = takesChannelFromInput(properties)
        ? clampChannel(asNumber(inputs[1]))
        : startChannel(properties)
      const values = channelPorts(properties, signal).map((_, i) =>
        signal === 'onoff' ? asBool(inputs[i + lead]) : asNumber(inputs[i + lead]),
      )
      const written: CompositeValue =
        signal === 'onoff'
          ? { numbers: base.numbers, bools: writeChannels(base.bools, start, values as boolean[]) }
          : { numbers: writeChannels(base.numbers, start, values as number[]), bools: base.bools }
      return { outputs: [written] }
    },
  })
}

export const compositeComponents: ComponentDef[] = [
  compositeRead('composite.readOnoff', 29, 'Composite Read (on/off)', 'onoff'),
  compositeRead('composite.readNumber', 31, 'Composite Read (number)', 'number'),
  compositeWrite('composite.writeOnoff', 41, 'Composite Write (on/off)', 'onoff'),
  compositeWrite('composite.writeNumber', 40, 'Composite Write (number)', 'number'),
  // The game keeps the original write components around for old creations
  compositeWrite(
    'composite.writeOnoffLegacy',
    30,
    'Composite Write (on/off, legacy)',
    'onoff',
    true,
  ),
  compositeWrite(
    'composite.writeNumberLegacy',
    32,
    'Composite Write (number, legacy)',
    'number',
    true,
  ),

  defineComponent({
    id: 'composite.switchbox',
    swType: 53,
    category: 'composite',
    name: 'Composite Switchbox',
    description: 'Passes one of two composite signals through, chosen by the switch.',
    inputs: [composite('Composite (on)'), composite('Composite (off)'), onoff('Switch')],
    outputs: [composite('Composite')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [asComposite(asBool(inputs[2]) ? inputs[0] : inputs[1])] }),
  }),

  defineComponent({
    id: 'composite.numberToBinary',
    swType: 54,
    category: 'composite',
    name: 'Number to Composite Binary',
    description: 'Writes the bits of a number into the 32 on/off channels.',
    inputs: [num('Value')],
    outputs: [composite('Composite')],
    properties: [],
    eval: ({ inputs }) => {
      const value = Math.trunc(asNumber(inputs[0]))
      const bools = Array.from({ length: 32 }, (_, bit) => ((value >>> bit) & 1) === 1)
      return { outputs: [{ numbers: EMPTY_COMPOSITE.numbers, bools }] }
    },
  }),

  defineComponent({
    id: 'composite.binaryToNumber',
    swType: 55,
    category: 'composite',
    name: 'Composite Binary to Number',
    description: 'Reads the 32 on/off channels back as the bits of a number.',
    inputs: [composite('Composite')],
    outputs: [num('Value')],
    properties: [],
    eval: ({ inputs }) => {
      const { bools } = asComposite(inputs[0])
      let value = 0
      for (let bit = 0; bit < 32; bit++) if (bools[bit]) value |= 1 << bit
      return { outputs: [value >>> 0] }
    },
  }),
]
