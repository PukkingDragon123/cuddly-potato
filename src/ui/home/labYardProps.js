// Pure builders for the LAB tab's lab compound (labYard.js): the yard floor
// (a pixel-art concrete texture), the hangar behind the base, chain-link fences,
// floodlight towers, crates, goo barrels and traffic cones. Everything here
// stands still and gets merged into a few draws by core/staticBatch.js.
import * as THREE from 'three';
import { VoxGrid, makeMesh } from '../../core/voxel.js';
import { rbox, cyl } from '../../models/kit.js';
import { PAL, pixelTex } from '../../models/props/common.js';

const INK = PAL.ink;
const STEEL = 0x8f98aa, STEEL_L = 0xc9d1dd, STEEL_D = 0x5a6274, STEEL_DD = 0x3d4352;

/** Yard extents (world units). The base stands at the origin. */
export const YARD = { x0: -16, x1: 16, z0: -9, z1: 9, wallZ: -7.2, fenceZ: -4.6 };

// --------------------------------------------------------------------------- floor

function floorTex() {
  return pixelTex('yardFloor', 256, 144, (g, W, H) => {
    // concrete slabs (16 px = 1 m) with seams, grime and patches
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const v = 92 + Math.floor(Math.abs(n) * 10);
        g.fillStyle = `rgb(${v},${v + 4},${v + 14})`;
        g.fillRect(x, y, 1, 1);
      }
    g.fillStyle = 'rgba(30,34,48,0.55)';
    for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 16) g.fillRect(0, y, W, 1);
    // oil stains (pixel blobs)
    g.fillStyle = 'rgba(20,20,30,0.25)';
    for (const [x, y, s] of [[40, 30, 5], [200, 110, 7], [170, 40, 4], [60, 120, 6], [228, 70, 3]]) {
      for (let i = -s; i <= s; i++) for (let j = -s; j <= s; j++) if (i * i + j * j * 1.6 < s * s && ((i + j) & 1 || i * i + j * j < s * s * 0.4)) g.fillRect(x + i, y + j, 1, 1);
    }
    // the base zone: hazard border around the middle (base footprint ~8 x 5.5 m)
    const bx = 128 - 70, by = 72 - 46, bw = 140, bh = 84;
    for (let i = 0; i < bw; i++) for (let k = 0; k < 3; k++) {
      const c = ((i + k) >> 2) & 1 ? '#ffd23f' : '#1a1820';
      g.fillStyle = c; g.fillRect(bx + i, by + k, 1, 1); g.fillRect(bx + i, by + bh - 1 - k, 1, 1);
    }
    for (let j = 0; j < bh; j++) for (let k = 0; k < 3; k++) {
      const c = ((j + k) >> 2) & 1 ? '#ffd23f' : '#1a1820';
      g.fillStyle = c; g.fillRect(bx + k, by + j, 1, 1); g.fillRect(bx + bw - 1 - k, by + j, 1, 1);
    }
    // darker steel deck inside the zone
    g.fillStyle = 'rgba(40,46,70,0.45)';
    g.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
    g.fillStyle = 'rgba(160,180,220,0.18)';
    for (let x = bx + 3; x < bx + bw - 3; x += 8) g.fillRect(x, by + 3, 1, bh - 6);
    // lane exit arrows (to the right, where battles happen)
    g.fillStyle = '#e8eef8';
    for (const ax of [214, 234]) {
      const ay = 72;
      for (let i = 0; i < 8; i++) { g.fillRect(ax + i, ay - (7 - i), 2, 1); g.fillRect(ax + i, ay + (7 - i), 2, 1); }
      g.fillRect(ax - 8, ay - 1, 14, 3);
    }
    // painted parking bays on the left
    g.fillStyle = 'rgba(255,210,63,0.75)';
    for (let x = 6; x < 50; x += 14) g.fillRect(x, 96, 1, 34);
    g.fillRect(6, 130, 43, 1);
  });
}

export function floorMesh() {
  const tex = floorTex();
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const geo = new THREE.PlaneGeometry(YARD.x1 - YARD.x0, YARD.z1 - YARD.z0);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  m.name = 'yardFloor';
  return m;
}

// --------------------------------------------------------------------------- hangar (behind the base)

const VH = 0.2; // hangar voxel
export function hangarMesh() {
  const g = new VoxGrid();
  const W = 80, H = 34, D = 4; // 16 x 6.8 m
  for (let x = -W / 2; x < W / 2; x++)
    for (let y = 0; y < H; y++) {
      const rib = (x & 3) === 0;
      const band = y === 12 || y === 13;
      const top = y >= H - 2;
      const col = top ? 0x2a3046 : band ? 0x1d6fb0 : rib ? 0x4a5372 : (x + (y >> 3)) & 1 ? 0x5d6788 : 0x58628a;
      for (let z = -D; z <= 0; z++) if (z === 0 || z === -D || x === -W / 2 || x === W / 2 - 1 || y === H - 1) g.set(x, y, z, col);
    }
  // big rolling door in the middle, a bit open (warm light leaks out)
  for (let x = -14; x < 14; x++)
    for (let y = 0; y < 22; y++) {
      const slat = y % 2 === 0;
      if (y < 3) g.set(x, y, 0, 0xffc870, true);
      else g.set(x, y, 1, slat ? 0x9aa4bc : 0x8790a8);
    }
  for (let y = 0; y < 23; y++) { g.set(-15, y, 1, PAL.yellow); g.set(14, y, 1, PAL.yellow); g.set(-15, y, 2, INK); g.set(14, y, 2, INK); }
  for (let x = -15; x <= 14; x++) g.set(x, 23, 1, (x >> 1) & 1 ? PAL.yellow : INK);
  // window rows with warm and blue light
  for (const wx of [-36, -30, -24, 20, 26, 32])
    for (let y = 17; y <= 20; y++) for (let x = wx; x < wx + 4; x++) g.set(x, y, 1, y === 20 ? STEEL_DD : (wx + y) & 2 ? 0xffd27a : 0x7ae8ff, y !== 20);
  // roof vents
  for (const vx of [-30, -10, 12, 30]) { g.box(vx, H, -2, vx + 3, H + 2, 0, STEEL_D); g.box(vx, H + 3, -2, vx + 3, H + 3, 0, STEEL); }
  return makeMesh(g.build({ scale: VH, pivot: [0, 0, 0], maxSamples: 10 }));
}

// --------------------------------------------------------------------------- fences, floodlights, clutter

const VF = 0.1;
export function fenceMesh(len = 6) {
  const g = new VoxGrid();
  const L = Math.round(len / VF), H = 16;
  for (let x = 0; x <= L; x += 20) { g.box(x, 0, 0, x, H + 2, 0, STEEL); g.set(x, H + 3, 0, STEEL_D); }
  for (let x = 0; x <= L; x++) {
    g.set(x, H, 0, STEEL_L).set(x, 1, 0, STEEL);
    for (let y = 2; y < H; y++) if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) g.set(x, y, 0, 0x9ea8bc);
    if (x % 3 === 0) g.set(x, H + 2, 0, STEEL_D); // barbed wire
    if (x % 3 === 1) g.set(x, H + 1, 0, STEEL_D);
  }
  // a warning sign
  const sx = Math.round(L / 2) - 3;
  g.box(sx, 6, 1, sx + 6, 11, 1, PAL.yellow);
  g.box(sx + 1, 7, 2, sx + 5, 7, 2, INK).box(sx + 3, 8, 2, sx + 3, 10, 2, INK);
  return makeMesh(g.build({ scale: VF, pivot: [0, 0, 0], maxSamples: 10 }));
}

/** A floodlight tower; returns { mesh, lamp: [x, y, z] local (lamp head centre) }. */
export function floodTowerMesh(dir = 1) {
  const g = new VoxGrid();
  const H = 52;
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) g.box(x, 0, z, x, H, z, STEEL);
  for (let y = 2; y < H; y += 6) { g.line(-2, y, 2, 2, y + 3, 2, STEEL_D); g.line(2, y + 3, 2, -2, y + 6, 2, STEEL_D); g.line(-2, y, -2, -2, y + 3, 2, STEEL_D); }
  rbox(g, -4, H, -3, 4, H + 1, 3, 0, STEEL_DD);
  // lamp head: 2 x 3 lamps with glowing faces
  g.box(-5, H + 2, -1, 5, H + 9, 0, STEEL_D);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const lx = -4 + i * 3.5, ly = H + 3 + j * 3.5;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) g.set(Math.round(lx + a), Math.round(ly + b), 1, a === 1 && b === 1 ? 0xffffff : 0xfff2c0, true);
  }
  g.box(-1, 0, -1, 1, 1, 1, PAL.yellow);
  const mesh = makeMesh(g.build({ scale: VF, pivot: [0, 0, 0], maxSamples: 10 }));
  mesh.rotation.y = dir * 0.5;
  return { mesh, lamp: [0, (H + 6) * VF, 0.1] };
}

export function crateStackMesh() {
  const g = new VoxGrid();
  const crate = (x0, y0, z0, s, col) => {
    rbox(g, x0, y0, z0, x0 + s - 1, y0 + s - 1, z0 + s - 1, 0, (x, y, z) => ((x === x0 || x === x0 + s - 1) && (y === y0 || y === y0 + s - 1) ? 0x6e4224 : (x + y) % 5 === 0 ? 0x8a5a30 : col));
    for (let i = 1; i < s - 1; i++) g.set(x0 + i, y0 + i, z0 + s - 1 + 1, 0x6e4224);
  };
  crate(0, 0, 0, 7, 0xa0673a);
  crate(8, 0, 1, 6, 0xb07440);
  crate(3, 7, 0, 6, 0x9a6234);
  // a stencil bolt on the front crate
  for (const [x, y] of [[3, 5], [4, 4], [2, 3], [3, 3], [4, 3], [3, 2], [2, 1]]) g.set(x, y, 8, PAL.pink, true);
  return makeMesh(g.build({ scale: VF, pivot: [0, 0, 0], maxSamples: 10 }));
}

export function barrelsMesh() {
  const g = new VoxGrid();
  const barrel = (cx, cz, col, glow) => {
    cyl(g, 'y', cx, cz, 0, 8, 3, 3, (x, y) => (y === 2 || y === 6 ? 0x2a3040 : col));
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (x * x + z * z <= 5) g.set(cx + x, 9, cz + z, glow ?? STEEL_DD, !!glow && x * x + z * z <= 2);
  };
  barrel(0, 0, 0x2f9a3a, 0x7cff3a);
  barrel(7, 1, 0x1d6fb0);
  barrel(3, 6, 0x2f9a3a, 0x9dff3a);
  // hazard label
  for (let y = 3; y <= 5; y++) for (let x = -1; x <= 1; x++) g.set(x, y, 3, (x + y) & 1 ? PAL.yellow : INK);
  return makeMesh(g.build({ scale: VF, pivot: [0, 0, 0], maxSamples: 10 }));
}

export function conesMesh() {
  const g = new VoxGrid();
  const cone = (cx, cz) => {
    g.box(cx - 2, 0, cz - 2, cx + 2, 0, cz + 2, 0x2a2530);
    for (let y = 1; y <= 6; y++) {
      const r = Math.max(0, 2 - Math.floor(y / 3));
      g.box(cx - r, y, cz - r, cx + r, y, cz + r, y === 3 || y === 4 ? PAL.white : PAL.orange);
    }
  };
  cone(0, 0); cone(6, 2); cone(12, 0);
  return makeMesh(g.build({ scale: VF, pivot: [0, 0, 0], maxSamples: 10 }));
}

export function cableReelMesh() {
  const g = new VoxGrid();
  cyl(g, 'z', 6, 0, -3, 3, 6, 6, (x, y, z) => (Math.abs(z) === 3 ? 0x9a6234 : 0x1d1d28));
  cyl(g, 'z', 6, 0, -4, 4, 2, 2, 0x6e4224);
  g.line(6, 0, 4, 18, 0, 6, INK);
  return makeMesh(g.build({ scale: VF, pivot: [0, 0, 0], maxSamples: 10 }));
}

// --------------------------------------------------------------------------- sky

export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  // banded dusk gradient (pixel steps, no smooth blur)
  const bands = ['#0a0c22', '#0e1230', '#14183e', '#1c1f4c', '#27265a', '#352c66', '#4a3270', '#643a76', '#7e4478', '#9a5276'];
  const bh = c.height / bands.length;
  bands.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, Math.floor(i * bh), c.width, Math.ceil(bh)); });
  // dither between bands
  for (let i = 1; i < bands.length; i++) {
    g.fillStyle = bands[i];
    const y = Math.floor(i * bh);
    for (let x = 0; x < c.width; x += 2) g.fillRect(x + ((y >> 1) & 1), y - 1, 1, 1);
  }
  // pixel stars in the top half
  for (let i = 0; i < 60; i++) {
    const x = (i * 37) % 64, y = (i * 53) % 60;
    g.fillStyle = i % 7 === 0 ? '#ffffff' : i % 3 ? '#8a96d8' : '#c8d0ff';
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
