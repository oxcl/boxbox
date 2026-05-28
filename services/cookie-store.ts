export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  hostOnly: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
  expirationDate?: number;
}

export type CookieJars = Record<string, Record<string, StoredCookie[]>>;

interface StorageItemLike<T> {
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
}

function buildCookieUrl(
  cookie: { domain: string; path: string; secure: boolean; hostOnly?: boolean },
  fallbackHostname?: string
): string {
  const protocol = cookie.secure ? 'https' : 'http';
  const domain =
    cookie.hostOnly && fallbackHostname ? fallbackHostname : cookie.domain.replace(/^\./, '');
  if (!domain) return '';
  return `${protocol}://${domain}${cookie.path}`;
}

function getParentDomains(hostname: string): string[] {
  const parts = hostname.split('.');
  const domains: string[] = [hostname];
  for (let i = 1; i < parts.length - 1; i++) {
    domains.push(parts.slice(i).join('.'));
  }
  return domains;
}

async function getAllCookiesForHostname(hostname: string): Promise<chrome.cookies.Cookie[]> {
  const seen = new Set<string>();
  const all: chrome.cookies.Cookie[] = [];
  for (const domain of getParentDomains(hostname)) {
    const cookies = await chrome.cookies.getAll({ domain });
    for (const c of cookies) {
      const key = `${c.name}:${c.domain}:${c.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(c);
      }
    }
  }
  return all;
}

export class CookieStore {
  constructor(private store: StorageItemLike<CookieJars>) {}

  async saveForHostname(accountId: string, hostname: string): Promise<void> {
    const cookies = await getAllCookiesForHostname(hostname);
    const jars = await this.store.getValue();
    if (!jars[accountId]) jars[accountId] = {};
    jars[accountId][hostname] = cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      hostOnly: (c as unknown as { hostOnly?: boolean }).hostOnly ?? false,
      sameSite: c.sameSite,
      expirationDate: c.expirationDate,
    }));
    await this.store.setValue(jars);
  }

  async restoreForHostname(accountId: string, hostname: string): Promise<void> {
    const existing = await getAllCookiesForHostname(hostname);
    for (const cookie of existing) {
      const url = buildCookieUrl(cookie, hostname);
      if (url) {
        await chrome.cookies.remove({ url, name: cookie.name });
      }
    }

    const jars = await this.store.getValue();
    const hostnameCookies = jars[accountId]?.[hostname] ?? [];
    for (const cookie of hostnameCookies) {
      const url = buildCookieUrl(cookie, hostname);
      if (!url) continue;
      try {
        // Don't pass domain for host-only cookies (required for __Host- prefix)
        const setDetails: Record<string, unknown> = {
          url,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          expirationDate: cookie.expirationDate,
        };
        if (!cookie.hostOnly) {
          setDetails.domain = cookie.domain;
        }
        await chrome.cookies.set(setDetails as never);
      } catch (e) {
        console.warn('[cookie-store] Failed to set cookie:', cookie.name, e);
      }
    }
  }

  async clearForHostname(hostname: string): Promise<void> {
    const existing = await getAllCookiesForHostname(hostname);
    for (const cookie of existing) {
      const url = buildCookieUrl(cookie, hostname);
      if (url) {
        await chrome.cookies.remove({ url, name: cookie.name });
      }
    }
  }

  async onCookieChanged(
    changeInfo: chrome.cookies.CookieChangeInfo,
    binding: { accountId: string; hostname: string } | null
  ): Promise<void> {
    if (!binding) return;
    const jars = await this.store.getValue();
    if (!jars[binding.accountId]) jars[binding.accountId] = {};
    if (!jars[binding.accountId][binding.hostname]) {
      jars[binding.accountId][binding.hostname] = [];
    }
    const hostCookies = jars[binding.accountId][binding.hostname];
    const idx = hostCookies.findIndex(
      (c: StoredCookie) =>
        c.name === changeInfo.cookie.name &&
        c.domain === changeInfo.cookie.domain &&
        c.path === changeInfo.cookie.path
    );
    if (changeInfo.removed) {
      if (idx !== -1) hostCookies.splice(idx, 1);
    } else {
      const stored: StoredCookie = {
        name: changeInfo.cookie.name,
        value: changeInfo.cookie.value,
        domain: changeInfo.cookie.domain,
        path: changeInfo.cookie.path,
        secure: changeInfo.cookie.secure,
        httpOnly: changeInfo.cookie.httpOnly,
        hostOnly: (changeInfo.cookie as unknown as { hostOnly?: boolean }).hostOnly ?? false,
        sameSite: changeInfo.cookie.sameSite,
        expirationDate: changeInfo.cookie.expirationDate,
      };
      if (idx !== -1) {
        hostCookies[idx] = stored;
      } else {
        hostCookies.push(stored);
      }
    }
    await this.store.setValue(jars);
  }

  async getCookies(accountId: string, hostname: string): Promise<StoredCookie[]> {
    const jars = await this.store.getValue();
    return jars[accountId]?.[hostname] ?? [];
  }
}
