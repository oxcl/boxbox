// Prototype performance benchmark (CDP): per page, scripted pointer interaction, reports frame pacing, CPU time per phase, DOM/layer counts, JS heap.
//   direnv exec . node tests/perf/proto-bench.mjs [--headless] [--pages popup,picker,...] [--theme dark] [--out results.json]
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const headless = args.includes('--headless') || !(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const pages = opt('pages', 'onboarding,popup,picker,services,browser').split(',');
const theme = opt('theme', 'light');

const SCENARIOS = {
  onboarding: async (p, hover) => { await new Promise((r) => setTimeout(r, 2600)); await hover('#hero', 14); await p.click('#next1'); await new Promise((r) => setTimeout(r, 1800)); await p.click('#next2'); await new Promise((r) => setTimeout(r, 1800)); },
  popup: async (p, hover) => { await new Promise((r) => setTimeout(r, 1200)); await hover('.grid', 40); await p.evaluate(() => document.querySelector('.cell:nth-child(3)').click()); await new Promise((r) => setTimeout(r, 1800)); await p.evaluate(() => document.querySelector('.cell:nth-child(2)').click()); await new Promise((r) => setTimeout(r, 1800)); await p.evaluate(() => document.querySelector('.newcell').click()); await new Promise((r) => setTimeout(r, 900)); for (const n of [2, 4, 5]) { await p.evaluate((n) => document.querySelector(`#sw button:nth-child(${n})`).click(), n); await new Promise((r) => setTimeout(r, 900)); } },
  picker: async (p, hover) => { await new Promise((r) => setTimeout(r, 1500)); await hover('#shelf', 40); await p.evaluate(() => document.querySelectorAll('.opt')[2].click()); await new Promise((r) => setTimeout(r, 400)); await p.evaluate(() => document.querySelectorAll('.opt')[2].click()); await new Promise((r) => setTimeout(r, 3200)); },
  services: async (p, hover) => { await new Promise((r) => setTimeout(r, 2000)); await hover('.cards', 40); await p.evaluate(() => document.querySelectorAll('.svc-h')[1].click()); await new Promise((r) => setTimeout(r, 1800)); await p.evaluate(() => document.querySelectorAll('.svc-h')[2].click()); await new Promise((r) => setTimeout(r, 1800)); await hover('.cards', 40); },
  browser: async (p, hover) => { await new Promise((r) => setTimeout(r, 1200)); for (let i = 0; i < 3; i++) { await p.evaluate(() => document.getElementById('pill').click()); await new Promise((r) => setTimeout(r, 1500)); } },
};

const b = await puppeteer.launch({ executablePath: process.env.BOX_CHROME, headless, args: ['--no-sandbox', '--allow-file-access-from-files', '--window-size=1400,900', '--enable-gpu-rasterization', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling'], defaultViewport: { width: 1400, height: 900 } });
const out = { headless, theme, results: {} };
for (const name of pages) {
  const p = await b.newPage(); await p.bringToFront(); const cdp = await p.createCDPSession();
  await cdp.send('Performance.enable'); await cdp.send('LayerTree.enable'); let layers = 0; cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = Math.max(layers, e.layers.length); });
  await p.evaluateOnNewDocument((t) => { try { localStorage.setItem('bb-theme', t); } catch {} window.__frames = []; let last = 0; const loop = (ts) => { if (last) window.__frames.push(ts - last); last = ts; requestAnimationFrame(loop); }; requestAnimationFrame(loop); }, theme);
  await p.goto('file://' + path.join(root, 'prototype', name + '.html')); await new Promise((r) => setTimeout(r, 600));
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await new Promise((r) => setTimeout(r, 2500));                      // let entrance animations finish, then measure a quiet idle window
  const i0 = await metric(); await p.evaluate(() => { window.__frames.length = 0; }); await new Promise((r) => setTimeout(r, 3000)); const i1 = await metric(); const idleFrames = await p.evaluate(() => window.__frames.length);
  const idle = { task: +(((i1.TaskDuration - i0.TaskDuration) * 1000) / 3).toFixed(0), style: +(((i1.RecalcStyleDuration - i0.RecalcStyleDuration) * 1000) / 3).toFixed(0), layout: +(((i1.LayoutDuration - i0.LayoutDuration) * 1000) / 3).toFixed(0), stylePerSec: +((i1.RecalcStyleCount - i0.RecalcStyleCount) / 3).toFixed(1), fps: +(idleFrames / 3).toFixed(0) };
  const m0 = await metric(); await p.evaluate(() => { window.__frames.length = 0; });
  const hover = async (sel, steps) => { const r = await p.evaluate((s) => { const e = document.querySelector(s).getBoundingClientRect(); return [e.left, e.top, e.width, e.height]; }, sel); for (let i = 0; i <= steps; i++) { await p.mouse.move(r[0] + (r[2] * i) / steps, r[1] + r[3] / 2 + Math.sin(i / 3) * r[3] / 5); await new Promise((r2) => setTimeout(r2, 16)); } };
  const t0 = Date.now(); await SCENARIOS[name](p, hover); const wall = (Date.now() - t0) / 1000;
  const m1 = await metric(); const frames = await p.evaluate(() => window.__frames.slice());
  const sorted = [...frames].sort((a, c) => a - c), pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0;
  const dom = await cdp.send('Memory.getDOMCounters');
  const d = (k) => ((m1[k] - m0[k]) * 1000) / wall;                // ms of CPU per second of wall time
  out.results[name] = { idle, seconds: +wall.toFixed(1), frames: frames.length, avgFrameMs: +(frames.reduce((a, c) => a + c, 0) / (frames.length || 1)).toFixed(1), p95FrameMs: +pct(.95).toFixed(1), p99FrameMs: +pct(.99).toFixed(1), over25ms: frames.filter((f) => f > 25).length, over50ms: frames.filter((f) => f > 50).length,
    cpuMsPerSec: { task: +d('TaskDuration').toFixed(0), script: +d('ScriptDuration').toFixed(0), layout: +d('LayoutDuration').toFixed(0), style: +d('RecalcStyleDuration').toFixed(0) }, layoutPerSec: +(((m1.LayoutCount - m0.LayoutCount) / wall).toFixed(1)), stylePerSec: +(((m1.RecalcStyleCount - m0.RecalcStyleCount) / wall).toFixed(1)),
    domNodes: dom.nodes, layers, jsHeapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1) };
  await p.close();
}
await b.close();
const file = opt('out'); if (file) fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
