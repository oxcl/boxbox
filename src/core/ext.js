// Uniform promise-based access to the WebExtension API on all three builds.
// __TARGET__ is injected by esbuild: 'firefox' | 'chrome-mv3' | 'chrome-mv2'.
/* global browser, chrome */
export const TARGET = typeof __TARGET__ !== 'undefined' ? __TARGET__ : 'firefox';
export const IS_FIREFOX = TARGET === 'firefox';
export const IS_CHROME = !IS_FIREFOX;
export const IS_MV2 = TARGET === 'chrome-mv2';
export const IS_MV3 = TARGET === 'chrome-mv3';

const g = globalThis;
const base = typeof g.browser !== 'undefined' && g.browser.runtime ? g.browser : g.chrome;

// Chrome MV2 exposes callback APIs only; wrap them lazily. Events (`onXxx`) and
// non-function members are returned untouched.
function promisified(obj) {
  return new Proxy(obj, {
    get(t, k) {
      const v = t[k];
      if (typeof k !== 'string') return v;
      if (typeof v === 'function') {
        return (...args) => {
          if (typeof args[args.length - 1] === 'function') return v.apply(t, args);
          return new Promise((resolve, reject) => {
            try {
              v.call(t, ...args, (res) => {
                const e = g.chrome.runtime.lastError;
                if (e) reject(new Error(e.message)); else resolve(res);
              });
            } catch (e) { reject(e); }
          });
        };
      }
      if (v && typeof v === 'object' && !/^on[A-Z]/.test(k)) return promisified(v);
      return v;
    },
  });
}

export const ext = IS_MV2 ? promisified(base) : base;
export const raw = base;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = (n = 10) => {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return [...a].map((b) => (b % 36).toString(36)).join('');
};
