(() => {
  // src/chrome/shim.js
  function shim(cfg) {
    "use strict";
    const g = globalThis;
    if (g.__boxShimmed) return;
    const isWorker = typeof WorkerGlobalScope !== "undefined" && g instanceof WorkerGlobalScope;
    const pfx = cfg.pfx;
    const ORIGIN = () => {
      try {
        return g.origin || g.location.origin;
      } catch {
        return "";
      }
    };
    const SRC = cfg.src;
    try {
      Object.defineProperty(g, "__boxShimmed", { value: true, enumerable: false });
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
    const mark = (fn, orig) => {
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
          Object.defineProperty(obj, key, { ...d, value: mark(n, o) });
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
        Object.defineProperty(obj, key, { ...d, get: mark(n, o) });
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
      const p = g.location.protocol;
      return p === "about:" || p === "blob:" || p === "data:" ? ORIGIN() + "/" : g.location.href;
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
        mark(get, d.get);
        mark(set, d.set);
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
        bound[n] = mark(function() {
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
      if (!(name in g)) return;
      const host = Object.getOwnPropertyDescriptor(g, name) ? g : Object.getPrototypeOf(g);
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
      mark(get, d.get);
      try {
        Object.defineProperty(host, name, { ...d, get });
      } catch {
      }
    };
    if (typeof Storage !== "undefined" && !isWorker) {
      wrapStorageGlobal("localStorage", "local");
      wrapStorageGlobal("sessionStorage", "session");
      try {
        if (g.top === g) Object.getOwnPropertyDescriptor(Storage.prototype, "setItem").value.call(Object.getOwnPropertyDescriptor(g, "sessionStorage").get.call(g), "__box_acct", cfg.acct);
      } catch {
      }
      g.addEventListener("storage", (e) => {
        if (e.__box) return;
        const k = e.key;
        if (k !== null && !k.startsWith(pfx)) {
          e.stopImmediatePropagation();
          return;
        }
        if (k === null) return;
        e.stopImmediatePropagation();
        const area = e.storageArea === Object.getOwnPropertyDescriptor(g, "localStorage")?.get?.call(g) ? g.localStorage : g.sessionStorage;
        const ev = new StorageEvent("storage", { key: k.slice(pfx.length), oldValue: e.oldValue, newValue: e.newValue, url: e.url, storageArea: area });
        Object.defineProperty(ev, "__box", { value: true });
        g.dispatchEvent(ev);
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
        const self = this;
        return (async () => {
          for (const n of await self.keys()) {
            const c = await self.open(n);
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
      mark(NBC, BC);
      redefineGetter(BC.prototype, "name", (o) => function() {
        const n = o.call(this);
        return n.startsWith(pfx) ? n.slice(pfx.length) : n;
      });
      try {
        Object.defineProperty(g, "BroadcastChannel", { value: NBC, writable: true, configurable: true });
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
        const scope = new URL(opts && opts.scope || "./", new URL(String(url), g.location.href)).href;
        let r = regs.get(scope);
        if (!r) {
          r = fakeReg(scope, new URL(String(url), g.location.href).href);
          regs.set(scope, r);
        }
        readyResolve(r);
        return r;
      });
      redefine(ServiceWorkerContainer.prototype, "getRegistration", () => async function getRegistration(u) {
        for (const [s, r] of regs) if (!u || new URL(String(u), g.location.href).href.startsWith(s)) return r;
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
        const abs = new URL(String(url), g.location.href).href;
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
      mark(NW, W);
      try {
        Object.defineProperty(g, "Worker", { value: NW, writable: true, configurable: true });
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
        mark(NSW, SW);
        try {
          Object.defineProperty(g, "SharedWorker", { value: NSW, writable: true, configurable: true });
        } catch {
        }
      }
    }
    if (cfg.guardPopups && !isWorker) {
      const http = (u) => /^https?:/i.test(u);
      const asyncOp = (op, args) => g.fetch(ORIGIN() + "/__box_sync?q=" + encodeURIComponent(JSON.stringify({ op, a: cfg.acct, ...args })), { cache: "no-store", credentials: "omit" }).then((r) => r.json()).catch(() => null);
      redefine(Object.getOwnPropertyDescriptor(g, "open") ? g : Window.prototype, "open", (o) => function open(url, target, features) {
        try {
          const t = target === void 0 || target === "" ? "_blank" : String(target);
          if (url === void 0 || url === null || url === "" || /^(_self|_top|_parent)$/i.test(t)) return o.apply(this, arguments);
          const abs = new URL(String(url), g.location.href).href;
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
      g.addEventListener("click", onClick);
      g.addEventListener("auxclick", onClick);
    }
    if (cfg.proxied && typeof RTCPeerConnection !== "undefined") {
      const R = RTCPeerConnection;
      const NR = function RTCPeerConnection2(conf, c) {
        conf = { ...conf || {}, iceTransportPolicy: "relay" };
        return new R(conf, c);
      };
      NR.prototype = R.prototype;
      mark(NR, R);
      try {
        Object.defineProperty(g, "RTCPeerConnection", { value: NR, writable: true, configurable: true });
      } catch {
      }
      if (g.webkitRTCPeerConnection) try {
        Object.defineProperty(g, "webkitRTCPeerConnection", { value: NR, writable: true, configurable: true });
      } catch {
      }
    }
    if (!isWorker && SRC && typeof HTMLIFrameElement !== "undefined") {
      const ensure = (w) => {
        try {
          if (!w || w.__boxShimmed) return;
          if (w.origin !== g.origin) return;
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
      redefine(Object.getOwnPropertyDescriptor(g, "open") ? g : Window.prototype, "open", (o) => function open() {
        const w = o.apply(this, arguments);
        ensure(w);
        return w;
      });
    }
  }
})();
