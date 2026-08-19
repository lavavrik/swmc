/**
 * Reading and writing Stormworks microprocessor XML.
 *
 * The mapping runs both ways through the component registry: a file's numeric
 * component type finds a definition, the definition's `xml` metadata decodes
 * its properties, and its port list decides which `<inN>` element a wire lands
 * on. Anything unrecognised is preserved rather than dropped, so an import that
 * this editor only partly understands still saves back faithfully.
 */
import { allComponents, getComponent } from '@/library/registry'
import { defaultProperties } from '@/library/defaults'
import { resolvePorts } from '@/library/ports'
import type { ComponentDef } from '@/library/types'
import { err, ok, type Result } from '@/model/result'
import type {
  GraphNode,
  Microcontroller,
  NodeId,
  PropertyValue,
  SignalType,
  Wire,
} from '@/model/types'
import { decodeProperties, encodeProperties, propertyAttributeNames } from './properties'
import {
  KNOWN_ROOT_ATTRIBUTES,
  NODE_MODE,
  ROOT_TAGS,
  SIGNAL_BY_CODE,
  SIGNAL_CODES,
  UNKNOWN_COMPONENT,
  bridgeType,
  gamePositionToGrid,
  gridPositionToGame,
} from './schema'
import {
  attrNumber,
  buildXml,
  childrenNamed,
  firstChild,
  node,
  parseXml,
  type XmlNode,
} from './xml'

const DEF_BY_SWTYPE = new Map<number, ComponentDef>(
  allComponents()
    .filter((d): d is ComponentDef & { swType: number } => d.swType !== null)
    .map((d) => [d.swType, d]),
)

/** Our node id for a component id in the file, so ids survive a round-trip. */
const nodeIdFor = (componentId: number): NodeId => `c${componentId}`
const componentIdOf = (id: NodeId): number => Number(id.replace(/^c/, ''))

/** XML names of a component's input elements, in port order. */
function inputNames(def: ComponentDef, properties: Readonly<Record<string, PropertyValue>>) {
  const custom = def.xml?.inputNames?.(properties)
  if (custom) return custom
  return resolvePorts(def, 'in', properties).map((_, i) => String(i + 1))
}

// ---------------------------------------------------------------- parsing

interface ParsedInput {
  readonly name: string
  readonly componentId: number
  readonly nodeIndex: number
}

function readInputs(object: XmlNode): ParsedInput[] {
  return object.children
    .filter((c) => /^in/.test(c.tag))
    .map((c) => ({
      name: c.tag.slice(2),
      componentId: attrNumber(c, 'component_id', 0),
      nodeIndex: attrNumber(c, 'node_index', 0),
    }))
    .filter((i) => i.componentId > 0)
}

function readPosition(object: XmlNode) {
  const pos = firstChild(object, 'pos')
  return gamePositionToGrid(pos ? attrNumber(pos, 'x') : 0, pos ? attrNumber(pos, 'y') : 0)
}

/** Attributes of an element that no property of this component claims. */
function unclaimedAttributes(object: XmlNode, claimed: Set<string>): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(object.attrs)) {
    if (key !== 'id' && !claimed.has(key)) raw[key] = value
  }
  return raw
}

export function parseMicrocontroller(xml: string): Result<Microcontroller> {
  let roots: XmlNode[]
  try {
    roots = parseXml(xml)
  } catch (cause) {
    return err(`could not parse the file as XML: ${String(cause)}`)
  }

  const root = roots.find((r) => (ROOT_TAGS as readonly string[]).includes(r.tag))
  if (!root) return err('this file does not contain a microprocessor')

  const group = firstChild(root, 'group')
  const componentElements = childrenNamed(firstChild(group, 'components'), 'c')
  const bridgeElements = childrenNamed(firstChild(group, 'components_bridge'), 'c')
  const nodeElements = childrenNamed(firstChild(root, 'nodes'), 'n')

  const nodes: GraphNode[] = []
  const wires: Wire[] = []
  const ioOrder: NodeId[] = []
  let maxComponentId = 0
  let wireCounter = 0

  /** Wires are recorded per destination, then resolved once every node exists. */
  const pendingWires: { to: { node: NodeId; index: number }; input: ParsedInput }[] = []
  const inputNameLookup = new Map<NodeId, readonly string[]>()

  // --- the microcontroller's own pins
  for (const n of nodeElements) {
    const nodeElement = firstChild(n, 'node')
    if (!nodeElement) continue
    const componentId = attrNumber(n, 'component_id', 0)
    maxComponentId = Math.max(maxComponentId, componentId)
    const signal = SIGNAL_BY_CODE.get(attrNumber(nodeElement, 'type', 0)) ?? 'onoff'
    const direction = attrNumber(nodeElement, 'mode', 0) === NODE_MODE.input ? 'in' : 'out'
    const facePosition = firstChild(nodeElement, 'position')
    const bridge = bridgeElements.find(
      (c) => attrNumber(firstChild(c, 'object') ?? c, 'id', -1) === componentId,
    )
    const bridgeObject = bridge ? firstChild(bridge, 'object') : undefined

    const id = nodeIdFor(componentId)
    const type = `io.${direction}.${signal}`
    const def = getComponent(type)
    nodes.push({
      id,
      type,
      position: bridgeObject ? readPosition(bridgeObject) : { x: 0, y: 0 },
      properties: {
        ...(def ? defaultProperties(def) : {}),
        label: nodeElement.attrs.label ?? '',
        description: nodeElement.attrs.description ?? '',
        faceX: facePosition ? attrNumber(facePosition, 'x') : 0,
        faceZ: facePosition ? attrNumber(facePosition, 'z') : 0,
        nodeId: attrNumber(n, 'id', 0),
      },
    })
    ioOrder.push(id)

    // An output pin reads its value from inside the graph, through in1
    if (bridgeObject) {
      for (const input of readInputs(bridgeObject)) {
        pendingWires.push({ to: { node: id, index: 0 }, input })
      }
    }
  }

  // --- ordinary components
  for (const c of componentElements) {
    const object = firstChild(c, 'object')
    if (!object) continue
    const swType = attrNumber(c, 'type', -1)
    const componentId = attrNumber(object, 'id', 0)
    maxComponentId = Math.max(maxComponentId, componentId)
    const id = nodeIdFor(componentId)
    const def = DEF_BY_SWTYPE.get(swType)
    const inputs = readInputs(object)

    if (!def) {
      // Keep it, wires and all, so the file survives a round-trip
      const unknown = getComponent(UNKNOWN_COMPONENT)
      const inputCount = inputs.reduce((n, i) => Math.max(n, Number(i.name) || 0), 0)
      nodes.push({
        id,
        type: UNKNOWN_COMPONENT,
        position: readPosition(object),
        properties: {
          ...(unknown ? defaultProperties(unknown) : {}),
          swType,
          inputCount,
          outputCount: 0,
        },
        raw: unclaimedAttributes(object, new Set()),
      })
      inputNameLookup.set(
        id,
        Array.from({ length: inputCount }, (_, i) => String(i + 1)),
      )
      for (const input of inputs) {
        const index = (Number(input.name) || 1) - 1
        pendingWires.push({ to: { node: id, index }, input })
      }
      continue
    }

    const properties = decodeProperties(def, object)
    const names = inputNames(def, properties)
    inputNameLookup.set(id, names)
    nodes.push({
      id,
      type: def.id,
      position: readPosition(object),
      properties,
      raw: unclaimedAttributes(object, propertyAttributeNames(def)),
    })
    for (const input of inputs) {
      const index = names.indexOf(input.name)
      if (index >= 0) pendingWires.push({ to: { node: id, index }, input })
    }
  }

  // --- wires, now that every node exists
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const pending of pendingWires) {
    const sourceId = nodeIdFor(pending.input.componentId)
    const source = byId.get(sourceId)
    if (!source) continue
    // An unrecognised source needs enough outputs to carry this wire
    if (source.type === UNKNOWN_COMPONENT) {
      const needed = pending.input.nodeIndex + 1
      const have = Number(source.properties.outputCount ?? 0)
      if (needed > have) {
        byId.set(sourceId, {
          ...source,
          properties: { ...source.properties, outputCount: needed },
        })
      }
    }
    wires.push({
      id: `w${++wireCounter}`,
      from: { node: sourceId, kind: 'out', index: pending.input.nodeIndex },
      to: { node: pending.to.node, kind: 'in', index: pending.to.index },
    })
  }

  const extra: Record<string, string> = {}
  for (const [key, value] of Object.entries(root.attrs)) {
    if (!KNOWN_ROOT_ATTRIBUTES.has(key)) extra[key] = value
  }

  return ok({
    meta: {
      name: root.attrs.name ?? '',
      description: root.attrs.description ?? '',
      width: attrNumber(root, 'width', 1),
      length: attrNumber(root, 'length', 1),
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
    },
    nodes: nodes.map((n) => byId.get(n.id) ?? n),
    wires,
    ioOrder,
    idCounter: maxComponentId + 1,
  })
}

// ------------------------------------------------------------- serializing

/** The `<inN>` elements carrying every wire that ends at this node. */
function inputElements(doc: Microcontroller, nodeId: NodeId, names: readonly string[]): XmlNode[] {
  return doc.wires
    .filter((w) => w.to.node === nodeId)
    .flatMap((w) => {
      const name = names[w.to.index]
      if (name === undefined) return []
      const attrs: Record<string, string> = {
        component_id: String(componentIdOf(w.from.node)),
      }
      if (w.from.index !== 0) attrs.node_index = String(w.from.index)
      return [node(`in${name}`, attrs)]
    })
}

const positionElement = (n: GraphNode): XmlNode => {
  const pos = gridPositionToGame(n.position.x, n.position.y)
  const attrs: Record<string, string> = {}
  if (pos.x !== 0) attrs.x = String(pos.x)
  if (pos.y !== 0) attrs.y = String(pos.y)
  return node('pos', attrs)
}

const isPin = (n: GraphNode): boolean => n.type.startsWith('io.')

export function serializeMicrocontroller(doc: Microcontroller): string {
  const pins = doc.ioOrder
    .map((id) => doc.nodes.find((n) => n.id === id))
    .filter((n): n is GraphNode => n !== undefined && isPin(n))

  const nodesElement = node(
    'nodes',
    {},
    pins.map((pin, index) => {
      const [, direction, signal] = pin.type.split('.') as ['io', 'in' | 'out', SignalType]
      const faceAttrs: Record<string, string> = {}
      if (Number(pin.properties.faceX ?? 0) !== 0) faceAttrs.x = String(pin.properties.faceX)
      if (Number(pin.properties.faceZ ?? 0) !== 0) faceAttrs.z = String(pin.properties.faceZ)
      return node(
        'n',
        {
          id: String(pin.properties.nodeId ?? index + 1),
          component_id: String(componentIdOf(pin.id)),
        },
        [
          node(
            'node',
            {
              label: String(pin.properties.label ?? ''),
              mode: String(direction === 'in' ? NODE_MODE.input : NODE_MODE.output),
              type: String(SIGNAL_CODES[signal] ?? 0),
              description: String(pin.properties.description ?? ''),
            },
            [node('position', faceAttrs)],
          ),
        ],
      )
    }),
  )

  const componentElements = doc.nodes
    .filter((n) => !isPin(n))
    .map((n) => {
      const def = getComponent(n.type)
      if (!def)
        return node('c', { type: '0' }, [node('object', { id: String(componentIdOf(n.id)) })])

      const isUnknown = def.id === UNKNOWN_COMPONENT
      const swType = isUnknown ? Number(n.properties.swType ?? 0) : (def.swType ?? 0)
      const names = isUnknown
        ? resolvePorts(def, 'in', n.properties).map((_, i) => String(i + 1))
        : inputNames(def, n.properties)
      const encoded = isUnknown
        ? { attributes: {}, elements: [] }
        : encodeProperties(def, n.properties)

      const object = node(
        'object',
        { id: String(componentIdOf(n.id)), ...n.raw, ...encoded.attributes },
        [positionElement(n), ...inputElements(doc, n.id, names), ...encoded.elements],
      )
      return node('c', { type: String(swType) }, [object])
    })

  const bridgeElements = pins.map((pin) => {
    const [, direction, signal] = pin.type.split('.') as ['io', 'in' | 'out', SignalType]
    const object = node('object', { id: String(componentIdOf(pin.id)) }, [
      ...inputElements(doc, pin.id, ['1']),
      positionElement(pin),
    ])
    return node('c', { type: String(bridgeType(direction, signal)) }, [object])
  })

  const idCounter = doc.nodes.reduce((max, n) => Math.max(max, componentIdOf(n.id)), 0)
  const nodeIdCounter = pins.reduce((max, p) => Math.max(max, Number(p.properties.nodeId ?? 0)), 0)

  const root = node(
    'microprocessor',
    {
      name: doc.meta.name,
      description: doc.meta.description,
      width: String(doc.meta.width),
      length: String(doc.meta.length),
      id_counter: String(idCounter),
      id_counter_node: String(Math.max(nodeIdCounter, pins.length)),
      ...(doc.meta.extra ?? {}),
    },
    [
      nodesElement,
      node('group', {}, [
        node('data', {}, [node('inputs'), node('outputs')]),
        node('components', {}, componentElements),
        node('components_bridge', {}, bridgeElements),
        node('groups'),
      ]),
    ],
  )

  return buildXml(root)
}
