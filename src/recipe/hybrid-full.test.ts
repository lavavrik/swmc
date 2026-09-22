// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { setLuaTickHook } from '@/library/hooks'
import { LuaRuntime } from '@/lua/runtime'
import { expect as unwrap } from '@/model/result'
import type { CompositeValue, SignalValue } from '@/library/types'
import type { NodeId } from '@/model/types'
import { buildRecipe } from './build'
import { formatFromPath, parseRecipeText } from './parse'
import { runSim } from './run'

let luaFresh = true

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm')
  const runtime = await LuaRuntime.create(wasm)
  setLuaTickHook((req) => {
    if (luaFresh) {
      runtime.setScript('--')
      runtime.setScript(req.script)
      luaFresh = false
    }
    const result = runtime.tick(req.input, req.properties, false)
    return {
      output: { numbers: result.outputs.numbers, bools: result.outputs.bools },
      frame: null,
    }
  })
}, 30_000)

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

function pins(
  inputs: Record<string, string>,
  ticks = 1,
): Record<string, SignalValue | undefined> {
  luaFresh = true
  const result = unwrap(runSim(built.doc, ticks, inputs, built.ids as ReadonlyMap<string, NodeId>))
  const out: Record<string, SignalValue | undefined> = {}
  for (const pin of result.pins) out[pin.id] = pin.value
  return out
}

function composite(value: SignalValue | undefined): CompositeValue {
  if (!value || typeof value !== 'object' || !('numbers' in value)) {
    throw new Error('expected a composite pin')
  }
  return value
}

const drive = {
  ignition: 'on',
  seat: '0.6',
  reverse: 'off',
  engine_rps: '0',
  battery: '0.5',
  speed: '0',
}

describe('hybrid full', () => {
  it('keeps every pin on the 4×6 body', () => {
    expect(built.doc.meta).toMatchObject({ width: 4, length: 6 })
    const cells = new Set<string>()
    for (const id of built.doc.ioOrder) {
      const node = built.doc.nodes.find((n) => n.id === id)
      const x = Number(node?.properties.faceX ?? -1)
      const z = Number(node?.properties.faceZ ?? -1)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(4)
      expect(z).toBeGreaterThanOrEqual(0)
      expect(z).toBeLessThan(6)
      cells.add(`${x},${z}`)
    }
    expect(cells.size).toBe(built.doc.ioOrder.length)
  })

  it('describes gearbox ratios and placement on the pins', () => {
    const pin = (id: string) => {
      const node = built.doc.nodes.find((n) => n.id === built.ids.get(id))
      return String(node?.properties.description ?? '')
    }
    expect(pin('gb1')).toMatch(/arrows toward motors/i)
    expect(pin('gb1')).toMatch(/off 1:1, on 6:5/i)
    expect(pin('gb2')).toMatch(/arrows toward motors/i)
    expect(pin('gb2')).toMatch(/off 1:1, on 3:2/i)
    expect(pin('gb3')).toMatch(/arrows away from motors/i)
    expect(pin('gb3')).toMatch(/off 2:1, on 1:1/i)
  })

  it('leaves the diesel off when the battery is already high', () => {
    const p = pins({ ...drive, seat: '0', battery: '0.9', engine_rps: '0' })
    expect(p.engine).toBe(false)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_clutch).toBe(0)
    expect(p.engine_gen).toBe(0)
    expect(p.motor).toBe(0)
  })

  it('cranks the diesel with the motor, wheels disconnected', () => {
    const p = pins({ ...drive, seat: '0' })
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(0)
    expect(p.engine_gen).toBe(0)
    expect(p.regen).toBe(0)
    expect(p.motor).toBe(0.4)
    expect(p.reverse_out).toBe(false)
  })

  it('packs engine RPS, physics speed, battery and gear onto the instruments composite', () => {
    const p = pins({ ...drive, engine_rps: '12', battery: '0.5', physics: '13=20', speed: '17' }, 80)
    const inst = composite(p.instruments)
    expect(inst.numbers[0]).toBe(12)
    expect(inst.numbers[1]).toBe(20)
    expect(inst.numbers[2]).toBe(0.5)
    expect(inst.numbers[3]).toBe(5)
  })

  it('drops the starter once engine RPS is above Start RPS', () => {
    const p = pins({ ...drive, seat: '0', engine_rps: '3.1' })
    expect(p.engine).toBe(true)
    expect(p.engine_clutch).toBe(0)
    expect(p.motor).toBe(0)
    expect(p.drive_clutch).toBe(0)
  })

  it('charges at rest through Engine Gen, not through the motor', () => {
    const p = pins({ ...drive, seat: '0', engine_rps: '12' }, 30)
    expect(p.engine).toBe(true)
    expect(p.engine_clutch).toBe(0)
    expect(p.drive_clutch).toBe(0)
    expect(p.engine_gen).toBe(1)
    expect(p.motor).toBe(0)
  })

  it('does not roll the wheels on ignition alone', () => {
    const p = pins({ ...drive, seat: '0', engine_rps: '12' }, 30)
    expect(p.engine).toBe(true)
    expect(p.drive_clutch).toBe(0)
    expect(p.engine_clutch).toBe(0)
    expect(p.motor).toBe(0)
  })

  it('keeps driving while the diesel starts after SOC drops', () => {
    const p = pins({ ...drive, engine_rps: '0' }, 30)
    expect(p.engine).toBe(true)
    expect(p.drive_clutch).toBe(1)
    expect(p.motor).toBe(0.6)
    expect(p.engine_clutch).toBeGreaterThan(0)
    expect(p.engine_clutch).toBeLessThan(0.5)
  })

  it('fades the drive clutch in instead of jumping 0 to 1', () => {
    const early = pins({ ...drive, engine_rps: '12' }, 1)
    expect(early.drive_clutch).toBeGreaterThan(0)
    expect(early.drive_clutch).toBeLessThan(0.2)
    const locked = pins({ ...drive, engine_rps: '12' }, 30)
    expect(locked.drive_clutch).toBe(1)
  })

  it('opens the starter clutch below diesel idle so the engine is not dragged down', () => {
    const p = pins({ ...drive, engine_rps: '4' }, 30)
    expect(p.engine).toBe(true)
    expect(p.engine_clutch).toBe(0)
    expect(p.drive_clutch).toBe(1)
  })

  it('couples the diesel to the wheels while driving so it assists the motor', () => {
    const p = pins({ ...drive, engine_rps: '12' }, 30)
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0.7)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBeGreaterThan(0.1)
    expect(p.regen).toBe(0)
    expect(p.motor).toBe(0.6)
  })

  it('does not start a stopped diesel when SOC is already high', () => {
    const p = pins({ ...drive, battery: '0.85', engine_rps: '0' }, 30)
    expect(p.engine).toBe(false)
    expect(p.engine_clutch).toBe(0)
    expect(p.drive_clutch).toBe(1)
    expect(p.motor).toBe(0.6)
  })

  it('keeps a spinning diesel assisting after the battery is charged', () => {
    const p = pins({ ...drive, battery: '0.99', engine_rps: '12' }, 30)
    expect(p.engine).toBe(true)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBe(0)
    expect(p.motor).toBe(0.6)
  })

  it('uses wheel brakes at a standstill and leaves regen off', () => {
    const p = pins({ ...drive, engine_rps: '12', seat: '-0.8' })
    expect(p.motor).toBe(0)
    expect(p.regen).toBe(0)
    expect(p.brakes).toBe(0.8)
    expect(p.drive_clutch).toBe(0)
  })

  it('hands braking to regen once wheel RPS is up', () => {
    const p = pins({ ...drive, engine_rps: '12', seat: '-0.8', speed: '20' })
    expect(p.regen).toBe(0.8)
    expect(p.brakes).toBe(0)
  })

  it('does not regen into a full battery', () => {
    const p = pins({ ...drive, engine_rps: '12', seat: '-0.8', battery: '0.99', speed: '20' })
    expect(p.motor).toBe(0)
    expect(p.regen).toBe(0)
    expect(p.brakes).toBe(0.8)
  })

  it('can regen while the engine generator is also on', () => {
    const p = pins({ ...drive, engine_rps: '12', seat: '-0.8', speed: '20' }, 30)
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
    const p = pins({ ...drive, seat: '0', battery: '0.1' })
    expect(p.motor).toBe(0.4)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(0)
    expect(p.reverse_out).toBe(false)
  })

  it('leaves the engine off in EV while the battery is healthy', () => {
    const p = pins({ ...drive, ev_mode: 'on' }, 30)
    expect(p.engine).toBe(false)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_clutch).toBe(0)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBe(0)
    expect(p.regen).toBe(0)
    expect(p.motor).toBe(0.6)
  })

  it('starts the engine in EV when the battery is low', () => {
    const p = pins({ ...drive, seat: '0', battery: '0.2', ev_mode: 'on' })
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(0)
    expect(p.motor).toBe(0.4)
  })

  it('keeps the diesel clutched on while driving and charging', () => {
    const p = pins({
      ...drive,
      engine_rps: '12',
      battery: '0.5',
      ev_mode: 'on',
      charge_hold: 'on',
    }, 30)
    expect(p.engine).toBe(true)
    expect(p.engine_clutch).toBe(1)
    expect(p.drive_clutch).toBe(1)
    expect(p.engine_gen).toBeGreaterThan(0.1)
    expect(p.motor).toBe(0)
  })

  it('on charge hold still regens but does not drive the motors', () => {
    const p = pins({
      ...drive,
      engine_rps: '12',
      charge_hold: 'on',
      seat: '-0.8',
      speed: '20',
    })
    expect(p.motor).toBe(0)
    expect(p.regen).toBe(0.8)
    expect(p.brakes).toBe(0)
  })


  it('holds first gear at a standstill', () => {
    const p = pins(drive)
    expect(p.gb1).toBe(false)
    expect(p.gb2).toBe(false)
    expect(p.gb3).toBe(false)
  })

  it('shifts three gearboxes as binary gears from wheel RPS', () => {
    const g2 = pins({ ...drive, speed: '5' }, 80)
    expect(g2.gb1).toBe(true)
    expect(g2.gb2).toBe(false)
    expect(g2.gb3).toBe(false)
    const g3 = pins({ ...drive, speed: '9' }, 80)
    expect(g3.gb1).toBe(false)
    expect(g3.gb2).toBe(true)
    expect(g3.gb3).toBe(false)
    const g4 = pins({ ...drive, speed: '13' }, 80)
    expect(g4.gb1).toBe(true)
    expect(g4.gb2).toBe(true)
    expect(g4.gb3).toBe(false)
    const g5 = pins({ ...drive, speed: '17' }, 80)
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
    const p = pins({ ...drive, engine_rps: '0', battery: '0.99', seat: '0' })
    expect(p.engine).toBe(false)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_gen).toBe(0)
    expect(p.regen).toBe(0)
  })
})
