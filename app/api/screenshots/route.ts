import { launchBrowser } from "@/lib/browser";
import { capturePage, isValidUrl } from "@/lib/core/capture.mjs";
import { NextResponse } from "next/server";

const MAX_URLS = 20;
type ScreenshotMode = "desktop" | "mobile";
type ScreenshotResult = {
  url: string;
  images?: { desktop?: string; mobile?: string };
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let urls = body?.urls;
    const modesInput = Array.isArray(body?.modes)
      ? (body.modes as unknown[])
      : undefined;
    const modes: ScreenshotMode[] =
      modesInput && modesInput.length
        ? (modesInput
            .map((m) =>
              typeof m === "string" ? m.toLowerCase().trim() : ""
            )
            .filter((m) => m === "desktop" || m === "mobile") as ScreenshotMode[])
        : ["desktop"];
    const rawCookie = body?.cookieSelector;
    const cookieSelector =
      typeof rawCookie === "string"
        ? rawCookie.trim() || undefined
        : rawCookie?.frameSelector && typeof rawCookie?.innerSelector === "string"
          ? { frameSelector: String(rawCookie.frameSelector).trim(), innerSelector: String(rawCookie.innerSelector).trim() }
          : undefined;
    /** Set `false` to test whether fixed-chrome normalization affects nav/layout. Default: true. */
    const normalizeFixedChrome = body?.normalizeFixedChrome !== false;

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

    if (modes.length === 0) {
      return NextResponse.json(
        { error: "No valid screenshot modes provided" },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const total = urls.length;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        const sendProgress = (completed: number, failed: number) => {
          sendEvent("progress", { total, completed, failed });
        };

        let completed = 0;
        let failed = 0;
        let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;

        try {
          browser = await launchBrowser();
          sendProgress(completed, failed);
          for (const url of urls) {
            const images: { desktop?: string; mobile?: string } = {};
            let anySuccess = false;
            let lastError: string | undefined;

            for (const mode of modes) {
              try {
                const buffer = await capturePage(browser, url, mode, {
                  cookieSelector,
                  normalizeFixedChrome,
                });
                images[mode] = buffer.toString("base64");
                anySuccess = true;
              } catch (err) {
                lastError = err instanceof Error ? err.message : "Screenshot failed";
              }
            }

            const result: ScreenshotResult = {
              url,
              images: anySuccess ? images : undefined,
              error: anySuccess ? undefined : lastError,
            };
            completed += 1;
            if (!anySuccess) failed += 1;
            sendEvent("screenshot", result);
            sendProgress(completed, failed);
          }
          sendEvent("done", { total, completed, failed });
        } catch (err) {
          sendEvent("error", {
            error: err instanceof Error ? err.message : "Screenshots request failed",
          });
        } finally {
          try {
            await browser?.close();
          } finally {
            controller.close();
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
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
