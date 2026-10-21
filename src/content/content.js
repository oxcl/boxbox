// Isolated-world content script (all frames, document_start). Responsibilities:
//  * remember trusted user gestures so the background can tell user navigations from page navigations
//  * (top frame) draw the account border + label, and badge the favicon
//  * (Chrome) perform storage wipes for deleted accounts
import { ext, IS_CHROME } from '../core/ext.js';

const isTop = window.top === window;
let lastGesture = 0;
const mark = (e) => { if (e.isTrusted) lastGesture = performance.now(); };
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
  try { applyIdentity(await ext.runtime.sendMessage({ box: true, type: 'identity' })); } catch { /* background asleep / page gone */ }
}

function applyIdentity(id) {
  identity = id;
  if (!isTop) return;
  const acct = id && id.account;
  if (acct && id.settings.border) showBorder(acct, id.status); else removeBorder();
  if (acct && id.settings.badge) startBadge(acct); else stopBadge();
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
        .frame{position:fixed;inset:0;pointer-events:none;box-sizing:border-box;border:3px solid var(--c);border-radius:0;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.35), inset 0 0 28px -6px var(--c);opacity:0;animation:in .35s ease-out forwards}
        .pill{position:fixed;top:0;left:50%;transform:translate(-50%,-110%);display:flex;align-items:center;gap:7px;padding:4px 12px 5px;
          border-radius:0 0 12px 12px;background:var(--c);color:#fff;font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
          letter-spacing:.01em;pointer-events:none;box-shadow:0 4px 14px -4px rgba(0,0,0,.45);white-space:nowrap;max-width:60vw;
          animation:drop .45s .1s cubic-bezier(.2,.9,.25,1.2) forwards;transition:opacity .2s, transform .25s}
        .pill.away{opacity:0;transform:translate(-50%,-110%)}
        .dot{width:8px;height:8px;border-radius:50%;background:#fff;opacity:.9;flex:none}
        .warn{background:#fff;color:#b45309;border-radius:8px;padding:1px 6px;font-size:11px}
        .name{overflow:hidden;text-overflow:ellipsis}
        @keyframes in{to{opacity:1}}
        @keyframes drop{to{transform:translate(-50%,0)}}
        @media (prefers-reduced-motion:reduce){.frame,.pill{animation-duration:.01s}}
      </style>
      <div class="frame" part="frame"></div>
      <div class="pill" part="label"><span class="dot"></span><span class="name"></span><span class="warn" hidden></span></div>`;
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
