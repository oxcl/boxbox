(() => {
  // src/core/ext.js
  var TARGET = true ? "chrome-mv2" : "firefox";
  var IS_FIREFOX = TARGET === "firefox";
  var IS_CHROME = !IS_FIREFOX;
  var IS_MV2 = TARGET === "chrome-mv2";
  var g = globalThis;
  var base = typeof g.browser !== "undefined" && g.browser.runtime ? g.browser : g.chrome;
  var SYNC = /* @__PURE__ */ new Set(["getURL", "getManifest", "connect", "connectNative", "getViews", "getBackgroundPage_sync"]);
  function promisified(obj) {
    return new Proxy(obj, {
      get(t, k) {
        const v = t[k];
        if (typeof k !== "string") return v;
        if (typeof v === "function" && SYNC.has(k)) return v.bind(t);
        if (typeof v === "function") {
          return (...args) => {
            if (typeof args[args.length - 1] === "function") return v.apply(t, args);
            return new Promise((resolve, reject) => {
              try {
                v.call(t, ...args, (res) => {
                  const e = g.chrome.runtime.lastError;
                  if (e) reject(new Error(e.message));
                  else resolve(res);
                });
              } catch (e) {
                reject(e);
              }
            });
          };
        }
        if (v && typeof v === "object" && !/^on[A-Z]/.test(k)) return promisified(v);
        return v;
      }
    });
  }
  var ext = IS_MV2 ? promisified(base) : base;

  // src/chrome/shim.js
  function shim(cfg) {
    "use strict";
    const g2 = globalThis;
    if (g2.__boxShimmed) return;
    const isWorker = typeof WorkerGlobalScope !== "undefined" && g2 instanceof WorkerGlobalScope;
    const pfx = cfg.pfx;
    const ORIGIN = () => {
      try {
        return g2.origin || g2.location.origin;
      } catch {
        return "";
      }
    };
    const SRC = cfg.src;
    try {
      Object.defineProperty(g2, "__boxShimmed", { value: true, enumerable: false });
    } catch {
      return;
    }
    const patched = /* @__PURE__ */ new WeakMap();
    const origFnToString = Function.prototype.toString;
    const fakeToString = function toString() {
      const o = patched.get(this);
      return origFnToString.call(o || this);
    };
    patched.set(fakeToString, origFnToString);
    try {
      Object.defineProperty(Function.prototype, "toString", { value: fakeToString, writable: true, configurable: true });
    } catch {
    }
    const mark2 = (fn, orig) => {
      try {
        patched.set(fn, orig);
      } catch {
      }
      return fn;
    };
    const redefine = (obj, key, make) => {
      if (!obj) return;
      const d = Object.getOwnPropertyDescriptor(obj, key);
      if (!d) return;
      if ("value" in d && typeof d.value === "function") {
        const o = d.value;
        const n = make(o);
        try {
          Object.defineProperty(obj, key, { ...d, value: mark2(n, o) });
        } catch {
        }
      }
    };
    const redefineGetter = (obj, key, make) => {
      if (!obj) return;
      const d = Object.getOwnPropertyDescriptor(obj, key);
      if (!d || !d.get) return;
      const o = d.get;
      const n = make(o);
      try {
        Object.defineProperty(obj, key, { ...d, get: mark2(n, o) });
      } catch {
      }
    };
    const sync = (op, args) => {
      try {
        const x = new XMLHttpRequest();
        x.open("GET", ORIGIN() + "/__box_sync?q=" + encodeURIComponent(JSON.stringify({ op, a: cfg.acct, ...args })), false);
        x.send();
        if (x.status === 200) return JSON.parse(x.responseText);
      } catch {
      }
      return null;
    };
    let touched = false;
    const touch = () => {
      if (!touched) {
        touched = true;
        sync("touch", { o: ORIGIN() });
      }
    };
    const docUrl = () => {
      const p = g2.location.protocol;
      return p === "about:" || p === "blob:" || p === "data:" ? ORIGIN() + "/" : g2.location.href;
    };
    if (typeof Document !== "undefined") {
      let last = "";
      const d = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
      if (d) {
        const get = function() {
          const r = sync("c.get", { u: docUrl() });
          if (r) last = r.v;
          return last;
        };
        const set = function(v) {
          const r = sync("c.set", { u: docUrl(), v: String(v) });
          if (r && r.v !== void 0) last = r.v;
        };
        mark2(get, d.get);
        mark2(set, d.set);
        Object.defineProperty(Document.prototype, "cookie", { get, set, configurable: true, enumerable: true });
      }
    }
    if (typeof CookieStore !== "undefined") {
      const toObj = (c) => ({ name: c.name, value: c.value, domain: c.hostOnly ? null : c.domain, path: c.path, expires: c.expires, secure: c.secure, sameSite: c.sameSite || "lax", partitioned: false });
      const list = () => {
        const r = sync("c.list", { u: docUrl() });
        return r ? r.v : [];
      };
      redefine(CookieStore.prototype, "getAll", () => async function getAll(arg) {
        const n = typeof arg === "string" ? arg : arg && arg.name;
        return list().filter((c) => !n || c.name === n).map(toObj);
      });
      redefine(CookieStore.prototype, "get", () => async function get(arg) {
        const n = typeof arg === "string" ? arg : arg && arg.name;
        const c = list().find((x) => x.name === n);
        return c ? toObj(c) : null;
      });
      redefine(CookieStore.prototype, "set", () => async function set(a, b) {
        const o = typeof a === "string" ? { name: a, value: b } : a;
        let s = `${o.name}=${o.value}; Path=${o.path || "/"}`;
        if (o.domain) s += `; Domain=${o.domain}`;
        if (o.expires) s += `; Expires=${new Date(o.expires).toUTCString()}`;
        if (o.sameSite) s += `; SameSite=${o.sameSite}`;
        if (docUrl().startsWith("https:") || /localhost/.test(ORIGIN())) s += "; Secure";
        sync("c.set", { u: docUrl(), v: s });
      });
      redefine(CookieStore.prototype, "delete", () => async function del(arg) {
        const o = typeof arg === "string" ? { name: arg } : arg;
        sync("c.set", { u: docUrl(), v: `${o.name}=; Path=${o.path || "/"}${o.domain ? "; Domain=" + o.domain : ""}; Max-Age=0` });
      });
    }
    const makeStorage = (real, kind) => {
      const keys = () => {
        const out = [];
        for (let i = 0; i < real.length; i++) {
          const k = real.key(i);
          if (k !== null && k.startsWith(pfx)) out.push(k.slice(pfx.length));
        }
        return out;
      };
      const methods = {
        getItem: (k) => real.getItem(pfx + String(k)),
        setItem: (k, v) => {
          if (kind === "local") touch();
          real.setItem(pfx + String(k), String(v));
        },
        removeItem: (k) => real.removeItem(pfx + String(k)),
        clear: () => {
          for (const k of keys()) real.removeItem(pfx + k);
        },
        key: (i) => {
          const ks = keys();
          i = Number(i) >>> 0;
          return i < ks.length ? ks[i] : null;
        }
      };
      const bound = {};
      for (const [n, f] of Object.entries(methods)) {
        const orig = Storage.prototype[n];
        bound[n] = mark2(function() {
          return f.apply(null, arguments);
        }, orig);
        Object.defineProperty(bound[n], "name", { value: n });
      }
      const target = Object.create(Storage.prototype);
      const proxy = new Proxy(target, {
        get(t, k, r) {
          if (typeof k === "symbol") return Reflect.get(Storage.prototype, k, proxy);
          if (k === "length") return keys().length;
          if (Object.prototype.hasOwnProperty.call(bound, k)) return bound[k];
          if (k in Storage.prototype) return Reflect.get(Storage.prototype, k, r);
          const v = real.getItem(pfx + k);
          return v === null ? void 0 : v;
        },
        set(t, k, v) {
          if (typeof k === "symbol") return false;
          methods.setItem(k, v);
          return true;
        },
        deleteProperty(t, k) {
          if (typeof k === "symbol") return true;
          methods.removeItem(k);
          return true;
        },
        has(t, k) {
          if (typeof k === "symbol") return k in Storage.prototype;
          return k in bound || k === "length" || real.getItem(pfx + k) !== null || k in Storage.prototype;
        },
        ownKeys() {
          return keys();
        },
        getOwnPropertyDescriptor(t, k) {
          if (typeof k !== "string") return void 0;
          const v = real.getItem(pfx + k);
          return v === null ? void 0 : { value: v, writable: true, enumerable: true, configurable: true };
        },
        defineProperty(t, k, desc) {
          if ("value" in desc) methods.setItem(k, desc.value);
          return true;
        },
        getPrototypeOf() {
          return Storage.prototype;
        }
      });
      return proxy;
    };
    const wrapStorageGlobal = (name, kind) => {
      if (!(name in g2)) return;
      const host = Object.getOwnPropertyDescriptor(g2, name) ? g2 : Object.getPrototypeOf(g2);
      const d = Object.getOwnPropertyDescriptor(host, name);
      if (!d || !d.get) return;
      let cached, realRef;
      const get = function() {
        const real = d.get.call(this);
        if (!cached || realRef !== real) {
          realRef = real;
          cached = makeStorage(real, kind);
        }
        return cached;
      };
      mark2(get, d.get);
      try {
        Object.defineProperty(host, name, { ...d, get });
      } catch {
      }
    };
    if (typeof Storage !== "undefined" && !isWorker) {
      wrapStorageGlobal("localStorage", "local");
      wrapStorageGlobal("sessionStorage", "session");
      try {
        if (g2.top === g2) Object.getOwnPropertyDescriptor(Storage.prototype, "setItem").value.call(Object.getOwnPropertyDescriptor(g2, "sessionStorage").get.call(g2), "__box_acct", cfg.acct);
      } catch {
      }
      g2.addEventListener("storage", (e) => {
        if (e.__box) return;
        const k = e.key;
        if (k !== null && !k.startsWith(pfx)) {
          e.stopImmediatePropagation();
          return;
        }
        if (k === null) return;
        e.stopImmediatePropagation();
        const area = e.storageArea === Object.getOwnPropertyDescriptor(g2, "localStorage")?.get?.call(g2) ? g2.localStorage : g2.sessionStorage;
        const ev = new StorageEvent("storage", { key: k.slice(pfx.length), oldValue: e.oldValue, newValue: e.newValue, url: e.url, storageArea: area });
        Object.defineProperty(ev, "__box", { value: true });
        g2.dispatchEvent(ev);
      }, true);
    }
    if (typeof IDBFactory !== "undefined") {
      redefine(IDBFactory.prototype, "open", (o) => function open(name, ...rest) {
        touch();
        return o.call(this, pfx + String(name), ...rest);
      });
      redefine(IDBFactory.prototype, "deleteDatabase", (o) => function deleteDatabase(name, ...rest) {
        return o.call(this, pfx + String(name), ...rest);
      });
      redefine(IDBFactory.prototype, "databases", (o) => function databases() {
        return o.call(this).then((l) => l.filter((d) => d.name && d.name.startsWith(pfx)).map((d) => ({ ...d, name: d.name.slice(pfx.length) })));
      });
      redefineGetter(IDBDatabase.prototype, "name", (o) => function() {
        const n = o.call(this);
        return typeof n === "string" && n.startsWith(pfx) ? n.slice(pfx.length) : n;
      });
    }
    if (typeof CacheStorage !== "undefined") {
      redefine(CacheStorage.prototype, "open", (o) => function open(n) {
        touch();
        return o.call(this, pfx + String(n));
      });
      redefine(CacheStorage.prototype, "has", (o) => function has(n) {
        return o.call(this, pfx + String(n));
      });
      redefine(CacheStorage.prototype, "delete", (o) => function del(n) {
        return o.call(this, pfx + String(n));
      });
      redefine(CacheStorage.prototype, "keys", (o) => function keys() {
        return o.call(this).then((l) => l.filter((k) => k.startsWith(pfx)).map((k) => k.slice(pfx.length)));
      });
      redefine(CacheStorage.prototype, "match", (o) => function match(req, opts) {
        if (opts && opts.cacheName) return o.call(this, req, { ...opts, cacheName: pfx + opts.cacheName });
        const self2 = this;
        return (async () => {
          for (const n of await self2.keys()) {
            const c = await self2.open(n);
            const r = await c.match(req, opts);
            if (r) return r;
          }
          return void 0;
        })();
      });
    }
    if (typeof StorageManager !== "undefined" && StorageManager.prototype.getDirectory) {
      const dirName = pfx.replace(/[^a-z0-9_]/gi, "_");
      redefine(StorageManager.prototype, "getDirectory", (o) => async function getDirectory() {
        touch();
        const root = await o.call(this);
        return root.getDirectoryHandle(dirName, { create: true });
      });
    }
    if (typeof BroadcastChannel !== "undefined") {
      const BC = BroadcastChannel;
      const NBC = function BroadcastChannel2(name) {
        return new BC(pfx + String(name));
      };
      NBC.prototype = BC.prototype;
      mark2(NBC, BC);
      redefineGetter(BC.prototype, "name", (o) => function() {
        const n = o.call(this);
        return n.startsWith(pfx) ? n.slice(pfx.length) : n;
      });
      try {
        Object.defineProperty(g2, "BroadcastChannel", { value: NBC, writable: true, configurable: true });
      } catch {
      }
    }
    if (typeof LockManager !== "undefined") {
      redefine(LockManager.prototype, "request", (o) => function request(name, ...rest) {
        return o.call(this, pfx + String(name), ...rest);
      });
    }
    if (!isWorker && typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof ServiceWorkerContainer !== "undefined") {
      const regs = /* @__PURE__ */ new Map();
      let readyResolve;
      const readyP = new Promise((r) => {
        readyResolve = r;
      });
      const fakeWorker = (url) => {
        const w = new EventTarget();
        Object.assign(w, { scriptURL: url, state: "activated", onstatechange: null, onerror: null, postMessage() {
        } });
        return w;
      };
      const fakeReg = (scope, url) => {
        const t = new EventTarget();
        Object.assign(t, {
          scope,
          installing: null,
          waiting: null,
          active: fakeWorker(url),
          navigationPreload: { enable: async () => {
          }, disable: async () => {
          }, getState: async () => ({ enabled: false }), setHeaderValue: async () => {
          } },
          updateViaCache: "imports",
          update: async () => t,
          unregister: async () => {
            regs.delete(scope);
            return true;
          },
          getNotifications: async () => [],
          showNotification: async () => {
          }
        });
        return t;
      };
      try {
        if (navigator.serviceWorker.controller) sync("sw", {});
      } catch {
      }
      redefine(ServiceWorkerContainer.prototype, "register", () => async function register(url, opts) {
        const scope = new URL(opts && opts.scope || "./", new URL(String(url), g2.location.href)).href;
        let r = regs.get(scope);
        if (!r) {
          r = fakeReg(scope, new URL(String(url), g2.location.href).href);
          regs.set(scope, r);
        }
        readyResolve(r);
        return r;
      });
      redefine(ServiceWorkerContainer.prototype, "getRegistration", () => async function getRegistration(u) {
        for (const [s, r] of regs) if (!u || new URL(String(u), g2.location.href).href.startsWith(s)) return r;
        return void 0;
      });
      redefine(ServiceWorkerContainer.prototype, "getRegistrations", () => async function getRegistrations() {
        return [...regs.values()];
      });
      redefineGetter(ServiceWorkerContainer.prototype, "controller", () => function() {
        return null;
      });
      redefineGetter(ServiceWorkerContainer.prototype, "ready", () => function() {
        return readyP;
      });
    }
    if (cfg.wrapWorkers && !isWorker && typeof Worker !== "undefined") {
      const blobs = /* @__PURE__ */ new Map();
      const wrapUrl = (url, type) => {
        const abs = new URL(String(url), g2.location.href).href;
        const key = abs + "|" + type;
        let b = blobs.get(key);
        if (!b) {
          const prelude = `self.__BOX_BASE=${JSON.stringify(abs)};(${SRC})(${JSON.stringify({ ...cfg, wrapWorkers: true, src: SRC, inWorker: true })});(function(){var B=self.__BOX_BASE,R=function(u){try{return new URL(String(u),B).href}catch(e){return u}};var f=self.fetch;if(f)self.fetch=function(i,o){return f.call(self,typeof i==='string'||i instanceof URL?R(i):i,o)};var xo=self.XMLHttpRequest&&XMLHttpRequest.prototype.open;if(xo)XMLHttpRequest.prototype.open=function(m,u){arguments[1]=R(u);return xo.apply(this,arguments)};var is=self.importScripts;if(is)self.importScripts=function(){return is.apply(self,[].map.call(arguments,R))};})();`;
          const code = type === "module" ? `${prelude}
await import(${JSON.stringify(abs)});` : `${prelude}
importScripts(${JSON.stringify(abs)});`;
          b = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
          blobs.set(key, b);
        }
        return b;
      };
      const W = Worker;
      const NW = function Worker2(url, opts) {
        return new W(wrapUrl(url, opts && opts.type === "module" ? "module" : "classic"), opts);
      };
      NW.prototype = W.prototype;
      mark2(NW, W);
      try {
        Object.defineProperty(g2, "Worker", { value: NW, writable: true, configurable: true });
      } catch {
      }
      if (typeof SharedWorker !== "undefined") {
        const SW = SharedWorker;
        const NSW = function SharedWorker2(url, opts) {
          const o = typeof opts === "string" ? { name: opts } : { ...opts || {} };
          o.name = pfx + (o.name || "");
          return new SW(wrapUrl(url, o.type === "module" ? "module" : "classic"), o);
        };
        NSW.prototype = SW.prototype;
        mark2(NSW, SW);
        try {
          Object.defineProperty(g2, "SharedWorker", { value: NSW, writable: true, configurable: true });
        } catch {
        }
      }
    }
    if (cfg.guardPopups && !isWorker) {
      const http = (u) => /^https?:/i.test(u);
      const asyncOp = (op, args) => g2.fetch(ORIGIN() + "/__box_sync?q=" + encodeURIComponent(JSON.stringify({ op, a: cfg.acct, ...args })), { cache: "no-store", credentials: "omit" }).then((r) => r.json()).catch(() => null);
      redefine(Object.getOwnPropertyDescriptor(g2, "open") ? g2 : Window.prototype, "open", (o) => function open(url, target, features) {
        try {
          const t = target === void 0 || target === "" ? "_blank" : String(target);
          if (url === void 0 || url === null || url === "" || /^(_self|_top|_parent)$/i.test(t)) return o.apply(this, arguments);
          const abs = new URL(String(url), g2.location.href).href;
          if (!http(abs)) return o.apply(this, arguments);
          if (/noopener|noreferrer/.test(String(features || ""))) {
            asyncOp("openTab", { url: abs, active: true });
            return null;
          }
          const w = o.call(this, "about:blank", target, features);
          if (!w) return w;
          asyncOp("popup", {}).then(() => {
            try {
              w.location.replace(abs);
            } catch {
              try {
                w.location = abs;
              } catch {
              }
            }
          });
          return w;
        } catch {
          return o.apply(this, arguments);
        }
      });
      const onClick = (e) => {
        if (!e.isTrusted || e.defaultPrevented) return;
        const a = e.target && e.target.closest ? e.target.closest("a[href], area[href]") : null;
        if (!a) return;
        const modifier = e.ctrlKey || e.metaKey || e.button === 1;
        if (!(a.target === "_blank" || modifier) || e.altKey) return;
        if (e.type === "click" && e.button !== 0) return;
        if (e.type === "auxclick" && e.button !== 1) return;
        const href = a.href;
        if (!http(href)) return;
        e.preventDefault();
        asyncOp("openTab", { url: href, active: !(e.ctrlKey || e.metaKey || e.button === 1) });
      };
      g2.addEventListener("click", onClick);
      g2.addEventListener("auxclick", onClick);
    }
    if (cfg.proxied && typeof RTCPeerConnection !== "undefined") {
      const R = RTCPeerConnection;
      const NR = function RTCPeerConnection2(conf, c) {
        conf = { ...conf || {}, iceTransportPolicy: "relay" };
        return new R(conf, c);
      };
      NR.prototype = R.prototype;
      mark2(NR, R);
      try {
        Object.defineProperty(g2, "RTCPeerConnection", { value: NR, writable: true, configurable: true });
      } catch {
      }
      if (g2.webkitRTCPeerConnection) try {
        Object.defineProperty(g2, "webkitRTCPeerConnection", { value: NR, writable: true, configurable: true });
      } catch {
      }
    }
    if (!isWorker && SRC && typeof HTMLIFrameElement !== "undefined") {
      const ensure = (w) => {
        try {
          if (!w || w.__boxShimmed) return;
          if (w.origin !== g2.origin) return;
          w.eval(`(${SRC})(${JSON.stringify(cfg)})`);
        } catch {
        }
      };
      redefineGetter(HTMLIFrameElement.prototype, "contentWindow", (o) => function() {
        const w = o.call(this);
        ensure(w);
        return w;
      });
      redefineGetter(HTMLIFrameElement.prototype, "contentDocument", (o) => function() {
        const d = o.call(this);
        if (d) ensure(d.defaultView);
        return d;
      });
      redefine(Object.getOwnPropertyDescriptor(g2, "open") ? g2 : Window.prototype, "open", (o) => function open() {
        const w = o.apply(this, arguments);
        ensure(w);
        return w;
      });
    }
  }

  // src/content/content.js
  var isTop = window.top === window;
  var lastGesture = 0;
  var lastPing = -Infinity;
  function syncCall(op, args) {
    try {
      if (!/^https?:/.test(location.protocol) && !/^https?:/.test(self.origin)) return null;
      const x = new XMLHttpRequest();
      x.open("GET", (self.origin || location.origin) + "/__box_sync?q=" + encodeURIComponent(JSON.stringify({ op, ...args })), false);
      x.send();
      return x.status === 200 ? JSON.parse(x.responseText) : null;
    } catch {
      return null;
    }
  }
  var PING_EVENTS = /* @__PURE__ */ new Set(["click", "auxclick", "keydown", "submit", "contextmenu", "mousedown"]);
  var mark = (e) => {
    if (!e.isTrusted) return;
    lastGesture = performance.now();
    if (PING_EVENTS.has(e.type) && lastGesture - lastPing > 250) {
      lastPing = lastGesture;
      syncCall("gesture", {});
    }
  };
  if (true) {
    const cfg = syncCall("hello", {});
    if (cfg && cfg.acct) {
      const src = shim.toString();
      const full = { ...cfg, src, wrapWorkers: true };
      const s = document.createElement("script");
      if (cfg.nonce) s.setAttribute("nonce", cfg.nonce);
      s.textContent = `(${src})(${JSON.stringify(full)});`;
      (document.documentElement || document.head || document).prepend(s);
      s.remove();
    }
  }
  for (const t of ["mousedown", "pointerdown", "click", "auxclick", "keydown", "submit", "contextmenu", "touchstart"])
    window.addEventListener(t, mark, { capture: true, passive: true });
  var identity = null;
  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.box) return;
    if (msg.type === "gesture?") {
      const recent = performance.now() - lastGesture < 1500 && lastGesture > 0;
      if (recent) sendResponse({ recent: true });
      return;
    }
    if (msg.type === "identity") {
      applyIdentity(msg.identity);
      return;
    }
    if (msg.type === "wipe") {
      wipeAccount(msg.accountId, msg.prefix).then((r) => sendResponse(r), (e) => sendResponse({ error: String(e) }));
      return true;
    }
  });
  async function refreshIdentity() {
    try {
      applyIdentity(await ext.runtime.sendMessage({ box: true, type: "identity" }));
    } catch {
    }
  }
  function applyIdentity(id) {
    identity = id;
    if (isTop && IS_CHROME && id && !id.account) {
      try {
        const m = sessionStorage.getItem("__box_acct");
        if (m) {
          sessionStorage.removeItem("__box_acct");
          if (id.restorable) ext.runtime.sendMessage({ type: "adopt", accountId: m }).catch(() => {
          });
        }
      } catch {
      }
    }
    if (!isTop) return;
    const acct = id && id.account;
    if (acct && id.settings.border) showBorder(acct, id.status);
    else removeBorder();
    if (acct && id.settings.badge) startBadge(acct);
    else stopBadge();
  }
  var HOST_ID = "__box_border__";
  var hostEl = null;
  var rootObserver = null;
  var moveHandler = null;
  function showBorder(acct, status) {
    if (!hostEl) {
      hostEl = document.createElement("div");
      hostEl.id = HOST_ID;
      hostEl.setAttribute("data-box-border", "");
      hostEl.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
      const root2 = hostEl.attachShadow({ mode: "open" });
      root2.innerHTML = `
      <style>
        :host{all:initial}
        .frame{position:fixed;inset:0;pointer-events:none;box-sizing:border-box;border:3px solid var(--c);border-radius:0;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.35), inset 0 0 28px -6px var(--c);opacity:0;animation:in .35s ease-out forwards}
        .pill{position:fixed;top:0;left:50%;transform:translate(-50%,-110%);display:flex;align-items:center;gap:7px;padding:4px 12px 5px;
          border-radius:0 0 12px 12px;background:var(--c);color:#fff;font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
          letter-spacing:.01em;pointer-events:none;box-shadow:0 4px 14px -4px rgba(0,0,0,.45);white-space:nowrap;max-width:60vw;
          animation:drop .45s .1s cubic-bezier(.2,.9,.25,1.2) forwards;transition:opacity .2s, transform .25s}
        .pill.away{opacity:0;transform:translate(-50%,-110%)}
        .dot{width:8px;height:8px;border-radius:50%;background:#fff;opacity:.9;flex:none}
        .warn{background:#fff;color:#b45309;border-radius:8px;padding:1px 6px;font-size:11px}
        .name{overflow:hidden;text-overflow:ellipsis}
        @keyframes in{to{opacity:1}}
        @keyframes drop{to{transform:translate(-50%,0)}}
        @media (prefers-reduced-motion:reduce){.frame,.pill{animation-duration:.01s}}
      </style>
      <div class="frame" part="frame"></div>
      <div class="pill" part="label"><span class="dot"></span><span class="name"></span><span class="warn" hidden></span></div>`;
      (document.documentElement || document).appendChild(hostEl);
      moveHandler = (e) => {
        const p = hostEl?.shadowRoot?.querySelector(".pill");
        if (p) p.classList.toggle("away", e.clientY < 46 && Math.abs(e.clientX - innerWidth / 2) < 180);
      };
      window.addEventListener("mousemove", moveHandler, { passive: true });
      rootObserver = new MutationObserver(() => {
        if (hostEl && !hostEl.isConnected && document.documentElement) document.documentElement.appendChild(hostEl);
      });
      rootObserver.observe(document, { childList: true, subtree: false });
      if (document.documentElement) rootObserver.observe(document.documentElement, { childList: true });
    }
    const root = hostEl.shadowRoot;
    hostEl.style.setProperty("--c", acct.color);
    hostEl.dataset.account = acct.name;
    hostEl.dataset.color = acct.color;
    hostEl.dataset.accountId = acct.id;
    root.host.style.setProperty("--c", acct.color);
    root.querySelector(".frame").style.setProperty("--c", acct.color);
    const pill = root.querySelector(".pill");
    pill.style.setProperty("--c", acct.color);
    root.querySelector(".name").textContent = acct.name;
    const warn = root.querySelector(".warn");
    const lvl = status && status.level;
    warn.hidden = !(lvl && lvl !== "ok");
    warn.textContent = lvl === "fail" ? "\u26A0 proxy" : lvl === "warn" ? "\u26A0 check" : "";
    hostEl.dataset.status = lvl || "ok";
    hostEl.title = "";
  }
  function removeBorder() {
    if (!hostEl) return;
    window.removeEventListener("mousemove", moveHandler);
    rootObserver?.disconnect();
    rootObserver = null;
    hostEl.remove();
    hostEl = null;
  }
  var BADGE_ATTR = "data-box-icon";
  var badgeColor = null;
  var headObserver = null;
  var badgeBusy = false;
  var lastBadged = "";
  var iconLinks = () => [...document.querySelectorAll('link[rel~="icon" i], link[rel="shortcut icon" i]')].filter((l) => !l.hasAttribute(BADGE_ATTR));
  function startBadge(acct) {
    if (badgeColor === acct.color && headObserver) return;
    badgeColor = acct.color;
    lastBadged = "";
    const run = () => applyBadge();
    if (!headObserver) {
      headObserver = new MutationObserver(() => {
        if (!badgeBusy) setTimeout(run, 30);
      });
      const observe = () => document.head && headObserver.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "rel"] });
      if (document.head) observe();
      else document.addEventListener("DOMContentLoaded", observe, { once: true });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }
  function stopBadge() {
    headObserver?.disconnect();
    headObserver = null;
    badgeColor = null;
    lastBadged = "";
    document.querySelectorAll(`link[${BADGE_ATTR}]`).forEach((l) => l.remove());
    document.querySelectorAll("link[data-box-hidden]").forEach((l) => {
      l.rel = l.getAttribute("data-box-hidden");
      l.removeAttribute("data-box-hidden");
    });
  }
  async function applyBadge() {
    if (!badgeColor || !document.head) return;
    const links = iconLinks();
    const href = links.length ? new URL(links[links.length - 1].getAttribute("href") || "", document.baseURI).href : new URL("/favicon.ico", location.href).href;
    const key = href + "|" + badgeColor;
    if (key === lastBadged && document.querySelector(`link[${BADGE_ATTR}]`)) return;
    badgeBusy = true;
    try {
      const res = await ext.runtime.sendMessage({ box: true, type: "badgeIcon", href, color: badgeColor, host: location.hostname });
      if (!res || !res.dataUrl || !badgeColor) return;
      for (const l of iconLinks()) {
        l.setAttribute("data-box-hidden", l.getAttribute("rel"));
        l.setAttribute("rel", "x-box-hidden");
      }
      let mine = document.querySelector(`link[${BADGE_ATTR}]`);
      if (!mine) {
        mine = document.createElement("link");
        mine.setAttribute(BADGE_ATTR, "");
        document.head.appendChild(mine);
      }
      mine.rel = "icon";
      if (res.type) mine.type = res.type;
      else mine.removeAttribute("type");
      mine.href = res.dataUrl;
      lastBadged = key;
    } catch {
    } finally {
      setTimeout(() => {
        badgeBusy = false;
      }, 60);
    }
  }
  async function wipeAccount(accountId, prefix) {
    const out = { ls: 0, idb: 0, caches: 0, opfs: 0 };
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) {
        localStorage.removeItem(k);
        out.ls++;
      }
      for (const k of Object.keys(sessionStorage)) if (k.startsWith(prefix)) {
        sessionStorage.removeItem(k);
      }
    } catch {
    }
    try {
      if (indexedDB.databases) {
        for (const d of await indexedDB.databases()) if (d.name && d.name.startsWith(prefix)) {
          await new Promise((res) => {
            const r = indexedDB.deleteDatabase(d.name);
            r.onsuccess = r.onerror = r.onblocked = () => res();
          });
          out.idb++;
        }
      }
    } catch {
    }
    try {
      if (window.caches) {
        for (const n of await caches.keys()) if (n.startsWith(prefix)) {
          await caches.delete(n);
          out.caches++;
        }
      }
    } catch {
    }
    try {
      if (navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(prefix.replace(/[^a-z0-9_]/gi, "_"), { recursive: true });
        out.opfs++;
      }
    } catch {
    }
    return out;
  }
  async function checkPendingWipes() {
    if (!IS_CHROME) return;
    try {
      const r = await ext.runtime.sendMessage({ box: true, type: "pendingWipes", origin: location.origin });
      if (r && r.wipes) for (const w of r.wipes) {
        await wipeAccount(w.accountId, w.prefix);
        await ext.runtime.sendMessage({ box: true, type: "wipeDone", origin: location.origin, accountId: w.accountId });
      }
    } catch {
    }
  }
  refreshIdentity();
  if (isTop && IS_CHROME) setTimeout(checkPendingWipes, 300);
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) refreshIdentity();
  });
})();
