/**
 * Cloud library, when this build was pointed at an cloudhost function.
 *
 * Unset, the editor keeps using IndexedDB — that is still the default, and
 * how `npm run dev` and the tests run. Set at build time to save to the
 * function instead (Sign in with CloudHost; no baked token):
 *
 *   VITE_API_BASE_URL=https://swmc-api-<hash>.example.com
 *   VITE_OIDC_CLIENT_ID=<public client uuid>
 */
export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

export function cloudLibrary(): boolean {
  return apiBaseUrl() !== ''
}

export function oidcIssuer(): string {
  return (import.meta.env.VITE_OIDC_ISSUER ?? 'https://example.com').replace(/\/$/, '')
}

export function oidcClientId(): string {
  return import.meta.env.VITE_OIDC_CLIENT_ID ?? ''
}

export function oidcEnabled(): boolean {
  return oidcClientId() !== ''
}

/** Exact string registered on the CloudHost public client. Trailing slash is required. */
export function oidcRedirectUri(): string {
  return `${window.location.origin}/`
}
