import { launchBrowser } from "@/lib/browser";
import { NextResponse } from "next/server";

type ScreenshotMode = "desktop" | "mobile";

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
    const modeRaw = typeof body?.mode === "string" ? body.mode.toLowerCase().trim() : "desktop";
    const mode: ScreenshotMode = modeRaw === "mobile" ? "mobile" : "desktop";

    // #region agent log
    fetch("http://127.0.0.1:7428/ingest/36ca3dc5-0c93-44c4-900b-d009d9a1ebaf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "daef6a",
      },
      body: JSON.stringify({
        sessionId: "daef6a",
        runId: "debug_pre",
        hypothesisId: "H1",
        location: "app/api/modules/route.ts:parseBody",
        message: "code-modules request received",
        data: { url, mode },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!isValidUrl(url)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const browser = await launchBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewportSize(
        mode === "desktop" ? { width: 1280, height: 720 } : { width: 400, height: 720 }
      );
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1000);

      const result = await page.evaluate(() => {
        const findRoot = (): HTMLElement | null => {
          const main =
            document.querySelector<HTMLElement>("main") ??
            document.querySelector<HTMLElement>("[role='main']") ??
            document.querySelector<HTMLElement>("#content");
          if (main) return main;
          return document.body ?? null;
        };

        const root = findRoot();
        if (!root) return null;

        const rootRect = root.getBoundingClientRect();
        if (!rootRect || rootRect.height <= 0) return null;

        const blocks: Array<{ y0: number; y1: number; label: string }> = [];
        // Allow smaller sections so we don't collapse the page into only a few big bands.
        const minHeight = Math.max(80, rootRect.height * 0.06);

        const maxDepth = 6;

        const visit = (el: Element, depth: number) => {
          if (!(el instanceof HTMLElement)) return;
          const rect = el.getBoundingClientRect();
          const height = rect.height;
          if (height < minHeight) return;

          const tag = el.tagName.toLowerCase();
          const headingText = (el.querySelector("h1,h2,h3")?.textContent || "")
            .trim()
            .slice(0, 80);
          const hasHeading = headingText.length > 0;
          const linkCount = el.querySelectorAll("a,button").length;
          const hasBodyText = !!el.querySelector("p,li");
          const hasCtaLike = linkCount >= 2 && (hasHeading || hasBodyText);

          const isSemantic = tag === "section" || tag === "article";
          const isSectionLike =
            isSemantic ||
            ((tag === "header" || tag === "footer") && hasHeading) ||
            (hasHeading && depth <= 4 && height > minHeight && height < rootRect.height * 0.9) ||
            // For non-semantic wrappers: only consider them at inner depths.
            (depth >= 2 &&
              tag === "div" &&
              height > minHeight * 0.85 &&
              (hasCtaLike || hasBodyText || linkCount >= 3));

          if (isSectionLike) {
            const y0 = rect.top - rootRect.top;
            const y1 = rect.bottom - rootRect.top;
            if (y1 > y0 + 40) {
              const heading = headingText;
              blocks.push({
                y0,
                y1,
                label: heading || `${tag} section`,
              });
            }
          }

          // Even when a node looks section-like, keep descending. Otherwise
          // large wrappers will prevent discovery of inner subsections.
          if (depth < maxDepth) {
            Array.from(el.children).forEach((child) => visit(child, depth + 1));
          }
        };

        Array.from(root.children).forEach((child) => visit(child, 1));
        if (!blocks.length) return null;

        // Filter overlapping / nested blocks, preferring inner (more specific) ones.
        const candidateCount = blocks.length;
        blocks.sort(
          (a, b) => (a.y0 - b.y0) || (a.y1 - a.y0 - (b.y1 - b.y0))
        );
        const kept: typeof blocks = [];
        const eps = 8;
        for (const b of blocks) {
          const last = kept[kept.length - 1];
          if (!last) {
            kept.push(b);
            continue;
          }

          const bContainsLast =
            b.y0 <= last.y0 + eps && b.y1 >= last.y1 - eps;
          const lastContainsB =
            last.y0 <= b.y0 + eps && last.y1 >= b.y1 - eps;
          const bOverlapsLast = b.y0 < last.y1 - eps;

          const bH = b.y1 - b.y0;
          const lastH = last.y1 - last.y0;

          // If the new block contains the previous one, usually keep the inner,
          // but if the outer isn't *much* bigger, prefer the outer to avoid "middle-only" bands.
          if (bContainsLast) {
            if (bH <= lastH * 2.0) kept[kept.length - 1] = b;
            continue;
          }

          // If the new block is inside the previous one, replace with the inner
          // only if it represents most of the outer span.
          if (lastContainsB) {
            if (bH >= lastH * 0.7) kept[kept.length - 1] = b;
            continue;
          }

          // Partial overlap: keep the smaller span.
          if (bOverlapsLast) {
            const bH = b.y1 - b.y0;
            const lastH = last.y1 - last.y0;
            if (bH < lastH) kept[kept.length - 1] = b;
            continue;
          }

          kept.push(b);
        }

        const docHeight = Math.max(
          1,
          document.documentElement.scrollHeight || 0,
          document.body?.scrollHeight || 0
        );
        const rootRectTop = rootRect.top;
        const rootRectHeight = rootRect.height;
        const rootTagName = root.tagName.toLowerCase();

        const sortedKept = [...kept].sort((a, b) => a.y0 - b.y0);

        // Expand each block slightly to better capture padding around the "content core".
        // Clamp expansions so we don't bleed into neighboring sections.
        const expandedBlocks = sortedKept.map((b, idx) => {
          const baseY0 = b.y0;
          const baseY1 = b.y1;
          const baseH = Math.max(1, baseY1 - baseY0);
          const padPx = Math.round(
            Math.max(20, Math.min(100, baseH * 0.14))
          );
          let y0 = baseY0 - padPx;
          let y1 = baseY1 + padPx;
          const prev = idx > 0 ? sortedKept[idx - 1] : null;
          const next = idx < sortedKept.length - 1 ? sortedKept[idx + 1] : null;
          if (prev) y0 = Math.max(y0, prev.y1);
          if (next) y1 = Math.min(y1, next.y0);
          if (y1 <= y0 + 40) {
            y0 = baseY0;
            y1 = baseY1;
          }
          return { ...b, y0, y1 };
        });

        // Enforce non-overlap and ordering in px space (prevents crossed boxes).
        const minPx = 60;
        expandedBlocks.sort((a, b) => a.y0 - b.y0);
        let lastY1 = -Infinity;
        const nonOverlappingBlocks = [];
        for (const b of expandedBlocks) {
          const y0 = Math.max(b.y0, lastY1);
          const y1 = Math.max(y0, b.y1);
          if (y1 - y0 < minPx) continue;
          nonOverlappingBlocks.push({ ...b, y0, y1 });
          lastY1 = y1;
        }

        // #region agent log
        fetch("http://127.0.0.1:7428/ingest/36ca3dc5-0c93-44c4-900b-d009d9a1ebaf", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "daef6a",
          },
          body: JSON.stringify({
            sessionId: "daef6a",
            runId: "debug_pre",
            hypothesisId: "H5",
            location: "app/api/modules/route.ts:nonOverlap",
            message: "non-overlap enforced",
            data: {
              beforeCount: expandedBlocks.length,
              afterCount: nonOverlappingBlocks.length,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        const normalizedBlocks = nonOverlappingBlocks.map((b, idx) => {
          const yStartMain = b.y0 / rootRectHeight;
          const yEndMain = b.y1 / rootRectHeight;
          const yStartFull = (b.y0 + rootRectTop) / docHeight;
          const yEndFull = (b.y1 + rootRectTop) / docHeight;
          return {
            id: `code-${idx + 1}`,
            label: b.label || `Module ${idx + 1}`,
            // Normalize against the full page height because the UI draws boxes over the full screenshot image.
            yStart: Math.max(0, Math.min(1, yStartFull)),
            yEnd: Math.max(0, Math.min(1, yEndFull)),
            __debug: {
              yStartFull,
              yEndFull,
              yStartMain,
              yEndMain,
            },
          };
        });

        return {
          height: rootRectHeight,
          rootRectTop,
          docHeight,
          rootTagName,
          candidateCount,
          keptCount: kept.length,
          blocks: normalizedBlocks,
        };
      });

      if (!result || !result.blocks?.length) {
        // #region agent log
        fetch("http://127.0.0.1:7428/ingest/36ca3dc5-0c93-44c4-900b-d009d9a1ebaf", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "daef6a",
          },
          body: JSON.stringify({
            sessionId: "daef6a",
            runId: "debug_pre",
            hypothesisId: "H3",
            location: "app/api/modules/route.ts:noBlocks",
            message: "no code modules returned",
            data: { hasResult: !!result },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        return NextResponse.json(
          { error: "No code-based modules could be detected" },
          { status: 422 }
        );
      }

      const debugSample =
        result.blocks?.slice?.(0, 3)?.map?.((m: any) => ({
          id: m.id,
          label: m.label,
          yStart: m.yStart,
          yEnd: m.yEnd,
          yStartFull: m.__debug?.yStartFull,
          yEndFull: m.__debug?.yEndFull,
        })) ?? [];

      // #region agent log
      fetch("http://127.0.0.1:7428/ingest/36ca3dc5-0c93-44c4-900b-d009d9a1ebaf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "daef6a",
        },
        body: JSON.stringify({
          sessionId: "daef6a",
          runId: "debug_pre",
          hypothesisId: "H1",
          location: "app/api/modules/route.ts:resultSummary",
          message: "code-modules computed blocks",
          data: {
            mode,
            rootRectTop: result.rootRectTop,
            rootRectHeight: result.height,
            docHeight: result.docHeight,
            rootTagName: (result as any).rootTagName,
            candidateCount: (result as any).candidateCount,
            keptCount: (result as any).keptCount,
            moduleCount: result.blocks.length,
            sample: debugSample,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      return NextResponse.json(
        {
          url,
          mode,
          modules: result.blocks.map((m: any) => ({
            id: m.id,
            label: m.label,
            yStart: m.yStart,
            yEnd: m.yEnd,
          })),
        },
        { status: 200 }
      );
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to detect modules from code",
      },
      { status: 500 }
    );
  }
}

