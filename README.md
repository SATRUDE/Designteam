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

## CLI and Claude Code plugin (distribution branch)

The CLI and existing web dashboard now share the capture and link-discovery engines
in `lib/core/`. Neither a running server nor a current Git repository is needed for
CLI capture. Node 20.9+ is required. This branch is not yet a published release.

```bash
# In a clone of this branch
npm install
node bin/designteam.mjs install-browser

# From any folder; use an absolute path to the CLI
node /path/to/Designteam/bin/designteam.mjs crawl https://example.com
node /path/to/Designteam/bin/designteam.mjs capture https://example.com \
  --modes desktop,mobile --out ./shots/example
node /path/to/Designteam/bin/designteam.mjs dashboard ./shots/example/manifest.json
```

`crawl` discovers links on a single page. Choose the URLs you want, then pass them
to `capture`. `dashboard` is an optional, read-only local capture viewer. The existing
Next.js dashboard remains available through `npm run dev` for the interactive
crawl/select/capture workflow. Neither dashboard starts during installation or capture.

### Package and GitHub distribution

```bash
npm pack
# Install the resulting .tgz in a separate directory for release testing
npm install /path/to/designteam-app-0.2.0.tgz
npx designteam --help
```

After this branch is made available on GitHub, the corresponding commands are:

```bash
npx github:SATRUDE/Designteam#codex/cli-plugin-distribution --help
npx github:SATRUDE/Designteam#codex/cli-plugin-distribution install-browser
npx github:SATRUDE/Designteam#codex/cli-plugin-distribution capture https://example.com
```

Output paths are relative to the folder where you run the command. Dependencies
and bundled instructions are resolved relative to the installation. Chromium is a
separate, explicit download, not an install-time side effect. The GitHub package
uses the existing app's dependency set; capture does not start or import Next.js.
The tarball includes only CLI code, shared core, plugin instructions and README,
not environment files, saved captures, debug logs or the web app source.

### Claude Code plugin

After installing dependencies in the clone, test the plugin locally:

```bash
claude --plugin-dir /absolute/path/to/Designteam
```

Use `/designteam:screenshots` to invoke the capture workflow. The bundled skill
covers direct capture, discovering links, optional review and Figma placement when
Figma tools are available. Figma is not needed to save screenshots. No hooks,
automatic capture, account connection or marketplace installation is configured.
The reference suggested by Peder, `OXXAS/figma-code-fidelity-plugin`, was inaccessible
during this implementation; the structure follows his saved advice and the official
[Claude Code plugin specification](https://code.claude.com/docs/en/plugins-reference).

### Capture contract

- `capture` stdout contains only an absolute `manifest.json` path; `crawl` emits JSON.
  Progress and errors go to stderr.
- Exit codes: `0` complete, `1` invalid input or no successful captures, `2` partial
  capture. Check `warnings` before treating a run as complete.
- Existing output directories are refused so previous captures cannot be overwritten.
- PNG tiles retain their pixel size and order, with maximum dimensions of 4096px and
  10MiB per tile. Excessively wide page overflow is reported, not silently rescaled.
- The local viewer binds only to `127.0.0.1` and serves the manifest's named PNGs.
  Stop it with Ctrl+C. It does not upload files or run a browser capture service.
- Capture uses a fresh, unauthenticated browser. It does not import browser cookies
  or credentials. Only capture sites you are entitled to access.

### Verification

`npm test` runs fixture-based capture, crawl, CLI and local viewer checks.
`npm run typecheck` checks the Next.js adapters; `npm run lint` checks the codebase.
