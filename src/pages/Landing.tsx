import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TOWER } from '../config'
import { api } from '../api/client'
import { Artwork } from '../components/Artwork'
import { useSession } from '../session/SessionContext'
import type { ItemSummaryDto } from '../api/types'

/**
 * The download page, ported from the original static index.html.
 *
 * The markup and class names are the ones that page already used — it was a
 * finished, verified thing and its stylesheet still drives it. What changed is
 * that the three runtime behaviours which used to live in js/app.js (config
 * wiring, the playback-plan demo, scroll reveal) are now state and effects.
 *
 * One consequence of moving the site to React is worth stating: this page used
 * to render with JavaScript off. It no longer does.
 */
export function Landing() {
  useScrollReveal()

  return (
    <>
      <SiteNav />
      <main id="top">
        <Hero />
        <Idea />
        <Features />
        <Download />
        <Community />
      </main>
      <SiteFooter />
    </>
  )
}

/* ── Scroll reveal ───────────────────────────────────────────────────── */

function useScrollReveal() {
  useEffect(() => {
    // `shown` is the class landing.css actually keys on — `.reveal` starts at
    // opacity 0 and only `.reveal.shown` brings it back. Getting this name
    // wrong does not fail loudly; it just leaves the hero's phone mockup and
    // every feature card permanently invisible.
    const show = (el: Element) => el.classList.add('shown')

    // prefers-reduced-motion is already handled in the stylesheet, which resets
    // .reveal to full opacity. Marking them anyway keeps the DOM in one state
    // rather than two that happen to look the same.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal').forEach(show)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show(entry.target)
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

/* ── Nav ─────────────────────────────────────────────────────────────── */

function SiteNav() {
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <a className="wordmark" href="#top">
          {/* Three stacked bars: a tower, and the shelf the app is built around. */}
          <svg width="15" height="18" viewBox="0 0 15 18" aria-hidden="true">
            <rect x="0" y="0" width="15" height="4" rx="1" fill="#E8B34A" />
            <rect x="0" y="7" width="15" height="4" rx="1" fill="rgba(246,243,236,.55)" />
            <rect x="0" y="14" width="15" height="4" rx="1" fill="rgba(246,243,236,.25)" />
          </svg>
          Tower
        </a>
        <div className="nav-status">
          <i className="dot" aria-hidden="true" />
          <span className="mono">Android · v{TOWER.version}</span>
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#download">Download</a>
          <a href="#community">Community</a>
          <Link className="btn btn-outline" to="/browse">
            Open in browser
          </Link>
          <a className="btn btn-primary" href="#download">
            Get the APK
          </a>
        </div>
      </div>
    </header>
  )
}

/* ── Hero ────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div>
          <div className="eyebrow">
            <i className="dot" aria-hidden="true" />
            <span className="mono">Tower · Online</span>
          </div>

          <h1>
            Your files.
            <br />
            Your machine.
            <br />
            <span className="soft">Your shelf.</span>
          </h1>

          <p className="lede">
            Tower plays the films, anime, home videos and music sitting on a server
            you already own. It tells you before you press play whether the file
            runs as it is or has to be converted first — and nothing about what you
            watch leaves the house.
          </p>

          <div className="hero-cta">
            <a className="btn btn-primary" href="#download">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 1v9M4.5 6.5 8 10l3.5-3.5M2 13.5h12" />
              </svg>
              Download for Android
            </a>
            <Link className="btn btn-outline" to="/browse">
              Open it in this browser
            </Link>
          </div>

          <div className="hero-meta">
            <span className="mono">APK · {TOWER.apkSize}</span>
            <span className="mono">{TOWER.minAndroid} and up</span>
            <span className="mono">No account needed to look around</span>
          </div>
        </div>

        <PhoneMockup />
      </div>

      {/* Facts, in mono, because every one of them is measured. */}
      <div className="facts">
        <div className="wrap facts-in">
          <div className="fact">
            <b>Direct play</b>
            <span className="mono">No needless converting</span>
          </div>
          <div className="fact">
            <b>On your LAN</b>
            <span className="mono">Seeking is instant</span>
          </div>
          <div className="fact">
            <b>Offline</b>
            <span className="mono">Saved copies play anywhere</span>
          </div>
          <div className="fact">
            <b>Private</b>
            <span className="mono">Nothing leaves the house</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * What the phone in the hero shows: this household's actual shelf.
 *
 * Once the directory has said where the server is, the mockup asks the public
 * catalogue for the newest films and home videos and draws those, posters and
 * all, instead of the four invented titles. Titles that have artwork are put
 * first: a real poster is the point of the exercise, and a gradient with a
 * real name on it is only a little better than the drawn one.
 *
 * Until the answer arrives — or if it never does, because the lookup is off
 * or the server is asleep — the drawn shelf stands. A hero that flashes an
 * empty phone while a request is in flight would be worse than one that never
 * changes.
 */
interface ShelfPreview {
  films: ItemSummaryDto[]
  filmCount: number
  ours: ItemSummaryDto[]
  /** The film behind the "continue watching" card: one with a backdrop if any. */
  spotlight: ItemSummaryDto | null
}

/**
 * "1:16 left" for the card's fake resume point. The bar is drawn at 34%, so
 * the number agrees with it rather than being pulled out of the air twice.
 */
function timeLeft(runtimeMinutes?: number | null): string | null {
  if (!runtimeMinutes || runtimeMinutes <= 0) return null
  const left = Math.round(runtimeMinutes * 0.66)
  const h = Math.floor(left / 60)
  const m = left % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} left` : `${m}m left`
}

function withArtworkFirst(items: ItemSummaryDto[], art: 'hasPoster' | 'hasBackdrop', count: number) {
  return [...items.filter((i) => i[art]), ...items.filter((i) => !i[art])].slice(0, count)
}

function useShelfPreview(): ShelfPreview | null {
  const { paired } = useSession()
  const [preview, setPreview] = useState<ShelfPreview | null>(null)

  useEffect(() => {
    if (!paired) return
    let cancelled = false

    Promise.allSettled([
      api.browse({ category: 'FILM', sort: 'added', size: 12 }),
      api.browse({ category: 'HOME_VIDEO', sort: 'added', size: 8 }),
    ]).then(([films, ours]) => {
      if (cancelled) return
      const filmPage = films.status === 'fulfilled' ? films.value : null
      const oursPage = ours.status === 'fulfilled' ? ours.value : null
      if (!filmPage?.items?.length) return
      const picked = withArtworkFirst(filmPage.items, 'hasPoster', 5)
      setPreview({
        films: picked,
        filmCount: filmPage.totalItems,
        ours: withArtworkFirst(oursPage?.items ?? [], 'hasBackdrop', 3),
        spotlight:
          filmPage.items.find((i) => i.hasBackdrop) ??
          filmPage.items.find((i) => i.hasPoster) ??
          null,
      })
    })

    return () => {
      cancelled = true
    }
  }, [paired])

  return preview
}

/** Home, rebuilt in CSS. See the note in styles/landing.css. */
function PhoneMockup() {
  const preview = useShelfPreview()

  return (
    <div className="phone reveal" aria-hidden="true">
      {/* `.screen` here is landing.css's phone frame, not a client page. The
          client's own pages are `.view` for exactly this reason. */}
      <div className="screen">
        <div className="screen-body">
          <div className="greet">
            <div>
              <h3>Good evening</h3>
              <div className="mono">
                <i className="dot dot--sm" /> Tower · Online
              </div>
            </div>
            <div className="avatar">A</div>
          </div>

          <div className="cw">
            {preview?.spotlight && (
              <Artwork
                className="cw-art"
                id={preview.spotlight.id}
                title={preview.spotlight.title}
                type={preview.spotlight.type}
                kind={preview.spotlight.hasBackdrop ? 'backdrop' : 'poster'}
                present={preview.spotlight.hasBackdrop || preview.spotlight.hasPoster}
              />
            )}
            <div className="pill-dp">Direct play</div>
            <div className="cw-inner">
              <div className="play-fab">
                <svg viewBox="0 0 10 12">
                  <path d="M0 0l10 6-10 6z" />
                </svg>
              </div>
              <div>
                <h4>{preview?.spotlight?.title ?? 'Nightfall Drive'}</h4>
                <div className="mono">
                  {timeLeft(preview?.spotlight?.runtimeMinutes) ?? '1:16 left'}
                </div>
              </div>
            </div>
            <div className="cw-bar">
              <i />
            </div>
          </div>

          <div className="rail-head">
            <span className="mono">Recently added</span>
            <span className="all">All {preview ? preview.filmCount : 20}</span>
          </div>
          <div className="rail">
            {preview ? (
              preview.films.map((item) => (
                <div className="poster" key={item.id}>
                  <Artwork
                    className="poster-art"
                    id={item.id}
                    title={item.title}
                    type={item.type}
                    kind="poster"
                    present={item.hasPoster}
                  />
                  <span>{item.title}</span>
                </div>
              ))
            ) : (
              <>
                <div className="poster p1">
                  <span>Anbe Diana</span>
                </div>
                <div className="poster p2">
                  <i />
                  <span>Trip</span>
                </div>
                <div className="poster p3">
                  <span>Gulu Gulu</span>
                </div>
                <div className="poster p4">
                  <span>Amaran</span>
                </div>
              </>
            )}
          </div>

          <div className="rail-head">
            <span className="mono">From your camera roll</span>
          </div>
          <div className="rail">
            {preview && preview.ours.length > 0 ? (
              preview.ours.map((item) => (
                <div className="poster poster--wide" key={item.id}>
                  <Artwork
                    className="poster-art"
                    id={item.id}
                    title={item.title}
                    type={item.type}
                    kind="backdrop"
                    present={item.hasBackdrop}
                  />
                  <span>{item.title}</span>
                </div>
              ))
            ) : (
              <>
                <div className="poster poster--wide p5">
                  <span>Ooty, Dec 2024</span>
                </div>
                <div className="poster poster--wide p3">
                  <span>Diwali at home</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="tabbar">
          <div className="on">
            <svg viewBox="0 0 20 20">
              <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            </svg>
            Home
          </div>
          <div>
            <svg viewBox="0 0 20 20">
              <rect x="3" y="3" width="5" height="14" rx="1" />
              <rect x="10" y="3" width="4" height="14" rx="1" />
              <path d="M16 4.5 18 17" />
            </svg>
            Library
          </div>
          <div>
            <svg viewBox="0 0 20 20">
              <rect x="4" y="3" width="12" height="14" rx="2" />
              <path d="M9 8l4 2-4 2z" fill="currentColor" stroke="none" />
            </svg>
            Shorts
          </div>
          <div>
            <svg viewBox="0 0 20 20">
              <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 16h12" />
            </svg>
            Saved
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── The idea, with the plan demo ────────────────────────────────────── */

const PLANS = {
  direct: {
    state: 'Direct play to this phone',
    say: 'Your phone can read this file exactly as it sits on the disk.',
    spec: ['MKV · H.264', '1080p', '4.2 GB', 'EN + HI'],
  },
  transcode: {
    state: 'Will transcode',
    say: 'Your phone cannot read this video codec, so the server converts it as it sends.',
    spec: ['MKV · HEVC 10-bit', '2160p', '18.4 GB', 'EN + TA'],
  },
} as const

function Idea() {
  const [plan, setPlan] = useState<keyof typeof PLANS>('direct')
  const current = PLANS[plan]

  return (
    <section id="idea">
      <div className="wrap">
        <div className="plan-grid">
          <div>
            <div className="sec-head sec-head--tight">
              <span className="mono">Honest about files</span>
              <h2>It says what will happen before you press play.</h2>
              <p>
                Most players find out mid-stream. Tower works out from your phone's
                real codec support whether the file plays as it is or the server has
                to convert it, and shows you which — with the container, resolution,
                size and audio tracks written out underneath. Same check before you
                cast, so you know what a TV will do with it too.
              </p>
            </div>

            <p className="plan-note">
              Prefer not to see any of it? A single <b>Show technical badges</b>{' '}
              switch hides every spec, path, bitrate and codec string across the whole
              app, leaving the plain sentences intact.
            </p>
          </div>

          <div>
            <div className={`plan${plan === 'transcode' ? ' plan--transcode' : ''}`} id="plan">
              <div className="plan-top">
                <i className={`dot${plan === 'transcode' ? ' dot--warn' : ''}`} aria-hidden="true" />
                <span className="plan-state">{current.state}</span>
              </div>
              <p className="plan-say">{current.say}</p>
              <div className="spec">
                {current.spec.map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </div>
            </div>

            <div className="plan-switch" role="group" aria-label="Playback plan example">
              <button
                type="button"
                aria-pressed={plan === 'direct'}
                onClick={() => setPlan('direct')}
              >
                Direct play
              </button>
              <button
                type="button"
                aria-pressed={plan === 'transcode'}
                onClick={() => setPlan('transcode')}
              >
                Will transcode
              </button>
            </div>
            <p className="footnote">Example only — the real card reads your device.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Features ────────────────────────────────────────────────────────── */

interface Feature {
  glyph: JSX.Element
  title: string
  body: string
  mono: string
}

const FEATURES: Feature[] = [
  {
    glyph: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
        <path d="M10 8.5l4.5 2.5-4.5 2.5z" fill="currentColor" stroke="none" />
      </>
    ),
    title: 'Everything on the disk',
    body: 'Films, anime, music, photos and the home videos nobody else files properly. Filter by unwatched or 4K only, sort, and open collections — including ones discovered from genres and people.',
    mono: 'Library · Collections · Genres',
  },
  {
    glyph: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none" />
      </>
    ),
    title: 'A player that knows it is local',
    body: 'Drag the scrubber and a frame preview follows your thumb with a filmstrip of its neighbours — no buffering, because the file is on your own network. Chapter ticks sit on the track.',
    mono: 'Seek is instant · File is local',
  },
  {
    glyph: (
      <>
        <rect x="3" y="4.5" width="18" height="15" rx="2" />
        <path d="M6.5 14.5h5M14 14.5h3.5" />
      </>
    ),
    title: 'Subtitles that line up',
    body: 'What is already embedded in the file is listed first — line counts, forced tracks and all — before anything is searched for online. Out of sync? Nudge the offset in tenths and save it for that file.',
    mono: 'Embedded · Offset · Per file',
  },
  {
    glyph: <path d="M12 3v11M8 10l4 4 4-4M4 19h16" />,
    title: 'Saved for the train',
    body: 'Downloads run in the background with a progress notification, and a converted one reports its percentage honestly. Leave home Wi-Fi and Tower can be told to play saved copies only, never your data plan.',
    mono: 'Background · Resumable · Offline',
  },
  {
    glyph: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16.5 14c2.6 0 4.5 1.7 4.5 4" />
      </>
    ),
    title: 'Watch together',
    body: 'One six-character code, one server clock. Anyone can pause for everyone, playback holds for the slowest device, and the member list says who is ready and who is buffering — in seconds, not spinners.',
    mono: 'Host · Join · Chat',
  },
  {
    glyph: (
      <>
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M10 7l4 2.5-4 2.5z" fill="currentColor" stroke="none" />
      </>
    ),
    title: 'Shorts, cut from your own films',
    body: 'A vertical feed of teasers taken from the same files the films play from. Swipe, like, comment, and tap through to the title itself rather than straight into a two-hour commitment.',
    mono: 'Swipe to keep watching',
  },
  {
    glyph: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M16 16l5 5" />
      </>
    ),
    title: 'Ask your own library',
    body: '“What can I finish tonight?” · “What have we watched more than twice?” · “Show me what nobody has seen.” It answers from your play counts and runtimes. It looks nothing up on the internet.',
    mono: 'About your own library',
  },
  {
    glyph: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M4 9h16" />
        <path d="M8 13h6" />
      </>
    ),
    title: 'Fix a wrong match',
    body: 'When the filename fooled it, Tower shows the real path, admits the guess was wrong and lets you pick the right title — or move it to home videos, or leave it unmatched. Nothing on disk is ever renamed.',
    mono: "We'll rename nothing on disk",
  },
  {
    glyph: <path d="M4 18V9M9.5 18V4M15 18v-6M20.5 18v-9" />,
    title: "An owner's panel",
    body: 'Health, people and disk. Who is streaming right now and whether their device is converting, watch hours over the last week, the biggest files with a note on each, and what is safe to clear.',
    mono: 'Owner only · Admin key',
  },
  {
    glyph: (
      <>
        <circle cx="7" cy="17" r="3" />
        <circle cx="18" cy="15" r="3" />
        <path d="M10 17V6l11-2v11" />
      </>
    ),
    title: 'Music, properly',
    body: 'Shelves by mood and by director, a queue that plays on when you leave the screen, a mini player above the tabs and a media notification that takes you back. Your MP3s are not an afterthought here.',
    mono: 'Queue · Mini player · Notification',
  },
  {
    glyph: (
      <>
        <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    title: 'Honest when it cannot help',
    body: 'Disk spun down? Grey dot, “Tower · Sleeping”, roughly eight seconds to wake, and a list of what still works meanwhile. Away from home? The real cost in gigabytes before you commit. No bare spinners.',
    mono: 'Asleep · Away · Offline',
  },
  {
    glyph: (
      <>
        <rect x="3" y="10" width="18" height="11" rx="2" />
        <path d="M7.5 10V7a4.5 4.5 0 1 1 9 0v3" />
      </>
    ),
    title: 'It only talks to your server',
    body: "Tower connects to the address you type and nothing else. Credentials are kept in the platform's encrypted store. There is no telemetry on what you watch, because there is nowhere for it to go.",
    mono: 'Nothing leaves the house',
  },
]

function Features() {
  return (
    <section id="features" className="section--ruled">
      <div className="wrap">
        <div className="sec-head">
          <span className="mono">What is in it</span>
          <h2>A shelf, not a feed.</h2>
          <p>
            Your library is finite and you own all of it, so there is no endless
            scroll, no recommendation engine and nothing to keep a streak going.
            Everything below is built to get you to a file you already have.
          </p>
        </div>

        <div className="feat">
          {FEATURES.map((feature) => (
            <div className="card reveal" key={feature.title}>
              <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
                {feature.glyph}
              </svg>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
              <span className="mono">{feature.mono}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Download ────────────────────────────────────────────────────────── */

function Download() {
  return (
    <section id="download" className="section--ruled">
      <div className="wrap">
        <div className="sec-head">
          <span className="mono">Download</span>
          <h2>Install it, then point it at your server.</h2>
          <p>
            Tower is not on Google Play. It is a sideloaded APK, which means Android
            will ask you once whether you trust this page. Everything after that is
            the app asking for one address.
          </p>
        </div>

        <div className="dl-grid">
          <div className="card dl-card reveal">
            <div className="dl-head">
              <div>
                <h3 className="dl-title">Tower for Android</h3>
                <p className="mono dl-kicker">Release build · Signed</p>
              </div>
              <i className="dot" aria-hidden="true" />
            </div>

            <div className="dl-rows">
              <div className="dl-row">
                <span>Version</span>
                <span>{TOWER.version}</span>
              </div>
              <div className="dl-row">
                <span>Download size</span>
                <span>{TOWER.apkSize}</span>
              </div>
              <div className="dl-row">
                <span>Requires</span>
                <span>{TOWER.minAndroid}</span>
              </div>
              <div className="dl-row">
                <span>Package</span>
                <span>com.bharath.dev.movbuggy</span>
              </div>
              <div className="dl-row">
                <span>Architectures</span>
                <span>Universal</span>
              </div>
            </div>

            <a className="btn btn-primary btn-block" href={TOWER.apkUrl} download>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 1v9M4.5 6.5 8 10l3.5-3.5M2 13.5h12" />
              </svg>
              Download the APK
            </a>

            <p className="footnote">
              An iOS build exists — the app is Kotlin Multiplatform — but it is not
              distributed here yet. Or{' '}
              <Link to="/browse">open Tower in this browser</Link> with no install
              at all.
            </p>
          </div>

          <div className="card dl-card reveal">
            <span className="mono">Installing</span>
            <ol className="steps">
              <li>
                Tap <b>Download the APK</b>. Chrome will warn you that this kind of
                file can harm your device — that warning appears for every APK,
                signed or not.
              </li>
              <li>
                Open it. If Android says installing from this source is blocked,
                allow it for your browser in <b>Settings → Apps → Special access</b>,
                then come back.
              </li>
              <li>
                Install, open Tower, and type your server's address —{' '}
                <b>http://192.168.1.x:8096</b> on your own Wi-Fi, or your tunnel if
                you are testing through one.
              </li>
              <li>
                No server to hand? <b>Look around with sample data</b> runs the whole
                app on a fake library so you can see it first.
              </li>
            </ol>
            <div className="warnbar">
              Tower reaches the server over your network as-is. Exposing a home
              server to the open internet is a decision worth making deliberately —
              a tunnel or a VPN is the safer way in.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Community ───────────────────────────────────────────────────────── */

const CHANNELS = [
  ['setup-help', 'Cannot reach the server, or the app will not connect.'],
  ['playback', 'Transcoding, subtitles out of sync, audio track missing.'],
  ['bugs', 'Something crashed or behaved wrongly. Logs welcome.'],
  ['requests', 'What Tower should do that it does not do yet.'],
]

const ASKS = [
  'Why does this one film always say it will convert?',
  'My server keeps falling asleep mid-episode.',
  'Tamil audio track is in the file but Tower will not pick it.',
  'Watch together works on Wi-Fi but not over my tunnel.',
  'Everything in one folder got matched to the wrong film.',
]

function Community() {
  const invite = TOWER.discordInvite
  const ref = useRef<HTMLAnchorElement>(null)

  return (
    <section id="community" className="section--ruled">
      <div className="wrap">
        <div className="sec-head">
          <span className="mono">Queries</span>
          <h2>Something not playing? Ask in the open.</h2>
          <p>
            Most Tower problems are really server problems — a codec the phone
            cannot read, a file the scanner misfiled, a disk that went to sleep at
            the wrong moment. Those are much faster to solve with the actual error
            in front of someone. The Discord is where that happens.
          </p>
        </div>

        <div className="com-grid">
          <div className="card reveal">
            <div className="com-head">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#E8B34A" aria-hidden="true">
                <path d="M19.3 5.4A17 17 0 0 0 15.1 4l-.3.5a12.7 12.7 0 0 1 3.7 1.9 16.4 16.4 0 0 0-12.9 0A12.6 12.6 0 0 1 9.3 4.5L9 4a17 17 0 0 0-4.2 1.4C2 9.5 1.3 13.5 1.6 17.4A17 17 0 0 0 6.8 20l1-1.5a11 11 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 10.9 0l.4.3a11 11 0 0 1-1.7.8l1 1.5a17 17 0 0 0 5.2-2.6c.4-4.5-.6-8.5-3-12zM8.6 15c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.9 2.1-1.9 2.1zm6.8 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1z" />
              </svg>
              <h3 className="com-title">Tower on Discord</h3>
            </div>
            <p className="com-lede">
              Setup help, bug reports and what is being built next. Bring the file
              name and the badge the app showed you — that is usually the whole
              answer.
            </p>

            <hr className="rule" />
            {CHANNELS.map(([name, blurb]) => (
              <div className="chan" key={name}>
                <span className="hash">#</span>
                <div>
                  <b>{name}</b>
                  <p>{blurb}</p>
                </div>
              </div>
            ))}
            <hr className="rule" />

            {/* Blank invite disables the button and says why, rather than
                pointing nowhere — the original's behaviour, kept. */}
            <a
              ref={ref}
              className={`btn btn-primary btn-block${invite ? '' : ' is-disabled'}`}
              href={invite || undefined}
              aria-disabled={!invite}
              target={invite ? '_blank' : undefined}
              rel={invite ? 'noreferrer' : undefined}
            >
              Join the Discord
            </a>
            {!invite && (
              <p className="footnote">
                No invite link is configured yet — set <b>discordInvite</b> in
                src/config.ts.
              </p>
            )}
          </div>

          <div className="card reveal">
            <span className="mono">Worth asking there</span>
            <div className="ask">
              {ASKS.map((ask) => (
                <div key={ask}>{ask}</div>
              ))}
            </div>
            <p className="com-tip">
              Include the mono line the app printed — the container, the codec and
              the resolution. It answers most of the question on its own.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer>
      <div className="wrap foot">
        <p>
          Tower is a client for a media server you run yourself. It plays the files
          you already have; it does not find, buy or fetch anything for you.
        </p>
        <nav>
          <a href="#features">Features</a>
          <a href="#download">Download</a>
          <a href="#community">Community</a>
          <Link to="/browse">Open in browser</Link>
        </nav>
      </div>
    </footer>
  )
}
