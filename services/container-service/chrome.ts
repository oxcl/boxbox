import type { TabBinding } from '../tab-service';
import type { ContainerInfo, ContainerMetaMap, ContainerService, StorageItemLike } from './types';
import type { CookieService } from '../cookie-service';
import { StorageService, type Account } from '../storage';
import { hasBlockingWebRequest } from './utils';

export class ChromeContainerService implements ContainerService {
  constructor(
    private tabBindings: Map<number, TabBinding>,
    private cookieService: CookieService,
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
    if (!hasBlockingWebRequest()) {
      await this.cookieService.restoreForHostname(accountId, hostname);
    }
    if (tab.id) {
      this.tabBindings.set(tab.id, { hostname, cookieStoreId: accountId });
    }
  }

  async applyDefault(tab: Browser.tabs.Tab, url: string, hostname: string): Promise<void> {
    if (!hasBlockingWebRequest()) {
      await this.cookieService.clearForHostname(hostname);
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
      await this.cookieService.saveForHostname(accountId, hostname);
    }
  }
}
