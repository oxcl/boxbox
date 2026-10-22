import { waitFor } from '../lib/framework.mjs';
import { decodePng, hexToRgb, near } from '../lib/png.mjs';

export default function (R, h, drv) {
  const A = 'fx-alpha';

  R.test('page border: colored, labeled, non-blocking overlay on account pages only', async (ctx, a) => {
    const acc = await h.createAccount(A, 'Border Test', { color: '#ef4444' });
    const t = await h.openIn(acc.id, h.url('alpha.localhost', '/links'));
    const info = await waitFor(() => t.eval(() => { const e = document.getElementById('__box_border__'); return e && { color: e.dataset.color, name: e.dataset.account, label: e.shadowRoot.querySelector('.name').textContent, pe: getComputedStyle(e).pointerEvents, pos: getComputedStyle(e).position }; }), { message: 'border element' });
    a.eq(info.color, '#ef4444'); a.eq(info.name, 'Border Test'); a.eq(info.label, 'Border Test'); a.eq(info.pe, 'none'); a.eq(info.pos, 'fixed');
    // does not break layout or interaction: the page's own link still receives clicks
    a.eq(await t.eval(() => { const l = document.getElementById('to-alpha-mail'); const r = l.getBoundingClientRect(); return document.elementFromPoint(r.x + 3, r.y + 3) === l; }), true, 'overlay does not intercept pointer events');
    // pixels: left edge of the viewport is the account color
    await new Promise((r) => setTimeout(r, 700));
    const png = decodePng(await t.screenshot());
    const px = png.px(1, Math.floor(png.h / 2));
    a.ok(near(px, hexToRgb('#ef4444'), 60), 'left border pixel ' + JSON.stringify(px));
    const def = await h.openIn(null, h.url('alpha.localhost', '/links'));
    await new Promise((r) => setTimeout(r, 500));
    a.eq(await def.eval(() => !!document.getElementById('__box_border__')), false, 'no border in the default session');
    await h.box({ type: 'setSettings', patch: { border: false } });
    await waitFor(async () => !(await t.eval(() => !!document.getElementById('__box_border__'))), { message: 'border removed when disabled' });
  });

  R.test('favicon badge: the site icon gets a dot in the account color', async (ctx, a) => {
    const acc = await h.createAccount(A, 'Badge', { color: '#22c55e' });
    const t = await h.openIn(acc.id, h.url('alpha.localhost', '/blank'));
    const href = await waitFor(() => t.eval(() => document.querySelector('link[data-box-icon]')?.href), { message: 'badged icon link' });
    a.ok(href.startsWith('data:image/'), 'data URL icon');
    const svg = Buffer.from(href.split(',')[1], 'base64').toString('utf8');
    a.includes(svg, '#22c55e', 'dot color in the icon');
    a.includes(svg, '<image', 'original icon is kept under the dot');
    const def = await h.openIn(null, h.url('alpha.localhost', '/blank'));
    await new Promise((r) => setTimeout(r, 500));
    a.eq(await def.eval(() => !!document.querySelector('link[data-box-icon]')), false);
    await h.box({ type: 'setSettings', patch: { badge: false } });
    await waitFor(async () => !(await t.eval(() => !!document.querySelector('link[data-box-icon]'))), { message: 'badge removed when disabled' });
  });

  R.test('tab color: account tabs are marked with the account color (container / tab group)', async (ctx, a) => {
    const acc = await h.createAccount(A, 'Colored', { color: '#ef4444' });
    const t = await h.openIn(acc.id, h.url('alpha.localhost', '/blank'));
    if (ctx.name === 'firefox') {
      const cs = (await h.state()).accounts[acc.id].cookieStoreId;
      const containers = await h.box({ type: 'test:platform', call: 'containers' });
      const c = containers.find((x) => x.cookieStoreId === cs);
      a.eq(c.color, 'red', 'container color = nearest Firefox color');
      a.includes(c.name, 'Colored');
    }
    const tabs = await h.box({ type: 'test:tabs' });
    const mine = tabs.find((x) => x.state && x.state.accountId === acc.id);
    a.ok(mine, 'tab known');
    const groups = await h.box({ type: 'test:platform', call: 'groups' });
    if (ctx.name === 'helium') {
      // documented limitation: chrome.tabGroups is Manifest-V3-only, so Helium (MV2) cannot title/colour tab groups
      a.eq(groups, null, 'chrome.tabGroups is unavailable to Manifest V2 extensions');
    } else if (ctx.name === 'chrome') {
      a.ok(groups.some((g) => g.title === 'Colored' && g.color === 'red'), 'tab group titled with the account name, coloured red: ' + JSON.stringify(groups));
      a.eq(mine.groupId >= 0, true, 'the tab is inside that group');
    } else if (groups) {
      a.ok(mine.groupId >= 0 ? groups.some((g) => g.title === 'Colored') : true, 'Firefox tab group (if the build supports them): ' + JSON.stringify(groups));
    }
  });
}
