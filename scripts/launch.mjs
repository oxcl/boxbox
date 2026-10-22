// Manual-testing launcher:  direnv exec . npm run launch:firefox | launch:chrome | launch:helium
//
// Builds the production extension, then starts the browser with a brand-new temporary profile that contains only Box.
// The profile is deleted when the browser exits (or on Ctrl-C).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2];
const TARGET = { firefox: 'firefox', chrome: 'chrome-mv3', helium: 'chrome-mv2' }[which];
if (!TARGET) { console.error('usage: launch.mjs <firefox|chrome|helium>'); process.exit(2); }
const startUrl = process.argv[3] || 'about:blank';

const b = spawnSync('node', ['build/build.mjs', TARGET], { cwd: root, stdio: 'inherit' });
if (b.status !== 0) process.exit(b.status);
const extDir = path.join(root, 'dist', TARGET);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), `box-${which}-`));
const cleanup = () => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } };
console.log(`\n  Box (${TARGET}) — fresh profile: ${profile}\n  Close the browser window to end the session; the profile is then deleted.\n`);

if (which === 'firefox') {
  const { Builder } = await import('selenium-webdriver');
  const firefox = (await import('selenium-webdriver/firefox.js')).default;
  const o = new firefox.Options().setBinary(process.env.BOX_FIREFOX).setProfile(profile);
  for (const [k, v] of Object.entries({
    'privacy.userContext.enabled': true, 'browser.shell.checkDefaultBrowser': false, 'browser.startup.homepage': 'about:blank', 'startup.homepage_welcome_url': 'about:blank',
    'datareporting.policy.dataSubmissionEnabled': false, 'app.update.auto': false, 'browser.aboutwelcome.enabled': false, 'browser.newtabpage.enabled': false,
    'network.proxy.allow_hijacking_localhost': false, 'extensions.webextensions.uuids': JSON.stringify({ 'box@box.local': '7b6c3a3e-0d57-4b5b-9d61-6a1f2f7e1a01' }),
  })) o.setPreference(k, v);
  const d = await new Builder().forBrowser('firefox').setFirefoxOptions(o).setFirefoxService(new firefox.ServiceBuilder(process.env.BOX_GECKODRIVER)).build();
  await d.installAddon(extDir, true);
  if (startUrl !== 'about:blank') await d.get(startUrl);
  const wait = async () => { for (;;) { try { await d.getAllWindowHandles(); } catch { return; } await new Promise((r) => setTimeout(r, 1500)); } };
  process.on('SIGINT', async () => { try { await d.quit(); } catch { /* ignore */ } cleanup(); process.exit(0); });
  await wait();
  try { await d.quit(); } catch { /* ignore */ }
  cleanup();
} else {
  const puppeteer = (await import('puppeteer-core')).default;
  const common = ['--no-first-run', '--no-default-browser-check', '--password-store=basic', '--use-mock-keychain', '--disable-search-engine-choice-screen', '--disable-background-networking'];
  const browser = which === 'chrome'
    ? await puppeteer.launch({ executablePath: process.env.BOX_CHROME, headless: false, pipe: true, enableExtensions: true, userDataDir: profile, args: common, defaultViewport: null, ignoreDefaultArgs: ['--enable-automation'] })
    : await puppeteer.launch({ executablePath: process.env.BOX_HELIUM, headless: false, pipe: false, userDataDir: profile, defaultViewport: null,
      ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
      args: [...common, '--no-sandbox', '--disable-extensions-except=' + extDir, '--load-extension=' + extDir, '--disable-features=ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled'] });
  if (which === 'chrome') await browser.installExtension(extDir);
  const [page] = await browser.pages();
  if (page && startUrl !== 'about:blank') await page.goto(startUrl).catch(() => {});
  process.on('SIGINT', async () => { try { await browser.close(); } catch { /* ignore */ } cleanup(); process.exit(0); });
  await new Promise((r) => browser.on('disconnected', r));
  cleanup();
}
