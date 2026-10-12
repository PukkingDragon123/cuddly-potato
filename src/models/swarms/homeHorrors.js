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
      for (let y = yb; y < yb + bt; y++) for (let z = cz - 1; z <= zf; z++) if (!o.browClip || !o.browClip(x, y, z)) g.set(x, y, z, bc);
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

/** Frontmost voxel z at (x, y) inside [zmin, zmax]. */
function fz(g, x, y, zmin = -60, zmax = 60) {
  for (let z = zmax; z >= zmin; z--) if (g.has(x, y, z)) return z;
  return null;
}

/**
 * Carve a roaring open mouth into the front (+z) surface. shape(x, y) -> true
 * inside the opening (searched over [x0..x1] x [y0..y1]). The cavity is `depth`
 * deep with a dark back wall, a tongue, and saw-tooth teeth hanging from the
 * upper lip / rising from the lower lip (recessed 1 so the lips overhang).
 * o: depth, back, tongue, tongueW, tooth, toothTip, top / bot (max tooth length,
 *    0 = none), period (saw max), lipCol (paint a lip ring), zmin/zmax.
 */
function openMouth(g, x0, x1, y0, y1, shape, o = {}) {
  const depth = o.depth ?? 3, back = o.back ?? MOUTH, tooth = o.tooth ?? WHITE;
  const cells = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    if (!shape(x, y)) continue;
    const z = fz(g, x, y, o.zmin, o.zmax);
    if (z !== null) cells.push([x, y, z]);
  }
  const at = new Map(cells.map(([x, y, z]) => [`${x},${y}`, z]));
  const cx = (x0 + x1) / 2;
  // lip ring (painted on the surface around the opening)
  if (o.lipCol !== undefined) {
    for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (at.has(k)) continue;
      const z = fz(g, x + dx, y + dy, o.zmin, o.zmax);
      if (z !== null) g.set(x + dx, y + dy, z, o.lipCol);
    }
  }
  const colTop = {}, colBot = {};
  for (const [x, y, z] of cells) {
    for (let i = 0; i < depth; i++) g.del(x, y, z - i);
    const tongue = o.tongue !== false && y <= y0 + (o.tongueRows ?? 2) && Math.abs(x - cx) <= (o.tongueW ?? (x1 - x0) * 0.3);
    g.set(x, y, z - depth, tongue ? (o.tongue ?? TONGUE) : back);
    if (tongue) g.set(x, y, z - depth + 1, o.tongue ?? TONGUE);
    if (colTop[x] === undefined || y > colTop[x][0]) colTop[x] = [y, z];
    if (colBot[x] === undefined || y < colBot[x][0]) colBot[x] = [y, z];
  }
  const per = o.period ?? 3;
  const xs = Object.keys(colTop).map(Number).sort((a, b) => a - b);
  xs.forEach((x, i) => {
    const k = i + (o.phase ?? 0);
    const [ty, tz] = colTop[x], [by, bz] = colBot[x];
    const span = ty - by + 1;
    const tl = o.top === 0 ? 0 : Math.min(o.top ?? per, saw(k, per), Math.ceil(span * 0.45));
    for (let j = 0; j < tl; j++) for (let d = 1; d <= 2; d++) g.set(x, ty - j, tz - d, j === tl - 1 && tl > 1 ? (o.toothTip ?? tooth) : tooth);
    const bl = o.bot === 0 ? 0 : Math.min(o.bot ?? per - 1, saw(k + per - 1, per) - 1, Math.floor(span * 0.4));
    for (let j = 0; j < bl; j++) for (let d = 1; d <= 2; d++) g.set(x, by + j, bz - d, j === bl - 1 && bl > 1 ? (o.toothTip ?? tooth) : tooth);
  });
  return g;
}

/** Simple lightning-bolt art (5x7) and its mirror. */
const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
const BOLT_R = BOLT.map((r) => [...r].reverse().join(''));

/** Stubby leg with a big rounded boot (left side; flipX for the right). */
function bootLeg(cx, cz, hip, col, boot, o = {}) {
  const g = G();
  capsule(g, [cx, hip, cz], [cx, 2.5, cz + 0.3], o.r ?? 2.2, (o.r ?? 2.2) - 0.2, col);
  blob(g, cx, 1.4, cz + 1.1, o.bw ?? 2.7, 1.7, o.bl ?? 3.4, boot, { p: 2.4, clip: (x, y) => y < 0 });
  if (o.sole !== undefined) g.paint((x, y, z, c) => (y === 0 && c === boot ? o.sole : undefined));
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
// Trashed Can: a dented galvanised garbage can with a grudge (tank)

function trashCanMold(o = {}) {
  const S = {
    main: 0x7f98c6, ribC: 0x52669a, light: 0xc8daf4, dark: 0x343f6a, rim: 0xa4bae0, brow: 0x1a1f3c,
    fist: 0xa4bae0, junk: [0x6b5a2a, 0x8a9a3a, 0x4a3a1e],
  };
  const B = o.base ?? 4; // bottom of the can
  const TOP = B + 21;
  const R0 = 8.3, R1 = 9.6;
  const rAt = (y) => R0 + ((y - B) / (TOP - B)) * (R1 - R0);
  const body = G();
  // corrugated galvanised body: vertical flutes alternate shade
  const flute = (x, y, z) => {
    const a = Math.atan2(z, x + 0.5);
    const k = Math.floor(((a / (Math.PI * 2)) * 30 + 30)) % 2;
    return n3(x, y, z, 3) < 0.05 ? S.light : k ? S.main : shade(S.main, -0.08);
  };
  cyl(body, 'y', -0.5, 0, B, TOP, R0, R1, flute);
  // raised ribs + base and top rims
  const ring = (y0, y1, add, col) => { for (let y = y0; y <= y1; y++) cyl(body, 'y', -0.5, 0, y, y, rAt(y) + add, rAt(y) + add, col); };
  ring(B, B + 1, 0.6, S.dark);
  ring(B + 4, B + 4, 0.7, S.ribC);
  ring(B + 13, B + 13, 0.7, S.ribC);
  ring(TOP - 1, TOP, 0.9, S.rim);
  // a couple of dents (pushed-in craters with a darker rim)
  for (const [x, y, z, r] of [[7.5, B + 16, 4.5, 2.4], [-9.6, B + 8, -3, 2.2], [3, B + 7, -9.4, 2]]) {
    body.carve((vx, vy, vz) => Math.hypot(vx - x, vy - y, vz - z) < r - 0.4);
    body.paint((vx, vy, vz) => (Math.hypot(vx - x, vy - y, vz - z) < r + 0.7 ? shade(S.main, -0.2) : undefined));
  }
  // junk heaped inside the top (seen when the lid pops)
  for (let x = -10; x <= 9; x++) for (let z = -10; z <= 10; z++) {
    const d = Math.hypot(x + 0.5, z);
    if (d > rAt(TOP) - 1.2) continue;
    const hgt = TOP + (d < 5 ? 1 : 0) + (n3(x, 0, z, 9) < 0.25 ? 1 : 0);
    for (let y = TOP; y <= hgt; y++) body.set(x, y, z, S.junk[Math.floor(n3(x, y, z, 4) * 3)]);
  }
  // fish skeleton poking out of the junk at the front
  for (let i = 0; i < 6; i++) body.set(-3 + i, TOP + 2, 6, 0xf4f0e0);
  for (const i of [0, 2, 4]) { body.set(-2 + i, TOP + 3, 6, 0xf4f0e0); body.set(-2 + i, TOP + 1, 6, 0xf4f0e0); }
  blob(body, -5, TOP + 2, 6, 1.2, 1.2, 1, 0xf4f0e0);
  body.set(-6, TOP + 2, 7, INK);
  for (const [x, y] of [[3, TOP + 3], [3, TOP + 1], [4, TOP + 4], [4, TOP]]) body.set(x, y, 6, 0xf4f0e0);
  // soda can + glowing stink
  cyl(body, 'y', 4, -3, TOP + 1, TOP + 4, 1.3, 1.3, MAG);
  body.set(4, TOP + 5, -3, CHROME);
  for (const [x, z] of [[-4, -3], [0, 2], [-6, 1]]) body.set(x, TOP + 1, z, GOO, true);

  // ---- face: huge torn mouth + bulging angry eyes
  const MY0 = B + 5, MY1 = B + 11;
  openMouth(body, -8, 7, MY0, MY1, (x, y) => {
    const dx = (x + 0.5) / 7.6, dy = (y - (MY0 + MY1) / 2) / 3.9;
    const jag = (Math.abs(x + 0.5) * 1.7 + 40) % 3 < 1 && y === MY1 ? 1 : 0;
    return dx * dx + dy * dy <= 1 && !jag;
  }, { depth: 4, top: 3, bot: 2, period: 3, lipCol: S.dark, tongueW: 3 });
  const EY = B + 16.5;
  const eR = [3.4, 3.8, 3];
  eyeBall(body, -4.6, EY, Math.round(Math.sqrt(R1 * R1 - 4.1 * 4.1)) - 1, eR, -1, { browCol: S.brow, browT: 2, inward: 0.8 });
  eyeBall(body, 3.6, EY, Math.round(Math.sqrt(R1 * R1 - 4.1 * 4.1)) - 1, eR, 1, { browCol: S.brow, browT: 2, inward: 0.8 });
  // magenta lightning-bolt sticker + peeling label on the flanks
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: B + 11, z: -2 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: B + 11, z: 2 });
  stamp(body, ['YYYY', 'YKKY', 'YYYY'], { Y: 0xffd23f, K: INK }, { axis: 'x', y: B + 18, z: -4 });
  // goo running down from the rim
  for (const [z, len, col, gl] of [[3, 7, GOO, true], [-6, 5, 0x9ad83a, false]]) { drip(body, 'x', z, TOP - 1, len, col, { glow: gl }); drip(body, '-x', -z, TOP - 1, len - 2, col, { glow: false }); }
  drip(body, 'z', 6, TOP - 1, 3, 0x9ad83a);
  gradY(body, B, TOP, -0.14, 0.06, (x, y, z, c) => c === S.main || c === shade(S.main, -0.08) || c === S.ribC);

  // ---- lid (hinged at the back rim, pops open on attacks)
  const LJ = [-0.5, TOP + 1, -9];
  const lid = G();
  blob(lid, -0.5, TOP + 1.5, 0, 10.6, 2.4, 10.6, S.rim, { p: 2.2, clip: (x, y) => y < TOP + 1 });
  cyl(lid, 'y', -0.5, 0, TOP + 1, TOP + 1, 10.6, 10.6, S.dark);
  // concentric rib + handle
  lid.paint((x, y, z, c) => (Math.abs(Math.hypot(x + 0.5, z) - 6.5) < 0.6 ? S.main : undefined));
  for (let x = -4; x <= 3; x++) for (let z = -1; z <= 1; z++) lid.set(x, TOP + 6, z, MAG);
  for (const x of [-4, 3]) for (let y = TOP + 3; y <= TOP + 5; y++) for (let z = -1; z <= 1; z++) lid.set(x, y, z, MAG);
  // banana peel draped over the front edge
  for (const [x, y, z] of [[1, TOP + 3, 9], [2, TOP + 3, 10], [1, TOP + 2, 11], [0, TOP + 1, 11], [2, TOP + 1, 11], [3, TOP + 2, 11], [3, TOP, 11], [0, TOP - 1, 11], [-1, TOP, 11]]) lid.set(x, y, z, 0xffd23f);
  lid.set(0, TOP - 1, 11, 0x8a6a1a);
  // stink fumes curling off the top
  for (const [x, y, z] of [[-6, TOP + 5, -2], [-7, TOP + 6, -2], [-6, TOP + 7, -2], [-7, TOP + 8, -2]]) lid.set(x, y, z, GOO_L, true);

  // ---- arms with dented metal mitts
  const arm = () => {
    const g = G();
    const sx = -10.6, sy = B + 13;
    blob(g, sx + 0.3, sy, 0, 2.1, 2.1, 2.1, S.dark);
    capsule(g, [sx, sy, 0], [sx - 1.4, sy - 6, 1], 1.7, 1.6, S.ribC);
    blob(g, sx - 1.6, sy - 8, 1.4, 2.7, 2.6, 2.7, S.fist, { p: 2.3 });
    // knuckles + thumb
    for (const dz of [-1, 1, 3]) g.set(Math.round(sx - 1.6), sy - 9, Math.round(1.4 + dz), S.light);
    blob(g, sx + 0.4, sy - 7.5, 3.4, 1, 1, 1.2, S.fist);
    return g;
  };
  const armL = arm(), armR = flipX(armL);
  const shoulder = [-10.6, B + 13, 0];

  return {
    S, B, TOP,
    grids: { body, lid, armL, armR },
    joints: { lid: LJ, armL: shoulder, armR: [-1 - shoulder[0], shoulder[1], shoulder[2]] },
  };
}

function trashedCanDef(o = {}) {
  const cart = o.skin === 'cartCan';
  const m = trashCanMold({ base: cart ? 7 : 4 });
  const { grids: g, joints: j } = m;
  const root = [-0.5, 0, 0];
  const parts = [
    jp('body', g.body, root),
    jp('lid', g.lid, j.lid, root, { parent: 'body', rot: [-0.24, 0, 0] }),
    jp('armL', g.armL, j.armL, root, { parent: 'body' }),
    jp('armR', g.armR, j.armR, root, { parent: 'body' }),
  ];
  if (!cart) {
    const legL = bootLeg(-4.5, 1, 5, m.S.ribC, m.S.dark);
    parts.unshift(jp('legL', legL, [-4.5, 5, 1]), jp('legR', flipX(legL), [3.5, 5, 1]));
  } else {
    // shopping-cart chassis: red wire frame, kick plate and handle, 4 casters
    const RED = 0xe8202a, RED_D = 0xa8141e, GRIP = MAG;
    const b = g.body;
    for (let x = -10; x <= 9; x++) for (let z = -10; z <= 10; z++) {
      const edge = x === -10 || x === 9 || z === -10 || z === 10;
      if (edge || (x + 40) % 4 === 0 || (z + 40) % 4 === 0) b.set(x, 5, z, edge ? RED : RED_D);
      if (edge && ((x + z + 40) % 3 === 0 || x === -10 || x === 9)) b.set(x, 6, z, RED);
    }
    for (const [x, z] of [[-9, -9], [8, -9], [-9, 9], [8, 9]]) for (let y = 3; y <= 4; y++) b.set(x, y, z, CHROME_D);
    // handle bar at the back with a magenta grip
    for (const x of [-9, 8]) chain(b, [[x, 6, -10], [x, 12, -13], [x, 15, -14]], 0.6, RED);
    capsule(b, [-9, 15.5, -14], [8, 15.5, -14], 1, 1, GRIP);
    // MrBeast-style kick plate on the front
    rbox(b, -6, 3, 10, 5, 6, 11, 1, RED);
    stamp(b, BOLT.map((r) => r.replace(/M/g, 'W')), { W: WHITE }, { axis: 'z', x: -3, y: 6, zmin: 9, zmax: 12 });
    const wheel = (x, z) => {
      const w = G();
      cyl(w, 'x', 2, z, x - 1, x + 1, 2.1, 2.1, INK);
      cyl(w, 'x', 2, z, x - 1, x + 1, 0.9, 0.9, RED);
      w.set(x, 4, z, CHROME);
      return w;
    };
    for (const [n, x, z] of [['wheelFL', -9, 8], ['wheelFR', 8, 8], ['wheelBL', -9, -8], ['wheelBR', 8, -8]]) parts.unshift(jp(n, wheel(x, z), [x, 2, z]));
  }
  return {
    gait: cart ? 'slide' : 'hop',
    voxel: 0.05,
    parts,
    muzzle: [-0.5, m.B + 8, 10],
    finish: 'gloss',
    jitter: 0.02,
  };
}

/** Paint a dark ring around where an eyeball will sit (reads on pale surfaces). */
function eyeRing(g, cx, cy, rx, ry, col, o = {}) {
  for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    const d = ((x - cx) / (rx + 1)) ** 2 + ((y - cy) / (ry + 1)) ** 2;
    if (d > 1) continue;
    const z = fz(g, x, y, o.zmin, o.zmax);
    if (z !== null) g.set(x, y, z, col);
  }
  return g;
}

// ===========================================================================
// Toilet Roll Ripper: a paper-shark toilet roll that chomps (swarm of 3)

function toiletRollDef() {
  const PAPER = 0xfbfbf7, QUILT = 0xe4e8f2, RINGC = 0xd6dcea, TUBE = 0xc98f52, TUBE_D = 0x7a4a22;
  const GUM = 0xff3f8a, BOOT = 0x2fb4ff, BOOT_D = 0x1a78d8;
  const Y0 = 3, Y1 = 21, R = 7.4;
  const body = G();
  // quilted paper: diamond emboss lines
  const quilt = (x, y, z) => {
    const a = Math.atan2(z, x + 0.5) * 7.4;
    return ((Math.round(a + y) % 5) + 5) % 5 === 0 || ((Math.round(a - y) % 5) + 5) % 5 === 0 ? QUILT : PAPER;
  };
  cyl(body, 'y', -0.5, 0, Y0, Y1, R, R, quilt);
  // rounded squishy edges top and bottom
  body.carve((x, y, z) => (y === Y1 || y === Y0) && Math.hypot(x + 0.5, z) > R - 0.4);
  // spiral layers on the top + cardboard tube
  for (let x = -9; x <= 8; x++) for (let z = -9; z <= 9; z++) {
    const d = Math.hypot(x + 0.5, z);
    if (!body.has(x, Y1, z)) continue;
    if (d < 2.4) { for (let y = Y1 - 3; y <= Y1; y++) body.del(x, y, z); body.set(x, Y1 - 4, z, TUBE_D); continue; }
    if (d < 3.5) { body.set(x, Y1, z, TUBE); body.set(x, Y1 + 1, z, d < 3 ? TUBE : TUBE_D); continue; }
    if (Math.round(d) % 2 === 0) body.set(x, Y1, z, RINGC);
  }
  // ---- shark mouth: wide grin with magenta gums and rows of fangs
  const MY0 = 5, MY1 = 11, MID = 8;
  const shape = (x, y) => {
    const t = (y - MID) / 3.8;
    const w = 6.6 * Math.sqrt(Math.max(0, 1 - t * t * t * t));
    return Math.abs(x + 0.5) <= w && y >= MY0 && y <= MY1;
  };
  openMouth(body, -8, 7, MY0, MY1, shape, { depth: 5, top: 3, bot: 3, period: 3, lipCol: GUM, back: 0x5a0a2a, tongueW: 2.6, tongueRows: 1 });
  // a second (inner) row of fangs
  for (let x = -5; x <= 4; x++) {
    if ((x + 40) % 3 !== 0) continue;
    const z = fz(body, x, MY1 + 1);
    if (z === null) continue;
    body.set(x, MY1, z - 3, WHITE); body.set(x, MY1 - 1, z - 3, WHITE);
  }
  // ---- angry shark eyes (dark ring so they pop on white paper)
  // angry eyes stamped onto the curved paper (outlined so they pop on white)
  const EYE_L = [
    'KK......',
    '.KKK....',
    '..KKKK..',
    '.OO..KKK',
    'OWWOOKKK',
    'OWWWWOK.',
    'OWWGPPO.',
    'OWWPPPO.',
    '.OOOOO..',
  ];
  stamp(body, EYE_L, {
    K: { c: INK, raise: 1 }, O: { c: 0x2f3a6a, raise: 1 }, W: { c: WHITE, raise: 1 }, P: { c: INK, raise: 1 }, G: { c: WHITE, glow: true, raise: 1 },
  }, { axis: 'z', x: -8, y: 20, mirror: true });
  // magenta bolts printed on the flanks
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 15, z: -1 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 15, z: 3 });
  // paper shark fin rising off the back of the roll (perforated)
  for (let y = Y1; y <= Y1 + 6; y++) {
    const t = (y - Y1) / 6;
    const zf = Math.round(-1.5 - t * 7.5), zb = Math.round(-7 - t * 2.5 + t * t * 0.8);
    const xs = t < 0.45 ? [-2, -1, 0, 1] : [-1, 0];
    for (let z = zb; z <= zf; z++) for (const x of xs) body.set(x, y, z, (y - Y1) % 3 === 2 && (z & 1) ? QUILT : PAPER);
  }
  // ---- split off the lower jaw (front-bottom of the roll)
  const JZ = 0;
  const jaw = G();
  body.forEach((x, y, z, c, gl) => { if (z >= JZ && y <= MID - 0.5 && y >= Y0) jaw.set(x, y, z, c, gl); });
  jaw.forEach((x, y, z) => body.del(x, y, z));
  // dark throat on the cut faces
  body.forEach((x, y, z) => { if (y === Math.floor(MID - 0.5) + 1 && z >= JZ && Math.hypot(x + 0.5, z) < R - 1.2) body.set(x, y, z, 0x5a0a2a); });
  body.forEach((x, y, z) => { if (z === JZ - 1 && y < MID && Math.hypot(x + 0.5, z) < R - 1.2) body.set(x, y, z, 0x5a0a2a); });
  jaw.forEach((x, y, z, c) => { if (y === Math.floor(MID - 0.5) && Math.hypot(x + 0.5, z) < R - 1.2 && c === PAPER) jaw.set(x, y, z, TONGUE); });

  // ---- unrolling paper tail with a shark-tail fork
  const tail = G();
  const path = [[12, -7], [9.5, -9.2], [7, -10.6], [5.6, -13], [6.4, -15.6], [8.2, -17.6]];
  for (let x = -3; x <= 2; x++) chain(tail, path.map(([y, z]) => [x, y, z]), 0.55, (vx, vy, vz) => (Math.round(vz) % 4 === 0 ? QUILT : PAPER));
  for (let i = 0; i <= 5; i++) for (const x of [-1, 0]) {
    tail.set(x, 9 + i, -18 - (i >> 1), PAPER); tail.set(x, 8 - (i >> 1), -18 - i, PAPER);
    tail.set(x, 9 + i, -17 - (i >> 1), PAPER);
  }
  // ---- little cyan boots
  const legL = bootLeg(-3.8, -1.5, 4, PAPER, BOOT, { r: 1.7, bw: 2.3, bl: 2.9, sole: BOOT_D });

  const root = [-0.5, 0, 0];
  return {
    gait: 'hop',
    voxel: 0.05,
    parts: [
      jp('legL', legL, [-3.8, 4, -1.5]), jp('legR', flipX(legL), [2.8, 4, -1.5]),
      jp('body', body, root),
      jp('jaw', jaw, [-0.5, MID, JZ], root, { parent: 'body' }),
      jp('tail', tail, [-0.5, 12, -7], root, { parent: 'body' }),
    ],
    muzzle: [-0.5, MID, 9],
    finish: 'gloss',
    jitter: 0.02,
  };
}

/**
 * Spherical cartoon eyeball with an angry lid (lid colour covers the top above
 * a slanted line, lower towards the nose) and a pupil stamped on its front.
 * side: -1 = model's left. o: lid colour, slant, pupil, pw/ph, look [dx, dy].
 */
function orbEye(g, cx, cy, cz, r, side, o = {}) {
  const lidC = o.lid ?? INK, white = o.white ?? WHITE;
  blob(g, cx, cy, cz, r, r, r, white, { p: 2, glow: !!o.glow });
  const slant = o.slant ?? 0.45, lift = o.lift ?? 0.5;
  const lineY = (x) => cy + r * lift + (x - cx) * side * slant; // higher at the outer side
  g.paint((x, y, z, c) => (c === white && y >= lineY(x) && Math.hypot(x - cx, y - cy, z - cz) <= r + 0.8 ? lidC : undefined));
  // thick angry brow riding the lid line
  if (o.brow !== false) {
    const bz = (x, y) => cz + Math.sqrt(Math.max(0, r * r - (x - cx) ** 2 - (y - cy) ** 2)) * 0.85;
    const xo = cx + side * r * 0.95, xi = cx - side * r * 0.95;
    const yo = lineY(xo) + 0.3, yi = lineY(xi) + 0.3;
    capsule(g, [xo, yo, bz(xo, yo)], [xi, yi, bz(xi, yi) + 0.4], o.browR ?? 1, o.browR ?? 1, o.browCol ?? INK);
  }
  const pw = o.pw ?? 2, ph = o.ph ?? 3, look = o.look ?? [0, 0];
  const px = Math.round(cx - side * 0.6 + look[0] - pw / 2 + 0.5), py = Math.round(cy - 0.6 + look[1] + ph / 2 - 0.5);
  const art = [];
  for (let v = 0; v < ph; v++) art.push('P'.repeat(pw));
  const gx = side < 0 ? 0 : pw - 1;
  art[0] = art[0].slice(0, gx) + 'G' + art[0].slice(gx + 1);
  stamp(g, art, { P: o.pupil ?? INK, G: { c: WHITE, glow: true } }, { axis: 'z', x: px, y: py, depth: 2, zmin: cz, zmax: Math.ceil(cz + r + 2) });
  return g;
}

// ===========================================================================
// Mutant Mailbox: a cobalt rural mailbox on a post, door-mouth full of fangs
// and junk mail, frog-eyes on top and a third eye on a stalk.

function mailboxDef() {
  const BLUE = 0x2a5cff, BLUE_L = 0x6a96ff, BLUE_D = 0x1a3aa8, WOOD = 0x9a6234, WOOD_D = 0x6a3c1c, WOOD_L = 0xb87c44;
  const FLAG = MAG, ENV = 0xfbf8ee, ENV_D = 0xd8d2c0, BOOT = 0x3a2614;
  const B0 = 13, WALL = 18, AR = 7.4, Z0 = -10, Z1 = 9; // box bottom, wall top, arch radius, back, front
  const inBox = (x, y) => Math.abs(x + 0.5) <= AR && y >= B0 && (y <= WALL || Math.hypot(x + 0.5, y - WALL) <= AR + 0.3);

  // ---- body: the wooden post with a support plank
  const body = G();
  const grain = (x, y, z) => ((y + (x & 1) * 2) % 5 === 0 ? WOOD_D : n3(x, y, z, 2) < 0.2 ? WOOD_L : WOOD);
  rbox(body, -3, 3, -3, 2, 12, 2, 1, grain);
  rbox(body, -6, 11, -8, 5, 12, 6, 0.6, grain);
  stamp(body, BOLT, { M: MAG }, { axis: 'z', x: -3, y: 10, zmax: 4 });

  // ---- head: the box
  const HJ = [-0.5, 12, 0];
  const head = G();
  const boxCol = (x, y, z) => {
    if ((z - Z0) % 5 === 0) return BLUE_D; // ribbed seams
    return y > WALL + 3 ? BLUE_L : BLUE;
  };
  for (let x = -9; x <= 8; x++) for (let y = B0; y <= WALL + 8; y++) {
    if (!inBox(x, y)) continue;
    for (let z = Z0; z <= Z1; z++) head.set(x, y, z, boxCol(x, y, z));
  }
  // rolled front rim + back cap
  for (let x = -9; x <= 8; x++) for (let y = B0 - 1; y <= WALL + 9; y++) {
    const inner = inBox(x, y), outer = Math.abs(x + 0.5) <= AR + 1 && y >= B0 - 1 && (y <= WALL || Math.hypot(x + 0.5, y - WALL) <= AR + 1.2);
    if (outer && !inner) { head.set(x, y, Z1, BLUE_D); head.set(x, y, Z1 - 1, BLUE_D); head.set(x, y, Z0, BLUE_D); }
  }
  // hollow mouth (the box opening) with fangs all round the rim
  const MZ = 2;
  head.carve((x, y, z) => z > MZ && Math.abs(x + 0.5) <= AR - 1.5 && y >= B0 + 1.5 && (y <= WALL || Math.hypot(x + 0.5, y - WALL) <= AR - 1.5));
  for (let x = -9; x <= 8; x++) for (let y = B0; y <= WALL + 8; y++) if (head.has(x, y, MZ) && Math.abs(x + 0.5) <= AR - 1.5) head.set(x, y, MZ, MOUTH);
  // fangs pointing inwards from the rim (top arch hangs down, bottom points up)
  const rimZ = Z1 - 1;
  for (let x = -6; x <= 5; x++) {
    let top = -1;
    for (let y = WALL + 8; y >= B0; y--) if (!head.has(x, y, rimZ) && inBox(x, y)) { top = y; break; }
    if (top < 0) continue;
    const k = x + 6, hgt = saw(k, 3);
    for (let j = 0; j < hgt; j++) for (const z of [rimZ - 1, rimZ - 2]) head.set(x, top - j, z, WHITE);
    const bl = saw(k + 2, 3) - 1;
    for (let j = 0; j < bl; j++) for (const z of [rimZ - 1, rimZ - 2]) head.set(x, B0 + 2 + j, z, WHITE);
  }
  // junk-mail tongue spilling out
  rbox(head, -4, B0 + 2, MZ + 1, 3, B0 + 2, Z1 + 3, 0, TONGUE);
  const env = (x0, y, z0, w, l, stampC) => {
    for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + l; z++) head.set(x, y, z, (x === x0 || z === z0 + l - 1) ? ENV_D : ENV);
    head.set(x0 + w - 2, y, z0 + l - 2, stampC); head.set(x0 + w - 3, y, z0 + l - 2, stampC);
  };
  env(-5, B0 + 3, 5, 5, 6, MAG);
  env(0, B0 + 3, 6, 5, 7, 0x2fb4ff);
  env(-3, B0 + 4, 8, 5, 6, 0xffd23f);
  // magenta bolt + house number decal on the flanks
  stamp(head, BOLT, { M: MAG }, { axis: '-x', y: WALL + 1, z: -4 });
  stamp(head, BOLT_R, { M: MAG }, { axis: 'x', y: WALL + 1, z: -2 });
  stamp(head, ['W.WWW', 'W...W', 'W.WWW', 'W...W', 'W.WWW'], { W: WHITE }, { axis: '-x', y: WALL - 1, z: 4 });
  // frog-eyes on top of the arch (angry lids)
  const EY = WALL + AR + 0.8, EZ = 5.5;
  orbEye(head, -4.2, EY, EZ, 3.6, -1, { lid: BLUE, slant: 0.4, lift: 0.5, pw: 2, ph: 3 });
  orbEye(head, 3.2, EY, EZ, 3.6, 1, { lid: BLUE, slant: 0.4, lift: 0.5, pw: 2, ph: 3 });
  gradY(head, B0, WALL + 8, -0.1, 0.05, (x, y, z, c) => c === BLUE || c === BLUE_L);

  // ---- door = jaw, hinged at the bottom front edge
  const DJ = [-0.5, B0 - 1, Z1 + 1];
  const door = G();
  for (let x = -9; x <= 8; x++) for (let y = B0 - 1; y <= WALL + 9; y++) {
    const inD = Math.abs(x + 0.5) <= AR + 0.6 && y >= B0 - 1 && (y <= WALL || Math.hypot(x + 0.5, y - WALL) <= AR + 0.9);
    if (!inD) continue;
    const edge = !(Math.abs(x + 0.5) <= AR - 0.6 && (y <= WALL || Math.hypot(x + 0.5, y - WALL) <= AR - 0.4) && y >= B0);
    door.set(x, y, Z1 + 1, edge ? BLUE_D : BLUE);
    door.set(x, y, Z1 + 2, edge ? BLUE_D : BLUE_L);
  }
  // latch tab + inner fangs
  rbox(door, -2, WALL + 5, Z1 + 3, 1, WALL + 7, Z1 + 3, 0.5, CHROME);
  for (let x = -5; x <= 4; x++) {
    const hgt = saw(x + 5, 3);
    for (let j = 0; j < hgt; j++) door.set(x, B0 + 1 + j, Z1, WHITE);
  }
  stamp(door, ['.MMM', 'MMM.', 'MMMM', '.MM.', 'MM..'], { M: MAG }, { axis: 'z', x: -2, y: WALL + 2, zmin: Z1 + 1, zmax: Z1 + 3 });

  // ---- flag (raised) on the right flank, swings out on attacks
  const FJ = [AR + 0.5, WALL - 2, -3];
  const flag = G();
  capsule(flag, [FJ[0] + 1, FJ[1], FJ[2]], [FJ[0] + 1, FJ[1] + 10, FJ[2]], 0.6, 0.6, CHROME_D);
  rbox(flag, FJ[0] + 1, FJ[1] + 6, FJ[2] - 6, FJ[0] + 1, FJ[1] + 10, FJ[2] - 1, 0.5, FLAG);
  rbox(flag, FJ[0] + 2, FJ[1] + 7, FJ[2] - 5, FJ[0] + 2, FJ[1] + 9, FJ[2] - 2, 0.5, MAG_L);
  blob(flag, FJ[0] + 1, FJ[1], FJ[2], 1.2, 1.2, 1.2, CHROME);

  // ---- third eye on a wobbly stalk at the back (mutant!)
  const AJ = [-0.5, WALL + AR, -6];
  const stalk = G();
  chain(stalk, [[-0.5, WALL + AR - 1, -6], [-0.5, WALL + AR + 3, -7], [-0.5, WALL + AR + 6, -6]], [1.2, 0.8], BLUE_D);
  orbEye(stalk, -0.5, WALL + AR + 8, -5.5, 2.3, 1, { lid: BLUE, slant: 0, lift: 0.4, pw: 2, ph: 2, browR: 0.7 });

  // ---- legs with chunky boots
  const legL = bootLeg(-3.5, 0.5, 5, WOOD, BOOT, { r: 1.9, sole: INK });

  const root = [-0.5, 0, 0];
  return {
    gait: 'hop',
    voxel: 0.05,
    parts: [
      jp('legL', legL, [-3.5, 5, 0.5]), jp('legR', flipX(legL), [2.5, 5, 0.5]),
      jp('body', body, root),
      jp('head', head, HJ),
      jp('jaw', door, DJ, HJ, { parent: 'head', rot: [0.62, 0, 0] }),
      jp('flag', flag, FJ, HJ, { parent: 'head' }),
      jp('antenna', stalk, AJ, HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, WALL, Z1 + 3],
    finish: 'gloss',
    jitter: 0.02,
  };
}

// ===========================================================================
// Street signs come alive: a chunky sign-plate head on a bolted pole torso with
// pipe arms sprouting from the plate's flanks and stubby legs.

/** 3x5 pixel font for sign lettering. */
const FONT = {
  S: ['###', '#..', '###', '..#', '###'], T: ['###', '.#.', '.#.', '.#.', '.#.'], O: ['###', '#.#', '#.#', '#.#', '###'], P: ['###', '#.#', '###', '#..', '#..'],
};
function textArt(str, ch = 'W', mirrorText = false) {
  const rows = ['', '', '', '', ''];
  [...str].forEach((c, i) => { for (let r = 0; r < 5; r++) rows[r] += (i ? '.' : '') + FONT[c][r].replace(/#/g, ch); });
  return mirrorText ? rows.map((r) => [...r].reverse().join('')) : rows;
}

/**
 * Sign body mold. S: { pole, poleD, leg, foot, footD, glove, gloveD, glowKnuckle }.
 * Returns grids { body, legL, legR } and arm builder. Arms are attached to the
 * head plate's flanks at shoulder = [x, y, z] (left side).
 */
function signMold(S, o = {}) {
  const body = G();
  cyl(body, 'y', -0.5, -0.5, 4, 13, 2.4, 2.4, (x, y) => ((y + 40) % 4 === 0 ? S.poleD : S.pole));
  // hip bracket + bolts
  rbox(body, -4, 4, -3, 3, 6, 2, 1, S.poleD);
  for (const x of [-3, 2]) body.set(x, 5, 3, CHROME);
  if (S.hazard) body.paint((x, y, z, c) => (y >= 7 && y <= 12 && c !== S.poleD ? ((y + x + 40) % 4 < 2 ? S.hazard[0] : S.hazard[1]) : undefined));
  const legL = G();
  capsule(legL, [-3, 6, -0.5], [-3, 2.5, 0], 1.6, 1.5, S.leg);
  if (S.concrete) {
    rbox(legL, -6, 0, -3, 0, 3, 4, 1, (x, y, z) => (n3(x, y, z, 8) < 0.22 ? S.footD : S.foot));
    for (const [x, y, z] of [[-6, 3, 4], [0, 0, -3], [-6, 0, 4]]) legL.del(x, y, z);
  } else {
    blob(legL, -3, 1.5, 1.2, 2.7, 1.8, 3.4, S.foot, { p: 2.4, clip: (x, y) => y < 0 });
    legL.paint((x, y, z, c) => (y === 0 ? S.footD : undefined));
  }
  const legR = flipX(legL);
  const arm = (sh) => {
    const g = G();
    const [sx, sy, sz] = sh;
    blob(g, sx, sy, sz, 1.8, 1.8, 1.8, S.poleD);
    capsule(g, [sx - 0.8, sy, sz], [sx - 1.8, sy - 6, sz + 0.5], 1.3, 1.2, S.pole);
    // cartoon glove: puffy cuff + fist
    cyl(g, 'y', sx - 1.8, sz + 0.5, sy - 7.5, sy - 6.5, 2.1, 2.1, S.gloveD);
    blob(g, sx - 1.8, sy - 9.2, sz + 0.8, 2.5, 2.3, 2.6, S.glove, { p: 2.3 });
    blob(g, sx - 0.2, sy - 8.6, sz + 2.6, 1, 1, 1.1, S.glove);
    for (const dz of [-1, 1]) g.set(Math.round(sx - 1.8), Math.round(sy - 8.6), Math.round(sz + 0.8 + dz), S.gloveD);
    if (S.glowKnuckle) for (const dz of [-1, 0, 1, 2]) g.set(Math.round(sx - 1.8), Math.round(sy - 11.2), Math.round(sz + 1 + dz), S.glowKnuckle, true);
    return g;
  };
  return { body, legL, legR, arm };
}

function packSign(m, head, HJ, sh, extra = {}) {
  const armL = m.arm(sh), armR = flipX(armL);
  const root = [-0.5, 0, 0];
  return {
    gait: 'walk',
    voxel: 0.05,
    parts: [
      jp('legL', m.legL, [-3, 6, -0.5]), jp('legR', m.legR, [2, 6, -0.5]),
      jp('body', m.body, root),
      jp('head', head, HJ),
      jp('armL', armL, sh, HJ, { parent: 'head' }),
      jp('armR', armR, [-1 - sh[0], sh[1], sh[2]], HJ, { parent: 'head' }),
      ...(extra.parts ?? []),
    ],
    muzzle: extra.muzzle ?? [-0.5, 18, 8],
    finish: extra.finish ?? 'gloss',
    jitter: 0.02,
  };
}

function stopSignDef() {
  const RED = 0xe8202a, RED_D = 0xb0141c, BORDER = WHITE, BACK = 0xa8b2c4;
  const m = signMold({ pole: 0xa8b2c4, poleD: 0x6b7590, leg: 0xa8b2c4, foot: 0xb8b4a8, footD: 0x8a867c, concrete: true, glove: WHITE, gloveD: 0xd6dae6 });
  const CY = 22, ZB = -3, ZF = 5;
  const oct = (x, y, sh = 0) => { const dx = Math.abs(x + 0.5), dy = Math.abs(y - CY); return dx <= 11 - sh && dy <= 11 - sh && dx + dy <= 15.6 - sh * 1.4; };
  const HJ = [-0.5, 12, 0];
  const head = G();
  // pole continues up behind the plate, with a bracket
  cyl(head, 'y', -0.5, -3.5, 12, 30, 1.6, 1.6, 0xa8b2c4);
  for (const y of [15, 27]) rbox(head, -3, y, -4, 2, y + 1, -2, 0.5, 0x6b7590);
  for (let x = -12; x <= 11; x++) for (let y = CY - 12; y <= CY + 12; y++) for (let z = ZB; z <= ZF; z++) {
    const bev = z === ZF || z === ZB ? 0.7 : 0;
    if (!oct(x, y, bev)) continue;
    head.set(x, y, z, z === ZB ? BACK : z === ZF ? RED : RED_D);
  }
  // raised white border on the face + a white stripe round the rim (reads side-on)
  for (let x = -12; x <= 11; x++) for (let y = CY - 12; y <= CY + 12; y++) {
    if (!oct(x, y, 0.7) || oct(x, y, 1.9)) continue;
    head.set(x, y, ZF + 1, BORDER);
  }
  head.paint((x, y, z, c) => (c === RED_D && z === 1 && !oct(x, y, 1) ? BORDER : undefined));
  // STOP on the back plate (reads from behind)
  stamp(head, textArt('STOP', 'W', true), { W: { c: WHITE, raise: 1 } }, { axis: '-z', x: -8, y: CY + 2 });
  for (const [x, y] of [[-1, CY + 7], [-1, CY - 7]]) head.set(x, y, ZB - 1, CHROME);
  // ---- furious face: big bulging eyes, heavy brows, shouting mouth
  const EYY = CY + 2.8;
  eyeBall(head, -4.6, EYY, ZF, [3, 3.4, 2.7], -1, { browCol: INK, browT: 2, inward: 1, pw: 2, ph: 3 });
  eyeBall(head, 3.6, EYY, ZF, [3, 3.4, 2.7], 1, { browCol: INK, browT: 2, inward: 1, pw: 2, ph: 3 });
  // throbbing vein
  stamp(head, ['V.V', '.V.', 'V.V'], { V: { c: 0x8a0a14, raise: 1 } }, { axis: 'z', x: 5, y: CY + 8 });
  openMouth(head, -7, 6, CY - 8, CY - 3, (x, y) => {
    const dx = Math.abs(x + 0.5), t = (CY - 3 - y) / 5.6;
    return dx <= 5.6 * Math.sqrt(Math.max(0, 1 - t * t * t)) + 0.2;
  }, { depth: 4, top: 2, bot: 2, period: 3, tongueW: 2.5, back: MOUTH });
  gradY(head, CY - 11, CY + 11, -0.1, 0.06, (x, y, z, c) => c === RED || c === RED_D);
  return packSign(m, head, HJ, [-11.6, CY - 3, 1], { muzzle: [-0.5, CY - 5, 8] });
}

function shockSignDef() {
  const YEL = 0xffd23f, YEL_D = 0xe0a21a, BLACK = 0x1a1a22, CYAN = 0x7ff6ff, CYAN_W = 0xe8ffff;
  const m = signMold({ pole: 0x8a92a4, poleD: 0x4e5668, leg: 0x8a92a4, foot: BLACK, footD: YEL, glove: YEL, gloveD: YEL_D, glowKnuckle: CYAN, hazard: [YEL, BLACK] });
  const CY = 22, ZB = -3, ZF = 4, RAD = 12.6;
  const dia = (x, y, sh = 0) => Math.abs(x + 0.5) + Math.abs(y - CY) <= RAD - sh;
  const HJ = [-0.5, 12, 0];
  const head = G();
  cyl(head, 'y', -0.5, -3.5, 12, 28, 1.6, 1.6, 0x8a92a4);
  rbox(head, -3, 16, -4, 2, 17, -2, 0.5, 0x4e5668);
  for (let x = -14; x <= 13; x++) for (let y = CY - 13; y <= CY + 13; y++) for (let z = ZB; z <= ZF; z++) {
    const bev = z === ZF || z === ZB ? 0.8 : 0;
    if (!dia(x, y, bev)) continue;
    head.set(x, y, z, z === ZB ? 0x8a92a4 : z === ZF ? YEL : YEL_D);
  }
  // black raised border + black rim stripe
  for (let x = -14; x <= 13; x++) for (let y = CY - 13; y <= CY + 13; y++) if (dia(x, y, 0.8) && !dia(x, y, 2.4)) head.set(x, y, ZF + 1, BLACK);
  head.paint((x, y, z, c) => (c === YEL_D && z === 0 ? BLACK : undefined));
  // high-voltage bolt on the forehead (raised) + on the back
  const BOLTF = ['...KKK', '..KKK.', '.KKK..', 'KKKKKK', '..KKK.', '.KKK..', '.KK...', 'KK....'];
  stamp(head, BOLTF, { K: { c: MAG, raise: 1 } }, { axis: 'z', x: -3, y: CY + 11 });
  stamp(head, BOLTF.map((r) => [...r].reverse().join('')), { K: { c: BLACK, raise: 1 } }, { axis: '-z', x: -3, y: CY + 4 });
  // glowing electric eyes with angry brows
  const EYY = CY + 0.8;
  eyeBall(head, -4.6, EYY, ZF, [2.9, 3.2, 2.6], -1, { white: 0xd8fcff, browCol: BLACK, browT: 2, inward: 0.8, pw: 2, ph: 3, pupil: 0x0a3a6a });
  eyeBall(head, 3.6, EYY, ZF, [2.9, 3.2, 2.6], 1, { white: 0xd8fcff, browCol: BLACK, browT: 2, inward: 0.8, pw: 2, ph: 3, pupil: 0x0a3a6a });
  // electric irises (glowing ring around the pupils)
  glowWhere(head, (x, y, z, c) => c === 0xd8fcff && Math.abs(y - EYY + 0.6) <= 1.6 && (Math.abs(x + 4.6 + 0.8) <= 1.6 || Math.abs(x - 3.6 - 0.8) <= 1.6) && z >= ZF + 1, CYAN);
  // crackling zig-zag grin with a glowing throat
  openMouth(head, -6, 5, CY - 8, CY - 4, (x, y) => {
    const dx = Math.abs(x + 0.5);
    return dx <= 5.6 - (CY - 4 - y) * 0.55;
  }, { depth: 3, top: 2, bot: 2, period: 2, tongue: false, back: 0x1a5a8a });
  glowWhere(head, (x, y, z, c) => c === 0x1a5a8a, 0x3ad8ff);
  // sparks crackling off the plate edges
  const spark = [[-13, CY + 1], [-14, CY + 2], [-13, CY + 3], [-14, CY + 4], [12, CY - 2], [13, CY - 1], [12, CY], [13, CY + 1]];
  for (const [i, [x, y]] of spark.entries()) head.set(x, y, 0, i % 2 ? CYAN : CYAN_W, true);
  gradY(head, CY - 12, CY + 12, -0.08, 0.06, (x, y, z, c) => c === YEL || c === YEL_D);
  // ---- antenna with a crackling spark ball (lightning fires from here)
  const AJ = [-0.5, CY + RAD - 1, 0.5];
  const ant = G();
  cyl(ant, 'y', -0.5, 0.5, AJ[1], AJ[1] + 4, 0.7, 0.7, 0x8a92a4);
  blob(ant, -0.5, AJ[1] + 6, 0.5, 1.6, 1.6, 1.6, CYAN_W, { glow: true });
  for (const [x, y, z] of [[-3, AJ[1] + 7, 0], [2, AJ[1] + 5, 1], [-2, AJ[1] + 4, 1], [1, AJ[1] + 8, 0]]) ant.set(x, y, z, CYAN, true);
  return packSign(m, head, HJ, [-10.6, CY - 3, 0.5], {
    muzzle: [-0.5, AJ[1] + 6, 0.5],
    parts: [jp('antenna', ant, AJ, HJ, { parent: 'head' })],
  });
}

// ===========================================================================
// Bad Eggsperiment: a cracked lab egg with a furious yolk monster bursting out
// of the shell, goggles on its forehead and a lit fuse (kamikaze).

function badEggDef() {
  const SHELL = 0xfff1d6, SPECK = 0xe6cfa0, CRACK = 0x8a6a3a, YOLK = 0xffaa00, YOLK_L = 0xffcc22, YOLK_D = 0xe06a00;
  const HOT = 0xff7a1a, LEG = 0xff9a2a, LEG_D = 0xe0761a;
  const CY = 14.5, RY = 11, R = 8.6;
  const rAt = (y) => { const t = (y - CY) / RY; return t * t >= 1 ? 0 : R * Math.sqrt(1 - t * t) * (1 - 0.12 * t); };
  const crackY = (x, z) => {
    const a = Math.atan2(z, x + 0.5);
    const k = ((a / (Math.PI * 2)) * 18 + 18) % 2;
    return 18 + (k < 1 ? k : 2 - k) * 2.2 - 1;
  };
  const shellCol = (x, y, z) => (n3(x, y, z, 11) < 0.07 ? SPECK : SHELL);
  const body = G(), lid = G();
  for (let y = 3; y <= 26; y++) {
    const r = rAt(y);
    if (r <= 0) continue;
    for (let x = -10; x <= 9; x++) for (let z = -10; z <= 10; z++) {
      const d = Math.hypot(x + 0.5, z);
      if (d > r + 0.35) continue;
      const shell = d > r - 1.6 || y <= 4;
      if (y <= crackY(x, z)) body.set(x, y, z, shell ? shellCol(x, y, z) : YOLK);
      else if (shell) lid.set(x, y, z, shellCol(x, y, z));
    }
  }
  // glowing hot crack along the seam (body side) + hairline cracks
  body.forEach((x, y, z, c) => {
    if (c === YOLK) return;
    if ((lid.has(x, y + 1, z) || lid.has(x, y + 2, z)) && !body.has(x, y + 1, z) && Math.hypot(x + 0.5, z) > rAt(y) - 1.6 && n3(x, y, z, 5) < 0.7) body.set(x, y, z, HOT, true);
  });
  for (const [x0, y0, z0, dx, dy, n] of [[-8, 16, 2, 0, -1, 4], [7, 15, -2, 0, -1, 3], [-6, 14, -6, 1, -1, 3], [5, 16, 6, 1, -1, 2]]) {
    for (let i = 0; i < n; i++) {
      const x = x0 + (i % 2) * dx, y = y0 + i * dy;
      for (let z = z0 - 2; z <= z0 + 2; z++) if (body.get(x, y, z) === SHELL) { body.set(x, y, z, CRACK); break; }
    }
  }
  // ---- the front shell is smashed open: the yolk monster bulges out
  const inHole = (x, y) => {
    const dx = (x + 0.5) / 7.2, dy = (y - 11.5) / 6;
    const jag = ((x + 40) % 3) * 0.12;
    return dx * dx + dy * dy <= 1 - jag;
  };
  body.carve((x, y, z, c) => z > 0 && inHole(x, y) && c !== YOLK);
  blob(body, -0.5, 11.5, 6, 6.6, 5.6, 4.6, (x, y, z) => (y > 14 ? YOLK_L : y < 8 ? YOLK_D : YOLK), { p: 2.2 });
  // jagged shell shards around the hole
  for (const [x, y] of [[-7, 12], [6, 11], [-6, 15], [5, 15], [-3, 6], [2, 6], [-7, 9], [6, 8]]) {
    const z = fz(body, x, y);
    if (z !== null) { body.set(x, y, z + 1, SHELL); body.set(x, y + 1, z + 1, SHELL); }
  }
  // yolk face: angry bulging eyes + fanged grin
  eyeBall(body, -3.2, 13.4, 9, [2.2, 2.5, 1.8], -1, { browCol: 0xa83a00, browT: 1, inward: 0.6, pw: 2, ph: 2 });
  eyeBall(body, 2.2, 13.4, 9, [2.2, 2.5, 1.8], 1, { browCol: 0xa83a00, browT: 1, inward: 0.6, pw: 2, ph: 2 });
  openMouth(body, -5, 4, 7, 10, (x, y) => Math.abs(x + 0.5) <= 4.6 - (10 - y) * 0.7, { depth: 2, top: 2, bot: 1, period: 2, tongueW: 1.5, tongueRows: 0, zmin: 0 });
  // magenta bolts on the flanks
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 13, z: -2 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 13, z: 2 });
  // ---- lab goggles strapped round the shell top (pushed up on the forehead)
  lid.paint((x, y, z, c) => (y === 21 || y === 22 ? INK : undefined));
  for (const [cx, side] of [[-3.3, -1], [2.3, 1]]) {
    const zf0 = Math.ceil(Math.sqrt(Math.max(0, rAt(21.5) ** 2 - (cx + 0.5) ** 2)));
    cyl(lid, 'z', cx, 21.5, zf0 - 1, zf0, 2.1, 2.1, 0x3a3a4a);
    cyl(lid, 'z', cx, 21.5, zf0, zf0, 1.3, 1.3, 0x7fe8ff);
    lid.set(Math.round(cx - side * 0.8), 22, zf0, WHITE, true);
  }
  // ---- fuse burning on top
  const LJ = [-0.5, 18, -8];
  const AJ = [-0.5, 25, -1];
  const fuse = G();
  chain(fuse, [[-0.5, 25, -1], [0, 27, -2], [1.5, 28.5, -1.5], [2.5, 29.5, 0]], [0.9, 0.6], 0x4a3a2a);
  blob(fuse, 2.5, 30.6, 0, 1.2, 1.2, 1.2, 0xffd23f, { glow: true });
  for (const [x, y, z, c] of [[4, 31, 0, HOT], [1, 32, 1, 0xfff6a0], [3, 32, -1, 0xffa21a], [2, 29, 1, HOT]]) fuse.set(x, y, z, c, true);
  lid.set(-1, 25, -1, 0x6a5a4a); lid.set(0, 25, -1, 0x6a5a4a);
  // ---- skinny chicken legs
  const legL = G();
  capsule(legL, [-3.2, 5, -0.5], [-3.2, 1, 0], 1, 0.9, LEG);
  for (const [tx, tz] of [[-5.4, 3.6], [-3.2, 4.6], [-1, 3.6], [-3.2, -2.2]]) capsule(legL, [-3.2, 0.6, 0], [tx, 0.6, tz], 0.9, 0.6, LEG_D);

  const root = [-0.5, 0, 0];
  return {
    gait: 'walk',
    voxel: 0.05,
    parts: [
      jp('legL', legL, [-3.2, 5, -0.5]), jp('legR', flipX(legL), [2.2, 5, -0.5]),
      jp('body', body, root),
      jp('lid', lid, LJ, root, { parent: 'body', rot: [-0.08, 0, 0] }),
      jp('antenna', fuse, AJ, LJ, { parent: 'lid' }),
    ],
    muzzle: [-0.5, 12, 9],
    finish: 'gloss',
    jitter: 0.02,
  };
}

// ===========================================================================
// Barf Bin: a neon-green wheelie bin hurling a sticky glowing barf stream.

function barfBinDef() {
  const BIN = 0x1fb83a, BIN_D = 0x0f7a28, LID = 0x179a30, LID_L = 0x30c04a;
  const BARF = [0xb8ff3a, 0x9ae82a, 0xffc21a, 0x8a5a2a, 0xe8ff7a];
  const barf = (x, y, z) => { const n = n3(x, y, z, 13); return n < 0.1 ? BARF[2] : n < 0.16 ? BARF[3] : n < 0.5 ? BARF[0] : n < 0.85 ? BARF[1] : BARF[4]; };
  const Y0 = 3, TOP = 24;
  const hw = (y) => 7 + ((y - Y0) / (TOP - Y0)) * 1.2; // tapered: wider at the top
  const body = G();
  for (let y = Y0; y <= TOP; y++) {
    const w = hw(y);
    rbox(body, Math.round(-0.5 - w), y, Math.round(-w + 0.5), Math.round(-0.5 + w), y, Math.round(w - 0.5), 2, (x, yy, z) => {
      if (Math.abs(x + 0.5) > w - 0.7 && (z + 40) % 3 === 0) return BIN_D; // vertical ribs on the flanks
      return BIN;
    }, { noRoundY: true });
  }
  // top lip + base band
  rbox(body, -9, TOP - 1, -9, 8, TOP, 9, 1.5, BIN_D);
  rbox(body, -8, Y0, -8, 7, Y0 + 1, 7, 1.5, BIN_D);
  // white recycling arrows on the flanks + magenta bolt on the back
  const ARROWS = ['..W..', '.WWW.', 'W.W.W', '..W..', 'W...W', 'WWWWW'];
  stamp(body, ARROWS, { W: WHITE }, { axis: 'x', y: 18, z: 2 });
  stamp(body, ARROWS, { W: WHITE }, { axis: '-x', y: 18, z: -2 });
  stamp(body, BOLT, { M: MAG }, { axis: '-z', x: -3, y: 17 });
  // ---- sick, furious face
  const EY = 18;
  for (const [cx, side] of [[-3.8, -1], [2.8, 1]]) {
    // purple eye bags
    stamp(body, ['.BBBB.', 'BBBBBB'], { B: 0x9a5ac8 }, { axis: 'z', x: Math.round(cx - 2.5), y: EY - 3 });
    eyeBall(body, cx, EY, 8, [2.9, 3.2, 2.4], side, { white: 0xf2ffc0, browCol: 0x0e4a1a, browT: 2, inward: 0.6, pw: 2, ph: side < 0 ? 2 : 3, down: side < 0 ? 0.2 : 0.8 });
  }
  openMouth(body, -7, 6, 6, 13, (x, y) => {
    const dx = (x + 0.5) / 6.2, dy = (y - 9.5) / 3.8;
    return dx * dx + dy * dy <= 1;
  }, { depth: 4, top: 2, bot: 2, period: 3, tongue: false, back: 0x2a0a10, lipCol: BIN_D });
  // barf: a thick stream pouring from the mouth down to a sticky puddle
  chain(body, [[-0.5, 8, 6], [-0.5, 7.8, 10], [-0.5, 5.5, 12.5], [-0.5, 2.5, 13.5]], [2.2, 2, 1.9, 2.4], barf);
  blob(body, -0.5, 0.5, 14, 6.6, 0.9, 4.6, barf, { p: 2.3, clip: (x, y) => y < 0 });
  for (const [x, z] of [[-6, 11], [5, 16], [-4, 18], [3, 11]]) body.set(x, 1, z, BARF[4]);
  glowWhere(body, (x, y, z, c) => (c === BARF[0] || c === BARF[4]) && z >= 7 && n3(x, y, z, 21) < 0.25);
  // drips down the flanks
  for (const [z, len] of [[5, 6], [-3, 4]]) { drip(body, 'x', z, TOP - 2, len, BARF[1]); drip(body, '-x', -z, TOP - 2, len - 1, BARF[1]); }
  gradY(body, Y0, TOP, -0.14, 0.06, (x, y, z, c) => c === BIN || c === BIN_D);

  // ---- lid (hinged at the back, burps open on attacks)
  const LJ = [-0.5, TOP + 1, -9];
  const lid = G();
  rbox(lid, -10, TOP + 1, -10, 9, TOP + 2, 10, 1.5, LID);
  rbox(lid, -9, TOP + 3, -9, 8, TOP + 3, 7, 1.5, LID_L);
  rbox(lid, -6, TOP, 9, 5, TOP + 2, 11, 1, LID); // front grab lip
  stamp(lid, ['.MMM', 'MMM.', 'MMMM', '.MM.', 'MM..'], { M: MAG }, { axis: 'y', x: -2, z: -3 });
  // compost poking out under the lid
  for (const [x, y, z, c] of [[-8, TOP, 9, 0xffd23f], [-9, TOP - 1, 9, 0xffd23f], [-7, TOP, 10, 0xffd23f], [6, TOP, 9, 0x8a5a2a], [7, TOP, 9, 0xff4a3a], [0, TOP, 10, 0x6aa83a]]) lid.set(x, y, z, c);
  // stink fumes
  for (const [x, y, z] of [[-4, TOP + 5, -2], [-3, TOP + 6, -2], [-4, TOP + 7, -2], [3, TOP + 5, 1], [4, TOP + 6, 1], [3, TOP + 7, 1], [4, TOP + 8, 1]]) lid.set(x, y, z, GOO_L, true);

  // ---- buzzing flies orbiting the bin
  const FJ = [-0.5, TOP + 6, 0];
  const flies = G();
  for (const s of [-1, 1]) {
    const fx = Math.round(-0.5 + s * 11);
    flies.set(fx, FJ[1], 0, INK); flies.set(fx, FJ[1], 1, INK);
    flies.set(fx - 1, FJ[1] + 1, 0, 0xe8f4ff); flies.set(fx + 1, FJ[1] + 1, 0, 0xe8f4ff);
  }
  // ---- back wheels + stubby front feet
  const wheel = (x) => {
    const w = G();
    cyl(w, 'x', 3, -7, x - 1, x + 1, 3, 3, INK);
    cyl(w, 'x', 3, -7, x - 1, x + 1, 1.3, 1.3, 0x6b7386);
    return w;
  };
  const legL = bootLeg(-4, 3, 4, BIN_D, BIN_D, { r: 1.8, bw: 2.4, bl: 3, sole: INK });

  const root = [-0.5, 0, 0];
  return {
    gait: 'walk',
    voxel: 0.05,
    parts: [
      jp('legL', legL, [-4, 4, 3]), jp('legR', flipX(legL), [3, 4, 3]),
      jp('wheelBL', wheel(-9), [-9, 3, -7]), jp('wheelBR', wheel(8), [8, 3, -7]),
      jp('body', body, root),
      jp('lid', lid, LJ, root, { parent: 'body', rot: [-0.12, 0, 0] }),
      jp('spinFlies', flies, FJ, root, { parent: 'body' }),
    ],
    muzzle: [-0.5, 9, 10],
    finish: 'gloss',
    jitter: 0.02,
  };
}

// ===========================================================================
// Atomic Toilet: the toilet mold reworked as a hazard-yellow reactor that
// flushes radioactive blasts: glowing green sludge, glowing eyes, trefoils,
// a hazard-striped tank lid, a glowing core and exhaust stacks.

const TREFOIL = [
  '.KK...KK.',
  'KKKK.KKKK',
  'KKKK.KKKK',
  '.KKK.KKK.',
  '....K....',
  '...KKK...',
  '..KKKKK..',
  '..KKKKK..',
  '...KKK...',
];

function atomicToiletDef() {
  const S = {
    main: 0xffc20a, dark: 0xe07a00, seat: 0xffe04a, lidUnder: 0xffd84a, brow: 0x1a1a22, throat: 0x0a2a10,
    tooth: MAG, toothTip: MAG_L,
    sludge: [0x7cff3a, 0xb8ff6a, 0x3ad82a, 0xeaffb0], goo: [GOO, 0xb8ff6a],
  };
  const BLACK = 0x1a1a22, NUKE = 0x9cff3a, NUKE_W = 0xe0ffb0;
  const m = toiletMold(S);
  const b = m.grids.body, lid = m.grids.lid;
  // radioactive sludge glows
  glowWhere(b, (x, y, z, c) => S.sludge.includes(c) && y >= 8 && y <= 12);
  // glowing eyes (the eye whites turn nuclear green)
  glowWhere(b, (x, y, z, c) => c === WHITE && y >= 18 && y <= 28 && z >= -6, 0xa8ff4a);
  // swap the bolt decals for trefoils on the tank flanks
  b.paint((x, y, z, c) => (c === MAG && Math.abs(x + 0.5) > 8 && y >= 15 && y <= 23 ? S.main : undefined));
  stamp(b, TREFOIL, { K: BLACK }, { axis: '-x', y: 24, z: -12 });
  stamp(b, TREFOIL, { K: BLACK }, { axis: 'x', y: 24, z: -4 });
  // hazard stripes round the tank lid
  b.paint((x, y, z, c) => (c === S.seat && y >= 30 && z <= -1 ? (((x + z + y + 60) % 4) < 2 ? BLACK : S.main) : undefined));
  // glowing core dome replaces the flush button + exhaust stacks puffing green
  b.carve((x, y, z, c) => c === CHROME && y >= 33);
  blob(b, -0.5, 33.5, -7.5, 2.6, 1.8, 2.4, NUKE, { glow: true, clip: (x, y) => y < 33 });
  cyl(b, 'y', -0.5, -7.5, 33, 33, 3.4, 3.4, BLACK);
  for (const x of [-8, 7]) {
    cyl(b, 'y', x, -11, 31, 37, 1.4, 1.4, CHROME_D);
    cyl(b, 'y', x, -11, 37, 37, 1.8, 1.8, CHROME);
    for (const [dx, dy, dz, c] of [[0, 39, 0, NUKE], [1, 40, -1, NUKE_W], [0, 41, 0, NUKE], [-1, 42, 0, NUKE]]) b.set(x + dx, dy, -11 + dz, c, true);
  }
  // the lid gets a trefoil instead of the bolt
  lid.paint((x, y, z, c) => (c === MAG ? S.main : undefined));
  stamp(lid, TREFOIL, { K: BLACK }, { axis: 'y', x: -5, z: 5 });
  return packToilet(m, { muzzle: [-0.5, 16, 5] });
}

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

  trashedCan(o = {}) {
    return trashedCanDef(o);
  },

  toiletRollRipper() {
    return toiletRollDef();
  },

  mutantMailbox() {
    return mailboxDef();
  },

  ragingStopSign() {
    return stopSignDef();
  },

  shockSign() {
    return shockSignDef();
  },

  badEggsperiment() {
    return badEggDef();
  },

  barfBin() {
    return barfBinDef();
  },

  atomicToilet() {
    return atomicToiletDef();
  },
};
