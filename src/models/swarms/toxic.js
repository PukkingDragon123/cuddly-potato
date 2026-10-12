// Toxic Troopers (Atomic Series): military meets toxic waste. Hi-res (0.05)
// toy sculpts with big angry faces, open toothy mouths, neon radioactive
// green, hazard stripes, radiation trefoils, army helmets and glowing goo.
// See ../kit.js and ./panthers.js for the modelling conventions (model faces
// +Z, y = 0 ground, x symmetric around -0.5, parts in absolute coordinates
// attached with jp() at their joints).
// eslint-disable-next-line no-unused-vars
import { G, blob, rbox, capsule, chain, cyl, stamp, eyes, mirror, sym, symBox, glowWhere, fadeY, gradY, n3, jp, part, shade, mixHex, mottle, frontZ } from '../kit.js';

const MAG = 0xff1f9e; // MrBeast magenta
const INK = 0x15121f;
const TOOTH = 0xffffff;
const MOUTH = 0x2a0a1e;
const TONGUE = 0xff5a9a;
const HAZ_Y = 0xffd23f; // hazard yellow
const OLIVE = 0x5d7a2c, OLIVE_D = 0x435a1e, OLIVE_L = 0x7f9c3e;
const GOO = 0x7cff3a, GOO_D = 0x3cc41a, GOO_L = 0xc8ff7a;

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}
/** Mirror pixel-art rows horizontally. */
const rev = (rows) => rows.map((r) => [...r].reverse().join(''));

/** Radiation trefoil decal (9x9): Y = yellow disc, K = black blades. */
const TREFOIL = [
  '...YYY...',
  '.YKKYKKY.',
  '.KKKYKKK.',
  'YKKKYKKKY',
  'YYYYKYYYY',
  'YYYYYYYYY',
  '.YYKKKYY.',
  '.YYKKKYY.',
  '...YKY...',
];
/** Small trefoil (5x5) for tags and badges. */
const TREFOIL_S = [
  '.KYK.',
  'KKYKK',
  'YYKYY',
  '.YKY.',
  '.KKK.',
];

/**
 * Bulging cartoon eyeball on a front-facing surface with a slanted angry brow
 * slab (reads in profile too). side: -1 = model's left (x < -0.5).
 * o: white, glow, pupil, pupilGlow, pw/ph, inward/down, browCol, browT,
 *    browHi/browLo, browOut (extension past the outer corner), brow:false.
 */
function eyeBall(g, cx, cy, cz, r, side, o = {}) {
  const [rx, ry, rz] = r;
  const white = o.white ?? 0xffffff;
  const inEye = (x, y) => Math.abs(x - cx) <= rx + 1 && Math.abs(y - cy) <= ry + 1;
  blob(g, cx, cy, cz, rx, ry, rz, white, { p: 2.2, clip: (x, y, z) => z < cz - 1, glow: !!o.glow });
  const outer = cx + side * (rx + 0.5), inner = cx - side * (rx + 0.5);
  const yo = cy + ry * (o.browHi ?? 0.95), yi = cy + ry * (o.browLo ?? 0.15);
  const yLine = (x) => yo + ((x - outer) / (inner - outer)) * (yi - yo);
  if (o.brow !== false) g.carve((x, y, z, c) => c === white && inEye(x, y) && z >= cz - 1 && y > yLine(x) - 0.5);
  const pw = o.pw ?? 3, ph = o.ph ?? 3;
  const px = Math.round(cx - side * (o.inward ?? 1) - pw / 2 + 0.5), py = Math.round(cy - (o.down ?? 0.8) + ph / 2 - 0.5);
  const art = [];
  for (let v = 0; v < ph; v++) art.push('P'.repeat(pw));
  const gx = side < 0 ? 0 : pw - 1;
  if (o.glint !== false) art[0] = art[0].slice(0, gx) + 'G' + art[0].slice(gx + 1);
  stamp(g, art, { P: { c: o.pupil ?? INK, glow: !!o.pupilGlow }, G: { c: 0xffffff, glow: true } }, { axis: 'z', x: px, y: py, depth: 2 });
  if (o.brow !== false) {
    const bc = o.browCol ?? INK, bt = o.browT ?? 2;
    const ext = o.browOut ?? 1;
    const x0 = Math.floor(Math.min(outer, inner)) - (side < 0 ? ext : 0), x1 = Math.ceil(Math.max(outer, inner)) + (side > 0 ? ext : 0);
    for (let x = x0; x <= x1; x++) {
      const yb = Math.round(yLine(Math.max(Math.min(x, Math.max(outer, inner)), Math.min(outer, inner))));
      const t = (x - cx) / (rx + 1.2);
      const zf = Math.round(cz + rz * Math.sqrt(Math.max(0, 1 - t * t)) + 0.6);
      for (let y = yb; y < yb + bt; y++) for (let z = cz - 1; z <= zf; z++) g.set(x, y, z, bc);
    }
  }
  return g;
}

/** Vertical drip painted down a surface along axis ('z' front, 'x' / '-x' sides); the tip bulges out. */
function drip(g, axis, u, y, len, col, o = {}) {
  const art = [];
  for (let i = 0; i < len; i++) art.push(i === len - 1 ? 'b' : 'd');
  const pal = { d: { c: col, glow: !!o.glow, raise: o.raise ?? 0 }, b: { c: col, glow: !!o.glow, raise: (o.raise ?? 0) + 1 } };
  if (axis === 'z') stamp(g, art, pal, { axis: 'z', x: u, y });
  else stamp(g, art, pal, { axis, y, z: u });
  return g;
}

/** Remove interior voxels deeper than d from the surface (keeps the look, trims the voxel count). */
function hollowOut(g, d = 2) {
  const kill = [];
  g.forEach((x, y, z) => {
    for (let dx = -d; dx <= d; dx++) for (let dy = -d; dy <= d; dy++) for (let dz = -d; dz <= d; dz++) if (!g.has(x + dx, y + dy, z + dz)) return;
    kill.push([x, y, z]);
  });
  for (const [x, y, z] of kill) g.del(x, y, z);
  return g;
}

/** Move the voxels matching fn(x,y,z,c) out of `src` into a new grid (to split off a hinged part). */
function splitOff(src, fn) {
  const out = G();
  const hits = [];
  src.forEach((x, y, z, c, glow) => { if (fn(x, y, z, c)) hits.push([x, y, z, c, glow]); });
  for (const [x, y, z, c, glow] of hits) { out.set(x, y, z, c, glow); src.del(x, y, z); }
  return out;
}

// ===========================================================================
// Atomic Slime: a wobbling blob of radioactive goo wearing an army helmet
// with a radiation trefoil. Huge angry eyes, a toothy grin, goo-drip arms and
// a puddle base. Glow-in-the-dark finish. Splits into two Mini Slimes.
function slimeMold(k = 1, o = {}) {
  const R = (v) => v * k;
  const goo = (x, y, z) => (y <= R(2) ? GOO_D : n3(x, y, z, 5) < 0.12 ? GOO_L : n3(x, y, z, 6) < 0.18 ? 0x66ec2c : GOO);

  // ------------------------------------------------------------ body: drooping goo blob + puddle
  const body = G();
  const cy = R(10), top = R(19.5);
  blob(body, -0.5, cy, 0, R(10), R(9.6), R(9.2), goo, { p: 2.2, clip: (x, y) => y < 0 });
  blob(body, -0.5, R(4), R(0.5), R(11.6), R(4.2), R(10.6), goo, { p: 2.4, clip: (x, y) => y < 0 });
  // lumpy puddle around the base
  const PR = R(13);
  for (let x = Math.floor(-0.5 - PR - 1); x <= Math.ceil(-0.5 + PR + 1); x++) for (let z = Math.floor(-PR - 1); z <= Math.ceil(PR + 1); z++) {
    const a = Math.atan2(z, x + 0.5);
    const rr = PR * (0.86 + 0.14 * Math.sin(a * 5 + 1) + 0.06 * Math.sin(a * 11));
    if (Math.hypot(x + 0.5, z) <= rr) body.set(x, 0, z, GOO_D);
  }
  // face: big bulging angry eyes
  const ey = Math.round(R(11.8));
  for (const [cx, side] of [[-0.5 - R(4.6), -1], [-0.5 + R(4.6), 1]]) {
    const cz = (frontZ(body, Math.round(cx), ey) ?? R(8)) - 1;
    eyeBall(body, cx, ey, cz, [R(3.3), R(3.7), R(2.4)], side, {
      pw: Math.max(2, Math.round(R(3))), ph: Math.max(2, Math.round(R(3.4))), inward: R(0.9), browT: k < 0.8 ? 1 : 2, browCol: 0x1d5a10, browOut: 0,
    });
  }
  // wide open grin carved into the front (upper teeth hang from its top edge)
  const my0 = Math.round(R(4)), my1 = Math.round(R(8.4)), mw = R(6.6);
  const inMouth = (x, y) => {
    const t = (y - my0) / Math.max(1, my1 - my0); // 0 bottom .. 1 top
    return Math.abs(x + 0.5) <= mw * (0.62 + 0.38 * Math.sqrt(Math.max(0, t))) && y >= my0 && y <= my1;
  };
  const mf = {};
  body.forEach((x, y, z) => { if (inMouth(x, y) && (mf[x + ',' + y] === undefined || z > mf[x + ',' + y])) mf[x + ',' + y] = z; });
  const depth = Math.max(2, Math.round(R(3)));
  for (const key in mf) {
    const [x, y] = key.split(',').map(Number);
    for (let d = 0; d < depth; d++) body.del(x, y, mf[key] - d);
    body.set(x, y, mf[key] - depth, MOUTH);
  }
  for (const key in mf) {
    const [x, y] = key.split(',').map(Number);
    if (mf[x + ',' + (y + 1)] !== undefined) continue;
    const z = mf[key] - 1;
    body.set(x, y, z, TOOTH);
    if (((x + 40) % 2) === 0 && y - 1 >= my0) body.set(x, y - 1, z, TOOTH);
  }
  // tongue + lower teeth on the bottom edge (part of the jaw)
  for (const key in mf) {
    const [x, y] = key.split(',').map(Number);
    if (mf[x + ',' + (y - 1)] !== undefined) continue;
    body.set(x, y - 1, mf[key] - 1, (x + 41) % 2 === 0 ? TOOTH : GOO_D);
    if (Math.abs(x + 0.5) <= mw * 0.45) body.set(x, y, mf[key] - depth + 1, TONGUE);
  }
  // goo drips down the front and sides
  for (const [u, len] of [[-7, 4], [5, 3], [-2, 2]]) drip(body, 'z', Math.round(-0.5 + u * k), Math.round(R(4)), Math.max(2, Math.round(len * k)), GOO_D);
  for (const [u, len] of [[3, 5], [-4, 3]]) { drip(body, 'x', Math.round(u * k), Math.round(R(13)), Math.max(2, Math.round(len * k)), GOO_D); drip(body, '-x', Math.round(-u * k), Math.round(R(12)), Math.max(2, Math.round(len * k)), GOO_D); }
  // glowing bubbles + lightning-bolt "goo scar" on both flanks
  glowWhere(body, (x, y, z, c) => (c === GOO || c === GOO_L) && y > R(3) && n3(x, y, z, 11) < 0.022, 0xeaffc0);
  const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
  if (k >= 0.8) {
    stamp(body, BOLT, { M: MAG }, { axis: '-x', y: Math.round(R(13)), z: -3 });
    stamp(body, rev(BOLT), { M: MAG }, { axis: 'x', y: Math.round(R(13)), z: 1 });
  }
  gradY(body, 0, top, -0.14, 0.08, (x, y, z, c) => c === GOO || c === GOO_L || c === GOO_D || c === 0x66ec2c);

  // ------------------------------------------------------------ army helmet with a trefoil + hazard band
  const helmet = G();
  const hy = Math.round(R(16.8));
  blob(helmet, -0.5, hy, R(-0.6), R(8.8), R(7), R(8.8), (x, y, z) => (n3(x, y, z, 2) < 0.15 ? OLIVE_L : OLIVE), { p: 2.2, clip: (x, y) => y < hy });
  cyl(helmet, 'y', -0.5, R(-0.6), hy, hy, R(9.9), R(9.9), OLIVE_D);
  helmet.forEach((x, y, z) => { if (y === hy + 1 && !helmet.has(x, y, z + 1)) helmet.set(x, y, z, ((x + z + 40) % 4) < 2 ? HAZ_Y : INK); });
  helmet.forEach((x, y, z) => { if (y === hy + 1 && (!helmet.has(x + 1, y, z) || !helmet.has(x - 1, y, z) || !helmet.has(x, y, z - 1))) helmet.set(x, y, z, ((x + z + 40) % 4) < 2 ? HAZ_Y : INK); });
  // trefoil decal on the helmet front (zmin keeps it off the domed top)
  const tz = (frontZ(helmet, -1, hy + 3) ?? 6) - 2;
  if (k >= 0.8) stamp(helmet, TREFOIL_S, { Y: HAZ_Y, K: INK }, { axis: 'z', x: -3, y: hy + 6, zmin: tz });
  else stamp(helmet, ['.Y.', 'YKY', '.Y.'], { Y: HAZ_Y, K: INK }, { axis: 'z', x: -2, y: hy + 4, zmin: tz });
  gradY(helmet, hy, hy + R(7), -0.1, 0.08, (x, y, z, c) => c === OLIVE || c === OLIVE_L);
  // the helmet is part of the body (it rides along with the hops)
  helmet.forEach((x, y, z, c, gl) => body.set(x, y, z, c, gl));

  // ------------------------------------------------------------ jaw: the chin under the grin flops open
  const JJ = [-0.5, my0 + 0.5, 0];
  const jaw = splitOff(body, (x, y, z) => y < my0 && y >= 1 && z >= R(3) && Math.abs(x + 0.5) <= mw + 1);

  // ------------------------------------------------------------ goo arms (pseudopods)
  const arm = G();
  chain(arm, [[-0.5 - R(9.4), R(9), R(1)], [-0.5 - R(12.2), R(7.5), R(2.5)], [-0.5 - R(13.6), R(5), R(4)]], [R(2.6), R(2), R(1.6)], goo);
  blob(arm, -0.5 - R(13.8), R(4.2), R(4.4), R(2.2), R(2), R(2.2), goo);
  for (const [dx, dz] of [[-1, 1], [0.6, 1.6]]) blob(arm, -0.5 - R(13.8) + R(dx * 1.4), R(3), R(4.4) + R(dz * 1.4), R(0.9), R(0.9), R(0.9), GOO_L);
  drip(arm, '-x', Math.round(R(2)), Math.round(R(7)), Math.max(2, Math.round(R(3))), GOO_D);
  const armR = flipX(arm);

  if (o.hollow !== false) hollowOut(body, 2);
  return {
    gait: 'hop', voxel: 0.05, jitter: 0.02, finish: 'glow',
    parts: [
      jp('body', body, [-0.5, 0, 0]),
      jp('jaw', jaw, JJ, [-0.5, 0, 0], { parent: 'body' }),
      jp('armL', arm, [-0.5 - R(9.4), R(9), R(1)], [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, [-0.5 + R(9.4), R(9), R(1)], [-0.5, 0, 0], { parent: 'body' }),
    ],
    muzzle: [-0.5, R(7), R(11)],
  };
}

// ===========================================================================
// Plutonium Pup: a hazard-yellow bulldog pup with black warning chevrons down
// its back, glowing plutonium spots, a spiked collar with a trefoil tag, a
// gas-mask pushed up on its forehead like goggles and a glowing fuel-rod tail.
// Floppy ears wobble; the jaw snaps open on bites.
function plutoniumPup() {
  const K = {
    fur: 0xffc21f, dark: 0xe0961a, light: 0xfff0c0, muzzle: 0xfff6d8, ear: 0x8a4e1a, earIn: 0xff8fb8,
    brow: 0x5a320e, nose: INK, collar: 0x2a2438, stud: 0xe4e9f2, lens: 0x7ff6ff, rim: 0x3a3f50,
  };
  const spots = [[-6.5, 12, -4], [5.5, 11, -6], [-5, 9, 2], [6, 13, 1], [-3, 15, -8], [2.5, 14.5, -10]];
  const spotAt = (x, y, z) => spots.some(([sx, sy, sz]) => (x - sx) ** 2 + (y - sy) ** 2 + (z - sz) ** 2 <= 3.2);

  // ------------------------------------------------------------ body
  const body = G();
  blob(body, -0.5, 10.5, -2.5, 6.6, 5.3, 7.8, K.fur, { p: 2.3 });
  blob(body, -0.5, 12.5, 4, 6, 5, 4, K.fur, { p: 2.2 });
  body.paint((x, y, z) => {
    const ax = Math.abs(x + 0.5);
    if (y <= 7 && ax <= 4.4) return K.light;
    if (z >= 6 && y <= 12 && ax <= 3.6) return K.light;
    // bold black hazard stripes slanting across the back
    if (y >= 11 && ((z + y + 60) % 7) < 3) return INK;
    return undefined;
  });
  glowWhere(body, (x, y, z) => spotAt(x, y, z), GOO);
  // spiked collar + trefoil tag
  for (let x = -8; x <= 7; x++) for (let y = 7; y <= 19; y++) for (const z of [6, 7]) {
    const d = Math.hypot((x + 0.5) / 6.4, (y - 12.8) / 5.6);
    if (d <= 1.05 && d >= 0.72) body.set(x, y, z, ((x + y + 40) % 3 === 0 && z === 7) ? K.stud : K.collar);
  }
  for (const [x, y] of [[-6, 14], [5, 14], [-4, 17], [3, 17], [-0.5, 18]]) blob(body, x, y, 8, 0.6, 0.6, 0.9, K.stud);
  cyl(body, 'z', -0.5, 7.5, 8, 9, 2.3, 2.3, HAZ_Y);
  stamp(body, ['.KYK.', 'KKYKK', 'YYKYY', '.YKY.', '.KKK.'], { Y: HAZ_Y, K: INK }, { axis: 'z', x: -3, y: 9.5 | 0, zmin: 8 });
  gradY(body, 4, 17, -0.1, 0.05, (x, y, z, c) => c === K.fur || c === K.light);

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 14, 5];
  const head = G();
  blob(head, -0.5, 19.5, 7, 9.4, 8, 7.6, K.fur, { p: 2.2 });
  blob(head, -0.5, 15.5, 9.5, 8.8, 4.4, 5.6, K.fur, { p: 2.2 }); // jowls
  blob(head, -0.5, 15.8, 14, 5.2, 3, 3.8, K.muzzle, { p: 2.2 }); // snout
  // open mouth cavity under the snout
  head.carve((x, y, z) => y >= 10 && y <= 13 && z >= 11 && Math.abs(x + 0.5) <= 5.6);
  head.carve((x, y, z) => y < 10 && z >= 8);
  for (let x = -6; x <= 5; x++) {
    if (Math.abs(x + 0.5) > 5.6) continue;
    for (let y = 10; y <= 13; y++) head.set(x, y, 11, MOUTH);
    for (let z = 11; z <= 19; z++) if (head.has(x, 14, z)) head.set(x, 14, z, MOUTH);
  }
  for (let x = -5; x <= 4; x++) {
    let fz = 0;
    for (let z = 20; z >= 11; z--) if (head.has(x, 14, z)) { fz = z; break; }
    if (!fz) continue;
    head.set(x, 13, fz, TOOTH);
    if ((x + 5) % 2 === 0) head.set(x, 12, fz, TOOTH);
  }
  for (const x of [-5, 4]) for (let y = 11; y <= 13; y++) head.set(x, y, 16, TOOTH); // fangs
  // big black nose + glint
  blob(head, -0.5, 17.6, 17.2, 2.2, 1.3, 1.2, K.nose, { p: 2.4 });
  head.set(-2, 18, 18, 0xffffff, true);
  // angry eyes with heavy brows
  for (const [cx, side] of [[-4.8, -1], [3.8, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 20) ?? 12) - 1;
    eyeBall(head, cx, 20, cz, [2.7, 3.1, 2], side, { pw: 2, ph: 3, inward: 0.6, browCol: K.brow, browT: 2, browOut: 0 });
  }
  // glowing plutonium freckle on the cheek
  glowWhere(head, (x, y, z) => (x + 7.5) ** 2 + (y - 15) ** 2 <= 2.2 && z >= 10, GOO);
  // gas mask pushed up on the forehead: strap + two round goggle lenses + filter
  head.forEach((x, y, z, c) => { if (y === 25 || y === 26) head.set(x, y, z, OLIVE_D); });
  for (const s of [-1, 1]) {
    const lx = s < 0 ? -4 : 3;
    const lz = (frontZ(head, lx, 26) ?? 10) + 1;
    cyl(head, 'z', lx, 26.5, lz - 2, lz, 2.6, 2.6, OLIVE);
    cyl(head, 'z', lx, 26.5, lz, lz + 1, 1.7, 1.7, K.rim);
    cyl(head, 'z', lx, 26.5, lz + 1, lz + 1, 1.2, 1.2, K.lens);
    head.set(lx - 1, 27, lz + 2, 0xffffff, true);
  }
  cyl(head, 'z', -0.5, 25, (frontZ(head, -1, 25) ?? 10) - 1, (frontZ(head, -1, 25) ?? 10) + 1, 1.6, 1.6, OLIVE_L);
  gradY(head, 10, 27, -0.1, 0.06, (x, y, z, c) => c === K.fur || c === K.muzzle);

  // ------------------------------------------------------------ jaw
  const JJ = [-0.5, 12, 11];
  const jaw = G();
  blob(jaw, -0.5, 9.4, 14.6, 5, 2.2, 4.6, K.muzzle, { p: 2.3 });
  blob(jaw, -0.5, 9.8, 11.5, 6.4, 2.8, 3, K.fur, { p: 2.2 });
  jaw.carve((x, y) => y >= 11);
  for (let x = -6; x <= 5; x++) for (let z = 10; z <= 19; z++) if (jaw.has(x, 10, z)) jaw.set(x, 10, z, Math.abs(x + 0.5) <= 2.4 && z <= 17 ? TONGUE : MOUTH);
  for (let x = -5; x <= 4; x++) {
    let fz = 0;
    for (let z = 20; z >= 10; z--) if (jaw.has(x, 10, z)) { fz = z; break; }
    if (fz && ((x + 5) % 2 === 1 || x === -5 || x === 4)) jaw.set(x, 11, fz, TOOTH);
  }
  // tongue flopping out over the lip
  blob(jaw, -0.5, 10.5, 18.6, 1.8, 0.8, 1.6, TONGUE);

  // ------------------------------------------------------------ floppy ears (wobble)
  const earL = G();
  chain(earL, [[-7.5, 24.5, 6], [-10.5, 21.5, 7], [-11.5, 17.5, 7.5]], [2.6, 2.6, 2], K.ear, { clip: (x, y, z) => z < 5 || z > 9 });
  chain(earL, [[-8, 23.5, 8.4], [-10.6, 20.5, 8.8]], [1.3, 1], K.earIn, { clip: (x, y, z) => z < 8 });
  const earR = flipX(earL);

  // ------------------------------------------------------------ legs
  const leg = (front) => {
    const g = G();
    const cx = -4.6, cz = front ? 4 : -7.5;
    if (front) capsule(g, [cx, 9, cz], [cx, 3, cz + 0.5], 2.6, 2.3, K.fur);
    else { blob(g, cx, 8, cz, 3.2, 3.4, 3.4, K.fur, { p: 2.2 }); capsule(g, [cx, 6, cz], [cx, 3, cz + 0.5], 2.4, 2.2, K.fur); }
    blob(g, cx, 1.8, cz + 1.2, 2.9, 1.9, 3.2, K.light, { p: 2.4, clip: (x, y) => y < 0 });
    for (const dx of [-2, 0, 2]) { g.set(cx + dx, 0, cz + 4, INK); g.set(cx + dx, 1, cz + 4, INK); }
    return g;
  };
  const legFL = leg(true), legBL = leg(false);
  const legFR = flipX(legFL), legBR = flipX(legBL);

  // ------------------------------------------------------------ tail: stubby tail tipped with a glowing fuel rod
  const TJ = [-0.5, 13, -10];
  const tail = G();
  chain(tail, [[-0.5, 13, -10], [-0.5, 15, -12.5], [-0.5, 18, -13.5]], [2.2, 1.8], K.fur);
  cyl(tail, 'y', -0.5, -13.5, 18, 18, 1.8, 1.8, K.stud);
  cyl(tail, 'y', -0.5, -13.5, 19, 22, 1.3, 1.3, GOO, { glow: true });
  cyl(tail, 'y', -0.5, -13.5, 23, 23, 1.8, 1.8, K.stud);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legFL', legFL, [-4.6, 9, 4]), jp('legFR', legFR, [3.6, 9, 4]), jp('legBL', legBL, [-4.6, 9, -7.5]), jp('legBR', legBR, [3.6, 9, -7.5]),
      jp('body', body, [-0.5, 0, 0]),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.14, 0, 0] }),
      jp('antennaL', earL, [-7.5, 24.5, 6], HJ, { parent: 'head' }),
      jp('antennaR', earR, [6.5, 24.5, 6], HJ, { parent: 'head' }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, 14, 20],
  };
}

// ===========================================================================
// Reactor Rex: a chunky violet T-rex tank with a glowing reactor heart caged
// in hazard-striped steel, radioactive crystal spikes down its spine, a huge
// toothy jaw, tiny arms and a massive tail that swipes everything.
function reactorRex() {
  const K = {
    scale: 0x7b3ee0, scaleD: 0x5626a8, scaleL: 0xa978ff, belly: 0xd9c8ff, bellyD: 0xb9a2f0,
    brow: 0x3a1878, steel: 0x8e97ad, steelD: 0x4e5670, core: GOO, coreHot: 0xf2ffd0, claw: 0xfff4e6,
  };
  const skin = (bellyFn) => (x, y, z) => (bellyFn(x, y, z) ? K.belly : n3(x, y, z, 4) < 0.05 ? K.scaleL : n3(x, y, z, 5) < 0.06 ? K.scaleD : K.scale);
  const spike = (g, base, tip, r) => {
    capsule(g, base, tip, r, 0.4, (x, y, z, t) => (t > 0.55 ? GOO_L : GOO));
    glowWhere(g, (x, y, z, c) => c === GOO_L);
  };

  // ------------------------------------------------------------ legs (huge thighs, clawed feet)
  const leg = G();
  blob(leg, -6.5, 10, -3, 3.8, 4.4, 4.4, skin(() => false), { p: 2.2 });
  capsule(leg, [-6.5, 7, -2], [-6.5, 3, -0.5], 2.6, 2.2, skin(() => false));
  rbox(leg, -9.5, 0, -3, -3.5, 2, 4, 1, K.scaleD);
  for (const x of [-9, -6.5, -4]) { capsule(leg, [x, 1, 4], [x, 0.5, 6], 0.9, 0.5, K.claw); }
  stamp(leg, ['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], { M: MAG }, { axis: '-x', y: 12, z: -1 });
  const legR = flipX(leg);

  // ------------------------------------------------------------ body + reactor heart + spine spikes
  const body = G();
  const bellyF = (x, y, z) => z >= 2 && y <= 21 && Math.abs(x + 0.5) <= 5;
  blob(body, -0.5, 13.5, -2.5, 7.8, 7, 8.4, skin(bellyF), { p: 2.2 });
  blob(body, -0.5, 19.5, 2, 6.6, 6, 5.6, skin(bellyF), { p: 2.2 });
  blob(body, -0.5, 11, 2, 6.6, 5.6, 6, skin(bellyF), { p: 2.2 }); // pot belly
  // belly scale ridges
  body.paint((x, y, z, c) => (c === K.belly && (y + 40) % 3 === 0 ? K.bellyD : undefined));
  // reactor heart: hazard band, steel cage ring and a glowing core bulging from the belly
  const RC = [-0.5, 11, 7];
  const ring = (x, y) => Math.hypot(x - RC[0], y - RC[1]);
  body.forEach((x, y, z) => {
    const d = ring(x, y);
    if (d <= 5.4 && d > 4.1 && z >= 3) {
      const a = Math.atan2(y - RC[1], x - RC[0]);
      body.set(x, y, z, (Math.floor((a + Math.PI) / (Math.PI / 6)) % 2) ? HAZ_Y : INK);
    }
  });
  cyl(body, 'z', RC[0], RC[1], 6, 9, 4.1, 4.1, K.steel, { hollow: 1.2 });
  for (let z = 5; z <= 8; z++) for (let x = -4; x <= 3; x++) for (let y = 7; y <= 15; y++) if (ring(x, y) < 3) body.set(x, y, z, K.core);
  blob(body, RC[0], RC[1], 8.5, 2.9, 2.9, 2.2, (x, y) => (ring(x, y) < 1.6 ? K.coreHot : K.core), { glow: true, clip: (x, y, z) => z < 8 });
  for (const a of [0, 1, 2, 3].map((i) => (i * Math.PI) / 2 + Math.PI / 4)) body.set(Math.round(RC[0] + Math.cos(a) * 3.6), Math.round(RC[1] + Math.sin(a) * 3.6), 10, K.steelD);
  // trefoil decals on both flanks
  stamp(body, TREFOIL_S, { Y: HAZ_Y, K: INK }, { axis: '-x', y: 17, z: -3 });
  stamp(body, rev(TREFOIL_S), { Y: HAZ_Y, K: INK }, { axis: 'x', y: 17, z: -7 });
  // glowing radioactive spine spikes
  for (const [z, h] of [[2, 3], [-2, 4.5], [-6, 5], [-10, 4]]) {
    const top = (() => { for (let y = 40; y > 0; y--) if (body.has(-1, y, z)) return y; return 18; })();
    spike(body, [-0.5, top - 1, z], [-0.5, top + h, z - 1.5], 1.7);
  }
  gradY(body, 4, 24, -0.12, 0.06, (x, y, z, c) => c === K.scale || c === K.scaleL || c === K.scaleD || c === K.belly);
  hollowOut(body, 2);

  // ------------------------------------------------------------ head (cranium + snout, upper teeth)
  const HJ = [-0.5, 23, 1];
  const head = G();
  const headSkin = skin(() => false);
  blob(head, -0.5, 27.5, 4, 8.4, 6.2, 7.2, headSkin, { p: 2.25 });
  blob(head, -0.5, 26, 11, 6.4, 4.6, 6.8, headSkin, { p: 2.3 });
  blob(head, -0.5, 24, 8, 7.8, 2.6, 7, headSkin, { p: 2.3 }); // upper lip mass
  // mouth: carve the bottom front and line it
  head.carve((x, y, z) => y <= 23 && z >= 3);
  head.carve((x, y) => y < 21);
  head.forEach((x, y, z) => { if (y === 24 && z >= 3 && !head.has(x, 23, z)) head.set(x, y, z, MOUTH); });
  head.forEach((x, y, z) => {
    if (y !== 24 || z < 3) return;
    const rim = !head.has(x, 24, z + 1) || !head.has(x + 1, 24, z) || !head.has(x - 1, 24, z);
    if (!rim) return;
    head.set(x, 23, z, TOOTH);
    if (((x + z + 40) % 2) === 0) head.set(x, 22, z, TOOTH);
  });
  for (let x = -9; x <= 8; x++) for (let y = 21; y <= 23; y++) if (head.has(x, y, 2)) head.set(x, y, 2, MOUTH);
  // nostrils
  sym(head, -2, 28, 18, K.scaleD); sym(head, -2, 28, 17, K.scaleD);
  // angry glowing eyes under a bony brow ridge
  for (const [cx, side] of [[-5.5, -1], [4.5, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 28.5) ?? 9) - 1;
    eyeBall(head, cx, 28.5, cz, [2.6, 3, 2], side, { pw: 2, ph: 2, inward: 0.5, browCol: K.brow, browT: 2, browOut: 1, browHi: 1.05, browLo: 0.3, white: 0xfff3a0 });
  }
  glowWhere(head, (x, y, z, c) => c === 0xfff3a0, 0xfff3a0);
  // magenta bolt marks on the cheeks + small glowing crown spikes
  stamp(head, ['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], { M: MAG }, { axis: '-x', y: 28, z: 6 });
  stamp(head, ['MM..', '.MM.', 'MMMM', '.MM.', '..MM'], { M: MAG }, { axis: 'x', y: 28, z: 3 });
  for (const s of [-1, 1]) spike(head, [s < 0 ? -4 : 3, 32, 2], [s < 0 ? -5 : 4, 34.5, 0.5], 1.1);
  gradY(head, 21, 33, -0.08, 0.06, (x, y, z, c) => c === K.scale || c === K.scaleL || c === K.scaleD);

  // ------------------------------------------------------------ jaw (lower jaw with up-teeth, opens wide)
  const JJ = [-0.5, 22.5, 2];
  const jaw = G();
  blob(jaw, -0.5, 21.2, 9.5, 7, 2.6, 7.8, (x, y) => (y <= 19 ? K.bellyD : K.belly), { p: 2.3 });
  jaw.carve((x, y) => y > 22);
  jaw.forEach((x, y, z) => {
    if (y !== 22) return;
    const rim = !jaw.has(x, 22, z + 1) || !jaw.has(x + 1, 22, z) || !jaw.has(x - 1, 22, z);
    if (rim) { jaw.set(x, 23, z, TOOTH); if (((x + z + 41) % 2) === 0) jaw.set(x, 24, z, TOOTH); }
    else jaw.set(x, y, z, Math.abs(x + 0.5) <= 2.6 && z <= 13 ? TONGUE : MOUTH);
  });

  // ------------------------------------------------------------ tiny arms
  const arm = G();
  capsule(arm, [-6, 20, 4], [-7.5, 17, 7.5], 1.5, 1.2, K.scale);
  for (const dx of [-0.8, 0.8]) capsule(arm, [-7.5 + dx, 16.8, 7.9], [-7.5 + dx * 1.3, 15.6, 9.1], 0.5, 0.35, K.claw);
  const armR = flipX(arm);

  // ------------------------------------------------------------ tail (swipes)
  const TJ = [-0.5, 13, -9];
  const tail = G();
  chain(tail, [[-0.5, 13, -8], [-0.5, 12, -14], [-0.5, 11, -20], [-0.5, 11.5, -25], [-0.5, 13, -29]], [5, 4, 3, 2, 1.1], (x, y, z) => (y <= 9 ? K.bellyD : n3(x, y, z, 6) < 0.1 ? K.scaleD : K.scale));
  // hazard band + spikes along the tail
  tail.forEach((x, y, z) => { if (z === -17 || z === -18) tail.set(x, y, z, ((x + y + 40) % 4) < 2 ? HAZ_Y : INK); });
  for (const [z, h, r] of [[-13, 3.5, 1.4], [-21, 3, 1.1], [-26, 2.2, 0.9]]) {
    const top = (() => { for (let y = 30; y > 0; y--) if (tail.has(-1, y, z)) return y; return 14; })();
    spike(tail, [-0.5, top - 1, z], [-0.5, top + h, z - 1.5], r);
  }
  hollowOut(tail, 2);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legL', leg, [-6.5, 12, -3]), jp('legR', legR, [5.5, 12, -3]),
      jp('body', body, [-0.5, 0, 0]),
      jp('armL', arm, [-6, 20, 4], [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, [5, 20, 4], [-0.5, 0, 0], { parent: 'body' }),
      jp('tail', tail, TJ, [-0.5, 0, 0], { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.3, 0, 0] }),
    ],
    muzzle: [-0.5, 24, 18],
  };
}

export const TOXIC_MODELS = {
  atomicSlime: () => slimeMold(1),
  miniSlime: () => slimeMold(0.6),
  plutoniumPup,
  reactorRex,
};
