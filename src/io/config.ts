/**
 * Cloud library, when this build was pointed at the library API in server/.
 *
 * Unset, the editor keeps using IndexedDB — that is still the default, and
 * how `npm run dev` and the tests run. Set at build time to save to the API
 * instead, signing in with any OIDC issuer (no baked token):
 *
 *   VITE_API_BASE_URL=https://api.example.com
 *   VITE_OIDC_ISSUER=https://id.example.com
 *   VITE_OIDC_CLIENT_ID=<public client id>
 */
export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

export function cloudLibrary(): boolean {
  return apiBaseUrl() !== ''
}

export function oidcIssuer(): string {
  return (import.meta.env.VITE_OIDC_ISSUER ?? '').replace(/\/$/, '')
}

export function oidcClientId(): string {
  return import.meta.env.VITE_OIDC_CLIENT_ID ?? ''
}

/** What the sign-in button calls the issuer, e.g. "Sign in with Example". */
export function oidcName(): string {
  return (import.meta.env.VITE_OIDC_NAME ?? '').trim()
}

export function oidcEnabled(): boolean {
  return oidcClientId() !== '' && oidcIssuer() !== ''
}

/** Sign-in is available; the builder still works without it. */
export function canSignIn(): boolean {
  return oidcEnabled() || cloudLibrary()
}

/** Exact string registered on the OIDC public client. Trailing slash is required. */
export function oidcRedirectUri(): string {
  return `${window.location.origin}/`
}
