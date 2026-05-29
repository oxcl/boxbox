import { StorageService } from '@/services/storage';
import { tabService, toHttpsUrl } from '@/services/tab-service';
import type { AppData } from './types';
import { checkSupportReminder } from './actions-support';

export async function handleOpenInNewTab(accountId: string, data: AppData): Promise<void> {
  if (!data.hostname) return;

  await StorageService.setLastSelected(data.hostname, accountId);

  const currentTab = await tabService.getCurrentTab();
  await tabService.openInAccount(
    toHttpsUrl(data.hostname),
    accountId,
    currentTab.index,
    currentTab.id
  );

  await checkSupportReminder();
  window.close();
}

export async function handleOpenInTabWithoutSwitch(
  accountId: string,
  data: AppData
): Promise<void> {
  if (!data.hostname) return;

  await StorageService.setLastSelected(data.hostname, accountId);

  const currentTab = await tabService.getCurrentTab();
  await tabService.openInAccount(toHttpsUrl(data.hostname), accountId, currentTab.index + 1);

  window.close();
}
