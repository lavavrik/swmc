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

/** The Lua script saved in a fixture microcontroller. */
function scriptOf(fixture: string): string {
  const xml = readFileSync(join(process.cwd(), 'src/io/__fixtures__', fixture), 'utf8')
  const doc = unwrap(parseMicrocontroller(xml))
  const node = doc.nodes.find((n) => n.type === 'data.luaScript')
  return String(node?.properties.script ?? '')
}

/**
 * Minifying must not change what a script does, so this runs a real one — a
 * touchscreen setpoint panel with closures, tables and an `onDraw` — both ways
 * over a run of ticks and requires the outputs and the drawing to match exactly.
 */
describe('a minified script behaves identically', () => {
  let wasm: string
  let script: string

  beforeAll(() => {
    wasm = createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm')
    script = readFileSync(join(process.cwd(), 'src/lua/__fixtures__/setpoint-panel.lua'), 'utf8')
    expect(script.length).toBeGreaterThan(3000)
  })

  /** Inputs that exercise the panel: a measurement, and touches on its buttons. */
  const inputsFor = (tick: number): CompositeValue => ({
    numbers: [
      96, // screen width
      96, // screen height
      4 + (tick % 3) * 11, // touch x, moving across the three buttons
      5,
      0,
      0,
      18 + tick * 0.25, // measured value
      0,
      ...Array.from({ length: 24 }, () => 0),
    ],
    bools: Array.from({ length: 32 }, (_, i) => i === 0 && tick % 4 !== 0),
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
      const a = original.tick(inputs, { 'Default Target': 16 }, true)
      const b = shortened.tick(inputs, { 'Default Target': 16 }, true)
      expect(a.error, `tick ${tick}`).toBeNull()
      expect(b.error, `tick ${tick}`).toBe(a.error)
      expect(b.outputs, `tick ${tick}`).toEqual(a.outputs)
      expect(b.commands, `tick ${tick}`).toEqual(a.commands)
    }

    // And it really did get smaller
    expect(minified.after).toBeLessThan(2500)
  }, 60_000)
})

/**
 * The oil rig controller keeps its sequence as a table of steps, each with
 * functions that set several outputs separated by `;`. Inside those functions
 * the minifier once took `; name =` for a table key and left the name alone,
 * so a step wrote a global instead of its output. This drives the sequence
 * with a small plant — the crane moves where it is told, the clamps follow
 * their outputs — and requires both versions to agree throughout.
 */
describe('a minified step-table sequencer behaves identically', () => {
  let wasm: string
  let script: string

  beforeAll(() => {
    wasm = createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm')
    script = scriptOf('oil-rig-controller.xml')
    expect(script).toMatch(/function\(\)[^}]*;/)
  })

  it('produces the same outputs and the same drawing, tick for tick', async () => {
    const minified = minifyLua(script)
    expect(minified.error).toBeNull()

    const original = await LuaRuntime.create(wasm)
    const shortened = await LuaRuntime.create(wasm)
    for (const runtime of [original, shortened]) runtime.setScreenSize(96, 64)
    expect(original.setScript(script)).toBeNull()
    expect(shortened.setScript(minified.code)).toBeNull()

    // Track position and grab extension, moved by the direction outputs 6–9
    let track = 0
    let grab = 0
    let outputs = { numbers: [] as readonly number[], bools: [] as readonly boolean[] }
    const seen = new Set<number>()

    for (let tick = 0; tick < 1500; tick++) {
      const out = (channel: number) => outputs.bools[channel - 1] === true
      if (out(6) !== out(7)) track += out(6) ? 0.01 : -0.01
      if (out(8) !== out(9)) grab += out(8) ? 0.01 : -0.01
      const inputs: CompositeValue = {
        numbers: [track, grab, ...Array.from({ length: 30 }, () => 0)],
        bools: Array.from({ length: 32 }, (_, i) => {
          if (i === 0) return tick === 2 // start
          if (i === 1) return out(3) // the drill clamp closes when told
          if (i === 2) return out(4) // so does the grab
          if (i === 3) return tick % 200 > 150 // aligned now and then
          return false
        }),
      }
      const a = original.tick(inputs, {}, true)
      const b = shortened.tick(inputs, {}, true)
      expect(b.error, `tick ${tick}`).toBe(a.error)
      expect(b.outputs, `tick ${tick}`).toEqual(a.outputs)
      expect(b.commands, `tick ${tick}`).toEqual(a.commands)
      outputs = a.outputs
      seen.add(a.outputs.numbers[1] ?? 0)
    }

    // The steps that set several outputs with `;` really ran
    expect(seen.has(0.5)).toBe(true)
  }, 60_000)
})
