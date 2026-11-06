// LAB TAB pixel art (src/ui/home/lab.js) and the research tree dressing (src/ui/home/research.js).
//
// Same method as the quest board (questBoardArt.js, whose noise / dither / painter helpers this reuses):
// everything is painted procedurally, texel by texel, at ONE CSS PIXEL PER TEXEL, seeded so it looks
// the same every time, shown with nearest-neighbour scaling and cached per size. Elements ask for a
// painting with data-lxp="<kind>" (+ data-lxo="k=v;k=v" options); dress(root) measures them and puts
// the painted canvas behind their content, a few per frame, so a first visit never stalls.
//
//   wall      pegboard wall behind the panel (holes, grime, vignette)
//   bench     the workbench rail the segment drawers sit in (walnut, steel angle, hazard paint)
//   drawer    a segment button: steel drawer front, brass label holder, card, pull, status lamp
//   plate     riveted steel plate (wear, scratches, rust at the rivets, optional hazard band, serial tag)
//   socket    a module bay on the base card: screwed steel bezel, dark niche, tape label, status lamp
//   tier      a base-tier key: steel key with a lit blueprint screen showing that base's silhouette
//   case      glass display case: velvet back + plinth behind the art, glass glare over it (two canvases)
//   clip      steel clipboard with a graph-paper sheet, clip, coffee ring
//   blueprint blueprint sheet: grid, double border, title block, fold creases, tape, coffee ring
//   tag       specimen tag: manila card, clipped corners, brass eyelet, string
//   chalk     chalkboard in a wooden frame with a chalk tray
//   dymo      label-maker tape (embossed plastic)
//   note      sticky note (the quest board's paper)
//   hud       the Lab Level nameplate (steel + brass bezel)
//   tframe    research screen: heavy steel frame, header plate, gauges, pipe + valve
//   slate     research view background (chalkboard slate the blueprint is taped to)
//   rbench    the research tree's lab bench (walnut top, steel drawer front)
//   rsheet    the research node sheet (steel clipboard)
// Sprites (data URLs): pipeTile('h' | 'v'), signURL(color) (9-slice enamel sign), worldSheet(W, H) (canvas).
import {
  Px, cl, ramp, rampAt, hash, rng, noiseTex, nzB, nzF, nzG, dq, dropShadow, domeShade, mixC, scaleC, clamp01, smooth, toHex,
  WOOD, BRASS, STEEL, COPPER, paperCanvas, PAPER_M,
} from './questBoardArt.js';

// ============================================================================ palettes + cache

const PLATE = ramp('#090c15', '#111622', '#191f2f', '#21293d', '#2a334a', '#343e57', '#3f4a66', '#4d5a78', '#63708e', '#8290ae', '#aab6d0');
const ALU = ramp('#262c40', '#3e465e', '#5a6280', '#78809c', '#959db6', '#b2bace', '#d0d6e4', '#eef1f7');
const GUN = ramp('#0c0e16', '#161a26', '#212634', '#2c3242', '#383f52', '#465064', '#58627a', '#707c96');
const RIV = ramp('#121828', '#2c3550', '#525e7c', '#8692b0', '#c4cee2');
const HZY = ramp('#6a4a06', '#a87a0c', '#dca414', '#f8c822', '#ffe46a');
const HZK = ramp('#08080c', '#14141c', '#22222c', '#30303c');
const SLATE = ramp('#0c1412', '#121c19', '#17231f', '#1c2a25', '#22322c', '#2a3c35');
const BLUEP = ramp('#0a2050', '#0f2a62', '#143474', '#1a3e86', '#204896', '#2852a4');
const MANILA = ramp('#8a6a30', '#b08a44', '#cfa860', '#e2c07a', '#f0d494', '#f8e4b0');
const INK = cl('#0a0714');
const SHADOW = cl('#02030a');
const WHITE = cl('#ffffff');

const MEMO = new Map();
const CAPS = { wall: 3, tframe: 3, slate: 3, sheet: 2, bench: 4, plate: 28, clip: 10, blueprint: 8, case: 40, glass: 40, socket: 16, drawer: 24, tier: 24, tag: 40, note: 12 };
function memo(key, fn) {
  const kind = key.slice(0, key.indexOf('|'));
  let c = MEMO.get(kind);
  if (!c) MEMO.set(kind, (c = new Map()));
  let v = c.get(key);
  if (v === undefined) {
    v = fn();
    c.set(key, v);
    if (c.size > (CAPS[kind] ?? 90)) c.delete(c.keys().next().value);
  } else { c.delete(key); c.set(key, v); }
  return v;
}
const hexC = (c, fb = '#7ae8ff') => cl(/^#[0-9a-f]{6}$/i.test(c ?? '') ? c : fb);
/** A 4..6 step ramp around a colour (dark -> light). */
const rampOf = (hex, n = 6) => {
  const c = cl(hex);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return t < 0.55 ? mixC([8, 6, 20], c, 0.35 + t / 0.55 * 0.65) : mixC(c, [255, 255, 255], ((t - 0.55) / 0.45) * 0.62);
  });
};

// ============================================================================ shared bits

/** Brushed-metal streaks (horizontal, a few px tall, soft) for steel faces: -0.07..0.07. */
const brush = (x, y, s = 0) => (nzB(((x >> 1) + s * 37) & 255, (y * 7 + s * 11) & 255) - 0.5) * 0.11 + (hash(s, y, 91) - 0.5) * 0.035;

/** Inside test + edge distance for a chamfered rect (corner cut c). Edge distance is Manhattan on the cut. */
function chamfer(w, h, c) {
  const d = (x, y) => Math.min(x, y, w - 1 - x, h - 1 - y, x + y - c, (w - 1 - x) + y - c, x + (h - 1 - y) - c, (w - 1 - x) + (h - 1 - y) - c);
  return { d, in: (x, y) => x >= 0 && y >= 0 && x < w && y < h && d(x, y) >= 0 };
}
/** Rounded rect (radius r): edge distance (approximate, integer). */
function rounded(w, h, r) {
  const d = (x, y) => {
    const cx = Math.max(r, Math.min(w - 1 - r, x)), cy = Math.max(r, Math.min(h - 1 - r, y));
    if (cx === x || cy === y) return Math.min(x, y, w - 1 - x, h - 1 - y);
    return Math.floor(r - Math.hypot(x - cx, y - cy) + 0.35);
  };
  return { d, in: (x, y) => x >= 0 && y >= 0 && x < w && y < h && d(x, y) >= 0 };
}
/** Is (x, y) on the lit (top / left) half of a bevel? */
const litSide = (x, y, w, h) => (y < h - 1 - y ? y : h) + 0 < (x < w - 1 - x ? x : w) * 10 ? y < h / 2 : x < w / 2;
function shadowUnder(P, M, w, h, inside, dx = 1, dy = 4, r = 3, k = 0.7) {
  const mask = new Float32Array(P.w * P.h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) mask[(y + M) * P.w + x + M] = 1;
  dropShadow(P, mask, dx, dy, r, k, SHADOW);
}
function rivet(P, x, y, r = 2.2, R = RIV) {
  P.ell(x + 1.1, y + 1.3, r + 0.5, r + 0.5, SHADOW, 0.42);
  P.ell(x + 0.5, y + 0.5, r, r, domeShade(R));
}
/** Slotted screw head; the slot angle is seeded (0..3). */
function screw(P, x, y, seed = 0, r = 2.4, R = RIV) {
  rivet(P, x, y, r, R);
  const k = Math.floor(hash(x, y, seed + 5) * 4);
  const d = [[1, 0], [0, 1], [1, 1], [1, -1]][k];
  for (let i = -1; i <= 1; i++) P.put(x + d[0] * i, y + d[1] * i, R[0], 0.95);
}
/** Diagonal hazard paint (worn): yellow / black stripes in a box. */
function hazard(P, x0, y0, w, h, seed = 1, period = 10, wear = 0.26) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    const yel = (((x + y + seed) % period) + period) % period < period / 2;
    const v = 0.72 - (y / Math.max(1, h - 1)) * 0.42 + (nzF(X + seed * 9, Y) - 0.5) * 0.25 + (y === 0 ? 0.25 : 0);
    const worn = nzB((X * 2 + seed * 31) & 255, (Y * 3) & 255) < wear && hash(X, Y, seed) < 0.75;
    if (worn) { P.tint(X, Y, 1.25); continue; }
    P.put(X, Y, rampAt(yel ? HZY : HZK, v, X, Y));
  }
}
/** Random short scratches (lighter metal) inside a region. */
function scratches(P, M, n, ok, R, col, a = 0.28) {
  for (let k = 0; k < n; k++) {
    const x = (R() * P.w) | 0, y = (R() * P.h) | 0;
    const dir = R() < 0.6 ? [1, 0] : R() < 0.5 ? [1, 1] : [1, -1];
    const len = 3 + ((R() * 9) | 0);
    for (let i = 0; i < len; i++) {
      const X = x + dir[0] * i, Y = y + dir[1] * i;
      if (ok(X - M, Y - M)) P.put(X, Y, col, a * (1 - i / len * 0.5));
    }
  }
}
/** Tiny brass serial plate with engraved lines (no text). */
function serialPlate(P, x, y, w = 26, h = 9) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const e = i === 0 || j === 0 || i === w - 1 || j === h - 1;
    P.put(x + i, y + j, e ? BRASS[0] : rampAt(BRASS, 0.62 - j * 0.04 - i * 0.004 + (hash(i, j, 77) - 0.5) * 0.1, x + i, y + j));
  }
  for (const [ly, lw] of [[3, w - 10], [5, w - 14]]) for (let i = 5; i < 5 + lw; i++) if (hash(i, ly, 3) > 0.18) P.put(x + i, y + ly, BRASS[1], 0.85);
  P.put(x + 2, y + 2, BRASS[0]); P.put(x + w - 3, y + 2, BRASS[0]); P.put(x + 2, y + h - 3, BRASS[0]); P.put(x + w - 3, y + h - 3, BRASS[0]);
}
/** Coffee ring stain (irregular, partial). */
function coffeeRing(P, cx, cy, r, ok, seed = 1, a = 0.3) {
  const col = cl('#6a3a14');
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
    if (!ok(x, y)) continue;
    const ang = Math.atan2(y - cy, x - cx);
    const rr = r * (1 + (nzB(((ang + 3.2) * 20) | 0, seed * 7) - 0.5) * 0.18);
    const d = Math.hypot(x - cx, y - cy) - rr;
    const gap = nzB(((ang + 3.2) * 9 + seed * 13) | 0, 40) < 0.33;
    if (gap) continue;
    if (d > -1.2 && d < 0.6) P.put(x, y, col, a * 1.1);
    else if (d <= -1.2 && d > -4) P.put(x, y, col, a * 0.22 * (1 + d / 4));
  }
}
/** Masking tape strip (axis aligned) with torn ends. */
function tapeStrip(P, x0, y0, w, h, seed = 1, col = '#efe2b4') {
  const C0 = cl(col);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tear = (x < 2 && hash(0, y, seed) < 0.5 + x * 0.25) || (x > w - 3 && hash(1, y, seed) < 0.5 + (w - 1 - x) * 0.25);
    if (tear) continue;
    const e = y === 0 || y === h - 1;
    const v = 0.9 + (nzF(x + seed * 11, y * 3) - 0.5) * 0.16 - y / h * 0.08;
    P.put(x0 + x, y0 + y, e ? scaleC(C0, 0.72) : scaleC(C0, v), 0.9);
  }
}
/** Domed status lamp: lit = colour hex (with a bloom), or off. */
function lampDot(P, x, y, lit, r = 2.6) {
  const c = lit ? hexC(lit) : cl('#3a2430');
  if (lit) for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
    const d = Math.hypot(i, j);
    const v = dq(Math.max(0, 1 - d / 6.5) * 0.45, x + i, y + j, 8);
    if (v > 0) P.put(x + i, y + j, c, v);
  }
  P.ell(x + 0.5, y + 0.5, r + 1, r + 1, INK);
  const R = lit ? [scaleC(c, 0.45), scaleC(c, 0.75), c, mixC(c, WHITE, 0.45), mixC(c, WHITE, 0.8)] : ramp('#1a0e14', '#2a1820', '#3a2430', '#5a3a48', '#7a5a68');
  P.ell(x + 0.5, y + 0.5, r, r, domeShade(R, 0.9));
}
/** A flat-bottomed rectangle on a Px with an ink outline (for silhouettes). */
const box = (P, x, y, w, h, c) => P.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c);

// ============================================================================ WALL (pegboard)

export function wallCanvas(w, h) {
  w = Math.round(w); h = Math.round(h);
  return memo(`wall|${w}x${h}`, () => {
    noiseTex();
    const P = new Px(w, h);
    const BOARD = ramp('#0a0d18', '#10141f', '#151a28', '#1a2031', '#20273a', '#272f44', '#2f384f');
    const G = 14;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0.5 + (nzB(x, y) - 0.5) * 0.3 + (nzF(y + 40, x) - 0.5) * 0.08 + (hash(x, y, 4) - 0.5) * 0.1 - (y / h) * 0.12;
      // vignette (dithered)
      const ex = Math.min(x, w - 1 - x) / 46, ey = Math.min(y, h - 1 - y) / 60;
      v -= (1 - Math.min(1, Math.min(ex, ey))) * 0.3;
      // pegboard holes on a 14 px grid: a dark 3x3 hole with a lit lower-right lip and a shaded upper-left
      const gx = ((x - 7) % G + G) % G, gy = ((y - 7) % G + G) % G;
      let c = rampAt(BOARD, v, x, y);
      if (gx < 3 && gy < 3) c = (gx === 1 || gy === 1) && !(gx === 1 && gy === 1) ? cl('#06080e') : gx === 1 && gy === 1 ? cl('#020306') : cl('#0a0d16');
      else if ((gx === 3 && gy < 4) || (gy === 3 && gx < 4)) c = rampAt(BOARD, v + 0.22, x, y);
      else if ((gx === G - 1 && gy < 3) || (gy === G - 1 && gx < 3)) c = rampAt(BOARD, v - 0.2, x, y);
      P.put(x, y, c);
    }
    // grime drips + paint marks: a few vertical streaks and stray hazard-yellow paint flecks
    const R = rng(311);
    for (let k = 0; k < Math.round(w / 40); k++) {
      const x = (R() * w) | 0, y = (R() * h * 0.7) | 0, len = 10 + ((R() * 40) | 0);
      for (let i = 0; i < len; i++) P.tint(x, y + i, 0.86 + i / len * 0.12);
    }
    for (let k = 0; k < Math.round((w * h) / 9000); k++) {
      const x = (R() * w) | 0, y = (R() * h) | 0;
      P.put(x, y, HZY[3], 0.5); if (R() < 0.5) P.put(x + 1, y, HZY[2], 0.4);
    }
    // the top edge: shadow under the workbench rail
    for (let y = 0; y < 10; y++) for (let x = 0; x < w; x++) { const v = dq((1 - y / 10) * 0.6, x, y, 8); if (v > 0) P.put(x, y, SHADOW, v); }
    return P.canvas();
  });
}

// ============================================================================ BENCH rail (segment bar)

export function benchCanvas(w, h, vertical = false) {
  w = Math.round(w); h = Math.round(h);
  return memo(`bench|${w}x${h}|${vertical ? 1 : 0}`, () => {
    noiseTex();
    const P = new Px(w, h);
    const ang = vertical ? 0 : 6; // steel angle rail along the yard edge (top in portrait)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // walnut cabinet face: grain runs along the bench
      const u = vertical ? y : x, v = vertical ? x : y;
      let g = v * 0.45 + nzG(u & 511, (v * 2) & 63) * 6 + Math.sin(u * 0.013) * 1.4;
      const ring = g - Math.floor(g);
      let val = 0.36 + (nzF(v * 3, u) - 0.5) * 0.18 - (ring < 0.18 ? 0.14 : 0) + (hash(x, y, 6) - 0.5) * 0.06;
      val -= smooth(0.5, 1, (vertical ? x / w : y / h)) * 0.12;
      P.put(x, y, rampAt(WOOD, val, x, y));
    }
    if (!vertical) {
      // steel angle + hazard paint on its face
      for (let y = 0; y < ang; y++) for (let x = 0; x < w; x++) {
        const c = y === 0 ? STEEL[6] : y === ang - 1 ? INK : rampAt(STEEL, 0.6 - y * 0.08 + (nzF(x, y * 5) - 0.5) * 0.2, x, y);
        P.put(x, y, c);
      }
      hazard(P, 0, 1, w, ang - 2, 3, 12, 0.22);
      for (let x = 0; x < w; x++) { P.put(x, ang, SHADOW, 0.55); P.put(x, ang + 1, SHADOW, 0.3); }
      for (let x = 10; x < w; x += Math.max(60, Math.round(w / 6))) rivet(P, x, Math.floor(ang / 2) - 1, 1.4);
      for (let x = 0; x < w; x++) P.put(x, h - 1, INK);
    } else {
      for (let y = 0; y < h; y++) for (let x = 0; x < 4; x++) P.put(x, y, x === 3 ? INK : rampAt(STEEL, 0.55 - x * 0.1, x, y));
      hazard(P, 0, 0, 3, h, 3, 12, 0.22);
    }
    return P.canvas();
  });
}

// ============================================================================ DRAWER (segment button)

/** o: on (pulled out + lamp lit), lock, seed */
export function drawerCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 4;
  return memo(`drawer|${w}x${h}|${o.on ? 1 : 0}|${o.lock ? 1 : 0}|${o.seed | 0}|${o.c ?? ''}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const S = chamfer(w, h, 2);
    // the cabinet hole the drawer sits in (a dark cavity, bigger when pulled out)
    shadowUnder(P, M, w, h, S.in, 0, o.on ? 4 : 2, 2, o.on ? 0.85 : 0.6);
    const FACE = o.lock ? GUN : o.on ? ALU : ramp('#1c2232', '#2a3246', '#3a445c', '#4c5872', '#606c88', '#7a86a2', '#98a4be');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      let v = 0.52 + brush(x, y, o.seed | 0) * 1.1 + (nzB(x, y) - 0.5) * 0.08 - y / h * 0.14;
      let c;
      if (d === 0) c = INK;
      else if (d === 1) c = rampAt(FACE, v + (y < h / 2 || x < 3 ? 0.34 : -0.24), x, y);
      else c = rampAt(FACE, v, x + M, y + M);
      P.put(x + M, y + M, c);
    }
    // label holder (brass frame) + card
    const hx0 = 5, hx1 = w - 6, hy0 = 4, hy1 = h - 9;
    for (let y = hy0; y <= hy1; y++) for (let x = hx0; x <= hx1; x++) {
      const e = x === hx0 || x === hx1 || y === hy0 || y === hy1;
      const rim = x === hx0 + 1 || x === hx1 - 1 || y === hy0 + 1 || y === hy1 - 1;
      let c;
      if (e) c = BRASS[0];
      else if (rim) c = rampAt(BRASS, (y === hy0 + 1 ? 0.95 : y === hy1 - 1 ? 0.35 : 0.62) + (hash(x, y, 8) - 0.5) * 0.1, x, y);
      else {
        // the card: warm cream when out, dimmer when shut; top rows shaded by the holder lip
        const base = o.lock ? cl('#8a8678') : o.on ? cl('#fbf3d6') : cl('#d8d0b6');
        let k = 1 + (nzF(x * 2, y * 5) - 0.5) * 0.06 - (y === hy0 + 2 ? 0.14 : y === hy0 + 3 ? 0.06 : 0);
        if (hash(x, y, 9) < 0.01) k -= 0.08;
        c = scaleC(base, k);
      }
      P.put(x + M, y + M, c);
    }
    // holder screws
    screw(P, hx0 + M - 2, Math.round((hy0 + hy1) / 2) + M, 1, 1.3, ramp('#3a2204', '#6a420c', '#c8962a', '#fde27a', '#fff6c8'));
    screw(P, hx1 + M + 2, Math.round((hy0 + hy1) / 2) + M, 2, 1.3, ramp('#3a2204', '#6a420c', '#c8962a', '#fde27a', '#fff6c8'));
    // pull handle: a steel bar on two posts under the holder
    const pw = Math.max(16, Math.round(w * 0.3)), px0 = Math.round(w / 2 - pw / 2), py = h - 6;
    for (let x = 0; x < pw; x++) {
      P.put(px0 + x + M, py + 3 + M, SHADOW, 0.5);
      P.put(px0 + x + M, py + M, INK);
      P.put(px0 + x + M, py + 1 + M, STEEL[6]);
      P.put(px0 + x + M, py + 2 + M, STEEL[3]);
      P.put(px0 + x + M, py + 3 + M, INK);
    }
    for (const xx of [px0 - 1, px0 + pw]) for (let j = 0; j < 4; j++) P.put(xx + M, py + j + M, j === 3 ? INK : STEEL[2]);
    // status lamp in the corner of the face
    if (!o.lock) lampDot(P, w - 5 + M, h - 5 + M, o.on ? o.c || '#7aff4a' : null, 1.6);
    // wear
    const R = rng(40 + (o.seed | 0));
    scratches(P, M, Math.round(w / 14), (x, y) => S.in(x, y) && S.d(x, y) > 1 && !(x >= hx0 && x <= hx1 && y >= hy0 && y <= hy1), R, WHITE, 0.18);
    return P.canvas();
  });
}

// ============================================================================ PLATE (riveted steel)

/** o: seed, hazard (band on top), accent (#hex strip on the left), serial, tone ('dark' | 'gun') */
export function plateCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 8;
  return memo(`plate|${w}x${h}|${o.seed | 0}|${o.hazard ? 1 : 0}|${o.accent ?? ''}|${o.serial ? 1 : 0}|${o.tone ?? ''}|${o.glow ?? ''}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const c = 6;
    const S = chamfer(w, h, c);
    shadowUnder(P, M, w, h, S.in, 1, 5, 3, 0.75);
    const F = o.tone === 'gun' ? GUN : PLATE;
    const ox = ((o.seed | 0) * 41) & 255;
    const hz = o.hazard ? 9 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      let v = 0.46 + (nzB(x + ox, y) - 0.5) * 0.18 + brush(x, y, o.seed | 0) - (y / h) * 0.12 + (hash(x, y, 3) - 0.5) * 0.04;
      // grime toward the bottom (dithered blotches)
      v -= smooth(0.55, 1, y / h) * (0.06 + nzB((x * 2 + ox) & 255, (y * 2) & 255) * 0.1);
      const lit = y < h / 2 ? (x < w / 2 ? y <= x * 1.2 || true : true) : false;
      let col;
      if (d === 0) col = INK;
      else if (d === 1) col = rampAt(F, v + ((y < 3 + c && y <= h / 2) || x < 2 ? 0.42 : -0.22), x, y);
      else if (d === 2) col = rampAt(F, v + ((y < h / 2 && y < 4 + c) || x < 3 ? 0.16 : -0.08), x, y);
      // engraved groove inset 6: dark line, lit line under it
      else if (d === 6) col = rampAt(F, v - 0.2, x, y);
      else if (d === 7) col = rampAt(F, v + 0.12, x, y);
      else col = rampAt(F, v, x, y);
      void lit;
      P.put(x + M, y + M, col);
    }
    // a soft glow wash (e.g. branch colour) inside the groove
    if (o.glow) {
      const g = hexC(o.glow);
      for (let y = 8; y < h - 8; y++) for (let x = 8; x < w - 8; x++) {
        const k = dq((1 - y / h) * 0.16, x, y, 8);
        if (k > 0) P.put(x + M, y + M, g, k);
      }
    }
    if (o.accent) {
      const A = rampOf(o.accent);
      for (let y = 10; y < h - 10; y++) for (let x = 3; x < 6; x++) P.put(x + M, y + M, x === 5 ? INK : rampAt(A, 0.75 - y / h * 0.3 + (x === 3 ? 0.15 : 0), x, y));
    }
    if (hz) {
      hazard(P, M + 8, M + 2, w - 16, hz - 3, (o.seed | 0) + 2, 12);
      for (let x = 8; x < w - 8; x++) { P.put(x + M, M + hz - 1, INK); P.put(x + M, M + hz, SHADOW, 0.4); }
    }
    // wear: scratches, chipped edges (bare bright metal at the bevel)
    const R = rng(90 + (o.seed | 0));
    scratches(P, M, Math.round((w * h) / 1400), (x, y) => S.in(x, y) && S.d(x, y) > 3, R, cl('#b8c4dc'), 0.22);
    for (let k = 0; k < Math.round((w + h) / 16); k++) {
      const x = (R() * w) | 0, y = (R() * h) | 0;
      if (S.in(x, y) && S.d(x, y) === 1) { P.put(x + M, y + M, F[9]); if (R() < 0.5) P.put(x + M + 1, y + M, F[8]); }
    }
    // rivets along the edges (+ rust weeping out of a few)
    const rv = [];
    const ry = 4 + hz, rx = 4;
    const nX = Math.max(2, Math.round((w - 2 * rx) / 52) + 1), nY = h > 120 ? Math.max(2, Math.round((h - 2 * ry) / 52) + 1) : 2;
    for (let i = 0; i < nX; i++) { const x = Math.round(rx + 3 + (i * (w - 2 * rx - 7)) / (nX - 1)); rv.push([x, ry - (hz ? 0 : 0)], [x, h - 6]); }
    if (nY > 2) for (let j = 1; j < nY - 1; j++) { const y = Math.round(ry + (j * (h - ry - 6)) / (nY - 1)); rv.push([4, y], [w - 6, y]); }
    for (const [x, y] of rv) {
      if (hz && y < hz + 2) continue;
      rivet(P, x + M, y + M, 1.9);
      if (hash(x, y, 12) < 0.3) for (let j = 3; j < 3 + ((hash(x, y, 13) * 7) | 0); j++) P.put(x + M + (j > 5 ? 1 : 0), y + j + M, cl('#7a3a14'), 0.5 - j * 0.04);
    }
    if (hz) for (const x of [4, w - 6]) rivet(P, x + M, M + 4, 1.9);
    if (o.serial && w > 160 && h > 60) serialPlate(P, w - 40 + M, h - 15 + M);
    return P.canvas();
  });
}

// ============================================================================ SOCKET (module bay)

/** o: color (category), lit (equipped), seed */
export function socketCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 6;
  return memo(`socket|${w}x${h}|${o.color ?? ''}|${o.lit ? 1 : 0}|${o.seed | 0}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const S = chamfer(w, h, 4);
    shadowUnder(P, M, w, h, S.in, 1, 3, 2, 0.6);
    const bz = 4; // bezel width
    const C = hexC(o.color);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      let col;
      if (d === 0) col = INK;
      else if (d < bz) {
        const v = 0.6 + brush(x, y, 3) + (d === 1 ? (y < h / 2 ? 0.3 : -0.15) : d === bz - 1 ? (y < h / 2 ? -0.25 : 0.2) : 0);
        col = rampAt(STEEL, v - y / h * 0.15, x, y);
      } else if (d === bz) col = INK;
      else {
        // the niche: dark, lit from the top, a cool glow of the category colour on its floor
        const t = (y - bz) / (h - 2 * bz);
        const v = 0.2 + (1 - t) * 0.12 - (d === bz + 1 || d === bz + 2 ? (y < h / 2 || x < w / 2 ? 0.12 : -0.04) : 0) + (nzB(x * 2, y * 2) - 0.5) * 0.08;
        col = rampAt(PLATE, v, x, y);
        const gl = dq(smooth(0.45, 1, t) * 0.28 * (o.lit ? 1 : 0.35), x, y, 8);
        if (gl > 0) col = mixC(col, C, gl);
      }
      P.put(x + M, y + M, col);
    }
    // a grid of tiny vent slots in the niche floor
    for (let x = bz + 5; x < w - bz - 5; x += 4) for (const yy of [h - bz - 5, h - bz - 3]) P.put(x + M, yy + M, SHADOW, 0.55);
    // corner screws
    const sc = [[2, 2], [w - 4, 2], [2, h - 4], [w - 4, h - 4]];
    sc.forEach(([x, y], i) => screw(P, x + M + 0.5, y + M + 0.5, i + (o.seed | 0), 1.4));
    // masking tape label across the top
    tapeStrip(P, M + 7, M + 2, w - 14, 13, (o.seed | 0) + 3);
    // marker swatch on the tape (category colour)
    for (let y = 5; y < 12; y++) for (let x = 0; x < 3; x++) P.put(M + 10 + x, M + y, C, 0.85);
    // status lamp (top right, on the bezel)
    lampDot(P, w - 9 + M, 22 + M, o.lit ? toHex(C) : null, 1.8);
    return P.canvas();
  });
}

// ============================================================================ TIER key (base silhouettes)

const SIL = {
  1: (b, s) => { // camp tent with a flag
    b.poly([[4, 19], [15, 5], [26, 19]], 'body'); b.poly([[15, 5], [26, 19], [19, 19]], 'side');
    b.poly([[13, 19], [15, 12], [17, 19]], 'dark'); b.rect(15, 2, 1, 4, 'dark'); b.rect(16, 2, 4, 2, 'acc');
    b.rect(2, 14, 1, 5, 'body'); b.rect(1, 13, 3, 1, 'lit'); s.push([2, 13]);
  },
  2: (b) => { // plywood shack + chimney
    b.rect(6, 10, 18, 9, 'body'); b.rect(19, 10, 5, 9, 'side');
    b.poly([[4, 11], [15, 4], [26, 11]], 'roof'); b.rect(20, 4, 2, 5, 'dark');
    b.rect(13, 13, 4, 6, 'dark'); b.rect(8, 12, 3, 3, 'lit'); b.rect(19, 12, 3, 3, 'lit');
  },
  3: (b) => { // trailer on wheels
    b.poly([[3, 9], [5, 7], [23, 7], [25, 9], [25, 17], [3, 17]], 'body'); b.rect(3, 15, 22, 2, 'side');
    b.rect(5, 9, 3, 3, 'lit'); b.rect(10, 9, 3, 3, 'lit'); b.rect(17, 9, 3, 6, 'dark');
    b.rect(6, 16, 4, 3, 'dark'); b.rect(19, 16, 4, 3, 'dark'); b.rect(7, 17, 2, 1, 'body'); b.rect(20, 17, 2, 1, 'body');
    b.rect(25, 14, 4, 1, 'side'); b.rect(6, 3, 1, 4, 'dark'); b.rect(5, 2, 3, 1, 'acc');
  },
  4: (b) => { // field lab: quonset hut + dish
    b.poly([[3, 19], [3, 14], [5, 10], [9, 7], [15, 6], [21, 7], [25, 10], [27, 14], [27, 19]], 'body');
    b.poly([[21, 7], [25, 10], [27, 14], [27, 19], [22, 19]], 'side');
    for (const x of [8, 14, 20]) b.rect(x, 8, 1, 11, 'rib');
    b.rect(12, 13, 5, 6, 'dark'); b.rect(5, 13, 2, 2, 'lit');
    b.rect(18, 2, 1, 5, 'dark'); b.poly([[16, 1], [21, 0], [22, 3]], 'lit');
  },
  5: (b) => { // the Beast Lab: block, tank on the roof, window band, sign
    b.rect(4, 9, 22, 10, 'body'); b.rect(20, 9, 6, 10, 'side');
    b.rect(8, 4, 7, 5, 'roof'); b.rect(9, 3, 5, 1, 'roof'); b.rect(17, 6, 2, 3, 'dark');
    b.rect(6, 11, 13, 3, 'lit'); b.rect(12, 15, 5, 4, 'dark'); b.rect(21, 11, 4, 3, 'acc');
  },
  6: (b) => { // Mega HQ: tower + wings + antenna
    b.rect(11, 3, 9, 16, 'body'); b.rect(17, 3, 3, 16, 'side'); b.rect(4, 10, 7, 9, 'body'); b.rect(20, 10, 7, 9, 'side');
    b.rect(15, 0, 1, 3, 'dark'); b.rect(16, 0, 3, 1, 'acc');
    for (let y = 5; y < 17; y += 3) for (const x of [12, 14]) b.rect(x, y, 1, 1, 'lit');
    for (const x of [5, 8, 21, 24]) b.rect(x, 12, 1, 2, 'lit');
    b.rect(13, 16, 3, 3, 'dark');
  },
};
/** o: tier 1..6, on */
export function tierCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 4;
  return memo(`tier|${w}x${h}|${o.tier | 0}|${o.on ? 1 : 0}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const S = chamfer(w, h, 3);
    shadowUnder(P, M, w, h, S.in, 0, o.on ? 2 : 3, 2, 0.6);
    const KEY = o.on ? ALU : ramp('#1a2030', '#262e42', '#343e56', '#46526c', '#5a6884', '#76849e', '#96a2ba');
    const sh = Math.round(Math.min(h * 0.62, (w - 6) / 1.45 + 3)); // screen bottom (the key's ::before spacer matches)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      const v = 0.5 + brush(x, y, 4) - y / h * 0.16;
      P.put(x + M, y + M, d === 0 ? INK : d === 1 ? rampAt(KEY, v + (y < h / 2 ? 0.35 : -0.25), x, y) : rampAt(KEY, v, x, y));
    }
    // the screen (blueprint glass)
    const sx0 = 3, sx1 = w - 4, sy0 = 3, sy1 = sh;
    const SC = o.on ? ramp('#06162e', '#0a2448', '#0e3260', '#144078') : ramp('#05080f', '#080d18', '#0c1322', '#10182c');
    for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
      const e = x === sx0 || x === sx1 || y === sy0 || y === sy1;
      if (e) { P.put(x + M, y + M, INK); continue; }
      const t = (y - sy0) / (sy1 - sy0);
      let c = rampAt(SC, 0.65 - t * 0.5 + (hash(x, y, 7) - 0.5) * 0.12, x, y);
      if (((x - sx0) % 5 === 0 || (y - sy0) % 5 === 0)) c = mixC(c, cl('#3a7ab8'), o.on ? 0.22 : 0.1);
      P.put(x + M, y + M, c);
    }
    // the silhouette, scaled to the screen
    const sw = sx1 - sx0 - 3, shh = sy1 - sy0 - 3;
    const k = Math.max(1, Math.min(Math.floor(sw / 30), Math.floor(shh / 20)) || 1);
    const kk = Math.min(sw / 30, shh / 20) >= 1 ? k : Math.min(sw / 30, shh / 20);
    const ox = sx0 + 2 + Math.round((sw - 30 * kk) / 2), oy = sy0 + 2 + Math.round((shh - 20 * kk) / 2);
    const COL = o.on
      ? { body: cl('#8ff0ff'), side: cl('#46b4e0'), roof: cl('#c8f8ff'), dark: cl('#0a2448'), lit: cl('#fff3a0'), acc: cl('#ff5aa8'), rib: cl('#46b4e0') }
      : { body: cl('#5a7898'), side: cl('#3a5470'), roof: cl('#6e8aa8'), dark: cl('#0a1222'), lit: cl('#8a8a6a'), acc: cl('#8a5a78'), rib: cl('#3a5470') };
    const B = new Px(30, 20);
    const draw = {
      rect: (x, y, ww, hh, c) => B.rect(x, y, ww, hh, COL[c]),
      poly: (pts, c) => B.poly(pts, COL[c]),
    };
    SIL[o.tier]?.(draw, []);
    // ground line
    B.rect(0, 19, 30, 1, o.on ? COL.side : COL.side);
    for (let y = 0; y < Math.ceil(20 * kk); y++) for (let x = 0; x < Math.ceil(30 * kk); x++) {
      const bx = Math.floor(x / kk), by = Math.floor(y / kk);
      const a = B.a(bx, by);
      if (!a) {
        // a 1 texel ink outline around the silhouette
        const n = B.a(Math.floor((x + 1) / kk), by) || B.a(Math.floor((x - 1) / kk), by) || B.a(bx, Math.floor((y + 1) / kk)) || B.a(bx, Math.floor((y - 1) / kk));
        if (n) P.put(ox + x + M, oy + y + M, cl('#04060c'));
        continue;
      }
      const i = (by * 30 + bx) * 4;
      P.put(ox + x + M, oy + y + M, [B.d[i], B.d[i + 1], B.d[i + 2]]);
    }
    // glass glint + scanline
    for (let i = 0; i < Math.min(8, sw); i++) P.put(sx0 + 2 + i + M, sy0 + 2 + M, WHITE, o.on ? 0.3 : 0.12);
    if (o.on) {
      // the lit screen glows onto the key face under it
      for (let x = sx0; x <= sx1; x++) P.put(x + M, sy1 + 1 + M, cl('#7ae8ff'), 0.35);
    }
    return P.canvas();
  });
}

// ============================================================================ CASE (glass display)

/** Back of a display case: frame, velvet, spotlight, plinth. o: color, seed, lock, sel */
export function caseCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 5;
  return memo(`case|${w}x${h}|${o.color ?? ''}|${o.lock ? 1 : 0}|${o.sel ? 1 : 0}|${o.seed | 0}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const S = chamfer(w, h, 3);
    shadowUnder(P, M, w, h, S.in, 1, 3, 2, 0.55);
    const fr = 4;
    const FRAME = o.sel ? BRASS : STEEL;
    const vel = mixC(hexC(o.color, '#3a4aa8'), [10, 8, 30], o.lock ? 0.86 : 0.7);
    const plH = Math.max(6, Math.round(h * 0.13));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      let col;
      if (d === 0 || d === fr) col = INK;
      else if (d < fr) {
        const v = 0.58 + brush(x, y, 9) + (d === 1 ? (y < h / 2 ? 0.3 : -0.2) : d === fr - 1 ? (y < h / 2 ? -0.22 : 0.18) : 0) - y / h * 0.18;
        col = rampAt(FRAME, v, x, y);
      } else if (y >= h - fr - plH) {
        // plinth: a lit top face then a darker front
        const py = y - (h - fr - plH);
        const v = py === 0 ? 0.9 : py === 1 ? 0.72 : 0.42 - py / plH * 0.2 + (nzF(x * 2, py * 3) - 0.5) * 0.1;
        col = py === plH - 1 ? INK : rampAt(o.lock ? GUN : PLATE, v + 0.2, x, y);
      } else {
        // velvet back wall: woven texture, spotlight pool from the top, darker corners
        const u = (x - w / 2) / (w / 2), t = (y - fr) / (h - 2 * fr - plH);
        const spot = Math.max(0, 1 - Math.hypot(u * 1.1, (t - 0.35) * 1.4));
        let k = 0.55 + spot * 0.6 + (nzF(y * 3 + 17, x * 2) - 0.5) * 0.14 + ((x + y) % 2 ? 0.03 : -0.03);
        k = Math.floor(k * 10 + (hash(x, y, 2) - 0.5) * 1.2) / 10;
        col = scaleC(vel, Math.max(0.3, k));
        if (d === fr + 1 || d === fr + 2) col = scaleC(col, 0.65);
      }
      P.put(x + M, y + M, col);
    }
    // the spotlight fixture at the top of the case (a small steel hood with a warm bulb)
    const lx = Math.round(w / 2);
    for (let i = -5; i <= 5; i++) { P.put(lx + i + M, fr + 1 + M, STEEL[2]); P.put(lx + i + M, fr + 2 + M, Math.abs(i) < 4 ? cl('#fff2b0') : STEEL[1]); }
    // corner screws on the frame
    [[1, 1], [w - 3, 1], [1, h - 3], [w - 3, h - 3]].forEach(([x, y], i) => P.put(x + M + 0.5, y + M + 0.5, i % 2 ? FRAME[1] : FRAME[2]));
    return P.canvas();
  });
}
/** Glass front of a display case: glare bands, edge sheen, dust; lock = caution tape across. */
export function glassCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  return memo(`glass|${w}x${h}|${o.lock ? 1 : 0}`, () => {
    const P = new Px(w, h);
    const fr = 5;
    for (let y = fr; y < h - fr; y++) for (let x = fr; x < w - fr; x++) {
      const s = x + y * 0.8;
      const b1 = Math.abs(s - w * 0.32) < w * 0.07, b2 = Math.abs(s - w * 0.52) < w * 0.025;
      if (b1 || b2) { const v = dq(b1 ? 0.16 : 0.24, x, y, 6); if (v > 0) P.put(x, y, WHITE, v); }
      if (hash(x, y, 51) < 0.004) P.put(x, y, WHITE, 0.35);
    }
    for (let x = fr; x < w - fr; x++) P.put(x, fr, WHITE, 0.3);
    for (let y = fr; y < h - fr; y++) P.put(fr, y, WHITE, 0.18);
    if (o.lock) {
      // one strip of caution tape across the lower glass (shallow slope, torn short of the frame)
      const tw = Math.max(6, Math.round(Math.min(w, h) * 0.1));
      const y0 = h * 0.7, slope = -0.22;
      for (let y = fr; y < h - fr; y++) for (let x = fr + 2; x < w - fr - 2; x++) {
        const dd = Math.abs(y - (y0 + (x - w / 2) * slope));
        if (dd > tw / 2) continue;
        const stripe = Math.floor((x - y * 0.9 + 400) / 5) % 2 === 0;
        const edge = dd > tw / 2 - 1;
        P.put(x, y + 1, SHADOW, 0.35);
        P.put(x, y, edge ? INK : stripe ? HZY[3] : HZK[1], 0.97);
      }
    }
    return P.canvas();
  });
}

// ============================================================================ CLIPBOARD (steel, graph paper)

/** o: seed, ring (coffee ring), paper ('graph' | 'lined'), short (clip height) */
export function clipCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 8;
  return memo(`clip|${w}x${h}|${o.seed | 0}|${o.ring ? 1 : 0}|${o.paper ?? 'graph'}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const S = rounded(w, h, 7);
    shadowUnder(P, M, w, h, S.in, 2, 5, 4, 0.75);
    // brushed aluminium board
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      const v = 0.52 + brush(x, y, 5) * 1.6 + (nzB(x, y) - 0.5) * 0.1 - y / h * 0.14;
      P.put(x + M, y + M, d === 0 ? INK : d === 1 ? rampAt(ALU, v + (y < h / 2 ? 0.34 : -0.26), x, y) : d === 2 ? rampAt(ALU, v + (y < h / 2 ? 0.1 : -0.1), x, y) : rampAt(ALU, v, x, y));
    }
    // the sheet
    const px0 = 6, px1 = w - 7, py0 = 14, py1 = h - 7;
    const PAP = cl('#fbfaf2');
    for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
      const e = x === px0 || x === px1 || y === py1;
      let k = 1 + (nzF(x + 60, y + 30) - 0.5) * 0.035 + (nzB(x + 9, y) - 0.5) * 0.04 - ((y - py0) / (py1 - py0)) * 0.04;
      if (hash(x, y, 31) < 0.01) k -= 0.05;
      let c = e ? cl('#bcb8aa') : scaleC(PAP, k);
      if (!e && o.paper !== 'lined') {
        const gx = (x - px0) % 9, gy = (y - py0) % 9;
        if (gx === 0 || gy === 0) c = mixC(c, cl('#7ab0e0'), (x - px0) % 45 === 0 || (y - py0) % 45 === 0 ? 0.5 : 0.24);
      } else if (!e && (y - py0) % 14 === 10) c = mixC(c, cl('#7ab0e0'), 0.45);
      P.put(x + M, y + M, c);
    }
    for (let y = py0 + 1; y <= py1 + 1; y++) P.put(px1 + 1 + M, y + M, SHADOW, 0.35);
    for (let x = px0 + 1; x <= px1 + 1; x++) P.put(x + M, py1 + 1 + M, SHADOW, 0.35);
    // red margin line
    for (let y = py0 + 1; y < py1; y++) P.put(px0 + 9 + M, y + M, cl('#e8707a'), 0.6);
    // coffee ring on the paper corner
    if (o.ring && w > 120 && h > 70) {
      const R0 = rng(500 + (o.seed | 0));
      coffeeRing(P, M + w - 30 - R0() * 30, M + h - 24 - R0() * 12, 13 + R0() * 4, (x, y) => x - M > px0 && x - M < px1 && y - M > py0 && y - M < py1, (o.seed | 0) + 1, 0.28);
    }
    // the clip: a steel plate with a lever hump and two rivets
    const cw = Math.min(84, Math.round(w * 0.36)), cx0 = Math.round(w / 2 - cw / 2);
    for (let y = 16; y < 21; y++) for (let x = cx0 + 2; x < cx0 + cw + 2; x++) P.put(x + M, y + M, SHADOW, 0.3 - (y - 16) * 0.05);
    const hw = Math.round(cw * 0.5), hx = Math.round(w / 2 - hw / 2);
    for (let y = 0; y < 8; y++) for (let x = hx; x < hx + hw; x++) {
      const u = (x - hx) / (hw - 1);
      const top = Math.round(Math.pow(Math.abs(u - 0.5) * 2, 3) * 6);
      if (y < top) continue;
      const e = y === top || x === hx || x === hx + hw - 1;
      P.put(x + M, y + M, e ? STEEL[0] : rampAt(STEEL, 0.9 - y * 0.08 - u * 0.15, x, y));
    }
    for (let y = 6; y < 17; y++) for (let x = cx0; x < cx0 + cw; x++) {
      const u = (x - cx0) / (cw - 1), v = y - 6;
      const e = x === cx0 || x === cx0 + cw - 1 || v === 0 || v === 10;
      P.put(x + M, y + M, e ? STEEL[0] : rampAt(STEEL, (v === 1 ? 0.95 : 0.72 - v * 0.04) - u * 0.25 + (nzF(x, y * 4) - 0.5) * 0.1, x, y));
    }
    for (const rx of [cx0 + 6, cx0 + cw - 7]) rivet(P, rx + M, 11 + M, 2, ramp('#1e2236', '#5c6480', '#a8b0c8', '#ced4e4', '#f0f4fc'));
    // board wear
    const R = rng(70 + (o.seed | 0));
    scratches(P, M, Math.round((w + h) / 12), (x, y) => S.in(x, y) && S.d(x, y) > 1 && (x < px0 || x > px1 || y < py0 || y > py1), R, WHITE, 0.3);
    return P.canvas();
  });
}

// ============================================================================ BLUEPRINT sheet

function paintBlueprint(P, ox, oy, w, h, o = {}) {
  const grid = o.grid ?? 8, major = o.major ?? 5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = ox + x, Y = oy + y;
    let v = 0.5 + (nzB(x + (o.seed | 0) * 13, y) - 0.5) * 0.36 + (nzF(x + 77, y + 11) - 0.5) * 0.1 - (y / h) * 0.1 + (hash(x, y, 17) - 0.5) * 0.06;
    // fold creases
    const fx = Math.round(w / 2), fy = Math.round(h / 2);
    if (o.folds !== false && w > 160) { if (x === fx) v -= 0.18; else if (x === fx + 1) v += 0.14; }
    if (o.folds !== false && h > 160) { if (y === fy) v -= 0.18; else if (y === fy + 1) v += 0.14; }
    let c = rampAt(BLUEP, v, X, Y);
    const gx = x % grid, gy = y % grid;
    if (gx === 0 || gy === 0) {
      const maj = x % (grid * major) === 0 || y % (grid * major) === 0;
      c = mixC(c, cl('#b4d8ff'), maj ? 0.32 : 0.12);
    }
    // the drafting border: double line
    const ed = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (ed === 5 || ed === 8) c = mixC(c, cl('#e8f4ff'), 0.62);
    if (ed < 5) c = mixC(c, cl('#0a1a40'), 0.15);
    P.put(X, Y, c);
  }
  // title block (bottom right)
  if (o.title !== false && w > 200 && h > 120) {
    const tw = Math.min(120, Math.round(w * 0.36)), th = 26, tx = w - 9 - tw, ty = h - 9 - th;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const e = x === 0 || y === 0 || (y === 10 && x > 0) || (x === Math.round(tw * 0.6) && y > 10);
      if (e) P.put(ox + tx + x, oy + ty + y, cl('#e8f4ff'), 0.6);
      else P.put(ox + tx + x, oy + ty + y, cl('#0a1a40'), 0.12);
    }
    // "handwritten" scribbles in the title block cells (squiggles, not letters)
    const R = rng(808 + (o.seed | 0));
    for (const [sx, sy, sw] of [[4, 4, tw * 0.5], [4, 15, tw * 0.45], [tw * 0.64, 15, tw * 0.28]]) {
      let yy = sy + 1;
      for (let x = 0; x < sw; x++) { if (R() < 0.3) yy += R() < 0.5 ? -1 : 1; yy = Math.max(sy, Math.min(sy + 4, yy)); P.put(ox + tx + sx + x, oy + ty + yy, cl('#ffffff'), 0.55); }
    }
  }
}
/** A blueprint sheet with tape on the corners and a soft shadow. o: seed, ring */
export function blueprintCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 8;
  return memo(`blueprint|${w}x${h}|${o.seed | 0}|${o.ring ? 1 : 0}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const S = chamfer(w, h, 0);
    shadowUnder(P, M, w, h, S.in, 1, 4, 3, 0.7);
    paintBlueprint(P, M, M, w, h, o);
    for (let x = 0; x < w; x++) { P.put(x + M, M, cl('#5a84c8')); P.put(x + M, h - 1 + M, cl('#06143a')); }
    for (let y = 0; y < h; y++) { P.put(M, y + M, cl('#4a74b8')); P.put(w - 1 + M, y + M, cl('#06143a')); }
    if (o.ring && w > 140 && h > 90) {
      const R0 = rng(600 + (o.seed | 0));
      coffeeRing(P, M + 26 + R0() * 40, M + h - 30 - R0() * 20, 14 + R0() * 4, (x, y) => x > M && y > M && x < M + w - 1 && y < M + h - 1, (o.seed | 0) + 4, 0.34);
    }
    // masking tape over the two top corners
    tapeStrip(P, M - 4, M - 3, 30, 11, (o.seed | 0) + 1);
    tapeStrip(P, M + w - 26, M - 3, 30, 11, (o.seed | 0) + 2);
    return P.canvas();
  });
}

// ============================================================================ TAG (specimen tag)

/** o: got (stamped), next (highlighted), seed */
export function tagCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 6, top = 10; // string loop above the tag (in the margin + top band)
  return memo(`tag|${w}x${h}|${o.got ? 1 : 0}|${o.next ? 1 : 0}|${o.seed | 0}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const c = 7;
    const ins = (x, y) => x >= 0 && y >= top && x < w && y < h && !(y - top < c - x) && !(y - top < c - (w - 1 - x));
    shadowUnder(P, M, w, h, ins, 1, 3, 2, 0.55);
    const F = o.got ? ramp('#5a7a30', '#80a048', '#a6c46a', '#c4dc8a', '#dcecaa', '#eef8cc') : MANILA;
    for (let y = top; y < h; y++) for (let x = 0; x < w; x++) {
      if (!ins(x, y)) continue;
      const edge = !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1);
      const v = 0.68 + (nzF(x + (o.seed | 0) * 20, y * 2) - 0.5) * 0.14 + (nzB(x * 3, y * 3) - 0.5) * 0.12 - (y - top) / h * 0.12;
      P.put(x + M, y + M, edge ? scaleC(F[0], 0.7) : rampAt(F, v + (y === top + 1 || x === 1 ? 0.18 : 0), x, y));
    }
    // brass eyelet + string
    const ex = Math.round(w / 2), ey = top + 7;
    P.ell(ex + M + 0.5, ey + M + 0.5, 3.6, 3.6, domeShade(ramp('#3a2204', '#6a420c', '#c8962a', '#fde27a', '#fff6c8')));
    P.ell(ex + M + 0.5, ey + M + 0.5, 1.6, 1.6, INK);
    const S2 = cl('#e8dcc0');
    for (let y = -M; y < ey; y++) {
      const t = (y + M) / (ey + M);
      const xx = Math.round(ex + Math.sin(t * 3.1) * 3 * (1 - t));
      if (y > ey - 4) continue;
      P.put(xx + M, y + M, S2); P.put(xx + 1 + M, y + M, scaleC(S2, 0.7));
    }
    if (o.next) for (let x = 2; x < w - 2; x++) { P.put(x + M, h - 3 + M, HZY[3]); P.put(x + M, h - 2 + M, HZY[1]); }
    return P.canvas();
  });
}

// ============================================================================ CHALKBOARD

export function chalkCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 8;
  return memo(`chalk|${w}x${h}|${o.seed | 0}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const fr = 7, tray = 6;
    const S = chamfer(w, h, 0);
    shadowUnder(P, M, w, h, S.in, 1, 5, 3, 0.75);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dl = x, dr = w - 1 - x, dt = y, db = h - 1 - y - tray;
      const d = Math.min(dl, dr, dt, db);
      let col;
      if (d < fr) {
        // wooden frame (grain along each rail)
        const horiz = Math.min(dt, db) <= Math.min(dl, dr);
        const u = horiz ? x : y, v = horiz ? (dt < db ? dt : db) : (dl < dr ? dl : dr);
        const g = v * 0.6 + nzG(u & 511, (v * 3) & 63) * 6;
        const ring = g - Math.floor(g);
        let val = 0.55 + (ring < 0.2 ? -0.16 : 0) + (v === 0 ? 0.25 : v === fr - 1 ? -0.3 : 0) + (horiz && dt < db ? 0.05 : -0.04);
        col = v === 0 && (x === 0 || y === 0 || x === w - 1) ? INK : rampAt(WOOD, val, x, y);
        if (y >= h - tray) col = null;
      } else {
        // slate + chalk dust smudges + erased streaks
        const sm = nzB((x * 0.7 + 30) | 0, (y * 1.4) | 0);
        let v = 0.45 + (nzF(x, y + 90) - 0.5) * 0.1 + (sm > 0.6 ? (sm - 0.6) * 1.4 : 0) - (Math.min(d - fr, 6) < 3 ? 0.12 : 0);
        col = rampAt(SLATE, v, x, y);
        const streak = Math.abs(((y + Math.round(nzB(x & 255, 7) * 8)) % 37) - 18) < 2 && nzB(x & 255, (y * 3) & 255) > 0.55;
        if (streak) col = mixC(col, cl('#c8d8d0'), 0.08);
      }
      if (col) P.put(x + M, y + M, col);
    }
    // the tray: a wooden ledge under the board with chalk + a felt eraser
    for (let y = h - tray; y < h; y++) for (let x = -2; x < w + 2; x++) {
      const v = y - (h - tray);
      P.put(x + M, y + M, v === 0 ? rampAt(WOOD, 0.9, x, y) : v === tray - 1 ? INK : rampAt(WOOD, 0.6 - v * 0.08 + (nzG(x & 511, v * 5) - 0.5) * 0.3, x, y));
    }
    const cx = Math.round(w * 0.22);
    for (let i = 0; i < 16; i++) { P.put(cx + i + M, h - tray - 2 + M, cl('#f4f4ee')); P.put(cx + i + M, h - tray - 1 + M, cl('#c8c8c0')); }
    const ex = Math.round(w * 0.7);
    for (let i = 0; i < 22; i++) for (let j = 0; j < 5; j++) P.put(ex + i + M, h - tray - 5 + j + M, i === 0 || i === 21 || j === 0 ? INK : j > 2 ? cl('#5a5a6a') : rampAt(WOOD, 0.75, i, j));
    return P.canvas();
  });
}

// ============================================================================ DYMO label tape

const DYMO = { black: '#18181e', red: '#b01e2a', blue: '#1c4aa6', green: '#1a7034' };
export function dymoCanvas(w, h, o = {}) {
  w = Math.round(w); h = Math.round(h);
  const M = 3;
  return memo(`dymo|${w}x${h}|${o.color ?? 'black'}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const base = cl(DYMO[o.color] ?? o.color ?? DYMO.black);
    const ins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !(x < 3 && Math.abs(y - h / 2) < 3 - x) && !((x === 0 || x === w - 1) && (y === 0 || y === h - 1));
    shadowUnder(P, M, w, h, ins, 1, 2, 1, 0.6);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!ins(x, y)) continue;
      const edge = !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1);
      let k = 1 + (y % 2 ? -0.05 : 0.04) + (nzF(x + 9, y) - 0.5) * 0.12 - y / h * 0.25;
      if (y === 1 || y === 2) k += 0.35;
      let c = scaleC(base, k);
      if (y === 1) c = mixC(c, WHITE, 0.22);
      P.put(x + M, y + M, edge ? scaleC(base, 0.45) : c);
    }
    return P.canvas();
  });
}

// ============================================================================ HUD nameplate

export function hudCanvas(w, h) {
  w = Math.round(w); h = Math.round(h);
  const M = 6;
  return memo(`hud|${w}x${h}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const S = chamfer(w, h, 5);
    shadowUnder(P, M, w, h, S.in, 1, 4, 3, 0.8);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      let col;
      if (d === 0) col = INK;
      else if (d < 4) col = rampAt(BRASS, 0.58 + (d === 1 ? (y < h / 2 ? 0.35 : -0.25) : d === 3 ? (y < h / 2 ? -0.3 : 0.15) : 0) + (hash(x, y, 4) - 0.5) * 0.1 - y / h * 0.15, x, y);
      else if (d === 4) col = INK;
      else col = rampAt(PLATE, 0.36 + brush(x, y, 6) + (nzB(x, y) - 0.5) * 0.12 - y / h * 0.12 + (d < 7 && y < h / 2 ? -0.12 : 0), x, y);
      P.put(x + M, y + M, col);
    }
    for (const [x, y] of [[2, Math.round(h / 2)], [w - 3, Math.round(h / 2)]]) screw(P, x + M, y + M, x, 1.3, ramp('#3a2204', '#6a420c', '#c8962a', '#fde27a', '#fff6c8'));
    const R = rng(13);
    scratches(P, M, Math.round(w / 10), (x, y) => S.in(x, y) && S.d(x, y) > 5, R, WHITE, 0.14);
    return P.canvas();
  });
}

// ============================================================================ STICKY note (quest board paper)

export function noteCanvas(w, h, o = {}) {
  const c = paperCanvas(o.color ?? 'yellow', Math.round(w), Math.round(h), o.seed ?? 1);
  c._m = PAPER_M;
  return c;
}

// ============================================================================ RESEARCH: screen frame, slate, bench, sheet, pipes, signs

/** The research screen: steel frame all round, a header plate (head px tall), gauges + a pipe in `free` (x0, x1). */
export function treeFrameCanvas(w, h, head, free) {
  w = Math.round(w); h = Math.round(h); head = Math.round(head);
  const fx0 = Math.round(free?.[0] ?? 0), fx1 = Math.round(free?.[1] ?? 0);
  return memo(`tframe|${w}x${h}|${head}|${fx0}|${fx1}`, () => {
    noiseTex();
    const P = new Px(w, h);
    const fr = 7;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y);
      const inHead = y < head + fr;
      if (d >= fr && !inHead) {
        // inner shadow cast onto the screen (dithered)
        const dd = Math.min(x - fr, y - head - fr, w - 1 - fr - x, h - 1 - fr - y);
        const v = dq(Math.max(0, 1 - dd / 9) * 0.55, x, y, 8);
        if (v > 0) P.put(x, y, SHADOW, v);
        continue;
      }
      let v = 0.42 + (nzB(x, y) - 0.5) * 0.18 + brush(x, y, 7) - (inHead ? y / Math.max(1, head) * 0.12 : 0);
      let col;
      if (d === 0) col = INK;
      else if (d === 1) col = rampAt(PLATE, v + (y < h / 2 ? 0.42 : -0.2), x, y);
      else if (d === fr - 1 && !inHead) col = rampAt(PLATE, v - 0.28, x, y);
      else if (!inHead && d === fr - 2) col = rampAt(PLATE, v + 0.2, x, y);
      else col = rampAt(PLATE, v, x, y);
      P.put(x, y, col);
    }
    // the header's lower lip: hazard band + ink line onto the screen
    hazard(P, fr, head + 1, w - 2 * fr, fr - 2, 5, 12, 0.2);
    for (let x = fr; x < w - fr; x++) { P.put(x, head, INK); P.put(x, head + fr - 1, INK); }
    // rivets: frame + header
    for (let x = 14; x < w - 10; x += 34) { rivet(P, x, 3, 1.5); rivet(P, x, h - 4, 1.5); }
    for (let y = head + 20; y < h - 10; y += 34) { rivet(P, 3, y, 1.5); rivet(P, w - 4, y, 1.5); }
    // a copper pipe through the free header span with a valve + gauges on it
    if (fx1 - fx0 > 40) {
      const py = Math.round(head * 0.62), R2 = 3;
      for (let x = fx0; x <= fx1; x++) for (let j = -R2; j <= R2; j++) {
        const t = j / R2;
        const v = 0.35 + 0.6 * Math.sqrt(Math.max(0, 1 - t * t)) * (t < 0 ? 1 : 0.6) + (hash(x, j, 5) - 0.5) * 0.06;
        P.put(x, py + j, Math.abs(j) === R2 ? INK : rampAt(COPPER, v, x, py + j));
      }
      // flanges at both ends
      for (const xx of [fx0, fx1 - 3]) for (let i = 0; i < 4; i++) for (let j = -R2 - 2; j <= R2 + 2; j++) {
        const e = i === 0 || i === 3 || Math.abs(j) === R2 + 2;
        P.put(xx + i, py + j, e ? INK : rampAt(STEEL, 0.7 - (j + R2) * 0.06, xx + i, py + j));
      }
      const gauge = (cx, r, val) => {
        // stem down to the pipe
        for (let y = Math.round(head * 0.18 + r * 2); y < py - R2; y++) { P.put(cx - 1, y, STEEL[2]); P.put(cx, y, STEEL[4]); P.put(cx + 1, y, STEEL[1]); }
        const cy = Math.round(head * 0.18 + r);
        // brass bezel, cream dial, red zone, ticks, needle
        for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
          const d = Math.hypot(x, y);
          if (d > r + 0.6) continue;
          const X = cx + x, Y = cy + y;
          if (d > r - 0.4) P.put(X, Y, INK);
          else if (d > r - 2.4) P.put(X, Y, rampAt(BRASS, 0.55 + (-x - y) / (r * 2) * 0.5, X, Y));
          else {
            const a = Math.atan2(y, x);
            let c = cl('#f4ecd2');
            if (d > r - 4.6 && a > -0.4 && a < 0.7) c = cl('#e0484c');
            const ta = ((a + Math.PI * 2) % (Math.PI / 4));
            if (d > r - 4.2 && d < r - 2.4 && ta < 0.12 && !(a > 0.7 && a < 2.4)) c = INK;
            P.put(X, Y, c);
          }
        }
        // needle
        const na = -Math.PI * 0.95 + val * Math.PI * 1.4;
        for (let i = 0; i < r - 3; i++) P.put(Math.round(cx + Math.cos(na) * i), Math.round(cy + Math.sin(na) * i), cl('#1a1020'));
        P.put(cx, cy, cl('#e0484c')); P.put(cx + 1, cy, cl('#a02028'));
        // glass glint
        P.put(cx - Math.round(r * 0.5), cy - Math.round(r * 0.5), WHITE, 0.8); P.put(cx - Math.round(r * 0.5) + 1, cy - Math.round(r * 0.5), WHITE, 0.5);
      };
      const r = Math.max(6, Math.min(11, Math.round(head * 0.3)));
      const span = fx1 - fx0;
      if (span > 70) gauge(Math.round(fx0 + span * 0.3), r, 0.62);
      if (span > 150) gauge(Math.round(fx0 + span * 0.72), r - 1, 0.35);
      // valve hand-wheel (a square-spoked wheel) on the pipe
      const vx = Math.round(fx0 + span * (span > 150 ? 0.5 : 0.75));
      if (span > 54) {
        for (let y = py - R2 - 6; y < py - R2; y++) { P.put(vx, y, STEEL[3]); P.put(vx + 1, y, STEEL[1]); }
        const wy = py - R2 - 7;
        for (let i = -6; i <= 7; i++) { P.put(vx + i, wy, i === -6 || i === 7 ? INK : cl('#d02a30')); P.put(vx + i, wy + 1, i === -6 || i === 7 ? INK : cl('#901a20')); }
        for (let j = -4; j <= 4; j++) { P.put(vx, wy + j, cl('#d02a30')); P.put(vx + 1, wy + j, cl('#901a20')); }
      }
    }
    return P.canvas();
  });
}

/** The research view's background: a chalkboard slate (static, behind the panning sheet). */
export function slateCanvas(w, h) {
  w = Math.round(w); h = Math.round(h);
  return memo(`slate|${w}x${h}`, () => {
    noiseTex();
    const P = new Px(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sm = nzB((x * 0.6) | 0, (y * 0.9 + 50) | 0);
      let v = 0.42 + (nzF(x + 120, y) - 0.5) * 0.1 + (sm > 0.58 ? (sm - 0.58) * 1.2 : 0) + (hash(x, y, 9) - 0.5) * 0.06;
      const ex = Math.min(x, w - 1 - x) / 40, ey = Math.min(y, h - 1 - y) / 50;
      v -= (1 - Math.min(1, Math.min(ex, ey))) * 0.25;
      P.put(x, y, rampAt(SLATE, v, x, y));
    }
    // faint half-erased chalk scribbles (formula squiggles + arrows, no letters)
    const R = rng(77);
    for (let k = 0; k < Math.round((w * h) / 26000); k++) {
      let x = R() * w, y = R() * h;
      const len = 20 + R() * 50;
      for (let i = 0; i < len; i++) {
        x += 1; y += Math.sin(i * 0.5 + k) * 0.9;
        if (hash(x | 0, y | 0, 3) < 0.75) P.put(x, y, cl('#d8e4dc'), 0.12 + (nzB(x & 255, y & 255) * 0.08));
      }
    }
    return P.canvas();
  });
}

/** The blueprint sheet the research tree is drawn on, painted at half resolution (2 world px per texel). */
export function worldSheet(W, H) {
  const k = 0.5, w = Math.round(W * k), h = Math.round(H * k), M = 8;
  return memo(`sheet|${w}x${h}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const S = chamfer(w, h, 0);
    shadowUnder(P, M, w, h, S.in, 2, 4, 4, 0.8);
    paintBlueprint(P, M, M, w, h, { grid: 14, major: 4, seed: 3, title: true });
    for (let x = 0; x < w; x++) { P.put(x + M, M, cl('#5a84c8')); P.put(x + M, h - 1 + M, cl('#06143a')); }
    for (let y = 0; y < h; y++) { P.put(M, y + M, cl('#4a74b8')); P.put(w - 1 + M, y + M, cl('#06143a')); }
    const R0 = rng(41);
    coffeeRing(P, M + w * 0.78, M + h * 0.12, 18, (x, y) => x > M && y > M && x < M + w && y < M + h, 7, 0.3);
    coffeeRing(P, M + w * 0.12 + R0() * 10, M + h * 0.86, 15, (x, y) => x > M && y > M && x < M + w && y < M + h, 9, 0.24);
    tapeStrip(P, M - 6, M - 4, 34, 12, 4);
    tapeStrip(P, M + w - 28, M - 4, 34, 12, 5);
    tapeStrip(P, M - 6, M + h - 8, 34, 12, 6);
    tapeStrip(P, M + w - 28, M + h - 8, 34, 12, 7);
    const c = P.canvas();
    c._m = M;
    c._k = k;
    return c;
  });
}

/** The research tree's lab bench: walnut top edge, steel drawer front, hazard tape on the left. */
export function rbenchCanvas(w, h) {
  w = Math.round(w); h = Math.round(h);
  const M = 8;
  return memo(`rbench|${w}x${h}`, () => {
    noiseTex();
    const P = new Px(w + 2 * M, h + 2 * M);
    const top = 7;
    const S = chamfer(w, h, 3);
    shadowUnder(P, M, w, h, S.in, 1, 5, 4, 0.85);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      let col;
      if (y < top) {
        const g = y * 0.6 + nzG(x & 511, (y * 4) & 63) * 6 + Math.sin(x * 0.02) * 1.5;
        const ring = g - Math.floor(g);
        col = d === 0 ? INK : rampAt(WOOD, 0.62 + (y === 1 ? 0.25 : 0) - (ring < 0.18 ? 0.14 : 0) - y * 0.03, x, y);
        if (y === top - 1) col = INK;
      } else {
        const v = 0.42 + brush(x, y, 8) + (nzB(x, y) - 0.5) * 0.14 - (y - top) / h * 0.14;
        col = d === 0 ? INK : d === 1 ? rampAt(PLATE, v + (x < w / 2 ? 0.2 : -0.2), x, y) : y === top ? rampAt(PLATE, v + 0.3, x, y) : rampAt(PLATE, v, x, y);
      }
      P.put(x + M, y + M, col);
    }
    hazard(P, M + 3, M + top + 3, 5, h - top - 7, 2, 10, 0.2);
    for (let y = top + 3; y < h - 4; y++) P.put(M + 8, y + M, INK);
    for (const x of [14, w - 8]) { rivet(P, x + M, top + 6 + M, 1.6); rivet(P, x + M, h - 6 + M, 1.6); }
    const R = rng(55);
    scratches(P, M, Math.round(w / 8), (x, y) => S.in(x, y) && y > top + 2 && S.d(x, y) > 2, R, WHITE, 0.14);
    return P.canvas();
  });
}

/** Research node sheet: a steel clipboard (paper graph sheet) sized to the sheet. */
export const rsheetCanvas = (w, h) => clipCanvas(w, h, { seed: 9, ring: true });

/** Pipe tiles for the research pipes: steel pipe, flange + bolts every tile (h: 40 x 16, v: 16 x 40). */
export function pipeTile(dir = 'h') {
  return memo(`pipe|${dir}`, () => {
    noiseTex();
    const L = 40, T = 16;
    const P = new Px(dir === 'h' ? L : T, dir === 'h' ? T : L);
    for (let a = 0; a < L; a++) for (let b = 0; b < T; b++) {
      const t = (b - 7.5) / 7.5; // across the pipe -1..1
      const flange = a >= 30 && a < 36;
      let v = 0.3 + 0.62 * Math.sqrt(Math.max(0, 1 - t * t)) * (t < 0 ? 1 : 0.62) + (nzF(a * 3, b) - 0.5) * 0.12 + (hash(a, b, 4) - 0.5) * 0.05;
      if (flange) v += a === 30 ? 0.18 : a === 35 ? -0.22 : 0.06;
      let c = b === 0 || b === T - 1 ? INK : rampAt(STEEL, v, a, b);
      if (flange && (a === 30 || a === 35)) c = mixC(c, INK, 0.5);
      if (flange && (b === 3 || b === 12) && (a === 32 || a === 33)) c = a === 32 ? STEEL[6] : INK;
      if (!flange && hash(a, b, 21) < 0.02 && Math.abs(t) < 0.7) c = mixC(c, cl('#8a4a1a'), 0.6);
      if (dir === 'h') P.put(a, b, c); else P.put(b, a, c);
    }
    return P.url();
  });
}

/** 9-slice enamel sign plate (24 x 24, 8 px corners) in a colour. */
export function signURL(color) {
  return memo(`sign|${color}`, () => {
    const N = 24, P = new Px(N, N);
    const A = rampOf(color, 6);
    const S = chamfer(N, N, 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!S.in(x, y)) continue;
      const d = S.d(x, y);
      let col;
      if (d === 0) col = INK;
      else if (d === 1) col = rampAt(A, y < N / 2 ? 0.95 : 0.25, x, y);
      else if (d === 2) col = rampAt(A, y < N / 2 ? 0.75 : 0.42, x, y);
      else col = rampAt(A, 0.6 - (y / N) * 0.15 + (hash(x, y, 3) - 0.5) * 0.08, x, y);
      P.put(x, y, col);
    }
    for (const [x, y] of [[4, 4], [N - 5, 4], [4, N - 5], [N - 5, N - 5]]) { P.put(x, y, STEEL[5]); P.put(x + 1, y + 1, INK); P.put(x + 1, y, STEEL[2]); P.put(x, y + 1, STEEL[2]); }
    return P.url();
  });
}

/** Worn hazard-stripe tile (24 x 12, tiles horizontally) for dividers. */
export function hazardURL() {
  return memo('hz|tile', () => {
    noiseTex();
    const W = 24, H = 12, P = new Px(W, H);
    for (let x = 0; x < W; x++) { P.put(x, 0, INK); P.put(x, H - 1, INK); P.put(x, 1, STEEL[5]); P.put(x, H - 2, STEEL[1]); }
    hazard(P, 0, 2, W, H - 4, 0, 12, 0.18);
    return P.url();
  });
}

// ============================================================================ dress: paint the elements that ask for it

const PAINT = {
  wall: (w, h) => ({ c: wallCanvas(w, h), m: 0 }),
  bench: (w, h, o) => ({ c: benchCanvas(w, h, o.v === '1'), m: 0 }),
  drawer: (w, h, o) => ({ c: drawerCanvas(w, h, { on: o.on === '1', lock: o.lock === '1', seed: +o.s || 0, c: o.c }), m: 4 }),
  plate: (w, h, o) => ({ c: plateCanvas(w, h, { seed: +o.s || 0, hazard: o.hz === '1', accent: o.a, serial: o.sn === '1', tone: o.t, glow: o.g }), m: 8 }),
  socket: (w, h, o) => ({ c: socketCanvas(w, h, { color: o.c, lit: o.lit === '1', seed: +o.s || 0 }), m: 6 }),
  tier: (w, h, o) => ({ c: tierCanvas(w, h, { tier: +o.t || 1, on: o.on === '1' }), m: 4 }),
  case: (w, h, o) => ({ c: caseCanvas(w, h, { color: o.c, lock: o.lock === '1', sel: o.sel === '1', seed: +o.s || 0 }), m: 5, g: glassCanvas(w, h, { lock: o.lock === '1' }) }),
  clip: (w, h, o) => ({ c: clipCanvas(w, h, { seed: +o.s || 0, ring: o.r === '1', paper: o.p }), m: 8 }),
  blueprint: (w, h, o) => ({ c: blueprintCanvas(w, h, { seed: +o.s || 0, ring: o.r === '1' }), m: 8 }),
  tag: (w, h, o) => ({ c: tagCanvas(w, h, { got: o.got === '1', next: o.nx === '1', seed: +o.s || 0 }), m: 6 }),
  chalk: (w, h, o) => ({ c: chalkCanvas(w, h, { seed: +o.s || 0 }), m: 8 }),
  dymo: (w, h, o) => ({ c: dymoCanvas(w, h, { color: o.c }), m: 3 }),
  note: (w, h, o) => ({ c: noteCanvas(w, h, { color: o.c, seed: +o.s || 1 }), m: PAPER_M }),
  hud: (w, h) => ({ c: hudCanvas(w, h), m: 6 }),
  rbench: (w, h) => ({ c: rbenchCanvas(w, h), m: 8 }),
  rsheet: (w, h) => ({ c: rsheetCanvas(w, h), m: 8 }),
};
const parseO = (s) => Object.fromEntries(String(s ?? '').split(';').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return i < 0 ? [kv, '1'] : [kv.slice(0, i), kv.slice(i + 1)]; }));
const blit = (src, cls) => {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  c.className = cls;
  c.setAttribute('aria-hidden', 'true');
  return c;
};

/**
 * Paint every [data-lxp] element under root (or root itself) that has no painting at its current size.
 * The first few paint right away, the rest a frame at a time (cached paintings cost a blit).
 * Returns a cancel function.
 */
export function dress(root, { budget = 12 } = {}) {
  if (!root) return () => {};
  const els = [...(root.matches?.('[data-lxp]') ? [root] : []), ...root.querySelectorAll('[data-lxp]')];
  const jobs = [];
  for (const el of els) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w < 6 || h < 6 || !el.isConnected) continue;
    const key = `${el.dataset.lxp}|${el.dataset.lxo ?? ''}|${w}x${h}`;
    if (el._lxk === key && el.querySelector(':scope > canvas.lxp-b')) continue;
    jobs.push({ el, w, h, key });
  }
  let i = 0, dead = false;
  const step = () => {
    if (dead) return;
    const t0 = performance.now();
    while (i < jobs.length && (performance.now() - t0 < budget || i === 0)) {
      const { el, w, h, key } = jobs[i++];
      if (!el.isConnected || (el._lxk === key && el.querySelector(':scope > canvas.lxp-b'))) continue;
      const fn = PAINT[el.dataset.lxp];
      if (!fn) continue;
      let r;
      try { r = fn(w, h, parseO(el.dataset.lxo)); } catch (e) { console.warn('lab art', el.dataset.lxp, e); continue; }
      const m = r.c._m ?? r.m;
      el.querySelector(':scope > canvas.lxp-b')?.remove();
      el.querySelector(':scope > canvas.lxp-g')?.remove();
      const c = blit(r.c, 'lxp-b');
      c.style.cssText = `left:${-m}px;top:${-m}px;width:${r.c.width}px;height:${r.c.height}px`;
      el.prepend(c);
      if (r.g) {
        const g = blit(r.g, 'lxp-g');
        g.style.cssText = `left:0;top:0;width:${r.g.width}px;height:${r.g.height}px`;
        el.appendChild(g);
      }
      el._lxk = key;
      el.classList.add('lxp-on');
      // painted styles can change the box (padding, borders): paint again at the new size
      const w2 = el.offsetWidth, h2 = el.offsetHeight;
      if ((w2 !== w || h2 !== h) && w2 >= 6 && h2 >= 6 && !el._lxRe) {
        el._lxRe = true;
        jobs.push({ el, w: w2, h: h2, key: `${el.dataset.lxp}|${el.dataset.lxo ?? ''}|${w2}x${h2}` });
      } else el._lxRe = false;
    }
    if (i < jobs.length) requestAnimationFrame(step);
  };
  step();
  return () => { dead = true; };
}
