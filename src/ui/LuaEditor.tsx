/**
 * The Lua script editor.
 *
 * Opens over the workspace for one script component: Monaco on the left with
 * Stormworks completions, the monitor preview on the right, and the interpreter
 * running live underneath — edits take effect on the next tick.
 */
import Editor from '@monaco-editor/react'
import { useEffect, useState } from 'react'
import { useEditorStore } from '@/editor/store'
import { SCRIPT_LIMITS } from '@/lua/api'
import { minifyLua, type MinifyResult } from '@/lua/minify'
import { frameFor, setMonitorTouch, setWatched } from '@/lua/runner'
import { MONITORS } from '@/library/video'
import { useLuaStore } from '@/lua/store'
import { useSimulationStore } from '@/sim/store'
import type { NodeId } from '@/model/types'
import { configureMonaco } from './monaco'
import { MinifiedScript } from './MinifiedScript'
import { ScreenPreview } from './ScreenPreview'

configureMonaco()

export function LuaEditor({ node, onClose }: { node: NodeId; onClose: () => void }) {
  const script = useEditorStore((s) => {
    const found = s.doc.nodes.find((n) => n.id === node)
    return typeof found?.properties.script === 'string' ? found.properties.script : ''
  })
  const setProperty = useEditorStore((s) => s.setProperty)
  const error = useLuaStore((s) => s.errors[node] ?? null)
  const running = useSimulationStore((s) => s.running)
  const toggle = useSimulationStore((s) => s.toggle)

  const [monitor, setMonitor] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [minified, setMinified] = useState<MinifyResult | null>(null)
  const [touching, setTouching] = useState(false)
  const size = MONITORS[monitor] ?? MONITORS[0]

  // Only the script being edited draws for this watcher, so the rest cost nothing
  useEffect(() => {
    setWatched('editor', new Map([[node, size]]))
    // The monitor reports its size back even when nothing is touching it, which
    // is how a script learns how big its screen is
    setMonitorTouch(node, { width: size.width, height: size.height, x: 0, y: 0, pressed: false })
    return () => {
      setWatched('editor', new Map())
      setMonitorTouch(node, null)
    }
  }, [node, size])

  // Past the base limit the script needs the Space DLC; past that it fits nowhere
  const minify = () => {
    const result = minifyLua(script)
    if (result.error !== null) {
      setNote(`Could not minify: ${result.error}`)
      return
    }
    setNote(null)
    setMinified(result)
  }

  const overBase = script.length > SCRIPT_LIMITS.base
  const overDlc = script.length > SCRIPT_LIMITS.spaceDlc

  return (
    <div className="lua-editor">
      <header className="lua-header">
        <h2>Lua Script</h2>
        <span
          className={`lua-count${overDlc ? ' over' : overBase ? ' warn' : ''}`}
          title={
            overDlc
              ? 'Too long for the game'
              : overBase
                ? `Over the base game's ${SCRIPT_LIMITS.base} characters; needs the Space DLC`
                : 'Fits in the base game'
          }
        >
          {script.length} / {SCRIPT_LIMITS.base}
          <span className="lua-count-dlc"> · {SCRIPT_LIMITS.spaceDlc} with Space DLC</span>
        </span>
        {note && <span className="lua-note">{note}</span>}
        <button
          className="text-button"
          title="Strip comments and spacing, without changing what the script does"
          onClick={minify}
        >
          Minify
        </button>
        <button className="text-button" onClick={toggle}>
          {running ? 'Pause simulation' : 'Run simulation'}
        </button>
        <button className="text-button primary" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="lua-body">
        <div className="lua-code">
          <Editor
            language="lua"
            theme="vs-dark"
            value={script}
            onChange={(value) => {
              setNote(null)
              setProperty(node, 'script', value ?? '')
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              tabSize: 2,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              rulers: [],
            }}
          />
        </div>

        <aside className="lua-side">
          <label className="lua-monitor">
            <span>Monitor</span>
            <select value={monitor} onChange={(e) => setMonitor(Number(e.target.value))}>
              {MONITORS.map((m, i) => (
                <option key={m.label} value={i}>
                  {m.label} — {m.width}×{m.height}
                </option>
              ))}
            </select>
          </label>
          <ScreenPreview
            frame={() => frameFor(node)}
            width={size.width}
            height={size.height}
            scale={Math.max(1, Math.floor(288 / size.width))}
            onTouch={(touch) => {
              setTouching(touch?.pressed === true)
              setMonitorTouch(node, {
                width: size.width,
                height: size.height,
                x: touch?.x ?? 0,
                y: touch?.y ?? 0,
                pressed: touch?.pressed === true,
              })
            }}
          />
          <p className="panel-hint monitor-hint">
            {touching ? 'Touching the screen' : 'Click the screen to touch it'}
          </p>
          <p className="panel-hint">
            Write <code>onTick()</code> to read inputs and write outputs, and <code>onDraw()</code>{' '}
            to draw on the monitor.
          </p>
        </aside>
      </div>

      {error && <p className="lua-error">{error}</p>}

      {minified && (
        <MinifiedScript
          result={minified}
          onReplace={() => {
            setProperty(node, 'script', minified.code, false)
            setMinified(null)
          }}
          onClose={() => setMinified(null)}
        />
      )}
    </div>
  )
}
