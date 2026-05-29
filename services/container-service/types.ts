export interface ContainerInfo {
  cookieStoreId: string;
  name: string;
  color: string;
  icon: string;
}

export type ContainerMetaMap = Record<string, ContainerInfo>;

export interface ContainerService {
  create(name: string, color?: string, icon?: string): Promise<ContainerInfo>;
  query(): Promise<ContainerInfo[]>;
  update(
    cookieStoreId: string,
    details: { name?: string; color?: string; icon?: string }
  ): Promise<void>;
  remove(cookieStoreId: string): Promise<void>;

  registerAccount(
    accountName: string,
    hostname: string,
    color?: string,
    icon?: string
  ): Promise<ContainerInfo>;

  applyAccount(
    tab: Browser.tabs.Tab,
    url: string,
    hostname: string,
    accountId: string
  ): Promise<void>;

  applyDefault(tab: Browser.tabs.Tab, url: string, hostname: string): Promise<void>;

  onNavigateAway(tabId: number, hostname: string, accountId: string | null): Promise<void>;
}

export interface StorageItemLike<T> {
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
}
