import { api, type SessionState } from '../api/client'

/*
 * The page's side of public/sw.js: registers the worker and keeps it told
 * what the session is, so a `<video src>` or `<audio src>` pointed straight
 * at the server's stream route plays.
 *
 * Without a controlling worker the media element's requests go out bare and
 * the server answers 403. `streamingReady()` is how a player finds out which
 * world it is in before choosing how to play.
 */

interface Credentials {
  token: string | null
  profileId: string | null
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null

function credentialsOf(state: SessionState): Credentials {
  return { token: state.token, profileId: state.profileId }
}

function tell(worker: ServiceWorker | null | undefined) {
  worker?.postMessage({ type: 'tower:credentials', credentials: credentialsOf(api.getState()) })
}

function tellEveryone() {
  tell(navigator.serviceWorker.controller)
  registration?.then((reg) => {
    tell(reg?.active)
    tell(reg?.waiting)
    tell(reg?.installing)
  })
}

export function registerStreaming() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (registration) return

  registration = navigator.serviceWorker.register('/sw.js').catch(() => null)

  // A restarted worker has forgotten everything and asks.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'tower:credentials?' && event.ports[0]) {
      event.ports[0].postMessage({
        type: 'tower:credentials',
        credentials: credentialsOf(api.getState()),
      })
    }
  })

  navigator.serviceWorker.addEventListener('controllerchange', tellEveryone)
  api.subscribe(tellEveryone)
  registration.then(tellEveryone)
}

/**
 * Resolves true once a worker controls this page and has the current
 * session, and false if there will not be one: an old browser, a private
 * window that refuses workers, a registration that failed.
 *
 * A first visit is the interesting case. Registration is asynchronous and
 * the worker only takes over once activated, so this waits a moment for it
 * rather than declaring no worker on a page that will have one in 200ms.
 */
export async function streamingReady(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !registration) {
    return false
  }
  const reg = await registration
  if (!reg) return false

  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000)
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
  }
  if (!navigator.serviceWorker.controller) return false
  tellEveryone()
  return true
}
