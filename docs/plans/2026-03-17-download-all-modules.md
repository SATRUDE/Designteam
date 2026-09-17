# Download All Modules Implementation Plan
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a “Download all” button in the modules view to download every module image for the current URL + viewport.

**Architecture:** Reuse the existing `downloadImage()` helper and the same filename logic used by per-module downloads. Add a small busy/disabled state to prevent double-triggering.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS.

---

### Task 1: Add download-all handler

**Files:**
- Modify: `app/page.tsx`

**Step 1: Implement handler**
- Add `downloadAllBusy` state.
- Add `downloadAllModulesForUrl(url, mode)`:
  - Resolve modules via `modulesByKey[modulesKey(url, mode)]`
  - Build filenames as `${hostname}-${mode}-module-${idx+1}.png`
  - Call `downloadImage(img, url, filename)` for each module
  - Insert small async delay between downloads to reduce browser throttling

### Task 2: Add UI button beside Back

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add button**
- In `pageSubview === "modules"` header action area, render “Download all” next to “Back”.
- Disable when `downloadAllBusy` or there are zero modules.

### Task 3: Verify

**Step 1: Lint/typecheck**
- Run: `npm run build`
- Expected: successful build

