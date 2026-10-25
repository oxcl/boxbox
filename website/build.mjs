// Builds the static site into website-dist/.   node website/build.mjs      (Node 18+ or Bun; only needs `npm ci`)
// Reuses the extension's design tokens, box CSS, catalog and logos, so the site always matches the product.
import esbuild from 'esbuild';
import * as si from 'simple-icons';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'website'), OUT = path.join(root, 'website-dist');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const cfg = JSON.parse(read(SRC, 'site.config.json'));
const { CATALOG } = await import(pathToFileURL(path.join(root, 'src/core/catalog.js')).href);
const { LOGOS } = await import(pathToFileURL(path.join(root, 'src/ui/logos.js')).href);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ── CSS: tokens + box component from the extension's stylesheet, then the site's own ──
const ui = read(root, 'src/ui/ui.css');
const between = (a, b) => { const i = ui.indexOf(a), j = ui.indexOf(b, i); if (i < 0 || j < 0) throw new Error(`ui.css markers moved: ${a} … ${b}`); return ui.slice(i, j); };
const tokens = between('/* BoxBox design language', '* { box-sizing');
const boxCss = between('/* ---------- 3D box', '/* border that fills');
const css = (await esbuild.transform(tokens + boxCss + read(SRC, 'style.css'), { loader: 'css', minify: true, target: ['chrome100', 'firefox100', 'safari15'] })).code;
fs.writeFileSync(path.join(OUT, 'style.css'), css);

// ── JS ──
await esbuild.build({ entryPoints: [path.join(SRC, 'site.js')], bundle: true, minify: true, format: 'iife', target: ['chrome100', 'firefox100', 'safari15'], outfile: path.join(OUT, 'site.js'), logLevel: 'warning' });

// ── HTML templating ──
const dark = (hex) => { const n = parseInt(hex.replace('#', ''), 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l < 0.28; };
let gid = 0;
const logoSvg = (id) => {
  const L = LOGOS[id];
  if (L.type === 'path') return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${dark(L.hex) ? 'currentColor' : L.hex}" d="${L.d}"/></svg>`;
  if (L.type === 'svg') return L.svg.replace('<svg ', '<svg aria-hidden="true" ');
  if (L.type === 'tile') return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="${L.bg}"/><text x="12" y="${L.text.length > 1 ? 15.6 : 16.8}" text-anchor="middle" font-weight="800" font-size="${L.text.length > 1 ? 11 : 14}" fill="#fff" font-family="Jakarta,system-ui,sans-serif">${L.text}</text></svg>`;
  // text logo with a hard-stop gradient (Google's G): four colours, split on the diagonal
  const cols = [...L.gradient.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]), g = 'g' + gid++;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">${cols.map((c, i) => `<stop offset="${i * 25}%" stop-color="${c}"/><stop offset="${(i + 1) * 25}%" stop-color="${c}"/>`).join('')}</linearGradient></defs><text x="12" y="19" text-anchor="middle" font-weight="800" font-size="22" fill="url(#${g})" font-family="Jakarta,system-ui,sans-serif">${L.text}</text></svg>`;
};
const glyph = (icon) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon.path}"/></svg>`;
const SHELF = ['google', 'github', 'reddit', 'amazon', 'x', 'microsoft', 'discord', 'notion', 'figma', 'spotify', 'slack'];
const tiles = SHELF.map((id) => {
  const s = CATALOG.find((c) => c.id === id);
  return `      <li>${logoSvg(id)}<b>${s.name.replace(/ \(.*\)/, '')}</b><small>${s.domains.length} domain${s.domains.length > 1 ? 's' : ''}</small></li>`;
}).join('\n') + '\n      <li class="more"><b>+ any other site</b><small>each its own service</small></li>';

const vars = {
  SITE_URL: cfg.siteUrl, REPO_URL: cfg.repoUrl, CHROME_URL: cfg.chromeUrl, FIREFOX_URL: cfg.firefoxUrl,
  ICON_chrome: glyph(si.siGooglechrome), ICON_firefox: glyph(si.siFirefoxbrowser), ICON_github: glyph(si.siGithub),
  LOGO_google: logoSvg('google'), LOGO_TILES: tiles,
  DONATE_JSON: read(SRC, 'donate.json').replace(/\s*\n\s*/g, '').replace(/"/g, '&quot;'),
};
const render = (html) => html.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error('unknown placeholder ' + k); return vars[k]; });
const squash = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*/g, ' ').replace(/> </g, '><').replace(/ {2,}/g, ' ');
for (const f of ['index.html', 'PRIVACY_POLICY.html']) fs.writeFileSync(path.join(OUT, f), squash(render(read(SRC, f))));

// ── static files ──
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${cfg.siteUrl}sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${cfg.siteUrl}</loc><priority>1.0</priority></url>\n  <url><loc>${cfg.siteUrl}PRIVACY_POLICY.html</loc><priority>0.3</priority></url>\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.cpSync(path.join(SRC, 'images'), path.join(OUT, 'images'), { recursive: true });
fs.cpSync(path.join(SRC, 'fonts'), path.join(OUT, 'fonts'), { recursive: true });

const size = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB';
console.log(`built website-dist  html ${size('index.html')} · css ${size('style.css')} · js ${size('site.js')} · font ${size('fonts/jakarta.woff2')}`);
