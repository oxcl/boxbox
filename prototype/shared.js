// BoxBox prototype helpers (no logic, just feel).
const BB = (() => {
  const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const icons = {
    user: P('<circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="currentColor"/>'),
    briefcase: P('<rect x="3" y="7" width="18" height="13" rx="3" fill="currentColor"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18" stroke="rgba(0,0,0,.25)"/>'),
    home: P('<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor"/>'),
    flask: P('<path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" /><path d="M7.5 15h9" />'),
    cart: P('<path d="M3 4h2.5l2.2 11h10.1l2-8H7"/><circle cx="9.5" cy="19.5" r="1.6" fill="currentColor"/><circle cx="17" cy="19.5" r="1.6" fill="currentColor"/>'),
    game: P('<rect x="2.5" y="6.5" width="19" height="11" rx="5.5" fill="currentColor"/><path d="M8 10v4M6 12h4" stroke="rgba(0,0,0,.3)"/><circle cx="15.5" cy="11" r=".9" fill="rgba(0,0,0,.3)"/><circle cx="17.5" cy="13" r=".9" fill="rgba(0,0,0,.3)"/>'),
    heart: P('<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="currentColor"/>'),
    school: P('<path d="M2 9l10-5 10 5-10 5z" fill="currentColor"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/>'),
    laptop: P('<rect x="4.5" y="5" width="15" height="10" rx="1.8"/><path d="M2.5 19h19"/>'),
    users: P('<circle cx="9" cy="8" r="3.2" fill="currentColor"/><circle cx="17" cy="9" r="2.4" fill="currentColor"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6zM16 14.2c3 0 5.5 1.7 5.5 4.8H17" fill="currentColor"/>'),
    globe: P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'), check: P('<path d="m5 12.5 4.5 4.5L19 7.5" stroke-width="3"/>'),
    gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    grid: P('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
    play: P('<path d="M7 4.5v15l12-7.5z"/>'), net: P('<circle cx="12" cy="6" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="m10.5 8 -4 8M13.5 8l4 8M8 18h8"/>'),
    shield: P('<path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>'),
    info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'), search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    chev: P('<path d="m6 9 6 6 6-6"/>'), arrow: P('<path d="M5 12h14M13 6l6 6-6 6"/>'), dots: P('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
    link: P('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    box: P('<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>'),
    moon: P('<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>'),
  };
  const COLORS = { blue: '#3b82f6', orange: '#f59e0b', green: '#22c55e', purple: '#8b5cf6', pink: '#ec4899', coral: '#fb7185', teal: '#14b8a6', kraft: '#c8a06b' };

  /** 3D cardboard box. Cheap by default; detail depends on size: <56 faces+icon, <110 + label/sticker, ≥110 + grain/marks.
   *  opts: {color, icon, label, size, kraft, float, glow, hover, lid (build the hinged lid), face (smile), inner (lives inside another 3D box)} */
  function box({ color = COLORS.blue, icon = 'user', label = '', size = 96, kraft = false, float = false, glow = false, hover = true, drop = 0, face = false, lid = false, inner = false, wordmark = '' } = {}) {
    const el = document.createElement('div');
    const lod = size >= 110 ? 'lg' : size >= 56 ? 'md' : 'sm';
    el.className = ['bx', lod, kraft && 'kraft', float && 'float', glow && 'glow', hover && !inner && 'bx-hover', inner && 'inner'].filter(Boolean).join(' ');
    el.style.setProperty('--s', size + 'px'); if (!kraft) el.style.setProperty('--c', color);
    const detail = lod !== 'sm';
    el.innerHTML = `<div class="bob"><div class="cube">
      <div class="f front">${detail ? '<div class="tape"></div>' : ''}${wordmark ? `<div class="wm">${wordmark}</div>` : `<div class="ico">${icons[icon] || ''}</div>`}${detail ? '<div class="sticker"></div>' : ''}<i class="sw"></i></div>
      <div class="f right">${detail ? `<div class="label"><b>${label || (kraft ? 'BoxBox' : 'Box')}</b>${lod === 'lg' ? '<small>THIS SIDE UP</small>' : ''}<i></i></div>` : ''}${lod === 'lg' ? '<div class="marks"><i></i><i></i></div>' : ''}${face ? '<div class="smile"></div>' : ''}</div>
      <div class="top">${lid ? '<div class="inside"></div>' : ''}<div class="lid"><i class="o">${detail ? '<b class="tape"></b>' : ''}</i>${lid ? '<i class="n"></i>' : ''}</div></div>
      </div></div>${inner ? '' : `<div class="shadow-blob"></div><div class="check">${icons.check}</div>`}`;
    if (drop) requestAnimationFrame(() => MO.dropIn(el, drop));
    return el;
  }
  /** Flat isometric mini cube (no 3D, no children): for counts and rows. */
  function mini(color, size = 20) {
    const m = document.createElement('span'); m.className = 'mini'; m.style.setProperty('--s', size + 'px'); m.style.setProperty('--c', color);
    m.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="12,2 21.5,7 12,12 2.5,7" style="fill:var(--hi)"/><polygon points="2.5,7 12,12 12,22.5 2.5,17.5" style="fill:var(--c)"/><polygon points="21.5,7 12,12 12,22.5 21.5,17.5" style="fill:var(--lo)"/><polygon points="10,3.1 14,5.1 14,5.1 10,3.1" style="fill:rgba(255,255,255,.4)"/></svg>';
    return m;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function chipFor(tile, label) {
    const c = document.createElement('div'); c.className = 'chip-fly'; c.innerHTML = `<span class="tile2">${tile.dataset.letter || tile.textContent.trim().slice(0, 1)}</span><b>${label}</b>`; document.body.append(c); return c;
  }
  /** Parabolic flight of a fixed-position chip between two points (centre to centre) with a scale change. */
  function fly(chip, from, to, { s0 = 1, s1 = 1, lift = 90, duration = 420 } = {}) {
    const kf = []; for (let k = 0; k <= 12; k++) { const q = k / 12; kf.push({ transform: `translate(${(from[0] + (to[0] - from[0]) * q).toFixed(1)}px, ${(from[1] + (to[1] - from[1]) * q - Math.sin(Math.PI * q) * lift).toFixed(1)}px) translate(-50%, -50%) scale(${(s0 + (s1 - s0) * q).toFixed(3)})`, offset: q }); }
    return chip.animate(kf, { duration, easing: 'cubic-bezier(.4,.05,.3,1)', fill: 'forwards' }).finished;
  }
  const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  /** The site tile hops INTO a box: lid opens, tile drops in, lid closes (squash). */
  async function tabInto(box, tile, label, col) {
    if (!tile || MO.reduce) return;
    const chip = chipFor(tile, label), from = centre(tile), r = box.getBoundingClientRect(), to = [r.left + r.width / 2, r.top + r.height * .3];
    chip.style.cssText += `left:0;top:0;transform:translate(${from[0]}px,${from[1]}px) translate(-50%,-50%)`; tile.style.visibility = 'hidden';
    try { MO.lid(box, 1); await sleep(150); await fly(chip, from, to, { s1: .35, duration: 380 }); chip.remove(); MO.squish(box); await sleep(60); MO.lid(box, 0); await sleep(200); }
    finally { chip.remove(); }
  }
  /** The tile climbs OUT of a box and flies to its resting place (tile's own slot). */
  async function tabOutOf(box, tile, label, col) {
    if (MO.reduce) { tile.style.visibility = ''; return; }
    const chip = chipFor(tile, label), r = box.getBoundingClientRect(), from = [r.left + r.width / 2, r.top + r.height * .3], to = centre(tile);
    chip.style.cssText += `left:0;top:0;opacity:0;transform:translate(${from[0]}px,${from[1]}px) translate(-50%,-50%) scale(.35)`;
    try { MO.lid(box, 1); await sleep(130); chip.style.opacity = 1; await fly(chip, from, to, { s0: .35, s1: 1, duration: 420 }); MO.lid(box, 0); }
    finally { chip.remove(); tile.style.visibility = ''; }
    MO.shine(box); const c = centre(box); MO.ring(c[0], c[1], col);
  }
  /** Switch a tab between boxes: it goes back into the previous box, then the new box lets it out again. */
  async function swapTab(prevBox, newBox, tile, label, col) {
    if (!tile || MO.reduce) return;
    if (prevBox && prevBox !== newBox) await tabInto(prevBox, tile, label, col);
    await tabOutOf(newBox, tile, label, col);
  }
  function confetti(x, y, colors = Object.values(COLORS), n = 12) {
    for (let i = 0; i < Math.min(n, 14); i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
      c.addEventListener('animationend', () => c.remove(), { once: true });
      c.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 30}px;--rot:${Math.random() * 540 - 270}deg;border-radius:${Math.random() > .5 ? '50%' : '3px'}`;
      document.body.append(c);
    }
  }
  const burstAt = (el, colors) => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; confetti(x, y, colors); MO.ring(x, y, colors && colors[0]); const b = el.classList.contains('bx') ? el : el.querySelector('.bx'); if (b) { MO.shine(b); MO.squish(b); } };
  function toast(msg) { let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2200); }

  /** Segmented control with a sliding thumb. */
  function seg(root, onChange) {
    const btns = [...root.querySelectorAll('button')]; let thumb = root.querySelector('.thumb');
    if (!thumb) { thumb = document.createElement('div'); thumb.className = 'thumb'; root.prepend(thumb); }
    const place = () => { const b = btns.find((x) => x.getAttribute('aria-checked') === 'true') || btns[0]; thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft - 4}px)`; };
    btns.forEach((b) => b.addEventListener('click', () => { btns.forEach((x) => x.setAttribute('aria-checked', String(x === b))); place(); onChange && onChange(b.dataset.v); }));
    requestAnimationFrame(place); addEventListener('resize', place); document.fonts && document.fonts.ready.then(place); return place;
  }
  const initTheme = () => { const s = localStorage.getItem('bb-theme'); if (s) document.documentElement.dataset.theme = s; };
  const toggleTheme = () => { const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = d; localStorage.setItem('bb-theme', d); };
  function chrome(active) {
    const n = document.createElement('div'); n.className = 'nav-demo';
    n.innerHTML = [['index.html', 'Home'], ['onboarding.html', 'Welcome'], ['popup.html', 'Popup'], ['picker.html', 'Picker'], ['services.html', 'Settings'], ['browser.html', 'In page']].map(([h, t]) => `<a href="${h}" ${active === h ? 'style="background:#16142a;color:#fff"' : ''}>${t}</a>`).join('') + '<button id="theme">☾</button>';
    document.body.append(n); n.querySelector('#theme').onclick = toggleTheme;
  }
  const scene = () => { const s = document.createElement('div'); s.className = 'bg-scene'; s.innerHTML = '<div class="shadow"></div><div class="leaf l1"></div><div class="leaf l2"></div>'; document.body.prepend(s); };
  const logo = (size = 26) => { const l = document.createElement('span'); l.className = 'logo'; const b = box({ kraft: true, icon: '', size, hover: false }); l.append(b, 'BoxBox'); return l; };
  initTheme();
  let idle; const wake = () => { document.body && document.body.classList.remove('calm'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('calm'), 30000); };
  ['pointermove', 'keydown', 'pointerdown'].forEach((e) => addEventListener(e, wake, { passive: true })); addEventListener('DOMContentLoaded', wake);
  return { icons, COLORS, tabInto, tabOutOf, swapTab, box, mini, confetti, burstAt, toast, seg, chrome, scene, logo };
})();
