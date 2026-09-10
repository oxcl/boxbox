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

const TAB_BINDINGS_SESSION_KEY = 'session:tabBindings';

const tabBindings = new Map<number, TabBinding>();
const pendingSwitches = new Set<number>();

let containerService: ContainerService;
let tabService: TabService;
let cookieService: CookieService | null = null;

async function saveTabBindings(): Promise<void> {
  if (isFirefox()) return;
  try {
    const obj: Record<string, TabBinding> = {};
    for (const [k, v] of tabBindings) obj[String(k)] = v;
    await chrome.storage.session.set({ [TAB_BINDINGS_SESSION_KEY]: obj });
  } catch {
    // session storage may not be available
  }
}

async function loadTabBindings(): Promise<void> {
  if (isFirefox()) return;
  try {
    const result = await chrome.storage.session.get(TAB_BINDINGS_SESSION_KEY);
    const obj = result[TAB_BINDINGS_SESSION_KEY] as Record<string, TabBinding> | undefined;
    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        tabBindings.set(Number(k), v);
      }
    }
  } catch {
    // session storage may not be available
  }
}

function initServices(): void {
  const firefox = isFirefox();
  if (firefox) {
    containerService = new FirefoxContainerService(tabBindings, pendingSwitches);
  } else {
    cookieService = new CookieService();
    const chromeService = new ChromeContainerService(
      tabBindings,
      cookieService,
      StorageService.chromeContainerMeta
    );
    chromeService.setSaveCallback(() => saveTabBindings());
    containerService = chromeService;
  }
  tabService = new TabServiceImpl(tabBindings, pendingSwitches, firefox, cookieService);
  if (!firefox) {
    tabService.setSaveCallback(() => saveTabBindings());
  }
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

async function reapplyActiveTabBinding(): Promise<void> {
  if (!cookieService) return;
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !tab.url) return;
    if (protocolCheck(tab.url)) return;

    const binding = tabBindings.get(tab.id);
    if (!binding) return;

    if (binding.cookieStoreId === 'firefox-default') {
      await cookieService.clearForHostname(binding.hostname);
    } else {
      await cookieService.restoreForHostname(binding.cookieStoreId, binding.hostname);
    }
  } catch (err) {
    console.error('[background] Error reapplying active tab binding:', err);
  }
}

export default defineBackground(() => {
  // Load persisted tab bindings (fire-and-forget for Chrome MV3 sync requirement)
  void loadTabBindings().then(() => {
    // Re-apply bindings for active tab after load
    if (!isFirefox()) {
      void reapplyActiveTabBinding();
    }
  });
  initServices();
  registerService(TAB_SERVICE_KEY, tabService);
  registerService(CONTAINER_SERVICE_KEY, containerService);

  // Helper: for Firefox ensure tabs opened by an opener inherit the opener's container
  async function waitForTabUrl(tabId: number, timeoutMs = 3000): Promise<string | undefined> {
    return new Promise((resolve) => {
      let done = false;
      const onUpdated = (id: number, changeInfo: Browser.tabs.OnUpdatedInfo, tab: Browser.tabs.Tab) => {
        if (id !== tabId) return;
        if (changeInfo.url && changeInfo.url !== 'about:blank') {
          finish(changeInfo.url);
        }
      };
      const t = setTimeout(() => finish(undefined), timeoutMs);
      function finish(result?: string) {
        if (done) return;
        done = true;
        clearTimeout(t);
        browser.tabs.onUpdated.removeListener(onUpdated);
        resolve(result);
      }
      browser.tabs.onUpdated.addListener(onUpdated);
    });
  }

  async function ensureTabInOpenerContainer(tab: Browser.tabs.Tab): Promise<void> {
    if (!isFirefox()) return;
    if (!tab.openerTabId) return;
    if (!tab.id) return;

    try {
      const opener = await browser.tabs.get(tab.openerTabId);
      const openerBinding = tabBindings.get(opener.id);
      if (!openerBinding) return;

      const targetStoreId = openerBinding.cookieStoreId;
      // already correct
      if (tab.cookieStoreId === targetStoreId) {
        tabBindings.set(tab.id, { hostname: openerBinding.hostname, cookieStoreId: targetStoreId });
        saveTabBindings();
        return;
      }

      // Wait for a navigated URL if it's about:blank
      let url = tab.url && tab.url !== 'about:blank' ? tab.url : undefined;
      if (!url) {
        url = await waitForTabUrl(tab.id, 5000);
        if (!url) return;
      }

      // Create new tab in the correct container and close the original
      const newTab = await browser.tabs.create({
        url,
        cookieStoreId: targetStoreId,
        index: tab.index,
        openerTabId: opener.id,
        active: tab.active ?? false,
      });

      if (newTab.id) {
        tabBindings.set(newTab.id, { hostname: openerBinding.hostname, cookieStoreId: targetStoreId });
        pendingSwitches.add(newTab.id);
        saveTabBindings();
      }

      try {
        await browser.tabs.remove(tab.id);
      } catch {
        // ignore
      }
    } catch (err) {
      // ignore failures (tab may have been removed)
    }
  }

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

  // Chrome MV3: swap cookies when user switches tabs
  if (!isFirefox()) {
    browser.tabs.onActivated.addListener(async (activeInfo) => {
      const binding = tabBindings.get(activeInfo.tabId);
      if (!binding || !cookieService) return;
      try {
        if (binding.cookieStoreId === 'firefox-default') {
          await cookieService.clearForHostname(binding.hostname);
        } else {
          await cookieService.restoreForHostname(binding.cookieStoreId, binding.hostname);
        }
      } catch (err) {
        console.error('[background] Error swapping cookies on tab switch:', err);
      }
    });
  }

  // Ensure opener-created tabs inherit the opener's container (Firefox only)
  if (isFirefox()) {
    // tabs created by window.open/target=_blank
    browser.tabs.onCreated.addListener((tab) => {
      setTimeout(() => {
        void ensureTabInOpenerContainer(tab);
      }, 50);
    });

    // webNavigation fires for target=_blank/new-window navigations
    if (browser.webNavigation && browser.webNavigation.onCreatedNavigationTarget) {
      browser.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
        try {
          const newTab = await browser.tabs.get(details.tabId);
          await ensureTabInOpenerContainer(newTab);
        } catch {
          // ignore
        }
      });
    }
  }

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
    saveTabBindings();
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
        saveTabBindings();
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

  // Chrome MV3: cookie change sync — track changes per tab
  if (!isFirefox() && !hasBlockingWebRequest() && cookieService) {
    chrome.cookies.onChanged.addListener(async (changeInfo) => {
      const hostname = getHostname(
        `${changeInfo.cookie.secure ? 'https' : 'http'}://${changeInfo.cookie.domain.replace(/^\./, '')}${changeInfo.cookie.path}`
      );
      if (!hostname) return;

      // Find which tab is bound to this hostname
      for (const [tabId, binding] of tabBindings) {
        if (hostnameMatches(binding.hostname, hostname)) {
          // Verify this tab is active before syncing
          try {
            const tab = await browser.tabs.get(tabId);
            if (tab.active) {
              cookieService!.onCookieChanged(changeInfo, {
                accountId: binding.cookieStoreId,
                hostname: binding.hostname,
              });
              return;
            }
          } catch {
            // tab may have been removed
          }
        }
      }
    });
  }

  updateBadgeForActiveTab();
});
