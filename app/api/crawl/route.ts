import { launchBrowser } from "@/lib/browser";
import { crawlPage } from "@/lib/core/crawl.mjs";
import { NextResponse } from "next/server";

function normalizeUrlInput(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const inputUrl = body?.url;
    if (typeof inputUrl !== "string" || !inputUrl.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid url" },
        { status: 400 }
      );
    }

    const normalized = normalizeUrlInput(inputUrl);
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new TypeError("Invalid protocol");
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid URL. Use http or https." },
        { status: 400 }
      );
    }

    const browser = await launchBrowser();
    try {
      return NextResponse.json(await crawlPage(browser, normalized));
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (err instanceof Error) {
      if (
        err.name === "TimeoutError" ||
        err.message.includes("Timeout") ||
        err.message.includes("timeout")
      ) {
        return NextResponse.json({ error: "Request timed out" }, { status: 504 });
      }
      return NextResponse.json(
        { error: err.message || "Crawl failed" },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Crawl failed" }, { status: 500 });
  }
}
