/**
 * Cloud library, when this build was pointed at an cloudhost function.
 *
 * Unset, the editor keeps using IndexedDB — that is still the default, and
 * how `npm run dev` and the tests run. Set at build time to save to the
 * function instead (sign in; no baked token):
 *
 *   VITE_API_BASE_URL=https://swmc-api-<hash>.example.com
 */
export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

export function cloudLibrary(): boolean {
  return apiBaseUrl() !== ''
}
