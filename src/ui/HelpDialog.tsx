/**
 * The agent (MCP) guide, in the editor. The text is `docs/agents.md` itself,
 * bundled at build time, so the page and the repository never disagree.
 * `?help=agents` opens it directly.
 */
import { useMemo, type MouseEvent } from 'react'
import guide from '../../docs/agents.md?raw'
import { renderGuide } from './helpGuide'

export function HelpDialog({ onClose }: { onClose: () => void }) {
  // Our own document, bundled with the app: no outside input reaches this HTML
  const html = useMemo(() => renderGuide(guide), [])

  // In-page links scroll the dialog rather than the app
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a')
    const href = link?.getAttribute('href')
    if (!href?.startsWith('#')) return
    event.preventDefault()
    event.currentTarget
      .querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="picker-backdrop" onPointerDown={onClose}>
      <div
        className="picker dialog help-dialog"
        role="dialog"
        aria-label="Using swmc with an AI agent"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="dialog-header agent-header">
          <h2>Help</h2>
          <button className="text-button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="help-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
