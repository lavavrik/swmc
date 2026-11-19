/**
 * HTTP client for the library API (server/) that holds the project library.
 *
 * The function stores the same XML the game would load. List is JSON; a
 * single project is the XML itself. Signed-in calls send the OIDC
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

/** A personal access token for an agent. The secret is only in `created`. */
export interface AgentToken {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly createdAt: number
  readonly lastUsedAt?: number
}

export async function listTokens(): Promise<AgentToken[]> {
  const res = await request('/tokens', { headers: jsonHeaders() })
  if (!res.ok) throw new Error(`agent tokens: list failed (${res.status})`)
  return (await res.json()) as AgentToken[]
}

export async function createToken(name: string): Promise<AgentToken & { token: string }> {
  const res = await request('/tokens', {
    method: 'POST',
    headers: { ...jsonHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`agent tokens: ${body.error ?? `create failed (${res.status})`}`)
  }
  return (await res.json()) as AgentToken & { token: string }
}

export async function revokeToken(id: string): Promise<void> {
  const res = await request(`/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: jsonHeaders(),
  })
  if (!res.ok && res.status !== 404) throw new Error(`agent tokens: revoke failed (${res.status})`)
}
