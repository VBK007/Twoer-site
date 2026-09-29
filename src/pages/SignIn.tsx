import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, TowerHttpError } from '../api/client'
import { useSession } from '../session/SessionContext'

type Mode = 'signin' | 'register'

export function SignIn() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const onward = (location.state as { from?: string } | null)?.from ?? '/browse'

  const [mode, setMode] = useState<Mode>('signin')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const auth =
        mode === 'signin'
          ? await api.login(identifier, password)
          : await api.register(identifier, email, password, displayName || identifier)

      signIn(auth.token, auth.refreshToken ?? null)
      navigate(onward, { replace: true })
    } catch (cause) {
      // The server says which field collided on a 409 and why a 401 failed.
      // Repeated rather than replaced with a guess, because "that username is
      // taken" and "that email is taken" want different corrections.
      if (cause instanceof TowerHttpError) {
        setError(
          cause.status === 401
            ? 'That username or password was not recognised.'
            : cause.body || `The server said ${cause.status}.`,
        )
      } else {
        setError(
          'Could not reach the server. It may be asleep, or this browser may ' +
            'not be on the same network.',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pane">
      <div className="pane-card card">
        {/* Not the server's address, which used to be here — see AppChrome. */}
        <span className="mono">Tower</span>
        <h1>{mode === 'signin' ? 'Sign in to Tower.' : 'Make an account.'}</h1>
        <p className="pane-lede">
          You only need an account to play something. Browsing the shelf does not
          require one.
        </p>

        {/*
          A real choice, at the top, before the fields it changes.
          This was a footnote under the form — 11px mono, which is the register
          this app reserves for things the server measured, not for actions.
          Nobody found it, which is fair: it read as a caption. The segmented
          control is the same one the landing page uses for the playback-plan
          example, so it is already a shape this design system has.
        */}
        <div className="plan-switch auth-switch" role="group" aria-label="Sign in or create an account">
          <button
            type="button"
            aria-pressed={mode === 'signin'}
            onClick={() => {
              setMode('signin')
              setError(null)
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === 'register'}
            onClick={() => {
              setMode('register')
              setError(null)
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit}>
          <label className="field">
            <span className="mono">{mode === 'signin' ? 'Username or email' : 'Username'}</span>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
              autoComplete={mode === 'signin' ? 'username' : 'off'}
            />
          </label>

          {mode === 'register' && (
            <>
              <label className="field">
                <span className="mono">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                />
              </label>
              <label className="field">
                <span className="mono">Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={identifier}
                />
              </label>
            </>
          )}

          <label className="field">
            <span className="mono">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <p className="field-error">{error}</p>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="footnote">
          <Link to="/browse">Keep looking round instead</Link>
          {' · '}
          <Link to="/connect">Use a different server</Link>
        </p>
      </div>
    </div>
  )
}
