/**
 * Pointing the app at a player's own Stormworks installation.
 *
 * Two folders are worth connecting, and they live in different places: the
 * game's data, which holds assets like the monitor font, and wherever their
 * microcontrollers are saved — their own under `Stormworks/data/microprocessors`,
 * subscribed ones under `steamapps/workshop/content/573090`.
 *
 * Everything is read where it sits. Nothing is copied and nothing leaves the
 * machine.
 */
import { useEffect, useState } from 'react'
import { connectDesignsFolder, connectGameFolder, forgetFolder, isSupported } from '@/io/gameFiles'
import {
  designPaths,
  detectPlatform,
  gamePaths,
  pasteHint,
  type SuggestedPath,
} from '@/io/gamePaths'
import { loadFontFrom, adoptBundledFont } from '@/lua/gameFont'
import { tinyFont } from '@/lua/tinyFont'
import { useGameFilesStore } from './gameFilesStore'

/** The paths worth going to, each one click from the clipboard. */
function Paths({
  paths,
  copied,
  onCopy,
}: {
  paths: readonly SuggestedPath[]
  copied: string | null
  onCopy: (path: string | null) => void
}) {
  return (
    <ul className="folder-paths">
      {paths.map((suggested) => (
        <li key={suggested.path}>
          <span className="folder-path-label">{suggested.label}</span>
          <code>{suggested.path}</code>
          <button
            className="text-button tiny"
            onClick={() => {
              void navigator.clipboard?.writeText(suggested.path).then(
                () => onCopy(suggested.path),
                () => onCopy(null),
              )
            }}
          >
            {copied === suggested.path ? 'Copied' : 'Copy'}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function GameFilesDialog({ onClose }: { onClose: () => void }) {
  const game = useGameFilesStore((s) => s.game)
  const designs = useGameFilesStore((s) => s.designs)
  const setGame = useGameFilesStore((s) => s.setGame)
  const setDesigns = useGameFilesStore((s) => s.setDesigns)
  const [problem, setProblem] = useState<string | null>(null)
  const [face, setFace] = useState(tinyFont().face)
  const [copied, setCopied] = useState<string | null>(null)
  const platform = detectPlatform()

  useEffect(() => setFace(tinyFont().face), [game])

  const connectGame = async () => {
    const result = await connectGameFolder()
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    const fontProblem = await loadFontFrom(result.value.rom)
    setProblem(fontProblem)
    setGame(result.value)
    setFace(tinyFont().face)
  }

  const connectDesigns = async () => {
    const result = await connectDesignsFolder()
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    setProblem(null)
    setDesigns(result.value)
  }

  const supported = isSupported()

  return (
    <div className="picker-backdrop" onPointerDown={onClose}>
      <div className="picker dialog" onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog-header">
          <h2>Your Stormworks files</h2>
        </header>

        <p className="dialog-note plain">
          Read where they sit, on this machine only. Nothing is copied and nothing is uploaded. A
          page cannot open a folder by name, so copy a path below — {pasteHint(platform)}
        </p>

        {!supported && (
          <p className="dialog-note">
            This browser cannot open a folder. Chrome, Edge and Arc can; Safari and Firefox do not
            implement it yet, so the app uses what it has bundled.
          </p>
        )}

        <div className="folder-row">
          <div>
            <h3>Game files</h3>
            <p className="panel-hint">
              The Stormworks folder, its <code>rom</code> folder, or the application itself. Used
              for the monitor font — currently {face}.
            </p>
            <Paths paths={gamePaths(platform)} copied={copied} onCopy={setCopied} />
            {game && <p className="folder-current">Reading {game.name}</p>}
          </div>
          <div className="folder-actions">
            <button
              className="text-button primary"
              disabled={!supported}
              onClick={() => void connectGame()}
            >
              {game ? 'Change…' : 'Choose…'}
            </button>
            {game && (
              <button
                className="text-button"
                onClick={() => {
                  void forgetFolder('game')
                  adoptBundledFont()
                  setGame(null)
                  setFace(tinyFont().face)
                }}
              >
                Forget
              </button>
            )}
          </div>
        </div>

        <div className="folder-row">
          <div>
            <h3>Microcontrollers</h3>
            <p className="panel-hint">
              Where your designs are saved. Whichever you point at, they appear in the open dialog.
            </p>
            <Paths paths={designPaths(platform)} copied={copied} onCopy={setCopied} />
            {designs && <p className="folder-current">Reading {designs.name}</p>}
          </div>
          <div className="folder-actions">
            <button
              className="text-button primary"
              disabled={!supported}
              onClick={() => void connectDesigns()}
            >
              {designs ? 'Change…' : 'Choose…'}
            </button>
            {designs && (
              <button
                className="text-button"
                onClick={() => {
                  void forgetFolder('designs')
                  setDesigns(null)
                }}
              >
                Forget
              </button>
            )}
          </div>
        </div>

        {problem && <p className="dialog-problem">{problem}</p>}
      </div>
    </div>
  )
}
