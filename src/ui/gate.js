// MV3 interstitial: DNR redirects navigations into services that need an entry decision here, *before any request is sent*.
// The background decides (stay / switch account / show picker); this page then continues to the real URL or the picker.
import { ext } from '../core/ext.js';

const url = location.search.slice(3);   // raw: everything after "?u="
(async () => {
  try {
    const r = await ext.runtime.sendMessage({ type: 'gate', url });
    if (r && r.go) location.replace(r.go);
  } catch (e) {
    location.replace(url);               // never strand the user
  }
})();
