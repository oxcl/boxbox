import type { TabBinding } from './tabs';

export interface ContainerInfo {
  cookieStoreId: string;
  name: string;
  color: string;
  icon: string;
}

export type ContainerMetaMap = Record<string, ContainerInfo>;

export interface CookieStoreOps {
  saveForHostname(accountId: string, hostname: string): Promise<void>;
  restoreForHostname(accountId: string, hostname: string): Promise<void>;
  clearForHostname(hostname: string): Promise<void>;
}

export interface ContainerApi {
  create(name: string, color?: string, icon?: string): Promise<ContainerInfo>;
  query(): Promise<ContainerInfo[]>;
  update(
    cookieStoreId: string,
    details: { name?: string; color?: string; icon?: string }
  ): Promise<void>;
  remove(cookieStoreId: string): Promise<void>;

  applyAccount(
    tab: Browser.tabs.Tab,
    url: string,
    hostname: string,
    accountId: string
  ): Promise<void>;

  applyDefault(tab: Browser.tabs.Tab, url: string, hostname: string): Promise<void>;

  onNavigateAway(tabId: number, hostname: string, accountId: string | null): Promise<void>;
}

export class FirefoxContainerApi implements ContainerApi {
  constructor(
    private tabBindings: Map<number, TabBinding>,
    private pendingSwitches: Set<number>
  ) {}

  async create(name: string, color = 'toolbar', icon = 'circle'): Promise<ContainerInfo> {
    return browser.contextualIdentities.create({
      name,
      color,
      icon,
    }) as unknown as ContainerInfo;
  }

  async query(): Promise<ContainerInfo[]> {
    return browser.contextualIdentities.query({}) as unknown as ContainerInfo[];
  }

  async update(
    cookieStoreId: string,
    details: { name?: string; color?: string; icon?: string }
  ): Promise<void> {
    await browser.contextualIdentities.update(cookieStoreId, details);
  }

  async remove(cookieStoreId: string): Promise<void> {
    await browser.contextualIdentities.remove(cookieStoreId);
  }

  async applyAccount(
    tab: Browser.tabs.Tab,
    url: string,
    hostname: string,
    accountId: string
  ): Promise<void> {
    if (!tab.id) return;
    if (tab.cookieStoreId === accountId) {
      this.tabBindings.set(tab.id, { hostname, cookieStoreId: accountId });
      return;
    }
    const newTab = await browser.tabs.create({
      url,
      cookieStoreId: accountId,
      index: tab.index,
    });
    if (newTab.id) {
      this.tabBindings.set(newTab.id, { hostname, cookieStoreId: accountId });
      this.pendingSwitches.add(newTab.id);
    }
    browser.tabs.remove(tab.id);
  }

  async applyDefault(tab: Browser.tabs.Tab, url: string, hostname: string): Promise<void> {
    if (!tab.id) return;
    const defaultId = 'firefox-default';
    if (!tab.cookieStoreId || tab.cookieStoreId === defaultId) {
      this.tabBindings.set(tab.id, { hostname, cookieStoreId: defaultId });
      return;
    }
    const newTab = await browser.tabs.create({ url, index: tab.index });
    if (newTab.id) {
      this.tabBindings.set(newTab.id, { hostname, cookieStoreId: defaultId });
      this.pendingSwitches.add(newTab.id);
    }
    browser.tabs.remove(tab.id);
  }

  async onNavigateAway(): Promise<void> {
    /* native containers — no cleanup needed */
  }
}

interface StorageItemLike<T> {
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
}

export class ChromeContainerApi implements ContainerApi {
  constructor(
    private tabBindings: Map<number, TabBinding>,
    private cookieStore: CookieStoreOps,
    private metaStorage: StorageItemLike<ContainerMetaMap>
  ) {}

  async create(name: string, color = 'toolbar', icon = 'circle'): Promise<ContainerInfo> {
    const id = crypto.randomUUID();
    const info: ContainerInfo = { cookieStoreId: id, name, color, icon };
    const meta = await this.metaStorage.getValue();
    meta[id] = info;
    await this.metaStorage.setValue(meta);
    return info;
  }

  async query(): Promise<ContainerInfo[]> {
    const meta = await this.metaStorage.getValue();
    return Object.values(meta);
  }

  async update(
    cookieStoreId: string,
    details: { name?: string; color?: string; icon?: string }
  ): Promise<void> {
    const meta = await this.metaStorage.getValue();
    const existing = meta[cookieStoreId];
    if (existing) {
      meta[cookieStoreId] = { ...existing, ...details };
      await this.metaStorage.setValue(meta);
    }
  }

  async remove(cookieStoreId: string): Promise<void> {
    const meta = await this.metaStorage.getValue();
    delete meta[cookieStoreId];
    await this.metaStorage.setValue(meta);
  }

  async applyAccount(
    tab: Browser.tabs.Tab,
    url: string,
    hostname: string,
    accountId: string
  ): Promise<void> {
    if (!hasBlockingWebRequest()) {
      await this.cookieStore.restoreForHostname(accountId, hostname);
    }
    if (tab.id) {
      this.tabBindings.set(tab.id, { hostname, cookieStoreId: accountId });
    }
  }

  async applyDefault(tab: Browser.tabs.Tab, url: string, hostname: string): Promise<void> {
    if (!hasBlockingWebRequest()) {
      await this.cookieStore.clearForHostname(hostname);
    }
    if (tab.id) {
      this.tabBindings.set(tab.id, {
        hostname,
        cookieStoreId: 'firefox-default',
      });
    }
  }

  async onNavigateAway(_tabId: number, hostname: string, accountId: string | null): Promise<void> {
    if (!hasBlockingWebRequest() && accountId && accountId !== 'firefox-default') {
      await this.cookieStore.saveForHostname(accountId, hostname);
    }
  }
}

let _hasBlocking: boolean | undefined;

export function hasBlockingWebRequest(): boolean {
  if (_hasBlocking !== undefined) return _hasBlocking;
  // In MV3, blocking webRequest is not available without webRequestBlocking permission
  // addListener doesn't throw but the listener is never invoked
  if (browser.runtime.getManifest().manifest_version === 3) {
    _hasBlocking = false;
    return _hasBlocking;
  }
  try {
    const listener = () => {};
    chrome.webRequest.onBeforeRequest.addListener(listener, { urls: [] }, ['blocking']);
    chrome.webRequest.onBeforeRequest.removeListener(listener);
    _hasBlocking = true;
  } catch {
    _hasBlocking = false;
  }
  return _hasBlocking;
}

// Popup-facing service (proxied from background)
export interface ContainerService {
  create(name: string, color?: string, icon?: string): Promise<ContainerInfo>;
  query(): Promise<ContainerInfo[]>;
  update(
    cookieStoreId: string,
    details: { name?: string; color?: string; icon?: string }
  ): Promise<void>;
  remove(cookieStoreId: string): Promise<void>;
}

import { browser } from 'wxt/browser';
import type { ProxyServiceKey } from '@webext-core/proxy-service';
import { createProxyService } from '@webext-core/proxy-service';

export const CONTAINER_SERVICE_KEY = 'container-service' as ProxyServiceKey<ContainerService>;
export const containerService: ContainerService = createProxyService(CONTAINER_SERVICE_KEY);
