# CLI distribution and code review, 28 September 2026

Peder's proposal is implemented as a CLI and Claude Code plugin around shared capture
and crawl modules. The existing Next.js UI uses the same modules; the CLI does not
start Next.js. An optional loopback-only viewer reviews captured PNGs. This is a
review branch, not a hosted release or marketplace publication.

## Fixed during review

- Relative crawl links resolved against the site origin, losing nested paths and
  `<base>` semantics. Discovery now uses the rendered document base and final URL
  after redirects, with hash removal and deduplication.
- HTTP error pages could appear as successful captures/crawls. They now fail with
  an explicit status, and browser pages close on success and failure.
- Navigation retries, scrolling and font settlement could stall capture for excessive
  periods. The shared engine bounds them and preserves existing normalisation passes.
- The previous CLI silently discarded invalid URLs/modes, returned success for
  completely failed runs, and could overwrite output. The new CLI validates input,
  retains partial results in the manifest, uses meaningful exit codes and refuses
  output-directory reuse. Failed tile writes clean up completed files from that shot.
- Image slicing assumed width and upload size would fit. It now rejects excessive
  width and splits oversized PNG tiles while retaining pixels and vertical order.
- Browser setup used development-only dependencies and install-time server archive
  generation. The CLI has runtime dependencies and an explicit Chromium setup command;
  the server archive is generated only for the web build, with shell-safe path handling.
- Removed five unsafe `any` assertions from module detection without changing its output.
- Updated Next.js and its lint config to 16.3.6, sharp to 0.35.5, and compatible locked
  transitive fixes. `npm audit` reports zero known vulnerabilities after the update.

## Verification

- Twelve tests cover real Chromium desktop/mobile capture, HTTP failures and cleanup,
  redirected and relative links, document base URLs, duplicate/external link filtering,
  CLI use outside a repository, partial/total failure exit codes, overwrite refusal,
  tile dimensions and dashboard path/symlink restrictions.
- TypeScript, production build and plugin-manifest validation pass.
- Repository lint has no errors. Nineteen existing/non-blocking warnings remain,
  mainly unused experimental UI state and raw screenshot `<img>` elements. The large
  dashboard component was not rewritten as part of CLI packaging.
- A clean tarball install captured desktop and mobile from a non-repository folder.
  Both existing dashboard API flows returned the expected crawl JSON and screenshot
  SSE events. The local viewer loaded all images, with no mobile overflow or browser
  page errors.
- Package allowlist excludes environment files, saved screenshots, debug files,
  generated browser archives and web-app source.

## Limits and follow-ups

- The suggested OXXAS reference repository was inaccessible with the current account.
  The implementation follows Peder's saved screenshots and the official plugin spec.
- The local CLI was tested on macOS. Windows path handling avoids shell interpolation,
  but a Windows machine has not been used for validation.
- Crawling means discovering links on one rendered page, not recursive crawling.
- The new CLI dashboard is a read-only capture viewer. The existing Next.js UI retains
  its interactive crawl/select/capture flow.
- The npm package deliberately remains private to prevent an accidental npm registry
  publication. GitHub and local tarball installation are supported; no npm name was claimed.
- Before exposing a hosted capture service, review its existing access model separately:
  `proxy.ts` treats a matching Origin header as permission. Non-browser clients can
  supply that header, so it is not user authentication. Its arbitrary URL capture
  endpoints also need a hosted-network policy. This branch does not deploy or expose
  a new network capture endpoint; the new viewer is loopback-only and read-only.
- Arbitrary external websites can still need site-specific cookie selectors or layout
  handling. A fixture pass does not guarantee every site's screenshot fidelity.

## Second review fixes, 28 September 2026

- Crawling now allows pending requests up to five seconds to settle after its initial
  two-second script window. A three-second navigation fetch is discovered, while a
  never-finishing request remains bounded.
- A supplied cookie selector that cannot be clicked now fails that capture instead
  of silently saving an obscured screenshot. The CLI records the diagnostic and
  returns exit 1 for total failure or 2 for partial failure. Successful captures in
  the same batch are retained.
- Inner scrolling content and its clipping ancestors are expanded before taking a
  full-page screenshot. Horizontal clipping is preserved, so wide tables and
  carousels do not widen mobile output. This is a layout normalisation; virtualised
  content absent from the DOM still requires site-specific handling.
- Regression coverage checks delayed navigation, never-finishing requests, successful
  and failed cookie dismissal, batch exit codes, and visible bottom content at desktop
  and mobile sizes through direct, flex-nested and horizontally overflowing scrollports.
- All 18 tests, TypeScript and the production build pass. Lint has zero errors and
  the same 19 warnings; the changed JavaScript files have no lint warnings.
