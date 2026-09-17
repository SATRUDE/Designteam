import { launchBrowser } from "@/lib/browser";
import { NextResponse } from "next/server";

const NAVIGATION_TIMEOUT_MS = 20000;

const COOKIE_BUTTON_TEXTS = [
  "I AGREE",
  "Accept all",
  "Accept All",
  "Accept",
  "Accept all cookies",
  "Allow all",
  "Allow All",
  "Reject",
  "Agree",
];

async function tryTextBasedFallback(page: import("playwright-core").Page): Promise<{ selector?: string; frameSelector?: string; innerSelector?: string } | null> {
  const tryMain = async (text: string) => {
    const sel = `button:has-text("${text}"), [role="button"]:has-text("${text}")`;
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) return { selector: sel };
    return null;
  };
  for (const text of COOKIE_BUTTON_TEXTS) {
    const r = await tryMain(text);
    if (r) return r;
  }
  const iframeCount = await page.locator("iframe").count();
  for (let i = 0; i < iframeCount; i++) {
    const frameLoc = page.frameLocator("iframe").nth(i);
    for (const text of COOKIE_BUTTON_TEXTS) {
      try {
        const sel = `button:has-text("${text}"), [role="button"]:has-text("${text}")`;
        const loc = frameLoc.locator(sel).first();
        if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
          const iframeEl = await page.locator("iframe").nth(i).elementHandle();
          if (iframeEl) {
            await iframeEl.evaluate((el) => el.setAttribute("data-cookie-frame", "1"));
            return { frameSelector: "iframe[data-cookie-frame='1']", innerSelector: sel };
          }
        }
      } catch {
        /* skip */
      }
    }
  }
  return null;
}
const VIEWPORT = { width: 1280, height: 720 };

async function gotoWithRetry(
  page: import("playwright-core").Page,
  url: string,
  timeoutMs: number
) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
      return;
    } catch (err) {
      lastErr = err;
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });
        return;
      } catch (err2) {
        lastErr = err2;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Navigation failed");
}

function isValidUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const x = typeof body?.x === "number" ? Math.round(body.x) : 0;
    const y = typeof body?.y === "number" ? Math.round(body.y) : 0;

    if (!url || !isValidUrl(url)) {
      return NextResponse.json(
        { error: "Missing or invalid url" },
        { status: 400 }
      );
    }

    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      try {
        await page.setViewportSize(VIEWPORT);
        await gotoWithRetry(page, url, NAVIGATION_TIMEOUT_MS);
        await page.waitForTimeout(2500);
        const result = await page.evaluate(({ x, y }) => {
          function buildSelector(el: Element, doc: Document): string | null {
            if (!el || el === doc.body) return null;
            if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && doc.querySelectorAll("#" + CSS.escape(el.id)).length === 1) {
              return "#" + CSS.escape(el.id);
            }
            const tag = el.tagName.toLowerCase();
            const classStr = el.className && typeof el.className === "string" ? el.className.trim() : "";
            const classes = classStr ? classStr.split(/\s+/).filter((c: string) => c && !/^\d+$/.test(c)).slice(0, 3) : [];
            if (classes.length > 0) {
              const sel = tag + "." + classes.map((c: string) => CSS.escape(c)).join(".");
              try {
                if (doc.querySelectorAll(sel).length === 1) return sel;
              } catch {}
            }
            const path: string[] = [];
            let current: Element | null = el;
            while (current && current !== doc.body) {
              let part = current.tagName.toLowerCase();
              if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
                part = "#" + CSS.escape(current.id);
                path.unshift(part);
                break;
              }
              const currentTagName = current.tagName;
              const parent: Element | null = current.parentElement;
              const siblings: Element[] = parent
                ? Array.from(parent.children).filter(
                    (c): c is Element => c.tagName === currentTagName
                  )
                : [];
              if (siblings.length > 1) {
                part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
              }
              path.unshift(part);
              current = parent;
            }
            const sel = path.join(" > ");
            try {
              if (doc.querySelector(sel) === el) return sel;
            } catch {}
            return null;
          }

          const el = document.elementFromPoint(x, y);
          if (!el || el === document.body) return null;

          if (el.tagName === "IFRAME") {
            const rect = el.getBoundingClientRect();
            const iframeX = x - rect.left;
            const iframeY = y - rect.top;
            const frameSelector = buildSelector(el, document);
            if (!frameSelector) return null;
            try {
              const doc = (el as HTMLIFrameElement).contentDocument;
              if (doc) {
                const innerEl = doc.elementFromPoint(iframeX, iframeY);
                if (innerEl && innerEl !== doc.body) {
                  const innerSelector = buildSelector(innerEl, doc);
                  if (innerSelector) return { frameSelector, innerSelector };
                }
              }
            } catch {
              /* cross-origin: cannot access contentDocument */
            }
            return { frameSelector, iframeX, iframeY };
          }

          const selector = buildSelector(el, document);
          if (!selector) return null;
          return { selector };
        }, { x, y });

        if (!result) {
          const fallback = await tryTextBasedFallback(page);
          if (fallback) return NextResponse.json(fallback);
          return NextResponse.json(
            { error: "No element found at that point" },
            { status: 404 }
          );
        }

        if (
          "frameSelector" in result &&
          "iframeX" in result &&
          "iframeY" in result &&
          !("innerSelector" in result)
        ) {
          const frameSelector =
            typeof result.frameSelector === "string" ? result.frameSelector : null;
          if (!frameSelector) {
            return NextResponse.json(
              { error: "Could not resolve iframe selector" },
              { status: 404 }
            );
          }
          const iframeHandle = await page
            .locator(frameSelector)
            .first()
            .elementHandle();
          const frame = await iframeHandle?.contentFrame();
          if (!frame) {
            return NextResponse.json(
              { error: "Could not access iframe" },
              { status: 404 }
            );
          }
          const innerSelector = await frame.evaluate(
            ({
              iframeX,
              iframeY,
            }: {
              iframeX?: number;
              iframeY?: number;
            }) => {
              if (typeof iframeX !== "number" || typeof iframeY !== "number") {
                return null;
              }
              function buildSelector(el: Element, doc: Document): string | null {
                if (!el || el === doc.body) return null;
                if (
                  el.id &&
                  /^[a-zA-Z][\w-]*$/.test(el.id) &&
                  doc.querySelectorAll("#" + CSS.escape(el.id)).length === 1
                ) {
                  return "#" + CSS.escape(el.id);
                }
                const tag = el.tagName.toLowerCase();
                const classStr =
                  el.className && typeof el.className === "string"
                    ? el.className.trim()
                    : "";
                const classes = classStr
                  ? classStr
                      .split(/\s+/)
                      .filter((c: string) => c && !/^\d+$/.test(c))
                      .slice(0, 3)
                  : [];
                if (classes.length > 0) {
                  const sel =
                    tag +
                    "." +
                    classes.map((c: string) => CSS.escape(c)).join(".");
                  try {
                    if (doc.querySelectorAll(sel).length === 1) return sel;
                  } catch {}
                }
                const path: string[] = [];
                let current: Element | null = el;
                while (current && current !== doc.body) {
                  let part = current.tagName.toLowerCase();
                  if (
                    current.id &&
                    /^[a-zA-Z][\w-]*$/.test(current.id)
                  ) {
                    part = "#" + CSS.escape(current.id);
                    path.unshift(part);
                    break;
                  }
                  const currentTagName = current.tagName;
                  const parent: Element | null = current.parentElement;
                  const siblings: Element[] = parent
                    ? Array.from(parent.children).filter(
                        (c): c is Element => c.tagName === currentTagName
                      )
                    : [];
                  if (siblings.length > 1) {
                    part +=
                      ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
                  }
                  path.unshift(part);
                  current = parent;
                }
                const sel = path.join(" > ");
                try {
                  if (doc.querySelector(sel) === el) return sel;
                } catch {}
                return null;
              }
              const el = document.elementFromPoint(iframeX, iframeY);
              if (!el || el === document.body) return null;
              return buildSelector(el, document);
            },
            { iframeX: result.iframeX, iframeY: result.iframeY }
          );
          if (!innerSelector) {
            return NextResponse.json(
              { error: "No element found at that point (inside iframe)" },
              { status: 404 }
            );
          }
          return NextResponse.json({
            frameSelector: result.frameSelector,
            innerSelector,
          });
        }

        return NextResponse.json(result);
      } finally {
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to get element selector",
      },
      { status: 500 }
    );
  }
}
