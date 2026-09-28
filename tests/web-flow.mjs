// Run against a local production server: DESIGNTEAM_WEB_URL=http://127.0.0.1:3467 node tests/web-flow.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import sharp from 'sharp';

const appUrl = process.env.DESIGNTEAM_WEB_URL;
if (!appUrl) throw new Error('Set DESIGNTEAM_WEB_URL to the running local app');
let origin;
const fixture = createServer((req, res) => {
  if (req.url === '/robots.txt') return res.end(`Sitemap: ${origin}/sitemap.xml`);
  if (req.url === '/sitemap.xml') return res.writeHead(200, { 'content-type': 'application/xml' }).end(`<urlset><url><loc>${origin}/only-in-sitemap</loc></url></urlset>`);
  if (req.url === '/sitemap_index.xml') return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': 'text/html' }).end(`<body style="margin:0;background:lime"><h1>Screenshot fixture</h1><div id="onetrust-banner-sdk" style="position:fixed;inset:0;background:red">Cookies<button onclick="this.parentElement.remove()">Reject all</button></div></body>`);
});
fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
origin = `http://127.0.0.1:${fixture.address().port}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(appUrl);
  await page.getByPlaceholder('https://example.com').fill(origin);
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await page.getByLabel(`${origin}/only-in-sitemap`, { exact: true }).check();
  await page.getByRole('button', { name: 'Take screenshots (1)', exact: true }).click();
  await page.getByRole('heading', { name: 'Choose viewports to capture' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Override automatic cookie dismissal' }).count(), 0);
  await page.getByLabel('Mobile (400px wide)', { exact: false }).check();
  await page.getByLabel('Also find top colours', { exact: false }).uncheck();
  const captureResponse = page.waitForResponse(r => r.url().endsWith('/api/screenshots'));
  await page.getByRole('button', { name: 'Start screenshots' }).click();
  const response = await captureResponse;
  const stream = await response.text();
  const event = stream.split('\n\n').find(s => s.startsWith('event: screenshot'));
  const result = JSON.parse(event.split('\ndata: ')[1]);
  assert.equal(result.error, undefined);
  for (const mode of ['desktop', 'mobile']) {
    const pixel = await sharp(Buffer.from(result.images[mode], 'base64')).extract({ left: 200, top: 200, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert.deepEqual([...pixel], [0, 255, 0], `${mode} banner should be gone`);
  }
  await page.getByRole('heading', { name: 'Screenshots', exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/designteam-real-capture.png', fullPage: true });
  console.log('PASS: real sitemap-only discovery → viewport selection → automatic cookie dismissal → desktop/mobile PNGs');

  const links = Array.from({ length: 25 }, (_, i) => ({ url: `${origin}/page-${i}`, label: `Page ${i}` }));
  await page.route('**/api/crawl', route => route.fulfill({ json: { links, warnings: ['Discovery incomplete: fixture warning'] } }));
  const batches = [];
  const png = result.images.mobile;
  await page.route('**/api/screenshots', async route => {
    const body = route.request().postDataJSON(); batches.push(body);
    const failed = batches.length === 1 ? 1 : 0;
    const sse = body.urls.map((url, i) => `event: screenshot\ndata: ${JSON.stringify({ url, images: { desktop: png }, ...(failed && i === 0 ? { error: 'mobile: fixture failure' } : {}) })}\n\n`).join('') + `event: done\ndata: ${JSON.stringify({ total: body.urls.length, completed: body.urls.length, failed })}\n\n`;
    await route.fulfill({ contentType: 'text/event-stream', body: sse });
  });
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await page.getByText('Discovery incomplete: fixture warning').waitFor();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/designteam-mobile-selection.png', fullPage: true });
  await page.getByRole('button', { name: 'Take screenshots (25)', exact: true }).click();
  await page.getByRole('button', { name: 'Start screenshots' }).click();
  await page.getByRole('heading', { name: 'Screenshots', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('img[alt]').length >= 25);
  assert.deepEqual(batches.map(b => b.urls.length), [20, 5]);
  assert.equal(batches.some(b => 'cookieSelector' in b), false);
  await page.getByText('mobile: fixture failure', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: 25 selections batched 20+5, warnings retained, partial-mode errors visible, no browser exceptions');
} finally {
  await browser.close(); fixture.close(); fixture.closeAllConnections();
}
