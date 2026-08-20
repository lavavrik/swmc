/** Which of the player's folders the app is currently reading. */
import { create } from 'zustand'
import { restoreDesignsFolder, restoreGameFolder, type GameFolder } from '@/io/gameFiles'
import { loadFontFrom } from '@/lua/gameFont'

export interface DesignsFolder {
  readonly name: string
  readonly folder: FileSystemDirectoryHandle
}

interface GameFilesState {
  game: GameFolder | null
  designs: DesignsFolder | null
  setGame(folder: GameFolder | null): void
  setDesigns(folder: DesignsFolder | null): void
}

export const useGameFilesStore = create<GameFilesState>((set) => ({
  game: null,
  designs: null,
  setGame: (game) => set({ game }),
  setDesigns: (designs) => set({ designs }),
}))

/**
 * Picks up folders chosen on an earlier visit, without prompting: a page load
 * should never put a permission dialog in the player's way.
 */
export async function restoreFolders(): Promise<void> {
  const [game, designs] = await Promise.all([restoreGameFolder(), restoreDesignsFolder()])
  if (game) {
    await loadFontFrom(game.rom)
    useGameFilesStore.getState().setGame(game)
  }
  if (designs) useGameFilesStore.getState().setDesigns(designs)
}
