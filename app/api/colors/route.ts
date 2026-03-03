import { chromium } from "playwright";
import { NextResponse } from "next/server";

const MAX_URLS = 20;
const NAVIGATION_TIMEOUT_MS = 20000;

// Browser default colors (e.g. unstyled links) — exclude so we only show author-chosen brand colors
const BROWSER_DEFAULT_COLORS = new Set([
  "#0000ee", // default unvisited link blue
  "#551a8b", // default visited link purple
  "#0000ff", // fallback link blue
]);

function isValidUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) =>
        Math.max(0, Math.min(255, Math.round(x)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function computedColorToHex(computed: string): string | null {
  if (!computed || computed === "transparent" || computed === "rgba(0, 0, 0, 0)")
    return null;
  const rgb = computed.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    const hex = rgbToHex(r, g, b);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance > 0.98 || luminance < 0.05) return null;
    return hex;
  }
  if (computed.startsWith("#")) {
    const hex = computed.slice(0, 7);
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luminance > 0.98 || luminance < 0.05) return null;
      return hex;
    }
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
      const r = parseInt(hex[1] + hex[1], 16);
      const g = parseInt(hex[2] + hex[2], 16);
      const b = parseInt(hex[3] + hex[3], 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luminance > 0.98 || luminance < 0.05) return null;
      return rgbToHex(r, g, b);
    }
  }
  return null;
}

function extractBrandColorsInPage(): string[] {
  const selectors =
    "h1, h2, h3, h4, h5, h6, button, [role='button'], input[type='submit'], input[type='button'], a, header, nav, [class*='header'], [class*='nav'], [class*='menu'], [class*='btn'], [class*='button'], [class*='primary'], [class*='brand'], [class*='logo'], [class*='title'], [class*='heading'], body, section, main, article, aside, [class*='section'], [class*='block'], [class*='container'], [class*='wrapper'], [class*='hero'], [class*='banner'], [class*='strip'], [class*='band'], [class*='background'], [class*='bg-'], [class*='card'], [class*='panel'], [class*='content'], [class*='area'], [class*='zone']";
  const elements = document.querySelectorAll(selectors);
  const colors: string[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    const style = window.getComputedStyle(el);
    const props = [
      style.color,
      style.backgroundColor,
      style.borderColor,
      style.borderTopColor,
      style.fill,
      style.stroke,
    ];
    for (const value of props) {
      if (!value || value === "transparent") continue;
      if (seen.has(value)) continue;
      seen.add(value);
      colors.push(value);
    }
  }
  return colors;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let urls = body?.urls;

    if (!Array.isArray(urls)) {
      return NextResponse.json(
        { error: "Missing or invalid urls array" },
        { status: 400 }
      );
    }

    urls = urls
      .filter((u: unknown) => typeof u === "string" && (u as string).trim())
      .map((u: string) => (u as string).trim())
      .filter(isValidUrl)
      .slice(0, MAX_URLS);

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "No valid URLs provided" },
        { status: 400 }
      );
    }

    const allCounts = new Map<string, number>();
    const browser = await chromium.launch({ headless: true });

    try {
      for (const pageUrl of urls) {
        const page = await browser.newPage();
        try {
          await page.goto(pageUrl, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT_MS,
          });
          const rawColors = await page.evaluate(extractBrandColorsInPage);
          for (const raw of rawColors) {
            const hex = computedColorToHex(raw);
            if (
              hex &&
              hex !== "#000000" &&
              hex !== "#ffffff" &&
              !BROWSER_DEFAULT_COLORS.has(hex.toLowerCase())
            ) {
              allCounts.set(hex, (allCounts.get(hex) ?? 0) + 1);
            }
          }
        } catch {
          // skip this URL
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }

    const top5 = [...allCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hex]) => hex);

    return NextResponse.json({ colors: top5 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to extract colors",
      },
      { status: 500 }
    );
  }
}
