/**
 * Captures Browse and Library at desktop and phone widths, so the two layouts
 * can be looked at rather than assumed.
 *
 * Usage:  node scripts/shots.mjs [siteUrl]
 */
import { chromium } from 'playwright'

const site = process.argv[2] ?? 'http://localhost:4173'
const browser = await chromium.launch()

const problems = []

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 950 }],
  ['phone', { width: 402, height: 860 }],
]) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name} console: ${m.text()}`))

  await page.goto(`${site}/browse`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  await page.screenshot({ path: `shots/ui-${name}-browse.png` })
  console.log(`${name} browse — rails:`, await page.locator('.rail-block').count(),
    'tiles:', await page.locator('.tile').count())

  await page.goto(`${site}/library`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  await page.screenshot({ path: `shots/ui-${name}-library.png` })
  console.log(`${name} library — tiles:`, await page.locator('.tile').count(),
    'search:', await page.locator('.search input').count())

  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `shots/ui-${name}-music.png` })
  console.log(`${name} music — rows:`, await page.locator('.tracklist li').count(),
    'accent:', await page.locator('.view[data-mode="music"]')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--amber').trim())
      .catch(() => 'not set'))

  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `shots/ui-${name}-music-grid.png` })
  console.log(`${name} music grid — tiles:`, await page.locator('.tile').count())

  // A film rather than whatever sorts first, which is an untitled MP3.
  await page.goto(
    `${site}/title/b30b86a7-49c1-4afb-96da-f0fe1a6636a3`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForTimeout(8000)
  await page.screenshot({ path: `shots/ui-${name}-detail.png`, fullPage: true })
  console.log(`${name} detail —`, await page.locator('.detail h1').innerText().catch(() => '—'))

  await context.close()
}

console.log('\nproblems:', problems.length ? problems.join('\n') : 'none')
await browser.close()
