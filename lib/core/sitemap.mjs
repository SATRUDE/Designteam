import { gunzipSync } from "node:zlib";
import { load } from "cheerio";

const DEFAULTS = {
  timeoutMs: 6_000,
  requestTimeoutMs: 2_000,
  maxSitemaps: 20,
  maxRequests: 32,
  maxUrls: 2_000,
  maxBodyBytes: 2 * 1024 * 1024,
};

function webUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function localName(node) {
  return node.name?.split(":").pop().toLowerCase();
}

/** Discover bounded, public sitemap entries without opening additional browser pages. */
export async function discoverSitemapLinks(input, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const start = webUrl(input);
  if (!start) throw new TypeError("Invalid URL. Use http or https without credentials.");
  const explicit = options.sitemapUrl ? webUrl(options.sitemapUrl, start) : null;
  if (options.sitemapUrl && (!explicit || explicit.origin !== start.origin)) {
    throw new TypeError("The sitemap URL must use the same origin as the website.");
  }
  const urls = new Set();
  const warnings = new Set();
  const visited = new Set();
  const queue = [];
  let requests = 0;
  let processed = 0;
  let stopped = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  const warn = (message) => warnings.add(message);

  function enqueue(url, required) {
    if (!url) return;
    if (url.origin !== start.origin) {
      warn("A sitemap on another origin was skipped.");
      return;
    }
    if (visited.has(url.href)) return;
    // Mark queued URLs too, so a large or cyclic index cannot grow the queue.
    if (visited.size >= settings.maxSitemaps) {
      warn(`Sitemap discovery reached its ${settings.maxSitemaps}-sitemap limit; some pages may be missing.`);
      return;
    }
    visited.add(url.href);
    queue.push({ url, required });
  }

  async function readUrl(initial, required, kind) {
    let url = initial;
    const requestController = new AbortController();
    const requestTimer = setTimeout(() => requestController.abort(), settings.requestTimeoutMs);
    const signal = AbortSignal.any([controller.signal, requestController.signal]);
    try {
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (requests >= settings.maxRequests) {
          stopped = true;
          throw new Error(`the ${settings.maxRequests}-request limit was reached`);
        }
        requests++;
        const response = await fetch(url, { redirect: "manual", signal });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get("location");
          const target = location && webUrl(location, url);
          if (!target || target.origin !== start.origin) throw new Error("an unsafe or off-origin redirect was skipped");
          if (redirects === 3) throw new Error("too many redirects");
          url = target;
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          if (!required && [404, 410].includes(response.status)) return null;
          throw new Error(`HTTP ${response.status}`);
        }
        const reader = response.body?.getReader();
        const chunks = [];
        let size = 0;
        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > settings.maxBodyBytes) throw new Error("the sitemap response size limit was exceeded");
              chunks.push(value);
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
        }
        let bytes = Buffer.concat(chunks);
        // fetch decodes Content-Encoding; .xml.gz downloads may still contain gzip bytes.
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
          bytes = gunzipSync(bytes, { maxOutputLength: settings.maxBodyBytes });
        }
        return { text: bytes.toString("utf8"), url };
      }
    } catch (error) {
      if (controller.signal.aborted) {
        stopped = true;
        warn("Sitemap discovery timed out; some pages may be missing.");
      } else {
        const reason = requestController.signal.aborted ? "the request timed out" : error.message;
        warn(`Could not read ${kind} ${initial.href}: ${reason}. Some pages may be missing.`);
      }
      return null;
    } finally {
      clearTimeout(requestTimer);
    }
  }

  try {
    if (explicit) {
      enqueue(explicit, true);
    } else {
      const robots = await readUrl(new URL("/robots.txt", start), false, "robots.txt");
      if (robots) {
        for (const line of robots.text.split(/\r?\n/)) {
          const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
          if (match) enqueue(webUrl(match[1], robots.url), true);
        }
      }
      enqueue(new URL("/sitemap.xml", start), false);
      enqueue(new URL("/sitemap_index.xml", start), false);
    }

    while (queue.length && !stopped) {
      const { url, required } = queue.shift();
      processed++;
      const document = await readUrl(url, required, "sitemap");
      if (!document) continue;
      const $ = load(document.text, { xml: true });
      const root = $.root().children().first().get(0);
      const type = localName(root || {});
      if (!["urlset", "sitemapindex"].includes(type)) {
        // Many sites serve the homepage for unknown paths. That is not a sitemap.
        if (required) warn(`Invalid sitemap at ${url.href}; some pages may be missing.`);
        continue;
      }
      if (!new RegExp(`</${root.name}\\s*>\\s*$`, "i").test(document.text.trim())) {
        warn(`Incomplete sitemap at ${url.href}; some pages may be missing.`);
      }
      const itemName = type === "sitemapindex" ? "sitemap" : "url";
      for (const item of $(root).children().toArray()) {
        if (localName(item) !== itemName) continue;
        const loc = $(item).children().toArray().find((node) => localName(node) === "loc");
        const target = loc && webUrl($(loc).text().trim(), document.url);
        if (!target) continue;
        if (type === "sitemapindex") {
          enqueue(target, true);
        } else {
          if (target.hostname.replace(/^www\./i, "") !== start.hostname.replace(/^www\./i, "")) continue;
          if (target.port !== start.port || urls.has(target.href)) continue;
          if (urls.size >= settings.maxUrls) {
            warn(`Sitemap discovery reached its ${settings.maxUrls}-page limit; some pages may be missing.`);
            stopped = true;
            break;
          }
          urls.add(target.href);
        }
      }
    }
    if (controller.signal.aborted && (queue.length || !processed)) {
      warn("Sitemap discovery timed out; some pages may be missing.");
    }
    return { urls: [...urls], warnings: [...warnings] };
  } finally {
    clearTimeout(timer);
  }
}
