import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { setProperty } from '@/model/ops'
import { expect as unwrap } from '@/model/result'
import type { Microcontroller, NodeId, PropertyValue } from '@/model/types'
import { buildRecipe } from './build'
import { formatFromPath, parseRecipeText } from './parse'
import { runSim } from './run'

const load = () => {
  const parsed = unwrap(
    parseRecipeText(
      readFileSync(join(process.cwd(), 'recipes/hybrid-full.yaml'), 'utf8'),
      formatFromPath('hybrid-full.yaml'),
    ),
  )
  return unwrap(buildRecipe(parsed))
}

const built = load()

function docWith(toggles: Record<string, boolean>): Microcontroller {
  let doc = built.doc
  for (const [name, value] of Object.entries(toggles)) {
    const id = built.ids.get(name)
    if (!id) throw new Error(`no node ${name}`)
    doc = unwrap(setProperty(doc, id, 'value', value))
  }
  return doc
}

function pins(
  inputs: Record<string, string>,
  toggles: Record<string, boolean> = {},
): Record<string, PropertyValue | undefined> {
  const result = unwrap(
    runSim(docWith(toggles), 1, inputs, built.ids as ReadonlyMap<string, NodeId>),
  )
  const out: Record<string, PropertyValue | undefined> = {}
  for (const pin of result.pins) out[pin.id] = pin.value as PropertyValue | undefined
  return out
}

const drive = {
  ignition: 'on',
  throttle: '0.6',
  brake: '0',
  reverse: 'off',
  engine_rps: '0',
  battery: '0.5',
  speed: '0',
}

describe('hybrid full', () => {
  it('cranks the diesel with the motor, wheels disconnected', () => {
    const p = pins(drive)
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0.7)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(0)
    expect(p.engine_gen).toBe(0)
    expect(p.regen).toBe(0)
    expect(p.motor).toBe(0.4)
    expect(p.reverse_out).toBe(false)
  })

  it('closes the generator once the engine is actually running', () => {
    const p = pins({ ...drive, engine_rps: '12' })
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0.7)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBe(1)
    expect(p.regen).toBe(0)
    expect(p.motor).toBe(0.6)
  })

  it('idles the engine when the battery does not need charge', () => {
    const p = pins({ ...drive, battery: '0.85', engine_rps: '12' })
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBe(0)
    expect(p.motor).toBe(0.6)
  })

  it('clutches the transmission generator while braking', () => {
    const p = pins({ ...drive, engine_rps: '12', brake: '0.8' })
    expect(p.motor).toBe(0)
    expect(p.regen).toBe(0.8)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBe(1)
  })

  it('does not regen into a full battery', () => {
    const p = pins({ ...drive, engine_rps: '12', brake: '0.8', battery: '0.99' })
    expect(p.motor).toBe(0)
    expect(p.regen).toBe(0)
  })

  it('can regen while the engine generator is also on', () => {
    const p = pins({ ...drive, engine_rps: '12', brake: '0.8' })
    expect(p.engine_gen).toBe(1)
    expect(p.regen).toBe(0.8)
    expect(p.motor).toBe(0)
  })

  it('reverses the motors', () => {
    expect(pins({ ...drive, reverse: 'on' }).reverse_out).toBe(true)
  })

  it('shuts everything down with ignition off', () => {
    const p = pins({ ...drive, ignition: 'off' })
    expect(p.engine).toBe(false)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_clutch).toBe(0)
    expect(p.drive_clutch).toBe(0)
    expect(p.engine_gen).toBe(0)
    expect(p.regen).toBe(0)
    expect(p.motor).toBe(0)
    expect(p.reverse_out).toBe(false)
  })

  it('still cranks with the motor when drive motors would be cut', () => {
    const p = pins({ ...drive, battery: '0.1' })
    expect(p.motor).toBe(0.4)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(0)
    expect(p.reverse_out).toBe(false)
  })

  it('leaves the engine off in EV while the battery is healthy', () => {
    const p = pins(drive, { ev_mode: true })
    expect(p.engine).toBe(false)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_clutch).toBe(0)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBe(0)
    expect(p.regen).toBe(0)
    expect(p.motor).toBe(0.6)
  })

  it('starts the engine in EV when the battery is low', () => {
    const p = pins({ ...drive, battery: '0.2' }, { ev_mode: true })
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0.7)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(0)
    expect(p.motor).toBe(0.4)
  })

  it('charges from a running engine without driving through it', () => {
    const p = pins(
      { ...drive, engine_rps: '12', battery: '0.5' },
      { ev_mode: true, charge_hold: true },
    )
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0.7)
    expect(p.engine_clutch).toBe(0)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBe(1)
    expect(p.regen).toBe(0)
  })

  it('holds first gear at a standstill', () => {
    const p = pins(drive)
    expect(p.gb1).toBe(false)
    expect(p.gb2).toBe(false)
    expect(p.gb3).toBe(false)
  })

  it('shifts three gearboxes as binary gears from wheel RPS', () => {
    const g2 = pins({ ...drive, speed: '5' })
    expect(g2.gb1).toBe(true)
    expect(g2.gb2).toBe(false)
    expect(g2.gb3).toBe(false)
    const g3 = pins({ ...drive, speed: '9' })
    expect(g3.gb1).toBe(false)
    expect(g3.gb2).toBe(true)
    expect(g3.gb3).toBe(false)
    const g4 = pins({ ...drive, speed: '13' })
    expect(g4.gb1).toBe(true)
    expect(g4.gb2).toBe(true)
    expect(g4.gb3).toBe(false)
    const g5 = pins({ ...drive, speed: '17' })
    expect(g5.gb1).toBe(false)
    expect(g5.gb2).toBe(false)
    expect(g5.gb3).toBe(true)
  })

  it('holds first gear in reverse', () => {
    const p = pins({ ...drive, reverse: 'on', speed: '20' })
    expect(p.gb1).toBe(false)
    expect(p.gb2).toBe(false)
    expect(p.gb3).toBe(false)
    expect(p.reverse_out).toBe(true)
  })

  it('idles and stops generating when the battery is full', () => {
    const p = pins({ ...drive, engine_rps: '12', battery: '0.99' }, { charge_hold: true })
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_gen).toBe(0)
    expect(p.regen).toBe(0)
  })
})
