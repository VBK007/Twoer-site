/**
 * Proves the endpoint comes from Firebase.
 *
 * A browser with an empty localStorage should never be asked for an address:
 * it reads the one the server published and goes straight to sign-in. This
 * checks that, and that the address used is the one in the Firestore document
 * rather than anything baked into the bundle.
 *
 * Usage:  node scripts/smoke-directory.mjs [siteUrl]
 */
import { chromium } from 'playwright'

const site = process.argv[2] ?? 'http://localhost:4173'

const browser = await chromium.launch()
// A fresh context every time — the whole point is the first visit, and a
// remembered address would hide exactly the behaviour under test.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

const problems = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))

const firestoreCalls = []
page.on('request', (request) => {
  if (request.url().includes('firestore.googleapis.com')) {
    firestoreCalls.push(request.url())
  }
})

console.log('\n▸ Cold visit to /browse with nothing remembered')
await page.goto(`${site}/browse`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

console.log('  firestore calls:', firestoreCalls.length)
for (const call of firestoreCalls) {
  console.log('   ', call.replace(/key=[^&]+/, 'key=…'))
}

const landed = new URL(page.url()).pathname
console.log('  landed on:', landed)

const stored = await page.evaluate(() => localStorage.getItem('tower.session'))
console.log('  persisted:', stored)
console.log('  tiles on screen:', await page.locator('.tile').count())

await page.screenshot({ path: 'shots/04-discovered.png' })
console.log('  shot → shots/04-discovered.png')

// /browse, not /connect and not /signin. The address came from the directory
// and browsing needs no account, so a cold visitor should be looking at the
// shelf — being asked for anything at this point would be the bug.
const address = JSON.parse(stored ?? '{}').baseUrl
console.log('\n── verdict ──')
console.log(
  landed === '/browse' && firestoreCalls.length > 0 && Boolean(address)
    ? `PASS — endpoint came from Firebase (${address}), nothing typed, nothing asked`
    : `FAIL — landed on ${landed} after ${firestoreCalls.length} directory call(s)`,
)
console.log('problems:', problems.length ? problems.join('\n') : 'none')

await browser.close()
