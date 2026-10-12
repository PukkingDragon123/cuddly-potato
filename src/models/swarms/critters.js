// Creepy Critters & Lab Brats vermin. Hi-res (0.05) toy sculpts in the MrBeast
// Lab Swarms style: oversized heads, angry faces, open mouths full of teeth,
// saturated colours with magenta accents and a few glowing bits.
// See ../kit.js and ./panthers.js for the modelling conventions.
import { G, blob, capsule, chain, stamp, gradY, n3, jp, shade } from '../kit.js';

const INK = 0x15121f, WHITE = 0xffffff, MAG = 0xff1f9e;
const MOUTH = 0x4a0820, TONGUE = 0xff5a8a;

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}

/**
 * Spherical cartoon eyeball with an angry lid (top above a slanted line, lower
 * towards the nose), a thick brow riding the lid line and a stamped pupil.
 * side: -1 = model's left. Reads from the front AND in profile.
 */
function orbEye(g, cx, cy, cz, r, side, o = {}) {
  const lidC = o.lid ?? INK, white = o.white ?? WHITE;
  blob(g, cx, cy, cz, r, r, r, white, { p: 2 });
  const slant = o.slant ?? 0.45, lift = o.lift ?? 0.5;
  const lineY = (x) => cy + r * lift + (x - cx) * side * slant;
  g.paint((x, y, z, c) => (c === white && y >= lineY(x) && Math.hypot(x - cx, y - cy, z - cz) <= r + 0.8 ? lidC : undefined));
  if (o.brow !== false) {
    const bz = (x, y) => cz + Math.sqrt(Math.max(0, r * r - (x - cx) ** 2 - (y - cy) ** 2)) * 0.85;
    const xo = cx + side * r * 0.95, xi = cx - side * r * 0.95;
    const yo = lineY(xo) + 0.3, yi = lineY(xi) + 0.3;
    capsule(g, [xo, yo, bz(xo, yo)], [xi, yi, bz(xi, yi) + 0.4], o.browR ?? 0.9, o.browR ?? 0.9, o.browCol ?? INK);
  }
  const pw = o.pw ?? 2, ph = o.ph ?? 2;
  const px = Math.round(cx - side * (o.inward ?? 0.5) - pw / 2 + 0.5), py = Math.round(cy - 0.5 + ph / 2 - 0.5);
  const art = [];
  for (let v = 0; v < ph; v++) art.push('P'.repeat(pw));
  if (o.glint !== false && pw * ph > 1) { const gx = side < 0 ? 0 : pw - 1; art[0] = art[0].slice(0, gx) + 'G' + art[0].slice(gx + 1); }
  stamp(g, art, { P: { c: o.pupil ?? INK, glow: !!o.pupilGlow }, G: { c: WHITE, glow: true } }, { axis: 'z', x: px, y: py, depth: 2, zmin: Math.floor(cz), zmax: Math.ceil(cz + r + 2) });
  return g;
}

// ===========================================================================
// Raging Rat (Lab Brats): brown rat with glowing green crystals growing out of
// its body and a melting yellow head. Small and fast; comes in a pack of 3.

function ragingRatDef() {
  const FUR = 0x8a5634, FUR_D = 0x5e3820, BELLY = 0xd8aa7a, YEL = 0xffd21f, YEL_L = 0xfff07a, YEL_D = 0xe8a00a;
  const PINK = 0xff8aa8, PINK_D = 0xe0607e, CRY = 0x3aff6a, CRY_L = 0xc0ffd0, CRY_D = 0x14b04a;

  // ---- body: hunched brown rat body, lighter belly, crystals bursting out
  const body = G();
  blob(body, -0.5, 6.4, -2.2, 4.4, 3.9, 6.2, (x, y, z) => (n3(x, y, z, 3) < 0.08 ? FUR_D : FUR), { p: 2.2 });
  blob(body, -0.5, 7.4, 2.6, 3.6, 3.4, 3.2, FUR, { p: 2.2 }); // shoulders / neck
  body.paint((x, y, z, c) => (y <= 4 && Math.abs(x + 0.5) <= 3 ? BELLY : undefined));
  // crystals: faceted green shards (glowing tips) along the spine and flanks
  const crystal = (base, tip, r) => {
    capsule(body, base, tip, r, 0.25, (x, y, z, t) => (t > 0.75 ? CRY_L : n3(x, y, z, 7) < 0.4 ? CRY_D : CRY));
    body.set(Math.round(tip[0]), Math.round(tip[1]), Math.round(tip[2]), CRY_L, true);
  };
  crystal([-0.5, 9.5, -1], [-1, 14, -2.5], 1.4);
  crystal([-1.5, 9.5, -4], [-3.5, 13, -6], 1.2);
  crystal([0.5, 9.5, -5], [2.5, 12.6, -7.5], 1.2);
  crystal([-0.5, 9, -7], [-0.5, 11.5, -10], 1);
  crystal([-4.4, 7, -3], [-7, 9, -4], 0.9);
  crystal([3.4, 7, -1], [6, 9.4, -2], 0.9);
  // crystals glinting INSIDE the body (window patches on the flanks)
  for (const [x, y, z] of [[-5, 6, -4], [-5, 5, -1], [4, 6, -5], [4, 5, -2], [-5, 7, -6], [4, 7, 0]]) {
    for (const [dy, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) if (body.has(x, y + dy, z + dz)) body.set(x, y + dy, z + dz, dy === 1 ? CRY_L : CRY);
  }
  gradY(body, 2, 11, -0.12, 0.06, (x, y, z, c) => c === FUR || c === FUR_D);

  // ---- head: oversized melting yellow head with a pointy snout
  const HJ = [-0.5, 8.5, 3];
  const head = G();
  blob(head, -0.5, 11.6, 5.6, 5.3, 4.8, 4.8, YEL, { p: 2.2 });
  blob(head, -0.5, 9.1, 10.2, 2.4, 1.9, 3, YEL, { p: 2.2 }); // snout
  blob(head, -0.5, 9.8, 13.1, 1.2, 1, 0.9, PINK); // nose
  head.set(-1, 10, 14, WHITE, true);
  // round ears (melting at the rims) with pink insides
  for (const s of [-1, 1]) {
    const ex = s < 0 ? -4.6 : 3.6;
    blob(head, ex, 16.2, 4, 2.7, 2.7, 1.2, YEL, { p: 2 });
    blob(head, ex, 16.2, 4.8, 1.7, 1.7, 0.6, PINK);
  }
  // melting: drips of yellow running down off the head onto the fur
  const drips = [[-5, 9, 6, 3], [-4, 8, 9, 4], [4, 9, 5, 3], [3, 8, 9, 3], [-2, 7, 9, 2], [1, 7, 10, 2], [-5, 11, 3, 4], [4, 11, 3, 5], [-1, 8, 2, 4], [0, 15, 2, 2]];
  for (const [x, y, z, n] of drips) {
    let zz = z;
    for (let k = 0; k < 6 && !head.has(x, y, zz); k++) zz += zz < 6 ? 1 : -1;
    for (let i = 0; i < n; i++) head.set(x, y - i, zz, i === n - 1 ? YEL_L : YEL_D);
    head.set(x, y - n, zz, YEL_L);
  }
  // goopy highlight + blotches
  head.paint((x, y, z, c) => (c === YEL && y >= 14 && n3(x, y, z, 2) < 0.3 ? YEL_L : c === YEL && y <= 9 && n3(x, y, z, 4) < 0.35 ? YEL_D : undefined));
  // big angry eyes with glowing green (mutant) pupils
  orbEye(head, -3.1, 13.2, 8.7, 2.4, -1, { lid: YEL_D, browCol: FUR_D, slant: 0.5, lift: 0.45, pupil: 0x10a040, pupilGlow: true, browR: 0.8 });
  orbEye(head, 2.1, 13.2, 8.7, 2.4, 1, { lid: YEL_D, browCol: FUR_D, slant: 0.5, lift: 0.45, pupil: 0x10a040, pupilGlow: true, browR: 0.8 });
  // open mouth under the snout + big buck teeth
  head.carve((x, y, z) => y <= 7 && z >= 7 && Math.abs(x + 0.5) <= 2.6);
  for (let x = -3; x <= 2; x++) for (let z = 7; z <= 12; z++) if (head.has(x, 8, z)) head.set(x, 7, z, MOUTH);
  for (const x of [-1, 0]) for (let y = 5; y <= 7; y++) { head.set(x, y, 12, WHITE); head.set(x, y, 11, WHITE); }
  head.set(-1, 5, 12, 0xfff4d0); head.set(0, 5, 12, 0xfff4d0);
  // magenta bolt on the forehead
  stamp(head, ['.MM', 'MM.', 'MMM', '.M.'], { M: MAG }, { axis: 'z', x: -2, y: 16, zmin: 4, zmax: 12 });

  // ---- jaw
  const JJ = [-0.5, 7, 7];
  const jaw = G();
  blob(jaw, -0.5, 6, 9.6, 2.4, 1.3, 2.8, YEL_D, { p: 2.2 });
  jaw.carve((x, y) => y > 6);
  for (let x = -2; x <= 1; x++) for (let z = 8; z <= 11; z++) if (jaw.has(x, 6, z)) jaw.set(x, 6, z, Math.abs(x + 0.5) <= 1 ? TONGUE : MOUTH);
  for (const x of [-2, 1]) jaw.set(x, 7, 11, WHITE);

  // ---- legs with pink paws + claws
  const leg = (front) => {
    const g = G();
    const cx = -3.4, cz = front ? 2.2 : -6;
    if (!front) blob(g, cx, 5.5, cz, 2.2, 2.6, 2.6, FUR, { p: 2.2 });
    capsule(g, [cx, front ? 6 : 5, cz], [cx, 1.6, cz + 0.4], 1.3, 1.1, FUR_D);
    blob(g, cx, 0.9, cz + 1, 1.6, 1, 2, PINK, { p: 2.2, clip: (x, y) => y < 0 });
    for (const dx of [-1, 0, 1]) g.set(cx + dx, 0, cz + 3, INK);
    return g;
  };
  const legFL = leg(true), legBL = leg(false);

  // ---- long pink tail curling up behind
  const TJ = [-0.5, 5.5, -8];
  const tail = G();
  chain(tail, [[-0.5, 5.5, -8], [-0.5, 4.2, -11.5], [-0.5, 5, -15], [-0.5, 8, -17], [-0.5, 11, -16], [-0.5, 12, -13.5]], [1.2, 0.45], (x, y, z) => ((y + z + 40) % 3 === 0 ? PINK_D : PINK));

  return {
    gait: 'walk',
    voxel: 0.05,
    parts: [
      jp('legFL', legFL, [-3.4, 6, 2.2]), jp('legFR', flipX(legFL), [2.4, 6, 2.2]),
      jp('legBL', legBL, [-3.4, 6, -6]), jp('legBR', flipX(legBL), [2.4, 6, -6]),
      jp('body', body, [-0.5, 0, 0]),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.15, 0, 0] }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, 9, 14],
    finish: 'gloss',
    jitter: 0.02,
  };
}

// ===========================================================================
// Vex Viper (Creepy Critters): a coiled violet viper with huge fangs, horned
// brows and a forked tongue. Rears back and spits glowing venom (ranged).

/**
 * Sweep a tube along a centreline. pts: dense samples [[x,y,z],...], rAt(i) radius.
 * col(info) gets { x, y, z, i, s (arc length), oy (vertical offset / r), lat (side offset / r) }.
 */
function tube(g, pts, rAt, col) {
  const best = new Map();
  let s = 0;
  const arc = [0];
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); arc.push(s); }
  pts.forEach((p, i) => {
    const r = rAt(i), R = Math.ceil(r + 1);
    const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let tx = q[0] - o[0], tz = q[2] - o[2];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    for (let x = Math.floor(p[0] - R); x <= Math.ceil(p[0] + R); x++) for (let y = Math.floor(p[1] - R); y <= Math.ceil(p[1] + R); y++) for (let z = Math.floor(p[2] - R); z <= Math.ceil(p[2] + R); z++) {
      const dx = x - p[0], dy = y - p[1], dz = z - p[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > r + 0.4) continue;
      const k = `${x},${y},${z}`;
      const prev = best.get(k);
      if (prev && prev.d <= d) continue;
      best.set(k, { d, x, y, z, i, s: arc[i], oy: dy / r, lat: (dx * tz - dz * tx) / r });
    }
  });
  for (const v of best.values()) { const c = col(v); if (c != null) g.set(v.x, v.y, v.z, c); }
  return g;
}

function vexViperDef() {
  const VIO = 0x8a3aff, VIO_D = 0x4e16b0, VIO_L = 0xb47aff, BELLY = 0xe6c4ff, VENOM = 0x7cff3a, YEL = 0xfff04a;
  const scales = (v) => {
    if (v.oy < -0.35) return (Math.floor(v.s / 1.5) % 2 === 0) ? BELLY : shade(BELLY, -0.07);
    // dark chevron bands with a magenta stripe down the middle of each
    const ph = ((v.s / 6 - Math.abs(v.lat) * 0.3) % 1 + 1) % 1;
    if (ph < 0.2) return VIO_D;
    if (ph < 0.28 && v.oy > -0.1) return MAG;
    return VIO;
  };
  // ---- coiled body: 2.25 loops spiralling up and inwards, ending at the front
  const CZ = -3;
  const coil = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const f = i / N, a = f * 2.25 * Math.PI * 2;
    const R = 7.2 - 3.4 * f;
    coil.push([-0.5 + R * Math.cos(a), 2.7 + 7.2 * f, CZ + R * Math.sin(a)]);
  }
  // rising neck (body part keeps the lower neck)
  const neck = [[-0.5, 9.9, CZ + 3.8], [-0.5, 12.5, CZ + 4.6], [-0.5, 15, CZ + 5.4]];
  const pts = coil.concat(neck.slice(1));
  const body = G();
  tube(body, pts, (i) => (i <= N ? 2.9 - 0.5 * (i / N) : 2.4), scales);
  gradY(body, 0, 16, -0.12, 0.05, (x, y, z, c) => c === VIO || c === VIO_D);

  // ---- tail: the outer end of the coil sweeping back to a magenta spike
  const TJ = [coil[0][0], coil[0][1], coil[0][2]];
  const tail = G();
  const tpts = [];
  for (let i = 0; i <= 24; i++) {
    const f = i / 24;
    tpts.push([coil[0][0] - Math.sin(f * 2.2) * 3.4, 2.4 + f * 1.2, coil[0][2] - f * 9.5]);
  }
  tube(tail, tpts, (i) => 2.6 - 2 * (i / 24), (v) => scales({ ...v, s: -v.s }));
  capsule(tail, tpts[24], [tpts[24][0] - 1.6, tpts[24][1] + 2.2, tpts[24][2] - 2.2], 0.8, 0.2, MAG);

  // ---- head: big triangular viper head, horned brows, mouth open with huge fangs
  const HJ = [-0.5, 15, 2.4];
  const head = G();
  const hw = (z) => 6 * (1 - 0.45 * Math.max(0, (z - 4.5) / 7));
  tube(head, [[-0.5, 15, 2.4], [-0.5, 17.5, 3.4], [-0.5, 19.5, 4.6]], () => 2.5, scales);
  blob(head, -0.5, 21.8, 6.4, 6, 3.4, 6.8, (x, y, z) => (y >= 24 && Math.abs(x + 0.5) < 1.2 && (z & 1) ? VIO_D : y >= 22 ? VIO : VIO_L), {
    p: 2.4, clip: (x, y, z) => Math.abs(x + 0.5) > hw(z) + 0.4,
  });
  for (const s of [-1, 1]) blob(head, s < 0 ? -5 : 4, 20.4, 3.4, 2.2, 2.2, 2.6, VIO, { p: 2.2 }); // venom-gland cheeks
  // open mouth: hollow under the roof, pink roof, two huge fangs
  head.carve((x, y, z) => y <= 20 && z >= 4.5);
  for (let x = -7; x <= 6; x++) for (let z = 4; z <= 14; z++) if (head.has(x, 21, z) && !head.has(x, 20, z) && Math.abs(x + 0.5) < hw(z) - 0.6) head.set(x, 21, z, 0xff5aa8);
  for (const fx of [-3, 2]) {
    const fz0 = 10.4;
    capsule(head, [fx, 20.6, fz0], [fx + (fx < 0 ? 0.3 : -0.3), 16.4, fz0 + 0.6], 1, 0.25, WHITE);
    head.set(fx, 16, Math.round(fz0 + 0.6), VENOM, true);
    head.set(fx, 15, Math.round(fz0 + 0.6), VENOM, true);
  }
  for (const x of [-2, -1, 0, 1]) head.set(x, 20, 12, WHITE);
  // nostrils + magenta bolt on the crown
  for (const x of [-2, 1]) head.set(x, 22, 13, INK);
  stamp(head, ['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], { M: MAG }, { axis: 'y', x: -2, z: 1 });
  // angry slit-pupil eyes + horned brows
  orbEye(head, -3.6, 23.8, 8.2, 2.6, -1, { white: YEL, lid: VIO, browCol: VIO_D, slant: 0.4, lift: 0.62, pw: 1, ph: 3, inward: 0.2 });
  orbEye(head, 2.6, 23.8, 8.2, 2.6, 1, { white: YEL, lid: VIO, browCol: VIO_D, slant: 0.4, lift: 0.62, pw: 1, ph: 3, inward: 0.2 });
  for (const s of [-1, 1]) {
    const hx = s < 0 ? -4.8 : 3.8;
    capsule(head, [hx, 25.4, 6.6], [hx + s * 1.6, 28.8, 3.6], 1.1, 0.25, VIO_D);
  }

  // ---- lower jaw with a forked tongue (drops on attacks)
  const JJ = [-0.5, 19.6, 3.6];
  const jaw = G();
  blob(jaw, -0.5, 18.4, 7.6, 5, 1.6, 5.8, VIO_L, { p: 2.3, clip: (x, y, z) => Math.abs(x + 0.5) > hw(z) - 0.2 || y > 19 });
  for (let x = -6; x <= 5; x++) for (let z = 4; z <= 14; z++) if (jaw.has(x, 19, z) && Math.abs(x + 0.5) < hw(z) - 1.4) jaw.set(x, 19, z, MOUTH);
  for (const x of [-3, 2]) jaw.set(x, 20, 11, WHITE);
  capsule(jaw, [-0.5, 19.4, 6], [-0.5, 19.8, 13.5], 0.7, 0.6, MAG);
  capsule(jaw, [-0.5, 19.8, 13.5], [-1.8, 20.4, 15.6], 0.5, 0.3, MAG);
  capsule(jaw, [-0.5, 19.8, 13.5], [0.8, 20.4, 15.6], 0.5, 0.3, MAG);

  return {
    gait: 'slide',
    voxel: 0.05,
    parts: [
      jp('body', body, [-0.5, 0, 0]),
      jp('tail', tail, TJ),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.3, 0, 0] }),
    ],
    muzzle: [-0.5, 19.5, 13],
    finish: 'gloss',
    jitter: 0.02,
  };
}

export const CRITTER_MODELS = {
  ragingRat() {
    return ragingRatDef();
  },

  vexViper() {
    return vexViperDef();
  },
};
