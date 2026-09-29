import { useState } from 'react'
import { Artwork } from './Artwork'
import { TrackList } from './TrackList'
import { creditLine } from './PosterCard'
import { usePlayer } from '../playback/PlayerContext'
import type { HomeRailDto, ItemSummaryDto, MusicHomeDto } from '../api/types'

/*
 * Music, as shelves rather than as a list — the Android app's Library, drawn
 * here. See MusicShelves.kt for the reasoning in full; the short version is
 * that a few hundred tracks all look alike at tile size and nobody scans an
 * alphabetical wall of songs looking for a mood. So this is ways *in*: what
 * you were part-way through, then shelves by mood, activity, era and who made
 * them, each computed by the server from the audio itself.
 *
 * Square art, because that is the shape a sleeve is. The rails are whatever
 * the server sends, in the order it sends them; nothing here knows what a
 * mood is.
 */

/**
 * "MOOD" over "Romantic". The server splits a rail into an axis and a value
 * and sends a title that keeps only the value; the axis goes back above it
 * in mono, so eighteen bare nouns do not arrive as eighteen shelves of
 * apparently the same kind.
 */
export function kickerFor(key: string | null | undefined): string | null {
  switch ((key ?? '').split(':')[0]) {
    case 'mood':
      return 'Mood'
    case 'activity':
      return 'For'
    case 'era':
      return 'Era'
    case 'director':
      return 'Music director'
    case 'singer':
      return 'Singer'
    case 'hero':
      return 'Starring'
    default:
      return null
  }
}

function tracksOf(rail: HomeRailDto): ItemSummaryDto[] {
  return (rail.items ?? []).map((entry) => entry.item).filter(Boolean)
}

interface MusicShelvesProps {
  home: MusicHomeDto | null
  loading: boolean
}

export function MusicShelves({ home, loading }: MusicShelvesProps) {
  if (loading && !home) return <ShelfSkeleton />

  const resume = home?.continueListening ?? []
  const rails = (home?.rails ?? []).filter((rail) => tracksOf(rail).length > 0)

  if (resume.length === 0 && rails.length === 0) {
    return (
      <div className="empty card">
        <span className="mono">No music yet</span>
        <p>The server has not built any shelves. They appear once it has listened to the disk.</p>
      </div>
    )
  }

  return (
    <div className="shelves">
      {resume.length > 0 && <Shelf heading="Pick up where you left off" tracks={resume} />}
      {rails.map((rail) => (
        <Shelf
          key={rail.key ?? rail.title ?? ''}
          heading={rail.title ?? rail.key ?? ''}
          kicker={kickerFor(rail.key)}
          tracks={tracksOf(rail)}
          openable
        />
      ))}
    </div>
  )
}

interface ShelfProps {
  heading: string
  tracks: ItemSummaryDto[]
  kicker?: string | null
  /** The heading opens the shelf as a list — the app's playlist screen, in place. */
  openable?: boolean
}

function Shelf({ heading, tracks, kicker, openable }: ShelfProps) {
  const [open, setOpen] = useState(false)
  const player = usePlayer()

  const head = (
    <>
      {kicker && <span className="mono shelf-kicker">{kicker}</span>}
      <span className="shelf-title">
        {heading}
        {openable && (
          <svg viewBox="0 0 10 10" aria-hidden="true" className={open ? 'is-open' : undefined}>
            <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </span>
    </>
  )

  return (
    <section className="shelf">
      {openable ? (
        <button
          type="button"
          className="shelf-head as-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {head}
        </button>
      ) : (
        <div className="shelf-head">{head}</div>
      )}

      {open ? (
        <TrackList items={tracks} />
      ) : (
        <div className="shelf-row">
          {tracks.map((track, index) => (
            <AlbumTile
              key={track.id}
              track={track}
              playing={player.current?.id === track.id && player.playing}
              onPlay={() =>
                player.current?.id === track.id
                  ? player.toggle()
                  : player.play(tracks, index, heading)
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * A square of art, a title and whoever made it.
 *
 * The initial is painted under the art rather than instead of it: the disk is
 * full of MP3s the server reports as having a cover and then serves nothing
 * for, and those would come out as bare gradients. Large and faint, so it
 * reads as the texture of a blank sleeve rather than a caption that failed.
 * The artist line keeps its height even when empty, so a shelf of tagged and
 * untagged tracks does not come out ragged.
 */
function AlbumTile({
  track,
  playing,
  onPlay,
}: {
  track: ItemSummaryDto
  playing: boolean
  onPlay: () => void
}) {
  const artist = creditLine(track) ?? track.artist ?? ''
  return (
    <button
      type="button"
      className={`sleeve${playing ? ' is-playing' : ''}`}
      onClick={onPlay}
      aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
      title={track.title}
    >
      <span className="sleeve-art">
        <Artwork
          className="sleeve-image"
          id={track.id}
          title={track.title}
          type={track.type}
          kind="poster"
          present={track.hasPoster}
        />
        <span className="sleeve-initial" aria-hidden="true">
          {track.title.trim().charAt(0).toUpperCase()}
        </span>
        <span className="sleeve-play" aria-hidden="true">
          {playing ? (
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
      </span>
      <span className="sleeve-title">{track.title}</span>
      <span className="sleeve-artist">{artist}</span>
    </button>
  )
}

/** Two shelves' worth, so the wait looks like the thing that is coming. */
function ShelfSkeleton() {
  return (
    <div className="shelves" aria-busy="true">
      {[0, 1].map((row) => (
        <section className="shelf" key={row}>
          <div className="shelf-head">
            <span className="skeleton-line skeleton-line--head" />
          </div>
          <div className="shelf-row">
            {Array.from({ length: 6 }, (_, i) => (
              <span className="sleeve sleeve--skeleton" key={i}>
                <span className="sleeve-art shimmer" />
                <span className="skeleton-line" />
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
