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
  onOpenPins,
  onOpenGameFiles,
  onOpenProjects,
  onSaveProject,
  showTooltips,
  onToggleTooltips,
  accountLabel,
  onAccount,
  onOpenHelp,
}: {
  onOpenPicker: () => void
  onOpenPins: () => void
  onOpenGameFiles: () => void
  onOpenProjects: () => void
  onSaveProject: () => void
  showTooltips: boolean
  onToggleTooltips: () => void
  accountLabel?: string
  onAccount?: () => void
  onOpenHelp: () => void
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
      <RoundButton icon="pins" title="Microcontroller pins" onClick={onOpenPins} />
      <RoundButton icon="open" title="Open or import a microcontroller" onClick={onOpenProjects} />
      <RoundButton
        icon="save"
        title="Save or export this microcontroller"
        onClick={onSaveProject}
      />
      <RoundButton icon="gamefiles" title="Your Stormworks files" onClick={onOpenGameFiles} />
      <RoundButton icon="preview3d" title="3D preview — not yet implemented" disabled />
      <RoundButton
        icon="tooltips"
        title={showTooltips ? 'Hide component names' : 'Show component names'}
        onClick={onToggleTooltips}
      />
      <span className="toolbar-gap" />
      <RoundButton icon="undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
      <RoundButton icon="redo" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
      <span className="toolbar-gap" />
      <RoundButton icon="copy" title="Copy (Ctrl+C)" onClick={copy} disabled={!hasSelection} />
      <RoundButton icon="cut" title="Cut (Ctrl+X)" onClick={cut} disabled={!hasSelection} />
      <RoundButton icon="paste" title="Paste (Ctrl+V)" onClick={paste} disabled={!hasClipboard} />
      <button
        className="text-button toolbar-help"
        title="Build microcontrollers with Claude Code, Codex or another AI agent"
        onClick={onOpenHelp}
      >
        AI agents
      </button>
      {onAccount && (
        <button
          className="text-button account-button toolbar-account"
          title={
            accountLabel && accountLabel !== 'Sign in'
              ? 'Account, agent access and sign out'
              : 'Sign in to save projects to your CloudHost account'
          }
          onClick={onAccount}
        >
          {accountLabel ?? 'Sign in'}
        </button>
      )}
    </div>
  )
}
