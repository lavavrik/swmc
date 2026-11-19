/**
 * Cloud library account. OIDC is Bearer on the API; homemade
 * email/password still uses an HttpOnly cookie (local / tests).
 */
import { apiFetch } from './http'
import { clearOidcTokens, completeOidcLogin, expireOidcAccessToken, hasOidcSession } from './oidc'

export interface Account {
  readonly id: string
  readonly email: string
}

let session: Account | null = null

/** Signed-in account, if any. The project library uses this to pick cloud vs this browser. */
export function sessionAccount(): Account | null {
  return session
}

export function setSessionAccount(account: Account | null): void {
  session = account
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

/**
 * Who the API says is signed in. null is a definite "nobody"; a throw means
 * it could not tell (API down, issuer unreachable) and the stored OIDC
 * session is kept — see restoreAccount.
 */
export async function me(): Promise<Account | null> {
  let res = await request('/auth/me')
  if (res.status === 401 && hasOidcSession()) {
    // Renew once: the token may only have looked fresh to this clock
    expireOidcAccessToken()
    res = await request('/auth/me')
  }
  if (res.status === 401) {
    // Tokens still stored here means the refresh failed for a passing
    // reason; a rejected refresh token has already been cleared.
    if (hasOidcSession()) throw new Error('could not renew the sign-in')
    session = null
    return null
  }
  if (!res.ok) throw new Error(`account: ${res.status}`)
  session = (await res.json()) as Account
  return session
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * me() on page load, retrying a cold or unreachable API (SWMC-3) so a
 * reload does not look signed out. Three tries, 1 s then 2 s apart.
 */
export async function restoreAccount(wait = sleep): Promise<Account | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await me()
    } catch (error) {
      if (attempt >= 2) throw error
      await wait(1000 * 2 ** attempt)
    }
  }
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
  session = (await res.json()) as Account
  return session
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
  session = (await res.json()) as Account
  return session
}

export async function logout(): Promise<void> {
  session = null
  clearOidcTokens()
  const res = await request('/auth/logout', { method: 'POST' })
  if (!res.ok && res.status !== 204) throw new Error(`logout failed (${res.status})`)
}
