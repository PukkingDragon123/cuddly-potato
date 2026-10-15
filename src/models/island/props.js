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

// ---------------------------------------------------------------------------
// Northern Wilds: vegetation brushes (low triangle, chunky voxels)

Object.assign(LOWPOLY, {
  /** Rainforest tree: buttress roots, tall trunk, two canopy tiers and hanging vines. */
  jungle(leaf = 0x2f9a3e, seed = 1) {
    const g = new VoxGrid();
    const bark = 0x8a6a4a, barkD = 0x6a4e34;
    g.box(-2, 0, -2, 1, 1, 1, barkD);
    for (const [dx, dz] of [[-3, 0], [2, -1], [0, 2], [-1, -3]]) g.box(dx, 0, dz, dx, 2, dz, barkD);
    const lean = hash3(seed, 4, 4) < 0.5 ? 1 : -1;
    let x = 0;
    for (let y = 2; y < 20; y++) {
      if (y === 12) x += lean;
      g.box(x - 1, y, -1, x, y, 0, y % 5 === 0 ? barkD : bark);
    }
    g.line(x, 14, 0, x + 4 * lean, 17, 1, barkD);
    const L = leaf, Ld = shade(leaf, -0.24), Ll = shade(leaf, 0.2);
    blob(g, x - 6, 18, -6, 12, 3, 12, band(L), 3);
    blob(g, x - 4 + lean * 2, 21, -4, 8, 2, 8, band(Ll), 2);
    blob(g, x + 4 * lean - 3, 16, -2, 6, 2, 6, band(Ld), 2);
    // vines + bromeliads
    for (let k = 0; k < 3; k++) {
      const vx = x - 5 + Math.floor(hash3(seed, k, 1) * 11), vz = -5 + Math.floor(hash3(seed, k, 2) * 10);
      const len = 3 + Math.floor(hash3(seed, k, 3) * 7);
      if (g.has(vx, 18, vz)) for (let y = 17; y > 17 - len; y--) g.set(vx, y, vz, k & 1 ? 0x1f7a36 : 0x2a8a3c);
    }
    g.set(x, 13, 1, 0xff4fa3).set(x - 1, 9, 1, 0xffd23f);
    return g;
  },
  /** Low fern: arching fronds. */
  fern(leaf = 0x3fae48) {
    const g = new VoxGrid();
    for (let a = 0; a < 7; a++) {
      const an = (a / 7) * Math.PI * 2 + 0.3;
      for (let r = 0; r <= 5; r++) {
        const y = r < 3 ? r : 5 - r;
        g.set(Math.round(Math.cos(an) * r), Math.max(0, y), Math.round(Math.sin(an) * r), r > 3 ? shade(leaf, 0.2) : r === 0 ? shade(leaf, -0.2) : leaf);
      }
    }
    return g;
  },
  /** Twisted dead tree with grey-purple bark. */
  spooky(seed = 1) {
    const g = new VoxGrid();
    const c = 0x4a3e58, cl = 0x5e5070, cd = 0x342a40;
    g.box(-1, 0, -1, 0, 9, 0, c);
    g.box(-2, 0, -2, 1, 0, 1, cd);
    const s = hash3(seed, 1, 1) < 0.5 ? 1 : -1;
    g.line(0, 6, 0, 4 * s, 10, 1, cl);
    g.line(4 * s, 10, 1, 6 * s, 10, 3, cl);
    g.line(6 * s, 10, 3, 6 * s, 12, 4, c);
    g.line(-1, 8, 0, -5 * s, 13, -1, cl);
    g.line(-5 * s, 13, -1, -6 * s, 15, -1, c);
    g.line(0, 9, 0, 1, 15, -2, c);
    g.line(1, 15, -2, 3, 16, -2, cl);
    g.set(1, 4, 1, cd).set(0, 5, 1, 0x1a141f); // knot hole
    return g;
  },
  pumpkin(lantern = false) {
    const g = new VoxGrid();
    const o = 0xff8a1a, od = 0xd8600e, ol = 0xffa84a;
    for (let x = -3; x <= 3; x++) for (let y = 0; y <= 4; y++) for (let z = -3; z <= 3; z++) {
      if ((x / 3.6) ** 2 + ((y - 2) / 2.7) ** 2 + (z / 3.6) ** 2 > 1) continue;
      g.set(x, y, z, (x + 10) % 2 === 0 ? od : y === 4 ? ol : o);
    }
    g.box(0, 5, 0, 0, 6, 0, 0x3f7a2a).set(1, 6, 0, 0x5fa83a);
    if (lantern) {
      g.set(-2, 3, 3, 0xffd23f, true).set(1, 3, 3, 0xffd23f, true);
      for (let x = -2; x <= 1; x++) g.set(x, 1, 3, 0xffb02a, true);
    }
    return g;
  },
  tombstone(seed = 1) {
    const g = new VoxGrid();
    const s = 0x9a96a8, sd = 0x7a7688, sl = 0xb8b4c6;
    const kind = Math.floor(hash3(seed, 2, 2) * 3);
    if (kind === 2) {
      // cross
      g.box(0, 0, 0, 1, 9, 1, s);
      g.box(-2, 6, 0, 3, 7, 1, s);
      g.box(0, 9, 0, 1, 9, 1, sl);
    } else {
      g.box(-2, 0, 0, 2, 6, 1, (x, y) => (y === 6 ? sl : x === -2 ? sd : s));
      g.box(-1, 7, 0, 1, 7, 1, sl);
      if (kind === 1) { g.box(-1, 2, 2, 1, 2, 2, sd); g.box(0, 1, 2, 0, 4, 2, sd); }
      else g.box(-1, 4, 2, 1, 4, 2, sd).box(-1, 2, 2, 1, 2, 2, sd);
    }
    g.box(-2, 0, 2, 2, 0, 5, 0x4a3a40);
    g.set(-2, 1, 0, 0x5a8a4a).set(2, 0, -1, 0x5a8a4a);
    return g;
  },
  mushroom(cap = 0xe8343c) {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 2, 0, 0xf4ecd8);
    g.box(-2, 3, -2, 2, 3, 2, cap);
    g.box(-1, 4, -1, 1, 4, 1, shade(cap, 0.12));
    g.set(-1, 4, 1, 0xffffff).set(2, 3, 0, 0xffffff).set(0, 3, -2, 0xffffff);
    g.box(2, 0, 2, 2, 1, 2, 0xf4ecd8).box(1, 2, 1, 3, 2, 3, shade(cap, -0.1));
    return g;
  },
  /** Obsidian spike cluster with a hot glowing seam. */
  obsidian(seed = 1) {
    const g = new VoxGrid();
    const o = 0x241e2c, ol = 0x4a3a5a, op = 0x6a4a8a;
    for (const [x, z, h] of [[0, 0, 9], [2, 1, 5], [-2, -1, 6], [1, -2, 4], [-1, 2, 3]]) {
      const hh = h + Math.floor(hash3(seed, x, z) * 3);
      for (let y = 0; y < hh; y++) {
        const w = y < hh - 3 ? 1 : 0;
        g.box(x, y, z, x + w, y, z + w, y === hh - 1 ? op : (x + y) % 3 === 0 ? ol : o);
      }
    }
    g.box(-3, 0, -3, 3, 0, 3, (x, y, z) => (Math.abs(x) + Math.abs(z) > 4 ? undefined : 0x2e2830));
    g.set(0, 1, 2, 0xff6a1f, true).set(1, 0, 2, 0xff8a2a, true);
    return g;
  },
  coral(seed = 1) {
    const g = new VoxGrid();
    const cols = [0xff6fb0, 0xff8a4a, 0xb05cff, 0xffd23f, 0x5ce1e6];
    const c = cols[Math.floor(hash3(seed, 1, 9) * cols.length)], c2 = cols[Math.floor(hash3(seed, 2, 9) * cols.length)];
    // brain coral dome + branching staghorn
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 0; y <= 2; y++) {
      if ((x / 3.4) ** 2 + (z / 3.4) ** 2 + (y / 2.6) ** 2 > 1) continue;
      g.set(x, y, z, (x + z + y) % 2 ? c : shade(c, -0.15));
    }
    for (const [dx, dz] of [[3, 2], [-2, 3], [2, -3]]) {
      g.line(dx, 0, dz, dx, 4, dz, c2);
      g.line(dx, 3, dz, dx + Math.sign(dx), 5, dz, c2);
      g.line(dx, 2, dz, dx, 4, dz + Math.sign(dz), shade(c2, 0.15));
    }
    return g;
  },
});

// ---------------------------------------------------------------------------
// Northern Wilds landmarks

/** Giant rainforest emergent tree (voxel ~0.3): flared buttresses, vines, epiphytes. Trunk base at y = 0. */
export function kapokGrid(seed = 1) {
  const g = new VoxGrid();
  const bark = 0x9a7a58, barkD = 0x6e543a, barkL = 0xb89270, moss = 0x4a9a3a;
  const H = 62;
  for (let y = 0; y < H; y++) {
    const r = 3.2 + Math.max(0, 9 - y) * 0.5;
    for (let x = -Math.ceil(r) - 1; x <= Math.ceil(r); x++) for (let z = -Math.ceil(r) - 1; z <= Math.ceil(r); z++) {
      const dx = x + 0.5, dz = z + 0.5;
      const a = Math.atan2(dz, dx);
      // buttress fins: 5 flares near the ground
      const fin = y < 12 ? Math.max(0, Math.cos(a * 5 + seed) - 0.55) * (12 - y) * 0.9 : 0;
      const rr = (y < 12 ? 3.2 : r) + fin;
      if (dx * dx + dz * dz > rr * rr) continue;
      const streak = hash3(x, y >> 3, z) < 0.25;
      g.set(x, y, z, y < 3 ? moss : streak ? barkD : (y % 9 === 0 ? barkL : bark));
    }
  }
  // spreading limbs + canopy umbrella
  const leaf = [0x2f9a3e, 0x3fae48, 0x55c25a, 0x1f7a36];
  const limbs = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + seed;
    const len = 14 + hash3(seed, k, 1) * 6;
    const ex = Math.round(Math.cos(a) * len), ez = Math.round(Math.sin(a) * len), ey = H - 4 + Math.round(hash3(seed, k, 2) * 6);
    g.line(0, H - 10, 0, ex, ey, ez, barkD, 1);
    limbs.push([ex, ey, ez]);
  }
  for (const [ex, ey, ez] of [...limbs, [0, H + 2, 0]]) {
    const rx = 9 + hash3(ex, ey, ez) * 4, ry = 3.2, rz = 9 + hash3(ez, ex, 2) * 4;
    for (let x = Math.floor(-rx); x <= rx; x++) for (let z = Math.floor(-rz); z <= rz; z++) for (let y = -2; y <= 3; y++) {
      const d = (x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2;
      if (d > 1 + (hash3(x + ex, y, z + ez) - 0.5) * 0.25) continue;
      g.set(ex + x, ey + y, ez + z, y >= 2 ? leaf[2] : y <= -1 ? leaf[3] : ((x >> 2) + (z >> 2)) & 1 ? leaf[0] : leaf[1]);
    }
  }
  // hanging lianas + flowers
  for (let k = 0; k < 18; k++) {
    const x = Math.round((hash3(seed, k, 3) - 0.5) * 40), z = Math.round((hash3(seed, k, 4) - 0.5) * 40);
    let top = -1;
    for (let y = H + 6; y > 20; y--) if (g.has(x, y, z)) { top = y; break; }
    if (top < 0) continue;
    const len = 6 + Math.floor(hash3(seed, k, 5) * 16);
    for (let y = top - 1; y > top - len; y--) if (!g.has(x, y, z)) g.set(x, y, z, (y & 3) === 0 ? 0x2a8a3c : 0x1f6a30);
    if (k % 5 === 0) g.set(x, top - len, z, [0xff4fa3, 0xffd23f, 0xff6a3a][k % 3]);
  }
  return g;
}

/** Shipwreck (voxel 0.25): a broken galleon hull with a snapped mast and tattered sail. Bow toward +z. */
export function shipwreckGrid() {
  const g = new VoxGrid();
  const W = [0x8a5a34, 0x7a4e2c, 0x9a6a3c], WD = 0x4a301c, barn = 0xb8c0a8, moss = 0x4a8a5a;
  const L = 64;
  const hwAt = (z) => (z < 8 ? 6 + z * 0.4 : z < 44 ? 9 : 9 * Math.sqrt(Math.max(0, 1 - ((z - 44) / (L - 44)) ** 2)));
  for (let z = 0; z < L; z++) {
    const hw = hwAt(z);
    const sheer = z > 50 ? Math.round((z - 50) * 0.35) : z < 6 ? Math.round((6 - z) * 0.5) : 0;
    for (let y = 0; y <= 12 + sheer; y++) {
      const w = Math.max(0.8, hw - (y < 4 ? (4 - y) * 1.3 : 0));
      for (let x = -Math.ceil(w); x < Math.ceil(w); x++) {
        if (Math.abs(x + 0.5) > w) continue;
        const shell = Math.abs(x + 0.5) > w - 1.3 || y === 0;
        if (!shell && y > 1) continue; // hollow
        const c = y < 3 ? (hash3(x, y, z) < 0.35 ? barn : moss) : y === 9 ? WD : W[(y + (z >> 3)) % 3];
        g.set(x, y, z, c);
      }
    }
  }
  // smashed hole on the starboard side + missing deck planks
  g.carve((x, y, z) => x > 3 && y > 2 && y < 9 && z > 18 && z < 30 && (z - 24) ** 2 / 36 + (y - 5.5) ** 2 / 9 < 1);
  for (let z = 6; z < 50; z++) for (let x = -8; x < 8; x++) if (Math.abs(x + 0.5) < hwAt(z) - 1 && hash3(x >> 1, 3, z >> 1) < 0.62) g.set(x, 11, z, (z & 1) ? 0xa87a4a : 0x946a40);
  // gun ports
  for (let z = 10; z < 44; z += 6) for (const s of [-1, 1]) { const x = s > 0 ? 8 : -9; g.box(x, 7, z, x, 8, z + 1, 0x1a1210); }
  // stern castle
  g.box(-8, 13, 0, 7, 18, 9, (x, y, z) => (y === 18 ? WD : z === 0 && y > 14 && (x & 3) === 1 ? 0x3a5a6a : W[(y + x) & 1 ? 0 : 2]));
  // snapped main mast (tilted stump) + intact foremast with tattered sail + crow's nest
  g.box(-1, 11, 30, 0, 22, 31, WD);
  g.line(0, 22, 30, 5, 26, 34, WD, 0);
  for (let y = 11; y < 42; y++) g.box(-1, y, 46, 0, y, 47, y % 6 === 0 ? 0x5a3a20 : WD);
  g.box(-8, 32, 46, 7, 32, 47, WD);
  for (let y = 22; y < 32; y++) for (let x = -7; x <= 6; x++) {
    if (hash3(x, y, 7) < 0.18 + (31 - y) * 0.02 && y < 28) continue; // torn holes
    g.set(x, y, 48, (y + x) % 7 === 0 ? 0xc8b896 : 0xe8dcc0);
  }
  g.box(-3, 40, 44, 2, 41, 49, WD);
  g.set(0, 43, 46, 0x15121f).box(1, 42, 46, 4, 43, 46, 0x15121f); // pirate flag
  text(g, 'X', 2, 42, 47, '+z', 0xffffff);
  // bowsprit
  g.line(0, 13, L - 2, 0, 19, L + 10, WD, 0);
  return g;
}

/** Twisted giant dead tree (voxel 0.2) for the haunted hill, with a rope swing and lanterns. */
export function spookyGiantGrid() {
  const g = new VoxGrid();
  const c = 0x3e3250, cl = 0x54466a, cd = 0x2a2236;
  for (let y = 0; y < 34; y++) {
    const r = 3.2 + Math.max(0, 6 - y) * 0.5;
    const ox = Math.round(Math.sin(y * 0.12) * 2);
    g.cylinder(ox - 0.5, -0.5, y, y, r, (x, yy, z) => (hash3(x, yy >> 1, z) < 0.3 ? cd : c));
  }
  const branch = (x0, y0, z0, pts) => { let p = [x0, y0, z0]; for (const q of pts) { g.line(...p, ...q, cl, 1); p = q; } };
  branch(2, 26, 0, [[10, 32, 2], [16, 34, 6], [20, 38, 6]]);
  branch(-1, 28, 0, [[-9, 34, -2], [-15, 40, -1], [-17, 44, 2]]);
  branch(1, 32, 0, [[3, 42, -4], [0, 48, -6], [2, 52, -5]]);
  branch(0, 22, 1, [[-6, 24, 6], [-12, 25, 8]]);
  // twig tips
  for (const [x, y, z] of [[20, 38, 6], [-17, 44, 2], [2, 52, -5], [-12, 25, 8], [16, 34, 6]]) {
    g.line(x, y, z, x + 2, y + 3, z, cd);
    g.line(x, y, z, x - 2, y + 2, z + 1, cd);
  }
  // rope swing on the low branch + hanging lanterns (warm glow)
  for (let y = 12; y < 24; y++) { g.set(-8, y, 7, 0xc8a870); g.set(-11, y, 7, 0xc8a870); }
  g.box(-12, 11, 6, -7, 11, 8, 0x8a5a2a);
  for (const [x, y, z] of [[14, 30, 6], [-14, 36, -1]]) {
    g.box(x, y - 3, z, x, y, z, 0x2a2238);
    g.box(x - 1, y - 6, z - 1, x + 1, y - 4, z + 1, 0x2a2238);
    g.set(x, y - 5, z, 0xffc84a, true);
  }
  // roots
  for (let a = 0; a < 6; a++) { const an = a * 1.05; g.line(0, 2, 0, Math.round(Math.cos(an) * 8), 0, Math.round(Math.sin(an) * 8), cd, 0); }
  return g;
}

// ---------------------------------------------------------------------------
// Space elevator (voxel 0.25)

/** Ground anchor: an octagonal launch pad ring with clamps and beacons around the tether. */
export function elevatorAnchorGrid() {
  const g = new VoxGrid();
  const m = 0xc8ced8, md = 0x8e96a4, mdd = 0x4a5262, blue = 0x8f9bff;
  for (let x = -14; x <= 13; x++) for (let z = -14; z <= 13; z++) {
    const o = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5), (Math.abs(x + 0.5) + Math.abs(z + 0.5)) / 1.38);
    if (o > 13.5) continue;
    g.set(x, 0, z, o > 12.5 ? blue : o > 11.5 ? 0xffc21a : ((x >> 2) + (z >> 2)) & 1 ? m : 0xd8dce6);
    g.set(x, -1, z, md);
  }
  // clamp towers holding the tether
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) {
    g.box(x, 1, z, x, 9, z, mdd);
    g.line(x, 9, z, x > 0 ? 1 : -2, 12, z > 0 ? 1 : -2, md);
    g.set(x, 10, z, 0xff3a3a, true);
  }
  g.box(-2, 1, -2, 1, 3, 1, mdd);
  return g;
}
/** One tether segment (lattice of 4 corner rails + cross bracing), height 12 voxels. */
export function tetherSegGrid() {
  const g = new VoxGrid();
  const c = 0xb8c0cc, d = 0x6b7386;
  for (const [x, z] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) g.box(x, 0, z, x, 11, z, c);
  for (let y = 0; y < 12; y++) {
    const k = y % 6;
    g.set(-2 + Math.min(3, k), y, -2, d).set(1 - Math.min(3, k), y, 1, d);
    g.set(-2, y, -2 + Math.min(3, k), d).set(1, y, 1 - Math.min(3, k), d);
  }
  g.box(-1, 0, -1, 0, 11, 0, 0x8f9bff);
  return g;
}
/** Elevator climber pod (windows glow). */
export function climberGrid() {
  const g = new VoxGrid();
  const w = 0xeef0f8, d = 0x4a5262;
  g.box(-4, 0, -4, 3, 6, 3, (x, y, z) => (y === 0 || y === 6 ? d : w));
  for (const [x, z] of [[-4, -1], [3, -1], [-1, -4], [-1, 3]]) g.box(x, 2, z, x, 4, z + 1, 0x9fd8ff, true);
  g.box(-3, 7, -3, 2, 7, 2, 0x8f9bff);
  g.box(-1, -1, -1, 0, -1, 0, 0xffc21a, true);
  return g;
}
export function satelliteGrid() {
  const g = new VoxGrid();
  g.box(-2, -2, -2, 1, 1, 1, 0xffc21a);
  g.box(-2, 2, -2, 1, 2, 1, 0xd8dce6);
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 2 : -3;
    g.box(x0, 0, 0, x0 + s * 1, -1, -1, 0x8e96a4);
    g.box(s > 0 ? 4 : -13, -2, -1, s > 0 ? 12 : -5, 1, -1, (x) => ((x & 3) === 0 ? 0xc8ced8 : 0x2a3a8a));
  }
  g.line(0, 3, 0, 0, 6, 0, 0xc8ced8);
  g.set(0, 7, 0, 0xff3a3a, true);
  return g;
}

/** Lattice comms tower with dishes (voxel 0.2). */
export function commTowerGrid() {
  const g = new VoxGrid();
  const r = 0xe8343c, w = 0xf4f6fa, d = 0x5a6272;
  for (let y = 0; y < 60; y++) {
    const hw = Math.max(1, Math.round(5 - y * 0.07));
    const col = Math.floor(y / 6) % 2 ? r : w;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.set(sx * hw - (sx < 0 ? 0 : 1), y, sz * hw - (sz < 0 ? 0 : 1), col);
    if (y % 6 === 0) for (let k = -hw; k < hw; k++) { g.set(k, y, -hw, d); g.set(k, y, hw - 1, d); g.set(-hw, y, k, d); g.set(hw - 1, y, k, d); }
  }
  for (const [y, s] of [[34, 1], [46, -1]]) {
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (a * a + b * b <= 10) g.set(s * 4 + (s > 0 ? Math.round((a * a + b * b) / 6) : -Math.round((a * a + b * b) / 6)), y + a, b, w);
  }
  g.box(0, 60, 0, 0, 64, 0, d);
  g.set(0, 65, 0, 0xff3a3a, true);
  return g;
}

/** Ocean-cleanup boat with a trash net boom (voxel 0.12), bow +z. */
export function cleanupBoatGrid() {
  const g = new VoxGrid();
  const L = 30;
  for (let z = 0; z < L; z++) {
    const hw = z < 20 ? 6 : 6 * Math.sqrt(Math.max(0, 1 - ((z - 20) / 10) ** 2));
    for (let y = 0; y <= 5; y++) for (let x = -6; x < 6; x++) {
      if (Math.abs(x + 0.5) > Math.max(0.6, hw - (y === 0 ? 1.5 : 0))) continue;
      g.set(x, y, z, y <= 1 ? 0x1a3a6a : y === 4 ? 0x29e0ff : 0xf6f8fc);
    }
  }
  g.box(-4, 6, 4, 3, 11, 13, (x, y) => (y === 11 ? 0x29e0ff : 0xf6f8fc));
  g.box(-3, 9, 13, 2, 10, 13, 0x24324e);
  g.box(-1, 12, 7, 0, 15, 8, 0x3d4352);
  g.set(0, 16, 7, 0xffd23f);
  // A-frame crane + net full of trash at the stern
  g.line(-5, 6, 2, 0, 16, -3, 0xffa62a);
  g.line(4, 6, 2, -1, 16, -3, 0xffa62a);
  for (let x = -3; x <= 2; x++) for (let y = 8; y <= 13; y++) if ((x + y) & 1) g.set(x, y, -4, 0x4a5a5a);
  for (const [x, y, c] of [[-2, 9, 0x5ce1e6], [1, 10, 0xe8343c], [0, 12, 0xffffff], [-1, 11, 0x5fdc4a]]) g.set(x, y, -5, c);
  text(g, 'TEAMSEAS', 7, 2, 25, '+x', 0x1a3a6a, {});
  return g;
}
/** Floating boom segment: orange float + net skirt (voxel 0.1). */
export function boomGrid() {
  const g = new VoxGrid();
  g.box(-6, 0, -1, 5, 1, 0, (x) => ((x + 6) % 4 < 2 ? 0xff8a1a : 0xffd23f));
  g.box(-6, -1, -1, 5, -1, -1, 0x2a3a3a);
  return g;
}
/** Bits of floating plastic (voxel 0.08). */
export function trashGrid(seed = 1) {
  const g = new VoxGrid();
  const cols = [0x5ce1e6, 0xffffff, 0xe8343c, 0x5fdc4a, 0xffd23f, 0x3a6a9a];
  for (let k = 0; k < 6; k++) {
    const x = Math.round((hash3(seed, k, 1) - 0.5) * 10), z = Math.round((hash3(seed, k, 2) - 0.5) * 10);
    const c = cols[Math.floor(hash3(seed, k, 3) * cols.length)];
    if (k % 3 === 0) g.box(x, 0, z, x + 2, 0, z, c).set(x + 3, 0, z, 0xffffff); // bottle
    else g.box(x, 0, z, x + 1, 0, z + 1, c);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Flyers: bats (haunted hill) + parrots (jungle). Body faces +z, wing extends +x from the hinge.
export function batBodyGrid() {
  const g = new VoxGrid();
  g.box(-1, 0, -2, 1, 2, 1, 0x2a2236);
  g.box(-1, 1, 2, 1, 3, 3, 0x2a2236);
  g.set(-1, 4, 2, 0x2a2236).set(1, 4, 2, 0x2a2236);
  g.set(-1, 2, 4, 0xff3a5a, true).set(1, 2, 4, 0xff3a5a, true);
  return g;
}
export function batWingGrid() {
  const g = new VoxGrid();
  for (let x = 0; x <= 7; x++) {
    const w = x < 3 ? 2 : x < 6 ? 1 : 0;
    for (let z = -w; z <= w; z++) g.set(x, 0, z - 1, x % 3 === 2 ? 0x1a1424 : 0x3a2e4a);
  }
  return g;
}
export function parrotBodyGrid(color = 0xe8343c) {
  const g = new VoxGrid();
  g.box(-1, 0, -3, 1, 2, 2, color);
  g.box(-1, 1, 3, 1, 3, 4, color);
  g.box(0, 1, 5, 0, 2, 6, 0xfff2c8);
  g.set(-1, 3, 4, 0x15121f).set(1, 3, 4, 0x15121f);
  g.box(0, 0, -7, 0, 1, -4, shade(color, -0.2));
  g.box(0, 0, -9, 0, 0, -8, 0x29b6f6);
  return g;
}
export function parrotWingGrid(color = 0xe8343c) {
  const g = new VoxGrid();
  for (let x = 0; x <= 8; x++) {
    const w = x < 5 ? 2 : 1;
    for (let z = -w; z <= w - 1; z++) g.set(x, 0, z, x >= 6 ? 0x29b6f6 : x >= 4 ? 0xffd23f : color);
  }
  return g;
}
/** Little floating ghost (voxel 0.08). */
export function ghostGrid() {
  const g = new VoxGrid();
  const w = 0xf2f0ff, s = 0xd0cce8;
  g.ellipsoid(0, 9, 0, 4, 4, 3.5, w);
  g.box(-4, 3, -3, 4, 8, 3, (x, y, z) => ((x * x) / 18 + (z * z) / 11 > 1 ? undefined : y < 4 && (x + 8) % 3 === 0 ? undefined : y < 5 ? s : w));
  g.set(-2, 10, 4, 0x15121f).set(1, 10, 4, 0x15121f).set(-2, 9, 4, 0x15121f).set(1, 9, 4, 0x15121f);
  g.box(-1, 6, 4, 0, 7, 4, 0x15121f);
  g.box(-6, 7, 0, -5, 8, 0, w).box(5, 8, 0, 6, 9, 0, w);
  return g;
}

/** Glowing energy ring that climbs the space-elevator tether (voxel 0.25). */
export function beamRingGrid() {
  const g = new VoxGrid();
  for (let a = 0; a < 24; a++) {
    const an = (a / 24) * Math.PI * 2;
    g.set(Math.round(Math.cos(an) * 4.2 - 0.5), 0, Math.round(Math.sin(an) * 4.2 - 0.5), a & 1 ? 0x8f9bff : 0xc8d0ff, true);
  }
  return g;
}
/** Little security helicopter (voxel 0.1), nose +z; rotor separate. */
export function heliBodyGrid() {
  const g = new VoxGrid();
  const r = 0x2a2e3a, rl = 0x3d4352, y = 0xffd23f;
  g.ellipsoid(0, 5, 4, 4, 4, 6, (x, yy, z) => (z > 6 && yy > 4 ? 0x8fd8ff : yy === 3 ? y : r));
  g.box(0, 6, -14, 0, 7, -2, rl);
  g.box(0, 7, -15, 0, 11, -13, r);
  g.box(-2, 9, -15, 2, 9, -14, y);
  for (const s of [-1, 1]) { g.box(s * 4, 0, -2, s * 4, 0, 10, rl); g.box(s * 3, 1, 1, s * 3, 1, 1, rl).box(s * 3, 1, 7, s * 3, 1, 7, rl); }
  g.box(-1, 10, 3, 0, 10, 4, rl);
  g.set(0, 2, 10, 0xffffff, true);
  g.set(0, 12, -14, 0xff3a3a, true);
  return g;
}
export function heliRotorGrid() {
  const g = new VoxGrid();
  for (let k = -12; k <= 12; k++) { g.set(k, 0, 0, 0x4a5262); g.set(0, 0, k, 0x4a5262); }
  g.box(-1, 0, -1, 1, 1, 1, 0x2a2e3a);
  return g;
}

/** Hot-air balloon (voxel 0.12): striped envelope, rope rigging, wicker basket. */
export function balloonGrid(c1 = 0xff4fa3, c2 = 0xffd23f) {
  const g = new VoxGrid();
  for (let y = 0; y < 26; y++) {
    const t = y / 25;
    const r = t < 0.25 ? 4 + t * 26 : 10.5 * Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.4) ** 2));
    for (let x = -12; x <= 11; x++) for (let z = -12; z <= 11; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > r || d < r - 1.4) continue;
      const seg = Math.floor((Math.atan2(z + 0.5, x + 0.5) + Math.PI) / (Math.PI / 6));
      g.set(x, y + 12, z, y > 23 ? c2 : (seg & 1 ? c1 : c2));
    }
  }
  text(g, 'B', 0, 22, 11, '+z', 0xffffff, { center: true, scale: 2 });
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) g.line(x, 12, z, x > 0 ? 2 : -3, 4, z > 0 ? 2 : -3, 0x8a6a3a);
  g.box(-3, 0, -3, 2, 3, 2, (x, y) => (y === 3 ? 0x6e4224 : (x + y) & 1 ? 0xb8844a : 0x9a6a3c));
  g.box(-1, 10, -1, 0, 11, 0, 0xff8a1a, true); // burner
  return g;
}
