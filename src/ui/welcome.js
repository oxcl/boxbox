// First-run welcome: three slides, the screen closes like a box lid between them.
import { h, icon, api, applyTheme } from './lib.js';
import { ext } from '../core/ext.js';
import * as MO from './motion.js';
import { box, mini, burstAt, KRAFT } from './box.js';

applyTheme();
document.querySelector('.logo').append(mini(KRAFT, 30), 'BoxBox');
document.getElementById('plus').append(icon('plus')); ['arr', 'arr2', 'arr3'].forEach((i) => document.getElementById(i).append(icon('chevron')));

// ---- hero: a wide kraft box, flaps open outward, coloured boxes rise out of it
const COLORS = { blue: '#3b82f6', orange: '#f59e0b', green: '#22c55e', purple: '#8b5cf6', pink: '#ec4899' };
const W = 316, H = 172, D = 214;
const ITEMS = [['blue', 'user', 'Personal', -88, -78, -46], ['orange', 'briefcase', 'Work', 0, -86, -50], ['green', 'book', 'School', 88, -78, -44], ['purple', 'game', 'Games', -46, -64, 42], ['pink', 'heart', 'Family', 48, -66, 44]];
const hero = document.getElementById('hero');
const root = box({ kraft: true, icon: '', wordmark: 'BoxBox', size: 200, face: true, lid: true, check: false });
root.classList.add('hero-box'); root.style.setProperty('--w', W + 'px'); root.style.setProperty('--h', H + 'px'); root.style.setProperty('--d', D + 'px');
const cube = root.querySelector('.cube');
for (const c of ['b', 'l', 'f']) cube.append(h('div', { class: 'in ' + c }));
const items = ITEMS.map(([col, ic, lb, x, y, z]) => {
  const it = box({ color: COLORS[col], icon: ic, label: lb, size: 74, inner: true, hover: false });
  it.style.cssText += `;left:calc(50% - 37px);top:calc(50% - 37px);transform:translate3d(${x}px,${y + 100}px,${z}px)`; it.dataset.x = x; it.dataset.y = y; it.dataset.z = z; cube.append(it); return it;
});
hero.append(root);
let playing = false, played = false;
async function unbox(first) {
  if (playing) return; playing = true;
  items.forEach((it) => { it.getAnimations().forEach((a) => a.cancel()); it.style.transform = `translate3d(${it.dataset.x}px,${+it.dataset.y + 100}px,${it.dataset.z}px)`; });
  if (!first) { await MO.lid(root, 0); await new Promise((r) => setTimeout(r, 120)); }
  else MO.A(root, [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  await new Promise((r) => setTimeout(r, first ? 600 : 80)); MO.lid(root, .92);
  items.forEach((it, i) => { const x = +it.dataset.x, y = +it.dataset.y, z = +it.dataset.z; const up = it.animate([{ transform: `translate3d(${x}px,${y + 100}px,${z}px)` }, { transform: `translate3d(${x}px,${y - 8}px,${z}px)`, offset: .72 }, { transform: `translate3d(${x}px,${y}px,${z}px)` }], { duration: 900, delay: 300 + i * 100, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'both' }); up.finished.then(() => { up.commitStyles(); up.cancel(); it.animate([{ transform: `translate3d(${x}px,${y}px,${z}px)` }, { transform: `translate3d(${x}px,${y - 4}px,${z}px)` }], { duration: 2600 + i * 240, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }); }).catch(() => {}); });
  setTimeout(() => { playing = false; played = true; }, 1500);
}
hero.style.cursor = 'pointer'; hero.title = 'Click to replay'; hero.addEventListener('click', () => { if (played) unbox(false); });
setTimeout(() => unbox(true), 300);

// ---- slide 2: tabs → boxes
const rows = [['G', '#4285f4', 'mail.google.com', 'work', '#3b82f6', 'briefcase'], ['G', '#4285f4', 'mail.google.com', 'personal', '#fb7185', 'user'], ['a', '#ff9900', 'amazon.com', 'shopping', '#22c55e', 'cart']];
rows.forEach(([l, col, host, name, c, ic], k) => {
  const r = h('div', { class: 'brow glass', style: { '--c': c } }, h('div', { class: 'tab' }, h('span', { class: 'fav', style: { background: col } }, l), h('span', {}, host, h('span', { class: 'who' }, `signed in as ${name}@example.com`))), h('div', { class: 'wire' }));
  const b = box({ color: c, icon: ic, label: name, size: 54, float: true, check: false }); b.style.animationDelay = k * 150 + 'ms'; r.append(b); document.getElementById('tabsdemo').append(r);
});

// ---- slide 3: entry mode (this really sets the default mode)
let chosenMode = 'remember';
const MODES = [['default', 'No box', 'Open in your normal session', null], ['remember', 'Last used', 'Pick up where you left off', '#3b82f6'], ['ask', 'Ask me', 'A little choice before the page loads', '#f59e0b']];
const modesEl = document.getElementById('modes');
MODES.forEach(([mode, t, d, c]) => {
  const bx = c ? box({ color: c, icon: 'user', size: 76, lid: true, label: t.slice(0, 8), check: false }) : box({ kraft: true, icon: 'home', size: 76, lid: true, label: 'default', check: false });
  const m = h('button', { class: 'card mode glass rf' + (mode === chosenMode ? ' selected on' : ''), type: 'button', 'data-mode': mode, 'data-tilt': 4, style: { '--rc': c || KRAFT, '--c': c || KRAFT } }, h('div', { class: 'stage' }, bx), h('h3', {}, t), h('p', { style: { fontSize: '14px', margin: 0, color: 'var(--muted)' } }, d), h('span', { class: 'tick' }, icon('check')));
  m.onclick = () => { chosenMode = mode; modesEl.querySelectorAll('.mode').forEach((x) => x.classList.remove('selected', 'on')); void m.offsetWidth; m.classList.add('selected', 'on'); MO.lid(bx, 1); setTimeout(() => MO.lid(bx, 0), 380); burstAt(bx, [c || '#c8a06b']); };
  modesEl.append(m);
});
document.getElementById('pinhint').textContent = 'Tip: pin BoxBox to your toolbar so the box for each tab is one click away.';

// ---- carousel: the lid closes, the slide changes behind it, the lid opens again
let cur = 0, busy = false;
const slides = [...document.querySelectorAll('.slide')], dots = [...document.querySelectorAll('#dots button')], win = document.querySelector('.win');
const show = (n) => { cur = n; slides.forEach((s, i) => s.classList.toggle('on', i === cur)); dots.forEach((d, i) => d.classList.toggle('on', i === cur)); document.getElementById('count').textContent = `${cur + 1} / 3`; document.getElementById('back').classList.toggle('on', cur > 0); document.getElementById('skip').style.display = cur === 2 ? 'none' : ''; };
const go = (n) => { n = Math.max(0, Math.min(2, n)); if (n === cur || busy) return; busy = true; MO.lidWipe(win, () => show(n)).then(() => { busy = false; }); };
show(0);
dots.forEach((d, i) => d.onclick = () => go(i));
document.getElementById('next1').onclick = () => go(1); document.getElementById('next2').onclick = () => go(2);
document.getElementById('back').onclick = () => go(cur - 1); document.getElementById('skip').onclick = () => go(2);
document.getElementById('finish').onclick = async (e) => {
  burstAt(e.currentTarget);
  try { await api('setSettings', { patch: { defaultMode: chosenMode } }); } catch { /* background asleep: the default stays */ }
  setTimeout(async () => { try { const t = await ext.tabs.getCurrent(); if (t) await ext.tabs.remove(t.id); else window.close(); } catch { window.close(); } }, 700);
};
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); });
