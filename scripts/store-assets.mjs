// Renders the web-store listing images from store/pages/*.html with the real extension pages (sample data) inside.
//   direnv exec . node scripts/store-assets.mjs [--only name,name]
import esbuild from 'esbuild';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { decodePng } from '../tests/lib/png.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = (...p) => path.join(root, 'store', ...p);
const args = process.argv.slice(2), only = (args[args.indexOf('--only') + 1] || '').split(',').filter(Boolean);

// ---- sample data (real catalog services + the real logo module)
const { CATALOG } = await import(pathToFileURL(path.join(root, 'src/core/catalog.js')).href);
const { LOGOS } = await import(pathToFileURL(path.join(root, 'src/ui/logos.js')).href);
const pick = (id) => { const s = CATALOG.find((x) => x.id === id); return { id: s.id, name: s.name, domains: s.domains, kind: 'catalog' }; };
const services = CATALOG.filter((s) => !s.id.startsWith('fx-')).map((s) => ({ id: s.id, name: s.name, domains: s.domains, kind: 'catalog' }));
services.find((x) => x.id === 'github').domains = ['github.com', 'gist.github.com', 'githubusercontent.com'];
const acc = (id, serviceId, name, color, icon, proxy) => ({ id, serviceId, name, color, icon, proxy: proxy || null, createdAt: 1 });
const accounts = [
  acc('a1', 'github', 'Personal', '#3b82f6', 'user'), acc('a2', 'github', 'Work', '#f97316', 'briefcase'), acc('a3', 'github', 'Open source', '#a855f7', 'code'),
  acc('b1', 'google', 'Personal', '#3b82f6', 'user'), acc('b2', 'google', 'Work', '#22c55e', 'briefcase'), acc('b3', 'google', 'School', '#ec4899', 'book'), acc('b4', 'google', 'Family', '#f59e0b', 'heart'),
  acc('c1', 'amazon', 'Home', '#f97316', 'home'), acc('c2', 'amazon', 'Business', '#6366f1', 'briefcase', { type: 'socks5', host: 'eu.proxy.example', port: 1080 }),
  acc('d1', 'notion', 'Notes', '#14b8a6', 'book'), acc('e1', 'discord', 'Gaming', '#8b5cf6', 'game'), acc('e2', 'discord', 'Friends', '#ec4899', 'music'), acc('f1', 'figma', 'Design', '#ef4444', 'star'),
];
const svgIcon = (id) => { const L = LOGOS[id]; return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${L.d}" fill="${L.hex}"/></svg>`)}`; };
const icons = { github: svgIcon('github') };
const sample = { services, accounts, icons, settings: { defaultMode: 'ask', modes: { amazon: 'default' }, theme: 'light', border: true, badge: true, tabGroups: true },
  tab: { url: 'https://github.com/boxbox/extension', host: 'github.com', serviceId: 'github', favIconUrl: icons.github, title: 'GitHub', accountId: 'a1' },
  picker: { url: 'https://github.com/boxbox/extension/issues', serviceId: 'github' },
  logos: Object.fromEntries(Object.entries(LOGOS).filter(([, v]) => v.type === 'path').map(([k, v]) => [k, { d: v.d, hex: v.hex }])) };
fs.writeFileSync(S('gen/stub.js'), fs.readFileSync(S('stub.tpl.js'), 'utf8').replace('__SAMPLE__', JSON.stringify(sample)));
fs.writeFileSync(S('gen/sample.js'), `globalThis.__sample = ${JSON.stringify(sample)};`);
// real extension pages, with the API stub injected, as frames
fs.mkdirSync(S('gen/frames'), { recursive: true });
for (const page of ['popup', 'picker', 'settings']) {
  let html = fs.readFileSync(path.join(root, 'dist/chrome-mv3', page + '.html'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="ui.css">', '<link rel="stylesheet" href="../../../dist/chrome-mv3/ui.css"><script src="../stub.js"></script>').replace(`src="${page}.js"`, `src="../../../dist/chrome-mv3/${page}.js"`);
  fs.writeFileSync(S('gen/frames', page + '.html'), html);
}
await esbuild.build({ entryPoints: [S('compose.js')], bundle: true, format: 'iife', outfile: S('gen/compose.js'), logLevel: 'warning', target: ['chrome120'] });

// 24-bit PNG (no alpha channel) — the Chrome Web Store asks for that
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function rgbPng(buf) {
  const d = decodePng(buf), raw = Buffer.alloc((d.w * 3 + 1) * d.h);
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) { const [r, g, b] = d.px(x, y); const o = y * (d.w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(d.w, 0); ih.writeUInt32BE(d.h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- render
const SIZES = JSON.parse(fs.readFileSync(S('sizes.json'), 'utf8'));
const b = await puppeteer.launch({ executablePath: process.env.BOX_CHROME, headless: true, args: ['--no-sandbox', '--allow-file-access-from-files', '--force-color-profile=srgb', '--font-render-hinting=none'] });
for (const [name, [w, h, wait = 3200]] of Object.entries(SIZES)) {
  if (only.length && !only.includes(name)) continue;
  const p = await b.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.warn(`[${name}]`, e.message));
  await p.goto(pathToFileURL(S('pages', name + '.html')).href); await new Promise((r) => setTimeout(r, wait));
  const file = S('out', name + '.png'); fs.writeFileSync(file, rgbPng(Buffer.from(await p.screenshot({ type: 'png' })))); await p.close();
  console.log('rendered', name, `${w}x${h}`);
}
// icons: 128x128 with the 96x96 artwork centred (Chrome), 64x64 for Firefox's listing
{
  await esbuild.build({ entryPoints: [S('icon-entry.js')], bundle: true, format: 'iife', outfile: S('gen/icon.js'), logLevel: 'warning' });
  const p = await b.newPage(); await p.goto('about:blank'); await p.addScriptTag({ path: S('gen/icon.js') });
  const mk = (size, art) => p.evaluate((size, art) => { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.translate((size - art) / 2, (size - art) / 2); globalThis.drawBoxIcon(g, art, null); return c.toDataURL('image/png'); }, size, art);
  fs.writeFileSync(S('out/icon-128.png'), Buffer.from((await mk(128, 96)).split(',')[1], 'base64'));
  fs.writeFileSync(S('out/icon-64.png'), Buffer.from((await mk(64, 64)).split(',')[1], 'base64'));
  await p.close(); console.log('icons');
}
await b.close();
