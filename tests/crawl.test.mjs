import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { crawlPage } from "../lib/core/crawl.mjs";

let browser;
let server;
let origin;

before(async () => {
  server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: "/nested/page.html" });
      response.end();
      return;
    }

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (request.url === "/nested/page.html") {
      response.end(`
        <nav><a href="child#first">Child</a></nav>
        <a href="child#second">Duplicate child</a>
        <a href="https://example.org/away">External</a>
        <a href="mailto:hello@example.org">Email</a>
        <a href="#local">Fragment</a>
      `);
    } else if (request.url === "/with-base") {
      response.end(`
        <base href="/site/">
        <footer><a href="article#one">Article</a></footer>
        <a href="article#two">Duplicate article</a>
        <a href="/absolute">Absolute</a>
      `);
    } else {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("uses redirected page URL for relative paths and filters duplicate or external links", async () => {
  const result = await crawlPage(browser, `${origin}/redirect`);
  assert.deepEqual(result, {
    links: [
      { url: `${origin}/nested/page.html`, label: "Homepage" },
      { url: `${origin}/nested/child`, label: "Child" },
    ],
  });
});

test("respects the document base URL", async () => {
  const result = await crawlPage(browser, `${origin}/with-base`);
  assert.deepEqual(result, {
    links: [
      { url: `${origin}/with-base`, label: "Homepage" },
      { url: `${origin}/site/article`, label: "Article" },
      { url: `${origin}/absolute`, label: "Absolute" },
    ],
  });
});

test("rejects non-web URLs before opening a page", async () => {
  await assert.rejects(crawlPage(browser, "file:///tmp/index.html"), TypeError);
});

test("rejects HTTP error pages", async () => {
  await assert.rejects(crawlPage(browser, `${origin}/missing`), /HTTP 404/);
});

test("closes the page when navigation fails", async () => {
  let closed = false;
  const failingBrowser = {
    async newPage() {
      return {
        async setViewportSize() {},
        async goto() { throw new Error("Navigation failed"); },
        async close() { closed = true; },
      };
    },
  };
  await assert.rejects(crawlPage(failingBrowser, `${origin}/missing`), /Navigation failed/);
  assert.equal(closed, true);
});
