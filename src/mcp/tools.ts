/**
 * The MCP tools, as plain functions over a `Library`. `server.ts` wires them
 * to the protocol; the tests call them directly.
 */
import { cwd } from 'node:process'
import {
  parseMicrocontroller,
  serializeMicrocontroller,
  withMinifiedLua,
} from '@/io/microcontroller'
import { formatSignal } from '@/sim/format'
import type { Microcontroller, NodeId } from '@/model/types'
import { buildRecipe, type BuildResult } from '@/recipe/build'
import { componentCatalog, type CatalogComponent } from '@/recipe/catalog'
import { decompile, recipeYaml } from '@/recipe/decompile'
import { loadRecipeFile, loadRecipeText, type LoadedRecipe } from '@/recipe/files'
import { withLua } from '@/recipe/lua'
import { runScenario, type SimPhase, type SimResult } from '@/recipe/run'
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

/** Where a recipe comes from: its text, or a file on this machine. */
export interface RecipeSource {
  readonly recipe?: string | undefined
  /** Read by this process. Relative paths are from its working directory. */
  readonly recipe_path?: string | undefined
}

/**
 * The recipe's text with any `script_file` read in, from `recipe` (whose
 * script files are relative to the working directory) or `recipe_path`
 * (relative to the recipe's folder). Null when neither is given.
 */
function loadSource(input: RecipeSource): LoadedRecipe | null {
  if (input.recipe !== undefined && input.recipe_path !== undefined) {
    throw new ToolError('pass recipe or recipe_path, not both')
  }
  let loaded
  if (input.recipe_path !== undefined) {
    loaded = loadRecipeFile(input.recipe_path)
  } else if (input.recipe !== undefined) {
    const format = input.recipe.trimStart().startsWith('{') ? 'json' : 'yaml'
    loaded = loadRecipeText(input.recipe, format, cwd())
  } else {
    return null
  }
  if (!loaded.ok) throw new ToolError(`recipe: ${loaded.error}`)
  return loaded.value
}

function build(recipe: LoadedRecipe): BuildResult {
  const built = buildRecipe(recipe.recipe)
  if (!built.ok) throw new ToolError(`recipe: ${built.error}`)
  return built.value
}

function parseAndBuild(recipe: string): BuildResult {
  const loaded = loadSource({ recipe })
  if (!loaded) throw new ToolError('pass a recipe')
  return build(loaded)
}

const hasLua = (doc: Microcontroller) => doc.nodes.some((n) => n.type === 'data.luaScript')

interface PhaseRun {
  readonly steps: readonly SimResult[]
  readonly errors: ReadonlyMap<NodeId, string>
}

async function runPhases(
  doc: Microcontroller,
  phases: readonly SimPhase[],
  ids?: ReadonlyMap<string, NodeId>,
): Promise<PhaseRun> {
  const run = await withLua(doc, () => runScenario(doc, phases, ids))
  if (!run.result.ok) throw new ToolError(run.result.error)
  return { steps: run.result.value, errors: run.errors }
}

/**
 * Where the readable run and the minified one part ways, or null when they
 * agree. The game runs the minified script, so a difference is a minifier bug
 * the readable run cannot show.
 */
function minifiedDifference(readable: PhaseRun, minified: PhaseRun): string | null {
  for (const [node, error] of minified.errors) {
    if (!readable.errors.has(node)) return `the minified ${node} fails: ${error}`
  }
  for (let i = 0; i < readable.steps.length; i++) {
    const a = readable.steps[i]!
    const b = minified.steps[i]
    for (const pin of a.pins) {
      const other = b?.pins.find((p) => p.id === pin.id)
      if (JSON.stringify(other?.value) === JSON.stringify(pin.value)) continue
      const shown = (v: SimResult['pins'][number]['value']) =>
        v === undefined ? '—' : formatValue(v)
      return `at the end of phase ${i + 1}, ${pin.id} is ${shown(pin.value)} as written but ${shown(other?.value)} minified`
    }
  }
  return null
}

const MINIFY_WARNING =
  'warning: the minified Lua (what the export and the game run) does not behave like the script as written'

/** A short run with every input at rest, both ways, for build to check. */
async function checkMinified(built: BuildResult): Promise<string | null> {
  if (!hasLua(built.doc)) return null
  const phases: SimPhase[] = [{ ticks: 120, set: {} }]
  const readable = await runPhases(built.doc, phases, built.ids)
  const minified = await runPhases(withMinifiedLua(built.doc), phases, built.ids)
  const difference = minifiedDifference(readable, minified)
  return difference ? `${MINIFY_WARNING}: ${difference}. Run simulate with minified: true.` : null
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

export interface BuildInput extends RecipeSource {
  readonly slug?: string | undefined
  readonly replace?: boolean | undefined
  readonly save?: boolean | undefined
}

export async function buildMicrocontroller(library: Library, input: BuildInput): Promise<string> {
  const loaded = loadSource(input)
  if (!loaded) throw new ToolError('pass a recipe or a recipe_path')
  const built = build(loaded)
  // The cloud library is what the editor opens, so it gets the readable Lua
  const xml = serializeMicrocontroller(built.doc, { minifyLua: !library.readableLua })
  const components = built.doc.nodes.filter((n) => !n.type.startsWith('io.')).length
  const lines: string[] = []
  const warnings = built.warnings.map((w) => `warning: ${w}`)
  const minifyWarning = await checkMinified(built)
  if (minifyWarning) warnings.push(minifyWarning)

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
    await library.put(slug, xml, loaded.text)
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

export interface SimulateInput extends RecipeSource {
  readonly slug?: string | undefined
  /** Run the Lua as the export minifies it, which is what the game runs. */
  readonly minified?: boolean | undefined
  readonly phases: readonly {
    readonly ticks: number
    readonly set?: Readonly<Record<string, string | number | boolean>> | undefined
  }[]
}

export async function simulate(library: Library, input: SimulateInput): Promise<string> {
  let doc: Microcontroller
  let ids: ReadonlyMap<string, NodeId> | undefined
  const notes: string[] = []
  const loaded = loadSource(input)
  if (loaded) {
    const built = build(loaded)
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
    throw new ToolError('pass a recipe, a recipe_path or a slug')
  }
  if (input.phases.length === 0) throw new ToolError('pass at least one phase')

  const phases: SimPhase[] = input.phases.map((p) => ({
    ticks: Math.max(0, Math.min(100_000, Math.round(p.ticks))),
    set: Object.fromEntries(Object.entries(p.set ?? {}).map(([k, v]) => [k, String(v)])),
  }))
  const readable = await runPhases(doc, phases, ids)
  const minified = hasLua(doc) ? await runPhases(withMinifiedLua(doc), phases, ids) : readable
  const run = input.minified === true ? minified : readable
  for (const [node, error] of run.errors) notes.push(`lua error in ${node}: ${error}`)
  if (input.minified === true && hasLua(doc)) notes.push('Lua ran minified, as the game runs it.')
  const difference = minifiedDifference(readable, minified)
  if (difference) notes.push(`${MINIFY_WARNING}: ${difference}.`)

  const blocks = run.steps.map((step, i) => {
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
  readonly as?: 'recipe' | 'saved_recipe' | 'xml' | 'export' | undefined
}

export async function getMicrocontroller(library: Library, input: GetInput): Promise<string> {
  const stored = await library.get(input.slug)
  if (!stored) throw new ToolError(`no microcontroller "${input.slug}" in ${library.where}`)
  const url = library.editorUrl(input.slug)
  const as = input.as ?? 'recipe'
  if (as === 'xml') return stored.xml
  if (as === 'export') {
    // What the editor's export writes, scripts minified: the file the game loads
    const parsed = parseMicrocontroller(stored.xml)
    if (!parsed.ok) throw new ToolError(`${input.slug}: ${parsed.error}`)
    return serializeMicrocontroller(parsed.value, { minifyLua: true })
  }
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
