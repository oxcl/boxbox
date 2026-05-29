# AGENTS.md

Compact instructions for agents working on the BoxBox extension.

## Project Overview

- **Goal**: Browser extension providing account-based container management with cross-browser support (Firefox + Chrome).
- **Tech Stack**: WXT (Web Extension Toolkit) with TypeScript, vanilla DOM popup.
- **Key Features**: Automatic container switching based on hostname, container creation/renaming/deletion, persistent last-selected mapping.

## Developer Commands

### Installation

```bash
bun install
```

### Dev Server

```bash
bun run dev              # Firefox (default)
bun run dev:firefox      # Firefox
bun run dev:chrome       # Chrome
```

**Never start, stop, or kill the dev server.** WXT hot-reloads automatically when source files change. always assume the dev server is running.


### Lint & Typecheck

```bash
bun run compile
bun run lint
```

## Browser-Specific Architecture

| Layer | Firefox | Chrome MV2 (blocking) | Chrome MV3 (global swap) |
|---|---|---|---|
| **Containers** | `contextualIdentities` (native) | Storage-backed UUIDs | Storage-backed UUIDs |
| **Cookie isolation** | Native containers | `webRequest` blocking (per-tab) | `cookies` API swap (per-hostname) |
| **Tab binding** | `cookieStoreId` in `tabs.create()` | In-memory `tabBindings` Map | In-memory `tabBindings` Map |
| **Storage** | `local:accounts`, `local:hostnameAccounts`, `local:lastSelected` | Same + `local:chromeContainerMeta` + `local:cookieJars` | Same |

## Key Abstractions

### Container Service (`services/container-service/`)

All platform-specific logic is behind the `ContainerService` interface:

- `create/query/update/remove` — CRUD for containers
- `applyAccount` — activate an account for a tab's navigation (Firefox: opens new tab in container; Chrome MV2: just binds; Chrome MV3: swaps cookies)
- `applyDefault` — deactivate (Firefox: opens default tab; Chrome: clears cookies)
- `onNavigateAway` — tab leaves a bound hostname (Chrome MV3: saves cookies back to jar)

**File structure:**
- `types.ts` — shared interfaces (`ContainerService`, `ContainerInfo`, `ContainerMetaMap`, `CookieStoreOps`)
- `firefox.ts` — `FirefoxContainerService` (uses `browser.contextualIdentities`)
- `chrome.ts` — `ChromeContainerService` (uses storage-backed UUIDs + CookieStoreOps)
- `utils.ts` — `hasBlockingWebRequest()` utility
- `index.ts` — re-exports + `ContainerProxyService` proxy for popup

### Cookie Store (`services/cookie-store.ts`) — Chrome only

Per-account cookie jars stored in `local:cookieJars`:

- `saveForHostname` — reads current cookies from `chrome.cookies`, stores in account's jar
- `restoreForHostname` — clears hostname cookies, restores from account's jar
- `clearForHostname` — removes all cookies for a hostname
- `onCookieChanged` — syncs cookie changes back to the active account's jar

## Code Conventions

### Browser API Usage

- Use `browser` global (WebExtensions API) for cross-browser code.
- Use `chrome.*` only in Chrome-specific code paths, guarded by `!isFirefox()`.
- Use `isFirefox()` from `services/tabs.ts` for runtime browser detection.
- Use `hasBlockingWebRequest()` from `services/container-service/utils.ts` to detect MV2 blocking capability.
- For container operations in popup: use `containerService` proxy (auto-routes to background).
- For storage: WXT's `storage.defineItem` API (see `services/storage.ts`).

### Container Naming

Containers must follow the format `name (hostname)` (e.g., `Work (facebook.com)`). The extension uses `formatContainerName()` in `services/storage.ts` to produce this format.

### Storage Schema

All storage uses WXT's `storage.defineItem` API with `local:` prefix:

- `local:accounts`: `Record<string, Account>` — maps account ID to `Account` object
- `local:hostnameAccounts`: `Record<string, string[]>` — maps hostname to account IDs
- `local:lastSelected`: `Record<string, string>` — maps hostname to active account ID
- `local:chromeContainerMeta`: `Record<string, ContainerInfo>` — Chrome-only container metadata (name, color, icon)
- `local:cookieJars`: `Record<accountId, Record<hostname, StoredCookie[]>>` — Chrome-only per-account cookie jars

## Testing with crx-mcp (Chrome)

The project is configured with `crx-mcp` (Chrome Extension MCP server). Use these tools to test the Chrome build.

### Workflow

1. **Dev server outputs** to `.output/chrome-mv3-dev` (NOT `.output/chrome-mv3`). the dev server is always running. no need to start it.
2. **Load the extension** with `crx-mcp_extension_load` using path `.output/chrome-mv3-dev` to launch Chrome.
3. **Navigate** to a website (e.g., `https://example.com`) with `crx-mcp_navigate` to test auto-switching.
4. **Open popup** with `crx-mcp_open_popup` to inspect the UI.
5. **Inspect storage** with `crx-mcp_storage_get` to verify `local:accounts`, `local:hostnameAccounts`, `local:cookieJars`.
6. **Check console logs** with `crx-mcp_console_logs` for background script output.
7. **Evaluate in Service Worker** with `crx-mcp_eval_service_worker` to inspect runtime state (e.g., `tabBindings`).
8. **After editing source**, WXT hot-reloads automatically. you would rarely need to reload the extension or close chrome instance. If the extension doesn't reflect changes, call `crx-mcp_reload_extension`.
9. **Test popup** with `crx-mcp_open_popup`, then `crx-mcp_snapshot` to see the rendered UI.
10. write helper functions and code for debugging since you don't have access to the popup directly and you can't switch accounts from the popup. you are free to write your own code to test the extension.

### Storage Inspection

```typescript
// Read accounts
crx-mcp_storage_get local:accounts

// Read last selected mappings
crx-mcp_storage_get local:lastSelected

// Read cookie jars (Chrome)
crx-mcp_storage_get local:cookieJars

// Read container metadata (Chrome)
crx-mcp_storage_get local:chromeContainerMeta
```

### Service Worker Inspection

```typescript
// List tab bindings
crx-mcp_eval_service_worker JSON.stringify([...globalThis.__tabBindings || []])

// Global variables are not persisted across SW restarts —
// use crx-mcp_eval_service_worker for real-time inspection
```