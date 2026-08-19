/**
 * The microcontroller's pins during simulation: set what arrives on the inputs,
 * watch what leaves the outputs.
 */
import { formatSignal } from '@/sim/format'
import { useSimulationStore } from '@/sim/store'
import { SIGNAL_LABELS, signalColor } from './signals'
import type { SignalType } from '@/model/types'

export function PinPanel() {
  const pins = useSimulationStore((s) => s.pins)
  const inputs = useSimulationStore((s) => s.inputs)
  const outputs = useSimulationStore((s) => s.outputs)
  const setInput = useSimulationStore((s) => s.setInput)

  if (pins.length === 0) return null

  return (
    <aside className="panel pin-panel">
      <h2>Microcontroller pins</h2>
      <p className="panel-hint">Set the values arriving from the vehicle.</p>

      {pins.map((pin) => {
        const value = pin.direction === 'in' ? inputs[pin.id] : outputs.get(pin.id)
        return (
          <div key={pin.id} className="pin-row">
            <span
              className="port-swatch"
              style={{ background: signalColor(pin.signal as SignalType) }}
            />
            <span className="pin-label" title={SIGNAL_LABELS[pin.signal as SignalType]}>
              {pin.label}
            </span>
            {pin.direction === 'in' && pin.signal === 'number' && (
              <input
                type="number"
                value={typeof value === 'number' ? value : 0}
                onChange={(e) => setInput(pin.id, Number(e.target.value))}
              />
            )}
            {pin.direction === 'in' && pin.signal === 'onoff' && (
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => setInput(pin.id, e.target.checked)}
              />
            )}
            {(pin.direction === 'out' || (pin.signal !== 'number' && pin.signal !== 'onoff')) && (
              <span className="pin-value">{formatSignal(value) || '—'}</span>
            )}
          </div>
        )
      })}
    </aside>
  )
}
