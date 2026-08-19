/**
 * Video and audio routing.
 *
 * Video and audio payloads are modelled as opaque channel values: they are
 * routed faithfully, but nothing renders or plays them.
 */
import { defineComponent } from '../define'
import { audio, onoff, video } from '../portHelpers'
import { asBool } from '../values'
import type { ComponentDef, SignalValue } from '../types'

const select = (inputs: readonly (SignalValue | undefined)[]) =>
  asBool(inputs[2]) ? inputs[0] : inputs[1]

export const avComponents: ComponentDef[] = [
  defineComponent({
    id: 'av.videoSwitchbox',
    swType: 57,
    category: 'video',
    name: 'Video Switchbox',
    description: 'Passes one of two video signals through, chosen by the switch.',
    inputs: [video('Video (on)'), video('Video (off)'), onoff('Switch')],
    outputs: [video('Video')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [select(inputs)] }),
  }),

  defineComponent({
    id: 'av.audioSwitchbox',
    swType: 59,
    category: 'audio',
    name: 'Audio Switchbox',
    description: 'Passes one of two audio signals through, chosen by the switch.',
    inputs: [audio('Audio (on)'), audio('Audio (off)'), onoff('Switch')],
    outputs: [audio('Audio')],
    properties: [],
    eval: ({ inputs }) => ({ outputs: [select(inputs)] }),
  }),
]
