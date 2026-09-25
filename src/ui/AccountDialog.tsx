/**
 * The signed-in account: agent access tokens, and signing out.
 *
 * A token lets an MCP client (Claude Code, Codex, …) build microcontrollers
 * straight into this account's library. The secret is shown once, inside the
 * commands that use it.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Account } from '@/io/auth'
import { agentSetup, type AgentSetup } from '@/io/agentSetup'
import { apiBaseUrl } from '@/io/config'
import { createToken, listTokens, revokeToken, type AgentToken } from '@/io/remote'

const formatDate = (ms: number) => new Date(ms).toLocaleString()

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="agent-step">
      <div className="agent-step-head">
        <span>{label}</span>
        <button
          className="text-button tiny"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="agent-code">{text}</pre>
    </div>
  )
}

export function AccountDialog({
  account,
  onClose,
  onSignOut,
  onOpenHelp,
}: {
  account: Account
  onClose: () => void
  onSignOut: () => void
  onOpenHelp: () => void
}) {
  const [tokens, setTokens] = useState<AgentToken[]>([])
  const [name, setName] = useState('Claude Code')
  const [setup, setSetup] = useState<AgentSetup | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    listTokens().then(setTokens, (error: unknown) => setProblem(String(error)))
  }, [])
  useEffect(refresh, [refresh])

  const create = async () => {
    setBusy(true)
    setProblem(null)
    try {
      const created = await createToken(name)
      setSetup(
        agentSetup({ token: created.token, editor: window.location.origin, api: apiBaseUrl() }),
      )
      refresh()
    } catch (error) {
      setProblem(String(error))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (token: AgentToken) => {
    setProblem(null)
    try {
      await revokeToken(token.id)
      refresh()
    } catch (error) {
      setProblem(String(error))
    }
  }

  return (
    <div className="picker-backdrop" onPointerDown={onClose}>
      <div className="picker dialog" onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog-header agent-header">
          <h2>{account.email}</h2>
          <button className="text-button" onClick={onSignOut}>
            Sign out
          </button>
          <button className="text-button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="picker-groups agent-body">
          <h3>Agent access</h3>
          <p className="agent-text">
            Connect Claude Code, Codex or any MCP client, then ask it for a microcontroller. It
            builds and simulates it, saves it to this library, and gives you a link that opens it
            here.{' '}
            <button className="link-button" onClick={onOpenHelp}>
              Setup guide and how it works
            </button>
          </p>
          <div className="dialog-row agent-create">
            <label>
              <span>Token name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </label>
            <button className="text-button primary" disabled={busy} onClick={() => void create()}>
              Create token
            </button>
          </div>
          {setup && (
            <>
              <p className="dialog-note">
                The token is in the commands below and is not shown again. It can read and change
                everything in this library — keep it out of repositories.
              </p>
              <CopyBlock
                label="1. Download the MCP server (needs Node 20+)"
                text={setup.download}
              />
              <CopyBlock label="2a. Claude Code" text={setup.claude} />
              <CopyBlock label="2b. Codex" text={setup.codex} />
              <CopyBlock label="2c. Other clients (mcpServers JSON)" text={setup.json} />
            </>
          )}
          {tokens.length > 0 && (
            <>
              <h3>Tokens</h3>
              {tokens.map((token) => (
                <div className="project-row" key={token.id}>
                  <div className="picker-item agent-token">
                    <span className="picker-item-name">
                      {token.name} <code>{token.prefix}…</code>
                    </span>
                    <span className="picker-item-desc">
                      created {formatDate(token.createdAt)}
                      {token.lastUsedAt
                        ? ` · last used ${formatDate(token.lastUsedAt)}`
                        : ' · never used'}
                    </span>
                  </div>
                  <button className="text-button" onClick={() => void revoke(token)}>
                    Revoke
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
        {problem && <p className="dialog-problem">{problem}</p>}
      </div>
    </div>
  )
}
