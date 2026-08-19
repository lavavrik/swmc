/**
 * Undo history.
 *
 * The document is a persistent immutable value, so a history entry is simply a
 * past document rather than a diff — sharing means an entry costs a few arrays,
 * not a copy of the graph. Entries are labelled so consecutive edits of the
 * same kind (typing in a property field) can coalesce into one undo step.
 */

export interface HistoryEntry<T> {
  readonly label: string
  readonly value: T
}

export interface History<T> {
  readonly past: readonly HistoryEntry<T>[]
  readonly future: readonly HistoryEntry<T>[]
}

export const EMPTY_HISTORY: History<never> = { past: [], future: [] }

/** Maximum number of undo steps kept. */
export const HISTORY_LIMIT = 200

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] }
}

/**
 * Records `present` as undoable before an edit labelled `label` is applied.
 * When `coalesce` is set and the previous entry has the same label, the
 * previous entry is kept instead — so a run of small edits is one undo step.
 */
export function push<T>(
  history: History<T>,
  present: T,
  label: string,
  coalesce = false,
): History<T> {
  const last = history.past[history.past.length - 1]
  if (coalesce && last?.label === label) return { past: history.past, future: [] }
  const past = [...history.past, { label, value: present }]
  return { past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)), future: [] }
}

export interface Step<T> {
  readonly history: History<T>
  readonly value: T
}

export function undo<T>(history: History<T>, present: T, label: string): Step<T> | null {
  const entry = history.past[history.past.length - 1]
  if (!entry) return null
  return {
    value: entry.value,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { label, value: present }],
    },
  }
}

export function redo<T>(history: History<T>, present: T, label: string): Step<T> | null {
  const entry = history.future[history.future.length - 1]
  if (!entry) return null
  return {
    value: entry.value,
    history: {
      past: [...history.past, { label, value: present }],
      future: history.future.slice(0, -1),
    },
  }
}
