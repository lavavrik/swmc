/**
 * Reading and writing component properties in the game's encoding.
 *
 * Each `PropertyDef` declares its own XML form, so this file never needs to
 * know about a specific component.
 */
import { defaultProperties } from '@/library/defaults'
import type { ComponentDef, PropertyDef, XmlProperty } from '@/library/types'
import type { PropertyValue } from '@/model/types'
import { node, type XmlNode } from './xml'

/** Number properties are stored as `<name text="…" value="…"/>` children. */
const numberElement = (name: string, value: number): XmlNode =>
  node(name, { text: String(value), value: String(value) })

function decodeOne(
  form: XmlProperty,
  object: XmlNode,
  fallback: PropertyValue,
): PropertyValue | undefined {
  switch (form.form) {
    case 'attribute': {
      const raw = object.attrs[form.name]
      return raw === undefined ? undefined : raw
    }
    case 'attributeNumber': {
      const raw = object.attrs[form.name]
      if (raw === undefined) {
        return form.absent === undefined ? undefined : form.absent
      }
      const value = Number(raw)
      return Number.isFinite(value) ? value + (form.offset ?? 0) : fallback
    }
    case 'attributeBool': {
      const raw = object.attrs[form.name]
      if (raw === undefined) return undefined
      return form.asInt === true ? raw !== '0' : raw === 'true'
    }
    case 'attributeEnum': {
      const raw = object.attrs[form.name]
      if (raw === undefined) return undefined
      const code = Number(raw)
      const match = Object.entries(form.values).find(([, value]) => value === code)
      return match?.[0] ?? fallback
    }
    case 'numberElement': {
      const element = object.children.find((c) => c.tag === form.name)
      if (!element) return undefined
      // `text` is what the player typed; `value` is the game's parse of it
      const raw = element.attrs.text ?? element.attrs.value
      const value = Number(raw)
      return Number.isFinite(value) ? value : fallback
    }
  }
}

/** Property values for one component, filling in defaults for anything absent. */
export function decodeProperties(
  def: ComponentDef,
  object: XmlNode,
): Record<string, PropertyValue> {
  const values = defaultProperties(def)
  for (const property of def.properties) {
    if (!property.xml) continue
    const decoded = decodeOne(property.xml, object, property.default)
    if (decoded !== undefined) values[property.key] = decoded
  }
  return values
}

export interface EncodedProperties {
  readonly attributes: Record<string, string>
  readonly elements: XmlNode[]
}

function encodeOne(
  property: PropertyDef,
  value: PropertyValue,
  into: { attributes: Record<string, string>; elements: XmlNode[] },
): void {
  const form = property.xml
  if (!form) return
  switch (form.form) {
    case 'attribute':
      into.attributes[form.name] = String(value)
      break
    case 'attributeNumber':
      into.attributes[form.name] = String(Number(value) - (form.offset ?? 0))
      break
    case 'attributeBool':
      into.attributes[form.name] =
        form.asInt === true ? (value === true ? '1' : '0') : value === true ? 'true' : 'false'
      break
    case 'attributeEnum':
      into.attributes[form.name] = String(form.values[String(value)] ?? 0)
      break
    case 'numberElement':
      into.elements.push(numberElement(form.name, Number(value)))
      break
  }
}

export function encodeProperties(
  def: ComponentDef,
  properties: Readonly<Record<string, PropertyValue>>,
): EncodedProperties {
  const into = { attributes: {} as Record<string, string>, elements: [] as XmlNode[] }
  for (const property of def.properties) {
    const value = properties[property.key]
    if (value === undefined) continue
    encodeOne(property, value, into)
  }
  return into
}

/** Attribute names a component's own properties occupy, so the rest can be preserved. */
export function propertyAttributeNames(def: ComponentDef): Set<string> {
  const names = new Set<string>()
  for (const property of def.properties) {
    if (property.xml && property.xml.form !== 'numberElement') names.add(property.xml.name)
  }
  return names
}
