# Automatic cookies and sitemap discovery

Entering a website URL now combines rendered links with pages from robots.txt, conventional sitemaps and nested sitemap indexes. Direct XML and XML.gz inputs also work. Missing sitemaps fall back to rendered links; partial discovery returns explicit warnings. Fetch time, document count, requests, URLs and decompressed sizes are bounded.

Screenshot capture now dismisses common consent banners automatically, preferring rejection of optional cookies. Detection is scoped to recognised banners or consent dialogs/frames. Unsupported or non-closing detected banners fail explicitly. Manual selectors remain available and retain first-match compatibility.

The web app opens viewport selection immediately. A separate Cookie override action provides the existing manual picker. Large selections run in batches of 20, partial-mode errors remain visible, and interrupted streams report failure while retaining completed results.

## Verification

- All 35 automated tests pass, including delayed navigation, sitemap indexes/gzip/cycles/timeouts, consent iframes/shadow DOM, persistent consent launchers, unrelated Accept controls and existing CLI output protection.
- Production build and TypeScript compilation pass.
- ESLint passes with the 19 existing warnings and no errors. The browser-flow script also passes ESLint.
- `DESIGNTEAM_WEB_URL=http://127.0.0.1:3467 node tests/web-flow.mjs` passes against the local production build. Real HTTP fixtures verify sitemap-only page discovery through the UI and desktop/mobile capture with pixel checks proving banner dismissal. Mocked streaming responses verify 25 selections run as 20+5, warnings remain visible and partial-mode errors appear alongside successful captures. No browser exceptions.
- Desktop and mobile browser screenshots inspected; selection buttons wrap on narrow screens.

## Scope and limits

Automatic detection covers common consent interfaces, not every custom implementation. Review captures and use a manual selector where needed. Sitemap discovery is bounded and is not an exhaustive recursive page crawler. Tests use local fixtures; production hosting was not changed by this branch.
