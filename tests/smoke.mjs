// Real-site smoke tests (sanity, NOT the gate):  node tests/smoke.mjs [--browser firefox,chrome,helium] [--strict]
// Parallel logins with different accounts on saucedemo.com, the-internet.herokuapp.com and automationexercise.com.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixture } from '../fixture/server.mjs';
import { waitFor, sleep } from './lib/framework.mjs';
import { BoxHelper } from './lib/box.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const browsers = opt('browser', 'firefox,chrome,helium').split(',');
const strict = args.includes('--strict');
const only = opt('only');

const b = spawnSync('node', ['build/build.mjs'], { cwd: root, env: { ...process.env, BOX_TEST: '1' }, stdio: 'inherit' });
if (b.status !== 0) process.exit(b.status);
const targetOf = { firefox: 'firefox', chrome: 'chrome-mv3', helium: 'chrome-mv2' };

// resolve through the extension itself (the-internet.herokuapp.com is part of the built-in catalog's Salesforce/Heroku service)
let H;
const SVC = async (url) => (await H.service(url)).id;
const fillAndClick = (tab, fields, clickSel) => tab.eval((f, c) => {
  for (const [sel, val] of Object.entries(f)) {
    const e = document.querySelector(sel); if (!e) throw new Error('missing ' + sel);
    e.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), 'value')?.set;   // React-controlled inputs need the native setter
    if (setter) setter.call(e, val); else e.value = val;
    e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const btn = document.querySelector(c); if (!btn) throw new Error('missing ' + c); btn.click();
}, fields, clickSel);
const text = (tab) => tab.eval(() => document.body.innerText);
const settle = async (tab, pred, msg, timeout = 20000) => waitFor(async () => { try { return await pred(); } catch { return false; } }, { message: msg, timeout, interval: 400 });

const sites = {
  async saucedemo(h, drv, a) {
    const home = 'https://www.saucedemo.com/';
    const [A, B] = [(await h.createAccount(await SVC('https://www.saucedemo.com/'), 'Standard')).id, (await h.createAccount(await SVC('https://www.saucedemo.com/'), 'Problem')).id];
    const ta = await h.openIn(A, home), tb = await h.openIn(B, home), td = await h.openIn(null, home);
    await settle(ta, async () => ta.eval(() => !!document.querySelector('#user-name')), 'login form A');
    await fillAndClick(ta, { '#user-name': 'standard_user', '#password': 'secret_sauce' }, '#login-button');
    await settle(tb, async () => tb.eval(() => !!document.querySelector('#user-name')), 'login form B');
    await fillAndClick(tb, { '#user-name': 'problem_user', '#password': 'secret_sauce' }, '#login-button');
    await settle(ta, async () => (await ta.url()).includes('/inventory'), 'A inventory');
    await settle(tb, async () => (await tb.url()).includes('/inventory'), 'B inventory');
    const cookie = (t) => t.eval(() => (document.cookie.match(/session-username=([^;]+)/) || [])[1] || null);
    a(await cookie(ta) === 'standard_user', 'tab A holds the standard_user session: ' + await cookie(ta));
    a(await cookie(tb) === 'problem_user', 'tab B holds the problem_user session: ' + await cookie(tb));
    await ta.goto(home + 'inventory.html'); await tb.goto(home + 'inventory.html');
    await settle(ta, async () => (await ta.url()).includes('/inventory') && (await cookie(ta)) === 'standard_user', 'A still logged in after reload');
    await settle(tb, async () => (await tb.url()).includes('/inventory') && (await cookie(tb)) === 'problem_user', 'B still logged in after reload');
    await td.goto(home + 'inventory.html');
    await settle(td, async () => (await text(td)).includes('You can only access'), 'default session is not logged in');
    a(true, 'default session was bounced back to the login page');
  },

  async theInternet(h, drv, a) {
    const base = 'https://the-internet.herokuapp.com';
    const [A, B] = [(await h.createAccount(await SVC('https://the-internet.herokuapp.com/'), 'Tom A')).id, (await h.createAccount(await SVC('https://the-internet.herokuapp.com/'), 'Tom B')).id];
    const ta = await h.openIn(A, base + '/login'), tb = await h.openIn(B, base + '/login'), td = await h.openIn(null, base + '/secure');
    await fillAndClick(ta, { '#username': 'tomsmith', '#password': 'SuperSecretPassword!' }, 'button[type=submit]');
    await settle(ta, async () => (await text(ta)).includes('You logged into a secure area'), 'A logged in');
    await tb.goto(base + '/secure');
    await settle(tb, async () => (await text(tb)).includes('You must login'), 'B (other account) is NOT logged in');
    await settle(td, async () => (await text(td)).includes('You must login'), 'default is NOT logged in');
    await fillAndClick(tb, { '#username': 'tomsmith', '#password': 'SuperSecretPassword!' }, 'button[type=submit]');
    await settle(tb, async () => (await text(tb)).includes('You logged into a secure area'), 'B logged in');
    await ta.eval(() => document.querySelector('a.button.secondary').click());         // log A out
    await settle(ta, async () => (await text(ta)).includes('You logged out'), 'A logged out');
    await tb.goto(base + '/secure');
    await settle(tb, async () => (await text(tb)).includes('Welcome to the Secure Area'), 'B still logged in after A logged out (independent sessions)');
    a(true, 'sessions are independent');
  },

  async automationExercise(h, drv, a) {
    const base = 'https://automationexercise.com';
    const [A, B] = [(await h.createAccount(await SVC('https://automationexercise.com/'), 'Alpha acct')).id, (await h.createAccount(await SVC('https://automationexercise.com/'), 'Beta acct')).id];
    const stamp = Date.now().toString(36);
    const users = [{ name: 'Box Alpha ' + stamp, email: `box.alpha.${stamp}@example.com` }, { name: 'Box Beta ' + stamp, email: `box.beta.${stamp}@example.com` }];
    const dismiss = (t) => t.eval(() => { const b = document.querySelector('.fc-cta-consent, button.fc-button.fc-cta-consent'); if (b) b.click(); document.querySelectorAll('iframe[id^=aswift], ins.adsbygoogle, #ad_position_box').forEach((e) => e.remove()); }).catch(() => {});
    const signup = async (tab, u) => {
      await tab.goto(base + '/login'); await dismiss(tab);
      await settle(tab, async () => tab.eval(() => !!document.querySelector('[data-qa=signup-name]')), 'signup form');
      await fillAndClick(tab, { '[data-qa=signup-name]': u.name, '[data-qa=signup-email]': u.email }, '[data-qa=signup-button]');
      await settle(tab, async () => tab.eval(() => !!document.querySelector('[data-qa=password]')), 'account form');
      await dismiss(tab);
      await tab.eval((u) => {
        const set = (s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
        document.querySelector('#id_gender1').click();
        set('[data-qa=password]', 'Passw0rd!' + u.email.length); set('[data-qa=days]', '7'); set('[data-qa=months]', '5'); set('[data-qa=years]', '1990');
        set('[data-qa=first_name]', 'Box'); set('[data-qa=last_name]', 'Tester'); set('[data-qa=address]', '1 Test Street'); set('[data-qa=country]', 'Canada');
        set('[data-qa=state]', 'ON'); set('[data-qa=city]', 'Toronto'); set('[data-qa=zipcode]', 'M5V2T6'); set('[data-qa=mobile_number]', '4165550100');
        document.querySelector('[data-qa=create-account]').click();
      }, u);
      await settle(tab, async () => (await text(tab)).includes('ACCOUNT CREATED'), 'account created');
      await dismiss(tab);
      await tab.eval(() => document.querySelector('[data-qa=continue-button]').click());
    };
    const ta = await h.openIn(A, base + '/'), tb = await h.openIn(B, base + '/'), td = await h.openIn(null, base + '/');
    await signup(ta, users[0]);
    await signup(tb, users[1]);
    const who = (t) => t.eval(() => (document.body.innerText.match(/Logged in as\s+(.+)/) || [])[1]?.trim() || null);
    await ta.goto(base + '/'); await tb.goto(base + '/'); await td.goto(base + '/');
    await settle(ta, async () => (await who(ta)) === users[0].name, `A shows "Logged in as ${users[0].name}"`);
    await settle(tb, async () => (await who(tb)) === users[1].name, `B shows "Logged in as ${users[1].name}"`);
    a((await who(td)) === null, 'default session is not logged in');
    for (const t of [ta, tb]) { await t.goto(base + '/delete_account'); await settle(t, async () => (await text(t)).includes('ACCOUNT DELETED'), 'cleanup: account deleted').catch(() => {}); }
  },
};

const out = {};
let hardFail = 0;
for (const name of browsers) {
  const extDir = path.join(root, 'dist-test', targetOf[name]);
  console.log(`\n== smoke: ${name}`);
  const fixture = await startFixture({ port: 0 });
  let drv;
  try {
    drv = name === 'firefox' ? await (await import('./lib/firefox.mjs')).FirefoxDriver.launch({ extDir, fixture }) : await (await import('./lib/chrome.mjs')).ChromeDriver.launch({ extDir, fixture, which: name });
  } catch (e) { console.log('  launch failed:', e.message); out[name] = { launchError: String(e) }; hardFail++; await fixture.close(); continue; }
  const h = new BoxHelper(drv, fixture); H = h;
  out[name] = {};
  for (const [site, fn] of Object.entries(sites)) {
    if (only && site !== only) continue;
    const checks = [];
    const t0 = Date.now();
    let status = 'pass', error = null;
    try {
      await Promise.race([fn(h, drv, (ok, msg) => { checks.push({ ok: !!ok, msg }); if (!ok) throw new Error('check failed: ' + msg); }), sleep(150000).then(() => { throw new Error('timeout'); })]);
    } catch (e) { status = 'fail'; error = e.message; }
    try { await drv.closeAllTabs(); await h.reset(); } catch { /* ignore */ }
    out[name][site] = { status, ms: Date.now() - t0, error, checks };
    console.log(`  ${status === 'pass' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${site} (${Date.now() - t0}ms)${error ? '\n      ' + error : ''}`);
    if (status === 'fail') hardFail++;
  }
  await drv.quit(); await fixture.close();
}
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'smoke.json'), JSON.stringify(out, null, 2));
process.exit(strict && hardFail ? 1 : 0);
