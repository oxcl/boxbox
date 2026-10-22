import { waitFor } from '../lib/framework.mjs';
import { startHttpProxy, startSocks5 } from '../../fixture/proxy.mjs';

// Exit address check: the fixture reports the *source address* of each connection. Direct = 127.0.0.1;
// proxies bind their outgoing connections to 127.0.0.2 / .3 / .4.
export default function (R, h, drv) {
  const SVC = 'auto:fixture.test';
  const echo = (p = '/') => h.url('echo.fixture.test', p);
  const remote = (t) => t.eval(() => document.getElementById('remote')?.textContent);

  const withProxies = async (fn) => {
    const http = await startHttpProxy({ bind: '127.0.0.2' });
    const socks = await startSocks5({ bind: '127.0.0.3' });
    const authed = await startHttpProxy({ bind: '127.0.0.4', auth: { user: 'u1', pass: 'p1' } });
    try { return await fn({ http, socks, authed }); } finally { await Promise.all([http.close(), socks.close(), authed.close()]); }
  };
  const mk = (name, px) => h.createAccount(SVC, name, { proxy: px });

  R.test('proxy: each account exits through its own proxy (HTTP, SOCKS5, authenticated HTTP); default stays direct', async (ctx, a) => {
    await withProxies(async ({ http, socks, authed }) => {
      const p1 = (await mk('HTTP', { type: 'http', host: '127.0.0.1', port: http.port })).id;
      const p2 = (await mk('SOCKS', { type: 'socks5', host: '127.0.0.1', port: socks.port })).id;
      const p3 = (await mk('Auth', { type: 'http', host: '127.0.0.1', port: authed.port, username: 'u1', password: 'p1' })).id;
      const p0 = (await mk('Plain')).id;

      // Firefox applies all of them at once. Chrome has one browser-wide proxy, so accounts of the *same* service are checked one
      // after another (two proxied accounts on the same hosts at the same time is flagged by the next test).
      const solo = async (t) => { if (ctx.name !== 'firefox') { await t.close(); await new Promise((r) => setTimeout(r, 400)); } };
      const t1 = await h.openIn(p1, echo());
      a.eq(await remote(t1), '127.0.0.2', 'HTTP proxy exit address'); await solo(t1);
      const t2 = await h.openIn(p2, echo());
      a.eq(await remote(t2), '127.0.0.3', 'SOCKS5 proxy exit address'); await solo(t2);
      const t3 = await h.openIn(p3, echo());
      a.eq(await remote(t3), '127.0.0.4', 'authenticated proxy exit address'); await solo(t3);
      a.ok(authed.log.some((l) => l.authed), 'credentials were presented to the proxy');
      const t0 = await h.openIn(p0, echo());
      if (ctx.name === 'firefox') a.eq(await remote(t0), '127.0.0.1', 'account without proxy is direct');
      a.ok(socks.log.some((l) => l.kind === 'connect' && l.atyp === 3), 'SOCKS5 got the hostname (DNS is resolved by the proxy, no leak)');
      a.ok(http.log.some((l) => /echo\.fixture\.test/.test(l.host)), 'HTTP proxy got the hostname');

      if (ctx.name === 'firefox') {
        // exact: the default session and the unproxied account are untouched while proxied tabs are open
        const def = await h.openIn(null, echo());
        a.eq(await remote(def), '127.0.0.1', 'default session is direct while proxied accounts are open');
        await t1.goto(echo('/?again'));
        a.eq(await remote(t1), '127.0.0.2');
        a.eq(await remote(t0), '127.0.0.1', 'unproxied account unaffected');
        const st = await h.box({ type: 'tabInfo', tabId: await t1.boxId() });
        a.eq(st.status.level, 'ok', 'Firefox guarantees the proxy: no warning');
      }
    });
  });

  const chromeOnly = { skip: (ctx) => ctx.name === 'firefox' && 'Chrome-only: Firefox applies proxies exactly per account' };
  R.test('proxy (Chrome): two proxied accounts on the same service conflict — flagged, not silent', async (ctx, a) => {
    await withProxies(async ({ http, socks }) => {
      const p1 = (await mk('HTTP', { type: 'http', host: '127.0.0.1', port: http.port })).id;
      const p2 = (await mk('SOCKS', { type: 'socks5', host: '127.0.0.1', port: socks.port })).id;
      const t1 = await h.openIn(p1, echo());
      const t2 = await h.openIn(p2, echo());
      const i2 = await h.box({ type: 'tabInfo', tabId: await t2.boxId() });
      a.eq(i2.status.level, 'warn', JSON.stringify(i2.status));
      a.ok(/another proxied account/i.test(i2.status.messages.join(' ')), i2.status.messages.join(' | '));
      a.eq(await remote(t2), '127.0.0.2', 'the first account to claim the hosts wins (documented limitation)');
    });
  }, chromeOnly);

  R.test('proxy: a dead proxy fails closed (the request is not sent directly)', async (ctx, a) => {
    const acc = (await mk('Dead', { type: 'http', host: '127.0.0.1', port: 1 })).id;
    const tab = await h.open(h.url('ctl.localhost', '/blank'));
    const id = await tab.boxId();
    await h.fxLogReset();
    await h.box({ type: 'setTabAccount', tabId: id, accountId: acc, url: echo('/dead') });   // no waiting for load: it must fail
    await new Promise((r) => setTimeout(r, 2500));
    const log = await h.fxLog();
    a.ok(!log.some((l) => l.host === 'echo.fixture.test'), 'nothing reached the server directly: ' + JSON.stringify(log.filter((l) => l.host === 'echo.fixture.test')));
    if (ctx.name !== 'firefox') {
      const tabs = (await h.box({ type: 'test:tabs' })).filter((t) => t.state && t.state.accountId === acc);
      const info = await h.box({ type: 'tabInfo', tabId: tabs[0].id });
      a.eq(info.status.level, 'fail', 'Chrome surfaces the failure: ' + JSON.stringify(info.status));
    }
  });

  R.test('proxy (Chrome): shared hosts and late-discovered third-party hosts raise a warning, never silence', async (ctx, a) => {
    await withProxies(async ({ http }) => {
      const p1 = (await mk('HTTP', { type: 'http', host: '127.0.0.1', port: http.port })).id;
      const t1 = await h.openIn(p1, echo('/leak'));
      await waitFor(async () => (await t1.eval(() => document.getElementById('leak-remote')?.textContent)) !== 'pending', { message: 'third-party fetch' });
      const leak = await t1.eval(() => document.getElementById('leak-remote').textContent);
      const info = await h.box({ type: 'tabInfo', tabId: await t1.boxId() });
      a.eq(info.status.level, 'warn', 'warning state: ' + JSON.stringify(info.status));
      a.ok(/leak\.third\.test/.test(info.status.messages.join(' ')), 'names the host that may have connected directly');
      // after the PAC learned the host, a reload is routed through the proxy
      await new Promise((r) => setTimeout(r, 400));
      await t1.goto(echo('/leak'));
      await waitFor(async () => (await t1.eval(() => document.getElementById('leak-remote')?.textContent)) !== 'pending', { message: 'third-party fetch (2)' });
      a.eq(await t1.eval(() => document.getElementById('leak-remote').textContent), '127.0.0.2', 'learned host is proxied on the next load (first contact was ' + leak + ')');
      // a default-session tab on the same host shares the browser-wide proxy: the account must say so
      const def = await h.openIn(null, echo());
      const info2 = await h.box({ type: 'tabInfo', tabId: await t1.boxId() });
      a.eq(info2.status.level, 'warn');
      a.ok(/other tab/.test(info2.status.messages.join(' ')), 'explains the sharing: ' + info2.status.messages.join(' | '));
      const badge = await h.box({ type: 'test:platform', call: 'badge', args: { tabId: await t1.boxId() } });
      a.eq(badge, '!', 'toolbar badge shows the warning');
      // popup shows the warning for this tab
      await drv.control.eval((q) => window.postMessage({ __boxFrame: 'popup.html?tab=' + q, w: 380, h: 640 }, '*'), await t1.boxId());
      await waitFor(async () => drv.control.frameEval('popup.html', () => !!document.querySelector('.banner.warn')), { message: 'warning banner in popup' });
    });
  }, chromeOnly);
}
