// In-battle Base upgrade tiers. Every battle each side's Base starts as a
// scrappy Camp Tent and is upgraded mid-battle (costs POWER) through six tiers,
// each bigger and more high-tech than the last:
//   1 Camp Tent -> 2 Lab Shack -> 3 Trailer Lab -> 4 Field Lab -> 5 Beast Lab -> 6 Mega HQ
//
// makeBase() returns the same shape as makeLabBuilding() (lab.js) so the battle
// view can swap one for the other: { root, seat, core, meshes, height, width,
// setDamage(f), update(dt), onChunk, setLevel(n) } (+ tier, front, bounds).
//
// Canonical modelling frame (voxel units, V world units each): the Base's front
// faces +X (towards the enemy; the front face sits at x = FRONT -> 1.68 units),
// the detailed facade faces +Z (the battle camera), y = 0 is the ground and the
// local origin is the Base centre (x = ±LAB_X in the battle). Everything stays
// within x in [-2.6, 2.6], z in [-3, 1.6]; nothing tall goes in front of z = 1.6.
// The rival side is the mirror image (flip) with red / graphite accents; text is
// drawn mirror-imaged before the flip so it reads correctly.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { rbox, cyl, capsule, blob, stamp, shade, n3 } from '../kit.js';
import { PAL, mixHex, hash3, mulberry32, clamp, vnoise, ring, text, textW, mirrorGrid, glassMat, glowMat, tintMat, hazardC } from './common.js';
import { panelBox, windowZ, windowX, dishGrid, antennaGrid, pipe, hazard, signZ, boltEmblem, barrel, crate } from './labParts.js';
import { makeLabBuilding } from './lab.js';

const V = 0.08; // world units per voxel
const FRONT = 21; // front face plane in voxels (front-most facade voxels at x = 20)
export const BASE_VOXEL = V;
export const BASE_FRONT = FRONT * V;

export const BASE_TIERS = [
  { tier: 1, name: 'Camp Tent', desc: 'A scrappy tent, a tarp, a cooler and one tiny battery. Everyone starts somewhere!' },
  { tier: 2, name: 'Lab Shack', desc: 'Plywood walls, a tin roof, a frying-pan satellite dish and a noisy generator.' },
  { tier: 3, name: 'Trailer Lab', desc: 'A camper trailer turned mobile lab: solar panel, antenna and bubbling glassware.' },
  { tier: 4, name: 'Field Lab', desc: 'A prefab modular lab with a bubbling energy tank, vent fans and spinning beacons.' },
  { tier: 5, name: 'Beast Lab', desc: 'The full MrBeast Lab: glowing energy core, control tower and a giant satellite dish.' },
  { tier: 6, name: 'Mega HQ', desc: 'A towering fortress-lab with twin reactors, force-field pylons and a giant bolt spire.' },
];

// ---------------------------------------------------------------------------
// Palettes (side 0 = MrBeast Lab blue/white, side 1 = rival red/graphite)
const TEAM = [
  {
    m: 0x29b6f6, md: 0x1477c9, mdd: 0x0d4f8a, ml: 0x8fe3ff, glow: 0x7ae8ff, en: 0x3fd6ff,
    w: 0xf4f6fa, w2: 0xe2e8f0, seam: 0xb4bfd0, dk: 0x3d4352,
    tarp: 0x2f8fe0, tarpD: 0x1f64a8, tarpL: 0x6ab8f4,
    bolt: 0xff2e88, boltL: 0xff8ac0, boltD: 0xc2185b,
  },
  {
    m: 0xff3d55, md: 0xb8202e, mdd: 0x6e1420, ml: 0xffa0ac, glow: 0xff8a6a, en: 0xff5a3a,
    w: 0x7a7488, w2: 0x6a6478, seam: 0x433d50, dk: 0x2a2534,
    tarp: 0xe8343c, tarpD: 0xa8202a, tarpL: 0xff7a80,
    bolt: 0xffd23f, boltL: 0xffe680, boltD: 0xc8901a,
  },
];

const INK = PAL.ink, WOOD = 0x9a6234, WOOD_D = 0x6e4224, WOOD_L = 0xc48a52, ROPE = 0xd8c08a;
const METAL = PAL.metal, METAL_L = PAL.metalL, METAL_D = PAL.metalD, METAL_DD = PAL.metalDD;
const CHAR = 0x231a20, INNER = 0x3a3346;
const WARM = 0xffd27a;

// ---------------------------------------------------------------------------
// Small brushes

/** Draw pixel text (each glyph optionally wobbled for a hand-painted look). Mirror-aware. */
function paint(g, str, x, y, z, face, color, o = {}) {
  const s = o.scale ?? 1;
  const chars = [...str];
  const ws = chars.map((ch) => textW(ch, s, 0));
  const gap = (o.gap ?? 1) * s;
  const W = ws.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  const c0 = o.center ? Math.floor(W / 2) : 0;
  const opt = { scale: s, sy: o.sy, mirror: o.mirror, glow: o.glow, depth: o.depth };
  let u = 0;
  chars.forEach((ch, i) => {
    const wob = o.wobble ? Math.round((hash3(i, 7, o.seed ?? 3) - 0.5) * 2 * o.wobble) : 0;
    const uu = (o.mirror ? W - u - ws[i] : u) - c0;
    if (face === '+z') text(g, ch, x + uu, y + wob, z, face, color, opt);
    else if (face === '-z') text(g, ch, x - uu, y + wob, z, face, color, opt);
    else if (face === '+x') text(g, ch, x, y + wob, z - uu, face, color, opt);
    else text(g, ch, x, y + wob, z + uu, face, color, opt);
    u += ws[i] + gap;
  });
  return W;
}

/** The MrBeast lightning bolt as pixel art (5x7) + a 3x5 mini version. */
const BOLT = ['...##', '..##.', '.##..', '#####', '..##.', '.##..', '##...'];
const BOLT_MINI = ['..#', '.#.', '###', '.#.', '#..'];
/** Stamp pixel art on a +Z plane (top-left at x,y; rows go down). mirror pre-flips it for mirrored grids. */
function artZ(g, art, x, y, z, col, o = {}) {
  const s = o.scale ?? 1;
  art.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.' || ch === ' ') return;
    const cc = o.mirror ? row.length - 1 - c : c;
    const color = typeof col === 'object' ? col[ch] : col;
    if (color === undefined) return;
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) g.set(x + cc * s + a, y - r * s - b, z, color, !!o.glow);
  }));
}
const boltZ = (g, x, y, z, col, o = {}) => artZ(g, BOLT, x, y, z, col, o);

/** Rope / cable line with a slight sag. */
function sagLine(g, a, b, col, sag = 1.5, thick = 0) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, z = a[2] + (b[2] - a[2]) * t;
    if (thick) g.box(Math.round(x), Math.round(y), Math.round(z), Math.round(x) + thick, Math.round(y), Math.round(z), col);
    else g.set(Math.round(x), Math.round(y), Math.round(z), col);
  }
  return g;
}

/** Simple vertical pole. */
const pole = (g, x, y0, y1, z, col = WOOD) => g.box(x, y0, z, x, y1, z, col);

// ---------------------------------------------------------------------------
// Grid processing (hollowing, battle damage, rubble)

/** Remove voxels buried deeper than `d` (keeps a skin; cheaper builds/damage). */
function hollow(g, d = 2) {
  const kill = [];
  g.forEach((x, y, z) => {
    for (let i = 1; i <= d; i++) {
      if (!g.has(x + i, y, z) || !g.has(x - i, y, z) || !g.has(x, y + i, z) || !g.has(x, y - i, z) || !g.has(x, y, z + i) || !g.has(x, y, z - i)) return;
    }
    if (!g.has(x + 1, y + 1, z) || !g.has(x - 1, y - 1, z) || !g.has(x, y + 1, z + 1) || !g.has(x, y - 1, z - 1) || !g.has(x + 1, y, z + 1) || !g.has(x - 1, y, z - 1)) return;
    kill.push(x, y, z);
  });
  for (let i = 0; i < kill.length; i += 3) g.del(kill[i], kill[i + 1], kill[i + 2]);
  for (let i = 0; i < kill.length; i += 3) {
    const x = kill[i], y = kill[i + 1], z = kill[i + 2];
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const c = g.get(x + dx, y + dy, z + dz);
      if (c !== undefined && c !== INNER) g.set(x + dx, y + dy, z + dz, INNER);
    }
  }
  return g;
}

/** Progressive battle damage: scorch, cracks, bitten-out chunks. Deterministic per stage. */
function damageGrid(src, stage, seed = 7) {
  const g = src.clone();
  const b = g.bounds();
  const H = b.maxY - b.minY;
  const size = Math.max(8, Math.min(b.maxX - b.minX, H));
  const R = mulberry32(seed);
  const vox = [];
  g.forEach((x, y, z, c, gl) => vox.push([x, y, z, c, gl]));
  const isSurf = (x, y, z) => g.has(x, y, z) && (!g.has(x + 1, y, z) || !g.has(x - 1, y, z) || !g.has(x, y + 1, z) || !g.has(x, y - 1, z) || !g.has(x, y, z + 1) || !g.has(x, y, z - 1));
  const cands = [];
  for (const [x, y, z] of vox) {
    if (y < b.minY + H * 0.25) continue;
    let empty = 0;
    if (!src.has(x + 1, y, z)) empty++; if (!src.has(x - 1, y, z)) empty++; if (!src.has(x, y + 1, z)) empty++;
    if (!src.has(x, y, z + 1)) empty++; if (!src.has(x, y, z - 1)) empty++;
    if (empty >= 2) cands.push([x, y, z]);
  }
  const k = size / 40; // scale bites with the building size
  const bites = [];
  for (let i = 0; i < 18 && cands.length; i++) bites.push([cands[Math.floor(R() * cands.length)], (1.4 + R() * 2.2) * Math.max(0.6, k)]);
  const cracks = [];
  for (let i = 0; i < 14 && cands.length; i++) cracks.push([cands[Math.floor(R() * cands.length)], Math.floor((8 + R() * 14) * Math.max(0.6, k)), R() * 1000]);
  const thr = [0, 0.2, 0.31, 0.44][stage];
  for (const [x, y, z, c, gl] of vox) {
    const n = vnoise(x * 0.15 + 3.1, y * 0.15, z * 0.15 + 7.7);
    if (n < thr) {
      const t = clamp((thr - n) / 0.1, 0, 1);
      g.set(x, y, z, mixHex(c, CHAR, 0.3 + 0.5 * t), gl && t < 0.4);
    }
  }
  const nCr = [0, 4, 8, 14][stage];
  const moves = [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1], [0, 1, 0]];
  for (let i = 0; i < nCr && i < cracks.length; i++) {
    let [[x, y, z], len, s] = cracks[i];
    const r2 = mulberry32(Math.floor(s));
    for (let j = 0; j < len; j++) {
      if (g.has(x, y, z)) g.set(x, y, z, 0x15101a);
      const opts = moves.filter(([dx, dy, dz]) => isSurf(x + dx, y + dy, z + dz));
      if (!opts.length) break;
      const [dx, dy, dz] = opts[Math.floor(r2() * opts.length)];
      x += dx; y += dy; z += dz;
    }
  }
  const nB = [0, 3, 8, 16][stage];
  for (let i = 0; i < nB && i < bites.length; i++) {
    const [[cx, cy, cz], r0] = bites[i];
    const r = r0 * (0.7 + stage * 0.35);
    const rr = r * r, ro = (r + 1.6) * (r + 1.6);
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++)
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
        for (let z = Math.floor(cz - r - 2); z <= cz + r + 2; z++) {
          const d = (x - cx) ** 2 + (y - cy) ** 2 * 1.2 + (z - cz) ** 2;
          const jag = hash3(x, y, z) * 2.2;
          if (d < rr + jag) g.del(x, y, z);
          else if (d < ro && g.has(x, y, z)) g.set(x, y, z, mixHex(g.get(x, y, z), CHAR, 0.55), false);
        }
  }
  return g;
}

/** Rubble pile left when the Base is destroyed (ellipse over the footprint). */
function rubbleGrid(cols, bb, hMax, seed = 3) {
  const g = new VoxGrid();
  const R = mulberry32(seed);
  const pick = () => cols[Math.floor(R() * cols.length)];
  const cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
  const rx = Math.max(6, (bb.maxX - bb.minX) / 2), rz = Math.max(6, (bb.maxZ - bb.minZ) / 2);
  for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++) {
      const d = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
      if (d > 1.02) continue;
      const h = Math.max(0, Math.round((1 - d) * hMax * (0.5 + 0.8 * vnoise(x * 0.22, 1, z * 0.22))));
      for (let y = 0; y <= h; y++) g.set(x, y, z, hash3(x >> 1, y, z >> 1) < 0.1 ? CHAR : cols[Math.floor(hash3(x >> 2, y >> 1, z >> 2) * cols.length)]);
    }
  const n = Math.round(10 + rx * rz * 0.03);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(cx - rx * 0.8 + R() * rx * 1.6), z = Math.floor(cz - rz * 0.8 + R() * rz * 1.6);
    let y = 0;
    while (g.has(x, y, z)) y++;
    const w = 1 + Math.floor(R() * 4), h = 1 + Math.floor(R() * 3), d = 1 + Math.floor(R() * 4);
    g.box(x, y - 1, z, x + w, y - 1 + h, z + d, pick());
  }
  for (let i = 0; i < Math.round(n / 3); i++) {
    const x = Math.floor(cx - rx * 0.7 + R() * rx * 1.4), z = Math.floor(cz - rz * 0.6 + R() * rz * 1.2);
    let y = 0;
    while (g.has(x, y, z)) y++;
    g.line(x, y - 1, z, x + Math.round((R() - 0.5) * 8), y + 2 + Math.floor(R() * Math.max(3, hMax * 0.6)), z + Math.round((R() - 0.5) * 8), METAL_D);
  }
  return g;
}

// ---------------------------------------------------------------------------
// TIER 1: Camp Tent
function tier1(P, m) {
  const b = new VoxGrid();
  const CANV = 0xf0913a, CANV_D = 0xc4621f, CANV_S = 0xd7782a, CANV_L = 0xffb466, IN = 0x7a3a18, DEEP = 0x2e1c22;
  const cx = 3, HW = 10, H = 14, z0 = -12, z1 = 7;
  const hw = (y) => (HW + 0.5) * (1 - y / (H + 0.7)) - 0.55 * Math.sin((Math.PI * y) / H);
  // --- tent prism (ridge along z, triangular door end faces the camera)
  for (let y = 0; y <= H; y++) {
    const w = hw(y);
    for (let x = Math.floor(cx - w - 1); x <= Math.ceil(cx + w + 1); x++) {
      if (Math.abs(x - cx) > w) continue;
      for (let z = z0; z <= z1; z++) {
        const edge = Math.abs(x - cx) > w - 1.3;
        let c = CANV;
        if (y <= 1) c = CANV_D;
        else if (edge && (z - z0) % 6 === 3) c = CANV_S;
        else if (n3(x, y, z, 3) < 0.07) c = shade(CANV, -0.07);
        if ((z === z1 || z === z0) && edge && y > 1) c = CANV_L;
        b.set(x, y, z, c);
      }
    }
  }
  // duct-tape patches
  for (const [px, py, pz] of [[cx + 4, 6, z1], [cx - 5, 4, z1]]) {
    b.box(px, py, pz, px + 1, py + 1, pz, 0xb8bec8);
    b.set(px + 2, py + 1, pz, 0xb8bec8);
  }
  // --- open door: recess with a dark interior + sleeping bag
  const dh = 10;
  const dw = (y) => 5.6 * (1 - y / (dh + 0.8));
  const recess = (x, y, z) => y <= dh && Math.abs(x - cx) <= dw(y) && z > z1 - 8;
  b.carve((x, y, z) => recess(x, y, z) && y >= 1);
  b.paint((x, y, z, c) => {
    if (y < 1 || y > dh + 1 || z < z1 - 8) return undefined;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (recess(nx, ny, nz) && ny >= 1 && !b.has(nx, ny, nz)) return z <= z1 - 8 ? DEEP : IN;
    }
    return undefined;
  });
  // sleeping bag + pillow
  b.box(cx - 4, 1, z1 - 7, cx + 3, 2, z1 - 1, (x, y, z) => ((z - z1) % 2 === 0 ? P.md : P.m));
  b.box(cx - 4, 2, z1 - 7, cx - 1, 3, z1 - 6, 0xf4f0e6);
  b.set(cx + 1, 3, z1 - 6, 0x7ae86a, true); // phone screen glow
  // tied-back door flaps
  for (let y = 1; y <= dh; y++) {
    const w = Math.round(dw(y));
    for (const s of [-1, 1]) {
      b.set(cx + s * (w + 1), y, z1 + 1, y % 3 === 0 ? CANV_S : CANV_L);
      if (y < dh - 2) b.set(cx + s * (w + 2), y, z1 + 1, CANV);
    }
  }
  for (const s of [-1, 1]) b.set(cx + s * 5, 5, z1 + 2, ROPE).set(cx + s * 6, 5, z1 + 2, ROPE);
  // --- stakes and guy ropes
  const FA = H + 2, FY0 = 6, FE = 12;
  for (const s of [-1, 1]) for (const z of [z0 + 1, z1 - 1]) {
    const sx = cx + s * (FE + 3);
    if (s > 0 && z > -2) continue; // the cooler stands there
    b.box(sx, 0, z, sx, 1, z, WOOD_D);
    sagLine(b, [cx + s * FE, FY0, z], [sx, 1, z], ROPE, 0.5);
  }
  // --- cooler (front face), soda can on the lid
  rbox(b, 15, 0, -1, 20, 5, 7, 1, (x, y, z) => (y === 3 && (z === 7 || x === 20) ? 0xf4f6fa : P.m));
  rbox(b, 15, 6, -1, 20, 7, 7, 1, (x, y) => (y === 6 ? 0xdfe6ef : 0xf4f6fa));
  b.box(17, 4, 8, 18, 4, 8, METAL_DD);
  b.box(14, 4, 2, 14, 4, 4, METAL_DD).box(21, 4, 2, 21, 4, 4, METAL_DD);
  cyl(b, 'y', 17, 2, 8, 10, 0.8, 0.8, (x, y) => (y === 10 ? METAL_L : y === 9 ? 0xffffff : PAL.red));
  // --- the tiny battery (energy core) + wire to the tent
  cyl(b, 'y', 10, 13, 0, 7, 1.6, 1.6, (x, y) => (y >= 6 ? 0xd98a32 : y === 0 ? METAL_D : 0x22222c));
  b.box(10, 8, 13, 10, 8, 13, METAL_L);
  artZ(b, BOLT_MINI, 9, 5, 15, P.bolt, { mirror: m, glow: true });
  sagLine(b, [10, 9, 13], [cx + 2, 1, z1], PAL.red, -1.2);
  // --- cardboard LAB sign (hand-painted)
  const SX0 = -12, SX1 = -1, SY0 = 4, SY1 = 11, SZ = 13;
  b.box(-6, 0, SZ - 1, -6, SY0 + 3, SZ - 1, WOOD);
  for (let y = SY0; y <= SY1; y++) {
    const lean = Math.floor((y - SY0) / 3);
    for (let x = SX0; x <= SX1; x++) {
      if (y === SY1 && x >= SX1 - 1) continue; // torn corner
      const edge = y === SY0 || y === SY1 || x === SX0 || x === SX1;
      b.set(x - lean, y, SZ, edge ? 0xa87a46 : n3(x, y, 9) < 0.12 ? 0xb88a52 : 0xcfa468);
    }
  }
  // letters painted on (lean follows the board)
  const sign = new VoxGrid();
  paint(sign, 'LAB', SX0 + 2, SY0 + 2, SZ + 1, '+z', P.bolt, { wobble: 1, seed: 5, mirror: m });
  sign.forEach((x, y, z, c) => b.set(x - Math.floor((y - SY0) / 3), y, SZ + 1, c));
  b.set(SX1 - 2, SY1 - 1, SZ + 1, P.bolt).set(SX1 - 3, SY1 - 2, SZ + 1, P.bolt).set(SX1 - 2, SY1 - 3, SZ + 1, P.bolt).set(SX1 - 3, SY1 - 4, SZ + 1, P.bolt);

  // --- rain fly (tarp) over the tent: stage 3 chunk
  const fly = new VoxGrid();
  const fhw = (y) => FE * (FA - y) / (FA - FY0);
  for (let y = FY0; y <= FA; y++) {
    const w = fhw(y);
    for (let x = Math.floor(cx - w - 1); x <= Math.ceil(cx + w + 1); x++) {
      const d = Math.abs(x - cx);
      if (d > w + 0.3 || d < w - 1.7) continue;
      for (let z = z0 - 1; z <= z1 + 2; z++) {
        let c = (z - z0) % 4 === 0 ? P.tarpL : P.tarp;
        if (y <= FY0 + 1) c = P.tarpD;
        if (y === FY0 && (z - z0) % 4 === 1) c = METAL_L; // grommets
        if (n3(x, y, z, 8) < 0.05) c = shade(P.tarp, -0.12);
        fly.set(x, y, z, c);
      }
    }
  }
  fly.box(cx - 1, FA, z0 - 1, cx + 1, FA, z1 + 2, P.tarpD);
  // patch + rip on the fly
  fly.box(cx + 5, 10, z1 + 2, cx + 6, 11, z1 + 2, 0xb8bec8);
  // ridge pole (stage 3 too) + pennant pole
  cyl(fly, 'z', cx, FA + 1, z0 - 3, z1 + 4, 0.6, 0.6, WOOD);
  fly.box(cx, FA + 2, z1 + 3, cx, FA + 7, z1 + 3, WOOD_D);
  // --- clothesline with a lab coat (stage 1 chunk + anim)
  const line = new VoxGrid();
  pole(line, -13, 0, 13, -7, WOOD_D);
  sagLine(line, [cx, FA + 1, z0 - 3], [-13, 13, -7], ROPE, 1.5);
  const coat = new VoxGrid();
  coat.box(-3, -9, 0, 3, -2, 0, 0xf4f6fa);
  coat.box(-4, -6, 0, -4, -2, 0, 0xe2e8f0).box(4, -6, 0, 4, -2, 0, 0xe2e8f0); // sleeves
  coat.box(-1, -3, 0, 1, -2, 0, P.m); // collar
  coat.box(0, -9, 0, 0, -4, 0, 0xd6dde8); // opening
  coat.set(2, -6, 0, P.bolt).set(-2, -5, 0, 0xd6dde8);
  coat.set(-2, -1, 0, PAL.yellow).set(2, -1, 0, PAL.pink); // pegs

  // --- lantern hanging from the ridge pole tip (anim)
  const lan = new VoxGrid();
  lan.set(0, -1, 0, METAL_D).set(0, -2, 0, METAL_D);
  lan.box(-1, -3, -1, 1, -3, 1, 0x2f6a4a);
  lan.box(-1, -6, -1, 1, -4, 1, WARM, true);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lan.box(x, -6, z, x, -4, z, METAL_D);
  lan.box(-1, -7, -1, 1, -7, 1, 0x2f6a4a);
  // --- pennant (anim)
  const flag = new VoxGrid();
  for (let x = 0; x <= 6; x++) for (let y = 0; y <= 4; y++) if (Math.abs(y - 2) <= 2.4 * (1 - x / 7.5)) flag.set(x, y, 0, x === 1 && y === 2 ? P.bolt : P.m);

  return {
    body: b,
    chunks: [
      { name: 'line', grid: line, stage: 1 },
      { name: 'fly', grid: fly, stage: 3 },
    ],
    anims: [
      { name: 'coat', type: 'sway', axis: 'z', amp: 0.18, freq: 2.2, grid: coat, at: [-9.5, 14.5, -8.5], stage: 1 },
      { name: 'lantern', type: 'sway', axis: 'z', amp: 0.16, freq: 1.7, grid: lan, at: [cx + 0.5, FA + 1, z1 + 3.5], stage: 2 },
      { name: 'pennant', type: 'flag', amp: 0.35, freq: 3, grid: flag, at: [cx + 0.5, FA + 4, z1 + 3.5], stage: 2, dx: 1 },
    ],
    lights: [],
    core: [10.5, 4, 13.5],
    seat: [cx + 0.5, FA + 2, -2.5],
    fires: [[cx - 3, 9, z1 + 1], [cx + 5, 7, z1 - 6], [cx - 6, 5, z0 + 4]],
    sparks: [[10.5, 8, 14], [18, 8, 6], [cx + 0.5, 12, z1 + 2]],
    smoke: [[cx + 0.5, FA, -2], [cx - 4, 8, z1]],
    rubble: { cols: [CANV, CANV_D, P.tarp, P.tarpD, 0xf4f6fa, WOOD, P.m], h: 4 },
  };
}

// ---------------------------------------------------------------------------
// TIER 2: Lab Shack
function tier2(P, m) {
  const b = new VoxGrid();
  const PLY = 0xdcb47c, PLY_D = 0xb98d58, PLY_S = 0x8e6238, OSB = 0xc99c5c;
  const ORANGE = 0xff7a1a;
  const X0 = -13, X1 = 14, Z0 = -11, Z1 = 9, Y0 = 3, Y1 = 19;
  const RX0 = X0 - 2, RX1 = X1 + 2, RZ0 = Z0 - 2, RZ1 = Z1 + 2;
  const yr = (x) => Y1 + 1 + Math.round(((RX1 - x) * 3) / (RX1 - RX0));
  // cinder-block footings + joists
  for (const x of [X0, -2, X1 - 3]) for (const z of [Z0, Z1 - 3]) b.box(x, 0, z, x + 3, 1, z + 3, (xx, yy, zz) => ((xx + zz + yy) % 4 === 0 ? 0x7c8496 : 0xa4acbc));
  b.box(X0 - 1, 2, Z0 - 1, X1 + 1, 2, Z1 + 1, WOOD_D);
  // plywood walls (gables follow the shed roof)
  const ply = (x, y, z) => {
    const onZ = z === Z0 || z === Z1;
    const u = onZ ? x - X0 : z - Z0;
    if (u % 9 === 0) return PLY_S;
    const sheet = Math.floor(u / 9) + (onZ ? 0 : 7) + (z === Z0 || x === X0 ? 13 : 0);
    if (hash3(sheet, 3, 5) < 0.3) return n3(x, y, z, 2) < 0.3 ? shade(OSB, -0.14) : OSB;
    if (n3(x >> 1, y, z >> 1, 4) < 0.12) return PLY_D;
    return PLY;
  };
  for (let x = X0; x <= X1; x++) b.box(x, Y0, Z0, x, yr(x) - 1, Z1, ply);
  for (let x = X0; x <= X1; x += 9) for (let y = Y0 + 2; y < Y1; y += 4) b.set(x, y, Z1, 0x6a6e78);
  // door with Z-brace + padlock
  const DX0 = -10, DX1 = -4, DY1 = 16;
  b.box(DX0 - 1, Y0, Z1 + 1, DX1 + 1, DY1 + 1, Z1 + 1, WOOD_D);
  b.box(DX0, Y0, Z1 + 1, DX1, DY1, Z1 + 1, null);
  b.box(DX0, Y0, Z1, DX1, DY1, Z1, (x) => ((x - DX0) % 2 ? 0xc8945a : 0xd6a468));
  for (const y of [Y0 + 2, DY1 - 2]) b.box(DX0, y, Z1 + 1, DX1, y, Z1 + 1, WOOD);
  b.line(DX0, Y0 + 3, Z1 + 1, DX1, DY1 - 3, Z1 + 1, WOOD);
  b.set(DX1 - 1, 10, Z1 + 2, PAL.yellow).set(DX1 - 1, 9, Z1 + 2, PAL.goldD);
  b.set(DX0, Y0 + 2, Z1 + 2, METAL_D).set(DX0, DY1 - 2, Z1 + 2, METAL_D);
  // window with a cracked pane and glowing flask inside
  const WX0 = 0, WX1 = 7, WY0 = 9, WY1 = 15;
  b.box(WX0 - 1, WY0 - 1, Z1 + 1, WX1 + 1, WY1 + 1, Z1 + 1, WOOD_D);
  b.box(WX0, WY0, Z1 + 1, WX1, WY1, Z1 + 1, null);
  b.box(WX0, WY0, Z1, WX1, WY1, Z1, (x, y) => ((x + y) % 6 === 0 ? 0xd8f2ff : 0x8ec4e6));
  b.box(WX0 + 4, WY0, Z1 + 1, WX0 + 4, WY1, Z1 + 1, WOOD_D).box(WX0, WY0 + 3, Z1 + 1, WX1, WY0 + 3, Z1 + 1, WOOD_D);
  artZ(b, ['..g.', '.gGg', 'gGGG'], WX0 + 1, WY0 + 2, Z1, { g: 0x3a4a6a, G: 0x7dff5a }, { mirror: m });
  b.set(WX0 + 2, WY0 + 1, Z1, 0x7dff5a, true);
  b.set(WX1 - 1, WY1 - 1, Z1 + 1, 0xb8bec8).set(WX1 - 2, WY1 - 2, Z1 + 1, 0xb8bec8).set(WX1 - 1, WY1 - 2, Z1 + 1, 0xb8bec8);
  // spray-painted bolt on the wall
  boltZ(b, 9, 17, Z1, P.bolt, { mirror: m });
  b.set(10, 9, Z1, P.boltD).set(9, 8, Z1, P.boltD); // drips
  // corrugated tin roof (rusty)
  for (let x = RX0; x <= RX1; x++) for (let z = RZ0; z <= RZ1; z++) {
    const y = yr(x);
    const ridge = (z & 1) === 0;
    const rust = vnoise(x * 0.22, 3, z * 0.22) < 0.3;
    b.set(x, y, z, rust ? (ridge ? 0xb8703a : 0x8a4a28) : (ridge ? 0xc2cad6 : 0x8f98aa));
    if (ridge) b.set(x, y + 1, z, rust ? 0xc8804a : 0xd7dde6);
  }
  for (let x = RX0; x <= RX1; x += 6) b.set(x, yr(x) + 2, RZ1, METAL_DD);
  // seat cushion (old couch cushion) on the roof
  b.box(6, yr(9) + 2, -3, 12, yr(9) + 2, 2, P.md);
  b.box(6, yr(9) + 3, -3, 12, yr(9) + 3, 2, (x, y, z) => ((x + z) % 3 === 0 ? P.md : P.m));
  // extension cords from the generator
  sagLine(b, [16, 1, 10], [5, 0, 13], ORANGE, 0);
  sagLine(b, [5, 0, 13], [-3, 0, 11], ORANGE, 0);
  b.box(-3, 1, 10, -3, 5, 10, ORANGE).box(-2, 5, 10, -1, 5, 10, ORANGE);
  b.box(15, 3, 10, 15, yr(15) - 1, 10, ORANGE);
  b.box(4, 0, 12, 6, 0, 14, 0xf4f6fa).set(5, 1, 13, PAL.red, true); // power strip
  for (let x = X0; x <= X1; x++) b.set(x, yr(x) - 1, RZ1, INK); // fairy-light wire

  // plank sign "LAB" above the door (stage 2)
  const sign = new VoxGrid();
  sign.box(-13, Y1 - 2, Z1 + 1, -1, Y1 + 2, Z1 + 1, (x, y) => (y === Y1 - 2 || y === Y1 + 2 ? WOOD_D : (x + y) % 5 === 0 ? WOOD : WOOD_L));
  paint(sign, 'LAB', -7, Y1 - 1, Z1 + 2, '+z', P.bolt, { center: true, mirror: m, wobble: 1, seed: 9 });
  sign.set(-12, Y1, Z1 + 2, METAL_DD).set(-2, Y1, Z1 + 2, METAL_DD);
  // ladder leaning on the left wall (stage 1)
  const lad = new VoxGrid();
  for (const z of [3, 7]) lad.line(X0 - 7, 0, z, X0 - 1, yr(X0) + 1, z, WOOD_L);
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    lad.box(Math.round(X0 - 7 + 6 * t), Math.round((yr(X0) + 1) * t), 4, Math.round(X0 - 7 + 6 * t), Math.round((yr(X0) + 1) * t), 6, WOOD);
  }
  // chemical drum (stage 2)
  const drum = new VoxGrid();
  barrel(drum, X0 - 3, 0, 13, P.m, { hazard: true, h: 8, r: 2 });
  drum.set(X0 - 3, 8, 13, METAL_L);
  // frying-pan satellite dish (anim)
  const R = 3.5, tilt = 0.7, ct = Math.cos(tilt), st = Math.sin(tilt);
  const pan = dishGrid({ r: R, col: 0x3c3c48, back: 0x2a2a34, rim: 0x6a6a7a, post: WOOD_L, tip: P.glow, tilt });
  for (let i = 1; i <= 5; i++) {
    const dx = -(R + i), dy = R / 1.6;
    pan.set(Math.round(dx * ct + dy * st), Math.round(6 - dx * st + dy * ct), 0, i > 2 ? 0x1a1a22 : 0x2a2a34);
  }
  // generator (anim: rattles)
  const gen = new VoxGrid();
  const GY = 0xffc21a, GYD = 0xd99a10, CAGE = 0x2a2a32;
  gen.box(-1, 1, -3, 2, 5, 3, (x, y) => (y === 3 ? GYD : GY));
  gen.box(-1, 1, -3, 2, 2, -1, METAL_D);
  gen.box(-1, 6, -2, 2, 6, 2, PAL.red).set(0, 7, 1, INK);
  for (const x of [-2, 3]) for (const z of [-4, 4]) gen.box(x, 0, z, x, 7, z, CAGE);
  for (const y of [0, 7]) {
    gen.box(-2, y, -4, 3, y, -4, CAGE).box(-2, y, 4, 3, y, 4, CAGE);
    gen.box(-2, y, -4, -2, y, 4, CAGE).box(3, y, -4, 3, y, 4, CAGE);
  }
  gen.box(-1, 2, 3, 2, 4, 3, 0x4a4e5a);
  gen.set(-1, 2, 4, ORANGE).set(0, 2, 4, ORANGE);
  gen.set(1, 4, 4, P.glow, true).set(2, 3, 4, PAL.red);
  gen.box(-1, 7, -3, 0, 8, -2, METAL_D).set(-1, 9, -3, METAL_DD);
  const yRoof = yr(-7);
  return {
    body: b,
    chunks: [
      { name: 'ladder', grid: lad, stage: 1 },
      { name: 'sign', grid: sign, stage: 2 },
      { name: 'drum', grid: drum, stage: 2 },
    ],
    anims: [
      { name: 'pan', type: 'spin', axis: 'y', speed: 0.9, grid: pan, at: [-6.5, yRoof + 2, -4.5], stage: 2 },
      { name: 'generator', type: 'jitter', amp: 0.35, grid: gen, at: [17.5, 0, 5.5], stage: 9 },
    ],
    lights: Array.from({ length: 7 }, (_, i) => {
      const x = X0 + 1 + i * 4;
      return { at: [x + 0.5, yr(x) - 1.6, RZ1 + 0.5], color: [WARM, P.boltL, P.glow, 0x9dff7a][i % 4], mode: 'blink', rate: 0.9, duty: 0.7, phase: i * 0.21, size: 1.3, stage: 1 };
    }),
    puffs: [{ at: [16.5, 9.5, 2.5], color: 0x8a8a96, rate: 2.2, rise: 0.55, s0: 0.06, s1: 0.22, life: 1.1, op: 0.5, vx: -0.15, until: 4 }],
    core: [18, 3.5, 5.5],
    seat: [9.5, yr(9) + 4, -0.5],
    fires: [[-6, yr(-6) + 1, 5], [4, yr(4) + 1, -4], [10, 10, Z1 + 1]],
    sparks: [[16, 6, 10], [3, 14, Z1 + 1], [-7, Y1, Z1 + 2]],
    smoke: [[-2, yr(-2) + 1, 0], [16.5, 9, 3]],
    rubble: { cols: [PLY, PLY_D, OSB, 0xc2cad6, 0x8f98aa, 0xb8703a, P.m], h: 6 },
  };
}

// ---------------------------------------------------------------------------
// TIER 3: Trailer Lab
function tier3(P, m) {
  const b = new VoxGrid();
  const X0 = -16, X1 = 17, Y0 = 6, Y1 = 30, Z0 = -12, Z1 = 9;
  const RC = 7.5;
  // vintage camper body: rounded box with big rounded top corners
  rbox(b, X0, Y0, Z0, X1, Y1, Z1, 3, (x, y, z) => {
    if (y <= Y0 + 2) return METAL_D;
    if (y >= 13 && y <= 15) return P.m;
    if (y === 16) return P.ml;
    if ((x - X0) % 8 === 0 && y > 16) return P.seam;
    if ((x - X0) % 8 === 0 && y % 2 === 0) return P.w2;
    return n3(x, y, z, 5) < 0.04 ? P.w2 : P.w;
  }, {
    clip: (x, y) => {
      const f = x > X1 - RC && y > Y1 - RC && (x - (X1 - RC)) ** 2 + (y - (Y1 - RC)) ** 2 > RC * RC;
      const k = x < X0 + RC && y > Y1 - RC && (x - (X0 + RC)) ** 2 + (y - (Y1 - RC)) ** 2 > RC * RC;
      return f || k;
    },
  });
  // wheel arches + tandem tyres
  const WX = -3;
  b.carve((x, y, z) => (z >= Z1 - 4 || z <= Z0 + 4) && (x - WX) ** 2 + (y - 5) ** 2 < 6.6 ** 2);
  for (const z0 of [Z1 - 3, Z0 + 1]) {
    cyl(b, 'z', WX, 5, z0, z0 + 2, 4.6, 4.6, (x, y) => {
      const d = Math.hypot(x - WX, y - 5);
      return d < 1.6 ? METAL_L : d < 2.8 ? METAL : 0x23232b;
    });
  }
  for (const [dx, dy] of [[0, 2], [2, 0], [0, -2], [-2, 0]]) b.set(WX + dx, 5 + dy, Z1, METAL_DD);
  for (let a = 0; a <= 36; a++) {
    const t = (Math.PI * a) / 36;
    b.set(Math.round(WX + Math.cos(t) * 6.9), Math.round(5 + Math.sin(t) * 6.9), Z1 + 1, METAL_L);
  }
  b.box(WX - 1, 4, Z0 + 3, WX + 1, 5, Z1 - 4, METAL_DD);
  // stabilizer jacks
  for (const x of [X0 + 2, X1 - 3]) for (const z of [Z0 + 1, Z1 - 1]) b.box(x, 0, z, x, Y0 - 1, z, METAL_D).box(x - 1, 0, z - 1, x + 1, 0, z + 1, METAL_DD);
  // hitch tongue, jack wheel, front storage box + propane tank
  b.line(X1, 6, Z1 - 4, 24, 6, -2, METAL_D, 0).line(X1, 6, Z0 + 4, 24, 6, -2, METAL_D, 0);
  b.line(X1, 7, Z1 - 4, 24, 7, -2, METAL_D, 0).line(X1, 7, Z0 + 4, 24, 7, -2, METAL_D, 0);
  b.box(23, 6, -3, 25, 8, -1, METAL_DD).set(24, 9, -2, METAL_L);
  b.box(21, 1, -2, 21, 6, -2, METAL).box(20, 0, -2, 22, 0, -2, INK);
  b.box(18, 8, -9, 21, 13, 3, (x, y, z) => (y === 13 ? METAL_L : (x + y + z) % 2 ? METAL : METAL_L));
  b.box(18, 11, 3, 21, 11, 3, P.m);
  cyl(b, 'y', 19, 6, 8, 14, 1.6, 1.6, (x, y) => (y === 14 ? METAL : 0xf4f6fa));
  b.set(19, 15, 6, METAL_DD);
  // windows full of glowing chemistry glassware
  const win = (x0, x1, y0, y1, art) => {
    b.box(x0 - 1, y0 - 1, Z1 + 1, x1 + 1, y1 + 1, Z1 + 1, METAL_L);
    b.box(x0, y0, Z1 + 1, x1, y1, Z1 + 1, null);
    b.box(x0, y0, Z1, x1, y1, Z1, 0x24314f);
    artZ(b, art, x0, y1, Z1, { g: 0x9fd8f0, G: 0x7dff5a, B: P.glow, K: P.boltL, '-': METAL, s: 0xd8f2ff }, { mirror: m });
    for (const row of art.map((r, i) => [r, i])) {
      [...row[0]].forEach((ch, c) => {
        if ('GBK'.includes(ch)) b.set(x0 + (m ? row[0].length - 1 - c : c), y1 - row[1], Z1, ch === 'G' ? 0x7dff5a : ch === 'B' ? P.glow : P.boltL, (c + row[1]) % 2 === 0);
      });
    }
  };
  win(-11, -4, 18, 25, [
    's.......',
    '.g....g.',
    '.g..g.gK',
    'gGg.g.gK',
    'GGGgBg.K',
    'GGGgBg..',
    '.ggg.g..',
    '--------',
  ]);
  win(-1, 3, 18, 25, [
    's....',
    '.gg..',
    'gBBg.',
    'gBBgg',
    '.gg.G',
    '.g..G',
    '.g.gG',
    '-----',
  ]);
  win(13, 15, 19, 24, ['s..', '.K.', 'gKg', 'gKg', '.g.', '---']);
  // door with porthole, handle, hazard sticker, steps
  const DX0 = 6, DX1 = 11, DY1 = 27;
  b.box(DX0 - 1, Y0 + 1, Z1 + 1, DX1 + 1, DY1 + 1, Z1 + 1, METAL_L);
  b.box(DX0, Y0 + 1, Z1 + 1, DX1, DY1, Z1 + 1, null);
  b.box(DX0, Y0 + 1, Z1, DX1, DY1, Z1, P.w2);
  cyl(b, 'z', DX0 + 2.5, 22.5, Z1, Z1 + 1, 2, 2, (x, y, z) => (z === Z1 + 1 ? (Math.hypot(x - DX0 - 2.5, y - 22.5) > 1.6 ? METAL_L : null) : 0x8ec4e6));
  b.set(DX1 - 1, 15, Z1 + 1, METAL_DD);
  b.box(DX0 + 2, 10, Z1 + 1, DX0 + 3, 10, Z1 + 1, INK).set(DX0 + 2, 11, Z1 + 1, PAL.yellow).set(DX0 + 3, 11, Z1 + 1, PAL.yellow).set(DX0 + 2, 12, Z1 + 1, PAL.yellow);
  b.box(DX0, 4, Z1 + 1, DX1, 5, Z1 + 3, METAL).box(DX0, 1, Z1 + 1, DX1, 2, Z1 + 5, METAL_D);
  b.box(DX0 - 1, 0, Z1 + 4, DX0 - 1, 5, Z1 + 4, METAL_DD).box(DX1 + 1, 0, Z1 + 4, DX1 + 1, 5, Z1 + 4, METAL_DD);
  // bolt decal + "LAB" lettering on the back end
  boltZ(b, X0 + 2, 26, Z1, P.bolt, { mirror: m, scale: 1 });
  paint(b, 'LAB', X0 + 4, 18, Z1, '+z', P.md, { mirror: m, center: true });
  // energy tank stand + caps + pipe to the trailer (core)
  const TX = -21, TZ = 3;
  b.box(TX - 3, 0, TZ - 3, TX + 3, 1, TZ + 3, METAL_DD);
  cyl(b, 'y', TX, TZ, 2, 3, 3.6, 3.6, (x, y) => (y === 3 ? P.m : METAL_D));
  ring(b, TX, TZ, 2, 2, 4, P.glow, true);
  cyl(b, 'y', TX, TZ, 14, 15, 3.6, 3.6, (x, y) => (y === 14 ? P.m : METAL));
  b.box(TX, 16, TZ, TX, 17, TZ, METAL_D).set(TX, 18, TZ, P.bolt);
  for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3]]) b.box(TX + dx, 4, TZ + dz, TX + dx, 13, TZ + dz, METAL_D);
  pipe(b, 'x', TX + 3, X0 + 1, 12, TZ - 2, METAL, P.m, 0, 4);
  // seat cushion on the roof
  b.box(5, Y1 + 1, -3, 11, Y1 + 1, 2, P.md).box(5, Y1 + 2, -3, 11, Y1 + 2, 2, (x, y, z) => ((x + z) % 3 ? P.m : P.ml));

  // awning (stage 2) + its flapping valance (anim)
  const awn = new VoxGrid();
  const AX0 = 2, AX1 = 15, AY = 28, AZ1 = 18;
  for (let z = Z1 + 1; z <= AZ1; z++) {
    const y = AY - Math.round(((z - Z1 - 1) * 3) / (AZ1 - Z1 - 1));
    for (let x = AX0; x <= AX1; x++) awn.set(x, y, z, ((x - AX0) >> 1) % 2 ? 0xffffff : P.m);
  }
  cyl(awn, 'x', AY + 1, Z1 + 1, AX0 - 1, AX1 + 1, 0.6, 0.6, METAL_L);
  for (const x of [AX0, AX1]) awn.box(x, 0, AZ1, x, AY - 4, AZ1, METAL_L).set(x, 0, AZ1, METAL_DD);
  const val = new VoxGrid();
  for (let x = 0; x <= AX1 - AX0; x++) {
    val.set(x, -1, 0, P.m).set(x, -2, 0, (x >> 1) % 2 ? 0xffffff : P.m);
    if (x % 2 === 0) val.set(x, -3, 0, (x >> 1) % 2 ? 0xffffff : P.m);
  }
  // solar panel (stage 2)
  const sol = new VoxGrid();
  for (let z = -10; z <= 3; z++) {
    const y = Y1 + 3 + Math.round(((3 - z) * 5) / 13);
    for (let x = -14; x <= -1; x++) {
      const edge = x === -14 || x === -1 || z === -10 || z === 3;
      const grid = (x + 14) % 4 === 0 || (z + 10) % 4 === 0;
      const c = edge ? METAL_L : grid ? 0x8fb0e8 : 0x1c3a8a;
      sol.set(x, y, z, c).set(x, y - 1, z, edge ? METAL : 0x14285e);
    }
  }
  for (const x of [-13, -2]) { sol.box(x, Y1 + 1, 2, x, Y1 + 2, 2, METAL_D); sol.box(x, Y1 + 1, -9, x, Y1 + 6, -9, METAL_D); }
  // antenna (stage 1)
  const ant = new VoxGrid();
  ant.box(13, Y1 - 1, -7, 13, Y1 + 15, -7, METAL_L).box(12, Y1 - 1, -8, 14, Y1, -6, METAL_D);
  ant.box(11, Y1 + 8, -7, 15, Y1 + 8, -7, METAL).box(12, Y1 + 12, -7, 14, Y1 + 12, -7, METAL);
  // rooftop AC unit (stage 3)
  const ac = new VoxGrid();
  ac.box(-0, Y1 + 1, -10, 6, Y1 + 4, -4, (x, y) => (y === Y1 + 4 ? P.w2 : P.w));
  for (let x = 1; x <= 5; x++) ac.set(x, Y1 + 2, -3, x % 2 ? METAL_DD : METAL_D).set(x, Y1 + 3, -3, x % 2 ? METAL_DD : METAL_D);
  return {
    body: b,
    chunks: [
      { name: 'antenna', grid: ant, stage: 1 },
      { name: 'awning', grid: awn, stage: 2 },
      { name: 'solar', grid: sol, stage: 2 },
      { name: 'ac', grid: ac, stage: 3 },
    ],
    anims: [
      { name: 'valance', type: 'flap', axis: 'x', amp: 0.45, freq: 2.6, grid: val, at: [AX0 + 0.5, AY - 3, AZ1 + 0.5], stage: 2 },
    ],
    lights: [
      { at: [13.5, Y1 + 16.2, -6.5], color: 0xff3040, mode: 'blink', rate: 1.1, stage: 1, size: 1.6 },
      ...Array.from({ length: 5 }, (_, i) => ({ at: [AX0 + 1.5 + i * 3, AY - 4.4, AZ1 - 0.5], color: [WARM, P.boltL, P.glow][i % 3], mode: 'blink', rate: 0.8, duty: 0.75, phase: i * 0.27, size: 1.2, stage: 2 })),
    ],
    tanks: [{ at: [TX + 0.5, 4, TZ + 0.5], r: 3.2, h: 10, bubbles: 6 }],
    core: [TX + 0.5, 9, TZ + 0.5],
    seat: [8.5, Y1 + 3, -0.5],
    fires: [[-8, Y1 + 1, 2], [12, 25, Z1 + 1], [-13, 20, Z1 + 1]],
    sparks: [[17, 12, 0], [-9, 22, Z1 + 1], [10, Y1, Z1 + 1], [-20, 15, 7]],
    smoke: [[0, Y1 + 2, -2], [-10, Y1, 2]],
    rubble: { cols: [P.w, P.w2, P.m, METAL, METAL_D, 0x23232b, 0x1c3a8a], h: 7 },
  };
}

const BUILDERS = [tier1, tier2, tier3];

// ---------------------------------------------------------------------------
// Assembly (geometry cached per tier + side + flip)

const defCache = new Map();
const FLAME = (() => {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 1, 1, 1, 0xff5a1a, true);
  g.box(-1, 2, 0, 1, 2, 0, 0xff8a2a, true).box(0, 2, -1, 0, 2, 1, 0xff8a2a, true);
  g.set(0, 3, 0, 0xffd23f, true).set(0, 4, 0, 0xfff2a0, true).set(1, 3, 0, 0xffb02a, true);
  return g.build({ scale: 0.085, pivot: [0.5, 0, 0.5] });
})();
const SPARK_GEO = new THREE.BoxGeometry(0.045, 0.045, 0.045);
const CUBE_GEO = new THREE.BoxGeometry(1, 1, 1);
const BUBBLE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });

function tierDef(tier, side, flip) {
  const key = `${tier}|${side}|${flip ? 1 : 0}`;
  if (defCache.has(key)) return defCache.get(key);
  const P = TEAM[side] ?? TEAM[0];
  const d = BUILDERS[tier - 1](P, flip);
  const sx = flip ? -1 : 1;
  const mir = (g) => (flip ? mirrorGrid(g) : g);
  const W = (p) => [sx * p[0] * V, p[1] * V, p[2] * V];
  const P0 = { scale: V, pivot: [0, 0, 0], maxSamples: 420 };
  const bodyGrid = hollow(mir(d.body));
  const bodyGeos = [bodyGrid.build(P0)];
  const bb = bodyGrid.bounds();
  const all = { ...bb };
  const grow = (g, off = [0, 0, 0]) => {
    const q = g.bounds();
    all.minX = Math.min(all.minX, q.minX + off[0]); all.maxX = Math.max(all.maxX, q.maxX + off[0]);
    all.minY = Math.min(all.minY, q.minY + off[1]); all.maxY = Math.max(all.maxY, q.maxY + off[1]);
    all.minZ = Math.min(all.minZ, q.minZ + off[2]); all.maxZ = Math.max(all.maxZ, q.maxZ + off[2]);
  };
  const chunks = d.chunks.map((c) => {
    const g = mir(c.grid);
    grow(g);
    return { name: c.name, stage: c.stage, geo: g.build({ ...P0, maxSamples: 160 }) };
  });
  const anims = (d.anims ?? []).map((a) => {
    const g = mir(a.grid);
    const piv = a.piv ?? [0.5, 0, 0.5];
    grow(g, [Math.round(sx * a.at[0] - 0.5), Math.floor(a.at[1]), Math.round(a.at[2] - 0.5)]);
    return { ...a, pos: W(a.at), geo: g.build({ scale: V, pivot: [sx * piv[0], piv[1], piv[2]], maxSamples: 80 }) };
  });
  const def = {
    tier, side, flip, P,
    bodyGeo(s) {
      if (!bodyGeos[s]) bodyGeos[s] = hollow(damageGrid(bodyGrid, s, 11 + tier * 7)).build(P0);
      return bodyGeos[s];
    },
    rubbleGeo() {
      if (!this._rubble) this._rubble = rubbleGrid(d.rubble.cols, bb, d.rubble.h, 5 + tier).build({ ...P0, maxSamples: 300 });
      return this._rubble;
    },
    chunks, anims,
    lights: (d.lights ?? []).map((l) => ({ ...l, pos: W(l.at) })),
    tanks: (d.tanks ?? []).map((t) => ({ ...t, pos: W(t.at) })),
    orbs: (d.orbs ?? []).map((o) => ({ ...o, pos: W(o.at) })),
    puffs: (d.puffs ?? []).map((p) => ({ ...p, pos: W(p.at) })),
    core: W(d.core),
    seat: W(d.seat),
    fires: d.fires.map(W),
    sparks: d.sparks.map(W),
    smoke: (d.smoke ?? []).map(W),
  };
  def.width = (bb.maxX - bb.minX + 1) * V;
  def.height = (all.maxY + 1) * V;
  for (const l of def.lights) def.height = Math.max(def.height, l.pos[1] + (l.size ?? 1.6) * V);
  def.bounds = { x0: all.minX * V, x1: (all.maxX + 1) * V, z0: all.minZ * V, z1: (all.maxZ + 1) * V };
  def.front = flip ? -FRONT * V : FRONT * V;
  defCache.set(key, def);
  return def;
}

/** Pre-build damage/rubble geometry when the browser is idle. */
function prewarm(def) {
  if (def._warm) return;
  def._warm = true;
  const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : (f) => setTimeout(f, 400);
  let s = 1;
  const step = () => {
    if (s <= 3) def.bodyGeo(s++);
    else { def.rubbleGeo(); return; }
    ric(step);
  };
  ric(step);
}

const LAB_SKINS = new Set(['mansion', 'martLab', 'mart', 'chocoLab', 'goldVault']);

/**
 * In-battle Base at an upgrade tier (1..6).
 * @param {number} tier 1 Camp Tent .. 6 Mega HQ
 * @param {{side?: 0|1, flip?: boolean, style?: string}} o side 1 = rival colours; flip mirrors it
 *   for the right-hand side; style = an equipped Lab skin (mansion, goldVault, ...) used at tier 5.
 * @returns {{root, seat, core, meshes, height, width, tier, front, bounds, setDamage(f), update(dt), onChunk, setLevel(n)}}
 */
export function makeBase(tier = 1, { side = 0, flip = false, style } = {}) {
  tier = clamp(Math.round(tier) || 1, 1, BUILDERS.length);
  if (tier === 5 && style && LAB_SKINS.has(style)) {
    const lab = makeLabBuilding({ style, flip });
    return Object.assign(lab, { tier, name: BASE_TIERS[4].name, front: (flip ? -1 : 1) * 1.7, bounds: { x0: -lab.width / 2, x1: lab.width / 2, z0: -1.4, z1: 1.6 } });
  }
  const D = tierDef(tier, side, flip);
  prewarm(D);
  const P = D.P;
  const sx = flip ? -1 : 1;
  const root = new THREE.Group();
  root.name = `base:${tier}`;
  const meshes = [];
  const body = makeMesh(D.bodyGeo(0));
  body.receiveShadow = true;
  root.add(body);
  meshes.push(body);
  const chunks = D.chunks.map((c) => {
    const m = makeMesh(c.geo);
    m.name = c.name;
    root.add(m);
    meshes.push(m);
    return { mesh: m, obj: m, stage: c.stage };
  });
  const anims = D.anims.map((a, i) => {
    const grp = new THREE.Group();
    grp.position.set(...a.pos);
    const m = makeMesh(a.geo);
    if (a.dx) m.position.x = sx * a.dx * V;
    grp.add(m);
    root.add(grp);
    meshes.push(m);
    const rs = flip && a.axis !== 'x' ? -1 : 1;
    return { ...a, grp, mesh: m, obj: grp, rs, base: grp.position.clone(), phase: (a.phase ?? 0) + i * 1.3 + Math.random() * 2 };
  });
  const lights = D.lights.map((l, i) => {
    const s = (l.size ?? 1.6) * V;
    const mesh = new THREE.Mesh(CUBE_GEO, glowMat(l.color));
    mesh.scale.setScalar(s);
    mesh.position.set(...l.pos);
    root.add(mesh);
    return { ...l, mesh, alive: true, phase: l.phase ?? i * 0.37 };
  });

  // --- energy tanks (translucent liquid + glass + bubbles)
  const energyMats = [];
  const tanks = D.tanks.map((tk) => {
    const grp = new THREE.Group();
    grp.position.set(...tk.pos);
    const r = tk.r * V, h = tk.h * V;
    const liquidMat = new THREE.MeshPhongMaterial({ color: tk.color ?? P.en, transparent: true, opacity: 0.42, depthWrite: false, shininess: 60, emissive: mixHex(tk.color ?? P.en, 0, 0.55) });
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, h * (tk.fill ?? 0.86), 14), liquidMat);
    liquid.position.y = (h * (tk.fill ?? 0.86)) / 2;
    liquid.renderOrder = 2;
    grp.add(liquid);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.04 * V * 10, r + 0.04 * V * 10, h, 16, 1, true), glassMat(0xd8f4ff, 0.22));
    glass.position.y = h / 2;
    glass.renderOrder = 3;
    grp.add(glass);
    const bubbles = [];
    for (let i = 0; i < (tk.bubbles ?? 6); i++) {
      const bm = new THREE.Mesh(CUBE_GEO, BUBBLE_MAT);
      bm.scale.setScalar(V * (0.5 + Math.random() * 0.4));
      bm.userData = { sp: 0.25 + Math.random() * 0.45, ph: Math.random() * 6, r: Math.random() * r * 0.7, a: Math.random() * 6 };
      bm.position.y = Math.random() * h * 0.8;
      bm.renderOrder = 2;
      grp.add(bm);
      bubbles.push(bm);
    }
    root.add(grp);
    energyMats.push(liquidMat);
    return { ...tk, grp, liquid, liquidMat, bubbles, top: h * (tk.fill ?? 0.86) - 0.04 };
  });

  // --- reactor orbs (glowing voxel orb + spinning rings)
  const orbs = D.orbs.map((o) => {
    const grp = new THREE.Group();
    grp.position.set(...o.pos);
    const orbMat = tintMat(o.color ?? 0xffffff);
    const og = new VoxGrid();
    og.sphere(0, 0, 0, o.r, 0xd8d8d8, true);
    og.sphere(0, 0, 0, Math.max(0.6, o.r - 1), 0xffffff, true);
    const orb = makeMesh(og.build({ scale: V, pivot: [0.5, 0.5, 0.5] }), [Mats.solid, orbMat]);
    orb.castShadow = false;
    grp.add(orb);
    const ringMat = tintMat(P.en);
    const rings = (o.rings ?? []).map((rd) => {
      const rg = new VoxGrid();
      ring(rg, 0, 0, 0, 0, rd.r, 0xffffff, true);
      const rm = makeMesh(rg.build({ scale: V, pivot: [0.5, 0.5, 0.5] }), [Mats.solid, ringMat]);
      rm.castShadow = false;
      const pivot = new THREE.Group();
      pivot.rotation.z = rd.tilt ?? 0;
      pivot.add(rm);
      grp.add(pivot);
      return { mesh: rm, pivot, speed: rd.speed ?? 1 };
    });
    root.add(grp);
    return { ...o, grp, orb, orbMat, ringMat, rings };
  });

  // --- core anchor + seat
  const core = new THREE.Group();
  core.name = 'baseCore';
  core.position.set(...D.core);
  root.add(core);
  const seat = new THREE.Object3D();
  seat.name = 'baseSeat';
  seat.position.set(...D.seat);
  seat.rotation.y = sx * (Math.PI / 2 - 0.45);
  root.add(seat);

  // --- idle puffs (exhaust / steam) + damage smoke share a small pool
  const PUFF_N = 14;
  const puffs = [];
  for (let i = 0; i < PUFF_N; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0, depthWrite: false });
    const pm = new THREE.Mesh(CUBE_GEO, mat);
    pm.visible = false;
    pm.castShadow = false;
    root.add(pm);
    puffs.push({ mesh: pm, mat, life: 0, max: 1, vx: 0, vy: 0, s0: 0.1, s1: 0.3, op: 0.6 });
  }
  const spawnPuff = (pos, o) => {
    const p = puffs.find((q) => q.life <= 0);
    if (!p) return;
    p.life = p.max = o.life ?? 1.2;
    p.mesh.position.set(pos[0] + (Math.random() - 0.5) * 0.08, pos[1], pos[2] + (Math.random() - 0.5) * 0.08);
    p.vx = (o.vx ?? 0) * sx + (Math.random() - 0.5) * 0.1;
    p.vy = o.rise ?? 0.6;
    p.s0 = o.s0 ?? 0.08; p.s1 = o.s1 ?? 0.3; p.op = o.op ?? 0.55;
    p.mat.color.setHex(o.color ?? 0x8a8a96);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.mesh.visible = true;
  };
  const idleSrc = D.puffs.map((p) => ({ ...p, acc: Math.random() }));
  const smokeSrc = D.smoke.map((p, i) => ({ pos: p, acc: i * 0.3 }));

  // --- damage fx
  const sparkGrp = new THREE.Group();
  sparkGrp.visible = false;
  const sparks = D.sparks.map((p) => {
    const g = new THREE.Group();
    g.position.set(...p);
    for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(SPARK_GEO, glowMat(i ? 0xffe680 : 0xffffff)));
    sparkGrp.add(g);
    return g;
  });
  root.add(sparkGrp);
  const fireGrp = new THREE.Group();
  fireGrp.visible = false;
  const fires = D.fires.map((p, i) => {
    const f = new THREE.Mesh(FLAME, Mats.pair);
    f.position.set(...p);
    f.userData.ph = i * 1.7;
    f.userData.big = i >= 2;
    fireGrp.add(f);
    return f;
  });
  root.add(fireGrp);
  let rubble = null;

  let t = Math.random() * 10;
  const base = {
    root, seat, core, meshes, tier, side, flip,
    name: BASE_TIERS[tier - 1].name,
    height: D.height, width: D.width, front: D.front, bounds: D.bounds,
    level: 1, damage: 0, stage: 0,
    onChunk: null,
    setLevel(n) {
      this.level = clamp(Math.round(n) || 1, 1, 8);
    },
    setDamage(f) {
      f = clamp(f || 0, 0, 1);
      this.damage = f;
      const s = f >= 1 ? 4 : f >= 0.9 ? 3 : f >= 0.66 ? 2 : f >= 0.33 ? 1 : 0;
      if (s === this.stage) return;
      this.stage = s;
      const emit = (m) => { if (this.onChunk && m.visible) this.onChunk(m); };
      const energy = [...tanks.map((x) => x.grp), ...orbs.map((x) => x.grp)];
      if (s === 4) {
        emit(body);
        for (const c of chunks) if (c.obj.visible) emit(c.mesh);
        for (const a of anims) if (a.grp.visible) emit(a.mesh);
        body.visible = false;
        for (const c of chunks) c.obj.visible = false;
        for (const a of anims) a.grp.visible = false;
        for (const l of lights) l.mesh.visible = l.alive = false;
        for (const e of energy) e.visible = false;
        sparkGrp.visible = false;
        fireGrp.visible = false;
        if (!rubble) {
          rubble = makeMesh(D.rubbleGeo());
          rubble.receiveShadow = true;
          root.add(rubble);
          meshes.push(rubble);
        }
        rubble.visible = true;
        return;
      }
      if (rubble) rubble.visible = false;
      body.visible = true;
      for (const e of energy) e.visible = true;
      body.geometry = D.bodyGeo(s);
      for (const c of chunks) {
        const hide = c.stage <= s;
        if (hide) emit(c.mesh);
        c.obj.visible = !hide;
      }
      for (const a of anims) {
        const hide = a.stage <= s;
        if (hide) emit(a.mesh);
        a.grp.visible = !hide;
      }
      for (const l of lights) {
        l.alive = (l.stage ?? 9) > s;
        l.mesh.visible = l.alive;
      }
      sparkGrp.visible = s >= 1;
      fireGrp.visible = s >= 2;
      fires.forEach((f) => (f.visible = s >= 3 || !f.userData.big));
    },
    update(dt) {
      t += dt;
      const lv = this.level, st = this.stage;
      // animated parts
      for (const a of anims) {
        if (!a.grp.visible) continue;
        const ph = a.phase, amp = a.amp ?? 0.3, fq = a.freq ?? 2;
        const ax = a.axis ?? 'y';
        if (a.type === 'spin') a.grp.rotation[ax] += dt * (a.speed ?? 1) * a.rs;
        else if (a.type === 'sway') a.grp.rotation[ax] = a.rs * (amp * Math.sin(t * fq + ph) + amp * 0.3 * Math.sin(t * fq * 2.7 + ph * 1.3));
        else if (a.type === 'flag') {
          a.grp.rotation.y = a.rs * Math.sin(t * fq + ph) * amp;
          a.mesh.scale.y = 1 + Math.sin(t * fq * 2 + ph) * 0.06;
        } else if (a.type === 'flap') {
          a.grp.rotation[ax] = a.rs * (amp * Math.max(0, Math.sin(t * fq + ph)) ** 2 + amp * 0.25 * Math.sin(t * fq * 3.1 + ph));
        } else if (a.type === 'bob') a.grp.position.y = a.base.y + Math.sin(t * fq + ph) * amp * V;
        else if (a.type === 'jitter') {
          a.grp.position.set(a.base.x + (Math.random() - 0.5) * amp * V, a.base.y + Math.abs(Math.sin(t * 40)) * amp * V, a.base.z);
        } else if (a.type === 'pump') a.mesh.scale.y = 1 + Math.sin(t * fq + ph) * amp;
      }
      // lights
      for (const l of lights) {
        if (!l.alive) continue;
        const mode = l.mode ?? 'blink';
        if (mode === 'blink') l.mesh.visible = ((t * (l.rate ?? 1.4) + l.phase) % 1) < (l.duty ?? 0.55);
        else if (mode === 'flicker') l.mesh.visible = Math.random() > (st >= 2 ? 0.45 : 0.08);
        else l.mesh.visible = st < 3 || Math.random() > 0.3;
      }
      // tanks
      for (const tk of tanks) {
        for (const bm of tk.bubbles) {
          const u = bm.userData;
          bm.position.y += dt * u.sp * (0.6 + lv * 0.1);
          if (bm.position.y > tk.top) { bm.position.y = 0.04; u.r = Math.random() * tk.r * V * 0.7; u.a = Math.random() * 6; }
          bm.position.x = Math.cos(u.a) * u.r + Math.sin(t * 3 + u.ph) * 0.02;
          bm.position.z = Math.sin(u.a) * u.r;
        }
        tk.liquidMat.opacity = 0.38 + Math.sin(t * 3) * 0.06;
      }
      // reactor orbs
      for (const o of orbs) {
        o.orb.rotation.y += dt * 1.6;
        o.orb.rotation.x = Math.sin(t * 0.7) * 0.4;
        const pulse = 1 + Math.sin(t * (o.pulse ?? 3.5) + o.pos[0]) * 0.09;
        o.orb.scale.setScalar(pulse);
        if (st >= 3) o.orb.visible = Math.random() > 0.25;
        for (const r of o.rings) r.mesh.rotation.y += dt * r.speed;
        const k = 0.75 + 0.25 * Math.sin(t * 4 + o.pos[0]);
        o.ringMat.color.setHex(P.en).multiplyScalar(k);
      }
      // puffs: idle exhaust/steam while intact, smoke when damaged
      for (const src of idleSrc) {
        if (st >= (src.until ?? 4)) continue;
        src.acc += dt * (src.rate ?? 2);
        while (src.acc >= 1) { src.acc -= 1; spawnPuff(src.pos, src); }
      }
      if (st >= 1 && st < 4) {
        for (const src of smokeSrc) {
          src.acc += dt * (st === 1 ? 0.9 : st === 2 ? 2 : 3.4);
          while (src.acc >= 1) {
            src.acc -= 1;
            spawnPuff(src.pos, { color: st >= 2 ? 0x2e2a34 : 0x5a5662, life: 1.8, rise: 0.7, s0: 0.12, s1: 0.45 + st * 0.1, op: 0.55 });
          }
        }
      }
      for (const p of puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.mesh.visible = false; continue; }
        const k = 1 - p.life / p.max;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt * (1 - k * 0.5);
        p.mesh.scale.setScalar(p.s0 + (p.s1 - p.s0) * k);
        p.mesh.rotation.y += dt;
        p.mat.opacity = p.op * Math.min(1, k * 6) * (1 - k);
      }
      // damage fx
      if (sparkGrp.visible) {
        for (const g of sparks) {
          const on = Math.random() < 0.3;
          g.visible = on;
          if (on) for (const s of g.children) s.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.3) * 0.3, (Math.random() - 0.2) * 0.2);
        }
      }
      if (fireGrp.visible) {
        for (const f of fires) {
          const ph = f.userData.ph;
          f.scale.set(1 + Math.sin(t * 11 + ph) * 0.15, 0.8 + Math.abs(Math.sin(t * 7 + ph)) * 0.6, 1 + Math.cos(t * 9 + ph) * 0.15);
        }
      }
    },
  };
  return base;
}

// ---------------------------------------------------------------------------
// Construction scaffolding (shown while a Base upgrades)

const scafCache = new Map();
const POLE_C = 0xc9d1dd, POLE_D = 0x8f98aa, CRANE = 0xffc21a, CRANE_D = 0xc8901a;

function scaffoldGeos(Wv, Hv, flip) {
  const key = `${Wv}|${Hv}|${flip ? 1 : 0}`;
  if (scafCache.has(key)) return scafCache.get(key);
  const L = 18;
  const n = Math.max(1, Math.ceil((Hv - 4) / L));
  const x0 = -Math.floor(Wv / 2), x1 = x0 + Wv;
  const z0 = -30, z1 = 18;
  const nx = Math.max(2, Math.round(Wv / 13));
  const px = Array.from({ length: nx + 1 }, (_, i) => Math.round(x0 + (i * Wv) / nx));
  const mir = (g) => (flip ? mirrorGrid(g) : g);
  const opts = { scale: V, pivot: [0, 0, 0], maxSamples: 120 };
  const levels = [];
  const sparkAt = [];
  for (let i = 0; i < n; i++) {
    const ya = i * L, yb = Math.min(Hv, (i + 1) * L);
    const g = new VoxGrid();
    for (const x of px) for (const z of [z0, z1]) {
      g.box(x, ya, z, x, yb, z, POLE_C);
      g.set(x, yb - 1, z, CRANE_D);
      if (i === 0) g.box(x - 1, 0, z - 1, x + 1, 0, z + 1, METAL_DD);
    }
    g.box(x0, yb - 1, z1, x1, yb - 1, z1, POLE_C).box(x0, yb - 1, z0, x1, yb - 1, z0, POLE_C);
    for (const x of px) g.box(x, yb - 1, z0, x, yb - 1, z1, POLE_D);
    // front walkway planks + hazard toe board
    g.box(x0, yb, z1 - 4, x1, yb, z1, (x) => (Math.floor(x / 7) % 2 ? WOOD_L : WOOD));
    g.box(x0, yb + 1, z1 + 1, x1, yb + 2, z1 + 1, hazardC(PAL.yellow, INK, 2));
    // cross braces on the front and back faces
    for (let j = 0; j < px.length - 1; j++) {
      const [a, b2] = j % 2 ? [px[j + 1], px[j]] : [px[j], px[j + 1]];
      g.line(a, ya + 1, z1, b2, yb - 2, z1, POLE_D);
      g.line(a, ya + 1, z0, b2, yb - 2, z0, POLE_D);
    }
    levels.push({ geo: mir(g).build(opts), y: ya });
    sparkAt.push([px[1] + 3, yb - 5, z1 - 2], [px[Math.max(1, px.length - 2)] - 4, yb - 8, z1 - 2]);
  }
  // tower crane at the back corner
  const cxm = x0 - 5, czm = z0 + 4, Hm = Hv + 16;
  const mast = new VoxGrid();
  for (let y = 0; y <= Hm; y++) {
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) mast.set(cxm + dx, y, czm + dz, CRANE);
    if (y % 4 === 0) for (let k = -1; k <= 1; k++) mast.set(cxm + k, y, czm - 1, CRANE).set(cxm + k, y, czm + 1, CRANE).set(cxm - 1, y, czm + k, CRANE).set(cxm + 1, y, czm + k, CRANE);
    if (y % 4 === 2) mast.set(cxm, y, czm + 1, CRANE_D).set(cxm, y, czm - 1, CRANE_D).set(cxm + 1, y, czm, CRANE_D).set(cxm - 1, y, czm, CRANE_D);
  }
  mast.box(cxm - 3, 0, czm - 3, cxm + 3, 1, czm + 3, (x, y, z) => hazardC(PAL.yellow, INK, 2)(x, y, z));
  const Lj = Math.round(Wv * 0.85);
  const jib = new VoxGrid();
  for (let x = -10; x <= Lj; x++) {
    jib.set(x, 0, -1, CRANE).set(x, 0, 1, CRANE);
    if (x >= -1) jib.set(x, 2, 0, CRANE);
    if (x % 3 === 0 && x >= -1) jib.set(x, 1, -1, CRANE_D).set(x, 1, 1, CRANE_D);
  }
  jib.box(-10, -3, -2, -6, -1, 2, 0x9aa2b4); // counterweights
  jib.box(-10, -1, -2, -6, -1, 2, 0x6f7788);
  jib.box(1, -5, -2, 4, -1, 2, 0xf4f6fa).box(4, -4, -2, 4, -2, 1, 0x7fd0ff); // cab
  for (let y = 0; y <= 7; y++) jib.set(0, y, 0, CRANE);
  sagLine(jib, [0, 7, 0], [Lj, 2, 0], METAL_D, 0);
  sagLine(jib, [0, 7, 0], [-9, 1, 0], METAL_D, 0);
  jib.box(Lj - 1, 0, -1, Lj, 2, 1, CRANE_D);
  const hook = new VoxGrid();
  hook.box(-1, -4, -1, 1, -1, 1, (x, y) => (y % 2 ? CRANE : INK));
  hook.box(0, -6, 0, 0, -5, 0, METAL_D).set(1, -7, 0, METAL_D).set(0, -7, 0, METAL_D);
  // hanging load: a lab wall panel with a bolt
  hook.box(-6, -18, -1, 6, -8, 1, (x, y) => ((x + 6) % 6 === 0 || y === -8 || y === -18 ? 0xb4bfd0 : 0xf4f6fa));
  artZ(hook, BOLT, -2, -10, 2, 0xff2e88, { mirror: flip });
  hook.line(-6, -8, 0, 0, -7, 0, METAL_D).line(6, -8, 0, 0, -7, 0, METAL_D);
  const cable = new VoxGrid();
  cable.set(0, 0, 0, METAL_DD);
  const out = {
    levels, n,
    mast: mir(mast).build(opts),
    jib: mir(jib).build({ scale: V, pivot: [flip ? -0.5 : 0.5, 0, 0.5], maxSamples: 80 }),
    hook: mir(hook).build({ scale: V, pivot: [flip ? -0.5 : 0.5, 0, 0.5], maxSamples: 60 }),
    cable: cable.build({ scale: V, pivot: [0.5, 1, 0.5] }),
    mastTop: [(flip ? -1 : 1) * (cxm + 0.5) * V, (Hm + 1) * V, (czm + 0.5) * V],
    Lj, sparkAt: sparkAt.map((p) => [(flip ? -1 : 1) * p[0] * V, p[1] * V, p[2] * V]),
  };
  scafCache.set(key, out);
  return out;
}

/**
 * Construction scaffolding + tower crane for the upgrade transformation.
 * Centred on x = 0 of its parent (place it at the Base's bounds centre); covers
 * z from -2.4 to 1.5. setProgress(k 0..1) raises the scaffold levels and swings
 * the crane; `sparks` are welding anchors (Object3D) the view can emit fx from.
 * @returns {{root, update(dt), setProgress(k), sparks: THREE.Object3D[], hook: THREE.Object3D}}
 */
export function makeScaffold(width = 3, height = 3, o = {}) {
  const flip = !!o.flip;
  const sx = flip ? -1 : 1;
  const Wv = Math.max(16, Math.round(width / V)), Hv = Math.max(18, Math.round(height / V));
  const S = scaffoldGeos(Wv, Hv, flip);
  const root = new THREE.Group();
  root.name = 'scaffold';
  const levels = S.levels.map((l) => {
    const m = makeMesh(l.geo);
    m.castShadow = true;
    root.add(m);
    return { mesh: m, shown: false, pop: 0 };
  });
  root.add(makeMesh(S.mast));
  const jibGrp = new THREE.Group();
  jibGrp.position.set(...S.mastTop);
  root.add(jibGrp);
  jibGrp.add(makeMesh(S.jib));
  const trolley = new THREE.Group();
  trolley.position.set(sx * S.Lj * 0.72 * V, 0, 0);
  jibGrp.add(trolley);
  const cable = makeMesh(S.cable);
  cable.castShadow = false;
  trolley.add(cable);
  const hook = new THREE.Group();
  hook.add(makeMesh(S.hook));
  trolley.add(hook);
  const beacon = new THREE.Mesh(CUBE_GEO, glowMat(0xff3040));
  beacon.scale.setScalar(V * 1.5);
  beacon.position.set(0, 8.5 * V, 0);
  jibGrp.add(beacon);
  const sparkObjs = S.sparkAt.map((p) => {
    const g = new THREE.Group();
    g.position.set(...p);
    for (let i = 0; i < 4; i++) g.add(new THREE.Mesh(SPARK_GEO, glowMat(i ? 0xffe680 : 0xffffff)));
    root.add(g);
    return g;
  });
  let k = 0, t = Math.random() * 5;
  const api = {
    root, sparks: sparkObjs, hook,
    setProgress(v) {
      k = clamp(v, 0, 1);
      const n = levels.length;
      levels.forEach((l, i) => {
        const show = k > 0 && k >= (i / n) * 0.6;
        if (show && !l.shown) l.pop = 0;
        l.shown = show;
        l.mesh.visible = show;
      });
    },
    update(dt) {
      t += dt;
      for (const l of levels) if (l.shown && l.pop < 1) { l.pop = Math.min(1, l.pop + dt * 5); l.mesh.scale.y = 0.4 + 0.6 * l.pop; }
      jibGrp.rotation.y = sx * (-0.35 + k * 0.9 + Math.sin(t * 0.4) * 0.12);
      const drop = (6 + (Hv * 0.45) * (0.5 + 0.5 * Math.sin(t * 0.7 + k * 6))) * V;
      hook.position.y = -drop;
      cable.scale.y = drop / V;
      hook.rotation.y = Math.sin(t * 0.9) * 0.3;
      beacon.visible = (t * 1.5) % 1 < 0.5;
      const active = k > 0 && k < 1;
      for (const g of sparkObjs) {
        const on = active && Math.random() < 0.35;
        g.visible = on;
        if (on) for (const s of g.children) s.position.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.2) * 0.25, Math.random() * 0.15);
      }
    },
  };
  api.setProgress(o.progress ?? 1);
  return api;
}
