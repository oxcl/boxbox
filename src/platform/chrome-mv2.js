// Chrome Manifest V2 (Helium): synchronous blocking webRequest does the network layer.
import { ext, sleep } from '../core/ext.js';
import { ChromeBase, SYNC_PATH } from './chrome-base.js';
import { hostOf } from '../core/services.js';

const dataUrl = (obj) => 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(obj));
const STATIC_TYPES = new Set(['image', 'script', 'stylesheet', 'font', 'media', 'imageset']);
const NET_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];

export class ChromeMv2Platform extends ChromeBase {
  constructor() { super(); this.nonces = new Map(); this.chain = new Map(); this.swControlled = new Set(); this.swFixed = new Set(); }

  nonceFor(tabId, frameId, parentFrameId) {
    return this.nonces.get(tabId + ':' + frameId) || this.nonces.get(tabId + ':' + parentFrameId) || this.nonces.get(tabId + ':0') || '';
  }

  async installNet() {
    const f = { urls: NET_URLS };
    ext.webRequest.onBeforeRequest.addListener((d) => this.onBeforeRequest(d), f, ['blocking']);
    ext.webRequest.onBeforeSendHeaders.addListener((d) => this.onBeforeSendHeaders(d), f, ['blocking', 'requestHeaders', 'extraHeaders']);
    ext.webRequest.onHeadersReceived.addListener((d) => this.onHeadersReceived(d), f, ['blocking', 'responseHeaders', 'extraHeaders']);
    const done = (d) => this.chain.delete(d.requestId);
    ext.webRequest.onCompleted.addListener(done, f);
    ext.webRequest.onErrorOccurred.addListener(done, f);
  }

  // ---------------------------------------------------------------- requests
  onBeforeRequest(d) {
    try {
      if (d.tabId < 0) return undefined;
      const u = new URL(d.url);
      if (u.pathname === SYNC_PATH && d.type === 'xmlhttprequest') {
        let q = {}; try { q = JSON.parse(u.searchParams.get('q') || '{}'); } catch { /* ignore */ }
        return { redirectUrl: dataUrl(this.syncOp(d.tabId, d.frameId, q, { parentFrameId: d.parentFrameId })) };
      }
      if (this.wipeTabs.has(d.tabId)) return undefined;
      if (d.type === 'main_frame') return this.onMainFrame(d);
      const acc = this.accountOf(d.tabId);
      if (acc) this.proxy.observe(acc, d.tabId, u.hostname);
    } catch (e) { console.error('onBeforeRequest', e); }
    return undefined;
  }

  userInitiated(d) {
    if (!d.initiator || /^(chrome-extension|chrome|about|moz-extension):/.test(d.initiator)) return true;
    if (this.hasRecentGesture(d.tabId)) return true;
    const m = this.tabMeta.get(d.tabId);
    return !!(m && m.opener != null && this.hasRecentGesture(m.opener));
  }

  onMainFrame(d) {
    const c = this.c;
    const exp = this.expect.get(d.tabId);
    if (exp && d.url === exp) { this.expect.delete(d.tabId); this.tabTop.set(d.tabId, d.url); return undefined; }
    let user;
    if (this.chain.has(d.requestId)) user = this.chain.get(d.requestId);
    else {
      user = this.userInitiated(d);
      if (user && this.isPopupTab(d.tabId)) user = false;           // popups opened by a page are part of its flow
      this.chain.set(d.requestId, user);
    }
    const dec = c.decideNavigation({ tabId: d.tabId, url: d.url, userInitiated: user });
    if (typeof __TEST__ !== 'undefined' && __TEST__) console.log('[nav]', d.tabId, d.url, 'initiator=' + d.initiator, 'user=' + user, 'gesture=' + this.hasRecentGesture(d.tabId), '->', JSON.stringify(dec));
    this.tabTop.set(d.tabId, d.url);
    if (dec.type === 'stay') return undefined;
    if (dec.type === 'ask') {
      c.pickerFor.set(d.tabId, { url: d.url, serviceId: dec.serviceId });
      setTimeout(() => ext.tabs.update(d.tabId, { url: this.pickerUrl(d.tabId) }).catch(() => {}), 0);
      return { cancel: true };
    }
    if (dec.type === 'move') {
      const prev = c.getTab(d.tabId).accountId || null;
      c.setTab(d.tabId, { accountId: dec.accountId, home: dec.home, flow: null });
      this.accountAssigned(d.tabId, prev, dec.accountId);
      this.afterAccountChange();
      const acc = dec.accountId && c.accounts[dec.accountId];
      if (acc && acc.proxy && !this.proxy.isActive(dec.accountId)) {
        // A blocking handler cannot wait for the PAC update, so hold this navigation back and replay it once the proxy rule is live.
        this.proxy.recompute(true).then(() => { this.expect.set(d.tabId, d.url); return ext.tabs.update(d.tabId, { url: d.url }); }).catch(() => {});
        return { cancel: true };
      }
    }
    return undefined;
  }

  afterAccountChange() { this.updateGroups(); this.proxy.recompute(); }

  onBeforeSendHeaders(d) {
    try {
      if (d.tabId < 0) return undefined;
      const wipe = this.wipeTabs.has(d.tabId);
      const acc = wipe ? null : this.accountOf(d.tabId);
      if (!acc && !wipe) return undefined;
      const hdrs = d.requestHeaders.filter((h) => h.name.toLowerCase() !== 'cookie');
      if (acc) {
        const ck = this.cookieHeaderFor(acc, d);
        if (ck) hdrs.push({ name: 'Cookie', value: ck });
        if (!STATIC_TYPES.has(d.type)) { hdrs.push({ name: 'Cache-Control', value: 'no-cache' }, { name: 'Pragma', value: 'no-cache' }); }
      }
      return { requestHeaders: hdrs };
    } catch (e) { console.error('onBeforeSendHeaders', e); return undefined; }
  }

  onHeadersReceived(d) {
    try {
      if (d.tabId < 0 || !d.responseHeaders) return undefined;
      const acc = this.accountOf(d.tabId);
      if (!acc) return undefined;
      const setc = [], rest = [];
      for (const h of d.responseHeaders) (h.name.toLowerCase() === 'set-cookie' ? setc : rest).push(h);
      if (setc.length) this.storeSetCookies(acc, d.url, setc.map((h) => h.value));
      let headers = rest;
      if (d.type === 'main_frame' || d.type === 'sub_frame') {
        if (d.type === 'main_frame') this.swControlled.delete(d.tabId);
        const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))).replace(/[^a-z0-9]/gi, '');
        this.nonces.set(d.tabId + ':' + d.frameId, nonce);
        headers = headers.map((h) => (/^content-security-policy$/i.test(h.name) ? { name: h.name, value: patchCsp(h.value, nonce) } : h));
      }
      if (!STATIC_TYPES.has(d.type)) headers = headers.filter((h) => !/^cache-control$/i.test(h.name)).concat([{ name: 'Cache-Control', value: 'no-store' }]);
      return { responseHeaders: headers };
    } catch (e) { console.error('onHeadersReceived', e); return undefined; }
  }

  // ---------------------------------------------------------------- service worker control (needs the debugger, only when actually needed)
  async onServiceWorkerControl(tabId) {
    if (this.swFixed.has(tabId)) return;
    this.swFixed.add(tabId);
    try {
      await ext.debugger.attach({ tabId }, '1.3');
      await ext.debugger.sendCommand({ tabId }, 'Network.enable');
      await ext.debugger.sendCommand({ tabId }, 'Network.setBypassServiceWorker', { bypass: true });
      this.swBypassed = (this.swBypassed || new Set()).add(tabId);
      await ext.tabs.reload(tabId);
    } catch (e) { this.swFailed = (this.swFailed || new Set()).add(tabId); }
    this.pushIdentity(tabId);
  }
  isolationStatus(tabId) {
    if (this.swFailed?.has(tabId)) return { level: 'warn', messages: ['A service worker from another session controls this page and could not be bypassed.'] };
    return null;
  }
  async accountUnassigned(tabId) { if (this.swBypassed?.has(tabId)) { this.swBypassed.delete(tabId); try { await ext.debugger.detach({ tabId }); } catch { /* ignore */ } } this.swFixed.delete(tabId); }
  async accountAssigned(tabId, prev, next) { if (prev && prev !== next) await this.accountUnassigned(tabId); }
  afterCommit(d) { this.swFixed.delete(d.tabId); }
}

/**
 * Make a page's CSP compatible with BoxBox's shim in an account tab: add a nonce to script-src(-elem) (or default-src) so the
 * inline shim runs, allow 'self' and data: in connect-src (the synchronous channel is answered with a data: redirect),
 * and drop Trusted Types enforcement (which would reject the inline script).
 */
export function patchCsp(value, nonce) {
  return value.split(',').map((policy) => {
    const dirs = policy.split(';').map((s) => s.trim()).filter(Boolean);
    const out = []; let hasScript = false, hasConnect = false, defaultSrc = null;
    for (let dir of dirs) {
      const [name, ...vals] = dir.split(/\s+/);
      const n = name.toLowerCase();
      if (n === 'require-trusted-types-for') continue;
      if (n === 'script-src' || n === 'script-src-elem') { hasScript = true; dir = vals.includes("'none'") ? `${name} 'nonce-${nonce}'` : `${dir} 'nonce-${nonce}'`; }
      if (n === 'default-src') defaultSrc = vals;
      if (n === 'connect-src') {
        hasConnect = true;
        if (!vals.includes('*')) { if (!vals.includes("'self'")) dir += " 'self'"; if (!vals.includes('data:')) dir += ' data:'; }
      }
      out.push(dir);
    }
    if (!hasScript && defaultSrc) out.push(`script-src ${defaultSrc.filter((v) => v !== "'none'").join(' ')} 'nonce-${nonce}'`);
    if (!hasConnect && defaultSrc && !defaultSrc.includes('*')) out.push(`connect-src ${defaultSrc.filter((v) => v !== "'none'").join(' ')} 'self' data:`);
    return out.join('; ');
  }).join(', ');
}
