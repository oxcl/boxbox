// Chrome per-account proxy: best effort, never silent. See DESIGN.md §5.
//
// Chrome has ONE browser-wide proxy setting and a PAC script only sees URLs, not tabs. So BoxBox generates a PAC
// that routes the hosts used by tabs of proxied accounts through that account's proxy. Everything that cannot
// be guaranteed is computed and surfaced as `warn` / `fail` on the popup, the page label and the toolbar badge.
import { ext, IS_MV3 } from '../core/ext.js';
import { hostOf } from '../core/services.js';

const hostIn = (host, d) => host === d || host.endsWith('.' + d);
const rule = (p) => `${p.type === 'socks5' ? 'SOCKS5' : p.type === 'https' ? 'HTTPS' : 'PROXY'} ${p.host}:${p.port}`;

export class ChromeProxy {
  constructor(base) {
    this.b = base;
    this.observed = new Map();     // accId -> Set(host)
    this.leaks = new Map();        // tabId -> Set(host contacted before being added to the PAC)
    this.errors = new Map();       // accId -> message
    this.authFails = new Map();    // accId -> true
    this.attempts = new Map();     // requestId -> n
    this.control = 'unknown';
    this.applied = null;
    this.timer = null;
  }

  /** Listeners (registered synchronously in MV3 so they can wake the service worker; `wrap` gates them on start-up). */
  bindEvents(wrap = (f) => f) {
    const b = this.b;
    try { ext.proxy.onProxyError?.addListener?.(wrap((e) => this.noteError(null, 'Proxy error: ' + (e.error || e.details || 'unknown')))); } catch { /* ignore */ }
    // MV3 requires `asyncBlocking` + the callback form; the gate must not delay the callback past start-up, so it only wraps the body
    ext.webRequest.onAuthRequired.addListener((d, cb) => { b.readyP.then(() => this.onAuth(d, cb)); }, { urls: ['<all_urls>'] }, ['asyncBlocking']);
    ext.webRequest.onErrorOccurred.addListener(wrap((d) => {
      if (!/PROXY|TUNNEL|SOCKS/.test(d.error || '')) return;
      const accId = b.accountOf(d.tabId);
      const acc = accId && b.c.accounts[accId];
      if (acc && acc.proxy) this.noteError(accId, `Proxy ${acc.proxy.host}:${acc.proxy.port} failed (${d.error.replace('net::ERR_', '')}). The request was blocked, not sent directly.`, d.tabId);
    }), { urls: ['<all_urls>'] });
    this.bound = true;
  }

  async init() {
    if (!this.bound) this.bindEvents();
    await this.recompute(true);
  }

  noteError(accId, msg, tabId) {
    if (accId) this.errors.set(accId, msg);
    for (const id of (accId ? [...this.b.c.tabs.entries()].filter(([, t]) => t.accountId === accId).map(([i]) => i) : [])) this.b.pushIdentity(id);
  }

  onAuth(d, cb) {
    if (!d.isProxy) { cb({}); return; }
    const n = (this.attempts.get(d.requestId) || 0) + 1;
    this.attempts.set(d.requestId, n);
    const accs = Object.values(this.b.c.accounts).filter((a) => a.proxy && a.proxy.host === d.challenger.host && Number(a.proxy.port) === Number(d.challenger.port));
    const tabAcc = this.b.accountOf(d.tabId);
    const acc = accs.find((a) => a.id === tabAcc) || accs.find((a) => a.proxy.username);
    if (!acc || !acc.proxy.username || n > 2) {
      if (acc) { this.authFails.set(acc.id, true); this.errors.set(acc.id, `Proxy ${acc.proxy.host}:${acc.proxy.port} rejected the credentials.`); }
      cb({}); return;
    }
    cb({ authCredentials: { username: acc.proxy.username, password: acc.proxy.password } });
  }

  // ---- bookkeeping
  /** Called for every request of a tab inside a proxied account. */
  observe(accId, tabId, host) {
    if (!host) return;
    const acc = this.b.c.accounts[accId];
    if (!acc || !acc.proxy) return;
    const covered = this.coveredHosts(accId);
    if (covered.has(host) || [...covered].some((d) => hostIn(host, d))) return;
    let s = this.observed.get(accId); if (!s) this.observed.set(accId, s = new Set());
    s.add(host);
    let l = this.leaks.get(tabId); if (!l) this.leaks.set(tabId, l = new Set());
    l.add(host);                        // the very request that revealed this host may already have gone out directly
    this.recompute();
    this.b.pushIdentity(tabId);
  }

  coveredHosts(accId) {
    const acc = this.b.c.accounts[accId];
    const set = new Set();
    if (!acc) return set;
    for (const d of this.b.c.resolver.domains(acc.serviceId)) set.add(d);
    for (const h of this.observed.get(accId) || []) set.add(h);
    return set;
  }

  isActive(accId) { return !!this.applied && this.activeAccounts().some((a) => a.id === accId) && this.applied.includes(JSON.stringify([...this.coveredHosts(accId)][0] || '')); }

  activeAccounts() {
    const ids = new Set();
    for (const t of this.b.c.tabs.values()) if (t.accountId) ids.add(t.accountId);
    return [...ids].map((i) => this.b.c.accounts[i]).filter((a) => a && a.proxy);
  }

  buildPac() {
    const rules = []; const seen = new Map();
    for (const acc of this.activeAccounts()) {
      for (const d of this.coveredHosts(acc.id)) { if (!seen.has(d)) { seen.set(d, acc.id); rules.push([d, rule(acc.proxy)]); } }
    }
    this.claims = seen;
    const pac = `function FindProxyForURL(url, host) {\n  host = host.toLowerCase();\n  var R = ${JSON.stringify(rules)};\n  for (var i = 0; i < R.length; i++) { var d = R[i][0]; if (host === d || (host.length > d.length && host.substr(host.length - d.length - 1) === "." + d)) return R[i][1]; }\n  return "DIRECT";\n}`;
    return { pac, rules };
  }

  async recompute(now = false) {
    clearTimeout(this.timer);
    const run = async () => {
      try {
        const active = this.activeAccounts();
        if (!active.length) {
          if (this.applied !== null) { await ext.proxy.settings.clear({ scope: 'regular' }); await this.setWebRtc(false); this.applied = null; }
        } else {
          const { pac } = this.buildPac();
          if (pac !== this.applied) {
            await ext.proxy.settings.set({ value: { mode: 'pac_script', pacScript: { data: pac, mandatory: true } }, scope: 'regular' });
            this.applied = pac;
          }
          await this.setWebRtc(true);
        }
        const cur = await ext.proxy.settings.get({});
        this.control = cur.levelOfControl;
      } catch (e) { this.control = 'error:' + e.message; }
      for (const [id, t] of this.b.c.tabs) if (t.accountId && this.b.c.accounts[t.accountId]?.proxy) this.b.pushIdentity(id);
    };
    if (now) return run();
    this.timer = setTimeout(run, 40);
    this.pending = this.timer;
  }

  async setWebRtc(on) {
    try {
      const p = ext.privacy?.network?.webRTCIPHandlingPolicy;
      if (!p) return;
      if (on) await p.set({ value: 'disable_non_proxied_udp' }); else await p.clear({});
    } catch { /* not controllable */ }
  }

  statusFor(tabId, acc) {
    if (!acc.proxy) return null;
    const msgs = []; let level = 'ok';
    const bump = (l, m) => { msgs.push(m); if (l === 'fail' || (l === 'warn' && level === 'ok')) level = l; };
    const label = `${acc.proxy.type.toUpperCase()} ${acc.proxy.host}:${acc.proxy.port}`;
    if (this.errors.get(acc.id)) bump('fail', this.errors.get(acc.id));
    if (this.control && this.control !== 'controlled_by_this_extension' && this.control !== 'unknown') bump('fail', `Chrome's proxy setting is controlled by ${this.control.replace(/_/g, ' ')}; BoxBox cannot route this account through ${label}.`);
    const covered = this.coveredHosts(acc.id);
    const sharing = [];
    for (const [id, st] of this.b.c.tabs) {
      if (id === tabId || st.accountId === acc.id) continue;
      const h = hostOf(this.b.tabTop.get(id) || '');
      if (h && [...covered].some((d) => hostIn(h, d))) sharing.push(h);
    }
    if (sharing.length) bump('warn', `${sharing.length} other tab(s) outside this account (default session or other accounts) use the same sites, so Chrome sends them through ${label} too — Chrome has one proxy setting for the whole browser.`);
    const conflicts = [];
    if (this.claims) for (const d of covered) { const owner = this.claims.get(d); if (owner && owner !== acc.id && this.activeAccounts().some((x) => x.id === owner)) conflicts.push(d); }
    if (conflicts.length) bump('warn', `Another proxied account claims the same site(s) (${[...new Set(conflicts)].slice(0, 3).join(', ')}); only one proxy can apply.`);
    const leaks = this.leaks.get(tabId);
    if (leaks && leaks.size) bump('warn', `${leaks.size} host(s) were first contacted before BoxBox could add them to the proxy rule and may have connected directly: ${[...leaks].slice(0, 3).join(', ')}${leaks.size > 3 ? '…' : ''}.`);
    if (level === 'ok') msgs.push(`Routed through ${label}. Applies to this account’s known hosts; unseen third-party hosts are added when first contacted.`);
    return { level, messages: msgs };
  }

  debug() { return { applied: this.applied, control: this.control, observed: Object.fromEntries([...this.observed].map(([k, v]) => [k, [...v]])), errors: Object.fromEntries(this.errors) }; }
}
