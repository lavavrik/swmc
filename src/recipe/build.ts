/**
 * A named recipe → a `Microcontroller` the editor, the simulator and the XML
 * codec already know how to handle.
 */
import { defaultProperties } from '@/library/defaults'
import { getComponent, librarySchema } from '@/library/registry'
import { addIoNode, addNode, connect, createEmpty, setMeta } from '@/model/ops'
import { err, ok, type Result } from '@/model/result'
import type { Microcontroller, NodeId, Point } from '@/model/types'
import { autoLayout } from './layout'
import { resolvePortIndex, splitEndpoint } from './ports'
import type { Recipe } from './types'

export interface BuildResult {
  readonly doc: Microcontroller
  /** Recipe-local names to document node ids. */
  readonly ids: ReadonlyMap<string, NodeId>
  readonly warnings: readonly string[]
}

export function buildRecipe(recipe: Recipe): Result<BuildResult> {
  const names = new Map<string, NodeId>()
  const reverse = new Map<NodeId, string>()
  const explicit = new Map<NodeId, Point>()
  let doc = createEmpty({
    name: recipe.name,
    description: recipe.description,
    width: recipe.width,
    length: recipe.length,
  })

  for (const pin of recipe.pins) {
    const type = `io.${pin.dir}.${pin.signal}`
    const def = getComponent(type)
    if (!def) return err(`pin "${pin.id}": unknown signal ${pin.signal}`)
    const added = addIoNode(librarySchema, doc, {
      type,
      position: { x: 0, y: 0 },
      properties: {
        ...defaultProperties(def),
        label: pin.label,
        description: pin.description,
        faceX: pin.faceX,
        faceZ: pin.faceZ,
        nodeId: names.size + 1,
      },
    })
    if (!added.ok) return err(`pin "${pin.id}": ${added.error}`)
    doc = added.value.doc
    names.set(pin.id, added.value.id)
    reverse.set(added.value.id, pin.id)
  }

  for (const node of recipe.nodes) {
    const def = getComponent(node.type)
    if (!def) return err(`node "${node.id}": unknown type "${node.type}"`)
    const added = addNode(librarySchema, doc, {
      type: node.type,
      position: node.position ?? { x: 0, y: 0 },
      properties: { ...defaultProperties(def), ...node.properties },
    })
    if (!added.ok) return err(`node "${node.id}": ${added.error}`)
    doc = added.value.doc
    names.set(node.id, added.value.id)
    reverse.set(added.value.id, node.id)
    if (node.position) explicit.set(added.value.id, node.position)
  }

  const label = (id: NodeId) => reverse.get(id) ?? id

  for (const wire of recipe.wires) {
    const fromRef = splitEndpoint(wire.from)
    if (!fromRef.ok) return err(`wire ${wire.from} → ${wire.to}: ${fromRef.error}`)
    const toRef = splitEndpoint(wire.to)
    if (!toRef.ok) return err(`wire ${wire.from} → ${wire.to}: ${toRef.error}`)

    const fromId = names.get(fromRef.value.id)
    const toId = names.get(toRef.value.id)
    if (!fromId) return err(`wire from unknown node "${fromRef.value.id}"`)
    if (!toId) return err(`wire to unknown node "${toRef.value.id}"`)

    const fromNode = doc.nodes.find((n) => n.id === fromId)
    const toNode = doc.nodes.find((n) => n.id === toId)
    if (!fromNode || !toNode) return err(`wire ${wire.from} → ${wire.to}: missing node`)
    const fromDef = getComponent(fromNode.type)
    const toDef = getComponent(toNode.type)
    if (!fromDef || !toDef) return err(`wire ${wire.from} → ${wire.to}: unknown component`)

    const fromIndex = resolvePortIndex(
      fromDef,
      fromNode.properties,
      'out',
      fromRef.value.port,
      fromRef.value.id,
    )
    if (!fromIndex.ok) return fromIndex
    const toIndex = resolvePortIndex(
      toDef,
      toNode.properties,
      'in',
      toRef.value.port,
      toRef.value.id,
    )
    if (!toIndex.ok) return toIndex

    const connected = connect(
      librarySchema,
      doc,
      { node: fromId, kind: 'out', index: fromIndex.value },
      { node: toId, kind: 'in', index: toIndex.value },
    )
    if (!connected.ok) {
      return err(`${label(fromId)} → ${label(toId)}: ${connected.error}`)
    }
    doc = connected.value.doc
  }

  doc = autoLayout(doc, explicit)
  doc = setMeta(doc, { width: recipe.width, length: recipe.length })

  const warnings = warnDisconnected(recipe, doc, names)
  return ok({ doc, ids: names, warnings })
}

function warnDisconnected(
  recipe: Recipe,
  doc: Microcontroller,
  names: ReadonlyMap<string, NodeId>,
): string[] {
  const warnings: string[] = []
  for (const pin of recipe.pins) {
    const id = names.get(pin.id)
    if (!id) continue
    if (pin.dir === 'in') {
      const used = doc.wires.some((w) => w.from.node === id)
      if (!used) warnings.push(`input pin "${pin.id}" is not wired to anything`)
    } else {
      const used = doc.wires.some((w) => w.to.node === id)
      if (!used) warnings.push(`output pin "${pin.id}" is not driven`)
    }
  }
  return warnings
}
