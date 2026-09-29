import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { TOWER } from '../config'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/**
 * The AdSense loader, fetched once and only once something is configured.
 *
 * Not in index.html: the download page is deliberately ad-free, and a script
 * tag there would load for every visitor who came for the APK and never opens
 * the client at all.
 */
let loaderRequested = false
function loadAdsense(client: string) {
  if (loaderRequested) return
  loaderRequested = true
  const script = document.createElement('script')
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`
  document.head.appendChild(script)
}

export type AdPlacement = keyof typeof TOWER.ads.slots

interface AdSlotProps {
  placement: AdPlacement
  className?: string
}

/**
 * One advertisement, in one of the client's named places.
 *
 * Three states, decided entirely by `config.ts`:
 *
 * - client and slot both set → a responsive AdSense unit, labelled as an ad
 *   because the surrounding page is somebody's own film library and a poster
 *   that is secretly a promotion would be a betrayal of that.
 * - nothing set and placeholders on → a dashed outline where the ad would go,
 *   so placements can be judged in a preview before there is an account.
 * - nothing set and placeholders off → nothing at all, not even a gap.
 *
 * Keyed on the path: AdSense fills an `<ins>` once, and a client-side
 * navigation that reused the same element would ask it to fill twice, which
 * it refuses with an error. A fresh element per page is a fresh request.
 */
export function AdSlot({ placement, className = '' }: AdSlotProps) {
  const { adsenseClient, slots, placeholders } = TOWER.ads
  const slot = slots[placement]
  const configured = Boolean(adsenseClient && slot)
  const { pathname } = useLocation()

  useEffect(() => {
    if (!configured) return
    loadAdsense(adsenseClient)
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // A blocker, or the loader has not arrived. The slot stays empty and
      // the page is none the worse for it.
    }
  }, [configured, adsenseClient, pathname])

  if (!configured) {
    if (!placeholders) return null
    return (
      <div className={`ad ad--${placement} ad--placeholder ${className}`} aria-hidden="true">
        <span className="mono">Advertisement</span>
      </div>
    )
  }

  return (
    <div className={`ad ad--${placement} ${className}`}>
      <span className="mono ad-label">Advertisement</span>
      <ins
        key={pathname}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={adsenseClient}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
