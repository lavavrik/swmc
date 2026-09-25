import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWantedOpen,
  openMicrocontroller,
  openParam,
  wantedOpen,
  xmlPathFromOpen,
} from './openQuery'

describe('xmlPathFromOpen', () => {
  it('accepts a slug, with or without .xml', () => {
    expect(xmlPathFromOpen('hybrid-car')).toEqual({
      ok: true,
      value: '/microcontrollers/hybrid-car.xml',
    })
    expect(xmlPathFromOpen('hybrid-car.xml')).toEqual({
      ok: true,
      value: '/microcontrollers/hybrid-car.xml',
    })
  })

  it('takes the basename of a path', () => {
    expect(xmlPathFromOpen('microcontrollers/throttle-limiter.xml')).toEqual({
      ok: true,
      value: '/microcontrollers/throttle-limiter.xml',
    })
  })

  it('refuses a slug that is not a file name', () => {
    expect(xmlPathFromOpen('..').ok).toBe(false)
    expect(xmlPathFromOpen('').ok).toBe(false)
    expect(xmlPathFromOpen('/').ok).toBe(false)
  })
})

describe('openParam', () => {
  it('reads ?open=', () => {
    expect(openParam('?open=hybrid-car')).toBe('hybrid-car')
    expect(openParam('open=hybrid-car')).toBe('hybrid-car')
    expect(openParam('')).toBeNull()
    expect(openParam('?x=1')).toBeNull()
  })
})

describe('wantedOpen', () => {
  afterEach(() => sessionStorage.clear())

  it('remembers ?open= across the sign-in redirect', () => {
    expect(wantedOpen('?open=rig')).toBe('rig')
    expect(wantedOpen('?code=x&state=y')).toBe('rig')
    clearWantedOpen()
    expect(wantedOpen('')).toBeNull()
  })
})

describe('openMicrocontroller', () => {
  const xml = readFileSync(join(process.cwd(), 'microcontrollers/throttle-limiter.xml'), 'utf8')
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('loads from the cloud library when signed in', async () => {
    fetchMock.mockResolvedValue(new Response(xml, { status: 200 }))
    const result = await openMicrocontroller('Rig', { enabled: true, signedIn: true })
    expect(result.ok).toBe(true)
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.example/microcontrollers/rig')
  })

  it('falls back to the bundled XML, then asks to sign in', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }))
    const result = await openMicrocontroller('rig', { enabled: true, signedIn: false })
    expect(result).toMatchObject({ ok: false, needsSignIn: true })
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/microcontrollers/rig.xml')
  })
})
