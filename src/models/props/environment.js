// Environment props for the Arena map and battle backdrops.
import {
  THREE, VoxGrid, Mats, makeMesh, PAL, shade, mixHex, hash3, vnoise, ring, text, vmesh, vgeo, glowMat, tintMat, group,
  hazardC,
} from './common.js';
import { barrel, crate } from './labParts.js';
import { variantMaterials } from '../../core/voxel.js';

const leafCols = [0x4fb84a, 0x5fcf4f, 0x3f9a3a, 0x6fdc5a];
const leaves = (x, y, z) => {
  const n = vnoise(x * 0.35, y * 0.35, z * 0.35);
  if (n > 0.72) return 0x8ee05a;
  return leafCols[Math.floor(hash3(x >> 1, y >> 1, z >> 1) * 3)];
};

// ---------------------------------------------------------------------------
// Grids (exported so backdrops can instance / merge them)
export const ENV_GRIDS = {
  treeRound() {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 9, 0, (x, y) => (y % 3 === 0 ? PAL.woodD : PAL.wood));
    g.box(-2, 0, -1, 1, 0, 0, PAL.woodD).box(-1, 0, -2, 0, 0, 1, PAL.woodD);
    g.line(0, 7, 0, 3, 10, 1, PAL.wood);
    g.ellipsoid(-0.5, 14, -0.5, 6, 5.5, 6, leaves);
    g.ellipsoid(3, 12, 1, 3.5, 3.5, 3.5, leaves);
    g.ellipsoid(-4, 12.5, -1, 3.5, 3, 3.5, leaves);
    g.ellipsoid(-1, 18.5, 0, 3.5, 2.5, 3.5, leaves);
    // apples / blossoms
    for (let i = 0; i < 9; i++) {
      const a = hash3(i, 2, 3) * Math.PI * 2, y = 10 + Math.floor(hash3(i, 4, 5) * 9);
      const r = 5.6 - Math.abs(y - 14) * 0.25;
      g.set(Math.round(Math.cos(a) * r), y, Math.round(Math.sin(a) * r), 0xff4a5a);
    }
    return g;
  },
  treePine() {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 5, 0, PAL.woodD);
    const tiers = [[4, 6, 6], [9, 5, 5], [14, 4, 4], [18, 3, 3]];
    for (const [y0, r, h] of tiers)
      for (let y = 0; y < h + 1; y++) {
        const rr = r * (1 - y / (h + 1)) + 0.6;
        g.cylinder(-0.5, -0.5, y0 + y, y0 + y, rr, (x, yy, z) => {
          const edge = Math.hypot(x + 0.5, z + 0.5) > rr - 1.1;
          return edge && yy === y0 ? 0x2a6a3a : hash3(x, yy, z) < 0.25 ? 0x3f8a4a : 0x2f7a42;
        });
      }
    g.box(-1, 22, -1, 0, 23, 0, 0x2f7a42);
    return g;
  },
  treePalm() {
    const g = new VoxGrid();
    let x = 0;
    for (let y = 0; y <= 22; y++) {
      x = Math.round(Math.sin(y / 9) * 3);
      g.box(x - 1, y, -1, x, y, 0, y % 2 ? 0xb8864a : 0x9a6a3a);
    }
    const top = [x, 23, 0];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      for (let s = 0; s <= 9; s++) {
        const px = Math.round(top[0] + Math.cos(a) * s), pz = Math.round(Math.sin(a) * s);
        const py = Math.round(top[1] + 2 - (s * s) / 14);
        g.set(px, py, pz, s % 2 ? 0x4fb84a : 0x3f9a3a);
        if (s > 2 && s < 8) {
          g.set(px + Math.round(-Math.sin(a)), py - 1, pz + Math.round(Math.cos(a)), 0x5fcf4f);
          g.set(px - Math.round(-Math.sin(a)), py - 1, pz - Math.round(Math.cos(a)), 0x5fcf4f);
        }
      }
    }
    g.box(top[0] - 1, 21, -1, top[0], 22, 0, 0x6a3a1e);
    g.set(top[0] + 1, 21, 0, 0x6a3a1e).set(top[0] - 2, 21, -1, 0x6a3a1e);
    return g;
  },
  rock() {
    const g = new VoxGrid();
    g.ellipsoid(0, 2.5, 0, 5, 3.5, 4, (x, y, z) => (y > 4 && hash3(x, y, z) < 0.5 ? 0x6fa84a : vnoise(x * 0.4, y * 0.4, z * 0.4) < 0.45 ? 0x8a92a4 : 0xa4acbc));
    g.ellipsoid(3, 1.5, 2, 2.5, 2, 2.5, (x, y, z) => (hash3(x, y, z) < 0.5 ? 0x7f879a : 0x9aa2b4));
    g.carve((x, y, z) => y < 0 || (hash3(x, y, z) < 0.2 && y > 3 && Math.abs(x) > 3));
    return g;
  },
  bush() {
    const g = new VoxGrid();
    g.ellipsoid(0, 3, 0, 4.5, 3.5, 4, leaves);
    g.ellipsoid(3, 2.5, 1, 2.5, 2.5, 2.5, leaves);
    g.ellipsoid(-3, 2.5, -1, 2.5, 2.5, 2.5, leaves);
    g.carve((x, y) => y < 0);
    for (let i = 0; i < 8; i++) {
      const a = hash3(i, 9, 1) * Math.PI * 2, y = 2 + Math.floor(hash3(i, 3, 1) * 4);
      g.set(Math.round(Math.cos(a) * 4.4), y, Math.round(Math.sin(a) * 4), i % 2 ? 0xff6ab0 : 0xffffff);
    }
    return g;
  },
  flowers() {
    const g = new VoxGrid();
    const cols = [0xff4a7a, 0xffd23f, 0xb05cff, 0xffffff, 0xff8a2a, 0x5ce1e6];
    g.box(-4, 0, -3, 3, 0, 2, (x, y, z) => (hash3(x, y, z) < 0.5 ? 0x4fb84a : 0x3f9a3a));
    for (let i = 0; i < 11; i++) {
      const x = Math.floor(hash3(i, 1, 2) * 8) - 4, z = Math.floor(hash3(i, 3, 4) * 6) - 3, h = 2 + Math.floor(hash3(i, 5, 6) * 3);
      g.box(x, 1, z, x, h, z, 0x3f9a3a);
      const c = cols[i % cols.length];
      g.set(x, h + 1, z, PAL.yellow).set(x + 1, h + 1, z, c).set(x - 1, h + 1, z, c).set(x, h + 1, z + 1, c).set(x, h + 1, z - 1, c);
    }
    return g;
  },
  lamp() {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 1, 1, 1, PAL.metalDD);
    g.box(0, 2, 0, 0, 26, 0, 0x3a3f4e);
    g.box(-1, 10, -1, 1, 10, 1, 0x3a3f4e);
    g.line(0, 26, 0, 4, 29, 0, 0x3a3f4e);
    g.box(3, 28, -1, 7, 28, 1, 0x3a3f4e);
    g.box(4, 27, -1, 6, 27, 1, 0xfff2b0, true);
    g.box(4, 29, -1, 6, 29, 1, 0x2a2e3a);
    return g;
  },
  mailbox() {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 8, 0, PAL.woodD);
    g.box(-2, 9, -4, 1, 11, 3, PAL.blue);
    g.box(-1, 12, -4, 0, 12, 3, PAL.blue);
    g.box(-2, 9, 4, 1, 11, 4, PAL.blueD);
    g.box(2, 10, -1, 2, 14, -1, PAL.red).box(2, 13, -2, 2, 14, -2, PAL.red);
    g.set(-1, 10, 5, PAL.metal).set(0, 10, 5, PAL.metal);
    text(g, '7', -1, 9, 4, '-x', 0xffffff);
    return g;
  },
  cone() {
    const g = new VoxGrid();
    g.box(-3, 0, -3, 2, 0, 2, PAL.orange);
    for (let y = 1; y <= 7; y++) {
      const r = 2.4 - y * 0.27;
      g.cylinder(-0.5, -0.5, y, y, r, (y === 3 || y === 4) ? 0xffffff : PAL.orange);
    }
    return g;
  },
  crate() {
    const g = new VoxGrid();
    crate(g, -3, 0, -3, 6, PAL.wood);
    g.line(-3, 1, 3, 2, 5, 3, PAL.woodD).line(-3, 5, -3, 2, 1, -3, PAL.woodD);
    g.line(3, 1, -3, 3, 5, 2, PAL.woodD);
    return g;
  },
  barrel() {
    const g = new VoxGrid();
    barrel(g, 0, 0, 0, PAL.blue, { h: 8, r: 3, hazard: false });
    g.box(-1, 3, 3, 1, 5, 3, PAL.yellow).set(0, 4, 4, PAL.ink);
    g.set(1, 7, 1, PAL.slime, true);
    return g;
  },
  toxicBarrel() {
    const g = new VoxGrid();
    barrel(g, 0, 0, 0, PAL.yellow, { h: 8, r: 3 });
    g.box(-1, 3, 3, 1, 5, 3, PAL.ink).set(0, 4, 3, PAL.yellow);
    g.cylinder(0, 0, 7, 7, 2, PAL.toxic, 'y', true);
    g.set(2, 6, 2, PAL.toxic, true).set(2, 5, 3, PAL.toxic, true);
    return g;
  },
  bench() {
    const g = new VoxGrid();
    for (const x of [-7, 6]) { g.box(x, 0, -2, x, 4, -2, PAL.metalDD).box(x, 0, 2, x, 4, 2, PAL.metalDD); g.box(x, 4, -2, x, 8, -3, PAL.metalDD); }
    g.box(-8, 4, -2, 7, 4, 2, (x) => (x % 3 === 0 ? PAL.woodD : PAL.wood));
    g.box(-8, 6, -3, 7, 6, -3, PAL.wood).box(-8, 8, -3, 7, 8, -3, PAL.wood);
    return g;
  },
};

const S = { scale: 0.1 };
const envMesh = (name, opts = S) => vmesh('env_' + name + '_' + opts.scale, ENV_GRIDS[name], opts);
const wrap = (m, name) => { const r = group(m); r.name = name; return r; };

export function makeTree(kind = 'round') {
  const k = kind === 'pine' ? 'treePine' : kind === 'palm' ? 'treePalm' : 'treeRound';
  return wrap(envMesh(k, { scale: 0.13 }), 'tree:' + kind);
}
export function makeRock(size = 1) {
  const m = envMesh('rock');
  m.scale.setScalar(size);
  return wrap(m, 'rock');
}
export const makeBush = () => wrap(envMesh('bush'), 'bush');
export const makeFlowers = () => wrap(envMesh('flowers', { scale: 0.08 }), 'flowers');
export const makeLamp = () => wrap(envMesh('lamp'), 'lamp');
export const makeMailbox = () => wrap(envMesh('mailbox'), 'mailbox');
export const makeCone = () => wrap(envMesh('cone'), 'cone');
export const makeCrate = () => wrap(envMesh('crate'), 'crate');
export const makeBarrel = () => wrap(envMesh('barrel'), 'barrel');
export const makeBench = () => wrap(envMesh('bench'), 'bench');

/** White picket fence along X, `len` units long, centred. */
export function makeFence(len = 4, color = 0xf4f6fa) {
  const n = Math.max(1, Math.round(len * 10));
  return wrap(vmesh(`fence_${n}_${color}`, () => {
    const g = new VoxGrid();
    const x0 = -Math.floor(n / 2);
    for (let x = x0; x < x0 + n; x++) {
      if ((x - x0) % 3 === 0) {
        g.box(x, 0, 0, x, 7, 0, color);
        g.set(x, 8, 0, shade(color, -0.08));
      }
      g.set(x, 2, -1, shade(color, -0.12)).set(x, 6, -1, shade(color, -0.12));
    }
    return g;
  }, S), 'fence');
}

/** Wooden signpost with arrow board. */
export function makeSignpost(color = PAL.pink) {
  return wrap(vmesh('signpost_' + color, () => {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 16, 0, PAL.wood);
    g.box(-1, 17, -1, 0, 17, 0, PAL.woodD);
    for (let x = -4; x <= 9; x++) {
      const tip = x > 6 ? x - 6 : 0;
      g.box(x, 11 + tip, 1, x, 15 - tip, 1, color);
    }
    g.box(-4, 13, 2, 5, 13, 2, shade(color, 0.6));
    g.box(-5, 6, 1, 5, 9, 1, shade(color, -0.25));
    g.box(-5, 6, 1, -5, 9, 1, color);
    return g;
  }, S), 'signpost');
}

// ---------------------------------------------------------------------------
// Buildings

function roofGable(g, x0, x1, z0, z1, y, col, colD, axis = 'x') {
  // pitched roof ridge along x
  const half = Math.ceil((z1 - z0 + 1) / 2);
  for (let i = 0; i <= half; i++) {
    g.box(x0 - 1, y + i, z0 + i - 1, x1 + 1, y + i, z1 - i + 1, (x, yy, z) => ((x + z + yy) % 4 === 0 ? colD : col));
  }
}

export function houseGrid(color = 0x8fd0ff, seed = 1) {
  const g = new VoxGrid();
  const trim = 0xffffff, roof = [0x5a4a6a, 0x8a3a3a, 0x3a5a7a][seed % 3];
  g.box(-15, 0, -12, 14, 1, 11, 0xb8b0a8);
  g.box(-14, 2, -11, 13, 20, 10, (x, y, z) => ((y % 3 === 0) ? shade(color, -0.1) : color));
  for (const x of [-14, 13]) for (const z of [-11, 10]) g.box(x, 2, z, x, 20, z, trim);
  // windows (warm glow) on +z
  for (const wx of [-11, 6]) {
    g.box(wx - 1, 7, 11, wx + 5, 15, 11, trim);
    g.box(wx, 8, 11, wx + 4, 14, 11, null);
    g.box(wx, 8, 10, wx + 4, 14, 10, (x, y) => (x === wx + 2 || y === 11 ? trim : 0xffe08a), true);
    g.box(wx - 2, 7, 11, wx - 2, 15, 11, shade(color, -0.35)).box(wx + 6, 7, 11, wx + 6, 15, 11, shade(color, -0.35));
  }
  // door + porch
  g.box(-3, 2, 11, 3, 15, 11, trim);
  g.box(-2, 2, 11, 2, 14, 11, null);
  g.box(-2, 2, 10, 2, 14, 10, shade(color, -0.45));
  g.set(1, 8, 11, PAL.gold);
  g.box(-6, 0, 12, 5, 1, 15, 0xa89a8a);
  g.box(-6, 16, 11, 5, 16, 15, roof);
  for (const x of [-6, 5]) g.box(x, 2, 15, x, 15, 15, trim);
  // roof
  roofGable(g, -15, 14, -12, 11, 21, roof, shade(roof, -0.2));
  g.box(-16, 21, 11, 15, 21, 12, shade(roof, -0.25));
  // gable windows (side)
  g.box(5, 24, -2, 8, 26, -2, trim);
  // chimney
  g.box(-10, 22, -6, -7, 33, -3, PAL.brick);
  g.box(-11, 33, -7, -6, 34, -2, PAL.brickD);
  return g;
}
export function makeHouse(color = 0x8fd0ff) {
  return wrap(vmesh('house_' + color, () => houseGrid(color, color % 3), { scale: 0.15 }), 'house');
}

export function mansionGrid() {
  const g = new VoxGrid();
  const cream = PAL.cream, creamD = PAL.creamD, gold = PAL.gold, roof = 0x8a2a3a;
  g.box(-48, 0, -16, 47, 2, 18, (x, y, z) => (y === 2 && z === 18 ? gold : 0xe8e2d6));
  const wing = (x0, x1, h) => {
    g.box(x0, 3, -14, x1, h, 12, (x, y, z) => (y === h - 2 ? gold : (x - x0) % 8 < 2 && z === 12 ? creamD : cream));
    for (let x = x0 + 3; x < x1 - 2; x += 6) {
      for (const wy of [6, 6 + 10, 6 + 20]) {
        if (wy + 7 > h - 3) continue;
        g.box(x - 1, wy - 1, 13, x + 3, wy + 7, 13, gold);
        g.box(x, wy, 13, x + 2, wy + 6, 13, null);
        g.box(x, wy, 12, x + 2, wy + 6, 12, (xx, yy) => (yy === wy + 3 ? gold : 0xffe08a), true);
      }
    }
    roofGable(g, x0, x1, -14, 12, h + 1, roof, 0x6a1a2a);
  };
  wing(-46, -18, 24);
  wing(17, 45, 24);
  wing(-17, 16, 34);
  // portico
  for (const x of [-14, -7, 0, 7, 13]) {
    g.cylinder(x, 17, 3, 26, 1.5, (xx, y, z) => ((xx + z) % 2 ? 0xffffff : 0xe8ecf2));
    g.box(x - 2, 27, 15, x + 2, 28, 19, gold);
  }
  g.box(-17, 29, 13, 16, 31, 20, (x, y) => (y === 29 ? gold : cream));
  for (let i = 0; i < 9; i++) g.box(-17 + i * 2, 32 + i, 13, 16 - i * 2, 32 + i, 20, i === 0 ? gold : cream);
  text(g, '$', 0, 34, 21, '+z', gold, { center: true, scale: 1, glow: true });
  g.box(-4, 3, 13, 3, 14, 13, gold);
  g.box(-3, 3, 13, 2, 13, 13, 0x7a1a2a);
  // stairs + red carpet
  for (let i = 0; i < 3; i++) g.box(-12, 0, 19 + i * 2, 11, 2 - i, 20 + i * 2, (x) => (Math.abs(x + 0.5) < 4 ? PAL.red : 0xf0ece4));
  // gold statues on wings' roofs
  g.box(-1, 45, -2, 0, 50, -1, gold);
  g.sphere(-0.5, 51, -1.5, 2, gold);
  return g;
}
export function makeMansion() {
  return wrap(vmesh('mansion', mansionGrid, { scale: 0.12 }), 'mansion');
}

export function technoTowerGrid() {
  const g = new VoxGrid();
  const dark = 0x1c2238, mid = 0x2a3456, neon = [0x5ce1e6, 0xff4fa3, 0xb05cff];
  g.box(-10, 0, -10, 9, 3, 9, dark);
  let y = 4;
  const segs = [[8, 14], [7, 12], [6, 12], [5, 10], [4, 8]];
  segs.forEach(([r, h], i) => {
    g.box(-r, y, -r, r - 1, y + h - 1, r - 1, (x, yy, z) => {
      const edge = (Math.abs(x + 0.5) > r - 1.5) && (Math.abs(z + 0.5) > r - 1.5);
      if (edge) return mid;
      if ((yy - y) % 3 === 1 && (x + z) % 2 === 0) return neon[(i + (x > 0 ? 1 : 0)) % 3];
      return dark;
    });
    g.box(-r - 1, y + h - 1, -r - 1, r, y + h - 1, r, neon[i % 3], true);
    y += h;
  });
  // glow windows
  g.forEach((x, yy, z, c) => { if (neon.includes(c)) g.set(x, yy, z, c, true); });
  g.box(0, y, 0, 0, y + 14, 0, PAL.metal);
  g.set(0, y + 15, 0, 0xff3040, true);
  ring(g, 0, 0, y + 6, y + 6, 3, 0x5ce1e6, true);
  return g;
}
export function makeTechnoTower() {
  return wrap(vmesh('technoTower', technoTowerGrid, { scale: 0.13 }), 'technoTower');
}

export function reactorGrid() {
  const g = new VoxGrid();
  const conc = (x, y, z) => (vnoise(x * 0.2, y * 0.2, z * 0.2) < 0.4 ? 0xb8bcc4 : 0xc8ccd4);
  // cooling tower (hyperboloid)
  for (let y = 0; y <= 40; y++) {
    const t = (y - 26) / 26;
    const r = 9 + t * t * 7;
    ring(g, -14, 0, y, y, r, (x, yy, z) => (yy > 34 && yy < 38 ? 0xd84a4a : conc(x, yy, z)), false, 2);
  }
  g.cylinder(-14, 0, 39, 39, 12, null);
  // dome reactor
  g.box(2, 0, -10, 24, 8, 10, 0xd8dce4);
  g.ellipsoid(13, 9, 0, 10, 10, 10, (x, y, z) => ((x + y + z) % 5 === 0 ? 0xc8ccd4 : 0xe4e8ee));
  g.box(10, 2, 11, 16, 8, 11, PAL.metalDD);
  g.box(11, 3, 11, 15, 7, 11, PAL.toxic, true);
  hazard3(g, 2, 8, 11, 24, 8, 11);
  // radiation symbol on dome
  g.cylinder(13, 12, 19, 19, 3, PAL.yellow, 'z');
  g.set(13, 12, 20, PAL.ink).set(12, 13, 20, PAL.ink).set(14, 13, 20, PAL.ink).set(13, 10, 20, PAL.ink);
  // glowing pipes
  for (let x = -4; x <= 2; x++) g.box(x, 4, 4, x, 5, 5, x % 3 ? PAL.metal : PAL.toxic, x % 3 === 0);
  // chimney stack
  g.box(26, 0, -4, 29, 30, -1, (x, y) => (Math.floor(y / 4) % 2 ? 0xd84a4a : 0xf0f0f0));
  g.set(27, 31, -2, 0xff3040, true);
  return g;
}
function hazard3(g, x0, y0, z0, x1, y1, z1) { g.box(x0, y0, z0, x1, y1, z1, hazardC()); }
export function makeReactor() {
  return wrap(vmesh('reactor', reactorGrid, { scale: 0.15 }), 'reactor');
}

export function factoryGrid() {
  const g = new VoxGrid();
  const brick = (x, y, z) => ((y % 2 === 0) || ((x + z + (Math.floor(y / 2) % 2) * 2) % 4 === 0) ? 0x7a3a2a : (hash3(x >> 1, y, z) < 0.3 ? 0xa04a32 : 0x9a4430));
  g.box(-26, 0, -10, 25, 22, 10, brick);
  // saw-tooth roof
  for (let x = -26; x <= 25; x += 9)
    for (let i = 0; i < 6; i++) g.box(x, 23 + i, -10, x + 8 - i, 23 + i, 10, i === 5 ? PAL.metal : 0x5a3a2a);
  // chimneys
  for (const [x, h] of [[-20, 46], [-12, 40]]) {
    g.box(x, 23, -4, x + 4, h, 0, brick);
    g.box(x - 1, h, -5, x + 5, h + 1, 1, PAL.metalD);
  }
  // windows
  for (let x = -23; x <= 22; x += 6) {
    g.box(x, 8, 11, x + 3, 15, 11, PAL.metalD);
    g.box(x + 1, 9, 10, x + 2, 14, 10, 0xffc870, true);
  }
  // giant chocolate bar sign
  g.box(-8, 26, 11, 15, 35, 12, (x, y) => ((x + 8) % 4 === 0 || y === 30 ? PAL.chocoD : PAL.choco));
  g.box(-8, 26, 11, 0, 35, 13, 0xff4fa3);
  text(g, 'CHOCO', 4, 28, 13, '+z', 0xffffff, { center: true, glow: true });
  // gate
  g.box(14, 0, 11, 22, 12, 11, PAL.metalDD);
  for (let y = 1; y < 12; y += 2) g.box(15, y, 12, 21, y, 12, PAL.metal);
  // pipes
  for (let y = 4; y <= 18; y += 7) g.box(-27, y, -8, -27, y + 1, 8, PAL.gold);
  return g;
}
export function makeFactory() {
  return wrap(vmesh('factory', factoryGrid, { scale: 0.15 }), 'factory');
}

// ---------------------------------------------------------------------------
// Golden panther statue
export function pantherStatueGrid() {
  const g = new VoxGrid();
  const go = 0xffd040, goL = 0xffe680, goD = 0xc89a20;
  // sitting panther, faces +z
  g.ellipsoid(0, 5, -2, 5, 5, 5.5, go); // haunches
  g.ellipsoid(0, 12, 1, 3.8, 7, 3.6, go); // chest
  for (const x of [-3, 2]) { g.box(x, 0, 3, x + 1, 10, 5, goL); g.box(x, 0, 4, x + 1, 1, 7, goL); } // front legs
  g.box(-6, 0, -4, -4, 2, 2, goD).box(4, 0, -4, 6, 2, 2, goD); // back feet
  g.ellipsoid(0, 20, 3, 4.2, 3.6, 3.8, go); // head
  g.ellipsoid(0, 18.5, 6.5, 2.3, 1.6, 1.8, goL); // muzzle
  g.set(0, 19, 8, goD).set(-1, 19, 8, goD);
  g.box(-3, 21, 6, -2, 21, 6, PAL.ink).box(1, 21, 6, 2, 21, 6, PAL.ink); // eyes
  g.box(-3, 22, 6, -2, 22, 6, goD).box(1, 22, 6, 2, 22, 6, goD);
  for (const x of [-3, 2]) { g.box(x, 23, 2, x + 1, 25, 3, go); g.set(x + (x < 0 ? 0 : 1), 26, 2, go); g.set(x + (x < 0 ? 1 : 0), 24, 4, goD); }
  // stripes
  for (const y of [9, 12, 15]) for (let z = -2; z <= 3; z++) { g.set(-4, y, z, g.has(-4, y, z) ? goD : undefined); g.set(3, y, z, g.has(3, y, z) ? goD : undefined); }
  for (const [x, z] of [[-4, -5], [3, -5], [-5, -2], [4, -2]]) g.box(x, 6, z, x, 8, z, goD);
  // curled tail
  const tail = [[0, 1, -7], [-2, 1, -8], [-4, 1, -7], [-6, 1, -5], [-7, 1, -2], [-7, 2, 1], [-6, 2, 4], [-5, 3, 6]];
  for (let i = 0; i < tail.length - 1; i++) g.line(...tail[i], ...tail[i + 1], go, 0);
  for (const [x, y, z] of tail) g.set(x, y + 1, z, go);
  g.set(-5, 4, 6, goL);
  g.carve((x, y) => y < 0);
  return g;
}
export function makeGoldenStatue() {
  const ped = vmesh('statuePed', () => {
    const g = new VoxGrid();
    g.box(-6, 0, -6, 5, 1, 5, 0xe8e2d6);
    g.box(-5, 2, -5, 4, 9, 4, (x, y, z) => (vnoise(x * 0.4, y * 0.4, z * 0.4) < 0.4 ? 0xdcd6ca : 0xf2eee6));
    g.box(-6, 10, -6, 5, 11, 5, 0xe8e2d6);
    g.box(-5, 9, 5, 4, 9, 5, PAL.gold);
    g.box(-3, 4, 5, 2, 6, 5, PAL.goldD);
    return g;
  }, { scale: 0.1 });
  const statue = makeMesh(vgeo('statuePanther', pantherStatueGrid, { scale: 0.065 }), variantMaterials('gold'));
  statue.position.y = 1.2;
  const r = group(ped, statue);
  r.name = 'goldenStatue';
  return r;
}

// ---------------------------------------------------------------------------
// Portal / boss gate (animated)
export function makePortal(color = PAL.blue) {
  const arch = vmesh('portalArch', () => {
    const g = new VoxGrid();
    const stone = (x, y, z) => (hash3(x >> 1, y >> 1, z) < 0.3 ? 0x6a7288 : 0x7f879c);
    for (let a = 0; a <= 40; a++) {
      const t = (a / 40) * Math.PI;
      const x = Math.round(Math.cos(t) * 10), y = Math.round(Math.sin(t) * 10) + 10;
      g.box(x - 2, y - 1, -2, x + 1, y + 1, 1, stone);
    }
    for (const x of [-12, 9]) g.box(x, 0, -2, x + 2, 10, 1, stone);
    g.box(-14, 0, -3, 13, 1, 2, 0x5a6278);
    for (let a = 0; a < 7; a++) {
      const t = (a / 6) * Math.PI;
      g.set(Math.round(Math.cos(t) * 10), Math.round(Math.sin(t) * 10) + 10, 2, 0xffffff, true);
    }
    return g;
  }, { scale: 0.1 });
  // swirl (white glow tinted by colour)
  const swirlGeo = vgeo('portalSwirl', () => {
    const g = new VoxGrid();
    for (let x = -8; x <= 8; x++) for (let y = -8; y <= 8; y++) {
      const r = Math.hypot(x, y);
      if (r > 8.4) continue;
      const a = Math.atan2(y, x);
      const v = Math.sin(a * 3 + r * 0.9);
      g.set(x, y, 0, v > 0.3 ? 0xffffff : v > -0.3 ? 0xb0b0b0 : 0x707070, true);
    }
    return g;
  }, { scale: 0.1, pivot: 'center' });
  const swirl = makeMesh(swirlGeo, [Mats.solid, tintMat(color)]);
  swirl.castShadow = false;
  swirl.position.set(0, 1.05, 0);
  const lowerGlow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 0.12), glowMat(color, 0.55));
  lowerGlow.position.set(0, 0.6, 0);
  const root = group(arch, lowerGlow, swirl);
  root.name = 'portal';
  let t = 0;
  const update = (dt) => {
    t += dt;
    swirl.rotation.z -= dt * 1.6;
    swirl.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
  };
  root.userData.update = update;
  return { root, update, swirl };
}

export function makeBossGate(color = PAL.purple) {
  const arch = vmesh('bossGate', () => {
    const g = new VoxGrid();
    const stone = (x, y, z) => (hash3(x >> 1, y >> 1, z) < 0.35 ? 0x3a3448 : 0x4a4258);
    for (const x of [-14, 10]) {
      g.box(x, 0, -3, x + 3, 24, 2, stone);
      for (let y = 4; y < 24; y += 6) g.box(x - 1, y, -4, x + 4, y, 3, 0x2a2436);
      g.box(x, 25, -3, x + 3, 25, 2, 0x2a2436).box(x + 1, 26, -2, x + 2, 28, 1, 0xd8d0c0); // bone spike
    }
    g.box(-14, 22, -3, 13, 27, 2, stone);
    for (let x = -13; x <= 12; x += 3) g.box(x, 20, 0, x, 21, 0, 0xe8e0d0); // teeth
    // skull
    g.box(-5, 26, 2, 4, 35, 4, 0xe8e0d0);
    g.box(-4, 36, 2, 3, 36, 4, 0xe8e0d0);
    g.box(-4, 29, 5, -2, 32, 5, 0x15121f).box(1, 29, 5, 3, 32, 5, 0x15121f);
    g.box(-1, 27, 5, 0, 28, 5, 0x15121f);
    for (let x = -4; x <= 3; x += 2) g.set(x, 26, 5, 0xffffff);
    // chains
    for (const x of [-11, 8]) for (let y = 8; y < 22; y++) g.set(x + (y % 2), y, 3, PAL.metalD);
    return g;
  }, { scale: 0.1 });
  const eyesGeo = vgeo('bossGateEyes', () => {
    const g = new VoxGrid();
    g.box(-4, 0, 0, -3, 1, 0, 0xffffff, true).box(1, 0, 0, 2, 1, 0, 0xffffff, true);
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0] });
  const eyeMat = tintMat(color);
  const eyes = makeMesh(eyesGeo, [Mats.solid, eyeMat]);
  eyes.position.set(0, 3.0, 0.62);
  const fog = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 0.1), glowMat(color, 0.4));
  fog.position.set(0, 1.0, 0);
  const root = group(arch, fog, eyes);
  root.name = 'bossGate';
  let t = 0;
  const update = (dt) => {
    t += dt;
    const f = 0.6 + 0.4 * Math.abs(Math.sin(t * 2.3)) * (Math.random() < 0.08 ? 0.2 : 1);
    eyeMat.color.setHex(color).multiplyScalar(f + 0.3);
    fog.material.opacity = 0.32 + Math.sin(t * 1.7) * 0.08;
  };
  root.userData.update = update;
  return { root, update };
}

export function makeTrophyPodium() {
  return wrap(vmesh('podium', () => {
    const g = new VoxGrid();
    const tiers = [[-15, -6, 6, 0xc0c8d4, '2'], [-5, 5, 10, PAL.gold, '1'], [6, 15, 4, 0xd08a4a, '3']];
    for (const [x0, x1, h, c, n] of tiers) {
      g.box(x0, 0, -5, x1, h, 5, (x, y) => (y === h ? shade(c, 0.2) : c));
      text(g, n, Math.round((x0 + x1) / 2), Math.max(1, h - 6), 6, '+z', 0xffffff, { center: true });
    }
    // trophy on top
    const y0 = 11;
    g.box(-2, y0, -2, 1, y0, 1, PAL.goldD);
    g.box(-1, y0 + 1, -1, 0, y0 + 3, 0, PAL.gold);
    g.cylinder(-0.5, -0.5, y0 + 4, y0 + 9, 3, (x, y) => (y === y0 + 9 ? PAL.goldL : PAL.gold));
    g.cylinder(-0.5, -0.5, y0 + 6, y0 + 9, 2, null);
    g.cylinder(-0.5, -0.5, y0 + 5, y0 + 5, 2, PAL.goldD);
    g.box(-5, y0 + 6, -1, -5, y0 + 8, 0, PAL.gold).box(4, y0 + 6, -1, 4, y0 + 8, 0, PAL.gold);
    g.set(-1, y0 + 7, 3, PAL.pink, true);
    return g;
  }, { scale: 0.1 }), 'trophyPodium');
}

export { roofGable };
