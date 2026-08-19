/** What the interface needs to know about the running scripts. */
import { create } from 'zustand'
import type { NodeId } from '@/model/types'

export interface LuaState {
  /** True once at least one interpreter has finished loading. */
  ready: boolean
  errors: Readonly<Record<NodeId, string | null>>
  setReady(ready: boolean): void
  /** Records an error, or clears it. Only writes when the message changes. */
  reportError(node: NodeId, error: string | null): void
}

export const useLuaStore = create<LuaState>((set, get) => ({
  ready: false,
  errors: {},

  setReady(ready) {
    if (get().ready !== ready) set({ ready })
  },

  reportError(node, error) {
    if (get().errors[node] === error) return
    set({ errors: { ...get().errors, [node]: error } })
  },
}))
