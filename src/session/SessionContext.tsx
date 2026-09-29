import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, type SessionState } from '../api/client'
import { lookupPublishedAddress } from '../api/directory'
import { TOWER } from '../config'
import type { ProfileDto } from '../api/types'

/**
 * What the browser remembers between visits.
 *
 * localStorage rather than a cookie: none of this is sent automatically, and
 * the whole point of the bearer token is that it travels only on requests this
 * code makes. Note this is *not* the encrypted store the Android app keeps its
 * credentials in — a browser has nothing equivalent, so a shared computer is a
 * shared session. Sign out actually clears it.
 */
const STORAGE_KEY = 'tower.session'

interface Persisted {
  baseUrl?: string | null
  token?: string | null
  refreshToken?: string | null
  profileId?: string | null
}

function load(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Persisted
  } catch {
    return {}
  }
}

function save(state: SessionState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        baseUrl: state.baseUrl,
        token: state.token,
        refreshToken: state.refreshToken,
        profileId: state.profileId,
      }),
    )
  } catch {
    // Private browsing, quota, a locked-down profile. Not being able to
    // remember the session is a worse experience, not a broken one.
  }
}

interface SessionValue extends SessionState {
  signedIn: boolean
  paired: boolean
  /** The directory is being asked where the server is. Not yet "not paired". */
  discovering: boolean
  profiles: ProfileDto[]
  setBaseUrl: (url: string | null) => void
  signIn: (token: string, refreshToken: string | null) => void
  signOut: () => void
  chooseProfile: (id: string | null) => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(() => {
    const stored = load()
    const initial: SessionState = {
      // A remembered address wins over the one baked into the build, so a
      // household that has connected once is never sent back to Connect by a
      // redeploy.
      baseUrl: stored.baseUrl ?? TOWER.defaultBaseUrl ?? null,
      token: stored.token ?? null,
      refreshToken: stored.refreshToken ?? null,
      profileId: stored.profileId ?? null,
    }
    api.setState(initial)
    return initial
  })

  const [profiles, setProfiles] = useState<ProfileDto[]>([])

  // Nothing remembered and nothing baked in — so ask the directory before
  // giving up and sending the visitor to Connect. This is the ordinary first
  // visit, not an error path: the address is published precisely so that no
  // human has to know it.
  const [discovering, setDiscovering] = useState(
    () => !state.baseUrl && Boolean(TOWER.directory.projectId),
  )

  useEffect(() => {
    if (!discovering) return
    let cancelled = false

    lookupPublishedAddress()
      .then((published) => {
        if (cancelled) return
        // A remembered address may have arrived while this was in flight —
        // someone typing one into Connect, say. Theirs wins; it is a choice,
        // and this is only a hint.
        if (published && !api.getState().baseUrl) {
          api.setState({ baseUrl: published })
        }
      })
      .finally(() => {
        if (!cancelled) setDiscovering(false)
      })

    return () => {
      cancelled = true
    }
    // Once, on mount. Re-running this on every state change would re-ask
    // Firestore each time a token refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The transport owns the authoritative copy: it rewrites the address when the
  // server moves and the token when it refreshes, both without going through
  // React. Mirroring those back here is what keeps the UI honest.
  useEffect(() => {
    return api.subscribe((next) => {
      setState(next)
      save(next)
    })
  }, [])

  useEffect(() => {
    if (!state.token || !state.baseUrl) {
      setProfiles([])
      return
    }
    let cancelled = false
    api
      .profiles()
      .then(async (list) => {
        // A brand-new account has no profile, and the server refuses to
        // browse or play for one — "create one before browsing", verbatim.
        // The phone app has a screen for that; the web client did not, so a
        // visitor who had just made an account was stuck on an empty shelf.
        if (list.length === 0) {
          try {
            list = [await api.createProfile('Me')]
          } catch {
            /* Then the shelf is empty, as before, and the server says why. */
          }
        }
        if (cancelled) return
        setProfiles(list)
        // One profile is not a choice. Picking it saves a visit to a menu
        // whose only option is the one that was going to be picked.
        if (list.length === 1 && !api.getState().profileId) {
          api.setState({ profileId: list[0].id })
        }
      })
      .catch(() => {
        if (!cancelled) setProfiles([])
      })
    return () => {
      cancelled = true
    }
  }, [state.token, state.baseUrl])

  const setBaseUrl = useCallback((url: string | null) => {
    api.setState({ baseUrl: url })
  }, [])

  const signIn = useCallback((token: string, refreshToken: string | null) => {
    api.setState({ token, refreshToken })
  }, [])

  const signOut = useCallback(() => {
    api.setState({ token: null, refreshToken: null, profileId: null })
  }, [])

  const chooseProfile = useCallback((id: string | null) => {
    api.setState({ profileId: id })
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      ...state,
      signedIn: Boolean(state.token),
      paired: Boolean(state.baseUrl),
      discovering,
      profiles,
      setBaseUrl,
      signIn,
      signOut,
      chooseProfile,
    }),
    [state, discovering, profiles, setBaseUrl, signIn, signOut, chooseProfile],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside a SessionProvider')
  return value
}
