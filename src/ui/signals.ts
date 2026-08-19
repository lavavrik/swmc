import type { SignalType } from '@/model/types'

/** CSS custom property holding a signal's colour, used for wires and port dots. */
export const signalColor = (signal: SignalType): string => `var(--signal-${signal})`

export const SIGNAL_LABELS: Record<SignalType, string> = {
  onoff: 'on/off',
  number: 'number',
  composite: 'composite',
  video: 'video',
  audio: 'audio',
}
