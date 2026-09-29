# Tower — site and web client

Download page and browser client for **Tower**, the Android app for a home
media server (`com.bharath.dev.movbuggy`, built from the MovBuggy Kotlin
Multiplatform project).

React + TypeScript, built with Vite. The download page is unchanged in
appearance — it was ported class-for-class from the original static
`index.html` — but it is now a route in the same app rather than a file.

**One consequence worth knowing:** this page used to render with JavaScript
off. It no longer does. That was the trade made when the site moved to React.

## Layout

```
tower-site/
├── index.html              Vite entry; the real page is src/pages/Landing.tsx
├── src/
│   ├── config.ts           ← the only file most deploys need to edit
│   ├── api/
│   │   ├── client.ts       the only thing that talks to the server
│   │   ├── directory.ts    where Tower says it is today (Firestore)
│   │   └── types.ts        wire shapes, mirroring data/remote/dto
│   ├── session/            address + tokens, persisted to localStorage
│   ├── playback/           what this browser can play, and the music player
│   ├── pages/              Landing, Connect, SignIn, Home, Library, Detail, Watch
│   ├── components/         AppChrome, PosterCard, Artwork, PlayerBar, AdSlot
│   └── styles/
│       ├── landing.css     design tokens + the download page (was css/styles.css)
│       └── app.css         the client's own screens
├── scripts/smoke.mjs       drives the built site in a real browser
└── public/downloads/       ← put the release APK here
```

## Running it

```
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
npm run preview    # serve dist/
```

`npm run build` typechecks first, so a type error fails the build rather than
shipping.

## Deploying

1. Edit `src/config.ts`:

   | Key | What it is |
   | --- | --- |
   | `apkUrl` | Path or URL the download button points at. |
   | `discordInvite` | Your `https://discord.gg/...` link. Blank disables the button and says why. |
   | `version` / `apkSize` / `minAndroid` | Shown on the download card and in the nav. |
   | `defaultBaseUrl` | Fallback address, used only if the directory lookup finds nothing. Blank is fine and is the default. |
   | `directory` | Firestore project/database holding the published address. Already filled in, and matches `ServerDirectory.kt`. |
   | `ads` | Google AdSense for the web client only: `adsenseClient` (your `ca-pub-…` ID) and one ad unit ID per placement in `slots`. Blank turns a slot off. `placeholders` draws a dashed outline where each ad would go while nothing is configured — set it to `false` before shipping without IDs. The download page never carries ads. |

2. Drop the release APK into `public/downloads/`. It is built by:

   ```
   ./gradlew :composeApp:assembleRelease
   ```

3. `npm run build` and serve `dist/` on any static host.

   **The host must rewrite unknown paths to `index.html`**, or a reload on
   `/library` will 404 — this is a single-page app and only `/` is a real file.
   Netlify, Vercel and Cloudflare Pages do this with one rule; nginx needs
   `try_files $uri /index.html`.

   If your server needs telling about APKs, the MIME type is
   `application/vnd.android.package-archive`.

## Where the endpoint comes from

Nobody types an address. The server publishes where it is to a Firestore
document every time it starts, and the client reads that on first load — the
same document `ServerDirectory.kt` reads, so the phone and the browser follow
the server to the same place.

A cold browser with an empty `localStorage` therefore goes straight to sign-in:

```
▸ Cold visit to /browse with nothing remembered
  firestore calls: 1
  landed on: /signin
  address in use: HTTPS://PARAMETER-ALUMINIUM-SWAP-SYNOPSIS.TRYCLOUDFLARE.COM
```

This matters more in a browser than on the phone. A quick Cloudflare tunnel
gets a new hostname on every restart, and nobody is going to copy a fresh one
into a laptop each time.

Connect is still there for the cases the directory cannot cover — a LAN address
while the tunnel is down, a second server — and carries a **Find it for me**
button that re-asks the directory, which is the fastest fix when the tunnel has
just moved.

**One thing to be deliberate about:** publishing this site publicly also
publishes your server's current address to anyone who loads the page. The
Firebase API key in the bundle is not the issue — it names a project and
authorises nothing by itself, the rules allow anyone to read this one document
and nobody to write it, and it already ships inside the APK. The address itself
is the exposure. The server still refuses everything without a sign-in, but it
is no longer unlisted. Blank out `directory.projectId` to turn the lookup off
and make Connect ask instead.

## Who has to sign in, and when

Nobody, to look. The server answers a `public/` route for the catalogue, the
detail and the artwork without any token — verified against a live deployment,
where the authenticated route 403s and the public one returns the library. So a
visitor lands on the shelf, opens a title and reads what is on it before anyone
asks them for anything.

The account is asked for at **Play**, and only there. That is not a policy
invented in this client — it is where the server draws the line too: the stream
needs a token and `guest/playback-decision` refuses outright. Signing in is the
first thing that buys the visitor something, which makes it the first reasonable
moment to ask.

What an anonymous visitor does not get is anything profile-shaped: Continue
watching, For you, the camera-roll rail, and the Unwatched / 4K filters are all
answers to "what has *this profile* done". They are hidden rather than shown
and quietly ignored.

**The server's address is not displayed anywhere in the UI.** On a phone a
status line naming the host is reassuring; on a public web page it prints
somebody's home server address for every visitor. The smoke test asserts this —
it scans the rendered page for tunnel hostnames and private IPs.

## The design follows the Android app, not a guess

The screens were rebuilt against the real app captures in `MovBuggy/shots/`
(`p1_posters.png`, `r3_library.png`, `v1_detail.png`) rather than invented.
The rules that actually matter, all of which the web client had wrong first
time round:

| Rule | What it means |
| --- | --- |
| **Two typefaces, split by origin** | Archivo for anything a *human wrote* — headings, titles, prose. IBM Plex Mono, uppercase, wide-tracked, for anything the *server measured* — a quality string, a size, a codec, a count. |
| **Section headings are sans** | "Recently added", not `RECENTLY ADDED`. A shelf heading is written, not measured. This was the most visible mistake: every heading was in mono. |
| **Titles sit on the artwork** | Over a bottom scrim, two lines max. Only the measured fact — `1080p`, `2h 27m` — goes *below* the tile, in mono, and only when the server knows it. |
| **Tabs are words** | Mono uppercase, no icons at all. Active is amber. |
| **Detail is full bleed** | No poster card. The backdrop runs the width, fades to ink, and the title sits on it with a plain sans `2025 · 2h 27m` under it. |
| **The action row** | One wide amber primary, then square outlined secondaries. |
| **Amber is the only action colour** | Green means direct play and is never a button fill. |

Two things are deliberately *not* copies of the phone:

- **A sidebar replaces the tab bar above 960px.** Two tabs at opposite ends of
  an empty 1280px strip is what the phone layout looks like on a desktop.
- **A spotlight opens Home.** The phone's equivalent is the continue-watching
  card; for a visitor with no account there is nothing to continue, so the
  newest thing on the disk takes that slot rather than leaving a thin strip of
  posters above an empty screen.

## Music has its own register

Selecting **Music** in the library switches accent colour and default layout.

The colour is **MediaPink `#B06A8F`**, which is not an invention — it is the
value `ui/theme/Color.kt` already assigns this category, commented "music +
photos category". It is applied by restating `--amber` inside
`[data-mode='music']` rather than by restyling each component, so every accent
that already reads from that token follows and none can be missed. A track's
Detail page carries the same mode, so opening one is not a jarring switch back
to amber.

Deliberately **not** Spotify's green: the palette has one hard rule — green
means direct play and is never a button fill — and a green accent would
collide with it everywhere.

The default layout is a **list**, not a grid. Two thousand loose MP3s in a
poster grid is unreadable: most have no art, so it becomes a wall of coloured
squares with the only useful information, the title, squeezed underneath in two
lines. The list puts the title first at full width and right-aligns duration.
The row number becomes a play control on hover — the one borrowed idea, because
it keeps the column narrow and gives every row a target without putting a
button in all 2,349 of them. A Grid toggle is there for when the art is worth
looking at.

Album and the artist line drop out below 720px; the title is the only column
that earns its width on a phone.

## One trap worth knowing

`landing.css` is loaded first and owns the shared primitives — `.btn`, `.card`,
`.mono`, `.dot`, `.chip` — but it also owns some names that sound generic and
are not:

| Class | Belongs to |
| --- | --- |
| `.screen`, `.screen-body` | the **phone mockup** in the hero: `height: 552px; display: flex; overflow: hidden` |
| `.rail`, `.poster`, `.tabbar` | also the mockup |
| `section` (bare element) | `padding: 76px 0`, for the marketing bands |

The client's pages are `.view`, not `.screen`, because of exactly this. Naming
them `.screen` put every page inside an invisible 552px phone frame with its
overflow clipped — the spotlight rendered as a 2px hairline and the library
grid stopped after two rows. Nothing errored and nothing logged; it just
quietly cropped everything. If a new client component needs a generic-sounding
class, grep `src/styles/landing.css` first.

## The web client

Talks to the same REST API as the phone, using the same recovery behaviour:
a 401 mints a new token from the refresh token and retries once, and a request
that cannot reach the host asks the directory where the server moved to and
adopts that address. Both are serialised, so six failing requests produce one
refresh and one lookup.

The Tower server already sends permissive CORS — verified against a live
deployment, including `authorization`, `x-profile-id` and
`ngrok-skip-browser-warning` on the preflight — so no server change is needed
for the client to work from a different origin.

### What is not here yet

Built: Connect, Sign in, Home (spotlight, teasers, category rails), Library
(search, filters, sort, paging), Detail and the player.

Not yet: Collections, Timeline, Watch Together, Assistant, Admin, Fix-match and
Onboarding.

**Teasers are unverified against a live account.** The rail is wired to
`/api/media/teasers`, but that route 403s without a token and there is no
public equivalent (`public/teasers` returns 500), so it has only been exercised
as the empty case. It renders nothing at all for a visitor with no account,
which is correct; whether it renders *well* with real clips has not been seen.

Two of the phone's screens are deliberately absent rather than pending:

- **Saved** is offline downloads — a background job that outlives the app,
  which is the one thing a web page cannot do.
- **Shorts** is a vertical swipe feed built for a thumb.

### One known limitation

Artwork and media both need a bearer token, and neither `<img src>` nor
`<video src>` can carry a header.

Artwork is solved: it is fetched like any other request and handed to the
element as an object URL, cached across mounts — the same arrangement the app
makes for Coil, which is given the API's own authenticated HTTP client.

For playback, HLS is solved the same way, because hls.js fetches every segment
itself and `xhrSetup` is the hook the video element lacks. **A direct
progressive file is not:** the element does its own ranged fetching and there
is nowhere to add the header. If the server rejects those requests, the player
says so plainly rather than showing a black rectangle. The fix is server-side —
a short-lived signed URL, or a token query parameter on the stream route — and
until then direct play in the browser depends on the stream route accepting an
unauthenticated ranged GET.

## Checking it

```
npm run preview                        # in one shell
node scripts/smoke.mjs http://localhost:4173 https://your-tower-address
node scripts/smoke-directory.mjs http://localhost:4173
node scripts/shots.mjs http://localhost:4173
```

`smoke.mjs` walks the whole visitor path in a fresh browser context: landing
page, plan toggle, then into the client with no account at all — Home, Library,
a title, and Play, which is the one place it should be stopped and asked to
sign in. It also checks that Create account is a real control rather than a
footnote, and that the server's address appears nowhere on the page.

`smoke-directory.mjs` is the one that proves the endpoint comes from Firebase:
a fresh browser context with nothing remembered should reach sign-in without
being asked for an address, having made exactly one Firestore call.

`shots.mjs` captures Browse and Library at 1440px and 402px, so the two layouts
can be looked at rather than assumed — the sidebar/tab-bar switch and the grid
reflow are the things most likely to break silently.

All three collect console errors, page errors and failed requests, because a
React page that throws still serves a 200 and an empty `<div id="root">`.
Screenshots land in `shots/`. A 404 on an artwork URL is ordinary — it means
that title has no poster on disk, and the gradient is the intended appearance.

## The music player

Music plays in a bar along the bottom of the client, not on the video
screen: press a track in the list, a tile's play button, or Play on a track's
page, and it starts with the rest of that list queued behind it. The bar has
the transport, a scrubber, shuffle and repeat, the queue, and volume; a phone
gets the compact version. Navigating between pages does not stop it. Space
toggles play, and the OS media keys and lock-screen controls work.

Two things worth knowing about how it plays:

- **Tracks are fetched, not streamed.** The server wants the bearer token in a
  header and refuses one in the URL, and an `<audio>` element cannot send
  headers. So each track is fetched like an API call and played from memory,
  with the next track in the queue fetched a few seconds in. A song is a few
  megabytes; this is fine for music and would not be for films.
- **A dropped connection is retried.** The Cloudflare quick tunnel drops its
  link to the server under a burst of requests and answers 530 for a while
  after. The player waits and tries again, twice, before giving up on a track
  and saying so in the bar.

`PlayerContext.tsx` owns the one audio element and the queue; `PlayerBar.tsx`
is only a view of it.
