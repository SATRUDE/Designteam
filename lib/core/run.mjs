import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { capturePage } from './capture.mjs';
import { sliceTall } from './slice.mjs';

export async function captureRun(browser, urls, options, log = () => {}) {
  const outDir = path.resolve(options.out ?? path.join('shots', new Date().toISOString().replace(/[:.]/g, '-')));
  // Refuse reuse: otherwise old tiles can be mistaken for this run's output.
  await mkdir(path.dirname(outDir), { recursive: true });
  await mkdir(outDir);
  const shots = [];
  const warnings = [];
  let failed = 0;
  const jobs = [...new Set(urls)].flatMap(url => options.modes.map(mode => ({ url, mode })));
  for (const [order, { url, mode }] of jobs.entries()) {
    const slug = new URL(url).hostname.replace(/[^a-z0-9-]/gi, '-').slice(0, 60) || 'page';
    const prefix = `${String(order + 1).padStart(3, '0')}-${slug}-${mode}`;
    log(`Capturing ${mode} ${url}`);
    const written = [];
    try {
      const png = await capturePage(browser, url, mode, {
        cookieSelector: options.cookie,
        normalizeFixedChrome: options.normalize,
      });
      const tiles = await sliceTall(png, { maxTileHeight: options.maxTile });
      const files = [];
      for (const tile of tiles) {
        const file = `${prefix}-${String(tile.index).padStart(2, '0')}.png`;
        await writeFile(path.join(outDir, file), tile.buffer, { flag: 'wx' });
        written.push(path.join(outDir, file));
        files.push({ file, width: tile.width, height: tile.height, bytes: tile.buffer.length });
      }
      shots.push({ order, url, mode, slug, frameName: `${String(order + 1).padStart(3, '0')} ${slug} ${mode}`, tiles: files });
    } catch (error) {
      await Promise.allSettled(written.map(file => unlink(file)));
      failed++;
      warnings.push(`${mode} ${url}: ${error.message}`);
      log(warnings.at(-1));
    }
  }
  const manifest = { version: 1, createdAt: new Date().toISOString(), outDir, modes: options.modes, shots, warnings, total: jobs.length, failed };
  const manifestPath = path.join(outDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { manifestPath, manifest };
}
