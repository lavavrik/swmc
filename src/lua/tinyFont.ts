/**
 * Which pixel font monitors are drawn in.
 *
 * A copy of the game's font is bundled so the app works on its own. When the
 * player points it at their own installation, the font is read from there
 * instead — the same file the game itself draws with.
 */
import { TINY_ADVANCE, TINY_GLYPHS, TINY_LINE_HEIGHT } from './tinyFont.generated'
import { parseTinyFont, type TinyFont } from './tinyFontFile'

const BUNDLED: TinyFont = {
  advance: TINY_ADVANCE,
  lineHeight: TINY_LINE_HEIGHT,
  glyphs: TINY_GLYPHS,
  face: 'CG pixel 4x5 mono (bundled)',
}

let current: TinyFont = BUNDLED

export const tinyFont = (): TinyFont => current

/** Reads the font out of a game folder. Returns what it found, or the reason. */
export function adoptFontFrom(descriptor: string, page: Uint8Array): string | null {
  try {
    current = parseTinyFont(descriptor, page)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export function adoptBundledFont(): void {
  current = BUNDLED
}
