/**
 * Fetch against the cloud library API, attaching the OIDC access token
 * when the SPA has one.
 */
import { apiBaseUrl } from './config'
import { getAccessToken } from './oidc'

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = await getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${apiBaseUrl()}${path}`, { credentials: 'include', ...init, headers })
}
