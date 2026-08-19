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
import { SCRIPT_CHARACTER_LIMIT } from '@/lua/api'
import { setDrawTarget } from '@/lua/runner'
import { MONITORS } from '@/lua/screen'
import { useLuaStore } from '@/lua/store'
import { useSimulationStore } from '@/sim/store'
import type { NodeId } from '@/model/types'
import { configureMonaco } from './monaco'
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
  const size = MONITORS[monitor] ?? MONITORS[0]

  // Only the script being edited draws, so the rest cost nothing
  useEffect(() => {
    setDrawTarget({ node, width: size.width, height: size.height })
    return () => setDrawTarget(null)
  }, [node, size.width, size.height])

  const overLimit = script.length > SCRIPT_CHARACTER_LIMIT

  return (
    <div className="lua-editor">
      <header className="lua-header">
        <h2>Lua Script</h2>
        <span className={`lua-count${overLimit ? ' over' : ''}`}>
          {script.length} / {SCRIPT_CHARACTER_LIMIT} characters
        </span>
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
            onChange={(value) => setProperty(node, 'script', value ?? '')}
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
            node={node}
            width={size.width}
            height={size.height}
            scale={Math.max(1, Math.floor(288 / size.width))}
          />
          <p className="panel-hint">
            Write <code>onTick()</code> to read inputs and write outputs, and <code>onDraw()</code>{' '}
            to draw on the monitor.
          </p>
        </aside>
      </div>

      {error && <p className="lua-error">{error}</p>}
    </div>
  )
}
