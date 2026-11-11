// Hi-res hand-pixeled art for the 2D background life + ad posters (crisp, NearestFilter, no blur).
// Each sprite is painted as flat colour REGIONS (ellipses, polygons, thick lines, rects) on a fine grid
// (~24-56 px tall), then a pixel-artist pass shades it:
//   * 5-step hue-shifted ramp per colour (shadows drift toward blue-violet, lights toward warm yellow),
//     4 tones used across a region + a highlight on big regions, lit from the top-left (per-region dome +
//     bevel), 2x2 ordered dither only on the ramp boundaries
//   * rim light: a cool sky-tinted pixel on the shadow-side silhouette edge
//   * selective outline (4-connected, corners open): ramp-darkest tint of the shape on the lit side, ink on
//     the shadow side
// Posters (128 x 64) use the same pass for their art + shaded, outlined pixel lettering.
import { pixelGlyph } from '../props/common.js';

export const INK = 0x1b1530;
const RIM = 0xd8f0ff;

// ------------------------------------------------------------------ colour ramps
const toHsl = (c) => {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromHsl = (h, s, l) => {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
};
const toward = (h, t, a) => { const d = ((t - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), a); };
const RAMPS = new Map();
/** [deep shadow, shadow, base, light, highlight] */
export function ramp(c) {
  let R = RAMPS.get(c);
  if (R) return R;
  const [h, s, l] = toHsl(c), grey = s < 0.1;
  const dk = (k) => fromHsl(toward(grey ? 235 : h, 252, 13 * k), grey ? 0.1 + 0.07 * k : Math.min(1, s * (1 + 0.1 * k)), Math.max(0.06, l * (1 - 0.23 * k)));
  const lt = (k) => fromHsl(grey ? h : toward(h, 55, 8 * k), grey ? s : s * (1 - 0.08 * k), Math.min(0.97, l + (1 - l) * 0.32 * k));
  R = [dk(2), dk(1), c, lt(1), lt(2)];
  RAMPS.set(c, R);
  return R;
}
export const mixC = (a, b, t) => {
  const f = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
};
const BAY2 = [0, 0.5, 0.75, 0.25];

// ------------------------------------------------------------------ region painter
export function painter(w, h) {
  const col = new Int32Array(w * h).fill(-1), reg = new Int32Array(w * h).fill(-1), flat = new Uint8Array(w * h);
  let n = 0;
  const R = (c, f = false) => ({ id: n++, col: c, flat: f });
  const as = (r) => (typeof r === 'number' ? R(r) : r);
  const set = (x, y, r) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = y * w + x; col[i] = r.col; reg[i] = r.id; flat[i] = r.flat ? 1 : 0; };
  const P = {
    w, h, col, reg, flat, R,
    flat: (c) => R(c, true),
    ell(cx, cy, rx, ry, r, clip) {
      r = as(r);
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!clip || clip(x, y))) set(x, y, r);
      }
      return r;
    },
    poly(pts, r) {
      r = as(r);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) set(x, y, r);
      }
      return r;
    },
    line(x0, y0, x1, y1, th, r) {
      r = as(r);
      const ex = x1 - x0, ey = y1 - y0, ee = ex * ex + ey * ey || 1e-6, m = th + 1;
      for (let y = Math.floor(Math.min(y0, y1) - m); y <= Math.ceil(Math.max(y0, y1) + m); y++) for (let x = Math.floor(Math.min(x0, x1) - m); x <= Math.ceil(Math.max(x0, x1) + m); x++) {
        const qx = x + 0.5 - x0, qy = y + 0.5 - y0, t = Math.max(0, Math.min(1, (qx * ex + qy * ey) / ee));
        const dx = qx - ex * t, dy = qy - ey * t;
        if (dx * dx + dy * dy <= (th / 2) * (th / 2) + 0.15) set(x, y, r);
      }
      return r;
    },
    rect(x, y, rw, rh, r) { r = as(r); for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) set(xx, yy, r); return r; },
    dot(x, y, r) { set(x, y, as(r)); },
    text(str, x, y, sc, r) { r = as(r); let cx = x; for (const ch of str) { const g = pixelGlyph(ch); g.forEach((row, gy) => [...row].forEach((b, gx) => { if (b === '#') P.rect(cx + gx * sc, y + gy * sc, sc, sc, r); })); cx += (g[0].length + 1) * sc; } },
  };
  return P;
}
export const textW = (s, sc = 1) => [...s].reduce((a, ch) => a + (pixelGlyph(ch)[0].length + 1) * sc, -sc);

/** Shade + rim + selective outline. Returns { w, h, px: Int32Array (-1 empty) } with a 1px outline border. */
export function shade(P, o = {}) {
  const { w, h, col, reg, flat } = P;
  const ink = o.ink ?? INK;
  const bb = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = reg[y * w + x];
    if (r < 0) continue;
    let b = bb.get(r);
    if (!b) bb.set(r, (b = [x, y, x, y, 0]));
    if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; b[4]++;
  }
  const W = w + 2, H = h + 2, out = new Int32Array(W * H).fill(-1);
  const same = (x, y, r) => x >= 0 && y >= 0 && x < w && y < h && reg[y * w + x] === r;
  const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && reg[y * w + x] >= 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, r = reg[i];
    if (r < 0) continue;
    if (flat[i]) { out[(y + 1) * W + x + 1] = col[i]; continue; }
    const b = bb.get(r), u = (x - b[0] + 0.5) / (b[2] - b[0] + 1), v = (y - b[1] + 0.5) / (b[3] - b[1] + 1);
    let L = 0.95 - Math.hypot(u - 0.3, v - 0.26) * 1.05;
    if (!same(x, y - 1, r)) L += 0.3;
    if (!same(x - 1, y, r)) L += 0.16;
    if (!same(x, y + 1, r)) L -= 0.24;
    if (!same(x + 1, y, r)) L -= 0.16;
    L += (BAY2[(y & 1) * 2 + (x & 1)] - 0.375) * 0.18;
    let k = L > 0.95 ? 4 : L > 0.62 ? 3 : L > 0.3 ? 2 : L > 0.04 ? 1 : 0;
    if (k === 4 && b[4] < 36) k = 3;
    const Rm = ramp(col[i]);
    let c = Rm[k];
    if (o.rim !== false && !filled(x + 1, y) && filled(x - 1, y) && k <= 2) c = mixC(Rm[3], RIM, 0.4);
    out[(y + 1) * W + x + 1] = c;
  }
  // selective outline (4-connected: diagonal corners stay open)
  const S = (X, Y) => (X >= 1 && Y >= 1 && X <= w && Y <= h ? reg[(Y - 1) * w + X - 1] : -1);
  const base = (X, Y) => col[(Y - 1) * w + X - 1];
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    if (S(X, Y) >= 0) continue;
    const L = S(X - 1, Y) >= 0, T = S(X, Y - 1) >= 0, Rt = S(X + 1, Y) >= 0, B = S(X, Y + 1) >= 0;
    if (!(L || T || Rt || B)) continue;
    if (L || T) out[Y * W + X] = ink; // shadow side of the shape
    else out[Y * W + X] = o.litOutline === false ? ink : mixC(ramp(Rt ? base(X + 1, Y) : base(X, Y + 1))[0], ink, 0.35);
  }
  return { w: W, h: H, px: out };
}

// ------------------------------------------------------------------ sprites (y down, feet on the bottom row)
// each: [w, h, draw(P, c)], k = pixel density vs the world size callers pass (4 px per old "pixel")
const G = { leaf: 0x3cb43a, leafL: 0x6ad04a, stem: 0x2e9a36, wood: 0xa0602e, woodD: 0x7a4220, skin: 0xf2c4a2 };
const flowerStem = (P, x, y0, y1) => { P.line(x, y1, x, y0, 2, G.stem); P.ell(x - 4, y1 - 7, 4, 1.8, G.leaf); P.ell(x + 4, y1 - 11, 4, 1.8, G.leafL); };
const DEFS = {
  daisy: [20, 28, (P, c) => {
    flowerStem(P, 10, 10, 27);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.ell(10 + Math.cos(a) * 4.6, 8 + Math.sin(a) * 4.2, 2.8, 2.6, c.petal ?? 0xffffff); }
    P.ell(10, 8, 2.8, 2.6, 0xffc21a);
  }],
  tulip: [20, 30, (P, c) => {
    flowerStem(P, 10, 12, 29);
    const p = c.petal ?? 0xffd23f;
    P.ell(10, 10, 6, 6.5, p);
    P.poly([[4, 9], [5, 1], [9, 7]], p); P.poly([[16, 9], [15, 1], [11, 7]], p); P.poly([[7.5, 6], [10, -0.5], [12.5, 6]], p);
  }],
  rose: [20, 32, (P, c) => {
    flowerStem(P, 10, 12, 31);
    const p = c.petal ?? 0xff4f8a;
    P.ell(10, 9, 7.5, 6.5, p); P.ell(10, 8, 4.5, 3.8, p); P.ell(9.5, 7.2, 2, 1.6, mixC(p, INK, 0.25));
  }],
  bush: [48, 32, (P, c) => {
    const g = c.leaf ?? 0x3cb43a;
    for (const [x, y, rx, ry] of [[24, 13, 13, 11], [12, 19, 11, 10], [36, 18, 11, 10], [7, 25, 7, 6], [41, 25, 7, 6], [20, 24, 10, 7.5], [31, 25, 10, 6.5]]) P.ell(x, y, rx, ry, g);
    for (const [x, y] of [[14, 15], [29, 10], [37, 19], [22, 22]]) if (c.berry) P.ell(x, y, 1.8, 1.8, c.berry);
  }],
  mushroom: [28, 28, (P, c) => {
    P.ell(14, 22, 4.5, 6.5, 0xf4ecdc);
    const cap = c.cap ?? 0xf23a4a;
    P.ell(14, 12, 13, 10, cap, (x, y) => y <= 13);
    for (const [x, y, r] of [[8, 8, 2], [16, 5, 2.2], [20, 10, 1.8], [12, 11, 1.4]]) P.ell(x, y, r, r * 0.9, 0xffffff);
  }],
  fly: [28, 20, (P, c, f) => {
    const a = c.wing ?? 0xff6fb8, b = c.wing2 ?? mixC(a, 0x6a2a9a, 0.35);
    if (!f) { P.ell(8, 7, 6.5, 5.5, a); P.ell(20, 7, 6.5, 5.5, a); P.ell(9.5, 14, 4.5, 3.5, b); P.ell(18.5, 14, 4.5, 3.5, b); P.ell(7, 6, 1.6, 1.6, P.flat(0xffffff)); P.ell(21, 6, 1.6, 1.6, P.flat(0xffffff)); }
    else { P.ell(11, 7, 3, 6, a); P.ell(17, 7, 3, 6, a); P.ell(12, 14, 2.4, 3.2, b); P.ell(16, 14, 2.4, 3.2, b); }
    P.line(14, 4, 14, 18, 2, 0x3a2a4a);
    P.line(13, 4, 11, 0, 1, P.flat(INK)); P.line(15, 4, 17, 0, 1, P.flat(INK));
  }],
  bird: [36, 18, (P, c, f) => {
    const body = c.body ?? 0xf4f6ff, wing = c.wing ?? 0xc8d0e8;
    P.poly([[11, 9], [3, 6], [4, 12], [12, 12]], wing);
    P.ell(18, 11, 8.5, 3.8, body);
    P.ell(26, 9, 4, 3.4, c.head ?? body);
    P.poly([[29.5, 8], [34.5, 9.5], [29.5, 11]], c.beak ?? 0xffb020);
    P.dot(27, 8, P.flat(INK));
    if (!f) P.poly([[13, 10], [8, 0], [17, 3], [23, 10]], wing);
    else P.poly([[13, 11], [10, 18], [19, 15], [23, 11]], wing);
  }],
  bat: [36, 18, (P, c, f) => {
    const m = 0x5a3a7a, b = 0x3a2a4a;
    if (!f) { P.poly([[16, 8], [2, 1], [5, 7], [1, 9], [7, 12], [16, 11]], m); P.poly([[20, 8], [34, 1], [31, 7], [35, 9], [29, 12], [20, 11]], m); }
    else { P.poly([[16, 8], [4, 16], [8, 12], [6, 10], [16, 11]], m); P.poly([[20, 8], [32, 16], [28, 12], [30, 10], [20, 11]], m); }
    P.ell(18, 10, 3.5, 4.5, b); P.poly([[15.5, 7], [16, 3], [18, 6]], b); P.poly([[20.5, 7], [20, 3], [18, 6]], b);
    P.dot(17, 9, P.flat(0xffd23f)); P.dot(19, 9, P.flat(0xffd23f));
  }],
  bun: [40, 32, (P, c, f) => {
    const fur = c.fur ?? 0xf4f0f8, shade2 = c.belly ?? 0xffffff;
    if (!f) {
      P.ell(4.5, 20, 3.6, 3.6, shade2);
      P.ell(16, 22, 12, 9, fur); P.ell(25, 28, 6, 2.6, fur);
      P.ell(30, 15, 7, 6.5, fur); P.ell(27, 5.5, 2.4, 6.5, fur); P.ell(32.5, 5, 2.4, 6.5, fur);
      P.ell(32.5, 5.5, 1, 4.5, P.flat(0xffb0cc)); P.dot(33, 13, P.flat(INK)); P.dot(36, 16, P.flat(0xff6fb8));
    } else {
      P.ell(4, 15, 3.4, 3.4, shade2);
      P.ell(18, 17, 13, 7.5, fur); P.line(7, 21, 1, 29, 3.5, fur); P.line(27, 21, 33, 29, 3, fur);
      P.ell(32, 11, 7, 6, fur); P.ell(28, 3, 2.4, 5.5, fur); P.ell(33.5, 2.5, 2.4, 5.5, fur);
      P.dot(35, 9, P.flat(INK)); P.dot(38, 12, P.flat(0xff6fb8));
    }
  }],
  man: [28, 56, (P, c, f) => {
    const shirt = c.shirt ?? 0xf23a4a, jeans = c.jeans ?? 0x3a5ab8, hair = c.hair ?? 0x6a3a1e, skin = c.skin ?? G.skin;
    P.rect(9, 38, 4, 15, jeans); P.rect(15, 38, 4, 15, jeans);
    P.ell(10.5, 53.5, 3.6, 2, 0x2a2a3a); P.ell(17.5, 53.5, 3.6, 2, 0x2a2a3a);
    P.line(7, 24, 5, 36, 3.2, shirt); P.ell(5, 38, 2, 2, skin);
    if (!f) { P.line(21, 24, 23, 36, 3.2, shirt); P.ell(23, 38, 2, 2, skin); } else { P.line(21, 24, 25, 12, 3.2, shirt); P.ell(25.5, 10, 2.2, 2.2, skin); }
    P.poly([[7, 22], [21, 22], [20, 40], [8, 40]], shirt);
    P.ell(14, 14, 6.5, 7, skin);
    P.ell(14, 10, 7, 5, hair, (x, y) => y <= 11); P.rect(7, 9, 2, 6, P.R(hair));
    P.dot(12, 14, P.flat(INK)); P.dot(16, 14, P.flat(INK)); P.rect(13, 18, 3, 1, P.flat(0x8a3a3a));
  }],
  penguin: [28, 38, (P) => {
    P.ell(14, 21, 10, 14.5, 0x2e2e4a); P.ell(15, 23, 6.5, 11, 0xf4f6ff);
    P.ell(5, 22, 2.5, 7, 0x2e2e4a); P.ell(23.5, 22, 2.5, 7, 0x2e2e4a);
    P.poly([[16, 11], [22, 13], [16, 15]], 0xffa020); P.dot(15, 10, P.flat(INK));
    P.ell(10, 36, 4, 1.8, 0xffa020); P.ell(18, 36, 4, 1.8, 0xffa020);
  }],
  crab: [36, 22, (P, c, f) => {
    const r = 0xf04a3a, y = f ? 4 : 8;
    for (const s of [-1, 1]) { for (let k = 0; k < 3; k++) P.line(18 + s * (5 + k * 3), 15, 18 + s * (9 + k * 3), 21, 1.6, r); P.line(18 + s * 7, 12, 18 + s * 12, y + 3, 2.4, r); P.ell(18 + s * 13, y, 4.2, 3.6, r); }
    P.ell(18, 13, 10, 6, r);
    P.line(15, 8, 15, 4, 1, P.flat(INK)); P.line(21, 8, 21, 4, 1, P.flat(INK)); P.dot(15, 3, P.flat(0xffffff)); P.dot(21, 3, P.flat(0xffffff));
  }],
  cactus: [32, 40, (P) => {
    const g = 0x3a9a4a;
    P.ell(16, 21, 6, 19, g, (x, y) => y < 39); P.rect(10, 30, 12, 9, P.R(g));
    P.line(10, 22, 6, 22, 5, g); P.ell(6, 15, 3.4, 8, g); P.line(22, 18, 26, 18, 5, g); P.ell(26, 12, 3.2, 7, g);
    for (const [x, y] of [[14, 8], [18, 14], [13, 22], [18, 30], [6, 12], [26, 9]]) P.dot(x, y, P.flat(0xe8ffc0));
    P.ell(16, 2.5, 3, 2.5, 0xff6fb8);
  }],
  cloud: [96, 32, (P) => {
    for (const [x, y, rx, ry] of [[30, 14, 14, 12], [50, 11, 17, 11], [70, 15, 13, 10], [14, 22, 12, 8], [84, 22, 11, 8], [44, 24, 30, 7.5]]) P.ell(x, y, rx, ry, 0xffffff);
  }],
};
export const VARIANTS = {
  daisy: ['daisy', {}], daisyPink: ['daisy', { petal: 0xff9ac8 }], tulip: ['tulip', {}], tulipRed: ['tulip', { petal: 0xf23a4a }], tulipBlue: ['tulip', { petal: 0x7ac4ff }],
  rose: ['rose', {}], bush: ['bush', { berry: 0xf23a4a }], bushDark: ['bush', { leaf: 0x3e5a46, berry: 0x9a7aff }], candyBush: ['bush', { leaf: 0xff9ac8, berry: 0x7af0c8 }],
  mushroom: ['mushroom', {}], shroomBlue: ['mushroom', { cap: 0x7a5aff }], penguin: ['penguin', {}], cactus: ['cactus', {}], cloud: ['cloud', {}],
  fly: ['fly', {}], flyBlue: ['fly', { wing: 0x7ae8ff }], flyYellow: ['fly', { wing: 0xffd84a }],
  bird: ['bird', {}], birdDark: ['bird', { body: 0x6a7090, wing: 0x4e5470, head: 0x6a7090 }], parrot: ['bird', { body: 0xf23a4a, wing: 0x2b8cf2, head: 0xffd23f, beak: 0x3a3a4a }],
  bat: ['bat', {}], bun: ['bun', {}], bunBrown: ['bun', { fur: 0xc89060, belly: 0xf4e8d8 }], crab: ['crab', {}],
  manRed: ['man', {}], manBlue: ['man', { shirt: 0x29b6f6, hair: 0xffc83a }], manLab: ['man', { shirt: 0xf4f8ff, hair: 0x2a2a3a, jeans: 0x4e5878 }],
  manPink: ['man', { shirt: 0xff4fa3, hair: 0xa0602e, skin: 0xc88a6a }],
};
const ANIM = new Set(['fly', 'bird', 'bat', 'bun', 'man', 'crab']);

/** Sign: wooden plank with a short word (3x5 font at 3x) on a post. */
function signSprite(word) {
  const tw = textW(word, 3), W = tw + 12, H = 44;
  const P = painter(W, H);
  P.rect(Math.floor(W / 2) - 2, 20, 5, 24, G.woodD);
  P.rect(0, 0, W, 25, G.wood);
  P.rect(3, 3, W - 6, 19, P.flat(0xf4e8cc));
  P.text(word, 6, 5, 3, P.flat(0x3a2418));
  return shade(P);
}

/** All sprite frames: name -> shaded { w, h, px }, plus k (px per caller unit). */
export function buildSprites(extraSigns = []) {
  const out = {};
  for (const [name, [src, c]] of Object.entries(VARIANTS)) {
    const [w, h, draw] = DEFS[src];
    const frames = ANIM.has(src) ? [0, 1] : [null];
    for (const f of frames) {
      const P = painter(w, h);
      draw(P, c, f ?? 0);
      out[name + (f === null ? '' : f ? 'B' : 'A')] = shade(P, src === 'cloud' ? { ink: 0x8a9ac8, rim: false, litOutline: false } : {});
    }
  }
  for (const w of ['LAB', 'FANS', 'SWEET', 'GO', 'BOO', 'KEEP OUT', 'COLD', 'BEACH', 'SALE', 'DIG', 'HOT', ...extraSigns]) out['sign:' + w] = signSprite(w);
  return out;
}

// ------------------------------------------------------------------ poster art (shaded objects blitted onto posters)
const ART = {
  bar(P) { // chocolate bar half out of its wrapper
    P.poly([[2, 4], [30, 2], [32, 26], [4, 28]], 0xff2e88);
    P.rect(8, 10, 16, 10, P.flat(0xffd23f)); P.text('BEAST', 9, 12, 1, P.flat(0x6a1a3a));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) P.rect(31 + i * 7, 5 + j * 10, 6, 9, 0x7a4024);
  },
  tv(P) {
    P.line(10, 1, 15, 7, 1.5, 0x8a92b0); P.line(24, 1, 19, 7, 1.5, 0x8a92b0);
    P.rect(1, 7, 32, 24, 0x6a7290); P.rect(4, 10, 22, 18, P.flat(0x1a2a5a));
    P.ell(15, 22, 6, 4, 0x7cff3a); P.ell(12, 16, 3, 3, 0x7cff3a); P.ell(18, 15, 3, 3.2, 0x7cff3a);
    P.dot(11, 16, P.flat(INK)); P.dot(18, 15, P.flat(INK));
    P.ell(29.5, 13, 1.5, 1.5, 0xf23a4a); P.ell(29.5, 19, 1.5, 1.5, 0xffd23f);
  },
  flask(P) {
    P.rect(11, 0, 10, 3, 0xb4bfd8);
    P.poly([[12, 2], [20, 2], [20, 12], [30, 30], [2, 30], [12, 12]], 0xd8f4ff);
    P.poly([[8, 19], [24, 19], [29, 29], [3, 29]], 0x7cff3a);
    P.ell(12, 24, 2, 2, 0xd8ffb0); P.ell(19, 22, 1.5, 1.5, 0xd8ffb0);
  },
  burger(P) {
    P.ell(16, 9, 15, 8.5, 0xe8a040, (x, y) => y <= 11);
    for (const [x, y] of [[9, 5], [15, 3], [21, 6], [12, 8]]) P.ell(x, y, 1.2, 0.8, P.flat(0xfff2d0));
    P.poly([[0, 11], [32, 11], [29, 15], [24, 13], [18, 16], [12, 13], [6, 16], [2, 13]], 0x6ad04a);
    P.rect(1, 14, 30, 3, 0xffd23f);
    P.rect(1, 17, 30, 5, 0x7a4024);
    P.ell(16, 24, 15, 4.5, 0xe8a040, (x, y) => y >= 22);
  },
  cash(P) {
    for (let i = 0; i < 4; i++) P.rect(2 + i * 2, 20 - i * 6, 28, 6, 0x5ad05a);
    P.ell(20, 9, 2.5, 2.5, P.flat(0x2e7a36));
    P.ell(36, 22, 7, 7, 0xffc21a); P.text('$', 34, 18, 1, P.flat(0x9a5410));
  },
  bug(P) { // swarm critter silhouette on a warning sign
    P.poly([[16, 0], [32, 28], [0, 28]], 0xffd23f);
    P.ell(16, 18, 5, 4.5, 0x2a2a3a); P.ell(16, 12, 3, 2.6, 0x2a2a3a);
    for (const s of [-1, 1]) { P.line(16 + s * 3, 17, 16 + s * 9, 13, 1.2, P.flat(INK)); P.line(16 + s * 3, 20, 16 + s * 9, 24, 1.2, P.flat(INK)); }
    P.dot(15, 12, P.flat(0xf23a4a)); P.dot(17, 12, P.flat(0xf23a4a));
  },
  cart(P) {
    P.line(0, 2, 6, 2, 2, 0x8a92b0);
    P.poly([[5, 4], [30, 6], [27, 18], [9, 18]], 0xd8dcec);
    for (let x = 10; x < 28; x += 4) P.line(x, 7, x - 1, 17, 1, P.flat(0x8a92b0));
    P.ell(11, 22, 2.6, 2.6, 0x3a3a4a); P.ell(25, 22, 2.6, 2.6, 0x3a3a4a);
  },
};
export function posterArt(name, w = 40, h = 32) {
  const P = painter(w, h);
  ART[name](P);
  return shade(P);
}
