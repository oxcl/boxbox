// Background entry point shared by all builds; the platform is selected at build time.
import { ext, TARGET } from '../core/ext.js';
import { Controller } from '../core/controller.js';
import { badgedIcon } from '../core/identity.js';
/* platform-selected-by-esbuild-alias */
import { createPlatform } from 'box-platform';
import { installTestHooks } from '../test/hooks.js';

const platform = createPlatform();
const controller = new Controller(platform);
let initState = 'starting', initError = null;
const ready = controller.init().then(() => { initState = 'ready'; }, (e) => { initState = 'failed'; initError = String(e && e.stack || e); console.error('Box init failed', e); throw e; });

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;
  if (msg.type === 'ping') { sendResponse({ ok: true, target: TARGET, init: initState, initError }); return false; }
  (async () => {
    await ready;
    if (msg.type === 'badgeIcon') return badgedIcon(msg.href, msg.color, msg.host);
    if (typeof __TEST__ !== 'undefined' && __TEST__ && msg.type.startsWith('test:')) return installTestHooks(controller, platform).handle(msg, sender);
    return controller.handle(msg, sender);
  })().then((r) => sendResponse(r === undefined ? null : r), (e) => sendResponse({ error: String(e && e.message || e) }));
  return true;
});

globalThis.__box = { controller, platform, TARGET };
