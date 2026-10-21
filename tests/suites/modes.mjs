import { waitFor } from '../lib/framework.mjs';

export default function (R, h, drv) {
  const A = 'fx-alpha';
  const findTab = async (ctx, prefix) => { let found; await waitFor(async () => { for (const x of await ctx.drv.allTabs()) { if ((await x.url()).startsWith(prefix)) { found = x; return true; } } }, { message: 'tab ' + prefix, timeout: 10000 }); return found; };

  R.test('mode "default session": entering a service never switches account', async (ctx, a) => {
    await h.createAccount(A, 'Acc');
    const t = await h.open(h.url('ctl.localhost', '/blank'));
    await t.goto(h.url('alpha.localhost', '/blank'));
    a.eq((await h.tabAccount(t))?.accountId, null);
    a.eq(await h.banner(t) !== null, true);
  });

  R.test('mode "remember last": opens in the account used last, and follows later choices', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Remembered')).id;
    await h.box({ type: 'setSettings', patch: { defaultMode: 'remember' } });
    // no choice yet -> default session
    let t = await h.open(h.url('ctl.localhost', '/blank'));
    await t.gotoMayReplace(h.url('alpha.localhost', '/blank'));
    t = await findTab(ctx, h.url('alpha.localhost'));
    a.eq((await h.tabAccount(t))?.accountId, null, 'nothing remembered yet');
    // choose the account for this tab (popup action) -> remembered
    t = await h.switchTo(t, acc);
    // a new tab entering the service lands in that account
    const t2 = await h.open(h.url('ctl.localhost', '/blank'));
    await t2.gotoMayReplace(h.url('alpha.localhost', '/blank'));
    const landed = await findTab(ctx, h.url('alpha.localhost'));
    await waitFor(async () => { for (const x of await ctx.drv.allTabs()) { if ((await x.url()).startsWith(h.url('alpha.localhost')) && (await h.tabAccount(x))?.accountId === acc && x.handle !== t.handle) return true; } }, { message: 'second tab in remembered account', timeout: 10000 });
    // choosing the default session is remembered too
    await h.switchTo(t, null);
    await ctx.drv.closeAllTabs();
    const t3 = await h.open(h.url('ctl.localhost', '/blank'));
    await t3.gotoMayReplace(h.url('alpha.localhost', '/blank'));
    const l3 = await findTab(ctx, h.url('alpha.localhost'));
    a.eq((await h.tabAccount(l3))?.accountId, null, 'default session remembered');
  });

  R.test('mode "ask": picker appears before the page loads; choice opens the account', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Pick me')).id;
    await h.box({ type: 'setSettings', patch: { defaultMode: 'ask' } });
    const t = await h.open(h.url('ctl.localhost', '/blank'));
    await h.fxLogReset();
    await t.gotoMayReplace(h.url('alpha.localhost', '/blank'));
    const pk = await waitFor(async () => { const st = await h.state(); return st.pickers.length ? st.pickers[0] : null; }, { message: 'picker pending' });
    a.eq(pk[1].serviceId, A);
    const log = await h.fxLog();
    a.ok(!log.some((l) => l.host === 'alpha.localhost'), 'no request reached the service before a choice: ' + JSON.stringify(log.filter((l) => l.host.includes('alpha'))));
    // the real picker UI (embedded) -> click the account tile
    const ctl = drv.control;
    await ctl.eval((q) => window.postMessage({ __boxFrame: 'picker.html?tab=' + q, w: 700, h: 600 }, '*'), pk[0]);
    await waitFor(async () => (await ctl.frameEval('picker.html', (id) => !!document.querySelector(`[data-account="${id}"]`), acc)), { message: 'picker tiles rendered' });
    const tabsBefore = await ctx.drv.handles();
    await ctl.frameEval('picker.html', (id) => document.querySelector(`[data-account="${id}"]`).click(), acc);
    const landed = await waitFor(async () => { for (const x of await ctx.drv.allTabs()) { if ((await x.url()).startsWith(h.url('alpha.localhost')) && (await h.tabAccount(x))?.accountId === acc) return x; } }, { message: 'tab landed in chosen account', timeout: 12000 });
    a.ok(landed);
  });

  R.test('mode "ask": choosing "Default session" opens the page in the default session', async (ctx, a) => {
    await h.createAccount(A, 'Other');
    await h.box({ type: 'setSettings', patch: { defaultMode: 'ask' } });
    const t = await h.open(h.url('ctl.localhost', '/blank'));
    await t.gotoMayReplace(h.url('alpha.localhost', '/blank'));
    const pk = await waitFor(async () => { const st = await h.state(); return st.pickers.length ? st.pickers[0] : null; }, { message: 'picker pending' });
    await h.box({ type: 'pickerChoice', tabId: pk[0], accountId: null });
    const landed = await waitFor(async () => { for (const x of await ctx.drv.allTabs()) { if ((await x.url()).startsWith(h.url('alpha.localhost'))) return x; } }, { message: 'alpha opened', timeout: 12000 });
    a.eq((await h.tabAccount(landed))?.accountId, null);
  });

  R.test('per-service override beats the global mode', async (ctx, a) => {
    await h.createAccount(A, 'A1'); await h.createAccount('fx-beta', 'B1');
    await h.box({ type: 'setSettings', patch: { defaultMode: 'ask' } });
    await h.box({ type: 'setServiceMode', serviceId: 'fx-beta', mode: 'default' });
    const t = await h.open(h.url('ctl.localhost', '/blank'));
    await t.gotoMayReplace(h.url('beta.localhost', '/blank'));          // overridden to default -> straight in
    await waitFor(async () => (await t.url()).startsWith(h.url('beta.localhost')), { message: 'beta loads without picker' });
    a.eq((await h.state()).pickers.length, 0);
    const t2 = await h.open(h.url('ctl.localhost', '/blank'));
    await t2.gotoMayReplace(h.url('alpha.localhost', '/blank'));          // global ask applies
    await waitFor(async () => (await h.state()).pickers.length === 1, { message: 'picker for alpha' });
  });

  R.test('ask mode with no accounts does not interrupt', async (ctx, a) => {
    await h.box({ type: 'setSettings', patch: { defaultMode: 'ask' } });
    const t = await h.open(h.url('ctl.localhost', '/blank'));
    await t.goto(h.url('alpha.localhost', '/blank'));
    a.eq((await h.state()).pickers.length, 0);
  });
}
