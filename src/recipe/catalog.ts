/**
 * The component catalogue as a machine-readable dump.
 *
 * Agents should read this rather than grepping `src/library/components/`.
 */
import { defaultPorts } from '@/library/ports'
import { allComponents } from '@/library/registry'
import type { PropertyDef } from '@/library/types'
import type { PropertyValue, SignalType } from '@/model/types'
import { slugPort } from './ports'

export interface CatalogPort {
  readonly index: number
  readonly label: string
  readonly slug: string
  readonly signal: SignalType
}

export interface CatalogProperty {
  readonly key: string
  readonly kind: PropertyDef['kind']
  readonly label: string
  readonly default: PropertyValue
  readonly options?: readonly string[]
}

export interface CatalogComponent {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly swType: number | null
  readonly description: string
  readonly deprecated?: boolean
  readonly inputs: readonly CatalogPort[]
  readonly outputs: readonly CatalogPort[]
  readonly properties: readonly CatalogProperty[]
}

export interface CatalogOptions {
  readonly all?: boolean
}

function catalogPorts(def: Parameters<typeof defaultPorts>[0], kind: 'in' | 'out'): CatalogPort[] {
  return defaultPorts(def, kind).map((port, index) => ({
    index,
    label: port.label,
    slug: slugPort(port.label),
    signal: port.signal,
  }))
}

function catalogProperty(property: PropertyDef): CatalogProperty {
  const options = property.kind === 'dropdown' ? property.options.map((o) => o.value) : undefined
  return {
    key: property.key,
    kind: property.kind,
    label: property.label,
    default: property.default,
    ...(options ? { options } : {}),
  }
}

export function componentCatalog(options: CatalogOptions = {}): CatalogComponent[] {
  return allComponents()
    .filter((def) => {
      if (def.id === 'unknown.component') return false
      if (def.deprecated === true && options.all !== true) return false
      return true
    })
    .map((def) => ({
      id: def.id,
      name: def.name,
      category: def.category,
      swType: def.swType,
      description: def.description,
      ...(def.deprecated === true ? { deprecated: true } : {}),
      inputs: catalogPorts(def, 'in'),
      outputs: catalogPorts(def, 'out'),
      properties: def.properties.map(catalogProperty),
    }))
}
