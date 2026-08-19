/** The bottom bar: microcontroller size, a status message, and the picker button. */
import { useEditorStore } from '@/editor/store'
import { Icon } from './icons'
import { SimulationControls } from './SimulationControls'

function SizeControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="size-control">
      <button
        className="square-button"
        title={`Decrease ${label}`}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" size={18} />
      </button>
      <span className="size-value">
        {label} {value}
      </span>
      <button
        className="square-button"
        title={`Increase ${label}`}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}

export function StatusBar({ onOpenPicker }: { onOpenPicker: () => void }) {
  const meta = useEditorStore((s) => s.doc.meta)
  const setMeta = useEditorStore((s) => s.setMeta)
  const problem = useEditorStore((s) => s.problem)
  // Selectors must return stable values; selecting one number each keeps the
  // store from re-rendering on every unrelated change.
  const nodeCount = useEditorStore((s) => s.doc.nodes.length)
  const wireCount = useEditorStore((s) => s.doc.wires.length)
  const selectedCount = useEditorStore((s) => s.selection.length)

  return (
    <div className="statusbar">
      <input
        className="name-field"
        value={meta.name}
        title="Microcontroller name"
        onChange={(e) => setMeta({ name: e.target.value })}
      />
      <SizeControl label="width" value={meta.width} onChange={(width) => setMeta({ width })} />
      <SizeControl label="length" value={meta.length} onChange={(length) => setMeta({ length })} />
      <SimulationControls />
      <div className="status-message">
        {problem ? (
          <span className="status-problem">{problem}</span>
        ) : (
          <span>
            {nodeCount} components · {wireCount} wires
            {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
          </span>
        )}
      </div>
      <button className="round-button primary" title="Add component" onClick={onOpenPicker}>
        <Icon name="components" />
      </button>
    </div>
  )
}
