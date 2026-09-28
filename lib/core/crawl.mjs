import { discoverSitemapLinks } from "./sitemap.mjs";

const NAVIGATION_TIMEOUT_MS = 20_000;
const SCRIPT_SETTLE_MS = 2_000;
const NETWORK_SETTLE_TIMEOUT_MS = 5_000;
const VIEWPORT = { width: 1280, height: 720 };

/**
 * Discover links on one page. The caller owns the browser and must close it.
 *
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @returns {Promise<{links: Array<{url: string, label?: string}>, warnings?: string[]}>}
 */
export async function crawlPage(browser, url) {
  const start = new URL(url);
  if (!["http:", "https:"].includes(start.protocol) || start.username || start.password) {
    throw new TypeError("Invalid URL. Use http or https.");
  }

  // Direct sitemap URLs need no browser navigation or hydration delay.
  if (/\.xml(?:\.gz)?$/i.test(start.pathname)) {
    const result = await discoverSitemapLinks(start.href, { sitemapUrl: start.href });
    return {
      links: result.urls.map((url) => ({ url })),
      ...(result.warnings.length ? { warnings: result.warnings } : {}),
    };
  }

  const page = await browser.newPage();
  try {
    await page.setViewportSize(VIEWPORT);
    const response = await page.goto(start.href, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    if (response && response.status() >= 400) {
      throw new Error(`HTTP ${response.status()} for ${url}`);
    }
    // Run discovery during browser settlement to stay inside the web request budget.
    const sitemapPromise = discoverSitemapLinks(page.url());
    // Give hydration/timers a minimum window, then allow pending navigation
    // requests to finish. Analytics and streaming requests must not block forever.
    await page.waitForTimeout(SCRIPT_SETTLE_MS);
    try {
      await page.waitForLoadState("networkidle", {
        timeout: NETWORK_SETTLE_TIMEOUT_MS,
      });
    } catch (error) {
      if (error.name !== "TimeoutError") throw error;
    }

    const finalUrl = new URL(page.url());
    finalUrl.hash = "";
    const extracted = await page.evaluate(() => {
      /** @type {Array<{url: string, label?: string}>} */
      const links = [];
      const seen = new Set();
      const pageHostname = location.hostname.replace(/^www\./i, "");

      for (const selector of ["nav a[href]", "footer a[href]", "a[href]"]) {
        for (const el of document.querySelectorAll(selector)) {
          const href = el.getAttribute("href");
          if (!href || href.startsWith("#")) continue;

          try {
            const target = new URL(href, document.baseURI);
            if (target.protocol !== "http:" && target.protocol !== "https:") continue;
            if (target.username || target.password) continue;
            if (target.hostname.replace(/^www\./i, "") !== pageHostname) continue;
            target.hash = "";
            if (seen.has(target.href)) continue;
            seen.add(target.href);

            const label = el.textContent?.trim().slice(0, 80) || undefined;
            links.push({ url: target.href, label });
          } catch {
            // Ignore malformed hrefs.
          }
        }
      }

      return links;
    });

    const links = [{ url: finalUrl.href, label: "Homepage" }];
    const seen = new Set([finalUrl.href]);
    for (const link of extracted) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      links.push(link);
    }
    const sitemap = await sitemapPromise;
    for (const url of sitemap.urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      links.push({ url });
    }
    return { links, ...(sitemap.warnings.length ? { warnings: sitemap.warnings } : {}) };
  } finally {
    await page.close();
  }
}
