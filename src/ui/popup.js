import { h, icon, avatar, api, toast, applyTheme, params, modeLabel, proxyLabel } from './lib.js';
import { openAccountEditor } from './account-editor.js';
import { ext } from '../core/ext.js';

const app = document.getElementById('app');
let info = null, tabId = null, busy = false;

async function currentTabId() {
  const p = params().get('tab');
  if (p) return Number(p);
  const [t] = await ext.tabs.query({ active: true, currentWindow: true });
  return t && t.id;
}

async function load() {
  tabId = tabId ?? await currentTabId();
  info = await api('tabInfo', { tabId });
  render();
}

function statusBanner() {
  const s = info.status;
  if (!s || !s.messages || !s.messages.length) return null;
  if (s.level === 'ok') return null;
  return h('div', { class: 'banner ' + (s.level === 'fail' ? 'fail' : 'warn'), style: { margin: '0 14px 6px' }, role: 'alert' }, icon('warn'),
    h('div', { class: 'grow' }, s.messages.map((m) => h('div', { style: { marginBottom: '4px' } }, m)),
      s.action === 'restoreIsolation' ? h('button', { class: 'btn sm primary', id: 'restore-isolation', style: { marginTop: '6px' }, onclick: async () => { try { await api('restoreIsolation', { tabId }); toast('Isolation restored'); await load(); } catch (e) { toast(e.message); } } }, 'Restore isolation') : null));
}

function render() {
  const first = !app.firstChild;
  app.replaceChildren();
  if (!info || !info.service) {
    app.append(
      h('header', {}, h('div', { class: 'site' }, icon('layers')), h('div', { class: 'grow' }, h('h1', {}, 'Box'), h('div', { class: 'muted' }, 'Isolated accounts per tab')),
        h('button', { class: 'iconbtn', id: 'open-settings', 'aria-label': 'Settings', onclick: openSettings }, icon('gear'))),
      h('div', { class: 'empty enter' }, h('div', { class: 'avatar globe' }, icon('globe')), h('div', { style: { fontWeight: 700 } }, 'Open a website to use accounts'), h('div', { class: 'muted' }, 'Box works on web pages. Navigate to a site, then pick or create an account for this tab.')));
    return;
  }
  const svc = info.service;
  const hostName = info.host || '';
  const site = h('div', { class: 'site' }, info.favIconUrl && !/^data:/.test(info.favIconUrl) ? h('img', { src: info.favIconUrl, alt: '', onerror: (e) => { e.target.replaceWith(document.createTextNode(svc.name.charAt(0).toUpperCase())); } }) : svc.name.charAt(0).toUpperCase());
  const others = svc.domains.filter((d) => hostName !== d && !hostName.endsWith('.' + d));
  const doms = h('div', { class: 'domains' }, h('span', { class: 'chip' }, hostName), others.length ? h('span', { class: 'chip' }, `+${others.length} more`) : null);
  const header = h('header', {},
    site,
    h('div', { class: 'grow' }, h('h1', { id: 'svc-name' }, svc.name), doms),
    h('button', { class: 'iconbtn', id: 'open-settings', 'aria-label': 'Settings', title: 'Settings', onclick: openSettings }, icon('gear')));

  const cur = info.accountId;
  const list = h('div', { class: 'list', role: 'radiogroup', 'aria-label': 'Account for this tab' });
  let i = 0;
  const row = (acc) => {
    const sel = (acc ? acc.id : null) === (cur || null);
    const warn = acc && acc.proxy && info.status && info.status.level !== 'ok' && sel ? info.status.level : null;
    const el = h('div', { class: 'card enter' + (sel ? ' selected' : ''), role: 'radio', 'aria-checked': String(sel), tabindex: 0, 'data-account': acc ? acc.id : 'default', style: { '--c': acc ? acc.color : '#7b8499', '--i': i++ },
      onclick: () => choose(acc ? acc.id : null), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(acc ? acc.id : null); } } },
      avatar(acc, { warn }),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, acc ? acc.name : 'Default session'),
        h('div', { class: 'sub' }, acc ? (acc.proxy ? `via ${proxyLabel(acc.proxy)}` : 'Isolated account') : 'Your normal browser session')),
      acc ? h('button', { class: 'iconbtn more', 'aria-label': `Edit ${acc.name}`, 'data-edit': acc.id, onclick: (e) => { e.stopPropagation(); edit(acc); } }, icon('edit')) : null,
      h('span', { class: 'radio' }, h('svg', { viewBox: '0 0 24 24', __svg: true, html: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' })));
    return el;
  };
  list.append(row(null), ...info.accounts.map(row),
    h('button', { class: 'card add enter', id: 'new-account', style: { '--i': i++ }, onclick: () => edit(null) }, icon('plus'), `New ${svc.name} account`));

  const modeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Entry mode for this service' },
    [['inherit', 'Global'], ['default', 'Default'], ['remember', 'Remember'], ['ask', 'Ask']].map(([m, label]) => {
      const active = (info.modeOverride || 'inherit') === m;
      return h('button', { type: 'button', role: 'radio', 'aria-checked': String(active), 'data-mode': m, onclick: async () => { await api('setServiceMode', { serviceId: svc.id, mode: m }); await load(); toast(m === 'inherit' ? `Using the global mode (${modeLabel[info.defaultMode]})` : `${svc.name}: ${modeLabel[m]}`); } }, label);
    }));
  const footer = h('footer', {},
    h('div', { class: 'row' }, icon('sliders'), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700, fontSize: '12.5px' } }, 'When opening ' + svc.name), h('div', { class: 'muted', style: { fontSize: '12px' } }, info.modeOverride ? modeLabel[info.mode] : `Global: ${modeLabel[info.defaultMode]}`))),
    modeSeg);
  app.append(header, ...[statusBanner()].filter(Boolean), list, footer);
}

async function choose(accountId) {
  if (busy || (accountId || null) === (info.accountId || null)) return;
  busy = true;
  try {
    const r = await api('setTabAccount', { tabId, accountId, root: true });
    // In Firefox the tab is re-created; this popup closes with the old tab. In Chrome the same tab continues.
    tabId = r.tabId ?? tabId;
    await load();
  } catch (e) { toast(e.message); } finally { busy = false; }
}

function edit(acc) {
  openAccountEditor({
    account: acc, existing: info.accounts.length, serviceId: info.serviceId, serviceName: info.service.name, target: info.target,
    onDone: async (kind, res) => {
      await load();
      if (kind === 'created' && res) { await choose(res.id); toast(`Created “${res.name}”`); } else if (kind === 'deleted') toast('Account deleted and its data erased');
    },
  });
}

function openSettings() { ext.runtime.openOptionsPage(); window.close?.(); }

applyTheme();
load().catch((e) => { app.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'banner fail' }, e.message))); });
ext.tabs.onUpdated?.addListener?.((id, ch) => { if (id === tabId && (ch.status === 'complete' || ch.url)) load().catch(() => {}); });
