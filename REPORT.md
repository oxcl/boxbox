# BoxBox — Report

Status at the end of the work: **the local fixture suite passes on all three real browsers** (the brief's definition of done),
the unit suite passes, and the three real-site smoke tests pass. Everything below is reproducible with
`direnv exec . npm test` and `direnv exec . npm run smoke`; numbers in this file come from the last full run
(`test-results/latest.json`, `test-results/smoke.json`).

Browsers under test (all from the flake): **Firefox 158.0.1**, **Google Chrome 155.0.8059.84 (MV3)**, **Helium 0.19.4.1 / Chromium 155 (MV2)**.

## 1. What each build does

| | Firefox | Chrome MV3 | Helium MV2 |
|---|---|---|---|
| Isolation primitive | native: one **container** per account | **virtualised** (see DESIGN §4) | **virtualised** |
| Network (cookies) | the container's own store | per-account *virtual jar*; `Cookie` set via debugger `Fetch` (explicit, even when empty); `Set-Cookie` stripped by a per-tab DNR rule and captured by a non-blocking `webRequest` observer | per-account virtual jar; synchronous blocking `webRequest` (strip `Set-Cookie`, set `Cookie`) |
| JS-visible state (`document.cookie`, `cookieStore`, localStorage, sessionStorage, IndexedDB, Cache Storage, OPFS, BroadcastChannel, Web Locks, SharedWorker) | native | main-world **shim** injected before page code by the debugger (`Page.addScriptToEvaluateOnNewDocument`, OOPIFs + workers via auto-attach) | main-world **shim** injected inline by the content script (CSP nonce added by the blocking handler) |
| Service workers | native | bypassed per target (`Network.setBypassServiceWorker`); page-side `serviceWorker` is an inert stub | foreign SW detected → debugger attached **to that tab only** for the bypass; stub as MV3 |
| HTTP cache | native | disabled per target | account requests revalidate (`no-cache`), account documents/XHR `no-store` |
| Leaving / entering / ask | blocking `webRequest` + tab re-creation | held at `Fetch` (account tabs); DNR **gate** redirect for Ask/Remember (no request before the choice) | blocking `webRequest` (cancel → picker) |
| Tab identity | container colour + tab groups | coloured **tab groups** | *(none — `tabGroups` is MV3-only)*; badge + border |
| Proxy | exact, per container (`proxy.onRequest`) | best effort: dynamic PAC + warnings | same as MV3 |
| Cost to the user | none | Chrome's "BoxBox started debugging this browser" bar on account tabs; fail-closed if closed | none (bar only on tabs with a foreign service worker) |

## 2. Test results

| Test | Firefox | Chrome MV3 | Helium MV2 |
|---|:-:|:-:|:-:|
| three tabs / three accounts / default: every storage type isolated | ✅ | ✅ | ✅ |
| default session is unaffected by accounts (and vice versa) | ✅ | ✅ | ✅ |
| navigating between domains of one service keeps the account | ✅ | ✅ | ✅ |
| user navigation to another service leaves the account | ✅ | ✅ | ✅ |
| page-initiated navigation (no user gesture) stays in the account | ✅ | ✅ | ✅ |
| OAuth: redirect flow to another service and back stays in the account | ✅ | ✅ | ✅ |
| popup (window.open) login stays inside the account | ✅ | ✅ | ✅ |
| embedded content (iframes) uses the tab's account | ✅ | ✅ | ✅ |
| link opened in a new tab: same service inherits the account, other service does not | ✅ | ✅ | ✅ |
| switching one tab's account never affects other tabs | ✅ | ✅ | ✅ |
| mode "default session": entering a service never switches account | ✅ | ✅ | ✅ |
| mode "remember last": opens in the account used last, and follows later choices | ✅ | ✅ | ✅ |
| mode "ask": picker appears before the page loads; choice opens the account | ✅ | ✅ | ✅ |
| mode "ask": choosing "Default session" opens the page in the default session | ✅ | ✅ | ✅ |
| per-service override beats the global mode | ✅ | ✅ | ✅ |
| ask mode with no accounts does not interrupt | ✅ | ✅ | ✅ |
| automatic fallback: unlisted sites are services keyed by registrable domain | ✅ | ✅ | ✅ |
| built-in catalog groups many domains into one service | ✅ | ✅ | ✅ |
| user edit: merging a domain into a service overrides the automatic layer | ✅ | ✅ | ✅ |
| user edit: splitting a domain out of a catalog service overrides the catalog | ✅ | ✅ | ✅ |
| user edit: create, rename and delete a service; user edits beat the catalog on rename | ✅ | ✅ | ✅ |
| merging two services moves accounts along | ✅ | ✅ | ✅ |
| page border: colored, labeled, non-blocking overlay on account pages only | ✅ | ✅ | ✅ |
| favicon badge: the site icon gets a dot in the account color | ✅ | ✅ | ✅ |
| tab color: account tabs are marked with the account color (container / tab group) | ✅ | ✅ | ✅ |
| deleting an account wipes its data and returns its tabs to the default session | ✅ | ✅ | ✅ |
| popup: shows the service, switches accounts, creates / edits / deletes an account | ✅ | ✅ | ✅ |
| popup: per-service entry mode override | ✅ | ✅ | ✅ |
| popup on a non-web page explains itself | ✅ | ✅ | ✅ |
| settings: general modes, theme, services editor (merge / split / create) and accounts | ✅ | ✅ | ✅ |
| picker UI screenshot (light + dark) | ✅ | ✅ | ✅ |
| Web Storage under isolation behaves like real Web Storage and stays private to the account | ✅ | ✅ | ✅ |
| IndexedDB / Cache Storage listings only show the account's own names | ✅ | ✅ | ✅ |
| BroadcastChannel is per account | ✅ | ✅ | ✅ |
| dedicated Worker sees the account's IndexedDB, Cache Storage and cookies — not the default session's | ✅ | ✅ | ✅ |
| a strict CSP (script nonce, connect-src self) does not break an account tab | ✅ | ✅ | ✅ |
| cookies written by page script are scoped, readable and sent to the server only within the account | ✅ | ✅ | ✅ |
| account data persists when its tabs close and reopen, and never reaches the default session | ✅ | ✅ | ✅ |
| deleting an account leaves no namespaced data in the origin storage | ✅ | ✅ | ✅ |
| a default-session service worker does not take over an account tab | ➖ | ✅ | ✅ |
| restored tab (browser restart) re-enters its account from its sessionStorage marker | ➖ | ✅ | ✅ |
| MV3: closing the debugging bar fails closed; "Restore isolation" brings the tab back | ➖ | ✅ | ➖ |
| MV3: WebSockets from account tabs are flagged (Chrome gives extensions no handshake hook) | ➖ | ✅ | ➖ |
| MV3: isolation state is rebuilt from storage after a service-worker restart | ➖ | ✅ | ➖ |
| proxy: each account exits through its own proxy (HTTP, SOCKS5, authenticated HTTP); default stays direct | ✅ | ✅ | ✅ |
| proxy: WebRTC cannot reveal the real address around a proxied account | ✅ | ✅ | ✅ |
| proxy (Chrome): two proxied accounts on the same service conflict — flagged, not silent | ➖ | ✅ | ✅ |
| proxy: a dead proxy fails closed (the request is not sent directly) | ✅ | ✅ | ✅ |
| proxy (Chrome): shared hosts and late-discovered third-party hosts raise a warning, never silence | ➖ | ✅ | ✅ |

**Totals** — Firefox: 42 passed, 0 failed, 7 skipped · Chrome MV3: 49 passed, 0 failed, 0 skipped · Helium MV2: 46 passed, 0 failed, 3 skipped

| Real-site smoke | Firefox | Chrome MV3 | Helium MV2 |
|---|:-:|:-:|:-:|
| saucedemo | ✅ | ✅ | ✅ |
| theInternet | ✅ | ✅ | ✅ |
| automationExercise | ✅ | ✅ | ✅ |
| popularSites | ✅ | ✅ | ✅ |


Legend: ✅ pass · ➖ skipped with a stated reason (Chrome-only / MV3-only behaviour) · ❌ fail.
Suites: `isolation navigation modes services identity deletion ui hardening proxy` (e2e, real browsers, local fixture) and
`tests/unit.mjs` (65 pure-logic checks). `test-results/screens/` contains a screenshot of every UI surface per browser.

### Mapping of the brief's verification list to tests

| Brief | Where |
|---|---|
| 3 tabs / 3 accounts / each only its own session in every storage type | `three tabs / three accounts / default…` (cookies incl. HttpOnly and third-party in a cross-site iframe, document.cookie, localStorage, sessionStorage, IndexedDB, Cache Storage, service worker) |
| default session unaffected | `default session is unaffected by accounts (and vice versa)`, plus every Chrome test starts a default tab on the same origin |
| same-service navigation keeps the account | `navigating between domains of one service keeps the account` (link click, typed URL, other *site* in the same service) |
| leave on user navigation; popups / OAuth / iframes stay | `user navigation to another service leaves…`, `page-initiated navigation…`, `OAuth…`, `popup (window.open) login…`, `embedded content…`, `link opened in a new tab…` |
| three entry modes + per-service overrides | `modes` suite (default / remember / ask, picker UI driven for real, *no request reaches the server before the choice*, override beats global, ask with no accounts does not interrupt) |
| user edits override the catalog | `services` suite (merge, split, create, rename, delete; layering also unit-tested) |
| deletion wipes data | `deleting an account wipes…` (all storage types, container removed on Firefox) and `…leaves no namespaced data in the origin storage` (Chrome: raw `localStorage` keys, IndexedDB names, Cache names and the virtual jar are verified empty from an un-shimmed default tab) |
| favicon badge, tab colour, page border | `identity` suite (border element, label, `pointer-events:none`, layout untouched, **screenshot pixel check** of the border colour; badge SVG decoded and the colour/original icon checked; container colour / tab-group title+colour) |
| proxy: exit IP on Firefox, warning on Chrome | `proxy` suite: HTTP, SOCKS5 and authenticated HTTP proxies bound to 127.0.0.2/.3/.4 and the fixture reporting the connection's source address; Firefox: exact incl. default session; Chrome: exit verified for the account's hosts **and** warnings asserted (shared host, late third-party host, conflicting accounts, dead proxy, toolbar badge, popup banner) |
| real-site smoke | `tests/smoke.mjs`: saucedemo.com, the-internet.herokuapp.com, automationexercise.com (creates two real accounts, then deletes them) + five big sites load inside an account |

## 3. Known limitations and leaks (with evidence)

Nothing here is silent: where the extension can detect a gap it says so in the popup / page label / toolbar badge.

### All Chrome builds (virtualised isolation)
1. **Account data lives in the origin's real storage under an opaque prefix.** A *default-session* page that enumerates
   `localStorage` keys, `indexedDB.databases()` or `caches.keys()` can see names like `__box_<id>__fx` (values are unreadable
   without the shim; names contain no account label). Evidence: the precondition of `deleting an account leaves no namespaced data…`
   asserts those names exist before deletion and are gone after. Account tabs never see the prefix (`IndexedDB / Cache Storage listings only show the account's own names`).
2. **`document.cookie` reads are a synchronous round-trip to the extension** (~2.3 ms vs 0.02 ms). Measured on the fixture
   (300 reads, Chrome 155 / Helium): `cookieReadMs` 2.38 / 2.19 vs 0.022 / 0.026. localStorage operations are unchanged (0.009 ms).
   Per-request cost: MV3 +1.5 ms sequential and ~2× on 50 parallel requests (each is paused at `Fetch`); MV2 ≈ 0.
   Pages whose CSP forbids same-origin XHR (`connect-src` without `'self'`) cannot use the channel on MV3; reads then return the last
   known value (MV2 rewrites the CSP, see DESIGN §12.6).
3. **Service workers are inert in account tabs** (registration resolves with a stub): offline/push features of a site do not work inside an
   account, and nothing from another session can reach it (`sw` state is `null`, never another account's).
4. **Permissions and browser-level state are per origin, not per account**: notification/geolocation/camera grants, saved passwords/autofill,
   passkeys, HTTP-auth credential cache, TLS/H2 connection reuse, client certificates and `localStorage`-adjacent browser features are shared. They are not
   "site-visible session state" in the brief's sense but they are not isolated.
5. **Workers**: MV3 runs the shim inside dedicated/shared workers before their first instruction (`dedicated Worker sees the account's…` passes on all builds).
   MV2 wraps `Worker`/`SharedWorker` in a blob; relative-URL APIs are re-resolved, but `self.location`/`import.meta.url` inside the worker are the blob's.
   Service-worker-owned clients and worklets are not wrapped.
6. **Opaque origins** (sandboxed iframes without `allow-same-origin`, `data:` documents) have no storage to isolate and no cookies; nothing leaks, nothing works.
7. **Session restore**: Chrome gives tabs new ids after a restart. BoxBox recovers each tab's account from a marker in the tab's restored `sessionStorage`
   (`restored tab… re-enters its account`); tabs whose sessionStorage was not restored come back in the default session.

### Chrome MV3 only
8. **The debugging bar.** Account tabs are attached through `chrome.debugger`, so Chrome shows *"BoxBox started debugging this browser"* on them. This is the cost of
   blocking semantics on MV3 (DESIGN §4.1). It is not visible in the headless e2e runs, so it is **not asserted by a test**. If the user closes it, Chrome detaches
   the debugger: BoxBox then **blocks the tab** (DNR block rule), keeps stripping `Set-Cookie`, shows a `fail` banner with *Restore isolation* (`closing the debugging bar fails closed…`).
9. **WebSockets** carry no cookies (the debugger's `Fetch` domain does not see WebSocket handshakes): no cross-account leak, but cookie-authenticated sockets
   will not authenticate. Flagged on the tab (`WebSockets from account tabs are flagged`).
10. **Tabs opened by the browser itself** (context-menu *Open link in new tab*, middle-click on browser UI): the debugger attaches after the first request starts, so that
    one request is sent in the default session and then replayed inside the account; the tab is flagged. Tabs opened by page script, `window.open`, `target=_blank`, ctrl/middle-click
    go through the shim's handshake and have **no** such gap (`popup (window.open) login…`, `link opened in a new tab…`). *The flag is by construction; the context-menu path itself is not automated.*
11. **Service-worker restarts.** All MV3 listeners are registered synchronously (required to be woken by events) and state is rebuilt from `storage` on start (tested by
    forcing the rebuild path: `isolation state is rebuilt from storage…`). A real worker termination **could not be provoked under puppeteer** (it keeps the worker alive; a
    DevTools-stopped extension worker never restarts in that harness — evidence: `ServiceWorker.stopWorker` leaves it in `starting` forever), so true idle-termination is untested.
12. `gate.html`/`gate.js` are web-accessible (DNR redirect target) so a web page can detect that BoxBox is installed.

### Helium MV2 only
13. No `chrome.tabGroups` (MV3-only): **no coloured tab indicator**; identity is the badge + border. Asserted in `tab color…` (`tabGroups` is `null`).
14. Helium ships its own bundled extension; the launcher cannot remove it (it is part of the browser).

### Per-account proxy
| | Firefox | Chrome (both) |
|---|---|---|
| Applies exactly and only to the account's tabs | **yes** (`proxy.onRequest` by container; default session verified direct while proxied tabs are open) | **no** — one browser-wide PAC |
| What is routed | everything the account's tabs do | the service's domains + every third-party host the account's tabs were seen to contact |
| Another tab (default session / other account) on the same hosts | unaffected | routed through the proxy too → **warn** ("N other tab(s)… share the proxy") |
| First contact with an unseen third-party host | proxied | may go **direct** once → **warn**, names the host (`leak.third.test` in the test: first request direct, next load proxied) |
| Two proxied accounts on the same service at once | works | cannot: first claim wins → **warn** naming the conflict |
| Dead/unreachable proxy | request fails (no direct fallback) | request fails (PAC is `mandatory`, no `DIRECT` fallback) → **fail** with the error |
| Auth | `onAuthRequired` (HTTP), credentials field (SOCKS5) | `onAuthRequired` (async) |
| DNS | by the proxy (`proxyDNS` for SOCKS5; HTTP proxies receive the hostname) — **verified** (SOCKS5 saw ATYP=domain) | by the proxy for SOCKS5/HTTP(S); **verified** |
| WebRTC | browser-wide `disable_non_proxied_udp` while any proxied account has a tab (Firefox cannot do per-container) | same policy + relay-only `RTCPeerConnection` in the shim (verified) |
| Another extension / policy controls the proxy | n/a | detected via `levelOfControl` → **fail** |
`*.localhost`/loopback names are never proxied by Chrome, so the proxy tests use `*.fixture.test` names.

### Firefox
15. Changing a tab's account re-creates the tab (containers cannot change in place): same position / window / pinned state / activation, **but a fresh back-history**.
16. Containers are visible in Firefox's own UI as `BoxBox · <name>`; WebRTC policy is browser-wide while a proxied container is open.

### Out of scope (per brief)
Cross-device sync, import/export, fingerprint isolation, remote catalog updates.

## 4. Real-site findings that the fixture could not catch
* saucedemo.com wraps `XMLHttpRequest.prototype.open` (error-reporter SDK) and breaks synchronous XHR → every `document.cookie` read failed in Chrome builds.
  Fixed by capturing the native XHR before page code runs (`smoke: saucedemo` on Chrome and Helium turned from ❌ to ✅).
* Chrome's `openerTabId` is set for browser-created tabs; using it for account inheritance leaked an account into a fresh tab (found by `default session is unaffected…`).
* Content script throttle initialised to 0 dropped gestures in the first 250 ms of a page's life (found by `user navigation to another service leaves…`).
* `CacheStorage` is `undefined` at start inside dedicated workers on Chrome 155 (lazy exposure); the shim now reaches it through `self.caches` (found by `dedicated Worker…`).

## 5. Decision log

1. **`.envrc` = `use flake`** as the brief says (the follow-up message mentioned `.direnvrc`; project-local `.direnvrc` is not read by direnv, so the environment is defined by the flake and activated by `.envrc`).
2. **Helium is not in nixpkgs**: the flake fetches the pinned upstream release tarball (`imputnet/helium-linux`, sha256 in `flake.nix`) and runs it in a `buildFHSEnv`. Chrome is unfree and allowed by an explicit predicate.
3. **Firefox build is MV2 with a persistent background**: blocking `webRequest` + `proxy.onRequest` are first-class there, and in-memory navigation chains avoid event-page suspension edge cases.
4. **Harness**: Selenium+geckodriver for Firefox (puppeteer/BiDi does not surface container tabs and no WebDriver can navigate to extension pages), puppeteer-core for Chrome (`Extensions.loadUnpacked`) and Helium. Extension pages are exercised in an `<iframe>` on a fixture page through a **test-only** bridge content script (compiled in `BOX_TEST=1` builds only, with the fixture services appended to the catalog).
5. **Fixture hostnames** are `*.localhost` (loopback + secure context in both engines, no DNS setup); proxy tests use `*.fixture.test` mapped by `--host-resolver-rules` / `network.dns.localDomains` because Chrome never proxies loopback names.
6. **Chrome storage virtualisation = namespace inside the real origin storage**, not an extension-held copy: it keeps IndexedDB/Cache/OPFS real (and fast), needs no synchronous snapshot channel for them, and survives the extension being disabled. Cost: limitation 1. Cookies are the exception (extension jar) because the network layer needs them.
7. **Accept a synchronous XHR for cookie reads**; it is the only way to make `document.cookie` correct right after a `Set-Cookie` response on both Chrome builds (measured cost in §3).
8. **User-initiated vs page-initiated** is decided by (a) no initiator = browser-initiated, (b) a *trusted* click/key/submit gesture within 1.5 s in the initiating page (reported synchronously on MV2, queried on demand elsewhere), (c) redirect hops inherit hop 0, (d) auth-looking URLs (`redirect_uri`, `client_id`, `/oauth`, SAML…) are flows, (e) navigations in `popup`-type windows are flows. A `window.open()` *without* features opens a tab and is classified like a link click (documented heuristic).
9. **"Remember my choice" in the picker** switches that service's mode to *Remember last*.
10. **Deleting an account** first moves its tabs to the default session (same URL), then wipes; Chrome records which origins an account touched, wipes them through a short-lived background tab (MV3 serves that page locally — no network), and keeps a *pending wipe* list for unreachable origins that is executed on the next visit.
11. **Jars persist everything**, including session cookies, across browser restarts (users of "continue where you left off" expect it); deleting the account deletes them.
12. **Colours**: accounts have free hex colours and 16 icons; Firefox containers and Chrome groups get the nearest of their fixed palettes.
13. **Chrome proxy only routes accounts that have an open tab**, so closing the last tab of a proxied account restores the browser's normal proxy.
14. **Catalog** is a curated 37-service list bundled in `src/core/catalog.js`; user edits are layered *before* the catalog, so a user mapping always wins even when a catalog entry is more specific.
15. **Not changing page titles / not injecting visible DOM besides the border host**: tab identity on builds without tab groups is the favicon badge and border only.
16. **`--silent-debugger-extension-api` is not passed anywhere** (launchers or tests): users should see the real MV3 behaviour.
17. **Test-profile hygiene**: every driver deletes its temporary profile; nothing is installed outside the flake.


## Addendum — the BoxBox UI (prototype → extension)

The interface was redesigned as a standalone prototype (`prototype/`, open `prototype/index.html`) and then ported into the real
extension pages. What changed in the extension:

* **Name and look:** the product is **BoxBox**. Warm cardboard palette, light and warm-espresso dark themes, Plus Jakarta Sans bundled
  in the extension (no network). Accounts are shown as CSS-3D boxes (`src/ui/box.js`): any colour, any of the 16 glyphs, a two-flap lid
  that opens, detail by size (so the many small ones stay cheap). Motion is a single spring engine that only runs while something moves
  (`src/ui/motion.js`); nothing runs at rest, and everything honours `prefers-reduced-motion`.
* **Popup:** the site header shrinks into the previous box while the new box lets a copy out, as one overlapped motion that also hands the
  real `setTabAccount` call over at the hand-over moment. The selection tick sits on the tile's border in the box colour.
* **Settings:** Services (accordion with domains, entry mode and the service's boxes), Entry modes, Proxies, Appearance & privacy, About.
  The old separate *Accounts* section is now inside each service.
* **Welcome:** first-run page (opened by `runtime.onInstalled`, never in test builds) with three slides and a lid-close transition; the
  entry mode chosen on the last slide is saved as the default.
* **In the page:** smaller name pill with a flat mini cube, a 4 px frame with a one-off light sweep; the **toolbar icon is the active box**
  (drawn with a canvas at runtime: `src/core/boxicon.js`), kraft when the tab is in no box.
* **Tests:** the UI suite follows the new pages (settings sections, accordion) and gained a welcome-page test. After the port:
  Firefox 43 pass / 7 skip, Chrome 50 pass, Helium 47 pass / 3 skip, 0 failures (one pre-existing pixel assertion on the page border
  needed the light sweep to be colour-matched; fixed and re-run on all three).
* **Performance:** `tests/perf/proto-bench.mjs` scripts hovers and clicks and records frame pacing, CPU per second, DOM size and heap.
  Findings that shaped the code: a big `backdrop-filter` over continuously animating content costs a lot (removed from large panels),
  hidden slides must pause their animations, and per-service account tiles are built only when a row opens. On software rendering the
  popup averages ~18 ms/frame through every interaction phase; JS heap stays under 2 MB.
