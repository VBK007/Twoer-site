import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { browserCapabilities } from '../playback/capabilities'
import { streamingReady } from '../playback/streaming'
import { clock } from '../playback/PlayerContext'
import { pickUpNext, type UpNext } from '../playback/upNext'
import { Artwork } from '../components/Artwork'
import type {
  AudioTrackDto,
  ChapterDto,
  ItemDetailDto,
  PlaybackDecisionDto,
  SubtitleTrackDto,
} from '../api/types'

/*
 * The video player, drawn as the Android app draws it — see PlayerScreen.kt.
 *
 * The browser's own controls are gone. They were a different design on
 * every browser, they hid the seek bar below the fold on a laptop because
 * the video took its natural height, and they had no idea what a transcode
 * or a subtitle track from the server was. What replaces them is the app's
 * screen: title and state at the top, skip and play in the middle, the
 * Subtitles, Audio and Quality chips over an amber seek bar with elapsed and
 * remaining time, and night view — a warm veil over the picture that takes
 * the blue light out rather than dimming, which is what keeps people awake.
 *
 * Everything hides after a few seconds of stillness and comes back on a
 * touch or a mouse move, as any player does.
 */

/** Progress is reported on this cadence, as on the phone. */
const PROGRESS_INTERVAL_MS = 10_000
const HIDE_AFTER_MS = 3200
const SKIP_SECONDS = 10
/** The up-next card appears this far before the end, and counts down after it. */
const UP_NEXT_BEFORE_END_S = 30
const AUTOPLAY_COUNTDOWN_S = 10
/** Shelves that come in episodes. A film has no next episode. */
const SERIAL_TYPES = new Set(['ANIME', 'SERIES'])

const QUALITIES: { label: string; maxHeight: number | null }[] = [
  { label: 'Auto', maxHeight: null },
  { label: '1080p', maxHeight: 1080 },
  { label: '720p', maxHeight: 720 },
  { label: '480p', maxHeight: 480 },
]

type Sheet = 'subtitles' | 'audio' | 'quality' | null

function subtitleLabel(track: SubtitleTrackDto): string {
  const parts = [track.language ?? 'Unknown']
  if (track.format) parts.push(`(${track.format})`)
  if (track.forced) parts.push('forced')
  if (track.hearingImpaired) parts.push('SDH')
  return parts.join(' ')
}

function audioLabel(track: AudioTrackDto): string {
  const parts = [track.language ?? 'Unknown']
  if (track.codec) parts.push(track.codec.toUpperCase())
  if (track.title) parts.push(`· ${track.title}`)
  return parts.join(' ')
}

/**
 * Keyed on the title, so moving to the next episode is a fresh player rather
 * than one carrying the last episode's time, plan and choices.
 */
export function Watch() {
  const { id = '' } = useParams()
  return <Player key={id} id={id} />
}

function Player({ id }: { id: string }) {
  const navigate = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const stage = useRef<HTMLDivElement>(null)

  const [item, setItem] = useState<ItemDetailDto | null>(null)
  const [plan, setPlan] = useState<PlaybackDecisionDto | null>(null)
  const [chapters, setChapters] = useState<ChapterDto[]>([])
  const [error, setError] = useState<string | null>(null)

  // What to play after this — the next episode, or another series when the
  // run is over. Read off the shelf, since the server keeps no series.
  const [upNext, setUpNext] = useState<UpNext | null>(null)
  const [upNextDismissed, setUpNextDismissed] = useState(false)
  const [ended, setEnded] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  // What the element reports, mirrored for the controls.
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)

  // Choices.
  const [subtitle, setSubtitle] = useState<number | null>(null)
  const [audio, setAudio] = useState<number | null>(null)
  const [quality, setQuality] = useState(0)
  const [night, setNight] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [shown, setShown] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)

  // Where to resume from when the stream is re-requested — a quality change,
  // a track change — rather than starting the film again.
  const resumeAt = useRef<number | null>(null)

  /* ── The title, the chapters ─────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false
    api.detail(id).then(
      (detail) => {
        if (cancelled) return
        setItem(detail)
        setSubtitle(null)
        setAudio(null)
      },
      () => {},
    )
    api.chapters(id).then(
      (list) => !cancelled && setChapters(list),
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [id])

  // The whole shelf this title sits on, to find its neighbours. Two pages
  // of two hundred cover any shelf here; a bigger one just loses its tail.
  useEffect(() => {
    if (!item || !SERIAL_TYPES.has(item.type)) return
    let cancelled = false
    ;(async () => {
      const shelf = []
      for (let page = 0; page < 3; page++) {
        try {
          const result = await api.browse({ category: item.type, sort: 'title', size: 200, page })
          shelf.push(...result.items)
          if (page + 1 >= result.totalPages) break
        } catch {
          break
        }
      }
      if (!cancelled) setUpNext(pickUpNext(item, shelf))
    })()
    return () => {
      cancelled = true
    }
  }, [item])

  /* ── Asking what to play ─────────────────────────────────────────── */

  const decide = useCallback(
    async (startSeconds: number) => {
      setError(null)
      const caps = { ...browserCapabilities() }
      const cap = QUALITIES[quality].maxHeight
      if (cap) caps.maxHeight = Math.min(caps.maxHeight ?? cap, cap)
      try {
        const decision = await api.playbackDecision(id, caps, startSeconds)
        setPlan(decision)
      } catch {
        setError('The server would not say how to play this one.')
      }
    },
    [id, quality],
  )

  // The first plan waits for the resume point; later ones carry the current
  // position and are asked for by a choice below.
  useEffect(() => {
    if (!item) return
    setPlan(null)
    decide(resumeAt.current ?? item.resumePositionSeconds ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, quality])

  /* ── Feeding the element ─────────────────────────────────────────── */

  useEffect(() => {
    const element = video.current
    if (!element || !plan) return

    const token = api.getState().token
    const profileId = api.getState().profileId
    const isHls = plan.url.includes('.m3u8')
    let teardown: (() => void) | null = null
    let disposed = false
    setWaiting(true)

    /*
     * The bearer token is the whole difficulty here. The server authenticates
     * media with an Authorization header. For HLS, hls.js fetches every
     * segment itself and `xhrSetup` adds the header. For a direct file the
     * element does its own ranged fetching, and the service worker in
     * public/sw.js signs each of those requests on the way out.
     */
    const canPlayNatively = element.canPlayType('application/vnd.apple.mpegurl') !== ''

    if (isHls && !canPlayNatively) {
      import('hls.js').then(({ default: Hls }) => {
        if (disposed) return
        if (!Hls.isSupported()) {
          setError('This browser cannot play a converted stream.')
          return
        }
        const hls = new Hls({
          xhrSetup: (xhr) => {
            xhr.setRequestHeader('ngrok-skip-browser-warning', 'true')
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            if (profileId) xhr.setRequestHeader('X-Profile-Id', profileId)
          },
        })
        hls.loadSource(api.absolute(plan.url))
        hls.attachMedia(element)
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setError(`Playback failed: ${data.details}`)
        })
        teardown = () => hls.destroy()
      })
    } else {
      const onError = () => {
        setError(
          navigator.serviceWorker?.controller
            ? 'The stream stopped. The server may have dropped the connection — try again.'
            : 'This browser cannot sign the stream request, so the server refused it.',
        )
      }
      element.addEventListener('error', onError)
      streamingReady().then(() => {
        if (!disposed) element.src = api.absolute(plan.url)
      })
      teardown = () => {
        element.removeEventListener('error', onError)
        element.removeAttribute('src')
        element.load()
      }
    }

    return () => {
      disposed = true
      teardown?.()
    }
  }, [plan])

  // Resume where the phone left off, or where this player was before a
  // choice restarted the stream.
  useEffect(() => {
    const element = video.current
    if (!element || !plan) return
    const start = resumeAt.current ?? plan.startSeconds ?? item?.resumePositionSeconds ?? 0
    resumeAt.current = null
    if (start > 0) element.currentTime = start
    element.play().catch(() => {
      /* Autoplay refused: the big button is there. */
    })
  }, [plan, item?.resumePositionSeconds])

  /* ── Mirroring the element ───────────────────────────────────────── */

  useEffect(() => {
    const element = video.current
    if (!element) return
    const onTime = () => setTime(element.currentTime)
    const onDuration = () => setDuration(Number.isFinite(element.duration) ? element.duration : 0)
    const onProgress = () => {
      const ranges = element.buffered
      let end = 0
      for (let i = 0; i < ranges.length; i++) {
        if (ranges.start(i) <= element.currentTime && ranges.end(i) > end) end = ranges.end(i)
      }
      setBuffered(end)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onWaiting = () => setWaiting(true)
    const onReady = () => setWaiting(false)
    const onVolume = () => {
      setMuted(element.muted)
      setVolume(element.volume)
    }
    element.addEventListener('timeupdate', onTime)
    element.addEventListener('durationchange', onDuration)
    element.addEventListener('loadedmetadata', onDuration)
    element.addEventListener('progress', onProgress)
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    element.addEventListener('waiting', onWaiting)
    element.addEventListener('playing', onReady)
    element.addEventListener('canplay', onReady)
    element.addEventListener('volumechange', onVolume)
    return () => {
      element.removeEventListener('timeupdate', onTime)
      element.removeEventListener('durationchange', onDuration)
      element.removeEventListener('loadedmetadata', onDuration)
      element.removeEventListener('progress', onProgress)
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('waiting', onWaiting)
      element.removeEventListener('playing', onReady)
      element.removeEventListener('canplay', onReady)
      element.removeEventListener('volumechange', onVolume)
    }
  }, [])

  // Report progress on a timer and once more on the way out, so closing the
  // tab does not lose the last few minutes.
  useEffect(() => {
    const element = video.current
    if (!element) return
    const report = (finished?: boolean) => {
      if (!element.duration || Number.isNaN(element.duration)) return
      api.recordProgress(id, element.currentTime, element.duration, finished).catch(() => {})
    }
    const timer = setInterval(() => {
      if (!element.paused) report()
    }, PROGRESS_INTERVAL_MS)
    const onEnded = () => {
      report(true)
      setEnded(true)
    }
    element.addEventListener('ended', onEnded)
    return () => {
      clearInterval(timer)
      element.removeEventListener('ended', onEnded)
      report()
    }
  }, [id])

  // At the end, count down and move on — unless the card was dismissed,
  // in which case the credits play out and the screen stays.
  const goNext = useCallback(() => {
    if (upNext) navigate(`/watch/${encodeURIComponent(upNext.item.id)}`, { replace: true })
  }, [upNext, navigate])

  useEffect(() => {
    if (!ended || !upNext || upNextDismissed) {
      setCountdown(null)
      return
    }
    setCountdown(AUTOPLAY_COUNTDOWN_S)
    const started = Date.now()
    const timer = window.setInterval(() => {
      const left = AUTOPLAY_COUNTDOWN_S - Math.floor((Date.now() - started) / 1000)
      if (left <= 0) {
        window.clearInterval(timer)
        goNext()
      } else {
        setCountdown(left)
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [ended, upNext, upNextDismissed, goNext])

  /* ── Controls ────────────────────────────────────────────────────── */

  const toggle = useCallback(() => {
    const element = video.current
    if (!element) return
    if (element.paused) element.play().catch(() => {})
    else element.pause()
  }, [])

  const skip = useCallback((seconds: number) => {
    const element = video.current
    if (!element) return
    element.currentTime = Math.max(0, Math.min(element.currentTime + seconds, element.duration || Infinity))
  }, [])

  const seek = useCallback((seconds: number) => {
    const element = video.current
    if (element) element.currentTime = seconds
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = stage.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
  }, [])

  const pictureInPicture = useCallback(() => {
    const element = video.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null
    if (!element) return
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {})
    else element.requestPictureInPicture?.().catch(() => {})
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // A choice of track goes to the server, which remembers it for this title
  // and, for a converted stream, applies it. Then the stream is asked for
  // again from where we are.
  const chooseTracks = useCallback(
    async (nextSubtitle: number | null, nextAudio: number | null) => {
      setSubtitle(nextSubtitle)
      setAudio(nextAudio)
      setSheet(null)
      resumeAt.current = video.current?.currentTime ?? 0
      try {
        await api.selectTracks(id, nextSubtitle, nextAudio)
      } catch {
        /* The server did not take it; the stream still restarts as it was. */
      }
      decide(resumeAt.current)
    },
    [id, decide],
  )

  const chooseQuality = useCallback((index: number) => {
    resumeAt.current = video.current?.currentTime ?? 0
    setQuality(index)
    setSheet(null)
  }, [])

  // Hide after stillness while playing; a move, a touch or a key brings it
  // back. Never hidden while paused, on an error, or with a sheet open.
  const hideTimer = useRef<number | null>(null)
  const poke = useCallback(() => {
    setShown(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShown(false), HIDE_AFTER_MS)
  }, [])

  useEffect(() => {
    poke()
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [poke])

  const controlsVisible = shown || !playing || Boolean(error) || sheet !== null
  const nearEnd = duration > 0 && duration - time <= UP_NEXT_BEFORE_END_S
  const upNextVisible = Boolean(upNext) && !upNextDismissed && (nearEnd || ended)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      const element = video.current
      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault()
          toggle()
          break
        case 'ArrowLeft':
        case 'j':
          event.preventDefault()
          skip(-SKIP_SECONDS)
          break
        case 'ArrowRight':
        case 'l':
          event.preventDefault()
          skip(SKIP_SECONDS)
          break
        case 'ArrowUp':
          event.preventDefault()
          if (element) element.volume = Math.min(1, element.volume + 0.1)
          break
        case 'ArrowDown':
          event.preventDefault()
          if (element) element.volume = Math.max(0, element.volume - 0.1)
          break
        case 'm':
          if (element) element.muted = !element.muted
          break
        case 'f':
          toggleFullscreen()
          break
        case 'n':
          setNight((on) => !on)
          break
        case 'Escape':
          if (sheet) setSheet(null)
          break
        default:
          return
      }
      poke()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, skip, toggleFullscreen, poke, sheet])

  /* ── Drawing it ──────────────────────────────────────────────────── */

  const direct = plan?.mode === 'DIRECT'
  const fraction = duration > 0 ? time / duration : 0
  const bufferedFraction = duration > 0 ? buffered / duration : 0
  const subtitles = item?.subtitles ?? []
  const audioTracks = item?.audioTracks ?? []
  const subtitleName =
    subtitle === null
      ? 'Subtitles off'
      : subtitleLabel(subtitles.find((t) => t.index === subtitle) ?? { index: subtitle })
  const audioName =
    audio === null ? 'Audio' : audioLabel(audioTracks.find((t) => t.index === audio) ?? { index: audio })

  return (
    <div
      ref={stage}
      className={`pl${controlsVisible ? ' pl--shown' : ' pl--hidden'}${night ? ' pl--night' : ''}`}
      onMouseMove={poke}
      onTouchStart={poke}
    >
      <video
        ref={video}
        className="pl-video"
        playsInline
        onClick={() => {
          if (sheet) setSheet(null)
          else if (shown) toggle()
          else poke()
        }}
      />

      {/* Night view: a warm veil, not a dimmer. */}
      <div className="pl-veil" aria-hidden="true" />

      {waiting && !error && playing && <div className="pl-spinner" aria-label="Loading" />}

      <div className="pl-ui" aria-hidden={!controlsVisible}>
        <header className="pl-top">
          <button type="button" className="pl-icon" onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <svg viewBox="0 0 20 20"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
          </button>
          <div className="pl-heading">
            <b>{item?.title ?? ''}</b>
            <span className="mono">Tower · Online</span>
          </div>
          {plan && (
            <span className={`pl-pill${direct ? '' : ' pl-pill--warn'}`}>
              <i aria-hidden="true" /> {direct ? 'Direct play' : 'Converting'}
            </span>
          )}
          <button
            type="button"
            className={`pl-icon${night ? ' is-on' : ''}`}
            onClick={() => setNight(!night)}
            aria-pressed={night}
            aria-label={night ? 'Night view, on' : 'Night view'}
            title="Night view (n)"
          >
            <svg viewBox="0 0 20 20"><path d="M13.5 2.5a7.5 7.5 0 1 0 4 13.2A8 8 0 0 1 13.5 2.5z" /></svg>
          </button>
          <button type="button" className="pl-icon" onClick={pictureInPicture} aria-label="Picture in picture" title="Picture in picture">
            <svg viewBox="0 0 20 20"><rect x="2" y="4" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="9.5" y="9.5" width="6.5" height="4.5" rx="1" /></svg>
          </button>
          <button type="button" className="pl-icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} title="Full screen (f)">
            {fullscreen ? (
              <svg viewBox="0 0 20 20"><path d="M7 3v4H3M13 3v4h4M7 17v-4H3M13 17v-4h4" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
            ) : (
              <svg viewBox="0 0 20 20"><path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
            )}
          </button>
        </header>

        {!error && (
          <div className="pl-centre">
            <button type="button" className="pl-skip" onClick={() => skip(-SKIP_SECONDS)} aria-label="Back ten seconds" title="Back 10s (←)">
              <svg viewBox="0 0 24 24"><path d="M11 6 3 12l8 6zM21 6l-8 6 8 6z" /></svg>
              <span className="mono">10</span>
            </button>
            <button type="button" className="pl-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (space)' : 'Play (space)'}>
              {playing ? (
                <svg viewBox="0 0 12 14"><rect x="0" y="0" width="4" height="14" rx="1" /><rect x="8" y="0" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg viewBox="0 0 12 14"><path d="M0 0l12 7-12 7z" /></svg>
              )}
            </button>
            <button type="button" className="pl-skip" onClick={() => skip(SKIP_SECONDS)} aria-label="Forward ten seconds" title="Forward 10s (→)">
              <svg viewBox="0 0 24 24"><path d="M13 6l8 6-8 6zM3 6l8 6-8 6z" /></svg>
              <span className="mono">10</span>
            </button>
          </div>
        )}

        {error && (
          <div className="pl-error">
            <p>{error}</p>
            <div className="pl-error-actions">
              <button type="button" className="btn btn-primary" onClick={() => item && decide(video.current?.currentTime ?? 0)}>
                Try again
              </button>
              <Link className="btn btn-outline" to={`/title/${encodeURIComponent(id)}`}>
                Back to the title
              </Link>
            </div>
          </div>
        )}

        <footer className="pl-bottom">
          <div className="pl-chips">
            <button type="button" className={`pl-chip${sheet === 'subtitles' ? ' is-on' : ''}`} onClick={() => setSheet(sheet === 'subtitles' ? null : 'subtitles')}>
              {subtitleName}
            </button>
            <button type="button" className={`pl-chip${sheet === 'audio' ? ' is-on' : ''}`} onClick={() => setSheet(sheet === 'audio' ? null : 'audio')}>
              {audioName}
            </button>
            <button type="button" className={`pl-chip${sheet === 'quality' ? ' is-on' : ''}`} onClick={() => setSheet(sheet === 'quality' ? null : 'quality')}>
              {quality === 0 ? 'Quality' : QUALITIES[quality].label}
            </button>
            {upNext?.kind === 'episode' && (
              <button type="button" className="pl-chip pl-chip--next" onClick={goNext} title={upNext.item.title}>
                Next episode
                <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="13" y="2" width="2" height="12" rx="0.5" /><path d="M1 2v12l11-6z" /></svg>
              </button>
            )}
            <span className="pl-spacer" />
            <button type="button" className="pl-icon pl-mute" onClick={() => { const v = video.current; if (v) v.muted = !v.muted }} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (m)">
              {muted || volume === 0 ? (
                <svg viewBox="0 0 16 16"><path d="M1 6h3l4-3v10l-4-3H1z" /><path d="M10 6l5 4M15 6l-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              ) : (
                <svg viewBox="0 0 16 16"><path d="M1 6h3l4-3v10l-4-3H1z" /><path d="M10.5 5.2a3.5 3.5 0 0 1 0 5.6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M12.6 3a6 6 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
              )}
            </button>
            <input
              type="range"
              className="np-range pl-volume"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              onChange={(event) => { const v = video.current; if (v) { v.volume = Number(event.target.value); v.muted = false } }}
              style={{ '--fill': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
              aria-label="Volume"
            />
          </div>

          <div className="pl-seek">
            <div className="pl-track" aria-hidden="true">
              <i className="pl-buffered" style={{ width: `${(bufferedFraction * 100).toFixed(2)}%` }} />
              <i className="pl-played" style={{ width: `${(fraction * 100).toFixed(2)}%` }} />
              {duration > 0 &&
                chapters
                  .filter((chapter) => chapter.startSeconds > 0 && chapter.startSeconds < duration)
                  .map((chapter) => (
                    <b
                      key={chapter.index}
                      className="pl-tick"
                      style={{ left: `${((chapter.startSeconds / duration) * 100).toFixed(2)}%` }}
                      title={chapter.title ?? undefined}
                    />
                  ))}
            </div>
            <input
              type="range"
              className="pl-scrub"
              min={0}
              max={duration || 0}
              step={0.25}
              value={Math.min(time, duration || 0)}
              onChange={(event) => seek(Number(event.target.value))}
              onInput={poke}
              aria-label="Seek"
              disabled={!duration}
            />
          </div>

          <div className="pl-times mono">
            <span>{clock(time)}</span>
            <span>{duration > 0 ? `-${clock(Math.max(0, duration - time))}` : ''}</span>
          </div>
        </footer>
      </div>

      {upNextVisible && upNext && (
        <aside className={`pl-next${ended && !error ? ' pl-next--ended' : ''}`} aria-label="Up next">
          <Artwork
            className="pl-next-art"
            id={upNext.item.id}
            title={upNext.item.title}
            type={upNext.item.type}
            kind={upNext.item.hasBackdrop ? 'backdrop' : 'poster'}
            present={upNext.item.hasBackdrop || upNext.item.hasPoster}
          />
          <div className="pl-next-text">
            <span className="mono">
              {upNext.kind === 'episode' ? 'Next episode' : 'Up next · another series'}
              {countdown !== null && ` · playing in ${countdown}`}
            </span>
            <b>{upNext.item.title}</b>
            {upNext.kind === 'series' && <em>{upNext.series}</em>}
          </div>
          <div className="pl-next-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={goNext}>
              Play now
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setUpNextDismissed(true)}>
              {ended ? 'Stay' : 'Not now'}
            </button>
          </div>
        </aside>
      )}

      {sheet && (
        <div className="pl-sheet" role="dialog" aria-label={sheet}>
          <header>
            <span className="mono">{sheet}</span>
            <button type="button" className="pl-icon" onClick={() => setSheet(null)} aria-label="Close">
              <svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
          </header>
          {sheet === 'subtitles' && (
            <ul>
              {/* "Off" first, because turning them off is the commonest choice. */}
              <li><button type="button" aria-pressed={subtitle === null} onClick={() => chooseTracks(null, audio)}>Off</button></li>
              {subtitles.map((track) => (
                <li key={track.index}>
                  <button type="button" aria-pressed={subtitle === track.index} onClick={() => chooseTracks(track.index, audio)}>
                    {subtitleLabel(track)}
                  </button>
                </li>
              ))}
              {subtitles.length === 0 && <li className="pl-sheet-note">This file carries no subtitles.</li>}
            </ul>
          )}
          {sheet === 'audio' && (
            <ul>
              {audioTracks.map((track) => (
                <li key={track.index}>
                  <button type="button" aria-pressed={audio === track.index} onClick={() => chooseTracks(subtitle, track.index)}>
                    {audioLabel(track)}
                  </button>
                </li>
              ))}
              {audioTracks.length === 0 && <li className="pl-sheet-note">One audio track, and this is it.</li>}
            </ul>
          )}
          {sheet === 'quality' && (
            <ul>
              {QUALITIES.map((option, index) => (
                <li key={option.label}>
                  <button type="button" aria-pressed={quality === index} onClick={() => chooseQuality(index)}>
                    {option.label}
                    {index === 0 && plan && (
                      <span className="mono">{direct ? 'as on the disk' : 'converted'}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
