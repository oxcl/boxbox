import { h, icon, api, toast, applyTheme, sheet, modeLabel, modeHelp, proxyLabel } from './lib.js';
import { openAccountEditor } from './account-editor.js';
import { ext } from '../core/ext.js';
import * as MO from './motion.js';
import { box, mini, slideSeg, KRAFT } from './box.js';
import { favTile } from './favtile.js';

const SECTIONS = [['services', 'Services', 'layers'], ['general', 'Entry modes', 'sliders'], ['proxy', 'Proxies', 'network'], ['appearance', 'Appearance & privacy', 'shield'], ['about', 'About', 'info']];
let st = null, section = (location.hash || '#services').slice(1), selectedService = null, query = '', openedFresh = null;
const main = document.getElementById('main'), nav = document.getElementById('nav');
if (!SECTIONS.some(([id]) => id === section)) section = 'services';

async function refresh() {
  st = await api('state');
  st.icons = await api('icons').catch(() => ({}));
  if (st.settings.theme === 'light' || st.settings.theme === 'dark') document.documentElement.setAttribute('data-theme', st.settings.theme); else document.documentElement.removeAttribute('data-theme');
  render();
}

function render() {
  const first = !nav.firstChild;
  if (first) {
    const hl = h('div', { class: 'hl' });
    nav.replaceChildren(h('div', { class: 'brand' }, box({ kraft: true, icon: '', size: 46, float: true, check: false }), h('div', {}, h('b', {}, 'BoxBox'), h('span', {}, 'Different accounts.', h('br'), 'A cleaner browser.'))),
      h('div', { style: { position: 'relative', display: 'grid', gap: '4px' } }, hl, ...SECTIONS.map(([id, label, ic]) => h('button', { class: 'navbtn', 'data-section': id, 'aria-current': section === id ? 'page' : null, onclick: () => go(id) }, icon(ic), label))));
  }
  const idx = SECTIONS.findIndex(([id]) => id === section);
  nav.querySelector('.hl').style.transform = `translateY(${idx * 52}px)`;
  nav.querySelectorAll('.navbtn').forEach((b) => b.setAttribute('aria-current', b.dataset.section === section ? 'page' : 'false'));
  main.replaceChildren(({ services, general, proxy, appearance, about }[section] || services)());
  const lid = main.querySelector('[data-first-open]'); if (lid) { const fav = lid.querySelector('.fav'), ac = lid.querySelector('.cards'); if (ac) unpack(ac, fav); }
}
function go(id) { section = id; location.hash = id; render(); }

const serviceName = (id) => st.services.find((s) => s.id === id)?.name || id;
const hue = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return `hsl(${x} 42% 46%)`; };
const accountsOf = (sid) => st.accounts.filter((a) => a.serviceId === sid);

/** Boxes tumble in from the service icon, but are only visible once inside their own tile (clipped to it). */
function unpack(wrap, fav) {
  if (MO.reduce || !fav) return;
  const f = fav.getBoundingClientRect(), from = [f.left + f.width / 2, f.top + f.height / 2];
  wrap.querySelectorAll('.card:not(.add)').forEach((c, i) => {
    const bx = c.querySelector('.bx'); if (!bx) return;
    const q = bx.getBoundingClientRect(), to = [q.left + q.width / 2, q.top + q.height / 2], d = 120 + i * 80;
    c.animate([{ clipPath: 'inset(0 round 22px)' }, { clipPath: 'inset(0 round 22px)' }], { duration: d + 1000 });
    MO.arc(bx, from, to, { delay: d, height: 70, duration: 850, spin: (i % 2 ? 1 : -1) * 110 }); MO.lid(bx, .9); setTimeout(() => MO.lid(bx, 0), d + 560);
  });
  wrap.querySelectorAll('.add').forEach((c, i) => MO.popIn(c, { delay: 380 + i * 80, duration: 440 }));
}

// ------------------------------------------------------------------ Entry modes
function general() {
  const s = st.settings;
  const mk = (m) => ({ default: [KRAFT, 'home', true], remember: ['#3b82f6', 'user', false], ask: ['#f59e0b', 'user', false] }[m]);
  const modeCard = (m) => {
    const [col, ic, kr] = mk(m);
    const bx = kr ? box({ kraft: true, icon: ic, size: 76, lid: true, label: 'default', check: false }) : box({ color: col, icon: ic, size: 76, lid: true, label: modeLabel[m].slice(0, 8), check: false });
    return h('button', { class: 'card mopt rf' + (s.defaultMode === m ? ' selected on' : ''), type: 'button', role: 'radio', 'aria-checked': String(s.defaultMode === m), 'data-mode': m, 'data-tilt': 4, style: { '--c': col, '--rc': col },
      onclick: async (e) => { MO.lid(bx, 1); setTimeout(() => MO.lid(bx, 0), 380); MO.squish(bx); await api('setSettings', { patch: { defaultMode: m } }); await refresh(); } },
      bx, h('h3', {}, modeLabel[m]), h('p', {}, modeHelp[m]), h('span', { class: 'tick' }, icon('check')));
  };
  const overrides = Object.entries(s.modes);
  const addSel = h('select', { class: 'input', id: 'override-service', style: { maxWidth: '280px' } }, h('option', { value: '' }, 'Add a service override…'), st.services.filter((x) => !s.modes[x.id]).map((x) => h('option', { value: x.id }, x.name)));
  addSel.onchange = async () => { if (addSel.value) { await api('setServiceMode', { serviceId: addSel.value, mode: s.defaultMode === 'default' ? 'ask' : 'default' }); await refresh(); } };
  return h('section', {},
    h('div', {}, h('h1', {}, 'Entry modes'), h('p', { class: 'lead' }, 'What happens when you open a service from outside a box.')),
    h('div', { class: 'modes3', role: 'radiogroup', 'aria-label': 'Default entry mode' }, modeCard('default'), modeCard('remember'), modeCard('ask')),
    h('div', { class: 'panel' }, h('h2', {}, 'Per-service overrides'),
      overrides.length ? h('table', {}, overrides.map(([id, m]) => h('tr', { 'data-override': id }, h('td', {}, h('b', {}, serviceName(id))),
        h('td', {}, h('div', { class: 'seg', role: 'radiogroup' }, ['default', 'remember', 'ask'].map((mm) => h('button', { type: 'button', role: 'radio', 'data-mode': mm, 'aria-checked': String(m === mm), onclick: async () => { await api('setServiceMode', { serviceId: id, mode: mm }); await refresh(); } }, modeLabel[mm])))),
        h('td', { style: { textAlign: 'right' } }, h('button', { class: 'iconbtn', 'aria-label': 'Remove override', onclick: async () => { await api('setServiceMode', { serviceId: id, mode: 'inherit' }); await refresh(); } }, icon('x')))))) : h('p', { class: 'muted', style: { margin: 0 } }, 'No overrides. Every service follows the mode above.'),
      addSel));
}

// ------------------------------------------------------------------ Appearance & privacy
function appearance() {
  const s = st.settings;
  const toggle = (key, label, desc) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, label), h('div', { class: 'muted' }, desc)),
    h('button', { class: 'switch', type: 'button', role: 'switch', 'data-setting': key, 'aria-checked': String(!!s[key]), 'aria-label': label, onclick: async () => { await api('setSettings', { patch: { [key]: !s[key] } }); await refresh(); } }));
  const themeSeg = h('div', { class: 'seg', role: 'radiogroup' }, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('button', { type: 'button', role: 'radio', 'data-theme-opt': v, 'aria-checked': String(s.theme === v), onclick: async () => { await api('setSettings', { patch: { theme: v } }); await refresh(); } }, l)));
  setTimeout(() => slideSeg(themeSeg));
  return h('section', {},
    h('div', {}, h('h1', {}, 'Appearance & privacy'), h('p', { class: 'lead' }, 'How boxes look, and what stays on your device (all of it).')),
    h('div', { class: 'panel' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, 'Theme')), themeSeg),
      toggle('border', 'Page border', 'Draw a colored frame and a small name pill around pages that are in a box.'),
      toggle('badge', 'Favicon badge', 'Add a small dot in the box color to the site’s icon.'),
      toggle('tabGroups', 'Tab groups', 'Group tabs of the same box and color the group (in browsers without tab groups the tab title gets a [Box] tag).')),
    h('div', { class: 'panel' }, h('h2', {}, 'Privacy'), h('p', { class: 'muted', style: { margin: 0 } }, 'BoxBox has no telemetry and sends nothing anywhere. Logos for common services ship inside the extension; for other services it remembers the icon a page you visit has already loaded (re-read from the browser cache, kept only on this device). Cookies of Chrome-based boxes are stored in this browser profile; deleting a box deletes them.')));
}

// ------------------------------------------------------------------ Services (accordion) + their boxes
function services() {
  const list = h('div', { id: 'svclist' });
  const search = h('input', { id: 'svc-search', placeholder: 'Search services…', value: query, oninput: (e) => { query = e.target.value; fill(); } });
  function fill() {
    const q = query.trim().toLowerCase();
    const rows = st.services.filter((s) => !q || (s.name + ' ' + s.domains.join(' ')).toLowerCase().includes(q))
      .sort((a, b) => (accountsOf(b.id).length > 0) - (accountsOf(a.id).length > 0) || a.name.localeCompare(b.name));
    list.replaceChildren(...rows.map(row), ...(rows.length ? [] : [h('div', { class: 'empty' }, box({ kraft: true, icon: 'home', size: 76, float: true, check: false }), h('div', {}, 'No services match that'))]));
    openedFresh = null;
  }
  const out = h('section', {},
    h('div', { class: 'top' }, h('div', {}, h('h1', {}, 'Services'), h('p', { class: 'lead' }, 'A service is a group of domains that share one login. Boxes are kept per service.')),
      h('div', { class: 'tools' }, h('label', { class: 'search' }, icon('search'), search), h('button', { class: 'btn primary', id: 'new-service', onclick: newService }, icon('plus'), 'New service'))),
    list);
  fill();
  return out;

  function row(s) {
    const accs = accountsOf(s.id), open = s.id === selectedService;
    const r = h('div', { class: 'svc' + (open ? ' open' : ''), 'data-service': s.id, 'data-name': s.name.toLowerCase() });
    const fav = favTile(s, st.icons && st.icons[s.id]);
    const minis = h('div', { class: 'minis' }, accs.slice(0, 3).map((a) => mini(a.color, 22)), accs.length > 3 ? h('span', { class: 'more' }, '+' + (accs.length - 3)) : null);
    const head = h('button', { class: 'svc-h', type: 'button', 'aria-expanded': String(open), onclick: () => { selectedService = open ? null : s.id; openedFresh = selectedService; services_rerender(); } },
      fav, h('span', { class: 'name' }, s.name), h('div', { class: 'doms' }, s.domains.slice(0, 3).map((d) => h('span', { class: 'chip' }, d)), s.domains.length > 3 ? h('span', { class: 'chip' }, '+' + (s.domains.length - 3)) : null), minis, h('span', { class: 'chev' }, icon('chevron')));
    head.querySelector('.chev svg').style.transform = 'rotate(90deg)';
    r.append(head);
    if (open) { const body = detail(s, fav); r.append(body); if (openedFresh === s.id) { r.setAttribute('data-first-open', ''); } }
    return r;
  }
}
function services_rerender() { render(); }

function detail(s, fav) {
  const others = st.services.filter((x) => x.id !== s.id);
  const accs = accountsOf(s.id);
  const nameIn = h('input', { class: 'input', id: 'svc-name', value: s.name, onchange: async (e) => { await api('serviceEdit', { op: 'rename', args: { id: s.id, name: e.target.value.trim() || s.name } }); await refresh(); toast('Renamed'); } });
  const addIn = h('input', { class: 'input', id: 'svc-add-domain', placeholder: 'Add a domain, e.g. example.org' });
  const add = async () => { const v = addIn.value.trim(); if (!v) return; await api('serviceEdit', { op: 'assign', args: { id: s.id, domains: [v] } }); await refresh(); toast(`${v} now belongs to ${s.name}`); };
  addIn.onkeydown = (e) => { if (e.key === 'Enter') add(); };
  const mode = st.settings.modes[s.id] || 'inherit';
  const modeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Entry mode for this service' }, [['inherit', 'Global'], ['default', 'Default'], ['remember', 'Last used'], ['ask', 'Ask']].map(([m, l]) => h('button', { type: 'button', role: 'radio', 'data-svc-mode': m, 'aria-checked': String(mode === m), onclick: async () => { await api('setServiceMode', { serviceId: s.id, mode: m }); await refresh(); } }, l)));
  setTimeout(() => slideSeg(modeSeg));
  const cards = h('div', { class: 'cards' }, accs.map((a) => h('div', { class: 'card acard sheen', 'data-account': a.id, 'data-tilt': 4, style: { '--c': a.color }, onclick: () => edit(a, s.id) },
    box({ color: a.color, icon: a.icon, label: a.name, size: 58, lid: true, check: false }), h('div', { class: 'title' }, a.name), h('div', { class: 'sub' }, a.proxy ? `via ${proxyLabel(a.proxy)}` : 'No proxy'),
    h('button', { class: 'iconbtn menu', 'data-edit': a.id, 'aria-label': `Edit ${a.name}`, onclick: (e) => { e.stopPropagation(); edit(a, s.id); } }, icon('edit')))),
    h('button', { class: 'card add acard', type: 'button', 'data-add-account': s.id, onclick: () => edit(null, s.id) }, icon('plus'), 'Add a box'));
  return h('div', { class: 'body', id: 'svc-detail', 'data-service': s.id },
    h('div', { class: 'ctrls' }, h('div', { class: 'field', style: { minWidth: '220px' } }, h('label', { for: 'svc-name' }, 'Name'), nameIn), h('label', {}, 'Entry mode', modeSeg), h('span', { class: 'chip' }, s.kind === 'catalog' ? 'built-in' : s.kind === 'user' ? 'custom' : 'automatic')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Domains (sub-domains are included)'),
      s.domains.length ? s.domains.map((d) => h('div', { class: 'domain', 'data-domain': d }, icon('link'), h('span', { class: 'd' }, d),
        h('button', { class: 'btn sm', type: 'button', 'data-split': d, title: 'Move this domain to its own service', onclick: () => splitDomain(s, d) }, icon('split'), 'Split off'),
        others.length ? h('button', { class: 'btn sm', type: 'button', 'data-move': d, title: 'Move this domain into another service', onclick: () => moveDomain(s, d) }, icon('merge'), 'Move…') : null)) : h('div', { class: 'muted' }, 'No domains.')),
    h('div', { class: 'row' }, addIn, h('button', { class: 'btn', id: 'svc-add', onclick: add }, icon('plus'), 'Add')),
    h('div', { class: 'row wrap', style: { justifyContent: 'space-between' } },
      h('button', { class: 'btn', id: 'svc-merge', onclick: () => mergeInto(s) }, icon('merge'), 'Merge into another service…'),
      s.kind === 'user' ? h('button', { class: 'btn danger', id: 'svc-delete', onclick: async () => { await api('serviceEdit', { op: 'delete', args: { id: s.id } }); selectedService = null; await refresh(); toast('Service deleted'); } }, icon('trash'), 'Delete service') : null),
    h('div', { class: 'field' }, h('span', { class: 'label' }, `Boxes (${accs.length})`), cards));
}

function serviceSelect(id, services) {
  return h('select', { class: 'input', id }, services.map((x) => h('option', { value: x.id }, `${x.name} — ${x.domains.slice(0, 2).join(', ')}`)));
}
const actions = (close, label, id, fn) => h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', id, onclick: fn }, label));
function newService() {
  sheet((close) => {
    const name = h('input', { class: 'input', id: 'ns-name', placeholder: 'e.g. Work apps' });
    const doms = h('input', { class: 'input', id: 'ns-domains', placeholder: 'domains, separated by commas' });
    return [h('h3', {}, 'New service'), h('div', { class: 'field' }, h('label', {}, 'Name'), name), h('div', { class: 'field' }, h('label', {}, 'Domains'), doms),
      actions(close, 'Create', 'ns-save', async () => { const r = await api('serviceEdit', { op: 'create', args: { name: name.value.trim() || 'New service', domains: doms.value.split(/[,\s]+/).filter(Boolean) } }); selectedService = r.id; close(); await refresh(); })];
  }, { center: true });
}
function splitDomain(s, d) {
  sheet((close) => {
    const name = h('input', { class: 'input', id: 'split-name', value: d.split('.')[0].replace(/^\w/, (c) => c.toUpperCase()) });
    return [h('h3', {}, `Split ${d} off`), h('p', { class: 'muted', style: { margin: 0 } }, `${d} (and its sub-domains) will become a separate service with its own boxes, no longer part of ${s.name}.`),
      h('div', { class: 'field' }, h('label', {}, 'New service name'), name),
      actions(close, 'Split', 'split-save', async () => { const r = await api('serviceEdit', { op: 'split', args: { name: name.value.trim() || d, domains: [d] } }); selectedService = r.id; close(); await refresh(); toast(`${d} is now its own service`); })];
  }, { center: true });
}
function moveDomain(s, d) {
  sheet((close) => {
    const sel = serviceSelect('move-target', st.services.filter((x) => x.id !== s.id));
    return [h('h3', {}, `Move ${d}`), h('div', { class: 'field' }, h('label', {}, 'Into service'), sel),
      actions(close, 'Move', 'move-save', async () => { await api('serviceEdit', { op: 'assign', args: { id: sel.value, domains: [d] } }); selectedService = sel.value; close(); await refresh(); toast('Moved'); })];
  }, { center: true });
}
function mergeInto(s) {
  sheet((close) => {
    const sel = serviceSelect('merge-target', st.services.filter((x) => x.id !== s.id));
    return [h('h3', {}, `Merge ${s.name}`), h('p', { class: 'muted', style: { margin: 0 } }, `All of ${s.name}’s domains and boxes move into the service you choose. Logins are kept per box.`),
      h('div', { class: 'field' }, h('label', {}, 'Merge into'), sel),
      actions(close, 'Merge', 'merge-save', async () => { await api('serviceEdit', { op: 'merge', args: { from: s.id, to: sel.value } }); selectedService = sel.value; close(); await refresh(); toast('Merged'); })];
  }, { center: true });
}
function edit(acc, sid, withProxy = false) {
  openAccountEditor({ withProxy, existing: accountsOf(sid).length, account: acc, serviceId: sid, serviceName: serviceName(sid), target: st.target, onDone: async () => { await refresh(); } });
}

// ------------------------------------------------------------------ Proxies
function proxy() {
  const ff = st.target === 'firefox';
  const withProxy = st.accounts.filter((a) => a.proxy);
  return h('section', {},
    h('div', {}, h('h1', {}, 'Proxies'), h('p', { class: 'lead' }, 'Each box can use its own HTTP, HTTPS or SOCKS5 proxy (with authentication).')),
    h('div', { class: 'panel' }, h('h2', {}, ff ? 'Exact per-box routing (Firefox)' : 'Best effort (Chrome)'),
      ff ? h('p', { class: 'muted', style: { margin: 0 } }, 'Firefox decides the proxy per request from the container of the requesting tab, so a proxy applies exactly and only to that box’s tabs. DNS is resolved by the proxy, WebRTC is forced through relays, and a dead proxy blocks the request instead of falling back to your own IP.')
        : h('div', { class: 'banner warn' }, icon('warn'), h('div', {}, 'Chrome has a single, browser-wide proxy setting. BoxBox generates a proxy auto-config script that sends the hosts used by proxied boxes through their proxy. This is shared with any other extension that sets a proxy, and BoxBox tells you whenever a tab’s routing can’t be guaranteed.'))),
    h('div', { class: 'panel' }, h('h2', {}, 'Boxes with a proxy'),
      h('select', { class: 'input', id: 'proxy-add-account', style: { maxWidth: '360px' }, onchange: (e) => { const a = st.accounts.find((x) => x.id === e.target.value); e.target.value = ''; if (a) edit(a, a.serviceId, true); } },
        h('option', { value: '' }, 'Configure a proxy for…'), st.accounts.filter((a) => !a.proxy).map((a) => h('option', { value: a.id }, `${a.name} — ${serviceName(a.serviceId)}`))),
      withProxy.length ? withProxy.map((a) => h('div', { class: 'prow', 'data-account': a.id }, mini(a.color, 30), h('div', { class: 'grow' }, h('b', {}, a.name), h('small', {}, `${serviceName(a.serviceId)} · ${proxyLabel(a.proxy)}`)), h('button', { class: 'btn sm', 'data-edit': a.id, onclick: () => edit(a, a.serviceId) }, icon('edit'), 'Edit')))
        : h('p', { class: 'muted', style: { margin: 0 } }, 'No box uses a proxy yet.')));
}

// ------------------------------------------------------------------ About
function about() {
  const mf = ext.runtime.getManifest();
  return h('section', {},
    h('div', {}, h('h1', {}, 'About BoxBox'), h('p', { class: 'lead' }, `Version ${mf.version} · ${({ firefox: 'Firefox', 'chrome-mv3': 'Chrome (Manifest V3)', 'chrome-mv2': 'Chrome / Helium (Manifest V2)' })[st.target]}`)),
    h('div', { class: 'panel', style: { justifyItems: 'center', padding: '36px' } }, box({ kraft: true, icon: '', size: 120, float: true, face: true, lid: true, check: false }), h('div', { style: { fontWeight: 800, fontSize: '20px' } }, 'One browser. Many lives.')),
    h('div', { class: 'panel' }, h('h2', {}, 'How isolation works here'), h('p', { class: 'muted', style: { margin: 0 } }, st.target === 'firefox' ? 'Each box is a Firefox container: cookies, storage, service workers and cache are separated by the browser itself.' : 'Each box has its own virtual cookie jar and namespaced page storage, applied at the network layer and in the page. Nothing is shared between boxes, and nothing leaves your device.')));
}

applyTheme();
refresh().catch((e) => main.replaceChildren(h('div', { class: 'banner fail' }, e.message)));
