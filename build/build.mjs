// Builds dist/{firefox,chrome-mv3,chrome-mv2}  (BOX_TEST=1 -> dist-test/...)
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { icon } from './icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST = process.env.BOX_TEST === '1';
const OUT = path.join(root, TEST ? 'dist-test' : 'dist');
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const KEY = fs.readFileSync(path.join(root, 'build/chrome-key.pub.b64'), 'utf8').trim();

export const chromeExtensionId = () => {
  const h = crypto.createHash('sha256').update(Buffer.from(KEY, 'base64')).digest().subarray(0, 16);
  return [...h].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');
};

const TARGETS = {
  firefox: { platform: 'src/platform/firefox-entry.js' },
  'chrome-mv3': { platform: 'src/platform/chrome-mv3-entry.js' },
  'chrome-mv2': { platform: 'src/platform/chrome-mv2-entry.js' },
};

const UI_PAGES = ['popup', 'picker', 'settings', 'welcome'];
const GATE_TARGETS = new Set(['chrome-mv3']);
const FIXTURE_MATCHES = ['http://*.localhost/*', 'http://*.fixture.test/*'];

function manifest(target) {
  const ff = target === 'firefox', mv3 = target === 'chrome-mv3';
  const m = {
    manifest_version: mv3 ? 3 : 2,
    name: 'BoxBox',
    version: pkg.version,
    description: 'Isolated accounts per tab: log in to the same site with different accounts at the same time.',
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['content.js'], run_at: 'document_start', all_frames: true, match_about_blank: true }],
    options_ui: { page: 'settings.html', open_in_tab: true },
  };
  const action = { default_popup: 'popup.html', default_title: 'BoxBox', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } };
  if (mv3) m.action = action; else m.browser_action = action;
  const perms = ['tabs', 'webRequest', 'webNavigation', 'storage', 'proxy', '<all_urls>'];
  if (ff) {
    m.browser_specific_settings = { gecko: { id: 'box@box.local', strict_min_version: '140.0' } };
    m.background = { scripts: ['background.js'], persistent: true };
    m.permissions = [...perms, 'webRequestBlocking', 'contextualIdentities', 'cookies', 'browsingData', 'tabGroups', 'privacy'];
    m.permissions = m.permissions.filter((p) => p !== 'windows');
  } else {
    m.key = KEY;
    if (mv3) {
      m.background = { service_worker: 'background.js' };
      m.permissions = ['tabs', 'webRequest', 'webNavigation', 'storage', 'proxy', 'debugger', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'tabGroups', 'privacy', 'webRequestAuthProvider', 'unlimitedStorage'];
      m.host_permissions = ['<all_urls>'];
      m.minimum_chrome_version = '120';
      m.web_accessible_resources = [{ resources: ['gate.html', 'gate.js'], matches: ['http://*/*', 'https://*/*'] }];
    } else {
      m.background = { scripts: ['background.js'], persistent: true };
      m.permissions = [...perms, 'webRequestBlocking', 'debugger', 'privacy', 'unlimitedStorage', 'tabGroups'];
    }
  }
  if (TEST) m.permissions.push(...(ff ? [] : ['cookies', 'browsingData']));
  if (TEST) {
    m.content_scripts.push({ matches: FIXTURE_MATCHES, js: ['bridge.js'], run_at: 'document_start', all_frames: false });
    const war = UI_PAGES.map((p) => `${p}.html`).concat(['ui.css', 'fonts/jakarta.woff2'], UI_PAGES.map((p) => `${p}.js`));
    if (mv3) m.web_accessible_resources.push({ resources: war, matches: FIXTURE_MATCHES });
    else m.web_accessible_resources = war;
  }
  return m;
}

async function build(target) {
  const out = path.join(OUT, target);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  const common = {
    bundle: true, format: 'iife', target: ['firefox140', 'chrome120'], sourcemap: false, logLevel: 'warning',
    define: { __TARGET__: JSON.stringify(target), __TEST__: JSON.stringify(TEST) },
    alias: { 'box-platform': path.join(root, TARGETS[target].platform) },
    legalComments: 'none',
  };
  const entries = { background: 'src/background/main.js', content: 'src/content/content.js' };
  for (const p of UI_PAGES) if (fs.existsSync(path.join(root, `src/ui/${p}.js`))) entries[p] = `src/ui/${p}.js`;
  if (GATE_TARGETS.has(target)) entries.gate = 'src/ui/gate.js';
  if (TEST) entries.bridge = 'src/test/bridge.js';
  await esbuild.build({ ...common, entryPoints: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, path.join(root, v)])), outdir: out });
  for (const p of UI_PAGES) { const f = path.join(root, `src/ui/${p}.html`); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(out, `${p}.html`)); }
  if (GATE_TARGETS.has(target)) fs.copyFileSync(path.join(root, 'src/ui/gate.html'), path.join(out, 'gate.html'));
  for (const css of ['ui.css']) { const f = path.join(root, 'src/ui', css); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(out, css)); }
  fs.mkdirSync(path.join(out, 'fonts'), { recursive: true }); fs.copyFileSync(path.join(root, 'src/ui/fonts/jakarta.woff2'), path.join(out, 'fonts/jakarta.woff2'));
  for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(out, 'icons', `${s}.png`), icon(s));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest(target), null, 2));
  if (TEST && target !== 'firefox') fs.writeFileSync(path.join(out, '.extension-id'), chromeExtensionId());
  console.log(`built ${path.relative(root, out)}`);
}

for (const t of Object.keys(TARGETS)) {
  if (only.length && !only.includes(t)) continue;
  if (!fs.existsSync(path.join(root, TARGETS[t].platform))) { console.log(`skip ${t} (platform not implemented yet)`); continue; }
  await build(t);
}
