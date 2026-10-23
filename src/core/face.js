// Stylized pixel-art faces drawn onto a small canvas and used as a texture on
// the front of chibi heads - "action figure / hero" style by default: narrow,
// slightly hooded eyes with a firm lid line, a big clear iris and one hard
// highlight, thick straight brows set low, no lipstick or blush, and firmer face
// planes (cheekbones, jaw, chin, optional stubble). Characters flagged with
// `lashes` get the softer variant (lash line + wing, slimmer arched brows, blush).
//
// The face is parametric: eyes are drawn per pixel from a small state
// (openness, lid tilt, lower-lid squint, pupil look offset, pupil size), so
// blinks, squints and glances are smooth, and the same eye can be angry, sad,
// sleepy or shocked. Brows, mouths (with teeth, tongue and talk visemes) and
// overlays (blush, sweat, tears, anger vein, gloom lines, sparkles) are layered
// on top. The canvas is only redrawn when something visible changes.
import * as THREE from 'three';
import { hexToCss, rand, shade } from './util.js';

export const FACE_RES = 40; // canvas pixels across the head front (2 px per hi-res head voxel)
const S = FACE_RES;
const INK = '#16121f';
const SCLERA = '#f3efe8';
const SCLERA_SH = '#c9c0c4';
const MOUTH_IN = '#4a1420';
const TONGUE = '#e8707e';
const TEETH = '#f6f1e8';
const LIP = 'rgba(90,40,30,0.22)'; // lower-lip shadow (skin tone, no lipstick)
const SKIN_SH = 'rgba(90,40,30,0.13)';
const SKIN_SH2 = 'rgba(80,35,25,0.2)';
const TEAR = '#6cc7ff';
const TEAR_HI = '#d8f4ff';

// eye centres (canvas px)
const EYE_X = [12.5, 27.5];
const EYE_Y = 18;
const ERX = 3.6; // half width of the almond
const MOUTH_X = 20, MOUTH_Y = 30;

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
/** Arc: points along an ellipse from angle a0 to a1 (radians, y down). */
function arc(ctx, cx, cy, rx, ry, a0, a1, c, th = 1) {
  const n = Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * 1.6) + 2;
  ctx.fillStyle = c;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    ctx.fillRect(Math.round(cx + Math.cos(a) * rx - th / 2), Math.round(cy + Math.sin(a) * ry - th / 2), th, th);
  }
}
function inPoly(x, y, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// ---------------------------------------------------------------------------
// Eyes

/**
 * Eye. st: { open 0..1.15, tilt (+ angry: inner corner down, - sad), low 0..1 lower-lid
 * squint, lx, ly look offset, pupil (scale), wet, glint: null|'star'|'heart'|'money'|'fire', fem }.
 * Default ("hero") eyes are narrow and slightly hooded: a flat, firm upper lid line, a big
 * clear iris that fills most of the opening, a crisp pupil, one hard highlight, and a
 * lid crease shadow above so they read as deep-set. `fem` adds the heavier lash line and
 * a small outer lash flick (only for characters flagged with lashes).
 */
function drawEye(ctx, cx, cy, side, st, iris) {
  const open = Math.min(1.15, st.open ?? 1);
  const tilt = st.tilt ?? 0;
  const fem = !!st.fem;
  const inSign = side < 0 ? 1 : -1; // +x direction of the inner corner
  const erx = fem ? ERX : ERX - 0.2;
  if (open <= 0.08) {
    // closed: a firm, nearly straight lid line (a soft dip for lashes)
    for (let x = Math.floor(cx - erx); x <= Math.ceil(cx + erx - 1); x++) {
      const u = (x + 0.5 - cx) / erx;
      P(ctx, x, cy + 0.6 + (1 - u * u) * (fem ? 0.9 : 0.45) + tilt * u * inSign * 0.8, INK);
    }
    if (fem) P(ctx, cx - inSign * (erx + 0.6), cy - 0.2, INK);
    return;
  }
  const rx = erx * (open > 1 ? 1.06 : 1);
  const up = (fem ? 2.75 : 2.2) * open;
  const dn = (fem ? 1.75 : 1.55) * Math.min(1.1, 0.55 + 0.45 * open) * (1 - (st.low ?? 0) * 0.75);
  const pupil = st.pupil ?? 1;
  const icx = cx + (st.lx ?? 0) * 1.1, icy = cy + (fem ? 0.35 : 0.1) + (st.ly ?? 0) * 0.7;
  const ri = (fem ? 2.35 : 2.25) * Math.max(0.55, pupil) ** 0.35;
  const irisC = hexToCss(iris), irisD = hexToCss(shade(iris, -0.45)), irisL = hexToCss(shade(iris, 0.3));
  const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx);
  const glint = st.glint;
  const lash = fem ? 1.4 : 1; // upper lid line thickness
  for (let x = x0; x <= x1; x++) {
    const u = (x + 0.5 - cx) / rx;
    if (Math.abs(u) > 1) continue;
    const inner = u * inSign; // +1 at the inner corner, -1 outer
    // upper lid: almond with a lifted outer wing (fem) or a flatter, hooded line that
    // drops a touch at the outer corner (hero)
    const k = Math.pow(Math.max(0, 1 - u * u), fem ? 0.55 : 0.3);
    const top = cy - up * k + tilt * (inner + 0.2) * 1.5 - (fem && inner < -0.5 ? 0.4 : 0) + (!fem && inner < -0.55 ? 0.5 : 0);
    const bot = cy + dn * Math.pow(Math.max(0, 1 - u * u), fem ? 0.9 : 0.6) - 0.2;
    if (bot - top < 0.6) { P(ctx, x, Math.round(top), INK); continue; }
    // lid crease / brow-bone shadow just above the lid (deep-set look)
    if (!fem && open > 0.3) P(ctx, x, Math.floor(top) - 1, 'rgba(70,30,25,0.22)');
    for (let y = Math.floor(top); y <= Math.ceil(bot); y++) {
      const yc = y + 0.5;
      if (yc < top || yc > bot + 0.5) continue;
      let c;
      if (yc < top + lash) c = INK; // upper lid line
      else {
        const dx = x + 0.5 - icx, dy = yc - icy;
        const d = Math.sqrt(dx * dx + dy * dy * 0.85);
        if (d <= ri) {
          if (pupil > 0.05 && Math.abs(dx) <= 0.9 * pupil + 0.1 && Math.abs(dy) <= (fem ? 1.4 : 1.1) * pupil + 0.2) c = INK;
          else c = d > ri - 0.75 ? irisD : dy > 0.6 ? irisL : yc < top + lash + 1 ? irisD : irisC;
        } else c = yc < top + lash + 1 ? SCLERA_SH : SCLERA;
      }
      P(ctx, x, y, c);
    }
    // lower lid: soft line on the outer half (fem); a faint skin shadow (hero)
    if (fem) { if (inner < 0.2) P(ctx, x, Math.round(bot + 0.5), 'rgba(80,30,40,0.35)'); }
    else if (Math.abs(u) < 0.85) P(ctx, x, Math.round(bot + 0.5), 'rgba(80,35,30,0.2)');
    if (st.wet && inner > -0.8) P(ctx, x, Math.round(bot + 0.3), TEAR);
  }
  if (fem) {
    // outer lash wing
    const ox = cx - inSign * (rx + 0.6);
    const wy = cy - up * 0.15 + tilt * -1.2 - 0.6;
    P(ctx, ox, wy, INK);
    if (open > 0.5) P(ctx, ox - inSign, wy - 0.8, INK);
  } else {
    // crisp outer corner: the lid line runs one pixel past the eye
    P(ctx, cx - inSign * (rx + 0.5), cy - up * 0.35 + tilt * -1.0 + 0.4, INK);
  }
  // glints / tamed special irises
  const topAtIris = cy - up * Math.pow(Math.max(0, 1 - ((icx - cx) / rx) ** 2), fem ? 0.55 : 0.3) + lash;
  const gy = Math.max(icy - 1.3, topAtIris);
  if (glint === 'star') {
    const c = '#ffe27a';
    P(ctx, icx - 0.5, gy - 0.6, c); P(ctx, icx - 1.5, gy + 0.4, c); P(ctx, icx + 0.5, gy + 0.4, c); P(ctx, icx - 0.5, gy + 1.4, c); P(ctx, icx - 0.5, gy + 0.4, '#ffffff');
  } else if (glint === 'heart') {
    const c = '#ff4f8f';
    P(ctx, icx - 1.5, gy, c); P(ctx, icx + 0.5, gy, c); P(ctx, icx - 1.5, gy + 1, c, 3, 1); P(ctx, icx - 0.5, gy + 2, c);
  } else if (glint === 'money') {
    P(ctx, icx - 0.5, gy - 0.3, '#7dff9a', 1, 3); P(ctx, icx - 1.5, gy + 0.7, '#7dff9a', 3, 1);
  } else if (glint === 'fire') {
    P(ctx, icx - 0.5, gy, '#ffe27a'); P(ctx, icx - 0.5, gy + 1, '#ff9a2a'); P(ctx, icx + 0.5, gy + 0.6, '#ff6a1f');
  } else if (open > 0.3 && pupil > 0.05) {
    // one small hard highlight (plus the soft second one for lashes)
    P(ctx, icx + (fem ? -1.6 : -1.2), gy + (fem ? 0 : 0.3), '#ffffff');
    if (fem && open > 0.7) P(ctx, icx + 0.6, icy + 1, 'rgba(255,255,255,0.65)');
  }
}

// eye state presets ({ open, tilt, low, pupil, lx, ly, wet, glint })
const EYE_STATE = {
  normal: { tilt: 0.12 },
  angry: { open: 0.72, tilt: 0.75 },
  sad: { open: 0.85, tilt: -0.55, wet: true },
  determined: { open: 0.7, tilt: 0.45, low: 0.2 },
  sleepy: { open: 0.35 },
  side: { open: 0.62, lx: 1.5, low: 0.15, tilt: 0.2 },
  sideL: { open: 0.62, lx: -1.5, low: 0.15, tilt: 0.2 },
  lookL: { lx: -1.5, tilt: 0.12 },
  lookR: { lx: 1.5, tilt: 0.12 },
  up: { ly: -1.1, open: 1.02 },
  down: { ly: 1, open: 0.6 },
  shock: { open: 1.15, pupil: 0.45, tilt: -0.2 },
  wide: { open: 1.1, pupil: 1.1 },
  sparkle: { open: 1.05, glint: 'star' },
  worried: { open: 0.9, tilt: -0.6, pupil: 0.8 },
  teary: { open: 1, tilt: -0.45, wet: true },
  smug: { open: 0.48, low: 0.25, lx: 0.9, tilt: 0.3 },
  focus: { open: 0.6, tilt: 0.55, pupil: 0.75 },
  tired: { open: 0.42, tilt: -0.2, ly: 0.4 },
  think: { lx: -1.2, ly: -1, open: 0.85 },
  blank: { open: 1.05, pupil: 0 },
  star: { open: 1.05, glint: 'star', tilt: -0.1 },
  heart: { open: 0.95, glint: 'heart', tilt: -0.2 },
  money: { open: 1, glint: 'money' },
  fire: { open: 0.75, tilt: 0.8, glint: 'fire' },
};

/** Special eye painters, (cx, cy) = eye centre. Kept small and crisp. */
const SPECIAL = {
  happy(ctx, cx, cy) {
    // ^ shaped, angular
    line(ctx, cx - 3, cy + 1.5, cx - 0.5, cy - 0.5, INK, 1);
    line(ctx, cx - 0.5, cy - 0.5, cx + 2.5, cy + 1.5, INK, 1);
    P(ctx, cx - 1, cy - 0.5, INK, 2, 1);
  },
  closed(ctx, cx, cy, side, iris, t, fem) {
    drawEye(ctx, cx, cy, side, { open: 0, fem }, 0x000000);
  },
  squint(ctx, cx, cy, side) {
    const d = side < 0 ? 1 : -1;
    line(ctx, cx - d * 2.5, cy - 1.5, cx + d * 1.5, cy + 0.3, INK, 1);
    line(ctx, cx + d * 1.5, cy + 0.3, cx - d * 2.5, cy + 2, INK, 1);
  },
  cry(ctx, cx, cy, side) { SPECIAL.squint(ctx, cx, cy, side); },
  dizzy(ctx, cx, cy, side, iris, t) {
    ctx.fillStyle = INK;
    const r0 = t * 4;
    for (let i = 0; i < 18; i++) {
      const a = i * 0.62 + r0 * (side < 0 ? 1 : -1);
      const r = 0.3 + i * 0.13;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r * 0.9 - 0.5), 1, 1);
    }
  },
  x(ctx, cx, cy) {
    line(ctx, cx - 2, cy - 2, cx + 1.5, cy + 1.5, INK, 1);
    line(ctx, cx + 1.5, cy - 2, cx - 2, cy + 1.5, INK, 1);
  },
};
SPECIAL.laugh = SPECIAL.squint;

// Brows: { a: angle (+ angry: inner end down), r: raise px, hide }
const BROWS = {
  normal: { a: 0.25, r: 0 }, happy: { a: -0.1, r: 1 }, closed: { a: 0.1, r: 0 }, shock: { a: -0.35, r: 2.5 },
  angry: { a: 1.1, r: -0.5 }, sad: { a: -0.9, r: 0.5 }, determined: { a: 0.8, r: -0.5 }, dizzy: { a: -0.4, r: 1 },
  star: { a: -0.2, r: 1.5 }, money: { a: 0.1, r: 1.5 }, heart: { a: -0.4, r: 1.5 }, wink: { a: 0.3, r: 0, wink: true },
  sleepy: { a: -0.1, r: -0.5 }, side: { a: 0.6, r: -0.5, quirk: true }, sideL: { a: 0.6, r: -0.5, quirk: true },
  lookL: { a: 0.25, r: 0 }, lookR: { a: 0.25, r: 0 }, up: { a: -0.2, r: 1.5 }, down: { a: 0.3, r: -0.5 },
  wide: { a: -0.3, r: 2 }, sparkle: { a: -0.2, r: 1.5 }, worried: { a: -1.0, r: 1 }, teary: { a: -0.9, r: 1 },
  smug: { a: 0.5, r: 0, quirk: true }, focus: { a: 0.9, r: -0.5 }, tired: { a: -0.3, r: -0.5 }, think: { a: 0.4, r: 0.5, quirk: true },
  blank: { a: 0, r: 2.5 }, squint: { a: 0.7, r: -0.5 }, cry: { a: -1.0, r: 1 }, x: { a: -0.2, r: 1 }, fire: { a: 1.2, r: -0.5 },
  laugh: { a: -0.3, r: 1 },
};

function drawBrow(ctx, cx, side, b, col, fem) {
  if (b.hide) return;
  const inner = side < 0 ? 1 : -1; // direction towards the nose
  let a = b.a ?? 0;
  let r = 0;
  if (b.quirk && side > 0) { a = -0.5; r = 1.5; }
  if (fem) {
    // slimmer brow: thick block at the inner end, tapering to a point at the outer end, soft arch
    const y = EYE_Y - 5.6 - (b.r ?? 0);
    const xi = cx + inner * 3.4, xo = cx - inner * 3.8;
    const yi = y - r + a * 1.6, yo = y - r - a * 0.5 + 0.3;
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const yy = yi + (yo - yi) * t - Math.sin(t * Math.PI) * 0.7;
      P(ctx, xi + (xo - xi) * t, yy, col, 1, t < 0.55 ? 2 : 1);
    }
    return;
  }
  // hero brow: thick, straight and set low over the eye, a squared inner end,
  // a slightly tapered outer end and a darker underside for weight
  const y = EYE_Y - 5.2 - (b.r ?? 0) * 0.85;
  const xi = cx + inner * 4, xo = cx - inner * 4.2;
  const yi = y - r + a * 1.55, yo = y - r - a * 0.55 + 0.4;
  const dark = 'rgba(0,0,0,0.28)';
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = xi + (xo - xi) * t;
    const yy = yi + (yo - yi) * t - Math.sin(t * Math.PI) * 0.25;
    const th = t < 0.75 ? 2 : 1;
    P(ctx, x, yy, col, 1, th);
    if (t < 0.15) P(ctx, x, yy - 1, col); // squared inner block (3 px tall)
    P(ctx, x, Math.round(yy) + th, 'rgba(60,25,20,0.16)'); // brow-ridge shadow underneath
    if (th === 2) P(ctx, x, Math.round(yy) + 1, dark);
  }
}

// ---------------------------------------------------------------------------
// Mouths at (cx, cy) = centre (small and clean)

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
      else if (o.tongue && y >= bottom - o.tongue && Math.abs(x + 0.5 - cx) < rx * 0.62) c = TONGUE;
      P(ctx, x, y, c);
    }
  if (bottom > -Infinity) P(ctx, cx - rx * 0.5, bottom + 1, LIP, Math.max(1, Math.round(rx)), 1);
}
const lowerLip = (ctx, cx, y, w = 3) => P(ctx, cx - w / 2, y, LIP, w, 1);

const MOUTHS = {
  // confident closed smile: a firm line with the corners turned up, one side a touch higher
  smile(ctx, cx, cy) { P(ctx, cx - 2.5, cy, INK, 5, 1); P(ctx, cx - 3.5, cy - 0.6, INK); P(ctx, cx + 2.5, cy - 1, INK); P(ctx, cx + 3.3, cy - 1.8, INK); lowerLip(ctx, cx, cy + 1.6, 4); },
  smileSmall(ctx, cx, cy) { P(ctx, cx - 1.5, cy, INK, 4, 1); P(ctx, cx - 2.5, cy - 0.6, INK); P(ctx, cx + 2.5, cy - 0.6, INK); lowerLip(ctx, cx, cy + 1.5, 3); },
  grin(ctx, cx, cy) { mouthHole(ctx, cx, cy, 3.6, 2.2, { shape: 'D', teeth: 1, tongue: 1 }); },
  beam(ctx, cx, cy) { mouthHole(ctx, cx, cy, 4.4, 2.8, { shape: 'D', teeth: 1, tongue: 1 }); },
  laugh(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 4, 3.2, { shape: 'D', teeth: 1, tongue: 2 }); },
  open(ctx, cx, cy) { mouthHole(ctx, cx, cy, 2.2, 2, { tongue: 1 }); },
  shout(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 4, 3.2, { shape: 'O', teeth: 1, tongue: 1 }); },
  scream(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 3, 3.8, { teeth: 1, lowTeeth: 1, tongue: 1 }); },
  gasp(ctx, cx, cy) { mouthHole(ctx, cx, cy, 1.6, 2.2, {}); },
  o(ctx, cx, cy) { mouthHole(ctx, cx, cy, 1.3, 1.4, {}); },
  frown(ctx, cx, cy) { arc(ctx, cx, cy + 2, 3, 2, Math.PI * 1.22, Math.PI * 1.78, INK, 1); },
  sad(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 3, 2.2, { shape: 'U', tongue: 1 }); },
  flat(ctx, cx, cy) { P(ctx, cx - 2.5, cy, INK, 5, 1); lowerLip(ctx, cx, cy + 1.5, 3); },
  smirk(ctx, cx, cy) { line(ctx, cx - 2.5, cy + 0.5, cx + 1, cy + 0.5, INK, 1); line(ctx, cx + 1, cy + 0.5, cx + 3, cy - 1, INK, 1); lowerLip(ctx, cx, cy + 2, 3); },
  tongue(ctx, cx, cy) { MOUTHS.smile(ctx, cx, cy); P(ctx, cx, cy + 0.5, TONGUE, 2, 2); P(ctx, cx, cy + 2.5, '#c8505e', 2, 1); },
  wobble(ctx, cx, cy) {
    ctx.fillStyle = INK;
    for (let x = -3; x <= 3; x++) ctx.fillRect(cx + x, Math.round(cy + Math.sin(x * 1.7) * 0.7), 1, 1);
  },
  teeth(ctx, cx, cy) {
    P(ctx, cx - 4, cy - 1.5, INK, 8, 4);
    P(ctx, cx - 3, cy - 0.5, TEETH, 6, 2);
    P(ctx, cx - 3, cy, '#bdb4ae', 6, 1);
    for (let x = -2; x <= 2; x += 2) P(ctx, cx + x, cy - 0.5, '#bdb4ae', 1, 2);
  },
  grimace(ctx, cx, cy) {
    for (let x = -4; x <= 4; x++) { const o = Math.round(Math.sin((x + 4) * 0.9) * 0.5); P(ctx, cx + x, cy - 1.5 + o, INK, 1, 4); }
    for (let x = -3; x <= 3; x++) { const o = Math.round(Math.sin((x + 4) * 0.9) * 0.5); P(ctx, cx + x, cy - 0.5 + o, TEETH, 1, 2); }
    for (let x = -2; x <= 2; x += 2) P(ctx, cx + x, cy - 0.5, '#bdb4ae', 1, 2);
  },
  cat(ctx, cx, cy) {
    arc(ctx, cx - 1.5, cy - 0.8, 1.5, 1.5, Math.PI * 0.1, Math.PI * 0.9, INK, 1);
    arc(ctx, cx + 1.5, cy - 0.8, 1.5, 1.5, Math.PI * 0.1, Math.PI * 0.9, INK, 1);
  },
  chew(ctx, cx, cy, t) {
    const o = Math.floor(t * 8) % 2;
    P(ctx, cx - 2, cy - o, INK, 4, 1 + o);
    if (o) P(ctx, cx - 1, cy - 1, '#6e3e26', 2, 1);
    lowerLip(ctx, cx, cy + 1.5, 3);
  },
  pout(ctx, cx, cy) { arc(ctx, cx, cy + 1.5, 1.8, 1.4, Math.PI * 1.15, Math.PI * 1.85, INK, 1); lowerLip(ctx, cx, cy + 2.5, 2); },
  whistle(ctx, cx, cy) { ell(ctx, cx + 1.5, cy, 1.2, 1.2, INK); P(ctx, cx + 1, cy - 0.5, MOUTH_IN); },
  kiss(ctx, cx, cy) {
    arc(ctx, cx, cy - 0.9, 1.1, 0.9, -Math.PI * 0.5, Math.PI * 0.5, INK, 1);
    arc(ctx, cx, cy + 0.9, 1.1, 0.9, -Math.PI * 0.5, Math.PI * 0.5, INK, 1);
  },
  drool(ctx, cx, cy) { MOUTHS.open(ctx, cx, cy); P(ctx, cx + 1.5, cy + 2, TEAR, 1, 2); },
  bite(ctx, cx, cy) { MOUTHS.smile(ctx, cx, cy); P(ctx, cx - 1.5, cy - 0.5, TEETH, 3, 1); },
  yawn(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 2.6, 3.4, { tongue: 1 }); },
  mmm(ctx, cx, cy) { arc(ctx, cx, cy - 1, 2.4, 1.4, Math.PI * 0.12, Math.PI * 0.88, INK, 1); lowerLip(ctx, cx, cy + 1, 2); },
  // talk visemes
  vA(ctx, cx, cy) { mouthHole(ctx, cx, cy, 2.6, 2.2, { shape: 'D', teeth: 1, tongue: 1 }); },
  vE(ctx, cx, cy) { mouthHole(ctx, cx, cy, 3.4, 1.5, { shape: 'D', teeth: 1 }); },
  vO(ctx, cx, cy) { mouthHole(ctx, cx, cy, 1.8, 2.2, {}); },
  vU(ctx, cx, cy) { mouthHole(ctx, cx, cy, 1.2, 1.3, {}); },
  vM(ctx, cx, cy) { P(ctx, cx - 2, cy, INK, 4, 1); lowerLip(ctx, cx, cy + 1, 3); },
  vBig(ctx, cx, cy) { mouthHole(ctx, cx, cy + 0.5, 3.6, 3, { shape: 'D', teeth: 1, tongue: 1 }); },
};

// ---------------------------------------------------------------------------
// Overlays

const FX = {
  blush(ctx, t, f) {
    if (f?.lashes) {
      for (const cx of [7.5, 32.5]) {
        ell(ctx, cx, 24, 2.8, 1.1, 'rgba(240,80,110,0.4)');
        for (let i = 0; i < 3; i++) P(ctx, cx - 2 + i * 1.6, 23.5, 'rgba(210,50,90,0.55)');
      }
      return;
    }
    // hero: a light flush with a few diagonal hatch strokes (no pink discs)
    for (const cx of [7.5, 32.5]) {
      ell(ctx, cx, 24, 2.6, 1, 'rgba(200,70,60,0.16)');
      for (let i = 0; i < 3; i++) { P(ctx, cx - 1.5 + i * 1.5, 23, 'rgba(190,60,55,0.5)'); P(ctx, cx - 2.5 + i * 1.5, 24, 'rgba(190,60,55,0.5)'); }
    }
  },
  sweat(ctx, t) {
    const y = 4 + ((t * 5) % 3);
    ell(ctx, 34.5, y + 2.5, 1.5, 1.9, TEAR);
    P(ctx, 34, y, TEAR, 1, 1);
    P(ctx, 34, y + 1.5, TEAR_HI);
  },
  tears(ctx, t) {
    const f = Math.floor(t * 8) % 3;
    for (const cx of EYE_X) {
      for (let y = 21; y < 37; y++) P(ctx, cx - 0.5 + Math.round(Math.sin(y * 0.6) * 0.5), y, (y + f) % 3 === 0 ? TEAR_HI : TEAR, y > 30 ? 2 : 1, 1);
    }
  },
  tear(ctx) {
    ell(ctx, EYE_X[0] - 2.5, 22.5, 0.9, 1.3, TEAR);
    P(ctx, EYE_X[0] - 3, 21.5, TEAR_HI);
  },
  vein(ctx) {
    const c = '#ff2e4a';
    const x = 5, y = 3;
    for (const [ax, ay, bx, by] of [[0, 1, 1, 0], [3, 0, 4, 1], [4, 3, 3, 4], [1, 4, 0, 3]]) line(ctx, x + ax, y + ay, x + bx, y + by, c, 1);
  },
  gloom(ctx) {
    for (let x = 9; x <= 30; x += 3) P(ctx, x, 1, 'rgba(70,40,140,0.45)', 1, 5 + ((x * 7) % 3));
  },
  shine(ctx, t) {
    const f = Math.floor(t * 5) % 2;
    for (const [x, y] of [[5, 11], [35, 13]]) {
      P(ctx, x, y - 1 - f, '#ffffff'); P(ctx, x - 1 - f, y, '#ffffff'); P(ctx, x, y, '#fff6b0'); P(ctx, x + 1 + f, y, '#ffffff'); P(ctx, x, y + 1 + f, '#ffffff');
    }
  },
  shock(ctx) {
    for (const [x0, y0, x1, y1] of [[2, 4, 3, 7], [37, 4, 36, 7]]) line(ctx, x0, y0, x1, y1, INK, 1);
  },
  bags(ctx) {
    for (const cx of EYE_X) arc(ctx, cx, EYE_Y + 3, 2.8, 1.2, Math.PI * 0.15, Math.PI * 0.85, 'rgba(110,70,120,0.45)', 1);
  },
};
const ANIMATED_FX = new Set(['sweat', 'tears', 'shine']);

// default overlays implied by an eye style
const EYE_FX = { sad: ['tear'], cry: ['tears'], shock: ['shock'], tired: ['bags'], heart: ['blush'] };

/** Hash-ish 0..1 for stable stipple patterns. */
const h2 = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997 / 997;

/**
 * Sculpting drawn under the features: brow shadow, nose shadow, cheekbones, jaw, chin.
 * Hero faces (no lashes) get firmer planes: a cheekbone hollow, darker jaw sides, a chin
 * dimple shadow and optional stubble; lash faces keep the softer version with blush.
 */
function shading(ctx, f) {
  P(ctx, 19, 24, 'rgba(90,40,30,0.28)', 2, 1); // under the nose voxel
  P(ctx, 18, 23, SKIN_SH, 1, 1); P(ctx, 21, 23, SKIN_SH, 1, 1);
  if (f.lashes) {
    for (const cx of EYE_X) P(ctx, cx - 3.5, EYE_Y - 4.2, 'rgba(70,30,30,0.08)', 8, 2);
    for (let y = 26; y < 40; y++) { P(ctx, 0, y, SKIN_SH, 2, 1); P(ctx, 38, y, SKIN_SH, 2, 1); }
    P(ctx, 14, 36, 'rgba(90,40,30,0.08)', 12, 2); // chin
    if (f.blush) for (const cx of [7.5, 32.5]) ell(ctx, cx, 24.5, 2.6, 1, 'rgba(235,110,110,0.16)');
    return;
  }
  // nose bridge side shadow
  P(ctx, 18, 20, 'rgba(90,40,30,0.1)', 1, 3);
  // cheekbone hollows: a diagonal plane from under the outer eye towards the mouth corners
  for (let i = 0; i < 6; i++) {
    P(ctx, 4 + i * 0.9, 24 + i, SKIN_SH, 2, 1);
    P(ctx, 34 - i * 0.9, 24 + i, SKIN_SH, 2, 1);
  }
  // jaw sides (stronger towards the chin) + under-jaw band
  for (let y = 22; y < 40; y++) {
    const w = y < 30 ? 2 : 3;
    P(ctx, 0, y, SKIN_SH2, w, 1); P(ctx, 40 - w, y, SKIN_SH2, w, 1);
  }
  P(ctx, 3, 38, SKIN_SH2, 34, 2);
  // chin: a small shadow under the lower lip + a hint of a cleft
  P(ctx, 17, 34, 'rgba(90,40,30,0.14)', 6, 1);
  P(ctx, 19, 36, 'rgba(90,40,30,0.12)', 2, 1);
  if (f.stubble) {
    const c = f.stubble;
    for (let y = 25; y < 40; y++)
      for (let x = 1; x < 39; x++) {
        const side = x < 9 || x > 30;
        const lower = y >= 33;
        const lip = y >= 27 && y <= 29 && x >= 15 && x <= 24; // moustache shadow
        if (!(side && y >= 26) && !lower && !lip) continue;
        if (y >= 28 && y <= 32 && x >= 14 && x <= 25) continue; // keep the mouth clean
        if (h2(x, y) < (lower ? 0.55 : 0.4)) P(ctx, x, y, c);
      }
  }
}

const SPECIAL_EYES = Object.keys(SPECIAL).filter((k) => SPECIAL[k]);
export const EYE_TYPES = [...Object.keys(EYE_STATE), ...SPECIAL_EYES, 'wink'];
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

const MASKS = new WeakMap();
/** Alpha mask canvas from a Uint8Array (1 = keep), cached per array. */
function maskCanvas(mask) {
  let c = MASKS.get(mask);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = S; c.height = S;
  const cx = c.getContext('2d');
  const img = cx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) img.data[i * 4 + 3] = mask[i] ? 255 : 0;
  cx.putImageData(img, 0, 0);
  MASKS.set(mask, c);
  return c;
}

// ---------------------------------------------------------------------------

export class PixelFace {
  constructor(opts = {}) {
    this.iris = opts.eyeColor ?? 0x2a2a4a;
    this.brow = hexToCss(opts.browColor ?? 0x3a2a20);
    this.blush = opts.blush ?? true;
    this.lashes = opts.lashes ?? false;
    this.freckles = opts.freckles ?? false;
    // stubble shadow (css colour) drawn over the jaw, e.g. 'rgba(40,28,24,0.22)'
    this.stubble = opts.stubble ?? null;
    // which pixels lie on the flat front of the sculpted head (Uint8Array S*S); the rest is clipped
    this.maskCanvas = opts.mask ? maskCanvas(opts.mask) : null;
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
    if (this.eyes === 'dizzy' || this.mouth === 'chew') return true;
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
    // cheeks / planes under everything
    shading(ctx, this);
    if (this.freckles) for (const [x, y] of [[6, 22], [8, 23], [10, 22], [30, 22], [32, 23], [34, 22]]) P(ctx, x, y, 'rgba(150,80,50,0.45)');
    // brows
    const brow = BROWS[eyes] ?? BROWS.normal;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      drawBrow(ctx, EYE_X[i], side, brow.wink && side > 0 ? { a: 0.5, r: -0.5 } : brow, this.brow, this.lashes);
    }
    // eyes
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const cx = EYE_X[i], cy = EYE_Y;
      let e = eyes;
      if (e === 'wink') e = side < 0 ? 'normal' : 'happy';
      const sp = SPECIAL[e];
      if (sp) { sp(ctx, cx, cy, side, iris, t, this.lashes); continue; }
      const base = EYE_STATE[e] ?? EYE_STATE.normal;
      const st = this._st ?? (this._st = {});
      st.open = base.open ?? 1; st.tilt = base.tilt ?? 0; st.low = base.low ?? 0; st.pupil = base.pupil ?? 1;
      st.wet = base.wet; st.glint = base.glint; st.fem = this.lashes;
      st.lx = (base.lx ?? 0) + (base.lx === undefined ? this._qx ?? 0 : 0);
      st.ly = (base.ly ?? 0) + (base.ly === undefined ? this._qy ?? 0 : 0);
      if (blinkFrame === 1) st.open = Math.min(st.open, 0.45);
      else if (blinkFrame === 2) st.open = 0;
      drawEye(ctx, cx, cy, side, st, iris);
      if (this.lashes && st.open > 0.4) {
        const ox = side < 0 ? cx - ERX - 2 : cx + ERX + 1;
        P(ctx, ox, cy - 2.2, INK);
        P(ctx, ox + (side < 0 ? -1 : 1), cy - 3, INK);
      }
    }
    // mouth
    let mouth = this.mouth;
    if (this.talking && this.viseme) mouth = this.viseme;
    (MOUTHS[mouth] || MOUTHS.smile)(ctx, MOUTH_X, MOUTH_Y, t);
    // overlays
    const implied = EYE_FX[this.eyes];
    if (implied) for (const k of implied) if (!this.fxOn.has(k)) FX[k](ctx, t, this);
    for (const k of this.fxOn.keys()) FX[k](ctx, t, this);
    if (this.maskCanvas) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(this.maskCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.texture.needsUpdate = true;
  }
}
