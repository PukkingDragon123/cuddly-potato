// Beast Island voxel props: plinths, signposts, padlock + chains, lighthouse,
// dock, yacht, boats, gulls, bridges, the giant panther-head monument and
// vegetation brushes. All grids are meshed with the greedy mesher (no AO).
import * as THREE from 'three';
import { VoxGrid, Mats } from '../../core/voxel.js';
import { text, textW } from '../props/common.js';
import { greedyGeometry } from '../props/greedy.js';
import { hash3, shade, clamp } from '../../core/util.js';

export const geo = (id, fn, scale, pivot = 'bottom', jitter = 0.04) => greedyGeometry('isl_' + id, fn, { scale, pivot, jitter });

export function mesh(g, o = {}) {
  const m = new THREE.Mesh(g, o.mats ?? Mats.pair);
  m.castShadow = o.shadow !== false;
  m.receiveShadow = !!o.receive;
  return m;
}

const grey = (c) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const l = Math.round((r * 0.3 + g * 0.59 + b * 0.11) * 0.75 + 30);
  return (clamp(l - 6, 0, 255) << 16) | (clamp(l - 2, 0, 255) << 8) | clamp(l + 8, 0, 255);
};
/** Desaturated copy of a grid (locked signs). */
export function greyGrid(g) {
  const o = new VoxGrid();
  g.forEach((x, y, z, c) => o.set(x, y, z, grey(c)));
  return o;
}

// ---------------------------------------------------------------------------
// Zone plinth (voxel 0.25): octagonal stone pedestal with a zone-colour rim
// and steps toward the road. Top at local y = 0. dirs: local [dx, dz] unit vectors.
export const PLINTH_A = 33;
export function plinthGrid(color, dirs) {
  const g = new VoxGrid();
  const A = PLINTH_A;
  const oct = (x, z) => Math.max(Math.abs(x), Math.abs(z), (Math.abs(x) + Math.abs(z)) / 1.38);
  const stone = 0xe8e2d4, stoneD = 0xcfc6b2, stoneL = 0xf6f2e8, colD = shade(color, -0.3), gold = 0xffc21a;
  const E = A + 6;
  for (let x = -E; x <= E; x++) for (let z = -E; z <= E; z++) {
    const px = x + 0.5, pz = z + 0.5;
    const o = oct(px, pz);
    if (o <= A) {
      const rim = o > A - 2;
      const line = o > A - 3 && !rim;
      const tile = ((Math.floor(x / 4) + Math.floor(z / 4)) & 1) ? stone : stoneL;
      const grout = ((x % 4) + 4) % 4 === 0 || ((z % 4) + 4) % 4 === 0;
      const inner = o < A - 6; // hidden under the diorama: keep it one flat colour
      g.set(x, -1, z, rim ? color : line ? gold : inner ? stone : grout ? stoneD : tile);
      g.set(x, -2, z, o > A - 1 ? colD : stone);
      for (let y = -4; y <= -3; y++) g.set(x, y, z, stone);
    }
    for (const [dx, dz] of dirs) {
      const along = px * dx + pz * dz, perp = Math.abs(-px * dz + pz * dx);
      if (along > A - 2 && along < A + 4.5 && perp <= 7 && o > A - 1) {
        for (let y = -4; y <= -2; y++) if (!g.has(x, y, z)) g.set(x, y, z, y === -2 ? (perp > 6 ? colD : stoneL) : stoneD);
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Trophy-road signpost (voxel 0.08). Board faces +z.
const TROPHY = ['#####', '#####', '.###.', '..#..', '.###.'];
export function signpostGrid(name, trophies, color) {
  const g = new VoxGrid();
  const num = String(trophies);
  const W = Math.max(textW(name), textW(num) + 8) + 8;
  const x0 = -Math.floor(W / 2), x1 = x0 + W - 1;
  const yb = 18, H = 17;
  const wood = 0x8a5a2a, woodL = 0xa8743c, cream = 0xfff6dc, ink = 0x2a2238;
  for (const lx of [x0 + 3, x1 - 3]) {
    g.box(lx - 1, 0, -1, lx, yb + H - 2, 0, (x, y) => (y % 5 === 0 ? wood : woodL));
  }
  g.box(x0, yb, -1, x1, yb + H - 1, 0, color);
  g.box(x0 + 1, yb + 1, 0, x1 - 1, yb + H - 2, 0, cream);
  g.box(x0, yb + H, -1, x1, yb + H, 0, shade(color, -0.25));
  // little gold crest
  for (let k = 0; k < 4; k++) g.box(-3 + k, yb + H + 1 + k, -1, 2 - k, yb + H + 1 + k, 0, k === 3 ? 0xffffff : 0xffc21a);
  text(g, name, 0, yb + 9, 1, '+z', ink, { center: true });
  // trophy icon + number
  const nw = textW(num) + 7;
  const tx = -Math.floor(nw / 2);
  TROPHY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(tx + c, yb + 7 - r, 1, r < 2 ? 0xffd23f : 0xe0a010); }));
  text(g, num, tx + 7, yb + 3, 1, '+z', 0xb0700c);
  return g;
}

// ---------------------------------------------------------------------------
// Giant padlock (voxel 0.16): body + shackle (separate so it can pop open)
export function padBodyGrid() {
  const g = new VoxGrid();
  const gold = 0xffc21a, goldD = 0xc8901a, goldL = 0xffe680, dark = 0x3a2a10;
  for (let x = -9; x <= 8; x++) for (let y = 0; y <= 14; y++) for (let z = -3; z <= 3; z++) {
    const cx = Math.max(0, Math.abs(x + 0.5) - 6.5), cy = Math.max(0, Math.abs(y - 7) - 4);
    if (cx * cx + cy * cy > 9.5) continue;
    const edge = Math.abs(z) === 3 && (Math.abs(x + 0.5) > 7.5 || y === 0 || y === 14);
    let c = edge ? goldD : gold;
    if (z === 3 && x < -3 && y > 9) c = goldL;
    if (y === 2 || y === 12) c = goldD;
    g.set(x, y, z, c);
  }
  // keyhole on the front
  for (let x = -2; x <= 1; x++) for (let y = 7; y <= 10; y++) if ((x + 0.5) ** 2 + (y - 8.5) ** 2 <= 3.5) g.set(x, y, 3, dark);
  g.box(-1, 4, 3, 0, 7, 3, dark);
  // rivets
  for (const [x, y] of [[-7, 4], [6, 4], [-7, 10], [6, 10]]) g.set(x, y, 4, goldL);
  return g;
}
export function padShackleGrid() {
  const g = new VoxGrid();
  const st = 0xc0c8d6, stD = 0x8f98aa, stL = 0xe8eef6;
  for (let a = 0; a <= 64; a++) {
    const t = (a / 64) * Math.PI;
    for (let r = 4.5; r <= 7; r += 0.5) {
      const x = Math.round(Math.cos(t) * r - 0.5), y = Math.round(Math.sin(t) * r);
      for (let z = -1; z <= 0; z++) g.set(x, y, z, r > 6.4 ? stL : r < 5 ? stD : st);
    }
  }
  for (const sx of [-7, 4]) g.box(sx, -6, -1, sx + 2, 0, 0, (x, y) => (y % 3 === 0 ? stD : st));
  return g;
}
export function chainLinkGrid() {
  const g = new VoxGrid();
  for (let x = -1; x <= 1; x++) for (let y = -2; y <= 2; y++) {
    if (Math.abs(x) === 1 || Math.abs(y) === 2) g.set(x, y, 0, Math.abs(y) === 2 ? 0x8f98aa : 0xc0c8d6);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Lighthouse (voxel 0.25)
export function lighthouseGrid() {
  const g = new VoxGrid();
  const stone = 0x9aa2b4, stoneD = 0x7c8496, red = 0xe8343c, white = 0xf4f6fa, dark = 0x3d4352;
  g.cylinder(-0.5, -0.5, -6, 2, 7.5, (x, y, z) => (((x >> 1) + (z >> 1) + y) & 1 ? stone : stoneD));
  for (let y = 3; y <= 34; y++) {
    const r = 5.6 - (y - 3) * 0.055;
    const c = Math.floor((y - 3) / 5) % 2 ? red : white;
    g.cylinder(-0.5, -0.5, y, y, r, c);
  }
  // door + windows
  g.box(-2, 3, 4, 1, 8, 5, 0x6e4224);
  g.box(-1, 9, 4, 0, 9, 5, 0x6e4224);
  for (const y of [15, 25]) g.box(-1, y, 3, 0, y + 2, 5, 0x2a3a5a);
  // gallery + railing
  g.cylinder(-0.5, -0.5, 35, 35, 6.4, dark);
  for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d > 5.7 && d <= 6.6 && ((x + z) & 1)) g.set(x, 36, z, dark);
  }
  // lamp room
  for (let y = 36; y <= 39; y++) for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d > 3.8) continue;
    const mull = (x === -1 || x === 0) && (z === -4 || z === 3) || (z === -1 || z === 0) && (x === -4 || x === 3);
    if (d > 2.6) g.set(x, y, z, mull ? dark : 0xfff2a0);
    else g.set(x, y, z, 0xffe680, y === 37 || y === 38);
  }
  for (let y = 40; y <= 43; y++) g.cylinder(-0.5, -0.5, y, y, 4.4 - (y - 40) * 1.2, y === 40 ? dark : 0xc8202a);
  g.box(-1, 44, -1, 0, 45, 0, dark);
  g.set(0, 46, 0, 0xffe680, true);
  return g;
}

// ---------------------------------------------------------------------------
// Wooden dock (voxel 0.25) along +z, deck top at local y = 0 (top of y=-1 voxels)
export function dockGrid(len = 56) {
  const g = new VoxGrid();
  const W = [0xa0673a, 0xb87a48, 0x8e5a30];
  for (let z = 0; z < len; z++) {
    if (z % 4 === 3) continue;
    const wide = z > len - 12;
    const hx = wide ? 13 : 5;
    for (let x = -hx; x < hx; x++) g.set(x, -1, z, W[(z + (x > 0 ? 1 : 0)) % 3]);
  }
  for (let z = 0; z < len; z += 8) for (const x of [-6, 5]) g.box(x, -7, z, x, 0, z, 0x6e4224);
  for (const x of [-14, 13]) for (const z of [len - 11, len - 1]) { g.box(x, -7, z, x, 1, z, 0x6e4224); g.set(x, 2, z, 0xf4f6fa); }
  // side beams
  for (let z = 0; z < len - 11; z++) for (const x of [-6, 5]) g.set(x, -2, z, 0x6e4224);
  // lamp at the end
  g.box(-13, 0, len - 2, -13, 8, len - 2, 0x3d4352);
  g.box(-14, 9, len - 3, -12, 10, len - 1, 0xffe08a, true);
  g.box(-14, 11, len - 3, -12, 11, len - 1, 0x3d4352);
  return g;
}

// ---------------------------------------------------------------------------
// Yacht (voxel 0.2), bow toward +z, waterline at local y = 2
export function yachtGrid() {
  const g = new VoxGrid();
  const white = 0xf6f8fc, navy = 0x1a3a6a, blue = 0x1477c9, teak = 0xc98c55, glass = 0x24324e, grey = 0xb8c0cc;
  const L = 46;
  const hwAt = (z) => (z < 30 ? 7 : 7 * Math.sqrt(Math.max(0, 1 - ((z - 30) / (L - 30)) ** 2)));
  for (let z = 0; z < L; z++) {
    const hw = hwAt(z);
    for (let y = 0; y <= 6; y++) {
      const w = Math.max(0.6, hw - (y < 2 ? (2 - y) * 1.2 : 0));
      for (let x = -Math.ceil(w); x < Math.ceil(w); x++) {
        if (Math.abs(x + 0.5) > w) continue;
        const c = y <= 1 ? blue : y === 4 ? navy : y === 6 ? teak : white;
        g.set(x, y, z, c);
      }
    }
  }
  // swim platform
  g.box(-6, 2, -2, 5, 2, -1, teak);
  // cabins
  for (let z = 6; z <= 30; z++) for (let x = -5; x <= 4; x++) for (let y = 7; y <= 10; y++) g.set(x, y, z, y === 8 || y === 9 ? ((z % 4 === 0) ? white : glass) : white);
  for (let z = 11; z <= 26; z++) for (let x = -4; x <= 3; x++) for (let y = 11; y <= 13; y++) g.set(x, y, z, y === 12 && z > 12 ? glass : white);
  for (let z = 14; z <= 23; z++) for (let x = -5; x <= 4; x++) g.set(x, 14, z, white);
  // windscreen on the bow side
  g.box(-4, 11, 27, 3, 12, 27, glass);
  // radar mast + flag
  g.box(-1, 15, 17, 0, 20, 18, grey);
  g.box(-3, 20, 17, 2, 20, 18, grey);
  g.box(0, 21, 15, 0, 23, 15, grey);
  g.box(0, 22, 12, 0, 23, 14, 0xff2e88);
  // name on the hull
  text(g, 'MRBEAST', 7, 2, 32, '+x', 0xffffff, {});
  text(g, 'MRBEAST', -8, 2, 4, '-x', 0xffffff, {});
  // railing on the bow deck
  for (let z = 31; z < L - 2; z++) { const hw = Math.floor(hwAt(z)); if (z % 2 === 0) { g.set(hw - 1, 7, z, grey); g.set(-hw, 7, z, grey); } }
  return g;
}

/** Small boats (voxel 0.12), bow toward +z, waterline at local y = 1. */
export function boatGrid(kind) {
  const g = new VoxGrid();
  if (kind === 'speed') {
    const L = 28;
    for (let z = 0; z < L; z++) {
      const hw = z < 18 ? 5 : 5 * Math.sqrt(Math.max(0, 1 - ((z - 18) / 10) ** 2));
      for (let y = 0; y <= 4; y++) for (let x = -5; x < 5; x++) {
        if (Math.abs(x + 0.5) > Math.max(0.6, hw - (y === 0 ? 1.5 : 0))) continue;
        g.set(x, y, z, y === 0 ? 0x15121f : y === 2 ? 0xe8343c : 0xf6f8fc);
      }
    }
    g.box(-4, 4, 3, 3, 4, 16, 0xe8eef6);
    g.box(-3, 5, 16, 2, 7, 16, 0x8fd8ff);
    g.box(-3, 5, 6, 2, 6, 9, 0xe8343c);
    g.box(-2, 1, -3, 1, 6, -1, 0x2a2238);
  } else if (kind === 'sail') {
    const L = 26;
    for (let z = 0; z < L; z++) {
      const hw = z < 16 ? 4.5 : 4.5 * Math.sqrt(Math.max(0, 1 - ((z - 16) / 10) ** 2));
      for (let y = 0; y <= 3; y++) for (let x = -5; x < 5; x++) {
        if (Math.abs(x + 0.5) > Math.max(0.6, hw - (y === 0 ? 1.5 : 0))) continue;
        g.set(x, y, z, y === 0 ? 0x1477c9 : y === 3 ? 0xc98c55 : 0xf6f8fc);
      }
    }
    g.box(0, 4, 12, 0, 36, 12, 0x8a5a2a);
    for (let y = 6; y <= 34; y++) {
      const w = Math.round((34 - y) * 0.42);
      for (let z = 11 - w; z <= 11; z++) g.set(0, y, z, y % 7 < 2 ? 0xff2e88 : 0xffffff);
      const w2 = Math.round((30 - y) * 0.3);
      if (y < 30) for (let z = 13; z <= 13 + w2; z++) g.set(0, y, z, 0xf4f6fa);
    }
    g.box(0, 37, 12, 0, 38, 14, 0x29b6f6);
  } else {
    // little tug / fishing boat
    const L = 22;
    for (let z = 0; z < L; z++) {
      const hw = z < 15 ? 5 : 5 * Math.sqrt(Math.max(0, 1 - ((z - 15) / 7) ** 2));
      for (let y = 0; y <= 5; y++) for (let x = -5; x < 5; x++) {
        if (Math.abs(x + 0.5) > Math.max(0.6, hw - (y === 0 ? 1.5 : 0))) continue;
        g.set(x, y, z, y <= 1 ? 0xc8202a : y === 5 ? 0x8a5a2a : y === 4 ? 0xffd23f : 0xf6f8fc);
      }
    }
    g.box(-3, 6, 4, 2, 11, 11, 0xf6f8fc);
    g.box(-3, 8, 11, 2, 9, 11, 0x24324e);
    g.box(-4, 12, 3, 3, 12, 12, 0x29b6f6);
    g.box(-1, 13, 6, 0, 16, 7, 0x3d4352);
    g.box(-4, 6, 0, 3, 6, 2, 0x8a5a2a);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Seagull parts (voxel 0.07): body (beak +z) and a wing (extends +x, hinge at x = 0)
export function gullBodyGrid() {
  const g = new VoxGrid();
  g.box(-1, 0, -4, 1, 2, 3, 0xffffff);
  g.box(-1, 2, -3, 1, 2, 1, 0xd8dee8);
  g.box(-1, 1, 3, 1, 3, 5, 0xffffff);
  g.box(0, 2, 6, 0, 2, 7, 0xffa62a);
  g.set(-1, 3, 5, 0x15121f).set(1, 3, 5, 0x15121f);
  g.box(-1, 1, -6, 1, 1, -5, 0xb8c0cc);
  g.box(0, 0, -7, 0, 1, -7, 0x2a2238);
  return g;
}
export function gullWingGrid() {
  const g = new VoxGrid();
  for (let x = 0; x <= 9; x++) {
    const w = x < 6 ? 2 : 1;
    for (let z = -w; z <= w - 1; z++) g.set(x, 0, z, x >= 8 ? 0x2a2238 : x > 5 ? 0xc0c8d6 : 0xe8eef6);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Wooden bridge (voxel 0.125), spans local z in [0, len), deck top at local y = 0
export function bridgeGrid(lenV, arch = 3) {
  const g = new VoxGrid();
  const W = [0xb87a48, 0xa0673a, 0xc98c55];
  for (let z = -4; z < lenV + 4; z++) {
    const t = clamp(z / (lenV - 1), 0, 1);
    const dy = Math.round(Math.sin(t * Math.PI) * arch);
    for (let x = -12; x < 12; x++) {
      g.set(x, dy - 1, z, (z & 1) ? W[(x >> 3) & 1] : W[2]);
      g.set(x, dy - 2, z, 0x6e4224);
    }
    // rails
    for (const x of [-13, 12]) {
      g.set(x, dy + 3, z, 0xc98c55);
      g.set(x, dy - 1, z, 0x6e4224);
      if (z % 6 === 0) g.box(x, dy, z, x, dy + 2, z, 0x8a5a2a);
      if (z % 6 === 0) g.set(x, dy + 4, z, 0xffd23f);
    }
  }
  // stone abutments
  for (const z0 of [-6, lenV + 2]) g.box(-14, -8, z0, 13, -3, z0 + 4, (x, y, z) => (((x >> 2) + y + (z >> 1)) & 1 ? 0x9aa2b4 : 0x8a92a4));
  return g;
}

// ---------------------------------------------------------------------------
// Giant MrBeast panther head carved in stone (voxel 0.25), facing +z.
export function pantherHeadGrid() {
  const g = new VoxGrid();
  const S = [0x6fa8e0, 0x7cb6ea, 0x619ad6, 0x88c0f0];
  const stone = (x, y, z) => S[Math.floor(hash3(x >> 2, y >> 1, z >> 2) * 4) % 4];
  // rocky base + neck
  g.ellipsoid(0, 3, -2, 22, 7, 16, (x, y, z) => (hash3(x >> 1, y, z >> 1) < 0.5 ? 0x8a8478 : 0x9a9488));
  g.ellipsoid(0, 10, -2, 15, 9, 12, stone);
  // skull + cheeks + muzzle
  g.ellipsoid(0, 22, 0, 17, 14, 12, stone);
  g.ellipsoid(-9, 15, 4, 9, 8, 9, stone);
  g.ellipsoid(9, 15, 4, 9, 8, 9, stone);
  g.ellipsoid(0, 13, 10, 8, 6, 6, stone);
  g.ellipsoid(0, 9, 8, 6, 3, 5, stone);
  // ears
  for (const s of [-1, 1]) {
    for (let y = 30; y <= 45; y++) {
      const t = (y - 30) / 15;
      const cx = s * (11 + t * 5), hw = 7 * (1 - t) + 0.6;
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) for (let z = -5; z <= 3; z++) {
        if (Math.abs(x - cx) > hw) continue;
        const inner = Math.abs(x - cx) < hw - 2.2 && z >= 2 && t < 0.8;
        g.set(x, y, z, inner ? 0xff8ab4 : stone(x, y, z));
      }
    }
  }
  // brow ridges (angry V)
  for (const s of [-1, 1]) for (let k = 0; k <= 12; k++) {
    const x = s * (2 + k), y = 23 + Math.round(k * 0.38);
    g.box(Math.min(x, x + s), y, 9, Math.max(x, x + s), y + 2, 13, 0x4a7ec0);
  }
  // glowing eyes (slanted)
  for (const s of [-1, 1]) for (let k = 0; k <= 8; k++) {
    const x = s * (4 + k), y = 19 + Math.round(k * 0.45);
    const h = k < 2 || k > 6 ? 1 : 2;
    for (let yy = y; yy < y + h; yy++) {
      let zf = 14;
      while (zf > 0 && !g.has(x, yy, zf)) zf--;
      g.set(x, yy, zf, 0xff2e88, true);
      g.set(x, yy, zf + 1, null);
    }
  }
  // nose
  for (let r = 0; r < 4; r++) for (let x = -3 + r; x <= 2 - r; x++) {
    const y = 18 - r;
    let zf = 18;
    while (zf > 0 && !g.has(x, y, zf)) zf--;
    g.set(x, y, zf + 1, 0x2e2a3a);
  }
  // mouth + fangs
  for (let x = -6; x <= 5; x++) {
    let zf = 18;
    while (zf > 0 && !g.has(x, 10, zf)) zf--;
    g.set(x, 10, zf, 0x2e2a3a);
    g.set(x, 11, zf, Math.abs(x + 0.5) < 1 ? 0x2e2a3a : g.get(x, 11, zf));
  }
  for (const fx of [-4, 3]) for (let y = 7; y <= 9; y++) {
    let zf = 18;
    while (zf > 0 && !g.has(fx, y, zf)) zf--;
    g.set(fx, y, zf + 1, 0xffffff);
  }
  // whisker dots
  for (const s of [-1, 1]) for (const [dx, dy] of [[4, 13], [6, 12], [5, 15]]) {
    const x = s * dx;
    let zf = 18;
    while (zf > 0 && !g.has(x, dy, zf)) zf--;
    g.set(x, dy, zf, 0x3a5a90);
  }
  // moss + weathering on upward faces
  g.paint((x, y, z, c) => {
    if (c === 0xff2e88 || c === 0x2e2a3a || c === 0xffffff || c === 0xff8ab4) return undefined;
    if (!g.has(x, y + 1, z) && !g.has(x, y + 2, z) && (y < 8 || (y > 30 && y < 36)) && hash3(x >> 2, y >> 2, z >> 2) < 0.35) return hash3(x, y, z) < 0.3 ? 0x7ccc5a : 0x5cb84a;
    return undefined;
  });
  return g;
}

// ---------------------------------------------------------------------------
// Vegetation + small scenery brushes

export function lollipopGrid() {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 14, 0, 0xffffff);
  for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) {
    const r = Math.hypot(x, y);
    if (r > 6.4) continue;
    const a = Math.atan2(y, x) + r * 0.55;
    const c = Math.sin(a * 2) > 0 ? 0xff4fa3 : 0xffffff;
    g.set(x, 20 + y, 0, r > 5.6 ? 0xc2185b : c);
    g.set(x, 20 + y, -1, r > 5.6 ? 0xc2185b : c);
  }
  return g;
}
export function candyCaneGrid() {
  const g = new VoxGrid();
  for (let y = 0; y <= 16; y++) g.box(0, y, 0, 1, y, 1, (y >> 1) & 1 ? 0xe8343c : 0xffffff);
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI;
    const x = Math.round(3 - Math.cos(a) * 3), y = 17 + Math.round(Math.sin(a) * 3);
    g.box(x, y, 0, x + 1, y + 1, 1, k & 1 ? 0xe8343c : 0xffffff);
  }
  return g;
}
export function deadTreeGrid() {
  const g = new VoxGrid();
  const c = 0x3a3446, cl = 0x4a4256;
  g.box(-1, 0, -1, 0, 12, 0, c);
  g.line(0, 8, 0, 5, 14, 1, cl);
  g.line(-1, 10, 0, -5, 16, -1, cl);
  g.line(0, 12, 0, 2, 18, -2, c);
  g.line(5, 14, 1, 7, 15, 1, cl);
  return g;
}
export function crystalGrid() {
  const g = new VoxGrid();
  for (const [x, z, h] of [[0, 0, 9], [2, 1, 6], [-2, -1, 5], [1, -2, 4]]) {
    for (let y = 0; y < h; y++) {
      const w = y > h - 3 ? 0 : 1;
      g.box(x, y, z, x + w, y, z + w, y > h - 3 ? 0xd4ff9a : 0x4fc83a, y > h - 3);
    }
  }
  g.box(-3, 0, -3, 3, 0, 2, 0x3a3446);
  return g;
}
export function lampGrid() {
  const g = new VoxGrid();
  const d = 0x3d4352;
  g.box(-1, 0, -1, 0, 1, 0, 0x6b7386);
  g.box(0, 0, 0, 0, 18, 0, d);
  g.box(-1, 18, -1, 1, 18, 1, d);
  g.box(-1, 19, -1, 1, 21, 1, 0xffe08a, true);
  g.box(-1, 22, -1, 1, 22, 1, d);
  g.set(0, 23, 0, d);
  return g;
}
export function umbrellaGrid(c = 0xff4fa3) {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 14, 0, 0xf4f6fa);
  for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) {
    const r = Math.hypot(x, z);
    if (r > 7.4) continue;
    const a = Math.atan2(z, x);
    g.set(x, 15 - Math.round(r * 0.35), z, Math.floor((a + Math.PI) / (Math.PI / 4)) & 1 ? c : 0xffffff);
  }
  // towel
  g.box(3, 0, 2, 7, 0, 8, (x, y, z) => ((z >> 1) & 1 ? c : 0xffffff));
  return g;
}
export function icebergGrid(seed = 1) {
  const g = new VoxGrid();
  const rx = 6 + hash3(seed, 1, 1) * 4, rz = 5 + hash3(seed, 2, 2) * 4, ry = 5 + hash3(seed, 3, 3) * 6;
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
    const d = (x / rx) ** 2 + (z / rz) ** 2;
    if (d > 1) continue;
    const top = Math.round(ry * (1 - d) * (0.7 + hash3(x >> 2, seed, z >> 2) * 0.5)) + 1;
    for (let y = -3; y <= top; y++) g.set(x, y, z, y === top ? 0xffffff : y < 1 ? 0x8fd0f0 : ((y + (x >> 2)) & 3) === 0 ? 0xc8ecfb : 0xe6f6ff);
  }
  return g;
}
// ---------------------------------------------------------------------------
// Low-triangle vegetation for the island scatter (chunky voxels, colour bands
// per layer so the greedy mesher merges whole faces). ~30-200 tris each.

/** Rounded box: corners notched by `cut` voxels; colour(y, top, bottom) per layer. */
function blob(g, x0, y0, z0, w, h, d, col, cut = 1) {
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) {
    const ex = Math.min(x - x0, x0 + w - 1 - x), ez = Math.min(z - z0, z0 + d - 1 - z);
    if (ex < cut && ez < cut && ex + ez < cut * 2 - (y === y0 + h - 1 || y === y0 ? 0 : 1)) continue;
    g.set(x, y, z, col(y - y0, h));
  }
}
const band = (leaf) => (y, h) => (y === h - 1 ? shade(leaf, 0.22) : y === 0 ? shade(leaf, -0.2) : leaf);

export const LOWPOLY = {
  round(leaf = 0x4cba3a, seed = 1) {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 4, 0, (x, y) => (y === 0 ? 0x5a3418 : 0x7a4a26));
    const s = Math.floor(hash3(seed, 2, 3) * 3);
    blob(g, -5, 4, -5, 10, 4, 10, band(leaf), 2);
    blob(g, -4 + s, 8, -4, 7, 2, 7, band(shade(leaf, 0.06)), 2);
    blob(g, -6, 5, -2 + s, 3, 2, 4, band(leaf), 1);
    return g;
  },
  palm(leaf = 0x4cba3a, seed = 1) {
    const g = new VoxGrid();
    const trunk = 0x9a6a3a, trunkD = 0x7a5028;
    const lean = hash3(seed, 1, 1) < 0.5 ? 1 : -1;
    let x = 0;
    for (let y = 0; y < 16; y++) {
      if (y === 6 || y === 11) x += lean;
      g.box(x - 1, y, -1, x, y, 0, y % 4 === 3 ? trunkD : trunk);
    }
    const L = leaf, Ld = shade(leaf, -0.22), Ll = shade(leaf, 0.18);
    g.box(x - 2, 16, -2, x + 1, 17, 1, Ld);
    g.box(x - 1, 18, -1, x, 18, 0, Ll);
    // four drooping fronds (axis aligned), two tones
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = 1; k <= 7; k++) {
        const y = 17 - (k < 4 ? 0 : k < 6 ? 1 : 2);
        const cx = x + (dx > 0 ? 1 : dx < 0 ? -2 : 0) + dx * k, cz = (dz > 0 ? 1 : dz < 0 ? -2 : 0) + dz * k;
        const c = k > 5 ? Ld : k > 3 ? L : Ll;
        if (dx) g.box(cx, y, -1, cx, y, 0, c);
        else g.box(x - 1, y, cz, x, y, cz, c);
      }
    }
    g.set(x, 15, 1, 0x6e4224).set(x - 2, 15, -1, 0x6e4224);
    return g;
  },
  pine(leaf = 0x3fae4a, snow = false) {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 2, 0, 0x6e4224);
    const tiers = [[5, 2], [4, 5], [3, 8], [2, 11], [1, 13]];
    for (const [r, y0] of tiers) {
      g.box(-r, y0, -r, r - 1, y0, r - 1, shade(leaf, -0.2));
      g.box(-r, y0 + 1, -r, r - 1, y0 + (r > 1 ? 2 : 1), r - 1, (x, y) => (y === y0 + (r > 1 ? 2 : 1) ? (snow ? 0xffffff : shade(leaf, 0.16)) : leaf));
    }
    return g;
  },
  bush(leaf = 0x4fb441) {
    const g = new VoxGrid();
    blob(g, -3, 0, -2, 6, 3, 5, band(leaf), 1);
    blob(g, -1, 2, -1, 4, 2, 3, band(shade(leaf, 0.08)), 1);
    return g;
  },
  flowers(seed = 1) {
    const g = new VoxGrid();
    const cols = [0xff4a5a, 0xffd23f, 0xffffff, 0xff6fb8, 0xb88cff];
    for (let i = 0; i < 6; i++) {
      const x = Math.round((hash3(i, seed, 1) - 0.5) * 8), z = Math.round((hash3(i, seed, 2) - 0.5) * 8);
      const h = 1 + Math.floor(hash3(i, seed, 3) * 2);
      g.box(x, 0, z, x, h - 1, z, 0x3f9e3a);
      g.set(x, h, z, cols[Math.floor(hash3(i, seed, 4) * cols.length)]);
    }
    return g;
  },
  tuft(c = 0x4fb441) {
    const g = new VoxGrid();
    for (const [x, z, h] of [[0, 0, 3], [1, 1, 2], [-1, 1, 2]]) for (let y = 0; y < h; y++) g.set(x, y, z, y === h - 1 ? shade(c, 0.25) : c);
    return g;
  },
  cactus() {
    const g = new VoxGrid();
    const c = 0x3e9a40, cl = 0x5cbc52;
    g.box(-1, 0, -1, 0, 11, 0, c);
    g.box(-1, 12, -1, 0, 12, 0, cl);
    g.box(1, 4, -1, 2, 5, 0, c);
    g.box(2, 6, -1, 2, 8, 0, c);
    g.set(2, 9, -1, cl).set(2, 9, 0, cl);
    g.box(-3, 6, -1, -2, 7, 0, c);
    g.box(-3, 8, -1, -3, 9, 0, c);
    g.set(-3, 10, -1, cl).set(-3, 10, 0, cl);
    g.set(0, 13, 0, 0xff6fb8);
    return g;
  },
  rock(color = 0x9aa2b4, seed = 1) {
    const g = new VoxGrid();
    const s = Math.floor(hash3(seed, 5, 1) * 2);
    blob(g, -3, 0, -3, 7, 2, 6, (y, h) => (y === h - 1 ? shade(color, 0.12) : shade(color, -0.08)), 2);
    blob(g, -2 + s, 2, -2, 4, 2, 4, (y, h) => (y === h - 1 ? shade(color, 0.22) : color), 1);
    return g;
  },
};
