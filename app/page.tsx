"use client";

import { useState, useEffect } from "react";

type CrawlLink = { url: string; label?: string };
type ScreenshotResult = {
  url: string;
  imageBase64?: string;
  error?: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [links, setLinks] = useState<CrawlLink[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotResult[]>([]);
  const [topColors, setTopColors] = useState<string[]>([]);
  const [colorsLoading, setColorsLoading] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [cookieSelector, setCookieSelector] = useState("");
  const [selectorResolving, setSelectorResolving] = useState(false);
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [modalScreenshot, setModalScreenshot] = useState<ScreenshotResult | null>(null);
  const [slices, setSlices] = useState<string[] | null>(null);
  const [sliceLoading, setSliceLoading] = useState(false);
  const [sliceMessage, setSliceMessage] = useState<string | null>(null);

  useEffect(() => {
    if (screenshots.length === 0) {
      setTopColors([]);
      return;
    }
    const urls = screenshots.map((s) => s.url);
    let cancelled = false;
    setColorsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/colors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setTopColors(data.colors ?? []);
        else setTopColors([]);
      } catch {
        if (!cancelled) setTopColors([]);
      } finally {
        if (!cancelled) setColorsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screenshots]);

  async function handleCrawl(e: React.FormEvent) {
    e.preventDefault();
    setCrawlError(null);
    setLinks([]);
    setSelected(new Set());
    setScreenshots([]);
    if (!url.trim()) return;
    setCrawlLoading(true);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Crawl failed");
      setLinks(data.links ?? []);
    } catch (err) {
      setCrawlError(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawlLoading(false);
    }
  }

  function toggleSelect(urlToToggle: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(urlToToggle)) next.delete(urlToToggle);
      else next.add(urlToToggle);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(links.map((l) => l.url)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function downloadImage(
    imageBase64: string,
    pageUrl: string,
    customFilename?: string
  ) {
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${imageBase64}`;
    if (customFilename) {
      link.download = customFilename;
    } else {
      try {
        const url = new URL(pageUrl);
        link.download =
          url.hostname.replace(/\./g, "-") +
          (url.pathname === "/" ? "" : url.pathname.replace(/\//g, "-").slice(0, 40)) +
          ".png";
      } catch {
        link.download = "screenshot.png";
      }
    }
    link.click();
  }

  async function sliceImageForFigma(
    base64: string,
    maxHeight = 4096
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (h <= maxHeight) {
          resolve([base64]);
          return;
        }
        const slices: string[] = [];
        let y = 0;
        while (y < h) {
          const sliceH = Math.min(maxHeight, h - y);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = sliceH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas context unavailable"));
            return;
          }
          ctx.drawImage(img, 0, y, w, sliceH, 0, 0, w, sliceH);
          const dataUrl = canvas.toDataURL("image/png");
          slices.push(dataUrl.replace(/^data:image\/png;base64,/, ""));
          y += sliceH;
        }
        resolve(slices);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = `data:image/png;base64,${base64}`;
    });
  }

  async function copyImage(imageBase64: string, pageUrl: string) {
    try {
      const res = await fetch(`data:image/png;base64,${imageBase64}`);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopiedUrl(pageUrl);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      // clipboard API unavailable or denied
    }
  }

  function openCookieModal() {
    const urlsToCapture = Array.from(selected);
    if (urlsToCapture.length === 0) return;
    setScreenshotError(null);
    setPendingUrls(urlsToCapture);
    setCookieSelector("");
    setPreviewImage(null);
    setPreviewError(null);
    setSelectorError(null);
    setShowCookieModal(true);
    setPreviewLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/screenshot-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlsToCapture[0] }),
        });
        const data = await res.json();
        if (res.ok && data.imageBase64) setPreviewImage(data.imageBase64);
        else setPreviewError(data.error ?? "Failed to load preview");
      } catch {
        setPreviewError("Failed to load preview");
      } finally {
        setPreviewLoading(false);
      }
    })();
  }

  function handlePreviewClick(e: React.MouseEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const x = Math.round((offsetX / rect.width) * 1280);
    const y = Math.round((offsetY / rect.height) * 720);
    setSelectorError(null);
    setSelectorResolving(true);
    (async () => {
      try {
        const res = await fetch("/api/element-selector", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: pendingUrls[0], x, y }),
        });
        const data = await res.json();
        if (res.ok && data.selector) setCookieSelector(data.selector);
        else setSelectorError(data.error ?? "No element found at that point");
      } catch {
        setSelectorError("Failed to get selector");
      } finally {
        setSelectorResolving(false);
      }
    })();
  }

  async function runScreenshots(withSelector: string | undefined) {
    setShowCookieModal(false);
    setScreenshotError(null);
    setScreenshotLoading(true);
    setScreenshots([]);
    try {
      const res = await fetch("/api/screenshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: pendingUrls,
          cookieSelector: withSelector || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Screenshots failed");
      setScreenshots(data.screenshots ?? []);
    } catch (err) {
      setScreenshotError(
        err instanceof Error ? err.message : "Screenshots failed"
      );
    } finally {
      setScreenshotLoading(false);
    }
  }

  async function handleScreenshots() {
    openCookieModal();
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight mb-8">
          URL Crawler & Screenshot
        </h1>

        {/* Step 1: URL input and crawl */}
        <section className="mb-10">
          <h2 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Step 1: Enter URL to crawl
          </h2>
          <form onSubmit={handleCrawl} className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 min-w-[200px] rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
              disabled={crawlLoading}
            />
            <button
              type="submit"
              disabled={crawlLoading}
              className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-5 py-2.5 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50"
            >
              {crawlLoading ? "Crawling…" : "Crawl"}
            </button>
          </form>
          {crawlError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {crawlError}
            </p>
          )}
        </section>

        {/* Step 2: Link list and selection */}
        {links.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Step 2: Select pages to screenshot
            </h2>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleScreenshots}
                disabled={selected.size === 0 || screenshotLoading}
                className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-1.5 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50"
              >
                {screenshotLoading
                  ? "Capturing…"
                  : `Take screenshots (${selected.size})`}
              </button>
            </div>
            <ul className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700 max-h-80 overflow-y-auto">
              {links.map((link) => (
                <li key={link.url} className="flex items-center gap-3 px-4 py-2">
                  <input
                    type="checkbox"
                    id={link.url}
                    checked={selected.has(link.url)}
                    onChange={() => toggleSelect(link.url)}
                    className="rounded border-zinc-300 dark:border-zinc-600"
                  />
                  <label
                    htmlFor={link.url}
                    className="flex-1 min-w-0 text-sm cursor-pointer truncate"
                  >
                    {link.label || link.url}
                  </label>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400 shrink-0"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
            {screenshotError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {screenshotError}
              </p>
            )}
          </section>
        )}

        {/* Step 3: Screenshot gallery */}
        {screenshots.length > 0 && (
          <section className="space-y-8">
            <div>
              <h2 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Screenshots
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {screenshots.map((item) => (
                <div
                  key={item.url}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm"
                >
                  {item.imageBase64 ? (
                    <div
                      className="h-48 overflow-hidden cursor-pointer bg-zinc-100 dark:bg-zinc-900"
                      onClick={() => setModalScreenshot(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setModalScreenshot(item)}
                      aria-label="View full screenshot"
                    >
                      <img
                        src={`data:image/png;base64,${item.imageBase64}`}
                        alt={item.url}
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video flex items-center justify-center bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 text-sm p-4">
                      {item.error ?? "Failed"}
                    </div>
                  )}
                  <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 flex flex-col gap-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:underline truncate block"
                    >
                      {item.url}
                    </a>
                    {item.imageBase64 && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => downloadImage(item.imageBase64!, item.url)}
                          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => copyImage(item.imageBase64!, item.url)}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                            copiedUrl === item.url
                              ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                          }`}
                        >
                          {copiedUrl === item.url ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </div>

            <div className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 p-4">
              <h2 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Top 10 colours across the site
                <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400 ml-2">
                  (from headers, buttons, links and UI only — no images)
                </span>
              </h2>
              {colorsLoading ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Extracting colours from HTML/CSS…
                </p>
              ) : topColors.length > 0 ? (
                <div className="flex flex-wrap gap-4 items-center">
                  {topColors.map((hex) => (
                    <div
                      key={hex}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div
                        className="w-14 h-14 rounded-lg border-2 border-zinc-200 dark:border-zinc-600 shadow-sm"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                      <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                        {hex}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No colours found in styles or stylesheets.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Cookie consent modal */}
        {showCookieModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={(e) => e.target === e.currentTarget && setShowCookieModal(false)}
          >
            <div
              className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Select cookie consent button (optional)
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Click on the cookie/consent button in the preview below. We will click it on each page before taking screenshots. Or skip to take screenshots without dismissing the banner.
              </p>
              <div className="mb-4">
                {previewLoading ? (
                  <div className="aspect-video bg-zinc-200 dark:bg-zinc-700 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-sm">
                    Loading preview…
                  </div>
                ) : previewError ? (
                  <div className="aspect-video bg-zinc-200 dark:bg-zinc-700 rounded-lg flex flex-col items-center justify-center gap-2 text-zinc-600 dark:text-zinc-400 text-sm p-4">
                    <span>{previewError}</span>
                    <span className="text-xs">You can enter a CSS selector manually below.</span>
                  </div>
                ) : previewImage ? (
                  <img
                    src={`data:image/png;base64,${previewImage}`}
                    alt="Page preview – click the cookie button"
                    className="w-full h-auto rounded-lg border border-zinc-300 dark:border-zinc-600 cursor-crosshair"
                    style={{ maxHeight: "50vh" }}
                    onClick={handlePreviewClick}
                  />
                ) : null}
              </div>
              {selectorResolving && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                  Resolving selector…
                </p>
              )}
              {selectorError && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                  {selectorError}
                </p>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Cookie button selector
                </label>
                <input
                  type="text"
                  value={cookieSelector}
                  onChange={(e) => setCookieSelector(e.target.value)}
                  placeholder="e.g. #accept-cookies or .cookie-banner button"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => runScreenshots(undefined)}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => runScreenshots(cookieSelector || undefined)}
                  className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300"
                >
                  Take screenshots
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full-page screenshot modal */}
        {modalScreenshot && modalScreenshot.imageBase64 && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => {
              setModalScreenshot(null);
              setSlices(null);
              setSliceMessage(null);
            }}
          >
            <div
              className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 p-3 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
                <a
                  href={modalScreenshot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-600 dark:text-zinc-400 hover:underline truncate min-w-0"
                >
                  {modalScreenshot.url}
                </a>
                <div className="flex items-center gap-2 shrink-0">
                  {slices === null ? (
                    <>
                      <button
                        type="button"
                        disabled={sliceLoading}
                        onClick={async () => {
                          setSliceLoading(true);
                          setSlices(null);
                          setSliceMessage(null);
                          try {
                            const result = await sliceImageForFigma(
                              modalScreenshot.imageBase64!
                            );
                            if (result.length > 1) setSlices(result);
                            else {
                              setSliceMessage(
                                "Image is already under Figma's 4096px limit"
                              );
                              setTimeout(() => setSliceMessage(null), 4000);
                            }
                          } catch {
                            setSliceMessage("Failed to slice image");
                            setTimeout(() => setSliceMessage(null), 4000);
                          } finally {
                            setSliceLoading(false);
                          }
                        }}
                        className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {sliceLoading ? "Slicing…" : "Slice for Figma"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadImage(
                            modalScreenshot.imageBase64!,
                            modalScreenshot.url
                          )
                        }
                        className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          copyImage(
                            modalScreenshot.imageBase64!,
                            modalScreenshot.url
                          )
                        }
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                          copiedUrl === modalScreenshot.url
                            ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {copiedUrl === modalScreenshot.url ? "Copied!" : "Copy"}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setModalScreenshot(null);
                      setSlices(null);
                      setSliceMessage(null);
                    }}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    aria-label="Close"
                  >
                    Close
                  </button>
                </div>
              </div>
              {sliceMessage && (
                <p className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700/50 border-b border-zinc-200 dark:border-zinc-700">
                  {sliceMessage}
                </p>
              )}
              <div className="overflow-y-auto max-h-[85vh] p-2">
                {slices === null ? (
                  <img
                    src={`data:image/png;base64,${modalScreenshot.imageBase64}`}
                    alt={modalScreenshot.url}
                    className="w-full h-auto block"
                  />
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Sliced into {slices.length} parts (max 4096px height each).
                      Copy or download each for Figma.
                    </p>
                    <div className="space-y-3">
                      {slices.map((sliceBase64, idx) => {
                        const sliceId = `${modalScreenshot.url}-slice-${idx}`;
                        let baseFilename = "screenshot";
                        try {
                          const u = new URL(modalScreenshot.url);
                          baseFilename = u.hostname.replace(/\./g, "-");
                        } catch {
                          // keep default
                        }
                        const filename = `${baseFilename}-slice-${idx + 1}.png`;
                        return (
                          <div
                            key={idx}
                            className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-50 dark:bg-zinc-900"
                          >
                            <div className="p-2 flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                Slice {idx + 1} of {slices.length}
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadImage(
                                      sliceBase64,
                                      modalScreenshot.url,
                                      filename
                                    )
                                  }
                                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                >
                                  Download
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyImage(sliceBase64, sliceId)}
                                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                                    copiedUrl === sliceId
                                      ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                      : "border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                  }`}
                                >
                                  {copiedUrl === sliceId ? "Copied!" : "Copy"}
                                </button>
                              </div>
                            </div>
                            <div className="max-h-48 overflow-hidden">
                              <img
                                src={`data:image/png;base64,${sliceBase64}`}
                                alt={`Slice ${idx + 1}`}
                                className="w-full h-auto block"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
