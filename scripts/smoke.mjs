// A Playwright smoke test over the built app (DESIGN.md 4.4, Stage 6): serves dist/, opens the game in
// Chromium at iPhone size, goes through the fairy door to the map, taps her lantern, plays a few moves,
// and checks that the service worker's asset list names every picture under public/art. Run `npm run build`
// first, then `npm run smoke`. Set CHROME to a Chromium binary; without it Playwright's own install is used.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const PORT = 4190;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(DIST, path.endsWith('/') ? path + 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(PORT, r));

const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };

// 1. Every picture under art/ is in the service worker's asset list.
const sw = await readFile(join(DIST, 'sw.js'), 'utf8');
const art = (await walk(join(DIST, 'art'))).map((p) => relative(DIST, p));
const missing = art.filter((p) => !sw.includes(p));
check(missing.length === 0, `service worker lists all ${art.length} pictures${missing.length ? ` (missing ${missing.slice(0, 5).join(', ')})` : ''}`);

// 2. The app in Chromium.
// Headless Chromium's autoplay policy is not what the test is about: let sound start on the door tap as on the phone.
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const g = (fn, ...args) => page.evaluate(fn, ...args);

await page.goto(`http://localhost:${PORT}/?reset=1&level=2&debug=1&seed=5`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.touchscreen.tap(201, 745); // the fairy door at the foot of the launch picture
await page.waitForTimeout(3500);
check((await g(() => window.glimmerfall.phase())) === 'map', 'the fairy door opens onto the map');
check((await g(() => (window.glimmerfall.music() ?? '').startsWith('theme'))) === true, 'the theme plays on the map');

const y = Math.round(874 * 0.56);
for (let x = 60; x <= 340 && (await g(() => window.glimmerfall.phase())) !== 'playing'; x += 25) {
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1200);
check((await g(() => window.glimmerfall.phase())) === 'playing', 'a tap on her lantern opens the board');

let played = 0;
for (let m = 0; m < 4; m++) {
  const h = await g(() => window.glimmerfall.hint());
  if (!h) break;
  await g((hh) => window.glimmerfall.swap(hh.a, hh.b), h);
  for (let i = 0; i < 60 && (await g(() => window.glimmerfall.busy())); i++) await page.waitForTimeout(100);
  played++;
}
check(played === 4, `four hinted moves play through (${played})`);
const full = await g(() => { const s = window.glimmerfall.state(); let n = 0; s.board.forEach((row, r) => row.forEach((p, c) => { if (!p && (s.terrain?.open[r]?.[c] ?? true)) n++; })); return n === 0; });
check(full, 'the board is full after the moves');

await g(() => window.glimmerfall.openPanel());
await page.waitForTimeout(600);
check((await page.$('.gf-slider')) !== null, 'the grown-up panel opens with the night dimmer');
check(errors.length === 0, `no page errors${errors.length ? ` (${errors[0]})` : ''}`);

await browser.close();
server.close();
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nsmoke: all good');
