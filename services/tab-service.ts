import type { ProxyServiceKey } from '@webext-core/proxy-service';
import { createProxyService } from '@webext-core/proxy-service';

export interface TabBinding {
  hostname: string;
  cookieStoreId: string;
}

export class TabService {
  constructor(
    private tabBindings: Map<number, TabBinding>,
    private pendingSwitches: Set<number>,
    private isFirefox: boolean
  ) {}

  private registerNewTab(tab: Browser.tabs.Tab, url: string, cookieStoreId: string): void {
    if (!tab.id) return;
    const hostname = getHostname(url);
    if (!hostname) return;
    this.tabBindings.set(tab.id, { hostname: normalizeHostname(hostname), cookieStoreId });
    this.pendingSwitches.add(tab.id);
  }

  async openInContainer(
    url: string,
    cookieStoreId: string,
    index: number,
    replaceCurrentTabId?: number
  ): Promise<void> {
    const createProps: Record<string, unknown> = { url, index };
    if (this.isFirefox) {
      createProps.cookieStoreId = cookieStoreId;
    }
    const newTab = await browser.tabs.create(createProps as Browser.tabs.CreateProperties);
    this.registerNewTab(newTab, url, cookieStoreId);
    if (replaceCurrentTabId) browser.tabs.remove(replaceCurrentTabId);
  }

  async openInDefault(url: string, index: number, replaceCurrentTabId?: number): Promise<void> {
    const newTab = await browser.tabs.create({ url, index });
    this.registerNewTab(newTab, url, 'firefox-default');
    if (replaceCurrentTabId) browser.tabs.remove(replaceCurrentTabId);
  }

  async openInAccount(
    url: string,
    accountId: string,
    index: number,
    replaceCurrentTabId?: number
  ): Promise<void> {
    if (accountId === 'firefox-default') {
      await this.openInDefault(url, index, replaceCurrentTabId);
    } else {
      await this.openInContainer(url, accountId, index, replaceCurrentTabId);
    }
  }

  cleanupBindingsForContainer(cookieStoreId: string): void {
    for (const [tabId, binding] of this.tabBindings) {
      if (binding.cookieStoreId === cookieStoreId) {
        this.tabBindings.delete(tabId);
      }
    }
  }

  getTabBinding(tabId: number): Promise<TabBinding | null> {
    return Promise.resolve(this.tabBindings.get(tabId) ?? null);
  }

  async getCurrentTab(): Promise<Browser.tabs.Tab> {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }
}

export type TabProxyService = Omit<
  TabService,
  'registerNewTab' | 'tabBindings' | 'pendingSwitches' | 'isFirefox'
>;

export const TAB_SERVICE_KEY = 'tab-service' as ProxyServiceKey<TabProxyService>;
export const tabService: TabProxyService = createProxyService(TAB_SERVICE_KEY);

export function isFirefox(): boolean {
  return typeof browser.contextualIdentities !== 'undefined';
}

export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export function normalizeHostname(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

export function hostnameMatches(a: string, b: string): boolean {
  const na = normalizeHostname(a);
  const nb = normalizeHostname(b);
  return na === nb || na.endsWith('.' + nb) || nb.endsWith('.' + na);
}

export function toHttpsUrl(hostname: string): string {
  return `https://${hostname}`;
}
