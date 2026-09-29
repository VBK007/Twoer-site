import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSession } from '../session/SessionContext'
import { AdSlot } from './AdSlot'
import { PlayerBar } from './PlayerBar'
import { NowPanel, useWide } from './NowPanel'
import { usePlayer } from '../playback/PlayerContext'

/**
 * Words, not pictograms.
 *
 * The app's tab bar is mono uppercase text with no icons at all — see
 * shots/p1_posters.png. Four labels that say what they are beat four glyphs
 * that have to be learned, and it matches the rule that runs through the rest
 * of the design: the mono face is for anything stated flatly.
 */
const TABS = [
  { to: '/browse', label: 'Home' },
  { to: '/library', label: 'Library' },
]

function Wordmark() {
  return (
    <>
      <svg width="15" height="18" viewBox="0 0 15 18" aria-hidden="true">
        <rect x="0" y="0" width="15" height="4" rx="1" fill="#E8B34A" />
        <rect x="0" y="7" width="15" height="4" rx="1" fill="rgba(246,243,236,.55)" />
        <rect x="0" y="14" width="15" height="4" rx="1" fill="rgba(246,243,236,.25)" />
      </svg>
      Tower
    </>
  )
}

/**
 * The frame the browsing screens sit in.
 *
 * Two shapes from one markup: a rail down the left on a desktop, a bar across
 * the bottom on a phone. The previous version was the phone layout everywhere,
 * which on a 1280px screen put two tabs at opposite ends of an empty strip and
 * left the sides of every page unused.
 *
 * Both are the same list, ordered the same way, so the app does not reorganise
 * itself when a window is resized — only the axis changes.
 */
export function AppChrome() {
  const { signedIn, signOut, profiles, profileId, chooseProfile } = useSession()
  const navigate = useNavigate()
  const { current } = usePlayer()
  const wide = useWide()

  return (
    <div className={`app-shell${current ? ' has-player' : ''}${current && wide ? ' has-now' : ''}`}>
      <aside className="side">
        <button className="wordmark as-button side-mark" onClick={() => navigate('/browse')}>
          <Wordmark />
        </button>

        <nav className="side-nav">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to}>
              {tab.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop only: the rail has the room, and a phone's bottom bar
            does not. The stylesheet hides it below the breakpoint. */}
        <AdSlot placement="side" />

        <div className="side-foot">
          {signedIn && profiles.length > 0 && (
            <select
              className="profile-select mono"
              value={profileId ?? ''}
              onChange={(event) => chooseProfile(event.target.value || null)}
              aria-label="Profile"
            >
              <option value="">No profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          )}
          {signedIn ? (
            <button className="btn btn-outline btn-block btn-sm" onClick={signOut}>
              Sign out
            </button>
          ) : (
            <button
              className="btn btn-primary btn-block btn-sm"
              onClick={() => navigate('/signin', { state: { from: '/browse' } })}
            >
              Sign in
            </button>
          )}
        </div>
      </aside>

      {/* Phone only. The server's address is deliberately not shown anywhere —
          on a public page that is somebody's home server printed for every
          visitor. */}
      <header className="app-bar">
        <button className="wordmark as-button" onClick={() => navigate('/browse')}>
          <Wordmark />
        </button>
        {signedIn ? (
          <button className="btn btn-outline btn-sm" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => navigate('/signin', { state: { from: '/browse' } })}
          >
            Sign in
          </button>
        )}
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      {/* Wide screens only: the sleeve, the credits and what is next, in a
          column of their own. Draws nothing until something plays. */}
      <NowPanel />

      <nav className="app-tabs">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* Nothing until something plays; then a bar above the tabs on a
          phone, along the bottom of the main column on a desktop. */}
      <PlayerBar />
    </div>
  )
}
