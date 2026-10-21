// Background-side helpers for the visual identity of an account.
const cache = new Map();

const b64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
const dot = (color) => `<circle cx="47" cy="47" r="14.5" fill="${esc(color)}" stroke="#fff" stroke-width="4.5"/>`;

function svgData(svg) { return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }

function letterIcon(host, color) {
  const ch = (host || '?').replace(/^www\./, '').charAt(0).toUpperCase();
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#64748b"/><text x="32" y="43" font-size="32" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">${esc(ch)}</text>${dot(color)}</svg>`);
}

/** Returns {dataUrl, type} of the page icon with a coloured dot composited in the lower-right corner. */
export async function badgedIcon(href, color, host) {
  const key = href + '|' + color;
  if (cache.has(key)) return cache.get(key);
  let out;
  try {
    const res = await fetch(href, { credentials: 'omit', cache: 'force-cache' });
    if (!res.ok) throw new Error('http ' + res.status);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const buf = await res.arrayBuffer();
    if (type.includes('svg') || /\.svg(\?|$)/i.test(href)) {
      const inner = 'data:image/svg+xml;base64,' + b64(buf);
      out = { dataUrl: svgData(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64"><image href="${inner}" width="64" height="64"/>${dot(color)}</svg>`), type: 'image/svg+xml' };
    } else {
      const bmp = await createImageBitmap(new Blob([buf], { type: type || 'image/png' }));
      const S = 64, c = new OffscreenCanvas(S, S), g = c.getContext('2d');
      const k = Math.min(S / bmp.width, S / bmp.height);
      g.drawImage(bmp, (S - bmp.width * k) / 2, (S - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
      g.beginPath(); g.arc(47, 47, 14.5, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 4.5; g.strokeStyle = '#fff'; g.stroke();
      out = { dataUrl: await toDataUrl(await c.convertToBlob({ type: 'image/png' })), type: 'image/png' };
    }
  } catch {
    out = { dataUrl: letterIcon(host, color), type: 'image/svg+xml' };
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}
