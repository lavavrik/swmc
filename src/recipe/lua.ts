/**
 * Lua for the command line and the MCP server.
 *
 * The browser starts one interpreter per script lazily (`src/lua/runner.ts`).
 * Here there is no frame loop to wait on, so every script's interpreter is
 * started before the first tick, and the hook is installed only for the
 * synchronous run that follows.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setLuaTickHook } from '@/library/hooks'
import { LuaRuntime } from '@/lua/runtime'
import type { Microcontroller, NodeId } from '@/model/types'

/** Base64 of glue.wasm, defined by scripts/build-mcp.mjs in the one-file bundle. */
declare const __SWMC_GLUE_WASM__: string | undefined

/**
 * `wasmoon/dist/glue.wasm` from node_modules or, in the bundled
 * `swmc-mcp.mjs` (which has no node_modules), the copy it carries, written
 * once to the temp directory because wasmoon loads it from a path.
 */
function wasmPath(): string | undefined {
  if (typeof __SWMC_GLUE_WASM__ === 'string') {
    const bytes = Buffer.from(__SWMC_GLUE_WASM__, 'base64')
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
    const dir = join(tmpdir(), 'swmc-mcp')
    const path = join(dir, `glue-${hash}.wasm`)
    if (!existsSync(path)) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(`${path}.${process.pid}`, bytes)
      renameSync(`${path}.${process.pid}`, path)
    }
    return path
  }
  return createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm')
}

export interface LuaRun<T> {
  readonly result: T
  /** Load or runtime errors, per script node, from the last tick that had one. */
  readonly errors: ReadonlyMap<NodeId, string>
}

/** Runs `fn` with a live interpreter behind every Lua Script in `doc`. */
export async function withLua<T>(doc: Microcontroller, fn: () => T): Promise<LuaRun<T>> {
  const scripts = doc.nodes.filter((n) => n.type === 'data.luaScript')
  const errors = new Map<NodeId, string>()
  if (scripts.length === 0) return { result: fn(), errors }

  const wasm = wasmPath()
  const runtimes = new Map<NodeId, LuaRuntime>()
  for (const node of scripts) runtimes.set(node.id, await LuaRuntime.create(wasm))

  setLuaTickHook((req) => {
    const runtime = runtimes.get(req.nodeId)
    if (!runtime) return null
    const loadError = runtime.setScript(req.script)
    const outcome = runtime.tick(req.input, req.properties, false)
    const error = loadError ?? outcome.error
    if (error) errors.set(req.nodeId, error)
    return {
      output: { numbers: outcome.outputs.numbers, bools: outcome.outputs.bools },
      frame: null,
    }
  })
  try {
    return { result: fn(), errors }
  } finally {
    setLuaTickHook(null)
    for (const runtime of runtimes.values()) runtime.close()
  }
}
