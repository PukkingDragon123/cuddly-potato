// Arena 8: LOST PYRAMID — "I Spent 100 Hours Inside The Pyramids!".
// Sandstone-tiled desert lane with a lapis & gold frieze, flickering torches,
// hieroglyph walls and obelisks, a PANTHER-headed sphinx, treasure piles, a
// palm oasis, rolling 3D dunes and a giant stepped pyramid with a golden
// capstone, under a hot peach sky over pixel dunes and distant pyramids.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, glowMat, mulberry32, bayer,
  paintGradient, px, disc, skyTexture, parallaxWidth, canvasTex, treeGrid, rockGrid,
  pixbuf, skyGlow, paintSunPx, paintCumulus, paintStreaks, paintBirdsPx, paintRange,
  setInstance, liveInstances, swayInst, blinkInst, addPuffs, addSparkles, addBirds, addFlag, voxRange,
} from './kit.js';

const C = {
  sand: 0xf2cc84, sandL: 0xfadc9e, sandD: 0xdcae66, sandDD: 0xc08e4e, ripple: 0xe6bc74,
  stone: 0xe2b472, stoneL: 0xf0c88a, stoneD: 0xc89a5a, stoneDD: 0xa07440, tile: 0xe8c48a, tile2: 0xdcb47a, seam: 0xb88a52,
  gold: 0xffc21a, goldL: 0xffe680, goldD: 0xc8901a, goldDD: 0x8a5c10, lapis: 0x2a4aa8, lapisD: 0x1a2e70, turq: 0x2ab8c8, turqL: 0x7ae8f0,
  red: 0xc8442a, ink: 0x2a1a10, bronze: 0x9a6a3a, bronzeD: 0x6a4424, clay: 0xc0683a, clayD: 0x8a4422, wood: 0x8a5a30, woodD: 0x5a3818,
  palm: 0x4aa83a, palmD: 0x2f7a2a, water: 0x2ac0d0, basalt: 0x2f2a38, basalt2: 0x463f52, pink: 0xff6fa0,
};
const LH = FIELD.LANE_HALF;

// --------------------------------------------------------------------------- helpers

function pixels(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  return {
    set(x, y, hex, a = 1) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      if (a >= 1 || d[i + 3] === 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(255 * Math.min(1, a)); return; }
      d[i] = d[i] * (1 - a) + r * a; d[i + 1] = d[i + 1] * (1 - a) + g * a; d[i + 2] = d[i + 2] * (1 - a) + b * a;
    },
    flush() { ctx.putImageData(img, 0, 0); },
  };
}
const _D = new THREE.Object3D();
_D.rotation.order = 'YXZ';
function setInst(im, i, x, y, z, ry = 0, rx = 0, rz = 0, s = 1) {
  _D.position.set(x, y, z);
  _D.rotation.set(rx, ry, rz);
  if (Array.isArray(s)) _D.scale.set(s[0], s[1], s[2]); else _D.scale.setScalar(s);
  _D.updateMatrix();
  im.setMatrixAt(i, _D.matrix);
}
function liveInst(K, id, gridFn, opts, n, o = {}) {
  const im = K.inst(id, gridFn, opts, Array.from({ length: n }, () => [0, -50, 0]), o);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  return im;
}
function fitSky(K, tex, texAspect = 16 / 9) {
  let last = 0;
  K.onUpdate(() => {
    const a = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : texAspect;
    if (Math.abs(a - last) < 1e-3) return;
    last = a;
    if (a < texAspect) { tex.repeat.set(a / texAspect, 1); tex.offset.set((1 - a / texAspect) / 2, 0); }
    else { tex.repeat.set(1, texAspect / a); tex.offset.set(0, 1 - texAspect / a); }
  });
}
const front = (g, x, y, zmax = 40) => { for (let z = zmax; z > -40; z--) if (g.has(x, y, z)) return z; return null; };

// 5x5 hieroglyph library (rows top -> bottom)
const GLYPHS = [
  ['.#.', '#.#', '.#.', '###', '.#.'], // ankh
  ['.###.', '#.#.#', '.###.', '..#..', '.#...'], // eye
  ['.##..', '###..', '.####', '..##.', '..#.#'], // bird
  ['#.#.#', '.#.#.', '.....', '#.#.#', '.#.#.'], // water
  ['#...#', '##.##', '#####', '#.#.#', '.###.'], // panther head
  ['..#', '.##', '.##', '.##', '..#'], // feather
  ['.###.', '#####', '#####', '.###.', '..#..'], // sun
  ['#.#.#', '.###.', '#####', '.###.', '#.#.#'], // scarab
  ['.#.', '##.', '.#.', '.##', '.#.'], // reed
  ['#####', '#...#', '#.#.#', '#...#', '#####'], // cartouche box
];
/** Paint a glyph onto a +z face at (x,y) top-left. */
function glyphZ(g, idx, x, y, z, col) {
  const gl = GLYPHS[idx % GLYPHS.length];
  gl.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(x + c, y - r, z, col); }));
}
const GLYPH_COLS = [C.lapis, C.red, C.ink, C.turq, C.goldD];

// --------------------------------------------------------------------------- pixel painters

/** Rows of wind-sculpted dunes: gentle lit windward slopes, shaded slip faces. */
function paintDunes(ctx, w, h, rows) {
  const P = pixels(ctx, w, h);
  for (const r of rows) {
    for (let x = 0; x < w; x++) {
      const ph = ((x * r.freq + vnoise(x * 0.02, r.seed, 1) * 1.6) % 1 + 1) % 1;
      const prof = ph < 0.72 ? ph / 0.72 : (1 - ph) / 0.28;
      const top = Math.round(h * r.base - Math.pow(prof, 1.3) * r.amp - vnoise(x * 0.05, r.seed, 2) * r.amp * 0.5);
      const lit = ph < 0.72;
      for (let y = Math.max(0, top); y < h; y++) {
        const dy = y - top;
        let c = lit ? r.lit : r.shade;
        if (dy > r.band) c = mixHex(c, r.deep, Math.min(1, (dy - r.band) / (r.band * 3)));
        if (dy === 0) c = lit ? r.crest : r.shade;
        if (lit && dy > 2 && ((y + Math.floor(x * 0.3)) % 5 === 0) && bayer(x, y) < 0.5) c = shade(c, -0.06); // ripples
        P.set(x, y, c);
      }
    }
  }
  P.flush();
}
/** Pixel pyramid with lit / shaded faces and course lines. */
function paintPyramid(ctx, cx, by, hw, o) {
  for (let y = 0; y <= hw; y++) {
    const half = hw - y;
    const yy = by - y;
    const split = Math.round(cx + half * (o.skew ?? 0.25));
    for (let x = cx - half; x <= cx + half; x++) {
      let c = x < split ? o.lit : o.shade;
      if (y % 3 === 0) c = shade(c, -0.08);
      px(ctx, x, yy, 1, 1, c);
    }
  }
  px(ctx, cx - 1, by - hw - 1, 3, 2, o.cap ?? C.gold);
  px(ctx, cx, by - hw - 2, 1, 1, o.cap ?? C.gold);
}
function paintCamel(ctx, x, y, col) {
  const S = ['....##...', '...###...', '.#######.', '#########', '#.#...#.#', '#.#...#.#'];
  // head + neck on the left
  px(ctx, x - 2, y - 7, 2, 1, col); px(ctx, x - 1, y - 6, 1, 2, col);
  S.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') px(ctx, x + c, y - S.length + r, 1, 1, col); }));
}

// --------------------------------------------------------------------------- voxel props

/** Giant stepped pyramid with a gold capstone and a dark entrance (+z face). */
const pyramidGrid = () => {
  const g = new VoxGrid();
  const N = 22;
  const block = (x, y, z) => { const n = hash3(x >> 1, y, z >> 1); return n < 0.22 ? C.stoneD : n < 0.55 ? C.stone : n < 0.85 ? 0xe8bc7c : C.stoneL; };
  for (let y = 0; y < N; y++) {
    const hs = N - y;
    for (let x = -hs; x < hs; x++) for (let z = -hs; z < hs; z++) g.set(x, y, z, y >= N - 3 ? (y === N - 1 ? C.goldL : C.gold) : block(x, y, z));
  }
  // capstone glints
  g.set(-1, N - 1, -1, C.goldL, true);
  // entrance on the +z face
  for (let y = 3; y <= 6; y++) for (let x = -2; x <= 1; x++) {
    const z = N - y - 1;
    if (y === 6 || x === -2 || x === 1) g.set(x, y, z, C.stoneDD);
    else { g.set(x, y, z, C.ink); g.set(x, y, z - 1, C.ink); }
  }
  // sand banked against the base
  for (let x = -N - 3; x < N + 3; x++) for (let z = -N - 3; z < N + 3; z++) {
    const d = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5));
    const hgt = Math.round(2.6 * vnoise(x * 0.15, 2, z * 0.15) - Math.max(0, d - N) * 0.9);
    for (let y = 0; y < hgt; y++) if (!g.has(x, y, z) || d > N - 2) g.set(x, y, z, y === hgt - 1 ? C.sandL : C.sand);
  }
  return g;
};

/** Sphinx with the head of a panther (dark basalt) in a striped nemes. Faces +z. */
const sphinxGrid = () => {
  const g = new VoxGrid();
  const st = (x, y, z) => { const n = hash3(x >> 1, y >> 1, z >> 1); return n < 0.25 ? C.stoneD : n < 0.7 ? C.stone : C.stoneL; };
  // plinth with a glyph band
  g.box(-17, 0, -25, 16, 5, 16, (x, y, z) => (y === 5 ? C.stoneL : (x + 17) % 6 === 0 || y === 0 ? C.stoneDD : C.stone));
  for (let i = 0; i < 6; i++) glyphZ(g, i * 3 + 1, -15 + i * 5, 4, 16, GLYPH_COLS[i % GLYPH_COLS.length]);
  // lion body
  g.ellipsoid(0, 11, -9, 8.5, 5.5, 12, st);
  g.ellipsoid(0, 11, -18, 8, 6.5, 6, st);
  for (const sx of [-1, 1]) g.ellipsoid(sx * 8, 9, -16, 2.6, 3.4, 6, st);
  for (const x0 of [-7, 3]) {
    g.box(x0, 6, -4, x0 + 4, 9, 12, st);
    g.box(x0, 6, 11, x0 + 4, 7, 14, C.stoneL);
    for (let k = 0; k < 5; k += 2) g.set(x0 + k, 7, 14, C.stoneD);
  }
  g.ellipsoid(0, 14, 0, 7, 7.5, 5.5, st);
  for (let z = -24; z < -6; z++) g.set(11, 6, z, C.stoneD);
  g.box(11, 6, -6, 11, 8, -6, C.stoneD).box(10, 9, -6, 11, 9, -5, C.stoneD);
  // panther head
  const H = C.basalt, H2 = C.basalt2;
  g.ellipsoid(0, 24, 3, 6, 5.6, 5.6, H);
  g.ellipsoid(0, 21.5, 7.5, 3.4, 2.6, 2.4, H2);
  // nemes headdress (lapis & gold stripes), leaving the face open
  for (let x = -9; x <= 9; x++) for (let y = 14; y <= 34; y++) for (let z = -7; z <= 9; z++) {
    const d = (x / 7.8) ** 2 + ((y - 25) / 7.6) ** 2 + ((z - 1.5) / 7.0) ** 2;
    if (d > 1 || d < 0.6) continue;
    if (z >= 3 && y <= 28 && Math.abs(x) <= 5) continue;
    if (y < 19 && z > -2) continue;
    g.set(x, y, z, (y % 2) ? C.gold : C.lapis);
  }
  for (const sx of [-1, 1]) for (let y = 12; y <= 22; y++) for (let z = 2; z <= 5; z++) for (let k = 5; k <= 7; k++) g.set(sx * k - (sx < 0 ? 1 : 0), y, z, (y % 2) ? C.gold : C.lapis);
  // gold brow band + uraeus
  for (let x = -5; x <= 5; x++) { const z = front(g, x, 28, 12); if (z !== null) g.set(x, 28, z, C.goldL); }
  g.box(0, 29, 8, 0, 31, 8, C.gold).set(0, 31, 9, C.goldL).set(0, 30, 9, C.red);
  // rounded panther ears poking through the nemes
  for (const sx of [-1, 1]) { g.ellipsoid(sx * 4.6, 32.5, 2, 1.9, 2.2, 1.3, H); g.set(Math.round(sx * 4.6) - (sx < 0 ? 1 : 0), 32, 3, C.pink); }
  // glowing eyes, pink nose, mouth, whiskers, beard
  for (const sx of [-1, 1]) for (const ex of [2, 3]) {
    const x = sx * ex - (sx < 0 ? 1 : 0);
    const z = front(g, x, 25, 12);
    if (z !== null) g.set(x, 25, z, ex === 2 ? C.turqL : C.turq, true);
  }
  g.set(-1, 23, 10, C.pink).set(0, 23, 10, C.pink).set(-1, 24, 10, C.pink).set(0, 24, 10, C.pink);
  for (const x of [-2, -1, 0, 1]) { const z = front(g, x, 21, 12); if (z !== null) g.set(x, 21, z, C.ink); }
  for (const sx of [-1, 1]) for (let k = 3; k <= 7; k++) g.set(sx * k - (sx < 0 ? 1 : 0), 22 - (k > 5 ? 1 : 0), 9, C.goldL);
  g.box(-1, 15, 8, 0, 18, 9, (x, y) => (y % 2 ? C.gold : C.lapis));
  return g;
};

/** Obelisk with glyph columns and a gold pyramidion. */
const obeliskGrid = (seed) => () => {
  const g = new VoxGrid();
  g.box(-6, 0, -6, 5, 2, 5, (x, y) => (y === 2 ? C.stoneL : C.stoneD));
  const rad = (y) => (y < 24 ? 4 : 3);
  for (let y = 3; y < 44; y++) {
    const r = rad(y);
    g.box(-r, y, -r, r - 1, y, r - 1, hash3(0, y >> 2, seed) < 0.3 ? C.stoneD : C.stone);
  }
  for (let y = 44; y < 48; y++) { const r = 47 - y; g.box(-r - 1, y, -r - 1, r, y, r, y === 47 ? C.goldL : C.gold); }
  g.set(-1, 47, -1, C.goldL, true);
  for (let i = 0; i < 6; i++) {
    const y = 41 - i * 6;
    const gl = GLYPHS[(i + seed * 3) % GLYPHS.length];
    glyphZ(g, (i + seed * 3) % GLYPHS.length, -Math.floor(gl[0].length / 2) - (gl[0].length === 5 ? 0 : 0), y, rad(y) - 1, GLYPH_COLS[(i + seed) % GLYPH_COLS.length]);
  }
  return g;
};

/** Ruined wall segment with painted hieroglyph panels (+z face), 60 long. */
const glyphWallGrid = (seed) => () => {
  const g = new VoxGrid();
  const L = 60, H = 24;
  for (let x = 0; x < L; x++) {
    const ruin = Math.round(H - Math.max(0, vnoise(x * 0.12, seed, 3) - 0.45) * 22);
    for (let y = 0; y < ruin; y++) for (let z = -3; z <= 0; z++) {
      const course = Math.floor(y / 3);
      const joint = y % 3 === 0 || (x + course * 3) % 8 === 0;
      g.set(x, y, z, joint && z === 0 ? C.stoneD : y >= H - 3 ? (y === H - 2 ? C.turq : C.stoneL) : hash3(x >> 2, course, seed) < 0.2 ? 0xd8aa6a : C.stone);
    }
  }
  // painted glyph panels
  let k = seed * 5;
  for (let x = 3; x < L - 5; x += 7) for (let y = 18; y >= 6; y -= 7) {
    if (!g.has(x + 4, y, 0)) continue;
    glyphZ(g, k++, x, y, 0, GLYPH_COLS[k % GLYPH_COLS.length]);
  }
  // lotus columns at both ends
  for (const cx of [-2, L + 1]) {
    for (let y = 0; y < H + 2; y++) g.box(cx - 2, y, -2, cx + 1, y, 1, y >= H - 2 ? (y % 2 ? C.turq : C.gold) : (y % 6 === 0 ? C.red : C.stoneL));
    g.box(cx - 3, H + 2, -3, cx + 2, H + 3, 2, C.stoneL);
  }
  // fallen blocks + sand drift
  for (let x = -4; x < L + 4; x++) for (let z = 1; z <= 4; z++) { const h = Math.round(2.4 * vnoise(x * 0.2, seed, z * 0.4) - z * 0.4); for (let y = 0; y < h; y++) g.set(x, y, z, y === h - 1 ? C.sandL : C.sand); }
  return g;
};

/** Bronze torch stand (flame is animated separately). */
const torchGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -2, 1, 1, 1, C.stoneD);
  g.box(-1, 2, -1, 0, 15, 0, C.bronze);
  for (const y of [5, 10]) g.box(-1, y, -1, 0, y, 0, C.gold);
  g.box(-3, 16, -3, 2, 16, 2, C.bronzeD);
  g.box(-4, 17, -4, 3, 18, 3, (x, y, z) => (Math.abs(x + 0.5) > 3 || Math.abs(z + 0.5) > 3 ? C.bronze : C.ink));
  g.box(-3, 19, -3, 2, 19, 2, (x, y, z) => (Math.abs(x + 0.5) > 2 || Math.abs(z + 0.5) > 2 ? C.gold : undefined));
  return g;
};
/** One frame of a pixel flame (glow voxels). */
const flameFrame = (f) => () => {
  const g = new VoxGrid();
  const R = mulberry32(31 + f * 7);
  for (let y = 0; y < 9; y++) {
    const r = Math.max(0, 2.6 - y * 0.32 + (R() - 0.5) * 0.8);
    const sway = Math.round(Math.sin(y * 0.8 + f * 1.6) * (y / 6));
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const d = Math.hypot(x - sway, z);
      if (d > r) continue;
      const core = d < r * 0.45 && y < 5;
      g.set(x, y, z, y > 6 ? 0xff5a1a : core ? (y < 2 ? 0xffffff : 0xfff07a) : y > 4 ? 0xff7a1a : 0xffb02a, true);
    }
  }
  if (R() < 0.7) g.set(Math.round(R() * 2 - 1), 10, 0, 0xffa02a, true);
  return g;
};

/** Gold treasure pile with a chest, goblets and gems. */
const treasureGrid = () => {
  const g = new VoxGrid();
  for (let x = -10; x <= 10; x++) for (let z = -7; z <= 7; z++) {
    const r = (x / 10.5) ** 2 + (z / 7.5) ** 2;
    if (r > 1) continue;
    const hgt = Math.round(6 * (1 - r) + vnoise(x * 0.4, z * 0.4, 1) * 1.5);
    for (let y = 0; y < hgt; y++) g.set(x, y, z, y === hgt - 1 ? (hash3(x, y, z) < 0.3 ? C.goldL : C.gold) : hash3(x, y, z) < 0.4 ? C.goldD : C.gold);
  }
  // open chest
  g.box(-9, 0, -5, -2, 5, 0, (x, y) => (y === 0 || y === 5 ? C.goldD : C.wood));
  g.box(-9, 6, -6, -2, 6, -5, C.woodD).box(-9, 7, -7, -2, 10, -7, C.wood).box(-9, 10, -7, -2, 10, -6, C.goldD);
  g.box(-8, 5, -4, -3, 6, -1, C.goldL);
  g.set(-6, 3, 1, C.goldL);
  // goblets + gems
  for (const [x, z] of [[4, 2], [7, -3]]) { g.set(x, 5, z, C.goldD); g.box(x, 6, z, x, 7, z, C.gold); g.box(x - 1, 8, z - 1, x + 1, 9, z + 1, C.gold); g.set(x, 9, z, C.goldDD); }
  for (const [x, y, z, c] of [[1, 6, 3, 0xff3a5a], [-1, 5, -3, 0x3aff9a], [5, 4, 5, 0x4a8aff], [8, 2, 2, 0xff3a5a], [2, 5, -5, 0xb05cff]]) g.set(x, y, z, c, true);
  return g;
};
const potGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 11; y++) {
    const r = y < 2 ? 1.6 + y : y < 7 ? 3.4 - Math.abs(y - 4.5) * 0.2 : y < 9 ? 2.2 - (y - 7) * 0.5 : 1.4;
    g.cylinder(-0.5, -0.5, y, y, r, y === 5 ? C.ink : y === 4 || y === 6 ? C.turq : y > 8 ? C.clayD : C.clay);
  }
  for (const sx of [-1, 1]) g.box(sx * 3 - (sx < 0 ? 1 : 0), 7, -1, sx * 3 - (sx < 0 ? 1 : 0), 8, 0, C.clayD);
  return g;
};
const vaseGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 12; y++) {
    const r = y < 1 ? 2 : y < 6 ? 2.2 + Math.sin((y / 6) * Math.PI) * 1.2 : y < 10 ? 1.4 : 2;
    g.cylinder(-0.5, -0.5, y, y, r, y === 3 ? C.lapis : y > 9 ? C.goldL : (y + 0) % 4 === 0 ? C.goldD : C.gold);
  }
  g.set(-1, 4, 2, C.turq, true);
  return g;
};
const chestGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 4, 2, (x, y) => (y === 0 ? C.woodD : C.wood));
  g.box(-4, 5, -3, 3, 6, 2, (x, y, z) => (y === 6 && Math.abs(z + 0.5) < 2 ? C.wood : C.woodD));
  for (const x of [-4, 3]) g.box(x, 0, -3, x, 6, 2, C.gold);
  g.box(-4, 4, -3, 3, 4, 2, C.gold);
  g.box(-1, 2, 3, 0, 4, 3, C.goldL);
  g.set(-1, 3, 3, C.ink);
  return g;
};
const blockGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 5, 2, (x, y, z) => (y === 5 ? C.stoneL : hash3(x, y, z) < 0.25 ? C.stoneD : C.stone));
  glyphZ(g, 4, -3, 4, 3, C.lapis);
  return g;
};
const palmGrid = (seed) => () => treeGrid('palm', { leaf: C.palm, trunk: 0x9a6a3a, seed });
const reedGrid = () => {
  const g = new VoxGrid();
  for (let i = 0; i < 9; i++) { const x = (i % 3) * 2 - 2, z = Math.floor(i / 3) * 2 - 2, h = 5 + (hash3(i, 1, 2) * 5 | 0); for (let y = 0; y < h; y++) g.set(x + (y > h - 3 ? 1 : 0), y, z, y === h - 1 ? 0xb8a050 : 0x5aa83a); }
  return g;
};
/** Bastet-style seated golden panther idol (the zone secret). */
const goldPantherGrid = () => {
  const g = new VoxGrid();
  const G0 = C.gold, GL = C.goldL, GD = C.goldD;
  g.box(-5, 0, -5, 4, 3, 4, (x, y) => (y === 3 ? C.goldD : y === 0 ? C.stoneDD : C.stone));
  glyphZ(g, 4, -2, 2, 5, C.lapis);
  const o = 4;
  g.ellipsoid(0, o + 4, -1, 3.5, 4, 4, G0);
  g.ellipsoid(0, o + 10, 0.5, 2.6, 5.5, 2.6, G0);
  for (const x of [-2, 1]) { g.box(x, o, 2, x, o + 8, 3, GL); g.set(x, o, 4, GL); }
  g.ellipsoid(0, o + 16.5, 1, 2.8, 2.8, 2.8, G0);
  g.ellipsoid(0, o + 15.5, 3.2, 1.5, 1.2, 1.2, GL);
  for (const sx of [-1, 1]) { const x = sx < 0 ? -2 : 1; g.box(x, o + 19, 0, x, o + 21, 1, G0); g.set(x, o + 22, 0, GL); }
  for (const x of [-2, 1]) { const z = front(g, x, o + 17, 8); if (z !== null) g.set(x, o + 17, z, C.turqL, true); }
  g.set(-1, o + 15, 5, C.ink).set(0, o + 15, 5, C.ink);
  for (let x = -2; x <= 1; x++) { const z = front(g, x, o + 13, 8); if (z !== null) g.set(x, o + 13, z, C.turq); }
  g.set(2, o + 17, 1, C.turq, true);
  const tail = [[3, o, -3], [4, o, 0], [3, o, 3], [1, o, 5]];
  for (let i = 0; i < tail.length - 1; i++) g.line(...tail[i], ...tail[i + 1], GD);
  return g;
};

// --------------------------------------------------------------------------- dynamic helpers

/** Torches with frame-swapped pixel flames and a flickering additive halo. */
function addTorches(K, list, scale = 0.1) {
  K.inst('torch', torchGrid, { scale, ao: true }, list.map(([x, z]) => [x, 0, z]), { shadow: true });
  const frames = [0, 1, 2, 3].map((f) => K.geo('flame' + f, flameFrame(f), { scale: scale * 0.9, pivot: [0.5, 0, 0.5] }));
  const haloTex = canvasTex('py_halo', 16, 16, (ctx, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8;
      const a = Math.max(0, 1 - d) ** 1.6;
      const q = Math.floor(a * 4 + bayer(x, y)) / 4;
      if (q > 0) px(ctx, x, y, 1, 1, 0xff9a3a, Math.min(1, q));
    }
  });
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 });
  list.forEach(([x, z], i) => {
    const m = makeMesh(frames[0], Mats.pair);
    m.castShadow = false;
    m.position.set(x, 20 * scale, z);
    K.add(m);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
    halo.position.set(x, 21.5 * scale, z + 0.05);
    K.add(halo);
    const ph = i * 1.37;
    K.onUpdate((dt, t) => {
      m.geometry = frames[Math.floor(t * 10 + ph * 3) % 4];
      const f = 0.85 + Math.sin(t * 17 + ph) * 0.08 + Math.sin(t * 7.3 + ph * 2) * 0.07;
      m.scale.set(1, f, 1);
      halo.scale.setScalar(scale * 22 * (0.9 + f * 0.2));
    });
  });
}
/** Twinkling glints over treasure (instanced glow cubes). */
function addGlints(K, spots, n) {
  const mat = glowMat(0xffffff).clone();
  mat.color.setRGB(2.2, 2.0, 1.4);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  K.add(im);
  const R = mulberry32(5);
  const g = Array.from({ length: n }, () => { const s = spots[Math.floor(R() * spots.length)]; return { x: s[0] + (R() - 0.5) * s[3], y: s[1] + R() * s[4], z: s[2] + (R() - 0.5) * s[3] * 0.6, ph: R(), sp: 0.4 + R() * 0.6 }; });
  K.onUpdate((dt, t) => {
    g.forEach((p, i) => {
      const q = (t * p.sp + p.ph) % 1;
      const s = q < 0.15 ? Math.sin((q / 0.15) * Math.PI) * 0.09 : 0.0001;
      setInst(im, i, p.x, p.y, p.z, 0.785, 0.6, 0, s);
    });
    im.instanceMatrix.needsUpdate = true;
  });
}
/** Oasis pool: shimmering pixel water. */
function waterTex() {
  return canvasTex('py_water', 32, 32, (ctx, w, h) => {
    px(ctx, 0, 0, w, h, 0x24aac4);
    const R = mulberry32(3);
    for (let i = 0; i < 26; i++) { const x = R() * w | 0, y = R() * h | 0, l = 2 + (R() * 4 | 0); px(ctx, x, y, l, 1, R() < 0.6 ? 0x5ad8e8 : 0x1a88a8); }
    for (let i = 0; i < 6; i++) px(ctx, R() * w | 0, R() * h | 0, 1, 1, 0xffffff);
  }, { repeatX: true });
}

// --------------------------------------------------------------------------- postcard props

/** Ruined temple colonnade: papyrus-capital columns with painted glyph bands, a broken lintel, fallen drums (0.15 scale). */
const colonnadeGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -6, 92, 2, 5, (x, y) => (y === 2 ? C.stoneL : C.stoneD));
  const hs = [44, 40, 46, 30, 44, 18, 42];
  hs.forEach((h, i) => {
    const cx = 4 + i * 14;
    for (let y = 3; y < h; y++) {
      const r = y > h - 6 ? 4.5 - (h - y) * 0.15 : 3.4;
      for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
        if (Math.hypot(x, z) > r) continue;
        let c = (x + z + y) % 7 === 0 ? C.stoneD : x < -1 ? C.stoneL : C.stone;
        if (y % 11 === 6 || y % 11 === 7) c = (Math.floor(Math.atan2(z, x) * 3) & 1) ? C.lapis : C.turq;
        if (y % 11 === 8 && hash3(x, y, i) < 0.5) c = C.red;
        g.set(cx + x, y, z, c);
      }
    }
    if (h > 40) g.box(cx - 5, h, -5, cx + 5, h + 2, 5, C.stoneL);
  });
  g.box(-1, 47, -4, 37, 51, 3, (x, y) => (y === 49 ? C.gold : y === 47 ? C.stoneD : C.stone));
  for (let k = 0; k < 8; k++) glyphZ(g, k, 2 + k * 4, 51, 4, GLYPH_COLS[k % 5]);
  g.box(48, 3, 6, 60, 7, 10, C.stoneD).box(66, 3, 7, 72, 6, 11, C.stone);
  for (let x = -2; x <= 92; x++) for (let z = 6; z < 10; z++) if (hash3(x, 2, z) < 0.4) g.set(x, 3, z, C.sandL);
  return g;
};
/** Camel with a striped saddle blanket and a rider in a head wrap (faces +z, 0.08 scale). */
const camelGrid = (v) => () => {
  const g = new VoxGrid();
  const fur = v ? 0xc89458 : 0xb8844a, furD = shade(fur, -0.2);
  for (const [x, z] of [[-3, -7], [2, -7], [-3, 6], [2, 6]]) g.box(x, 0, z, x + 1, 13, z + 1, furD);
  g.box(-4, 14, -9, 3, 21, 9, fur);
  g.box(-3, 22, -5, 2, 26, 1, fur).box(-2, 27, -3, 1, 28, -1, fur);
  g.box(-2, 18, 10, 1, 30, 12, fur).box(-2, 28, 13, 1, 32, 17, fur).set(-1, 31, 17, 0x2a1a10).set(0, 31, 17, 0x2a1a10);
  g.box(-5, 20, -1, 4, 23, 5, (x, y) => (y % 2 ? C.red : C.gold));
  g.box(-2, 24, 0, 1, 31, 3, v ? 0x2a4aa8 : 0xf4ecdc).box(-2, 32, 0, 1, 35, 3, 0x8a5a3a).box(-3, 34, -1, 2, 36, 4, v ? 0xf4ecdc : C.red);
  g.box(-1, 12, -11, 0, 19, -10, furD);
  return g;
};

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  // ---- hot peach sky, big pale sun, heat streaks and circling birds
  const sky = skyTexture('pyramid2', [[0, 0xc8502e], [0.12, 0xe2703e], [0.26, 0xf89a58], [0.4, 0xffc488], [0.55, 0xffdcac], [0.7, 0xffe8c8], [1, 0xf8d4a0]], (ctx, w, h) => {
    const P = pixbuf(ctx, w, h);
    skyGlow(P, w * 0.37, h * 0.18, w * 0.45, h * 0.45, 0xfff0c8, 0.65, { bands: 6, pow: 1.3 });
    paintSunPx(P, Math.round(w * 0.37), Math.round(h * 0.14), 11, { color: 0xfff6d6, core: 0xffffff, halo: 0xffe8b0, halo2: 0xfff4d8, haloR: 4.5, haloA: 0.6 });
    paintStreaks(P, w, { n: 14, y0: h * 0.05, y1: h * 0.4, len: [26, 80], color: 0xffe4bc, shade: 0xffc89a, seed: 61, alpha: 0.6 });
    paintCumulus(P, w * 0.84, h * 0.2, 9, 62, { light: 0xfff4e4, color: 0xffe0c0, shade: 0xf4b48a, dark: 0xe09a74, sunX: -1, alpha: 0.85 });
    paintCumulus(P, w * 0.1, h * 0.14, 8, 63, { light: 0xfff4e4, color: 0xffd8b8, shade: 0xf0a882, dark: 0xd88a6a, sunX: 1, alpha: 0.85 });
    paintBirdsPx(P, [[w * 0.55, h * 0.24, 1], [w * 0.58, h * 0.21, 1], [w * 0.61, h * 0.25, 0], [w * 0.64, h * 0.22, 0]], 0x5a3a2a, 0.7);
    P.flush();
  }, { w: 320, h: 180, bands: 14 });
  fitSky(K, sky);

  // ---- parallax: far dunes with distant pyramids, mid dunes + palms, near dunes + caravan
  K.parallax('farDunes', {
    z: -160, y: -4, w: parallaxWidth(-160), h: 30, tw: 384, th: 72,
    paint: (ctx, w, h) => {
      const R = mulberry32(14);
      for (let i = 0; i < 7; i++) {
        const cx = (i + 0.2 + R() * 0.6) * (w / 7) | 0, hw = 10 + (R() * 16 | 0);
        paintPyramid(ctx, cx, Math.round(h * 0.78), hw, { lit: 0xf0b878, shade: 0xc8885a });
        if (R() < 0.5) paintPyramid(ctx, cx + hw + 6, Math.round(h * 0.8), hw >> 1, { lit: 0xeab070, shade: 0xc2825a });
      }
      paintDunes(ctx, w, h, [{ base: 0.86, amp: 10, freq: 0.012, seed: 2, lit: 0xf6c890, shade: 0xd8986a, crest: 0xffe0b0, deep: 0xe8b07a, band: 3 }]);
    },
    fogTint: [0xffc89a, 0.3],
  });
  K.parallax('midDunes', {
    z: -122, y: -3, w: parallaxWidth(-122), h: 18, tw: 352, th: 56,
    paint: (ctx, w, h) => {
      paintDunes(ctx, w, h, [{ base: 0.72, amp: 12, freq: 0.016, seed: 5, lit: 0xf8cc88, shade: 0xd8965e, crest: 0xffe4b0, deep: 0xeab070, band: 4 }]);
      const R = mulberry32(21);
      for (let i = 0; i < 5; i++) {
        const x = R() * w | 0, y = Math.round(h * 0.8);
        for (let k = 0; k < 4; k++) { const cx = x + k * 5 + (R() * 3 | 0); for (let yy = 0; yy < 9; yy++) px(ctx, cx + Math.round(Math.sin(yy * 0.3) * 1), y - yy, 1, 1, 0x8a5a2a); for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1]]) for (let j = 1; j <= 4; j++) px(ctx, cx + dx * j, y - 9 + dy * Math.round(j * j / 5) - (dx === 0 ? j : 0), 1, 1, j % 2 ? 0x4a8a3a : 0x3a6a2a); }
      }
      // broken colonnade
      for (let k = 0; k < 6; k++) { const x = Math.round(w * 0.62) + k * 6; const ch = 8 + ((k * 7) % 5); px(ctx, x, h - 10 - ch, 3, ch, 0xe2ae74); px(ctx, x - 1, h - 11 - ch, 5, 2, 0xf0c48a); }
      px(ctx, Math.round(w * 0.62) - 1, h - 22, 20, 2, 0xf0c48a);
    },
    fogTint: [0xffc89a, 0.16],
  });
  K.parallax('nearDunes', {
    z: -84, y: -2, w: parallaxWidth(-84), h: 9, tw: 320, th: 36,
    paint: (ctx, w, h) => {
      paintDunes(ctx, w, h, [{ base: 0.86, amp: 7, freq: 0.022, seed: 9, lit: 0xf8d090, shade: 0xe0a066, crest: 0xffe8b8, deep: 0xf0bc80, band: 3 }]);
      const cy = Math.round(h * 0.62);
      for (let k = 0; k < 6; k++) paintCamel(ctx, Math.round(w * 0.18) + k * 12, cy + (k % 2), 0x8a5a34);
      for (let k = 0; k < 4; k++) paintCamel(ctx, Math.round(w * 0.7) + k * 12, cy + 2 - (k % 2), 0x8a5a34);
    },
    fogTint: [0xffc89a, 0.08],
  });

  // ---- ground: rippled sand near, 3D dunes + processional avenue far
  const sandCol = (x, z) => {
    const rip = Math.sin(x * 1.1 + z * 0.35 + vnoise(x * 0.1, 1, z * 0.1) * 6);
    const n = vnoise(x * 0.07, 3, z * 0.09), m = hash3(Math.floor(x * 2), 9, Math.floor(z * 2));
    if (m < 0.008) return C.stoneD; // pebbles
    if (rip > 0.82) return C.sandL;
    if (rip < -0.85) return C.ripple;
    return n > 0.64 ? C.sandL : n < 0.3 ? C.sandD : C.sand;
  };
  const avenue = (x, z) => Math.abs(x - 3 - (z + 12) * -0.18) < 2.6 && z < -11 && z > -44;
  K.ground({
    id: 'groundNear', x0: -64, x1: 64, z0: -14, z1: 48, scale: 0.5,
    color: (x, z) => {
      if (Math.abs(z) < LH + 0.3) return C.stoneD;
      if (z < -LH - 0.3 && z > -6.6 && Math.abs(x) < 34) return ((Math.floor(x) + Math.floor(z)) & 1) ? C.tile : C.tile2; // temple forecourt
      return sandCol(x, z);
    },
  });
  K.ground({
    id: 'groundFar', x0: -120, x1: 120, z0: -76, z1: -14, scale: 1,
    color: (x, z) => {
      if (avenue(x, z)) return ((Math.floor(x) + Math.floor(z)) & 1) ? C.tile : C.stoneD;
      return sandCol(x, z);
    },
  });
  K.mesh('dunes3d', () => {
    const g = new VoxGrid();
    for (let x = -110; x < 110; x++) for (let z = -74; z < -22; z++) {
      if (avenue(x + 0.5, z + 0.5)) continue;
      const pyr = Math.max(Math.abs(x - 10), Math.abs(z + 52));
      if (pyr < 22) continue;
      const n = vnoise(x * 0.045, 7, z * 0.07);
      const hgt = Math.round((n - 0.42) * 9 * Math.min(1, (-z - 22) / 14));
      for (let y = 0; y < hgt; y++) {
        const lit = vnoise((x + 1) * 0.045, 7, z * 0.07) < n;
        g.set(x, y, z, y === hgt - 1 ? (lit ? C.sandL : C.sand) : C.sandD);
      }
    }
    return g;
  }, { scale: 1, pivot: [0, 0, 0] }, 0, -0.02, 0);

  // ---- lane: sandstone slabs, drifted sand, lapis/turquoise/gold frieze edges
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.stoneDD,
    color: (ix, iz, x, z) => {
      if (iz === -10 || iz === 9) { const k = ((ix % 6) + 6) % 6; return k < 2 ? C.gold : k === 2 || k === 5 ? C.lapis : C.turq; }
      if (iz === -9 || iz === 8) return ((ix >> 1) & 1) ? C.red : C.goldD;
      const drift = vnoise(x * 0.22, 4, z * 0.8) + (Math.abs(z) > 1.4 ? 0.12 : 0);
      if (drift > 0.68) return hash3(ix, 3, iz) < 0.3 ? C.sandL : C.sand;
      const tx = ((ix % 8) + 8) % 8, tz = ((iz + 10) % 6);
      if (tx === 0 || tz === 0) return C.seam;
      const t = ((Math.floor(ix / 8) + Math.floor((iz + 10) / 6)) & 1) ? C.tile : C.tile2;
      return hash3(ix, 1, iz) < 0.08 ? shade(t, -0.06) : t;
    },
    raise: (ix, iz) => (iz === -10 || iz === 9) && (ix & 7) < 6,
    raiseColor: (ix) => { const k = ((ix % 6) + 6) % 6; return k < 2 ? C.gold : k === 2 || k === 5 ? C.lapis : C.turq; },
  });
  // winged sun disc centre marker
  K.mesh('wingedSun', () => {
    const g = new VoxGrid();
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z <= 10) g.set(x, 0, z, x * x + z * z <= 3 ? C.goldL : C.gold, true);
    for (const sx of [-1, 1]) for (let k = 4; k <= 14; k++) {
      const span = Math.max(1, 3 - Math.floor((k - 4) / 4));
      for (let j = 0; j < span; j++) g.set(sx * k, 0, -1 + j - Math.floor((k - 4) / 5), j === 0 ? C.turq : k % 3 === 0 ? C.lapis : C.turq);
    }
    return g;
  }, { scale: 0.11, pivot: [0, 0, 0] }, 0.05, 0.002, 1.55);

  // ---- breakables right behind the lane
  const brk = [[-19, 'pot'], [-9.7, 'chest'], [-3.3, 'vase'], [4.5, 'pot'], [10.4, 'block'], [18.6, 'chest']];
  for (const [x, kind] of brk) {
    if (kind === 'pot') K.breakable('pot', 'pot', potGrid, { scale: 0.1 }, x, -3.2, K.rand(0, 6));
    else if (kind === 'chest') K.breakable('crate', 'chest', chestGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
    else if (kind === 'vase') K.breakable('vase', 'goldVase', vaseGrid, { scale: 0.09 }, x, -3.2, K.rand(0, 6));
    else K.breakable('block', 'glyphBlock', blockGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.2, 0.2));
  }

  // ---- temple forecourt: torches, glyph walls, obelisks, treasure
  addTorches(K, [[-21.5, -5.2], [-14.6, -5.4], [-6.6, -5.6], [0.6, -5.4], [7.8, -5.6], [15, -5.4], [22, -5.2]]);
  for (const [x, z, seed, ry] of [[-25, -9.6, 1, 0.08], [-15, -10.2, 2, 0], [8.6, -10, 3, 0], [19.5, -9.4, 4, -0.08]]) K.mesh('glyphWall' + seed, glyphWallGrid(seed), { scale: 0.1, pivot: [0, 0, 0] }, x - 3, 0, z, ry, 1, { shadow: true });
  K.mesh('obelisk1', obeliskGrid(1), { scale: 0.12 }, -4.6, 0, -12.4, 0, 1, { shadow: true });
  K.mesh('obelisk2', obeliskGrid(2), { scale: 0.12 }, 4.8, 0, -13.2, 0, 1, { shadow: true });
  K.mesh('obelisk3', obeliskGrid(3), { scale: 0.13 }, -30, 0, -20, 0.2, 1);
  K.mesh('obelisk4', obeliskGrid(4), { scale: 0.13 }, 33, 0, -24, -0.2, 1);
  K.inst('treasure', treasureGrid, { scale: 0.085, ao: true }, [[-1.8, 0, -7.6, 0.3], [11.2, 0, -7.2, -0.4], [-27.5, 0, -6.4, 0.8], [3, 0, -30.5, 0.1]], { shadow: true });
  addGlints(K, [[-1.8, 0.3, -7.6, 1.6, 0.4], [11.2, 0.3, -7.2, 1.6, 0.4], [-27.5, 0.3, -6.4, 1.6, 0.4], [10, 17.4, -52, 2, 1]], 26);

  // ---- landmarks: panther sphinx, giant pyramid, oasis
  K.mesh('sphinx', sphinxGrid, { scale: 0.16 }, -10.5, 0, -21, 0.22, 1, { shadow: true });
  K.mesh('pyramid', pyramidGrid, { scale: 0.8 }, 10, 0, -52, 0.62, 1);
  K.mesh('pyramidS', pyramidGrid, { scale: 0.45 }, -36, 0, -50, 0.3, 1);
  K.mesh('pyramidS', pyramidGrid, { scale: 0.38 }, 44, 0, -46, -0.4, 1);
  // oasis in front of the pyramid
  const OX = 11.2, OZ = -19.5;
  K.mesh('oasisRim', () => {
    const g = new VoxGrid();
    for (let x = -30; x <= 30; x++) for (let z = -18; z <= 18; z++) {
      const d = (x / 30) ** 2 + (z / 18) ** 2 + (vnoise(x * 0.2, z * 0.2, 4) - 0.5) * 0.3;
      if (d > 1) continue;
      if (d > 0.62) g.set(x, 0, z, d > 0.85 ? 0x7ab84a : 0x5aa83a);
      else if (d > 0.5) g.set(x, 0, z, C.sandD);
    }
    return g;
  }, { scale: 0.18, pivot: [0, 0, 0] }, OX, -0.1, OZ, 0, [0.78, 1, 0.78]);
  const wt = waterTex().clone();
  wt.needsUpdate = true;
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  wt.repeat.set(3, 2);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshLambertMaterial({ map: wt, color: 0xffffff }));
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(3.5, 2.05, 1);
  pool.position.set(OX, 0.02, OZ);
  K.add(pool);
  K.onUpdate((dt, t) => { wt.offset.x = (t * 0.03) % 1; wt.offset.y = Math.sin(t * 0.5) * 0.04; });
  K.inst('reeds', reedGrid, { scale: 0.1 }, [[OX - 3.4, 0, OZ + 1.2], [OX + 3.6, 0, OZ + 0.8, 1], [OX - 1.6, 0, OZ + 2.1, 2], [OX + 2.4, 0, OZ - 1.8, 0.5]]);
  const palms = [];
  for (const [x, z, s, seed] of [[OX - 4.2, OZ - 0.8, 0.2, 1], [OX + 4.4, OZ + 1.6, 0.22, 2], [OX + 1.6, OZ - 2.6, 0.19, 3], [24, -12.5, 0.22, 2], [19, -15, 0.2, 1], [-29, -11, 0.21, 4], [-34.5, -16, 0.23, 5], [34, -12, 0.2, 6], [-22, -27, 0.2, 7], [28, -30, 0.22, 8]]) {
    const m = K.mesh('palm' + (seed % 3), palmGrid(seed % 3), { scale: 1 }, x, 0, z, K.rand(0, 6), s, { shadow: true });
    palms.push([m, seed]);
  }
  K.onUpdate((dt, t) => { for (const [m, ph] of palms) { m.rotation.z = Math.sin(t * 0.9 + ph) * 0.025; m.rotation.x = Math.sin(t * 0.7 + ph * 2) * 0.015; } });
  K.inst('boulder', () => rockGrid({ color: C.stone, r: 4 }), { scale: 0.14 }, [[-24, 0, -4.8, 0.4], [26.5, 0, -4.6, 1.2], [-36, 0, -6, 2], [37, 0, -7, 0.1], [17, 0, -16, 1]]);

  // ---- vultures circling the pyramid
  const birds = liveInst(K, 'vulture', () => {
    const g = new VoxGrid();
    g.box(-1, 0, -2, 0, 1, 2, 0x3a2a24);
    for (const sx of [-1, 1]) for (let k = 1; k <= 6; k++) g.box(sx * k - (sx < 0 ? 1 : 0), Math.floor(k / 3), -1, sx * k - (sx < 0 ? 1 : 0), Math.floor(k / 3), 0, k > 4 ? 0x2a1a14 : 0x4a3a30);
    g.set(-1, 1, 3, 0xd8b8a0).set(0, 1, 3, 0xd8b8a0);
    return g;
  }, { scale: 0.12 }, 4);
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 4; i++) {
      const a = t * 0.18 + i * 1.57, r = 9 + (i % 2) * 4;
      setInst(birds, i, 10 + Math.cos(a) * r, 21 + i * 1.2 + Math.sin(t * 0.7 + i) * 0.5, -48 + Math.sin(a) * r * 0.5, -a, 0, Math.sin(t * 2.4 + i) * 0.15 - 0.25, 1);
    }
    birds.instanceMatrix.needsUpdate = true;
  });

  // ---- blowing sand wisps (low)
  const wisps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.6, depthWrite: false }), 90);
  wisps.frustumCulled = false;
  wisps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  K.add(wisps);
  const WR = mulberry32(44);
  const wp = Array.from({ length: 90 }, () => ({ x: WR() * 90 - 45, y: 0.05 + WR() * 0.5, z: WR() < 0.5 ? -3 - WR() * 12 : LH + 1 + WR() * 10, v: 2.5 + WR() * 3, ph: WR() * 6 }));
  K.onUpdate((dt, t) => {
    wp.forEach((p, i) => {
      p.x += p.v * dt;
      if (p.x > 45) p.x -= 90;
      setInst(wisps, i, p.x, p.y + Math.sin(t * 3 + p.ph) * 0.08, p.z, 0, 0, 0, [0.35, 0.03, 0.03]);
    });
    wisps.instanceMatrix.needsUpdate = true;
  });

  // ---- LOW foreground: scarabs, coins, bones, fallen stones
  const scar = liveInst(K, 'scarab', () => {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 0, 1, 0x1a3a4a).set(-1, 1, 0, 0x2a8aa8).set(0, 1, 0, 0x2a8aa8).set(-1, 0, 2, 0x10202a).set(0, 0, 2, 0x10202a);
    for (const sx of [-2, 1]) g.set(sx, 0, 0, 0x10202a);
    return g;
  }, { scale: 0.05 }, 6);
  const sc = Array.from({ length: 6 }, (_, i) => ({ cx: -20 + i * 8 + K.rand(-2, 2), cz: LH + 1.6 + K.rand(0, 3), r: K.rand(0.6, 1.4), sp: K.rand(0.2, 0.4) * (i % 2 ? 1 : -1) }));
  K.onUpdate((dt, t) => {
    sc.forEach((p, i) => { const a = t * p.sp + i; setInst(scar, i, p.cx + Math.cos(a) * p.r, 0.0, p.cz + Math.sin(a) * p.r * 0.6, -a + (p.sp > 0 ? Math.PI : 0), 0, 0, 1); });
    scar.instanceMatrix.needsUpdate = true;
  });
  const coins = [];
  for (let i = 0; i < 30; i++) coins.push([K.rand(-36, 36), 0, K.rand(LH + 1, 12), K.rand(0, 6), K.rand(0.8, 1.2)]);
  K.inst('coin', () => { const g = new VoxGrid(); g.box(-1, 0, -1, 0, 0, 0, C.gold); g.set(-1, 0, -1, C.goldL); return g; }, { scale: 0.07 }, coins);
  const stones = [];
  for (let i = 0; i < 12; i++) stones.push([K.rand(-40, 40), 0, K.rand(LH + 2, 14), K.rand(0, 6), K.rand(0.8, 1.3)]);
  K.inst('fallenStone', () => { const g = new VoxGrid(); g.box(-3, 0, -2, 2, 2, 1, (x, y) => (y === 2 ? C.stoneL : C.stone)); g.box(-3, 0, 2, 1, 0, 3, C.sand); return g; }, { scale: 0.1 }, stones);
  K.inst('skull', () => { const g = new VoxGrid(); g.box(-2, 0, -2, 1, 2, 1, 0xf0e6d0); g.set(-2, 1, 2, 0x3a2a1a).set(1, 1, 2, 0x3a2a1a); g.box(-1, 0, 2, 0, 1, 3, 0xf0e6d0); for (const sx of [-3, 2]) g.box(sx, 2, -1, sx, 3, -1, 0xe0d4b8); return g; }, { scale: 0.07 }, [[-11, 0, 6.5, 0.4], [23, 0, 9, -0.6]]);

  // ---- postcard extras: sandstone mesas, a ruined colonnade, a camel caravan, temple banners, a dust devil, ibis
  voxRange(K, 'mesas', {
    x0: -170, x1: 170, z: -112, depth: 6, scale: 1.8, y: -0.6,
    h: (xv, zv) => { const n = vnoise(xv * 0.05, 8, 0.5); const m = n > 0.55 ? 6 + Math.round(vnoise(xv * 0.3, 9, 1) * 1.5) : n > 0.45 ? 3 : 1; return Math.max(1, Math.round(m * (0.5 + 0.5 * zv / 5))); },
    col: (xv, y, zv, h) => (y === h - 1 ? 0xe8b478 : [0xd89a5e, 0xc8884e, 0xe0a468][Math.floor(y / 2) % 3]),
  });
  K.mesh('colonnade', colonnadeGrid, { scale: 0.15, pivot: [0, 0, 0] }, -27, 0, -33, 0.15);
  {
    // camel caravan crossing the dunes (walk bob + leg swing via bob/roll)
    const camels = [];
    for (let i = 0; i < 5; i++) camels.push(K.mesh(i % 2 ? 'camelR' : 'camel', camelGrid(i % 2), { scale: 0.08, ao: true }, 0, 0, -41.5 - (i % 2) * 0.4, Math.PI / 2, 1));
    K.onUpdate((dt, t) => {
      const lead = ((t * 1.1) % 140) - 70;
      for (let i = 0; i < camels.length; i++) {
        const m = camels[i], x = lead - i * 2.5;
        m.position.x = x < -70 ? x + 140 : x;
        m.position.y = 0.3 + Math.abs(Math.sin(t * 3 + i)) * 0.07;
        m.rotation.z = Math.sin(t * 3 + i) * 0.04;
      }
    });
  }
  for (const [x, z, a, b, ph] of [[-18.5, -9.5, C.red, C.lapis, 0], [-2.9, -9.8, C.lapis, C.gold, 1.6], [11.2, -9.8, C.turq, C.red, 3.1], [25.5, -9.4, C.gold, C.lapis, 4.4]])
    addFlag(K, { id: 'pennant' + a, x, y: 5.6, z, w: 13, h: 5, vox: 0.11, pattern: (u, v) => (u > 10 - Math.abs(v - 2) ? null : v === 2 ? b : a), poleH: 5.6, pole: 0x9a6a3a, knob: C.gold, phase: ph });
  {
    // a dust devil wandering across the far desert
    const dev = addPuffs(K, { id: 'dustDevil', sources: [[0, 0, 0]], n: 14, life: 2.6, rise: 6, drift: [0, 0], wobble: 0.9, ease: 1, size: [0.4, 1.6], scale: 0.18, color: 0xf0cc94, light: 0xffe4bc, shade: 0xd8a870, opacity: 0.6, seed: 9 });
    K.onUpdate((dt, t) => { dev.position.set(((t * 1.6) % 120) - 60, 0, -58 + Math.sin(t * 0.2) * 4); dev.rotation.y = t * 3; });
  }
  addBirds(K, { id: 'ibis', n: 6, mode: 'flock', x0: -70, x1: 70, y: 13, z: -48, speed: 2.4, dir: -1, color: 0xf8f4ec, wingTip: 0x2a2420, belly: 0xe8e0d0, beak: 0x2a2420, head: 0x2a2420, vox: 0.07, flap: 7, soar: 0.4, seed: 8 });
  addSparkles(K, { id: 'heatGlint', n: 18, area: [-30, 30, 0.05, 0.6, -14, -6], color: 0xfff4d0, scale: 0.05, rate: 0.7, sharp: 6, seed: 15 });

  return {
    sky,
    fog: { color: 0xffd2a0, near: 70, far: 260 },
    lights: { sky: 0xfff0d8, ground: 0xc8905a, hemi: 1.15, sun: 2.5, sunColor: 0xfff0d2, dir: [-7, 13, 9], rim: 1.0, rimColor: 0xffb878 },
    dust: 0xf2d4a0,
    bloom: { strength: 0.65, threshold: 1.7, radius: 0.25 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // sand island with a sandstone rim, mini pyramid, panther sphinx, oasis and a hidden golden panther
  K.mesh('zoneBase', () => {
    const g = new VoxGrid();
    for (let x = -28; x <= 27; x++) for (let z = -28; z <= 27; z++) {
      const r = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)) * 0.6 + Math.hypot(x + 0.5, z + 0.5) * 0.4;
      if (r > 26.5) continue;
      const rim = r > 25;
      const rip = Math.sin(x * 0.9 + z * 0.3);
      g.set(x, 0, z, rim ? C.stoneL : rip > 0.85 ? C.sandL : vnoise(x * 0.2, 1, z * 0.2) < 0.3 ? C.sandD : C.sand);
      for (let y = -1; y >= -5; y--) g.set(x, y, z, rim || y < -3 ? (((x + z + y) & 3) === 0 ? C.stoneD : C.stone) : C.sandD);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 1, 0] }, 0, 0, 0);
  K.mesh('pyramid', pyramidGrid, { scale: 0.13 }, 1.2, 0, -3.6, 0.5);
  K.mesh('sphinx', sphinxGrid, { scale: 0.07 }, -3.4, 0, -0.6, 0.5, 1, { shadow: true });
  K.mesh('obelisk', obeliskGrid(2), { scale: 0.06 }, -1.2, 0, 2.6, 0, 1, { shadow: true });
  K.mesh('glyphWall', glyphWallGrid(2), { scale: 0.05, pivot: [0, 0, 0] }, -5.6, 0, -4.4, 0.25, 1, { shadow: true });
  // oasis
  const wt = waterTex().clone();
  wt.needsUpdate = true;
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  wt.repeat.set(2, 2);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), new THREE.MeshLambertMaterial({ map: wt }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(3.6, 0.02, 2.8);
  K.add(pool);
  K.mesh('poolRim', () => { const g = new VoxGrid(); for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) { const d = Math.hypot(x, z); if (d > 6.8 && d < 9.2) g.set(x, 0, z, d < 7.8 ? C.sandD : 0x5aa83a); } return g; }, { scale: 0.2, pivot: [0, 0, 0] }, 3.6, -0.15, 2.8);
  K.onUpdate((dt, t) => { wt.offset.x = (t * 0.03) % 1; });
  for (const [x, z, s, seed] of [[5.2, 1.6, 0.11, 1], [4.4, 4.6, 0.1, 2]]) {
    const m = K.mesh('palm' + seed, palmGrid(seed), { scale: 1 }, x, 0, z, seed, s, { shadow: true });
    K.onUpdate((dt, t) => { m.rotation.z = Math.sin(t * 0.9 + seed) * 0.03; });
  }
  addTorches(K, [[-0.6, 4.8], [1.8, 4.6]], 0.08);
  K.inst('treasure', treasureGrid, { scale: 0.06, ao: true }, [[0.6, 0, -0.2, 0.4]], { shadow: true });
  addGlints(K, [[0.6, 0.2, -0.2, 1, 0.3]], 8);
  // the secret: a golden panther idol tucked behind the pyramid
  K.mesh('goldPanther', goldPantherGrid, { scale: 0.05, ao: true }, 5.4, 0, -5.0, -0.5, 1, { shadow: true });
  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; K.root.add(o); K.hotspots[name] = o; return o; };
  anchor('boss', -2.6, 0, 4.4);
  anchor('goldPanther', 5.4, 0.6, -5.0);
  anchor('npc', 1.2, 0, 5.6);
  anchor('enterPyramid', 1.8, 0.5, -1.4);
  return { focus: [0, 1.2, 0], radius: 7 };
}
