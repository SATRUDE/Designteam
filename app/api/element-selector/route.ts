import { chromium } from "playwright";
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

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      try {
        await page.setViewportSize(VIEWPORT);
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: NAVIGATION_TIMEOUT_MS,
        });
        const selector = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el || el === document.body) return null;
          if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) {
            return "#" + CSS.escape(el.id);
          }
          const tag = el.tagName.toLowerCase();
          const classStr = el.className && typeof el.className === "string" ? el.className.trim() : "";
          const classes = classStr ? classStr.split(/\s+/).filter((c) => c && !/^\d+$/.test(c)).slice(0, 3) : [];
          if (classes.length > 0) {
            const sel = tag + "." + classes.map((c) => CSS.escape(c)).join(".");
            try {
              if (document.querySelectorAll(sel).length === 1) return sel;
            } catch {}
          }
          const path: string[] = [];
          let current: Element | null = el;
          while (current && current !== document.body) {
            let part = current.tagName.toLowerCase();
            if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
              part = "#" + CSS.escape(current.id);
              path.unshift(part);
              break;
            }
            const parent = current.parentElement;
            const siblings = parent ? Array.from(parent.children).filter((c) => c.tagName === current!.tagName) : [];
            if (siblings.length > 1) {
              part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
            }
            path.unshift(part);
            current = parent;
          }
          const sel = path.join(" > ");
          try {
            if (document.querySelector(sel) === el) return sel;
          } catch {}
          return null;
        }, { x, y });
        if (!selector) {
          return NextResponse.json(
            { error: "No element found at that point" },
            { status: 404 }
          );
        }
        return NextResponse.json({ selector });
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
