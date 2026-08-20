/**
 * Loading the monitor font out of a player's Stormworks installation.
 *
 * The game keeps it as a BMFont pair under `graphics/fonts`; this reads both
 * halves and hands them to the parser. Anything missing leaves the bundled copy
 * in place, so a folder that turns out not to have it changes nothing.
 */
import { readFile, readText } from '@/io/gameFiles'
import { adoptBundledFont, adoptFontFrom } from './tinyFont'

const DESCRIPTOR = 'graphics/fonts/tiny.xml'
const PAGE = 'graphics/fonts/tiny_0.txtr'

export async function loadFontFrom(rom: FileSystemDirectoryHandle): Promise<string | null> {
  const [descriptor, page] = await Promise.all([readText(rom, DESCRIPTOR), readFile(rom, PAGE)])
  if (!descriptor || !page) return 'the folder has no monitor font in it'
  return adoptFontFrom(descriptor, page)
}

export { adoptBundledFont }
