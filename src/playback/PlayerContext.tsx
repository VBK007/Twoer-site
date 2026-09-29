import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, TowerHttpError } from '../api/client'
import { browserCapabilities } from './capabilities'
import { streamingReady } from './streaming'
import { useSession } from '../session/SessionContext'
import type { ItemSummaryDto } from '../api/types'

/*
 * The music player.
 *
 * One `<audio>` element, owned here above the router, so a track keeps
 * playing while the shelf, the library and a title's page come and go
 * underneath it — the arrangement every music service settled on, and the one
 * a page-per-track player can never offer. The bar at the bottom of the
 * client is only a view of this; nothing in it holds playback state.
 *
 * How a track reaches the element: the server authenticates media with an
 * Authorization header and refuses a token in the URL, both verified against
 * a live deployment, and an audio element sends its own headers with no hook
 * to add one. The service worker in public/sw.js adds it on the way out, so
 * where a worker controls the page the element is simply pointed at the
 * stream and seeks by byte range like any player. Where there is no worker —
 * an old browser, a private window — the track is fetched like an API
 * request and handed over as a blob URL, with the next one in the queue
 * fetched while this one plays. Both paths end at the same element.
 */

export type Repeat = 'off' | 'all' | 'one'

interface PlayerState {
  queue: ItemSummaryDto[]
  /** Positions into `queue`, in the order they play. Shuffle rewrites it. */
  order: number[]
  /** Where in `order` we are. -1 when nothing has been started. */
  pos: number
  playing: boolean
  loading: boolean
  time: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: Repeat
  error: string | null
  /** Whether the queue panel is open. */
  open: boolean
  /** Where the queue came from — a shelf's name, "Library" — for "Playing from". */
  source: string | null
}

export interface PlayerValue extends PlayerState {
  current: ItemSummaryDto | null
  /** Start `queue` from `index`, replacing whatever was playing. */
  play: (queue: ItemSummaryDto[], index?: number, source?: string) => void
  toggle: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  /** Jump to a position in the play order — what the queue panel clicks. */
  jumpTo: (pos: number) => void
  setOpen: (open: boolean) => void
  close: () => void
}

const PlayerContext = createContext<PlayerValue | null>(null)

const VOLUME_KEY = 'tower.volume'
const PROGRESS_INTERVAL_MS = 15_000
/** Blob URLs kept around: the current track, the one before, the one after. */
const SOURCE_CACHE = 4
/** Attempts at fetching a track and how long to wait before each. */
const RETRY_WAITS_MS = [0, 2500, 6000]
/** How long into a track the next one is fetched — one download at a time. */
const PREFETCH_AFTER_MS = 8000

const INITIAL: PlayerState = {
  queue: [],
  order: [],
  pos: -1,
  playing: false,
  loading: false,
  time: 0,
  duration: 0,
  volume: readVolume(),
  muted: false,
  shuffle: false,
  repeat: 'off',
  error: null,
  open: false,
  source: null,
}

function readVolume(): number {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEY))
    return stored > 0 && stored <= 1 ? stored : 1
  } catch {
    return 1
  }
}

/** A play order that starts at `first` and shuffles the rest. */
function shuffled(length: number, first: number): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

function straight(length: number): number[] {
  return Array.from({ length }, (_, i) => i)
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
  )
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()

  const [state, setState] = useState<PlayerState>(INITIAL)
  // Event handlers on the element are registered once and must see the
  // latest state without being re-registered on every tick of `time`.
  const stateRef = useRef(state)
  stateRef.current = state

  const audio = useRef<HTMLAudioElement | null>(null)
  const sources = useRef(new Map<string, string>())
  // Bumped on every start, so a slow fetch for a track that has since been
  // skipped past cannot land in the element after the one that replaced it.
  const seq = useRef(0)
  // What to do if the element cannot play the stream it was pointed at.
  const fallback = useRef<(() => void) | null>(null)

  const patch = useCallback((next: Partial<PlayerState>) => {
    setState((prev) => ({ ...prev, ...next }))
  }, [])

  /* ── The element ─────────────────────────────────────────────────── */

  useEffect(() => {
    const el = new Audio()
    el.preload = 'auto'
    el.volume = stateRef.current.volume
    audio.current = el

    const onTime = () => patch({ time: el.currentTime })
    const onDuration = () => patch({ duration: Number.isFinite(el.duration) ? el.duration : 0 })
    const onPlay = () => patch({ playing: true })
    const onPause = () => patch({ playing: false })
    const onEnded = () => endedRef.current()
    const onError = () => {
      if (fallback.current) {
        fallback.current()
        return
      }
      patch({ error: 'This track could not be played.', loading: false })
    }

    el.addEventListener('timeupdate', onTime)
    el.addEventListener('durationchange', onDuration)
    el.addEventListener('loadedmetadata', onDuration)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onError)

    return () => {
      el.pause()
      el.removeAttribute('src')
      el.load()
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('durationchange', onDuration)
      el.removeEventListener('loadedmetadata', onDuration)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
      for (const url of sources.current.values()) URL.revokeObjectURL(url)
      sources.current.clear()
      audio.current = null
    }
  }, [patch])

  /* ── Getting a track's bytes ─────────────────────────────────────── */

  /** Where the server says the track is. Retried: the route is what the tunnel drops first. */
  const planFor = useCallback(async (item: ItemSummaryDto) => {
    let last: unknown = null
    for (const wait of RETRY_WAITS_MS) {
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      try {
        const plan = await api.playbackDecision(item.id, browserCapabilities(), 0)
        if (plan.url.includes('.m3u8')) {
          // The server has no transcode path for audio today, so this is
          // theoretical — but a converted stream is segments, not a file.
          throw new Error('This track would need converting, and the player only takes files as they are.')
        }
        return plan
      } catch (cause) {
        last = cause
        if (!(cause instanceof TowerHttpError) || cause.status < 500) break
      }
    }
    throw last instanceof Error ? last : new Error('The server would not say how to play this track.')
  }, [])

  const fetchSource = useCallback(async (item: ItemSummaryDto): Promise<string> => {
    const hit = sources.current.get(item.id)
    if (hit) return hit

    const plan = await planFor(item)

    const session = api.getState()
    const request = () =>
      fetch(api.absolute(plan.url), {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          ...(session.profileId ? { 'X-Profile-Id': session.profileId } : {}),
        },
      })
    // The tunnel drops its connection to the server under a burst and
    // answers 530 for a few seconds afterwards — seen directly, and it is the
    // cause of every "failed to fetch" this player has met. A retry that
    // waits is the difference between a track that starts late and one that
    // never starts; an immediate retry lands in the same outage.
    let response: Response | null = null
    for (const wait of RETRY_WAITS_MS) {
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      try {
        response = await request()
        if (response.status < 500) break
      } catch {
        response = null
      }
    }
    if (!response) throw new Error('The server could not be reached for this track.')
    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? 'The server refused the stream. Try signing in again.'
          : `The server answered ${response.status} for this track.`,
      )
    }

    const objectUrl = URL.createObjectURL(await response.blob())
    sources.current.set(item.id, objectUrl)
    while (sources.current.size > SOURCE_CACHE) {
      const oldest = sources.current.keys().next().value as string | undefined
      if (oldest === undefined) break
      const stale = sources.current.get(oldest)
      sources.current.delete(oldest)
      if (stale) URL.revokeObjectURL(stale)
    }
    return objectUrl
  }, [planFor])

  /* ── Starting a position in the order ───────────────────────────── */

  const reportProgress = useCallback((finished = false) => {
    const el = audio.current
    const { queue, order, pos } = stateRef.current
    const item = queue[order[pos]]
    if (!el || !item || !el.duration || Number.isNaN(el.duration)) return
    api.recordProgress(item.id, el.currentTime, el.duration, finished).catch(() => {})
  }, [])

  const startAt = useCallback(
    async (nextPos: number, autoplay = true) => {
      const el = audio.current
      const { queue, order } = stateRef.current
      const item = queue[order[nextPos]]
      if (!el || !item) return

      const mine = ++seq.current
      patch({ pos: nextPos, loading: true, error: null, time: 0, duration: 0 })
      fallback.current = null

      const begin = async () => {
        if (autoplay) {
          await el.play().catch(() => {
            /* Autoplay refused — the bar shows Play and the user presses it. */
          })
        }
      }

      const download = async () => {
        const src = await fetchSource(item)
        if (mine !== seq.current) return
        el.src = src
        await begin()
      }

      try {
        if (await streamingReady()) {
          // Point the element at the stream; the worker signs the requests.
          // Should the element still fail — a worker that lost the session,
          // a browser that routes media around workers — download instead.
          const plan = await planFor(item)
          if (mine !== seq.current) return
          fallback.current = () => {
            fallback.current = null
            download().catch((cause) => {
              if (mine === seq.current) {
                patch({
                  error: cause instanceof Error ? cause.message : 'This track could not be played.',
                  loading: false,
                })
              }
            })
          }
          el.src = api.absolute(plan.url)
          await begin()
        } else {
          await download()
          // Warm the next one while this one plays — but not straight away.
          // Two downloads at once through the tunnel is exactly the burst
          // that knocks it over, and a song has minutes to spare.
          const following = queue[order[nextPos + 1]]
          if (following) {
            setTimeout(() => {
              if (mine === seq.current) fetchSource(following).catch(() => {})
            }, PREFETCH_AFTER_MS)
          }
        }
      } catch (cause) {
        if (mine === seq.current) {
          patch({ error: cause instanceof Error ? cause.message : 'This track could not be played.' })
        }
      } finally {
        if (mine === seq.current) patch({ loading: false })
      }
    },
    [fetchSource, planFor, patch],
  )

  const endedRef = useRef<() => void>(() => {})
  endedRef.current = () => {
    reportProgress(true)
    const el = audio.current
    const { order, pos, repeat } = stateRef.current
    if (repeat === 'one' && el) {
      el.currentTime = 0
      el.play().catch(() => {})
      return
    }
    if (pos + 1 < order.length) {
      startAt(pos + 1)
    } else if (repeat === 'all' && order.length > 0) {
      startAt(0)
    } else {
      patch({ playing: false })
    }
  }

  /* ── The public surface ──────────────────────────────────────────── */

  const play = useCallback(
    (queue: ItemSummaryDto[], index = 0, source?: string) => {
      if (queue.length === 0) return
      // Playing is where the account starts to matter — the same line the
      // server draws, and the same one the Play button on a title observes.
      if (!signedIn) {
        navigate('/signin', { state: { from: location.pathname + location.search } })
        return
      }
      const first = Math.min(Math.max(index, 0), queue.length - 1)
      const order = stateRef.current.shuffle ? shuffled(queue.length, first) : straight(queue.length)
      const pos = order.indexOf(first)
      const from = source ?? null
      setState((prev) => ({ ...prev, queue, order, pos, source: from }))
      // stateRef is updated on the next render; startAt reads through it, so
      // hand it the new shape directly.
      stateRef.current = { ...stateRef.current, queue, order, pos, source: from }
      startAt(pos)
    },
    [signedIn, navigate, location.pathname, location.search, startAt],
  )

  const toggle = useCallback(() => {
    const el = audio.current
    if (!el || stateRef.current.pos < 0) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }, [])

  const next = useCallback(() => {
    const { order, pos, repeat } = stateRef.current
    reportProgress()
    if (pos + 1 < order.length) startAt(pos + 1)
    else if (repeat === 'all' && order.length > 0) startAt(0)
  }, [startAt, reportProgress])

  const previous = useCallback(() => {
    const el = audio.current
    const { pos } = stateRef.current
    // A few seconds in, "previous" means "start this one again" — the
    // convention every player follows, because it is what a listener means.
    if (el && (el.currentTime > 3 || pos <= 0)) {
      el.currentTime = 0
      return
    }
    reportProgress()
    startAt(pos - 1)
  }, [startAt, reportProgress])

  const seek = useCallback((seconds: number) => {
    const el = audio.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(seconds, el.duration || seconds))
  }, [])

  const setVolume = useCallback(
    (volume: number) => {
      const el = audio.current
      const clamped = Math.max(0, Math.min(1, volume))
      if (el) {
        el.volume = clamped
        el.muted = false
      }
      patch({ volume: clamped, muted: false })
      try {
        localStorage.setItem(VOLUME_KEY, String(clamped))
      } catch {
        /* Not remembering the volume is not a problem. */
      }
    },
    [patch],
  )

  const toggleMute = useCallback(() => {
    const el = audio.current
    const muted = !stateRef.current.muted
    if (el) el.muted = muted
    patch({ muted })
  }, [patch])

  const toggleShuffle = useCallback(() => {
    setState((prev) => {
      const shuffle = !prev.shuffle
      const current = prev.order[prev.pos]
      if (prev.queue.length === 0 || current === undefined) return { ...prev, shuffle }
      // Re-deal from where we are: the current track stays current, and
      // what follows is either the rest of the shuffle or the rest of the
      // list in its own order.
      const order = shuffle
        ? shuffled(prev.queue.length, current)
        : straight(prev.queue.length)
      return { ...prev, shuffle, order, pos: order.indexOf(current) }
    })
  }, [])

  const cycleRepeat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      repeat: prev.repeat === 'off' ? 'all' : prev.repeat === 'all' ? 'one' : 'off',
    }))
  }, [])

  const jumpTo = useCallback(
    (pos: number) => {
      reportProgress()
      startAt(pos)
    },
    [startAt, reportProgress],
  )

  const setOpen = useCallback((open: boolean) => patch({ open }), [patch])

  const close = useCallback(() => {
    const el = audio.current
    seq.current++
    reportProgress()
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    setState((prev) => ({
      ...INITIAL,
      volume: prev.volume,
      muted: prev.muted,
      shuffle: prev.shuffle,
      repeat: prev.repeat,
    }))
  }, [reportProgress])

  /* ── Side effects of playing ─────────────────────────────────────── */

  // Progress on a timer, as the video page does, so a half-listened album
  // counts on the phone too.
  useEffect(() => {
    if (!state.playing) return
    const timer = setInterval(() => reportProgress(), PROGRESS_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [state.playing, reportProgress])

  // The film player is the whole screen and has its own sound. Two things
  // playing at once is never what anybody meant.
  useEffect(() => {
    if (location.pathname.startsWith('/watch')) audio.current?.pause()
  }, [location.pathname])

  // Signing out takes the token the next fetch would need. Stop cleanly
  // rather than fail on the next track.
  useEffect(() => {
    if (!signedIn && stateRef.current.pos >= 0) close()
  }, [signedIn, close])

  // Space bar, as on every desktop player — unless the focus is somewhere
  // that space already means something.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || stateRef.current.pos < 0) return
      if (isEditable(event.target)) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  // The OS media keys and lock-screen controls. Metadata, including the
  // artwork, is set by the bar, which is the thing that already has it.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    session.setActionHandler('play', toggle)
    session.setActionHandler('pause', toggle)
    session.setActionHandler('previoustrack', previous)
    session.setActionHandler('nexttrack', next)
    try {
      session.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime)
      })
    } catch {
      /* Older browsers do not know seekto. */
    }
    return () => {
      for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'] as const) {
        try {
          session.setActionHandler(action, null)
        } catch {
          /* As above. */
        }
      }
    }
  }, [toggle, previous, next, seek])

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state.pos < 0 ? 'none' : state.playing ? 'playing' : 'paused'
    }
  }, [state.pos, state.playing])

  const current = state.pos >= 0 ? state.queue[state.order[state.pos]] ?? null : null

  const value = useMemo<PlayerValue>(
    () => ({
      ...state,
      current,
      play,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      jumpTo,
      setOpen,
      close,
    }),
    [
      state,
      current,
      play,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      jumpTo,
      setOpen,
      close,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerValue {
  const value = useContext(PlayerContext)
  if (!value) throw new Error('usePlayer must be used inside a PlayerProvider')
  return value
}

/** `3:07`, or `1:02:15` for anything over an hour. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
