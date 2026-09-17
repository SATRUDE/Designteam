"use client";

import { useRef, useState, useEffect } from "react";
import JSZip from "jszip";
import { buildImportPayload } from "@/lib/figma/import-payload";
import type { FigmaPublishItemInput } from "@/lib/figma/types";

type CrawlLink = { url: string; label?: string };
type ScreenshotResult = {
  url: string;
  images?: {
    desktop?: string;
    mobile?: string;
  };
  error?: string;
};
type ScreenshotStreamProgress = {
  total: number;
  completed: number;
  failed: number;
};
type CookieSelectorPayload =
  | string
  | { frameSelector: string; innerSelector: string };

type ModuleResult = {
  id: string;
  label?: string;
  images?: { desktop?: string; mobile?: string };
};
type BulkDownloadOptions = {
  desktop: boolean;
  mobile: boolean;
  sliceForFigma: boolean;
};
type PublishMode = "desktop" | "mobile";
type PublishImage = { name: string; base64: string };
type PublishItem = {
  url: string;
  mode: PublishMode;
  images: PublishImage[];
};

type Box = {
  id: string;
  // normalized (0..1) relative to the rendered image container
  x: number;
  y: number;
  w: number;
  h: number;
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
  const [captureTotal, setCaptureTotal] = useState(0);
  const [captureCompleted, setCaptureCompleted] = useState(0);
  const [captureFailed, setCaptureFailed] = useState(0);
  const [captureElapsedSec, setCaptureElapsedSec] = useState(0);
  const [topColors, setTopColors] = useState<string[]>([]);
  const [colorsLoading, setColorsLoading] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [cookieSelector, setCookieSelector] = useState<CookieSelectorPayload>("");
  const [selectorResolving, setSelectorResolving] = useState(false);
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [showViewportModal, setShowViewportModal] = useState(false);
  const [captureDesktop, setCaptureDesktop] = useState(true);
  const [captureMobile, setCaptureMobile] = useState(false);
  const [collectColors, setCollectColors] = useState(true);
  const [pendingCookieSelector, setPendingCookieSelector] =
    useState<CookieSelectorPayload | undefined>(undefined);
  const [lastCookieSelector, setLastCookieSelector] =
    useState<CookieSelectorPayload | undefined>(undefined);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [modalScreenshot, setModalScreenshot] =
    useState<ScreenshotResult | null>(null);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<"desktop" | "mobile">("desktop");
  const [pageSubview, setPageSubview] = useState<"screenshot" | "modules">(
    "screenshot"
  );
  const [slices, setSlices] = useState<string[] | null>(null);
  const [sliceLoading, setSliceLoading] = useState(false);
  const [sliceMessage, setSliceMessage] = useState<string | null>(null);

  const [modulesByKey, setModulesByKey] = useState<
    Record<string, ModuleResult[]>
  >({});
  const [modulesLoadingByKey, setModulesLoadingByKey] = useState<
    Record<string, boolean>
  >({});
  const [modulesErrorByKey, setModulesErrorByKey] = useState<
    Record<string, string | null>
  >({});
  const [moduleSlicesByKey, setModuleSlicesByKey] = useState<
    Record<string, string[] | null>
  >({});
  const [moduleSliceLoadingKey, setModuleSliceLoadingKey] = useState<
    string | null
  >(null);
  const [moduleSliceMessageByKey, setModuleSliceMessageByKey] = useState<
    Record<string, string | null>
  >({});
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<Set<string>>(
    new Set()
  );
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);
  const [sliceUiMode, setSliceUiMode] = useState<
    "home" | "draw-sections" | "detect-modules" | "code-modules" | "slice-for-figma"
  >("home");
  const [autoDetectSensitivity, setAutoDetectSensitivity] = useState(50); // 0..100
  const lastAutoDetectSigRef = useRef<string | null>(null);
  const [boxesByKey, setBoxesByKey] = useState<Record<string, Box[]>>({});
  const [selectedBoxIdsByKey, setSelectedBoxIdsByKey] = useState<
    Record<string, string[]>
  >({});
  const [boxModeByKey, setBoxModeByKey] = useState<Record<string, boolean>>({});
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const modulesMenuRef = useRef<HTMLDetailsElement | null>(null);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const dragStateRef = useRef<
    | null
    | {
        keyRoot: string;
        boxId: string;
        mode: "new" | "move" | "nw" | "ne" | "sw" | "se";
        pointerId: number;
        startX: number;
        startY: number;
        startBox: Box;
      }
  >(null);
  const [copyNotice, setCopyNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showDownloadAllModal, setShowDownloadAllModal] = useState(false);
  const [downloadDesktop, setDownloadDesktop] = useState(true);
  const [downloadMobile, setDownloadMobile] = useState(false);
  const [downloadSliceForFigma, setDownloadSliceForFigma] = useState(false);
  const [downloadZipBusy, setDownloadZipBusy] = useState(false);
  const [downloadZipMessage, setDownloadZipMessage] = useState<string | null>(null);
  const [downloadZipError, setDownloadZipError] = useState<string | null>(null);
  const [downloadZipSuccess, setDownloadZipSuccess] = useState<string | null>(null);
  const [showExportPluginModal, setShowExportPluginModal] = useState(false);
  const [publishDesktop, setPublishDesktop] = useState(true);
  const [publishMobile, setPublishMobile] = useState(false);
  const [publishSliceForFigma, setPublishSliceForFigma] = useState(true);
  const [publishPagePrefix, setPublishPagePrefix] = useState("Crawler import");
  const [exportPluginBusy, setExportPluginBusy] = useState(false);
  const [exportPluginMessage, setExportPluginMessage] = useState<string | null>(null);
  const [exportPluginError, setExportPluginError] = useState<string | null>(null);
  const [exportPluginSuccess, setExportPluginSuccess] = useState<string | null>(null);

  function Spinner({ className }: { className?: string }) {
    return (
      <svg
        className={`animate-spin ${className ?? "h-4 w-4"}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
    );
  }

  function modulesKey(pageUrl: string, mode: "desktop" | "mobile") {
    return `${pageUrl}:${mode}`;
  }

  function clamp01(n: number) {
    return Math.min(1, Math.max(0, n));
  }

  function normalizeBox(b: Box): Box {
    const x0 = clamp01(b.x);
    const y0 = clamp01(b.y);
    const x1 = clamp01(b.x + b.w);
    const y1 = clamp01(b.y + b.h);
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.max(0, Math.abs(x1 - x0));
    const h = Math.max(0, Math.abs(y1 - y0));
    return { ...b, x, y, w, h };
  }

  function getBoxList(keyRoot: string) {
    return boxesByKey[keyRoot] ?? [];
  }

  useEffect(() => {
    if (!collectColors || screenshots.length === 0 || screenshotLoading) {
      setTopColors([]);
      return;
    }
    const urls = screenshots
      .filter((s) => s.images?.desktop || s.images?.mobile)
      .map((s) => s.url);
    if (urls.length === 0) {
      setTopColors([]);
      return;
    }
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
  }, [screenshots, collectColors, screenshotLoading]);

  useEffect(() => {
    if (!screenshotLoading) {
      setCaptureElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    setCaptureElapsedSec(0);
    const id = window.setInterval(() => {
      setCaptureElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [screenshotLoading]);

  useEffect(() => {
    if (!downloadZipSuccess) return;
    const id = window.setTimeout(() => setDownloadZipSuccess(null), 5000);
    return () => window.clearTimeout(id);
  }, [downloadZipSuccess]);

  useEffect(() => {
    if (!exportPluginSuccess) return;
    const id = window.setTimeout(() => setExportPluginSuccess(null), 8000);
    return () => window.clearTimeout(id);
  }, [exportPluginSuccess]);

  useEffect(() => {
    // Keep selections and subview scoped to the currently viewed page + mode.
    setSelectedModuleKeys(new Set());
    setSelectedBoxIdsByKey({});
    setSliceUiMode("home");
    setPageSubview("screenshot");
  }, [modalScreenshot?.url, modalMode]);

  useEffect(() => {
    // Clear active box selection on page/mode changes.
    setActiveBoxId(null);
  }, [modalScreenshot?.url, modalMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (!modalScreenshot) return;

      const keyRoot = modulesKey(modalScreenshot.url, modalMode);
      const boxMode = boxModeByKey[keyRoot] ?? false;
      if (!boxMode) return;
      if (!activeBoxId) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTypingTarget) return;

      e.preventDefault();
      deleteBox(keyRoot, activeBoxId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeBoxId, boxModeByKey, modalMode, modalScreenshot]);

  useEffect(() => {
    if (!modalScreenshot) return;
    if (sliceUiMode !== "detect-modules") return;
    const sig = `${modalScreenshot.url}:${modalMode}:${autoDetectSensitivity}`;
    if (lastAutoDetectSigRef.current === sig) return;

    const id = window.setTimeout(() => {
      void runDetectModulesForUrl(modalScreenshot.url, modalMode);
    }, 250);
    return () => window.clearTimeout(id);
  }, [autoDetectSensitivity, modalMode, modalScreenshot, sliceUiMode]);

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

  function screenshotFilenameStem(pageUrl: string) {
    try {
      const u = new URL(pageUrl);
      const host = u.hostname.replace(/\./g, "-");
      const path = u.pathname
        .replace(/\/+/g, "-")
        .replace(/[^a-zA-Z0-9-_]/g, "")
        .slice(0, 50);
      return `${host}${path && path !== "-" ? path : ""}`;
    } catch {
      return "screenshot";
    }
  }

  async function downloadAllModulesForUrl(
    pageUrl: string,
    mode: "desktop" | "mobile"
  ) {
    const key = modulesKey(pageUrl, mode);
    const list = modulesByKey[key] ?? [];
    if (!list.length) return;

    setDownloadAllBusy(true);
    try {
      let baseFilename = "module";
      try {
        const u = new URL(pageUrl);
        baseFilename = u.hostname.replace(/\./g, "-");
      } catch {
        // keep default
      }

      for (let idx = 0; idx < list.length; idx++) {
        const m = list[idx];
        const img = m?.images?.[mode] ?? m?.images?.desktop ?? m?.images?.mobile;
        if (!img) continue;
        const filename = `${baseFilename}-${mode}-module-${idx + 1}.png`;
        downloadImage(img, pageUrl, filename);
        // Small delay helps browsers process sequential downloads.
        await new Promise((r) => window.setTimeout(r, 60));
      }
    } finally {
      setDownloadAllBusy(false);
    }
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

  function openDownloadAllModal() {
    setDownloadZipError(null);
    setDownloadZipSuccess(null);
    const nextDesktop = captureDesktop || (!captureDesktop && !captureMobile);
    const nextMobile = captureMobile;
    setDownloadDesktop(nextDesktop);
    setDownloadMobile(nextMobile);
    setDownloadSliceForFigma(false);
    setShowDownloadAllModal(true);
  }

  async function downloadAllScreenshotsAsZip(options: BulkDownloadOptions) {
    if (!options.desktop && !options.mobile) {
      setDownloadZipError("Select at least one image type to download.");
      return;
    }

    const selectedModes: ("desktop" | "mobile")[] = [];
    if (options.desktop) selectedModes.push("desktop");
    if (options.mobile) selectedModes.push("mobile");

    setShowDownloadAllModal(false);
    setDownloadZipBusy(true);
    setDownloadZipError(null);
    setDownloadZipSuccess(null);
    setDownloadZipMessage("Preparing files...");

    try {
      const zip = new JSZip();
      let addedCount = 0;

      for (const item of screenshots) {
        for (const mode of selectedModes) {
          const image = item.images?.[mode];
          if (!image) continue;

          const stem = screenshotFilenameStem(item.url);
          if (options.sliceForFigma) {
            setDownloadZipMessage(`Slicing ${stem} (${mode})...`);
            const slices = await sliceImageForFigma(image);
            if (slices.length <= 1) {
              zip.file(`${stem}-${mode}.png`, slices[0] ?? image, { base64: true });
              addedCount += 1;
            } else {
              slices.forEach((slice, idx) => {
                zip.file(`${stem}-${mode}-slice-${idx + 1}.png`, slice, {
                  base64: true,
                });
                addedCount += 1;
              });
            }
          } else {
            zip.file(`${stem}-${mode}.png`, image, { base64: true });
            addedCount += 1;
          }
        }
      }

      if (addedCount === 0) {
        throw new Error("No screenshots available for the selected options.");
      }

      setDownloadZipMessage("Building ZIP...");
      const blob = await zip.generateAsync({ type: "blob" });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const downloadName = `designteam-screenshots-${ts}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(url);

      setDownloadZipSuccess(
        `Download complete: ${addedCount} file${addedCount === 1 ? "" : "s"} in ${downloadName}`
      );
    } catch (err) {
      setDownloadZipError(
        err instanceof Error ? err.message : "Failed to build download ZIP."
      );
    } finally {
      setDownloadZipBusy(false);
      setDownloadZipMessage(null);
    }
  }

  function openExportPluginModal() {
    setExportPluginError(null);
    setExportPluginSuccess(null);
    const nextDesktop = captureDesktop || (!captureDesktop && !captureMobile);
    const nextMobile = captureMobile;
    setPublishDesktop(nextDesktop);
    setPublishMobile(nextMobile);
    setPublishSliceForFigma(true);
    setShowExportPluginModal(true);
  }

  async function buildPublishItems(options: {
    desktop: boolean;
    mobile: boolean;
  }): Promise<PublishItem[]> {
    const modes: PublishMode[] = [];
    if (options.desktop) modes.push("desktop");
    if (options.mobile) modes.push("mobile");
    const items: PublishItem[] = [];

    for (const shot of screenshots) {
      for (const mode of modes) {
        const image = shot.images?.[mode];
        if (!image) continue;
        const stem = screenshotFilenameStem(shot.url);

        items.push({
          url: shot.url,
          mode,
          images: [{ name: `${stem}-${mode}.png`, base64: image }],
        });
      }
    }
    return items;
  }

  async function prepareExportItems(options: {
    desktop: boolean;
    mobile: boolean;
    sliceForFigma: boolean;
  }): Promise<FigmaPublishItemInput[]> {
    const base = await buildPublishItems({
      desktop: options.desktop,
      mobile: options.mobile,
    });
    if (!options.sliceForFigma) return base;

    const out: FigmaPublishItemInput[] = [];
    for (const item of base) {
      const nextImages: { name: string; base64: string }[] = [];
      for (const img of item.images) {
        const slices = await sliceImageForFigma(img.base64);
        if (slices.length <= 1) {
          nextImages.push(img);
        } else {
          const stem = img.name.replace(/\.png$/i, "");
          slices.forEach((slice, idx) => {
            nextImages.push({
              name: `${stem}-slice-${String(idx + 1).padStart(2, "0")}.png`,
              base64: slice,
            });
          });
        }
      }
      out.push({ ...item, images: nextImages });
    }
    return out;
  }

  async function downloadFigmaPluginJson() {
    if (!publishDesktop && !publishMobile) {
      setExportPluginError("Select at least Desktop or Mobile.");
      return;
    }

    setShowExportPluginModal(false);
    setExportPluginBusy(true);
    setExportPluginError(null);
    setExportPluginSuccess(null);
    setExportPluginMessage("Preparing export…");

    try {
      const items = await prepareExportItems({
        desktop: publishDesktop,
        mobile: publishMobile,
        sliceForFigma: publishSliceForFigma,
      });
      if (!items.length) {
        throw new Error("No screenshots available for the selected export options.");
      }

      const payload = buildImportPayload(items, publishPagePrefix.trim() || "Crawler import");
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `designteam-figma-import-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);

      setExportPluginSuccess(
        "Import file downloaded. In Figma, run the Designteam Import plugin and choose this JSON file."
      );
    } catch (err) {
      setExportPluginError(
        err instanceof Error ? err.message : "Failed to build Figma import file."
      );
    } finally {
      setExportPluginBusy(false);
      setExportPluginMessage(null);
    }
  }

  async function cropScreenshotIntoModules(base64: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          reject(new Error("Invalid image"));
          return;
        }

        const analysisCanvas = document.createElement("canvas");
        analysisCanvas.width = w;
        analysisCanvas.height = h;
        const actx = analysisCanvas.getContext("2d", { willReadFrequently: true });
        if (!actx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        actx.drawImage(img, 0, 0);
        const imageData = actx.getImageData(0, 0, w, h).data;

        const sampleStepX = Math.max(4, Math.floor(w / 200)); // ~200 samples across
        const energy = new Float64Array(h);
        for (let y = 1; y < h; y++) {
          let e = 0;
          const row = y * w * 4;
          const prev = (y - 1) * w * 4;
          for (let x = 0; x < w; x += sampleStepX) {
            const idx = row + x * 4;
            const pidx = prev + x * 4;
            e += Math.abs(imageData[idx] - imageData[pidx]);
            e += Math.abs(imageData[idx + 1] - imageData[pidx + 1]);
            e += Math.abs(imageData[idx + 2] - imageData[pidx + 2]);
          }
          energy[y] = e;
        }

        const smoothWindow = 25; // rows
        const smoothed = new Float64Array(h);
        let running = 0;
        for (let y = 0; y < h; y++) {
          running += energy[y];
          if (y - smoothWindow >= 0) running -= energy[y - smoothWindow];
          const denom = Math.min(y + 1, smoothWindow);
          smoothed[y] = running / denom;
        }

        const margin = 40;
        const values: number[] = [];
        for (let y = margin; y < h - margin; y++) values.push(smoothed[y]);
        values.sort((a, b) => a - b);
        const p10 = values[Math.floor(values.length * 0.1)] ?? 0;
        const threshold = p10 * 1.05; // allow slightly above lowest band

        const cuts: number[] = [0];
        const minGap = 140;
        const localRadius = 25;
        let lastCut = 0;

        for (let y = margin; y < h - margin; y++) {
          if (y - lastCut < minGap) continue;
          const v = smoothed[y];
          if (v > threshold) continue;
          let isMin = true;
          for (
            let yy = Math.max(margin, y - localRadius);
            yy <= Math.min(h - margin - 1, y + localRadius);
            yy++
          ) {
            if (smoothed[yy] < v) {
              isMin = false;
              break;
            }
          }
          if (!isMin) continue;
          cuts.push(y);
          lastCut = y;
        }
        cuts.push(h);

        // Merge tiny segments created by noise
        const segments: Array<{ y0: number; y1: number }> = [];
        for (let i = 0; i < cuts.length - 1; i++) {
          const y0 = cuts[i];
          const y1 = cuts[i + 1];
          if (y1 - y0 < 80) continue;
          segments.push({ y0, y1 });
        }
        if (segments.length === 0) segments.push({ y0: 0, y1: h });

        const slices: string[] = [];
        for (const seg of segments) {
          const sliceH = Math.max(1, seg.y1 - seg.y0);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = sliceH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas context unavailable"));
            return;
          }
          ctx.drawImage(img, 0, seg.y0, w, sliceH, 0, 0, w, sliceH);
          const dataUrl = canvas.toDataURL("image/png");
          slices.push(dataUrl.replace(/^data:image\/png;base64,/, ""));
        }
        resolve(slices);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = `data:image/png;base64,${base64}`;
    });
  }

  async function detectModuleSegments(
    base64: string,
    opts?: { thresholdMultiplier?: number; minGap?: number; smoothWindow?: number }
  ): Promise<{
    w: number;
    h: number;
    segments: Array<{ y0: number; y1: number }>;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          reject(new Error("Invalid image"));
          return;
        }

        const analysisCanvas = document.createElement("canvas");
        analysisCanvas.width = w;
        analysisCanvas.height = h;
        const actx = analysisCanvas.getContext("2d", { willReadFrequently: true });
        if (!actx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        actx.drawImage(img, 0, 0);
        const imageData = actx.getImageData(0, 0, w, h).data;

        const sampleStepX = Math.max(4, Math.floor(w / 200)); // ~200 samples across
        const energy = new Float64Array(h);
        for (let y = 1; y < h; y++) {
          let e = 0;
          const row = y * w * 4;
          const prev = (y - 1) * w * 4;
          for (let x = 0; x < w; x += sampleStepX) {
            const idx = row + x * 4;
            const pidx = prev + x * 4;
            e += Math.abs(imageData[idx] - imageData[pidx]);
            e += Math.abs(imageData[idx + 1] - imageData[pidx + 1]);
            e += Math.abs(imageData[idx + 2] - imageData[pidx + 2]);
          }
          energy[y] = e;
        }

        const smoothWindow = Math.max(5, Math.floor(opts?.smoothWindow ?? 25)); // rows
        const smoothed = new Float64Array(h);
        let running = 0;
        for (let y = 0; y < h; y++) {
          running += energy[y];
          if (y - smoothWindow >= 0) running -= energy[y - smoothWindow];
          const denom = Math.min(y + 1, smoothWindow);
          smoothed[y] = running / denom;
        }

        const margin = 40;
        const values: number[] = [];
        for (let y = margin; y < h - margin; y++) values.push(smoothed[y]);
        values.sort((a, b) => a - b);
        const p10 = values[Math.floor(values.length * 0.1)] ?? 0;
        const thresholdMultiplier = opts?.thresholdMultiplier ?? 1.05;
        const threshold = p10 * thresholdMultiplier;

        let cuts: number[] = [0];
        const minGap = Math.max(60, Math.floor(opts?.minGap ?? 140));
        const localRadius = 25;
        let lastCut = 0;
        const bandHalf = 6;
        const varianceThreshold = 400; // lower = require flatter band

        for (let y = margin; y < h - margin; y++) {
          if (y - lastCut < minGap) continue;
          const v = smoothed[y];
          if (v > threshold) continue;
          let isMin = true;
          for (
            let yy = Math.max(margin, y - localRadius);
            yy <= Math.min(h - margin - 1, y + localRadius);
            yy++
          ) {
            if (smoothed[yy] < v) {
              isMin = false;
              break;
            }
          }
          if (!isMin) continue;

          // Whitespace / flat-band confirmation: require low brightness variance
          let sum = 0;
          let sumSq = 0;
          let count = 0;
          for (
            let yy = Math.max(0, y - bandHalf);
            yy <= Math.min(h - 1, y + bandHalf);
            yy++
          ) {
            const row = yy * w * 4;
            for (let x = 0; x < w; x += sampleStepX) {
              const idx = row + x * 4;
              const r = imageData[idx];
              const g = imageData[idx + 1];
              const b = imageData[idx + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              sum += lum;
              sumSq += lum * lum;
              count++;
            }
          }
          if (count > 0) {
            const mean = sum / count;
            const variance = sumSq / count - mean * mean;
            if (variance > varianceThreshold) continue;
          }

          cuts.push(y);
          lastCut = y;
        }
        cuts.push(h);

        // Second pass: if any segment is very tall, try to insert an extra cut
        const maxTall = Math.max(600, Math.floor(h * 0.45));
        const extraCuts: number[] = [];
        for (let i = 0; i < cuts.length - 1; i++) {
          const y0 = cuts[i];
          const y1 = cuts[i + 1];
          const height = y1 - y0;
          if (height <= maxTall * 1.2) continue;

          let bestY = -1;
          let bestV = Number.POSITIVE_INFINITY;
          const innerStart = y0 + minGap;
          const innerEnd = y1 - minGap;
          for (let y = Math.max(margin, innerStart); y < Math.min(h - margin, innerEnd); y++) {
            const v = smoothed[y];
            if (v >= threshold * 1.3) continue;
            if (v < bestV) {
              bestV = v;
              bestY = y;
            }
          }
          if (bestY > 0) extraCuts.push(bestY);
        }

        if (extraCuts.length) {
          cuts = Array.from(new Set([...cuts, ...extraCuts])).sort((a, b) => a - b);
        }

        const segments: Array<{ y0: number; y1: number }> = [];
        for (let i = 0; i < cuts.length - 1; i++) {
          const y0 = cuts[i];
          const y1 = cuts[i + 1];
          if (y1 - y0 < 80) continue;
          segments.push({ y0, y1 });
        }
        if (segments.length === 0) segments.push({ y0: 0, y1: h });

        resolve({ w, h, segments });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = `data:image/png;base64,${base64}`;
    });
  }

  function loadPngImage(base64: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = `data:image/png;base64,${base64}`;
    });
  }

  async function mergeModuleImagesVertical(base64s: string[]): Promise<string> {
    const imgs = await Promise.all(base64s.map(loadPngImage));
    const widths = imgs.map((i) => i.naturalWidth || i.width);
    const heights = imgs.map((i) => i.naturalHeight || i.height);
    const w = Math.max(1, ...widths);
    const h = heights.reduce((sum, v) => sum + Math.max(0, v), 0);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = Math.max(1, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let y = 0;
    for (const img of imgs) {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const x = Math.floor((w - iw) / 2);
      ctx.drawImage(img, x, y, iw, ih);
      y += ih;
    }

    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.replace(/^data:image\/png;base64,/, "");
  }

  function toggleModuleSelected(key: string) {
    setSelectedModuleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function mergeSelectedModulesForUrl(
    targetUrl: string,
    mode: "desktop" | "mobile"
  ) {
    const keyRoot = modulesKey(targetUrl, mode);
    const modules = modulesByKey[keyRoot] ?? [];
    const selected = new Set(selectedModuleKeys);
    const selectedWithIndex = modules
      .map((m, idx) => ({ m, idx, key: `${targetUrl}:${mode}:${m.id}` }))
      .filter((x) => selected.has(x.key));

    if (selectedWithIndex.length < 2) return;
    selectedWithIndex.sort((a, b) => a.idx - b.idx);

    const imagesToMerge = selectedWithIndex
      .map(({ m }) => m.images?.[mode] ?? m.images?.desktop ?? m.images?.mobile)
      .filter((v): v is string => !!v);

    if (imagesToMerge.length < 2) return;

    try {
      const mergedBase64 = await mergeModuleImagesVertical(imagesToMerge);
      const first = selectedWithIndex[0];
      const last = selectedWithIndex[selectedWithIndex.length - 1];
      const merged: ModuleResult = {
        id: `merged-${Date.now()}`,
        label: `Merged ${first.m.label ?? first.m.id} – ${last.m.label ?? last.m.id}`,
        images: {
          ...first.m.images,
          [mode]: mergedBase64,
        },
      };

      const selectedIdx = new Set(selectedWithIndex.map((x) => x.idx));
      const nextModules: ModuleResult[] = [];
      for (let i = 0; i < modules.length; i++) {
        if (i === first.idx) nextModules.push(merged);
        if (!selectedIdx.has(i)) nextModules.push(modules[i]);
      }

      // Remove the duplicate entry at first.idx (since we re-added it above).
      // The loop above adds merged at first.idx but still adds modules[first.idx] unless selected.
      // Because first.idx is selected, it will not be added, so no extra cleanup needed.

      setModulesByKey((prev) => ({ ...prev, [keyRoot]: nextModules }));
      setSelectedModuleKeys(new Set());
    } catch (err) {
      setModulesErrorByKey((prev) => ({
        ...prev,
        [keyRoot]:
          err instanceof Error ? err.message : "Failed to merge modules",
      }));
    }
  }

  function getRelativePoint(e: React.PointerEvent) {
    const el = imageContainerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: clamp01(x), y: clamp01(y) };
  }

  function upsertBox(keyRoot: string, next: Box) {
    setBoxesByKey((prev) => {
      const list = prev[keyRoot] ?? [];
      const idx = list.findIndex((b) => b.id === next.id);
      const normalized = normalizeBox(next);
      const nextList =
        idx >= 0
          ? list.map((b) => (b.id === next.id ? normalized : b))
          : [...list, normalized];
      return { ...prev, [keyRoot]: nextList };
    });
  }

  function deleteBox(keyRoot: string, boxId: string) {
    setBoxesByKey((prev) => {
      const list = prev[keyRoot] ?? [];
      const nextList = list.filter((b) => b.id !== boxId);
      const next = { ...prev, [keyRoot]: nextList };
      return next;
    });
    setSelectedBoxIdsByKey((prev) => {
      const current = prev[keyRoot] ?? [];
      if (!current.length) return prev;
      const next = current.filter((id) => id !== boxId);
      return { ...prev, [keyRoot]: next };
    });
    setActiveBoxId((prev) => (prev === boxId ? null : prev));
  }

  function toggleBoxSelected(keyRoot: string, boxId: string) {
    setSelectedBoxIdsByKey((prev) => {
      const current = prev[keyRoot] ?? [];
      const has = current.includes(boxId);
      const next = has ? current.filter((id) => id !== boxId) : [...current, boxId];
      return { ...prev, [keyRoot]: next };
    });
  }

  function setSingleBoxSelected(keyRoot: string, boxId: string) {
    setSelectedBoxIdsByKey((prev) => ({ ...prev, [keyRoot]: [boxId] }));
  }

  function mergeSelectedBoxes(keyRoot: string) {
    const selectedIds = selectedBoxIdsByKey[keyRoot] ?? [];
    if (selectedIds.length < 2) return;

    const list = boxesByKey[keyRoot] ?? [];
    const selected = list.filter((b) => selectedIds.includes(b.id));
    if (selected.length < 2) return;

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const b of selected) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }

    const mergedId = `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const merged: Box = normalizeBox({
      id: mergedId,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    });

    setBoxesByKey((prev) => {
      const current = prev[keyRoot] ?? [];
      const nextList = [...current.filter((b) => !selectedIds.includes(b.id)), merged];
      return { ...prev, [keyRoot]: nextList };
    });
    setSelectedBoxIdsByKey((prev) => ({ ...prev, [keyRoot]: [mergedId] }));
    setActiveBoxId(mergedId);
  }

  function startDrag(
    e: React.PointerEvent,
    keyRoot: string,
    box: Box,
    mode: "new" | "move" | "nw" | "ne" | "sw" | "se"
  ) {
    const pt = getRelativePoint(e);
    if (!pt) return;
    // Capture on the shared container so move/up events are consistent.
    imageContainerRef.current?.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      keyRoot,
      boxId: box.id,
      mode,
      pointerId: e.pointerId,
      startX: pt.x,
      startY: pt.y,
      startBox: box,
    };
    setActiveBoxId(box.id);
  }

  function onOverlayPointerMove(e: React.PointerEvent) {
    const st = dragStateRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const pt = getRelativePoint(e);
    if (!pt) return;

    const dx = pt.x - st.startX;
    const dy = pt.y - st.startY;
    const b = st.startBox;
    let next: Box = b;

    if (st.mode === "new") {
      next = { ...b, w: dx, h: dy };
    } else if (st.mode === "move") {
      next = { ...b, x: b.x + dx, y: b.y + dy };
    } else {
      // resize from corners
      const x0 = b.x;
      const y0 = b.y;
      const x1 = b.x + b.w;
      const y1 = b.y + b.h;
      let nx0 = x0;
      let ny0 = y0;
      let nx1 = x1;
      let ny1 = y1;
      if (st.mode === "nw") {
        nx0 = x0 + dx;
        ny0 = y0 + dy;
      } else if (st.mode === "ne") {
        nx1 = x1 + dx;
        ny0 = y0 + dy;
      } else if (st.mode === "sw") {
        nx0 = x0 + dx;
        ny1 = y1 + dy;
      } else if (st.mode === "se") {
        nx1 = x1 + dx;
        ny1 = y1 + dy;
      }
      next = { ...b, x: nx0, y: ny0, w: nx1 - nx0, h: ny1 - ny0 };
    }

    upsertBox(st.keyRoot, next);
  }

  function onOverlayPointerUp(e: React.PointerEvent) {
    const st = dragStateRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    dragStateRef.current = null;

    // Enforce a minimum size (in normalized units based on container size).
    const el = imageContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const minPx = 24;
    const minW = minPx / Math.max(1, rect.width);
    const minH = minPx / Math.max(1, rect.height);

    setBoxesByKey((prev) => {
      const list = prev[st.keyRoot] ?? [];
      const nextList = list.filter((b) => b.w >= minW && b.h >= minH);
      return { ...prev, [st.keyRoot]: nextList };
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
      setCopyNotice({ type: "success", text: "Copied image to clipboard." });
      setTimeout(() => setCopiedUrl(null), 2000);
      setTimeout(() => setCopyNotice(null), 2500);
    } catch {
      // Fallback: try copying a data URL as text, otherwise show an error
      try {
        const dataUrl = `data:image/png;base64,${imageBase64}`;
        await navigator.clipboard.writeText(dataUrl);
        setCopyNotice({
          type: "success",
          text: "Copied image data URL (image clipboard not supported).",
        });
        setTimeout(() => setCopyNotice(null), 3500);
      } catch {
        setCopyNotice({
          type: "error",
          text:
            "Copy failed (browser/permission limitation). Try Download or Slice.",
        });
        setTimeout(() => setCopyNotice(null), 4000);
      }
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
        if (res.ok) {
          if (data.selector) setCookieSelector(data.selector);
          else if (data.frameSelector && data.innerSelector)
            setCookieSelector({
              frameSelector: data.frameSelector,
              innerSelector: data.innerSelector,
            });
          else setSelectorError(data.error ?? "No element found at that point");
        } else setSelectorError(data.error ?? "No element found at that point");
      } catch {
        setSelectorError("Failed to get selector");
      } finally {
        setSelectorResolving(false);
      }
    })();
  }

  async function runScreenshots(
    withSelector: CookieSelectorPayload | undefined,
    modes: ("desktop" | "mobile")[]
  ) {
    const requestedUrls = pendingUrls;
    setLastCookieSelector(withSelector);
    setShowViewportModal(false);
    setScreenshotError(null);
    setScreenshotLoading(true);
    setScreenshots([]);
    setCaptureTotal(requestedUrls.length);
    setCaptureCompleted(0);
    setCaptureFailed(0);
    try {
      const res = await fetch("/api/screenshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: requestedUrls,
          cookieSelector: withSelector || undefined,
          modes,
          ...(process.env.NEXT_PUBLIC_SCREENSHOT_NORMALIZE_FIXED === "false"
            ? { normalizeFixedChrome: false }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Screenshots failed");
      }
      if (!res.body) throw new Error("No screenshot stream returned");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let streamDone = false;

      while (!streamDone) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const frames = pending.split("\n\n");
        pending = frames.pop() ?? "";

        for (const frame of frames) {
          const lines = frame
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          if (!lines.length) continue;
          const eventLine = lines.find((line) => line.startsWith("event: "));
          const dataLine = lines.find((line) => line.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const eventName = eventLine.slice(7).trim();
          let payload: unknown;
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (eventName === "screenshot") {
            const item = payload as ScreenshotResult;
            setScreenshots((prev) => {
              const existing = prev.findIndex((s) => s.url === item.url);
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = item;
                return next;
              }
              const next = [...prev, item];
              next.sort(
                (a, b) =>
                  requestedUrls.indexOf(a.url) - requestedUrls.indexOf(b.url)
              );
              return next;
            });
            continue;
          }

          if (eventName === "progress") {
            const progress = payload as ScreenshotStreamProgress;
            setCaptureTotal(progress.total);
            setCaptureCompleted(progress.completed);
            setCaptureFailed(progress.failed);
            continue;
          }

          if (eventName === "error") {
            const errorPayload = payload as { error?: string };
            throw new Error(errorPayload.error ?? "Screenshots failed");
          }

          if (eventName === "done") {
            const donePayload = payload as ScreenshotStreamProgress;
            setCaptureTotal(donePayload.total);
            setCaptureCompleted(donePayload.completed);
            setCaptureFailed(donePayload.failed);
            streamDone = true;
            break;
          }
        }
      }
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

  function openViewportModal() {
    setCaptureDesktop(true);
    setCaptureMobile(false);
    setShowViewportModal(true);
  }

  function openModalForScreenshot(item: ScreenshotResult) {
    const index = screenshots.findIndex((s) => s.url === item.url);
    const hasDesktop = !!item.images?.desktop;
    const hasMobile = !!item.images?.mobile;
    const initialMode: "desktop" | "mobile" =
      hasDesktop || !hasMobile ? "desktop" : "mobile";
    setModalIndex(index >= 0 ? index : null);
    setModalMode(initialMode);
    setPageSubview("screenshot");
    setSlices(null);
    setSliceMessage(null);
    setModalScreenshot(item);
  }

  function openModalByIndex(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= screenshots.length) return;
    const item = screenshots[nextIndex];
    const hasDesktop = !!item.images?.desktop;
    const hasMobile = !!item.images?.mobile;
    const initialMode: "desktop" | "mobile" =
      hasDesktop || !hasMobile ? "desktop" : "mobile";
    setModalIndex(nextIndex);
    setModalMode(initialMode);
    setPageSubview("screenshot");
    setSlices(null);
    setSliceMessage(null);
    setModalScreenshot(item);
  }

  async function detectModulesForUrl(targetUrl: string, mode: "desktop" | "mobile") {
    const screenshotItem = screenshots.find((s) => s.url === targetUrl);
    const keyRoot = modulesKey(targetUrl, mode);

    setModulesLoadingByKey((prev) => ({ ...prev, [keyRoot]: true }));
    setModulesErrorByKey((prev) => ({ ...prev, [keyRoot]: null }));
    try {
      const base64 =
        screenshotItem?.images?.[mode] ??
        screenshotItem?.images?.desktop ??
        screenshotItem?.images?.mobile;
      if (!base64) throw new Error("No screenshot available to segment.");

      const crops = await cropScreenshotIntoModules(base64);
      if (crops.length === 0) throw new Error("No screenshot available to segment.");

      const modules: ModuleResult[] = crops.map((img, idx) => ({
        id: `m${idx + 1}`,
        label: `Module ${idx + 1}`,
        images: { [mode]: img },
      }));

      setModulesByKey((prev) => ({ ...prev, [keyRoot]: modules }));
    } catch (err) {
      setModulesErrorByKey((prev) => ({
        ...prev,
        [keyRoot]:
          err instanceof Error ? err.message : "Failed to detect modules",
      }));
    } finally {
      setModulesLoadingByKey((prev) => ({ ...prev, [keyRoot]: false }));
    }
  }

  async function cropBoxesToModules(targetUrl: string, mode: "desktop" | "mobile") {
    const keyRoot = modulesKey(targetUrl, mode);
    const screenshotItem = screenshots.find((s) => s.url === targetUrl);
    const base64 =
      screenshotItem?.images?.[mode] ??
      screenshotItem?.images?.desktop ??
      screenshotItem?.images?.mobile;
    if (!base64) throw new Error("No screenshot available.");

    const boxes = (boxesByKey[keyRoot] ?? []).map(normalizeBox).filter((b) => b.w > 0 && b.h > 0);
    if (boxes.length === 0) throw new Error("No boxes defined.");

    const img = await loadPngImage(base64);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) throw new Error("Invalid image.");

    const boxPx = boxes.map((b) => {
      const sx = Math.max(0, Math.min(iw - 1, Math.round(b.x * iw)));
      const sy = Math.max(0, Math.min(ih - 1, Math.round(b.y * ih)));
      const ex = Math.max(sx + 1, Math.min(iw, Math.round((b.x + b.w) * iw)));
      const ey = Math.max(sy + 1, Math.min(ih, Math.round((b.y + b.h) * ih)));
      return { b, sx, sy, sw: ex - sx, sh: ey - sy };
    });

    boxPx.sort((a, b) => (a.sy - b.sy) || (a.sx - b.sx));

    const crops: string[] = [];
    for (const { sx, sy, sw, sh } of boxPx) {
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = canvas.toDataURL("image/png");
      crops.push(dataUrl.replace(/^data:image\/png;base64,/, ""));
    }

    const modules: ModuleResult[] = crops.map((c, idx) => ({
      id: `m${idx + 1}`,
      label: `Module ${idx + 1}`,
      images: { [mode]: c },
    }));

    setModulesByKey((prev) => ({ ...prev, [keyRoot]: modules }));
    setModulesErrorByKey((prev) => ({ ...prev, [keyRoot]: null }));
  }

  async function createModulesFromBoxes(targetUrl: string, mode: "desktop" | "mobile") {
    const keyRoot = modulesKey(targetUrl, mode);
    try {
      setModulesLoadingByKey((prev) => ({
        ...prev,
        [keyRoot]: true,
      }));
      await cropBoxesToModules(targetUrl, mode);
      setBoxModeByKey((prev) => ({ ...prev, [keyRoot]: false }));
      setSliceUiMode("home");
      setSelectedModuleKeys(new Set());
      setPageSubview("modules");
    } catch (err) {
      setModulesErrorByKey((prev) => ({
        ...prev,
        [keyRoot]:
          err instanceof Error ? err.message : "Failed to create modules",
      }));
    } finally {
      setModulesLoadingByKey((prev) => ({
        ...prev,
        [keyRoot]: false,
      }));
    }
  }

  function getAutoDetectSettings() {
    const t = autoDetectSensitivity / 100; // 0..1
    // Higher sensitivity -> more cuts (higher threshold), smaller min gap.
    // At t=0 be very conservative: fewer cuts.
    const thresholdMultiplier = 0.9 + t * 0.24; // 0.90..1.14
    const minGap = Math.round(260 - t * 120); // 260..140
    return { thresholdMultiplier, minGap };
  }

  async function runDetectModulesForUrl(targetUrl: string, mode: "desktop" | "mobile") {
    const keyRoot = modulesKey(targetUrl, mode);
    const sig = `${targetUrl}:${mode}:${autoDetectSensitivity}`;
    lastAutoDetectSigRef.current = sig;
    try {
      setModulesLoadingByKey((prev) => ({
        ...prev,
        [keyRoot]: true,
      }));
      const { thresholdMultiplier, minGap } = getAutoDetectSettings();
      await suggestBoxesFromAutoDetect(targetUrl, mode, { thresholdMultiplier, minGap });
      setSliceUiMode("detect-modules");
    } catch (err) {
      setModulesErrorByKey((prev) => ({
        ...prev,
        [keyRoot]: err instanceof Error ? err.message : "Failed to get modules",
      }));
    } finally {
      setModulesLoadingByKey((prev) => ({
        ...prev,
        [keyRoot]: false,
      }));
    }
  }

  async function runCodeSliceForUrl(targetUrl: string, mode: "desktop" | "mobile") {
    const keyRoot = modulesKey(targetUrl, mode);
    try {
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
          location: "app/page.tsx:runCodeSliceForUrl:start",
          message: "calling /api/modules for slice-by-code",
          data: { targetUrl, mode, keyRoot },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      setModulesLoadingByKey((prev) => ({
        ...prev,
        [keyRoot]: true,
      }));
      const res = await fetch("/api/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to get code-based modules");
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
          hypothesisId: "H1",
          location: "app/page.tsx:runCodeSliceForUrl/response",
          message: "received modules from /api/modules",
          data: {
            moduleCount: (data?.modules ?? []).length,
            sample: (data?.modules ?? []).slice(0, 3),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      const blocks = (data?.modules ?? []) as Array<{
        id: string;
        label?: string;
        yStart: number;
        yEnd: number;
      }>;
      if (!blocks.length) {
        throw new Error("No modules returned from code analysis");
      }
      const boxes: Box[] = blocks.map((b) =>
        normalizeBox({
          id: b.id,
          x: 0,
          y: b.yStart,
          w: 1,
          h: Math.max(0, b.yEnd - b.yStart),
        })
      );
      setBoxesByKey((prev) => ({ ...prev, [keyRoot]: boxes }));
      setBoxModeByKey((prev) => ({ ...prev, [keyRoot]: true }));
      setActiveBoxId(null);
      setSliceUiMode("code-modules");
    } catch (err) {
      setModulesErrorByKey((prev) => ({
        ...prev,
        [keyRoot]:
          err instanceof Error ? err.message : "Failed to get code-based modules",
      }));
    } finally {
      setModulesLoadingByKey((prev) => ({
        ...prev,
        [keyRoot]: false,
      }));
    }
  }

  async function suggestBoxesFromAutoDetect(
    targetUrl: string,
    mode: "desktop" | "mobile",
    opts?: { thresholdMultiplier?: number; minGap?: number; smoothWindow?: number }
  ) {
    const keyRoot = modulesKey(targetUrl, mode);
    const screenshotItem = screenshots.find((s) => s.url === targetUrl);
    const base64 =
      screenshotItem?.images?.[mode] ??
      screenshotItem?.images?.desktop ??
      screenshotItem?.images?.mobile;
    if (!base64) throw new Error("No screenshot available.");

    const { h, segments } = await detectModuleSegments(base64, opts);
    const boxes: Box[] = segments.map((seg) => ({
      id: `b-${seg.y0}-${seg.y1}-${Math.random().toString(16).slice(2)}`,
      x: 0,
      y: seg.y0 / h,
      w: 1,
      h: (seg.y1 - seg.y0) / h,
    }));

    setBoxesByKey((prev) => ({ ...prev, [keyRoot]: boxes.map(normalizeBox) }));
    setBoxModeByKey((prev) => ({ ...prev, [keyRoot]: true }));
    setActiveBoxId(null);
  }

  async function sliceModuleImage(moduleKey: string, base64: string) {
    setModuleSliceLoadingKey(moduleKey);
    setModuleSliceMessageByKey((prev) => ({ ...prev, [moduleKey]: null }));
    setModuleSlicesByKey((prev) => ({ ...prev, [moduleKey]: null }));
    try {
      const result = await sliceImageForFigma(base64);
      if (result.length > 1) {
        setModuleSlicesByKey((prev) => ({ ...prev, [moduleKey]: result }));
      } else {
        setModuleSliceMessageByKey((prev) => ({
          ...prev,
          [moduleKey]: "Image is already under Figma's 4096px limit",
        }));
        setTimeout(
          () =>
            setModuleSliceMessageByKey((prev) => ({
              ...prev,
              [moduleKey]: null,
            })),
          4000
        );
      }
    } catch {
      setModuleSliceMessageByKey((prev) => ({
        ...prev,
        [moduleKey]: "Failed to slice image",
      }));
      setTimeout(
        () =>
          setModuleSliceMessageByKey((prev) => ({
            ...prev,
            [moduleKey]: null,
          })),
        4000
      );
    } finally {
      setModuleSliceLoadingKey(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      {copyNotice && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div
            className={`rounded-lg border px-4 py-2 text-sm shadow-lg ${
              copyNotice.type === "success"
                ? "border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                : "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200"
            }`}
          >
            {copyNotice.text}
          </div>
        </div>
      )}
      {downloadZipSuccess && (
        <div className="fixed top-4 right-4 z-[60]">
          <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800 shadow-lg">
            {downloadZipSuccess}
          </div>
        </div>
      )}
      {exportPluginSuccess && (
        <div className="fixed top-20 right-4 z-[60] max-w-sm">
          <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800 shadow-lg">
            {exportPluginSuccess}
          </div>
        </div>
      )}
      <main className="mx-auto max-w-[896px] bg-zinc-100 px-4 pt-10 pb-12">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
          URL Crawler & Screenshot
        </h1>
        <div className="mb-6 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-700">
          <p className="font-medium text-zinc-900 mb-2">Figma plugin</p>
          <p className="mb-3 text-zinc-600">
            Import screenshots into a Figma file with the Designteam plugin. Download the plugin
            zip, unzip it, then in Figma use{" "}
            <span className="font-medium">Plugins → Development → Import plugin from manifest</span>{" "}
            and select <code className="text-xs bg-zinc-100 px-1 rounded">manifest.json</code> inside
            the folder.
          </p>
          <a
            href="/designteam-figma-plugin.zip"
            download="designteam-figma-plugin.zip"
            className="inline-flex items-center rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Download Figma plugin (zip)
          </a>
        </div>
        <div className="mb-8 h-px w-full bg-zinc-700/60" />

        {/* Step 1: URL input and crawl */}
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium text-zinc-700">
            Step 1: Enter URL to crawl
          </h2>
          <form onSubmit={handleCrawl} className="flex items-center gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="h-[42px] flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              disabled={crawlLoading}
            />
            <button
              type="submit"
              disabled={crawlLoading}
              className="inline-flex h-[42px] w-[76px] items-center justify-center gap-2 rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {crawlLoading ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Crawling…
                </>
              ) : (
                "Crawl"
              )}
            </button>
          </form>
          {crawlError && (
            <p className="mt-2 text-sm text-red-600">
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
                className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-1.5 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {screenshotLoading ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    <span>Capturing…</span>
                    <span className="text-xs font-normal text-white/80 dark:text-zinc-900/70 tabular-nums">
                      {captureCompleted}/{captureTotal}
                      {captureFailed ? ` (${captureFailed} failed)` : ""}
                    </span>
                    <span className="text-xs font-normal text-white/80 dark:text-zinc-900/70 tabular-nums">
                      {captureElapsedSec}s
                    </span>
                  </>
                ) : (
                  `Take screenshots (${selected.size})`
                )}
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
                  Screenshots
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openExportPluginModal}
                    disabled={
                      exportPluginBusy ||
                      !screenshots.some(
                        (s) => !!(s.images?.desktop || s.images?.mobile)
                      )
                    }
                    className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Export for Figma plugin
                  </button>
                  <button
                    type="button"
                    onClick={openDownloadAllModal}
                    disabled={
                      downloadZipBusy ||
                      !screenshots.some(
                        (s) => !!(s.images?.desktop || s.images?.mobile)
                      )
                    }
                    className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Download all
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {screenshots.map((item) => {
                const desktopImage = item.images?.desktop;
                const mobileImage = item.images?.mobile;
                const primaryImage = desktopImage || mobileImage;
                const hasDesktop = !!desktopImage;
                const hasMobile = !!mobileImage;
                return (
                <div
                  key={item.url}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 overflow-hidden shadow-sm"
                >
                  {primaryImage ? (
                    <div
                      className="h-48 overflow-hidden cursor-pointer bg-zinc-100 dark:bg-zinc-900"
                      onClick={() => openModalForScreenshot(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === "Enter" && openModalForScreenshot(item)
                      }
                      aria-label="View full screenshot"
                    >
                      <img
                        src={`data:image/png;base64,${primaryImage}`}
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
                    {(hasDesktop || hasMobile) && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {hasDesktop && (
                            <span className="px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600">
                              Desktop
                            </span>
                          )}
                          {hasMobile && (
                            <span className="px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600">
                              Mobile
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )})}
            </div>
            </div>
            {downloadZipError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {downloadZipError}
              </p>
            )}
            {exportPluginError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {exportPluginError}
              </p>
            )}

            {collectColors && (
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
            )}
          </section>
        )}

        {showDownloadAllModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={(e) =>
              e.target === e.currentTarget && setShowDownloadAllModal(false)
            }
          >
            <div
              className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Download all screenshots
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Choose which images to include in the ZIP.
              </p>
              <div className="space-y-3 mb-4">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={downloadDesktop}
                    onChange={(e) => setDownloadDesktop(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      Desktop images
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={downloadMobile}
                    onChange={(e) => setDownloadMobile(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      Mobile images
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={downloadSliceForFigma}
                    onChange={(e) => setDownloadSliceForFigma(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      Slice images for Figma
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      Splits tall images into 4096px slices before adding to ZIP.
                    </span>
                  </span>
                </label>
              </div>
              {!downloadDesktop && !downloadMobile && (
                <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                  Select at least Desktop or Mobile.
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowDownloadAllModal(false)}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!downloadDesktop && !downloadMobile}
                  onClick={() =>
                    downloadAllScreenshotsAsZip({
                      desktop: downloadDesktop,
                      mobile: downloadMobile,
                      sliceForFigma: downloadSliceForFigma,
                    })
                  }
                  className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50"
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        )}

        {showExportPluginModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={(e) => e.target === e.currentTarget && setShowExportPluginModal(false)}
          >
            <div
              className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Export for Figma plugin
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Download a JSON file, then run the Designteam Import plugin in Figma and select this
                file. The plugin creates a new page with your screenshots.
              </p>
              <div className="space-y-3 mb-4">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Page name prefix
                </label>
                <input
                  type="text"
                  value={publishPagePrefix}
                  onChange={(e) => setPublishPagePrefix(e.target.value)}
                  placeholder="Crawler import"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                />
                <div className="space-y-2 pt-1">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={publishDesktop}
                      onChange={(e) => setPublishDesktop(e.target.checked)}
                    />
                    <span className="text-sm text-zinc-800 dark:text-zinc-100">
                      Desktop images
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={publishMobile}
                      onChange={(e) => setPublishMobile(e.target.checked)}
                    />
                    <span className="text-sm text-zinc-800 dark:text-zinc-100">
                      Mobile images
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={publishSliceForFigma}
                      onChange={(e) => setPublishSliceForFigma(e.target.checked)}
                    />
                    <span className="text-sm text-zinc-800 dark:text-zinc-100">
                      Slice images for Figma (4096px)
                    </span>
                  </label>
                </div>
              </div>
              {!publishDesktop && !publishMobile && (
                <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                  Select at least Desktop or Mobile.
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowExportPluginModal(false)}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!publishDesktop && !publishMobile}
                  onClick={() => void downloadFigmaPluginJson()}
                  className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50"
                >
                  Download JSON
                </button>
              </div>
            </div>
          </div>
        )}

        {downloadZipBusy && (
          <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3">
                <Spinner className="h-5 w-5" />
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {downloadZipMessage ?? "Preparing your download..."}
                </p>
              </div>
            </div>
          </div>
        )}
        {exportPluginBusy && (
          <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3">
                <Spinner className="h-5 w-5" />
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {exportPluginMessage ?? "Preparing Figma import file…"}
                </p>
              </div>
            </div>
          </div>
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
                  value={
                    typeof cookieSelector === "string"
                      ? cookieSelector
                      : `${cookieSelector.frameSelector} → ${cookieSelector.innerSelector}`
                  }
                  onChange={(e) => setCookieSelector(e.target.value)}
                  placeholder="e.g. #accept-cookies or .cookie-banner button"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCookieModal(false);
                    setPendingCookieSelector(undefined);
                    openViewportModal();
                  }}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCookieModal(false);
                    setPendingCookieSelector(cookieSelector || undefined);
                    openViewportModal();
                  }}
                  className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300"
                >
                  Take screenshots
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Viewport selection modal */}
        {showViewportModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={(e) =>
              e.target === e.currentTarget && setShowViewportModal(false)
            }
          >
            <div
              className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Choose viewports to capture
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Select which views to capture for each page. You can switch
                between Desktop and Mobile in the screenshot viewer.
              </p>
              <div className="space-y-3 mb-4">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={captureDesktop}
                    onChange={(e) => setCaptureDesktop(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      Desktop
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      Uses the current full-width desktop layout.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={captureMobile}
                    onChange={(e) => setCaptureMobile(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      Mobile (400px wide)
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      Captures a narrow 400px-wide mobile-style view.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={collectColors}
                    onChange={(e) => setCollectColors(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      Also find top colours
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      When enabled, we scan these pages after capture to list the top 10 UI colours.
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowViewportModal(false)}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!captureDesktop && !captureMobile}
                  onClick={() => {
                    const modes: ("desktop" | "mobile")[] = [];
                    if (captureDesktop) modes.push("desktop");
                    if (captureMobile) modes.push("mobile");
                    runScreenshots(pendingCookieSelector, modes);
                  }}
                  className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50"
                >
                  Start screenshots
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full-page screenshot modal */}
        {modalScreenshot &&
          (modalScreenshot.images?.desktop || modalScreenshot.images?.mobile) && (
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
              {(() => {
                const idx =
                  modalIndex !== null && modalIndex >= 0
                    ? modalIndex
                    : screenshots.findIndex((s) => s.url === modalScreenshot.url);
                const count = screenshots.length;
                const position =
                  idx >= 0 && count > 0 ? `${idx + 1} of ${count}` : "";
                return (
                  <div className="grid grid-cols-3 items-center gap-2 p-3 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
                    <a
                      href={modalScreenshot.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:underline truncate min-w-0 justify-self-start"
                    >
                      {modalScreenshot.url}
                    </a>

                    <div className="justify-self-center">
                      {modalScreenshot.images &&
                        (modalScreenshot.images.desktop ||
                          modalScreenshot.images.mobile) && (
                          <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1">
                            {modalScreenshot.images.desktop && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModalMode("desktop");
                                  setSlices(null);
                                  setSliceMessage(null);
                                }}
                                className={`px-3 py-1.5 text-sm rounded-md ${
                                  modalMode === "desktop"
                                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                }`}
                              >
                                Desktop
                              </button>
                            )}
                            {modalScreenshot.images.mobile && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModalMode("mobile");
                                  setSlices(null);
                                  setSliceMessage(null);
                                }}
                                className={`px-3 py-1.5 text-sm rounded-md ${
                                  modalMode === "mobile"
                                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                }`}
                              >
                                Mobile
                              </button>
                            )}
                          </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 justify-self-end">
                      {position && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 mr-2 hidden sm:inline">
                          {position}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setModalScreenshot(null);
                          setModalIndex(null);
                          setPageSubview("screenshot");
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
                );
              })()}
              {(() => {
                const activeImage =
                  modalScreenshot.images?.[modalMode] ??
                  modalScreenshot.images?.desktop ??
                  modalScreenshot.images?.mobile;

                if (!activeImage) return null;

                return (
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-800/95 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  {pageSubview === "modules" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModuleKeys(new Set());
                        setPageSubview("screenshot");
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    >
                      Back
                    </button>
                  ) : sliceUiMode !== "home" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const keyRoot = modulesKey(modalScreenshot.url, modalMode);
                          setSliceUiMode("home");
                          setBoxModeByKey((prev) => ({ ...prev, [keyRoot]: false }));
                          setBoxesByKey((prev) => ({ ...prev, [keyRoot]: [] }));
                          setActiveBoxId(null);
                          setSelectedBoxIdsByKey((prev) => ({ ...prev, [keyRoot]: [] }));
                          setSlices(null);
                          setSliceMessage(null);
                        }}
                        className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      >
                        Back
                      </button>
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">
                        {sliceUiMode === "slice-for-figma"
                          ? "Slice for Figma"
                          : sliceUiMode === "detect-modules"
                            ? "Detect modules"
                            : sliceUiMode === "code-modules"
                              ? "Slice by code"
                            : "Draw sections"}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {pageSubview === "modules" ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          downloadAllModulesForUrl(modalScreenshot.url, modalMode)
                        }
                        disabled={
                          downloadAllBusy ||
                          !modulesByKey[modulesKey(modalScreenshot.url, modalMode)]?.length
                        }
                        className={`rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
                          downloadAllBusy ||
                          !modulesByKey[modulesKey(modalScreenshot.url, modalMode)]?.length
                            ? "opacity-50 cursor-not-allowed hover:bg-white dark:hover:bg-zinc-800"
                            : ""
                        }`}
                      >
                        {downloadAllBusy ? "Downloading…" : "Download all"}
                      </button>
                      {selectedModuleKeys.size >= 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            mergeSelectedModulesForUrl(modalScreenshot.url, modalMode)
                          }
                          className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 inline-flex items-center gap-2"
                        >
                          Merge selected
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {(() => {
                        const keyRoot = modulesKey(modalScreenshot.url, modalMode);
                        const boxMode = boxModeByKey[keyRoot] ?? false;
                        const selectedBoxCount = (selectedBoxIdsByKey[keyRoot] ?? []).length;
                        const hasBoxes = (boxesByKey[keyRoot] ?? []).length > 0;
                        const isCreating = !!modulesLoadingByKey[keyRoot];

                        const clearBoxes = () => {
                          setBoxesByKey((prev) => ({ ...prev, [keyRoot]: [] }));
                          setSelectedBoxIdsByKey((prev) => ({ ...prev, [keyRoot]: [] }));
                          setActiveBoxId(null);
                        };

                        const exitToHome = () => {
                          setSliceUiMode("home");
                          setBoxModeByKey((prev) => ({ ...prev, [keyRoot]: false }));
                          setBoxesByKey((prev) => ({ ...prev, [keyRoot]: [] }));
                          setActiveBoxId(null);
                          setSelectedBoxIdsByKey((prev) => ({ ...prev, [keyRoot]: [] }));
                          setSlices(null);
                          setSliceMessage(null);
                        };

                        const runSliceForFigma = async () => {
                          setSliceLoading(true);
                          setSlices(null);
                          setSliceMessage(null);
                          try {
                            const result = await sliceImageForFigma(activeImage);
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
                        };

                        if (sliceUiMode === "home") {
                          return (
                            <>
                              <details ref={modulesMenuRef} className="relative">
                                <summary className="list-none rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer inline-flex items-center gap-2">
                                  Slice
                                  <span aria-hidden="true" className="text-xs opacity-70">
                                    ▼
                                  </span>
                                </summary>
                                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-1 z-10">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSliceUiMode("draw-sections");
                                      setBoxModeByKey((prev) => ({
                                        ...prev,
                                        [keyRoot]: true,
                                      }));
                                      setActiveBoxId(null);
                                      if (modulesMenuRef.current)
                                        modulesMenuRef.current.open = false;
                                    }}
                                    className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                  >
                                    Draw sections
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setBoxModeByKey((prev) => ({
                                        ...prev,
                                        [keyRoot]: true,
                                      }));
                                      setActiveBoxId(null);
                                      if (modulesMenuRef.current)
                                        modulesMenuRef.current.open = false;
                                      await runDetectModulesForUrl(
                                        modalScreenshot.url,
                                        modalMode
                                      );
                                    }}
                                    className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                  >
                                    Detect modules
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setBoxModeByKey((prev) => ({
                                        ...prev,
                                        [keyRoot]: true,
                                      }));
                                      setActiveBoxId(null);
                                      if (modulesMenuRef.current)
                                        modulesMenuRef.current.open = false;
                                      await runCodeSliceForUrl(
                                        modalScreenshot.url,
                                        modalMode
                                      );
                                    }}
                                    className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                  >
                                    Slice by code
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setSliceUiMode("slice-for-figma");
                                      setBoxModeByKey((prev) => ({
                                        ...prev,
                                        [keyRoot]: false,
                                      }));
                                      setActiveBoxId(null);
                                      if (modulesMenuRef.current)
                                        modulesMenuRef.current.open = false;
                                      await runSliceForFigma();
                                    }}
                                    className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                  >
                                    Slice for Figma
                                  </button>
                                </div>
                              </details>
                              <button
                                type="button"
                                onClick={() => {
                                  let baseFilename = "screenshot";
                                  try {
                                    const u = new URL(modalScreenshot.url);
                                    baseFilename = u.hostname.replace(/\./g, "-");
                                  } catch {
                                    // keep default
                                  }
                                  const filename = `${baseFilename}-${modalMode}.png`;
                                  downloadImage(activeImage, modalScreenshot.url, filename);
                                }}
                                className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                              >
                                Download
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  copyImage(activeImage, `${modalScreenshot.url}-${modalMode}`)
                                }
                                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                                  copiedUrl === `${modalScreenshot.url}-${modalMode}`
                                    ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                    : "border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                }`}
                              >
                                {copiedUrl === `${modalScreenshot.url}-${modalMode}`
                                  ? "Copied!"
                                  : "Copy"}
                              </button>
                            </>
                          );
                        }

                        // Mode submenus
                        return (
                          <>
                            {sliceUiMode === "slice-for-figma" ? null : (
                              <>
                                {sliceUiMode === "detect-modules" && (
                                  <label className="flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5">
                                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                                      Sensitivity
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={autoDetectSensitivity}
                                      onChange={(e) =>
                                        setAutoDetectSensitivity(Number(e.target.value))
                                      }
                                      className="w-28"
                                    />
                                    <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400 w-8 text-right">
                                      {autoDetectSensitivity}
                                    </span>
                                  </label>
                                )}
                                <button
                                  type="button"
                                  disabled={!hasBoxes}
                                  onClick={clearBoxes}
                                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                                >
                                  Clear
                                </button>
                                {boxMode && selectedBoxCount >= 2 && (
                                  <button
                                    type="button"
                                    onClick={() => mergeSelectedBoxes(keyRoot)}
                                    className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                  >
                                    Merge selected
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isCreating || !hasBoxes}
                                  onClick={() =>
                                    createModulesFromBoxes(modalScreenshot.url, modalMode)
                                  }
                                  className="rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50"
                                >
                                  {isCreating ? "Creating…" : "Create modules"}
                                </button>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
                );
              })()}
              {sliceMessage && (
                <p className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700/50 border-b border-zinc-200 dark:border-zinc-700">
                  {sliceMessage}
                </p>
              )}
              <div className="overflow-y-auto max-h-[85vh] p-2">
                {pageSubview === "modules" ? (
                  <div className="space-y-3">
                    {modulesErrorByKey[modulesKey(modalScreenshot.url, modalMode)] && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {modulesErrorByKey[modulesKey(modalScreenshot.url, modalMode)]}
                      </p>
                    )}
                    {modulesByKey[modulesKey(modalScreenshot.url, modalMode)]?.length ? (
                      <div className="space-y-3">
                        {modulesByKey[modulesKey(modalScreenshot.url, modalMode)].map((m, idx) => {
                          const img =
                            m.images?.[modalMode] ??
                            m.images?.desktop ??
                            m.images?.mobile;
                          if (!img) return null;
                          const moduleId = `${modalScreenshot.url}-${modalMode}-module-${idx + 1}`;
                          let baseFilename = "module";
                          try {
                            const u = new URL(modalScreenshot.url);
                            baseFilename = u.hostname.replace(/\./g, "-");
                          } catch {
                            // keep default
                          }
                          const filename = `${baseFilename}-${modalMode}-module-${idx + 1}.png`;
                          return (
                            <div
                              key={m.id}
                              className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-50 dark:bg-zinc-900"
                            >
                              <div className="p-2 flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                                <label className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={selectedModuleKeys.has(
                                      `${modalScreenshot.url}:${modalMode}:${m.id}`
                                    )}
                                    onChange={() =>
                                      toggleModuleSelected(
                                        `${modalScreenshot.url}:${modalMode}:${m.id}`
                                      )
                                    }
                                  />
                                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
                                    {m.label ?? `Module ${idx + 1}`}
                                  </span>
                                </label>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      downloadImage(img, modalScreenshot.url, filename)
                                    }
                                    className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                  >
                                    Download
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => copyImage(img, moduleId)}
                                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                                      copiedUrl === moduleId
                                        ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                        : "border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                    }`}
                                  >
                                    {copiedUrl === moduleId ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                              </div>
                              <div className="flex justify-center p-2">
                                <img
                                  src={`data:image/png;base64,${img}`}
                                  alt={m.label ?? `Module ${idx + 1}`}
                                  className={
                                    modalMode === "mobile"
                                      ? "max-w-[400px] w-full h-auto block"
                                      : "w-full h-auto block"
                                  }
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        No modules yet. Use “Detect modules” to draw boxes, then “Get modules”.
                      </p>
                    )}
                  </div>
                ) : (
                  (() => {
                    const activeImage =
                      modalScreenshot.images?.[modalMode] ??
                      modalScreenshot.images?.desktop ??
                      modalScreenshot.images?.mobile;
                    if (!activeImage) return null;
                    const keyRoot = modulesKey(modalScreenshot.url, modalMode);
                    const boxMode = boxModeByKey[keyRoot] ?? false;
                    const boxes = boxesByKey[keyRoot] ?? [];
                    return slices === null ? (
                      <div
                        ref={imageContainerRef}
                        className={
                          modalMode === "mobile"
                            ? "max-w-[400px] w-full mx-auto h-auto relative select-none"
                            : "w-full h-auto relative select-none"
                        }
                        onPointerMove={boxMode ? onOverlayPointerMove : undefined}
                        onPointerUp={boxMode ? onOverlayPointerUp : undefined}
                      >
                        <img
                          src={`data:image/png;base64,${activeImage}`}
                          alt={modalScreenshot.url}
                          className="w-full h-auto block select-none"
                          draggable={false}
                        />

                        {boxMode && (
                          <div
                            className="absolute inset-0 cursor-crosshair select-none"
                            onPointerDown={(e) => {
                              // Only start a new box when clicking the empty overlay (not on a box).
                              e.preventDefault();
                              if (e.target !== e.currentTarget) return;
                              const pt = getRelativePoint(e);
                              if (!pt) return;
                              const id = `b-${Date.now()}-${Math.random()
                                .toString(16)
                                .slice(2)}`;
                              const next: Box = { id, x: pt.x, y: pt.y, w: 0, h: 0 };
                              upsertBox(keyRoot, next);
                              setSingleBoxSelected(keyRoot, id);
                              startDrag(e, keyRoot, next, "new");
                            }}
                          />
                        )}

                        {boxes.map((b) => {
                          const isActive = activeBoxId === b.id;
                          const isSelected =
                            (selectedBoxIdsByKey[keyRoot] ?? []).includes(b.id) || isActive;
                          const left = `${b.x * 100}%`;
                          const top = `${b.y * 100}%`;
                          const width = `${b.w * 100}%`;
                          const height = `${b.h * 100}%`;
                          const borderClass = isActive || isSelected
                            ? "border-zinc-900 dark:border-zinc-100"
                            : "border-zinc-600/80 dark:border-zinc-300/80";
                          const borderWidthClass = isSelected ? "border-4" : "border-2";
                          return (
                            <div
                              key={b.id}
                              className={`absolute ${borderClass} ${borderWidthClass} bg-zinc-900/15 dark:bg-white/10`}
                              style={{ left, top, width, height }}
                              onPointerDown={(e) => {
                                if (!boxMode) return;
                                e.stopPropagation();
                                if (e.shiftKey) {
                                  toggleBoxSelected(keyRoot, b.id);
                                  setActiveBoxId(b.id);
                                  return;
                                }
                                setSingleBoxSelected(keyRoot, b.id);
                                startDrag(e, keyRoot, b, "move");
                              }}
                            >
                              {boxMode && (
                                <>
                                  {/* delete */}
                                  <button
                                    type="button"
                                    onPointerDown={(e) => {
                                      // Prevent the box drag handler from capturing this interaction.
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    onPointerUp={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      deleteBox(keyRoot, b.id);
                                    }}
                                    className="absolute -top-3 -right-3 z-20 h-6 w-6 rounded-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 text-xs shadow"
                                    aria-label="Delete box"
                                  >
                                    ×
                                  </button>

                                  {/* corner handles */}
                                  {([
                                    ["nw", "left-0 top-0 -translate-x-1/2 -translate-y-1/2"],
                                    ["ne", "right-0 top-0 translate-x-1/2 -translate-y-1/2"],
                                    ["sw", "left-0 bottom-0 -translate-x-1/2 translate-y-1/2"],
                                    ["se", "right-0 bottom-0 translate-x-1/2 translate-y-1/2"],
                                  ] as const).map(([corner, pos]) => (
                                    <div
                                      key={corner}
                                      className={`absolute ${pos} h-3 w-3 rounded-sm bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-500`}
                                      onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSingleBoxSelected(keyRoot, b.id);
                                        startDrag(e, keyRoot, b, corner);
                                      }}
                                    />
                                  ))}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Sliced {modalMode} view into {slices.length} parts (max
                          4096px height each). Copy or download each for Figma.
                        </p>
                        <div className="space-y-3">
                          {slices.map((sliceBase64, idx) => {
                            const sliceId = `${modalScreenshot.url}-${modalMode}-slice-${idx}`;
                            let baseFilename = "screenshot";
                            try {
                              const u = new URL(modalScreenshot.url);
                              baseFilename = u.hostname.replace(/\./g, "-");
                            } catch {
                              // keep default
                            }
                            const filename = `${baseFilename}-${modalMode}-slice-${idx + 1}.png`;
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
                                <div className="flex justify-center">
                                  <img
                                    src={`data:image/png;base64,${sliceBase64}`}
                                    alt={`Slice ${idx + 1}`}
                                    className={
                                      modalMode === "mobile"
                                        ? "max-w-[400px] w-full h-auto block"
                                        : "w-full h-auto block"
                                    }
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
              {(() => {
                const idx =
                  modalIndex !== null && modalIndex >= 0
                    ? modalIndex
                    : screenshots.findIndex((s) => s.url === modalScreenshot.url);
                const count = screenshots.length;
                const hasPrev = idx > 0;
                const hasNext = idx >= 0 && idx < count - 1;
                const keyRoot = modulesKey(modalScreenshot.url, modalMode);
                const boxMode = boxModeByKey[keyRoot] ?? false;
                const selectedBoxCount = (selectedBoxIdsByKey[keyRoot] ?? []).length;
                return (
                  <div className="flex items-center justify-between gap-2 p-3 border-t border-zinc-200 dark:border-zinc-700 shrink-0 bg-white/90 dark:bg-zinc-800/90">
                    <button
                      type="button"
                      disabled={!hasPrev}
                      onClick={() => {
                        if (hasPrev) openModalByIndex(idx - 1);
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40"
                    >
                      Previous page
                    </button>
                    <div />
                    <button
                      type="button"
                      disabled={!hasNext}
                      onClick={() => {
                        if (hasNext) openModalByIndex(idx + 1);
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40"
                    >
                      Next page
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
