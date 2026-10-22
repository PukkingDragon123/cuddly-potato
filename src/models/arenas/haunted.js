// Arena 12: HAUNTED MANSION — a creaky Victorian mansion on a hill under a
// giant full moon. The lane is an old cobblestone path through a foggy
// graveyard: crooked tombstones, open graves, a crypt with a purple glow,
// wrought-iron fences, flickering jack-o'-lanterns, a bubbling cauldron, a
// scarecrow, a gnarled swing tree full of crows and a ruined bell tower. Bats
// circle the turrets, ghosts drift between the graves, will-o'-wisps wander,
// windows flicker, lightning cracks in the distance and fog rolls along the
// ground.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, mulberry32, bayer,
  paintGradient, paintStars, px, disc, skyTexture, parallaxWidth, canvasTex,
} from './kit.js';
import { hdStarfield, hdMoon, hdStreaks, hdBirds } from './hdpaint.js';
import { pixels, ridge, setInst, liveInst, fitSky, addFlyers, orbitList, addParticles, addFlames, zoneDisc, anchor } from './wildsKit.js';

const C = {
  grass: 0x5a4e6a, grassL: 0x6e6280, grassD: 0x463c56, dirt: 0x4a3a40, dirtD: 0x3a2c34, dirtL: 0x5e4a4e,
  cob: 0x7a7488, cobL: 0x9690a6, cobD: 0x5a5468, cobDD: 0x403a4c, moss: 0x5a7a4a,
  stone: 0x9a96a8, stoneL: 0xb8b4c6, stoneD: 0x7a7688, stoneDD: 0x5a5668,
  wood: 0x5a4434, woodD: 0x3e2e24, woodL: 0x7a5e46, roof: 0x3a2e4a, roofD: 0x2a2038, roofL: 0x4e4062,
  wall: 0x6a5a78, wallD: 0x54466a, wallL: 0x8676a0, trim: 0xd8d0e0,
  win: 0xffc84a, winP: 0xc87aff, ink: 0x120c1a, iron: 0x2a2436, ironL: 0x4a4258,
  pumpkin: 0xff8a1a, pumpkinD: 0xd8600e, pumpkinL: 0xffa84a, stem: 0x3f7a2a, fire: 0xffd23f,
  potion: 0x7cff3a, potionD: 0x3a9a2a, ghost: 0xf2f0ff, ghostS: 0xd0cce8, bone: 0xe8e2d4,
  leafO: 0xd8642a, leafR: 0xb83a2a, leafY: 0xd8a82a, purple: 0xb05cff, moon: 0xf6f2d8,
};
const LH = FIELD.LANE_HALF;
const ZONE_SCALE = 1.18;

// --------------------------------------------------------------------------- voxel props

/** The haunted mansion (Victorian, two turrets, mansard roof, porch). Front +z. Windows: glow set separately. */
const mansionGrid = (lit, lod = false) => () => {
  const g = new VoxGrid();
  const W = 34, D = 16;
  const wallC = (x, y, z) => ((y % 4 === 0) ? C.wallD : !lod && hash3(x >> 1, y >> 2, z) < 0.12 ? C.wallL : C.wall);
  // main body: 3 storeys (shell)
  for (let x = -W; x < W; x++) for (let y = 0; y < 42; y++) for (let z = -D; z < D; z++) {
    const edge = x === -W || x === W - 1 || z === -D || z === D - 1;
    if (!edge) continue;
    g.set(x, y, z, y === 14 || y === 28 ? C.trim : wallC(x, y, z));
  }
  // mansard roof
  for (let k = 0; k < 14; k++) {
    const y = 42 + k, w = W + 1 - Math.floor(k * 0.5), d = D + 1 - Math.floor(k * 0.5);
    for (let x = -w; x < w; x++) for (let z = -d; z < d; z++) {
      if (k < 13 && Math.abs(x + 0.5) < w - 1.5 && Math.abs(z + 0.5) < d - 1.5) continue;
      g.set(x, y, z, k === 13 ? C.roofD : (x + k) % 3 === 0 ? C.roofD : C.roof);
    }
  }
  for (let x = -W + 4; x < W - 4; x += 2) g.set(x, 57, 0, C.iron).set(x, 58, 0, x % 4 === 0 ? C.ironL : C.iron); // widow's walk railing
  // turrets (round towers with cone roofs)
  for (const [tx, tz, th] of [[-W + 2, D - 3, 62], [W - 3, D - 5, 54]]) {
    for (let y = 0; y < th; y++) for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > 6.4 || d < 5.2) continue;
      g.set(tx + x, y, tz + z, y % 14 === 0 ? C.trim : wallC(x, y, z));
    }
    for (let k = 0; k < 22; k++) {
      const r = 8 - k * 0.36;
      for (let x = -9; x <= 8; x++) for (let z = -9; z <= 8; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > r || d < r - 1.4) continue;
        g.set(tx + x, th + k, tz + z, k % 4 === 0 ? C.roofL : C.roof);
      }
    }
    g.box(tx, th + 22, tz, tx, th + 27, tz, C.iron);
    g.set(tx, th + 28, tz, C.ironL);
    // turret windows
    for (const y of [20, 34, 48]) if (y < th - 4) g.box(tx - 1, y, tz + 6, tx + 1, y + 4, tz + 6, C.ink);
  }
  // windows (dark frames; the lit panes are a separate glow mesh) + shutters
  const wins = [];
  for (const row of [4, 18, 32]) for (let x = -W + 8; x < W - 8; x += 9) {
    if (row === 4 && Math.abs(x) < 7) continue; // the door
    g.box(x - 2, row, D, x + 2, row + 7, D, C.trim);
    g.box(x - 1, row + 1, D, x + 1, row + 6, D, row === 18 ? 0x4a3a2a : 0x3a2a3a);
    g.box(x, row + 1, D, x, row + 6, D, C.trim).box(x - 1, row + 4, D, x + 1, row + 4, D, C.trim);
    if (hash3(x, row, 3) < 0.5) g.box(x - 3, row + 1, D, x - 3, row + 6, D, C.woodD).box(x + 3, row + 1, D, x + 3, row + 6, D, C.woodD);
    if (hash3(x, row, 7) < 0.25) { g.line(x - 2, row + 2, D + 1, x + 2, row + 5, D + 1, C.woodL); g.line(x - 2, row + 5, D + 1, x + 2, row + 2, D + 1, C.woodL); } // boarded
    else wins.push([x, row]);
  }
  // round attic window
  for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; g.set(Math.round(Math.cos(an) * 3), 49 + Math.round(Math.sin(an) * 3), D - 6, C.trim); }
  g.box(-2, 47, D - 6, 1, 51, D - 6, C.ink);
  // porch: steps, columns, roof, double door
  g.box(-9, 0, D, 8, 1, D + 6, C.woodL);
  for (let i = 0; i < 3; i++) g.box(-6, i - 2, D + 7 + i, 5, i - 2, D + 7 + i, C.stoneD);
  for (const x of [-9, -5, 4, 8]) g.box(x, 2, D + 5, x, 12, D + 5, C.trim);
  g.box(-10, 13, D, 9, 13, D + 7, C.roofD).box(-9, 14, D + 1, 8, 14, D + 6, C.roof);
  g.box(-3, 2, D, 2, 11, D, C.woodD);
  g.box(-2, 3, D + 1, 1, 10, D + 1, C.wood);
  g.set(-1, 6, D + 2, C.fire, true);
  // chimneys + cracked plaster + vines
  for (const cx of [-14, 18]) g.box(cx, 50, -4, cx + 3, 64, -1, (x, y) => (y > 62 ? C.stoneDD : y % 3 === 0 ? C.stoneD : C.stone));
  for (let k = 0; k < (lod ? 0 : 30); k++) {
    const x = -W + Math.floor(hash3(k, 1, 4) * W * 2), y = Math.floor(hash3(k, 2, 4) * 40);
    g.set(x, y, D, C.wallD);
    g.set(x + 1, y + 1, D, C.wallD);
  }
  if (!lod) for (let x = -W; x < -W + 10; x++) for (let y = 0; y < 30 - (x + W) * 2; y++) if (hash3(x, y, 9) < 0.45) g.set(x, y, D, (y & 1) ? 0x3a5a3a : 0x4a6a3a);
  // weathervane
  g.box(0, 59, 0, 0, 66, 0, C.iron);
  g.box(-3, 64, 0, 3, 64, 0, C.iron).set(3, 65, 0, C.iron).set(-3, 63, 0, C.iron);
  // lit panes: a separate glow mesh so they can flicker (cut out of the body so faces never overlap)
  const L = new VoxGrid();
  wins.forEach(([x, row], i) => {
    if (i % 4 === 3) return;
    const c = i % 3 === 1 ? C.winP : C.win;
    for (const [dx, dy] of [[-1, 2], [1, 2], [-1, 5], [1, 6], [-1, 3], [1, 5]]) L.set(x + dx, row + dy, D, c, true);
  });
  L.box(-1, 48, D - 6, 0, 50, D - 6, C.winP, true);
  if (lit) return L;
  L.forEach((x, y, z) => g.del(x, y, z));
  return g;
};
/** Voxel hill under the mansion (front slope toward +z) with a winding path. */
const hillGrid = (res = 1) => () => {
  const g = new VoxGrid();
  const RX = Math.round(70 * res), RZ = 36 * res, OZ = 4 * res, HH = 28 * res;
  for (let x = -RX; x < RX; x++) for (let z = -Math.round(40 * res); z < Math.round(40 * res); z++) {
    const d = Math.hypot(x / RX, (z + OZ) / RZ);
    if (d > 1) continue;
    const hh = Math.round(HH * Math.pow(1 - d, 0.7) + vnoise(x * 0.1 / res, 2, z * 0.1 / res) * 3 * res);
    const path = Math.abs(x - Math.sin(z * 0.12 / res) * 6 * res) < 3 * res && z > 10 * res;
    const low = res < 1 ? Math.max(0, hh - 2) : 0;
    for (let y = low; y < hh; y++) {
      const top = y === hh - 1;
      g.set(x, y, z, top ? (path ? (hash3(x, y, z) < 0.5 ? C.dirtL : C.dirt) : hash3(x >> 1, y, z >> 1) < 0.3 ? C.grassL : C.grass) : y > hh - 3 ? C.dirt : C.dirtD);
    }
  }
  return g;
};
const tombGrid = (seed) => () => {
  const g = new VoxGrid();
  const k = Math.floor(hash3(seed, 2, 2) * 4);
  const tilt = (hash3(seed, 5, 5) - 0.5) * 2;
  const st = (x, y) => (y > 7 ? C.stoneL : (x + y) % 5 === 0 ? C.stoneD : C.stone);
  if (k === 0) { // rounded headstone
    for (let y = 0; y < 10; y++) for (let x = -3; x <= 3; x++) { if (y > 7 && Math.abs(x) > 10 - y) continue; g.box(x + Math.round(tilt * y / 10), y, 0, x + Math.round(tilt * y / 10), y, 1, st(x, y)); }
    g.box(-1, 5, 2, 1, 5, 2, C.stoneDD).box(0, 3, 2, 0, 7, 2, C.stoneDD);
  } else if (k === 1) { // cross
    g.box(0, 0, 0, 1, 12, 1, C.stone);
    g.box(-2, 8, 0, 3, 9, 1, C.stone);
  } else if (k === 2) { // obelisk
    g.box(-2, 0, -2, 2, 1, 2, C.stoneD);
    for (let y = 2; y < 14; y++) { const r = y > 11 ? 0 : 1; g.box(-r, y, -r, r, y, r, st(0, y)); }
  } else { // slab with RIP
    g.box(-3, 0, 0, 3, 8, 1, st);
    text(g, 'RIP', 0, 3, 2, '+z', C.stoneDD, { center: true });
  }
  g.box(-3, 0, 2, 3, 0, 7, (x, y, z) => (hash3(x, z, seed) < 0.4 ? C.dirtL : C.dirt));
  if (hash3(seed, 9, 9) < 0.5) g.set(-3, 1, 0, C.moss).set(3, 0, -1, C.moss);
  return g;
};
const graveGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -6, 3, 0, 6, C.dirtD);
  g.box(-3, 0, -5, 2, 0, 5, 0x1a1218);
  g.box(5, 0, -4, 9, 3, 4, (x, y, z) => (y === 3 ? C.dirtL : C.dirt)); // dirt mound
  g.box(6, 4, 0, 6, 9, 0, C.woodL).box(5, 9, 0, 7, 10, 0, C.ironL); // shovel
  return g;
};
const cryptGrid = () => {
  const g = new VoxGrid();
  g.box(-12, 0, -10, 11, 1, 9, C.stoneD);
  g.box(-10, 2, -8, 9, 18, 7, (x, y) => (y % 5 === 0 ? C.stoneD : C.stone));
  for (let k = 0; k < 8; k++) g.box(-11 + k, 19 + k, -9, 10 - k, 19 + k, 8, k % 2 ? C.stoneD : C.stoneL);
  for (const x of [-9, 8]) g.box(x, 2, 8, x + 1, 18, 9, C.stoneL);
  g.box(-4, 2, 8, 3, 13, 8, C.iron);
  g.box(-3, 3, 9, 2, 12, 9, (x, y) => ((x + y) & 1 ? C.ironL : C.iron));
  g.box(-2, 4, 7, 1, 11, 7, C.purple, true);
  text(g, 'BEAST', 0, 15, 9, '+z', C.stoneDD, { center: true });
  g.box(-1, 27, -1, 0, 31, 0, C.stoneL).box(-2, 29, -1, 1, 29, 0, C.stoneL);
  return g;
};
const fenceGrid = () => {
  const g = new VoxGrid();
  for (let x = -24; x < 24; x++) { g.set(x, 2, 0, C.iron); g.set(x, 8, 0, C.iron); }
  for (let x = -24; x < 24; x += 3) { g.box(x, 0, 0, x, 10, 0, C.iron); g.set(x, 11, 0, C.ironL); if ((x + 24) % 6 === 0) g.set(x - 1, 9, 0, C.iron).set(x + 1, 9, 0, C.iron); }
  for (const x of [-24, 23]) g.box(x - 1, 0, -1, x + 1, 13, 1, C.stoneD).box(x - 1, 14, -1, x + 1, 14, 1, C.stoneL);
  return g;
};
/** Pumpkin body (carved face cut dark) + its glowing face (separate grid so it can flicker). */
function pumpkinParts(big) {
  const body = new VoxGrid(), face = new VoxGrid();
  const r = big ? 5 : 3.4, h = big ? 7 : 5;
  for (let x = -6; x <= 6; x++) for (let y = 0; y <= h; y++) for (let z = -6; z <= 6; z++) {
    if ((x / r) ** 2 + ((y - h / 2) / (h / 2 + 0.3)) ** 2 + (z / r) ** 2 > 1) continue;
    body.set(x, y, z, (x + 12) % 3 === 0 ? C.pumpkinD : y >= h - 1 ? C.pumpkinL : C.pumpkin);
  }
  body.box(0, h + 1, 0, 0, h + 2, 0, C.stem).set(1, h + 2, 0, C.stem).set(-1, h + 1, 1, 0x5fa83a);
  const ey = Math.round(h * 0.62), my = Math.round(h * 0.3);
  const pix = [];
  for (const ex of big ? [-3, 2] : [-2, 1]) pix.push([ex, ey, C.fire], [ex + (ex < 0 ? 1 : 0), ey + 1, C.fire]);
  for (let x = big ? -3 : -2; x <= (big ? 3 : 2); x++) pix.push([x, my, x & 1 ? C.fire : 0xffa02a]);
  for (const [x, y, c] of pix) {
    let z = 7;
    while (z > -1 && !body.has(x, y, z)) z--;
    body.set(x, y, z, C.ink);
    face.set(x, y, z + 1, c, true);
  }
  return { body, face };
}
const pumpkinGrid = (big) => () => pumpkinParts(big).body;
const pumpkinFaceGrid = (big) => () => pumpkinParts(big).face;
const cauldronGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) { const r = y < 2 ? 3 + y : y < 6 ? 5 : 4.4; g.cylinder(-0.5, -0.5, y + 2, y + 2, r, y === 7 ? C.ironL : C.iron); }
  g.cylinder(-0.5, -0.5, 9, 9, 3.8, C.potion, 'y', true);
  for (const [x, z] of [[-4, -4], [3, -4], [-1, 4]]) g.box(x, 0, z, x, 2, z, C.iron);
  // fire logs under it
  g.line(-5, 0, 0, 4, 0, 1, C.woodD).line(0, 0, -5, 1, 0, 4, C.wood);
  return g;
};
const scarecrowGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 20, 0, C.woodD);
  g.box(-9, 14, 0, 9, 14, 0, C.woodD);
  g.box(-3, 8, -1, 3, 15, 1, (x, y) => ((x + y) % 4 === 0 ? 0x6a3a8a : 0x4a2a6a)); // shirt
  for (const s of [-1, 1]) for (let k = 4; k <= 8; k++) g.set(s * k, 14, 0, 0x4a2a6a).set(s * (k + 1), 13, 0, 0xd8b060);
  g.box(-3, 16, -3, 2, 21, 2, (x, y) => (y === 21 ? C.pumpkinL : (x + 6) % 3 === 0 ? C.pumpkinD : C.pumpkin)); // pumpkin head
  g.set(-2, 19, 3, C.ink).set(1, 19, 3, C.ink).box(-2, 17, 3, 1, 17, 3, C.ink);
  g.box(-4, 22, -4, 3, 22, 3, 0x3a2a1a).box(-2, 23, -2, 1, 26, 1, 0x3a2a1a); // hat
  return g;
};
const lanternPostGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 16, 0, C.iron);
  g.box(0, 16, 0, 3, 16, 0, C.iron);
  g.box(2, 12, -1, 4, 15, 1, C.iron);
  g.box(3, 13, -1, 3, 14, 1, C.win, true);
  g.box(-1, 0, -1, 1, 0, 1, C.ironL);
  return g;
};
/** Gnarled dead tree with a tyre swing; crows sit on it. */
const deadTreeGrid = () => {
  const g = new VoxGrid();
  const c = 0x3e3250, cl = 0x54466a, cd = 0x2a2236;
  for (let y = 0; y < 30; y++) { const r = 2.6 + Math.max(0, 5 - y) * 0.6; const ox = Math.round(Math.sin(y * 0.13) * 2); g.cylinder(ox - 0.5, -0.5, y, y, r, (x, yy, z) => (hash3(x, yy >> 1, z) < 0.3 ? cd : c)); }
  const br = (pts) => { for (let i = 0; i < pts.length - 1; i++) g.line(...pts[i], ...pts[i + 1], cl, 1); };
  br([[2, 22, 0], [10, 27, 2], [17, 28, 5], [22, 33, 5]]);
  br([[-1, 25, 0], [-9, 30, -1], [-14, 36, 0], [-15, 40, 2]]);
  br([[1, 28, 0], [3, 37, -3], [1, 43, -4]]);
  br([[0, 18, 1], [-7, 19, 6], [-12, 20, 8]]);
  for (const [x, y, z] of [[22, 33, 5], [-15, 40, 2], [1, 43, -4], [-12, 20, 8], [17, 28, 5]]) { g.line(x, y, z, x + 2, y + 3, z, cd); g.line(x, y, z, x - 2, y + 2, z + 1, cd); }
  // tyre swing
  for (let y = 9; y < 27; y++) g.set(13, y, 3, 0xc8a870);
  for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; g.set(13 + Math.round(Math.cos(an) * 3), 6 + Math.round(Math.sin(an) * 3), 3, 0x2a2a2a); }
  for (let a = 0; a < 6; a++) { const an = a * 1.05; g.line(0, 2, 0, Math.round(Math.cos(an) * 8), 0, Math.round(Math.sin(an) * 8), cd); }
  return g;
};
const crowGrid = () => {
  const g = new VoxGrid();
  g.box(-1, 0, -2, 0, 2, 1, 0x1a1a24);
  g.box(-1, 2, 2, 0, 3, 3, 0x1a1a24).set(-1, 2, 4, 0xd8a82a).set(0, 2, 4, 0xd8a82a);
  g.set(-1, 3, 3, 0xffd23f).set(0, 3, 3, 0xffd23f);
  g.box(-1, 1, -4, 0, 1, -3, 0x2a2a3a);
  return g;
};
/** Ruined bell tower; bell is separate (swings). */
const bellTowerGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 52; y++) for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) g.box(x, y, z, x, y, z, y % 6 === 0 ? C.stoneD : C.stone);
  for (let y = 0; y < 34; y++) for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
    if (!(x === -6 || x === 5 || z === -6 || z === 5)) continue;
    if (y > 20 && hash3(x, y >> 1, z) < (y - 20) / 16) continue; // crumbling
    if (z === 5 && Math.abs(x + 0.5) < 2.5 && y < 8) continue; // doorway
    g.set(x, y, z, (y + (x & 1)) % 5 === 0 ? C.stoneD : C.stone);
  }
  for (let k = 0; k < 10; k++) g.box(-7 + k, 52 + k, -7 + k, 6 - k, 52 + k, 6 - k, k % 2 ? C.roofD : C.roof);
  g.box(0, 62, 0, 0, 67, 0, C.iron).box(-2, 65, 0, 2, 65, 0, C.iron);
  g.box(-6, 40, -6, 5, 40, 5, C.woodD); // bell beam
  return g;
};
const bellGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 7; y++) { const r = 1.2 + y * 0.45; g.cylinder(-0.5, -0.5, -y - 1, -y - 1, r, y === 6 ? 0xb8862a : 0xd8a83a); }
  g.box(-1, 0, -1, 0, 0, 0, C.iron);
  return g;
};
const coffinGrid = () => {
  const g = new VoxGrid();
  for (let z = -8; z <= 8; z++) { const hw = z > 3 ? 3 - Math.floor((z - 3) / 2) : 3 + Math.min(1, Math.floor((z + 8) / 4)); g.box(-hw, 0, z, hw - 1, 3, z, (x, y) => (y === 3 ? C.woodL : C.wood)); }
  g.box(-1, 4, -4, 0, 4, 2, C.trim).box(-2, 4, 0, 1, 4, 0, C.trim);
  return g;
};
const boneGrid = () => { const g = new VoxGrid(); g.box(-3, 0, 0, 2, 0, 0, C.bone).set(-4, 0, -1, C.bone).set(-4, 0, 1, C.bone).set(3, 0, -1, C.bone).set(3, 0, 1, C.bone); return g; };
const leafGrid = (c) => () => { const g = new VoxGrid(); g.box(-1, 0, 0, 1, 0, 0, c).set(0, 0, 1, c).set(0, 0, -1, shade(c, -0.2)); return g; };
const deadTuftGrid = () => {
  const g = new VoxGrid();
  for (const [x, z, h] of [[0, 0, 4], [1, 1, 3], [-1, 1, 2], [1, -1, 3], [-1, -1, 3]]) for (let y = 0; y < h; y++) g.set(x, y, z, y === h - 1 ? 0x9a8a6a : 0x6a5e5a);
  return g;
};
const candleGrid = () => {
  const g = new VoxGrid();
  for (const [x, z, h] of [[0, 0, 4], [2, 1, 3], [-2, 1, 2]]) { g.box(x, 0, z, x, h - 1, z, 0xf4ecd8); g.set(x, h, z, C.fire, true); }
  return g;
};
const ghostGrid = () => {
  const g = new VoxGrid();
  g.ellipsoid(0, 10, 0, 5, 5, 4.5, C.ghost);
  g.box(-5, 3, -4, 5, 9, 4, (x, y, z) => ((x * x) / 26 + (z * z) / 18 > 1 ? undefined : y < 5 && (x + 9) % 3 === 0 ? undefined : y < 6 ? C.ghostS : C.ghost));
  g.box(-3, 10, 5, -2, 12, 5, C.ink).box(1, 10, 5, 2, 12, 5, C.ink);
  g.box(-1, 6, 5, 0, 8, 5, C.ink);
  g.box(-8, 8, 0, -6, 9, 0, C.ghost).box(6, 9, 0, 8, 10, 0, C.ghost);
  return g;
};
const batBodyGrid = () => { const g = new VoxGrid(); g.box(-1, 0, -2, 0, 1, 1, 0x1e1628); g.box(-1, 1, 2, 0, 2, 2, 0x1e1628).set(-1, 3, 2, 0x1e1628).set(0, 3, 2, 0x1e1628); g.set(-1, 2, 3, 0xff3a5a, true).set(0, 2, 3, 0xff3a5a, true); return g; };
const batWingGrid = () => { const g = new VoxGrid(); for (let x = 0; x <= 6; x++) { const w = x < 3 ? 2 : x < 5 ? 1 : 0; for (let z = -w; z <= w; z++) g.set(x, 0, z - 1, x % 3 === 2 ? 0x140e1c : 0x2e2440); } return g; };
/** Jagged lightning bolt (glow) for the far sky. */
const boltGrid = () => {
  const g = new VoxGrid();
  const R = mulberry32(13);
  let x = 0;
  for (let y = 0; y > -60; y -= 1) { x += Math.round((R() - 0.5) * 3); g.set(x, y, 0, 0xe8e0ff, true); if (y % 17 === 0 && y < 0) { let bx = x; for (let k = 0; k < 10; k++) { bx += R() < 0.5 ? 1 : 0; g.set(bx + k, y - k, 0, 0xc8b8ff, true); } } }
  return g;
};

// --------------------------------------------------------------------------- painted backdrops

function paintMoonSky(ctx, w, h) {
  if (ctx._hd) {
    hdStarfield(ctx, w, h, { n: 90, ymax: h * 0.5, seed: 17, tint: 0xd8c8ff });
    const mx = w * 0.7, my = h * 0.26, r = 16;
    hdMoon(ctx, mx, my, r, { color: C.moon, dark: 0xb8aac8, phase: 0.5, halo: 0xe8d8ff, haloA: 0.45, seed: 4 });
    hdStreaks(ctx, w, { n: 5, y0: my - 8, y1: my + 14, len: [30, 70], color: 0x4a3a6a, shade: 0x2a1e48, seed: 6, alpha: 0.85 });
    hdBirds(ctx, [[mx - 6, my - 3, 1], [mx + 5, my + 4, 1], [mx - 1, my + 8, 0]], 0x120c1a, 1);
    return;
  }
  paintStars(ctx, w, h, { n: 70, ymax: h * 0.5, seed: 17, tint: 0xd8c8ff });
  const mx = w * 0.7, my = h * 0.26, r = 16;
  for (let k = 4; k >= 1; k--) { ctx.globalAlpha = 0.07 * k; disc(ctx, mx, my, r + k * 5, 0xe8d8ff); }
  ctx.globalAlpha = 1;
  disc(ctx, mx, my, r, C.moon);
  const P = pixels(ctx, w, h);
  // craters + terminator shade
  const R = mulberry32(4);
  for (let k = 0; k < 9; k++) {
    const cx = mx + (R() - 0.5) * r * 1.4, cy = my + (R() - 0.5) * r * 1.4, cr = 1 + R() * 3;
    if (Math.hypot(cx - mx, cy - my) > r - cr - 1) continue;
    for (let y = -cr; y <= cr; y++) for (let x = -cr; x <= cr; x++) if (x * x + y * y <= cr * cr) P.set(cx + x, cy + y, 0xd8d0b8);
    P.set(cx + cr * 0.5, cy + cr * 0.5, 0xfffbe8);
  }
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && x - y * 0.3 > r * 0.55) P.set(mx + x, my + y, 0xd8d0b4);
  // wispy clouds across the moon
  for (let k = 0; k < 4; k++) {
    const y = Math.round(my - 8 + k * 7 + R() * 3), x0 = Math.round(mx - 40 + R() * 30), l = 30 + (R() * 30 | 0);
    for (let x = x0; x < x0 + l; x++) { P.set(x, y, 0x4a3a6a, 0.85); if ((x + k) % 3) P.set(x, y + 1, 0x3a2a5a, 0.7); }
  }
  // bat silhouettes over the moon
  for (const [bx, by] of [[mx - 6, my - 3], [mx + 5, my + 4], [mx - 1, my + 8]]) { P.set(bx, by, 0x120c1a).set(bx - 1, by - 1, 0x120c1a).set(bx + 1, by - 1, 0x120c1a).set(bx - 2, by, 0x120c1a).set(bx + 2, by, 0x120c1a); }
  P.flush();
}
function paintFarHills(ctx, w, h) {
  const P = pixels(ctx, w, h);
  const t1 = ridge(P, { base: h * 0.55, amp: h * 0.2, freq: 0.015, seed: 6, color: 0x2a1e44, rim: 0x4a3a6a });
  // castle on the highest hill
  let cx = 0, best = h;
  for (let x = 30; x < w - 30; x++) if (t1[x] < best) { best = t1[x]; cx = x; }
  const cb = best + 2;
  P.rect(cx - 16, cb - 14, 32, 14, 0x24183a);
  for (const tx of [-16, -6, 6, 14]) { P.rect(cx + tx, cb - 24 - (tx & 4), 4, 24 + (tx & 4), 0x24183a); for (let k = 0; k < 4; k++) P.set(cx + tx + k, cb - 25 - (tx & 4), k & 1 ? 0x24183a : 0); }
  for (const [x, y] of [[-12, -10], [-4, -8], [8, -12], [15, -18], [-14, -19]]) P.set(cx + x, cb + y, 0xffc84a).set(cx + x, cb + y + 1, 0xffc84a);
  // church spire + dead trees on the ridge
  const sx = Math.round(w * 0.2);
  P.rect(sx - 3, t1[sx] - 10, 6, 10, 0x24183a);
  for (let k = 0; k < 10; k++) P.rect(sx - Math.max(0, 2 - (k >> 2)), t1[sx] - 10 - k, Math.max(1, 5 - (k >> 1)), 1, 0x24183a);
  const R = mulberry32(8);
  for (let k = 0; k < 16; k++) {
    const x = R() * w | 0, b = t1[x];
    const hh = 6 + (R() * 8 | 0);
    for (let y = 0; y < hh; y++) P.set(x, b - y, 0x1c1430);
    P.set(x - 1, b - hh + 2, 0x1c1430).set(x - 2, b - hh + 1, 0x1c1430).set(x + 1, b - hh + 3, 0x1c1430).set(x + 2, b - hh + 2, 0x1c1430);
  }
  // lower foggy band
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (P.alpha(x, y) && y > h * 0.7 && bayer(x, y) < (y - h * 0.7) / (h * 0.45)) P.set(x, y, 0x5a4a7a, 0.7);
  P.flush();
}
function paintGraveHill(ctx, w, h) {
  const P = pixels(ctx, w, h);
  const t = ridge(P, { base: h * 0.62, amp: h * 0.16, freq: 0.022, seed: 12, color: 0x1e1630, rim: 0x3a2e52 });
  const R = mulberry32(21);
  for (let x = 4; x < w - 4; x += 5 + (R() * 7 | 0)) {
    const b = t[x];
    if (R() < 0.5) { P.rect(x, b - 5, 1, 5, 0x2e2444); P.rect(x - 1, b - 4, 3, 1, 0x2e2444); }
    else { P.rect(x - 1, b - 3, 3, 3, 0x2e2444); P.set(x, b - 4, 0x2e2444); }
  }
  for (let x = 0; x < w; x++) { const b = t[x]; if (x % 3 === 0) P.rect(x, b - 4, 1, 4, 0x150f22); P.set(x, b - 3, 0x150f22); }
  // glowing eyes in the dark
  for (let k = 0; k < 8; k++) { const x = R() * w | 0, y = t[x] + 3 + (R() * 6 | 0); P.set(x, y, 0xffd23f).set(x + 2, y, 0xffd23f); }
  P.flush();
}

// --------------------------------------------------------------------------- dynamic helpers

/** Low drifting fog: transparent pixel strips at ground level. */
function addFog(K, list) {
  const tex = canvasTex('hm_fog', 64, 16, (ctx, w, h) => {
    const P = pixels(ctx, w, h);
    for (let x = 0; x < w; x++) {
      const top = 3 + Math.round(vnoise(x * 0.2, 1, 1) * 6);
      for (let y = top; y < h; y++) {
        const t = (y - top) / (h - top);
        if (bayer(x, y) < 0.55 * Math.sin(t * Math.PI) * (0.6 + 0.4 * vnoise(x * 0.15, y * 0.3, 2))) P.set(x, y, 0xb8a8e0);
      }
    }
    P.flush();
  }, { repeatX: true });
  for (const o of list) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(o.w / 8, 1);
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: o.op ?? 0.5, depthWrite: false, fog: false });
    mat.color.setHex(o.tint ?? 0xffffff);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.d), mat);
    if (o.flat) m.rotation.x = -Math.PI / 2;
    m.position.set(o.x ?? 0, o.y, o.z);
    m.renderOrder = 2;
    K.add(m, o.parent);
    K.onUpdate((dt, tt) => { t.offset.x = (tt * o.sp) % 1; mat.opacity = (o.op ?? 0.5) * (0.8 + Math.sin(tt * 0.3 + o.z) * 0.2); });
  }
}
/** Pumpkins with flickering glow faces. list: [[x, z, ry, big]] */
function addPumpkins(K, id, list, scale) {
  for (const big of [false, true]) {
    const items = list.filter((p) => !!p[3] === big).map(([x, z, ry]) => [x, 0, z, ry]);
    if (!items.length) continue;
    K.inst(id + (big ? 'B' : 'S'), pumpkinGrid(big), { scale, ao: true }, items, { shadow: true });
    const faces = liveInst(K, id + (big ? 'FB' : 'FS'), pumpkinFaceGrid(big), { scale }, items.length);
    K.onUpdate((dt, t) => {
      items.forEach(([x, y, z, ry], i) => setInst(faces, i, x, y, z, ry, 0, 0, Math.sin(t * 9 + i * 3.1) + Math.sin(t * 13.7 + i) > -1.2 ? 1 : 0.0001));
      faces.instanceMatrix.needsUpdate = true;
    });
  }
}

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  const sky = skyTexture('haunted', [[0, 0x07041a], [0.2, 0x170a36], [0.38, 0x2e1458], [0.55, 0x4a1e72], [0.7, 0x5e3080], [0.82, 0x3a2a5a], [1, 0x22183a]], paintMoonSky);
  fitSky(K, sky);

  K.parallax('farHills', { z: -164, y: -3, w: parallaxWidth(-164), h: 36, tw: 400, th: 100, paint: paintFarHills, fogTint: [0x3a2a5a, 0.18] });
  K.parallax('graveHill', { z: -110, y: -2, w: parallaxWidth(-110), h: 14, tw: 340, th: 52, paint: paintGraveHill, fogTint: [0x2a1a4a, 0.1] });
  // lightning in the far sky now and then
  const bolt = K.mesh('bolt', boltGrid, { scale: 0.5, pivot: [0, 0, 0] }, -40, 48, -150, 0, 1);
  bolt.visible = false;
  K.onUpdate((dt, t) => { const q = t % 9.5; bolt.visible = (q > 6 && q < 6.12) || (q > 6.24 && q < 6.32); bolt.position.x = -40 + Math.floor(t / 9.5) % 3 * 45; });

  // ---- ground: dead grass, dirt, fallen leaves
  const turf = (x, z, fine) => {
    const n = vnoise(x * 0.1, 4, z * 0.12), m = hash3(Math.floor(x * (fine ? 2 : 1)), 9, Math.floor(z * (fine ? 2 : 1)));
    if (fine && m < 0.008) return [C.leafO, C.leafR, C.leafY][Math.floor(m * 400) % 3];
    if (n < 0.28) return m < 0.5 ? C.dirt : C.dirtL;
    if (n > 0.66) return C.grassL;
    return m < 0.4 ? C.grassD : C.grass;
  };
  K.ground({ id: 'groundFar', x0: -120, x1: 120, z0: -48, z1: -14, scale: 1, color: (x, z) => turf(x, z, false) });
  K.ground({ id: 'groundNear', x0: -64, x1: 64, z0: -14, z1: 32, scale: 0.5, color: (x, z) => (Math.abs(z) < LH + 0.3 ? C.dirtD : turf(x, z, true)) });
  K.ground({ id: 'groundFront', x0: -100, x1: 100, z0: 32, z1: 84, scale: 1, color: (x, z) => turf(x, z, false) });

  // ---- lane: old cobblestones
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.cobDD,
    color: (ix, iz) => {
      if (iz <= -9 || iz >= 8) return hash3(ix, iz, 2) < 0.4 ? C.grassD : C.cobDD;
      const ox = (iz >> 1) & 1 ? 1 : 0;
      const bx = (ix + ox) >> 1, bz = iz >> 1;
      const gx = (ix + ox) & 1, gz = iz & 1;
      const hh = hash3(bx, bz, 4);
      if (gx === 0 && gz === 0 && hh < 0.5) return C.cobDD; // grout corner
      if (hash3(ix, iz, 7) < 0.04) return C.moss;
      return hh < 0.25 ? C.cobL : hh > 0.8 ? C.cobD : C.cob;
    },
    raise: (ix, iz) => (iz === -10 || iz === 9) && hash3(ix >> 1, iz, 3) < 0.5,
    raiseColor: (ix, iz) => (hash3(ix, iz, 1) < 0.5 ? C.cobD : C.cobDD),
  });
  // pentagram-free spooky centre marker: a pumpkin-orange moon sigil
  K.mesh('sigil', () => {
    const g = new VoxGrid();
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      const r = Math.hypot(x, z);
      if (r > 5.4 || r < 4.4) continue;
      g.set(x, 0, z, C.purple, (x + z) % 3 === 0);
    }
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (Math.hypot(x, z) < 3 && Math.hypot(x - 1.4, z - 0.6) > 2.3) g.set(x, 0, z, C.pumpkin);
    return g;
  }, { scale: 0.11, pivot: [0, 0, 0] }, 0.06, 0.003, 1.2);

  // ---- breakables
  const brk = [[-19, 'pumpkin'], [-9.6, 'coffin'], [-3.3, 'tomb'], [4.4, 'pumpkin'], [10.2, 'tomb'], [18.6, 'coffin']];
  for (const [x, kind] of brk) {
    if (kind === 'pumpkin') K.breakable('pumpkin', 'pumpkinBig', pumpkinGrid(true), { scale: 0.1 }, x, -3.2, K.rand(-0.4, 0.4));
    else if (kind === 'coffin') K.breakable('crate', 'coffin', coffinGrid, { scale: 0.1 }, x, -3.3, Math.PI / 2 + K.rand(-0.2, 0.2));
    else K.breakable('tomb', 'tombB', tombGrid(7), { scale: 0.11 }, x, -3.4, K.rand(-0.3, 0.3));
  }

  // ---- graveyard midground
  const tombs = [];
  for (let i = 0; i < 26; i++) {
    const x = K.rand(-32, 32), z = K.rand(-14, -5.5);
    if (Math.abs(x + 3.6) < 4 && z > -12) continue; // keep the cauldron clear
    tombs.push([x, 0, z, K.rand(-0.25, 0.25), K.rand(0.9, 1.25)]);
  }
  for (let k = 0; k < 4; k++) K.inst('tomb' + k, tombGrid(k * 3 + 1), { scale: 0.11, ao: true }, tombs.filter((_, i) => i % 4 === k), { shadow: true });
  K.inst('grave', graveGrid, { scale: 0.11 }, [[-12.8, 0, -8.6, 0.2], [14.6, 0, -9.2, -0.3]], { shadow: true });
  K.mesh('crypt', cryptGrid, { scale: 0.14, ao: true }, 16.6, 0, -13.4, -0.25, 1, { shadow: true });
  K.inst('fence', fenceGrid, { scale: 0.1 }, [[-24, 0, -5.4, 0], [-7.6, 0, -15.5, 0.05], [24.5, 0, -5.6, 0]], { shadow: true });
  addPumpkins(K, 'pk', [[-15.8, -5.2, 0.3, true], [-14.6, -6.2, -0.4], [-5.8, -5.0, 0.2], [7.4, -5.6, -0.3, true], [8.6, -6.4, 0.5], [12, -4.8, 0], [21.2, -6.2, -0.2, true], [-26.4, -6.6, 0.4], [-1.2, -11.4, 0, true], [27, -9, -0.3]], 0.1);
  K.mesh('cauldron', cauldronGrid, { scale: 0.11, ao: true }, -3.6, 0, -8.2, 0, 1, { shadow: true });
  addFlames(K, 'hmf', [[-3.6, 0.0, -8.2, 1.1]], 0.08, [0xd8ffb0, 0x9dff3a, 0x5fdc4a, 0x2fae4a], 6);
  addParticles(K, 18, [-4.1, -3.1, 1.0, 2.6, -8.7, -7.7], { color: 0x9dff3a, glow: 1.9, size: [0.06, 0.12], vy: 0.7, drift: 0.2, fadeTop: true });
  K.mesh('scarecrow', scarecrowGrid, { scale: 0.11, ao: true }, 4.4, 0, -10.2, -0.2, 1, { shadow: true });
  K.inst('lanternPost', lanternPostGrid, { scale: 0.11 }, [[-9, 0, -5.0, 0], [2.6, 0, -5.4, Math.PI], [14.4, 0, -5.2, 0], [-22.4, 0, -5.4, Math.PI]], { shadow: true });
  K.inst('coffinMid', coffinGrid, { scale: 0.1, ao: true }, [[-19.6, 0, -11.6, 0.4], [23, 0, -12.4, -0.8]], { shadow: true });
  K.inst('candles', candleGrid, { scale: 0.07 }, [[-6.6, 0, -4.8], [0.4, 0, -5.4], [10.8, 0, -5.0], [17.6, 0, -5.4], [-12, 0, -5.2]]);

  // ---- landmarks: the mansion on its hill, the swing tree, the bell tower
  const MS = 0.17, MX = 1.5, MZ = -38;
  K.mesh('hill', hillGrid(1), { scale: 0.3 }, MX, 0, MZ + 1, 0, 1, { shadow: true });
  const hillTop = 27 * 0.3;
  K.mesh('mansion', mansionGrid(false), { scale: MS, pivot: [0, 0, 0] }, MX, hillTop - 0.5, MZ, 0, 1, { shadow: true });
  const lit = K.mesh('mansionLit', mansionGrid(true), { scale: MS, pivot: [0, 0, 0] }, MX, hillTop - 0.5, MZ, 0, 1);
  K.onUpdate((dt, t) => { lit.visible = Math.sin(t * 7.3) + Math.sin(t * 2.1) > -1.6; });
  K.mesh('swingTree', deadTreeGrid, { scale: 0.2 }, -20, 0, -21, 0.4, 1, { shadow: true });
  // the hill: lantern-lit winding path, little graves and crooked trees on the slopes
  const hillY = (lx, lz) => { const d = Math.hypot(lx / 70, (lz + 4) / 36); return d >= 1 ? 0 : Math.round(28 * Math.pow(1 - d, 0.7)) * 0.3; };
  const onHill = (vx, vz) => [MX + vx * 0.3, hillY(vx, vz) - 0.1, MZ + 1 + (vz + 3.5) * 0.3];
  const hl = [], ht = [], hg = [];
  for (let k = 0; k < 6; k++) { const vz = 12 + k * 3.6; const vx = Math.sin(vz * 0.12) * 6 + (k & 1 ? 4.5 : -4.5); hl.push([...onHill(vx, vz), k & 1 ? Math.PI : 0]); }
  for (const [vx, vz] of [[-40, 6], [-28, 18], [34, 10], [46, 2], [-52, -6], [22, 22], [-16, 26]]) ht.push([...onHill(vx, vz), K.rand(0, 6), K.rand(0.8, 1.1)]);
  for (const [vx, vz] of [[-20, 20], [-24, 12], [16, 24], [26, 16], [-34, 4], [38, 0], [12, 30], [-10, 30]]) hg.push([...onHill(vx, vz), K.rand(-0.3, 0.3), 0.9]);
  K.inst('hillLantern', lanternPostGrid, { scale: 0.1 }, hl, { shadow: true });
  K.inst('hillTree', deadTreeGrid, { scale: 0.07 }, ht, { shadow: true });
  K.inst('hillTomb', tombGrid(2), { scale: 0.09 }, hg, { shadow: true });
  K.mesh('bellTower', bellTowerGrid, { scale: 0.16 }, 25, 0, -25, -0.3, 1, { shadow: true });
  const bell = K.mesh('bell', bellGrid, { scale: 0.16, pivot: [0, 0, 0] }, 25, 39 * 0.16, -25, -0.3);
  K.onUpdate((dt, t) => { bell.rotation.x = Math.sin(t * 1.8) * 0.4 * Math.max(0, Math.sin(t * 0.25)); });
  // crows perched on the tree (idle hop)
  const crowSpots = [[-20 + 3.4, 5.6, -21 + 0.4], [-20 - 2.6, 6.4, -21 - 0.6], [-20 + 0.6, 8.6, -21 - 1.1]];
  const crows = liveInst(K, 'crow', crowGrid, { scale: 0.09 }, crowSpots.length, { shadow: true });
  K.onUpdate((dt, t) => {
    crowSpots.forEach(([x, y, z], i) => { const hop = Math.max(0, Math.sin(t * 0.9 + i * 2.3)) > 0.97 ? 0.12 : 0; setInst(crows, i, x, y + hop, z, 0.8 + Math.sin(t * 0.4 + i) * 0.6); });
    crows.instanceMatrix.needsUpdate = true;
  });

  // ---- life: bats around the turrets, ghosts drifting, will-o'-wisps, fog
  addFlyers(K, 'bat', batBodyGrid, batWingGrid, { scale: 0.1 }, [
    ...orbitList(K, 6, [MX - 5, 18, MZ + 3], { r0: 4, r1: 9, spread: 4, dy: 4, f0: 12, f1: 16, squash: 0.5 }),
    ...orbitList(K, 5, [-10, 9, -16], { r0: 6, r1: 12, spread: 6, dy: 3, f0: 12, f1: 16, squash: 0.35 }),
  ], { flap: 0.9, bob: 0.8 });
  const ghostMats = [new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }), Mats.glow];
  const ghosts = liveInst(K, 'ghost', ghostGrid, { scale: 0.1 }, 4, { mats: ghostMats });
  ghosts.renderOrder = 4;
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 4; i++) {
      const x = -24 + ((t * (0.6 + i * 0.15) + i * 13) % 48);
      setInst(ghosts, i, x, 1.4 + i * 0.5 + Math.sin(t * 1.5 + i) * 0.3, -7 - i * 2.4 + Math.sin(t * 0.4 + i) * 0.8, Math.PI / 2, 0, Math.sin(t * 2 + i) * 0.1, 0.9 + (i & 1) * 0.3);
    }
    ghosts.instanceMatrix.needsUpdate = true;
  });
  addParticles(K, 20, [-30, 30, 0.5, 3.5, -16, -5], { color: [0x8affd8, 0xc8a8ff], glow: 2.1, size: [0.07, 0.11], vy: 0.04, drift: 0.9, twinkle: 1.3 });
  addParticles(K, 40, [-40, 40, 1, 14, -30, 6], { color: [C.leafO, C.leafY, C.leafR], size: [0.06, 0.1], vy: -0.35, drift: 1.2, wind: 0.5, seed: 44 }); // falling leaves
  addFog(K, [
    { x: 0, y: 0.2, z: -7.5, w: 120, d: 1.2, sp: 0.01, op: 0.22 },
    { x: 0, y: 0.6, z: -12.5, w: 120, d: 2.0, sp: -0.008, op: 0.26 },
    { x: 0, y: 1.0, z: -19, w: 140, d: 3.0, sp: 0.006, op: 0.32, tint: 0xd8c8ff },
    { x: 0, y: 1.6, z: -28, w: 160, d: 4.4, sp: -0.005, op: 0.38, tint: 0xc8b8f0 },
    { x: 0, y: 0.18, z: 9, w: 120, d: 5, sp: 0.012, op: 0.16, flat: true },
    { x: 0, y: 0.22, z: 20, w: 140, d: 7, sp: -0.009, op: 0.14, flat: true },
  ]);

  // ---- LOW foreground: small pumpkins, bones, leaves, dead tufts, candles
  const fp = [];
  for (let i = 0; i < 12; i++) fp.push([K.rand(-40, 40), K.rand(LH + 1, 22), K.rand(-0.5, 0.5)]);
  addPumpkins(K, 'pkF', fp, 0.075);
  const bones = [], leaves = [[], [], []], tufts = [];
  for (let i = 0; i < 14; i++) bones.push([K.rand(-40, 40), 0, K.rand(LH + 0.8, 24), K.rand(0, 6), K.rand(0.8, 1.2)]);
  for (let i = 0; i < 120; i++) leaves[i % 3].push([K.rand(-44, 44), 0.005, K.rand(LH + 0.5, 30), K.rand(0, 6), K.rand(0.8, 1.4)]);
  for (let i = 0; i < 70; i++) tufts.push([K.rand(-46, 46), 0, K.rand(LH + 0.7, 32), K.rand(0, 6), K.rand(0.8, 1.5)]);
  K.inst('bone', boneGrid, { scale: 0.07 }, bones);
  [C.leafO, C.leafR, C.leafY].forEach((c, k) => K.inst('leaf' + k, leafGrid(c), { scale: 0.08 }, leaves[k]));
  K.inst('deadTuft', deadTuftGrid, { scale: 0.09 }, tufts);
  K.inst('candlesF', candleGrid, { scale: 0.06 }, [[-12, 0, 4.4], [9, 0, 5.2], [22, 0, 4.6], [-26, 0, 6]]);

  return {
    sky,
    fog: { color: 0x2a1a48, near: 56, far: 190 },
    lights: { sky: 0xa898d8, ground: 0x2a1a3a, hemi: 0.95, sun: 1.6, sunColor: 0xd8d0ff, dir: [8, 14, 6], rim: 1.3, rimColor: 0xb07aff },
    dust: 0x6a5a5a,
    bloom: { strength: 0.85, threshold: 1.7, radius: 0.3 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  zoneDisc(K, 'zoneHaunted', {
    r: 22, seed: 4,
    colorTop: (x, z, r, R) => {
      if (Math.abs(x - Math.sin(z * 0.3) * 2) < 2 && z > 2) return hash3(x, 1, z) < 0.5 ? C.cob : C.cobD;
      if (r > R - 1.2) return C.dirtD;
      return vnoise(x * 0.2, 3, z * 0.2) > 0.62 ? C.grassL : hash3(x, 2, z) < 0.06 ? C.leafO : C.grass;
    },
    colorSide: (x, y) => (y > -2 ? C.dirt : (x + y) & 1 ? C.dirtD : C.cobDD),
  });
  // a small hill + the mansion on top
  K.mesh('hill', hillGrid(0.5), { scale: 0.18 }, 0, 0, -2.4, 0, 1, { shadow: true });
  const MS = 0.075, top = 13.5 * 0.18;
  K.mesh('mansion', mansionGrid(false, true), { scale: MS, pivot: [0, 0, 0] }, 0, top - 0.2, -3.0, 0, 1, { shadow: true });
  const lit = K.mesh('mansionLit', mansionGrid(true, true), { scale: MS, pivot: [0, 0, 0] }, 0, top - 0.2, -3.0);
  K.onUpdate((dt, t) => { lit.visible = Math.sin(t * 7.3) + Math.sin(t * 2.1) > -1.6; });
  const tombs = [];
  for (let i = 0; i < 12; i++) { const a = K.rand(0.2, Math.PI - 0.2), r = K.rand(3.6, 5.6); tombs.push([Math.cos(a) * r * (i & 1 ? 1 : -1) * 0.95, 0, Math.sin(a) * r * 0.7 + 1.2, K.rand(-0.3, 0.3), K.rand(0.9, 1.2)]); }
  for (let k = 0; k < 3; k++) K.inst('tomb' + k, tombGrid(k * 3 + 1), { scale: 0.055 }, tombs.filter((_, i) => i % 3 === k), { shadow: true });
  K.mesh('crypt', cryptGrid, { scale: 0.06 }, 4.6, 0, 1.4, -0.6, 1, { shadow: true });
  K.mesh('swingTree', deadTreeGrid, { scale: 0.08 }, -4.6, 0, 0.6, 0.6, 1, { shadow: true });
  addPumpkins(K, 'pk', [[-1.6, 4.6, 0.2, true], [1.4, 5.0, -0.3], [-3.6, 3.4, 0.5], [3.4, 4.0, -0.4, true]], 0.06);
  K.mesh('cauldron', cauldronGrid, { scale: 0.06 }, 2.2, 0, 2.6, 0, 1, { shadow: true });
  addParticles(K, 8, [1.9, 2.5, 0.5, 1.5, 2.3, 2.9], { color: 0x9dff3a, glow: 1.9, size: [0.04, 0.07], vy: 0.5, drift: 0.1, fadeTop: true });
  K.inst('lanternPost', lanternPostGrid, { scale: 0.06 }, [[-1.4, 0, 2.4, 0], [1.6, 0, 1.8, Math.PI]], { shadow: true });
  addFlyers(K, 'bat', batBodyGrid, batWingGrid, { scale: 0.06 }, orbitList(K, 6, [0, 5.2, -2.6], { r0: 2, r1: 4.5, spread: 1.5, dy: 1.5, f0: 12, f1: 16, squash: 0.8 }), { flap: 0.9, bob: 0.4 });
  const ghostMats = [new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }), Mats.glow];
  const ghost = liveInst(K, 'ghost', ghostGrid, { scale: 0.05 }, 2, { mats: ghostMats });
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 2; i++) { const a = t * 0.3 * (i ? -1 : 1) + i * 3; setInst(ghost, i, Math.cos(a) * 4.6, 0.6 + Math.sin(t * 1.4 + i) * 0.2, 1 + Math.sin(a) * 3.2, -a + (i ? 0 : Math.PI), 0, 0); }
    ghost.instanceMatrix.needsUpdate = true;
  });
  addFog(K, [
    { x: 0, y: 0.2, z: 4.6, w: 12, d: 0.8, sp: 0.02, op: 0.45 },
    { x: 0, y: 0.35, z: -0.4, w: 13, d: 1.0, sp: -0.015, op: 0.4, tint: 0xd8c8ff },
  ]);
  addParticles(K, 10, [-5, 5, 0.3, 2, -3, 5], { color: [0x8affd8, 0xc8a8ff], glow: 2.1, size: [0.05, 0.08], vy: 0.03, drift: 0.5, twinkle: 1.3 });
  anchor(K, 'boss', -2.6, 0, 5.2);
  anchor(K, 'npc', 2.6, 0, 5.4);
  anchor(K, 'enterMansion', 0, top + 0.8, -1.6);
  K.root.scale.setScalar(ZONE_SCALE); // fill the plinth
  return { focus: [0, 1.4, 0], radius: 7 };
}
