// QUEST BOARD pixel art (ui/home/questBoard.js + the home quest tracker in ui/guide.js).
//
// Everything is painted procedurally, texel by texel, at ONE CSS PIXEL PER TEXEL (twice as fine as
// the rest of the UI's --px grid, the same grain as the HD icons), seeded so it looks the same every
// time, shown with nearest-neighbour scaling (crisp on 2x / 3x screens) and cached:
//
//   paintScene(W, H, rects)   the lab wall behind the board: glazed tiles with grout, chips and grime,
//                             a copper pipe, a pendant lamp (warm glow + light cone) and a shelf with
//                             beakers, a test-tube rack and a coffee mug, placed in the free wall space
//                             around the header (rects = measured layout). Returns { canvas, lampX }.
//   paintFrame(W, H, o)       the walnut frame: grain along each rail, knots, rolled outer edge, groove,
//                             inner bevel, mitred corners, brass corner brackets + screws, nails, dents
//                             and scratches, a cast shadow on the wall, sticky notes stuck on the
//                             corners and (o.ledge) a tray with a marker, an eraser and loose pins.
//   paintLight(W, H, lampX)   warm lamp light pooling on the cork + vignette + the frame's inner
//                             shadow, ordered-dithered in 2 px cells (lays over the notes too).
//   paperCanvas(kind, w, h)   a note's paper at its exact size: fibre texture, top-lit shading, soft
//                             dithered drop shadow, and per kind: tri-fold creases + dog-ear (letter),
//                             curled sticky note, index card, torn notebook page, zig-zag receipt,
//                             kraft, manila folder with peeking sheets, case file, clipboard.
//   questArt(key)             the illustration on each note (house icon shader, 40-unit grid, HD 2).
//   tallyURL(done, total)     hand-drawn tally marks / a pen check box.
//   drawString(...)           red yarn between pins.
//   ensureBoardArt()          sprites as CSS custom properties (--qb-*): cork tile, pins, tape, stamp
//                             ink, polaroid + speech bubbles, paper clip, tabs, counter plates, coffee
//                             rings, doodle scraps, the "!" sticker.
import { PixCanvas, renderPixArt, ICON_COLORS as C } from '../icons.js';

// ============================================================================ colour, noise, dither

const CC = new Map();
/** '#rrggbb' -> [r, g, b] (cached). */
const cl = (hex) => {
  let v = CC.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; CC.set(hex, v); }
  return v;
};
const lerp = (a, b, t) => a + (b - a) * t;
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scaleC = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Value noise; wraps every px / py cells when given (tileable). */
function vnoise(x, y, s = 0, px = 0, py = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  let x0 = xi, x1 = xi + 1, y0 = yi, y1 = yi + 1;
  if (px) { x0 = ((x0 % px) + px) % px; x1 = ((x1 % px) + px) % px; }
  if (py) { y0 = ((y0 % py) + py) % py; y1 = ((y1 % py) + py) % py; }
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s = 0, oct = 3, px = 0, py = 0) {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { a += amp * vnoise(x * f, y * f, s + o * 31, px * f, py * f); n += amp; amp *= 0.5; f *= 2; }
  return a / n;
}
let NZ = null;
/**
 * Tileable noise textures, built once (per-pixel value noise is too slow for whole notes):
 * big = soft mottling (~32 px blobs, 256 x 256), fib = paper fibre streaks (256 x 256),
 * grain = wood grain flow along a rail (512 x 64).
 */
function noiseTex() {
  if (NZ) return NZ;
  const N = 256, big = new Float32Array(N * N), fib = new Float32Array(N * N), grain = new Float32Array(512 * 64);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    big[y * N + x] = fbm((x / N) * 8, (y / N) * 8, 5, 2, 8, 8);
    fib[y * N + x] = vnoise((x / N) * 43, (y / N) * 213, 9, 43, 213);
  }
  for (let y = 0; y < 64; y++) for (let x = 0; x < 512; x++) grain[y * 512 + x] = fbm((x / 512) * 6, (y / 64) * 6, 13, 3, 6, 6);
  NZ = { big, fib, grain };
  return NZ;
}
const nzB = (x, y) => NZ.big[((y & 255) << 8) | (x & 255)];
const nzF = (x, y) => NZ.fib[((y & 255) << 8) | (x & 255)];
const nzG = (u, v) => NZ.grain[((v & 63) << 9) | (u & 511)];

const BAY = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
/** 8x8 ordered-dither threshold in (0, 1). */
const bay = (x, y) => (BAY[((y & 7) << 3) | (x & 7)] + 0.5) / 64;
/** Quantise v (0..1) to `n` steps with ordered dithering at (x, y). */
const dq = (v, x, y, n) => Math.floor(clamp01(v) * n + bay(x, y)) / n;
/** Pick from a ramp (array of colours) with ordered dithering between neighbours. */
const rampAt = (R, v, x, y) => R[Math.max(0, Math.min(R.length - 1, Math.floor(clamp01(v) * (R.length - 1) + bay(x, y))))];
const ramp = (...hexes) => hexes.map(cl);

// ============================================================================ the painter

/** RGBA buffer with alpha-over drawing; .canvas() hands back a <canvas>. */
class Px {
  constructor(w, h) {
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    this.d = new Uint8ClampedArray(this.w * this.h * 4);
  }
  put(x, y, c, a = 1) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0 || !c) return;
    const D = this.d, i = (y * this.w + x) * 4;
    if (a >= 1 || D[i + 3] === 0) { D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = Math.min(255, a * 255); return; }
    const da = D[i + 3] / 255, oa = a + da * (1 - a);
    D[i] = (c[0] * a + D[i] * da * (1 - a)) / oa;
    D[i + 1] = (c[1] * a + D[i + 1] * da * (1 - a)) / oa;
    D[i + 2] = (c[2] * a + D[i + 2] * da * (1 - a)) / oa;
    D[i + 3] = oa * 255;
  }
  /** Darken / lighten what's there (k < 1 darkens). */
  tint(x, y, k, warm = null, wa = 0) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const D = this.d, i = (y * this.w + x) * 4;
    if (!D[i + 3]) return;
    D[i] *= k; D[i + 1] *= k; D[i + 2] *= k;
    if (warm) { D[i] = lerp(D[i], warm[0], wa); D[i + 1] = lerp(D[i + 1], warm[1], wa); D[i + 2] = lerp(D[i + 2], warm[2], wa); }
  }
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  clear(x, y) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[(y * this.w + x) * 4 + 3] = 0; }
  rect(x, y, w, h, c, a = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c, a); return this; }
  hl(x0, x1, y, c, a = 1) { for (let x = x0; x <= x1; x++) this.put(x, y, c, a); return this; }
  vl(x, y0, y1, c, a = 1) { for (let y = y0; y <= y1; y++) this.put(x, y, c, a); return this; }
  line(x0, y0, x1, y1, c, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 4000; n++) {
      this.put(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  poly(pts, c, a = 1) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const X = x + 0.5, Y = y + 0.5;
      let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) this.put(x, y, typeof c === 'function' ? c(x, y) : c, a);
    }
    return this;
  }
  /** Filled ellipse; c may be fn(x, y, nx, ny) -> colour (nx, ny = position on the unit disc). */
  ell(cx, cy, rx, ry, c, a = 1) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      this.put(x, y, typeof c === 'function' ? c(x, y, nx, ny) : c, a);
    }
    return this;
  }
  canvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return c;
  }
  url() { return this.canvas().toDataURL(); }
}

/** Lit-sphere shading for a blob (dome, bead, pin head): picks from ramp R by N.L with dithering. */
const LIGHT = (() => { const v = [-0.45, -0.62, 0.64]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
function domeShade(R, spec = 0.92) {
  return (x, y, nx, ny) => {
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    const v = 0.18 + 0.82 * Math.max(0, d);
    if (d > spec) return cl('#ffffff');
    return rampAt(R, v, x, y);
  };
}

/** Separable box blur of a Float32 mask (w x h), radius r, n passes (~gaussian). */
function blur(m, w, h, r, passes = 2) {
  let a = m, b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) s += a[row + Math.max(0, Math.min(w - 1, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = s / (2 * r + 1);
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += b[Math.max(0, Math.min(h - 1, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / (2 * r + 1);
        s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

/**
 * Drop shadow of an alpha mask: offset (dx, dy), soft radius r, dithered in steps, painted UNDER what's
 * there. box = [x0, y0, x1, y1] limits the work to that window (the mask's shape plus its blur).
 */
function dropShadow(P, mask, dx, dy, r, strength = 0.5, col = cl('#1e0e04'), box = null) {
  const { w, h } = P;
  const [bx0, by0, bx1, by1] = box ? [Math.max(0, box[0]), Math.max(0, box[1]), Math.min(w, box[2]), Math.min(h, box[3])] : [0, 0, w, h];
  const bw = bx1 - bx0, bh = by1 - by0;
  if (bw <= 0 || bh <= 0) return;
  const s = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const sx = x + bx0 - dx, sy = y + by0 - dy;
    if (sx >= 0 && sy >= 0 && sx < w && sy < h) s[y * bw + x] = mask[sy * w + sx];
  }
  const b = blur(s, bw, bh, r);
  const D = P.d;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const X = x + bx0, Y = y + by0, i = Y * w + X;
    if (mask[i] > 0.5) continue;
    const v = dq(b[y * bw + x] * strength, X, Y, 10);
    if (v <= 0) continue;
    const k = i * 4, da = D[k + 3] / 255;
    if (da >= 1) continue;
    const oa = da + v * (1 - da);
    D[k] = (D[k] * da + col[0] * v * (1 - da)) / oa;
    D[k + 1] = (D[k + 1] * da + col[1] * v * (1 - da)) / oa;
    D[k + 2] = (D[k + 2] * da + col[2] * v * (1 - da)) / oa;
    D[k + 3] = oa * 255;
  }
}

// ============================================================================ cache

// big paintings (wall, frame, light: a few MB each) keep only the last few sizes; papers a page or
// two's worth; the small stuff (illustrations, tallies) stays
const CAPS = { scene: 4, frame: 4, light: 4, paper: 40 };
const caches = new Map();
const cached = (key, fn) => {
  const kind = key.slice(0, key.indexOf('|'));
  let c = caches.get(kind);
  if (!c) caches.set(kind, (c = new Map()));
  let v = c.get(key);
  if (v === undefined) {
    v = fn();
    c.set(key, v);
    if (c.size > (CAPS[kind] ?? 400)) c.delete(c.keys().next().value);
  } else { c.delete(key); c.set(key, v); } // most recently used last
  return v;
};
/** A fresh <canvas> showing a cached painting (DOM nodes can't be shared). */
export function cloneCanvas(src, cls = '') {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  if (cls) c.className = cls;
  return c;
}

// ============================================================================ palettes

const WOOD = ramp('#1e0e05', '#2e170a', '#42220e', '#583014', '#6c3d1a', '#824b22', '#9a5d2c', '#b47439', '#cf8f4c', '#e8ae66');
const BRASS = ramp('#3a2204', '#6a420c', '#9c6a16', '#c8962a', '#e8bf48', '#fde27a', '#fff6c8');
const STEEL = ramp('#1e2236', '#3a4058', '#5c6480', '#828aa6', '#a8b0c8', '#ced4e4', '#f0f4fc');
const COPPER = ramp('#2e1206', '#5a2410', '#8a3c18', '#b45a26', '#d47a3a', '#eca060', '#ffd09a');
const TILE = ramp('#0c1230', '#121a42', '#17214f', '#1c285c', '#223068', '#2a3a78', '#36488c');
const WARM = cl('#ffd28a');

// ============================================================================ CORK (tile)

/**
 * Tileable cork, T x T texels: granules (cellular, each with its own tone, lit from the top-left
 * with a dark seam), pores, old pin holes, a few staples. One texel = 1 CSS px.
 */
function corkTile(T = 256) {
  const P = new Px(T, T);
  const R = rng(4417);
  const TONES = ramp('#7c4a22', '#8c5629', '#9a6131', '#a66b38', '#b2763f', '#bc8048', '#c88c52', '#d49a5e');
  // granule seeds on a periodic grid (jittered), ~4-6 px across
  const G = 5, n = Math.round(T / 5);
  const seeds = [];
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const k = 1 + (R() < 0.35 ? 1 : 0);
    for (let j = 0; j < k; j++) {
      const big = fbm((gx * G) / T * 4, (gy * G) / T * 4, 9, 2, 4, 4);
      seeds.push({ x: (gx + R()) * G, y: (gy + R()) * G, t: clamp01(R() * 0.75 + big * 0.5 - 0.1), gx, gy });
    }
  }
  const grid = Array.from({ length: n * n }, () => []);
  for (const s of seeds) grid[(s.gy % n) * n + (s.gx % n)].push(s);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    let d1 = 1e9, d2 = 1e9, best = null, bdx = 0, bdy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cy = gy + j;
      const cell = grid[(((cy % n) + n) % n) * n + (((cx % n) + n) % n)];
      for (const s of cell) {
        // wrap the seed next to this cell
        const sx = s.x + (cx - (((cx % n) + n) % n)) * G, sy = s.y + (cy - (((cy % n) + n) % n)) * G;
        const dx = x + 0.5 - sx, dy = y + 0.5 - sy, d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; best = s; bdx = dx; bdy = dy; } else if (d < d2) d2 = d;
      }
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    // granule lit from the top-left: texels on its upper-left side lighter, lower-right darker
    const lit = -(bdx * 0.55 + bdy * 0.8) / 4;
    let v = best.t + lit * 0.22 + (hash(x, y, 3) - 0.5) * 0.12;
    if (edge < 0.9) v -= 0.32;
    else if (edge < 1.6) v -= 0.1;
    const big = fbm(x / T * 3, y / T * 3, 77, 2, 3, 3);
    v += (big - 0.5) * 0.35;
    P.put(x, y, rampAt(TONES, v, x, y));
  }
  // pores: dark pits with a lit lower lip
  for (let k = 0; k < 520; k++) {
    const x = (R() * T) | 0, y = (R() * T) | 0;
    P.put(x, y, cl('#4a2810'));
    if (R() < 0.4) P.put((x + 1) % T, y, cl('#5c3316'));
    P.put(x, (y + 1) % T, cl('#c8925a'), 0.5);
  }
  // old pin holes
  for (let k = 0; k < 5; k++) {
    const x = (R() * (T - 3)) | 0, y = (R() * (T - 3)) | 0;
    P.put(x, y, cl('#2a1406')); P.put(x + 1, y, cl('#3a1e0a')); P.put(x, y + 1, cl('#3a1e0a')); P.put(x + 1, y + 1, cl('#2a1406'));
    P.put(x + 2, y + 1, cl('#e0aa70'), 0.7); P.put(x + 1, y + 2, cl('#e0aa70'), 0.7); P.put(x - 1, y - 1, cl('#5a3214'), 0.5);
  }
  return P.canvas().toDataURL();
}

// ============================================================================ WALL + PROPS

/** Glazed lab tile wall: 24 px pitch, 2 px grout. */
function wallTexel(x, y) {
  const T = 24, G = 2;
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  const lx = x - tx * T, ly = y - ty * T;
  const grime = nzB((x * 0.46) | 0, (y * 0.46) | 0);
  if (lx < G || ly < G) {
    const v = 0.08 + hash(x, y, 1) * 0.12 - grime * 0.06;
    return rampAt(TILE, v, x, y);
  }
  const S = T - G, u = lx - G, v = ly - G;
  const h1 = hash(tx, ty, 2);
  let t = 0.42 + (h1 - 0.5) * 0.16 + (nzB(x * 3 + 77, y * 3 + 31) - 0.5) * 0.08 - (grime - 0.45) * 0.35;
  // glaze bevel: lit top / left rim, shaded bottom / right
  if (v === 0) t += 0.32; else if (v === 1) t += 0.12;
  if (u === 0) t += 0.16;
  if (v === S - 1) t -= 0.26; else if (v === S - 2) t -= 0.08;
  if (u === S - 1) t -= 0.14;
  // gently domed glaze (top half lighter)
  t += (0.5 - v / S) * 0.08;
  // chipped corner
  const chip = hash(tx, ty, 9);
  if (chip < 0.06 && u + v < 4) return rampAt(TILE, 0.1, x, y);
  if (chip < 0.06 && u + v === 4) t += 0.3;
  // hairline crack
  if (hash(tx, ty, 11) < 0.05) {
    const cx = Math.round(S * 0.3 + Math.sin(v * 0.6 + h1 * 9) * 2 + v * 0.35);
    if (u === cx && v > 3) t -= 0.35;
  }
  // a glossy reflection streak on some tiles
  if (hash(tx, ty, 13) < 0.3) { const k = u - v + Math.round(h1 * 6) - 3; if (k >= 2 && k <= 3 && u + v < S + 4) t += 0.22; }
  return rampAt(TILE, t, x, y);
}

/** Copper pipe along y (centre), r = 4, with clamps and couplings. */
function pipe(P, y, x0, x1, R) {
  const rows = [0.0, 0.85, 0.7, 0.55, 0.48, 0.38, 0.26, 0.0];
  for (let x = x0; x <= x1; x++) {
    for (let j = 0; j < 8; j++) {
      const c = j === 0 || j === 7 ? COPPER[0] : rampAt(COPPER, rows[j] + (hash(x, j, 4) - 0.5) * 0.08, x, y + j);
      P.put(x, y - 4 + j, c);
    }
    P.put(x, y + 4, cl('#05081a'), 0.45); P.put(x, y + 5, cl('#05081a'), 0.25);
  }
  // clamps every ~130 px, a coupling between
  for (let cx = x0 + 30 + ((R() * 40) | 0); cx < x1 - 8; cx += 120 + ((R() * 30) | 0)) {
    for (let j = -6; j <= 6; j++) for (let i = 0; i < 6; i++) {
      const e = i === 0 || i === 5 || j === -6 || j === 6;
      P.put(cx + i, y + j, e ? STEEL[0] : rampAt(STEEL, 0.62 - j * 0.04 - i * 0.03, cx + i, y + j));
    }
    P.put(cx + 2, y - 4, STEEL[6]); P.put(cx + 2, y + 4, STEEL[1]);
    // the clamp's wall plate bolt
    P.put(cx + 2, y + 7, STEEL[0]); P.put(cx + 3, y + 7, STEEL[0]);
    const kx = cx + 60;
    if (kx < x1 - 8) for (let j = -5; j <= 5; j++) for (let i = 0; i < 4; i++) {
      const e = i === 0 || i === 3 || j === -5 || j === 5;
      P.put(kx + i, y + j, e ? COPPER[0] : rampAt(COPPER, 0.78 - (j + 5) * 0.06, kx + i, y + j));
    }
  }
}

/** Pendant lamp: cord from the top, enamel shade, glowing bulb. (cx, by) = bulb centre. */
function lamp(P, cx, by) {
  const shadeTop = by - 22;
  // cord + ceiling cap
  for (let y = 0; y < shadeTop - 4; y++) { P.put(cx, y, cl('#0b0b14')); P.put(cx + 1, y, cl('#24243a')); }
  for (let j = 0; j < 5; j++) for (let i = -3; i <= 4; i++) P.put(cx + i, shadeTop - 5 + j, rampAt(STEEL, 0.55 - j * 0.07 - i * 0.03, cx + i, j));
  // enamel shade: a flared dome, dark green outside, a lit rim
  const SH = ramp('#0b2016', '#123424', '#1a4a32', '#226040', '#2e7a52', '#3f9668', '#6cc292');
  for (let j = 0; j <= 18; j++) {
    const t = j / 18, half = 5 + Math.pow(t, 1.7) * 17;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + 1 + half); x++) {
      const u = (x - cx) / half;
      const edge = Math.abs(x - cx - 0.5) >= half - 0.5 || j === 0;
      let v = 0.62 - u * 0.35 - t * 0.12;
      if (u < -0.35 && u > -0.65) v += 0.25; // a long highlight down the left side
      P.put(x, shadeTop + j, edge ? SH[0] : rampAt(SH, v, x, j));
    }
  }
  // rim + the white enamel inside, lit by the bulb
  for (let x = cx - 22; x <= cx + 23; x++) { P.put(x, shadeTop + 19, cl('#e8e2c8')); P.put(x, shadeTop + 20, cl('#0b2016')); }
  P.ell(cx + 0.5, by - 1, 6.5, 4.5, domeShade(ramp('#e8b040', '#ffd870', '#fff0b0', '#fffbe8'), 0.85));
}

/** Warm glow around a point on the wall (additive-looking, dithered in 2 px cells). */
function glow(P, cx, cy, r, k = 0.55) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(P.w - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(P.h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, (y - cy) * 1.15) / r;
    if (d >= 1) continue;
    const v = dq(Math.pow(1 - d, 2.2) * k, x, y, 24);
    if (v > 0) P.put(x, y, WARM, v);
  }
}

/** A wooden shelf on two brackets: a coffee mug, a beaker, a flask, a test-tube rack (what fits). */
function shelf(P, x0, y, w) {
  for (const bx of [x0 + 8, x0 + w - 12]) {
    for (let j = 0; j < 10; j++) for (let i = 0; i < 4; i++) P.put(bx + i, y + 6 + j, i === 0 || i === 3 ? STEEL[1] : rampAt(STEEL, 0.6 - j * 0.03, bx + i, j));
    for (let k = 0; k < 8; k++) P.put(bx + 3 - Math.floor(k / 2), y + 8 + k, STEEL[2]);
  }
  const beaker = (bx) => {
    const bw = 13, bh = 22;
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const edge = i === 0 || i === bw - 1 || j === bh - 1;
      const liquid = j > 8;
      const c = edge ? cl('#9fd4f0') : liquid ? rampAt(ramp('#0e7a7a', '#18a8a0', '#3ff2e0', '#a8fff4'), 0.55 - i / bw * 0.3 + (j === 9 ? 0.5 : 0), bx + i, j) : cl('#cfeeff');
      P.put(bx + i, y - bh + j, c, edge ? 1 : liquid ? 0.92 : 0.28);
    }
    P.put(bx - 1, y - bh, cl('#9fd4f0')); P.put(bx + bw, y - bh, cl('#9fd4f0'));
    for (let k = 0; k < 4; k++) P.hl(bx + 1, bx + 3, y - bh + 5 + k * 4, cl('#ffffff'), 0.8);
    P.vl(bx + 2, y - bh + 2, y - 3, cl('#ffffff'), 0.55);
    for (const [bx2, by2] of [[bx + 7, y - 10], [bx + 9, y - 14], [bx + 5, y - 6]]) P.put(bx2, by2, cl('#e8fffc'));
  };
  const flask = (fx) => {
    const H = 20, cx = fx + 9;
    for (let j = 0; j < H; j++) {
      const half = j < 6 ? 2.5 : 2.5 + (j - 6) * 0.62;
      for (let i = Math.floor(cx - half); i <= Math.ceil(cx + half); i++) {
        const edge = Math.abs(i - cx) >= half - 0.5 || j === H - 1;
        const liquid = j >= 11;
        const c = edge ? cl('#b8a8e0') : liquid ? rampAt(ramp('#9a1060', '#d02a88', '#ff5ab4', '#ffb0dc'), 0.6 - (i - cx) / 14 + (j === 11 ? 0.4 : 0), i, j) : cl('#e8e0ff');
        P.put(i, y - H + j, c, edge ? 1 : liquid ? 0.95 : 0.25);
      }
    }
    P.hl(fx + 5, fx + 13, y - H, cl('#b8a8e0'));
    P.vl(fx + 6, y - 10, y - 4, cl('#ffffff'), 0.6);
    for (const [i, j] of [[0, 0], [1, -1], [1, -2], [0, -3], [-1, -4], [0, -5]]) P.put(cx + i, y - H - 3 + j, cl('#ffe8f6'), 0.55);
  };
  const rack = (rx) => {
    [['#3ec43a', '#a8f07a'], ['#ffc21a', '#fff0a0'], ['#a35cff', '#d4aaff']].forEach(([c1, c2], k) => {
      const tx = rx + 3 + k * 7;
      for (let j = 0; j < 18; j++) for (let i = 0; i < 4; i++) {
        if (j === 17 && (i === 0 || i === 3)) continue;
        const edge = i === 0 || i === 3 || j === 17;
        const liquid = j > 7 + k * 2;
        P.put(tx + i, y - 19 + j, edge ? cl('#b8c8e8') : liquid ? (i === 1 ? cl(c2) : cl(c1)) : cl('#e8f4ff'), edge || liquid ? 1 : 0.3);
      }
    });
    for (let j = 0; j < 4; j++) for (let i = 0; i < 24; i++) P.put(rx + i, y - 9 + j, i === 0 || i === 23 || j === 0 ? WOOD[2] : rampAt(WOOD, 0.62 - j * 0.1, rx + i, j));
    for (let j = 0; j < 9; j++) { P.put(rx + 1, y - 8 + j, WOOD[4]); P.put(rx + 22, y - 8 + j, WOOD[3]); }
  };
  const mug = (mx) => {
    const mw = 14, mh = 14, rim = cl('#6a6478');
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
      const edge = i === 0 || i === mw - 1 || j === mh - 1;
      const band = j >= 5 && j <= 7;
      const v = 0.75 - i / mw * 0.45;
      P.put(mx + i, y - mh + j, edge ? rim : band ? rampAt(ramp('#7a0c18', '#c81e2a', '#f04a50', '#ff8a8a'), v, mx + i, j) : rampAt(ramp('#8a8698', '#c8c4d4', '#f2f0f8', '#ffffff'), v, mx + i, j));
    }
    P.hl(mx + 1, mx + mw - 2, y - mh, cl('#3a1a08'));
    P.hl(mx + 2, mx + mw - 3, y - mh + 1, cl('#5a2a10'));
    for (let j = 0; j < 7; j++) P.put(mx + mw + (j > 0 && j < 6 ? 3 : 2), y - mh + 3 + j, rim);
    for (const [i, j] of [[0, 3], [1, 3], [0, 9], [1, 9]]) P.put(mx + mw + i, y - mh + j, rim);
    for (const [ox, ph] of [[4, 0], [9, 2]]) for (let j = 0; j < 9; j++) P.put(mx + ox + Math.round(Math.sin((j + ph) * 0.8) * 1.5), y - mh - 3 - j, cl('#e8ecff'), 0.5 - j * 0.04);
  };
  // left to right; the rack goes first when space runs out, then the flask
  const all = [['beaker', 19, beaker], ['flask', 24, flask], ['rack', 30, rack], ['mug', 22, mug]];
  let room = w - 10;
  const keep = new Set(['mug', 'beaker', 'flask', 'rack'].filter((k) => { const it = all.find((a) => a[0] === k); if (it[1] <= room) { room -= it[1]; return true; } return false; }));
  let x = x0 + 6;
  for (const [k, wd, fn] of all) if (keep.has(k)) { fn(x); x += wd; }
  for (let j = 0; j < 6; j++) for (let i = 0; i < w; i++) {
    const e = j === 0 || j === 5 || i === 0 || i === w - 1;
    const v = j === 1 ? 0.85 : 0.55 - j * 0.06 + (fbm(i / 14, j / 2, 61, 2) - 0.5) * 0.3;
    P.put(x0 + i, y + j, e ? WOOD[1] : rampAt(WOOD, v, x0 + i, j));
  }
  for (let i = 0; i < w; i++) { P.put(x0 + i, y + 6, cl('#05081a'), 0.5); P.put(x0 + i, y + 7, cl('#05081a'), 0.25); }
}

/** The header's name plank, nailed to the wall (painted at its exact size, with its shadow). */
function plankAt(P, x0, y0, w, h) {
  const ins = (x, y) => { const r = 4, cx = Math.max(r, Math.min(w - 1 - r, x)), cy = Math.max(r, Math.min(h - 1 - r, y)); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5; };
  // shadow on the wall first (the wall is opaque, so paint it as a tint)
  const sh = new Px(w + 16, h + 16);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ins(x, y)) sh.d[((y + 8) * sh.w + x + 8) * 4 + 3] = 255;
  const m2 = new Float32Array(sh.w * sh.h);
  for (let i = 0; i < m2.length; i++) m2[i] = sh.d[i * 4 + 3] / 255;
  const bl = blur(new Float32Array(m2.map((v, i) => { const x = i % sh.w, y = (i / sh.w) | 0; const sx = x - 2, sy = y - 4; return sx >= 0 && sy >= 0 && sx < sh.w && sy < sh.h ? m2[sy * sh.w + sx] : 0; })), sh.w, sh.h, 3);
  for (let y = 0; y < sh.h; y++) for (let x = 0; x < sh.w; x++) {
    const v = dq(bl[y * sh.w + x] * 0.6, x, y, 10);
    if (v > 0) P.tint(x0 + x - 8, y0 + y - 8, 1 - v);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!ins(x, y)) continue;
    const ed = Math.min(x, y, w - 1 - x, h - 1 - y);
    const gg = y * 0.55 + nzG(x + 40, y * 2 + 3) * 6;
    const ring = gg - Math.floor(gg);
    let v = 0.66 + (ring < 0.16 ? -0.2 : ring < 0.24 ? -0.07 : 0) + (hash(x, y, 3) - 0.5) * 0.08 - (y / h) * 0.24;
    if (!ins(x, y - 1) || !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y + 1)) v = 0;
    else if (!ins(x, y - 2)) v = 0.95;
    else if (!ins(x, y + 2)) v = 0.22;
    else if (ed <= 3 && hash(x, y, 9) < 0.35) v -= 0.2; // scorched edge
    P.put(x0 + x, y0 + y, rampAt(WOOD, v, x0 + x, y0 + y));
  }
  // a crack along the grain + two nails
  const cy = Math.round(h * 0.7);
  for (let x = Math.round(w * 0.62); x < Math.round(w * 0.86); x++) P.put(x0 + x, y0 + cy + (x % 7 < 3 ? 0 : 1), WOOD[1], 0.8);
  for (const nx of [7, w - 8]) {
    P.ell(x0 + nx + 0.5, y0 + h / 2, 2.6, 2.6, domeShade(ramp('#20222e', '#3a3e52', '#5a6078', '#8a92aa', '#c4cade')));
    P.put(x0 + nx + 2, y0 + Math.round(h / 2) + 2, WOOD[1], 0.6);
  }
}

/**
 * The lab wall behind the board, W x H (CSS px), with props placed in the free wall space.
 * rects (relative to the board root): { head: [{x,y,w,h}...] (header controls), frame }.
 * Returns { canvas, lampX, lampY } (lamp position for the light pool, or null).
 */
export function paintScene(W, H, rects) {
  const key = `scene|${W}x${H}|${JSON.stringify(rects)}`;
  return cached(key, () => {
    noiseTex();
    const P = new Px(W, H);
    const fr = rects.frame;
    // the board hides the wall behind it: paint only around it
    const hid = (x, y) => fr && x > fr.x + 26 && x < fr.x + fr.w - 26 && y > fr.y + 26 && y < fr.y + fr.h - 26;
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) if (!hid(x, y)) P.put(x, y, wallTexel(x, y));
    const R = rng(902);
    // free wall spans in the header band (between the header controls, above the frame)
    const bot = fr ? fr.y : H * 0.2;
    const blocks = rects.head.filter((r) => r.w > 0).sort((a, b) => a.x - b.x);
    const spans = [];
    let cx = 6;
    // the first header row: controls whose top sits in the upper part of the band
    const yTop = Math.min(...blocks.map((r) => r.y));
    const row1 = blocks.filter((r) => r.y < yTop + 14);
    for (const r of row1) { if (r.x - cx > 0) spans.push({ x0: cx, x1: r.x - 6 }); cx = Math.max(cx, r.x + r.w + 6); }
    if (W - 6 - cx > 0) spans.push({ x0: cx, x1: W - 6 });
    spans.sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
    const r1 = row1.length ? row1.reduce((a, r) => ({ y0: Math.min(a.y0, r.y), y1: Math.max(a.y1, r.y + r.h) }), { y0: 1e9, y1: -1e9 }) : { y0: 8, y1: 48 };
    // copper pipe behind the first header row
    const pipeY = Math.round(r1.y0 + (r1.y1 - r1.y0) * 0.5);
    pipe(P, pipeY, 0, W - 1, R);
    let lampX = null, lampY = null;
    const sp = spans[0];
    if (sp) {
      const wd = sp.x1 - sp.x0;
      if (wd >= 136) {
        // shelf on the left part of the gap, the lamp on the right
        const sw = Math.min(124, wd - 52);
        shelf(P, sp.x0 + 4, Math.round(r1.y1) - 7, sw);
        lampX = Math.round(sp.x0 + 4 + sw + (wd - sw) / 2);
      } else if (wd >= 56) lampX = Math.round((sp.x0 + sp.x1) / 2);
      if (lampX !== null) {
        lampY = Math.round(Math.min(r1.y1 - 6, Math.max(30, r1.y0 + 26)));
        // light cone falling to the board, then the glow, then the lamp itself
        const y0 = lampY + 2, y1 = bot + 6;
        for (let y = y0; y < y1; y++) {
          const t = (y - y0) / Math.max(1, y1 - y0), half = 16 + t * 70;
          for (let x = Math.floor(lampX - half); x <= lampX + half; x++) {
            const u = Math.abs(x - lampX) / half;
            const v = dq((1 - u * u) * (0.11 - t * 0.07), x, y, 28);
            if (v > 0) P.put(x, y, WARM, v);
          }
        }
        glow(P, lampX, lampY, 70, 0.42);
        lamp(P, lampX, lampY);
      }
    }
    // the second best gap gets the shelf when the first only had room for the lamp
    const sp2 = spans[1];
    if (sp2 && lampX !== null && spans[0].x1 - spans[0].x0 < 136 && sp2.x1 - sp2.x0 >= 90) shelf(P, sp2.x0 + 4, Math.round(r1.y1) - 7, Math.min(120, sp2.x1 - sp2.x0 - 8));
    // dark vignette at the screen edges + under the frame
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
      if (hid(x, y)) continue;
      const ex = Math.min(x, W - 1 - x) / 40, ey = Math.min(y, H - 1 - y) / 50;
      const v = dq((1 - Math.min(1, Math.min(ex, ey))) * 0.45, x >> 1, y >> 1, 10);
      if (v > 0) P.tint(x, y, 1 - v);
    }
    if (rects.sign && rects.sign.w > 10) plankAt(P, rects.sign.x, rects.sign.y, rects.sign.w, rects.sign.h);
    return { canvas: P.canvas(), lampX, lampY };
  });
}

// ============================================================================ FRAME

/**
 * Walnut frame: W x H border box, rails t thick (bottom b), painted with a margin M around it for
 * the cast shadow and the sticky notes. o.ledge = a tray under the board.
 */
export function paintFrame(W, H, o = {}) {
  const t = o.t ?? 22, b = o.b ?? t, M = o.M ?? 16;
  const key = `frame|${W}x${H}|${t}|${b}|${M}|${o.ledge ? 1 : 0}|${o.notes ? 1 : 0}`;
  return cached(key, () => {
    noiseTex();
    const P = new Px(W + 2 * M, H + 2 * M);
    const R = rng(77);
    // knots: two per rail at seeded spots
    const knots = { t: [], b: [], l: [], r: [] };
    for (const s of ['t', 'b', 'l', 'r']) {
      const len = s === 't' || s === 'b' ? W : H;
      for (let k = 0; k < 2; k++) knots[s].push({ u: 30 + R() * (len - 60), v: 6 + R() * 8, r: 2.2 + R() * 2 });
    }
    const seedOf = { t: 1, b: 2, l: 3, r: 4 };
    const outward = { t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0] };
    const tray = o.ledge ? Math.max(0, b - t) : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dl = x, dt = y, dr = W - 1 - x, db = H - 1 - y;
      const inRail = dl < t || dr < t || dt < t || db < b;
      if (!inRail) continue;
      // which rail owns this texel (mitred corners: whichever edge is nearer, scaled by thickness)
      const nt = dt / t, nb = db / b, nl = dl / t, nr = dr / t;
      let side = 't', n1 = nt;
      if (nb < n1) { side = 'b'; n1 = nb; }
      if (nl < n1) { side = 'l'; n1 = nl; }
      if (nr < n1) { side = 'r'; n1 = nr; }
      // the nearest rail running the other way (for the mitre seam)
      const n2 = side === 't' || side === 'b' ? Math.min(nl, nr) : Math.min(nt, nb);
      const T = side === 'b' ? b : t;
      const v = side === 't' ? dt : side === 'b' ? db : side === 'l' ? dl : dr; // 0 at the outer edge
      const u = side === 't' || side === 'b' ? x : y;
      // the tray: the bottom rail is a deeper shelf with a front lip
      let N; // profile angle: + rolls toward the outside, - slopes toward the board
      let vv = v;
      if (side === 'b' && tray) {
        if (v < tray) {
          // front lip of the tray (v from the outer bottom edge)
          const lip = v;
          N = lip <= 1 ? 1.2 : lip <= 3 ? 0.6 : lip >= tray - 2 ? -0.2 : 0.0;
          vv = lip;
        } else { vv = v - tray; N = null; }
      }
      if (N === undefined || N === null) {
        // profile across the rail (outer -> inner): rolled edge, flat face, groove, bevel, lip
        N = vv <= 0 ? 1.4 : vv <= 2 ? 0.9 : vv <= 3 ? 0.45 : vv === T - 9 - (side === 'b' ? tray : 0) ? -0.9 : vv === T - 8 - (side === 'b' ? tray : 0) ? 0.7 : vv >= T - (side === 'b' ? tray : 0) - 2 ? -1.3 : vv >= T - (side === 'b' ? tray : 0) - 7 ? -0.62 : 0;
      }
      const [ox, oy] = outward[side];
      // N > 0: normal leans outward; N < 0: leans toward the board
      const s = Math.sin(Math.max(-1.4, Math.min(1.4, N))), c = Math.cos(N);
      const nx = ox * s, ny = oy * s, nz = c;
      let light = 0.32 + 0.68 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      // grain: long late-wood lines flowing along the rail, bent around knots
      const sd = seedOf[side];
      let g = v * 0.62 + nzG(u + sd * 131, v + sd * 17) * 7 + Math.sin(u * 0.017 + sd) * 1.2;
      for (const k of knots[side]) {
        const du = (u - k.u) / (k.r * 3.2), dv = (v - k.v) / k.r;
        const dd = du * du + dv * dv;
        g += 2.6 / (1 + dd);
        if (dd < 0.3) light *= 0.72;
      }
      const ring = g - Math.floor(g);
      let w = 0.5 + (nzF(v * 3 + sd * 40, u + sd * 70) - 0.5) * 0.5;
      if (ring < 0.16) w -= 0.32; else if (ring < 0.26) w -= 0.12;
      w += (hash(x, y, sd) - 0.5) * 0.1;
      let val = light * (0.55 + w * 0.6);
      // mitre seam
      const mit = (n2 - n1) * T < 0.8;
      if (mit && v > 0 && v < T - 1) val *= 0.55;
      // outermost + innermost texels: ink outline
      let colr = rampAt(WOOD, val, x, y);
      if (v === 0) colr = WOOD[0];
      if (vv === T - 1 - (side === 'b' ? tray : 0) || (side !== 'b' && v === T - 1)) colr = WOOD[0];
      P.put(x + M, y + M, colr);
    }
    // wear: scratches + dents along the rails (only on the flat faces)
    const face = (x, y) => {
      const dl = x, dt = y, dr = W - 1 - x, db = H - 1 - y;
      const m = Math.min(dl, dt, dr, db - (b - t));
      return m >= 4 && m <= t - 10;
    };
    for (let k = 0; k < Math.round((W + H) / 18); k++) {
      const horiz = R() < 0.5;
      const x = (R() * W) | 0, y = (R() * H) | 0;
      if (!face(x, y)) continue;
      const len = 3 + ((R() * 8) | 0);
      for (let i = 0; i < len; i++) {
        const X = horiz ? x + i : x, Y = horiz ? y : y + i;
        if (face(X, Y)) P.put(X + M, Y + M, WOOD[8], 0.35);
      }
    }
    for (let k = 0; k < Math.round((W + H) / 40); k++) {
      const x = (R() * W) | 0, y = (R() * H) | 0;
      if (!face(x, y) || !face(x + 1, y + 1)) continue;
      P.put(x + M, y + M, WOOD[1], 0.8); P.put(x + 1 + M, y + M, WOOD[2], 0.6); P.put(x + M, y + 1 + M, WOOD[8], 0.4); P.put(x + 1 + M, y + 1 + M, WOOD[8], 0.5);
    }
    // nails along the rails
    const nail = (x, y) => {
      P.ell(x + M + 0.5, y + M + 0.5, 2.2, 2.2, domeShade(ramp('#20222e', '#3a3e52', '#5a6078', '#8a92aa', '#c4cade')));
      P.put(x + M + 2, y + M + 2, cl('#120804'), 0.5); P.put(x + M + 3, y + M + 1, cl('#120804'), 0.3);
    };
    const mid = Math.floor(t / 2) - 2;
    for (let x = 90; x < W - 90; x += Math.max(110, Math.round((W - 180) / Math.max(1, Math.round((W - 180) / 160))))) { nail(x, mid); nail(x, H - b + mid); }
    for (let y = 100; y < H - 100; y += 180) { nail(mid, y); nail(W - 1 - mid - 1, y); }
    // brass corner brackets with screws
    const bracket = (cx, cy, sx, sy) => {
      const L = Math.min(30, t + 10), Wd = 7;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const inA = i < Wd, inB = j < Wd;
        if (!inA && !inB) continue;
        const e = i === 0 || j === 0 || (inA && !inB && i === Wd - 1) || (inB && !inA && j === Wd - 1) || i === L - 1 || j === L - 1;
        const X = cx + i * sx, Y = cy + j * sy;
        const vv = 0.62 - (j * sy) * 0.012 - (i * sx) * 0.008 + (hash(X, Y, 21) - 0.5) * 0.16;
        P.put(X + M, Y + M, e ? BRASS[0] : rampAt(BRASS, vv, X, Y));
      }
      // bevel highlights
      for (let i = 1; i < L - 1; i++) { P.put(cx + i * sx + M, cy + sy * 1 + M, BRASS[5], 0.8); P.put(cx + sx * 1 + M, cy + i * sy + M, BRASS[5], 0.8); }
      // screws (slotted)
      for (const [i, j] of [[3, 3], [L - 5, 3], [3, L - 5]]) {
        const X = cx + i * sx + M, Y = cy + j * sy + M;
        P.ell(X + 0.5, Y + 0.5, 2.3, 2.3, domeShade(ramp('#3a2a10', '#7a5a20', '#b08a3a', '#e0c070', '#fff0b0')));
        P.put(X - 1, Y + 1, BRASS[0]); P.put(X, Y, BRASS[0]); P.put(X + 1, Y - 1, BRASS[0]);
      }
    };
    bracket(0, 0, 1, 1); bracket(W - 1, 0, -1, 1); bracket(0, H - 1, 1, -1); bracket(W - 1, H - 1, -1, -1);
    // the tray: a marker, an eraser, loose pins (they sit on the tray's top face)
    if (tray) {
      const ty = H - tray; // tray top surface line
      const mk = Math.round(W * 0.16);
      // marker
      for (let i = 0; i < 44; i++) for (let j = 0; j < 7; j++) {
        const cap = i < 12, tip = i > 40;
        const R5 = cap ? ramp('#0e2a6a', '#1a52b0', '#2b8cf2', '#8fd4ff') : tip ? ramp('#2a2a2a', '#4a4a4a', '#6a6a6a', '#9a9a9a') : ramp('#8a8698', '#c8c4d4', '#f2f0f8', '#ffffff');
        const e = j === 0 || j === 6 || i === 0 || i === 43;
        P.put(mk + i + M, ty - 7 + j + M, e ? cl('#1a1626') : rampAt(R5, 0.9 - j * 0.15, i, j));
      }
      for (let i = 16; i < 32; i++) P.put(mk + i + M, ty - 4 + M, cl('#2b8cf2'), 0.85);
      // felt eraser
      const ex = Math.round(W * 0.66);
      for (let i = 0; i < 30; i++) for (let j = 0; j < 12; j++) {
        const e = i === 0 || i === 29 || j === 0 || j === 11;
        const felt = j >= 8;
        P.put(ex + i + M, ty - 12 + j + M, e ? cl('#1a1626') : felt ? rampAt(ramp('#3a3a48', '#5a5a6a', '#7a7a8a'), 0.5 + (hash(i, j, 3) - 0.5) * 0.5, i, j) : rampAt(WOOD, 0.75 - j * 0.05, i, j));
      }
      // loose push pins
      for (const [px, pc] of [[0.42, '#e8303a'], [0.47, '#2b8cf2'], [0.83, '#ffc21a']]) {
        const X = Math.round(W * px) + M, Y = ty - 5 + M;
        P.ell(X + 0.5, Y + 0.5, 4, 3.2, domeShade(ramp(...[-0.6, -0.35, 0, 0.35, 0.65].map((k) => toHex(k < 0 ? scaleC(cl(pc), 1 + k) : mixC(cl(pc), [255, 255, 255], k))))));
        P.hl(X + 4, X + 9, Y + 2, STEEL[4]); P.hl(X + 4, X + 9, Y + 3, cl('#1e0e04'), 0.3);
      }
    }
    // sticky notes stuck on two corners (half on the wall)
    if (o.notes !== false) {
      const sticky = (x, y, fill, doodle) => {
        const S = 20, F = cl(fill);
        const mask = new Float32Array(P.w * P.h);
        for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (x + i >= 0 && y + j >= 0 && x + i < P.w && y + j < P.h) mask[(y + j) * P.w + x + i] = 1;
        dropShadow(P, mask, 1, 3, 2, 0.55, undefined, [x - 6, y - 6, x + S + 10, y + S + 10]);
        for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
          const e = i === 0 || j === 0 || i === S - 1 || j === S - 1;
          let v = 0.62 - j / S * 0.18 + (hash(i, j, 41) - 0.5) * 0.05;
          if (j < 6) v += 0.04;
          const cc = e ? mixC(F, [40, 24, 8], 0.45) : mixC(scaleC(F, 0.82), F, clamp01((v - 0.3) * 2.2));
          P.put(x + i, y + j, cc);
        }
        for (const [i, j] of doodle) P.put(x + i, y + j, cl('#23306e'));
      };
      const heart = [[5, 7], [6, 6], [7, 6], [8, 7], [9, 8], [10, 7], [11, 6], [12, 6], [13, 7], [13, 8], [12, 10], [11, 11], [10, 12], [9, 13], [8, 12], [7, 11], [6, 10], [5, 9], [5, 8]];
      const star = [[9, 4], [9, 5], [10, 6], [8, 6], [11, 7], [7, 7], [13, 8], [12, 8], [6, 8], [5, 8], [12, 9], [6, 9], [11, 10], [7, 10], [11, 11], [7, 11], [12, 12], [6, 12], [12, 13], [6, 13], [10, 12], [8, 12], [9, 11]];
      sticky(M + W - 64, M + 1, '#ffe76a', heart);
      sticky(M + 1, M + H - b - 70, '#9ed8ff', star);
    }
    // cast shadow on the wall (under everything painted so far)
    const mask = new Float32Array(P.w * P.h);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[(y + M) * P.w + x + M] = 1;
    // (only the margin band can show it: clip the work to the four sides)
    const pw = P.w, ph = P.h;
    for (const bx of [[0, 0, pw, M + 12], [0, ph - M - 12, pw, ph], [0, 0, M + 12, ph], [pw - M - 12, 0, pw, ph]]) dropShadow(P, mask, 2, 5, 4, 0.75, cl('#03040e'), bx);
    return P.canvas();
  });
}

// ============================================================================ LIGHT (over the cork)

/** Lamp light pooling on the cork, vignette, and the frame's inner shadow. 2 px cells. */
export function paintLight(W, H, lampX) {
  const key = `light|${W}x${H}|${lampX ?? 'n'}`;
  return cached(key, () => {
    const w = Math.ceil(W / 2), h = Math.ceil(H / 2);
    const P = new Px(w, h);
    const lx = (lampX ?? W * 0.5) / 2;
    const DARK = cl('#1a0a02');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // pool of light: brightest just under the lamp, falling off down and to the sides
      const dx = (x - lx) / (w * 0.62), dy = (y + h * 0.05) / (h * 0.8);
      const d = Math.sqrt(dx * dx + dy * dy);
      const light = Math.pow(clamp01(1 - d), 1.5);
      // vignette + inner frame shadow (top strongest: the lamp is above the board)
      const vx = Math.abs(x / w - 0.5) * 2, vy = y / h;
      let dark = smooth(0.45, 1.05, Math.max(vx, 0)) * 0.22 + smooth(0.55, 1, vy) * 0.18 + smooth(0.5, 1.4, d) * 0.12;
      dark += Math.max(0, 1 - y / 4.5) * 0.42 + Math.max(0, 1 - x / 3) * 0.26 + Math.max(0, 1 - (w - 1 - x) / 2) * 0.12;
      const L = dq(light * 0.3, x, y, 30), D = dq(dark, x, y, 24);
      if (D > L) P.put(x, y, DARK, D - L * 0.5);
      else if (L > 0) P.put(x, y, WARM, L);
    }
    return P.canvas();
  });
}

// ============================================================================ PAPER

const PAPER = {
  letter: { fill: '#f7eed5', edge: '#b4a07a' },
  index: { fill: '#fbfaf4', edge: '#b9b4a6' },
  notebook: { fill: '#ecebe2', edge: '#a8a496' },
  receipt: { fill: '#f6f4ee', edge: '#bdb8ac' },
  kraft: { fill: '#c9a068', edge: '#7a5a30' },
  manila: { fill: '#ecc67c', edge: '#9a7a3a' },
  file: { fill: '#e8c27a', edge: '#9a7a3a' },
  yellow: { fill: '#ffe76a', edge: '#b89a2a', sticky: true },
  pink: { fill: '#ffa2cb', edge: '#b8587e', sticky: true },
  blue: { fill: '#9ed8ff', edge: '#4a86b0', sticky: true },
  green: { fill: '#bdee8a', edge: '#6a9a40', sticky: true },
  clip: { fill: '#fbfaf4', edge: '#b9b4a6', board: true },
};
export const PAPER_M = 12;

/**
 * Paint a note's paper at w x h CSS px (+ PAPER_M margin all round for the shadow / curl).
 * kind: letter | index | notebook | receipt | kraft | manila | file | yellow | pink | blue | green | clip.
 */
export function paperCanvas(kind, w, h, seed = 1) {
  w = Math.round(w); h = Math.round(h);
  return cached(`paper|${kind}|${w}x${h}|${seed}`, () => paintPaper(kind, w, h, seed));
}

function paintPaper(kind, w, h, seed) {
  const M = PAPER_M, K = PAPER[kind] ?? PAPER.letter;
  const P = new Px(w + 2 * M, h + 2 * M);
  const W = P.w;
  const F = cl(K.fill), E = cl(K.edge);
  // ---- silhouette
  const inside = new Uint8Array(P.w * P.h);
  const dog = kind === 'letter' ? Math.min(20, Math.round(Math.min(w, h) * 0.12)) : 0;
  const curl = K.sticky ? Math.max(18, Math.min(34, Math.round(Math.min(w, h) * 0.2))) : 0;
  const tabW = kind === 'manila' || kind === 'file' ? Math.min(110, Math.round(w * 0.36)) : 0;
  const tabX = kind === 'file' ? w - tabW - 14 : 10;
  const tornTop = kind === 'notebook' ? Array.from({ length: w }, (_, x) => {
    // spiral tear: a punched hole every 16 px, ragged fibres between
    const k = x % 16;
    const hole = k >= 5 && k <= 10 ? 4 - Math.round(Math.abs(k - 7.5)) : 0;
    return 3 + hole + (hash(x, 0, 5) < 0.35 ? 1 : 0);
  }) : null;
  const zig = kind === 'receipt' ? (x) => { const k = x % 8; return k < 4 ? k : 8 - k; } : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let ins = true;
    if (dog) { const u = x - (w - dog), v = y - (h - dog); if (u >= 0 && v >= 0 && u + v > dog) ins = false; }
    if (curl) {
      const u = (x + 0.5 - (w - curl)) / curl, v = (y + 0.5 - (h - curl)) / curl;
      if (u > 0 && v > 0 && Math.pow(u, 1.3) + Math.pow(v, 1.3) > 1) ins = false;
    }
    if (tornTop && y < tornTop[x]) ins = false;
    if (zig && (y < zig(x) || y > h - 1 - zig(x + 4))) ins = false;
    if (tabW && y < 12 && !(x >= tabX && x < tabX + tabW && y >= (x - tabX < 3 ? 3 - (x - tabX) : x > tabX + tabW - 4 ? x - (tabX + tabW - 4) : 0))) ins = false;
    if (K.board) { const r = 6, cx = Math.max(r, Math.min(w - 1 - r, x)), cy = Math.max(r, Math.min(h - 1 - r, y)); if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) ins = false; }
    if ((kind === 'index' || kind === 'letter') && ((x === 0 || x === w - 1) && (y === 0 || y === h - 1))) ins = false;
    if (ins) inside[(y + M) * W + x + M] = 1;
  }
  const isIn = (x, y) => x >= -M && y >= -M && x < w + M && y < h + M && inside[(y + M) * W + x + M] === 1;
  // ---- drop shadow (bigger under a clipboard; the curled corner lifts its own shadow further out)
  const mask = new Float32Array(P.w * P.h);
  for (let i = 0; i < mask.length; i++) mask[i] = inside[i];
  if (curl) {
    // the lifted corner casts a longer shadow: extend the mask into the cut-away corner
    for (let y = h - curl; y < h; y++) for (let x = w - curl; x < w; x++) mask[(y + M) * W + x + M] = Math.max(mask[(y + M) * W + x + M], 0.8);
  }
  dropShadow(P, mask, K.board ? 2 : 1, K.board ? 5 : 3, K.board ? 4 : 3, K.board ? 0.75 : 0.6);
  // ---- body
  noiseTex();
  const D = P.d, ox = (seed * 53) & 255, oy = (seed * 29) & 255;
  const rough = kind === 'kraft' || kind === 'manila' || kind === 'file';
  const boardC = ramp('#4a2a10', '#5e3816', '#74461e', '#8a5628', '#a06a34', '#b88042');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + M, Y = y + M;
    if (!inside[Y * W + X]) continue;
    if (K.board) {
      // hardboard: speckled brown, lit top-left, darker rim
      const edgeD = Math.min(x, y, w - 1 - x, h - 1 - y);
      let v = 0.55 + (nzB(x + ox, y + oy) - 0.5) * 0.25 + (hash(x, y, 2) - 0.5) * 0.18 - y / h * 0.12;
      if (edgeD === 0) v = 0.02; else if (edgeD === 1) v += x < w / 2 && y < h / 2 ? 0.32 : -0.1; else if (edgeD === 2) v += 0.1;
      P.put(X, Y, rampAt(boardC, v, X, Y));
      continue;
    }
    // fibre + mottling + top-lit falloff
    const fb = nzF(x + ox, y + oy) - 0.5;
    let k = 1 + (nzB(x + ox, y + oy) - 0.5) * 0.05 + fb * 0.035 - (y / h) * 0.045 + (x / w < 0.5 ? 0.008 : -0.008);
    if (hash(x, y, seed) < 0.012) k -= 0.06; // fleck
    if (rough) k += (nzF(x * 2 + oy, y * 2 + ox) - 0.5) * 0.08 + fb * 0.04;
    // aged edges (slightly darker within a few px of the edge)
    const ed = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (ed < 5) k -= (5 - ed) * 0.006;
    // sticky notes: flat glue strip at the top, the rest of the sheet lifts slightly toward the curl
    if (K.sticky) k *= 1 - smooth(0.15, 1, y / h) * 0.06 + (y < 14 ? 0.015 : 0);
    const i = (Y * W + X) * 4;
    D[i] = F[0] * k; D[i + 1] = F[1] * k; D[i + 2] = F[2] * k; D[i + 3] = 255;
  }
  // ---- kind features
  if (kind === 'letter') {
    // tri-fold creases (big sheets): a dark valley line + a lit ridge under it, panels catch light differently
    for (const f of h >= 140 ? [0.34, 0.68] : []) {
      const cy = Math.round(h * f);
      for (let x = 0; x < w; x++) {
        if (!isIn(x, cy)) continue;
        const wob = Math.round(Math.sin(x * 0.05 + f * 9) * 0.6);
        P.put(x + M, cy + wob + M, scaleC(F, 0.86));
        P.put(x + M, cy + wob + 1 + M, mixC(F, [255, 255, 255], 0.6));
      }
      for (let y = cy + 2; y < Math.min(h, cy + 16); y++) for (let x = 0; x < w; x++) if (isIn(x, y)) P.tint(x + M, y + M, 1 - (1 - (y - cy) / 16) * 0.035);
    }
    // the dog-ear flap: back of the paper, lit along the fold
    for (let y = h - dog; y < h; y++) for (let x = w - dog; x < w; x++) {
      const u = x - (w - dog), v = y - (h - dog);
      if (u + v >= dog) continue;
      const fold = u + v >= dog - 1;
      const edge = u === 0 || v === 0;
      const tt = (u + v) / dog;
      P.put(x + M, y + M, fold ? mixC(F, [255, 255, 255], 0.55) : edge ? E : scaleC(F, 0.84 + tt * 0.1));
    }
    for (let i = 1; i < dog; i++) { P.put(w - dog - 1 + M, h - dog + i + M, cl('#5a4428'), 0.25); P.put(w - dog + i + M, h - dog - 1 + M, cl('#5a4428'), 0.18); }
  }
  if (kind === 'index') {
    const red = Math.min(30, Math.round(h * 0.14) + 8);
    for (let x = 1; x < w - 1; x++) { P.put(x + M, red + M, cl('#e8707a')); P.put(x + M, red + 1 + M, cl('#f4b0b4')); }
    for (let y = red + 14; y < h - 4; y += 14) for (let x = 1; x < w - 1; x++) P.put(x + M, y + M, cl('#a9c4ea'), 0.75);
  }
  if (kind === 'notebook' || kind === 'clip') {
    const x0 = kind === 'clip' ? 8 : 0, x1 = kind === 'clip' ? w - 9 : w;
    const y0 = kind === 'clip' ? 18 : 22;
    if (kind === 'clip') {
      // the sheet on the clipboard (white, its own soft shadow on the board)
      for (let y = 12; y < h - 7; y++) for (let x = x0; x < x1; x++) {
        const e = x === x0 || x === x1 - 1 || y === h - 8;
        P.put(x + M, y + M, e ? cl('#c9c4b4') : scaleC(cl('#fbfaf4'), 1 - (y / h) * 0.04 + (vnoise(x / 6, y, 3) - 0.5) * 0.03));
      }
      for (let y = 13; y < h - 6; y++) { P.put(x1 + M, y + M, cl('#2a1608'), 0.35); }
      for (let x = x0 + 1; x <= x1; x++) P.put(x + M, h - 7 + M, cl('#2a1608'), 0.35);
    }
    for (let y = y0 + 12; y < h - (kind === 'clip' ? 10 : 4); y += 13) for (let x = x0 + 1; x < x1 - 1; x++) P.put(x + M, y + M, cl('#a9c4ea'), 0.7);
    if (kind === 'notebook') for (let y = 6; y < h - 1; y++) P.put(20 + M, y + M, cl('#e88a92'), 0.8);
  }
  if (kind === 'receipt') {
    // thermal-print dotted separators near the top and bottom
    for (const yy of [Math.round(h * 0.18), Math.round(h * 0.82)]) for (let x = 8; x < w - 8; x += 3) P.put(x + M, yy + M, cl('#9a9690'), 0.8);
    // the roll's curl: the middle a touch lighter
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isIn(x, y)) P.tint(x + M, y + M, 1 - Math.abs(x / w - 0.5) * 0.05);
  }
  if (kind === 'manila' || kind === 'file') {
    // the back flap shows above the front one (in shade), with two sheets peeking out of the folder
    const fy = 24;
    for (let y = 12; y < fy; y++) for (let x = 1; x < w - 1; x++) if (isIn(x, y)) P.tint(x + M, y + M, 0.9);
    const sheet = (x0, x1, y0, c) => {
      for (let y = y0; y < fy; y++) for (let x = x0; x < x1; x++) {
        const e = y === y0 || x === x0 || x === x1 - 1;
        P.put(x + M, y + M, e ? cl('#b8b2a0') : scaleC(cl(c), 1 - (y - y0) * 0.01));
      }
    };
    sheet(22, w - 34, 13, '#f2eedf');
    sheet(12, w - 16, 16, '#fbfaf4');
    for (let x = 1; x < w - 1; x++) {
      P.put(x + M, fy + M, scaleC(F, 0.7));
      P.put(x + M, fy + 1 + M, mixC(F, [255, 255, 255], 0.45));
      for (let y = fy + 2; y < fy + 6; y++) if (isIn(x, y)) P.tint(x + M, y + M, 0.975 + (y - fy) * 0.004);
    }
    if (kind === 'manila') for (let y = fy + 4; y < h - 2; y++) P.put(Math.round(w * 0.5) + M, y + M, scaleC(F, 0.9), 0.5);
  }
  // ---- outline: darker paper edge, a lit top edge, a shaded bottom / right edge
  const HI = mixC(F, [255, 255, 255], 0.5), LO = scaleC(F, 0.9), OUT = K.board ? boardC[0] : E;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y + M) * W + x + M;
    if (!inside[i]) continue;
    if (!inside[i - W] || !inside[i + W] || !inside[i - 1] || !inside[i + 1]) P.put(x + M, y + M, OUT);
    else if (K.board) continue;
    else if (!inside[i - 2 * W]) P.put(x + M, y + M, HI);
    else if (!inside[i + 2] || !inside[i + 2 * W]) P.put(x + M, y + M, LO);
  }
  // ---- sticky curl: the bent paper (lit ridge) along the cut, the back of the lifted tip beyond it
  if (curl) {
    for (let y = h - curl; y < h + 2; y++) for (let x = w - curl; x < w + 2; x++) {
      const u = (x + 0.5 - (w - curl)) / curl, v = (y + 0.5 - (h - curl)) / curl;
      if (u <= 0 || v <= 0) continue;
      const f = Math.pow(u, 1.3) + Math.pow(v, 1.3);
      const near = (1 - f) * curl * 0.62;
      if (isIn(x, y)) {
        if (near < 1) P.put(x + M, y + M, E);
        else if (near < 3) P.put(x + M, y + M, mixC(F, [255, 255, 255], 0.45));
        else if (near < 7) P.put(x + M, y + M, scaleC(F, 0.95 - (7 - near) * 0.006));
      } else if (f < 1.34 && x < w && y < h) {
        // the underside of the lifted corner (the tip curls up toward you), in its own shadow
        const back = f > 1.29 ? E : scaleC(F, 0.66 + (1.34 - f) * 0.7);
        P.put(x + M, y + M, back);
      }
    }
  }
  // ---- clipboard: a hanging hole, then the steel clip over the sheet
  if (K.board) {
    const cw = Math.min(70, Math.round(w * 0.32)), cx0 = Math.round(w / 2 - cw / 2);
    P.ell(w / 2 + M, 5.5 + M, 3.4, 2.6, cl('#1a0e04'));
    P.hl(Math.round(w / 2 - 2) + M, Math.round(w / 2 + 2) + M, 8 + M, boardC[5]);
    // the clip's shadow on the sheet
    for (let y = 22; y < 26; y++) for (let x = cx0 + 2; x < cx0 + cw + 2; x++) P.put(x + M, y + M, cl('#1a0e04'), 0.32 - (y - 22) * 0.07);
    // lever hump
    const hw = Math.round(cw * 0.56), hx = Math.round(w / 2 - hw / 2);
    for (let y = 9; y < 15; y++) for (let x = hx; x < hx + hw; x++) {
      const u = (x - hx) / (hw - 1);
      const top = 9 + Math.round(Math.pow(Math.abs(u - 0.5) * 2, 3) * 5);
      if (y < top) continue;
      const e = y === top || x === hx || x === hx + hw - 1;
      P.put(x + M, y + M, e ? STEEL[0] : rampAt(STEEL, 0.85 - (y - 9) * 0.07 - u * 0.2, x, y));
    }
    // clip plate
    for (let y = 14; y < 23; y++) for (let x = cx0; x < cx0 + cw; x++) {
      const u = (x - cx0) / (cw - 1), v = y - 14;
      const e = x === cx0 || x === cx0 + cw - 1 || v === 0 || v === 8;
      P.put(x + M, y + M, e ? STEEL[0] : rampAt(STEEL, (v === 1 ? 0.95 : 0.7 - v * 0.05) - u * 0.25, x, y));
    }
    for (const rx of [cx0 + 5, cx0 + cw - 6]) P.ell(rx + 0.5 + M, 18.5 + M, 2, 2, domeShade(STEEL.slice(1)));
  }
  return P.canvas();
}

// ============================================================================ SPRITES (CSS vars)

/** Push pin, 3/4 view: dome cap, grip, collar, needle, shadow on the board. 18 x 24. */
function pinSprite(base) {
  const P = new Px(18, 24);
  const B = cl(base);
  const R6 = [-0.62, -0.42, -0.2, 0, 0.3, 0.6].map((k) => (k < 0 ? scaleC(B, 1 + k) : mixC(B, [255, 255, 255], k)));
  // shadow cast down-right on the surface
  P.ell(11.5, 19.5, 5.5, 2.6, cl('#1e0e04'), 0.35);
  P.ell(10.5, 18.5, 3.8, 1.8, cl('#1e0e04'), 0.25);
  // needle
  P.vl(8, 15, 19, STEEL[5]); P.vl(9, 15, 19, STEEL[2]); P.put(8, 20, STEEL[3]);
  // collar (flange)
  P.ell(8.5, 14.5, 5.2, 1.9, domeShade(R6.slice(0, 5), 0.97));
  // grip: tapered body
  for (let y = 7; y < 14; y++) {
    const half = 2.6 + (y - 7) * 0.05;
    for (let x = Math.floor(8.5 - half); x <= Math.ceil(8.5 + half) - 1; x++) {
      const u = (x + 0.5 - 8.5) / half;
      const v = 0.62 - u * 0.45 - (y - 7) * 0.02;
      P.put(x, y, Math.abs(u) > 0.86 ? R6[0] : rampAt(R6, v, x, y));
    }
  }
  // dome cap
  P.ell(8.5, 5.5, 6.4, 4.9, domeShade(R6, 0.9));
  // outline the cap bottom rim
  for (let x = 3; x <= 13; x++) P.put(x, 9 + (x < 5 || x > 11 ? 0 : 1), R6[0], 0.8);
  P.put(5, 3, cl('#ffffff')); P.put(6, 3, cl('#ffffff')); P.put(5, 4, cl('#ffffff'), 0.8);
  return P.url();
}

/** Masking tape strip: torn ends, fibres, translucent. */
function tapeSprite(w = 46, hh = 15) {
  const strip = new Px(w, hh);
  const R = rng(17);
  const base = cl('#efe0b4');
  const tornL = Array.from({ length: hh }, () => (R() * 3) | 0), tornR = Array.from({ length: hh }, () => (R() * 3) | 0);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    if (x < tornL[y] || x > w - 1 - tornR[y]) continue;
    let k = 1 + (vnoise(x / 5, y / 9, 4) - 0.5) * 0.06 + (hash(x, y, 2) - 0.5) * 0.025 - (y / hh) * 0.05;
    let a = 0.8 + (vnoise(x / 4, y / 4, 6) - 0.5) * 0.08;
    if (y === 0) { k = 1.08; a = 0.9; }
    if (y === hh - 1) { k = 0.82; a = 0.88; }
    if (x === tornL[y] || x === w - 1 - tornR[y]) { k *= 0.9; a = 0.9; }
    strip.put(x, y, scaleC(base, k), a);
  }
  return strip.url();
}

/** Worn rubber-stamp ink mask (1 px texels): speckled coverage, clustered voids, lighter patches. */
function inkMask(n = 48) {
  const P = new Px(n, n);
  const R = rng(91);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = fbm(x / n * 4, y / n * 4, 3, 3, 4, 4);
    let a = v < 0.3 ? 0.55 : v < 0.36 ? 0.8 : 1;
    if (hash(x, y, 7) < 0.06) a = 0.25;
    if (hash(x, y, 8) < 0.02) a = 0;
    P.put(x, y, [255, 255, 255], a);
  }
  for (let k = 0; k < 8; k++) { const x = (R() * n) | 0, y = (R() * n) | 0; P.clear(x, y); P.clear((x + 1) % n, y); }
  return P.url();
}

/** Polaroid frame, 9-slice: 6 px sides / top, 20 px bottom. Centre left transparent. */
function polaroidSprite() {
  const w = 40, hh = 54, s = 6, bot = 20;
  const P = new Px(w, hh);
  const F = cl('#f7f4ea');
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const inner = x >= s && x < w - s && y >= s && y < hh - bot;
    if (inner) continue;
    const e = x === 0 || y === 0 || x === w - 1 || y === hh - 1;
    let k = 1 + (vnoise(x / 4, y / 4, 3) - 0.5) * 0.04 - y / hh * 0.05 + (hash(x, y, 1) - 0.5) * 0.025;
    if (y === 1) k += 0.04;
    // the photo well's lip: shaded top / left, lit bottom / right
    if (x === s - 1 && y >= s - 1 && y < hh - bot + 1) k -= 0.12;
    if (y === s - 1 && x >= s - 1 && x < w - s + 1) k -= 0.16;
    if (y === hh - bot && x >= s && x < w - s) k += 0.03;
    P.put(x, y, e ? cl('#8a826e') : scaleC(F, k));
  }
  return P.url();
}

/** Small speech-bubble badge ("tap me to hear it"), 22 x 19. */
function talkBadge() {
  const P = new Px(22, 19);
  const body = (x, y) => { const cx = Math.max(4, Math.min(17, x)), cy = Math.max(4, Math.min(9, y)); return (x - cx) ** 2 + (y - cy) ** 2 <= 16; };
  const tail = (x, y) => y >= 12 && y <= 17 && x >= 4 && x <= 9 && x - 4 <= (17 - y) * 0.8 && x >= 4 + (y - 12) * 0.2;
  const inn = (x, y) => body(x + 0.5, y + 0.5) || tail(x, y);
  // shadow
  for (let y = 0; y < 19; y++) for (let x = 0; x < 22; x++) if (!inn(x, y) && inn(x - 1, y - 2)) P.put(x, y, cl('#1e0e04'), 0.35);
  for (let y = 0; y < 19; y++) for (let x = 0; x < 22; x++) {
    if (!inn(x, y)) continue;
    const e = !inn(x - 1, y) || !inn(x + 1, y) || !inn(x, y - 1) || !inn(x, y + 1);
    P.put(x, y, e ? cl('#1c1430') : y < 4 ? cl('#ffffff') : y > 11 ? cl('#d8dcf0') : cl('#f2f4ff'));
  }
  for (const dx of [6, 10, 14]) { P.rect(dx, 7, 2, 2, cl('#2b2f6a')); }
  return P.url();
}

/** Speech bubble 9-slice (12 px slices): white paper bubble, ink rim, soft inner shade. */
function bubbleSprite() {
  const n = 36, r = 9;
  const P = new Px(n, n);
  const inn = (x, y) => { const cx = Math.max(r, Math.min(n - 1 - r, x)), cy = Math.max(r, Math.min(n - 1 - r, y)); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!inn(x, y)) continue;
    const e = !inn(x - 1, y) || !inn(x + 1, y) || !inn(x, y - 1) || !inn(x, y + 1);
    const e2 = !inn(x - 2, y) || !inn(x + 2, y) || !inn(x, y - 2) || !inn(x, y + 2);
    P.put(x, y, e ? cl('#1c1430') : e2 ? (y > n / 2 ? cl('#c8cce4') : cl('#ffffff')) : y > n - 6 ? cl('#e6e8f6') : cl('#fbfbff'));
  }
  return P.url();
}
/** The bubble's tail (points down-left), 16 x 14. */
function bubbleTail() {
  const P = new Px(16, 14);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) {
    const X = x;
    const ins = X >= 2 + y * 0.15 && X <= 13 - y * 0.85;
    if (!ins) continue;
    const e = y === 13 || X <= 2 + y * 0.15 + 0.9 || X >= 13 - y * 0.85 - 0.9;
    P.put(x, y, e ? cl('#1c1430') : cl('#fbfbff'));
  }
  // the top row opens into the bubble (covers its rim)
  for (let x = 3; x <= 12; x++) { P.clear(x, 0); P.put(x, 0, cl('#fbfbff')); }
  return P.url();
}

/** Paper clip (steel wire): two nested hairpin loops, 14 x 40 with its shadow. */
function clipSprite() {
  const P = new Px(16, 42);
  const pts = [];
  const stadium = (cx, y0, y1, r, cut = null) => {
    for (let k = 0; k < 160; k++) {
      const t = k / 160;
      const L = 2 * (y1 - y0) + 2 * Math.PI * r, d = t * L;
      let x, y;
      if (d < y1 - y0) { x = cx - r; y = y0 + d; }
      else if (d < y1 - y0 + Math.PI * r) { const a = Math.PI - (d - (y1 - y0)) / r; x = cx + Math.cos(a) * r; y = y1 + Math.sin(a) * r; }
      else if (d < 2 * (y1 - y0) + Math.PI * r) { x = cx + r; y = y1 - (d - (y1 - y0) - Math.PI * r); }
      else { const a = (d - 2 * (y1 - y0) - Math.PI * r) / r; x = cx + Math.cos(a) * r; y = y0 - Math.sin(a) * r; }
      if (cut && cut(x, y)) continue;
      pts.push([Math.round(x), Math.round(y)]);
    }
  };
  stadium(6.5, 5, 32, 5, (x, y) => x < 4 && y > 22);
  stadium(7.5, 9, 27, 2.6);
  for (const [x, y] of pts) P.put(x + 2, y + 3, cl('#1e0e04'), 0.25);
  for (const [x, y] of pts) P.put(x, y, STEEL[4]);
  for (const [x, y] of pts) if (x <= 3 || y <= 2) P.put(x, y, STEEL[6]);
  for (const [x, y] of pts) if (x >= 11) P.put(x, y, STEEL[2]);
  return P.url();
}

/** "!" sticker: chunky red starburst with an ink rim, lit top-left (the "!" is CSS text). */
function bangSticker(n = 30) {
  const P = new Px(n, n);
  const c = (n - 1) / 2;
  const Rf = (a) => n * 0.39 + n * 0.075 * Math.cos(a * 9);
  const inside = (x, y) => { const dx = x - c, dy = y - c; return Math.hypot(dx, dy) <= Rf(Math.atan2(dy, dx)); };
  const RED = ramp('#7a0814', '#a8121e', '#d0202c', '#ee3a44', '#ff6a70', '#ff9aa0');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!inside(x, y)) { if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) P.put(x, y, cl('#3a0610')); continue; }
    const l = ((c - x) + (c - y)) / n;
    P.put(x, y, rampAt(RED, 0.5 + l * 0.9, x, y));
  }
  return P.url();
}

/** Coffee ring stain (broken ring, drip, splats), 64 x 64. */
function coffee() {
  const n = 64;
  const P = new Px(n, n);
  const R = rng(33);
  const col = cl('#5c3412'), dark = cl('#3e2008');
  const cx = 31.5, cy = 30.5;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - cx, dy = y - cy;
    const a = Math.atan2(dy, dx) + Math.PI;
    const r0 = 22 + Math.sin(a * 3 + 1) * 1.3 + Math.sin(a * 7) * 0.6;
    const d = Math.hypot(dx, dy);
    if (d < r0 - 3) { if (hash(x, y, 4) < 0.45) P.put(x, y, col, 0.08); continue; }
    if (d > r0 + 0.8) continue;
    if ((a > 0.6 && a < 1.0) || (a > 3.6 && a < 3.85)) continue;
    const edge = d > r0 - 0.8;
    P.put(x, y, edge ? dark : col, edge ? 0.5 + R() * 0.15 : 0.26 + R() * 0.1);
  }
  for (let j = 0; j < 9; j++) P.put(38, 52 + j, col, 0.45 - j * 0.04);
  for (const [x, y] of [[6, 13], [7, 13], [56, 50], [57, 51], [54, 9], [9, 55]]) P.put(x, y, col, 0.45);
  return P.url();
}

/** A marker doodle on a torn notebook scrap (strokes in a 32 x 28 field, drawn 2x). */
function doodle(strokes, ink = '#23306e') {
  const w = 68, hh = 60;
  const P = new Px(w, hh);
  const R = rng(strokes.length * 13);
  const tear = Array.from({ length: w }, (_, x) => (x % 9 === 0 ? 2 : 0) + (R() < 0.35 ? 1 : 0));
  const mask = new Float32Array(w * hh);
  for (let x = 0; x < w - 3; x++) for (let y = tear[x]; y < hh - 4; y++) mask[y * w + x] = 1;
  dropShadow(P, mask, 1, 3, 2, 0.6);
  for (let x = 0; x < w - 3; x++) for (let y = tear[x]; y < hh - 4; y++) {
    let c = scaleC(cl('#f7f5ec'), 1 - y / hh * 0.05 + (hash(x, y, 2) - 0.5) * 0.03);
    if ((y - 8) % 11 === 0 && y > 6) c = cl('#b9cbea');
    if (x === 8) c = cl('#f0a0a8');
    if (y === tear[x] || x === 0 || x === w - 4 || y === hh - 5) c = cl('#8a7a5a');
    P.put(x, y, c);
  }
  const ik = cl(ink);
  for (const s of strokes) for (let i = 1; i < s.length; i++) {
    const [x0, y0] = s[i - 1], [x1, y1] = s[i];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2.2) + 1;
    for (let k = 0; k <= n; k++) {
      const X = 2 + (x0 + (x1 - x0) * (k / n)) * 2, Y = 2 + (y0 + (y1 - y0) * (k / n)) * 2;
      P.put(X, Y, ik, 0.95); P.put(X + 1, Y, ik, 0.85); P.put(X, Y + 1, ik, 0.6);
    }
  }
  return P.url();
}
const DOODLES = {
  panther: [
    [[8, 10], [10, 5], [13, 9], [20, 9], [23, 5], [25, 10], [26, 15], [24, 20], [20, 23], [13, 23], [9, 20], [7, 15], [8, 10]],
    [[12, 13], [14, 13]], [[19, 13], [21, 13]], [[15, 17], [16, 18], [17, 18], [18, 17]], [[16, 18], [16, 20]],
  ],
  flask: [
    [[13, 4], [13, 11], [7, 22], [8, 24], [25, 24], [26, 22], [20, 11], [20, 4]], [[12, 4], [21, 4]],
    [[10, 18], [23, 18]], [[14, 21], [15, 21]], [[18, 20], [19, 20]], [[22, 2], [23, 1]], [[25, 4], [26, 4]],
  ],
  toilet: [
    [[9, 3], [21, 3], [21, 11], [9, 11], [9, 3]], [[7, 12], [25, 12], [23, 17], [19, 19], [19, 24], [12, 24], [12, 19], [8, 17], [7, 12]],
    [[24, 9], [27, 6]], [[27, 4], [28, 3]], [[26, 2], [26, 1]],
  ],
  money: [
    [[10, 4], [13, 4], [14, 6], [13, 8], [10, 8], [9, 6], [10, 4]], [[11, 8], [11, 17]], [[11, 11], [6, 14]], [[11, 11], [18, 12]],
    [[11, 17], [7, 24]], [[11, 17], [15, 24]], [[19, 10], [24, 10], [27, 15], [26, 20], [19, 20], [17, 15], [19, 10]],
    [[22, 12], [22, 18]], [[24, 13], [21, 13], [21, 15], [24, 15], [24, 17], [20, 17]],
  ],
};

/** Folder tab for the tab bar, 9-slice (10 px): slanted shoulders, paper texture. kind: on | off | lock. */
function tabSprite(kind) {
  const w = 40, hh = 34;
  const P = new Px(w, hh);
  const fill = cl(kind === 'on' ? '#f7eed5' : kind === 'lock' ? '#2a2633' : '#c9a068');
  const edge = cl(kind === 'on' ? '#8a7450' : kind === 'lock' ? '#0c0a14' : '#6a4a22');
  const ins = (x, y) => y >= 0 && x >= Math.max(0, 6 - y) && x <= Math.min(w - 1, w - 7 + y);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    if (!ins(x, y)) continue;
    const e = !ins(x - 1, y) || !ins(x + 1, y) || y === 0 || (kind !== 'on' && y === hh - 1);
    let k = 1 + (vnoise(x / 3, y / 0.9, kind.length) - 0.5) * (kind === 'off' ? 0.1 : 0.04) - y / hh * 0.08;
    if (y === 1) k += 0.1;
    P.put(x, y, e ? edge : scaleC(fill, k));
  }
  return P.url();
}

/** Counter plate (wallet), 9-slice (8 px): dark steel with rivets and a lit bevel. */
function plateSprite() {
  const n = 28;
  const P = new Px(n, n);
  const PL = ramp('#05081c', '#0b1236', '#111b4a', '#18265e', '#223474', '#33478c');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ed = Math.min(x, y, n - 1 - x, n - 1 - y);
    if ((x < 1 || x > n - 2) && (y < 1 || y > n - 2)) continue;
    let v = 0.45 - y / n * 0.18 + (hash(x, y, 4) - 0.5) * 0.06;
    if (ed === 0) v = 0; else if (ed === 1) v = y === 1 ? 0.92 : x === 1 ? 0.7 : 0.2; else if (ed === 2 && y === 2) v += 0.15;
    P.put(x, y, rampAt(PL, v, x, y));
  }
  for (const [x, y] of [[4, 4], [n - 5, 4], [4, n - 5], [n - 5, n - 5]]) { P.put(x, y, PL[5]); P.put(x + 1, y + 1, PL[0]); P.put(x + 1, y, PL[3]); P.put(x, y + 1, PL[2]); }
  return P.url();
}

// ============================================================================ ILLUSTRATIONS (house icon shader)

const ART_N = 40;
const sp = (p, x, y, l = 2) => p.spark(x, y, l);
const g = { // extra palette
  paper: '#f6f0dc', bill: '#5cc25a', billD: '#2e8a3a', billL: '#b8f0a0', choc: '#6a3a1e', chocL: '#8e5430', foil: '#ffd23c',
  fur: '#3a3a4e', furL: '#5a5a74', face: '#a8949a', navy: '#2a2f5a', navyL: '#3a4274', toilet: '#eef4ff', water: '#7a5a2a',
};
/** Rotated rect (art only) as polygon points. */
const rrect = (cx, cy, w, h, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
};
function trophyCup(p, cx, top, k = 1) {
  const X = (v) => cx + v * k, Y = (v) => top + v * k;
  p.ring(X(-10.5), Y(6), 4.6 * k, 2.3 * k, C.goldD).ring(X(10.5), Y(6), 4.6 * k, 2.3 * k, C.goldD);
  p.poly([[X(-11), Y(0)], [X(11), Y(0)], [X(10), Y(9)], [X(6), Y(15)], [X(0), Y(18)], [X(-6), Y(15)], [X(-10), Y(9)]], C.gold);
  p.ell(X(0), Y(0.4), 11.4 * k, 2.4 * k, C.goldL).ell(X(0), Y(0.6), 9 * k, 1.2 * k, C.goldDD);
  p.star(X(0), Y(7.5), 4.6 * k, 2 * k, 5, '#fff0a0');
  p.rect(X(-2), Y(17), 4 * k, 5 * k, C.goldD).ell(X(0), Y(20), 4.4 * k, 1.6 * k, C.gold);
  p.rr(X(-8), Y(21.5), 16 * k, 3.5 * k, 1, C.gold);
  p.rr(X(-11), Y(25), 22 * k, 5.5 * k, 1, C.wood).rect(X(-6), Y(26.3), 12 * k, 3 * k, C.goldL);
  p.line(X(-8), Y(2.5), X(-6.5), Y(10), C.goldW, 0, true);
}
function vialShape(p, x, y, w, h, liq, liqL, cap = C.wood) {
  p.rr(x, y, w, h, w / 2 - 0.5, C.glass);
  p.rr(x + 1, y + h * 0.42, w - 2, h * 0.58 - 1, w / 2 - 1.2, liq);
  p.line(x + 1.5, y + h * 0.42, x + w - 2.5, y + h * 0.42, liqL, 0, true);
  p.line(x + 1.5, y + 2, x + 1.5, y + h * 0.38, C.white, 0, true);
  if (cap) p.rr(x - 0.5, y - 4, w + 1, 5, 1, cap);
}
function troop(p, cx, base, s, body, eye = C.white) {
  p.rr(cx - 4 * s, base - 8 * s, 8 * s, 8 * s, 2.4 * s, body);
  p.circ(cx, base - 12 * s, 5.4 * s, body);
  p.poly([[cx - 5 * s, base - 15 * s], [cx - 3.6 * s, base - 19.5 * s], [cx - 1.5 * s, base - 16 * s]], body);
  p.poly([[cx + 5 * s, base - 15 * s], [cx + 3.6 * s, base - 19.5 * s], [cx + 1.5 * s, base - 16 * s]], body);
  p.rr(cx - 3.4 * s, base - 13.4 * s, 2 * s, 2.4 * s, 0.6, eye).rr(cx + 1.4 * s, base - 13.4 * s, 2 * s, 2.4 * s, 0.6, eye);
}
function flameShape(p, cx, base, s, a = C.red, b = C.orange, c = C.gold) {
  const P = (pts) => pts.map(([x, y]) => [cx + (x - 16) * s, base + (y - 30) * s]);
  p.poly(P([[16, 1], [24, 10], [27, 18], [26, 24], [21, 30], [11, 30], [6, 24], [5, 17], [8, 11], [10, 16], [12, 9]]), a);
  p.poly(P([[16, 11], [21, 18], [22, 24], [19, 28.5], [13, 28.5], [10, 24], [11, 19], [13, 21]]), b);
  p.ell(cx, base - 5.5 * s, 3.2 * s, 3.6 * s, c);
}
function swordShape(p, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const at = (t, o = 0) => [x0 + dx * t + nx * o, y0 + dy * t + ny * o];
  p.poly([at(0, 0), at(0.08, 2), at(0.66, 2), at(0.66, -2), at(0.08, -2)], C.steel);
  p.line(...at(0.1, 0), ...at(0.64, 0), C.snow, 0, true);
  p.poly([at(0.64, 5), at(0.7, 5), at(0.7, -5), at(0.64, -5)], C.gold);
  p.poly([at(0.7, 1.6), at(0.9, 1.6), at(0.9, -1.6), at(0.7, -1.6)], C.wood);
  p.circ(...at(0.94, 0), 2.4, C.gold);
}
function baseShape(p, cx, base, k = 1) {
  const X = (v) => cx + v * k, Y = (v) => base + v * k;
  p.ell(X(0), Y(-16), 13 * k, 9 * k, C.blueD).ell(X(0), Y(-16), 11 * k, 7.4 * k, C.blue);
  p.rect(X(-15), Y(-16), 30 * k, 2.4 * k, C.steel);
  p.rect(X(-13), Y(-14), 26 * k, 14 * k, C.snow).rect(X(-13), Y(-14), 26 * k, 2 * k, C.silver);
  p.rr(X(-10), Y(-11), 11 * k, 6.5 * k, 1, '#1a3c8a').rr(X(-9), Y(-10), 9 * k, 4.5 * k, 0.5, C.cyan);
  p.rr(X(4), Y(-11), 6 * k, 11 * k, 1, C.blueD).dot(X(8.4), Y(-5), C.gold);
  p.line(X(0), Y(-25), X(0), Y(-30), C.silverD, 0, true);
  p.poly([[X(0.5), Y(-30)], [X(7), Y(-28.2)], [X(0.5), Y(-26.4)]], C.red);
}
function upArrow(p, cx, top, s = 1, col = C.green) {
  const P = (pts) => pts.map(([x, y]) => [cx + x * s, top + y * s]);
  p.poly(P([[0, 0], [8, 9], [3.4, 9], [3.4, 18], [-3.4, 18], [-3.4, 9], [-8, 9]]), col);
  p.line(cx - 1.6 * s, top + 5 * s, cx - 1.6 * s, top + 16 * s, C.greenL, 0, true);
}
function cardShape(p, x, y, w, h, body, art, accent = C.gold) {
  p.rr(x, y, w, h, 2, body);
  p.rr(x + 2, y + 2, w - 4, h * 0.55, 1, art);
  p.rect(x + 3, y + h * 0.72, w - 6, 1.6, accent);
  p.rect(x + 3, y + h * 0.82, w - 9, 1.4, C.silver);
}
function bossToilet(p, cx, cy) {
  p.poly([[cx - 9, cy - 13], [cx - 9, cy - 21], [cx - 5, cy - 16], [cx, cy - 23], [cx + 5, cy - 16], [cx + 9, cy - 21], [cx + 9, cy - 13]], C.gold);
  p.dot(cx - 0.5, cy - 18, C.red);
  p.rr(cx - 11, cy - 13, 22, 9, 2, g.toilet);
  p.rect(cx - 9, cy - 10, 18, 1.6, C.silver);
  p.poly([[cx - 15, cy - 3], [cx + 15, cy - 3], [cx + 13, cy + 6], [cx + 7, cy + 10], [cx + 6, cy + 16], [cx - 6, cy + 16], [cx - 7, cy + 10], [cx - 13, cy + 6]], g.toilet);
  p.ell(cx, cy - 3, 15, 3, C.silver).ell(cx, cy - 2.6, 12, 1.8, '#5a3a2a');
  // angry face on the bowl
  p.poly([[cx - 9, cy + 1], [cx - 3, cy + 3], [cx - 3, cy + 4.4], [cx - 9, cy + 2.6]], C.ink).poly([[cx + 9, cy + 1], [cx + 3, cy + 3], [cx + 3, cy + 4.4], [cx + 9, cy + 2.6]], C.ink);
  p.rr(cx - 8, cy + 4.5, 4, 3, 1, C.red).rr(cx + 4, cy + 4.5, 4, 3, 1, C.red);
  p.rr(cx - 5, cy + 9, 10, 3.4, 1, C.ink);
  p.poly([[cx - 4, cy + 9], [cx - 2.4, cy + 9], [cx - 3.2, cy + 11]], C.white).poly([[cx + 2.4, cy + 9], [cx + 4, cy + 9], [cx + 3.2, cy + 11]], C.white);
}

const ART = {
  // MAIN STORY ---------------------------------------------------------------
  bet(p) {
    p.poly(rrect(13, 13, 20, 11, -0.35), g.billD);
    p.poly(rrect(13, 13, 17.4, 8.4, -0.35), g.bill);
    p.ell(13, 13, 3.2, 3.6, g.billL);
    p.raw(['.##.', '#...', '.##.', '...#', '.##.'], 24, 22, { '#': g.billD });
    trophyCup(p, 24, 8, 0.95);
    sp(p, 36, 4, 2); sp(p, 4, 30, 1);
  },
  vialPop(p) {
    vialShape(p, 14, 15, 12, 23, C.pink, C.pinkL, null);
    p.rr(13, 14, 14, 2.4, 1, C.glassD);
    p.rr(15, 2, 10, 6, 1.5, C.wood).rect(15, 2, 10, 1.6, '#e2a060');
    for (const [x, y] of [[12, 12], [27, 11], [20, 11]]) p.line(x, y, x + (x - 20) * 0.15, y - 2.5, C.white, 0, true);
    for (const [x, y, c] of [[9, 9, C.pink], [31, 8, C.pinkL], [6, 15, C.pinkL], [34, 14, C.pink], [24, 9.5, C.pinkL]]) p.circ(x, y, 1.2, c);
    sp(p, 35, 3, 2); sp(p, 5, 4, 1);
  },
  cardUp(p) {
    cardShape(p, 4, 6, 20, 27, C.snow, C.blueL, C.blue);
    p.circ(14, 14, 4, C.blue).rr(12, 16.5, 4, 3, 1, C.blueD);
    upArrow(p, 31, 4, 1.05);
    p.rect(6, 34.4, 26, 2.2, C.steel);
    p.rr(4, 30.5, 4.4, 10, 1, C.grayD).rr(29.6, 30.5, 4.4, 10, 1, C.grayD).rr(8.6, 32, 2.4, 7, 0.6, C.gray).rr(27, 32, 2.4, 7, 0.6, C.gray);
    sp(p, 37, 26, 1);
  },
  squad(p) {
    // five troops lined up for the photo: two in the back, three in front, the leader in the middle
    troop(p, 9, 27, 0.72, '#232849');
    troop(p, 31, 27, 0.72, '#232849');
    troop(p, 6, 38, 0.8, '#2c3260');
    troop(p, 34, 38, 0.8, '#2c3260');
    troop(p, 20, 39, 1.08, '#363e74', C.cyan);
    p.rect(1, 38.4, 38, 1.6, '#4a5280');
    sp(p, 37, 4, 2); sp(p, 3, 6, 1);
  },
  baseUp(p) {
    baseShape(p, 15, 37, 0.95);
    upArrow(p, 33, 5, 0.9);
    p.rect(1, 37, 38, 2, C.greenD);
    sp(p, 6, 6, 1);
  },
  toilet(p) {
    p.rr(9, 6, 15, 12, 2, g.toilet).rect(10, 8, 13, 1.6, C.silver);
    p.poly([[5, 20], [30, 20], [28, 27], [23, 30], [21, 37], [12, 37], [11, 30], [6, 27]], g.toilet);
    p.ell(17.5, 20, 13.5, 3, C.silver).ell(17.5, 20.5, 10.5, 1.6, g.water);
    p.line(30, 3, 22, 18, C.wood, 1.2);
    p.ell(21.5, 18.4, 4.4, 2.6, C.red);
    for (const [x, y] of [[4, 15], [33, 14], [8, 12]]) p.circ(x, y, 1.1, C.blueL);
    p.dot(35, 23, C.ink).dot(36, 22, C.white).dot(34, 22, C.white);
    sp(p, 36, 30, 1);
  },
  streak(p) {
    flameShape(p, 7, 37, 0.42);
    flameShape(p, 18, 37, 0.62);
    flameShape(p, 31, 37, 0.85);
    p.rect(1, 37.5, 38, 1.5, C.orangeD);
  },
  research(p) {
    p.rect(17, 3, 6, 10, C.glass).rr(16, 2, 8, 2.4, 1, C.glassD);
    p.circ(20, 21, 10, C.glass);
    p.each((x, y) => ((x - 20) ** 2 + (y - 21) ** 2 <= 8.6 * 8.6 && y > 19 ? C.green : undefined));
    p.line(12, 19.5, 28, 19.5, C.greenL, 0, true);
    for (const [x, y, r] of [[17, 25, 1.4], [23, 23, 1], [21, 15, 0.9], [19, 9, 0.8]]) p.ring(x, y, r + 0.5, r - 0.5, C.greenL);
    p.line(14, 15, 12, 19, C.white, 0, true);
    p.rect(15, 33, 10, 5, C.steel).rect(15, 33, 10, 1.4, C.snow);
    p.poly([[17, 33], [20, 27.5], [23, 33]], C.blue).poly([[18.6, 33], [20, 30], [21.4, 33]], C.cyan);
    p.line(12, 38.5, 28, 38.5, C.silverD, 0.4);
    sp(p, 32, 6, 2);
  },
  fullHouse(p) {
    const cols = [[C.pink, C.pinkL], [C.purple, C.purpleL], [C.blue, C.blueL], [C.green, C.greenL], [C.gold, C.goldL]];
    cols.forEach(([b, a], i) => {
      const ang = (i - 2) * 0.32;
      const cx = 20 + Math.sin(ang) * 11, cy = 23 - Math.cos(ang) * 6;
      p.poly(rrect(cx, cy, 13, 19, ang), C.snow);
      p.poly(rrect(cx + Math.sin(ang) * -1.5, cy - Math.cos(ang) * 1.5, 9.4, 9.4, ang), b);
      p.poly(rrect(cx - Math.sin(ang) * -1.5 + Math.cos(ang) * 0, cy + Math.cos(ang) * 5.4, 9, 2, ang), a);
    });
    sp(p, 36, 4, 2);
  },
  ult(p) {
    p.star(20, 20, 18, 10.5, 10, C.gold);
    p.star(20, 20, 13.5, 8, 10, C.goldL);
    p.poly([[23, 4], [11, 22], [19, 22], [15, 36], [29, 16], [21, 16], [26, 4]], C.white);
    p.poly([[22.6, 7], [14, 20.6], [20.6, 20.6], [18, 30], [26, 17.6], [19.6, 17.6]], C.cyan);
    sp(p, 5, 6, 2); sp(p, 35, 33, 1);
  },
  exitDoor(p) {
    p.rect(8, 9, 24, 30, '#4e5878');
    p.rr(10, 11, 20, 28, 1, C.steel);
    p.rr(13, 14, 14, 8, 1, '#1a3c8a').rr(14, 15, 12, 6, 0.5, C.cyan);
    p.line(15, 16, 18, 16, C.white, 0, true);
    p.circ(26, 27, 1.6, C.gold);
    p.rect(10, 31, 20, 1.4, C.silverD);
    p.rr(12, 1.5, 16, 6, 1, C.greenD).rr(13, 2.4, 14, 4.2, 0.6, C.green);
    p.poly([[16, 3.4], [16, 5.6], [21, 5.6], [21, 6.4], [24.5, 4.5], [21, 2.6], [21, 3.4]], C.white);
    sp(p, 36, 12, 1);
  },
  kingClog(p) { bossToilet(p, 20, 22); sp(p, 35, 6, 2); },
  choco(p) {
    p.poly(rrect(20, 22, 22, 32, 0.25), C.goldD);
    p.poly(rrect(20, 22, 19.4, 29.4, 0.25), g.foil);
    p.each((x, y) => {
      const a = -0.25, c = Math.cos(a), s = Math.sin(a), dx = x - 20, dy = y - 22;
      const u = dx * c - dy * s, v = dx * s + dy * c;
      if (Math.abs(u) > 8.6 || v < -14 || v > 1) return undefined;
      if ((u + 8.6) ** 2 + (v + 14) ** 2 < 25) return undefined; // a bite
      const gu = ((u + 8.6) % 5.8 + 5.8) % 5.8, gv = ((v + 14) % 5 + 5) % 5;
      return gu < 0.9 || gv < 0.9 ? g.choc : g.chocL;
    });
    for (const [x, y] of [[12, 27], [27, 24.6]]) p.rr(x, y, 2, 4, 1, g.choc);
    sp(p, 34, 5, 2);
  },
  storyDone(p) {
    trophyCup(p, 20, 6, 1.12);
    for (const [x, y, c] of [[5, 6, C.pink], [34, 9, C.cyan], [8, 20, C.gold], [33, 22, C.green], [3, 30, C.purple], [37, 32, C.pink]]) p.rect(x, y, 2, 2, c);
    sp(p, 36, 3, 2); sp(p, 3, 12, 1);
  },
  // DAILY -------------------------------------------------------------------
  swords(p) {
    swordShape(p, 33, 4, 6, 36);
    swordShape(p, 7, 4, 34, 36);
    p.star(20, 18, 5, 2, 4, C.white);
    sp(p, 34, 30, 1);
  },
  burgerTroop(p) {
    p.rect(13, 30, 3, 7, C.choco).rect(24, 30, 3, 7, C.choco).rr(11, 36, 6, 3, 1, C.red).rr(23, 36, 6, 3, 1, C.red);
    p.ell(20, 13, 15, 9, C.orange).rect(5, 13, 30, 4, C.orange);
    p.poly([[4, 17], [36, 17], [33, 20], [27, 18.5], [21, 20.5], [15, 18.5], [8, 20.5]], C.green);
    p.rr(4, 20, 32, 4.6, 1.5, C.choco);
    p.poly([[3, 24.4], [37, 24.4], [34, 27], [6, 27]], C.gold);
    p.rr(5, 26.6, 30, 5, 2.4, C.orangeD);
    for (const [x, y] of [[11, 8], [18, 6.4], [26, 8.4], [14, 11.5], [23, 11]]) p.ell(x, y, 1, 0.6, '#fff4dc');
    p.rr(13, 9.5, 4, 4, 1, C.white).rr(23, 9.5, 4, 4, 1, C.white).rect(14.5, 10.6, 2, 2.4, C.ink).rect(24.5, 10.6, 2, 2.4, C.ink);
  },
  burgerThrow(p) {
    for (const [y, l] of [[14, 9], [19, 12], [24, 8]]) p.line(2, y, 2 + l, y, C.white, 0.2, true);
    const cx = 22, cy = 19;
    p.ell(cx, cy - 4, 11, 6.4, C.orange).rect(cx - 11, cy - 4, 22, 3, C.orange);
    p.poly([[cx - 12, cy - 1], [cx + 12, cy - 1], [cx + 9, cy + 1.5], [cx + 3, cy], [cx - 3, cy + 1.5], [cx - 9, cy]], C.green);
    p.rr(cx - 12, cy + 1, 24, 3.6, 1.2, C.choco).rr(cx - 11, cy + 4.2, 22, 4.2, 2, C.orangeD);
    for (const [x, y] of [[cx - 5, cy - 7], [cx + 1, cy - 8], [cx + 6, cy - 6]]) p.ell(x, y, 0.9, 0.5, '#fff4dc');
    p.star(36, 32, 4.6, 2, 7, C.red).star(36, 32, 2.4, 1.2, 7, C.orangeL);
    sp(p, 30, 6, 1);
  },
  cart(p) {
    p.line(1, 7, 7, 7, C.silverD, 1).line(7, 7, 11, 28, C.silverD, 1);
    p.poly([[9, 12], [38, 12], [34, 28], [12, 28]], C.red);
    p.poly([[11, 14.5], [35.6, 14.5], [32.4, 26], [13.6, 26]], C.redL);
    for (let x = 15; x < 33; x += 4.5) p.line(x, 15, x - 0.6, 25.5, C.redD, 0, true);
    for (const [x, c] of [[15, C.gold], [20, C.green], [25, C.blue], [30, C.purple]]) p.rr(x - 2, 7, 4, 7, 1, c);
    p.rect(11, 30, 25, 2.4, C.silverD);
    p.circ(15, 35, 3.4, C.grayD).circ(32, 35, 3.4, C.grayD).circ(15, 35, 1.3, C.silver).circ(32, 35, 1.3, C.silver);
  },
  cartSmash(p) {
    p.poly([[6, 18], [30, 10], [33, 24], [12, 31]], C.red);
    p.poly([[8.6, 19], [28.6, 12.6], [30.8, 22.6], [13, 28.6]], C.redL);
    p.line(30, 10, 36, 6, C.silverD, 1);
    p.circ(10, 35, 3.2, C.grayD).circ(10, 35, 1.2, C.silver);
    p.circ(33, 33, 3.2, C.grayD).circ(33, 33, 1.2, C.silver);
    p.star(24, 8, 6, 2.6, 7, C.gold).star(24, 8, 3, 1.4, 7, C.white);
    for (const [x, y, c] of [[5, 8, C.silverD], [37, 18, C.red], [3, 26, C.silverD]]) p.rect(x, y, 2.4, 2.4, c);
  },
  vials(p) {
    const vial = (cx, cy, a, liq) => {
      const at = (ly) => [cx - ly * Math.sin(a), cy + ly * Math.cos(a)];
      p.poly(rrect(cx, cy, 9, 26, a), C.glass);
      p.poly(rrect(...at(5.5), 7, 13, a), liq);
      p.poly(rrect(...at(-13.5), 10.6, 5, a), C.wood);
      p.line(...at(-9).map((v, i) => v + (i === 0 ? -2.6 * Math.cos(a) : -2.6 * Math.sin(a))), ...at(0).map((v, i) => v + (i === 0 ? -2.6 * Math.cos(a) : -2.6 * Math.sin(a))), C.white, 0, true);
    };
    vial(15, 22, -0.4, C.green);
    vial(25, 22, 0.4, C.pink);
    sp(p, 36, 6, 2); sp(p, 4, 32, 1); sp(p, 20, 4, 1);
  },
  mega(p) {
    const sh = [[5, 4], [35, 4], [35, 21], [20, 38], [5, 21]];
    p.poly(sh, C.mag);
    p.poly(sh.map(([x, y]) => [20 + (x - 20) * 0.78, 19 + (y - 19) * 0.78]), C.pinkD);
    p.poly([[23, 7], [13, 22], [19, 22], [16, 33], [27, 17], [21, 17], [25, 7]], C.gold);
    sp(p, 36, 34, 1);
  },
  troops(p) {
    for (const [y, l] of [[22, 6], [28, 8], [34, 5]]) p.line(1, y, 1 + l, y, C.white, 0.1, true);
    troop(p, 13, 37, 0.62, '#2c3260');
    troop(p, 22, 38, 0.72, '#323a6c');
    troop(p, 32, 37, 0.62, '#2c3260');
    sp(p, 36, 6, 2);
  },
  baseBoom(p) {
    baseShape(p, 17, 38, 0.95);
    p.line(12, 25, 15, 30, C.ink, 0, true).line(15, 30, 13, 34, C.ink, 0, true);
    p.star(30, 10, 9, 4, 9, C.orange).star(30, 10, 5.4, 2.6, 9, C.gold).star(30, 10, 2.4, 1.2, 9, C.white);
    for (const [x, y, c] of [[22, 4, C.snow], [37, 20, C.blue], [36, 2, C.snow]]) p.rect(x, y, 2.4, 2.4, c);
  },
  phone(p) {
    p.rr(7, 4, 18, 31, 3, C.ink);
    p.rr(8.6, 7.4, 14.8, 23, 1, C.cyan);
    p.rect(10, 10, 9, 1.4, C.white).rect(10, 13, 11, 1.4, C.blueL).rect(10, 16, 7, 1.4, C.blueL);
    p.circ(22, 8, 2.6, C.red);
    p.ring(27, 24, 8, 5.6, C.silverD);
    p.circ(27, 24, 5.6, C.glass);
    p.line(23.4, 21, 25, 19.6, C.white, 0, true);
    p.line(32.5, 30, 37.5, 36, C.wood, 1.4);
    sp(p, 4, 37, 1);
  },
  panther(p) {
    p.poly([[7, 12], [9, 2], [16, 9]], '#24243a').poly([[33, 12], [31, 2], [24, 9]], '#24243a');
    p.poly([[9.6, 10], [10.4, 5], [13.6, 9]], C.pinkL).poly([[30.4, 10], [29.6, 5], [26.4, 9]], C.pinkL);
    p.ell(20, 21, 15, 14, '#24243a');
    p.ell(20, 27, 8, 6, '#3a3a56');
    p.poly([[10, 17], [17, 18.6], [16, 21.6], [10.4, 20]], C.gold).poly([[30, 17], [23, 18.6], [24, 21.6], [29.6, 20]], C.gold);
    p.rect(13.4, 18.4, 1.6, 2.6, C.ink).rect(25, 18.4, 1.6, 2.6, C.ink);
    p.poly([[17.6, 24], [22.4, 24], [20, 26.6]], C.pink);
    p.line(14, 28, 6, 27, C.white, 0, true).line(14, 30, 6, 31, C.white, 0, true).line(26, 28, 34, 27, C.white, 0, true).line(26, 30, 34, 31, C.white, 0, true);
    p.line(18, 30.4, 22, 30.4, C.ink, 0, true);
  },
  gorilla(p) {
    p.poly([[13, 9], [16, 3], [20, 7], [24, 3], [27, 9]], C.gold).dot(19.5, 6.5, C.red);
    p.ell(20, 22, 16, 15, g.fur);
    p.ell(6, 22, 3.4, 4, g.furL).ell(34, 22, 3.4, 4, g.furL);
    p.ell(20, 25, 11, 10, g.face);
    p.rr(10, 15, 20, 4, 1.5, g.fur);
    p.poly([[11, 18.4], [18, 19.4], [17, 22], [11.6, 21]], C.red).poly([[29, 18.4], [22, 19.4], [23, 22], [28.4, 21]], C.red);
    p.ell(17.4, 25.6, 1.4, 1, C.ink).ell(22.6, 25.6, 1.4, 1, C.ink);
    p.rr(13, 29.5, 14, 4.4, 1.5, C.ink);
    p.poly([[14, 29.5], [16, 29.5], [15, 32]], C.white).poly([[24, 29.5], [26, 29.5], [25, 32]], C.white);
  },
  glove(p) {
    p.rr(8, 24, 16, 12, 2, C.white).rect(8, 27, 16, 2.4, C.redD);
    p.ell(20, 15, 14, 11, C.red);
    p.ell(9, 18, 5.4, 6, C.red);
    p.line(16, 8, 26, 8, C.redL, 0.4, true);
    p.line(11, 14, 8, 20, C.redD, 0, true);
    for (const [x, y] of [[30, 30], [34, 26], [36, 33]]) p.line(x, y, x + 3, y - 1, C.gold, 0.3, true);
    p.star(34, 7, 4.4, 1.8, 4, C.gold);
  },
};
/**
 * The objective as a picture: a house icon (+ a small badge icon) or a mini illustration.
 * Keyed by main quest id, daily stat, or chain quest id.
 */
export const QUEST_OBJ = {
  firstWin: { ic: 'trophy' }, openVial: { ic: 'vial' }, upgrade: { ic: 'cards', b: 'up' }, deck5: { ic: 'cards' }, baseUps: { ic: 'lab', b: 'up' },
  toilets: { art: 'toilet' }, streak: { ic: 'fire' }, research: { ic: 'flask' }, deck8: { ic: 'cards' }, ult: { ic: 'lightning' },
  arena2: { ic: 'trophy' }, kingClog: { ic: 'boss' }, arena3: { ic: 'trophy' },
  wins: { ic: 'trophy' }, deployFood: { ic: 'burger' }, castfoodThrow: { art: 'burgerThrow' }, martBattles: { ic: 'cart' }, vialsOpened: { ic: 'vial' },
  signatures: { ic: 'lightning' }, deployed: { ic: 'swarm' }, cartsSmashed: { ic: 'cart', b: 'bomb' }, basesDestroyed: { ic: 'lab', b: 'bomb' },
  baseUpgrades: { ic: 'lab', b: 'up' }, megasUsed: { ic: 'mega' },
  nolan1: { ic: 'trophy' }, nolan2: { ic: 'eye' }, nolan3: { art: 'panther' }, nolan4: { ic: 'vial' }, nolan5: { ic: 'boss' },
  juan1: { ic: 'cart' }, juan2: { ic: 'cart', b: 'bomb' }, juan3: { ic: 'boss' },
};

/** Which illustration each quest / daily stat / chain quest gets. */
export const ART_FOR = {
  firstWin: 'bet', openVial: 'vialPop', upgrade: 'cardUp', deck5: 'squad', baseUps: 'baseUp', toilets: 'toilet', streak: 'streak',
  research: 'research', deck8: 'fullHouse', ult: 'ult', arena2: 'exitDoor', kingClog: 'kingClog', arena3: 'choco',
  wins: 'swords', deployFood: 'burgerTroop', castfoodThrow: 'burgerThrow', martBattles: 'cart', vialsOpened: 'vials', signatures: 'ult',
  deployed: 'troops', cartsSmashed: 'cartSmash', basesDestroyed: 'baseBoom', baseUpgrades: 'baseUp', megasUsed: 'mega',
  nolan1: 'swords', nolan2: 'phone', nolan3: 'panther', nolan4: 'vials', nolan5: 'kingClog', juan1: 'cart', juan2: 'cartSmash', juan3: 'gorilla',
  jimmyRematch: 'glove', end: 'storyDone',
};
/** Illustration data URL (house icon shader, 40-unit grid at HD 2 -> 88 px). */
export function questArt(key) {
  const name = ART[key] ? key : ART_FOR[key] ?? 'storyDone';
  return cached('art|' + name, () => {
    const p = new PixCanvas(ART_N, 1, 2);
    ART[name](p);
    return renderPixArt(p, { glints: 2 });
  });
}
export const QUEST_ART_NAMES = Object.keys(ART);

// ============================================================================ tally marks

/**
 * Hand-drawn progress: a pen check box for 1, tally marks (groups of five, the fifth struck
 * through) up to 12. Done marks in blue ink, the rest faint pencil. 1 texel = 1 CSS px, 28 px tall.
 */
export function tallyURL(done, total) {
  return cached(`tally|${done}/${total}`, () => {
    const ink = cl('#1d2a6e'), inkL = cl('#3a4aa0'), pencil = cl('#9a8e74');
    if (total <= 1) {
      const P = new Px(28, 28);
      const box = [[3, 5], [22, 3], [24, 24], [4, 25], [3, 5]];
      for (let i = 1; i < box.length; i++) { P.line(box[i - 1][0], box[i - 1][1], box[i][0], box[i][1], cl('#3a2a14'), 0.9); P.line(box[i - 1][0] + 1, box[i - 1][1], box[i][0] + 1, box[i][1], cl('#3a2a14'), 0.5); }
      if (done >= 1) {
        const ck = [[6, 14], [12, 21], [26, 2]];
        for (let w2 = 0; w2 < 3; w2++) for (let i = 1; i < ck.length; i++) P.line(ck[i - 1][0] + w2 * 0.6, ck[i - 1][1] + (w2 > 1 ? 1 : 0), ck[i][0] + w2 * 0.6, ck[i][1] + (w2 > 1 ? 1 : 0), cl('#c81e2a'));
      }
      return P.url();
    }
    const groups = Math.ceil(total / 5);
    const W = groups * 30 + 4, H = 28;
    const P = new Px(W, H);
    for (let i = 0; i < total; i++) {
      const gI = Math.floor(i / 5), k = i % 5, on = i < done;
      const c = on ? ink : pencil, a = on ? 1 : 0.55;
      const x0 = 4 + gI * 30;
      if (k < 4) {
        const x = x0 + k * 6, wob = (k % 2) * 1;
        P.line(x, 4 + wob, x + (k === 2 ? 1 : 0), 23 + ((k + 1) % 2), c, a);
        if (on) { P.line(x + 1, 4 + wob, x + 1 + (k === 2 ? 1 : 0), 23 + ((k + 1) % 2), inkL, 0.9); }
      } else {
        P.line(x0 - 2, 20, x0 + 22, 6, c, a);
        if (on) P.line(x0 - 2, 21, x0 + 22, 7, inkL, 0.9);
      }
    }
    return P.url();
  });
}

// ============================================================================ red string

/**
 * Red yarn between points (CSS px, relative to the canvas) with a sag, painted at `px` CSS px per
 * texel. segs: [[{x, y}, {x, y}], ...].
 */
export function drawString(canvas, w, hh, px, segs) {
  const W = Math.max(1, Math.ceil(w / px)), H = Math.max(1, Math.ceil(hh / px));
  canvas.width = W; canvas.height = H;
  canvas.style.width = W * px + 'px';
  canvas.style.height = H * px + 'px';
  const g2 = canvas.getContext('2d');
  g2.clearRect(0, 0, W, H);
  const dot = (x, y, c) => { g2.fillStyle = c; g2.fillRect(Math.round(x), Math.round(y), 1, 1); };
  for (const [a, b] of segs) {
    const x0 = a.x / px, y0 = a.y / px, x1 = b.x / px, y1 = b.y / px;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const sag = Math.max(8, Math.min(30, len * 0.2));
    const steps = Math.ceil(len * 1.6) + 2;
    const pts = [];
    for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag]); }
    for (const [x, y] of pts) { dot(x + 2, y + 3, 'rgba(40,16,4,0.28)'); dot(x + 1, y + 2, 'rgba(40,16,4,0.22)'); }
    for (const [x, y] of pts) { dot(x, y - 1, '#e8404a'); dot(x, y, '#c81e2a'); dot(x, y + 1, '#7a0c14'); }
    for (let i = 0; i < pts.length; i += 5) { dot(pts[i][0], pts[i][1] - 1, '#ff8a90'); dot(pts[i][0] + 1, pts[i][1], '#ff6a70'); }
  }
}

// ============================================================================ inject

let injected = false;
/** Paint every shared sprite once and expose them as CSS custom properties. */
export function ensureBoardArt() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  noiseTex();
  const v = {};
  v['--qb-cork'] = corkTile();
  for (const [k, c] of Object.entries({ red: '#e8303a', blue: '#2b8cf2', green: '#3ec43a', yellow: '#ffc21a' })) v['--qb-pin-' + k] = pinSprite(c);
  v['--qb-tape'] = tapeSprite();
  v['--qb-ink'] = inkMask();
  v['--qb-polaroid'] = polaroidSprite();
  v['--qb-talk'] = talkBadge();
  v['--qb-bubble'] = bubbleSprite(); v['--qb-tail'] = bubbleTail();
  v['--qb-clip'] = clipSprite();
  v['--qb-bang'] = bangSticker();
  v['--qb-coffee'] = coffee();
  for (const [k, s] of Object.entries(DOODLES)) v['--qb-doodle-' + k] = doodle(s, k === 'toilet' ? '#1c1430' : '#23306e');
  v['--qb-tab-on'] = tabSprite('on'); v['--qb-tab-off'] = tabSprite('off'); v['--qb-tab-lock'] = tabSprite('lock');
  v['--qb-plate'] = plateSprite();
  const st = document.createElement('style');
  st.id = 'quest-board-art';
  st.textContent = `:root{${Object.entries(v).map(([k, u]) => `${k}:url(${u})`).join(';')}}`;
  document.head.appendChild(st);
}
