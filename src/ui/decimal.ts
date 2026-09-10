/**
 * Decimal typing for pin values.
 *
 * A controlled `type="number"` field cannot hold "0." or "0," — `Number("0.")`
 * is 0, so the separator vanishes on every keystroke. These helpers keep the
 * draft and treat both `.` and `,` as a decimal point.
 */

const DRAFT = /^-?\d*[.,]?\d*$/

export function isDecimalDraft(raw: string): boolean {
  return DRAFT.test(raw.trim())
}

/** Parses a draft. `null` while the text is not yet a number (`""`, `"-"`, `"."`). */
export function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === ',') return null
  const normalized = trimmed.includes('.') ? trimmed.replace(/,/g, '') : trimmed.replace(',', '.')
  if (!/^-?\d+\.?\d*$|^-?\.\d+$/.test(normalized)) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}
