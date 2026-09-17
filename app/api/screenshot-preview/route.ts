import { launchBrowser } from "@/lib/browser";
import { NextResponse } from "next/server";

const NAVIGATION_TIMEOUT_MS = 30000;
const VIEWPORT = { width: 1280, height: 720 };

async function gotoWithRetry(page: import("playwright-core").Page, url: string) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, {
        waitUntil: "load",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      return;
    } catch (err) {
      lastErr = err;
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: NAVIGATION_TIMEOUT_MS,
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
        await gotoWithRetry(page, url);
        await page.waitForTimeout(1500);
        const buffer = await page.screenshot({
          type: "png",
          fullPage: false,
        });
        return NextResponse.json({
          imageBase64: buffer.toString("base64"),
        });
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
          err instanceof Error ? err.message : "Preview screenshot failed",
      },
      { status: 500 }
    );
  }
}
