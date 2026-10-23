// Sculpted hi-res voxel builders for the human characters (Jimmy, Nolan, Juan,
// the Recruit, NPCs and Commander outfits).
//
// Characters are modelled at FV = 0.025 world units per voxel (4x the density of
// the original chibis) with the same overall size, so seats, speech bubbles and
// hit boxes line up exactly as before. Nothing is a plain box: every part is a
// lofted / sculpted volume (skull with cranium dome, cheekbones, jaw angle and
// chin, a V-tapered torso with chest, waist and trapezius slope, tapered limbs,
// hands with fingers and a thumb, sneakers with soles and laces), then clothed
// with raised layers (collars, lapels, pockets, seams, folds, belts, cuffs).
//
//   head   x -20..19, y 0..39, z -17..19 (front face plane at z = 20 -> 0.5 world)
//   torso  x -14..13, y 0..19, z -8..8 (hips at the torso origin, neck at y = 20)
//   arm    shoulder pivot, upper 8 + forearm 8 + hand ~9 voxels
//   leg    hip pivot, thigh 8 + shin/shoe 8 voxels
//
// Every builder returns { g: VoxGrid, metal?: VoxGrid } in the local space of
// its joint (pivot = the joint at the origin). `metal` voxels are rendered with
// a shiny metal material (chains, crowns, buckles, watch bezels). Head results
// also carry `faceMask`: which 40x40 face-texture pixels lie on the flat front
// of the face (the pixel face is clipped to it).
import { VoxGrid } from '../../core/voxel.js';
import { shade, mixHex, hash3 } from '../../core/util.js';
import { blob, capsule, stamp } from '../kit.js';
import { buildAccessory, accSlot } from './accessories.js';

export const FV = 0.025; // world units per voxel
export const H = FV; // legacy name (the joint code in chibi.js works in these units)
export const FRONT = 20; // z of the flat face plane (front voxels at z = 19)
export const HEAD = { x0: -20, x1: 19, y0: 0, y1: 39, z0: -17, z1: 19, top: 40 };

const SKIN = 0xf1c3a0;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** Piecewise-linear lookup in [[x, v], ...] keyframes. */
function keys(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) {
      const [x0, v0] = tab[i - 1], [x1, v1] = tab[i];
      return lerp(v0, v1, (x - x0) / (x1 - x0));
    }
  }
  return tab[tab.length - 1][1];
}

/** Inside a rounded box (inclusive voxel corners, edge radius r). */
export function inRB(x, y, z, x0, y0, z0, x1, y1, z1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r)), dz = Math.max(z0 + r - z, 0, z - (z1 - r));
  return dx * dx + dy * dy + dz * dz <= (r + 0.35) * (r + 0.35);
}

/** Fill every voxel of a bounding range where test(x, y, z) holds. */
function fill(g, x0, x1, y0, y1, z0, z1, test, col, glow = false) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        if (!test(x, y, z)) continue;
        const c = typeof col === 'function' ? col(x, y, z) : col;
        if (c !== null && c !== undefined) g.set(x, y, z, c, glow);
      }
}

/** Stamp pixel art at 2x (each art pixel = 2x2 voxels) onto a surface. */
function stamp2(g, art, pal, o) {
  const big = [];
  for (const row of art) { const r = [...row].map((c) => c + c).join(''); big.push(r, r); }
  stamp(g, big, pal, o);
}

// ---------------------------------------------------------------------------
// Head shape: a loft of rounded cross-sections (flat face front, cheek wrap,
// round back) closed by a cranium dome on top and a jawline underneath.

function headProfile(def) {
  const soft = def.jaw ? def.jaw === 'soft' : !!def.lashes;
  const broad = def.jaw === 'broad';
  const Wt = soft
    ? [[0, 7.2], [3, 10.5], [7, 13.8], [12, 16.4], [17, 18.1], [22, 18.4], [40, 18.4]]
    : [[0, 9.4], [3, 11.8], [6, 14.4], [9, 15.9], [13, 17], [17, 18.2], [22, 18.5], [40, 18.5]];
  const FWt = soft
    ? [[0, 3.5], [3, 5.5], [7, 8], [12, 11], [17, 13.6], [40, 14]]
    : [[0, 5], [2, 6.5], [5, 8.4], [9, 10.4], [13, 12.4], [17, 13.9], [40, 14.2]];
  const k = broad ? 1.04 : 1;
  return { soft, W: (y) => keys(Wt, y) * k, fw: (y) => keys(FWt, y) * k };
}

const DOME_Y = 27, FC = 1.5;
/** Head volume test (voxel coords), inflated by t voxels for hair / hat shells. */
function makeHeadTest(def) {
  const P = headProfile(def);
  const rows = new Map(); // cached cross-section per (y, t)
  const row = (y, t) => {
    const key = y * 4096 + Math.round(t * 16);
    let r = rows.get(key);
    if (r) return r;
    const yc = y + 0.5;
    const top = HEAD.top + t;
    let W = P.W(yc) + t, fw = P.fw(yc), F = (yc < 1.2 ? FRONT - 0.8 : FRONT) + t;
    let B = (yc >= 14 ? -17 + Math.max(0, 3 - Math.abs(yc - 22) * 0.25) * -0.3 : -17 + (14 - yc) * 0.85) - t;
    if (yc > DOME_Y) {
      const s = (yc - DOME_Y) / (top - DOME_Y);
      const kk = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, s), 2.3)), 1 / 2.3);
      W *= kk; fw *= kk * kk * kk;
      F = FC + (F - FC) * kk;
      B = FC + (B - FC) * kk;
    }
    const depth = F - B;
    const rf = Math.max(0.5, W - fw), rfz = Math.max(0.01, Math.min(rf * 1.25, depth * 0.5));
    const rb = Math.max(0.01, Math.min(W * 0.8, depth * 0.5));
    r = { ok: yc >= -t - 0.01 && yc <= top && W > 0, W, F, B, rf, rfz, rb };
    rows.set(key, r);
    return r;
  };
  return (x, y, z, t = 0) => {
    const r = row(y, t);
    if (!r.ok) return false;
    const zc = z + 0.5;
    if (zc > r.F || zc < r.B) return false;
    // jawline: the underside rises from the chin back to the neck
    const jawY = clamp((12.5 - zc) * 0.6, 0, 10.5) - t;
    if (y + 0.5 < jawY) return false;
    const ax = Math.abs(x + 0.5), W = r.W;
    if (ax > W) return false;
    // front corners: the cheek wrap from the flat face round to the sides
    if (zc > r.F - r.rfz) {
      const u = (zc - (r.F - r.rfz)) / r.rfz;
      if (ax > W - r.rf + r.rf * Math.sqrt(Math.max(0, 1 - u * u))) return false;
    }
    // back corners: a round skull
    if (zc < r.B + r.rb) {
      const u = (r.B + r.rb - zc) / r.rb;
      if (ax > W - r.rb + r.rb * Math.sqrt(Math.max(0, 1 - u * u))) return false;
    }
    return true;
  };
}

// The default head test (hero jaw) for accessories that don't know the def.
const DEFAULT_HEAD = makeHeadTest({});
let curHead = DEFAULT_HEAD;
/** Inside the current character's head (inflated by t). */
export const inHead = (x, y, z, t = 0) => curHead(x, y, z, t);
const inHeadAt = (x, y, z) => curHead(x, y, z, 0);

/** Hair / hat layer of thickness t around the skull where mask(x,y,z) holds. */
export function shell(g, t, mask, col, t0 = 0) {
  const T = Math.ceil(t) + 1;
  for (let x = HEAD.x0 - T; x <= HEAD.x1 + T; x++)
    for (let y = HEAD.y0 - T; y <= HEAD.top + T; y++)
      for (let z = HEAD.z0 - T; z <= HEAD.z1 + T; z++) {
        if (mask && !mask(x, y, z)) continue;
        if (!curHead(x, y, z, t) || curHead(x, y, z, t0)) continue;
        if (t0 > 0 && g.has(x, y, z) && !mask) continue;
        g.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
      }
}

/** Strand-textured hair colour: streaks run along `dir` ('y' hangs down, 'z' swept back). */
export function hairCol(base, seed = 0, dir = 'y') {
  const lum = (((base >> 16) & 255) * 0.3 + ((base >> 8) & 255) * 0.59 + (base & 255) * 0.11) / 255;
  const dk = shade(base, -0.15), dk2 = shade(base, -0.3);
  // dark hair gets visible sheen from a warm grey, light hair from white
  const lt = lum < 0.2 ? mixHex(base, 0x8a7a72, 0.22) : shade(base, 0.11), hi = lum < 0.2 ? mixHex(base, 0xa8988c, 0.38) : shade(base, 0.24);
  return (x, y, z) => {
    const s = dir === 'z' ? hash3(x * 3 + seed, y * 2 - seed, (z >> 2) + seed) : hash3(x * 3 + seed, (y >> 2) + seed, z * 5 - seed);
    let c = s < 0.14 ? dk : s > 0.84 ? lt : base;
    if (y <= 22 && s < 0.3) c = dk2;
    if (y >= 37 && z >= 0 && z <= 12 && Math.abs(x + 0.5) < 12 && s > 0.4) c = hi;
    return c;
  };
}

// ---------------------------------------------------------------------------
// Head

export function buildHead(def) {
  const g = new VoxGrid();
  const skin = def.skin ?? SKIN;
  const test = makeHeadTest(def);
  curHead = test;
  const P = headProfile(def);
  // skull + face, with soft vertical shading (forehead brighter, jaw a touch darker)
  const skinCol = (x, y, z) => {
    if (y <= 3 && z < 14) return shade(skin, -0.09); // under-jaw
    if (y <= 6) return shade(skin, -0.04);
    if (y >= 30) return shade(skin, 0.03);
    if (z < 12 && Math.abs(x + 0.5) > 15.5 && y >= 9 && y <= 20) return shade(skin, -0.03); // cheek planes
    return skin;
  };
  fill(g, -21, 20, 0, 40, -19, 19, (x, y, z) => test(x, y, z, 0), skinCol);
  // neck (rides with the head, fills the gap under the jaw)
  const neck = shade(skin, -0.13);
  fill(g, -8, 7, -4, 10, -9, 5, (x, y, z) => {
    const dx = (x + 0.5) / 6.6, dz = (z + 0.5 + 2) / 6.4;
    return dx * dx + dz * dz <= 1 && !g.has(x, y, z);
  }, (x, y, z) => (y <= -2 ? shade(neck, -0.06) : neck));
  // cheekbones: a subtle ledge on the sides just under the eyes
  if (!P.soft) {
    for (const s of [-1, 1]) for (let y = 15; y <= 18; y++) for (let z = 8; z <= 15; z++) {
      let x = s < 0 ? -21 : 20;
      while (!g.has(x, y, z) && Math.abs(x) > 8) x -= s;
      if (!g.has(x, y, z) || Math.abs(x + 0.5) < 13) continue;
      if (y === 15 && z < 10) continue;
      g.set(x + s, y, z, y === 15 ? shade(skin, -0.05) : skin);
    }
  }
  // ears: oval rim, darker concha, lobe
  for (const s of [-1, 1]) {
    const W = P.W(18);
    for (let y = 12; y <= 23; y++)
      for (let z = -5; z <= 3; z++) {
        const dy = (y + 0.5 - 17.8) / 5.6, dz = (z + 0.5 + 0.8) / 3.4;
        const r = dy * dy + dz * dz;
        if (r > 1) continue;
        const inner = (y + 0.5 - 18.2) ** 2 / 10 + (z + 0.5 + 0.4) ** 2 / 3.2 < 1;
        for (let k = -1; k <= 2; k++) {
          const ax = Math.round(W) + k - (y < 14 ? 1 : 0);
          const x = s < 0 ? -1 - ax : ax;
          if (k === 2 && (inner || r > 0.85)) continue;
          let c = shade(skin, -0.08);
          if (k === 1 && inner) c = shade(skin, -0.26);
          if (k === 2) c = shade(skin, -0.04);
          if (y <= 13) c = shade(skin, -0.02); // lobe
          g.set(x, y, z, c);
        }
      }
  }
  // nose: bridge, tip, nostril wings (sticks out of the face plane)
  const nTip = shade(skin, 0.04), nSide = shade(skin, -0.08), nUnder = shade(skin, -0.24);
  for (let y = 17; y <= 19; y++) for (let x = -1; x <= 0; x++) g.set(x, y, FRONT, skin);
  for (let y = 15; y <= 17; y++) for (let x = -2; x <= 1; x++) g.set(x, y, FRONT, x === -2 || x === 1 ? nSide : nTip);
  for (let y = 15; y <= 16; y++) for (let x = -1; x <= 0; x++) g.set(x, y, FRONT + 1, y === 16 ? nTip : skin);
  for (let x = -3; x <= 2; x++) g.set(x, 14, FRONT, x === -2 || x === 1 ? nUnder : x === -3 || x === 2 ? nSide : shade(skin, -0.12));
  // chin: a firm block (hero) / a small rounded point (soft)
  if (!P.soft) {
    for (let y = 1; y <= 3; y++) for (let x = -4; x <= 3; x++) if (!(y === 1 && (x === -4 || x === 3))) g.set(x, y, FRONT, shade(skin, -0.03));
  } else {
    for (let x = -2; x <= 1; x++) g.set(x, 2, FRONT, skin);
  }

  buildHair(g, def);
  if (def.beard) buildBeard(g, def);
  const metal = new VoxGrid();
  for (const a of def._acc ?? []) if (accSlot(a) === 'head') buildAccessory(a, 'head', g, metal, def);
  // face mask: texture pixels sitting on the flat front (voxel at z = 19, nothing hair-coloured on it)
  const faceMask = new Uint8Array(40 * 40);
  for (let q = 0; q < 40; q++)
    for (let p = 0; p < 40; p++) {
      const x = p - 20, y = 39 - q;
      if (g.has(x, y, FRONT - 1) && test(x, y, FRONT - 1, 0)) faceMask[q * 40 + p] = 1;
    }
  curHead = DEFAULT_HEAD;
  return { g, metal, faceMask };
}

// --- hair ------------------------------------------------------------------

/** Hairline masks: front fringe edge, temples, sides above the ears, nape. */
function scalp(o = {}) {
  const front = o.front ?? 33, temple = o.temple ?? 30, side = o.side ?? 23, nape = o.nape ?? 10, burns = o.burns ?? 0;
  return (x, y, z) => {
    const ax = Math.abs(x + 0.5), zc = z + 0.5;
    if (zc > 13) return y >= (ax > 11 ? temple : front);
    if (zc > 4) return y >= (ax > 13 && burns ? burns : side + (zc - 4) * 0.4) ;
    if (zc > -5) return y >= side;
    return y >= nape + Math.max(0, zc + 12) * 0.9;
  };
}

function buildHair(g, def) {
  const style = def.hair?.style ?? 'short';
  const base = def.hair?.color ?? 0x4a2f1c;
  const skin = def.skin ?? SKIN;
  const col = hairCol(base, style.length);
  const colZ = hairCol(base, style.length, 'z');
  const dark = shade(base, -0.32);
  switch (style) {
    case 'jimmy': {
      // tight faded sides, a full top swept up and back into a quiff, side part
      const fade = mixHex(base, skin, 0.45);
      shell(g, 1.2, (x, y, z) => scalp({ front: 34, temple: 31, side: 22, nape: 9, burns: 14 })(x, y, z), (x, y, z) => (y < 25 && Math.abs(x + 0.5) > 14 ? (hash3(x, y, z) < 0.5 ? fade : col(x, y, z)) : col(x, y, z)));
      shell(g, 3.2, (x, y, z) => y >= 31 && z <= 17, colZ, 1);
      // quiff: lifted front mass, sweeping back
      blob(g, -2, 37.5, 14, 13, 4.2, 6.5, colZ, { p: 2.3 });
      blob(g, -4, 39.5, 10, 10, 3.6, 7, colZ, { p: 2.3 });
      capsule(g, [-10, 37, 17], [4, 40, 16], 2.6, 2.2, colZ);
      capsule(g, [6, 36, 17], [12, 35, 13], 2.2, 1.6, colZ);
      // part groove + comb lines
      for (let z = -12; z <= 21; z++) for (let y = 30; y <= 46; y++) if (g.has(-9, y, z) && !g.has(-9, y + 1, z)) g.set(-9, y, z, dark);
      g.paint((x, y, z, c) => (y >= 39 && (x + 40) % 5 === 0 && c !== dark && z < 14 && hash3(x, y, z) < 0.7 ? shade(c, -0.12) : undefined));
      // faded sideburns down to the beard
      for (const s of [-1, 1]) for (let y = 14; y <= 24; y++) for (let z = 4; z <= 9; z++) {
        let x = s < 0 ? -22 : 21;
        while (!g.has(x, y, z) && Math.abs(x) > 10) x -= s;
        if (g.has(x, y, z)) g.set(x + s, y, z, y < 18 ? mixHex(base, skin, 0.15) : col(x, y, z));
      }
      break;
    }
    case 'messy': {
      shell(g, 2.4, scalp({ front: 33, temple: 30, side: 21, nape: 8 }), col);
      const tufts = [[-12, 38, 6, -19, 44, 0], [-2, 40, 8, 1, 47, 3], [8, 39, 4, 17, 43, -2], [-6, 40, -6, -12, 45, -14], [6, 38, -8, 12, 42, -16],
        [-16, 33, -8, -23, 36, -14], [15, 32, -9, 22, 35, -14], [1, 40, 13, 4, 45, 18], [-9, 39, 13, -14, 44, 17], [0, 30, -15, 2, 33, -21], [-10, 27, -14, -14, 28, -19], [10, 26, -14, 14, 27, -19]];
      for (const [ax, ay, az, bx, by, bz] of tufts) capsule(g, [ax, ay, az], [bx, by, bz], 3.6, 0.8, col);
      // messy fringe locks hanging over the forehead (clear of the brows)
      for (const [x, len, lean] of [[-15, 4, -1], [-11, 6, 0], [-6, 5, 1], [-1, 6, 0], [4, 5, 1], [9, 6, 1], [13, 4, 0]]) capsule(g, [x, 37, 20], [x + lean * 2, 37 - len, 21.5], 2, 0.6, col);
      for (let x = -17; x <= 16; x++) for (let z = 18; z <= 21; z++) if (!g.has(x, 35, z) && z <= 20) g.set(x, 35, z, col(x, 35, z));
      break;
    }
    case 'undercut': {
      // skin fade on the sides/back (painted onto the skull) + a thick slicked top
      const fade = mixHex(base, skin, 0.62), fade2 = mixHex(base, skin, 0.8);
      g.paint((x, y, z, c) => {
        if (y < 14 || y > 31) return undefined;
        const ax = Math.abs(x + 0.5);
        if (z > 11 && y < 29) return undefined;
        if (ax < 15 && z > -12) return undefined;
        if (y >= 18 && y <= 23 && z > -6 && z < 4) return undefined; // around the ears
        return hash3(x, y, z) < (y > 24 ? 0.7 : 0.45) ? fade : fade2;
      });
      shell(g, 4.6, (x, y, z) => y >= 30 && Math.abs(x + 0.5) <= 15.5, colZ);
      blob(g, -1, 41, 13, 13.5, 5, 7.5, colZ, { p: 3 }); // pompadour lift
      blob(g, -1, 42, 2, 13, 4, 12, colZ, { p: 3 });
      for (let x = -15; x <= 13; x++) for (let z = 17; z <= 21; z++) if (!g.has(x, 33, z) && z <= 20) g.set(x, 33, z, colZ(x, 33, z));
      // comb grooves running back + the shaved part line
      g.paint((x, y, z, c) => (y >= 36 && z < 19 && !g.has(x, y + 1, z) ? ((x + 40) % 4 === 0 ? shade(c, -0.25) : (x + 40) % 4 === 2 ? mixHex(c, 0xa8988c, 0.3) : undefined) : undefined));
      for (let z = -22; z <= 22; z++) for (let y = 30; y <= 48; y++) if (g.has(9, y, z) && !g.has(9, y + 1, z)) { g.del(9, y, z); }
      break;
    }
    case 'spiky': {
      shell(g, 2, scalp({ front: 33, side: 21, nape: 9 }), col);
      const spikes = [[-12, 38, 8, -20, 50, 14], [-2, 40, 8, -2, 54, 16], [8, 38, 8, 16, 50, 14], [-14, 38, -4, -24, 49, -6], [0, 40, -2, 2, 54, -6], [12, 38, -4, 22, 49, -6],
        [-8, 34, -12, -12, 43, -24], [6, 34, -12, 10, 43, -24], [-18, 28, -6, -28, 33, -10], [16, 28, -6, 26, 33, -10]];
      for (const [ax, ay, az, bx, by, bz] of spikes) capsule(g, [ax, ay, az], [bx, by, bz], 4.6, 0.4, col);
      for (const [x, d] of [[-14, 7], [-6, 9], [2, 8], [10, 6]]) capsule(g, [x, 39, 19], [x + 1, 39 - d, 21], 2.6, 0.4, col);
      break;
    }
    case 'bob': {
      // jaw-length bob with a straight-cut fringe and a flicked-under ends
      shell(g, 3.4, (x, y, z) => y >= 8 && (y >= 32 || Math.abs(x + 0.5) >= 13.5 || z <= 4), col);
      for (let x = -19; x <= 18; x++) for (let y = 30; y <= 40; y++) for (let z = 19; z <= 22; z++) {
        if (g.has(x, y, z) && z <= 19) continue;
        if (z === 22 && y < 33) continue;
        if (y === 30 && (x + 40) % 4 === 0) continue; // choppy fringe edge
        if (curHead(x, y, z, 3.4)) g.set(x, y, z, col(x, y, z));
      }
      // flicked-out ends + vertical strand grooves
      shell(g, 4.6, (x, y, z) => y >= 7 && y <= 10 && (Math.abs(x + 0.5) >= 13.5 || z <= 4), (x, y, z) => (y === 7 ? shade(base, -0.14) : col(x, y, z)), 3.2);
      g.paint((x, y, z, c) => {
        if (y > 31 || inHeadAt(x, y, z)) return undefined;
        const k = Math.abs(x + 0.5) >= 13.5 ? z : x;
        return (k + 40) % 4 === 0 ? shade(c, -0.16) : (k + 40) % 4 === 2 ? shade(c, 0.06) : undefined;
      });
      break;
    }
    case 'ponytail': {
      shell(g, 1.6, scalp({ front: 33, side: 22, nape: 12 }), colZ);
      for (let x = -16; x <= 15; x++) g.set(x, 34, FRONT, colZ(x, 34, FRONT));
      for (const x of [-18, -17, -16, 15, 16, 17]) for (let y = 23; y <= 34; y++) g.set(x, y, FRONT - 1 - Math.max(0, Math.abs(x + 0.5) - 15.5) | 0, col(x, y, 19)); // side locks
      capsule(g, [-0.5, 30, -18], [-0.5, 20, -26], 5, 4.2, col);
      capsule(g, [-0.5, 20, -26], [-0.5, 7, -23], 4.2, 1.4, col);
      blob(g, -1, 30, -18.5, 5, 3, 2, def.hair?.tie ?? 0xff2e88, { p: 2.5 });
      break;
    }
    case 'buzz': {
      const bz = (x, y, z) => (hash3(x, y, z) < 0.42 ? mixHex(base, skin, 0.4) : base);
      shell(g, 0.7, (x, y, z) => scalp({ front: 33, temple: 31, side: 22, nape: 10 })(x, y, z) || (Math.abs(x + 0.5) > 15 && y >= 20 && z < 10 && !(y < 25 && z > -6 && z < 4)), bz);
      break;
    }
    case 'curly': {
      shell(g, 2, scalp({ front: 32, side: 20, nape: 8 }), col);
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 * 3.1, r = 14 + (i % 3) * 2;
        blob(g, Math.cos(a) * r, 34 + (i % 4) * 2.4, Math.sin(a) * r, 5, 5, 5, col);
      }
      break;
    }
    case 'bald':
      for (const [x, y, z] of [[-6, 39, 4], [-5, 39, 5], [-5, 38, 8]]) g.set(x, y, z, shade(skin, 0.2));
      break;
    default: {
      // short: textured crop with a side-swept fringe
      shell(g, 2.4, scalp({ front: 33, side: 22, nape: 9 }), col);
      blob(g, -5, 37, 17, 13, 3.5, 4, col);
      for (let x = -19; x <= 6; x++) {
        const y0 = 35 - Math.max(0, Math.floor((x + 19) / 6));
        for (let y = y0; y <= 37; y++) g.set(x, y, FRONT, col(x, y, FRONT));
      }
    }
  }
}

function buildBeard(g, def) {
  const b = typeof def.beard === 'number' ? def.beard : def.hair?.color ?? 0x4a2f1c;
  const col = hairCol(b, 7);
  const skin = def.skin ?? SKIN;
  const style = def.beardStyle ?? 'full';
  const mouthZone = (x, y) => ((x + 0.5) / 6.6) ** 2 + ((y + 0.5 - 9) / 4.4) ** 2 <= 1;
  if (style === 'stubble') {
    g.paint((x, y, z, c) => (y <= 13 && z >= -2 && y >= 0 && hash3(x, y, z) < 0.55 && !(z >= 19 && mouthZone(x, y)) ? mixHex(c, b, 0.38) : undefined));
    return;
  }
  if (style === 'chin') {
    // goatee + a thin chinstrap along the jaw
    g.paint((x, y, z, c) => {
      const ax = Math.abs(x + 0.5);
      if (z >= 18 && y <= 5 && ax <= 6) return col(x, y, z);
      if (y <= 14 && y >= 5 && z >= 2 && z <= 16 && ax > 13 && ax < 15.5) return col(x, y, z);
      if (y <= 4 && z >= 4 && ax > 7) return col(x, y, z);
      return undefined;
    });
    for (let y = 0; y <= 3; y++) for (let x = -5; x <= 4; x++) if (Math.abs(x + 0.5) <= 4.6 - (y === 0 ? 1.5 : 0) - (y === 3 ? 1 : 0)) { g.set(x, y, FRONT, col(x, y, FRONT)); g.set(x, y, FRONT - 1, col(x, y, FRONT)); }
    for (let y = 4; y <= 5; y++) for (let x = -1; x <= 0; x++) g.set(x, y, FRONT - 1, col(x, y, FRONT)); // soul patch
    for (let x = -5; x <= 4; x++) g.set(x, 13, FRONT - 1, col(x, 13, FRONT)); // pencil moustache
    return;
  }
  // full beard (Jimmy): sideburns into a jaw beard, chin bulk and a moustache
  const inBeard = (x, y, z) => {
    if (y > 24) return false;
    const ax = Math.abs(x + 0.5);
    if (z >= 18) return (y <= 4 || (ax >= 7 && y <= 11) || (ax >= 9 && y <= 13)) && !mouthZone(x, y);
    if (z >= 4) return y <= 13 - (z - 4) * 0.15 + (ax > 15 && z < 11 ? 4 : 0);
    if (z >= -2) return y <= 12 && ax > 6;
    return false;
  };
  g.paint((x, y, z, c) => (inBeard(x, y, z) ? col(x, y, z) : undefined));
  shell(g, 1.6, (x, y, z) => inBeard(x, Math.max(0, y), Math.min(z, 19)) && !(z >= 19 && y >= 4) && y <= 20, col);
  blob(g, -0.5, 1, 16, 9, 3, 4, col, { p: 2.6, clip: (x, y, z) => z < 14 });
  // moustache: flush on the face with corners running into the beard
  for (let x = -6; x <= 5; x++) g.set(x, 13, FRONT - 1, col(x, 13, FRONT));
  for (let x = -7; x <= 6; x++) if (Math.abs(x + 0.5) > 3) g.set(x, 12, FRONT - 1, col(x, 12, FRONT));
  for (const x of [-8, -7, 6, 7]) for (let y = 7; y <= 12; y++) g.set(x, y, FRONT - 1, col(x, y, FRONT));
  // keep the mouth clear (the face texture draws the mouth there)
  for (let x = -7; x <= 6; x++) for (let y = 4; y <= 11; y++) if (mouthZone(x, y)) { g.del(x, y, FRONT); if (g.has(x, y, FRONT - 1)) g.set(x, y, FRONT - 1, skin); }
}

// ---------------------------------------------------------------------------
// Torso + outfits

const PIX = {
  bolt: ['..##', '.##.', '####', '.##.', '##..'],
  panther: ['#....#', '##..##', '######', '#o##o#', '.####.', '..##..'],
  beast: ['#.#.#', '#####', '#o#o#', '.###.'],
};
const DIGITS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
};
function numberArt(n) {
  const s = String(n);
  const rows = ['', '', '', '', ''];
  for (const ch of s) for (let r = 0; r < 5; r++) rows[r] += (rows[r] ? '.' : '') + (DIGITS[ch] ?? DIGITS[0])[r];
  return rows;
}

/** Stamp a logo (2x pixels) onto the front (axis 'z') or back ('-z') of a grid, centred on x. */
export function logo(g, kind, cx, ty, axis = 'z', o = {}) {
  const art = PIX[kind] ?? numberArt(kind);
  const w = art[0].length * 2;
  const pal = kind === 'bolt' ? { '#': o.c ?? 0xff2e88 } : kind === 'panther' ? { '#': o.c ?? 0x29b6f6, o: o.c2 ?? 0xff2e88 } : kind === 'beast' ? { '#': o.c ?? 0x29b6f6, o: 0xffffff } : { '#': o.c ?? 0xffffff };
  stamp2(g, art, pal, { axis, x: Math.round(cx - w / 2), y: ty, raise: o.raise ?? 0 });
}

// torso loft keyframes: y -> half width, front z, back z, corner radius
const T_W = [[0, 11.6], [3, 11.3], [6, 10.5], [9, 11.2], [12, 12.6], [15, 13.4], [17, 13.3], [18.5, 11.8], [20, 8]];
const T_F = [[0, 7], [3, 6.8], [6, 6.5], [9, 7.3], [12, 8.2], [15, 8.1], [17, 7.4], [18.5, 6], [20, 4.5]];
const T_B = [[0, -7], [3, -6.8], [6, -6.3], [9, -6.6], [12, -7.3], [15, -7.6], [17, -7.2], [18.5, -6.2], [20, -4.6]];
const T_R = [[0, 4], [6, 4.2], [12, 5], [17, 5.8], [20, 4.5]];
function inTorso(x, y, z, t = 0) {
  const yc = y + 0.5, xc = x + 0.5, zc = z + 0.5;
  if (yc < -t || yc > 20 + t * 0.6) return false;
  const W = keys(T_W, yc) + t, F = keys(T_F, yc) + t, B = keys(T_B, yc) - t, r = keys(T_R, yc) + t * 0.5;
  const ax = Math.abs(xc);
  if (ax > W || zc > F || zc < B) return false;
  const dx = Math.max(0, ax - (W - r)), dz = Math.max(0, zc - (F - r), B + r - zc);
  return dx * dx + dz * dz <= r * r;
}
/** Front-most voxel z of the torso at (x, y). */
function fz(g, x, y) {
  for (let z = 14; z >= -2; z--) if (g.has(x, y, z)) return z;
  return 8;
}
/** Set a voxel just in front of the current surface at (x, y). */
function onFront(g, x, y, c, glow, other) {
  let z = fz(g, x, y) + 1;
  while (other?.has(x, y, z)) z++;
  g.set(x, y, z, c, glow);
  return z;
}
/** Paint the outermost surface voxel at (x, y) (front). */
function paintFront(g, x, y, c) {
  const z = fz(g, x, y);
  if (g.has(x, y, z)) g.set(x, y, z, c);
  return z;
}

export function buildBody(def) {
  const g = new VoxGrid();
  const metal = new VoxGrid();
  const outfit = def.outfit ?? 'tee';
  const shirt = def.shirt ?? 0x222233;
  const skin = def.skin ?? SKIN;
  const accent = def.accent ?? 0xffffff;
  const coat = def.coat ?? 0xf4f6fb;
  const pants = def.pants ?? 0x2b3448;
  // the base torso (shirt) with fabric shading: hem darker, shoulders lit, side seams, soft folds
  fill(g, -15, 14, 0, 21, -10, 10, (x, y, z) => inTorso(x, y, z), (x, y, z) => {
    let f = y <= 1 ? -0.08 : y >= 17 ? 0.04 : 0;
    const ax = Math.abs(x + 0.5);
    if (ax > 10.5 && Math.abs(z + 0.5) < 1.2) f -= 0.07; // side seams
    if (z >= 5 && y >= 3 && y <= 8 && (x === -6 || x === 5 || x === -2) && hash3(x, y >> 1, 1) < 0.6) f -= 0.06; // folds over the belly
    if (z <= -6 && y >= 10 && y <= 15 && Math.abs(ax - 5) < 0.6) f -= 0.05; // shoulder blades
    return f ? shade(shirt, f) : shirt;
  });
  // neck hole collar ring (shirt), with skin at the throat
  for (let x = -6; x <= 5; x++) for (let z = -4; z <= 4; z++) {
    const d = ((x + 0.5) / 6) ** 2 + ((z + 0.5) / 4.6) ** 2;
    if (d < 0.65) g.set(x, 20, z, skin);
    else if (d < 1.15) g.set(x, 20, z, shade(shirt, -0.12));
  }
  const belt = (c = 0x23201f, buckle = 0xd8dce4, h = 2) => {
    fill(g, -15, 14, 0, h - 1, -10, 10, (x, y, z) => inTorso(x, y, z, 0.6) && !inTorso(x, y, z, -0.4), (x, y) => (y === h - 1 ? c : shade(c, -0.15)));
    for (const [x0, x1] of [[-9, -8], [7, 8]]) for (let x = x0; x <= x1; x++) for (let y = 0; y < h; y++) g.set(x, y, fz(g, x, y), shade(c, 0.12)); // loops
    for (let x = -2; x <= 1; x++) for (let y = 0; y < h; y++) metal.set(x, y, fz(g, x, y) + 1, x === -2 || x === 1 || y === 0 || y === h - 1 ? buckle : shade(buckle, -0.3));
  };
  switch (outfit) {
    case 'labcoat': {
      // open coat over the shirt: lapels, collar, buttons, chest pocket + pens, side seams
      const cd = shade(coat, -0.08), ce = shade(coat, -0.16);
      fill(g, -16, 15, 0, 21, -11, 11, (x, y, z) => {
        if (!inTorso(x, y, z, 1) || inTorso(x, y, z, 0)) return false;
        const half = y >= 6 ? 2 + (y - 6) * 0.42 : 2;
        return !(z >= 3 && Math.abs(x + 0.5) <= half);
      }, (x, y, z) => {
        const ax = Math.abs(x + 0.5);
        if (ax > 11.5 && Math.abs(z + 0.5) < 1.2) return cd;
        if (z >= 5 && (x === -8 || x === 7) && y <= 10 && hash3(x, y >> 1, 3) < 0.6) return cd;
        return coat;
      });
      // lapels: raised folded strips along the V, notch at the top
      for (let y = 7; y <= 20; y++) {
        const half = 2 + (y - 6) * 0.42;
        for (const s of [-1, 1]) {
          const xi = s < 0 ? -1 - Math.ceil(half) : Math.ceil(half);
          for (let k = 0; k < 3; k++) {
            const x = xi + s * k;
            if (y > 17 && k === 2) continue;
            onFront(g, x, y, k === 0 ? ce : k === 1 ? cd : coat);
          }
        }
      }
      // stand collar around the back of the neck
      fill(g, -11, 10, 19, 22, -9, 2, (x, y, z) => inTorso(x, 19, z, 1.5) && !inTorso(x, 19, z, -1) && z < 2 && (y < 21 || z < -2), (x, y) => (y === 22 ? ce : cd));
      // buttons on the right panel
      for (const y of [3, 7]) metal.set(4, y, fz(g, 4, y) + 1, 0xd0d4dc);
      // chest pocket with pens, lower pocket flaps on the coat front
      for (let x = 4; x <= 9; x++) paintFront(g, x, 12, ce);
      for (let x = 4; x <= 9; x++) for (let y = 8; y <= 11; y++) if (x === 4 || x === 9) paintFront(g, x, y, cd);
      for (const [x, c] of [[5, def.accent ?? 0x29b6f6], [7, 0xff2e88]]) for (let y = 12; y <= 15; y++) { const z = onFront(g, x, y, y === 15 ? shade(c, 0.3) : c); if (y === 15) metal.set(x, 15, z, 0xd8dce4); }
      for (let x = -12; x <= -6; x++) paintFront(g, x, 4, ce);
      for (let x = 6; x <= 11; x++) paintFront(g, x, 4, ce);
      // back seam + vent
      for (let y = 0; y <= 18; y++) { let z = -12; while (!g.has(-1, y, z) && z < 0) z++; if (g.has(-1, y, z)) g.set(-1, y, z, cd); }
      break;
    }
    case 'hoodie': {
      const d = shade(shirt, -0.12), dd = shade(shirt, -0.24);
      // ribbed hem + cuffs feel
      g.paint((x, y) => (y <= 2 ? (x & 1 ? d : shade(shirt, -0.06)) : undefined));
      // kangaroo pocket (raised) with dark side openings and a top seam
      for (let x = -8; x <= 7; x++) for (let y = 3; y <= 9; y++) {
        const ax = Math.abs(x + 0.5);
        if (ax > 7.5 - (y - 3) * 0.25 + 1) continue;
        const z = onFront(g, x, y, y === 9 ? shade(shirt, -0.05) : shirt);
        if (ax > 6.2 - (y - 3) * 0.25 && y < 9) g.set(x, y, z, dd);
      }
      // hood bunched behind the neck and around the collar
      fill(g, -12, 11, 14, 25, -16, 3, (x, y, z) => {
        const r1 = ((x + 0.5) / 11.5) ** 2 + ((y - 19.5) / 5) ** 2 + ((z + 8.5) / 6.5) ** 2;
        const ring = ((x + 0.5) / 10) ** 2 + ((z + 0.5) / 7.5) ** 2;
        return (r1 <= 1 && z < -3) || (y >= 19 && y <= 21 && ring <= 1 && ring >= 0.5);
      }, (x, y, z) => (z < -6 && y >= 20 && Math.abs(x + 0.5) < 6 ? dd : d));
      // drawstrings with aglets
      for (let y = 10; y <= 19; y++) for (const x of [-4, 3]) onFront(g, x, y, 0xf4f4f8);
      for (const x of [-4, 3]) { onFront(g, x, 9, def.accent ?? 0x29b6f6); onFront(g, x, 8, def.accent ?? 0x29b6f6); }
      break;
    }
    case 'jersey': {
      // V collar, shoulder yokes, side panels and the number front & back
      for (let y = 13; y <= 20; y++) {
        const half = (y - 13) * 0.75 + 1;
        for (let x = -9; x <= 8; x++) {
          const ax = Math.abs(x + 0.5);
          if (ax <= half - 1.4) paintFront(g, x, y, skin);
          else if (ax <= half + 0.3) onFront(g, x, y, accent);
        }
      }
      g.paint((x, y, z, c) => (y >= 17 && Math.abs(x + 0.5) > 8 && c !== skin ? accent : undefined));
      g.paint((x, y, z, c) => (Math.abs(x + 0.5) > 10.5 && y <= 15 && Math.abs(z + 0.5) < 3 ? accent : undefined));
      g.paint((x, y, z, c) => (y <= 1 ? shade(shirt, -0.12) : undefined));
      logo(g, def.number ?? 10, -0.5, 13, 'z', { c: accent });
      logo(g, def.number ?? 10, -0.5, 15, '-z', { c: accent });
      belt(0x1a1a28);
      break;
    }
    case 'apron': {
      const ap = accent, apd = shade(ap, -0.12);
      for (let x = -9; x <= 8; x++) for (let y = 0; y <= 15; y++) {
        const ax = Math.abs(x + 0.5);
        if (y >= 11 && ax > 6.5) continue;
        onFront(g, x, y, ax > (y >= 11 ? 5.5 : 8) || y === 0 ? apd : ap);
      }
      // big front pocket with stitched divider
      for (let x = -6; x <= 5; x++) for (let y = 3; y <= 6; y++) onFront(g, x, y, y === 6 ? apd : x === -1 ? shade(ap, -0.22) : shade(ap, -0.05));
      // neck strap + waist ties with a bow at the back
      for (let y = 16; y <= 20; y++) for (const x of [-6, 5]) onFront(g, x, y, ap);
      fill(g, -15, 14, 7, 8, -10, 10, (x, y, z) => inTorso(x, y, z, 0.8) && !inTorso(x, y, z, -0.2) && z < 4, apd);
      blob(g, -4, 8, -9, 2.6, 1.8, 1, shade(ap, -0.04)); blob(g, 3, 8, -9, 2.6, 1.8, 1, shade(ap, -0.04));
      blob(g, -0.5, 8, -9.5, 1, 1.2, 1, apd);
      capsule(g, [-2, 7, -9], [-4, 1, -9], 0.8, 0.6, apd);
      capsule(g, [1, 7, -9], [3, 2, -9], 0.8, 0.6, apd);
      break;
    }
    case 'suit': {
      // jacket: white shirt V, tie, notched lapels, buttons, pocket square, belt
      for (let y = 8; y <= 20; y++) {
        const half = 0.8 + (y - 8) * 0.5;
        for (let x = -10; x <= 9; x++) if (Math.abs(x + 0.5) <= half) paintFront(g, x, y, y >= 19 ? 0xe8ecf4 : 0xffffff);
      }
      for (let y = 7; y <= 19; y++) {
        const w = y >= 17 ? 1.5 : y <= 8 ? 0.6 : 1 + (17 - y) * 0.06;
        for (let x = -2; x <= 1; x++) if (Math.abs(x + 0.5) <= w) onFront(g, x, y, y >= 17 ? shade(accent, -0.15) : accent);
      }
      for (let y = 8; y <= 20; y++) {
        const half = Math.ceil(0.8 + (y - 8) * 0.5);
        for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) {
          if (y >= 18 && k === 2) continue;
          onFront(g, s < 0 ? -half - k : half + k - 1, y, shade(shirt, k === 1 ? 0.14 : 0.06));
        }
      }
      for (const y of [3, 6]) metal.set(-1, y, fz(g, -1, y) + 1, 0xc8ccd8);
      for (const [x, y, c] of [[6, 13, 0xffffff], [7, 13, accent], [8, 13, 0xffffff], [7, 14, 0xffffff]]) onFront(g, x, y, c);
      for (let x = 5; x <= 9; x++) paintFront(g, x, 12, shade(shirt, -0.15));
      belt(0x15151c, 0xffd23f);
      break;
    }
    case 'vest': {
      for (let x = -12; x <= 11; x++) for (let y = 0; y <= 17; y++) if (Math.abs(x + 0.5) > 2) onFront(g, x, y, y >= 4 && y <= 5 ? 0xe8e8e8 : accent);
      for (let y = 0; y <= 17; y++) for (const x of [-3, 2]) onFront(g, x, y, shade(accent, -0.25));
      break;
    }
    case 'mech': {
      // armoured space exosuit: sculpted chest plate, power core, bolt, segmented abs, collar ring, back plate
      const A = def.coat ?? 0xeef2f8, Ad = shade(A, -0.16), Ae = shade(A, -0.34);
      const glow = def.glow ?? 0x3fd2ee;
      fill(g, -16, 15, 6, 20, -2, 12, (x, y, z) => inTorso(x, y, z, 1.6) && !inTorso(x, y, z, 0) && z >= 1 && y >= 6, (x, y, z) => {
        const ax = Math.abs(x + 0.5);
        if (y <= 7) return Ad;
        if (ax > 11.5) return shade(A, -0.07);
        if (ax < 0.8 && y < 15) return Ad; // centre seam
        return A;
      });
      for (let y = 9; y <= 17; y++) for (const x of [-12, 11]) onFront(g, x, y, accent);
      // power core
      for (let x = -5; x <= 4; x++) for (let y = 7; y <= 12; y++) {
        const edge = x === -5 || x === 4 || y === 7 || y === 12;
        if (edge) onFront(g, x, y, Ae);
      }
      for (let x = -4; x <= 3; x++) for (let y = 8; y <= 11; y++) { const z = fz(g, x, y); g.set(x, y, z + 1, x === -4 || x === 3 || y === 8 || y === 11 ? shade(glow, -0.35) : glow, !(x === -4 || x === 3 || y === 8 || y === 11)); }
      logo(g, 'bolt', -0.5, 18, 'z', { c: accent, raise: 1 });
      // segmented abs + belt
      for (let y = 1; y <= 5; y++) for (let x = -8; x <= 7; x++) onFront(g, x, y, y === 1 ? Ae : (((y - 1) >> 1) + (x > -1 ? 1 : 0)) % 2 ? A : Ad);
      g.paint((x, y, z, c) => (y === 0 ? Ae : undefined));
      metal.set(-1, 0, fz(g, -1, 0) + 1, 0xc8d0dc); metal.set(0, 0, fz(g, 0, 0) + 1, 0xc8d0dc);
      // collar ring
      for (let x = -9; x <= 8; x++) for (let z = -7; z <= 6; z++) {
        const d = ((x + 0.5) / 8.5) ** 2 + ((z + 0.5) / 6.5) ** 2;
        if (d <= 1 && d >= 0.62) for (let y = 20; y <= 21; y++) metal.set(x, y, z, (x + z) % 3 ? 0xaab4c4 : 0x7a8496);
      }
      // back plate with vents
      fill(g, -11, 10, 4, 18, -11, -6, (x, y, z) => inTorso(x, y, z, 1.4) && !inTorso(x, y, z, 0) && z < -5, A);
      for (const y of [8, 13]) for (let x = -6; x <= 5; x++) { let z = -12; while (!g.has(x, y, z) && z < -4) z++; g.set(x, y, z, Ae); }
      break;
    }
    default: {
      // tee: ribbed collar, sleeve seams, hem, belt with buckle
      for (let x = -7; x <= 6; x++) for (let z = -5; z <= 5; z++) {
        const d = ((x + 0.5) / 6.6) ** 2 + ((z + 0.5) / 5.2) ** 2;
        if (d >= 0.7 && d <= 1.25) g.set(x, 20, z, shade(shirt, -0.2));
      }
      g.paint((x, y) => (y <= 2 ? pants : undefined));
      belt(0x2a2018);
    }
  }
  if (def.logo && outfit !== 'mech') {
    const big = outfit === 'hoodie' || outfit === 'tee';
    if (outfit === 'labcoat') logo(g, def.logo, -6, 15, 'z', { raise: 1 });
    else if (big) logo(g, def.logo, -0.5, 16, 'z', { raise: 0 });
    else if (outfit !== 'jersey') logo(g, def.logo, -7, 16, 'z', { raise: 0 });
  }
  for (const a of def._acc ?? []) if (accSlot(a) === 'torso') buildAccessory(a, 'torso', g, metal, def);
  return { g, metal };
}

/** Coat tails / skirt hanging from the waist (pivot at the torso origin). */
export function buildTail(def) {
  const outfit = def.outfit ?? 'tee';
  const g = new VoxGrid();
  if (outfit === 'labcoat') {
    const coat = def.coat ?? 0xf4f6fb, cd = shade(coat, -0.08), ce = shade(coat, -0.16);
    for (let y = -12; y <= 3; y++) {
      const flare = y < 0 ? (-y) * 0.12 : 0;
      for (let x = -16; x <= 15; x++)
        for (let z = -12; z <= 12; z++) {
          const t = 1.2 + flare;
          if (!inTorso(x, 1, z, t) || inTorso(x, 1, z, t - 1.3)) continue;
          const ax = Math.abs(x + 0.5);
          if (z >= 3 && ax <= 2.2 - y * 0.08) continue; // open front
          let c = y <= -12 ? ce : coat;
          if (ax > 11.5 + flare && Math.abs(z + 0.5) < 1.5) c = cd; // side seams
          if (z < -4 && Math.abs(x + 0.5) < 1 && y < -2) c = ce; // back vent
          if (y <= -3 && (x + 40) % 7 === 0 && z > -6) c = shade(c, -0.05); // long folds
          g.set(x, y, z, c);
        }
    }
    // lower pockets (raised flaps)
    for (const [x0, x1] of [[-12, -6], [5, 11]]) for (let x = x0; x <= x1; x++) for (let y = -4; y <= -1; y++) {
      let z = 14; while (!g.has(x, y, z) && z > 0) z--;
      if (g.has(x, y, z)) g.set(x, y, z + (y === -1 ? 1 : 0), y === -1 ? ce : x === x0 || x === x1 ? cd : coat);
    }
  }
  return g.size ? { g } : null;
}

/** Cape from the shoulders (pivot at the back of the neck). */
export function buildCape(def, a) {
  const g = new VoxGrid();
  const c = a.color ?? def.accent ?? 0xff2e88;
  const lining = a.lining ?? shade(c, -0.25);
  for (let y = -34; y <= 0; y++) {
    const w = 12 + Math.floor(-y / 4);
    for (let x = -w; x <= w - 1; x++) {
      const wave = Math.round(Math.sin(x * 0.42) * 1.1);
      const hem = y <= -33 + ((x + 40) % 3 === 0 ? 1 : 0);
      g.set(x, y, wave, hem ? shade(c, -0.15) : (x + 40) % 6 === 0 ? shade(c, -0.07) : c);
      g.set(x, y, wave + 1, lining);
    }
  }
  for (let x = -12; x <= 11; x++) for (let z = 1; z <= 4; z++) g.set(x, 1 + (z > 2 ? 1 : 0), z, shade(c, -0.1));
  if (a.logo !== false) logo(g, 'bolt', -0.5, -9, '-z', { c: a.logoColor ?? 0xffd23f });
  return { g };
}

/** Backpack (torso back). */
export function buildBackpack(g, def, a) {
  const c = a.color ?? def.accent ?? 0xff2e88, d = shade(c, -0.14);
  blob(g, -0.5, 10, -12.5, 9.5, 8.5, 4.2, c, { p: 3.2 });
  blob(g, -0.5, 6, -16.5, 7, 4.5, 1.6, d, { p: 3 }); // front pocket
  for (let x = -7; x <= 6; x++) g.set(x, 10, -18, 0x333344); // zip
  g.set(5, 10, -19, 0xd0d4dc);
  logo(g, 'bolt', -0.5, 8, '-z', { c: a.logo ?? 0xffd23f });
  for (const x of [-8, -7, 6, 7]) {
    for (let z = -9; z <= 8; z++) if (inTorso(x, 19, z, 1.2) && !inTorso(x, 19, z, 0)) g.set(x, 19, z, 0x2a2a3a);
    for (let y = 5; y <= 18; y++) g.set(x, y, fz(g, x, y) + 1, 0x2a2a3a);
  }
  capsule(g, [-3, 19, -12], [2, 19, -12], 1, 1, d); // handle
}

// ---------------------------------------------------------------------------
// Arms / hands / legs

function sleeveInfo(def) {
  const o = def.outfit ?? 'tee';
  if (o === 'mech') return { color: def.shirt ?? 0x26304a, long: true, cuff: shade(def.coat ?? 0xeef2f8, -0.3), mech: true };
  if (o === 'labcoat') return { color: def.coat ?? 0xf4f6fb, long: true, cuff: shade(def.coat ?? 0xf4f6fb, -0.12) };
  if (o === 'hoodie') return { color: def.sleeve ?? def.shirt ?? 0x222233, long: true, cuff: shade(def.sleeve ?? def.shirt ?? 0x222233, -0.16), rib: true };
  if (o === 'suit') return { color: def.shirt ?? 0x222233, long: true, cuff: 0xffffff };
  if (o === 'jersey') return { color: def.shirt ?? 0x222233, long: false, trim: def.accent ?? 0xffffff };
  return { color: def.sleeve ?? def.shirt ?? 0x222233, long: !!def.longSleeves, trim: shade(def.sleeve ?? def.shirt ?? 0x222233, -0.15) };
}

export function buildUpperArm(def, side) {
  const g = new VoxGrid();
  const metal = new VoxGrid();
  const sl = sleeveInfo(def);
  const skin = def.skin ?? SKIN;
  const cFn = (x, y, z) => {
    if (!sl.long && y <= -5) return skin;
    if (!sl.long && y === -4) return sl.trim;
    if (sl.long && (x === (side < 0 ? -4 : 3)) && y <= -2 && y >= -6 && hash3(x, y >> 1, z) < 0.4) return shade(sl.color, -0.08); // creases
    return y >= 1 ? shade(sl.color, 0.04) : sl.color;
  };
  // deltoid cap + tapered upper arm
  blob(g, -0.5 + side * 0.4, -0.5, -0.5, 4.6, 4.2, 4.4, cFn, { p: 2.2 });
  capsule(g, [-0.5, -1, -0.5], [-0.5, -8, -0.5], 3.7, 3.2, cFn);
  if (sl.mech) {
    const A = def.coat ?? 0xeef2f8;
    blob(g, -0.5 + side * 0.9, 0, -0.5, 5.8, 4.6, 5.6, (x, y) => (y <= -3 ? shade(A, -0.16) : A), { p: 2.6, clip: (x, y) => y < -4 });
    for (let z = -4; z <= 3; z++) g.set(side < 0 ? -7 : 6, 0, z, def.accent ?? 0xff2e88);
    for (let z = -4; z <= 3; z++) g.set(side < 0 ? -7 : 6, 1, z, def.accent ?? 0xff2e88);
  }
  for (const a of def._acc ?? []) if (accSlot(a) === 'upper') buildAccessory(a, 'upper', g, metal, def, side);
  return { g, metal };
}

export function buildForearm(def, side) {
  const g = new VoxGrid();
  const metal = new VoxGrid();
  const sl = sleeveInfo(def);
  const skin = def.skin ?? SKIN;
  const c = sl.long ? sl.color : skin;
  capsule(g, [-0.5, 0, -0.5], [-0.5, -4, -0.5], 3.5, 3.5, c);
  capsule(g, [-0.5, -4, -0.5], [-0.5, -7.2, -0.5], 3.5, 3, c);
  if (sl.long) {
    // cuff: a slightly flared band at the wrist
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) for (let y = -8; y <= -6; y++) {
      const d = Math.hypot(x + 0.5 + 0.5, z + 0.5 + 0.5);
      if (d <= 3.6 && d >= 2) g.set(x, y, z, sl.rib && (x + z) & 1 ? shade(sl.cuff, -0.06) : sl.cuff);
    }
    for (let z = -3; z <= 2; z++) if (hash3(side, z, 5) < 0.5) g.set(side < 0 ? -4 : 3, -3, z, shade(c, -0.07));
  }
  if (sl.mech) {
    const A = def.coat ?? 0xeef2f8;
    capsule(g, [-0.5, -1.5, -0.5], [-0.5, -6, -0.5], 4.3, 3.9, (x, y) => (y <= -6 ? shade(A, -0.3) : y >= -2 ? shade(A, -0.12) : A));
    const ox = side < 0 ? -5 : 4;
    for (const z of [-2, -1, 0, 1]) { g.set(ox, -3, z, def.glow ?? 0x3fd2ee, true); g.set(ox, -4, z, shade(A, -0.3)); }
  }
  const me = side < 0 ? 'L' : 'R';
  for (const a of def._acc ?? []) {
    if (accSlot(a) !== 'fore') continue;
    const s = a.side ?? 'L';
    if (s === me || s === 'both') buildAccessory(a, 'fore', g, metal, def, side);
  }
  return { g, metal };
}

export const HAND_SHAPES = ['open', 'fist', 'point', 'thumb', 'peace'];

/** Hand at the wrist (palm faces inwards, thumb towards +z, fingers down -y). */
export function buildHand(def, shape, side, item) {
  const g = new VoxGrid();
  const metal = new VoxGrid();
  const c = def.gloves ?? def.skin ?? SKIN;
  const d = shade(c, -0.1), dd = shade(c, -0.2), lt = shade(c, 0.06);
  const inward = side < 0 ? 1 : -1; // palm side (+x for the left hand)
  // wrist
  capsule(g, [-0.5, 0.5, -0.5], [-0.5, -1, -0.5], 2.5, 2.6, c);
  if (shape === 'open') {
    // relaxed open hand: a chunky palm, fingers held together (grooves between them,
    // the middle finger longest, rounded tips with lighter nails) and a thumb angled forward
    const outer = side < 0 ? -3 : 2; // back of the hand
    const tips = [-9, -10, -10, -9]; // pinky .. index (z -3 .. 2 in pairs)
    for (let x = -3; x <= 2; x++) for (let y = -10; y <= -1; y++) for (let z = -3; z <= 2; z++) {
      const f = Math.min(3, Math.max(0, Math.floor((z + 3) / 1.5)));
      if (y < tips[f]) continue;
      const ex = x === -3 || x === 2, ez = z === -3 || z === 2;
      if (ex && ez) continue;
      if (y <= -7 && ex) continue; // fingers thinner than the palm
      if (y === tips[f] && (ex || ez || x === (side < 0 ? 1 : -2))) continue; // round the tips
      if (y === -1 && (ex || ez)) continue;
      let col = c;
      if (y <= -7 && (z === -2 || z === 0) && x === outer + (side < 0 ? 1 : -1)) col = dd; // finger grooves
      if (y <= -7 && (z === -2 || z === 0) && x !== outer + (side < 0 ? 1 : -1)) col = d;
      if (y === tips[f] + (y === tips[f] ? 0 : 0) && y <= -9) col = lt;
      if (y === -6 && x === outer + (side < 0 ? 1 : -1)) col = d; // knuckle line
      if (x === -outer - 1 && y <= -3 && y >= -6) col = d; // palm crease side
      g.set(x, y, z, col);
    }
    capsule(g, [-0.5, -2.5, 2.6], [-0.5 + inward * 0.8, -6, 5], 1.5, 1.2, c);
    g.set(-1, -6, 5, lt); g.set(0, -6, 5, lt);
  } else {
    // fist: rounded block, finger rolls on the front, knuckle ridge
    for (let x = -3; x <= 2; x++) for (let y = -7; y <= -1; y++) for (let z = -3; z <= 3; z++) {
      const ex = x === -3 || x === 2, ey = y === -7 || y === -1, ez = z === -3 || z === 3;
      if (y === -1 && (ex || ez)) continue;
      if ((ex && ey) || (ex && ez) || (ey && ez)) continue;
      let col = c;
      if (x === (side < 0 ? 2 : -3) && y <= -3) col = (z + 10) % 2 ? d : c; // curled fingers (palm side)
      if (y === -7) col = (z + 10) % 2 ? dd : d; // knuckle ridge
      g.set(x, y, z, col);
    }
    const tz = 4;
    if (shape === 'thumb') capsule(g, [-0.5, -2.5, 3], [-0.5, -2.2, 8.5], 1.5, 1.3, c);
    else for (let y = -5; y <= -2; y++) for (let x = -1; x <= 0; x++) g.set(x + (side < 0 ? 1 : 0), y, tz, y === -5 ? lt : c); // thumb across the fingers
    if (shape === 'point') {
      for (let y = -8; y >= -13; y--) for (let x = -1; x <= 0; x++) for (let z = 1; z <= 2; z++) g.set(x, y, z, y === -13 ? lt : (y + 20) % 3 === 0 ? d : c);
    }
    if (shape === 'peace') {
      capsule(g, [-0.5, -7, 1.5], [-0.5, -13, 4], 1.1, 1, c);
      capsule(g, [-0.5, -7, -1.5], [-0.5, -13, -4], 1.1, 1, d);
    }
  }
  if (item) buildAccessory(item, 'hand', g, metal, def, side);
  return { g, metal };
}

export function buildThigh(def) {
  const g = new VoxGrid();
  const pants = def.pants ?? 0x2b3448;
  const skin = def.skin ?? SKIN;
  const pd = shade(pants, -0.1);
  capsule(g, [-0.5, 0, -0.5], [-0.5, -9, -0.5], 4.7, 4.1, (x, y, z) => {
    if (def.shorts && y <= -5) return y === -5 ? pd : skin;
    if (z >= 3 && (x === -2 || x === 1) && y <= -3 && y >= -6) return pd; // front crease
    if (Math.abs(x + 0.5) >= 4 && Math.abs(z + 0.5) < 1) return pd; // side seam
    return pants;
  });
  if (def.outfit === 'mech') capsule(g, [-0.5, -1.5, 3.5], [-0.5, -6.5, 3.5], 2.8, 2.4, (x, y) => (y >= -2 ? shade(def.coat ?? 0xeef2f8, -0.15) : def.coat ?? 0xeef2f8));
  return { g };
}

export function buildShin(def) {
  // built with the sole at y = -8, then dropped 1 voxel (the shin is 9 voxels long) with the top refilled
  const r = buildShin8(def);
  const g = new VoxGrid().merge(r.g, 0, -1, 0);
  const top = def.outfit === 'mech' ? def.pants ?? 0x2b3448 : def.shorts ? def.skin ?? SKIN : def.pants ?? 0x2b3448;
  capsule(g, [-0.5, 0, -0.5], [-0.5, -1, -0.5], 3.9, 3.9, top);
  return { g };
}
function buildShin8(def) {
  const g = new VoxGrid();
  const pants = def.pants ?? 0x2b3448;
  const skin = def.skin ?? SKIN;
  const shoe = def.shoes ?? 0xf2f2f2;
  const white = shoe === 0xffffff || shoe === 0xf2f2f2 || shoe === 0xf4f4f4;
  const sole = def.sole ?? (white ? 0xd8dce4 : 0xf4f4f4);
  const lace = def.laces ?? (white ? 0x29b6f6 : 0xffffff);
  const acc = def.accent ?? 0xff2e88;
  if (def.outfit === 'mech') {
    // armoured jet boots: knee pad, tall boot, toe cap, heel thruster
    const A = def.shoes ?? def.coat ?? 0xeef2f8, Ad = shade(A, -0.16), Ae = shade(A, -0.34);
    capsule(g, [-0.5, 0, -0.5], [-0.5, -3, -0.5], 3.9, 3.9, pants);
    blob(g, -0.5, -0.5, 3.5, 3.2, 2.6, 1.6, def.coat ?? 0xeef2f8, { p: 2.4 });
    g.set(-1, -1, 5, acc); g.set(0, -1, 5, acc); g.set(-1, 0, 5, acc); g.set(0, 0, 5, acc);
    for (let x = -5; x <= 4; x++) for (let y = -8; y <= -2; y++) for (let z = -6; z <= 8; z++) {
      if (!inRB(x, y, z, -5, -8, -6, 4, y > -5 ? -2 : -4, y > -5 ? 4 : 8, 2)) continue;
      g.set(x, y, z, y === -8 ? Ae : y === -4 && z > 4 ? Ad : (x === -5 || x === 4) && y === -6 ? acc : A);
    }
    for (let x = -2; x <= 1; x++) { g.set(x, -6, -7, Ae); g.set(x, -7, -7, Ae); }
    for (let x = -1; x <= 0; x++) { g.set(x, -6, -8, 0xff8a2a, true); g.set(x, -7, -8, 0xffb05a, true); }
    return { g };
  }
  // shin + pant leg with a stacked hem
  capsule(g, [-0.5, 0, -0.5], [-0.5, -4, -0.5], 3.9, 3.5, def.shorts ? skin : pants);
  if (def.shorts) {
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) for (let y = -5; y <= -3; y++) if (Math.hypot(x + 1, z + 1) <= 3.9) g.set(x, y, z, def.socks ?? 0xffffff);
  } else {
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) for (let y = -5; y <= -4; y++) {
      const dd = Math.hypot(x + 1, z + 1);
      if (dd <= 4.1 && dd >= 2.4) g.set(x, y, z, y === -5 ? shade(pants, -0.16) : shade(pants, -0.06));
    }
    g.set(-5, -2, 0, shade(pants, -0.1)); g.set(4, -1, -1, shade(pants, -0.1));
  }
  // chunky sneaker: two-tone sole, toe box, tongue, crossed laces, heel tab, side stripe
  const sh = shade(shoe, -0.07), shd = shade(shoe, -0.2);
  for (let x = -4; x <= 3; x++) for (let y = -8; y <= -4; y++) for (let z = -5; z <= 8; z++) {
    const ax = Math.abs(x + 0.5);
    const zc = z + 0.5;
    // foot outline from the top: narrower heel, round toe
    const halfW = zc > 5 ? 3.6 - (zc - 5) * 0.5 : zc < -3 ? 3.4 - (-3 - zc) * 0.6 : 3.8;
    if (ax > halfW + 0.2) continue;
    // side profile: low toe box sloping up to the collar at the ankle
    const topY = zc > 3 ? -6.5 + Math.max(0, 6.5 - zc) * 0.5 : -4;
    if (y + 0.5 > topY + 0.6) continue;
    if (y === -8) g.set(x, y, z, shade(sole, -0.12));
    else if (y === -7) g.set(x, y, z, zc > 6 || zc < -3.5 ? sole : (z + 20) % 3 === 0 ? shade(sole, -0.06) : sole);
    else g.set(x, y, z, zc > 5.5 ? sh : shoe);
  }
  // tongue + laces
  for (let z = 0; z <= 4; z++) for (let x = -2; x <= 1; x++) {
    const top = z <= 2 ? -4 : -5;
    g.set(x, top, z, (z + x + 20) % 2 === 0 && x >= -1 && x <= 0 ? lace : sh);
  }
  for (const z of [1, 3]) for (let x = -2; x <= 1; x++) g.set(x, z === 1 ? -3 : -4, z, lace);
  for (let x = -1; x <= 0; x++) g.set(x, -3, -1, sh); // tongue tip
  // heel tab (accent) + side stripe
  for (let y = -6; y <= -3; y++) for (let x = -1; x <= 0; x++) g.set(x, y, -6, acc);
  for (const s of [-1, 1]) {
    const x = s < 0 ? -5 : 4;
    for (let z = -2; z <= 4; z++) { const y = z <= 1 ? -5 : -6; g.set(x, y, z, shd); }
    g.set(x, -6, -3, shd); g.set(x, -6, -2, shd);
  }
  return { g };
}
