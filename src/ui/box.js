// The BoxBox box: a small CSS-3D cardboard box that can take any colour and glyph, plus the choreography that uses it.
// Cheap by default; detail grows with size (see box()). Everything here is DOM + CSS, no images.
import * as MO from './motion.js';

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
// Glyphs painted on the front of a box. Same names as the account icon set (core/model.js ICONS).
export const GLYPHS = {
  user: P('<circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="currentColor"/>'),
  briefcase: P('<rect x="3" y="7" width="18" height="13" rx="3" fill="currentColor"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18" stroke="rgba(0,0,0,.25)"/>'),
  home: P('<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor"/>'),
  heart: P('<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="currentColor"/>'),
  star: P('<path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z" fill="currentColor"/>'),
  bolt: P('<path d="M13.5 2.5 4.5 13.5h6l-1 8 9-11h-6z" fill="currentColor"/>'),
  cart: P('<path d="M3 4h2.5l2.2 11h10.1l2-8H7"/><circle cx="9.5" cy="19.5" r="1.6" fill="currentColor"/><circle cx="17" cy="19.5" r="1.6" fill="currentColor"/>'),
  game: P('<rect x="2.5" y="6.5" width="19" height="11" rx="5.5" fill="currentColor"/><path d="M8 10v4M6 12h4" stroke="rgba(0,0,0,.3)"/><circle cx="15.5" cy="11" r=".9" fill="rgba(0,0,0,.3)"/><circle cx="17.5" cy="13" r=".9" fill="rgba(0,0,0,.3)"/>'),
  code: P('<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" stroke-width="2.4"/>'),
  book: P('<path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2z" fill="currentColor"/><path d="M4 20.5a2 2 0 0 1 2-2h13v2H6" stroke-width="1.6"/>'),
  cloud: P('<path d="M7.2 19a4.7 4.7 0 0 1-.8-9.3 6 6 0 0 1 11.4 1.5A3.9 3.9 0 0 1 17.5 19z" fill="currentColor"/>'),
  shield: P('<path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6z" fill="currentColor"/><path d="m9 12 2.2 2.2L15.5 10" stroke="rgba(0,0,0,.3)"/>'),
  gift: P('<rect x="3" y="8.5" width="18" height="4" rx="1" fill="currentColor"/><path d="M5 12.5v8h14v-8" fill="currentColor"/><path d="M12 8.5v12" stroke="rgba(0,0,0,.25)"/><path d="M12 8.5c-2.8 0-4.5-1-4.5-2.7S9.5 3.4 11 4.6c.9.7 1 2.4 1 3.9zm0 0c2.8 0 4.5-1 4.5-2.7S14.5 3.4 13 4.6c-.9.7-1 2.4-1 3.9z"/>'),
  camera: P('<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="currentColor"/><circle cx="12" cy="13.5" r="3.4" fill="rgba(0,0,0,.28)" stroke="none"/>'),
  music: P('<path d="M9 18V5.5l11-2V16" stroke-width="2.2"/><circle cx="6.5" cy="18" r="3" fill="currentColor"/><circle cx="17.5" cy="16" r="3" fill="currentColor"/>'),
  flask: P('<path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 15h9"/>'),
  check: P('<path d="m5 12.5 4.5 4.5L19 7.5" stroke-width="3"/>'),
};
export const KRAFT = '#c9a06c';

/** 3D cardboard box. Detail depends on size: <56 faces+glyph, <110 + label/sticker, ≥110 + grain/marks.
 *  opts: {color, icon, label, size, kraft, float, glow, hover, lid (build the two-flap lid), face (smile), inner (lives inside another 3D box), wordmark} */
export function box({ color = '#3b82f6', icon = 'user', label = '', size = 96, kraft = false, float = false, glow = false, hover = true, lid = false, face = false, inner = false, wordmark = '', check = true } = {}) {
  const el = document.createElement('div');
  const lod = size >= 110 ? 'lg' : size >= 56 ? 'md' : 'sm';
  el.className = ['bx', lod, kraft && 'kraft', float && 'float', glow && 'glow', hover && !inner && 'bx-hover', inner && 'inner'].filter(Boolean).join(' ');
  el.style.setProperty('--s', size + 'px'); if (!kraft) el.style.setProperty('--c', color);
  const detail = lod !== 'sm';
  const flap = (c) => `<div class="fl ${c}"><i class="o"><b class="tape"></b></i><i class="n"></i></div>`;
  el.innerHTML = `<div class="bob"><div class="cube">
    <div class="f front">${detail ? '<div class="tape"></div>' : ''}${wordmark ? `<div class="wm">${wordmark}</div>` : `<div class="ico">${GLYPHS[icon] || ''}</div>`}${detail ? '<div class="sticker"></div>' : ''}<i class="sw"></i></div>
    <div class="f right">${detail ? `<div class="label"><b>${esc(label) || (kraft ? 'BoxBox' : 'Box')}</b>${lod === 'lg' ? '<small>THIS SIDE UP</small>' : ''}<i></i></div>` : ''}${lod === 'lg' ? '<div class="marks"><i></i><i></i></div>' : ''}${face ? '<div class="smile"></div>' : ''}</div>
    <div class="top">${lid ? `<div class="inside"></div>${flap('l')}${flap('r')}` : `<i class="o plain">${detail ? '<b class="tape"></b>' : ''}</i>`}</div>
    </div></div>${inner ? '' : `<div class="shadow-blob"></div>${check ? `<div class="check">${GLYPHS.check}</div>` : ''}`}`;
  return el;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Flat isometric mini cube (no 3D, no children): for counts, rows, and the in-page pill. */
export function mini(color, size = 20) {
  const m = document.createElement('span'); m.className = 'mini'; m.style.setProperty('--s', size + 'px'); m.style.setProperty('--c', color);
  m.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="12,2 21.5,7 12,12 2.5,7" style="fill:var(--hi)"/><polygon points="2.5,7 12,12 12,22.5 2.5,17.5" style="fill:var(--c)"/><polygon points="21.5,7 12,12 12,22.5 21.5,17.5" style="fill:var(--lo)"/></svg>';
  return m;
}

/** Paint the box a new colour: the new colour fills the faces from the bottom up (one box, no cross-fade). */
export function recolor(b, color) {
  if (MO.reduce) { b.style.setProperty('--c', color); return Promise.resolve(); }
  b.querySelectorAll('.pt').forEach((x) => x.remove()); b.style.setProperty('--cn', color);
  const jobs = [[b.querySelector('.front'), 'pf', 0, 620], [b.querySelector('.right'), 'pr', 60, 620], ...[...b.querySelectorAll('.top .o')].map((o) => [o, 'po', 330, 460])];
  const anims = jobs.map(([host, cls, delay, dur]) => { const p = document.createElement('i'); p.className = 'pt ' + cls; host.prepend(p); return p.animate([{ '--p': '0%' }, { '--p': '114%' }], { duration: dur, delay, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' }); });
  return Promise.all(anims.map((a) => a.finished)).then(() => { b.style.transition = 'none'; b.style.setProperty('--c', color); b.querySelectorAll('.pt').forEach((x) => x.remove()); void b.offsetWidth; b.style.transition = ''; }).catch(() => {});
}

/** Swap a glyph on a box front with a quick flip. */
export function setGlyph(b, icon) {
  const ico = b.querySelector('.ico'); if (!ico) return;
  const swap = () => { ico.innerHTML = GLYPHS[icon] || ''; };
  if (MO.reduce) return swap();
  MO.A(ico, [{ transform: 'rotateY(0)', opacity: 1 }, { transform: 'rotateY(90deg)', opacity: 0 }], { duration: 130, fill: 'forwards' }).finished.then(() => { swap(); ico.getAnimations().forEach((a) => a.cancel()); MO.A(ico, [{ transform: 'rotateY(-90deg)', opacity: 0 }, { transform: 'rotateY(0)', opacity: 1 }], { duration: 180, fill: 'none' }); }).catch(() => {});
}

export function confetti(x, y, colors = ['#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ec4899'], n = 10) {
  if (MO.reduce) return;
  for (let i = 0; i < Math.min(n, 14); i++) {
    const c = document.createElement('i'); c.className = 'confetti';
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
    c.addEventListener('animationend', () => c.remove(), { once: true });
    c.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 24}px;--rot:${Math.random() * 540 - 270}deg;border-radius:${Math.random() > .5 ? '50%' : '3px'}`;
    document.body.append(c);
  }
}
export function burstAt(el, colors) {
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  confetti(x, y, colors); MO.ring(x, y, colors && colors[0]);
  const b = el.classList.contains('bx') ? el : el.querySelector('.bx'); if (b) { MO.shine(b); MO.squish(b); }
}

/* ---- choreography: a tab (the site header / tile) moves between boxes ---- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
function cloneOf(el) {
  const r = el.getBoundingClientRect(), c = el.cloneNode(true);
  c.removeAttribute('id'); c.classList.add('fly-clone'); c.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:9000;pointer-events:none;transform-origin:50% 50%;visibility:visible;`;
  document.body.append(c); return c;
}
function flight(c, from, to, { s0, s1, dir, duration, delay = 0, lift = 36 }) {
  const kf = [], n = 14, base = centre(c);
  for (let k = 0; k <= n; k++) { const q = k / n, x = from[0] + (to[0] - from[0]) * q - base[0], y = from[1] + (to[1] - from[1]) * q - base[1] - Math.sin(Math.PI * q) * lift, s = s0 + (s1 - s0) * q; kf.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`, opacity: dir === 'in' ? Math.min(1, (1 - q) * 4) : Math.min(1, q * 4), offset: q }); }
  return c.animate(kf, { duration, delay, easing: 'cubic-bezier(.35,.1,.25,1)', fill: 'both' });
}
const lidTop = (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * .32]; };

/** One overlapped motion: `header` shrinks into the previous box while the new box lets a copy out that grows back into place.
 *  onSwitch fires at the hand-over moment so state changes read as part of the motion. */
export async function swapTab(prevBox, newBox, header, { col, onSwitch } = {}) {
  if (!header || MO.reduce) { onSwitch && onSwitch(); return; }
  const home = centre(header), same = !prevBox || prevBox === newBox, out = cloneOf(header); header.style.visibility = 'hidden';
  const done = [];
  try {
    if (!same) {
      MO.lid(prevBox, 1); done.push(flight(out, home, lidTop(prevBox), { s0: 1, s1: .16, dir: 'in', duration: 440, delay: 70, lift: 28 }).finished);
      setTimeout(() => { MO.squish(prevBox); MO.lid(prevBox, 0); }, 430);
    } else out.remove();
    const back = cloneOf(header); back.style.opacity = 0;
    setTimeout(() => MO.lid(newBox, 1), same ? 0 : 250);
    done.push(flight(back, lidTop(newBox), home, { s0: .16, s1: 1, dir: 'out', duration: 460, delay: same ? 150 : 330, lift: 40 }).finished);
    setTimeout(() => { onSwitch && onSwitch(); }, same ? 120 : 380);
    setTimeout(() => { MO.lid(newBox, 0); MO.squish(newBox); MO.shine(newBox); const c = centre(newBox); MO.ring(c[0], c[1], col); }, (same ? 150 : 330) + 380);
    await Promise.all(done.map((p) => p.catch(() => {})));
    back.remove();
  } finally { out.remove(); header.style.visibility = ''; }
}
/** The tile hops into a box: lid opens, tile drops in, lid closes (used when there is no previous box). */
export async function tabInto(boxEl, tile) {
  if (!tile || MO.reduce) return;
  const c = cloneOf(tile); tile.style.visibility = 'hidden';
  try { MO.lid(boxEl, 1); await flight(c, centre(tile), lidTop(boxEl), { s0: 1, s1: .2, dir: 'in', duration: 460, delay: 120, lift: 70 }).finished; MO.squish(boxEl); MO.lid(boxEl, 0); await sleep(220); }
  finally { c.remove(); tile.style.visibility = ''; }
}

/** Segmented control whose thumb slides. Root contains buttons with aria-checked. Returns a function that re-places the thumb. */
export function slideSeg(root) {
  const btns = [...root.querySelectorAll('button')]; let thumb = root.querySelector('.thumb');
  if (!thumb) { thumb = document.createElement('div'); thumb.className = 'thumb'; root.prepend(thumb); }
  const place = () => { const b = btns.find((x) => x.getAttribute('aria-checked') === 'true') || btns[0]; if (!b) return; thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft - 3}px)`; };
  requestAnimationFrame(place); if (document.fonts) document.fonts.ready.then(place);
  return place;
}
