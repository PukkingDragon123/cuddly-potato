// Voxel builders for the SHOP bunker diorama (bunker.js). Pure: VoxGrid + modelling kit only
// (no DOM, no renderer), so the baking can run in a Web Worker (bunkerWorker.js) and the shop
// tab never stalls the main thread while the room is built. bakeSpec() returns raw typed arrays.
import * as THREE from 'three';
import { VoxGrid } from '../../core/voxel.js';
import { blob, rbox, capsule, cyl } from '../../models/kit.js';
import { shade, hash3, mixHex } from '../../core/util.js';

export const S1 = 0.1; // room shell voxels
export const S2 = 0.05; // prop voxels (same density as the chibis)
export const n3 = (x, y, z, s = 0) => hash3(x + s * 31, y - s * 17, z + s * 7);

// ---------------------------------------------------------------------------
// 3x5 stencil font (wall paint, crate stencils, counter plate)
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'], M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], 7: ['###', '..#', '.#.', '.#.', '.#.'], '-': ['...', '...', '###', '...', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'], '$': ['.#.', '###', '##.', '.##', '###'],
};
/** Paint text on the plane z (letters 3x5, 1 voxel apart), top-left at (x0, y0), wearing off where hash < wear. */
export function stencil(g, text, x0, y0, z, col, wear = 0.12) {
  let x = x0;
  for (const ch of text) {
    const art = FONT[ch];
    if (art) art.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#' && n3(x + i, y0 - j, z, 5) > wear) g.set(x + i, y0 - j, z, col); }));
    x += 4;
  }
}
const textW = (t) => t.length * 4 - 1;

// ---------------------------------------------------------------------------
// palette
const CONC = 0x8c8984, CONC_D = 0x66625d, MORTAR = 0x6a6661;
const HAZ_Y = 0xf0b21e, HAZ_K = 0x24211d;
const STEEL = 0x6c7480, STEEL_D = 0x484e58, STEEL_L = 0x9aa2ae;
const WOOD = 0x9a6a3c, WOOD_D = 0x6e4626, WOOD_L = 0xb8854e;
const RUST = 0x8a4a2a;
const hazard = (x, y, k = 8) => (((x + y) % k + k) % k < k / 2 ? HAZ_Y : HAZ_K);

/** Concrete block colour at (u, y) of a wall plane (u runs along the wall): 6x3 blocks, mortar lines. */
function blockCol(u, y, seed) {
  const row = Math.floor(y / 3);
  const uu = u + (row & 1) * 3;
  if (((y % 3) + 3) % 3 === 2 || (((uu % 6) + 6) % 6) === 5) return MORTAR;
  const id = Math.floor(uu / 6) * 131 + row * 17 + seed;
  let c = shade(CONC, (n3(id, 0, 0) - 0.5) * 0.14 + (n3(u, y, seed) - 0.5) * 0.05);
  if (y < 8) c = shade(c, -0.12 * (8 - y) / 8); // grime near the floor
  return c;
}

/**
 * Bake a grid and drop the voxel faces no camera position can ever see (backs of walls, floor
 * undersides, the far sides of props): the camera only moves in front of the diorama. Only for
 * meshes that do not cast shadows (the shadow pass draws back faces).
 */
const CAMS = [[-1.2, 1.4, 4], [1.2, 1.4, 4], [0, 3.6, 16], [-2, 1.5, 12], [2, 1.5, 12]];
function bakeCulled(grid, scale, ao = true) {
  const geo = grid.build({ scale, pivot: 'none', jitter: 0.04, ao });
  const idx = geo.index.array, pos = geo.attributes.position.array, nor = geo.attributes.normal.array, col = geo.attributes.color.array;
  const remap = new Int32Array(pos.length / 3).fill(-1);
  const P = [], N = [], C = [], groups = [], outIdx = [];
  let nv = 0;
  for (const grp of geo.groups) {
    const start = outIdx.length;
    for (let i = grp.start; i < grp.start + grp.count; i += 6) {
      const v = Math.min(idx[i], idx[i + 1], idx[i + 2], idx[i + 3], idx[i + 4], idx[i + 5]);
      const nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
      const cx = (pos[v * 3] + pos[v * 3 + 6]) / 2, cy = (pos[v * 3 + 1] + pos[v * 3 + 7]) / 2, cz = (pos[v * 3 + 2] + pos[v * 3 + 8]) / 2;
      let vis = false;
      for (const c of CAMS) if (nx * (c[0] - cx) + ny * (c[1] - cy) + nz * (c[2] - cz) > 0) { vis = true; break; }
      if (!vis) continue;
      for (let k = 0; k < 6; k++) {
        const o = idx[i + k];
        if (remap[o] < 0) {
          remap[o] = nv++;
          P.push(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]);
          N.push(nor[o * 3], nor[o * 3 + 1], nor[o * 3 + 2]);
          C.push(col[o * 3], col[o * 3 + 1], col[o * 3 + 2]);
        }
        outIdx.push(remap[o]);
      }
    }
    groups.push([start, outIdx.length - start, grp.materialIndex]);
  }
  geo.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(outIdx, 1) : new THREE.Uint16BufferAttribute(outIdx, 1));
  for (const [s0, n, m] of groups) if (n) g.addGroup(s0, n, m);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// builders: world-aligned voxel coords (world = v * scale)

/** Back + side walls: concrete blocks, a hazard band at the bottom, relief blocks, water stains. */
function buildWalls() {
  const g = new VoxGrid();
  for (let x = -84; x <= 83; x++)
    for (let y = 0; y <= 50; y++) {
      let c = blockCol(x, y, 3);
      const stain = (x >= -33 && x <= -31) || (x >= 22 && x <= 23);
      if (stain && y > 8 && c !== MORTAR && n3(x, y, 1) < 0.8) c = mixHex(shade(c, -0.2), 0x4a5a3a, 0.25);
      if (y <= 3) c = n3(x, y, 2) < 0.07 ? CONC_D : hazard(x, y);
      if (y === 4) c = 0x2a2724;
      g.set(x, y, -16, c);
      const blk = n3(Math.floor((x + (Math.floor(y / 3) & 1) * 3) / 6), Math.floor(y / 3), 9);
      if (y > 4 && c !== MORTAR && blk > 0.84) g.set(x, y, -15, shade(c, 0.05));
    }
  for (const [xw, s] of [[-85, 1], [84, -1]])
    for (let z = -16; z <= 30; z++)
      for (let y = 0; y <= 50; y++) g.set(xw, y, z, y <= 3 ? hazard(z, y) : blockCol(z * s, y, s > 0 ? 5 : 7));
  return g;
}

/** Floor slabs (seams, an oil stain, a painted line in front of the counter, a drain) + ceiling with pipes. */
function buildFloor() {
  const g = new VoxGrid();
  for (let x = -84; x <= 83; x++)
    for (let z = -16; z <= 36; z++) {
      let c = shade(0x67635d, (n3(Math.floor(x / 10), 0, Math.floor(z / 10), 4) - 0.5) * 0.1 + (n3(x, 0, z) - 0.5) * 0.05);
      if (((x % 10) + 10) % 10 === 0 || ((z % 10) + 10) % 10 === 0) c = 0x46423d;
      const oil = Math.hypot((x + 12) / 5, (z - 20) / 3) + n3(x, 1, z) * 0.4;
      if (oil < 1) c = mixHex(c, 0x1e1c1c, 0.65);
      if (z === 14 || z === 15) c = (x & 3) === 3 ? c : n3(x, 2, z) < 0.12 ? c : 0xd8a82a;
      if (x >= -6 && x <= 5 && z >= 26 && z <= 31) c = (x + 20) % 2 ? 0x22201e : 0x55524e;
      g.set(x, -1, z, c);
    }
  cyl(g, 'x', 41, -12, -84, 83, 1.6, 1.6, (x, y) => ((x % 14 + 14) % 14 < 2 ? 0x5a3424 : y > 41 ? shade(RUST, 0.1) : RUST));
  cyl(g, 'x', 42, -7, -84, 83, 1.1, 1.1, (x, y) => ((x % 18 + 18) % 18 < 2 ? STEEL_D : y > 42 ? STEEL_L : STEEL));
  for (const x of [-40, -10, 20, 46]) { g.box(x, 39, -14, x + 1, 44, -13, STEEL_D); g.box(x - 1, 43, -15, x + 2, 44, -11, STEEL_D); }
  return g;
}

/** The floor towards the camera (coarse: it is only ever seen at a grazing angle). */
function buildApron() {
  const g = new VoxGrid();
  for (let x = -42; x <= 41; x++)
    for (let z = 19; z <= 64; z++) {
      let c = shade(0x5c5853, (n3(Math.floor(x / 5), 0, Math.floor(z / 5), 6) - 0.5) * 0.1 + (n3(x, 3, z) - 0.5) * 0.04);
      if (((x % 5) + 5) % 5 === 0 || ((z % 5) + 5) % 5 === 0) c = 0x423e3a;
      g.set(x, -1, z, c);
    }
  return g;
}

/** Blast door with hazard frame, reinforcement bars, rivets and a wheel; a fuse box beside it. */
function buildDoor() {
  const g = new VoxGrid();
  const X0 = -96, X1 = -64, Z = -31; // 0.05 grid: x -4.8..-3.2, front face z -1.55
  for (let x = X0 - 4; x <= X1 + 4; x++)
    for (let y = 0; y <= 56; y++) {
      const frame = x < X0 || x > X1 || y > 52;
      if (!frame) continue;
      g.set(x, y, Z, n3(x, y, 1) < 0.06 ? STEEL_D : hazard(x, y, 10));
      g.set(x, y, Z + 1, n3(x, y, 2) < 0.06 ? STEEL_D : hazard(x, y, 10));
    }
  for (let x = X0; x <= X1; x++)
    for (let y = 0; y <= 52; y++) {
      const bar = y % 13 === 6 || y % 13 === 7;
      let c = shade(0x5d6670, (n3(x, y, 3) - 0.5) * 0.07);
      if (bar) c = STEEL_L;
      if ((x === X0 + 2 || x === X1 - 2) && y % 4 === 1) c = 0xc8ced8;
      if (y < 4) c = shade(c, -0.15);
      g.set(x, y, Z - 1, c);
      if (bar) g.set(x, y, Z, shade(STEEL_L, -0.05));
    }
  // wheel handle (rim, four spokes, hub)
  const cx = -80, cy = 27, zf = Z + 2;
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(t) * 7), y = Math.round(cy + Math.sin(t) * 7);
    g.set(x, y, zf, 0xb83a2a); g.set(x, y, zf + 1, a % 8 < 4 ? 0xd85a3a : 0xb83a2a);
  }
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (let r = 1; r <= 6; r++) g.set(cx + dx * r, cy + dy * r, zf, 0x9a2a20);
  rbox(g, cx - 1, cy - 1, zf, cx + 1, cy + 1, zf + 2, 0, 0x5a1a14);
  // stencil + hinges
  for (const y of [8, 26, 44]) g.box(X0 - 2, y, Z + 1, X0, y + 4, Z + 2, STEEL_D);
  // fuse box with LEDs (right of the door)
  rbox(g, -58, 28, Z, -50, 40, Z + 2, 1, 0x7a8070);
  for (let y = 30; y <= 38; y += 2) g.set(-56, y, Z + 3, y === 34 ? 0xff4a2a : 0x5aff6a, true);
  for (let y = 30; y <= 38; y++) g.set(-52, y, Z + 3, 0x3a3f36);
  capsule(g, [-54, 40, Z + 1], [-54, 58, Z + 1], 0.6, 0.6, 0x2a2a2a);
  return g;
}

/** A floor safe against the back wall with its door swung open (gold inside), as two grids. */
function buildVault() {
  const g = new VoxGrid();
  const X0 = 62, X1 = 94, Y1 = 34, Z0 = -31, Z1 = -14; // 0.05: x 3.1..4.7, y 0..1.7, z -1.55..-0.7
  for (let x = X0; x <= X1; x++)
    for (let y = 0; y <= Y1; y++)
      for (let z = Z0; z <= Z1; z++) {
        const shellV = x === X0 || x === X1 || y === 0 || y === Y1 || z === Z0;
        const front = z === Z1;
        const opening = x > X0 + 3 && x < X1 - 3 && y > 3 && y < Y1 - 3;
        if (front && opening) continue;
        if (!shellV && !front) continue;
        let c = shade(0x3e5a4a, (n3(x, y, z) - 0.5) * 0.06);
        if (front && (x <= X0 + 1 || x >= X1 - 1 || y <= 1 || y >= Y1 - 1)) c = 0x2a3a30;
        if (y === 0) c = 0x24302a;
        g.set(x, y, z, c);
      }
  // inside: stacked gold bars + coin piles + bucks bundles (gold glows a little)
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 4 - row; i++) {
      const bx = X0 + 6 + i * 6 + row * 3, by = 4 + row * 3;
      rbox(g, bx, by, Z1 - 9, bx + 4, by + 2, Z1 - 3, 0, (x, y) => (y === by + 2 ? 0xffe27a : 0xe8b030), { glow: false });
      g.set(bx + 1, by + 2, Z1 - 3, 0xfff3b0, true);
    }
  for (let y = 4; y <= 8; y++) rbox(g, X1 - 10, y, Z1 - 8, X1 - 5, y, Z1 - 4, 0, y % 2 ? 0xffd040 : 0xe0a420);
  rbox(g, X1 - 9, 17, Z1 - 8, X1 - 4, 20, Z1 - 4, 0, (x, y) => (y === 18 ? 0xffffff : 0xff6ab4));
  rbox(g, X0 + 6, 17, Z1 - 8, X0 + 12, 19, Z1 - 4, 0, (x, y) => (y === 18 ? 0xffffff : 0x5fd06a));
  // shelf inside
  for (let x = X0 + 1; x < X1; x++) for (let z = Z0 + 1; z < Z1; z++) g.set(x, 16, z, 0x2a3a30);
  // the door (separate mesh on a hinge at the left front edge)
  const d = new VoxGrid();
  for (let x = 0; x <= X1 - X0 - 2; x++)
    for (let y = 2; y <= Y1 - 2; y++) {
      const edge = x <= 1 || x >= X1 - X0 - 3 || y <= 3 || y >= Y1 - 3;
      d.set(x, y, 0, edge ? 0x31463a : shade(0x46664f, (n3(x, y, 9) - 0.5) * 0.05));
      d.set(x, y, -1, 0x2a3a30);
    }
  // dial + handle bars on the door front
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; d.set(Math.round(16 + Math.cos(t) * 4.5), Math.round(19 + Math.sin(t) * 4.5), 1, a % 5 === 0 ? 0xffffff : 0xc8ccd0); }
  rbox(d, 15, 18, 1, 17, 20, 2, 0, 0x9aa2ae);
  for (const y of [9, 28]) { d.box(23, y, 1, 27, y, 2, STEEL_L); }
  stencil(d, '$$$', 9, 13, 1, 0xd8b04a, 0.2);
  return { g, d, hinge: new THREE.Vector3((X0 + 1) * S2, 0, (Z1 + 1) * S2) };
}

/** Corkboard: wood frame, cork, a pinned island map, photos, notes, red string between pins. */
function buildBoard() {
  const g = new VoxGrid();
  const X0 = -40, X1 = -14, Y0 = 29, Y1 = 47, Z = -31;
  for (let x = X0; x <= X1; x++)
    for (let y = Y0; y <= Y1; y++) {
      const frame = x <= X0 + 1 || x >= X1 - 1 || y <= Y0 + 1 || y >= Y1 - 1;
      g.set(x, y, Z, frame ? (n3(x, y, 1) < 0.3 ? WOOD_D : WOOD) : n3(x, y, 2) < 0.22 ? 0xa8784a : n3(x, y, 3) < 0.15 ? 0xd6a670 : 0xc08c58);
      if (frame) g.set(x, y, Z + 1, shade(WOOD, (n3(x, y, 4) - 0.5) * 0.15));
    }
  const zf = Z + 1;
  // map (water, island, beach, an X and a dotted trail)
  for (let x = -38; x <= -27; x++)
    for (let y = 35; y <= 45; y++) {
      const d = Math.hypot((x + 32.5) / 4.6, (y - 40) / 3.6) + (n3(x, y, 6) - 0.5) * 0.35;
      const c = d < 0.75 ? (n3(x, y, 7) < 0.2 ? 0x2f8a3a : 0x46b04a) : d < 1 ? 0xf0d890 : (x + y) % 3 === 0 ? 0x5ab0e8 : 0x3a8ad0;
      g.set(x, y, zf, c);
    }
  for (const [x, y] of [[-34, 38], [-33, 39], [-32, 39], [-31, 40], [-30, 41]]) g.set(x, y, zf + 1, 0xfff4d8);
  for (const [x, y] of [[-30, 42], [-28, 42], [-29, 41], [-30, 40], [-28, 40]]) g.set(x, y, zf + 1, 0xe02020);
  // photos (polaroids with a tiny panther face and a fedora silhouette)
  const photo = (x0, y0, kind) => {
    for (let x = x0; x <= x0 + 5; x++) for (let y = y0; y <= y0 + 6; y++) g.set(x, y, zf, y === y0 || y === y0 + 1 ? 0xf4f0e6 : x === x0 || x === x0 + 5 || y === y0 + 6 ? 0xf4f0e6 : kind ? 0x2a2a3a : 0x6ab0e0);
    if (kind) { g.box(x0 + 1, y0 + 3, zf + 1, x0 + 4, y0 + 3, zf + 1, 0x4a3a30); g.box(x0 + 2, y0 + 4, zf + 1, x0 + 3, y0 + 4, zf + 1, 0x4a3a30); g.set(x0 + 2, y0 + 2, zf + 1, 0xf5cfae); g.set(x0 + 3, y0 + 2, zf + 1, 0xf5cfae); }
    else { g.box(x0 + 1, y0 + 2, zf + 1, x0 + 4, y0 + 4, zf + 1, 0x29b6f6); g.set(x0 + 2, y0 + 3, zf + 1, 0xff2e88); g.set(x0 + 3, y0 + 3, zf + 1, 0xff2e88); }
  };
  photo(-24, 38, 0);
  photo(-21, 30, 1);
  // sticky notes
  for (const [x0, y0, c] of [[-37, 30, 0xffe45a], [-31, 31, 0xff9ac4]]) {
    for (let x = x0; x <= x0 + 4; x++) for (let y = y0; y <= y0 + 3; y++) g.set(x, y, zf, c);
    g.box(x0 + 1, y0 + 2, zf + 1, x0 + 3, y0 + 2, zf + 1, shade(c, -0.45));
    g.box(x0 + 1, y0 + 1, zf + 1, x0 + 2, y0 + 1, zf + 1, shade(c, -0.45));
  }
  // pins + red string
  const pins = [[-36, 44], [-22, 44], [-19, 36], [-35, 33], [-29, 34], [-26, 41]];
  const order = [0, 5, 1, 2, 4, 3, 0];
  for (let i = 0; i < order.length - 1; i++) {
    const [ax, ay] = pins[order[i]], [bx, by] = pins[order[i + 1]];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k <= n; k++) { const t = k / n; g.set(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t - Math.sin(t * Math.PI) * 0.8), zf + 2, 0xd81e2a); }
  }
  for (const [x, y] of pins) { g.set(x, y, zf + 2, 0xff3a3a); g.set(x, y, zf + 3, 0xff8a8a); }
  // a caged bulb lamp above the board
  capsule(g, [-27, 90, -26], [-27, 58, -26], 0.5, 0.5, 0x1e1e1e);
  return g;
}

/** Steel cart with three CRT monitors (screens are separate textured planes). */
function buildCRTs() {
  const g = new VoxGrid();
  const X0 = 15, X1 = 41, Z0 = -30, Z1 = -18;
  // cart: two shelves on four legs
  for (const y of [2, 17]) for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) g.set(x, y, z, x === X0 || x === X1 || z === Z1 ? STEEL_D : STEEL);
  for (const x of [X0, X1]) for (const z of [Z0, Z1]) for (let y = 0; y <= 17; y++) g.set(x, y, z, STEEL_D);
  const screens = [];
  const crt = (x0, y0, w, hgt, body) => {
    // chunky case with a deep back, recessed screen bezel
    rbox(g, x0, y0, Z0 + 1, x0 + w, y0 + hgt, Z1, 1, (x, y, z) => (z < Z0 + 4 ? shade(body, -0.18) : n3(x, y, z) < 0.08 ? shade(body, -0.06) : body));
    rbox(g, x0 + 2, y0 + 2, Z0 + 3, x0 + w - 2, y0 + hgt - 2, Z0 + 5, 1, shade(body, -0.25), { noRoundZ: true });
    for (let x = x0 + 1; x <= x0 + w - 1; x++) for (let y = y0 + 1; y <= y0 + hgt - 1; y++) {
      const inScreen = x >= x0 + 2 && x <= x0 + w - 2 && y >= y0 + 3 && y <= y0 + hgt - 2;
      if (inScreen) g.del(x, y, Z1);
    }
    g.set(x0 + w - 2, y0 + 1, Z1 + 1, 0x5aff6a, true); // power LED
    g.box(x0 + 2, y0 + 1, Z1 + 1, x0 + 4, y0 + 1, Z1 + 1, shade(body, -0.3));
    screens.push({ x: (x0 + w / 2 + 0.5) * S2, y: (y0 + 2.5 + (hgt - 4) / 2 + 0.5) * S2, z: (Z1 - 0.35) * S2, w: (w - 3) * S2, h: (hgt - 4.5) * S2 });
  };
  crt(X0 + 1, 18, 12, 11, 0xc8bfa8);
  crt(X0 + 14, 18, 11, 10, 0x8a8e94);
  crt(X0 + 5, 3, 14, 12, 0xbab2a0);
  // cables hanging off the back
  capsule(g, [X0 + 6, 18, Z0 + 1], [X0 + 4, 4, Z0 - 1], 0.6, 0.6, 0x1e1e22);
  capsule(g, [X0 + 20, 18, Z0 + 1], [X1 + 2, 0, Z0 + 2], 0.6, 0.6, 0x2a2a2e);
  return { g, screens };
}

/** Counter: riveted steel front with hazard bands and a stencil, worn wood top. */
function buildCounter() {
  const g = new VoxGrid();
  const X0 = -36, X1 = 35, Y1 = 17, Z0 = 4, Z1 = 18;
  for (let x = X0; x <= X1; x++)
    for (let y = 0; y <= Y1; y++) {
      // front plate
      let c = shade(0x6a727e, (n3(Math.floor(x / 12), 0, 0, 2) - 0.5) * 0.08 + (n3(x, y, 1) - 0.5) * 0.05);
      if (((x - X0) % 12) === 0) c = STEEL_D;
      if (y <= 2) c = hazard(x, y, 8);
      if (y === 3) c = 0x2a2d32;
      if (((x - X0) % 12 === 2 || (x - X0) % 12 === 10) && (y === 5 || y === 14)) c = 0xb8c0cc;
      g.set(x, y, Z1, c);
      if (x === X0 || x === X1) for (let z = Z0; z < Z1; z++) g.set(x, y, z, STEEL_D);
    }
  // top: planks, overhanging the front
  for (let x = X0 - 1; x <= X1 + 1; x++)
    for (let z = Z0 - 1; z <= Z1 + 2; z++) {
      let c = (z - Z0) % 5 === 0 ? WOOD_D : shade(WOOD, (n3(x >> 3, 0, (z - Z0) / 5 | 0, 3) - 0.5) * 0.14 + (n3(x, 1, z) - 0.5) * 0.06);
      if (n3(x, 2, z) < 0.03) c = WOOD_L;
      g.set(x, Y1 + 1, z, c);
      if (z === Z1 + 2 || x === X0 - 1 || x === X1 + 1) g.set(x, Y1, z, WOOD_D);
    }
  return g;
}

/** Things on the counter: cash register, service bell, fanned cards, tip jar. */
function buildCounterTop() {
  const g = new VoxGrid();
  const y0 = 19;
  // cash register (right)
  rbox(g, 16, y0, 6, 30, y0 + 5, 15, 1, 0x7a3a2e);
  rbox(g, 16, y0 + 6, 6, 30, y0 + 9, 11, 1, 0x8e4636);
  for (let x = 18; x <= 28; x += 2) for (let z = 12; z <= 15; z += 2) g.set(x, y0 + 6, z, z === 14 ? 0xf4f0e6 : 0xd8d0c0);
  rbox(g, 19, y0 + 10, 7, 27, y0 + 13, 9, 0, 0x2a2420);
  for (let x = 20; x <= 26; x++) g.set(x, y0 + 12, 10, (x % 2 ? 0x6aff7a : 0x2a8a3a), x % 2 === 1);
  g.box(17, y0 + 1, 16, 29, y0 + 2, 16, 0x5a2a20); // drawer
  metalKnob(g, 23, y0 + 1, 17);
  // service bell (left)
  rbox(g, -28, y0, 9, -22, y0, 15, 1, 0x3a2a24);
  blob(g, -25, y0 + 2, 12, 2.6, 2, 2.6, (x, y) => (y > y0 + 3 ? 0xfff0a0 : 0xe8b838), { clip: (x, y) => y < y0 + 1 });
  g.set(-25, y0 + 5, 12, 0xd8a838);
  // a tent card (its NO REFUNDS text is a decal)
  for (let x = -20; x <= -10; x++) for (let y = y0; y <= y0 + 6; y++) { g.set(x, y, 14, x === -20 || x === -10 || y === y0 + 6 ? 0xd8d0bc : 0xf4eee0); g.set(x, y, 13, 0xc8c0ac); }
  for (let x = -19; x <= -11; x++) for (let y = y0; y <= y0 + 4; y++) g.set(x, y, 11 + Math.round((y - y0) * 0.5), 0xc8c0ac);
  // fanned cards (rarity colours)
  const cols = [0x8ab0ff, 0xff9a2e, 0xc063ff, 0x3ff2c8];
  cols.forEach((c, i) => {
    const bx = -7 + i * 3, bz = 12 - Math.abs(i - 1.5);
    for (let x = bx; x <= bx + 3; x++) for (let z = bz; z <= bz + 4; z++) g.set(x, y0, z, x === bx || z === bz || z === bz + 4 ? 0xf4f0e6 : c);
  });
  // tip jar with coins
  for (let y = y0; y <= y0 + 5; y++) for (let x = 7; x <= 11; x++) for (let z = 9; z <= 13; z++) {
    const edge = x === 7 || x === 11 || z === 9 || z === 13;
    if (edge && y < y0 + 5) g.set(x, y, z, 0xb8dce8);
    else if (!edge && y <= y0 + 2) g.set(x, y, z, (x + y + z) % 2 ? 0xffd040 : 0xe0a420);
  }
  stencil(g, '$', 8, y0 + 4, 14, 0x2a6a8a, 0);
  return g;
}
function metalKnob(g, x, y, z) { g.set(x, y, z, 0xd8dce4); }

/** Crates of contraband snacks (front left), one open with bars sticking out, plus a soda case. */
function buildCrates() {
  const g = new VoxGrid();
  const crate = (x0, y0, z0, w, hgt, d) => {
    for (let x = x0; x <= x0 + w; x++)
      for (let y = y0; y <= y0 + hgt; y++)
        for (let z = z0; z <= z0 + d; z++) {
          const ex = x === x0 || x === x0 + w, ey = y === y0 || y === y0 + hgt, ez = z === z0 || z === z0 + d;
          if (!(ex || ey || ez)) continue;
          const frame = (ex && ey) || (ex && ez) || (ey && ez) || (ez && (x - x0 === w >> 1)) || (ex && (z - z0 === d >> 1));
          let c = frame ? WOOD_D : (y - y0) % 4 === 0 ? shade(WOOD, -0.22) : shade(WOOD, (n3(x, Math.floor((y - y0) / 4), z, 8) - 0.5) * 0.18);
          if (frame && (x === x0 || x === x0 + w) && (y === y0 || y === y0 + hgt) && (z === z0 || z === z0 + d)) c = STEEL;
          g.set(x, y, z, c);
        }
  };
  crate(-52, 0, 22, 18, 14, 14);
  crate(-50, 15, 24, 14, 11, 11);
  crate(-32, 0, 26, 14, 10, 12);
  // the open crate on top: bars in bright wrappers poking out
  const wraps = [0x7a3dff, 0xff2e88, 0x29b6f6, 0xffd23f, 0x5fdc4a, 0xff8a2a];
  for (let i = 0; i < 6; i++) {
    const x = -48 + i * 2, z = 27 + (i % 2) * 3, top = 28 + (i % 3);
    g.box(x, 26, z, x + 1, top, z + 1, wraps[i]);
    g.box(x, top - 1, z, x + 1, top - 1, z + 1, 0x5a2a12);
  }
  // soda cans on the soda crate
  for (let i = 0; i < 3; i++) cyl(g, 'y', -29 + i * 4, 31, 11, 15, 1.4, 1.4, (x, y) => (y === 15 ? 0xc8ccd0 : y === 13 ? 0xffffff : [0xff3a3a, 0x29b6f6, 0x5fdc4a][i]));
  // a chemical drum with glowing goo (lab contraband)
  const dx = 44, dz = 31;
  cyl(g, 'y', dx, dz, 0, 18, 6, 6, (x, y) => (y % 6 === 0 ? shade(0x2a5ab0, -0.25) : y > 6 && y < 11 ? HAZ_Y : 0x2a5ab0));
  for (let x = dx - 5; x <= dx + 5; x++) for (let z = dz - 5; z <= dz + 5; z++) if (Math.hypot(x - dx, z - dz) <= 5.3) g.set(x, 19, z, n3(x, 19, z) < 0.3 ? 0xb8ff6a : 0x6aff3a, true);
  // sandbags (front right)
  for (const [x, y, z] of [[58, 0, 26], [72, 0, 27], [86, 0, 25], [65, 6, 26], [79, 6, 26]]) {
    blob(g, x, y + 2.5, z, 7, 3, 4.5, (xx, yy, zz) => (n3(xx, yy, zz) < 0.2 ? 0x9a8a62 : (xx + 100) % 6 === 0 ? 0x7a6c4a : 0xb3a274), { p: 3 });
  }
  return g;
}

/** Camo netting draped across the top front of the view, with leaf patches and hanging strips. */
function buildNetting() {
  const g = new VoxGrid();
  const pal = [0x3e4a26, 0x55602e, 0x6a6a3a, 0x4a3a22, 0x7a7448, 0x2e3a1e];
  // two swags hung from the top corners (the middle stays clear above the counter)
  for (let x = -120; x <= 118; x++) {
    const ax = Math.abs(x + 0.5);
    if (ax < 34) continue;
    const u = Math.min(1, (ax - 34) / 86); // 0 at the inner end, 1 at the corner
    const sag = Math.sin(u * Math.PI) * 9 + (1 - u) * 6;
    const rows = 4 + Math.round(u * 7);
    for (let k = 0; k < rows; k++) {
      const y = Math.round(80 - sag - k + (1 - u) * 4);
      const z = 38 + Math.round(Math.sin(x * 0.21) * 1.5);
      const v = n3(Math.floor(x / 3), Math.floor(y / 2), 0, 3);
      if (v < 0.32 || (k > rows - 3 && v < 0.6)) continue;
      g.set(x, y, z, pal[Math.floor(n3(Math.floor(x / 4), Math.floor(y / 3), 1) * pal.length)]);
    }
    // hanging strips
    if (n3(x, 0, 0, 9) < 0.07) {
      const len = 5 + Math.floor(n3(x, 1, 0) * 9 * u);
      for (let i = 0; i < len; i++) g.set(x, Math.round(80 - sag - rows + (1 - u) * 4 - i), 38, pal[(x + i) % pal.length]);
    }
  }
  // camo drapes hung down both sides in front of the counter: they frame the shot like curtains
  for (const sd of [-1, 1]) {
    for (let y = 16; y <= 70; y++) {
      const inner = 30 + Math.round(Math.sin(y * 0.23 + sd) * 2.5 + (70 - y) * 0.05 + n3(y, sd, 4) * 2);
      for (let a = inner; a <= inner + 22; a++) {
        const x = sd < 0 ? -a : a - 1;
        const v = n3(Math.floor(a / 2), Math.floor(y / 2), sd, 7);
        if (v < 0.3 || (a === inner && v < 0.65)) continue;
        g.set(x, y, 26 + Math.round(Math.sin(y * 0.4 + a * 0.3) * 1.2), pal[Math.floor(n3(Math.floor(a / 3), Math.floor(y / 3), sd + 4) * pal.length)]);
      }
    }
  }
  return g;
}

/** Pipes along the top of the back wall: a rusty main with flanges, a steel line, a red valve wheel, a gauge. */
function buildPipes() {
  const g = new VoxGrid();
  const Z = -29;
  cyl(g, 'x', 60, Z, -80, 80, 1.7, 1.7, (x, y) => ((x % 16 + 16) % 16 < 2 ? 0x5a3424 : y > 60 ? shade(RUST, 0.12) : n3(x, y, 2) < 0.15 ? shade(RUST, -0.2) : RUST));
  cyl(g, 'x', 65, Z - 1, -80, 80, 1.2, 1.2, (x, y) => ((x % 20 + 20) % 20 < 2 ? STEEL_D : y > 65 ? STEEL_L : STEEL));
  for (const x of [-62, -30, 6, 40, 70]) { g.box(x, 57, Z - 3, x + 1, 66, Z - 2, STEEL_D); }
  // valve wheel on the rusty main
  const vx = -22, vy = 60, vz = Z + 4;
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; g.set(Math.round(vx + Math.cos(t) * 4), Math.round(vy + Math.sin(t) * 4), vz, a % 10 < 5 ? 0xd83a2a : 0xb02a1e); }
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (let r = 1; r <= 2; r++) g.set(vx + dx * r, vy + dy * r, vz, 0x8a2018);
  rbox(g, vx, vy, Z + 2, vx, vy, vz, 0, 0x5a1a14);
  // pressure gauge hanging under the steel line
  const gx = 24, gy = 55, gz = Z + 1;
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) {
    const d = Math.hypot(x, y);
    if (d > 3.4) continue;
    g.set(gx + x, gy + y, gz, d > 2.5 ? 0xb8c0cc : 0xf4f0e6);
  }
  for (let i = 0; i <= 2; i++) g.set(gx - i, gy + i, gz + 1, 0xd8201e);
  g.set(gx, gy + 4, gz - 1, STEEL_D); g.set(gx, gy + 5, gz - 1, STEEL_D); g.set(gx, gy + 6, gz - 1, STEEL_D);
  return g;
}

/** Caged hanging lamp (shade, cage, bulb) as its own grid (it sways); pivot at the cord top. */
function buildLamp() {
  const g = new VoxGrid();
  capsule(g, [0, 0, 0], [0, -14, 0], 0.5, 0.5, 0x1e1e1e);
  // industrial enamel shade
  for (let y = -20; y <= -15; y++) {
    const r = 2 + (-15 - y) * 1.15;
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
      const d = Math.hypot(x, z);
      if (d <= r + 0.4 && d >= r - 1.2) g.set(x, y, z, y === -20 ? 0xd8d0b8 : y > -17 ? 0x2c4a3a : 0x3a5e48);
    }
  }
  // bulb in a wire cage (two rings, four ribs)
  blob(g, 0, -22, 0, 2, 2.2, 2, (x, y) => (y >= -21 ? 0xe0a050 : 0xc88030), { glow: true });
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2, x = Math.round(Math.cos(t) * 3.6), z = Math.round(Math.sin(t) * 3.6);
    g.set(x, -21, z, 0x1a1a1a);
    g.set(Math.round(x * 0.6), -25, Math.round(z * 0.6), 0x1a1a1a);
  }
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.set(dx * 3, -22, dz * 3, 0x1a1a1a); g.set(dx * 3, -23, dz * 3, 0x1a1a1a); g.set(dx * 2, -24, dz * 2, 0x1a1a1a); }
  g.set(0, -26, 0, 0x1a1a1a);
  return g;
}

// ---------------------------------------------------------------------------
// What gets baked (in this order). cast: shadow casters keep every face (the shadow pass draws back
// faces); everything else drops the faces the camera can never see. ao: false for flat shell surfaces.

export const VAULT_HINGE = [63 * S2, 0, -13 * S2];
export const SPECS = [
  { key: 'walls', scale: S1, ao: false, fn: buildWalls },
  { key: 'floor', scale: S1, ao: false, fn: buildFloor },
  { key: 'apron', scale: 0.2, ao: false, fn: buildApron },
  { key: 'door', scale: S2, fn: buildDoor },
  { key: 'vault', scale: S2, fn: () => buildVault().g },
  { key: 'vaultDoor', scale: S2, cast: true, fn: () => buildVault().d },
  { key: 'board', scale: S2, fn: buildBoard },
  { key: 'crts', scale: S2, cast: true, fn: () => buildCRTs().g },
  { key: 'counter', scale: S2, cast: true, fn: buildCounter },
  { key: 'top', scale: S2, cast: true, fn: buildCounterTop },
  { key: 'crates', scale: S2, fn: buildCrates },
  { key: 'net', scale: S2, fn: buildNetting },
  { key: 'pipes', scale: S2, fn: buildPipes },
  { key: 'lamp', scale: S2, cast: false, full: true, fn: buildLamp },
];
export const crtScreens = () => buildCRTs().screens;

/** Bake one spec to raw arrays { key, position, normal, color, index, groups }. */
export function bakeSpec(spec) {
  const grid = spec.fn();
  const geo = spec.cast || spec.full ? grid.build({ scale: spec.scale, pivot: 'none', jitter: 0.04 }) : bakeCulled(grid, spec.scale, spec.ao !== false);
  const out = {
    key: spec.key,
    position: geo.attributes.position.array, normal: geo.attributes.normal.array, color: geo.attributes.color.array,
    index: geo.index.array, groups: geo.groups.map((g) => [g.start, g.count, g.materialIndex]),
  };
  geo.dispose();
  return out;
}
/** Raw arrays back into a BufferGeometry. */
export function toGeometry(r) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(r.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(r.color, 3));
  g.setIndex(new THREE.BufferAttribute(r.index, 1));
  for (const [s, n, m] of r.groups) g.addGroup(s, n, m);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
