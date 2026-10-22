(() => {
  // src/core/ext.js
  var TARGET = true ? "chrome-mv2" : "firefox";
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

  // src/test/bridge.js
  document.documentElement.setAttribute("data-box-bridge", "1");
  window.addEventListener("message", async (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__boxReq !== void 0) {
      let res;
      try {
        res = await ext.runtime.sendMessage(e.data.msg);
      } catch (err) {
        res = { error: String(err) };
      }
      window.postMessage({ __boxRes: e.data.__boxReq, res }, "*");
    } else if (e.data.__boxFrame) {
      document.getElementById("boxframe")?.remove();
      const f = document.createElement("iframe");
      f.id = "boxframe";
      f.src = ext.runtime.getURL(e.data.__boxFrame);
      f.style.cssText = "position:fixed;top:0;left:0;width:" + (e.data.w || 380) + "px;height:" + (e.data.h || 640) + "px;z-index:2147483646;border:0;background:#fff";
      document.documentElement.appendChild(f);
    }
  });
})();
