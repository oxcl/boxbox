// Toolbar icon: an isometric cardboard box in the account's colour (kraft when there is no account). Drawn with a canvas at runtime.
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function parse(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xc9a06c; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const mix = (c, t, w) => c.map((v, i) => clamp(v + (t[i] - v) * w));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// unit-square faces of an isometric cube
const TOP = [[.5, .06], [.93, .29], [.5, .52], [.07, .29]], LEFT = [[.07, .29], [.5, .52], [.5, .95], [.07, .72]], RIGHT = [[.93, .29], [.5, .52], [.5, .95], [.93, .72]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function drawBoxIcon(g, n, color) {
  const base = color ? parse(color) : [201, 160, 108];
  const top = color ? mix(base, [255, 255, 255], .38) : [227, 196, 150], left = base, right = color ? mix(base, [0, 0, 0], .3) : [166, 124, 71];
  const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * n, y * n) : g.moveTo(x * n, y * n))); g.closePath(); g.fillStyle = fill; g.fill(); };
  poly(LEFT, css(left)); poly(RIGHT, css(right)); poly(TOP, css(top));
  // tape: across the top and down the front-left face
  const tape = 'rgba(255,255,255,.55)', a = lerp(TOP[0], TOP[1], .4), b = lerp(TOP[0], TOP[1], .62), c = lerp(TOP[3], TOP[2], .62), d = lerp(TOP[3], TOP[2], .4);
  poly([a, b, c, d], tape);
  const down = (p, q) => [p[0] + (q[0] - p[0]) * .34, p[1] + (q[1] - p[1]) * .34];
  poly([d, c, [c[0] + (LEFT[2][0] - LEFT[1][0]) * .34, c[1] + (LEFT[2][1] - LEFT[1][1]) * .34], [d[0] + (LEFT[3][0] - LEFT[0][0]) * .34, d[1] + (LEFT[3][1] - LEFT[0][1]) * .34]], tape);
  // soft edge highlight on the top face
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = Math.max(1, n / 32); g.beginPath(); g.moveTo(TOP[3][0] * n, TOP[3][1] * n); g.lineTo(TOP[0][0] * n, TOP[0][1] * n); g.lineTo(TOP[1][0] * n, TOP[1][1] * n); g.stroke();
}

/** ImageData per size for action.setIcon({ imageData }). Returns null when no canvas is available. */
export function boxIconData(color, sizes = [16, 32]) {
  try {
    const out = {};
    for (const n of sizes) {
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : document.createElement('canvas');
      cv.width = n; cv.height = n;
      const g = cv.getContext('2d'); drawBoxIcon(g, n, color);
      out[n] = g.getImageData(0, 0, n, n);
    }
    return out;
  } catch { return null; }
}
