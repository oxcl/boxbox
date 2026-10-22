(() => {
  // src/core/ext.js
  var TARGET = true ? "firefox" : "firefox";
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

  // src/content/content.js
  var isTop = window.top === window;
  var lastGesture = 0;
  var mark = (e) => {
    if (!e.isTrusted) return;
    lastGesture = performance.now();
    if (false) {
      lastPing = lastGesture;
      syncCall("gesture", {});
    }
  };
  if (false) {
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
      applyIdentity(await ext.runtime.sendMessage({ box: true, type: "identity" }), true);
    } catch {
    }
  }
  function applyIdentity(id, initial = false) {
    identity = id;
    if (initial && isTop && IS_CHROME && id && !id.account) {
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
