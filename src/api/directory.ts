import { TOWER } from '../config'

/**
 * Where Tower says it can be found today.
 *
 * The browser half of ServerDirectory.kt, reading the same Firestore document
 * over the same REST API. A home server behind a tunnel does not keep its
 * address — a quick Cloudflare tunnel is a new hostname every restart — so an
 * address baked into a build is right until the first time it is not.
 *
 * Null for every way this can fail: no project configured, no document, no
 * network, a rule that refuses. The caller's next move is the same in all of
 * them — carry on with the address it already had. This is a hint, and a hint
 * that cannot be fetched is simply absent.
 *
 * Nothing here writes. A client that could rewrite the directory is a client
 * that can point every other device in the house at an address of its choosing.
 */
export async function lookupPublishedAddress(): Promise<string | null> {
  const { projectId, apiKey, databaseId, documentPath } = TOWER.directory
  if (!projectId || !apiKey || !databaseId) return null

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/${databaseId}/documents/${documentPath}?key=${apiKey}`

  try {
    const response = await fetch(url)
    // Logged as a status, never as the URL: the query string carries the key.
    if (!response.ok) {
      console.info(`ServerDirectory: Firestore said ${response.status}`)
      return null
    }
    const body = await response.json()
    return baseUrlFrom(body)
  } catch (cause) {
    console.info('ServerDirectory: lookup failed —', cause)
    return null
  }
}

/**
 * The address out of a Firestore document, or null if there is not a usable one.
 *
 * Separate from the fetch so the shape can be tested without a network. The
 * scheme check is what stops a half-filled document — someone typing the
 * hostname without `https://` — from being adopted and stranding every device
 * that took it.
 */
export function baseUrlFrom(document: unknown): string | null {
  const value = (document as { fields?: { baseUrl?: { stringValue?: string } } })
    ?.fields?.baseUrl?.stringValue
  if (typeof value !== 'string') return null

  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : null
}
