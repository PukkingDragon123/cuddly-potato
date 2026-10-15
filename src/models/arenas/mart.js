// Arena 4: BEAST MART — "I Bought Everything In 5 Stores". An indoor
// supermarket + electronics megastore: polished tile floor, aisles of
// colourful shelving receding into the store, checkout lanes with moving
// conveyors, a wall of glowing TVs, fluorescent light strips hanging from a
// warehouse ceiling, sale signs and a flickering neon BEAST MART sign. The
// "sky" is the store interior (ceiling + back wall); parallax layers are ever
// deeper aisles. Breakables: shopping carts (tumble) and shelves (topple).
import {
  THREE, VoxGrid, FIELD, shade, mixHex, hash3, mulberry32, text, textW, glowMat, canvasTex,
  paintGradient, px, disc, skyTexture, parallaxWidth, signGrid,
  setInstance, liveInstances, swayInst, blinkInst, addPuffs, addSparkles, addFlag, fitSkyAuto,
} from './kit.js';
import { shelfGrid, checkoutGrid, makeCartCorral } from '../props/grocery.js';
import { cartGrid } from '../props/labParts.js';

const LH = FIELD.LANE_HALF;
const CEIL = 10.6;

const C = {
  tile1: 0xeef0f4, tile2: 0xe0e5ec, lane1: 0xbfcad8, lane2: 0xb2bfcf, seam: 0x8e9bb0,
  pink: 0xff2e88, pinkL: 0xff8ac0, blue: 0x29b6f6, blueD: 0x1477c9, yellow: 0xffd23f, red: 0xe8343c, green: 0x5fdc4a,
  orange: 0xff8a2a, purple: 0xb05cff, white: 0xf4f6fa, ink: 0x15121f, metal: 0xb8c0cc, metalD: 0x6b7386, metalDD: 0x3d4352,
  rackBlue: 0x2a5aa8, rackOrange: 0xe8782a, cardboard: 0xc8995a, cardboardD: 0xa07842, ceil: 0x9aa4b4,
};
const PROD = [0xe8343c, 0xffd23f, 0x29b6f6, 0x5fdc4a, 0xff4fa3, 0xff8a2a, 0xb05cff, 0xffffff, 0x5ce1e6, 0x1d9bf0];

function anchor(K, name, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  K.root.add(o);
  K.hotspots[name] = o;
  return o;
}

// --------------------------------------------------------------------------- tiny canvas pixel font

const GLY = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'], G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'], M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'], 3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '##.'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'], $: ['.##', '##.', '.#.', '.##', '##.'], '!': ['#', '#', '#', '.', '#'], ' ': ['..', '..', '..', '..', '..'], '-': ['...', '...', '###', '...', '...'],
};
const ptextW = (str, s = 1) => [...str].reduce((a, ch) => a + ((GLY[ch] ?? GLY[' '])[0].length + 1) * s, -s);
function ptext(ctx, str, x, y, col, s = 1) {
  let cx = Math.round(x);
  for (const ch of str) {
    const g = GLY[ch] ?? GLY[' '];
    g.forEach((row, r) => [...row].forEach((c, i) => { if (c === '#') px(ctx, cx + i * s, Math.round(y) + r * s, s, s, col); }));
    cx += (g[0].length + 1) * s;
  }
}
const ptextC = (ctx, str, cx, y, col, s = 1) => ptext(ctx, str, cx - ptextW(str, s) / 2, y, col, s);

// --------------------------------------------------------------------------- pixel painters

/** A run of shelving seen face-on: shelf edges, colourful product facings, overstock boxes on top. */
function paintShelves(ctx, x0, w, top, ground, seed, o = {}) {
  const R = mulberry32(seed);
  const levels = o.levels ?? 4, lh = Math.floor((ground - top) / levels);
  px(ctx, x0, top, w, ground - top, o.back ?? 0xd8dee8);
  for (let l = 0; l < levels; l++) {
    const y = top + l * lh;
    for (let x = x0 + 1; x < x0 + w - 1;) {
      const pw = 1 + Math.floor(R() * 3), ph = Math.max(1, lh - 2 - Math.floor(R() * 2));
      const c = PROD[Math.floor(R() * PROD.length)];
      if (R() > 0.08) { px(ctx, x, y + lh - 1 - ph, pw, ph, c); px(ctx, x, y + lh - 1 - ph, pw, 1, shade(c, 0.25)); }
      x += pw;
    }
    px(ctx, x0, y + lh - 1, w, 1, o.edge ?? 0xe8343c);
  }
  px(ctx, x0, top, 1, ground - top, 0xa8b0bc);
  px(ctx, x0 + w - 1, top, 1, ground - top, 0x8a94a4);
  px(ctx, x0, top - 2, w, 2, o.cap ?? C.blue);
}
/** Warehouse pallet racking with cardboard boxes (top stock). */
function paintRacking(ctx, x0, w, y0, y1, seed) {
  const R = mulberry32(seed);
  for (let y = y1; y > y0; y -= 7) {
    for (let x = x0 + 2; x < x0 + w - 2;) {
      const bw = 3 + Math.floor(R() * 4), bh = 2 + Math.floor(R() * 3);
      if (R() < 0.85) { px(ctx, x, y - bh - 1, bw, bh, R() < 0.2 ? PROD[Math.floor(R() * PROD.length)] : C.cardboard); px(ctx, x, y - bh - 1, bw, 1, shade(C.cardboard, 0.2)); px(ctx, x + Math.floor(bw / 2), y - bh - 1, 1, bh, C.cardboardD); }
      x += bw + 1;
    }
    px(ctx, x0, y - 1, w, 1, C.rackOrange);
  }
  for (let x = x0; x < x0 + w; x += 14) px(ctx, x, y0, 1, y1 - y0, C.rackBlue);
}
function paintSign(ctx, cx, y, label, bg, fg, s = 1) {
  const w = ptextW(label, s) + 6 * s, h = 5 * s + 4 * s;
  px(ctx, Math.round(cx - w / 2), y, w, h, bg);
  px(ctx, Math.round(cx - w / 2), y + h - 1, w, 1, shade(bg, -0.3));
  ptextC(ctx, label, cx, y + 2 * s, fg, s);
  return h;
}
function paintTV(ctx, x, y, w, h, seed) {
  const R = mulberry32(seed);
  px(ctx, x - 1, y - 1, w + 2, h + 2, 0x15121f);
  const k = Math.floor(R() * 4);
  if (k === 0) { px(ctx, x, y, w, h, 0x29b6f6); disc(ctx, x + w / 2, y + h / 2, Math.floor(h / 3), 0xff4fa3); }
  else if (k === 1) { const cols = [0xffffff, 0xffd23f, 0x5ce1e6, 0x5fdc4a, 0xff4fa3, 0xe8343c, 0x1d9bf0]; for (let i = 0; i < w; i++) px(ctx, x + i, y, 1, h, cols[Math.floor((i / w) * cols.length)]); }
  else if (k === 2) { px(ctx, x, y, w, h, 0xffd23f); px(ctx, x + 1, y + Math.floor(h / 2), w - 2, 1, 0xe8343c); }
  else { px(ctx, x, y, w, h, 0x15121f); px(ctx, x + 1, y + 1, w - 2, h - 2, 0x2a1a3a); px(ctx, x + 2, y + 2, Math.max(1, w - 4), 1, 0xff4fa3); }
}

// --------------------------------------------------------------------------- voxel props

/** Double-sided aisle gondola running along -z (0.25 scale): endcap faces +z. */
const aisleGrid = (L, seed, lod = 0) => () => {
  const g = new VoxGrid();
  const H = 12, run = lod ? 6 : 3;
  const cap = [C.blue, C.pink, C.yellow, C.green, C.orange][seed % 5];
  for (let z = 0; z > -L; z--) {
    g.box(-3, 0, z, 2, 0, z, C.metalDD);
    g.box(-1, 1, z, 0, H, z, 0xd0d6e0); // spine
    for (const lv of [1, 4, 7, 10]) {
      g.set(-3, lv, z, 0xe8ecf2).set(-2, lv, z, 0xe8ecf2).set(1, lv, z, 0xe8ecf2).set(2, lv, z, 0xe8ecf2);
      for (const [x, side] of [[-3, 0], [2, 1]]) {
        const zr = Math.floor(z / run);
        const h = hash3(zr, lv, seed * 3 + side);
        if (!lod && h < 0.07) continue;
        const c = PROD[Math.floor(hash3(zr, lv + side, seed) * PROD.length)];
        g.set(x, lv + 1, z, c);
        if (lod || h > 0.3) g.set(x, lv + 2, z, c);
        g.set(x === -3 ? -2 : 1, lv + 1, z, shade(c, -0.15));
      }
      g.set(-4, lv, z, C.yellow).set(3, lv, z, C.yellow); // price strips
    }
    if (hash3(z >> 2, 1, seed) < 0.6) g.box(-3, H + 1, z, 2, H + 1 + (hash3(z >> 2, 2, seed) < 0.5 ? 1 : 0), z, (x, y) => (y === H + 1 ? C.cardboard : C.cardboardD));
  }
  // endcap promo display facing +z
  g.box(-4, 0, 1, 3, 0, 2, C.metalDD);
  for (const lv of [1, 4, 7, 10]) {
    g.box(-4, lv, 1, 3, lv, 2, 0xe8ecf2);
    for (let x = -4; x <= 3; x++) g.box(x, lv + 1, 1, x, lv + 2, 2, x % 2 ? cap : shade(cap, -0.2));
    g.box(-4, lv, 3, 3, lv, 3, C.red);
  }
  g.box(-4, H + 1, 1, 3, H + 3, 2, cap);
  g.box(-3, H + 2, 3, 2, H + 2, 3, 0xffffff);
  return g;
};

/** Breakable gondola shelf (0.1 scale), faces +z. */
const brkShelfGrid = (seed) => () => {
  const g = shelfGrid(18, 'mixed', seed, { h: 17, top: [C.pink, C.yellow, C.blue][seed % 3], levels: [2, 7, 12] });
  g.box(-9, 19, 0, 8, 22, 0, C.yellow);
  text(g, 'SALE', 0, 19, 1, '+z', C.red, { center: true });
  return g;
};
/** Shopping cart (0.1 scale) with wheels merged in (for the breakable). */
const brkCartGrid = (full) => () => {
  const g = cartGrid({ full, accent: full ? C.pink : C.red });
  for (const x of [-4, 5]) for (const z of [-2, 2]) g.box(x - 1, 0, z, x, 0, z, C.ink);
  return g;
};
/** Pallet of soda cases (0.1 scale). */
const sodaPalletGrid = () => {
  const g = new VoxGrid();
  g.box(-8, 0, -6, 7, 1, 5, (x, y) => (y === 0 && (x + 8) % 5 === 2 ? null : C.cardboardD));
  for (let y = 2; y < 14; y += 3) for (let x = -8; x < 8; x += 4) for (let z = -6; z < 6; z += 4) {
    const c = [C.red, C.blue, C.green, C.orange][Math.floor(hash3(x, y, z) * 4)];
    if (y > 10 && hash3(z, x, 3) < 0.4) continue;
    g.box(x, y, z, x + 3, y + 2, z + 3, c);
    g.box(x, y + 2, z, x + 3, y + 2, z + 3, shade(c, 0.2));
    g.box(x + 1, y + 1, z + 4 > 5 ? z + 3 : z + 3, x + 2, y + 1, z + 3, 0xffffff);
  }
  return g;
};

const tvWallGrid = () => {
  const g = new VoxGrid();
  const W = 88, H = 44;
  g.box(-W / 2, 0, -2, W / 2 - 1, 3, 1, C.metalDD);
  g.box(-W / 2, 4, -2, W / 2 - 1, H, -1, 0x2a2e3a);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const x0 = -W / 2 + 3 + c * 17, y0 = 6 + r * 12;
    g.box(x0, y0, 0, x0 + 15, y0 + 10, 0, 0x101018);
    g.set(x0 + 14, y0, 1, 0x5fdc4a, true);
  }
  g.box(-W / 2, H + 1, -2, W / 2 - 1, H + 9, 0, C.blueD);
  text(g, 'ELECTRONICS', 0, H + 3, 1, '+z', 0x84a0a8, { center: true, glow: true });
  for (let x = -W / 2; x < W / 2; x += 4) g.set(x, H + 9, 1, C.yellow, true);
  return g;
};

const fixtureGrid = () => {
  const g = new VoxGrid();
  g.box(0, 1, 0, 39, 2, 3, (x, y) => (y === 2 ? 0xc8d0dc : 0xe4e8ee));
  g.box(1, 0, 1, 38, 0, 2, 0x9caab8, true);
  g.box(4, 3, 1, 4, 8, 1, C.metalD).box(35, 3, 1, 35, 8, 1, C.metalD);
  return g;
};

/** Hanging aisle sign (0.1 scale): number box + category, non-glowing text. */
const AISLE_NAMES = ['SNACKS', 'DRINKS', 'CANDY', 'FRUIT', 'CEREAL', 'TOYS', 'GAMES', 'BAKERY', 'FROZEN', 'DAIRY', 'PETS'];
const aisleSignGrid = (color, n) => () => {
  const g = new VoxGrid();
  const label = AISLE_NAMES[(n - 1) % AISLE_NAMES.length];
  const W = Math.max(30, textW(label) + 16);
  g.box(-W / 2, 0, -1, W / 2 - 1, 8, 0, color);
  g.box(-W / 2, 0, -1, W / 2 - 1, 0, 0, shade(color, -0.3)).box(-W / 2, 8, -1, W / 2 - 1, 8, 0, shade(color, 0.3));
  g.box(-W / 2 + 1, 1, 1, -W / 2 + 7, 7, 1, 0xffffff);
  text(g, String(n), -W / 2 + 4, 2, 2, '+z', shade(color, -0.25), { center: true });
  text(g, label, 4, 2, 1, '+z', 0xffffff, { center: true });
  for (const x of [-W / 2 + 2, W / 2 - 3]) for (let y = 9; y <= 40; y++) g.set(x, y, 0, C.metalD);
  return g;
};

const neonGrid = (label, col) => () => {
  const g = new VoxGrid();
  text(g, label, 0, 0, 1, '+z', col, { center: true, scale: 3, glow: true });
  return g;
};

const pyramidGrid = () => {
  // promo pyramid of Feastables + soda boxes with a SALE flag
  const g = new VoxGrid();
  const cols = [0x1d9bf0, 0xff4fa3, 0xffd23f];
  for (let lv = 0; lv < 6; lv++) {
    const half = 12 - lv * 2;
    for (let x = -half; x < half; x += 4) for (let z = -6 + lv; z < 6 - lv; z += 4) {
      const c = cols[Math.floor(hash3(x, lv, z) * 3)];
      g.box(x, lv * 3, z, x + 3, lv * 3 + 2, z + 3, c);
      g.box(x + 1, lv * 3 + 1, z + 4 > 5 - lv ? z + 3 : z + 3, x + 2, lv * 3 + 1, z + 3, 0xffffff);
    }
  }
  g.box(-1, 18, -1, 0, 30, 0, C.metal);
  g.box(1, 24, 0, 12, 30, 0, C.red);
  text(g, 'SALE', 6, 25, 1, '+z', 0xffffff, { center: true });
  return g;
};

/** Hanging double-sided sale sign (0.1 scale), centred. */
const hangSignGrid = (label, bg, fg) => () => {
  const g = new VoxGrid();
  const W = textW(label, 2) + 8, H = 16;
  g.box(-W / 2, 0, -1, W / 2 - 1, H - 1, 0, bg);
  g.box(-W / 2, 0, 1, W / 2 - 1, 0, 1, shade(bg, -0.3)).box(-W / 2, H - 1, 1, W / 2 - 1, H - 1, 1, shade(bg, 0.3));
  text(g, label, 0, 3, 1, '+z', fg, { center: true, scale: 2 });
  for (const x of [-W / 2 + 3, W / 2 - 4]) g.box(x, H, 0, x, H + 30, 0, C.metalD);
  return g;
};

// --------------------------------------------------------------------------- battle

/** Giant inflatable Beast mascot balloon (round blue panther head with ears, eyes, grin and a logo sash). */
const mascotGrid = () => {
  const g = new VoxGrid();
  const R = 13;
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
    const d = Math.hypot(x / 1.05, y, z / 0.9);
    if (d > R) continue;
    let c = y > 6 && x < -3 ? 0x6ad0ff : y < -8 ? 0x1477c9 : 0x29b6f6;
    if (z > 7 && y < -1 && y > -7 && Math.abs(x) < 7 && Math.hypot(x / 7, (y + 4) / 4) < 1) c = y > -3 ? 0xffffff : 0x15121f; // grin
    if (z > 9 && y > 1 && y < 7 && (Math.abs(x - 5) < 3 || Math.abs(x + 5) < 3)) c = (y > 4 && Math.abs(Math.abs(x) - 4.5) < 1) ? 0x15121f : 0xffffff; // eyes
    g.set(x, y, z, c);
  }
  for (const sx of [-1, 1]) for (let y = 0; y < 8; y++) g.box(sx * 9 - 2 + Math.round(y * 0.3 * sx), R - 2 + y, -2, sx * 9 + 2 - Math.round(y * 0.3 * -sx) - y * 0, R - 2 + y, 2, y > 5 ? 0xff2e88 : 0x29b6f6);
  for (let x = -R - 1; x <= R + 1; x++) for (let z = -R; z <= R; z++) { const d = Math.hypot(x / 1.05, z / 0.9); if (d <= R + 0.5 && d > R - 1.5) g.set(x, -10, z, 0xff2e88); }
  return g;
};
/** Floor-scrubber robot (faces +z). */
const scrubBotGrid = () => {
  const g = new VoxGrid();
  g.box(-5, 1, -6, 4, 7, 5, (x, y) => (y === 7 ? 0xffffff : y === 4 ? 0x29b6f6 : 0xf4f6fa));
  g.box(-3, 8, -2, 2, 10, 3, 0xd8dee8).box(-2, 9, 4, 1, 9, 4, 0x6fd8ff, true);
  g.box(-6, 0, -4, -6, 2, -1, 0x22222c).box(5, 0, -4, 5, 2, -1, 0x22222c);
  g.set(0, 11, 0, 0xffd23f, true);
  text(g, 'BEAST', 0, 2, 6, '+z', 0xff2e88, { center: true });
  return g;
};

export function buildBattle(K) {
  // ---- "sky" fallback: the store's far interior (ceiling + back wall) in case anything peeks through
  const sky = skyTexture('mart', [[0, 0x6a7486], [0.3, 0x9aa4b4], [0.38, 0xe4e8ee], [1, 0xdfe4ec]], (ctx, w, h) => {
    for (let y = 4; y < h * 0.32; y += 5) px(ctx, 0, y, w, 1, 0xd8e4f0);
  });
  fitSkyAuto(K, sky);

  // ---- parallax: ever deeper aisles and the back wall of the megastore
  const w1 = parallaxWidth(-160);
  K.parallax('backWall', {
    z: -160, y: -4, w: w1, h: 18, tw: Math.round(w1 * 2), th: 36,
    paint: (ctx, w, h) => {
      const ground = Math.round(h * (14 / 18));
      paintGradient(ctx, 0, 0, w, ground, [[0, 0xb8c0cc], [1, 0xe8ecf0]], { bands: 4 });
      paintRacking(ctx, 0, w, 2, ground - 9, 7);
      const depts = [['GROCERY', C.green], ['ELECTRONICS', C.blueD], ['TOYS', C.orange], ['HOME', C.purple], ['BEAST MART', C.pink], ['DELI', C.red], ['GAMES', C.blueD]];
      for (let i = 0; i < 16; i++) { const [l, c] = depts[i % depts.length]; paintSign(ctx, (i + 0.5) * (w / 16), 3, l, c, 0xffffff); }
      paintGradient(ctx, 0, ground, w, h - ground, [[0, 0xd8dee6], [1, 0xc8d0da]], { bands: 2 });
      for (let x = 0; x < w; x += 22) paintShelves(ctx, x, 20, ground - 8, ground, x + 3, { cap: [C.blue, C.pink, C.yellow, C.green][(x / 22) % 4] });
    },
  });
  const w2 = parallaxWidth(-110);
  K.parallax('deepAisles', {
    z: -110, y: -4, w: w2, h: 15, tw: Math.round(w2 * 2.6), th: 39,
    paint: (ctx, w, h) => {
      const ground = Math.round(h * (11 / 15));
      const R = mulberry32(5);
      let x = 2;
      let i = 0;
      while (x < w - 10) {
        const kind = i % 5;
        if (kind === 2) {
          // electronics: TVs on a dark wall
          px(ctx, x, ground - 16, 34, 16, 0x2a2e3a);
          for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) paintTV(ctx, x + 2 + c * 8, ground - 14 + r * 7, 6, 4, i * 9 + r * 4 + c);
          paintSign(ctx, x + 17, ground - 24, 'TV', C.blueD, 0xffffff);
          x += 38;
        } else if (kind === 4) {
          // appliance boxes / fridges
          for (let k = 0; k < 4; k++) { const bh = 9 + Math.floor(R() * 5); px(ctx, x + k * 7, ground - bh, 6, bh, k % 2 ? 0xe8ecf2 : C.cardboard); px(ctx, x + k * 7 + 1, ground - bh + 1, 1, bh - 2, 0xa8b0bc); }
          x += 32;
        } else {
          paintShelves(ctx, x, 26, ground - 13, ground, i * 17 + 1, { cap: PROD[i % PROD.length] });
          paintSign(ctx, x + 13, ground - 22, String(10 + i), C.blue, 0xffffff);
          px(ctx, x + 12, 0, 1, ground - 22, 0x8a94a4);
          x += 30;
        }
        i++;
      }
      paintGradient(ctx, 0, ground, w, h - ground, [[0, 0xe2e6ec], [1, 0xd6dce4]], { bands: 2 });
    },
  });
  const w3 = parallaxWidth(-70);
  K.parallax('nearAisles', {
    z: -70, y: -3, w: w3, h: 12, tw: Math.round(w3 * 3.4), th: 41,
    paint: (ctx, w, h) => {
      const ground = Math.round(h * (9 / 12));
      const R = mulberry32(11);
      let x = 0, i = 0;
      while (x < w - 10) {
        const sw = 30 + Math.floor(R() * 10);
        paintShelves(ctx, x, sw, ground - 20, ground, i * 31 + 7, { cap: PROD[(i * 3) % PROD.length], levels: 5 });
        paintRacking(ctx, x, sw, ground - 30, ground - 22, i + 40);
        if (i % 3 === 1) paintSign(ctx, x + sw / 2, ground - 28, 'SALE', C.yellow, C.red);
        if (i % 3 === 2) paintSign(ctx, x + sw / 2, ground - 28, '50% OFF', C.red, 0xffffff);
        x += sw + 6;
        // aisle gap with balloons
        if (R() < 0.5) for (let b = 0; b < 3; b++) { const bx = x - 3 + (b - 1) * 2, by = ground - 18 - b * 2; px(ctx, bx, by + 3, 1, 8, 0xd8d8d8); disc(ctx, bx, by, 2, PROD[(i + b) % 7]); }
        i++;
      }
      paintGradient(ctx, 0, ground, w, h - ground, [[0, 0xe6eaf0], [1, 0xdce2ea]], { bands: 2 });
    },
  });

  // ---- floor: polished vinyl tiles; the ceiling: metal deck with skylight panels
  {
    const tex = canvasTex('mart_floor2', 128, 128, (ctx, w, h) => {
      const R = mulberry32(3);
      for (let ty = 0; ty < 16; ty++) for (let tx = 0; tx < 16; tx++) {
        const acc = R();
        const c = acc < 0.015 ? 0xffe0ee : acc < 0.03 ? 0xdcf2ff : (tx + ty) & 1 ? C.tile1 : C.tile2;
        px(ctx, tx * 8, ty * 8, 8, 8, c);
        px(ctx, tx * 8, ty * 8, 8, 1, shade(c, -0.05));
        px(ctx, tx * 8, ty * 8, 1, 8, shade(c, -0.05));
        for (let k = 0; k < 3; k++) px(ctx, tx * 8 + 1 + Math.floor(R() * 6), ty * 8 + 1 + Math.floor(R() * 6), 1, 1, shade(c, R() < 0.5 ? -0.06 : 0.04));
        if (R() < 0.15) px(ctx, tx * 8 + 2, ty * 8 + 1, 3, 1, 0xffffff); // polish glint
      }
    }, { repeatX: true });
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(240 / 16, 130 / 16);
    tex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 130), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.02, -21);
    floor.receiveShadow = true;
    floor.name = 'floor';
    K.add(floor);
  }
  {
    const tex = canvasTex('mart_ceiling', 32, 32, (ctx, w, h) => {
      px(ctx, 0, 0, w, h, 0x8a94a6);
      for (let y = 0; y < h; y += 4) px(ctx, 0, y, w, 1, 0x7a8496);
      px(ctx, 0, 0, w, 2, 0x5d6476);
      px(ctx, 0, 0, 2, h, 0x6b7386);
      px(ctx, 10, 12, 12, 8, 0xa4aec0);
      px(ctx, 11, 13, 10, 6, 0xb8c2d2);
    }, { repeatX: true });
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(240 / 6, 200 / 6);
    tex.needsUpdate = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(240, 200), new THREE.MeshBasicMaterial({ map: tex, color: 0xd8dce4 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, CEIL, -70);
    ceil.name = 'ceiling';
    K.add(ceil);
    // roof joists + a silver HVAC duct
    const joists = [];
    for (let z = 14; z > -150; z -= 8) joists.push([0, CEIL - 0.35, z]);
    K.inst('joist', () => new VoxGrid().box(-120, 0, 0, 119, 1, 0, C.metalD), { scale: 0.18, pivot: [0, 0, 0] }, joists);
    K.mesh('duct', () => {
      const g = new VoxGrid();
      g.cylinder(0, 0, -150, 150, 3, (x, y, z) => (Math.abs(z) % 12 === 0 ? 0x9aa2b0 : 0xc8ced8), 'x');
      return g;
    }, { scale: 0.12, pivot: [0, 0, 0] }, 0, CEIL - 0.9, -22);
  }
  // fluorescent light strips (one flickers)
  {
    const fx = [];
    for (const z of [-3, -9, -15, -21, -27, -33, -40, -48, -56, -66]) for (let x = -54; x <= 50; x += 6) fx.push([x + ((z / 3) & 1 ? 1.5 : 0), CEIL - 1.25, z]);
    K.inst('fixture', fixtureGrid, { scale: 0.1, pivot: [0, 0, 0] }, fx);
    const bad = K.mesh('fixtureBad', () => new VoxGrid().box(1, 0, 1, 38, 0, 2, 0x9caab8, true), { scale: 0.1, pivot: [0, 0, 0] }, 4.6, CEIL - 1.26, -14.99);
    K.onUpdate((dt, t) => { const k = t % 5; bad.visible = !(k > 3.6 && (Math.floor(t * 23) % 3 === 0)); });
  }

  // ---- the lane: the store's main aisle in cool grey tiles with brand-stripe edges
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 2, side: C.metalD, jitter: 0.02,
    color: (ix, iz) => {
      const z = (iz + 0.5) * 0.25, az = Math.abs(z);
      if (az > 2.25) return ((ix >> 1) & 1) ? C.pink : C.white;
      if (az > 2.0) return C.yellow;
      const u = ((ix % 4) + 4) % 4, v = (((iz + 8) % 4) + 4) % 4;
      if (u === 0 || v === 0) return C.seam;
      const t = (Math.floor(ix / 4) + Math.floor((iz + 8) / 4)) & 1;
      return t ? C.lane1 : C.lane2;
    },
  });
  // centre marker: a pink price-tag decal
  K.mesh('centerTag', () => {
    const g = new VoxGrid();
    for (let x = -5; x < 6; x++) for (let z = -3; z < 3; z++) {
      if (x > 2 && Math.abs(z + 0.5) > 5 - x) continue;
      g.set(x, 0, z, C.pink);
    }
    g.set(3, 1, -1, C.white).set(3, 1, 0, C.white);
    const S = ['.##', '##.', '.#.', '.##', '##.'];
    S.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(c - 3, 1, r - 3, C.white); }));
    return g;
  }, { scale: 0.18, pivot: [0, 0, 0] }, 0, -0.17, 1.4);

  // ---- breakables behind the lane: carts (tumble!), shelves (topple + spill), a soda pallet
  K.breakable('shelf', 'shelf0', brkShelfGrid(0), { scale: 0.1 }, -16.4, -3.3, 0, 1);
  K.breakable('cart', 'cartFull', brkCartGrid(true), { scale: 0.1 }, -9.6, -3.2, 0.25);
  K.breakable('cart', 'cartEmpty', brkCartGrid(false), { scale: 0.1 }, -3.2, -3.2, -0.3);
  K.breakable('shelf', 'shelf1', brkShelfGrid(1), { scale: 0.1 }, 3.8, -3.3, 0, 1);
  K.breakable('cart', 'cartFull', brkCartGrid(true), { scale: 0.1 }, 9.6, -3.2, Math.PI - 0.2);
  K.breakable('products', 'sodaPallet', sodaPalletGrid, { scale: 0.1 }, 16.4, -3.3, 0.1);

  // ---- front of store: checkouts with moving conveyors, a promo pyramid, the TV wall
  {
    const lanes = [[-10.8, 3], [-5.6, 4]];
    for (const [x, n] of lanes) K.mesh('checkout' + n, () => checkoutGrid(n), { scale: 0.1, ao: true }, x, 0, -7.2, 0, 1, { shadow: true });
    const kinds = [
      (c) => { const g = new VoxGrid(); g.box(-2, 0, -1, 1, 4, 1, c).box(-2, 2, 2, 1, 3, 2, 0xffffff).set(-1, 4, 2, 0xffd23f); return g; }, // cereal box
      (c) => { const g = new VoxGrid(); g.cylinder(-0.5, -0.5, 0, 3, 1.4, (x, y) => (y === 3 ? 0xd0d6e0 : y === 1 ? 0xffffff : c)); return g; }, // soda can
      (c) => { const g = new VoxGrid(); g.box(-1, 0, -1, 1, 3, 1, 0xf4f6fa).box(-1, 1, 2, 1, 2, 2, c).box(0, 4, 0, 0, 4, 0, c); return g; }, // milk jug
      (c) => { const g = new VoxGrid(); g.box(-2, 0, -1, 1, 3, 0, c).box(-2, 4, -1, 1, 4, 0, shade(c, -0.2)).box(-1, 1, 1, 0, 2, 1, 0xffd23f); return g; }, // chips
    ];
    const items = [];
    const ims = kinds.map((fn, k) => liveInstances(K, 'checkoutItem' + k, () => fn(PROD[(k * 3 + 1) % PROD.length]), { scale: 0.06, ao: true }, 3));
    lanes.forEach(([x], li) => { for (let i = 0; i < 5; i++) items.push({ k: (i + li) % 4, x0: x - 1.1, o: i / 5 }); });
    const used = [0, 0, 0, 0];
    for (const it of items) it.slot = used[it.k]++;
    K.onUpdate((dt, t) => {
      for (const it of items) {
        const k = (t * 0.12 + it.o) % 1;
        setInstance(ims[it.k], it.slot, it.x0 + k * 1.45, 0.98, -7.26, 0.3 + it.o * 3, 0, 0, k < 0.96 ? 1 : 0.0001);
      }
      for (const im of ims) im.instanceMatrix.needsUpdate = true;
    });
  }
  K.mesh('pyramid', pyramidGrid, { scale: 0.1, ao: true }, 0.8, 0, -9.4, 0.2, 1, { shadow: true });
  // balloons bobbing over the promo
  {
    const cols = [C.pink, C.blue, C.yellow, C.green, C.purple];
    const balloons = cols.map((c, i) => K.mesh('vballoon' + i, () => {
      const g = new VoxGrid();
      g.ellipsoid(0, 16, 0, 3.4, 4.2, 3.4, (x, y, z) => (x < -1 && y > 17 ? shade(c, 0.35) : y < 13 ? shade(c, -0.15) : c));
      g.set(0, 11, 0, shade(c, -0.25)).set(-1, 11, 0, shade(c, -0.25));
      for (let y = 0; y < 11; y++) g.set(Math.round(Math.sin(y * 0.6) * 0.6), y, 0, 0xd8d8e0);
      return g;
    }, { scale: 0.075, pivot: [0, 0, 0] }, 0, 0, 0));
    K.onUpdate((dt, t) => {
      for (let i = 0; i < 5; i++) {
        const b = balloons[i];
        b.position.set(-1.2 + i * 0.55 + Math.sin(t * 0.9 + i * 1.3) * 0.08, 2.4 + (i % 2) * 0.35 + Math.sin(t * 1.3 + i * 1.3) * 0.12, -9.6);
        b.rotation.z = Math.sin(t * 0.9 + i * 1.3) * 0.08;
      }
    });
  }
  // TV wall with animated screens
  {
    const TX = 9.2, TZ = -12.6;
    K.mesh('tvWall', tvWallGrid, { scale: 0.1 }, TX, 0, TZ, -0.12, 1, { shadow: true });
    const frames = [0, 1, 2, 3].map((f) => canvasTex('mart_tv' + f, 32, 18, (ctx, w, h) => {
      if (f === 0) { px(ctx, 0, 0, w, h, 0x29b6f6); disc(ctx, 16, 10, 6, 0xff8ac0); px(ctx, 12, 8, 2, 2, 0x15121f); px(ctx, 18, 8, 2, 2, 0x15121f); px(ctx, 13, 12, 6, 1, 0x15121f); px(ctx, 10, 3, 3, 3, 0xff8ac0); px(ctx, 19, 3, 3, 3, 0xff8ac0); }
      else if (f === 1) { px(ctx, 0, 0, w, h, 0xffd23f); ptextC(ctx, 'SALE', 16, 4, 0xe8343c, 2); }
      else if (f === 2) { const cols = [0xffffff, 0xffd23f, 0x5ce1e6, 0x5fdc4a, 0xff4fa3, 0xe8343c, 0x1d9bf0, 0x15121f]; for (let i = 0; i < w; i++) px(ctx, i, 0, 1, h - 4, cols[Math.floor((i / w) * cols.length)]); px(ctx, 0, h - 4, w, 4, 0x2a2a36); }
      else { px(ctx, 0, 0, w, h, 0x15121f); ptextC(ctx, 'BEAST', 16, 3, 0xff4fa3, 1); ptextC(ctx, '$1', 16, 10, 0x5fdc4a, 1); }
    }, { mip: false }));
    const mats = [new THREE.MeshBasicMaterial({ map: frames[0], toneMapped: false }), new THREE.MeshBasicMaterial({ map: frames[2], toneMapped: false })];
    const geo = new THREE.PlaneGeometry(1.4, 0.88);
    const grp = new THREE.Group();
    grp.position.set(TX, 0, TZ);
    grp.rotation.y = -0.12;
    K.add(grp);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const m = new THREE.Mesh(geo, mats[(r + c) & 1]);
      m.position.set((-44 + 3 + c * 17 + 8) * 0.1, (6 + r * 12 + 5.5) * 0.1, 0.115);
      grp.add(m);
    }
    K.onUpdate((dt, t) => { const k = Math.floor(t / 1.1); mats[0].map = frames[k % 4]; mats[1].map = frames[(k + 2) % 4]; });
  }

  // ---- the aisles receding into the store, with hanging aisle signs
  const aisleXs = [-27, -21, -15, -9, -3, 3, 15, 21, 27];
  aisleXs.forEach((x, i) => K.mesh('aisle' + (i % 5), aisleGrid(72, i % 5), { scale: 0.25, pivot: [0, 0, 0] }, x, 0, -16, 0, 1, { shadow: false }));
  for (const [i, x] of [-30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30].entries()) K.mesh('aisleFar' + (i % 3), aisleGrid(64, i % 3 + 5, 1), { scale: 0.25, pivot: [0, 0, 0] }, x, 0, -40, 0, 1, { shadow: false });
  aisleXs.forEach((x, i) => {
    const s = K.mesh('aisleSign' + i, aisleSignGrid([C.blue, C.pink, C.green, C.orange, C.purple][i % 5], i + 1), { scale: 0.1 }, x, 5.0, -15.6, 0, 1);
    s.userData.ph = i;
  });
  // hanging sale signs (gently swaying)
  const hangs = [];
  for (const [x, z, label, bg, fg] of [[-13, -10, 'SALE!', C.yellow, C.red], [15, -21, '50% OFF', C.red, 0xffffff], [-21, -25, 'BUY 1 GET 1', C.pink, 0xffffff]]) {
    const m = K.mesh('hang_' + label + bg, hangSignGrid(label, bg, fg), { scale: 0.1, pivot: [0, 46, 0] }, x, CEIL - 0.6, z, 0, 1);
    m.userData.ph = x;
    hangs.push(m);
  }
  K.onUpdate((dt, t) => { for (const m of hangs) m.rotation.y = Math.sin(t * 0.6 + m.userData.ph) * 0.25; });

  // ---- neon BEAST MART sign hung high over the aisles (MART flickers)
  {
    const NZ = -44;
    K.mesh('neonBoard', () => {
      const g = new VoxGrid();
      const W = textW('BEAST MART', 3) + 14, H = 5 * 3 + 10;
      g.box(-W / 2, 0, -1, W / 2 - 1, H - 1, 0, 0x1a1626);
      for (let x = -W / 2; x < W / 2; x++) { g.set(x, 1, 1, C.blue, true); g.set(x, H - 2, 1, C.blue, true); }
      for (let y = 1; y < H - 1; y++) { g.set(-W / 2 + 1, y, 1, C.blue, true); g.set(W / 2 - 2, y, 1, C.blue, true); }
      for (const x of [-W / 2 + 10, W / 2 - 11]) g.box(x, H, -1, x, H + 20, -1, C.metalD);
      return g;
    }, { scale: 0.12, pivot: [0, 0, 0] }, 0, 7.3, NZ);
    const wB = textW('BEAST ', 3);
    const full = textW('BEAST MART', 3);
    const beast = K.mesh('neonBeast', neonGrid('BEAST', 0xa82060), { scale: 0.12, pivot: [0, 0, 0] }, (-full / 2 + textW('BEAST', 3) / 2) * 0.12, 7.3 + 5 * 0.12, NZ + 0.02);
    const mart = K.mesh('neonMart', neonGrid('MART', 0xa82060), { scale: 0.12, pivot: [0, 0, 0] }, (-full / 2 + wB + textW('MART', 3) / 2) * 0.12, 7.3 + 5 * 0.12, NZ + 0.02);
    void beast;
    K.onUpdate((dt, t) => { const k = t % 7; mart.visible = !(k > 5 && k < 5.9 && Math.sin(t * 61) > 0.1); });
  }

  // ---- foreground (low!): dropped groceries, a basket, floor decals
  const drops = [];
  for (let i = 0; i < 22; i++) drops.push([K.rand(-26, 26), 0, K.rand(LH + 1, 11), K.rand(0, 6), K.rand(0.8, 1.2)]);
  for (let v = 0; v < 4; v++) K.inst('dropped' + v, () => {
    const g = new VoxGrid();
    const c = PROD[v * 2];
    if (v === 0) g.box(-1, 0, -1, 1, 1, 1, C.red).set(0, 2, 0, 0x6a4a2a); // apple
    else if (v === 1) g.box(-2, 0, 0, 1, 1, 1, c).box(-2, 1, 0, -2, 1, 1, 0xffffff); // can on its side
    else if (v === 2) g.box(-2, 0, -1, 2, 0, 1, C.yellow).set(-3, 0, 0, 0x6a5a2a); // banana-ish
    else g.box(-2, 0, -2, 1, 0, 1, 0xffffff).box(-1, 1, -1, 0, 1, 0, C.pink); // price tag
    return g;
  }, { scale: 0.08, ao: true }, drops.filter((_, i) => i % 4 === v), { receive: false });
  K.inst('basket', () => {
    const g = new VoxGrid();
    for (let y = 0; y < 4; y++) for (let x = -4; x <= 3; x++) for (let z = -3; z <= 2; z++) {
      const edge = x === -4 || x === 3 || z === -3 || z === 2 || y === 0;
      if (edge && ((x + y + z) & 1 || y === 0 || y === 3)) g.set(x, y, z, C.red);
    }
    g.box(-1, 4, -3, 0, 5, -3, C.ink).box(-1, 4, 2, 0, 5, 2, C.ink);
    g.box(-3, 1, -2, -2, 2, -1, C.yellow).box(1, 1, 0, 2, 3, 1, C.blue);
    return g;
  }, { scale: 0.08, ao: true }, [[-7.4, 0, 4.2, 0.4], [13.2, 0, 5.6, -0.6]], { receive: false });


  // ---- postcard extras: the giant inflatable Beast mascot, hanging promo banners, a floor-scrubber bot, a delivery drone
  {
    const mascot = K.mesh('mascot', mascotGrid, { scale: 0.1, pivot: 'center' }, -17, 7.4, -26);
    K.inst('mascotTether', () => new VoxGrid().box(0, 0, 0, 0, 30, 0, 0x8a94a6), { scale: 0.1 }, [[-18.4, 8.2, -26], [-15.6, 8.2, -26]]);
    K.onUpdate((dt, t) => { mascot.rotation.y = Math.sin(t * 0.25) * 0.5; mascot.position.y = 7.4 + Math.sin(t * 0.8) * 0.12; mascot.rotation.z = Math.sin(t * 0.6) * 0.04; });
  }
  {
    const pats = [
      (u, v) => (v < 2 || v > 13 ? C.yellow : u === 0 || u === 7 ? C.yellow : C.red),
      (u, v) => (v < 2 || v > 13 ? C.white : (u + v) % 4 < 2 ? C.blue : C.blueD),
      (u, v) => (v < 2 || v > 13 ? C.white : C.pink),
    ];
    const spots = [[-17.5, -18, 0], [-6.2, -22, 1], [6.2, -22, 2], [17.5, -18, 1], [-12, -30, 2], [12, -30, 0]];
    spots.forEach(([x, z, k], i) => {
      addFlag(K, { id: 'banner' + i, x, y: 8.4, z, ry: 0, w: 8, h: 16, vox: 0.12, pattern: pats[k], pole: false, speed: 1.4, amp: 0.05, phase: i });
    });
  }
  {
    const bot = K.mesh('scrubBot', scrubBotGrid, { scale: 0.07, ao: true }, 0, 0, -11.6, 0, 1, { shadow: true });
    const brush = K.mesh('scrubBrush', () => new VoxGrid().box(-5, 0, -5, 4, 0, 4, (x, z) => ((x + z) & 1 ? 0xffd23f : 0xff8a2a)), { scale: 0.07, pivot: 'center' }, 0, 0.04, -11.6);
    K.onUpdate((dt, t) => {
      const k = (t * 0.035) % 2, dir = k < 1 ? 1 : -1, u = k < 1 ? k : 2 - k;
      const x = -24 + u * 48;
      bot.position.x = x; brush.position.x = x + dir * 0.45;
      bot.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      brush.rotation.y = t * 9;
    });
    addSparkles(K, { id: 'floorShine', n: 14, area: [-24, 24, 0.02, 0.04, -12.4, -10.8], color: 0xffffff, scale: 0.06, rate: 0.8, sharp: 5, seed: 7 });
  }
  {
    const drone = new THREE.Group();
    K.mesh('delDrone', () => {
      const g = new VoxGrid();
      g.box(-3, 0, -3, 2, 1, 2, 0xffd23f).box(-2, -4, -2, 1, -1, 1, C.cardboard).box(-2, -3, 2, 1, -2, 2, C.pink);
      for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) { g.line(x < 0 ? -3 : 2, 1, z < 0 ? -3 : 2, x, 1, z, 0x3d4352); g.box(x - 2, 2, z, x + 2, 2, z, 0x3d4352); }
      g.set(-6, 0, 5, 0xff3060, true).set(5, 0, 5, 0x30ff80, true);
      return g;
    }, { scale: 0.07, pivot: [0, 0, 0], ao: true }, 0, 0, 0, 0, 1, { parent: drone });
    K.add(drone);
    K.onUpdate((dt, t) => {
      const k = (t * 0.05) % 1;
      drone.position.set(-30 + k * 60, 5.6 + Math.sin(t * 2) * 0.12, -14 + Math.sin(k * Math.PI * 2) * 2);
      drone.rotation.y = Math.PI / 2 + Math.sin(t) * 0.1;
    });
  }
  {
    // grand-opening bunting garlands strung across the store, fluttering in the AC draft
    const cols = [C.pink, C.yellow, C.blue, C.green, C.orange, C.purple];
    const pens = cols.map(() => []), line = [];
    for (const [z, y0] of [[-13.5, 7.0], [-21.5, 7.4], [-29.5, 7.7]]) for (let i = 0; i <= 120; i++) {
      const u = i / 120, x = -30 + 60 * u, y = y0 - Math.abs(Math.sin(u * Math.PI * 5)) * 0.7;
      line.push([x, y, z, 0, [10, 1, 1]]);
      if (i % 2 === 0) pens[(i / 2) % cols.length].push([x, y - 0.04, z, 0, 1]);
    }
    K.inst('martBuntLine', () => new VoxGrid().set(0, 0, 0, 0xf4f6fa), { scale: 0.05, pivot: 'center' }, line);
    cols.forEach((c, k) => swayInst(K, 'martPennant' + k, () => { const g = new VoxGrid(); for (let y = 0; y < 5; y++) g.box(-2 + Math.floor(y / 2), -y, 0, 2 - Math.floor(y / 2), -y, 0, y === 0 ? 0xffffff : c); return g; }, { scale: 0.08, pivot: [0, 0, 0] }, pens[k], { amp: 0.2, speed: 2.4 }));
  }
  blinkInst(K, 'openSign', () => {
    const g = new VoxGrid();
    text(g, 'OPEN 24/7', 0, 0, 0, '+z', 0xff4fa3, { center: true, glow: true });
    return g;
  }, { scale: 0.09 }, [[-14.2, 4.2, -22.6]], { groups: 1, mode: 'twinkle', rate: 0.3, duty: -0.85 });
  K.mesh('openBoard', () => new VoxGrid().box(-18, -2, 0, 17, 6, 0, 0x1a1626), { scale: 0.09, pivot: [0, 0, 0] }, -14.2, 4.2, -22.75);

  return {
    sky,
    fog: { color: 0xe4e8f0, near: 50, far: 160 },
    lights: { sky: 0xf4f8ff, ground: 0xb8bcc4, hemi: 1.45, sun: 1.7, sunColor: 0xf4f8ff, dir: [-2, 18, 8], rim: 0.7, rimColor: 0xd8e8ff },
    dust: 0xdedad0,
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // the store (front facade + body) at the back of a parking-lot plinth with carts
  K.mesh('zoneBase', () => {
    const g = new VoxGrid();
    const R = 27.5;
    for (let x = -28; x <= 27; x++) for (let z = -28; z <= 27; z++) {
      const d = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)) * 0.85 + Math.hypot(x + 0.5, z + 0.5) * 0.15;
      if (d > R - 2) continue;
      const sidewalk = z < -9;
      const line = !sidewalk && (x + 28) % 9 === 0 && z > -6 && z < 12;
      const top = sidewalk ? ((x + z) & 1 ? 0xdcd8d0 : 0xd0ccc4) : line ? 0xf4f4f4 : hash3(x, 1, z) < 0.12 ? 0x4a4e5a : 0x3e424e;
      g.set(x, 0, z, d > R - 3 ? 0x9a9a9a : top);
      g.set(x, -1, z, 0x8a8a8a);
      g.set(x, -2, z, 0x6a5a4a);
      if (d < R - 3.5) g.set(x, -3, z, 0x5a4a3a);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 1, 0] }, 0, 0, 0);
  // store body + roof units + glowing front
  K.mesh('storeBody', () => {
    const g = new VoxGrid();
    g.box(-30, 0, -19, 29, 13, 0, (x, y, z) => (y === 13 ? 0xc8ccd4 : (x === -30 || x === 29) && (z + 19) % 6 === 0 ? 0xd0d6de : 0xe8ecf2));
    g.box(-31, 14, -20, 30, 14, 1, 0xff2e88);
    g.box(-30, 15, -19, 29, 15, 0, null);
    for (const [x, z] of [[-20, -12], [-6, -15], [14, -10]]) g.box(x, 14, z, x + 5, 16, z + 3, 0x9aa2b0).box(x + 1, 17, z + 1, x + 4, 17, z + 2, 0x6b7386);
    return g;
  }, { scale: 0.13 }, 0, 0, -4.87);
  K.mesh('storeFront', () => {
    // compact BEAST MART facade (windows of products, doors, striped awning, sign)
    const g = new VoxGrid();
    const W = 58;
    g.box(-W / 2, 0, -1, W / 2 - 1, 26, 0, (x, y) => (y < 2 ? C.red : y > 20 ? 0xf4f6fa : 0xf4f6fa));
    for (let x = -W / 2; x < W / 2; x++) g.box(x, 18, 1, x, 19, 1, [C.pink, C.yellow, C.blue, C.green][Math.floor((x + 40) / 3) % 4]);
    for (const [x0, x1] of [[-27, -7], [6, 26]]) {
      g.box(x0, 4, 0, x1, 16, 0, (x, y) => ((y - 4) % 4 === 0 ? 0xd8e2ec : mixHex(PROD[Math.floor(hash3(x >> 1, y >> 2, 3) * PROD.length)], 0xffffff, 0.35)));
      g.box(x0 - 1, 3, 1, x1 + 1, 3, 1, 0xe2e8f0);
    }
    g.box(-5, 0, 0, 4, 15, 0, (x) => (x === -1 || x === 0 ? C.metal : 0xbfe4f4));
    g.box(-6, 0, 1, 5, 16, 1, C.red);
    g.box(-5, 0, 1, 4, 15, 1, null);
    g.box(-24, 21, 1, 23, 27, 1, 0xffffff);
    text(g, 'BEAST MART', 0, 22, 2, '+z', 0xa82060, { center: true, glow: true });
    return g;
  }, { scale: 0.13 }, 0, 0, -3.4, 0, 1, { shadow: true });
  // balloon arch by the doors
  {
    const bGeo = new THREE.SphereGeometry(0.2, 8, 6);
    const balloons = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 10) * Math.PI;
      const b = new THREE.Mesh(bGeo, new THREE.MeshPhongMaterial({ color: [C.pink, C.blue, C.yellow][i % 3], shininess: 80 }));
      b.userData = { x: Math.cos(a) * 1.0, y: 0.25 + Math.sin(a) * 2.1, o: i };
      K.add(b);
      balloons.push(b);
    }
    K.onUpdate((dt, t) => { for (const b of balloons) { const u = b.userData; b.position.set(u.x + Math.sin(t * 2 + u.o) * 0.02, u.y + Math.sin(t * 1.7 + u.o) * 0.04, -3.05); } });
  }
  // parking lot: carts, a sidewalk-sale shelf, a soda pallet, lamp posts
  K.mesh('zoneShelf', brkShelfGrid(2), { scale: 0.1, ao: true }, -4.3, 0, -2.5, 0.15, 1, { shadow: true, receive: false });
  K.mesh('zonePallet', sodaPalletGrid, { scale: 0.09, ao: true }, 4.4, 0, -2.5, -0.2, 1, { shadow: true, receive: false });
  K.mesh('zoneCart1', brkCartGrid(true), { scale: 0.11, ao: true }, 2.4, 0, 1.4, 0.8, 1, { shadow: true, receive: false });
  K.mesh('zoneCart2', brkCartGrid(false), { scale: 0.11, ao: true }, -1.6, 0, 3.2, -0.5, 1, { shadow: true, receive: false });
  K.inst('lampPost', () => {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 30, 0, C.metalD);
    g.box(-1, 30, -1, 6, 31, 0, C.metalD);
    g.box(4, 29, -2, 7, 29, 1, 0xfff2c0, true);
    return g;
  }, { scale: 0.1, ao: true }, [[5.7, 0, 3.0, Math.PI], [-1.6, 0, 5.6, 0]], { shadow: true });
  // tall BEAST MART pylon sign at the lot entrance
  K.mesh('pylon', () => {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 1, 34, 1, C.metalD);
    g.box(-14, 35, -2, 13, 50, 1, 0xffffff);
    g.box(-14, 35, -2, 13, 36, 1, C.pink).box(-14, 49, -2, 13, 50, 1, C.pink);
    text(g, 'BEAST', 0, 43, 2, '+z', C.pink, { center: true });
    text(g, 'MART', 0, 37, 2, '+z', C.blueD, { center: true });
    text(g, 'BEAST', 0, 43, -3, '-z', C.pink, { center: true });
    text(g, 'MART', 0, 37, -3, '-z', C.blueD, { center: true });
    g.box(-14, 51, -1, 13, 51, 0, C.yellow, true);
    return g;
  }, { scale: 0.1, ao: true }, -5.4, 0, 4.0, 0.5, 1, { shadow: true });
  // planters along the sidewalk
  K.inst('planter', () => {
    const g = new VoxGrid();
    g.box(-5, 0, -3, 4, 3, 2, 0x8a8a92);
    for (let x = -5; x <= 4; x++) for (let z = -3; z <= 2; z++) for (let y = 4; y < 4 + 2 + Math.floor(hash3(x, 2, z) * 3); y++) g.set(x, y, z, hash3(x, y, z) < 0.3 ? 0x3f9a3a : 0x5fbf4a);
    g.set(-2, 7, 0, C.pink).set(2, 6, -1, C.yellow);
    return g;
  }, { scale: 0.1, ao: true }, [[-2.6, 0, -2.0, 0], [2.8, 0, -2.0, 0]], { shadow: true, receive: false });
  // the cart corral (secret: return a stray cart) + Juan by the doors
  const corral = makeCartCorral();
  corral.position.set(-4.4, 0, 0.8);
  corral.rotation.y = 0.3;
  corral.scale.setScalar(1.15);
  K.add(corral);
  anchor(K, 'cartReturn', -4.4, 0, 0.8);
  anchor(K, 'npc', 1.3, 0, -1.4);
  anchor(K, 'boss', 1.0, 0, 4.4);
  return { focus: [0, 1.2, 0], radius: 7 };
}
