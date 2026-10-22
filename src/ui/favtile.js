// A service's logo tile: a bundled logo (catalog services) → the icon learned from pages you visited → a coloured letter.
import { h } from './lib.js';
import { LOGOS } from './logos.js';

const hue = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return `hsl(${x} 42% 46%)`; };
export function favTile(service, learned) {
  const L = LOGOS[service.id], t = h('span', { class: 'fav' });
  const logo = (html) => { t.classList.add('logo'); t.innerHTML = html; };
  if (L && L.type === 'path') logo(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${L.d}" fill="${L.hex}"/></svg>`);
  else if (L && L.type === 'svg') logo(L.svg);
  else if (L && L.type === 'text') { t.classList.add('logo'); t.append(h('span', { style: { background: L.gradient, webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', fontWeight: 800 } }, L.text)); }
  else if (learned && /^data:image\//.test(learned)) { t.classList.add('logo'); t.append(h('img', { src: learned, alt: '', draggable: 'false' })); }
  else if (L && L.type === 'tile') { t.style.background = L.bg; t.textContent = L.text; t.style.fontSize = L.text.length > 1 ? '0.8em' : ''; }
  else { t.style.background = hue(service.name); t.textContent = service.name.charAt(0).toUpperCase(); }
  return t;
}
