import type { ItemSummaryDto } from '../api/types'

/*
 * What to play after this one.
 *
 * The server keeps no series: an anime arrives as a flat run of files whose
 * titles carry the ordering — "[Anime Time] Black Lagoon - 003 - Ring-Ding
 * Ship Chase", "Naruto S01E05", "Bleach Episode 12". So the series and the
 * episode number are read out of the title, the way a person reads them, and
 * the next episode is the one whose number follows. When the run is over,
 * another series from the same shelf is offered instead, so the end of a
 * season is a suggestion rather than a black screen.
 *
 * Nothing here is remembered or sent anywhere. It is a reading of the shelf.
 */

export interface EpisodeRef {
  /** The series name as written, tags stripped. */
  series: string
  /** The series name normalised, for grouping. */
  key: string
  season: number
  episode: number
}

export interface UpNext {
  item: ItemSummaryDto
  /** The next episode of the same series, or the first of another. */
  kind: 'episode' | 'series'
  series: string
}

/**
 * Release-group tags and bracketed notes: "[Anime Time]", "(UHD", "[1080p]".
 * An unclosed parenthesis is common in titles cut off by a scanner.
 */
function stripTags(title: string): string {
  return title
    .replace(/\[[^\]]*\]?/g, ' ')
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * A serial named by its air date — "Mahabharatham 03-31-14", "Mahabharatham 06 02 14"
 * — is one series ordered by that date: month, day, year, as written here.
 */
const DATED = /^(.+?)\s+(\d{1,2})[-\s.](\d{1,2})[-\s.](\d{2,4})$/

/** Orderings people actually write, most specific first. */
const PATTERNS: { re: RegExp; season?: number; episode: number; series: number }[] = [
  // Black Lagoon S01E05, Naruto s1e5
  { re: /^(.+?)\s*[-–]?\s*S(\d{1,2})\s*E(\d{1,4})\b/i, series: 1, season: 2, episode: 3 },
  // Black Lagoon 1x05
  { re: /^(.+?)\s*[-–]?\s*(\d{1,2})x(\d{1,4})\b/i, series: 1, season: 2, episode: 3 },
  // Black Lagoon - 005 - Title, Black Lagoon -005, Black Lagoon - Episode 5
  { re: /^(.+?)\s*[-–]\s*(?:ep(?:isode)?\.?\s*)?(\d{1,4})\b/i, series: 1, episode: 2 },
  // Naruto Episode 5, Naruto Ep.5
  { re: /^(.+?)\s+ep(?:isode)?\.?\s*(\d{1,4})\b/i, series: 1, episode: 2 },
  // Naruto 05
  { re: /^(.+?)\s+(\d{1,4})$/, series: 1, episode: 2 },
]

export function parseEpisode(title: string): EpisodeRef | null {
  const clean = stripTags(title)

  const dated = DATED.exec(clean)
  if (dated) {
    const series = dated[1].trim()
    const key = normalise(series)
    const year = Number(dated[4].length === 2 ? '20' + dated[4] : dated[4])
    if (key && !/^d+$/.test(series)) {
      // Month, day, year: "03-31-14" is the 31st of March, so it cannot be
      // day first. Ordered as the calendar orders them.
      return { series, key, season: year, episode: Number(dated[2]) * 100 + Number(dated[3]) }
    }
  }

  for (const pattern of PATTERNS) {
    const match = pattern.re.exec(clean)
    if (!match) continue
    const series = match[pattern.series].replace(/[-–\s]+$/, '').trim()
    // A bare number is not a series name, and a four-digit "series" is a year.
    if (!series || /^\d+$/.test(series)) continue
    const key = normalise(series)
    if (!key) continue
    return {
      series,
      key,
      season: pattern.season ? Number(match[pattern.season]) : 1,
      episode: Number(match[pattern.episode]),
    }
  }
  return null
}

function order(ref: EpisodeRef): number {
  return ref.season * 10_000 + ref.episode
}

/**
 * The next episode of `current`'s series from `shelf`, or the first episode
 * of another series on that shelf, or nothing if the shelf has no series.
 *
 * Another series is chosen by preferring one whose first episode has not
 * been watched, then alphabetical order from the current series onward, so
 * the suggestion is steady rather than random and moves through the shelf.
 */
export function pickUpNext(current: ItemSummaryDto, shelf: ItemSummaryDto[]): UpNext | null {
  const mine = parseEpisode(current.title)

  const runs = new Map<string, { series: string; episodes: { ref: EpisodeRef; item: ItemSummaryDto }[] }>()
  for (const item of shelf) {
    const ref = parseEpisode(item.title)
    if (!ref) continue
    const run = runs.get(ref.key) ?? { series: ref.series, episodes: [] }
    run.episodes.push({ ref, item })
    runs.set(ref.key, run)
  }
  for (const run of runs.values()) {
    run.episodes.sort((a, b) => order(a.ref) - order(b.ref))
  }

  if (mine) {
    const run = runs.get(mine.key)
    if (run) {
      const following = run.episodes.find(
        (entry) => entry.item.id !== current.id && order(entry.ref) > order(mine),
      )
      if (following) return { item: following.item, kind: 'episode', series: run.series }
    }
  }

  // No next episode: another series, first episode.
  const others = [...runs.entries()]
    .filter(([key, run]) => key !== mine?.key && run.episodes.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
  if (others.length === 0) return null

  const startAt = mine ? others.findIndex(([key]) => key.localeCompare(mine.key) > 0) : 0
  const ordered = startAt > 0 ? [...others.slice(startAt), ...others.slice(0, startAt)] : others
  const fresh = ordered.find(([, run]) => !run.episodes[0].item.watched) ?? ordered[0]
  const [, run] = fresh
  return { item: run.episodes[0].item, kind: 'series', series: run.series }
}
