# Box — Design

Box gives each browser tab its own isolated "account" for a *service* (a group of
domains sharing one login), inside a single browser profile. This document was
written before implementation; §10 records what the pre-implementation spikes
(run on the real browsers in this repo's flake) confirmed and what they changed.

## 1. Concepts and data model

* **Service** — set of domains with one login. Resolution of `host → service` is
  layered, later layers win:
  1. *Automatic*: registrable domain (eTLD+1, via `tldts`' bundled public-suffix
     list) → service `auto:<domain>`, named from the domain.
  2. *Built-in catalog* (`src/shared/catalog.js`, bundled; no network ever).
  3. *User edits*: `domainMap` (`host-or-domain → serviceId`, longest-suffix match,
     consulted **entirely before** the catalog, so a user mapping always wins even if
     less specific), `services` (user-created/renamed). Merge = point domains at an
     existing service; split = point domains at a new service; rename = name override.
* **Account** — `{id, serviceId, name, color, icon, proxy?}`, per service, opaque
  random `id`. Never contains the service's data; all site data is keyed by `id`.
* **Default session** — no account (`null`): the browser's real, untouched state.
* **Tab state** — `tab → {accountId|null, homeService, flowService?}`. `homeService`
  is the service the account was entered for; a tab in a cross-service flow (OAuth)
  temporarily sits on a foreign service while keeping its account.
* **Entry modes** — `default` | `remember` | `ask`, global with per-service overrides.
  `lastAccount[serviceId]` feeds `remember`.

All state lives in `storage.local` (`settings`, `accounts`, `services`, `domainMap`,
`lastAccount`). No remote fetches, no telemetry, anywhere.

## 2. Navigation policy (shared by all builds)

Every top-level (main_frame) request is classified, then one of
`stay | move(account|null) | ask` is executed by the platform layer.

Classification of a navigation as **user-initiated** vs **page-initiated**:
* no initiator/origin (typed URL, bookmark, history, new-tab page) ⇒ user;
* initiated by a page ⇒ user only if the initiating page's content script saw a
  *trusted* click / Enter / form-submit within the last 1.5 s (query is awaited);
* every hop of a redirect chain inherits the classification of hop 0;
* **auth-looking** target URLs (`redirect_uri=`, `client_id=`, `SAMLRequest=`,
  `/oauth`, `/authorize`, `/saml`, `/sso`, `response_type=`) are treated as flow
  hops, never user-leave: "Sign in with Google" done by redirect returns to the
  original service in the same account.

Rules for target service `T`, tab state `(A, home)`:
* tab in account, `T == home` or `T == flowService` ⇒ stay (any domain of the service);
* tab in account, `T ≠ home`, page-initiated or auth-looking ⇒ stay, `flowService = T`;
* tab in account, `T ≠ home`, user-initiated ⇒ **leave**: tab becomes
  *entering T* (below), `home = T`;
* tab in default session, `T ≠ current service`, user-initiated ⇒ **enter T** per mode:
  `default` → stay; `remember` → move to `lastAccount[T]` if it exists; `ask` → picker
  (skipped when T has no accounts);
* popups (`openerTabId`) and new tabs opened from an account tab inherit
  `(A, home)` of the opener; if the new tab's first navigation is a user navigation
  to another service the normal rules apply, so a same-service link opens in the
  account and a foreign link leaves it.
* Explicit popup/picker switches set `(A, home=currentService)` and update
  `lastAccount`. Switching one tab never touches another tab.

Embedded content (iframes, scripts, XHR, images) is never classified — it is
always handled inside its tab's account.

## 3. Firefox build (native isolation)

* Account ⇄ **contextual identity** (`contextualIdentities.create`), `cookieStoreId`
  stored on the account. Containers isolate cookies (incl. HttpOnly, third-party),
  localStorage, sessionStorage, IndexedDB, Cache Storage, service workers, HTTP cache
  and more, natively and simultaneously.
* Changing a tab's account: container can't change in place, so open a new tab in
  the target container at the same index/URL/active state, then close the old one
  (create-then-close ⇒ no flicker). History cannot be transplanted; the new tab
  starts with a fresh back-stack (documented).
* Decisions run in a blocking `webRequest.onBeforeRequest` (main_frame): the request is
  cancelled **before it is sent** and the tab is replaced / sent to the picker.
* **Deleting an account** removes the container (`contextualIdentities.remove`), which
  makes Firefox destroy its whole storage; additionally `browsingData.remove` with
  `cookieStoreId` is issued first as belt and braces, then verified by tests.
* Colours/icons: container colour = nearest of Firefox's 9; icon mapped to nearest of
  its 13. The extension's own colour/icon are richer (hex colour, emoji-like glyph).
  Tab groups (`tabs.group`/`tabGroups`, Firefox ≥139) used when available.
* **Proxy** (required): `proxy.onRequest` with `details.cookieStoreId` → account's
  proxy, returned as the *only* element of the list (no direct fallback ⇒ fail closed).
  HTTP(S) and SOCKS5 (`proxyDNS: true` so DNS goes through the proxy), credentials via
  `proxyInfo.username/password` (SOCKS) and `webRequest.onAuthRequired` (HTTP).
  WebRTC: a main-world shim in proxied containers makes `RTCPeerConnection` relay-only
  (`iceTransportPolicy:'relay'`) so no local/public IP is gathered via STUN.

## 4. Chrome builds — virtualised isolation

Chrome has one cookie jar and one set of origin storage per profile. The extension
therefore **virtualises** a private world per (account, origin) and routes every
account tab into it. Three layers:

### 4.1 Network layer: cookies
Account cookies live in an extension-owned **virtual jar** (`src/chrome/jar.js`,
RFC 6265 matching: domain/host-only, path, Secure, SameSite, expiry, HttpOnly,
`__Host-/__Secure-` prefixes, partitioned ignored). The real jar is never touched by
account tabs:
* *Request*: strip the browser's `Cookie` header, set the jar's `Cookie` for that URL.
* *Response*: parse `Set-Cookie` into the jar, **remove it from the response** so it
  never reaches the real jar.

Per build:
* **MV2 / Helium** — synchronous blocking `webRequest` (`onBeforeSendHeaders`,
  `onHeadersReceived`). In-memory jar ⇒ strictly ordered; redirect chains are
  race-free. No debugger, no infobar.
* **MV3 / Chrome** — blocking webRequest does not exist for non-enterprise
  extensions, and `declarativeNetRequest` rules cannot hold per-request cookie
  values without a race on `302 + Set-Cookie → GET` login flows. Strategy
  ("the workaround"):
  - `chrome.debugger` attached **only to account tabs**, with the `Fetch` domain
    in the request stage. Each request is paused, the `Cookie` header is replaced from
    the in-memory jar, and the request continued — an async-blocking `onBeforeSendHeaders`
    with total ordering.
  - A per-tab DNR **session rule** (`tabIds:[tab]`) removes `Set-Cookie` from all
    responses *before* the network stack stores them.
  - A non-blocking `webRequest.onHeadersReceived` (`extraHeaders`) still sees the
    **original** `Set-Cookie` (verified in the spike), which updates the jar. Event
    order through the single extension event pipe is preserved, so the jar is updated
    before the redirect target's `Fetch.requestPaused` is handled.
  - Cost: Chrome shows its "Box started debugging this browser" infobar in account
    tabs (the only way to get blocking semantics). Closing it detaches the debugger;
    Box detects `onDetach` and shows an *isolation lost* warning and re-attaches on
    the next navigation. Default-session tabs are never debugged.
  - Auto-attach (`Target.setAutoAttach`, flatten) extends interception to OOPIF
    iframes and dedicated workers; service-worker bypass and cache disabling per tab
    (below).
  - WebSocket handshakes aren't visible to `Fetch`; a DNR rule strips `Cookie` on
    `websocket` requests from account tabs (no cross-account leak; WS auth by cookie
    won't work — surfaced as a limitation).

### 4.2 Page layer: JS-visible state (main-world shim `src/chrome/shim.js`)
Injected at `document_start` into **every frame** of account tabs before page code
(MV3: `Page.addScriptToEvaluateOnNewDocument` per attached target, config embedded;
MV2: inline `<script>` from the content script using a per-response CSP nonce injected
by the blocking `onHeadersReceived`, plus `contentWindow/contentDocument/frames`
hooks so dynamically created same-origin frames are patched before page code touches
them). It rewrites, per account `A`:
* `document.cookie` (get/set) and `cookieStore` → sync call to the background jar
  through a **synchronous XHR to a virtual endpoint** (`/__box_sync`, served by
  `Fetch.fulfillRequest` in MV3, and by a `data:` redirect in MV2 — spike-verified);
* `localStorage` / `sessionStorage` → `Proxy` over the real object that maps keys into
  a hidden namespace `\u0000box:<A>:` (named properties, `length`, `key()`, `Object.keys`,
  `in`, `delete`, storage events filtered/translated);
* `indexedDB` (`open/deleteDatabase/databases`) → names prefixed `box:<A>:`;
* `caches` (`open/has/delete/keys/match`) → prefixed names, `match` limited to the
  account's caches;
* `navigator.storage.getDirectory()` (OPFS) → account sub-directory;
* `BroadcastChannel`, `SharedWorker`(name), Web Locks names → prefixed;
* `navigator.serviceWorker.register` → resolves with an inert registration (account
  pages can't install a worker shared with other accounts);
* `Worker` constructor → wrapper that injects the same shim into the worker scope
  (IDB/caches/fetch-credentials) before the page script;
* `RTCPeerConnection` → relay-only in proxied accounts.

Account data therefore lives in the real origin storage under an opaque prefix. The
default session never *reads* it by accident; a default-session page enumerating
`indexedDB.databases()`/`caches.keys()` can see opaque prefixed names (documented
leak; values unreachable without the account id). The extension's own wipe records
which origins an account touched.

### 4.3 Service workers and HTTP cache
A service worker registered by the default session would control (and fetch on behalf
of) an account tab at the same origin. MV3: `Network.setBypassServiceWorker(true)` on
every attached target; plus `Network.setCacheDisabled(true)` so account responses don't
share the HTTP cache with other sessions. MV2: no debugger ⇒ responses of account tabs
are made uncacheable (`Cache-Control: no-store` appended), and an **active default-session
service worker controlling an account tab is detected** (`navigator.serviceWorker.controller`
non-null in the shim's document) and surfaced as a warning on the tab/badge.

### 4.4 Account deletion
Delete = drop the jar, then for each origin recorded in `account.origins` open a short-lived
background tab at `<origin>/__box_wipe` (MV3: request fulfilled locally by `Fetch`, no
network; MV2: whatever the server returns, an isolated-world content script runs the wipe),
which removes prefixed `localStorage` keys, IndexedDB databases, caches, OPFS dir. Origins
that can't be reached get a *pending wipe* record, executed by the content script on the
next visit to that origin by any tab.

### 4.5 Per-tab account switching on Chrome
No reopen: the `tab → account` map changes, shim+jar world switches, the tab reloads.
The previous account's `sessionStorage` is namespaced so nothing carries over.

## 5. Proxy on Chrome (best effort, never silent)

Chrome's `proxy.settings` is global; PAC scripts see only a URL. Strategy:
* Dynamic **PAC** generated from the set of hosts *requested by tabs of proxied accounts*
  (all domains of the account's service + every third-party host seen from those tabs)
  → that account's proxy; everything else `DIRECT`.
* Honest guarantee levels computed per tab and shown in popup/badge/page label:
  - `ok`   — one proxied account is active for this service, no other tab (default or
             other account) of that service is open, and no unseen host has been contacted;
  - `warn` — shared: another tab of the same service/hosts exists outside the account
             (its traffic is proxied too), two proxied accounts conflict on a host
             (first wins), a host was contacted before it was added to the PAC;
  - `fail` — proxy auth failed / proxy unreachable / `proxy.settings` controlled by
             another extension or policy ⇒ account tab is blocked-by-banner.
* Auth via `webRequest.onAuthRequired` (`blocking` in MV2, `asyncBlocking` + `webRequestAuthProvider` in MV3).
* WebRTC: `privacy.network.webRTCIPHandlingPolicy = disable_non_proxied_udp` while any proxied
  tab is open, plus shim relay-only. DNS: SOCKS5 and HTTP(S) proxies receive hostnames
  (remote DNS); direct-resolved hosts before PAC inclusion are the window above.
* `*.localhost`/loopback are implicitly un-proxied by Chrome (tests use non-loopback names).

## 6. Visual identity (all builds)

* **Favicon badge**: content script asks the background to fetch the page's icon
  (host permissions ⇒ no CORS taint), composites a coloured dot on `OffscreenCanvas`,
  and swaps `<link rel=icon>` with the data URL (MutationObserver keeps it applied).
* **Tab colour**: Firefox container colour (+ tab groups); Chrome `tabs.group` +
  `tabGroups.update({color,title})` (nearest of Chrome's palette). MV2/Helium: used when the
  API exists, else tab title prefix is *not* used (never modifies page titles).
* **Page border**: closed-world overlay `position:fixed; inset:0; pointer-events:none`
  in an open shadow root (open so tests can assert), account-colour 3 px frame + label pill
  that dodges the pointer. Top frame only. Does not affect layout.

## 7. UI

Vanilla JS + CSS, no framework, one design-token stylesheet shared by popup, picker and settings
(OKLCH-based palette, light/dark via `prefers-color-scheme` + manual override, spring easing
tokens, `prefers-reduced-motion` respected). Popup (≈360 px): current service header with
favicon + domain chips, account list as cards with colour ring/icon/proxy state, radio-style
switch with animated selection, inline create/edit sheet (name, colour swatches, icon grid,
proxy), delete with confirm sheet. Picker: full-tab, service-branded, large account tiles +
"Default session" tile + "remember my choice". Settings: sidebar sections (General,
Services, Accounts, Proxy), service editor with drag/drop-free merge/split dialogs.

## 8. Build

`build/build.mjs` (esbuild) emits `dist/firefox`, `dist/chrome-mv3`, `dist/chrome-mv2` from one
source tree: shared `src/core`, per-platform `src/platform/{firefox,chrome-mv3,chrome-mv2}` and
manifests generated from a template. `BOX_TEST=1` additionally emits `dist-test/*` with
(a) a postMessage⇄runtime bridge content script on fixture hosts (extension pages cannot be
navigated by WebDriver), (b) the fixture services appended to the built-in catalog. Production
builds contain neither.

## 9. Test plan

Fixture (`fixture/`): one Node server, hostnames under `*.localhost` (loopback and secure-context
by spec in both engines, no DNS setup): service **Alpha** = `alpha.localhost` (+`mail.`, `accounts.`,
`video.` sub-domains + `alpha-static.localhost` as a *different-site* domain that appears in the
catalog entry), service **Beta** = `beta.localhost`. Alpha: cross-domain login redirect
(`accounts` → `alpha`), popup login flow (`window.open` + `postMessage`), embedded cross-site iframe
(sets a *third-party* cookie), state in HttpOnly + plain cookies, localStorage, sessionStorage,
IndexedDB, Cache Storage and a service worker; every page prints `logged in as X` and exposes a
`/api/state` JSON dump. Proxy tests use non-loopback names, a local HTTP proxy bound to `127.0.0.2`
and a SOCKS5 proxy bound to `127.0.0.3` so the fixture's `/whoami` reports the exit address.

E2E runner (`tests/`) drives real Firefox (Selenium/geckodriver), Chrome (puppeteer, `Extensions.loadUnpacked`
via pipe) and Helium (puppeteer, `--load-extension`) with one scenario list; scenarios listed in the
brief are each a test; Chrome-only proxy tests assert the warning state. Real-site smoke tests
(saucedemo, the-internet, automationexercise) run in a separate non-gating command.

## 10. Spike results (pre-implementation, on the real binaries)

| Question | Result |
|---|---|
| Chrome 155: load MV3 unpacked in tests | `puppeteer.launch({enableExtensions})` + `browser.installExtension()` works headless |
| MV3: debugger `Fetch` can rewrite `Cookie` on paused request | ✅ server saw injected `virt=1` |
| MV3: DNR `tabIds` rule strips `Set-Cookie` before the jar | ✅ real jar empty |
| MV3: `webRequest` observer still sees stripped `Set-Cookie` | ✅ original values visible (DNR applies after observers) |
| MV3: Fetch response stage after DNR strip | sees *no* Set-Cookie ⇒ the observer is the capture point; order verified `wr(/set) → resp(/set) → req(/show)` |
| Helium 0.19.4.1 (Chromium 155): MV2 loads, blocking webRequest | ✅ (needs `--load-extension`, MV2 flags) |
| MV2: sync XHR answered by `redirectUrl: data:` | ✅ returns arbitrary JSON synchronously |
| MV2: manifest `"world":"MAIN"` | ❌ ignored ⇒ inline-script + CSP-nonce injection (or debugger) |
| Firefox 158: puppeteer/BiDi sees container tabs | ❌ (tabs in containers aren't surfaced) ⇒ Selenium+geckodriver for Firefox |
| WebDriver can navigate to `moz-extension://` | ❌ ⇒ test bridge opens extension pages itself; UI tested through an `<iframe>` of the page |

## 11. Known risks (see REPORT.md for evidence)

1. MV3 infobar and reliance on `chrome.debugger` (single largest UX cost).
2. Sync XHR on the page main thread for cookie reads (latency).
3. Workers/SharedWorkers/cross-origin worker requests: best-effort.
4. Default session sees opaque prefixed names in IDB/Cache listing.
5. Chrome proxy cannot be exact per tab.
6. Firefox container switch loses the tab's back-history.
7. Browser-restart: Chrome tab ids change; restored tabs recover their account from a
   marker the shim keeps in `sessionStorage` (restored by Chrome).
