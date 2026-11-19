import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { me, restoreAccount } from './auth'
import { resetOidcForTests } from './oidc'

const nowSec = () => Math.floor(Date.now() / 1000)
const account = { id: 'u1', email: 'a@b.c' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const store = (access: string, refresh: string, expiresAt: number) =>
  localStorage.setItem(
    'swmc_oidc',
    JSON.stringify({ access_token: access, refresh_token: refresh, expires_at: expiresAt }),
  )
const authHeader = (call: unknown) =>
  new Headers(((call as [string, RequestInit])[1] ?? {}).headers).get('Authorization')

// SWMC-3: a reload must not look signed out while the session is still good
describe('account on load', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example')
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://id.example.com')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'client-1')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    resetOidcForTests()
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('is signed out with no stored session', async () => {
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401))
    await expect(me()).resolves.toBeNull()
  })

  it('renews once when the API rejects a token that looked fresh', async () => {
    store('skewed', 'r1', nowSec() + 600)
    fetchMock
      .mockResolvedValueOnce(json({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(json({ token_endpoint: 'https://id.example.com/oidc/token' }))
      .mockResolvedValueOnce(json({ access_token: 'renewed', refresh_token: 'r2' }))
      .mockResolvedValueOnce(json(account))
    await expect(me()).resolves.toEqual(account)
    expect(authHeader(fetchMock.mock.calls[3])).toBe('Bearer renewed')
  })

  it('is signed out when the issuer rejects the refresh token too', async () => {
    store('skewed', 'r1', nowSec() + 600)
    fetchMock
      .mockResolvedValueOnce(json({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(json({ token_endpoint: 'https://id.example.com/oidc/token' }))
      .mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400))
      .mockResolvedValueOnce(json({ error: 'unauthorized' }, 401))
    await expect(me()).resolves.toBeNull()
    expect(localStorage.getItem('swmc_oidc')).toBeNull()
  })

  it('retries a cold or unreachable API instead of signing out', async () => {
    store('live', 'r', nowSec() + 600)
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('waking', { status: 503 }))
      .mockResolvedValueOnce(json(account))
    const wait = vi.fn().mockResolvedValue(undefined)
    await expect(restoreAccount(wait)).resolves.toEqual(account)
    expect(wait).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem('swmc_oidc')).not.toBeNull()
  })

  it('gives up after a few tries but keeps the session for the next load', async () => {
    store('live', 'r', nowSec() + 600)
    fetchMock.mockImplementation(async () => new Response('down', { status: 502 }))
    await expect(restoreAccount(async () => {})).rejects.toThrow(/502/)
    expect(localStorage.getItem('swmc_oidc')).not.toBeNull()
  })
})
