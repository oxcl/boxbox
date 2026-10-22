// Procedural PNG icon generator (no image libraries): rounded gradient tile with an isometric box.
import zlib from 'node:zlib';

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
const rr = (x, y, r) => { const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0); return dx * dx + dy * dy <= r * r; };

export function icon(size, { gray = false } = {}) {
  // an isometric kraft box on a transparent background (same geometry as the runtime toolbar icon in src/core/boxicon.js)
  const S = 4, buf = Buffer.alloc(size * size * 4);
  const TOP = [[.5, .06], [.93, .29], [.5, .52], [.07, .29]], LEFT = [[.07, .29], [.5, .52], [.5, .95], [.07, .72]], RIGHT = [[.93, .29], [.5, .52], [.5, .95], [.93, .72]];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = lerp(TOP[0], TOP[1], .4), b = lerp(TOP[0], TOP[1], .62), c = lerp(TOP[3], TOP[2], .62), d = lerp(TOP[3], TOP[2], .4);
  const tapeTop = [a, b, c, d];
  const tapeLeft = [d, c, [c[0] + (LEFT[2][0] - LEFT[1][0]) * .34, c[1] + (LEFT[2][1] - LEFT[1][1]) * .34], [d[0] + (LEFT[3][0] - LEFT[0][0]) * .34, d[1] + (LEFT[3][1] - LEFT[0][1]) * .34]];
  const kraft = { top: [227, 196, 150], left: [201, 160, 108], right: [166, 124, 71] }, grey = { top: [200, 204, 212], left: [160, 165, 175], right: [120, 125, 135] };
  const col = gray ? grey : kraft;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, bl = 0, al = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = (px + (sx + 0.5) / S) / size, y = (py + (sy + 0.5) / S) / size;
      let cc = null;
      if (inPoly(x, y, TOP)) cc = col.top; else if (inPoly(x, y, LEFT)) cc = col.left; else if (inPoly(x, y, RIGHT)) cc = col.right;
      if (!cc) continue;
      if (inPoly(x, y, tapeTop) || inPoly(x, y, tapeLeft)) cc = [cc[0] + (255 - cc[0]) * .5, cc[1] + (255 - cc[1]) * .5, cc[2] + (255 - cc[2]) * .5];
      r += cc[0]; g += cc[1]; bl += cc[2]; al += 1;
    }
    const n = S * S, o = (py * size + px) * 4;
    if (al) { buf[o] = r / al; buf[o + 1] = g / al; buf[o + 2] = bl / al; buf[o + 3] = Math.round((al / n) * 255); }
  }
  return png(size, size, buf);
}
