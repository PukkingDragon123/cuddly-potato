// Beast Town: the little harbour town between the Beast Lab and the Circle, plus the street
// furniture that dresses the whole island (fences, barrels, crates, benches, planters, lamp posts).
// Cottages and shops line the trophy road (each faces the nearest road), the town square has a
// fountain with a golden trophy and market stalls, the harbour a pier with moored boats.
// Everything is still: plain meshes / instanced props that the home scene's static batcher merges.
//
//   const town = addTown({ T, root, exclude, R, center: [x, z], radius });
//   town.spots: { square, stalls: [...], benches: [...], pier: { base, end, dir } }   (for the island's NPCs + fun)
import * as THREE from 'three';
import { VoxGrid } from '../../core/voxel.js';
import { text, textW, instanced } from '../props/common.js';
import { shade, hash3 } from '../../core/util.js';
import { MAT } from './terrain.js';
import * as P from './props.js';

const WALLS = [0xfff4e0, 0xf6efe4, 0xfde7b0, 0xd8ecf8, 0xffe0e8, 0xe4f4d8];
const ROOFS = [0xe8343c, 0x2b8cf2, 0x2fa86a, 0xff8a1f, 0x8a5cd8, 0x2ac0c8];

// ---------------------------------------------------------------------------
// Grids (front = +z)

function windowAt(g, face, u0, y0, w = 4, hgt = 5, deep = 0) {
  // white frame, light-blue glass with a sky glint, cross mullion
  for (let u = -1; u <= w; u++) for (let v = -1; v <= hgt; v++) {
    const frame = u === -1 || u === w || v === -1 || v === hgt;
    const mull = u === (w >> 1) || v === (hgt >> 1);
    const c = frame ? 0xffffff : mull ? 0xf0f4fa : (u + v < 2 ? 0xd8f4ff : 0x7cc8ec);
    face(u0 + u, y0 + v, c, deep);
  }
}

/** Cottage (voxel 0.125): gabled roof with shingle rows, chimney, door, windows with flower boxes. */
export function cottageGrid(v = 0) {
  const g = new VoxGrid();
  const wall = WALLS[v % WALLS.length], roof = ROOFS[(v * 3 + 1) % ROOFS.length], roofD = shade(roof, -0.25), roofL = shade(roof, 0.2);
  const X0 = -13, X1 = 12, Z0 = -10, Z1 = 9, H = 18;
  const beam = 0x8a5a30;
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) for (let y = 0; y <= H; y++) {
    const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
    if (!edge) continue;
    let c = y <= 1 ? 0x9aa2b4 : wall;
    if (y === 10 && v % 2 === 0) c = beam; // timber band
    if ((x === X0 || x === X1) && (z === Z0 || z === Z1) && y > 1) c = v % 2 === 0 ? beam : shade(wall, -0.08);
    g.set(x, y, z, c);
  }
  // gable ends (triangles on the x faces) + the roof (ridge along x)
  const RZ0 = Z0 - 2, RZ1 = Z1 + 2, mid = (RZ0 + RZ1) / 2;
  for (let k = 0; k <= 12; k++) {
    const y = H + 1 + k;
    const za = Math.ceil(RZ0 + k), zb = Math.floor(RZ1 - k);
    if (za > zb) break;
    for (let x = X0 - 1; x <= X1 + 1; x++) {
      for (const z of [za, zb]) g.set(x, y, z, k % 2 === 0 ? roof : roofD);
      if (za + 1 <= zb - 1 && (x === X0 - 1 || x === X1 + 1)) for (let z = za + 1; z <= zb - 1; z++) g.set(x, y, z, roofD);
    }
    for (const x of [X0, X1]) for (let z = za + 1; z <= zb - 1; z++) g.set(x, y, z, wall);
    if (za === zb || za + 1 >= zb) for (let x = X0 - 1; x <= X1 + 1; x++) g.set(x, y + 1, Math.round(mid), roofL);
  }
  // fill under the roof slopes so no gaps show
  for (let k = 0; k <= 12; k++) {
    const y = H + 1 + k;
    const za = Math.ceil(RZ0 + k) + 1, zb = Math.floor(RZ1 - k) - 1;
    for (let x = X0 - 1; x <= X1 + 1; x++) for (const z of [za, zb]) if (za <= zb && !g.has(x, y, z)) g.set(x, y, z, roofD);
  }
  // chimney
  g.box(6, H + 3, -4, 8, H + 14, -2, (x, y) => ((y & 1) ? 0xc0603a : 0xa84a2c));
  g.box(5, H + 15, -5, 9, H + 15, -1, 0x5a6070);
  // front: door + two windows with flower boxes
  const front = (u, y, c, d = 0) => g.set(u, y, Z1 + 1 + d, c);
  g.box(-2, 2, Z1 + 1, 1, 10, Z1 + 1, 0x8a5a30);
  g.box(-3, 11, Z1 + 1, 2, 11, Z1 + 1, 0xffffff);
  g.box(-2, 2, Z1 + 1, -2, 10, Z1 + 1, 0x6e4224);
  g.set(1, 6, Z1 + 2, 0xffc21a);
  g.box(-3, 1, Z1 + 1, 2, 1, Z1 + 2, 0x9aa2b4); // step
  for (const u0 of [-10, 5]) {
    windowAt(g, front, u0, 5, 5, 5);
    for (let u = -1; u <= 5; u++) { g.set(u0 + u, 3, Z1 + 2, 0x8a5a30); g.set(u0 + u, 4, Z1 + 2, [0xff4fa3, 0xffd23f, 0xffffff, 0xff6a3a][(u + 9 + v) % 4]); }
  }
  // back + sides
  const back = (u, y, c) => g.set(u, y, Z0 - 1, c);
  for (const u0 of [-9, 5]) windowAt(g, back, u0, 6, 4, 5);
  windowAt(g, (u, y, c) => g.set(X0 - 1, y, u, c), -2, 6, 4, 5);
  windowAt(g, (u, y, c) => g.set(X1 + 1, y, u, c), -2, 6, 4, 5);
  return g;
}

/** Shop (voxel 0.125): flat roof with a parapet, display windows, a striped awning and a name board. */
export function shopGrid(name, wall, trim, awnA, awnB, ink = 0xffffff) {
  const g = new VoxGrid();
  const tw = textW(name);
  const hw = Math.max(16, Math.ceil(tw / 2) + 4);
  const X0 = -hw, X1 = hw - 1, Z0 = -10, Z1 = 10, H = 20;
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) for (let y = 0; y <= H; y++) {
    const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
    if (!edge && y < H) continue;
    let c = y <= 1 ? 0x9aa2b4 : wall;
    if (y === H) c = edge ? trim : 0xb8bcc8;
    if ((x === X0 || x === X1) && (z === Z0 || z === Z1)) c = trim;
    g.set(x, y, z, c);
  }
  // parapet + name board
  for (let x = X0; x <= X1; x++) for (const z of [Z0, Z1]) g.set(x, H + 1, z, trim);
  for (let z = Z0; z <= Z1; z++) for (const x of [X0, X1]) g.set(x, H + 1, z, trim);
  const bw = tw + 6;
  const bx0 = -Math.ceil(bw / 2);
  g.box(bx0, H - 1, Z1 + 1, bx0 + bw, H + 8, Z1 + 1, shade(trim, -0.3));
  g.box(bx0 + 1, H, Z1 + 2, bx0 + bw - 1, H + 7, Z1 + 2, trim);
  text(g, name, bx0 + 3, H + 1, Z1 + 3, '+z', shade(trim, -0.45));
  text(g, name, bx0 + 3, H + 2, Z1 + 3, '+z', ink);
  // display windows + door
  const front = (u, y, c) => g.set(u, y, Z1 + 1, c);
  windowAt(g, front, X0 + 3, 4, hw - 7, 8);
  windowAt(g, front, 4, 4, hw - 7, 8);
  g.box(-2, 2, Z1 + 1, 1, 12, Z1 + 1, 0x6e4224);
  g.box(-1, 3, Z1 + 1, 0, 11, Z1 + 1, 0x8fd8ff);
  g.box(-3, 1, Z1 + 1, 2, 1, Z1 + 2, 0x9aa2b4);
  // striped awning sloping out over the windows
  for (let x = X0; x <= X1; x++) for (let k = 0; k < 5; k++) g.set(x, 15 - Math.floor(k / 2), Z1 + 1 + k, ((x - X0) >> 1) & 1 ? awnA : awnB);
  for (let x = X0; x <= X1; x += 2) g.set(x, 12, Z1 + 5, ((x - X0) >> 1) & 1 ? awnA : awnB);
  // back windows
  for (let u0 = X0 + 4; u0 < X1 - 5; u0 += 10) windowAt(g, (u, y, c) => g.set(u, y, Z0 - 1, c), u0, 7, 4, 5);
  return g;
}

/** Town fountain (voxel 0.125): octagonal stone basin, water, a column with a golden trophy. */
export function fountainGrid() {
  const g = new VoxGrid();
  const R = 15;
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
    const o = Math.max(Math.abs(x), Math.abs(z), (Math.abs(x) + Math.abs(z)) / 1.38);
    if (o > R + 0.5) continue;
    if (o > R - 2) { g.box(x, 0, z, x, 3, z, ((x + z) & 1) ? 0xd8d0c0 : 0xc8bea8); g.set(x, 4, z, 0xeee6d4); }
    else {
      g.set(x, 0, z, 0x8a94a8);
      g.set(x, 2, z, hash3(x, 7, z) < 0.12 ? 0xe6faff : ((x + z) & 3) === 0 ? 0x7cd8f4 : 0x4cb8e8);
    }
  }
  // column + bowl + trophy
  g.box(-2, 1, -2, 1, 12, 1, (x, y) => ((y & 3) === 0 ? 0xc8bea8 : 0xe2dccc));
  for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) if (Math.hypot(x + 0.5, z + 0.5) < 5.2) { g.set(x, 13, z, 0xd8d0c0); if (Math.hypot(x + 0.5, z + 0.5) < 4) g.set(x, 14, z, 0x7cd8f4); }
  const gold = 0xffc21a, goldD = 0xe0a010, goldL = 0xffe680;
  g.box(-1, 15, -1, 0, 16, 0, goldD);
  g.box(-2, 17, -2, 1, 17, 1, gold);
  for (let y = 18; y <= 23; y++) { const r = y < 21 ? 2 : 3; g.box(-r, y, -r + 1, r - 1, y, r - 2, y === 23 ? goldL : gold); }
  for (const x of [-4, 3]) g.box(x, 20, -1, x, 22, 0, goldD);
  return g;
}

/** Market stall (voxel 0.1): four posts, striped canopy, a counter heaped with produce. */
export function stallGrid(c1, c2, goods = 0) {
  const g = new VoxGrid();
  const W = 11, D = 7;
  for (const x of [-W, W - 1]) for (const z of [-D, D - 1]) g.box(x, 0, z, x, 17, z, 0x8a5a30);
  // counter
  g.box(-W, 6, D - 2, W - 1, 8, D - 1, 0xa8703c);
  g.box(-W, 0, D - 1, W - 1, 7, D - 1, (x, y) => ((y & 1) ? 0xb87d46 : 0x96602f));
  // canopy sloping toward the front
  for (let x = -W - 1; x <= W; x++) for (let z = -D - 1; z <= D + 1; z++) {
    const y = 18 + Math.round((D - z) * 0.3);
    g.set(x, y, z, ((x + 40) >> 1) & 1 ? c1 : c2);
  }
  for (let x = -W - 1; x <= W; x += 2) g.set(x, 17, D + 1, ((x + 40) >> 1) & 1 ? c1 : c2);
  // goods in little crates on the counter
  const kinds = [[0xe8343c, 0xff6a6a], [0xff8a1f, 0xffb050], [0xffd23f, 0xfff08a], [0x3fbf4f, 0x7ae070], [0x8a5cd8, 0xb890ff]];
  for (let k = 0; k < 4; k++) {
    const x0 = -W + 1 + k * 5;
    g.box(x0, 9, D - 3, x0 + 3, 9, D - 1, 0x6e4224);
    const [a, b] = kinds[(k + goods) % kinds.length];
    for (let x = x0; x <= x0 + 3; x++) for (let z = D - 3; z <= D - 1; z++) g.set(x, 10, z, (x + z) & 1 ? a : b);
    g.set(x0 + 1, 11, D - 2, a).set(x0 + 2, 11, D - 2, b);
  }
  return g;
}
export function benchGrid() {
  const g = new VoxGrid();
  for (const x of [-6, 5]) g.box(x, 0, -1, x, 3, 1, 0x3d4352);
  g.box(-7, 4, -2, 6, 4, 2, (x) => ((x & 1) ? 0xb87d46 : 0xa0673a));
  for (const x of [-6, 5]) g.box(x, 5, -2, x, 8, -2, 0x3d4352);
  g.box(-7, 7, -2, 6, 8, -2, (x, y) => ((y & 1) ? 0xb87d46 : 0xa0673a));
  return g;
}
export function barrelGrid() {
  const g = new VoxGrid();
  for (let y = 0; y < 9; y++) {
    const r = y === 0 || y === 8 ? 2.6 : 3.2;
    for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
      if (Math.hypot(x + 0.5, z + 0.5) > r) continue;
      const band = y === 1 || y === 7;
      g.set(x, y, z, band ? 0x5a6070 : y === 8 ? 0x8a5a30 : ((x + z) & 1) ? 0xa8703c : 0x96602f);
    }
  }
  return g;
}
export function crateGrid() {
  const g = new VoxGrid();
  for (let x = -3; x <= 2; x++) for (let y = 0; y < 6; y++) for (let z = -3; z <= 2; z++) {
    const ex = x === -3 || x === 2, ey = y === 0 || y === 5, ez = z === -3 || z === 2;
    if (!ex && !ey && !ez) continue;
    const frame = (ex && ey) || (ex && ez) || (ey && ez);
    g.set(x, y, z, frame ? 0x8a5a30 : ((y + x + z) & 1) ? 0xd8a060 : 0xc89050);
  }
  return g;
}
export function planterGrid() {
  const g = new VoxGrid();
  g.box(-5, 0, -2, 4, 2, 1, (x, y) => (y === 2 ? 0x8a5a30 : 0xa0673a));
  const fl = [0xff4fa3, 0xffd23f, 0xffffff, 0xff6a3a, 0xb05cff];
  for (let x = -4; x <= 3; x++) for (let z = -1; z <= 0; z++) {
    g.set(x, 3, z, 0x3fbf4f);
    if ((x + z) & 1) g.set(x, 4, z, fl[(x + 9) % fl.length]);
  }
  return g;
}
export function fenceGrid() {
  const g = new VoxGrid();
  for (let x = -10; x <= 9; x++) {
    if ((x & 1) === 0) { g.box(x, 0, 0, x, 6, 0, 0xf4f0e6); g.set(x, 7, 0, 0xe6e0d2); }
    g.set(x, 2, 0, 0xe6e0d2).set(x, 5, 0, 0xe6e0d2);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Placement

const SHOPS = [
  ['FEASTABLES', 0xfff0dc, 0x3a7ae8, 0x3a7ae8, 0xffffff],
  ['BURGERS', 0xfff4e0, 0xe8343c, 0xe8343c, 0xffd23f],
  ['LAB SUPPLY', 0xeef4fa, 0x29b6f6, 0x29b6f6, 0xffffff],
  ['ARCADE', 0xf4ecff, 0x8a5cd8, 0xff4fa3, 0x8a5cd8],
];

/** Nearest road direction from (x, z): unit vector toward the road (via the road distance field). */
function toRoad(T, x, z) {
  const d = (px, pz) => { const id = T.colAt(px, pz); return id < 0 ? 99 : T.roadD[id]; };
  const gx = d(x + 0.75, z) - d(x - 0.75, z), gz = d(x, z + 0.75) - d(x, z - 0.75);
  const l = Math.hypot(gx, gz) || 1;
  return [-gx / l, -gz / l];
}

export function addTown({ T, root, exclude, R, center, radius, zones = [] }) {
  const [cx, cz] = center;
  const free = (x, z, r) => !exclude.some(([ex, ez, er]) => Math.hypot(x - ex, z - ez) < er + r);
  const flat = (x, z, r) => T.maxHeight(x, z, r) - T.minHeight(x, z, r) <= 0.5;
  const dry = (x, z, r) => {
    let ok = true;
    T.forDisc(x, z, r, (id) => { if (T.hv[id] < 1 || T.mat[id] === MAT.CHANNEL || T.riverD[id] < T.riverW[id] + 1.5) ok = false; });
    return ok;
  };
  const offRoad = (x, z, r) => {
    let ok = true;
    T.forDisc(x, z, r, (id) => { if (T.roadD[id] < T.RW + 0.4) ok = false; });
    return ok;
  };
  const nearZone = (x, z, r) => zones.some((Z) => Math.hypot(x - Z.x, z - Z.z) < 8.6 + r);
  const spots = { stalls: [], benches: [], square: null, pier: null, houses: [] };

  // ---- the town square: fountain at the flattest open spot near the centre, stalls + benches around it
  let sq = null;
  for (let r = 0; r <= radius * 0.6 && !sq; r += 1) for (let a = 0; a < (r ? 18 : 1); a++) {
    const x = cx + Math.cos((a / 18) * 6.283) * r, z = cz + Math.sin((a / 18) * 6.283) * r;
    const id = T.colAt(x, z);
    if (id < 0 || T.roadD[id] < T.RW + 7.5) continue;
    if (!flat(x, z, 4.5) || !dry(x, z, 5) || !free(x, z, 5) || nearZone(x, z, 5)) continue;
    sq = [x, T.heightAt(x, z), z];
    break;
  }
  const fountains = [], stalls = [[], [], []], benches = [], lamps = [], planters = [], barrels = [], crates = [];
  if (sq) {
    spots.square = new THREE.Vector3(...sq);
    fountains.push([sq[0], sq[1], sq[2], 0, 1]);
    exclude.push([sq[0], sq[2], 3.2]);
    const ring = [[0, 4.6], [Math.PI / 2, 4.8], [Math.PI, 4.6], [Math.PI * 1.5, 4.8]];
    ring.forEach(([a, r], k) => {
      const x = sq[0] + Math.cos(a + 0.4) * (r + 1.4), z = sq[2] + Math.sin(a + 0.4) * (r + 1.4);
      if (!offRoad(x, z, 1.6) || !dry(x, z, 1.4)) return;
      const ry = Math.atan2(sq[0] - x, sq[2] - z);
      stalls[k % 3].push([x, T.heightAt(x, z), z, ry, 1]);
      spots.stalls.push({ pos: new THREE.Vector3(x, T.heightAt(x, z), z), ry });
      exclude.push([x, z, 1.8]);
    });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4 + 0.4, r = 3.3;
      const x = sq[0] + Math.cos(a) * r, z = sq[2] + Math.sin(a) * r;
      const ry = Math.atan2(x - sq[0], z - sq[2]);
      benches.push([x, sq[1], z, ry, 1]);
      spots.benches.push({ pos: new THREE.Vector3(x, sq[1], z), ry });
      lamps.push([sq[0] + Math.cos(a + 0.6) * 3.6, sq[1], sq[2] + Math.sin(a + 0.6) * 3.6, 0, 1]);
    }
  }

  // ---- houses + shops along the roads (each faces its road)
  const cand = [];
  for (let x = cx - radius; x <= cx + radius; x += 1) for (let z = cz - radius; z <= cz + radius; z += 1) {
    if (Math.hypot(x - cx, z - cz) > radius) continue;
    const id = T.colAt(x, z);
    if (id < 0) continue;
    const rd = T.roadD[id];
    if (rd < T.RW + 3.4 || rd > T.RW + 4.6) continue;
    cand.push([x + (R() - 0.5) * 0.4, z + (R() - 0.5) * 0.4, Math.hypot(x - cx, z - cz)]);
  }
  cand.sort((a, b) => a[2] - b[2] + (R() - 0.5) * 6);
  const placed = [];
  let shopN = 0;
  const kinds = {};
  for (const [x, z] of cand) {
    const shop = shopN < SHOPS.length && placed.length >= 1 && placed.length % 2 === 1;
    const rad = shop ? 3.2 : 2.6;
    if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + rad + 1.1)) continue;
    if (!offRoad(x, z, rad - 0.3) || !flat(x, z, rad - 0.6) || !dry(x, z, rad) || !free(x, z, rad) || nearZone(x, z, rad)) continue;
    const [dx, dz] = toRoad(T, x, z);
    const ry = Math.atan2(dx, dz);
    const y = T.minHeight(x, z, rad - 0.6);
    placed.push([x, z, rad]);
    exclude.push([x, z, rad + 0.4]);
    const key = shop ? 'shop' + shopN++ : 'cot' + (placed.length * 7 % 6);
    (kinds[key] ??= []).push([x, y, z, ry, 1]);
    spots.houses.push({ pos: new THREE.Vector3(x, y, z), ry, shop });
    // a planter or a barrel by the door, a fence run beside cottages
    const fx = Math.sin(ry), fz = Math.cos(ry), sx = Math.cos(ry), sz = -Math.sin(ry);
    if (!shop) planters.push([x + fx * 1.9 + sx * 1.5, y, z + fz * 1.9 + sz * 1.5, ry, 1]);
    else { barrels.push([x + fx * 1.8 - sx * (rad + 0.2), y, z + fz * 1.8 - sz * (rad + 0.2), R() * 6, 1]); crates.push([x - fx * 0.5 + sx * (rad + 0.4), y, z - fz * 0.5 + sz * (rad + 0.4), R() * 6, 1]); }
    if (placed.length > 26) break;
  }
  const build = (name, geo, list, o = {}) => {
    if (!list.length) return;
    const im = instanced(geo, list, { shadow: true, receive: true, ...o });
    im.name = name;
    root.add(im);
  };
  for (const [key, list] of Object.entries(kinds)) {
    if (key.startsWith('shop')) {
      const S = SHOPS[+key.slice(4)];
      build('town:' + S[0], P.geo('shop_' + S[0], () => shopGrid(...S), 0.125, 'bottom'), list);
    } else {
      const v = +key.slice(3);
      build('town:cottage' + v, P.geo('cottage' + v, () => cottageGrid(v), 0.125, 'bottom'), list);
    }
  }
  build('town:fountain', P.geo('fountain', fountainGrid, 0.125, 'bottom'), fountains);
  stalls.forEach((list, k) => build('town:stall' + k, P.geo('stall' + k, () => stallGrid([0xe8343c, 0x2b8cf2, 0x3fbf4f][k], 0xffffff, k), 0.1, 'bottom'), list));
  build('town:benches', P.geo('bench', benchGrid, 0.1, 'bottom'), benches);
  build('town:lamps', P.geo('lamp', P.lampGrid, 0.085, 'bottom'), lamps);
  build('town:planters', P.geo('planter', planterGrid, 0.1, 'bottom'), planters, { shadow: false });
  build('town:barrels', P.geo('barrel', barrelGrid, 0.1, 'bottom'), barrels);
  build('town:crates', P.geo('crate', crateGrid, 0.1, 'bottom'), crates);
  return { spots };
}

/**
 * Street furniture along the whole trophy road: picket fences on the outside of bends in the
 * green country, barrel + crate clusters by the arena gates and in the harbour, benches with a
 * planter at intervals. Instanced (one draw per kind, then static-batched by cell).
 */
export function addRoadsideProps({ T, root, exclude, R, zones }) {
  const fences = [], barrels = [], crates = [], benches = [], planters = [];
  const road = T.road;
  const green = new Set([MAT.GRASS, MAT.LUSH, MAT.MEADOW, MAT.PASTEL, MAT.FOREST, MAT.SAND]);
  const ok = (x, z, r) => {
    const id = T.colAt(x, z);
    if (id < 0 || T.hv[id] < 1 || T.roadD[id] < T.RW + 0.7 || T.riverD[id] < T.riverW[id] + 1.2) return false;
    if (zones.some((Z) => Math.hypot(x - Z.x, z - Z.z) < 13)) return false;
    if (exclude.some(([ex, ez, er]) => Math.hypot(x - ex, z - ez) < er + r)) return false;
    return T.maxHeight(x, z, r) - T.minHeight(x, z, r) <= 0.5;
  };
  for (let k = 40; k < road.length - 40; k += 26) {
    const p = road[k], q = road[k + 4];
    const tx = q.x - p.x, tz = q.z - p.z, l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    const id = T.colAt(p.x, p.z);
    if (id < 0) continue;
    const roll = hash3(k, 3, 9);
    const side = roll < 0.5 ? 1 : -1;
    const x = p.x + nx * (T.RW + 0.9) * side, z = p.z + nz * (T.RW + 0.9) * side;
    const m = T.matAt(x, z);
    if (roll < 0.55 && green.has(m)) {
      // a fence run parallel to the road
      if (!ok(x, z, 1.0)) continue;
      fences.push([x, T.heightAt(x, z), z, Math.atan2(tx, tz) + Math.PI / 2, 1]);
    } else if (roll < 0.75) {
      const bx = p.x + nx * (T.RW + 1.6) * side, bz = p.z + nz * (T.RW + 1.6) * side;
      if (!ok(bx, bz, 1.2)) continue;
      const y = T.heightAt(bx, bz);
      barrels.push([bx, y, bz, R() * 6, 1]);
      crates.push([bx + tx / l * 0.75, y, bz + tz / l * 0.75, R() * 6, 1]);
      if (R() < 0.5) crates.push([bx + tx / l * 0.75, y + 0.6, bz + tz / l * 0.75, R() * 6, 0.85]);
      exclude.push([bx, bz, 1.4]);
    } else if (green.has(m)) {
      const bx = p.x + nx * (T.RW + 1.2) * side, bz = p.z + nz * (T.RW + 1.2) * side;
      if (!ok(bx, bz, 1.0)) continue;
      const y = T.heightAt(bx, bz);
      const ry = Math.atan2(-nx * side, -nz * side);
      benches.push([bx, y, bz, ry, 1]);
      planters.push([bx + tx / l * 1.2, y, bz + tz / l * 1.2, ry, 1]);
      exclude.push([bx, bz, 1.2]);
    }
  }
  const build = (name, geo, list, o = {}) => {
    if (!list.length) return;
    const im = instanced(geo, list, { shadow: true, receive: true, ...o });
    im.name = name;
    root.add(im);
  };
  build('roadside:fences', P.geo('fence', fenceGrid, 0.1, 'bottom'), fences, { shadow: false });
  build('roadside:barrels', P.geo('barrel', barrelGrid, 0.1, 'bottom'), barrels);
  build('roadside:crates', P.geo('crate', crateGrid, 0.1, 'bottom'), crates);
  build('roadside:benches', P.geo('bench', benchGrid, 0.1, 'bottom'), benches);
  build('roadside:planters', P.geo('planter', planterGrid, 0.1, 'bottom'), planters, { shadow: false });
}
