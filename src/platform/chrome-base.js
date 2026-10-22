// Shared by the Chrome MV2 and MV3 builds: virtual cookie jar, tab tracking, identity, wipe, proxy (PAC).
import { ext, sleep, uid, TARGET, IS_MV3 } from '../core/ext.js';
import { isWebUrl, hostOf } from '../core/services.js';
import { nearest, CHROME_GROUP_COLORS, ICON_EMOJI } from '../core/model.js';
import { Jar, requestContext } from '../chrome/jar.js';
import { ChromeProxy } from './chrome-proxy.js';

export const SYNC_PATH = '/__box_sync';
const pfxOf = (accId) => '__box_' + accId.replace(/^acc_/, '') + '__';
export const prefixFor = pfxOf;

/** Toolbar icon for an account: a rounded square in the account colour with its emoji (null when no canvas is available). */
function accountIconData(acc) {
  try {
    const out = {};
    for (const n of [16, 32]) {
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : document.createElement('canvas');
      cv.width = n; cv.height = n;
      const g = cv.getContext('2d'), r = n * 0.22;
      g.fillStyle = acc.color; g.beginPath(); g.moveTo(r, 0); g.arcTo(n, 0, n, n, r); g.arcTo(n, n, 0, n, r); g.arcTo(0, n, 0, 0, r); g.arcTo(0, 0, n, 0, r); g.fill();
      g.font = `${Math.round(n * 0.62)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ICON_EMOJI[acc.icon] || (acc.name || '?')[0].toUpperCase(), n / 2, n / 2 + n * 0.04);
      out[n] = g.getImageData(0, 0, n, n);
    }
    return out;
  } catch { return null; }
}

export class ChromeBase {
  constructor() {
    this.jar = new Jar();
    this.tabTop = new Map();          // tabId -> last top-level URL
    this.windowType = new Map();      // windowId -> 'normal' | 'popup' | ...
    this.tabMeta = new Map();         // tabId -> {opener, windowId}
    this.gestures = new Map();        // tabId -> timestamp (MV2: reported synchronously by content scripts)
    this.expect = new Map();          // tabId -> url we are about to navigate to ourselves
    this.saveTimers = new Map();
    this.wipeTabs = new Set();
    this.proxy = new ChromeProxy(this);
    this.readyP = new Promise((r) => { this.markReady = r; });
    // MV3: events that wake the service worker are only delivered to listeners registered synchronously at start-up, so the
    // MV3 build binds everything in its constructor and gates each handler on `readyP` (resolved when init() has finished).
    this.gateEvents = (fn) => (...a) => this.readyP.then(() => fn.apply(this, a)).catch((e) => console.error('event handler', e));
  }

  bindEvents(wrap = (f) => f) {
    this.eventsBound = true;
    ext.windows.onCreated.addListener(wrap((w) => this.windowType.set(w.id, w.type)));
    ext.windows.onRemoved.addListener(wrap((id) => this.windowType.delete(id)));
    ext.tabs.onCreated.addListener(wrap((t) => this.onTabCreated(t)));
    ext.tabs.onRemoved.addListener(wrap((id) => this.onTabRemoved(id)));
    ext.tabs.onUpdated.addListener(wrap((id, info) => { if (info.status === 'complete' || info.url) this.pushIdentity(id); }));
    ext.tabs.onActivated?.addListener?.(wrap(({ tabId }) => this.pushIdentity(tabId)));
    ext.webNavigation.onCreatedNavigationTarget?.addListener?.(wrap((d) => this.onNavTarget(d)));
    ext.webNavigation.onCommitted.addListener(wrap((d) => { if (d.frameId === 0) { this.tabTop.set(d.tabId, d.url); this.afterCommit(d); } }));
  }

  // ------------------------------------------------------------------ lifecycle
  async init(c) {
    this.c = c;
    await this.loadJars();
    for (const w of await ext.windows.getAll()) this.windowType.set(w.id, w.type);
    this.restoredTabs = new Set();
    for (const t of await ext.tabs.query({})) { this.trackTab(t, true); this.restoredTabs.add(t.id); }
    if (!this.eventsBound) this.bindEvents();

    await this.installNet();
    await this.proxy.init();
    this.markReady();
  }

  trackTab(t, initial = false) {
    this.tabMeta.set(t.id, { opener: t.openerTabId, windowId: t.windowId });
    if (t.url && isWebUrl(t.url)) this.tabTop.set(t.id, t.url);
    if (!this.c.tabs.has(t.id)) this.c.setTab(t.id, { accountId: null, home: isWebUrl(t.url || '') ? this.c.serviceOfUrl(t.url) : null, flow: null });
  }

  onTabCreated(t) {
    // NB: `openerTabId` is also set for tabs the user opens from the browser UI, so it is NOT used to inherit accounts;
    // page-initiated tabs and popups are recognised by webNavigation.onCreatedNavigationTarget instead.
    this.tabMeta.set(t.id, { opener: t.openerTabId, windowId: t.windowId });
    if (!this.c.tabs.has(t.id)) this.c.setTab(t.id, { accountId: null, home: null, flow: null });
  }
  onNavTarget(d) {
    if (this.c.getTab(d.tabId).accountId) return;
    const src = this.c.tabs.get(d.sourceTabId);
    if (src && src.accountId) { this.c.setTab(d.tabId, { accountId: src.accountId, home: src.home, flow: null }); this.accountAssigned(d.tabId, null, src.accountId); }
  }
  onTabRemoved(id) {
    const st = this.c.tabs.get(id);
    this.tabMeta.delete(id); this.tabTop.delete(id); this.gestures.delete(id); this.expect.delete(id);
    this.c.dropTab(id);
    if (st && st.accountId) { this.accountUnassigned(id, st.accountId); this.proxy.recompute?.(); }
  }
  afterCommit() {}

  // ------------------------------------------------------------------ jars
  async loadJars() {
    const all = await ext.storage.local.get(null);
    for (const [k, v] of Object.entries(all)) if (k.startsWith('jar:')) this.jar.load(k.slice(4), v);
  }
  jarDirty(accId) {
    clearTimeout(this.saveTimers.get(accId));
    this.saveTimers.set(accId, setTimeout(() => { if (this.c.accounts[accId]) ext.storage.local.set({ ['jar:' + accId]: this.jar.list(accId) }); }, 250));
  }
  async dropJar(accId) { this.jar.clear(accId); clearTimeout(this.saveTimers.get(accId)); await ext.storage.local.remove('jar:' + accId); }

  accountOf(tabId) { return tabId >= 0 ? this.c.getTab(tabId).accountId : null; }

  /** Cookie header value for a request of an account tab, or '' */
  cookieHeaderFor(accId, d) {
    const ctx = requestContext({ url: d.url, topUrl: this.tabTop.get(d.tabId), initiator: d.initiator, type: d.type, method: d.method || 'GET' });
    return this.jar.header(accId, d.url, { ctx });
  }
  storeSetCookies(accId, url, values) {
    let changed = false;
    for (const v of values) if (this.jar.setFromHeader(accId, url, v)) changed = true; else if (/max-age=0|expires=/i.test(v)) changed = true;
    if (changed) this.jarDirty(accId);
  }

  // ------------------------------------------------------------------ sync ops (shim <-> background)
  syncOp(tabId, frameId, q, extra = {}) {
    if (q.op === 'gesture') { this.gestures.set(tabId, Date.now()); return { ok: 1 }; }
    const accId = this.accountOf(tabId);
    if (!accId) return { acct: null };
    switch (q.op) {
      case 'sw': this.swControlled?.add(tabId); this.onServiceWorkerControl?.(tabId); return { ok: 1 };
      case 'hello': return { acct: accId, pfx: pfxOf(accId), proxied: !!this.c.accounts[accId]?.proxy, nonce: this.nonceFor?.(tabId, frameId, extra.parentFrameId) || '' };
      case 'c.get': return { v: this.jar.documentCookie(accId, q.u) };
      case 'c.list': return { v: this.jar.match(accId, q.u, { ctx: 'same', includeHttpOnly: false }) };
      case 'c.set': if (this.jar.setFromJs(accId, q.u, q.v)) this.jarDirty(accId); return { v: this.jar.documentCookie(accId, q.u) };
      case 'touch': this.touchOrigin(accId, q.o); return { ok: 1 };
      case 'gesture': this.gestures.set(tabId, Date.now()); return { ok: 1 };
      default: return { error: 'unknown op' };
    }
  }
  touchOrigin(accId, origin) {
    const o = this.c.state.origins[accId] || [];
    if (!origin || origin === 'null' || o.includes(origin)) return;
    this.c.store.update((s) => { (s.origins[accId] = s.origins[accId] || []).push(origin); });
  }

  // ------------------------------------------------------------------ navigation helpers
  hasRecentGesture(tabId) { const t = this.gestures.get(tabId); return !!t && Date.now() - t < 1500; }
  async queryGesture(tabId) {
    try { const r = await ext.tabs.sendMessage(tabId, { box: true, type: 'gesture?' }); return !!(r && r.recent); } catch { return false; }
  }
  isPopupTab(tabId) { const m = this.tabMeta.get(tabId); return !!(m && m.opener != null && this.windowType.get(m.windowId) === 'popup'); }

  pickerUrl(tabId) { return ext.runtime.getURL(`picker.html?tab=${tabId}`); }

  // ------------------------------------------------------------------ account lifecycle
  async accountCreated(acc) { return {}; }
  async accountUpdated(acc) {
    for (const [id, t] of this.c.tabs) if (t.accountId === acc.id) this.pushIdentity(id);
    this.proxy.recompute();
    this.updateGroups();
    return {};
  }
  async accountsChanged() { this.updateGroups(); this.proxy.recompute(); }
  async settingsChanged() { for (const id of this.c.tabs.keys()) this.pushIdentity(id); this.updateGroups(); }

  async accountDeleted(acc) {
    const origins = this.c.state.origins[acc.id] || [];
    const prefix = pfxOf(acc.id);
    await this.dropJar(acc.id);
    const pending = [];
    for (const origin of origins) {
      const ok = await this.wipeOrigin(origin, acc.id, prefix).catch(() => false);
      if (!ok) pending.push(origin);
    }
    if (pending.length) {
      const got = await ext.storage.local.get('pendingWipes');
      const pw = got.pendingWipes || {};
      for (const o of pending) (pw[o] = pw[o] || []).push({ accountId: acc.id, prefix });
      await ext.storage.local.set({ pendingWipes: pw });
    }
    this.proxy.recompute();
  }

  /** Open a short-lived background tab on `origin`, let the content script erase the account's namespaced data. */
  async wipeOrigin(origin, accId, prefix) {
    const tab = await this.openWipeTab(origin);
    try {
      for (let i = 0; i < 40; i++) {
        await sleep(150);
        let t; try { t = await ext.tabs.get(tab.id); } catch { return false; }
        if (t.status === 'complete' && t.url && t.url.startsWith(origin)) {
          try {
            const r = await ext.tabs.sendMessage(tab.id, { box: true, type: 'wipe', accountId: accId, prefix });
            if (r && !r.error) return true;
          } catch { /* content script not ready */ }
        }
      }
      return false;
    } finally { this.wipeTabs.delete(tab.id); try { await ext.tabs.remove(tab.id); } catch { /* gone */ } }
  }
  /** MV2: the request reaches the site (with its cookies stripped by the blocking handler). MV3 overrides this to serve the page locally. */
  async openWipeTab(origin) {
    const tab = await ext.tabs.create({ url: 'about:blank', active: false });
    this.wipeTabs.add(tab.id);
    await ext.tabs.update(tab.id, { url: origin + '/__box_wipe' });
    return tab;
  }

  async handleMessage(msg, sender) {
    switch (msg.type) {
      case 'pendingWipes': {
        const got = await ext.storage.local.get('pendingWipes');
        const w = (got.pendingWipes || {})[msg.origin];
        return { wipes: w || [] };
      }
      case 'wipeDone': {
        const got = await ext.storage.local.get('pendingWipes');
        const pw = got.pendingWipes || {};
        if (pw[msg.origin]) { pw[msg.origin] = pw[msg.origin].filter((x) => x.accountId !== msg.accountId); if (!pw[msg.origin].length) delete pw[msg.origin]; await ext.storage.local.set({ pendingWipes: pw }); }
        return true;
      }
      case 'gesture': this.gestures.set(sender.tab.id, Date.now()); return true;
      case 'adopt': return this.adoptTab(sender.tab.id, msg.accountId);
      case 'restoreIsolation': return this.restoreIsolation?.(msg.tabId);
    }
    return undefined;
  }

  /** A restored tab (after browser restart) carries its account id in sessionStorage; re-enter it. */
  async adoptTab(tabId, accountId) {
    if (!this.restoredTabs.has(tabId) || !this.c.accounts[accountId] || this.c.getTab(tabId).accountId) return false;
    this.restoredTabs.delete(tabId);
    const tab = await ext.tabs.get(tabId);
    await this.moveTab(tabId, accountId, { url: tab.url });
    return true;
  }

  // ------------------------------------------------------------------ identity
  async pushIdentity(tabId) {
    try { await ext.tabs.sendMessage(tabId, { box: true, type: 'identity', identity: this.c.identityFor(tabId) }); } catch { /* no content script */ }
    this.paintBadge(tabId);
  }
  tabChanged(tabId) { this.pushIdentity(tabId); }
  async paintBadge(tabId) {
    try {
      const st = this.c.getTab(tabId);
      const status = this.status(tabId, st);
      const act = ext.action || ext.browserAction;
      const warn = st.accountId && status.level !== 'ok';
      await act.setBadgeText({ tabId, text: warn ? '!' : '' });
      if (warn) await act.setBadgeBackgroundColor({ tabId, color: status.level === 'fail' ? '#e5484d' : '#d97706' });
      // the toolbar icon itself carries the active account's colour and emoji
      const acc = st.accountId ? this.c.accounts[st.accountId] : null;
      const img = acc ? accountIconData(acc) : null;
      if (img) await act.setIcon({ tabId, imageData: img });
      else if (typeof act.setIcon === 'function') await act.setIcon({ tabId, path: { 16: 'icons/16.png', 32: 'icons/32.png' } });
    } catch { /* tab gone */ }
  }

  status(tabId, tab) {
    const msgs = [], level = []; let action = null;
    const acc = tab.accountId ? this.c.accounts[tab.accountId] : null;
    if (!acc) return { level: 'ok', messages: [] };
    const iso = this.isolationStatus?.(tabId);
    if (iso) { level.push(iso.level); msgs.push(...iso.messages); if (iso.action) action = iso.action; }
    const px = this.proxy.statusFor(tabId, acc);
    if (px) { level.push(px.level); msgs.push(...px.messages); }
    const rank = { ok: 0, warn: 1, fail: 2 };
    return { level: level.reduce((a, b) => (rank[b] > rank[a] ? b : a), 'ok'), messages: msgs, action };
  }

  async updateGroups() {
    if (!ext.tabs.group || !ext.tabGroups || !this.c.state.settings.tabGroups) return;
    try {
      const tabs = await ext.tabs.query({});
      const byKey = new Map();
      for (const t of tabs) {
        const st = this.c.tabs.get(t.id);
        if (!st || !st.accountId || this.wipeTabs.has(t.id)) continue;
        const key = st.accountId + '@' + t.windowId;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(t);
      }
      for (const [, list] of byKey) {
        const acc = this.c.accounts[this.c.tabs.get(list[0].id).accountId];
        if (!acc) continue;
        const ungrouped = list.filter((t) => t.groupId === -1 || t.groupId === undefined);
        const existing = list.find((t) => t.groupId >= 0);
        if (!ungrouped.length && !existing) continue;
        let gid = existing && existing.groupId;
        if (ungrouped.length) gid = await ext.tabs.group(existing ? { tabIds: ungrouped.map((t) => t.id), groupId: gid } : { tabIds: ungrouped.map((t) => t.id) });
        await ext.tabGroups.update(gid, { title: `${ICON_EMOJI[acc.icon] || ''} ${acc.name}`.trim(), color: nearest(acc.color, CHROME_GROUP_COLORS) });
      }
      // tabs that left an account leave the group
      for (const t of tabs) { const st = this.c.tabs.get(t.id); if (t.groupId >= 0 && (!st || !st.accountId)) { try { await ext.tabs.ungroup(t.id); } catch { /* ignore */ } } }
    } catch { /* tab groups unsupported */ }
  }

  // ------------------------------------------------------------------ moving a tab between accounts (no tab recreation on Chrome)
  async moveTab(tabId, accountId, { url } = {}) {
    const c = this.c;
    const tab = await ext.tabs.get(tabId);
    const target = url || tab.url;
    const web = isWebUrl(target);
    this.restoredTabs?.delete(tabId);
    const prev = c.getTab(tabId).accountId || null;
    c.setTab(tabId, { accountId: accountId || null, home: web ? c.serviceOfUrl(target) : c.getTab(tabId).home, flow: null });
    await this.accountAssigned(tabId, prev, accountId || null);
    await this.proxy.recompute(true);               // the PAC must be live before the first request of the new account
    if (web) {
      this.expect.set(tabId, target);
      await ext.tabs.update(tabId, { url: target });
    }
    this.pushIdentity(tabId);
    this.updateGroups();
    this.proxy.recompute();
    return tabId;
  }

  // hooks overridden by builds
  async accountAssigned(tabId, prev, next) {}
  async accountUnassigned(tabId, prev) {}
  async installNet() {}

  async testCall(call, args) {
    if (call === 'gestures') return [...this.gestures.entries()].map(([k, v]) => [k, Date.now() - v]);
    if (call === 'jar') return args.accountId ? this.jar.list(args.accountId) : null;
    if (call === 'groups') return ext.tabGroups ? ext.tabGroups.query({}) : null;
    if (call === 'wipeDefault') {
      await ext.browsingData.remove({ since: 0 }, { cookies: true, localStorage: true, indexedDB: true, cache: true, cacheStorage: true, serviceWorkers: true, fileSystems: true });
      return true;
    }
    if (call === 'forget') {        // emulate a browser restart for this tab: Box loses its mapping, the tab (and its sessionStorage marker) survives
      await this.accountUnassigned(args.tabId, null).catch(() => {});
      this.c.setTab(args.tabId, { accountId: null, home: null, flow: null });
      this.restoredTabs.add(args.tabId);
      return true;
    }
    if (call === 'webrtc') { const r = await ext.privacy.network.webRTCIPHandlingPolicy.get({}); return r.value; }
    if (call === 'proxy') return this.proxy.debug();
    if (call === 'badge') return (ext.action || ext.browserAction).getBadgeText({ tabId: args.tabId });
    if (call === 'raw-cookies') return ext.cookies.getAll({});
    return null;
  }
}
