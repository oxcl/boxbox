// Welcome hero: a wide kraft box (same detailed look as every other box), flaps open outward, coloured boxes rise out of it.
const HERO = (() => {
  const W = 316, Hh = 172, D = 214;
  const ITEMS = [['blue', 'user', 'Personal', -88, -78, -46], ['orange', 'briefcase', 'Work', 0, -86, -50], ['green', 'school', 'School', 88, -78, -44], ['purple', 'game', 'Games', -46, -64, 42], ['pink', 'heart', 'Family', 48, -66, 44]];
  function build() {
    const root = BB.box({ kraft: true, icon: '', wordmark: 'BoxBox', size: 200, face: true, lid: true, hover: true });
    root.classList.add('hero-box'); root.style.setProperty('--w', W + 'px'); root.style.setProperty('--h', Hh + 'px'); root.style.setProperty('--d', D + 'px');
    const cube = root.querySelector('.cube');
    for (const c of ['b', 'l', 'f']) { const w = document.createElement('div'); w.className = 'in ' + c; cube.append(w); }
    const items = ITEMS.map(([col, ic, lb, x, y, z]) => {
      const it = BB.box({ color: BB.COLORS[col], icon: ic, label: lb, size: 74, inner: true, hover: false });
      it.style.cssText += `;left:calc(50% - 37px);top:calc(50% - 37px);transform:translate3d(${x}px,${y + 100}px,${z}px)`; it.dataset.x = x; it.dataset.y = y; it.dataset.z = z; cube.append(it); return it;
    });
    return { root, items };
  }
  async function play(h, { first = false } = {}) {
    const { root, items } = h;
    items.forEach((it) => { it.getAnimations().forEach((a) => a.cancel()); it.style.transform = `translate3d(${it.dataset.x}px,${+it.dataset.y + 100}px,${it.dataset.z}px)`; });
    if (!first) { await MO.lid(root, 0); await new Promise((r) => setTimeout(r, 120)); }
    else MO.A(root, [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    await new Promise((r) => setTimeout(r, first ? 600 : 80)); MO.lid(root, .92);
    items.forEach((it, i) => { const x = +it.dataset.x, y = +it.dataset.y, z = +it.dataset.z; const up = it.animate([{ transform: `translate3d(${x}px,${y + 100}px,${z}px)` }, { transform: `translate3d(${x}px,${y - 8}px,${z}px)`, offset: .72 }, { transform: `translate3d(${x}px,${y}px,${z}px)` }], { duration: 900, delay: 300 + i * 100, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'both' }); up.finished.then(() => { up.commitStyles(); up.cancel(); it.animate([{ transform: `translate3d(${x}px,${y}px,${z}px)` }, { transform: `translate3d(${x}px,${y - 4}px,${z}px)` }], { duration: 2600 + i * 240, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }); }).catch(() => {}); });
  }
  return { build, play };
})();
