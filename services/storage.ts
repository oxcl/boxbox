import type { CookieJars } from './cookie-store';
import type { ContainerMetaMap } from './container-api';
import { normalizeHostname } from './tabs';

export interface Account {
  id: string;
  name: string;
  hostnames: string[];
  isDefault: boolean;
}

export interface SupportReminder {
  installedAt: number;
  lastDismissedAt: number | null;
  dismissCount: number;
}

export class StorageService {
  static readonly DEFAULT_CONTAINER_ID = 'firefox-default';

  static readonly accounts = storage.defineItem<Record<string, Account>>('local:accounts', {
    fallback: {},
  });

  static readonly hostnameAccounts = storage.defineItem<Record<string, string[]>>(
    'local:hostnameAccounts',
    {
      fallback: {},
    }
  );

  static readonly lastSelected = storage.defineItem<Record<string, string>>('local:lastSelected', {
    fallback: {},
  });

  static readonly supportReminder = storage.defineItem<SupportReminder | null>(
    'local:supportReminder',
    {
      fallback: null,
    }
  );

  static readonly language = storage.defineItem<string>('local:language', {
    fallback: '',
  });

  static readonly chromeContainerMeta = storage.defineItem<ContainerMetaMap>(
    'local:chromeContainerMeta',
    {
      fallback: {},
    }
  );

  static readonly cookieJars = storage.defineItem<CookieJars>('local:cookieJars', {
    fallback: {},
  });

  static synthesizeDefaultAccount(hostname: string): Account {
    return {
      id: StorageService.DEFAULT_CONTAINER_ID,
      name: 'Default',
      hostnames: [hostname],
      isDefault: true,
    };
  }

  static formatContainerName(name: string, hostname: string): string {
    return `${name} (${hostname})`;
  }

  static async getAccountsForHostname(rawHostname: string): Promise<Account[]> {
    const [allAccounts, hostnameMap] = await StorageService.getAccountAndHostnameMaps();
    const hostname = normalizeHostname(rawHostname);
    let accountIds = hostnameMap[hostname] ?? [];

    if (accountIds.length === 0) {
      return [StorageService.synthesizeDefaultAccount(hostname)];
    }

    const result: Account[] = [];
    let hasDefault = false;

    for (const id of accountIds) {
      const account = allAccounts[id];
      if (account) {
        result.push(account);
        if (account.isDefault) hasDefault = true;
      }
    }

    if (!hasDefault) {
      result.unshift(StorageService.synthesizeDefaultAccount(hostname));
    }

    return result;
  }

  static async getAccountAndHostnameMaps(): Promise<
    [Record<string, Account>, Record<string, string[]>]
  > {
    return Promise.all([
      StorageService.accounts.getValue(),
      StorageService.hostnameAccounts.getValue(),
    ]);
  }

  static async setLastSelected(hostname: string, accountId: string): Promise<void> {
    const lastMap = await StorageService.lastSelected.getValue();
    lastMap[hostname] = accountId;
    await StorageService.lastSelected.setValue(lastMap);
  }

  static async upsertAccount(account: Account): Promise<void> {
    const current = await StorageService.accounts.getValue();
    current[account.id] = account;
    await StorageService.accounts.setValue(current);
  }

  static async addAccountToHostname(hostname: string, accountId: string): Promise<void> {
    const map = await StorageService.hostnameAccounts.getValue();
    const ids = map[hostname] ?? [];
    if (!ids.includes(accountId)) {
      map[hostname] = [...ids, accountId];
      await StorageService.hostnameAccounts.setValue(map);
    }
  }

  static async removeAccountFromHostname(hostname: string, accountId: string): Promise<void> {
    const map = await StorageService.hostnameAccounts.getValue();
    const ids = map[hostname] ?? [];
    const newIds = ids.filter((id) => id !== accountId);

    const newMap = { ...map };
    if (newIds.length === 0) {
      delete newMap[hostname];
    } else {
      newMap[hostname] = newIds;
    }

    await StorageService.hostnameAccounts.setValue(newMap);
  }
}
