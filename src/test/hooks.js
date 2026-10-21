// Test-only helpers, compiled into BOX_TEST=1 builds. They expose nothing the UI could not do through
// the normal API, except enumerating state and opening extension pages (which WebDriver cannot navigate to).
import { ext } from '../core/ext.js';
import { DEFAULT_STATE } from '../core/model.js';

let hooks;
export function installTestHooks(controller, platform) {
  if (hooks) return hooks;
  hooks = {
    async handle(msg, sender) {
      switch (msg.type) {
        case 'test:openUi': {
          const url = ext.runtime.getURL(msg.page + (msg.query ? '?' + msg.query : ''));
          const t = await ext.tabs.create({ url, active: msg.active !== false, windowId: msg.windowId });
          return { tabId: t.id };
        }
        case 'test:tabs': {
          const tabs = await ext.tabs.query({});
          return tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, cookieStoreId: t.cookieStoreId, windowId: t.windowId, index: t.index, active: t.active, groupId: t.groupId, state: controller.tabs.get(t.id) || null }));
        }
        case 'test:sender': return { tabId: sender?.tab?.id, windowId: sender?.tab?.windowId };
        case 'test:state': return { ...controller.state, tabs: [...controller.tabs.entries()], pickers: [...controller.pickerFor.entries()] };
        case 'test:reset': {
          for (const id of Object.keys(controller.accounts)) await controller.deleteAccount(id);
          const d = DEFAULT_STATE();
          await controller.store.update((s) => { s.settings = d.settings; s.user = d.user; s.lastAccount = {}; s.origins = {}; });
          controller.tabs.clear();
          await platform.testCall?.('wipeDefault', { origins: msg.origins });
          return true;
        }
        case 'test:closeTab': await ext.tabs.remove(msg.tabId); return true;
        case 'test:platform': return platform.testCall ? platform.testCall(msg.call, msg.args) : null;
        default: return platform.handleMessage ? platform.handleMessage(msg, sender) : null;
      }
    },
  };
  return hooks;
}
