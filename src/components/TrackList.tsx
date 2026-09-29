import { Link } from 'react-router-dom'
import { Artwork } from './Artwork'
import { creditLine } from './PosterCard'
import { usePlayer } from '../playback/PlayerContext'
import type { ItemSummaryDto } from '../api/types'

/**
 * A run of tracks, as a list rather than a wall of tiles.
 *
 * Two thousand loose MP3s in a poster grid is unreadable: the art is a
 * placeholder gradient for most of them, so the grid becomes coloured squares
 * with the actual information — the title — squeezed underneath in two lines.
 * A list puts the title first and at full width, which is what you are
 * actually scanning for.
 *
 * The row number turns into a play control on hover, which is the one
 * borrowed idea here: it keeps the column narrow and means every row has a
 * target without a button sitting in all two thousand of them. Pressing it
 * — or double-clicking the row, as on a desktop player — starts this track
 * with the rest of the list queued behind it. The title itself is still a
 * link to the track's page; playing and reading about are different acts.
 */
export function TrackList({ items, source = 'Library' }: { items: ItemSummaryDto[]; source?: string }) {
  const player = usePlayer()
  const start = (index: number) => player.play(items, index, source)

  return (
    <ol className="tracklist">
      {items.map((item, index) => {
        // The scanner fills `artist` from the folder or the filename, so it is
        // frequently the title over again. Printing both is not two facts.
        const artist = creditLine(item)
        const isCurrent = player.current?.id === item.id
        const detail = `/title/${encodeURIComponent(item.id)}`
        return (
          <li
            key={item.id}
            className={`tracklist-row${isCurrent ? ' is-playing' : ''}`}
            onDoubleClick={() => start(index)}
          >
            <button
              type="button"
              className="tracklist-index mono"
              onClick={() => (isCurrent ? player.toggle() : start(index))}
              aria-label={isCurrent && player.playing ? `Pause ${item.title}` : `Play ${item.title}`}
            >
              <span className="n">{index + 1}</span>
              {isCurrent && player.playing ? (
                <svg viewBox="0 0 10 12" aria-hidden="true">
                  <rect x="0" y="0" width="3.5" height="12" rx="0.8" />
                  <rect x="6.5" y="0" width="3.5" height="12" rx="0.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 10 12" aria-hidden="true">
                  <path d="M0 0l10 6-10 6z" />
                </svg>
              )}
            </button>

            <Link to={detail} className="tracklist-art-link" tabIndex={-1} aria-hidden="true">
              <Artwork
                className="tracklist-art"
                id={item.id}
                title={item.title}
                type={item.type}
                kind="poster"
                present={item.hasPoster}
              />
            </Link>

            <span className="tracklist-name">
              <b>
                <Link to={detail}>{item.title}</Link>
              </b>
              {artist && <em>{artist}</em>}
            </span>

            <span className="tracklist-album mono">{item.album ?? ''}</span>

            <span className="tracklist-time mono">
              {item.runtimeMinutes ? `${item.runtimeMinutes} MIN` : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
