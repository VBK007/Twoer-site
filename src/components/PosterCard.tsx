import { Link } from 'react-router-dom'
import type { KeyboardEvent, MouseEvent } from 'react'
import { Artwork } from './Artwork'
import { usePlayer } from '../playback/PlayerContext'
import type { ItemSummaryDto } from '../api/types'

/** `2h 4m`, `22m` — the app's phrasing: lowercase, not a mono measurement. */
export function runtimeLabel(minutes?: number | null): string | null {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/**
 * Everything is a poster, including music.
 *
 * I had music as square on the reasoning that a 2:3 crop of an album cover is
 * wrong. The app does not agree and it is right to: almost none of these files
 * have cover art, so the tile is a gradient either way, and one shape means
 * one grid rhythm instead of a ragged mix. What music gets instead is a play
 * button on the tile — see `playable` below.
 */
export function shapeOf(type?: string): 'square' | 'wide' | 'poster' {
  if (type === 'HOME_VIDEO' || type === 'PHOTO') return 'wide'
  return 'poster'
}

/**
 * The artist, unless it is just the title again.
 *
 * The scanner fills `artist` from the folder or the filename, so a library of
 * loose MP3s produces "01 SAARE JAHA PREM YAHAA" under "01 SAARE JAHA PREM
 * YAHAA.mp3" constantly. Saying it twice is not more information.
 */
export function creditLine(item: ItemSummaryDto): string | null {
  const artist = item.artist?.trim()
  if (!artist) return null
  const a = artist.toLowerCase()
  const t = item.title.toLowerCase()
  return t.includes(a) || a.includes(t) ? null : artist
}

interface PosterCardProps {
  item: ItemSummaryDto
  /** Force the wide shape, for rails that want backdrops regardless of type. */
  wide?: boolean
  /** Profile state only means something with an account behind it. */
  personal?: boolean
  /**
   * The list this tile was drawn from. A track's play button starts the
   * track with the rest of that list queued after it, as pressing play on
   * one song in an album does — rather than one song and then silence.
   */
  queue?: ItemSummaryDto[]
}

/**
 * A tile, as the Android app draws one.
 *
 * The title sits **on** the artwork over a scrim, not underneath it — see
 * PosterCard.kt and shots/p1_posters.png. Only what the server *measured*
 * goes below the tile, in mono, and only when it knows it: a poster with no
 * quality string simply has nothing under it.
 *
 * That split is the whole rule of this design — words a human wrote live on
 * the picture, facts the server measured live outside it in monospace.
 */
export function PosterCard({ item, wide, personal, queue }: PosterCardProps) {
  const shape = wide ? 'wide' : shapeOf(item.type)
  const percent = item.percentComplete ?? 0
  const below = item.quality ?? creditLine(item) ?? runtimeLabel(item.runtimeMinutes)

  const player = usePlayer()
  const isCurrent = player.current?.id === item.id
  const startPlaying = (event: MouseEvent | KeyboardEvent) => {
    // The whole tile is a link to the title's page. The button on it is not.
    event.preventDefault()
    event.stopPropagation()
    if (isCurrent) {
      player.toggle()
      return
    }
    const list = queue && queue.length > 0 ? queue : [item]
    const index = Math.max(0, list.findIndex((other) => other.id === item.id))
    player.play(list, index, 'Library')
  }

  return (
    <Link
      to={`/title/${encodeURIComponent(item.id)}`}
      className={`tile tile--${shape}`}
      title={item.title}
    >
      <div className="tile-frame">
        <Artwork
          className="tile-art"
          id={item.id}
          title={item.title}
          type={item.type}
          kind={shape === 'wide' ? 'backdrop' : 'poster'}
          present={shape === 'wide' ? item.hasBackdrop : item.hasPoster}
        />

        {/* An unwatched dot is a statement about a profile. Without an account
            there is no profile, and marking all 2,819 titles "new" is noise. */}
        {personal && !item.watched && percent === 0 && (
          <i className="tile-dot" aria-hidden="true" />
        )}

        {/* The clamp lives on the inner span, not on the padded box:
            -webkit-line-clamp sizes the content area only, so padding on the
            same element lets a third line show through underneath it. */}
        <span className="tile-name">
          <span>{item.title}</span>
        </span>

        {/*
          A track carries its play button on the tile, always visible — the app
          does the same. A film does not: pressing it commits two hours and the
          detail screen is where that decision belongs, whereas a four-minute
          song is a thing you start, not a thing you consider.
        */}
        {item.type === 'MUSIC' && (
          <span
            className="tile-play tile-play--always"
            role="button"
            tabIndex={0}
            aria-label={isCurrent && player.playing ? `Pause ${item.title}` : `Play ${item.title}`}
            onClick={startPlaying}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') startPlaying(event)
            }}
          >
            {isCurrent && player.playing ? (
              <svg viewBox="0 0 10 12">
                <rect x="0" y="0" width="3.5" height="12" rx="0.8" />
                <rect x="6.5" y="0" width="3.5" height="12" rx="0.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 12">
                <path d="M0 0l10 6-10 6z" />
              </svg>
            )}
          </span>
        )}

        {percent > 0 && percent < 100 && (
          <div className="tile-progress" aria-hidden="true">
            <i style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      {below && <span className="mono tile-below">{below}</span>}
    </Link>
  )
}

/**
 * A tile-shaped hole while the shelf loads.
 *
 * The grid is laid out before anything arrives so it does not jump when it
 * does — the previous version printed the word "Loading…" and then shoved the
 * whole page down.
 */
export function TileSkeleton({ shape = 'poster' }: { shape?: 'poster' | 'square' | 'wide' }) {
  return (
    <div className={`tile tile--${shape} tile--skeleton`} aria-hidden="true">
      <div className="tile-frame">
        <div className="tile-art shimmer" />
      </div>
    </div>
  )
}
