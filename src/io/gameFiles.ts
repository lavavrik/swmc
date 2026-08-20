/**
 * Reading a player's own Stormworks installation.
 *
 * The browser can read a folder the player picks, through the File System
 * Access API: they choose it once, the handle is kept, and the files are read
 * where they sit. Nothing is copied anywhere and nothing leaves the machine —
 * which is also why the app can use the game's own assets without shipping
 * any of them.
 *
 * Only Chromium-based browsers implement the directory picker. Everywhere else
 * the app falls back to what it has bundled, so this is an improvement when it
 * is available rather than something to depend on.
 */
import { err, ok, type Result } from '@/model/result'
import { SETTINGS, transact } from './database'

/** Where the game's data sits, relative to whatever the player picked. */
const ROOT_CANDIDATES = [
  // the rom folder itself
  '',
  // the folder that contains it, on Windows and Linux
  'rom',
  // a macOS application bundle
  'stormworks.app/Contents/Resources/rom',
  'Contents/Resources/rom',
]

/** A file that says "this really is the game's data folder". */
const MARKER = 'graphics/fonts/tiny.xml'

export type FolderKind = 'game' | 'designs'

export interface GameFolder {
  /** What to show the player — the folder they picked. */
  readonly name: string
  /** The `rom` folder, wherever it turned out to be. */
  readonly rom: FileSystemDirectoryHandle
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

// ------------------------------------------------------------- reading files

async function descend(
  handle: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle | null> {
  let current = handle
  for (const part of path.split('/').filter(Boolean)) {
    try {
      current = await current.getDirectoryHandle(part)
    } catch {
      return null
    }
  }
  return current
}

/** Finds the `rom` folder inside whatever the player picked. */
export async function findRom(
  picked: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle | null> {
  for (const candidate of ROOT_CANDIDATES) {
    const root = await descend(picked, candidate)
    if (!root) continue
    if (await readFile(root, MARKER)) return root
  }
  return null
}

/** Reads a file under the game's data folder, or null if it is not there. */
export async function readFile(
  rom: FileSystemDirectoryHandle,
  path: string,
): Promise<Uint8Array | null> {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (name === undefined) return null
  const folder = await descend(rom, parts.join('/'))
  if (!folder) return null
  try {
    const file = await (await folder.getFileHandle(name)).getFile()
    return new Uint8Array(await file.arrayBuffer())
  } catch {
    return null
  }
}

export async function readText(
  rom: FileSystemDirectoryHandle,
  path: string,
): Promise<string | null> {
  const bytes = await readFile(rom, path)
  return bytes ? new TextDecoder().decode(bytes) : null
}

// ------------------------------------------------------- keeping the choice

/**
 * Opens the picker, starting where this folder was last time. A page cannot
 * name a path — that is the point of the permission — but it can hand back a
 * folder the player has already granted, and the browser remembers the rest
 * against the `id`.
 */
async function pick(id: string, kind: FolderKind): Promise<FileSystemDirectoryHandle> {
  const show = window.showDirectoryPicker as NonNullable<typeof window.showDirectoryPicker>
  const previous = await transact<FileSystemDirectoryHandle | undefined>(
    SETTINGS,
    'readonly',
    (store) => store.get(kind),
  ).catch(() => undefined)
  return show(previous ? { id, mode: 'read', startIn: previous } : { id, mode: 'read' })
}

/** Whether the app may still read the folder, asking only if told to. */
async function stillAllowed(handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const mode = { mode: 'read' } as const
  // Older Chromium versions have no permission methods; there, having the
  // handle at all is the permission
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission(mode)) === 'granted') return true
  if (!ask || !handle.requestPermission) return false
  return (await handle.requestPermission(mode)) === 'granted'
}

/** Asks the player for their Stormworks folder and remembers it. */
export async function connectGameFolder(): Promise<Result<GameFolder>> {
  if (!isSupported()) {
    return err('this browser cannot open a folder; Chrome, Edge and Arc can')
  }
  let picked: FileSystemDirectoryHandle
  try {
    picked = await pick('stormworks', 'game')
  } catch {
    return err('no folder chosen')
  }

  const rom = await findRom(picked)
  if (!rom) {
    return err(`${picked.name} does not look like a Stormworks installation`)
  }

  await transact(SETTINGS, 'readwrite', (store) => store.put(picked, 'game'))
  return ok({ name: picked.name, rom })
}

/**
 * The folder chosen last time, if the browser still allows reading it. Asks for
 * permission only when `ask` is set, so a page load stays quiet.
 */
export async function restoreGameFolder(ask = false): Promise<GameFolder | null> {
  if (!isSupported()) return null
  let picked: FileSystemDirectoryHandle | undefined
  try {
    picked = await transact<FileSystemDirectoryHandle | undefined>(SETTINGS, 'readonly', (store) =>
      store.get('game'),
    )
  } catch {
    return null
  }
  if (!picked || !(await stillAllowed(picked, ask))) return null

  const rom = await findRom(picked)
  return rom ? { name: picked.name, rom } : null
}

export async function forgetFolder(kind: FolderKind): Promise<void> {
  await transact(SETTINGS, 'readwrite', (store) => store.delete(kind))
}

// ------------------------------------------------------ the player's designs

export interface FoundDesign {
  /** How to get back to the file. */
  readonly handle: FileSystemFileHandle
  /** The file's name. */
  readonly file: string
  /** Where it sat, relative to the folder that was picked. */
  readonly where: string
}

/** How far down to look. Deep enough for `workshop/content/573090/<id>/`. */
const SCAN_DEPTH = 3

/**
 * Everything under a folder that could be a microcontroller. Names are not
 * enough to tell — a workshop item calls its file `microcontroller.xml`, a
 * saved one is named after the design — so this collects the XML and lets the
 * codec decide.
 */
export async function findDesigns(
  folder: FileSystemDirectoryHandle,
  depth = SCAN_DEPTH,
  where = '',
): Promise<FoundDesign[]> {
  const found: FoundDesign[] = []
  for await (const entry of folder.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.xml')) {
      found.push({ handle: entry as FileSystemFileHandle, file: entry.name, where })
    } else if (entry.kind === 'directory' && depth > 1) {
      const inside = entry as FileSystemDirectoryHandle
      found.push(
        ...(await findDesigns(inside, depth - 1, where ? `${where}/${entry.name}` : entry.name)),
      )
    }
  }
  return found
}

/** Asks the player where their microcontrollers are, and remembers it. */
export async function connectDesignsFolder(): Promise<
  Result<{ name: string; folder: FileSystemDirectoryHandle }>
> {
  if (!isSupported()) {
    return err('this browser cannot open a folder; Chrome, Edge and Arc can')
  }
  let picked: FileSystemDirectoryHandle
  try {
    picked = await pick('stormworks-designs', 'designs')
  } catch {
    return err('no folder chosen')
  }
  await transact(SETTINGS, 'readwrite', (store) => store.put(picked, 'designs'))
  return ok({ name: picked.name, folder: picked })
}

/** The designs folder chosen last time, if it may still be read. */
export async function restoreDesignsFolder(
  ask = false,
): Promise<{ name: string; folder: FileSystemDirectoryHandle } | null> {
  if (!isSupported()) return null
  let picked: FileSystemDirectoryHandle | undefined
  try {
    picked = await transact<FileSystemDirectoryHandle | undefined>(SETTINGS, 'readonly', (store) =>
      store.get('designs'),
    )
  } catch {
    return null
  }
  if (!picked || !(await stillAllowed(picked, ask))) return null
  return { name: picked.name, folder: picked }
}
