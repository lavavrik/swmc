/**
 * The component registry: the single place that knows what components exist.
 *
 * It also supplies the `GraphSchema` the model layer needs, which is how the
 * model stays free of any dependency on the library.
 */
import type { GraphSchema, NodeProperties } from '@/model/schema'
import { resolvePorts } from './ports'
import type { ComponentTypeId, PortKind } from '@/model/types'
import { arithmeticComponents } from './components/arithmetic'
import { avComponents } from './components/av'
import { comparisonComponents } from './components/comparison'
import { compositeComponents } from './components/composite'
import { constantComponents } from './components/constants'
import { ioComponents } from './components/io'
import { logicComponents } from './components/logic'
import { luaComponents } from './components/lua'
import { propertyComponents } from './components/properties'
import { timerComponents } from './components/timers'
import { tooltipComponents } from './components/tooltips'
import type { Category, ComponentDef } from './types'

const DEFS: ComponentDef[] = [
  ...arithmeticComponents,
  ...logicComponents,
  ...comparisonComponents,
  ...constantComponents,
  ...timerComponents,
  ...compositeComponents,
  ...propertyComponents,
  ...tooltipComponents,
  ...avComponents,
  ...luaComponents,
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
    .map((category) => ({
      category,
      // Deprecated components still load from old files, but are not offered
      components: DEFS.filter((d) => d.category === category && d.deprecated !== true),
    }))
    .filter((group) => group.components.length > 0)
}

const ports = (type: ComponentTypeId, properties: NodeProperties, kind: PortKind) => {
  const def = BY_ID.get(type)
  return def ? resolvePorts(def, kind, properties) : undefined
}

export const librarySchema: GraphSchema = {
  has: (type) => BY_ID.has(type),
  portCount: (type, properties, kind) => ports(type, properties, kind)?.length ?? 0,
  portSignal: (type, properties, kind, index) => ports(type, properties, kind)?.[index]?.signal,
}
