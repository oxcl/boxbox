import { h, icon, api, toast, applyTheme, params, modeLabel, proxyLabel } from './lib.js';
import { openAccountEditor } from './account-editor.js';
import { ext } from '../core/ext.js';
import * as MO from './motion.js';
import { box, mini, swapTab, slideSeg, KRAFT } from './box.js';
import { favTile } from './favtile.js';

const app = document.getElementById('app');
let info = null, tabId = null, busy = false, learned = null;

async function currentTabId() {
  const p = params().get('tab');
  if (p) return Number(p);
  const [t] = await ext.tabs.query({ active: true, currentWindow: true });
  return t && t.id;
}

async function load(animate = false) {
  tabId = tabId ?? await currentTabId();
  info = await api('tabInfo', { tabId });
  if (!learned) learned = await api('icons').catch(() => ({}));
  render(animate);
}

function statusBanner() {
  const s = info.status;
  if (!s || !s.messages || !s.messages.length || s.level === 'ok') return null;
  return h('div', { class: 'banner ' + (s.level === 'fail' ? 'fail' : 'warn'), style: { marginTop: '10px' }, role: 'alert' }, icon('warn'),
    h('div', { class: 'grow' }, s.messages.map((m) => h('div', { style: { marginBottom: '4px' } }, m)),
      s.action === 'restoreIsolation' ? h('button', { class: 'btn sm primary', id: 'restore-isolation', style: { marginTop: '6px' }, onclick: async () => { try { await api('restoreIsolation', { tabId }); toast('Isolation restored'); await load(); } catch (e) { toast(e.message); } } }, 'Restore isolation') : null));
}

const head = () => h('div', { class: 'head' }, h('div', { class: 'logo' }, mini(KRAFT, 28), 'BoxBox'),
  h('button', { class: 'iconbtn cog', id: 'open-settings', 'aria-label': 'Settings', title: 'Settings', onclick: openSettings }, icon('gear')));

function fillStatus(el) {
  const acc = info.accounts.find((a) => a.id === info.accountId);
  el.style.setProperty('--c', acc ? acc.color : '#9a8a78');
  el.replaceChildren(mini(acc ? acc.color : KRAFT, 24), h('span', {}, acc ? ['This tab is in ', h('b', {}, acc.name)] : ['This tab is in ', h('b', { style: { color: 'var(--accent2)' } }, 'no box')]));
}

function render(animate) {
  app.replaceChildren();
  if (!info || !info.service) {
    const b = box({ kraft: true, icon: 'home', size: 84, lid: true, float: true, check: false });
    app.append(head(), h('div', { class: 'empty' }, b, h('div', { style: { fontWeight: 800, fontSize: '17px' } }, 'No site here'), h('div', { class: 'muted' }, 'Open a website, then pick or create a box for the tab.')));
    return;
  }
  const svc = info.service, hostName = info.host || '';
  const logo = favTile(svc, learned && learned[svc.id]);
  const tile = h('div', { class: 'tile', 'data-letter': svc.name.charAt(0).toUpperCase() }, (logo.classList.contains('logo') || logo.style.background) ? logo
    : info.favIconUrl && !/^data:/.test(info.favIconUrl) ? h('img', { src: info.favIconUrl, alt: '', onerror: (e) => { e.target.replaceWith(logo); } }) : logo);
  const others = svc.domains.filter((d) => hostName !== d && !hostName.endsWith('.' + d));
  const header = h('div', { class: 'site' }, tile, h('div', { class: 'grow' }, h('h1', { id: 'svc-name' }, svc.name), h('span', { class: 'host' }, hostName + (others.length ? `  ·  +${others.length} more` : ''))));
  const status = h('div', { class: 'status', id: 'status' }); fillStatus(status);

  const cur = info.accountId || null;
  const grid = h('div', { class: 'grid', role: 'radiogroup', 'aria-label': 'Box for this tab' });
  const cells = [null, ...info.accounts];
  cells.forEach((acc, i) => {
    const sel = (acc ? acc.id : null) === cur;
    const warn = acc && acc.proxy && info.status && info.status.level !== 'ok' && sel ? info.status.level : null;
    const b = acc ? box({ color: acc.color, icon: acc.icon, label: acc.name, size: 54, lid: true }) : box({ kraft: true, icon: 'home', label: 'default', size: 54, lid: true });
    const el = h('div', { class: 'card cell' + (sel ? ' selected' : ''), role: 'radio', 'aria-checked': String(sel), tabindex: 0, 'data-account': acc ? acc.id : 'default', 'data-tilt': 3, style: { '--c': acc ? acc.color : KRAFT, '--rc': acc ? acc.color : KRAFT },
      onclick: () => choose(acc ? acc.id : null), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(acc ? acc.id : null); } } },
      b, h('span', { class: 'title name', title: acc ? (acc.proxy ? `via ${proxyLabel(acc.proxy)}` : acc.name) : 'Your normal browser session' }, acc ? acc.name : 'No box'),
      h('span', { class: 'tick' }, icon('check')),
      warn ? h('span', { class: 'warnpip' + (warn === 'fail' ? ' fail' : ''), title: info.status.messages.join(' ') }, '!') : null,
      acc ? h('button', { class: 'iconbtn menu', 'aria-label': `Edit ${acc.name}`, 'data-edit': acc.id, onclick: (e) => { e.stopPropagation(); edit(acc); } }, icon('edit')) : null);
    if (sel) el.classList.add('selected');
    grid.append(el);
    if (animate) MO.dropIn(b, 40 + i * 55);
  });
  grid.append(h('button', { class: 'card add cell newcell', id: 'new-account', onclick: () => edit(null) }, icon('plus'), `New box`));

  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Entry mode for this service' },
    [['inherit', 'Global'], ['default', 'Default'], ['remember', 'Last used'], ['ask', 'Ask']].map(([m, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String((info.modeOverride || 'inherit') === m), 'data-mode': m,
      onclick: async () => { await api('setServiceMode', { serviceId: svc.id, mode: m }); await load(); toast(m === 'inherit' ? `Using the global mode (${modeLabel[info.defaultMode]})` : `${svc.name}: ${modeLabel[m]}`); } }, label)));
  const foot = h('div', { class: 'foot' }, h('p', {}, `When I open ${svc.name}:`), seg);
  app.append(head(), header, status, ...[statusBanner()].filter(Boolean), grid, foot);
  slideSeg(seg);
  if (animate) MO.popIn(app, { duration: 420 });
}

async function choose(accountId) {
  if (busy || (accountId || null) === (info.accountId || null)) return;
  busy = true;
  try {
    const grid = app.querySelector('.grid'), cellOf = (id) => grid.querySelector(`.cell[data-account="${id || 'default'}"]`);
    const prev = cellOf(info.accountId), next = cellOf(accountId), header = app.querySelector('.site'), acc = info.accounts.find((a) => a.id === accountId);
    let call = null;
    const apply = () => {   // the hand-over moment: selection, banner and the real switch all happen inside the motion
      info.accountId = accountId;
      grid.querySelectorAll('.cell').forEach((c) => { const on = c === next; c.classList.toggle('selected', on); c.setAttribute('aria-checked', String(on)); });
      fillStatus(app.querySelector('#status'));
      call = api('setTabAccount', { tabId, accountId, root: true });
    };
    await Promise.race([swapTab(prev && prev.querySelector('.bx'), next.querySelector('.bx'), header, { col: acc ? acc.color : KRAFT, onSwitch: apply }), new Promise((r) => setTimeout(r, 3200))]);
    if (!call) apply();
    const r = await call;
    // In Firefox the tab is re-created and this popup closes with the old tab. In Chrome the same tab continues.
    tabId = r.tabId ?? tabId;
    await load();
  } catch (e) { toast(e.message); await load().catch(() => {}); } finally { busy = false; }
}

function edit(acc) {
  openAccountEditor({
    account: acc, existing: info.accounts.length, serviceId: info.serviceId, serviceName: info.service.name, target: info.target,
    onDone: async (kind, res) => {
      await load();
      if (kind === 'created' && res) { await choose(res.id); toast(`Created “${res.name}”`); } else if (kind === 'deleted') toast('Box deleted and its data erased');
    },
  });
}

function openSettings() { ext.runtime.openOptionsPage(); window.close?.(); }

applyTheme();
load(true).catch((e) => { app.replaceChildren(h('div', { class: 'banner fail' }, e.message)); });
ext.tabs.onUpdated?.addListener?.((id, ch) => { if (id === tabId && !busy && (ch.status === 'complete' || ch.url)) load().catch(() => {}); });
