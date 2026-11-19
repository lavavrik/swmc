/**
 * The hosted editor and library this build was made for, if any: the MCP
 * server's defaults, and what the editor compares against. Baked in at build
 * time from SWMC_HOSTED_EDITOR and SWMC_HOSTED_API (see vite.config.ts and
 * scripts/build-mcp.mjs); empty in a plain checkout, where agents name the
 * API and editor themselves.
 */
declare const __SWMC_HOSTED_EDITOR__: string | undefined
declare const __SWMC_HOSTED_API__: string | undefined

const trim = (url: string) => url.replace(/\/$/, '')

export const HOSTED_EDITOR =
  typeof __SWMC_HOSTED_EDITOR__ === 'string' ? trim(__SWMC_HOSTED_EDITOR__) : ''
export const HOSTED_API = typeof __SWMC_HOSTED_API__ === 'string' ? trim(__SWMC_HOSTED_API__) : ''
export const LOCAL_EDITOR = 'http://localhost:5173'
