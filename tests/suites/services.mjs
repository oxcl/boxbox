import { waitFor } from '../lib/framework.mjs';

export default function (R, h) {
  const A = 'fx-alpha';
  const svc = async (host) => (await h.service(h.url(host, '/')))?.id;

  R.test('automatic fallback: unlisted sites are services keyed by registrable domain', async (ctx, a) => {
    a.eq(await svc('gamma.localhost'), 'auto:gamma.localhost');
    a.eq(await svc('x.y.gamma.localhost'), 'auto:gamma.localhost');
    a.not(await svc('delta.localhost'), await svc('gamma.localhost'));
  });

  R.test('built-in catalog groups many domains into one service', async (ctx, a) => {
    for (const host of ['alpha.localhost', 'mail.alpha.localhost', 'video.alpha.localhost', 'accounts.alpha.localhost', 'alpha-static.localhost']) a.eq(await svc(host), A, host);
    const r = await h.box({ type: 'resolve', url: 'https://www.reddit.com/r/x' });
    a.eq(r.id, 'reddit'); a.eq((await h.box({ type: 'resolve', url: 'https://old.reddit.com/' })).id, 'reddit');
    a.eq((await h.box({ type: 'resolve', url: 'https://accounts.google.com/' })).id, 'google');
    a.eq((await h.box({ type: 'resolve', url: 'https://i.ytimg.com/' })).id, 'google');
    a.eq((await h.box({ type: 'resolve', url: 'https://gist.github.com/' })).id, 'github');
  });

  R.test('user edit: merging a domain into a service overrides the automatic layer', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'M')).id;
    await h.box({ type: 'serviceEdit', op: 'assign', args: { id: A, domains: ['delta.localhost'] } });
    a.eq(await svc('delta.localhost'), A);
    const t = await h.openIn(acc, h.url('alpha.localhost', '/blank'));
    await t.goto(h.url('delta.localhost', '/blank'));
    a.eq((await h.tabAccount(t))?.accountId, acc, 'delta is part of Alpha now: the tab stays in the account');
  });

  R.test('user edit: splitting a domain out of a catalog service overrides the catalog', async (ctx, a) => {
    const acc = (await h.createAccount(A, 'S')).id;
    const r = await h.box({ type: 'serviceEdit', op: 'split', args: { name: 'Alpha Video', domains: ['video.alpha.localhost'] } });
    a.not(await svc('video.alpha.localhost'), A);
    a.eq(await svc('mail.alpha.localhost'), A, 'other sub-domains are untouched');
    const t = await h.openIn(acc, h.url('alpha.localhost', '/blank'));
    await t.gotoMayReplace(h.url('video.alpha.localhost', '/blank'));       // now another service -> leaves the account
    let v; await waitFor(async () => { for (const x of await ctx.drv.allTabs()) if ((await x.url()).startsWith(h.url('video.alpha.localhost'))) { v = x; return true; } }, { message: 'video tab' });
    a.eq((await h.tabAccount(v))?.accountId, null);
  });

  R.test('user edit: create, rename and delete a service; user edits beat the catalog on rename', async (ctx, a) => {
    const c = await h.box({ type: 'serviceEdit', op: 'create', args: { name: 'Mine', domains: ['gamma.localhost'] } });
    a.eq(await svc('gamma.localhost'), c.id);
    await h.box({ type: 'serviceEdit', op: 'rename', args: { id: c.id, name: 'Renamed' } });
    a.eq((await h.service(h.url('gamma.localhost'))).name, 'Renamed');
    await h.box({ type: 'serviceEdit', op: 'rename', args: { id: A, name: 'My Alpha' } });
    a.eq((await h.service(h.url('alpha.localhost'))).name, 'My Alpha');
    await h.box({ type: 'serviceEdit', op: 'delete', args: { id: c.id } });
    a.eq(await svc('gamma.localhost'), 'auto:gamma.localhost', 'falls back to automatic');
  });

  R.test('merging two services moves accounts along', async (ctx, a) => {
    const acc = (await h.createAccount('fx-beta', 'BetaAcc')).id;
    await h.box({ type: 'serviceEdit', op: 'merge', args: { from: 'fx-beta', to: A } });
    a.eq(await svc('beta.localhost'), A);
    const st = await h.state();
    a.eq(st.accounts[acc].serviceId, A);
  });
}
