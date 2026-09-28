import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { discoverSitemapLinks } from "../lib/core/sitemap.mjs";

async function fixture(run, handler) {
  const requests = [];
  let origin;
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (handler(request, response, origin)) return;
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(origin, requests);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const sitemap = (urls) => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
const index = (urls) => `<sitemapindex>${urls.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join("")}</sitemapindex>`;

function reply(response, body, status = 200) {
  response.writeHead(status, { "Content-Type": "application/xml" });
  response.end(body);
  return true;
}

test("discovers custom robots indexes, nested namespaced XML, gzip, and decoded unique same-site pages", async () => {
  await fixture(async (origin, requests) => {
    const result = await discoverSitemapLinks(`${origin}/some-page`);
    assert.deepEqual(result, {
      urls: [`${origin}/hidden?sort=a&lang=en`, `${origin}/last`],
      warnings: [],
    });
    assert.ok(requests.includes("/custom/maps.xml"));
    assert.ok(requests.includes("/nested.xml.gz"));
    assert.equal(requests.filter((url) => url === "/custom/maps.xml").length, 1);
  }, (request, response, origin) => {
    if (request.url === "/robots.txt") return reply(response, `User-agent: *\nSitemap: ${origin}/custom/maps.xml\nSitemap: ${origin}/custom/maps.xml`);
    if (request.url === "/custom/maps.xml") return reply(response, index(["/nested-index.xml", "/custom/maps.xml"]));
    if (request.url === "/nested-index.xml") return reply(response, index(["/nested.xml.gz"]));
    if (request.url === "/nested.xml.gz") return reply(response, gzipSync(`<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc>${origin}/hidden?sort=a&amp;lang=en</sm:loc><image:loc>https://external.example/image</image:loc></sm:url><sm:url><sm:loc><![CDATA[${origin}/hidden?sort=a&lang=en#duplicate]]></sm:loc></sm:url><sm:url><sm:loc>${origin}/last</sm:loc></sm:url><sm:url><sm:loc>https://external.example/no</sm:loc></sm:url><sm:url><sm:loc>http://user:pass@127.0.0.1:${new URL(origin).port}/private</sm:loc></sm:url><sm:url><sm:loc>javascript:alert(1)</sm:loc></sm:url></sm:urlset>`));
  });
});

test("missing conventional sitemaps and HTML fallback produce no warnings", async () => {
  await fixture(async (origin) => {
    assert.deepEqual(await discoverSitemapLinks(origin), { urls: [], warnings: [] });
  }, (request, response) => {
    if (request.url === "/sitemap.xml") return reply(response, "<html><body>Homepage</body></html>");
  });
});

test("direct sitemap input follows same-origin redirects and skips off-origin redirects", async () => {
  await fixture(async (origin, requests) => {
    const result = await discoverSitemapLinks(origin, { sitemapUrl: `${origin}/direct.xml` });
    assert.deepEqual(result.urls, [`${origin}/good`]);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /off-origin redirect/);
    assert.ok(!requests.includes("/robots.txt"));
  }, (request, response) => {
    if (request.url === "/direct.xml") {
      response.writeHead(302, { Location: "/actual.xml" }); response.end(); return true;
    }
    if (request.url === "/actual.xml") return reply(response, index(["/pages.xml", "/external.xml"]));
    if (request.url === "/pages.xml") return reply(response, sitemap(["/good"]));
    if (request.url === "/external.xml") {
      response.writeHead(302, { Location: "https://external.example/map.xml" }); response.end(); return true;
    }
  });
});

test("keeps partial results and reports page truncation", async () => {
  await fixture(async (origin) => {
    const result = await discoverSitemapLinks(origin, { maxUrls: 2 });
    assert.deepEqual(result.urls, [`${origin}/one`, `${origin}/two`]);
    assert.ok(result.warnings.some((warning) => /2-page limit/.test(warning)));
  }, (request, response) => {
    if (request.url === "/sitemap.xml") return reply(response, sitemap(["/one", "/two", "/three"]));
  });
});

test("bounds nested sitemap counts, cycles, and redirect requests", async () => {
  await fixture(async (origin, requests) => {
    const result = await discoverSitemapLinks(origin, { sitemapUrl: "/index.xml", maxSitemaps: 3, maxRequests: 3 });
    assert.ok(result.warnings.some((warning) => /3-sitemap limit/.test(warning)));
    assert.ok(result.warnings.some((warning) => /3-request limit/.test(warning)));
    assert.equal(requests.length, 3);
    assert.equal(requests.filter((url) => url === "/index.xml").length, 1);
  }, (request, response) => {
    if (request.url === "/index.xml") return reply(response, index(["/index.xml", "/loop.xml", "/third.xml", "/fourth.xml"]));
    response.writeHead(302, { Location: request.url }); response.end(); return true;
  });
});

test("reports oversized and failed referenced maps while preserving healthy pages", async () => {
  await fixture(async (origin) => {
    const result = await discoverSitemapLinks(origin, { sitemapUrl: "/index.xml", maxBodyBytes: 300 });
    assert.deepEqual(result.urls, [`${origin}/good`]);
    assert.ok(result.warnings.some((warning) => /size limit/.test(warning)));
    assert.ok(result.warnings.some((warning) => /HTTP 503/.test(warning)));
    assert.ok(result.warnings.some((warning) => /HTTP 404/.test(warning)));
  }, (request, response) => {
    if (request.url === "/index.xml") return reply(response, index(["/large.xml", "/error.xml", "/missing.xml", "/good.xml"]));
    if (request.url === "/large.xml") return reply(response, "a".repeat(301));
    if (request.url === "/error.xml") return reply(response, "unavailable", 503);
    if (request.url === "/good.xml") return reply(response, sitemap(["/good"]));
  });
});

test("bounds gzip expansion", async () => {
  await fixture(async (origin) => {
    const result = await discoverSitemapLinks(origin, { sitemapUrl: "/large.xml.gz", maxBodyBytes: 300 });
    assert.deepEqual(result.urls, []);
    assert.equal(result.warnings.length, 1);
  }, (request, response) => reply(response, gzipSync("a".repeat(10_000))));
});

test("reports overall timeout without waiting for stalled response bodies", async () => {
  await fixture(async (origin) => {
    const started = Date.now();
    const result = await discoverSitemapLinks(origin, { sitemapUrl: "/slow.xml", timeoutMs: 100, requestTimeoutMs: 1_000 });
    assert.deepEqual(result.urls, []);
    assert.ok(result.warnings.some((warning) => /timed out/.test(warning)));
    assert.ok(Date.now() - started < 1_000);
  }, (request, response) => {
    response.writeHead(200); response.flushHeaders(); return true;
  });
});
