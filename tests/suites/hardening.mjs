import { waitFor, sleep } from '../lib/framework.mjs';

// Beyond the brief's minimum: behavioural fidelity of the shimmed APIs, workers, CSP, wipe verification, session restore.
export default function (R, h, drv) {
  const A = 'fx-alpha';
  const url = (p = '/blank') => h.url('alpha.localhost', p);
  const chromeOnly = { skip: (ctx) => ctx.name === 'firefox' && 'Chrome-only (Firefox containers are native)' };
  const mv3Only = { skip: (ctx) => ctx.name !== 'chrome' && 'MV3-only' };

  R.test('Web Storage under isolation behaves like real Web Storage and stays private to the account', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Storage')).id;
    const t = await h.openIn(acc, url());
    const r = await t.eval(() => {
      localStorage.setItem('a', '1'); localStorage.b = '2'; localStorage['c d'] = '3'; sessionStorage.s = 'x';
      const out = { keys: Object.keys(localStorage).sort(), len: localStorage.length, g: localStorage.getItem('b'), dot: localStorage.a, inA: 'a' in localStorage, inZ: 'zzz' in localStorage,
        k0: typeof localStorage.key(0), json: JSON.stringify(localStorage), tag: Object.prototype.toString.call(localStorage), inst: localStorage instanceof Storage, ss: sessionStorage.s, ssKeys: Object.keys(sessionStorage) };
      delete localStorage.a; out.afterDelete = Object.keys(localStorage).sort();
      localStorage.removeItem('b'); out.afterRemove = localStorage.length;
      return out;
    });
    a.eq(r.keys, ['a', 'b', 'c d']); a.eq(r.len, 3); a.eq(r.g, '2'); a.eq(r.dot, '1'); a.eq(r.inA, true); a.eq(r.inZ, false); a.eq(r.k0, 'string');
    a.eq(Object.entries(JSON.parse(r.json)).sort(), [['a', '1'], ['b', '2'], ['c d', '3']]); a.eq(r.tag, '[object Storage]'); a.eq(r.inst, true); a.eq(r.ss, 'x'); a.eq(r.ssKeys.filter((k) => !k.startsWith('__box')), ['s']);
    a.eq(r.afterDelete, ['b', 'c d']); a.eq(r.afterRemove, 1);
    const def = await h.openIn(null, url());
    a.eq(await def.eval(() => ({ a: localStorage.getItem('c d'), has: 'c d' in localStorage })), { a: null, has: false }, 'default session cannot read the account keys');
    // a second tab in the same account shares localStorage (like two tabs of one profile) and receives storage events
    const t2 = await h.openIn(acc, url());
    a.eq(await t2.eval(() => localStorage.getItem('c d')), '3');
    await t2.eval(() => { window.__ev = []; addEventListener('storage', (e) => window.__ev.push([e.key, e.newValue])); });
    await t.eval(() => localStorage.setItem('evt', 'yes'));
    await waitFor(async () => (await t2.eval(() => window.__ev.length)) > 0, { message: 'storage event in the other tab of the account' });
    a.eq(await t2.eval(() => window.__ev[0]), ['evt', 'yes'], 'event carries the un-namespaced key');
  });

  R.test('IndexedDB / Cache Storage listings only show the account\'s own names', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Names')).id;
    const t = await h.openIn(acc, url());
    await h.login(t, 'named');
    const s = await h.readState(t);
    a.eq(s.idbNames, ['fx']); a.ok(s.cacheNames.includes('fx') && s.cacheNames.every((n) => !n.includes('__box')), 'cache names: ' + s.cacheNames); a.eq(s.lsKeys, ['fx_user']);
    a.ok(!JSON.stringify(s).includes('__box_'), 'no extension prefix leaks into the page-visible state');
  });

  R.test('BroadcastChannel is per account', async (ctx, a) => {
    const [a1, a2] = [(await h.createAccount(A, 'B1')).id, (await h.createAccount(A, 'B2')).id];
    const t1 = await h.openIn(a1, url()), t1b = await h.openIn(a1, url()), t2 = await h.openIn(a2, url()), def = await h.openIn(null, url());
    for (const t of [t1b, t2, def]) await t.eval(() => { window.__got = []; const c = new BroadcastChannel('chan'); c.onmessage = (e) => window.__got.push(e.data); window.__c = c; });
    await t1.eval(() => { new BroadcastChannel('chan').postMessage('hello'); });
    await waitFor(async () => (await t1b.eval(() => window.__got.length)) === 1, { message: 'same-account tab receives' });
    await sleep(500);
    a.eq(await t2.eval(() => window.__got), [], 'other account does not receive');
    a.eq(await def.eval(() => window.__got), [], 'default session does not receive');
  });

  R.test('dedicated Worker sees the account\'s IndexedDB, Cache Storage and cookies — not the default session\'s', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Workers')).id;
    const def = await h.openIn(null, url()); await h.login(def, 'default-user');
    const t = await h.openIn(acc, url()); await h.login(t, 'account-user');
    const probe = (tab) => tab.eval(() => new Promise((res) => { const w = new Worker('/worker.js'); w.onmessage = (e) => res(e.data); w.postMessage(1); setTimeout(() => res({ timeout: true }), 8000); }));
    const r = await probe(t);
    a.eq(r.idb, 'account-user', 'worker IndexedDB'); a.eq(r.cache, 'account-user', 'worker Cache Storage'); a.eq(r.server, 'account-user', 'worker fetch carries the account cookies');
    const rd = await probe(def);
    a.eq(rd.idb, 'default-user'); a.eq(rd.server, 'default-user');
    await h.logout(def);
  });

  R.test('a strict CSP (script nonce, connect-src self) does not break an account tab', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Csp')).id;
    const t = await h.openIn(acc, url('/csp'));
    await waitFor(async () => t.eval(() => !!window.Fx), { message: 'fx.js loaded under CSP' });
    await t.eval(() => window.Fx.login('csp-user'));
    const s = await h.readState(t);
    a.eq(s.server.user, 'csp-user'); a.eq(s.ls, 'csp-user'); a.eq(s.idb, 'csp-user'); a.eq(s.cookie, 'csp-user');
    a.eq((await h.readState(await h.openIn(null, url()))).server.user, null);
  });

  R.test('cookies written by page script are scoped, readable and sent to the server only within the account', async (ctx, a) => {
    const [a1, a2] = [(await h.createAccount(A, 'C1')).id, (await h.createAccount(A, 'C2')).id];
    const t1 = await h.openIn(a1, url()), t2 = await h.openIn(a2, url());
    await t1.eval(() => { document.cookie = 'js1=one; path=/'; document.cookie = 'scoped=deep; path=/only/here'; });
    a.eq(await t1.eval(() => document.cookie.split('; ').sort()), ['js1=one']);
    const st = await t1.eval(async () => (await (await fetch('/api/state')).json()).cookieNames);
    a.ok(st.includes('js1') && !st.includes('scoped'), 'server saw js1 (path /), not the path-scoped cookie: ' + st);
    a.eq(await t2.eval(() => document.cookie), '', 'other account sees nothing');
    await t1.eval(() => { document.cookie = 'js1=; path=/; max-age=0'; });
    a.eq(await t1.eval(() => document.cookie), '', 'deleting works');
  });

  R.test('account data persists when its tabs close and reopen, and never reaches the default session', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Persist')).id;
    let t = await h.openIn(acc, url()); await h.login(t, 'keeper');
    await t.close();
    t = await h.openIn(acc, url());
    const s = await h.readState(t);
    a.eq(s.server.user, 'keeper'); a.eq(s.ls, 'keeper'); a.eq(s.idb, 'keeper'); a.eq(s.ss, null, 'sessionStorage is per tab and does not survive');
    a.eq((await h.readState(await h.openIn(null, url()))).server.user, null);
  });

  R.test('deleting an account leaves no namespaced data in the origin storage', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Wiped')).id;
    const t = await h.openIn(acc, url()); await h.login(t, 'wipe-me');
    const raw = () => h.openIn(null, url()).then((d) => d.eval(async () => ({ ls: Object.keys(localStorage).filter((k) => k.includes('__box')), idb: (await indexedDB.databases()).map((x) => x.name).filter((n) => n.includes('__box')), cache: (await caches.keys()).filter((n) => n.includes('__box')) })));
    const before = await raw();
    if (ctx.name !== 'firefox') a.ok(before.ls.length && before.idb.length && before.cache.length, 'precondition: account data lives in the origin under a namespace: ' + JSON.stringify(before));
    await h.box({ type: 'deleteAccount', id: acc });
    await ctx.drv.closeAllTabs();
    const after = await raw();
    a.eq([after.ls, after.idb, after.cache], [[], [], []], 'nothing left after deletion: ' + JSON.stringify(after));
    const st = await h.state();
    a.eq(Object.keys(st.origins), [], 'origin registry cleared');
    if (ctx.name !== 'firefox') a.eq(await h.box({ type: 'test:platform', call: 'jar', args: { accountId: acc } }), [], 'virtual cookie jar dropped');
  });

  R.test('a default-session service worker does not take over an account tab', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'NoSw')).id;
    const def = await h.openIn(null, url()); await h.login(def, 'sw-default');
    a.eq((await h.readState(def)).sw, 'sw-default', 'precondition: the default session has a working service worker');
    const t = await h.openIn(acc, url());
    await waitFor(async () => !(await h.readState(t)).swController || ctx.name === 'chrome', { message: 'no foreign SW control (MV2 re-loads once with the debugger bypass)', timeout: 12000 }).catch(() => {});
    const s = await h.readState(t);
    a.not(s.sw, 'sw-default', 'the account tab is not served by the default session\'s service worker');
    a.eq(s.server.user, null);
    await h.logout(def);
  }, chromeOnly);

  R.test('restored tab (browser restart) re-enters its account from its sessionStorage marker', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Restore')).id;
    const t = await h.openIn(acc, url()); await h.login(t, 'restored');
    const id = await t.boxId();
    await h.box({ type: 'test:platform', call: 'forget', args: { tabId: id } });
    a.eq((await h.tabAccount(t))?.accountId, null, 'mapping lost');
    await t.goto(url());                                            // the restored page loads
    await waitFor(async () => (await h.tabAccount(t))?.accountId === acc, { message: 'tab adopted back into its account', timeout: 15000 });
    await waitFor(async () => (await h.readState(t)).server.user === 'restored', { message: 'account session is back', timeout: 15000 });
  }, chromeOnly);

  R.test('MV3: closing the debugging bar fails closed; "Restore isolation" brings the tab back', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Bar')).id;
    const t = await h.openIn(acc, url()); await h.login(t, 'barred');
    const id = await t.boxId();
    await h.box({ type: 'test:platform', call: 'detach', args: { tabId: id } });
    const info = await h.box({ type: 'tabInfo', tabId: id });
    a.eq(info.status.level, 'fail', JSON.stringify(info.status));
    await h.fxLogReset();
    await t.goto(url('/blocked-check'));                            // must not reach the server with default cookies / unisolated
    await sleep(500);
    a.ok(!(await h.fxLog()).some((l) => l.path.startsWith('/blocked-check')), 'nothing was sent while isolation was lost');
    // the popup shows the failure with a working "Restore isolation" button
    await drv.control.eval((q) => window.postMessage({ __boxFrame: 'popup.html?tab=' + q, w: 380, h: 640 }, '*'), id);
    await waitFor(async () => drv.control.frameEval('popup.html', () => !!document.getElementById('restore-isolation')), { message: 'restore button in the popup' });
    await drv.control.frameEval('popup.html', () => document.getElementById('restore-isolation').click());
    await waitFor(async () => (await h.readState(t)).server.user === 'barred', { message: 'account session restored', timeout: 15000 });
    a.eq((await h.box({ type: 'tabInfo', tabId: id })).status.level, 'ok');
  }, mv3Only);

  R.test('MV3: WebSockets from account tabs are flagged (Chrome gives extensions no handshake hook)', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Ws')).id;
    const t = await h.openIn(acc, url());
    await t.eval((u) => { try { window.__ws = new WebSocket(u); window.__ws.onerror = () => {}; } catch (e) { /* ignore */ } }, 'ws://alpha.localhost:' + h.fx.port + '/ws');
    await waitFor(async () => /WebSocket/.test((await h.box({ type: 'tabInfo', tabId: await t.boxId() })).status.messages.join(' ')), { message: 'WebSocket limitation surfaced to the user' });
    a.eq((await h.box({ type: 'tabInfo', tabId: await t.boxId() })).status.level, 'warn');
  }, mv3Only);

  R.test('MV3: isolation state is rebuilt from storage after a service-worker restart', async (ctx, a) => {
    // A real worker termination cannot be provoked under puppeteer (it holds the worker open, and a DevTools-stopped worker never restarts),
    // so the restart path itself is exercised: drop every in-memory structure, then rebuild exactly as a fresh worker does at start-up.
    const acc = (await h.createAccount(A, 'Survivor')).id;
    const t = await h.openIn(acc, url()); await h.login(t, 'sw-survivor');
    const def = await h.openIn(null, url());
    const id = await t.boxId();
    const sessions = await h.box({ type: 'test:platform', call: 'simulateRestart' });
    a.ok(sessions.includes(id), 'account tab re-attached after the rebuild: ' + JSON.stringify(sessions));
    await waitFor(async () => (await h.readState(t)).server.user === 'sw-survivor', { message: 'account session intact after the rebuild', timeout: 20000 });
    a.eq((await h.readState(def)).server.user, null, 'default session untouched');
    a.eq((await h.tabAccount(t))?.accountId, acc, 'tab mapping restored from storage.session');
    await t.eval(() => { document.cookie = 'after=restart; path=/'; });
    a.eq(await t.eval(() => document.cookie.includes('after=restart')), true, 'JS cookies still virtualised');
    a.eq((await h.readState(def)).documentCookie, '', 'and not leaking into the real jar');
    await t.goto(url());
    a.eq((await h.readState(t)).server.user, 'sw-survivor', 'navigation after the rebuild is still isolated');
  }, mv3Only);
}
