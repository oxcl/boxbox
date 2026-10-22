// Isometric open-box illustration (pure SVG, geometry computed from flap angles so the lid can animate on springs).
const HERO = (() => {
  const NS = 'http://www.w3.org/2000/svg', u = 66, C = .866, S = .5, W = 3.3, D = 2.6, H = 1.7, OX = 340, OY = 236, L = 1.3, INS = .1;
  const P = (x, y, z) => [OX + (x - y) * C * u, OY + (x + y) * S * u - z * u];
  const pts = (a) => a.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.append(e); return e; };
  // face-plane matrices (1 unit = 1 world unit): left face is the y=D wall, right face is the x=W wall
  const leftM = () => { const [e, f] = P(0, D, H); return `matrix(${C * u} ${S * u} 0 ${u} ${e} ${f})`; };
  const rightM = () => { const [e, f] = P(W, D, H); return `matrix(${C * u} ${-S * u} 0 ${u} ${e} ${f})`; };
  const flapPts = { x0: (a) => [P(0, 0, H), P(0, D, H), P(L * Math.cos(a), D - INS, H + L * Math.sin(a)), P(L * Math.cos(a), INS, H + L * Math.sin(a))],
    y0: (a) => [P(0, 0, H), P(W, 0, H), P(W - INS, L * Math.cos(a), H + L * Math.sin(a)), P(INS, L * Math.cos(a), H + L * Math.sin(a))],
    xW: (a) => [P(W, 0, H), P(W, D, H), P(W - L * Math.cos(a), D - INS, H + L * Math.sin(a)), P(W - L * Math.cos(a), INS, H + L * Math.sin(a))],
    yD: (a) => [P(0, D, H), P(W, D, H), P(W - INS, D - L * Math.cos(a), H + L * Math.sin(a)), P(INS, D - L * Math.cos(a), H + L * Math.sin(a))] };

  function cube(k, color, iconName, label, icons) {
    const g = el('g', { class: 'item' }), q = (x, y, z) => P(x, y, z);
    const top = [q(0, 0, k), q(k, 0, k), q(k, k, k), q(0, k, k)], right = [q(k, 0, 0), q(k, k, 0), q(k, k, k), q(k, 0, k)], left = [q(0, k, 0), q(k, k, 0), q(k, k, k), q(0, k, k)];
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    const defs = el('defs', {}, g);
    const mk = (n, a, b) => { const lg = el('linearGradient', { id: id + n, x1: 0, y1: 0, x2: 1, y2: 1 }, defs); el('stop', { offset: 0, 'stop-color': a }, lg); el('stop', { offset: 1, 'stop-color': b }, lg); };
    mk('t', `color-mix(in srgb, ${color} 60%, white)`, `color-mix(in srgb, ${color} 82%, white)`); mk('l', `color-mix(in srgb, ${color} 86%, white)`, `color-mix(in srgb, ${color} 90%, black)`); mk('r', `color-mix(in srgb, ${color} 74%, black)`, `color-mix(in srgb, ${color} 52%, black)`);
    el('polygon', { points: pts(left), fill: `url(#${id}l)` }, g); el('polygon', { points: pts(right), fill: `url(#${id}r)` }, g); el('polygon', { points: pts(top), fill: `url(#${id}t)` }, g);
    [left, right, top].forEach((f) => el('polygon', { points: pts(f), fill: 'none', stroke: 'rgba(255,255,255,.28)', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, g));
    // tape over the top and down the left face (torn end)
    const t0 = .38 * k, t1 = .62 * k;
    el('polygon', { points: pts([q(t0, 0, k), q(t1, 0, k), q(t1, k, k), q(t0, k, k)]), fill: 'rgba(255,255,255,.4)' }, g);
    el('polygon', { points: pts([q(t0, k, k), q(t1, k, k), q(t1, k, .72 * k), q((t0 + t1) / 2 + .02, k, .76 * k), q(t0, k, .72 * k)]), fill: 'rgba(255,255,255,.34)' }, g);
    // icon on the left face
    const [e, f] = q(0, k, k), m = `matrix(${C * u * k / 24} ${S * u * k / 24} 0 ${u * k / 24} ${e} ${f})`;
    const ic = el('g', { transform: m, style: 'color:#fff' }, g); ic.innerHTML = `<g transform="translate(4.6 4.8) scale(.62)" style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))">${icons[iconName].replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`; ic.firstChild.setAttribute('fill', 'none');
    // label on the right face
    const [re, rf] = q(k, k, k); const rl = el('g', { transform: `matrix(${C * u} ${-S * u} 0 ${u} ${re} ${rf})` }, g);
    el('rect', { x: .14 * k, y: .2 * k, width: .72 * k, height: .44 * k, rx: .03, fill: '#fffdf8' }, rl);
    const tx = el('text', { x: .2 * k, y: .39 * k, 'font-size': .13 * k, 'font-weight': 800, fill: '#2b2b33', 'font-family': 'Jakarta, system-ui', 'letter-spacing': .01 }, rl); tx.textContent = label.toUpperCase().slice(0, 8);
    for (let i = 0; i < 10; i++) el('rect', { x: (.2 + i * .055) * k, y: .46 * k, width: (i % 3 ? .02 : .035) * k, height: .13 * k, fill: '#222' }, rl);
    return g;
  }

  function build(icons, colors) {
    const svg = el('svg', { viewBox: '0 0 680 470', class: 'hero-svg' });
    const defs = el('defs', {}, svg);
    const lin = (id, stops, x2 = 1, y2 = 1) => { const g = el('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, defs); stops.forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, g)); };
    lin('kl', [[0, '#e2bd8a'], [1, '#c79d68']]); lin('kr', [[0, '#c39a63'], [1, '#a37845']]); lin('ki', [[0, '#8b6438'], [1, '#6f4e2a']]); lin('kf', [[0, '#e8cca0'], [1, '#d6b17f']]); lin('kfi', [[0, '#a07243'], [1, '#86602f']]); lin('floor', [[0, '#5e4326'], [1, '#7a5731']]);
    const pat = el('pattern', { id: 'bar', width: .075, height: 1, patternUnits: 'userSpaceOnUse' }, defs); el('rect', { width: .025, height: 1, fill: '#222' }, pat);
    const rg = el('radialGradient', { id: 'sh' }, defs); el('stop', { offset: 0, 'stop-color': 'rgba(70,40,10,.38)' }, rg); el('stop', { offset: 1, 'stop-color': 'rgba(70,40,10,0)' }, rg);
    const root = el('g', { class: 'root' }, svg);
    const shadow = el('ellipse', { cx: 346, cy: 400, rx: 230, ry: 46, fill: 'url(#sh)' }, root);
    const body = el('g', { class: 'body' }, root);
    // far flaps + inner walls + floor
    const poly = (cls, fill, g = body) => el('polygon', { class: cls, fill, stroke: 'rgba(110,70,25,.35)', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, g);
    const flaps = { x0: poly('f', 'url(#kfi)'), y0: poly('f', 'url(#kfi)') };
    poly('', 'url(#floor)').setAttribute('points', pts([P(0, 0, 0), P(W, 0, 0), P(W, D, 0), P(0, D, 0)]));
    poly('', 'url(#ki)').setAttribute('points', pts([P(0, 0, 0), P(0, D, 0), P(0, D, H), P(0, 0, H)]));
    poly('', 'url(#ki)').setAttribute('points', pts([P(0, 0, 0), P(W, 0, 0), P(W, 0, H), P(0, 0, H)]));
    el('polygon', { points: pts([P(0, 0, 0), P(0, D, 0), P(0, D, H), P(0, 0, H)]), fill: 'rgba(0,0,0,.18)' }, body);
    // items
    const itemsG = el('g', { class: 'items' }, root), items = [];
    [[colors.blue, 'user', 'Personal', .3, .1, 1.55], [colors.orange, 'briefcase', 'Work', 1.25, .05, 1.8], [colors.green, 'school', 'School', 2.15, .2, 1.5], [colors.purple, 'game', 'Games', .65, 1.15, 1.35], [colors.pink, 'heart', 'Family', 1.8, 1.25, 1.2]]
      .sort((a, b) => a[3] + a[4] - (b[3] + b[4])).forEach(([c, ic, lb, x, y, z]) => { const wrap = el('g', { class: 'item2' }, itemsG); const g = cube(1.1, c, ic, lb, icons); const [px, py] = P(x, y, z); g.setAttribute('transform', `translate(${(px - OX).toFixed(1)} ${(py - OY).toFixed(1)})`); wrap.append(g); items.push(wrap); });
    // near walls with the details
    const near = el('g', { class: 'near' }, root);
    poly('', 'url(#kl)', near).setAttribute('points', pts([P(0, D, 0), P(W, D, 0), P(W, D, H), P(0, D, H)]));
    poly('', 'url(#kr)', near).setAttribute('points', pts([P(W, 0, 0), P(W, D, 0), P(W, D, H), P(W, 0, H)]));
    el('polygon', { points: pts([P(0, D, H), P(W, D, H), P(W, D, H - .05), P(0, D, H - .05)]), fill: 'rgba(255,255,255,.25)' }, near);
    const lf = el('g', { transform: leftM() }, near), rt = el('g', { transform: rightM() }, near);
    // hanging "BoxBox" tape strip on the left face
    el('path', { d: 'M1.05 0 L1.78 0 L1.92 1.28 Q1.76 1.5 1.52 1.38 L1.34 1.62 L1.14 1.3 Z', fill: '#f3e2bd', stroke: 'rgba(120,80,30,.25)', 'stroke-width': .02 }, lf);
    el('path', { d: 'M1.05 0 L1.78 0 L1.8 .12 L1.07 .1 Z', fill: 'rgba(255,255,255,.4)' }, lf);
    const tt = el('text', { transform: 'translate(1.62 1.22) rotate(-84)', 'font-size': .22, 'font-weight': 800, fill: '#6b4a24', 'font-family': 'Jakarta, system-ui', 'letter-spacing': .02 }, lf); tt.textContent = 'BoxBox';
    el('rect', { x: 2.3, y: 1.05, width: .85, height: .42, rx: .03, fill: '#fffdf8' }, lf); el('rect', { x: 2.38, y: 1.15, width: .69, height: .22, fill: 'url(#bar)' }, lf);
    [0, 1].forEach((i) => { el('rect', { x: 2.35 + i * .22, y: .35, width: .16, height: .16, rx: .02, fill: 'none', stroke: 'rgba(90,60,25,.55)', 'stroke-width': .025 }, lf); });
    el('path', { d: 'M2.46 .46 v-.1 m-.04 .04 l.04 -.04 l.04 .04', stroke: 'rgba(90,60,25,.7)', 'stroke-width': .025, fill: 'none', 'stroke-linecap': 'round' }, lf);
    // smile + marks on the right face
    el('path', { d: 'M1.4 .75 q.15 .22 .3 0 M1.38 .62 v.09 M1.72 .62 v.09', stroke: '#5a3c1c', 'stroke-width': .045, fill: 'none', 'stroke-linecap': 'round' }, rt);
    el('rect', { x: .35, y: 1.1, width: .8, height: .38, rx: .03, fill: '#fffdf8' }, rt); el('rect', { x: .42, y: 1.19, width: .66, height: .2, fill: 'url(#bar)' }, rt);
    // near flaps
    const nf = el('g', { class: 'nflaps' }, root);
    flaps.xW = poly('f', 'url(#kl)', nf); flaps.yD = poly('f', 'url(#kf)', nf);
    // far flaps must sit under the walls: move them to the start of body
    body.prepend(flaps.y0); body.prepend(flaps.x0);
    return { svg, flaps, items, shadow, root, body, itemsG, near, nf };
  }
  const draw = (h, a) => { for (const k in h.flaps) h.flaps[k].setAttribute('points', pts(flapPts[k](a[k]))); };
  return { build, draw, P };
})();
