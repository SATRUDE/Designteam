#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseCommand } from '../lib/core/args.mjs';

const HELP = `designteam — capture websites and prepare Figma-ready images

  designteam capture <url...> [--modes desktop,mobile] [--out <new-directory>]
                     [--cookie <selector>] [--no-normalize] [--max-tile <101–4096>]
  designteam crawl <url>                 Discover links on one page (JSON stdout)
  designteam dashboard <manifest.json> [--port <number>]
                                        Review an existing capture locally
  designteam install-browser            Download Chromium for this tool
  designteam --version

Runs from any folder. Capture writes into the caller's folder by default.
Capture stdout is the manifest path; diagnostics go to stderr.
Exit codes: 0 success, 1 invalid input/failed run, 2 partially captured run.
The review dashboard starts only when requested and binds to 127.0.0.1.
`;

async function main() {
  const args = parseCommand(process.argv.slice(2));
  if (args.command === 'help') return void process.stdout.write(HELP);
  if (args.command === 'version') {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    return void process.stdout.write(`${pkg.version}\n`);
  }
  if (args.command === 'install-browser') {
    const require = createRequire(import.meta.url);
    const cli = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js');
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
    child.once('error', error => { console.error(error.message); process.exitCode = 1; });
    child.once('exit', code => { process.exitCode = code ?? 1; });
    return;
  }
  if (args.command === 'dashboard') {
    const { startDashboard } = await import('../lib/core/dashboard.mjs');
    const { server, url } = await startDashboard(args.manifest, { port: args.port });
    console.error('Local capture review. Press Ctrl+C to stop.');
    process.stdout.write(`${url}\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
    return;
  }
  const { chromium } = await import('playwright-core');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(`Could not launch Chromium. Run designteam install-browser first.\n${error.message}`);
  }
  const close = () => { void browser.close(); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, close);
  try {
    if (args.command === 'crawl') {
      const { crawlPage } = await import('../lib/core/crawl.mjs');
      process.stdout.write(JSON.stringify(await crawlPage(browser, args.urls[0]), null, 2) + '\n');
    } else {
      const { captureRun } = await import('../lib/core/run.mjs');
      const { manifestPath, manifest } = await captureRun(browser, args.urls, args.options, message => console.error(message));
      process.stdout.write(`${manifestPath}\n`);
      process.exitCode = manifest.failed ? (manifest.shots.length ? 2 : 1) : 0;
    }
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, close);
    await browser.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
