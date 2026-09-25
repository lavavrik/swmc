import { describe, expect, it } from 'vitest'
import { HOSTED_API, HOSTED_EDITOR } from '@/mcp/hosted'
import { agentSetup } from './agentSetup'

describe('agentSetup', () => {
  it('needs only the token against the hosted editor', () => {
    const setup = agentSetup({ token: 'swmc_x', editor: `${HOSTED_EDITOR}/`, api: HOSTED_API })
    expect(setup.download).toBe(
      `mkdir -p ~/.swmc && curl -fsSL -o ~/.swmc/swmc-mcp.mjs ${HOSTED_EDITOR}/swmc-mcp.mjs`,
    )
    expect(setup.claude).toBe(
      'claude mcp add swmc --scope user -e SWMC_TOKEN=swmc_x -- node ~/.swmc/swmc-mcp.mjs',
    )
    expect(setup.codex).toBe(
      'codex mcp add swmc --env SWMC_TOKEN=swmc_x -- node ~/.swmc/swmc-mcp.mjs',
    )
    expect(JSON.parse(setup.json).mcpServers.swmc.env).toEqual({ SWMC_TOKEN: 'swmc_x' })
  })

  it('names the API and editor when they are not the hosted ones', () => {
    const setup = agentSetup({
      token: 'swmc_x',
      editor: 'http://localhost:5173',
      api: 'http://localhost:8080/',
    })
    expect(setup.claude).toContain(
      '-e SWMC_API_URL=http://localhost:8080 -e SWMC_URL=http://localhost:5173',
    )
    expect(setup.download).toContain('http://localhost:5173/swmc-mcp.mjs')
  })
})
