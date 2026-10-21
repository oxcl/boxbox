// E2E runner:  node tests/run.mjs [--browser firefox,chrome,helium] [--filter regex] [--suite isolation,...]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixture } from '../fixture/server.mjs';
import { Runner } from './lib/framework.mjs';
import { BoxHelper } from './lib/box.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const browsers = opt('browser', 'firefox,chrome,helium').split(',');
const filter = opt('filter');
const suiteNames = opt('suite', 'isolation,navigation,modes,services,identity,deletion,proxy').split(',');
const keepOpen = args.includes('--keep');

const build = spawnSync('node', ['build/build.mjs'], { cwd: root, env: { ...process.env, BOX_TEST: '1' }, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status);

const targetOf = { firefox: 'firefox', chrome: 'chrome-mv3', helium: 'chrome-mv2' };
const summary = {};
let failed = 0;

for (const b of browsers) {
  const extDir = path.join(root, 'dist-test', targetOf[b]);
  if (!fs.existsSync(path.join(extDir, 'manifest.json'))) { console.log(`\n== ${b}: build missing, skipped`); continue; }
  console.log(`\n== ${b} (${targetOf[b]})`);
  const fixture = await startFixture({ port: 0 });
  let drv;
  try {
    if (b === 'firefox') drv = await (await import('./lib/firefox.mjs')).FirefoxDriver.launch({ extDir, fixture });
    else drv = await (await import('./lib/chrome.mjs')).ChromeDriver.launch({ extDir, fixture, which: b });
  } catch (e) { console.error(`launch failed for ${b}:`, e); failed++; summary[b] = { launchError: String(e) }; await fixture.close(); continue; }
  const h = new BoxHelper(drv, fixture);
  const R = new Runner(b);
  for (const s of suiteNames) {
    const f = path.join(root, 'tests/suites', `${s}.mjs`);
    if (fs.existsSync(f)) (await import(f)).default(R, h, drv);
  }
  const ctx = {
    name: b, drv, fixture, h,
    beforeEach: async () => { await h.fxLogReset(); },
    afterEach: async () => { await drv.closeAllTabs(); await h.reset(); },
  };
  const results = await R.run(ctx, { filter });
  summary[b] = results;
  failed += results.filter((r) => r.status === 'fail').length;
  if (!keepOpen) await drv.quit();
  await fixture.close();
}

fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'latest.json'), JSON.stringify(summary, null, 2));
const tot = Object.entries(summary).map(([b, r]) => Array.isArray(r) ? `${b}: ${r.filter((x) => x.status === 'pass').length} pass, ${r.filter((x) => x.status === 'fail').length} fail, ${r.filter((x) => x.status === 'skip').length} skip` : `${b}: ${r.launchError}`);
console.log('\n' + tot.join('\n'));
process.exit(failed ? 1 : 0);
