// Chrome Manifest V3. No blocking webRequest, so the network layer is built from:
//   * chrome.debugger + CDP `Fetch` on account tabs only: every request is paused, its Cookie header is replaced from the
//     virtual jar and it is continued (an async-blocking onBeforeSendHeaders with total ordering); `/__box_sync` is answered locally;
//   * a per-tab declarativeNetRequest session rule that strips Set-Cookie before Chrome's cookie store sees it;
//   * a non-blocking webRequest.onHeadersReceived observer, which still sees the original Set-Cookie, feeding the jar;
//   * Page.addScriptToEvaluateOnNewDocument to run the shim before page code (also in OOPIFs and workers via auto-attach).
import { ext, sleep } from '../core/ext.js';
import { ChromeBase, SYNC_PATH, prefixFor } from './chrome-base.js';
import { isWebUrl } from '../core/services.js';
import { shim } from '../chrome/shim.js';

const NET_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];
const ALL_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'other'];
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const dbgErr = (e) => String((e && e.message) || e);

export class ChromeMv3Platform extends ChromeBase {
  constructor() {
    super();
    this.sessions = new Map();      // tabId -> {mainFrame, scripts:Map(sessionKey->id), children:Map}
    this.lost = new Set();          // tabs whose debugger was closed by the user
    this.initiators = new Map();    // "tabId|url" -> {initiator, t}
    this.entering = new Set();      // tabIds currently being moved by onBeforeNavigate
    this.shimSrc = shim.toString();
  }

  async installNet() {
    const f = { urls: NET_URLS };
    ext.webRequest.onHeadersReceived.addListener((d) => this.onHeadersReceived(d), f, ['responseHeaders', 'extraHeaders']);
    ext.webRequest.onBeforeRequest.addListener((d) => this.onBeforeRequestObserve(d), f);
    ext.debugger.onEvent.addListener((src, method, params) => this.onDebuggerEvent(src, method, params));
    ext.debugger.onDetach.addListener((src, reason) => this.onDetach(src, reason));
    ext.webNavigation.onBeforeNavigate.addListener((d) => { if (d.frameId === 0) this.onBeforeNavigate(d); });
    await this.syncGateRules();
    const stale = await ext.declarativeNetRequest.getSessionRules();
    if (stale.length) await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: stale.map((r) => r.id) });
    // After a service-worker restart the in-memory sessions are gone: re-establish isolation for every account tab.
    for (const [tabId, st] of this.c.tabs) if (st.accountId) this.accountAssigned(tabId, null, st.accountId, true).catch((e) => console.warn('re-attach', tabId, dbgErr(e)));
  }

  // ---------------------------------------------------------------- observers
  onBeforeRequestObserve(d) {
    if (d.tabId < 0) return;
    if (d.type === 'main_frame') {
      this.initiators.set(d.tabId + '|' + d.url, { initiator: d.initiator, t: Date.now() });
      if (this.initiators.size > 200) for (const [k, v] of this.initiators) if (Date.now() - v.t > 10000) this.initiators.delete(k);
    }
    const acc = this.accountOf(d.tabId);
    if (acc) this.proxy.observe(acc, d.tabId, new URL(d.url).hostname);
  }

  onHeadersReceived(d) {
    try {
      if (d.tabId < 0 || !d.responseHeaders) return;
      const acc = this.accountOf(d.tabId);
      if (!acc) return;
      const vals = d.responseHeaders.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
      if (vals.length) this.storeSetCookies(acc, d.url, vals);
    } catch (e) { console.error('onHeadersReceived', e); }
  }

  // ---------------------------------------------------------------- account <-> debugger/DNR
  async accountAssigned(tabId, prev, next, force = false) {
    if (!next) { if (prev) await this.accountUnassigned(tabId, prev); return; }
    if (!force && prev === next && this.sessions.has(tabId)) return;
    if (this.sessions.has(tabId)) await this.detachSession(tabId);
    await this.attachSession(tabId, next);
  }
  async accountUnassigned(tabId) {
    await this.detachSession(tabId);
    await this.setRules(tabId, false);
    this.lost.delete(tabId);
  }

  /** DNR rule ids must be small integers; Chrome's tab ids can be ~2^31, so tabs get sequential slots. */
  slotOf(tabId) {
    if (!this.slots) { this.slots = new Map(); this.nextSlot = 1; }
    if (!this.slots.has(tabId)) this.slots.set(tabId, this.nextSlot++);
    return this.slots.get(tabId);
  }

  async setRules(tabId, on, block = false) {
    const n = this.slotOf(tabId) * 4;
    const ids = [n + 1, n + 2, n + 3, n + 4];
    const rules = [];
    if (on) {
      rules.push({ id: ids[0], priority: 10, condition: { tabIds: [tabId], resourceTypes: ALL_TYPES }, action: { type: 'modifyHeaders', responseHeaders: [{ header: 'set-cookie', operation: 'remove' }] } });
      rules.push({ id: ids[1], priority: 10, condition: { tabIds: [tabId], resourceTypes: ['websocket'] }, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'cookie', operation: 'remove' }] } });
    }
    // account tabs are governed by the debugger (Fetch), never by the entry gate
    if (on) rules.push({ id: ids[3], priority: 1, condition: { tabIds: [tabId], resourceTypes: ['main_frame'] }, action: { type: 'allow' } });
    if (block) rules.push({ id: ids[2], priority: 100, condition: { tabIds: [tabId], resourceTypes: ALL_TYPES }, action: { type: 'block' } });
    await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids, addRules: rules });
  }

  async attachSession(tabId, accId) {
    await this.setRules(tabId, true);
    const s = { mainFrame: null, scripts: new Map(), children: new Map(), accId };
    this.sessions.set(tabId, s);
    try { await ext.debugger.attach({ tabId }, '1.3'); }
    catch (e) { if (!/already attached/i.test(dbgErr(e))) { this.sessions.delete(tabId); this.lost.add(tabId); await this.setRules(tabId, true, true); this.pushIdentity(tabId); throw e; } }
    this.lost.delete(tabId);
    await this.setupTarget({ tabId }, s, 'page');
    this.pushIdentity(tabId);
  }

  async detachSession(tabId) {
    const s = this.sessions.get(tabId);
    if (!s) return;
    this.sessions.delete(tabId);
    try { await ext.debugger.detach({ tabId }); } catch { /* already detached */ }
  }

  cfgFor(accId) {
    const acc = this.c.accounts[accId];
    return { acct: accId, pfx: prefixFor(accId), proxied: !!(acc && acc.proxy), src: this.shimSrc, wrapWorkers: false, guardPopups: true };
  }

  async setupTarget(target, s, type) {
    const send = (m, p) => ext.debugger.sendCommand(target, m, p);
    const key = target.sessionId || 'page';
    try {
      await send('Network.enable');
      await send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
      await send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
      await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      const cfg = this.cfgFor(s.accId);
      const source = `(${this.shimSrc})(${JSON.stringify(cfg)});`;
      if (type === 'worker' || type === 'shared_worker') {
        await send('Runtime.evaluate', { expression: source });
      } else {
        await send('Page.enable');
        const r = await send('Page.addScriptToEvaluateOnNewDocument', { source, runImmediately: true });
        s.scripts.set(key, r.identifier);
        if (!target.sessionId) { const t = await send('Page.getFrameTree'); s.mainFrame = t.frameTree.frame.id; }
      }
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    } catch (e) { console.warn('setupTarget', type, dbgErr(e)); }
  }

  /** Account of an attached tab changed (leave -> other account): swap the shim configuration. */
  async reconfigure(tabId, accId) {
    const s = this.sessions.get(tabId);
    if (!s) return;
    s.accId = accId;
    for (const [key, id] of s.scripts) {
      const target = key === 'page' ? { tabId } : { tabId, sessionId: key };
      try {
        await ext.debugger.sendCommand(target, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: id });
        const r = await ext.debugger.sendCommand(target, 'Page.addScriptToEvaluateOnNewDocument', { source: `(${this.shimSrc})(${JSON.stringify(this.cfgFor(accId))});` });
        s.scripts.set(key, r.identifier);
      } catch (e) { console.warn('reconfigure', dbgErr(e)); }
    }
  }

  // ---------------------------------------------------------------- CDP events
  onDebuggerEvent(src, method, p) {
    if (src.tabId == null) return;
    if (method === 'Fetch.requestPaused') { this.onPaused(src, p).catch((e) => console.error('onPaused', dbgErr(e))); return; }
    if (method === 'Target.attachedToTarget') { this.onChildAttached(src, p).catch((e) => console.warn('onChildAttached', dbgErr(e))); return; }
    if (method === 'Page.frameNavigated' && !src.sessionId && !p.frame.parentId) { const s = this.sessions.get(src.tabId); if (s) s.mainFrame = p.frame.id; }
  }

  async onChildAttached(src, p) {
    const s = this.sessions.get(src.tabId);
    const type = p.targetInfo.type;
    const target = { tabId: src.tabId, sessionId: p.sessionId };
    if (s && (type === 'iframe' || type === 'worker' || type === 'shared_worker')) {
      s.children.set(p.sessionId, type);
      await this.setupTarget(target, s, type);
    } else {
      try { await ext.debugger.sendCommand({ tabId: src.tabId, sessionId: src.sessionId }, 'Target.detachFromTarget', { sessionId: p.sessionId }); } catch { /* ignore */ }
      return;
    }
    try { await ext.debugger.sendCommand(target, 'Runtime.runIfWaitingForDebugger'); } catch { /* ignore */ }
  }

  onDetach(src, reason) {
    const tabId = src.tabId;
    if (tabId == null) return;
    const s = this.sessions.get(tabId);
    if (!s) return;
    this.sessions.delete(tabId);
    if (reason === 'target_closed') return;
    if (this.accountOf(tabId)) {            // the user closed the "Box started debugging" bar, or DevTools stole the session
      this.lost.add(tabId);
      this.setRules(tabId, true, true).catch(() => {});     // fail closed: nothing may leave this tab outside its account
      this.pushIdentity(tabId);
    }
  }

  isolationStatus(tabId) {
    if (this.lost.has(tabId)) return { level: 'fail', messages: ['Isolation is paused for this tab because the debugging bar was closed. The tab is blocked so nothing is sent outside its account — use “Restore isolation” in the Box popup.'] };
    return null;
  }
  async restoreIsolation(tabId) {
    const acc = this.accountOf(tabId);
    if (!acc) return false;
    await this.setRules(tabId, true, false);
    this.lost.delete(tabId);
    await this.attachSession(tabId, acc);
    await ext.tabs.reload(tabId);
    return true;
  }

  // ---------------------------------------------------------------- the paused request (heart of the MV3 build)
  async onPaused(src, p) {
    const tabId = src.tabId;
    const target = src.sessionId ? { tabId, sessionId: src.sessionId } : { tabId };
    const send = (m, params) => ext.debugger.sendCommand(target, m, params);
    const cont = (headers) => send('Fetch.continueRequest', headers ? { requestId: p.requestId, headers } : { requestId: p.requestId });
    try {
      if (p.responseStatusCode !== undefined || p.responseErrorReason) { await send('Fetch.continueResponse', { requestId: p.requestId }); return; }
      const req = p.request;
      let u; try { u = new URL(req.url); } catch { await cont(); return; }
      const s = this.sessions.get(tabId);
      let acc = this.accountOf(tabId);
      if (!acc || !s) { await cont(); return; }

      if (u.pathname === SYNC_PATH && u.protocol.startsWith('http')) {
        let q = {}; try { q = JSON.parse(u.searchParams.get('q') || '{}'); } catch { /* ignore */ }
        const body = JSON.stringify((q.op === 'popup' || q.op === 'openTab') ? await this.asyncOp(tabId, q) : this.syncOp(tabId, 0, q));
        await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }], body: b64(body) });
        return;
      }

      const isMain = p.resourceType === 'Document' && !src.sessionId && p.frameId === s.mainFrame;
      let type = isMain ? 'main_frame' : p.resourceType === 'Document' ? 'sub_frame' : 'other';
      let initiator;
      if (isMain) {
        const dec = await this.decideMain(tabId, req, p);
        if (dec.abort) { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Aborted' }); return; }
        acc = this.accountOf(tabId);
        this.tabTop.set(tabId, req.url);
        initiator = dec.initiator;
        if (!acc) { await cont(); return; }          // left the account: this request travels in the default session
      }
      if (this.wipeTabs.has(tabId)) { await cont([...Object.entries(req.headers).filter(([k]) => k.toLowerCase() !== 'cookie').map(([name, value]) => ({ name, value })), { name: 'Cookie', value: '' }]); return; }
      if (!isMain) initiator = req.headers.Origin || req.headers.Referer || undefined;
      const hdrs = Object.entries(req.headers).filter(([k]) => k.toLowerCase() !== 'cookie').map(([name, value]) => ({ name, value }));
      const ck = this.cookieHeaderFor(acc, { url: req.url, tabId, initiator, type, method: req.method });
      // An explicit Cookie header — even an empty one — stops Chrome from attaching the real jar's cookies (verified in a spike);
      // omitting it would leak the default session into this account tab.
      hdrs.push({ name: 'Cookie', value: ck });
      await cont(hdrs);
    } catch (e) {
      try { await send('Fetch.continueRequest', { requestId: p.requestId }); } catch { /* request gone */ }
      if (!/No (target|session)|Invalid InterceptionId|Cannot find/i.test(dbgErr(e))) console.warn('paused', dbgErr(e));
    }
  }

  /** Decide a main-frame navigation of an account tab while its request is held. */
  async decideMain(tabId, req, p) {
    const c = this.c;
    const exp = this.expect.get(tabId);
    if (exp && req.url === exp) { this.expect.delete(tabId); return {}; }
    const rec = await this.waitInitiator(tabId, req.url);
    const initiator = rec ? rec.initiator : undefined;
    let user = !initiator || /^(chrome-extension|chrome|about):/.test(initiator);
    const rp = this.replay && this.replay.get(tabId);
    if (rp && rp.url === req.url) { user = rp.user; this.replay.delete(tabId); }
    else if (!user) user = await this.queryGesture(tabId) || (this.tabMeta.get(tabId)?.opener != null && await this.queryGesture(this.tabMeta.get(tabId).opener));
    if (user && this.isPopupTab(tabId)) user = false;
    const dec = c.decideNavigation({ tabId, url: req.url, userInitiated: user });
    if (dec.type === 'ask') {
      c.pickerFor.set(tabId, { url: req.url, serviceId: dec.serviceId });
      ext.tabs.update(tabId, { url: this.pickerUrl(tabId) }).catch(() => {});
      return { abort: true };
    }
    if (dec.type === 'move') {
      const prev = c.getTab(tabId).accountId || null;
      c.setTab(tabId, { accountId: dec.accountId, home: dec.home, flow: null });
      if (dec.accountId) await this.reconfigure(tabId, dec.accountId);
      else { await this.setRules(tabId, false); /* detach after the request has been continued */ setTimeout(() => this.accountUnassigned(tabId, prev).catch(() => {}), 0); }
      this.updateGroups(); this.proxy.recompute(); this.pushIdentity(tabId);
    }
    return { initiator };
  }

  async waitInitiator(tabId, url) {
    for (let i = 0; i < 12; i++) { const r = this.initiators.get(tabId + '|' + url); if (r) return r; await sleep(12); }
    return null;
  }

  /**
   * Tabs/popups opened by an account page. The debugger cannot be attached before the new tab's first request starts, so the
   * navigation is replayed inside the isolated session once attached (the unattached first request is discarded).
   */
  onNavTarget(d) {
    const src = this.c.tabs.get(d.sourceTabId);
    if (!src || !src.accountId || this.c.getTab(d.tabId).accountId) return;
    const p = this.adoptNavTarget(d, src);
    this.lastPopup = this.lastPopup || new Map(); this.popupWait = this.popupWait || new Map();
    this.lastPopup.set(d.sourceTabId, { p, t: Date.now() });
    const w = this.popupWait.get(d.sourceTabId);
    if (w) { this.popupWait.delete(d.sourceTabId); p.then(w, w); }
  }
  async adoptNavTarget(d, src) {
    const user = isWebUrl(d.url) ? await this.queryGesture(d.sourceTabId) : false;
    this.c.setTab(d.tabId, { accountId: src.accountId, home: src.home, flow: null });
    await this.accountAssigned(d.tabId, null, src.accountId);
    if (isWebUrl(d.url)) {          // opened by something other than the shim (e.g. context menu): replay once attached
      this.replay = this.replay || new Map();
      this.replay.set(d.tabId, { url: d.url, user });
      await ext.tabs.update(d.tabId, { url: d.url }).catch(() => {});
    }
  }

  /** Blocking ops of the shim (the page is stuck in a synchronous XHR until we answer). */
  async asyncOp(tabId, q) {
    this.lastPopup = this.lastPopup || new Map(); this.popupWait = this.popupWait || new Map();
    if (q.op === 'popup') {
      const last = this.lastPopup.get(tabId);
      if (last && Date.now() - last.t < 3000) await last.p;
      else await new Promise((res) => { this.popupWait.set(tabId, res); setTimeout(res, 3000); });
      return { ok: 1 };
    }
    if (q.op === 'openTab') {
      const st = this.c.getTab(tabId);
      const src = await ext.tabs.get(tabId);
      const nt = await ext.tabs.create({ url: 'about:blank', active: q.active !== false, index: src.index + 1, windowId: src.windowId, openerTabId: tabId });
      this.c.setTab(nt.id, { accountId: st.accountId, home: st.home, flow: null });
      await this.accountAssigned(nt.id, null, st.accountId);
      this.replay = this.replay || new Map();
      this.replay.set(nt.id, { url: q.url, user: true });
      await ext.tabs.update(nt.id, { url: q.url });
      this.updateGroups();
      return { ok: 1 };
    }
    return { error: 'unknown op' };
  }

  // ---------------------------------------------------------------- entry gate (default tabs entering a service)
  //
  // Services that need a decision on entry (Ask, or Remember with a remembered account) get a DNR redirect rule that sends
  // main-frame navigations to gate.html instead of the network, so *no request leaves the browser* before the decision.
  // Navigations initiated from within the service itself and tabs that are already in an account (handled via Fetch) are excluded.
  gatedServices() {
    const c = this.c, out = [];
    for (const sid of new Set(Object.values(c.accounts).map((a) => a.serviceId))) {
      const mode = c.modeFor(sid), last = c.state.lastAccount[sid];
      if (mode === 'ask' || (mode === 'remember' && last && c.accounts[last])) out.push(sid);
    }
    return out;
  }
  async syncGateRules() {
    try {
      const gate = ext.runtime.getURL('gate.html');
      const rules = []; let n = 0;
      this.gated = new Set();
      for (const sid of this.gatedServices()) {
        const domains = this.c.resolver.domains(sid);
        if (!domains.length) continue;
        this.gated.add(sid);
        rules.push({ id: 1000 + n++, priority: 1, condition: { regexFilter: '^(https?://.*)$', requestDomains: domains, excludedInitiatorDomains: domains, resourceTypes: ['main_frame'] },
          action: { type: 'redirect', redirect: { regexSubstitution: gate + '?u=\\1' } } });
      }
      const old = (await ext.declarativeNetRequest.getDynamicRules()).filter((r) => r.id >= 1000 && r.id < 2000).map((r) => r.id);
      await ext.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old, addRules: rules });
    } catch (e) { console.warn('syncGateRules', dbgErr(e)); }
  }
  async servicesChanged() { await this.syncGateRules(); }
  async modesChanged() { await this.syncGateRules(); }
  async accountsChanged() { await super.accountsChanged(); await this.syncGateRules(); }
  async settingsChanged() { await super.settingsChanged(); await this.syncGateRules(); }

  async allowTab(tabId, ms = 6000) {
    const id = 100000 + this.slotOf(tabId);
    await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id], addRules: [{ id, priority: 1, condition: { tabIds: [tabId], resourceTypes: ['main_frame'] }, action: { type: 'allow' } }] });
    setTimeout(() => ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {}), ms);
  }

  /** gate.html asks what to do with the navigation it intercepted. */
  async gate(tabId, url) {
    const c = this.c;
    if (!isWebUrl(url)) return { go: url };
    const hint = this.hints && this.hints.get(tabId);
    const user = hint && hint.url === url ? await hint.p : true;
    const dec = c.decideNavigation({ tabId, url, userInitiated: user });
    if (dec.type === 'ask') {
      c.pickerFor.set(tabId, { url, serviceId: dec.serviceId });
      return { go: this.pickerUrl(tabId) };
    }
    if (dec.type === 'move' && dec.accountId) {
      this.entering.add(tabId);
      try { await this.moveTab(tabId, dec.accountId, { url }); } finally { this.entering.delete(tabId); }
      return { go: null };
    }
    await this.allowTab(tabId);
    return { go: url };
  }
  async handleMessage(msg, sender) {
    if (msg.type === 'gate') return this.gate(sender.tab.id, msg.url);
    if (msg.type === 'restoreIsolation') return this.restoreIsolation(msg.tabId);
    return super.handleMessage(msg, sender);
  }

  /** Remember whether the navigation that is about to be redirected to the gate was user-initiated (the old page is still alive now). */
  async onBeforeNavigate(d) {
    try {
      const tabId = d.tabId;
      if (!isWebUrl(d.url) || this.wipeTabs.has(tabId) || this.sessions.has(tabId) || this.accountOf(tabId) || this.entering.has(tabId)) return;
      if (!this.gated || !this.gated.has(this.c.serviceOfUrl(d.url))) return;
      this.hints = this.hints || new Map();
      this.hints.set(tabId, { url: d.url, p: this.computeUser(tabId, d.url) });
    } catch (e) { console.warn('onBeforeNavigate', dbgErr(e)); }
  }
  async computeUser(tabId, url) {
    const rec = await this.waitInitiator(tabId, url);
    const initiator = rec ? rec.initiator : undefined;
    let user = !initiator || /^(chrome-extension|chrome|about):/.test(initiator);
    if (!user) user = await this.queryGesture(tabId) || (this.tabMeta.get(tabId)?.opener != null && await this.queryGesture(this.tabMeta.get(tabId).opener));
    if (user && this.isPopupTab(tabId)) user = false;
    return user;
  }
  async _unusedOnBeforeNavigate(d) {
    try {
      const tabId = d.tabId;
      if (!isWebUrl(d.url) || this.wipeTabs.has(tabId) || this.sessions.has(tabId) || this.accountOf(tabId) || this.entering.has(tabId)) return;
      const exp = this.expect.get(tabId);
      if (exp && d.url === exp) { this.expect.delete(tabId); this.tabTop.set(tabId, d.url); return; }
      const rec = await this.waitInitiator(tabId, d.url);
      const initiator = rec ? rec.initiator : undefined;
      let user = !initiator || /^(chrome-extension|chrome|about):/.test(initiator);
      if (!user) user = await this.queryGesture(tabId) || (this.tabMeta.get(tabId)?.opener != null && await this.queryGesture(this.tabMeta.get(tabId).opener));
      if (user && this.isPopupTab(tabId)) user = false;
      const dec = this.c.decideNavigation({ tabId, url: d.url, userInitiated: user });
      if (dec.type === 'ask') {
        this.c.pickerFor.set(tabId, { url: d.url, serviceId: dec.serviceId });
        await ext.tabs.update(tabId, { url: this.pickerUrl(tabId) });
      } else if (dec.type === 'move' && dec.accountId) {
        this.entering.add(tabId);
        try { await this.moveTab(tabId, dec.accountId, { url: d.url }); } finally { this.entering.delete(tabId); }
      }
    } catch (e) { console.warn('onBeforeNavigate', dbgErr(e)); }
  }

  async moveTab(tabId, accountId, opts = {}) {
    const prev = this.accountOf(tabId);
    const r = await super.moveTab(tabId, accountId, opts);
    return r;
  }

  async wipeOrigin(origin, accId, prefix) {
    return super.wipeOrigin(origin, accId, prefix);
  }
}
