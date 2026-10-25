// Main-world shim for account tabs on Chrome. Self-contained: it is serialised with Function#toString
// and evaluated in every frame (and, on MV3, worker) of an account tab *before* page scripts run.
//
// It virtualises every JS-visible, origin-scoped store per account: cookies (via the extension's jar),
// localStorage / sessionStorage / IndexedDB / Cache Storage / OPFS / BroadcastChannel / Web Locks /
// SharedWorker names (via a hidden namespace), service worker registrations, and WebRTC for proxied accounts.
export function shim(cfg) {
  'use strict';
  const g = globalThis;
  if (g.__boxShimmed) return;
  const isWorker = typeof WorkerGlobalScope !== 'undefined' && g instanceof WorkerGlobalScope;
  const pfx = cfg.pfx;                                  // e.g. "__box_k3j2h1__"
  const ORIGIN = () => { try { return g.origin || g.location.origin; } catch { return ''; } };
  const SRC = cfg.src;                                  // source of this function, for nested frames/workers (string)
  try { Object.defineProperty(g, '__boxShimmed', { value: true, enumerable: false }); } catch { return; }

  // -------------------------------------------------------------- stealth: patched functions look native
  const patched = new WeakMap();
  const origFnToString = Function.prototype.toString;
  const fakeToString = function toString() { const o = patched.get(this); return origFnToString.call(o || this); };
  patched.set(fakeToString, origFnToString);
  try { Object.defineProperty(Function.prototype, 'toString', { value: fakeToString, writable: true, configurable: true }); } catch { /* ignore */ }
  const mark = (fn, orig) => { try { patched.set(fn, orig); } catch { /* ignore */ } return fn; };
  const redefine = (obj, key, make) => {                // replace data property / method with make(original)
    if (!obj) return;
    const d = Object.getOwnPropertyDescriptor(obj, key);
    if (!d) return;
    if ('value' in d && typeof d.value === 'function') {
      const o = d.value; const n = make(o);
      try { Object.defineProperty(obj, key, { ...d, value: mark(n, o) }); } catch { /* ignore */ }
    }
  };
  const redefineGetter = (obj, key, make) => {
    if (!obj) return;
    const d = Object.getOwnPropertyDescriptor(obj, key);
    if (!d || !d.get) return;
    const o = d.get; const n = make(o);
    try { Object.defineProperty(obj, key, { ...d, get: mark(n, o) }); } catch { /* ignore */ }
  };

  // -------------------------------------------------------------- synchronous channel to the extension
  // Pristine XHR captured before any page script runs: sites (error reporters, analytics) routinely wrap XMLHttpRequest and
  // some of those wrappers break synchronous mode.
  const NX = g.XMLHttpRequest;
  const xOpen = NX.prototype.open, xSend = NX.prototype.send;
  const xStatus = Object.getOwnPropertyDescriptor(NX.prototype, 'status').get, xText = Object.getOwnPropertyDescriptor(NX.prototype, 'responseText').get;
  const sync = (op, args) => {
    try {
      const x = new NX();
      xOpen.call(x, 'GET', ORIGIN() + '/__box_sync?q=' + encodeURIComponent(JSON.stringify({ op, a: cfg.acct, ...args })), false);
      xSend.call(x);
      if (xStatus.call(x) === 200) return JSON.parse(xText.call(x));
    } catch { /* CSP / network: degrade gracefully */ }
    return null;
  };
  let touched = false;
  const touch = () => { if (!touched) { touched = true; sync('touch', { o: ORIGIN() }); } };
  const docUrl = () => { const p = g.location.protocol; return (p === 'about:' || p === 'blob:' || p === 'data:') ? ORIGIN() + '/' : g.location.href; };

  // -------------------------------------------------------------- cookies
  if (typeof Document !== 'undefined') {
    let last = '';
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (d) {
      const get = function () { const r = sync('c.get', { u: docUrl() }); if (r) last = r.v; return last; };
      const set = function (v) { const r = sync('c.set', { u: docUrl(), v: String(v) }); if (r && r.v !== undefined) last = r.v; };
      mark(get, d.get); mark(set, d.set);
      Object.defineProperty(Document.prototype, 'cookie', { get, set, configurable: true, enumerable: true });
    }
  }
  if (typeof CookieStore !== 'undefined') {
    const toObj = (c) => ({ name: c.name, value: c.value, domain: c.hostOnly ? null : c.domain, path: c.path, expires: c.expires, secure: c.secure, sameSite: c.sameSite || 'lax', partitioned: false });
    const list = () => { const r = sync('c.list', { u: docUrl() }); return r ? r.v : []; };
    redefine(CookieStore.prototype, 'getAll', () => async function getAll(arg) { const n = typeof arg === 'string' ? arg : arg && arg.name; return list().filter((c) => !n || c.name === n).map(toObj); });
    redefine(CookieStore.prototype, 'get', () => async function get(arg) { const n = typeof arg === 'string' ? arg : arg && arg.name; const c = list().find((x) => x.name === n); return c ? toObj(c) : null; });
    redefine(CookieStore.prototype, 'set', () => async function set(a, b) {
      const o = typeof a === 'string' ? { name: a, value: b } : a;
      let s = `${o.name}=${o.value}; Path=${o.path || '/'}`;
      if (o.domain) s += `; Domain=${o.domain}`;
      if (o.expires) s += `; Expires=${new Date(o.expires).toUTCString()}`;
      if (o.sameSite) s += `; SameSite=${o.sameSite}`;
      if (docUrl().startsWith('https:') || /localhost/.test(ORIGIN())) s += '; Secure';
      sync('c.set', { u: docUrl(), v: s });
    });
    redefine(CookieStore.prototype, 'delete', () => async function del(arg) {
      const o = typeof arg === 'string' ? { name: arg } : arg;
      sync('c.set', { u: docUrl(), v: `${o.name}=; Path=${o.path || '/'}${o.domain ? '; Domain=' + o.domain : ''}; Max-Age=0` });
    });
  }

  // -------------------------------------------------------------- Web Storage (localStorage / sessionStorage)
  const makeStorage = (real, kind) => {
    const keys = () => { const out = []; for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k !== null && k.startsWith(pfx)) out.push(k.slice(pfx.length)); } return out; };
    const methods = {
      getItem: (k) => real.getItem(pfx + String(k)),
      setItem: (k, v) => { if (kind === 'local') touch(); real.setItem(pfx + String(k), String(v)); },
      removeItem: (k) => real.removeItem(pfx + String(k)),
      clear: () => { for (const k of keys()) real.removeItem(pfx + k); },
      key: (i) => { const ks = keys(); i = Number(i) >>> 0; return i < ks.length ? ks[i] : null; },
    };
    const bound = {};
    for (const [n, f] of Object.entries(methods)) {
      const orig = Storage.prototype[n];
      bound[n] = mark(function () { return f.apply(null, arguments); }, orig);
      Object.defineProperty(bound[n], 'name', { value: n });
    }
    const target = Object.create(Storage.prototype);
    const proxy = new Proxy(target, {
      get(t, k, r) {
        if (typeof k === 'symbol') return Reflect.get(Storage.prototype, k, proxy);
        if (k === 'length') return keys().length;
        if (Object.prototype.hasOwnProperty.call(bound, k)) return bound[k];
        if (k in Storage.prototype) return Reflect.get(Storage.prototype, k, r);
        const v = real.getItem(pfx + k); return v === null ? undefined : v;
      },
      set(t, k, v) { if (typeof k === 'symbol') return false; methods.setItem(k, v); return true; },
      deleteProperty(t, k) { if (typeof k === 'symbol') return true; methods.removeItem(k); return true; },
      has(t, k) { if (typeof k === 'symbol') return k in Storage.prototype; return k in bound || k === 'length' || real.getItem(pfx + k) !== null || k in Storage.prototype; },
      ownKeys() { return keys(); },
      getOwnPropertyDescriptor(t, k) { if (typeof k !== 'string') return undefined; const v = real.getItem(pfx + k); return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true }; },
      defineProperty(t, k, desc) { if ('value' in desc) methods.setItem(k, desc.value); return true; },
      getPrototypeOf() { return Storage.prototype; },
    });
    return proxy;
  };
  const realStores = {};
  const wrapStorageGlobal = (name, kind) => {
    if (!(name in g)) return;
    const host = Object.getOwnPropertyDescriptor(g, name) ? g : Object.getPrototypeOf(g);
    const d = Object.getOwnPropertyDescriptor(host, name);
    if (!d || !d.get) return;
    let cached, realRef;
    try { realStores[kind] = d.get.call(g); } catch { /* opaque origin */ }
    const get = function () { const real = d.get.call(this); if (!cached || realRef !== real) { realRef = real; cached = makeStorage(real, kind); } return cached; };
    mark(get, d.get);
    try { Object.defineProperty(host, name, { ...d, get }); } catch { /* ignore */ }
  };
  if (typeof Storage !== 'undefined' && !isWorker) {
    // marker for session restore: Chrome restores sessionStorage with the tab, so a restored tab can tell BoxBox which account it was in
    try { if (g.top === g) { const host = Object.getOwnPropertyDescriptor(g, 'sessionStorage') ? g : Object.getPrototypeOf(g); Object.getOwnPropertyDescriptor(host, 'sessionStorage').get.call(g).setItem('__box_acct', cfg.acct); } } catch { /* ignore */ }
    wrapStorageGlobal('localStorage', 'local');
    wrapStorageGlobal('sessionStorage', 'session');
    // Storage events from other tabs carry prefixed keys: hide foreign ones, translate ours.
    g.addEventListener('storage', (e) => {
      if (e.__box) return;
      const k = e.key;
      if (k !== null && !k.startsWith(pfx)) { e.stopImmediatePropagation(); return; }
      if (k === null) return;
      e.stopImmediatePropagation();
      const area = e.storageArea === realStores.local ? g.localStorage : g.sessionStorage;
      const ev = new StorageEvent('storage', { key: k.slice(pfx.length), oldValue: e.oldValue, newValue: e.newValue, url: e.url });
      Object.defineProperty(ev, 'storageArea', { get: () => area });     // the page compares it with its (shimmed) localStorage
      Object.defineProperty(ev, '__box', { value: true });
      g.dispatchEvent(ev);
    }, true);
  }

  // -------------------------------------------------------------- IndexedDB
  if (typeof IDBFactory !== 'undefined') {
    redefine(IDBFactory.prototype, 'open', (o) => function open(name, ...rest) { touch(); return o.call(this, pfx + String(name), ...rest); });
    redefine(IDBFactory.prototype, 'deleteDatabase', (o) => function deleteDatabase(name, ...rest) { return o.call(this, pfx + String(name), ...rest); });
    redefine(IDBFactory.prototype, 'databases', (o) => function databases() { return o.call(this).then((l) => l.filter((d) => d.name && d.name.startsWith(pfx)).map((d) => ({ ...d, name: d.name.slice(pfx.length) }))); });
    redefineGetter(IDBDatabase.prototype, 'name', (o) => function () { const n = o.call(this); return typeof n === 'string' && n.startsWith(pfx) ? n.slice(pfx.length) : n; });
  }

  // -------------------------------------------------------------- Cache Storage
  // In dedicated workers `CacheStorage` is exposed lazily (undefined until `caches` is touched), so reach it through the instance.
  const CSP = typeof CacheStorage !== 'undefined' ? CacheStorage.prototype : (g.caches ? Object.getPrototypeOf(g.caches) : null);
  if (CSP) {
    redefine(CSP, 'open', (o) => function open(n) { touch(); return o.call(this, pfx + String(n)); });
    redefine(CSP, 'has', (o) => function has(n) { return o.call(this, pfx + String(n)); });
    redefine(CSP, 'delete', (o) => function del(n) { return o.call(this, pfx + String(n)); });
    redefine(CSP, 'keys', (o) => function keys() { return o.call(this).then((l) => l.filter((k) => k.startsWith(pfx)).map((k) => k.slice(pfx.length))); });
    redefine(CSP, 'match', (o) => function match(req, opts) {
      if (opts && opts.cacheName) return o.call(this, req, { ...opts, cacheName: pfx + opts.cacheName });
      const self = this;
      return (async () => {
        for (const n of await self.keys()) { const c = await self.open(n); const r = await c.match(req, opts); if (r) return r; }
        return undefined;
      })();
    });
  }

  // -------------------------------------------------------------- OPFS
  if (typeof StorageManager !== 'undefined' && StorageManager.prototype.getDirectory) {
    const dirName = pfx.replace(/[^a-z0-9_]/gi, '_');
    redefine(StorageManager.prototype, 'getDirectory', (o) => async function getDirectory() { touch(); const root = await o.call(this); return root.getDirectoryHandle(dirName, { create: true }); });
  }

  // -------------------------------------------------------------- BroadcastChannel / Web Locks
  if (typeof BroadcastChannel !== 'undefined') {
    const BC = BroadcastChannel;
    const NBC = function BroadcastChannel(name) { return new BC(pfx + String(name)); };
    NBC.prototype = BC.prototype;
    mark(NBC, BC);
    redefineGetter(BC.prototype, 'name', (o) => function () { const n = o.call(this); return n.startsWith(pfx) ? n.slice(pfx.length) : n; });
    try { Object.defineProperty(g, 'BroadcastChannel', { value: NBC, writable: true, configurable: true }); } catch { /* ignore */ }
  }
  if (typeof LockManager !== 'undefined') {
    redefine(LockManager.prototype, 'request', (o) => function request(name, ...rest) { return o.call(this, pfx + String(name), ...rest); });
  }

  // -------------------------------------------------------------- service workers: inert in account tabs
  if (!isWorker && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof ServiceWorkerContainer !== 'undefined') {
    const regs = new Map();
    let readyResolve; const readyP = new Promise((r) => { readyResolve = r; });
    const fakeWorker = (url) => { const w = new EventTarget(); Object.assign(w, { scriptURL: url, state: 'activated', onstatechange: null, onerror: null, postMessage() {} }); return w; };
    const fakeReg = (scope, url) => {
      const t = new EventTarget();
      Object.assign(t, { scope, installing: null, waiting: null, active: fakeWorker(url), navigationPreload: { enable: async () => {}, disable: async () => {}, getState: async () => ({ enabled: false }), setHeaderValue: async () => {} }, updateViaCache: 'imports',
        update: async () => t, unregister: async () => { regs.delete(scope); return true; }, getNotifications: async () => [], showNotification: async () => {} });
      return t;
    };
    try { if (navigator.serviceWorker.controller) sync('sw', {}); } catch { /* ignore */ }
    redefine(ServiceWorkerContainer.prototype, 'register', () => async function register(url, opts) {
      const scope = new URL((opts && opts.scope) || './', new URL(String(url), g.location.href)).href;
      let r = regs.get(scope); if (!r) { r = fakeReg(scope, new URL(String(url), g.location.href).href); regs.set(scope, r); }
      readyResolve(r);
      return r;
    });
    redefine(ServiceWorkerContainer.prototype, 'getRegistration', () => async function getRegistration(u) { for (const [s, r] of regs) if (!u || new URL(String(u), g.location.href).href.startsWith(s)) return r; return undefined; });
    redefine(ServiceWorkerContainer.prototype, 'getRegistrations', () => async function getRegistrations() { return [...regs.values()]; });
    redefineGetter(ServiceWorkerContainer.prototype, 'controller', () => function () { return null; });
    redefineGetter(ServiceWorkerContainer.prototype, 'ready', () => function () { return readyP; });
  }

  // -------------------------------------------------------------- workers (MV2 wrap; MV3 attaches the shim to workers via the debugger)
  if (cfg.wrapWorkers && !isWorker && typeof Worker !== 'undefined') {
    const blobs = new Map();
    const wrapUrl = (url, type) => {
      const abs = new URL(String(url), g.__BOX_BASE || g.location.href).href;
      const key = abs + '|' + type;
      let b = blobs.get(key);
      if (!b) {
        const prelude = `self.__BOX_BASE=${JSON.stringify(abs)};(${SRC})(${JSON.stringify({ ...cfg, wrapWorkers: true, src: SRC, inWorker: true })});` +
          `(function(){var B=self.__BOX_BASE,R=function(u){try{return new URL(String(u),B).href}catch(e){return u}};` +
          `var f=self.fetch;if(f)self.fetch=function(i,o){return f.call(self,typeof i==='string'||i instanceof URL?R(i):i,o)};` +
          `var xo=self.XMLHttpRequest&&XMLHttpRequest.prototype.open;if(xo)XMLHttpRequest.prototype.open=function(m,u){arguments[1]=R(u);return xo.apply(this,arguments)};` +
          `var is=self.importScripts;if(is)self.importScripts=function(){return is.apply(self,[].map.call(arguments,R))};` +
          `var RQ=self.Request;if(RQ){var NRQ=function Request(i,o){return new RQ(typeof i==='string'?R(i):i,o)};NRQ.prototype=RQ.prototype;self.Request=NRQ;}` +
          `if(self.Cache){['match','put','add','delete'].forEach(function(k){var f=Cache.prototype[k];if(f)Cache.prototype[k]=function(a){if(typeof a==='string'){arguments[0]=R(a)}return f.apply(this,arguments)}});}` +
          `if(self.WebSocket){var WS=self.WebSocket;var NWS=function WebSocket(u,p){return p===undefined?new WS(R(u)):new WS(R(u),p)};NWS.prototype=WS.prototype;self.WebSocket=NWS;}` +
          `if(self.EventSource){var ES=self.EventSource;var NES=function EventSource(u,o){return new ES(R(u),o)};NES.prototype=ES.prototype;self.EventSource=NES;}})();`;
        const code = type === 'module' ? `${prelude}\nawait import(${JSON.stringify(abs)});` : `${prelude}\nimportScripts(${JSON.stringify(abs)});`;
        b = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        blobs.set(key, b);
      }
      return b;
    };
    const W = Worker;
    const NW = function Worker(url, opts) { return new W(wrapUrl(url, opts && opts.type === 'module' ? 'module' : 'classic'), opts); };
    NW.prototype = W.prototype; mark(NW, W);
    try { Object.defineProperty(g, 'Worker', { value: NW, writable: true, configurable: true }); } catch { /* ignore */ }
    if (typeof SharedWorker !== 'undefined') {
      const SW = SharedWorker;
      const NSW = function SharedWorker(url, opts) {
        const o = typeof opts === 'string' ? { name: opts } : { ...(opts || {}) };
        o.name = pfx + (o.name || '');
        return new SW(wrapUrl(url, o.type === 'module' ? 'module' : 'classic'), o);
      };
      NSW.prototype = SW.prototype; mark(NSW, SW);
      try { Object.defineProperty(g, 'SharedWorker', { value: NSW, writable: true, configurable: true }); } catch { /* ignore */ }
    }
  }

  // -------------------------------------------------------------- MV3: new tabs/popups must be isolated *before* their first request
  // The debugger cannot attach to a tab before it starts loading, so pages open it as about:blank, wait for the extension
  // to attach (an *async* request the extension answers once attached — a synchronous one would deadlock when the popup
  // shares this renderer thread), then navigate it. window.open keeps its opener relation.
  if (cfg.guardPopups && !isWorker) {
    const http = (u) => /^https?:/i.test(u);
    const nativeFetch = g.fetch;
    const asyncOp = (op, args) => nativeFetch.call(g, ORIGIN() + '/__box_sync?q=' + encodeURIComponent(JSON.stringify({ op, a: cfg.acct, ...args })), { cache: 'no-store', credentials: 'omit' }).then((r) => r.json()).catch(() => null);
    redefine(Object.getOwnPropertyDescriptor(g, 'open') ? g : Window.prototype, 'open', (o) => function open(url, target, features) {
      try {
        const t = target === undefined || target === '' ? '_blank' : String(target);
        if (url === undefined || url === null || url === '' || /^(_self|_top|_parent)$/i.test(t)) return o.apply(this, arguments);
        const abs = new URL(String(url), g.location.href).href;
        if (!http(abs)) return o.apply(this, arguments);
        if (/noopener|noreferrer/.test(String(features || ''))) { asyncOp('openTab', { url: abs, active: true }); return null; }
        const w = o.call(this, 'about:blank', target, features);
        if (!w) return w;
        asyncOp('popup', {}).then(() => { try { w.location.replace(abs); } catch { try { w.location = abs; } catch { /* ignore */ } } });
        return w;
      } catch { return o.apply(this, arguments); }
    });
    // <a target=_blank>, ctrl/middle click: same treatment, as a background-created tab (links are noopener by default).
    const onClick = (e) => {
      if (!e.isTrusted || e.defaultPrevented) return;
      const a = e.target && e.target.closest ? e.target.closest('a[href], area[href]') : null;
      if (!a) return;
      const modifier = e.ctrlKey || e.metaKey || e.button === 1;
      if (!(a.target === '_blank' || modifier) || e.altKey) return;
      if (e.type === 'click' && e.button !== 0) return;
      if (e.type === 'auxclick' && e.button !== 1) return;
      const href = a.href;
      if (!http(href)) return;
      e.preventDefault();
      asyncOp('openTab', { url: href, active: !(e.ctrlKey || e.metaKey || e.button === 1) });
    };
    g.addEventListener('click', onClick);
    g.addEventListener('auxclick', onClick);
  }

  // -------------------------------------------------------------- WebRTC: no IP leak around a proxied account
  if (cfg.proxied && typeof RTCPeerConnection !== 'undefined') {
    const R = RTCPeerConnection;
    const NR = function RTCPeerConnection(conf, c) { conf = { ...(conf || {}), iceTransportPolicy: 'relay' }; return new R(conf, c); };
    NR.prototype = R.prototype; mark(NR, R);
    try { Object.defineProperty(g, 'RTCPeerConnection', { value: NR, writable: true, configurable: true }); } catch { /* ignore */ }
    if (g.webkitRTCPeerConnection) try { Object.defineProperty(g, 'webkitRTCPeerConnection', { value: NR, writable: true, configurable: true }); } catch { /* ignore */ }
  }

  // -------------------------------------------------------------- frames created by page script: shim them before the page can use them
  if (!isWorker && SRC && typeof HTMLIFrameElement !== 'undefined') {
    const ensure = (w) => {
      try {
        if (!w || w.__boxShimmed) return;
        if (w.origin !== g.origin) return;                 // cross-origin: it gets its own injection
        w.eval(`(${SRC})(${JSON.stringify(cfg)})`);
      } catch { /* detached or cross-origin */ }
    };
    redefineGetter(HTMLIFrameElement.prototype, 'contentWindow', (o) => function () { const w = o.call(this); ensure(w); return w; });
    redefineGetter(HTMLIFrameElement.prototype, 'contentDocument', (o) => function () { const d = o.call(this); if (d) ensure(d.defaultView); return d; });
    redefine(Object.getOwnPropertyDescriptor(g, 'open') ? g : Window.prototype, 'open', (o) => function open() { const w = o.apply(this, arguments); ensure(w); return w; });
  }
}
