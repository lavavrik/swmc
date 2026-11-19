/**
 * What the Agent access dialog tells the user to paste: download the
 * one-file MCP server this editor publishes, then register it with a token.
 */
import { HOSTED_API, HOSTED_EDITOR } from '@/mcp/hosted'

export interface AgentSetup {
  readonly download: string
  readonly claude: string
  readonly codex: string
  readonly json: string
}

export interface AgentSetupInput {
  readonly token: string
  /** This editor's origin, e.g. https://swmc.example.com */
  readonly editor: string
  /** The library API this build talks to. */
  readonly api: string
}

const SCRIPT = '~/.swmc/swmc-mcp.mjs'

export function agentSetup({ token, editor, api }: AgentSetupInput): AgentSetup {
  const base = editor.replace(/\/$/, '')
  const env: [string, string][] = [['SWMC_TOKEN', token]]
  // The server defaults to the hosted pair it was built with; anything else is named
  if (api.replace(/\/$/, '') !== HOSTED_API) env.push(['SWMC_API_URL', api.replace(/\/$/, '')])
  if (base !== HOSTED_EDITOR) env.push(['SWMC_URL', base])

  const download = `mkdir -p ~/.swmc && curl -fsSL -o ${SCRIPT} ${base}/swmc-mcp.mjs`
  const claude = `claude mcp add swmc --scope user ${env
    .map(([k, v]) => `-e ${k}=${v}`)
    .join(' ')} -- node ${SCRIPT}`
  const codex = `codex mcp add swmc ${env.map(([k, v]) => `--env ${k}=${v}`).join(' ')} -- node ${SCRIPT}`
  const json = JSON.stringify(
    {
      mcpServers: {
        swmc: {
          command: 'node',
          args: ['/absolute/path/to/.swmc/swmc-mcp.mjs'],
          env: Object.fromEntries(env),
        },
      },
    },
    null,
    2,
  )
  return { download, claude, codex, json }
}
