import type { Browser } from "playwright-core";

const CHROMIUM_PACK_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/chromium-pack.tar`
  : "https://github.com/gabenunez/puppeteer-on-vercel/raw/refs/heads/main/example/chromium-dont-use-in-prod.tar";

let cachedExecutablePath: string | null = null;
let downloadPromise: Promise<string> | null = null;

async function getChromiumPath(): Promise<string> {
  if (cachedExecutablePath) return cachedExecutablePath;

  if (!downloadPromise) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    downloadPromise = chromium
      .executablePath(CHROMIUM_PACK_URL)
      .then((path) => {
        cachedExecutablePath = path;
        return path;
      })
      .catch((error) => {
        console.error("Failed to get Chromium path:", error);
        downloadPromise = null;
        throw error;
      });
  }

  return downloadPromise;
}

export async function launchBrowser(): Promise<Browser> {
  const isVercel = !!process.env.VERCEL_ENV;

  if (isVercel) {
    const { chromium } = await import("playwright-core");
    const sparticuz = (await import("@sparticuz/chromium-min")).default;
    const executablePath = await getChromiumPath();
    return chromium.launch({
      headless: true,
      executablePath,
      args: sparticuz.args,
    });
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  return browser as unknown as Browser;
}
