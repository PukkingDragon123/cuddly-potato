// Arena 13: TEAMSEAS REEF — "I Cleaned The World's Dirtiest Beach #TeamSeas".
// The lane is a wooden pier over a crystal-clear reef: through the water in
// front you see coral heads, seagrass, starfish, schools of fish and a sea
// turtle. Behind the pier the cleanup crew's sandbar camp (tents, recycling
// bins, mountains of collected trash bags, the 30M LBS scoreboard), then the
// lagoon with a coral-covered shipwreck, the solar trash barge with its
// conveyor eating the trash a floating boom funnels in, cleanup boats,
// leaping dolphins and a lighthouse on a rock arch, under a bright tropical sky.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, mulberry32, bayer,
  paintGradient, paintClouds, px, disc, skyTexture, parallaxWidth, canvasTex, rockGrid,
} from './kit.js';
import { pixels, ridge, setInst, liveInst, fitSky, rippleTex, scrollPlane, addFlyers, orbitList, addParticles, addGlints, zoneDisc, anchor } from './wildsKit.js';
import { ENV_GRIDS } from '../props/environment.js';

const C = {
  sand: 0xfbe6b4, sandL: 0xfff2d0, sandD: 0xecd09a, sandW: 0xd8b880, wet: 0xc8a874, seabed: 0xe8d8a8, seabedD: 0xc8b888,
  plank: 0xc08a52, plankL: 0xd8a066, plankD: 0x8a5a30, rope: 0xd8c08a, post: 0x6e4a2a,
  sea: 0x29e0ff, seaL: 0x8ff4ff, seaD: 0x1aa8d0, deep: 0x1a6ab0,
  coralP: 0xff6fb0, coralO: 0xff8a4a, coralV: 0xb05cff, coralY: 0xffd23f, coralC: 0x5ce1e6, grass: 0x3fae6a, grassL: 0x6ad08a,
  blue: 0x1d9bf0, blueD: 0x1477c9, teal: 0x29e0ff, green: 0x5fdc4a, greenD: 0x2f9a3a, yellow: 0xffd23f, red: 0xe8343c, white: 0xf6f8fc,
  ink: 0x15121f, bag: 0x2a2a34, bagL: 0x3a3a48, steel: 0xb8c0cc, steelD: 0x6b7386, steelDD: 0x3d4352, solar: 0x2a3a8a, solarL: 0x4a6ac8,
  rust: 0x9a5a3a, rustD: 0x6a3a26, wood: 0x8a5a34, woodD: 0x5a3a20, woodL: 0xa87a4a, moss: 0x4a8a5a, barn: 0xb8c0a8,
  orange: 0xff8a1a, palm: 0x4cba3a, rock: 0x9a9080, rockD: 0x7a7060,
};
const LH = FIELD.LANE_HALF;
const ZONE_SCALE = 1.18;
const BACK = (x) => -14.5 - vnoise(x * 0.06, 3, 1) * 5 + (Math.abs(x) > 40 ? 6 : 0); // sandbar's far shore

// --------------------------------------------------------------------------- voxel props

/** Coral head (brain dome + staghorn + fan), several palettes. */
const coralGrid = (seed) => () => {
  const g = new VoxGrid();
  const cols = [C.coralP, C.coralO, C.coralV, C.coralY, C.coralC];
  const c1 = cols[seed % 5], c2 = cols[(seed + 2) % 5], c3 = cols[(seed + 4) % 5];
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) for (let y = 0; y <= 4; y++) {
    if ((x / 4.4) ** 2 + (z / 4.4) ** 2 + (y / 3.6) ** 2 > 1) continue;
    g.set(x, y, z, (Math.abs(x) + y + Math.abs(z)) % 3 === 0 ? shade(c1, -0.2) : c1);
  }
  for (const [dx, dz] of [[4, 3], [-3, 4], [3, -4], [-5, -1]]) {
    g.line(dx, 0, dz, dx, 6, dz, c2);
    g.line(dx, 3, dz, dx + Math.sign(dx) * 2, 7, dz, c2);
    g.line(dx, 4, dz, dx, 8, dz + Math.sign(dz), shade(c2, 0.15));
    g.set(dx, 7, dz, shade(c2, 0.3));
  }
  // sea fan
  for (let y = 0; y < 8; y++) for (let x = -3; x <= 3; x++) if ((x * x) / 9 + ((y - 4) ** 2) / 16 < 1 && (x + y) % 2 === 0) g.set(x - 6, y, 2, c3);
  return g;
};
const seagrassGrid = () => {
  const g = new VoxGrid();
  for (let k = 0; k < 7; k++) {
    const x = Math.round((hash3(k, 1, 1) - 0.5) * 6), z = Math.round((hash3(k, 2, 1) - 0.5) * 6), h = 4 + Math.floor(hash3(k, 3, 1) * 6);
    for (let y = 0; y < h; y++) g.set(x + Math.round(Math.sin(y * 0.6 + k) * 0.6), y, z, y > h - 3 ? C.grassL : C.grass);
  }
  return g;
};
const starfishGrid = () => {
  const g = new VoxGrid();
  g.set(0, 0, 0, 0xff7a4a);
  for (let a = 0; a < 5; a++) for (let r = 1; r <= 2; r++) g.set(Math.round(Math.cos(a * 1.2566 - 1.57) * r), 0, Math.round(Math.sin(a * 1.2566 - 1.57) * r), r === 2 ? 0xff9a6a : 0xff7a4a);
  return g;
};
const shellGrid = () => { const g = new VoxGrid(); g.box(-1, 0, -1, 1, 0, 0, 0xffd0c0).set(0, 1, -1, 0xffe8e0).set(-1, 0, 1, 0xffa890); return g; };
const fishGrid = (body, fin, stripe) => () => {
  const g = new VoxGrid();
  g.box(-1, 0, -2, 0, 2, 2, body);
  g.box(-1, 1, 3, 0, 1, 3, body);
  g.box(-1, 0, -3, 0, 2, -3, fin).set(-1, 3, 0, fin).set(0, 3, 0, fin);
  if (stripe) g.box(-1, 0, 0, 0, 2, 0, stripe);
  g.set(-2, 2, 2, C.ink).set(1, 2, 2, C.ink);
  return g;
};
const turtleGrid = () => {
  const g = new VoxGrid();
  g.ellipsoid(0, 1, 0, 5, 2, 6, (x, y, z) => (y > 1 ? ((x + z) % 3 === 0 ? 0x5a7a3a : 0x6a8a4a) : 0xd8c890));
  g.box(-1, 0, 6, 0, 2, 9, 0x8aa86a).set(-1, 2, 8, C.ink).set(0, 2, 8, C.ink);
  for (const s of [-1, 1]) { g.box(s * 5, 1, 2, s * 9, 1, 4, 0x8aa86a); g.box(s * 4, 1, -5, s * 6, 1, -4, 0x8aa86a); }
  return g;
};
const dolphinGrid = () => {
  const g = new VoxGrid();
  for (let z = -9; z <= 9; z++) { const r = z > 6 ? 1 : z < -6 ? 0.6 : 2.2 - Math.abs(z) * 0.1; for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if (x * x + y * y <= r * r + 0.5) g.set(x, y, z, y < 0 ? 0xd8e4ec : 0x6a8aa8); }
  g.box(0, 2, 0, 0, 4, 2, 0x5a7a98);
  g.box(-4, 0, -9, 4, 0, -9, 0x5a7a98);
  g.box(0, 0, 10, 0, 0, 12, 0x6a8aa8);
  g.set(-2, 1, 7, C.ink).set(2, 1, 7, C.ink);
  return g;
};
/** Wooden galleon wreck broken amidships, tilted, coral growing on it. Bow toward +x. */
const wreckGrid = () => {
  const g = new VoxGrid();
  const W = [C.wood, C.woodL, 0x7a4a2a];
  const L = 70;
  for (let x = 0; x < L; x++) {
    if (x > 30 && x < 37) continue; // broken in two
    const t = x / L;
    const hw = 9 * Math.sin(Math.min(1, t * 1.6 + 0.15) * Math.PI * 0.5) * (x > 56 ? Math.sqrt(Math.max(0, 1 - ((x - 56) / 14) ** 2)) : 1);
    const top = 12 + (x < 10 ? 4 : 0) + (x > 60 ? Math.round((x - 60) * 0.4) : 0);
    for (let y = 0; y <= top; y++) {
      const w = Math.max(0.8, hw - (y < 4 ? (4 - y) * 1.4 : 0));
      for (let z = -Math.ceil(w); z < Math.ceil(w); z++) {
        if (Math.abs(z + 0.5) > w) continue;
        const shell = Math.abs(z + 0.5) > w - 1.3 || y === 0 || x === 30 || x === 37;
        if (!shell) continue;
        let c = y < 4 ? (hash3(x, y, z) < 0.4 ? C.barn : C.moss) : y === 9 ? C.woodD : W[(y + (x >> 3)) % 3];
        if (y < 7 && hash3(x >> 1, y >> 1, z) < 0.12) c = [C.coralP, C.coralO, C.coralV][(x + y) % 3];
        g.set(x, y, z, c);
      }
    }
  }
  // decks + broken masts + tattered sail + crow's nest
  for (let x = 2; x < L - 6; x++) if (x < 30 || x > 37) for (let z = -7; z <= 6; z++) if (hash3(x >> 1, 3, z >> 1) < 0.6) g.set(x, 11, z, (x & 1) ? 0xa87a4a : 0x946a40);
  g.box(15, 11, -1, 16, 36, 0, C.woodD);
  g.box(8, 30, -1, 23, 30, 0, C.woodD);
  for (let y = 18; y < 30; y++) for (let x = 9; x <= 22; x++) if (hash3(x, y, 2) > 0.16 + (30 - y) * 0.015) g.set(x, y, 1, (x + y) % 6 === 0 ? 0xc8b896 : 0xe8dcc0);
  g.box(13, 34, -2, 18, 35, 1, C.woodD);
  g.line(46, 11, -1, 52, 24, -1, C.woodD, 0);
  g.line(L - 2, 14, 0, L + 10, 20, 0, C.woodD, 0);
  return g;
};
/** Solar trash barge: pontoons, conveyor ramp at the bow (belt animated separately), dumpsters, solar roof. Faces +z (bow toward the boom). */
const bargeGrid = () => {
  const g = new VoxGrid();
  for (const x of [-12, 10]) g.box(x, 0, -20, x + 2, 3, 16, (xx, y) => (y === 3 ? C.white : C.blue));
  g.box(-12, 4, -20, 12, 4, 14, C.steelD);
  for (let z = -18; z <= 8; z += 9) { g.box(-10, 5, z, -2, 10, z + 7, (x, y) => (y === 10 ? C.steelDD : (x & 1) ? C.green : C.greenD)); g.box(1, 5, z, 9, 10, z + 7, (x, y) => (y === 10 ? C.steelDD : (x & 1) ? C.yellow : 0xd8a81a)); }
  for (const [x, z] of [[-12, -20], [12, -20], [-12, 13], [12, 13]]) g.box(x, 5, z, x, 18, z, C.steel);
  g.box(-13, 19, -21, 13, 19, 14, (x, y, z) => ((x + 40) % 5 === 0 || (z + 40) % 6 === 0 ? C.steel : C.solar));
  for (let x = -12; x <= 12; x += 2) g.set(x, 20, -4, C.solarL);
  // conveyor ramp frame
  for (let k = 0; k < 18; k++) for (const x of [-4, 3]) { g.set(x, 10 - Math.round(k * 0.55), 15 + k, C.steelD); g.set(x, 11 - Math.round(k * 0.55), 15 + k, k % 3 ? C.steel : C.yellow); }
  for (const x of [-4, 3]) g.box(x, 5, 23, x, 6, 23, C.steel);
  text(g, 'TEAMSEAS', -14, 6, -4, '-x', C.white, {});
  text(g, 'TEAMSEAS', 15, 6, 4, '+x', C.white, {});
  return g;
};
/** One conveyor belt segment frame (animated pixel texture would be a plane; we use instanced cleats). */
const cleatGrid = () => { const g = new VoxGrid(); g.box(-3, 0, 0, 2, 0, 0, C.ink); g.box(-3, 1, 0, 2, 1, 0, 0x4a4a54); return g; };
const boomGrid = () => {
  const g = new VoxGrid();
  g.box(-8, 0, -1, 7, 1, 0, (x) => (((x + 8) >> 2) & 1 ? C.yellow : C.orange));
  g.box(-8, -2, -1, 7, -1, -1, 0x2a3a3a);
  return g;
};
const trashGrid = (seed) => () => {
  const g = new VoxGrid();
  const cols = [0x5ce1e6, 0xffffff, C.red, C.green, C.yellow, 0x3a6a9a];
  for (let k = 0; k < 5; k++) {
    const x = Math.round((hash3(seed, k, 1) - 0.5) * 8), z = Math.round((hash3(seed, k, 2) - 0.5) * 8), c = cols[Math.floor(hash3(seed, k, 3) * cols.length)];
    if (k % 2 === 0) g.box(x, 0, z, x + 2, 0, z, c).set(x + 3, 0, z, 0xffffff);
    else g.box(x, 0, z, x + 1, 0, z + 1, c);
  }
  return g;
};
const bagPileGrid = () => {
  const g = new VoxGrid();
  for (const [x, z, y] of [[-4, 0, 0], [1, -1, 0], [5, 1, 0], [-1, 2, 0], [-2, -1, 3], [3, 0, 3], [0, 0, 6]]) {
    g.ellipsoid(x, y + 2, z, 2.6, 2.2, 2.4, (xx, yy) => (yy > y + 3 ? C.bagL : C.bag));
    g.set(x, y + 5, z, C.yellow);
  }
  return g;
};
const binGrid = (col, label) => () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 2, 7, 2, (x, y) => (y === 7 ? shade(col, -0.25) : col));
  g.box(-4, 8, -3, 3, 8, 3, shade(col, -0.25));
  g.box(-2, 3, 3, 1, 5, 3, C.white);
  if (label) g.set(-1, 4, 4, col).set(0, 4, 4, col);
  return g;
};
const tentGrid = () => {
  const g = new VoxGrid();
  for (const [x, z] of [[-10, -7], [9, -7], [-10, 6], [9, 6]]) g.box(x, 0, z, x, 11, z, C.steel);
  for (let x = -11; x <= 10; x++) for (let z = -8; z <= 7; z++) g.set(x, 12 + (Math.abs(x + 0.5) < 4 ? 1 : 0), z, ((x + 40) >> 2) & 1 ? C.blue : C.white);
  g.box(-11, 9, 7, 10, 11, 7, C.blue);
  text(g, 'TEAMSEAS', 0, 9, 8, '+z', C.white, { center: true });
  g.box(-6, 0, -3, 5, 3, 1, C.white).box(-6, 4, -3, 5, 4, 1, C.steelD); // table
  for (const x of [-4, 0, 3]) g.box(x, 5, -2, x, 6, -2, 0x5ce1e6); // water bottles
  return g;
};
const scoreGrid = () => {
  const g = new VoxGrid();
  for (const x of [-16, 15]) g.box(x, 0, 0, x, 20, 0, C.steelD);
  g.box(-17, 10, 1, 16, 22, 1, C.blueD);
  g.box(-16, 11, 2, 15, 21, 2, C.ink);
  text(g, 'TEAMSEAS', 0, 17, 3, '+z', C.teal, { center: true });
  text(g, '30M LBS', 0, 12, 3, '+z', C.yellow, { center: true });
  return g;
};
const lifeguardGrid = () => {
  const g = new VoxGrid();
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) g.line(x, 0, z, x > 0 ? 2 : -3, 14, z > 0 ? 2 : -3, C.white);
  g.box(-5, 14, -5, 4, 15, 4, C.woodL);
  g.box(-4, 16, -4, 3, 22, 3, (x, y, z) => (z === 3 && y > 17 && y < 21 ? 0x8fd8ff : y === 22 ? C.red : C.red));
  g.box(-5, 23, -5, 4, 23, 4, C.white);
  g.box(0, 24, 0, 0, 30, 0, C.steel).box(1, 27, 0, 4, 30, 0, C.teal);
  return g;
};
const archRockGrid = () => {
  const g = new VoxGrid();
  for (let x = -26; x <= 26; x++) for (let y = 0; y < 36; y++) for (let z = -8; z <= 8; z++) {
    const legs = Math.abs(Math.abs(x) - 18) < 8 - y * 0.08;
    const span = y > 22 && y < 32 - Math.abs(x) * 0.15;
    if (!legs && !span) continue;
    const r = Math.hypot(x * 0.4, z) + vnoise(x * 0.2, y * 0.2, z * 0.2) * 3;
    if (r > 8.5) continue;
    g.set(x, y, z, hash3(x >> 1, y >> 1, z) < 0.3 ? C.rockD : y > 30 ? 0x5aa84a : C.rock);
  }
  // lighthouse on top
  for (let y = 0; y < 22; y++) g.cylinder(-0.5, -0.5, 34 + y, 34 + y, 2.6 - y * 0.03, Math.floor(y / 4) % 2 ? C.red : C.white);
  g.cylinder(-0.5, -0.5, 56, 58, 2.2, 0xfff2a0, 'y', true);
  g.cylinder(-0.5, -0.5, 59, 60, 2.6, C.red);
  return g;
};
const boatGrid = () => {
  const g = new VoxGrid();
  const L = 26;
  for (let z = 0; z < L; z++) {
    const hw = z < 17 ? 5 : 5 * Math.sqrt(Math.max(0, 1 - ((z - 17) / 9) ** 2));
    for (let y = 0; y <= 4; y++) for (let x = -5; x < 5; x++) { if (Math.abs(x + 0.5) > Math.max(0.6, hw - (y === 0 ? 1.5 : 0))) continue; g.set(x, y, z, y <= 1 ? C.blueD : y === 3 ? C.teal : C.white); }
  }
  g.box(-3, 5, 6, 2, 9, 12, (x, y) => (y === 9 ? C.teal : C.white));
  g.box(-2, 7, 12, 1, 8, 12, 0x24324e);
  g.line(-4, 5, 2, 0, 13, -2, C.orange).line(3, 5, 2, -1, 13, -2, C.orange);
  for (let x = -2; x <= 1; x++) for (let y = 7; y <= 11; y++) if ((x + y) & 1) g.set(x, y, -3, 0x4a5a5a);
  g.set(-1, 8, -4, C.teal).set(0, 10, -4, C.red);
  return g;
};
const pilingGrid = () => { const g = new VoxGrid(); g.box(-1, -12, -1, 0, 1, 0, (x, y) => (y < -4 ? 0x4a6a5a : C.post)); g.set(-1, 2, -1, C.rope); return g; };
const buoyGrid = (c) => () => {
  const g = new VoxGrid();
  g.ellipsoid(0, 2, 0, 2.4, 2.4, 2.4, (x, y) => (y > 3 ? C.white : c));
  g.box(0, 5, 0, 0, 7, 0, C.steelD);
  g.set(0, 8, 0, c === C.red ? 0xff5a5a : 0x7aff7a, true);
  return g;
};
const crabGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -1, 1, 1, 1, C.red);
  g.set(-1, 2, 1, 0xffffff).set(0, 2, 1, 0xffffff).set(-1, 3, 1, C.ink).set(0, 3, 1, C.ink);
  for (const sx of [-3, 2]) { g.set(sx, 0, 0, 0xa8202a); g.set(sx, 1, 1, C.red); g.set(sx, 2, 2, C.red); }
  return g;
};
const barrelGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) g.cylinder(-0.5, -0.5, y, y, 2.8, y === 1 || y === 6 ? 0x2a5a8a : 0x3a7ab8);
  g.box(-1, 3, 3, 0, 4, 3, C.white);
  return g;
};
const kayakGrid = () => {
  const g = new VoxGrid();
  for (let x = -12; x <= 12; x++) { const hw = Math.round(2.2 * Math.sqrt(1 - (x / 13) ** 2)); g.box(x, 0, -hw, x, 1, hw, Math.abs(x) < 3 ? C.ink : C.orange); }
  g.line(-6, 3, -3, 6, 1, 3, C.steel).box(-7, 3, -4, -6, 3, -2, C.yellow);
  return g;
};

// --------------------------------------------------------------------------- painted backdrops

function paintHorizon(ctx, w, h) {
  const P = pixels(ctx, w, h);
  const hz = Math.round(h * 0.72);
  // distant islands + the cleanup mothership
  const R = mulberry32(6);
  for (let i = 0; i < 5; i++) {
    const cx = R() * w | 0, iw = 14 + (R() * 24 | 0), ih = 4 + (R() * 8 | 0);
    for (let x = -iw; x <= iw; x++) { const t = 1 - (x / iw) ** 2; const hh = Math.round(ih * Math.sqrt(Math.max(0, t))); for (let y = 0; y < hh; y++) P.set(cx + x, hz - y, y < 1 ? 0xf0e0b0 : x < 0 ? 0x5ab07a : 0x4a9a6a); }
  }
  const sx = Math.round(w * 0.36);
  P.rect(sx - 30, hz - 6, 60, 6, 0x3a5a8a);
  P.rect(sx - 26, hz - 9, 14, 3, 0xe8eef6);
  P.rect(sx + 8, hz - 14, 10, 8, 0xe8eef6);
  P.rect(sx + 12, hz - 20, 2, 6, 0x3a5a8a);
  P.rect(sx - 8, hz - 12, 3, 6, C.orange);
  for (let x = sx - 28; x < sx + 28; x += 3) P.set(x, hz - 4, 0xffffff);
  // sea band + sparkles
  for (let y = hz; y < h; y++) for (let x = 0; x < w; x++) {
    P.set(x, y, y < hz + 2 ? 0x6ad8f0 : y < hz + 6 ? 0x3ab8e8 : 0x2a9ad8);
    if (bayer(x, y) < 0.04 && R() < 0.6) P.set(x, y, 0xffffff);
  }
  P.flush();
}
function paintIslets(ctx, w, h) {
  const P = pixels(ctx, w, h);
  const wl = Math.round(h * 0.8);
  const R = mulberry32(14);
  for (const [fx, iw, ih] of [[0.12, 30, 8], [0.42, 18, 5], [0.68, 36, 10], [0.92, 22, 6]]) {
    const cx = Math.round(fx * w);
    for (let x = -iw; x <= iw; x++) {
      const t = 1 - (x / iw) ** 2;
      const hh = Math.round(ih * Math.pow(Math.max(0, t), 0.6));
      for (let y = 0; y < hh; y++) P.set(cx + x, wl - 1 - y, y < 2 ? 0xfff0c8 : y > hh - 3 ? 0x5ab84a : 0x4aa84a);
    }
    for (let k = 0; k < 4; k++) {
      const x = cx - iw * 0.5 + R() * iw | 0, b = wl - Math.round(ih * 0.6);
      for (let y = 0; y < 9; y++) P.set(x + (y > 5 ? 1 : 0), b - y, 0x8a6a3a);
      for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) for (let j = 1; j <= 4; j++) P.set(x + 1 + dx * j, b - 9 + dy * Math.round(j * j / 5), j & 1 ? 0x3aa83a : 0x2a8a3a);
    }
  }
  for (let y = wl; y < h; y++) for (let x = 0; x < w; x++) P.set(x, y, (x + y * 3) % 11 === 0 ? 0x7ae8f8 : 0x3ac8e8);
  P.flush();
}

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  const sky = skyTexture('reef', [[0, 0x1a7ae0], [0.3, 0x3aa8f4], [0.55, 0x7ad4fc], [0.78, 0xbcecff], [1, 0xe8fbff]], (ctx, w, h) => {
    for (let k = 3; k >= 1; k--) { ctx.globalAlpha = 0.12 * k; disc(ctx, w * 0.22, h * 0.16, 8 + k * 4, 0xffffe0); }
    ctx.globalAlpha = 1;
    disc(ctx, w * 0.22, h * 0.16, 7, 0xfffff0);
    paintClouds(ctx, w, h, { n: 4, y0: 8, y1: h * 0.3, size: 5, seed: 61, shade: 0xc8e4f8 });
    paintClouds(ctx, w, h, { n: 4, y0: h * 0.44, y1: h * 0.56, size: 3, seed: 9, shade: 0xd4ecfa });
  });
  fitSky(K, sky);
  K.parallax('horizon', { z: -166, y: -3, w: parallaxWidth(-166), h: 22, tw: 400, th: 64, paint: paintHorizon, fogTint: [0xc8f0ff, 0.2] });
  K.parallax('islets', { z: -118, y: -2, w: parallaxWidth(-118), h: 12, tw: 340, th: 44, paint: paintIslets, fogTint: [0xc8f0ff, 0.1] });

  // ---- water: lagoon behind the sandbar, the clear reef in front (transparent over a coral seabed)
  const tLag = rippleTex('rf_lagoon', 0xd8f4f8, 0xffffff, 0xb0dce8, 0xffffff);
  scrollPlane(K, { tex: tLag, w: 460, d: 150, y: -0.32, z: -90, tile: 9, sx: 0.006, grad: (t) => (t < 0.6 ? mixHex(0x1a78c8, 0x1aa8d8, t / 0.6) : mixHex(0x1aa8d8, 0x3ad8e8, (t - 0.6) / 0.4)), name: 'lagoon' });
  const tReef = rippleTex('rf_reef', 0x9ae8f4, 0xffffff, 0x6ad0e8, 0xffffff, { n: 30, sparks: 9 });
  const reefWater = scrollPlane(K, { tex: tReef, w: 220, d: 90, y: -0.16, z: 2.4 + 45, tile: 5, sx: 0.012, sy: -0.008, grad: (t) => mixHex(0x3ad8f0, 0x1a98d8, t), name: 'reefWater' });
  reefWater.material.transparent = true;
  reefWater.material.opacity = 0.38;
  reefWater.material.depthWrite = false;
  reefWater.renderOrder = 2;
  K.ground({
    id: 'seabed', x0: -90, x1: 90, z0: 2, z1: 80, scale: 0.5, y: -1.15,
    color: (x, z) => {
      const n = vnoise(x * 0.15, 6, z * 0.15), m = hash3(Math.floor(x * 2), 3, Math.floor(z * 2));
      if (m < 0.02) return 0xffffff;
      if (n > 0.66) return C.seabedD;
      if (vnoise(x * 0.08, 2, z * 0.08) > 0.68) return m < 0.5 ? 0x3a9a6a : 0x4aaa7a; // seagrass meadow
      return m < 0.5 ? C.seabed : C.sand;
    },
  });
  // ---- sandbar behind the lane (cleanup camp)
  const sandCol = (x, z) => {
    const n = vnoise(x * 0.09, 3, z * 0.12), m = hash3(Math.floor(x * 2), 4, Math.floor(z * 2));
    if (m < 0.012) return [0xffd0c0, 0xffffff, 0xd8c0a0][Math.floor(m * 250) % 3];
    return n > 0.64 ? C.sandL : n < 0.3 ? C.sandD : C.sand;
  };
  K.ground({ id: 'sandbar', x0: -64, x1: 64, z0: -14, z1: -2.4, scale: 0.5, color: (x, z) => (z > -3.4 ? C.wet : sandCol(x, z)) });
  K.ground({
    id: 'sandbarFar', x0: -110, x1: 110, z0: -26, z1: -14, scale: 1,
    skip: (x, z) => z + 0.5 < BACK(x + 0.5),
    color: (x, z) => (z + 0.5 - BACK(x + 0.5) < 1.2 ? C.wet : sandCol(x, z)),
  });

  // ---- lane: wooden pier boardwalk on pilings, rope rails
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.plankD,
    color: (ix, iz) => {
      if (iz === -10 || iz === 9) return C.plankD;
      const plank = ((ix % 3) + 3) % 3;
      if (plank === 0) return C.plankD;
      const board = Math.floor(ix / 3);
      return hash3(board, 1, 7) < 0.3 ? C.plankL : hash3(board, 2, iz >> 2) < 0.15 ? 0xa87440 : C.plank;
    },
  });
  const pil = [];
  for (let x = -24; x <= 24; x += 3) for (const z of [-2.3, 2.3]) pil.push([x, 0, z]);
  K.inst('piling', pilingGrid, { scale: 0.1, pivot: [0, 0, 0] }, pil);
  K.mesh('ropeRail', () => {
    const g = new VoxGrid();
    for (const z of [-23, 23]) for (let x = -240; x < 240; x++) { const k = ((x % 30) + 30) % 30; g.set(x, 2 - Math.round(Math.sin((k / 30) * Math.PI) * 1.2), z, C.rope); }
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0] }, 0, 0, 0);
  K.mesh('lifebuoyMarker', () => {
    const g = new VoxGrid();
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) { const r = Math.hypot(x, z); if (r > 5.4 || r < 3) continue; g.set(x, 0, z, (Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) & 1) ? C.red : C.white); }
    text(g, '#', -2, 0, 2, '+y', C.teal, {});
    return g;
  }, { scale: 0.11, pivot: [0, 0, 0] }, 0.06, 0.003, 1.2);

  // ---- breakables on the sandbar right behind the pier
  const brk = [[-19, 'bags'], [-9.6, 'barrel'], [-3.3, 'bin'], [4.4, 'bags'], [10.2, 'bin2'], [18.6, 'barrel']];
  for (const [x, kind] of brk) {
    if (kind === 'bags') K.breakable('bags', 'bagPile', bagPileGrid, { scale: 0.1 }, x, -3.4, K.rand(0, 6));
    else if (kind === 'barrel') K.breakable('barrel', 'barrel', barrelGrid, { scale: 0.11 }, x, -3.3, K.rand(0, 6));
    else if (kind === 'bin') K.breakable('bin', 'binB', binGrid(C.blue, true), { scale: 0.11 }, x, -3.3, K.rand(-0.3, 0.3));
    else K.breakable('bin', 'binG', binGrid(C.green, true), { scale: 0.11 }, x, -3.3, K.rand(-0.3, 0.3));
  }

  // ---- cleanup camp on the sandbar
  K.mesh('tent', tentGrid, { scale: 0.12, ao: true }, -14.5, 0, -8.6, 0.1, 1, { shadow: true });
  K.mesh('tent2', tentGrid, { scale: 0.11, ao: true }, 21, 0, -9.6, -0.2, 1, { shadow: true });
  K.inst('bagPile', bagPileGrid, { scale: 0.13 }, [[-7.4, 0, -7.2, 0.4], [-5.8, 0, -9.4, 2], [8.6, 0, -7.6, 1.1], [27, 0, -6.8, 0.3], [-26, 0, -7, 2.4]], { shadow: true });
  K.inst('binB', binGrid(C.blue, true), { scale: 0.12, ao: true }, [[-20.6, 0, -5.8, 0.2], [2.8, 0, -6.4, -0.1]], { shadow: true });
  K.inst('binG', binGrid(C.green, true), { scale: 0.12, ao: true }, [[-19.4, 0, -5.8, 0.2], [4.0, 0, -6.4, -0.1]], { shadow: true });
  K.inst('binY', binGrid(C.yellow, true), { scale: 0.12, ao: true }, [[-18.2, 0, -5.8, 0.2], [5.2, 0, -6.4, -0.1]], { shadow: true });
  K.mesh('score', scoreGrid, { scale: 0.12, ao: true }, -1.6, 0, -11.4, 0, 1, { shadow: true });
  K.mesh('lifeguard', lifeguardGrid, { scale: 0.12, ao: true }, 13.4, 0, -11.4, -0.3, 1, { shadow: true });
  K.inst('kayak', kayakGrid, { scale: 0.1 }, [[-10.4, 0, -11.6, 0.2], [-11.2, 0, -12.6, 0.3]], { shadow: true });
  K.inst('buoyR', buoyGrid(C.red), { scale: 0.09 }, [[-29, -0.3, -18.5], [-4, -0.3, -21], [30, -0.3, -19]]);
  K.inst('buoyG', buoyGrid(C.green), { scale: 0.09 }, [[-16, -0.3, -20], [9, -0.3, -20.5]]);
  const palmSpots = [[-24.5, -10.4, 0.21], [-12, -14, 0.23], [17.5, -13.6, 0.22], [27.5, -11.4, 0.2], [-33, -9.4, 0.22], [35, -9, 0.22], [-40, -14, 0.24], [41, -13.4, 0.24]];
  const palms = liveInst(K, 'palm', () => ENV_GRIDS.treePalm(), { scale: 1 }, palmSpots.length, { shadow: true });
  const pr = palmSpots.map(() => K.rand(0, 6));
  K.onUpdate((dt, t) => { palmSpots.forEach(([x, z, s], i) => setInst(palms, i, x, 0, z, pr[i], Math.sin(t * 0.8 + i * 1.3) * 0.02, Math.sin(t * 1.1 + i) * 0.035, s)); palms.instanceMatrix.needsUpdate = true; });
  const crabs = liveInst(K, 'crab', crabGrid, { scale: 0.06 }, 5);
  const cr = Array.from({ length: 5 }, (_, i) => ({ cx: -20 + i * 10 + K.rand(-2, 2), sp: K.rand(0.6, 1.1), ph: K.rand(0, 6) }));
  K.onUpdate((dt, t) => {
    cr.forEach((c, i) => { const x = c.cx + Math.sin(t * 0.35 * c.sp + c.ph) * 2.2; const mv = Math.cos(t * 0.35 * c.sp + c.ph); setInst(crabs, i, x, Math.abs(Math.sin(t * 14 + i)) * 0.015 * Math.abs(mv), -4.1 - (i % 2) * 1.6, 0, 0, Math.sin(t * 10 + i) * 0.08 * Math.abs(mv)); });
    crabs.instanceMatrix.needsUpdate = true;
  });

  // ---- landmarks: shipwreck, the solar trash barge + boom + conveyor, lighthouse arch
  const wreck = K.mesh('wreck', wreckGrid, { scale: 0.2 }, -15, -1.2, -33, 0.25, 1, { shadow: true });
  wreck.rotation.set(0.08, 0.25, 0.14, 'YXZ');
  const BX = 14, BZ = -31, BS = 0.17;
  K.mesh('barge', bargeGrid, { scale: BS, pivot: [0, 0, 0] }, BX, -0.5, BZ, 0.12, 1, { shadow: true });
  // conveyor cleats climbing the ramp, carrying trash up into the dumpsters
  const cleats = liveInst(K, 'cleat', cleatGrid, { scale: BS }, 12);
  const carried = liveInst(K, 'carried', trashGrid(9), { scale: 0.08 }, 6);
  const rampAt = (u) => { const k = 17 - u * 17; const lx = -0.5, ly = 10 - k * 0.55 + 1, lz = 15 + k; const c = Math.cos(0.12), sn = Math.sin(0.12); return [BX + (lx * c + lz * sn) * BS, -0.5 + ly * BS, BZ + (-lx * sn + lz * c) * BS]; };
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 12; i++) { const u = ((t * 0.12 + i / 12) % 1); const [x, y, z] = rampAt(u); setInst(cleats, i, x, y, z, 0.12, 0.5); }
    for (let i = 0; i < 6; i++) { const u = ((t * 0.12 + i / 6 + 0.04) % 1); const [x, y, z] = rampAt(u); setInst(carried, i, x, y + 0.12, z, t + i, 0, 0, u > 0.92 ? 0.0001 : 1); }
    cleats.instanceMatrix.needsUpdate = true;
    carried.instanceMatrix.needsUpdate = true;
  });
  // floating boom funnelling trash toward the barge's ramp
  const boomPts = [];
  for (let i = 0; i < 12; i++) { const u = i / 11; boomPts.push([BX - 10 + u * 10 - Math.sin(u * Math.PI) * 2, BZ + 12 - u * 6.8]); }
  for (let i = 0; i < 8; i++) { const u = i / 7; boomPts.push([BX + 2 + u * 9, BZ + 5.2 + u * 6]); }
  const boom = liveInst(K, 'boom', boomGrid, { scale: 0.1 }, boomPts.length);
  const floating = Array.from({ length: 22 }, (_, i) => [BX - 6 + K.rand(-4, 12), BZ + 8 + K.rand(-1, 6), K.rand(0, 6), i % 3]);
  const ft = [0, 1, 2].map((k) => liveInst(K, 'ftrash' + k, trashGrid(k + 2), { scale: 0.08 }, floating.filter((f) => f[3] === k).length));
  K.onUpdate((dt, t) => {
    boomPts.forEach(([x, z], i) => { const n = boomPts[Math.min(boomPts.length - 1, i + 1)], p = boomPts[Math.max(0, i - 1)]; setInst(boom, i, x, -0.3 + Math.sin(t * 1.4 + i * 0.6) * 0.04, z, Math.atan2(-(n[1] - p[1]), n[0] - p[0]), 0, Math.sin(t * 1.1 + i) * 0.05); });
    boom.instanceMatrix.needsUpdate = true;
    const idx = [0, 0, 0];
    floating.forEach(([x, z, r, k]) => { const u = (t * 0.03 + r) % 1; setInst(ft[k], idx[k]++, x + (BX - 0.5 - x) * u * 0.8, -0.3 + Math.sin(t * 1.3 + r * 3) * 0.05, z + (BZ + 6 - z) * u * 0.8, r + t * 0.1, 0, 0, u > 0.9 ? 0.0001 : 1); });
    for (const im of ft) im.instanceMatrix.needsUpdate = true;
  });
  K.mesh('archRock', archRockGrid, { scale: 0.22 }, 34, -0.4, -42, -0.35, 1, { shadow: true });
  K.inst('rockIsle', () => rockGrid({ color: C.rock, r: 6 }), { scale: 0.16 }, [[-34, -0.4, -26, 0.3], [-44, -0.4, -36, 1.1], [44, -0.4, -26, 2]]);

  // ---- life: cleanup boats, dolphins, gulls, fish + a turtle under the clear water, glints
  const boats = [0, 1, 2].map((i) => K.mesh('boat' + i, boatGrid, { scale: 0.12 }, 0, -0.35, 0, 0, 1, { shadow: true }));
  K.onUpdate((dt, t) => {
    boats.forEach((m, i) => {
      const a = t * (0.07 + i * 0.015) + i * 2.1;
      const cx = [-4, 26, -28][i], cz = [-24, -22, -24][i], rx = [12, 7, 8][i], rz = [3, 2.5, 3][i];
      m.position.set(cx + Math.cos(a) * rx, -0.35 + Math.sin(t * 2 + i) * 0.05, cz + Math.sin(a) * rz);
      m.rotation.set(0, Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz), Math.sin(t * 1.6 + i) * 0.04, 'YXZ');
    });
  });
  const dol = liveInst(K, 'dolphin', dolphinGrid, { scale: 0.1 }, 3, { shadow: true });
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 3; i++) {
      const q = (t * 0.22 + i * 0.12) % 1;
      const k = q < 0.35 ? q / 0.35 : -1;
      const x = -8 + i * 2.2 + Math.floor(t * 0.22) % 3 * 9, z = -40 - i * 1.5;
      setInst(dol, i, x + (k >= 0 ? k * 5 : 0), k >= 0 ? -0.6 + Math.sin(k * Math.PI) * 2.2 : -5, z, Math.PI / 2, k >= 0 ? (k - 0.5) * 1.8 : 0, 0);
    }
    dol.instanceMatrix.needsUpdate = true;
  });
  addFlyers(K, 'gull', () => { const g = new VoxGrid(); g.box(-1, 0, -2, 0, 1, 2, 0xffffff); g.set(-1, 1, 3, 0xffc23a).set(0, 1, 3, 0xffc23a); return g; },
    () => { const g = new VoxGrid(); for (let x = 0; x <= 6; x++) g.box(x, 0, -1, x, 0, 0, x > 4 ? 0x3a3a44 : 0xf0f0f0); return g; }, { scale: 0.1 },
    orbitList(K, 6, [-2, 9, -28], { r0: 8, r1: 16, spread: 8, dy: 3, squash: 0.4 }), { flap: 0.5 });
  const fishKinds = [[0xffd23f, 0x29b6f6, null, 'fishY'], [0xff8a1a, 0xffffff, 0xffffff, 'fishC'], [0x1d9bf0, 0xffd23f, 0x15121f, 'fishB']];
  fishKinds.forEach(([b, f, s, id], k) => {
    const n = 10;
    const im = liveInst(K, id, fishGrid(b, f, s), { scale: 0.06 }, n);
    const fish = Array.from({ length: n }, () => ({ x: K.rand(-40, 40), z: K.rand(4, 18), y: K.rand(-0.95, -0.45), sp: K.rand(0.6, 1.3) * (K.R() < 0.5 ? -1 : 1), ph: K.rand(0, 6) }));
    K.onUpdate((dt, t) => {
      fish.forEach((F, i) => {
        F.x += F.sp * dt;
        if (F.x > 42) F.x = -42; if (F.x < -42) F.x = 42;
        setInst(im, i, F.x, F.y + Math.sin(t * 1.3 + F.ph) * 0.05, F.z + Math.sin(t * 0.7 + F.ph) * 0.6, F.sp > 0 ? Math.PI / 2 + Math.sin(t * 6 + F.ph) * 0.15 : -Math.PI / 2 + Math.sin(t * 6 + F.ph) * 0.15);
      });
      im.instanceMatrix.needsUpdate = true;
    });
  });
  const turtle = K.mesh('turtle', turtleGrid, { scale: 0.08 }, 0, -0.7, 8, Math.PI / 2, 1, { shadow: false });
  K.onUpdate((dt, t) => { const x = ((t * 0.5) % 70) - 35; turtle.position.set(x, -0.75 + Math.sin(t * 0.8) * 0.06, 9 + Math.sin(t * 0.2) * 1.5); turtle.rotation.z = Math.sin(t * 1.2) * 0.08; });
  addGlints(K, [[0, -0.1, 12, 60, 0.05], [-6, -0.25, -26, 50, 0.05]], 26, [2.3, 2.3, 2.3]);
  addParticles(K, 30, [-30, 30, -1.1, -0.2, 3, 16], { color: 0xd8f8ff, size: [0.03, 0.06], vy: 0.25, drift: 0.2 }); // bubbles in the reef

  // ---- the reef under the clear water in front (all below the surface)
  const corals = [[], [], [], [], []], grass = [], stars = [], shells = [];
  for (let i = 0; i < 60; i++) { const x = K.rand(-46, 46), z = K.rand(3.4, 30); corals[i % 5].push([x, -1.15, z, K.rand(0, 6), K.rand(0.7, 1.4)]); }
  for (let i = 0; i < 50; i++) grass.push([K.rand(-46, 46), -1.15, K.rand(3, 30), K.rand(0, 6), K.rand(0.8, 1.4)]);
  for (let i = 0; i < 16; i++) stars.push([K.rand(-40, 40), -1.14, K.rand(3, 24), K.rand(0, 6), K.rand(0.9, 1.3)]);
  for (let i = 0; i < 30; i++) shells.push([K.rand(-40, 40), -1.14, K.rand(3, 26), K.rand(0, 6), K.rand(0.9, 1.3)]);
  corals.forEach((list, k) => K.inst('coral' + k, coralGrid(k), { scale: 0.09 }, list));
  K.inst('seagrass', seagrassGrid, { scale: 0.09 }, grass);
  K.inst('starfish', starfishGrid, { scale: 0.08 }, stars);
  K.inst('shell', shellGrid, { scale: 0.08 }, shells);

  return {
    sky,
    fog: { color: 0xc8f0ff, near: 70, far: 220 },
    lights: { sky: 0xe0f8ff, ground: 0x6a8a9a, hemi: 1.15, sun: 2.4, sunColor: 0xfff4d8, dir: [-8, 14, 10], rim: 0.9, rimColor: 0x9ae8ff },
    dust: 0xfbe6b4,
    bloom: { strength: 0.55, threshold: 1.7, radius: 0.25 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // a raised sand islet in a ring of clear lagoon water over a coral seabed (everything above the plinth top)
  zoneDisc(K, 'zoneReef', {
    r: 22, seed: 3,
    colorTop: (x, z, r, R, y) => {
      if (r > R - 6) return y ? null : hash3(x, 2, z) < 0.3 ? C.seabedD : C.seabed;
      if (r > R - 7.2) return C.wet;
      return hash3(x, 1, z) < 0.25 ? C.sandL : C.sand;
    },
    height: (x, z, r, R) => (r > R - 6 ? 0 : 2),
    colorSide: (x, y) => (y > -2 ? C.sandD : (x + y) & 1 ? C.rock : C.rockD),
  });
  const IY = 0.5; // island top
  const tLag = rippleTex('rf_lagZ', 0xc8f4f8, 0xffffff, 0x9ae0ec, 0xffffff).clone();
  tLag.needsUpdate = true;
  tLag.wrapS = tLag.wrapT = THREE.RepeatWrapping;
  tLag.repeat.set(4, 4);
  const lag = new THREE.Mesh(new THREE.RingGeometry(3.9, 5.9, 48), new THREE.MeshBasicMaterial({ map: tLag, color: 0x8ff0f0, transparent: true, opacity: 0.6, depthWrite: false }));
  lag.rotation.x = -Math.PI / 2;
  lag.position.y = 0.32;
  lag.renderOrder = 2;
  K.add(lag);
  K.onUpdate((dt, t) => { tLag.offset.x = (t * 0.02) % 1; });
  const corals = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + K.rand(-0.2, 0.2), r = K.rand(4.2, 5.4); corals.push([Math.cos(a) * r, 0, Math.sin(a) * r, K.rand(0, 6), K.rand(0.8, 1.2)]); }
  for (let k = 0; k < 4; k++) K.inst('coral' + k, coralGrid(k), { scale: 0.05 }, corals.filter((_, i) => i % 4 === k));
  const wreck = K.mesh('wreck', wreckGrid, { scale: 0.06 }, -3.6, 0.05, -3.2, 0.7, 1, { shadow: true });
  wreck.rotation.set(0.05, 0.7, 0.16, 'YXZ');
  K.mesh('barge', bargeGrid, { scale: 0.05, pivot: [0, 0, 0] }, 4.2, 0.2, -2.8, -0.6, 1, { shadow: true });
  K.mesh('tent', tentGrid, { scale: 0.06, ao: true }, -0.6, IY, -0.6, 0.2, 1, { shadow: true });
  K.inst('bagPile', bagPileGrid, { scale: 0.06 }, [[1.8, IY, 0.6, 0.4], [-2.4, IY, 1.2, 2]], { shadow: true });
  K.inst('binB', binGrid(C.blue, true), { scale: 0.06, ao: true }, [[0.6, IY, 1.8, 0.2]], { shadow: true });
  K.inst('binG', binGrid(C.green, true), { scale: 0.06, ao: true }, [[1.1, IY, 1.9, 0.2]], { shadow: true });
  K.mesh('score', scoreGrid, { scale: 0.05, ao: true }, 2.2, IY, -1.2, -0.5, 1, { shadow: true });
  const palmSpots = [[-2.4, 2.2, 0.1], [2.6, 2.0, 0.09], [-1.0, -2.4, 0.1]];
  const palms = liveInst(K, 'palm', () => ENV_GRIDS.treePalm(), { scale: 1 }, palmSpots.length, { shadow: true });
  K.onUpdate((dt, t) => { palmSpots.forEach(([x, z, s], i) => setInst(palms, i, x, IY, z, i * 1.7, 0, Math.sin(t * 1.1 + i) * 0.04, s)); palms.instanceMatrix.needsUpdate = true; });
  const boats = [0, 1].map((i) => K.mesh('boat' + i, boatGrid, { scale: 0.045 }, 0, 0.25, 0, 0, 1, { shadow: true }));
  K.onUpdate((dt, t) => { boats.forEach((m, i) => { const a = t * 0.2 * (i ? -1 : 1) + i * 3; m.position.set(Math.cos(a) * 5.1, 0.26 + Math.sin(t * 2 + i) * 0.03, Math.sin(a) * 5.1); m.rotation.y = i ? -a : -a + Math.PI; }); });
  const boom = liveInst(K, 'boom', boomGrid, { scale: 0.05 }, 6);
  K.onUpdate((dt, t) => { for (let i = 0; i < 6; i++) { const a = 0.4 + i * 0.16; setInst(boom, i, Math.cos(a) * 4.7, 0.34 + Math.sin(t * 1.4 + i) * 0.02, -Math.sin(a) * 4.7 + 0.5, a + Math.PI / 2); } boom.instanceMatrix.needsUpdate = true; });
  addFlyers(K, 'gull', () => { const g = new VoxGrid(); g.box(-1, 0, -2, 0, 1, 2, 0xffffff); g.set(-1, 1, 3, 0xffc23a); return g; },
    () => { const g = new VoxGrid(); for (let x = 0; x <= 6; x++) g.box(x, 0, -1, x, 0, 0, x > 4 ? 0x3a3a44 : 0xf0f0f0); return g; }, { scale: 0.06 },
    orbitList(K, 3, [0, 4.6, -1], { r0: 3, r1: 5, spread: 1, squash: 0.8 }), { flap: 0.5 });
  const dol = liveInst(K, 'dolphin', dolphinGrid, { scale: 0.045 }, 2);
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 2; i++) { const q = (t * 0.25 + i * 0.5) % 1; const k = q < 0.3 ? q / 0.3 : -1; const a = i * 3 + Math.floor(t * 0.25 + i * 0.5) * 1.3; const r = 5.0; const x = Math.cos(a) * r, z = Math.sin(a) * r; setInst(dol, i, x, k >= 0 ? 0.1 + Math.sin(k * Math.PI) * 0.9 : -3, z, -a, k >= 0 ? (k - 0.5) * 1.6 : 0, 0); }
    dol.instanceMatrix.needsUpdate = true;
  });
  anchor(K, 'boss', -1.8, IY, 2.6);
  anchor(K, 'npc', 1.6, IY, 2.9);
  anchor(K, 'cleanup', 1.8, IY + 0.4, 0.6);
  K.root.scale.setScalar(ZONE_SCALE); // fill the plinth
  return { focus: [0, 1.4, 0], radius: 7 };
}
