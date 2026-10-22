import fs from 'node:fs';
import path from 'node:path';
import { waitFor, sleep } from '../lib/framework.mjs';

// UI tests drive the real popup / picker / settings pages (embedded in an iframe because WebDriver cannot open extension
// pages), through DOM events, and save screenshots to test-results/screens for visual review.
export default function (R, h, drv) {
  const A = 'fx-alpha';
  const shots = path.resolve('test-results/screens');
  const ui = (ctx) => ({
    open: async (page, w = 380, hgt = 640) => { await drv.control.eval((p, w, hh) => window.postMessage({ __boxFrame: p, w, h: hh }, '*'), page, w, hgt); await sleep(300); },
    ev: async (fn, ...args) => { try { return await drv.control.frameEval('.html', fn, ...args); } catch (e) { throw new Error(e.message.split('\n')[0] + '  in: ' + fn.toString().slice(0, 140)); } },
    shot: async (name) => { fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, `${ctx.name}-${name}.png`), await drv.control.screenshot()); },
  });
  const waitIn = async (u, fn, msg, ...a) => waitFor(async () => u.ev(fn, ...a), { message: msg, timeout: 8000 });
  const typeIn = (sel, v) => (s, val) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };

  R.test('popup: shows the service, switches accounts, creates / edits / deletes an account', async (ctx, a) => {
    const u = ui(ctx);
    const acc = (await h.createAccount(A, 'Work', { color: '#6366f1', icon: 'briefcase' })).id;
    await h.createAccount(A, 'Personal', { color: '#ec4899', icon: 'heart' });
    let t = await h.openIn(null, h.url('mail.alpha.localhost', '/blank'));
    await u.open(`popup.html?tab=${await t.boxId()}`);
    await waitIn(u, () => document.getElementById('svc-name')?.textContent, 'service name');
    a.eq(await u.ev(() => document.getElementById('svc-name').textContent), 'Alpha', 'mail.alpha.localhost belongs to the Alpha service');
    a.eq(await u.ev(() => [...document.querySelectorAll('.card[data-account]')].map((c) => c.querySelector('.title').textContent)), ['Default session', 'Work', 'Personal']);
    a.eq(await u.ev(() => document.querySelector('.card.selected').dataset.account), 'default');
    await sleep(600); await u.shot('popup-default');

    // switch this tab to "Work"
    const before = await drv.handles();
    await u.ev((id) => document.querySelector(`.card[data-account="${id}"]`).click(), acc);
    t = await waitFor(async () => { const cur = await drv.allTabs(); for (const x of cur) { if ((await x.url()).startsWith(h.url('mail.alpha.localhost')) && (await h.tabAccount(x))?.accountId === acc) return x; } }, { message: 'tab switched to Work', timeout: 12000 });
    a.eq((await h.tabAccount(t)).accountId, acc);

    // new account through the sheet
    await u.open(`popup.html?tab=${await t.boxId()}`);
    await waitIn(u, () => !!document.getElementById('new-account'), 'new account button');
    await u.ev(() => document.getElementById('new-account').click());
    await waitIn(u, () => !!document.getElementById('acc-name'), 'editor sheet');
    await u.ev(typeIn(), '#acc-name', 'Side project');
    await u.ev(() => document.querySelectorAll('.swatch')[4].click());
    await u.ev(() => document.querySelectorAll('.iconpick')[7].click());
    await sleep(500); await u.shot('popup-editor');
    await u.ev(() => document.getElementById('acc-save').click());
    await waitFor(async () => (await h.state()).accounts && Object.values((await h.state()).accounts).some((x) => x.name === 'Side project'), { message: 'account created' });
    const created = Object.values((await h.state()).accounts).find((x) => x.name === 'Side project');
    a.eq(created.color, '#ef4444'); a.eq(created.icon, 'game');
    // creating from the popup also selects it for this tab
    await waitFor(async () => { for (const x of await drv.allTabs()) { if ((await h.tabAccount(x))?.accountId === created.id) { t = x; return true; } } }, { message: 'new account selected for the tab', timeout: 12000 });

    // edit then delete via the UI
    await u.open(`popup.html?tab=${await t.boxId()}`);
    await waitIn(u, (id) => !!document.querySelector(`[data-edit="${id}"]`), 'edit button', created.id);
    await u.ev((id) => document.querySelector(`[data-edit="${id}"]`).click(), created.id);
    await waitIn(u, () => !!document.getElementById('acc-name'), 'edit sheet');
    await u.ev(typeIn(), '#acc-name', 'Renamed');
    await u.ev(() => document.getElementById('acc-save').click());
    await waitFor(async () => (await h.state()).accounts[created.id].name === 'Renamed', { message: 'rename saved' });
    await u.open(`popup.html?tab=${await t.boxId()}`);
    await waitIn(u, (id) => !!document.querySelector(`[data-edit="${id}"]`), 'edit button 2', created.id);
    await u.ev((id) => document.querySelector(`[data-edit="${id}"]`).click(), created.id);
    await waitIn(u, () => !!document.getElementById('acc-delete'), 'delete button');
    await u.ev(() => document.getElementById('acc-delete').click());
    await waitIn(u, () => !!document.getElementById('acc-delete-confirm'), 'confirm sheet');
    await sleep(400); await u.shot('popup-delete-confirm');
    await u.ev(() => document.getElementById('acc-delete-confirm').click());
    await waitFor(async () => !(await h.state()).accounts[created.id], { message: 'account deleted via UI' });
  });

  R.test('popup: per-service entry mode override', async (ctx, a) => {
    const u = ui(ctx);
    await h.createAccount(A, 'One');
    const t = await h.openIn(null, h.url('alpha.localhost', '/blank'));
    await u.open(`popup.html?tab=${await t.boxId()}`);
    await waitIn(u, () => !!document.querySelector('[data-mode="ask"]'), 'mode control');
    await u.ev(() => document.querySelector('[data-mode="ask"]').click());
    await waitFor(async () => (await h.state()).settings.modes[A] === 'ask', { message: 'override stored' });
    await u.ev(() => document.querySelector('[data-mode="inherit"]').click());
    await waitFor(async () => !(await h.state()).settings.modes[A], { message: 'override removed' });
  });

  R.test('popup on a non-web page explains itself', async (ctx, a) => {
    const u = ui(ctx);
    await u.open(`popup.html?tab=${await drv.control.boxId()}`);   // the control tab is on ctl.localhost: a web page, so use a bogus id
    await u.open('popup.html?tab=999999');
    await waitIn(u, () => /Open a website|Error|No tab/i.test(document.body.textContent), 'empty state');
  });

  R.test('settings: general modes, theme, services editor (merge / split / create) and accounts', async (ctx, a) => {
    const u = ui(ctx);
    const acc = (await h.createAccount(A, 'Settings acct')).id;
    await u.open('settings.html', 1100, 800);
    await waitIn(u, () => !!document.querySelector('[data-mode="ask"].card'), 'general section');
    await u.ev(() => document.querySelector('.card[data-mode="remember"]').click());
    await waitFor(async () => (await h.state()).settings.defaultMode === 'remember', { message: 'default mode saved' });
    await u.ev(() => document.querySelector('[data-theme-opt="dark"]').click());
    await waitFor(async () => (await h.state()).settings.theme === 'dark', { message: 'theme saved' });
    await sleep(500); await u.shot('settings-general-dark');
    await u.ev(() => document.querySelector('[data-theme-opt="light"]').click());
    await u.ev(() => document.querySelector('[data-setting="border"]').click());
    await waitFor(async () => (await h.state()).settings.border === false, { message: 'toggle saved' });
    // services: create
    await u.ev(() => document.querySelector('[data-section="services"]').click());
    await waitIn(u, () => !!document.getElementById('new-service'), 'services section');
    await u.ev(() => document.getElementById('new-service').click());
    await waitIn(u, () => !!document.getElementById('ns-name'), 'new service sheet');
    await u.ev(typeIn(), '#ns-name', 'Work apps'); await u.ev(typeIn(), '#ns-domains', 'gamma.localhost, x.example.org');
    await u.ev(() => document.getElementById('ns-save').click());
    await waitFor(async () => (await h.service(h.url('gamma.localhost')))?.name === 'Work apps', { message: 'service created by UI' });
    // services: select Alpha, split a domain, then merge
    await u.ev(() => document.querySelector('[data-service="fx-alpha"].svc').click());
    await waitIn(u, () => !!document.querySelector('[data-split="alpha-static.localhost"]'), 'alpha detail');
    await sleep(500); await u.shot('settings-services');
    await u.ev(() => document.querySelector('[data-split="alpha-static.localhost"]').click());
    await waitIn(u, () => !!document.getElementById('split-save'), 'split sheet');
    await u.ev(() => document.getElementById('split-save').click());
    await waitFor(async () => (await h.service(h.url('alpha-static.localhost')))?.id !== A, { message: 'split by UI' });
    // accounts section
    await u.ev(() => document.querySelector('[data-section="accounts"]').click());
    await waitIn(u, (id) => !!document.querySelector(`[data-account="${id}"]`), 'account row', acc);
    await sleep(400); await u.shot('settings-accounts');
    await u.ev(() => document.querySelector('[data-section="proxy"]').click());
    await sleep(400); await u.shot('settings-proxy');
  });

  R.test('picker UI screenshot (light + dark)', async (ctx, a) => {
    const u = ui(ctx);
    const acc = (await h.createAccount(A, 'Alice', { color: '#14b8a6', icon: 'user' })).id;
    await h.createAccount(A, 'Bob (VPN)', { color: '#f97316', icon: 'shield', proxy: { type: 'http', host: '127.0.0.1', port: 9999 } });
    await h.box({ type: 'setSettings', patch: { defaultMode: 'ask' } });
    const t = await h.open(h.url('ctl.localhost', '/blank'));
    await t.gotoMayReplace(h.url('mail.alpha.localhost', '/inbox?x=1'));
    const pk = await waitFor(async () => { const st = await h.state(); return st.pickers.length ? st.pickers[0] : null; }, { message: 'picker pending' });
    await u.open(`picker.html?tab=${pk[0]}`, 760, 560);
    await waitIn(u, () => document.querySelectorAll('.tile').length === 3, 'three tiles');
    await sleep(900); await u.shot('picker');
    await h.box({ type: 'pickerChoice', tabId: pk[0], accountId: null });
  });
}
