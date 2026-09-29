import { lookupPublishedAddress } from './directory'
import { isShowable } from './types'
import type {
  AuthResponseDto,
  ChapterDto,
  ClientCapabilitiesRequestDto,
  ContinueWatchingDto,
  ItemDetailDto,
  ItemPageDto,
  ItemSummaryDto,
  LibrarySummaryDto,
  MusicHomeDto,
  PlaybackDecisionDto,
  ProfileDto,
  RecommendationsDto,
  TeaserClipDto,
  TeaserFeedPageDto,
} from './types'

/** The app has no server address yet — send the visitor to Connect. */
export class NotPairedError extends Error {
  constructor() {
    super('No server paired yet.')
    this.name = 'NotPairedError'
  }
}

/** The server answered, and said no. Carries the status so callers can branch. */
export class TowerHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Tower said ${status}`)
    this.name = 'TowerHttpError'
  }
}

/** Everything the transport needs to remember between requests. */
export interface SessionState {
  baseUrl: string | null
  token: string | null
  refreshToken: string | null
  profileId: string | null
}

/**
 * How long a failed directory lookup stands before another is worth making.
 *
 * A screen fires half a dozen requests at once and they fail together: the
 * first should ask and the rest should take its answer. Past that, a server
 * which is genuinely down should not cost a round trip to Firestore per failed
 * request — but somebody who has just restarted the tunnel and hit reload
 * should not be made to wait, which is what puts this at half a minute rather
 * than something longer.
 */
const ADDRESS_LOOKUP_COOLDOWN_MS = 30_000

/** Skips ngrok's interstitial, which would otherwise arrive instead of JSON. */
const NGROK_SKIP_WARNING = 'ngrok-skip-browser-warning'

type Listener = (state: SessionState) => void

/**
 * The only thing that talks to the server.
 *
 * Mirrors data/remote/TowerApi.kt, including the two pieces of recovery that
 * make a home server usable at all:
 *
 *  - a 401 mints a new access token from the refresh token and retries once,
 *    rather than signing the visitor out mid-browse;
 *  - a request that cannot reach the host asks the directory where the server
 *    moved to, adopts that address and retries.
 *
 * Both are serialised, so a screen whose six parallel requests all fail at once
 * produces one refresh and one lookup, not six.
 */
export class TowerApi {
  private state: SessionState = {
    baseUrl: null,
    token: null,
    refreshToken: null,
    profileId: null,
  }

  private listeners = new Set<Listener>()
  private refreshInFlight: Promise<string | null> | null = null
  private lookupInFlight: Promise<string | null> | null = null
  private lastLookupMs = 0

  getState(): SessionState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setState(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }

  /* ── Transport ────────────────────────────────────────────────────── */

  private url(path: string, query?: Record<string, unknown>): string {
    const base = this.state.baseUrl
    if (!base) throw new NotPairedError()

    const url = new URL(path, base)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }

  private headers(authenticated: boolean): HeadersInit {
    const headers: Record<string, string> = {
      [NGROK_SKIP_WARNING]: 'true',
    }
    if (authenticated && this.state.token) {
      headers.Authorization = `Bearer ${this.state.token}`
    }
    if (this.state.profileId) {
      headers['X-Profile-Id'] = this.state.profileId
    }
    return headers
  }

  private async send(
    path: string,
    init: RequestInit & { query?: Record<string, unknown>; auth?: boolean } = {},
  ): Promise<Response> {
    const { query, auth = true, ...rest } = init
    const body = rest.body

    const attempt = (url: string) =>
      fetch(url, {
        ...rest,
        headers: {
          ...this.headers(auth),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(rest.headers ?? {}),
        },
      })

    let response: Response
    try {
      response = await attempt(this.url(path, query))
    } catch (cause) {
      // Could not reach the host at all — a dead tunnel hostname looks exactly
      // like this. Ask where the server went, and if it has moved, try once
      // more. If it has not, the original failure is the honest answer.
      if (cause instanceof NotPairedError) throw cause
      const moved = await this.moveToPublishedAddress()
      if (!moved) throw cause
      response = await attempt(this.url(path, query))
    }

    if (response.status === 401 && auth && this.state.refreshToken) {
      const renewed = await this.renewAccessToken(this.state.token)
      if (renewed) response = await attempt(this.url(path, query))
    }

    return response
  }

  private async json<T>(
    path: string,
    init?: RequestInit & { query?: Record<string, unknown>; auth?: boolean },
  ): Promise<T> {
    const response = await this.send(path, init)
    if (!response.ok) {
      throw new TowerHttpError(response.status, await response.text().catch(() => ''))
    }
    return (await response.json()) as T
  }

  /**
   * Adopts the address the server published, if it has moved.
   *
   * Null for "no directory, no answer, or the same address we were already
   * using" — the caller reads that as "report the original failure", because a
   * retry against the same host would only fail the same way.
   */
  private moveToPublishedAddress(): Promise<string | null> {
    if (this.lookupInFlight) return this.lookupInFlight

    const now = Date.now()
    if (this.lastLookupMs && now - this.lastLookupMs < ADDRESS_LOOKUP_COOLDOWN_MS) {
      return Promise.resolve(null)
    }
    this.lastLookupMs = now

    this.lookupInFlight = (async () => {
      try {
        const published = await lookupPublishedAddress()
        if (!published || published === this.state.baseUrl) return null
        this.setState({ baseUrl: published })
        return published
      } finally {
        this.lookupInFlight = null
      }
    })()

    return this.lookupInFlight
  }

  /**
   * Mints a new access token, one caller at a time.
   *
   * Two refreshes in flight with the same token means the server rejects one of
   * them — and the loser must retry with what the winner received rather than
   * signing the user out. Taking the lock and then re-reading the token does
   * both: whoever arrives second finds the work already done.
   */
  private renewAccessToken(staleToken: string | null): Promise<string | null> {
    if (this.state.token && this.state.token !== staleToken) {
      return Promise.resolve(this.state.token)
    }
    if (this.refreshInFlight) return this.refreshInFlight

    this.refreshInFlight = (async () => {
      try {
        const refreshToken = this.state.refreshToken
        if (!refreshToken) return null

        const response = await fetch(this.url('/api/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [NGROK_SKIP_WARNING]: 'true' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!response.ok) {
          // Unknown, spent or expired — the server answers all three the same
          // way on purpose, so this cannot be used to probe for live tokens.
          // The only response to it is to sign in again.
          this.setState({ token: null, refreshToken: null })
          return null
        }

        const auth = (await response.json()) as AuthResponseDto
        this.setState({
          token: auth.token,
          refreshToken: auth.refreshToken ?? this.state.refreshToken,
        })
        return auth.token
      } catch {
        return null
      } finally {
        this.refreshInFlight = null
      }
    })()

    return this.refreshInFlight
  }

  /* ── Reachability ─────────────────────────────────────────────────── */

  /** Does a given address answer as Tower? Used by Connect before committing. */
  async probe(baseUrl: string): Promise<boolean> {
    try {
      const url = new URL('/api/health', baseUrl).toString()
      const response = await fetch(url, { headers: { [NGROK_SKIP_WARNING]: 'true' } })
      return response.ok
    } catch {
      return false
    }
  }

  health(): Promise<boolean> {
    return this.probe(this.state.baseUrl ?? '')
  }

  /* ── Auth ─────────────────────────────────────────────────────────── */

  login(usernameOrEmail: string, password: string): Promise<AuthResponseDto> {
    return this.json('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ usernameOrEmail, password }),
    })
  }

  register(
    username: string,
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthResponseDto> {
    return this.json('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, email, password, displayName }),
    })
  }

  profiles(): Promise<ProfileDto[]> {
    return this.json('/api/profiles')
  }

  createProfile(name: string): Promise<ProfileDto> {
    return this.json('/api/profiles', { method: 'POST', body: JSON.stringify({ name }) })
  }

  /* ── Browsing ─────────────────────────────────────────────────────── */

  /** Whether there is a session to browse *as*. Decides public vs private. */
  private get authed(): boolean {
    return Boolean(this.state.token)
  }

  /**
   * The catalogue, as whoever is asking.
   *
   * A visitor with no account gets the `public/` route, which the server
   * answers without a token — verified against a live deployment, where the
   * authenticated route 403s and this one returns the library. That is what
   * lets somebody look round the shelf before being asked to sign in.
   *
   * The public rows are the same tiles minus every field that only means
   * something for a signed-in profile: resume position, watched, liked. The
   * types already treat all of those as optional, so nothing downstream has to
   * know which route it came from.
   */
  browse(options: {
    category?: string
    q?: string
    genre?: string
    unwatched?: boolean
    minHeight?: number
    sort?: string
    page?: number
    size?: number
  } = {}): Promise<ItemPageDto> {
    const { category = 'all', sort = 'title', page = 0, size = 40, ...rest } = options

    // Stray image files are dropped here rather than by every caller. The
    // server's total still counts them, so it is reduced by however many this
    // page hid: exact for a search that fits on one page — where "5 matching"
    // above "nothing here" would otherwise contradict itself — and off by at
    // most the other pages' strays in a library of thousands, which is not
    // worth a second request to correct.
    const shown = (result: ItemPageDto): ItemPageDto => {
      const all = result.items ?? []
      const items = all.filter(isShowable)
      return {
        ...result,
        items,
        totalItems: Math.max(0, (result.totalItems ?? all.length) - (all.length - items.length)),
      }
    }

    if (!this.authed) {
      // unwatched and minHeight are profile/quality filters the public route
      // does not take; dropped rather than sent and silently ignored.
      const { q, genre } = rest
      return this.json<ItemPageDto>('/api/media/public/items', {
        auth: false,
        query: { category, sort, page, size, q, genre },
      }).then(shown)
    }

    return this.json<ItemPageDto>('/api/media/items', {
      query: { category, sort, page, size, ...rest },
    }).then(shown)
  }

  detail(id: string): Promise<ItemDetailDto> {
    const path = this.authed
      ? `/api/media/items/${encodeURIComponent(id)}`
      : `/api/media/public/items/${encodeURIComponent(id)}`
    return this.json(path, { auth: this.authed })
  }

  recentlyAdded(types?: string, limit = 20): Promise<ItemSummaryDto[]> {
    return this.json<ItemSummaryDto[]>('/api/media/recently-added', {
      query: { types, limit },
    }).then((items) => (items ?? []).filter(isShowable))
  }

  continueWatching(limit = 20): Promise<ContinueWatchingDto[]> {
    return this.json<ContinueWatchingDto[]>('/api/media/continue-watching', {
      query: { limit },
    }).then((entries) => (entries ?? []).filter((entry) => isShowable(entry.item)))
  }

  recommendations(limit = 20): Promise<RecommendationsDto> {
    return this.json<RecommendationsDto>('/api/media/recommendations', {
      query: { limit },
    }).then((result) => ({
      ...result,
      items: (result.items ?? []).filter((entry) => isShowable(entry.item)),
    }))
  }

  /**
   * The music shelves: what was part-way through, then rails by mood,
   * activity, era and who made them. Signed-in only; there is no public
   * route, so a visitor gets the flat list instead.
   */
  musicHome(limit = 20): Promise<MusicHomeDto> {
    return this.json<MusicHomeDto>('/api/media/home/music', { query: { limit } }).then(
      (home) => ({
        ...home,
        continueListening: (home.continueListening ?? []).filter(isShowable),
        rails: (home.rails ?? []).map((rail) => ({
          ...rail,
          items: (rail.items ?? []).filter((entry) => entry.item && isShowable(entry.item)),
        })),
      }),
    )
  }

  librarySummary(): Promise<LibrarySummaryDto> {
    return this.json('/api/media/library-summary')
  }

  genres(): Promise<string[]> {
    return this.json('/api/media/genres')
  }

  /**
   * The Shorts feed — clips cut from the library's own films.
   *
   * Signed-in only. There is no public route for this one: the authenticated
   * path 403s without a token and `public/teasers` does not exist, so the rail
   * simply is not offered to a visitor without an account.
   */
  teaserFeed(size = 12, seed?: number): Promise<TeaserFeedPageDto> {
    return this.json('/api/media/teasers', { query: { page: 0, size, seed } })
  }

  /** The clips cut from one particular title. */
  teasers(itemId: string): Promise<TeaserClipDto[]> {
    return this.json(`/api/media/items/${encodeURIComponent(itemId)}/teasers`)
  }

  /* ── Playback ─────────────────────────────────────────────────────── */

  playbackDecision(
    id: string,
    capabilities: ClientCapabilitiesRequestDto,
    startSeconds = 0,
  ): Promise<PlaybackDecisionDto> {
    return this.json(`/api/media/items/${encodeURIComponent(id)}/playback-decision`, {
      method: 'POST',
      query: { startSeconds },
      body: JSON.stringify(capabilities),
    })
  }

  chapters(id: string): Promise<ChapterDto[]> {
    return this.json(`/api/media/items/${encodeURIComponent(id)}/chapters`)
  }

  /**
   * Which subtitle and audio track to play. The server remembers the choice
   * for this title and applies it to a converted stream; the phone's player
   * makes the same call.
   */
  selectTracks(
    id: string,
    subtitleTrackIndex: number | null,
    audioTrackIndex: number | null,
  ): Promise<unknown> {
    return this.json(`/api/media/items/${encodeURIComponent(id)}/tracks`, {
      method: 'PUT',
      body: JSON.stringify({ subtitleTrackIndex, audioTrackIndex }),
    })
  }

  recordProgress(
    id: string,
    positionSeconds: number,
    durationSeconds?: number,
    finished?: boolean,
  ): Promise<unknown> {
    return this.json(`/api/media/items/${encodeURIComponent(id)}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ positionSeconds, durationSeconds, finished }),
    })
  }

  /**
   * A URL the server handed back — a stream, a clip — made absolute against
   * the *current* address.
   *
   * The playback decision names its stream as a server-relative path. Handed
   * to a media element as-is, the browser resolves it against the *site's*
   * origin, which on a static host is not where the server is; the request
   * goes to Netlify and comes back as the download page. Verified against a
   * live deployment, where it was the whole reason the video page played
   * nothing.
   */
  absolute(url: string): string {
    return new URL(url, this.state.baseUrl ?? window.location.origin).toString()
  }

  /* ── Artwork ──────────────────────────────────────────────────────── */

  /**
   * A poster or backdrop URL, resolved against the *current* address.
   *
   * Built on demand rather than baked into the item when it is mapped. The
   * Android app learned this the hard way: absolute artwork URLs stored at map
   * time outlive the address they were built against, so when the tunnel
   * hostname changes the rails load and every poster stays blank.
   */
  artwork(id: string, kind: 'poster' | 'backdrop'): string | null {
    if (!this.state.baseUrl) return null
    // The public route for a visitor with no token: the authenticated one 403s
    // without one, and a shelf of empty gradients is a poor advertisement for a
    // library somebody is being invited to look round.
    const path = this.authed
      ? `/api/media/items/${encodeURIComponent(id)}/${kind}`
      : `/api/media/public/items/${encodeURIComponent(id)}/${kind}`
    return new URL(path, this.state.baseUrl).toString()
  }
}

export const api = new TowerApi()
