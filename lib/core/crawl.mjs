const NAVIGATION_TIMEOUT_MS = 20_000;
const VIEWPORT = { width: 1280, height: 720 };

/**
 * Discover links on one page. The caller owns the browser and must close it.
 *
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @returns {Promise<{links: Array<{url: string, label?: string}>}>}
 */
export async function crawlPage(browser, url) {
  const start = new URL(url);
  if (start.protocol !== "http:" && start.protocol !== "https:") {
    throw new TypeError("Invalid URL. Use http or https.");
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
    // Give scripts a short, fixed window to add navigation links.
    await page.waitForTimeout(2_000);

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
    return { links };
  } finally {
    await page.close();
  }
}
