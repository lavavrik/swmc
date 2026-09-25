/**
 * Tick a built microcontroller with named pin values.
 *
 * The plant (engine, battery, wheels) is not in this repository. A scenario is
 * the values arriving on the pins, and the values leaving them.
 */
import { formatSignal } from '@/sim/format'
import { Simulation } from '@/sim/engine'
import type { SignalValue } from '@/library/types'
import { EMPTY_COMPOSITE, withCompositeNumber } from '@/library/values'
import { err, ok, type Result } from '@/model/result'
import type { Microcontroller, NodeId, SignalType } from '@/model/types'
import { slugPort } from './ports'

export interface SimPin {
  readonly id: string
  readonly label: string
  readonly direction: 'in' | 'out'
  readonly signal: SignalType
  readonly value: SignalValue | undefined
}

export interface SimResult {
  readonly ticks: number
  readonly pins: readonly SimPin[]
}

export function parseSignalValue(signal: SignalType, raw: string): Result<SignalValue> {
  const text = raw.trim()
  if (signal === 'onoff') {
    const lower = text.toLowerCase()
    if (lower === 'true' || lower === 'on' || lower === 'yes' || lower === '1') return ok(true)
    if (lower === 'false' || lower === 'off' || lower === 'no' || lower === '0') return ok(false)
    return err(`on/off value "${raw}" — use on/off or true/false`)
  }
  if (signal === 'number') {
    const n = Number(text)
    if (!Number.isFinite(n)) return err(`not a number: ${raw}`)
    return ok(n)
  }
  if (signal === 'composite') {
    // "13=20" writes that number channel. A bare number is seat W/S (ch 2).
    if (!text.includes('=')) {
      const n = Number(text)
      if (!Number.isFinite(n)) {
        return err(`composite value "${raw}" — use a number (channel 2) or ch=value`)
      }
      return ok(withCompositeNumber(undefined, 2, n))
    }
    let value = EMPTY_COMPOSITE
    for (const part of text.split(',')) {
      const cut = part.indexOf('=')
      const channel = Number(part.slice(0, cut))
      const n = Number(part.slice(cut + 1))
      if (!Number.isInteger(channel) || channel < 1 || channel > 32 || !Number.isFinite(n)) {
        return err(`composite value "${raw}" — use ch=value, e.g. 13=20`)
      }
      value = withCompositeNumber(value, channel, n)
    }
    return ok(value)
  }
  return err(`setting ${signal} pins is not supported on the command line`)
}

export function pinAliases(
  doc: Microcontroller,
  names?: ReadonlyMap<string, NodeId>,
): Map<string, NodeId> {
  const aliases = new Map<string, NodeId>()
  const reverse = new Map<NodeId, string>()
  if (names) {
    for (const [name, id] of names) reverse.set(id, name)
  }
  for (const id of doc.ioOrder) {
    const node = doc.nodes.find((n) => n.id === id)
    if (!node) continue
    const recipeId = reverse.get(id)
    const label = String(node.properties.label ?? '')
    const keys = [id, recipeId, label, slugPort(label)].filter(
      (k): k is string => !!k && k.length > 0,
    )
    for (const key of keys) {
      if (!aliases.has(key)) aliases.set(key, id)
      if (!aliases.has(key.toLowerCase())) aliases.set(key.toLowerCase(), id)
    }
  }
  return aliases
}

export function runSim(
  doc: Microcontroller,
  ticks: number,
  inputs: Readonly<Record<string, string>>,
  names?: ReadonlyMap<string, NodeId>,
): Result<SimResult> {
  const steps = runScenario(doc, [{ ticks, set: inputs }], names)
  return steps.ok ? ok(steps.value[0]!) : steps
}

/** One stretch of a scenario: set these pins, then run this many ticks. */
export interface SimPhase {
  readonly ticks: number
  readonly set: Readonly<Record<string, string>>
}

/**
 * Runs the phases one after another on one simulation, so state (latches,
 * timers, Lua globals) carries over. Pins not set in a phase keep their
 * value from the one before. One result per phase, taken at its end.
 */
export function runScenario(
  doc: Microcontroller,
  phases: readonly SimPhase[],
  names?: ReadonlyMap<string, NodeId>,
): Result<SimResult[]> {
  const aliases = pinAliases(doc, names)
  const sim = new Simulation(doc)
  const reverse = new Map<NodeId, string>()
  if (names) for (const [name, id] of names) reverse.set(id, name)
  const results: SimResult[] = []

  for (const phase of phases) {
    for (const [key, raw] of Object.entries(phase.set)) {
      const id = aliases.get(key) ?? aliases.get(key.toLowerCase())
      if (!id) {
        const known = doc.ioOrder
          .map((pinId) => {
            const n = doc.nodes.find((node) => node.id === pinId)
            return n ? String(n.properties.label || pinId) : pinId
          })
          .join(', ')
        return err(`no pin "${key}". pins: ${known || '(none)'}`)
      }
      const node = doc.nodes.find((n) => n.id === id)
      if (!node) return err(`no pin "${key}"`)
      const signal = node.type.split('.')[2] as SignalType
      if (!node.type.startsWith('io.in.')) return err(`"${key}" is not an input pin`)
      const value = parseSignalValue(signal, raw)
      if (!value.ok) return err(`${key}: ${value.error}`)
      sim.setInput(id, value.value)
    }

    sim.run(Math.max(0, phase.ticks))

    const pins: SimPin[] = doc.ioOrder.flatMap((id) => {
      const node = doc.nodes.find((n) => n.id === id)
      if (!node) return []
      const [, direction, signal] = node.type.split('.') as ['io', 'in' | 'out', SignalType]
      const value =
        direction === 'in'
          ? sim.outputValue({ node: id, kind: 'out', index: 0 })
          : sim.getOutput(id)
      return [
        {
          id: reverse.get(id) ?? id,
          label: String(node.properties.label ?? ''),
          direction,
          signal,
          value,
        },
      ]
    })
    results.push({ ticks: sim.tickCount, pins })
  }

  return ok(results)
}

export function formatSimResult(result: SimResult): string {
  const rows = result.pins.map((pin) => {
    const name = pin.label || pin.id
    const value = pin.value === undefined ? '—' : formatSignal(pin.value)
    return `${pin.direction.padEnd(3)} ${name.padEnd(22)} ${value}`
  })
  return [`t=${result.ticks}`, ...rows].join('\n')
}
