/**
 * HTTP client for the cloudhost function that holds the project library.
 *
 * The function stores the same XML the game would load. List is JSON; a
 * single project is the XML itself. Writes send the token; reads do not.
 */
import { apiBaseUrl, apiToken } from './config'

interface Summary {
  readonly id: string
  readonly name: string
  readonly updatedAt: number
  readonly componentCount: number
}

const jsonHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = apiToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

const xmlHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/xml' }
  const token = apiToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${apiBaseUrl()}${path}`, init)
  if (res.status === 401) throw new Error('cloud library: unauthorized')
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
