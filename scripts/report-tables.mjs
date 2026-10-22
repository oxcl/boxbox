// Prints markdown tables from test-results/latest.json (+ smoke.json) for REPORT.md:  node scripts/report-tables.mjs
import fs from 'node:fs';
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const res = read('test-results/latest.json') || {};
const smoke = read('test-results/smoke.json');
const cols = ['firefox', 'chrome', 'helium'];
const names = [];
for (const c of cols) for (const r of res[c] || []) if (!names.includes(r.name)) names.push(r.name);
const mark = (c, n) => { const r = (res[c] || []).find((x) => x.name === n); return !r ? '·' : r.status === 'pass' ? '✅' : r.status === 'skip' ? '➖' : '❌'; };
let out = '| Test | Firefox | Chrome MV3 | Helium MV2 |\n|---|:-:|:-:|:-:|\n';
for (const n of names) out += `| ${n.replace(/\|/g, '\\|')} | ${cols.map((c) => mark(c, n)).join(' | ')} |\n`;
const tot = (c) => { const l = res[c] || []; return `${l.filter((x) => x.status === 'pass').length} passed, ${l.filter((x) => x.status === 'fail').length} failed, ${l.filter((x) => x.status === 'skip').length} skipped`; };
out += `\n**Totals** — Firefox: ${tot('firefox')} · Chrome MV3: ${tot('chrome')} · Helium MV2: ${tot('helium')}\n`;
if (smoke) {
  out += '\n| Real-site smoke | Firefox | Chrome MV3 | Helium MV2 |\n|---|:-:|:-:|:-:|\n';
  const sites = new Set(); for (const c of cols) Object.keys(smoke[c] || {}).forEach((s) => sites.add(s));
  for (const s of sites) out += `| ${s} | ${cols.map((c) => { const r = smoke[c]?.[s]; return !r ? '·' : r.status === 'pass' ? '✅' : '❌'; }).join(' | ')} |\n`;
}
process.stdout.write(out);
