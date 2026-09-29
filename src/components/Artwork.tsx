import { useEffect, useState } from 'react'
import { api } from '../api/client'

/**
 * Poster and backdrop gradients, from ui/theme/Color.kt.
 *
 * A title with no artwork gets a gradient rather than a broken image or an
 * empty box, and the same title always gets the same one — PosterCard hashes
 * the name onto this list, and so does this.
 */
const POSTER_GRADIENTS: [string, string][] = [
  ['#3A4A5C', '#12171D'],
  ['#4A3A5C', '#171220'],
  ['#5B3350', '#1A0F18'],
  ['#2C4A45', '#101C1A'],
  ['#57402C', '#1D1610'],
  ['#432C44', '#181018'],
  ['#33557A', '#0F1A26'],
  ['#6B3A3A', '#1E1010'],
  ['#7A6BA8', '#1E1A2C'],
  ['#D4903F', '#3A2510'],
]

/** "Made by you", not "made for you" — home videos lean blue/green. */
const HOME_VIDEO_GRADIENTS: [string, string][] = [
  ['#6A8FD4', '#1C2740'],
  ['#4D7FB0', '#16202E'],
  ['#5A8F8A', '#131F1E'],
  ['#7EC9A0', '#1D3830'],
  ['#B0705A', '#2A1712'],
]

export function gradientFor(title: string, type?: string): string {
  const palette = type === 'HOME_VIDEO' ? HOME_VIDEO_GRADIENTS : POSTER_GRADIENTS
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0
  }
  const [from, to] = palette[Math.abs(hash) % palette.length]
  return `linear-gradient(160deg, ${from}, ${to})`
}

/**
 * Artwork lives behind the API and the API wants a bearer token, which an
 * `<img src>` cannot carry — the browser sends its own headers and nothing else.
 * Verified against a live server: both the authenticated and the `public/`
 * poster routes answer 403 without one.
 *
 * So the bytes are fetched like any other request and handed to the element as
 * an object URL. That is the same arrangement the Android app makes for Coil,
 * which is given the API's own authed HTTP client rather than a bare one.
 *
 * Cached across mounts by URL, because a grid scrolling back up must not refetch
 * every tile — and revoked on eviction, since an object URL pins the blob in
 * memory until it is.
 */
const cache = new Map<string, string>()
const CACHE_LIMIT = 300

function remember(url: string, objectUrl: string) {
  cache.set(url, objectUrl)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) break
    const stale = cache.get(oldest)
    cache.delete(oldest)
    if (stale) URL.revokeObjectURL(stale)
  }
}

export function useArtwork(
  id: string | null,
  kind: 'poster' | 'backdrop',
  present: boolean | undefined,
): string | null {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    setSrc(null)
    if (!id || !present) return

    const url = api.artwork(id, kind)
    if (!url) return

    const hit = cache.get(url)
    if (hit) {
      setSrc(hit)
      return
    }

    let cancelled = false
    const state = api.getState()
    fetch(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(state.profileId ? { 'X-Profile-Id': state.profileId } : {}),
      },
    })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        // A 404 here is "this title has no artwork", which is ordinary, and a
        // gradient is the intended appearance rather than a failure state.
        if (!blob || cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        remember(url, objectUrl)
        setSrc(objectUrl)
      })
      .catch(() => {
        /* Same as no artwork. The gradient stands. */
      })

    return () => {
      cancelled = true
    }
  }, [id, kind, present])

  return src
}

interface ArtworkProps {
  id: string
  title: string
  type?: string
  kind?: 'poster' | 'backdrop'
  present?: boolean
  className?: string
}

export function Artwork({
  id,
  title,
  type,
  kind = 'poster',
  present,
  className,
}: ArtworkProps) {
  const src = useArtwork(id, kind, present)

  return (
    <div
      className={className}
      style={{ background: src ? undefined : gradientFor(title, type) }}
    >
      {src && <img src={src} alt="" loading="lazy" />}
    </div>
  )
}
