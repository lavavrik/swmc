/**
 * The MCP tools, as plain functions over a `Library`. `server.ts` wires them
 * to the protocol; the tests call them directly.
 */
import { parseMicrocontroller, serializeMicrocontroller } from '@/io/microcontroller'
import { formatSignal } from '@/sim/format'
import type { Microcontroller, NodeId } from '@/model/types'
import { buildRecipe, type BuildResult } from '@/recipe/build'
import { componentCatalog, type CatalogComponent } from '@/recipe/catalog'
import { decompile, recipeYaml } from '@/recipe/decompile'
import { withLua } from '@/recipe/lua'
import { parseRecipeText } from '@/recipe/parse'
import { runScenario, type SimPhase } from '@/recipe/run'
import { EXAMPLES } from './examples.generated'
import { GUIDE } from './guide'
import { SLUG, slugify, type Library } from './library'

/** Thrown for a mistake the agent can fix; the server returns it as a tool error. */
export class ToolError extends Error {}

export function guide(): string {
  const list = EXAMPLES.map((e) => `- ${e.name}`).join('\n')
  return `${GUIDE}\n## Examples\n\nCall example_recipe with one of:\n${list}\n`
}

export function exampleRecipe(name: string): string {
  const example = EXAMPLES.find((e) => e.name === name)
  if (!example) {
    throw new ToolError(`no example "${name}". Examples: ${EXAMPLES.map((e) => e.name).join(', ')}`)
  }
  const notes = example.notes ? `\n\n# Vehicle wiring notes\n\n${example.notes}` : ''
  return `${example.recipe}${notes}`
}

export interface ComponentQuery {
  readonly query?: string | undefined
  readonly category?: string | undefined
  readonly detail?: boolean | undefined
}

export function listComponents({ query, category, detail }: ComponentQuery): string {
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const matches = componentCatalog().filter((c) => {
    if (category && c.category !== category) return false
    const text = `${c.id} ${c.name} ${c.description}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
  if (matches.length === 0) {
    const categories = [...new Set(componentCatalog().map((c) => c.category))].join(', ')
    return `No components match. Categories: ${categories}`
  }
  if (detail) return JSON.stringify(matches, null, 2)
  return matches.map(compactComponent).join('\n')
}

function compactComponent(c: CatalogComponent): string {
  const ports = (list: CatalogComponent['inputs']) =>
    list.map((p) => `${p.slug}:${p.signal}`).join(', ')
  const props = c.properties
    .map((p) => {
      const options = p.options ? `=${p.options.join('|')}` : ''
      return `${p.key}(${p.kind}${options}, default ${JSON.stringify(p.default)})`
    })
    .join(', ')
  const lines = [`${c.id} — ${c.name}: ${c.description}`]
  if (c.inputs.length > 0) lines.push(`  in:  ${ports(c.inputs)}`)
  if (c.outputs.length > 0) lines.push(`  out: ${ports(c.outputs)}`)
  if (props) lines.push(`  props: ${props}`)
  return lines.join('\n')
}

function parseAndBuild(recipe: string): BuildResult {
  const text = recipe.trim()
  const format = text.startsWith('{') ? 'json' : 'yaml'
  const parsed = parseRecipeText(text, format)
  if (!parsed.ok) throw new ToolError(`recipe: ${parsed.error}`)
  const built = buildRecipe(parsed.value)
  if (!built.ok) throw new ToolError(`recipe: ${built.error}`)
  return built.value
}

function pinSummary(doc: Microcontroller, ids?: ReadonlyMap<string, NodeId>): string {
  const reverse = new Map<NodeId, string>()
  if (ids) for (const [name, id] of ids) reverse.set(id, name)
  return doc.ioOrder
    .map((id) => {
      const node = doc.nodes.find((n) => n.id === id)
      if (!node) return ''
      const [, dir, signal] = node.type.split('.')
      const label = String(node.properties.label ?? '')
      const name = reverse.get(id) ?? label
      return `  ${dir} ${name} (${signal}${label && label !== name ? `, "${label}"` : ''})`
    })
    .filter(Boolean)
    .join('\n')
}

export interface BuildInput {
  readonly recipe: string
  readonly slug?: string | undefined
  readonly replace?: boolean | undefined
  readonly save?: boolean | undefined
}

export async function buildMicrocontroller(library: Library, input: BuildInput): Promise<string> {
  const built = parseAndBuild(input.recipe)
  // The cloud library is what the editor opens, so it gets the readable Lua
  const xml = serializeMicrocontroller(built.doc, { minifyLua: !library.readableLua })
  const components = built.doc.nodes.filter((n) => !n.type.startsWith('io.')).length
  const lines: string[] = []
  const warnings = built.warnings.map((w) => `warning: ${w}`)

  if (input.save === false) {
    lines.push(`Recipe OK: "${built.doc.meta.name}", ${components} components. Not saved.`)
  } else {
    const slug = input.slug ?? slugify(built.doc.meta.name)
    if (!SLUG.test(slug)) {
      throw new ToolError(`slug "${slug}" must be lowercase letters, digits and hyphens (≤64)`)
    }
    if (input.replace !== true && (await library.get(slug))) {
      throw new ToolError(
        `"${slug}" already exists in ${library.where}. To update it, call again with replace: true (fetch it first with get_microcontroller if you have not). To keep both, pass a different slug.`,
      )
    }
    await library.put(slug, xml, input.recipe)
    lines.push(`Saved "${built.doc.meta.name}" as ${slug} in ${library.where}.`)
    lines.push(`Open in the editor: ${library.editorUrl(slug)}`)
    lines.push(
      `${components} components, ${built.doc.ioOrder.length} pins, ${built.doc.wires.length} wires.`,
    )
    if (slug !== slugify(built.doc.meta.name)) {
      warnings.unshift(
        `warning: the editor saves by name, so saving this there writes ${slugify(built.doc.meta.name)}, not ${slug}. Keep the slug equal to the slugified name unless the user wants a copy.`,
      )
    }
  }
  lines.push(`Pins:\n${pinSummary(built.doc, built.ids)}`)
  return [...lines, ...warnings].join('\n')
}

export interface SimulateInput {
  readonly recipe?: string | undefined
  readonly slug?: string | undefined
  readonly phases: readonly {
    readonly ticks: number
    readonly set?: Readonly<Record<string, string | number | boolean>> | undefined
  }[]
}

export async function simulate(library: Library, input: SimulateInput): Promise<string> {
  let doc: Microcontroller
  let ids: ReadonlyMap<string, NodeId> | undefined
  const notes: string[] = []
  if (input.recipe !== undefined) {
    const built = parseAndBuild(input.recipe)
    doc = built.doc
    ids = built.ids
  } else if (input.slug !== undefined) {
    const stored = await library.get(input.slug)
    if (!stored) throw new ToolError(`no microcontroller "${input.slug}" in ${library.where}`)
    if (stored.recipe !== undefined && stored.recipeStale !== true) {
      const built = parseAndBuild(stored.recipe)
      doc = built.doc
      ids = built.ids
    } else {
      const parsed = parseMicrocontroller(stored.xml)
      if (!parsed.ok) throw new ToolError(`${input.slug}: ${parsed.error}`)
      doc = parsed.value
    }
  } else {
    throw new ToolError('pass a recipe or a slug')
  }
  if (input.phases.length === 0) throw new ToolError('pass at least one phase')

  const phases: SimPhase[] = input.phases.map((p) => ({
    ticks: Math.max(0, Math.min(100_000, Math.round(p.ticks))),
    set: Object.fromEntries(Object.entries(p.set ?? {}).map(([k, v]) => [k, String(v)])),
  }))
  const run = await withLua(doc, () => runScenario(doc, phases, ids))
  if (!run.result.ok) throw new ToolError(run.result.error)
  for (const [node, error] of run.errors) notes.push(`lua error in ${node}: ${error}`)

  const blocks = run.result.value.map((step, i) => {
    const rows = step.pins.map((pin) => {
      const name = pin.id === pin.label || !pin.label ? pin.id : `${pin.id} "${pin.label}"`
      const value = pin.value === undefined ? '—' : formatValue(pin.value)
      return `  ${pin.direction.padEnd(3)} ${name.padEnd(28)} ${value}`
    })
    return [`phase ${i + 1}, t=${step.ticks}`, ...rows].join('\n')
  })
  return [...blocks, ...notes].join('\n\n')
}

function formatValue(value: Parameters<typeof formatSignal>[0]): string {
  if (typeof value === 'object' && value !== null && 'numbers' in value) {
    const numbers = value.numbers
      .map((n, i) => (n !== 0 ? `n${i + 1}=${+n.toFixed(4)}` : ''))
      .filter(Boolean)
    const bools = value.bools.map((b, i) => (b ? `b${i + 1}` : '')).filter(Boolean)
    const parts = [...numbers, ...bools]
    return parts.length > 0 ? `composite ${parts.join(' ')}` : 'composite (empty)'
  }
  if (typeof value === 'number') return String(+value.toFixed(6))
  return formatSignal(value)
}

export async function listMicrocontrollers(library: Library): Promise<string> {
  const entries = await library.list()
  if (entries.length === 0) return `Nothing saved yet in ${library.where}.`
  const rows = entries.map((e) => {
    const when = e.updatedAt
      ? new Date(e.updatedAt).toISOString().slice(0, 16).replace('T', ' ')
      : ''
    const recipe = e.hasRecipe ? (e.recipeStale ? 'recipe (edited since)' : 'recipe') : 'xml only'
    const parts = [e.slug, `"${e.name}"`, when, `${e.componentCount ?? '?'} components`, recipe]
    return `- ${parts.filter(Boolean).join(' · ')}${e.description ? `\n  ${e.description}` : ''}`
  })
  return `${entries.length} in ${library.where}:\n${rows.join('\n')}`
}

export interface GetInput {
  readonly slug: string
  readonly as?: 'recipe' | 'saved_recipe' | 'xml' | undefined
}

export async function getMicrocontroller(library: Library, input: GetInput): Promise<string> {
  const stored = await library.get(input.slug)
  if (!stored) throw new ToolError(`no microcontroller "${input.slug}" in ${library.where}`)
  const url = library.editorUrl(input.slug)
  const as = input.as ?? 'recipe'
  if (as === 'xml') return stored.xml
  if (as === 'saved_recipe') {
    if (stored.recipe === undefined) throw new ToolError(`"${input.slug}" has no saved recipe`)
    return stored.recipe
  }
  if (stored.recipe !== undefined && stored.recipeStale !== true) {
    return `# ${input.slug} — the recipe it was built from. Editor: ${url}\n${stored.recipe}`
  }
  const parsed = parseMicrocontroller(stored.xml)
  if (!parsed.ok) throw new ToolError(`${input.slug}: ${parsed.error}`)
  const recipe = decompile(parsed.value)
  if (!recipe.ok) {
    throw new ToolError(`${input.slug}: ${recipe.error}. Use as: "xml" to read it.`)
  }
  const why =
    stored.recipe !== undefined
      ? 'It was edited in the editor after its recipe was saved, so this is read back from the XML (as: "saved_recipe" has the older recipe with its original names).'
      : 'It has no saved recipe, so this is read back from the XML.'
  return `# ${input.slug}. ${why} Node names are generic; positions are kept. Editor: ${url}\n${recipeYaml(recipe.value)}`
}

export async function deleteMicrocontroller(library: Library, slug: string): Promise<string> {
  const gone = await library.delete(slug)
  if (!gone) throw new ToolError(`no microcontroller "${slug}" in ${library.where}`)
  return `Deleted ${slug} from ${library.where}.`
}
