/// <reference types="vitest/config" />
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))
const savedXml = join(root, 'microcontrollers')

/** Serves `microcontrollers/*.xml` at `/microcontrollers/`, for `?open=`. */
function serveSavedMicrocontrollers(): Plugin {
  const send: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] ?? ''
    // The bundled MCP server (`npm run build:mcp`), for Agent access in dev
    if (url === '/swmc-mcp.mjs' && existsSync(join(root, 'dist', 'swmc-mcp.mjs'))) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
      res.end(readFileSync(join(root, 'dist', 'swmc-mcp.mjs')))
      return
    }
    const match = /^\/microcontrollers\/([A-Za-z0-9._-]+\.xml)$/.exec(url)
    if (!match) {
      next()
      return
    }
    const file = join(savedXml, match[1]!)
    if (!existsSync(file)) {
      res.statusCode = 404
      res.end('not found')
      return
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.end(readFileSync(file, 'utf8'))
  }
  const attach = (server: { middlewares: { use: (fn: Connect.NextHandleFunction) => void } }) => {
    server.middlewares.use(send)
  }
  return {
    name: 'serve-saved-microcontrollers',
    configureServer: attach,
    configurePreviewServer: attach,
    closeBundle() {
      if (!existsSync(savedXml)) return
      const dest = join(root, 'dist', 'microcontrollers')
      mkdirSync(dest, { recursive: true })
      for (const name of readdirSync(savedXml)) {
        if (name.endsWith('.xml')) copyFileSync(join(savedXml, name), join(dest, name))
      }
    },
  }
}

/** The hosted editor and library a deploy bakes in; tests get fixed stand-ins. */
const hosted = process.env.VITEST
  ? { editor: 'https://editor.example', api: 'https://api.example' }
  : {
      editor: process.env.SWMC_HOSTED_EDITOR ?? '',
      api: process.env.SWMC_HOSTED_API ?? process.env.VITE_API_BASE_URL ?? '',
    }

export default defineConfig({
  plugins: [react(), serveSavedMicrocontrollers()],
  define: {
    __SWMC_HOSTED_EDITOR__: JSON.stringify(hosted.editor),
    __SWMC_HOSTED_API__: JSON.stringify(hosted.api),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
