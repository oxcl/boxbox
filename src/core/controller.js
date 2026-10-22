// Platform-independent brain: state, tab registry, navigation decisions, account/service/settings API.
import { ext, TARGET, uid, IS_FIREFOX } from './ext.js';
import { Store } from './store.js';
import { Resolver, hostOf, isWebUrl, opCreateService, opRenameService, opSetDomains, opUnsetDomain, opDeleteService, normDomain } from './services.js';
import { CATALOG, TEST_CATALOG } from './catalog.js';
import { decide } from './nav.js';
import { COLORS, ICONS, MODES, sanitizeProxy } from './model.js';

const catalog = typeof __TEST__ !== 'undefined' && __TEST__ ? [...CATALOG, ...TEST_CATALOG] : CATALOG;

export class Controller {
  /** @param {object} platform  see DESIGN.md §8 for the contract */
  constructor(platform) {
    this.platform = platform;
    this.store = new Store();
    this.resolver = new Resolver({ catalog });
    this.tabs = new Map();           // tabId -> {accountId, home, flow}
    this.pickerFor = new Map();      // tabId -> {url, serviceId}
    this.store.onChange((s) => { this.resolver = new Resolver({ catalog, user: s.user }); });
    platform.controller = this;
  }

  async init() {
    const s = await this.store.load();
    this.resolver = new Resolver({ catalog, user: s.user });
    await this.restoreTabs();
    await this.platform.init?.(this);
    return this;
  }

  get state() { return this.store.get(); }
  get accounts() { return this.state.accounts; }

  // ---- tab registry ------------------------------------------------------------
  getTab(tabId) { return this.tabs.get(tabId) || { accountId: null, home: null, flow: null }; }
  setTab(tabId, patch) {
    const cur = this.tabs.get(tabId) || { accountId: null, home: null, flow: null };
    const next = { ...cur, ...patch };
    this.tabs.set(tabId, next);
    this.persistTabs();
    this.platform.tabChanged?.(tabId, next, cur);
    return next;
  }
  dropTab(tabId) { this.tabs.delete(tabId); this.pickerFor.delete(tabId); this.persistTabs(); this.platform.tabDropped?.(tabId); }

  persistTabs() {
    if (TARGET !== 'chrome-mv3') return;
    clearTimeout(this._pt);
    this._pt = setTimeout(() => { try { ext.storage.session.set({ tabs: [...this.tabs.entries()] }); } catch { /* ignore */ } }, 50);
  }
  async restoreTabs() {
    if (TARGET !== 'chrome-mv3') return;
    try {
      const got = await ext.storage.session.get('tabs');
      for (const [id, v] of got.tabs || []) this.tabs.set(id, v);
    } catch { /* ignore */ }
  }

  serviceOfUrl(url) { return this.resolver.idOfUrl(url); }
  serviceInfo(id) { return id ? this.resolver.describe(id) : null; }

  accountsOf(serviceId) {
    return Object.values(this.accounts).filter((a) => a.serviceId === serviceId).sort((a, b) => a.createdAt - b.createdAt);
  }

  modeFor(serviceId) { return this.state.settings.modes?.[serviceId] || this.state.settings.defaultMode; }

  // ---- navigation ---------------------------------------------------------------
  /**
   * Called by a platform for every top-level navigation, before it is allowed to proceed.
   * Updates tab bookkeeping and returns the decision for the platform to execute.
   */
  decideNavigation({ tabId, url, userInitiated }) {
    const tab = this.getTab(tabId);
    const T = this.serviceOfUrl(url);
    if (!T || !isWebUrl(url)) return { type: 'stay' };
    // Container/account tab with no home yet (e.g. opened by the user from the browser UI)
    if (tab.accountId && !tab.home) { this.setTab(tabId, { home: T, flow: null }); return { type: 'stay' }; }
    const d = decide({
      url, targetService: T, tab, userInitiated,
      settings: this.state.settings, accounts: this.accounts, lastAccount: this.state.lastAccount,
    });
    if (d.type === 'stay') {
      const patch = {};
      if (d.flow !== undefined) patch.flow = d.flow;
      if (d.home !== undefined) patch.home = d.home;
      if (!tab.home && tab.accountId === null && d.home === undefined) patch.home = T;
      if (Object.keys(patch).length) this.setTab(tabId, patch);
    } else if (d.type === 'move' && d.accountId === tab.accountId) {
      this.setTab(tabId, { home: d.home, flow: null });
      return { type: 'stay' };
    } else if (d.type === 'move') {
      // the platform applies the move and registers the (possibly new) tab id
    }
    return d;
  }

  // ---- identity info for content scripts / UI -----------------------------------
  identityFor(tabId) {
    const tab = this.getTab(tabId);
    const acc = tab.accountId ? this.accounts[tab.accountId] : null;
    const st = this.state.settings;
    return {
      account: acc ? { id: acc.id, name: acc.name, color: acc.color, icon: acc.icon, proxy: !!acc.proxy } : null,
      settings: { border: st.border, badge: st.badge },
      status: this.platform.status ? this.platform.status(tabId, tab) : { level: 'ok', messages: [] },
      target: TARGET, restorable: !!this.platform.restoredTabs?.has(tabId),
    };
  }

  async tabInfo(tabId) {
    let tab; try { tab = await ext.tabs.get(tabId); } catch { tab = null; }
    const url = tab?.url || '';
    const ts = this.getTab(tabId);
    const sid = (isWebUrl(url) ? this.serviceOfUrl(url) : null);
    const service = sid ? this.serviceInfo(sid) : null;
    return {
      tabId, url, favIconUrl: tab?.favIconUrl || '', title: tab?.title || '',
      host: hostOf(url), serviceId: sid, service,
      home: ts.home, flow: ts.flow, accountId: ts.accountId,
      accounts: sid ? this.accountsOf(sid).map((a) => this.publicAccount(a)) : [],
      mode: sid ? this.modeFor(sid) : 'default', modeOverride: sid ? (this.state.settings.modes?.[sid] || null) : null,
      defaultMode: this.state.settings.defaultMode,
      status: this.platform.status ? this.platform.status(tabId, ts) : { level: 'ok', messages: [] },
      target: TARGET, canSwitch: !!sid,
    };
  }

  publicAccount(a) {
    return { id: a.id, serviceId: a.serviceId, name: a.name, color: a.color, icon: a.icon, proxy: a.proxy ? { ...a.proxy, password: a.proxy.password ? '••••' : '' } : null, createdAt: a.createdAt };
  }

  // ---- account operations -------------------------------------------------------
  async createAccount({ serviceId, name, color, icon, proxy }) {
    if (!serviceId) throw new Error('serviceId required');
    const existing = this.accountsOf(serviceId).length;
    const acc = {
      id: 'acc_' + uid(10), serviceId,
      name: (name || '').trim() || `Account ${existing + 1}`,
      color: color || COLORS[existing % COLORS.length].hex,
      icon: ICONS.includes(icon) ? icon : ICONS[existing % ICONS.length],
      proxy: sanitizeProxy(proxy), createdAt: Date.now(),
    };
    const extra = (await this.platform.accountCreated?.(acc)) || {};
    Object.assign(acc, extra);
    await this.store.update((s) => { s.accounts[acc.id] = acc; });
    await this.platform.accountsChanged?.();
    return this.publicAccount(acc);
  }

  async updateAccount(id, patch) {
    const old = this.accounts[id];
    if (!old) throw new Error('no such account');
    const acc = { ...old };
    if (patch.name !== undefined) acc.name = String(patch.name).trim() || old.name;
    if (patch.color) acc.color = patch.color;
    if (patch.icon && ICONS.includes(patch.icon)) acc.icon = patch.icon;
    if (patch.proxy !== undefined) {
      const p = sanitizeProxy(patch.proxy);
      if (p && patch.proxy.password === '••••' && old.proxy) p.password = old.proxy.password;
      acc.proxy = p;
    }
    const extra = (await this.platform.accountUpdated?.(acc, old)) || {};
    Object.assign(acc, extra);
    await this.store.update((s) => { s.accounts[id] = acc; });
    await this.platform.accountsChanged?.();
    return this.publicAccount(acc);
  }

  async deleteAccount(id) {
    const acc = this.accounts[id];
    if (!acc) return false;
    // Tabs in the account move back to the default session first (same URL), then the data is wiped.
    for (const [tabId, t] of [...this.tabs.entries()]) {
      if (t.accountId === id) { try { await this.platform.moveTab(tabId, null, { reason: 'account-deleted' }); } catch (e) { console.warn('moveTab', e); } }
    }
    await this.platform.accountDeleted?.(acc);
    await this.store.update((s) => {
      delete s.accounts[id]; delete s.origins[id];
      for (const [svc, a] of Object.entries(s.lastAccount)) if (a === id) delete s.lastAccount[svc];
    });
    await this.platform.accountsChanged?.();
    return true;
  }

  /** User-driven switch (popup / picker). Never touches other tabs. */
  async setTabAccount(tabId, accountId, { url, remember = true } = {}) {
    const tab = await ext.tabs.get(tabId);
    const target = url || tab.url;
    const sid = this.serviceOfUrl(target) || this.getTab(tabId).home;
    if (accountId && (!this.accounts[accountId])) throw new Error('no such account');
    if (accountId && this.accounts[accountId].serviceId !== sid) throw new Error('account belongs to another service');
    if (remember && sid) { await this.store.update((s) => { s.lastAccount[sid] = accountId || null; }); await this.platform.modesChanged?.(); }
    this.setTab(tabId, { home: sid, flow: null });
    const newTabId = await this.platform.moveTab(tabId, accountId, { url: target, explicit: true });
    return { tabId: newTabId ?? tabId };
  }

  // ---- settings & services ------------------------------------------------------
  async setSettings(patch) {
    await this.store.update((s) => {
      for (const k of ['defaultMode', 'theme', 'border', 'badge', 'tabGroups']) if (patch[k] !== undefined) s.settings[k] = patch[k];
      if (!MODES.includes(s.settings.defaultMode)) s.settings.defaultMode = 'default';
    });
    await this.platform.settingsChanged?.();
    return this.state.settings;
  }
  async setServiceMode(serviceId, mode) {
    await this.store.update((s) => { if (!mode || mode === 'inherit') delete s.settings.modes[serviceId]; else if (MODES.includes(mode)) s.settings.modes[serviceId] = mode; });
    await this.platform.settingsChanged?.();
  }
  async serviceEdit(op, a) {
    await this.store.update((s) => {
      switch (op) {
        case 'create': { const id = 'user:' + uid(8); s.user = opCreateService(s.user, id, a.name || 'New service', a.domains || []); a._id = id; break; }
        case 'rename': s.user = opRenameService(s.user, a.id, a.name); break;
        case 'assign': s.user = opSetDomains(s.user, a.id, a.domains); break;
        case 'unassign': s.user = opUnsetDomain(s.user, a.domain); break;
        case 'delete': {
          s.user = opDeleteService(s.user, a.id);
          for (const acc of Object.values(s.accounts)) if (acc.serviceId === a.id) acc.serviceId = a.into || 'auto:orphan';
          break;
        }
        case 'merge': {   // move every domain of `from` into `to`; accounts follow
          const r = new Resolver({ catalog, user: s.user });
          const doms = r.domains(a.from);
          s.user = opSetDomains(s.user, a.to, doms);
          for (const acc of Object.values(s.accounts)) if (acc.serviceId === a.from) acc.serviceId = a.to;
          if (s.user.services[a.from]) s.user = opDeleteService(s.user, a.from);
          break;
        }
        case 'split': {   // carve `domains` out of their current service into a new one
          const id = 'user:' + uid(8);
          s.user = opCreateService(s.user, id, a.name || 'New service', a.domains);
          a._id = id; break;
        }
        default: throw new Error('unknown service op ' + op);
      }
    });
    await this.platform.servicesChanged?.();
    // Tabs may now belong to different services; forget flow/home so next navigation re-derives them.
    for (const [id, t] of this.tabs) this.tabs.set(id, { ...t, flow: null });
    return { id: a._id };
  }

  allServices() {
    const extra = new Set(Object.values(this.accounts).map((a) => a.serviceId));
    for (const id of Object.keys(this.state.settings.modes)) extra.add(id);
    const list = this.resolver.list([...extra]);
    return list.map((s) => ({ ...s, accounts: this.accountsOf(s.id).length, mode: this.state.settings.modes[s.id] || null }))
      .sort((a, b) => (b.accounts - a.accounts) || (Object.keys(this.state.settings.modes).includes(b.id) - Object.keys(this.state.settings.modes).includes(a.id)) || a.name.localeCompare(b.name));
  }

  // ---- messages -----------------------------------------------------------------
  async handle(msg, sender) {
    switch (msg.type) {
      case 'ping': return { ok: true, target: TARGET };
      case 'tabInfo': return this.tabInfo(msg.tabId);
      case 'state': return {
        settings: this.state.settings, accounts: Object.values(this.accounts).map((a) => this.publicAccount(a)),
        services: this.allServices(), target: TARGET, user: this.state.user,
      };
      case 'identity': return this.identityFor(sender?.tab?.id ?? msg.tabId);
      case 'createAccount': return this.createAccount(msg);
      case 'updateAccount': return this.updateAccount(msg.id, msg.patch);
      case 'deleteAccount': return this.deleteAccount(msg.id);
      case 'setTabAccount': return this.setTabAccount(msg.tabId, msg.accountId, { url: msg.url, remember: msg.remember !== false });
      case 'setSettings': return this.setSettings(msg.patch);
      case 'setServiceMode': return this.setServiceMode(msg.serviceId, msg.mode);
      case 'serviceEdit': return this.serviceEdit(msg.op, { ...msg.args });
      case 'picker': return this.pickerInfo(msg.tabId);
      case 'pickerChoice': return this.pickerChoice(msg);
      case 'resolve': { const id = this.serviceOfUrl(msg.url); return id ? this.serviceInfo(id) : null; }
      case 'gesture?': return { ok: true };
      default: return this.platform.handleMessage?.(msg, sender);
    }
  }

  pickerInfo(tabId) {
    const p = this.pickerFor.get(tabId);
    if (!p) return null;
    return { url: p.url, service: this.serviceInfo(p.serviceId), accounts: this.accountsOf(p.serviceId).map((a) => this.publicAccount(a)), tabId };
  }

  async pickerChoice({ tabId, accountId, remember }) {
    const p = this.pickerFor.get(tabId);
    if (!p) throw new Error('no picker pending for tab');
    if (remember) await this.store.update((s) => { s.settings.modes[p.serviceId] = 'remember'; });
    await this.store.update((s) => { s.lastAccount[p.serviceId] = accountId || null; });
    await this.platform.modesChanged?.();
    this.pickerFor.delete(tabId);
    this.setTab(tabId, { home: p.serviceId, flow: null });
    const id = await this.platform.moveTab(tabId, accountId, { url: p.url, explicit: true, fromPicker: true });
    return { tabId: id ?? tabId };
  }
}
