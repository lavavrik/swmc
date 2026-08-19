/** The dark top bar of round buttons, mirroring the in-game toolbar. */
import { useEditorStore } from '@/editor/store'
import { Icon, type IconName } from './icons'
import { createEmpty } from '@/model/ops'

interface ButtonProps {
  icon: IconName
  title: string
  onClick?: () => void
  disabled?: boolean
}

function RoundButton({ icon, title, onClick, disabled = false }: ButtonProps) {
  return (
    <button className="round-button" title={title} onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
    </button>
  )
}

export function Toolbar({
  onOpenPicker,
  showTooltips,
  onToggleTooltips,
}: {
  onOpenPicker: () => void
  showTooltips: boolean
  onToggleTooltips: () => void
}) {
  const load = useEditorStore((s) => s.load)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const copy = useEditorStore((s) => s.copy)
  const cut = useEditorStore((s) => s.cut)
  const paste = useEditorStore((s) => s.paste)
  const canUndo = useEditorStore((s) => s.history.past.length > 0)
  const canRedo = useEditorStore((s) => s.history.future.length > 0)
  const hasSelection = useEditorStore((s) => s.selection.length > 0)
  const hasClipboard = useEditorStore((s) => s.clipboard !== null)

  return (
    <div className="toolbar">
      <RoundButton
        icon="close"
        title="Discard and start again"
        onClick={() => load(createEmpty())}
      />
      <RoundButton icon="confirm" title="Confirm (not yet implemented)" disabled />
      <span className="toolbar-gap" />
      <RoundButton icon="new" title="Add component" onClick={onOpenPicker} />
      <RoundButton icon="open" title="Open — arrives with XML import" disabled />
      <RoundButton icon="save" title="Save — arrives with XML export" disabled />
      <RoundButton icon="workshop" title="Steam Workshop — not applicable" disabled />
      <RoundButton icon="preview3d" title="3D preview — not yet implemented" disabled />
      <RoundButton
        icon="tooltips"
        title={showTooltips ? 'Hide component descriptions' : 'Show component descriptions'}
        onClick={onToggleTooltips}
      />
      <span className="toolbar-gap" />
      <RoundButton icon="undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
      <RoundButton icon="redo" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
      <span className="toolbar-gap" />
      <RoundButton icon="copy" title="Copy (Ctrl+C)" onClick={copy} disabled={!hasSelection} />
      <RoundButton icon="cut" title="Cut (Ctrl+X)" onClick={cut} disabled={!hasSelection} />
      <RoundButton icon="paste" title="Paste (Ctrl+V)" onClick={paste} disabled={!hasClipboard} />
    </div>
  )
}
