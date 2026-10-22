(() => {
  // src/core/ext.js
  var TARGET = true ? "chrome-mv3" : "firefox";
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

  // src/ui/gate.js
  var url = location.search.slice(3);
  (async () => {
    try {
      const r = await ext.runtime.sendMessage({ type: "gate", url });
      if (r && r.go) location.replace(r.go);
    } catch (e) {
      location.replace(url);
    }
  })();
})();
