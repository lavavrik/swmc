/**
 * JSON or YAML text → a `Recipe`, with every name and type checked.
 *
 * Extra keys on a node become properties, so this is valid:
 *
 *     { id: clamp, type: arithmetic.clamp, min: 0, max: 0.75 }
 */
import { parse as parseYaml } from 'yaml'
import { getComponent } from '@/library/registry'
import { assignPinFaces } from '@/model/ioLayout'
import { err, ok, type Result } from '@/model/result'
import { SIGNAL_TYPES, type PropertyValue, type SignalType } from '@/model/types'
import type { PropertyDef } from '@/library/types'
import { RECIPE_ID, type NodeRecipe, type PinRecipe, type Recipe, type WireRecipe } from './types'

const NODE_RESERVED = new Set(['id', 'type', 'position', 'properties'])
const PIN_RESERVED = new Set([
  'id',
  'dir',
  'signal',
  'label',
  'description',
  'face',
  'faceX',
  'faceZ',
])
const ROOT_KEYS = new Set(['name', 'description', 'width', 'length', 'pins', 'nodes', 'wires'])

export function parseRecipeText(text: string, format: 'json' | 'yaml'): Result<Recipe> {
  let raw: unknown
  try {
    raw = format === 'json' ? JSON.parse(text) : parseYaml(text)
  } catch (cause) {
    return err(`could not parse ${format}: ${String(cause)}`)
  }
  return recipeFromUnknown(raw)
}

export function formatFromPath(path: string): 'json' | 'yaml' {
  return /\.ya?ml$/i.test(path) ? 'yaml' : 'json'
}

export function recipeFromUnknown(raw: unknown): Result<Recipe> {
  if (!isRecord(raw)) return err('a recipe must be a mapping')

  for (const key of Object.keys(raw)) {
    if (!ROOT_KEYS.has(key)) return err(`unknown recipe field "${key}"`)
  }

  const name = asString(raw.name, 'name')
  if (!name.ok) return name
  if (name.value.trim().length === 0) return err('the recipe needs a name')

  const description =
    raw.description === undefined ? ok('') : asString(raw.description, 'description')
  if (!description.ok) return description

  const width = raw.width === undefined ? ok(undefined) : asSize(raw.width, 'width')
  if (!width.ok) return width
  const length = raw.length === undefined ? ok(undefined) : asSize(raw.length, 'length')
  if (!length.ok) return length

  const pinsRaw = raw.pins === undefined ? [] : raw.pins
  if (!Array.isArray(pinsRaw)) return err('pins must be a list')
  const nodesRaw = raw.nodes === undefined ? [] : raw.nodes
  if (!Array.isArray(nodesRaw)) return err('nodes must be a list')
  const wiresRaw = raw.wires === undefined ? [] : raw.wires
  if (!Array.isArray(wiresRaw)) return err('wires must be a list')

  const parsedPins: ParsedPin[] = []
  const ids = new Set<string>()

  for (let i = 0; i < pinsRaw.length; i++) {
    const parsed = parsePin(pinsRaw[i], i)
    if (!parsed.ok) return parsed
    if (ids.has(parsed.value.id)) return err(`duplicate id "${parsed.value.id}"`)
    ids.add(parsed.value.id)
    parsedPins.push(parsed.value)
  }
  const inputs = parsedPins.filter((p) => p.dir === 'in')
  const outputs = parsedPins.filter((p) => p.dir === 'out')

  const nodes: NodeRecipe[] = []
  for (let i = 0; i < nodesRaw.length; i++) {
    const parsed = parseNode(nodesRaw[i], i)
    if (!parsed.ok) return parsed
    if (ids.has(parsed.value.id)) return err(`duplicate id "${parsed.value.id}"`)
    ids.add(parsed.value.id)
    nodes.push(parsed.value)
  }

  const wires: WireRecipe[] = []
  for (let i = 0; i < wiresRaw.length; i++) {
    const parsed = parseWire(wiresRaw[i], i)
    if (!parsed.ok) return parsed
    wires.push(parsed.value)
  }

  const autoLength = Math.min(6, Math.max(1, inputs.length, outputs.length, 1))
  const autoWidth = inputs.length > 0 && outputs.length > 0 ? 2 : 1
  const placed = assignPinFaces(
    parsedPins.map((pin) => ({
      dir: pin.dir,
      explicit: pin.faceExplicit,
      faceX: pin.faceX,
      faceZ: pin.faceZ,
    })),
    width.value ?? autoWidth,
    length.value ?? autoLength,
  )
  const pins: PinRecipe[] = parsedPins.map((pin, i) => ({
    id: pin.id,
    dir: pin.dir,
    signal: pin.signal,
    label: pin.label,
    description: pin.description,
    faceX: placed.faces[i]!.x,
    faceZ: placed.faces[i]!.z,
  }))

  return ok({
    name: name.value,
    description: description.value,
    width: placed.width,
    length: placed.length,
    pins,
    nodes,
    wires,
  })
}

interface ParsedPin extends PinRecipe {
  readonly faceExplicit: boolean
}

function parsePin(raw: unknown, index: number): Result<ParsedPin> {
  const where = `pin ${index + 1}`
  if (!isRecord(raw)) return err(`${where} must be a mapping`)
  for (const key of Object.keys(raw)) {
    if (!PIN_RESERVED.has(key)) return err(`${where}: unknown field "${key}"`)
  }

  const id = asId(raw.id, where)
  if (!id.ok) return id

  if (raw.dir !== 'in' && raw.dir !== 'out') {
    return err(`${where} "${id.value}": dir must be in or out`)
  }
  if (typeof raw.signal !== 'string' || !isSignal(raw.signal)) {
    return err(`${where} "${id.value}": signal must be ${SIGNAL_TYPES.join(', ')}`)
  }

  const label = raw.label === undefined ? ok(id.value) : asString(raw.label, `${where} label`)
  if (!label.ok) return label
  const description =
    raw.description === undefined ? ok('') : asString(raw.description, `${where} description`)
  if (!description.ok) return description

  const face = parseFace(raw, where)
  if (!face.ok) return face

  return ok({
    id: id.value,
    dir: raw.dir,
    signal: raw.signal,
    label: label.value,
    description: description.value,
    faceX: face.value.x,
    faceZ: face.value.z,
    faceExplicit: face.value.explicit,
  })
}

function parseFace(
  raw: Record<string, unknown>,
  where: string,
): Result<{ x: number; z: number; explicit: boolean }> {
  let x = 0
  let z = 0
  const explicit = raw.face !== undefined || raw.faceX !== undefined || raw.faceZ !== undefined
  if (raw.face !== undefined) {
    if (!isRecord(raw.face)) return err(`${where}: face must be { x, z }`)
    if (raw.face.x !== undefined) {
      const n = asNumber(raw.face.x, `${where} face.x`)
      if (!n.ok) return n
      x = n.value
    }
    if (raw.face.z !== undefined) {
      const n = asNumber(raw.face.z, `${where} face.z`)
      if (!n.ok) return n
      z = n.value
    }
  }
  if (raw.faceX !== undefined) {
    const n = asNumber(raw.faceX, `${where} faceX`)
    if (!n.ok) return n
    x = n.value
  }
  if (raw.faceZ !== undefined) {
    const n = asNumber(raw.faceZ, `${where} faceZ`)
    if (!n.ok) return n
    z = n.value
  }
  return ok({ x, z, explicit })
}

function parseNode(raw: unknown, index: number): Result<NodeRecipe> {
  const where = `node ${index + 1}`
  if (!isRecord(raw)) return err(`${where} must be a mapping`)

  const id = asId(raw.id, where)
  if (!id.ok) return id
  const named = `${where} "${id.value}"`

  if (typeof raw.type !== 'string' || raw.type.length === 0) {
    return err(`${named}: missing type`)
  }
  const def = getComponent(raw.type)
  if (!def) return err(`${named}: unknown type "${raw.type}"`)
  if (def.category === 'io') {
    return err(`${named}: pins go in the pins list, not nodes`)
  }

  const extra: Record<string, unknown> = {}
  if (isRecord(raw.properties)) Object.assign(extra, raw.properties)
  else if (raw.properties !== undefined) return err(`${named}: properties must be a mapping`)

  for (const [key, value] of Object.entries(raw)) {
    if (NODE_RESERVED.has(key)) continue
    extra[key] = value
  }

  const properties: Record<string, PropertyValue> = {}
  for (const [key, value] of Object.entries(extra)) {
    const prop = def.properties.find((p) => p.key === key)
    if (!prop) {
      const known = def.properties.map((p) => p.key)
      return err(
        `${named}: unknown property "${key}"` +
          (known.length > 0 ? `. ${def.id} has: ${known.join(', ')}` : `. ${def.id} has none`),
      )
    }
    const coerced = coerceProperty(prop, value, `${named}.${key}`)
    if (!coerced.ok) return coerced
    properties[key] = coerced.value
  }

  let position: NodeRecipe['position']
  if (raw.position !== undefined) {
    if (!isRecord(raw.position)) return err(`${named}: position must be { x, y }`)
    const x = asNumber(raw.position.x ?? 0, `${named} position.x`)
    if (!x.ok) return x
    const y = asNumber(raw.position.y ?? 0, `${named} position.y`)
    if (!y.ok) return y
    position = { x: x.value, y: y.value }
  }

  return ok({
    id: id.value,
    type: raw.type,
    properties,
    ...(position ? { position } : {}),
  })
}

function parseWire(raw: unknown, index: number): Result<WireRecipe> {
  const where = `wire ${index + 1}`
  if (!isRecord(raw)) return err(`${where} must be a mapping { from, to }`)
  const from = asString(raw.from, `${where} from`)
  if (!from.ok) return from
  const to = asString(raw.to, `${where} to`)
  if (!to.ok) return to
  if (from.value.trim().length === 0 || to.value.trim().length === 0) {
    return err(`${where}: from and to are required`)
  }
  return ok({ from: from.value.trim(), to: to.value.trim() })
}

function coerceProperty(def: PropertyDef, value: unknown, where: string): Result<PropertyValue> {
  switch (def.kind) {
    case 'number':
    case 'slider': {
      if (typeof value === 'number' && Number.isFinite(value)) return ok(value)
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return ok(Number(value))
      }
      return err(`${where} must be a number`)
    }
    case 'text': {
      if (typeof value === 'string') return ok(value)
      if (typeof value === 'number' && Number.isFinite(value)) return ok(String(value))
      if (typeof value === 'boolean') return ok(String(value))
      return err(`${where} must be text`)
    }
    case 'bool': {
      if (typeof value === 'boolean') return ok(value)
      return err(`${where} must be true or false`)
    }
    case 'dropdown': {
      if (typeof value !== 'string')
        return err(`${where} must be one of: ${def.options.map((o) => o.value).join(', ')}`)
      if (!def.options.some((o) => o.value === value)) {
        return err(`${where} must be one of: ${def.options.map((o) => o.value).join(', ')}`)
      }
      return ok(value)
    }
  }
}

function asId(raw: unknown, where: string): Result<string> {
  const text = asString(raw, `${where} id`)
  if (!text.ok) return text
  if (!RECIPE_ID.test(text.value)) {
    return err(`${where} id "${text.value}" must be letters, digits and underscores`)
  }
  return text
}

function asString(raw: unknown, where: string): Result<string> {
  if (typeof raw !== 'string') return err(`${where} must be text`)
  return ok(raw)
}

function asNumber(raw: unknown, where: string): Result<number> {
  if (typeof raw === 'number' && Number.isFinite(raw)) return ok(raw)
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return ok(Number(raw))
  }
  return err(`${where} must be a number`)
}

function asSize(raw: unknown, where: string): Result<number> {
  const n = asNumber(raw, where)
  if (!n.ok) return n
  const size = Math.min(6, Math.max(1, Math.round(n.value)))
  return ok(size)
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
}

function isSignal(raw: string): raw is SignalType {
  return (SIGNAL_TYPES as readonly string[]).includes(raw)
}
