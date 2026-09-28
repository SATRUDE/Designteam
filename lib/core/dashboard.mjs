import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function startDashboard(manifestPath, { port = 0 } = {}) {
  const directory = await realpath(path.dirname(path.resolve(manifestPath)));
  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.shots) || !Array.isArray(manifest.warnings)) throw new Error('Invalid version 1 capture manifest.');
  const assets = new Map();
  const sections = [];
  for (const [index, shot] of manifest.shots.entries()) {
    if (!Array.isArray(shot.tiles)) throw new Error('Invalid tiles in capture manifest.');
    const images = [];
    for (const tile of shot.tiles) {
      if (typeof tile.file !== 'string' || path.basename(tile.file) !== tile.file || path.extname(tile.file) !== '.png') throw new Error('Manifest contains an invalid tile filename.');
      const file = await realpath(path.join(directory, tile.file));
      if (path.dirname(file) !== directory) throw new Error('Manifest tile escapes its output folder.');
      const route = `/tiles/${assets.size}.png`;
      assets.set(route, file);
      images.push(`<img src="${route}" alt="${escape(shot.frameName)}" loading="lazy">`);
    }
    sections.push(`<section id="shot-${index}"><header><h2>${escape(shot.frameName)}</h2><p>${escape(shot.url)}</p></header><div class="tiles">${images.join('')}</div></section>`);
  }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Designteam capture review</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f4f0;color:#20221f;font:16px/1.5 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:32px}h1{font-size:32px;margin:0}p{overflow-wrap:anywhere;color:#53584e}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}nav a{background:white;color:inherit;padding:8px 12px;border:1px solid #ccc;border-radius:6px;text-decoration:none}section{margin:32px 0;background:white;border:1px solid #ccc;border-radius:8px;overflow:hidden}header{padding:12px 20px}h2{font-size:18px;margin:0}header p{margin:4px 0}.tiles{max-width:1280px;margin:auto}.tiles img{display:block;max-width:100%;height:auto;margin:0 auto}aside{border-left:4px solid #9a5b1b;padding:8px 20px;background:#fff4df}footer{margin-top:32px;color:#53584e}</style><main><h1>Capture review</h1><p>${manifest.shots.length} captures · ${escape(manifest.createdAt)} · desktop and mobile screenshots</p><nav>${manifest.shots.map((s,i)=>`<a href="#shot-${i}">${escape(s.frameName)}</a>`).join('')}</nav>${manifest.warnings.length ? `<aside><strong>Capture warnings</strong><ul>${manifest.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul></aside>` : ''}${sections.join('') || '<p>No screenshots were captured. Check the warnings and try again.</p>'}<footer>Local review only. Images stay on this computer. Stop the terminal command to close this viewer.</footer></main></html>`;
  const server = createServer(async (request, response) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" };
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== expectedHost || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(403, headers).end(); return; }
    try {
      if (request.url === '/') { response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }).end(request.method === 'HEAD' ? undefined : html); return; }
      const file = assets.get(request.url);
      if (!file) { response.writeHead(404, headers).end(); return; }
      const bytes = request.method === 'HEAD' ? undefined : await readFile(file);
      response.writeHead(200, { ...headers, 'Content-Type': 'image/png' }).end(bytes);
    } catch { response.writeHead(500, headers).end('Could not read capture.'); }
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}
