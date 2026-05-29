let _hasBlocking: boolean | undefined;

export function hasBlockingWebRequest(): boolean {
  if (_hasBlocking !== undefined) return _hasBlocking;
  // In MV3, blocking webRequest is not available without webRequestBlocking permission
  // addListener doesn't throw but the listener is never invoked
  if (browser.runtime.getManifest().manifest_version === 3) {
    _hasBlocking = false;
    return _hasBlocking;
  }
  try {
    const listener = () => {};
    chrome.webRequest.onBeforeRequest.addListener(listener, { urls: [] }, ['blocking']);
    chrome.webRequest.onBeforeRequest.removeListener(listener);
    _hasBlocking = true;
  } catch {
    _hasBlocking = false;
  }
  return _hasBlocking;
}
