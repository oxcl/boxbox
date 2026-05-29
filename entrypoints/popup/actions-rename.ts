import { StorageService, type Account } from '@/services/storage';
import { containerService } from '@/services/container-service';
import { t } from '@/services/i18n';
import { showConfirm, showPrompt } from './modal';
import type { AppData } from './types';

export async function handleRename(accountId: string, data: AppData): Promise<void> {
  const account = data.currentAccounts.find((p) => p.id === accountId);
  if (!account || !data.hostname) return;

  const result = await showPrompt(account.name);
  if (!result.confirmed || !result.value) return;

  const trimmed = result.value.trim();
  if (trimmed === '' || trimmed === account.name) return;

  if (trimmed === 'Default' && !account.isDefault) {
    await showConfirm(t('nameReserved'));
    return;
  }

  if (trimmed.length > 50) {
    await showConfirm(t('nameTooLong'));
    return;
  }

  if (/[()]/.test(trimmed)) {
    await showConfirm(t('nameNoParens'));
    return;
  }

  const duplicate = data.currentAccounts.find(
    (p) => p.id !== accountId && p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    await showConfirm(t('nameDuplicate', trimmed));
    return;
  }

  if (account.isDefault && accountId === StorageService.DEFAULT_CONTAINER_ID) {
    const namedDefault: Account = {
      id: StorageService.DEFAULT_CONTAINER_ID,
      name: trimmed,
      hostnames: [data.hostname!],
      isDefault: true,
    };

    await StorageService.upsertAccount(namedDefault);
    await StorageService.addAccountToHostname(data.hostname!, StorageService.DEFAULT_CONTAINER_ID);
  } else {
    const [currentAccounts] = await StorageService.getAccountAndHostnameMaps();
    const existing = currentAccounts[accountId];
    const updated: Account = {
      id: accountId,
      name: trimmed,
      hostnames: existing?.hostnames ?? [data.hostname],
      isDefault: existing?.isDefault ?? account.isDefault,
    };
    await StorageService.upsertAccount(updated);

    const containerName = StorageService.formatContainerName(trimmed, data.hostname);
    await containerService.update(accountId, {
      name: containerName,
    });
  }
}
