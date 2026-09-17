# Plan: Figma plugin import + remove OAuth / server publish path

## Goal

Replace the **browser OAuth + async server publish + write adapter** flow with a **Figma plugin** that runs inside the editor and places screenshots using the Plugin API. Remove automatic Figma connection, token storage, queues, and related API routes.

**Keep:** URL crawl, screenshots, slicing for Figma (client-side), ZIP download — optionally add **“Export for Figma plugin”** (JSON + assets or single payload file).

---

## Why this direction

- **Plugin API** can create pages, frames, and insert images **without** a separate “write adapter” service or Figma OAuth for canvas writes.
- **OAuth + REST** in this repo was compensating for the lack of server-side canvas writes; it adds env complexity (`FIGMA_CLIENT_*`, `FIGMA_TOKEN_ENCRYPTION_KEY`, `FIGMA_WRITE_ADAPTER_*`, session store) for limited gain.

---

## Target UX

1. User runs the crawler app, captures screenshots (same as today).
2. User clicks **Export for Figma plugin** (name TBD): downloads a **`.json`** or **`.zip`** containing a versioned payload (see schema below).
3. User opens their Figma file → **Plugins → Designteam import** (or similar).
4. Plugin UI: **“Import from file”** or **paste JSON** → creates a new page (e.g. `{prefix} – {timestamp}`) → lays out frames + images in deterministic order (reuse rules from `lib/figma/layout.ts`).

Optional later: **clipboard** flow (copy payload from web) if file download is clunky.

---

## Plugin technical outline

| Area | Notes |
|------|--------|
| **Stack** | TypeScript + Figma plugin template (`manifest.json`, `code.ts` / `ui.html` or bundler e.g. Vite + `@figma/plugin-typings`). |
| **Manifest** | `documentAccess: "dynamic-page"`, network access only if you later add fetch (not required for v1 file import). |
| **Core logic** | Parse payload → `figma.createPage()` or get current page → create frames (auto-layout or fixed positions) → `figma.createImage()` from decoded bytes. |
| **Images** | Payload carries **base64** (same as today) or file paths inside ZIP; plugin decodes and uses `figma.createImage(new Uint8Array(...))`. |
| **Determinism** | Mirror `buildLayoutEntries()` ordering: URL lexical, desktop before mobile, slice name order. |

### Suggested payload schema (v1)

Align with existing types (`FigmaPublishItemInput`, `FigmaLayoutEntry`):

```json
{
  "version": 1,
  "pageNamePrefix": "Crawler import",
  "createdAt": "ISO-8601",
  "layout": [ { "order", "url", "mode", "frameName", "imageNames" } ],
  "items": [ { "url", "mode", "images": [ { "name", "base64" } ] } ]
}
```

The web app builds `layout` with the same function as today (`buildLayoutEntries`) so plugin and app stay in sync.

---

## Web app changes (removals + additions)

### Remove (delete or strip)

**API routes**

- `app/api/figma/auth/start/route.ts`
- `app/api/figma/auth/callback/route.ts`
- `app/api/figma/auth/status/route.ts`
- `app/api/figma/auth/disconnect/route.ts`
- `app/api/figma/publish/route.ts`
- `app/api/figma/jobs/[jobId]/route.ts`

**Libraries**

- `lib/figma/oauth.ts`
- `lib/figma/crypto.ts`
- `lib/figma/session.ts` (if only used for Figma)
- `lib/figma/store.ts` (OAuth connections + publish jobs) — **delete** or replace with unrelated storage only if needed elsewhere
- `lib/figma/queue.ts`
- `lib/figma/publisher.ts`
- `lib/figma/write-adapter.ts`
- Prune `lib/figma/types.ts` to only types needed for export + shared layout
- `lib/figma/slice.ts` — **remove** if slicing moves entirely client-side; **keep** one slicing path (likely browser `sliceImageForFigma` in `page.tsx`) for export bundle

**`lib/figma-publish.ts`**

- Remove `publishToFigma`, `callFigmaBridge`, and bridge env usage if unused.
- **Keep** (or move to a small `lib/figma/export-schema.ts`): `parseFigmaFileKey` only if still useful; `buildRunPageName`, `buildLayoutEntries` — keep for export generation.

**UI (`app/page.tsx`)**

- All state/effects: `figmaAuth`, `figmaOAuthBanner`, `figmaPublishJobId`, job polling, `refreshFigmaAuthStatus`, `figmaAuth` query handling
- Modal: Connect / Disconnect / Figma file URL / server publish
- Buttons: “Publish to Figma” / “Connect & Publish” → replace with **Export for plugin**

**Config / env**

- Remove from docs and `.env`: `FIGMA_CLIENT_ID`, `FIGMA_CLIENT_SECRET`, `FIGMA_REDIRECT_URI`, `FIGMA_TOKEN_ENCRYPTION_KEY`, `FIGMA_OAUTH_SCOPES`, `FIGMA_WRITE_ADAPTER_URL`, `FIGMA_MCP_BRIDGE_URL`, `FIGMA_WRITE_ADAPTER_MOCK`
- `.data/figma-state.json` can be deleted locally after migration (or left ignored)

**Layout**

- Optional: remove `https://mcp.figma.com/mcp/html-to-design/capture.js` from `app/layout.tsx` if it was only for Figma-adjacent experiments

### Add

- **Client-side export builder**: given selected screenshots + options (desktop/mobile, slice), produce `version` + `layout` + `items` (reuse `buildLayoutEntries` from `lib/figma/layout.ts`).
- **Download**: `designteam-figma-import.json` or `.zip` (JSON + optional sidecar files if size limits matter).
- Short **in-app instructions** linking to plugin install (Figma Community or private org) and “Plugins → Development → Import manifest” for dev.

---

## Repo layout for the plugin

Two common patterns:

1. **Monorepo folder** `packages/figma-plugin/` or `figma-plugin/` at repo root with its own `package.json` and build.
2. **Separate repo** — only if you want independent versioning; more overhead.

Recommendation: **subfolder in this repo** for v1.

---

## Plugin distribution (phased)

**Phase 1 — Development / internal testing (start here)**  
Load via Figma **Plugins → Development → Import plugin from manifest** pointing at the built `manifest.json` in the repo (or `dist/` after build). No hosting.

**Phase 2 — Download from main page**  
Build a zip of the plugin (`manifest.json` + built `main`/`ui` at zip root). Place it in `public/` (e.g. `public/designteam-figma-plugin.zip`) via `npm run build` script or CI. On the app home page, add **Download Figma plugin** linking to that file. Instructions: unzip → Development → Import plugin from manifest → select `manifest.json` in the unzipped folder.

**Phase 3 (optional)** — Figma Community or org publish for one-click install.

---

## Migration phases

| Phase | Work |
|-------|------|
| **1. Schema + export** | Implement JSON (or ZIP) export from the web app; validate file size; document max payload. |
| **2. Plugin MVP** | Read file / paste JSON → create page + frames + images; no network. |
| **2b. Distribution** | Document Phase 1 dev import; add zip build + `public/` + main-page download (Phase 2). |
| **3. Remove server Figma stack** | Delete routes/libs listed above; simplify `types`; run `tsc` / `lint` / manual test crawl → export → import. |
| **4. Polish** | Error messages in plugin, progress UI, optional compression; README updates. |

---

## Risks / constraints

- **Payload size**: Large base64 blobs in a single JSON can hit clipboard / plugin memory limits; ZIP or chunked exports may be needed.
- **4096px height**: Keep client-side slicing for Figma in the export path so the plugin receives already-sliced images.
- **No OAuth** means no automatic “same account” guarantee — user explicitly runs the plugin in their file (clear ownership).

---

## Deliverables checklist

- [ ] Plugin package buildable and loadable in Figma (dev manifest).
- [ ] Web export produces plugin-compatible payload using shared layout rules.
- [ ] OAuth, session publish store, queue, write adapter, and related API routes removed.
- [ ] README: setup without Figma env vars; how to run plugin + import.
- [ ] Old `.env` Figma variables documented as removed/obsolete.

---

## Open decisions

- **Phase 3 distribution**: Figma Community vs private organization only (after dev + zip download).
- **Single JSON vs ZIP** for screenshot *payload* v1 (recommend ZIP if screenshots are large) — separate from **plugin** zip in Phase 2.
- Whether to keep **`lib/figma/slice.ts` (Sharp)** for any server-side path — likely **no** if everything is client export + plugin only.
