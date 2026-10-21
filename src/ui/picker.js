import { h, icon, avatar, api, toast, applyTheme, params, proxyLabel } from './lib.js';

const app = document.getElementById('app');
const tabId = Number(params().get('tab'));
let remember = false, chosen = false;

async function main() {
  await applyTheme();
  const p = await api('picker', { tabId });
  if (!p) { app.replaceChildren(h('div', { class: 'banner warn' }, icon('info'), 'Nothing to choose here. This tab no longer has a pending navigation.')); return; }
  let host = ''; try { host = new URL(p.url).host; } catch { /* ignore */ }
  document.title = `Open ${p.service.name} as… · Box`;
  const opts = [{ id: null, acc: null }, ...p.accounts.map((a) => ({ id: a.id, acc: a }))];
  const tiles = h('div', { class: 'tiles', role: 'radiogroup', 'aria-label': 'Account' },
    opts.map((o, i) => h('button', { class: 'card tile enter', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-account': o.id || 'default', style: { '--c': o.acc ? o.acc.color : '#7b8499', '--i': i + 1 }, onclick: () => pick(o.id) },
      h('span', { class: 'key' }, i < 9 ? String(i + 1) : ''),
      avatar(o.acc),
      h('div', {}, h('div', { class: 'title' }, o.acc ? o.acc.name : 'Default session'), h('div', { class: 'sub' }, o.acc ? (o.acc.proxy ? `via ${proxyLabel(o.acc.proxy)}` : 'Isolated account') : 'Your normal session')))));
  const rem = h('input', { type: 'checkbox', id: 'remember', onchange: (e) => { remember = e.target.checked; } });
  app.replaceChildren(
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, p.service.name.charAt(0).toUpperCase()), h('div', { class: 'grow' }, h('h1', {}, `Open ${p.service.name} as…`), h('div', { class: 'url', id: 'target-url' }, p.url))),
    tiles,
    h('label', { class: 'opts checkbox' }, rem, h('span', {}, 'Always open this service in the account I used last'), h('span', { class: 'grow' }), h('span', { class: 'chip' }, host)),
  );
  document.addEventListener('keydown', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= opts.length) pick(opts[n - 1].id);
    const btns = [...tiles.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  });
  tiles.querySelector('button')?.focus();

  async function pick(id) {
    if (chosen) return; chosen = true;
    tiles.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.account) === (id || 'default'))));
    try { await api('pickerChoice', { tabId, accountId: id, remember }); } catch (e) { chosen = false; toast(e.message); }
  }
}
main().catch((e) => app.replaceChildren(h('div', { class: 'banner fail' }, e.message)));
