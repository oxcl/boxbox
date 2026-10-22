import { h, icon, avatar, api, sheet, toast, COLORS, iconNames } from './lib.js';

/** Create/edit sheet. opts: {account?, serviceId, serviceName, target, onDone(kind, account?)} */
export function openAccountEditor({ account, serviceId, serviceName, target, onDone, host, withProxy = false }) {
  const editing = !!account;
  const st = {
    name: account?.name || '', color: account?.color || COLORS[Math.floor(Math.random() * COLORS.length)], icon: account?.icon || iconNames[Math.floor(Math.random() * iconNames.length)],
    proxyOn: !!account?.proxy || withProxy, proxy: { type: 'http', host: '', port: '', username: '', password: '', ...(account?.proxy || {}) },
  };
  return sheet((close) => {
    const preview = h('div', { class: 'row' });
    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' });
    const icons = h('div', { class: 'icons', role: 'radiogroup', 'aria-label': 'Icon' });
    const proxyBox = h('div', { class: 'grid', style: { display: 'grid', gap: '10px' } });
    const nameIn = h('input', { class: 'input', id: 'acc-name', placeholder: `e.g. ${serviceName} work`, value: st.name, maxlength: 40, oninput: (e) => { st.name = e.target.value; paintPreview(); } });

    function paintPreview() {
      preview.replaceChildren(avatar({ color: st.color, icon: st.icon }), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, st.name || 'New account'), h('div', { class: 'muted' }, serviceName)));
      sw.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.c === st.color)));
      ic.forEach((b) => { b.setAttribute('aria-checked', String(b.dataset.i === st.icon)); b.style.setProperty('--c', st.color); });
    }
    const sw = COLORS.map((c) => h('button', { class: 'swatch', type: 'button', role: 'radio', 'data-c': c, 'aria-label': c, style: { '--c': c }, onclick: () => { st.color = c; paintPreview(); } }));
    const ic = iconNames.map((i) => h('button', { class: 'iconpick', type: 'button', role: 'radio', 'data-i': i, 'aria-label': i, onclick: () => { st.icon = i; paintPreview(); } }, icon(i)));
    swatches.append(...sw); icons.append(...ic);

    function paintProxy() {
      proxyBox.replaceChildren();
      if (!st.proxyOn) return;
      const p = st.proxy;
      const note = target === 'firefox'
        ? h('div', { class: 'banner', style: { background: 'var(--bg2)' } }, icon('shield'), h('div', {}, 'Applied exactly and only to this account’s tabs. A dead proxy blocks the request — it never falls back to your own IP.'))
        : h('div', { class: 'banner warn' }, icon('warn'), h('div', {}, 'Best effort on Chrome: the proxy is applied to this service’s hosts for the whole browser while this account is open. Box tells you whenever that can’t be guaranteed for a tab.'));
      proxyBox.append(note,
        h('div', { class: 'grid2' },
          h('div', { class: 'field' }, h('label', { for: 'px-type' }, 'Type'), h('select', { class: 'input', id: 'px-type', onchange: (e) => { p.type = e.target.value; } }, ['http', 'https', 'socks5'].map((t) => h('option', { value: t, selected: p.type === t }, t === 'socks5' ? 'SOCKS5' : t.toUpperCase())))),
          h('div', { class: 'field' }, h('label', { for: 'px-port' }, 'Port'), h('input', { class: 'input', id: 'px-port', inputmode: 'numeric', placeholder: '8080', value: p.port, oninput: (e) => { p.port = e.target.value; } }))),
        h('div', { class: 'field' }, h('label', { for: 'px-host' }, 'Host'), h('input', { class: 'input', id: 'px-host', placeholder: 'proxy.example.com', value: p.host, oninput: (e) => { p.host = e.target.value; } })),
        h('div', { class: 'grid2' },
          h('div', { class: 'field' }, h('label', { for: 'px-user' }, 'Username'), h('input', { class: 'input', id: 'px-user', autocomplete: 'off', value: p.username, oninput: (e) => { p.username = e.target.value; } })),
          h('div', { class: 'field' }, h('label', { for: 'px-pass' }, 'Password'), h('input', { class: 'input', id: 'px-pass', type: 'password', autocomplete: 'new-password', value: p.password, oninput: (e) => { p.password = e.target.value; } }))));
    }
    const proxySwitch = h('button', { class: 'switch', id: 'px-on', type: 'button', role: 'switch', 'aria-checked': String(st.proxyOn), 'aria-label': 'Use a proxy', onclick: (e) => { st.proxyOn = !st.proxyOn; e.currentTarget.setAttribute('aria-checked', String(st.proxyOn)); paintProxy(); } });

    const save = h('button', { class: 'btn primary', id: 'acc-save', type: 'button', onclick: async () => {
      save.disabled = true;
      try {
        const proxy = st.proxyOn && st.proxy.host ? { ...st.proxy, port: Number(st.proxy.port) || undefined } : null;
        const payload = { name: st.name.trim(), color: st.color, icon: st.icon, proxy };
        const res = editing ? await api('updateAccount', { id: account.id, patch: payload }) : await api('createAccount', { serviceId, ...payload });
        close(); onDone?.(editing ? 'updated' : 'created', res);
      } catch (e) { toast(e.message); save.disabled = false; }
    } }, editing ? 'Save changes' : 'Create account');

    const del = editing ? h('button', { class: 'btn danger', id: 'acc-delete', type: 'button', onclick: () => confirmDelete() }, icon('trash'), 'Delete') : null;
    function confirmDelete() {
      sheet((c2) => [
        h('h3', {}, `Delete “${account.name}”?`),
        h('p', { class: 'muted', style: { margin: 0 } }, 'All cookies, local storage, IndexedDB, caches and other data stored for this account are permanently erased. Open tabs in this account move back to your default session. This cannot be undone.'),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
          h('button', { class: 'btn', type: 'button', onclick: c2 }, 'Cancel'),
          h('button', { class: 'btn danger solid', id: 'acc-delete-confirm', type: 'button', onclick: async () => { try { await api('deleteAccount', { id: account.id }); c2(); close(); onDone?.('deleted'); } catch (e) { toast(e.message); } } }, icon('trash'), 'Delete forever')),
      ], { center: true, host });
    }

    paintPreview(); paintProxy();
    return [
      h('div', { class: 'row' }, h('h3', { class: 'grow' }, editing ? 'Edit account' : `New ${serviceName} account`), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x'))),
      preview,
      h('div', { class: 'field' }, h('label', { for: 'acc-name' }, 'Name'), nameIn),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Color'), swatches),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Icon'), icons),
      h('div', { class: 'row' }, icon('network'), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, 'Proxy'), h('div', { class: 'muted' }, 'Route this account through its own proxy')), proxySwitch),
      proxyBox,
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, del || h('span'), h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel'), save)),
    ];
  }, { host });
}
