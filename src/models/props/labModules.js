// LAB MODULE models (src/data/labModules.js): voxel gear bolted onto your base,
// shown in the Lab tab yard and on the base in battle.
//
//   makeModule(id, { level, side }) -> { root, id, cat, update(dt), aim(x), fire(), muzzle, vents, height }
//   attachModules(base, loadout, { side, flip }) -> { root, mods, update(dt), aimAt(worldX), get(cat), setDamage(f), dispose() }
//   moduleSlot(base, cat) -> local [x, z] where a category's module stands next to a base
//
// Same voxel size as the base (0.08). Every module stands on its own little
// hazard-striped pad and faces +X (towards the enemy); the rival side is the
// mirror image (root scale.x = -1). Level 3+ adds an upgrade kit (extra parts and
// lights), level 5 gets gold trim. Geometry is cached per module + look + side.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { rbox, cyl, capsule } from '../kit.js';
import { PAL, mixHex, glassMat } from './common.js';
import { dishGrid } from './labParts.js';
import { MODULES } from '../../data/labModules.js';

const V = 0.08;
const GOLD = 0xffc21a, GOLD_L = 0xffe680, GOLD_D = 0xc8901a;
const STEEL = 0x8f98aa, STEEL_L = 0xc9d1dd, STEEL_D = 0x5a6274, STEEL_DD = 0x3d4352, INK = PAL.ink;
const CONCRETE = 0xd8d4cc, CONCRETE_D = 0xb8b2a6;
const COPPER = 0xd8803a, COPPER_D = 0xa85a24;
const TEAM = [
  { m: 0x29b6f6, md: 0x1477c9, ml: 0x8fe3ff, acc: 0xff2e88, accL: 0xff8ac0, glow: 0x7ae8ff },
  { m: 0xff3d55, md: 0xb8202e, ml: 0xffa0ac, acc: 0xffd23f, accL: 0xffe680, glow: 0xff8a6a },
];

/** Look tier from the module level: 0 = stock, 1 = upgrade kit (lv 3+), 2 = gold (lv 5). */
export const lookOf = (level) => (level >= 5 ? 2 : level >= 3 ? 1 : 0);

// ---------------------------------------------------------------------------
// shared brushes

/** A square pad with a hazard-striped rim (top at y = 1). */
function pad(g, r, P, o = {}) {
  rbox(g, -r, 0, -r, r, 1, r, 1, (x, y, z) => (y === 1 && (Math.abs(x) === r - 1 || Math.abs(z) === r - 1) ? (((x + z) >> 1) & 1 ? PAL.yellow : INK) : y === 0 ? STEEL_D : STEEL));
  // corner bolts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.set(sx * (r - 2), 2, sz * (r - 2), o.bolt ?? STEEL_L);
}
/** A little status light. */
const led = (g, x, y, z, col) => g.set(x, y, z, col, true);

/** Pixel art on a +Z face (rows top -> down). */
function artZ(g, art, x, y, z, pal, glow = false) {
  art.forEach((row, r) => [...row].forEach((ch, c) => {
    const col = pal[ch];
    if (col !== undefined) g.set(x + c, y - r, z, col, glow && ch === '*');
  }));
}
const TREFOIL = ['..###..', '.#####.', '##.#.##', '###.###', '#..#..#', '.#####.', '..###..'];
const SKULL = ['.###.', '#####', '#.#.#', '#####', '.#.#.'];

// ---------------------------------------------------------------------------
// builders: (P team palette, L look tier) -> { grid, parts: [{ name, grid, piv:[x,y,z] (voxels), anim, parent? }], muzzle, vents }
// Module origin: ground centre of the pad, +X faces the enemy, +Z the camera.

const B = {};

// ------------------------------------------------------------------ POWER CORE

B.potatoBattery = (P, L) => {
  const g = new VoxGrid();
  pad(g, 7, P);
  // wooden tray full of potatoes with copper / zinc nails
  rbox(g, -6, 2, -5, 1, 4, 5, 0, (x, y, z) => (y === 4 && (x === -6 || x === 1 || Math.abs(z) === 5) ? 0x6e4224 : 0x9a6234));
  const pot = [0xc8955a, 0xb88248, 0xd8a868];
  let k = 0;
  for (let x = -4; x <= 0; x += 3)
    for (let z = -3; z <= 3; z += 3) {
      const c = pot[k++ % 3];
      g.ellipsoid(x, 5.5, z, 1.4, 1, 1.2, c);
      g.set(x - 1, 6, z + 1, 0x8a6236);
      g.set(x, 7, z, k & 1 ? COPPER : STEEL_L).set(x, 8, z, k & 1 ? COPPER_D : STEEL);
    }
  // the battery cell
  const top = L ? 14 : 13;
  cyl(g, 'y', 4, 0, 2, top, 2.6, 2.6, (x, y) => (y >= top - 2 ? (L >= 2 ? GOLD : P.md) : y <= 3 ? INK : y === 7 || y === 8 ? (L >= 2 ? GOLD_L : PAL.white) : P.m));
  cyl(g, 'y', 4, 0, top + 1, top + 1, 1.2, 1.2, L >= 2 ? GOLD_L : STEEL_L);
  // + sign on the cell
  g.set(4, 11, 3, PAL.white).set(3, 11, 3, PAL.white).set(5, 11, 3, PAL.white).set(4, 10, 3, PAL.white).set(4, 12, 3, PAL.white);
  // wires
  g.line(0, 9, -1, 4, top + 2, 0, 0xe8343c);
  g.line(-3, 8, 2, 2, 5, 2, INK);
  if (L) {
    // upgrade kit: a second cell and a charge meter
    cyl(g, 'y', 4, -4, 2, 9, 1.6, 1.6, (x, y) => (y >= 8 ? (L >= 2 ? GOLD : P.md) : y === 5 ? PAL.white : P.m));
    g.line(4, 10, -4, 4, 12, -1, 0xe8343c);
  }
  const meter = new VoxGrid();
  meter.box(-6, 6, 6, -2, 9, 6, STEEL_DD);
  for (let i = 0; i < 4; i++) meter.set(-5 + i, 7, 7, i < 3 ? 0x7cff3a : PAL.yellow, true).set(-5 + i, 8, 7, i < 3 ? 0x7cff3a : PAL.yellow, true);
  g.box(-6, 2, 6, -2, 5, 6, STEEL_D);
  return { grid: g, parts: [{ name: 'meter', grid: meter, piv: [-4, 6, 6], anim: { type: 'blink', rate: 1.6, duty: 0.8 } }], muzzle: [4, top + 1, 0] };
};

B.hamsterDynamo = (P, L) => {
  const g = new VoxGrid();
  pad(g, 8, P);
  const HY = 12, R = 9;
  // A-frame stand behind the wheel + axle
  g.line(-6, 2, -5, 0, HY, -5, STEEL_D, 0).line(6, 2, -5, 0, HY, -5, STEEL_D, 0);
  g.line(-6, 2, -6, 0, HY, -6, STEEL, 0).line(6, 2, -6, 0, HY, -6, STEEL, 0);
  g.box(0, HY, -6, 0, HY, -4, STEEL_DD);
  // generator box at the back with a cable to the axle
  rbox(g, -8, 2, -7, -4, 8, -2, 1, P.md);
  g.box(-8, 9, -6, -4, 9, -3, STEEL_D);
  led(g, -6, 10, -4, PAL.yellow);
  for (let i = 0; i < 3; i++) led(g, -7 + i * 2, 6, -1, 0x7cff3a);
  g.line(-4, 6, -4, -1, HY - 1, -4, INK);
  if (L) {
    // upgrade kit: a bulb rack and a second generator
    g.box(5, 2, -7, 8, 7, -3, P.md);
    for (let x = 5; x <= 8; x++) led(g, x, 8, -5, x & 1 ? PAL.yellow : PAL.white);
  }
  // the wheel (spins): rim with rungs, spokes on the back face
  const wheel = new VoxGrid();
  const rim = L >= 2 ? GOLD : P.m, rimD = L >= 2 ? GOLD_D : P.md;
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    const x = Math.round(Math.cos(t) * R), y = Math.round(HY + Math.sin(t) * R);
    for (let z = -3; z <= 3; z++) wheel.set(x, y, z, z === -3 || z === 3 ? rim : a % 4 === 0 ? STEEL_L : rimD);
  }
  for (let s = 0; s < 6; s++) {
    const t = (s / 6) * Math.PI * 2;
    wheel.line(0, HY, -3, Math.round(Math.cos(t) * (R - 1)), Math.round(HY + Math.sin(t) * (R - 1)), -3, STEEL);
  }
  wheel.box(-1, HY - 1, -3, 1, HY + 1, -3, STEEL_DD);
  // Gerald the hamster, running at the bottom of the wheel
  const ham = new VoxGrid();
  const fur = 0xe8a050, belly = 0xfff1d6;
  ham.ellipsoid(0, 7, 0, 3.2, 2.4, 2.2, fur);
  ham.ellipsoid(0.5, 6, 0.5, 2.2, 1.4, 1.6, belly);
  ham.ellipsoid(3, 7.8, 0, 2, 1.8, 1.8, fur);
  ham.set(4.8, 7.6, 0, PAL.pinkL).set(4, 8.4, 1.6, INK).set(4, 8.4, -1.6, INK).set(4, 9.4, 1.6, belly);
  ham.set(2, 10, 1, fur).set(2, 10, -1, fur).set(2, 10.5, 1, PAL.pinkL);
  ham.set(-3.5, 7, 0, belly);
  for (const [x, z] of [[-2, 1], [-2, -1], [2, 1], [2, -1]]) ham.set(x, 4, z, PAL.pinkL);
  return {
    grid: g,
    parts: [
      { name: 'wheel', grid: wheel, piv: [0, HY, 0], anim: { type: 'spin', axis: 'z', speed: -4.2 } },
      { name: 'hamster', grid: ham, piv: [0, 4, 0], anim: { type: 'bob', freq: 16, amp: 0.6 } },
    ],
    muzzle: [0, HY, 0],
  };
};

B.solarPanels = (P, L) => {
  const g = new VoxGrid();
  pad(g, 8, P);
  g.box(0, 2, -1, 0, 9, -1, STEEL_D).box(-1, 2, -2, 1, 3, 0, STEEL);
  // inverter box
  rbox(g, 3, 2, -6, 7, 7, -3, 1, P.md);
  led(g, 5, 6, -2, 0x7cff3a);
  led(g, 6, 4, -2, PAL.yellow);
  const frame = L >= 2 ? GOLD : STEEL_L;
  const panelGrid = (w, d) => {
    const p = new VoxGrid();
    for (let x = -w; x <= w; x++)
      for (let z = -d; z <= d; z++) {
        const edge = Math.abs(x) === w || Math.abs(z) === d;
        const y = Math.round(-z * 0.55);
        const line = x % 3 === 0 || z % 3 === 0;
        p.set(x, y, z, edge ? frame : line ? 0x6f8fd8 : (x + z) & 1 ? 0x1d3a8a : 0x24469c);
        if (!edge && x % 6 === 2 && z % 4 === 1) p.set(x, y, z, 0xbfe0ff, true); // glints
      }
    return p;
  };
  const parts = [{ name: 'panel', grid: panelGrid(8, 5), piv: [0, 0, 0], at: [0, 10, -1], anim: { type: 'sway', axis: 'x', amp: 0.06, freq: 0.5 } }];
  if (L) {
    g.box(-6, 2, 4, -6, 5, 4, STEEL_D);
    const p2 = panelGrid(4, 3);
    parts.push({ name: 'panel2', grid: p2, piv: [0, 0, 0], at: [-6, 6, 4], anim: { type: 'sway', axis: 'x', amp: 0.06, freq: 0.5, phase: 1 } });
  }
  return { grid: g, parts, muzzle: [0, 12, 0] };
};

B.reactor = (P, L) => {
  const g = new VoxGrid();
  pad(g, 9, P);
  // cooling tower (hyperboloid shell) at the back
  const TX = -3, TZ = -3, TOP = 26;
  for (let y = 2; y <= TOP; y++) {
    const k = (y - 17) / 15;
    const r = 3.9 + 2.4 * k * k;
    const stripe = y >= TOP - 2 ? (y === TOP - 1 ? PAL.white : 0xe8343c) : null;
    for (let x = Math.floor(TX - r - 1); x <= Math.ceil(TX + r + 1); x++)
      for (let z = Math.floor(TZ - r - 1); z <= Math.ceil(TZ + r + 1); z++) {
        const d = Math.hypot(x - TX, z - TZ);
        if (d > r + 0.45 || d < r - 1.1) continue;
        g.set(x, y, z, stripe ?? ((y & 3) === 0 ? CONCRETE_D : CONCRETE));
      }
  }
  // radiation sign on the tower
  artZ(g, TREFOIL, TX - 3, 15, TZ + 6, { '#': PAL.yellow, '.': INK });
  // the reactor vessel with a glowing core window
  const VX = 4, VZ = 3;
  const trim = L >= 2 ? GOLD : STEEL_DD;
  cyl(g, 'y', VX, VZ, 2, 10, 3.6, 3.6, (x, y, z) => (y === 4 ? ((x + z) & 1 ? PAL.yellow : INK) : y === 10 || y === 2 ? trim : STEEL_L));
  g.ellipsoid(VX, 11, VZ, 3.4, 2.2, 3.4, STEEL);
  g.box(VX, 13, VZ, VX, 14, VZ, trim);
  for (let y = 6; y <= 8; y++) for (let x = VX - 1; x <= VX + 1; x++) g.set(x, y, VZ + 4, 0x7cff3a, true);
  g.set(VX - 2, 7, VZ + 4, STEEL_DD).set(VX + 2, 7, VZ + 4, STEEL_DD);
  // pipes from the vessel to the tower
  g.line(VX - 3, 8, VZ - 1, TX + 4, 8, TZ + 1, P.m, 0);
  g.line(VX - 3, 5, VZ - 2, TX + 4, 5, TZ, STEEL, 0);
  if (L) {
    // upgrade kit: a coolant tank and extra pipe
    cyl(g, 'y', 6, -5, 2, 9, 2, 2, (x, y) => (y >= 8 ? trim : P.m));
    g.line(6, 9, -3, VX, 9, VZ - 2, STEEL, 0);
    led(g, 6, 10, -5, 0x7cff3a);
  }
  const core = new VoxGrid();
  core.box(-1, -1, 0, 1, 1, 0, 0xd4ff9a, true);
  core.set(0, 0, 1, 0xffffff, true);
  return {
    grid: g,
    parts: [{ name: 'core', grid: core, piv: [0, 0, 0], at: [VX, 7, VZ + 5], anim: { type: 'pulse', freq: 5, amp: 0.25 } }],
    muzzle: [VX, 12, VZ], vents: [[TX, TOP + 1, TZ]],
  };
};

// ------------------------------------------------------------------ DEFENSE (heads yaw toward targets)

B.teslaCoil = (P, L) => {
  const g = new VoxGrid();
  pad(g, 6, P);
  rbox(g, -3, 2, -3, 3, 5, 3, 1, P.md);
  g.box(-3, 5, -3, 3, 5, 3, P.m);
  const top = L ? 20 : 17;
  for (let y = 6; y <= top; y++) {
    const coil = y % 2 === 0;
    cyl(g, 'y', 0, 0, y, y, coil ? 2 : 1.3, coil ? 2 : 1.3, coil ? (y % 4 === 0 ? COPPER : COPPER_D) : STEEL_DD);
  }
  // toroid
  const tor = L >= 2 ? GOLD : STEEL_L, torD = L >= 2 ? GOLD_D : STEEL;
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    const x = Math.round(Math.cos(t) * 4), z = Math.round(Math.sin(t) * 4);
    g.set(x, top + 1, z, tor).set(x, top + 2, z, torD);
  }
  g.box(-1, top + 1, -1, 1, top + 2, 1, STEEL_D);
  if (L) for (let a = 0; a < 32; a++) { const t = (a / 32) * Math.PI * 2; g.set(Math.round(Math.cos(t) * 3), 12, Math.round(Math.sin(t) * 3), tor); }
  led(g, 0, 4, 4, P.glow);
  const ball = new VoxGrid();
  ball.sphere(0, 0, 0, 1.8, 0xbff6ff, true);
  ball.set(0, 0, 2, 0xffffff, true);
  return { grid: g, parts: [{ name: 'ball', grid: ball, piv: [0, 0, 0], at: [0, top + 4, 0], anim: { type: 'pulse', freq: 9, amp: 0.18 } }], muzzle: [0, top + 4, 0] };
};

B.gooCannon = (P, L) => {
  const g = new VoxGrid();
  pad(g, 7, P);
  cyl(g, 'y', 0, 0, 2, 4, 5, 5, (x, y) => (y === 4 ? STEEL_L : STEEL_D));
  const head = new VoxGrid();
  const trim = L >= 2 ? GOLD : STEEL_DD;
  rbox(head, -4, 5, -3, 2, 10, 3, 1, P.m);
  head.box(-4, 10, -3, 2, 10, 3, P.md);
  // fat mortar barrel angled up toward +X
  capsule(head, [0, 8, 0], [6, 13, 0], 2.6, 2.4, (x, y, z, t) => (t > 0.85 ? trim : P.md));
  cyl(head, 'y', 6, 0, 13, 15, 1.7, 1.7, INK);
  head.set(6, 14, 0, 0x7cff3a, true).set(6, 14, 1, 0x7cff3a, true);
  // goo tank on the back
  cyl(head, 'y', -5, 0, 5, 12, 2.2, 2.2, (x, y) => (y === 5 || y === 12 || y === 8 ? trim : 0x7cff3a), {});
  for (let y = 6; y <= 11; y++) if (y !== 8) head.set(-5, y, 2, 0xb8ff7a, true);
  if (L) {
    // upgrade kit: a second tank and hazard plates
    cyl(head, 'y', -5, -3, 5, 10, 1.6, 1.6, (x, y) => (y === 5 || y === 10 ? trim : 0x5fdc4a));
    head.box(-3, 6, 4, 1, 7, 4, (x) => ((x & 1) ? PAL.yellow : INK));
  }
  return { grid: g, parts: [{ name: 'head', grid: head, piv: [0, 5, 0], anim: { type: 'yaw' } }], muzzle: [6, 15, 0], muzzlePart: 'head' };
};

B.laserTurret = (P, L) => {
  const g = new VoxGrid();
  pad(g, 6, P);
  cyl(g, 'y', 0, 0, 2, 8, 2, 2, (x, y) => (y === 8 ? STEEL_L : STEEL_D));
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) g.line(0, 6, 0, x, 2, z, STEEL, 0);
  const head = new VoxGrid();
  const trim = L >= 2 ? GOLD : P.acc;
  rbox(head, -3, 9, -3, 3, 14, 3, 1, PAL.white);
  head.box(-3, 11, -3, 3, 11, 3, P.m);
  head.box(-2, 14, -2, 2, 14, 2, trim);
  // barrel(s) + glowing lens
  const barrels = L ? [-1.5, 1.5] : [0];
  for (const bz of barrels) {
    cyl(head, 'x', 12, bz, 3, 9, 1, 1, STEEL_L);
    head.set(10, 12, Math.round(bz), trim).set(11, 12, Math.round(bz), 0xff4fd8, true);
  }
  head.set(3, 13, 3, 0xff4fd8, true);
  head.box(-4, 10, -2, -4, 13, 2, STEEL_DD);
  return { grid: g, parts: [{ name: 'head', grid: head, piv: [0, 9, 0], anim: { type: 'yaw' } }], muzzle: [11, 12, 0], muzzlePart: 'head' };
};

B.acidSprinkler = (P, L) => {
  const g = new VoxGrid();
  pad(g, 6, P);
  const trim = L >= 2 ? GOLD : STEEL_DD;
  cyl(g, 'y', 0, 0, 2, 11, 4, 4, (x, y) => (y === 2 || y === 11 ? trim : y === 6 || y === 7 ? ((x & 1) ? PAL.yellow : INK) : 0x5fdc4a));
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z <= 9) g.set(x, 12, z, (x + z) & 1 ? 0x9dff3a : 0x7cff3a, (x * x + z * z) <= 2);
  // skull label
  artZ(g, SKULL, -2, 10, 5, { '#': PAL.white, '.': INK });
  // riser pipe
  g.box(0, 12, 0, 0, 17, 0, STEEL_L);
  g.box(-1, 13, -1, 1, 13, 1, P.m);
  if (L) {
    cyl(g, 'y', -5, -4, 2, 7, 2, 2, (x, y) => (y === 7 ? trim : 0x5fdc4a));
    g.line(-5, 7, -2, -2, 9, 0, STEEL, 0);
  }
  // spinning sprinkler head with dripping nozzles
  const head = new VoxGrid();
  head.box(-5, 0, 0, 5, 0, 0, STEEL);
  head.box(0, 0, -5, 0, 0, 5, STEEL);
  head.box(-1, 0, -1, 1, 1, 1, P.md);
  for (const [x, z] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) head.set(x, -1, z, 0x7cff3a, true);
  return { grid: g, parts: [{ name: 'head', grid: head, piv: [0, 0, 0], at: [0, 18, 0], anim: { type: 'spin', axis: 'y', speed: 1.5, active: 6 } }], muzzle: [0, 18, 0] };
};

// ------------------------------------------------------------------ UTILITY

B.repairDrone = (P, L) => {
  const g = new VoxGrid();
  pad(g, 6, P);
  // the H landing mark
  for (let z = -3; z <= 3; z++) g.set(-2, 2, z, PAL.white).set(2, 2, z, PAL.white);
  g.set(-1, 2, 0, PAL.white).set(0, 2, 0, PAL.white).set(1, 2, 0, PAL.white);
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) led(g, x, 2, z, x > 0 ? 0x7cff3a : 0xff4a4a);
  const d = new VoxGrid();
  const trim = L >= 2 ? GOLD : P.m;
  rbox(d, -3, 0, -3, 3, 2, 3, 1, PAL.white);
  d.box(-3, 1, -3, 3, 1, 3, trim);
  d.set(3, 1, 0, 0x7ae8ff, true).set(4, 1, 0, 0x7ae8ff, true);
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    d.line(0, 2, 0, x, 2, z, STEEL_D);
    d.box(x, 3, z, x, 3, z, STEEL_DD);
    // rotor blur (pixel cross)
    d.box(x - 2, 4, z, x + 2, 4, z, STEEL_L).box(x, 4, z - 2, x, 4, z + 2, STEEL_L);
  }
  // wrench + tape roll hanging under it
  d.box(0, -3, 0, 0, -1, 0, STEEL);
  d.box(-1, -4, 0, 1, -4, 0, STEEL_L);
  if (L) d.box(-2, -2, 1, -1, -1, 2, 0xb8b8b8);
  return { grid: g, parts: [{ name: 'drone', grid: d, piv: [0, 0, 0], at: [0, 12, 0], anim: { type: 'hover', amp: 1.2, freq: 2.2, spin: 0.6 } }], muzzle: [0, 12, 0] };
};

B.radarDish = (P, L) => {
  const g = new VoxGrid();
  pad(g, 6, P);
  rbox(g, -3, 2, -3, 3, 5, 3, 1, P.md);
  led(g, 0, 4, 4, 0x7cff3a);
  if (L) { g.box(4, 2, -4, 5, 9, -3, STEEL_D); led(g, 4, 10, -4, PAL.pink); }
  const dish = dishGrid({ r: L ? 6 : 5, col: PAL.white, rim: L >= 2 ? GOLD : P.m, tip: P.acc, post: STEEL_D, back: STEEL });
  return { grid: g, parts: [{ name: 'dish', grid: dish, piv: [0, 0, 0], at: [0, 6, 0], anim: { type: 'spin', axis: 'y', speed: 0.8 } }], muzzle: [0, 14, 0] };
};

B.snackDispenser = (P, L) => {
  const g = new VoxGrid();
  pad(g, 6, P);
  const trim = L >= 2 ? GOLD : P.md;
  rbox(g, -4, 2, -3, 4, 15, 3, 1, (x, y) => (y >= 14 ? trim : P.m));
  // window with snack rows
  const snacks = [0xff4fa3, 0xffd23f, 0x29b6f6, 0x7cff3a, 0xff8a2a, 0xb05cff];
  for (let y = 6; y <= 13; y++)
    for (let x = -3; x <= 1; x++) {
      const shelf = (y - 6) % 3 === 2;
      g.set(x, y, 3, shelf ? STEEL_L : snacks[(x + 3 + Math.floor((y - 6) / 3) * 2) % snacks.length]);
      if (!shelf) g.set(x, y, 2, 0x2a2a3a);
    }
  // buttons, coin slot, pickup bay
  for (let y = 9; y <= 12; y++) led(g, 3, y, 3, y & 1 ? 0x7ae8ff : PAL.yellow);
  g.set(3, 7, 3, INK);
  g.box(-3, 3, 3, 1, 4, 3, INK);
  g.box(-4, 15, -3, 4, 15, 3, trim);
  for (let x = -3; x <= 3; x++) led(g, x, 15, 4, x & 1 ? P.accL : PAL.white);
  if (L) { rbox(g, 5, 2, -3, 6, 8, 0, 0, STEEL); g.box(5, 7, 1, 6, 8, 2, 0xff4fa3); }
  const sign = new VoxGrid();
  sign.box(-3, 0, 0, 3, 1, 0, PAL.white);
  for (let x = -2; x <= 2; x++) sign.set(x, 0, 1, x & 1 ? P.acc : PAL.yellow, true);
  return { grid: g, parts: [{ name: 'sign', grid: sign, piv: [0, 0, 0], at: [0, 16, 0], anim: { type: 'blink', rate: 1.2, duty: 0.75 } }], muzzle: [0, 5, 4] };
};

B.cloningVat = (P, L) => {
  const g = new VoxGrid();
  pad(g, 6, P);
  const trim = L >= 2 ? GOLD : STEEL_DD;
  cyl(g, 'y', 0, 0, 2, 4, 4.6, 4.6, (x, y) => (y === 4 ? trim : STEEL_D));
  cyl(g, 'y', 0, 0, 16, 17, 4.6, 4.6, (x, y) => (y === 17 ? trim : STEEL_D));
  g.ellipsoid(0, 18, 0, 3.6, 1.6, 3.6, STEEL);
  // liquid
  for (let y = 5; y <= 15; y++) cyl(g, 'y', 0, 0, y, y, 3, 3, (x, yy, z) => (x * x + z * z >= 8 ? (y & 1 ? 0x7cff3a : 0x5fdc4a) : null));
  // pipes and readout
  g.line(4, 16, -2, 6, 8, -4, P.m, 0).line(6, 8, -4, 6, 2, -4, P.m, 0);
  rbox(g, -7, 2, -3, -5, 7, 1, 0, STEEL_D);
  led(g, -6, 6, 2, 0x7cff3a).set(-6, 4, 2, PAL.yellow, true);
  if (L) { cyl(g, 'y', -6, -4, 2, 10, 1.4, 1.4, (x, y) => (y >= 9 ? trim : 0x7cff3a)); }
  // the clone floating inside (a little Swarm silhouette with glowing eyes)
  const blob = new VoxGrid();
  blob.ellipsoid(0, 0, 0, 1.8, 2.2, 1.6, 0x2f9a3a);
  blob.set(1, 1, 1, 0xffffff, true).set(-1, 1, 1, 0xffffff, true);
  blob.set(-2, 2, 0, 0x2f9a3a).set(2, 2, 0, 0x2f9a3a);
  return {
    grid: g, glass: { r: 3.7, y0: 5, y1: 16 },
    parts: [{ name: 'clone', grid: blob, piv: [0, 0, 0], at: [0, 10, 0], anim: { type: 'bob', freq: 1.4, amp: 1, spin: 0.4 } }],
    muzzle: [0, 10, 0],
  };
};

// ------------------------------------------------------------------ MAST (roof slot): a lattice mast + its topper

function mastGrid(P, Hv, L) {
  const g = new VoxGrid();
  pad(g, 4, P);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(x, 2, z, x, Hv, z, STEEL);
  for (let y = 3; y < Hv - 1; y += 4) {
    g.line(-1, y, 1, 1, y + 2, 1, STEEL_D).line(1, y + 2, 1, -1, y + 4, 1, STEEL_D);
    g.line(1, y, -1, 1, y + 2, 1, STEEL_D);
  }
  rbox(g, -3, Hv, -3, 3, Hv + 1, 3, 0, (x, y, z) => (y === Hv + 1 && (Math.abs(x) === 3 || Math.abs(z) === 3) ? (((x + z) & 1) ? PAL.yellow : INK) : L >= 2 ? GOLD_D : STEEL_D));
  led(g, 2, Hv - 2, 2, 0xff4a4a);
  return g;
}

const MAST_TOP = {
  beastFlag: (P, L, top) => {
    const pole = new VoxGrid();
    pole.box(0, top, 0, 0, top + 15, 0, L >= 2 ? GOLD : STEEL_L);
    pole.set(0, top + 16, 0, L >= 2 ? GOLD_L : PAL.yellow, true);
    const flag = new VoxGrid();
    const W = L ? 13 : 11, H = L ? 9 : 8;
    const bolt = ['..##', '.##.', '####', '.##.', '##..'];
    const bx = Math.floor((W - 4) / 2) + 1;
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++) {
        if (x === W - 1 && (y === 0 || y === H - 1)) continue;
        const edge = y === 0 || y === H - 1;
        flag.set(x + 1, -y, 0, edge ? (L >= 2 ? GOLD : P.md) : P.m);
      }
    const y0 = Math.floor((H - 5) / 2);
    bolt.forEach((row, r) => [...row].forEach((c, k) => { if (c === '#') flag.set(bx + k, -(y0 + r), 0, P.acc, true); }));
    return { grid: pole, parts: [{ name: 'flag', grid: flag, piv: [0, -0, 0], at: [0, top + 15, 0], anim: { type: 'flag', freq: 3, amp: 0.35 } }], muzzle: [0, top + 12, 0] };
  },
  satUplink: (P, L, top) => {
    const base = new VoxGrid();
    base.box(-1, top, -1, 1, top + 2, 1, STEEL_D);
    const dish = dishGrid({ r: L ? 6 : 5, col: PAL.white, rim: L >= 2 ? GOLD : P.acc, tip: P.glow, tilt: 0.9 });
    return { grid: base, parts: [{ name: 'dish', grid: dish, piv: [0, 0, 0], at: [0, top + 2, 0], anim: { type: 'sway', axis: 'y', amp: 0.6, freq: 0.35 } }], muzzle: [0, top + 10, 0] };
  },
  searchlight: (P, L, top) => {
    const base = new VoxGrid();
    base.box(-2, top, -2, 2, top + 1, 2, STEEL_D);
    const lamp = new VoxGrid();
    const trim = L >= 2 ? GOLD : P.m;
    lamp.box(-2, 0, -3, -2, 4, -3, STEEL_D).box(-2, 0, 3, -2, 4, 3, STEEL_D);
    cyl(lamp, 'x', 4, 0, -3, 4, 3, 3, (x) => (x === 4 ? trim : x === -3 ? STEEL_DD : STEEL_L));
    for (let y = 2; y <= 6; y++) for (let z = -2; z <= 2; z++) if ((y - 4) * (y - 4) + z * z <= 6) lamp.set(5, y, z, (y - 4) * (y - 4) + z * z <= 2 ? 0xffffff : 0xfff2a0, true);
    if (L) lamp.box(-4, 3, -1, -3, 5, 1, P.md);
    return { grid: base, parts: [{ name: 'lamp', grid: lamp, piv: [0, 0, 0], at: [0, top + 2, 0], anim: { type: 'sway', axis: 'y', amp: 0.9, freq: 0.45 } }], muzzle: [5, top + 6, 0] };
  },
  boltSpire: (P, L, top) => {
    const base = new VoxGrid();
    cyl(base, 'y', 0, 0, top, top + 3, 2, 1, STEEL_D);
    const bolt = new VoxGrid();
    const art = ['....###', '...###.', '..###..', '.######', '...###.', '..###..', '.###...', '.##....', '##.....'];
    const c1 = L >= 2 ? GOLD_L : P.accL, c2 = L >= 2 ? GOLD : P.acc;
    art.forEach((row, r) => [...row].forEach((ch, k) => {
      if (ch !== '#') return;
      const y = (art.length - 1 - r) * 2;
      for (let dy = 0; dy < 2; dy++) for (let z = -1; z <= 0; z++) bolt.set(k - 3, y + dy, z, (k + r) % 3 ? c2 : c1, (k + r) % 3 !== 0);
    }));
    if (L) for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; base.set(Math.round(Math.cos(t) * 3), top + 2, Math.round(Math.sin(t) * 3), L >= 2 ? GOLD : P.m); }
    return { grid: base, parts: [{ name: 'bolt', grid: bolt, piv: [0, 0, 0], at: [0, top + 4, 0], anim: { type: 'pulse', freq: 4, amp: 0.06 } }], muzzle: [0, top + 14, 0] };
  },
};
const MAST_IDS = new Set(Object.keys(MAST_TOP));

// ---------------------------------------------------------------------------
// assembly

const geoCache = new Map();
const glassGeo = new Map();
let glass = null;

function defFor(id, L, side, mastH) {
  const key = `${id}|${L}|${side}|${mastH ?? ''}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const P = TEAM[side] ?? TEAM[0];
  let d;
  if (MAST_IDS.has(id)) {
    const Hv = mastH;
    const top = MAST_TOP[id](P, L, Hv + 2);
    const g = mastGrid(P, Hv, L);
    top.grid.forEach((x, y, z, c, gl) => g.set(x, y, z, c, gl));
    d = { grid: g, parts: top.parts, muzzle: top.muzzle };
  } else d = B[id](P, L);
  const out = {
    geo: d.grid.build({ scale: V, pivot: [0, 0, 0], maxSamples: 120 }),
    parts: d.parts.map((p) => {
      const piv = p.piv ?? [0, 0, 0];
      const at = p.at ?? piv;
      return { ...p, geo: p.grid.build({ scale: V, pivot: piv, maxSamples: 40 }), pos: [at[0] * V, at[1] * V, at[2] * V], grid: null };
    }),
    muzzle: d.muzzle.map((v) => v * V), muzzlePart: d.muzzlePart ?? null,
    vents: (d.vents ?? []).map((p) => p.map((v) => v * V)),
    glass: d.glass ?? null,
  };
  out.height = (d.grid.bounds().maxY + 1) * V;
  for (const p of d.parts) out.height = Math.max(out.height, ((p.at ?? p.piv)[1] + p.grid.bounds().maxY + 1) * V);
  geoCache.set(key, out);
  return out;
}

/**
 * One module model (origin = pad centre on the ground, faces +X).
 * o: { level 1..5, side 0|1, mastH (voxels, MAST modules only) }
 */
export function makeModule(id, o = {}) {
  const m = MODULES[id];
  if (!m) return null;
  const L = lookOf(o.level ?? 1), side = o.side ?? 0;
  const mastH = m.cat === 'roof' ? Math.max(o.stub ? 3 : 14, Math.round(o.mastH ?? 30)) : null;
  const D = defFor(id, L, side, mastH);
  const root = new THREE.Group();
  root.name = `mod:${id}`;
  const body = makeMesh(D.geo);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  const meshes = [body];
  const parts = D.parts.map((p, i) => {
    const grp = new THREE.Group();
    grp.position.set(...p.pos);
    const mesh = makeMesh(p.geo);
    mesh.castShadow = true;
    grp.add(mesh);
    root.add(grp);
    meshes.push(mesh);
    return { ...p, grp, mesh, base: grp.position.clone(), phase: (p.anim?.phase ?? 0) + i * 1.7 };
  });
  if (D.glass) {
    glass ??= glassMat(0xd8f4ff, 0.24);
    const k = `${D.glass.r}|${D.glass.y0}|${D.glass.y1}`;
    if (!glassGeo.has(k)) glassGeo.set(k, new THREE.CylinderGeometry(D.glass.r * V, D.glass.r * V, (D.glass.y1 - D.glass.y0 + 1) * V, 16, 1, true));
    const gm = new THREE.Mesh(glassGeo.get(k), glass);
    gm.position.y = ((D.glass.y0 + D.glass.y1 + 1) / 2) * V;
    gm.renderOrder = 3;
    root.add(gm);
  }
  const head = parts.find((p) => p.anim?.type === 'yaw');
  let t = Math.random() * 10, yaw = 0, yawTo = 0, recoil = 0, active = 0;
  const mod = {
    root, id, cat: m.cat, level: o.level ?? 1, look: L, meshes, height: D.height, vents: D.vents,
    /** Local muzzle point (follows the turret head). */
    muzzle(out = new THREE.Vector3()) {
      out.set(...D.muzzle);
      if (D.muzzlePart && head) {
        out.sub(head.grp.position).applyAxisAngle(_Y, head.grp.rotation.y).add(head.grp.position);
      }
      return root.localToWorld(out);
    },
    /** Turn the turret head toward a world point (or back to rest with null). */
    aim(worldPoint) {
      if (!head) return;
      if (!worldPoint) { yawTo = 0; return; }
      const p = root.worldToLocal(_v.copy(worldPoint));
      yawTo = Math.max(-1.1, Math.min(1.1, Math.atan2(-p.z, Math.max(0.2, p.x))));
    },
    /** Kick: recoil / a busy burst (sprinkler head spins fast). */
    fire() { recoil = 1; active = 1.4; },
    update(dt) {
      t += dt;
      recoil = Math.max(0, recoil - dt * 4);
      active = Math.max(0, active - dt);
      yaw += (yawTo - yaw) * Math.min(1, dt * 8);
      for (const p of parts) {
        const a = p.anim;
        if (!a) continue;
        const ph = p.phase;
        if (a.type === 'spin') p.grp.rotation[a.axis ?? 'y'] += dt * (a.speed ?? 1) * (active > 0 && a.active ? a.active : 1);
        else if (a.type === 'sway') p.grp.rotation[a.axis ?? 'y'] = Math.sin(t * (a.freq ?? 1) * Math.PI * 2 * 0.3 + ph) * (a.amp ?? 0.3);
        else if (a.type === 'bob') {
          p.grp.position.y = p.base.y + Math.abs(Math.sin(t * (a.freq ?? 2) + ph)) * (a.amp ?? 0.5) * V;
          if (a.spin) p.grp.rotation.y += dt * a.spin;
        } else if (a.type === 'hover') {
          p.grp.position.y = p.base.y + Math.sin(t * (a.freq ?? 2) + ph) * (a.amp ?? 1) * V;
          p.grp.rotation.y = Math.sin(t * 0.4 + ph) * (a.spin ?? 0.5);
        } else if (a.type === 'pulse') p.grp.scale.setScalar(1 + Math.sin(t * (a.freq ?? 4) + ph) * (a.amp ?? 0.1) + recoil * 0.4);
        else if (a.type === 'blink') p.grp.visible = ((t * (a.rate ?? 1.4) + ph) % 1) < (a.duty ?? 0.6);
        else if (a.type === 'flag') {
          p.grp.rotation.y = Math.sin(t * (a.freq ?? 3) + ph) * (a.amp ?? 0.3);
          p.mesh.scale.y = 1 + Math.sin(t * (a.freq ?? 3) * 2 + ph) * 0.05;
        } else if (a.type === 'yaw') {
          p.grp.rotation.y = yaw;
          p.mesh.position.x = -recoil * 0.06;
        }
      }
    },
  };
  return mod;
}
const _Y = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

// ---------------------------------------------------------------------------
// on a base

/**
 * Where a category's module stands next to a base (local, unflipped x; the
 * caller mirrors x for the rival). Keeps the lane in front of the base clear:
 *   power   on the ground at the back end of the base
 *   roof    a lattice mast behind the power core, its topper at roof height
 *   defense the front corner behind the lane (a turret guarding the exit)
 *   utility the front corner on the camera side (low)
 */
export function moduleSlot(base, cat) {
  const b = base.bounds ?? { x0: -2.2, x1: 1.9, z0: -1.4, z1: 1.6 };
  const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
  if (cat === 'power') return [x0 - 0.78, 0.25];
  if (cat === 'roof') return [x0 - 0.42, -1.25];
  if (cat === 'defense') return [x1 + 0.55, -1.5];
  return [x1 + 0.42, 1.72];
}

/**
 * Attach a loadout's models to a base (makeBase() / makeLabBuilding() result).
 * loadout: { cat: { id, level } } | { id: level } (see loadoutList). Models go under base.root.
 */
export function attachModules(base, list, o = {}) {
  const side = o.side ?? 0, flip = !!o.flip;
  const grp = new THREE.Group();
  grp.name = 'labModules';
  base.root.add(grp);
  const mods = {};
  const sx = flip ? -1 : 1;
  // the bounds of a flipped base are already mirrored: un-mirror them for the slot maths
  const bb = base.bounds ? (flip ? { x0: -base.bounds.x1, x1: -base.bounds.x0, z0: base.bounds.z0, z1: base.bounds.z1 } : base.bounds) : null;
  const ref = { bounds: bb };
  for (const { id, level } of list) {
    const m = MODULES[id];
    if (!m) continue;
    const mastH = m.cat === 'roof' ? Math.round(Math.max(2.4, Math.min(4.9, (base.height ?? 4) * 0.82)) / V) : undefined;
    const mod = makeModule(id, { level, side, mastH });
    if (!mod) continue;
    const [x, z] = moduleSlot(ref, m.cat);
    mod.root.position.set(sx * x, 0, z);
    if (flip) mod.root.scale.x = -1;
    grp.add(mod.root);
    mods[m.cat] = mod;
  }
  let stage = 0;
  return {
    root: grp, mods,
    get: (cat) => mods[cat] ?? null,
    update(dt) { if (grp.visible) for (const k in mods) mods[k].update(dt); },
    setDamage(f) {
      const s = f >= 1 ? 4 : f >= 0.9 ? 3 : f >= 0.66 ? 2 : 0;
      if (s === stage) return;
      stage = s;
      grp.visible = s < 4;
    },
    dispose() { grp.parent?.remove(grp); },
  };
}

/** Prebuild a module's geometry (all looks) when idle so equipping / battles never hitch. */
export function prewarmModule(id, level = 1, side = 0) {
  const m = MODULES[id];
  if (!m) return;
  try { defFor(id, lookOf(level), side, m.cat === 'roof' ? 30 : null); } catch (e) { /* optional */ }
}
