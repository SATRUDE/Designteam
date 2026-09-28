# Designteam

Capture website screenshots from your terminal, discover page links, and review
captures locally. Choose desktop, mobile, or both. Long pages are saved as ordered
PNG tiles, ready to place in Figma.

## Quick start

### 1. Install Node.js and Git

Install **Node.js 22 or later** (including npm) and **Git**, then open a terminal.
Check that both are available:

```sh
node --version
git --version
```

The commands below run the tool directly from GitHub using `npx`, which comes
with npm. No global installation is needed. The package is not published to the
npm registry; use the full GitHub name shown in each command.

### 2. Download the browser once

```sh
npx --yes github:SATRUDE/Designteam#main install-browser
```

The first run downloads the tool and its dependencies. `install-browser` downloads
Chromium for screenshot capture. It does not start a server or capture anything.
Run it again if a later version of the tool asks for a new browser version.

### 3. Take screenshots

Run this from the folder where you want to save the images:

```sh
npx --yes github:SATRUDE/Designteam#main capture https://example.com --modes desktop,mobile --out ./shots/example
```

Replace `https://example.com` with the website you want. The output folder must
be new: use a different name for each run. You can run the tool from any folder;
it does not need a Git repository or a running web app.

- Omit `--modes` for desktop only, or use `--modes mobile` for mobile only.
- Desktop captures are 1280px wide; mobile captures are 400px wide, unless the page
  itself has visible horizontal overflow.
- To capture several pages, list their URLs before the options (up to 20 per run):

```sh
npx --yes github:SATRUDE/Designteam#main capture https://example.com https://example.com/about --modes desktop,mobile --out ./shots/example-pages
```

Quote URLs that contain query strings, for example `"https://example.com/?page=2"`.

### 4. Cookie banners are handled automatically

Designteam detects and dismisses common cookie banners before capture, including
recognisable consent dialogs, open shadow DOM and consent iframes. It prefers
rejecting optional cookies where that choice is available. No extra command is
needed for supported banners.

If a detected banner cannot be dismissed, that capture fails with an explanation.
For a site needing special handling, override detection with the CSS selector of
the dismissal button:

```sh
npx --yes github:SATRUDE/Designteam#main capture https://example.com --cookie '#accept-cookies' --out ./shots/example-clean
```

`#accept-cookies` is only an example: use the actual selector for that site. You
can find it with your browser's Inspect tool, or ask your coding assistant to find
it. Every page in that command must have a working matching button. If it cannot
be clicked, that capture fails and the reason is recorded. Omit `--cookie` on
pages without a banner or to use automatic detection; use separate commands for
sites with different manual selectors.

### 5. Review the images

```sh
npx --yes github:SATRUDE/Designteam#main dashboard ./shots/example/manifest.json
```

Open the local URL printed in the terminal. The viewer shows the screenshots and
any capture warnings. Keep the terminal running while reviewing; press **Ctrl+C**
to stop the viewer.

Your output folder contains PNG images and `manifest.json`, which records source
URLs, capture order, tile dimensions and failures. Tall pages have several numbered
tiles. Keep their order and stack them vertically without gaps to reconstruct the
page. Move the manifest and its PNGs together if you move a capture folder.

### 6. Discover more pages

```sh
npx --yes github:SATRUDE/Designteam#main crawl https://example.com
```

This reads the site’s `robots.txt`, common sitemap paths and nested sitemap indexes,
and combines their pages with links on the supplied page. It prints a deduplicated
JSON list. You can also pass a direct sitemap XML or XML.gz URL. Choose the URLs
you want and pass them to `capture`; discovery does not take screenshots.

If there is no sitemap, links on the supplied page are still returned. Discovery is
bounded to 2,000 sitemap pages, 20 sitemap documents and six seconds, with size and
request limits too. Incomplete discovery is reported in `warnings`, including in
the web app, so check them before treating the list as complete. CLI capture takes
up to 20 URLs per command; the web app splits larger selections into batches.

## Use with Claude Code

Clone the repository and install its dependencies and browser:

```sh
git clone https://github.com/SATRUDE/Designteam.git
cd Designteam
npm install
node bin/designteam.mjs install-browser
```

Start Claude Code with the plugin's absolute path, replacing the example path:

```sh
claude --plugin-dir /absolute/path/to/Designteam
```

Invoke `/designteam:screenshots` and describe what you need, for example:

> Capture desktop and mobile screenshots of https://example.com and save them to
> a new folder called shots/example. Check for cookie banners and report any failures.

The plugin includes instructions for discovery, capture, optional local review and
Figma placement when suitable Figma tools are connected. Figma access is optional
for taking screenshots. No marketplace installation or automatic runs are configured.

## Put screenshots in Figma

For CLI captures, place the PNG files into your Figma file. For a tiled page, use
the dimensions and order in `manifest.json` and stack the tiles without gaps. A
coding assistant with suitable Figma tools can do this using the bundled skill.

The CLI manifest is a local capture index, **not** the import JSON expected by the
separate Designteam Figma plugin. To use that plugin's JSON import workflow, use
the web app described below.

## Optional web app

In a repository clone, install dependencies and Chromium as above, then run:

```sh
npm run dev
```

Open http://localhost:3000. Enter a URL, click **Crawl**, select pages, and click
**Take screenshots**. This is the interactive capture app; the CLI's `dashboard`
command is a viewer for captures already saved to disk.

For the Figma import workflow:

1. Run `npm install --prefix figma-plugin --include=dev`, then
   `npm run package:figma-plugin` in the repository root.
2. In Figma, choose **Plugins → Development → Import plugin from manifest…** and
   select `figma-plugin/manifest.json` in your clone. Alternatively, download the
   plugin zip from the web app and select the manifest after unzipping it.
3. In the web app, capture screenshots, click **Export for Figma plugin**, choose
   your options, and download the export JSON.
4. Run the Designteam Figma plugin and import that JSON.

`npm run build` builds the Figma plugin zip and the production Next.js app.

## Troubleshooting and limits

- **Node, npm or npx not found:** open a new terminal after installing Node.js.
  `npx --yes github:SATRUDE/Designteam#main --help` lists the tool commands.
- **Could not launch Chromium:** repeat the `install-browser` command from step 2.
- **Output folder already exists / EEXIST:** choose a new `--out` folder. Existing
  captures are never overwritten.
- **Cookie dismissal failed:** a detected banner could not be dismissed. Supply
  the correct `--cookie` selector, or use **Cookie override** in the web app. If you
  already supplied a selector, check it against that page.
- **Some pages failed:** successful captures are retained. Check the manifest's
  `warnings` and retry failed URLs in a new folder. Exit codes are 0 for complete
  success, 1 for invalid input or total failure, and 2 for partial capture.
- **Pages require a login:** captures use a fresh browser with no imported login
  sessions or credentials.
- **Unusual page layouts:** inner scrolling content is expanded for full-page
  capture, which can change layout. Virtualised or infinitely loaded content still
  needs site-specific handling. `--no-normalize` disables fixed-chrome
  normalisation, not every layout adjustment.
- **Very wide pages:** PNG tiles are limited to 4096px per dimension and 10MiB each.
  Excessive horizontal overflow fails rather than silently shrinking the image.

Capture prints the absolute manifest path to stdout; crawl prints JSON. Progress
and errors go to stderr. The local viewer binds to `127.0.0.1`, serves only the
capture images, and does not upload them. Capture only sites you are entitled to
access.

The GitHub commands target the current main branch; npm may reuse a cached copy.
Mac capture has been tested; Windows has not yet been verified.

## Development checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The CLI and web app share `lib/core/`. The package includes the CLI, shared core,
plugin instructions and this README; it excludes environment files, saved captures
and web app source. Use a repository clone to run the web app.
