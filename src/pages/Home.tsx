import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../session/SessionContext'
import { AdSlot } from '../components/AdSlot'
import { PosterCard, TileSkeleton, runtimeLabel, shapeOf } from '../components/PosterCard'
import { Artwork } from '../components/Artwork'
import { TeaserCard } from '../components/TeaserCard'
import type {
  ContinueWatchingDto,
  ItemSummaryDto,
  RecommendationDto,
  TeaserClipDto,
} from '../api/types'

interface Shelf {
  key: string
  title: string
  items: ItemSummaryDto[]
  reasons?: (string | null | undefined)[]
  wide?: boolean
}

interface HomeData {
  spotlight: ItemSummaryDto | null
  resume: ContinueWatchingDto | null
  teasers: TeaserClipDto[]
  shelves: Shelf[]
}

const EMPTY: HomeData = { spotlight: null, resume: null, teasers: [], shelves: [] }

/**
 * "Morning", "Afternoon", "Evening" — the app's wording, which is the part of
 * the day and nothing else. Not "Good evening"; it does not wish you well.
 */
function partOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
}

const settled = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
  result.status === 'fulfilled' ? result.value : fallback

export function Home() {
  const { signedIn } = useSession()
  const [data, setData] = useState<HomeData>(EMPTY)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')

    const load = signedIn ? loadForProfile : loadForVisitor
    load().then(
      (next) => {
        if (cancelled) return
        setData(next)
        setState(next.shelves.length || next.resume ? 'ready' : 'error')
      },
      () => {
        if (!cancelled) setState('error')
      },
    )

    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (state === 'loading') return <HomeSkeleton />

  if (state === 'error') {
    return (
      <div className="view">
        <div className="notice card">
          <span className="mono">Tower · Not answering</span>
          <p>
            The server is not answering right now. It may be asleep, or the
            tunnel may be down — Tower will pick the address up again on its own
            once it is back.
          </p>
          <Link className="btn btn-outline" to="/connect">
            Use a different address
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="view view--home">
      {/* The app's header: the part of the day in large sans, the server's
          state under it in mono with a live dot. Nothing else. */}
      <header className="greet">
        <div>
          <h1>{signedIn ? `${partOfDay()}, you` : partOfDay()}</h1>
          <span className="mono greet-state">
            <i className="dot dot--sm" aria-hidden="true" /> Tower · Online
          </span>
        </div>
        {signedIn && <span className="avatar" aria-hidden="true">T</span>}
      </header>

      {data.resume ? (
        <Resume entry={data.resume} />
      ) : (
        data.spotlight && <Spotlight item={data.spotlight} />
      )}

      {/* Straight after the spotlight: a clip is the cheapest way into the
          library, and burying it under four poster rails defeats the point. */}
      <TeaserRail clips={data.teasers} />

      {data.shelves.map((shelf, index) => (
        <Fragment key={shelf.key}>
          <Rail
            title={shelf.title}
            items={shelf.items}
            reasons={shelf.reasons}
            wide={shelf.wide}
            personal={signedIn}
          />
          {/* After the first rail, not before it: the shelf comes first. */}
          {index === 0 && <AdSlot placement="home" />}
        </Fragment>
      ))}
    </div>
  )
}

/**
 * Teasers — the Shorts feed, as a rail.
 *
 * Signed-in only, and not because of a decision made here: the server 403s the
 * teaser route without a token and publishes no public equivalent. A visitor
 * without an account simply does not see this rail.
 */
function TeaserRail({ clips }: { clips: TeaserClipDto[] }) {
  const strip = useRef<HTMLDivElement>(null)
  if (clips.length === 0) return null

  const nudge = (direction: 1 | -1) => {
    const el = strip.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section className="rail-block">
      <div className="rail-head">
        <h2 className="rail-title">Teasers</h2>
        <div className="rail-nav">
          <button type="button" onClick={() => nudge(-1)} aria-label="Scroll teasers left">
            ‹
          </button>
          <button type="button" onClick={() => nudge(1)} aria-label="Scroll teasers right">
            ›
          </button>
        </div>
      </div>
      <div className="rail" ref={strip}>
        {clips.map((clip) => (
          <div key={clip.id} className="rail-cell rail-cell--teaser">
            <TeaserCard clip={clip} />
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Loading ─────────────────────────────────────────────────────────── */

function HomeSkeleton() {
  return (
    <div className="view view--home" aria-busy="true">
      <div className="spotlight spotlight--skeleton shimmer" />
      {[0, 1].map((row) => (
        <section className="rail-block" key={row}>
          <div className="rail-head">
            <span className="skeleton-line skeleton-line--head" />
          </div>
          <div className="rail">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="rail-cell" key={i}>
                <TileSkeleton />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/* ── Spotlight ───────────────────────────────────────────────────────── */

/**
 * One title, large, at the top.
 *
 * Restrained on purpose. The brief for this product is "a shelf, not a feed" —
 * so this is the newest thing on the disk given room, not an algorithmic
 * centrepiece demanding attention. It is also what stops the page opening on a
 * single thin strip of posters above a screen of nothing, which is what it
 * did before.
 */
function Spotlight({ item }: { item: ItemSummaryDto }) {
  return (
    <section className="spotlight">
      <Artwork
        className="spotlight-art"
        id={item.id}
        title={item.title}
        type={item.type}
        kind={item.hasBackdrop ? 'backdrop' : 'poster'}
        present={item.hasBackdrop || item.hasPoster}
      />
      <div className="spotlight-body">
        <span className="mono">Newest on the disk</span>
        <h1>{item.title}</h1>
        <div className="mono spotlight-meta">
          {[item.year, runtimeLabel(item.runtimeMinutes), item.quality]
            .filter(Boolean)
            .join(' · ')}
          {item.rating ? ` · ★ ${item.rating.toFixed(1)}` : ''}
        </div>
        <div className="spotlight-actions">
          <Link className="btn btn-primary" to={`/watch/${encodeURIComponent(item.id)}`}>
            <svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true">
              <path d="M0 0l10 6-10 6z" fill="currentColor" />
            </svg>
            Play
          </Link>
          <Link className="btn btn-outline" to={`/title/${encodeURIComponent(item.id)}`}>
            Details
          </Link>
        </div>
      </div>
    </section>
  )
}

function Resume({ entry }: { entry: ContinueWatchingDto }) {
  const total = entry.durationSeconds ?? 0
  const left = Math.max(0, total - entry.positionSeconds)

  return (
    <section className="spotlight">
      <Artwork
        className="spotlight-art"
        id={entry.item.id}
        title={entry.item.title}
        type={entry.item.type}
        kind="backdrop"
        present={entry.item.hasBackdrop}
      />
      <div className="spotlight-body">
        <span className="mono">Continue watching</span>
        <h1>{entry.item.title}</h1>
        <div className="mono spotlight-meta">
          {total ? `${Math.round(left / 60)} MIN LEFT` : 'IN PROGRESS'}
        </div>
        <div className="spotlight-actions">
          <Link
            className="btn btn-primary"
            to={`/watch/${encodeURIComponent(entry.item.id)}`}
          >
            <svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true">
              <path d="M0 0l10 6-10 6z" fill="currentColor" />
            </svg>
            Resume
          </Link>
          <Link
            className="btn btn-outline"
            to={`/title/${encodeURIComponent(entry.item.id)}`}
          >
            Details
          </Link>
        </div>
      </div>
      <div className="spotlight-bar" aria-hidden="true">
        <i style={{ width: `${entry.percentComplete ?? 0}%` }} />
      </div>
    </section>
  )
}

/* ── Rails ───────────────────────────────────────────────────────────── */

function Rail({
  title,
  items,
  wide,
  reasons,
  personal,
}: {
  title: string
  items: ItemSummaryDto[]
  wide?: boolean
  reasons?: (string | null | undefined)[]
  personal?: boolean
}) {
  const strip = useRef<HTMLDivElement>(null)

  // Nothing at all rather than a heading over an empty strip. An empty rail
  // advertises that something failed; a missing one simply is not there.
  if (items.length === 0) return null

  const nudge = (direction: 1 | -1) => {
    const el = strip.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section className="rail-block">
      <div className="rail-head">
        <h2 className="rail-title">{title}</h2>
        {/* Desktop only: a trackpad can swipe a rail, a mouse cannot. */}
        <div className="rail-nav">
          <button type="button" onClick={() => nudge(-1)} aria-label={`Scroll ${title} left`}>
            ‹
          </button>
          <button type="button" onClick={() => nudge(1)} aria-label={`Scroll ${title} right`}>
            ›
          </button>
        </div>
      </div>
      <div className="rail" ref={strip}>
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`rail-cell rail-cell--${wide ? 'wide' : shapeOf(item.type)}`}
          >
            <PosterCard item={item} wide={wide} personal={personal} queue={items} />
            {reasons?.[index] && <span className="rail-reason">{reasons[index]}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Loading strategies ──────────────────────────────────────────────── */

/**
 * The shelf for somebody with no account.
 *
 * Only the public catalogue is available, so the page is built from category
 * slices of it rather than from anything personal. Four requests in parallel,
 * each independently allowed to fail: a library with no anime should be a
 * missing rail, not an error page.
 */
async function loadForVisitor(): Promise<HomeData> {
  const [recent, films, anime, music] = await Promise.allSettled([
    api.browse({ sort: 'added', size: 20 }),
    api.browse({ category: 'FILM', sort: 'rating', size: 20 }),
    api.browse({ category: 'ANIME', sort: 'added', size: 20 }),
    api.browse({ category: 'MUSIC', sort: 'added', size: 20 }),
  ])

  const newest = settled(recent, { items: [] } as never).items ?? []

  return {
    // Prefer something with a backdrop to fill the width; fall back to the
    // newest thing regardless rather than showing no spotlight at all.
    // Nothing in this library has a backdrop, so without the second step the
    // spotlight was simply the last file to land on the disk, whatever it was.
    spotlight:
      newest.find((item) => item.hasBackdrop) ??
      newest.find((item) => item.hasPoster) ??
      newest[0] ??
      null,
    resume: null,
    // The teaser route needs a token; there is no public one to ask.
    teasers: [],
    shelves: [
      { key: 'recent', title: 'Recently added', items: newest },
      { key: 'films', title: 'Top rated films', items: settled(films, { items: [] } as never).items ?? [] },
      { key: 'anime', title: 'Anime', items: settled(anime, { items: [] } as never).items ?? [] },
      { key: 'music', title: 'Music', items: settled(music, { items: [] } as never).items ?? [] },
    ].filter((shelf) => shelf.items.length > 0),
  }
}

/** The shelf for a signed-in profile, which can be asked personal questions. */
async function loadForProfile(): Promise<HomeData> {
  const [cw, rec, recent, home, music, teasers] = await Promise.allSettled([
    api.continueWatching(20),
    api.recommendations(20),
    api.recentlyAdded(undefined, 20),
    api.recentlyAdded('HOME_VIDEO', 12),
    api.browse({ category: 'MUSIC', sort: 'added', size: 20 }),
    api.teaserFeed(12),
  ])

  const resume = settled(cw, [] as ContinueWatchingDto[])
  const forYou = settled(rec, { items: [] as RecommendationDto[] }).items ?? []
  const newest = settled(recent, [] as ItemSummaryDto[])

  return {
    spotlight: newest.find((item) => item.hasBackdrop) ?? newest[0] ?? null,
    resume: resume[0] ?? null,
    // Only clips with a file. A queued or failed one has nothing behind it,
    // and a card that opens onto nothing is worse than a shorter rail.
    teasers: (settled(teasers, { items: [] as TeaserClipDto[] }).items ?? []).filter(
      (clip) => clip.published !== false && clip.state !== 'FAILED',
    ),
    shelves: [
      {
        key: 'forYou',
        title: 'For you',
        items: forYou.map((entry) => entry.item),
        reasons: forYou.map((entry) => entry.reason),
      },
      { key: 'recent', title: 'Recently added', items: newest },
      {
        key: 'home',
        title: 'From your camera roll',
        items: settled(home, [] as ItemSummaryDto[]),
        wide: true,
      },
      { key: 'music', title: 'Music', items: settled(music, { items: [] } as never).items ?? [] },
    ].filter((shelf) => shelf.items.length > 0),
  }
}
