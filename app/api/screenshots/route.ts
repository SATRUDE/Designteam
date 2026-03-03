import { chromium } from "playwright";
import { NextResponse } from "next/server";

const MAX_URLS = 20;
const NAVIGATION_TIMEOUT_MS = 30000;
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
            waitUntil: "domcontentloaded",
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
