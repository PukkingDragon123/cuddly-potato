// In-battle Base upgrade tiers. Every battle each side's Base starts as a
// scrappy Camp Lab and is upgraded mid-battle (costs POWER) through six tiers,
// each bigger and more high-tech than the last:
//   1 Camp Lab -> 2 Lab Shack -> 3 Trailer Lab -> 4 Field Lab -> 5 Beast Lab -> 6 Mega HQ
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
import { rbox, cyl, shade, n3 } from '../kit.js';
import { PAL, mixHex, hash3, mulberry32, clamp, vnoise, ring, text, textW, mirrorGrid, glassMat, glowMat, tintMat, hazardC } from './common.js';
import { panelBox, windowZ, windowX, dishGrid, antennaGrid, pipe, hazard, signZ, boltEmblem, barrel, crate } from './labParts.js';
import { makeLabBuilding } from './lab.js';

const V = 0.08; // world units per voxel
const FRONT = 21; // front face plane in voxels (front-most facade voxels at x = 20)
export const BASE_VOXEL = V;
export const BASE_FRONT = FRONT * V;

export const BASE_TIERS = [
  { tier: 1, name: 'Camp Lab', desc: 'A folding lab table under a pop-up canopy: a bunsen burner, bubbling flasks and one jug of energy. Everyone starts somewhere!' },
  { tier: 2, name: 'Lab Shack', desc: 'A clapboard cabin with a rusty tin roof, a porch lab bench, a stovepipe and a frying-pan satellite dish.' },
  { tier: 3, name: 'Trailer Lab', desc: 'A camper trailer turned mobile lab: fold-out lab bench, solar panel, dish and bubbling glassware.' },
  { tier: 4, name: 'Field Lab', desc: 'A prefab modular lab with a distillation tower, a Tesla coil and a bubbling energy tank.' },
  { tier: 5, name: 'Beast Lab', desc: 'The full MrBeast Lab: glowing energy core, control tower and a giant satellite dish.' },
  { tier: 6, name: 'Mega HQ', desc: 'A towering fortress-lab with twin reactors, force-field pylons and a giant bolt spire.' },
];

// ---------------------------------------------------------------------------
// Palettes (side 0 = MrBeast Lab blue/white, side 1 = rival red/graphite)
const TEAM = [
  {
    m: 0x29b6f6, md: 0x1477c9, mdd: 0x0d4f8a, ml: 0x8fe3ff, glow: 0x7ae8ff, en: 0x3fd6ff,
    w: 0xf4f6fa, w2: 0xe2e8f0, seam: 0xb4bfd0, dk: 0x3d4352, ar0: 0x3e4f78, ar0b: 0x33426a,
    tarp: 0x2f8fe0, tarpD: 0x1f64a8, tarpL: 0x6ab8f4,
    bolt: 0xff2e88, boltL: 0xff8ac0, boltD: 0xc2185b,
  },
  {
    m: 0xff3d55, md: 0xb8202e, mdd: 0x6e1420, ml: 0xffa0ac, glow: 0xff8a6a, en: 0xff5a3a,
    w: 0x7a7488, w2: 0x6a6478, seam: 0x433d50, dk: 0x2a2534, ar0: 0x3c3448, ar0b: 0x322b3e,
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

/** Lightning-bolt outline (x 0..10, y 0..16, y up). */
const BOLT_POLY = [[4.2, 16], [9.7, 16], [6.3, 10.1], [9.5, 10.1], [2.0, 0], [4.5, 7.3], [0.9, 7.3]];
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Extruded 3D lightning bolt (scale s voxels per unit): rim highlight, glowing core line. (x0,y0) = bottom-left. */
function boltSolid(g, x0, y0, zb, zf, s, P, m, glow = true) {
  const W = Math.round(10 * s), H = Math.round(16 * s);
  const mask = (u, v) => u >= 0 && v >= 0 && u < W && v < H && inPoly(((m ? W - 1 - u : u) + 0.5) / s, (v + 0.5) / s, BOLT_POLY);
  const dist = (u, v) => {
    for (let d = 1; d <= 4; d++)
      for (let a = -d; a <= d; a++)
        for (let c = -d; c <= d; c++) if (Math.max(Math.abs(a), Math.abs(c)) === d && !mask(u + a, v + c)) return d;
    return 5;
  };
  for (let u = 0; u < W; u++)
    for (let v = 0; v < H; v++) {
      if (!mask(u, v)) continue;
      const d = dist(u, v);
      for (let z = zb; z <= zf; z++) {
        const face = z === zf || z === zb;
        if (face && d >= 3 && glow) { g.set(x0 + u, y0 + v, z, P.boltL, true); continue; }
        g.set(x0 + u, y0 + v, z, d === 1 ? (face ? P.boltL : P.boltD) : face && d === 2 ? P.bolt : shade(P.bolt, -0.08));
      }
    }
  return { W, H };
}

/** Floating energy crystal (glowing octahedron). */
function crystalGrid(col, r = 2) {
  const g = new VoxGrid();
  for (let x = -r; x <= r; x++) for (let y = -r - 1; y <= r + 1; y++) for (let z = -r; z <= r; z++) {
    const d = Math.abs(x) + Math.abs(y) * (r / (r + 1)) + Math.abs(z);
    if (d <= r + 0.2) g.set(x, y, z, d < r - 0.8 ? 0xffffff : col, true);
  }
  return g;
}

/** Horizontal fan (blades in the XZ plane -> spins about y). */
function flatFan(r, col) {
  const g = new VoxGrid();
  fanGrid(Math.round(r), col).forEach((x, y, z, c) => g.set(x, z, y, c));
  return g;
}

/** Spinning fan blades (local, centred, in the XY plane -> spins about z). */
function fanGrid(r = 3, col = 0xe2e8f0, hub = METAL_D) {
  const g = new VoxGrid();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    for (let i = 1; i <= r; i++) {
      g.set(Math.round(Math.cos(a) * i), Math.round(Math.sin(a) * i), 0, col);
      g.set(Math.round(Math.cos(a + 0.45) * i), Math.round(Math.sin(a + 0.45) * i), 0, col);
    }
  }
  g.set(0, 0, 0, hub).set(0, 0, 1, hub);
  return g;
}

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

// ---------------------------------------------------------------------------
// Grid processing (hollowing, battle damage, rubble)

/** Remove voxels buried deeper than `d` (keeps a skin; cheaper damage processing). `inner` collects the removed cells. */
function hollow(g, d = 2, inner = null) {
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
  if (inner) for (const v of kill) inner.push(v);
  return g;
}

/** Bite predicate shared by damageGrid and refill (true = carved away). */
const bitten = (bites, x, y, z) => {
  for (const [cx, cy, cz, r] of bites) {
    const d = (x - cx) ** 2 + (y - cy) ** 2 * 1.2 + (z - cz) ** 2;
    if (d < r * r + hash3(x, y, z) * 2.2) return true;
  }
  return false;
};
/**
 * Bake a hollowed grid with its cavity filled back in (dark interior), so no
 * never-visible cavity faces are emitted; cells carved by bites stay empty.
 */
function bakeSolid(g, inner, bites, opts) {
  const s = g.clone();
  for (let i = 0; i < inner.length; i += 3) {
    const x = inner[i], y = inner[i + 1], z = inner[i + 2];
    if (!s.has(x, y, z) && !(bites.length && bitten(bites, x, y, z))) s.set(x, y, z, INNER);
  }
  return s.build(opts);
}

/** Progressive battle damage: scorch, cracks, bitten-out chunks. Deterministic per stage. Fills `outBites`. */
function damageGrid(src, stage, seed = 7, outBites = []) {
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
    outBites.push([cx, cy, cz, r]);
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
// Lab-gear brushes: glassware, burners, microscopes, Tesla coils. Glass is
// opaque voxels, so liquid shows on the shell below the fill line (as if seen
// through the glass), with a few glow voxels on the camera side.

const GLASS = 0xd8f4ff, GLASS_L = 0xffffff, GLASS_D = 0xa8d6ee;
const LIQ = { green: 0x7dff5a, pink: 0xff5fb8, blue: 0x3fd6ff, yellow: 0xffd23f, purple: 0xb873ff, orange: 0xff8a2a };
const COPPER = 0xd8803a, COPPER_D = 0xa85a24;
const MAT = 0x4a5266, MAT_D = 0x3a4154;

/** Round-bottom flask, (x, y, z) = bottom centre; r = bulb radius. o: { fill (-1..1 of r), neck } */
function flask(g, x, y, z, r, liq, o = {}) {
  const cy = y + r, fill = cy + (o.fill ?? 0.15) * r;
  const R = Math.ceil(r + 1);
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
    const d = Math.hypot(dx, dy, dz);
    if (d > r + 0.45) continue;
    const yy = cy + dy;
    if (yy < y) continue;
    let c, glow = false;
    if (yy <= fill) {
      c = dy < -r * 0.55 ? shade(liq, -0.12) : liq;
      glow = yy === Math.floor(fill) && dz >= r - 1 && dx % 2 === 0;
      if (yy === Math.floor(fill) && dz > 0) c = mixHex(liq, 0xffffff, 0.45);
    } else {
      c = dx < 0 && dy > r * 0.2 && dz > 0 ? GLASS_L : d > r - 0.6 && dx > r * 0.5 ? GLASS_D : GLASS;
    }
    g.set(x + dx, yy, z + dz, c, glow);
  }
  const n = o.neck ?? 3;
  g.box(x, cy + r, z, x, cy + r + n, z, GLASS);
  g.set(x - 1, cy + r, z, GLASS).set(x + 1, cy + r, z, GLASS).set(x, cy + r, z - 1, GLASS).set(x, cy + r, z + 1, GLASS);
  g.box(x - 1, cy + r + n, z - 1, x + 1, cy + r + n, z + 1, GLASS_D).set(x, cy + r + n, z, INK);
  return cy + r + n;
}

/** Erlenmeyer (conical) flask, (x, y, z) = bottom centre. */
function erlen(g, x, y, z, h, rb, liq, fill = 0.5) {
  for (let dy = 0; dy < h; dy++) {
    const r = rb * (1 - (dy / h) * 0.78);
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > r + 0.4) continue;
      const wet = dy < h * fill;
      const c = wet ? (dy === 0 ? shade(liq, -0.15) : liq) : dx < 0 && dz > 0 ? GLASS_L : GLASS;
      g.set(x + dx, y + dy, z + dz, c, wet && dy === 1 && dz >= R - 0.5 && dx === 0);
    }
  }
  g.box(x, y + h, z, x, y + h + 1, z, GLASS).set(x, y + h + 2, z, GLASS_D);
}

/** Beaker (open cylinder), liquid surface visible from above. */
function beaker(g, x, y, z, r, h, liq, fill = 0.6) {
  const R = Math.ceil(r);
  const top = y + Math.max(1, Math.round(h * fill));
  for (let dy = 0; dy < h; dy++) for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > r + 0.4) continue;
    const yy = y + dy, rim = d > r - 0.6;
    if (yy > top && !rim) continue;
    const wet = yy <= top;
    const c = wet ? (yy === top ? mixHex(liq, 0xffffff, 0.35) : liq) : (dx < 0 ? GLASS_L : GLASS);
    g.set(x + dx, yy, z + dz, c, yy === top && rim && dz > 0 && dx % 2 === 0);
  }
  // measuring ticks + spout
  for (let dy = 1; dy < h - 1; dy += 2) g.set(x - 1, y + dy, z + R, wetTick(y + dy, top));
  g.set(x + R, y + h - 1, z, GLASS_L);
}
const wetTick = (yy, top) => (yy <= top ? 0xffffff : GLASS_D);

/** Wooden rack of test tubes (cols = liquid colours), (x, y, z) = left bottom. Returns x after the rack. */
function tubeRack(g, x, y, z, cols) {
  const n = cols.length, w = n * 2 + 1;
  g.box(x, y, z - 1, x + w - 1, y, z + 1, WOOD);
  g.box(x, y + 1, z - 1, x, y + 3, z + 1, WOOD_D).box(x + w - 1, y + 1, z - 1, x + w - 1, y + 3, z + 1, WOOD_D);
  g.box(x, y + 3, z - 1, x + w - 1, y + 3, z + 1, WOOD_L);
  cols.forEach((c, i) => {
    const tx = x + 1 + i * 2, top = y + 5 + (i % 2);
    g.box(tx, y + 1, z, tx, top, z, GLASS);
    g.box(tx, y + 1, z, tx, y + 3, z, c);
    g.set(tx, y + 3, z, c, true);
    if (i % 2 === 0) g.set(tx, top + 1, z, PAL.red);
  });
  return x + w;
}

/** Bunsen burner (flame is an anim part). */
function burner(g, x, y, z) {
  g.box(x - 1, y, z - 1, x + 1, y, z + 1, METAL_D);
  g.box(x, y + 1, z, x, y + 3, z, METAL);
  g.set(x + 1, y + 1, z, METAL_D);
  g.set(x, y + 2, z + 1, METAL_L);
  return y + 4;
}
/** Small blue-orange flame for burners (pivot at its base). */
function flameGrid() {
  const g = new VoxGrid();
  g.set(0, 0, 0, 0x3a8cff, true).set(0, 1, 0, 0x6ab8ff, true).set(0, 2, 0, 0xffc04a, true).set(0, 3, 0, 0xfff2a0, true);
  g.set(1, 1, 0, 0x3a8cff, true).set(-1, 1, 0, 0x3a8cff, true).set(0, 1, 1, 0x3a8cff, true).set(0, 1, -1, 0x3a8cff, true);
  return g;
}

/** Microscope facing +x (eyepiece toward -x). (x, y, z) = base centre. */
function microscope(g, x, y, z, P) {
  g.box(x - 2, y, z - 2, x + 2, y, z + 2, P.w2);
  g.box(x - 2, y + 1, z - 1, x - 1, y + 7, z + 1, P.w);
  g.box(x - 1, y + 7, z - 1, x + 1, y + 8, z + 1, P.w);
  g.box(x, y + 4, z - 2, x + 2, y + 4, z + 2, INK);
  g.box(x + 1, y + 5, z, x + 1, y + 7, z, METAL);
  g.set(x + 1, y + 5, z, METAL_DD);
  g.line(x - 1, y + 9, z, x - 3, y + 11, z, P.md);
  g.set(x - 3, y + 12, z, INK);
  g.set(x - 2, y + 3, z + 2, P.m).set(x - 2, y + 3, z - 2, P.m);
}

/** Tesla coil (copper winding, toroid top + glowing orb), (x, y, z) = base centre. Returns the top y. */
function teslaCoil(g, x, y, z, h, P) {
  g.box(x - 2, y, z - 2, x + 2, y + 1, z + 2, (xx, yy) => (yy === y + 1 ? METAL : METAL_DD));
  cyl(g, 'y', x, z, y + 2, y + h, 1.1, 1.1, (xx, yy) => (yy % 2 ? COPPER : COPPER_D));
  ring(g, x, z, y + h + 1, y + h + 1, 2.6, METAL_L, false, 2);
  g.box(x - 1, y + h + 1, z - 1, x + 1, y + h + 2, z + 1, METAL_L);
  g.set(x, y + h + 3, z, P.glow, true);
  return y + h + 3;
}

/**
 * Break up a box-shaped building mass so it never reads as a plain cuboid:
 * bevelled vertical edges with trim, an overhanging cornice / band lips, a
 * protruding plinth and pilaster ribs on the camera facade (only over plain wall).
 * o: { trim, dark, chamfer, lips: [[y, colour], ...], plinth (colour | false), rib (spacing), walls: [colours], maxX }
 */
function dressBox(g, x0, y0, z0, x1, y1, z1, o = {}) {
  const trim = o.trim ?? METAL_L, dark = o.dark ?? shade(trim, -0.22), c = o.chamfer ?? 1, maxX = o.maxX ?? 20;
  if (c > 0) for (let y = y0; y <= y1; y++) for (const [ex, ez, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]]) {
    for (let i = 0; i < c; i++) for (let j = 0; j < c - i; j++) g.del(ex + sx * i, y, ez + sz * j);
    for (let i = 0; i <= c; i++) { const x = ex + sx * i, z = ez + sz * (c - i); if (g.has(x, y, z)) g.set(x, y, z, (y - y0) % 4 === 0 ? dark : trim); }
  }
  const ringAt = (y, col) => {
    const put = (x, z) => { if (x > maxX || g.has(x, y, z) || (o.skip && o.skip(x, y, z))) return; g.set(x, y, z, col); };
    for (let x = x0 + c; x <= x1 - c; x++) { put(x, z0 - 1); put(x, z1 + 1); }
    for (let z = z0 + c; z <= z1 - c; z++) { put(x0 - 1, z); put(x1 + 1, z); }
    for (let i = 0; i < c; i++) { put(x0 + i, z0 + c - 1 - i - 0); put(x1 - i, z0 + c - 1 - i); put(x0 + i, z1 - c + 1 + i); put(x1 - i, z1 - c + 1 + i); }
  };
  for (const [y, col] of o.lips ?? [[y1, trim], [y1 - 1, dark]]) ringAt(y, col);
  if (o.plinth !== false) { ringAt(y0, o.plinth ?? dark); ringAt(y0 + 1, o.plinth ?? dark); }
  if (o.rib) {
    const walls = new Set(o.walls ?? []);
    for (let x = x0 + c + Math.floor(o.rib / 2); x <= x1 - c - 1; x += o.rib)
      for (let y = y0 + 2; y <= y1 - 2; y++) if (!g.has(x, y, z1 + 1) && walls.has(g.get(x, y, z1)) && !(o.skip && o.skip(x, y, z1 + 1))) g.set(x, y, z1 + 1, (y - y0) % 6 === 0 ? dark : trim);
  }
  return g;
}

/** Crackling arcs for a Tesla coil top (spun fast as an anim): zigzag glow bolts radiating out. */
function arcGrid(r = 5, col = 0xbfe8ff) {
  const g = new VoxGrid();
  const R = mulberry32(5);
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2;
    let x = 0, y = 0, z = 0;
    for (let i = 1; i <= r; i++) {
      const a = a0 + (R() - 0.5) * 0.9;
      x = Math.round(Math.cos(a) * i); z = Math.round(Math.sin(a) * i); y += Math.round((R() - 0.5) * 2);
      g.set(x, y, z, i === r ? 0xffffff : col, true);
    }
  }
  return g;
}

/** Glass condenser tube from a to b with a liquid trickle inside. */
function condenser(g, a, b, liq) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(a[0] + (b[0] - a[0]) * t), y = Math.round(a[1] + (b[1] - a[1]) * t), z = Math.round(a[2] + (b[2] - a[2]) * t);
    g.set(x, y, z, i % 3 === 1 ? liq : GLASS, i % 3 === 1);
  }
}

/** Whiteboard scribbles (formulas + a graph) on a +Z face, mirror-aware. */
function scribbles(g, x0, y0, x1, y1, z, m) {
  const put = (x, y, c) => g.set(m ? x1 - (x - x0) : x, y, z, c);
  const R = mulberry32(17);
  // E=MC2 in blue marker
  const art = ['###.....#.#.###.###', '#...###.###.#.....#', '##.......#.#.#...##', '#...###.#.#.#...#..', '###.....#.#.###.###'];
  art.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#' && x0 + 1 + c <= x1 - 1) put(x0 + 1 + c, y1 - 1 - r, 0x2a4ac8); }));
  // red graph line + axes
  for (let x = x0 + 1; x <= x0 + 9 && x < x1; x++) put(x, y0 + 1, INK);
  for (let y = y0 + 1; y <= y0 + 5 && y < y1 - 6; y++) put(x0 + 1, y, INK);
  let gy = y0 + 2;
  for (let x = x0 + 2; x <= x0 + 9 && x < x1; x++) { gy = Math.min(y1 - 7, gy + (R() < 0.6 ? 1 : 0)); put(x, gy, PAL.red); }
  for (let i = 0; i < 6; i++) put(x0 + 12 + (i % 3) * 2, y0 + 1 + Math.floor(i / 3) * 2, i % 2 ? 0x2a8a3a : 0x2a4ac8);
}

// ---------------------------------------------------------------------------
// TIER 1: Camp Lab (pop-up canopy over a folding lab table)
function tier1(P, m) {
  const b = new VoxGrid();
  const cx = -3, cz = -1, CX0 = -18, CX1 = 12, CZ0 = -11, CZ1 = 9, EY = 26, PY = 32;
  const hx = (CX1 - CX0) / 2 + 1, hz = (CZ1 - CZ0) / 2 + 1;
  const HZ = hazardC(PAL.yellow, INK, 2);
  // --- rubber lab mat with hazard-taped front edge
  b.box(CX0 - 1, 0, CZ0 - 1, CX1 + 1, 0, CZ1 + 1, (x, y, z) => {
    if (z === CZ1 + 1) return HZ(x, y, z);
    if (x === CX0 - 1 || x === CX1 + 1 || z === CZ0 - 1) return MAT_D;
    return (x + z) % 2 ? MAT : shade(MAT, -0.04);
  });
  // --- canopy legs (stay standing when the canopy blows away)
  for (const [lx, lz] of [[CX0, CZ0], [CX1, CZ0], [CX0, CZ1], [CX1, CZ1]]) {
    b.box(lx, 1, lz, lx, EY - 1, lz, METAL_L);
    b.set(lx, 8, lz, METAL_D).set(lx, 9, lz, METAL_D);
    b.box(lx - 1, 0, lz - 1, lx + 1, 0, lz + 1, METAL_D);
  }
  // --- folding lab table
  const TX0 = -14, TX1 = 8, TZ0 = -4, TZ1 = 4, TY = 10;
  b.box(TX0, TY, TZ0, TX1, TY, TZ1, (x, y, z) => (x === TX0 || x === TX1 || z === TZ0 || z === TZ1 ? 0xd4dce8 : 0xf6f8fb));
  b.box(TX0, TY - 1, TZ1, TX1, TY - 1, TZ1, METAL_L).box(TX0, TY - 1, TZ0, TX1, TY - 1, TZ0, METAL_L);
  for (const [l0, l1] of [[TX0 + 1, TX0 + 5], [TX1 - 1, TX1 - 5]]) for (const lz of [TZ0 + 1, TZ1 - 1]) {
    b.line(l0, 0, lz, l1, TY - 2, lz, METAL_D);
    b.line(l1, 0, lz, l0, TY - 2, lz, METAL_D);
  }
  b.box(TX0 + 3, 4, TZ0 + 1, TX0 + 3, 4, TZ1 - 1, METAL).box(TX1 - 3, 4, TZ0 + 1, TX1 - 3, 4, TZ1 - 1, METAL);
  // under the table: a supply crate with a stencilled bolt + a red jerrycan
  crate(b, -9, 1, -3, 5, WOOD);
  artZ(b, BOLT_MINI, -8, 4, 2, P.m, { mirror: m });
  b.box(1, 1, -1, 3, 5, 1, PAL.red).box(2, 6, 0, 2, 6, 0, INK).set(1, 6, 0, PAL.redD);
  // --- glassware on the table: burner + ring stand + flask -> condenser -> Erlenmeyer, tube rack, microscope
  const ty = TY + 1;
  const bTop = burner(b, -11, ty, 0);
  b.box(-13, ty, -2, -13, ty + 12, -2, METAL_D).box(-14, ty, -3, -12, ty, -1, METAL_DD);
  ring(b, -11, 0, ty + 4, ty + 4, 2.6, METAL_D);
  b.box(-13, ty + 4, -1, -13, ty + 4, 0, METAL_D);
  const neck = flask(b, -11, bTop + 1, 0, 2.6, LIQ.green, { fill: 0.1, neck: 2 });
  condenser(b, [-11, neck, 0], [-5, neck - 1, 0], LIQ.green);
  condenser(b, [-5, neck - 1, 0], [-4, ty + 7, 1], LIQ.green);
  b.box(-6, neck - 2, 0, -4, neck - 2, 0, METAL_DD);
  b.box(-6, ty, -1, -6, neck - 2, -1, METAL_D).box(-7, ty, -2, -5, ty, 0, METAL_DD);
  erlen(b, -3, ty, 1, 6, 3, LIQ.pink, 0.55);
  tubeRack(b, 0, ty, -3, [LIQ.blue, LIQ.yellow, LIQ.purple, LIQ.green]);
  microscope(b, 6, ty, 1, P);
  // --- the Commander's seat: a team-colour cooler on a supply crate (back side)
  crate(b, -30, 0, -4, 7, WOOD);
  crate(b, -29, 0, 3, 5, WOOD_L);
  const CX0c = -30, CX1c = -24, CZ0c = -4, CZ1c = 2;
  rbox(b, CX0c, 7, CZ0c, CX1c, 11, CZ1c, 1, (x, y, z) => (y === 9 && (z === CZ1c || x === CX1c) ? 0xf4f6fa : y === 7 ? P.md : P.m));
  rbox(b, CX0c, 12, CZ0c, CX1c, 12, CZ1c, 0, (x, y, z) => ((x + z) % 2 ? 0xf4f6fa : 0xe6ebf2));
  b.box(CX0c + 2, 10, CZ1c + 1, CX1c - 2, 10, CZ1c + 1, METAL_DD);
  // --- energy jug (core) on a crate at the front, wired to the table
  crate(b, 12, 0, 2, 7, WOOD);
  artZ(b, BOLT_MINI, 14, 5, 9, PAL.yellow, { mirror: m });
  const JX = 15, JZ = 5, JY = 7;
  cyl(b, 'y', JX, JZ, JY, JY, 2.6, 2.6, METAL_D);
  cyl(b, 'y', JX, JZ, JY + 9, JY + 10, 2.6, 2.6, (x, y) => (y === JY + 10 ? METAL : P.m));
  b.box(JX, JY + 11, JZ, JX, JY + 12, JZ, METAL_DD).set(JX, JY + 13, JZ, PAL.red);
  sagLine(b, [JX - 1, JY + 11, JZ], [TX1, TY + 1, 2], PAL.red, 1.2);
  sagLine(b, [JX + 1, JY + 11, JZ], [TX1 - 1, TY + 1, -2], INK, 1);
  // --- pop-up canopy (stripes run down each slope, scalloped LAB valance) (stage 3)
  const can = new VoxGrid();
  const roofY = (x, z) => EY + Math.round((1 - Math.max(Math.abs(x - cx) / hx, Math.abs(z - cz) / hz)) * (PY - EY));
  for (let x = CX0 - 1; x <= CX1 + 1; x++) for (let z = CZ0 - 1; z <= CZ1 + 1; z++) {
    const y = roofY(x, z);
    const ax = Math.abs(x - cx) / hx, az = Math.abs(z - cz) / hz;
    const u = az >= ax ? x - cx : z - cz;
    const stripe = (((Math.floor((u + 100) / 3)) & 1) === 0);
    let c = stripe ? P.m : 0xf4f6fa;
    if (Math.abs(ax - az) < 0.05) c = METAL_L;
    can.set(x, y, z, c).set(x, y - 1, z, stripe ? P.md : 0xc8d0dc);
  }
  const vY0 = EY - 6, vY1 = EY - 1;
  const valance = (x, z, u) => {
    for (let y = vY0 + 1; y <= vY1; y++) can.set(x, y, z, P.m);
    can.set(x, vY1 + 1, z, 0xf4f6fa);
    if (((u % 4) + 4) % 4 < 2) can.set(x, vY0, z, P.m);
  };
  for (let x = CX0 - 1; x <= CX1 + 1; x++) { valance(x, CZ1 + 1, x); valance(x, CZ0 - 1, x); }
  for (let z = CZ0; z <= CZ1; z++) { valance(CX0 - 1, z, z); valance(CX1 + 1, z, z); }
  paint(can, 'LAB', cx + 1, vY0 + 1, CZ1 + 2, '+z', 0xffffff, { center: true, mirror: m });
  artZ(can, BOLT_MINI, cx - 12, vY0 + 5, CZ1 + 2, 0xffffff, { mirror: m });
  artZ(can, BOLT_MINI, cx + 10, vY0 + 5, CZ1 + 2, 0xffffff, { mirror: m });
  can.box(cx, PY, cz, cx, PY + 6, cz, METAL_L);
  // sandbag weights on the legs
  for (const [lx, lz] of [[CX0, CZ0], [CX1, CZ0], [CX0, CZ1], [CX1, CZ1]]) can.box(lx - 1, 1, lz - 1, lx + 1, 2, lz + 1, (x, y) => (y === 2 ? 0xc8b48a : 0xa8946a));
  // --- whiteboard on an easel behind the table (stage 2)
  const wb = new VoxGrid();
  const WX0 = -9, WX1 = 7, WY0 = 13, WY1 = 21, WZ = -9;
  wb.box(WX0 - 1, WY0 - 1, WZ, WX1 + 1, WY1 + 1, WZ, METAL_L);
  wb.box(WX0, WY0, WZ + 1, WX1, WY1, WZ + 1, 0xffffff);
  scribbles(wb, WX0, WY0, WX1, WY1, WZ + 2, m);
  for (const lx of [WX0 + 1, WX1 - 1]) wb.line(lx, 0, WZ + 2, lx, WY0 - 1, WZ, METAL_D);
  wb.box(WX0, WY0 - 1, WZ + 1, WX1, WY0 - 1, WZ + 2, METAL);
  wb.set(WX0 + 2, WY0 - 1, WZ + 3, PAL.red).set(WX0 + 4, WY0 - 1, WZ + 3, 0x2a4ac8);
  // --- lantern hanging under the canopy (anim)
  const lan = new VoxGrid();
  lan.set(0, -1, 0, METAL_D).set(0, -2, 0, METAL_D);
  lan.box(-1, -3, -1, 1, -3, 1, 0x2f6a4a);
  lan.box(-1, -6, -1, 1, -4, 1, 0xfff2c8);
  lan.box(0, -6, 0, 0, -4, 0, WARM, true);
  lan.set(0, -5, 1, WARM, true);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lan.box(x, -6, z, x, -4, z, METAL_D);
  lan.box(-1, -7, -1, 1, -7, 1, 0x2f6a4a);
  // --- pennant on the canopy peak (anim)
  const flag = new VoxGrid();
  for (let x = 0; x <= 6; x++) for (let y = 0; y <= 3; y++) if (Math.abs(y - 1.5) <= 2 * (1 - x / 7.5)) flag.set(x, y, 0, x < 2 ? 0xf4f6fa : P.m);
  return {
    body: b,
    chunks: [
      { name: 'whiteboard', grid: wb, stage: 2 },
      { name: 'canopy', grid: can, stage: 3 },
    ],
    anims: [
      { name: 'flame', type: 'pump', amp: 0.28, freq: 11, grid: flameGrid(), at: [-11 + 0.5, bTop, 0.5], stage: 4 },
      { name: 'lantern', type: 'sway', axis: 'z', amp: 0.14, freq: 1.6, grid: lan, at: [4.5, roofY(4, 4) - 1, 4.5], stage: 3 },
      { name: 'pennant', type: 'flag', amp: 0.35, freq: 3, grid: flag, at: [cx + 0.5, PY + 3, cz + 0.5], stage: 3, dx: 1 },
    ],
    lights: [
      ...Array.from({ length: 6 }, (_, i) => ({ at: [CX0 + 2.5 + i * 5.4, vY0 - 0.6, CZ1 + 1.5], color: [WARM, P.glow, 0x9dff7a][i % 3], mode: 'blink', rate: 0.8, duty: 0.75, phase: i * 0.23, size: 1.2, stage: 3 })),
      { at: [6.5, ty + 1.5, 2.5], color: 0x5fff7a, mode: 'blink', rate: 1.4, size: 0.9, stage: 2 },
    ],
    tanks: [{ at: [JX + 0.5, JY + 1, JZ + 0.5], r: 2.2, h: 8, bubbles: 5, fill: 0.8 }],
    core: [JX + 0.5, JY + 5, JZ + 0.5],
    seat: [(CX0c + CX1c + 1) / 2, 13, (CZ0c + CZ1c + 1) / 2 - 0.5],
    fires: [[cx, EY + 3, cz + 6], [-11, ty + 3, 3], [-27, 8, 3]],
    sparks: [[JX + 0.5, JY + 12, JZ + 1], [6, ty + 9, 2], [-13, ty + 12, 1]],
    smoke: [[cx + 0.5, PY + 1, cz], [-6, ty + 4, 2]],
    rubble: { cols: [P.m, 0xf4f6fa, METAL_L, WOOD, MAT, GLASS, P.md], h: 4 },
  };
}

// ---------------------------------------------------------------------------
// TIER 2: Lab Shack (clapboard cabin with a gable tin roof, porch lab bench, stovepipe)
function tier2(P, m) {
  const b = new VoxGrid();
  const BRD = 0xb27a46, BRD_L = 0xc68c54, BRD_D = 0x8e5a30, BRD_G = 0x9a8c7c, SEAMC = 0x5e3a1e, TRIM = 0xe8dcc4;
  const TIN = 0xb4bcc8, TIN_D = 0x8a94a6, TIN_L = 0xdce2ea, RUST = 0xb06a36, RUST_D = 0x84481f;
  const ORANGE = 0xff7a1a;
  // cabin footprint (gable end faces the camera, ridge runs along z)
  const X0 = -24, X1 = 2, Z0 = -13, Z1 = 7, Y0 = 4, EAVE = 20;
  const RCX = (X0 + X1) / 2, RISE = 12, HALF = (X1 - X0) / 2 + 2;
  const roofY = (x) => EAVE + Math.round(RISE * (1 - Math.abs(x - RCX) / HALF));
  // cinder-block footings + floor deck
  for (const x of [X0, RCX - 2, X1 - 3]) for (const z of [Z0, Z1 - 3]) b.box(Math.round(x), 0, z, Math.round(x) + 3, Y0 - 2, z + 3, (xx, yy, zz) => ((xx + zz + yy) % 4 === 0 ? 0x7c8496 : 0xa4acbc));
  b.box(X0 - 1, Y0 - 1, Z0 - 1, X1 + 1, Y0 - 1, Z1 + 1, WOOD_D);
  // clapboard walls (2-voxel boards with dark lap lines, weathered boards, corner trim)
  const board = (x, y, z) => {
    const onZ = z === Z0 || z === Z1;
    const u = onZ ? x : z;
    const row = Math.floor((y - Y0) / 2);
    if ((y - Y0) % 2 === 0) return SEAMC;
    const h = hash3(row, Math.floor((u + row * 5) / 9), onZ ? 3 : 4);
    let c = h < 0.18 ? BRD_D : h < 0.32 ? BRD_G : h > 0.8 ? BRD_L : BRD;
    if (n3(x, y, z, 6) < 0.1) c = shade(c, -0.08);
    return c;
  };
  for (let x = X0; x <= X1; x++) b.box(x, Y0, Z0, x, roofY(x) - 1, Z1, board);
  for (const x of [X0, X1]) for (const z of [Z0, Z1]) b.box(x, Y0, z, x, EAVE - 1, z, TRIM);
  b.box(X0, Y0, Z1 + 1, X1, Y0, Z1 + 1, TRIM);
  // front door (gable end) with Z-brace, porch light, knob, hazard sticker
  const DX0 = -21, DX1 = -15, DY1 = 15;
  b.box(DX0 - 1, Y0, Z1 + 1, DX1 + 1, DY1 + 1, Z1 + 1, TRIM);
  b.box(DX0, Y0 + 1, Z1 + 1, DX1, DY1, Z1 + 1, null);
  b.box(DX0, Y0 + 1, Z1, DX1, DY1, Z1, (x) => ((x - DX0) % 2 ? 0x5a8a9a : 0x6a9aaa));
  for (const y of [Y0 + 3, DY1 - 2]) b.box(DX0, y, Z1 + 1, DX1, y, Z1 + 1, 0x4a7a8a);
  b.line(DX0, Y0 + 4, Z1 + 1, DX1, DY1 - 3, Z1 + 1, 0x4a7a8a);
  b.set(DX1 - 1, 10, Z1 + 2, PAL.gold);
  b.box(DX0 + 2, 12, Z1 + 1, DX0 + 4, 13, Z1 + 1, PAL.yellow).set(DX0 + 3, 12, Z1 + 2, INK);
  b.box(DX0 - 2, Y0, Z1 + 2, DX1 + 2, Y0, Z1 + 3, WOOD_L);
  // window with open shutters + glowing flasks on the sill
  const WX0 = -8, WX1 = -3, WY0 = 9, WY1 = 15;
  b.box(WX0 - 1, WY0 - 1, Z1 + 1, WX1 + 1, WY1 + 1, Z1 + 1, TRIM);
  b.box(WX0, WY0, Z1 + 1, WX1, WY1, Z1 + 1, null);
  b.box(WX0, WY0, Z1, WX1, WY1, Z1, (x, y) => ((x + y) % 5 === 0 ? 0xd8f2ff : 0x2a3a5a));
  b.box(WX0 + 3, WY0, Z1 + 1, WX0 + 3, WY1, Z1 + 1, TRIM).box(WX0, WY0 + 3, Z1 + 1, WX1, WY0 + 3, Z1 + 1, TRIM);
  for (const sx2 of [WX0 - 4, WX1 + 2]) b.box(sx2, WY0 - 1, Z1 + 1, sx2 + 2, WY1 + 1, Z1 + 1, (x, y) => (y % 2 ? P.m : P.md));
  b.box(WX0 - 1, WY0 - 2, Z1 + 1, WX1 + 1, WY0 - 2, Z1 + 3, WOOD_L);
  flask(b, WX0, WY0 - 1, Z1 + 2, 1, LIQ.green, { neck: 1, fill: 0.4 });
  erlen(b, WX0 + 3, WY0 - 1, Z1 + 2, 3, 1.6, LIQ.pink, 0.6);
  // round attic vent in the gable with a glowing bolt
  const AY = EAVE + 8;
  cyl(b, 'z', Math.round(RCX), AY, Z1, Z1 + 1, 2.6, 2.6, (x, y, z) => (z === Z1 + 1 ? (Math.hypot(x - RCX, y - AY) > 2 ? TRIM : null) : 0x2a3a5a));
  artZ(b, ['.#', '##', '#.'], Math.round(RCX) - 1, AY + 1, Z1, P.bolt, { mirror: m, glow: true });
  // gable tin roof (corrugated along the slope, rust patches, ridge cap, dark underside)
  for (let x = X0 - 2; x <= X1 + 2; x++) for (let z = Z0 - 2; z <= Z1 + 2; z++) {
    const y = roofY(x);
    const rib = (z & 1) === 0;
    const rust = vnoise(x * 0.25, 3, z * 0.25) < 0.28;
    b.set(x, y, z, rust ? (rib ? RUST : RUST_D) : rib ? TIN_L : TIN);
    b.set(x, y - 1, z, z === Z0 - 2 || z === Z1 + 2 ? TIN_D : WOOD_D);
  }
  for (let z = Z0 - 2; z <= Z1 + 2; z++) b.set(Math.round(RCX), roofY(RCX) + 1, z, TIN_D).set(Math.round(RCX) - 1, roofY(RCX), z, TIN_D);
  for (let x = X0 - 2; x <= X1 + 2; x++) if (x % 3 === 0) b.set(x, roofY(x) - 1, Z1 + 3, WOOD_D);
  // stovepipe chimney on the back slope
  const CHX = X0 + 5, CHZ = Z0 + 4;
  b.box(CHX, roofY(CHX) - 1, CHZ, CHX + 1, roofY(CHX) + 12, CHZ + 1, (x, y) => (y % 5 === 0 ? METAL_DD : METAL_D));
  b.box(CHX - 1, roofY(CHX) + 13, CHZ - 1, CHX + 2, roofY(CHX) + 13, CHZ + 2, METAL_DD);
  // --- porch lean-to on the +x side: posts, sloped tin, lab bench under it
  const PX0 = X1 + 1, PX1 = 19, PZ0 = -11, PZ1 = 9;
  const lean = (x) => EAVE - Math.round(((x - PX0) * 5) / (PX1 - PX0));
  for (let x = PX0; x <= PX1 + 1; x++) for (let z = PZ0 - 1; z <= PZ1 + 1; z++) {
    const rust = vnoise(x * 0.3, 7, z * 0.3) < 0.25;
    b.set(x, lean(x), z, rust ? RUST : (z & 1) ? TIN : TIN_L);
  }
  for (const z of [PZ0, PZ1]) { b.box(PX1, 0, z, PX1, lean(PX1) - 1, z, WOOD); b.set(PX1, 0, z, WOOD_D); }
  b.box(PX1, lean(PX1) - 1, PZ0, PX1, lean(PX1) - 1, PZ1, WOOD_D);
  // lab bench (planks on sawhorses) with burner, retort, beakers and a battery (core)
  const BX0 = 4, BX1 = 17, BY = 8, BZ0 = -4, BZ1 = 3;
  b.box(BX0, BY, BZ0, BX1, BY, BZ1, (x, y, z) => ((z - BZ0) % 3 === 0 ? WOOD_D : WOOD_L));
  for (const sx2 of [BX0 + 2, BX1 - 2]) { b.line(sx2 - 2, 0, BZ0 + 1, sx2, BY - 1, BZ0 + 1, WOOD); b.line(sx2 + 2, 0, BZ0 + 1, sx2, BY - 1, BZ0 + 1, WOOD); b.line(sx2 - 2, 0, BZ1 - 1, sx2, BY - 1, BZ1 - 1, WOOD); b.line(sx2 + 2, 0, BZ1 - 1, sx2, BY - 1, BZ1 - 1, WOOD); }
  const by = BY + 1;
  const bt = burner(b, 7, by, 0);
  const nk = flask(b, 7, bt + 1, 0, 1.6, LIQ.purple, { neck: 1, fill: 0.2 });
  condenser(b, [7, nk, 0], [12, nk - 2, 1], LIQ.purple);
  condenser(b, [12, nk - 2, 1], [13, by + 5, 1], LIQ.purple);
  beaker(b, 13, by, 1, 2, 5, LIQ.purple, 0.5);
  tubeRack(b, 9, by, -3, [LIQ.green, LIQ.blue, LIQ.pink]);
  beaker(b, 5, by, -3, 1.4, 4, LIQ.yellow, 0.7);
  // car battery under the bench = energy core, cables up to the gear
  const KX = 11, KZ = 0;
  b.box(KX - 2, 0, KZ - 1, KX + 2, 5, KZ + 1, (x, y) => (y === 5 ? 0x2a2a34 : 0x1c1c24));
  b.box(KX - 2, 6, KZ, KX - 2, 6, KZ, PAL.red).box(KX + 2, 6, KZ, KX + 2, 6, KZ, INK);
  artZ(b, BOLT_MINI, KX - 1, 4, KZ + 2, P.bolt, { mirror: m });
  b.set(KX + 2, 4, KZ + 2, 0x5fff7a, true);
  sagLine(b, [KX - 2, 7, KZ], [7, by, 1], PAL.red, -2);
  // rain barrel + firewood at the back corner
  barrel(b, X0 - 3, 0, 5, 0x5a7a9a, { h: 9, r: 3 });
  for (const [lx, ly] of [[X0 - 5, 1], [X0 - 2, 1], [X0 - 3.5, 3]]) cyl(b, 'z', lx, ly, -13, -8, 1.1, 1.1, (x, y, z) => (z === -13 || z === -8 ? 0xe0b070 : 0x7a4a24));
  // extension cord + fairy-light wire along the porch eave
  for (let x = PX0; x <= PX1; x++) b.set(x, lean(x) - 1, PZ1 + 1, INK);
  sagLine(b, [PX1, 2, PZ1], [X1 + 4, 0, Z1 + 4], ORANGE, 0);

  // --- lookout deck on the porch roof: the Commander's seat (old armchair cushion)
  const deck = new VoxGrid();
  const SX0 = 7, SX1 = 15, SZ0 = -4, SZ1 = 3, SY = lean(SX0) + 1;
  deck.box(SX0, SY, SZ0, SX1, SY, SZ1, (x, y, z) => ((x - SX0) % 3 === 0 ? WOOD_D : WOOD));
  for (let x = SX0; x <= SX1; x++) for (let y = lean(x) + 1; y < SY; y++) deck.set(x, y, SZ0, WOOD_D).set(x, y, SZ1, WOOD_D);
  deck.box(SX0 + 1, SY + 1, SZ0 + 1, SX1 - 1, SY + 1, SZ1 - 1, P.md);
  deck.box(SX0 + 1, SY + 2, SZ0 + 1, SX1 - 1, SY + 2, SZ1 - 1, (x, y, z) => ((x + z) % 3 ? P.m : P.ml));
  deck.box(SX0, SY + 1, SZ0 - 1, SX0, SY + 5, SZ1 + 1, P.md);
  // hand-painted LAB sign board over the porch (stage 2) with marquee bulbs
  const sign = new VoxGrid();
  const GX0 = -17, GX1 = -5, GZ = Z1 + 1, GY0 = EAVE - 3, GY1 = GY0 + 6;
  sign.box(GX0, GY0, GZ, GX1, GY1, GZ, (x, y) => (y === GY0 || y === GY1 || x === GX0 || x === GX1 ? WOOD_D : (x * 3 + y) % 7 === 0 ? 0xf0e6d0 : 0xfaf4e6));
  paint(sign, 'LAB', ((GX0 + GX1 + 1) >> 1), GY0 + 1, GZ + 1, '+z', P.bolt, { center: true, mirror: m, wobble: 1, seed: 9 });
  // TV antenna on the roof (stage 1)
  const lad = new VoxGrid().merge(antennaGrid(10, { tipCol: P.bolt }), Math.round(RCX) + 4, roofY(RCX + 4) + 1, -5);
  // frying-pan satellite dish on the roof ridge (anim)
  const R = 3.2, tilt = 0.7, ct = Math.cos(tilt), st = Math.sin(tilt);
  const pan = dishGrid({ r: R, col: 0xc4ccd8, back: 0x3a3a46, rim: 0x2a2a34, post: WOOD_L, tip: P.glow, tilt });
  for (let i = 1; i <= 4; i++) { const dx = -(R + i), dy = R / 1.6; pan.set(Math.round(dx * ct + dy * st), Math.round(6 - dx * st + dy * ct), 0, i > 2 ? 0x1a1a22 : 0x2a2a34); }
  // generator behind the cabin (anim: rattles)
  const gen = new VoxGrid();
  const GY = 0xffc21a, GYD = 0xd99a10, CAGE = 0x2a2a32;
  gen.box(-1, 1, -3, 2, 5, 3, (x, y) => (y === 3 ? GYD : GY));
  gen.box(-1, 1, -3, 2, 2, -1, METAL_D);
  gen.box(-1, 6, -2, 2, 6, 2, PAL.red).set(0, 7, 1, INK);
  for (const x of [-2, 3]) for (const z of [-4, 4]) gen.box(x, 0, z, x, 7, z, CAGE);
  for (const y of [0, 7]) { gen.box(-2, y, -4, 3, y, -4, CAGE).box(-2, y, 4, 3, y, 4, CAGE); gen.box(-2, y, -4, -2, y, 4, CAGE).box(3, y, -4, 3, y, 4, CAGE); }
  gen.set(1, 4, 4, P.glow, true).set(2, 3, 4, PAL.red);
  gen.box(-1, 7, -3, 0, 8, -2, METAL_D).set(-1, 9, -3, METAL_DD);
  return {
    body: b,
    chunks: [
      { name: 'antenna', grid: lad, stage: 1 },
      { name: 'sign', grid: sign, stage: 2 },
      { name: 'deck', grid: deck, stage: 4 },
    ],
    anims: [
      { name: 'flame', type: 'pump', amp: 0.28, freq: 11, grid: flameGrid(), at: [7.5, bt, 0.5], stage: 4 },
      { name: 'pan', type: 'spin', axis: 'y', speed: 0.9, grid: pan, at: [Math.round(RCX) + 0.5, roofY(RCX) + 1, Z0 + 1.5], stage: 2 },
      { name: 'generator', type: 'jitter', amp: 0.35, grid: gen, at: [X0 - 4.5, 0, -2.5], stage: 9 },
    ],
    lights: [
      ...Array.from({ length: 5 }, (_, i) => { const x = PX0 + 1 + i * 4; return { at: [x + 0.5, lean(x) - 1.6, PZ1 + 1.5], color: [WARM, P.boltL, P.glow, 0x9dff7a][i % 4], mode: 'blink', rate: 0.9, duty: 0.7, phase: i * 0.21, size: 1.3, stage: 1 }; }),
      ...Array.from({ length: 5 }, (_, i) => ({ at: [GX0 + 1.5 + i * 2.5, GY1 + 1.2, GZ + 0.5], color: WARM, mode: 'blink', rate: 1.6, duty: 0.6, phase: i * 0.2, size: 1.1, stage: 2 })),
      { at: [DX0 - 1.5, DY1 + 1.5, Z1 + 2], color: WARM, mode: 'steady', size: 1.4, stage: 3 },
    ],
    puffs: [
      { at: [CHX + 1, roofY(CHX) + 14.5, CHZ + 1], color: 0x9a9aa6, rate: 1.6, rise: 0.6, s0: 0.08, s1: 0.32, life: 1.6, op: 0.5, vx: -0.2, until: 3 },
      { at: [X0 - 4.5, 9.5, -2.5], color: 0x8a8a96, rate: 2.2, rise: 0.55, s0: 0.06, s1: 0.22, life: 1.1, op: 0.45, vx: -0.15, until: 4 },
    ],
    core: [KX + 0.5, 3.5, KZ + 0.5],
    seat: [(SX0 + SX1 + 1) / 2 + 1, SY + 3, (SZ0 + SZ1 + 1) / 2 - 0.5],
    fires: [[-14, roofY(-14) + 1, 0], [-4, roofY(-4) + 1, -6], [12, 10, PZ1 + 1]],
    sparks: [[KX, 7, KZ + 2], [-3, 14, Z1 + 1], [-15, EAVE, Z1 + 2]],
    smoke: [[Math.round(RCX), roofY(RCX) + 1, 0], [CHX + 1, roofY(CHX) + 13, CHZ + 1]],
    rubble: { cols: [BRD, BRD_D, BRD_L, TIN, TIN_D, RUST, P.m], h: 6 },
  };
}
// ---------------------------------------------------------------------------
// TIER 3: Trailer Lab
function tier3(P, m) {
  const b = new VoxGrid();
  const X0 = -14, X1 = 17, Y0 = 6, Y1 = 30, Z0 = -12, Z1 = 9;
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
  b.line(X1, 6, Z1 - 4, 22, 6, -2, METAL_D, 0).line(X1, 6, Z0 + 4, 22, 6, -2, METAL_D, 0);
  b.line(X1, 7, Z1 - 4, 22, 7, -2, METAL_D, 0).line(X1, 7, Z0 + 4, 22, 7, -2, METAL_D, 0);
  b.box(21, 6, -3, 23, 8, -1, METAL_DD).set(22, 9, -2, METAL_L);
  b.box(20, 1, -2, 20, 5, -2, METAL).box(19, 0, -2, 21, 0, -2, INK);
  b.box(18, 8, -9, 20, 13, 3, (x, y, z) => (y === 13 ? METAL_L : (x + y + z) % 2 ? METAL : METAL_L));
  b.box(18, 11, 3, 20, 11, 3, P.m);
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
  win(-8, -2, 18, 25, [
    's......',
    '.g...g.',
    '.g.g.gK',
    'gGgg.gK',
    'GGGgBgK',
    'GGGgBg.',
    '.ggg.g.',
    '-------',
  ]);
  win(0, 4, 18, 25, [
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
  boltZ(b, X0 + 2, 25, Z1, P.bolt, { mirror: m, scale: 1 });
  // energy tank stand + caps + pipe to the trailer (core)
  const TX = -19, TZ = 3;
  b.box(TX - 3, 0, TZ - 3, TX + 3, 1, TZ + 3, METAL_DD);
  cyl(b, 'y', TX, TZ, 2, 3, 3.1, 3.1, (x, y) => (y === 3 ? P.m : METAL_D));
  ring(b, TX, TZ, 2, 2, 3.6, P.glow, true);
  cyl(b, 'y', TX, TZ, 14, 15, 3.1, 3.1, (x, y) => (y === 14 ? P.m : METAL));
  b.box(TX, 16, TZ, TX, 17, TZ, METAL_D).set(TX, 18, TZ, P.bolt);
  for (const [dx, dz] of [[-3, 0], [0, -3]]) b.box(TX + dx, 4, TZ + dz, TX + dx, 13, TZ + dz, METAL_D);
  pipe(b, 'x', TX + 3, X0 + 1, 12, TZ - 2, METAL, P.m, 0, 4);
  // fold-out lab bench under the windows (hinged shelf on struts) with glassware
  const FB0 = -11, FB1 = -1, FY = 13;
  b.box(FB0, FY, Z1 + 1, FB1, FY, Z1 + 4, (x, y, z) => (z === Z1 + 4 ? P.md : (x + z) % 4 === 0 ? P.w2 : P.w));
  b.line(FB0, FY - 4, Z1 + 1, FB0, FY - 1, Z1 + 3, METAL_D).line(FB1, FY - 2, Z1 + 1, FB1, FY - 1, Z1 + 2, METAL_D);
  const fy = FY + 1;
  const ft = burner(b, -9, fy, Z1 + 2);
  flask(b, -9, ft + 1, Z1 + 2, 1.6, LIQ.green, { neck: 1, fill: 0.25 });
  tubeRack(b, -6, fy, Z1 + 2, [LIQ.pink, LIQ.blue, LIQ.yellow]);
  beaker(b, -2, fy, Z1 + 3, 1.2, 4, LIQ.purple, 0.6);
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
      { name: 'flame', type: 'pump', amp: 0.28, freq: 11, grid: flameGrid(), at: [-8.5, ft, Z1 + 2.5], stage: 4 },
      { name: 'dish', type: 'spin', axis: 'y', speed: 0.8, grid: dishGrid({ r: 3.5, col: P.w, back: METAL, rim: P.bolt, tip: P.bolt }), at: [19.5, 14, -3.5], stage: 2 },
    ],
    lights: [
      { at: [13.5, Y1 + 16.2, -6.5], color: 0xff3040, mode: 'blink', rate: 1.1, stage: 1, size: 1.6 },
      ...Array.from({ length: 5 }, (_, i) => ({ at: [AX0 + 1.5 + i * 3, AY - 4.4, AZ1 - 0.5], color: [WARM, P.boltL, P.glow][i % 3], mode: 'blink', rate: 0.8, duty: 0.75, phase: i * 0.27, size: 1.2, stage: 2 })),
    ],
    tanks: [{ at: [TX + 0.5, 4, TZ + 0.5], r: 2.7, h: 10, bubbles: 6 }],
    core: [TX + 0.5, 9, TZ + 0.5],
    seat: [8.5, Y1 + 3, -0.5],
    fires: [[-8, Y1 + 1, 2], [12, 25, Z1 + 1], [-13, 20, Z1 + 1]],
    sparks: [[17, 12, 0], [-9, 22, Z1 + 1], [10, Y1, Z1 + 1], [-20, 15, 7]],
    smoke: [[0, Y1 + 2, -2], [-10, Y1, 2]],
    rubble: { cols: [P.w, P.w2, P.m, METAL, METAL_D, 0x23232b, 0x1c3a8a], h: 7 },
  };
}

// ---------------------------------------------------------------------------
// TIER 4: Field Lab (prefab modular lab)
function tier4(P, m) {
  const b = new VoxGrid();
  const HZ = hazardC(PAL.yellow, INK, 2);
  const CON = 0xc8ccd6, CON_D = 0xa8aeba;
  // concrete slab with hazard edges
  b.box(-30, 0, -16, 21, 1, 15, (x, y, z) => (y === 1 && (z >= 14 || x >= 20) ? HZ(x, y, z) : x % 8 === 0 || z % 8 === 0 ? CON_D : CON));
  // ground module
  const GX0 = -26, GX1 = 18, GY0 = 2, GY1 = 25, GZ0 = -14, GZ1 = 10;
  panelBox(b, GX0, GY0, GZ0, GX1, GY1, GZ1, { c1: P.w, c2: P.w2, seam: P.seam, px: 9, py: 11 });
  b.box(GX0, GY0, GZ0, GX1, GY0 + 2, GZ1, (x, y) => (y === GY0 + 2 ? P.m : P.md));
  b.box(GX0, GY1 - 2, GZ0, GX1, GY1 - 2, GZ1, P.m);
  b.box(GX0, GY1 - 1, GZ0, GX1, GY1, GZ1, (x, y, z) => (y === GY1 && (x + z) % 4 === 0 ? P.boltL : P.bolt));
  b.box(GX0, GY1 + 1, GZ0, GX1, GY1 + 1, GZ1, (x, y, z) => ((Math.floor(x / 3) + Math.floor(z / 3)) & 1 ? METAL_D : shade(METAL_D, -0.12)));
  // sliding lab door (left) + lamp + LAB sign
  const DX0 = -23, DX1 = -16, DY1 = 15, DM = (DX0 + DX1) >> 1;
  hazard(b, DX0 - 1, GY0 + 1, GZ1 + 1, DX1 + 1, DY1 + 1, GZ1 + 1);
  b.box(DX0, GY0 + 1, GZ1 + 1, DX1, DY1, GZ1 + 1, null);
  b.box(DX0, GY0 + 1, GZ1, DX1, DY1, GZ1, (x, y) => (x === DM || x === DM + 1 ? METAL_D : (x + y) % 7 === 0 ? 0xd8f2ff : 0x8ec4e6));
  b.box(DX0 + 1, 9, GZ1 + 1, DM - 1, 9, GZ1 + 1, METAL_L).box(DM + 2, 9, GZ1 + 1, DX1 - 1, 9, GZ1 + 1, METAL_L);
  signZ(b, 'LAB', DM + 1, DY1 + 2, GZ1 + 1, { board: 0x1b2440, color: P.bolt, pad: 1, mirror: m });
  // window band
  windowZ(b, -12, 12, -2, 19, GZ1, { mull: 4, frame: P.w2, glass: 0x8ec4e6, shine: true, glow: false });
  // round vent with a spinning fan (anim)
  const FX = -7, FY = 6;
  cyl(b, 'z', FX, FY, GZ1, GZ1, 3.2, 3.2, METAL_DD);
  for (let a = 0; a < 40; a++) b.set(Math.round(FX + Math.cos((a / 40) * 6.283) * 3.9), Math.round(FY + Math.sin((a / 40) * 6.283) * 3.9), GZ1 + 1, METAL_L);
  // energy tank niche (core)
  const TKX = 8, TKZ = 14, TY0 = GY0 + 3, TY1 = 21;
  b.carve((x, y, z) => y >= TY0 && y <= TY1 && (x - TKX) ** 2 + (z - TKZ) ** 2 < 5.3 ** 2);
  b.paint((x, y, z) => (y >= TY0 && y <= TY1 && z <= GZ1 && (x - TKX) ** 2 + (z - TKZ) ** 2 < 6.6 ** 2 ? ((x + y) % 4 < 2 ? METAL_DD : P.mdd) : undefined));
  cyl(b, 'y', TKX, TKZ, GY0, GY0 + 2, 4.8, 4.8, (x, y) => (y === GY0 + 2 ? P.m : METAL_D));
  ring(b, TKX, TKZ, GY0 + 1, GY0 + 1, 5.3, P.glow, true);
  cyl(b, 'y', TKX, TKZ, TY1 + 1, TY1 + 3, 4.8, 4.8, (x, y) => (y === TY1 + 1 ? P.m : y === TY1 + 3 ? METAL : P.w));
  ring(b, TKX, TKZ, TY1 + 2, TY1 + 2, 5.3, P.bolt);
  for (const dx of [-5, 5]) b.box(TKX + dx, TY0, TKZ, TKX + dx, TY1, TKZ, METAL_D);
  for (let a = 0; a < 10; a++) b.set(Math.round(TKX + Math.cos(a * 0.628) * 4), TY1 + 4, Math.round(TKZ + Math.sin(a * 0.628) * 4), METAL_D);
  pipe(b, 'z', GZ1 - 1, TKZ, TKX, TY1 + 5, METAL, P.m, 1, 3);
  // distillation column (lab tower) at the back corner, piped into both modules
  const DCX = -30, DCZ = -9;
  cyl(b, 'y', DCX, DCZ, 2, 50, 2.2, 2.2, (x, y) => (y % 8 === 0 ? P.m : y % 8 === 1 ? P.md : (x + y) % 5 === 0 ? METAL : METAL_L));
  cyl(b, 'y', DCX, DCZ, 51, 53, 1.3, 1.3, METAL_D);
  cyl(b, 'y', DCX, DCZ, 54, 54, 2.3, 2.3, METAL_DD);
  for (const y of [12, 30]) { b.box(DCX - 1, y, DCZ + 2, DCX + 1, y + 4, DCZ + 2, (x, yy) => (yy > y + 2 ? GLASS : LIQ.green)); b.set(DCX, y + 2, DCZ + 3, LIQ.green, true); }
  for (let y = 3; y <= 48; y++) { b.set(DCX - 2, y, DCZ + 2, METAL_D).set(DCX + 2, y, DCZ + 2, METAL_D); if (y % 3 === 0) b.box(DCX - 1, y, DCZ + 3, DCX + 1, y, DCZ + 3, METAL); }
  pipe(b, 'x', DCX + 2, -24, 20, DCZ, METAL, P.m, 1, 4);
  pipe(b, 'x', DCX + 2, -24, 37, DCZ + 3, METAL, P.m, 1, 4);
  // Tesla coil on the deck
  const tc = teslaCoil(b, 5, GY1 + 2, 6, 8, P);
  // control panel with LEDs
  b.box(15, 6, GZ1 + 1, 17, 15, GZ1 + 1, METAL_DD);
  b.set(16, 8, GZ1 + 1, 0x5fff7a, true).set(16, 10, GZ1 + 1, 0xff3040, true).box(15, 12, GZ1 + 1, 17, 13, GZ1 + 1, P.glow, true);
  // front face: roll-up shutter in a hazard frame
  hazard(b, GX1 + 1, GY0, -9, GX1 + 2, 19, 5);
  b.box(GX1 + 1, GY0 + 1, -7, GX1 + 2, 17, 3, null);
  b.box(GX1 + 1, GY0 + 1, -7, GX1 + 1, 17, 3, (x, y) => (y % 2 ? METAL : METAL_L));
  b.box(GX1 + 1, GY0 + 1, -7, GX1 + 1, GY0 + 3, 3, INK);
  windowX(b, -12, 13, -10, 19, GX1, { frame: P.w2, glass: 0x8ec4e6, glow: false });
  // upper module (control room)
  const UX0 = -24, UX1 = 2, UY0 = GY1 + 2, UY1 = 41, UZ0 = -12, UZ1 = 5;
  panelBox(b, UX0, UY0, UZ0, UX1, UY1, UZ1, { c1: P.w, c2: P.w2, seam: P.seam, px: 9, py: 8 });
  b.box(UX0, UY0, UZ0, UX1, UY0, UZ1, P.md);
  b.box(UX0, UY1 - 1, UZ0, UX1, UY1 - 1, UZ1, P.m);
  b.box(UX0, UY1, UZ0, UX1, UY1, UZ1, (x, y, z) => ((x + z) % 4 === 0 ? P.boltL : P.bolt));
  b.box(-23, 30, UZ1 + 1, -9, 38, UZ1 + 1, P.w2);
  b.box(-22, 31, UZ1 + 1, -10, 37, UZ1 + 1, null);
  b.box(-22, 31, UZ1, -10, 37, UZ1, (x, y) => (y <= 32 ? METAL_D : 0x24314f));
  for (const mx of [-21, -17, -13]) b.box(mx, 34, UZ1, mx + 2, 35, UZ1, P.glow, true);
  b.box(-16, 31, UZ1 + 1, -16, 37, UZ1 + 1, P.w2);
  boltEmblem(b, -4, 34, UZ1 + 1, { r: 5, disc: P.bolt, rim: P.w, bolt: 0xffffff, glow: false });
  // seat cushion on the deck
  b.box(9, GY1 + 2, -4, 15, GY1 + 2, 2, P.md).box(9, GY1 + 3, -4, 15, GY1 + 3, 2, (x, y, z) => ((x + z) % 3 ? P.m : P.ml));
  // stair ladder to the deck (+x end, back)
  for (let y = GY0; y <= GY1; y += 3) b.box(GX1 + 1, y, -12, GX1 + 1, y, -10, METAL_L);
  b.box(GX1 + 1, GY0, -13, GX1 + 1, GY1 + 3, -13, METAL).box(GX1 + 1, GY0, -9, GX1 + 1, GY1 + 3, -9, METAL);

  // deck railing (stage 2)
  const rail = new VoxGrid();
  for (let x = 4; x <= GX1; x += 3) rail.box(x, GY1 + 2, GZ1, x, GY1 + 4, GZ1, PAL.yellow);
  rail.box(4, GY1 + 4, GZ1, GX1, GY1 + 4, GZ1, PAL.yellow);
  for (let z = GZ0; z <= GZ1; z += 3) rail.box(GX1, GY1 + 2, z, GX1, GY1 + 4, z, PAL.yellow);
  rail.box(GX1, GY1 + 4, GZ0, GX1, GY1 + 4, GZ1, PAL.yellow);
  // antenna (stage 1)
  const ant = new VoxGrid().merge(antennaGrid(12, { tipCol: P.bolt }), -21, UY1 + 1, 1);
  // roof vents + clutter (stage 3)
  const vents = new VoxGrid();
  vents.box(-3, UY1 + 1, -10, 1, UY1 + 3, -6, METAL).box(-2, UY1 + 4, -9, 0, UY1 + 4, -7, METAL_D);
  vents.box(-14, UY1 + 1, -11, -12, UY1 + 4, -9, METAL_L).box(-15, UY1 + 5, -12, -11, UY1 + 5, -8, METAL_D);
  const clutter = new VoxGrid();
  barrel(clutter, -28, 2, 9, P.m, { hazard: true, h: 7, r: 2 });
  barrel(clutter, -28, 2, 4, PAL.yellow, { h: 6, r: 2 });
  crate(clutter, -30, 2, -3, 4);
  // break up the module boxes: bevelled corners, band lips, plinth, facade pilasters
  const tankClear4 = (x, y, z) => (x - TKX) ** 2 + (z - TKZ) ** 2 < 6.5 ** 2;
  dressBox(b, GX0, GY0, GZ0, GX1, GY1, GZ1, { trim: P.w2, dark: P.seam, lips: [[GY1, P.bolt], [GY1 - 1, P.boltD], [GY1 - 2, P.m]], plinth: P.md, rib: 9, walls: [P.w, P.w2], skip: tankClear4 });
  dressBox(b, UX0, UY0, UZ0, UX1, UY1, UZ1, { trim: P.w2, dark: P.seam, lips: [[UY1, P.bolt], [UY1 - 1, P.boltD]], plinth: P.md, rib: 9, walls: [P.w, P.w2] });
  return {
    body: b,
    chunks: [
      { name: 'antenna', grid: ant, stage: 1 },
      { name: 'rail', grid: rail, stage: 2 },
      { name: 'clutter', grid: clutter, stage: 2 },
      { name: 'vents', grid: vents, stage: 3 },
    ],
    anims: [
      { name: 'dish', type: 'spin', axis: 'y', speed: 0.7, grid: dishGrid({ r: 5, col: P.w, back: METAL, rim: P.bolt, tip: P.bolt }), at: [-6.5, UY1 + 1, -4.5], stage: 2 },
      { name: 'fan', type: 'spin', axis: 'z', speed: 7, grid: fanGrid(3, P.w2), piv: [0.5, 0.5, 0.5], at: [FX + 0.5, FY + 0.5, GZ1 + 1.5], stage: 3 },
      { name: 'arcs', type: 'spin', axis: 'y', speed: 9, grid: arcGrid(4, P.ml), piv: [0.5, 0.5, 0.5], at: [5.5, tc + 0.5, 6.5], stage: 2 },
    ],
    lights: [
      { at: [-23.5, UY1 + 1.8, 4.5], color: 0xffa62a, mode: 'blink', rate: 1.6, phase: 0, stage: 2 },
      { at: [1.5, UY1 + 1.8, 4.5], color: 0xffa62a, mode: 'blink', rate: 1.6, phase: 0.5, stage: 3 },
      { at: [-20.5, UY1 + 14.6, 1.5], color: 0xff3040, mode: 'blink', rate: 1, stage: 1 },
      { at: [19.5, 20.6, -2], color: 0x5fff7a, mode: 'steady', stage: 3, size: 1.2 },
    ],
    tanks: [{ at: [TKX + 0.5, TY0, TKZ + 0.5], r: 4.3, h: TY1 - TY0 + 1, bubbles: 9 }],
    puffs: [
      { at: [-12.5, UY1 + 6.5, -9.5], color: 0xf0f4fa, rate: 1.2, rise: 0.5, s0: 0.08, s1: 0.3, life: 1.6, op: 0.45, until: 3 },
      { at: [DCX + 0.5, 55.5, DCZ + 0.5], color: 0xe8f0f4, rate: 1.4, rise: 0.6, s0: 0.08, s1: 0.34, life: 1.6, op: 0.45, vx: -0.15, until: 3 },
    ],
    core: [TKX + 0.5, 13, TKZ + 0.5],
    seat: [12.5, GY1 + 4, -0.5],
    fires: [[-14, UY1 + 1, 2], [6, GY1 + 2, 8], [-20, 18, GZ1 + 1]],
    sparks: [[-18, 20, GZ1 + 1], [16, 14, GZ1 + 2], [20, 10, -2], [-6, 36, UZ1 + 2]],
    smoke: [[-10, UY1 + 2, -2], [10, GY1 + 2, -6]],
    rubble: { cols: [P.w, P.w2, P.seam, P.m, P.bolt, METAL, METAL_D], h: 8 },
  };
}

// ---------------------------------------------------------------------------
// TIER 5: Beast Lab (the full MrBeast Lab)
function tier5(P, m) {
  const b = new VoxGrid();
  const HZ = hazardC(PAL.yellow, INK, 2);
  // plinth with underglow + ramp
  b.box(-32, 0, -18, 21, 1, 16, METAL_DD);
  b.box(-32, 2, -18, 21, 2, 16, (x, y, z) => (z >= 15 || x >= 20 ? HZ(x, y, z) : (x + z) % 6 === 0 ? METAL_DD : METAL_D));
  for (let x = -31; x <= 19; x += 3) b.set(x, 1, 16, P.glow, true);
  for (let z = -17; z <= 14; z += 3) b.set(21, 1, z, P.glow, true);
  b.box(22, 0, -7, 23, 1, 6, METAL_D).box(24, 0, -7, 25, 0, 6, METAL_D);
  for (let z = -7; z <= 6; z += 2) b.set(23, 1, z, PAL.yellow).set(25, 0, z, PAL.yellow);
  // main block
  const X0 = -30, X1 = 18, Y0 = 3, Y1 = 35, Z0 = -16, Z1 = 12;
  panelBox(b, X0, Y0, Z0, X1, Y1, Z1, { c1: P.w, c2: P.w2, seam: P.seam, px: 8, py: 11 });
  b.box(X0, Y0, Z0, X1, Y0 + 1, Z1, (x, y) => (y === Y0 + 1 ? METAL : METAL_D));
  b.box(X0, 29, Z0, X1, 29, Z1, P.m);
  b.box(X0, 30, Z0, X1, 33, Z1, (x, y, z) => ((x + z) % 4 === 0 && y === 31 ? P.boltL : P.bolt));
  b.box(X0, 34, Z0, X1, 35, Z1, P.w2);
  b.box(X0, Y1 + 1, Z0, X1, Y1 + 1, Z1, (x, y, z) => ((Math.floor(x / 3) + Math.floor(z / 3)) & 1 ? METAL_D : shade(METAL_D, -0.12)));
  b.box(X0, Y1 + 2, Z0, X0, Y1 + 3, Z1, P.w2).box(X0, Y1 + 2, Z0, X1, Y1 + 3, Z0, P.w2).box(X0, Y1 + 2, Z1, 5, Y1 + 3, Z1, P.w2);
  b.box(X0, Y1 + 4, Z0, X0, Y1 + 4, Z1, P.bolt).box(X0, Y1 + 4, Z0, X1, Y1 + 4, Z0, P.bolt).box(X0, Y1 + 4, Z1, 5, Y1 + 4, Z1, P.bolt);
  hazard(b, X1, Y1 + 1, Z0, X1, Y1 + 1, Z1);
  // entrance with canopy (left)
  const EX0 = -28, EX1 = -20, EY1 = 16;
  b.box(EX0 - 1, Y0, Z1 + 1, EX1 + 1, EY1 + 1, Z1 + 1, P.bolt);
  b.box(EX0, Y0, Z1 + 1, EX1, EY1, Z1 + 1, null);
  b.box(EX0, Y0, Z1, EX1, EY1, Z1, (x, y) => (x === EX0 + 4 ? METAL_D : (x + y) % 7 === 0 ? 0xd8f2ff : 0x8ec4e6));
  b.box(EX0 - 2, EY1 + 2, Z1 + 1, EX1 + 2, EY1 + 3, Z1 + 4, (x, y, z) => (z === Z1 + 4 ? P.bolt : P.w2));
  b.set(EX0, EY1 + 1, Z1 + 3, WARM, true).set(EX1, EY1 + 1, Z1 + 3, WARM, true);
  // big bolt emblem + windows
  boltEmblem(b, -9, 12, Z1 + 1, { r: 7, disc: P.bolt, rim: P.w, bolt: 0xffffff, glow: false });
  for (let a = 0; a < 48; a += 4) b.set(Math.round(-9 + Math.cos((a / 48) * 6.283) * 8.6), Math.round(12 + Math.sin((a / 48) * 6.283) * 8.6), Z1 + 1, P.glow, true);
  windowZ(b, -17, 21, -1, 26, Z1, { mull: 3, frame: P.w2, glass: 0x8ec4e6, shine: true, glow: false });
  windowZ(b, -28, 21, -21, 26, Z1, { mull: 3, frame: P.w2, glass: 0x8ec4e6, shine: true, glow: false });
  // giant energy core tank in a facade niche
  const TKX = 8, TKZ = 14, TY0 = 7, TY1 = 28;
  b.carve((x, y, z) => y >= Y0 + 1 && y <= TY1 + 1 && (x - TKX) ** 2 + (z - TKZ) ** 2 < 5.8 ** 2);
  b.paint((x, y, z) => (y >= Y0 + 1 && y <= TY1 + 1 && z <= Z1 && (x - TKX) ** 2 + (z - TKZ) ** 2 < 7.2 ** 2 ? ((x + y) % 4 < 2 ? METAL_DD : P.mdd) : undefined));
  cyl(b, 'y', TKX, TKZ, Y0, TY0 - 1, 5.2, 5.2, (x, y) => (y === TY0 - 1 ? P.m : y === TY0 - 2 ? P.w : METAL_D));
  ring(b, TKX, TKZ, Y0 + 1, Y0 + 1, 5.6, P.glow, true);
  for (let x = -2; x <= 2; x++) b.set(TKX + x, Y0 + 2, TKZ + 6, x % 2 ? INK : PAL.yellow);
  cyl(b, 'y', TKX, TKZ, TY1 + 1, TY1 + 4, 5.2, 5.2, (x, y) => (y === TY1 + 1 ? P.m : y === TY1 + 4 ? METAL : P.w));
  ring(b, TKX, TKZ, TY1 + 2, TY1 + 2, 5.6, P.bolt);
  cyl(b, 'y', TKX, TKZ, TY1 + 5, TY1 + 6, 2.4, 2.4, METAL_D);
  for (const dx of [-6, 6]) b.box(TKX + dx, TY0, TKZ, TKX + dx, TY1, TKZ, METAL_D);
  for (let a = 0; a < 12; a++) b.set(Math.round(TKX + Math.cos((a / 12) * 6.283) * 5.6), TY1 + 3, Math.round(TKZ + Math.sin((a / 12) * 6.283) * 5.6), METAL_DD);
  // LED column + blast door on the front face
  b.box(15, 6, Z1 + 1, 17, 26, Z1 + 1, METAL_DD);
  for (let y = 8; y <= 24; y += 4) b.set(16, y, Z1 + 1, y % 8 ? 0x5fff7a : P.glow, true);
  hazard(b, X1 + 1, Y0, -10, X1 + 2, 25, 6);
  b.box(X1 + 1, Y0, -8, X1 + 2, 23, 4, null);
  b.box(X1 + 1, Y0, -8, X1 + 1, 23, 4, (x, y, z) => (z === -2 || z === -1 ? INK : y % 4 === 0 ? METAL : METAL_L));
  b.box(X1 + 1, 12, -3, X1 + 1, 13, 0, PAL.yellow);
  b.box(X1 + 2, 27, -6, X1 + 2, 27, 2, P.boltL, true);
  windowX(b, -14, 21, -11, 26, X1, { frame: P.w2, glass: 0x8ec4e6, glow: false });
  // Tesla coil on the roof between the tower and the seat
  const tc5 = teslaCoil(b, 2, Y1 + 2, 6, 11, P);
  // seat cushion on the roof (front right)
  b.box(9, Y1 + 2, -4, 16, Y1 + 2, 3, P.boltD).box(9, Y1 + 3, -4, 16, Y1 + 3, 3, (x, y, z) => ((x + z) % 3 ? P.bolt : P.boltL));

  // control tower with the BEAST sign + dish (stage 3)
  const tower = new VoxGrid();
  const TX0 = -27, TX1 = -8, TTY0 = Y1 + 2, TTY1 = 54, TZ0 = -13, TZ1 = 3;
  panelBox(tower, TX0, TTY0, TZ0, TX1, TTY1, TZ1, { c1: P.w, c2: P.w2, seam: P.seam, px: 7, py: 9 });
  signZ(tower, 'BEAST', (TX0 + TX1) >> 1, TTY0 + 2, TZ1 + 1, { board: 0x1b2440, color: P.bolt, pad: 1, mirror: m, frame: P.w2 });
  tower.box(TX0, 46, TZ1, TX1, 50, TZ1, (x, y) => (y === 46 ? METAL_D : 0x24314f));
  for (let x = TX0 + 2; x <= TX1 - 2; x += 4) tower.box(x, 48, TZ1, x + 1, 49, TZ1, P.glow, true);
  tower.box(TX0 - 1, 45, TZ1 + 1, TX1 + 1, 45, TZ1 + 1, P.w2).box(TX0 - 1, 51, TZ1 + 1, TX1 + 1, 51, TZ1 + 1, P.w2);
  tower.box(TX0, 52, TZ0, TX1, 52, TZ1, P.m);
  tower.box(TX0 - 1, 53, TZ0 - 1, TX1 + 1, 54, TZ1 + 1, (x, y, z) => ((x + z) % 4 === 0 && y === 54 ? P.boltL : P.bolt));
  tower.box(TX0, 55, TZ0, TX1, 55, TZ1, METAL_D);
  windowX(tower, -11, 46, -2, 50, TX1, { frame: P.w2, glass: 0x24314f, glow: false });
  // pipes (stage 2)
  const pipes = new VoxGrid();
  pipe(pipes, 'y', TY1 + 6, Y1 + 4, TKX, TKZ, METAL, P.m, 1, 4);
  pipe(pipes, 'z', 4, TKZ, TKX, Y1 + 4, METAL, P.m, 1, 4);
  pipe(pipes, 'x', TX1 + 1, TKX, Y1 + 4, 4, METAL, P.m, 1, 5);
  pipe(pipes, 'y', Y0 + 2, Y1 + 1, X0 - 1, Z1 - 3, METAL_L, P.bolt, 0, 6);
  // roof vents (stage 2) with fans
  const vents = new VoxGrid();
  vents.box(-4, Y1 + 2, -14, 4, Y1 + 5, -6, (x, y, z) => (y === Y1 + 5 ? P.w2 : P.w));
  for (const vx of [-2, 2]) cyl(vents, 'y', vx, -10, Y1 + 6, Y1 + 6, 1.6, 1.6, METAL_DD);
  vents.box(10, Y1 + 2, -14, 15, Y1 + 4, -9, METAL).box(11, Y1 + 5, -13, 14, Y1 + 5, -10, METAL_D);
  // antenna (stage 1)
  const ant = new VoxGrid().merge(antennaGrid(13, { tipCol: P.bolt }), -10, TTY1 + 2, 0);
  const clutter = new VoxGrid();
  barrel(clutter, 17, Y0, 15, PAL.yellow, { h: 5, r: 1 });
  barrel(clutter, 14, Y0, 15, P.m, { h: 6, r: 1, glow: P.glow });
  // break up the main block: bevelled corners, a jutting bolt-stripe band + cornice, plinth, pilasters
  const tankClear5 = (x, y, z) => (x - TKX) ** 2 + (z - TKZ) ** 2 < 7.6 ** 2;
  dressBox(b, X0, Y0, Z0, X1, Y1, Z1, { trim: P.w2, dark: P.seam, lips: [[33, P.bolt], [32, P.bolt], [31, P.boltD], [30, P.bolt], [Y1, P.w2], [29, P.md]], plinth: METAL_D, rib: 8, walls: [P.w, P.w2], skip: tankClear5 });
  dressBox(tower, TX0, TTY0, TZ0, TX1, TTY1, TZ1, { trim: P.w2, dark: P.seam, lips: [[52, P.md], [44, P.w2]], plinth: false, rib: 7, walls: [P.w, P.w2] });
  return {
    body: b,
    chunks: [
      { name: 'antenna', grid: ant, stage: 1 },
      { name: 'clutter', grid: clutter, stage: 1 },
      { name: 'pipes', grid: pipes, stage: 2 },
      { name: 'vents', grid: vents, stage: 2 },
      { name: 'tower', grid: tower, stage: 3 },
    ],
    anims: [
      { name: 'dish', type: 'spin', axis: 'y', speed: 0.6, grid: dishGrid({ r: 6, col: P.w, back: METAL, rim: P.bolt, tip: P.bolt }), at: [-17.5, TTY1 + 2, -5.5], stage: 2 },
      ...[-2, 2].map((vx) => ({ name: 'roofFan', type: 'spin', axis: 'y', speed: 6, grid: flatFan(1.6, METAL_L), at: [vx + 0.5, Y1 + 6, -9.5], stage: 2 })),
      { name: 'arcs', type: 'spin', axis: 'y', speed: 9, grid: arcGrid(5, P.ml), piv: [0.5, 0.5, 0.5], at: [2.5, tc5 + 0.5, 6.5], stage: 2 },
    ],
    lights: [
      { at: [-9.5, TTY1 + 16.6, 0.5], color: 0xff3040, mode: 'blink', rate: 1, stage: 1 },
      { at: [17.5, Y1 + 5.6, 11.5], color: 0xffa62a, mode: 'blink', rate: 1.5, stage: 2 },
      { at: [TX0 + 0.5, 56.6, TZ1 + 0.5], color: 0xffa62a, mode: 'blink', rate: 1.5, phase: 0.5, stage: 3 },
      { at: [TX1 + 0.5, 56.6, TZ1 + 0.5], color: 0xffa62a, mode: 'blink', rate: 1.5, phase: 0.25, stage: 3 },
    ],
    tanks: [{ at: [TKX + 0.5, TY0, TKZ + 0.5], r: 4.8, h: TY1 - TY0 + 1, bubbles: 10 }],
    orbs: [{ at: [TKX + 0.5, (TY0 + TY1) / 2 + 0.5, TKZ + 0.5], r: 2.9, rings: [{ r: 3.6, tilt: 0.5, speed: 1.6 }, { r: 3.6, tilt: -0.7, speed: -2.2 }] }],
    puffs: [{ at: [-1.5, Y1 + 7, -9.5], color: 0xf0f4fa, rate: 1.4, rise: 0.6, s0: 0.1, s1: 0.35, life: 1.6, op: 0.4, until: 2 }],
    core: [TKX + 0.5, 18, TKZ + 0.5],
    seat: [12.5, Y1 + 4, -0.5],
    fires: [[-18, Y1 + 2, 6], [2, Y1 + 2, -8], [-14, 22, Z1 + 1], [10, Y1 + 2, 8]],
    sparks: [[-24, 20, Z1 + 2], [-2, 26, Z1 + 1], [20, 14, 6], [12, 31, Z1 + 3], [-9, 4, Z1 + 2], [20, 26, -9]],
    smoke: [[-10, Y1 + 3, 0], [6, Y1 + 3, -6], [-20, 30, Z1]],
    rubble: { cols: [P.w, P.w2, P.seam, P.m, P.bolt, METAL, METAL_D], h: 10 },
  };
}

// ---------------------------------------------------------------------------
// TIER 6: Mega HQ (fortress-lab with twin reactors and a giant bolt spire)
function tier6(P, m) {
  const b = new VoxGrid();
  const HZ = hazardC(PAL.yellow, INK, 2);
  const AR = P.w, AR2 = P.w2, SEAM = P.seam, DK = P.dk;
  // armoured platform with glowing seams
  b.box(-32, 0, -26, 25, 3, 18, (x, y, z) => {
    if (y === 3) return z >= 17 || x >= 24 ? HZ(x, y, z) : (x + z) % 6 === 0 ? METAL_DD : METAL_D;
    return y === 0 ? METAL_DD : DK;
  });
  for (let x = -31; x <= 23; x += 4) b.set(x, 2, 18, P.glow, true);
  for (let z = -25; z <= 16; z += 4) b.set(25, 2, z, P.glow, true);
  // stepped armoured fortress walls (batter)
  const X0 = -30, X1 = 20, Z0 = -22, Z1 = 12, Y0 = 4, Y1 = 38;
  const inset = (y) => (y <= 15 ? 0 : y <= 27 ? 2 : 4);
  for (let y = Y0; y <= Y1; y++) {
    const k = inset(y);
    const x0 = X0 + k, x1 = X1 - k, z0 = Z0 + k, z1 = Z1 - k;
    b.box(x0, y, z0, x1, y, z1, (x, yy, z) => {
      if (yy <= Y0 + 1) return HZ(x, yy, z);
      if (yy === 15 || yy === 27) return P.m;
      if (yy === 16 || yy === 28) return DK;
      if (yy === Y1) return AR2;
      const onZ = z === z0 || z === z1;
      const u = onZ ? x - X0 : z - Z0;
      const low = yy < 15;
      if (u % 10 === 0 || (yy - Y0) % 6 === 0) return low ? DK : SEAM;
      if (low) return hash3(Math.floor(u / 10), Math.floor((yy - Y0) / 6), 7) < 0.5 ? P.ar0 : P.ar0b;
      return hash3(Math.floor(u / 10), Math.floor((yy - Y0) / 6), onZ ? 1 : 2) < 0.5 ? AR : AR2;
    });
  }
  for (let x = X0 + 5; x <= X1 - 2; x += 10) for (const y of [7, 13]) b.set(x, y, Z1, P.glow, true);
  // roof deck + front parapet (gap for the throne)
  b.box(X0 + 4, Y1 + 1, Z0 + 4, X1 - 4, Y1 + 1, Z1 - 4, (x, y, z) => ((Math.floor(x / 3) + Math.floor(z / 3)) & 1 ? METAL_D : shade(METAL_D, -0.12)));
  for (let x = X0 + 4; x <= X1 - 4; x++) if (x < -2 || x > 8) b.box(x, Y1 + 2, Z1 - 4, x, Y1 + 3, Z1 - 4, x % 3 === 0 ? P.m : AR2);
  // hangar portal on the facade: chevron frame, segmented door, glowing gap
  const HX0 = -17, HX1 = 5, HY1 = 26;
  b.box(HX0 - 2, Y0, Z1 - 1, HX1 + 2, HY1 + 2, Z1 + 1, HZ);
  b.box(HX0, Y0, Z1 - 1, HX1, HY1, Z1 + 1, null);
  b.box(HX0, Y0, Z1 - 2, HX1, HY1, Z1 - 2, (x, y) => ((y - Y0) % 4 === 0 ? DK : (y - Y0) % 4 === 1 ? METAL_L : METAL));
  for (let x = HX0 + 2; x <= HX1 - 2; x += 4) b.box(x, 17, Z1 - 2, x + 1, 18, Z1 - 2, 0x24314f);
  b.box(HX0, Y0, Z1 - 2, HX1, Y0, Z1 - 2, P.glow, true);
  b.box(HX0 - 2, HY1 + 3, Z1 - 1, HX1 + 2, HY1 + 3, Z1 + 1, DK);
  // BEAST HQ sign above the hangar
  signZ(b, 'BEAST HQ', (HX0 + HX1) >> 1, HY1 + 4, Z1 - 3, { board: 0x1b2440, color: P.bolt, pad: 1, mirror: m, frame: DK });
  // front face: blast portal (+X)
  b.box(X1 - 1, Y0, -16, X1, 30, 6, HZ);
  b.box(X1 - 3, Y0, -14, X1, 28, 4, null);
  b.box(X1 - 3, Y0, -14, X1 - 3, 28, 4, (x, y, z) => (z === -5 ? INK : (y - Y0) % 4 === 0 ? DK : z < -5 ? METAL : METAL_L));
  b.box(X1, 29, -13, X1, 29, 3, P.boltL, true);
  // twin reactors (housing, struts, caps, emitter crowns)
  const RZ = 14;
  for (const RX of [-27, 15]) {
    cyl(b, 'y', RX, RZ, Y0, 12, 5.4, 5.4, (x, y, z) => (y === 11 ? HZ(x, y, z) : y === 12 ? P.m : y === Y0 ? DK : (Math.floor((Math.atan2(z - RZ, x - RX) * 4) / Math.PI) & 1 ? AR : AR2)));
    ring(b, RX, RZ, 12, 12, 5.4, P.glow, true);
    for (const [dx, dz] of [[-5, 0], [5, 0], [0, -5]]) b.box(RX + dx, 13, RZ + dz, RX + dx, 33, RZ + dz, DK);
    for (const y of [18, 28]) for (const [dx, dz] of [[-5, 0], [5, 0], [0, -5]]) b.set(RX + dx, y, RZ + dz, P.glow, true);
    cyl(b, 'y', RX, RZ, 34, 38, 5.4, 5.4, (x, y) => (y === 35 ? P.m : y === 38 ? AR2 : AR));
    ring(b, RX, RZ, 37, 37, 5.4, P.bolt);
    cyl(b, 'y', RX, RZ, 39, 40, 3, 3, DK);
    pipe(b, 'z', Z1 - 4, RZ - 4, RX, 36, DK, P.m, 1, 3);
  }
  // keep (central tower) with command bridge and throne
  const KX0 = -20, KX1 = 2, KY0 = Y1 + 2, KY1 = 54, KZ0 = -18, KZ1 = 2;
  b.box(KX0, KY0, KZ0, KX1, KY1, KZ1, (x, y, z) => {
    if (y === KY0 + 3) return P.m;
    if (y >= 50 && y <= 52) return (x + z) % 4 === 0 && y === 51 ? P.boltL : P.bolt;
    if (y >= 53) return AR2;
    const onZ = z === KZ0 || z === KZ1;
    const u = onZ ? x - KX0 : z - KZ0;
    if (u % 7 === 0 || (y - KY0) % 8 === 0) return SEAM;
    return hash3(Math.floor(u / 7), Math.floor((y - KY0) / 8), 3) < 0.5 ? AR : AR2;
  });
  b.carve((x, y, z) => y >= KY0 && y <= KY1 && x >= KX0 && x <= KX1 && z >= KZ0 && z <= KZ1 && Math.min(x - KX0, KX1 - x) + Math.min(z - KZ0, KZ1 - z) < 3);
  b.box(KX0 + 1, 43, KZ1 + 1, KX1 - 1, 49, KZ1 + 1, AR2);
  b.box(KX0 + 2, 44, KZ1 + 1, KX1 - 2, 48, KZ1 + 1, null);
  b.box(KX0 + 2, 44, KZ1, KX1 - 2, 48, KZ1, 0x24314f);
  b.box(KX0 + 2, 44, KZ1, KX1 - 2, 44, KZ1, P.glow, true);
  for (let x = KX0 + 3; x <= KX1 - 3; x += 4) b.box(x, 46, KZ1, x + 1, 47, KZ1, P.boltL, true);
  // throne (Commander seat) on the roof in front of the keep
  const THX0 = -1, THX1 = 8;
  b.box(THX0, Y1 + 2, KZ1 + 1, THX1, Y1 + 2, Z1 - 5, P.boltD);
  b.box(THX0 + 1, Y1 + 3, KZ1 + 1, THX1 - 1, Y1 + 3, Z1 - 5, (x, y, z) => ((x + z) % 3 ? P.bolt : P.boltL));
  b.box(THX0, Y1 + 2, KZ1 + 1, THX0, Y1 + 5, Z1 - 5, P.boltD).box(THX1, Y1 + 2, KZ1 + 1, THX1, Y1 + 5, Z1 - 5, P.boltD);
  b.box(THX0, Y1 + 3, KZ1, THX1, 49, KZ1, (x, y) => (x === THX0 || x === THX1 || y === 49 ? P.boltD : P.bolt));
  b.box(THX0 + 2, 50, KZ1, THX1 - 2, 50, KZ1, P.boltD);
  artZ(b, BOLT_MINI, ((THX0 + THX1) >> 1) - 1, 48, KZ1 + 1, 0xffffff, { mirror: m, glow: true });

  // giant bolt spire on the keep (stage 3)
  const spire = new VoxGrid();
  cyl(spire, 'y', -9, -8, KY1 + 1, KY1 + 3, 6, 6, (x, y) => (y === KY1 + 2 ? P.m : DK));
  ring(spire, -9, -8, KY1 + 2, KY1 + 2, 6.4, P.glow, true);
  boltSolid(spire, -16, KY1 + 4, -10, -6, 1.4, P, m);
  // keep-corner antennas (stage 1)
  const ant = new VoxGrid();
  for (const x of [KX0 + 2, KX1 - 2]) ant.box(x, KY1 + 1, KZ0 + 2, x, KY1 + 10, KZ0 + 2, METAL_L).box(x - 1, KY1 + 6, KZ0 + 2, x + 1, KY1 + 6, KZ0 + 2, METAL);
  // reactor emitter crowns (stage 2)
  const crowns = new VoxGrid();
  for (const RX of [-27, 15]) for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) crowns.box(RX + dx, 41, RZ + dz, RX + dx, 44, RZ + dz, P.bolt).set(RX + dx, 45, RZ + dz, P.boltL);
  // force-field pylon at the front-back corner (stage 1)
  const pyl = new VoxGrid();
  const PX = 22, PZ = -21;
  for (let y = Y0; y <= 30; y++) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pyl.set(PX + dx, y, PZ + dz, y % 6 === 0 ? P.m : DK);
    if (y % 3 === 0) pyl.set(PX, y, PZ + 1, METAL).set(PX, y, PZ - 1, METAL).set(PX + 1, y, PZ, METAL).set(PX - 1, y, PZ, METAL);
  }
  cyl(pyl, 'y', PX, PZ, 31, 32, 2.4, 2.4, (x, y) => (y === 32 ? P.m : METAL));
  ring(pyl, PX, PZ, 33, 33, 2.6, P.glow, true);
  for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) pyl.box(PX + dx, 33, PZ + dz, PX + dx, 35, PZ + dz, P.bolt);
  const anims = [
    { name: 'radar', type: 'spin', axis: 'y', speed: 1.4, grid: (() => {
      const g = new VoxGrid();
      g.box(0, 0, 0, 0, 3, 0, METAL_D).box(-5, 4, 0, 5, 5, 0, P.w2).box(-5, 6, 0, 5, 6, 0, P.m).set(5, 7, 0, P.glow, true);
      return g;
    })(), at: [-16.5, KY1 + 1, -14.5], stage: 2 },
    { name: 'pylonCrystal', type: 'hover', amp: 1.2, freq: 2, speed: 1.6, grid: crystalGrid(P.glow, 2), piv: [0.5, 0.5, 0.5], at: [PX + 0.5, 39, PZ + 0.5], stage: 1 },
    ...[-27, 15].map((RX, i) => ({ name: 'crystal' + i, type: 'hover', amp: 1, freq: 2.4, speed: -1.2, grid: crystalGrid(P.bolt === 0xffd23f ? P.glow : P.boltL, 1), piv: [0.5, 0.5, 0.5], at: [RX + 0.5, 48, RZ + 0.5], stage: 2 })),
  ];
  // the keep: banded lips + pilasters so it never reads as a plain block (corners are already bevelled)
  dressBox(b, KX0, KY0, KZ0, KX1, KY1, KZ1, { trim: AR2, dark: SEAM, chamfer: 0, lips: [[51, P.boltL], [50, P.bolt], [KY0 + 3, P.md]], plinth: false, rib: 7, walls: [AR, AR2] });
  return {
    body: b,
    chunks: [
      { name: 'antennas', grid: ant, stage: 1 },
      { name: 'pylon', grid: pyl, stage: 1 },
      { name: 'crowns', grid: crowns, stage: 2 },
      { name: 'spire', grid: spire, stage: 3 },
    ],
    anims,
    lights: [
      { at: [m ? -12.5 : -5.5, KY1 + 27, -7.5], color: 0xff3040, mode: 'blink', rate: 0.9, stage: 3 },
      { at: [KX0 + 2.5, KY1 + 11.6, KZ0 + 2.5], color: 0xff3040, mode: 'blink', rate: 1.1, stage: 1 },
      { at: [KX1 - 1.5, KY1 + 11.6, KZ0 + 2.5], color: 0xff3040, mode: 'blink', rate: 1.1, phase: 0.5, stage: 1 },
      { at: [HX0 - 1.5, HY1 + 4.6, Z1 + 1.5], color: 0xffa62a, mode: 'blink', rate: 1.6, stage: 2 },
      { at: [HX1 + 2.5, HY1 + 4.6, Z1 + 1.5], color: 0xffa62a, mode: 'blink', rate: 1.6, phase: 0.5, stage: 2 },
      { at: [X1 + 0.5, 31.6, -13.5], color: 0xffa62a, mode: 'blink', rate: 1.6, phase: 0.25, stage: 3 },
      { at: [X1 + 0.5, 31.6, 3.5], color: 0xffa62a, mode: 'blink', rate: 1.6, phase: 0.75, stage: 3 },
    ],
    tanks: [-27, 15].map((RX) => ({ at: [RX + 0.5, 13, RZ + 0.5], r: 4.6, h: 21, bubbles: 9 })),
    orbs: [-27, 15].map((RX, i) => ({ at: [RX + 0.5, 23.5, RZ + 0.5], r: 2.9, pulse: 3 + i, rings: [{ r: 3.8, tilt: 0.55, speed: 1.8 }, { r: 3.8, tilt: -0.55, speed: -1.4 }] })),
    puffs: [{ at: [-26.5, 41, 14.5], color: 0xf0f4fa, rate: 1, rise: 0.7, s0: 0.1, s1: 0.4, life: 1.4, op: 0.3, until: 2 }],
    core: [15.5, 23.5, RZ + 0.5],
    seat: [(THX0 + THX1 + 1) / 2, Y1 + 4, 5.5],
    fires: [[-24, Y1 + 2, 4], [8, Y1 + 2, -10], [-12, 40, 4], [0, KY1 + 1, -10], [12, 30, 9]],
    sparks: [[-6, 22, Z1 + 2], [20, 18, -6], [-27, 30, 19], [15, 20, 19], [-14, 46, 3], [10, 36, 9]],
    smoke: [[-10, KY1 + 1, -8], [8, Y1 + 2, -4], [-24, 34, 6]],
    rubble: { cols: [AR, AR2, SEAM, DK, P.m, P.bolt, METAL, METAL_D], h: 12 },
  };
}

const BUILDERS = [tier1, tier2, tier3, tier4, tier5, tier6];

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
  const inner = [];
  const bodyGrid = hollow(mir(d.body), 2, inner);
  const bodyGeos = [bakeSolid(bodyGrid, inner, [], P0)];
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
    grow(g, [Math.round(sx * (a.at[0] - piv[0])), Math.round(a.at[1] - piv[1]), Math.round(a.at[2] - piv[2])]);
    return { ...a, pos: W(a.at), geo: g.build({ scale: V, pivot: [sx * piv[0], piv[1], piv[2]], maxSamples: 80 }) };
  });
  const def = {
    tier, side, flip, P,
    bodyGeo(s) {
      if (!bodyGeos[s]) {
        const bites = [];
        bodyGeos[s] = bakeSolid(damageGrid(bodyGrid, s, 11 + tier * 7, bites), inner, bites, P0);
      }
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
  def.width = (all.maxX - all.minX + 1) * V;
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
/** The landscape battle camera shows ~6.8 units above the lane: keep HP plates below this. */
const PLATE_MAX_Y = 6.25;

/**
 * Build (and cache) a tier's geometry ahead of time, e.g. when an upgrade starts,
 * so the swap at the end of the transformation does not hitch. Runs on idle.
 */
export function prewarmBase(tier, { side = 0, flip = false } = {}) {
  tier = clamp(Math.round(tier) || 1, 1, BUILDERS.length);
  const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : (f) => setTimeout(f, 50);
  ric(() => prewarm(tierDef(tier, side, flip)));
}

/**
 * In-battle Base at an upgrade tier (1..6).
 * @param {number} tier 1 Camp Lab .. 6 Mega HQ
 * @param {{side?: 0|1, flip?: boolean, style?: string}} o side 1 = rival colours; flip mirrors it
 *   for the right-hand side; style = an equipped Lab skin (mansion, goldVault, ...) used at tier 5.
 * @returns {{root, seat, core, meshes, height, width, tier, name, front, bounds, centerX, plateY, setDamage(f), update(dt), onChunk, setLevel(n)}}
 *   front = signed x of the front face (troops hit it); bounds = local footprint {x0,x1,z0,z1};
 *   centerX = local x centre of the footprint (place makeScaffold() there); plateY = suggested HP-plate height.
 */
export function makeBase(tier = 1, { side = 0, flip = false, style } = {}) {
  tier = clamp(Math.round(tier) || 1, 1, BUILDERS.length);
  if (tier === 5 && style && LAB_SKINS.has(style)) {
    const lab = makeLabBuilding({ style, flip });
    const bounds = flip ? { x0: -1.7, x1: 2.2, z0: -1.4, z1: 1.9 } : { x0: -2.2, x1: 1.7, z0: -1.4, z1: 1.9 };
    return Object.assign(lab, { tier, name: BASE_TIERS[4].name, front: (flip ? -1 : 1) * 1.7, bounds, centerX: (bounds.x0 + bounds.x1) / 2, plateY: Math.min(lab.height + 0.55, PLATE_MAX_Y) });
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
    const liquidMat = new THREE.MeshPhongMaterial({ color: tk.color ?? P.en, transparent: true, opacity: 0.34, depthWrite: false, shininess: 60, emissive: mixHex(tk.color ?? P.en, 0, 0.45) });
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, h * (tk.fill ?? 0.86), 14), liquidMat);
    liquid.position.y = (h * (tk.fill ?? 0.86)) / 2;
    liquid.renderOrder = 2;
    grp.add(liquid);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.4 * V, r + 0.4 * V, h, 16, 1, true), glassMat(0xd8f4ff, 0.22));
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
    return { ...tk, grp, liquid, glass, liquidMat, bubbles, top: h * (tk.fill ?? 0.86) - 0.04 };
  });

  // --- reactor orbs (glowing voxel orb + spinning rings)
  const orbs = D.orbs.map((o) => {
    const grp = new THREE.Group();
    grp.position.set(...o.pos);
    const orbMat = tintMat(o.color ?? mixHex(P.en, 0xffffff, 0.55));
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
    centerX: (D.bounds.x0 + D.bounds.x1) / 2,
    plateY: Math.min(D.height + 0.55, PLATE_MAX_Y),
    level: 1, damage: 0, stage: 0,
    onChunk: null,
    setLevel(n) {
      this.level = clamp(Math.round(n) || 1, 1, 8);
    },
    /** Remove from the scene and free per-instance materials/geometry (voxel geometry stays cached). */
    dispose() {
      root.parent?.remove(root);
      for (const p of puffs) p.mat.dispose();
      for (const tk of tanks) {
        tk.liquidMat.dispose();
        tk.liquid.geometry.dispose();
        tk.glass.geometry.dispose();
      }
      for (const o of orbs) {
        o.orbMat.dispose();
        o.ringMat.dispose();
        o.orb.geometry.dispose();
        for (const r of o.rings) r.mesh.geometry.dispose();
      }
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
        else if (a.type === 'hover') {
          a.grp.position.y = a.base.y + Math.sin(t * fq + ph) * amp * V;
          a.grp.rotation.y += dt * (a.speed ?? 1.5) * a.rs;
        }
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
        tk.liquidMat.opacity = 0.32 + Math.sin(t * 3) * 0.05;
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
    g.box(x0, yb, z1 - 3, x1, yb, z1, (x) => (Math.floor(x / 7) % 2 ? WOOD_L : WOOD));
    g.box(x0, yb + 1, z1 + 1, x1, yb + 1, z1 + 1, hazardC(PAL.yellow, INK, 2));
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
