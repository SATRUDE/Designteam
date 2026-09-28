import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import sharp from "sharp";
import { capturePage, isValidUrl } from "../lib/core/capture.mjs";

let server;
let browser;
let baseUrl;

before(async () => {
  server = createServer((request, response) => {
    if (["/inner-scroll", "/nested-scroll", "/wide-scroll"].includes(request.url)) {
      const nested = request.url === "/nested-scroll";
      response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html>
        <style>
          html, body { margin: 0; height: 100%; overflow: hidden; }
          #app { height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
          header { height: 60px; flex-shrink: 0; background: blue; }
          footer { height: 40px; flex-shrink: 0; background: blue; }
          main { ${nested ? 'flex: 1; min-height: 0;' : 'height: 100vh;'} overflow: auto; }
          .first { height: 1000px; background: red; }
          .last { height: 1000px; background: lime; }
          ${request.url === '/wide-scroll' ? '.first, .last { width: 1600px; }' : ''}
        </style>
        ${nested ? '<div id="app"><header></header>' : ''}
        <main><div class="first"></div><div class="last"></div></main>
        ${nested ? '<footer></footer></div>' : ''}`);
      return;
    }
    if (request.url === "/consent") {
      response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html>
        <style>body { margin: 0; background: lime; } #consent { position: fixed; inset: 0; background: red; }</style>
        <div id="consent" role="dialog"><button id="accept" onclick="document.getElementById('consent').remove()">Accept</button></div>`);
      return;
    }
    if (request.url === "/missing") {
      response.writeHead(404).end("Missing");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<!doctype html><html><head><style>
      body { margin: 0; }
      header { position: fixed; top: 0; background: red; height: 60px; width: 100%; }
      main { padding-top: 60px; }
      .section { height: 700px; }
      [data-state="closed"] { position: fixed; inset: 0; background: black; }
    </style></head><body>
      <header><nav><a href="/">Home</a></nav></header>
      <main><div class="section">First</div><div class="section">Last</div></main>
      <div role="dialog" data-state="closed">Closed drawer</div>
    </body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("URL validation accepts only HTTP(S)", () => {
  assert.equal(isValidUrl("https://example.com/path"), true);
  assert.equal(isValidUrl("http://localhost:3000"), true);
  assert.equal(isValidUrl("file:///tmp/page.html"), false);
  assert.equal(isValidUrl("not a url"), false);
});

test("captures desktop and mobile PNGs and closes each page", async () => {
  for (const mode of ["desktop", "mobile"]) {
    const png = await capturePage(browser, baseUrl, mode);
    assert.ok(Buffer.isBuffer(png));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.ok(png.length > 1000);
    assert.equal(browser.contexts().length, 0);
  }
});

test("reports HTTP errors and closes the page", async () => {
  await assert.rejects(capturePage(browser, `${baseUrl}/missing`, "desktop"), /HTTP 404/);
  assert.equal(browser.contexts().length, 0);
});

test("captures the bottom of inner scrolling pages, including clipped flex ancestors", async () => {
  for (const mode of ["desktop", "mobile"]) {
    for (const route of ["/inner-scroll", "/nested-scroll", "/wide-scroll"]) {
      const png = await capturePage(browser, `${baseUrl}${route}`, mode);
      const { width, height } = await sharp(png).metadata();
      assert.equal(width, mode === "desktop" ? 1280 : 400);
      assert.equal(height, route === "/nested-scroll" ? 2100 : 2000);
      const bottom = await sharp(png).extract({ left: 100, top: height - 50, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
      assert.deepEqual([...bottom], [0, 255, 0], "Bottom content must be visible, not just a taller blank image");
      assert.equal(browser.contexts().length, 0);
    }
  }
});

test("honours cookie dismissal and reports an unusable selector instead of success", async () => {
  const png = await capturePage(browser, `${baseUrl}/consent`, "desktop", { cookieSelector: "#accept" });
  const pixel = await sharp(png).extract({ left: 100, top: 100, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixel], [0, 255, 0]);
  await assert.rejects(
    capturePage(browser, `${baseUrl}/consent`, "desktop", { cookieSelector: "#wrong-accept" }),
    /Cookie dismissal failed/,
  );
  assert.equal(browser.contexts().length, 0);
});
