// Expressive pixel-art faces drawn onto a small canvas and used as a texture on
// the front of chibi heads.
//
// The face is fully parametric: eyes are drawn per pixel from a small state
// (openness, eyelid tilt, lower-lid squint, pupil look offset, pupil size), so
// blinks, squints and glances are smooth, and the same eye can be angry, sad,
// sleepy or shocked. Brows, cheeks, mouths (with teeth, tongue and talk
// visemes) and overlays (blush, sweat, tears, anger vein, gloom lines, sparkles)
// are layered on top. The canvas is only redrawn when something visible changes.
import * as THREE from 'three';
import { hexToCss, rand, shade } from './util.js';

export const FACE_RES = 40; // canvas pixels across the head front (2 px per hi-res head voxel)
const S = FACE_RES;
const INK = '#1b1530';
const WHITE = '#ffffff';
const MOUTH_IN = '#5a1424';
const RED = '#c8324a';
const TONGUE = '#ff7a8a';
const TEETH = '#fbf6ee';
const TEAR = '#6cc7ff';
const TEAR_HI = '#d8f4ff';

// eye centres and radii (canvas px)
const EYE_X = [12, 28];
const EYE_Y = 17;
const ERX = 3.7, ERY = 4.6;
const MOUTH_X = 20, MOUTH_Y = 29;

// ---------------------------------------------------------------------------
// tiny raster helpers

function P(ctx, x, y, c, w = 1, h = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
const inEll = (x, y, cx, cy, rx, ry) => {
  const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
};
function ell(ctx, cx, cy, rx, ry, c) {
  ctx.fillStyle = c;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (inEll(x, y, cx, cy, rx, ry)) ctx.fillRect(x, y, 1, 1);
}
function line(ctx, x0, y0, x1, y1, c, th = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  ctx.fillStyle = c;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t - (th - 1) / 2), Math.round(y0 + (y1 - y0) * t - (th - 1) / 2), th, th);
  }
}
/** Thick arc: points along an ellipse from angle a0 to a1 (radians, y down). */
function arc(ctx, cx, cy, rx, ry, a0, a1, c, th = 2) {
  const n = Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * 1.6) + 2;
  ctx.fillStyle = c;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    ctx.fillRect(Math.round(cx + Math.cos(a) * rx - th / 2), Math.round(cy + Math.sin(a) * ry - th / 2), th, th);
  }
}

// ---------------------------------------------------------------------------
// Eyes

/**
 * Parametric open eye. st: { open 0..1.2, tilt (+ angry, - sad), low 0..1 lower-lid squint,
 * lx, ly look offset, pupil (scale), iris, shine, wet }.
 */
function drawEye(ctx, cx, cy, side, st, iris) {
  const open = st.open ?? 1;
  if (open <= 0.08) {
    // closed: soft downward curve
    arc(ctx, cx, cy + 0.5, ERX, 1.6, Math.PI * 0.08, Math.PI * 0.92, INK, 1.5);
    return;
  }
  const big = open > 1 ? open : 1;
  const rx = ERX * (big > 1 ? 1 + (big - 1) * 0.6 : 1), ry = ERY * big;
  const top0 = cy - ry + (1 - Math.min(1, open)) * ry * 1.75;
  const bot = cy + ry - (st.low ?? 0) * ry * 1.05;
  const tilt = st.tilt ?? 0;
  const pupil = st.pupil ?? 1;
  const lx = (st.lx ?? 0), ly = (st.ly ?? 0);
  const icx = cx + lx * 1.4, icy = cy + 0.6 + ly * 1.2;
  const irx = 2.75 * pupil ** 0.4 * (big > 1 ? 0.85 : 1), iry = 3.4 * pupil ** 0.4 * (big > 1 ? 0.85 : 1);
  const prx = 1.35 * pupil, pry = 1.9 * pupil;
  const irisDark = shade(iris, -0.35), irisLight = shade(iris, 0.3);
  const irisC = hexToCss(iris), irisD = hexToCss(irisDark), irisL = hexToCss(irisLight);
  const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(cy - ry - 2), y1 = Math.ceil(cy + ry + 1);
  for (let x = x0; x <= x1; x++) {
    // inner corner (towards the nose) is +x for the left eye
    const inner = ((x + 0.5 - cx) / rx) * (side < 0 ? 1 : -1);
    const lid = top0 + tilt * inner * 2.2;
    for (let y = y0; y <= y1; y++) {
      if (!inEll(x, y, cx, cy, rx, ry)) continue;
      if (y + 0.5 < lid) continue;
      if (y + 0.5 > bot + 0.6) continue;
      let c;
      if (y + 0.5 < lid + 1.6) c = INK; // lash line
      else if (y + 0.5 > bot - 0.4 && (st.low ?? 0) > 0.05) c = INK;
      else if (inEll(x, y, icx, icy, prx, pry)) c = INK;
      else if (inEll(x, y, icx, icy, irx, iry)) c = y + 0.5 < icy - 0.8 ? irisD : y + 0.5 > icy + 1.4 ? irisL : irisC;
      else c = WHITE;
      P(ctx, x, y, c);
    }
  }
  // outer lash flick
  const ox = side < 0 ? Math.floor(cx - rx) - 1 : Math.ceil(cx + rx);
  const oy = top0 + tilt * -2.2 + 0.4;
  if (open > 0.45 && oy < bot - 1) P(ctx, ox, oy, INK);
  // highlights (only where the eye is visible)
  if (open > 0.3) {
    const hx = icx - 1.6, hy = icy - 2.2;
    const lidAt = (x) => top0 + tilt * (((x + 0.5 - cx) / rx) * (side < 0 ? 1 : -1)) * 2.2 + 1.6;
    if (hy > lidAt(hx) - 0.5 && hy < bot) P(ctx, hx, hy, WHITE, 2, 2);
    if (icy + 1.6 < bot && pupil >= 0.7) P(ctx, icx + 1, icy + 1.4, WHITE);
    if (st.shine) { P(ctx, icx + 0.6, icy - 2.4, WHITE); P(ctx, icx - 2, icy + 1, 'rgba(255,255,255,0.8)'); }
  }
  // watery lower lid
  if (st.wet) for (let x = Math.floor(cx - rx + 1); x <= Math.ceil(cx + rx - 1); x++) P(ctx, x, Math.round(bot), TEAR);
}

// eye state presets ({ open, tilt, low, pupil, lx, ly, shine, wet })
const EYE_STATE = {
  normal: {},
  angry: { open: 0.82, tilt: 0.55 },
  sad: { open: 0.92, tilt: -0.45, wet: true },
  determined: { open: 0.72, tilt: 0.3, low: 0.18 },
  sleepy: { open: 0.38 },
  side: { open: 0.72, lx: 1.4, low: 0.1 },
  sideL: { open: 0.72, lx: -1.4, low: 0.1 },
  lookL: { lx: -1.5 },
  lookR: { lx: 1.5 },
  up: { ly: -1.3, open: 1.05 },
  down: { ly: 1.2, open: 0.7 },
  shock: { open: 1.18, pupil: 0.45 },
  wide: { open: 1.1, pupil: 1.25, shine: true },
  sparkle: { open: 1.05, pupil: 1.2, shine: true },
  worried: { open: 0.95, tilt: -0.5, pupil: 0.75 },
  teary: { open: 1.05, tilt: -0.35, pupil: 1.2, shine: true, wet: true },
  smug: { open: 0.5, low: 0.15, lx: 0.9, tilt: 0.1 },
  focus: { open: 0.66, tilt: 0.42, pupil: 0.7 },
  tired: { open: 0.48, tilt: -0.15, ly: 0.4 },
  think: { lx: -1.2, ly: -1.3, open: 0.92 },
  blank: { open: 1.1, pupil: 0 },
};

/** Special (non-parametric) eye painters, (cx, cy) = eye centre. */
const SPECIAL = {
  happy(ctx, cx, cy) {
    arc(ctx, cx, cy + 2, ERX - 0.4, 3.2, Math.PI * 1.08, Math.PI * 1.92, INK, 2);
  },
  closed(ctx, cx, cy) {
    arc(ctx, cx, cy, ERX - 0.3, 1.8, Math.PI * 0.1, Math.PI * 0.9, INK, 2);
  },
  squint(ctx, cx, cy, side) {
    // >  <
    const d = side < 0 ? 1 : -1;
    line(ctx, cx - d * 3, cy - 3, cx + d * 2, cy, INK, 2);
    line(ctx, cx + d * 2, cy, cx - d * 3, cy + 3, INK, 2);
  },
  cry(ctx, cx, cy, side) {
    SPECIAL.squint(ctx, cx, cy, side);
  },
  dizzy(ctx, cx, cy, side, iris, t) {
    // spiral
    const n = 26;
    ctx.fillStyle = INK;
    const r0 = t * 4;
    for (let i = 0; i < n; i++) {
      const a = i * 0.55 + r0 * (side < 0 ? 1 : -1);
      const r = 0.4 + i * 0.15;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r * 1.15 - 0.5), 1, 1);
    }
  },
  x(ctx, cx, cy) {
    line(ctx, cx - 3, cy - 3, cx + 2, cy + 2, INK, 2);
    line(ctx, cx + 2, cy - 3, cx - 3, cy + 2, INK, 2);
  },
  star(ctx, cx, cy) {
    const c = '#ffd23f', o = '#c47a10';
    // 5-point star, ~9px
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 2.1 : 5;
      pts.push([cx + Math.cos(a) * r, cy + 0.5 + Math.sin(a) * r]);
    }
    for (let y = Math.floor(cy - 6); y <= cy + 6; y++)
      for (let x = Math.floor(cx - 6); x <= cx + 6; x++) {
        if (!inPoly(x + 0.5, y + 0.5, pts)) continue;
        const edge = !inPoly(x + 1.5, y + 0.5, pts) || !inPoly(x - 0.5, y + 0.5, pts) || !inPoly(x + 0.5, y + 1.5, pts) || !inPoly(x + 0.5, y - 0.5, pts);
        P(ctx, x, y, edge ? o : c);
      }
    P(ctx, cx - 1, cy - 1, WHITE, 2, 2);
  },
  heart(ctx, cx, cy) {
    const c = '#ff3d7f', o = '#a8124a';
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        const fx = (x + 0.5) / 4.6, fy = -(y + 0.5) / 4.6 + 0.2;
        const v = (fx * fx + fy * fy - 1) ** 3 - fx * fx * fy * fy * fy;
        if (v > 0) continue;
        P(ctx, cx + x, cy + y, v > -0.06 ? o : c);
      }
    P(ctx, cx - 3, cy - 3, WHITE, 2, 1); P(ctx, cx - 3, cy - 2, WHITE);
  },
  money(ctx, cx, cy) {
    const g = '#2fbf4f', d = '#147a2c';
    // $ glyph 7x11
    const art = ['..#..', '.####', '#.#..', '#.#..', '.###.', '..#.#', '..#.#', '####.', '..#..'];
    for (let r = 0; r < art.length; r++) for (let q = 0; q < 5; q++) if (art[r][q] === '#') { P(ctx, cx - 3 + q, cy - 4 + r, d); P(ctx, cx - 3 + q, cy - 5 + r, g); }
  },
  fire(ctx, cx, cy, side, iris, t) {
    const f = Math.floor(t * 10) % 2;
    ell(ctx, cx, cy + 1, 3.6, 3.6, '#ff6a1f');
    ell(ctx, cx, cy - 1 - f, 2.4, 3.4, '#ff9a2a');
    ell(ctx, cx, cy + 1, 1.8, 2, '#ffe27a');
    P(ctx, cx + (f ? -1 : 1), cy - 5, '#ff9a2a');
    line(ctx, cx - 4, cy - 5 + (side < 0 ? 0 : 2), cx + 3, cy - 5 + (side < 0 ? 2 : 0), INK, 2);
  },
};
SPECIAL.wink = null; // handled per side
SPECIAL.laugh = SPECIAL.squint;

function inPoly(x, y, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// Brows: { a: angle (+ angry: inner end down), r: raise px, hide }
const BROWS = {
  normal: { a: 0, r: 0 }, happy: { a: -0.15, r: 1 }, closed: { a: 0, r: 0 }, shock: { a: -0.2, r: 3 },
  angry: { a: 0.9, r: -1 }, sad: { a: -0.8, r: 1 }, determined: { a: 0.55, r: -1 }, dizzy: { a: -0.4, r: 1 },
  star: { a: -0.2, r: 2 }, money: { a: 0, r: 2 }, heart: { a: -0.3, r: 2 }, wink: { a: 0, r: 0, wink: true },
  sleepy: { a: -0.2, r: -1 }, side: { a: 0.2, r: -1, quirk: true }, sideL: { a: 0.2, r: -1, quirk: true },
  lookL: { a: 0, r: 0 }, lookR: { a: 0, r: 0 }, up: { a: -0.2, r: 2 }, down: { a: 0.1, r: -1 },
  wide: { a: -0.3, r: 2 }, sparkle: { a: -0.3, r: 2 }, worried: { a: -0.9, r: 1 }, teary: { a: -0.8, r: 1 },
  smug: { a: 0.2, r: 0, quirk: true }, focus: { a: 0.6, r: -1 }, tired: { a: -0.3, r: -1 }, think: { a: 0.2, r: 1, quirk: true },
  blank: { a: 0, r: 3 }, squint: { a: 0.5, r: -1 }, cry: { a: -0.9, r: 1 }, x: { a: -0.2, r: 1 }, fire: { hide: true },
  laugh: { a: -0.3, r: 1 },
};

function drawBrow(ctx, cx, side, b, col) {
  if (b.hide) return;
  const inner = side < 0 ? 1 : -1; // direction towards the nose
  const y = EYE_Y - ERY - 3.2 - (b.r ?? 0);
  let a = b.a ?? 0;
  let r = 0;
  if (b.quirk && side > 0) { a = -0.4; r = 1.5; }
  const xi = cx + inner * 3.2, xo = cx - inner * 3.4;
  const yi = y - r + a * 1.8, yo = y - r - a * 0.4 + 0.4;
  line(ctx, xo, yo, xi, yi, col, 2);
  // soft taper on the outer end
  P(ctx, xo - inner, yo + 1, col);
}

// ---------------------------------------------------------------------------
// Mouths at (cx, cy) = centre

/** Filled open mouth: shape 'D' (flat top), 'U' (flat bottom), 'O' oval. */
function mouthHole(ctx, cx, cy, rx, ry, o = {}) {
  const shape = o.shape ?? 'O';
  const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1), y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
  const inside = (x, y) => {
    if (shape === 'D') return y + 0.5 >= cy - ry * 0.35 && inEll(x, y, cx, cy - ry * 0.35, rx, ry * 1.35);
    if (shape === 'U') return y + 0.5 <= cy + ry * 0.35 && inEll(x, y, cx, cy + ry * 0.35, rx, ry * 1.35);
    return inEll(x, y, cx, cy, rx, ry);
  };
  let top = Infinity, bottom = -Infinity;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      let c = MOUTH_IN;
      if (edge) c = INK;
      else if (o.teeth && y <= top + o.teeth) c = TEETH;
      else if (o.lowTeeth && y >= bottom - o.lowTeeth) c = TEETH;
      else if (o.tongue && y >= bottom - o.tongue && Math.abs(x + 0.5 - cx - (o.tx ?? 0)) < rx * 0.62) c = TONGUE;
      P(ctx, x, y, c);
    }
}

const MOUTHS = {
  smile(ctx, cx, cy) { arc(ctx, cx, cy - 2.5, 4.2, 3.5, Math.PI * 0.18, Math.PI * 0.82, INK, 1.5); },
  smileSmall(ctx, cx, cy) { arc(ctx, cx, cy - 1.5, 2.6, 2.2, Math.PI * 0.18, Math.PI * 0.82, INK, 1.5); },
  grin(ctx, cx, cy) { mouthHole(ctx, cx, cy, 5, 3.4, { shape: 'D', teeth: 1, tongue: 1 }); },
  beam(ctx, cx, cy) { mouthHole(ctx, cx, cy, 6.2, 4.2, { shape: 'D', teeth: 1, tongue: 2 }); },
  laugh(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 5.4, 4.6, { shape: 'D', teeth: 1, tongue: 2 }); },
  open(ctx, cx, cy) { mouthHole(ctx, cx, cy, 3.2, 3, { tongue: 1 }); },
  shout(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 5.4, 4.6, { shape: 'O', teeth: 1, tongue: 2 }); },
  scream(ctx, cx, cy) { mouthHole(ctx, cx, cy + 1, 4.2, 5.4, { teeth: 1, lowTeeth: 1, tongue: 2 }); },
  gasp(ctx, cx, cy) { mouthHole(ctx, cx, cy, 2.2, 3, {}); },
  o(ctx, cx, cy) { mouthHole(ctx, cx, cy, 1.8, 1.8, {}); },
  frown(ctx, cx, cy) { arc(ctx, cx, cy + 3, 4.2, 3.2, Math.PI * 1.18, Math.PI * 1.82, INK, 1.5); },
  sad(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 4.2, 3, { shape: 'U', tongue: 1 }); },
  flat(ctx, cx, cy) { P(ctx, cx - 3, cy, INK, 6, 1); P(ctx, cx - 3, cy + 1, 'rgba(27,21,48,0.35)', 6, 1); },
  smirk(ctx, cx, cy) { line(ctx, cx - 3, cy + 1, cx + 1, cy + 1, INK, 1); arc(ctx, cx + 1, cy - 1, 2.6, 2, Math.PI * 0.05, Math.PI * 0.55, INK, 1); P(ctx, cx + 3, cy - 2, INK); },
  tongue(ctx, cx, cy) { MOUTHS.smile(ctx, cx, cy); ell(ctx, cx + 1, cy + 2.2, 1.7, 2, TONGUE); P(ctx, cx + 1, cy + 2, '#e05068'); },
  wobble(ctx, cx, cy) {
    ctx.fillStyle = INK;
    for (let x = -5; x <= 4; x++) ctx.fillRect(cx + x, Math.round(cy + Math.sin(x * 1.6) * 0.9), 1, 1);
  },
  teeth(ctx, cx, cy) {
    P(ctx, cx - 5, cy - 2, INK, 10, 5);
    P(ctx, cx - 4, cy - 1, TEETH, 8, 3);
    for (let x = -3; x <= 3; x += 2) P(ctx, cx + x, cy - 1, '#c8c0b8', 1, 3);
    P(ctx, cx - 4, cy, '#c8c0b8', 8, 1);
  },
  grimace(ctx, cx, cy) {
    // wide crooked clenched teeth
    for (let x = -6; x <= 5; x++) { const o = Math.round(Math.sin((x + 6) * 0.9) * 0.6); P(ctx, cx + x, cy - 2 + o, INK, 1, 5); }
    for (let x = -5; x <= 4; x++) { const o = Math.round(Math.sin((x + 6) * 0.9) * 0.6); P(ctx, cx + x, cy - 1 + o, TEETH, 1, 3); }
    for (let x = -4; x <= 3; x += 2) P(ctx, cx + x, cy - 1, '#c8c0b8', 1, 3);
  },
  cat(ctx, cx, cy) {
    arc(ctx, cx - 2, cy - 1, 2, 2, Math.PI * 0.1, Math.PI * 0.9, INK, 1);
    arc(ctx, cx + 2, cy - 1, 2, 2, Math.PI * 0.1, Math.PI * 0.9, INK, 1);
  },
  chew(ctx, cx, cy, t) {
    const o = Math.floor(t * 8) % 2;
    P(ctx, cx - 3, cy - o, INK, 6, 2 + o);
    P(ctx, cx - 2, cy - o, '#6e3e26', 4, 1);
    ell(ctx, cx - 6, cy - 1, 1.6, 1.8, 'rgba(255,150,150,0.0)');
  },
  pout(ctx, cx, cy) { arc(ctx, cx, cy + 2, 2.4, 2, Math.PI * 1.15, Math.PI * 1.85, INK, 1.5); P(ctx, cx - 1, cy + 1, '#e88a9a', 2, 1); },
  whistle(ctx, cx, cy) { ell(ctx, cx + 2, cy, 1.6, 1.6, INK); P(ctx, cx + 2, cy, MOUTH_IN); },
  kiss(ctx, cx, cy) {
    // "3"
    arc(ctx, cx, cy - 1.2, 1.4, 1.2, -Math.PI * 0.5, Math.PI * 0.5, INK, 1);
    arc(ctx, cx, cy + 1.2, 1.4, 1.2, -Math.PI * 0.5, Math.PI * 0.5, INK, 1);
  },
  drool(ctx, cx, cy) { MOUTHS.open(ctx, cx, cy); P(ctx, cx + 2, cy + 3, TEAR, 1, 3); P(ctx, cx + 2, cy + 6, TEAR_HI); },
  bite(ctx, cx, cy) { MOUTHS.smile(ctx, cx, cy); P(ctx, cx - 2, cy - 1, TEETH, 4, 1); },
  yawn(ctx, cx, cy) { mouthHole(ctx, cx, cy + 1, 3.6, 5, { tongue: 2 }); },
  mmm(ctx, cx, cy) { arc(ctx, cx, cy - 1.5, 3, 2, Math.PI * 0.12, Math.PI * 0.88, INK, 1.5); P(ctx, cx - 4, cy - 1, INK); P(ctx, cx + 3, cy - 1, INK); },
  // talk visemes
  vA(ctx, cx, cy) { mouthHole(ctx, cx, cy, 3.4, 3.2, { shape: 'D', teeth: 1, tongue: 1 }); },
  vE(ctx, cx, cy) { mouthHole(ctx, cx, cy, 4.6, 2.2, { shape: 'D', teeth: 1 }); },
  vO(ctx, cx, cy) { mouthHole(ctx, cx, cy, 2.4, 3, { tongue: 1 }); },
  vU(ctx, cx, cy) { mouthHole(ctx, cx, cy, 1.6, 1.8, {}); },
  vM(ctx, cx, cy) { P(ctx, cx - 2, cy, INK, 4, 1); },
  vBig(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 5, 4.4, { shape: 'D', teeth: 1, tongue: 2 }); },
};

// ---------------------------------------------------------------------------
// Overlays

const FX = {
  blush(ctx) {
    for (const cx of [7.5, 32.5]) {
      ell(ctx, cx, 24.5, 3.6, 1.8, 'rgba(255,90,130,0.55)');
      for (let i = 0; i < 3; i++) line(ctx, cx - 2 + i * 1.8, 25, cx - 1 + i * 1.8, 23.6, 'rgba(230,50,100,0.7)', 1);
    }
  },
  sweat(ctx, t) {
    const y = 4 + ((t * 6) % 4);
    ell(ctx, 34.5, y + 3.5, 2.2, 2.6, TEAR);
    P(ctx, 34, y, TEAR, 1, 2);
    P(ctx, 33, y + 2, TEAR_HI, 1, 2);
  },
  tears(ctx, t) {
    const f = Math.floor(t * 8) % 3;
    for (const cx of EYE_X) {
      for (let y = 21; y < 38; y++) {
        const w = 2 + (y > 30 ? 1 : 0);
        P(ctx, cx - 1 + Math.round(Math.sin(y * 0.6) * 0.5), y, (y + f) % 3 === 0 ? TEAR_HI : TEAR, w, 1);
      }
    }
  },
  tear(ctx) {
    ell(ctx, EYE_X[0] - 3, 23.5, 1.2, 1.7, TEAR);
    P(ctx, EYE_X[0] - 4, 22, TEAR_HI);
  },
  vein(ctx) {
    const c = '#ff2e4a';
    const x = 6, y = 3;
    for (const [dx, dy, ax, ay] of [[0, 0, 1, 0], [5, 0, 0, 1], [5, 5, -1, 0], [0, 5, 0, -1]]) {
      // little arcs at each corner of the cross-vein
      P(ctx, x + dx, y + dy, c, ax ? 2 : 1, ay ? 2 : 1);
    }
    line(ctx, x + 1, y + 1, x + 2, y + 2, c, 1); line(ctx, x + 4, y + 1, x + 3, y + 2, c, 1);
    line(ctx, x + 1, y + 4, x + 2, y + 3, c, 1); line(ctx, x + 4, y + 4, x + 3, y + 3, c, 1);
  },
  gloom(ctx) {
    for (let x = 8; x <= 31; x += 3) P(ctx, x, 1, 'rgba(70,40,140,0.55)', 1, 6 + ((x * 7) % 4));
  },
  shine(ctx, t) {
    const f = Math.floor(t * 5) % 2;
    for (const [x, y] of [[4, 10], [35, 12]]) {
      P(ctx, x, y - 1 - f, '#ffffff'); P(ctx, x - 1 - f, y, '#ffffff'); P(ctx, x, y, '#fff6b0'); P(ctx, x + 1 + f, y, '#ffffff'); P(ctx, x, y + 1 + f, '#ffffff');
    }
  },
  shock(ctx) {
    for (const [x0, y0, x1, y1] of [[2, 3, 4, 7], [37, 3, 35, 7], [1, 10, 4, 11], [38, 10, 35, 11]]) line(ctx, x0, y0, x1, y1, INK, 1);
  },
  bags(ctx) {
    for (const cx of EYE_X) arc(ctx, cx, EYE_Y + 3.5, 3.2, 1.6, Math.PI * 0.15, Math.PI * 0.85, 'rgba(110,70,120,0.5)', 1);
  },
  stars(ctx) { /* 3D emote handles it */ },
};
const ANIMATED_FX = new Set(['sweat', 'tears', 'shine']);

// default overlays implied by an eye style
const EYE_FX = { sad: ['tear'], cry: ['tears'], teary: [], shock: ['shock'], tired: ['bags'], heart: ['blush'] };

export const EYE_TYPES = [...Object.keys(EYE_STATE), ...Object.keys(SPECIAL).filter((k) => SPECIAL[k]), 'wink'];
export const MOUTH_TYPES = Object.keys(MOUTHS).filter((k) => k[0] !== 'v' || k.length > 3);
export const FACE_FX = Object.keys(FX);

// talk viseme pools by base mouth mood
const VIS = {
  happy: ['vA', 'vE', 'vO', 'vA', 'vM', 'vE'],
  loud: ['vBig', 'vA', 'vBig', 'vO', 'vE'],
  sad: ['vU', 'vO', 'vM', 'vU', 'vA'],
  neutral: ['vA', 'vO', 'vM', 'vE', 'vU', 'vA'],
};
const LOUD = new Set(['shout', 'scream', 'grin', 'beam', 'laugh']);
const SADM = new Set(['frown', 'wobble', 'sad', 'pout', 'grimace']);
const HAPPYM = new Set(['smile', 'smileSmall', 'tongue', 'cat', 'smirk', 'mmm']);

// ---------------------------------------------------------------------------

export class PixelFace {
  constructor(opts = {}) {
    this.iris = opts.eyeColor ?? 0x2a2a4a;
    this.brow = hexToCss(opts.browColor ?? 0x3a2a20);
    this.blush = opts.blush ?? true;
    this.lashes = opts.lashes ?? false;
    this.freckles = opts.freckles ?? false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = S;
    this.canvas.height = S;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.eyes = 'normal';
    this.mouth = 'smile';
    this.baseEyes = 'normal';
    this.baseMouth = 'smile';
    this.blinkT = rand(1.5, 4);
    this.blinking = 0;
    this.talking = false;
    this.talkT = 0;
    this.viseme = null;
    this.holdT = 0;
    this.t = 0;
    // pupils: current + target look offsets, saccade timer
    this.lx = 0; this.ly = 0; this.tlx = 0; this.tly = 0;
    this.lookHold = 0;
    this.sacT = rand(1.2, 3);
    this.autoLook = true;
    // overlays: name -> seconds left (Infinity = until cleared)
    this.fxOn = new Map();
    this.fxBase = new Set();
    this.animFrame = -1;
    this.dirty = true;
    this._sig = '';
    this.redraw();
  }

  /** Set expression. hold>0 returns to base after hold seconds. */
  set(eyes, mouth, hold = 0) {
    if (hold > 0) {
      this.holdT = hold;
    } else {
      this.baseEyes = eyes ?? this.baseEyes;
      this.baseMouth = mouth ?? this.baseMouth;
      this.holdT = 0;
    }
    if (eyes) this.eyes = eyes;
    if (mouth) this.mouth = mouth;
    this.dirty = true;
  }
  talk(on) {
    this.talking = on;
    this.talkT = 0;
    this.viseme = null;
    this.dirty = true;
  }
  /** Turn an overlay on for `dur` seconds (0 = until fx(name, false)), or off. */
  fx(name, on = true, dur = 0) {
    if (!FX[name]) return this;
    if (on === false) this.fxOn.delete(name);
    else this.fxOn.set(name, dur > 0 ? dur : Infinity);
    this.dirty = true;
    return this;
  }
  clearFx() {
    if (this.fxOn.size) { this.fxOn.clear(); this.dirty = true; }
    return this;
  }
  /** Point the pupils (-1.5..1.5). hold>0 keeps it for that long, then saccades resume. */
  look(x, y = 0, hold = 1.5) {
    this.tlx = x; this.tly = y;
    this.lookHold = hold;
    return this;
  }
  blink() {
    this.blinking = 0.14;
    this.dirty = true;
  }

  update(dt) {
    this.t += dt;
    if (this.holdT > 0) {
      this.holdT -= dt;
      if (this.holdT <= 0) {
        this.eyes = this.baseEyes;
        this.mouth = this.baseMouth;
        this.dirty = true;
      }
    }
    // overlays timing
    for (const [k, v] of this.fxOn) {
      if (v === Infinity) continue;
      const nv = v - dt;
      if (nv <= 0) { this.fxOn.delete(k); this.dirty = true; } else this.fxOn.set(k, nv);
    }
    // blinking (with an occasional double blink)
    this.blinkT -= dt;
    if (this.blinkT <= 0 && this.blinking <= 0) {
      this.blinking = 0.14;
      this.blinkT = Math.random() < 0.18 ? 0.22 : rand(2, 5);
      this.dirty = true;
    }
    if (this.blinking > 0) {
      const f0 = this._blinkFrame;
      this.blinking -= dt;
      const f = this.blinking <= 0 ? -1 : this.blinking > 0.1 || this.blinking < 0.04 ? 1 : 2;
      if (f !== f0) { this._blinkFrame = f; this.dirty = true; }
    }
    // pupil saccades
    if (this.lookHold > 0) this.lookHold -= dt;
    else if (this.autoLook) {
      this.sacT -= dt;
      if (this.sacT <= 0) {
        this.sacT = rand(0.9, 3.2);
        const r = Math.random();
        if (r < 0.45) { this.tlx = 0; this.tly = 0; } else { this.tlx = rand(-1.3, 1.3); this.tly = rand(-0.8, 0.7); }
      }
    }
    // pupils jump in pixel steps, so only redraw when the rounded position changes
    const k = 1 - Math.exp(-18 * dt);
    this.lx += (this.tlx - this.lx) * k;
    this.ly += (this.tly - this.ly) * k;
    const qx = Math.round(this.lx * 2) / 2, qy = Math.round(this.ly * 2) / 2;
    if (qx !== this._qx || qy !== this._qy) { this._qx = qx; this._qy = qy; this.dirty = true; }
    if (this.talking) {
      this.talkT -= dt;
      if (this.talkT <= 0) {
        this.talkT = rand(0.07, 0.14);
        const m = this.mouth;
        const pool = LOUD.has(m) ? VIS.loud : SADM.has(m) ? VIS.sad : HAPPYM.has(m) ? VIS.happy : VIS.neutral;
        let v = pool[Math.floor(Math.random() * pool.length)];
        if (v === this.viseme) v = pool[(pool.indexOf(v) + 1) % pool.length];
        this.viseme = v;
        this.dirty = true;
      }
    }
    // animated painters / overlays tick at ~10 fps
    if (this.isAnimated()) {
      const fr = Math.floor(this.t * 10);
      if (fr !== this.animFrame) { this.animFrame = fr; this.dirty = true; }
    }
    if (this.dirty) this.redraw();
  }

  isAnimated() {
    if (this.eyes === 'dizzy' || this.eyes === 'fire' || this.mouth === 'chew') return true;
    for (const k of this.fxOn.keys()) if (ANIMATED_FX.has(k)) return true;
    const def = EYE_FX[this.eyes];
    return !!def && def.some((k) => ANIMATED_FX.has(k));
  }

  redraw() {
    this.dirty = false;
    const ctx = this.ctx;
    const t = this.t;
    ctx.clearRect(0, 0, S, S);
    const iris = this.iris;
    let eyes = this.eyes;
    const blinkFrame = this.blinking > 0 ? (this.blinking > 0.1 || this.blinking < 0.04 ? 1 : 2) : 0;
    // cheeks under everything
    if (this.blush) {
      ctx.fillStyle = 'rgba(255,110,140,0.38)';
      for (const cx of [7.5, 32.5]) ell(ctx, cx, 24.5, 3.2, 1.5, 'rgba(255,110,140,0.38)');
    }
    if (this.freckles) for (const [x, y] of [[6, 22], [8, 23], [10, 22], [30, 22], [32, 23], [34, 22]]) P(ctx, x, y, 'rgba(150,80,50,0.55)');
    // brows
    const brow = BROWS[eyes] ?? BROWS.normal;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      drawBrow(ctx, EYE_X[i], side, brow.wink && side > 0 ? { a: -0.1, r: -1 } : brow, this.brow);
    }
    // eyes
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const cx = EYE_X[i], cy = EYE_Y;
      let e = eyes;
      if (e === 'wink') e = side < 0 ? 'normal' : 'happy';
      const sp = SPECIAL[e];
      if (sp) { sp(ctx, cx, cy, side, iris, t); continue; }
      const base = EYE_STATE[e] ?? EYE_STATE.normal;
      const st = this._st ?? (this._st = {});
      st.open = base.open ?? 1; st.tilt = base.tilt ?? 0; st.low = base.low ?? 0; st.pupil = base.pupil ?? 1;
      st.shine = base.shine; st.wet = base.wet;
      st.lx = (base.lx ?? 0) + (base.lx === undefined ? this._qx ?? 0 : 0);
      st.ly = (base.ly ?? 0) + (base.ly === undefined ? this._qy ?? 0 : 0);
      if (blinkFrame === 1) st.open = Math.min(st.open, 0.45);
      else if (blinkFrame === 2) st.open = 0;
      drawEye(ctx, cx, cy, side, st, iris);
      if (this.lashes && st.open > 0.4) {
        const ox = side < 0 ? cx - ERX - 1 : cx + ERX;
        P(ctx, ox, cy - ERY + 1 + (1 - Math.min(1, st.open)) * 6, INK);
        P(ctx, ox + (side < 0 ? -1 : 1), cy - ERY + (1 - Math.min(1, st.open)) * 6, INK);
      }
    }
    // mouth
    let mouth = this.mouth;
    if (this.talking && this.viseme) mouth = this.viseme;
    (MOUTHS[mouth] || MOUTHS.smile)(ctx, MOUTH_X, MOUTH_Y, t);
    // overlays
    const implied = EYE_FX[this.eyes];
    if (implied) for (const k of implied) if (!this.fxOn.has(k)) FX[k](ctx, t);
    for (const k of this.fxOn.keys()) FX[k](ctx, t);
    this.texture.needsUpdate = true;
  }
}
