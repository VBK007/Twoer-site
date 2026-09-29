/**
 * Drives the built site in a real browser.
 *
 * Not a test suite — a smoke run that proves the pages render, the router
 * works, and a visitor with no account can reach the library. Console errors
 * and failed requests are collected and printed, because a React page that
 * throws still serves a 200 and an empty <div id="root">.
 *
 * Usage:  node scripts/smoke.mjs [siteUrl]
 */
import { chromium } from 'playwright'

const site = process.argv[2] ?? 'http://localhost:4173'

const browser = await chromium.launch()
// Fresh context: nothing remembered, which is the visit that matters.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('requestfailed', (r) =>
  problems.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText}`),
)

const shot = async (name) => {
  await page.screenshot({ path: `shots/${name}.png` })
  console.log(`  shot → shots/${name}.png`)
}

console.log(`\n▸ Landing  ${site}/`)
await page.goto(`${site}/`, { waitUntil: 'networkidle' })
console.log('  title:', await page.title())
console.log('  h1:', (await page.locator('h1').first().innerText()).replace(/\n/g, ' / '))
await shot('01-landing')

console.log('\n▸ Plan demo toggle')
await page.getByRole('button', { name: 'Will transcode' }).click()
console.log('  state:', await page.locator('.plan-state').innerText())
await page.getByRole('button', { name: 'Direct play' }).click()
console.log('  state:', await page.locator('.plan-state').innerText())

console.log('\n▸ Open in browser — no account, no address typed')
await page.getByRole('link', { name: /open it in this browser/i }).click()
await page.waitForTimeout(5000)
console.log('  landed on:', new URL(page.url()).pathname)
// Home leads with the spotlight, so its h1 is the title of a real item rather
// than a page heading. Library is the one with a .view-title.
console.log('  spotlight:', await page.locator('.spotlight-body h1').innerText().catch(() => '—'))
console.log('  rails:', await page.locator('.rail-block').count())
console.log('  tiles rendered:', await page.locator('.tile').count())
await shot('06-anon-home')

console.log('\n▸ Library, still with no account')
await page.getByRole('link', { name: 'Library' }).click()
// Skeletons are `.tile` too, so wait for a real link rather than a fixed delay —
// the tunnel round-trip is often longer than any number picked in advance.
await page.locator('a.tile').first().waitFor({ timeout: 30000 })
console.log('  tiles:', await page.locator('a.tile').count())
console.log('  chips:', await page.locator('.chip').allInnerTexts())
await shot('07-anon-library')

console.log('\n▸ Open a title')
await page.locator('a.tile').first().click()
await page.waitForTimeout(3500)
console.log('  path:', new URL(page.url()).pathname.slice(0, 16) + '…')
console.log('  title:', await page.locator('.detail h1').innerText().catch(() => '—'))
await shot('08-anon-detail')

console.log('\n▸ Press Play — this is where an account should be asked for')
await page.getByRole('link', { name: /^(Play|Resume)$/ }).click()
await page.waitForTimeout(2500)
console.log('  landed on:', new URL(page.url()).pathname)
console.log('  heading:', await page.locator('.pane-card h1').innerText().catch(() => '—'))
await shot('09-signin-gate')

console.log('\n▸ Create account is a visible choice, not a footnote')
const createAccount = page.getByRole('button', { name: /create account/i })
const box = await createAccount.boundingBox()
console.log('  control size:', box ? `${Math.round(box.width)}×${Math.round(box.height)}` : 'missing')
await createAccount.click()
await page.waitForTimeout(300)
console.log('  heading:', await page.locator('.pane-card h1').innerText())
console.log('  fields:', (await page.locator('.field span').allInnerTexts()).join(', '))
await shot('10-create-account')

console.log('\n▸ Is the server address visible anywhere?')
const body = await page.locator('body').innerText()
const leaked = /trycloudflare|ngrok|192\.168\.|https?:\/\/[a-z0-9-]+\./i.exec(body)
console.log('  leak:', leaked ? leaked[0] : 'none')

console.log('\n── problems ──')
console.log(problems.length ? problems.join('\n') : 'none')

await browser.close()
