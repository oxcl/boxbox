// Minimal sequential test framework with per-test timeouts and JSON results.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 8000, interval = 100, message = 'condition' } = {}) {
  const t0 = Date.now();
  let last, err;
  while (Date.now() - t0 < timeout) {
    try { last = await fn(); if (last) return last; } catch (e) { err = e; }
    await sleep(interval);
  }
  throw new Error(`timeout waiting for ${message}` + (err ? ` (last error: ${err.message})` : '') + (last !== undefined ? ` (last: ${JSON.stringify(last)})` : ''));
}

export class Assert {
  eq(a, b, msg = '') { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${msg} expected ${y} but got ${x}`); }
  ok(v, msg = 'expected truthy') { if (!v) throw new Error(msg); }
  not(a, b, msg = '') { if (JSON.stringify(a) === JSON.stringify(b)) throw new Error(`${msg} expected value different from ${JSON.stringify(b)}`); }
  includes(hay, needle, msg = '') { if (!String(hay).includes(needle)) throw new Error(`${msg} expected ${JSON.stringify(hay)} to include ${JSON.stringify(needle)}`); }
}

export class Runner {
  constructor(name) { this.name = name; this.tests = []; this.results = []; this.hooks = {}; }
  test(name, fn, opts = {}) { this.tests.push({ name, fn, ...opts }); }
  skipIf(cond, reason) { return cond ? reason : null; }

  async run(ctx, { filter } = {}) {
    for (const t of this.tests) {
      if (filter && !new RegExp(filter, 'i').test(t.name)) continue;
      const t0 = Date.now();
      let status = 'pass', error = null;
      const skip = t.skip && t.skip(ctx);
      if (skip) { status = 'skip'; error = skip; }
      else {
        try {
          await ctx.beforeEach?.();
          await Promise.race([
            t.fn(ctx, new Assert()),
            sleep(t.timeout || 60000).then(() => { throw new Error('test timeout'); }),
          ]);
        } catch (e) { status = 'fail'; error = e.stack || String(e); }
        try { await ctx.afterEach?.(status); } catch (e) { console.error('afterEach failed:', e.message); }
      }
      const r = { name: t.name, status, ms: Date.now() - t0, error };
      this.results.push(r);
      const icon = status === 'pass' ? '\x1b[32m✓\x1b[0m' : status === 'skip' ? '\x1b[33m-\x1b[0m' : '\x1b[31m✗\x1b[0m';
      console.log(`  ${icon} ${t.name} \x1b[2m(${r.ms}ms)\x1b[0m${error ? '\n      ' + String(error).split('\n').slice(0, status === 'skip' ? 1 : 6).join('\n      ') : ''}`);
    }
    return this.results;
  }
}
