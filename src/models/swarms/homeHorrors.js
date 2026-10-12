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
  const lidC = o.lid ?? INK;
  blob(g, cx, cy, cz, r, r, r, o.white ?? WHITE, { p: 2, glow: !!o.glow });
  const slant = o.slant ?? 0.45, lift = o.lift ?? 0.35;
  const lineY = (x) => cy + r * lift + (x - cx) * side * slant; // higher at the outer side
  blob(g, cx, cy, cz, r + 0.7, r + 0.7, r + 0.7, lidC, { p: 2, clip: (x, y, z) => y < lineY(x) || z < cz - r * 0.6 });
  g.paint((x, y, z, c) => (c === (o.white ?? WHITE) && y >= lineY(x) && Math.hypot(x - cx, y - cy, z - cz) <= r + 0.8 ? lidC : undefined));
  const pw = o.pw ?? 2, ph = o.ph ?? 3, look = o.look ?? [0, 0];
  const px = Math.round(cx - side * 0.6 + look[0] - pw / 2 + 0.5), py = Math.round(cy - 0.4 + look[1] + ph / 2 - 0.5);
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
  const EY = WALL + AR - 0.5, EZ = 4.5;
  orbEye(head, -4.2, EY, EZ, 3.4, -1, { lid: BLUE_D, slant: 0.5, lift: 0.3 });
  orbEye(head, 3.2, EY, EZ, 3.4, 1, { lid: BLUE_D, slant: 0.5, lift: 0.3 });
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
  orbEye(stalk, -0.5, WALL + AR + 8, -5.5, 2.3, 1, { lid: BLUE_D, slant: 0, lift: 0.45, pw: 2, ph: 2 });

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
      jp('jaw', door, DJ, HJ, { parent: 'head', rot: [0.32, 0, 0] }),
      jp('flag', flag, FJ, HJ, { parent: 'head' }),
      jp('antenna', stalk, AJ, HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, WALL, Z1 + 3],
    finish: 'gloss',
    jitter: 0.02,
  };
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
};
