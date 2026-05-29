import { StorageService } from '@/services/storage';
import { tabService, toHttpsUrl } from '@/services/tab-service';
import { containerService } from '@/services/container-service';
import { t } from '@/services/i18n';
import { showConfirm } from './modal';
import type { AppData } from './types';

export async function handleDelete(accountId: string, data: AppData): Promise<boolean> {
  const result = await showConfirm(t('deleteConfirm'));
  if (!result.confirmed) return false;

  await containerService.remove(accountId);
  tabService.cleanupBindingsForContainer(accountId);

  if (data.hostname) {
    const hostname = data.hostname;
    const { wasActive } = await StorageService.removeAccountForHostname(accountId, hostname);

    if (wasActive) {
      const currentTab = await tabService.getCurrentTab();
      if (currentTab.id) {
        await tabService.openInDefault(toHttpsUrl(hostname), currentTab.index, currentTab.id);
      }
      window.close();
      return true;
    }
  }
  return false;
}
