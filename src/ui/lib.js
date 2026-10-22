// Tiny UI toolkit: hyperscript, API access, icon set, theming.
import { ext } from '../core/ext.js';

const SVG = 'http://www.w3.org/2000/svg';
export function h(tag, props, ...kids) {
  const el = tag === 'svg' || props?.__svg ? document.createElementNS(SVG, tag) : document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === '__svg' || v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sv == null || sv === false) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}

const P = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  heart: '<path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L22 7H6"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5M16 11h.01M18.5 14h.01"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.3A3.4 3.4 0 0 1 17 18z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2.5 0-4-1-4-2.5S9.5 3 11 4c.8.5 1 2 1 4zm0 0c2.5 0 4-1 4-2.5S14.5 3 13 4c-.8.5-1 2-1 4z"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3M7.5 15h9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>',
  warn: '<path d="M12 3L2 20h20zM12 10v4M12 17h.01"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1"/>',
  merge: '<path d="M6 4v6a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v2M6 4h0M18 4v6"/>', split: '<path d="M12 21v-8M12 13L5 6M12 13l7-7M5 6v4M5 6h4M19 6v4M19 6h-4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>', sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  ask: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>', pin: '<path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z"/>',
  network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4.5M12 12l-6 5M12 12l6 5"/>',
};
export const iconNames = ['user', 'briefcase', 'home', 'heart', 'star', 'bolt', 'cart', 'game', 'code', 'book', 'cloud', 'shield', 'gift', 'camera', 'music', 'flask'];
export function icon(name, cls = '') {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic ' + cls); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || P.user;
  return s;
}

export function avatar(account, { size, warn } = {}) {
  const a = h('div', { class: 'avatar' + (account ? '' : ' globe'), style: { '--c': account ? account.color : undefined, width: size && size + 'px', height: size && size + 'px' } }, icon(account ? account.icon : 'globe'));
  if (warn) a.append(h('span', { class: 'warnpip' + (warn === 'fail' ? ' fail' : '') }, '!'));
  return a;
}

export const COLORS = ['#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#64748b'];

// ---- background API
export async function api(type, payload = {}) {
  const r = await ext.runtime.sendMessage({ type, ...payload });
  if (r && r.error) throw new Error(r.error);
  return r;
}

export function toast(msg, ms = 2200) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export async function applyTheme() {
  try {
    const s = await api('state');
    const t = s.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  } catch { /* background asleep */ }
}

export function params() { return new URLSearchParams(location.search); }
export const modeLabel = { default: 'Default session', remember: 'Remember last', ask: 'Ask every time' };
export const modeHelp = {
  default: 'Open services in your normal browser session. Switch accounts from the popup whenever you want.',
  remember: 'Open each service in the account you used last time.',
  ask: 'Show a picker before the page loads so you choose the account each time.',
};
export function proxyLabel(p) { return p ? `${p.type.toUpperCase()} ${p.host}:${p.port}` : ''; }

/** Modal/sheet helper. Returns {close}. `build(close)` returns the sheet content. */
export function sheet(build, { center = false, host = document.body } = {}) {
  const scrim = h('div', { class: 'scrim' + (center ? ' center' : ''), onclick: (e) => { if (e.target === scrim) close(); } });
  const close = () => { scrim.style.opacity = '0'; scrim.style.transition = 'opacity .18s'; setTimeout(() => scrim.remove(), 170); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const s = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, build(close));
  scrim.append(s); host.append(scrim);
  setTimeout(() => s.querySelector('input,button')?.focus(), 60);
  return { close };
}
