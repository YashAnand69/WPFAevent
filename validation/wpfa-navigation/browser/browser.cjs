const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const fixture = JSON.parse(fs.readFileSync(process.env.WPFA_FIXTURE, 'utf8'));
const mode = process.env.WPFA_MODE;
const theme = process.env.WPFA_THEME;
const themeType = theme === 'twentytwentyone' ? 'classic' : 'block';
const output = process.env.WPFA_OUTPUT;
assert(['baseline', 'fixed'].includes(mode));
fs.mkdirSync(output, {recursive: true});
const report = {mode, theme, themeType, checks: [], visits: [], pageErrors: [], consoleErrors: [], failedLocalRequests: [], blockedExternalRequests: []};
let page;
const browser = awaitableMain();
async function awaitableMain() {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
      const label = viewport.width > 600 ? 'wide' : 'narrow';
      const context = await browser.newContext({viewport, reducedMotion: 'no-preference'});
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(fixture.home).origin) {
          report.blockedExternalRequests.push(url.href);
          await route.abort();
        } else await route.continue();
      });
      await context.addInitScript(() => {
        window.__navProbe = {scrolls: [], clicks: []};
        const nativeScroll = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function(options) {
          window.__navProbe.scrolls.push({id: this.id, options});
          return nativeScroll.call(this, options);
        };
      });
      page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
      page.on('requestfailed', request => { if (request.url().startsWith(fixture.home)) report.failedLocalRequests.push({url: request.url(), failure: request.failure()}); });
      page.on('response', response => {
        if (response.url().startsWith(fixture.home) && response.status() >= 400) {
          report.failedLocalRequests.push({url: response.url(), status: response.status()});
        }
      });
      await check(`global-${label}`, false, async () => {
        await visit(fixture.home);
        await screenshot(`global-${label}`);
        const header = page.locator('.nav .nav-links-main');
        const text = await header.innerText();
        for (const label of ['Upcoming Events', 'Past Events', 'Code of Conduct']) assert(text.includes(label), text);
        assert(!text.includes('Event overview'), text);
      });
      await check(`event-header-${label}`, true, async () => {
        await visit(fixture.event);
        await screenshot(`event-${label}`);
        const text = await page.locator('.nav .nav-links-main').innerText();
        assert(text.includes('Event overview') && text.includes('Event details'), text);
        assert(!text.includes('Upcoming Events'), text);
        assert.equal(await page.locator('.nav .nav-links-main .nav-dropdown').count(), 1);
        assert.equal(await page.locator('.nav .nav-links-secondary .btn-secondary').count(), 1);
      });
      await check(`custom-header-${label}`, true, async () => {
        await visit(fixture.custom);
        await screenshot(`custom-${label}`);
        const overview = page.locator('.nav .nav-links-main a').filter({hasText: /^Event overview$/});
        assert.equal(await overview.getAttribute('href'), fixture.event + '#about');
        const dropdownOverview = page.locator('.nav .nav-links-main .nav-dropdown-content a').filter({hasText: /^Overview again$/});
        assert.equal(await dropdownOverview.getAttribute('href'), fixture.event + '#about');
        assert.equal(await page.locator('.nav .nav-links-main .nav-dropdown.active').count(), 1);
        assert.equal(await page.locator('.nav .nav-links-secondary .btn-secondary').count(), 1);
      });
      if (mode === 'fixed') {
        await check(`smooth-fallback-${label}`, false, async () => {
          await prepare('auto');
          await details().click();
          await assertScroll('smooth');
          await screenshot(`smooth-target-${label}`);
        });
        await check(`keyboard-fallback-${label}`, false, async () => {
          await prepare('auto');
          await details().focus();
          await page.keyboard.press('Enter');
          await assertScroll('smooth');
        });
        await check(`reduced-motion-${label}`, false, async () => {
          await page.emulateMedia({reducedMotion: 'reduce'});
          await prepare('smooth');
          await details().click();
          await assertScroll('instant');
          await page.emulateMedia({reducedMotion: 'no-preference'});
        });
        await check(`native-css-smooth-${label}`, false, async () => {
          await prepare('smooth');
          await details().click();
          await assertTargetVisible();
          const probe = await page.evaluate(() => window.__navProbe);
          assert.equal(probe.scrolls.length, 0, 'native CSS branch must not call plugin scrollIntoView');
          assert.equal(probe.clicks.at(-1).prevented, false, 'native anchor default must remain enabled');
          assert(new URL(page.url()).hash === '#custom-section-details');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'custom-section-details');
        });
        await check(`keyboard-native-css-${label}`, false, async () => {
          await prepare('smooth');
          await details().focus();
          await page.keyboard.press('Enter');
          await assertTargetVisible();
          assert.equal(await page.evaluate(() => document.activeElement.id), 'custom-section-details');
          assert.equal(await page.evaluate(() => window.__navProbe.scrolls.length), 0);
          assert.equal(new URL(page.url()).hash, '#custom-section-details');
          await page.keyboard.press('Tab');
          assert.equal(await page.locator('#custom-section-details').getAttribute('tabindex'), null);
        });
        await check(`rejected-history-${label}`, false, async () => {
          await prepare('auto');
          await page.evaluate(() => { history.pushState = () => { throw new DOMException('Injected rejected history update', 'SecurityError'); }; });
          await details().click();
          await assertTargetVisible();
          assert.equal(await page.evaluate(() => document.activeElement.id), 'custom-section-details');
          assert.equal(await page.evaluate(() => window.__navProbe.scrolls.at(-1).options.behavior), 'smooth');
          assert.equal(await page.evaluate(() => window.__navProbe.clicks.at(-1).prevented), true);
        });
        await check(`cross-page-${label}`, false, async () => {
          await visit(fixture.event);
          const dropdown = page.locator('.nav .nav-links-main .nav-dropdown');
          await dropdown.locator('button').click();
          const travel = dropdown.locator('a').filter({hasText: /^Travel$/});
          await Promise.all([page.waitForURL(url => url.searchParams.get('custom_page') === 'travel'), travel.click()]);
          assert.equal(new URL(page.url()).searchParams.get('custom_page'), 'travel');
          const overview = page.locator('.nav .nav-links-main a').filter({hasText: /^Event overview$/});
          await Promise.all([page.waitForURL(url => !url.searchParams.has('custom_page') && url.hash === '#about'), overview.click()]);
          assert.equal(new URL(page.url()).hash, '#about');
        });
        if (label === 'wide') {
          await check('control-click-native-tab', false, async () => {
            await prepare('auto');
            const nextPage = context.waitForEvent('page');
            await details().click({modifiers: ['Control']});
            const popup = await nextPage;
            await popup.waitForURL(url => url.hash === '#custom-section-details' && url.origin === new URL(fixture.home).origin);
            await popup.waitForLoadState('domcontentloaded');
            assert.equal(new URL(popup.url()).hash, '#custom-section-details');
            assert.equal(new URL(page.url()).hash, '');
            assert.equal((await page.evaluate(() => window.__navProbe.clicks)).at(-1).prevented, false);
            await popup.close();
          });
          await check('named-target-native-tab', false, async () => {
            await prepare('auto');
            await details().evaluate(link => { link.target = 'wpfa-validation-target'; });
            const nextPage = context.waitForEvent('page');
            await details().click();
            const popup = await nextPage;
            await popup.waitForURL(url => url.hash === '#custom-section-details' && url.origin === new URL(fixture.home).origin);
            await popup.waitForLoadState('domcontentloaded');
            assert.equal(new URL(popup.url()).hash, '#custom-section-details');
            assert.equal(new URL(page.url()).hash, '');
            assert.equal((await page.evaluate(() => window.__navProbe.clicks)).at(-1).prevented, false);
            await popup.close();
          });
        }
      }
      await context.close();
    }
    report.unexpectedFailures = report.checks.filter(check => !check.ok && !(mode === 'baseline' && check.expectedRegression));
    report.baselineRegressions = report.checks.filter(check => !check.ok && check.expectedRegression);
    report.baseline_reproduced = mode === 'baseline' && report.baselineRegressions.length === 4 && report.unexpectedFailures.length === 0;
    assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
    assert.equal(report.failedLocalRequests.length, 0, JSON.stringify(report.failedLocalRequests));
    if (mode === 'baseline') assert(report.baseline_reproduced, 'baseline must reproduce four real header failures and pass global controls');
    else assert.equal(report.unexpectedFailures.length, 0, JSON.stringify(report.unexpectedFailures));
    report.success = true;
  } catch (error) {
    report.success = false;
    report.fatalError = String(error.stack || error);
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
async function visit(url) {
  const response = await page.goto(url, {waitUntil: 'domcontentloaded'});
  assert(response && response.status() === 200, `HTTP ${response && response.status()} for ${url}`);
  report.visits.push({requested: url, resolved: page.url()});
  await page.locator('.nav .nav-links-main').waitFor();
  if (mode === 'fixed') await page.waitForFunction(type => window.wpfaeventPublic?.themeType === type, themeType);
  await page.evaluate(() => {
    document.addEventListener('click', event => {
      const anchor = event.target.closest('a');
      if (anchor) queueMicrotask(() => window.__navProbe.clicks.push({href: anchor.href, prevented: event.defaultPrevented}));
    });
  });
}
function details() { return page.locator('.nav .nav-links-main a').filter({hasText: /^Event details$/}); }
async function prepare(behavior) {
  await visit(fixture.event);
  await page.addStyleTag({content: `html, body {scroll-behavior:${behavior} !important}`});
  const computed = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).scrollBehavior,
    scrolling: getComputedStyle(document.scrollingElement).scrollBehavior,
  }));
  assert.equal(computed.html, behavior);
}
async function assertTargetVisible() {
  await page.waitForFunction(() => {
    const target = document.getElementById('custom-section-details');
    const box = target.getBoundingClientRect();
    return window.scrollY > 300 && box.top < innerHeight && box.bottom > 0;
  });
}
async function assertScroll(behavior) {
  await assertTargetVisible();
  assert.equal(new URL(page.url()).hash, '#custom-section-details');
  const probe = await page.evaluate(() => ({
    calls: window.__navProbe.scrolls,
    focused: document.activeElement.id,
  }));
  assert.deepEqual(probe.calls.at(-1), {id: 'custom-section-details', options: {behavior}});
  assert.equal(probe.focused, 'custom-section-details');
}
async function screenshot(name) { await page.screenshot({path: path.join(output, `${name}.png`), fullPage: true}); }
async function check(name, expectedRegression, fn) {
  try { await fn(); report.checks.push({name, expectedRegression, ok: true}); }
  catch (error) {
    report.checks.push({name, expectedRegression, ok: false, error: String(error.stack || error)});
    if (page && !page.isClosed()) await screenshot(`failure-${name}`).catch(() => {});
  }
}
browser.catch(error => { console.error(error); process.exitCode = 1; });
