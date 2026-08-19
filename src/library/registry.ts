/**
 * The component registry: the single place that knows what components exist.
 *
 * It also supplies the `GraphSchema` the model layer needs, which is how the
 * model stays free of any dependency on the library.
 */
import type { GraphSchema } from '@/model/schema'
import type { ComponentTypeId } from '@/model/types'
import { arithmeticComponents, functionComponent } from './components/arithmetic'
import { compositeComponents } from './components/composite'
import { constantComponents } from './components/constants'
import { ioComponents } from './components/io'
import { logicComponents } from './components/logic'
import type { Category, ComponentDef } from './types'

const DEFS: ComponentDef[] = [
  ...arithmeticComponents,
  functionComponent,
  ...logicComponents,
  ...constantComponents,
  ...compositeComponents,
  ...ioComponents,
]

const BY_ID = new Map<ComponentTypeId, ComponentDef>(DEFS.map((d) => [d.id, d]))

export function getComponent(id: ComponentTypeId): ComponentDef | undefined {
  return BY_ID.get(id)
}

export function allComponents(): readonly ComponentDef[] {
  return DEFS
}

/** Components grouped for the picker menu, in category order. */
export function componentsByCategory(): { category: Category; components: ComponentDef[] }[] {
  const order: Category[] = [
    'arithmetic',
    'logic',
    'comparison',
    'composite',
    'video',
    'audio',
    'data',
    'property',
    'io',
  ]
  return order
    .map((category) => ({ category, components: DEFS.filter((d) => d.category === category) }))
    .filter((group) => group.components.length > 0)
}

const ports = (type: ComponentTypeId, kind: 'in' | 'out') => {
  const def = BY_ID.get(type)
  if (!def) return undefined
  return kind === 'in' ? def.inputs : def.outputs
}

export const librarySchema: GraphSchema = {
  has: (type) => BY_ID.has(type),
  portCount: (type, kind) => ports(type, kind)?.length ?? 0,
  portSignal: (type, kind, index) => ports(type, kind)?.[index]?.signal,
}
