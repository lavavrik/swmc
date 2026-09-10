/**
 * Matching a recipe port name to a component's port list.
 *
 * Agents name ports; the graph stores indices. The slug of a label is the
 * usual form: "Process variable" → `process-variable`.
 */
import { resolvePorts } from '@/library/ports'
import type { ComponentDef, PortDef } from '@/library/types'
import { err, ok, type Result } from '@/model/result'
import type { NodeProperties } from '@/model/schema'
import type { PortKind } from '@/model/types'

export function slugPort(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function portSlugList(ports: readonly PortDef[]): string[] {
  return ports.map((p) => slugPort(p.label))
}

/** Splits `node` or `node.port` into the recipe id and the optional port spec. */
export function splitEndpoint(ref: string): Result<{ id: string; port?: string }> {
  const trimmed = ref.trim()
  if (trimmed.length === 0) return err('an empty wire end')
  const dot = trimmed.indexOf('.')
  if (dot < 0) return ok({ id: trimmed })
  if (dot === 0 || dot === trimmed.length - 1) return err(`malformed port "${ref}"`)
  return ok({ id: trimmed.slice(0, dot), port: trimmed.slice(dot + 1) })
}

export function resolvePortIndex(
  def: ComponentDef,
  properties: NodeProperties,
  kind: PortKind,
  spec: string | undefined,
  nodeName: string,
): Result<number> {
  const ports = resolvePorts(def, kind, properties)
  const side = kind === 'in' ? 'input' : 'output'
  if (ports.length === 0) return err(`${nodeName} has no ${side} ports`)

  if (spec === undefined) {
    if (ports.length === 1) return ok(0)
    return err(
      `${nodeName} has ${ports.length} ${side}s; qualify one of: ${portSlugList(ports).join(', ')}`,
    )
  }

  const indexed = spec.match(/^(?:(in|out)\.)?(\d+)$/i)
  if (indexed) {
    const wantKind = indexed[1]?.toLowerCase()
    if (wantKind && wantKind !== kind) {
      return err(`${nodeName}.${spec} is an ${wantKind}put, but this wire needs an ${side}`)
    }
    const index = Number(indexed[2])
    if (index < 0 || index >= ports.length) {
      return err(`${nodeName} has no ${side} ${index} (it has ${ports.length})`)
    }
    return ok(index)
  }

  const want = slugPort(spec)
  const exact: number[] = []
  const prefix: number[] = []
  ports.forEach((port, index) => {
    const slug = slugPort(port.label)
    if (slug === want || port.label.toLowerCase() === spec.toLowerCase()) exact.push(index)
    else if (want.length > 0 && slug.startsWith(want)) prefix.push(index)
  })

  if (exact.length === 1) return ok(exact[0]!)
  if (exact.length > 1) {
    return err(`"${spec}" matches several ${side}s on ${nodeName}`)
  }
  if (prefix.length === 1) return ok(prefix[0]!)
  if (prefix.length > 1) {
    return err(
      `"${spec}" is ambiguous on ${nodeName}; use one of: ${portSlugList(ports).join(', ')}`,
    )
  }
  return err(
    `${nodeName} has no ${side} "${spec}". ${side}s: ${portSlugList(ports).join(', ') || '(none)'}`,
  )
}
