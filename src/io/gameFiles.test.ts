import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { findDesigns, findRom, readText } from './gameFiles'

/** A directory handle backed by a plain object, enough for these functions. */
function folder(name: string, contents: Record<string, unknown>): FileSystemDirectoryHandle {
  const handle = {
    kind: 'directory' as const,
    name,
    async getDirectoryHandle(child: string) {
      const inside = contents[child]
      if (!inside || typeof inside !== 'object') throw new Error('not found')
      return folder(child, inside as Record<string, unknown>)
    },
    async getFileHandle(child: string) {
      const text = contents[child]
      if (typeof text !== 'string') throw new Error('not found')
      return {
        kind: 'file' as const,
        name: child,
        async getFile() {
          return {
            async arrayBuffer() {
              return new TextEncoder().encode(text).buffer
            },
          }
        },
      }
    },
    async *values() {
      for (const [child, value] of Object.entries(contents)) {
        yield typeof value === 'string'
          ? await handle.getFileHandle(child)
          : folder(child, value as Record<string, unknown>)
      }
    },
  }
  return handle as unknown as FileSystemDirectoryHandle
}

const rom = { graphics: { fonts: { 'tiny.xml': '<font/>' } } }

describe('finding the game data', () => {
  it('accepts the rom folder itself', async () => {
    const found = await findRom(folder('rom', rom))
    expect(found).not.toBeNull()
  })

  it('accepts the folder above it, as Windows and Linux have it', async () => {
    expect(await findRom(folder('Stormworks', { rom }))).not.toBeNull()
  })

  it('accepts a macOS application bundle', async () => {
    const bundle = { 'stormworks.app': { Contents: { Resources: { rom } } } }
    expect(await findRom(folder('Stormworks', bundle))).not.toBeNull()
  })

  it('refuses a folder that is not the game', async () => {
    expect(await findRom(folder('Documents', { notes: { 'a.txt': 'hello' } }))).toBeNull()
  })

  it('reads a file out of it', async () => {
    const found = await findRom(folder('rom', rom))
    expect(await readText(found!, 'graphics/fonts/tiny.xml')).toBe('<font/>')
    expect(await readText(found!, 'nothing/here.xml')).toBeNull()
  })
})

describe('finding the player’s designs', () => {
  it('collects the XML a saved microcontroller folder holds', async () => {
    const designs = await findDesigns(
      folder('microprocessors', { 'Throttle.xml': '<microprocessor/>', 'notes.txt': 'x' }),
    )
    expect(designs.map((d) => d.file)).toEqual(['Throttle.xml'])
    expect(designs[0]?.where).toBe('')
  })

  it('reaches into the folders a workshop subscription makes', async () => {
    const workshop = {
      '573090': {
        '2040237095': { 'microcontroller.xml': '<microprocessor/>' },
        '2090863915': { 'vehicle.xml': '<vehicle/>' },
      },
    }
    const designs = await findDesigns(folder('content', workshop))
    expect(designs.map((d) => `${d.where}/${d.file}`).sort()).toEqual([
      '573090/2040237095/microcontroller.xml',
      '573090/2090863915/vehicle.xml',
    ])
  })

  it('stops before wandering the whole disk', async () => {
    const deep = { a: { b: { c: { d: { 'buried.xml': '<x/>' } } } } }
    expect(await findDesigns(folder('root', deep))).toEqual([])
  })
})
