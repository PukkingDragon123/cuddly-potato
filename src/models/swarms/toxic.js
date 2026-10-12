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

export const TOXIC_MODELS = {
  atomicSlime: () => slimeMold(1),
  miniSlime: () => slimeMold(0.6),
};
