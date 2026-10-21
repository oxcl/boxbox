// Test-only content script (BOX_TEST=1 builds): lets WebDriver talk to the extension from a normal page.
//   window.postMessage({__boxReq: id, msg}) -> runtime.sendMessage(msg) -> window.postMessage({__boxRes: id, res})
//   window.postMessage({__boxFrame: 'popup.html?tab=1'}) -> embeds that extension page in an iframe (#boxframe)
import { ext } from '../core/ext.js';
document.documentElement.setAttribute('data-box-bridge', '1');
window.addEventListener('message', async (e) => {
  if (e.source !== window || !e.data) return;
  if (e.data.__boxReq !== undefined) {
    let res; try { res = await ext.runtime.sendMessage(e.data.msg); } catch (err) { res = { error: String(err) }; }
    window.postMessage({ __boxRes: e.data.__boxReq, res }, '*');
  } else if (e.data.__boxFrame) {
    document.getElementById('boxframe')?.remove();
    const f = document.createElement('iframe');
    f.id = 'boxframe'; f.src = ext.runtime.getURL(e.data.__boxFrame);
    f.style.cssText = 'position:fixed;top:0;left:0;width:' + (e.data.w || 380) + 'px;height:' + (e.data.h || 640) + 'px;z-index:2147483646;border:0;background:#fff';
    document.documentElement.appendChild(f);
  }
});
