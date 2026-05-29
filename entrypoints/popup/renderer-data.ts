import { StorageService, type Account } from '@/services/storage';
import { tabService, getHostname, hostnameMatches } from '@/services/tab-service';
import { containerService, type ContainerInfo } from '@/services/container-service';
import { t } from '@/services/i18n';
import type { AppData } from './types';
import { showError } from './error';

export async function loadAppData(): Promise<AppData> {
  const currentTab = await tabService.getCurrentTab();
  const hostname = currentTab.url ? getHostname(currentTab.url) : null;

  let containers: ContainerInfo[] = [];
  try {
    containers = await containerService.query();
  } catch (err) {
    console.error('Failed to query containers:', err);
    showError(t('failedContainers'));
  }

  let currentAccounts: Account[] = [];
  let lastSelectedId: string | null = null;

  if (hostname) {
    currentAccounts = await StorageService.getAccountsForHostname(hostname);

    const binding = currentTab.id ? await tabService.getTabBinding(currentTab.id) : null;

    if (binding && hostnameMatches(binding.hostname, hostname)) {
      lastSelectedId = binding.cookieStoreId;
    } else {
      const lastMap = await StorageService.lastSelected.getValue();
      lastSelectedId =
        lastMap[hostname] ?? (hostname.startsWith('www.') ? lastMap[hostname.slice(4)] : null);
    }
  }

  return { hostname, containers, currentAccounts, lastSelectedId };
}
