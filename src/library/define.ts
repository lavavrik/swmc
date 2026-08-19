import type { ComponentDef } from './types'

/** Identity helper that keeps component definitions type-checked at the site of definition. */
export function defineComponent<S = unknown>(def: ComponentDef<S>): ComponentDef<S> {
  return def
}
