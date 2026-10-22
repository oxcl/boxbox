// Firefox driver: Selenium + geckodriver, extension installed as a temporary add-on.
import { Builder, By } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { sleep, waitFor } from './framework.mjs';

export const UUID = '7b6c3a3e-0d57-4b5b-9d61-6a1f2f7e1a01';
export const EXT_ID = 'box@box.local';

export class FirefoxDriver {
  static async launch({ extDir, fixture, headless = true, prefs = {} }) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'box-ff-'));
    const o = new firefox.Options().setBinary(process.env.BOX_FIREFOX);
    if (headless) o.addArguments('-headless');
    o.setPreference('extensions.webextensions.uuids', JSON.stringify({ [EXT_ID]: UUID }));
    o.setPreference('privacy.userContext.enabled', true);
    o.setPreference('network.dns.localDomains', 'echo.fixture.test,echo2.fixture.test,leak.third.test');
    o.setPreference('browser.shell.checkDefaultBrowser', false);
    o.setPreference('datareporting.policy.dataSubmissionEnabled', false);
    o.setPreference('app.update.auto', false);
    o.setPreference('app.update.enabled', false);
    o.setPreference('browser.startup.homepage_override.mstone', 'ignore');
    o.setPreference('startup.homepage_welcome_url', 'about:blank');
    o.setPreference('network.captive-portal-service.enabled', false);
    o.setPreference('network.proxy.allow_hijacking_localhost', true);
    o.setPreference('devtools.chrome.enabled', true);
    for (const [k, v] of Object.entries(prefs)) o.setPreference(k, v);
    if (process.env.BOX_DEBUG) { o.setPreference('devtools.console.stdout.chrome', true); o.setPreference('devtools.console.stdout.content', true); }
    const svc = new firefox.ServiceBuilder(process.env.BOX_GECKODRIVER);
    if (process.env.BOX_DEBUG) svc.setStdio('inherit');
    const d = await new Builder().forBrowser('firefox').setFirefoxOptions(o).setFirefoxService(svc).build();
    const drv = new FirefoxDriver(d, fixture, profile);
    await d.installAddon(path.resolve(extDir), true);
    drv.control = await drv.openControl();
    return drv;
  }

  constructor(d, fixture, profile) { this.d = d; this.fixture = fixture; this.profile = profile; this.name = 'firefox'; this.tabsOpened = new Set(); this.queue = Promise.resolve(); }

  /** Serialise WebDriver calls (one session, one "current window"). */
  lock(fn) { const p = this.queue.then(fn, fn); this.queue = p.catch(() => {}); return p; }

  async handles() { return this.d.getAllWindowHandles(); }

  async openControl() {
    const h = (await this.handles())[0];
    await this.d.switchTo().window(h);
    await this.d.get(this.fixture.url('ctl.localhost', '/blank'));
    for (let i = 0; i < 40; i++) { const r = await this.rawBridge({ type: "ping" }, h); if (r && r.ok) break; if (i === 39) throw new Error("bridge not responding: " + JSON.stringify(r)); await sleep(500); }
    return new FirefoxTab(this, h);
  }

  async rawBridge(msg, handle) {
    return this.lock(async () => {
      if (handle) await this.d.switchTo().window(handle);
      return this.d.executeAsyncScript(function (m) {
        const cb = arguments[arguments.length - 1]; const id = Math.random();
        const f = (e) => { if (e.data && e.data.__boxRes === id) { window.removeEventListener('message', f); cb(e.data.res); } };
        window.addEventListener('message', f); window.postMessage({ __boxReq: id, msg: m }, '*');
        setTimeout(() => cb({ error: 'bridge timeout' }), 15000);
      }, msg);
    });
  }

  /** Send a message to the extension background. */
  async box(msg) {
    const r = await this.rawBridge(msg, this.control.handle);
    if (r && r.error) throw new Error(`box(${msg.type}): ${r.error}`);
    return r;
  }

  async newTab(url = 'about:blank') {
    const before = new Set(await this.handles());
    const h = await this.lock(async () => {
      await this.d.switchTo().window(this.control.handle);
      await this.d.switchTo().newWindow('tab');
      return this.d.getWindowHandle();
    });
    const tab = new FirefoxTab(this, h);
    if (url !== 'about:blank') await tab.goto(url);
    return tab;
  }

  /** Wait for a tab that did not exist in `before` (handle list) to appear. */
  async waitNewTab(before, { url } = {}) {
    const beforeSet = new Set(before);
    const h = await waitFor(async () => {
      for (const x of await this.handles()) {
        if (beforeSet.has(x)) continue;
        if (url) { const u = await new FirefoxTab(this, x).url(); if (!u.startsWith(url)) continue; }
        return x;
      }
      return null;
    }, { message: 'new tab', timeout: 10000 });
    return new FirefoxTab(this, h);
  }

  async allTabs() { return (await this.handles()).filter((h) => h !== this.control.handle).map((h) => new FirefoxTab(this, h)); }

  async closeAllTabs() {
    for (const t of await this.allTabs()) { try { await t.close(); } catch { /* gone */ } }
    await this.lock(() => this.d.switchTo().window(this.control.handle));
  }

  async quit() { try { await this.d.quit(); } catch { /* ignore */ } }
}

export class FirefoxTab {
  constructor(drv, handle) { this.drv = drv; this.handle = handle; }
  get d() { return this.drv.d; }
  with(fn) { return this.drv.lock(async () => { await this.d.switchTo().window(this.handle); return fn(this.d); }); }

  goto(url) { return this.with((d) => d.get(url)); }
  /** Navigate where the extension may close/replace this tab mid-flight (WebDriver then errors). */
  async gotoMayReplace(url) { try { await this.goto(url); } catch (e) { if (!/contentBrowser|no such window|closed|Browsing context has been discarded/i.test(String(e.message))) throw e; } }
  url() { return this.with((d) => d.getCurrentUrl()); }
  title() { return this.with((d) => d.getTitle()); }
  async eval(fn, ...args) {
    const src = `const cb = arguments[arguments.length-1]; const args = Array.prototype.slice.call(arguments, 0, -1);
      Promise.resolve((${fn.toString()}).apply(null, args)).then(v => cb({v: v === undefined ? null : v}), e => cb({e: String(e && e.stack || e)}));`;
    const r = await this.with((d) => d.executeAsyncScript(src, ...args));
    if (!r) throw new Error('eval returned nothing (page navigated during evaluation?)');
    if (r.e) throw new Error('eval failed: ' + r.e);
    return r.v;
  }
  async click(sel) { await this.with(async (d) => (await d.findElement(By.css(sel))).click()); }
  async screenshot() { return Buffer.from(await this.with((d) => d.takeScreenshot()), 'base64'); }
  async close() { await this.with((d) => d.close()); }
  /** Extension-side tab id (via the test bridge content script). */
  async boxId() { return (await this.drv.rawBridge({ type: 'test:sender' }, this.handle)).tabId; }
  async frameEval(urlPart, fn, ...args) {
    // evaluate in an iframe whose src contains `urlPart`
    return this.with(async (d) => {
      const frames = await d.findElements(By.css('iframe'));
      for (const f of frames) {
        const src = await f.getAttribute('src');
        if (src && src.includes(urlPart)) {
          await d.switchTo().frame(f);
          try {
            const code = `const cb = arguments[arguments.length-1]; const args = Array.prototype.slice.call(arguments, 0, -1);
              Promise.resolve((${fn.toString()}).apply(null, args)).then(v => cb({v: v === undefined ? null : v}), e => cb({e: String(e && e.stack || e)}));`;
            const r = await d.executeAsyncScript(code, ...args);
            if (r.e) throw new Error(r.e);
            return r.v;
          } finally { await d.switchTo().defaultContent(); }
        }
      }
      throw new Error('no iframe matching ' + urlPart);
    });
  }
  async frameEvalAtIndex(i, fn, ...args) {
    return this.with(async (d) => {
      const f = (await d.findElements(By.css('iframe')))[i];
      await d.switchTo().frame(f);
      try {
        const code = `const cb = arguments[arguments.length-1]; const args = Array.prototype.slice.call(arguments, 0, -1);
          Promise.resolve((${fn.toString()}).apply(null, args)).then(v => cb({v: v === undefined ? null : v}), e => cb({e: String(e && e.stack || e)}));`;
        const r = await d.executeAsyncScript(code, ...args);
        if (r.e) throw new Error(r.e);
        return r.v;
      } finally { await d.switchTo().defaultContent(); }
    });
  }
}

FirefoxDriver.prototype.moveTab = async function (tab, accountId, url) {
  const before = await this.handles();
  const id = await tab.boxId();
  const r = await this.box({ type: 'setTabAccount', tabId: id, accountId, url });
  if (r && r.error) throw new Error(r.error);
  const after = await this.handles();
  if (after.length === before.length && after.every((x) => before.includes(x))) return tab;   // same tab
  const h = await waitFor(async () => {
    const cur = await this.handles();
    const gone = before.filter((x) => !cur.includes(x));
    const added = cur.filter((x) => !before.includes(x));
    return gone.length && added.length ? added[0] : null;
  }, { message: 'replacement tab', timeout: 10000 });
  const nt = new FirefoxTab(this, h);
  await waitFor(async () => { try { return (await nt.url()) !== 'about:blank' && (await nt.eval(() => document.readyState)) === 'complete'; } catch { return false; } }, { message: 'replacement tab loaded' });
  return nt;
};
FirefoxDriver.prototype.tabFromHandle = function (h) { return new FirefoxTab(this, h); };
