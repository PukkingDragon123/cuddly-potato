// Hi-res pixel-art icon set. Every icon is painted on a 32x32 pixel grid
// (reward art on 48x48) with small raster primitives (circles, polygons,
// rounded rects, lines, ascii art) and then run through a "pixel artist"
// shader pass:
//   - every flat colour region is lit from the TOP-LEFT with a 5-step,
//     hue-shifted ramp (warm highlights, cool purple-blue shadows), combining
//     a per-region bevel, a whole-silhouette dome and a soft directional
//     gradient, with ordered (Bayer) dithering on the ramp boundaries
//   - the biggest regions get a specular glint
//   - selective outline: tinted dark outline on the lit side, ink on the
//     shadow side, a soft outer contact ring and a drop shadow
// Icons designed natively at 32 px use s = 1; the older 16-px designs still
// in the set are drawn at s = 2 (shapes are evaluated at 32 px, so curves and
// diagonals are twice as smooth) and get the same shading.

const N = 16;
const C = {
  ink: '#120c24', white: '#ffffff', gold: '#ffc21a', goldL: '#ffe46a', goldD: '#d8861a', goldDD: '#9a5410', goldW: '#fff6c8',
  pink: '#ff2e88', pinkL: '#ff8ac4', pinkD: '#b8125e', pinkW: '#ffd6ea', mag: '#ff1f9e', blue: '#2b8cf2', blueL: '#8fd4ff', blueD: '#1a52b0',
  cyan: '#7ae8ff', green: '#4cd24a', greenL: '#a8f07a', greenD: '#238a2e', red: '#f23a4a', redL: '#ff8a90', redD: '#a01a2a',
  purple: '#a35cff', purpleL: '#d4aaff', purpleD: '#5e2aa8', orange: '#ff8a1f', orangeL: '#ffc06a', orangeD: '#c04a10',
  silver: '#cdd5ea', silverD: '#7e8aa8', brown: '#a0602e', brownD: '#653818', teal: '#3ff2c8', tealD: '#13a08a',
  skin: '#f2c4a2', choco: '#6a3a1e', gray: '#8a96b8', grayD: '#4e5878',
  volt: '#3a6cff', voltL: '#5a9cff', voltD: '#2a2a9e',
  // shadeable near-whites (pure #fff stays flat)
  snow: '#eef4ff', glass: '#cfeeff', glassD: '#8fc4ec', pearl: '#f6eefc', steel: '#b4bfd8', wood: '#b06a32', woodD: '#7a4220',
};

// --------------------------------------------------------------------------- colour helpers

const hexRgb = (hex) => { const h = parseInt(hex.slice(1), 16); return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; };
const rgbHex = (r, g, b) => '#' + ((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).padStart(6, '0');
const RGB = new Map();
const rgbOf = (hex) => { let v = RGB.get(hex); if (!v) RGB.set(hex, (v = hexRgb(hex))); return v; };
const MIX = new Map();
const mix = (a, b, t) => { const key = a + b + t; let v = MIX.get(key); if (v) return v; v = mix0(a, b, t); MIX.set(key, v); return v; };
const mix0 = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
function toHsl(hex) {
  let [r, g, b] = hexRgb(hex); r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
const toward = (h, target, amt) => { let d = ((target - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), amt); };
const RAMPS = new Map();
/** 5-tone hue-shifted ramp: [deep shadow, shadow, base, light, highlight]. */
function ramp(hex) {
  let r = RAMPS.get(hex);
  if (r) return r;
  const [h, s, l] = toHsl(hex);
  const grey = s < 0.12;
  const sh = (k) => fromHsl(toward(grey ? 235 : h, 250, 9 * k), grey ? 0.1 + 0.06 * k : s * (1 + 0.06 * k) + 0.04 * k, Math.max(0.07, l * (1 - 0.21 * k)));
  const hi = (k) => fromHsl(toward(h, 52, grey ? 0 : 6 * k), s * (1 - 0.08 * k), l + (1 - l) * (k === 1 ? 0.24 : 0.52));
  r = [sh(2), sh(1), hex, hi(1), hi(2)];
  RAMPS.set(hex, r);
  return r;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// --------------------------------------------------------------------------- raster canvas

class Pix {
  /** n = design units, s = raw pixels per design unit. */
  constructor(n = N, s = 2) {
    this.n = n; this.s = s; this.R = n * s;
    this.g = new Array(this.R * this.R).fill(null);
    this.fl = new Uint8Array(this.R * this.R);
  }
  _set(i, j, c, flat) {
    if (i < 0 || j < 0 || i >= this.R || j >= this.R) return;
    this.g[j * this.R + i] = c;
    this.fl[j * this.R + i] = flat ? 1 : 0;
  }
  /** Paint every raw pixel for which fn(x, y) (design coords of the pixel centre) returns a colour (null erases). */
  each(fn, flat = false, box = null) {
    const { R, s } = this;
    const i0 = box ? Math.max(0, Math.floor(box[0] * s) - 1) : 0, i1 = box ? Math.min(R, Math.ceil(box[2] * s) + 1) : R;
    const j0 = box ? Math.max(0, Math.floor(box[1] * s) - 1) : 0, j1 = box ? Math.min(R, Math.ceil(box[3] * s) + 1) : R;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const c = fn((i + 0.5) / s, (j + 0.5) / s, i, j);
      if (c !== undefined) this._set(i, j, c, flat);
    }
    return this;
  }
  get(x, y) { const s = this.s, i = Math.floor(x * s), j = Math.floor(y * s); return i >= 0 && j >= 0 && i < this.R && j < this.R ? this.g[j * this.R + i] : null; }
  px(x, y, c) { x = Math.round(x); y = Math.round(y); const s = this.s; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this._set(x * s + i, y * s + j, c); return this; }
  rect(x, y, w, h, c) {
    const s = this.s, x0 = Math.round(x * s), y0 = Math.round(y * s), x1 = Math.round((x + w) * s), y1 = Math.round((y + h) * s);
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this._set(i, j, c);
    return this;
  }
  /** Rounded rect (stepped corners). */
  rr(x, y, w, h, r, c) {
    return this.each((X, Y) => {
      if (X < x || Y < y || X > x + w || Y > y + h) return undefined;
      const cx = Math.max(x + r, Math.min(x + w - r, X)), cy = Math.max(y + r, Math.min(y + h - r, Y));
      return (X - cx) ** 2 + (Y - cy) ** 2 <= r * r + 0.3 ? c : undefined;
    }, false, [x, y, x + w, y + h]);
  }
  circ(cx, cy, r, c) { return this.each((x, y) => ((x - cx) ** 2 + (y - cy) ** 2 <= r * r ? c : undefined), false, [cx - r, cy - r, cx + r, cy + r]); }
  ell(cx, cy, rx, ry, c) { return this.each((x, y) => (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 ? c : undefined), false, [cx - rx, cy - ry, cx + rx, cy + ry]); }
  ring(cx, cy, ro, ri, c) { return this.each((x, y) => { const d = (x - cx) ** 2 + (y - cy) ** 2; return d <= ro * ro && d > ri * ri ? c : undefined; }, false, [cx - ro, cy - ro, cx + ro, cy + ro]); }
  poly(pts, c) {
    const n = pts.length, xs = new Float64Array(n), ys = new Float64Array(n);
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let i = 0; i < n; i++) { const x = (xs[i] = pts[i][0]), y = (ys[i] = pts[i][1]); if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    return this.each((X, Y) => {
      let ins = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = ys[i], yj = ys[j];
        if (yi > Y !== yj > Y && X < ((xs[j] - xs[i]) * (Y - yi)) / (yj - yi) + xs[i]) ins = !ins;
      }
      return ins ? c : undefined;
    }, false, [bx0, by0, bx1, by1]);
  }
  /** Regular star / polygon (n points, outer ro, inner ri; ri = ro for a polygon). */
  star(cx, cy, ro, ri, n, c, rot = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = rot + (i * Math.PI) / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return this.poly(pts, c);
  }
  line(x0, y0, x1, y1, c, t = 0, flat = false) {
    const s = this.s, w = Math.max(1, Math.round((t + 1) * s));
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * s * 2));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      const i0 = Math.round(x * s + s / 2 - w / 2), j0 = Math.round(y * s + s / 2 - w / 2);
      for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) this._set(i0 + i, j0 + j, c, flat);
    }
    return this;
  }
  art(rows, x0, y0, pal) {
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch] !== undefined) this.px(x0 + x, y0 + y, pal[ch]); }));
    return this;
  }
  /** Raw-pixel ascii art (1 char = 1 raw pixel), flat (unshaded) unless shade = true. */
  raw(rows, i0, j0, pal, shade = false) {
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch] !== undefined) this._set(i0 + i, j0 + j, pal[ch], !shade); }));
    return this;
  }
  flat(x, y) { const s = this.s; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const k = (Math.round(y) * s + j) * this.R + Math.round(x) * s + i; if (k >= 0 && k < this.fl.length) this.fl[k] = 1; } return this; }
  /** Unshaded single raw pixel. */
  dot(i, j, c) { this._set(Math.round(i), Math.round(j), c, true); return this; }
  /** 4-point sparkle at raw (i, j): white core, arms of length l fading to gold. */
  spark(i, j, l = 2, c = C.white, c2 = '#fff2a0') {
    this.dot(i, j, c);
    for (let k = 1; k <= l; k++) { const cc = k === l ? c2 : c; this.dot(i + k, j, cc).dot(i - k, j, cc).dot(i, j + k, cc).dot(i, j - k, cc); }
    if (l >= 3) { this.dot(i + 1, j + 1, c2).dot(i - 1, j - 1, c2).dot(i + 1, j - 1, c2).dot(i - 1, j + 1, c2); }
    return this;
  }
  /** Shift every flagged pixel inside a mask colour by a dither of two colours (for hand-placed texture). */
  dither(fn, c1, c2, thr = 0.5) { return this.each((x, y, i, j) => (fn(x, y) ? (bayer(i, j) < thr ? c1 : c2) : undefined)); }
}

// --------------------------------------------------------------------------- shader / renderer

function render(p, o = {}) {
  const R = p.R, g = p.g, M = 2, S = R + M * 2;
  const filled = (x, y) => x >= 0 && y >= 0 && x < R && y < R && g[y * R + x] !== null;
  // ---- regions (4-connected same colour)
  const lab = new Int32Array(R * R).fill(-1);
  const regs = [];
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const k0 = y * R + x;
    if (g[k0] === null || lab[k0] >= 0) continue;
    const col = g[k0], id = regs.length, r = { col, n: 0, x0: x, x1: x, y0: y, y1: y, best: -9, bk: -1 };
    regs.push(r);
    const st = [k0];
    lab[k0] = id;
    while (st.length) {
      const k = st.pop(), cx = k % R, cy = (k / R) | 0;
      r.n++;
      if (cx < r.x0) r.x0 = cx; if (cx > r.x1) r.x1 = cx; if (cy < r.y0) r.y0 = cy; if (cy > r.y1) r.y1 = cy;
      if (cx + 1 < R && lab[k + 1] < 0 && g[k + 1] === col) { lab[k + 1] = id; st.push(k + 1); }
      if (cx > 0 && lab[k - 1] < 0 && g[k - 1] === col) { lab[k - 1] = id; st.push(k - 1); }
      if (cy + 1 < R && lab[k + R] < 0 && g[k + R] === col) { lab[k + R] = id; st.push(k + R); }
      if (cy > 0 && lab[k - R] < 0 && g[k - R] === col) { lab[k - R] = id; st.push(k - R); }
    }
  }
  const out = new Array(R * R).fill(null);
  const shadeOn = o.shade !== false;
  // silhouette bbox (whole-object light falloff)
  let sx0 = R, sx1 = 0, sy0 = R, sy1 = 0;
  for (let k = 0; k < R * R; k++) if (g[k] !== null) { const x = k % R, y = (k / R) | 0; if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
  // small details (ticks, dots, eyes) sit ON a surface: they don't bevel the region around them
  const out1 = (X, Y, l) => { if (X < 0 || Y < 0 || X >= R || Y >= R) return true; const m = lab[Y * R + X]; return m !== l && (m < 0 || regs[m].n >= 16 || g[Y * R + X] === C.ink && regs[m].n >= 6); };
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const k = y * R + x, col = g[k];
    if (col === null) continue;
    const l = lab[k], r = regs[l];
    if (!shadeOn || p.fl[k] || col === C.ink || col === C.white || r.n < 5) { out[k] = col; continue; }
    // bevel: which sides of the region this pixel touches (1 px band, plus a softer 2nd band on bigger regions)
    let e = 0;
    if (out1(x, y - 1, l)) e += 1; else if (r.n > 60 && out1(x, y - 2, l)) e += 0.45;
    if (out1(x - 1, y, l)) e += 0.55; else if (r.n > 60 && out1(x - 2, y, l)) e += 0.25;
    if (out1(x, y + 1, l)) e -= 0.95; else if (r.n > 60 && out1(x, y + 2, l)) e -= 0.4;
    if (out1(x + 1, y, l)) e -= 0.6; else if (r.n > 60 && out1(x + 2, y, l)) e -= 0.25;
    // silhouette rim (outer edges of the whole object read strongest)
    let rim = 0;
    if (!filled(x, y - 1)) rim += 0.35; if (!filled(x, y + 1)) rim -= 0.3; if (!filled(x + 1, y)) rim -= 0.15;
    // soft light falloff across the region and the whole object (top-left -> bottom-right)
    const bw = (r.x1 - r.x0) / 2 + 1, bh = (r.y1 - r.y0) / 2 + 1;
    const gr = -(((x - (r.x0 + r.x1) / 2) / bw) * 0.45 + ((y - (r.y0 + r.y1) / 2) / bh) * 0.75);
    const gs = -(((x - (sx0 + sx1) / 2) / ((sx1 - sx0) / 2 + 1)) * 0.45 + ((y - (sy0 + sy1) / 2) / ((sy1 - sy0) / 2 + 1)) * 0.75);
    const v = Math.max(-1.2, Math.min(1.2, e)) * 0.62 + rim + gr * 0.32 + gs * 0.28 + (o.bias ?? 0);
    if (v > r.best + 0.001) { r.best = v; r.bk = k; }
    const lv = Math.max(-2, Math.min(2, Math.round(v * 1.9 + (bayer(x, y) - 0.5) * (o.dither ?? 0.42))));
    out[k] = ramp(col)[lv + 2];
  }
  // ---- specular glints on the two biggest shaded regions
  if (shadeOn && o.glint !== false) {
    const big = regs.filter((r) => r.bk >= 0 && r.n >= 40).sort((a, b) => b.n - a.n).slice(0, o.glints ?? 2);
    for (const r of big) {
      const x = r.bk % R, y = (r.bk / R) | 0;
      out[r.bk] = mix(ramp(r.col)[4], '#ffffff', 0.75);
      if (filled(x + 1, y) && lab[r.bk + 1] === lab[r.bk]) out[r.bk + 1] = mix(ramp(r.col)[4], '#ffffff', 0.35);
    }
  }
  // ---- paint: outer contact ring, selective outline, pixels (one ImageData write)
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(S, S);
  const data = img.data;
  const put = (x, y, hex, a = 255) => { const [r, gg, b] = rgbOf(hex), i = ((y + M) * S + x + M) * 4; data[i] = r; data[i + 1] = gg; data[i + 2] = b; data[i + 3] = a; };
  const ink = o.outline ?? C.ink;
  const isOut = (x, y) => !filled(x, y) && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1));
  for (let y = -M; y < R + M; y++) for (let x = -M; x < R + M; x++) {
    if (filled(x, y)) continue;
    if (isOut(x, y)) {
      // lit side (shape is below / right of this outline pixel): tinted dark outline
      const nb = filled(x, y + 1) ? g[(y + 1) * R + x] : filled(x + 1, y) ? g[y * R + x + 1] : null;
      put(x, y, nb && o.selout !== false && nb !== C.ink ? mix(ramp(nb)[0], ink, 0.62) : ink);
    } else if (o.drop !== false && (isOut(x, y - 1) || isOut(x - 1, y) || isOut(x, y + 1) || isOut(x + 1, y))) {
      put(x, y, '#060414', isOut(x, y - 1) || isOut(x - 1, y) ? 128 : 56);
    }
  }
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) { const col = out[y * R + x]; if (col) put(x, y, col); }
  ctx.putImageData(img, 0, 0);
  render.last = c;
  return c.toDataURL();
}

// --------------------------------------------------------------------------- icon designs

const D = {};
/** def(name, fn, opts): opts.size = design units (16 legacy / 24 reward art at s = 2, 32 native at s = 1). */
const def = (name, fn, opts) => (D[name] = { fn, opts });
const nat = (o = {}) => ({ size: 32, s: 1, ...o });
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

// ---- shared native parts
const BOLT = [[20, 1], [5, 18], [14, 18], [10, 31], [27, 12], [18, 12], [23, 1]];
const scalePts = (pts, k, ox = 0, oy = 0, cx = 16, cy = 16) => pts.map(([x, y]) => [cx + (x - cx) * k + ox, cy + (y - cy) * k + oy]);
function bolt(p, pts, col, core = C.white, edge = null) {
  if (edge) p.poly(pts.map(([x, y]) => [x + 1.2, y + 1.2]), edge);
  p.poly(pts, col);
  if (core) {
    // bright core streak through the two halves of the bolt
    const [a, , , , , f] = pts;
    const m = pts;
    p.line((a[0] + m[6][0]) / 2 - 0.5, a[1] + 2, (m[1][0] + m[2][0]) / 2 + 1, m[1][1] - 1.5, core, 0, true);
    p.line((f[0] + m[4][0]) / 2 - 0.5, f[1] + 1.5, (m[3][0] + m[2][0]) / 2 + 0.5, m[3][1] - 3, core, 0, true);
  }
}
function gemDot(p, x, y, r, col) {
  p.circ(x, y, r, col);
  p.dot(Math.floor(x - r * 0.4), Math.floor(y - r * 0.45), C.white);
}

// ---- currencies
def('coin', (p) => {
  const cx = 16, cy = 15, R = 13.8;
  p.circ(cx, cy + 2.4, R, C.goldDD); // coin thickness
  p.each((x, y) => (dist(x, y, cx, cy + 2.4) <= R && dist(x, y, cx, cy) > R && Math.floor(x) % 3 === 0 ? '#c06e14' : undefined)); // reeded edge
  p.circ(cx, cy, R, C.goldD); // rim
  p.circ(cx, cy, R - 2.4, C.gold); // face
  const b = scalePts(BOLT, 0.6, 0, -1, 16, 16);
  p.poly(b.map(([x, y]) => [x - 1, y - 1]), C.goldW);
  p.poly(b.map(([x, y]) => [x + 1, y + 1]), '#b8640e');
  p.poly(b, C.goldD);
  p.spark(7, 6, 3);
}, nat({ glints: 1 }));

function gemCut(p, x0, y0, w, h, pal) {
  // brilliant cut: table + crown facets over a pavilion; pal = [table, crownL, crownR, pavL, pavM, pavR, edge]
  const x1 = x0 + w, gy = y0 + h * 0.3, cx = x0 + w / 2, tl = x0 + w * 0.26, tr = x0 + w * 0.74, by = y0 + h;
  p.poly([[x0, gy], [tl, y0], [tr, y0], [x1, gy], [cx, by]], pal[4]);
  p.poly([[x0, gy], [cx - w * 0.14, gy], [cx, by]], pal[3]);
  p.poly([[x1, gy], [cx + w * 0.14, gy], [cx, by]], pal[5]);
  p.poly([[x0, gy], [tl, y0], [cx - w * 0.14, gy]], pal[1]);
  p.poly([[x1, gy], [tr, y0], [cx + w * 0.14, gy]], pal[2]);
  p.poly([[tl, y0], [tr, y0], [cx + w * 0.14, gy], [cx - w * 0.14, gy]], pal[0]);
  p.line(x0 + 1, gy, x1 - 1, gy, pal[6], 0, true); // girdle
  p.line(tl + 1, y0 + 0.5, tr - 1, y0 + 0.5, '#ffffff', 0, true);
  p.line(x0 + w * 0.2, gy + 2, cx - 1, by - 3, pal[0], 0, true); // pavilion reflection
}
const PINK_GEM = ['#ffd0e8', '#ff8ac4', '#ff3e98', '#ff4aa0', '#e0187a', '#a00e52', '#ffb0d6'];
def('bucks', (p) => {
  gemCut(p, 1, 4, 30, 25, PINK_GEM);
  p.spark(9, 7, 3).spark(27, 22, 1).spark(5, 18, 1);
}, nat({ shade: false }));
def('gem', D.bucks.fn, nat({ shade: false }));

// ---- POWER
const OCT = (m) => [[9 + m, 1 + m], [23 - m, 1 + m], [31 - m, 9 + m], [31 - m, 23 - m], [23 - m, 31 - m], [9 + m, 31 - m], [1 + m, 23 - m], [1 + m, 9 + m]];
function powerCell(p, boltCol, core, dim = false) {
  p.poly(OCT(0), C.voltD);
  p.poly(OCT(2.2), C.volt);
  p.poly([[11, 4.6], [21, 4.6], [27.4, 11], [27.4, 15], [4.6, 15], [4.6, 11]], C.voltL);
  p.ring(16, 16, 11.6, 10.8, '#2f58e0');
  // corner screws
  for (const [x, y] of [[5, 8], [26, 8], [5, 23], [26, 23]]) p.dot(x, y, '#8ab4ff').dot(x + 1, y + 1, '#1a1a70');
  if (dim) bolt(p, scalePts(BOLT, 0.72), boltCol, null);
  else bolt(p, BOLT, boltCol, core, C.orangeD);
  p.spark(5, 4, 2, C.white, C.cyan);
}
def('power', (p) => powerCell(p, C.gold, C.white), nat());
// card cost badge: a glossy POWER orb (the number sits on top, so the bolt is a dim watermark)
def('energy', (p) => {
  p.poly(OCT(0), '#1c1c86');
  p.poly(OCT(1.8), '#3a5cf0');
  p.poly(OCT(4), '#2a44d8');
  p.poly(OCT(7), '#3252e4');
  p.poly(OCT(9.5), '#2a44d8');
  bolt(p, scalePts(BOLT, 0.72, 0, 0.5), '#6a98ff', null);
  p.poly([[11, 3.8], [21, 3.8], [27.8, 10.6], [27.8, 12.5], [4.2, 12.5], [4.2, 10.6]], '#6a9cff');
  p.line(11, 4.5, 20, 4.5, '#d8ecff', 0, true);
  p.spark(6, 5, 2, C.white, C.cyan);
}, nat({ glints: 0 }));
def('powerBolt', (p) => { bolt(p, BOLT, C.gold, C.white, C.orangeD); p.spark(5, 4, 2).spark(28, 26, 1); }, nat());
def('bolt', (p) => bolt(p, BOLT, C.gold, C.white, C.orangeD), nat());
def('lightning', D.bolt.fn, nat());

// ---- trophies / crowns / stars
def('trophy', (p) => {
  p.ring(6, 10, 5.2, 2.6, C.goldD);
  p.ring(26, 10, 5.2, 2.6, C.goldD);
  p.poly([[5.5, 3], [26.5, 3], [25.5, 11], [22, 17], [16, 20], [10, 17], [6.5, 11]], C.gold);
  p.ell(16, 3.4, 10.8, 2.2, C.goldL);
  p.ell(16, 3.6, 8.6, 1.2, C.goldDD);
  p.star(16, 10.5, 5.2, 2.3, 5, '#fff0a0');
  p.rect(14, 19, 4, 5, C.goldD);
  p.ell(16, 21.5, 4.2, 1.6, C.gold);
  p.rr(9, 23.5, 14, 3.5, 1, C.gold);
  p.rr(6, 27, 20, 5, 1, C.wood);
  p.rect(11, 28, 10, 3, C.goldL);
  p.line(13, 29, 18, 29, C.goldD, 0, true);
  p.line(8.5, 5, 10, 13, C.goldW, 0, true);
  p.spark(27, 2, 2);
}, nat());
def('crown', (p) => {
  p.poly([[3, 28], [2.6, 9], [9.5, 17], [16, 5], [22.5, 17], [29.4, 9], [29, 28]], C.gold);
  p.poly([[5, 26], [5, 15], [9.5, 20], [16, 11], [22.5, 20], [27, 15], [27, 26]], '#ffd23c');
  p.rect(3, 21, 26, 7, C.goldD);
  p.rect(3, 21, 26, 1, C.goldL);
  for (let x = 5; x < 28; x += 3) p.dot(x, 27, C.goldDD);
  gemDot(p, 8.5, 24.5, 2.2, C.red);
  p.poly([[16, 21.5], [19.2, 24.5], [16, 27.5], [12.8, 24.5]], C.blue);
  p.dot(15, 23, C.white);
  gemDot(p, 23.5, 24.5, 2.2, C.green);
  p.circ(3.2, 8, 2.7, C.pearl);
  p.circ(28.8, 8, 2.7, C.pearl);
  gemDot(p, 16, 4.2, 3, C.pink);
  p.spark(26, 3, 2);
}, nat());
def('star', (p) => {
  p.star(16, 17, 15.5, 6.6, 5, C.gold);
  p.star(15, 15.6, 9, 4, 5, '#ffd84a');
  p.star(14, 14, 3.4, 1.5, 5, C.goldW);
  p.spark(27, 4, 2);
}, nat());

// ---- vials, flasks, lab
function tube(p, liq, liqL, cap = C.pink, capD = C.pinkD) {
  p.rr(10, 1, 12, 5, 1.5, cap);
  p.rect(9, 5, 14, 3, capD);
  p.rect(11, 8, 10, 16, C.glass);
  p.circ(16, 24, 5, C.glass);
  p.each((x, y) => ((y > 14 && x > 11 && x < 21 && (y < 24 || dist(x, y, 16, 24) < 4)) ? liq : undefined));
  p.line(12, 14.5, 19.5, 14.5, liqL, 0, true);
  p.rect(11, 9, 10, 3, C.snow);
  p.line(13, 10, 18, 10, C.mag, 0, true);
  for (const [x, y, r] of [[14, 19, 1.2], [18, 23, 1.6], [15, 26, 1]]) p.ring(x, y, r + 0.5, r - 0.5, liqL);
  p.line(12, 12, 12, 24, C.white, 0, true);
  p.dot(13, 13, C.white);
}
def('vial', (p) => { tube(p, C.green, C.greenL); p.spark(26, 6, 2); }, nat());
def('tube', D.vial.fn, nat());
def('flask', (p) => {
  p.rr(11, 1, 10, 4, 1, C.wood);
  p.rect(12, 5, 8, 8, C.glass);
  p.poly([[12, 12], [20, 12], [29, 26], [29, 29], [3, 29], [3, 26]], C.glass);
  p.poly([[7.5, 19], [24.5, 19], [29, 26], [29, 29], [3, 29], [3, 26]], C.green);
  p.line(8, 19, 24, 19, C.greenL, 0, true);
  p.rect(3, 29, 26, 2, '#7ab0dc');
  for (const [x, y, r] of [[12, 24, 1.4], [19, 22, 1], [22, 26, 1.6]]) p.ring(x, y, r + 0.5, r - 0.5, C.greenL);
  p.line(13, 6, 13, 12, C.white, 0, true);
  p.line(11, 14, 6, 22, C.white, 0, true);
  p.spark(26, 6, 2);
}, nat());
def('lab', (p) => {
  // the Beast Lab: dome roof, neon sign, big glowing window
  p.ell(16, 13, 13, 9, C.blueD);
  p.ell(16, 13, 11, 7.4, C.blue);
  p.rect(1, 13, 30, 2, C.steel);
  p.rect(3, 15, 26, 16, C.snow);
  p.rect(3, 15, 26, 2, C.silver);
  p.rr(6, 18, 12, 7, 1, '#1a3c8a');
  p.rr(7, 19, 10, 5, 0.5, C.cyan);
  p.line(8, 20, 10, 20, C.white, 0, true);
  p.rr(20, 19, 6, 12, 1, C.blueD);
  p.dot(24, 25, C.gold);
  p.rect(5, 27, 13, 2, C.steel);
  p.line(16, 4, 16, 0.5, C.silverD, 0, true);
  p.circ(16, 1.5, 1.4, C.red);
  p.rr(10, 7.5, 12, 6, 1, C.ink);
  p.raw(['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], 14, 8, { M: C.mag });
  p.spark(4, 6, 1);
}, nat());
def('mega', (p) => {
  const sh = [[3, 3], [29, 3], [29, 17], [16, 31], [3, 17]];
  p.poly(sh, C.mag);
  p.poly(scalePts(sh, 0.8, 0, -0.6), C.pinkD);
  p.poly(scalePts(sh, 0.68, 0, -1), '#d81a74');
  p.raw([
    'WW......WW', 'WWW....WWW', 'WWWW..WWWW', 'WW.WWWW.WW', 'WW..WW..WW', 'WW......WW', 'WW......WW', 'WW......WW',
  ], 11, 9, { W: C.white });
  p.raw([
    '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', 'pp......pp',
  ], 11, 9, { p: '#7a0a3e' });
  p.line(5, 5, 26, 5, C.pinkW, 0, true);
  p.spark(27, 2, 2);
}, nat());

// ---- cards
function cardShape(p, x, y, w, h, body, art, accent) {
  p.rr(x, y, w, h, 1.5, body);
  p.rr(x + 2, y + 2, w - 4, h * 0.56, 1, art);
  p.rect(x + 2, y + h - 7, w - 4, 2, C.snow);
  p.rect(x + 2, y + h - 4, (w - 4) * 0.6, 1.5, C.snow);
  p.circ(x + 2, y + 2, 3, accent);
}
def('cards', (p) => {
  p.poly([[2, 9], [14, 4], [19, 26], [7, 31]], C.blueD);
  p.poly([[3.6, 9.8], [13, 6], [17.6, 25], [8, 29]], C.blue);
  cardShape(p, 12, 3, 18, 26, C.purple, C.purpleL, C.mag);
  p.star(21, 11, 4, 1.8, 5, C.gold);
  p.spark(29, 30, 1);
}, nat());
def('card', (p) => {
  cardShape(p, 6, 2, 20, 28, C.blue, C.blueL, C.mag);
  p.star(16, 11, 5, 2.2, 5, C.gold);
}, nat());

// ---- locks, clocks, gear
def('lock', (p) => {
  p.each((x, y) => (y < 15.5 && dist(x, y, 16, 12) <= 9 && dist(x, y, 16, 12) > 5.6 ? C.steel : undefined));
  p.rect(7, 12, 3.4, 5, C.steel);
  p.rect(21.6, 12, 3.4, 5, C.steel);
  p.rr(4, 15, 24, 16, 2.5, C.gold);
  p.rect(4, 15, 24, 2, C.goldL);
  p.rect(4, 27, 24, 2, C.goldD);
  p.circ(16, 21, 2.8, '#3a1a06');
  p.poly([[14.8, 21], [17.2, 21], [18, 27], [14, 27]], '#3a1a06');
  for (const [x, y] of [[6, 18], [25, 18], [6, 25], [25, 25]]) p.dot(x, y, C.goldW).dot(x + 1, y + 1, C.goldDD);
  p.line(9, 6, 11, 4, C.white, 0, true);
}, nat());
def('clock', (p) => {
  p.rr(13, 0, 6, 3, 1, C.silverD);
  p.rect(14.5, 3, 3, 2, C.silver);
  p.circ(16, 18, 14, C.blue);
  p.circ(16, 18, 11.4, C.snow);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6, x = 16 + Math.sin(a) * 9.2, y = 18 - Math.cos(a) * 9.2;
    if (i % 3 === 0) p.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, C.grayD); else p.dot(Math.round(x - 0.5), Math.round(y - 0.5), C.gray);
  }
  p.line(16, 18, 16, 10.5, C.ink, 0, true);
  p.line(16, 18, 21.5, 20.5, C.ink, 0, true);
  p.circ(16.5, 18.5, 1.6, C.red);
  for (let a = 3.5; a < 4.4; a += 0.12) p.dot(16 + Math.cos(a) * 9.8, 18 + Math.sin(a) * 9.8, C.white);
  p.spark(27, 6, 1);
}, nat());
def('gear', (p) => {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, ca = Math.cos(a), sa = Math.sin(a);
    const tp = (r, w) => [16 + ca * r - sa * w, 16 + sa * r + ca * w];
    p.poly([tp(9, -3.6), tp(15.4, -2.4), tp(15.4, 2.4), tp(9, 3.6)], C.silverD);
  }
  p.circ(16, 16, 12, C.silver);
  p.ring(16, 16, 8.4, 7.2, C.silverD);
  p.circ(16, 16, 4.4, C.steel);
  p.circ(16, 16, 2.4, '#262c48');
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; p.circ(16 + Math.cos(a) * 9.8, 16 + Math.sin(a) * 9.8, 1.3, '#4a5470'); }
}, nat());

// ---- weapons / defence
function sword(p, tx, ty, ex, ey) {
  const L = Math.hypot(ex - tx, ey - ty), dx = (ex - tx) / L, dy = (ey - ty) / L, nx = -dy, ny = dx;
  const bl = L * 0.73, gx = tx + dx * bl, gy = ty + dy * bl;
  // blade (tapered) + bevel
  p.poly([[tx, ty], [tx + dx * 4 + nx * 2.8, ty + dy * 4 + ny * 2.8], [gx + nx * 2.8, gy + ny * 2.8], [gx - nx * 2.8, gy - ny * 2.8], [tx + dx * 4 - nx * 2.8, ty + dy * 4 - ny * 2.8]], C.steel);
  p.poly([[tx + dx * 1.5, ty + dy * 1.5], [tx + dx * 4 + nx * 2.4, ty + dy * 4 + ny * 2.4], [gx + nx * 2.4, gy + ny * 2.4], [gx + nx * 0.3, gy + ny * 0.3], [tx + dx * 4 + nx * 0.3, ty + dy * 4 + ny * 0.3]], C.snow);
  p.line(tx + dx * 3, ty + dy * 3, gx - dx * 1.5, gy - dy * 1.5, '#7e8aa8', 0, true);
  // guard
  p.line(gx + nx * 5.2, gy + ny * 5.2, gx - nx * 5.2, gy - ny * 5.2, C.gold, 1.2);
  p.circ(gx + nx * 5.2, gy + ny * 5.2, 1.4, C.goldD).circ(gx - nx * 5.2, gy - ny * 5.2, 1.4, C.goldD);
  // grip with wrap + pommel gem
  p.line(gx + dx * 1.6, gy + dy * 1.6, ex - dx * 2, ey - dy * 2, C.wood, 1.2);
  for (let k = 2.5; k < L - bl - 2.5; k += 2) p.dot(gx + dx * k, gy + dy * k, C.woodD);
  p.circ(ex - dx, ey - dy, 2.2, C.gold);
  p.dot(ex - dx - 1, ey - dy - 1, C.red);
}
def('sword', (p) => { sword(p, 28, 3, 4.5, 27.5); p.spark(6, 5, 2); }, nat());
def('swords', (p) => { sword(p, 3, 3, 27.5, 27.5); sword(p, 29, 3, 4.5, 27.5); p.spark(16, 5, 2); }, nat());
def('shield', (p) => {
  const sh = [[3, 3], [29, 3], [29, 16], [24.5, 24.5], [16, 31], [7.5, 24.5], [3, 16]];
  p.poly(sh, C.gold);
  const inner = scalePts(sh, 0.8, 0, -0.4);
  p.poly(inner, C.blue);
  p.poly(inner.map(([x, y]) => [Math.max(16, x), y]), '#2276dc');
  bolt(p, scalePts(BOLT, 0.5, 0, -1), C.gold, C.white);
  for (const [x, y] of [[5, 5], [26, 5], [5, 15], [26, 15]]) p.dot(x, y, C.goldW).dot(x + 1, y + 1, C.goldDD);
  p.line(7, 6, 7, 16, C.blueL, 0, true);
}, nat());

// ---- chests, gifts, shop
def('chest', (p) => {
  p.each((x, y) => (y < 15 && y > 3 && x > 2 && x < 30 && ((x - 16) / 13.5) ** 2 + ((y - 15) / 11) ** 2 <= 1 ? C.wood : undefined));
  p.rect(2.5, 15, 27, 15, C.wood);
  for (const y of [8, 21, 26]) p.line(4, y, 28, y, C.woodD, 0, true);
  p.rect(2.5, 13.5, 27, 3, C.gold);
  p.rect(6, 4, 3.4, 26, C.goldD);
  p.rect(22.6, 4, 3.4, 26, C.goldD);
  p.rr(12, 11, 8, 10, 1.5, C.goldL);
  p.circ(16, 15, 1.4, '#3a1a06');
  p.rect(15.4, 15, 1.4, 3, '#3a1a06');
  for (const [x, y] of [[7, 7], [7, 27], [23, 7], [23, 27]]) p.dot(x, y, C.goldW);
  p.spark(28, 3, 2);
}, nat());
def('gift', (p) => {
  p.rect(3, 13, 26, 17, C.pink);
  p.rect(1.5, 9, 29, 5, C.pinkL);
  p.rect(13.5, 9, 5, 21, C.gold);
  p.ell(10, 6, 5, 3.6, C.gold);
  p.ell(22, 6, 5, 3.6, C.gold);
  p.ell(10, 6, 2.4, 1.4, C.goldDD);
  p.ell(22, 6, 2.4, 1.4, C.goldDD);
  p.rr(13.5, 4, 5, 5, 1.5, C.goldL);
  for (const [x, y] of [[6, 17], [24, 20], [8, 25], [21, 26]]) p.dot(x, y, C.pinkW);
  p.spark(29, 2, 2);
}, nat());
def('shop', (p) => {
  p.rect(3, 13, 26, 18, C.orangeL);
  p.rr(5, 18, 9, 13, 1, C.wood);
  p.dot(12, 24, C.gold);
  p.rr(17, 18, 10, 7, 1, C.blueL);
  p.line(18, 19, 20, 19, C.white, 0, true);
  for (let i = 0; i < 6; i++) p.poly([[1 + i * 5, 5], [6 + i * 5, 5], [6 + i * 5, 12], [3.5 + i * 5, 14.5], [1 + i * 5, 12]], i % 2 ? C.snow : C.red);
  p.rect(1, 3, 30, 2, C.redD);
}, nat());

// ---- symbols
def('check', (p) => { p.poly([[2, 16], [7, 11], [12.5, 16.5], [25, 3.5], [30, 8.5], [12.5, 27]], C.green); p.line(4, 15, 7, 12, C.greenL, 0, true); }, nat());
def('x', (p) => {
  const arm = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[16 + c * 15 - s * 3.6, 16 + s * 15 + c * 3.6], [16 + c * 15 + s * 3.6, 16 + s * 15 - c * 3.6], [16 - c * 15 + s * 3.6, 16 - s * 15 - c * 3.6], [16 - c * 15 - s * 3.6, 16 - s * 15 + c * 3.6]]; };
  p.poly(arm(Math.PI / 4), C.red);
  p.poly(arm(-Math.PI / 4), C.red);
}, nat());
def('plus', (p) => { p.rr(12, 2, 8, 28, 2, C.green); p.rr(2, 12, 28, 8, 2, C.green); p.line(14, 4, 14, 11, C.greenL, 0, true); }, nat());
def('up', (p) => { p.poly([[16, 1], [30, 15], [22, 15], [22, 31], [10, 31], [10, 15], [2, 15]], C.green); p.line(13, 16, 13, 29, C.greenL, 0, true); p.line(15, 4, 5, 14, C.greenL, 0, true); }, nat());
def('info', (p) => { p.circ(16, 16, 14.5, C.blue); p.rr(13.5, 13, 5, 13, 1, C.white); p.circ(16, 8.5, 2.8, C.white); p.ring(16, 16, 12.5, 11.6, C.blueL); }, nat());
def('alert', (p) => { p.circ(16, 16, 14.5, C.red); p.rr(13.5, 5, 5, 15, 2, C.white); p.circ(16, 24.5, 2.8, C.white); p.ring(16, 16, 12.5, 11.6, C.redL); }, nat());
const heartShape = (p, col) => { p.circ(9.5, 11, 7.4, col); p.circ(22.5, 11, 7.4, col); p.poly([[2.6, 13.5], [29.4, 13.5], [16, 30]], col); };
def('heart', (p) => { heartShape(p, C.red); p.ell(8.5, 8.5, 2.2, 1.6, C.redL); p.dot(7, 7, C.white); }, nat());
def('hp', (p) => { heartShape(p, C.red); p.rr(14, 8, 4, 14, 1, C.white); p.rr(9, 13, 14, 4, 1, C.white); p.dot(6, 7, C.white); }, nat());
def('skull', (p) => {
  p.circ(16, 13, 12, C.snow);
  p.rr(9, 18, 14, 10, 2, C.snow);
  p.ell(11, 14, 3.6, 3.8, C.ink);
  p.ell(21, 14, 3.6, 3.8, C.ink);
  p.dot(10, 13, C.red).dot(20, 13, C.red);
  p.poly([[16, 18], [18, 22], [14, 22]], C.ink);
  for (let x = 11; x < 22; x += 3) p.rect(x, 25, 1, 3, C.ink);
  p.line(7, 8, 9, 5, C.white, 0, true);
}, nat());
def('play', (p) => { p.poly([[6, 2], [29, 16], [6, 30]], C.green); p.line(8, 6, 8, 18, C.greenL, 0, true); }, nat());
def('pause', (p) => { p.rr(5, 3, 8, 26, 1.5, C.snow); p.rr(19, 3, 8, 26, 1.5, C.snow); }, nat());
def('arrowL', (p) => { p.poly([[1, 16], [15, 2], [15, 10], [30, 10], [30, 22], [15, 22], [15, 30]], C.snow); }, nat());
def('arrowR', (p) => { p.poly([[31, 16], [17, 2], [17, 10], [2, 10], [2, 22], [17, 22], [17, 30]], C.snow); }, nat());
def('spark4', (p) => {
  p.poly([[16, 0], [19, 13], [32, 16], [19, 19], [16, 32], [13, 19], [0, 16], [13, 13]], C.goldL);
  p.poly([[16, 5], [18, 14], [27, 16], [18, 18], [16, 27], [14, 18], [5, 16], [14, 14]], '#fff6c0');
  p.poly([[16, 10], [17, 15], [22, 16], [17, 17], [16, 22], [15, 17], [10, 16], [15, 15]], C.white);
}, nat({ shade: false }));
def('magic', (p) => {
  p.line(4, 28, 20, 12, C.purpleD, 1.4);
  p.line(4, 27, 19, 12, C.purple, 0);
  p.rect(3, 26, 4, 4, C.gold);
  p.star(23, 9, 7.5, 3.2, 5, C.gold);
  p.star(22.4, 8.2, 3, 1.3, 5, C.goldW);
  p.spark(7, 6, 2).spark(29, 22, 2).spark(14, 3, 1);
}, nat());
def('chrome', (p) => {
  gemCut(p, 3, 5, 26, 22, ['#ffffff', '#e8eefc', '#b4bfd8', '#cdd5ea', '#9aa6c8', '#6a7898', '#ffffff']);
  p.spark(9, 7, 2).spark(26, 22, 1);
}, nat({ shade: false }));

// ---- people / social
def('friends', (p) => {
  // back buddy
  p.ell(22, 30, 9, 7, C.pink);
  p.circ(21.5, 12, 6.4, C.skin);
  p.poly([[14.6, 11], [15.6, 6], [19, 4], [24.5, 4.4], [28, 8], [28.4, 11], [25, 8.5], [18, 9]], C.brownD);
  p.dot(19, 13, C.ink).dot(24, 13, C.ink).line(20, 16, 23, 16, C.redD, 0, true);
  // front buddy
  p.ell(10, 31, 9.4, 7, C.blue);
  p.circ(10.5, 15.5, 7, C.skin);
  p.poly([[3, 14], [4, 7], [7, 9], [9, 5], [12, 8.5], [15, 6], [17.4, 13], [12, 10.6]], C.orange);
  p.rect(7, 15, 2, 2, C.ink).rect(13, 15, 2, 2, C.ink).dot(7, 15, C.white).dot(13, 15, C.white);
  p.line(8, 19, 13, 19, C.redD, 0, true).dot(9, 20, C.red).dot(12, 20, C.red);
  p.dot(5, 18, C.pinkL).dot(16, 18, C.pinkL);
  p.spark(29, 21, 1);
}, nat());
def('emote', (p) => {
  p.ell(16, 13.5, 15, 11.5, C.snow);
  p.poly([[7, 20], [15, 23.5], [4, 31]], C.snow);
  p.rr(8, 8, 4, 5, 1, C.ink).rr(20, 8, 4, 5, 1, C.ink).dot(9, 9, C.white).dot(21, 9, C.white);
  p.poly([[9, 16], [23, 16], [21, 20], [16, 21.5], [11, 20]], C.ink);
  p.ell(16, 19.6, 3, 1.4, C.red);
  p.ell(6, 15, 2, 1.2, C.pinkL).ell(26, 15, 2, 1.2, C.pinkL);
}, nat());
def('swarm', (p) => {
  p.circ(16, 18, 13, C.blue);
  p.ell(16, 27, 12, 4, C.blueD);
  p.poly([[5, 10], [7, 1], [12, 8]], C.blue).poly([[27, 10], [25, 1], [20, 8]], C.blue);
  p.poly([[7, 8], [8, 4], [10, 8]], C.pinkL).poly([[25, 8], [24, 4], [22, 8]], C.pinkL);
  p.rr(7, 12, 7, 7, 2, C.snow).rr(18, 12, 7, 7, 2, C.snow);
  p.rect(9, 14, 4, 4, C.ink).rect(19, 14, 4, 4, C.ink).dot(10, 14, C.white).dot(20, 14, C.white);
  p.line(6, 10, 13, 12, C.mag, 0.6).line(26, 10, 19, 12, C.mag, 0.6);
  p.rr(10, 22, 12, 4, 1, C.ink);
  for (let x = 11; x < 21; x += 3) p.rect(x, 22, 2, 2, C.white);
}, nat());
def('boss', (p) => {
  p.circ(16, 18, 12.5, C.purple);
  p.poly([[4, 13], [5, 1], [12, 8]], C.purple).poly([[28, 13], [27, 1], [20, 8]], C.purple);
  p.poly([[6, 9], [6.5, 4], [9.5, 7.6]], C.purpleL).poly([[26, 9], [25.5, 4], [22.5, 7.6]], C.purpleL);
  p.poly([[7, 14], [14, 16], [14, 19], [8, 18]], C.gold).poly([[25, 14], [18, 16], [18, 19], [24, 18]], C.gold);
  p.dot(11, 17, C.ink).dot(21, 17, C.ink);
  p.rr(9, 22, 14, 5, 1, C.ink);
  p.poly([[11, 22], [13, 22], [12, 25]], C.white).poly([[19, 22], [21, 22], [20, 25]], C.white);
  p.poly([[14, 3], [16, 0], [18, 3], [16, 6]], C.gold);
}, nat());

// ---- fire / food-ish
const flame = (p, a, b, c) => {
  p.poly([[16, 1], [24, 10], [27, 18], [26, 24], [21, 30], [11, 30], [6, 24], [5, 17], [8, 11], [10, 16], [12, 9]], a);
  p.poly([[16, 11], [21, 18], [22, 24], [19, 28.5], [13, 28.5], [10, 24], [11, 19], [13, 21]], b);
  p.ell(16, 24.5, 3.2, 3.6, c);
};
def('fire', (p) => flame(p, C.red, C.orange, C.gold), nat());
def('calorie', (p) => { flame(p, C.orange, C.gold, C.goldW); p.spark(27, 4, 1); }, nat());
def('island', (p) => {
  p.ell(16, 27, 15, 4.6, C.blue);
  p.ell(16, 26, 12, 3, C.blueL);
  p.ell(15, 24.5, 9, 3.6, C.gold);
  p.line(15, 24, 18, 9, C.wood, 1);
  for (let k = 0; k < 4; k++) p.dot(15.6 + k * 0.7, 22 - k * 3.5, C.woodD);
  p.poly([[18, 9], [30, 13], [27, 9.5], [23, 8]], C.green).poly([[18, 9], [6, 13], [9, 8], [13, 7.5]], C.green);
  p.poly([[18, 9], [24, 1], [21, 7]], C.greenD).poly([[18, 9], [11, 2], [15, 7.5]], C.greenD);
  p.circ(17, 10.5, 1.5, C.woodD).circ(19.5, 10.5, 1.5, C.woodD);
  p.spark(4, 4, 1);
}, nat());
def('road', (p) => {
  p.line(3, 31, 6, 23, C.brownD, 4.5).line(6, 23, 16, 20, C.brownD, 4.5).line(16, 20, 17, 14, C.brownD, 4.5);
  p.line(3, 31, 6, 23, C.orangeL, 2.5).line(6, 23, 16, 20, C.orangeL, 2.5).line(16, 20, 17, 14, C.orangeL, 2.5);
  for (const [x, y] of [[4.5, 28], [7, 22.5], [11, 21.6], [16.5, 18.2]]) p.dot(x * 1 + 0.5, y, C.white).dot(x + 1.5, y, C.white);
  // trophy at the summit
  p.poly([[18, 1], [30, 1], [29, 6], [26, 8.5], [22, 8.5], [19, 6]], C.gold);
  p.rect(23, 8, 2, 3, C.goldD);
  p.rect(20, 11, 8, 2.5, C.gold);
  p.line(20, 2, 21, 6, C.goldW, 0, true);
  p.spark(7, 8, 2).spark(30, 15, 1);
}, nat());
def('ticket', (p) => {
  p.rr(1, 8, 30, 17, 1.5, C.gold);
  p.circ(1, 16.5, 3, null).circ(31, 16.5, 3, null);
  for (let y = 10; y < 24; y += 3) p.rect(9, y, 1, 2, C.goldD);
  p.rect(1, 8, 30, 2, C.goldL);
  p.star(20.5, 16.5, 6.4, 2.8, 5, C.pink);
  p.star(19.8, 15.6, 2.4, 1, 5, C.pinkW);
  p.rect(3.5, 12, 3, 1, C.goldDD).rect(3.5, 15, 3, 1, C.goldDD).rect(3.5, 18, 3, 1, C.goldDD);
}, nat());
def('gate', (p) => {
  p.rect(2, 10, 6, 22, C.silver).rect(24, 10, 6, 22, C.silver);
  p.rect(0, 4, 32, 6, C.red);
  p.rect(0, 4, 32, 1, C.redL);
  p.rr(10, 9, 12, 6, 1, C.gold);
  p.star(16, 12, 2.4, 1, 5, C.goldW);
  p.rect(14, 0, 1, 4, C.silverD).poly([[15, 0], [22, 1.2], [15, 2.6]], C.pink);
  p.rect(8, 16, 16, 16, '#2a1a5a');
  p.each((x, y) => (x > 8 && x < 24 && y > 16 && ((x * 7 + y * 13) | 0) % 11 === 0 ? C.cyan : undefined), true);
  p.rect(3, 12, 1, 18, C.white);
}, nat());
def('flag', (p) => {
  p.rect(5, 2, 2.5, 29, C.silverD);
  p.circ(6.2, 2.4, 2, C.gold);
  p.poly([[7.5, 4], [29, 6], [23, 12], [29, 18], [7.5, 18]], C.pink);
  p.line(9, 7, 22, 8, C.pinkL, 0, true);
  p.rect(2, 29, 8, 3, C.steel);
}, nat());
def('paint', (p) => {
  p.line(3, 30, 13, 20, C.wood, 1.4);
  p.dot(3, 30, C.woodD);
  p.rect(13, 16, 5, 5, C.silver);
  p.poly([[17, 15], [26, 4], [30, 2], [28, 7], [19, 18]], C.pink);
  p.line(26, 5, 22, 10, C.pinkL, 0, true);
  for (const [x, y, c] of [[28, 12, C.pink], [28, 14, C.pink], [6, 10, C.blue], [8, 12, C.blue], [10, 6, C.gold], [22, 26, C.green], [24, 28, C.green]]) p.rect(x, y, 2, 2, c);
}, nat());
def('eye', (p) => { p.ell(16, 16, 15, 9.5, C.snow); p.circ(16, 16, 7, C.blue); p.circ(16, 16, 3.4, C.ink); p.dot(13, 12, C.white).dot(14, 12, C.white).dot(13, 13, C.white); }, nat());
def('trash', (p) => {
  p.poly([[5, 9], [27, 9], [25, 31], [7, 31]], C.silverD);
  p.rr(3, 5, 26, 4, 1, C.silver);
  p.rr(12, 1.5, 8, 4, 1, C.silver);
  for (const x of [10, 15.5, 21]) p.rect(x, 12, 1.5, 16, C.grayD);
}, nat());
def('music', (p) => {
  p.rect(9, 7, 3, 18, C.purple).rect(24, 3, 3, 18, C.purple);
  p.poly([[9, 7], [27, 2], [27, 7], [9, 12]], C.purpleD);
  p.ell(8, 26, 5.6, 4.4, C.purple).ell(23, 22, 5.6, 4.4, C.purple);
  p.dot(6, 24, C.purpleL).dot(21, 20, C.purpleL);
}, nat());
def('sound', (p) => {
  p.rr(2, 11, 6, 10, 1, C.silverD);
  p.poly([[8, 11], [17, 3], [17, 29], [8, 21]], C.silver);
  for (const [r, c] of [[6.5, C.cyan], [11.5, C.white]]) for (let a = -0.9; a <= 0.91; a += 0.06) p.dot(18 + Math.cos(a) * r, 16 + Math.sin(a) * r * 1.2, c);
}, nat());
def('megaphone', (p) => {
  p.poly([[6, 12], [24, 2], [24, 30], [6, 20]], C.red);
  p.rr(1, 11, 6, 10, 1, C.silver);
  p.rr(23, 3, 5, 26, 2, C.snow);
  p.rect(9, 20, 4, 9, C.silverD);
  p.line(9, 12, 21, 6, C.redL, 0, true);
}, nat());

// --------------------------------------------------------------------------- role / spell / skill icons (32 px)

def('cart', (p) => {
  p.line(1, 4, 6, 4, C.silverD, 1).line(6, 4, 10, 22, C.silverD, 1);
  p.poly([[8, 8], [30, 8], [27, 21], [10, 21]], C.red);
  p.poly([[10, 10], [28, 10], [26, 19], [11.5, 19]], C.redL);
  for (const [x, c] of [[13, C.gold], [17, C.green], [21, C.blue], [25, C.purple]]) p.rr(x - 1.5, 6, 3.4, 5, 1, c);
  p.rect(9, 23, 20, 2, C.silverD);
  p.circ(12, 27.5, 3, C.grayD).circ(26, 27.5, 3, C.grayD).circ(12, 27.5, 1.2, C.silver).circ(26, 27.5, 1.2, C.silver);
}, nat());
def('pin', (p) => {
  p.circ(16, 12, 10.5, C.red);
  p.poly([[7, 16], [25, 16], [16, 31]], C.red);
  p.circ(16, 12, 4.4, C.snow);
  p.ell(11, 7, 2.2, 1.6, C.redL);
}, nat());
def('smile', (p) => {
  p.circ(16, 16, 14.5, C.gold);
  p.ell(11, 12, 2.2, 3, C.ink).ell(21, 12, 2.2, 3, C.ink).dot(10, 10, C.white).dot(20, 10, C.white);
  p.poly([[7, 18], [25, 18], [22, 24], [16, 26], [10, 24]], C.ink);
  p.ell(16, 23.5, 4, 1.8, C.red);
  p.ell(6.5, 18, 2, 1.2, C.orangeL).ell(25.5, 18, 2, 1.2, C.orangeL);
}, nat());
def('tower', (p) => {
  p.rect(7, 10, 18, 21, C.silver);
  p.rect(5, 6, 22, 5, C.silverD);
  for (const x of [5, 11, 17, 23]) p.rect(x, 2, 4, 5, C.silverD);
  for (let y = 13; y < 30; y += 4) for (let x = 8 + ((y >> 2) & 1) * 3; x < 24; x += 6) p.rect(x, y, 4, 1, '#9aa6c8');
  p.rr(13, 14, 6, 7, 3, C.ink);
  p.rect(14, 15, 1, 5, C.cyan);
  p.rr(12, 24, 8, 7, 3, C.woodD);
  p.line(9, 11, 9, 29, C.white, 0, true);
  p.rect(15, 0, 1, 3, C.wood).poly([[16, 0], [22, 1], [16, 2.5]], C.blue);
}, nat());
def('wing', (p) => {
  p.poly([[3, 26], [8, 14], [17, 6], [30, 3], [26, 9], [30, 11], [24, 16], [27, 18], [20, 22], [21, 24], [12, 27]], C.snow);
  p.line(7, 24, 25, 6, C.silverD, 0, true);
  p.line(11, 22, 26, 12, C.silver, 0, true);
  p.line(14, 25, 24, 18, C.silver, 0, true);
  p.spark(6, 8, 2);
}, nat());
def('bomb', (p) => {
  p.circ(14, 19, 11.5, '#3a4060');
  p.rr(17, 4, 7, 6, 1, C.silverD);
  p.line(23, 5, 27, 2, C.wood, 0.5);
  p.spark(28, 2, 2, C.white, C.orange);
  p.ell(9.5, 14, 3, 2.2, C.gray);
  p.dot(8, 13, C.white);
}, nat());
def('snow', (p) => {
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
    p.line(16, 16, 16 + ca * 14, 16 + sa * 14, C.cyan, 1.2);
    const bx = 16 + ca * 9, by = 16 + sa * 9;
    p.line(bx, by, bx + Math.cos(a + 0.8) * 4, by + Math.sin(a + 0.8) * 4, C.cyan, 0.4);
    p.line(bx, by, bx + Math.cos(a - 0.8) * 4, by + Math.sin(a - 0.8) * 4, C.cyan, 0.4);
  }
  p.star(16, 16, 5, 3, 6, C.snow, 0);
  p.circ(16, 16, 2, C.white);
}, nat());
def('rocket', (p) => {
  p.poly([[16, 1], [22, 9], [22, 23], [10, 23], [10, 9]], C.snow);
  p.poly([[16, 1], [22, 9], [10, 9]], C.red);
  p.circ(16, 14, 3.2, C.blueD).circ(16, 14, 2.2, C.blueL);
  p.dot(15, 13, C.white);
  p.poly([[10, 15], [4, 24], [4, 27], [10, 23]], C.red).poly([[22, 15], [28, 24], [28, 27], [22, 23]], C.red);
  p.rect(12, 23, 8, 3, C.silverD);
  flameSmall(p, 16, 26);
  p.line(12, 10, 12, 21, C.white, 0, true);
}, nat());
function flameSmall(p, x, y) { p.poly([[x - 4, y], [x + 4, y], [x + 2, y + 4], [x, y + 6], [x - 2, y + 4]], C.orange); p.poly([[x - 2, y], [x + 2, y], [x, y + 4]], C.gold); }
def('speed', (p) => {
  p.poly([[10, 4], [24, 4], [30, 16], [24, 28], [10, 28], [16, 16]], C.blue);
  p.poly([[13, 7], [22, 7], [27, 16], [22, 25], [13, 25], [18, 16]], C.blueL);
  for (const [y, l] of [[9, 7], [16, 10], [23, 7]]) p.line(1, y, 1 + l, y, C.snow, 0.6, true);
}, nat());
def('range', (p) => {
  p.circ(16, 16, 14.5, C.red); p.circ(16, 16, 11, C.snow); p.circ(16, 16, 7.5, C.red); p.circ(16, 16, 3.6, C.snow);
  p.circ(16, 16, 1.6, C.red);
  p.line(16, 16, 30, 2, C.wood, 0.6).poly([[26, 2], [31, 1], [30, 6]], C.gold);
}, nat());
def('ball', (p) => {
  p.circ(16, 16, 14.5, C.snow);
  p.star(16, 16, 5, 5, 5, C.ink);
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; p.circ(16 + Math.cos(a) * 12.4, 16 + Math.sin(a) * 12.4, 3.2, C.ink); }
}, nat());
def('truck', (p) => {
  p.rr(1, 8, 19, 15, 1, C.orange);
  p.rr(20, 13, 10, 10, 1.5, C.orangeD);
  p.rr(22, 15, 6, 4, 0.5, C.blueL);
  p.rect(3, 10, 6, 4, C.snow);
  p.line(2, 19, 19, 19, '#e06a10', 0, true);
  p.circ(8, 25, 4, C.grayD).circ(24, 25, 4, C.grayD).circ(8, 25, 1.6, C.silver).circ(24, 25, 1.6, C.silver);
}, nat());
def('tooth', (p) => {
  p.poly([[5, 4], [11, 2], [16, 4], [21, 2], [27, 4], [28, 11], [25, 19], [22, 30], [18, 22], [16, 20], [14, 22], [10, 30], [7, 19], [4, 11]], C.snow);
  p.line(8, 7, 10, 5, C.white, 0, true);
}, nat());
def('case', (p) => {
  p.rr(10, 3, 12, 6, 2, C.silverD); p.rr(13, 5, 6, 4, 1, null);
  p.rr(1, 9, 30, 20, 2, C.silver);
  p.rect(1, 18, 30, 2, C.silverD);
  p.rr(12, 15, 8, 7, 1, C.gold);
  p.dot(16, 18, C.goldDD);
  p.rr(3, 22, 6, 5, 1, C.green).rr(23, 22, 6, 5, 1, C.green);
  p.line(4, 11, 10, 11, C.white, 0, true);
}, nat());
def('venom', (p) => {
  p.poly([[16, 1], [25, 16], [27, 21], [24, 27], [16, 30], [8, 27], [5, 21], [7, 16]], C.green);
  p.ell(12, 18, 2.4, 4, C.greenL);
  p.dot(11, 15, C.white);
  p.circ(23, 27, 2, C.green).circ(27, 22, 1.2, C.greenL);
}, nat());
def('sludge', (p) => {
  p.ell(16, 22, 14, 8, C.brown);
  p.circ(10, 15, 6, C.brown);
  p.circ(20, 12, 6.5, C.green);
  p.ell(16, 29, 15, 2.4, C.brownD);
  p.dot(17, 8, C.white).dot(8, 12, C.orangeL);
  p.ring(25, 19, 2, 1, C.greenL);
}, nat());
def('burger', (p) => {
  p.ell(16, 10, 13.5, 8, C.orange);
  p.rect(2.5, 10, 27, 4, C.orange);
  p.poly([[2, 14], [30, 14], [27, 17], [22, 15.5], [17, 17.5], [12, 15.5], [6, 17.5]], C.green);
  p.rr(2, 17, 28, 4, 1.5, C.choco);
  p.poly([[1, 21], [31, 21], [28, 24], [4, 24]], C.gold);
  p.rr(3, 24, 26, 6, 2.5, C.orangeD);
  for (const [x, y] of [[9, 6], [15, 4.5], [21, 6], [12, 9], [19, 9]]) p.ell(x, y, 1, 0.6, '#fff4dc');
}, nat());
def('bag', (p) => {
  p.circ(16, 20, 11.5, C.greenD);
  p.poly([[10, 6], [22, 6], [20, 12], [12, 12]], C.greenD);
  p.rr(9, 4, 14, 3, 1, C.gold);
  p.raw(['..GGGG..', '.GG.G...', '.GG.G...', '..GGGG..', '....G.GG', '....G.GG', '..GGGG..'], 12, 15, { G: C.greenL });
  p.dot(9, 14, C.white);
}, nat());
def('quest', (p) => {
  p.rr(5, 4, 22, 25, 1, C.orangeL);
  p.rr(3, 1, 26, 5, 2.5, C.wood);
  p.rr(3, 27, 26, 5, 2.5, C.wood);
  for (const [y, w] of [[10, 15], [14, 12], [18, 15], [22, 9]]) p.rect(9, y, w, 1.5, C.woodD);
  p.star(23, 22, 3, 1.3, 5, C.red);
}, nat());
def('dna', (p) => {
  for (let y = 1; y < 31; y++) {
    const s = Math.sin(y * 0.33) * 9, c = Math.cos(y * 0.33);
    if (y % 4 === 2) p.line(16 - s, y, 16 + s, y, C.silver, 0, true);
    p.rect(Math.round(16 + s - 1.5), y, 3, 1, c > 0 ? C.blue : C.blueD);
    p.rect(Math.round(16 - s - 1.5), y, 3, 1, c < 0 ? C.pink : C.pinkD);
  }
}, nat({ shade: false }));

const F = {
  crust: '#e8a24a', crustD: '#b86a22', cheese: '#ffd84a', pep: '#d8283a', dough: '#e8a860', frost: '#ff8ac4',
  chocoL: '#8a5232', chocoD: '#4a2412', glass: '#cfeeff', glassD: '#7fb4e6', cream: '#fff4dc', asphalt: '#3a3f5a',
};
def('pizza', (p) => {
  p.poly([[2, 6], [30, 6], [16, 31]], F.cheese);
  p.each((x, y) => (y > 13 && y < 22 && Math.abs(x - 16) < (31 - y) * 0.5 - 1 && ((x * 3 + y * 5) | 0) % 13 === 0 ? '#ffe98a' : undefined));
  p.rr(1, 1, 30, 6, 3, F.crust);
  p.rect(2, 6, 28, 1.5, F.crustD);
  for (const [x, y, r] of [[10, 11, 3], [21, 11.5, 3], [16, 19, 2.6], [12.5, 24, 1.6]]) { p.circ(x, y, r, F.pep); p.dot(x - r * 0.5, y - r * 0.5, C.redL); }
  p.poly([[23, 7], [25, 7], [24.5, 11], [23.6, 12]], F.cheese);
  p.dot(24, 12, '#ffe98a');
  p.line(4, 2.5, 10, 2.5, '#ffd08a', 0, true);
  for (const [x, y] of [[7, 15], [24, 15], [18, 25]]) p.dot(x, y, C.green);
}, nat());
def('donut', (p) => {
  p.circ(16, 17.5, 14.5, F.dough);
  p.each((x, y) => { const d = dist(x, y, 16, 16); return d <= 12.6 + Math.sin(Math.atan2(y - 16, x - 16) * 7) * 1.1 ? F.frost : undefined; });
  p.circ(16, 16.5, 4.6, null);
  p.ring(16, 16.5, 5.6, 4.6, '#c86a90');
  const cols = [C.blueL, C.goldL, C.greenL, C.snow, C.purpleL, C.gold, C.blue, C.white];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39, r = 7.5 + (i % 3) * 1.6, x = 16 + Math.cos(a) * r, y = 16 + Math.sin(a) * r * 0.95, c = cols[i % cols.length];
    if (i % 2) p.dot(x, y, c).dot(x + 1, y, c); else p.dot(x, y, c).dot(x, y + 1, c);
  }
  p.ell(9, 8, 2.4, 1.4, C.pinkW);
}, nat());
def('soda', (p) => {
  p.line(18, 6, 23, 0.5, C.pink, 1.2).line(23, 0.5, 26, 0.5, C.pink, 1.2);
  p.poly([[5, 9], [27, 9], [24.5, 31], [7.5, 31]], C.red);
  p.rr(3, 5, 26, 5, 2, C.snow);
  p.rr(7, 3, 18, 3, 1, C.silver);
  p.rr(8, 16, 16, 7, 1, C.snow);
  p.star(16, 19.5, 3, 1.3, 5, C.red);
  for (let x = 9; x < 23; x += 4) p.dot(x, 25, C.redL);
  p.line(9, 11, 10, 29, C.redL, 0.4, true);
  p.dot(5, 6, C.white);
}, nat());
def('fries', (p) => {
  for (const [x, y, hh, c] of [[8, 4, 14, C.gold], [11.5, 1, 16, C.goldL], [15, 2, 15, C.gold], [18.5, 0.5, 16, C.goldL], [22, 3, 14, C.gold], [10, 7, 10, C.goldD], [20, 6, 11, C.goldD]]) p.rr(x, y, 3, hh, 0.5, c);
  p.poly([[4, 12], [28, 12], [25, 31], [7, 31]], C.red);
  p.rect(4, 12, 24, 2, C.redL);
  p.poly([[10, 18], [16, 22], [22, 18], [22, 21], [16, 25], [10, 21]], C.gold);
  p.dot(7, 15, C.white);
}, nat());
def('choco', (p) => {
  p.rr(4, 1, 24, 18, 1, F.chocoL);
  for (let y = 1; y < 17; y += 6) for (let x = 4; x < 28; x += 8) { p.rect(x + 1, y + 1, 6, 1, '#a8683e'); p.rect(x + 7, y + 1, 1, 5, F.chocoD); p.rect(x + 1, y + 5, 6, 1, F.chocoD); }
  p.poly([[2, 18], [30, 14], [30, 31], [2, 31]], C.blue);
  p.poly([[2, 18], [30, 14], [30, 18], [2, 22]], C.snow);
  p.rr(7, 24, 18, 4, 1, C.gold);
  p.line(9, 25, 22, 25, C.goldW, 0, true);
  p.dot(27, 27, C.blueL).dot(4, 28, C.blueL);
}, nat());

// --------------------------------------------------------------------------- 24-unit reward art (48 px)

const coinFace = (p, x, y, r = 2.7) => {
  p.circ(x, y, r, C.goldD).circ(x - 0.2, y - 0.2, r - 0.9, C.gold).px(x - 1, y - 1, C.goldL).px(x, y - 1, C.goldL);
};
def('coinStack', (p) => {
  for (let i = 0; i < 5; i++) { const y = 20 - i * 3; p.ell(9, y + 1, 7.6, 2.9, C.goldDD).ell(9, y, 7.6, 2.9, i % 2 ? C.goldD : C.gold); }
  p.ell(9, 8, 7.6, 2.9, C.gold).ell(9, 8, 5.2, 1.8, C.goldL).px(9, 8, C.goldD).px(8, 8, C.goldD);
  for (let i = 0; i < 5; i++) p.px(2, 20 - i * 3, C.goldL);
  p.circ(18.5, 15.5, 5.6, C.goldD).circ(18.3, 15.3, 4.7, C.gold).circ(18.6, 15.6, 3, C.goldD).circ(18.3, 15.3, 2.6, C.gold);
  p.art(['.M', 'MM', 'M.'], 18, 14, { M: C.goldDD });
  p.px(16, 12, C.white).px(15, 13, C.white).px(4, 7, C.white).px(5, 6, C.white);
}, { size: 24 });
def('coinPile', (p) => {
  p.poly([[0.5, 23.5], [23.5, 23.5], [20, 15], [14, 9], [9, 10], [4, 15]], C.goldD);
  const cs = [[4, 20], [9, 21], [14, 21], [19, 20], [6, 16], [11, 16.5], [16, 16], [9, 12.5], [14, 12], [11.5, 8.5]];
  for (const [x, y] of cs) coinFace(p, x, y, 2.9);
  p.px(20, 4, C.white).px(19, 5, C.goldL).px(21, 5, C.goldL).px(20, 6, C.goldL).px(4, 9, C.white).px(5, 10, C.goldL);
}, { size: 24 });
def('coinChest', (p) => {
  p.poly([[3, 12], [21, 12], [19, 4], [5, 4]], C.brownD).rect(5, 4, 14, 1, C.brown).rect(3, 4, 2, 9, C.goldD).rect(19, 4, 2, 9, C.goldD);
  p.poly([[3, 13], [21, 13], [18, 8], [12, 6], [6, 8]], C.goldD);
  for (const [x, y] of [[6, 11], [11, 10.5], [16, 11], [9, 8], [14, 7.6], [19, 10.5]]) coinFace(p, x, y, 2.4);
  p.rect(1, 13, 22, 10, C.brown).rect(1, 13, 22, 2, C.gold).rect(1, 21, 22, 2, C.brownD);
  p.rect(4, 13, 2, 10, C.goldD).rect(18, 13, 2, 10, C.goldD).line(2, 18, 21, 18, C.brownD);
  p.rect(10, 15, 4, 5, C.goldL).px(11, 17, C.goldDD).px(12, 17, C.goldDD).px(11, 18, C.goldDD);
  p.px(21, 2, C.white).px(20, 3, C.goldL).px(22, 3, C.goldL).px(2, 15, C.white);
}, { size: 24 });
def('bucksPile', (p) => {
  // three brilliant-cut gems on a little heap of sparkle dust
  p.ell(12, 21.5, 11, 2.2, '#a00e52');
  const R = (x, y, w, h) => gemCut(p, x, y, w, h, PINK_GEM);
  R(0.5, 10, 10, 9);
  R(13.5, 10, 10, 9);
  R(5.5, 3, 13, 12);
  p.px(20, 3, C.white).px(19, 4, C.pinkL).px(21, 4, C.pinkL).px(20, 5, C.pinkL).px(2, 6, C.white);
}, { size: 24, shade: false });

// Pass tier markers: erlenmeyer flasks (empty glass / goo / current / milestone gold)
const shadeC = (hex, f) => {
  const h = parseInt(hex.slice(1), 16);
  let r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return '#' + ((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).padStart(6, '0');
};
const flask = (p, liq, liqL, level, glass = F.glass, cork = C.brown) => {
  p.rect(9, 0, 6, 3, cork).rect(9, 0, 6, 1, shadeC(cork, 0.35));
  p.rect(9, 3, 6, 6, glass);
  p.poly([[9, 8.5], [15, 8.5], [22, 19.5], [22, 23.5], [2, 23.5], [2, 19.5]], glass);
  if (liq) {
    const y0 = level, k = (y) => 3 + ((y - 8.5) / 11) * 7;
    const half = (y) => Math.min(10, y < 8.5 ? 3 : k(y));
    p.poly([[12 - half(y0), y0], [12 + half(y0), y0], [12 + 10, 19.5], [12 + 10, 23], [2, 23], [2, 19.5]], liq);
    for (let x = Math.ceil(12 - half(y0)); x < 12 + half(y0); x++) p.px(x, Math.round(y0), liqL).flat(x, Math.round(y0));
    p.px(8, 19, C.white).px(15, 21, liqL).px(12, 17, liqL).px(17, 18, C.white);
    for (const [x, y, r] of [[7, 20.5, 0.9], [16, 19.5, 0.7], [11, 21.5, 0.6]]) p.ring(x, y, r + 0.45, r - 0.05, liqL);
  }
  p.rect(10, 3, 1, 5, C.white).line(8, 11, 4, 18, C.white).px(10, 1, C.white);
};
def('flaskOff', (p) => flask(p, '#2a3270', '#3a4490', 18, '#5a6aa8', '#6a5a7a'), { size: 24 });
def('flaskOn', (p) => flask(p, '#4cd24a', '#c8ff9a', 11), { size: 24 });
def('flaskCur', (p) => flask(p, '#ff2e98', '#ffb8dc', 13), { size: 24 });
def('flaskGold', (p) => flask(p, '#ffc21a', '#fff4a8', 10, F.glass, C.pink), { size: 24 });
def('flaskPrem', (p) => flask(p, '#c063ff', '#ecd0ff', 12, F.glass, C.gold), { size: 24 });

// --------------------------------------------------------------------------- rarity gems + series badges (new)

const RARITY_GEM = {
  common: ['#ffffff', '#e8eefc', '#b8c6e8', '#c8d4f0', '#8e9cc4', '#5a6890', '#ffffff'],
  rare: ['#fff0c8', '#ffd08a', '#ff9a2e', '#ffb050', '#e07010', '#9a4808', '#ffe0a0'],
  epic: ['#f4e0ff', '#dcb0ff', '#a84ef0', '#c063ff', '#8a30d8', '#4e1490', '#ecd0ff'],
  legendary: ['#e0fff6', '#a8ffe6', '#20d8b0', '#3ff2c8', '#10a890', '#086a5a', '#c8fff0'],
  mythic: PINK_GEM,
};
for (const [k, pal] of Object.entries(RARITY_GEM)) {
  def('rarity_' + k, (p) => { gemCut(p, 2, 5, 28, 23, pal); p.spark(9, 8, 2); }, nat({ shade: false }));
}

// --------------------------------------------------------------------------- title logo emblem (48 px)

def('logoBolt', (p) => {
  const B = [[30, 2], [8, 26], [20.5, 26], [14, 46], [41, 17], [27.5, 17], [36, 2]];
  const sh = (dx, dy) => B.map(([x, y]) => [x + dx, y + dy]);
  p.poly(sh(2.5, 2.5), '#5a0830'); // drop / extrusion
  for (const [dx, dy] of [[-2.2, 0], [2.2, 0], [0, -2.2], [0, 2.2], [-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) p.poly(sh(dx, dy), C.gold); // gold rim
  p.poly(B, C.pink);
  // lit facet on the upper-left planes
  p.poly([[30, 2], [36, 2], [33.5, 7], [27.5, 7]], '#ff7ab8');
  p.poly([[20.5, 26], [27.5, 17], [31, 17], [23.5, 26]], '#ff7ab8');
  // hot white core
  p.line(32, 5, 14, 24, '#ffd6ea', 1, true).line(32, 5, 15, 23, C.white, 0, true);
  p.line(35, 19, 18, 40, '#ffd6ea', 1, true).line(35, 19, 18.5, 39.5, C.white, 0, true);
  // crackling arcs + sparkles
  const arc = (pts) => { for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], C.cyan, 0, true); };
  arc([[3, 12], [6, 9], [5, 6], [9, 3]]);
  arc([[44, 26], [41, 30], [45, 33], [42, 37]]);
  arc([[6, 38], [9, 35], [8, 32]]);
  p.spark(42, 6, 3).spark(4, 30, 2).spark(30, 44, 2);
}, { size: 48, s: 1, glints: 1 });

// --------------------------------------------------------------------------- API

const cache = new Map();
export function iconURL(name) {
  if (cache.has(name)) return cache.get(name);
  const d = D[name] ?? D.star;
  const o = d.opts ?? {};
  const p = new Pix(o.size ?? N, o.s ?? 2);
  d.fn(p);
  const url = render(p, o);
  cache.set(name, url);
  return url;
}
export const ICON_NAMES = Object.keys(D);

// --------------------------------------------------------------------------- animated variants
// Pixel-art sprite strips built from the finished (shaded + outlined) icon, so
// every frame keeps the icon's exact palette and silhouette:
//   spin    - the coin turns edge-on and back (re-sampled columns, darker back face)
//   glint   - a diagonal white glint sweeps across the opaque body (gems, stars, trophies)
//   flicker - the bolt flares brighter with a 1px electric halo, then dims
//   bubble  - tiny bubbles rise through the liquid inside vials and flasks
// iconAnim(name, kind?) -> { url, n, dur } | null; frames sit side by side in one PNG.
const ANIM_KIND = {
  coin: 'spin', coinStack: 'glint', coinPile: 'glint', coinChest: 'glint',
  bucks: 'glint', bucksPile: 'glint', gem: 'glint', star: 'glint', crown: 'glint', trophy: 'glint', chrome: 'glint', spark4: 'glint', ticket: 'glint', chest: 'glint',
  energy: 'flicker', power: 'flicker', powerBolt: 'flicker', bolt: 'flicker', lightning: 'flicker', logoBolt: 'flicker', mega: 'flicker',
  vial: 'bubble', tube: 'bubble', flask: 'bubble', flaskCur: 'bubble', flaskOn: 'bubble', flaskGold: 'bubble', flaskPrem: 'bubble', lab: 'bubble',
};
export const animKindOf = (name) => ANIM_KIND[name] ?? null;
const animCache = new Map();
const lumA = (d, i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
export function iconAnim(name, kind = ANIM_KIND[name]) {
  if (!kind || typeof document === 'undefined') return null;
  const key = name + '|' + kind;
  if (animCache.has(key)) return animCache.get(key);
  iconURL(name);
  // re-render to get the canvas (iconURL caches the data URL only)
  const d0 = D[name] ?? D.star, o = d0.opts ?? {};
  const p0 = new Pix(o.size ?? N, o.s ?? 2);
  d0.fn(p0);
  render(p0, o);
  const src = render.last;
  const S = src.width, H = src.height;
  const base = src.getContext('2d').getImageData(0, 0, S, H).data;
  const frames = [];
  const blank = () => new Uint8ClampedArray(base.length);
  const at = (x, y) => (y * S + x) * 4;
  let n = 0, dur = 2.4;
  if (kind === 'spin') {
    const spin = 8, idle = 10;
    // horizontal extent of the coin body
    let x0 = S, x1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) if (base[at(x, y) + 3] > 200) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const cx = (x0 + x1) / 2;
    for (let f = 0; f < idle; f++) frames.push(base);
    for (let f = 1; f <= spin; f++) {
      const c = Math.cos((f / (spin + 1)) * Math.PI * 2);
      const w = Math.sign(c || 1) * Math.max(0.14, Math.abs(c));
      const out = blank(), dark = c < 0 ? 0.78 : 1;
      for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
        const sx = Math.round(cx + (x - cx) / w);
        if (sx < 0 || sx >= S) continue;
        const si = at(sx, y), di = at(x, y);
        if (!base[si + 3]) continue;
        const edge = Math.abs(w) < 0.4 && base[si + 3] > 200 ? 0.82 : 1;
        out[di] = base[si] * dark * edge; out[di + 1] = base[si + 1] * dark * edge; out[di + 2] = base[si + 2] * dark * edge; out[di + 3] = base[si + 3];
      }
      frames.push(out);
    }
    dur = 2.6;
  } else if (kind === 'glint') {
    const idle = 8, sweep = 7;
    for (let f = 0; f < idle; f++) frames.push(base);
    for (let f = 0; f < sweep; f++) {
      const out = new Uint8ClampedArray(base);
      const t = -4 + ((S + H + 8) * f) / (sweep - 1);
      for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
        const i = at(x, y);
        if (base[i + 3] < 250 || lumA(base, i) < 45) continue;
        const dd = Math.abs(x + y - t);
        const k = dd < 1.2 ? 0.8 : dd < 2.4 ? 0.42 : 0;
        if (!k) continue;
        out[i] += (255 - out[i]) * k; out[i + 1] += (255 - out[i + 1]) * k; out[i + 2] += (255 - out[i + 2]) * k;
      }
      frames.push(out);
    }
    dur = 3.2;
  } else if (kind === 'flicker') {
    const bright = (m, halo) => {
      const out = new Uint8ClampedArray(base);
      for (let i = 0; i < out.length; i += 4) if (base[i + 3]) { out[i] = Math.min(255, base[i] * m); out[i + 1] = Math.min(255, base[i + 1] * m); out[i + 2] = Math.min(255, base[i + 2] * m); }
      if (halo) for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
        const i = at(x, y);
        if (base[i + 3]) continue;
        const nb = (xx, yy) => xx >= 0 && yy >= 0 && xx < S && yy < H && base[at(xx, yy) + 3] > 200;
        if (nb(x + 1, y) || nb(x - 1, y) || nb(x, y + 1) || nb(x, y - 1)) { out[i] = 255; out[i + 1] = 246; out[i + 2] = 160; out[i + 3] = 150; }
      }
      return out;
    };
    const hi = bright(1.32, true), lo = bright(0.78, false), mid = bright(1.12, false);
    for (let f = 0; f < 9; f++) frames.push(base);
    frames.push(hi, lo, hi, mid, base, hi, base);
    dur = 2.2;
  } else if (kind === 'bubble') {
    // interior liquid pixels: opaque, surrounded by opaque, mid luminance, saturated
    const inner = (x, y) => {
      if (x < 1 || y < 1 || x >= S - 1 || y >= H - 1) return false;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (base[at(x + dx, y + dy) + 3] < 250) return false;
      const i = at(x, y), l = lumA(base, i), mx = Math.max(base[i], base[i + 1], base[i + 2]), mn = Math.min(base[i], base[i + 1], base[i + 2]);
      return l > 50 && l < 225 && mx - mn > 45;
    };
    const cols = [];
    for (let x = 0; x < S; x++) {
      let yb = -1;
      for (let y = H - 1; y >= 0; y--) if (inner(x, y)) { yb = y; break; }
      if (yb > 0) { let yt = yb; while (yt > 0 && inner(x, yt - 1)) yt--; if (yb - yt >= 4) cols.push({ x, yb, yt }); }
    }
    const F = 12;
    const picks = cols.length ? [cols[Math.floor(cols.length * 0.3)], cols[Math.floor(cols.length * 0.62)], cols[Math.floor(cols.length * 0.85)]] : [];
    for (let f = 0; f < F; f++) {
      const out = new Uint8ClampedArray(base);
      picks.forEach((c, b) => {
        if (!c) return;
        const span = c.yb - c.yt, ph = ((f + b * 4) % F) / F, y = Math.round(c.yb - ph * span);
        if (y < c.yt) return;
        const i = at(c.x, y);
        out[i] = 255; out[i + 1] = 255; out[i + 2] = 255;
        if (ph > 0.4 && y - 1 >= c.yt && c.x + 1 < S && inner(c.x + 1, y)) { const j = at(c.x + 1, y); out[j] = Math.min(255, out[j] + 90); out[j + 1] = Math.min(255, out[j + 1] + 90); out[j + 2] = Math.min(255, out[j + 2] + 90); }
      });
      frames.push(out);
    }
    dur = 1.6;
  } else return null;
  n = frames.length;
  const c = document.createElement('canvas');
  c.width = S * n;
  c.height = H;
  const g2 = c.getContext('2d');
  frames.forEach((fd, k) => g2.putImageData(new ImageData(fd instanceof Uint8ClampedArray ? fd : new Uint8ClampedArray(fd), S, H), k * S, 0));
  const res = { url: c.toDataURL(), n, dur };
  animCache.set(key, res);
  return res;
}
export const ICON_COLORS = C;
