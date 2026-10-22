// BoxBox motion layer: one rAF loop that only runs while something is moving.
const MO = (() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* ---------- spring engine ---------- */
  const active = new Set(); let raf = 0, last = 0;
  class Spring {
    constructor(v = 0, k = 190, c = 13) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.c = c; }
    to(t) { this.t = t; wake(this); return this; }
    snap(v) { this.v = this.t = v; this.vel = 0; }
    step(dt) { // semi-implicit Euler, sub-stepped for stability
      const n = Math.ceil(dt / .008), h = dt / n;
      for (let i = 0; i < n; i++) { this.vel += (-this.k * (this.v - this.t) - this.c * this.vel) * h; this.v += this.vel * h; }
      return Math.abs(this.vel) > .02 || Math.abs(this.v - this.t) > .02;
    }
  }
  const hooks = new Set();
  function wake(s) { active.add(s); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    const dt = Math.min(.034, (now - last) / 1000 || .016); last = now;
    for (const s of active) if (!s.step(dt)) { s.v = s.t; active.delete(s); }
    for (const h of hooks) h();
    raf = active.size ? requestAnimationFrame(tick) : 0;
  }
  const spring = (v, k, c) => new Spring(v, k, c);
  const hook = (fn) => hooks.add(fn);

  /* ---------- 3D box tilt: critically damped (no overshoot), small amplitudes, pointer input is low-pass filtered ---------- */
  const st = new WeakMap();
  function state(b) {
    let s = st.get(b);
    if (!s) {
      s = { cube: b.querySelector('.cube'), rx: spring(0, 70, 17), ry: spring(0, 70, 17), ly: spring(0, 90, 19), sc: spring(1, 90, 19), op: spring(0, 120, 20), dirty: true };
      st.set(b, s); hooks.add(() => { if (!b.isConnected) { return; } if (s.dirty || active.has(s.rx) || active.has(s.ly) || active.has(s.op)) paint(b, s); });
    }
    return s;
  }
  function paint(b, s) {
    s.cube.style.transform = `translateY(${s.ly.v}%) scale(${s.sc.v}) rotateX(${-24 + s.rx.v}deg) rotateY(${-32 + s.ry.v}deg)`;
    b.style.setProperty('--open', Math.max(0, Math.min(1, s.op.v + (b._open || 0))));
    s.dirty = active.has(s.rx) || active.has(s.ry) || active.has(s.ly) || active.has(s.sc) || active.has(s.op);
  }
  const lifted = (b) => b.classList.contains('bx-selected');
  function rest(b, hover) { const s = state(b); s.ly.to(hover || lifted(b) ? -3 : 0); s.sc.to(hover ? 1.03 : lifted(b) ? 1.02 : 1); s.op.to(hover ? .16 : 0); if (!hover) { s.rx.to(0); s.ry.to(0); } s.dirty = true; }
  /** Open / close the lid on a box (0..1) with a spring. */
  function lid(b, v) { const s = state(b); s.op.k = 150; s.op.c = 15; s.op.to(v); s.dirty = true; return new Promise((r) => setTimeout(r, 380)); }
  if (!reduce) {
    let cur = null, tx = 0, ty = 0, fx = 0, fy = 0, filt = 0;
    const smooth = () => { fx += (tx - fx) * .22; fy += (ty - fy) * .22; if (cur) { const s = state(cur); s.ry.to(fx * 12); s.rx.to(-fy * 9); } if (cur && (Math.abs(tx - fx) > .002 || Math.abs(ty - fy) > .002)) filt = requestAnimationFrame(smooth); else filt = 0; };
    addEventListener('pointermove', (e) => {
      const b = e.target.closest && e.target.closest('.bx-hover');
      if (cur && cur !== b) { rest(cur, false); cur = null; }
      if (!b) return;
      if (cur !== b) { cur = b; fx = fy = 0; rest(b, true); }
      const r = b.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5;
      if (!filt) filt = requestAnimationFrame(smooth);
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (cur) { rest(cur, false); cur = null; } });
    new MutationObserver((ms) => { for (const m of ms) { const b = m.target; if (b.classList && b.classList.contains('bx') && b !== cur) rest(b, false); } }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- little one-shot animations (Web Animations API) ---------- */
  const A = (el, kf, o) => reduce ? null : el.animate(kf, { fill: 'both', ...o });
  const squish = (el) => A(el, [{ transform: 'none' }, { transform: 'scale(1.18, .78) translateY(6%)', offset: .25 }, { transform: 'scale(.9, 1.16) translateY(-14%)', offset: .55 }, { transform: 'scale(1.04, .97)', offset: .8 }, { transform: 'none' }], { duration: 620, easing: 'ease-out' });
  const dropIn = (el, delay = 0) => A(el, [{ transform: 'translateY(-70px) scale(.8, 1.2)', opacity: 0 }, { transform: 'translateY(0) scale(1.12, .84)', opacity: 1, offset: .62 }, { transform: 'translateY(-10px) scale(.96, 1.06)', offset: .8 }, { transform: 'none', opacity: 1 }], { duration: 760, delay, easing: 'cubic-bezier(.3,.7,.4,1)' });
  const spinIn = (el, delay = 0) => A(el, [{ transform: 'scale(0) rotate(-200deg)', opacity: 0 }, { transform: 'scale(1.25) rotate(14deg)', opacity: 1, offset: .65 }, { transform: 'scale(.94) rotate(-4deg)', offset: .85 }, { transform: 'none' }], { duration: 800, delay, easing: 'cubic-bezier(.3,.8,.3,1)' });
  const popIn = (el, o = {}) => A(el, [{ transform: `scale(.55) translateY(-24px)`, opacity: 0 }, { transform: 'scale(1.04) translateY(2px)', opacity: 1, offset: .6 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.3,.8,.3,1)', ...o });
  const stagger = (els, fn, gap = 60) => [...els].forEach((e, i) => fn(e, i * gap));
  function ring(x, y, color) { const r = document.createElement('i'); r.className = 'ring'; r.style.cssText = `left:${x}px;top:${y}px;--rc:${color || '#fff'}`; r.addEventListener('animationend', () => r.remove(), { once: true }); document.body.append(r); }
  const shine = (b) => { b.classList.remove('shine'); void b.offsetWidth; b.classList.add('shine'); };
  /** Parabolic flight from one point to another, with squash on landing (used by the unboxing). */
  function arc(el, from, to, { delay = 0, height = 120, duration = 900, spin = 0 } = {}) {
    const dx = to[0] - from[0], dy = to[1] - from[1], steps = 14, kf = [];
    for (let i = 0; i <= steps; i++) { const t = i / steps, y = dy * t - 4 * height * t * (1 - t); kf.push({ transform: `translate(${dx * t - dx}px, ${y - dy}px) rotate(${spin * (1 - t)}deg) scale(${.55 + .45 * Math.min(1, t * 1.6)})`, opacity: Math.min(1, t * 8), offset: t * .86 }); }
    kf.push({ transform: 'translate(0,0) scale(1.14, .84)', offset: .93 }, { transform: 'translate(0,0) scale(.96, 1.06)', offset: .97 }, { transform: 'none', offset: 1 });
    return A(el, kf, { duration, delay, easing: 'linear', fill: 'backwards' });
  }
  /** Circular reveal from a point: the new layer grows out of the box that was clicked. */
  function reveal(layer, x, y, { duration = 900 } = {}) {
    const b = layer.getBoundingClientRect(); x -= b.left; y -= b.top;
    const r = Math.hypot(Math.max(x, b.width - x), Math.max(y, b.height - y));
    return A(layer, [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${r}px at ${x}px ${y}px)` }], { duration, easing: 'cubic-bezier(.65,0,.25,1)' });
  }

  /* ---------- ambient dust motes (cheap: ~26 dots, paused when hidden/idle) ---------- */
  function motes(host) {
    if (reduce || !host) return;
    const cv = document.createElement('canvas'); host.append(cv); const g = cv.getContext('2d');
    let w = 0, h = 0, id = 0; const P = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), r: .8 + Math.random() * 2.2, v: .01 + Math.random() * .03, p: Math.random() * 6 }));
    const size = () => { const d = Math.min(2, devicePixelRatio || 1); w = cv.width = innerWidth * d * .5; h = cv.height = innerHeight * d * .5; }; size(); addEventListener('resize', size);
    let t0 = performance.now();
    const draw = (t) => { id = 0; if (document.hidden || document.body.classList.contains('calm')) { id = setTimeout(() => (id = requestAnimationFrame(draw)), 1000); return; }
      const dt = (t - t0) / 1000; t0 = t; g.clearRect(0, 0, w, h);
      for (const p of P) { p.y -= p.v * dt; p.p += dt; if (p.y < -.05) { p.y = 1.05; p.x = Math.random(); } const x = (p.x + Math.sin(p.p * .6) * .02) * w, y = p.y * h, a = .25 + .2 * Math.sin(p.p * 1.4); g.fillStyle = `rgba(255,236,200,${a})`; g.beginPath(); g.arc(x, y, p.r * (w / innerWidth + .6), 0, 6.283); g.fill(); }
      id = requestAnimationFrame(draw); };
    id = requestAnimationFrame(draw);
  }
  /** Glass buttons: cursor spotlight + a few degrees of 3D tilt, smoothed by the CSS transition. */
  if (!reduce) { let hb = null; addEventListener('pointermove', (e) => { const b = e.target.closest && e.target.closest('.btn'); if (hb && hb !== b) { hb.style.setProperty('--brx', '0deg'); hb.style.setProperty('--bry', '0deg'); hb = null; } if (!b) return; hb = b; const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; b.style.setProperty('--mx', e.clientX - r.left + 'px'); b.style.setProperty('--my', e.clientY - r.top + 'px'); b.style.setProperty('--bry', x * 9 + 'deg'); b.style.setProperty('--brx', -y * 12 + 'deg'); }, { passive: true }); }
  /** Lid-close transition: two flaps slam shut, tape runs across, then the lid opens on the new content. */
  function lidWipe(host, change) {
    if (reduce) { change(); return Promise.resolve(); }
    const w = document.createElement('div'); w.className = 'lidwipe'; w.innerHTML = '<div class="p l"></div><div class="p r"></div><div class="tape"><b>BOXBOX · BOXBOX · BOXBOX</b></div>'; host.append(w);
    const [l, r, t] = [...w.children], o = { fill: 'forwards' };
    const close = (el, from) => el.animate([{ transform: `translateX(${from}%) rotateY(${from < 0 ? 40 : -40}deg)` }, { transform: 'translateX(0) rotateY(0)' }], { duration: 420, easing: 'cubic-bezier(.6,0,.9,.5)', ...o });
    close(l, -102); const a = close(r, 102);
    return a.finished.then(() => { t.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 260, easing: 'cubic-bezier(.3,.8,.3,1)', ...o }); w.animate([{ transform: 'scale(1)' }, { transform: 'scale(.985)' }, { transform: 'scale(1)' }], { duration: 260, delay: 220 }); change(); return new Promise((res) => setTimeout(res, 380)); }).then(() => {
      t.animate([{ transform: 'scaleY(1)', transformOrigin: '50% 100%' }, { transform: 'scaleY(0)', transformOrigin: '50% 100%' }], { duration: 220, ...o });
      l.animate([{ transform: 'translateX(0) rotateY(0)' }, { transform: 'translateX(-102%) rotateY(40deg)' }], { duration: 520, delay: 160, easing: 'cubic-bezier(.3,.7,.2,1)', ...o }); return r.animate([{ transform: 'translateX(0) rotateY(0)' }, { transform: 'translateX(102%) rotateY(-40deg)' }], { duration: 520, delay: 160, easing: 'cubic-bezier(.3,.7,.2,1)', ...o }).finished; }).then(() => w.remove());
  }
  /** Cursor sheen for cards: sets --mx/--my on the hovered .sheen element. */
  if (!reduce) addEventListener('pointermove', (e) => { const c = e.target.closest && e.target.closest('.sheen'); if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); } }, { passive: true });
  return { lidWipe, spring, hook, lid, squish, dropIn, spinIn, popIn, stagger, ring, shine, arc, reveal, motes, A, reduce, rest };
})();
