/**
 * Bundles the MCP server into one file, dist/swmc-mcp.mjs, that runs with a
 * plain `node` — no checkout, no npm install. The Lua interpreter's
 * WebAssembly rides inside it (see src/recipe/lua.ts).
 *
 * `npm run build` runs this after the SPA, so a deploy publishes it at
 * <editor>/swmc-mcp.mjs.
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const wasm = createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm')

await build({
  entryPoints: [`${root}src/mcp/server.ts`],
  outfile: `${root}dist/swmc-mcp.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: true,
  legalComments: 'none',
  alias: { '@': `${root}src` },
  define: {
    __SWMC_GLUE_WASM__: JSON.stringify(readFileSync(wasm).toString('base64')),
    // The hosted pair this build is for, if any (src/mcp/hosted.ts)
    __SWMC_HOSTED_EDITOR__: JSON.stringify(process.env.SWMC_HOSTED_EDITOR ?? ''),
    __SWMC_HOSTED_API__: JSON.stringify(
      process.env.SWMC_HOSTED_API ?? process.env.VITE_API_BASE_URL ?? '',
    ),
  },
  // Bundled CommonJS (wasmoon's emscripten glue, ajv) still reaches for
  // require, __filename and __dirname, which ES modules do not have.
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __swmcRequire } from 'node:module'",
      "import { fileURLToPath as __swmcPath } from 'node:url'",
      'const require = __swmcRequire(import.meta.url)',
      'const __filename = __swmcPath(import.meta.url)',
      "const __dirname = __swmcPath(new URL('.', import.meta.url))",
    ].join('\n'),
  },
  logLevel: 'warning',
})
console.log('dist/swmc-mcp.mjs')
