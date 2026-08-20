// @vitest-environment node
// The interpreter loads from disk under Node; jsdom sends it looking for a URL.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseMicrocontroller } from '@/io/microcontroller'
import { expect as unwrap } from '@/model/result'
import type { CompositeValue } from '@/library/types'
import { minifyLua } from './minify'
import { LuaRuntime } from './runtime'

/**
 * Minifying must not change what a script does, so this runs a real one — the
 * 4 KB thermostat saved out of the game — both ways over a run of ticks and
 * requires the outputs and the drawing to match exactly.
 */
describe('a minified script behaves identically', () => {
  let wasm: string
  let script: string

  beforeAll(() => {
    wasm = createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm')
    const xml = readFileSync(join(process.cwd(), 'src/io/__fixtures__/thermostat-v3.xml'), 'utf8')
    const doc = unwrap(parseMicrocontroller(xml))
    const node = doc.nodes.find((n) => n.type === 'data.luaScript')
    script = String(node?.properties.script ?? '')
    expect(script.length).toBeGreaterThan(3000)
  })

  /** Inputs that exercise the thermostat: a temperature, and a touch. */
  const inputsFor = (tick: number): CompositeValue => ({
    numbers: [
      96, // screen width
      96, // screen height
      44 + (tick % 3), // touch x, drifting across the buttons
      92,
      0,
      0,
      18 + tick * 0.25, // measured temperature
      21, // set temperature
      ...Array.from({ length: 24 }, () => 0),
    ],
    bools: Array.from({ length: 32 }, (_, i) => (i === 0 ? tick % 4 !== 0 : i === 6 && tick === 5)),
  })

  it('produces the same outputs and the same drawing, tick for tick', async () => {
    const minified = minifyLua(script)
    expect(minified.error).toBeNull()
    expect(minified.renamed).toBeGreaterThan(10)
    expect(minified.after).toBeLessThan(minified.before * 0.75)

    const original = await LuaRuntime.create(wasm)
    const shortened = await LuaRuntime.create(wasm)
    for (const runtime of [original, shortened]) runtime.setScreenSize(96, 96)
    expect(original.setScript(script)).toBeNull()
    expect(shortened.setScript(minified.code)).toBeNull()

    for (let tick = 0; tick < 30; tick++) {
      const inputs = inputsFor(tick)
      const a = original.tick(inputs, { 'Default Temp (c)': 16 }, true)
      const b = shortened.tick(inputs, { 'Default Temp (c)': 16 }, true)
      expect(b.error, `tick ${tick}`).toBe(a.error)
      expect(b.outputs, `tick ${tick}`).toEqual(a.outputs)
      expect(b.commands, `tick ${tick}`).toEqual(a.commands)
    }

    // And it really did get smaller
    expect(minified.after).toBeLessThan(2500)
  }, 60_000)
})
