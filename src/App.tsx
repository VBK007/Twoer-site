import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './session/SessionContext'
import { Landing } from './pages/Landing'
import { Connect } from './pages/Connect'
import { SignIn } from './pages/SignIn'
import { AppChrome } from './components/AppChrome'

/*
 * The client is split off from the landing page.
 *
 * Most people who arrive here came for the APK and will never open the web
 * client at all; making them download the browsing screens and the video player
 * first is rude on a phone on mobile data — which, given what this app is for,
 * is exactly who is visiting.
 */
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })))
const Library = lazy(() => import('./pages/Library').then((m) => ({ default: m.Library })))
const Detail = lazy(() => import('./pages/Detail').then((m) => ({ default: m.Detail })))
const Watch = lazy(() => import('./pages/Watch').then((m) => ({ default: m.Watch })))

/**
 * Browsing needs an address. It does not need an account.
 *
 * The server answers a `public/` route without a token, so a visitor can walk
 * the shelf, open a title and read what is on it before anyone asks them for
 * anything. Being made to sign in to find out whether a library is worth
 * signing in to is the wrong way round.
 *
 * `replace` on the redirect, and the attempted path carried in state, so the
 * back button does not walk back into a screen that will only bounce again, and
 * so Connect can hand the visitor onward to where they were going.
 */
function RequireServer({ children }: { children: ReactNode }) {
  const { paired, discovering } = useSession()
  const location = useLocation()

  // The directory is still being asked. Bouncing to Connect here would show the
  // "type an address" screen for a second and then navigate away underneath
  // somebody who had already started reading it.
  if (discovering) {
    return <p className="mono view-note">Finding your server…</p>
  }

  if (!paired) {
    return <Navigate to="/connect" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/**
 * Playing a file is where the account starts to matter.
 *
 * Not a policy invented here — the server draws the same line. The public
 * routes serve the catalogue and the artwork; the stream does not, and
 * `guest/playback-decision` refuses outright. So this is the first point at
 * which signing in buys the visitor something, which makes it the first
 * reasonable point to ask.
 */
function RequireAccount({ children }: { children: ReactNode }) {
  const { signedIn } = useSession()
  const location = useLocation()

  if (!signedIn) {
    return (
      <Navigate
        to="/signin"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  }
  return <>{children}</>
}

export function App() {
  return (
    <Suspense fallback={<p className="mono view-note">Loading…</p>}>
      <Routes>
        {/* The download page, which is still what most visitors came for. */}
        <Route path="/" element={<Landing />} />

        <Route path="/connect" element={<Connect />} />
        <Route path="/signin" element={<SignIn />} />

        <Route
          element={
            <RequireServer>
              <AppChrome />
            </RequireServer>
          }
        >
          <Route path="/browse" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/title/:id" element={<Detail />} />
        </Route>

        {/* Outside the chrome: the player is the whole screen, as it is on the
            phone — no tab bar under a film. And the one place an account is
            actually required. */}
        <Route
          path="/watch/:id"
          element={
            <RequireServer>
              <RequireAccount>
                <Watch />
              </RequireAccount>
            </RequireServer>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
