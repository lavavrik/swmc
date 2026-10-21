/**
 * CloudHost OIDC (authorization code + PKCE) for the cloud library.
 *
 * The SPA is a public client. Home mints RS256 access tokens; the API
 * verifies them against JWKS. Tokens live in web storage because the UI
 * and API are different *.example.com hosts — an HttpOnly cookie on the API
 * origin would be cross-site.
 *
 * Session lifetime (SWMC-3): the tokens are in localStorage, not
 * sessionStorage, so a reload, a new tab (editor links from the MCP server
 * open one) or a browser restart stays signed in. Access tokens last 15
 * minutes; the refresh token (30 days, rotated on every use) renews them.
 * Only the issuer rejecting the refresh token signs you out — a network
 * error or a 5xx keeps the session for the next try.
 *
 * Home revokes the whole refresh-token family when a rotated token is used
 * twice, so tabs must not refresh at the same time: the refresh runs under
 * a Web Lock and re-reads storage first, picking up what another tab got.
 *
 * The PKCE pending state stays in sessionStorage: the redirect comes back
 * to the tab that started it.
 */
import { oidcClientId, oidcIssuer, oidcRedirectUri } from './config'

const pendingKey = 'swmc_oidc_pending'
const tokensKey = 'swmc_oidc'

interface Discovery {
  readonly authorization_endpoint: string
  readonly token_endpoint: string
}

interface Pending {
  readonly verifier: string
  readonly state: string
  readonly nonce: string
  readonly redirect_uri: string
}

interface Tokens {
  readonly access_token: string
  readonly refresh_token: string
  readonly expires_at: number
}

/** The issuer said no (400/401): the refresh token is dead, sign out. */
class RejectedGrant extends Error {}

let discovery: Discovery | null = null
let inflightRefresh: Promise<string | null> | null = null

export function resetOidcForTests(): void {
  discovery = null
  inflightRefresh = null
  clearOidcTokens()
}

export function oidcCallbackParams(
  search: string,
): { code: string; state: string } | { error: string } | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const error = q.get('error')
  if (error) return { error: q.get('error_description') || error }
  const code = q.get('code')
  const state = q.get('state')
  if (!code || !state) return null
  return { code, state }
}

export async function startOidcLogin(): Promise<void> {
  const clientId = oidcClientId()
  if (!clientId) throw new Error('CloudHost login is not configured')
  const disc = await loadDiscovery()
  const pending = await newPending()
  sessionStorage.setItem(pendingKey, JSON.stringify(pending))
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: pending.redirect_uri,
    response_type: 'code',
    scope: 'openid email profile',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await challenge(pending.verifier),
    code_challenge_method: 'S256',
  })
  window.location.assign(`${disc.authorization_endpoint}?${q}`)
}

export async function completeOidcLogin(code: string, state: string): Promise<void> {
  const raw = sessionStorage.getItem(pendingKey)
  sessionStorage.removeItem(pendingKey)
  if (!raw) throw new Error('sign-in session expired — try again')
  const pending = JSON.parse(raw) as Pending
  if (pending.state !== state) throw new Error('sign-in state mismatch')
  const disc = await loadDiscovery()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirect_uri,
    client_id: oidcClientId(),
    code_verifier: pending.verifier,
  })
  const tokens = await tokenRequest(disc.token_endpoint, body)
  storeTokens(tokens)
}

export function clearOidcTokens(): void {
  localStorage.removeItem(tokensKey)
  sessionStorage.removeItem(tokensKey)
  sessionStorage.removeItem(pendingKey)
}

/** Tokens are stored — signed in, even if the access token needs renewing. */
export function hasOidcSession(): boolean {
  return readTokens() !== null
}

/**
 * The API turned the stored access token down although it looked fresh (a
 * clock ahead of the issuer's): renew it on the next getAccessToken().
 */
export function expireOidcAccessToken(): void {
  const tokens = readTokens()
  if (tokens) storeTokens({ ...tokens, expires_at: 0 })
}

/**
 * A usable access token, refreshing it first when it is about to expire.
 * null means signed out — or, after a transient refresh failure, not right
 * now (the stored tokens are kept).
 */
export async function getAccessToken(): Promise<string | null> {
  const tokens = readTokens()
  if (!tokens) return null
  if (fresh(tokens)) return tokens.access_token
  if (!tokens.refresh_token) {
    clearOidcTokens()
    return null
  }
  if (!inflightRefresh) {
    inflightRefresh = withRefreshLock(refresh).finally(() => {
      inflightRefresh = null
    })
  }
  return inflightRefresh
}

function fresh(tokens: Tokens): boolean {
  return tokens.expires_at > now() + 60
}

/** Serialise refreshes across tabs where the browser has Web Locks. */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return fn()
  return locks.request(`${tokensKey}_refresh`, fn) as Promise<T>
}

async function refresh(): Promise<string | null> {
  // Another tab may have refreshed while we waited for the lock; its
  // rotated refresh token replaced ours, which is now spent.
  const tokens = readTokens()
  if (!tokens) return null
  if (fresh(tokens)) return tokens.access_token
  if (!tokens.refresh_token) {
    clearOidcTokens()
    return null
  }
  try {
    const disc = await loadDiscovery()
    const next = await tokenRequest(
      disc.token_endpoint,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: oidcClientId(),
      }),
    )
    storeTokens(next)
    return next.access_token
  } catch (error) {
    if (error instanceof RejectedGrant) clearOidcTokens()
    return null
  }
}

async function loadDiscovery(): Promise<Discovery> {
  if (discovery) return discovery
  const res = await fetch(`${oidcIssuer()}/.well-known/openid-configuration`)
  if (!res.ok) throw new Error(`oidc discovery failed (${res.status})`)
  discovery = (await res.json()) as Discovery
  return discovery
}

async function tokenRequest(url: string, body: URLSearchParams): Promise<Tokens> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (res.status === 400 || res.status === 401) {
    throw new RejectedGrant(
      json.error_description ?? json.error ?? `token request rejected (${res.status})`,
    )
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? `token request failed (${res.status})`)
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? '',
    expires_at: now() + (json.expires_in ?? 900),
  }
}

function readTokens(): Tokens | null {
  // Builds before SWMC-3 kept tokens in sessionStorage; carry them over
  const legacy = sessionStorage.getItem(tokensKey)
  if (legacy !== null) {
    sessionStorage.removeItem(tokensKey)
    if (localStorage.getItem(tokensKey) === null) localStorage.setItem(tokensKey, legacy)
  }
  const raw = localStorage.getItem(tokensKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Tokens
  } catch {
    return null
  }
}

function storeTokens(tokens: Tokens): void {
  localStorage.setItem(tokensKey, JSON.stringify(tokens))
}

async function newPending(): Promise<Pending> {
  return {
    verifier: base64url(randomBytes(32)),
    state: hex(randomBytes(16)),
    nonce: hex(randomBytes(16)),
    redirect_uri: oidcRedirectUri(),
  }
}

export async function challenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(hash))
}

export function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}
