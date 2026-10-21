// Service resolution: host -> service, with three layers (auto < catalog < user edits).
import { getDomain } from 'tldts';
import { CATALOG } from './catalog.js';

export const isIp = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':');

export function registrable(host) {
  host = (host || '').toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  if (isIp(host)) return host;
  return getDomain(host, { allowPrivateDomains: true }) || host;
}

export function hostOf(url) {
  try { const u = new URL(url); return /^https?:$|^wss?:$/.test(u.protocol) ? u.hostname : null; } catch { return null; }
}

export const isWebUrl = (url) => { try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; } };

// Candidate suffixes of a host, most specific first: a.b.c.com -> a.b.c.com, b.c.com, c.com, com
function suffixes(host) {
  const parts = host.split('.');
  const out = [];
  for (let i = 0; i < parts.length; i++) out.push(parts.slice(i).join('.'));
  return out;
}

export class Resolver {
  /** @param {{catalog?: any[], user?: {services:Object, domainMap:Object, names:Object}}} o */
  constructor({ catalog = CATALOG, user } = {}) {
    this.catalog = catalog;
    this.user = user || { services: {}, domainMap: {}, names: {} };
    this.catIndex = new Map();
    this.catById = new Map();
    for (const s of catalog) {
      this.catById.set(s.id, s);
      for (const d of s.domains) this.catIndex.set(d, s.id);
    }
  }

  /** Service id for a hostname. */
  idOf(host) {
    host = (host || '').toLowerCase().replace(/\.$/, '');
    if (!host) return null;
    const sfx = suffixes(host);
    for (const s of sfx) { const id = this.user.domainMap[s]; if (id) return id; }   // 3. user edits win
    for (const s of sfx) { const id = this.catIndex.get(s); if (id) return id; }     // 2. catalog
    return 'auto:' + registrable(host);                                              // 1. automatic
  }

  idOfUrl(url) { const h = hostOf(url); return h ? this.idOf(h) : null; }

  /** Base (pre-user-edit) name of a service. */
  name(id) {
    if (this.user.names[id]) return this.user.names[id];
    if (this.user.services[id]) return this.user.services[id].name;
    if (this.catById.has(id)) return this.catById.get(id).name;
    if (id.startsWith('auto:')) return prettyAuto(id.slice(5));
    return id;
  }

  /** Domains currently belonging to a service (after user edits). */
  domains(id) {
    const set = new Set();
    const cat = this.catById.get(id);
    if (cat) for (const d of cat.domains) if (!this.user.domainMap[d] || this.user.domainMap[d] === id) set.add(d);
    for (const [d, sid] of Object.entries(this.user.domainMap)) if (sid === id) set.add(d);
    if (id.startsWith('auto:')) {
      const d = id.slice(5);
      if (!this.user.domainMap[d]) set.add(d);
    }
    return [...set].sort();
  }

  kind(id) {
    if (this.user.services[id]) return 'user';
    if (this.catById.has(id)) return 'catalog';
    return 'auto';
  }

  describe(id) {
    return { id, name: this.name(id), domains: this.domains(id), kind: this.kind(id) };
  }

  /** All services we can enumerate without browsing history: catalog + user-created + extra auto ids. */
  list(extraIds = []) {
    const ids = new Set([...this.catById.keys(), ...Object.keys(this.user.services), ...extraIds]);
    return [...ids].map((id) => this.describe(id)).sort((a, b) => a.name.localeCompare(b.name));
  }
}

function prettyAuto(domain) {
  const label = domain.split('.')[0] || domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ---- pure edit operations on the `user` layer (return a new object) ----------------
const clone = (o) => JSON.parse(JSON.stringify(o));

export function opCreateService(user, id, name, domains = []) {
  const u = clone(user);
  u.services[id] = { name };
  for (const d of domains) u.domainMap[normDomain(d)] = id;
  return u;
}
export function opRenameService(user, id, name) {
  const u = clone(user);
  if (u.services[id]) u.services[id].name = name; else u.names[id] = name;
  return u;
}
export function opSetDomains(user, id, domains) {   // assign domains to a service ("merge" / "split")
  const u = clone(user);
  for (const d of domains) u.domainMap[normDomain(d)] = id;
  return u;
}
export function opUnsetDomain(user, domain) {
  const u = clone(user); delete u.domainMap[normDomain(domain)]; return u;
}
export function opDeleteService(user, id) {
  const u = clone(user); delete u.services[id]; delete u.names[id];
  for (const [d, sid] of Object.entries(u.domainMap)) if (sid === id) delete u.domainMap[d];
  return u;
}
export function normDomain(d) {
  return String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '').replace(/^\*?\./, '').replace(/\.$/, '');
}
