/**
 * Where the MCP server keeps what it builds.
 *
 * With a token it is the signed-in cloud library behind the hosted editor —
 * the same rows the Open dialog lists. Without one it is a checkout of this
 * repository: `microcontrollers/<slug>.xml` beside `recipes/<slug>.yaml`,
 * which `npm run dev` serves at `/?open=<slug>`.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { HOSTED_API, HOSTED_EDITOR, LOCAL_EDITOR } from './hosted'

export interface Entry {
  readonly slug: string
  readonly name: string
  readonly description?: string
  readonly updatedAt?: number
  readonly componentCount?: number
  readonly hasRecipe?: boolean
  /** The XML was saved (in the editor) after the recipe. */
  readonly recipeStale?: boolean
}

export interface Stored {
  readonly xml: string
  readonly recipe?: string
  readonly recipeStale?: boolean
}

export interface Library {
  /** Shown to the agent: where saves go. */
  readonly where: string
  list(): Promise<Entry[]>
  get(slug: string): Promise<Stored | null>
  put(slug: string, xml: string, recipe?: string): Promise<Entry>
  delete(slug: string): Promise<boolean>
  editorUrl(slug: string): string
}

/** Same slug the editor and the library use: lowercase, digits, hyphens. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
    .replace(/-$/, '')
  return slug.length > 0 ? slug : 'untitled'
}

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

function editorLink(base: string, slug: string): string {
  return `${base.replace(/\/$/, '')}/?open=${encodeURIComponent(slug)}`
}

export class CloudLibrary implements Library {
  readonly where: string

  constructor(
    private readonly api: string,
    private readonly token: string,
    private readonly editor: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.api = api.replace(/\/$/, '')
    this.where = `your cloud library at ${this.editor}`
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    let res: Response
    try {
      res = await this.fetcher(`${this.api}${path}`, { ...init, headers })
    } catch (cause) {
      throw new Error(`cannot reach the swmc library at ${this.api}: ${String(cause)}`)
    }
    if (res.status === 401) {
      throw new Error(
        'the swmc library refused SWMC_TOKEN. Create a new token in the editor (account menu → Agent access) and update the MCP config.',
      )
    }
    return res
  }

  private async fail(res: Response, what: string): Promise<never> {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`${what} failed (${res.status}${body.error ? `: ${body.error}` : ''})`)
  }

  async list(): Promise<Entry[]> {
    const res = await this.call('/microcontrollers', { headers: { Accept: 'application/json' } })
    if (!res.ok) return this.fail(res, 'list')
    const rows = (await res.json()) as (Omit<Entry, 'slug'> & { id: string })[]
    return rows.map(({ id, ...rest }) => ({ slug: id, ...rest }))
  }

  async get(slug: string): Promise<Stored | null> {
    const res = await this.call(`/microcontrollers/${encodeURIComponent(slug)}`)
    if (res.status === 404) return null
    if (!res.ok) return this.fail(res, 'load')
    const xml = await res.text()
    const rec = await this.call(`/microcontrollers/${encodeURIComponent(slug)}/recipe`, {
      headers: { Accept: 'application/json' },
    })
    if (rec.status === 404) return { xml }
    if (!rec.ok) return this.fail(rec, 'load recipe')
    const body = (await rec.json()) as { recipe: string; recipeStale?: boolean }
    return { xml, recipe: body.recipe, recipeStale: body.recipeStale === true }
  }

  async put(slug: string, xml: string, recipe?: string): Promise<Entry> {
    const res = await this.call(`/microcontrollers/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(recipe === undefined ? { xml } : { xml, recipe }),
    })
    if (!res.ok) return this.fail(res, 'save')
    const { id, ...rest } = (await res.json()) as Omit<Entry, 'slug'> & { id: string }
    return { slug: id, ...rest }
  }

  async delete(slug: string): Promise<boolean> {
    const res = await this.call(`/microcontrollers/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    })
    if (res.status === 404) return false
    if (!res.ok) return this.fail(res, 'delete')
    return true
  }

  editorUrl(slug: string): string {
    return editorLink(this.editor, slug)
  }
}

export class FolderLibrary implements Library {
  readonly where: string
  private readonly xmlDir: string
  private readonly recipeDir: string

  constructor(
    root: string,
    private readonly editor: string,
  ) {
    this.xmlDir = join(root, 'microcontrollers')
    this.recipeDir = join(root, 'recipes')
    this.where = `${this.xmlDir} (open with npm run dev at ${editor})`
  }

  private xmlPath(slug: string): string {
    return join(this.xmlDir, `${slug}.xml`)
  }

  private recipePath(slug: string): string | null {
    for (const ext of ['yaml', 'yml', 'json']) {
      const path = join(this.recipeDir, `${slug}.${ext}`)
      if (existsSync(path)) return path
    }
    return null
  }

  async list(): Promise<Entry[]> {
    if (!existsSync(this.xmlDir)) return []
    return readdirSync(this.xmlDir)
      .filter((f) => f.endsWith('.xml'))
      .map((file) => {
        const slug = file.slice(0, -4)
        const xml = readFileSync(join(this.xmlDir, file), 'utf8')
        const updatedAt = statSync(join(this.xmlDir, file)).mtimeMs
        const recipe = this.recipePath(slug)
        return {
          slug,
          name: attribute(xml, 'name') ?? slug,
          description: attribute(xml, 'description') ?? '',
          updatedAt,
          componentCount: xml.split('<c type="').length - 1,
          hasRecipe: recipe !== null,
          recipeStale: recipe !== null && statSync(recipe).mtimeMs < updatedAt - 1000,
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async get(slug: string): Promise<Stored | null> {
    const path = this.xmlPath(slug)
    if (!existsSync(path)) return null
    const xml = readFileSync(path, 'utf8')
    const recipe = this.recipePath(slug)
    if (!recipe) return { xml }
    return {
      xml,
      recipe: readFileSync(recipe, 'utf8'),
      recipeStale: statSync(recipe).mtimeMs < statSync(path).mtimeMs - 1000,
    }
  }

  async put(slug: string, xml: string, recipe?: string): Promise<Entry> {
    mkdirSync(this.xmlDir, { recursive: true })
    writeFileSync(this.xmlPath(slug), xml.endsWith('\n') ? xml : `${xml}\n`)
    if (recipe !== undefined) {
      mkdirSync(this.recipeDir, { recursive: true })
      const existing = this.recipePath(slug)
      const json = recipe.trimStart().startsWith('{')
      const path = existing ?? join(this.recipeDir, `${slug}.${json ? 'json' : 'yaml'}`)
      writeFileSync(path, recipe.endsWith('\n') ? recipe : `${recipe}\n`)
    }
    const entry = (await this.list()).find((e) => e.slug === slug)
    return entry ?? { slug, name: slug }
  }

  async delete(slug: string): Promise<boolean> {
    const path = this.xmlPath(slug)
    if (!existsSync(path)) return false
    rmSync(path)
    return true
  }

  editorUrl(slug: string): string {
    return editorLink(this.editor, slug)
  }
}

function attribute(xml: string, name: string): string | undefined {
  const head = /<microprocessor\b[^>]*>/.exec(xml)?.[0] ?? ''
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(head)
  if (!match) return undefined
  return match[1]!
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export interface LibraryEnv {
  readonly SWMC_TOKEN?: string
  readonly SWMC_API_URL?: string
  readonly SWMC_URL?: string
  readonly SWMC_DIR?: string
}

/** A token means the cloud; otherwise a folder (SWMC_DIR, or the working directory). */
export function libraryFromEnv(env: LibraryEnv, cwd: string): Library {
  const token = env.SWMC_TOKEN?.trim()
  if (token) {
    return new CloudLibrary(env.SWMC_API_URL || HOSTED_API, token, env.SWMC_URL || HOSTED_EDITOR)
  }
  return new FolderLibrary(env.SWMC_DIR || cwd, env.SWMC_URL || LOCAL_EDITOR)
}
