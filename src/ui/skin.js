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

const hexToRgb = (hex) => {
  const h = typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex;
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
};
export function shadeHex(hex, f) {
  let [r, g, b] = hexToRgb(hex);
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + ((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0');
}
/** Linear blend of two hex colours (t = 0 -> a, 1 -> b). */
export function mixHex(a, b, t) {
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

/**
 * Draw a frame skin (buttons, chips, card rims, plain panels). Returns { url, slice, w, h }.
 * o: { w, h, r (corner radius), outline, fill, top (gloss band colour), topRows,
 *      lip (rows), lipColor, hi, lo, inset (recessed), glint, ring (inner ring colour), ringW, dither,
 *      gloss (jelly highlight streak), rim (bright 1px rim colour) }
 */
export function frameSkin(o) {
  const w = o.w ?? 20, h = o.h ?? 20, r = o.r ?? 4, lip = o.lip ?? 0;
  const P = painter(w, h);
  const set = P.set;
  const inside = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && insideRR(x - 1, y - 1, w - 2, h - 2, r);
  const fill = o.fill ?? '#3a56c8';
  const outline = o.outline ?? '#0d0a1f';
  const hi = o.hi ?? shadeHex(fill, o.inset ? -0.35 : 0.42);
  const lo = o.lo ?? shadeHex(fill, o.inset ? 0.18 : -0.28);
  const lipC = o.lipColor ?? shadeHex(fill, -0.38);
  const topC = o.top ?? null;
  const topRows = o.topRows ?? Math.floor(h / 2) - 1;
  const lipStart = h - 2 - lip;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) {
        if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) set(x, y, outline);
        else if (o.shadow && (inside(x, y - 1) || inside(x - 1, y - 1))) set(x, y, o.shadow, 140);
        continue;
      }
      let col = fill;
      if (topC && y <= topRows) col = o.dither && y === topRows ? (bayer(x, y) < 0.5 ? topC : fill) : topC;
      // liquid-dark lower body (jelly buttons): a dithered darker band above the lip
      if (o.deep && lip && y >= lipStart - o.deep && y < lipStart) col = y === lipStart - o.deep ? (bayer(x, y) < 0.5 ? o.deepColor : col) : o.deepColor;
      const up = inside(x, y - 1), dn = inside(x, y + 1), lf = inside(x - 1, y), rt = inside(x + 1, y);
      if (lip && y > lipStart) col = (!lf || !rt) ? shadeHex(lipC, -0.12) : lipC;
      else if (!up) col = hi;
      else if (!dn || (lip && y === lipStart)) col = lo;
      else if (!lf) col = o.inset ? shadeHex(fill, -0.2) : (o.rim ?? shadeHex(col, 0.16));
      else if (!rt) col = o.inset ? shadeHex(fill, 0.1) : shadeHex(col, -0.14);
      if (o.ring && !(lip && y > lipStart - 1)) {
        let ed = 5;
        for (let k = 1; k <= 4; k++) if (!inside(x, y - k) || !inside(x, y + k) || !inside(x - k, y) || !inside(x + k, y)) { ed = k; break; }
        if (ed >= 2 && ed <= 1 + (o.ringW ?? 1)) col = o.ring;
      }
      set(x, y, col);
    }
  }
  if (o.gloss && !o.inset) {
    // jelly highlight: a soft white streak under the top edge (stretches with the 9-slice)
    const base = topC ?? fill;
    const gc = o.glossColor ?? mixHex(base, '#ffffff', 0.88);
    for (let x = r - 1; x <= w - r; x++) set(x, 2, gc);
    for (let x = r - 1; x <= w - r; x++) set(x, 3, mixHex(base, '#ffffff', 0.6));
    for (let x = r; x <= w - 1 - r; x++) set(x, 4, mixHex(base, '#ffffff', 0.3));
    for (let x = r + 1; x <= w - 2 - r; x++) set(x, 5, bayer(x, 5) < 0.5 ? mixHex(base, '#ffffff', 0.3) : base);
  }
  if (o.glint !== false && !o.inset) {
    // specular glint in the top-left corner
    const gx = r > 2 ? Math.floor(r * 0.7) + 1 : 2, gy = 2;
    set(gx, gy, '#ffffff'); set(gx + 1, gy, '#ffffff'); set(gx, gy + 1, '#ffffff');
    if (o.glint === 'big') { set(gx + 2, gy, '#ffffff'); set(gx, gy + 2, '#ffffff'); }
  }
  if (o.bubbles) {
    // tiny bubble pixels in the bottom-right corner (corners never stretch)
    const bx = w - 4, by = lipStart - 2;
    set(bx, by, mixHex(fill, '#ffffff', 0.55));
    set(bx - 2, by - 2, mixHex(fill, '#ffffff', 0.4));
  }
  const slice = Math.max(r + 2, lip + 3, o.slice ?? 0);
  return { url: P.done(), slice, w, h };
}

/**
 * Glass specimen-tank panel. Returns { url, slice, w, h }.
 * o: { w, h, r, slice, outline, rim, rimHi, rimLo, inner, glass, glass2, reflect, base (lip rows), baseColor, bolts, boltColor }
 */
export function glassSkin(o) {
  const w = o.w ?? 24, h = o.h ?? 24, r = o.r ?? 5, base = o.base ?? 2;
  const P = painter(w, h);
  const set = P.set;
  const inside = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && insideRR(x - 1, y - 1, w - 2, h - 2, r);
  const edge = (x, y) => {
    for (let k = 1; k <= 4; k++) if (!inside(x, y - k) || !inside(x, y + k) || !inside(x - k, y) || !inside(x + k, y)) return k;
    return 5;
  };
  const outline = o.outline ?? '#0d0a1f';
  const rim = o.rim ?? '#7fe6ff', rimHi = o.rimHi ?? '#e6ffff', rimLo = o.rimLo ?? shadeHex(rim, -0.4);
  const inner = o.inner ?? '#0b1240';
  const g1 = o.glass ?? '#2c4cae', g2 = o.glass2 ?? '#182a76';
  const reflect = o.reflect ?? mixHex(g1, '#ffffff', 0.18);
  const baseC = o.baseColor ?? shadeHex(rim, -0.55);
  const baseStart = h - 2 - base;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) {
        if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) set(x, y, outline);
        continue;
      }
      const ed = edge(x, y);
      const up = inside(x, y - 1), lf = inside(x - 1, y), rt = inside(x + 1, y);
      let col;
      if (base && y > baseStart) {
        // heavy glass base (3D lip)
        col = !lf || !rt ? shadeHex(baseC, -0.25) : y === baseStart + 1 ? shadeHex(baseC, 0.25) : baseC;
      } else if (ed === 1) {
        col = !up ? rimHi : !lf ? mixHex(rim, rimHi, 0.45) : !rt ? rimLo : y >= baseStart ? rimLo : rim;
      } else if (ed === 2) {
        col = inner;
      } else {
        const t = Math.max(0, Math.min(1, (y - 3) / Math.max(1, baseStart - 4)));
        col = mixHex(g1, g2, Math.round(t * 4) / 4);
        if (o.dither !== false) {
          // ordered dither between the quantised steps
          const tq = t * 4, f = tq - Math.floor(tq);
          if (f > 0.15 && bayer(x, y) < f * 0.5) col = mixHex(g1, g2, Math.min(1, (Math.floor(tq) + 1) / 4));
        }
      }
      set(x, y, col);
    }
  }
  // glass reflections: long vertical streak on the left, short one on the right, corner glint
  const s0 = r + 1, s1 = baseStart - 2;
  for (let y = s0; y <= s1; y++) set(3, y, reflect);
  for (let y = s0 + 1; y <= s1 - 1; y++) set(w - 4, y, mixHex(reflect, g2, 0.55));
  for (let x = r + 1; x <= w - 2 - r; x++) set(x, 3, mixHex(reflect, g1, 0.35));
  const gx = Math.max(3, r - 1);
  set(gx, 3, '#ffffff'); set(gx + 1, 3, '#ffffff'); set(3, gx + 1, '#ffffff'); set(gx + 2, 3, rimHi);
  if (o.bolts) {
    const bc = o.boltColor ?? '#cdd5ea';
    for (const [bx, by] of [[2, 2], [w - 3, 2]]) { set(bx, by, bc); }
  }
  const slice = Math.max(o.slice ?? 0, r + 2, base + 3);
  return { url: P.done(), slice, w, h };
}

/** Neon lab sign (replaces the old ribbon): dark plate, glowing neon tube, metal side clamps. 3-slice. */
export function signSkin(o) {
  const w = 40, h = 18;
  const P = painter(w, h);
  const set = P.set;
  const col = o.fill ?? '#ff2e88';
  const ink = o.outline ?? '#0d0a1f';
  const core = mixHex(col, '#ffffff', 0.62);
  const plate = mixHex(col, '#120a2a', 0.78), plate2 = mixHex(col, '#0a0618', 0.86);
  const metal = '#b8c4dc', metalD = '#6a7898', metalL = '#eef4ff';
  const X0 = 5, X1 = w - 6, Y0 = 1, Y1 = h - 2; // plate box (inclusive)
  const inPlate = (x, y) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && insideRR(x - X0, y - Y0, X1 - X0 + 1, Y1 - Y0 + 1, 3);
  // clamps behind the plate
  for (const side of [0, 1]) {
    const cx0 = side ? X1 - 1 : 1, cx1 = side ? w - 2 : X0 + 1;
    for (let y = 5; y <= 12; y++) for (let x = cx0 - 1; x <= cx1 + 1; x++) set(x, y, ink);
    for (let y = 6; y <= 11; y++) for (let x = cx0; x <= cx1; x++) set(x, y, y === 6 ? metalL : y === 11 ? metalD : metal);
    const bx = side ? w - 3 : 2;
    set(bx, 8, metalD); set(bx, 9, ink);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inPlate(x, y)) {
        let c = y < 9 ? plate : plate2;
        // neon tube: halo / bright core / colour, inset 1px from the plate edge
        let ed = 9;
        for (let k = 1; k <= 5; k++) if (!inPlate(x, y - k) || !inPlate(x, y + k) || !inPlate(x - k, y) || !inPlate(x + k, y)) { ed = k; break; }
        if (ed === 1) c = mixHex(plate, '#ffffff', y <= Y0 + 1 ? 0.3 : 0.12);
        else if (ed === 2) c = mixHex(col, plate, 0.45);
        else if (ed === 3) c = core;
        else if (ed === 4) c = col;
        set(x, y, c);
      } else if (inPlate(x + 1, y) || inPlate(x - 1, y) || inPlate(x, y + 1) || inPlate(x, y - 1)) set(x, y, ink);
    }
  }
  // tube glints
  set(X0 + 4, Y0 + 2, '#ffffff'); set(X0 + 5, Y0 + 2, '#ffffff');
  return { url: P.done(), sliceX: 12, sliceY: 6, w, h };
}

/**
 * Riveted metal plate frame (lab hardware): bevelled steel ring with brushed
 * dither, recessed inner edge, corner rivets and an optional fill. 9-slice.
 * o: { w, h, r, border (ring px), metal, fill (null = transparent centre), rivet, inner, hazard (bottom stripe) }
 */
export function plateSkin(o = {}) {
  const w = o.w ?? 24, h = o.h ?? 24, r = o.r ?? 3, bw = o.border ?? 4;
  const P = painter(w, h);
  const set = P.set;
  const inside = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && insideRR(x - 1, y - 1, w - 2, h - 2, r);
  const edge = (x, y) => {
    for (let k = 1; k <= bw + 2; k++) if (!inside(x, y - k) || !inside(x, y + k) || !inside(x - k, y) || !inside(x + k, y)) return k;
    return bw + 3;
  };
  const metal = o.metal ?? '#9aa6c8', ink = o.outline ?? '#0d0a1f';
  const inner = o.inner ?? '#06041a';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) {
      if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) set(x, y, ink);
      continue;
    }
    const ed = edge(x, y);
    const dl = x, dr = w - 1 - x, dt = y, db = h - 1 - y, m = Math.min(dl, dr, dt, db);
    const side = m === dt ? 't' : m === dl ? 'l' : m === db ? 'b' : 'r';
    if (ed <= bw) {
      let f = side === 't' ? 0.3 : side === 'l' ? 0.14 : side === 'b' ? -0.34 : -0.2;
      if (ed === 1) f += side === 't' || side === 'l' ? 0.35 : -0.15;
      else if (ed === bw) f = side === 't' || side === 'l' ? -0.42 : 0.22; // inner bevel (recessed)
      else if ((side === 't' || side === 'b') && bayer(x, y) < 0.22) f += 0.12; // brushed steel
      let c = shadeHex(metal, f);
      if (o.hazard && side === 'b' && ed > 1 && ed < bw) c = ((x + y) & 3) < 2 ? '#ffc21a' : '#1a1230';
      set(x, y, c);
    } else if (ed === bw + 1) set(x, y, side === 't' || side === 'l' ? inner : mixHex(inner, metal, 0.25));
    else if (o.fill) set(x, y, o.fill);
  }
  if (o.rivet !== false) {
    const rc = o.rivet ?? mixHex(metal, '#ffffff', 0.55);
    const q = Math.max(1, Math.floor(bw / 2) - 0) + 1;
    for (const [rx, ry] of [[q, q], [w - 1 - q, q], [q, h - 1 - q], [w - 1 - q, h - 1 - q]]) {
      set(rx, ry, rc); set(rx - 1, ry, shadeHex(metal, 0.4)); set(rx, ry - 1, shadeHex(metal, 0.4));
      set(rx + 1, ry, shadeHex(metal, -0.45)); set(rx, ry + 1, shadeHex(metal, -0.45));
    }
  }
  const slice = Math.max(bw + 2, r + 2, 6);
  return { url: P.done(), slice, w, h };
}

/** Old pixel ribbon with folded tails (kept for API compatibility). */
export function ribbonSkin(o) {
  const w = 40, h = 18;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const col = o.fill ?? '#ff2e88', dark = shadeHex(col, -0.4), light = shadeHex(col, 0.35), ink = o.outline ?? '#0d0a1f';
  const P = (x, y, ww, hh, cc) => { g.fillStyle = cc; g.fillRect(x, y, ww, hh); };
  for (const side of [0, 1]) {
    const x0 = side ? w - 9 : 0;
    P(x0, 5, 9, 11, ink);
    P(x0 + 1, 6, 7, 9, dark);
    g.clearRect(side ? w - 3 : 0, 9, 3, 3);
    P(side ? w - 4 : 3, 9, 1, 3, ink);
  }
  P(5, 1, w - 10, 15, ink);
  P(6, 2, w - 12, 13, col);
  P(6, 2, w - 12, 2, light);
  P(6, 12, w - 12, 3, dark);
  P(7, 2, 2, 1, '#ffffff');
  return { url: c.toDataURL(), sliceX: 12, sliceY: 6, w, h };
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

let injected = false;
export function injectSkins() {
  if (injected) return;
  injected = true;
  const rules = [];
  const add = (cls, sk, extra = '', o = {}) => {
    const unit = o.unit ?? 'var(--px)';
    rules.push(`${cls}{border-style:solid;border-image:url(${sk.url}) ${sk.slice}${o.fill === false ? '' : ' fill'} / calc(${sk.slice} * ${unit}) / 0 stretch;border-width:calc(${sk.slice} * ${unit});--skb:${sk.slice};${extra}}`);
  };
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
  for (const [k, col] of Object.entries(rimC)) {
    add(`.sk-card-${k}`, frameSkin({ w: 16, h: 18, r: 2, fill: col, hi: shadeHex(col, 0.55), lo: shadeHex(col, -0.35), lip: 1, lipColor: shadeHex(col, -0.5), glint: 'big' }), '', { fill: false, unit: 'var(--pxs)' });
  }
  // riveted metal plates (lab hardware frames) + reward pods (small glass capsules)
  add('.sk-plate', plateSkin({ metal: '#9aa6c8', fill: '#141c4e' }));
  add('.sk-plate-dark', plateSkin({ metal: '#5a6690', fill: '#0b1036', border: 3 }));
  add('.sk-plate-gold', plateSkin({ metal: '#ffc21a', fill: '#3a1e08', rivet: '#fffadc' }));
  add('.sk-plate-hazard', plateSkin({ metal: '#8a96b8', fill: '#141c4e', hazard: true, border: 5 }));
  add('.sk-plate-ring', plateSkin({ metal: '#9aa6c8' }), '', { fill: false });
  const pod = (rim, rimHi, rimLo, inner, g1, g2, base) => glassSkin({ w: 16, h: 16, r: 3, slice: 5, base: 1, rim, rimHi, rimLo, inner, glass: g1, glass2: g2, baseColor: base, dither: false });
  add('.sk-pod', pod('#5ac8ff', '#d8f6ff', '#1e62b0', '#081040', '#2c56c0', '#18307e', '#163c8a'), '--liq:#4fb0ff;--liq2:#1a52b0;');
  add('.sk-pod-gold', pod('#ffc21a', '#fff6c0', '#a8600e', '#2a1406', '#a86a1a', '#5a3008', '#8a4e0c'), '--liq:#ffc21a;--liq2:#c8640e;');
  add('.sk-pod-green', pod('#7aff4a', '#e6ffd0', '#2a9a2a', '#06240a', '#2a9a3a', '#125a22', '#1a6a26'), '--liq:#7aff4a;--liq2:#1d9a3a;');
  add('.sk-pod-pink', pod('#ff6ab4', '#ffe0f0', '#b0186a', '#2a0420', '#b02a7a', '#5a0c3e', '#8a0e4c'), '--liq:#ff4aa8;--liq2:#a8145a;');
  add('.sk-pod-dim', pod('#4a5478', '#7a86aa', '#262c4a', '#05071a', '#1a2050', '#0e1236', '#20284a'), '--liq:#3a4490;--liq2:#1a1e50;');
  // neon lab signs (ribbons)
  for (const k of ['pink', 'blue', 'gold', 'green', 'purple', 'red']) {
    const rb = signSkin({ fill: NEON[k] });
    rules.push(`.sk-ribbon-${k}{border-style:solid;border-image:url(${rb.url}) ${rb.sliceY} ${rb.sliceX} fill / calc(${rb.sliceY} * var(--px)) calc(${rb.sliceX} * var(--px)) / 0 stretch;border-width:calc(${rb.sliceY} * var(--px)) calc(${rb.sliceX} * var(--px));--neon:${NEON[k]};}`);
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
  const rule = `.${cls}{border-style:solid;border-image:url(${sk.url}) ${sk.slice} fill / calc(${sk.slice} * var(--px)) / 0 stretch;border-width:calc(${sk.slice} * var(--px));--skb:${sk.slice};${extra}}`;
  if (!dynStyle) {
    dynStyle = document.createElement('style');
    dynStyle.id = 'pixel-skins-dyn';
    document.head.appendChild(dynStyle);
  }
  dynStyle.appendChild(document.createTextNode(rule + '\n'));
  return cls;
}
