/** Terse port constructors, so component definitions stay readable. */
import type { PortDef } from './types'

export const num = (label: string): PortDef => ({ label, signal: 'number' })
export const onoff = (label: string): PortDef => ({ label, signal: 'onoff' })
export const composite = (label: string): PortDef => ({ label, signal: 'composite' })
export const video = (label: string): PortDef => ({ label, signal: 'video' })
export const audio = (label: string): PortDef => ({ label, signal: 'audio' })

/** The game runs logic at 60 ticks per second. */
export const TICKS_PER_SECOND = 60

/** Reads a numeric property, falling back when it is missing or the wrong type. */
export const prop = (
  properties: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number => {
  const value = properties[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export const textProp = (
  properties: Readonly<Record<string, unknown>>,
  key: string,
  fallback = '',
): string => {
  const value = properties[key]
  return typeof value === 'string' ? value : fallback
}

export const boolProp = (properties: Readonly<Record<string, unknown>>, key: string): boolean =>
  properties[key] === true

/** Channel counts are 1..32, and channel numbers are 1-based as the game shows them. */
export const clampChannel = (n: number): number => Math.min(32, Math.max(1, Math.round(n)))
