// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { setLuaTickHook } from '@/library/hooks'
import { LuaRuntime } from '@/lua/runtime'
import { expect as unwrap } from '@/model/result'
import { Simulation } from '@/sim/engine'
import type { NodeId, PropertyValue, SignalType } from '@/model/types'
import { buildRecipe } from './build'
import { formatFromPath, parseRecipeText } from './parse'
import { parseSignalValue, pinAliases, runSim } from './run'

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

const built = unwrap(
  buildRecipe(
    unwrap(
      parseRecipeText(
        readFileSync(join(process.cwd(), 'recipes/diesel.yaml'), 'utf8'),
        formatFromPath('diesel.yaml'),
      ),
    ),
  ),
)

function collect(sim: Simulation): Record<string, PropertyValue | undefined> {
  const out: Record<string, PropertyValue | undefined> = {}
  for (const [name, id] of built.ids) {
    const node = built.doc.nodes.find((n) => n.id === id)
    if (!node?.type.startsWith('io.')) continue
    const direction = node.type.split('.')[1]
    out[name] = (
      direction === 'in'
        ? sim.outputValue({ node: id, kind: 'out', index: 0 })
        : sim.getOutput(id)
    ) as PropertyValue | undefined
  }
  return out
}

function pins(
  inputs: Record<string, string>,
  ticks = 1,
): Record<string, PropertyValue | undefined> {
  luaFresh = true
  const result = unwrap(runSim(built.doc, ticks, inputs, built.ids as ReadonlyMap<string, NodeId>))
  const out: Record<string, PropertyValue | undefined> = {}
  for (const pin of result.pins) out[pin.id] = pin.value as PropertyValue | undefined
  return out
}

function runPhases(
  phases: readonly { inputs: Record<string, string>; ticks: number }[],
): Record<string, PropertyValue | undefined> {
  luaFresh = true
  const aliases = pinAliases(built.doc, built.ids as ReadonlyMap<string, NodeId>)
  const sim = new Simulation(built.doc)
  for (const phase of phases) {
    for (const [key, raw] of Object.entries(phase.inputs)) {
      const id = aliases.get(key) ?? aliases.get(key.toLowerCase())
      if (!id) throw new Error(`no pin ${key}`)
      const node = built.doc.nodes.find((n) => n.id === id)
      if (!node) throw new Error(`no pin ${key}`)
      const signal = node.type.split('.')[2] as SignalType
      sim.setInput(id, unwrap(parseSignalValue(signal, raw)))
    }
    sim.run(phase.ticks)
  }
  return collect(sim)
}

const idle = {
  ignition: 'on',
  seat: '0',
  reverse: 'off',
  engine_rps: '8',
  battery: '0.8',
}

describe('diesel', () => {
  it('keeps existing pin cells and appends starter + motor', () => {
    expect(built.doc.meta).toMatchObject({ width: 4, length: 6 })
    const face = (id: string) => {
      const node = built.doc.nodes.find((n) => n.id === built.ids.get(id))
      return {
        x: Number(node?.properties.faceX ?? -1),
        z: Number(node?.properties.faceZ ?? -1),
      }
    }
    expect(face('ignition')).toEqual({ x: 0, z: 0 })
    expect(face('seat')).toEqual({ x: 0, z: 1 })
    expect(face('reverse')).toEqual({ x: 0, z: 2 })
    expect(face('engine_rps')).toEqual({ x: 0, z: 3 })
    expect(face('engine')).toEqual({ x: 3, z: 0 })
    expect(face('engine_throttle')).toEqual({ x: 3, z: 1 })
    expect(face('clutch')).toEqual({ x: 3, z: 2 })
    expect(face('brakes')).toEqual({ x: 3, z: 3 })
    expect(face('reverse_out')).toEqual({ x: 3, z: 4 })
    expect(face('gb1')).toEqual({ x: 1, z: 0 })
    expect(face('gb2')).toEqual({ x: 1, z: 1 })
    expect(face('gb3')).toEqual({ x: 1, z: 2 })
    expect(face('hud')).toEqual({ x: 1, z: 3 })
    expect(face('instruments')).toEqual({ x: 1, z: 4 })
    expect(face('starter_clutch')).toEqual({ x: 3, z: 5 })
    expect(face('motor')).toEqual({ x: 1, z: 5 })
    expect(face('engine_clutch')).toEqual({ x: 0, z: 4 })
    expect(face('battery')).toEqual({ x: 0, z: 5 })
    expect(face('physics')).toEqual({ x: 2, z: 0 })
    expect(face('regen_clutch')).toEqual({ x: 2, z: 1 })
    expect(face('shaft_rps')).toEqual({ x: 2, z: 2 })
    expect(face('fuel')).toEqual({ x: 2, z: 3 })
    expect(face('touch')).toEqual({ x: 2, z: 4 })
  })

  it('runs the ECU with ignition and pedal throttle', () => {
    const p = pins({ ...idle, seat: '0.6', engine_rps: '10' }, 250)
    expect(p.engine).toBe(true)
    expect(p.engine_throttle).toBe(0)
    expect(p.engine_clutch).toBe(0)
    expect(p.clutch).toBe(1)
    expect(p.starter_clutch).toBe(1)
    expect(p.motor).toBe(0.6)
    expect(p.regen_clutch).toBe(0)
  })

  it('cranks with the motor, wheels disconnected', () => {
    const p = pins({ ignition: 'on', seat: '0.6', reverse: 'off', engine_rps: '0' }, 30)
    expect(p.engine).toBe(true)
    expect(p.engine_clutch).toBe(1)
    expect(p.motor).toBe(0.4)
    expect(p.starter_clutch).toBe(1)
    expect(p.clutch).toBe(0)
  })

  it('parks the starter motor once Start RPS is reached', () => {
    const p = pins({ ...idle, seat: '0', engine_rps: '3.1' })
    expect(p.motor).toBe(0)
    expect(p.starter_clutch).toBe(0)
    expect(p.engine_clutch).toBe(0)
    expect(p.clutch).toBe(0)
  })

  it('eases the clutch in from a standstill', () => {
    const early = pins({ ...idle, seat: '0.6', engine_rps: '8' }, 8)
    expect(early.clutch).toBeGreaterThan(0)
    expect(early.clutch).toBeLessThan(0.2)
    const locked = pins({ ...idle, seat: '0.6', engine_rps: '8' }, 250)
    expect(locked.clutch).toBe(1)
  })

  it('keeps the clutch open below idle so the diesel is not dragged', () => {
    const p = pins({ ...idle, seat: '0.6', engine_rps: '4' }, 30)
    expect(p.engine).toBe(true)
    expect(p.clutch).toBe(0)
  })

  it('does not lock the clutch with no throttle', () => {
    const p = pins(idle, 30)
    expect(p.clutch).toBe(0)
    expect(p.engine_throttle).toBe(0)
  })

  it('shifts up on engine RPS, not wheel speed', () => {
    const g1 = pins({ ...idle, engine_rps: '8' }, 40)
    expect(g1.gb1).toBe(false)
    expect(g1.gb2).toBe(false)
    expect(g1.gb3).toBe(false)
    // Launch, dip, one upshift (pinned RPS would keep shifting).
    const g2 = pins({ ...idle, seat: '0.6', engine_rps: '8', shaft_rps: '13' }, 95)
    expect(g2.gb1).toBe(true)
    expect(g2.gb2).toBe(false)
    expect(g2.gb3).toBe(false)
  })

  it('does not shift on ECU RPS while the diesel is off the T', () => {
    const p = pins({ ...idle, seat: '0.6', engine_rps: '13', shaft_rps: '0' }, 95)
    expect(p.gb1).toBe(false)
    expect(p.engine_clutch).toBe(0)
  })

  it('cuts throttle while the clutch dips for a shift', () => {
    const p = pins({ ...idle, seat: '0.6', engine_rps: '8', shaft_rps: '13' }, 85)
    expect(p.engine_throttle).toBe(0)
    expect(p.motor).toBe(0.6)
    expect(p.clutch).toBeLessThan(0.85)
    expect(p.clutch).toBeGreaterThan(0)
  })

  it('assists with the motor up to Hybrid gears', () => {
    const low = pins({ ...idle, seat: '0.6', engine_rps: '10' }, 80)
    expect(low.gb3).toBe(false)
    expect(low.motor).toBe(0.6)
    expect(low.starter_clutch).toBe(1)
    const high = pins({ ...idle, seat: '0.6', engine_rps: '13', shaft_rps: '13' }, 280)
    expect(high.gb3).toBe(true)
    expect(high.motor).toBe(0)
    expect(high.starter_clutch).toBe(0)
    expect(high.engine_clutch).toBe(1)
  })

  it('does not throttle the diesel below Diesel from gear', () => {
    const g1 = pins({ ...idle, seat: '0.6', engine_rps: '8', shaft_rps: '8' }, 80)
    expect(g1.gb1).toBe(false)
    expect(g1.engine_throttle).toBe(0)
    expect(g1.engine_clutch).toBe(0)
    expect(g1.motor).toBe(0.6)
    const g2 = pins({ ...idle, seat: '0.6', engine_rps: '8', shaft_rps: '13' }, 95)
    expect(g2.gb1).toBe(true)
    expect(g2.engine_clutch).toBe(0)
    expect(g2.engine_throttle).toBe(0)
  })

  it('keeps downshifting as engine RPS stays below the limit', () => {
    const p = runPhases([
      { inputs: { ...idle, seat: '0.6', engine_rps: '13', shaft_rps: '13' }, ticks: 320 },
      { inputs: { ...idle, seat: '0', engine_rps: '6', shaft_rps: '6' }, ticks: 200 },
    ])
    expect(p.gb1).toBe(false)
    expect(p.gb2).toBe(false)
    expect(p.gb3).toBe(false)
  })

  it('does not drop alive (or crank) when idle RPS hunts below 5', () => {
    const p = runPhases([
      { inputs: { ...idle, seat: '0', engine_rps: '8' }, ticks: 5 },
      { inputs: { ...idle, seat: '0', engine_rps: '4.2' }, ticks: 20 },
    ])
    expect(p.motor).toBe(0)
    expect(p.starter_clutch).toBe(0)
    expect(p.clutch).toBe(0)
    expect(p.engine).toBe(true)
  })

  it('holds 1st in reverse and sets Reverse Box', () => {
    const p = pins({ ...idle, reverse: 'on', engine_rps: '13' }, 80)
    expect(p.gb1).toBe(false)
    expect(p.gb2).toBe(false)
    expect(p.gb3).toBe(false)
    expect(p.reverse_out).toBe(true)
  })

  it('locks regen on lift-off or brake, slips on the pedal', () => {
    const ev = pins({ ...idle, seat: '0.6', engine_rps: '10' }, 30)
    expect(ev.regen_clutch).toBe(0)
    const drive = pins({ ...idle, seat: '0.6', engine_rps: '13', shaft_rps: '13' }, 280)
    expect(drive.engine_clutch).toBe(1)
    expect(drive.regen_clutch).toBe(0.4)
    const coast = runPhases([
      { inputs: { ...idle, seat: '0.6', engine_rps: '13', shaft_rps: '13' }, ticks: 280 },
      { inputs: { ...idle, seat: '0', engine_rps: '13', shaft_rps: '13' }, ticks: 5 },
    ])
    expect(coast.motor).toBe(0)
    expect(coast.starter_clutch).toBe(0)
    expect(coast.regen_clutch).toBe(1)
  })

  it('drops the motor as soon as the pedal starts falling', () => {
    const p = runPhases([
      { inputs: { ...idle, seat: '0.6', engine_rps: '8', shaft_rps: '10' }, ticks: 40 },
      { inputs: { ...idle, seat: '0.57', engine_rps: '8', shaft_rps: '10' }, ticks: 2 },
    ])
    expect(p.motor).toBe(0)
    expect(p.starter_clutch).toBe(0)
    expect(p.regen_clutch).toBe(1)
    expect(p.clutch).toBeGreaterThan(0.5)
  })

  it('brings diesel in from 1st below 50% battery until 75%', () => {
    const low = pins({ ...idle, seat: '0.6', engine_rps: '8', battery: '0.4' }, 40)
    expect(low.engine_clutch).toBe(1)
    expect(low.engine_throttle).toBe(0.6)
    const hold = runPhases([
      { inputs: { ...idle, seat: '0.6', engine_rps: '8', battery: '0.4' }, ticks: 20 },
      { inputs: { ...idle, seat: '0.6', engine_rps: '8', battery: '0.6' }, ticks: 10 },
    ])
    expect(hold.engine_clutch).toBe(1)
    const recovered = runPhases([
      { inputs: { ...idle, seat: '0.6', engine_rps: '8', battery: '0.4' }, ticks: 10 },
      { inputs: { ...idle, seat: '0.6', engine_rps: '8', battery: '0.8' }, ticks: 10 },
    ])
    expect(recovered.engine_clutch).toBe(0)
    expect(recovered.engine_throttle).toBe(0)
  })

  it('sets cruise from a tap on the speed bar', () => {
    luaFresh = true
    const aliases = pinAliases(built.doc, built.ids as ReadonlyMap<string, NodeId>)
    const sim = new Simulation(built.doc)
    const apply = (inputs: Record<string, string>) => {
      for (const [key, raw] of Object.entries(inputs)) {
        const id = aliases.get(key) ?? aliases.get(key.toLowerCase())
        if (!id) throw new Error(`no pin ${key}`)
        const node = built.doc.nodes.find((n) => n.id === id)
        if (!node) throw new Error(`no pin ${key}`)
        const signal = node.type.split('.')[2] as SignalType
        sim.setInput(id, unwrap(parseSignalValue(signal, raw)))
      }
    }
    apply({ ...idle, seat: '0.6', engine_rps: '8', shaft_rps: '10', physics: '13=20' })
    sim.run(40)
    const touchId = aliases.get('touch')
    if (!touchId) throw new Error('no touch pin')
    const numbers = Array.from({ length: 32 }, () => 0)
    const bools = Array.from({ length: 32 }, () => false)
    numbers[0] = 96
    numbers[1] = 32
    numbers[2] = 20
    numbers[3] = 8
    bools[0] = true
    sim.setInput(touchId, { numbers, bools })
    sim.run(1)
    bools[0] = false
    sim.setInput(touchId, { numbers: [...numbers], bools: [...bools] })
    apply({ ...idle, seat: '0', engine_rps: '8', shaft_rps: '10', physics: '13=20' })
    sim.run(10)
    const p = collect(sim)
    expect(p.motor).toBeGreaterThan(0)
    expect(p.starter_clutch).toBe(1)
    expect(p.regen_clutch).toBe(0)
  })

  it('opens the drive clutch in forced neutral', () => {
    luaFresh = true
    const aliases = pinAliases(built.doc, built.ids as ReadonlyMap<string, NodeId>)
    const sim = new Simulation(built.doc)
    const apply = (inputs: Record<string, string>) => {
      for (const [key, raw] of Object.entries(inputs)) {
        const id = aliases.get(key) ?? aliases.get(key.toLowerCase())
        if (!id) throw new Error(`no pin ${key}`)
        const node = built.doc.nodes.find((n) => n.id === id)
        if (!node) throw new Error(`no pin ${key}`)
        const signal = node.type.split('.')[2] as SignalType
        sim.setInput(id, unwrap(parseSignalValue(signal, raw)))
      }
    }
    apply({ ...idle, seat: '0.6', engine_rps: '8', shaft_rps: '10' })
    sim.run(40)
    const touchId = aliases.get('touch')
    if (!touchId) throw new Error('no touch pin')
    const numbers = Array.from({ length: 32 }, () => 0)
    const bools = Array.from({ length: 32 }, () => false)
    numbers[0] = 96
    numbers[1] = 32
    numbers[2] = 76
    numbers[3] = 8
    bools[0] = true
    sim.setInput(touchId, { numbers, bools })
    sim.run(20)
    const p = collect(sim)
    expect(p.clutch).toBe(0)
    expect(p.motor).toBe(0)
    expect(p.engine_throttle).toBe(0.6)
    expect(p.engine_clutch).toBe(1)
    expect(p.regen_clutch).toBe(1)
  })

  it('opens regen when the battery is full', () => {
    const p = runPhases([
      { inputs: { ...idle, seat: '0.6', engine_rps: '13', shaft_rps: '13' }, ticks: 280 },
      { inputs: { ...idle, seat: '0.57', engine_rps: '13', shaft_rps: '13', battery: '1' }, ticks: 3 },
    ])
    expect(p.regen_clutch).toBe(0)
  })

  it('sends brake from seat S', () => {
    const p = pins({ ...idle, seat: '-0.7' })
    expect(p.brakes).toBe(0.7)
    expect(p.engine_throttle).toBe(0)
  })
})
