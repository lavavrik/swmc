/**
 * Where Stormworks keeps things, per platform.
 *
 * A page cannot open the folder picker at a path it names — that is the whole
 * point of the permission — so the next best thing is to tell the player
 * exactly where to go and let them paste it. Every file dialog takes a pasted
 * path: ⌘⇧G on macOS, ⌃L or the address bar on Windows and Linux.
 *
 * The picker itself reopens where it last was, which the browser handles from
 * the `id` given to it, so this only matters the first time.
 */

export type Platform = 'mac' | 'windows' | 'linux' | 'unknown'

export interface SuggestedPath {
  readonly label: string
  readonly path: string
}

export interface PlatformSignals {
  /** `navigator.userAgentData.platform`, where the browser reports it. */
  readonly reported?: string | undefined
  /** The user agent string, which is a guess and can be wrong. */
  readonly agent?: string | undefined
}

/**
 * Works out which platform this is, preferring what the browser states outright
 * over the user agent string — automated browsers in particular hand out a user
 * agent for a system they are not running on.
 */
export function platformFrom({ reported, agent = '' }: PlatformSignals): Platform {
  const said = reported ?? ''
  if (/mac/i.test(said)) return 'mac'
  if (/win/i.test(said)) return 'windows'
  if (/linux|chrome os|android/i.test(said)) return 'linux'
  if (/Mac|iPhone|iPad/i.test(agent)) return 'mac'
  if (/Win/i.test(agent)) return 'windows'
  if (/Linux|X11|CrOS/i.test(agent)) return 'linux'
  return 'unknown'
}

export function detectPlatform(): Platform {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  return platformFrom({ reported: data?.platform, agent: navigator.userAgent })
}

/** Where the game itself is installed. */
export function gamePaths(platform: Platform): SuggestedPath[] {
  switch (platform) {
    case 'mac':
      return [
        {
          label: 'Steam',
          path: '~/Library/Application Support/Steam/steamapps/common/Stormworks',
        },
      ]
    case 'windows':
      return [
        { label: 'Steam', path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Stormworks' },
      ]
    case 'linux':
      return [{ label: 'Steam', path: '~/.steam/steam/steamapps/common/Stormworks' }]
    default:
      return [{ label: 'Steam', path: 'steamapps/common/Stormworks' }]
  }
}

/** Where microcontrollers end up: the player's own, and the ones they subscribe to. */
export function designPaths(platform: Platform): SuggestedPath[] {
  switch (platform) {
    case 'mac':
      return [
        {
          label: 'Your own',
          path: '~/Library/Application Support/Stormworks/data/microprocessors',
        },
        {
          label: 'Subscribed',
          path: '~/Library/Application Support/Steam/steamapps/workshop/content/573090',
        },
      ]
    case 'windows':
      return [
        { label: 'Your own', path: '%APPDATA%\\Stormworks\\data\\microprocessors' },
        {
          label: 'Subscribed',
          path: 'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\573090',
        },
      ]
    case 'linux':
      return [
        {
          label: 'Your own',
          path: '~/.steam/steam/steamapps/compatdata/573090/pfx/drive_c/users/steamuser/AppData/Roaming/Stormworks/data/microprocessors',
        },
        { label: 'Subscribed', path: '~/.steam/steam/steamapps/workshop/content/573090' },
      ]
    default:
      return [
        { label: 'Your own', path: 'Stormworks/data/microprocessors' },
        { label: 'Subscribed', path: 'steamapps/workshop/content/573090' },
      ]
  }
}

/** How to paste a path into this platform's file dialog. */
export function pasteHint(platform: Platform): string {
  switch (platform) {
    case 'mac':
      return 'In the file dialog press ⌘⇧G, then paste.'
    case 'windows':
      return 'In the file dialog press Ctrl+L, then paste.'
    default:
      return 'In the file dialog press Ctrl+L, then paste.'
  }
}
