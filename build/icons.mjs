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
  const S = 4, buf = Buffer.alloc(size * size * 4);
  // isometric cube faces in unit coordinates
  const top = [[0.5, 0.2], [0.78, 0.35], [0.5, 0.5], [0.22, 0.35]];
  const left = [[0.22, 0.35], [0.5, 0.5], [0.5, 0.82], [0.22, 0.67]];
  const right = [[0.78, 0.35], [0.5, 0.5], [0.5, 0.82], [0.78, 0.67]];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = (px + (sx + 0.5) / S) / size, y = (py + (sy + 0.5) / S) / size;
      if (!rr(x, y, 0.22)) continue;
      const t = (x + y) / 2;
      let c = gray ? [120 + t * 40, 124 + t * 40, 130 + t * 40] : [99 - t * 30, 102 - t * 50, 241 - t * 10];  // indigo -> violet-ish
      if (inPoly(x, y, top)) c = [255, 255, 255];
      else if (inPoly(x, y, left)) c = [226, 232, 255];
      else if (inPoly(x, y, right)) c = [196, 206, 255];
      r += c[0]; g += c[1]; b += c[2]; a += 1;
    }
    const n = S * S, o = (py * size + px) * 4;
    if (a) { buf[o] = r / a; buf[o + 1] = g / a; buf[o + 2] = b / a; buf[o + 3] = Math.round((a / n) * 255); }
  }
  return png(size, size, buf);
}
