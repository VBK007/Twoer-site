import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { lookupPublishedAddress } from '../api/directory'
import { useSession } from '../session/SessionContext'

/**
 * Normalises what somebody actually types.
 *
 * `192.168.1.8:8096` is what a person reads off their router; a URL parser
 * wants a scheme. Assuming `http://` for a bare host is right far more often
 * than it is wrong here — this is a machine on a home network, not the web —
 * and anything already carrying a scheme is left exactly as typed.
 */
function normalise(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

export function Connect() {
  const { setBaseUrl, baseUrl } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const onward = (location.state as { from?: string } | null)?.from ?? '/browse'

  const [address, setAddress] = useState(baseUrl ?? '')
  const [checking, setChecking] = useState(false)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The startup lookup can land after this screen has mounted — somebody who
  // navigated here directly, or came back to change the address. Filling the
  // box then is better than leaving it blank next to a server we already know
  // the address of.
  useEffect(() => {
    if (baseUrl) setAddress((current) => current || baseUrl)
  }, [baseUrl])

  /** Ask the directory again, for when the tunnel has just moved. */
  async function findIt() {
    setFinding(true)
    setError(null)

    const published = await lookupPublishedAddress()
    if (published) {
      setAddress(published)
      if (await api.probe(published)) {
        setBaseUrl(published)
        setFinding(false)
        navigate(onward, { replace: true })
        return
      }
      setError(
        'The server published this address, but it is not answering. It may ' +
          'still be starting up.',
      )
    } else {
      setError('Nothing has been published. Type the address instead.')
    }
    setFinding(false)
  }

  async function connect(event: FormEvent) {
    event.preventDefault()
    const candidate = normalise(address)
    if (!candidate) {
      setError('Type the address your server answers on.')
      return
    }

    setChecking(true)
    setError(null)

    const reachable = await api.probe(candidate)
    if (reachable) {
      setBaseUrl(candidate)
      setChecking(false)
      navigate(onward, { replace: true })
      return
    }

    // Before giving up, ask where the server says it is. A tunnel hostname
    // written down last week is the single most likely reason a correct-looking
    // address does not answer.
    const published = await lookupPublishedAddress()
    if (published && published !== candidate && (await api.probe(published))) {
      setBaseUrl(published)
      setChecking(false)
      navigate(onward, { replace: true })
      return
    }

    setChecking(false)
    setError(
      'That address did not answer. Check the server is awake and that this ' +
        'browser can reach it — a home server on your LAN is not reachable ' +
        'from outside the house without a tunnel.',
    )
  }

  return (
    <div className="pane">
      <div className="pane-card card">
        <span className="mono">Connect</span>
        <h1>Point this at your server.</h1>
        <p className="pane-lede">
          The same address the Android app asks for — <b>http://192.168.1.x:8096</b>{' '}
          on your own network, or your tunnel if you run one. It is kept in this
          browser and sent nowhere else.
        </p>

        <form onSubmit={connect}>
          <label className="field">
            <span className="mono">Server address</span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="http://192.168.1.8:8096"
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>

          {error && <p className="field-error">{error}</p>}

          <button className="btn btn-primary btn-block" disabled={checking || finding}>
            {checking ? 'Checking…' : 'Connect'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={findIt}
          disabled={checking || finding}
        >
          {finding ? 'Asking…' : 'Find it for me'}
        </button>
        <p className="footnote">
          Tower publishes where it is each time it starts, so this usually knows
          before you do.
        </p>

        <p className="footnote">
          <Link to="/">Back to the download page</Link>
        </p>
      </div>
    </div>
  )
}
