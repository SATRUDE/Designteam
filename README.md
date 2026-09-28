# Designteam

Capture website screenshots from your terminal, discover page links, and review
captures locally. Choose desktop, mobile, or both. Long pages are saved as ordered
PNG tiles, ready to place in Figma.

## Quick start

### 1. Install the tool

Install **Node.js 22 or later** (including npm) and **Git**, then open a terminal:

```sh
npm install --global github:SATRUDE/Designteam#main
designteam --version
```

The package is installed from GitHub. It is not published to the npm registry, so
`npm install --global designteam` is not the installation command for this tool.

### 2. Install the browser once

```sh
designteam install-browser
```

This downloads Chromium for screenshot capture. Installation does not start a
server or capture anything. Run it again after updating the tool if it asks for a
new browser version.

### 3. Take screenshots

Run this from the folder where you want to save the images:

```sh
designteam capture https://example.com --modes desktop,mobile --out ./shots/example
```

Replace `https://example.com` with the website you want. The output folder must
be new: use a different name for each run. You can run the tool from any folder;
it does not need a Git repository or a running web app.

- Omit `--modes` for desktop only, or use `--modes mobile` for mobile only.
- Desktop captures are 1280px wide; mobile captures are 400px wide, unless the page
  itself has visible horizontal overflow.
- To capture several pages, list their URLs before the options (up to 20 per run):

```sh
designteam capture https://example.com https://example.com/about --modes desktop,mobile --out ./shots/example-pages
```

Quote URLs that contain query strings, for example `"https://example.com/?page=2"`.

### 4. Remove a cookie banner when needed

Cookie banners are not removed automatically. Supply the CSS selector of the
button that dismisses the banner:

```sh
designteam capture https://example.com --cookie '#accept-cookies' --out ./shots/example-clean
```

`#accept-cookies` is only an example: use the actual selector for that site. You
can find it with your browser's Inspect tool, or ask your coding assistant to find
it. Every page in that command must have a working matching button. If it cannot
be clicked, that capture fails and the reason is recorded. Omit `--cookie` on
pages without a banner; use separate commands for sites with different selectors.

### 5. Review the images

```sh
designteam dashboard ./shots/example/manifest.json
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
designteam crawl https://example.com
```

This prints a JSON list of links discovered on that page. Choose the URLs you want
and pass them to `capture`. It does not recursively crawl the whole website or
capture the discovered pages automatically.

## Use without a global installation

Use these commands instead of installing the global `designteam` command:

```sh
npx --yes github:SATRUDE/Designteam#main install-browser
npx --yes github:SATRUDE/Designteam#main capture https://example.com --out ./shots/example
npx --yes github:SATRUDE/Designteam#main dashboard ./shots/example/manifest.json
```

The first run downloads the package and its dependencies. Chromium is a separate
download through `install-browser`. Output still goes into your current folder.

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

- **Command not found:** open a new terminal after installing, or use the `npx`
  commands above. `designteam --help` lists the commands and options.
- **Could not launch Chromium:** run `designteam install-browser`.
- **Output folder already exists / EEXIST:** choose a new `--out` folder. Existing
  captures are never overwritten.
- **Cookie dismissal failed:** check the selector against the actual page. Do not
  omit it just to hide the error if a banner is still covering the page.
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

To update a global installation, repeat the GitHub install command, then run
`designteam install-browser` if requested. Mac capture has been tested; Windows
has not yet been verified.

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
