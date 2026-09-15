/**
 * Command-line handle for recipes: catalogue, build XML, tick pins.
 *
 *     npm run mc -- catalog
 *     npm run mc -- build recipes/hybrid-car.yaml --open
 *     npm run mc -- sim recipes/hybrid-car.yaml --set ignition=on --set engine_rps=0
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, resolve } from 'node:path'
import { argv, env, exit, platform, stderr, stdout } from 'node:process'
import { parseMicrocontroller, serializeMicrocontroller } from '@/io/microcontroller'
import { buildRecipe } from './build'
import { componentCatalog } from './catalog'
import { formatFromPath, parseRecipeText } from './parse'
import { formatSimResult, runSim } from './run'
import { startTelemServer } from './telem'

const USAGE = `Usage:
  npm run mc -- catalog [--json] [--all]
  npm run mc -- build <recipe> [-o path|-] [--open]
  npm run mc -- open <slug-or-xml>
  npm run mc -- sim <recipe-or-xml> [--ticks N] [--set pin=value]... [--json]
  npm run mc -- telem [--port N]`

function main(args: string[]): number {
  const cmd = args[0]
  if (!cmd || cmd === '-h' || cmd === '--help') {
    stdout.write(`${USAGE}\n`)
    return cmd ? 0 : 1
  }

  try {
    if (cmd === 'catalog') return catalogCmd(args.slice(1))
    if (cmd === 'build') return buildCmd(args.slice(1))
    if (cmd === 'open') return openCmd(args.slice(1))
    if (cmd === 'sim') return simCmd(args.slice(1))
    stderr.write(`unknown command "${cmd}"\n${USAGE}\n`)
    return 1
  } catch (cause) {
    stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
    return 1
  }
}

function catalogCmd(args: string[]): number {
  const flags = parseFlags(args)
  const catalog = componentCatalog({ all: flags.has('all') })
  if (flags.has('json')) {
    stdout.write(`${JSON.stringify(catalog, null, 2)}\n`)
    return 0
  }
  for (const c of catalog) {
    const ins = c.inputs.map((p) => p.slug).join(', ')
    const outs = c.outputs.map((p) => p.slug).join(', ')
    const props = c.properties.map((p) => p.key).join(', ')
    stdout.write(`${c.id}\n`)
    stdout.write(`  ${c.name} — ${c.description}\n`)
    if (ins) stdout.write(`  in  ${ins}\n`)
    if (outs) stdout.write(`  out ${outs}\n`)
    if (props) stdout.write(`  ${props}\n`)
  }
  return 0
}

function buildCmd(args: string[]): number {
  const flags = parseFlags(args)
  const file = flags.rest[0]
  if (!file) {
    stderr.write(`build needs a recipe file\n${USAGE}\n`)
    return 1
  }
  const built = loadRecipe(file)
  for (const warning of built.warnings) stderr.write(`warning: ${warning}\n`)
  const xml = serializeMicrocontroller(built.doc)
  const out = flags.get('o') ?? flags.get('out')
  if (out === '-') {
    stdout.write(xml)
    if (!xml.endsWith('\n')) stdout.write('\n')
    return 0
  }
  const dest = resolve(out ?? `microcontrollers/${fileSlug(built.doc.meta.name)}.xml`)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, xml.endsWith('\n') ? xml : `${xml}\n`)
  stdout.write(`${dest}\n`)
  if (flags.has('open')) return openInEditor(basename(dest, '.xml'))
  stdout.write(`${editorUrl(basename(dest, '.xml'))}\n`)
  return 0
}

function openCmd(args: string[]): number {
  const file = parseFlags(args).rest[0]
  if (!file) {
    stderr.write(`open needs a slug or xml file\n${USAGE}\n`)
    return 1
  }
  return openInEditor(basename(file, '.xml'))
}

function editorUrl(slug: string): string {
  const base = (env.SWMC_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  return `${base}/?open=${encodeURIComponent(slug)}`
}

function openInEditor(slug: string): number {
  const url = editorUrl(slug)
  stdout.write(`${url}\n`)
  if (platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  else if (platform === 'win32')
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  return 0
}

function simCmd(args: string[]): number {
  const flags = parseFlags(args)
  const file = flags.rest[0]
  if (!file) {
    stderr.write(`sim needs a recipe or xml file\n${USAGE}\n`)
    return 1
  }
  const ticks = Number(flags.get('ticks') ?? 1)
  if (!Number.isFinite(ticks) || ticks < 0) {
    stderr.write('--ticks must be a number\n')
    return 1
  }
  const sets: Record<string, string> = {}
  for (const value of flags.multi('set')) {
    const eq = value.indexOf('=')
    if (eq < 1) {
      stderr.write(`--set needs pin=value, got "${value}"\n`)
      return 1
    }
    sets[value.slice(0, eq)] = value.slice(eq + 1)
  }

  const path = resolve(file)
  const text = readFileSync(path, 'utf8')
  const isXml = extname(path).toLowerCase() === '.xml' || text.trimStart().startsWith('<')
  let result
  if (isXml) {
    const parsed = parseMicrocontroller(text)
    if (!parsed.ok) {
      stderr.write(`${parsed.error}\n`)
      return 1
    }
    result = runSim(parsed.value, ticks, sets)
  } else {
    const built = loadRecipe(file)
    for (const warning of built.warnings) stderr.write(`warning: ${warning}\n`)
    result = runSim(built.doc, ticks, sets, built.ids)
  }
  if (!result.ok) {
    stderr.write(`${result.error}\n`)
    return 1
  }
  if (flags.has('json')) stdout.write(`${JSON.stringify(result.value, null, 2)}\n`)
  else stdout.write(`${formatSimResult(result.value)}\n`)
  return 0
}

function telemCmd(args: string[]): number {
  const flags = parseFlags(args)
  const port = Number(flags.get('port') ?? 8787)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    stderr.write('--port must be 1..65535\n')
    return 1
  }
  startTelemServer(port)
  return 0
}

function loadRecipe(file: string) {
  const path = resolve(file)
  const parsed = parseRecipeText(readFileSync(path, 'utf8'), formatFromPath(path))
  if (!parsed.ok) throw new Error(parsed.error)
  const built = buildRecipe(parsed.value)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** Same slug the editor uses when it saves a project (`src/io/library.ts`). */
function fileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug.length > 0 ? slug : 'untitled'
}

function parseFlags(args: string[]): {
  has(name: string): boolean
  get(name: string): string | undefined
  multi(name: string): string[]
  rest: string[]
} {
  const bools = new Set<string>()
  const singles = new Map<string, string>()
  const lists = new Map<string, string[]>()
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') {
      rest.push(...args.slice(i + 1))
      break
    }
    if (!arg.startsWith('-')) {
      rest.push(arg)
      continue
    }
    const name = arg.replace(/^--?/, '')
    const next = args[i + 1]
    if (name === 'json' || name === 'all' || name === 'open') {
      bools.add(name)
      continue
    }
    if (next === undefined || next.startsWith('-')) {
      bools.add(name)
      continue
    }
    i++
    if (name === 'set') {
      const list = lists.get(name) ?? []
      list.push(next)
      lists.set(name, list)
    } else {
      singles.set(name, next)
    }
  }
  return {
    has: (name) => bools.has(name),
    get: (name) => singles.get(name),
    multi: (name) => lists.get(name) ?? [],
    rest,
  }
}

const args = argv.slice(2)
if (args[0] === 'telem') {
  try {
    const code = telemCmd(args.slice(1))
    if (code !== 0) exit(code)
  } catch (cause) {
    stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
    exit(1)
  }
} else {
  exit(main(args))
}
