// Per-account virtual cookie jar (RFC 6265 / 6265bis semantics). Lives in the extension, never in the browser's jar.
import { getDomain } from 'tldts';

const TRUSTWORTHY = (host) => host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]' || host === '::1';
export const isSecureUrl = (u) => u.protocol === 'https:' || u.protocol === 'wss:' || TRUSTWORTHY(u.hostname);
export const siteOf = (hostOrUrl) => {
  let h = hostOrUrl;
  try { if (/^[a-z]+:\/\//i.test(h)) h = new URL(h).hostname; } catch { /* keep */ }
  return getDomain(h, { allowPrivateDomains: true }) || h;
};

const lc = (s) => s.toLowerCase();
const isIp = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':');

function defaultPath(u) {
  const p = u.pathname;
  if (!p || p[0] !== '/') return '/';
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}
export function domainMatch(host, domain) { return host === domain || (host.endsWith('.' + domain) && !isIp(host)); }
export function pathMatch(reqPath, cPath) {
  if (reqPath === cPath) return true;
  if (reqPath.startsWith(cPath)) return cPath.endsWith('/') || reqPath[cPath.length] === '/';
  return false;
}

/** Parse one Set-Cookie header value. Returns a cookie or null when it must be rejected. `fromJs` forbids HttpOnly. */
export function parseSetCookie(header, url, { fromJs = false, now = Date.now() } = {}) {
  const u = typeof url === 'string' ? new URL(url) : url;
  const parts = header.split(';');
  const first = parts.shift();
  const eq = first.indexOf('=');
  let name, value;
  if (eq < 0) { name = ''; value = first.trim(); } else { name = first.slice(0, eq).trim(); value = first.slice(eq + 1).trim(); }
  if (!name && !value) return null;
  if (name.length + value.length > 4096) return null;
  const c = { name, value, domain: u.hostname, hostOnly: true, path: defaultPath(u), secure: false, httpOnly: false, sameSite: '', expires: null, created: now };
  let maxAge = null, expires = null;
  for (const raw of parts) {
    const i = raw.indexOf('=');
    const k = lc((i < 0 ? raw : raw.slice(0, i)).trim());
    const v = i < 0 ? '' : raw.slice(i + 1).trim();
    if (k === 'expires') { const t = Date.parse(v); if (!isNaN(t)) expires = t; }
    else if (k === 'max-age') { if (/^-?\d+$/.test(v)) maxAge = parseInt(v, 10); }
    else if (k === 'domain') {
      let d = lc(v).replace(/^\./, '');
      if (!d) continue;
      if (!domainMatch(u.hostname, d)) return null;                  // not a suffix of the request host
      if (!isIp(d) && !getDomain(d, { allowPrivateDomains: true }) && d !== u.hostname) return null; // public suffix
      c.domain = d; c.hostOnly = false;
    }
    else if (k === 'path') { if (v.startsWith('/')) c.path = v; }
    else if (k === 'secure') c.secure = true;
    else if (k === 'httponly') c.httpOnly = true;
    else if (k === 'samesite') { const s = lc(v); c.sameSite = s === 'strict' ? 'strict' : s === 'none' ? 'none' : 'lax'; }
  }
  if (fromJs && c.httpOnly) return null;
  if (maxAge !== null) c.expires = maxAge <= 0 ? 0 : now + maxAge * 1000;
  else if (expires !== null) c.expires = expires;
  if (c.secure && !isSecureUrl(u)) return null;
  if (c.sameSite === 'none' && !c.secure) return null;
  const lname = lc(name);
  if (lname.startsWith('__secure-') && !c.secure) return null;
  if (lname.startsWith('__host-') && (!c.secure || !c.hostOnly || c.path !== '/')) return null;
  return c;
}

export class Jar {
  constructor() { this.data = new Map(); }   // accountId -> Map(key -> cookie)

  load(accountId, list) { this.data.set(accountId, new Map((list || []).map((c) => [this.key(c), c]))); }
  has(accountId) { return this.data.has(accountId); }
  key(c) { return `${c.domain}\u0000${c.path}\u0000${c.name}${c.hostOnly ? '\u0000h' : ''}`; }
  map(accountId) { let m = this.data.get(accountId); if (!m) { m = new Map(); this.data.set(accountId, m); } return m; }
  list(accountId) { return [...this.map(accountId).values()]; }
  clear(accountId) { this.data.delete(accountId); }

  /** Store a parsed cookie (or delete when expired). Returns true when the jar changed. */
  put(accountId, c, { fromJs = false, now = Date.now() } = {}) {
    const m = this.map(accountId);
    const k = this.key(c);
    const old = m.get(k);
    if (old && old.httpOnly && fromJs) return false;                 // JS can't overwrite HttpOnly cookies
    if (c.expires !== null && c.expires <= now) { return m.delete(k); }
    if (old) c.created = old.created;
    m.set(k, c);
    return true;
  }

  /** Apply Set-Cookie header(s) seen on a response. `ctx.sameSiteOk` is not needed for storing. */
  setFromHeader(accountId, url, header, now = Date.now()) {
    const c = parseSetCookie(header, url, { now });
    return c ? this.put(accountId, c, { now }) : false;
  }
  setFromJs(accountId, url, str, now = Date.now()) {
    const c = parseSetCookie(str, url, { fromJs: true, now });
    return c ? this.put(accountId, c, { fromJs: true, now }) : false;
  }

  /**
   * Cookies to send for `url`.
   * ctx: 'same' (same-site request/document), 'nav' (cross-site top-level GET navigation), 'cross' (cross-site subresource/iframe)
   */
  match(accountId, url, { ctx = 'same', includeHttpOnly = true, now = Date.now() } = {}) {
    const u = typeof url === 'string' ? new URL(url) : url;
    const m = this.data.get(accountId);
    if (!m) return [];
    const secureUrl = isSecureUrl(u);
    const out = [];
    for (const [k, c] of m) {
      if (c.expires !== null && c.expires <= now) { m.delete(k); continue; }
      if (c.hostOnly ? u.hostname !== c.domain : !domainMatch(u.hostname, c.domain)) continue;
      if (!pathMatch(u.pathname || '/', c.path)) continue;
      if (c.secure && !secureUrl) continue;
      if (!includeHttpOnly && c.httpOnly) continue;
      const ss = c.sameSite || 'lax';
      if (ctx === 'cross' && ss !== 'none') continue;
      if (ctx === 'nav' && ss === 'strict') continue;
      out.push(c);
    }
    out.sort((a, b) => b.path.length - a.path.length || a.created - b.created);
    return out;
  }

  header(accountId, url, opts) {
    const cs = this.match(accountId, url, opts);
    return cs.length ? cs.map((c) => (c.name ? `${c.name}=${c.value}` : c.value)).join('; ') : '';
  }
  documentCookie(accountId, url) { return this.header(accountId, url, { ctx: 'same', includeHttpOnly: false }); }

  toJSON(accountId) { return this.list(accountId); }
}

/** Request-context classification used for the SameSite decision. */
export function requestContext({ url, topUrl, initiator, type, method }) {
  const reqSite = siteOf(url);
  if (type === 'main_frame') {
    if (!initiator) return 'same';
    return siteOf(initiator) === reqSite ? 'same' : (method === 'GET' ? 'nav' : 'cross');
  }
  const top = topUrl ? siteOf(topUrl) : (initiator ? siteOf(initiator) : reqSite);
  return top === reqSite ? 'same' : 'cross';
}
