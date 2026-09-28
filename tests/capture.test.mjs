import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { capturePage, isValidUrl } from "../lib/core/capture.mjs";

let server;
let browser;
let baseUrl;

before(async () => {
  server = createServer((request, response) => {
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
