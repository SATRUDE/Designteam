import { chromium } from "playwright";
import { NextResponse } from "next/server";

const MAX_URLS = 20;
const NAVIGATION_TIMEOUT_MS = 30000;
const IMAGE_WAIT_TIMEOUT_MS = 10000;
const IMAGE_WAIT_INTERVAL_MS = 200;
const SCROLL_STEP_PX = 720; // match viewport height so each "screen" gets time in view
const SCROLL_STEP_DELAY_MS = 350; // give Intersection Observer time to fire for lazy images
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
    let urls = body?.urls;
    const cookieSelector = typeof body?.cookieSelector === "string" ? body.cookieSelector.trim() || undefined : undefined;

    if (!Array.isArray(urls)) {
      return NextResponse.json(
        { error: "Missing or invalid urls array" },
        { status: 400 }
      );
    }

    urls = urls
      .filter((u: unknown) => typeof u === "string" && u.trim())
      .map((u: string) => u.trim())
      .filter(isValidUrl);

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "No valid URLs provided" },
        { status: 400 }
      );
    }

    if (urls.length > MAX_URLS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_URLS} URLs per request` },
        { status: 400 }
      );
    }

    const results: { url: string; imageBase64?: string; error?: string }[] = [];
    const browser = await chromium.launch({ headless: true });

    try {
      for (const url of urls) {
        const page = await browser.newPage();
        try {
          await page.setViewportSize(VIEWPORT);
          await page.goto(url, {
            waitUntil: "load",
            timeout: NAVIGATION_TIMEOUT_MS,
          });
          if (cookieSelector) {
            try {
              await page.click(cookieSelector, { timeout: 3000 });
              await page.waitForTimeout(500);
            } catch {
              // ignore – take screenshot anyway
            }
          }
          // Scroll down in steps so middle-of-page lazy images get time in view (Intersection Observer)
          await page.evaluate(
            ({ stepPx, delayMs }) =>
              new Promise<void>((resolve) => {
                const maxScroll = document.body.scrollHeight;
                let current = 0;
                const step = () => {
                  current += stepPx;
                  window.scrollTo(0, Math.min(current, maxScroll));
                  if (current >= maxScroll) {
                    resolve();
                    return;
                  }
                  setTimeout(step, delayMs);
                };
                step();
              }),
            {
              stepPx: SCROLL_STEP_PX,
              delayMs: SCROLL_STEP_DELAY_MS,
            }
          );
          // Wait for images to load (poll with timeout)
          const imageWaitDeadline = Date.now() + IMAGE_WAIT_TIMEOUT_MS;
          while (Date.now() < imageWaitDeadline) {
            const allComplete = await page.evaluate(() => {
              const images = Array.from(document.images);
              return (
                images.length === 0 ||
                images.every((img) => img.complete && img.naturalWidth > 0)
              );
            });
            if (allComplete) break;
            await page.waitForTimeout(IMAGE_WAIT_INTERVAL_MS);
          }
          // Scroll back to top so viewport is at top for screenshot
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(200);
          const buffer = await page.screenshot({
            type: "png",
            fullPage: true,
          });
          results.push({
            url,
            imageBase64: buffer.toString("base64"),
          });
        } catch (err) {
          results.push({
            url,
            error: err instanceof Error ? err.message : "Screenshot failed",
          });
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }

    return NextResponse.json({ screenshots: results });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Screenshots request failed",
      },
      { status: 500 }
    );
  }
}
