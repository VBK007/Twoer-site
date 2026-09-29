import { Link } from 'react-router-dom'
import { Artwork } from './Artwork'
import type { TeaserClipDto } from '../api/types'

/** `0:34` — clips are seconds long, so minutes:seconds, not the H/M form. */
function clipLength(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * One clip in the teaser rail.
 *
 * Vertical, because that is the shape it was cut to. The still is the parent
 * film's own poster rather than a frame from the clip: the server exposes no
 * thumbnail for a teaser, and the alternative — pulling a frame client-side —
 * means downloading the video to show a picture of it.
 *
 * It links to the title, not to a player. That matches what the feed is for
 * on the phone: "tap through to the title itself rather than straight into a
 * two-hour commitment." Playing the clip inline is not possible here anyway —
 * `fileUrl` needs a bearer token and a `<video src>` cannot send one.
 */
export function TeaserCard({ clip }: { clip: TeaserClipDto }) {
  const length = clipLength(clip.durationSeconds)
  const title = clip.itemTitle ?? 'Untitled'

  return (
    <Link
      to={clip.mediaItemId ? `/title/${encodeURIComponent(clip.mediaItemId)}` : '#'}
      className="tile tile--teaser"
      title={title}
    >
      <div className="tile-frame">
        <Artwork
          className="tile-art"
          id={clip.mediaItemId ?? ''}
          title={title}
          kind="poster"
          present={Boolean(clip.mediaItemId)}
        />

        <span className="tile-play" aria-hidden="true">
          <svg viewBox="0 0 10 12">
            <path d="M0 0l10 6-10 6z" />
          </svg>
        </span>

        {length && <span className="tile-badge mono">{length}</span>}

        {/* The label is the whole point of a cut — "the chase", "the reveal" —
            so it sits on the still rather than under it. Often absent. */}
        {clip.label && (
          <span className="teaser-label">
            <span>{clip.label}</span>
          </span>
        )}
      </div>

      <div className="tile-label">
        <span className="tile-title">{title}</span>
        <span className="mono tile-meta">{length ? `CLIP · ${length}` : 'CLIP'}</span>
      </div>
    </Link>
  )
}
