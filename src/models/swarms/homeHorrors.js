// Home Horrors: household objects gone feral. Hi-res (0.05) toy sculpts in the
// MrBeast Lab Swarms style: chunky chibi silhouettes, big angry faces, open
// mouths full of teeth, neon colours with MrBeast-magenta accents and leaking
// goo. See ../kit.js and ./panthers.js for the modelling conventions.
import {
  G, blob, rbox, capsule, chain, cyl, stamp, mirror, sym, symBox, glowWhere, gradY, n3, jp, shade, mixHex,
} from '../kit.js';

// ---------------------------------------------------------------------------
// Shared palette + helpers

const INK = 0x15121f, WHITE = 0xffffff, MAG = 0xff1f9e, MAG_L = 0xff7ccc;
const MOUTH = 0x3a0a22, TONGUE = 0xff5a8a, CHROME = 0xdfe6f0, CHROME_D = 0x9aa4b8;
const GOO = 0x7cff3a, GOO_L = 0xc8ff7a;

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}

/** Saw-tooth height (sharp zig-zag teeth) for index i. */
const saw = (i, max = 3) => {
  const per = max * 2 - 2 || 1;
  const k = ((i % per) + per) % per;
  return max - (k <= max - 1 ? k : per - k);
};

/**
 * Bulging cartoon eyeball on a front-facing surface, with a pupil looking
 * forward/inward and an angry slanted brow. side: -1 = model's left (x < -0.5).
 * The dome protrudes so the eye still reads in profile (battle camera).
 * o: white, glow, pupil, pw/ph (pupil size), inward/down (pupil offset),
 *    browCol, browT (thickness), browHi/browLo (brow height at outer/inner end
 *    as a fraction of ry), brow:false, lidCol (colour the cut instead of carving).
 */
function eyeBall(g, cx, cy, cz, r, side, o = {}) {
  const [rx, ry, rz] = r;
  const white = o.white ?? WHITE;
  const inEye = (x, y) => Math.abs(x - cx) <= rx + 1 && Math.abs(y - cy) <= ry + 1;
  blob(g, cx, cy, cz, rx, ry, rz, white, { p: 2.2, clip: (x, y, z) => z < cz - 1, glow: !!o.glow });
  const outer = cx + side * (rx + 0.5), inner = cx - side * (rx + 0.5);
  const yo = cy + ry * (o.browHi ?? 0.95), yi = cy + ry * (o.browLo ?? 0.15);
  const yLine = (x) => yo + ((x - outer) / (inner - outer)) * (yi - yo);
  if (o.brow !== false) {
    // angry eyelid cut
    g.carve((x, y, z, c) => c === white && inEye(x, y) && z >= cz - 1 && y > yLine(x) - 0.5);
  }
  // pupil (2 deep so it wraps the curve) + glint, pushed towards the nose
  const pw = o.pw ?? 3, ph = o.ph ?? 3;
  const px = Math.round(cx - side * (o.inward ?? 1) - pw / 2 + 0.5), py = Math.round(cy - (o.down ?? 0.8) + ph / 2 - 0.5);
  const art = [];
  for (let v = 0; v < ph; v++) art.push('P'.repeat(pw));
  const gx = side < 0 ? 0 : pw - 1;
  if (o.glint !== false) art[0] = art[0].slice(0, gx) + 'G' + art[0].slice(gx + 1);
  stamp(g, art, { P: { c: o.pupil ?? INK, glow: !!o.pupilGlow }, G: { c: WHITE, glow: true } }, { axis: 'z', x: px, y: py, depth: 2 });
  // brow: a thick slanted slab that follows the dome's curve and overhangs it
  if (o.brow !== false) {
    const bc = o.browCol ?? INK, bt = o.browT ?? 2;
    const x0 = Math.floor(Math.min(outer, inner)) - (side < 0 ? 1 : 0), x1 = Math.ceil(Math.max(outer, inner)) + (side > 0 ? 1 : 0);
    for (let x = x0; x <= x1; x++) {
      const yb = Math.round(yLine(Math.max(Math.min(x, Math.max(outer, inner)), Math.min(outer, inner))));
      const t = (x - cx) / (rx + 1.2);
      const zf = Math.round(cz + rz * Math.sqrt(Math.max(0, 1 - t * t)) + 0.6);
      for (let y = yb; y < yb + bt; y++) for (let z = cz - 1; z <= zf; z++) g.set(x, y, z, bc);
    }
  }
  return g;
}

/** Vertical goo drip painted down a surface along axis ('z' front, 'x' / '-x' sides). */
function drip(g, axis, u, y, len, col, o = {}) {
  const art = [];
  for (let i = 0; i < len; i++) art.push(i === len - 1 ? 'b' : 'd');
  const pal = { d: { c: col, glow: !!o.glow }, b: { c: col, glow: !!o.glow, raise: 1 } };
  if (axis === 'z') stamp(g, art, pal, { axis: 'z', x: u, y });
  else stamp(g, art, pal, { axis, y, z: u });
  return g;
}

// ===========================================================================
// Toilets

/**
 * Toilet sculpt (Flushinator design language): neon toilet whose tank is the
 * head (angry bulging eyes), the bowl is the mouth (ring of sharp teeth inside
 * the rim) and the lid flips open to spit. S = scheme.
 */
function toiletMold(S) {
  const bowlCZ = 4.8;
  // bowl profile per y: [rx, rz]
  const prof = { 4: [3.8, 4.0], 5: [4.7, 5.0], 6: [5.6, 6.0], 7: [6.4, 6.8], 8: [7.0, 7.4], 9: [7.4, 7.9], 10: [7.7, 8.2], 11: [7.8, 8.3], 12: [7.5, 8.0] };
  const RIM = 12;
  const inBowl = (x, z, y, shrink = 0) => {
    const p = prof[y];
    if (!p) return false;
    const dz = (z - bowlCZ) / (p[1] - shrink + 0.35);
    const rx = (p[0] - shrink) * (1 - 0.14 * Math.max(0, dz)) + 0.35; // egg: narrower at the front
    const dx = (x + 0.5) / rx;
    return Math.abs(dx) ** 2.3 + Math.abs(dz) ** 2.3 <= 1;
  };

  // ------------------------------------------------------------ body (bowl + pedestal + tank)
  const body = G();
  for (let y = 4; y <= RIM; y++) for (let x = -10; x <= 9; x++) for (let z = -7; z <= 14; z++) if (inBowl(x, z, y)) body.set(x, y, z, S.main);
  // pedestal + hips
  blob(body, -0.5, 5, 3, 4.8, 2.4, 4.6, S.main, { p: 2.4 });
  blob(body, -0.5, 8, -4.5, 6, 4.5, 4, S.main, { p: 2.4 });
  // hollow the bowl into a throat (dark inside so the teeth pop)
  body.carve((x, y, z) => y >= 8 && inBowl(x, z, y, 2) && z > -4);
  body.forEach((x, y, z) => {
    if (y < 8 || y > RIM || z <= -4) return;
    if (inBowl(x, z, y, 3.2)) return;
    if (inBowl(x, z, y, 1.2)) body.set(x, y, z, S.throat);
  });
  // the clog: lumpy sludge
  const sl = S.sludge;
  for (let x = -9; x <= 8; x++) for (let z = -5; z <= 12; z++) {
    if (!inBowl(x, z, 9, 2)) continue;
    const r = Math.hypot((x + 0.5) / 5, (z - 4) / 6);
    const hgt = 9 + (r < 0.6 ? 1 : 0) + (n3(x, 0, z, 5) < 0.16 && r < 0.9 ? 1 : 0);
    for (let y = 8; y <= hgt; y++) body.set(x, y, z, n3(x, y, z, 6) < 0.3 ? sl[1] : n3(x, y, z, 7) < 0.3 ? sl[2] : sl[0]);
  }
  for (const [x, z, gl] of [[-3, 3, true], [2, 6, false], [-1, 8, true], [3, 1, false]]) body.set(x, 11, z, sl[3], gl);
  // seat ring (lighter) on the rim + magenta fangs ringing the inside
  for (let x = -10; x <= 9; x++) for (let z = -6; z <= 14; z++) {
    if (!inBowl(x, z, RIM) || inBowl(x, z, RIM, 2.2) || z < -2) continue;
    body.set(x, RIM + 1, z, S.seat);
  }
  const teethAt = [];
  body.forEach((x, y, z) => {
    if (y !== RIM + 1) return;
    if (inBowl(x, z, RIM, 2.2) || z < -1) return;
    const ix = x + Math.sign(-0.5 - x), iz = z + Math.sign(bowlCZ - z);
    if (inBowl(ix, z, RIM, 2.2) || inBowl(x, iz, RIM, 2.2)) teethAt.push([x, z]);
  });
  for (const [x, z] of teethAt) {
    const a = Math.atan2(z - bowlCZ, x + 0.5);
    const ph = ((a / (Math.PI * 2)) * 16 % 1 + 1) % 1;
    const hgt = Math.round(3.4 * (1 - Math.abs(ph * 2 - 1)) - 0.3);
    for (let i = 1; i <= hgt; i++) body.set(x, RIM + 1 + i, z, i === hgt && hgt >= 2 ? S.toothTip : S.tooth);
  }
  // hinge block at the back of the seat
  rbox(body, -7, RIM, -4, 6, RIM + 2, 2, 1.5, S.seat);
  rbox(body, -4, RIM + 1, 1, 3, RIM + 3, 3, 1, S.dark);

  // tank = the head
  const TZ0 = -12, TZ1 = -3, TY0 = 11, TY1 = 30;
  rbox(body, -10, TY0, TZ0, 9, TY1, TZ1, 3, S.main);
  // tank lid (lighter, overhanging) + chunky chrome flush button
  rbox(body, -11, TY1, TZ0 - 1, 10, TY1 + 2, TZ1 + 1, 1.5, S.seat);
  rbox(body, -3, TY1 + 3, -9, 2, TY1 + 3, -6, 1, CHROME);
  // flush handle on the left front corner (reads in profile)
  capsule(body, [-10, 27, -3.5], [-13, 27, -1.5], 0.9, 0.7, CHROME);
  blob(body, -10.5, 27, -4, 1.4, 1.4, 1.2, CHROME_D);
  // magenta lightning-bolt decals on both sides of the tank
  const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 22, z: -10 });
  stamp(body, BOLT.map((r) => [...r].reverse().join('')), { M: MAG }, { axis: 'x', y: 22, z: -6 });
  // bulging angry eyes on the tank front
  const EY = 23;
  eyeBall(body, -5, EY, TZ1, [3.6, 4.2, 3.4], -1, { browCol: S.brow });
  eyeBall(body, 4, EY, TZ1, [3.6, 4.2, 3.4], 1, { browCol: S.brow });

  // goo leaking from under the tank lid (sides) and over the rim
  const gl = (c) => c === GOO;
  for (const [z, len, col] of [[-5, 6, S.goo[1]], [-9, 4, S.goo[0]]]) { drip(body, 'x', z, TY1 - 1, len, col, { glow: gl(col) }); drip(body, '-x', z - 1, TY1 - 1, len - 1, col, { glow: gl(col) }); }
  for (const [x, len, col] of [[-5, 4, S.goo[0]], [2, 6, S.goo[1]]]) drip(body, 'z', x, RIM, len, col, { glow: gl(col) });
  for (const [z, len, col] of [[6, 5, S.goo[0]], [1, 3, S.goo[1]]]) { drip(body, 'x', z, RIM, len, col, { glow: gl(col) }); drip(body, '-x', z + 2, RIM, len, col, { glow: gl(col) }); }
  gradY(body, 3, TY1, -0.16, 0.06, (x, y, z, c) => c === S.main || c === S.seat);

  // ------------------------------------------------------------ lid (hinged at the back of the seat)
  const LJ = [-0.5, RIM + 2, 3];
  const lid = G();
  for (let x = -10; x <= 9; x++) for (let z = 3; z <= 14; z++) {
    if (!inBowl(x, z, RIM, 0.2)) continue;
    lid.set(x, RIM + 2, z, S.lidUnder);
    lid.set(x, RIM + 3, z, S.main);
    if (inBowl(x, z, RIM, 1.4)) lid.set(x, RIM + 4, z, S.seat);
  }
  stamp(lid, ['.MM...', '..MMM.', 'MMMMM.', '.MMM..', '..MM..', '...M..'], { M: MAG }, { axis: 'y', x: -3, z: 5 });
  // upper fangs hanging from the front edge of the lid
  lid.forEach((x, y, z) => {
    if (y !== RIM + 2 || z < 6) return;
    if (lid.has(x, y, z + 1)) return; // front edge only
    const hgt = [1, 3, 1, 0][((x + 40) % 4)];
    for (let i = 1; i <= hgt; i++) lid.set(x, y - i, z, i === hgt && hgt >= 2 ? S.toothTip : S.tooth);
  });

  // ------------------------------------------------------------ stubby legs
  const leg = () => {
    const g = G();
    const cx = -4.5, cz = 2.5;
    capsule(g, [cx, 5, cz], [cx, 2.5, cz + 0.3], 2.3, 2.1, S.main);
    blob(g, cx, 1.4, cz + 1.2, 2.7, 1.7, 3.4, S.dark, { p: 2.4, clip: (x, y) => y < 0 });
    return g;
  };
  const legL = leg(), legR = flipX(legL);

  return {
    grids: { body, lid, legL, legR },
    joints: { lid: LJ, legL: [-4.5, 5, 2.5], legR: [3.5, 5, 2.5] },
  };
}

function packToilet(m, extra = {}) {
  const { grids: g, joints: j } = m;
  return {
    gait: extra.gait ?? 'hop',
    voxel: 0.05,
    parts: [
      jp('legL', g.legL, j.legL), jp('legR', g.legR, j.legR),
      jp('body', g.body, [-0.5, 0, 0]),
      jp('lid', g.lid, j.lid, [-0.5, 0, 0], { parent: 'body', rot: [extra.lidRot ?? -0.34, 0, 0] }),
      ...(extra.parts ?? []),
    ],
    muzzle: extra.muzzle ?? [-0.5, 15, 5],
    finish: extra.finish ?? 'gloss',
    jitter: 0.02,
  };
}

const TOILET_SCHEMES = {
  // Flushinator-style neon blue toilet, magenta teeth, brown-green clog
  cloggedToilet: {
    main: 0x2fb4ff, dark: 0x1a78d8, seat: 0x8fe0ff, lidUnder: 0x63c8ff, brow: 0x0d3a9a, throat: 0x2a1450,
    tooth: MAG, toothTip: MAG_L,
    sludge: [0x6b5a1e, 0x8a9a26, 0x4e3c14, GOO_L], goo: [GOO, 0xff3fb0],
  },
  ketchupClog: {
    main: 0x2fb4ff, dark: 0x1a78d8, seat: 0x8fe0ff, lidUnder: 0x63c8ff, brow: 0x0d3a9a, throat: 0x2a1450,
    tooth: MAG, toothTip: MAG_L,
    sludge: [0xd8262f, 0xff4a3a, 0xa8141e, 0xffd23f], goo: [0xe8202a, 0xffd23f],
  },
};

// ===========================================================================

export const HOME_HORROR_MODELS = {
  cloggedToilet(o = {}) {
    const S = TOILET_SCHEMES[o.skin === 'ketchupClog' ? 'ketchupClog' : 'cloggedToilet'];
    const m = toiletMold(S);
    if (o.skin === 'ketchupClog') {
      // a ketchup-bottle cap stuck on the tank like a party hat
      const b = m.grids.body;
      cyl(b, 'y', -0.5, -7.5, 32, 34, 3.2, 2.6, 0xe8202a);
      cyl(b, 'y', -0.5, -7.5, 35, 36, 1.6, 1.2, WHITE);
    }
    return packToilet(m);
  },
};
