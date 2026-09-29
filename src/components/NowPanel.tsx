import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Artwork } from './Artwork'
import { creditLine } from './PosterCard'
import { QueueList } from './PlayerBar'
import { usePlayer } from '../playback/PlayerContext'
import type { ItemDetailDto, ItemSummaryDto } from '../api/types'

/*
 * The "now playing" column on the right of a wide screen.
 *
 * What every desktop music service puts there, because it is what a listener
 * glances at: the sleeve at a size worth looking at, the title and who made
 * it, the credits the server knows, and what comes next. It is the same
 * player state the bar shows, seen from closer up — nothing here plays
 * anything; it only looks.
 *
 * On a narrow screen there is no room for a third column, and the queue is a
 * sheet over the bar instead. `useWide` is how the two decide who draws.
 */

const WIDE = '(min-width: 1200px)'

export function useWide(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE).matches,
  )
  useEffect(() => {
    const query = window.matchMedia(WIDE)
    const onChange = () => setWide(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

/** The people and names the server knows for a track, as label and value. */
function creditsOf(detail: (ItemSummaryDto & Partial<ItemDetailDto>) | null): { name: string; role: string }[] {
  if (!detail) return []
  const rows: { name: string; role: string }[] = []
  const seen = new Set<string>()
  const add = (name: string | null | undefined, role: string) => {
    const clean = name?.trim()
    if (!clean || seen.has(clean.toLowerCase())) return
    seen.add(clean.toLowerCase())
    rows.push({ name: clean, role })
  }
  // The scanner writes the artist from the folder or filename, so it is often
  // the title over again, which is not a credit.
  const artist = creditLine(detail)
  if (artist) {
    for (const name of artist.split(/,|&|\bfeat\.?\b/i)) add(name, 'Artist')
  }
  add(detail.directors, 'Music director')
  if (detail.castMembers) {
    for (const name of detail.castMembers.split(',').slice(0, 4)) add(name, 'Singer')
  }
  add(detail.album, 'Album')
  add(detail.studio, 'Label')
  if (detail.year) add(String(detail.year), 'Year')
  if (detail.language) add(detail.language, 'Language')
  return rows
}

export function NowPanel() {
  const player = usePlayer()
  const wide = useWide()
  const item = player.current

  const [detail, setDetail] = useState<ItemDetailDto | null>(null)
  useEffect(() => {
    setDetail(null)
    if (!item) return
    let cancelled = false
    api
      .detail(item.id)
      .then((result) => {
        if (!cancelled) setDetail(result)
      })
      .catch(() => {
        /* Then the card shows what the summary already had. */
      })
    return () => {
      cancelled = true
    }
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!wide || !item) return null

  if (player.open) {
    return (
      <aside className="now" aria-label="Queue">
        <header className="now-head">
          <b>Queue</b>
          <button type="button" className="as-link mono" onClick={() => player.setOpen(false)}>
            Now playing
          </button>
        </header>
        <QueueList />
      </aside>
    )
  }

  const href = `/title/${encodeURIComponent(item.id)}`
  const artist = creditLine(item) ?? item.artist ?? item.album ?? ''
  // The summary already names the artist and album; the detail adds the rest
  // when it arrives, and the card never waits on it.
  const credits = creditsOf(detail ?? item)
  const nextPos = player.pos + 1
  const next = player.queue[player.order[nextPos]] ?? null
  const nextArtist = next ? creditLine(next) ?? next.artist ?? '' : ''

  return (
    <aside className="now" aria-label="Now playing">
      <header className="now-head">
        <div className="now-from">
          <span className="mono">Playing from</span>
          <b>{player.source ?? 'Library'}</b>
        </div>
        <button type="button" className="now-hide" onClick={player.close} aria-label="Close player" title="Close">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </header>

      <Link to={href} className="now-art" aria-label={`Open ${item.title}`}>
        <span className="now-initial" aria-hidden="true">
          {item.title.trim().charAt(0).toUpperCase()}
        </span>
        <Artwork
          className="now-art-frame"
          id={item.id}
          title={item.title}
          type={item.type}
          kind="poster"
          present={item.hasPoster}
        />
      </Link>

      <div className="now-title">
        <Link to={href}>
          <h2>{item.title}</h2>
        </Link>
        {artist && <span>{artist}</span>}
      </div>

      {credits.length > 0 && (
        <section className="now-card">
          <div className="now-card-head">
            <b>Credits</b>
            <Link to={href} className="mono">
              Show all
            </Link>
          </div>
          <ul className="now-credits">
            {credits.slice(0, 5).map((row) => (
              <li key={`${row.role}-${row.name}`}>
                <b>{row.name}</b>
                <span className="mono">{row.role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <section className="now-card">
          <div className="now-card-head">
            <b>Next in queue</b>
            <button type="button" className="as-link mono" onClick={() => player.setOpen(true)}>
              Open queue
            </button>
          </div>
          <button
            type="button"
            className="now-next"
            onClick={() => player.jumpTo(nextPos)}
            aria-label={`Play ${next.title} now`}
          >
            <Artwork
              className="now-next-art"
              id={next.id}
              title={next.title}
              type={next.type}
              kind="poster"
              present={next.hasPoster}
            />
            <span className="now-next-text">
              <b>{next.title}</b>
              {nextArtist && <em>{nextArtist}</em>}
            </span>
          </button>
        </section>
      )}
    </aside>
  )
}
