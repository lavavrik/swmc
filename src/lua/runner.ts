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
import type { MonitorSize, VideoFrame } from '@/library/video'
import { useLuaStore } from './store'

const runtimes = new Map<NodeId, LuaRuntime>()
const starting = new Set<NodeId>()
/** The most recent frame per node, read imperatively by the previews. */
const frames = new Map<NodeId, VideoFrame>()

/**
 * The monitor each script is drawing for. A script only runs `onDraw` while
 * something is watching it — the script editor, or a monitor probe attached
 * somewhere its video output reaches — which is how the game behaves too, and
 * keeps unwatched scripts cheap.
 */
const watchers = new Map<string, Map<NodeId, MonitorSize>>()

/**
 * Registers what one watcher is looking at. Watchers are named so that the
 * script editor and the monitor probe can each declare their own set without
 * treading on the other.
 */
export function setWatched(watcher: string, sizes: ReadonlyMap<NodeId, MonitorSize>): void {
  if (sizes.size === 0) watchers.delete(watcher)
  else watchers.set(watcher, new Map(sizes))
}

/** The largest size any watcher wants from this node, if any. */
function sizeFor(node: NodeId): MonitorSize | null {
  let best: MonitorSize | null = null
  for (const sizes of watchers.values()) {
    const size = sizes.get(node)
    if (size && (!best || size.width * size.height > best.width * best.height)) best = size
  }
  return best
}

export function frameFor(node: NodeId): VideoFrame | null {
  return frames.get(node) ?? null
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

  const size = sizeFor(request.nodeId)
  if (size) runtime.setScreenSize(size.width, size.height)

  const loadError = runtime.setScript(request.script)
  const result = runtime.tick(request.input, request.properties, size !== null)
  useLuaStore.getState().reportError(request.nodeId, loadError ?? result.error)

  let frame: VideoFrame | null = null
  if (size) {
    frame = {
      kind: 'video',
      commands: result.commands,
      width: size.width,
      height: size.height,
    }
    frames.set(request.nodeId, frame)
  }

  return { output: toComposite(result.outputs.numbers, result.outputs.bools), frame }
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
  frames.delete(node)
}
