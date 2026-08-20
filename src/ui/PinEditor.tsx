/**
 * The microcontroller's own input and output pins.
 *
 * These are the connections the vehicle sees, so they need naming, ordering and
 * placing on the block's faces — none of which fits in a per-component property
 * panel. They are ordinary nodes on the canvas underneath, so everything here
 * goes through the same operations as any other edit and undoes the same way.
 */
import { useMemo } from 'react'
import { getComponent } from '@/library/registry'
import { useEditorStore } from '@/editor/store'
import { SIGNAL_TYPES, type NodeId, type SignalType } from '@/model/types'
import { SIGNAL_LABELS, signalColor } from './signals'

const DIRECTIONS = [
  { value: 'in', label: 'input' },
  { value: 'out', label: 'output' },
] as const

/** Every pin type the game has: each signal, in each direction. */
const PIN_TYPES = DIRECTIONS.flatMap((direction) =>
  SIGNAL_TYPES.map((signal) => ({
    type: `io.${direction.value}.${signal}`,
    label: `${SIGNAL_LABELS[signal]} ${direction.label}`,
  })),
)

export function PinEditor({ onClose }: { onClose: () => void }) {
  // Selectors must return a stable value, so the list is derived outside one
  const doc = useEditorStore((s) => s.doc)
  const pins = useMemo(
    () =>
      doc.ioOrder.flatMap((id) => {
        const node = doc.nodes.find((n) => n.id === id)
        return node ? [node] : []
      }),
    [doc],
  )
  const setProperty = useEditorStore((s) => s.setProperty)
  const setNodeType = useEditorStore((s) => s.setNodeType)
  const addPin = useEditorStore((s) => s.addPin)
  const reorderPins = useEditorStore((s) => s.reorderPins)
  const selectOnly = useEditorStore((s) => s.selectOnly)
  const removeNodes = useEditorStore((s) => s.deleteSelection)

  const move = (id: NodeId, by: number) => {
    const order = pins.map((p) => p.id)
    const from = order.indexOf(id)
    const to = from + by
    if (from < 0 || to < 0 || to >= order.length) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, id)
    reorderPins(next)
  }

  const remove = (id: NodeId) => {
    selectOnly([id])
    removeNodes()
  }

  return (
    <aside className="panel pin-editor">
      <header className="monitor-header">
        <h2>Microcontroller pins</h2>
        <button className="text-button" onClick={onClose} title="Close">
          Close
        </button>
      </header>
      <p className="panel-hint">
        The connections the vehicle sees. Their order here is the order they appear on the block.
      </p>

      {pins.length === 0 && <p className="panel-hint">No pins yet.</p>}

      {pins.map((pin, index) => {
        const signal = pin.type.split('.')[2] as SignalType
        const known = getComponent(pin.type)
        return (
          <div key={pin.id} className="pin-edit-row">
            <div className="pin-edit-head">
              <span className="port-swatch" style={{ background: signalColor(signal) }} />
              <select value={pin.type} onChange={(e) => setNodeType(pin.id, e.target.value)}>
                {PIN_TYPES.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                className="text-button tiny"
                title="Move up"
                disabled={index === 0}
                onClick={() => move(pin.id, -1)}
              >
                ↑
              </button>
              <button
                className="text-button tiny"
                title="Move down"
                disabled={index === pins.length - 1}
                onClick={() => move(pin.id, 1)}
              >
                ↓
              </button>
              <button className="text-button tiny" title="Remove" onClick={() => remove(pin.id)}>
                ✕
              </button>
            </div>

            <input
              className="pin-edit-name"
              placeholder={known?.name ?? 'name'}
              value={String(pin.properties.label ?? '')}
              onChange={(e) => setProperty(pin.id, 'label', e.target.value)}
            />
            <input
              className="pin-edit-description"
              placeholder="description"
              value={String(pin.properties.description ?? '')}
              onChange={(e) => setProperty(pin.id, 'description', e.target.value)}
            />
            <div className="pin-edit-face">
              <label>
                <span>face x</span>
                <input
                  type="number"
                  value={Number(pin.properties.faceX ?? 0)}
                  onChange={(e) => setProperty(pin.id, 'faceX', Number(e.target.value))}
                />
              </label>
              <label>
                <span>z</span>
                <input
                  type="number"
                  value={Number(pin.properties.faceZ ?? 0)}
                  onChange={(e) => setProperty(pin.id, 'faceZ', Number(e.target.value))}
                />
              </label>
            </div>
          </div>
        )
      })}

      <div className="pin-edit-add">
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value !== '') addPin(e.target.value)
            e.currentTarget.value = ''
          }}
        >
          <option value="" disabled>
            Add a pin…
          </option>
          {PIN_TYPES.map((option) => (
            <option key={option.type} value={option.type}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  )
}
