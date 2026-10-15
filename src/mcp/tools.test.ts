// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { readExamples } from '../../scripts/gen-mcp-examples'
import { EXAMPLES } from './examples.generated'
import { CloudLibrary, FolderLibrary, libraryFromEnv, slugify } from './library'
import { createServer } from './server'
import {
  buildMicrocontroller,
  getMicrocontroller,
  listComponents,
  listMicrocontrollers,
  simulate,
  ToolError,
} from './tools'

const LIMITER = readFileSync(join(process.cwd(), 'recipes/throttle-limiter.yaml'), 'utf8')

let root: string
let library: FolderLibrary

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'swmc-mcp-'))
  library = new FolderLibrary(root, 'http://localhost:5173')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('examples', () => {
  it('match recipes/ (npm run gen:mcp-examples)', () => {
    expect(EXAMPLES).toEqual(readExamples(process.cwd()))
  })
})

describe('slugify', () => {
  it('matches the editor', () => {
    expect(slugify('Hybrid Full')).toBe('hybrid-full')
    expect(slugify('  ')).toBe('untitled')
    expect(slugify('x'.repeat(80))).toHaveLength(64)
  })
})

describe('libraryFromEnv', () => {
  it('uses the cloud with a token and a folder without', () => {
    expect(libraryFromEnv({ SWMC_TOKEN: 'swmc_x' }, root)).toBeInstanceOf(CloudLibrary)
    expect(libraryFromEnv({}, root)).toBeInstanceOf(FolderLibrary)
    expect(libraryFromEnv({ SWMC_TOKEN: 'swmc_x' }, root).editorUrl('a')).toBe(
      'https://swmc.example.com/?open=a',
    )
  })
})

describe('tools over a folder', () => {
  it('builds, lists, refuses to clobber, and replaces', async () => {
    const out = await buildMicrocontroller(library, { recipe: LIMITER })
    expect(out).toContain('as throttle-limiter')
    expect(out).toContain('http://localhost:5173/?open=throttle-limiter')
    expect(readFileSync(join(root, 'microcontrollers/throttle-limiter.xml'), 'utf8')).toContain(
      '<microprocessor',
    )
    expect(readFileSync(join(root, 'recipes/throttle-limiter.yaml'), 'utf8')).toBe(LIMITER)

    await expect(buildMicrocontroller(library, { recipe: LIMITER })).rejects.toThrow(/replace/)
    const again = await buildMicrocontroller(library, {
      recipe: LIMITER.replace('max: 0.75', 'max: 0.5'),
      replace: true,
    })
    expect(again).toContain('Saved')

    const list = await listMicrocontrollers(library)
    expect(list).toContain('throttle-limiter · "Throttle Limiter"')
    expect(list).toContain('· recipe')
  })

  it('reports recipe mistakes as tool errors', async () => {
    const bad = LIMITER.replace('arithmetic.clamp', 'arithmetic.nope')
    await expect(buildMicrocontroller(library, { recipe: bad })).rejects.toBeInstanceOf(ToolError)
    await expect(buildMicrocontroller(library, { recipe: bad })).rejects.toThrow(/unknown type/)
  })

  it('validates without saving', async () => {
    const out = await buildMicrocontroller(library, { recipe: LIMITER, save: false })
    expect(out).toContain('Not saved')
    expect(await library.list()).toEqual([])
  })

  it('returns the saved recipe, or reads one back from edited XML', async () => {
    await buildMicrocontroller(library, { recipe: LIMITER })
    expect(await getMicrocontroller(library, { slug: 'throttle-limiter' })).toContain(
      'the recipe it was built from',
    )
    // The editor saving the XML later makes the recipe stale.
    const later = new Date(Date.now() + 60_000)
    utimesSync(join(root, 'microcontrollers/throttle-limiter.xml'), later, later)
    const read = await getMicrocontroller(library, { slug: 'throttle-limiter' })
    expect(read).toContain('read back from the XML')
    expect(read).toContain('- { from: throttle_in, to: clamp_1 }')
  })

  it('simulates phases on one simulation', async () => {
    const out = await simulate(library, {
      recipe: LIMITER,
      phases: [
        { ticks: 1, set: { throttle_in: 1 } },
        { ticks: 1, set: { 'Throttle In': 0.25 } },
      ],
    })
    expect(out).toMatch(/phase 1, t=1[\s\S]*throttle_out "Throttle Out"\s+1\.5/)
    expect(out).toMatch(/phase 2, t=2[\s\S]*throttle_out "Throttle Out"\s+0\.5/)
    await expect(
      simulate(library, { recipe: LIMITER, phases: [{ ticks: 1, set: { nope: 1 } }] }),
    ).rejects.toThrow(/no pin "nope"/)
  })

  it('runs Lua', async () => {
    const recipe = `
name: Lua Double
pins:
  - { id: data_in, dir: in, signal: composite }
  - { id: data_out, dir: out, signal: composite }
nodes:
  - id: ctrl
    type: data.luaScript
    script: |
      function onTick() output.setNumber(1, input.getNumber(2) * 2) end
wires:
  - { from: data_in, to: ctrl.composite }
  - { from: ctrl.composite, to: data_out }
`
    const out = await simulate(library, { recipe, phases: [{ ticks: 3, set: { data_in: 0.3 } }] })
    expect(out).toMatch(/data_out\s+composite n1=0\.6/)
  }, 30_000)

  it('filters the catalogue', () => {
    const out = listComponents({ query: 'pid' })
    expect(out).toContain('arithmetic.pid')
    expect(out).toContain('process-variable:number')
    expect(listComponents({ query: 'zzzz' })).toContain('No components match')
  })
})

describe('CloudLibrary', () => {
  it('talks to the library API with the token', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fake: typeof fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith('/recipe')) return new Response('{}', { status: 404 })
      if (init.method === 'PUT') {
        return Response.json({ id: 'throttle-limiter', name: 'Throttle Limiter' })
      }
      return new Response('not found', { status: 404 })
    }
    const cloud = new CloudLibrary('https://api.test/', 'swmc_abc', 'https://ui.test', fake)
    const out = await buildMicrocontroller(cloud, { recipe: LIMITER })
    expect(out).toContain('https://ui.test/?open=throttle-limiter')
    const put = calls.find((c) => c.init.method === 'PUT')!
    expect(put.url).toBe('https://api.test/microcontrollers/throttle-limiter')
    expect(new Headers(put.init.headers).get('Authorization')).toBe('Bearer swmc_abc')
    const body = JSON.parse(String(put.init.body)) as { xml: string; recipe: string }
    expect(body.recipe).toBe(LIMITER)
    expect(body.xml).toContain('<microprocessor')
  })

  it('saves readable Lua, since the editor opens what it saved', async () => {
    const hybrid = readFileSync(join(process.cwd(), 'recipes/hybrid-full.yaml'), 'utf8')
    let xml = ''
    const fake: typeof fetch = async (_url, init = {}) => {
      if (init.method === 'PUT') {
        xml = (JSON.parse(String(init.body)) as { xml: string }).xml
        return Response.json({ id: 'hybrid-full', name: 'Hybrid Full' })
      }
      return new Response('not found', { status: 404 })
    }
    const cloud = new CloudLibrary('https://api.test', 'swmc_abc', 'https://ui.test', fake)
    await buildMicrocontroller(cloud, { recipe: hybrid })
    expect(xml).toContain('drive_cl')

    // The folder is the game file, minified like `mc build`
    await buildMicrocontroller(library, { recipe: hybrid, slug: 'hybrid-full' })
    expect(readFileSync(join(root, 'microcontrollers/hybrid-full.xml'), 'utf8')).not.toContain(
      'drive_cl',
    )
  })

  it('explains a rejected token', async () => {
    const fake: typeof fetch = async () => new Response('{}', { status: 401 })
    const cloud = new CloudLibrary('https://api.test', 'swmc_old', 'https://ui.test', fake)
    await expect(cloud.list()).rejects.toThrow(/Agent access/)
  })
})

describe('MCP server', () => {
  it('lists tools and answers a call', async () => {
    const server = createServer(library)
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(b)

    expect(client.getInstructions()).toContain('Never write Stormworks XML by hand')
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'build_microcontroller',
      'delete_microcontroller',
      'example_recipe',
      'get_microcontroller',
      'guide',
      'list_components',
      'list_microcontrollers',
      'simulate',
    ])

    const built = await client.callTool({
      name: 'build_microcontroller',
      arguments: { recipe: LIMITER },
    })
    expect(built.isError).toBeFalsy()
    const failed = await client.callTool({
      name: 'build_microcontroller',
      arguments: { recipe: LIMITER },
    })
    expect(failed.isError).toBe(true)
    await client.close()
  })
})
