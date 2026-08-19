/**
 * Connects the interpreter to the graph.
 *
 * One interpreter per Lua Script component, created lazily: the WebAssembly
 * module loads asynchronously, so until a node's interpreter is ready the
 * component passes its signals through rather than stalling the simulation.
 */
// The interpreter's WebAssembly is bundled with the app; left to itself
// wasmoon fetches it from a CDN, which would break offline and under a strict
// content security policy.
import wasmUrl from 'wasmoon/dist/glue.wasm?url'
import { setLuaTickHook, type LuaTickRequest } from '@/library/hooks'
import type { CompositeValue } from '@/library/types'
import type { NodeId } from '@/model/types'
import { LuaRuntime } from './runtime'
import type { DrawCommand } from './screen'
import { useLuaStore } from './store'

const runtimes = new Map<NodeId, LuaRuntime>()
const starting = new Set<NodeId>()
/** The most recent display list per node, read imperatively by the preview. */
const drawing = new Map<NodeId, readonly DrawCommand[]>()

/** Which node's script should draw, and at what size. */
let drawTarget: { node: NodeId; width: number; height: number } | null = null

export function setDrawTarget(target: typeof drawTarget): void {
  drawTarget = target
}

export function drawCommandsFor(node: NodeId): readonly DrawCommand[] {
  return drawing.get(node) ?? []
}

function toComposite(numbers: readonly number[], bools: readonly boolean[]): CompositeValue {
  return { numbers, bools }
}

function tick(request: LuaTickRequest) {
  const runtime = runtimes.get(request.nodeId)
  if (!runtime) {
    start(request.nodeId)
    return null
  }

  const target = drawTarget?.node === request.nodeId ? drawTarget : null
  if (target) runtime.setScreenSize(target.width, target.height)
  const draw = target !== null

  const loadError = runtime.setScript(request.script)
  const result = runtime.tick(request.input, request.properties, draw)
  useLuaStore.getState().reportError(request.nodeId, loadError ?? result.error)
  if (draw) drawing.set(request.nodeId, result.commands)

  return { output: toComposite(result.outputs.numbers, result.outputs.bools) }
}

function start(node: NodeId): void {
  if (starting.has(node)) return
  starting.add(node)
  LuaRuntime.create(wasmUrl)
    .then((runtime) => {
      runtimes.set(node, runtime)
      useLuaStore.getState().setReady(true)
    })
    .catch((error: unknown) => {
      useLuaStore.getState().reportError(node, `could not start Lua: ${String(error)}`)
    })
    .finally(() => starting.delete(node))
}

/** Installs the hook the Lua Script component calls. */
export function installLuaRunner(): void {
  setLuaTickHook(tick)
}

/** Discards the interpreter for a node, so the next tick starts it fresh. */
export function disposeLuaRuntime(node: NodeId): void {
  runtimes.get(node)?.close()
  runtimes.delete(node)
  drawing.delete(node)
}
