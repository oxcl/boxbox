// Checks the built website (website-dist/) in a real browser: no console errors, every link and image resolves,
// the interactive bits work, nothing overflows on a phone, and the page stays light.
//   npm run build:website && BOX_CHROME=/path/to/chrome node tests/website.mjs
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'website-dist');
if (!fs.existsSync(root)) { console.error('website-dist/ is missing: run `npm run build:website` first'); process.exit(2); }
if (!process.env.BOX_CHROME) { console.error('Set BOX_CHROME to a Chrome/Chromium executable'); process.exit(2); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f));
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${cond ? '' : extra ? '  → ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.BOX_CHROME, headless: true, args: ['--no-sandbox'] });
try {
  // ── desktop ──
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [], bytes = {}, failed = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', async (r) => { try { bytes[r.url()] = (await r.buffer()).length; if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); } catch {} });
  await page.evaluateOnNewDocument(() => {
    window.__cls = 0; window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  console.log('Page');
  await page.goto(base, { waitUntil: 'networkidle0' });
  await sleep(1800);
  ok('no console errors or warnings', errors.length === 0, errors.join(' | '));
  ok('no failed requests', failed.length === 0, failed.join(' | '));
  ok('no external requests (everything is self-hosted)', Object.keys(bytes).every((u) => u.startsWith(base) || u.startsWith('data:')), Object.keys(bytes).filter((u) => !u.startsWith(base) && !u.startsWith('data:')).join(' '));

  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  ok(`first load is light (${(total / 1024).toFixed(0)} KB uncompressed, limit 400 KB)`, total < 400 * 1024);
  ok('render-blocking resources are only the stylesheet', (await page.evaluate(() => [...document.querySelectorAll('head script[src]:not([defer]):not([async]), head link[rel=stylesheet]')].length)) === 1);
  const vit = await page.evaluate(() => ({ cls: window.__cls, lcp: window.__lcp, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime }));
  ok(`first contentful paint < 1000 ms (${Math.round(vit.fcp)} ms)`, vit.fcp < 1000);
  ok(`largest contentful paint < 1500 ms (${Math.round(vit.lcp)} ms)`, vit.lcp < 1500);
  ok(`layout shift < 0.05 (${vit.cls.toFixed(3)})`, vit.cls < 0.05);

  ok('title and description are set', await page.evaluate(() => document.title.length > 10 && document.querySelector('meta[name=description]').content.length > 50));
  ok('one h1', (await page.evaluate(() => document.querySelectorAll('h1').length)) === 1);
  ok('every image has an alt attribute', await page.evaluate(() => [...document.images].every((i) => i.hasAttribute('alt'))));
  ok('no unreplaced {{placeholders}}', !(await page.content()).includes('{{'));

  const anchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1));
  const missing = await page.evaluate((a) => a.filter((h) => !document.querySelector(h)), anchors);
  ok(`all ${anchors.length} in-page links point somewhere`, missing.length === 0, missing.join(' '));
  const internal = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => !/^(#|https?:|mailto:)/.test(h)));
  ok('internal links exist', internal.every((h) => fs.existsSync(path.join(root, h.split('#')[0] || 'index.html'))), internal.join(' '));

  console.log('Interaction');
  ok('hero box is built (3D cube with 5 boxes inside)', await page.evaluate(() => document.querySelectorAll('#heroBox .hero-box .inner').length === 5));
  ok('hero lid opens', await page.evaluate(() => getComputedStyle(document.querySelector('.hero-box')).getPropertyValue('--open').trim() === '0.92'));
  await page.mouse.move(300, 300); await page.mouse.move(1200, 600, { steps: 6 }); await sleep(500);
  ok('cursor tilts the hero box', await page.evaluate(() => /rotateX/.test(document.querySelector('.hero-box .cube').style.transform)));

  await page.evaluate(() => document.querySelector('#features').scrollIntoView()); await sleep(900);
  await page.click('.seg button[data-mode="remember"]');
  ok('entry-mode control switches mode and text', await page.evaluate(() => document.querySelector('.seg button[data-mode="remember"]').getAttribute('aria-checked') === 'true' && /last time/.test(document.querySelector('#modehint').textContent)));
  await page.focus('.seg button[data-mode="remember"]'); await page.keyboard.press('ArrowRight');
  ok('entry-mode control works with the keyboard', await page.evaluate(() => document.querySelector('.seg button[data-mode="default"]').getAttribute('aria-checked') === 'true'));
  ok('feature boxes are built lazily when they scroll into view', await page.evaluate(() => document.querySelectorAll('.v-proxy .bx, .v-wipe .bx').length === 2));

  await page.evaluate(() => document.querySelector('#faq').scrollIntoView()); await sleep(500);
  await page.click('.faq details:nth-child(2) summary');
  ok('FAQ opens', await page.evaluate(() => document.querySelector('.faq details:nth-child(2)').open));

  await page.evaluate(() => document.querySelector('#support').scrollIntoView()); await sleep(500);
  const coins = await page.$$eval('#donate .coin', (b) => b.length);
  ok('donation list renders', coins === 6, String(coins));
  const first = await page.$eval('#donate code', (c) => c.textContent);
  await page.click('#donate .coin:nth-child(3)');
  const third = await page.$eval('#donate code', (c) => c.textContent);
  const data = JSON.parse(fs.readFileSync(path.resolve(root, '..', 'website', 'donate.json'), 'utf8'));
  ok('choosing a network shows its address and QR code', third === data[2].address && first === data[0].address && (await page.$eval('#donate img.dshow, .dshow img', (i) => i.getAttribute('src') === 'images/qr/tron.png')));
  await sleep(400);
  ok('every image loaded', await page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)), await page.evaluate(() => [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src).join(' ')));
  ok('every donation address in the page matches the source file', data.every((c) => fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes(c.address)));

  // ── phone ──
  console.log('Phone (390 px)');
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const merr = []; m.on('pageerror', (e) => merr.push(e.message)); m.on('console', (x) => x.type() === 'error' && merr.push(x.text()));
  await m.goto(base, { waitUntil: 'networkidle0' }); await sleep(1500);
  ok('no horizontal scrolling', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await m.evaluate(() => String(document.documentElement.scrollWidth)));
  ok('no console errors', merr.length === 0, merr.join(' | '));
  ok('menu is collapsed, burger visible', await m.evaluate(() => getComputedStyle(document.querySelector('#menu')).display === 'none' && getComputedStyle(document.querySelector('#burger')).display !== 'none'));
  await m.tap('#burger');
  ok('burger opens the menu', await m.evaluate(() => getComputedStyle(document.querySelector('#menu')).display !== 'none' && document.querySelector('#burger').getAttribute('aria-expanded') === 'true'));
  ok('tap targets are at least 40 px', await m.evaluate(() => [...document.querySelectorAll('.btn, .burger, .coin, .seg button, .faq summary')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().height >= 38)));

  // ── dark + reduced motion ──
  console.log('Preferences');
  const d = await browser.newPage();
  await d.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await d.setViewport({ width: 1280, height: 800 });
  await d.goto(base, { waitUntil: 'networkidle0' });
  ok('dark mode follows the system', await d.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(26, 21, 17)'));
  ok('reduced motion: content visible immediately, lid already open', await d.evaluate(() => { const r = document.querySelector('.reveal'); return getComputedStyle(r).opacity === '1' && getComputedStyle(document.querySelector('.hero-box')).getPropertyValue('--open').trim() === '0.92'; }));

  // ── policy page ──
  console.log('Privacy policy');
  const pp = await browser.newPage(); const perr = []; pp.on('pageerror', (e) => perr.push(e.message)); pp.on('console', (x) => x.type() === 'error' && perr.push(x.text()));
  await pp.goto(base + 'PRIVACY_POLICY.html', { waitUntil: 'networkidle0' });
  ok('loads without errors', perr.length === 0, perr.join(' '));
  ok('mentions GPL, not MIT', await pp.evaluate(() => /GPL/.test(document.body.textContent) && !/MIT/.test(document.body.textContent)));
} finally {
  await browser.close(); server.close();
}
console.log(`\nwebsite: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
