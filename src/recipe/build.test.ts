import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMicrocontroller, serializeMicrocontroller } from '@/io/microcontroller'
import { expect as unwrap } from '@/model/result'
import { buildRecipe } from './build'
import { componentCatalog } from './catalog'
import { formatFromPath, parseRecipeText, recipeFromUnknown } from './parse'
import { resolvePortIndex, slugPort } from './ports'
import { COL_STRIDE } from './layout'
import { runSim } from './run'
import { getComponent } from '@/library/registry'
import { defaultProperties } from '@/library/defaults'

const recipeFile = (name: string) => readFileSync(join(process.cwd(), 'recipes', name), 'utf8')

const load = (name: string) => {
  const parsed = unwrap(parseRecipeText(recipeFile(name), formatFromPath(name)))
  return unwrap(buildRecipe(parsed))
}

describe('slugPort', () => {
  it('turns game labels into wire names', () => {
    expect(slugPort('Process variable')).toBe('process-variable')
    expect(slugPort('Value (on)')).toBe('value-on')
    expect(slugPort('A < B')).toBe('a-b')
  })
})

describe('resolvePortIndex', () => {
  const pid = getComponent('arithmetic.pid')!
  const props = defaultProperties(pid)

  it('uses the only port when the name is omitted', () => {
    expect(unwrap(resolvePortIndex(pid, props, 'out', undefined, 'pid'))).toBe(0)
  })

  it('matches a slug and a unique prefix', () => {
    expect(unwrap(resolvePortIndex(pid, props, 'in', 'setpoint', 'pid'))).toBe(0)
    expect(unwrap(resolvePortIndex(pid, props, 'in', 'process', 'pid'))).toBe(1)
    expect(unwrap(resolvePortIndex(pid, props, 'in', 'in.2', 'pid'))).toBe(2)
  })

  it('refuses an ambiguous name', () => {
    const sw = getComponent('arithmetic.numericalSwitchbox')!
    const result = resolvePortIndex(sw, defaultProperties(sw), 'in', 'value', 'sw')
    expect(result.ok).toBe(false)
  })
})

describe('parse', () => {
  it('lifts extra node keys into properties', () => {
    const recipe = unwrap(
      recipeFromUnknown({
        name: 'Clamp',
        pins: [],
        nodes: [{ id: 'clamp', type: 'arithmetic.clamp', min: 0, max: 0.75 }],
        wires: [],
      }),
    )
    expect(recipe.nodes[0]?.properties).toEqual({ min: 0, max: 0.75 })
  })

  it('rejects an unknown property with the keys that exist', () => {
    const result = recipeFromUnknown({
      name: 'Bad',
      nodes: [{ id: 'pid', type: 'arithmetic.pid', kpp: 1 }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/kpp/)
    expect(result.error).toMatch(/kp, ki, kd/)
  })

  it('rejects a duplicate id', () => {
    const result = recipeFromUnknown({
      name: 'Dup',
      pins: [{ id: 'a', dir: 'in', signal: 'number' }],
      nodes: [{ id: 'a', type: 'const.number' }],
    })
    expect(result.ok).toBe(false)
  })
})

describe('catalog', () => {
  it('lists pid ports by slug', () => {
    const pid = componentCatalog().find((c) => c.id === 'arithmetic.pid')
    expect(pid?.inputs.map((p) => p.slug)).toEqual(['setpoint', 'process-variable', 'active'])
    expect(pid?.properties.map((p) => p.key)).toEqual(['kp', 'ki', 'kd'])
  })

  it('hides deprecated components unless asked', () => {
    const ids = componentCatalog().map((c) => c.id)
    expect(ids).not.toContain('unknown.component')
    expect(ids).not.toContain('composite.writeOnoffLegacy')
    expect(componentCatalog({ all: true }).some((c) => c.deprecated)).toBe(true)
  })
})

describe('throttle limiter', () => {
  it('clamps then doubles', () => {
    const built = load('throttle-limiter.yaml')
    const high = unwrap(runSim(built.doc, 1, { throttle_in: '1' }, built.ids))
    expect(high.pins.find((p) => p.id === 'throttle_out')?.value).toBe(1.5)
    const mid = unwrap(runSim(built.doc, 1, { throttle_in: '0.5' }, built.ids))
    expect(mid.pins.find((p) => p.id === 'throttle_out')?.value).toBe(1)
    const low = unwrap(runSim(built.doc, 1, { throttle_in: '-1' }, built.ids))
    expect(low.pins.find((p) => p.id === 'throttle_out')?.value).toBe(0)
  })

  it('lays out left to right', () => {
    const { doc, ids } = load('throttle-limiter.yaml')
    const x = (name: string) => doc.nodes.find((n) => n.id === ids.get(name))?.position.x ?? 0
    expect(x('throttle_in')).toBeLessThan(x('clamp'))
    expect(x('clamp')).toBeLessThan(x('scale'))
    expect(x('scale')).toBeLessThan(x('throttle_out'))
    expect(x('clamp') - x('throttle_in')).toBe(COL_STRIDE)
  })

  it('round-trips through XML', () => {
    const { doc } = load('throttle-limiter.yaml')
    const xml = serializeMicrocontroller(doc)
    const again = unwrap(parseMicrocontroller(xml))
    expect(again.meta.name).toBe('Throttle Limiter')
    expect(again.nodes.some((n) => n.type === 'arithmetic.clamp')).toBe(true)
  })
})

describe('hybrid car', () => {
  const built = load('hybrid-car.yaml')
  const pin = (inputs: Record<string, string>, id: string) =>
    unwrap(runSim(built.doc, 1, inputs, built.ids)).pins.find((p) => p.id === id)?.value

  const cranking = {
    ignition: 'on',
    throttle: '0.7',
    engine_rps: '0',
    battery: '0.5',
  }

  it('cranks when ignition is on and RPS is below idle', () => {
    expect(pin(cranking, 'starter')).toBe(true)
    expect(pin(cranking, 'generator')).toBe(0)
    expect(pin(cranking, 'motor')).toBe(0.7)
    expect(pin(cranking, 'engine_throttle')).toBe(1)
  })

  it('stops the starter and generates once the engine is up', () => {
    const running = { ...cranking, engine_rps: '12' }
    expect(pin(running, 'starter')).toBe(false)
    expect(pin(running, 'generator')).toBe(1)
    expect(pin(running, 'engine_throttle')).toBe(0)
  })

  it('cuts the motors when the battery is empty', () => {
    expect(pin({ ...cranking, battery: '0.1' }, 'motor')).toBe(0)
  })

  it('shuts down with ignition off', () => {
    const off = { ...cranking, ignition: 'off' }
    expect(pin(off, 'starter')).toBe(false)
    expect(pin(off, 'engine_throttle')).toBe(0)
    expect(pin(off, 'motor')).toBe(0)
    expect(pin(off, 'generator')).toBe(0)
  })
})
