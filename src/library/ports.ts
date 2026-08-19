/** Resolves a component's ports, which may depend on its property values. */
import type { NodeProperties } from '@/model/schema'
import type { PortKind } from '@/model/types'
import { defaultProperties } from './defaults'
import type { ComponentDef, PortDef, PortSpec } from './types'

export function resolvePortSpec(spec: PortSpec, properties: NodeProperties): readonly PortDef[] {
  return typeof spec === 'function' ? spec(properties) : spec
}

export function resolvePorts(
  def: ComponentDef,
  kind: PortKind,
  properties: NodeProperties,
): readonly PortDef[] {
  return resolvePortSpec(kind === 'in' ? def.inputs : def.outputs, properties)
}

/** Ports as they look on a freshly placed component. Used by menus and docs. */
export function defaultPorts(def: ComponentDef, kind: PortKind): readonly PortDef[] {
  return resolvePorts(def, kind, defaultProperties(def))
}
