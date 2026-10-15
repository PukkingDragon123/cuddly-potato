// Arena 10: LOST JUNGLE TEMPLE — "I Survived 50 Hours In The Amazon Jungle".
// An ancient flagstone causeway through the rainforest: mossy ruins, a carved
// Beast-panther head, the explorers' camp (tent, campfire, hammock), stone
// braziers, a creek with lily pads in front, and behind it all a vine-choked
// stepped temple with glowing jade eyes, giant buttress-rooted kapok trees, a
// thundering waterfall, macaws, butterflies, fireflies and a swinging monkey,
// under a humid golden sky with god rays over misty jungle mountains.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, mulberry32, bayer,
  paintGradient, paintClouds, px, disc, skyTexture, parallaxWidth, canvasTex, rockGrid,
} from './kit.js';
import {
  pixels, ridge, setInst, liveInst, fitSky, rippleTex, scrollPlane, fallSheet, fallsTex, addFlyers, orbitList, addParticles, addFlames, zoneDisc, anchor,
} from './wildsKit.js';

const C = {
  leaf: 0x2f9a3e, leafD: 0x1f7a36, leafL: 0x55c25a, leafLL: 0x86dc6a, leafDD: 0x165a2a,
  moss: 0x4a9a3a, mossL: 0x6ab84a, mossD: 0x3a7a32,
  stone: 0x9aa48a, stoneL: 0xb8bea4, stoneD: 0x7a846a, stoneDD: 0x5a6450, stoneW: 0xc8ccb0,
  dirt: 0x7a5a3a, dirtD: 0x5a4026, dirtL: 0x9a7448, litter: 0x8a6a3a,
  wood: 0x9a6a3c, woodD: 0x6a4a2a, woodL: 0xb8844a, bark: 0x9a7a58, barkD: 0x6e543a,
  water: 0x2fb8a8, waterL: 0x7ae8d8, waterD: 0x1a8a8a, foam: 0xe8fff8,
  gold: 0xffc21a, goldL: 0xffe680, goldD: 0xc8901a, jade: 0x3fe8a0, jadeD: 0x1aa870,
  canvas: 0x6a8a3a, canvasD: 0x4a6a2a, canvasL: 0x8aa84a, orange: 0xff8a1a, red: 0xe8343c, ink: 0x1a1a24,
  cream: 0xf4ecd0, clay: 0xc8783a, clayD: 0x9a5a2a, clayL: 0xe0985a, rope: 0xd8c08a, blue: 0x29b6f6,
};
const LH = FIELD.LANE_HALF;
const ZONE_SCALE = 1.18;
const CREEK = (x) => 6.4 + Math.sin(x * 0.17) * 0.6 + Math.sin(x * 0.05 + 2) * 0.8; // creek centre line (front)

// --------------------------------------------------------------------------- voxel props

/** Vine-choked stepped temple (Mayan style) with a panther-face shrine. Front (+z) stair. Hollow shell. */
const templeGrid = (lod = false) => () => {
  const g = new VoxGrid();
  const tiers = 7, base = 46, step = 5, th = 7;
  const stoneC = (x, y, z) => {
    if (lod) return ((y >> 1) & 1) ? C.stone : C.stoneL;
    const blk = hash3(x >> 2, y >> 1, z >> 2);
    if (blk < 0.12) return C.stoneD;
    if (blk > 0.9) return C.stoneW;
    return ((y >> 1) & 1) ? C.stone : C.stoneL;
  };
  for (let t = 0; t < tiers; t++) {
    const hw = base - t * step, y0 = t * th, y1 = y0 + th - 1;
    for (let y = y0; y <= y1; y++) for (let x = -hw; x < hw; x++) for (let z = -hw; z < hw; z++) {
      const edge = x === -hw || x === hw - 1 || z === -hw || z === hw - 1;
      if (!edge && y !== y1 && y !== y0) continue; // shell only
      // crumbled corners
      if (edge && Math.abs(x + 0.5) > hw - 4 && Math.abs(z + 0.5) > hw - 4 && hash3(x, y, z) < 0.35 && y > y0 + 1) continue;
      let c = stoneC(x, y, z);
      if (y === y1 && (lod ? ((x >> 3) + (z >> 3)) & 1 : hash3(x >> 1, t, z >> 1) < 0.45)) c = lod ? C.moss : hash3(x, y, z) < 0.5 ? C.moss : C.mossL; // moss on the ledges
      if (edge && y === y0 + 3 && (z === hw - 1) && ((x + 64) % 6 < 3)) c = C.stoneDD; // carved frieze
      g.set(x, y, z, c);
    }
  }
  // central stair on the front with balustrades
  const top = tiers * th;
  for (let y = 0; y < top; y++) {
    const zf = base - Math.floor(y / th) * step - Math.floor((y % th) * step / th);
    for (let x = -7; x < 7; x++) {
      const bal = x === -7 || x === 6;
      g.set(x, y, zf, bal ? C.stoneDD : (y & 1) ? C.stoneL : C.stone);
      if (bal) g.set(x, y + 1, zf, C.stoneD);
    }
  }
  // shrine on the top with the panther face doorway
  const ty = top, sw = base - tiers * step + 3;
  g.box(-sw, ty, -sw, sw - 1, ty + 12, sw - 1, (x, y, z) => (y === ty + 12 ? C.stoneDD : stoneC(x, y, z)));
  g.box(-sw - 1, ty + 13, -sw - 1, sw, ty + 14, sw, C.stoneD);
  for (let x = -sw; x < sw; x += 3) g.box(x, ty + 15, -sw, x + 1, ty + 17, -sw + 1, C.stoneL); // roof comb
  g.box(-sw, ty + 15, -2, sw - 1, ty + 19, 1, (x, y) => (((x + 40) % 4 < 2) !== ((y & 1) === 1) ? C.stoneL : C.stone));
  const fz = sw;
  // doorway (dark) shaped like a panther mouth, with fangs + glowing jade eyes above
  g.box(-4, ty, fz - 1, 3, ty + 6, fz, C.ink);
  g.box(-3, ty + 7, fz - 1, 2, ty + 7, fz, C.ink);
  for (const fx of [-3, 2]) g.box(fx, ty + 5, fz, fx, ty + 6, fz, C.stoneW);
  for (const ex of [-5, 4]) g.box(ex - 1, ty + 9, fz, ex + 1, ty + 10, fz, C.jade, true);
  g.box(-6, ty + 11, fz, -2, ty + 11, fz, C.stoneDD).box(1, ty + 11, fz, 5, ty + 11, fz, C.stoneDD);
  // ears on the shrine corners
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) g.box(s * (sw - 1 - k) - (s > 0 ? 0 : 0), ty + 20 + k, fz - 2, s * (sw - 1 - k), ty + 20 + k, fz - 1, C.stone);
  // gold sun disc above the door
  for (let x = -2; x <= 1; x++) for (let y = 0; y < 4; y++) if ((x + 0.5) ** 2 + (y - 1.5) ** 2 < 4.5) g.set(x, ty + 15 + y, 2, y === 3 ? C.goldL : C.gold);
  // hanging vines + trees growing out of the terraces
  for (let k = 0; k < (lod ? 24 : 70); k++) {
    const t = Math.floor(hash3(k, 1, 2) * tiers);
    const hw = base - t * step;
    const side = Math.floor(hash3(k, 3, 4) * 3);
    const u = Math.floor((hash3(k, 5, 6) - 0.5) * 2 * (hw - 3));
    const [x, z] = side === 0 ? [u, hw] : side === 1 ? [-hw - 1, u] : [hw, u];
    if (side === 0 && Math.abs(x) < 9) continue; // keep the stair clear
    const y0 = t * th + th - 1;
    const len = 3 + Math.floor(hash3(k, 7, 8) * (th + 4));
    for (let y = y0; y > Math.max(0, y0 - len); y--) g.set(x, y, z, (y + k) % 4 === 0 ? C.leafL : C.leafD);
    if (k % 6 === 0) g.set(x, y0 - len + 1, z, [0xff4fa3, C.gold, 0xff6a3a][k % 3]);
  }
  for (const [x, z, t] of lod ? [[-30, 20, 1], [26, 28, 0]] : [[-30, 20, 1], [26, 28, 0], [-16, 16, 3], [20, -14, 3]]) {
    const y = (t + 1) * th;
    g.box(x, y, z, x, y + 5, z, C.barkD);
    g.ellipsoid(x, y + 8, z, 5, 3, 5, (xx, yy) => (yy > y + 9 ? C.leafL : hash3(xx, yy, z) < 0.3 ? C.leafD : C.leaf));
  }
  return g;
};

/** Giant buttress-rooted kapok tree (trunk + low limbs; the canopy rises off-screen). */
const kapokGrid = (seed) => () => {
  const g = new VoxGrid();
  const H = 70;
  for (let y = 0; y < H; y++) {
    for (let x = -12; x <= 11; x++) for (let z = -12; z <= 11; z++) {
      const dx = x + 0.5, dz = z + 0.5;
      const a = Math.atan2(dz, dx);
      const fin = y < 16 ? Math.max(0, Math.cos(a * 5 + seed) - 0.5) * (16 - y) * 0.75 : 0;
      const rr = 4.2 + fin + Math.sin(y * 0.2 + seed) * 0.2;
      if (dx * dx + dz * dz > rr * rr) continue;
      if (dx * dx + dz * dz < (rr - 1.6) ** 2 && fin < 1) continue; // hollow core
      const streak = hash3(Math.round(a * 6), y >> 3, seed) < 0.3;
      g.set(x, y, z, y < 4 ? (hash3(x, y, z) < 0.5 ? C.moss : C.mossD) : streak ? C.barkD : (y % 11 === 0 ? 0xb89270 : C.bark));
    }
  }
  // lianas spiralling up + epiphytes (bromeliads, orchids)
  for (let y = 4; y < H; y++) {
    const a = y * 0.18 + seed;
    const x = Math.round(Math.cos(a) * 5.2 - 0.5), z = Math.round(Math.sin(a) * 5.2 - 0.5);
    g.set(x, y, z, (y & 3) === 0 ? C.leafL : C.leafD);
    if (y % 13 === 5) { g.box(x - 1, y, z - 1, x + 1, y + 1, z + 1, C.leaf); g.set(x, y + 2, z, [0xff4fa3, C.gold, 0xff6a3a][y % 3]); }
  }
  // limbs with leafy clumps
  for (const [a, y0, len] of [[seed, 46, 16], [seed + 2.4, 56, 14], [seed + 4.2, 64, 12]]) {
    const ex = Math.round(Math.cos(a) * len), ez = Math.round(Math.sin(a) * len);
    g.line(0, y0, 0, ex, y0 + 6, ez, C.barkD, 1);
    g.ellipsoid(ex, y0 + 8, ez, 7, 3, 7, (x, y) => (y > y0 + 9 ? C.leafL : y < y0 + 7 ? C.leafD : C.leaf));
    for (let k = 0; k < 6; k++) { const vx = ex + Math.round((hash3(k, a, 1) - 0.5) * 10), vz = ez + Math.round((hash3(k, a, 2) - 0.5) * 10); for (let y = y0 + 5; y > y0 - 6 - k * 2; y--) g.set(vx, y, vz, C.leafD); }
  }
  return g;
};

/** Mossy rock cliff (front face +z) for the waterfall, notch in the middle. */
const cliffGrid = () => {
  const g = new VoxGrid();
  const W = 44, H = 52, D = 12;
  for (let x = -W; x < W; x++) for (let z = -D; z <= 0; z++) {
    const ex = Math.abs(x + 0.5) / W;
    let hgt = Math.round(H * (1 - Math.pow(ex, 3)) * (0.82 + 0.18 * vnoise(x * 0.15, 2, z * 0.2)) + (z + D) * 0.2);
    if (Math.abs(x + 0.5) < 5) hgt -= 3; // the falls' notch
    for (let y = 0; y < hgt; y++) {
      const top = y >= hgt - 2;
      const strata = vnoise(x * 0.3, y * 0.12, z * 0.3);
      let c = top ? (hash3(x, y, z) < 0.5 ? C.moss : C.mossL) : strata > 0.6 ? 0x8a8a7a : strata > 0.4 ? 0x6e7466 : 0x5a6052;
      if (!top && z === 0 && hash3(x >> 1, y >> 2, 3) < 0.18) c = C.mossD; // moss streaks
      g.set(x, y, z, c);
    }
    // ferny overhang
    if (z === 0 && hash3(x, 5, 1) < 0.5) g.set(x, hgt, 1, C.leaf);
  }
  // ledges with ferns down the face
  for (const [x, y] of [[-30, 30], [-18, 20], [16, 26], [28, 14], [-24, 10]]) g.box(x - 3, y, 1, x + 3, y, 3, C.mossD).box(x - 2, y + 1, 2, x + 2, y + 1, 3, C.leaf);
  return g;
};

/** Ridge tent (green canvas) facing +z. */
const tentGrid = () => {
  const g = new VoxGrid();
  for (let z = -8; z <= 8; z++) for (let y = 0; y <= 9; y++) {
    const hw = 10 - y;
    for (let x = -hw; x <= hw; x++) {
      if (Math.abs(x) < hw - 1 && Math.abs(z) < 8) continue;
      const door = z === 8 && Math.abs(x) <= Math.max(0, 4 - y * 0.6) && y < 6;
      g.set(x, y, z, door ? 0x2a3a1a : y === 9 ? C.canvasD : (Math.abs(x) === hw ? C.canvasD : (x + 20) % 5 === 0 ? C.canvasD : C.canvas));
    }
  }
  g.box(0, 0, -10, 0, 11, -10, C.woodD).box(0, 0, 10, 0, 11, 10, C.woodD);
  g.line(0, 11, 10, 0, 0, 15, C.rope);
  g.line(0, 11, -10, 0, 0, -15, C.rope);
  // door flap rolled up + MrBeast patch
  g.box(-3, 6, 9, 3, 6, 9, C.canvasL);
  g.box(-6, 4, 9, -5, 5, 9, C.blue);
  return g;
};
const campfireGrid = () => {
  const g = new VoxGrid();
  for (let a = 0; a < 10; a++) { const an = (a / 10) * Math.PI * 2; g.box(Math.round(Math.cos(an) * 5), 0, Math.round(Math.sin(an) * 5), Math.round(Math.cos(an) * 5), 1, Math.round(Math.sin(an) * 5), a & 1 ? 0x8a8a7a : 0x6e7466); }
  g.line(-4, 0, -2, 3, 2, 2, C.woodD, 0).line(-3, 0, 3, 4, 2, -2, C.wood, 0).line(0, 0, -4, 0, 2, 4, C.woodD, 0);
  g.box(-1, 0, -1, 1, 0, 1, 0x3a2a20);
  // tripod + cooking pot
  g.line(-5, 0, -4, 0, 12, 0, C.woodD).line(5, 0, -4, 0, 12, 0, C.woodD).line(0, 0, 6, 0, 12, 0, C.woodD);
  g.line(0, 12, 0, 0, 8, 0, 0x3d4352);
  g.box(-2, 5, -2, 2, 7, 2, (x, y) => (y === 7 ? 0x5a6272 : 0x3d4352));
  g.box(-1, 7, -1, 1, 7, 1, 0xd8b060);
  return g;
};
const backpackGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -2, 2, 8, 2, (x, y) => (y === 8 ? 0xc84a1a : y > 5 ? 0xe86a2a : 0xd85a22));
  g.box(-2, 2, 3, 1, 5, 3, 0xc84a1a);
  g.box(-3, 9, -1, 2, 10, 1, 0x3a5a8a);
  g.box(-4, 0, -1, -4, 7, 0, 0x2a2a3a).box(3, 0, -1, 3, 7, 0, 0x2a2a3a);
  g.set(-1, 4, 4, C.gold);
  return g;
};
const hammockGrid = () => {
  const g = new VoxGrid();
  for (let x = -14; x <= 14; x++) {
    const sag = Math.round((1 - (x / 14) ** 2) * 6);
    for (let z = -2; z <= 2; z++) g.set(x, 14 - sag, z, ((x + 20) % 4 < 2) ? 0xe8343c : 0xffd23f);
    if (Math.abs(x) > 11) g.set(x, 14 - sag + 1, 0, C.rope);
  }
  for (const x of [-16, 16]) g.box(x, 0, -1, x + 1, 18, 0, C.barkD);
  g.box(-18, 18, -3, -13, 21, 2, C.leaf).box(13, 18, -3, 18, 21, 2, C.leaf);
  return g;
};

/** Broken temple column with vines. */
const columnGrid = (seed, h) => () => {
  const g = new VoxGrid();
  g.box(-4, 0, -4, 3, 1, 3, C.stoneD);
  for (let y = 2; y < h; y++) {
    const broken = y > h - 4 && hash3(seed, y, 1) < 0.5;
    for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
      if ((x + 0.5) ** 2 + (z + 0.5) ** 2 > 9.5) continue;
      if (broken && (x + z + seed) % 3 === 0) continue;
      g.set(x, y, z, (Math.atan2(z + 0.5, x + 0.5) * 3 + 10) % 2 < 1 ? C.stone : C.stoneL);
    }
  }
  if (h > 16) g.box(-4, h, -4, 3, h + 1, 3, C.stoneD);
  for (let y = h; y > 2; y -= 1) { const a = y * 0.5 + seed; g.set(Math.round(Math.cos(a) * 3.4 - 0.5), y, Math.round(Math.sin(a) * 3.4 - 0.5), (y & 1) ? C.leaf : C.leafD); }
  g.box(-5, 0, 2, -3, 1, 4, C.leaf);
  return g;
};
/** Half-buried giant carved panther head (mossy stone, jade eyes), facing +z. */
const pantherHeadGrid = () => {
  const g = new VoxGrid();
  const st = (x, y, z) => (hash3(x >> 1, y >> 1, z >> 1) < 0.2 ? C.stoneD : y > 14 && hash3(x, y, z) < 0.25 ? C.moss : C.stone);
  g.ellipsoid(0, 9, 0, 13, 11, 10, st);
  g.ellipsoid(0, 6, 7, 8, 6, 5, st);
  for (const s of [-1, 1]) for (let y = 17; y <= 26; y++) { const t = (y - 17) / 9, cx = s * (8 + t * 3), hw = 5 * (1 - t) + 0.6; for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) if (Math.abs(x - cx) <= hw) g.box(x, y, -3, x, y, 2, Math.abs(x - cx) < hw - 1.6 && t < 0.7 ? C.stoneD : C.stone); }
  // brow + eyes + nose + fangs
  for (const s of [-1, 1]) {
    g.box(s > 0 ? 2 : -8, 14, 8, s > 0 ? 7 : -3, 15, 10, C.stoneDD);
    g.box(s > 0 ? 3 : -6, 11, 9, s > 0 ? 5 : -4, 12, 10, C.jade, true);
  }
  g.box(-2, 8, 12, 1, 9, 12, C.ink);
  g.box(-5, 3, 11, 4, 3, 11, C.ink);
  for (const fx of [-4, 3]) g.box(fx, 1, 11, fx, 2, 11, C.stoneW);
  // sunk into the ground + roots over it
  g.carve((x, y) => y < 0);
  g.line(-12, 0, 4, -6, 18, 6, C.barkD, 0).line(10, 0, -2, 4, 20, 2, C.barkD, 0);
  g.paint((x, y, z, c) => (c === C.stone && !g.has(x, y + 1, z) && hash3(x >> 1, 9, z >> 1) < 0.5 ? C.mossL : undefined));
  return g;
};
/** Stone brazier (flames animate on top). */
const brazierGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -2, 1, 1, 1, C.stoneD);
  g.box(-1, 2, -1, 0, 9, 0, C.stone);
  g.box(-3, 10, -3, 2, 12, 2, (x, y, z) => (y === 12 && Math.abs(x + 0.5) < 2 && Math.abs(z + 0.5) < 2 ? 0x3a2a20 : C.stoneL));
  for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) g.set(x, 13, z, C.stoneD);
  g.set(-1, 6, 1, C.jade);
  return g;
};
/** Carved stele with glyphs. */
const steleGrid = (seed) => () => {
  const g = new VoxGrid();
  g.box(-4, 0, -1, 3, 18, 1, (x, y) => (y === 18 ? C.stoneD : C.stone));
  for (let y = 3; y < 17; y += 4) for (let x = -3; x <= 2; x += 3) {
    const k = Math.floor(hash3(seed, x, y) * 4);
    if (k === 0) g.box(x, y, 2, x + 1, y + 2, 2, C.stoneDD);
    else if (k === 1) g.set(x, y, 2, C.stoneDD).set(x + 1, y + 1, 2, C.stoneDD).set(x, y + 2, 2, C.stoneDD);
    else if (k === 2) g.box(x, y + 1, 2, x + 1, y + 1, 2, C.jadeD);
    else g.set(x, y + 2, 2, C.stoneDD).set(x + 1, y, 2, C.stoneDD);
  }
  g.box(-5, 0, -2, 4, 0, 2, C.moss);
  for (let y = 0; y < 12; y++) g.set(-4 + ((y >> 1) & 1), y, 2, C.leafD);
  return g;
};
/** Broken vine-draped stone arch spanning +-x. */
const archGrid = () => {
  const g = new VoxGrid();
  for (const x of [-14, 10]) g.box(x, 0, -2, x + 3, 22, 2, (xx, y) => (y % 6 === 0 ? C.stoneD : C.stone));
  for (let k = 0; k <= 24; k++) {
    if (k > 15 && k < 19) continue; // collapsed section
    const x = -12 + k, y = 22 + Math.round(Math.sin((k / 24) * Math.PI) * 6);
    g.box(x, y, -2, x, y + 2, 2, (k & 1) ? C.stone : C.stoneL);
  }
  g.box(4, 0, 4, 9, 2, 8, C.stoneD).box(6, 3, 5, 8, 4, 7, C.stone); // fallen blocks
  for (let k = 0; k < 14; k++) { const x = -12 + k * 2, top = 22 + Math.round(Math.sin(((x + 12) / 24) * Math.PI) * 6); for (let y = top - 1; y > top - 4 - (k * 7) % 9; y--) g.set(x, y, 0, (y + k) % 3 ? C.leafD : C.leaf); }
  return g;
};
const monsteraGrid = (seed) => () => {
  const g = new VoxGrid();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + seed;
    const len = 6 + Math.floor(hash3(seed, k, 1) * 4);
    for (let r = 0; r < len; r++) {
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r), y = Math.round(Math.sin((r / len) * Math.PI) * 4 + r * 0.4);
      const w = r > 1 && r < len - 1 ? 1 : 0;
      for (let d = -w; d <= w; d++) {
        const xx = x + Math.round(-Math.sin(a) * d), zz = z + Math.round(Math.cos(a) * d);
        if ((r + d + k) % 4 === 0 && w) continue; // monstera holes
        g.set(xx, y, zz, d === 0 ? C.leafD : r > len - 3 ? C.leafL : C.leaf);
      }
    }
  }
  return g;
};
const urnGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 9; y++) { const r = y < 1 ? 1.8 : y < 6 ? 2.8 + Math.sin(y * 0.5) * 0.6 : 1.6; g.cylinder(-0.5, -0.5, y, y, r, y === 3 || y === 4 ? ((y + 1) & 1 ? C.clayD : C.ink) : C.clay); }
  g.cylinder(-0.5, -0.5, 9, 9, 2.2, C.clayL);
  g.paint((x, y, z, c) => (y === 4 && (x + z) % 2 === 0 ? C.gold : undefined));
  return g;
};
const crateGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 5, 2, (x, y) => (y % 2 ? C.wood : C.woodL));
  for (const [a, b] of [[-4, -3], [3, -3], [-4, 2], [3, 2]]) g.box(a, 0, b, a, 5, b, C.woodD);
  g.box(-4, 5, -3, 3, 5, 2, C.woodD);
  text(g, 'BEAST', 0, 1, 3, '+z', C.ink, { center: true });
  g.box(-3, 6, -2, 0, 7, 1, 0xffd23f); // bananas on top
  return g;
};
const idolGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 2, 1, 2, C.stoneD);
  g.box(-2, 2, -2, 1, 10, 1, (x, y) => (y > 8 ? C.goldL : C.gold));
  g.box(-3, 7, -2, 2, 8, 1, C.gold);
  g.set(-2, 9, 2, C.jade, true).set(1, 9, 2, C.jade, true);
  g.box(-1, 5, 2, 0, 5, 2, C.goldD);
  g.box(-3, 11, -1, -2, 12, 0, C.gold).box(1, 11, -1, 2, 12, 0, C.gold);
  return g;
};
const mossBlockGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 5, 2, (x, y, z) => (y === 5 ? (hash3(x, y, z) < 0.6 ? C.moss : C.mossL) : hash3(x, y >> 1, z) < 0.2 ? C.stoneD : C.stone));
  g.box(-2, 2, 3, 1, 3, 3, C.stoneDD);
  return g;
};
const lilyGrid = (flower) => () => {
  const g = new VoxGrid();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z <= 10 && !(x > 0 && Math.abs(z) < 1)) g.set(x, 0, z, (x + z) & 1 ? 0x3fae48 : 0x4fc054);
  if (flower) g.set(-1, 1, -1, 0xff8ac0).set(-2, 1, -1, 0xffffff).set(-1, 1, -2, 0xffffff).set(-1, 2, -1, 0xffd23f);
  return g;
};
const pebbleGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -1, 1, 0, 1, C.stoneD).box(-1, 1, 0, 0, 1, 0, C.mossL).set(2, 0, 1, C.stone);
  return g;
};
const rootGrid = () => {
  const g = new VoxGrid();
  g.line(-8, 0, 0, -2, 1, 1, C.barkD, 0).line(-2, 1, 1, 5, 0, -1, C.bark, 0).line(0, 1, 1, 3, 0, 4, C.barkD, 0);
  g.set(-4, 1, 0, C.mossL).set(2, 1, 0, C.mossL);
  return g;
};
const shroomGrid = () => {
  const g = new VoxGrid();
  for (const [x, z, h, c] of [[0, 0, 2, 0xe8343c], [2, 1, 1, 0xff8a1a], [-2, 1, 1, 0xe8343c]]) {
    g.box(x, 0, z, x, h - 1, z, 0xf4ecd8);
    g.box(x - 1, h, z - 1, x + 1, h, z + 1, c);
    g.set(x, h, z, 0xffffff);
  }
  return g;
};
const fernGrid = () => {
  const g = new VoxGrid();
  for (let a = 0; a < 7; a++) {
    const an = (a / 7) * Math.PI * 2;
    for (let r = 0; r <= 4; r++) g.set(Math.round(Math.cos(an) * r), r < 3 ? 0 : 0, Math.round(Math.sin(an) * r), r > 2 ? C.leafL : C.leaf);
  }
  return g;
};
/** Butterfly body + wing (flyer parts). */
const flyBodyGrid = () => { const g = new VoxGrid(); g.box(0, 0, -1, 0, 0, 1, C.ink); return g; };
const flyWingGrid = (c) => () => { const g = new VoxGrid(); g.box(0, 0, -1, 2, 0, 0, c); g.set(1, 0, 1, c).set(2, 0, -1, shade(c, -0.3)); return g; };
const macawBodyGrid = (c) => () => {
  const g = new VoxGrid();
  g.box(-1, 0, -2, 0, 1, 2, c);
  g.box(-1, 1, 3, 0, 2, 3, c).set(-1, 1, 4, 0xfff2c8).set(0, 1, 4, 0x2a2a2a);
  g.box(-1, 0, -6, 0, 0, -3, shade(c, -0.15));
  return g;
};
const macawWingGrid = (c) => () => {
  const g = new VoxGrid();
  for (let x = 0; x <= 6; x++) for (let z = -1; z <= (x < 4 ? 1 : 0); z++) g.set(x, 0, z, x > 4 ? C.blue : x > 2 ? C.gold : c);
  return g;
};
const monkeyGrid = () => {
  const g = new VoxGrid();
  const f = 0x7a4a2a, fl = 0xe0b088;
  g.ellipsoid(0, -6, 0, 2, 3, 2, f);
  g.ellipsoid(0, -1, 0, 2, 2, 2, f);
  g.box(-1, -2, 2, 0, 0, 2, fl);
  g.set(-1, 0, 3, C.ink).set(1, 0, 3, C.ink);
  g.box(-1, 1, 0, -1, 7, 0, f); // arm up holding the vine
  g.box(2, -6, 0, 3, -4, 0, f).box(-3, -10, 0, -2, -8, 0, f);
  g.line(0, -9, -1, 4, -13, -3, f);
  g.set(-3, -1, 0, fl).set(2, -1, 0, fl);
  return g;
};

// --------------------------------------------------------------------------- painted backdrops

function paintJungleSky(ctx, w, h) {
  const P = pixels(ctx, w, h);
  // god rays from the upper right
  const sx = w * 0.78, sy = h * 0.1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = Math.atan2(y - sy, x - sx);
    const ray = Math.sin(a * 23) * 0.5 + Math.sin(a * 9 + 1) * 0.5;
    if (ray > 0.55 && y > sy && bayer(x, y) < 0.5) P.set(x, y, 0xfff6c8, 0.18);
  }
  P.flush();
  for (let k = 3; k >= 1; k--) { ctx.globalAlpha = 0.12 * k; disc(ctx, sx, sy, 9 + k * 4, 0xfff4c0); }
  ctx.globalAlpha = 1;
  disc(ctx, sx, sy, 8, 0xfffbe0);
  paintClouds(ctx, w, h, { n: 4, y0: 8, y1: h * 0.3, size: 6, seed: 41, color: 0xf6f8e0, shade: 0xb8d8b0, light: 0xffffff });
  // distant birds
  const R = mulberry32(5);
  for (let i = 0; i < 9; i++) { const x = R() * w | 0, y = 10 + (R() * h * 0.3 | 0); px(ctx, x - 1, y, 1, 1, 0x2a4a3a); px(ctx, x + 1, y, 1, 1, 0x2a4a3a); px(ctx, x, y + 1, 1, 1, 0x2a4a3a); }
}

function paintFarMountains(ctx, w, h) {
  const P = pixels(ctx, w, h);
  ridge(P, { base: h * 0.42, amp: h * 0.24, freq: 0.012, seed: 3, peaks: 1.3, color: 0x8ac8b0, rim: 0xc8f0d8 });
  const t2 = ridge(P, { base: h * 0.58, amp: h * 0.18, freq: 0.02, seed: 7, color: 0x5aa888, rim: 0x8ad0a8, dark: 0x4a9878 });
  // tree bumps on the nearer ridge
  const R = mulberry32(12);
  for (let x = 0; x < w; x += 2) { const t = t2[x]; const r = 1 + (R() * 2 | 0); for (let dy = -r; dy <= 0; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) P.set(x + dx, t + dy, dy === -r ? 0x7ac898 : 0x5aa888); }
  // a ribbon waterfall on a cliff + a lost pyramid on a ridge
  const fx = Math.round(w * 0.22);
  for (let y = t2[fx] - 26; y < h; y++) for (let dx = 0; dx < 3; dx++) P.set(fx + dx, y, (y + dx * 3) % 5 === 0 ? 0xffffff : 0xd8f8f0);
  const pxx = Math.round(w * 0.66), py = t2[pxx] + 1;
  for (let k = 0; k < 6; k++) P.rect(pxx - 14 + k * 2, py - 3 - k * 3, 28 - k * 4, 3, k & 1 ? 0x6a9a80 : 0x5a8a72);
  P.rect(pxx - 2, py - 22, 4, 4, 0x4a7a62);
  // mist bands
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (P.alpha(x, y) && y > h * 0.62 && bayer(x, y) < (y - h * 0.62) / (h * 0.5)) P.set(x, y, 0xd8f0e0, 0.6);
  }
  P.flush();
}

function paintCanopy(ctx, w, h, o) {
  const P = pixels(ctx, w, h);
  const R = mulberry32(o.seed);
  const base = h * o.base;
  // overlapping round crowns + emergent trees
  const crowns = [];
  for (let x = -10; x < w + 10; x += 5 + (R() * 6 | 0)) crowns.push([x, base - R() * h * o.var, 6 + R() * 8]);
  for (let k = 0; k < o.emergent; k++) { const x = R() * w | 0; crowns.push([x, base - h * (o.var + 0.25) - R() * h * 0.1, 10 + R() * 6, true]); }
  crowns.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, r, em] of crowns) {
    if (em) for (let y = Math.round(cy); y < h; y++) P.rect(Math.round(cx) - 1, y, 2, 1, o.trunk);
    for (let y = -r; y <= r * 0.6; y++) for (let x = -r * 1.2; x <= r * 1.2; x++) {
      if ((x / (r * 1.2)) ** 2 + (y / r) ** 2 > 1) continue;
      const lit = y < -r * 0.35 && x < r * 0.3;
      P.set(cx + x, cy + y, lit ? o.light : y > r * 0.25 ? o.dark : o.color);
    }
  }
  for (let y = Math.round(base); y < h; y++) for (let x = 0; x < w; x++) P.set(x, y, bayer(x, y) < 0.4 ? o.dark : o.color);
  // palm silhouettes
  for (let k = 0; k < (o.palms ?? 0); k++) {
    const x = R() * w | 0, hh = 14 + (R() * 10 | 0), bx = Math.round(base);
    for (let y = 0; y < hh; y++) P.set(x + Math.round(Math.sin(y * 0.15) * 2), bx - y, o.trunk);
    const tx = x + Math.round(Math.sin(hh * 0.15) * 2), ty = bx - hh;
    for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1]]) for (let i = 1; i <= 7; i++) P.set(tx + dx * i, ty + dy * Math.round(i * i / 9), i & 1 ? o.color : o.dark);
  }
  P.flush();
}

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  const sky = skyTexture('jungle', [[0, 0x1a6a72], [0.16, 0x2f8a8a], [0.3, 0x5aaa98], [0.46, 0x9ad0a8], [0.62, 0xd8eab8], [1, 0xf4f0c8]], paintJungleSky);
  fitSky(K, sky);

  // ---- parallax: misty mountains, canopy, near jungle wall
  K.parallax('mountains', { z: -164, y: -3, w: parallaxWidth(-164), h: 42, tw: 400, th: 112, paint: paintFarMountains, fogTint: [0xb8e0c8, 0.2] });
  K.parallax('canopy', {
    z: -126, y: -2, w: parallaxWidth(-126), h: 24, tw: 360, th: 72,
    paint: (ctx, w, h) => paintCanopy(ctx, w, h, { seed: 4, base: 0.7, var: 0.25, emergent: 6, color: 0x3a8a5a, dark: 0x2a6a4a, light: 0x5aaa6a, trunk: 0x4a5a3a }),
    fogTint: [0xb8e0c8, 0.14],
  });
  K.parallax('jungleWall', {
    z: -90, y: -1.5, w: parallaxWidth(-90), h: 13, tw: 320, th: 52,
    paint: (ctx, w, h) => paintCanopy(ctx, w, h, { seed: 9, base: 0.72, var: 0.3, emergent: 3, palms: 9, color: 0x2a7a3e, dark: 0x1a5a32, light: 0x4a9a4a, trunk: 0x4a3a2a }),
    fogTint: [0xb8e0c8, 0.06],
  });

  // ---- ground: far jungle floor, near leaf litter, the creek in front
  const floor = (x, z, fine) => {
    const n = vnoise(x * 0.09, 3, z * 0.11), m = hash3(Math.floor(x * (fine ? 2 : 1)), 7, Math.floor(z * (fine ? 2 : 1)));
    if (m < 0.03) return C.litter;
    if (fine && m > 0.992) return [0xff4fa3, 0xffd23f, 0xffffff][Math.floor(m * 1000) % 3];
    if (n > 0.68) return C.mossL;
    if (n < 0.24) return m < 0.5 ? C.dirtL : 0x6a8a3a;
    if (n < 0.34) return C.mossD;
    return m < 0.5 ? C.moss : 0x55a83e;
  };
  K.ground({ id: 'groundFar', x0: -120, x1: 120, z0: -48, z1: -14, scale: 1, color: (x, z) => floor(x, z, false) });
  K.ground({
    id: 'groundNear', x0: -64, x1: 64, z0: -14, z1: 30, scale: 0.5,
    skip: (x, z) => Math.abs(z + 0.25 - CREEK(x + 0.25)) < 1.6,
    color: (x, z) => {
      if (Math.abs(z) < LH + 0.3) return C.dirtD;
      const d = Math.abs(z + 0.25 - CREEK(x + 0.25));
      if (d < 2.2) return hash3(Math.floor(x * 2), 1, Math.floor(z * 2)) < 0.5 ? C.stoneD : 0x6a6a5a; // creek stones
      return floor(x, z, true);
    },
  });
  K.ground({ id: 'groundFront', x0: -100, x1: 100, z0: 30, z1: 80, scale: 1, color: (x, z) => (vnoise(x * 0.08, 5, z * 0.08) > 0.6 ? C.mossL : hash3(x, 3, z) < 0.3 ? 0x55a83e : C.moss) });
  // creek: teal water + bed
  const tCreek = rippleTex('jg_creek', 0xc8f0e8, 0xffffff, 0x9ad8d0, 0xffffff);
  scrollPlane(K, { tex: tCreek, w: 140, d: 4.4, y: -0.22, z: 6.4, tile: 3, sx: 0.03, sy: 0, grad: (t) => mixHex(0x1a8a8a, 0x2fb8a8, t), name: 'creek', segs: 2 });

  // ---- lane: ancient flagstone causeway with carved kerbs
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.stoneDD,
    color: (ix, iz, x, z) => {
      if (iz <= -9 || iz >= 8) return ((ix >> 2) & 1) ? C.stoneD : (ix & 3) === 1 ? C.stoneDD : C.stone;
      const bx = Math.floor((ix + (iz >> 2 & 1) * 2) / 4), bz = iz >> 2;
      const gx = ((ix + (iz >> 2 & 1) * 2) % 4 + 4) % 4, gz = ((iz % 4) + 4) % 4;
      if (gx === 0 || gz === 0) return hash3(bx, bz, 3) < 0.55 ? C.mossD : C.stoneDD; // mossy grout
      const h = hash3(bx, bz, 1);
      if (hash3(ix, iz, 5) < 0.05) return C.mossL;
      if (h < 0.08 && gx === 2) return C.stoneDD; // crack
      return h < 0.3 ? C.stoneL : h > 0.8 ? 0x8e9a7e : C.stone;
    },
    raise: (ix, iz) => (iz === -10 || iz === 9) && ((ix >> 2) & 1) === 0,
    raiseColor: (ix) => ((ix & 3) === 0 ? C.stoneDD : C.stoneL),
  });
  // jade + gold sun-disc centre marker
  K.mesh('sunDisc', () => {
    const g = new VoxGrid();
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      const r = Math.hypot(x, z);
      if (r > 5.4) continue;
      const a = Math.atan2(z, x);
      g.set(x, 0, z, r < 1.6 ? C.jade : r > 4.4 ? C.goldD : Math.sin(a * 8) > 0.3 ? C.gold : C.stoneDD, r < 1.6);
    }
    return g;
  }, { scale: 0.11, pivot: [0, 0, 0] }, 0.06, 0.003, 1.2);

  // ---- breakables right behind the lane
  const brk = [[-19, 'urn'], [-9.6, 'crate'], [-3.3, 'idol'], [4.4, 'urn'], [10.2, 'block'], [18.6, 'crate']];
  for (const [x, kind] of brk) {
    if (kind === 'urn') K.breakable('pot', 'urn', urnGrid, { scale: 0.1 }, x, -3.2, K.rand(0, 6));
    else if (kind === 'crate') K.breakable('crate', 'supplyCrate', crateGrid, { scale: 0.11 }, x, -3.3, K.rand(-0.3, 0.3));
    else if (kind === 'idol') K.breakable('idol', 'goldIdol', idolGrid, { scale: 0.09 }, x, -3.2, K.rand(-0.3, 0.3));
    else K.breakable('block', 'mossBlock', mossBlockGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.2, 0.2));
  }

  // ---- midground: explorers' camp, ruins, braziers, carved panther head, arch
  K.mesh('tent', tentGrid, { scale: 0.13, ao: true }, -17.4, 0, -8.6, 0.25, 1, { shadow: true });
  K.mesh('campfire', campfireGrid, { scale: 0.09, ao: true }, -12.6, 0, -6.4, 0, 1, { shadow: true });
  addFlames(K, 'jcf', [[-12.6, 0.12, -6.4, 1.1]], 0.1);
  K.mesh('backpack', backpackGrid, { scale: 0.08, ao: true }, -14.4, 0, -5.4, 0.6, 1, { shadow: true });
  K.mesh('hammock', hammockGrid, { scale: 0.11 }, -24, 0, -11.5, 0.1, 1, { shadow: true });
  K.mesh('sign50', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 12, 0, C.woodD);
    g.box(-8, 9, 1, 8, 15, 1, C.wood);
    text(g, '50H', 0, 10, 2, '+z', C.cream, { center: true });
    return g;
  }, { scale: 0.08, ao: true }, -9.4, 0, -6.8, 0.3, 1, { shadow: true });
  K.inst('column', columnGrid(1, 22), { scale: 0.12, ao: true }, [[-5.6, 0, -7.6, 0.2], [7.2, 0, -8.4, 1.1], [15.5, 0, -6.4, 2]], { shadow: true });
  K.inst('columnB', columnGrid(2, 12), { scale: 0.12, ao: true }, [[-1.4, 0, -9.6, 0.5], [12.6, 0, -11.8, 0.9], [25, 0, -7.6, 1.5], [-27.5, 0, -6.2, 0.2]], { shadow: true });
  K.inst('brazier', brazierGrid, { scale: 0.1, ao: true }, [[-7.4, 0, -4.8], [1.4, 0, -5.2], [9.6, 0, -5.0], [21.6, 0, -4.8], [-22, 0, -4.8]], { shadow: true });
  addFlames(K, 'jbz', [[-7.4, 1.3, -4.8], [1.4, 1.3, -5.2], [9.6, 1.3, -5.0], [21.6, 1.3, -4.8], [-22, 1.3, -4.8]], 0.08);
  K.mesh('pantherHead', pantherHeadGrid, { scale: 0.14, ao: true }, 3.8, 0, -10.6, -0.12, 1, { shadow: true });
  K.inst('stele', steleGrid(3), { scale: 0.11, ao: true }, [[-2.6, 0, -6.6, 0.1], [18.4, 0, -9.6, -0.3], [-31, 0, -9, 0.4]], { shadow: true });
  K.mesh('arch', archGrid, { scale: 0.14 }, 14, 0, -16.5, -0.15, 1, { shadow: true });
  K.inst('monstera', monsteraGrid(1), { scale: 0.12 }, [[-3.6, 0, -4.6, 0.3], [6, 0, -4.6, 2.1], [13.6, 0, -5.2, 1], [-19.8, 0, -4.8, 4], [26, 0, -5.4, 0.5], [-28.4, 0, -5, 2.4]]);
  K.inst('monstera2', monsteraGrid(3), { scale: 0.16 }, [[-11, 0, -11.6, 0.3], [9, 0, -13.4, 1.5], [-33, 0, -12.6, 0.8], [31, 0, -11, 2.2], [0, 0, -13.6, 4]]);
  K.inst('boulder', () => rockGrid({ color: 0x7a846a, r: 4 }), { scale: 0.14 }, [[-25.5, 0, -4.6, 0.4], [27, 0, -4.4, 1.2], [-36, 0, -6.4, 2], [37, 0, -7.2, 0.1]]);

  // ---- landmarks: the temple, giant kapoks, the waterfall cliff + pool
  K.mesh('temple', templeGrid(false), { scale: 0.2 }, 3, 0, -34, 0, 1, { shadow: true });
  K.inst('kapok', kapokGrid(1), { scale: 0.22 }, [[-21.5, 0, -19.5, 0.4], [33, 0, -17.5, 2.2]], { shadow: true });
  K.inst('kapokFar', kapokGrid(3), { scale: 0.26 }, [[-44, 0, -36, 1], [52, 0, -40, 3.5], [-14, 0, -48, 0.4]], {});
  const CR = -0.3;
  K.mesh('cliff', cliffGrid, { scale: 0.26, pivot: [0, 0, 1] }, 22, 0, -28, CR, 1, { shadow: true });
  // waterfall sheet + pool + spray
  const fallX = 22 + Math.sin(CR) * 0.2, fallZ = -28 + Math.cos(CR) * 0.2;
  const tFalls = fallsTex('jg_falls', [0x8fe6f6, 0xc8f6fc, 0x6fd8ee, 0xffffff]);
  fallSheet(K, { tex: tFalls, x: fallX, y: 0, z: fallZ, w: 2.6, h: 12.2, ry: CR, speed: 1.5, tile: 1.6 });
  fallSheet(K, { tex: tFalls, x: fallX + 0.3, y: 0, z: fallZ + 0.15, w: 1.2, h: 11.6, ry: CR, speed: 2.1, tile: 1.2, transparent: true, opacity: 0.7 });
  const tPool = rippleTex('jg_pool', 0xd8f8f0, 0xffffff, 0xb0e8e0, 0xffffff);
  K.mesh('poolRim', () => {
    const g = new VoxGrid();
    for (let x = -14; x <= 14; x++) for (let z = -8; z <= 8; z++) { const d = (x / 14) ** 2 + (z / 8) ** 2; if (d > 0.72 && d <= 1.05) g.set(x, 0, z, hash3(x, 0, z) < 0.5 ? C.stoneD : C.moss); }
    return g;
  }, { scale: 0.3, pivot: [0, 0, 0] }, fallX - 1, -0.25, fallZ + 3.4, CR);
  scrollPlane(K, { tex: tPool, w: 7.6, d: 4.4, x: fallX - 1, y: -0.12, z: fallZ + 3.4, tile: 2, sx: 0.02, sy: -0.05, grad: () => 0x5ad8c8, segs: 1, name: 'pool' });
  addParticles(K, 60, [fallX - 1.4, fallX + 1.8, 0, 2.2, fallZ + 0.6, fallZ + 2.4], { color: [0xffffff, 0xd8f8ff], size: [0.06, 0.14], vy: 1.2, drift: 0.8, fadeTop: true });

  // ---- life: macaws, butterflies, fireflies, a swinging monkey
  const macaws = [[0xe8343c, 'macR'], [0x29b6f6, 'macB'], [0x3fc858, 'macG']];
  macaws.forEach(([c, id], k) => addFlyers(K, id, macawBodyGrid(c), macawWingGrid(c), { scale: 0.09 }, orbitList(K, 3, [k * 9 - 9, 10 + k * 1.5, -24 - k * 3], { r0: 6, r1: 12, spread: 5, squash: 0.45 }), { flap: 0.7 }));
  const bfly = [[0xff4fa3, 'bfP'], [0xffd23f, 'bfY'], [0x29b6f6, 'bfB']];
  bfly.forEach(([c, id], k) => addFlyers(K, id, flyBodyGrid, flyWingGrid(c), { scale: 0.06 }, orbitList(K, 4, [k * 12 - 12, 1.2, -6], { r0: 1, r1: 3, spread: 8, dy: 1.5, f0: 14, f1: 20, squash: 0.6 }), { flap: 1.1, bob: 0.5, bank: 0.1, shadow: false }));
  addParticles(K, 36, [-34, 34, 0.4, 4, -16, -4], { color: 0xd8ff7a, glow: 2.2, size: [0.05, 0.08], vy: 0.05, drift: 0.6, twinkle: 2.4 });
  addParticles(K, 50, [-40, 40, 0.5, 12, -30, 4], { color: [0xf8f4c8, 0xe0f0a8], size: [0.03, 0.06], vy: -0.08, drift: 0.4, seed: 77 }); // pollen motes
  const monkey = K.mesh('monkey', monkeyGrid, { scale: 0.07, pivot: [0, 7, 0] }, -21.5 + 3.6, 7.2, -19.5 + 1.4, 0.4);
  const vine = K.mesh('swingVine', () => { const g = new VoxGrid(); for (let y = 0; y < 60; y++) g.set(0, -y, 0, (y & 3) ? C.leafD : C.leaf); return g; }, { scale: 0.07, pivot: [0, 0, 0] }, -21.5 + 3.6, 11.4, -19.5 + 1.4);
  K.onUpdate((dt, t) => {
    const sw = Math.sin(t * 1.3) * 0.5;
    vine.rotation.z = sw;
    monkey.position.set(-17.9 + Math.sin(sw) * 4.2, 11.4 - Math.cos(sw) * 4.2, -18.1);
    monkey.rotation.z = sw;
  });

  // ---- LOW foreground: lily pads on the creek, pebbles, roots, mushrooms, ferns
  const lilies = [], lilyF = [];
  for (let i = 0; i < 30; i++) { const x = K.rand(-44, 44); (i % 4 ? lilies : lilyF).push([x, -0.2, CREEK(x) + K.rand(-1.3, 1.3), K.rand(0, 6), K.rand(0.8, 1.3)]); }
  const lp = K.inst('lily', lilyGrid(false), { scale: 0.1 }, lilies);
  const lf = K.inst('lilyF', lilyGrid(true), { scale: 0.1 }, lilyF);
  K.onUpdate((dt, t) => {
    for (const [im, list] of [[lp, lilies], [lf, lilyF]]) {
      list.forEach(([x, y, z, r, s], i) => setInst(im, i, x + Math.sin(t * 0.3 + r) * 0.15, y + Math.sin(t * 1.2 + r * 3) * 0.02, z, r + Math.sin(t * 0.2 + i) * 0.2, 0, 0, s));
      im.instanceMatrix.needsUpdate = true;
    }
  });
  const pebbles = [], roots = [], shrooms = [], ferns = [];
  for (let i = 0; i < 70; i++) pebbles.push([K.rand(-44, 44), 0, K.rand(LH + 0.6, 30), K.rand(0, 6), K.rand(0.7, 1.6)]);
  for (let i = 0; i < 22; i++) roots.push([K.rand(-40, 40), 0, K.rand(9, 30), K.rand(0, 6), K.rand(0.9, 1.5)]);
  for (let i = 0; i < 30; i++) shrooms.push([K.rand(-40, 40), 0, i < 14 ? K.rand(LH + 0.8, 4.6) : K.rand(9, 28), K.rand(0, 6), K.rand(0.8, 1.3)]);
  for (let i = 0; i < 70; i++) { const x = K.rand(-48, 48), z = K.rand(LH + 0.8, 32); if (Math.abs(z - CREEK(x)) > 2.4) ferns.push([x, 0, z, K.rand(0, 6), K.rand(0.8, 1.5)]); }
  K.inst('pebble', pebbleGrid, { scale: 0.1 }, pebbles.filter(([x, , z]) => Math.abs(z - CREEK(x)) > 1.8));
  K.inst('root', rootGrid, { scale: 0.09 }, roots.filter(([x, , z]) => Math.abs(z - CREEK(x)) > 2.6));
  K.inst('shroom', shroomGrid, { scale: 0.07 }, shrooms);
  K.inst('fernLow', fernGrid, { scale: 0.1 }, ferns);
  const logs = [], tufts = [];
  for (let i = 0; i < 9; i++) { const x = K.rand(-40, 40), z = K.rand(10, 30); if (Math.abs(z - CREEK(x)) > 3) logs.push([x, 0, z, K.rand(-0.6, 0.6), K.rand(0.9, 1.3)]); }
  for (let i = 0; i < 90; i++) { const x = K.rand(-46, 46), z = K.rand(LH + 0.7, 34); if (Math.abs(z - CREEK(x)) > 2) tufts.push([x, 0, z, K.rand(0, 6), K.rand(0.8, 1.6)]); }
  K.inst('fallenLog', () => {
    const g = new VoxGrid();
    for (let x = -12; x <= 11; x++) g.box(x, 0, -2, x, 3, 1, (xx, y, z) => (y === 3 && hash3(x, y, z) < 0.5 ? C.mossL : (x === -12 || x === 11) ? 0xb89270 : (x + y) % 5 === 0 ? C.barkD : C.bark));
    g.box(-13, 1, -1, -13, 2, 0, 0xd8b890).box(4, 4, -1, 5, 4, 0, 0xe8343c).set(5, 5, -1, 0xffffff);
    return g;
  }, { scale: 0.13 }, logs);
  K.inst('tuft', () => {
    const g = new VoxGrid();
    for (const [x, z, h] of [[0, 0, 4], [1, 1, 3], [-1, 1, 3], [1, -1, 2], [-1, -1, 4], [2, 0, 2]]) for (let y = 0; y < h; y++) g.set(x, y, z, y === h - 1 ? C.leafLL : y > 1 ? C.leafL : C.leaf);
    return g;
  }, { scale: 0.09 }, tufts);

  return {
    sky,
    fog: { color: 0xa8d8b8, near: 62, far: 210 },
    lights: { sky: 0xe0ffd8, ground: 0x4a6a3a, hemi: 1.1, sun: 2.1, sunColor: 0xfff0c0, dir: [8, 14, 9], rim: 1.0, rimColor: 0xc8ff9a },
    dust: 0x9a7448,
    bloom: { strength: 0.6, threshold: 1.7, radius: 0.25 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // jungle floor disc with a flagstone court + a little pool under the falls
  zoneDisc(K, 'zoneJungle', {
    r: 22, seed: 2,
    colorTop: (x, z, r, R) => {
      const court = Math.abs(x + 2) < 9 && z > -6 && z < 14;
      if (court) return ((x >> 1) + (z >> 1)) & 1 ? C.stone : C.stoneL;
      if ((x - 12) ** 2 / 30 + (z + 10) ** 2 / 14 < 1) return 0x1a7a7a; // pool bed
      if (r > R - 1.2) return C.mossD;
      return vnoise(x * 0.2, 2, z * 0.2) > 0.6 ? C.mossL : hash3(x, 1, z) < 0.1 ? C.litter : C.moss;
    },
    colorSide: (x, y) => (y > -2 ? C.dirt : (x + y) & 1 ? C.stoneD : 0x6e7466),
  });
  const tPool = rippleTex('jg_poolZ', 0xd8f8f0, 0xffffff, 0xb0e8e0, 0xffffff);
  scrollPlane(K, { tex: tPool, w: 2.6, d: 1.7, x: 3.0, y: 0.04, z: -2.5, tile: 1, sx: 0.02, sy: -0.05, grad: () => 0x5ad8c8, segs: 1, name: 'pool' });
  K.mesh('temple', templeGrid(true), { scale: 0.075 }, -1.6, 0, -2.8, 0, 1, { shadow: true });
  K.mesh('cliff', cliffGrid, { scale: 0.09, pivot: [0, 0, 1] }, 4.0, 0, -4.2, -0.5, 1, { shadow: true });
  const tFalls = fallsTex('jg_fallsZ', [0x8fe6f6, 0xc8f6fc, 0x6fd8ee, 0xffffff]);
  fallSheet(K, { tex: tFalls, x: 4.0 - Math.sin(0.5) * 0.06, y: 0.02, z: -4.2 + Math.cos(0.5) * 0.06, w: 0.9, h: 4.2, ry: -0.5, speed: 1.6, tile: 0.7 });
  addParticles(K, 18, [2.6, 3.8, -0.1, 0.7, -3.4, -2.2], { color: 0xffffff, size: [0.04, 0.08], vy: 0.9, drift: 0.4, fadeTop: true });
  K.inst('kapok', kapokGrid(1), { scale: 0.06 }, [[-5.2, 0, -1.2, 0.4], [5.6, 0, 1.4, 2.2]], { shadow: true });
  K.mesh('tent', tentGrid, { scale: 0.06 }, -4.2, 0, 3.0, 0.7, 1, { shadow: true });
  K.mesh('campfire', campfireGrid, { scale: 0.05 }, -2.4, 0, 4.2, 0, 1, { shadow: true });
  addFlames(K, 'jzf', [[-2.4, 0.06, 4.2, 0.6]], 0.06);
  K.inst('column', columnGrid(1, 22), { scale: 0.055 }, [[1.6, 0, 2.6, 0.2], [-0.6, 0, 1.4, 1.1], [3.4, 0, 3.8, 2]], { shadow: true });
  K.inst('monstera', monsteraGrid(1), { scale: 0.07 }, [[-5.6, 0, 1.2, 0.3], [5.4, 0, 4.2, 2.1], [0.4, 0, 5.4, 1], [-3.2, 0, -5.4, 2.4]]);
  K.mesh('pantherHead', pantherHeadGrid, { scale: 0.05 }, 4.2, 0, 1.0, -0.6, 1, { shadow: true });
  K.inst('brazier', brazierGrid, { scale: 0.05 }, [[-1.0, 0, 2.2], [2.6, 0, 1.0]], { shadow: true });
  addFlames(K, 'jzb', [[-1.0, 0.65, 2.2, 0.5], [2.6, 0.65, 1.0, 0.5]], 0.05);
  [[0xe8343c, 'mz1'], [0x29b6f6, 'mz2']].forEach(([c, id], k) => addFlyers(K, id, macawBodyGrid(c), macawWingGrid(c), { scale: 0.06 }, orbitList(K, 2, [k * 2 - 1, 4.4 + k, -1], { r0: 3, r1: 5, spread: 1, squash: 0.8 }), { flap: 0.7 }));
  addFlyers(K, 'bfz', flyBodyGrid, flyWingGrid(0xff4fa3), { scale: 0.05 }, orbitList(K, 4, [0, 0.8, 2], { r0: 1, r1: 2.5, spread: 3, dy: 0.6, f0: 14, f1: 20, squash: 0.7 }), { flap: 1.1, bob: 0.3, bank: 0.1, shadow: false });
  addParticles(K, 14, [-5, 5, 0.3, 2.5, -4, 5], { color: 0xd8ff7a, glow: 2.2, size: [0.04, 0.06], vy: 0.04, drift: 0.4, twinkle: 2.2 });
  anchor(K, 'boss', -2.6, 0, 5.0);
  anchor(K, 'npc', 2.0, 0, 5.4);
  anchor(K, 'enterTemple', -1.6, 1.2, -1.0);
  K.root.scale.setScalar(ZONE_SCALE); // fill the plinth
  return { focus: [0, 1.2, 0], radius: 7 };
}
