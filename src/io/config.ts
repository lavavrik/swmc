/**
 * Cloud library, when this build was pointed at an cloudhost function.
 *
 * Unset, the editor keeps using IndexedDB — that is still the default, and
 * how `npm run dev` and the tests run. Set both at build time to save to
 * the function instead:
 *
 *   VITE_API_BASE_URL=https://swmc-api-<hash>.example.com
 *   VITE_API_TOKEN=<same value as the function's API_TOKEN>
 */
export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

export function apiToken(): string {
  return import.meta.env.VITE_API_TOKEN ?? ''
}

export function cloudLibrary(): boolean {
  return apiBaseUrl() !== ''
}
