const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const fixture = JSON.parse(fs.readFileSync(process.env.FIXTURE, 'utf8'))
  const browser = await chromium.launch()
  const baseline = process.env.MODE === 'baseline'
  try {
    for (const width of [1200, 390]) {
      const page = await browser.newPage({viewport: {width, height: 750}})
      const logo = page.locator('.wpfa-event-logo-mark')
      assert.equal((await page.goto(fixture['with-logo'])).status(), 200)
      const image = logo.locator('img')
      await image.waitFor()
      assert.ok(await image.evaluate(async node => {
        await node.decode()
        return node.naturalWidth > 0
      }))
      const bg = await logo.evaluate(node => getComputedStyle(node).backgroundColor)
      assert.equal(bg, baseline ? 'rgba(255, 255, 255, 0.96)' : 'rgba(0, 0, 0, 0)')
      await page.screenshot({path: path.join(process.env.OUT, `${process.env.MODE}-logo-${width}.png`)})
      assert.equal((await page.goto(fixture['cleared-logo'])).status(), 200)
      assert.equal(await logo.count(), baseline ? 1 : 0)
      await page.screenshot({path: path.join(process.env.OUT, `${process.env.MODE}-cleared-${width}.png`)})
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
main().catch(error => {console.error(error); process.exitCode = 1})
