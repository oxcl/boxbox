# Box

**Isolated accounts, per tab, in one browser profile.** Log in to the same website with different accounts at the same
time — in Firefox, Chrome (Manifest V3) and Helium (Manifest V2) — as if every tab were its own browser profile.

* **Services, not domains.** `youtube.com`, `accounts.google.com` and `gstatic.com` are one service, *Google*; moving
  between them never switches anything. A built-in catalog groups the common ones, every other site is its own service,
  and you can merge / split / create services yourself.
* **Accounts per service**, each with a name, colour, icon and an optional proxy. Switching one tab never touches another.
* **Default session** is your normal browser, untouched.
* **Entry modes** (global, with per-service override): open in the default session · remember the last account · ask with a picker *before the page loads*.
* **Visible at a glance:** coloured favicon badge, coloured tab group / container, and a coloured, labelled page border.
* **No network, no telemetry.** The catalog is bundled; Box never fetches anything.

How isolation is achieved on each build is in [DESIGN.md](DESIGN.md); what works, what doesn't, and the evidence is in
[REPORT.md](REPORT.md).

## Requirements

Only **Nix (flakes enabled) and direnv**. Everything else — Node, Firefox, Google Chrome (unfree, allowed explicitly in the
flake), Helium (fetched and wrapped by the flake), geckodriver, chromedriver, `zip`, `openssl` — comes from `flake.nix`.

```sh
direnv allow                     # once; .envrc is just `use flake`
direnv exec . npm ci             # install the JS dependencies (esbuild, puppeteer-core, selenium-webdriver, tldts)
```

Every command below is run as `direnv exec . <command>`; nothing is installed globally.

## Build

```sh
direnv exec . npm run build      # -> dist/firefox  dist/chrome-mv3  dist/chrome-mv2
BOX_TEST=1 direnv exec . npm run build   # -> dist-test/*  (adds the test bridge + fixture catalog; used by the tests)
```

Load by hand (the launchers below do this for you):

| Browser | How |
|---|---|
| Firefox | `about:debugging` → *This Firefox* → *Load Temporary Add-on…* → `dist/firefox/manifest.json` |
| Chrome | `chrome://extensions` → *Developer mode* → *Load unpacked* → `dist/chrome-mv3` |
| Helium | start with `--load-extension=dist/chrome-mv2 --disable-features=ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled` |

## Manual testing: one command per browser

Each command builds Box, then starts the browser with a **brand-new temporary profile that contains only Box**. Close the
window to end the session; the profile is deleted.

```sh
direnv exec . npm run launch:firefox
direnv exec . npm run launch:chrome
direnv exec . npm run launch:helium
# optional start page:  direnv exec . node scripts/launch.mjs chrome https://www.saucedemo.com/
```

Chrome shows its *"Box started debugging this browser"* bar on tabs that are inside an account — that is the price of
isolation on Manifest V3 (see DESIGN.md §4.1). Closing it makes that tab **fail closed** (blocked, with a *Restore
isolation* action in the popup) rather than silently unisolated.

## Tests

```sh
direnv exec . npm test                                  # unit tests, then the whole e2e matrix on all three browsers
direnv exec . npm run test:unit                         # 65 pure-logic checks (cookie jar, service layers, navigation policy, CSP patch)
direnv exec . npm run test:firefox | test:chrome | test:helium
direnv exec . node tests/run.mjs --browser chrome --suite navigation,modes --filter "popup"
direnv exec . npm run smoke                             # real sites (saucedemo, the-internet, automationexercise); sanity only
BOX_DEBUG=1 direnv exec . npm run test:helium           # also prints the extension's console
```

* **Fixture** (`fixture/`): one Node server answering for many `*.localhost` hostnames — service *Alpha*
  (`alpha.localhost`, `mail.`/`video.`/`accounts.alpha.localhost`, plus the *different-site* `alpha-static.localhost`),
  service *Beta*, unrelated *Gamma/Delta* — with a cross-domain login redirect, a popup login, an OAuth-style redirect flow,
  an embedded cross-site iframe, and session state in HttpOnly + plain cookies, localStorage, sessionStorage, IndexedDB, Cache
  Storage and a service worker. Every page prints `logged in as X`. `echo.fixture.test` plus local HTTP / SOCKS5 proxies
  (each exiting from its own loopback address) make exit IPs observable.
* **Runner** (`tests/run.mjs`): Firefox via Selenium + geckodriver (temporary add-on), Chrome via puppeteer (`Extensions.loadUnpacked`),
  Helium via puppeteer (`--load-extension`). Suites: `isolation navigation modes services identity deletion ui hardening proxy`.
* Screenshots of every UI surface are written to `test-results/screens/`; machine-readable results to `test-results/latest.json`.

## Project layout

```
flake.nix  .envrc                      full dev environment (browsers incl. Helium, node, drivers)
DESIGN.md  REPORT.md  README.md
build/                                 esbuild pipeline, manifests, procedural icon generator
src/core/                              platform-independent: services, catalog, store, navigation policy, controller (state + API)
src/platform/firefox.js                containers, webRequest, proxy.onRequest
src/platform/chrome-base.js            virtual jar, tab tracking, identity, wipe, tab groups
src/platform/chrome-mv2.js             blocking webRequest (Helium)
src/platform/chrome-mv3.js             debugger Fetch + DNR + entry gate (Chrome)
src/platform/chrome-proxy.js           PAC generation, auth, honest warning levels
src/chrome/{jar,shim}.js               RFC 6265 jar; main-world shim that namespaces every JS-visible store
src/content/content.js                 gesture tracking, page border, favicon badge, wipe
src/ui/                                popup, picker, settings, shared design system
fixture/  tests/  scripts/launch.mjs
```

## Privacy

Box makes no network requests of its own and ships no telemetry. The favicon badge fetches the *page's own* icon from the
page's origin without credentials, to draw a dot on it. Cookies of accounts (Chrome builds) are stored in
`storage.local` inside the browser profile; deleting an account deletes them.
