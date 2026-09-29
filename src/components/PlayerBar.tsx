import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Artwork, useArtwork } from './Artwork'
import { creditLine } from './PosterCard'
import { clock, usePlayer } from '../playback/PlayerContext'
import { useWide } from './NowPanel'

/*
 * The bar along the bottom of the client while music plays.
 *
 * Laid out the way every music service lays it out, because listeners already
 * know where to look: what is playing on the left, the transport and the
 * scrubber in the middle, the queue and the volume on the right. A phone gets
 * the compact version — artwork, title, three buttons, a hairline of progress
 * along the top edge — since a seek bar and a volume slider are not things a
 * thumb wants on a 400px strip.
 *
 * It is a view of PlayerContext and nothing more: no state lives here.
 */

const Icon = {
  play: (
    <svg viewBox="0 0 12 14" aria-hidden="true">
      <path d="M0 0l12 7-12 7z" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 12 14" aria-hidden="true">
      <rect x="0" y="0" width="4" height="14" rx="1" />
      <rect x="8" y="0" width="4" height="14" rx="1" />
    </svg>
  ),
  previous: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="2" width="2" height="12" rx="0.5" />
      <path d="M15 2v12L4 8z" />
    </svg>
  ),
  next: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="13" y="2" width="2" height="12" rx="0.5" />
      <path d="M1 2v12l11-6z" />
    </svg>
  ),
  shuffle: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M11 2h4v4l-1.5-1.5L10.7 7.3 9.3 5.9l2.8-2.8zM1 3h3.5l2.3 2.3-1.4 1.4L3.7 5H1zM1 11h2.7l8.1-8.1L13.5 4.5 15 6V2M11 14h4v-4l-1.5 1.5L10.7 8.7 9.3 10.1l2.8 2.8zM1 11h2.7l2.6-2.6 1.4 1.4L4.5 13H1z"
        fillRule="evenodd"
      />
    </svg>
  ),
  repeat: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 5h8V3l3 3-3 3V7H3zM13 11H5v2l-3-3 3-3v2h8z" />
    </svg>
  ),
  queue: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="2" width="10" height="2" rx="1" />
      <rect x="1" y="7" width="10" height="2" rx="1" />
      <rect x="1" y="12" width="7" height="2" rx="1" />
      <path d="M11 9V15l4-3z" />
    </svg>
  ),
  volume: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 6h3l4-3v10l-4-3H1z" />
      <path d="M10.5 5.2a3.5 3.5 0 0 1 0 5.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12.6 3a6 6 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  muted: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 6h3l4-3v10l-4-3H1z" />
      <path d="M10 6l5 4M15 6l-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
}

export function PlayerBar() {
  const player = usePlayer()
  const wide = useWide()
  const item = player.current
  const artwork = useArtwork(item?.id ?? null, 'poster', item?.hasPoster)

  // What the lock screen and the media-key overlay show.
  useEffect(() => {
    if (!item || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: creditLine(item) ?? item.artist ?? '',
      album: item.album ?? '',
      artwork: artwork ? [{ src: artwork, sizes: '512x512', type: 'image/jpeg' }] : [],
    })
  }, [item, artwork])

  if (!item) return null

  const detail = `/title/${encodeURIComponent(item.id)}`
  const artist = creditLine(item) ?? item.artist ?? item.album ?? null
  const fraction = player.duration > 0 ? player.time / player.duration : 0
  const percent = `${(fraction * 100).toFixed(2)}%`

  return (
    <>
      {/* On a wide screen the queue lives in the right-hand column instead. */}
      {player.open && !wide && <QueuePanel />}

      <div className="player-bar" data-mode="music" role="region" aria-label="Now playing">
        {/* Phone only: progress as a hairline along the top, since the
            scrubber below is hidden there. */}
        <div className="np-progress" aria-hidden="true">
          <i style={{ width: percent }} />
        </div>

        <div className="np">
          <Link to={detail} className="np-art" aria-label={`Open ${item.title}`}>
            <Artwork
              className="np-art-frame"
              id={item.id}
              title={item.title}
              type={item.type}
              kind="poster"
              present={item.hasPoster}
            />
          </Link>
          <div className="np-text">
            <Link to={detail} className="np-title" title={item.title}>
              {item.title}
            </Link>
            {player.error ? (
              <span className="np-artist np-error">{player.error}</span>
            ) : (
              <span className="np-artist">
                {player.loading ? 'Loading…' : artist ?? ''}
              </span>
            )}
          </div>
        </div>

        <div className="np-controls">
          <div className="np-buttons">
            <button
              type="button"
              className="np-side"
              onClick={player.toggleShuffle}
              aria-pressed={player.shuffle}
              aria-label="Shuffle"
              title="Shuffle"
            >
              {Icon.shuffle}
            </button>
            <button type="button" onClick={player.previous} aria-label="Previous" title="Previous">
              {Icon.previous}
            </button>
            <button
              type="button"
              className={`np-play${player.loading ? ' np-play--loading' : ''}`}
              onClick={player.toggle}
              aria-label={player.playing ? 'Pause' : 'Play'}
              title={player.playing ? 'Pause' : 'Play'}
            >
              {player.playing ? Icon.pause : Icon.play}
            </button>
            <button type="button" onClick={player.next} aria-label="Next" title="Next">
              {Icon.next}
            </button>
            <button
              type="button"
              className="np-side"
              onClick={player.cycleRepeat}
              aria-pressed={player.repeat !== 'off'}
              data-repeat={player.repeat}
              aria-label={
                player.repeat === 'off'
                  ? 'Repeat off'
                  : player.repeat === 'all'
                    ? 'Repeat the queue'
                    : 'Repeat this track'
              }
              title={
                player.repeat === 'off' ? 'Repeat' : player.repeat === 'all' ? 'Repeat: queue' : 'Repeat: this track'
              }
            >
              {Icon.repeat}
              {player.repeat === 'one' && <b className="np-one">1</b>}
            </button>
          </div>

          <div className="np-seek">
            <span className="mono">{clock(player.time)}</span>
            <input
              type="range"
              className="np-range"
              min={0}
              max={player.duration || 0}
              step={0.5}
              value={Math.min(player.time, player.duration || 0)}
              onChange={(event) => player.seek(Number(event.target.value))}
              style={{ '--fill': percent } as React.CSSProperties}
              aria-label="Seek"
              disabled={!player.duration}
            />
            <span className="mono">{clock(player.duration)}</span>
          </div>
        </div>

        <div className="np-extras">
          <button
            type="button"
            onClick={() => player.setOpen(!player.open)}
            aria-pressed={player.open}
            aria-label="Queue"
            title="Queue"
          >
            {Icon.queue}
          </button>
          <button
            type="button"
            className="np-mute"
            onClick={player.toggleMute}
            aria-label={player.muted ? 'Unmute' : 'Mute'}
            title={player.muted ? 'Unmute' : 'Mute'}
          >
            {player.muted || player.volume === 0 ? Icon.muted : Icon.volume}
          </button>
          <input
            type="range"
            className="np-range np-volume"
            min={0}
            max={1}
            step={0.02}
            value={player.muted ? 0 : player.volume}
            onChange={(event) => player.setVolume(Number(event.target.value))}
            style={{ '--fill': `${(player.muted ? 0 : player.volume) * 100}%` } as React.CSSProperties}
            aria-label="Volume"
          />
          <button type="button" onClick={player.close} aria-label="Close player" title="Close">
            {Icon.close}
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * The queue, in the order it will play. The current track is marked, and any
 * row jumps to it — including back to one already played, which is why the
 * whole order is shown rather than only what is still to come.
 */
function QueuePanel() {
  const player = usePlayer()

  return (
    <aside className="queue" aria-label="Queue">
      <header className="queue-head">
        <span className="mono">
          Queue · {player.order.length} {player.order.length === 1 ? 'track' : 'tracks'}
        </span>
        <button type="button" onClick={() => player.setOpen(false)} aria-label="Close queue">
          {Icon.close}
        </button>
      </header>
      <QueueList />
    </aside>
  )
}

/** The queue as rows, shared by the sheet on a phone and the column on a desktop. */
export function QueueList() {
  const player = usePlayer()
  return (
      <ol className="queue-list">
        {player.order.map((queueIndex, pos) => {
          const item = player.queue[queueIndex]
          if (!item) return null
          const isCurrent = pos === player.pos
          const artist = creditLine(item)
          return (
            <li key={`${item.id}-${pos}`} className={isCurrent ? 'is-current' : undefined}>
              <button type="button" onClick={() => player.jumpTo(pos)}>
                <span className="mono queue-n">
                  {isCurrent ? (player.playing ? Icon.pause : Icon.play) : pos + 1}
                </span>
                <Artwork
                  className="queue-art"
                  id={item.id}
                  title={item.title}
                  type={item.type}
                  kind="poster"
                  present={item.hasPoster}
                />
                <span className="queue-name">
                  <b>{item.title}</b>
                  {artist && <em>{artist}</em>}
                </span>
                <span className="mono queue-time">
                  {item.runtimeMinutes ? `${item.runtimeMinutes} min` : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
  )
}
