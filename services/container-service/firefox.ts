import type { TabBinding } from '../tab-service';
import type { ContainerInfo, ContainerService } from './types';
import { StorageService, type Account } from '../storage';

export class FirefoxContainerService implements ContainerService {
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

  async registerAccount(
    accountName: string,
    hostname: string,
    color = 'toolbar',
    icon = 'circle'
  ): Promise<ContainerInfo> {
    const containerName = StorageService.formatContainerName(accountName, hostname);
    const containerInfo = await this.create(containerName, color, icon);

    const account: Account = {
      id: containerInfo.cookieStoreId,
      name: accountName,
      hostnames: [hostname],
      isDefault: false,
    };

    await StorageService.registerAccountForHostname(account, hostname);
    return containerInfo;
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
