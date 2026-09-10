/**
 * Opening a saved microcontroller from `?open=hybrid-car`.
 *
 * The CLI writes XML under `microcontrollers/` and points the editor at this
 * query. Only a slug is accepted — no paths.
 */
import { err, ok, type Result } from '@/model/result'
import type { Microcontroller } from '@/model/types'
import { parseMicrocontroller } from './microcontroller'

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

export async function fetchMicrocontroller(path: string): Promise<Result<Microcontroller>> {
  try {
    const res = await fetch(path)
    if (!res.ok) return err(`could not load ${path} (${res.status})`)
    return parseMicrocontroller(await res.text())
  } catch (cause) {
    return err(`could not load ${path}: ${String(cause)}`)
  }
}
