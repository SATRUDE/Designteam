# URL Crawler & Screenshot

Crawl a URL to discover same-origin links, select which pages to capture, and take screenshots automatically. Built with Next.js and Tailwind CSS.

Export screenshots as **JSON** for the **Designteam Figma plugin**, which creates a new page with frames and image fills in your file—no Figma OAuth or server-side publishing.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install Playwright browsers (required for screenshots):

```bash
npx playwright install chromium
```

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Enter a URL, click **Crawl**, select the links you want, then click **Take screenshots** to capture them.

### Figma plugin (import into a file)

**Phase 1 — from this repo (development)**

1. Build the plugin: `npm run build --prefix figma-plugin` (or run a full `npm run build` from the repo root).
2. In Figma: **Plugins → Development → Import plugin from manifest…** and choose `figma-plugin/manifest.json` in your clone.

**Phase 2 — from the deployed app**

1. On the app home page, use **Download Figma plugin (zip)** (or open `/designteam-figma-plugin.zip` on your deployment).
2. Unzip the folder. In Figma, **Import plugin from manifest…** and select `manifest.json` inside that folder.

**Export flow**

1. After screenshots are ready, click **Export for Figma plugin**, set options (page name prefix, desktop/mobile, optional slice), then **Download JSON**.
2. Run the plugin in Figma and import that JSON (file picker or paste).

> **Local dev:** `next dev` does not build the plugin zip. Run `npm run package:figma-plugin` once (or use `npm run build`) so `public/designteam-figma-plugin.zip` exists for the download link.

## Production build

```bash
npm run build
```

This packages the Figma plugin into `public/designteam-figma-plugin.zip`, then runs `next build`.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying)

## Deploy on Vercel

The easiest way to deploy this app is the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
