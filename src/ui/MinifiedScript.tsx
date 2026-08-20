/**
 * The result of minifying, shown beside the script rather than in place of it.
 *
 * Overwriting the source would cost the author their formatting and their
 * names for a saving they only need when the script is going into the game, so
 * this is a copy to take away — with replacing it an explicit, undoable choice.
 */
import { useState } from 'react'
import { SCRIPT_LIMITS } from '@/lua/api'
import type { MinifyResult } from '@/lua/minify'

interface Props {
  result: MinifyResult
  onReplace: () => void
  onClose: () => void
}

export function MinifiedScript({ result, onReplace, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const saved = result.before - result.after
  const percent = result.before > 0 ? Math.round((saved / result.before) * 100) : 0

  const copy = () => {
    void navigator.clipboard?.writeText(result.code).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div className="picker-backdrop" onPointerDown={onClose}>
      <div className="picker dialog minified" onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog-header">
          <h2>Minified script</h2>
        </header>

        <div className="dialog-row">
          <span className="minified-summary">
            {result.before} → <strong>{result.after}</strong> characters, {percent}% smaller
            {result.renamed > 0 ? `, ${result.renamed} names shortened` : ''}
            {result.after <= SCRIPT_LIMITS.base
              ? ' · fits the base game'
              : result.after <= SCRIPT_LIMITS.spaceDlc
                ? ' · needs the Space DLC'
                : ' · still too long'}
          </span>
          <button className="text-button primary" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="text-button" onClick={onReplace}>
            Replace script
          </button>
        </div>

        {result.note && <p className="dialog-note">{result.note}</p>}

        <pre className="minified-code">{result.code}</pre>
      </div>
    </div>
  )
}
