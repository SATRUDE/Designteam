import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { parseCommand } from '../lib/core/args.mjs';
import { sliceTall } from '../lib/core/slice.mjs';
import { startDashboard } from '../lib/core/dashboard.mjs';

const bin = fileURLToPath(new URL('../bin/designteam.mjs', import.meta.url));
function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b);
    child.stderr.on('data', b => stderr += b);
    child.on('error', reject);
    child.on('exit', code => resolve({ code, stdout, stderr }));
  });
}

test('rejects malformed capture input rather than silently dropping it', () => {
  for (const args of [
    ['capture','https://example.com','broken'],
    ['capture','https://example.com','--modes','tablet'],
    ['capture','https://example.com','--out'],
    ['capture','https://example.com','--max-tile','400.5'],
    ['capture','https://example.com','--max-tile','9999'],
    ['capture','https://user:password@example.com'],
  ]) assert.throws(() => parseCommand(args));
  assert.deepEqual(parseCommand(['capture','https://example.com','--modes','mobile,mobile']).options.modes,['mobile']);
});

test('tiles retain complete height and reject an excessive width', async () => {
  const png = await sharp({create:{width:100,height:8250,channels:3,background:'red'}}).png().toBuffer();
  const tiles = await sliceTall(png);
  assert.deepEqual(tiles.map(t=>t.height),[4000,4000,250]);
  const wide = await sharp({create:{width:4200,height:10,channels:3,background:'red'}}).png().toBuffer();
  await assert.rejects(sliceTall(wide), /width limit/);
});

test('CLI works outside a repository, preserves partial failures, refuses overwrite and serves review', {timeout:30000}, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(),'designteam-caller-'));
  const fixture = createServer((req,res) => {
    if (req.url === '/missing') { res.writeHead(404).end('Missing'); return; }
    res.writeHead(200, {'Content-Type':'text/html'}).end('<!doctype html><html><head><title>Fixture</title></head><body style="margin:0"><nav><a href="/next">Next</a></nav><main style="height:900px;background:#d1e2e8"><h1>Screenshot fixture</h1></main></body></html>');
  });
  fixture.listen(0,'127.0.0.1'); await once(fixture,'listening');
  const base = `http://127.0.0.1:${fixture.address().port}`;
  let dashboard;
  try {
    const result = await run(['capture',base,base+'/missing','--modes','mobile','--out','./output'],cwd);
    assert.equal(result.code,2,result.stderr);
    assert.equal(await realpath(result.stdout.trim()),await realpath(path.join(cwd,'output','manifest.json')));
    const manifest = JSON.parse(await readFile(result.stdout.trim(),'utf8'));
    assert.equal(manifest.shots.length,1); assert.equal(manifest.failed,1);
    assert.match(manifest.warnings[0],/404/);
    const second = await run(['capture',base,'--out','./output'],cwd);
    assert.equal(second.code,1); assert.match(second.stderr,/EEXIST/);
    const allFailed = await run(['capture',base+'/missing','--out','./failed'],cwd);
    assert.equal(allFailed.code,1);
    const crawl = await run(['crawl',base],cwd);
    assert.equal(crawl.code,0,crawl.stderr); assert.equal(JSON.parse(crawl.stdout).links[1].url,base+'/next');
    dashboard = await startDashboard(result.stdout.trim());
    const page = await fetch(dashboard.url); assert.equal(page.status,200); assert.match(await page.text(),/Screenshot fixture|Capture review/);
    const tile = await fetch(new URL('tiles/0.png',dashboard.url)); assert.equal(tile.headers.get('content-type'),'image/png');
    assert.equal((await fetch(new URL('manifest.json',dashboard.url))).status,404);
  } finally {
    dashboard?.server.close(); dashboard?.server.closeAllConnections(); fixture.close(); fixture.closeAllConnections(); await rm(cwd,{recursive:true,force:true});
  }
});

test('dashboard rejects tiles outside the capture folder including symlinks', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'designteam-manifest-'));
  try {
    const file=path.join(dir,'manifest.json');
    const manifest={version:1,warnings:[],shots:[{tiles:[{file:'../secret.png'}]}]};
    await writeFile(file,JSON.stringify(manifest));
    await assert.rejects(startDashboard(file),/invalid tile/);
    await symlink('/etc/hosts',path.join(dir,'linked.png'));
    manifest.shots[0].tiles[0].file='linked.png';await writeFile(file,JSON.stringify(manifest));
    await assert.rejects(startDashboard(file),/escapes/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
