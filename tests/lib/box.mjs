// Browser-independent helpers on top of a driver (firefox.mjs / chrome.mjs).
import { waitFor, sleep } from './framework.mjs';

export class BoxHelper {
  constructor(drv, fixture) { this.drv = drv; this.fx = fixture; }
  url(host, p = '/') { return this.fx.url(host, p); }
  box(m) { return this.drv.box(m); }

  async state() { return this.box({ type: 'test:state' }); }
  async reset() { await this.box({ type: 'test:reset' }); }

  async createAccount(serviceId, name, extra = {}) {
    return this.box({ type: 'createAccount', serviceId, name, ...extra });
  }

  /** Open a tab at url in the default session (browser-initiated navigation, like typing a URL). */
  async open(url) { return this.drv.newTab(url); }

  /** Put the tab into the account (like choosing it in the popup). Returns the (possibly new) tab. */
  async switchTo(tab, accountId, url) { return this.drv.moveTab(tab, accountId, url); }

  /** Open `url` directly inside an account (nothing is ever loaded in the default session first). */
  async openIn(accountId, url) {
    if (!accountId) return this.open(url);
    const t = await this.open(this.fx.url('ctl.localhost', '/blank'));
    return this.switchTo(t, accountId, url);
  }

  /** Log the page in as `user` (writes every storage type) and wait for the banner. */
  async login(tab, user) {
    await tab.eval(async (u) => { await window.Fx.login(u); }, user);
    await waitFor(async () => (await tab.eval(() => document.getElementById('banner')?.dataset.user)) === user, { message: `banner shows ${user}` });
  }
  async logout(tab) { await tab.eval(() => window.Fx.logout()); }

  async readState(tab) { return tab.eval(() => window.Fx.readState()); }

  async banner(tab) { return tab.eval(() => document.getElementById('banner')?.textContent); }

  async fxLog() { const r = await fetch(this.fx.url('ctl.localhost', '/log')); return r.json(); }
  async fxLogReset() { await fetch(this.fx.url('ctl.localhost', '/reset')); }

  /** Which Box account (id) is the tab in, according to the extension. */
  async tabAccount(tab) {
    const id = await tab.boxId();
    const st = await this.state();
    const e = st.tabs.find(([tid]) => tid === id);
    return e ? e[1] : null;
  }
}

/** Click an element and report what the browser did: navigated in place, replaced the tab, or opened another tab. */
BoxHelper.prototype.clickFollow = async function (tab, sel, { timeout = 8000 } = {}) {
  const drv = this.drv;
  const before = await drv.handles();
  const u0 = await tab.url();
  await tab.click(sel);
  return waitFor(async () => {
    const cur = await drv.handles();
    const added = cur.filter((x) => !before.includes(x));
    const removed = before.filter((x) => !cur.includes(x));
    if (removed.includes(tab.handle ?? tab.id) && added.length) return { tab: drv.tabFromHandle(added[0]), replaced: true };
    if (added.length && !removed.length) return { tab, opened: drv.tabFromHandle(added[0]) };
    if (!removed.length && (await tab.url()) !== u0) return { tab };
    return null;
  }, { timeout, message: `effect of clicking ${sel}` });
};

BoxHelper.prototype.waitUrl = async function (tab, prefix, timeout = 8000) {
  return waitFor(async () => (await tab.url()).startsWith(prefix), { timeout, message: `url ${prefix}` });
};
BoxHelper.prototype.service = async function (url) { return (await this.box({ type: 'resolve', url })); };
