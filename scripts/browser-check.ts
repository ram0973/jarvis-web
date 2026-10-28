import { chromium } from 'playwright-core'

// Smoke-check a page in a real browser: prints what the user sees, every console error, and exits 1 when the error
// boundary took over. Uses the installed Chrome/Edge (`channel`) instead of downloading a browser.
const url = process.argv[2] ?? 'http://localhost:3001/'
const channel = process.env.BROWSER_CHANNEL ?? 'chrome'

const browser = await chromium.launch({ channel, headless: true })
const page = await browser.newPage()
const errors: string[] = []

page.on('console', (message) => {
  if (message.type() === 'error') {
    errors.push(`[console.error] ${message.text()}`)
  }
})
page.on('pageerror', (error) => {
  errors.push(`[pageerror] ${error.stack ?? error.message}`)
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const text = await page.locator('body').innerText()
const broken = /something went wrong/i.test(text)

console.log(`checked: ${url}`)
console.log(`visible: ${JSON.stringify(text.slice(0, 240))}`)
if (errors.length > 0) {
  console.log(`--- errors (${errors.length}) ---`)
  console.log(errors.join('\n\n'))
}

await browser.close()

if (errors.length > 0 || broken) {
  process.exitCode = 1
}
