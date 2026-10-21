import { waitFor } from '../lib/framework.mjs';

export default function (R, h, drv) {
  const A = 'fx-alpha';

  R.test('deleting an account wipes its data and returns its tabs to the default session', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'Doomed')).id;
    const url = h.url('alpha.localhost', '/blank');
    const t = await h.openIn(acc, url);
    await h.login(t, 'victim');
    const s = await h.readState(t);
    a.eq(s.ls, 'victim'); a.eq(s.idb, 'victim');
    const cs = (await h.state()).accounts[acc].cookieStoreId;
    await h.box({ type: 'deleteAccount', id: acc });
    a.eq(Object.keys((await h.state()).accounts).length, 0, 'account gone');
    if (ctx.name === 'firefox') {
      const containers = await h.box({ type: 'test:platform', call: 'containers' });
      a.ok(!containers.some((c) => c.cookieStoreId === cs), 'container removed');
    }
    // the tab survived in the default session at the same URL and has no trace of the account
    const t2 = await waitFor(async () => { for (const x of await drv.allTabs()) if ((await x.url()).startsWith(url)) return x; }, { message: 'tab back in default session', timeout: 12000 });
    await new Promise((r) => setTimeout(r, 500));
    const s2 = await h.readState(t2);
    a.eq(s2.server.user, null); a.eq(s2.ls, null); a.eq(s2.idb, null); a.eq(s2.cache, null); a.eq(s2.cookie, null);
    // a new account with the same name starts empty
    const acc2 = (await h.createAccount(A, 'Doomed')).id;
    const t3 = await h.openIn(acc2, url);
    const s3 = await h.readState(t3);
    a.eq(s3.server.user, null); a.eq(s3.ls, null); a.eq(s3.idb, null); a.eq(s3.cache, null);
    if (ctx.name === 'firefox') {
      const old = await h.box({ type: 'test:platform', call: 'cookies', args: { cookieStoreId: cs } });
      a.ok(old.err || old.length === 0, 'no cookies left in the old store');
    }
  });
}
