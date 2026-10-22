import { h, icon, avatar, api, toast, applyTheme, sheet, modeLabel, modeHelp, proxyLabel } from './lib.js';
import { openAccountEditor } from './account-editor.js';
import { ext } from '../core/ext.js';

const SECTIONS = [['general', 'General', 'sliders'], ['services', 'Services', 'layers'], ['accounts', 'Accounts', 'user'], ['proxy', 'Proxy', 'network'], ['about', 'About', 'info']];
let st = null, section = (location.hash || '#general').slice(1), selectedService = null, query = '';
const main = document.getElementById('main'), nav = document.getElementById('nav');

async function refresh(keep = true) {
  st = await api('state');
  if (st.settings.theme === 'light' || st.settings.theme === 'dark') document.documentElement.setAttribute('data-theme', st.settings.theme); else document.documentElement.removeAttribute('data-theme');
  render();
}

function render() {
  nav.replaceChildren(
    h('div', { class: 'brand' }, h('span', { class: 'mark' }, icon('layers')), 'Box'),
    ...SECTIONS.map(([id, label, ic]) => h('button', { class: 'navbtn', 'data-section': id, 'aria-current': section === id ? 'page' : null, onclick: () => { section = id; location.hash = id; render(); } }, icon(ic), label)));
  main.replaceChildren(({ general, services, accounts, proxy, about }[section] || general)());
}

const serviceName = (id) => st.services.find((s) => s.id === id)?.name || id;

// ------------------------------------------------------------------ General
function general() {
  const s = st.settings;
  const modeCard = (m, ic) => h('button', { class: 'card mode' + (s.defaultMode === m ? ' selected' : ''), type: 'button', role: 'radio', 'aria-checked': String(s.defaultMode === m), 'data-mode': m,
    onclick: async () => { await api('setSettings', { patch: { defaultMode: m } }); await refresh(); } },
    h('div', { class: 'title' }, icon(ic), modeLabel[m]), h('div', { class: 'sub' }, modeHelp[m]));
  const toggle = (key, label, desc) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, label), h('div', { class: 'muted' }, desc)),
    h('button', { class: 'switch', type: 'button', role: 'switch', 'data-setting': key, 'aria-checked': String(!!s[key]), 'aria-label': label, onclick: async () => { await api('setSettings', { patch: { [key]: !s[key] } }); await refresh(); } }));
  const overrides = Object.entries(s.modes);
  const addSel = h('select', { class: 'input', id: 'override-service', style: { maxWidth: '260px' } }, h('option', { value: '' }, 'Add a service override…'),
    st.services.filter((x) => !s.modes[x.id]).map((x) => h('option', { value: x.id }, x.name)));
  addSel.onchange = async () => { if (addSel.value) { await api('setServiceMode', { serviceId: addSel.value, mode: s.defaultMode === 'default' ? 'ask' : 'default' }); await refresh(); } };
  return h('section', {},
    h('div', {}, h('h1', {}, 'General'), h('p', { class: 'lead' }, 'How Box behaves when you open a service from outside an account.')),
    h('div', { class: 'panel' }, h('h2', {}, 'When entering a service'), h('div', { class: 'cards3', role: 'radiogroup', 'aria-label': 'Default entry mode' }, modeCard('default', 'globe'), modeCard('remember', 'pin'), modeCard('ask', 'ask'))),
    h('div', { class: 'panel' }, h('h2', {}, 'Per-service overrides'),
      overrides.length ? h('table', {}, overrides.map(([id, m]) => h('tr', { 'data-override': id }, h('td', {}, h('b', {}, serviceName(id))),
        h('td', {}, h('div', { class: 'seg', role: 'radiogroup' }, ['default', 'remember', 'ask'].map((mm) => h('button', { type: 'button', role: 'radio', 'data-mode': mm, 'aria-checked': String(m === mm), onclick: async () => { await api('setServiceMode', { serviceId: id, mode: mm }); await refresh(); } }, modeLabel[mm].split(' ')[0])))),
        h('td', { style: { textAlign: 'right' } }, h('button', { class: 'iconbtn', 'aria-label': 'Remove override', onclick: async () => { await api('setServiceMode', { serviceId: id, mode: 'inherit' }); await refresh(); } }, icon('x')))))) : h('p', { class: 'muted', style: { margin: 0 } }, 'No overrides. Every service follows the global mode.'),
      addSel),
    h('div', { class: 'panel' }, h('h2', {}, 'Appearance & identity'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, 'Theme')),
        h('div', { class: 'seg', role: 'radiogroup' }, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('button', { type: 'button', role: 'radio', 'data-theme-opt': v, 'aria-checked': String(s.theme === v), onclick: async () => { await api('setSettings', { patch: { theme: v } }); await refresh(); } }, l)))),
      toggle('border', 'Page border', 'Draw a colored frame with the account name around pages in an account.'),
      toggle('badge', 'Favicon badge', 'Add a small dot in the account color to the site’s icon.'),
      toggle('tabGroups', 'Tab groups', 'Group tabs of the same account and color the group.')));
}

// ------------------------------------------------------------------ Services
function services() {
  const list = st.services.filter((s) => !query || (s.name + ' ' + s.domains.join(' ')).toLowerCase().includes(query.toLowerCase()));
  const sel = st.services.find((s) => s.id === selectedService) || list[0];
  if (sel) selectedService = sel.id;
  const search = h('input', { class: 'input', id: 'svc-search', placeholder: 'Search services or domains', value: query, oninput: (e) => { query = e.target.value; const pos = e.target.selectionStart; render(); const i = document.getElementById('svc-search'); i.focus(); i.setSelectionRange(pos, pos); } });
  return h('section', {},
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h1', {}, 'Services'), h('p', { class: 'lead' }, 'A service is a group of domains that share one login. Accounts and switching work per service.')),
      h('button', { class: 'btn primary', id: 'new-service', onclick: newService }, icon('plus'), 'New service')),
    h('div', { class: 'svcgrid' },
      h('div', { class: 'panel', style: { padding: '12px' } }, search, h('div', { class: 'svclist', id: 'svclist' }, list.map((s) => h('button', { class: 'svc', 'data-service': s.id, 'aria-current': String(s.id === selectedService), onclick: () => { selectedService = s.id; render(); } },
        h('span', { class: 'ico' }, s.name.charAt(0).toUpperCase()), h('span', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, s.name), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${s.domains.length} domain${s.domains.length === 1 ? '' : 's'}${s.accounts ? ` · ${s.accounts} account${s.accounts === 1 ? '' : 's'}` : ''}`)), s.kind === 'user' ? h('span', { class: 'chip' }, 'yours') : null)))),
      sel ? serviceDetail(sel) : h('div', { class: 'panel muted' }, 'No service selected.')));
}

function serviceDetail(s) {
  const others = st.services.filter((x) => x.id !== s.id);
  const nameIn = h('input', { class: 'input', id: 'svc-name', value: s.name, onchange: async (e) => { await api('serviceEdit', { op: 'rename', args: { id: s.id, name: e.target.value.trim() || s.name } }); await refresh(); toast('Renamed'); } });
  const addIn = h('input', { class: 'input', id: 'svc-add-domain', placeholder: 'Add a domain, e.g. example.org' });
  const add = async () => { const v = addIn.value.trim(); if (!v) return; await api('serviceEdit', { op: 'assign', args: { id: s.id, domains: [v] } }); await refresh(); toast(`${v} now belongs to ${s.name}`); };
  addIn.onkeydown = (e) => { if (e.key === 'Enter') add(); };
  return h('div', { class: 'panel', id: 'svc-detail', 'data-service': s.id },
    h('div', { class: 'row' }, h('div', { class: 'grow field' }, h('label', { for: 'svc-name' }, 'Name'), nameIn), h('span', { class: 'chip' }, s.kind === 'catalog' ? 'built-in' : s.kind === 'user' ? 'custom' : 'automatic')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Domains (sub-domains are included)'),
      s.domains.length ? s.domains.map((d) => h('div', { class: 'domain', 'data-domain': d }, icon('link'), h('span', { class: 'd' }, d),
        h('button', { class: 'btn sm', type: 'button', 'data-split': d, title: 'Move this domain to its own service', onclick: () => splitDomain(s, d) }, icon('split'), 'Split off'),
        others.length ? h('button', { class: 'btn sm', type: 'button', 'data-move': d, title: 'Move this domain into another service', onclick: () => moveDomain(s, d) }, icon('merge'), 'Move…') : null)) : h('div', { class: 'muted' }, 'No domains.')),
    h('div', { class: 'row' }, addIn, h('button', { class: 'btn', id: 'svc-add', onclick: add }, icon('plus'), 'Add')),
    h('div', { class: 'row wrap', style: { justifyContent: 'space-between' } },
      h('button', { class: 'btn', id: 'svc-merge', onclick: () => mergeInto(s) }, icon('merge'), 'Merge into another service…'),
      s.kind === 'user' ? h('button', { class: 'btn danger', id: 'svc-delete', onclick: async () => { await api('serviceEdit', { op: 'delete', args: { id: s.id } }); selectedService = null; await refresh(); toast('Service deleted'); } }, icon('trash'), 'Delete service') : null));
}

function serviceSelect(id, services) {
  return h('select', { class: 'input', id }, services.map((x) => h('option', { value: x.id }, `${x.name} — ${x.domains.slice(0, 2).join(', ')}`)));
}
function newService() {
  sheet((close) => {
    const name = h('input', { class: 'input', id: 'ns-name', placeholder: 'e.g. Work apps' });
    const doms = h('input', { class: 'input', id: 'ns-domains', placeholder: 'domains, separated by commas' });
    return [h('h3', {}, 'New service'), h('div', { class: 'field' }, h('label', {}, 'Name'), name), h('div', { class: 'field' }, h('label', {}, 'Domains'), doms),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', id: 'ns-save', onclick: async () => {
        const r = await api('serviceEdit', { op: 'create', args: { name: name.value.trim() || 'New service', domains: doms.value.split(/[,\s]+/).filter(Boolean) } });
        selectedService = r.id; close(); await refresh(); } }, 'Create'))];
  }, { center: true });
}
function splitDomain(s, d) {
  sheet((close) => {
    const name = h('input', { class: 'input', id: 'split-name', value: d.split('.')[0].replace(/^\w/, (c) => c.toUpperCase()) });
    return [h('h3', {}, `Split ${d} off`), h('p', { class: 'muted', style: { margin: 0 } }, `${d} (and its sub-domains) will become a separate service with its own accounts, no longer part of ${s.name}.`),
      h('div', { class: 'field' }, h('label', {}, 'New service name'), name),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', id: 'split-save', onclick: async () => {
        const r = await api('serviceEdit', { op: 'split', args: { name: name.value.trim() || d, domains: [d] } }); selectedService = r.id; close(); await refresh(); toast(`${d} is now its own service`); } }, 'Split'))];
  }, { center: true });
}
function moveDomain(s, d) {
  sheet((close) => {
    const sel = serviceSelect('move-target', st.services.filter((x) => x.id !== s.id));
    return [h('h3', {}, `Move ${d}`), h('div', { class: 'field' }, h('label', {}, 'Into service'), sel),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', id: 'move-save', onclick: async () => {
        await api('serviceEdit', { op: 'assign', args: { id: sel.value, domains: [d] } }); selectedService = sel.value; close(); await refresh(); toast('Moved'); } }, 'Move'))];
  }, { center: true });
}
function mergeInto(s) {
  sheet((close) => {
    const sel = serviceSelect('merge-target', st.services.filter((x) => x.id !== s.id));
    return [h('h3', {}, `Merge ${s.name}`), h('p', { class: 'muted', style: { margin: 0 } }, `All of ${s.name}’s domains and accounts move into the service you choose. Logins are kept per account.`),
      h('div', { class: 'field' }, h('label', {}, 'Merge into'), sel),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', id: 'merge-save', onclick: async () => {
        await api('serviceEdit', { op: 'merge', args: { from: s.id, to: sel.value } }); selectedService = sel.value; close(); await refresh(); toast('Merged'); } }, 'Merge'))];
  }, { center: true });
}

// ------------------------------------------------------------------ Accounts
function accounts() {
  const byService = new Map();
  for (const a of st.accounts) { if (!byService.has(a.serviceId)) byService.set(a.serviceId, []); byService.get(a.serviceId).push(a); }
  const addSel = h('select', { class: 'input', id: 'add-account-service', style: { maxWidth: '280px' } }, h('option', { value: '' }, 'Create an account for…'), st.services.map((s) => h('option', { value: s.id }, s.name)));
  addSel.onchange = () => { if (addSel.value) { const s = st.services.find((x) => x.id === addSel.value); addSel.value = ''; edit(null, s.id); } };
  return h('section', {},
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h1', {}, 'Accounts'), h('p', { class: 'lead' }, 'Every account is an isolated identity for one service. Deleting one erases all of its data.')), addSel),
    byService.size ? [...byService.entries()].map(([sid, list]) => h('div', { class: 'panel', 'data-service-group': sid },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, serviceName(sid)), h('button', { class: 'btn sm', onclick: () => edit(null, sid) }, icon('plus'), 'Add')),
      list.map((a) => h('div', { class: 'card', style: { '--c': a.color, cursor: 'default' }, 'data-account': a.id },
        avatar(a), h('div', { class: 'grow' }, h('div', { class: 'title' }, a.name), h('div', { class: 'sub' }, a.proxy ? `via ${proxyLabel(a.proxy)}` : 'No proxy')),
        h('button', { class: 'btn sm', 'data-edit': a.id, onclick: () => edit(a, sid) }, icon('edit'), 'Edit'))))) :
      h('div', { class: 'panel', style: { textAlign: 'center', padding: '40px' } }, h('div', { class: 'muted' }, 'No accounts yet. Open a website and create one from the Box popup, or use the menu above.')));
}
function edit(acc, sid, withProxy = false) {
  openAccountEditor({ withProxy, existing: (st.accounts || []).filter((a) => a.serviceId === sid).length, account: acc, serviceId: sid, serviceName: serviceName(sid), target: st.target, onDone: async () => { await refresh(); } });
}

// ------------------------------------------------------------------ Proxy
function proxy() {
  const ff = st.target === 'firefox';
  const withProxy = st.accounts.filter((a) => a.proxy);
  return h('section', {},
    h('div', {}, h('h1', {}, 'Proxy'), h('p', { class: 'lead' }, 'Each account can use its own HTTP, HTTPS or SOCKS5 proxy (with authentication).')),
    h('div', { class: 'panel' }, h('h2', {}, ff ? 'Exact per-account routing (Firefox)' : 'Best effort (Chrome)'),
      ff ? h('p', { class: 'muted', style: { margin: 0 } }, 'Firefox decides the proxy per request from the container of the requesting tab, so a proxy applies exactly and only to that account’s tabs. DNS is resolved by the proxy, WebRTC is forced through relays, and a failing proxy blocks the request instead of falling back to your own IP.')
        : h('div', { class: 'banner warn' }, icon('warn'), h('div', {}, 'Chrome has a single, browser-wide proxy setting. Box generates a proxy auto-config script that sends the hosts used by proxied accounts through their proxy. This is shared with any other tab (including your default session) that visits those hosts, and a host first contacted before Box learns it may connect directly. Whenever that can happen the popup, the page label and the extension badge show a warning — Box never fails silently.'))),
    h('div', { class: 'panel' }, h('h2', {}, 'Accounts with a proxy'),
      h('select', { class: 'input', id: 'proxy-add-account', style: { maxWidth: '340px' }, onchange: (e) => { const a = st.accounts.find((x) => x.id === e.target.value); e.target.value = ''; if (a) edit(a, a.serviceId, true); } },
        h('option', { value: '' }, 'Configure a proxy for…'), st.accounts.filter((a) => !a.proxy).map((a) => h('option', { value: a.id }, `${a.name} — ${serviceName(a.serviceId)}`))),
      withProxy.length ? withProxy.map((a) => h('div', { class: 'card', style: { '--c': a.color, cursor: 'default' } }, avatar(a), h('div', { class: 'grow' }, h('div', { class: 'title' }, a.name), h('div', { class: 'sub' }, `${serviceName(a.serviceId)} · ${proxyLabel(a.proxy)}`)), h('button', { class: 'btn sm', onclick: () => edit(a, a.serviceId) }, icon('edit'), 'Edit'))) : h('p', { class: 'muted', style: { margin: 0 } }, 'None yet. Open an account’s settings and switch on “Proxy”.')));
}

// ------------------------------------------------------------------ About
function about() {
  const mf = ext.runtime.getManifest();
  return h('section', {},
    h('div', {}, h('h1', {}, 'About Box'), h('p', { class: 'lead' }, `Version ${mf.version} · ${({ firefox: 'Firefox', 'chrome-mv3': 'Chrome (Manifest V3)', 'chrome-mv2': 'Chrome (Manifest V2)' })[st.target]}`)),
    h('div', { class: 'panel' }, h('h2', {}, 'Privacy'), h('p', { class: 'muted', style: { margin: 0 } }, 'Box makes no network requests of its own and has no telemetry. The built-in service catalog ships with the extension and changes only with extension updates. Everything — accounts, proxies, your edits — stays in this browser.')),
    h('div', { class: 'panel' }, h('h2', {}, 'How isolation works here'), h('p', { class: 'muted', style: { margin: 0 } }, st.target === 'firefox' ? 'Each account is a Firefox container: cookies, storage, service workers and cache are separated by the browser itself.' : 'Chrome has no per-tab sessions, so Box keeps each account’s cookies in its own jar and namespaces web storage per account inside every page. See the README for what is and is not covered.')));
}

applyTheme();
refresh().catch((e) => main.replaceChildren(h('div', { class: 'banner fail' }, e.message)));
