/**
 * Cloud library account. CloudHost OIDC is Bearer on the API; homemade
 * email/password still uses an HttpOnly cookie (local / tests).
 */
import { apiFetch } from './http'
import { clearOidcTokens, completeOidcLogin } from './oidc'

export interface Account {
  readonly id: string
  readonly email: string
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return apiFetch(path, init)
}

export async function finishOidcLogin(code: string, state: string): Promise<Account> {
  await completeOidcLogin(code, state)
  const account = await me()
  if (!account) throw new Error('signed in but the library did not accept the token')
  return account
}

export async function me(): Promise<Account | null> {
  const res = await request('/auth/me')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`account: ${res.status}`)
  return (await res.json()) as Account
}

export async function register(email: string, password: string): Promise<Account> {
  const res = await request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `register failed (${res.status})`)
  }
  return (await res.json()) as Account
}

export async function login(email: string, password: string): Promise<Account> {
  const res = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `login failed (${res.status})`)
  }
  return (await res.json()) as Account
}

export async function logout(): Promise<void> {
  clearOidcTokens()
  const res = await request('/auth/logout', { method: 'POST' })
  if (!res.ok && res.status !== 204) throw new Error(`logout failed (${res.status})`)
}
