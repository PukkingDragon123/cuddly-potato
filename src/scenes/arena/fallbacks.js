// Fallback voxel props for the Arena map. Used whenever src/models/props.js does not
// (yet) export a factory, so the island always renders. Same contract as props.js:
// models face +Z, y = 0 is the ground, sizes are in world units (chibi ~1.9 tall).
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh, cachedGeometry, variantMaterials } from '../../core/voxel.js';
import { shade, hash3, mulberry32 } from '../../core/util.js';

const md = (s, n) => ((Math.floor(s || 0) % n) + n) % n;
const mesh = (key, scale, fn, opts = {}) => makeMesh(cachedGeometry(`arena:${key}`, fn, { scale, ...opts }));
const group = (...kids) => {
  const g = new THREE.Group();
  kids.forEach((k) => k && g.add(k));
  return g;
};

// ---------------------------------------------------------------------------
// Nature

export function makeTree(kind = 'round', seed = 0) {
  const v = md(seed, 3);
  if (kind === 'pine') {
    return mesh('pine' + v, 0.2, () => {
      const g = new VoxGrid();
      g.cylinder(0, 0, 0, 4, 1, 0x7a4a2a);
      const greens = [0x2f8f4e, 0x37a058, 0x2a7f46];
      for (let t = 0; t < 4; t++) {
        const y0 = 3 + t * 4, r = 7 - t * 1.6;
        for (let y = 0; y < 5; y++) g.cylinder(0, 0, y0 + y, y0 + y, Math.max(0.6, r * (1 - y / 6)), greens[(t + v) % 3]);
      }
      g.box(0, 22, 0, 0, 23, 0, 0x37a058);
      g.paint((x, y, z, c) => (c !== 0x7a4a2a && hash3(x, y, z) < 0.12 ? 0x4fc06a : undefined));
      return g;
    });
  }
  if (kind === 'palm') {
    return mesh('palm' + v, 0.2, () => {
      const g = new VoxGrid();
      let tx = 0;
      for (let y = 0; y < 15; y++) {
        tx = Math.round(Math.pow(y / 14, 2) * 3);
        g.box(tx - 1, y, -1, tx, y, 0, y % 3 === 0 ? 0x9a7040 : 0xb88a50);
      }
      const top = [tx, 15, 0];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
      for (const [dx, dz] of dirs)
        for (let s = 0; s < 7; s++) {
          const x = Math.round(top[0] + dx * s), z = Math.round(dz * s), y = top[1] + Math.round(1.5 - (s * s) / 10);
          g.box(x, y, z, x, y, z, s % 2 ? 0x3fae46 : 0x4cc455);
          if (s > 1) g.set(x + Math.sign(dz), y, z - Math.sign(dx), 0x3fae46);
        }
      g.box(top[0] - 1, 13, -1, top[0], 14, 0, 0x6b4426);
      g.set(top[0] + 1, 13, 1, 0x6b4426);
      return g;
    });
  }
  // round (default)
  return mesh('tree' + v, 0.2, () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 7, 1.2, 0x8a5a34);
    g.box(-2, 0, -1, 2, 0, 1, 0x7a4a2a);
    const base = [0x4caf50, 0x55b84f, 0x46a447][v];
    g.ellipsoid(0, 11, 0, 6 + v * 0.5, 5, 6, base);
    g.ellipsoid(2, 14, 1, 3.5, 3, 3.5, base);
    g.paint((x, y, z, c) => {
      if (c === 0x8a5a34 || c === 0x7a4a2a) return undefined;
      if (y >= 14 && hash3(x, y, z) < 0.5) return shade(base, 0.22);
      if (y <= 8) return shade(base, -0.2);
      if (hash3(x, y, z) < 0.07) return v === 1 ? 0xff5a5a : shade(base, 0.12);
      return undefined;
    });
    return g;
  });
}

export function makeRock(size = 1, seed = 0) {
  const v = md(seed, 3);
  const m = mesh('rock' + v, 0.15 * size, () => {
    const g = new VoxGrid();
    g.ellipsoid(0, 3, 0, 4 + v, 3 + (v % 2), 3.5, 0x9aa0ac);
    g.ellipsoid(2, 2, 2, 2.5, 2, 2, 0x8c929e);
    g.carve((x, y) => y < 0);
    g.paint((x, y, z) => (y >= 5 && hash3(x, y, z) < 0.55 ? 0x6fb04a : hash3(x, y, z) < 0.25 ? 0x878d9a : undefined));
    return g;
  });
  return m;
}

export function makeBush(seed = 0) {
  const v = md(seed, 3);
  return mesh('bush' + v, 0.1, () => {
    const g = new VoxGrid();
    const base = [0x3f9e45, 0x4aab4c, 0x3a9440][v];
    g.ellipsoid(0, 4, 0, 6, 4.5, 5, base);
    g.ellipsoid(4, 3, 1, 3, 3, 3, shade(base, 0.08));
    g.carve((x, y) => y < 0);
    const flower = [0xff6fae, 0xffe14a, 0xffffff][v];
    g.paint((x, y, z) => (y > 2 && hash3(x, y, z) < 0.08 ? flower : y < 2 ? shade(base, -0.18) : undefined));
    return g;
  });
}

export function makeFlowers(seed = 0) {
  const v = md(seed, 4);
  return mesh('flowers' + v, 0.1, () => {
    const g = new VoxGrid();
    const rng = mulberry32(99 + v);
    const cols = [[0xff4fa3, 0xffd23f, 0xffffff], [0xb05cff, 0xff8a2a, 0xffffff], [0xff4a4a, 0xffd23f, 0x29b6f6], [0xffffff, 0xff9ad0, 0xffe14a]][v];
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rng() * 12 - 6), z = Math.floor(rng() * 12 - 6), hgt = 1 + Math.floor(rng() * 3);
      g.box(x, 0, z, x, hgt, z, 0x3f9e45);
      const c = cols[i % 3];
      g.set(x, hgt + 1, z, c);
      g.set(x + 1, hgt + 1, z, c);
      g.set(x - 1, hgt + 1, z, c);
      g.set(x, hgt + 1, z + 1, c);
      g.set(x, hgt + 1, z - 1, c);
      g.set(x, hgt + 2, z, 0xffe14a);
    }
    return g;
  });
}

export function makeGrassTuft() {
  return cachedGeometry('arena:tuft', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 2, 0, 0x4f9e3a);
    g.box(1, 0, 1, 1, 1, 1, 0x5aad40);
    g.box(-1, 0, 0, -1, 1, 0, 0x5aad40);
    g.box(0, 0, -1, 0, 3, -1, 0x4a9636);
    return g;
  }, { scale: 0.1 });
}

// ---------------------------------------------------------------------------
// Street furniture

export function makeFence(len = 4, color = 0xf4f0e6) {
  return mesh('fence' + len + ':' + color, 0.1, () => {
    const g = new VoxGrid();
    const n = Math.round(len * 10);
    for (let x = 0; x < n; x++) {
      if (x % 3 === 0) {
        g.box(x, 0, 0, x, 7, 0, color);
        g.set(x, 8, 0, shade(color, -0.06));
      }
      g.set(x, 2, -1, shade(color, -0.12));
      g.set(x, 5, -1, shade(color, -0.12));
    }
    return g;
  });
}

export function makeLamp() {
  const g = mesh('lamp', 0.1, () => {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 1, 1, 1, 0x2a2f3c);
    g.box(0, 2, 0, 0, 26, 0, 0x3a4050);
    g.box(-2, 27, -2, 2, 27, 2, 0x2a2f3c);
    g.box(-1, 23, -1, 1, 26, 1, 0xfff1b0, true);
    g.box(-2, 22, -2, 2, 22, 2, 0x2a2f3c);
    return g;
  });
  return g;
}

export function makeMailbox(color = 0x3a6ad8) {
  return mesh('mailbox' + color, 0.1, () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 8, 0, 0x7a5a3a);
    g.box(-2, 9, -4, 2, 12, 4, color);
    g.box(-1, 13, -4, 1, 13, 4, color);
    g.box(-2, 9, 5, 2, 12, 5, shade(color, -0.2));
    g.box(3, 11, -1, 3, 15, -1, 0xe8343c);
    g.box(3, 14, -1, 3, 15, 1, 0xe8343c);
    return g;
  });
}

export function makeTrashCan(color = 0x6a7a6a) {
  return mesh('trash' + color, 0.1, () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 9, 3, color);
    g.paint((x, y, z, c) => (y % 3 === 0 ? shade(color, -0.15) : undefined));
    g.cylinder(0, 0, 10, 10, 3.6, shade(color, 0.1));
    g.box(-1, 11, 0, 1, 11, 0, shade(color, -0.2));
    return g;
  });
}

export function makeCrate() {
  return mesh('crate', 0.1, () => {
    const g = new VoxGrid();
    g.box(-4, 0, -4, 3, 7, 3, 0xc08a52);
    g.paint((x, y, z) => (x === -4 || x === 3 || y === 0 || y === 7 || z === -4 || z === 3 ? 0x8a5a30 : (x + y) % 3 === 0 ? 0xb07a48 : undefined));
    return g;
  });
}

export function makeBarrel(kind = 'wood') {
  const toxic = kind === 'toxic';
  return mesh('barrel' + kind, 0.1, () => {
    const g = new VoxGrid();
    const c = toxic ? 0xf2c230 : 0x8a5a34;
    g.cylinder(0, 0, 0, 10, 3.4, c);
    g.paint((x, y) => (y === 2 || y === 8 ? (toxic ? 0x2a2a30 : 0x6a6e7a) : undefined));
    if (toxic) {
      g.cylinder(0, 0, 11, 11, 2.6, 0x7cff3a, 'y', true);
      g.box(-1, 4, 4, 1, 6, 4, 0x2a2a30);
    }
    return g;
  });
}

export function makeCone() {
  return mesh('cone', 0.1, () => {
    const g = new VoxGrid();
    g.box(-3, 0, -3, 3, 0, 3, 0xff6a1a);
    for (let y = 1; y < 8; y++) g.cylinder(0, 0, y, y, 2.6 - y * 0.3, y === 3 || y === 4 ? 0xffffff : 0xff7a2a);
    return g;
  });
}

export function makeBench() {
  return mesh('bench', 0.1, () => {
    const g = new VoxGrid();
    g.box(-8, 4, -2, 8, 4, 2, 0xb07a48);
    g.box(-8, 5, -3, 8, 8, -3, 0xb07a48);
    g.paint((x, y, z, c) => (c === 0xb07a48 && x % 4 === 0 ? 0x9a6a3c : undefined));
    for (const x of [-7, 7]) {
      g.box(x, 0, -2, x, 3, -2, 0x2a2f3c);
      g.box(x, 0, 2, x, 3, 2, 0x2a2f3c);
    }
    return g;
  });
}

export function makeSignpost(color = 0x29b6f6) {
  return mesh('signpost' + color, 0.1, () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 14, 0, 0x7a5a3a);
    g.box(-6, 10, 1, 6, 16, 1, color);
    g.box(-5, 12, 2, 5, 12, 2, 0xffffff);
    g.box(-5, 14, 2, 3, 14, 2, 0xffffff);
    return g;
  });
}

export function makeHydrant() {
  return mesh('hydrant', 0.1, () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 6, 1.6, 0xe8343c);
    g.box(-2, 3, -1, 2, 4, 1, 0xe8343c);
    g.cylinder(0, 0, 7, 7, 1, 0xc8202a);
    return g;
  });
}

// ---------------------------------------------------------------------------
// Buildings

export function makeHouse(color = 0xf2a65a) {
  return mesh('house' + color, 0.25, () => {
    const g = new VoxGrid();
    const W = 12, D = 8, H = 11;
    const roof = shade(color, -0.45);
    g.box(-W - 1, 0, -D - 1, W, 0, D, 0x9aa0aa);
    g.shell(-W, 1, -D, W - 1, H, D - 1, color);
    g.paint((x, y, z, c) => (c === color && y % 3 === 0 ? shade(color, -0.07) : undefined));
    // gable roof along x
    for (let k = 0; k <= D + 1; k++) {
      const y = H + 1 + k;
      g.box(-W - 1, y, -D - 1 + k, W, y, -D - 1 + k, roof);
      g.box(-W - 1, y, D - k, W, y, D - k, roof);
      if (k > 0) {
        g.box(-W, y - 1, -D - 1 + k, -W, y - 1, D - k, color);
        g.box(W - 1, y - 1, -D - 1 + k, W - 1, y - 1, D - k, color);
      }
    }
    g.paint((x, y, z, c) => (c === roof && x % 4 === 0 ? shade(roof, 0.12) : undefined));
    // door + windows on the front (z = D-1 surface => z=D)
    g.box(-2, 1, D, 1, 7, D, 0x7a4a2a);
    g.set(1, 4, D + 1, 0xffd23f);
    for (const wx of [-9, 5]) {
      g.box(wx - 1, 3, D, wx + 4, 8, D, 0xffffff);
      g.box(wx, 4, D, wx + 3, 7, D, 0xfff2a8, true);
      g.box(wx + 1, 4, D, wx + 2, 7, D, 0xffffff);
    }
    g.box(-3, 1, D, 2, 1, D + 2, 0xbfc4cc); // step
    g.box(-W + 1, 1, D, -W + 2, 3, D + 1, 0x4caf50); // bush
    g.box(6, H + 3, -3, 8, H + 10, -1, 0xa04a3a); // chimney
    return g;
  });
}

export function makeMansion() {
  return mesh('mansion', 0.25, () => {
    const g = new VoxGrid();
    const wall = 0xf6f2ea, trim = 0xffd23f, roof = 0x2a3a6a, win = 0xbfe8ff;
    g.box(-34, 0, -14, 33, 1, 13, 0xe8e2d4);
    // wings
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -32 : 14, x1 = s < 0 ? -15 : 31;
      g.shell(x0, 2, -12, x1, 24, 8, wall);
      g.box(x0 - 1, 25, -13, x1 + 1, 26, 9, roof);
      g.box(x0 - 1, 24, -13, x1 + 1, 24, 9, trim);
      for (let wx = x0 + 2; wx < x1 - 2; wx += 5)
        for (const wy of [6, 15]) {
          g.box(wx, wy, 9, wx + 2, wy + 5, 9, trim);
          g.box(wx, wy + 1, 9, wx + 2, wy + 4, 9, win, true);
        }
    }
    // central block
    g.shell(-14, 2, -13, 13, 32, 11, wall);
    g.box(-15, 33, -14, 14, 34, 12, roof);
    g.box(-15, 32, -14, 14, 32, 12, trim);
    for (let k = 0; k < 6; k++) g.box(-12 + k * 2, 35 + k, -12 + k, 11 - k * 2, 35 + k, 10 - k, k === 5 ? trim : roof);
    // columns + portico
    g.box(-12, 2, 12, 11, 2, 17, 0xe8e2d4);
    for (let cx = -11; cx <= 10; cx += 4) g.cylinder(cx, 16, 3, 22, 1, 0xffffff);
    g.box(-13, 23, 12, 12, 25, 17, trim);
    for (let k = 0; k < 4; k++) g.box(-12 + k * 3, 26 + k, 13, 11 - k * 3, 26 + k, 17, k === 3 ? trim : wall);
    // door
    g.box(-3, 2, 12, 2, 12, 12, 0x9a6a1a);
    g.box(-2, 3, 12, 1, 11, 12, trim);
    g.set(-1, 7, 13, 0xffffff);
    g.set(0, 7, 13, 0xffffff);
    // windows central
    for (const wx of [-11, -7, 5, 9]) for (const wy of [6, 16, 25]) {
      g.box(wx, wy, 12, wx + 2, wy + 5, 12, trim);
      g.box(wx, wy + 1, 12, wx + 2, wy + 4, 12, win, true);
    }
    // panther emblem on top
    g.box(-3, 41, -2, 2, 46, -2, trim);
    g.box(-2, 42, -1, -1, 43, -1, 0x29b6f6);
    g.box(0, 42, -1, 1, 43, -1, 0x29b6f6);
    g.box(-1, 41, -1, 0, 41, -1, 0xff2e88);
    return g;
  });
}

export function makeLabBuilding() {
  return mesh('labBuilding', 0.25, () => {
    const g = new VoxGrid();
    const wall = 0xeef4fb, blue = 0x29b6f6, dark = 0x1c2558;
    g.box(-22, 0, -12, 21, 1, 11, 0xc8d2e0);
    g.shell(-20, 2, -10, 19, 20, 9, wall);
    g.paint((x, y, z, c) => (c === wall && y % 6 === 0 ? 0xd8e4f0 : undefined));
    g.box(-21, 21, -11, 20, 22, 10, blue);
    g.box(-21, 20, 10, 20, 20, 10, blue, true);
    // dome
    g.ellipsoid(0, 23, -1, 12, 8, 8, 0xbfe8ff);
    g.carve((x, y) => y < 23);
    g.paint((x, y, z, c) => (c === 0xbfe8ff && (x + y) % 5 === 0 ? 0xffffff : undefined));
    // big door + glow frame
    g.box(-5, 2, 10, 4, 14, 10, blue, true);
    g.box(-4, 2, 10, 3, 13, 10, dark);
    g.box(-1, 2, 10, 0, 13, 10, 0x0d1029);
    // windows
    for (const wx of [-17, -11, 7, 13]) {
      g.box(wx, 7, 10, wx + 3, 14, 10, dark);
      g.box(wx, 8, 10, wx + 3, 13, 10, 0x7fe8ff, true);
    }
    // panther logo above door
    g.box(-4, 15, 10, 3, 19, 10, 0xffffff);
    g.box(-3, 16, 11, -1, 18, 11, blue);
    g.box(0, 16, 11, 2, 18, 11, blue);
    g.box(-1, 15, 11, 0, 15, 11, 0xff2e88);
    // antennas / tanks
    g.cylinder(-15, -5, 23, 30, 2, 0x9aa2b4);
    g.cylinder(-15, -5, 31, 31, 2, 0x7cff3a, 'y', true);
    g.box(15, 23, -4, 15, 34, -4, 0x5d6476);
    g.box(14, 35, -5, 16, 35, -3, 0xff2e88, true);
    return g;
  });
}

export function makeTechnoTower() {
  return mesh('technoTower', 0.25, () => {
    const g = new VoxGrid();
    const metal = 0x3a4458, dark = 0x232a3a, cyan = 0x5ce1e6;
    g.box(-12, 0, -12, 11, 6, 11, dark);
    g.box(-12, 6, -12, 11, 6, 11, cyan, true);
    g.box(-8, 7, -8, 7, 60, 7, metal);
    g.carve((x, y, z) => y > 7 && Math.abs(x + 0.5) > 6.5 && Math.abs(z + 0.5) > 6.5);
    for (let y = 10; y < 60; y += 7) g.box(-8, y, -8, 7, y, 7, cyan, true);
    g.paint((x, y, z, c) => (c === metal && (z === 7 || x === 7) && y % 7 > 2 && (x + z) % 3 === 0 ? 0x9ff2ff : undefined));
    g.box(-5, 61, -5, 4, 64, 4, dark);
    g.box(0, 65, 0, 0, 78, 0, 0x9aa2b4);
    g.box(-1, 79, -1, 1, 80, 1, 0xff2e88, true);
    // door
    g.box(-3, 0, 12, 2, 5, 12, cyan, true);
    g.box(-2, 0, 12, 1, 4, 12, 0x0d1029);
    return g;
  });
}

export function makeReactor() {
  const root = new THREE.Group();
  const tower = mesh('coolingTower', 0.25, () => {
    const g = new VoxGrid();
    for (let y = 0; y < 44; y++) {
      const t = y / 44;
      const r = 13 - Math.sin(t * Math.PI * 0.85) * 5.5;
      g.cylinder(0, 0, y, y, r, y % 8 < 1 ? 0xa8acb6 : 0xc4c8d0);
      if (y > 1) g.cylinder(0, 0, y, y, r - 1.6, null);
    }
    g.cylinder(0, 0, 43, 43, 8.6, 0x7cff3a, 'y', true);
    g.cylinder(0, 0, 43, 43, 7.2, null);
    g.box(-13, 0, -1, 13, 3, 0, 0xffd23f);
    return g;
  });
  const t2 = tower.clone();
  tower.position.set(-5, 0, -2);
  t2.position.set(4.5, 0, -4);
  t2.scale.setScalar(0.85);
  const dome = mesh('reactorDome', 0.25, () => {
    const g = new VoxGrid();
    g.box(-12, 0, -10, 11, 10, 9, 0x8a93a8);
    g.box(-12, 1, 10, 11, 2, 10, 0xffd23f);
    g.paint((x, y, z, c) => (y === 2 && z === 10 && x % 4 < 2 ? 0x2a2a30 : undefined));
    g.ellipsoid(0, 10, 0, 10, 9, 9, 0xdfe4ec);
    g.carve((x, y) => y < 10 && false);
    g.box(-2, 17, 9, 1, 19, 9, 0x7cff3a, true);
    g.box(-4, 0, 10, 3, 7, 10, 0x2a2a30);
    g.box(-3, 1, 10, 2, 6, 10, 0x7cff3a, true);
    return g;
  });
  dome.position.set(0, 0, 4);
  root.add(tower, t2, dome);
  root.userData.vents = [new THREE.Vector3(-5, 11, -2), new THREE.Vector3(4.5, 9.4, -4)];
  return root;
}

export function makeFactory() {
  const root = new THREE.Group();
  const body = mesh('factory', 0.25, () => {
    const g = new VoxGrid();
    const brick = 0xa0503a, brickD = 0x8a4030, choco = 0x5a3220;
    g.box(-24, 0, -12, 23, 22, 11, brick);
    g.paint((x, y, z, c) => (c === brick && (y % 3 === 0 || (x + (y % 6 < 3 ? 0 : 2)) % 4 === 0) ? brickD : undefined));
    // saw-tooth roof
    for (let s = -24; s < 24; s += 8) for (let k = 0; k < 6; k++) g.box(s + k, 23 + k, -12, s + k, 23 + k, 11, k === 5 ? 0x7fd0f5 : 0x6a3a2a);
    for (const [cx, cz, h] of [[-16, -6, 46], [-6, -6, 52], [16, -4, 42]]) {
      g.cylinder(cx, cz, 23, h, 2.5, brickD);
      g.cylinder(cx, cz, h - 2, h, 3, 0x3a2a2a);
      g.cylinder(cx, cz, h - 1, h, 1.5, null);
    }
    // windows & door
    for (let wx = -21; wx < 21; wx += 7) {
      g.box(wx, 10, 12, wx + 3, 15, 12, 0x3a2a2a);
      g.box(wx, 11, 12, wx + 3, 14, 12, 0xffd88a, true);
    }
    g.box(-5, 0, 12, 4, 8, 12, 0x5a3220);
    g.box(-4, 0, 12, 3, 7, 12, 0x3a2010);
    // chocolate pipe
    g.cylinder(-12, 10, 24, 26, 1.5, choco, 'x');
    g.box(23, 4, 3, 30, 6, 6, choco);
    g.box(-30, 16, -3, -24, 18, 0, choco);
    // golden ticket sign
    g.box(-8, 18, 12, 7, 22, 12, 0xffd23f);
    g.box(-7, 19, 13, 6, 21, 13, 0xffe27a);
    return g;
  });
  root.add(body);
  root.userData.chimneys = [new THREE.Vector3(-4, 13, -1.5), new THREE.Vector3(-1.5, 13.5, -1.5), new THREE.Vector3(4, 11, -1)];
  return root;
}

// ---------------------------------------------------------------------------
// Special

export function makeTrophyPodium() {
  return mesh('podium', 0.1, () => {
    const g = new VoxGrid();
    g.box(-6, 0, -6, 5, 4, 5, 0xe8e2d4);
    g.box(-5, 5, -5, 4, 9, 4, 0xf6f2ea);
    g.box(-5, 9, -5, 4, 9, 4, 0xffd23f);
    // trophy cup
    const gold = 0xffd23f;
    g.box(-2, 10, -2, 1, 10, 1, 0xe0a21a);
    g.box(-1, 11, -1, 0, 13, 0, gold);
    g.box(-3, 14, -3, 2, 19, 2, gold);
    g.box(-2, 15, -2, 1, 19, 1, null);
    g.box(-5, 16, -1, -4, 18, 0, gold);
    g.box(3, 16, -1, 4, 18, 0, gold);
    g.set(-1, 17, 3, 0xffffff);
    return g;
  });
}

/** Swirling portal: arch + animated vortex. */
export function makePortal(color = 0xb05cff) {
  const root = new THREE.Group();
  const frame = mesh('portal' + color, 0.2, () => {
    const g = new VoxGrid();
    const stone = 0x5a628a, stoneL = 0x6c74a0;
    for (let a = 0; a <= 40; a++) {
      const t = (a / 40) * Math.PI;
      const x = Math.round(Math.cos(t) * 10), y = Math.round(Math.sin(t) * 10) + 10;
      g.box(x - 1, y - 1, -1, x + 1, y + 1, 1, a % 4 < 2 ? stone : stoneL);
    }
    g.box(-11, 0, -2, -9, 10, 2, stone);
    g.box(9, 0, -2, 11, 10, 2, stone);
    g.box(-13, 0, -3, -8, 1, 3, 0x454c70);
    g.box(8, 0, -3, 13, 1, 3, 0x454c70);
    for (let y = 2; y < 18; y += 4) {
      g.set(-10, y, 2, color, true);
      g.set(10, y, 2, color, true);
    }
    g.box(-1, 20, 1, 0, 21, 2, 0xffd23f, true);
    return g;
  });
  root.add(frame);
  const vortex = makeVortex(color, 3.7);
  vortex.position.set(0, 2.05, 0);
  root.add(vortex);
  return {
    root,
    update(dt) {
      vortex.rotation.z -= dt * 2.2;
      vortex.userData.inner.rotation.z += dt * 3.4;
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.04;
      vortex.scale.set(s, s, 1);
    },
  };
}

const vortexTex = {};
function swirlTexture(color) {
  if (vortexTex[color]) return vortexTex[color];
  const S = 48;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(color);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5;
      const r = Math.hypot(dx, dy) / (S / 2);
      if (r > 1) continue;
      const a = Math.atan2(dy, dx);
      const v = Math.sin(a * 3 + r * 9);
      const k = v > 0.3 ? 1 : v > -0.2 ? 0.65 : 0.4;
      const w = r < 0.25 ? 1 - r * 2 : 0;
      const R = Math.min(255, (col.r * k + w) * 255), G = Math.min(255, (col.g * k + w) * 255), B = Math.min(255, (col.b * k + w) * 255);
      ctx.fillStyle = `rgba(${R | 0},${G | 0},${B | 0},${r > 0.92 ? 0.6 : 0.92})`;
      ctx.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  vortexTex[color] = t;
  return t;
}
export function makeVortex(color, size) {
  const tex = swirlTexture(color);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const outer = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 24), mat);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(size / 3.2, 20), mat);
  inner.position.z = 0.02;
  outer.add(inner);
  outer.userData.inner = inner;
  outer.userData.noBake = true;
  return outer;
}

export function makeBossGate(color = 0xff4a4a) {
  const root = new THREE.Group();
  const frame = mesh('bossGate' + color, 0.2, () => {
    const g = new VoxGrid();
    const obs = 0x2a2238, obsL = 0x3a3050;
    g.box(-13, 0, -2, -9, 22, 2, obs);
    g.box(9, 0, -2, 13, 22, 2, obs);
    g.box(-13, 22, -2, 13, 26, 2, obsL);
    for (let x = -13; x <= 13; x += 4) g.box(x, 27, 0, x + 1, 30 + ((x / 4) & 1) * 2, 1, obs);
    g.paint((x, y, z, c) => (c === obs && (x + y) % 5 === 0 ? obsL : undefined));
    // skull
    g.box(-3, 23, 3, 2, 28, 4, 0xf4f0e6);
    g.box(-2, 22, 3, 1, 22, 4, 0xf4f0e6);
    g.box(-2, 25, 5, -1, 26, 5, color, true);
    g.box(0, 25, 5, 1, 26, 5, color, true);
    g.set(-1, 23, 5, 0x15121f);
    g.set(0, 23, 5, 0x15121f);
    // runes
    for (let y = 3; y < 21; y += 4) {
      g.set(-11, y, 3, color, true);
      g.set(10, y, 3, color, true);
    }
    // chains
    for (let y = 2; y < 20; y += 2) {
      g.set(-14, y, 0, 0x8a93b8);
      g.set(14, y, 0, 0x8a93b8);
    }
    return g;
  });
  root.add(frame);
  const vortex = makeVortex(color, 3.6);
  vortex.scale.y = 1.15;
  vortex.position.set(0, 2.2, 0);
  root.add(vortex);
  return {
    root,
    update(dt) {
      vortex.rotation.z += dt * 1.6;
      vortex.userData.inner.rotation.z -= dt * 2.6;
    },
  };
}

// ---------------------------------------------------------------------------
// Grocery

export function makeCart() {
  const root = new THREE.Group();
  const body = mesh('cart', 0.1, () => {
    const g = new VoxGrid();
    const wire = 0xc8ccd8, wireD = 0x9aa2b4, red = 0xe8343c;
    // basket: x -4..3, z -6..5, y 4..10
    for (let x = -4; x <= 3; x++)
      for (let y = 4; y <= 10; y++)
        for (let z = -6; z <= 5; z++) {
          const edge = x === -4 || x === 3 || z === -6 || z === 5 || y === 4;
          if (!edge) continue;
          const grid = (x + z) % 2 === 0 || y % 3 === 1 || y === 10;
          if (grid || y === 4) g.set(x, y, z, y === 10 ? wire : grid ? wire : wireD);
        }
    // frame + wheels
    g.box(-4, 2, -6, -4, 3, 5, wireD);
    g.box(3, 2, -6, 3, 3, 5, wireD);
    g.box(-4, 1, -6, 3, 1, -6, wireD);
    g.box(-4, 1, 5, 3, 1, 5, wireD);
    // handle (back = -z)
    g.box(-4, 10, -8, 3, 11, -8, red);
    g.box(-4, 9, -7, -4, 11, -7, wireD);
    g.box(3, 9, -7, 3, 11, -7, wireD);
    // child seat flap
    g.box(-3, 8, -5, 2, 8, -3, red);
    return g;
  });
  root.add(body);
  const wheels = [];
  const wg = cachedGeometry('arena:wheel', () => new VoxGrid().box(0, 0, -1, 0, 1, 0, 0x2a2a30), { scale: 0.1 });
  for (const [x, z] of [[-0.35, -0.5], [0.3, -0.5], [-0.35, 0.45], [0.3, 0.45]]) {
    const w = makeMesh(wg);
    w.position.set(x, 0, z);
    root.add(w);
    wheels.push(w);
  }
  return { root, wheels, body };
}

export function makeCheckout() {
  return mesh('checkout', 0.1, () => {
    const g = new VoxGrid();
    g.box(-6, 0, -14, 5, 8, 13, 0xf2f2ee);
    g.box(-6, 9, -14, 5, 9, 13, 0x2a2a30);
    g.paint((x, y, z, c) => (y === 9 && z % 3 === 0 ? 0x3a3a44 : undefined));
    g.box(-6, 0, 14, 5, 1, 14, 0xff4fa3);
    g.box(-7, 3, -14, -7, 6, 13, 0xff4fa3);
    // register
    g.box(-4, 10, 8, 1, 12, 12, 0x3a4050);
    g.box(-3, 13, 10, 0, 16, 10, 0x2a2f3c);
    g.box(-2, 14, 11, -1, 15, 11, 0x7fe8ff, true);
    // lane light
    g.box(5, 9, -14, 5, 26, -14, 0x8a93b8);
    g.box(4, 26, -15, 6, 29, -13, 0xff4fa3, true);
    // candy rack
    g.box(6, 0, 2, 8, 12, 12, 0x5d6476);
    g.paint((x, y, z, c) => (x === 8 && y > 1 && y < 12 && y % 3 !== 0 && z > 2 && z < 12 ? [0xff4fa3, 0xffd23f, 0x29b6f6, 0x5fdc4a][(z + y) % 4] : undefined));
    return g;
  });
}

export function makeFreezer() {
  return mesh('freezer', 0.1, () => {
    const g = new VoxGrid();
    g.box(-12, 0, -4, 11, 22, 3, 0xf4f6fb);
    g.box(-11, 2, 4, 10, 19, 4, 0x9ff2ff, true);
    for (const x of [-4, 3]) g.box(x, 2, 4, x, 19, 4, 0xdfe4ec);
    g.box(-12, 20, 4, 11, 22, 4, 0x29b6f6, true);
    // frozen goods silhouettes
    g.paint((x, y, z, c) => (z === 4 && c === 0x9ff2ff && y % 6 < 2 && x % 3 !== 0 ? [0xffffff, 0xff9ad0, 0xbfe8ff][(x + 30) % 3] : undefined));
    return g;
  });
}

export function makeProduceStand() {
  return mesh('produce', 0.1, () => {
    const g = new VoxGrid();
    const fruits = [0xe8343c, 0xffd23f, 0x5fdc4a, 0xff8a2a, 0xb05cff, 0x7ac74f];
    g.box(-15, 0, -8, 14, 4, 7, 0xa06a3c);
    for (let r = 0; r < 3; r++) {
      const z0 = -8 + r * 5, y = 5 + (2 - r) * 3;
      g.box(-15, 5, z0, 14, y, z0 + 4, 0xb07a48);
      for (let x = -14; x <= 13; x++)
        for (let z = z0; z <= z0 + 4; z++) {
          const c = fruits[(Math.floor((x + 15) / 5) + r * 2) % fruits.length];
          g.set(x, y + 1, z, hash3(x, r, z) < 0.15 ? shade(c, -0.2) : c);
          if ((x + z) % 2 === 0) g.set(x, y + 2, z, c);
        }
      g.box(-15, y - 1, z0 + 4, 14, y, z0 + 4, 0x8a5a30);
    }
    // awning poles
    for (const x of [-15, 14]) g.box(x, 0, 8, x, 22, 8, 0xffffff);
    g.box(-16, 22, -9, 15, 23, 9, 0x5fdc4a);
    g.paint((x, y, z, c) => (y >= 22 && y <= 23 && Math.floor((x + 16) / 3) % 2 === 0 ? 0xffffff : undefined));
    return g;
  });
}

export function makeAisleSign(color = 0x29b6f6) {
  return mesh('aisleSign' + color, 0.1, () => {
    const g = new VoxGrid();
    g.box(-10, 0, 0, 9, 6, 0, color);
    g.box(-10, 0, 0, 9, 0, 0, shade(color, -0.25));
    g.box(-8, 2, 1, 7, 4, 1, 0xffffff);
    g.box(-7, 7, 0, -7, 14, 0, 0x5d6476);
    g.box(6, 7, 0, 6, 14, 0, 0x5d6476);
    return g;
  });
}

export function makeCartCorral() {
  return mesh('corral', 0.1, () => {
    const g = new VoxGrid();
    const rail = 0xc8ccd8;
    for (const x of [-9, 8]) {
      g.box(x, 0, -14, x, 9, -14, 0x8a93b8);
      g.box(x, 0, 14, x, 9, 14, 0x8a93b8);
      g.box(x, 9, -14, x, 9, 14, rail);
      g.box(x, 5, -14, x, 5, 14, rail);
    }
    g.box(-9, 9, -14, 8, 9, -14, rail);
    g.box(-9, 9, -14, -9, 20, -14, 0x8a93b8);
    g.box(-14, 16, -14, -4, 22, -14, 0x29b6f6);
    g.box(-13, 18, -13, -5, 19, -13, 0xffffff);
    return g;
  });
}

const FOOD = {
  burger: (g) => {
    g.ellipsoid(0, 3, 0, 9, 3, 9, 0xd99a4a);
    g.carve((x, y) => y > 4 && false);
    g.cylinder(0, 0, 6, 7, 10, 0x6a3a1e);
    g.cylinder(0, 0, 8, 8, 10.5, 0x5fdc4a);
    g.cylinder(0, 0, 9, 9, 10, 0xffd23f);
    g.cylinder(0, 0, 10, 10, 9.8, 0xe8343c);
    g.ellipsoid(0, 13, 0, 9.5, 5, 9.5, 0xe8a04a);
    g.carve((x, y) => y < 0);
    g.paint((x, y, z, c) => (c === 0xe8a04a && y > 15 && hash3(x, y, z) < 0.1 ? 0xfff2c8 : undefined));
  },
  donut: (g) => {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      g.sphere(Math.cos(t) * 8, 4, Math.sin(t) * 8, 4, 0xe0a050);
    }
    g.paint((x, y, z) => (y >= 5 ? (hash3(x, y, z) < 0.12 ? [0xffffff, 0x29b6f6, 0xffd23f, 0x5fdc4a][Math.floor(hash3(z, x, y) * 4)] : 0xff6fae) : undefined));
  },
  soda: (g) => {
    g.cylinder(0, 0, 0, 22, 6, 0xe8343c);
    g.paint((x, y, z, c) => (y > 8 && y < 14 && c === 0xe8343c ? 0xffffff : y < 1 || y > 20 ? 0xc8ccd8 : undefined));
    g.cylinder(0, 0, 23, 23, 5, 0xc8ccd8);
    g.box(-1, 24, 0, 1, 24, 2, 0x9aa2b4);
    g.box(2, 23, -1, 2, 32, -1, 0xffffff);
    g.box(2, 32, -1, 2, 32, -3, 0xffffff);
  },
  choco: (g) => {
    g.box(-12, 0, -4, 11, 30, 3, 0x6a3a22);
    for (let x = -11; x < 11; x += 6) for (let y = 1; y < 18; y += 6) g.box(x, y, 4, x + 4, y + 4, 4, 0x7d4a2d);
    g.box(-12, 18, -5, 11, 30, 4, 0x1d9bf0);
    g.box(-12, 23, 5, 11, 25, 5, 0xffffff);
    g.box(-12, 28, -5, 11, 30, 4, 0xffd23f);
  },
  pizza: (g) => {
    for (let z = 0; z < 22; z++) {
      const w = Math.round(z * 0.55);
      g.box(-w, 0, -z, w, 1, -z, 0xffd23f);
      if (z > 20) g.box(-w, 0, -z, w, 3, -z, 0xd99a4a);
    }
    g.paint((x, y, z, c) => (c === 0xffd23f && hash3(x, y, z) < 0.12 ? 0xc8202a : undefined));
  },
  hotdog: (g) => {
    g.box(-12, 0, -3, 11, 3, 2, 0xe8a04a);
    g.cylinder(0, 0, -14, 13, 2.2, 0xc8402a, 'x');
    g.box(-10, 5, 0, 9, 5, 0, 0xffd23f);
    g.box(-12, 0, -4, 11, 4, -4, 0xd99040);
    g.box(-12, 0, 3, 11, 4, 3, 0xd99040);
  },
  icecream: (g) => {
    for (let y = 0; y < 14; y++) g.cylinder(0, 0, y, y, 0.6 + y * 0.32, (y + (y >> 1)) % 3 === 0 ? 0xc08a52 : 0xe0a868);
    g.sphere(0, 17, 0, 5, 0xff9ad0);
    g.sphere(0, 22, 0, 4, 0xfff2e0);
    g.set(0, 27, 0, 0xe8343c);
  },
  fries: (g) => {
    g.box(-5, 0, -3, 4, 10, 2, 0xe8343c);
    g.box(-1, 4, 3, 0, 7, 3, 0xffd23f);
    for (let i = 0; i < 12; i++) {
      const x = -4 + (i % 5) * 2, z = -2 + Math.floor(i / 5) * 2;
      g.box(x, 10, z, x, 14 + (i % 3) * 2, z, 0xffd23f);
    }
  },
  apple: (g) => {
    g.sphere(0, 5, 0, 5, 0xe8343c);
    g.box(0, 10, 0, 0, 12, 0, 0x7a4a2a);
    g.box(1, 11, 0, 3, 11, 0, 0x5fdc4a);
  },
  banana: (g) => {
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      g.sphere(-7 + i, 2 + Math.sin(t * Math.PI) * 4, 0, 1.8, 0xffd23f);
    }
    g.box(-8, 2, 0, -8, 3, 0, 0x5a3a20);
  },
  bar: (g) => FOOD.choco(g),
  chocoBar: (g) => FOOD.choco(g),
  cake: (g) => FOOD.icecream(g),
  milk: (g) => FOOD.soda(g),
  watermelon: (g) => {
    g.ellipsoid(0, 6, 0, 9, 6, 6, 0x3f9e45);
    g.paint((x, y, z, c) => ((x + 20) % 4 < 2 ? 0x2f7f35 : undefined));
    g.carve((x, y) => y < 0);
  },
  cereal: (g) => FOOD.choco(g),
};

export function makeFood(kind = 'burger') {
  const f = FOOD[kind] || FOOD.burger;
  return mesh('food:' + kind, 0.1, () => {
    const g = new VoxGrid();
    f(g);
    return g;
  });
}

// ---------------------------------------------------------------------------
// Fallback products & shelves (mart builds its own instanced version; this is the
// simple non-instanced variant matching props.js's planned signature).

export function makeShelf({ length = 4, kind = 'snacks' } = {}) {
  const root = new THREE.Group();
  const body = mesh('shelf' + length, 0.1, () => {
    const g = new VoxGrid();
    const L = Math.round(length * 10);
    g.box(0, 0, -4, L - 1, 1, 3, 0x8a93b8);
    g.box(0, 2, -1, L - 1, 17, 0, 0xc8ccd8);
    for (const y of [6, 11, 16]) g.box(0, y, -4, L - 1, y, 3, 0xdfe4ec);
    g.box(0, 0, -4, 0, 17, 3, 0x8a93b8);
    g.box(L - 1, 0, -4, L - 1, 17, 3, 0x8a93b8);
    return g;
  }, { pivot: [Math.round(length * 10) / 2, 0, 0] });
  root.add(body);
  root.userData.kind = kind;
  return { root, items: [] };
}

export function makeGoldenStatue() {
  const root = new THREE.Group();
  const ped = mesh('statuePedestal', 0.1, () => {
    const g = new VoxGrid();
    g.box(-7, 0, -7, 6, 2, 6, 0xe8e2d4);
    g.box(-6, 3, -6, 5, 7, 5, 0xf6f2ea);
    g.box(-6, 8, -6, 5, 8, 5, 0xffd23f);
    return g;
  });
  root.add(ped);
  const cat = mesh('goldPantherVox', 0.1, () => {
    const g = new VoxGrid();
    const G = 0xffd23f, D = 0xe0a21a;
    g.box(-3, 4, -6, 2, 9, 4, G); // body
    g.box(-3, 8, 3, 2, 14, 8, G); // head
    g.box(-3, 15, 6, -2, 16, 7, D);
    g.box(1, 15, 6, 2, 16, 7, D); // ears
    g.box(-2, 11, 9, -1, 12, 9, 0xffffff, true);
    g.box(0, 11, 9, 1, 12, 9, 0xffffff, true);
    for (const [x, z] of [[-3, -5], [1, -5], [-3, 2], [1, 2]]) g.box(x, 0, z, x + 1, 3, z + 1, D);
    g.box(-1, 7, -9, 0, 8, -7, D);
    g.box(-1, 9, -10, 0, 12, -9, D); // tail
    return g;
  });
  cat.material = variantMaterials('gold');
  cat.position.y = 0.9;
  root.add(cat);
  return root;
}
