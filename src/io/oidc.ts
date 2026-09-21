/**
 * CloudHost OIDC (authorization code + PKCE) for the cloud library.
 *
 * The SPA is a public client. Home mints RS256 access tokens; the API
 * verifies them against JWKS. Tokens live in sessionStorage because the
 * UI and API are different *.example.com hosts — an HttpOnly cookie on
 * the API origin would be cross-site.
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
  sessionStorage.removeItem(tokensKey)
  sessionStorage.removeItem(pendingKey)
}

export async function getAccessToken(): Promise<string | null> {
  const tokens = readTokens()
  if (!tokens) return null
  if (tokens.expires_at > now() + 60) return tokens.access_token
  if (!tokens.refresh_token) {
    clearOidcTokens()
    return null
  }
  if (!inflightRefresh) {
    inflightRefresh = refresh(tokens.refresh_token).finally(() => {
      inflightRefresh = null
    })
  }
  return inflightRefresh
}

async function refresh(refreshToken: string): Promise<string | null> {
  try {
    const disc = await loadDiscovery()
    const tokens = await tokenRequest(
      disc.token_endpoint,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: oidcClientId(),
      }),
    )
    storeTokens(tokens)
    return tokens.access_token
  } catch {
    clearOidcTokens()
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
  const raw = sessionStorage.getItem(tokensKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Tokens
  } catch {
    return null
  }
}

function storeTokens(tokens: Tokens): void {
  sessionStorage.setItem(tokensKey, JSON.stringify(tokens))
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
