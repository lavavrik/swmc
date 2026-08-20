import { describe, expect, it } from 'vitest'
import { designPaths, gamePaths, pasteHint, platformFrom } from './gamePaths'

describe('working out the platform', () => {
  it('recognises the platforms the game runs on', () => {
    expect(platformFrom({ agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe('mac')
    expect(platformFrom({ agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('windows')
    expect(platformFrom({ agent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe('linux')
    expect(platformFrom({ agent: 'something else' })).toBe('unknown')
  })

  it('believes what the browser states over the user agent string', () => {
    // An automated browser can hand out a user agent for another system
    expect(
      platformFrom({ reported: 'macOS', agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
    ).toBe('mac')
    expect(platformFrom({ reported: 'Windows', agent: 'Mozilla/5.0 (Macintosh)' })).toBe('windows')
  })

  it('falls back to the user agent when nothing is stated', () => {
    expect(platformFrom({ reported: '', agent: 'Mozilla/5.0 (Macintosh)' })).toBe('mac')
    expect(platformFrom({})).toBe('unknown')
  })
})

describe('the paths offered', () => {
  it('points at the Steam install for the game', () => {
    expect(gamePaths('mac')[0]?.path).toContain('steamapps/common/Stormworks')
    expect(gamePaths('windows')[0]?.path).toContain('steamapps\\common\\Stormworks')
  })

  it('separates a player’s own designs from the ones they subscribe to', () => {
    for (const platform of ['mac', 'windows', 'linux'] as const) {
      const paths = designPaths(platform)
      expect(paths.map((p) => p.label)).toEqual(['Your own', 'Subscribed'])
      expect(paths[0]?.path, platform).toContain('microprocessors')
      // Every subscription lands under the game's workshop id
      expect(paths[1]?.path, platform).toContain('573090')
    }
  })

  it('says how to paste a path into the dialog', () => {
    expect(pasteHint('mac')).toContain('⌘⇧G')
    expect(pasteHint('windows')).toContain('Ctrl+L')
  })

  it('still offers something on a platform it does not know', () => {
    expect(gamePaths('unknown')).toHaveLength(1)
    expect(designPaths('unknown')).toHaveLength(2)
  })
})
