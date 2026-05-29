import { tabService, toHttpsUrl, normalizeHostname } from '@/services/tab-service';
import { containerService } from '@/services/container-service';
import { t } from '@/services/i18n';
import { showError } from './error';
import type { AppData } from './types';

export async function handleCreate(data: AppData): Promise<void> {
  if (!data.hostname) return;

  try {
    const hostname = normalizeHostname(data.hostname);
    const accountName = `${t('accountPrefix')}${data.currentAccounts.length + 1}`;

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
