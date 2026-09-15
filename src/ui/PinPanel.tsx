/**
 * The microcontroller's pins during simulation: set what arrives on the inputs,
 * watch what leaves the outputs.
 */
import { useState } from 'react'
import { formatSignal } from '@/sim/format'
import { useSimulationStore } from '@/sim/store'
import { SIGNAL_LABELS, signalColor } from './signals'
import type { SignalType } from '@/model/types'
import { compositeNumber, withCompositeNumber } from '@/library/values'
import { isDecimalDraft, parseDecimal } from './decimal'

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
        const colour = signalColor(pin.signal as SignalType)
        // Same as the canvas: inputs are rings, outputs are solid
        return (
          <div key={pin.id} className="pin-row">
            <span
              className={`port-swatch port-swatch-${pin.direction}`}
              style={pin.direction === 'in' ? { borderColor: colour } : { background: colour }}
              title={pin.direction === 'in' ? 'input' : 'output'}
            />
            <span
              className="pin-label"
              title={
                pin.signal === 'composite'
                  ? pin.description || 'composite number channel 2 (seat W/S)'
                  : pin.description || SIGNAL_LABELS[pin.signal as SignalType]
              }
            >
              {pin.label}
            </span>
            {pin.direction === 'in' && pin.signal === 'number' && (
              <PinNumberField
                value={typeof value === 'number' ? value : 0}
                onChange={(n) => setInput(pin.id, n)}
              />
            )}
            {pin.direction === 'in' && pin.signal === 'onoff' && (
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => setInput(pin.id, e.target.checked)}
              />
            )}
            {pin.direction === 'in' && pin.signal === 'composite' && (
              <PinNumberField
                value={compositeNumber(value, compositeEditChannel(pin))}
                title={`composite number channel ${compositeEditChannel(pin)}`}
                onChange={(n) =>
                  setInput(pin.id, withCompositeNumber(value, compositeEditChannel(pin), n))
                }
              />
            )}
            {(pin.direction === 'out' ||
              (pin.signal !== 'number' && pin.signal !== 'onoff' && pin.signal !== 'composite')) && (
              <span className="pin-value">{formatSignal(value) || '—'}</span>
            )}
          </div>
        )
      })}
    </aside>
  )
}

/** Seat W/S is ch 2; physics absolute speed is ch 13. */
function compositeEditChannel(pin: { label: string; description: string }): number {
  const text = `${pin.label} ${pin.description}`.toLowerCase()
  if (text.includes('physics')) return 13
  if (text.includes('seat') || text.includes('w/s')) return 2
  return 1
}

/** Text field so "0." and "0," survive; `type="number"` would swallow the separator. */
function PinNumberField({
  value,
  onChange,
  title,
}: {
  value: number
  onChange: (n: number) => void
  title?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="pin-number"
      type="text"
      inputMode="decimal"
      title={title}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        const raw = e.target.value
        if (!isDecimalDraft(raw)) return
        setDraft(raw)
        const n = parseDecimal(raw)
        if (n !== null) onChange(n)
      }}
      onBlur={() => {
        const n = draft === null ? value : (parseDecimal(draft) ?? 0)
        setDraft(null)
        onChange(n)
      }}
    />
  )
}
