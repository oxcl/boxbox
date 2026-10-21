import { waitFor, sleep } from '../lib/framework.mjs';

export default function (R, h) {
  const A = 'fx-alpha';
  const mk = async (name = 'Acct') => (await h.createAccount(A, name)).id;

  R.test('navigating between domains of one service keeps the account', async (ctx, a) => {
    const acc = await mk();
    let t = await h.openIn(acc, h.url('alpha.localhost', '/links'));
    await h.login(t, 'alice');
    const r = await h.clickFollow(t, '#to-alpha-mail');
    a.ok(!r.replaced, 'same tab kept');
    await h.waitUrl(r.tab, h.url('mail.alpha.localhost'));
    t = r.tab;
    a.eq((await h.tabAccount(t))?.accountId, acc, 'still in the account after click to mail.alpha');
    a.eq((await h.readState(t)).server.user, 'alice', 'session visible on mail.alpha');
    await t.goto(h.url('video.alpha.localhost', '/blank'));          // typed URL, same service
    a.eq((await h.tabAccount(t))?.accountId, acc, 'typed URL to video.alpha keeps account');
    await t.goto(h.url('alpha-static.localhost', '/blank'));         // different *site*, same service (catalog)
    a.eq((await h.tabAccount(t))?.accountId, acc, 'alpha-static (other site, same service) keeps account');
    a.eq((await h.tabAccount(t))?.home, A);
  });

  R.test('user navigation to another service leaves the account', async (ctx, a) => {
    const acc = await mk();
    let t = await h.openIn(acc, h.url('alpha.localhost', '/links'));
    const r = await h.clickFollow(t, '#to-beta');
    await h.waitUrl(r.tab, h.url('beta.localhost'));
    a.eq((await h.tabAccount(r.tab))?.accountId, null, 'beta opened in the default session');
    // typed URL to an auto-service also leaves
    t = await h.openIn(acc, h.url('alpha.localhost', '/blank'));
    await t.gotoMayReplace(h.url('gamma.localhost', '/blank'));
    await waitFor(async () => { for (const x of await ctx.drv.allTabs()) { if ((await x.url()).startsWith(h.url('gamma.localhost'))) return true; } }, { message: 'gamma tab' });
    let gamma; for (const x of await ctx.drv.allTabs()) if ((await x.url()).startsWith(h.url('gamma.localhost'))) gamma = x;
    a.eq((await h.tabAccount(gamma))?.accountId, null, 'typed URL to other service leaves account');
  });

  R.test('page-initiated navigation (no user gesture) stays in the account', async (ctx, a) => {
    const acc = await mk();
    const t = await h.openIn(acc, h.url('alpha.localhost', '/blank'));
    await t.eval((u) => { setTimeout(() => { location.href = u; }, 10); }, h.url('beta.localhost', '/blank'));
    await h.waitUrl(t, h.url('beta.localhost'));
    a.eq((await h.tabAccount(t))?.accountId, acc, 'script redirect keeps the account');
    // ... and coming back to the home service is fine
    await t.eval((u) => { setTimeout(() => { location.href = u; }, 10); }, h.url('alpha.localhost', '/blank'));
    await h.waitUrl(t, h.url('alpha.localhost'));
    a.eq((await h.tabAccount(t))?.accountId, acc);
  });

  R.test('OAuth: redirect flow to another service and back stays in the account', async (ctx, a) => {
    const acc = await mk();
    const t = await h.openIn(acc, h.url('alpha.localhost', '/oauth/start?as=oauthbob'));
    const r = await h.clickFollow(t, '#signin-beta');
    await h.waitUrl(r.tab, h.url('alpha.localhost', '/oauth/callback'));
    a.ok(!r.replaced, 'no tab replacement during the flow');
    a.eq((await h.tabAccount(r.tab))?.accountId, acc);
    await waitFor(async () => (await h.readState(r.tab)).server.user === 'oauthbob', { message: 'callback session in account' });
    const def = await h.openIn(null, h.url('alpha.localhost', '/blank'));
    a.eq((await h.readState(def)).server.user, null, 'default session untouched by the flow');
  });

  R.test('popup (window.open) login stays inside the account', async (ctx, a) => {
    const acc = await mk();
    const t = await h.openIn(acc, h.url('alpha.localhost', '/popup-opener?user=popuser'));
    const before = await ctx.drv.handles();
    await t.click('#open-popup');
    await waitFor(async () => (await t.title()) === 'popup-done:popuser', { timeout: 10000, message: 'popup login completes' });
    a.eq((await h.readState(t)).server.user, 'popuser', 'opener sees the popup login');
    const def = await h.openIn(null, h.url('alpha.localhost', '/blank'));
    a.eq((await h.readState(def)).server.user, null, 'default session has no popup login');
  });

  R.test('embedded content (iframes) uses the tab\'s account', async (ctx, a) => {
    const [a1, a2] = [await mk('One'), await mk('Two')];
    const u = h.url('alpha.localhost', '/with-embed');
    const t1 = await h.openIn(a1, u + '?set=one');
    const t2 = await h.openIn(a2, u);
    const def = await h.openIn(null, u);
    const who = (t) => t.frameEvalAtIndex(0, () => document.getElementById('embed-who').textContent);
    a.eq(await who(t1), 'embed:one');
    a.eq(await who(t2), 'embed:anonymous', 'other account has its own beta jar');
    a.eq(await who(def), 'embed:anonymous', 'default session untouched');
    await t1.goto(u);
    a.eq(await who(t1), 'embed:one', 'cookie persisted in the account jar');
  });

  R.test('link opened in a new tab: same service inherits the account, other service does not', async (ctx, a) => {
    const acc = await mk();
    const t = await h.openIn(acc, h.url('alpha.localhost', '/links'));
    let r = await h.clickFollow(t, '#to-alpha-blank');
    const n1 = r.opened;
    await h.waitUrl(n1, h.url('mail.alpha.localhost'));
    a.eq((await h.tabAccount(n1))?.accountId, acc, 'new tab to same service inherits account');
    r = await h.clickFollow(t, '#to-beta-blank');
    const n2 = r.opened || r.tab;
    await waitFor(async () => { for (const x of await ctx.drv.allTabs()) if ((await x.url()).startsWith(h.url('beta.localhost'))) { n2.handle = x.handle; n2.id = x.id; return true; } }, { message: 'beta tab' });
    let beta; for (const x of await ctx.drv.allTabs()) if ((await x.url()).startsWith(h.url('beta.localhost'))) beta = x;
    a.eq((await h.tabAccount(beta))?.accountId, null, 'new tab to another service is not in the account');
  });

  R.test('switching one tab\'s account never affects other tabs', async (ctx, a) => {
    const [a1, a2] = [await mk('One'), await mk('Two')];
    const u = h.url('alpha.localhost', '/blank');
    const t1 = await h.openIn(a1, u); await h.login(t1, 'u1');
    const t2 = await h.openIn(a1, u);
    a.eq((await h.readState(t2)).server.user, 'u1', 'second tab in the same account shares the session');
    const t2b = await h.switchTo(t2, a2);
    a.eq((await h.tabAccount(t2b))?.accountId, a2);
    a.eq((await h.readState(t2b)).server.user, null, 'switched tab has the other account\'s (empty) session');
    a.eq((await h.readState(t1)).server.user, 'u1', 'untouched tab keeps its session');
    const t2c = await h.switchTo(t2b, null);
    a.eq((await h.tabAccount(t2c))?.accountId, null);
  });
}
