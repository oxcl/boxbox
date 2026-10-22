// Isolated-world content script (all frames, document_start). Responsibilities:
//  * remember trusted user gestures so the background can tell user navigations from page navigations
//  * (top frame) draw the account border + label, and badge the favicon
//  * (Chrome) perform storage wipes for deleted accounts
import { ext, IS_CHROME } from '../core/ext.js';
import { shim } from '../chrome/shim.js';
import { ICON_EMOJI as EMOJI } from '../core/model.js';

const isTop = window.top === window;
let lastGesture = 0, lastPing = -Infinity;

// MV2 (blocking webRequest) cannot ask this page anything asynchronously, so trusted gestures are reported
// through the same synchronous channel the shim uses. Other builds query `gesture?` on demand.
function syncCall(op, args) {
  try {
    if (!/^https?:/.test(location.protocol) && !/^https?:/.test(self.origin)) return null;
    const x = new XMLHttpRequest();
    x.open('GET', (self.origin || location.origin) + '/__box_sync?q=' + encodeURIComponent(JSON.stringify({ op, ...args })), false);
    x.send();
    return x.status === 200 ? JSON.parse(x.responseText) : null;
  } catch { return null; }
}
const PING_EVENTS = new Set(['click', 'auxclick', 'keydown', 'submit', 'contextmenu', 'mousedown']);
const mark = (e) => {
  if (!e.isTrusted) return;
  lastGesture = performance.now();
  if (__TARGET__ === 'chrome-mv2' && PING_EVENTS.has(e.type) && lastGesture - lastPing > 250) { lastPing = lastGesture; syncCall('gesture', {}); }
};

// MV2: the shim is injected as an inline script (the background adds a nonce to the page's CSP for account tabs).
if (__TARGET__ === 'chrome-mv2') {
  const cfg = syncCall('hello', {});
  if (cfg && cfg.acct) {
    const src = shim.toString();
    const full = { ...cfg, src, wrapWorkers: true };
    const s = document.createElement('script');
    if (cfg.nonce) s.setAttribute('nonce', cfg.nonce);
    s.textContent = `(${src})(${JSON.stringify(full)});`;
    (document.documentElement || document.head || document).prepend(s);
    s.remove();
  }
}
for (const t of ['mousedown', 'pointerdown', 'click', 'auxclick', 'keydown', 'submit', 'contextmenu', 'touchstart'])
  window.addEventListener(t, mark, { capture: true, passive: true });

let identity = null;

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.box) return;
  if (msg.type === 'gesture?') {
    const recent = performance.now() - lastGesture < 1500 && lastGesture > 0;
    if (recent) sendResponse({ recent: true });
    return; // other frames stay silent
  }
  if (msg.type === 'identity') { applyIdentity(msg.identity); return; }
  if (msg.type === 'wipe') {
    wipeAccount(msg.accountId, msg.prefix).then((r) => sendResponse(r), (e) => sendResponse({ error: String(e) }));
    return true;
  }
});

// ---------------------------------------------------------------------------- identity
async function refreshIdentity() {
  try { applyIdentity(await ext.runtime.sendMessage({ box: true, type: 'identity' }), true); } catch { /* background asleep / page gone */ }
}

function applyIdentity(id, initial = false) {
  identity = id;
  // session-restore marker: only judged on the page's own initial identity, never on later pushes
  if (initial && isTop && IS_CHROME && id && !id.account) {
    try { const m = sessionStorage.getItem('__box_acct'); if (m) { sessionStorage.removeItem('__box_acct'); if (id.restorable) ext.runtime.sendMessage({ type: 'adopt', accountId: m }).catch(() => {}); } } catch { /* ignore */ }
  }
  if (!isTop) return;
  const acct = id && id.account;
  if (acct && id.settings.border) showBorder(acct, id.status); else removeBorder();
  if (acct && id.settings.badge) startBadge(acct); else stopBadge();
  if (__TARGET__ === 'chrome-mv2') setTitleTag(acct && id.settings.tabGroups !== false ? `[${EMOJI[acct.icon] ? EMOJI[acct.icon] + ' ' : ''}${acct.name}] ` : null);
}

// ---- title tag (Manifest V2 has no tab groups, so the account is named in the tab title instead)
let titleTag = null, titleObs = null, appliedTag = null;
function paintTitle() {
  const t = document.title;
  if (titleTag && t.startsWith(titleTag)) { appliedTag = titleTag; return; }
  const bare = appliedTag && t.startsWith(appliedTag) ? t.slice(appliedTag.length) : t;
  if (!titleTag && bare === t) { appliedTag = null; return; }
  appliedTag = titleTag; document.title = (titleTag || '') + bare;
}
function setTitleTag(tag) {
  titleTag = tag;
  if (tag && !titleObs && document.documentElement) {
    titleObs = new MutationObserver(paintTitle);
    titleObs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  }
  if (!tag && titleObs) { titleObs.disconnect(); titleObs = null; }
  paintTitle();
}

// ---- border
const HOST_ID = '__box_border__';
let hostEl = null, rootObserver = null, moveHandler = null;

function showBorder(acct, status) {
  if (!hostEl) {
    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    hostEl.setAttribute('data-box-border', '');
    hostEl.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const root = hostEl.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host{all:initial}
        .frame{position:fixed;inset:0;pointer-events:none;box-sizing:border-box;border:4px solid var(--c);border-radius:0;opacity:0;animation:in .35s ease-out forwards}
        .sweep{position:fixed;inset:0;pointer-events:none;box-sizing:border-box;padding:4px;overflow:hidden;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
        .sweep i{position:absolute;left:50%;top:50%;width:300vmax;height:300vmax;margin:-150vmax 0 0 -150vmax;background:conic-gradient(from 0deg,transparent 0 70%,var(--c) 90%,transparent 100%);filter:brightness(1.45) saturate(1.1);animation:spin 1.1s .15s cubic-bezier(.4,0,.2,1) both}
        .pill{position:fixed;top:0;left:50%;transform:translate(-50%,-110%);display:flex;align-items:center;gap:6px;padding:4px 11px 5px 7px;
          border-radius:0 0 12px 12px;background:#fff;color:#2a2118;border-bottom:2px solid var(--c);font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
          letter-spacing:.005em;pointer-events:none;box-shadow:0 6px 16px -6px rgba(0,0,0,.4);white-space:nowrap;max-width:60vw;
          animation:drop .6s .1s cubic-bezier(.2,.9,.25,1.15) forwards;transition:opacity .2s, transform .25s}
        .pill.away{opacity:0;transform:translate(-50%,-110%)}
        .cube{width:16px;height:16px;flex:none}
        .warn{background:#fef3c7;color:#b45309;border-radius:8px;padding:1px 6px;font-size:11px}
        .name{overflow:hidden;text-overflow:ellipsis}
        @keyframes in{to{opacity:1}}
        @keyframes drop{to{transform:translate(-50%,0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.frame,.pill,.sweep i{animation-duration:.01s;animation-delay:0s}}
      </style>
      <div class="frame" part="frame"></div><div class="sweep"><i></i></div>
      <div class="pill" part="label"><svg class="cube" viewBox="0 0 24 24"><polygon points="12,2 21.5,7 12,12 2.5,7" fill="var(--c)" style="filter:brightness(1.3)"/><polygon points="2.5,7 12,12 12,22.5 2.5,17.5" fill="var(--c)"/><polygon points="21.5,7 12,12 12,22.5 21.5,17.5" fill="var(--c)" style="filter:brightness(.72)"/></svg><span class="name"></span><span class="warn" hidden></span></div>`;
    (document.documentElement || document).appendChild(hostEl);
    moveHandler = (e) => { const p = hostEl?.shadowRoot?.querySelector('.pill'); if (p) p.classList.toggle('away', e.clientY < 46 && Math.abs(e.clientX - innerWidth / 2) < 180); };
    window.addEventListener('mousemove', moveHandler, { passive: true });
    rootObserver = new MutationObserver(() => { if (hostEl && !hostEl.isConnected && document.documentElement) document.documentElement.appendChild(hostEl); });
    rootObserver.observe(document, { childList: true, subtree: false });
    if (document.documentElement) rootObserver.observe(document.documentElement, { childList: true });
  }
  const root = hostEl.shadowRoot;
  hostEl.style.setProperty('--c', acct.color);
  hostEl.dataset.account = acct.name;
  hostEl.dataset.color = acct.color;
  hostEl.dataset.accountId = acct.id;
  root.host.style.setProperty('--c', acct.color);
  root.querySelector('.frame').style.setProperty('--c', acct.color);
  const pill = root.querySelector('.pill'); pill.style.setProperty('--c', acct.color);
  root.querySelector('.name').textContent = acct.name;
  const warn = root.querySelector('.warn');
  const lvl = status && status.level;
  warn.hidden = !(lvl && lvl !== 'ok');
  warn.textContent = lvl === 'fail' ? '⚠ proxy' : lvl === 'warn' ? '⚠ check' : '';
  hostEl.dataset.status = lvl || 'ok';
  hostEl.title = '';
}
function removeBorder() {
  if (!hostEl) return;
  window.removeEventListener('mousemove', moveHandler);
  rootObserver?.disconnect(); rootObserver = null;
  hostEl.remove(); hostEl = null;
}

// ---- favicon badge
const BADGE_ATTR = 'data-box-icon';
let badgeColor = null, headObserver = null, badgeBusy = false, lastBadged = '';
const iconLinks = () => [...document.querySelectorAll('link[rel~="icon" i], link[rel="shortcut icon" i]')].filter((l) => !l.hasAttribute(BADGE_ATTR));

function startBadge(acct) {
  if (badgeColor === acct.color && headObserver) return;
  badgeColor = acct.color; lastBadged = '';
  const run = () => applyBadge();
  if (!headObserver) {
    headObserver = new MutationObserver(() => { if (!badgeBusy) setTimeout(run, 30); });
    const observe = () => document.head && headObserver.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'rel'] });
    if (document.head) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
}
function stopBadge() {
  headObserver?.disconnect(); headObserver = null; badgeColor = null; lastBadged = '';
  document.querySelectorAll(`link[${BADGE_ATTR}]`).forEach((l) => l.remove());
  document.querySelectorAll('link[data-box-hidden]').forEach((l) => { l.rel = l.getAttribute('data-box-hidden'); l.removeAttribute('data-box-hidden'); });
}
async function applyBadge() {
  if (!badgeColor || !document.head) return;
  const links = iconLinks();
  const href = links.length ? new URL(links[links.length - 1].getAttribute('href') || '', document.baseURI).href : new URL('/favicon.ico', location.href).href;
  const key = href + '|' + badgeColor;
  if (key === lastBadged && document.querySelector(`link[${BADGE_ATTR}]`)) return;
  badgeBusy = true;
  try {
    const res = await ext.runtime.sendMessage({ box: true, type: 'badgeIcon', href, color: badgeColor, host: location.hostname });
    if (!res || !res.dataUrl || !badgeColor) return;
    for (const l of iconLinks()) { l.setAttribute('data-box-hidden', l.getAttribute('rel')); l.setAttribute('rel', 'x-box-hidden'); }
    let mine = document.querySelector(`link[${BADGE_ATTR}]`);
    if (!mine) { mine = document.createElement('link'); mine.setAttribute(BADGE_ATTR, ''); document.head.appendChild(mine); }
    mine.rel = 'icon'; if (res.type) mine.type = res.type; else mine.removeAttribute('type');
    mine.href = res.dataUrl;
    lastBadged = key;
  } catch { /* ignore */ } finally { setTimeout(() => { badgeBusy = false; }, 60); }
}

// ---------------------------------------------------------------------------- wipe (Chrome)
async function wipeAccount(accountId, prefix) {
  const out = { ls: 0, idb: 0, caches: 0, opfs: 0 };
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) { localStorage.removeItem(k); out.ls++; }
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(prefix)) { sessionStorage.removeItem(k); }
  } catch { /* opaque origin */ }
  try {
    if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name && d.name.startsWith(prefix)) {
      await new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); });
      out.idb++;
    }
  } catch { /* ignore */ }
  try { if (window.caches) for (const n of await caches.keys()) if (n.startsWith(prefix)) { await caches.delete(n); out.caches++; } } catch { /* ignore */ }
  try { if (navigator.storage?.getDirectory) { const root = await navigator.storage.getDirectory(); await root.removeEntry(prefix.replace(/[^a-z0-9_]/gi, '_'), { recursive: true }); out.opfs++; } } catch { /* ignore */ }
  return out;
}

// Chrome: pending wipes are executed by whichever tab visits the origin next.
async function checkPendingWipes() {
  if (!IS_CHROME) return;
  try {
    const r = await ext.runtime.sendMessage({ box: true, type: 'pendingWipes', origin: location.origin });
    if (r && r.wipes) for (const w of r.wipes) { await wipeAccount(w.accountId, w.prefix); await ext.runtime.sendMessage({ box: true, type: 'wipeDone', origin: location.origin, accountId: w.accountId }); }
  } catch { /* ignore */ }
}

refreshIdentity();
if (isTop && IS_CHROME) setTimeout(checkPendingWipes, 300);
// A bfcache restore or SPA navigation may have changed what we should show.
window.addEventListener('pageshow', (e) => { if (e.persisted) refreshIdentity(); });
