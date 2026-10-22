// Welcome hero: the same detailed kraft box as everywhere else, lid hinged open, coloured boxes rising out of it (real 3D, depth-sorted by the browser).
const HERO = (() => {
  const S = 190, ITEMS = [['blue', 'user', 'Personal', -42, -84, -36], ['orange', 'briefcase', 'Work', 38, -92, -40], ['green', 'school', 'School', -38, -76, 34], ['purple', 'game', 'Games', 40, -82, 30], ['pink', 'heart', 'Family', 0, -98, -4]];
  function build() {
    const root = BB.box({ kraft: true, icon: '', wordmark: 'BoxBox', size: S, face: true, lid: true, hover: true });
    root.classList.add('hero-box'); const cube = root.querySelector('.cube');
    for (const [c, tf] of [['b', `rotateY(180deg) translateZ(${S / 2}px)`], ['l', `rotateY(-90deg) translateZ(${S / 2}px)`], ['f', `rotateX(-90deg) translateZ(${S / 2}px)`]]) { const w = document.createElement('div'); w.className = 'in ' + c; w.style.transform = tf; cube.append(w); }
    const items = ITEMS.map(([col, ic, lb, x, y, z]) => {
      const it = BB.box({ color: BB.COLORS[col], icon: ic, label: lb, size: 62, inner: true, hover: false });
      it.style.cssText += `;left:calc(50% - 31px);top:calc(50% - 31px);transform:translate3d(${x}px,${y + 90}px,${z}px)`; it.dataset.x = x; it.dataset.y = y; it.dataset.z = z; cube.append(it); return it;
    });
    return { root, items };
  }
  /** Gentle sequence: box settles in → lid swings open → boxes rise one after another. */
  async function play(h, { first = false } = {}) {
    const { root, items } = h;
    items.forEach((it) => { it.getAnimations().forEach((a) => a.cancel()); it.style.transform = `translate3d(${it.dataset.x}px,${+it.dataset.y + 90}px,${it.dataset.z}px)`; });
    if (!first) { await MO.lid(root, 0); await new Promise((r) => setTimeout(r, 150)); }
    else MO.A(root, [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }], { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    await new Promise((r) => setTimeout(r, first ? 650 : 100)); MO.lid(root, .5);
    items.forEach((it, i) => { const x = +it.dataset.x, y = +it.dataset.y, z = +it.dataset.z; const up = it.animate([{ transform: `translate3d(${x}px,${y + 90}px,${z}px)` }, { transform: `translate3d(${x}px,${y - 8}px,${z}px)`, offset: .72 }, { transform: `translate3d(${x}px,${y}px,${z}px)` }], { duration: 900, delay: 350 + i * 110, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'both' }); up.finished.then(() => { up.commitStyles(); up.cancel(); it.animate([{ transform: `translate3d(${x}px,${y}px,${z}px)` }, { transform: `translate3d(${x}px,${y - 4}px,${z}px)` }], { duration: 2600 + i * 240, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }); }).catch(() => {}); });
  }
  return { build, play };
})();
