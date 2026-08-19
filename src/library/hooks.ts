/**
 * The seam where the Lua subsystem plugs into the component library.
 *
 * The library must not depend on the interpreter — it sits below it — so the
 * Lua Script component calls through this hook instead. Until something
 * installs one, the component simply passes its signals through, and tests can
 * install a fake.
 */
import type { NodeId, PropertyValue } from '@/model/types'
import type { CompositeValue } from './types'

export interface LuaTickRequest {
  readonly nodeId: NodeId
  readonly script: string
  readonly input: CompositeValue
  readonly properties: Readonly<Record<string, PropertyValue>>
}

export interface LuaTickOutcome {
  readonly output: CompositeValue
}

/** Returns null when no interpreter is available yet. */
export type LuaTickHook = (request: LuaTickRequest) => LuaTickOutcome | null

let hook: LuaTickHook | null = null

export function setLuaTickHook(next: LuaTickHook | null): void {
  hook = next
}

export function runLuaTick(request: LuaTickRequest): LuaTickOutcome | null {
  return hook?.(request) ?? null
}
