// Firefox: native isolation via contextual identities (containers).
import { ext, sleep } from '../core/ext.js';
import { nearest, FF_COLORS, FF_ICONS } from '../core/model.js';
import { isWebUrl } from '../core/services.js';

const DEFAULT_CS = 'firefox-default';

export class FirefoxPlatform {
  constructor() {
    this.csToAccount = new Map();   // cookieStoreId -> accountId
    this.chains = new Map();        // requestId -> userInitiated
    this.pending = [];              // expected navigations of tabs we created: {cs, url, state}
    this.groups = new Map();        // accountId+windowId -> groupId
  }

  // ---------------------------------------------------------------- lifecycle
  async init(c) {
    this.c = c;
    await this.syncContainers();
    await this.scanTabs();

    ext.webRequest.onBeforeRequest.addListener((d) => this.onMainFrame(d), { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] }, ['blocking']);
    const done = (d) => this.chains.delete(d.requestId);
    ext.webRequest.onCompleted.addListener(done, { urls: ['<all_urls>'], types: ['main_frame'] });
    ext.webRequest.onErrorOccurred.addListener(done, { urls: ['<all_urls>'], types: ['main_frame'] });

    ext.tabs.onCreated.addListener((t) => this.onTabCreated(t));
    ext.tabs.onRemoved.addListener((id) => c.dropTab(id));
    ext.tabs.onUpdated.addListener((id, info, tab) => { if (info.status === 'complete' || info.url) this.pushIdentity(id); });
    ext.tabs.onActivated?.addListener?.(({ tabId }) => this.pushIdentity(tabId));

    // Per-account proxy: decided from the container of the requesting tab.
    ext.proxy.onRequest.addListener((d) => this.onProxy(d), { urls: ['<all_urls>'] });
    ext.webRequest.onAuthRequired.addListener((d) => this.onAuth(d), { urls: ['<all_urls>'] }, ['blocking']);
    ext.proxy.onError?.addListener?.((e) => console.warn('proxy error', e));

    ext.contextualIdentities.onRemoved?.addListener?.(async ({ contextualIdentity }) => { this.csToAccount.delete(contextualIdentity.cookieStoreId); });
  }

  async syncContainers() {
    const c = this.c;
    let ids = [];
    try { ids = await ext.contextualIdentities.query({}); } catch (e) { console.error('containers unavailable', e); }
    const byCs = new Map(ids.map((i) => [i.cookieStoreId, i]));
    for (const acc of Object.values(c.accounts)) {
      let ci = acc.cookieStoreId && byCs.get(acc.cookieStoreId);
      if (!ci) {
        const extra = await this.accountCreated(acc);
        await c.store.update((s) => { Object.assign(s.accounts[acc.id], extra); });
        acc.cookieStoreId = extra.cookieStoreId;
      }
      this.csToAccount.set(acc.cookieStoreId, acc.id);
    }
  }

  async scanTabs() {
    const tabs = await ext.tabs.query({});
    for (const t of tabs) this.adopt(t);
  }

  accountForCs(cs) { return this.csToAccount.get(cs) || null; }
  isForeign(tab) { return tab.incognito || (tab.cookieStoreId && tab.cookieStoreId !== DEFAULT_CS && !this.csToAccount.has(tab.cookieStoreId)); }

  adopt(tab) {
    if (this.isForeign(tab)) return;
    const accountId = this.accountForCs(tab.cookieStoreId);
    const home = isWebUrl(tab.url || '') ? this.c.serviceOfUrl(tab.url) : null;
    if (!this.c.tabs.has(tab.id)) this.c.setTab(tab.id, { accountId, home, flow: null });
    else if (this.c.getTab(tab.id).accountId !== accountId) this.c.setTab(tab.id, { accountId });
  }

  async onTabCreated(tab) {
    if (this.isForeign(tab)) return;
    const accountId = this.accountForCs(tab.cookieStoreId);
    if (this.c.tabs.has(tab.id)) return;
    let st = { accountId, home: null, flow: null };
    const opener = tab.openerTabId != null ? this.c.tabs.get(tab.openerTabId) : null;
    if (opener && opener.accountId === accountId) st = { accountId, home: opener.home, flow: null };
    // popup windows opened by an account page: remember that the first hop is a flow
    this.c.setTab(tab.id, st);
  }

  // ---------------------------------------------------------------- navigation
  async userInitiated(d, tab) {
    if (!d.originUrl) return true;                                // typed, bookmark, history, new tab page
    if (/^(moz-extension|about|chrome|resource):/.test(d.originUrl)) return true;
    const askers = [d.tabId, tab && tab.openerTabId].filter((x) => x != null);
    for (const id of askers) {
      try {
        const r = await ext.tabs.sendMessage(id, { box: true, type: 'gesture?' });
        if (r && r.recent) return true;
      } catch { /* no content script */ }
    }
    return false;
  }

  async isPopupWindow(tab) {
    try { return (await ext.windows.get(tab.windowId)).type === 'popup'; } catch { return false; }
  }

  async onMainFrame(d) {
    try {
      if (d.tabId < 0) return {};
      const c = this.c;
      // Navigations we started ourselves (tab replacement) are pre-approved.
      const pi = this.pending.findIndex((p) => p.url === d.url);
      let tab;
      try { tab = await ext.tabs.get(d.tabId); } catch { return {}; }
      if (this.isForeign(tab)) return {};
      if (pi >= 0 && this.pending[pi].cs === (tab.cookieStoreId || DEFAULT_CS)) {
        const p = this.pending.splice(pi, 1)[0];
        c.setTab(d.tabId, p.state);
        return {};
      }
      this.adopt(tab);
      let user;
      if (this.chains.has(d.requestId)) user = this.chains.get(d.requestId);
      else {
        user = await this.userInitiated(d, tab);
        // window.open() popups and tabs opened by an account page start a flow, not a user navigation
        if (user && tab.openerTabId != null && (await this.isPopupWindow(tab))) user = false;
        this.chains.set(d.requestId, user);
      }
      const dec = c.decideNavigation({ tabId: d.tabId, url: d.url, userInitiated: user });
      if (dec.type === 'stay') return {};
      if (dec.type === 'ask') { this.showPicker(d.tabId, d.url, dec.serviceId); return { cancel: true }; }
      if (dec.type === 'move') { this.moveTab(d.tabId, dec.accountId, { url: d.url, reason: dec.why, home: dec.home }); return { cancel: true }; }
    } catch (e) { console.error('onMainFrame', e); }
    return {};
  }

  // ---------------------------------------------------------------- tab operations
  async showPicker(tabId, url, serviceId) {
    this.c.pickerFor.set(tabId, { url, serviceId });
    await ext.tabs.update(tabId, { url: ext.runtime.getURL(`picker.html?tab=${tabId}`) });
  }

  /** Re-open `tabId` in `accountId`'s container (null = default session). Returns the id of the resulting tab. */
  async moveTab(tabId, accountId, { url, home, explicit } = {}) {
    const c = this.c;
    const tab = await ext.tabs.get(tabId);
    const cs = accountId ? c.accounts[accountId].cookieStoreId : DEFAULT_CS;
    const target = url || tab.url;
    const web = isWebUrl(target);
    const home2 = home !== undefined ? home : (web ? c.serviceOfUrl(target) : c.getTab(tabId).home);
    const state = { accountId: accountId || null, home: home2, flow: null };
    if ((tab.cookieStoreId || DEFAULT_CS) === cs) {
      c.setTab(tabId, state);
      if (web) { this.pending.push({ cs, url: target, state }); await ext.tabs.update(tabId, { url: target }); }
      this.pushIdentity(tabId);
      return tabId;
    }
    const props = { cookieStoreId: cs, windowId: tab.windowId, index: tab.index + 1, active: tab.active, pinned: tab.pinned };
    if (web) { props.url = target; this.pending.push({ cs, url: target, state }); }
    const nt = await ext.tabs.create(props);
    c.setTab(nt.id, state);
    setTimeout(() => { this.pending = this.pending.filter((p) => !(p.cs === cs && p.url === target)); }, 8000);
    await ext.tabs.remove(tabId);
    c.dropTab(tabId);
    this.pushIdentity(nt.id);
    this.updateGroups();
    return nt.id;
  }

  // ---------------------------------------------------------------- account lifecycle
  ffColor(acc) { return nearest(acc.color, FF_COLORS); }
  ffIcon(acc) { return FF_ICONS[acc.icon] || 'circle'; }

  async accountCreated(acc) {
    const ci = await ext.contextualIdentities.create({ name: `Box · ${acc.name}`, color: this.ffColor(acc), icon: this.ffIcon(acc) });
    this.csToAccount.set(ci.cookieStoreId, acc.id);
    return { cookieStoreId: ci.cookieStoreId };
  }
  async accountUpdated(acc) {
    if (acc.cookieStoreId) await ext.contextualIdentities.update(acc.cookieStoreId, { name: `Box · ${acc.name}`, color: this.ffColor(acc), icon: this.ffIcon(acc) });
    for (const [id, t] of this.c.tabs) if (t.accountId === acc.id) this.pushIdentity(id);
    return {};
  }
  async accountDeleted(acc) {
    const cs = acc.cookieStoreId;
    if (!cs) return;
    try {
      await ext.browsingData.remove({ cookieStoreId: cs }, { cookies: true, localStorage: true, indexedDB: true, serviceWorkers: true, cache: true, formData: true });
    } catch (e) { console.warn('browsingData.remove', e); }
    await ext.contextualIdentities.remove(cs);
    this.csToAccount.delete(cs);
  }
  async accountsChanged() { this.updateGroups(); }
  async settingsChanged() { for (const id of this.c.tabs.keys()) this.pushIdentity(id); this.updateGroups(); }

  // ---------------------------------------------------------------- identity
  async pushIdentity(tabId) {
    try { await ext.tabs.sendMessage(tabId, { box: true, type: 'identity', identity: this.c.identityFor(tabId) }); } catch { /* no content script yet */ }
  }
  tabChanged(tabId) { this.pushIdentity(tabId); }

  status(tabId, tab) {
    const acc = tab.accountId ? this.c.accounts[tab.accountId] : null;
    if (acc && acc.proxy) return { level: 'ok', messages: [`Traffic of this account is routed through ${acc.proxy.type}://${acc.proxy.host}:${acc.proxy.port} (guaranteed: only this account's tabs).`] };
    return { level: 'ok', messages: [] };
  }

  async updateGroups() {
    if (!ext.tabs.group || !ext.tabGroups) return;
    try {
      if (!this.c.state.settings.tabGroups) return;
      const tabs = await ext.tabs.query({});
      const byKey = new Map();
      for (const t of tabs) {
        const st = this.c.tabs.get(t.id);
        if (!st || !st.accountId || t.incognito) continue;
        const key = st.accountId + '@' + t.windowId;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(t);
      }
      for (const [key, list] of byKey) {
        const acc = this.c.accounts[list[0] && this.c.tabs.get(list[0].id).accountId];
        if (!acc) continue;
        const ungrouped = list.filter((t) => t.groupId === -1 || t.groupId === undefined);
        if (!ungrouped.length) continue;
        const existing = list.find((t) => t.groupId >= 0);
        const gid = await ext.tabs.group(existing ? { tabIds: ungrouped.map((t) => t.id), groupId: existing.groupId } : { tabIds: ungrouped.map((t) => t.id) });
        await ext.tabGroups.update(gid, { title: acc.name, color: nearest(acc.color, { grey: '#9aa0a6', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#188038', pink: '#d01884', purple: '#9334e6', cyan: '#007b83', orange: '#e8710a' }) });
      }
    } catch (e) { /* tab groups unavailable */ }
  }

  async testCall(call, args) {
    if (call === 'containers') return ext.contextualIdentities.query({});
    if (call === 'cookies') { try { return await ext.cookies.getAll({ cookieStoreId: args.cookieStoreId }); } catch (e) { return { err: String(e) }; } }
    if (call === 'wipeDefault') {
      await ext.browsingData.remove({ since: 0 }, { cookies: true, localStorage: true, indexedDB: true, serviceWorkers: true, cache: true });
      if (args && args.origins && args.origins.length) {
        await ext.browsingData.remove({ origins: args.origins }, { cookies: true, localStorage: true, indexedDB: true, serviceWorkers: true, cache: true });
      }
      return true;
    }
    if (call === 'groups') return ext.tabGroups ? ext.tabGroups.query({}) : null;
    return null;
  }

  // ---------------------------------------------------------------- proxy
  proxyFor(cs) {
    const accId = this.accountForCs(cs);
    const acc = accId && this.c.accounts[accId];
    return acc && acc.proxy ? acc : null;
  }
  onProxy(d) {
    const acc = this.proxyFor(d.cookieStoreId);
    if (!acc) return { type: 'direct' };
    const p = acc.proxy;
    const info = { type: p.type === 'socks5' ? 'socks' : p.type, host: p.host, port: p.port, proxyDNS: true, failoverTimeout: 1 };
    if (p.type === 'socks5' && p.username) { info.username = p.username; info.password = p.password; }
    return [info];   // no direct fallback: a dead proxy fails the request instead of leaking the IP
  }
  onAuth(d) {
    if (!d.isProxy) return {};
    const acc = this.proxyFor(d.cookieStoreId);
    if (!acc || !acc.proxy.username) return {};
    return { authCredentials: { username: acc.proxy.username, password: acc.proxy.password } };
  }
}
