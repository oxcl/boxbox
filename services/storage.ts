import type { CookieJars } from './cookie-service';
import type { ContainerMetaMap } from './container-service';
import { normalizeHostname } from './tab-service';

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

  static async registerAccountForHostname(account: Account, hostname: string): Promise<void> {
    const [currentAccounts, currentHostnameMap] = await StorageService.getAccountAndHostnameMaps();
    const accountIds = currentHostnameMap[hostname] ?? [];
    const hasStoredDefault = accountIds.some((id) => currentAccounts[id]?.isDefault);

    await StorageService.upsertAccount(account);
    await StorageService.addAccountToHostname(hostname, account.id);

    if (!hasStoredDefault) {
      const defaultAccount = StorageService.synthesizeDefaultAccount(hostname);
      await StorageService.upsertAccount(defaultAccount);
      await StorageService.addAccountToHostname(hostname, defaultAccount.id);
    }

    await StorageService.setLastSelected(hostname, account.id);
  }

  static async removeAccountForHostname(
    accountId: string,
    hostname: string
  ): Promise<{ wasActive: boolean; remainingAccountIds: string[] }> {
    const [currentAccounts, currentHostnameMap, lastMap] = await Promise.all([
      StorageService.accounts.getValue(),
      StorageService.hostnameAccounts.getValue(),
      StorageService.lastSelected.getValue(),
    ]);

    const { [accountId]: _removed, ...remainingAccounts } = currentAccounts;

    const oldIds = currentHostnameMap[hostname] ?? [];
    const newIds = oldIds.filter((id) => id !== accountId);

    const newHostnameMap = { ...currentHostnameMap };
    if (newIds.length === 0) {
      delete newHostnameMap[hostname];
    } else {
      newHostnameMap[hostname] = newIds;
    }

    const hasDefault = newIds.some((id) => remainingAccounts[id]?.isDefault);
    if (!hasDefault) {
      delete remainingAccounts[StorageService.DEFAULT_CONTAINER_ID];
    }

    const { [hostname]: _last, ...remainingLast } = lastMap;

    await Promise.all([
      StorageService.accounts.setValue(remainingAccounts),
      StorageService.hostnameAccounts.setValue(newHostnameMap),
      StorageService.lastSelected.setValue(remainingLast),
    ]);

    const wasActive = lastMap[hostname] === accountId;
    return { wasActive, remainingAccountIds: newIds };
  }
}
