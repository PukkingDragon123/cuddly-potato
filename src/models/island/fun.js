// Voxel grids for Beast Island's tappable things (the home scene's islandFun.js animates them):
// bee hives + bees, coconut palms + coconuts, crabs, jumping fish, the treasure X, the geyser,
// the hidden cave with its glowing eyes, the lighthouse beam, a fishing rod, a stolen fry.
import { VoxGrid } from '../../core/voxel.js';
import { shade, hash3 } from '../../core/util.js';

/** Straw skep bee hive on a wooden stand with a little roof (voxel 0.08). Entrance faces +z. */
export function hiveGrid() {
  const g = new VoxGrid();
  const wood = 0x8a5a30, woodD = 0x6e4224;
  // stand: post + shelf
  g.box(-1, 0, -1, 0, 11, 0, (x, y) => ((y & 3) === 0 ? woodD : wood));
  g.box(-3, 0, -3, 2, 0, 2, woodD);
  g.box(-7, 12, -6, 6, 13, 5, (x, y) => (y === 13 ? 0xb87d46 : woodD));
  // skep: stacked straw coils, narrowing toward the top
  const R = [6.4, 7, 7.2, 7.2, 7, 6.6, 6, 5.2, 4.2, 3, 1.6];
  R.forEach((r, k) => {
    const y = 14 + k;
    const c1 = k & 1 ? 0xf2c14e : 0xe0a83a, c2 = k & 1 ? 0xd89a2a : 0xc8892a;
    for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > r) continue;
      g.set(x, y, z, hash3(x, y, z) < 0.18 ? c2 : c1);
    }
  });
  // entrance + honey drips
  g.box(-1, 14, 6, 0, 15, 7, 0x2a1a10);
  for (const [x, y0, n] of [[-4, 19, 3], [3, 17, 2], [5, 21, 2]]) for (let k = 0; k < n; k++) g.set(x, y0 - k, 7 - (x > 4 ? 1 : 0), k === n - 1 ? 0xffd23f : 0xffb81a);
  // roof boards over the hive
  for (let k = 0; k < 5; k++) for (let x = -9; x <= 8; x++) {
    g.set(x, 27 + k, -4 + k * 2, k & 1 ? 0xa0673a : 0x8a5a30);
    g.set(x, 27 + k, -3 + k * 2, k & 1 ? 0xa0673a : 0x8a5a30);
  }
  for (const x of [-9, 8]) g.box(x, 14, -5, x, 27, -5, woodD);
  return g;
}
/** A bee (voxel 0.04): striped body, white wings, faces +z. */
export function beeGrid() {
  const g = new VoxGrid();
  for (let z = -2; z <= 2; z++) for (let x = -1; x <= 1; x++) for (let y = 0; y <= 2; y++) {
    if (Math.abs(x) === 1 && (y === 0 || y === 2) && Math.abs(z) === 2) continue;
    g.set(x, y, z, z === 2 ? 0x2a2238 : (z & 1) ? 0x2a2238 : 0xffd23f);
  }
  g.set(0, 1, 3, 0x2a2238);
  g.box(-3, 3, -1, -1, 3, 1, 0xf4fbff).box(1, 3, -1, 3, 3, 1, 0xf4fbff);
  return g;
}
/** Coconut palm with a coconut cluster (voxel 0.12); top of the trunk at y = 30 voxels. */
export function coconutPalmGrid(seed = 1) {
  const g = new VoxGrid();
  const trunk = 0x9a6a3a, trunkD = 0x7a5028;
  let x = 0;
  for (let y = 0; y < 30; y++) {
    if (y === 8 || y === 15 || y === 21 || y === 26) x += 1;
    g.box(x - 1, y, -1, x, y, 0, y % 3 === 2 ? trunkD : trunk);
  }
  const L = seed & 1 ? 0x4cba3a : 0x5fd04a, Ld = shade(L, -0.22), Ll = shade(L, 0.18);
  g.box(x - 2, 30, -2, x + 1, 31, 1, Ld);
  g.box(x - 1, 32, -1, x, 32, 0, Ll);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const [dx, dz] of dirs) {
    const n = dx && dz ? 7 : 10;
    for (let k = 1; k <= n; k++) {
      const y = 31 - Math.floor((k * k) / 22);
      const cx = x + dx * k + (dx > 0 ? 0 : -1), cz = dz * k + (dz > 0 ? 0 : -1);
      const c = k > n - 3 ? Ld : k > 3 ? L : Ll;
      g.set(cx, y, cz, c);
      if (!(dx && dz)) { if (dx) g.set(cx, y, cz + 1, c); else g.set(cx + 1, y, cz, c); }
    }
  }
  // two coconuts left hanging (the third one is its own mesh so it can drop)
  for (const [cx, cz] of [[x - 2, 1], [x + 1, -2]]) g.box(cx, 28, cz, cx + 1, 29, cz + 1, 0x6e4224).set(cx, 29, cz, 0x8a5a30);
  return g;
}
export const PALM_TOP = 29; // voxels: where the loose coconut hangs
/** One coconut (voxel 0.12, centred). */
export function coconutGrid() {
  const g = new VoxGrid();
  g.box(-1, -1, -1, 0, 0, 0, 0x6e4224);
  g.set(-1, 0, -1, 0x8a5a30).set(0, -1, 0, 0x4a3018);
  return g;
}
/** Crab (voxel 0.06): red shell, claws up, eyes on stalks; faces +z. */
export function crabGrid() {
  const g = new VoxGrid();
  const r = 0xe8343c, rd = 0xb8202a, rl = 0xff6a5a;
  g.box(-3, 1, -2, 2, 2, 1, (x, y) => (y === 2 ? rl : r));
  g.box(-2, 3, -1, 1, 3, 0, r);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -4 : 3;
    for (let k = 0; k < 3; k++) g.set(x0 + sx * k, 0, -2 + k, rd);
    g.box(x0 + sx, 2, 2, x0 + sx * 2, 3, 3, r).set(x0 + sx * 2, 4, 3, rl);
    g.set(sx < 0 ? -1 : 0, 4, 1, rd).set(sx < 0 ? -1 : 0, 5, 1, 0xffffff).set(sx < 0 ? -1 : 0, 5, 2, 0x120c24);
  }
  return g;
}
/** Fish (voxel 0.07): orange body with a white stripe, tail at -z. */
export function fishGrid(c = 0xff8a1f) {
  const g = new VoxGrid();
  const cl = shade(c, 0.3), cd = shade(c, -0.25);
  const prof = [1, 2, 2, 3, 3, 3, 2, 2, 1];
  prof.forEach((h, k) => {
    const z = k - 4;
    for (let y = -h; y <= h; y++) g.set(0, y, z, y > 0 ? cl : (k === 3 ? 0xffffff : c)).set(-1, y, z, y > 0 ? cl : (k === 3 ? 0xffffff : cd));
  });
  for (let k = 0; k < 3; k++) for (let y = -k - 1; y <= k + 1; y++) if (Math.abs(y) >= k) g.set(0, y, -6 - k, c).set(-1, y, -6 - k, cd);
  g.set(0, 1, 3, 0x120c24).set(-1, 1, 3, 0x120c24);
  g.set(0, 4, -1, cd).set(0, 4, 0, cd).set(-1, 4, -1, cd);
  return g;
}
/** The treasure X painted on the sand (voxel 0.1): a red pixel X with a dark outline + sand lumps. */
export function xMarkGrid() {
  const g = new VoxGrid();
  for (let i = -5; i <= 5; i++) for (const [x, z] of [[i, i], [i, -i]]) {
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]]) g.set(x + ox, 1, z + oz, 0xe8343c);
  }
  // outline
  const red = [];
  g.forEach((x, y, z) => red.push([x, z]));
  for (const [x, z] of red) for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.has(x + ox, 1, z + oz)) g.set(x + ox, 0, z + oz, 0x6a1a14);
  for (const [x, z] of [[-7, 4], [6, -6], [7, 5], [-6, -7]]) g.box(x, 0, z, x + 1, 1, z, 0xf0da98);
  return g;
}
/** Dug-up hole (voxel 0.1): a darker sand rim with a dark middle. */
export function holeGrid() {
  const g = new VoxGrid();
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    const d = Math.hypot(x, z);
    if (d > 4.3) continue;
    g.set(x, 0, z, d < 2.6 ? 0x8a6a3a : 0xd8bc7a);
    if (d >= 3.4) g.set(x, 1, z, 0xe8cc8a);
  }
  return g;
}
/** Geyser vent (voxel 0.12): a mineral-crusted mound with a steaming hole and a warm pool. */
export function geyserGrid() {
  const g = new VoxGrid();
  for (let x = -14; x <= 13; x++) for (let z = -14; z <= 13; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d > 13.5) continue;
    const h = Math.max(0, Math.round(5 - d * 0.42 + hash3(x >> 1, 3, z >> 1) * 1.2));
    for (let y = 0; y <= h; y++) {
      const crust = d > 8 ? (((x + z) & 3) === 0 ? 0xf6efe0 : 0xe2d6bc) : d > 4 ? (y === h ? 0xffb050 : 0xe8a050) : 0xd87a3a;
      g.set(x, y, z, y === h ? crust : shade(crust, -0.15));
    }
    if (d > 10.5 && d < 12.5) g.set(x, 1, z, 0x7cd8f4);
  }
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (Math.hypot(x + 0.5, z + 0.5) < 2.2) for (let y = 1; y <= 6; y++) g.del(x, y, z);
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (Math.hypot(x + 0.5, z + 0.5) < 2.2) g.set(x, 1, z, 0x2a3a5a);
  return g;
}
/** A water drop (voxel 0.12). */
export function dropGrid() {
  return new VoxGrid().box(-1, -1, -1, 0, 0, 0, 0xbcecff).set(0, 0, 0, 0xffffff);
}
/** Cave mouth in a rock face (voxel 0.15): a rocky arch around a dark opening; faces +z. */
export function caveGrid() {
  const g = new VoxGrid();
  const rock = [0x8e96a8, 0x7c8496, 0x9ea6b8, 0x6c7484];
  for (let x = -16; x <= 15; x++) for (let y = 0; y <= 22; y++) for (let z = -8; z <= 2; z++) {
    const bulge = 22 - Math.abs(x + 0.5) * 0.7 - Math.max(0, -z) * 0.6 + hash3(x >> 1, y >> 2, 5) * 3;
    if (y > bulge) continue;
    const inArch = Math.abs(x + 0.5) < 6.5 - Math.max(0, y - 6) * 0.45 && y < 13 && z > -6;
    if (inArch) { if (z === -6) g.set(x, y, z, 0x120c24); continue; }
    g.set(x, y, z, rock[(hash3(x >> 1, y >> 1, z) * 4) | 0]);
    if (y === Math.floor(bulge) && hash3(x, y, z) < 0.5) g.set(x, y + 1, z, 0x4fb441);
  }
  for (let x = -6; x <= 5; x++) for (let z = -6; z <= 2; z++) g.set(x, 0, z, 0x2a2238);
  return g;
}
/** Two glowing eyes for the cave (voxel 0.15). */
export function caveEyesGrid() {
  const g = new VoxGrid();
  g.box(-3, 0, 0, -2, 0, 0, 0xffe680, true).box(1, 0, 0, 2, 0, 0, 0xffe680, true);
  return g;
}
/** Lighthouse beam (voxel 0.5): a long wedge of light pointing along +z. */
export function beamGrid() {
  const g = new VoxGrid();
  for (let z = 0; z < 40; z++) {
    const w = 1 + Math.floor(z / 7);
    for (let x = -w; x < w; x++) for (let y = -Math.ceil(w / 2); y < Math.ceil(w / 2); y++) g.set(x, y, z, z < 6 ? 0xfff6c8 : 0xffe680);
  }
  return g;
}
/** Fishing rod held in a hand (voxel 0.05): handle at the origin, rod up toward +z/+y. */
export function rodGrid() {
  const g = new VoxGrid();
  g.box(0, -3, 0, 0, 1, 0, 0x6e4224);
  for (let k = 0; k < 30; k++) g.set(0, 2 + k, Math.floor(k * 0.55), k > 26 ? 0xe8343c : 0x3d4352);
  return g;
}
/** A golden fry the seagull steals (voxel 0.05). */
export function fryGrid() {
  return new VoxGrid().box(0, 0, 0, 0, 0, 6, 0xffd23f).set(0, 1, 6, 0xffe680).set(0, 0, 7, 0xe0a010);
}
