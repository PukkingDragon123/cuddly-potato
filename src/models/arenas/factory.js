// Arena 3: CHOCOLATE FACTORY — "I Built Willy Wonka's Chocolate Factory!" x
// Feastables. A mint-sugar candy meadow with a chocolate-bar lane, a glossy
// flowing chocolate river (with a paddle boat) and a chocolate waterfall,
// swirly lollipop trees, gumdrop bushes, candy-cane pipes, giant Feastables
// bars, a golden-ticket sign and a brick factory puffing pink smoke, under a
// pink/purple candy sky with frosted candy mountains and a factory skyline.
import {
  THREE, VoxGrid, FIELD, shade, mixHex, hash3, vnoise, mulberry32, text, textW, glowMat, canvasTex,
  paintGradient, paintClouds, paintRidge, paintSkyline, paintStars, paintSun, px, disc, skyTexture, parallaxWidth,
  pixbuf, skyGlow, paintSunPx, paintCumulus, paintCloudBank, paintStreaks, paintBirdsPx, paintRange, paintStarfield, fitSkyAuto,
  setInstance, liveInstances, swayInst, blinkInst, addPuffs, addSparkles, addClouds, addBirds, voxRange, addFall, addFlag,
  leafyTreeGrid, bushGrid, tuftGrid,
} from './kit.js';

const LH = FIELD.LANE_HALF;
const RIVER = { z0: -11.2, z1: -4.2, y: -0.16 };

const C = {
  mint: 0x7fdca6, mintD: 0x5cc48e, mintL: 0xa8f0c8,
  milk: 0xa8704a, milkL: 0xc48a5c, milkD: 0x7a4628, dark: 0x5a3220, darkD: 0x3a1d10, white: 0xf6ead8,
  pink: 0xff4fa3, pinkL: 0xff9ad0, pinkD: 0xc2185b, purple: 0xa070d0, purpleD: 0x6a3a8a,
  red: 0xe8343c, cream: 0xfff4f8, gold: 0xffc21a, goldL: 0xffe680, goldD: 0xc8901a, goldDD: 0x8a5c10,
  blue: 0x1d9bf0, yellow: 0xffd23f, brick: 0xa8503a, brickD: 0x7a3426, mortar: 0xd8a890, ink: 0x2a1520,
  metal: 0xb8c0cc, metalD: 0x6b7386,
};
const CANDY = [0xff4fa3, 0xffd23f, 0x29b6f6, 0x7cff8a, 0xb05cff, 0xff8a2a, 0xe8343c, 0xffffff];
const BARS = [[0x1d9bf0, 0x0f6fb8], [0xff4fa3, 0xc2185b], [0xffd23f, 0xd09a10]];

function anchor(K, name, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  K.root.add(o);
  K.hotspots[name] = o;
  return o;
}

/** Repeating pixel texture (both axes wrap). */
function tileTex(id, w, h, paint) {
  const t = canvasTex(id, w, h, paint, { repeatX: true });
  t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// --------------------------------------------------------------------------- voxel props

/** Giant Feastables bar standing on its long edge: coloured wrapper, crimped ends, white label. */
const feastBarGrid = (vi, open = false) => () => {
  const g = new VoxGrid();
  const [col, colD] = BARS[vi % 3];
  const W = 52, H = 20, D = 6;
  const x0 = -W / 2;
  g.box(x0, 0, -D / 2, x0 + W - 1, H - 1, D / 2 - 1, (x, y, z) => {
    const ex = x - x0;
    if (ex < 3 || ex > W - 4) return (y + ex) % 2 ? shade(col, 0.2) : colD; // crimped ends
    if (y === 0 || y === H - 1) return colD;
    return col;
  });
  // white label + wordmark
  g.box(-22, 2, D / 2, 21, 12, D / 2, C.cream);
  text(g, 'FEASTABLES', 0, 5, D / 2 + 1, '+z', col, { center: true });
  g.box(-20, 3, D / 2 + 1, -14, 3, D / 2 + 1, colD).box(13, 3, D / 2 + 1, 19, 3, D / 2 + 1, colD);
  text(g, 'MR BEAST', 0, 14, D / 2, '+z', C.cream, { center: true });
  if (open) {
    // torn open end showing chocolate segments
    g.box(x0, 0, -D / 2, x0 + 9, H - 1, D / 2 - 1, null);
    for (let x = x0 + 2; x < x0 + 10; x++) for (let y = 1; y < H - 1; y++) g.set(x, y, -1, ((x - x0) % 4 === 0 || y % 5 === 0) ? C.dark : C.milk).set(x, y, 0, C.milk);
    for (let y = 0; y < H; y++) g.set(x0 + 10, y, D / 2, y % 3 ? col : C.cream).set(x0 + 10, y, D / 2 + 1, y % 2 ? col : null);
  }
  return g;
};

/** Lollipop: stick only (the swirl disc is a separate spinning mesh). */
const stickGrid = (h) => () => new VoxGrid().box(-1, 0, -1, 0, h, 0, (x, y) => (y % 9 === 0 ? 0xe8dcc8 : 0xf8f2e8));
const SWIRLS = [[0xff4fa3, 0xffffff], [0xe8343c, 0xffd23f], [0x29b6f6, 0xffffff], [0xb05cff, 0x7cff8a], [0xff8a2a, 0xffe680]];
const swirlGrid = (vi) => () => {
  const g = new VoxGrid();
  const [a, b] = SWIRLS[vi % SWIRLS.length];
  const R = 8;
  for (let x = -R - 1; x <= R; x++) for (let y = -R - 1; y <= R; y++) {
    const r = Math.hypot(x + 0.5, y + 0.5);
    if (r > R + 0.3) continue;
    const ang = Math.atan2(y + 0.5, x + 0.5);
    const k = ((ang / (Math.PI * 2)) * 2 + r * 0.22) % 1;
    const c = r > R - 0.7 ? shade(a, -0.15) : (k + 1) % 1 < 0.5 ? a : b;
    g.set(x, y, -1, c).set(x, y, 0, c);
    if (r < R - 1.5) g.set(x, y, 1, c);
  }
  return g;
};

/** Gumdrop bush: a cluster of sugared gumdrops. */
const gumdropGrid = (seed) => () => {
  const g = new VoxGrid();
  const R = mulberry32(seed);
  const n = 4 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const cx = Math.round((R() - 0.5) * 12), cz = Math.round((R() - 0.5) * 8), r = 3 + Math.floor(R() * 3);
    const col = CANDY[Math.floor(R() * 7)];
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) for (let y = 0; y <= r * 1.3; y++) {
      const d = (x * x + z * z) / (r * r) + (y / (r * 1.35)) ** 2;
      if (d > 1) continue;
      const sug = hash3(cx + x, y, cz + z) < 0.12;
      g.set(cx + x, y, cz + z, sug ? 0xffffff : y > r * 0.9 ? shade(col, 0.2) : col);
    }
  }
  return g;
};

/** Candy-cane pipe along a polyline of voxel points, round section, diagonal stripes. */
const pipeGrid = (pts, r = 2.6, cols = [0xe8343c, 0xfaf2ee]) => () => {
  const g = new VoxGrid();
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay, bz - az);
    for (let k = 0; k <= L; k += 0.5, s += 0.5) {
      const t = k / L, px0 = ax + (bx - ax) * t, py0 = ay + (by - ay) * t, pz0 = az + (bz - az) * t;
      for (let x = Math.floor(px0 - r); x <= Math.ceil(px0 + r); x++) for (let y = Math.floor(py0 - r); y <= Math.ceil(py0 + r); y++) for (let z = Math.floor(pz0 - r); z <= Math.ceil(pz0 + r); z++) {
        if ((x + 0.5 - px0) ** 2 + (y + 0.5 - py0) ** 2 + (z + 0.5 - pz0) ** 2 > r * r) continue;
        g.set(x, y, z, Math.floor((x + y + z) / 3) & 1 ? cols[0] : cols[1]);
      }
    }
  }
  // collar rings at the joints
  for (const [x, y, z] of pts.slice(1, -1)) g.sphere(x, y, z, r + 0.8, C.gold);
  return g;
};

/** Breakables. */
const crateGrid = (vi) => () => {
  // open wooden crate of Feastables bars
  const g = new VoxGrid();
  g.box(-6, 0, -4, 5, 6, 3, (x, y, z) => ((x === -6 || x === 5 || z === -4 || z === 3) ? ((y % 3 === 0) ? 0x8a5a2a : 0xc9874a) : null));
  g.box(-6, 0, -4, 5, 0, 3, 0x8a5a2a);
  for (let i = 0; i < 5; i++) {
    const [c, cd] = BARS[(vi + i) % 3];
    const x = -5 + i * 2;
    g.box(x, 1, -2, x + 1, 8 + (i % 2), 1, c);
    g.box(x, 4, 2, x + 1, 6, 2, C.cream);
    g.set(x, 9 + (i % 2), -2, cd);
  }
  text(g, 'F', -3, 2, 4, '+z', C.pink, {});
  return g;
};
const jarGrid = (vi) => () => {
  // candy jar stuffed with gumdrops + a cupcake on top
  const g = new VoxGrid();
  g.box(-4, 0, -4, 3, 0, 3, 0xd8e8f4);
  for (let y = 1; y <= 9; y++) for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
    const edge = x === -4 || x === 3 || z === -4 || z === 3;
    const c = CANDY[Math.floor(hash3(x >> 1, y >> 1, z + vi) * 7)];
    if (edge) { if ((x + y + z) % 4 === 0) g.set(x, y, z, 0xe8f6ff); else g.set(x, y, z, mixHex(c, 0xffffff, 0.35)); }
    else g.set(x, y, z, c);
  }
  g.box(-3, 10, -3, 2, 11, 2, CANDY[vi % 7]);
  g.box(-2, 12, -2, 1, 12, 1, shade(CANDY[vi % 7], 0.2));
  g.box(-5, 8, -5, 4, 8, 4, 0xffffff);
  return g;
};
const cupcakeGrid = (vi) => () => {
  const g = new VoxGrid();
  const icing = [0xff9ad0, 0xa8f0c8, 0xd8b0ff][vi % 3];
  for (let y = 0; y < 5; y++) for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
    const r = 3.6 + y * 0.25;
    if ((x + 0.5) ** 2 + (z + 0.5) ** 2 > r * r) continue;
    g.set(x, y, z, (x + z) & 1 ? 0xffd23f : 0xffe680);
  }
  for (let y = 5; y < 11; y++) {
    const r = 4.4 - (y - 5) * 0.7;
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) if ((x + 0.5) ** 2 + (z + 0.5) ** 2 <= r * r) g.set(x, y, z, hash3(x, y, z) < 0.1 ? CANDY[Math.floor(hash3(z, x, y) * 7)] : icing);
  }
  g.box(-1, 11, -1, 0, 12, 0, C.red);
  g.set(0, 13, -1, 0x3a8a3a);
  return g;
};

const boatGrid = () => {
  const g = new VoxGrid();
  // pink candy paddle boat (faces +x)
  for (let x = -14; x <= 14; x++) {
    const t = Math.abs(x) / 14;
    const hw = Math.round(5 - t * t * 4);
    for (let z = -hw; z <= hw; z++) for (let y = 0; y < 5; y++) {
      if (y > 0 && Math.abs(z) < hw && Math.abs(x) < 13 && y < 4) continue;
      g.set(x, y, z, y === 4 ? C.gold : y === 0 ? C.pinkD : C.pink);
    }
    g.set(x, 4, 0, C.gold);
  }
  for (let x = -11; x <= 11; x++) for (let z = -3; z <= 3; z++) g.set(x, 1, z, C.cream);
  // swan-ish candy figurehead + lollipop mast with flag
  for (let y = 4; y < 10; y++) g.box(13 + Math.floor((y - 4) / 3), y, -1, 14 + Math.floor((y - 4) / 3), y, 0, C.pinkL);
  g.box(15, 10, -1, 17, 11, 0, C.pinkL).set(18, 10, 0, C.gold);
  g.box(-1, 2, -1, 0, 18, 0, 0xf8f2e8);
  g.box(0, 14, 0, 8, 18, 0, (x, y) => ((x + y) & 1 ? C.yellow : C.pink));
  // paddle wheel housing
  g.box(-10, 1, 5, -5, 7, 6, C.purple).box(-10, 1, -7, -5, 7, -6, C.purple);
  // benches
  for (const x of [-3, 4, 9]) g.box(x, 2, -3, x + 1, 3, 3, C.milkL);
  return g;
};

const factoryGrid = () => {
  const g = new VoxGrid();
  const W = 40, D = 12, H = 18; // voxel scale 0.5 (body 20 x 9 x 6 units)
  // brick body
  g.box(-W, 0, -D, W - 1, H, D - 1, (x, y, z) => {
    if (y === 0) return C.brickD;
    const row = y % 2, col = Math.floor((x + (row ? 1 : 0)) / 2);
    if (z === D - 1 || z === -D || x === -W || x === W - 1) return hash3(col, y, 1) < 0.18 ? shade(C.brick, -0.1) : C.brick;
    return C.brick;
  });
  // pink cornice + sawtooth roof with skylights
  g.box(-W - 1, H + 1, -D - 1, W, H + 1, D, C.pinkL);
  for (let x = -W; x < W; x++) {
    const k = ((x + W) % 8);
    for (let y = 0; y <= k / 2; y++) g.box(x, H + 2 + y, -D, x, H + 2 + y, D - 1, k === 7 ? 0xbfe9ff : y === Math.floor(k / 2) ? C.purpleD : C.purple);
  }
  // arched glowing windows (two storeys)
  for (let x = -W + 4; x < W - 4; x += 7) {
    if (Math.abs(x + 1) < 9) continue;
    for (const y0 of [3, 11]) {
      g.box(x - 1, y0 - 1, D, x + 3, y0 + 5, D, C.cream);
      g.box(x, y0, D, x + 2, y0 + 4, D, (xx, yy) => (yy === y0 + 2 ? 0xb07a40 : 0xc49a5c), true);
      g.box(x + 1, y0, D + 1, x + 1, y0 + 4, D + 1, C.cream);
    }
  }
  // grand gate with golden trim
  g.box(-9, 0, D, 7, 15, D + 1, C.gold);
  g.box(-8, 0, D + 1, 6, 13, D + 1, C.dark);
  g.box(-1, 0, D + 2, 0, 13, D + 2, C.goldD);
  for (const x of [-6, 3]) g.box(x, 6, D + 2, x + 1, 7, D + 2, C.goldL);
  // big round FEASTABLES medallion over the gate
  g.cylinder(-0.5, 22, D, D, 7.5, C.cream, 'z');
  g.cylinder(-0.5, 22, D + 1, D + 1, 6.5, C.blue, 'z');
  text(g, 'F', 0, 19, D + 2, '+z', C.cream, { center: true, scale: 2, sy: 1 });
  return g;
};

/** Striped smokestack (0.5 scale). */
const stackGrid = (h) => () => {
  const g = new VoxGrid();
  g.cylinder(-0.5, -0.5, 0, h, 2.4, (x, y) => (y > h - 6 ? (Math.floor(y / 2) & 1 ? C.pink : C.cream) : (y % 4 === 0 ? C.brickD : C.brick)));
  g.cylinder(-0.5, -0.5, h + 1, h + 1, 3.2, C.ink);
  g.cylinder(-0.5, -0.5, h + 1, h + 1, 1.6, null);
  return g;
};

const ticketSignGrid = () => {
  const g = new VoxGrid();
  const W = 64, H = 26;
  const x0 = -W / 2, y0 = 22;
  for (let x = x0; x < x0 + W; x++) for (let y = y0; y < y0 + H; y++) {
    const lx = x - x0, ly = y - y0;
    // side notches + corner bites
    if (Math.hypot(lx + 0.5, ly - H / 2 + 0.5) < 5 || Math.hypot(lx - W + 0.5, ly - H / 2 + 0.5) < 5) continue;
    if (Math.hypot(lx + 0.5, ly + 0.5) < 3 || Math.hypot(lx - W + 0.5, ly + 0.5) < 3 || Math.hypot(lx + 0.5, ly - H + 0.5) < 3 || Math.hypot(lx - W + 0.5, ly - H + 0.5) < 3) continue;
    const border = lx < 2 || lx > W - 3 || ly < 2 || ly > H - 3;
    const dash = ly === 3 || ly === H - 4;
    g.set(x, y, 0, border ? C.goldD : dash && (lx & 2) ? C.goldDD : hash3(lx, ly, 3) < 0.06 ? C.goldL : C.gold);
    g.set(x, y, -1, C.goldD);
  }
  text(g, 'GOLDEN', 0, y0 + 14, 1, '+z', 0x6a3a10, { center: true, scale: 1 });
  text(g, 'TICKET', 0, y0 + 6, 1, '+z', 0x6a3a10, { center: true, scale: 1 });
  for (const x of [x0 + 12, x0 + W - 13]) g.box(x, 0, -2, x + 1, y0 - 1, -1, (xx, y) => (Math.floor(y / 3) & 1 ? C.red : C.cream));
  return g;
};

const CLIFF_H = 15;
const cliffGrid = () => {
  // layered cookie / chocolate rock mound (0.25 scale) the waterfall pours from; mint sugar grass on top
  const g = new VoxGrid();
  const W = 12, D = 10, H = CLIFF_H;
  for (let x = -W; x < W; x++) for (let z = -D; z < 3; z++) {
    const edge = Math.min(x + W, W - 1 - x), back = z + D;
    const h = Math.min(H, Math.round(H - Math.max(0, 5 - edge) ** 1.6 * 1.2 - Math.max(0, 3 - back) * 2 + (vnoise(x * 0.3, 1, z * 0.3) - 0.5) * 3 - Math.max(0, z) * 2));
    for (let y = 0; y < h; y++) {
      const layer = Math.floor((y + Math.round(vnoise(x * 0.2, 5, z * 0.2) * 2)) / 3) % 4;
      const drip = (x * 7 + z * 3) % 5 === 0 && y > h - 2 - ((x * 13) % 6) - 2;
      const rock = [0x5a3220, 0x4a2814, 0x6a3c24, 0x553020][layer];
      const sprinkle = y === h - 1 && hash3(x, y, z) < 0.12;
      g.set(x, y, z, sprinkle ? CANDY[Math.floor(hash3(z, x, y) * 7)] : y >= h - 1 ? C.mint : y === h - 2 ? 0xf6e6d0 : drip ? C.milkL : hash3(x, y, z) < 0.06 ? C.milk : rock);
    }
  }
  // the spout notch (front steps cut away so the fall drops straight down)
  for (let x = -5; x < 5; x++) for (let y = 0; y < H + 2; y++) for (let z = 1; z < 3; z++) g.del(x, y, z);
  for (let x = -5; x < 5; x++) for (let y = H - 2; y < H + 2; y++) for (let z = -4; z < 1; z++) g.del(x, y, z);
  for (let x = -5; x < 5; x++) for (let z = -4; z < 1; z++) g.set(x, H - 3, z, C.dark);
  return g;
};

// --------------------------------------------------------------------------- parallax painters

function paintLollipops(ctx, w, ground, seed, o = {}) {
  const R = mulberry32(seed);
  for (let x = 6 + R() * 20; x < w; x += (o.step ?? 30) + R() * (o.jitter ?? 40)) {
    const h = Math.round((o.h ?? 14) * (0.7 + R() * 0.6)), r = Math.round((o.r ?? 5) * (0.8 + R() * 0.5));
    const [a, b] = SWIRLS[Math.floor(R() * SWIRLS.length)];
    px(ctx, Math.round(x), ground - h, 1, h, 0xf8f2e8);
    disc(ctx, x, ground - h - r, r, a);
    for (let k = 0; k < r * 6; k++) {
      const t = k / (r * 6), ang = t * Math.PI * 5, rr = t * r;
      px(ctx, Math.round(x + Math.cos(ang) * rr), Math.round(ground - h - r + Math.sin(ang) * rr), 1, 1, b);
    }
  }
}
function paintCottonTrees(ctx, w, ground, seed, o = {}) {
  const R = mulberry32(seed);
  for (let x = R() * 10; x < w; x += (o.step ?? 12) + R() * (o.jitter ?? 14)) {
    const s = (o.size ?? 5) * (0.7 + R() * 0.6);
    const col = [0xffb8e0, 0xc8b0ff, 0xa8e8ff, 0xfff0a8][Math.floor(R() * 4)];
    px(ctx, Math.round(x), ground - Math.round(s), 1, Math.round(s) + 1, 0xd8c8b8);
    disc(ctx, x, ground - s * 1.6, Math.round(s * 0.9), shade(col, -0.12));
    disc(ctx, x - 1, ground - s * 1.8, Math.round(s * 0.7), col);
    disc(ctx, x - s * 0.3, ground - s * 2.1, Math.max(1, Math.round(s * 0.3)), 0xffffff);
  }
}
function paintGumdropHills(ctx, w, ground, seed) {
  const R = mulberry32(seed);
  for (let x = 0; x < w; x += 6 + R() * 10) {
    const r = 2 + Math.floor(R() * 3), col = CANDY[Math.floor(R() * 7)];
    for (let y = 0; y <= r; y++) { const hw = Math.round(Math.sqrt(r * r - y * y) + 0.3); px(ctx, Math.round(x) - hw, ground - y, hw * 2 + 1, 1, y === r ? shade(col, 0.25) : col); }
    px(ctx, Math.round(x) - 1, ground - r + 1, 1, 1, 0xffffff);
  }
}
function paintSmoke(ctx, x, top, seed) {
  const R = mulberry32(seed);
  let cx = x, cy = top - 3;
  for (let i = 0; i < 6; i++) {
    const r = 2 + i;
    disc(ctx, cx, cy, r, i % 2 ? 0xffb8e0 : 0xff9ad0);
    disc(ctx, cx - 1, cy - 1, Math.max(1, r - 2), 0xffd8ee);
    cx += 3 + R() * 4;
    cy -= 3 + R() * 2;
  }
}

const GUMMY = [[0xff3a4a, 0xffa0a8], [0x5ad84a, 0xb8f4a0], [0xffc21a, 0xfff0a0], [0xff8a2a, 0xffd0a0]];
/** Giant gummy bear (glossy candy: lit rim highlights, lighter belly), 0.11 scale. */
const gummyGrid = (v) => () => {
  const g = new VoxGrid();
  const [c, l] = GUMMY[v % GUMMY.length], d = shade(c, -0.2);
  const col = (x, y, z, cx, cy, r) => (x - cx < -r * 0.35 && y - cy > r * 0.2 ? l : z < -r * 0.4 ? d : c);
  g.ellipsoid(0, 12, 0, 8, 10, 7, (x, y, z) => col(x, y, z, 0, 12, 8));
  g.ellipsoid(0, 12, 5, 5, 6, 2.5, shade(c, 0.12));
  g.ellipsoid(0, 27, 0, 7, 6.5, 6, (x, y, z) => col(x, y, z, 0, 27, 7));
  for (const sx of [-1, 1]) {
    g.ellipsoid(sx * 5, 33, 0, 2.6, 2.6, 2.2, c);
    g.ellipsoid(sx * 8, 16, 2, 2.6, 4.2, 2.6, c);
    g.ellipsoid(sx * 4, 3, 1, 3.2, 3.6, 3.4, c);
  }
  g.ellipsoid(0, 25, 6, 2.6, 2, 1.6, l);
  g.set(0, 26, 8, 0x2a1520).set(-1, 26, 8, 0x2a1520);
  for (const sx of [-3, 2]) g.box(sx, 28, 6, sx, 29, 6, 0x2a1520);
  return g;
};
/** Gingerbread cottage with icing trim, gumdrop roof studs and a candy-cane door (0.12 scale). */
const gingerHouseGrid = () => {
  const g = new VoxGrid();
  const gb = 0xb8743a, gbD = 0x8e5428, icing = 0xfff8fc;
  g.box(-12, 0, -9, 11, 16, 8, (x, y, z) => ((x + y + z) % 5 === 0 ? gbD : gb));
  for (let i = 0; i <= 11; i++) g.box(-14, 17 + i, -11 + i, 13, 17 + i, 10 - i, (x, y) => (y === 17 || (x + y) % 6 === 0 ? icing : 0x9a5a2c));
  for (let x = -14; x <= 13; x++) if (x % 3 === 0) g.set(x, 16, 11, icing).set(x, 15, 11, x % 6 === 0 ? icing : null);
  for (let i = 0; i < 9; i++) { const x = -11 + i * 3, y = 19 + (i % 3) * 2; g.set(x, y + 1, 9 - (y - 17), CANDY[i % 7]); }
  g.box(-3, 0, 9, 2, 10, 9, (x, y) => ((x + y) & 1 ? 0xe8343c : 0xfff8f4));
  for (const wx of [-10, 5]) { g.box(wx, 6, 9, wx + 4, 11, 9, icing); g.box(wx + 1, 7, 9, wx + 3, 10, 9, 0xffe08a); }
  g.box(-8, 22, -4, -6, 30, -2, 0xe8343c).box(-9, 30, -5, -5, 31, -1, icing);
  for (let x = -12; x <= 11; x += 2) g.set(x, 0, 10, CANDY[(x + 12) % 7]);
  return g;
};

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  // ---- sky: purple -> pink candy sky with a soft golden sun and sparkles
  const sky = skyTexture('factory2', [[0, 0x5a30b0], [0.22, 0x8a4ccc], [0.45, 0xc070d8], [0.66, 0xff9ad0], [0.84, 0xffc4dc], [1, 0xffe0e8]], (ctx, w, h) => {
    const P = pixbuf(ctx, w, h);
    paintStarfield(P, w, h, { n: 70, ymax: h * 0.32, seed: 8, tint: 0xffd0f0 });
    // rainbow arc
    const cx = w * 0.5, cy = h * 0.98, R0 = h * 0.74;
    const bands = [0xff5a6a, 0xff9a4a, 0xffe060, 0x7ae070, 0x5ac0f0, 0x9a7af0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - cx) / 1.25, y - cy) - R0;
      if (d < 0 || d >= bands.length * 3) continue;
      P.dither(x, y, bands[Math.floor(d / 3)], 0.8 * Math.min(1, (cy - y) / (h * 0.45)), 3);
    }
    skyGlow(P, w * 0.62, h * 0.24, w * 0.3, h * 0.3, 0xffe8f4, 0.6, { bands: 5, pow: 1.5 });
    paintSunPx(P, Math.round(w * 0.62), Math.round(h * 0.24), 9, { color: 0xfff0c0, core: 0xffffff, halo: 0xffd0e8, halo2: 0xfff0f8, haloR: 5 });
    const candy = { light: 0xffffff, color: 0xffe0f2, shade: 0xf4a8d4, dark: 0xd88ac0 };
    paintCumulus(P, w * 0.13, h * 0.26, 15, 21, { ...candy, sunX: 1 });
    paintCumulus(P, w * 0.4, h * 0.15, 9, 22, { light: 0xffffff, color: 0xe8f0ff, shade: 0xb8c8f4, dark: 0x9aa8e4, sunX: 1 });
    paintCumulus(P, w * 0.88, h * 0.3, 14, 23, { ...candy, sunX: -1 });
    paintCumulus(P, w * 0.74, h * 0.45, 8, 24, { light: 0xffffff, color: 0xfff0d8, shade: 0xf4c8a8, sunX: -1 });
    paintCloudBank(P, w, Math.round(h * 0.62), { s: 9, seed: 25, light: 0xffffff, color: 0xffe4f2, shade: 0xf4b4d8, dark: 0xe8a0cc, alpha: 0.92 });
    for (let i = 0; i < 26; i++) { const x = (i * 53) % w, y = 8 + ((i * 29) % Math.round(h * 0.4)); P.set(x, y, 0xffffff); P.set(x - 1, y, 0xffd0f0, 0.6); P.set(x + 1, y, 0xffd0f0, 0.6); P.set(x, y - 1, 0xffd0f0, 0.6); P.set(x, y + 1, 0xffd0f0, 0.6); }
    P.flush();
  }, { w: 320, h: 180, bands: 14 });
  fitSkyAuto(K, sky);

  // ---- parallax pixel layers (far -> near)
  K.parallax('candyMountains', {
    z: -170, y: -4, w: parallaxWidth(-170), h: 40, tw: 520, th: 80,
    paint: (ctx, w, h) => {
      const P = pixbuf(ctx, w, h);
      paintRange(P, w, h, { base: 0.5, amp: 20, freq: 0.022, seed: 4, ridged: true, lit: 0xc89ae8, mid: 0xb488dc, dark: 0x9a74c8, rim: 0xf4e0ff, snow: 0xfff4fa, snowLit: 0xffffff, snowShade: 0xf0c8e8, snowLine: 0.45, haze: [0xf8c8e4, 0.55, 0.8] });
      const tops = paintRange(P, w, h, { base: 0.7, amp: 11, freq: 0.03, seed: 9, round: true, lit: 0xf0a0d0, mid: 0xe490c4, dark: 0xd07ab4, rim: 0xffe0f2, snow: 0xfff8fc, snowLine: 0.4, gullies: false, haze: [0xffd8ec, 0.75, 0.7] });
      const R = mulberry32(12);
      for (let i = 0; i < w * 0.6; i++) { const x = Math.floor(R() * w), y = Math.round(tops[x] + 1 + R() * 8); P.set(x, y, CANDY[Math.floor(R() * 7)], 0.9); }
      P.flush();
    },
  });
  // frosted chocolate mountains with sprinkles (3D voxels)
  voxRange(K, 'chocMountains', {
    x0: -150, x1: 150, z: -100, depth: 5, scale: 1.7, base: 2, amp: 9, freq: 0.07, seed: 5, ridged: true,
    col: (xv, y, zv, h) => {
      const j = hash3(xv, y, zv);
      const icing = 2 + 9 * 0.6 - hash3(xv, 3, zv) * 1.5;
      if (y >= icing) return j < 0.12 ? CANDY[Math.floor(hash3(zv, xv, y) * 7)] : y === h - 1 ? 0xfff4fa : 0xffd8ec;
      if (y >= icing - 1 && hash3(xv, 7, zv) < 0.5) return 0xffd8ec; // drips
      const layer = Math.floor(y / 2) % 3;
      return [0x6a3c24, 0x5a3220, 0x7d4a2d][layer] + (j < 0.1 ? 0x0a0806 : 0);
    },
  });
  addClouds(K, { id: 'cottonCloud', n: 8, kinds: 3, x0: -130, x1: 130, y0: 12, y1: 18, z0: -95, z1: -130, s0: 0.9, s1: 1.3, scale: 0.8, speed: 0.55, seed: 6, len: 20, height: 8, color: 0xffe2f2, shade: 0xf4b0d8, dark: 0xe49ccc, light: 0xffffff });
  const w2 = parallaxWidth(-110);
  K.parallax('factorySkyline', {
    z: -110, y: -4, w: w2, h: 24, tw: Math.round(w2 * 2.4), th: 58,
    paint: (ctx, w, h) => {
      const ground = Math.round(h * (16 / 24));
      const R = mulberry32(3);
      // smokestacks with painted pink plumes behind the buildings
      for (let x = 20; x < w; x += 40 + R() * 50) {
        const sh = 18 + Math.floor(R() * 14), top = ground - sh - 8;
        paintSmoke(ctx, x + 1, top, Math.floor(R() * 99));
        px(ctx, x, top, 3, sh + 8, 0x7a3a5a);
        for (let y = top; y < top + 6; y += 2) px(ctx, x, y, 3, 1, 0xff9ad0);
      }
      // factory blocks with sawtooth roofs and glowing windows
      let x = -4;
      while (x < w) {
        const bw = 14 + Math.floor(R() * 20), bh = 8 + Math.floor(R() * 12);
        const top = ground - bh, col = [0x7a4a7a, 0x6a3a6a, 0x8a4a6a][Math.floor(R() * 3)];
        px(ctx, x, top, bw, bh + 2, col);
        for (let k = 0; k < bw; k += 5) for (let i = 0; i < 3; i++) px(ctx, x + k + i, top - i - 1, 5 - i, 1, shade(col, i === 2 ? 0.25 : 0.1));
        for (let wy = top + 3; wy < ground - 2; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 4) if (R() < 0.6) px(ctx, wx, wy, 2, 2, R() < 0.5 ? 0xffd890 : 0xff9ad0);
        x += bw + 1 + Math.floor(R() * 4);
      }
      // a giant chocolate silo + candy-striped water tower
      for (const cx of [w * 0.3, w * 0.74]) {
        px(ctx, cx - 6, ground - 26, 12, 26, 0x6a3a28);
        disc(ctx, cx, ground - 26, 6, 0x7a4a30);
        px(ctx, cx - 6, ground - 20, 12, 2, 0xff9ad0);
      }
      paintGradient(ctx, 0, ground, w, h - ground, [[0, 0x6ac08a], [1, 0x5ab07a]], { bands: 2 });
    },
  });
  const w3 = parallaxWidth(-70);
  K.parallax('candyHills', {
    z: -70, y: -3, w: w3, h: 13, tw: Math.round(w3 * 3.4), th: 44,
    paint: (ctx, w, h) => {
      const ground = Math.round(h * (10 / 13));
      const tops = paintRidge(ctx, w, h, { base: 0.68, amp: 4, freq: 0.03, seed: 21, color: 0x7fd8a0, rim: 0xc8ffe0, dark: 0x6ac08a, speck: 0xff9ad0, speckN: 0.4 });
      void tops;
      paintCottonTrees(ctx, w, ground - 2, 5, { size: 5, step: 14 });
      paintLollipops(ctx, w, ground, 7, { h: 12, r: 4, step: 26, jitter: 30 });
      paintGumdropHills(ctx, w, ground + 1, 9);
      // candy-cane fence
      for (let x = 0; x < w; x += 3) { px(ctx, x, ground - 3, 1, 4, (x / 3) & 1 ? 0xe8343c : 0xffffff); }
      px(ctx, 0, ground - 2, w, 1, 0xffffff);
      paintGradient(ctx, 0, ground + 1, w, h - ground - 1, [[0, 0x6ac890], [1, 0x5ab880]], { bands: 2 });
    },
  });

  // ---- ground: mint sugar grass with sprinkles; the river channel is cut out
  const mintCol = (x, z) => {
    const n = vnoise(x * 0.12, 7, z * 0.12), m = hash3(Math.floor(x * 2), 13, Math.floor(z * 2));
    if (m < 0.006) return mixHex(CANDY[Math.floor(m * 1300) % 8], 0xffffff, 0.35);
    return n > 0.66 ? C.mintL : n < 0.3 ? C.mintD : m < 0.2 ? shade(C.mint, -0.05) : C.mint;
  };
  const inRiver = (x, z) => z >= RIVER.z0 && z < RIVER.z1;
  K.ground({ id: 'groundNear', x0: -60, x1: 60, z0: -16, z1: 20, scale: 0.5, color: (x, z) => {
    if (z >= RIVER.z1 && z < RIVER.z1 + 0.5) return hash3(Math.floor(x * 2), 3, 1) < 0.5 ? 0xd8b088 : 0xc89a70; // cookie bank
    if (z >= RIVER.z0 - 0.5 && z < RIVER.z0) return hash3(Math.floor(x * 2), 4, 1) < 0.5 ? 0xd8b088 : 0xc89a70;
    return mintCol(x, z);
  }, skip: inRiver });
  K.ground({ id: 'groundFar', x0: -110, x1: 110, z0: -70, z1: -16, scale: 1, color: mintCol });
  K.ground({ id: 'groundFront', x0: -60, x1: 60, z0: 20, z1: 44, scale: 1, color: mintCol });
  // river bed under the flowing surface
  K.mesh('riverBed', () => new VoxGrid().box(-120, -3, Math.round(RIVER.z0 * 2), 119, -3, Math.round(RIVER.z1 * 2) - 1, C.darkD), { scale: 0.5, pivot: [0, 0, 0] }, 0, 0, 0);

  // ---- the chocolate river: glossy, scrolling pixel ripples
  const riverTex = tileTex('fac_river', 32, 16, (ctx, w, h) => {
    px(ctx, 0, 0, w, h, 0x744222);
    const R = mulberry32(4);
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(R() * w), y = Math.floor(R() * h), L = 3 + Math.floor(R() * 8);
      const c = R() < 0.45 ? 0x94582f : R() < 0.6 ? 0x5a2c12 : 0xc89a6a;
      px(ctx, x, y, L, 1, c);
      if (x + L > w) px(ctx, 0, y, x + L - w, 1, c);
    }
    // white-chocolate swirl streaks
    for (let i = 0; i < 4; i++) {
      const x0 = Math.floor(R() * w), y0 = 2 + Math.floor(R() * (h - 4));
      for (let k = 0; k < 9; k++) px(ctx, (x0 + k) % w, y0 + Math.round(Math.sin(k * 0.8) * 1.2), 1, 1, k % 3 ? 0xf0dcc0 : 0xd8b890);
    }
  });
  const riverW = 220, riverD = RIVER.z1 - RIVER.z0;
  riverTex.repeat.set(riverW / 12, riverD / 6);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(riverW, riverD), new THREE.MeshPhongMaterial({ map: riverTex, color: 0xd8c8c8, shininess: 45, specular: 0x5a4030 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, RIVER.y, (RIVER.z0 + RIVER.z1) / 2);
  river.receiveShadow = true;
  river.name = 'chocolateRiver';
  K.add(river);
  K.onUpdate((dt) => { riverTex.offset.x -= dt * 0.045; });
  // rising chocolate bubbles + floating marshmallows
  {
    const bub = liveInstances(K, 'chocBubble', () => {
      const g = new VoxGrid();
      g.box(-1, 0, -1, 1, 1, 1, 0x8a5230).box(-2, 0, -1, 2, 0, 1, 0x7a4628).box(-1, 0, -2, 1, 0, 2, 0x7a4628).set(-1, 1, -1, 0xd8a070);
      return g;
    }, { scale: 0.07 }, 14);
    const bubbles = Array.from({ length: 14 }, () => ({ x: K.rand(-26, 26), z: K.rand(RIVER.z0 + 0.6, RIVER.z1 - 0.6), o: K.rand(0, 1), s: K.rand(0.6, 1.3) }));
    const mallows = K.inst('marshmallow', () => new VoxGrid().box(-1, 0, -1, 1, 1, 1, (x, y) => (y ? 0xfff8f4 : 0xffd8e8)), { scale: 0.12 },
      Array.from({ length: 9 }, () => [K.rand(-28, 28), RIVER.y - 0.06, K.rand(RIVER.z0 + 0.5, RIVER.z1 - 0.5), K.rand(0, 6)]));
    K.onUpdate((dt, t) => {
      for (let i = 0; i < 14; i++) {
        const u = bubbles[i], k = (t * 0.5 + u.o) % 1;
        setInstance(bub, i, u.x, RIVER.y - 0.06 + Math.sin(k * Math.PI) * 0.05, u.z, 0, 0, 0, Math.max(0.0001, u.s * (0.3 + k * 0.9) * (k > 0.92 ? (1 - k) * 12 : 1)));
      }
      bub.instanceMatrix.needsUpdate = true;
      mallows.position.x = ((t * 0.55 + 30) % 60) - 30;
    });
  }
  // the paddle boat cruising downstream
  {
    const boat = K.mesh('boat', boatGrid, { scale: 0.09, ao: true }, 0, RIVER.y - 0.05, -7.4, 0, 1, { shadow: true, receive: false });
    K.onUpdate((dt, t) => {
      const k = (t * 0.035) % 1;
      boat.position.x = -34 + k * 68;
      boat.position.y = RIVER.y - 0.05 + Math.sin(t * 2.1) * 0.04;
      boat.rotation.z = Math.sin(t * 1.6) * 0.03;
    });
  }

  // ---- chocolate waterfall pouring off a cookie cliff into the river
  {
    const cx = -4.4, cz = -10.4; // cz = front face of the spout
    K.mesh('cliff', cliffGrid, { scale: 0.25 }, cx, -0.25, cz - 1.12, 0, 1, { shadow: true });
    const top = (CLIFF_H - 2) * 0.25 - 0.25;
    addFall(K, { id: 'chocFall', x: cx, z: cz - 0.2, top, bottom: RIVER.y, width: 2.5, vox: 0.14, colors: [0x6a3a1e, 0x8e522c, 0xb87a48, 0xf0d8b8], speed: 3.0, n: 36, seed: 7 });
    K.mesh('chocLip', () => new VoxGrid().box(-9, 0, 0, 8, 1, 2, (x, y, z) => (y && z === 2 ? 0xc48a5c : y ? 0xa8683c : 0x8e522c)), { scale: 0.14, pivot: [0, 0, 0] }, cx, top - 0.16, cz - 0.42);
    addPuffs(K, { id: 'chocFoam', sources: [[cx - 1.1, RIVER.y + 0.05, cz + 0.8], [cx, RIVER.y + 0.05, cz + 1.0], [cx + 1.1, RIVER.y + 0.05, cz + 0.8]], n: 2, life: 2.2, rise: 0.3, drift: [0, 0.9], size: [0.6, 1.0], scale: 0.06, color: 0xf0d8b8, light: 0xfff0dc, shade: 0xc89a6a, seed: 5 });
    const drops = liveInstances(K, 'chocDrop', () => new VoxGrid().box(0, 0, 0, 1, 1, 1, 0x8a5230).set(0, 1, 0, 0xc48a5c), { scale: 0.06, pivot: 'center' }, 12);
    const dd = Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * Math.PI * 2, o: i / 12, v: K.rand(1.5, 2.4) }));
    K.onUpdate((dt, t) => {
      for (let i = 0; i < 12; i++) {
        const u = dd[i], k = (t * 1.1 + u.o) % 1, rr = 0.3 + k * 1.1, y = RIVER.y + u.v * k - 2.6 * k * k;
        setInstance(drops, i, cx + Math.cos(u.a) * rr * 1.6, y, cz + 0.9 + Math.sin(u.a) * rr * 0.5, t * 3, 0, 0, y > RIVER.y - 0.05 ? 1 : 0.0001);
      }
      drops.instanceMatrix.needsUpdate = true;
    });
    // gumdrops + a lollipop on the cliff top
    K.mesh('gumCliff', gumdropGrid(17), { scale: 0.08, ao: true }, cx - 1.9, top + 0.2, cz - 1.6, 0.4, 1, { shadow: true, receive: false });
    K.mesh('gumCliff2', gumdropGrid(23), { scale: 0.07, ao: true }, cx + 2.0, top + 0.2, cz - 1.7, 1.4, 1, { shadow: true, receive: false });
  }

  // ---- the lane: a giant milk-chocolate bar path with candy-stripe edges
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 2, side: C.darkD,
    color: (ix, iz) => {
      const z = (iz + 0.5) * 0.25, az = Math.abs(z);
      if (az > 2.25) return ((ix + iz) >> 1) & 1 ? 0xff5aa0 : C.cream;
      if (az > 2.0) return 0xf2dcc0;
      const u = (((ix % 8) + 8) % 8), v = (((iz + 8) % 8) + 8) % 8;
      if (u === 0 || v === 0) return C.milkD;
      if (u === 1 || v === 1) return C.milkL;
      if (u === 7 || v === 7) return shade(C.milk, -0.1);
      return hash3(ix, 5, iz) < 0.06 ? shade(C.milk, 0.05) : C.milk;
    },
  });
  // centre marker: a golden ticket inlaid in the bar
  K.mesh('centerTicket', () => {
    const g = new VoxGrid();
    for (let x = -6; x < 6; x++) for (let z = -3; z < 3; z++) {
      if ((x === -6 || x === 5) && (z === -1 || z === 0)) continue;
      g.set(x, 0, z, (x === -6 || x === 5 || z === -3 || z === 2) ? C.goldD : C.gold);
    }
    for (let x = -4; x < 4; x += 2) g.set(x, 1, -1, C.goldDD).set(x, 1, 0, C.goldDD);
    return g;
  }, { scale: 0.16, pivot: [0, 0, 0] }, 0, -0.15, 1.35);

  // ---- breakables right behind the lane: Feastables crates, candy jars, cupcakes
  for (const [x, kind, v] of [[-16.6, 'products', 0], [-9.4, 'candy', 1], [-3.6, 'products', 1], [3.8, 'cake', 0], [9.6, 'products', 2], [16.6, 'candy', 3]]) {
    if (kind === 'products') K.breakable('products', 'feastCrate' + v, crateGrid(v), { scale: 0.1 }, x, -3.25, K.rand(-0.3, 0.3));
    else if (kind === 'candy') K.breakable('candy', 'candyJar' + v, jarGrid(v), { scale: 0.1 }, x, -3.25, K.rand(0, 1));
    else K.breakable('cake', 'cupcake' + v, cupcakeGrid(v), { scale: 0.11 }, x, -3.2, 0);
  }

  // ---- candy garden behind the river: lollipop trees (spinning swirls), gumdrops, giant bars
  const pops = [[-14.6, -12.4, 26, 0], [-1.0, -14.4, 30, 1], [4.6, -15.6, 22, 2], [16.4, -12.6, 28, 3], [-19.6, -17.4, 34, 4], [21.6, -18.6, 24, 0], [-26, -13, 28, 2], [27.5, -13.5, 30, 1], [-9.6, -19.4, 38, 3], [10.8, -21.4, 34, 4]];
  const sticks = {};
  for (const [x, z, h] of pops) (sticks[h] ??= []).push([x, 0, z]);
  for (const h of Object.keys(sticks)) K.inst('stick' + h, stickGrid(+h), { scale: 0.1, ao: true }, sticks[h], { shadow: true });
  const discs = pops.map(([x, z, h, vi], i) => {
    const m = K.mesh('swirl' + vi, swirlGrid(vi), { scale: 0.1, pivot: 'center', ao: true }, x - 0.05, h * 0.1 + 0.8, z - 0.05, 0, 1, { shadow: true, receive: false });
    m.userData.sp = (i % 2 ? 1 : -1) * (0.4 + (i % 3) * 0.15);
    return m;
  });
  K.onUpdate((dt) => { for (const d of discs) d.rotation.z += dt * d.userData.sp; });
  const gum = [[-12.4, -11.6], [0.6, -11.8], [2.8, -12.2], [8.6, -11.8], [13.6, -11.5], [-18.4, -12.0], [19.2, -12.4], [-23.5, -16.5], [24.6, -15.4], [-4.2, -17.4], [7.4, -18.6], [-15, -21], [15.4, -22]];
  for (let v = 0; v < 3; v++) K.inst('gumdrops' + v, gumdropGrid(v * 7 + 3), { scale: 0.1, ao: true }, gum.filter((_, i) => i % 3 === v).map(([x, z], i) => [x, 0, z, i * 1.3, 1 + (i % 2) * 0.2]), { shadow: true, receive: false });
  // giant Feastables bars standing around (one torn open)
  K.mesh('feastBar0', feastBarGrid(0), { scale: 0.09 }, 5.6, 0, -14.4, -0.18, 1, { shadow: true });
  K.mesh('feastBar1', feastBarGrid(1, true), { scale: 0.09 }, 15.6, 0, -18.6, -0.2, 1, { shadow: true });
  K.mesh('feastBar2', feastBarGrid(2), { scale: 0.08 }, 9.6, 0.9, -17.2, 0.12, [1, 1, 1], { shadow: true }).rotation.z = 0.06;
  K.mesh('feastBar2', feastBarGrid(2), { scale: 0.08 }, 12.8, 0, -16.2, -0.3, 1, { shadow: true });
  // candy-cane pipes: one dips into the river, one arcs from the factory roof
  K.mesh('pipeA', pipeGrid([[0, 0, 0], [0, 60, 0], [0, 70, -10], [0, 70, -60], [0, 0, -60]]), { scale: 0.1, pivot: [0, 0, 0] }, 11.8, RIVER.y - 0.6, -6.4, 0, 1, { shadow: true });
  K.mesh('pipeB', pipeGrid([[0, 0, 0], [0, 90, 0], [40, 110, 0], [120, 110, 0], [140, 80, 0], [140, 0, 0]], 3.2), { scale: 0.1, pivot: [0, 0, 0] }, -24, 0, -24, 0, 1, { shadow: true });
  // golden ticket sign (sparkles twinkle across it)
  K.mesh('ticketSign', ticketSignGrid, { scale: 0.1 }, -16.6, 0, -21.0, 0.12, 1, { shadow: true });
  {
    const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const sparks = [];
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(sparkGeo, glowMat(0xfff8d0));
      s.userData = { o: i / 7, x: K.rand(-2.8, 2.8), y: K.rand(2.4, 4.6) };
      K.add(s);
      sparks.push(s);
    }
    const cs = Math.cos(0.12), sn = Math.sin(0.12);
    K.onUpdate((dt, t) => {
      for (const s of sparks) {
        const u = s.userData, k = (t * 0.7 + u.o) % 1;
        s.position.set(-16.6 + u.x * cs, u.y, -21.0 + 0.2 - u.x * sn);
        s.scale.setScalar(Math.max(0.01, Math.sin(k * Math.PI)) * 1.2);
        s.rotation.z = t * 3;
      }
    });
  }

  // ---- the factory: brick hall, sawtooth roof, FEASTABLES sign, smokestacks puffing pink smoke
  const FX = 3, FZ = -33;
  K.mesh('factory', factoryGrid, { scale: 0.25 }, FX, 0, FZ, 0, 1, { shadow: true });
  K.mesh('factorySign', () => {
    const g = new VoxGrid();
    const label = 'FEASTABLES', s = 2;
    const W = textW(label, s) + 8, H = 5 * s + 6;
    g.box(-W / 2, 0, 0, W / 2 - 1, H - 1, 1, C.blue);
    g.box(-W / 2, 0, 2, W / 2 - 1, 0, 2, C.cream).box(-W / 2, H - 1, 2, W / 2 - 1, H - 1, 2, C.cream);
    text(g, label, 0, 3, 2, '+z', 0xb4aca4, { center: true, scale: s, glow: true });
    for (const x of [-W / 2 + 6, W / 2 - 7]) g.box(x, -15, 0, x, -1, 0, C.metalD);
    return g;
  }, { scale: 0.16 }, FX, 7.7, FZ + 1, 0, 1);
  const stacks = [[FX - 7.5, FZ - 1, 34], [FX - 3.5, FZ - 1.5, 40], [FX + 7.5, FZ - 0.5, 30]];
  for (const [x, z, h] of stacks) K.mesh('stack' + h, stackGrid(h), { scale: 0.25 }, x, 4.5, z, 0, 1, { shadow: true });
  {
    addPuffs(K, { id: 'stackSmoke', sources: stacks.map(([x, z, h]) => [x, 4.5 + (h + 2) * 0.25, z]), n: 6, life: 6.2, rise: 5.5, drift: [3.2, 0.5], wobble: 0.3, size: [0.45, 2.0], scale: 0.18, r: 4, color: 0xffb8e0, light: 0xffe0f2, shade: 0xf090c8, opacity: 0.88, seed: 11 });
  }
  // a few chocolate tanks / vats beside the factory
  K.inst('vat', () => {
    const g = new VoxGrid();
    g.cylinder(-0.5, -0.5, 0, 18, 5, (x, y) => (y % 6 === 0 ? C.metalD : y > 15 ? C.pinkL : C.metal));
    g.cylinder(-0.5, -0.5, 19, 20, 3, C.metalD);
    g.box(-6, 6, -1, -6, 12, 0, C.milkD, true);
    return g;
  }, { scale: 0.18, ao: true }, [[-12.5, 0, -30.5], [-15.5, 0, -32.5], [19, 0, -31]], { shadow: true });

  // ---- foreground (low!): candy-cane stubs, wrapped sweets, mint tufts
  const stubs = [];
  for (let x = -22; x <= 22; x += 4) stubs.push([x + 1, 0, LH + 0.5, 0, 1]);
  K.inst('caneStub', () => {
    const g = new VoxGrid();
    for (let y = 0; y < 5; y++) g.box(0, y, 0, 1, y, 1, ((y + 0) >> 0) & 1 ? C.red : C.cream);
    g.box(0, 5, 0, 1, 5, 2, C.red).box(0, 4, 2, 1, 4, 2, C.cream);
    return g;
  }, { scale: 0.08, ao: true }, stubs, { shadow: true });
  const sweets = [];
  for (let i = 0; i < 26; i++) sweets.push([K.rand(-26, 26), 0, K.rand(LH + 1, 11), K.rand(0, 6), K.rand(0.8, 1.2)]);
  for (let v = 0; v < 3; v++) K.inst('sweet' + v, () => {
    const g = new VoxGrid();
    const c = CANDY[v * 2];
    g.box(-1, 0, -1, 1, 1, 0, c).set(-2, 1, -1, shade(c, 0.3)).set(2, 1, -1, shade(c, 0.3)).set(-3, 0, -1, shade(c, 0.3)).set(3, 0, -1, shade(c, 0.3));
    g.set(0, 1, 0, 0xffffff);
    return g;
  }, { scale: 0.07 }, sweets.filter((_, i) => i % 3 === v));
  // rainbow sprinkles scattered on the sugar grass
  for (let v = 0; v < 4; v++) {
    const sp = [];
    for (let i = 0; i < 34; i++) sp.push([K.rand(-34, 34), 0, K.rand(LH + 1.4, 14), K.rand(0, 6), 1]);
    K.inst('sprinkle' + v, () => new VoxGrid().box(0, 0, 0, 2, 0, 0, [0xff4fa3, 0xffd23f, 0x29b6f6, 0xb05cff][v]), { scale: 0.07, pivot: [1, 0, 0] }, sp);
  }
  const tufts = [];
  for (let i = 0; i < 70; i++) tufts.push([K.rand(-40, 40), 0, K.rand(LH + 1.1, 13), K.rand(0, 6), K.rand(0.6, 1.2)]);
  swayInst(K, 'mintTuft', () => tuftGrid(C.mint, { light: C.mintL, dark: C.mintD }), { scale: 0.08 }, tufts.map((t) => [t[0], 0, t[2], t[3], t[4]]), { amp: 0.12, speed: 2 });

  // ---- postcard extras: cotton-candy grove, gingerbread cottages, candy birds, river glints, swaying mint grass
  {
    const trees = [];
    for (let i = 0; i < 22; i++) {
      const x = K.rand(-60, 60), z = K.rand(-58, -24);
      if (Math.abs(x - 3) < 13 && z < -26) continue;
      trees.push([x, 0, z, K.rand(0, 6), K.rand(0.12, 0.16)]);
    }
    const cotton = [[0xffb8e0, 0xe890c8], [0xa8e0ff, 0x80c0f0], [0xd8b8ff, 0xb090e8]];
    cotton.forEach(([leaf, leafD], v) => swayInst(K, 'cottonTree' + v, () => leafyTreeGrid({ seed: 20 + v, leaf, leafD, leafL: 0xffffff, trunk: 0xf4e8e0, h: 9, r: 6 }), { scale: 1 }, trees.filter((_, i) => i % 3 === v), { amp: 0.03, speed: 0.9 }));
    const houses = [[-34, -42, 0.3], [-42, -47, 0.1], [-26, -50, 0.2], [32, -43, -0.25], [41, -48, -0.1], [25, -52, -0.2]];
    K.inst('gingerHouse', gingerHouseGrid, { scale: 0.12 }, houses.map(([x, z, ry]) => [x, 0, z, ry]));
    addPuffs(K, { id: 'gingerSmoke', sources: houses.map(([x, z]) => [x - 0.9, 4.6, z - 0.3]), n: 4, life: 4, rise: 2.4, drift: [0.8, 0], size: [0.3, 0.9], scale: 0.1, color: 0xf8f0f4, light: 0xffffff, shade: 0xe0c8d8, opacity: 0.85, seed: 3 });
  }
  {
    // giant gummy bears wobbling in the candy garden
    const bears = [[-21.5, -14.2, 0.35, 0], [20.6, -13.4, -0.4, 1], [-1.6, -17.6, 0.1, 2], [31, -20, -0.3, 3]].map(([x, z, ry, v]) => K.mesh('gummy' + v, gummyGrid(v), { scale: 0.11 }, x, 0, z, ry, 1, { shadow: true }));
    K.onUpdate((dt, t) => {
      for (let i = 0; i < bears.length; i++) {
        const k = Math.sin(t * 2.6 + i * 1.7) * 0.035;
        bears[i].scale.set(1 - k * 0.6, 1 + k, 1 - k * 0.6);
      }
    });
  }
  addBirds(K, { id: 'candyBirds', n: 6, mode: 'flock', x0: -70, x1: 70, y: 10.6, z: -40, speed: 3, dir: 1, color: 0xff7ac0, wingTip: 0x29b6f6, belly: 0xffd0e8, beak: 0xffd23f, vox: 0.07, flap: 11, soar: 0.2, seed: 9 });
  addSparkles(K, { id: 'riverGlint', n: 26, area: [-30, 30, RIVER.y + 0.02, RIVER.y + 0.05, RIVER.z0 + 0.4, RIVER.z1 - 0.4], color: 0xfff0dc, scale: 0.08, rate: 0.9, sharp: 4, seed: 4 });
  addSparkles(K, { id: 'sugarSparkle', n: 14, area: [-24, 24, 1.2, 4.5, -16, -8], color: 0xffffff, color2: 0xff9ad0, cross: true, scale: 0.05, rate: 0.7, wander: 0.4, seed: 6 });

  return {
    sky,
    fog: { color: 0xf8c8e4, near: 75, far: 270 },
    lights: { sky: 0xffe0f4, ground: 0x7a5a6a, hemi: 1.25, sun: 2.1, sunColor: 0xfff0e0, dir: [7, 14, 9], rim: 1.1, rimColor: 0xffa8e0 },
    dust: 0xe8c8b0,
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // round mint-candy plinth with a cookie crust and a chocolate river crossing it
  const RZ0 = -1.6, RZ1 = 0.4; // river band (z)
  K.mesh('zoneBase', () => {
    const g = new VoxGrid();
    const R = 27.5;
    for (let x = -28; x <= 27; x++) for (let z = -28; z <= 27; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > R) continue;
      const wz = (z + 0.5) * 0.25 + Math.sin(x * 0.18) * 0.35;
      const river = wz > RZ0 && wz < RZ1 && d < R - 0.6;
      const m = hash3(x, 3, z);
      const top = m < 0.03 ? CANDY[Math.floor(m * 260) % 8] : vnoise(x * 0.25, 3, z * 0.25) > 0.62 ? C.mintL : m < 0.25 ? C.mintD : C.mint;
      if (!river) g.set(x, 0, z, (Math.abs(wz - RZ0) < 0.3 || Math.abs(wz - RZ1) < 0.3) && d < R - 0.6 ? 0xd8b088 : top);
      g.set(x, -1, z, river ? C.darkD : d > R - 1 ? 0xc89a70 : 0xd8b088);
      if (d < R - 0.8) g.set(x, -2, z, C.milk);
      if (d < R - 2) g.set(x, -3, z, C.dark);
      if (d < R - 3.5) g.set(x, -4, z, C.milk);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 1, 0] }, 0, 0, 0);
  // the river surface (scrolling) following the wavy channel
  const riverTex = tileTex('fac_riverZ', 32, 16, (ctx, w, h) => {
    px(ctx, 0, 0, w, h, 0x6a3a1e);
    const R = mulberry32(4);
    for (let i = 0; i < 26; i++) { const x = Math.floor(R() * w), y = Math.floor(R() * h), L = 3 + Math.floor(R() * 7); px(ctx, x, y, L, 1, R() < 0.5 ? 0x8a5230 : 0x52280f); }
  });
  riverTex.repeat.set(3, 0.5);
  const geo = new THREE.PlaneGeometry(13.4, RZ1 - RZ0 + 0.5, 40, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + Math.sin(pos.getX(i) / 0.25 * 0.18) * 0.35);
  const river = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: riverTex, shininess: 70, specular: 0x8a6a5a }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, -0.1, (RZ0 + RZ1) / 2);
  K.add(river);
  K.onUpdate((dt) => { riverTex.offset.x -= dt * 0.12; });
  // the factory (scaled down) with puffing smokestacks
  K.mesh('factoryZ', factoryGrid, { scale: 0.1 }, 1.2, 0, -4.5, 0, 1, { shadow: true });
  const st = [[-1.6, -5.2, 18], [0.2, -5.4, 22], [4.4, -5.0, 16]];
  for (const [x, z, h] of st) K.mesh('stackZ' + h, stackGrid(h), { scale: 0.12 }, x, 1.85, z, 0, 1, { shadow: true });
  {
    const puffGeo = new THREE.IcosahedronGeometry(0.4, 1);
    const puffs = [];
    st.forEach(([x, z, h], si) => {
      for (let i = 0; i < 5; i++) {
        const col = [0xff9ad0, 0xffb8e0, 0xf890c8][(i + si) % 3];
        const m = new THREE.Mesh(puffGeo, new THREE.MeshLambertMaterial({ color: col, emissive: shade(col, -0.45), transparent: true, opacity: 0.85, depthWrite: false, flatShading: true }));
        m.userData = { x, z, y: 1.85 + (h + 2) * 0.12, o: i / 5 + si * 0.17 };
        K.add(m);
        puffs.push(m);
      }
    });
    K.onUpdate((dt, t) => {
      for (const m of puffs) {
        const u = m.userData, k = (t * 0.22 + u.o) % 1;
        m.position.set(u.x + k * 1.4, u.y + k * 2.8, u.z + k * 0.3);
        m.scale.setScalar(0.5 + k * 1.6);
        m.rotation.y = t * 0.4 + u.o * 6;
        m.material.opacity = 0.9 * Math.min(1, k * 6) * (1 - k);
      }
    });
  }
  // lollipop trees with spinning swirls
  const pops = [[-4.6, 2.6, 22, 0], [4.8, 2.6, 26, 1], [-6.0, -2.4, 30, 3], [-1.6, -2.5, 20, 4]];
  const discs = [];
  for (const [x, z, h, vi] of pops) {
    K.mesh('stickZ' + h, stickGrid(h), { scale: 0.1, ao: true }, x, 0, z, 0, 1, { shadow: true });
    const d = K.mesh('swirlZ' + vi, swirlGrid(vi), { scale: 0.11, pivot: 'center', ao: true }, x - 0.05, h * 0.1 + 0.85, z - 0.05, 0.4, 1, { shadow: true, receive: false });
    discs.push(d);
  }
  K.onUpdate((dt) => { discs.forEach((d, i) => { d.rotation.z += dt * (i % 2 ? 0.6 : -0.5); }); });
  // gumdrops, giant Feastables bars, the paddle boat, a candy-cane pipe, the golden ticket sign
  K.inst('gumZ', gumdropGrid(5), { scale: 0.11, ao: true }, [[-3.4, 0, 3.4, 0.3], [-6.1, 0, 0.9, 2.4], [6.0, 0, 1.7, 4]], { shadow: true, receive: false });
  K.mesh('feastBarZ', feastBarGrid(0), { scale: 0.07 }, 5.6, 0, -2.5, -1.1, 1, { shadow: true });
  K.mesh('feastBarZ2', feastBarGrid(1, true), { scale: 0.065 }, 2.4, 0, 3.9, -0.3, 1, { shadow: true });
  const boat = K.mesh('boatZ', boatGrid, { scale: 0.07, ao: true }, 0, -0.12, -0.6, 0, 1, { shadow: true, receive: false });
  K.onUpdate((dt, t) => { boat.position.x = Math.sin(t * 0.18) * 3.2; boat.rotation.y = Math.cos(t * 0.18) > 0 ? 0 : Math.PI; boat.position.z = -0.6 - Math.sin(boat.position.x / 0.25 * 0.18) * 0.35; boat.position.y = -0.14 + Math.sin(t * 2) * 0.03; });
  K.mesh('pipeZ', pipeGrid([[0, 0, 0], [0, 34, 0], [0, 40, -8], [0, 40, -26]], 2.2), { scale: 0.1, pivot: [0, 0, 0] }, 2.6, -0.4, -0.7, 0, 1, { shadow: true });
  K.mesh('ticketZ', ticketSignGrid, { scale: 0.06 }, -4.4, 0, -3.9, 0.5, 1, { shadow: true });
  // the secret golden Feastables bar, half hidden by a gumdrop bush
  K.mesh('goldenBar', () => {
    const g = new VoxGrid();
    g.box(-5, 0, -2, 4, 1, 1, (x, y) => ((x + 5) % 3 === 0 ? C.goldD : y ? C.goldL : C.gold));
    g.box(-2, 2, -1, 1, 2, 0, C.goldL);
    g.set(-1, 2, 1, 0xffffff, true);
    return g;
  }, { scale: 0.08, ao: true }, -5.2, 0.01, 1.6, 0.5, 1, { shadow: true });
  anchor(K, 'goldenBar', -5.2, 0.15, 1.6);
  anchor(K, 'boss', -1.2, 0, 4.7);
  return { focus: [0, 1.2, 0], radius: 7 };
}
