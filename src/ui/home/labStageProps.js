// Voxel props for the LAB tab's live lab (labStage.js): the room shell (steel
// panel walls, dark tile floor with a goo spill), the main workbench, the fume
// hood, the whiteboard frame, the reactor-centrifuge (hollow drum with a window
// onto its spinning rotor), the research terminal frame, the specimen shelf,
// the microscope table, the robot arm parts, the floor cables, the pendant
// lamp, the goo pipe and the small hand-held tools / branch projects the
// scientist works with. Everything is cached greedy+AO voxel geometry; the
// stage merges the still parts into a few draws (core/staticBatch.js).
//
// Units: grids are built with their floor centre at the origin, front facing
// +z. V = 0.05 world units per voxel unless a prop says otherwise.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh, PAL, shade, mixHex, hash3, text, textW } from '../../models/props/common.js';
import { aoGeometry, dense } from '../../models/props/voxmesh.js';
import { blob, capsule, chain, cyl, rbox } from '../../models/kit.js';

export const V = 0.05;

// moody lab palette
export const C = {
  steelDD: 0x1e2330, steelD: 0x2a3142, steel: 0x37405a, steelL: 0x4a5570, steelHL: 0x6a7894,
  rivet: 0x8692ac, epoxy: 0x1a1d26, epoxyL: 0x343a4c,
  tile: 0x30364a, tile2: 0x2a3042, grout: 0x1a1e2a,
  goo: 0x7cff3a, gooD: 0x3fae2a, gooDD: 0x1f5a16,
  cyan: 0x3fe8ff, pink: PAL.pink, yellow: PAL.yellow, ink: PAL.ink, orange: 0xff9a1a, orangeD: 0xc86a10,
  copper: 0xc8803a, copperD: 0x8a5222, white: 0xe8edf4, glass: 0xcfeeff, glassD: 0x9ccbe0,
};
const n3 = (x, y, z, s = 0) => hash3(x + s * 31, y - s * 17, z + s * 7);
const hz = (x, y, z) => (((Math.floor((x + y + z) / 2)) & 1) ? C.yellow : C.ink);

/** Cached voxel geometry (greedy + AO). */
export function vgeo(id, fn, o = {}) {
  return aoGeometry('lst_' + id, fn, { scale: o.scale ?? V, pivot: o.pivot ?? [0, 0, 0], jitter: o.jitter ?? 0.03, ao: o.ao, maxSamples: o.maxSamples ?? 40 });
}
/** Mesh from cached voxel geometry. */
export function vmesh(id, fn, o = {}) {
  const m = makeMesh(vgeo(id, fn, o), o.mats ?? Mats.pair);
  m.name = id;
  m.castShadow = o.shadow ?? false;
  m.receiveShadow = o.receive ?? true;
  return m;
}

// ---------------------------------------------------------------------------
// Room shell (V = 0.1): floor + back wall + side walls, one mesh

const RW = 64, RB = -36, RF = 26, RH = 62; // half width, back z, front z, height (0.1 voxels)
export const ROOM = { halfW: RW * 0.1, back: RB * 0.1, front: RF * 0.1, height: RH * 0.1 };

function panelColor(u, v, s) {
  // steel wall panels 12 x 16 with a bevel, seams and rivets
  const pu = ((u % 12) + 12) % 12, pv = ((v % 16) + 16) % 16;
  const id = Math.floor(u / 12) * 7 + Math.floor(v / 16) * 3 + s;
  if (pu === 0 || pv === 0) return C.steelDD;
  if ((pu === 1 || pu === 11) && (pv === 1 || pv === 15)) return C.rivet;
  if (pv === 15) return C.steelL;
  if (pu === 11 || pv === 1) return C.steelD;
  const base = id % 5 === 0 ? 0x3a4258 : id % 3 === 0 ? 0x333b50 : C.steel;
  return n3(u, v, s) < 0.05 ? shade(base, -0.08) : base;
}
function roomGrid() {
  const g = dense(-RW - 1, -1, RB - 1, RW, RH, RF);
  // floor: 8x8 tiles with grout, scuffs, a drain grate and a goo spill
  for (let x = -RW; x < RW; x++)
    for (let z = RB; z < RF; z++) {
      const tu = ((x % 8) + 8) % 8, tv = ((z % 8) + 8) % 8;
      let c = tu === 0 || tv === 0 ? C.grout : ((Math.floor(x / 8) + Math.floor(z / 8)) & 1 ? C.tile : C.tile2);
      if (c !== C.grout && n3(x, 0, z) < 0.04) c = shade(c, 0.07);
      g.set(x, -1, z, c);
    }
  // drain grate (front right)
  for (let x = 20; x <= 27; x++) for (let z = 4; z <= 9; z++) g.set(x, -1, z, (x === 20 || x === 27 || z === 4 || z === 9) ? C.steelHL : (x & 1 ? 0x0c0e14 : C.steelL));
  // hazard border in front of the containment tube bay
  for (let x = -27; x <= 1; x++) for (const z of [-14, -15]) g.set(x, -1, z, hz(x, 0, z));
  // goo spill near the fume hood (glows)
  for (let x = -54; x <= -34; x++)
    for (let z = -26; z <= -8; z++) {
      const d = Math.hypot((x + 44) / 9, (z + 17) / 7) + (n3(x >> 1, 0, z >> 1, 3) - 0.5) * 0.5;
      if (d < 1) g.set(x, -1, z, d < 0.55 ? C.goo : C.gooD, d < 0.55);
    }
  for (const [x, z] of [[-32, -14], [-31, -13], [-34, -8], [-30, -17]]) g.set(x, -1, z, C.goo, true);
  // back wall + side walls
  for (let x = -RW - 1; x <= RW; x++) for (let y = 0; y < RH; y++) g.set(x, y, RB - 1, panelColor(x, y, 1));
  for (const sx of [-RW - 1, RW]) for (let z = RB; z < RF; z++) for (let y = 0; y < RH; y++) g.set(sx, y, z, panelColor(z, y, sx > 0 ? 2 : 3));
  // baseboard: dark kick plate with a hazard band
  for (let x = -RW; x < RW; x++) { g.set(x, 0, RB, C.steelDD); g.set(x, 1, RB, hz(x, 1, 0)); g.set(x, 2, RB, C.steelD); }
  for (const sx of [-RW, RW - 1]) for (let z = RB; z < RF; z++) { g.set(sx, 0, z, C.steelDD); g.set(sx, 1, z, hz(z, 1, 0)); }
  // ceiling header beam along the back wall
  for (let x = -RW; x < RW; x++) for (let y = RH - 4; y < RH; y++) for (let z = RB; z <= RB + 2; z++) g.set(x, y, z, y === RH - 4 ? C.steelDD : (x % 10 === 0 ? C.rivet : C.steelD));
  return g;
}
export const roomMesh = () => vmesh('room', roomGrid, { scale: 0.1, receive: true, maxSamples: 60 });

// ---------------------------------------------------------------------------
// Goo pipe along the back wall (glass sections glowing green between flanges)

function gooPipeGrid() {
  const g = dense(-130, -4, -4, 130, 4, 4);
  for (let x = -128; x <= 128; x++) {
    const seg = ((x % 24) + 24) % 24;
    const flange = seg < 2;
    for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) {
      const r = Math.hypot(y, z);
      if (flange ? r > 3.4 : r > 2.4) continue;
      if (flange) g.set(x, y, z, seg === 0 ? C.steelHL : C.steelL);
      else if (r > 1.5) g.set(x, y, z, y > 1 && z > 0 ? 0xc8f8ff : C.glassD);
      else g.set(x, y, z, (x + y) % 9 === 0 ? 0xc8ff9a : C.goo, true);
    }
    if (seg === 12) for (const z of [-3, -4]) g.set(x, 0, z, C.steelDD); // wall bracket
  }
  return g;
}
export const gooPipeMesh = () => vmesh('gooPipe', gooPipeGrid);

// ---------------------------------------------------------------------------
// Main workbench (top at 0.6): steel cabinet, black epoxy top, front plate

export const BENCH = { w: 2.6, top: 0.5, sink: 0.1 }; // the cabinet stands sunk 0.1 into the floor (low bench, the scientist shows above it)
function benchGrid() {
  const g = dense(-28, 0, -10, 27, 22, 9);
  // plinth + cabinet
  g.box(-24, 0, -7, 23, 0, 5, C.steelDD);
  g.box(-25, 1, -8, 24, 10, 6, (x, y, z) => {
    if (y === 10) return C.steelD;
    if (z === 6) {
      // door panels with seams: [-25..-9] [-8..7] [8..24]
      if (x === -9 || x === 8 || x === -25 || x === 24) return C.steelDD;
      if (y === 1) return C.steelDD;
      if (x > -9 && x < 8) return C.steelD;
      return y === 9 ? C.steelL : C.steel;
    }
    return C.steel;
  });
  // door handles + vents
  for (const x of [-12, 11]) g.box(x, 6, 7, x, 8, 7, C.steelHL);
  for (const [x0, x1] of [[-22, -15], [15, 22]]) for (let y = 2; y <= 4; y += 2) g.box(x0, y, 7, x1, y, 7, C.steelDD);
  // centre plate: BEAST LAB in glowing pixels
  g.box(-20, 4, 7, 19, 10, 7, C.ink);
  for (const x of [-20, 19]) for (const y of [4, 10]) g.set(x, y, 8, C.steelHL);
  text(g, 'BEAST', -18, 5, 8, '+z', PAL.pink, { glow: true });
  text(g, 'LAB', 4, 5, 8, '+z', PAL.yellow, { glow: true });
  g.set(1, 6, 8, C.cyan, true).set(2, 8, 8, C.cyan, true).set(1, 7, 8, C.cyan, true).set(2, 7, 8, C.cyan, true);
  // epoxy top (overhang) with a bright front edge
  g.box(-27, 11, -10, 26, 11, 8, (x, y, z) => (z === 8 ? C.epoxyL : n3(x, 0, z, 9) < 0.03 ? 0x1c1f28 : C.epoxy));
  // test tube rack (left back) with five coloured tubes
  g.box(-24, 12, -6, -15, 12, -2, PAL.woodD).box(-24, 15, -6, -15, 15, -2, PAL.wood);
  for (const x of [-24, -15]) g.box(x, 13, -6, x, 14, -2, PAL.woodD);
  [[-23, C.goo], [-21, PAL.pink], [-19, C.cyan], [-17, PAL.yellow], [-16, 0xb05cff]].forEach(([x, c], i) => {
    const hgt = 2 + (i % 3);
    g.box(x, 13, -4, x, 13 + hgt, -4, c, true);
    g.box(x, 14 + hgt, -4, x, 19, -4, C.glass);
  });
  // bunsen burner (left front): base, barrel, gas hose (flame is animated separately)
  g.box(-13, 12, 1, -10, 12, 4, C.steelDD);
  g.box(-12, 13, 2, -11, 17, 3, C.copper);
  g.set(-12, 15, 4, C.copperD);
  chain(g, [[-10, 12, 3], [-6, 12, 5], [-3, 12, 7]], 0.6, 0xff6a3a);
  // tripod + gauze over the burner
  for (const [x, z] of [[-14, 0], [-9, 0], [-12, 5]]) g.box(x, 12, z, x, 19, z, C.steelHL);
  g.box(-14, 20, 0, -9, 20, 5, (x, y, z) => ((x + z) & 1 ? C.steelHL : C.steelL));
  // notebook + pencil + mug (right)
  g.box(13, 12, -1, 20, 12, 5, 0xf0ece0).box(13, 12, 2, 20, 12, 2, 0xb8b0a0).box(16, 12, -1, 16, 12, 5, 0xc8c0b0);
  for (const z of [0, 4]) g.box(14, 12, z, 15, 12, z, 0x8a94ac);
  g.box(17, 13, 1, 21, 13, 1, PAL.yellow).set(22, 13, 1, 0xf0a0a0);
  g.box(21, 12, -6, 24, 16, -3, 0xf4f4f4).box(22, 17, -5, 23, 17, -4, 0x5a3220);
  g.box(25, 13, -5, 25, 15, -4, 0xf4f4f4);
  g.set(22, 15, -2, PAL.pink).set(23, 15, -2, PAL.pink);
  // oscilloscope box (right back; its screen is a live pixel screen)
  g.box(9, 12, -9, 20, 20, -4, C.steelD);
  g.box(10, 13, -3, 19, 19, -3, C.ink);
  for (const [x, c] of [[17, PAL.red], [18, C.goo], [19, C.cyan]]) g.set(x, 13, -2, c, true);
  return g;
}
export const benchMesh = () => vmesh('bench', benchGrid, { shadow: true });
/** World rect of the oscilloscope screen on the bench (x, y centre, w, h, z face). */
export const SCOPE_SCREEN = { x: 14.5 * V, y: 16.5 * V, w: 7.5 * V, h: 4.6 * V, z: -2 * V + 0.003 };
/** Burner flame tip, local to the bench. */
export const BURNER = { x: -11.5 * V, y: 18 * V, z: 2.5 * V };

/** Grated steel step behind the bench (the scientist stands on it): 2.6 x 0.7, 0.18 tall. */
export const STEP = { hw: 1.3, hd: 0.36, h: 0.18 };
function stepGrid() {
  const g = dense(-27, 0, -8, 26, 4, 7);
  g.box(-26, 0, -7, 25, 2, 6, C.steelDD);
  for (let x = -26; x <= 25; x++) for (let z = -7; z <= 6; z++) {
    const edge = x === -26 || x === 25 || z === -7 || z === 6;
    g.set(x, 3, z, edge ? (z === 6 ? hz(x, 3, 0) : C.steelHL) : (x & 1) || (z % 3 === 0) ? C.steelL : 0x0c0e14);
  }
  return g;
}
export const stepMesh = () => vmesh('step', stepGrid, { receive: true });

// ---------------------------------------------------------------------------
// Fume hood (1.5 wide, 2.5 tall): cabinet, worktop, hood box, open sash, duct

function hoodGrid() {
  const g = dense(-17, 0, -11, 16, 124, 11);
  g.box(-15, 0, -9, 14, 11, 8, (x, y, z) => (y === 0 ? C.steelDD : z === 8 && (x === -1 || x === 0) ? C.steelDD : z === 8 && y === 11 ? C.steelL : C.steel));
  for (const x of [-3, 2]) g.box(x, 6, 9, x, 9, 9, C.steelHL);
  // hazard sticker (diamond) on the left door
  for (let dy = -3; dy <= 3; dy++) for (let dx = -(3 - Math.abs(dy)); dx <= 3 - Math.abs(dy); dx++) g.set(-8 + dx, 5 + dy, 9, Math.abs(dx) + Math.abs(dy) === 3 ? C.ink : C.yellow);
  g.set(-8, 6, 10, C.ink).set(-8, 5, 10, C.ink).set(-8, 3, 10, C.ink);
  // worktop
  g.box(-16, 12, -10, 15, 12, 9, (x, y, z) => (z === 9 ? C.epoxyL : C.epoxy));
  // hood: sides, back, top box with a light strip and a vent grille
  for (const x of [-16, 15]) g.box(x, 13, -10, x, 50, 8, (xx, y, z) => (z === 8 ? C.steelL : y % 8 === 0 ? C.steelD : C.steel));
  g.box(-15, 13, -10, 14, 49, -10, (x, y) => (y % 6 === 0 ? 0x1e2b22 : 0x223328));
  g.box(-16, 40, -10, 15, 50, 9, (x, y, z) => {
    if (z === 9 && y >= 43 && y <= 47 && x > -12 && x < 11) return (x & 1) ? C.steelDD : C.steelD;
    if (y === 40) return C.steelDD;
    return y === 50 ? C.steelL : C.steel;
  });
  g.box(-14, 39, -8, 13, 39, 6, 0xd8ffd0, true);
  // sash frame (the glass pane is a separate transparent plane) + handle
  for (const y of [26, 38]) g.box(-15, y, 8, 14, y, 9, C.steelHL);
  for (const x of [-15, 14]) g.box(x, 26, 8, x, 38, 9, C.steelHL);
  g.box(-8, 25, 10, 7, 25, 10, C.steelHL);
  // label plate
  g.box(-9, 41, 10, 8, 47, 10, C.ink);
  text(g, 'HOOD', -7, 42, 11, '+z', C.goo, { glow: true });
  // ring stand + round-bottom flask with goo over a burner
  g.box(-9, 13, -6, -5, 13, -2, C.steelDD);
  g.box(-8, 14, -5, -8, 31, -5, C.steelHL);
  g.box(-8, 24, -5, -2, 24, -5, C.steelHL);
  g.box(-2, 13, -5, 1, 13, -2, C.steelDD).box(-1, 14, -4, 0, 17, -3, C.copper);
  blob(g, -1, 22, -4, 3.5, 3.5, 3.5, (x, y) => (y < 22 ? C.goo : C.glass), {});
  for (let y = 26; y <= 29; y++) g.box(-1, y, -4, -1, y, -4, C.glass);
  g.set(-1, 30, -4, 0xb08a5a);
  // goo glow inside the flask
  g.forEach((x, y, z, c) => { if (c === C.goo) g.set(x, y, z, C.goo, true); });
  // jars on the right of the hood
  for (const [x, c] of [[7, 0xb05cff], [11, C.cyan]]) {
    g.box(x - 1, 13, -5, x + 1, 18, -3, C.glass);
    g.box(x - 1, 13, -5, x + 1, 15, -3, c, true);
    g.box(x - 1, 19, -5, x + 1, 19, -3, C.ink);
  }
  // duct up to the ceiling
  g.box(-6, 51, -8, 5, 124, 1, (x, y, z) => (y % 14 === 0 ? C.steelHL : x === -6 || z === 1 ? C.steelL : C.steelD));
  return g;
}
export const hoodMesh = () => vmesh('hood', hoodGrid, { shadow: true });
export const HOOD = { flask: new THREE.Vector3(-1 * V, 24 * V, -4 * V), sash: { y0: 26 * V, y1: 38 * V, w: 30 * V, z: 8.6 * V }, worktop: 13 * V };

// ---------------------------------------------------------------------------
// Whiteboard frame (the writing is a live canvas): 1.7 x 1.05, marker tray

export const BOARD = { w: 1.7, h: 1.05 };
function boardGrid() {
  const W = 17, H = 11; // half width / height in voxels
  const g = dense(-W - 1, -H - 4, -1, W, H + 1, 3);
  for (let x = -W; x < W; x++) for (let y = -H; y <= H; y++) {
    const edge = x === -W || x === W - 1 || y === -H || y === H;
    if (edge) g.box(x, y, 0, x, y, 1, y === H ? 0xc8d0dc : 0x9aa4b8);
    else g.set(x, y, 0, 0xdfe4ea);
  }
  // marker tray + markers + eraser
  g.box(-W, -H - 2, 0, W - 1, -H - 1, 3, 0x9aa4b8);
  for (const [x, c] of [[-10, PAL.red], [-7, PAL.blue], [-4, PAL.green]]) g.box(x, -H, 2, x + 2, -H, 2, c).set(x + 2, -H, 2, C.ink);
  g.box(6, -H, 1, 10, -H + 1, 3, 0x3a4a6a).box(6, -H + 2, 1, 10, -H + 2, 3, 0xe8e2d4);
  return g;
}
export const boardMesh = () => vmesh('board', boardGrid);

// ---------------------------------------------------------------------------
// Reactor-centrifuge: plinth, hollow drum with a front window onto the rotor,
// glowing core band, dome with a beacon post, gauges, a lever and pipes

const RR = 14; // drum radius (voxels)
function reactorGrid() {
  const g = dense(-22, 0, -22, 22, 52, 22);
  const ang = (x, z) => Math.atan2(z, x);
  // plinth with a hazard ring
  cyl(g, 'y', 0, 0, 0, 1, RR + 4, RR + 4, C.steelDD);
  cyl(g, 'y', 0, 0, 2, 3, RR + 3, RR + 3, (x, y, z) => (y === 3 ? ((Math.floor((ang(x, z) + 4) * 6) & 1) ? C.yellow : C.ink) : C.steelD));
  // hollow drum (ribs), window cut-out on +z
  cyl(g, 'y', 0, 0, 4, 32, RR, RR, (x, y, z) => {
    const a = ang(x, z);
    const rib = Math.floor((a + 4) * 4.2) % 3 === 0;
    if (y === 4 || y === 32) return C.steelL;
    if (y === 20) return C.orange;
    return rib ? C.steelD : C.steel;
  }, { hollow: 2 });
  g.carve((x, y, z) => z > 4 && y >= 9 && y <= 27 && Math.hypot(x, (y - 18) * 1.0) <= 8.6 && Math.hypot(x, z) > RR - 3);
  // window rim (bolted)
  for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2, x = Math.round(Math.cos(t) * 9.4), y = 18 + Math.round(Math.sin(t) * 9.4);
    const z = Math.round(Math.sqrt(Math.max(0, (RR + 0.6) ** 2 - x * x)));
    g.set(x, y, z, a % 5 === 0 ? C.rivet : C.steelHL);
  }
  // inner chamber floor + back (dark) + glowing core column
  cyl(g, 'y', 0, 0, 5, 5, RR - 2, RR - 2, C.steelDD);
  cyl(g, 'y', 0, 0, 6, 9, 3, 3, C.steelD);
  cyl(g, 'y', 0, 0, 10, 26, 1.6, 1.6, C.cyan, { glow: true });
  // dome + beacon post
  for (let y = 33; y <= 41; y++) cyl(g, 'y', 0, 0, y, y, Math.sqrt(Math.max(0, (RR + 0.5) ** 2 - ((y - 32) * 1.6) ** 2)), undefined, (x, yy, z) => (yy === 33 ? C.steelHL : (Math.floor((ang(x, z) + 4) * 5) & 1 ? C.steel : C.steelL)));
  g.box(-2, 42, -2, 1, 44, 1, C.steelDD);
  // front control panel (below the window) with buttons + gauge
  g.box(-8, 5, RR, 7, 8, RR + 2, C.steelDD);
  [[-6, PAL.red], [-3, C.goo], [0, PAL.yellow], [3, C.cyan]].forEach(([x, c]) => g.box(x, 7, RR + 3, x + 1, 7, RR + 3, c, true));
  g.box(5, 6, RR + 3, 6, 7, RR + 3, 0xffffff);
  // side gauges (left), lever (right)
  for (const y of [14, 22]) {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx * dx + dy * dy <= 5) g.set(-RR - 1, y + dy, dx, Math.abs(dx) === 2 || Math.abs(dy) === 2 ? C.steelHL : 0xf4f0e0);
    g.set(-RR - 2, y, 0, PAL.red).set(-RR - 2, y + 1, 1, PAL.red);
  }
  g.box(RR, 12, -2, RR + 2, 15, 1, C.steelDD);
  capsule(g, [RR + 2, 14, 0], [RR + 5, 22, 2], 0.8, 0.6, C.steelHL);
  blob(g, RR + 5, 23, 2, 1.4, 1.4, 1.4, PAL.red);
  // back pipes (to the wall)
  for (const [y, c] of [[12, C.copper], [26, C.steelL]]) cyl(g, 'z', 4, y, -22, -RR + 1, 1.8, 1.8, c);
  return g;
}
export const reactorMesh = () => vmesh('reactor', reactorGrid, { shadow: true, maxSamples: 60 });
export const REACTOR = { window: { y: 18 * V, z: (RR - 1.2) * V, r: 8.6 * V }, core: 18 * V, top: 44 * V, r: RR * V };

/** The rotor spinning inside the drum: hub + four arms with vials. */
function rotorGrid() {
  const g = dense(-12, -3, -12, 12, 3, 12);
  cyl(g, 'y', 0, 0, -2, 2, 2.5, 2.5, C.steelHL);
  const cols = [C.goo, PAL.pink, C.cyan, PAL.yellow];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let r = 2; r <= 9; r++) g.set(Math.round(ca * r), 0, Math.round(sa * r), C.steelL);
    const vx = Math.round(ca * 10), vz = Math.round(sa * 10);
    g.box(vx - 1, -2, vz - 1, vx + 1, 2, vz + 1, cols[i], true);
    g.box(vx - 1, 3, vz - 1, vx + 1, 3, vz + 1, C.white);
  }
  return g;
}
export const rotorMesh = () => vmesh('rotor', rotorGrid, { receive: false });

/** Beacon head (rotating): a little cage with two lamps (glow). */
function beaconGrid() {
  const g = dense(-3, 0, -3, 3, 6, 3);
  g.box(-2, 0, -2, 2, 0, 2, C.steelDD);
  g.box(-1, 1, -1, 1, 4, 1, 0xff6a2a, true);
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) g.box(x, 1, z, x, 4, z, C.steelHL);
  g.box(-2, 5, -2, 2, 5, 2, C.steelD);
  g.set(-2, 2, 0, 0xffe0a0, true).set(2, 3, 0, 0xffe0a0, true);
  return g;
}
export const beaconMesh = () => vmesh('beacon', beaconGrid, { receive: false });

// ---------------------------------------------------------------------------
// Research terminal (big wall screen frame) + two small monitors beside it

export const TERM = { w: 1.9, h: 1.15 };
function termGrid() {
  const W = 20, H = 12;
  const g = dense(-W - 12, -H - 3, -2, W + 1, H + 7, 3);
  // bezel (thick, with corner bolts)
  for (let x = -W; x < W; x++) for (let y = -H; y <= H; y++) {
    const e = x === -W || x === W - 1 || y === -H || y === H;
    const e2 = x === -W + 1 || x === W - 2 || y === -H + 1 || y === H - 1;
    if (e) g.box(x, y, 0, x, y, 2, C.steelL);
    else if (e2) g.box(x, y, 0, x, y, 1, C.steelDD);
    else g.set(x, y, 0, 0x05070a);
  }
  for (const [x, y] of [[-W + 1, -H + 1], [W - 2, -H + 1], [-W + 1, H - 1], [W - 2, H - 1]]) g.set(x, y, 2, C.rivet);
  // header bar: RESEARCH in glowing cyan
  g.box(-14, H + 1, 0, 13, H + 6, 1, C.steelDD);
  const tw = textW('RESEARCH');
  text(g, 'RESEARCH', -Math.floor(tw / 2), H + 1, 2, '+z', C.cyan, { glow: true });
  g.set(-15, H + 3, 1, C.steelHL).set(14, H + 3, 1, C.steelHL);
  // status LEDs under the screen
  for (let x = -6; x <= 5; x += 2) g.set(x, -H - 1, 1, x % 4 === 0 ? C.goo : C.cyan, true);
  g.box(-W, -H - 2, 0, W - 1, -H - 1, 0, C.steelD);
  // two small monitors stacked on the left (screens live)
  for (const y0 of [-11, 0]) {
    g.box(-W - 11, y0, -1, -W - 2, y0 + 9, 0, C.steelL);
    g.box(-W - 10, y0 + 1, 1, -W - 3, y0 + 8, 1, C.ink);
  }
  g.box(-W - 7, -H, -1, -W - 6, H, -1, C.steelDD);
  return g;
}
export const termMesh = () => vmesh('term', termGrid);
/** Screen rects local to the terminal mesh: main + two small monitors. */
export const TERM_SCREENS = {
  main: { x: -0.5 * V, y: 0.5 * V, w: 36 * V, h: 21 * V, z: 1 * V + 0.004 },
  small: [{ x: -26 * V, y: -6 * V, w: 8 * V, h: 8 * V, z: 2 * V + 0.003, kind: 'ekg' }, { x: -26 * V, y: 5 * V, w: 8 * V, h: 8 * V, z: 2 * V + 0.003, kind: 'dna' }],
};

// ---------------------------------------------------------------------------
// Specimen shelf (steel, three shelves of jars with floating specimens)

function jar(g, x, y, z, w, hgt, liquid, spec) {
  g.box(x - w, y, z - 2, x + w, y + hgt, z + 2, C.glass);
  g.box(x - w, y, z - 2, x + w, y + hgt - 2, z + 2, liquid);
  g.box(x - w, y + hgt + 1, z - 2, x + w, y + hgt + 1, z + 2, C.steelDD);
  if (spec) spec(x, y + Math.floor(hgt / 2), z + 3);
}
function shelfGrid() {
  const g = dense(-16, 0, -6, 15, 58, 6);
  for (const x of [-15, 14]) g.box(x, 0, -5, x, 56, 4, (xx, y, z) => (y % 4 === 0 && z === 4 ? C.rivet : C.steelD));
  g.box(-14, 0, -5, 13, 56, -5, (x, y) => (y % 9 === 0 ? C.steelDD : 0x242a38));
  for (const y of [1, 19, 37, 55]) g.box(-14, y, -4, 13, y, 4, (x, yy, z) => (z === 4 ? C.steelHL : C.steelL));
  const eye = (x, y, z) => { g.box(x - 1, y - 1, z, x + 1, y + 1, z, 0xf6f1ea); g.set(x, y, z, 0x1fa8d8).set(x, y, z + 1, C.ink); };
  const brain = (x, y, z) => { g.box(x - 2, y - 1, z, x + 2, y + 1, z, 0xf08aa8); g.set(x, y + 1, z, 0xc0506e).set(x - 1, y, z, 0xc0506e); };
  const tent = (x, y, z) => { for (let i = 0; i < 4; i++) g.set(x + (i & 1), y - 2 + i, z, 0x9a5ae0); g.set(x + 1, y + 2, z, 0xc08aff); };
  const fish = (x, y, z) => { g.box(x - 2, y, z, x + 1, y + 1, z, 0xff9a2e); g.set(x + 2, y, z, 0xff9a2e).set(x + 2, y + 1, z, 0xff9a2e).set(x - 1, y + 1, z, C.ink); };
  // shelf 1 (low): goo drum + two jars
  cyl(g, 'y', -9, 0, 2, 12, 4, 4, (x, y) => (y === 12 ? C.goo : y === 4 || y === 10 ? C.steelHL : 0x2f8a3a));
  g.forEach((x, y, z, c) => { if (y === 12 && c === C.goo) g.set(x, y, z, C.goo, true); });
  jar(g, 0, 2, 0, 3, 10, 0x6ad8ff, eye);
  jar(g, 8, 2, 0, 3, 12, 0x9dff6a, tent);
  // shelf 2: brain jar, specimen box, small vials
  jar(g, -9, 20, 0, 3, 11, 0xffb0d0, brain);
  g.box(-3, 20, -3, 4, 26, 2, 0xc9a06a).box(-3, 26, -3, 4, 26, 2, 0xe0bc84);
  text(g, 'XP', -1, 22, 3, '+z', PAL.pink);
  for (let i = 0; i < 4; i++) { const x = 7 + i * 2; g.box(x, 20, 0, x, 22 + (i % 2), 0, [C.goo, C.cyan, PAL.pink, PAL.yellow][i], true); g.box(x, 23 + (i % 2), 0, x, 26, 0, C.glass); }
  // shelf 3: fish jar, a skull-ish voxel bust, a big goo flask
  jar(g, -9, 38, 0, 3, 11, 0x5ae8d0, fish);
  g.box(-2, 38, -2, 2, 42, 2, 0xe8e4d8).box(-1, 40, 3, -1, 40, 3, C.ink).set(1, 40, 3, C.ink).box(-1, 38, 3, 1, 38, 3, 0xc8c4b8);
  blob(g, 8, 42, 0, 3.4, 3.6, 3.4, (x, y) => (y < 43 ? C.goo : C.glass));
  g.forEach((x, y, z, c) => { if (y > 37 && c === C.goo) g.set(x, y, z, C.goo, true); });
  g.box(8, 46, 0, 8, 49, 0, C.glass).set(8, 50, 0, 0xb08a5a);
  return g;
}
export const shelfMesh = () => vmesh('shelf', shelfGrid, { shadow: true });

// ---------------------------------------------------------------------------
// Microscope table (0.6 tall) with a microscope, a petri dish and a lamp

export const SCOPE_TABLE = { top: 0.6 };
function scopeTableGrid() {
  const g = dense(-12, 0, -8, 12, 28, 8);
  for (const x of [-10, 9]) for (const z of [-6, 5]) g.box(x, 0, z, x, 10, z, C.steelD);
  g.box(-10, 4, -6, 9, 4, 5, C.steelDD);
  g.box(-11, 11, -7, 10, 11, 6, (x, y, z) => (z === 6 ? C.epoxyL : C.epoxy));
  // microscope (centre-left), eyepiece up-forward
  g.box(-6, 12, -4, -1, 12, 1, C.white);
  g.box(-2, 13, -4, -1, 20, -3, C.white);
  g.box(-6, 16, -3, -2, 16, 0, C.steelDD);
  g.set(-4, 16, -1, C.cyan, true);
  g.box(-4, 17, -2, -4, 21, -2, C.steelHL);
  g.line(-3, 21, -3, -5, 25, -1, C.white, 0);
  g.box(-5, 25, -1, -5, 26, 0, C.steelDD);
  g.box(-1, 15, -2, 0, 15, -1, C.steelL);
  // petri dishes (glowing cultures)
  for (const [cx, cz, c] of [[4, -2, C.goo], [7, 2, 0xb05cff]]) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const d = Math.abs(dx) + Math.abs(dz);
    if (d <= 3) g.set(cx + dx, 12, cz + dz, d === 3 ? 0xd8f4ff : c, d < 2);
  }
  return g;
}
export const scopeTableMesh = () => vmesh('scopeTable', scopeTableGrid, { shadow: true });
/** Where the scientist's eye goes (local to the table). */
export const SCOPE_EYE = new THREE.Vector3(-5 * V, 26 * V, -0.5 * V);

// ---------------------------------------------------------------------------
// Robot arm (industrial orange): pedestal, turret, upper arm, forearm, claw

export function robotParts() {
  const ped = vmesh('rbPed', () => {
    const g = dense(-7, 0, -7, 7, 12, 7);
    cyl(g, 'y', 0, 0, 0, 1, 6, 6, C.steelDD);
    cyl(g, 'y', 0, 0, 2, 9, 4.5, 4.5, (x, y) => (y === 5 ? C.yellow : y === 6 ? C.ink : C.steelD));
    cyl(g, 'y', 0, 0, 10, 11, 5, 5, C.steelL);
    return g;
  }, { shadow: true });
  const turret = vmesh('rbTur', () => {
    const g = dense(-5, 0, -5, 5, 8, 5);
    cyl(g, 'y', 0, 0, 0, 2, 4.5, 4.5, C.orange);
    g.box(-3, 3, -2, 2, 7, 2, C.orange).box(-4, 4, -2, -4, 6, 2, C.steelDD).box(3, 4, -2, 3, 6, 2, C.steelDD);
    g.set(0, 2, 5, C.goo, true);
    return g;
  }, { shadow: true });
  const upper = vmesh('rbUp', () => {
    const g = dense(-3, -1, -3, 3, 18, 3);
    g.box(-2, 0, -2, 2, 16, 2, (x, y, z) => (y % 8 === 4 && z === 2 ? C.ink : x === -2 ? C.orangeD : C.orange));
    g.box(-3, 15, -2, 3, 18, 2, C.steelDD);
    for (const z of [-1, 1]) chain(g, [[0, 2, z * 3], [1, 9, z * 3], [0, 14, z * 3]], 0.4, C.ink);
    return g;
  }, { shadow: true });
  const fore = vmesh('rbFore', () => {
    const g = dense(-3, -1, -3, 3, 15, 3);
    g.box(-1, 0, -1, 1, 13, 1, (x, y) => (y % 6 === 3 ? C.ink : C.orange));
    g.box(-2, 13, -2, 2, 15, 2, C.steelDD);
    return g;
  }, { shadow: true });
  const finger = vmesh('rbFinger', () => {
    const g = dense(-1, -1, -1, 3, 6, 1);
    g.box(0, 0, 0, 0, 4, 0, C.steelHL).set(1, 5, 0, C.steelHL).set(1, 4, 0, C.steelL);
    return g;
  }, { shadow: false });
  return { ped, turret, upper, fore, finger };
}

// ---------------------------------------------------------------------------
// Floor cables (thick, with yellow ties) from the tube to the reactor / bench

function cablesGrid() {
  const g = dense(-92, 0, -74, 92, 6, 12);
  const tie = (col) => (x, y, z, t) => (Math.floor(t * 9) % 3 === 0 && t > 0.05 && t < 0.95 ? C.yellow : col);
  // (world voxels: the tube stands at (-26, -50), the reactor at (64, -32), the hood at (-100, -62))
  chain(g, [[-12, 1, -44], [8, 1, -40], [28, 1, -36], [46, 1, -32], [52, 1, -30]], 1.2, tie(C.ink));
  chain(g, [[-14, 1, -48], [6, 1, -56], [22, 1, -66], [30, 1, -70]], 0.9, tie(0x2a3a6a));
  chain(g, [[-40, 1, -46], [-58, 1, -38], [-74, 1, -46], [-86, 1, -42]], 1.2, tie(C.ink));
  chain(g, [[-20, 1, -36], [-12, 1, -26], [-4, 1, -18]], 0.9, tie(0x6a2a2a));
  // a frayed end near the reactor (sparks fly from here)
  chain(g, [[72, 1, -18], [78, 1, -8], [82, 1, 2]], 1.0, C.ink);
  g.set(83, 1, 3, C.copper).set(83, 2, 4, C.copper).set(84, 1, 3, C.copper);
  return g;
}
export const cablesMesh = () => vmesh('cables', cablesGrid, { receive: true });
export const SPARK_AT = new THREE.Vector3(83.5 * V, 2 * V, 3.5 * V);

// ---------------------------------------------------------------------------
// Pendant lamp over the bench (shade + cord), bulb glows

function lampGrid() {
  const g = dense(-7, -2, -7, 7, 64, 7);
  g.box(0, 6, 0, 0, 64, 0, C.ink);
  for (let y = 0; y <= 5; y++) {
    const r = 2 + (5 - y) * 0.9;
    cyl(g, 'y', 0, 0, y, y, r, r, y === 0 ? C.steelHL : y === 5 ? C.steelDD : 0x3a5a4a, { hollow: y === 0 ? 1 : 0 });
  }
  g.box(-1, -1, -1, 1, 0, 1, 0xfff0c8, true);
  return g;
}
export const lampMesh = () => vmesh('lamp', lampGrid, { receive: false });

// ---------------------------------------------------------------------------
// Goo barrels (glowing tops) for the corners

function barrelGrid() {
  const g = dense(-6, 0, -6, 6, 18, 6);
  cyl(g, 'y', 0, 0, 0, 16, 5, 5, (x, y) => (y === 1 || y === 8 || y === 15 ? 0x3a4a3a : 0x2f6a34));
  cyl(g, 'y', 0, 0, 17, 17, 4, 4, C.goo, { glow: true });
  for (let y = 4; y <= 11; y++) for (let x = -2; x <= 1; x++) if ((y === 4 || y === 11 || x === -2 || x === 1)) g.set(x, y, 5, C.yellow);
  g.set(-1, 8, 6, C.ink).set(0, 8, 6, C.ink).set(-1, 6, 6, C.ink).set(0, 9, 6, C.ink);
  // a drip of goo down the side
  for (let y = 10; y <= 16; y++) g.set(3, y, 4, C.goo, true);
  return g;
}
export const barrelGeo = () => vgeo('barrel', barrelGrid);

// ---------------------------------------------------------------------------
// Hand-held props (V = 0.03): upright, origin at the grip point

const HV = 0.042;
const hgeo = (id, fn) => aoGeometry('lsth_' + id, fn, { scale: HV, pivot: [0, 0, 0], jitter: 0.02, maxSamples: 10 });
/** Beaker: glass body with a liquid band (liquid voxels are white: tint the glow material). */
function beakerGrid() {
  const g = dense(-4, -2, -4, 4, 9, 4);
  for (let y = -2; y <= 7; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const side = Math.abs(x) === 3 || Math.abs(z) === 3;
    const corner = Math.abs(x) === 3 && Math.abs(z) === 3;
    if (corner) continue;
    if (y === -2) g.set(x, y, z, C.glassD);
    else if (side) g.set(x, y, z, y === 7 ? 0xffffff : C.glass);
    else if (y <= 3) g.set(x, y, z, 0xffffff, true);
  }
  g.set(4, 7, 0, C.glass).set(3, 4, 4, C.glassD).set(3, 2, 4, C.glassD).set(3, 0, 4, C.glassD);
  return g;
}
/** Erlenmeyer flask (cone + neck). */
function flaskGrid() {
  const g = dense(-5, -3, -5, 5, 12, 5);
  for (let y = -3; y <= 5; y++) {
    const r = 4.5 - (y + 3) * 0.42;
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      const d = Math.hypot(x, z);
      if (d > r + 0.3) continue;
      if (y === -3) g.set(x, y, z, C.glassD);
      else if (d > r - 0.9) g.set(x, y, z, C.glass);
      else if (y <= 1) g.set(x, y, z, 0xffffff, true);
    }
  }
  for (let y = 6; y <= 10; y++) g.box(-1, y, -1, 1, y, 1, y === 10 ? 0xffffff : C.glass);
  g.box(-1, 11, -1, 1, 11, 1, 0xb08a5a);
  return g;
}
function rodGrid() { return new VoxGrid().box(0, -2, 0, 0, 11, 0, 0xd8e8f0).set(0, -3, 0, C.glassD); }
function markerGrid() {
  const g = new VoxGrid().box(-1, -2, -1, 0, 4, 0, 0xf4f4f4).box(-1, 5, -1, 0, 6, 0, PAL.blue);
  g.set(0, -3, 0, PAL.blue);
  return g;
}
function wrenchGrid() {
  const g = new VoxGrid().box(0, -2, 0, 0, 8, 1, 0xb8c0cc);
  g.box(-2, 9, 0, 2, 10, 1, 0xb8c0cc).box(-2, 11, 0, -2, 12, 1, 0xb8c0cc).box(2, 11, 0, 2, 12, 1, 0xb8c0cc);
  g.box(0, -4, 0, 0, -3, 1, PAL.red);
  return g;
}
function hammerGrid() {
  const g = new VoxGrid().box(0, -3, 0, 1, 7, 1, PAL.wood);
  g.box(-3, 8, -1, 4, 11, 2, C.steelL).box(-3, 8, -1, -3, 11, 2, C.steelHL);
  return g;
}
function syringeGrid() {
  const g = new VoxGrid().box(-1, 0, -1, 1, 8, 1, C.glass).box(0, 1, 0, 0, 5, 0, PAL.pink, true);
  g.box(0, -4, 0, 0, -1, 0, 0xdde4ec).box(-2, 9, -1, 2, 9, 1, 0xdde4ec).box(0, 10, 0, 0, 12, 0, 0xdde4ec).box(-1, 13, -1, 1, 13, 1, 0xdde4ec);
  return g;
}
export const HAND = {
  V: HV,
  beaker: () => hgeo('beaker', beakerGrid),
  flask: () => hgeo('flask', flaskGrid),
  rod: () => hgeo('rod', rodGrid),
  marker: () => hgeo('marker', markerGrid),
  wrench: () => hgeo('wrench', wrenchGrid),
  hammer: () => hgeo('hammer', hammerGrid),
  syringe: () => hgeo('syringe', syringeGrid),
};

// ---------------------------------------------------------------------------
// Branch projects on the bench (V = 0.03, base centre at origin)

function shackGrid() {
  const g = dense(-10, 0, -9, 10, 22, 9);
  cyl(g, 'y', 0, 0, 0, 1, 9, 9, (x, y) => (y === 1 ? C.steelL : C.steelDD)); // turntable
  g.box(-6, 2, -5, 5, 9, 4, (x, y, z) => (y === 2 ? 0x8a6a4a : (x + y) % 4 === 0 ? 0xd8c8a8 : 0xe8dcc0));
  g.box(-1, 2, 5, 0, 6, 5, 0x6e4224); // door
  g.box(2, 5, 5, 4, 7, 5, 0x9dfff0, true); // window
  for (let y = 10; y <= 14; y++) g.box(-7 + (y - 10), y, -6, 6 - (y - 10), y, 5, y % 2 ? PAL.red : PAL.redD); // roof
  g.box(3, 12, -2, 3, 18, -2, C.steelHL); // antenna
  g.set(3, 19, -2, PAL.red, true);
  g.box(-5, 10, 4, -4, 13, 4, C.steelL); // chimney-ish vent
  return g;
}
function plateGrid() {
  const g = dense(-10, 0, -6, 10, 22, 6);
  g.box(-6, 0, -4, 5, 1, 3, C.steelDD); // stand
  g.box(-1, 2, -1, 0, 6, 0, C.steelD);
  for (let x = -8; x <= 7; x++) for (let y = 6; y <= 20; y++) {
    const cut = (x <= -7 || x >= 6) && (y >= 18 || y <= 7);
    if (cut) continue;
    const edge = x === -8 || x === 7 || y === 6 || y === 20;
    let c = edge ? C.steelHL : (y === 13 || y === 14) ? PAL.yellow : 0x8f98aa;
    if (!edge && (x === -6 || x === 5) && (y === 9 || y === 17)) c = C.white; // rivets
    g.box(x, y, 0, x, y, 1, c);
  }
  return g;
}
function potionGrid() {
  const g = dense(-8, 0, -8, 8, 24, 8);
  g.box(-6, 0, -6, 5, 0, 5, C.steelDD);
  blob(g, -0.5, 7, -0.5, 6, 6, 6, (x, y) => (y <= 8 ? 0xffffff : C.glass));
  g.forEach((x, y, z, c) => { if (c === 0xffffff && y <= 8) g.set(x, y, z, 0xffffff, true); });
  for (let y = 13; y <= 18; y++) g.box(-2, y, -2, 1, y, 1, y === 18 ? 0xffffff : C.glass);
  g.box(-2, 19, -2, 1, 21, 1, 0xb08a5a);
  return g;
}
function serumGrid() {
  const g = dense(-12, 0, -8, 12, 26, 9);
  g.box(-10, 0, -7, 9, 2, 6, C.steelD).box(-10, 2, 6, 9, 2, 6, PAL.pink);
  for (const [x, z] of [[-9, -6], [8, -6], [-9, 5], [8, 5]]) g.box(x, 3, z, x, 20, z, C.steelHL);
  for (let y = 3; y <= 19; y++) for (let x = -8; x <= 7; x++) for (let z = -5; z <= 4; z++) {
    const side = x === -8 || x === 7 || z === -5 || z === 4;
    if (side) g.set(x, y, z, C.glass);
    else if (y <= 15) g.set(x, y, z, 0xffffff, true);
  }
  g.box(-10, 21, -7, 9, 22, 6, C.steelD);
  chain(g, [[6, 23, 0], [9, 25, 0], [11, 20, 2]], 0.6, PAL.pink);
  text(g, 'MEGA', -6, 0, 7, '+z', 0xffffff);
  return g;
}
function cellGrid() {
  // a big power cell on a charging cradle: glowing charge window (white: tinted), terminals, cables
  const g = dense(-10, 0, -7, 10, 26, 7);
  g.box(-8, 0, -5, 7, 2, 4, C.steelD).box(-8, 2, 4, 7, 2, 4, PAL.yellow);
  cyl(g, 'y', -0.5, -0.5, 3, 18, 5, 5, (x, y, z) => (y === 3 || y === 18 ? C.steelL : z > 2 && x > -3 && x < 2 && y > 5 && y < 16 ? 0xffffff : y % 5 === 0 ? C.ink : 0x2a3142));
  g.forEach((x, y, z, c) => { if (c === 0xffffff) g.set(x, y, z, 0xffffff, true); });
  g.box(-2, 19, -2, 1, 21, 1, C.steelHL).box(-1, 22, -1, 0, 22, 0, PAL.red);
  chain(g, [[-6, 2, 0], [-9, 8, 1], [-8, 15, 2], [-4, 19, 1]], 0.6, PAL.red);
  chain(g, [[6, 2, 0], [9, 8, 1], [7, 14, 2], [3, 19, 1]], 0.6, C.ink);
  return g;
}
/** Branch project geometries (white glow voxels are tinted by the branch colour). */
export const PROJECT = {
  cell: () => hgeo('pCell', cellGrid),
  shack: () => hgeo('pShack', shackGrid),
  plate: () => hgeo('pPlate', plateGrid),
  potion: () => hgeo('pPotion', potionGrid),
  serum: () => hgeo('pSerum', serumGrid),
};

// ---------------------------------------------------------------------------
// Liquid column for the containment tube (white: tinted by its material),
// pivot at its bottom so scale.y fills it

export function tubeLiquidGeo(Rv, Hv) {
  return aoGeometry(`lst_tubeLiq_${Rv}_${Hv}`, () => {
    const g = dense(-Rv, 0, -Rv, Rv, Hv, Rv);
    cyl(g, 'y', 0, 0, 0, Hv - 1, Rv - 1, Rv - 1, (x, y) => (y === Hv - 1 ? 0xffffff : mixHex(0x707070, 0xffffff, Math.sqrt(Math.floor(y / 4) * 4 / Hv))));
    return g;
  }, { scale: V, pivot: [0.5, 0, 0.5], ao: false, jitter: 0.04 });
}

/** Progress LED column (10 segments) for the tube strut: one mesh per segment state is overkill, so it is a voxel strip lit by a per-segment instanced colour. */
export function ledSegGeo() {
  return aoGeometry('lst_ledSeg', () => new VoxGrid().box(0, 0, 0, 1, 2, 0, 0xffffff, true), { scale: V, pivot: [1, 0, 0], ao: false, jitter: 0 });
}

