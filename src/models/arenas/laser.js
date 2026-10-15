// Arena 11: LASER MAZE VAULT — "World's Deadliest Laser Maze!".
// A night-time high-security vault on a sea cliff: the lane is the laser-maze
// corridor (white tiles, red emitter strips), with beam fences and pulsing
// tripwires behind it, safes bursting with cash, gold-bar pallets, glass
// display cases, panning security cameras, server racks blinking, and the
// giant round BEAST BANK vault door hanging open on its hinge over mountains
// of gold. Searchlight towers sweep the sky, a helicopter and patrol drones
// circle, and a neon city skyline glows across the dark bay.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, mulberry32, bayer,
  paintGradient, paintStars, px, disc, skyTexture, parallaxWidth, canvasTex,
} from './kit.js';
import { pixels, ridge, setInst, liveInst, fitSky, rippleTex, scrollPlane, addParticles, addGlints, zoneDisc, anchor } from './wildsKit.js';

const C = {
  tile: 0xe8ecf2, tileL: 0xf6f8fc, tileD: 0xc8ced8, seam: 0x9aa2b0,
  floor: 0x2a2e3e, floorL: 0x3a4052, floorD: 0x1c1f2c, line: 0x4a5266,
  steel: 0xb8c0cc, steelL: 0xdde3ea, steelD: 0x6b7386, steelDD: 0x3d4352, ink: 0x15121f,
  concrete: 0x8e96a4, concreteD: 0x6c7484, concreteL: 0xa8b0bc,
  red: 0xff3d55, redD: 0xb8203a, redL: 0xff8a9a, laser: 0xff2040,
  gold: 0xffc21a, goldL: 0xffe680, goldD: 0xc8901a, cash: 0x6fcf5f, cashD: 0x3f8f45, cashL: 0xb8f0a0,
  glass: 0x9fd8ff, cyan: 0x5ce1e6, blue: 0x29b6f6, yellow: 0xffd23f, white: 0xf4f6fa, green: 0x5fdc4a,
  velvet: 0x8a1a3a, brass: 0xd8a83a,
};
const LH = FIELD.LANE_HALF;
const ZONE_SCALE = 1.18;

// --------------------------------------------------------------------------- voxel props

/** Vault facade with the round door frame (door separate), "BEAST BANK" sign, gold piles inside. Front +z at z = 0. */
const vaultFacadeGrid = (W = 70, big = true) => () => {
  const g = new VoxGrid();
  const H = 44, R = 17, cy = 20;
  for (let x = -W; x < W; x++) for (let y = 0; y < H; y++) {
    const d = Math.hypot(x + 0.5, y - cy);
    if (d < R) continue; // the door opening
    const panel = ((x + 200) % 14 === 0) || y % 11 === 0;
    let c = panel ? C.concreteD : (hash3(x >> 2, y >> 2, 1) < 0.15 ? C.concreteL : C.concrete);
    if (d < R + 3) c = d < R + 1 ? C.steelDD : ((Math.atan2(y - cy, x + 0.5) * 8 / Math.PI + 16) % 2 < 1 ? C.steel : C.steelL); // ring frame
    for (let z = -6; z <= 0; z++) if (z === 0 || z === -6 || y === H - 1 || x === -W || x === W - 1) g.set(x, y, z, z < 0 && z > -6 ? C.concreteD : c);
  }
  // roof parapet + hazard band + floodlights
  g.box(-W, H, -6, W - 1, H + 1, 1, C.steelDD);
  for (let x = -W; x < W; x++) g.set(x, 2, 1, ((x + 200) >> 2) & 1 ? C.yellow : C.ink);
  // the sign above the door
  const ts = big ? 2 : 1;
  const sw = textW('BEAST BANK', ts) + 8;
  g.box(-Math.floor(sw / 2), H - 4 - 5 * ts, 1, Math.ceil(sw / 2), H - 1, 1, C.ink);
  text(g, 'BEAST BANK', 0, H - 2 - 5 * ts, 2, '+z', C.goldL, { center: true, scale: ts });
  g.box(-Math.floor(sw / 2), H - 4 - 5 * ts, 2, Math.ceil(sw / 2), H - 4 - 5 * ts, 2, C.red, true);
  // vault room: a steel cylinder behind the door with a back wall, floor and mountains of gold + cash
  const fy = cy - R + 2;
  for (let x = -R - 1; x <= R; x++) for (let y = cy - R - 1; y <= cy + R; y++) {
    const d = Math.hypot(x + 0.5, y - cy);
    if (d >= R && d < R + 1.2) for (let z = -17; z <= -1; z++) g.set(x, y, z, (z & 3) === 0 ? C.steelD : C.steelDD);
    if (d < R) g.set(x, y, -18, (x + y) % 6 === 0 ? C.steelD : C.steelDD);
  }
  for (let x = -15; x < 15; x++) for (let z = -17; z <= -1; z++) if (Math.hypot(x + 0.5, fy - cy) < R) g.set(x, fy, z, ((x + z) & 1) ? C.floorL : C.floor);
  for (let x = -13; x < 13; x++) for (let z = -16; z <= -5; z++) {
    const hh = Math.round(10 * Math.max(0, 1 - ((x + 0.5) / 14) ** 2) * (1 - (z + 16) / 16) + hash3(x, 2, z) * 2);
    for (let y = 1; y <= hh; y++) g.set(x, fy + y, z, y === hh ? (hash3(x, y, z) < 0.3 ? C.goldL : C.gold) : ((x + y + z) & 1 ? C.gold : C.goldD));
  }
  for (const [x, z] of [[-12, -4], [9, -4], [-6, -3]]) g.box(x, fy + 1, z, x + 3, fy + 3, z + 1, (xx, y) => ((y & 1) ? C.cash : C.cashD));
  for (const [x, y] of [[-9, 12], [8, 14], [0, 16], [-4, 9]]) g.set(x, fy + y - 4, -12, C.goldL, true); // gleams
  return g;
};
/** The round vault door (bolts, wheel separate), hinge on its left edge (x = 0), face +z. */
const vaultDoorGrid = () => {
  const g = new VoxGrid();
  const R = 16;
  for (let x = 0; x <= 2 * R; x++) for (let y = -R; y <= R; y++) {
    const d = Math.hypot(x - R, y);
    if (d > R) continue;
    for (let z = -4; z <= 0; z++) {
      let c = C.steel;
      if (z === 0) c = d > R - 2 ? C.steelD : d < 5 ? C.steelL : ((Math.atan2(y, x - R) * 6 / Math.PI + 12) % 2 < 1 ? C.steelL : C.steel);
      else c = C.steelD;
      g.set(x, y, z, c);
    }
  }
  // locking bolts around the rim
  for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; g.box(Math.round(R + Math.cos(an) * (R + 1)), Math.round(Math.sin(an) * (R + 1)), -3, Math.round(R + Math.cos(an) * (R + 2)), Math.round(Math.sin(an) * (R + 1)), -1, C.steelL); }
  // hinge barrels
  for (const y of [-10, 9]) g.box(-2, y, -3, 0, y + 1, 0, C.steelDD);
  text(g, '$', R, -2, 1, '+z', C.goldD, { center: true, middle: true, scale: 2 });
  return g;
};
const vaultWheelGrid = () => {
  const g = new VoxGrid();
  for (let a = 0; a < 40; a++) { const an = (a / 40) * Math.PI * 2; g.set(Math.round(Math.cos(an) * 6), Math.round(Math.sin(an) * 6), 0, C.brass); }
  for (let k = 0; k < 3; k++) { const an = (k / 3) * Math.PI; g.line(Math.round(-Math.cos(an) * 8), Math.round(-Math.sin(an) * 8), 0, Math.round(Math.cos(an) * 8), Math.round(Math.sin(an) * 8), 0, C.brass); }
  for (let k = 0; k < 6; k++) { const an = (k / 6) * Math.PI * 2; g.box(Math.round(Math.cos(an) * 8), Math.round(Math.sin(an) * 8), 0, Math.round(Math.cos(an) * 8), Math.round(Math.sin(an) * 8), 1, C.gold); }
  g.box(-1, -1, 0, 1, 1, 1, C.goldL);
  return g;
};
/** Floor-standing safe: closed (dial + handle) or open (cash + gold inside). Faces +z. */
const safeGrid = (open) => () => {
  const g = new VoxGrid();
  const body = open ? 0x3a4a5a : 0x4a5a6a;
  g.box(-5, 0, -4, 4, 11, 4, (x, y, z) => (y === 0 || y === 11 ? C.steelDD : body));
  if (open) {
    g.box(-4, 1, 4, 3, 10, 4, null);
    g.box(-4, 1, -3, 3, 10, 3, null);
    g.box(-4, 1, -3, 3, 1, 3, C.steelDD).box(-4, 5, -3, 3, 5, 3, C.steelD);
    g.box(-4, 2, -2, 3, 4, 2, (x, y) => ((y + x) & 1 ? C.cash : C.cashD));
    g.box(-3, 6, -2, 2, 7, 1, (x, y) => (y === 7 ? C.goldL : C.gold));
    g.box(-6, 1, 5, -6, 10, 11, body).box(-6, 4, 11, -6, 7, 11, C.steelL); // door swung open
    g.box(-1, 2, 5, 2, 3, 8, (x, y) => (y === 3 ? C.cashL : C.cash)); // spilled cash
  } else {
    g.box(-4, 1, 5, 3, 10, 5, (x, y) => (x === -4 || x === 3 || y === 1 || y === 10 ? C.steelD : 0x5a6a7a));
    for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; g.set(Math.round(-1 + Math.cos(an) * 2), Math.round(6 + Math.sin(an) * 2), 6, C.steelL); }
    g.box(-1, 6, 6, -1, 6, 7, C.ink);
    g.box(1, 3, 6, 2, 3, 7, C.brass).box(2, 2, 7, 2, 4, 7, C.brass);
    g.set(-3, 9, 6, C.green, true);
  }
  for (const [x, z] of [[-5, -4], [4, -4], [-5, 4], [4, 4]]) g.set(x, -1, z, C.steelDD);
  g.carve((x, y) => y < 0);
  return g;
};
const goldPalletGrid = () => {
  const g = new VoxGrid();
  g.box(-6, 0, -5, 5, 1, 4, (x, y, z) => (y === 0 && (x & 3) === 0 ? 0x6e4224 : 0xa0673a));
  for (let l = 0; l < 4; l++) for (let x = -5 + l; x <= 4 - l; x += 2) for (let z = -4 + l; z <= 3 - l; z += 3) g.box(x, 2 + l, z, x + 1, 2 + l, z + 1, (xx, y, zz) => ((xx + zz) & 1 ? C.gold : C.goldL));
  g.box(-6, 2, 5, 5, 6, 5, null);
  return g;
};
const cashCartGrid = () => {
  const g = new VoxGrid();
  g.box(-6, 2, -4, 5, 2, 3, C.steelD);
  for (const [x, z] of [[-6, -4], [5, -4], [-6, 3], [5, 3]]) { g.box(x, 0, z, x, 1, z, C.ink); }
  g.box(5, 3, -4, 5, 9, 3, C.steel);
  for (let l = 0; l < 3; l++) for (let x = -5; x <= 3; x += 4) for (let z = -3; z <= 2; z += 3) g.box(x, 3 + l * 2, z, x + 3, 4 + l * 2, z + 1, (xx, y) => (xx === x + 1 ? C.white : (y & 1) ? C.cash : C.cashD));
  return g;
};
const moneyBagGrid = () => {
  const g = new VoxGrid();
  g.ellipsoid(0, 3, 0, 3.4, 3.2, 3.2, (x, y) => (y > 5 ? 0xd8c8a0 : 0xc8b890));
  g.box(-1, 6, -1, 0, 8, 0, 0xb8a880);
  g.box(-2, 8, -1, 1, 8, 0, 0x8a6a3a);
  text(g, '$', -1, 1, 3, '+z', C.cashD, {});
  return g;
};
/** Laser emitter pylon with red lenses (glow). */
const pylonGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -2, 1, 0, 1, C.steelDD);
  g.box(-1, 1, -1, 0, 14, 0, (x, y) => (y === 14 ? C.steelL : y % 5 === 0 ? C.ink : C.steel));
  for (const y of [3, 7, 11]) { g.set(-2, y, -1, C.ink).set(1, y, -1, C.ink); g.set(-2, y, 0, C.laser, true).set(1, y, 0, C.laser, true); }
  g.set(-1, 15, -1, C.red, true);
  return g;
};
/** Horizontal laser beam (thin glow), length along x (16 voxels). */
const beamGrid = () => {
  const g = new VoxGrid();
  for (let x = 0; x < 64; x++) g.set(x, 0, 0, (x & 7) === 0 ? C.redL : C.laser, true);
  return g;
};
const camGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -4, 1, 2, 3, C.white);
  g.box(-1, 0, 4, 0, 1, 4, C.ink);
  g.set(0, 1, 5, C.red, true);
  g.box(-2, 3, -4, 1, 3, 1, C.steelD);
  return g;
};
const camPoleGrid = () => {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 0, 26, 0, C.steelD);
  g.box(-2, 0, -2, 1, 0, 1, C.steelDD);
  g.box(-1, 26, -1, 0, 27, 3, C.steelD);
  return g;
};
const rackGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 20, 2, (x, y, z) => (z === 2 && x > -4 && x < 3 && y > 0 && y < 20 ? (y % 3 === 0 ? C.steelDD : 0x2a2e3a) : C.ink));
  for (let y = 2; y < 20; y += 3) for (let x = -3; x <= 2; x += 2) g.set(x, y, 3, hash3(x, y, 1) < 0.5 ? C.green : C.cyan, true);
  return g;
};
/** Glass display case with a diamond / golden trophy and a velvet plinth. */
const displayGrid = (gem) => () => {
  const g = new VoxGrid();
  g.box(-4, 0, -4, 3, 7, 3, (x, y) => (y === 7 ? C.steelL : C.velvet));
  g.box(-5, 0, -5, 4, 0, 4, C.steelD);
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) g.box(x, 8, z, x, 17, z, C.steelL);
  g.box(-4, 18, -4, 3, 18, 3, C.steelL);
  if (gem) {
    for (let y = 0; y < 5; y++) { const r = y < 2 ? y + 1 : 4 - y; g.box(-r, 9 + y, -r, r - 1, 9 + y, r - 1, y > 2 ? 0xc8f6ff : 0x8fe6ff); }
    g.set(-1, 12, 0, 0xffffff, true);
  } else {
    g.box(-2, 8, -2, 1, 9, 1, C.goldD).box(-1, 10, -1, 0, 11, 0, C.gold).box(-3, 12, -2, 2, 15, 1, C.gold).box(-4, 14, -1, -4, 15, 0, C.gold).box(3, 14, -1, 3, 15, 0, C.gold);
  }
  return g;
};
const signGridL = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 10, 0, C.steelD);
  g.box(-9, 8, 1, 9, 16, 1, C.yellow);
  g.box(-9, 8, 2, 9, 8, 2, C.ink).box(-9, 16, 2, 9, 16, 2, C.ink);
  text(g, 'DANGER', 0, 12, 2, '+z', C.ink, { center: true });
  text(g, 'LASERS', 0, 9, 2, '+z', C.redD, { center: true });
  return g;
};
const towerGrid = () => {
  const g = new VoxGrid();
  for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) g.box(x, 0, z, x, 40, z, C.steelD);
  for (let y = 4; y < 40; y += 8) { g.box(-6, y, -6, 5, y, -6, C.steelDD); g.box(-6, y, 5, 5, y, 5, C.steelDD); g.line(-6, y, -6, 5, y + 7, -6, C.steelDD); g.line(-6, y, 5, 5, y + 7, 5, C.steelDD); }
  g.box(-8, 41, -8, 7, 41, 7, C.steelDD);
  g.box(-7, 42, -7, 6, 49, 6, (x, y, z) => (y > 44 && y < 48 && (Math.abs(x + 0.5) < 6 && Math.abs(z + 0.5) < 6) ? 0x2a3a5a : C.concrete));
  g.box(-8, 50, -8, 7, 51, 7, C.steelDD);
  g.set(-1, 52, -1, C.red, true);
  return g;
};
const spotHeadGrid = () => {
  const g = new VoxGrid();
  g.box(-3, -3, -2, 2, 2, 3, C.steelDD);
  g.box(-2, -2, 4, 1, 1, 4, 0xfff6d0, true);
  return g;
};
const droneGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -2, 1, 1, 1, C.white);
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) { g.line(0, 1, 0, x, 1, z, C.steelD); g.box(x - 1, 2, z, x + 1, 2, z, C.ink); g.box(x, 2, z - 1, x, 2, z + 1, C.ink); }
  g.set(0, 0, 2, C.red, true);
  return g;
};
const stanchionGrid = () => {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 1, 0, 1, C.brass);
  g.box(0, 1, 0, 0, 7, 0, C.brass);
  g.set(0, 8, 0, C.goldL);
  for (let x = 1; x < 12; x++) g.set(x, 6 - Math.round(Math.sin((x / 12) * Math.PI) * 2), 0, C.velvet);
  return g;
};
const billGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -1, 1, 0, 0, C.cash).set(-1, 0, 0, C.cashL).set(0, 0, -1, C.cashD);
  return g;
};
const coinGrid = () => { const g = new VoxGrid(); g.box(-1, 0, -1, 0, 0, 0, C.gold); g.set(-1, 0, -1, C.goldL); return g; };
const tapeGrid = () => {
  const g = new VoxGrid();
  for (let x = -16; x < 16; x++) g.set(x, 0, 0, ((x + 32) >> 1) & 1 ? C.yellow : C.ink).set(x, 0, 1, ((x + 33) >> 1) & 1 ? C.yellow : C.ink);
  return g;
};
const ventGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 0, 2, C.steelDD);
  for (let x = -3; x <= 2; x++) if (x & 1) g.box(x, 0, -2, x, 0, 1, C.ink);
  return g;
};

// --------------------------------------------------------------------------- painted backdrops

function paintCity(ctx, w, h) {
  const P = pixels(ctx, w, h);
  // dark mountains behind the city
  ridge(P, { base: h * 0.5, amp: h * 0.2, freq: 0.014, seed: 5, color: 0x1a1c3a, rim: 0x2a2c5a });
  P.flush();
  // skyline with lit windows, a tall BEAST tower in the middle
  const R = mulberry32(31);
  let x = -4;
  const baseY = Math.round(h * 0.86);
  while (x < w) {
    const bw = 6 + (R() * 12 | 0), bh = 10 + (R() * h * 0.42 | 0);
    const top = baseY - bh;
    const col = R() < 0.5 ? 0x24264a : 0x2c2e58;
    px(ctx, x, top, bw, bh, col);
    px(ctx, x, top, bw, 1, 0x4a4c8a);
    for (let wy = top + 3; wy < baseY - 2; wy += 3) for (let wx = x + 2; wx < x + bw - 1; wx += 2) if (R() < 0.42) px(ctx, wx, wy, 1, 1, R() < 0.7 ? 0xffd890 : R() < 0.5 ? 0x8fe6ff : 0xff8ac0);
    if (R() < 0.4) { px(ctx, x + (bw >> 1), top - 5, 1, 5, col); px(ctx, x + (bw >> 1), top - 6, 1, 1, 0xff3a3a); }
    x += bw + (R() * 3 | 0);
  }
  const tx = Math.round(w * 0.58);
  px(ctx, tx - 5, baseY - 62, 11, 62, 0x30326a);
  px(ctx, tx - 3, baseY - 70, 7, 8, 0x30326a);
  px(ctx, tx, baseY - 82, 1, 12, 0x30326a);
  px(ctx, tx, baseY - 83, 1, 1, 0xff3a3a);
  for (let y = baseY - 60; y < baseY - 2; y += 2) px(ctx, tx - 4, y, 9, 1, (y >> 1) % 3 === 0 ? 0xff3d55 : 0x3a3c7a);
  px(ctx, tx - 4, baseY - 68, 9, 3, 0xffc21a);
  // bay water with reflections
  for (let y = baseY; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const c = y < baseY + 2 ? 0x1a2050 : 0x121838;
    px(ctx, xx, y, 1, 1, c);
    if (bayer(xx, y) < 0.08 && R() < 0.5) px(ctx, xx, y, 2, 1, R() < 0.6 ? 0xffd890 : 0xff8ac0, 0.7);
  }
}
function paintFence(ctx, w, h) {
  const P = pixels(ctx, w, h);
  const base = h - 4;
  // chain-link fence with posts, barbed wire and guard huts
  for (let x = 0; x < w; x++) {
    for (let y = 8; y < base; y++) if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) P.set(x, y, 0x4a5272);
    P.set(x, 8, 0x6a7292);
    if (x % 3 === 0) P.set(x, 6, 0x6a7292).set(x + 1, 5, 0x8a92b2);
    for (let y = base; y < h; y++) P.set(x, y, 0x1c1f30);
  }
  for (let x = 0; x < w; x += 22) P.rect(x, 4, 2, base - 4, 0x5a6282);
  const R = mulberry32(3);
  for (let k = 0; k < 4; k++) {
    const hx = (R() * w) | 0;
    P.rect(hx, base - 18, 12, 18, 0x2a2e48);
    P.rect(hx + 2, base - 15, 8, 4, 0xffd890);
    P.rect(hx - 1, base - 20, 14, 2, 0x3a4060);
  }
  P.flush();
}

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  const sky = skyTexture('laser', [[0, 0x05061a], [0.2, 0x0e1238], [0.38, 0x1e1a52], [0.5, 0x3a1e66], [0.6, 0x7a2a72], [0.7, 0xb03a6a], [1, 0x3a1a4a]], (ctx, w, h) => {
    paintStars(ctx, w, h, { n: 55, ymax: h * 0.42, seed: 11, tint: 0xffc8e0 });
    // crescent moon
    disc(ctx, w * 0.2, h * 0.14, 6, 0xf4f0ff);
    disc(ctx, w * 0.2 + 3, h * 0.14 - 2, 6, 0x0e1238);
    // searchlight beams fanning up from the city
    for (const [bx, ang] of [[0.66, -0.25], [0.74, 0.18], [0.9, -0.1]]) {
      for (let y = Math.round(h * 0.7); y > 0; y--) {
        const t = (h * 0.7 - y) / (h * 0.7);
        const cx = w * bx + Math.tan(ang) * (h * 0.7 - y);
        const hw = 1 + t * 5;
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) if (bayer(x, y) < 0.35 * (1 - t)) px(ctx, x, y, 1, 1, 0xd8d0ff, 0.5);
      }
    }
  });
  fitSky(K, sky);

  // ---- parallax: city skyline across the bay, perimeter fence
  K.parallax('city', { z: -166, y: -6, w: parallaxWidth(-166), h: 44, tw: 400, th: 120, paint: paintCity, fogTint: [0x2a1a4a, 0.18] });
  K.parallax('fence', { z: -92, y: -1, w: parallaxWidth(-92), h: 9, tw: 320, th: 40, paint: paintFence, fogTint: [0x1a1a3a, 0.1] });

  // ---- ground: dark tiled compound with glowing-seam floor near the lane
  K.ground({
    id: 'groundFar', x0: -120, x1: 120, z0: -48, z1: -14, scale: 1,
    color: (x, z) => {
      if (Math.abs(x + 30) < 6 && z < -32 && z > -44) return Math.hypot(x + 30, z + 38) < 4.4 && Math.hypot(x + 30, z + 38) > 3.6 ? C.yellow : C.floorL; // helipad
      if (((x + 200) % 12 === 0) && z < -16) return C.yellow; // parking lines
      return hash3(x, 1, z) < 0.12 ? C.floorL : C.floor;
    },
  });
  K.ground({
    id: 'groundNear', x0: -64, x1: 64, z0: -14, z1: 34, scale: 0.5,
    color: (x, z) => {
      if (Math.abs(z) < LH + 0.3) return C.floorD;
      const ix = Math.floor(x * 2), iz = Math.floor(z * 2);
      if ((ix & 7) === 0 || (iz & 7) === 0) return z > 0 ? 0x3a2030 : C.line; // tile seams (reddish in front)
      if (Math.abs(z - 5) < 0.3 && (ix & 1)) return C.yellow;
      return hash3(ix >> 3, 4, iz >> 3) < 0.2 ? C.floorL : C.floor;
    },
  });
  K.ground({ id: 'groundFront', x0: -100, x1: 100, z0: 34, z1: 84, scale: 1, color: (x, z) => (((x + 200) % 8 === 0 || (z + 200) % 8 === 0) ? C.line : C.floor) });

  // ---- lane: white laser-maze corridor with red emitter strips + vault-dial marker
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.steelDD,
    color: (ix, iz) => {
      if (iz === -10 || iz === 9) return C.steelDD;
      if (iz === -9 || iz === 8) return (ix & 3) === 0 ? C.steelD : C.redD;
      const gx = ((ix % 6) + 6) % 6, gz = ((iz % 6) + 6) % 6;
      if (gx === 0 || gz === 0) return C.seam;
      return hash3(ix / 6 | 0, 2, iz / 6 | 0) < 0.25 ? C.tileL : hash3(ix, 3, iz) < 0.06 ? C.tileD : C.tile;
    },
    raise: (ix, iz) => (iz === -10 || iz === 9) && (ix & 7) === 0,
    raiseColor: () => C.steel,
  });
  // glowing emitter dots along the lane edges (small accents)
  K.mesh('laneLeds', () => {
    const g = new VoxGrid();
    for (let x = -96; x < 96; x += 8) { g.set(x, 0, -9, C.laser, true); g.set(x, 0, 8, C.laser, true); }
    return g;
  }, { scale: 0.25, pivot: [0, 0, 0] }, 0, 0.002, 0);
  K.mesh('dialMarker', () => {
    const g = new VoxGrid();
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
      const r = Math.hypot(x, z);
      if (r > 6.4) continue;
      const a = Math.atan2(z, x);
      g.set(x, 0, z, r > 5.4 ? C.steelD : r < 1.5 ? C.red : (Math.round(a * 20 / Math.PI) % 2 === 0 && r > 4) ? C.steelL : C.steel, r < 1.5);
    }
    return g;
  }, { scale: 0.11, pivot: [0, 0, 0] }, 0.06, 0.003, 1.2);

  // ---- breakables right behind the lane
  const brk = [[-19, 'safe'], [-9.6, 'cart'], [-3.3, 'bag'], [4.4, 'safe'], [10.2, 'gold'], [18.6, 'bag']];
  for (const [x, kind] of brk) {
    if (kind === 'safe') K.breakable('safe', 'safeClosed', safeGrid(false), { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
    else if (kind === 'cart') K.breakable('crate', 'cashCart', cashCartGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
    else if (kind === 'gold') K.breakable('crate', 'goldPallet', goldPalletGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
    else K.breakable('bag', 'moneyBag', moneyBagGrid, { scale: 0.1 }, x, -3.2, K.rand(0, 6));
  }

  // ---- the laser fence behind the lane: pylons + animated beams (on/off pattern + sweeping)
  const pyl = [];
  for (let x = -26; x <= 26; x += 6.5) pyl.push([x, 0, -4.9]);
  K.inst('pylon', pylonGrid, { scale: 0.1, ao: true }, pyl, { shadow: true });
  const beams = liveInst(K, 'beam', beamGrid, { scale: 0.1, pivot: [0, 0.5, 0.5] }, (pyl.length - 1) * 3);
  K.onUpdate((dt, t) => {
    let i = 0;
    for (let k = 0; k < pyl.length - 1; k++) for (let row = 0; row < 3; row++) {
      const on = Math.sin(t * 2.2 + k * 1.3 + row * 2.1) > -0.35;
      const sweep = row === 1 ? Math.sin(t * 1.6 + k) * 0.35 : 0;
      setInst(beams, i++, pyl[k][0] + 0.05, [0.3, 0.75, 1.15][row] + sweep, -4.9, 0, 0, 0, on ? [6.5 / 6.4, 1, 1] : 0.0001);
    }
    beams.instanceMatrix.needsUpdate = true;
  });

  // ---- midground: safes, gold, cash carts, display cases, cameras, servers, signs
  K.inst('safeOpen', safeGrid(true), { scale: 0.12, ao: true }, [[-15.6, 0, -7.6, 0.3], [13.4, 0, -8.2, -0.25]], { shadow: true });
  K.inst('safeShut', safeGrid(false), { scale: 0.12, ao: true }, [[-17.4, 0, -9.4, 0.1], [22, 0, -7.2, -0.4], [-26.6, 0, -6.8, 0.2]], { shadow: true });
  K.inst('goldPallet', goldPalletGrid, { scale: 0.12, ao: true }, [[-6.8, 0, -7.4, 0.2], [7.8, 0, -7.0, -0.1], [-21.4, 0, -6.6, 0.5], [27.4, 0, -9.4, 0.3]], { shadow: true });
  K.inst('cashCart', cashCartGrid, { scale: 0.11, ao: true }, [[-11.8, 0, -6.2, -0.2], [17.4, 0, -6.0, 0.25]], { shadow: true });
  K.inst('moneyBag', moneyBagGrid, { scale: 0.1, ao: true }, [[-5.2, 0, -6.2, 0.3], [-4.2, 0, -6.6, 1.2], [9.6, 0, -5.8, 0.6], [24.2, 0, -6.0, 2]], { shadow: true });
  K.mesh('displayGem', displayGrid(true), { scale: 0.11, ao: true }, -1.2, 0, -8.6, 0, 1, { shadow: true });
  K.mesh('displayTrophy', displayGrid(false), { scale: 0.11, ao: true }, 3.2, 0, -9.0, 0, 1, { shadow: true });
  addGlints(K, [[-1.2, 1.1, -8.4, 0.6, 0.6], [3.2, 1.4, -8.8, 0.6, 0.6], [-15.6, 0.7, -7.2, 0.8, 0.4]], 10);
  K.inst('stanchion', stanchionGrid, { scale: 0.1 }, [[-3.0, 0, -6.6, 0], [1.6, 0, -6.6, 0], [5.6, 0, -7.2, Math.PI]], { shadow: true });
  K.inst('rack', rackGrid, { scale: 0.12, ao: true }, [[-24, 0, -11.6, 0], [-22.8, 0, -11.6, 0], [20.2, 0, -12.2, 0], [21.4, 0, -12.2, 0]], { shadow: true });
  K.mesh('signL', signGridL, { scale: 0.08, ao: true }, -8.8, 0, -5.4, 0.15, 1, { shadow: true });
  K.mesh('signR', signGridL, { scale: 0.08, ao: true }, 12.2, 0, -5.6, -0.15, 1, { shadow: true });
  // security cameras panning
  const cams = [[-13.2, -10.8], [6.2, -11.4], [25, -10.2]];
  K.inst('camPole', camPoleGrid, { scale: 0.1 }, cams.map(([x, z]) => [x, 0, z]), { shadow: true });
  const camHeads = liveInst(K, 'camHead', camGrid, { scale: 0.1, pivot: [0, 0, -4] }, cams.length, { shadow: true });
  K.onUpdate((dt, t) => {
    cams.forEach(([x, z], i) => setInst(camHeads, i, x, 2.62, z + 0.3, Math.sin(t * 0.5 + i * 2) * 0.9, 0.25, 0));
    camHeads.instanceMatrix.needsUpdate = true;
  });
  // server LEDs blinking
  const leds = liveInst(K, 'led', () => { const g = new VoxGrid(); g.set(0, 0, 0, 0xffffff, true); return g; }, { scale: 0.06 }, 24);
  const ledPos = Array.from({ length: 24 }, (_, i) => [[-24, -22.8, 20.2, 21.4][i % 4] + K.rand(-0.35, 0.35), K.rand(0.3, 2.3), [-11.6, -11.6, -12.2, -12.2][i % 4] + 0.36, K.rand(0, 6)]);
  K.onUpdate((dt, t) => {
    ledPos.forEach(([x, y, z, ph], i) => setInst(leds, i, x, y, z, 0, 0, 0, Math.sin(t * 3 + ph * 7) > 0.2 ? 1 : 0.0001));
    leds.instanceMatrix.needsUpdate = true;
  });

  // ---- landmark: the vault + its door swinging on the hinge, gold glow inside
  const VS = 0.2, VX = 1.5, VZ = -27;
  K.mesh('vault', vaultFacadeGrid(70, true), { scale: VS, pivot: [0, 0, 0] }, VX, 0, VZ, 0, 1, { shadow: true });
  const door = K.mesh('vaultDoor', vaultDoorGrid, { scale: VS, pivot: [0, 0, 0] }, VX - 17 * VS, 20 * VS, VZ + 1.2 * VS, 0, 1, { shadow: true });
  const wheel = K.mesh('vaultWheel', vaultWheelGrid, { scale: VS, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { shadow: true });
  door.add(wheel);
  wheel.position.set(16 * VS, 0, 1.5 * VS);
  K.onUpdate((dt, t) => {
    door.rotation.y = -0.85 - Math.sin(t * 0.25) * 0.1;
    wheel.rotation.z = t * 0.6;
  });
  addGlints(K, [[VX, 1.6, VZ - 2.4, 5, 1.6]], 12);
  addParticles(K, 26, [VX - 4, VX + 4, 0.2, 6, VZ + 1, VZ + 4], { color: [C.cash, C.cashL], size: [0.06, 0.12], vy: -0.35, drift: 0.9, seed: 5 }); // fluttering bills
  // guard towers with sweeping searchlights (pixel beam cones, additive)
  const beamTex = canvasTex('lz_beam', 16, 64, (ctx, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = y / h, edge = Math.abs(x - w / 2 + 0.5) / (w / 2);
      if (bayer(x, y) < (1 - edge) * (1 - t * 0.85) * 0.7) px(ctx, x, h - 1 - y, 1, 1, 0xfff6d0);
    }
  });
  for (const [x, z, ph] of [[-21, -19, 0], [23.5, -20, 2.4]]) {
    K.mesh('tower', towerGrid, { scale: 0.18 }, x, 0, z, 0, 1, { shadow: true });
    const head = K.mesh('spotHead', spotHeadGrid, { scale: 0.18, pivot: [0, 0, 0] }, x, 9.6, z + 1.4);
    const cone = new THREE.Mesh(new THREE.PlaneGeometry(6, 34), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    cone.geometry.translate(0, 17, 0);
    cone.renderOrder = 3;
    K.add(cone);
    cone.position.set(x, 9.6, z + 1.4);
    K.onUpdate((dt, t) => {
      const a = Math.sin(t * 0.35 + ph) * 0.7;
      cone.rotation.set(0, 0, a + (x < 0 ? -0.35 : 0.35));
      head.rotation.set(0, 0, a + (x < 0 ? -0.35 : 0.35));
    });
  }
  // helicopter circling with a searchlight + patrol drones
  const heli = new THREE.Group();
  K.add(heli);
  const hb = K.mesh('heliBody', () => {
    const g = new VoxGrid();
    g.ellipsoid(0, 5, 4, 4, 4, 6, (x, yy, z) => (z > 6 && yy > 4 ? 0x8fd8ff : yy === 3 ? C.red : 0x2a2e3a));
    g.box(0, 6, -14, 0, 7, -2, 0x3d4352).box(0, 7, -15, 0, 11, -13, 0x2a2e3a);
    for (const s of [-1, 1]) g.box(s * 4, 0, -2, s * 4, 0, 10, 0x3d4352);
    g.set(0, 2, 10, 0xfff6d0, true).set(0, 12, -14, C.red, true);
    return g;
  }, { scale: 0.12 }, 0, 0, 0, 0, 1, { parent: heli });
  void hb;
  const rotor = K.mesh('heliRotor', () => { const g = new VoxGrid(); for (let k = -12; k <= 12; k++) { g.set(k, 0, 0, 0x4a5262); g.set(0, 0, k, 0x4a5262); } return g; }, { scale: 0.12, pivot: [0.5, 0, 0.5] }, 0, 1.3, 0.5, 0, 1, { parent: heli });
  K.onUpdate((dt, t) => {
    const a = t * 0.1;
    heli.position.set(Math.cos(a) * 18, 10.5 + Math.sin(t * 0.4) * 0.6, -34 + Math.sin(a) * 8);
    heli.rotation.set(0.1, -a + Math.PI, -0.15, 'YXZ');
    rotor.rotation.y = t * 24;
  });
  const drones = liveInst(K, 'drone', droneGrid, { scale: 0.09 }, 4, { shadow: true });
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 4; i++) {
      const a = t * 0.3 * (i & 1 ? -1 : 1) + i * 1.6;
      setInst(drones, i, Math.cos(a) * (8 + i * 5), 4.5 + i * 0.8 + Math.sin(t * 1.4 + i) * 0.3, -12 - i * 2.5 + Math.sin(a) * 3, -a, 0, Math.sin(t * 2 + i) * 0.08);
    }
    drones.instanceMatrix.needsUpdate = true;
  });

  // ---- LOW foreground: floor tripwire lasers (pulsing), hazard tape, vents, scattered cash + coins
  const trip = liveInst(K, 'tripwire', beamGrid, { scale: 0.06, pivot: [32, 0.5, 0.5] }, 6);
  const trips = Array.from({ length: 6 }, (_, i) => [-25 + i * 10 + K.rand(-2, 2), K.rand(8, 24), K.rand(-0.6, 0.6), K.rand(0, 6)]);
  K.onUpdate((dt, t) => {
    trips.forEach(([x, z, r, ph], i) => setInst(trip, i, x, 0.1, z, r + Math.sin(t * 0.3 + ph) * 0.25, 0, 0, Math.sin(t * 1.7 + ph) > -0.3 ? 1 : 0.0001));
    trip.instanceMatrix.needsUpdate = true;
  });
  const bills = [], coins = [], tapes = [], vents = [];
  for (let i = 0; i < 40; i++) bills.push([K.rand(-40, 40), 0.01, K.rand(LH + 0.6, 26), K.rand(0, 6), K.rand(0.9, 1.4)]);
  for (let i = 0; i < 30; i++) coins.push([K.rand(-36, 36), 0.01, K.rand(LH + 0.6, 20), K.rand(0, 6), K.rand(0.9, 1.3)]);
  for (let i = 0; i < 6; i++) tapes.push([K.rand(-34, 34), 0.01, K.rand(8, 28), K.rand(-0.4, 0.4), K.rand(0.9, 1.4)]);
  for (let i = 0; i < 12; i++) vents.push([K.rand(-40, 40), 0.01, K.rand(6, 30), 0, K.rand(1, 1.5)]);
  K.inst('bill', billGrid, { scale: 0.09 }, bills);
  K.inst('coin', coinGrid, { scale: 0.07 }, coins);
  K.inst('tape', tapeGrid, { scale: 0.08 }, tapes);
  K.inst('vent', ventGrid, { scale: 0.12 }, vents);
  // big inlaid BEAST BANK floor logo + guide-light strips
  K.mesh('floorLogo', () => {
    const g = new VoxGrid();
    for (let x = -26; x <= 26; x++) for (let z = -7; z <= 7; z++) if (Math.abs(x) === 26 || Math.abs(z) === 7) g.set(x, 0, z, C.goldD);
    text(g, 'BEAST BANK', 0, 0, 3, '+y', C.gold, { center: true, scale: 2 });
    return g;
  }, { scale: 0.12, pivot: [0, 0, 0] }, -3, 0.004, 15.5);
  K.mesh('guideStrips', () => {
    const g = new VoxGrid();
    for (const z of [0, 60]) for (let x = -200; x < 200; x++) if (((x + 400) % 10) < 6) g.set(x, 0, z, z ? 0x4a2a3a : 0x5a2a3a);
    return g;
  }, { scale: 0.2, pivot: [0, 0, 0] }, 0, 0.003, 7.4);

  return {
    sky,
    fog: { color: 0x241c48, near: 60, far: 200 },
    lights: { sky: 0x9aa8ff, ground: 0x3a2040, hemi: 0.85, sun: 1.5, sunColor: 0xc8d0ff, dir: [-6, 14, 10], rim: 1.5, rimColor: 0xff4a6a },
    dust: 0xc8ced8,
    bloom: { strength: 0.9, threshold: 1.7, radius: 0.3 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  zoneDisc(K, 'zoneVault', {
    r: 22, seed: 1,
    colorTop: (x, z, r, R) => {
      if (r > R - 1.2) return C.yellow;
      const lane = Math.abs(z - 9) < 3;
      if (lane) return ((x + 40) % 6 === 0) ? C.seam : C.tile;
      return ((x & 3) === 0 || (z & 3) === 0) ? C.line : hash3(x >> 2, 3, z >> 2) < 0.2 ? C.floorL : C.floor;
    },
    colorSide: (x, y) => (y === -1 ? C.steelD : (x + y) & 1 ? C.concrete : C.concreteD),
  });
  const VS = 0.07;
  K.mesh('vault', vaultFacadeGrid(38, false), { scale: VS, pivot: [0, 0, 0] }, 0, 0, -2.8, 0, 1, { shadow: true });
  const door = K.mesh('vaultDoor', vaultDoorGrid, { scale: VS, pivot: [0, 0, 0] }, -17 * VS, 20 * VS, -2.8 + 1.2 * VS, 0, 1, { shadow: true });
  const wheel = K.mesh('vaultWheel', vaultWheelGrid, { scale: VS, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { shadow: true });
  door.add(wheel);
  wheel.position.set(16 * VS, 0, 1.5 * VS);
  K.onUpdate((dt, t) => { door.rotation.y = -1.25 - Math.sin(t * 0.25) * 0.12; wheel.rotation.z = t * 0.6; });
  // the laser maze courtyard: pylons + beams criss-crossing
  const pyl = [[-4.6, 1.2], [-1.6, 1.2], [1.6, 1.2], [4.6, 1.2], [-4.6, 3.6], [4.6, 3.6]];
  K.inst('pylon', pylonGrid, { scale: 0.06, ao: true }, pyl.map(([x, z]) => [x, 0, z]), { shadow: true });
  const beams = liveInst(K, 'beam', beamGrid, { scale: 0.05, pivot: [0, 0.5, 0.5] }, 9);
  K.onUpdate((dt, t) => {
    let i = 0;
    for (let k = 0; k < 3; k++) for (const y of [0.2, 0.45, 0.7]) {
      const on = Math.sin(t * 2 + k * 1.7 + y * 9) > -0.3;
      setInst(beams, i++, pyl[k][0], y + (y === 0.45 ? Math.sin(t * 1.5 + k) * 0.15 : 0), 1.2, 0, 0, 0, on ? [3 / 3.2, 1, 1] : 0.0001);
    }
    beams.instanceMatrix.needsUpdate = true;
  });
  K.inst('safeOpen', safeGrid(true), { scale: 0.06, ao: true }, [[-3.6, 0, 4.6, 0.4], [4.2, 0, 4.8, -0.5]], { shadow: true });
  K.inst('goldPallet', goldPalletGrid, { scale: 0.06, ao: true }, [[-1.2, 0, 5.4, 0.2], [1.8, 0, 3.0, -0.3], [-5.2, 0, 1.0, 0.5]], { shadow: true });
  K.mesh('displayGem', displayGrid(true), { scale: 0.06, ao: true }, 0.4, 0, 2.6, 0, 1, { shadow: true });
  K.inst('camPole', camPoleGrid, { scale: 0.06 }, [[5.0, 0, -0.4], [-5.4, 0, 3.4]], { shadow: true });
  const camHeads = liveInst(K, 'camHead', camGrid, { scale: 0.06, pivot: [0, 0, -4] }, 2, { shadow: true });
  K.onUpdate((dt, t) => {
    [[5.0, -0.4], [-5.4, 3.4]].forEach(([x, z], i) => setInst(camHeads, i, x, 1.58, z + 0.18, Math.sin(t * 0.5 + i * 2) * 0.9 + (i ? 0.6 : -0.6), 0.25, 0));
    camHeads.instanceMatrix.needsUpdate = true;
  });
  addGlints(K, [[0, 0.8, -3.6, 1.6, 0.8], [0.4, 0.7, 2.6, 0.3, 0.3]], 8);
  const drones = liveInst(K, 'drone', droneGrid, { scale: 0.06 }, 2, { shadow: true });
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 2; i++) { const a = t * 0.4 * (i ? -1 : 1) + i * 3; setInst(drones, i, Math.cos(a) * 4.5, 3.2 + i * 0.6 + Math.sin(t * 1.4 + i) * 0.2, 1 + Math.sin(a) * 3, -a); }
    drones.instanceMatrix.needsUpdate = true;
  });
  anchor(K, 'boss', -2.4, 0, 5.2);
  anchor(K, 'npc', 2.4, 0, 5.6);
  anchor(K, 'enterVault', 0, 1.2, -2.0);
  K.root.scale.setScalar(ZONE_SCALE); // fill the plinth
  return { focus: [0, 1.2, 0], radius: 7 };
}
