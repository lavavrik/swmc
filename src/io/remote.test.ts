import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRemote, getRemote, listRemote, putRemote } from './remote'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example')
  vi.stubEnv('VITE_API_TOKEN', 'secret')
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('cloud library client', () => {
  it('lists projects', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([{ id: 'rig', name: 'Test Rig', updatedAt: 1, componentCount: 2 }]),
        {
          status: 200,
        },
      ),
    )
    await expect(listRemote()).resolves.toEqual([
      { id: 'rig', name: 'Test Rig', updatedAt: 1, componentCount: 2 },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/microcontrollers',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    )
  })

  it('loads xml and reports a miss as null', async () => {
    fetchMock.mockResolvedValue(new Response('<microprocessor name="Rig"/>', { status: 200 }))
    await expect(getRemote('rig')).resolves.toBe('<microprocessor name="Rig"/>')
    fetchMock.mockResolvedValue(new Response('{"error":"not found"}', { status: 404 }))
    await expect(getRemote('missing')).resolves.toBeNull()
  })

  it('saves xml and returns the summary', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'rig', name: 'Test Rig', updatedAt: 2, componentCount: 1 }),
        {
          status: 200,
        },
      ),
    )
    await expect(putRemote('rig', '<microprocessor name="Test Rig"/>')).resolves.toMatchObject({
      id: 'rig',
      name: 'Test Rig',
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect(init.body).toBe('<microprocessor name="Test Rig"/>')
  })

  it('treats a 401 as unauthorized', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401 }))
    await expect(listRemote()).rejects.toThrow(/unauthorized/)
  })

  it('ignores deleting something that is already gone', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    await expect(deleteRemote('gone')).resolves.toBeUndefined()
  })
})
