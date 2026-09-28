import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { dismissCookieBanner } from '../lib/core/cookies.mjs';
import { capturePage } from '../lib/core/capture.mjs';

let browser, server, origin;
const banner = `<div id="onetrust-banner-sdk" style="position:fixed;inset:0;background:red">
  We use cookies.
  <button onclick="window.choice='accept';this.parentElement.remove()">Accept all</button>
  <button onclick="window.choice='reject';this.parentElement.remove()">Reject all</button>
</div>`;

before(async () => {
  server = createServer((req, res) => {
    const pages = {
      '/common': banner,
      '/generic': '<div role="dialog" style="position:fixed;inset:0;background:red">Vi bruker informasjonskapsler.<button onclick="this.parentElement.remove()">Godta alle</button></div>',
      '/unrelated': '<div role="dialog">Accept the invitation?<button onclick="window.clicked=true">Accept</button></div><footer>Cookie policy</footer>',
      '/unknown': '<div role="dialog">We use cookies.<button>Custom settings</button></div>',
      '/broken': '<div id="onetrust-banner-sdk">Cookies<button>Accept all</button></div>',
      '/persistent': '<div id="usercentrics-root"><button>Privacy settings</button><div role="dialog">Cookies<button onclick="this.parentElement.remove()">Reject all</button></div></div>',
      '/duplicate-manual': '<button class="accept" onclick="window.clicked=true">Accept</button><button class="accept" hidden>Accept</button>',
      '/delayed': `<script>setTimeout(()=>document.body.insertAdjacentHTML('beforeend',${JSON.stringify(banner)}),800)</script>`,
      '/shadow': `<div id="host"></div><script>document.querySelector('#host').attachShadow({mode:'open'}).innerHTML=${JSON.stringify(banner)}</script>`,
      '/iframe': '<iframe title="Cookie consent" style="position:fixed;inset:0;width:100%;height:100%" src="/cookie-frame"></iframe>',
      '/cookie-frame': '<p>Cookie preferences</p><button onclick="parent.document.querySelector(\'iframe\').remove()">Reject all</button>',
    };
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><body style="margin:0;background:lime">${pages[req.url] ?? ''}</body>`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server.close(); server.closeAllConnections(); });

async function onPage(route, fn) {
  const page = await browser.newPage();
  try { await page.goto(origin + route); await fn(page); }
  finally { await page.close(); }
}

test('automatically dismisses common banners, preferring rejection to acceptance', async () => {
  await onPage('/common', async page => {
    await dismissCookieBanner(page);
    assert.equal(await page.evaluate(() => window.choice), 'reject');
    assert.equal(await page.locator('#onetrust-banner-sdk').count(), 0);
  });
});

test('detects delayed, localised, shadow-DOM and iframe consent interfaces', async () => {
  for (const route of ['/delayed', '/generic', '/shadow', '/iframe']) {
    const png = await capturePage(browser, origin + route, 'mobile');
    const pixel = await sharp(png).extract({ left: 200, top: 200, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert.deepEqual([...pixel], [0, 255, 0], `${route} left a banner over the screenshot`);
  }
  assert.equal(browser.contexts().length, 0);
});

test('never clicks an unrelated Accept button and tolerates pages without banners', async () => {
  await onPage('/unrelated', async page => {
    await dismissCookieBanner(page);
    assert.equal(await page.evaluate(() => window.clicked), undefined);
    assert.equal(await page.getByRole('button', { name: 'Accept', exact: true }).count(), 1);
  });
});

test('reports detected banners without a working dismissal rather than claiming success', async () => {
  for (const route of ['/unknown', '/broken']) {
    await assert.rejects(capturePage(browser, origin + route, 'desktop'), /Automatic cookie dismissal/);
  }
  assert.equal(browser.contexts().length, 0);
});

test('a manual selector overrides the automatic reject preference', async () => {
  await onPage('/common', async page => {
    await dismissCookieBanner(page, 'button:has-text("Accept all")');
    assert.equal(await page.evaluate(() => window.choice), 'accept');
  });
});

test('persistent consent launchers do not count as an undismissed banner', async () => {
  await onPage('/persistent', async page => {
    await dismissCookieBanner(page);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Privacy settings' }).isVisible(), true);
  });
});

test('manual string selectors retain first-match compatibility', async () => {
  await onPage('/duplicate-manual', async page => {
    await dismissCookieBanner(page, '.accept');
    assert.equal(await page.evaluate(() => window.clicked), true);
  });
});
