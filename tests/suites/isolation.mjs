import { waitFor, sleep } from '../lib/framework.mjs';

export default function (R, h) {
  R.test('three tabs / three accounts / default: every storage type isolated', async (ctx, a) => {
    const ids = [];
    for (const n of ['Alice acct', 'Bob acct', 'Carol acct']) ids.push((await h.createAccount('fx-alpha', n)).id);
    const url = h.url('alpha.localhost', '/blank');
    const tabs = [];
    for (const id of ids) tabs.push(await h.openIn(id, url));
    const def = await h.openIn(null, url);
    const users = ['alice', 'bob', 'carol'];
    for (let i = 0; i < 3; i++) await h.login(tabs[i], users[i]);

    for (let i = 0; i < 3; i++) {
      const s = await h.readState(tabs[i]);
      const u = users[i];
      a.eq(s.server.user, u, `tab ${i} server (HttpOnly cookie)`);
      a.eq(s.server.userc, u, `tab ${i} plain cookie seen by server`);
      a.eq(s.cookie, u, `tab ${i} document.cookie`);
      a.eq(s.ls, u, `tab ${i} localStorage`);
      a.eq(s.ss, u, `tab ${i} sessionStorage`);
      a.eq(s.idb, u, `tab ${i} IndexedDB`);
      a.eq(s.cache, u, `tab ${i} Cache Storage`);
      if (ctx.name === 'firefox') a.eq(s.sw, u, `tab ${i} service worker`);
      else a.ok(s.sw === null || s.sw === u, `tab ${i} service worker is never another account's (${s.sw})`);
      const tp = await tabs[i].frameEval('/widget', () => document.getElementById('who').textContent);
      a.eq(tp, 'widget:' + u, `tab ${i} third-party cookie in iframe`);
      a.ok(!s.lsKeys.some((k) => k.includes('box')), 'no extension junk visible in localStorage keys ' + JSON.stringify(s.lsKeys));
    }
    const sd = await h.readState(def);
    a.eq(sd.server.user, null, 'default session logged out');
    a.eq(sd.ls, null); a.eq(sd.cookie, null); a.eq(sd.idb, null); a.eq(sd.cache, null);
    // and the other tabs were not reloaded / disturbed: still logged in
    a.eq((await h.readState(tabs[0])).server.user, 'alice');
  });

  R.test('default session is unaffected by accounts (and vice versa)', async (ctx, a) => {
    const acc = (await h.createAccount('fx-alpha', 'Work')).id;
    const url = h.url('alpha.localhost', '/blank');
    const def = await h.openIn(null, url);
    await h.login(def, 'defaultuser');
    const t = await h.openIn(acc, url);
    a.eq((await h.readState(t)).server.user, null, 'account tab does not see the default login');
    await h.login(t, 'acctuser');
    a.eq((await h.readState(def)).server.user, 'defaultuser');
    a.eq((await h.readState(def)).ls, 'defaultuser');
    await def.goto(url);
    a.eq((await h.readState(def)).server.user, 'defaultuser', 'default still logged in after reload');
    await h.logout(def);   // Cache Storage is not covered by Firefox's browsingData wipe used between tests
  });
}
