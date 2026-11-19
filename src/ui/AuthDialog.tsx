/**
 * Sign in / register for the cloud library.
 */
import { useState } from 'react'
import { login, register, type Account } from '@/io/auth'
import { oidcEnabled, oidcName } from '@/io/config'
import { startOidcLogin } from '@/io/oidc'

export function AuthDialog({
  onClose,
  onSignedIn,
}: {
  onClose: () => void
  onSignedIn: (account: Account) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (mode: 'login' | 'register') => {
    setBusy(true)
    setProblem(null)
    try {
      const account =
        mode === 'login' ? await login(email, password) : await register(email, password)
      onSignedIn(account)
      onClose()
    } catch (error) {
      setProblem(String(error))
    } finally {
      setBusy(false)
    }
  }

  const signInWithIssuer = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await startOidcLogin()
    } catch (error) {
      setProblem(String(error))
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="dialog-header">
          <h2>Cloud library</h2>
          <button className="text-button" onClick={onClose}>
            Close
          </button>
        </header>
        {oidcEnabled() ? (
          <>
            <p className="dialog-note">
              Sign in to keep your microcontrollers in the cloud library. Each account has its own.
            </p>
            <div className="dialog-row">
              <button
                className="text-button primary"
                disabled={busy}
                onClick={() => void signInWithIssuer()}
              >
                {oidcName() ? `Sign in with ${oidcName()}` : 'Sign in'}
              </button>
            </div>
            {problem && <p className="dialog-problem">{problem}</p>}
          </>
        ) : (
          <>
            <p className="dialog-note">Each account has its own microcontrollers.</p>
            <div className="dialog-row">
              <label>
                <span>Email</span>
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </div>
            <div className="dialog-row">
              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit('login')
                  }}
                />
              </label>
              <button
                className="text-button primary"
                disabled={busy}
                onClick={() => void submit('login')}
              >
                Sign in
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void submit('register')}
              >
                Create account
              </button>
            </div>
            {problem && <p className="dialog-problem">{problem}</p>}
          </>
        )}
      </div>
    </div>
  )
}
