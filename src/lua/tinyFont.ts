/**
 * Which pixel font monitors are drawn in.
 *
 * The game's own font is read from the player's installation when they point
 * the app at one. Until then monitors use the stand-in face in
 * `fallbackFont.ts`, which keeps the game's metrics but not its letterforms.
 */
import { FALLBACK_FACE, FALLBACK_GLYPHS, TINY_ADVANCE, TINY_LINE_HEIGHT } from './fallbackFont'
import { parseTinyFont, type TinyFont } from './tinyFontFile'

const FALLBACK: TinyFont = {
  advance: TINY_ADVANCE,
  lineHeight: TINY_LINE_HEIGHT,
  glyphs: FALLBACK_GLYPHS,
  face: FALLBACK_FACE,
}

let current: TinyFont = FALLBACK

export const tinyFont = (): TinyFont => current

/** True until the game's own font has been read from the player's folder. */
export const usingFallbackFont = (): boolean => current === FALLBACK

/** Reads the font out of a game folder. Returns what it found, or the reason. */
export function adoptFontFrom(descriptor: string, page: Uint8Array): string | null {
  try {
    current = parseTinyFont(descriptor, page)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export function adoptFallbackFont(): void {
  current = FALLBACK
}
