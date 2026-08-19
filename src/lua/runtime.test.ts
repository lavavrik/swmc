// @vitest-environment node
// wasmoon's interpreter loads from disk under Node; jsdom makes it look for a
// URL that does not exist, so this suite opts out of the DOM.
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { LUA_API } from './api'
import { LuaRuntime } from './runtime'
import type { CompositeValue } from '@/library/types'

const composite = (over: { numbers?: number[]; bools?: boolean[] } = {}): CompositeValue => ({
  numbers: over.numbers ?? Array.from({ length: 32 }, () => 0),
  bools: over.bools ?? Array.from({ length: 32 }, () => false),
})

let runtime: LuaRuntime

beforeAll(async () => {
  // Under Node the interpreter is loaded from disk rather than fetched
  const wasm = createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm')
  runtime = await LuaRuntime.create(wasm)
}, 30_000)

const run = (script: string, input = composite(), properties = {}, draw = true) => {
  runtime.setScript(script)
  return runtime.tick(input, properties, draw)
}

describe('the API surface', () => {
  it('provides every documented function', () => {
    for (const namespace of LUA_API) {
      for (const fn of namespace.functions) {
        const result = run(
          `function onTick() output.setNumber(1, type(${fn.name}) == 'function' and 1 or 0) end`,
        )
        expect(result.outputs.numbers[0], fn.name).toBe(1)
      }
    }
  })
})

describe('running a script', () => {
  it('reads inputs and writes outputs', () => {
    const input = composite({ numbers: [3, 4, ...Array.from({ length: 30 }, () => 0)] })
    const result = run(
      `function onTick()
         output.setNumber(1, input.getNumber(1) + input.getNumber(2))
         output.setBool(2, true)
       end`,
      input,
    )
    expect(result.error).toBeNull()
    expect(result.outputs.numbers[0]).toBe(7)
    expect(result.outputs.bools[1]).toBe(true)
  })

  it('reads on/off inputs', () => {
    const bools = Array.from({ length: 32 }, (_, i) => i === 4)
    const result = run(
      'function onTick() output.setBool(1, input.getBool(5)) end',
      composite({ bools }),
    )
    expect(result.outputs.bools[0]).toBe(true)
  })

  it('reads properties by name', () => {
    const result = run(
      `function onTick()
         output.setNumber(1, property.getNumber('gain'))
         output.setBool(1, property.getBool('armed'))
       end`,
      composite(),
      { gain: 2.5, armed: true },
    )
    expect(result.outputs.numbers[0]).toBe(2.5)
    expect(result.outputs.bools[0]).toBe(true)
  })

  it('keeps state between ticks in its own globals', () => {
    runtime.setScript(
      'count = 0\nfunction onTick() count = count + 1 output.setNumber(1, count) end',
    )
    runtime.tick(composite(), {}, false)
    const second = runtime.tick(composite(), {}, false)
    expect(second.outputs.numbers[0]).toBe(2)
  })

  it('starts fresh when the script changes', () => {
    runtime.setScript('function onTick() output.setNumber(1, 1) end')
    runtime.tick(composite(), {}, false)
    const changed = run('function onTick() output.setNumber(2, 5) end', composite(), {}, false)
    expect(changed.outputs.numbers[0]).toBe(0)
    expect(changed.outputs.numbers[1]).toBe(5)
  })

  it('collects drawing commands from onDraw', () => {
    const result = run(
      `function onDraw()
         screen.setColor(255, 0, 0)
         screen.drawRectF(1, 2, 3, 4)
         screen.drawText(0, 0, 'hi')
       end`,
    )
    expect(result.commands).toEqual([
      { op: 'color', r: 255, g: 0, b: 0, a: 255 },
      { op: 'rectF', x: 1, y: 2, w: 3, h: 4 },
      { op: 'text', x: 0, y: 0, text: 'hi' },
    ])
  })

  it('skips drawing when no monitor is attached', () => {
    const result = run('function onDraw() screen.drawClear() end', composite(), {}, false)
    expect(result.commands).toEqual([])
  })

  it('reports the screen size it was given', () => {
    runtime.setScreenSize(96, 64)
    const result = run(
      'function onTick() output.setNumber(1, screen.getWidth()) output.setNumber(2, screen.getHeight()) end',
    )
    expect(result.outputs.numbers.slice(0, 2)).toEqual([96, 64])
    runtime.setScreenSize(32, 32)
  })

  it('converts between map and screen coordinates reversibly', () => {
    const result = run(
      `function onTick()
         local wx, wy = map.screenToMap(1000, 2000, 2, 64, 64, 48, 16)
         local px, py = map.mapToScreen(1000, 2000, 2, 64, 64, wx, wy)
         output.setNumber(1, px) output.setNumber(2, py)
       end`,
    )
    expect(result.outputs.numbers.slice(0, 2)).toEqual([48, 16])
  })

  it('reports a syntax error instead of throwing', () => {
    const result = run('function onTick( end')
    expect(result.error).not.toBeNull()
    expect(result.outputs.numbers[0]).toBe(0)
  })

  it('reports a runtime error and carries on', () => {
    const failing = run('function onTick() error("boom") end')
    expect(failing.error).toContain('boom')
    const recovered = run('function onTick() output.setNumber(1, 1) end')
    expect(recovered.error).toBeNull()
    expect(recovered.outputs.numbers[0]).toBe(1)
  })

  it('stops a script that never finishes', () => {
    const result = run('function onTick() while true do end end')
    expect(result.error).not.toBeNull()
  }, 15_000)

  it('clamps channel numbers into 1..32', () => {
    const result = run('function onTick() output.setNumber(99, 7) end')
    expect(result.outputs.numbers[31]).toBe(7)
  })
})
