import type { PropertyValue } from '@/model/types'
import type { ComponentDef } from './types'

/** The property values a freshly placed component starts with. */
export function defaultProperties(def: ComponentDef): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {}
  for (const p of def.properties) out[p.key] = p.default
  return out
}
