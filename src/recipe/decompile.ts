/**
 * A `Microcontroller` → a recipe, so an agent can edit one it did not build.
 *
 * The recipe names nodes after their type (`clamp_1`) and pins after their
 * label (`throttle_in`); the original recipe's names are not in the XML.
 * Positions are kept, so rebuilding the result lays it out as it was.
 */
import { stringify } from 'yaml'
import { defaultProperties } from '@/library/defaults'
import { resolvePorts } from '@/library/ports'
import { getComponent } from '@/library/registry'
import { err, ok, type Result } from '@/model/result'
import type { Microcontroller, NodeId, PortKind, PropertyValue, SignalType } from '@/model/types'
import { slugPort } from './ports'
import type { WireRecipe } from './types'

/** The YAML-shaped recipe `parseRecipeText` reads back. */
export interface RecipeDoc {
  name: string
  description: string
  width: number
  length: number
  pins: Record<string, PropertyValue>[]
  nodes: Record<string, PropertyValue | { x: number; y: number }>[]
  wires: WireRecipe[]
}

export function decompile(doc: Microcontroller): Result<RecipeDoc> {
  const names = new Map<NodeId, string>()
  const used = new Set<string>()
  const unique = (base: string): string => {
    let name = base
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`
    used.add(name)
    return name
  }

  const pins: RecipeDoc['pins'] = []
  for (const id of doc.ioOrder) {
    const node = doc.nodes.find((n) => n.id === id)
    if (!node) continue
    const [, dir, signal] = node.type.split('.') as ['io', 'in' | 'out', SignalType]
    const label = String(node.properties.label ?? '')
    const name = unique(identifier(label, `${dir}_${signal}`))
    names.set(id, name)
    const pin: Record<string, PropertyValue> = { id: name, dir, signal }
    if (label !== '' && label !== name) pin.label = label
    const description = String(node.properties.description ?? '')
    if (description !== '') pin.description = description
    pin.faceX = Number(node.properties.faceX ?? 0)
    pin.faceZ = Number(node.properties.faceZ ?? 0)
    pins.push(pin)
  }

  const nodes: RecipeDoc['nodes'] = []
  const unknown: string[] = []
  const counters = new Map<string, number>()
  for (const node of doc.nodes) {
    if (node.type.startsWith('io.')) continue
    const def = getComponent(node.type)
    if (!def || def.id === 'unknown.component') {
      unknown.push(node.raw?.type ?? node.type)
      continue
    }
    const base = identifier(node.type.split('.').pop() ?? 'node', 'node')
    const count = (counters.get(base) ?? 0) + 1
    counters.set(base, count)
    const name = unique(`${base}_${count}`)
    names.set(node.id, name)

    const entry: RecipeDoc['nodes'][number] = { id: name, type: node.type }
    const defaults = defaultProperties(def)
    for (const prop of def.properties) {
      const value = node.properties[prop.key]
      if (value === undefined || value === defaults[prop.key]) continue
      entry[prop.key] = value
    }
    entry.position = { x: node.position.x + 0, y: node.position.y + 0 }
    nodes.push(entry)
  }
  if (unknown.length > 0) {
    return err(`cannot express these components as a recipe: ${[...new Set(unknown)].join(', ')}`)
  }

  const wires: WireRecipe[] = []
  for (const wire of doc.wires) {
    const from = endpoint(doc, names, wire.from.node, 'out', wire.from.index)
    const to = endpoint(doc, names, wire.to.node, 'in', wire.to.index)
    if (!from || !to) continue
    wires.push({ from, to })
  }

  return ok({
    name: doc.meta.name,
    description: doc.meta.description,
    width: doc.meta.width,
    length: doc.meta.length,
    pins,
    nodes,
    wires,
  })
}

/** `node` when it has one port that way, else `node.<slug>` or `node.in.N`. */
function endpoint(
  doc: Microcontroller,
  names: ReadonlyMap<NodeId, string>,
  id: NodeId,
  kind: PortKind,
  index: number,
): string | null {
  const name = names.get(id)
  const node = doc.nodes.find((n) => n.id === id)
  if (!name || !node) return null
  const def = getComponent(node.type)
  if (!def) return null
  const ports = resolvePorts(def, kind, node.properties)
  if (ports.length === 1) return name
  const slug = slugPort(ports[index]?.label ?? '')
  const clash = ports.filter((p) => slugPort(p.label) === slug).length !== 1
  // A slug that is also a prefix of another port's slug still resolves: exact wins.
  if (slug === '' || clash || /^\d+$/.test(slug)) return `${name}.${kind}.${index}`
  return `${name}.${slug}`
}

function identifier(text: string, fallback: string): string {
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (id === '') return fallback
  return /^[a-z_]/.test(id) ? id : `_${id}`
}

/** YAML with one wire and one position per line, the way `recipes/` reads. */
export function recipeYaml(recipe: RecipeDoc): string {
  const text = stringify(recipe, {
    lineWidth: 0,
    blockQuote: 'literal',
  })
  return text
    .replace(
      /^ {2}- from: (.+)\n {4}to: (.+)$/gm,
      (_, from: string, to: string) => `  - { from: ${from}, to: ${to} }`,
    )
    .replace(
      /^ {4}position:\n {6}x: (.+)\n {6}y: (.+)$/gm,
      (_, x: string, y: string) => `    position: { x: ${x}, y: ${y} }`,
    )
}
