/**
 * A monitor attached to a video signal anywhere in the graph.
 *
 * The game has no monitor component inside a microcontroller — a monitor is a
 * block on the vehicle — so this is an instrument rather than a component: it
 * watches a port without touching the document, which means exports and saved
 * files are unaffected by where it happens to be pointed.
 *
 * Attaching it tells whatever script is upstream how big the screen is, so
 * `screen.getWidth()` answers the same as it would in the game.
 */
import { useEffect, useMemo, useState } from 'react'
import { getComponent } from '@/library/registry'
import { resolvePorts } from '@/library/ports'
import { MONITORS, type VideoFrame } from '@/library/video'
import { setWatched } from '@/lua/runner'
import { useEditorStore } from '@/editor/store'
import { simulation } from '@/sim/store'
import { videoChain } from '@/sim/video'
import type { Microcontroller, PortId } from '@/model/types'
import { ScreenPreview } from './ScreenPreview'

/** The video value arriving at a port right now, if it is carrying one. */
function frameAt(doc: Microcontroller, port: PortId): VideoFrame | null {
  const source =
    port.kind === 'out'
      ? port
      : doc.wires.find(
          (w) => w.to.node === port.node && w.to.kind === 'in' && w.to.index === port.index,
        )?.from
  if (!source) return null
  const value = simulation.outputValue(source)
  return value !== null && typeof value === 'object' && 'kind' in value && value.kind === 'video'
    ? value
    : null
}

/** What the monitor is looking at, in words. */
function describe(doc: Microcontroller, port: PortId): string {
  const node = doc.nodes.find((n) => n.id === port.node)
  const def = node && getComponent(node.type)
  if (!node || !def) return 'nothing'
  const label = typeof node.properties.label === 'string' ? node.properties.label : ''
  const ports = resolvePorts(def, port.kind, node.properties)
  return `${label || def.name} · ${ports[port.index]?.label ?? 'video'}`
}

export function MonitorPanel({ port, onClose }: { port: PortId; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc)
  const [monitor, setMonitor] = useState(0)
  const size = MONITORS[monitor] ?? MONITORS[0]

  // Tell every script feeding this port what size screen it is drawing for
  const chain = useMemo(() => videoChain(doc, port), [doc, port])
  useEffect(() => {
    setWatched('monitor', new Map(chain.map((id) => [id, size])))
    return () => setWatched('monitor', new Map())
  }, [chain, size])

  return (
    <aside className="panel monitor-panel">
      <header className="monitor-header">
        <h2>Monitor</h2>
        <button className="text-button" onClick={onClose} title="Detach the monitor">
          Detach
        </button>
      </header>
      <p className="panel-hint">{describe(doc, port)}</p>

      <label className="lua-monitor">
        <span>Size</span>
        <select value={monitor} onChange={(e) => setMonitor(Number(e.target.value))}>
          {MONITORS.map((m, i) => (
            <option key={m.label} value={i}>
              {m.label} — {m.width}×{m.height}
            </option>
          ))}
        </select>
      </label>

      <ScreenPreview
        frame={() => frameAt(doc, port)}
        width={size.width}
        height={size.height}
        scale={Math.max(1, Math.floor(288 / size.width))}
      />
    </aside>
  )
}
