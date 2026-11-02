const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.WPFA_FIXTURE, 'utf8'));
  const report = {mode: process.env.WPFA_MODE, probes: [], pageErrors: []};
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(fixture.home).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(String(error)));
    for (let i = 0; i < 4; i++) {
      await page.goto(fixture.event, {waitUntil: 'domcontentloaded'});
      const link = page.locator('.wpfa-event-section-nav a').filter({hasText: `Malformed URL probe ${i}`});
      if (!(await link.count())) { report.probes.push({index: i, omitted: true}); continue; }
      const info = await link.evaluate(anchor => {
        let parseError;
        try { new URL(anchor.href, location.href); } catch (error) { parseError = String(error); }
        return {attribute: anchor.getAttribute('href'), href: anchor.href, parseError};
      });
      const errorsBefore = report.pageErrors.length;
      await link.click({timeout: 5000}).catch(error => { info.clickError = String(error); });
      await page.waitForTimeout(100);
      report.probes.push({index: i, ...info, newPageErrors: report.pageErrors.slice(errorsBefore)});
    }
    assert.equal(report.pageErrors.length, 0, JSON.stringify(report));
    report.success = true;
  } catch (error) { report.success = false; report.error = String(error.stack || error); process.exitCode = 1; }
  finally { fs.writeFileSync(process.env.WPFA_MALFORMED_OUTPUT, JSON.stringify(report, null, 2)); await browser.close(); }
})();
