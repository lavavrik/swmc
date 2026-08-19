/**
 * Operations refuse invalid actions by returning a reason rather than throwing,
 * so the UI can explain why an edit was rejected.
 */
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = <T = never>(error: string): Result<T> => ({ ok: false, error })

/** Unwraps a result, throwing on failure. For tests and for genuinely impossible cases. */
export function expect<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok result, got error: ${result.error}`)
  return result.value
}

/** Returns the value on success, or the fallback on failure. */
export function orElse<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback
}
