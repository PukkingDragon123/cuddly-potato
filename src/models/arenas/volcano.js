// Arena 14: VOLCANO FORGE — "I Built A Secret Lair Inside A Volcano".
// The lane is a riveted iron causeway over cooling basalt, with a lava river
// churning in front. Behind it the Beast forge works non-stop: a giant
// hammer pounding glowing ingots on an anvil in showers of sparks, a crucible
// pouring molten gold into moulds, a furnace roaring, bellows pumping,
// minecarts of glowing ore rattling along rails, obsidian spikes and basalt
// columns. Beyond, a lavafall pours off a cliff and the erupting volcano lair
// - its gate carved as a giant obsidian panther skull - throws up lava
// fountains and ash under a blood-orange sky full of embers.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, mulberry32, bayer,
  paintGradient, px, disc, skyTexture, parallaxWidth, canvasTex,
} from './kit.js';
import { hdGlow, hdCloud, hdRange, rgba } from './hdpaint.js';
import { pixels, ridge, setInst, liveInst, fitSky, scrollPlane, fallSheet, fallsTex, addFlyers, orbitList, addParticles, addFlames, zoneDisc, anchor } from './wildsKit.js';
import { Billboards } from '../island/sky.js';

const C = {
  basalt: 0x48404c, basaltL: 0x5c5462, basaltD: 0x342e38, basaltLL: 0x6e6674, ash: 0x7a7080,
  obs: 0x241e2c, obsL: 0x4a3a5a, obsP: 0x6a4a8a,
  lava: 0xff6a1f, lavaL: 0xffb84a, lavaY: 0xffe07a, lavaD: 0xc83a14, crust: 0x5a1a10, crustD: 0x3a1210,
  iron: 0x4a4e5a, ironL: 0x6a6e7a, ironD: 0x2e313a, rivet: 0x8a8e9a, rust: 0x8a4a2a,
  brick: 0x6a3a2e, brickL: 0x8a4a38, brickD: 0x4a2620, stone: 0x6a6270, stoneL: 0x8a8290,
  gold: 0xffc21a, goldL: 0xffe680, goldD: 0xc8901a, wood: 0x6a4a2a, woodD: 0x4a321c, leather: 0x7a4a2a,
  ink: 0x15121f, chain: 0x5a5e6a, hot: 0xff8a2a, red: 0xe8343c,
};
const LH = FIELD.LANE_HALF;
const ZONE_SCALE = 1.18;
const RIVER = (x) => 6.6 + Math.sin(x * 0.12) * 0.7 + Math.sin(x * 0.05 + 1) * 0.6;

// --------------------------------------------------------------------------- textures

const lavaTex = (id) => canvasTex(id, 32, 32, (ctx, w, h) => {
  const R = mulberry32(id.length * 13);
  px(ctx, 0, 0, w, h, C.lava);
  for (let i = 0; i < 160; i++) px(ctx, R() * w | 0, R() * h | 0, 1, 1, R() < 0.5 ? 0xff8a2a : 0xe8481a);
  for (let i = 0; i < 9; i++) {
    const x = R() * w | 0, y = R() * h | 0, pw = 4 + (R() * 6 | 0), ph = 2 + (R() * 4 | 0);
    px(ctx, x, y, pw, ph, C.crust);
    px(ctx, x + 1, y + 1, pw - 2, Math.max(1, ph - 2), C.crustD);
  }
  for (let i = 0; i < 18; i++) px(ctx, R() * w | 0, R() * h | 0, 2, 1, R() < 0.5 ? C.lavaL : C.lavaY);
}, { repeatX: true });

// --------------------------------------------------------------------------- voxel props

/** The volcano with its lair gate (panther skull carved in obsidian), lava streaks. Front +z. */
const VH = 56;
const volcanoGrid = (res = 1) => () => {
  const g = new VoxGrid();
  const Rb = Math.round(70 * res), cr = Math.round(14 * res), VHr = Math.round(VH * res);
  const hAt = (x, z) => {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d > Rb || z >= Math.round(20 * res)) return 0;
    if (d < cr) return Math.round(VHr * Math.pow(1 - cr / Rb, 1.25)) - Math.round((1 - d / cr) * 6 * res);
    return Math.max(0, Math.round(VHr * Math.pow(1 - d / Rb, 1.25) * (0.9 + vnoise(x * 0.08 / res, 3, z * 0.08 / res) * 0.2)));
  };
  for (let x = -Rb; x < Rb; x++) for (let z = -Rb; z < Math.round(20 * res); z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    const hh = hAt(x, z);
    if (hh <= 0) continue;
    const streak = Math.abs(Math.sin(Math.atan2(z, x) * 7 + vnoise(d * 0.1, 1, 2) * 2)) < 0.07 && z > -10;
    // a watertight shell: fill down to the lowest neighbour (keeps the voxel count sane)
    const low = Math.min(hAt(x + 1, z), hAt(x - 1, z), hAt(x, z + 1), hAt(x, z - 1)) - 1;
    for (let y = Math.max(0, Math.min(hh - 2, low)); y < hh; y++) {
      // only a shell (top 3 voxels + the visible front face) to keep the voxel count sane
      let c = res < 1 ? (y % 4 === 0 ? C.basaltD : C.basalt) : (y + (x >> 2)) % 7 === 0 ? C.basaltD : hash3(x >> 2, y >> 2, z >> 2) < 0.2 ? C.basaltL : C.basalt;
      if (y === hh - 1 && res === 1 && hash3(x, y, z) < 0.25) c = C.ash;
      if (streak) c = y === hh - 1 ? (hash3(x, y, z) < 0.4 ? C.lavaL : C.lava) : C.lavaD;
      g.set(x, y, z, c);
    }
    if (d < cr - 2) g.set(x, hh, z, hash3(x, 9, z) < 0.3 ? C.lavaL : C.lava, hash3(x, 7, z) < 0.15); // crater lava
  }
  if (res < 1) {
    // mini lair door with glowing eyes
    const gz = Math.round(20 * res) - 1;
    g.box(-5, 0, gz - 2, 4, 9, gz, C.obs);
    g.box(-3, 0, gz + 1, 2, 4, gz + 1, C.ink);
    g.box(-3, 6, gz + 1, -2, 7, gz + 1, C.lava, true).box(1, 6, gz + 1, 2, 7, gz + 1, C.lava, true);
    return g;
  }
  // the lair gate: giant obsidian panther skull at the base, glowing eyes + portcullis
  const gz = 20;
  for (let x = -18; x <= 17; x++) for (let y = 0; y <= 30; y++) {
    const head = ((x + 0.5) / 16) ** 2 + ((y - 14) / 15) ** 2 <= 1;
    const ear = y > 22 && Math.abs(Math.abs(x + 0.5) - 11) < (31 - y) * 0.5;
    if (!head && !ear) continue;
    for (let z = gz - 6; z <= gz; z++) g.set(x, y, z, z === gz ? (hash3(x, y, 3) < 0.2 ? C.obsL : C.obs) : C.basaltD);
  }
  for (const s of [-1, 1]) {
    g.box(s > 0 ? 3 : -9, 15, gz + 1, s > 0 ? 8 : -4, 19, gz + 1, C.ink);
    g.box(s > 0 ? 4 : -8, 16, gz + 1, s > 0 ? 7 : -5, 18, gz + 2, C.lava, true);
    g.line(s * 2, 22, gz + 1, s * 10, 20, gz + 1, C.obsP); // brow
  }
  g.box(-2, 11, gz + 1, 1, 13, gz + 1, C.ink);
  // mouth gate (portcullis) with fangs
  g.box(-8, 0, gz + 1, 7, 9, gz + 1, C.ink);
  for (let x = -7; x <= 6; x += 2) g.box(x, 1, gz + 2, x, 9, gz + 2, C.iron);
  for (let y = 2; y <= 9; y += 3) g.box(-7, y, gz + 2, 6, y, gz + 2, C.ironD);
  for (const fx of [-7, -4, 3, 6]) g.box(fx, 7, gz + 3, fx, 9, gz + 3, 0xe8e2d4);
  g.box(-7, 0, gz - 4, 6, 6, gz, C.lavaD);
  return g;
};
/** Basalt column cluster (hexagonal-ish pillars). */
const basaltColsGrid = (seed) => () => {
  const g = new VoxGrid();
  for (let k = 0; k < 9; k++) {
    const cx = Math.round((hash3(seed, k, 1) - 0.5) * 16), cz = Math.round((hash3(seed, k, 2) - 0.5) * 10);
    const h = 8 + Math.floor(hash3(seed, k, 3) * 26);
    for (let y = 0; y < h; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (Math.abs(x) + Math.abs(z) > 3) continue;
      g.set(cx + x, y, cz + z, y === h - 1 ? C.basaltLL : (Math.abs(x) === 2 || Math.abs(z) === 2) ? C.basaltD : (y % 8 === 0 ? C.basaltD : C.basaltL));
    }
  }
  return g;
};
/** Rock cliff with a lavafall notch (front +z at z = 0). */
const cliffGrid = () => {
  const g = new VoxGrid();
  const W = 36, H = 56, D = 12;
  for (let x = -W; x < W; x++) for (let z = -D; z <= 0; z++) {
    const ex = Math.abs(x + 0.5) / W;
    let hh = Math.round(H * (1 - Math.pow(ex, 3)) * (0.8 + 0.2 * vnoise(x * 0.15, 2, z * 0.2)));
    if (Math.abs(x + 0.5) < 4) hh -= 3;
    for (let y = 0; y < hh; y++) {
      const st = vnoise(x * 0.3, y * 0.15, z * 0.3);
      let c = st > 0.62 ? C.basaltLL : st > 0.4 ? C.basaltL : C.basalt;
      if (y >= hh - 1) c = C.ash;
      if (z === 0 && Math.abs(x + 0.5) < 6 && Math.abs(x + 0.5) > 3.5) c = y % 3 ? C.lavaD : C.crust; // glowing edges of the fall
      g.set(x, y, z, c);
    }
  }
  return g;
};
/** Anvil on a stump. */
const anvilGrid = () => {
  const g = new VoxGrid();
  g.box(-5, 0, -4, 4, 6, 3, (x, y) => (y === 6 ? C.woodD : (x + y) % 4 === 0 ? C.woodD : C.wood));
  g.box(-3, 7, -2, 2, 8, 1, C.ironD);
  g.box(-1, 9, -1, 0, 10, 0, C.ironD);
  g.box(-6, 11, -2, 5, 13, 1, (x, y) => (y === 13 ? C.ironL : C.iron));
  g.box(6, 12, -1, 9, 13, 0, C.iron).box(10, 13, -1, 11, 13, 0, C.iron);
  g.box(-3, 14, -1, 2, 14, 0, C.lavaY, true); // glowing ingot
  g.box(-4, 14, -1, -4, 14, 0, C.lava);
  return g;
};
/** The giant forge hammer (pivots at its back end, x = 0). */
const hammerGrid = () => {
  const g = new VoxGrid();
  g.box(0, -1, -1, 34, 0, 0, C.wood);
  g.box(34, -5, -4, 43, 4, 3, (x, y, z) => (x === 34 || x === 43 ? C.ironD : y === 4 ? C.ironL : C.iron));
  g.box(35, -6, -3, 42, -6, 2, C.ironD);
  for (const [x, y] of [[36, 2], [41, 2], [36, -3], [41, -3]]) g.set(x, y, 4, C.rivet);
  text(g, 'B', 38, -2, 4, '+z', C.gold, {});
  return g;
};
const hammerFrameGrid = () => {
  const g = new VoxGrid();
  for (const z of [-5, 4]) { g.box(-2, 0, z, 1, 34, z + 1, C.ironD); }
  g.box(-2, 30, -5, 1, 32, 5, C.iron);
  g.box(-4, 0, -7, 3, 1, 7, C.ironD);
  for (let y = 4; y < 30; y += 6) for (const z of [-5, 5]) g.set(-3, y, z, C.rivet);
  return g;
};
/** Furnace: brick dome with a glowing mouth + chimney. */
const furnaceGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 18; y++) for (let x = -10; x <= 9; x++) for (let z = -8; z <= 7; z++) {
    const r = Math.hypot((x + 0.5) / 10, (z + 0.5) / 8);
    const lim = y < 8 ? 1 : Math.sqrt(Math.max(0, 1 - ((y - 8) / 10) ** 2));
    if (r > lim) continue;
    if (r < lim - 0.22 && y > 0) continue;
    g.set(x, y, z, ((y >> 1) + (x >> 2)) & 1 ? C.brick : (hash3(x, y, z) < 0.2 ? C.brickL : C.brickD));
  }
  for (let y = 1; y < 8; y++) for (let x = -4; x <= 3; x++) if ((x + 0.5) ** 2 / 16 + ((y - 1) ** 2) / 49 < 1) {
    g.set(x, y, 7, y < 3 ? C.lavaY : C.lava, y < 5);
    g.set(x, y, 8, null);
  }
  g.box(-6, 0, 8, 5, 0, 10, C.stoneL);
  g.box(-2, 16, -3, 1, 30, 0, (x, y) => (y % 4 === 0 ? C.brickD : C.brick));
  g.box(-3, 31, -4, 2, 31, 1, C.brickD);
  return g;
};
const bellowsGrid = () => {
  const g = new VoxGrid();
  g.box(-6, 0, -3, 5, 0, 2, C.woodD);
  g.box(-6, 1, -3, 5, 4, 2, C.leather);
  g.box(-6, 5, -3, 5, 5, 2, C.woodD);
  g.box(6, 2, -1, 10, 3, 0, C.ironD);
  g.box(-9, 5, -1, -7, 5, 0, C.wood);
  return g;
};
/** Crucible hanging from a gantry (pour animation tilts it). */
const crucibleGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) g.cylinder(-0.5, -0.5, -y, -y, 3.6 - y * 0.15, y === 0 ? C.ironL : C.iron);
  g.cylinder(-0.5, -0.5, 0, 0, 2.8, C.lavaY, 'y', true);
  g.box(3, -1, -1, 5, 0, 0, C.iron);
  for (const s of [-1, 1]) g.line(s * 4, 0, 0, 0, 10, 0, C.chain);
  return g;
};
const gantryGrid = () => {
  const g = new VoxGrid();
  for (const x of [-12, 11]) g.box(x, 0, -1, x + 1, 30, 0, C.ironD);
  g.box(-12, 30, -1, 12, 32, 0, C.iron);
  return g;
};
const mouldGrid = () => {
  const g = new VoxGrid();
  g.box(-8, 0, -3, 7, 2, 2, C.ironD);
  for (let x = -7; x <= 6; x += 3) g.box(x, 2, -2, x + 1, 2, 1, x < 0 ? C.goldL : C.lava, x >= 0);
  return g;
};
const oreCartGrid = () => {
  const g = new VoxGrid();
  g.box(-5, 2, -3, 4, 6, 2, (x, y, z) => (y === 2 || x === -5 || x === 4 || z === -3 || z === 2 ? C.iron : null));
  for (const [x, z] of [[-4, -3], [3, -3], [-4, 2], [3, 2]]) g.box(x, 0, z, x, 1, z, C.ironD);
  for (let x = -4; x <= 3; x++) for (let z = -2; z <= 1; z++) g.set(x, 7, z, hash3(x, 1, z) < 0.35 ? C.lavaL : hash3(x, 2, z) < 0.5 ? C.gold : C.obsL, hash3(x, 1, z) < 0.15);
  for (const [x, y] of [[-5, 4], [4, 4]]) g.set(x, y, 3, C.rivet);
  return g;
};
const railGrid = () => {
  const g = new VoxGrid();
  for (let x = -40; x < 40; x++) { g.set(x, 0, -3, C.ironL); g.set(x, 0, 2, C.ironL); if ((x & 3) === 0) g.box(x, -1, -4, x, -1, 3, C.woodD); }
  return g;
};
const obsidianGrid = (seed) => () => {
  const g = new VoxGrid();
  for (let k = 0; k < 7; k++) {
    const x = Math.round((hash3(seed, k, 1) - 0.5) * 8), z = Math.round((hash3(seed, k, 2) - 0.5) * 6);
    const h = 4 + Math.floor(hash3(seed, k, 3) * 14);
    const lx = (hash3(seed, k, 4) - 0.5) * 0.4;
    for (let y = 0; y < h; y++) {
      const w = y < h * 0.6 ? 1 : 0;
      const ox = Math.round(lx * y);
      g.box(x + ox, y, z, x + ox + w, y, z + w, y === h - 1 ? C.obsP : (x + y) % 4 === 0 ? C.obsL : C.obs);
    }
    if (k % 2 === 0) g.set(x, 0, z + 2, C.lava, true);
  }
  return g;
};
const pipeGrid = () => {
  const g = new VoxGrid();
  for (let x = -30; x < 30; x++) { g.box(x, 0, -1, x, 1, 0, (x + 60) % 10 === 0 ? C.rust : C.iron); if ((x + 60) % 10 === 0) g.set(x, 2, 0, C.lava, true); }
  for (const x of [-30, 29]) g.box(x, -6, -1, x, 0, 0, C.ironD);
  return g;
};
const goldRackGrid = () => {
  const g = new VoxGrid();
  for (const x of [-6, 5]) g.box(x, 0, -2, x, 10, -2, C.ironD);
  for (const y of [3, 7, 10]) { g.box(-6, y, -2, 5, y, 1, C.iron); for (let x = -5; x <= 4; x += 2) g.box(x, y + 1, -1, x + 1, y + 1, 0, y === 10 ? C.lava : C.gold, y === 10); }
  return g;
};
const crateGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 5, 2, (x, y) => (y % 2 ? C.wood : C.woodD));
  for (const [a, b] of [[-4, -3], [3, -3], [-4, 2], [3, 2]]) g.box(a, 0, b, a, 5, b, C.ironD);
  g.box(-3, 6, -2, 2, 6, 1, (x, y, z) => (hash3(x, y, z) < 0.4 ? C.lavaL : C.obsL));
  text(g, 'ORE', 0, 2, 3, '+z', C.lavaL, { center: true });
  return g;
};
const barrelGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) g.cylinder(-0.5, -0.5, y, y, 2.8 + (y > 1 && y < 6 ? 0.3 : 0), y === 1 || y === 6 ? C.ironD : C.rust);
  g.box(-1, 3, 3, 0, 5, 3, C.gold);
  g.set(-1, 8, -1, C.lava, true);
  return g;
};
const chainGrid = () => { const g = new VoxGrid(); for (let y = 0; y < 30; y++) g.set(0, -y, y & 1 ? 0 : 1, (y & 1) ? C.chain : 0x7a7e8a); g.box(-1, -31, 0, 1, -33, 1, C.ironD); return g; };
const pebbleGrid = () => { const g = new VoxGrid(); g.box(-2, 0, -1, 1, 0, 1, C.basaltL).set(0, 1, 0, C.basaltLL).set(2, 0, 0, C.obs); return g; };
const shardGrid = () => { const g = new VoxGrid(); g.box(0, 0, 0, 0, 3, 0, C.obs).set(0, 4, 0, C.obsP).box(1, 0, 0, 1, 1, 0, C.obsL).set(-1, 0, 1, C.obs); return g; };
const crustGrid = () => { const g = new VoxGrid(); g.box(-3, 0, -2, 2, 0, 1, C.crustD).box(-2, 0, -1, 1, 0, 0, C.crust).set(3, 0, 0, C.crust); return g; };
const ventGrid = () => { const g = new VoxGrid(); g.box(-2, 0, -2, 1, 1, 1, C.basaltLL); g.box(-1, 1, -1, 0, 1, 0, C.lavaD); g.set(-1, 2, -1, C.lava, true); return g; };
const lavaBatBody = () => { const g = new VoxGrid(); g.box(-1, 0, -2, 0, 1, 1, 0x3a1a1a); g.box(-1, 1, 2, 0, 2, 2, 0x3a1a1a); g.set(-1, 2, 3, C.lavaY, true).set(0, 2, 3, C.lavaY, true); return g; };
const lavaBatWing = () => { const g = new VoxGrid(); for (let x = 0; x <= 6; x++) { const w = x < 3 ? 2 : x < 5 ? 1 : 0; for (let z = -w; z <= w; z++) g.set(x, 0, z - 1, x % 3 === 2 ? C.lavaD : 0x4a1e1a); } return g; };

// --------------------------------------------------------------------------- painted backdrops

function paintRange(ctx, w, h) {
  if (ctx._hd) {
    // painted: dark volcanic range lit from below, glowing lava rivers, an erupting cone with a smoke column
    const tops = hdRange(ctx, w, h, { base: 0.5, amp: h * 0.28, freq: 0.013, seed: 4, ridged: true, lit: 0x4a2224, mid: 0x2a1418, dark: 0x1e0e12, rim: 0x7a3024, gullies: false, haze: [0xc83a14, 0.6, 0.55] });
    const R = mulberry32(7);
    ctx.lineCap = 'round';
    for (let k = 0; k < 14; k++) {
      let x = R() * w, y = tops[Math.floor(x)] + 1;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (R() - 0.5) * 4; y += 5; ctx.lineTo(x, y); }
      ctx.strokeStyle = rgba(0xff6a1f, 0.9); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.strokeStyle = rgba(0xffc04a, 0.9); ctx.lineWidth = 0.5; ctx.stroke();
    }
    const cx = w * 0.3, top = h * 0.12 + 4;
    hdCloud(ctx, Array.from({ length: 7 }, (_, k) => [cx + k * 2.5 + (R() - 0.5) * 3, top - 3 - k * 2.6, 5 + k * 1.4]), top - 1, { light: 0x6a4a4a, color: 0x4a3a3a, shade: 0xa8401c, dark: 0xd8601e, sunX: 1, alpha: 0.9 });
    ctx.beginPath(); ctx.moveTo(cx - 4, top); ctx.lineTo(cx + 4, top); ctx.lineTo(cx + (h - top) * 0.9 + 4, h); ctx.lineTo(cx - (h - top) * 0.9 - 4, h); ctx.closePath();
    const cg = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0);
    cg.addColorStop(0, rgba(0x3a1a1a)); cg.addColorStop(0.5, rgba(0x321618)); cg.addColorStop(1, rgba(0x241012));
    ctx.fillStyle = cg; ctx.fill();
    hdGlow(ctx, cx, top, 9, 4, 0xffc04a, 0.95, 1.2);
    for (let k = 0; k < 4; k++) { const x0 = cx + (R() - 0.5) * 6; ctx.strokeStyle = rgba(0xff7a22, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, top); ctx.quadraticCurveTo(x0 + (R() - 0.5) * 10, top + 12, x0 + (R() - 0.5) * 24, top + 26); ctx.stroke(); }
    const lg = ctx.createLinearGradient(0, h * 0.84, 0, h);
    lg.addColorStop(0, rgba(0xc83a14, 0)); lg.addColorStop(0.3, rgba(0xc83a14)); lg.addColorStop(1, rgba(0xff8a2a));
    ctx.fillStyle = lg; ctx.fillRect(0, h * 0.84, w, h * 0.16);
    return;
  }
  const P = pixels(ctx, w, h);
  const t1 = ridge(P, { base: h * 0.5, amp: h * 0.28, freq: 0.013, seed: 4, peaks: 1.4, color: 0x2a1418, rim: 0x5a2420 });
  // glowing lava streaks down the slopes + a distant erupting cone
  const R = mulberry32(7);
  for (let k = 0; k < 14; k++) {
    let x = R() * w | 0, y = t1[x] + 1;
    for (let s = 0; s < 30 && y < h; s++) { P.set(x, y, s < 8 ? 0xffb84a : 0xff6a1f); if (R() < 0.3) x += R() < 0.5 ? -1 : 1; y++; }
  }
  const cx = Math.round(w * 0.3);
  for (let y = 0; y < h; y++) { const hw = Math.round((y - h * 0.12) * 0.9); if (hw < 3) continue; for (let x = cx - hw; x <= cx + hw; x++) if (y > h * 0.12 + 4) P.set(x, y, x < cx ? 0x3a1a1a : 0x2a1214); }
  for (let k = 0; k < 40; k++) { const a = -Math.PI / 2 + (R() - 0.5) * 1.2, r = R() * 14; P.set(cx + Math.cos(a) * r, h * 0.12 + 4 + Math.sin(a) * r, R() < 0.5 ? 0xffe07a : 0xff6a1f); }
  // smoke column
  for (let y = 0; y < h * 0.16; y++) for (let x = cx - 10; x <= cx + 10 + y * 0.3; x++) if (bayer(x, y) < 0.6 * (1 - Math.abs(x - cx - y * 0.15) / 12)) P.set(x, y, 0x4a3a3a, 0.8);
  // lava lake glow at the base
  for (let y = Math.round(h * 0.86); y < h; y++) for (let x = 0; x < w; x++) P.set(x, y, bayer(x, y) < 0.3 ? 0xff8a2a : 0xc83a14);
  P.flush();
}
function paintBasaltCliffs(ctx, w, h) {
  if (ctx._hd) {
    // painted basalt columns: hexagonal-ish prisms with lit faces and glowing lava falls
    const R = mulberry32(19);
    const base = h * 0.9;
    let x = 0;
    while (x < w) {
      const cw = 3 + R() * 3, ch = 10 + R() * h * 0.6, top = base - ch;
      const g = ctx.createLinearGradient(x, 0, x + cw, 0);
      g.addColorStop(0, rgba(0x1a1418)); g.addColorStop(0.25, rgba(0x3a2c32)); g.addColorStop(0.7, rgba(0x2a2228)); g.addColorStop(1, rgba(0x1e181e));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x, top + 1); ctx.lineTo(x + cw * 0.5, top); ctx.lineTo(x + cw, top + 1); ctx.lineTo(x + cw, base); ctx.lineTo(x, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(0x5a4048); ctx.fillRect(x + 0.3, top + 0.4, cw - 0.6, 0.7);
      x += cw;
    }
    for (let k = 0; k < 4; k++) {
      const fx = R() * w, top = base - 30 - R() * 20;
      const fg = ctx.createLinearGradient(0, top, 0, base);
      fg.addColorStop(0, rgba(0xffe07a)); fg.addColorStop(1, rgba(0xff6a1f));
      ctx.fillStyle = fg; ctx.fillRect(fx, top, 2, base - top);
      hdGlow(ctx, fx + 1, base, 6, 2.5, 0xffa040, 0.8, 1.2);
    }
    const lg = ctx.createLinearGradient(0, base, 0, h);
    lg.addColorStop(0, rgba(0xff6a1f)); lg.addColorStop(1, rgba(0xa82a10));
    ctx.fillStyle = lg; ctx.fillRect(0, base, w, h - base);
    return;
  }
  const P = pixels(ctx, w, h);
  const R = mulberry32(19);
  let x = 0;
  const base = Math.round(h * 0.9);
  while (x < w) {
    const cw = 3 + (R() * 3 | 0), ch = 10 + (R() * h * 0.6 | 0);
    for (let xx = x; xx < x + cw; xx++) for (let y = base - ch; y < base; y++) P.set(xx, y, xx === x ? 0x1a1418 : y === base - ch ? 0x4a3a40 : (y % 9 === 0 ? 0x1e181e : 0x2a2228));
    x += cw;
  }
  for (let k = 0; k < 4; k++) { const fx = R() * w | 0, top = base - 30 - (R() * 20 | 0); for (let y = top; y < base; y++) for (let dx = 0; dx < 2; dx++) P.set(fx + dx, y, (y + dx) % 4 === 0 ? 0xffe07a : 0xff7a22); }
  for (let y = base; y < h; y++) for (let xx = 0; xx < w; xx++) P.set(xx, y, bayer(xx, y) < 0.4 ? 0xff6a1f : 0xa82a10);
  P.flush();
}

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  const sky = skyTexture('volcano', [[0, 0x12060a], [0.2, 0x2a0c10], [0.38, 0x5a1410], [0.56, 0x9a2a14], [0.72, 0xd8501a], [0.86, 0xff8a3a], [1, 0xffb05a]], (ctx, w, h) => {
    const R = mulberry32(3);
    if (ctx._hd) {
      // ash clouds lit from below by the lava glow
      hdGlow(ctx, w * 0.5, h, w * 0.7, h * 0.35, 0xff7a2a, 0.35, 1.3);
      for (let k = 0; k < 6; k++) {
        const cy = 8 + R() * h * 0.36, cx = R() * w, n = 4 + (R() * 4 | 0), discs = [];
        for (let i = 0; i < n; i++) { const r = 4 + R() * 7; discs.push([cx + (i - n / 2) * r * 0.9, cy + R() * 4, r]); }
        hdCloud(ctx, discs, cy + 7, { light: 0x5a2a24, color: 0x3a1a18, shade: 0x9a3418, dark: 0xd85a1e, sunX: 1, shadeAt: 0.5 });
      }
      for (let i = 0; i < 70; i++) { const x = R() * w, y = R() * h * 0.8; hdGlow(ctx, x, y, 0.9, 0.9, R() < 0.5 ? 0xffb84a : 0xff6a1f, 0.9, 1); }
      return;
    }
    // ash clouds
    for (let k = 0; k < 6; k++) {
      const cy = 8 + R() * h * 0.36, cx = R() * w, n = 4 + (R() * 4 | 0);
      for (let i = 0; i < n; i++) { const r = 4 + R() * 7; disc(ctx, cx + (i - n / 2) * r * 0.9, cy + R() * 4 + 2, Math.round(r), 0x1e0e10); disc(ctx, cx + (i - n / 2) * r * 0.9, cy + R() * 4, Math.round(r - 1), 0x3a1a18); px(ctx, cx + (i - n / 2) * r * 0.9 - r * 0.6, cy + r * 0.6, r * 1.2, 1, 0xa83a1a, 0.6); }
    }
    for (let i = 0; i < 70; i++) px(ctx, R() * w | 0, R() * h * 0.8 | 0, 1, 1, R() < 0.5 ? 0xffb84a : 0xff6a1f, 0.7 + R() * 0.3);
  });
  fitSky(K, sky);
  K.parallax('range', { z: -166, y: -4, w: parallaxWidth(-166), h: 44, tw: 400, th: 112, paint: paintRange, fogTint: [0x5a1a14, 0.16] });
  K.parallax('basalt', { z: -112, y: -2, w: parallaxWidth(-112), h: 14, tw: 340, th: 56, paint: paintBasaltCliffs, fogTint: [0x4a1410, 0.1] });

  // ---- ground: basalt with glowing cracks; the lava river in front
  const basaltCol = (x, z, fine) => {
    const cr = vnoise(x * (fine ? 0.5 : 0.25), 7, z * (fine ? 0.5 : 0.25));
    if (cr > 0.49 && cr < 0.51) return fine ? C.lava : C.lavaD;
    if (cr > 0.47 && cr < 0.53) return C.crust;
    const n = vnoise(x * 0.1, 3, z * 0.1), m = hash3(Math.floor(x * 2), 5, Math.floor(z * 2));
    if (m < 0.02) return C.obsL;
    return n > 0.64 ? C.basaltL : n < 0.32 ? C.basaltD : m < 0.5 ? C.basalt : 0x34303a;
  };
  K.ground({ id: 'groundFar', x0: -120, x1: 120, z0: -48, z1: -14, scale: 1, color: (x, z) => basaltCol(x, z, false) });
  K.ground({
    id: 'groundNear', x0: -64, x1: 64, z0: -14, z1: 32, scale: 0.5,
    skip: (x, z) => Math.abs(z + 0.25 - RIVER(x + 0.25)) < 3.0,
    color: (x, z) => {
      if (Math.abs(z) < LH + 0.3) return C.basaltD;
      const d = Math.abs(z + 0.25 - RIVER(x + 0.25));
      if (d < 3.7) return d < 3.3 ? C.crust : C.crustD; // hot banks
      return basaltCol(x, z, true);
    },
  });
  K.ground({ id: 'groundFront', x0: -100, x1: 100, z0: 32, z1: 84, scale: 1, color: (x, z) => basaltCol(x, z, false) });
  const tLava = lavaTex('vf_lava');
  scrollPlane(K, { tex: tLava, w: 150, d: 7.4, y: -0.3, z: 6.6, tile: 2.5, sx: 0.035, sy: 0, wob: 0.03, boost: 1.25, grad: () => 0xffffff, name: 'lavaRiver', segs: 1 });

  // ---- lane: riveted iron causeway with hot seams + glowing edge lights
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.ironD,
    color: (ix, iz) => {
      if (iz === -10 || iz === 9) return C.ironD;
      const gx = ((ix % 8) + 8) % 8, gz = ((iz + 10) % 5 + 5) % 5;
      if (gx === 0) return C.rust;
      if (gx === 1 && (gz === 1 || gz === 3)) return C.rivet;
      if (gz === 0) return C.ironD;
      return hash3(ix >> 3, iz >> 2, 3) < 0.2 ? C.ironL : hash3(ix, iz, 1) < 0.05 ? C.rust : C.iron;
    },
  });
  K.mesh('laneLights', () => { const g = new VoxGrid(); for (let x = -96; x < 96; x += 6) { g.set(x, 0, -10, C.hot); g.set(x, 0, 9, C.hot); } return g; }, { scale: 0.25, pivot: [0, 0, 0] }, 0, 0.002, 0);
  K.mesh('pantherSeal', () => {
    const g = new VoxGrid();
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) { const r = Math.hypot(x, z); if (r > 5.4) continue; g.set(x, 0, z, r > 4.4 ? C.goldD : r < 1.6 ? C.lavaY : (Math.atan2(z, x) * 4 / Math.PI + 8) % 2 < 1 ? C.lava : C.iron, r < 1.6); }
    return g;
  }, { scale: 0.11, pivot: [0, 0, 0] }, 0.06, 0.003, 1.2);

  // ---- breakables behind the lane
  const brk = [[-19, 'crate'], [-9.6, 'barrel'], [-3.3, 'cart'], [4.4, 'crate'], [10.2, 'obsidian'], [18.6, 'barrel']];
  for (const [x, kind] of brk) {
    if (kind === 'crate') K.breakable('crate', 'oreCrate', crateGrid, { scale: 0.11 }, x, -3.3, K.rand(-0.3, 0.3));
    else if (kind === 'barrel') K.breakable('barrel', 'oilBarrel', barrelGrid, { scale: 0.11 }, x, -3.3, K.rand(0, 6));
    else if (kind === 'cart') K.breakable('cart', 'oreCartB', oreCartGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.2, 0.2));
    else K.breakable('rock', 'obsidianB', obsidianGrid(5), { scale: 0.09 }, x, -3.3, K.rand(0, 6));
  }

  // ---- the forge: hammer + anvil + sparks, furnace + bellows, crucible pouring, gold racks
  K.mesh('anvil', anvilGrid, { scale: 0.11, ao: true }, -2.4, 0, -7.4, 0, 1, { shadow: true });
  K.mesh('hammerFrame', hammerFrameGrid, { scale: 0.11 }, -6.6, 0, -7.4, 0, 1, { shadow: true });
  const hammer = K.mesh('hammer', hammerGrid, { scale: 0.11, pivot: [0, 0, 0] }, -6.6, 3.4, -7.4, 0, 1, { shadow: true });
  const swing = (q) => (q < 0.75 ? -0.28 + (q / 0.75) * 0.58 : 0.3 - ((q - 0.75) / 0.25) ** 2 * 0.58); // slow lift, fast slam
  const sparks = liveInst(K, 'spark', () => { const g = new VoxGrid(); g.set(0, 0, 0, C.lavaY, true); return g; }, { scale: 0.08 }, 24);
  const sp = Array.from({ length: 24 }, () => ({ a: K.rand(0, 6.28), v: K.rand(1.5, 3.5), up: K.rand(1.5, 3.2) }));
  K.onUpdate((dt, t) => {
    const q = (t * 0.55) % 1;
    hammer.rotation.z = swing(q);
    sp.forEach((s, i) => {
      const k = q / 0.4; // the strike happens at q = 0
      if (k > 1) { setInst(sparks, i, 0, -9, 0, 0, 0, 0, 0.0001); return; }
      const tt = k * 0.7;
      setInst(sparks, i, -2.4 + Math.cos(s.a) * s.v * tt, 1.6 + s.up * tt - 4.5 * tt * tt, -7.4 + Math.sin(s.a) * s.v * tt * 0.6, 0, 0, 0, 1 - k);
    });
    sparks.instanceMatrix.needsUpdate = true;
  });
  K.mesh('furnace', furnaceGrid, { scale: 0.13, ao: true }, -16.6, 0, -9.6, 0.25, 1, { shadow: true });
  addFlames(K, 'vff', [[-16.6 + Math.sin(0.25) * 1.05, 0.1, -9.6 + Math.cos(0.25) * 1.05, 1.2]], 0.1);
  const bellows = K.mesh('bellows', bellowsGrid, { scale: 0.11, ao: true }, -19.8, 0, -7.4, 0.3, 1, { shadow: true });
  K.onUpdate((dt, t) => { bellows.scale.y = 0.75 + Math.abs(Math.sin(t * 1.6)) * 0.35; });
  K.mesh('gantry', gantryGrid, { scale: 0.12 }, 6.6, 0, -9.4, 0, 1, { shadow: true });
  const cru = K.mesh('crucible', crucibleGrid, { scale: 0.12, pivot: [0, 0, 0] }, 6.6, 2.6, -9.4, 0, 1, { shadow: true });
  K.mesh('mould', mouldGrid, { scale: 0.12, ao: true }, 7.6, 0, -9.2, 0, 1, { shadow: true });
  const tPour = fallsTex('vf_pour', [0xffb84a, 0xffe07a, 0xff8a2a, 0xffffff]);
  const pour = fallSheet(K, { tex: tPour, x: 7.1, y: 0.3, z: -9.1, w: 0.18, h: 1.9, speed: 2.4, tile: 0.4, boost: 1.4 });
  K.onUpdate((dt, t) => { const q = (t * 0.2) % 1; const tilt = q < 0.15 ? q / 0.15 : q < 0.6 ? 1 : q < 0.75 ? 1 - (q - 0.6) / 0.15 : 0; cru.rotation.z = -tilt * 0.6; pour.visible = tilt > 0.8; });
  K.inst('goldRack', goldRackGrid, { scale: 0.11, ao: true }, [[12.6, 0, -6.8, -0.2], [1.8, 0, -6.0, 0.1]], { shadow: true });
  K.inst('obsidian', obsidianGrid(1), { scale: 0.13 }, [[-26, 0, -6.6, 0.5], [16.8, 0, -11.6, 2], [26.6, 0, -6.2, 1.2], [-1.6, 0, -12.6, 0.3]], { shadow: true });
  K.inst('obsidianS', obsidianGrid(3), { scale: 0.1 }, [[-13, 0, -5.4, 0.5], [2.4, 0, -5.2, 2], [21.4, 0, -5.4, 1.2], [-23.6, 0, -5.0, 0.3]], { shadow: true });
  K.inst('pipe', pipeGrid, { scale: 0.12 }, [[2, 1.1, -14.6, 0]], { shadow: true });
  K.inst('chain', chainGrid, { scale: 0.1, pivot: [0, 0, 0] }, [[-6.4, 3.7, -6.9], [-6.4, 3.7, -7.9]]);
  addFlames(K, 'vbz', [[-22.4, 0, -5.2], [16, 0, -5.4], [24, 0, -5.0]], 0.1);
  // minecart rail behind the forge, carts rolling back and forth
  K.mesh('rail', railGrid, { scale: 0.25, pivot: [0, 0, 0] }, 0, 0.12, -12.2);
  const carts = liveInst(K, 'oreCart', oreCartGrid, { scale: 0.1 }, 2, { shadow: true });
  K.onUpdate((dt, t) => { for (let i = 0; i < 2; i++) { const x = Math.sin(t * 0.18 + i * 2.6) * 22; setInst(carts, i, x, 0.12, -12.2, 0, 0, Math.sin(t * 9 + i) * 0.01); } carts.instanceMatrix.needsUpdate = true; });

  // ---- landmarks: the volcano lair, basalt columns, the lavafall cliff
  const VZ = -50, VS = 0.34;
  K.mesh('volcano', volcanoGrid(1), { scale: VS, pivot: [0, 0, 0] }, 4, 0, VZ, 0, 1, { shadow: true });
  K.inst('basaltCols', basaltColsGrid(2), { scale: 0.22 }, [[-20, 0, -19, 0.3], [23, 0, -18, 1.4], [-34, 0, -24, 2.2], [36, 0, -26, 0.8]], { shadow: true });
  K.mesh('cliff', cliffGrid, { scale: 0.24, pivot: [0, 0, 1] }, -27, 0, -29, 0.4, 1, { shadow: true });
  const fx = -27 + Math.sin(0.4) * 0.15, fz = -29 + Math.cos(0.4) * 0.15;
  const tFall = fallsTex('vf_fall', [0xff7a22, 0xffb040, 0xe8501a, 0xffe07a]);
  fallSheet(K, { tex: tFall, x: fx, y: 0, z: fz, w: 2.0, h: 12.6, ry: 0.4, speed: 0.6, tile: 1.6, boost: 1.25 });
  scrollPlane(K, { tex: tLava, w: 7, d: 4, x: fx + 0.8, y: 0.06, z: fz + 2.4, tile: 2, sx: 0.02, sy: 0.02, boost: 1.25, grad: () => 0xffffff, name: 'lavaPool', segs: 1 });
  // eruption: lava fountain bombs + smoke puffs from the crater
  const craterY = VH * Math.pow(1 - 14 / 70, 1.25) * VS, CX = 4, CZ = VZ;
  const bombs = liveInst(K, 'bomb', () => { const g = new VoxGrid(); g.box(-1, -1, -1, 0, 0, 0, C.lava); g.set(0, 0, 0, C.lavaY, true); return g; }, { scale: 0.2 }, 14);
  const bb = Array.from({ length: 14 }, () => ({ a: K.rand(0, 6.28), v: K.rand(2, 6), up: K.rand(8, 15), ph: K.rand(0, 1) }));
  K.onUpdate((dt, t) => {
    bb.forEach((b, i) => {
      const k = (t * 0.25 + b.ph) % 1, tt = k * 3.2;
      const y = craterY + b.up * tt - 4.9 * tt * tt;
      setInst(bombs, i, CX + Math.cos(b.a) * b.v * tt, y, CZ + Math.sin(b.a) * b.v * tt * 0.5, t * 3 + i, t * 2, 0, y < craterY - 6 ? 0.0001 : 1);
    });
    bombs.instanceMatrix.needsUpdate = true;
  });
  const smoke = new Billboards(10, { name: 'smoke' });
  K.add(smoke.mesh);
  for (let i = 0; i < 10; i++) smoke.setTint(i, i % 3 ? 0x5a4448 : 0x3a2a2e);
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 10; i++) { const k = (t * 0.05 + i / 10) % 1, w = 7 + k * 20; smoke.set(i, CX + k * k * 18, craterY + 2 + k * 30, CZ + 2, w, w * 0.6, i % 4, k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.5) / 0.5), i & 1); }
    smoke.commit();
  });

  // ---- life: embers, ash, lava bats, lava bubbles + crust in the river
  addParticles(K, 50, [-36, 36, 0, 14, -24, 8], { color: [C.lavaL, C.lava], glow: 1.45, size: [0.04, 0.07], vy: 0.9, drift: 0.7, fadeTop: true });
  addParticles(K, 10, [-30, 30, 0, 10, -18, 6], { color: C.lavaY, glow: 1.9, size: [0.03, 0.05], vy: 1.1, drift: 0.7, fadeTop: true, seed: 8 });
  addParticles(K, 40, [-40, 40, 1, 16, -30, 10], { color: [0x5a5260, 0x3a3440], size: [0.04, 0.08], vy: -0.25, drift: 0.6, wind: 0.3, seed: 31 });
  addFlyers(K, 'lavaBat', lavaBatBody, lavaBatWing, { scale: 0.11 }, [...orbitList(K, 4, [-8, 11, -22], { r0: 6, r1: 12, spread: 6, dy: 3, f0: 11, f1: 15 }), ...orbitList(K, 3, [14, 15, -32], { r0: 6, r1: 10, spread: 4, dy: 3, f0: 11, f1: 15 })], { flap: 0.85 });
  const bubbles = liveInst(K, 'lavaBubble', () => { const g = new VoxGrid(); g.box(-1, 0, -1, 1, 1, 1, C.lavaL); g.set(0, 2, 0, C.lavaY, true); return g; }, { scale: 0.1 }, 12);
  const bub = Array.from({ length: 12 }, () => ({ x: K.rand(-34, 34), ph: K.rand(0, 1), sp: K.rand(0.3, 0.6) }));
  K.onUpdate((dt, t) => {
    bub.forEach((b, i) => { const k = (t * b.sp + b.ph) % 1; setInst(bubbles, i, b.x, -0.38 + k * 0.15, RIVER(b.x) + Math.sin(b.ph * 9) * 2.4, 0, 0, 0, k < 0.85 ? 0.4 + k : 0.0001); });
    bubbles.instanceMatrix.needsUpdate = true;
  });
  const crusts = Array.from({ length: 20 }, () => [K.rand(-60, 60), K.rand(-2.4, 2.4), K.rand(0, 6), K.rand(0.8, 1.8)]);
  const crustIm = liveInst(K, 'crust', crustGrid, { scale: 0.12 }, crusts.length);
  K.onUpdate((dt, t) => {
    crusts.forEach(([x, dz, r, s], i) => { const xx = ((x + t * 0.8 + 60) % 120) - 60; setInst(crustIm, i, xx, -0.28, RIVER(xx) + dz, r + t * 0.05, 0, 0, s); });
    crustIm.instanceMatrix.needsUpdate = true;
  });

  // ---- LOW foreground: obsidian shards, basalt pebbles, steaming vents
  const pebbles = [], shards = [], vents = [];
  for (let i = 0; i < 60; i++) { const x = K.rand(-46, 46), z = K.rand(LH + 0.6, 32); if (Math.abs(z - RIVER(x)) > 4) pebbles.push([x, 0, z, K.rand(0, 6), K.rand(0.8, 1.6)]); }
  for (let i = 0; i < 26; i++) { const x = K.rand(-44, 44), z = K.rand(LH + 0.8, 30); if (Math.abs(z - RIVER(x)) > 4.2) shards.push([x, 0, z, K.rand(0, 6), K.rand(0.8, 1.3)]); }
  for (let i = 0; i < 9; i++) { const x = K.rand(-36, 36), z = K.rand(12, 26); if (Math.abs(z - RIVER(x)) > 4.4) vents.push([x, 0, z, 0, K.rand(1, 1.4)]); }
  K.inst('pebble', pebbleGrid, { scale: 0.1 }, pebbles);
  K.inst('shard', shardGrid, { scale: 0.1 }, shards);
  K.inst('vent', ventGrid, { scale: 0.12 }, vents);
  vents.forEach(([x, , z], i) => addParticles(K, 6, [x - 0.2, x + 0.2, 0.2, 1.8, z - 0.2, z + 0.2], { color: 0x8a7a80, size: [0.06, 0.12], vy: 0.6, drift: 0.2, fadeTop: true, seed: 50 + i }));

  return {
    sky,
    fog: { color: 0x6a2418, near: 66, far: 210 },
    lights: { sky: 0xffb890, ground: 0x6a3020, hemi: 1.25, sun: 2.3, sunColor: 0xffc090, dir: [6, 12, 10], rim: 1.6, rimColor: 0xff6a2a },
    dust: 0x4a4250,
    bloom: { strength: 0.85, threshold: 1.7, radius: 0.3 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  zoneDisc(K, 'zoneVolcano', {
    r: 22, seed: 5,
    colorTop: (x, z, r, R) => {
      const ring = Math.abs(r - 15) < 1.3 && z > -6;
      if (ring) return hash3(x, 1, z) < 0.4 ? C.lavaL : C.lava;
      if (r > R - 1.2) return C.crust;
      const cr = vnoise(x * 0.4, 7, z * 0.4);
      if (cr > 0.48 && cr < 0.52) return C.lavaD;
      return hash3(x, 2, z) < 0.3 ? C.basaltL : C.basalt;
    },
    colorSide: (x, y) => (y > -2 ? C.basaltD : (x + y) & 1 ? C.basalt : C.crust),
  });
  K.mesh('volcano', volcanoGrid(0.5), { scale: 0.15, pivot: [0, 0, 0] }, 0.4, 0, -3.6, 0, 1, { shadow: true });
  const cy = Math.round(VH * 0.5) * Math.pow(1 - 7 / 35, 1.25) * 0.15;
  const bombs = liveInst(K, 'bomb', () => { const g = new VoxGrid(); g.box(-1, -1, -1, 0, 0, 0, C.lavaL, true); return g; }, { scale: 0.12 }, 8);
  const bb = Array.from({ length: 8 }, () => ({ a: K.rand(0, 6.28), v: K.rand(0.6, 1.6), up: K.rand(2.5, 4.5), ph: K.rand(0, 1) }));
  K.onUpdate((dt, t) => {
    bb.forEach((b, i) => { const k = (t * 0.3 + b.ph) % 1, tt = k * 1.6; const y = cy + b.up * tt - 4.9 * tt * tt; setInst(bombs, i, 0.4 + Math.cos(b.a) * b.v * tt, y, -3.6 + Math.sin(b.a) * b.v * tt * 0.6, t * 3, t * 2, 0, y < cy - 1 ? 0.0001 : 1); });
    bombs.instanceMatrix.needsUpdate = true;
  });
  K.mesh('anvil', anvilGrid, { scale: 0.05 }, 1.55, 0, 2.2, 0, 1, { shadow: true });
  K.mesh('hammerFrame', hammerFrameGrid, { scale: 0.05 }, -0.4, 0, 2.2, 0, 1, { shadow: true });
  const hammer = K.mesh('hammer', hammerGrid, { scale: 0.05, pivot: [0, 0, 0] }, -0.4, 1.55, 2.2, 0, 1, { shadow: true });
  K.onUpdate((dt, t) => { const q = (t * 0.55) % 1; hammer.rotation.z = q < 0.75 ? -0.28 + (q / 0.75) * 0.58 : 0.3 - ((q - 0.75) / 0.25) ** 2 * 0.58; });
  K.mesh('furnace', furnaceGrid, { scale: 0.06 }, -3.6, 0, 1.6, 0.6, 1, { shadow: true });
  addFlames(K, 'vzf', [[-3.6 + Math.sin(0.6) * 0.5, 0.05, 1.6 + Math.cos(0.6) * 0.5, 0.5]], 0.07);
  K.inst('basaltCols', basaltColsGrid(2), { scale: 0.07 }, [[-4.6, 0, -1.6, 0.3], [4.8, 0, 0.2, 1.4]], { shadow: true });
  K.inst('obsidian', obsidianGrid(1), { scale: 0.06 }, [[3.6, 0, 3.8, 0.5], [-1.4, 0, 4.6, 2], [-5.2, 0, 3.0, 1.2]], { shadow: true });
  K.inst('goldRack', goldRackGrid, { scale: 0.05 }, [[3.4, 0, 1.8, -0.4]], { shadow: true });
  K.inst('oreCart', oreCartGrid, { scale: 0.05 }, [[-1.8, 0, 3.2, 0.6]], { shadow: true });
  addParticles(K, 26, [-5, 5, 0.2, 6, -5, 5], { color: [C.lavaL, C.lava], glow: 1.95, size: [0.03, 0.06], vy: 0.7, drift: 0.4, fadeTop: true });
  const smoke = new Billboards(5, { name: 'smoke' });
  K.add(smoke.mesh);
  for (let i = 0; i < 5; i++) smoke.setTint(i, i % 2 ? 0x6a5458 : 0x4a3a3e);
  K.onUpdate((dt, t) => { for (let i = 0; i < 5; i++) { const k = (t * 0.08 + i / 5) % 1, w = 1.6 + k * 4; smoke.set(i, 0.4 + k * 2, cy + 0.6 + k * 6, -3.6, w, w * 0.6, i % 4, k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.5) / 0.5), i & 1); } smoke.commit(); });
  anchor(K, 'boss', -2.4, 0, 4.6);
  anchor(K, 'npc', 2.6, 0, 4.8);
  anchor(K, 'enterLair', 0.4, 0.6, -1.4);
  K.root.scale.setScalar(ZONE_SCALE); // fill the plinth
  return { focus: [0, 1.4, 0], radius: 7 };
}
