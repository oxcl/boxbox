import { registerService } from '@webext-core/proxy-service';
import { StorageService } from '@/services/storage';
import {
  TAB_SERVICE_KEY,
  type TabService,
  type TabBinding,
  TabService as TabServiceImpl,
  getHostname,
  hostnameMatches,
  isFirefox,
  normalizeHostname,
} from '@/services/tab-service';
import {
  FirefoxContainerService,
  ChromeContainerService,
  hasBlockingWebRequest,
  type ContainerService,
  CONTAINER_SERVICE_KEY,
} from '@/services/container-service';
import { CookieService } from '@/services/cookie-service';

const tabBindings = new Map<number, TabBinding>();
const pendingSwitches = new Set<number>();

let containerService: ContainerService;
let tabService: TabService;
let cookieService: CookieService | null = null;

function initServices(): void {
  const firefox = isFirefox();
  if (firefox) {
    containerService = new FirefoxContainerService(tabBindings, pendingSwitches);
  } else {
    cookieService = new CookieService(StorageService.cookieJars);
    containerService = new ChromeContainerService(
      tabBindings,
      cookieService,
      StorageService.chromeContainerMeta
    );
  }
  tabService = new TabServiceImpl(tabBindings, pendingSwitches, firefox);
}

function badge() {
  return isFirefox() ? browser.browserAction : browser.action;
}

async function updateBadge(tabId: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) {
      badge().setBadgeText({ tabId, text: '' });
      return;
    }
    const hostname = getHostname(tab.url);
    if (!hostname) {
      badge().setBadgeText({ tabId, text: '' });
      return;
    }
    const accounts = await StorageService.getAccountsForHostname(hostname);
    if (accounts.length > 1) {
      badge().setBadgeText({ tabId, text: String(accounts.length) });
      badge().setBadgeBackgroundColor({ tabId, color: '#0060df' });
    } else {
      badge().setBadgeText({ tabId, text: '' });
    }
  } catch {
    badge().setBadgeText({ tabId, text: '' });
  }
}

async function updateBadgeForActiveTab(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) await updateBadge(tabs[0].id);
}

function protocolCheck(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'about:') return true;
    if (isFirefox() && parsed.protocol === 'moz-extension:') return true;
    if (!isFirefox() && (parsed.protocol === 'chrome-extension:' || parsed.protocol === 'chrome:'))
      return true;
    return false;
  } catch {
    return true;
  }
}

export default defineBackground(() => {
  initServices();
  registerService(TAB_SERVICE_KEY, tabService);
  registerService(CONTAINER_SERVICE_KEY, containerService);

  browser.runtime.onInstalled.addListener(async () => {
    const existing = await StorageService.supportReminder.getValue();
    if (!existing) {
      await StorageService.supportReminder.setValue({
        installedAt: Date.now(),
        lastDismissedAt: null,
        dismissCount: 0,
      });
    }
  });

  browser.tabs.onActivated.addListener((activeInfo) => {
    updateBadge(activeInfo.tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      updateBadge(tabId);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    tabBindings.delete(tabId);
    pendingSwitches.delete(tabId);
  });

  browser.storage.onChanged.addListener((changes) => {
    if (changes['local:hostnameAccounts']) {
      updateBadgeForActiveTab();
    }
  });

  browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;

    if (pendingSwitches.has(details.tabId)) {
      pendingSwitches.delete(details.tabId);
      // For Chrome MV3: swap cookies for the pending tab navigation
      if (!isFirefox() && !hasBlockingWebRequest() && cookieService) {
        const binding = tabBindings.get(details.tabId);
        const rawHostname = getHostname(details.url);
        const hostname = rawHostname ? normalizeHostname(rawHostname) : null;
        if (
          binding &&
          hostname &&
          hostnameMatches(binding.hostname, hostname) &&
          binding.cookieStoreId !== StorageService.DEFAULT_CONTAINER_ID
        ) {
          await cookieService.restoreForHostname(binding.cookieStoreId, hostname);
        }
      }
      return;
    }

    try {
      if (protocolCheck(details.url)) return;

      const url = new URL(details.url);
      const hostname = normalizeHostname(url.hostname);
      if (!hostname) return;

      const binding = tabBindings.get(details.tabId);

      // Sticky tab — same hostname AND same account, skip
      if (binding && hostnameMatches(binding.hostname, hostname)) {
        const map = await StorageService.lastSelected.getValue();
        const currentAccountId = map[hostname] ?? map['www.' + hostname];
        if (!currentAccountId || binding.cookieStoreId === currentAccountId) {
          return;
        }
        // Account changed — fall through to re-apply
      }

      // Navigating away from previous hostname — cleanup
      if (binding && binding.hostname !== hostname) {
        await containerService.onNavigateAway(
          details.tabId,
          binding.hostname,
          binding.cookieStoreId
        );
        tabBindings.delete(details.tabId);
      }

      const tab = await browser.tabs.get(details.tabId);
      const map = await StorageService.lastSelected.getValue();
      const accountId = map[hostname] ?? map['www.' + hostname];
      if (!accountId) {
        await containerService.applyDefault(tab, details.url, hostname);
        return;
      }

      await containerService.applyAccount(tab, details.url, hostname, accountId);
    } catch (err) {
      console.error('[background] Error switching tab:', err);
    }
  });

  // Chrome-specific: cookie change sync for MV3
  if (!isFirefox() && !hasBlockingWebRequest() && cookieService) {
    chrome.cookies.onChanged.addListener((changeInfo) => {
      const hostname = getHostname(
        `${changeInfo.cookie.secure ? 'https' : 'http'}://${changeInfo.cookie.domain.replace(/^\./, '')}${changeInfo.cookie.path}`
      );
      if (!hostname) return;

      // Find which tab is associated with this change by checking the active tab
      browser.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          if (!tabs[0]?.id) return;
          const binding = tabBindings.get(tabs[0].id);
          if (binding && hostnameMatches(binding.hostname, hostname)) {
            cookieService!.onCookieChanged(changeInfo, {
              accountId: binding.cookieStoreId,
              hostname: binding.hostname,
            });
          }
        })
        .catch(() => {});
    });
  }

  updateBadgeForActiveTab();
});
