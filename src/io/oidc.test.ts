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

describe('getAccessToken', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'client-1')
  })

  afterEach(() => {
    resetOidcForTests()
    sessionStorage.clear()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns a still-valid access token', async () => {
    sessionStorage.setItem(
      'swmc_oidc',
      JSON.stringify({
        access_token: 'live',
        refresh_token: 'r',
        expires_at: Math.floor(Date.now() / 1000) + 600,
      }),
    )
    await expect(getAccessToken()).resolves.toBe('live')
  })

  it('clears expired tokens when refresh fails', async () => {
    sessionStorage.setItem(
      'swmc_oidc',
      JSON.stringify({
        access_token: 'old',
        refresh_token: 'r',
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            issuer: 'https://example.com',
            token_endpoint: 'https://example.com/oidc/token',
          }),
          {
            status: 200,
          },
        ),
      ),
    )
    // second call (token) — but the mock always returns discovery-shaped json
    await expect(getAccessToken()).resolves.toBeNull()
    expect(sessionStorage.getItem('swmc_oidc')).toBeNull()
  })
})
