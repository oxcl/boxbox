// BoxBox website. The boxes are the extension's own CSS-3D component (src/ui/box.js), so what you see here is what ships.
import { box, mini } from '../src/ui/box.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// flat mini cubes (brand marks)
$$('[data-mini]').forEach((el) => { const m = mini(el.dataset.mini, +el.dataset.size || 24); el.replaceWith(m); });

// ── hero: the opened kraft box with coloured boxes inside ──────────────────
const C = { blue: '#3b82f6', orange: '#f59e0b', green: '#22c55e', purple: '#8b5cf6', pink: '#ec4899' };
const ITEMS = [['blue', 'user', 'Personal', -88, -78, -46], ['orange', 'briefcase', 'Work', 0, -86, -50], ['green', 'book', 'School', 88, -78, -44], ['purple', 'game', 'Games', -46, -64, 42], ['pink', 'heart', 'Family', 48, -66, 44]];

function buildHero(mount) {
  const W = 316, H = 172, D = 214, item = 74;
  const root = box({ kraft: true, icon: '', wordmark: 'BoxBox', size: 200, face: true, lid: true, check: false, hover: false, float: true });
  root.classList.add('hero-box');
  root.style.setProperty('--w', W + 'px'); root.style.setProperty('--h', H + 'px'); root.style.setProperty('--d', D + 'px');
  root.style.setProperty('--open', reduce ? '.92' : '0');
  const cube = $('.cube', root);
  for (const c of ['b', 'l', 'f']) { const w = document.createElement('div'); w.className = 'in ' + c; cube.append(w); }
  const kids = ITEMS.map(([col, ic, lb, x, y, z]) => {
    const it = box({ color: C[col], icon: ic, label: lb, size: item, inner: true, hover: false });
    const at = (dy) => `translate3d(${x}px,${y + dy}px,${z}px)`;
    it.style.cssText += `;left:calc(50% - ${item / 2}px);top:calc(50% - ${item / 2}px);transform:${at(0)}`;
    cube.append(it); return { it, at };
  });
  mount.append(root);

  if (!reduce) {
    requestAnimationFrame(() => requestAnimationFrame(() => root.style.setProperty('--open', '.92')));
    kids.forEach(({ it, at }, i) => it.animate([{ transform: at(-300), opacity: 0 }, { transform: at(0), opacity: 1 }], { duration: 800, delay: 650 + i * 110, easing: 'cubic-bezier(.34,1.4,.64,1)', fill: 'backwards' }));
  }

  // gentle cursor tilt, only while the pointer moves
  if (reduce) return;
  const base = { x: -24, y: -32 }; let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const paint = () => {
    cx += (tx - cx) * .08; cy += (ty - cy) * .08;
    cube.style.transform = `rotateX(${base.x + cy}deg) rotateY(${base.y + cx}deg)`;
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) > .02 ? requestAnimationFrame(paint) : 0;
  };
  const hero = $('.hero');
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - .5) * 22; ty = -((e.clientY - r.top) / r.height - .5) * 14;
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { tx = ty = 0; if (!raf) raf = requestAnimationFrame(paint); });
}
buildHero($('#heroBox'));

// ── small boxes, built only when they scroll near the viewport ───────────────
const make = (o) => box({ hover: false, check: false, ...o });
function mountBox(el) {
  const d = el.dataset;
  el.append(make({ icon: d.box, color: d.color, size: +d.size || 110, kraft: !!d.kraft, lid: !!d.lid, float: true, ...(d.kraft ? { wordmark: '' } : {}) }));
  if (d.open) $('.bx', el).style.setProperty('--open', d.open);
  else if (d.lid) $('.bx', el).style.setProperty('--open', '.9');
}

const ART = {
  make() { return `<div class="col"><span class="newbox">New box</span></div>`; },
  pick() { return `<span class="tab"><i></i>Inbox</span>`; },
  stay() { return ''; },
};
$$('.art').forEach((a) => {
  const kind = a.dataset.art; a.innerHTML = ART[kind]();
  const host = kind === 'make' ? $('.col', a) : a;
  if (kind === 'make') host.prepend(make({ color: '#3b82f6', icon: 'briefcase', label: 'Work', size: 130, float: true }));
  if (kind === 'pick') { const b = make({ color: '#f59e0b', icon: 'user', label: 'Personal', size: 130, lid: true, float: true }); b.style.setProperty('--open', '.9'); a.append(b); }
  if (kind === 'stay') {
    const row = document.createElement('div'); row.className = 'row3';
    for (const [c, i, l] of [['#3b82f6', 'briefcase', 'Work'], ['#f59e0b', 'user', 'Personal'], ['#22c55e', 'cart', 'Shop']]) {
      const w = document.createElement('div'); w.className = 'col';
      w.append(make({ color: c, icon: i, label: l, size: 72, float: true }));
      const t = document.createElement('i'); t.className = 'tick'; t.textContent = '✓'; w.append(t); row.append(w);
    }
    a.append(row);
  }
});

const lazy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { mountBox(e.target); lazy.unobserve(e.target); } }), { rootMargin: '200px' });
$$('.mount[data-box]').forEach((m) => lazy.observe(m));

// ── reveal on scroll ──────────────────────────────────────────────────────
const rv = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
$$('.reveal').forEach((el) => {
  const sibs = $$('.reveal', el.parentElement).filter((s) => s.parentElement === el.parentElement);
  if (sibs.length > 1) el.style.setProperty('--d', sibs.indexOf(el) * 0.08 + 's');
  rv.observe(el);
});

// ── nav ───────────────────────────────────────────────────────────────────
const nav = $('#nav'), burger = $('#burger'), menu = $('#menu');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
burger.addEventListener('click', () => { const o = menu.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
menu.addEventListener('click', (e) => { if (e.target.closest('a')) { menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });

// ── entry-mode segmented control ──────────────────────────────────────────
const HINT = {
  ask: 'A picker appears <em>before</em> the page loads, so the site never sees the wrong account.',
  remember: 'The site reopens in the box you used last time. Nothing to click.',
  default: 'Opens in your normal browser session, untouched, until you choose a box.',
};
const seg = $('.seg'), hint = $('#modehint');
function setMode(btn) {
  $$('button', seg).forEach((b) => b.setAttribute('aria-checked', b === btn));
  seg.style.setProperty('--x', btn.offsetLeft - 4 + 'px'); seg.style.setProperty('--w', btn.offsetWidth + 'px');
  hint.innerHTML = HINT[btn.dataset.mode];
}
seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b); });
seg.addEventListener('keydown', (e) => {
  const bs = $$('button', seg), i = bs.indexOf(document.activeElement); if (i < 0) return;
  const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1 }[e.key]; if (n === undefined) return;
  e.preventDefault(); const t = bs[(n + bs.length) % bs.length]; t.focus(); setMode(t);
});
setMode($('[aria-checked="true"]', seg));
document.fonts && document.fonts.ready.then(() => setMode($('[aria-checked="true"]', seg)));

// ── donate ────────────────────────────────────────────────────────────────
const dn = $('#donate');
if (dn) {
  const coins = JSON.parse(dn.dataset.coins);
  const list = document.createElement('div'); list.className = 'coins'; list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Choose a network');
  const show = document.createElement('div'); show.className = 'dshow';
  show.innerHTML = '<img alt="" width="190" height="190"><small></small><div class="addr"><code></code><button type="button">Copy</button></div>';
  const img = $('img', show), sub = $('small', show), code = $('code', show), copy = $('button', show);
  function pick(c, btn) {
    $$('.coin', list).forEach((b) => b.setAttribute('aria-pressed', b === btn));
    img.src = c.qr; img.alt = `QR code for the ${c.name} address`; sub.textContent = c.sub; code.textContent = c.address; copy.textContent = 'Copy';
  }
  coins.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'coin'; b.setAttribute('aria-pressed', 'false');
    b.innerHTML = (c.icon ? `<img src="${c.icon}" alt="" width="22" height="22" loading="lazy">` : '<span class="dot"></span>') + `<span>${c.name}</span>`;
    b.addEventListener('click', () => pick(c, b)); list.append(b); if (i === 0) queueMicrotask(() => pick(c, b));
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code.textContent); copy.textContent = 'Copied'; }
    catch { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = 'Press ⌘/Ctrl+C'; }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1800);
  });
  dn.replaceChildren(list, show);
}
