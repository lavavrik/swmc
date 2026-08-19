/** Edits the properties of the selected component, driven by its definition. */
import { getComponent } from '@/library/registry'
import { resolvePorts } from '@/library/ports'
import { useEditorStore } from '@/editor/store'
import type { PropertyDef } from '@/library/types'
import type { PropertyValue } from '@/model/types'
import { SIGNAL_LABELS, signalColor } from './signals'

function Field({
  property,
  value,
  onChange,
}: {
  property: PropertyDef
  value: PropertyValue | undefined
  onChange: (next: PropertyValue) => void
}) {
  switch (property.kind) {
    case 'number':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : property.default}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )
    case 'text':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : property.default}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'bool':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      )
    case 'dropdown':
      return (
        <select
          value={typeof value === 'string' ? value : property.default}
          onChange={(e) => onChange(e.target.value)}
        >
          {property.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'slider':
      return (
        <input
          type="range"
          min={property.min}
          max={property.max}
          step={property.step}
          value={typeof value === 'number' ? value : property.default}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )
  }
}

export function PropertyPanel() {
  const selection = useEditorStore((s) => s.selection)
  const node = useEditorStore((s) => s.doc.nodes.find((n) => n.id === s.selection[0]))
  const setProperty = useEditorStore((s) => s.setProperty)
  const openScript = useEditorStore((s) => s.openScript)

  if (selection.length === 0) return null
  if (selection.length > 1) {
    return (
      <aside className="panel">
        <h2>{selection.length} components selected</h2>
        <p className="panel-hint">Select a single component to edit its properties.</p>
      </aside>
    )
  }
  const def = node && getComponent(node.type)
  if (!node || !def) return null

  return (
    <aside className="panel">
      <h2>{def.name}</h2>
      <p className="panel-hint">{def.description}</p>

      {def.id === 'data.luaScript' && (
        <button className="text-button primary panel-action" onClick={() => openScript(node.id)}>
          Edit script
        </button>
      )}

      {def.properties.length > 0 && (
        <div className="panel-fields">
          {def.properties
            .filter((property) => property.key !== 'script')
            .map((property) => (
              <label key={property.key}>
                <span>{property.label}</span>
                <Field
                  property={property}
                  value={node.properties[property.key]}
                  onChange={(next) => setProperty(node.id, property.key, next)}
                />
              </label>
            ))}
        </div>
      )}

      <PortList title="Inputs" ports={resolvePorts(def, 'in', node.properties)} />
      <PortList title="Outputs" ports={resolvePorts(def, 'out', node.properties)} />
    </aside>
  )
}

function PortList({
  title,
  ports,
}: {
  title: string
  ports: readonly { label: string; signal: keyof typeof SIGNAL_LABELS }[]
}) {
  if (ports.length === 0) return null
  return (
    <div className="panel-ports">
      <h3>{title}</h3>
      <ul>
        {ports.map((port, i) => (
          <li key={i}>
            <span className="port-swatch" style={{ background: signalColor(port.signal) }} />
            {port.label}
            <em>{SIGNAL_LABELS[port.signal]}</em>
          </li>
        ))}
      </ul>
    </div>
  )
}
