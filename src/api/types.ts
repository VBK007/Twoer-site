/**
 * The wire shapes, mirroring data/remote/dto in the Android app.
 *
 * Only the ones the core viewing path needs are here. Every optional field is
 * optional for the same reason it is in the app: the server genuinely omits
 * them, and a screen that assumes a poster or a runtime gets a hole in it on
 * the first item that lacks one.
 */

export interface UserDto {
  id?: string
  username?: string
  email?: string
  displayName?: string
  role?: string
}

export interface AuthResponseDto {
  token: string
  /** Rotated on every refresh, so what comes back must replace what was sent. */
  refreshToken?: string | null
  user?: UserDto | null
}

/** `ageMode` is ADULT or KID; stars/streak belong to the kids app. */
export interface ProfileDto {
  id: string
  name: string
  ageMode?: string | null
  avatarTint?: string | null
  stars?: number
}

export interface ItemSummaryDto {
  id: string
  type: string
  title: string
  year?: number | null
  runtimeMinutes?: number | null
  rating?: number | null
  quality?: string | null
  genres?: string[]
  hasPoster?: boolean
  hasBackdrop?: boolean
  missing?: boolean
  resumePositionSeconds?: number | null
  watched?: boolean
  percentComplete?: number | null
  capturedAt?: string | null
  artist?: string | null
  album?: string | null
}

export interface ItemPageDto {
  items: ItemSummaryDto[]
  page: number
  size: number
  totalItems: number
  totalPages: number
}

/**
 * What ffprobe found inside the container. Mirrors `CatalogDtos.MediaInfoDto`.
 *
 * `audioCodecs` is a comma-separated **string** here — `"eac3,aac"` — not a
 * list, even though the capabilities *request* sends an array under the same
 * name. The app draws the same distinction; conflating the two renders the
 * whole detail screen blank, because `.join` on a string is not a function.
 */
export interface MediaInfoDto {
  container?: string | null
  durationSeconds?: number | null
  videoCodec?: string | null
  width?: number | null
  height?: number | null
  bitrate?: number | null
  audioCodecs?: string | null
  audioChannels?: number | null
  probed?: boolean
}

/**
 * Field names checked against a live response rather than guessed.
 *
 * Note `plot`, not `overview` — and there is no `sizeBytes` on the detail at
 * all; the nearest thing is `mediaInfo.bitrate` × `durationSeconds`, which the
 * card works out rather than claims to have been told.
 */
/** One embedded subtitle stream, as ffprobe found it. */
export interface SubtitleTrackDto {
  index: number
  language?: string | null
  format?: string | null
  forced?: boolean
  hearingImpaired?: boolean
  embedded?: boolean
}

export interface AudioTrackDto {
  index: number
  codec?: string | null
  language?: string | null
  /** Whatever the muxer wrote in — often an advert, occasionally useful. */
  title?: string | null
}

export interface ItemDetailDto extends ItemSummaryDto {
  plot?: string | null
  tagline?: string | null
  originalTitle?: string | null
  certification?: string | null
  language?: string | null
  studio?: string | null
  /** A comma-separated string, not a list. */
  castMembers?: string | null
  directors?: string | null
  fileName?: string | null
  mediaInfo?: MediaInfoDto | null
  subtitles?: SubtitleTrackDto[]
  audioTracks?: AudioTrackDto[]
  liked?: boolean
}

export interface ContinueWatchingDto {
  item: ItemSummaryDto
  positionSeconds: number
  durationSeconds?: number | null
  percentComplete?: number | null
}

export interface RecommendationDto {
  item: ItemSummaryDto
  /** "Because you watched ..." — the server's own wording, never invented. */
  reason?: string | null
}

export interface RecommendationsDto {
  items?: RecommendationDto[]
}

/** One entry on a home rail. `reason` is the server's own wording, if any. */
export interface HomeItemDto {
  item: ItemSummaryDto
  reason?: string | null
}

/** `key` is an axis and a value — `mood:Romantic`, `era:2010` — or a plain name. */
export interface HomeRailDto {
  key?: string | null
  title?: string | null
  rankedBy?: string | null
  items?: HomeItemDto[]
}

/** The music tab's home: shelves computed by the server from the audio itself. */
export interface MusicHomeDto {
  continueListening?: ItemSummaryDto[]
  rails?: HomeRailDto[]
  generatedAt?: string | null
}

/** What this browser can actually play, sent so the server can decide. */
export interface ClientCapabilitiesRequestDto {
  deviceName?: string
  videoCodecs: string[]
  audioCodecs: string[]
  containers: string[]
  maxHeight?: number | null
  maxBitrate?: number | null
  supportsHls?: boolean
}

/** A chapter mark the server read from the file, for ticks on the seek bar. */
export interface ChapterDto {
  index: number
  startSeconds: number
  endSeconds?: number | null
  title?: string | null
}

/** `mode` is DIRECT or TRANSCODE. */
export interface PlaybackDecisionDto {
  mediaItemId: string
  mode: string
  url: string
  sessionId?: string | null
  startSeconds?: number | null
  mediaInfo?: MediaInfoDto | null
  reasons?: string[]
}

/**
 * A short vertical clip cut from a film's own file — the app's Shorts feed.
 *
 * `fileUrl` is server-relative and null until the clip is READY: no file,
 * nothing to play. Most of the admin-facing shape is ignored here; this client
 * only ever reads published, finished ones.
 */
export interface TeaserClipDto {
  id: string
  mediaItemId?: string | null
  /** The film it was cut from, so the rail can name it without a second call. */
  itemTitle?: string | null
  state?: string | null
  startSeconds?: number
  durationSeconds?: number
  /** What the cut is of — "the chase", "the reveal". Often absent. */
  label?: string | null
  published?: boolean
  fileUrl?: string | null
  width?: number | null
  height?: number | null
}

export interface TeaserFeedPageDto {
  items: TeaserClipDto[]
  /** The shuffle this page was dealt from; hand it back on later pages. */
  seed?: number
  page?: number
  size?: number
  totalItems?: number
  totalPages?: number
}

export interface LibrarySummaryDto {
  totalItems?: number
  totalBytes?: number
}

/** The app's MediaKind, with the same UI labels. See domain/model/Media.kt. */
export const CATEGORY_LABELS: Record<string, string> = {
  FILM: 'Films',
  ANIME: 'Anime',
  HOME_VIDEO: 'Ours',
  MUSIC: 'Music',
  PHOTO: 'Photos',
  // Labelled "Erotic" while the server still calls it ADULT. The wire name is
  // not changed and must not be — see the note on MediaKind.ADULT.
  ADULT: 'Erotic',
}

/** Browse order, and the order the chips appear in. 18+ sits last. */
export const CATEGORIES = ['FILM', 'ANIME', 'HOME_VIDEO', 'MUSIC', 'ADULT'] as const

/**
 * Whether the web client shows an item at all.
 *
 * The scanner indexes every file it can put a name to, and a media folder
 * collects files that are not media: the `__ia_thumb.jpg` Internet Archive
 * drops into every download, CD cover scans, product images saved next to a
 * torrent. They all arrive as PHOTO with no artwork, no runtime and no quality
 * — 29 of them in this library, and not one a person would pick off a shelf.
 * There is no Photos category in the client either, so they only ever showed
 * up by accident: as the "newest on the disk" spotlight, or a blank tile in
 * Recently added called "ia thumb".
 *
 * Applied where lists come off the wire, so no page has to remember.
 */
export function isShowable(item: ItemSummaryDto): boolean {
  return item.type !== 'PHOTO'
}
