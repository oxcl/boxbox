// Chrome (MV3, branded Chrome) and Helium (MV2) driver: puppeteer-core over CDP.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sleep, waitFor } from './framework.mjs';

export class ChromeDriver {
  static async launch({ extDir, fixture, which, headless = true }) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `box-${which}-`));
    const common = ['--no-first-run', '--no-default-browser-check', '--password-store=basic', '--use-mock-keychain', '--disable-search-engine-choice-screen',
      '--host-resolver-rules=MAP echo.fixture.test 127.0.0.1,MAP echo2.fixture.test 127.0.0.1,MAP leak.third.test 127.0.0.1', '--window-size=1280,900', '--disable-background-networking'];
    let browser;
    if (which === 'chrome') {
      browser = await puppeteer.launch({ executablePath: process.env.BOX_CHROME, headless, pipe: true, enableExtensions: true, args: common, userDataDir, protocolTimeout: 120000 });
      await browser.installExtension(path.resolve(extDir));
    } else {
      browser = await puppeteer.launch({
        executablePath: process.env.BOX_HELIUM, headless, pipe: false, userDataDir, protocolTimeout: 120000,
        ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
        args: [...common, '--no-sandbox', '--load-extension=' + path.resolve(extDir), '--disable-features=ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled'],
      });
    }
    const drv = new ChromeDriver(browser, fixture, which, userDataDir);
    drv.extDir = path.resolve(extDir);
    if (process.env.BOX_DEBUG) drv.captureBackground();
    drv.control = await drv.openControl();
    if (which === 'helium') {      // Helium's bundled extensions reload the first pages after start-up; get that out of the way
      const w = await browser.newPage();
      await w.goto(fixture.url('ctl.localhost', '/blank')).catch(() => {});
      await sleep(5000);
      await w.close().catch(() => {});
    }
    return drv;
  }

  constructor(browser, fixture, name, profile) {
    this.browser = browser; this.fixture = fixture; this.name = name; this.profile = profile; this.extDir = null;
    this.ids = new Map(); this.next = 1;
  }

  /** BOX_DEBUG=1: print the extension background's console + errors. */
  captureBackground() {
    const hook = async (t) => {
      try {
        if (t.type() === 'background_page' && /^chrome-extension:/.test(t.url()) && !/blockjm/.test(t.url())) {
          const p = await t.page(); if (!p) return;
          p.on('console', (m) => console.error('[bg]', m.type(), m.text()));
          p.on('pageerror', (e) => console.error('[bg:error]', e.message));
        } else if (t.type() === 'service_worker' && /^chrome-extension:/.test(t.url())) {
          const w = await t.worker(); if (!w) return;
          w.on('console', (m) => console.error('[sw]', m.type(), m.text()));
        }
      } catch { /* ignore */ }
    };
    this.browser.on('targetcreated', hook);
    for (const t of this.browser.targets()) hook(t);
  }

  idOf(page) { if (!this.ids.has(page)) this.ids.set(page, this.next++); return this.ids.get(page); }
  tabFromPage(page) {
    if (process.env.BOX_DEBUG && !this._hooked) this._hooked = new WeakSet();
    if (process.env.BOX_DEBUG && !this._hooked.has(page)) { this._hooked.add(page); page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.error('[nav-event]', this.idOf(page), f.url()); }); }
    return new ChromeTab(this, page);
  }
  tabFromHandle(h) { for (const [p, id] of this.ids) if (id === h) return this.tabFromPage(p); throw new Error('no tab ' + h); }

  async pages() { return (await this.browser.pages()).filter((p) => !p.isClosed() && !/^chrome-extension:|^devtools:/.test(p.url())); }
  async handles() { return (await this.pages()).map((p) => this.idOf(p)); }
  async allTabs() { return (await this.pages()).filter((p) => p !== this.control.page).map((p) => this.tabFromPage(p)); }

  async openControl() {
    const [p] = await this.browser.pages();
    const page = p || await this.browser.newPage();
    await page.goto(this.fixture.url('ctl.localhost', '/blank'));
    const tab = this.tabFromPage(page);
    this.control = tab;
    for (let i = 0; i < 60; i++) { const r = await this.rawBridge({ type: 'ping' }, page).catch(() => null); if (r && r.ok) return tab; await sleep(500); }
    throw new Error('extension bridge not responding on ' + this.name);
  }

  async rawBridge(msg, page) {
    return page.evaluate((m) => new Promise((resolve) => {
      const id = Math.random();
      const f = (e) => { if (e.data && e.data.__boxRes === id) { window.removeEventListener('message', f); resolve(e.data.res); } };
      window.addEventListener('message', f); window.postMessage({ __boxReq: id, msg: m }, '*');
      setTimeout(() => resolve({ error: 'bridge timeout' }), 20000);
    }), msg);
  }
  async box(msg) {
    const r = await this.rawBridge(msg, this.control.page);
    if (r && r.error) throw new Error(`box(${msg.type}): ${r.error}`);
    return r;
  }

  async newTab(url = 'about:blank') {
    const page = await this.browser.newPage();
    const tab = this.tabFromPage(page);
    if (url !== 'about:blank') await tab.goto(url);
    return tab;
  }

  async closeAllTabs() {
    for (const t of await this.allTabs()) { try { await t.page.close(); } catch { /* gone */ } }
    try { await this.control.page.bringToFront(); } catch { /* ignore */ }
  }

  async moveTab(tab, accountId, url) {
    const id = await tab.boxId();
    await this.box({ type: 'setTabAccount', tabId: id, accountId, url });
    const target = url || null;
    await waitFor(async () => {
      try { return (!target || (await tab.url()).startsWith(target.split('?')[0])) && (await tab.eval(() => document.readyState)) === 'complete'; } catch { return false; }
    }, { message: 'tab loaded after account switch', timeout: 15000 });
    return tab;
  }

  /** Stop the extension's service worker the way Chrome does when it is idle (ServiceWorker.stopWorker through DevTools). */
  async killExtensionWorker() {
    const id = fs.readFileSync(path.join(this.extDir, '.extension-id'), 'utf8').trim();
    const page = await this.browser.newPage();
    try {
      await page.goto(`chrome-extension://${id}/settings.html`).catch(() => {});
      const cdp = await page.createCDPSession();
      const versions = [];
      cdp.on('ServiceWorker.workerVersionUpdated', (e) => versions.push(...e.versions));
      await cdp.send('ServiceWorker.enable');
      await sleep(500);
      const v = [...versions].reverse().find((x) => x.scriptURL.includes(id) && x.runningStatus === 'running');
      if (!v) throw new Error('extension worker version not found: ' + JSON.stringify(versions.map((x) => [x.scriptURL, x.runningStatus])));
      await cdp.send('ServiceWorker.stopWorker', { versionId: v.versionId });
      await sleep(1200);
    } finally { await page.close().catch(() => {}); }
    return true;
  }

  async quit() {
    try { await this.browser.close(); } catch { /* ignore */ }
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export class ChromeTab {
  constructor(drv, page) { this.drv = drv; this.page = page; this.id = drv.idOf(page); }
  get handle() { return this.id; }
  set handle(v) { /* tests may reassign for Firefox parity; ignored */ }
  async goto(url) { try { await this.page.goto(url, { waitUntil: 'load', timeout: 20000 }); } catch (e) { if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT|Navigation.*interrupted|frame was detached/i.test(e.message)) throw e; } }
  async gotoMayReplace(url) { return this.goto(url); }
  async url() { return this.page.url(); }
  async title() { return this.page.title(); }
  /** Retry when a navigation (ours or the browser's) destroys the execution context mid-call. */
  async retrying(fn) {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) { if (i < 4 && /Execution context was destroyed|Cannot find context|Target closed.*navigat|detached Frame/i.test(e.message)) { await sleep(400); continue; } throw e; }
    }
  }
  async eval(fn, ...args) { return (await this.retrying(() => this.page.evaluate(fn, ...args))) ?? null; }
  async click(sel) { await this.page.bringToFront(); await this.retrying(() => this.page.click(sel)); }
  async screenshot() { await this.page.bringToFront(); return Buffer.from(await this.retrying(() => this.page.screenshot({ type: 'png' }))); }
  async close() { await this.page.close(); }
  async boxId() { return (await this.retrying(() => this.drv.rawBridge({ type: 'test:sender' }, this.page))).tabId; }
  async frameEval(urlPart, fn, ...args) {
    return this.retrying(async () => {
      const f = this.page.frames().find((x) => x.url().includes(urlPart));
      if (!f) throw new Error('no frame matching ' + urlPart);
      return (await f.evaluate(fn, ...args)) ?? null;
    });
  }
  async frameEvalAtIndex(i, fn, ...args) {
    const f = this.page.mainFrame().childFrames()[i];
    if (!f) throw new Error('no child frame #' + i);
    return (await f.evaluate(fn, ...args)) ?? null;
  }
}
