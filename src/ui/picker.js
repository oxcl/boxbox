import { h, icon, api, toast, applyTheme, params, proxyLabel } from './lib.js';
import * as MO from './motion.js';
import { box, tabInto, KRAFT } from './box.js';
import { favTile } from './favtile.js';

const app = document.getElementById('app');
const tabId = Number(params().get('tab'));
let remember = false, chosen = false;

async function main() {
  await applyTheme();
  const p = await api('picker', { tabId });
  if (!p) { app.replaceChildren(h('div', { class: 'banner warn' }, icon('info'), 'Nothing to choose here. This tab no longer has a pending navigation.')); return; }
  let host = ''; try { host = new URL(p.url).host; } catch { /* ignore */ }
  document.title = `Open ${p.service.name} in… · BoxBox`;
  const opts = [{ id: null, acc: null }, ...p.accounts.map((a) => ({ id: a.id, acc: a }))];
  const icons = await api('icons').catch(() => ({}));
  const logo = h('div', { class: 'logo', id: 'logo', 'data-letter': p.service.name.charAt(0).toUpperCase() }, favTile(p.service, icons[p.service.id]));
  const tiles = h('div', { class: 'tiles', role: 'radiogroup', 'aria-label': 'Box' },
    opts.map((o, i) => {
      const b = o.acc ? box({ color: o.acc.color, icon: o.acc.icon, label: o.acc.name, size: 100, lid: true }) : box({ kraft: true, icon: 'home', label: 'default', size: 100, lid: true });
      const t = h('button', { class: 'card tile', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-account': o.id || 'default', 'data-tilt': 3, style: { '--c': o.acc ? o.acc.color : KRAFT, '--rc': o.acc ? o.acc.color : KRAFT }, onclick: () => pick(o.id) },
        h('span', { class: 'key' }, i < 9 ? String(i + 1) : ''), b,
        h('div', { class: 'title' }, o.acc ? o.acc.name : 'No box'), h('div', { class: 'sub' }, o.acc ? (o.acc.proxy ? `via ${proxyLabel(o.acc.proxy)}` : 'An isolated box') : 'Your normal browser session'),
        h('span', { class: 'tick' }, icon('check')));
      MO.dropIn(b, 80 + i * 70);
      return t;
    }));
  const rem = h('input', { type: 'checkbox', id: 'remember', onchange: (e) => { remember = e.target.checked; } });
  app.replaceChildren(logo, h('h1', {}, `Open ${p.service.name} in…`), h('div', { class: 'url', id: 'target-url' }, p.url), tiles,
    h('label', { class: 'remember' }, rem, h('i', {}, icon('check')), `Remember my choice for ${p.service.name}`),
    h('div', { class: 'hint' }, 'Press 1–9 to choose quickly'));
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const n = Number(e.key);
    if (n >= 1 && n <= opts.length) pick(opts[n - 1].id);
    const btns = [...tiles.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  });
  tiles.querySelector('button')?.focus();

  async function pick(id) {
    if (chosen) return; chosen = true;
    const t = tiles.querySelector(`[data-account="${id || 'default'}"]`);
    tiles.querySelectorAll('button').forEach((b) => { const on = b === t; b.setAttribute('aria-checked', String(on)); b.classList.toggle('selected', on); });
    try {
      await Promise.race([tabInto(t.querySelector('.bx'), logo), new Promise((r) => setTimeout(r, 1400))]);   // the site's tile hops into the box…
      await api('pickerChoice', { tabId, accountId: id, remember });                                          // …then the page opens in it
    } catch (e) { chosen = false; toast(e.message); }
  }
}
main().catch((e) => app.replaceChildren(h('div', { class: 'banner fail' }, e.message)));
