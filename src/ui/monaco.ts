/**
 * Monaco, bundled rather than fetched.
 *
 * The default loader pulls the editor from a CDN; this app has no network
 * dependency, so the local package is wired up explicitly, along with the
 * Stormworks API completions and hover docs generated from `lua/api.ts`.
 */
import { loader } from '@monaco-editor/react'
// Only the editor itself and the Lua grammar, rather than `monaco-editor`,
// which drags in every language and its worker — several megabytes of
// TypeScript, CSS and HTML tooling this app has no use for.
import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/lua/register.js'
// The package's exports map rewrites this to esm/vs/editor/editor.worker.js
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { LUA_API, LUA_CALLBACKS } from '@/lua/api'

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment
  }
}

let configured = false

export function configureMonaco(): void {
  if (configured) return
  configured = true

  window.MonacoEnvironment = { getWorker: () => new EditorWorker() }
  loader.config({ monaco })

  const documented = [...LUA_API.flatMap((namespace) => namespace.functions), ...LUA_CALLBACKS]

  monaco.languages.registerCompletionItemProvider('lua', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return {
        suggestions: [
          ...LUA_API.map((namespace) => ({
            label: namespace.name,
            kind: monaco.languages.CompletionItemKind.Module,
            detail: namespace.summary,
            insertText: namespace.name,
            range,
          })),
          ...documented.map((fn) => ({
            label: fn.name,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: fn.signature,
            documentation: { value: fn.summary },
            insertText: fn.name,
            range,
          })),
        ],
      }
    },
  })

  monaco.languages.registerHoverProvider('lua', {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber)
      // Match a qualified name under the cursor, e.g. screen.drawRect
      const match = [...line.matchAll(/[A-Za-z_][\w.]*/g)].find(
        (m) =>
          m.index !== undefined &&
          position.column > m.index &&
          position.column <= m.index + m[0].length + 1,
      )
      const fn = match && documented.find((f) => f.name === match[0])
      if (!fn) return null
      return {
        contents: [{ value: `\`\`\`lua\n${fn.signature}\n\`\`\`` }, { value: fn.summary }],
      }
    },
  })
}

export { monaco }
