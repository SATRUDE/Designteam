import { launchBrowser } from "@/lib/browser";
import { NextResponse } from "next/server";

const NAVIGATION_TIMEOUT_MS = 20000;
const VIEWPORT = { width: 1280, height: 720 };

function isValidUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrlInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    return "https://" + trimmed;
  }
  return trimmed;
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
    const normalized = normalizeUrlInput(trimmed);
    if (!isValidUrl(normalized)) {
      return NextResponse.json(
        { error: "Invalid URL. Use http or https." },
        { status: 400 }
      );
    }

    const baseUrl = new URL(normalized);
    const baseOrigin = baseUrl.origin;
    const baseHostname = baseUrl.hostname;

    const browser = await launchBrowser();
    let extracted: { url: string; label?: string }[] = [];
    try {
      const page = await browser.newPage();
      try {
        await page.setViewportSize(VIEWPORT);
        await page.goto(normalized, {
          waitUntil: "load",
          timeout: NAVIGATION_TIMEOUT_MS,
        });
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(2000);

        extracted = await page.evaluate(
          ({ baseOrigin, baseHostname }: { baseOrigin: string; baseHostname: string }) => {
            const links: { url: string; label?: string }[] = [];
            const seen = new Set<string>();

            const normalize = (href: string): string | null => {
              try {
                const url = new URL(href, baseOrigin);
                if (url.protocol !== "http:" && url.protocol !== "https:")
                  return null;
                url.hash = "";
                return url.href;
              } catch {
                return null;
              }
            };

            const sameOrigin = (base: string, target: string): boolean => {
              if (base === target) return true;
              const baseNorm = base.startsWith("www.") ? base.slice(4) : base;
              const targetNorm = target.startsWith("www.") ? target.slice(4) : target;
              return baseNorm === targetNorm;
            };

            const addLinksFrom = (elements: NodeListOf<HTMLAnchorElement>) => {
              for (const el of elements) {
                const href = el.getAttribute("href");
                if (
                  !href ||
                  href.startsWith("#") ||
                  href.startsWith("mailto:") ||
                  href.startsWith("tel:")
                )
                  continue;

                const absolute = normalize(href);
                if (!absolute) continue;

                try {
                  const parsed = new URL(absolute);
                  if (!sameOrigin(baseHostname, parsed.hostname)) continue;
                } catch {
                  continue;
                }

                if (seen.has(absolute)) continue;
                seen.add(absolute);

                const label = el.textContent?.trim().slice(0, 80) || undefined;
                links.push({ url: absolute, label });
              }
            };

            addLinksFrom(document.querySelectorAll("nav a[href]"));
            addLinksFrom(document.querySelectorAll("footer a[href]"));
            addLinksFrom(document.querySelectorAll("a[href]"));

            return links;
          },
          { baseOrigin, baseHostname }
        );
      } finally {
        await page.close();
      }

      const startUrl = (() => {
        try {
          const u = new URL(normalized);
          u.hash = "";
          return u.href;
        } catch {
          return normalized;
        }
      })();

      const links: { url: string; label?: string }[] = [];
      links.push({ url: startUrl, label: "Homepage" });
      const seen = new Set<string>([startUrl]);
      for (const l of extracted) {
        if (seen.has(l.url)) continue;
        seen.add(l.url);
        links.push(l);
      }

      return NextResponse.json({ links });
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (err instanceof Error) {
      if (
        err.name === "TimeoutError" ||
        err.message?.includes("Timeout") ||
        err.message?.includes("timeout")
      ) {
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
