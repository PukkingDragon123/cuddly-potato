// FOOD SEASON pass world: the layout of the season path (one stop per tier) and
// the static voxel scenery of the BEAST MART challenge. The path starts in the
// parking lot, goes through the automatic doors and winds through Produce,
// Cereal, Snacks and Frozen, weaves between the checkout lanes and ends in the
// golden vault.
//
// The camera always looks down the store (-z), so every stop is further along
// -z than the one before. Stops sit on the path's turning points, where it runs
// straight along z, so each tier's free stand (left) and premium stand (right)
// line up across the path.
//
// Everything still lives under `world.still` (static-batched by the stage);
// moving bits (doors, balloons, the vault door, the facade cutaway) are in
// `world.dyn` with their own update functions.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { aoGeometry } from '../../models/props/voxmesh.js';
import { PAL, shade, mixHex, hash3, text, textW, glassMat } from '../../models/props/common.js';
import { shelfFrame, productsRow, freezerGrid, produceGrid, checkoutGrid } from '../../models/props/grocery.js';
import { cartGrid } from '../../models/props/labParts.js';
import { leafyTreeGrid, bushGrid } from '../../models/arenas/kit.js';
import { clamp } from '../../core/util.js';

// ---------------------------------------------------------------------------
// Layout

export const SP = 3.3; // distance between two stops inside a zone
export const SIDE = 1.9; // stand offset from the path centre
export const STAGE_Y = 0.6; // height of the prize stage under the last stop
// zone starts as fractions of the tier count (50 tiers: 8 / 8 / 8 / 8 / 8 / 7 / 3)
// base: the zone's path line (x), wig: a gentle wiggle in the open areas
const ZONE_DEFS = [
  { id: 'lot', name: 'Parking Lot', f: 0, gap: 0, base: 0, wig: 0.55 },
  { id: 'produce', name: 'Produce', f: 0.16, gap: 11, base: -0.8, wig: 0.55 },
  { id: 'cereal', name: 'Cereal', f: 0.32, gap: 6.4, base: 1.35 },
  { id: 'snacks', name: 'Snacks', f: 0.48, gap: 6.4, base: -1.35 },
  { id: 'frozen', name: 'Frozen', f: 0.64, gap: 6.4, base: 1.35 },
  { id: 'checkout', name: 'Checkout', f: 0.8, gap: 6.4, base: -0.7, wig: 0.6 },
  { id: 'vault', name: 'The Vault', f: 0.94, gap: 9.5, base: 0 },
];
const WIG = [0, 1, 0, -1];

/** Tier positions + the path curve for n tiers. */
export function makeLayout(n) {
  const zones = ZONE_DEFS.map((d) => ({ ...d, from: Math.round(d.f * n) }));
  zones.forEach((z, i) => { z.to = (zones[i + 1]?.from ?? n) - 1; });
  const tz = new Array(n);
  let z = -4;
  for (let k = 0; k < zones.length; k++) {
    const Z = zones[k];
    if (k > 0) {
      const prev = tz[Z.from - 1] ?? z;
      Z.gapZ = prev - Z.gap / 2;
      z = prev - Z.gap;
    }
    for (let i = Z.from; i <= Z.to; i++) {
      tz[i] = z;
      // the last stop of the season sits deeper in the vault, on its stage
      z -= i === n - 2 ? SP + 1.2 : SP;
    }
    Z.z0 = tz[Z.from] ?? z;
    Z.z1 = tz[Z.to] ?? z;
  }
  // path keys (z -> x): every stop is a turning point of the path (dx/dz = 0); zones bend into each other in the gaps
  const keys = [[14, 0], [1, 0]];
  zones.forEach((Z, k) => {
    for (let i = Z.from; i <= Z.to; i++) {
      const j = i - Z.from;
      keys.push([tz[i], Z.base + (Z.wig ?? 0) * WIG[j % 4]]);
    }
    if (Z.id === 'lot') keys.push([zones[1].gapZ + 2.2, 0], [zones[1].gapZ - 2.2, 0]); // straight through the doors
  });
  for (const Z of zones) Z.aisle = Z.base;
  const zEnd = tz[n - 1] - 9;
  keys.push([tz[n - 1] - 2, 0], [zEnd, 0]);
  keys.sort((a, b) => b[0] - a[0]);
  // smootherstep between keys (zero slope at every key)
  const pathX = (zz) => {
    if (zz >= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [z1, x1] = keys[i];
      if (zz >= z1) {
        const [z0, x0] = keys[i - 1];
        const t = (z0 - zz) / (z0 - z1);
        return x0 + (x1 - x0) * t * t * t * (t * (t * 6 - 15) + 10);
      }
    }
    return keys[keys.length - 1][1];
  };
  const slope = (zz) => (pathX(zz - 0.05) - pathX(zz + 0.05)) / 0.1; // dx per unit travelled (-z)
  const zoneOf = (i) => zones.find((Z) => i >= Z.from && i <= Z.to) ?? zones[zones.length - 1];
  const zoneAtZ = (zz) => {
    for (let k = zones.length - 1; k >= 0; k--) {
      const Z = zones[k];
      const start = k === 0 ? 99 : (zones[k - 1].z1 + Z.z0) / 2;
      if (zz <= start) return Z;
    }
    return zones[0];
  };
  // the final stop stands on the prize stage
  const stageY = (i) => (i === n - 1 ? STAGE_Y : 0);
  return { n, zones, tz, pathX, slope, zoneOf, zoneAtZ, stageY, zStart: 9, zEnd, doorZ: zones[1].gapZ, vaultZ: zones[6].gapZ };
}

// ---------------------------------------------------------------------------
// Helpers

const G = (id, fn, opts = {}) => {
  const g = aoGeometry('pz:' + id, fn, { scale: 0.1, pivot: [0, 0, 0], ...opts });
  g.name = id;
  return g;
};
function put(parent, geo, x, y, z, ry = 0, s = 1, o = {}) {
  const m = makeMesh(geo, o.mats ?? Mats.pair);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  if (s !== 1) m.scale.setScalar(s);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = !!o.recv;
  parent.add(m);
  return m;
}
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

// pixel textures (nearest filtered, one texel = one 0.1 voxel)
function pixTex(w, h, draw, rep = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 4;
  return t;
}
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
function speckle(ctx, w, h, base, cols, k = 0.18, seed = 1) {
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = hash3(x, y, seed);
    if (r < k) { ctx.fillStyle = hex(cols[Math.floor(hash3(y, x, seed + 3) * cols.length)]); ctx.fillRect(x, y, 1, 1); }
  }
}
function floorPlane(tex, x0, x1, z0, z1, y = 0) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z0 - z1);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  // texture repeats once per 3.2 units, anchored to world space so planes line up
  for (let i = 0; i < uv.count; i++) {
    const px = x0 + uv.getX(i) * (x1 - x0), pz = z1 + uv.getY(i) * (z0 - z1);
    uv.setXY(i, px / 3.2, -pz / 3.2);
  }
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}

// ---------------------------------------------------------------------------
// Voxel props

const C = {
  ...PAL,
  tileW: 0xd2d8e4, tileG: 0xb4bdcf, concrete: 0xd4d0c6, concreteD: 0xb8b4aa, curb: 0xe8d84a,
  vault: 0x4a5266, vaultD: 0x2e3442, vaultL: 0x7a8498,
};

function carGrid(col) {
  const g = new VoxGrid();
  const dark = shade(col, -0.32), light = shade(col, 0.3), glass = 0x8fd8ff, glassD = 0x4a8ab8;
  // lower body + skirts
  g.box(-20, 3, -8, 19, 7, 7, (x, y) => (y === 7 ? light : y === 3 ? dark : col));
  g.box(-21, 3, -7, -21, 5, 6, C.metal).box(20, 3, -7, 20, 5, 6, C.metal);
  // cabin with windows (pillars in the body colour)
  g.box(-11, 8, -7, 8, 13, 6, (x, y, z) => {
    if (y === 13) return light;
    const side = z === -7 || z === 6;
    if (side && (x === -11 || x === -2 || x === 8)) return col;
    if (!side && (z === -7 || z === 6)) return col;
    return y >= 9 ? (y === 12 ? glassD : glass) : col;
  });
  // sloped windshields
  g.box(9, 8, -6, 11, 11, 5, (x, y) => (x - 9 <= 11 - y ? glass : null));
  g.box(-14, 8, -6, -12, 11, 5, (x, y) => (-12 - x <= 11 - y ? glassD : null));
  // lights + plate
  g.box(20, 5, -7, 20, 6, -5, 0xfff2a0, true).box(20, 5, 4, 20, 6, 6, 0xfff2a0, true);
  g.box(-21, 5, -7, -21, 6, -5, 0xff3a3a, true).box(-21, 5, 4, -21, 6, 6, 0xff3a3a, true);
  g.box(-21, 3, -2, -21, 4, 1, 0xffffff);
  // wheels
  for (const x of [-15, 10]) for (const z of [-9, 7]) {
    g.box(x, 0, z, x + 5, 4, z + 1, PAL.ink);
    g.box(x + 2, 1, z + (z < 0 ? -1 : 2), x + 3, 3, z + (z < 0 ? -1 : 2), C.metal);
  }
  return g;
}

function lampGrid() {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 1, 1, 1, C.metalD);
  g.box(0, 2, 0, 0, 44, 0, C.metalD);
  g.box(0, 44, 0, 7, 45, 0, C.metalD);
  g.box(4, 42, -1, 8, 43, 1, PAL.ink);
  g.box(4, 41, -1, 8, 41, 1, 0xfff4c0, true);
  return g;
}

function curbGrid(len) {
  const g = new VoxGrid();
  for (let x = 0; x < len; x++) g.box(x, 0, 0, x, 1, 2, (x >> 2) & 1 ? C.curb : PAL.ink);
  return g;
}

function plantGrid(seed) {
  const g = new VoxGrid();
  g.box(-5, 0, -5, 4, 4, 4, (x, y, z) => (y === 4 ? 0x6a4a2a : (x + z + y) & 1 ? 0xc87a4a : 0xb06a3c));
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
    const hgt = 5 + Math.floor(hash3(x, seed, z) * 4);
    for (let y = 5; y < hgt; y++) g.set(x, y, z, hash3(x, y, z + seed) < 0.3 ? 0x3f9a3a : 0x5fbf4a);
  }
  for (let i = 0; i < 5; i++) g.set(-3 + Math.floor(hash3(i, seed, 1) * 7), 9, -3 + Math.floor(hash3(seed, i, 2) * 7), [PAL.pink, PAL.yellow, 0xffffff][i % 3]);
  return g;
}

/** Zone line painted across the path: a coloured band with the zone name and checker edges. */
function zoneLineGrid(label, col) {
  const g = new VoxGrid();
  const s = 2;
  const tw = textW(label, s);
  const half = Math.max(30, Math.ceil(tw / 2) + 5);
  for (let x = -half; x < half; x++) for (let z = -8; z < 8; z++) {
    const edge = z === -8 || z === 7;
    const c = edge ? (((x >> 1) & 1) ? 0xffffff : PAL.ink) : (Math.abs(x) >= half - 2 ? shade(col, -0.25) : col);
    g.set(x, 0, z, c);
  }
  text(g, label, 0, 1, 5, '+y', 0xffffff, { scale: s, center: true });
  return g;
}

function facadeGrid() {
  // 0.2 scale: x -90..89 (36 units), door gap |x| < 13
  const g = new VoxGrid();
  const H = 30;
  const stripes = [PAL.pink, PAL.pink, PAL.yellow, PAL.yellow, PAL.blue, PAL.blue];
  for (let x = -90; x <= 89; x++) {
    const door = x >= -13 && x <= 12;
    for (let y = 0; y <= H; y++) {
      if (door && y <= 16) continue;
      let c = (x + 90) % 12 === 0 ? PAL.white2 : PAL.white;
      if (y <= 1) c = (x & 1) ? PAL.red : PAL.redD;
      else if (y >= 20 && y <= 22) c = stripes[Math.floor((x + 90) / 2) % stripes.length];
      else if (y >= 28) c = PAL.pink;
      g.set(x, y, 0, c);
      if (y >= 28 || y <= 1) g.set(x, y, 1, shade(c, -0.12));
    }
  }
  // shop windows full of products (two big panes each side)
  for (const [a, b] of [[-84, -52], [-46, -19], [18, 45], [51, 83]]) {
    for (let x = a; x <= b; x++) for (let y = 4; y <= 15; y++) {
      const shelf = (y - 4) % 4 === 0;
      const c = shelf ? 0xd8e2ec : hash3(x >> 1, y >> 1, 9) < 0.18 ? 0xdff6ff : mixHex([PAL.red, PAL.yellow, PAL.blue, PAL.green, PAL.pink, PAL.orange][Math.floor(hash3(x >> 1, y >> 2, 3) * 6)], 0xffffff, 0.25);
      g.set(x, y, 0, c, !shelf);
    }
    for (let x = a - 1; x <= b + 1; x++) { g.set(x, 3, 1, PAL.white2); g.set(x, 16, 1, PAL.white2); }
    for (let y = 3; y <= 16; y++) { g.set(a - 1, y, 1, PAL.white2); g.set(b + 1, y, 1, PAL.white2); }
    // striped awning over each window
    for (let x = a - 2; x <= b + 2; x++) {
      const c = Math.floor((x - a) / 3) % 2 ? PAL.pink : 0xffffff;
      g.set(x, 18, 1, c).set(x, 17, 2, c).set(x, 17, 3, c);
    }
  }
  // door frame
  for (let y = 0; y <= 17; y++) { g.set(-14, y, 1, PAL.red).set(13, y, 1, PAL.red); }
  for (let x = -14; x <= 13; x++) g.set(x, 17, 1, PAL.red);
  // BEAST MART sign
  const tw = textW('BEAST MART', 2);
  g.box(-Math.ceil(tw / 2) - 4, 23, 1, Math.ceil(tw / 2) + 3, 37, 1, 0xffffff);
  g.box(-Math.ceil(tw / 2) - 5, 22, 1, Math.ceil(tw / 2) + 4, 22, 2, PAL.pink);
  text(g, 'BEAST MART', 0, 26, 2, '+z', PAL.pink, { scale: 2, center: true, glow: true });
  for (let x = -Math.ceil(tw / 2) - 3; x <= Math.ceil(tw / 2) + 2; x += 3) g.set(x, 38, 1, PAL.yellow, true);
  return g;
}

/** One side of a grid (x < 0 or x >= 0). */
function halfGrid(g, side) {
  const o = new VoxGrid();
  g.forEach((x, y, z, c, gl) => { if ((x < 0) === (side < 0)) o.set(x, y, z, c, gl); });
  return o;
}

function doorGrid() {
  // one sliding door panel (0.2 scale): metal frame, glass is a separate translucent pane
  const g = new VoxGrid();
  for (let y = 0; y <= 15; y++) for (let x = 0; x <= 12; x++) {
    if (x === 0 || x === 12 || y === 0 || y === 15 || y === 7) g.set(x, y, 0, x === 0 || x === 12 ? PAL.metalD : PAL.metal);
  }
  g.box(5, 7, 1, 7, 7, 1, PAL.green, true); // the little "open" light
  return g;
}

function balloonGrid(col) {
  const g = new VoxGrid();
  g.ellipsoid(0, 0, 0, 3.2, 3.6, 3.2, (x, y) => (x + y > 3 ? shade(col, 0.45) : y < -2 ? shade(col, -0.2) : col));
  g.set(0, -4, 0, shade(col, -0.3));
  g.set(-1, 2, 2, 0xffffff);
  return g;
}

function pylonGrid() {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 1, 50, 1, C.metalD);
  g.box(-17, 51, -2, 16, 70, 1, 0xffffff);
  g.box(-17, 51, -2, 16, 52, 1, PAL.pink).box(-17, 69, -2, 16, 70, 1, PAL.pink);
  text(g, 'FOOD', 0, 61, 2, '+z', PAL.pink, { scale: 1, center: true, glow: true });
  text(g, 'SEASON', 0, 54, 2, '+z', PAL.blueD, { scale: 1, center: true });
  g.box(-17, 71, -1, 16, 71, 0, PAL.yellow, true);
  return g;
}

/** Start gate: balloon-free arch with a checkered banner. */
function startGateGrid() {
  const g = new VoxGrid();
  for (const x of [-26, 25]) {
    g.box(x - 1, 0, -1, x + 1, 34, 1, (xx, y) => ((y >> 2) & 1 ? PAL.pink : 0xffffff));
    g.box(x - 2, 0, -2, x + 2, 1, 2, PAL.metalD);
  }
  g.box(-27, 35, -1, 26, 44, 0, (x, y) => (((x >> 1) + (y >> 1)) & 1 ? PAL.ink : 0xffffff));
  g.box(-20, 36, 1, 19, 43, 1, PAL.yellow);
  text(g, 'START', 0, 37, 2, '+z', PAL.pinkD, { center: true, scale: 1 });
  return g;
}

function shelfRowGrid(kind, seed, len = 40) {
  const g = new VoxGrid();
  const tops = { cereal: PAL.orange, snacks: PAL.yellow, chocolate: PAL.pink, drinks: PAL.cyan, mixed: PAL.blue };
  const x0 = -Math.floor(len / 2);
  const levels = shelfFrame(g, x0, len, 0, { top: tops[kind] ?? PAL.blue });
  for (const y of levels) productsRow(g, x0 + 1, x0 + len - 3, y + 1, -1, kind, seed + y);
  return g;
}

/** Far shelves (seen over the near ones): the same frame, products as chunky blocks. */
function shelfFarGrid(kind) {
  const g = new VoxGrid();
  const tops = { cereal: PAL.orange, snacks: PAL.yellow, drinks: PAL.cyan, mixed: PAL.blue };
  const levels = shelfFrame(g, -20, 40, 0, { top: tops[kind] ?? PAL.blue });
  const cols = [PAL.red, PAL.yellow, PAL.blue, PAL.green, PAL.pink, PAL.orange, 0xffffff];
  for (const y of levels) for (let x = -19; x < 17; x += 4) {
    const c = cols[Math.floor(hash3(x, y, kind.length) * cols.length)];
    g.box(x, y + 1, -3, x + 2, y + 3, -1, c);
  }
  return g;
}

/** Giant cereal box tower (endcap display). */
function cerealTowerGrid() {
  const g = new VoxGrid();
  const cols = [PAL.orange, PAL.red, PAL.yellow, PAL.blue, PAL.green, PAL.purple];
  let k = 0;
  for (let lvl = 0; lvl < 4; lvl++) {
    const n = 4 - lvl;
    for (let i = 0; i < n; i++) {
      const c = cols[(k++) % cols.length];
      const x0 = -n * 4 + i * 8 + 1, y0 = lvl * 11;
      g.box(x0, y0, -2, x0 + 6, y0 + 10, 2, c);
      g.box(x0 + 1, y0 + 7, 3, x0 + 5, y0 + 9, 3, 0xffffff);
      g.box(x0 + 2, y0 + 2, 3, x0 + 4, y0 + 5, 3, shade(c, 0.4));
      g.set(x0 + 3, y0 + 3, 4, PAL.ink);
      g.box(x0, y0 + 10, -2, x0 + 6, y0 + 10, 2, shade(c, -0.25));
    }
  }
  return g;
}

/** Feastables chocolate bar pallet tower. */
function chocoTowerGrid() {
  const g = new VoxGrid();
  g.box(-12, 0, -8, 11, 2, 7, (x, y, z) => ((x + 12) % 4 === 0 || y === 0 ? PAL.woodD : PAL.wood));
  const wraps = [0xff4fa3, 0x1d9bf0, PAL.gold, 0x8a4ad0, 0xff8a2a];
  for (let lvl = 0; lvl < 9; lvl++) {
    const inset = Math.floor(lvl / 3);
    for (let r = -1 + 0; r < 2; r++) {
      const c = wraps[(lvl + r + 5) % wraps.length];
      const z0 = -7 + inset + r * 5, x0 = -11 + inset, x1 = 10 - inset;
      const y = 3 + lvl * 2;
      g.box(x0, y, z0, x1, y + 1, z0 + 4, c);
      g.box(x0 + 2, y + 1, z0 + 1, x1 - 2, y + 1, z0 + 3, shade(c, 0.35));
      g.box(x0, y, z0 + 4, x1, y, z0 + 4, PAL.choco);
    }
  }
  g.box(-4, 21, -2, 3, 26, -1, 0xffffff);
  text(g, 'YUM', 0, 22, 0, '+z', 0xff4fa3, { center: true });
  return g;
}

function melonBinGrid() {
  const g = new VoxGrid();
  g.box(-9, 0, -7, 8, 6, 6, (x, y, z) => (y === 6 || x === -9 || x === 8 || z === -7 || z === 6 ? ((x + y + z) & 1 ? PAL.woodL : PAL.wood) : null));
  for (const [x, z] of [[-5, -3], [1, -3], [5, 2], [-3, 2], [2, 0]]) g.ellipsoid(x, 7, z, 3, 2.6, 3, (xx, y, zz) => ((xx + zz) % 2 ? PAL.greenD : 0x7cd64a));
  return g;
}

function bananaGrid() {
  const g = new VoxGrid();
  g.box(-8, 0, -6, 7, 3, 5, PAL.woodD);
  for (let lvl = 0; lvl < 4; lvl++) {
    for (let x = -7 + lvl; x <= 6 - lvl; x += 2) for (let z = -5 + lvl; z <= 4 - lvl; z += 3) {
      g.box(x, 4 + lvl * 2, z, x + 1, 4 + lvl * 2, z + 2, PAL.yellow);
      g.set(x, 5 + lvl * 2, z + 1, shade(PAL.yellow, 0.3));
      g.set(x + 1, 4 + lvl * 2, z + 2, 0x6a4a1a);
    }
  }
  return g;
}

function crateGrid(fruit) {
  const g = new VoxGrid();
  g.box(-5, 0, -4, 4, 5, 3, (x, y, z) => (y === 5 ? null : (x === -5 || x === 4 || z === -4 || z === 3) ? ((y & 1) ? PAL.woodL : PAL.wood) : null));
  for (let x = -4; x <= 3; x++) for (let z = -3; z <= 2; z++) g.set(x, 5 + ((x + z) & 1), z, hash3(x, 9, z) < 0.25 ? shade(fruit, -0.25) : fruit);
  return g;
}

function iceConeSignGrid() {
  const g = new VoxGrid();
  for (let y = 0; y < 14; y++) { const r = Math.floor(y / 3); g.box(-r, y, -1, r, y, 1, ((y + 0) >> 1) & 1 ? 0xd8a060 : 0xc08040); }
  g.ellipsoid(0, 17, 0, 5, 4, 3, (x, y) => (y > 18 ? 0xff9ad0 : 0xffd0e8), true);
  g.ellipsoid(0, 22, 0, 4, 3.5, 2.6, (x, y) => (y > 23 ? 0x9fe8ff : 0xd8f6ff), true);
  g.set(0, 26, 0, PAL.red, true);
  return g;
}

function conesGrid() {
  const g = new VoxGrid();
  for (const [cx, cz] of [[-3, 0], [3, 1]]) {
    g.box(cx - 2, 0, cz - 2, cx + 2, 0, cz + 2, 0x2a2a34);
    for (let y = 1; y <= 7; y++) {
      const r = y < 3 ? 1 : 0;
      g.box(cx - r, y, cz - r, cx + r, y, cz + r, y === 3 || y === 5 ? 0xffffff : PAL.orange);
    }
  }
  return g;
}
function wetFloorGrid() {
  // yellow A-frame sign with a slipping pixel figure
  const g = new VoxGrid();
  for (let y = 0; y <= 11; y++) {
    const z = Math.round((11 - y) * 0.25);
    for (let x = -3; x <= 3; x++) { g.set(x, y, z, PAL.yellow); g.set(x, y, -z - 1, PAL.yellow); }
  }
  for (const [x, y] of [[0, 9], [0, 8], [-1, 7], [0, 7], [1, 6], [0, 6], [-1, 5], [1, 5], [-2, 4], [2, 3], [-1, 3]]) g.set(x, y, Math.round((11 - y) * 0.25) + 1, PAL.ink);
  return g;
}
function boxStackGrid(seed) {
  const g = new VoxGrid();
  const cols = [0xc89a5a, 0xb8884a, 0xd8aa6a];
  const boxes = [[-4, 0, -3, 3, 4, 3], [-3, 5, -2, 2, 8, 2], [0, 0, 4, 4, 3, 7]];
  boxes.forEach(([x0, y0, z0, x1, y1, z1], k) => {
    const c = cols[(k + seed) % 3];
    g.box(x0, y0, z0, x1, y1, z1, c);
    g.box(x0, y1, Math.floor((z0 + z1) / 2), x1, y1, Math.floor((z0 + z1) / 2), 0x8a6a3a);
    g.box(x0 + 1, y0 + 1, z1 + 1, x0 + 2, y0 + 2, z1 + 1, [PAL.pink, PAL.blue, PAL.green][(k + seed) % 3]);
  });
  return g;
}
function bagPileGrid() {
  const g = new VoxGrid();
  const cols = [PAL.pink, PAL.blue, PAL.yellow];
  for (const [x, z, k] of [[-3, -1, 0], [2, 0, 1], [-1, 3, 2]]) {
    const c = cols[k];
    g.box(x - 2, 0, z - 1, x + 2, 6, z + 1, c);
    g.box(x - 1, 7, z, x + 1, 7, z, shade(c, -0.25));
    g.box(x - 1, 2, z + 2, x, 3, z + 2, 0xffffff);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Vault

function vaultWallGrid() {
  // 0.2 scale: wall across the store with a big doorway (|x| <= 14, y <= 22)
  const g = new VoxGrid();
  for (let x = -90; x <= 89; x++) for (let y = 0; y <= 32; y++) {
    const dx = Math.abs(x + 0.5), dy = y - 11;
    const hole = dx <= 13 && (y <= 11 || dx * dx + dy * dy * 1.0 <= 13.5 * 13.5);
    if (hole) continue;
    const rim = dx <= 16 && (y <= 13 || dx * dx + dy * dy <= 16.5 * 16.5);
    const plate = ((x + 90) % 10 === 0 || y % 8 === 0);
    g.set(x, y, 0, rim ? (((Math.atan2(dy, x + 0.5) * 6) | 0) & 1 ? PAL.gold : PAL.goldD) : plate ? C.vaultD : C.vault);
    if (rim) g.set(x, y, 1, PAL.goldL);
    if (!rim && plate && (x + y) % 5 === 0) g.set(x, y, 1, C.vaultL);
  }
  text(g, 'THE VAULT', 0, 26, 2, '+z', PAL.goldL, { center: true, scale: 1, glow: true });
  return g;
}

/** The open vault door: a thick round steel door with bolts, spokes and a wheel. */
function vaultDoorGrid() {
  const g = new VoxGrid();
  const R = 13;
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) {
    const d = Math.hypot(x + 0.5, y + 0.5);
    if (d > R + 0.3) continue;
    const ang = Math.atan2(y + 0.5, x + 0.5);
    const rim = d > R - 2;
    for (let z = 0; z < 4; z++) {
      let c = C.vaultL;
      if (rim) c = (((ang / Math.PI) * 12 + 12) | 0) & 1 ? PAL.metal : PAL.metalL;
      else if (d < 4) c = PAL.gold;
      else if (z === 3 && Math.abs(Math.sin(ang * 3)) < 0.18) c = PAL.goldD;
      g.set(x, y, z, c);
    }
    // bolts around the rim
    if (rim && d > R - 1 && (((ang / Math.PI) * 10 + 10) % 1) < 0.18) g.set(x, y, 4, PAL.gold);
  }
  // locking bars on the edge
  for (const y of [-8, 0, 8]) g.box(R, y - 1, 1, R + 4, y + 1, 2, PAL.metalL);
  // spoked wheel in the middle
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    for (let r = 2; r <= 8; r++) g.set(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 5, PAL.goldL);
  }
  g.box(-1, -1, 5, 0, 0, 6, PAL.goldDD);
  return g;
}

function goldPileGrid(seed, w = 9, hgt = 6) {
  const g = new VoxGrid();
  for (let x = -w; x <= w; x++) for (let z = -w; z <= w; z++) {
    const r = Math.hypot(x, z) / w;
    if (r > 1) continue;
    const top = Math.round((1 - r * r) * hgt + hash3(x, seed, z) * 1.6);
    for (let y = 0; y <= top; y++) g.set(x, y, z, y === top ? (hash3(x, y, z + seed) < 0.3 ? PAL.goldL : PAL.gold) : PAL.goldD);
    if (hash3(z, seed, x) < 0.05) g.set(x, top + 1, z, [0xff4fa3, 0x29b6f6, 0x5fdc4a][Math.floor(hash3(x, z, seed) * 3)], true);
  }
  return g;
}

function goldBarsGrid() {
  const g = new VoxGrid();
  for (let lvl = 0; lvl < 4; lvl++) for (let i = 0; i < 4 - lvl; i++) {
    const x0 = -8 + lvl * 2 + i * 4, y = lvl * 2;
    g.box(x0, y, -3, x0 + 3, y + 1, 3, (x, yy) => (yy === y + 1 ? PAL.goldL : PAL.gold));
    g.box(x0 + 1, y + 1, -2, x0 + 2, y + 1, 2, PAL.goldL);
  }
  return g;
}

function cashBagGrid() {
  const g = new VoxGrid();
  g.ellipsoid(0, 4, 0, 4.5, 4.5, 4, (x, y) => (y < 2 ? 0xa88a5a : 0xc8a870));
  g.box(-1, 8, -1, 0, 10, 0, 0xa88a5a);
  g.box(-2, 9, -2, 1, 9, 1, PAL.goldD);
  text(g, '$', 0, 2, 4, '+z', PAL.cashD, { center: true });
  return g;
}

/** A giant golden shopping cart full of gold (0.22 scale cart). */
function goldCartGrid() {
  const g = cartGrid({ full: false, wire: PAL.gold, wireD: PAL.goldD, accent: PAL.goldL });
  for (const x of [-4, 4]) for (const z of [-3, 3]) g.box(x, 0, z, x + 1, 1, z, PAL.goldDD);
  for (let x = -3; x <= 4; x++) for (let z = -2; z <= 2; z++) {
    const top = 8 + Math.round((1 - Math.abs(x - 0.5) / 5) * 3 + hash3(x, 4, z) * 1.5);
    for (let y = 4; y <= top; y++) g.set(x, y, z, y === top ? (hash3(x, y, z) < 0.3 ? PAL.goldL : PAL.gold) : PAL.goldD);
  }
  g.set(-1, 13, 0, 0xff4fa3, true).set(2, 12, 1, 0x29b6f6, true);
  return g;
}

function spotlightGrid() {
  const g = new VoxGrid();
  g.box(-2, 0, -2, 1, 1, 1, PAL.ink);
  g.box(-1, 2, -1, 0, 6, 0, C.metalD);
  g.box(-3, 7, -3, 2, 10, 2, PAL.ink);
  g.box(-2, 10, -2, 1, 10, 1, 0xfff4c0, true);
  return g;
}

function prizeStageGrid() {
  // the season's final stage: a two-step gold platform with marquee bulbs, the last stop on top
  const g = new VoxGrid();
  for (let s = 0; s < 2; s++) {
    const rx = 34 - s * 4, rz = 24 - s * 4, y0 = s * 3;
    g.box(-rx, y0, -rz, rx - 1, y0 + 2, rz - 1, (x, y, z) => {
      const edge = Math.abs(x + 0.5) > rx - 1.5 || Math.abs(z + 0.5) > rz - 1.5;
      return edge ? (y === y0 + 1 ? PAL.goldDD : PAL.goldD) : s === 1 ? (((x >> 2) + (z >> 2)) & 1 ? PAL.gold : PAL.goldL) : PAL.gold;
    });
    for (let i = -rx + 2; i < rx - 1; i += 3) g.set(i, y0 + 1, rz, 0xfff2a0, true);
    for (let i = -rz + 2; i < rz - 1; i += 3) { g.set(-rx - 1, y0 + 1, i, 0xfff2a0, true); g.set(rx, y0 + 1, i, 0xfff2a0, true); }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Build

/**
 * Build the world for a layout. Returns { root, still, dyn: [{update(dt, t, focusZ)}], textures, materials, dispose }.
 * Built over several frames (await).
 */
export async function buildPassWorld(L) {
  const root = new THREE.Group();
  root.name = 'passWorld';
  const still = new THREE.Group(); // static-batched
  const dynRoot = new THREE.Group();
  root.add(still, dynRoot);
  const dyn = [];
  const textures = [], materials = [];
  const own = (m) => { materials.push(m); return m; };
  const R = (k) => hash3(k, 17, 3);
  const n = L.n, tz = L.tz, X = L.pathX;
  const Zs = Object.fromEntries(L.zones.map((z) => [z.id, z]));

  // ------------------------------------------------------------- floors
  const asphalt = pixTex(32, 32, (c, w, h) => speckle(c, w, h, 0x3c404c, [0x464a56, 0x34373f, 0x4e525e], 0.22, 4));
  const tiles = pixTex(32, 32, (c) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const chk = ((x >> 4) + (y >> 4)) & 1;
      const grout = (x & 15) === 15 || (y & 15) === 15;
      const base = chk ? C.tileG : C.tileW;
      c.fillStyle = hex(grout ? shade(base, -0.12) : hash3(x, y, 2) < 0.08 ? shade(base, -0.04) : base);
      c.fillRect(x, y, 1, 1);
    }
  });
  const vaultTex = pixTex(32, 32, (c) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const inlay = (x & 15) === 0 || (y & 15) === 0;
      const dia = Math.abs((x & 15) - 8) + Math.abs((y & 15) - 8) === 5;
      const chk = ((x >> 4) + (y >> 4)) & 1;
      c.fillStyle = hex(inlay ? 0xd8a838 : dia ? 0xb8862a : hash3(x, y, 5) < 0.1 ? (chk ? 0x584628 : 0x463a26) : chk ? 0x4e3e22 : 0x3e3220);
      c.fillRect(x, y, 1, 1);
    }
  });
  const walk = pixTex(32, 32, (c) => {
    speckle(c, 32, 32, C.concrete, [C.concreteD, 0xdcd8ce], 0.12, 7);
    c.fillStyle = hex(C.concreteD);
    c.fillRect(0, 0, 32, 1); c.fillRect(0, 16, 32, 1); c.fillRect(0, 0, 1, 32); c.fillRect(16, 0, 1, 32);
  });
  textures.push(asphalt, tiles, vaultTex, walk);
  const doorZ = L.doorZ, vaultZ = L.vaultZ;
  const floors = [
    floorPlane(asphalt, -30, 30, L.zStart + 16, doorZ + 4.2),
    floorPlane(walk, -30, 30, doorZ + 4.2, doorZ),
    floorPlane(tiles, -30, 30, doorZ, vaultZ),
    floorPlane(vaultTex, -30, 30, vaultZ, L.zEnd - 20),
  ];
  for (const f of floors) { materials.push(f.material); dynRoot.add(f); }

  // ------------------------------------------------------------- parking lot
  const lot = Zs.lot;
  const lineGeo = G('lotLines', () => {
    const g = new VoxGrid();
    // parking bays either side of the path: white lines across, yellow edge lines along
    for (let z = 20; z > Math.round((doorZ + 6) * 10); z -= 26) {
      for (const [a, b] of [[-150, -55], [55, 150]]) for (let x = a; x <= b; x++) g.set(x, 0, z, 0xf2f2f2);
    }
    for (const x of [-56, 55]) for (let z = 20; z > Math.round((doorZ + 6) * 10); z--) if ((z >> 2) & 1) g.set(x, 0, z, PAL.yellow);
    return g;
  }, { ao: false });
  put(still, lineGeo, 0, -0.07, 0, 0, 1, { cast: false, recv: true });
  // parked cars in the bays (left side faces right, right side faces left)
  const carCols = [0xe8343c, 0x29b6f6, 0xffd23f, 0xf4f6fa, 0x5fdc4a, 0xb05cff];
  let ci = 0;
  for (let z = 0.7; z > doorZ + 7; z -= 2.6) {
    for (const side of [-1, 1]) {
      if (R(ci + side * 7) < 0.25) { ci++; continue; }
      const col = carCols[ci++ % carCols.length];
      put(still, G('car' + col, () => carGrid(col)), side * (10.2 + R(ci) * 0.6), 0, z, side < 0 ? 0 : Math.PI, 1, { cast: false });
    }
  }
  // lamp posts, planters, bushes and trees on the lot edges
  // lamp posts between the stops, either side of the stands
  for (let i = lot.from; i < lot.to; i++) {
    const z = (tz[i] + tz[i + 1]) / 2, side = i % 2 ? 1 : -1;
    if (i % 2 === 0 && i !== lot.from + 2) put(still, G('lamp', lampGrid), X(z) - 3.45, 0, z, 0);
    if (i % 2 === 1 && i !== lot.from + 3) put(still, G('lamp', lampGrid), X(z) + 3.45, 0, z, Math.PI);
  }
  for (let z = L.zStart + 10; z > doorZ + 3; z -= 4.6) {
    for (const side of [-1, 1]) {
      const x = side * (16 + R(z * 3 + side) * 2.5);
      if (R(z + side) < 0.3) put(still, G('tree' + (z & 1), () => leafyTreeGrid({ seed: 1 + (z & 1), h: 12, r: 8 })), x, 0, z, R(z) * 6, 1, { cast: false });
      else put(still, G('bush', () => bushGrid({ w: 7, h: 4, d: 5 })), x, 0, z, R(z) * 6, 1, { cast: false });
    }
  }
  // start gate + pylon sign + cart corrals + loose carts
  put(still, G('startGate', startGateGrid), 0, 0, 1.2);
  put(still, G('pylon', pylonGrid), -7.2, 0, lot.z0 + 2.5, 0.25);
  const cartGeo = G('cart', () => cartGrid({}));
  const cartFull = G('cartFull', () => cartGrid({ full: true }));
  const corral = G('corral', () => {
    const g = new VoxGrid();
    for (const z of [-6, 6]) { g.box(-22, 0, z, 22, 0, z, PAL.metal); g.box(-22, 7, z, 22, 7, z, PAL.red); for (let x = -22; x <= 22; x += 5) g.box(x, 0, z, x, 7, z, PAL.metalD); }
    g.box(-22, 7, -6, -22, 7, 6, PAL.red);
    g.box(-22, 8, -1, -22, 12, 0, PAL.metal);
    g.box(-22, 13, -9, -22, 19, 8, PAL.blue);
    text(g, 'CARTS', -23, 14, 0, '-x', 0xffffff, { center: true });
    text(g, 'CARTS', -21, 14, 0, '+x', 0xffffff, { center: true });
    return g;
  });
  // cart corrals run along the stands (rotated with the path), stray carts here and there
  for (const [i, side] of [[lot.from + 2, 1], [lot.from + 5, -1]]) {
    const z = tz[i];
    put(still, corral, X(z) + side * 4.35, 0, z, Math.PI / 2);
    for (let k = 0; k < 4; k++) put(still, cartGeo, X(z) + side * 4.35, 0, z - 1.3 + k * 0.85, -Math.PI / 2);
  }
  put(still, cartFull, X(tz[lot.from + 4]) + 3.6, 0, tz[lot.from + 4] + 0.2, 2.2);
  put(still, cartGeo, X(tz[lot.from + 6]) - 3.6, 0, tz[lot.from + 6] + 0.4, -2.4);
  put(still, G('cones', conesGrid), X(tz[lot.from + 3]) + 3.4, 0, tz[lot.from + 3] - 1.4, 0.4);
  put(still, G('cones', conesGrid), X(tz[lot.from + 6]) + 3.3, 0, tz[lot.from + 6] - 1.6, -0.3);
  // sidewalk curb + planters in front of the store
  put(still, G('curb', () => curbGrid(600)), -30, 0, doorZ + 4.2, 0, 1, { cast: false });
  for (const x of [-11, -6.4, 6.4, 11]) put(still, G('plant' + (x > 0 ? 1 : 2), () => plantGrid(x > 0 ? 1 : 2)), x, 0, doorZ + 1.6, 0);
  await yieldFrame();

  // ------------------------------------------------------------- store front (dissolves as the camera walks in)
  // the store front parts in the middle like giant automatic doors as the camera walks in
  const front = new THREE.Group();
  front.position.set(0, 0, doorZ);
  const halves = [];
  const glass = own(glassMat(0xbfe9ff, 0.32).clone());
  const doorGeo = G('door', doorGrid, { scale: 0.2 });
  const balloons = [];
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    put(half, G(side < 0 ? 'facadeL' : 'facadeR', () => halfGrid(facadeGrid(), side), { scale: 0.2 }), 0, 0, 0, 0, 1, { cast: false });
    // the glass sliding door of this half
    const d = new THREE.Group();
    put(d, doorGeo, side < 0 ? -2.6 : 0, 0, 0.45, 0, 1, { cast: false });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.9), glass);
    pane.position.set(side < 0 ? -1.3 : 1.3, 1.6, 0.55);
    pane.renderOrder = 2;
    d.add(pane);
    half.add(d);
    // this half of the balloon arch over the doors
    for (let i = 0; i < 21; i++) {
      const a = Math.PI - (i / 20) * Math.PI;
      const x = Math.cos(a) * 3.3;
      if ((x < 0) !== (side < 0) || Math.abs(x) < 0.01 && side > 0) continue;
      const col = [PAL.pink, PAL.blue, PAL.yellow][i % 3];
      const b = put(half, G('balloon' + col, () => balloonGrid(col), { scale: 0.07, pivot: 'center' }), 0, 0, 0, 0, 1, { cast: false });
      b.userData = { x, y: 0.35 + Math.sin(a) * 3.65, o: i };
      balloons.push(b);
    }
    front.add(half);
    halves.push({ half, door: d, side });
  }
  dynRoot.add(front);
  const open = { door: 0, part: 0 };
  dyn.push({
    update(dt, t, fz) {
      // the glass doors slide first, then the two halves of the front part to the sides
      open.door += ((fz < doorZ + 11 ? 1 : 0) - open.door) * (1 - Math.exp(-dt * 5));
      const want = clamp((doorZ + 8.5 - fz) / 6, 0, 1);
      open.part += (want * want * (3 - 2 * want) - open.part) * (1 - Math.exp(-dt * 6));
      for (const hf of halves) {
        hf.door.position.x = hf.side * open.door * 2.3;
        hf.half.position.x = hf.side * open.part * 10.5;
      }
      front.visible = fz > doorZ - 14;
      for (const b of balloons) { const u = b.userData; b.position.set(u.x + Math.sin(t * 2 + u.o) * 0.03, u.y + Math.sin(t * 1.7 + u.o) * 0.05, 0.75); }
    },
  });
  await yieldFrame();

  // ------------------------------------------------------------- store interior: signs
  const signCols = { produce: PAL.green, cereal: PAL.orange, snacks: PAL.pink, frozen: PAL.blue, checkout: PAL.purple };
  // zone lines: a painted banner across the path where each part of the store begins
  for (const Z of L.zones) {
    const col = signCols[Z.id];
    if (!col) continue;
    const label = Z.name.toUpperCase();
    const z = Z.id === 'produce' ? doorZ - 3.2 : Z.gapZ;
    put(still, G('zoneLine' + Z.id, () => zoneLineGrid(label, col)), X(z), 0.02, z, 0, 1, { cast: false, recv: true });
  }

  // ------------------------------------------------------------- produce
  const prod = Zs.produce;
  const prodGeo = G('produce', produceGrid);
  for (let i = prod.from; i <= prod.to; i++) {
    const z = tz[i], px = X(z);
    const j = i - prod.from;
    // market stalls line the stands, alternating sides; fruit bins and crates across from them
    const out = j % 2 ? 1 : -1;
    put(still, prodGeo, px + out * 3.8, 0, z, out > 0 ? -Math.PI / 2 : Math.PI / 2);
    const inn = -out;
    const fruit = [PAL.red, PAL.orange, PAL.yellow, 0x7cd64a, 0x9a4ad0][j % 5];
    if (j % 2) put(still, G('melons', melonBinGrid), px + inn * 3.55, 0, z + 0.2, 0.2 * j);
    else put(still, G('bananas', bananaGrid), px + inn * 3.5, 0, z + 0.2, 0.1);
    put(still, G('crate' + fruit, () => crateGrid(fruit)), px + inn * 3.4, 0, z - 1.25, 0.3);
  }
  await yieldFrame();

  // little props in the stand columns between some stops
  const gapAt = (id, k) => { const Z = Zs[id], i = Z.from + k; return (tz[i] + tz[i + 1]) / 2; };
  const colX = (z, side) => X(z) + side * (SIDE + 0.05);
  for (const [id, k, side, geoId, fn, ry] of [
    ['produce', 5, -1, 'wetFloor', wetFloorGrid, 0.3],
    ['cereal', 5, 1, 'boxes1', () => boxStackGrid(1), -0.2],
    ['snacks', 5, -1, 'boxes2', () => boxStackGrid(2), 0.25],
    ['frozen', 2, -1, 'wetFloor', wetFloorGrid, -0.25],
    ['frozen', 5, 1, 'boxes3', () => boxStackGrid(3), 0.15],
    ['checkout', 4, 1, 'bagPile', bagPileGrid, -0.3],
  ]) {
    if (!Zs[id] || Zs[id].from + k + 1 > Zs[id].to) continue;
    const z = gapAt(id, k);
    put(still, G(geoId, fn), colX(z, side), 0, z, ry);
  }

  // ------------------------------------------------------------- aisles (cereal / snacks / frozen)
  const aisle = (Z, kind) => {
    const ax = Z.aisle;
    const zA = Z.z0 + 2.2, zB = Z.z1 - 2.6;
    const len = zA - zB;
    const nShelf = Math.max(1, Math.round(len / 4));
    const step = len / nShelf;
    for (let k = 0; k < nShelf; k++) {
      const z = zA - step * (k + 0.5);
      if (kind === 'frozen') {
        for (const [x, ry] of [[ax - 3.4, Math.PI / 2], [ax + 3.4, -Math.PI / 2]]) {
          put(still, G('freezer', freezerGrid), x, 0, z + 1.0, ry);
          put(still, G('freezer', freezerGrid), x, 0, z - 1.0, ry);
        }
      } else {
        const kk = kind === 'snacks' ? (k % 2 ? 'chocolate' : 'snacks') : kind;
        const seed = 1 + (k % 3);
        put(still, G(`shelf_${kk}_${seed}`, () => shelfRowGrid(kk, seed)), ax - 3.3, 0, z, Math.PI / 2);
        put(still, G(`shelf_${kk}_${seed + 1}`, () => shelfRowGrid(kk, seed + 1)), ax + 3.3, 0, z, -Math.PI / 2);
      }
      // the next aisle over: its far shelves face back toward the path (seen over the near ones)
      for (const side of [-1, 1]) {
        const kk2 = kind === 'frozen' ? 'drinks' : kind === 'cereal' ? 'mixed' : 'snacks';
        put(still, G(`shelfFar_${kk2}`, () => shelfFarGrid(kk2)), ax + side * 7.2, 0, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, 1, { cast: false });
      }
    }
  };
  aisle(Zs.cereal, 'cereal');
  await yieldFrame();
  aisle(Zs.snacks, 'snacks');
  await yieldFrame();
  aisle(Zs.frozen, 'frozen');
  // endcap displays where the path crosses between aisles
  put(still, G('cerealTower', cerealTowerGrid), X(Zs.cereal.gapZ) - 3.6, 0, Zs.cereal.gapZ - 0.3, 0.35);
  put(still, G('chocoTower', chocoTowerGrid), X(Zs.snacks.gapZ) + 3.5, 0, Zs.snacks.gapZ - 0.2, -0.3);
  put(still, G('chocoTower', chocoTowerGrid), X(Zs.snacks.gapZ) - 3.4, 0, Zs.snacks.gapZ - 0.4, 0.25);
  put(still, G('iceCone', iceConeSignGrid), X(Zs.frozen.gapZ) + 3.3, 0, Zs.frozen.gapZ - 0.3, 0, 1.5);
  put(still, G('cerealTower', cerealTowerGrid), X(Zs.frozen.gapZ) - 3.6, 0, Zs.frozen.gapZ - 0.3, -0.4, 0.8);
  await yieldFrame();

  // ------------------------------------------------------------- checkout
  const co = Zs.checkout;
  const coGeo = (k) => G('checkout' + k, () => checkoutGrid(k));
  let lane = 1;
  // checkout lanes either side of the path (the near counters line the stands)
  for (let z = co.z0 + 0.6; z > co.z1 - 3; z -= 4.4) {
    for (const x of [co.base - 7.4, co.base - 3.8, co.base + 3.8, co.base + 7.4]) put(still, coGeo(lane++ % 9 + 1), x, 0, z, x < co.base ? Math.PI / 2 : -Math.PI / 2);
  }
  await yieldFrame();

  // ------------------------------------------------------------- vault
  // steel blast wall: the round door swings in first, then both halves slide apart
  const vfront = new THREE.Group();
  vfront.position.set(0, 0, vaultZ);
  const vHalves = [];
  let vdoor = null;
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    put(half, G(side < 0 ? 'vaultWallL' : 'vaultWallR', () => halfGrid(vaultWallGrid(), side), { scale: 0.2 }), 0, 0, 0, 0, 1, { cast: false });
    if (side < 0) {
      vdoor = new THREE.Group();
      vdoor.position.set(-2.95, 2.25, 0.3);
      put(vdoor, G('vaultDoor', vaultDoorGrid, { scale: 0.17, pivot: 'center' }), 2.3, 0, 0, 0, 1, { cast: false });
      half.add(vdoor);
    }
    vfront.add(half);
    vHalves.push({ half, side });
  }
  dynRoot.add(vfront);
  const vOpen = { door: 0, part: 0 };
  dyn.push({
    update(dt, t, fz) {
      vOpen.door += ((fz < vaultZ + 15 ? 1 : 0) - vOpen.door) * (1 - Math.exp(-dt * 2.2));
      vdoor.rotation.y = vOpen.door * 1.35;
      const want = clamp((vaultZ + 8.5 - fz) / 6, 0, 1);
      vOpen.part += (want * want * (3 - 2 * want) - vOpen.part) * (1 - Math.exp(-dt * 5));
      for (const hf of vHalves) hf.half.position.x = hf.side * vOpen.part * 8.5;
      vfront.visible = fz > vaultZ - 14;
    },
  });
  const vz0 = tz[L.zones[6].from], vzEnd = tz[n - 1];
  for (const [x, z, s] of [[-6.2, vz0 + 0.8, 1], [6.4, vz0 - 1.5, 1.2], [-7.0, vzEnd + 1.5, 1.4], [6.8, vzEnd + 3, 1], [-5.6, vzEnd - 3.6, 1.2], [5.8, vzEnd - 3.4, 1.3], [-7.6, vz0 - 4, 1.1], [7.8, vzEnd - 1, 1.2]]) {
    put(still, G('goldPile' + (Math.round(x) & 3), () => goldPileGrid(Math.round(x) & 3)), x, 0, z, x, s);
  }
  for (const [x, z, r] of [[-4.2, vz0 - 2.0, 0.3], [4.0, vz0 + 1.6, -0.4], [-3.9, vzEnd + 3.9, 0.6], [3.8, vzEnd + 4.4, -0.2], [-7.4, vzEnd - 4.6, 0.1], [7.2, vz0 - 5, -0.3]]) put(still, G('goldBars', goldBarsGrid), x, 0, z, r);
  for (const [x, z] of [[-5.0, vz0 - 0.6], [5.2, vz0 - 3.4], [-5.6, vzEnd + 0.4], [5.3, vzEnd + 1.2], [-3.4, vzEnd - 3.4], [3.3, vzEnd - 3.8]]) put(still, G('cashBag', cashBagGrid), x, 0, z, x * 0.3);
  put(still, G('prizeStage', prizeStageGrid), 0, 0, vzEnd, 0, 1, { recv: true });
  // the golden cart behind the prize stage, heaped with gold
  put(still, G('goldCart', goldCartGrid, { scale: 0.22 }), 0, 0, vzEnd - 4.6, 0.25);
  for (const [x, z, ry] of [[-3.8, vzEnd - 2.4, 0.7], [3.8, vzEnd - 2.4, -0.7], [-6.5, vz0 + 2.6, 0.4], [6.5, vz0 + 2.6, -0.4]]) put(still, G('spot', spotlightGrid), x, 0, z, ry);
  // gold-plated back + side walls lined with bulbs
  const plate = (u, y) => ((u % 10 === 0 || y % 6 === 0) ? PAL.goldDD : ((u >> 1) + (y >> 1)) % 7 === 0 ? PAL.goldL : (u + y) & 1 ? PAL.gold : 0xf0b418);
  put(still, G('vaultBack', () => {
    const g = new VoxGrid();
    for (let x = -60; x <= 59; x++) for (let y = 0; y <= 22; y++) g.set(x, y, 0, y >= 21 ? PAL.goldDD : plate(x + 60, y));
    for (let x = -57; x <= 57; x += 5) g.set(x, 21, 1, 0xfff2a0, true);
    return g;
  }, { scale: 0.2 }), 0, 0, L.zEnd - 2.5, 0, 1, { cast: false });
  const vLen = Math.ceil((vaultZ - (L.zEnd - 2.5)) / 0.2);
  for (const side of [-1, 1]) {
    put(still, G('vaultSide' + vLen, () => {
      const g = new VoxGrid();
      for (let z = 0; z <= vLen; z++) for (let y = 0; y <= 18; y++) g.set(0, y, -z, y >= 17 ? PAL.goldDD : plate(z, y));
      for (let z = 3; z <= vLen; z += 5) g.set(side * 0 + (side < 0 ? 1 : -1), 17, -z, 0xfff2a0, true);
      return g;
    }, { scale: 0.2 }), side * 9.5, 0, vaultZ - 0.4, 0, 1, { cast: false });
  }

  // ------------------------------------------------------------- store walls (beyond the outer aisles)
  const wLen = Math.ceil((doorZ - vaultZ) / 0.5);
  for (const side of [-1, 1]) {
    put(still, G('storeWall' + wLen, () => {
      const g = new VoxGrid();
      for (let z = 0; z <= wLen; z++) for (let y = 0; y <= 14; y++) {
        const c = y >= 12 ? ((z >> 2) & 1 ? PAL.pink : PAL.yellow) : y <= 1 ? 0x9aa2b4 : (z % 20 === 0 ? 0xe8e2d6 : 0xf4efe4);
        g.set(0, y, -z, c);
      }
      return g;
    }, { scale: 0.5 }), side * 17.8, 0, doorZ - 0.2, 0, 1, { cast: false });
  }

  return {
    root, still, dynRoot, dyn, textures, materials,
    dispose() {
      for (const t of textures) t.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
