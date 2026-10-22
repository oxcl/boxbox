// Builds the wide kraft box with the five coloured boxes inside, in its final (opened) state. Used by several compositions.
globalThis.makeHero = function ({ size = 200, W = 316, H = 172, D = 214, open = .92, item = 74, tilt } = {}) {
  const { box } = BB, C = { blue: '#3b82f6', orange: '#f59e0b', green: '#22c55e', purple: '#8b5cf6', pink: '#ec4899' };
  const items = [['blue', 'user', 'Personal', -88, -78, -46], ['orange', 'briefcase', 'Work', 0, -86, -50], ['green', 'book', 'School', 88, -78, -44], ['purple', 'game', 'Games', -46, -64, 42], ['pink', 'heart', 'Family', 48, -66, 44]];
  const root = box({ kraft: true, icon: '', wordmark: 'BoxBox', size, face: true, lid: true, check: false, hover: false });
  root.classList.add('hero-box'); root.style.setProperty('--w', W + 'px'); root.style.setProperty('--h', H + 'px'); root.style.setProperty('--d', D + 'px'); root.style.setProperty('--open', open);
  const cube = root.querySelector('.cube'); if (tilt) cube.style.transform = tilt;
  for (const c of ['b', 'l', 'f']) { const w = document.createElement('div'); w.className = 'in ' + c; cube.append(w); }
  for (const [col, ic, lb, x, y, z] of items) { const it = box({ color: C[col], icon: ic, label: lb, size: item, inner: true, hover: false }); it.style.cssText += `;left:calc(50% - ${item / 2}px);top:calc(50% - ${item / 2}px);transform:translate3d(${x}px,${y}px,${z}px)`; cube.append(it); }
  return root;
};
