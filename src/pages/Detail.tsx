import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../session/SessionContext'
import { usePlayer } from '../playback/PlayerContext'
import { AdSlot } from '../components/AdSlot'
import { Artwork } from '../components/Artwork'
import { PosterCard, runtimeLabel } from '../components/PosterCard'
import { browserCapabilities } from '../playback/capabilities'
import type {
  ItemDetailDto,
  ItemSummaryDto,
  MediaInfoDto,
  PlaybackDecisionDto,
} from '../api/types'

/**
 * Roughly how big the file is, worked out rather than reported.
 *
 * The detail response carries no size — only a bitrate and a duration — so
 * this multiplies them. The app prints a flat "1 GB" here; this keeps a
 * decimal and no tilde, matching the spec strip's terse register.
 */
function sizeLabel(info?: MediaInfoDto | null): string | null {
  if (!info?.bitrate || !info.durationSeconds) return null
  const bytes = (info.bitrate / 8) * info.durationSeconds
  const gb = bytes / 1_000_000_000
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`
}

/** `eng` → `ENG`, three letters, as the app's spec strip writes them. */
function langTag(tag?: string | null): string | null {
  return tag ? tag.slice(0, 3).toUpperCase() : null
}

/** "Saanve Megghana" → "SM". At most two letters, as the app draws them. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function Detail() {
  const { id = '' } = useParams()
  const { signedIn } = useSession()
  const player = usePlayer()

  const [item, setItem] = useState<ItemDetailDto | null>(null)
  const [plan, setPlan] = useState<PlaybackDecisionDto | null>(null)
  const [alsoOnDisk, setAlsoOnDisk] = useState<ItemSummaryDto[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setItem(null)
    setPlan(null)
    setAlsoOnDisk([])
    setFailed(false)
    window.scrollTo(0, 0)

    api.detail(id).then(
      (detail) => {
        if (cancelled) return
        setItem(detail)
        api
          .browse({ category: detail.type, sort: 'title', size: 21 })
          .then((page) => {
            if (!cancelled) {
              setAlsoOnDisk(page.items.filter((o) => o.id !== detail.id).slice(0, 20))
            }
          })
          .catch(() => {})
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )

    // Known *before* you press play — that is the whole point of the card.
    // Not asked without an account: the server refuses the route to a guest.
    if (signedIn) {
      api
        .playbackDecision(id, browserCapabilities())
        .then((decision) => {
          if (!cancelled) setPlan(decision)
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [id, signedIn])

  if (failed) {
    return (
      <div className="view">
        <div className="notice card">
          <span className="mono">Not found</span>
          <p>That title could not be loaded. It may have been removed from the disk.</p>
          <Link className="btn btn-outline" to="/library">
            Back to the library
          </Link>
        </div>
      </div>
    )
  }

  if (!item) return <DetailSkeleton />

  const info = item.mediaInfo ?? plan?.mediaInfo
  const direct = plan?.mode === 'DIRECT'

  // The spec strip: four cells, each a different measured fact, spread across
  // the inset. Exactly the shape the app draws under the plan sentence.
  const specs = [
    [info?.container?.split(',')[0]?.toUpperCase(), info?.videoCodec?.toUpperCase()]
      .filter(Boolean)
      .join(' · '),
    info?.height ? `${info.height}p` : item.quality,
    sizeLabel(info),
    (item.audioTracks ?? [])
      .map((track) => langTag(track.language))
      .filter((tag, index, all) => tag && all.indexOf(tag) === index)
      .join(' + '),
  ].filter(Boolean) as string[]

  // "In this file": every embedded track, audio and subtitle alike, as one run
  // of pills. The app makes no visual distinction between the two here.
  const inThisFile = [
    ...(item.audioTracks ?? []).map(
      (track) => track.title?.trim() || `${langTag(track.language) ?? 'Audio'} (${track.codec})`,
    ),
    ...(item.subtitles ?? []).map(
      (track) =>
        `${track.language ?? 'sub'} (${track.format}${track.forced ? ', forced' : ''}${
          track.hearingImpaired ? ', SDH' : ''
        })`,
    ),
  ]

  const cast = (item.castMembers ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  return (
    <article className="detail" data-mode={item.type === 'MUSIC' ? 'music' : undefined}>
      <div className="detail-hero">
        <Artwork
          className={`detail-hero-art${item.hasBackdrop ? '' : ' detail-hero-art--stretched'}`}
          id={item.id}
          title={item.title}
          type={item.type}
          kind={item.hasBackdrop ? 'backdrop' : 'poster'}
          present={item.hasBackdrop || item.hasPoster}
        />
        <div className="detail-hero-text">
          <h1>{item.title}</h1>
          <div className="detail-sub">
            {/* The rating is a filled amber pill, set apart from the plain
                facts beside it — the app gives it that weight because it is
                the one number anyone scans for. */}
            {item.rating ? (
              <span className="rating-pill">★ {item.rating.toFixed(1)}</span>
            ) : null}
            <span>
              {[item.year, runtimeLabel(item.runtimeMinutes), item.certification]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </div>
      </div>

      <div className="detail-body">
        {/* One wide primary, then square secondaries — the app's action row. */}
        <div className="detail-actions">
          {item.type === 'MUSIC' ? (
            // A song does not need the whole screen. It plays in the bar,
            // with the rest of the shelf queued behind it, and the page stays
            // where it is.
            <button
              type="button"
              className="btn btn-primary btn-play"
              onClick={() =>
                player.current?.id === item.id
                  ? player.toggle()
                  : player.play([summaryOf(item), ...alsoOnDisk], 0, 'Also on the disk')
              }
            >
              {player.current?.id === item.id && player.playing ? 'Pause' : 'Play'}
            </button>
          ) : (
            <Link className="btn btn-primary btn-play" to={`/watch/${encodeURIComponent(item.id)}`}>
              {item.resumePositionSeconds ? 'Resume' : 'Play'}
            </Link>
          )}
          <Link
            className="btn btn-outline btn-square"
            to="/library"
            aria-label="Back to library"
            title="Back to library"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="3" y="3" width="5" height="14" rx="1" />
              <rect x="10" y="3" width="4" height="14" rx="1" />
              <path d="M16 4.5 18 17" />
            </svg>
          </Link>
        </div>

        {plan && (
          <div className={`plan${direct ? '' : ' plan--transcode'}`}>
            <div className="plan-top">
              <i className={`dot${direct ? '' : ' dot--warn'}`} aria-hidden="true" />
              <span className="plan-state">
                {direct ? 'Direct play to this browser' : 'The server will convert this'}
              </span>
            </div>
            <p className="plan-say">
              {direct
                ? 'This browser can read the file exactly as it sits on the disk.'
                : (plan.reasons?.[0] ??
                  `Container ${info?.container ?? 'this'} is not directly playable`)}
            </p>
            {specs.length > 0 && (
              <div className="spec">
                {specs.map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {!signedIn && (
          <p className="footnote detail-gate">Playing needs an account. Looking does not.</p>
        )}

        {item.plot && (
          <section className="detail-block">
            <span className="mono">The story</span>
            <p className="detail-overview">{item.plot}</p>
          </section>
        )}

        {inThisFile.length > 0 && (
          <section className="detail-block">
            <span className="mono">In this file</span>
            <div className="pills">
              {inThisFile.map((label) => (
                <span className="pill" key={label} title={label}>
                  {label}
                </span>
              ))}
            </div>
          </section>
        )}

        {cast.length > 0 && (
          <section className="detail-block">
            <span className="mono">Cast &amp; crew</span>
            {/* Circular initials, not pills. There are no headshots to show —
                the server stores names only — and a ring of initials reads as
                a person where a pill reads as a tag. */}
            <div className="cast">
              {cast.map((name) => (
                <span className="cast-member" key={name}>
                  <span className="cast-avatar" aria-hidden="true">
                    {initialsOf(name)}
                  </span>
                  <span className="cast-name">{name}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <AdSlot placement="detail" />

        {alsoOnDisk.length > 0 && (
          <section className="rail-block detail-similar">
            <div className="rail-head">
              <h2 className="rail-title">Also on the disk</h2>
            </div>
            <div className="rail">
              {alsoOnDisk.map((other) => (
                <div key={other.id} className="rail-cell">
                  <PosterCard item={other} personal={signedIn} queue={alsoOnDisk} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  )
}

function DetailSkeleton() {
  return (
    <article className="detail" aria-busy="true">
      <div className="detail-hero shimmer" />
      <div className="detail-body">
        <span className="skeleton-line" style={{ height: 48, borderRadius: 10 }} />
        <span className="skeleton-line" style={{ height: 96, marginTop: 16, borderRadius: 10 }} />
        <span className="skeleton-line" style={{ width: '90%', marginTop: 22 }} />
        <span className="skeleton-line" style={{ width: '76%', marginTop: 8 }} />
      </div>
    </article>
  )
}

/** The fields of a detail that a queue entry needs — a summary, cut from it. */
function summaryOf(item: ItemDetailDto): ItemSummaryDto {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    year: item.year,
    runtimeMinutes: item.runtimeMinutes,
    rating: item.rating,
    quality: item.quality,
    genres: item.genres,
    hasPoster: item.hasPoster,
    hasBackdrop: item.hasBackdrop,
    artist: item.artist,
    album: item.album,
  }
}
