// @vitest-environment node
// wasmoon's interpreter loads from disk under Node; jsdom makes it look for a
// URL that does not exist, so this suite opts out of the DOM.
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { runLuaTick, setLuaTickHook } from '@/library/hooks'
import type { CompositeValue } from '@/library/types'
import { LuaRuntime } from './runtime'
import { setMonitorTouch } from './runner'

const empty = (): CompositeValue => ({
  numbers: Array.from({ length: 32 }, () => 0),
  bools: Array.from({ length: 32 }, () => false),
})

/**
 * The runner creates its own interpreters, which need a browser to fetch their
 * WebAssembly, so these tests drive a runtime directly through the same shape
 * the runner uses.
 */
let runtime: LuaRuntime

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm')
  runtime = await LuaRuntime.create(wasm)
}, 30_000)

describe('the touchscreen a monitor simulates', () => {
  it('reports size, position and press on the channels the game uses', () => {
    // Numbers 1 and 2 are the screen size, 3 and 4 the touch position, and
    // on/off 1 says whether it is being touched
    setMonitorTouch('c1', { width: 96, height: 64, x: 12, y: 34, pressed: true })
    const input = empty()

    runtime.setScript(`function onTick()
      output.setNumber(1, input.getNumber(1))
      output.setNumber(2, input.getNumber(2))
      output.setNumber(3, input.getNumber(3))
      output.setNumber(4, input.getNumber(4))
      output.setBool(1, input.getBool(1))
    end`)

    // What the runner would hand the interpreter
    const withTouch = {
      numbers: [96, 64, 12, 34, ...input.numbers.slice(4)],
      bools: [true, ...input.bools.slice(1)],
    }
    const result = runtime.tick(withTouch, {}, false)
    expect(result.outputs.numbers.slice(0, 4)).toEqual([96, 64, 12, 34])
    expect(result.outputs.bools[0]).toBe(true)
    setMonitorTouch('c1', null)
  })
})

describe('the hook the library calls', () => {
  it('passes signals through when no interpreter is installed', () => {
    setLuaTickHook(null)
    expect(runLuaTick({ nodeId: 'c1', script: '', input: empty(), properties: {} })).toBeNull()
  })
})
