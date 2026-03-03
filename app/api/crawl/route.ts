import * as cheerio from "cheerio";
import { NextResponse } from "next/server";

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function isValidUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url: inputUrl } = body;

    if (typeof inputUrl !== "string" || !inputUrl.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid url" },
        { status: 400 }
      );
    }

    const trimmed = inputUrl.trim();
    if (!isValidUrl(trimmed)) {
      return NextResponse.json(
        { error: "Invalid URL. Use http or https." },
        { status: 400 }
      );
    }

    const baseUrl = new URL(trimmed);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(trimmed, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Request failed: ${res.status} ${res.statusText}` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "URL did not return HTML" },
        { status: 400 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const baseOrigin = baseUrl.origin;
    const baseHostname = baseUrl.hostname;
    const seen = new Set<string>();
    const links: { url: string; label?: string }[] = [];

    // Include the crawled URL (homepage) first so it appears in the list
    const startUrl = normalizeUrl(trimmed, baseOrigin) ?? trimmed;
    if (startUrl && !seen.has(startUrl)) {
      seen.add(startUrl);
      links.push({ url: startUrl, label: "Homepage" });
    }

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const absolute = normalizeUrl(href, baseOrigin);
      if (!absolute) return;

      try {
        const parsed = new URL(absolute);
        if (parsed.hostname !== baseHostname) return;
      } catch {
        return;
      }

      if (seen.has(absolute)) return;
      seen.add(absolute);

      const label = $(el).text().trim().slice(0, 80) || undefined;
      links.push({ url: absolute, label });
    });

    return NextResponse.json({ links });
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return NextResponse.json(
          { error: "Request timed out" },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { error: err.message || "Crawl failed" },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Crawl failed" },
      { status: 500 }
    );
  }
}
