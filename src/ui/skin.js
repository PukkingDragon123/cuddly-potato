// Procedural pixel-art UI skins - MrBeast LAB edition.
//
// Every frame (buttons, panels, pills, bars, cards, signs...) is drawn at 1x
// pixel-art resolution on a tiny canvas with an ink outline, stepped rounded
// corners and shading, then used as a 9-slice CSS border-image that is scaled
// up by an integer pixel size (--px) with nearest-neighbour filtering.
//
// Lab look:
//  - buttons are chunky jelly buttons: glossy highlight streak, bright rim,
//    darker liquid lower half and a 3D lip
//  - panels are glass specimen tanks: bright glass rim, thick-glass inner
//    line, tinted glass body with vertical reflections and a heavy base
//    (the liquid + bubbles inside are CSS layers, see ui.css .panel::after)
//  - ribbons are neon lab signs: dark plate, glowing neon tube, metal clamps
//  - pixel-art textures (bubbles, liquid surface, blueprint grid, hazard
//    stripes) are exposed as CSS custom properties (--tx-*) for ui.css.

const RGB = new Map();
const hexToRgb = (hex) => {
  let v = RGB.get(hex);
  if (v) return v;
  const h = typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex;
  v = [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  RGB.set(hex, v);
  return v;
};
// colour math is memoised: the HD skin painters call it per pixel with a handful of distinct inputs
const MEMO = new Map();
const memo3 = (a, b, c, fn) => {
  let m1 = MEMO.get(a); if (!m1) MEMO.set(a, (m1 = new Map()));
  let m2 = m1.get(b); if (!m2) m1.set(b, (m2 = new Map()));
  let v = m2.get(c); if (v === undefined) { v = fn(a, b, c); m2.set(c, v); }
  return v;
};
export function shadeHex(hex, f) { return memo3(hex, f, 's', shadeHex0); }
function shadeHex0(hex, f) {
  let [r, g, b] = hexToRgb(hex);
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + ((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0');
}
/** Linear blend of two hex colours (t = 0 -> a, 1 -> b). */
export function mixHex(a, b, t) { return memo3(a, b, t, mixHex0); }
function mixHex0(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = (i) => Math.max(0, Math.min(255, Math.round(A[i] + (B[i] - A[i]) * t)));
  return '#' + ((c(0) << 16) | (c(1) << 8) | c(2)).toString(16).padStart(6, '0');
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Rounded-rect inside test with a pixel-stepped corner radius. */
function insideRR(x, y, w, h, r) {
  const cx = x < r ? r - 0.5 : x > w - 1 - r ? w - r - 0.5 : x;
  const cy = y < r ? r - 0.5 : y > h - 1 - r ? h - r - 0.5 : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= (r - 0.15) * (r - 0.15) + 0.6;
}

/** Tiny pixel painter on an ImageData buffer. */
function painter(w, h) {
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(w, h);
  const d = img.data;
  const set = (x, y, col, a = 255) => {
    if (!col || x < 0 || y < 0 || x >= w || y >= h) return;
    const [R, G, B] = hexToRgb(col);
    const i = (y * w + x) * 4;
    d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = a;
  };
  const get = (x, y) => {
    const i = (y * w + x) * 4;
    return d[i + 3] ? '#' + ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).padStart(6, '0') : null;
  };
  const done = () => { g.putImageData(img, 0, 0); return c.toDataURL(); };
  return { set, get, done };
}

// ---------------------------------------------------------------------------
// HD frames: every frame is painted at 2x density (K) and drawn with a
// --px / 2 unit, so it covers exactly the same layout box as the original 1x
// skins but carries twice the pixel detail: 2 px ink outlines, multi-band
// bevels, dithered gloss, rivets, reflections and glints. Options are given
// in the original 1x units (callers and ensureSkin() are unchanged).

const K = 2; // hd pixels per original skin pixel
const T = 2; // outline thickness (hd px)

function shape(w, h, r) {
  // precomputed masks: the painters query them many times per pixel
  const IN = new Uint8Array(w * h), OUT = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    IN[y * w + x] = x >= T && y >= T && x < w - T && y < h - T && insideRR(x - T, y - T, w - 2 * T, h - 2 * T, r) ? 1 : 0;
    OUT[y * w + x] = insideRR(x, y, w, h, r + T) ? 1 : 0;
  }
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && IN[y * w + x] === 1;
  const outer = (x, y) => x >= 0 && y >= 0 && x < w && y < h && OUT[y * w + x] === 1;
  const edge = (x, y, n) => {
    for (let k = 1; k <= n; k++) if (!inside(x, y - k) || !inside(x, y + k) || !inside(x - k, y) || !inside(x + k, y)) return k;
    return n + 1;
  };
  const side = (x, y, k) => (!inside(x, y - k) ? 't' : !inside(x - k, y) ? 'l' : !inside(x, y + k) ? 'b' : 'r');
  return { inside, outer, edge, side };
}

/** Domed rivet / screw head (s x s) centred at (cx, cy). */
function rivet(set, cx, cy, metal, s = 5, ink = '#0d0a1f') {
  const r = s / 2, x0 = Math.round(cx - r), y0 = Math.round(cy - r);
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const dx = i + 0.5 - r, dy = j + 0.5 - r, d = Math.hypot(dx, dy);
    if (d > r + 0.1) continue;
    let c;
    if (d > r - 0.9) c = mixHex(shadeHex(metal, -0.6), ink, 0.35);
    else { const l = -(dx + dy) / (r * 1.4); c = l > 0.45 ? '#ffffff' : l > 0.1 ? shadeHex(metal, 0.5) : l > -0.35 ? shadeHex(metal, 0.1) : shadeHex(metal, -0.35); }
    set(x0 + i, y0 + j, c);
  }
}

/**
 * Jelly button / chip / plain frame. Returns { url, slice, w, h, hd }.
 * o (1x units): { w, h, r, outline, fill, top, topRows, lip, lipColor, hi, lo, inset, glint, ring, ringW, dither,
 *                 gloss, glossColor, rim, deep, deepColor, bubbles, slice }
 */
export function frameSkin(o) {
  const w0 = o.w ?? 20, h0 = o.h ?? 20, r0 = o.r ?? 4, lip0 = o.lip ?? 0;
  const w = w0 * K, h = h0 * K, r = r0 * K, lip = lip0 * K;
  const slice = K * Math.max(r0 + 2, lip0 + 3, o.slice ?? 0);
  const P = painter(w, h);
  const set = P.set;
  const S = shape(w, h, r);
  const fill = o.fill ?? '#3a56c8';
  const outline = o.outline ?? '#0d0a1f';
  const hi = o.hi ?? shadeHex(fill, o.inset ? -0.35 : 0.42);
  const lo = o.lo ?? shadeHex(fill, o.inset ? 0.18 : -0.28);
  const lipC = o.lipColor ?? shadeHex(fill, -0.38);
  const topC = o.top ?? null;
  // keep colour bands inside the non-stretching slices so they stay crisp at any size
  const topRows = Math.min((o.topRows ?? Math.floor(h0 / 2) - 1) * K, slice - T);
  const lipStart = h - T - lip;
  const deepRows = o.deep && lip ? Math.max(2, Math.min(o.deep * K, slice - lip - T)) : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!S.inside(x, y)) { if (S.outer(x, y)) set(x, y, outline); continue; }
    const ed = S.edge(x, y, 4), sd = S.side(x, y, ed);
    let col = fill;
    if (topC && y < T + topRows) col = o.dither && y >= T + topRows - 2 ? (bayer(x, y) < (y === T + topRows - 1 ? 0.33 : 0.66) ? topC : fill) : topC;
    if (deepRows && y >= lipStart - deepRows && y < lipStart) col = y < lipStart - deepRows + 2 ? (bayer(x, y) < (y === lipStart - deepRows ? 0.33 : 0.66) ? o.deepColor : col) : o.deepColor;
    if (lip && y >= lipStart) {
      // the 3D lip under the jelly: highlight seam, body, dark base; darker at the rounded sides
      const ly = y - lipStart;
      col = ly === 0 ? mixHex(lipC, fill, 0.55) : ly === 1 ? mixHex(lipC, fill, 0.22) : y >= h - T - 2 ? shadeHex(lipC, -0.28) : lipC;
      if (ed <= 2 && (sd === 'l' || sd === 'r')) col = shadeHex(col, sd === 'l' ? 0.08 : -0.2);
    } else if (o.inset) {
      if (ed === 1) col = sd === 't' || sd === 'l' ? hi : lo;
      else if (ed === 2) col = sd === 't' || sd === 'l' ? mixHex(hi, fill, 0.45) : mixHex(lo, fill, 0.55);
      else if (ed === 3 && sd === 't') col = mixHex(hi, fill, 0.75);
    } else {
      if (ed === 1) col = sd === 't' ? hi : sd === 'l' ? (o.rim ?? mixHex(hi, col, 0.35)) : sd === 'b' ? lo : shadeHex(col, -0.2);
      else if (ed === 2) col = sd === 't' ? mixHex(hi, col, 0.5) : sd === 'l' ? mixHex(hi, col, 0.72) : sd === 'b' ? mixHex(lo, col, 0.45) : shadeHex(col, -0.09);
    }
    if (o.ring && !(lip && y >= lipStart - 1)) {
      const rw = (o.ringW ?? 1) * K;
      if (ed >= 3 && ed < 3 + rw) col = ed === 3 ? shadeHex(o.ring, -0.08) : o.ring;
    }
    set(x, y, col);
  }
  if (o.gloss && !o.inset) {
    // jelly highlight capsule under the top edge (its middle stretches with the 9-slice)
    const base = topC ?? fill;
    const gc = o.glossColor ?? mixHex(base, '#ffffff', 0.9);
    const y0 = T + 3, x0 = T + Math.max(3, r - 4), x1 = w - 1 - x0;
    const rows = [[gc, 1], [mixHex(base, '#ffffff', 0.8), 0], [mixHex(base, '#ffffff', 0.62), 0], [mixHex(base, '#ffffff', 0.42), 1], [mixHex(base, '#ffffff', 0.3), 2]];
    rows.forEach(([c, inset], j) => {
      for (let x = x0 + inset; x <= x1 - inset; x++) if (j < 4 || bayer(x, y0 + j) < 0.5) set(x, y0 + j, c);
    });
    // a darker seam just above the gloss makes it read as a raised highlight
    for (let x = x0 + 2; x <= x1 - 2; x++) set(x, y0 - 1, mixHex(base, '#000000', 0.06));
    set(x0 + 1, y0, '#ffffff'); set(x0 + 2, y0, '#ffffff'); set(x0 + 1, y0 + 1, '#ffffff');
  }
  if (o.glint !== false && !o.inset) {
    // specular glint in the top-left corner: a tiny 4-point star
    const gx = T + Math.max(2, Math.round(r * 0.45)), gy = T + 2;
    set(gx, gy, '#ffffff'); set(gx + 1, gy, '#ffffff'); set(gx, gy + 1, '#ffffff');
    if (o.glint === 'big') { set(gx + 2, gy, '#ffffff'); set(gx, gy + 2, '#ffffff'); set(gx + 1, gy + 1, '#ffffff'); }
  }
  if (o.bubbles !== false && !o.inset && lip) {
    // little pixel bubbles caught in the jelly (bottom-right corner never stretches)
    const bx = w - T - 6, by = lipStart - 5, bc = mixHex(o.deepColor ?? fill, '#ffffff', 0.6);
    set(bx, by - 1, bc); set(bx + 1, by, bc); set(bx, by + 1, bc); set(bx - 1, by, bc); set(bx - 1, by - 1, '#ffffff');
    set(bx - 4, by - 4, bc);
  }
  return { url: P.done(), slice, w, h, hd: K };
}

/**
 * Glass specimen-tank panel. Returns { url, slice, w, h, hd }.
 * o (1x units): { w, h, r, slice, outline, rim, rimHi, rimLo, inner, glass, glass2, reflect, base, baseColor, bolts, boltColor, dither }
 */
export function glassSkin(o) {
  const w0 = o.w ?? 24, h0 = o.h ?? 24, r0 = o.r ?? 5, base0 = o.base ?? 2;
  const w = w0 * K, h = h0 * K, r = r0 * K, base = base0 * K;
  const slice = K * Math.max(o.slice ?? 0, r0 + 2, base0 + 3);
  const P = painter(w, h);
  const set = P.set;
  const S = shape(w, h, r);
  const outline = o.outline ?? '#0d0a1f';
  const rim = o.rim ?? '#7fe6ff', rimHi = o.rimHi ?? '#e6ffff', rimLo = o.rimLo ?? shadeHex(rim, -0.4);
  const inner = o.inner ?? '#0b1240';
  const g1 = o.glass ?? '#2c4cae', g2 = o.glass2 ?? '#182a76';
  const reflect = o.reflect ?? mixHex(g1, '#ffffff', 0.18);
  const baseC = o.baseColor ?? shadeHex(rim, -0.55);
  const baseStart = h - T - base;
  const STEPS = 6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!S.inside(x, y)) { if (S.outer(x, y)) set(x, y, outline); continue; }
    const ed = S.edge(x, y, 5), sd = S.side(x, y, ed);
    let col;
    if (base && y >= baseStart && ed > 1) {
      // heavy glass base (3D lip) with a bright seam and a dark foot
      const ly = y - baseStart;
      col = ly === 0 ? mixHex(baseC, rimHi, 0.5) : ly === 1 ? shadeHex(baseC, 0.18) : y >= h - T - 2 ? shadeHex(baseC, -0.3) : baseC;
      if (ed <= 3 && (sd === 'l' || sd === 'r')) col = shadeHex(col, sd === 'l' ? 0.1 : -0.25);
    } else if (ed === 1) {
      col = sd === 't' ? rimHi : sd === 'l' ? mixHex(rim, rimHi, 0.55) : sd === 'b' ? shadeHex(rimLo, -0.12) : rimLo;
    } else if (ed === 2) {
      col = sd === 't' ? mixHex(rim, rimHi, 0.35) : sd === 'l' ? rim : mixHex(rim, rimLo, 0.6);
    } else if (ed === 3) {
      col = inner;
    } else if (ed === 4) {
      col = sd === 'b' || sd === 'r' ? mixHex(inner, g2, 0.45) : mixHex(inner, g1, 0.3);
    } else {
      const t = Math.max(0, Math.min(1, (y - T - 4) / Math.max(1, baseStart - T - 8)));
      const tq = t * STEPS, f = tq - Math.floor(tq);
      let step = Math.floor(tq);
      if (o.dither !== false && f > 0.2 && bayer(x, y) < (f - 0.2) * 0.75) step++;
      col = mixHex(g1, g2, Math.min(1, step / STEPS));
    }
    set(x, y, col);
  }
  // glass reflections: long double streak on the left, short one on the right, faint top streak,
  // diagonal glare in the top-left corner and a corner glint
  const s0 = T + r + 1, s1 = baseStart - 4;
  for (let y = s0; y <= s1; y++) { set(T + 5, y, reflect); if (y > s0 + 2 && y < s1 - 2) set(T + 6, y, mixHex(reflect, g1, 0.55)); }
  for (let y = s0 + 3; y <= s1 - 4; y++) set(w - T - 6, y, mixHex(reflect, g2, 0.55));
  for (let x = T + r + 2; x <= w - T - r - 3; x++) set(x, T + 5, mixHex(reflect, g1, 0.4));
  for (let k = 0; k < 3; k++) { set(T + 7 + k, T + 9 - k, mixHex(reflect, '#ffffff', 0.35)); set(T + 7 + k, T + 12 - k, mixHex(reflect, g1, 0.3)); }
  const gx = T + Math.max(3, r - 2);
  set(gx, T + 1, '#ffffff'); set(gx + 1, T + 1, '#ffffff'); set(gx + 2, T + 1, rimHi); set(T + 1, gx + 1, '#ffffff'); set(T + 1, gx + 2, rimHi);
  // tiny bubbles stuck to the glass (bottom-right corner)
  const bc = mixHex(g2, '#ffffff', 0.5);
  if (w > 24) { const bx = w - T - 8, by = baseStart - 6; set(bx, by - 1, bc); set(bx - 1, by, bc); set(bx + 1, by, bc); set(bx, by + 1, bc); set(bx - 1, by - 1, mixHex(g2, '#ffffff', 0.85)); set(bx + 3, by - 4, bc); }
  if (o.bolts) {
    const bcol = o.boltColor ?? '#cdd5ea';
    rivet(set, T + 5, T + 5, bcol, 4, outline);
    rivet(set, w - T - 5, T + 5, bcol, 4, outline);
  }
  return { url: P.done(), slice, w, h, hd: K };
}

/** Neon lab sign (replaces the old ribbon): dark plate, glowing neon tube, metal side clamps. 3-slice. */
export function signSkin(o) {
  const w = 40 * K, h = 18 * K;
  const P = painter(w, h);
  const set = P.set;
  const col = o.fill ?? '#ff2e88';
  const ink = o.outline ?? '#0d0a1f';
  const core = mixHex(col, '#ffffff', 0.72);
  const plate = mixHex(col, '#120a2a', 0.8), plate2 = mixHex(col, '#0a0618', 0.88);
  const metal = '#b8c4dc', metalD = '#6a7898', metalL = '#eef4ff';
  const X0 = 10, X1 = w - 11, Y0 = 2, Y1 = h - 3; // plate box (inclusive)
  const inPlate = (x, y) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && insideRR(x - X0, y - Y0, X1 - X0 + 1, Y1 - Y0 + 1, 6);
  // clamps behind the plate (bevelled steel brackets with a screw)
  for (const side of [0, 1]) {
    const cx0 = side ? X1 - 3 : 2, cx1 = side ? w - 3 : X0 + 3;
    for (let y = 9; y <= 26; y++) for (let x = cx0 - 2; x <= cx1 + 2; x++) set(x, y, ink);
    for (let y = 11; y <= 24; y++) for (let x = cx0; x <= cx1; x++) {
      const c = y <= 12 ? metalL : y >= 23 ? metalD : x === cx0 ? mixHex(metal, metalL, 0.5) : x === cx1 ? mixHex(metal, metalD, 0.5) : (y & 3) === 0 ? mixHex(metal, metalL, 0.25) : metal;
      set(x, y, c);
    }
    rivet(set, side ? w - 6 : 6, 18, metal, 4, ink);
  }
  const E = (x, y) => { for (let k = 1; k <= 10; k++) if (!inPlate(x, y - k) || !inPlate(x, y + k) || !inPlate(x - k, y) || !inPlate(x + k, y)) return k; return 11; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inPlate(x, y)) {
      let c = y < h / 2 ? plate : plate2;
      if ((y & 3) === 0 && y > Y0 + 9 && y < Y1 - 9) c = mixHex(c, col, 0.035); // faint scanlines
      // metal frame lip, then the neon tube: halo / colour / hot core / colour / halo
      const ed = E(x, y), top = !inPlate(x, y - ed);
      if (ed === 1) c = top ? mixHex(plate, '#ffffff', 0.42) : mixHex(plate, '#ffffff', 0.16);
      else if (ed === 2) c = top ? mixHex(plate, '#ffffff', 0.2) : shadeHex(plate, -0.3);
      else if (ed === 3) c = mixHex(col, plate, 0.62);
      else if (ed === 4) c = col;
      else if (ed === 5) c = core;
      else if (ed === 6) c = mixHex(core, '#ffffff', 0.5);
      else if (ed === 7) c = col;
      else if (ed === 8) c = mixHex(col, plate, 0.35);
      else if (ed === 9) c = mixHex(col, plate, 0.62);
      else if (ed === 10) c = mixHex(col, plate, 0.84);
      set(x, y, c);
    } else if (inPlate(x + 1, y) || inPlate(x - 1, y) || inPlate(x, y + 1) || inPlate(x, y - 1) || inPlate(x + 2, y) || inPlate(x - 2, y) || inPlate(x, y + 2) || inPlate(x, y - 2)) set(x, y, ink);
  }
  // tube glints + hot spots
  for (const [x, y] of [[X0 + 9, Y0 + 5], [X0 + 10, Y0 + 5], [X0 + 11, Y0 + 5], [X0 + 5, Y0 + 9]]) set(x, y, '#ffffff');
  return { url: P.done(), sliceX: 12 * K, sliceY: 6 * K, w, h, hd: K };
}

/**
 * Riveted metal plate frame (lab hardware): bevelled steel ring with brushed
 * dither, recessed inner edge, corner rivets and an optional fill. 9-slice.
 * o (1x units): { w, h, r, border (ring px), metal, fill (null = transparent centre), rivet, inner, hazard (bottom stripe) }
 */
export function plateSkin(o = {}) {
  const w0 = o.w ?? 24, h0 = o.h ?? 24, r0 = o.r ?? 3, bw0 = o.border ?? 4;
  const w = w0 * K, h = h0 * K, r = r0 * K, bw = bw0 * K;
  const slice = K * Math.max(bw0 + 2, r0 + 2, 6);
  const P = painter(w, h);
  const set = P.set;
  const S = shape(w, h, r);
  const metal = o.metal ?? '#9aa6c8', ink = o.outline ?? '#0d0a1f';
  const inner = o.inner ?? '#06041a';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!S.inside(x, y)) { if (S.outer(x, y)) set(x, y, ink); continue; }
    const ed = S.edge(x, y, bw + 3);
    const dl = x, dr = w - 1 - x, dt = y, db = h - 1 - y, m = Math.min(dl, dr, dt, db);
    const sd = m === dt ? 't' : m === dl ? 'l' : m === db ? 'b' : 'r';
    const lit = sd === 't' || sd === 'l';
    if (ed <= bw) {
      let f = sd === 't' ? 0.28 : sd === 'l' ? 0.12 : sd === 'b' ? -0.34 : -0.2;
      if (ed === 1) f += lit ? 0.42 : -0.2;
      else if (ed === 2) f += lit ? 0.22 : -0.08;
      else if (ed === bw) f = lit ? -0.52 : 0.3; // inner bevel (recessed)
      else if (ed === bw - 1) f = lit ? -0.3 : 0.14;
      else {
        // brushed steel: streaky rows / columns + a soft dither
        const along = sd === 't' || sd === 'b' ? x : y, across = sd === 't' || sd === 'b' ? y : x;
        const streak = ((across * 7 + ((along >> 3) * 13)) % 9) / 9;
        if (streak < 0.22) f += 0.1; else if (streak > 0.85) f -= 0.07;
        if (bayer(x, y) < 0.12) f += 0.08;
      }
      let c = shadeHex(metal, f);
      if (o.hazard && sd === 'b' && ed > 2 && ed < bw - 1) {
        const on = ((x + y) & 7) < 4;
        c = on ? (ed === 3 ? '#ffe680' : '#ffc21a') : ed === 3 ? '#2a2248' : '#1a1230';
      }
      set(x, y, c);
    } else if (ed === bw + 1) set(x, y, lit ? inner : mixHex(inner, metal, 0.3));
    else if (ed === bw + 2 && o.fill) set(x, y, lit ? mixHex(inner, o.fill, 0.45) : o.fill);
    else if (o.fill) set(x, y, o.fill);
  }
  if (o.rivet !== false) {
    const rc = o.rivet ?? mixHex(metal, '#ffffff', 0.3);
    const q = T + Math.round(bw / 2);
    for (const [rx, ry] of [[q, q], [w - q, q], [q, h - q], [w - q, h - q]]) rivet(set, rx, ry, rc, Math.min(6, bw - 1), ink);
  }
  return { url: P.done(), slice, w, h, hd: K };
}

/**
 * Premium collectible card frame per rarity (HD, transparent centre): bevelled
 * metal rim, inner glass line and corner ornaments that grow with rarity
 * (rivets -> gold brackets -> cut gems -> filigree + crown spikes).
 */
export function cardFrameSkin(rarity, col) {
  const w = 48, h = 60, r = 6, slice = 16;
  const P = painter(w, h);
  const set = P.set;
  const S = shape(w, h, r);
  const ink = '#0d0a1f';
  const lv = { locked: 0, common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 }[rarity] ?? 1;
  const metal = col, hiM = mixHex(col, '#ffffff', 0.62), loM = shadeHex(col, -0.42), dd = shadeHex(col, -0.7);
  // rim: outer bevel, engraved metal band, dark seat, light inner bevel, glass line (centre stays transparent)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!S.inside(x, y)) { if (S.outer(x, y)) set(x, y, ink); continue; }
    const ed = S.edge(x, y, 7), sd = S.side(x, y, ed), lit = sd === 't' || sd === 'l';
    let c = null;
    if (ed === 1) c = lit ? hiM : loM;
    else if (ed === 2) c = lit ? mixHex(metal, hiM, 0.45) : mixHex(metal, loM, 0.35);
    else if (ed === 3) c = lv >= 2 && bayer(x, y) < 0.16 ? mixHex(metal, hiM, 0.55) : metal;
    else if (ed === 4) c = lv >= 2 ? (lit ? loM : hiM) : metal; // engraved groove
    else if (ed === 5) c = lit ? mixHex(metal, loM, 0.3) : loM;
    else if (ed === 6) c = dd;
    else if (ed === 7) set(x, y, mixHex(col, '#ffffff', 0.55), lit ? 170 : 80);
    if (c) set(x, y, c);
  }
  const GOLD = ['#fff6c8', '#ffe46a', '#ffc21a', '#d8861a', '#9a5410'];
  const SILV = ['#ffffff', '#e4eaf8', '#b8c4dc', '#7e8aa8', '#4e5878'];
  const gemC = { 3: '#c063ff', 4: '#3ff2c8', 5: '#ff2e88' }[lv];
  const orn = (mx, my) => {
    const X = (i) => (mx ? w - 1 - i : i), Y = (j) => (my ? h - 1 - j : j);
    const px = (i, j, c, a) => set(X(i), Y(j), c, a);
    if (lv === 0) return;
    const M = lv >= 2 ? GOLD : SILV;
    // corner bracket: an L-shaped metal plate wrapping the corner with chamfered arm ends,
    // outlined and bevel-shaded (light top-left, dark bottom-right)
    const L = lv >= 4 ? 16 : lv >= 2 ? 14 : 11, A = lv >= 3 ? 10 : 8;
    const inB = (i, j) => i >= 0 && j >= 0 && i < 16 && j < 16 && (i < A || j < A) && i + j < L + A - 3 && i < L && j < L;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      if (!inB(i, j)) { if (inB(i + 1, j) || inB(i - 1, j) || inB(i, j + 1) || inB(i, j - 1)) px(i, j, ink); continue; }
      const eT = !inB(i, j - 1), eL = !inB(i - 1, j), eB = !inB(i, j + 1), eR = !inB(i + 1, j);
      let t = 2;
      if ((my ? eB : eT) || (mx ? eR : eL)) t = 0;
      else if ((my ? eT : eB) || (mx ? eL : eR)) t = 4;
      else if ((my ? !inB(i, j - 2) : !inB(i, j + 2)) || (mx ? !inB(i - 2, j) : !inB(i + 2, j))) t = 3;
      else if ((i + j) % 6 === 0) t = 1;
      px(i, j, M[t]);
    }
    // screws on the bracket arms
    if (lv >= 2) for (const [i, j] of [[L - 3, 3], [3, L - 3]]) { px(i, j, M[4]); px(i - 1, j - 1, '#ffffff'); }
    if (lv >= 3) {
      // faceted cut gem set in the bracket
      const cx = 4.5 | 0, cy = 4, R = lv >= 4 ? 4 : 3;
      for (let j = -R - 1; j <= R + 1; j++) for (let i = -R - 1; i <= R + 1; i++) {
        const d = Math.abs(i) + Math.abs(j);
        if (d > R + 1) continue;
        let c;
        if (d === R + 1) c = ink;
        else if (i <= 0 && j <= 0) c = d <= 1 ? '#ffffff' : mixHex(gemC, '#ffffff', 0.55);
        else if (i > 0 && j > 0) c = shadeHex(gemC, -0.45);
        else c = j < 0 || i < 0 && j < 2 ? gemC : shadeHex(gemC, -0.2);
        px(cx + i, cy + j, c);
      }
      px(cx - 1, cy - 2, '#ffffff');
    } else rivet((x, y, c) => set(X(x), Y(y), c), 3.5, 3.5, lv >= 2 ? '#ffd23f' : hiM, 4, ink);
    if (lv === 5 && !my) {
      // crown spikes on the top corners
      for (const [i, j] of [[9, 0], [10, 0], [12, 1]]) px(i, j, '#ffe46a');
    }
  };
  orn(0, 0); orn(1, 0); orn(0, 1); orn(1, 1);
  return { url: P.done(), slice, w, h, hd: K };
}

// ---------------------------------------------------------------------------
// Pixel-art lab textures (tiled CSS backgrounds)

const BUBBLE_SPRITES = {
  1: ['o'],
  2: ['#o', '##'],
  3: ['.#.', '#o#', '.#.'],
  4: ['.##.', '#o.#', '#..#', '.##.'],
  5: ['.###.', '#o..#', '#o..#', '#...#', '.###.'],
  6: ['.####.', '#oo..#', '#o...#', '#....#', '#....#', '.####.'],
};
/** Bubble tile: white pixel bubbles on transparent. list: [[x, y, size, alpha]] */
function bubbleTile(w, h, list) {
  const P = painter(w, h);
  for (const [x0, y0, s, a = 1] of list) {
    const spr = BUBBLE_SPRITES[s];
    spr.forEach((row, y) => [...row].forEach((ch, x) => {
      const X = (x0 + x) % w, Y = (y0 + y) % h;
      if (ch === '#') P.set(X, Y, '#ffffff', Math.round(170 * a));
      else if (ch === 'o') P.set(X, Y, '#ffffff', Math.round(255 * a));
      else if (ch === '.' && s >= 4) P.set(X, Y, '#ffffff', Math.round(34 * a));
    }));
  }
  return P.done();
}
/** Liquid surface: mask (opaque below a wavy line) + crest highlight, tileable horizontally. */
function waveTiles(w = 16, h = 4) {
  const M = painter(w, h), L = painter(w, h);
  for (let x = 0; x < w; x++) {
    const yy = Math.round(1.5 + Math.sin((x / w) * Math.PI * 2) * 1.2);
    for (let y = yy; y < h; y++) M.set(x, y, '#000000');
    L.set(x, yy, '#ffffff', 220);
    if (yy + 1 < h) L.set(x, yy + 1, '#ffffff', 70);
  }
  return { mask: M.done(), crest: L.done() };
}
function gridTile(n = 16) {
  const P = painter(n, n);
  for (let i = 0; i < n; i++) { P.set(i, 0, '#9fdcff', 34); P.set(0, i, '#9fdcff', 34); }
  P.set(0, 0, '#c8ecff', 80);
  for (let i = 0; i < n; i += 2) { P.set(i, n / 2, '#9fdcff', 12); P.set(n / 2, i, '#9fdcff', 12); }
  return P.done();
}
function hazardTile() {
  const P = painter(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) P.set(x, y, ((x + y) & 7) < 4 ? '#ffc21a' : '#1a1230');
  return P.done();
}
/** Pixel sunburst (white rays, quantised radial fade + dither), n x n, transparent. */
function raysTile(n = 64, rays = 14, warm = false) {
  const P = painter(n, n);
  const c = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const d = Math.hypot(dx, dy) / c;
    if (d > 1) continue;
    const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
    const s = (a * rays) % 1;
    const inRay = s < 0.42;
    const fade = 1 - d;
    const lv = Math.round(fade * 4) / 4 + (bayer(x, y) - 0.5) * 0.25;
    if (inRay && lv > 0.05) P.set(x, y, warm ? (d < 0.35 ? '#fffbe0' : '#ffe680') : '#ffffff', Math.round(Math.min(1, lv) * 200));
    else if (!inRay && d < 0.3) P.set(x, y, '#ffffff', Math.round((0.3 - d) * 240));
  }
  return P.done();
}
/** Donut sprinkles on transparent (16x16). */
function sprinkleTile() {
  const P = painter(16, 16);
  const cols = ['#ff4aa0', '#4fc8ff', '#ffd84a', '#7aff6a', '#ffffff', '#c08aff'];
  const sp = [[1, 1, 1], [5, 3, 0], [10, 1, 1], [13, 5, 0], [2, 7, 0], [7, 9, 1], [12, 11, 1], [3, 13, 1], [9, 14, 0], [14, 14, 1]];
  sp.forEach(([x, y, dir], i) => { const c = cols[i % cols.length]; P.set(x, y, c); P.set(x + (dir ? 1 : 0), y + (dir ? 0 : 1), c); });
  return P.done();
}
/** Gingham picnic tablecloth (8x8). */
function ginghamTile(a = '#ff5a6a', b = '#ffffff') {
  const P = painter(8, 8);
  const mid = mixHex(a, b, 0.45);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const cx = x < 4, cy = y < 4;
    P.set(x, y, cx && cy ? a : cx || cy ? mid : b, cx && cy ? 255 : 210);
  }
  return P.done();
}
/** Tiny 4-point sparkles (32x32) for premium shimmer layers. */
function starsTile() {
  const P = painter(32, 32);
  const st = [[4, 5, 2], [20, 3, 1], [27, 14, 2], [12, 18, 1], [5, 27, 1], [22, 25, 2], [15, 9, 0], [29, 29, 0], [9, 12, 0]];
  for (const [x, y, s] of st) {
    P.set(x, y, '#ffffff');
    for (let k = 1; k <= s; k++) { const a = Math.round(255 * (1 - k / (s + 1))); P.set(x + k, y, '#fff2a0', a); P.set(x - k, y, '#fff2a0', a); P.set(x, y + k, '#fff2a0', a); P.set(x, y - k, '#fff2a0', a); }
  }
  return P.done();
}
/** Goo drip edge mask (opaque top band with drips), tileable horizontally (16x10). */
function dripTile() {
  const P = painter(16, 10);
  const len = [3, 4, 6, 9, 8, 5, 3, 3, 4, 3, 5, 7, 6, 4, 3, 3];
  for (let x = 0; x < 16; x++) for (let y = 0; y < len[x]; y++) P.set(x, y, '#000000');
  return P.done();
}
/** Electric zig-zag (horizontal, tileable) for energy accents. */
function zapTile() {
  const P = painter(16, 5);
  const ys = [2, 1, 0, 1, 2, 3, 4, 3, 2, 2, 1, 0, 1, 2, 3, 2];
  ys.forEach((y, x) => { P.set(x, y, '#ffffff', 255); if (y + 1 < 5) P.set(x, y + 1, '#9ff4ff', 120); });
  return P.done();
}

// ---------------------------------------------------------------------------
// Skin registry -> CSS

const FILL = {
  yellow: { fill: '#ffc21a', top: '#ffe04a', lipColor: '#c76a12', hi: '#fff6b8', lo: '#e8901a', deepColor: '#f2a414' },
  orange: { fill: '#ff8a1f', top: '#ffab3a', lipColor: '#b54a0e', hi: '#ffe0a8', lo: '#de6a14', deepColor: '#ec7618' },
  blue: { fill: '#2b8cf2', top: '#4fb0ff', lipColor: '#174ea8', hi: '#c4ecff', lo: '#1e6fd0', deepColor: '#2278dc' },
  green: { fill: '#3ec43a', top: '#63e04a', lipColor: '#1d7a2a', hi: '#d4ffb0', lo: '#2ea132', deepColor: '#33ad36' },
  red: { fill: '#f23a4a', top: '#ff6070', lipColor: '#9a1a2a', hi: '#ffd0d4', lo: '#c82838', deepColor: '#dc2e40' },
  pink: { fill: '#ff2e88', top: '#ff5aa8', lipColor: '#a8145a', hi: '#ffd0e8', lo: '#d81c70', deepColor: '#ec2478' },
  purple: { fill: '#9a4cf0', top: '#b874ff', lipColor: '#5a2aa0', hi: '#ead4ff', lo: '#7a36d0', deepColor: '#8840e0' },
  gray: { fill: '#8a96b8', top: '#a8b4d4', lipColor: '#4e5878', hi: '#e4ecff', lo: '#6e7a9c', deepColor: '#7c88aa' },
  teal: { fill: '#1ec8b0', top: '#46e8cc', lipColor: '#0e7a6e', hi: '#c8fff2', lo: '#16a090', deepColor: '#18b49e' },
  gold: { fill: '#ffb21a', top: '#ffd84a', lipColor: '#a8600e', hi: '#fffadc', lo: '#e08a14', deepColor: '#f09a14' },
  white: { fill: '#e8eefc', top: '#ffffff', lipColor: '#8e9ac0', hi: '#ffffff', lo: '#c4cee8', deepColor: '#d4dcf2' },
};
/** Neon colour per sign / liquid colour per panel (exposed as --neon / --liq on the skin classes). */
const NEON = { pink: '#ff4aa0', blue: '#4fc8ff', gold: '#ffd84a', green: '#7aff6a', purple: '#c08aff', red: '#ff5a6a' };

/** 9-slice CSS rule for a skin; HD skins (sk.hd = 2) draw each art pixel at unit / hd so the frame keeps its 1x footprint. */
function skinRule(cls, sk, extra = '', o = {}) {
  const unit = o.unit ?? 'var(--px)', hd = sk.hd ?? 1, b = sk.slice / hd;
  return `${cls}{border-style:solid;border-image:url(${sk.url}) ${sk.slice}${o.fill === false ? '' : ' fill'} / calc(${b} * ${unit}) / 0 stretch;border-width:calc(${b} * ${unit});--skb:${b};${extra}}`;
}

let injected = false;
export function injectSkins() {
  if (injected) return;
  injected = true;
  const rules = [];
  const add = (cls, sk, extra = '', o = {}) => rules.push(skinRule(cls, sk, extra, o));
  // jelly lab buttons (with 3D lip)
  for (const [k, v] of Object.entries(FILL)) {
    add(`.sk-btn-${k}`, frameSkin({ w: 20, h: 22, r: 4, lip: 3, topRows: 8, dither: true, shadow: '#000000', gloss: true, deep: 3, ...v }));
    add(`.sk-btn-${k}.pressed,.sk-btn-${k}:active:not(.disabled)`, frameSkin({ w: 20, h: 22, r: 4, lip: 1, topRows: 9, dither: true, gloss: true, deep: 3, ...v, glint: false }));
    add(`.sk-chip-${k}`, frameSkin({ w: 12, h: 12, r: 2, lip: 1, topRows: 5, ...v }));
  }
  // glass panels (same slices as before so layouts don't move)
  add('.sk-panel', glassSkin({ w: 24, h: 24, r: 5, slice: 7, rim: '#6fdcff', rimHi: '#e6ffff', rimLo: '#2a7ec8', inner: '#0b1446', glass: '#2d4fb4', glass2: '#1a2a7a', baseColor: '#1c4a96' }), '--liq:#2ef2d0;--liq2:#0a8aa8;');
  add('.sk-panel-dark', glassSkin({ w: 20, h: 20, r: 4, slice: 6, base: 1, rim: '#4a6ad8', rimHi: '#9ab8ff', rimLo: '#24308a', inner: '#070b26', glass: '#1c2766', glass2: '#111840', reflect: '#2a3a86', baseColor: '#1a2470' }), '--liq:#4fb0ff;--liq2:#1a52b0;');
  add('.sk-panel-light', glassSkin({ w: 20, h: 20, r: 4, slice: 6, rim: '#ffffff', rimHi: '#ffffff', rimLo: '#9aa8d0', inner: '#a8b8e0', glass: '#f4f8ff', glass2: '#d6e0f6', reflect: '#ffffff', baseColor: '#8e9ac0' }));
  add('.sk-panel-cream', frameSkin({ w: 20, h: 20, r: 4, fill: '#fff4dc', top: '#fff4dc', hi: '#ffffff', lo: '#e6cfa0', lip: 2, lipColor: '#b8956a', ring: '#f0dcb4', rim: '#ffffff' }), 'background:#fff4dc var(--tx-paper) 0 0 / calc(8 * var(--px)) calc(8 * var(--px));background-clip:padding-box;', { fill: false });
  add('.sk-panel-gold', glassSkin({ w: 24, h: 24, r: 5, slice: 7, rim: '#ffc21a', rimHi: '#fff6c0', rimLo: '#b8700e', inner: '#2a1606', glass: '#6a4416', glass2: '#3c240a', reflect: '#8a5e22', baseColor: '#8a4e0c', bolts: true }), '--liq:#ffc21a;--liq2:#c8640e;');
  add('.sk-panel-pink', glassSkin({ w: 24, h: 24, r: 5, slice: 7, rim: '#ff6ab4', rimHi: '#ffe0f0', rimLo: '#b0186a', inner: '#2a0420', glass: '#8a1e66', glass2: '#4c0c3a', reflect: '#a8407e', baseColor: '#8a0e4c', bolts: true }), '--liq:#ff4aa8;--liq2:#a8145a;');
  // recessed glass wells (pills, bar troughs, slots)
  add('.sk-well', frameSkin({ w: 14, h: 14, r: 3, fill: '#0f1438', inset: true, hi: '#060920', lo: '#2a3474', glint: false }));
  add('.sk-well-light', frameSkin({ w: 14, h: 14, r: 3, fill: '#c8d2ee', inset: true, hi: '#8e9ac0', lo: '#ffffff', glint: false }));
  add('.sk-slot', glassSkin({ w: 16, h: 16, r: 3, slice: 5, base: 1, rim: '#3a5ac8', rimHi: '#6f9cff', rimLo: '#1c2a78', inner: '#060a24', glass: '#16205a', glass2: '#0e1440', reflect: '#24347c', baseColor: '#1a2470', dither: false }), '--liq:#4fb0ff;--liq2:#1a52b0;');
  // card frames (rarity rims)
  const rimC = { common: '#b8c6e8', rare: '#ff9a2e', epic: '#c063ff', legendary: '#3ff2c8', mythic: '#ff2e88', locked: '#4a5478' };
  for (const [k, col] of Object.entries(rimC)) add(`.sk-card-${k}`, cardFrameSkin(k, col), '', { fill: false, unit: 'var(--pxs)' });
  // riveted metal plates (lab hardware frames) + reward pods (small glass capsules)
  add('.sk-plate', plateSkin({ metal: '#9aa6c8', fill: '#141c4e' }));
  add('.sk-plate-dark', plateSkin({ metal: '#5a6690', fill: '#0b1036', border: 3 }));
  add('.sk-plate-gold', plateSkin({ metal: '#ffc21a', fill: '#3a1e08', rivet: '#fffadc' }));
  add('.sk-plate-hazard', plateSkin({ metal: '#8a96b8', fill: '#141c4e', hazard: true, border: 5 }));
  const plateRing = plateSkin({ metal: '#9aa6c8' }), plateRingGold = plateSkin({ metal: '#ffc21a', rivet: '#fffadc' }), plateRingDark = plateSkin({ metal: '#5a6690', border: 3 });
  add('.sk-plate-ring', plateRing, '', { fill: false });
  // skin images as CSS variables, so any stylesheet can frame an element without new classes:
  //   border: 0 solid; border-image: var(--ski-plate-ring) 12 / calc(6 * var(--px)) / calc(2 * var(--px)) stretch;
  rules.push(`:root{--ski-plate-ring:url(${plateRing.url});--ski-plate-ring-gold:url(${plateRingGold.url});--ski-plate-ring-dark:url(${plateRingDark.url})}`);
  const pod = (rim, rimHi, rimLo, inner, g1, g2, base) => glassSkin({ w: 16, h: 16, r: 3, slice: 5, base: 1, rim, rimHi, rimLo, inner, glass: g1, glass2: g2, baseColor: base, dither: false });
  add('.sk-pod', pod('#5ac8ff', '#d8f6ff', '#1e62b0', '#081040', '#2c56c0', '#18307e', '#163c8a'), '--liq:#4fb0ff;--liq2:#1a52b0;');
  add('.sk-pod-gold', pod('#ffc21a', '#fff6c0', '#a8600e', '#2a1406', '#a86a1a', '#5a3008', '#8a4e0c'), '--liq:#ffc21a;--liq2:#c8640e;');
  add('.sk-pod-green', pod('#7aff4a', '#e6ffd0', '#2a9a2a', '#06240a', '#2a9a3a', '#125a22', '#1a6a26'), '--liq:#7aff4a;--liq2:#1d9a3a;');
  add('.sk-pod-pink', pod('#ff6ab4', '#ffe0f0', '#b0186a', '#2a0420', '#b02a7a', '#5a0c3e', '#8a0e4c'), '--liq:#ff4aa8;--liq2:#a8145a;');
  add('.sk-pod-dim', pod('#4a5478', '#7a86aa', '#262c4a', '#05071a', '#1a2050', '#0e1236', '#20284a'), '--liq:#3a4490;--liq2:#1a1e50;');
  // neon lab signs (ribbons)
  for (const k of ['pink', 'blue', 'gold', 'green', 'purple', 'red']) {
    const rb = signSkin({ fill: NEON[k] });
    const sy = rb.sliceY / rb.hd, sx = rb.sliceX / rb.hd;
    rules.push(`.sk-ribbon-${k}{border-style:solid;border-image:url(${rb.url}) ${rb.sliceY} ${rb.sliceX} fill / calc(${sy} * var(--px)) calc(${sx} * var(--px)) / 0 stretch;border-width:calc(${sy} * var(--px)) calc(${sx} * var(--px));--neon:${NEON[k]};}`);
  }
  // textures
  const wave = waveTiles();
  const paper = (() => { const P = painter(8, 8); for (let i = 0; i < 8; i++) { P.set(i, 7, '#c8d8f0', 120); P.set(7, i, '#c8d8f0', 70); } return P.done(); })();
  const tex = {
    '--tx-bubbles': bubbleTile(24, 40, [[3, 2, 4], [15, 9, 2, 0.8], [9, 16, 3], [19, 22, 5], [4, 27, 2, 0.7], [12, 33, 3, 0.9], [21, 37, 1], [1, 13, 1, 0.8]]),
    '--tx-bubbles-sm': bubbleTile(16, 24, [[2, 2, 2], [10, 7, 3, 0.9], [5, 13, 1], [12, 17, 2, 0.8], [3, 20, 3, 0.7]]),
    '--tx-bubbles-tube': bubbleTile(48, 12, [[3, 1, 2, 0.9], [11, 7, 1, 0.8], [17, 3, 3, 0.75], [26, 9, 1, 0.9], [31, 5, 2, 0.7], [39, 0, 1, 0.8], [43, 6, 3, 0.65], [21, 10, 1, 0.6], [8, 4, 1, 0.5]]),
    '--tx-bubbles-bg': bubbleTile(64, 96, [[6, 8, 6, 0.32], [40, 3, 3, 0.4], [26, 30, 4, 0.3], [54, 40, 6, 0.26], [12, 52, 2, 0.4], [34, 64, 5, 0.3], [58, 78, 3, 0.35], [4, 84, 4, 0.28], [22, 90, 1, 0.5], [46, 20, 1, 0.5]]),
    '--tx-wave-mask': wave.mask,
    '--tx-wave': wave.crest,
    '--tx-grid': gridTile(16),
    '--tx-hazard': hazardTile(),
    '--tx-zap': zapTile(),
    '--tx-paper': paper,
    '--tx-rays': raysTile(64, 14, true),
    '--tx-rays-w': raysTile(64, 18, false),
    '--tx-sprinkles': sprinkleTile(),
    '--tx-gingham': ginghamTile(),
    '--tx-gingham-b': ginghamTile('#4fa8ff', '#ffffff'),
    '--tx-stars': starsTile(),
    '--tx-drip': dripTile(),
  };
  rules.push(`:root{${Object.entries(tex).map(([k, v]) => `${k}:url(${v})`).join(';')}}`);
  const style = document.createElement('style');
  style.id = 'pixel-skins';
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Runtime-tinted skins (per-arena colours etc.), generated once per colour.

let dynStyle = null;
const dynDone = new Set();
/**
 * ensureSkin(kind, hex) -> class name of a skin tinted with `hex`, injected on first use.
 * kinds: 'plate' (riveted metal frame), 'glass' (specimen-tank panel), 'pod' (small glass capsule), 'btn' (jelly button)
 */
export function ensureSkin(kind, hex) {
  const col = String(hex).replace('#', '').toLowerCase();
  const cls = `sk-dyn-${kind}-${col}`;
  if (dynDone.has(cls) || typeof document === 'undefined') return cls;
  dynDone.add(cls);
  const c = '#' + col;
  let sk, extra = '';
  if (kind === 'plate') sk = plateSkin({ metal: mixHex(c, '#c8d0e8', 0.35), fill: mixHex(c, '#0b1036', 0.78) });
  else if (kind === 'pod') {
    sk = glassSkin({ w: 16, h: 16, r: 3, slice: 5, base: 1, rim: c, rimHi: mixHex(c, '#ffffff', 0.75), rimLo: shadeHex(c, -0.45), inner: mixHex(c, '#05071a', 0.88), glass: mixHex(c, '#1a2466', 0.55), glass2: mixHex(c, '#0b1036', 0.78), baseColor: shadeHex(c, -0.5), dither: false });
    extra = `--liq:${c};--liq2:${shadeHex(c, -0.45)};`;
  } else if (kind === 'btn') sk = frameSkin({ w: 20, h: 22, r: 4, lip: 3, topRows: 8, dither: true, shadow: '#000000', gloss: true, deep: 3, fill: c, top: mixHex(c, '#ffffff', 0.2), lipColor: shadeHex(c, -0.42), hi: mixHex(c, '#ffffff', 0.7), lo: shadeHex(c, -0.12), deepColor: shadeHex(c, -0.06) });
  else {
    sk = glassSkin({ w: 24, h: 24, r: 5, slice: 7, rim: mixHex(c, '#ffffff', 0.25), rimHi: mixHex(c, '#ffffff', 0.8), rimLo: shadeHex(c, -0.4), inner: mixHex(c, '#05071a', 0.85), glass: mixHex(c, '#1a2466', 0.6), glass2: mixHex(c, '#0b1036', 0.8), baseColor: shadeHex(c, -0.5), bolts: true });
    extra = `--liq:${c};--liq2:${shadeHex(c, -0.45)};`;
  }
  const rule = skinRule(`.${cls}`, sk, extra);
  if (!dynStyle) {
    dynStyle = document.createElement('style');
    dynStyle.id = 'pixel-skins-dyn';
    document.head.appendChild(dynStyle);
  }
  dynStyle.appendChild(document.createTextNode(rule + '\n'));
  return cls;
}
