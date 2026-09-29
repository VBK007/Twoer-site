import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { useSession } from '../session/SessionContext'
import { AdSlot } from '../components/AdSlot'
import { PosterCard, TileSkeleton, shapeOf } from '../components/PosterCard'
import { TrackList } from '../components/TrackList'
import { MusicShelves } from '../components/MusicShelves'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type ItemSummaryDto,
  type MusicHomeDto,
} from '../api/types'

const PAGE_SIZE = 48

/**
 * Sorts the app offers, with the server's own parameter values. One chip
 * cycles through them, as on the phone, rather than a dropdown: four options
 * do not need a menu, and a chip sits in the row with the other filters
 * where a select never would.
 */
const SORTS = [
  { value: 'title', label: 'A–Z' },
  { value: 'added', label: 'Recently added' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'year', label: 'Newest first' },
]

export function Library() {
  const { signedIn } = useSession()

  const [category, setCategory] = useState<string | null>(null)
  const [sort, setSort] = useState('title')
  const [unwatched, setUnwatched] = useState(false)
  const [fourKOnly, setFourKOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  const [items, setItems] = useState<ItemSummaryDto[]>([])
  const [page, setPage] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [appending, setAppending] = useState(false)
  const [failed, setFailed] = useState(false)

  // Typing is not a request. A 2,819-title library behind a home tunnel does
  // not want one round trip per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  // A filter change starts the list again from the top; a page change appends.
  // Splitting them is what stops "show more" from being undone by a re-fetch
  // of page 0 every time any control moves.
  useEffect(() => {
    setPage(0)
  }, [category, sort, unwatched, fourKOnly, debounced])

  useEffect(() => {
    let cancelled = false
    if (page === 0) setLoading(true)
    else setAppending(true)

    api
      .browse({
        // The chip says "Erotic"; the wire still says ADULT. The label and the
        // category name are deliberately allowed to differ.
        category: category ?? 'all',
        q: debounced || undefined,
        sort,
        unwatched: unwatched || undefined,
        minHeight: fourKOnly ? 2000 : undefined,
        page,
        size: PAGE_SIZE,
      })
      .then((result) => {
        if (cancelled) return
        setItems((previous) =>
          page === 0 ? result.items : [...previous, ...result.items],
        )
        setTotalItems(result.totalItems)
        setTotalPages(result.totalPages)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setAppending(false)
      })

    return () => {
      cancelled = true
    }
  }, [category, sort, unwatched, fourKOnly, debounced, page])

  const filtered = category !== null || unwatched || fourKOnly || debounced !== ''

  /*
   * Music gets its own register.
   *
   * Not a decoration — the palette in ui/theme/Color.kt already assigns this
   * category its own colour ("MediaPink — music + photos category"), so the
   * shelf is only being dressed in something the design system already owned.
   * Inside this mode MediaPink stands in for amber wholesale, so every accent
   * that reads from `--amber` follows without being listed twice.
   *
   * It also changes what is drawn. The app's Music tab is shelves, not a
   * grid — by mood, activity, era and who made them — and the same shelves
   * are drawn here for anyone signed in. A search still gets a list, because
   * shelves are not searchable; a visitor gets a list, because the shelves
   * route needs an account.
   */
  const musicMode = category === 'MUSIC'
  const shelves = musicMode && signedIn && debounced === ''

  const [home, setHome] = useState<MusicHomeDto | null>(null)
  const [homeLoading, setHomeLoading] = useState(false)
  useEffect(() => {
    if (!shelves) return
    let cancelled = false
    setHomeLoading(true)
    api
      .musicHome(20)
      .then((result) => {
        if (!cancelled) setHome(result)
      })
      .catch(() => {
        if (!cancelled) setHome(null)
      })
      .finally(() => {
        if (!cancelled) setHomeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [shelves])

  const sortIndex = Math.max(0, SORTS.findIndex((option) => option.value === sort))
  const cycleSort = () => setSort(SORTS[(sortIndex + 1) % SORTS.length].value)

  // One shape for the whole grid rather than per tile. A grid of mixed 2:3 and
  // 1:1 boxes packs into a ragged mess; when a category is selected its own
  // shape is the right one, and "All" stays on posters.
  const gridShape = useMemo(() => (category ? shapeOf(category) : 'poster'), [category])

  return (
    <div className="view" data-mode={musicMode ? 'music' : undefined}>
      <header className="lib-head">
        <div>
          <h1 className="view-title">{musicMode ? 'Music' : 'Library'}</h1>
          <span className="mono lib-count">
            {loading
              ? 'Counting…'
              : `${totalItems.toLocaleString()} ${filtered ? 'matching' : 'titles'}`}
          </span>
        </div>

        <Search value={query} onChange={setQuery} />
      </header>

      {/* Two chip rows, typeset differently, as on the phone: categories are
          words a person chose (Archivo), filters name measured properties
          (mono). That is the two-typeface rule in one screen. */}
      <div className="toolbar">
        <div className="chips">
          <Chip on={category === null} onClick={() => setCategory(null)}>
            All
          </Chip>
          {CATEGORIES.map((value) => (
            <Chip
              key={value}
              on={category === value}
              onClick={() => setCategory(category === value ? null : value)}
            >
              {CATEGORY_LABELS[value]}
            </Chip>
          ))}
        </div>

        {/* Hidden for music. "4K only" and "Unwatched" are questions about
            video, and a sort order means nothing on a screen of shelves. */}
        {!musicMode && (
          <div className="chips chips--filters">
            {/* Both are questions about a profile or a quality field the
                public catalogue does not carry. Offered once there is an
                account, rather than shown and quietly ignored. */}
            {signedIn && (
              <>
                <Chip on={unwatched} onClick={() => setUnwatched(!unwatched)} mono>
                  Unwatched
                </Chip>
                <Chip on={fourKOnly} onClick={() => setFourKOnly(!fourKOnly)} mono>
                  4K only
                </Chip>
              </>
            )}
            <Chip on={false} onClick={cycleSort} mono menu>
              {SORTS[sortIndex].label}
            </Chip>
          </div>
        )}
      </div>

      {failed && (
        <p className="field-error">
          The server did not answer that. It may have gone to sleep mid-browse.
        </p>
      )}

      <AdSlot placement="library" />

      {shelves ? (
        <MusicShelves home={home} loading={homeLoading} />
      ) : loading ? (
        musicMode ? (
          <div className="tracklist-skeleton" aria-busy="true">
            {Array.from({ length: 12 }, (_, i) => (
              <span className="skeleton-line" key={i} />
            ))}
          </div>
        ) : (
          <div className={`grid grid--${gridShape}`} aria-busy="true">
            {Array.from({ length: 18 }, (_, i) => (
              <TileSkeleton key={i} shape={gridShape} />
            ))}
          </div>
        )
      ) : items.length === 0 && !failed ? (
        <Empty
          query={debounced}
          onClear={() => {
            setQuery('')
            setCategory(null)
            setUnwatched(false)
            setFourKOnly(false)
          }}
        />
      ) : musicMode ? (
        <TrackList items={items} />
      ) : (
        <div className={`grid grid--${gridShape}`}>
          {items.map((item) => (
            <PosterCard key={item.id} item={item} personal={signedIn} queue={items} />
          ))}
        </div>
      )}

      {!shelves && !loading && page + 1 < totalPages && (
        <div className="grid-more">
          <button
            className="btn btn-outline"
            onClick={() => setPage(page + 1)}
            disabled={appending}
          >
            {appending ? 'Loading…' : 'Show more'}
          </button>
          <span className="mono">
            {items.length.toLocaleString()} of {totalItems.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}

function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null)

  // `/` to search, Escape to clear — the shortcut every library on the web
  // has, and the one thing that makes 2,819 titles navigable with a keyboard.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'SELECT'
      if (event.key === '/' && !typing) {
        event.preventDefault()
        input.current?.focus()
      }
      if (event.key === 'Escape' && document.activeElement === input.current) {
        onChange('')
        input.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onChange])

  return (
    <div className="search">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M16 16l5 5" />
      </svg>
      <input
        ref={input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search the library"
        aria-label="Search the library"
        spellCheck={false}
      />
      {value ? (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
          ×
        </button>
      ) : (
        <kbd className="mono">/</kbd>
      )}
    </div>
  )
}

function Empty({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="empty card">
      <span className="mono">Nothing here</span>
      <p>
        {query
          ? `No title matches “${query}”. The search looks at what is on the disk, not at the internet.`
          : 'Nothing in the library matches those filters.'}
      </p>
      <button className="btn btn-outline" onClick={onClear}>
        Clear filters
      </button>
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
  mono,
  menu,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  mono?: boolean
  /** A chip that cycles a choice rather than toggling one: it gets a chevron. */
  menu?: boolean
}) {
  return (
    <button
      type="button"
      className={`chip${on ? ' chip--on' : ''}${mono ? ' mono' : ''}${menu ? ' chip--menu' : ''}`}
      aria-pressed={menu ? undefined : on}
      onClick={onClick}
    >
      {children}
      {menu && (
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </button>
  )
}
