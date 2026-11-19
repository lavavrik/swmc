/**
 * Opening a saved microcontroller from `?open=hybrid-car`.
 *
 * The CLI writes XML under `microcontrollers/`, and the MCP server saves to
 * the signed-in cloud library; both point the editor at this query. Only a
 * slug is accepted — no paths. The bundled XML is the game artifact, so its
 * Lua is minified.
 *
 * `?project=hybrid-car` is a project in the library (this browser, or the cloud
 * account). Saving or opening from the library switches the URL to it, so a
 * reload shows what was saved — readable Lua and all — rather than an `?open=`
 * file that may be the minified export, or not the copy that was saved.
 */
import { err, ok, type Result } from '@/model/result'
import type { Microcontroller } from '@/model/types'
import { parseMicrocontroller } from './microcontroller'
import { getRemote } from './remote'

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** `hybrid-car`, `hybrid-car.xml`, or a path ending in that name. */
export function xmlPathFromOpen(open: string): Result<string> {
  const trimmed = open.trim()
  const base = trimmed.replace(/\\/g, '/').split('/').pop() ?? ''
  const slug = base.replace(/\.xml$/i, '')
  if (!SLUG.test(slug)) return err(`cannot open "${open}"`)
  return ok(`/microcontrollers/${slug}.xml`)
}

export function openParam(search: string): string | null {
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('open')
  if (value === null || value.trim() === '') return null
  return value
}

export function projectParam(search: string): string | null {
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(
    'project',
  )
  if (value === null || value.trim() === '') return null
  return value
}

/** `search` pointing at library project `id`, or at nothing when `id` is null. */
export function searchForProject(search: string, id: string | null): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  params.delete('open')
  params.delete('project')
  if (id !== null) params.set('project', id)
  const text = params.toString()
  return text.length > 0 ? `?${text}` : ''
}

/**
 * Records in the URL which library project is on screen (null: none — a new,
 * imported or dropped document), without adding a history entry.
 */
export function showProjectInUrl(id: string | null): void {
  const { pathname, search, hash } = window.location
  const next = searchForProject(search, id)
  if (next !== search)
    window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`)
}

export async function fetchMicrocontroller(path: string): Promise<Result<Microcontroller>> {
  try {
    const res = await fetch(path)
    if (!res.ok) return err(`could not load ${path} (${res.status})`)
    return parseMicrocontroller(await res.text())
  } catch (cause) {
    return err(`could not load ${path}: ${String(cause)}`)
  }
}

/**
 * Signing in through the OIDC issuer leaves the page and comes back to `/`, losing the
 * query. The wanted slug waits in sessionStorage until it has been opened.
 */
const PENDING_OPEN = 'swmc.open'

export function wantedOpen(search: string): string | null {
  const fromUrl = openParam(search)
  try {
    if (fromUrl) sessionStorage.setItem(PENDING_OPEN, fromUrl)
    else return sessionStorage.getItem(PENDING_OPEN)
  } catch {
    // Storage blocked: the query still works, it just won't survive sign-in.
  }
  return fromUrl
}

export function clearWantedOpen(): void {
  try {
    sessionStorage.removeItem(PENDING_OPEN)
  } catch {
    // nothing to clear
  }
}

export type OpenOutcome =
  | { readonly ok: true; readonly value: Microcontroller }
  | { readonly ok: false; readonly error: string; readonly needsSignIn?: boolean }

/**
 * The signed-in cloud library first, then the XML bundled under
 * `/microcontrollers/`. `cloud` is whether this build has a cloud library;
 * `signedIn` whether someone is signed in to it.
 */
export async function openMicrocontroller(
  open: string,
  cloud: { readonly enabled: boolean; readonly signedIn: boolean },
): Promise<OpenOutcome> {
  const path = xmlPathFromOpen(open)
  if (!path.ok) return path
  const slug = path.value.slice('/microcontrollers/'.length, -'.xml'.length)
  if (cloud.enabled && cloud.signedIn) {
    try {
      const xml = await getRemote(slug.toLowerCase())
      if (xml !== null) return parseMicrocontroller(xml)
    } catch (cause) {
      return err(`could not load ${slug}: ${String(cause)}`)
    }
  }
  const bundled = await fetchMicrocontroller(path.value)
  if (bundled.ok) return bundled
  if (cloud.enabled && !cloud.signedIn) {
    return {
      ok: false,
      error: `sign in to open ${slug} from your cloud library`,
      needsSignIn: true,
    }
  }
  return err(cloud.enabled ? `no microcontroller called ${slug} in your library` : bundled.error)
}
