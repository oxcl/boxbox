// Stub of the extension API so the REAL popup / picker / settings bundles (dist/chrome-mv3) can render with sample data.
// The sample data is injected by scripts/store-assets.mjs.
(() => {
  const S = __SAMPLE__;
  const q = new URLSearchParams(location.search);
  const accountsOf = (sid) => S.accounts.filter((a) => a.serviceId === sid);
  const svc = (id) => S.services.find((s) => s.id === id);
  const handle = async (m) => {
    switch (m.type) {
      case 'state': return { settings: { ...S.settings, theme: q.get('theme') || 'light' }, accounts: S.accounts, services: S.services, target: 'chrome-mv3', user: {} };
      case 'icons': return S.icons;
      case 'tabInfo': { const t = S.tab; return { tabId: 1, url: t.url, favIconUrl: t.favIconUrl, title: t.title, host: t.host, serviceId: t.serviceId, service: svc(t.serviceId), accountId: q.get('acct') || t.accountId, accounts: accountsOf(t.serviceId), mode: 'ask', modeOverride: null, defaultMode: 'ask', status: { level: 'ok', messages: [] }, target: 'chrome-mv3', canSwitch: true }; }
      case 'picker': return { url: S.picker.url, service: svc(S.picker.serviceId), accounts: accountsOf(S.picker.serviceId) };
      default: return { tabId: 1 };
    }
  };
  globalThis.chrome = { runtime: { sendMessage: (m) => handle(m), getManifest: () => ({ version: '1.0.0' }), openOptionsPage() {}, getURL: (p) => p, onMessage: { addListener() {} } },
    tabs: { query: async () => [{ id: 1 }], get: async () => ({ id: 1 }), onUpdated: { addListener() {} }, getCurrent: async () => null, remove: async () => {} }, storage: { local: { get: async () => ({}), set: async () => {} } } };
})();
