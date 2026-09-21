/**
 * HTTP client for the cloudhost function that holds the project library.
 *
 * The function stores the same XML the game would load. List is JSON; a
 * single project is the XML itself. Signed-in calls send the CloudHost
 * access token as Bearer.
 */
import { apiFetch } from './http'

interface Summary {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly updatedAt: number
  readonly componentCount: number
}

const jsonHeaders = (): Record<string, string> => ({ Accept: 'application/json' })

const xmlHeaders = (): Record<string, string> => ({ 'Content-Type': 'application/xml' })

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await apiFetch(path, init)
  if (res.status === 401) throw new Error('cloud library: sign in first')
  return res
}

export async function listRemote(): Promise<Summary[]> {
  const res = await request('/microcontrollers', { headers: jsonHeaders() })
  if (!res.ok) throw new Error(`cloud library: list failed (${res.status})`)
  return (await res.json()) as Summary[]
}

export async function getRemote(id: string): Promise<string | null> {
  const res = await request(`/microcontrollers/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`cloud library: load failed (${res.status})`)
  return res.text()
}

export async function putRemote(id: string, xml: string): Promise<Summary> {
  const res = await request(`/microcontrollers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: xmlHeaders(),
    body: xml,
  })
  if (!res.ok) throw new Error(`cloud library: save failed (${res.status})`)
  return (await res.json()) as Summary
}

export async function deleteRemote(id: string): Promise<void> {
  const res = await request(`/microcontrollers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: jsonHeaders(),
  })
  if (res.status === 404) return
  if (!res.ok) throw new Error(`cloud library: delete failed (${res.status})`)
}
