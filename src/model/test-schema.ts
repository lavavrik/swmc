import type { GraphSchema } from './schema'
import type { ComponentTypeId, PortKind, SignalType } from './types'

interface FakeDef {
  in: SignalType[]
  out: SignalType[]
}

/** Builds a tiny GraphSchema for model tests, independent of the real library. */
export function fakeSchema(defs: Record<ComponentTypeId, FakeDef>): GraphSchema {
  const ports = (type: ComponentTypeId, kind: PortKind): SignalType[] =>
    (kind === 'in' ? defs[type]?.in : defs[type]?.out) ?? []
  return {
    has: (type) => type in defs,
    portCount: (type, kind) => ports(type, kind).length,
    portSignal: (type, kind, index) => ports(type, kind)[index],
  }
}

/** The schema used by most model tests. */
export const testSchema = fakeSchema({
  add: { in: ['number', 'number'], out: ['number'] },
  not: { in: ['onoff'], out: ['onoff'] },
  constant: { in: [], out: ['number'] },
  compositeRead: { in: ['composite'], out: ['onoff'] },
  'io.in.number': { in: [], out: ['number'] },
  'io.out.number': { in: ['number'], out: [] },
})
