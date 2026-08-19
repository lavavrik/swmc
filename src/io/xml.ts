/**
 * A minimal ordered XML tree, and conversion to and from text.
 *
 * The rest of the codec works on this shape rather than on the parser's own
 * representation, so swapping the parser out would touch only this file.
 */
import { XMLBuilder, XMLParser } from 'fast-xml-parser'

export interface XmlNode {
  readonly tag: string
  readonly attrs: Record<string, string>
  readonly children: XmlNode[]
}

export const node = (
  tag: string,
  attrs: Record<string, string> = {},
  children: XmlNode[] = [],
): XmlNode => ({ tag, attrs, children })

const ATTRS_KEY = ':@'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
})

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  suppressEmptyNode: true,
  format: true,
  indentBy: '\t',
  processEntities: true,
})

type RawNode = Record<string, unknown>

function toXmlNodes(raw: unknown): XmlNode[] {
  if (!Array.isArray(raw)) return []
  const out: XmlNode[] = []
  for (const entry of raw as RawNode[]) {
    const tag = Object.keys(entry).find((key) => key !== ATTRS_KEY)
    if (tag === undefined || tag === '#text' || tag === '?xml') continue
    const attrs = (entry[ATTRS_KEY] as Record<string, unknown> | undefined) ?? {}
    out.push({
      tag,
      attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])),
      children: toXmlNodes(entry[tag]),
    })
  }
  return out
}

function fromXmlNodes(nodes: readonly XmlNode[]): RawNode[] {
  return nodes.map((n) => {
    const entry: RawNode = { [n.tag]: fromXmlNodes(n.children) }
    if (Object.keys(n.attrs).length > 0) entry[ATTRS_KEY] = n.attrs
    return entry
  })
}

export function parseXml(text: string): XmlNode[] {
  return toXmlNodes(parser.parse(text))
}

export function buildXml(root: XmlNode): string {
  const body = builder.build(fromXmlNodes([root])) as string
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body.trimEnd()}\n`
}

export const childrenNamed = (parent: XmlNode | undefined, tag: string): XmlNode[] =>
  parent?.children.filter((c) => c.tag === tag) ?? []

export const firstChild = (parent: XmlNode | undefined, tag: string): XmlNode | undefined =>
  parent?.children.find((c) => c.tag === tag)

export const attrNumber = (n: XmlNode, name: string, fallback = 0): number => {
  const value = Number(n.attrs[name])
  return Number.isFinite(value) ? value : fallback
}
