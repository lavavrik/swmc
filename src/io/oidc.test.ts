import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { base64url, challenge, getAccessToken, oidcCallbackParams, resetOidcForTests } from './oidc'

describe('oidcCallbackParams', () => {
  it('reads code and state', () => {
    expect(oidcCallbackParams('?code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz' })
  })

  it('reads errors', () => {
    expect(oidcCallbackParams('?error=access_denied&error_description=nope')).toEqual({
      error: 'nope',
    })
  })

  it('ignores unrelated query', () => {
    expect(oidcCallbackParams('?open=hybrid-car')).toBeNull()
  })
})

describe('pkce', () => {
  it('base64url has no padding or plus', () => {
    expect(base64url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_')
  })

  it('challenge is S256 of the verifier', async () => {
    const s = await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(s).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

const nowSec = () => Math.floor(Date.now() / 1000)
const discovery = () =>
  new Response(JSON.stringify({ token_endpoint: 'https://id.example.com/oidc/token' }), {
    status: 200,
  })
const tokens = (access: string, refresh: string, expiresIn = 900) =>
  new Response(
    JSON.stringify({ access_token: access, refresh_token: refresh, expires_in: expiresIn }),
    { status: 200 },
  )
const stored = () =>
  JSON.parse(localStorage.getItem('swmc_oidc') ?? 'null') as {
    access_token: string
    refresh_token: string
  } | null
const store = (access: string, refresh: string, expiresAt: number) =>
  localStorage.setItem(
    'swmc_oidc',
    JSON.stringify({ access_token: access, refresh_token: refresh, expires_at: expiresAt }),
  )

describe('getAccessToken', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://id.example.com')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'client-1')
  })

  afterEach(() => {
    resetOidcForTests()
    localStorage.clear()
    sessionStorage.clear()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  // SWMC-3: sessionStorage is per tab, so every new tab started signed out
  it('reads tokens from localStorage, which every tab and a reload share', async () => {
    store('live', 'r', nowSec() + 600)
    await expect(getAccessToken()).resolves.toBe('live')
  })

  it('moves tokens a previous build left in sessionStorage', async () => {
    sessionStorage.setItem(
      'swmc_oidc',
      JSON.stringify({ access_token: 'legacy', refresh_token: 'r', expires_at: nowSec() + 600 }),
    )
    await expect(getAccessToken()).resolves.toBe('legacy')
    expect(stored()?.access_token).toBe('legacy')
    expect(sessionStorage.getItem('swmc_oidc')).toBeNull()
  })

  it('refreshes an expired access token and keeps the rotated refresh token', async () => {
    store('old', 'r1', nowSec() - 10)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discovery())
      .mockResolvedValueOnce(tokens('new', 'r2'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAccessToken()).resolves.toBe('new')
    expect(stored()).toMatchObject({ access_token: 'new', refresh_token: 'r2' })
    const body = (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('r1')
  })

  it('signs out when the issuer rejects the refresh token', async () => {
    store('old', 'r', nowSec() - 10)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(discovery())
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
        ),
    )
    await expect(getAccessToken()).resolves.toBeNull()
    expect(localStorage.getItem('swmc_oidc')).toBeNull()
  })

  it('keeps the session through a network error while refreshing', async () => {
    store('old', 'r', nowSec() - 10)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getAccessToken()).resolves.toBeNull()
    expect(stored()?.refresh_token).toBe('r')
  })

  it('keeps the session when the issuer has a 5xx', async () => {
    store('old', 'r', nowSec() - 10)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(discovery())
        .mockResolvedValueOnce(new Response('bad gateway', { status: 502 })),
    )
    await expect(getAccessToken()).resolves.toBeNull()
    expect(stored()?.refresh_token).toBe('r')
  })

  it('uses what another tab refreshed instead of spending the refresh token twice', async () => {
    // Home revokes the whole family when a rotated refresh token is reused
    store('old', 'r1', nowSec() - 10)
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: {
        request: async (_name: string, cb: () => Promise<unknown>) => {
          store('fromOtherTab', 'r2', nowSec() + 900)
          return cb()
        },
      },
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAccessToken()).resolves.toBe('fromOtherTab')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs out without a refresh token once the access token expires', async () => {
    store('old', '', nowSec() - 10)
    await expect(getAccessToken()).resolves.toBeNull()
    expect(localStorage.getItem('swmc_oidc')).toBeNull()
  })
})
