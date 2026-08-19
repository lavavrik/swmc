/**
 * A Lua interpreter running one script component.
 *
 * Execution is synchronous and on the main thread so a tick is exact: the
 * script sees this tick's inputs and its outputs are used in the same tick,
 * with no worker round-trip to lag it. A runaway script is stopped by the
 * interpreter's own instruction hook rather than by hanging the page.
 *
 * The boundary is deliberately narrow: inputs are pulled through host
 * functions, and outputs are collected in Lua tables that are read once per
 * tick.
 */
import { LuaFactory, type LuaEngine } from 'wasmoon'
import type { CompositeValue } from '@/library/types'
import type { PropertyValue } from '@/model/types'
import { PRELUDE } from './prelude'
import type { DrawCommand } from './screen'

/** How long a single tick of script may run before it is aborted. */
export const TICK_BUDGET_MS = 20

export interface LuaOutputs {
  readonly numbers: readonly number[]
  readonly bools: readonly boolean[]
}

export interface LuaTickResult {
  readonly outputs: LuaOutputs
  readonly commands: readonly DrawCommand[]
  readonly error: string | null
}

const EMPTY_OUTPUTS: LuaOutputs = {
  numbers: Array.from({ length: 32 }, () => 0),
  bools: Array.from({ length: 32 }, () => false),
}

/**
 * Reads index `n` (1-based, as Lua counts) out of a value the interpreter
 * returned. A gap-free Lua table arrives as a JavaScript array; a sparse one
 * arrives as an object keyed by its indices.
 */
function luaIndex<T>(table: unknown, n: number): T | undefined {
  if (Array.isArray(table)) return table[n - 1] as T | undefined
  return (table as Record<string, T> | null)?.[String(n)]
}

function fromLuaArray<T>(table: unknown, length: number, fallback: T): T[] {
  return Array.from({ length }, (_, i) => luaIndex<T>(table, i + 1) ?? fallback)
}

/** A Lua list, in order, however the interpreter chose to represent it. */
function fromLuaList<T>(table: unknown): T[] {
  if (Array.isArray(table)) return table as T[]
  const source = (table ?? {}) as Record<string, T>
  return Object.keys(source)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .map((k) => source[String(k)] as T)
}

let factory: LuaFactory | null = null

export class LuaRuntime {
  private engine: LuaEngine
  private source = ''
  private loadError: string | null = null

  private input: CompositeValue = { numbers: [], bools: [] }
  private properties: Readonly<Record<string, PropertyValue>> = {}
  private screen = { width: 32, height: 32 }

  private constructor(engine: LuaEngine) {
    this.engine = engine
    this.engine.global.set('__host', {
      inputNumber: (i: number) => this.input.numbers[i - 1] ?? 0,
      inputBool: (i: number) => this.input.bools[i - 1] === true,
      propertyNumber: (label: string) => {
        const value = this.properties[label]
        return typeof value === 'number' ? value : 0
      },
      propertyBool: (label: string) => this.properties[label] === true,
      propertyText: (label: string) => {
        const value = this.properties[label]
        return typeof value === 'string' ? value : ''
      },
      screenWidth: () => this.screen.width,
      screenHeight: () => this.screen.height,
    })
    this.engine.doStringSync(PRELUDE)
  }

  /**
   * @param wasmUri where to load the interpreter from. The browser finds it on
   * its own; tests running under Node pass the file's path.
   */
  static async create(wasmUri?: string): Promise<LuaRuntime> {
    factory ??= new LuaFactory(wasmUri)
    const engine = await factory.createEngine({ injectObjects: true })
    return new LuaRuntime(engine)
  }

  /** Loads a script. Returns an error message if it does not compile. */
  setScript(source: string): string | null {
    if (source === this.source) return this.loadError
    this.source = source
    this.loadError = null
    try {
      // Start from a clean prelude so removed callbacks really disappear
      this.engine.doStringSync(PRELUDE)
      this.engine.doStringSync('onTick, onDraw, httpReply = nil, nil, nil')
      this.engine.doStringSync(source)
    } catch (error) {
      this.loadError = messageOf(error)
    }
    return this.loadError
  }

  setScreenSize(width: number, height: number): void {
    this.screen = { width, height }
  }

  /** Runs one tick: onTick, then onDraw if a monitor is attached. */
  tick(
    input: CompositeValue,
    properties: Readonly<Record<string, PropertyValue>>,
    draw: boolean,
  ): LuaTickResult {
    if (this.loadError !== null) {
      return { outputs: EMPTY_OUTPUTS, commands: [], error: this.loadError }
    }

    this.input = input
    this.properties = properties

    const global = this.engine.global
    global.setTimeout(Date.now() + TICK_BUDGET_MS)

    let error: string | null = null
    try {
      this.engine.doStringSync('__reset()')
      this.engine.doStringSync('if onTick then onTick() end')
      if (draw) this.engine.doStringSync('if onDraw then onDraw() end')
    } catch (cause) {
      error = messageOf(cause)
    } finally {
      global.setTimeout(0)
    }

    return {
      error,
      outputs: {
        numbers: fromLuaArray(global.get('__out_n'), 32, 0),
        bools: fromLuaArray(global.get('__out_b'), 32, false),
      },
      commands: draw ? fromLuaList<DrawCommand>(global.get('__cmds')) : [],
    }
  }

  close(): void {
    this.engine.global.close()
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
