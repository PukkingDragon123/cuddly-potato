// Arena 6: ANTARCTICA OUTPOST — "I Survived 50 Hours In Antarctica".
// Packed-snow lane edged with ice blocks, orange expedition tents and the
// BEAST BASE research station on stilts, snowmobiles, a ceremonial pole ring
// of waving flags, waddling penguins and a wind turbine, an ice shelf that
// drops into a dark iceberg sea, snowy mountain parallax, falling snow and a
// live aurora rippling over a starry polar night.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, glowMat, mulberry32, bayer,
  paintGradient, paintStars, paintSun, px, disc, skyTexture, parallaxWidth, canvasTex, rockGrid,
} from './kit.js';

const C = {
  snow: 0xedf3fb, snow2: 0xe1eaf6, snowS: 0xc8d7ec, snowB: 0xb2c6e2, snowW: 0xf8fbff,
  ice: 0x8ed0f2, iceL: 0xc6ecfb, iceD: 0x4f9ad6, iceDD: 0x2a64a4, deep: 0x0d2a58,
  orange: 0xff7a1a, orangeD: 0xc4500c, orangeL: 0xffa04a, red: 0xe0402c, redD: 0xa2261c,
  blue: 0x4f8fd0, blueD: 0x2f62a0, ink: 0x1a1d2a, metal: 0xb8c0cc, metalL: 0xdde3ea, metalD: 0x6b7386, metalDD: 0x3d4352,
  wood: 0xa0673a, woodD: 0x6e4224, yellow: 0xffd23f, warm: 0xffcf7a, cyan: 0x7ff0ff, pink: 0xff2e88,
  sea: 0x0b2142, aurora: 0x3dff9a,
};
const LH = FIELD.LANE_HALF;

// --------------------------------------------------------------------------- pixel helpers

/** Direct pixel buffer for fast per-pixel painting (flush() writes it back). */
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
    alpha: (x, y) => d[((y | 0) * w + (x | 0)) * 4 + 3],
    flush() { ctx.putImageData(img, 0, 0); },
  };
}

/**
 * Pixel-art mountain range: overlapping triangular peaks, each with a lit and a
 * shadowed face split by a wobbly ridge line, snow caps and rock streaks.
 */
function paintPeaks(ctx, w, h, o) {
  const P = pixels(ctx, w, h);
  const R = mulberry32(o.seed ?? 1);
  const n = o.n ?? 14;
  const peaks = [];
  for (let i = 0; i < n; i++) peaks.push({ cx: (i + 0.15 + R() * 0.7) * (w / n), py: h * (o.top0 + R() * (o.top1 - o.top0)), k: o.k0 + R() * (o.k1 - o.k0), s: R() * 100 });
  peaks.sort((a, b) => a.py - b.py);
  for (const p of peaks) {
    for (let y = Math.max(0, Math.floor(p.py)); y < h; y++) {
      const dy = y - p.py;
      const hw = dy * p.k + 0.5;
      const jl = 1 + (vnoise(y * 0.21, p.s, 1) - 0.5) * 0.7, jr = 1 + (vnoise(y * 0.19, p.s, 2) - 0.5) * 0.7;
      const ridge = p.cx + (vnoise(y * 0.13, p.s, 1.5) - 0.5) * Math.min(hw, 12) * 0.9;
      const x0 = Math.round(p.cx - hw * jl), x1 = Math.round(p.cx + hw * jr);
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
        const lit = x < ridge;
        const snowLine = (o.snowH ?? 12) * (0.55 + 0.9 * vnoise(x * 0.22, p.s, 3.3));
        const diag = x + (lit ? 1 : -1) * dy * 0.6;
        const streak = vnoise(diag * 0.4, y * 0.05, p.s) > (o.streak ?? 0.56);
        let c;
        if (dy < snowLine || !streak) c = lit ? o.snowL : o.snowS;
        else c = lit ? o.rockL : o.rockS;
        if (dy < 2 && Math.abs(x - ridge) < 1) c = o.ridge ?? c;
        if (x === x0 || x === x1) c = lit ? (o.edgeL ?? c) : (o.edgeS ?? c);
        P.set(x, y, c);
      }
    }
  }
  P.flush();
}

/** Tabular pixel iceberg sitting on a waterline (y = bottom of the berg). */
function paintBerg(ctx, cx, wl, bw, bh, R, cols) {
  const top = wl - bh;
  for (let x = -bw; x <= bw; x++) {
    const e = Math.abs(x) / bw;
    const hh = Math.round(bh * (e > 0.75 ? 1 - (e - 0.75) * 2.4 : 1) + (R() < 0.2 ? -1 : 0));
    if (hh <= 0) continue;
    const lit = x < bw * 0.35;
    px(ctx, cx + x, wl - hh, 1, hh, lit ? cols.side : cols.shade);
    px(ctx, cx + x, wl - hh, 1, 2, cols.top);
    if (R() < 0.18) px(ctx, cx + x, wl - hh + 3, 1, Math.max(1, hh - 4), cols.crack);
  }
  px(ctx, cx - bw, top + bh - 1, bw * 2 + 1, 1, cols.line);
}

// --------------------------------------------------------------------------- voxel props

/** Orange expedition dome tent (faces +z). */
const tentGrid = () => {
  const g = new VoxGrid();
  const R = 9;
  for (let x = -R - 1; x <= R; x++) for (let z = -R - 1; z <= R; z++) for (let y = 0; y <= R; y++) {
    const dx = x + 0.5, dz = z + 0.5;
    const d = Math.sqrt(dx * dx + (y * 1.12) ** 2 + dz * dz);
    if (d > R + 0.3 || d < R - 1.3) continue;
    const pole = Math.abs(Math.abs(dx) - Math.abs(dz)) < 0.8 || (Math.abs(dx) < 0.6 && y > 3);
    g.set(x, y, z, pole ? C.orangeD : y < 2 ? shade(C.orange, -0.1) : y > R - 3 ? C.orangeL : C.orange);
  }
  // door arch + vent on the front
  for (let y = 0; y <= 6; y++) for (let x = -3; x <= 2; x++) {
    if (Math.abs(x + 0.5) > 3.2 - Math.max(0, y - 3)) continue;
    for (let z = R; z >= 0; z--) if (g.has(x, y, z)) { g.set(x, y, z, x === 0 && y < 6 ? C.orangeL : 0x5a2208); break; }
  }
  for (let z = R; z >= 0; z--) if (g.has(-1, 8, z)) { g.set(-1, 8, z, 0x3a1a0a); g.set(0, 8, z, 0x3a1a0a); break; }
  // snow skirt + pegs
  for (let x = -R - 2; x <= R + 1; x++) for (let z = -R - 2; z <= R + 1; z++) {
    const d = Math.sqrt((x + 0.5) ** 2 + (z + 0.5) ** 2);
    if (d > R - 0.5 && d < R + 1.6 && !g.has(x, 0, z) && hash3(x, 3, z) < 0.75) g.set(x, 0, z, hash3(x, 1, z) < 0.5 ? C.snow : C.snowS);
  }
  for (const [x, z] of [[-11, -1], [10, 0], [0, -11], [-1, 10]]) g.set(x, 0, z, C.yellow).set(x, 1, z, C.yellow);
  return g;
};

/** Weatherhaven-style arched mess tent along x. */
const tunnelTentGrid = () => {
  const g = new VoxGrid();
  const R = 8, L = 13;
  for (let x = -L; x <= L; x++) for (let y = 0; y <= R; y++) for (let z = -R - 1; z <= R; z++) {
    const d = Math.sqrt((z + 0.5) ** 2 + y * y);
    if (d > R + 0.3) continue;
    const end = Math.abs(x) === L;
    if (!end && d < R - 0.9) continue;
    const rib = !end && (x + L) % 5 === 0;
    g.set(x, y, z, rib ? C.redD : end ? shade(C.red, -0.12) : y > R - 2 ? shade(C.red, 0.12) : C.red);
  }
  // door + glowing window on the +x end, windows along the front
  g.box(L, 0, -2, L, 5, 1, 0x4a1a12);
  g.box(L, 3, -1, L, 4, 0, C.warm, true);
  for (const x of [-8, -2, 4]) for (let z = R; z >= 0; z--) if (g.has(x, 4, z)) { g.box(x, 4, z, x + 2, 5, z, C.warm, true); break; }
  // snow along the base and on top
  for (let x = -L - 1; x <= L + 1; x++) { g.set(x, 0, R + 1, C.snow); g.set(x, 0, -R - 2, C.snow); if (hash3(x, 2, 2) < 0.5) g.set(x, 1, R, C.snowW); }
  for (let x = -L + 1; x < L; x++) if (hash3(x, 9, 1) < 0.7) g.set(x, R + 1, 0, C.snowW);
  return g;
};

/** BEAST BASE research station on hydraulic stilts. */
const stationGrid = () => {
  const g = new VoxGrid();
  // stilts with ski feet + yellow jacks
  for (const lx of [-25, -15, -5, 5, 15, 25]) for (const lz of [-6, 4]) {
    g.box(lx, 0, lz, lx + 1, 8, lz + 1, C.metalD);
    g.box(lx - 1, 0, lz - 2, lx + 2, 0, lz + 3, C.ink);
    g.box(lx - 1, 4, lz - 1, lx + 2, 5, lz + 2, C.yellow);
  }
  const module = (x0, x1, col, y1 = 19) => {
    for (let x = x0; x <= x1; x++) for (let y = 9; y <= y1; y++) for (let z = -8; z <= 6; z++) {
      const top = y === y1, bot = y === 9;
      if ((top || bot) && (z === -8 || z === 6)) continue; // chamfer
      const seam = (x - x0) % 6 === 0 || x === x1;
      let c = col;
      if (bot) c = C.metalDD;
      else if (top) c = C.metalL;
      else if (y === 11) c = 0xf4f6fa;
      else if (seam) c = shade(col, -0.18);
      g.set(x, y, z, c);
    }
    // windows on the front
    for (let x = x0 + 2; x + 1 < x1; x += 4) {
      g.box(x - 1, 13, 7, x + 2, 13, 7, C.metalDD);
      g.box(x, 14, 6, x + 1, 16, 6, hash3(x, 1, 3) < 0.75 ? C.warm : 0x9fd8ff, true);
    }
    // roof snow
    for (let x = x0; x <= x1; x++) for (let z = -7; z <= 5; z++) if (hash3(x, y1, z) < 0.82) g.set(x, y1 + 1, z, hash3(x, 5, z) < 0.5 ? C.snowW : C.snow);
    // icicles along the front eave
    for (let x = x0 + 1; x < x1; x++) if (hash3(x, 7, 7) < 0.35) for (let k = 0; k < 1 + Math.floor(hash3(x, 8, 7) * 3); k++) g.set(x, y1 - 1 - k, 7, C.iceL);
  };
  module(-29, -10, C.blue);
  module(-9, 9, C.red, 21);
  module(10, 29, C.blue);
  for (const x of [-10, 10]) g.box(x, 10, -7, x, 18, 5, C.ink);
  // central door + stairs down to the snow (toward the camera)
  g.box(-2, 10, 6, 1, 16, 6, C.metalDD);
  g.box(-1, 13, 7, 0, 15, 7, C.warm, true);
  g.box(-3, 9, 7, 2, 9, 9, C.metalD);
  for (let i = 0; i < 9; i++) {
    g.box(-2, 8 - i, 10 + i, 1, 8 - i, 10 + i, i % 2 ? C.metal : C.metalD);
    g.set(-3, 10 - i, 10 + i, C.yellow).set(2, 10 - i, 10 + i, C.yellow);
  }
  // radome on the right module, mast + beacon on the left
  g.ellipsoid(21, 22, -1, 5, 5, 5, (x, y, z) => (y < 21 ? undefined : (x + y * 2 + z) % 7 === 0 ? C.metalL : 0xf6f8fb));
  g.box(16, 20, -6, 26, 21, 4, C.metal);
  g.box(-25, 20, -3, -24, 40, -2, C.metal);
  for (let y = 25; y <= 37; y += 4) { g.box(-28, y, -3, -21, y, -2, C.metal); g.set(-28, y + 1, -3, C.red, true).set(-21, y + 1, -3, C.red, true); }
  // roof sign: BEAST BASE
  const W = textW('BEAST BASE') + 6;
  g.box(-Math.floor(W / 2), 25, -3, Math.ceil(W / 2), 33, -2, C.ink);
  g.box(-Math.floor(W / 2), 25, -1, Math.ceil(W / 2), 25, -1, C.orange);
  g.box(-Math.floor(W / 2), 33, -1, Math.ceil(W / 2), 33, -1, C.orange);
  for (const x of [-12, 12]) g.box(x, 22, -3, x, 24, -2, C.metalD);
  text(g, 'BEAST BASE', 0, 27, -1, '+z', 0xfff2c8, { center: true });
  // big "50H" orange panel on the left module + snow drifts on the ground
  g.box(-27, 13, 7, -18, 18, 7, C.ink);
  text(g, '50H', -22, 13, 8, '+z', C.orange, { center: true });
  for (let x = -32; x <= 32; x++) for (let z = -10; z <= 9; z++) {
    const hgt = Math.floor(vnoise(x * 0.2, 3, z * 0.3) * 4 - 1.2);
    for (let y = 0; y < hgt; y++) if (!g.has(x, y, z)) g.set(x, y, z, y === hgt - 1 ? C.snowW : C.snow);
  }
  return g;
};

/** Blocky serac / ice-cliff formation, front face at z = 0 (+z faces the lane). */
const iceCliffGrid = (seed, W, H, D) => () => {
  const g = new VoxGrid();
  for (let x = 0; x < W; x++) for (let z = -D; z <= 0; z++) {
    const ex = Math.min(x, W - 1 - x) / (W * 0.5);
    const prof = Math.min(1, ex * 2.4) * (0.8 + 0.2 * (1 + z / D));
    const bx = Math.floor((x + seed) / 5), bz = Math.floor((z + 40) / 4);
    const hgt = Math.round(H * prof * (0.5 + 0.38 * vnoise(bx * 0.7, bz * 0.6, seed) + 0.12 * hash3(bx, bz, seed)));
    for (let y = 0; y < hgt; y++) {
      let c;
      if (y >= hgt - 1) c = hash3(x, y, z) < 0.5 ? C.snowW : C.snow;
      else if (y === hgt - 2 && hash3(x, 2, z) < 0.5) c = C.snow;
      else if (y < 2) c = C.iceD;
      else {
        const band = vnoise(x * 0.45, y * 0.07, seed);
        c = band > 0.62 ? 0xa8e2fa : band > 0.38 ? 0x6cc0ee : 0x4c9edc;
        if (hash3(x, 0, seed + 4) < 0.05 && y < hgt - 3) c = C.iceD;
      }
      g.set(x - (W >> 1), y, z, c);
    }
    // overhanging cornice + icicles on the front columns
    if (z === 0 && hgt > 6 && hash3(x >> 1, 5, seed) < 0.6) {
      g.set(x - (W >> 1), hgt - 1, 1, C.snowW);
      for (let k = 2; k < 2 + Math.floor(hash3(x, 6, seed) * 3); k++) g.set(x - (W >> 1), hgt - k, 1, C.iceL);
    }
  }
  return g;
};

/** Floating iceberg (tabular or pinnacle). Base sits a little below y = 0. */
const bergGrid = (seed, kind) => () => {
  const g = new VoxGrid();
  const tab = kind === 'tab';
  const W = tab ? 13 : 7, D = tab ? 7 : 6, H = tab ? 7 : 15;
  for (let x = -W; x <= W; x++) for (let z = -D; z <= D; z++) {
    const r = Math.sqrt((x / W) ** 2 + (z / D) ** 2) + (vnoise(x * 0.3, seed, z * 0.3) - 0.5) * 0.35;
    if (r > 1) continue;
    let hgt;
    if (tab) hgt = Math.round(H * (r > 0.8 ? 1 - (r - 0.8) * 3 : 1) - (hash3(x >> 2, seed, z >> 2) < 0.2 ? 2 : 0));
    else hgt = Math.round(H * Math.pow(1 - r, 1.2) * (0.7 + 0.5 * vnoise(x * 0.4, z * 0.4, seed)));
    for (let y = -2; y < Math.max(1, hgt); y++) {
      let c = y <= 0 ? C.ice : y >= hgt - 1 ? C.snowW : hash3(x, Math.floor(y / 2), seed) < 0.55 ? 0xe2f2fc : C.iceL;
      if (y > 0 && y < hgt - 1 && hash3(x, 1, seed) < 0.08) c = C.ice;
      g.set(x, y, z, c);
    }
  }
  return g;
};

/** Red snowmobile facing +x. */
const snowmobileGrid = () => {
  const g = new VoxGrid();
  const body = C.red, dark = 0x22242e;
  for (const z of [-4, 3]) { g.box(-2, 0, z, 13, 0, z, C.metalD); g.set(14, 1, z, C.metalD).set(15, 2, z, C.metalD); g.box(5, 1, z, 5, 2, z, C.metalD); }
  g.box(-13, 0, -3, -1, 3, 2, (x, y) => (y === 0 || (x & 1) ? dark : 0x3a3d48));
  g.box(-12, 4, -4, 6, 6, 3, (x, y) => (y === 5 ? 0xf4f6fa : body));
  for (let i = 0; i < 6; i++) g.box(6 + i, 4, -3, 6 + i, 8 - Math.floor(i * 0.6), 2, i === 5 ? C.redD : body);
  g.set(12, 5, -1, C.warm, true).set(12, 5, 0, C.warm, true);
  g.box(-11, 7, -2, -2, 8, 1, dark);
  g.box(-12, 7, -3, -11, 9, 2, C.redD);
  g.box(4, 9, -3, 5, 12, 2, 0x9fd8ff);
  g.box(2, 9, -4, 2, 9, 3, dark);
  g.box(-13, 4, -4, -13, 6, 3, C.ink);
  return g;
};

/** Emperor penguin (faces +z). */
const penguinGrid = () => {
  const g = new VoxGrid();
  const K_ = 0x1c1f2e, W_ = 0xf6f8fc, Y_ = 0xffbe2e, O_ = 0xff8a2a;
  g.ellipsoid(0, 9, 0, 4, 8, 3.5, K_);
  g.paint((x, y, z) => (z >= 1 && y >= 2 && y <= 14 && Math.abs(x) <= 3 ? (y >= 12 ? 0xfff2b8 : W_) : undefined));
  g.ellipsoid(0, 17, 0.5, 3, 3, 3, K_);
  for (const sx of [-1, 1]) { g.set(sx * 3, 16, 1, Y_).set(sx * 3, 15, 1, Y_).set(sx * 3, 15, 2, Y_); }
  for (const sx of [-1, 1]) for (let z = 4; z >= 0; z--) if (g.has(sx * 2, 18, z)) { g.set(sx * 2, 18, z, W_); g.set(sx * 2, 18, z + 1, K_); break; }
  g.set(0, 17, 4, K_).set(0, 16, 4, O_).set(0, 16, 5, O_).set(0, 17, 5, K_);
  for (const sx of [-1, 1]) { g.box(sx * 5, 6, -1, sx * 5, 11, 0, K_); g.set(sx * 5, 5, -1, K_); }
  g.box(-2, 0, 1, -1, 0, 3, O_).box(1, 0, 1, 2, 0, 3, O_);
  g.set(0, 2, -4, K_);
  return g;
};

/** Ceremonial pole: red & white barber pole with a mirror ball. */
const polarPoleGrid = () => {
  const g = new VoxGrid();
  g.cylinder(0, 0, 0, 1, 4, C.ink);
  g.cylinder(0, 0, 2, 2, 3, C.metalD);
  for (let y = 3; y < 22; y++) g.box(-1, y, -1, 0, y, 0, (Math.floor((y + 0) / 2) & 1) ? C.red : 0xf8f8f8);
  g.ellipsoid(-0.5, 25, -0.5, 3, 3, 3, (x, y, z) => (y > 25 && x < 0 ? 0xffffff : (x + y + z) & 1 ? 0xd8e0ea : 0xaab4c4));
  g.set(-2, 27, 2, 0xffffff, true);
  // ring of snow bricks around the base
  for (let a = 0; a < 16; a++) { const x = Math.round(Math.cos((a / 16) * Math.PI * 2) * 6), z = Math.round(Math.sin((a / 16) * Math.PI * 2) * 6); g.set(x, 0, z, C.snowW).set(x, 1, z, a & 1 ? C.snow : C.snowS); }
  return g;
};

/** Flag pole (for the pole ring) — flag cloth is animated separately. */
const flagPoleGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 29, 0, C.metalL);
  g.set(0, 30, 0, C.yellow);
  g.box(-1, 0, -1, 1, 0, 1, C.snowS);
  return g;
};
const FLAGS = [
  (x, y) => (y >= 3 && y <= 4 ? 0xffffff : 0x29b6f6),
  (x, y) => (x < 4 ? C.red : x < 8 ? 0xffffff : C.red),
  (x, y) => (x + y < 9 ? 0x2fae4a : x + y < 12 ? C.yellow : 0x1f6ac8),
  (x, y) => ((x - 5.5) ** 2 + (y - 3.5) ** 2 < 5 ? 0xffffff : C.orange),
  (x, y) => (Math.abs(x - 4) < 1 || Math.abs(y - 3.5) < 1 ? 0xffffff : 0x2a3a8a),
  (x, y) => (y < 3 ? 0x8a3ad8 : y < 5 ? C.yellow : 0x8a3ad8),
  (x, y) => (y === 2 || y === 5 ? 0xffffff : (x - 5) ** 2 + (y - 3.5) ** 2 < 2.5 ? C.yellow : C.pink),
];
/** One frame of a waving flag cloth (pole side at x = 0, extends +x). */
const flagFrame = (fill, f) => () => {
  const g = new VoxGrid();
  for (let x = 0; x < 12; x++) {
    const dz = Math.round(Math.sin(x * 0.7 - f * (Math.PI / 2)) * 1.3 * Math.min(1, x / 4));
    const dy = x > 8 && f % 2 ? -1 : 0;
    for (let y = 0; y < 8; y++) g.set(x, y + dy, dz, fill(x, y));
  }
  return g;
};

/** Low wind-sculpted snow drift (about 14 x 3 x 7 voxels). */
const driftGrid = () => {
  const g = new VoxGrid();
  for (let x = -7; x <= 7; x++) for (let z = -4; z <= 3; z++) {
    const r = (x / 7.5) ** 2 + ((z + 0.5) / 4) ** 2;
    if (r > 1) continue;
    const hgt = r < 0.35 && x < 4 ? 3 : r < 0.7 ? 2 : 1;
    for (let y = 0; y < hgt; y++) g.set(x, y, z, y === hgt - 1 ? (hash3(x, y, z) < 0.3 ? C.snowW : C.snow) : C.snow2);
  }
  return g;
};

/** Low jumble of pressure-ridge ice slabs (<= 4 voxels tall). */
const iceRubbleGrid = () => {
  const g = new VoxGrid();
  g.box(-5, 0, -3, 2, 1, 1, (x, y, z) => (y === 1 && hash3(x, y, z) < 0.5 ? C.snowW : (x + z) % 4 === 0 ? C.iceL : C.ice));
  g.box(0, 0, 0, 5, 2, 3, (x, y, z) => (y === 2 ? (hash3(x, 2, z) < 0.6 ? C.snowW : C.iceL) : z === 3 ? C.iceD : C.ice));
  g.box(-3, 2, -2, -1, 3, 0, (x, y) => (y === 3 ? C.snowW : C.iceL));
  g.box(-7, 0, 1, -5, 0, 3, C.snow);
  return g;
};

const crateGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 2, 5, 2, (x, y, z) => (y % 2 ? C.wood : shade(C.wood, 0.08)));
  for (const [a, b] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) g.box(a, 0, b, a, 5, b, C.woodD);
  g.box(-3, 5, -3, 2, 5, 2, C.woodD);
  g.box(-2, 6, -2, 1, 6, 1, C.snowW);
  g.box(-2, 2, 3, 1, 3, 3, C.red).box(-1, 1, 3, 0, 4, 3, C.red);
  return g;
};
const fuelDrumGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
    if ((x + 0.5) ** 2 + (z + 0.5) ** 2 > 9.5) continue;
    g.set(x, y, z, y === 1 || y === 6 ? C.orangeD : C.orange);
  }
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (hash3(x, 9, z) < 0.8) g.set(x, 8, z, C.snowW);
  g.box(-1, 3, 3, 0, 4, 3, C.ink).set(-1, 4, 3, C.yellow);
  return g;
};
const snowmanGrid = () => {
  const g = new VoxGrid();
  g.sphere(0, 3, 0, 3.5, C.snow);
  g.sphere(0, 8.5, 0, 2.6, C.snowW);
  g.sphere(0, 12.5, 0, 2, C.snowW);
  g.set(0, 12, 2, C.orange).set(0, 12, 3, C.orange).set(0, 12, 4, C.orange);
  g.set(-1, 13, 2, C.ink).set(1, 13, 2, C.ink);
  for (const y of [9, 7]) g.set(0, y, 3, C.ink);
  g.box(-3, 10, -3, 2, 10, 2, (x, y, z) => (Math.abs(x + 0.5) + Math.abs(z + 0.5) < 4 ? C.red : undefined));
  g.box(1, 9, 2, 1, 6, 2, C.red);
  g.box(-2, 14, -2, 1, 14, 1, 0x2a2a3a).box(-1, 15, -1, 0, 17, 0, 0x2a2a3a);
  for (const sx of [-1, 1]) g.line(sx * 3, 9, 0, sx * 6, 11, 0, C.woodD);
  return g;
};
const iceBlockGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 3, 5, 3, (x, y, z) => (y === 5 ? C.snowW : hash3(x, y, z) < 0.3 ? C.iceL : C.ice));
  g.box(-1, 2, 3, 1, 3, 3, 0x6a7a9a);
  g.set(-2, 3, 3, 0x6a7a9a).set(2, 2, 3, 0x9aa8c0);
  return g;
};

const windTowerGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 48; y++) { const r = y < 40 ? 1 : 0; g.box(-r - 1, y, -r - 1, r, y, r, y % 10 === 0 ? C.red : 0xf2f4f8); }
  g.box(-2, 48, -4, 1, 51, 2, 0xf2f4f8);
  g.box(-2, 0, -2, 1, 1, 1, C.metalD);
  return g;
};
const rotorGrid = () => {
  const g = new VoxGrid();
  g.box(-1, -1, 0, 1, 1, 1, C.metalL);
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + Math.PI / 2;
    for (let r = 2; r < 18; r++) {
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
      g.set(x, y, 0, r > 14 ? C.red : 0xf6f8fb);
      if (r < 10) g.set(Math.round(Math.cos(a + 0.08) * r), Math.round(Math.sin(a + 0.08) * r), 0, 0xe2e8f0);
    }
  }
  return g;
};
const mastGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 22, 0, C.metal);
  for (const [y, w] of [[8, 3], [15, 4]]) g.box(-w, y, 0, w, y, 0, C.metalD);
  g.box(-4, 16, 0, -4, 17, 0, 0xf2f4f8);
  g.box(3, 9, 0, 3, 10, 0, C.orange);
  g.set(0, 23, 0, C.red, true);
  g.box(-1, 0, -1, 1, 0, 1, C.metalD);
  return g;
};
const cupsGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 1, 0, C.metalD);
  for (const [x, z] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { g.line(0, 1, 0, x, 1, z, C.metalD); g.box(x, 1, z, x, 2, z, x > 0 || z > 0 ? C.red : 0xf2f4f8); }
  return g;
};
const lampGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 18, 0, C.metalDD);
  g.box(0, 18, 0, 3, 18, 0, C.metalDD);
  g.box(2, 16, -1, 4, 17, 1, C.metalD);
  g.box(2, 15, -1, 4, 15, 1, C.warm, true);
  g.box(-1, 0, -1, 1, 0, 1, C.snowS);
  return g;
};
const dishGrid = () => {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 0, 9, 0, C.metalD);
  for (let x = -7; x <= 6; x++) for (let y = -7; y <= 6; y++) {
    const d = (x + 0.5) ** 2 + (y + 0.5) ** 2;
    if (d <= 49) g.set(x, y + 15, Math.round(d / 14), d > 36 ? C.metal : 0xf4f6fa);
  }
  for (let z = 0; z < 6; z++) g.set(0, 15, -z - 1, C.metalD);
  g.set(0, 15, -7, C.red, true);
  for (let x = -6; x <= 5; x++) if (hash3(x, 2, 2) < 0.6) g.set(x, 22, 1, C.snowW);
  return g;
};
const drumStackGrid = () => {
  const g = new VoxGrid();
  const drum = (cx, cy, cz, col) => {
    for (let y = 0; y < 7; y++) for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) if ((x + 0.5) ** 2 + (z + 0.5) ** 2 <= 9.5) g.set(cx + x, cy + y, cz + z, y === 1 || y === 5 ? shade(col, -0.25) : col);
  };
  drum(-3, 0, 0, C.orange); drum(3, 0, 0, C.blue); drum(9, 0, 1, C.orange); drum(0, 7, 0, C.orange); drum(6, 7, 0, C.yellow);
  g.box(-7, 14, -4, 9, 14, 3, (x, y, z) => (hash3(x, y, z) < 0.6 ? C.snowW : undefined));
  return g;
};
const sledGrid = () => {
  const g = new VoxGrid();
  for (const z of [-3, 2]) { g.box(-8, 0, z, 7, 0, z, C.woodD); g.set(8, 1, z, C.woodD); }
  g.box(-8, 1, -3, 6, 1, 2, C.wood);
  g.box(-6, 2, -2, -1, 4, 1, 0x2f62a0).box(0, 2, -2, 4, 3, 1, C.orange);
  g.box(-6, 5, -2, -1, 5, 1, C.snowW);
  return g;
};
const markerGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 9, 0, 0x2a2a3a);
  g.box(1, 7, 0, 4, 9, 0, C.orange);
  return g;
};
const signpostGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 22, 0, C.woodD);
  const arrows = [[20, 'BEAST', C.red, 1], [16, 'HOME', 0x29b6f6, -1], [12, 'POLE', C.yellow, 1]];
  for (const [y, s, col, dir] of arrows) {
    const w = textW(s) + 4;
    const x0 = dir > 0 ? 1 : -w;
    g.box(x0, y - 1, 0, x0 + w - 1, y + 5, 0, col);
    g.set(dir > 0 ? x0 + w : x0 - 1, y + 2, 0, col);
    text(g, s, x0 + 2, y, 1, '+z', 0xffffff);
  }
  g.box(-1, 23, -1, 1, 23, 1, C.snowW);
  return g;
};

// --------------------------------------------------------------------------- dynamic helpers

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

/**
 * Waddling penguins. paths: [[xa, xb, z, speed, phase, scale, mode]] where mode
 * 'walk' paces between xa..xb, 'slide' toboggans on the belly, 'idle' stands.
 */
function addPenguins(K, paths, scale = 0.046) {
  const im = liveInst(K, 'penguin', penguinGrid, { scale, ao: true }, paths.length, { shadow: true });
  const st = paths.map(([xa, xb, z, sp, ph, s, mode]) => ({ xa, xb, z, sp, ph, s: s ?? 1, mode: mode ?? 'walk', x: xa + (xb - xa) * ((ph * 0.37) % 1), dir: ph % 2 < 1 ? 1 : -1, pause: 0, turn: 0 }));
  K.onUpdate((dt, t) => {
    st.forEach((p, i) => {
      if (p.mode === 'idle') {
        setInst(im, i, p.xa, 0, p.z, p.xb + Math.sin(t * 0.4 + p.ph) * 0.5, 0, Math.sin(t * 1.3 + p.ph) * 0.05, p.s);
        return;
      }
      if (p.pause > 0) p.pause -= dt;
      else {
        p.x += p.dir * p.sp * dt;
        if (p.x > p.xb || p.x < p.xa) { p.x = clamp(p.x, p.xa, p.xb); p.dir *= -1; p.pause = p.mode === 'slide' ? 0.6 : 1 + (p.ph % 1.5); }
      }
      const head = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.turn += (head - p.turn) * Math.min(1, dt * 6);
      if (p.mode === 'slide') {
        const sliding = p.pause <= 0;
        setInst(im, i, p.x, sliding ? 0.16 * p.s : 0, p.z, p.turn, sliding ? Math.PI / 2 - 0.15 : 0, 0, p.s);
      } else {
        const w = p.pause > 0 ? 0 : t * 9 * p.sp + p.ph;
        setInst(im, i, p.x, Math.abs(Math.sin(w)) * 0.04, p.z, p.turn, 0, Math.sin(w) * 0.16, p.s);
      }
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

/** Waving voxel flags on poles: frames swap every ~0.12 s. */
function addFlags(K, list, scale) {
  const poles = [];
  for (const [x, z, design, ry] of list) {
    poles.push([x, 0, z, ry]);
    const frames = [0, 1, 2, 3].map((f) => K.geo(`flag${design}_${f}`, flagFrame(FLAGS[design], f), { scale, pivot: [0, 0, 0.5] }));
    const m = makeMesh(frames[0], Mats.pair);
    m.position.set(x, 22 * scale, z);
    m.rotation.y = ry;
    m.castShadow = false;
    K.add(m);
    const ph = design * 1.7;
    K.onUpdate((dt, t) => { m.geometry = frames[Math.floor(t * 8 + ph) % 4]; });
  }
  K.inst('flagPole', flagPoleGrid, { scale }, poles, { shadow: true });
}

/** Falling voxel snow over an area. */
function addSnowfall(K, n, area) {
  const [x0, x1, z0, z1, y1] = area;
  const mat = new THREE.MeshBasicMaterial({ color: 0xf2f8ff });
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const R = mulberry32(77);
  const f = Array.from({ length: n }, () => ({ x: x0 + R() * (x1 - x0), y: R() * y1, z: z0 + R() * (z1 - z0), v: 0.7 + R() * 0.9, ph: R() * 6.28, s: 0.045 + R() * 0.06 }));
  K.add(im);
  K.onUpdate((dt, t) => {
    f.forEach((p, i) => {
      p.y -= p.v * dt;
      p.x += (Math.sin(t * 0.9 + p.ph) * 0.35 + 0.25) * dt;
      if (p.y < 0) { p.y += y1; p.x = x0 + ((p.x - x0 + 13.7) % (x1 - x0)); }
      if (p.x > x1) p.x -= x1 - x0;
      setInst(im, i, p.x, p.y, p.z, t * p.v + p.ph, p.ph, 0, p.s);
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

/** Aurora curtain texture: vertical rays fading upward, bright lower hem. */
function auroraTex(id, pal) {
  return canvasTex(id, 128, 48, (ctx, w, h) => {
    const P = pixels(ctx, w, h);
    for (let x = 0; x < w; x++) {
      const ray = 0.35 + 0.65 * vnoise(x * 0.42, 1, pal.seed);
      const top = h * (0.05 + 0.4 * vnoise(x * 0.07, 3, pal.seed));
      for (let y = 0; y < h; y++) {
        const t = (y - top) / (h - top);
        if (t < 0) continue;
        let a = t < 0.82 ? Math.pow(t / 0.82, 1.5) : 1 - ((t - 0.82) / 0.18) * 0.75;
        a *= ray;
        const q = Math.floor(a * 4 + bayer(x, y)) / 4;
        if (q <= 0) continue;
        P.set(x, y, t > 0.8 ? pal.hem : t > 0.5 ? pal.mid : t > 0.28 ? pal.low : pal.top, Math.min(1, q));
      }
    }
    P.flush();
  }, { repeatX: true });
}

/** Rippling aurora ribbons far behind the mountains (vertex-animated). */
function addAurora(K, ribbons) {
  for (const r of ribbons) {
    const tex = auroraTex('ant_aurora' + r.pal.seed, r.pal);
    const geo = new THREE.PlaneGeometry(r.w, r.h, 96, 1);
    const pos = geo.attributes.position;
    const base = Float32Array.from(pos.array);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, opacity: r.op });
    mat.color.setScalar(r.boost ?? 1);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(r.x, r.y, r.z);
    m.renderOrder = -4;
    m.frustumCulled = false;
    K.add(m);
    K.onUpdate((dt, t) => {
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1];
        const top = by > 0;
        const wv = Math.sin(bx * 0.03 + t * 0.32 + r.ph) * 3 + Math.sin(bx * 0.071 - t * 0.21 + r.ph * 2) * 1.6;
        pos.array[i * 3] = bx + (top ? Math.sin(bx * 0.05 + t * 0.4) * 4 : 0);
        pos.array[i * 3 + 1] = by + wv * (top ? 0.6 : 1);
        pos.array[i * 3 + 2] = Math.sin(bx * 0.045 + t * 0.25 + r.ph) * 10;
      }
      pos.needsUpdate = true;
      mat.opacity = r.op * (0.75 + 0.25 * Math.sin(t * 0.45 + r.ph));
      tex.offset.x = (t * 0.006 + r.ph) % 1;
    });
  }
}

/** Dark sea plane with drifting pixel ripples. */
function addSea(K, o) {
  const tex = canvasTex('ant_sea', 32, 32, (ctx, w, h) => {
    px(ctx, 0, 0, w, h, C.sea);
    const R = mulberry32(9);
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(R() * w), y = Math.floor(R() * h), l = 2 + Math.floor(R() * 5);
      const r = R();
      px(ctx, x, y, l, 1, r < 0.6 ? 0x16365e : r < 0.85 ? 0x1f4a78 : 0x2a8a84);
    }
  }, { repeatX: true });
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(o.w / 9, o.d / 9);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.d), new THREE.MeshBasicMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, o.y, o.z);
  m.name = 'sea';
  K.add(m);
  K.onUpdate((dt, t) => { tex.offset.x = (t * 0.012) % 1; tex.offset.y = Math.sin(t * 0.25) * 0.03; });
  return m;
}

/**
 * Keep the screen-space sky texture "cover"-fitted to the viewport so its
 * pixels stay square in portrait (crops the sides instead of stretching).
 */
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

// crevasse polylines (world x,z)
const CREVASSES = [
  [[-22, 5.4], [-18.5, 6.6], [-15, 5.9], [-11.5, 7.2]],
  [[8.5, 9.8], [12.5, 8.4], [16.5, 9.4], [21, 8.2]],
  [[-31, 12], [-27, 13.5], [-24, 12.8]],
  [[-34, -7.2], [-30, -8.8], [-26, -7.9]],
  [[24, -12], [28, -10.4], [32.5, -11.4], [37, -9.8]],
];
function crevasse(x, z, list = CREVASSES) {
  let best = 9;
  for (const pl of list) {
    let L = 0;
    const lens = [];
    for (let i = 0; i < pl.length - 1; i++) { const l = Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]); lens.push(l); L += l; }
    let acc = 0;
    for (let i = 0; i < pl.length - 1; i++) {
      const [ax, az] = pl[i], [bx, bz] = pl[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      const s = acc + t * lens[i];
      const taper = Math.min(1, s / 2, (L - s) / 2);
      best = Math.min(best, d / Math.max(0.05, taper));
      acc += lens[i];
    }
  }
  return best;
}
const crevCol = (d) => (d < 0.45 ? C.deep : d < 0.8 ? C.iceDD : d < 1.1 ? C.iceD : d < 1.4 ? C.ice : null);

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  // ---- sky: polar night, stars, moon and a faint aurora glow
  const sky = skyTexture('antarctica', [[0, 0x040820], [0.16, 0x0a1846], [0.3, 0x123a6a], [0.4, 0x1c5a78], [0.55, 0x235f7c], [1, 0x1a3c62]], (ctx, w, h) => {
    paintStars(ctx, w, h, { n: 120, ymax: h * 0.4, seed: 21, tint: 0xa8ffe0 });
    for (let x = 0; x < w; x++) {
      const top = 8 + vnoise(x * 0.08, 2, 1) * 10, len = 6 + vnoise(x * 0.2, 5, 1) * 10;
      for (let y = top; y < top + len; y++) if (bayer(x, y | 0) < 0.35 * (y - top) / len) px(ctx, x, y | 0, 1, 1, 0x2ad69a, 0.45);
    }
    paintSun(ctx, w * 0.82, h * 0.1, 4, 0xf4f6ff, 0xa8c8ff);
    disc(ctx, w * 0.82 + 2, h * 0.1 - 1, 3, 0xdfe6f6);
    px(ctx, Math.round(w * 0.82) - 2, Math.round(h * 0.1) + 1, 1, 1, 0xc8d2e8);
  });

  fitSky(K, sky);

  // ---- aurora ribbons (behind the mountains)
  addAurora(K, [
    { x: -30, y: 33, z: -168, w: 260, h: 30, ph: 0, op: 0.85, boost: 1.25, pal: { seed: 1, hem: 0xd2ffe6, mid: 0x46ffa4, low: 0x22d6a0, top: 0x8a5cff } },
    { x: 60, y: 37, z: -166, w: 220, h: 26, ph: 2.1, op: 0.6, boost: 1.1, pal: { seed: 2, hem: 0xc8fff0, mid: 0x3df2c0, low: 0x2aa0d6, top: 0xd05cff } },
    { x: -90, y: 30, z: -169, w: 180, h: 22, ph: 4.2, op: 0.55, boost: 1.0, pal: { seed: 3, hem: 0xffd2f2, mid: 0xff6ad0, low: 0x9a5cff, top: 0x5a3aff } },
  ]);

  // ---- parallax pixel layers (far -> near)
  K.parallax('mountains', {
    z: -160, y: -4, w: parallaxWidth(-160), h: 40, tw: 384, th: 96,
    paint: (ctx, w, h) => {
      paintPeaks(ctx, w, h, { seed: 3, n: 18, top0: 0.3, top1: 0.62, k0: 0.8, k1: 1.7, snowH: 20, snowL: 0xbccff0, snowS: 0x6a82b8, rockL: 0x3e4c70, rockS: 0x252e4e, ridge: 0xeef4ff, streak: 0.58 });
      paintGradient(ctx, 0, h - 10, w, 10, [[0, 0x8aa6d4], [1, 0x6c88bc]], { bands: 3 });
    },
    fogTint: [0x1c4a74, 0.28],
  });
  K.parallax('glacier', {
    z: -124, y: -3, w: parallaxWidth(-124), h: 22, tw: 352, th: 66,
    paint: (ctx, w, h) => {
      paintPeaks(ctx, w, h, { seed: 8, n: 11, top0: 0.25, top1: 0.6, k0: 2.2, k1: 3.6, snowH: 40, snowL: 0xd6e4f6, snowS: 0x88a2d0, rockL: 0x5a6a90, rockS: 0x3a4668, ridge: 0xf4f8ff, streak: 0.66 });
      // ice-cliff coastline meeting the sea (sea plane hides below y = -1)
      const wl = Math.round(h - (2 / 22) * h);
      for (let x = 0; x < w; x++) {
        const ch = 4 + Math.round(vnoise(x * 0.09, 4, 2) * 5);
        px(ctx, x, wl - ch, 1, ch, (x >> 1) % 3 === 0 ? 0x6aa6d8 : 0x9ccbea);
        px(ctx, x, wl - ch, 1, 1, 0xe8f2ff);
      }
      px(ctx, 0, wl, w, h - wl, 0x0e2448);
    },
    fogTint: [0x1c4a74, 0.18],
  });
  K.parallax('bergs', {
    z: -88, y: -2.2, w: parallaxWidth(-88), h: 9, tw: 320, th: 36,
    paint: (ctx, w, h) => {
      const R = mulberry32(31);
      const wl = Math.round(h - (1.2 / 9) * h);
      for (let i = 0; i < 9; i++) paintBerg(ctx, Math.floor(R() * w), wl, 6 + Math.floor(R() * 12), 3 + Math.floor(R() * 7), R, { top: 0xeef4fc, side: 0xa8d2ee, shade: 0x6a9ccc, crack: 0x5a8cc0, line: 0x2a5a8a });
      px(ctx, 0, wl, w, h - wl, 0x0e2448);
    },
    fogTint: [0x1c4a74, 0.12],
  });

  // ---- sea, ice floes and 3D icebergs beyond the ice-shelf edge
  addSea(K, { w: 420, d: 150, y: -1.0, z: -95 });
  const bergs = [];
  const bergDefs = [['tab', 1], ['pin', 2], ['tab', 3], ['pin', 4]];
  const bergMeshes = bergDefs.map(([kind, seed]) => () => bergGrid(seed, kind)());
  const bergPlaces = [[-40, -52, 0], [-14, -66, 1], [16, -48, 3], [44, -60, 2], [-66, -70, 2], [70, -78, 0], [2, -96, 1], [-30, -100, 3], [34, -104, 0]];
  for (const [x, z, k] of bergPlaces) {
    const m = K.mesh('berg' + k, bergMeshes[k], { scale: 0.55 }, x, -1.0, z, K.rand(0, 6), K.rand(0.8, 1.2));
    bergs.push([m, K.rand(0, 6)]);
  }
  K.onUpdate((dt, t) => { for (const [m, ph] of bergs) { m.position.y = -1.05 + Math.sin(t * 0.5 + ph) * 0.07; m.rotation.z = Math.sin(t * 0.33 + ph) * 0.012; } });
  const floes = [];
  for (let i = 0; i < 26; i++) floes.push([K.rand(-60, 60), -1.05, K.rand(-44, -34), K.rand(0, 6), [K.rand(0.6, 1.6), 1, K.rand(0.5, 1.2)]]);
  K.inst('floe', () => { const g = new VoxGrid(); g.box(-3, 0, -2, 2, 1, 1, (x, y) => (y ? C.snowW : C.ice)); g.set(-3, 1, -2, null).set(2, 1, 1, null); return g; }, { scale: 0.25 }, floes);

  // ---- ground: fine snow near the camera, coarse ice shelf far away
  const snowCol = (x, z) => {
    const sas = vnoise(x * 0.05 + z * 0.35, 2.5, z * 0.08);
    const m = hash3(Math.floor(x * 2), 11, Math.floor(z * 2));
    if (m < 0.01) return C.snowW;
    if (vnoise(x * 0.07, 6, z * 0.12) > 0.74) return m < 0.5 ? C.iceL : 0xbfe4f6; // wind-polished blue ice
    return sas > 0.66 ? C.snowW : sas < 0.3 ? C.snowS : m < 0.25 ? C.snow2 : C.snow;
  };
  const prints = (x, z) => Math.abs(z - (4.2 + Math.sin(x * 0.18) * 0.6)) < 0.3 && (Math.floor(x * 1.4) & 1) && x > -30 && x < 26;
  K.ground({
    id: 'groundNear', x0: -64, x1: 64, z0: -14, z1: 48, scale: 0.5,
    color: (x, z) => {
      if (Math.abs(z) < LH + 0.3) return C.snowS;
      const cv = crevCol(crevasse(x + 0.25, z + 0.25));
      if (cv) return cv;
      if (prints(x, z)) return C.snowB;
      return snowCol(x, z);
    },
  });
  const shelfEdge = (x) => -31 - vnoise(x * 0.06, 1, 4) * 8 + (Math.abs(x) > 50 ? 6 : 0);
  K.ground({
    id: 'groundFar', x0: -120, x1: 120, z0: -48, z1: -14, scale: 1,
    skip: (x, z) => z < shelfEdge(x),
    color: (x, z) => {
      const e = z - shelfEdge(x);
      if (e < 1.2) return e < 0.6 ? C.iceD : C.ice;
      const cv = crevCol(crevasse(x + 0.5, z + 0.5));
      if (cv) return cv;
      if (Math.abs(x + 3) < 7 && z > -26 && z < -17) return (Math.floor(x) + Math.floor(z)) & 1 ? C.snowS : C.snowB; // trampled pad by the station
      if (Math.abs(z + 15.5 + Math.sin(x * 0.1) * 1.5) < 0.6) return C.snowB; // snowmobile track
      return snowCol(x, z);
    },
  });
  // ice-shelf cliff face (seen in portrait / from the sides)
  K.mesh('shelfFace', () => {
    const g = new VoxGrid();
    for (let x = -120; x < 120; x++) {
      const ze = Math.ceil(shelfEdge(x + 0.5));
      for (let y = -3; y < 0; y++) g.set(x, y, ze - 1, y === -1 ? C.iceL : (x & 3) === 0 ? C.iceD : C.ice);
    }
    return g;
  }, { scale: 1, pivot: [0, 0, 0] }, 0, -0.02, 0);

  // ---- lane: packed snow slabs, groomer tread marks, ice-block kerbs
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.snowB,
    color: (ix, iz, x, z) => {
      if (iz <= -9 || iz >= 8) {
        const blk = ((ix >> 2) + (iz < 0 ? 1 : 0)) & 1;
        return (ix & 3) === 0 ? C.iceD : blk ? C.ice : C.iceL;
      }
      const zc = z + 0.125;
      if (Math.abs(x + 0.125) < 0.2 && ((ix >> 1) & 1)) return 0x9fd0ee; // dashed centre line
      const tz = Math.abs(zc);
      if (tz > 1.15 && tz < 1.65) return (ix & 1) ? C.snowS : C.snowB; // groomer treads
      const n = vnoise(x * 0.2, 1.5, z * 0.6);
      if (n > 0.72) return hash3(ix, 2, iz) < 0.5 ? C.iceL : 0xc2e6f6;
      const tile = ((Math.floor(ix / 10) + Math.floor((iz + 10) / 7)) & 1) ? C.snow : C.snow2;
      if ((((ix % 10) + 10) % 10) === 0 || iz === -3 || iz === 3) return shade(tile, -0.05);
      return hash3(ix, 5, iz) < 0.08 ? C.snowW : tile;
    },
    raise: (ix, iz) => (iz === -10 || iz === 9) && ((ix >> 2) & 1) === 0,
    raiseColor: (ix, iz) => ((ix & 3) === 0 ? C.ice : hash3(ix, iz, 1) < 0.5 ? C.snowW : C.iceL),
  });
  // glowing snowflake centre marker
  K.mesh('centerFlake', () => {
    const g = new VoxGrid();
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      for (let r = 0; r <= 5; r++) g.set(Math.round(Math.cos(ang) * r), 0, Math.round(Math.sin(ang) * r), C.cyan, true);
      for (const s of [-1, 1]) g.set(Math.round(Math.cos(ang) * 3 + Math.cos(ang + s * 1.1) * 1.5), 0, Math.round(Math.sin(ang) * 3 + Math.sin(ang + s * 1.1) * 1.5), C.cyan, true);
    }
    return g;
  }, { scale: 0.12, pivot: [0, 0, 0] }, 0.06, 0.003, 1.55);

  // ---- breakables right behind the lane
  const brk = [[-19, 'barrel'], [-9.5, 'snowman'], [-3.2, 'crate'], [4.4, 'ice'], [10.2, 'barrel'], [18.6, 'crate']];
  for (const [x, kind] of brk) {
    if (kind === 'barrel') K.breakable('barrel', 'fuelDrum', fuelDrumGrid, { scale: 0.1 }, x, -3.25, K.rand(0, 1));
    else if (kind === 'crate') K.breakable('crate', 'supplyCrate', crateGrid, { scale: 0.11 }, x, -3.3, K.rand(-0.3, 0.3));
    else if (kind === 'snowman') K.breakable('snowman', 'snowman', snowmanGrid, { scale: 0.085 }, x, -3.2, K.rand(-0.4, 0.4));
    else K.breakable('ice', 'iceBlock', iceBlockGrid, { scale: 0.1 }, x, -3.2, K.rand(-0.2, 0.2));
  }

  // ---- camp behind the lane
  K.inst('domeTent', tentGrid, { scale: 0.115, ao: true }, [[-15.5, 0, -7.4, 0.2], [-6.5, 0, -9.6, -0.15], [8.6, 0, -7.6, 0.1], [15, 0, -9.2, -0.3], [22.5, 0, -7.2, 0.25], [-25, 0, -8.6, 0.1]], { shadow: true });
  K.mesh('messTent', tunnelTentGrid, { scale: 0.13, ao: true }, -21, 0, -12.6, 0.12, 1, { shadow: true });
  K.inst('snowmobile', snowmobileGrid, { scale: 0.075, ao: true }, [[-11.2, 0, -5.4, 0.35], [1.6, 0, -6.0, -0.4], [19.6, 0, -5.0, 2.9]], { shadow: true });
  K.inst('drumStack', drumStackGrid, { scale: 0.1, ao: true }, [[11.6, 0, -11.2, 0.3], [-28.5, 0, -6, -0.4]], { shadow: true });
  K.inst('sled', sledGrid, { scale: 0.09, ao: true }, [[-1.5, 0, -4.4, 0.15], [24.5, 0, -10.5, -0.6]], { shadow: true });
  K.mesh('signpost', signpostGrid, { scale: 0.08, ao: true }, 5.6, 0, -4.6, -0.12, 1, { shadow: true });
  // ceremonial pole ring with waving flags
  K.mesh('polarPole', polarPoleGrid, { scale: 0.075, ao: true }, -1.2, 0, -10.6, 0, 1, { shadow: true });
  const ring = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.05 + (i / 6) * 0.9);
    ring.push([-1.2 - Math.cos(a) * 2.6, -10.6 - Math.sin(a) * 1.5, i, 0]);
  }
  addFlags(K, ring, 0.075);
  // lamp posts (warm glow) + weather mast with spinning anemometer
  K.inst('lamp', lampGrid, { scale: 0.11, ao: true }, [[-13, 0, -4.4, 0], [-4.8, 0, -5.4, 0], [6.6, 0, -6.2, Math.PI], [13.4, 0, -4.8, Math.PI], [-24, 0, -4.8, 0], [24, 0, -5, Math.PI]], { shadow: true });
  K.mesh('mast', mastGrid, { scale: 0.11, ao: true }, 4.2, 0, -12.8, 0.3, 1, { shadow: true });
  const cups = K.mesh('cups', cupsGrid, { scale: 0.11, ao: true }, 4.2, 23.5 * 0.11, -12.8);
  K.onUpdate((dt, t) => { cups.rotation.y = t * 5; });

  // ---- landmarks: station, wind turbines, dish, ice cliffs
  K.mesh('station', stationGrid, { scale: 0.19, pivot: [0, 0, 4] }, -3.5, 0, -22, 0, 1, { shadow: true });
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), glowMat(0xff3a3a));
  beacon.position.set(-3.5 - 24 * 0.19, 41.6 * 0.19, -22 - 6 * 0.19);
  K.add(beacon);
  beacon.material = beacon.material.clone();
  beacon.material.color.setRGB(2.2, 0.4, 0.4);
  K.onUpdate((dt, t) => { beacon.visible = (t % 1.6) < 0.45; });
  for (const [x, z, s, ph] of [[13, -27, 0.13, 0], [-19, -31, 0.12, 1.3], [30, -33, 0.11, 2.1]]) {
    K.mesh('windTower', windTowerGrid, { scale: 0.13 }, x, 0, z, 0, s / 0.13);
    const rot = K.mesh('rotor', rotorGrid, { scale: 0.13, pivot: [0.5, 0.5, 0] }, x, 49.5 * s, z + 3.5 * s, 0, s / 0.13);
    K.onUpdate((dt, t) => { rot.rotation.z = -t * 1.4 - ph; });
  }
  K.mesh('dish', dishGrid, { scale: 0.12, ao: true }, 9.5, 0, -18.5, -0.5, 1, { shadow: true });
  K.mesh('iceCliffL', iceCliffGrid(3, 30, 22, 12), { scale: 0.42 }, -24, 0, -16.5, 0.15);
  K.mesh('iceCliffR', iceCliffGrid(7, 26, 18, 10), { scale: 0.42 }, 25.5, 0, -19, -0.2);
  K.mesh('iceCliffFL', iceCliffGrid(11, 34, 26, 12), { scale: 0.45 }, -46, 0, -23, 0.3);
  K.mesh('iceCliffFR', iceCliffGrid(13, 30, 24, 12), { scale: 0.45 }, 47, 0, -24, -0.35);
  K.inst('snowMound', driftGrid, { scale: 0.22 }, [[-12, 0, -16, 0, [1.4, 0.5, 1]], [17, 0, -15, 1, [1.6, 0.45, 1]], [-33, 0, -13, 2, [1.8, 0.5, 1.2]], [33, 0, -14, 0.5, [1.5, 0.5, 1]], [5, 0, -28, 0, [2, 0.6, 1.2]], [-14, 0, -27, 1, [1.6, 0.5, 1]]]);

  // ---- penguins: pacing behind the lane + a colony at the shelf edge
  addPenguins(K, [
    [-17.5, -12.5, -4.6, 0.45, 0.3, 1], [-8.5, -3.8, -7.2, 0.35, 1.7, 0.9], [2.5, 7.0, -8.6, 0.5, 2.9, 1], [15.5, 21.0, -5.8, 0.4, 0.8, 0.85],
    [-30, -22, -5.5, 0.3, 3.3, 1], [22, 28, -11.2, 0.38, 4.4, 0.95], [-4, 3, -13.8, 0.45, 2.2, 1.1],
    [-12, 6, -29.5, 1.6, 0.4, 1, 'slide'], [8, 24, -31.5, 1.3, 2.6, 0.95, 'slide'],
    [-9, 0.4, -27.8, 0, 1.1, 1, 'idle'], [-7.8, -0.5, -28.4, 0, 2.2, 0.95, 'idle'], [-8.6, 0.9, -29.2, 0, 3.1, 0.6, 'idle'], [-6.6, 0.2, -27.6, 0, 0.6, 1.05, 'idle'],
    [16.5, -0.6, -29.8, 0, 1.6, 1, 'idle'], [17.6, 0.3, -30.4, 0, 2.6, 0.95, 'idle'], [18.4, -0.2, -29.6, 0, 0.2, 0.62, 'idle'],
    [-36, -0.3, -9.6, 0, 1.9, 1, 'idle'], [-35, 0.5, -10.2, 0, 2.8, 0.9, 'idle'],
  ]);

  // ---- LOW foreground: drifts, ice chunks, trail markers, crevasse lips
  const drifts = [];
  for (let i = 0; i < 26; i++) {
    const x = K.rand(-44, 44), z = K.rand(LH + 1.6, 16);
    if (crevasse(x, z) < 2.5) continue;
    drifts.push([x, 0, z, K.rand(0, 6), K.rand(0.7, 1.25)]);
  }
  K.inst('iceRubble', iceRubbleGrid, { scale: 0.1 }, drifts);
  const chunks = [];
  for (let i = 0; i < 22; i++) chunks.push([K.rand(-40, 40), 0, K.rand(LH + 1.2, 13), K.rand(0, 6), K.rand(0.6, 1.1)]);
  K.inst('iceChunk', () => { const g = new VoxGrid(); g.box(-1, 0, -1, 1, 1, 0, (x, y) => (y ? C.iceL : C.ice)); g.set(0, 2, -1, C.iceL); return g; }, { scale: 0.12 }, chunks);
  const markers = [];
  for (let x = -22; x <= 22; x += 5.5) markers.push([x + K.rand(-0.5, 0.5), 0, LH + 0.7, K.rand(-0.3, 0.3)]);
  K.inst('trailMarker', markerGrid, { scale: 0.05 }, markers);

  // ---- falling snow
  addSnowfall(K, 700, [-46, 46, -26, 18, 17]);

  return {
    sky,
    fog: { color: 0x2a5c84, near: 70, far: 230 },
    lights: { sky: 0xa4bcec, ground: 0x4a5a84, hemi: 1.0, sun: 1.7, sunColor: 0xd0dcff, dir: [-6, 14, 10], rim: 0.85, rimColor: 0x8affd0 },
    dust: 0xf2f8ff,
    bloom: { strength: 0.8, threshold: 1.7, radius: 0.25 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // an ice floe plinth in a ring of dark sea, with a mini camp on top
  K.mesh('zoneFloe', () => {
    const g = new VoxGrid();
    for (let x = -27; x <= 26; x++) for (let z = -27; z <= 26; z++) {
      const a = Math.atan2(z + 0.5, x + 0.5);
      const r = Math.sqrt((x + 0.5) ** 2 + (z + 0.5) ** 2);
      const R = 23.5 + Math.sin(a * 5) * 1.2 + Math.sin(a * 11 + 1) * 0.6;
      if (r > R) continue;
      const cv = crevCol(crevasse(x * 0.25, z * 0.25, [[[-4.5, 1.2], [-2.5, 2.4], [-0.5, 1.6]]]));
      const top = cv ?? (r > R - 1 ? C.snowS : vnoise(x * 0.2, 1, z * 0.2) > 0.66 ? C.snowW : hash3(x, 1, z) < 0.2 ? C.snow2 : C.snow);
      g.set(x, 0, z, top);
      for (let y = -1; y >= -6; y--) g.set(x, y, z, y === -1 ? C.iceL : y < -4 ? C.iceD : hash3(x, y >> 1, z) < 0.4 ? C.iceL : C.ice);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 1, 0] }, 0, 0, 0);
  const sea = new THREE.Mesh(new THREE.RingGeometry(5.6, 7, 48), new THREE.MeshLambertMaterial({ color: 0x173a66 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.9;
  K.add(sea);
  K.inst('floe', () => { const g = new VoxGrid(); g.box(-3, 0, -2, 2, 1, 1, (x, y) => (y ? C.snowW : C.ice)); return g; }, { scale: 0.2 }, [[6.2, -0.95, 1, 0.4], [-5.8, -0.95, -3, 1.2], [3, -0.95, 6, 2.2], [-2, -0.95, -6.3, 0.2]]);

  K.mesh('station', stationGrid, { scale: 0.09, pivot: [0, 0, 4] }, 0.8, 0, -3.2, 0, 1, { shadow: true });
  K.inst('domeTent', tentGrid, { scale: 0.09, ao: true }, [[-3.6, 0, -1.2, 0.6], [-4.2, 0, 1.6, 1.1], [3.8, 0, 1.2, -0.7]], { shadow: true });
  K.mesh('iceCliffZ', iceCliffGrid(5, 18, 16, 8), { scale: 0.22 }, -2.2, 0, -4.6, 0.25);
  K.mesh('polarPole', polarPoleGrid, { scale: 0.06, ao: true }, 1.2, 0, 1.4, 0, 1, { shadow: true });
  const ring = [];
  for (let i = 0; i < 5; i++) { const a = Math.PI * (0.1 + (i / 4) * 0.8); ring.push([1.2 - Math.cos(a) * 1.3, 1.4 - Math.sin(a) * 1.0, i + 1, 0]); }
  addFlags(K, ring, 0.06);
  K.mesh('snowmobile', snowmobileGrid, { scale: 0.06, ao: true }, 3.6, 0, 3.4, -0.6, 1, { shadow: true });
  K.mesh('snowman', snowmanGrid, { scale: 0.07, ao: true }, -1.6, 0, 3.8, 0.4, 1, { shadow: true });
  K.inst('drumStack', drumStackGrid, { scale: 0.07, ao: true }, [[4.6, 0, -1.4, -0.8]], { shadow: true });
  const tower = K.mesh('windTower', windTowerGrid, { scale: 0.09 }, 5.0, 0, -3.6);
  void tower;
  const rot = K.mesh('rotor', rotorGrid, { scale: 0.09, pivot: [0.5, 0.5, 0] }, 5.0, 49.5 * 0.09, -3.6 + 3.5 * 0.09);
  K.onUpdate((dt, t) => { rot.rotation.z = -t * 1.4; });
  addPenguins(K, [
    [-3.5, 0.5, 4.6, 0.35, 0.2, 1], [-1, 3.5, 5.2, 0.3, 1.9, 0.9], [-5.4, -2.6, 2.8, 0.25, 3.1, 0.8],
    [2.2, 0.6, -0.4, 0, 0.6, 1, 'idle'], [2.8, -0.4, 0.2, 0, 1.6, 0.65, 'idle'], [-5.2, 1.2, -0.6, 0, 2.4, 1, 'idle'],
  ], 0.035);
  addSnowfall(K, 160, [-7, 7, -7, 7, 9]);

  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; K.root.add(o); K.hotspots[name] = o; return o; };
  anchor('boss', -3.2, 0, 3.2);
  anchor('npc', 2.4, 0, 3.8);
  anchor('enterBase', 0.8, 0.8, -1.6);
  return { focus: [0, 1.2, 0], radius: 7 };
}
