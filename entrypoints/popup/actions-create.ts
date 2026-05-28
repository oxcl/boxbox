import { StorageService, type Account } from '@/services/storage';
import { tabService, getCurrentTab, toHttpsUrl } from '@/services/tabs';
import { containerService } from '@/services/container-api';
import { t } from '@/services/i18n';
import { showError } from './error';
import type { AppData } from './types';

export async function handleCreate(data: AppData): Promise<void> {
  if (!data.hostname) return;

  try {
    const hostname = data.hostname;
    const accountName = `${t('accountPrefix')}${data.currentAccounts.length + 1}`;
    const containerName = StorageService.formatContainerName(accountName, hostname);

    const newContainer = await containerService.create(containerName, 'toolbar', 'circle');

    const newAccount: Account = {
      id: newContainer.cookieStoreId,
      name: accountName,
      hostnames: [hostname],
      isDefault: false,
    };

    const [currentAccounts, currentHostnameMap] = await StorageService.getAccountAndHostnameMaps();
    const accountIds = currentHostnameMap[hostname] ?? [];
    const hasStoredDefault = accountIds.some((id) => currentAccounts[id]?.isDefault);

    await StorageService.upsertAccount(newAccount);
    await StorageService.addAccountToHostname(hostname, newAccount.id);

    if (!hasStoredDefault) {
      const defaultAccount = StorageService.synthesizeDefaultAccount(hostname);
      await StorageService.upsertAccount(defaultAccount);
      await StorageService.addAccountToHostname(hostname, defaultAccount.id);
    }

    await StorageService.lastSelected.setValue({
      ...(await StorageService.lastSelected.getValue()),
      [hostname]: newAccount.id,
    });

    await tabService.saveCookiesForHostname(hostname);

    const currentTab = await getCurrentTab();
    await tabService.openInAccount(
      toHttpsUrl(hostname),
      newContainer.cookieStoreId,
      currentTab.index,
      currentTab.id
    );

    window.close();
  } catch (err) {
    console.error('Failed to create container:', err);
    showError(`${t('errorCreating')}${err}`);
  }
}
