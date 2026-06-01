import { tabService, toHttpsUrl, normalizeHostname } from '@/services/tab-service';
import { containerService } from '@/services/container-service';
import { t } from '@/services/i18n';
import { showError } from './error';
import { showConfirm, showPrompt } from './modal';
import type { AppData } from './types';

export async function handleCreate(data: AppData): Promise<void> {
  if (!data.hostname) return;

  try {
    const hostname = normalizeHostname(data.hostname);
    const defaultName = `${t('accountPrefix')}${data.currentAccounts.length + 1}`;

    const result = await showPrompt(defaultName, t('createNewAccount'));
    if (!result.confirmed || !result.value) return;

    const accountName = result.value.trim();
    if (accountName === '') return;

    if (accountName === 'Default') {
      await showConfirm(t('nameReserved'));
      return;
    }

    if (accountName.length > 50) {
      await showConfirm(t('nameTooLong'));
      return;
    }

    if (/[()]/.test(accountName)) {
      await showConfirm(t('nameNoParens'));
      return;
    }

    const duplicate = data.currentAccounts.find(
      (p) => p.name.toLowerCase() === accountName.toLowerCase()
    );
    if (duplicate) {
      await showConfirm(t('nameDuplicate', accountName));
      return;
    }

    const newContainer = await containerService.registerAccount(accountName, hostname);

    const currentTab = await tabService.getCurrentTab();
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
