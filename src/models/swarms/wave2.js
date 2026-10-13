// Wave 2 Swarms: Mega-Tech armour, Fire & Ice, Battle Fusion, more Home
// Horrors and the Special Edition Hard Head Panther. Hi-res (0.05) vinyl-toy
// sculpts in the MrBeast Lab Swarms house style: chunky chibi silhouettes, big
// angry faces with teeth, saturated colours, the magenta lightning bolt, and
// glow voxels only as small accents (eyes, cores, tips).
// See ../kit.js and ./panthers.js for the conventions (model faces +Z, y = 0 is
// the ground, x symmetric around -0.5, parts modelled in absolute coordinates
// and attached with jp() at their joints).
import { G, blob, rbox, capsule, chain, cyl, stamp, sym, gradY, n3, jp, shade, frontZ } from '../kit.js';
import { pantherMold, packPanther } from './panthers.js';

const INK = 0x15121f, WHITE = 0xffffff, MAG = 0xff1f9e, MAG_L = 0xff7ccc;
const MOUTH = 0x3a0a22, TONGUE = 0xff5a8a, TOOTH = 0xffffff;
const CHROME = 0xe0e6f0, CHROME_D = 0x9aa4b8, GUN = 0x353c52;
const BODYJ = [-0.5, 0, 0];

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}
/** Mirror pixel-art rows horizontally. */
const rev = (rows) => rows.map((r) => [...r].reverse().join(''));
const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
const BOLT_R = rev(BOLT);
const BOLT_S = ['.MM', 'MM.', 'MMM', '.MM', 'MM.'];

/** Remove interior voxels deeper than d from the surface (same look, fewer voxels). */
function hollowOut(g, d = 2) {
  const kill = [];
  g.forEach((x, y, z) => {
    for (let dx = -d; dx <= d; dx++) for (let dy = -d; dy <= d; dy++) for (let dz = -d; dz <= d; dz++) if (!g.has(x + dx, y + dy, z + dz)) return;
    kill.push([x, y, z]);
  });
  for (const [x, y, z] of kill) g.del(x, y, z);
  return g;
}

/**
 * Bulging cartoon eyeball on a front-facing surface with a slanted angry brow
 * slab that overhangs it (reads in profile too). side: -1 = model's left.
 * o: white, glow, pupil, pupilGlow, pw/ph, inward/down, browCol, browT,
 *    browHi/browLo (brow height at the outer/inner end as a fraction of ry),
 *    browOut (extra voxels past the outer edge), brow:false.
 */
function eyeBall(g, cx, cy, cz, r, side, o = {}) {
  const [rx, ry, rz] = r;
  const white = o.white ?? WHITE;
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
  stamp(g, art, { P: { c: o.pupil ?? INK, glow: !!o.pupilGlow }, G: { c: WHITE, glow: true } }, { axis: 'z', x: px, y: py, depth: 2, zmin: Math.floor(cz - 1), zmax: Math.ceil(cz + rz + 2) });
  if (o.brow !== false) {
    const bc = o.browCol ?? INK, bt = o.browT ?? 2, ext = o.browOut ?? 1;
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

/**
 * Spherical cartoon eyeball with an angry lid (painted above a slanted line),
 * a brow riding the lid and a stamped pupil. For eyes on the sides of a head.
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

/** Saw-tooth height (sharp zig-zag teeth) for index i. */
const saw = (i, max = 3) => {
  const per = max * 2 - 2 || 1;
  const k = ((i % per) + per) % per;
  return max - (k <= max - 1 ? k : per - k);
};

/**
 * Carve a roaring open mouth into the front (+z) surface. shape(x, y) -> true
 * inside the opening. The cavity is `depth` deep with a dark back wall, a
 * tongue and saw-tooth teeth hanging from the upper lip / rising from the lower.
 * o: depth, top / bot (max tooth length, 0 = none), period, lipCol, zmin/zmax.
 */
function openMouth(g, x0, x1, y0, y1, shape, o = {}) {
  const depth = o.depth ?? 3, tooth = o.tooth ?? TOOTH;
  const cells = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    if (!shape(x, y)) continue;
    const z = frontZ(g, x, y, o.zmin ?? -60, o.zmax ?? 60);
    if (z !== null) cells.push([x, y, z]);
  }
  const at = new Set(cells.map(([x, y]) => `${x},${y}`));
  if (o.lipCol !== undefined) {
    for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (at.has(`${x + dx},${y + dy}`)) continue;
      const z = frontZ(g, x + dx, y + dy, o.zmin ?? -60, o.zmax ?? 60);
      if (z !== null) g.set(x + dx, y + dy, z, o.lipCol);
    }
  }
  const cx = (x0 + x1) / 2;
  const colTop = {}, colBot = {};
  for (const [x, y, z] of cells) {
    for (let i = 0; i < depth; i++) g.del(x, y, z - i);
    const tongue = o.tongue !== false && y <= y0 + (o.tongueRows ?? 1) && Math.abs(x - cx) <= (o.tongueW ?? (x1 - x0) * 0.3);
    g.set(x, y, z - depth, tongue ? TONGUE : (o.back ?? MOUTH));
    if (tongue) g.set(x, y, z - depth + 1, TONGUE);
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
    for (let j = 0; j < tl; j++) for (let d = 1; d <= 2; d++) g.set(x, ty - j, tz - d, tooth);
    const bl = o.bot === 0 ? 0 : Math.min(o.bot ?? per - 1, saw(k + per - 1, per) - 1, Math.floor(span * 0.4));
    for (let j = 0; j < bl; j++) for (let d = 1; d <= 2; d++) g.set(x, by + j, bz - d, tooth);
  });
  return g;
}

/** A flickering flame tongue rising from (x, y, z): fat red base, glowing yellow tip. */
function flame(g, x, y, z, h, o = {}) {
  const lean = o.lean ?? -0.4, w = o.w ?? 1.5;
  for (let i = 0; i < h; i++) {
    const t = i / Math.max(1, h - 1);
    const r = Math.max(0.15, w * (1 - t * 0.85));
    const col = t > 0.8 ? 0xfff2a0 : t > 0.55 ? 0xffd23f : t > 0.25 ? 0xff8a1f : 0xff4a1a;
    blob(g, x + Math.sin(i * 1.7 + x * 0.9) * 0.35, y + i, z + lean * i, r, 0.5, r, col, { glow: !!o.glow && i === h - 1 });
  }
  return g;
}

/** Faceted ice crystal from a to b (radius r), white tip (optionally glowing). */
function crystal(g, a, b, r, o = {}) {
  const C = o.cols ?? [0x9ff2ff, 0xe8fdff, 0x5ac8f0];
  capsule(g, a, b, r, Math.max(0.2, r * 0.25), (x, y, z, t) => (t > 0.82 ? C[1] : C[(Math.abs(x * 3 + y * 5 + z * 7) >> 1) % 3]));
  const tx = Math.round(b[0]), ty = Math.round(b[1]), tz = Math.round(b[2]);
  g.set(tx, ty, tz, C[1], !!o.glow);
  return g;
}

/** Point in polygon (2D). */
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Distance from point to segment (2D). */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

/**
 * Tentacle: chain of capsules whose voxels on the `inner` side (unit vector)
 * get the underside colour with sucker dots, the rest the skin colour.
 */
function tentacle(g, pts, radii, inner, C) {
  const il = Math.hypot(...inner) || 1;
  const ix = inner[0] / il, iy = inner[1] / il, iz = inner[2] / il;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const r0 = radii[i], r1 = radii[i + 1];
    capsule(g, a, b, r0, r1, (x, y, z, t) => {
      const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t, pz = a[2] + (b[2] - a[2]) * t;
      const r = r0 + (r1 - r0) * t;
      const d = (x - px) * ix + (y - py) * iy + (z - pz) * iz;
      if (d > r * 0.35) return Math.abs(x * 3 + y * 5 + z * 7) % 6 === 0 && r > 1.1 ? C.sucker : C.under;
      return n3(x, y, z, 21) < 0.06 ? C.skinD : C.skin;
    });
  }
  return g;
}

// ===========================================================================
// Hard Head Panther (Special Edition): the Panther sculpt in royal purple with
// gold bolts, wearing a steel battering-ram helmet with curled gold ram horns.
// Tank: its headbutts knock enemies flying.
function hardHeadPanther() {
  const S = { fur: 0x8046e6, dark: 0x5424b8, light: 0xcab8f0, muzzle: 0xeee6fa, bolt: 0xffc93a, claw: INK, inner: 0xff59b8, nose: INK, iris: INK };
  const m = pantherMold(S);
  const hd = m.grids.head, b = m.grids.body;
  const STEEL = 0xb4bfd2, STEEL_D = 0x7d889e, STEEL_L = 0xe4eaf4, GOLD = 0xffc93a, GOLD_D = 0xd08a12;
  const isSteel = (c) => c === STEEL || c === STEEL_D || c === STEEL_L;
  const steel = (x, y, z) => (n3(x, y, z, 5) < 0.04 ? STEEL_D : y >= 30 ? STEEL_L : STEEL);
  // the ears tuck inside the helmet
  hd.carve((x, y) => y >= 28);
  // helmet dome hugging the skull; its brim overhangs the angry brows
  blob(hd, -0.5, 24.5, 7.5, 11.2, 7.6, 9.8, steel, { p: 2.4, clip: (x, y, z) => y < 25 || (z > 11 && y < 28) });
  hd.paint((x, y, z, c) => (isSteel(c) && (y === 25 || (z > 11 && y === 28)) ? GOLD : undefined));
  // the battering ram: a thick steel block on the forehead with a gold rim + magenta bolt
  rbox(hd, -7, 27, 12, 6, 33, 19, 2, steel);
  const RIM = [];
  for (let v = 0; v < 7; v++) {
    let r = '';
    for (let u = 0; u < 14; u++) r += v === 0 || v === 6 || u === 0 || u === 13 ? 'g' : '.';
    RIM.push(r);
  }
  stamp(hd, RIM, { g: GOLD }, { axis: 'z', x: -7, y: 33, zmin: 14 });
  stamp(hd, BOLT, { M: { c: MAG, raise: 1 } }, { axis: 'z', x: -3, y: 33, zmin: 16 });
  for (const [x, y] of [[-6, 32], [5, 32], [-6, 28], [5, 28]]) hd.set(x, y, (frontZ(hd, x, y, 10, 30) ?? 18) + 1, STEEL_L);
  // curled ram horns
  for (const s of [-1, 1]) {
    const X = (v) => (s < 0 ? v : -1 - v);
    const pts = [[-9.5, 28.5, 8], [-12.6, 30.5, 5], [-15.2, 29, 1.8], [-16.2, 25.4, 1], [-15, 22, 2.8], [-12.8, 21.6, 6]].map(([x, y, z]) => [X(x), y, z]);
    chain(hd, pts, [2.7, 2.5, 2.1, 1.7, 1.3, 0.7], (x, y, z) => ((Math.round(y * 0.8 + z * 0.6 + 40) & 1) ? GOLD : GOLD_D));
  }
  // gold-trimmed crest ridge running back from the ram
  rbox(hd, -1, 31, -1, 0, 32, 12, 0, GOLD);
  // steel shoulder pads with gold trim
  for (const s of [-1, 1]) {
    blob(b, s < 0 ? -6.5 : 5.5, 15, 4, 3.2, 2.4, 3.4, steel, { p: 2.4 });
    for (let z = 1; z <= 7; z++) { const x = s < 0 ? -9 : 8; for (const y of [14, 15]) if (b.has(x, y, z)) b.set(x, y, z, GOLD); }
  }
  // gold ring on the tail tip
  blob(m.grids.tail, -0.5, 22, -16.6, 2.2, 0.6, 2.2, GOLD);
  hollowOut(hd, 2);
  hollowOut(b, 2);
  return packPanther(m);
}

// ===========================================================================
// Volt Bat (Mega-Tech): a violet bat in chrome Mega-Tech armour. Tesla-coil
// ears crackle, swept-back wings carry yellow lightning veins, and it spits
// chain lightning from its fanged mouth. Flies.
function voltBat() {
  const K = {
    fur: 0x6446e6, furD: 0x4430c0, furL: 0x9a86f0, face: 0xbcaaf0, mem: 0x7438e0, memD: 0x5624bc, vein: 0xffd23f,
    armor: 0x3d8bff, armorD: 0x1f52c0, cyan: 0x5ff6ff, ear: 0xff7ab8, claw: 0xf4f0ff,
  };
  const furCol = (x, y, z) => (n3(x, y, z, 2) < 0.08 ? K.furD : K.fur);

  // ------------------------------------------------------------ torso + armour
  const body = G();
  blob(body, -0.5, 10.5, -1, 5.2, 5, 4.4, furCol, { p: 2.2 });
  rbox(body, -4, 7, 1, 3, 13, 4, 1.5, (x, y) => (y >= 12 ? CHROME : K.armor));
  rbox(body, -3, 6, 0, 2, 7, 3, 0, K.armorD);
  stamp(body, ['CC', 'CC'], { C: { c: K.cyan, glow: true } }, { axis: 'z', x: -1, y: 11, zmin: 2 }); // reactor core
  sym(body, -3, 10, 5, CHROME); sym(body, -3, 9, 5, CHROME);
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 13, z: 0 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 13, z: -4 });

  // ------------------------------------------------------------ dangling feet
  const foot = G();
  capsule(foot, [-2.5, 7, -1], [-3, 3.5, -0.5], 1.1, 0.9, K.furD);
  for (const dx of [-1, 0, 1]) foot.set(-3 + dx, 2, 0, K.claw), foot.set(-3 + dx, 3, 0, K.claw);
  const footR = flipX(foot);

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 14, 0];
  const head = G();
  blob(head, -0.5, 19.5, 0.5, 7.6, 6.6, 6.6, furCol, { p: 2.25 });
  head.paint((x, y, z, c) => (z >= 3 && y <= 19 && Math.abs(x + 0.5) <= 5.2 ? K.face : undefined));
  blob(head, -0.5, 16.5, 6.5, 3.6, 2.4, 2.4, K.face, { p: 2.2 }); // snout
  // magenta leaf nose
  capsule(head, [-0.5, 18, 8.6], [-0.5, 20.6, 8.2], 1.2, 0.5, MAG);
  sym(head, -1, 17, 9, MOUTH);
  // eyes
  for (const [cx, side] of [[-4.4, -1], [3.4, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 21) ?? 6) - 1;
    eyeBall(head, cx, 21, cz, [2.2, 2.5, 1.8], side, { pw: 2, ph: 2, inward: 0.6, down: 0.4, browCol: K.furD, browT: 2, browHi: 1.35, browLo: 0.05, browOut: 0 });
  }
  // open mouth with two big fangs
  head.carve((x, y, z) => y >= 12 && y <= 15 && z >= 4 && Math.abs(x + 0.5) <= 3.6);
  head.carve((x, y) => y < 12);
  for (let x = -4; x <= 3; x++) {
    for (let y = 12; y <= 15; y++) if (head.has(x, y, 3)) head.set(x, y, 3, MOUTH);
    let fz = 0;
    for (let z = 12; z >= 4; z--) if (head.has(x, 16, z)) { fz = z; break; }
    if (!fz) continue;
    for (let z = 4; z < fz; z++) head.set(x, 16, z, MOUTH);
    head.set(x, 15, fz, TOOTH);
    if (x === -3 || x === 2) for (let y = 12; y <= 15; y++) head.set(x, y, fz, TOOTH);
  }
  // Mega-Tech helmet cap with a magenta bolt
  blob(head, -0.5, 24.6, -0.5, 6, 2.6, 5.6, (x, y, z) => (z >= 3 && y <= 24 ? K.armor : CHROME), { p: 2.4, clip: (x, y) => y < 23 });
  stamp(head, BOLT_S, { M: { c: MAG, raise: 1 } }, { axis: 'y', x: -2, z: -2 });
  gradY(head, 12, 27, -0.08, 0.06, (x, y, z, c) => c === K.fur || c === K.furD);

  // ------------------------------------------------------------ jaw
  const JJ = [-0.5, 15, 2];
  const jaw = G();
  blob(jaw, -0.5, 13, 5, 4, 1.8, 3.4, K.face, { p: 2.3 });
  jaw.carve((x, y) => y > 13);
  for (let x = -4; x <= 3; x++) for (let z = 2; z <= 9; z++) if (jaw.has(x, 13, z)) jaw.set(x, 13, z, Math.abs(x + 0.5) <= 1.5 ? TONGUE : MOUTH);
  for (const x of [-2, 1]) { let fz = 0; for (let z = 10; z >= 2; z--) if (jaw.has(x, 13, z)) { fz = z; break; } if (fz) jaw.set(x, 14, fz, TOOTH); }

  // ------------------------------------------------------------ tesla-coil ears (wobble)
  const earL = G();
  capsule(earL, [-5, 24, 0], [-9.5, 32, -1], 3, 0.9, K.fur);
  capsule(earL, [-5.3, 24.5, 1.6], [-9, 30.5, 0.6], 1.7, 0.4, K.ear);
  for (const [x, y, z] of [[-7.4, 28, -0.4], [-8.4, 30, -0.7]]) blob(earL, x, y, z, 1.9, 0.6, 1.9, CHROME);
  blob(earL, -9.8, 33, -1, 0.6, 1.2, 0.6, K.cyan, { glow: true });
  const earR = flipX(earL);

  // ------------------------------------------------------------ wings: swept back so they read from the side
  const wing = G();
  const SW = 40 * Math.PI / 180;
  const map = (u, v) => [-5 - u * Math.cos(SW), v, -1 - u * Math.sin(SW)];
  const S0 = [0, 13.5], E = [7, 22], T1 = [16.5, 25], T2 = [19.5, 15], T3 = [14, 7], T4 = [5, 7.5];
  const poly = [S0, E, T1, T2, T3, T4];
  const scallops = [[T1, T2], [T2, T3], [T3, T4]].map(([a, c]) => {
    const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const cx = (S0[0] + E[0] + T1[0] + T2[0] + T3[0] + T4[0]) / 6, cy = (S0[1] + E[1] + T1[1] + T2[1] + T3[1] + T4[1]) / 6;
    const ox = mx - cx, oy = my - cy, ol = Math.hypot(ox, oy);
    const r = L * 0.42;
    return [mx + (ox / ol) * (r - 1.8), my + (oy / ol) * (r - 1.8), r];
  });
  const VEIN = [[5, 17], [9, 15.5], [8, 13.5], [13, 11]];
  for (let u = 0.5; u <= 20; u += 0.35) for (let v = 6; v <= 26; v += 0.5) {
    if (!inPoly(u, v, poly)) continue;
    if (scallops.some(([cx, cy, r]) => Math.hypot(u - cx, v - cy) < r)) continue;
    let vd = 9;
    for (let i = 0; i < VEIN.length - 1; i++) vd = Math.min(vd, segDist(u, v, VEIN[i][0], VEIN[i][1], VEIN[i + 1][0], VEIN[i + 1][1]));
    const [x, y, z] = map(u, v);
    wing.set(Math.round(x), Math.round(y), Math.round(z), vd < 0.9 ? K.vein : (Math.round(u + v) % 5 === 0 ? K.memD : K.mem));
  }
  // chrome bones + claw
  const bone = (a, c, r0, r1, col) => capsule(wing, map(...a), map(...c), r0, r1, col);
  bone(S0, E, 1.1, 0.9, CHROME); bone(E, T1, 0.6, 0.3, K.furD); bone(E, T2, 0.55, 0.3, K.furD); bone(E, T3, 0.55, 0.3, K.furD);
  const [ex, ey, ez] = map(...E);
  blob(wing, ex, ey, ez, 1.3, 1.3, 1.3, K.armor);
  capsule(wing, [ex, ey + 1, ez], [ex - 0.5, ey + 3.4, ez + 0.6], 0.7, 0.3, K.claw);
  const wingR = flipX(wing);

  return {
    gait: 'float', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('body', body, BODYJ),
      jp('legL', foot, [-2.5, 7, -1], BODYJ, { parent: 'body' }),
      jp('legR', footR, [1.5, 7, -1], BODYJ, { parent: 'body' }),
      jp('wingL', wing, [-5, 13.5, -1], BODYJ, { parent: 'body' }),
      jp('wingR', wingR, [4, 13.5, -1], BODYJ, { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.15, 0, 0] }),
      jp('antennaL', earL, [-5, 24, 0], HJ, { parent: 'head' }),
      jp('antennaR', earR, [4, 24, 0], HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, 15, 9],
  };
}

// ===========================================================================
// Mecha Mantis (Mega-Tech): a lime-green mantis in blue + chrome Mega-Tech
// plating. Bulging angry eyes, a fanged mouth, and two chrome scythe arms with
// serrated magenta edges held up like a boxer's guard.
function mechaMantis() {
  const K = {
    g: 0x5ad84a, gD: 0x23903a, gL: 0xb6ff8a, belly: 0xdcffb8, armor: 0x3d8bff, armorD: 0x1f52c0,
    eye: 0xeeffa8, wing: 0xaef4c0, wingD: 0x62c88a,
  };
  const gCol = (x, y, z) => (n3(x, y, z, 6) < 0.07 ? K.gD : K.g);

  // ------------------------------------------------------------ body: thorax + segmented abdomen + folded wings
  const body = G();
  blob(body, -0.5, 10.5, -10, 4.6, 3.8, 8, gCol, { p: 2.2 });
  blob(body, -0.5, 11.5, -18, 2.6, 2.4, 2.4, gCol);
  // armour bands on the abdomen
  body.paint((x, y, z, c) => {
    if (z > -3 || z < -18) return undefined;
    const band = ((z + 40) % 4);
    if (y >= 11 && band === 0) return CHROME;
    if (y >= 11) return K.armor;
    if (y <= 8) return K.belly;
    return undefined;
  });
  // folded wings lying on the back
  for (let z = -16; z <= -2; z++) for (let x = -4; x <= 3; x++) {
    const t = (z + 16) / 14;
    const half = 3.6 - Math.abs(t - 0.5) * 2;
    if (Math.abs(x + 0.5) > half) continue;
    let top = -1;
    for (let y = 20; y >= 5; y--) if (body.has(x, y, z)) { top = y; break; }
    if (top < 0) continue;
    body.set(x, top + 1, z, (x === -1 || x === 0 || (z + 40) % 5 === 0) ? K.wingD : K.wing);
  }
  // thorax rising up to the head + Mega-Tech chest plate
  capsule(body, [-0.5, 10, -2], [-0.5, 18.5, 1.5], 3.2, 2.6, gCol);
  rbox(body, -3, 12, 2, 2, 18, 4, 1, (x, y) => (y >= 17 ? CHROME : K.armor));
  stamp(body, BOLT_S, { M: { c: MAG, raise: 1 } }, { axis: 'z', x: -2, y: 17, zmin: 2 });
  body.set(-1, 13, 5, 0x5ff6ff); body.set(0, 13, 5, 0x5ff6ff, true);
  for (const s of [-1, 1]) blob(body, s < 0 ? -4 : 3, 17.5, 1.5, 1.8, 1.8, 1.8, CHROME_D);

  // ------------------------------------------------------------ head: wide triangular head, bulging eyes on the corners
  const HJ = [-0.5, 19.5, 1.5];
  const head = G();
  blob(head, -0.5, 24, 3.5, 6.2, 3.6, 3.8, gCol, { p: 2.2 });
  blob(head, -0.5, 21, 4.5, 3.6, 2.8, 3, gCol, { p: 2.2 });
  // forehead plate
  rbox(head, -3, 26, 2, 2, 27, 6, 1, CHROME);
  stamp(head, ['MM.', '.MM', 'MM.'], { M: MAG }, { axis: 'y', x: -2, z: 3 });
  orbEye(head, -5.4, 25, 4.4, 2.9, -1, { white: K.eye, lid: K.gD, browCol: GUN, slant: 0.45, lift: 0.4, pw: 2, ph: 3, inward: 0.4, browR: 0.9 });
  orbEye(head, 4.4, 25, 4.4, 2.9, 1, { white: K.eye, lid: K.gD, browCol: GUN, slant: 0.45, lift: 0.4, pw: 2, ph: 3, inward: 0.4, browR: 0.9 });
  // mouth
  head.carve((x, y, z) => y <= 20 && z >= 5 && Math.abs(x + 0.5) <= 2.6);
  for (let x = -3; x <= 2; x++) {
    for (let y = 18; y <= 20; y++) if (head.has(x, y, 4)) head.set(x, y, 4, MOUTH);
    let fz = 0;
    for (let z = 10; z >= 4; z--) if (head.has(x, 21, z)) { fz = z; break; }
    if (fz) { head.set(x, 20, fz, TOOTH); if ((x + 3) % 2 === 0) head.set(x, 19, fz, TOOTH); }
  }
  // lower mandibles + chin
  const JJ = [-0.5, 19.5, 4];
  const jaw = G();
  blob(jaw, -0.5, 18.4, 6, 2.8, 1.4, 2.4, K.gL, { p: 2.2 });
  jaw.carve((x, y) => y > 19);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -2.5 : 1.5;
    capsule(jaw, [x0, 18.5, 7], [x0 + s * 1.2, 18.6, 9.4], 0.8, 0.5, K.gD);
    jaw.set(Math.round(x0 + s * 0.5), 19, 9, TOOTH);
  }
  for (let x = -2; x <= 1; x++) jaw.set(x, 19, 7, (x & 1) ? MOUTH : TOOTH);

  // antennae
  const antL = G();
  capsule(antL, [-2, 27, 4], [-5.5, 33, 1], 0.5, 0.4, K.gD);
  capsule(antL, [-5.5, 33, 1], [-7.5, 35, -1], 0.4, 0.3, K.gD);
  antL.set(-8, 35, -1, MAG, true);
  const antR = flipX(antL);

  // ------------------------------------------------------------ scythe arms (raised guard; slash on attack)
  const arm = G();
  // upper arm reaching up-forward to the wrist, armoured
  capsule(arm, [-4, 17.5, 1.5], [-8.5, 22, 4.5], 1.7, 1.5, K.armor);
  rbox(arm, -9, 19, 1, -6, 21, 4, 1, CHROME);
  blob(arm, -9.5, 22.5, 5, 1.9, 1.9, 1.9, CHROME_D);
  // the scythe: a flat (2 thick) sickle hanging forward from the wrist, serrated magenta inner edge
  const BLADE = [[24, 4], [25, 7.5], [24, 11], [21.5, 14], [17.5, 15.5], [16, 15.6], [18.5, 13], [21, 10.5], [21.8, 7.6], [21.2, 5]];
  for (let y = 14; y <= 26; y++) for (let z = 3; z <= 17; z++) {
    if (!inPoly(y + 0.5, z + 0.5, BLADE)) continue;
    const edge = !inPoly(y - 0.5, z + 0.5, BLADE);
    const spine = !inPoly(y + 1.5, z + 0.5, BLADE);
    for (const x of [-11, -10]) arm.set(x, y, z, edge ? MAG : spine ? CHROME_D : CHROME);
    if (edge && z >= 7 && (z & 1)) for (const x of [-11, -10]) arm.set(x, y - 1, z, TOOTH);
  }
  const armR = flipX(arm);

  // ------------------------------------------------------------ walking legs (thin mech legs)
  const leg = (zh, zk, zf) => {
    const g = G();
    capsule(g, [-3, 10, zh], [-9, 13.5, zk], 1.1, 0.9, K.g);
    blob(g, -9, 13.5, zk, 1.3, 1.3, 1.3, CHROME_D);
    capsule(g, [-9, 13.5, zk], [-11, 1.5, zf], 0.9, 0.7, K.armor);
    rbox(g, -12, 0, zf - 1, -10, 1, zf + 1, 0, GUN);
    g.set(-11, 0, zf + 2, MAG);
    return g;
  };
  const legFL = leg(0, 2, 4), legBL = leg(-6, -8, -12);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legFL', legFL, [-3, 10, 0]), jp('legFR', flipX(legFL), [2, 10, 0]),
      jp('legBL', legBL, [-3, 10, -6]), jp('legBR', flipX(legBL), [2, 10, -6]),
      jp('body', body, BODYJ),
      jp('armL', arm, [-4, 17.5, 1.5], BODYJ, { parent: 'body' }),
      jp('armR', armR, [3, 17.5, 1.5], BODYJ, { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.1, 0, 0] }),
      jp('antennaL', antL, [-2, 27, 4], HJ, { parent: 'head' }),
      jp('antennaR', antR, [1, 27, 4], HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, 20, 10],
  };
}

// ===========================================================================
// Cyber Croc (Mega-Tech): a chunky armoured crocodile. Blue Mega-Tech scute
// plates down its back, one angry eye and one glowing red cyber lens, chrome
// hydraulic jaws lined with teeth, armoured boots and a blade-tipped tail.
function cyberCroc() {
  const K = {
    skin: 0x3aae4c, skinD: 0x1f7a34, skinL: 0x86e070, belly: 0xeef4b0, bellyD: 0xc8d888, armor: 0x3d8bff, armorD: 0x1f52c0, armorL: 0x8ac4ff,
    red: 0xff2f45, eye: 0xffe14a, cyan: 0x5ff6ff, gum: 0xff5a8a,
  };
  const skin = (x, y, z) => (n3(x, y, z, 8) < 0.05 ? K.skinD : K.skin);
  const isSkin = (c) => c === K.skin || c === K.skinD;

  // ------------------------------------------------------------ body
  const body = G();
  blob(body, -0.5, 11, -3, 7.6, 5.6, 8.6, skin, { p: 2.3 });
  body.paint((x, y, z) => (y <= 7 ? ((z + 40) % 3 === 0 ? K.bellyD : K.belly) : undefined));
  // Mega-Tech armour: blue scute plates with chrome rims, a stubby spike on each and a few glowing vents
  for (const z of [-10, -5.5, -1]) {
    blob(body, -0.5, 14.5, z, 6.4, 2.6, 2.2, (x, y, zz) => (Math.abs(zz - z) >= 1.6 || Math.abs(x + 0.5) >= 5.6 ? CHROME : y >= 16 ? K.armorL : K.armor), { p: 3, clip: (x, y) => y < 14 });
    for (const x of [-1, 0]) { body.set(x, 17, Math.round(z), GUN); body.set(x, 18, Math.round(z), GUN); body.set(x, 17, Math.round(z) - 1, GUN); }
  }
  for (const z of [-8, -3]) sym(body, -4, 16, z, K.cyan, true);
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 12, z: -2 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 12, z: -4 });
  gradY(body, 5, 16, -0.12, 0.05, (x, y, z, c) => isSkin(c));
  hollowOut(body, 2);

  // ------------------------------------------------------------ head (skull + upper jaw)
  const HJ = [-0.5, 12, 4];
  const head = G();
  blob(head, -0.5, 15, 8, 7, 5, 5.4, skin, { p: 2.3 });
  blob(head, -0.5, 13.8, 15.5, 5.4, 2.6, 7.6, skin, { p: 2.6 }); // long flat snout
  blob(head, -0.5, 15.4, 22, 2.6, 1.4, 1.8, skin); // nostril bump
  sym(head, -1, 16, 23, INK);
  for (const cx of [-4.4, 3.4]) blob(head, cx, 19.5, 9.5, 3.6, 3.4, 3.6, skin); // eye turrets
  // mouth line: below y = 12 on the snout belongs to the lower jaw
  head.carve((x, y, z) => y <= 11 && z >= 8);
  head.carve((x, y) => y < 10);
  // gum line + big separate teeth along the jaw (iconic in profile)
  head.forEach((x, y, z, c) => {
    if (y !== 12 || z < 9) return;
    const rim = !head.has(x + 1, 12, z) || !head.has(x - 1, 12, z) || !head.has(x, 12, z + 1);
    if (!rim) { head.set(x, 12, z, MOUTH); return; }
    if ((x + z + 40) % 3 === 0) { head.set(x, 11, z, TOOTH); head.set(x, 10, z, TOOTH); }
  });
  for (let x = -6; x <= 5; x++) for (let y = 10; y <= 11; y++) if (head.has(x, y, 8)) head.set(x, y, 8, MOUTH);
  // left: angry yellow croc eye with a slit pupil; right: glowing red cyber lens in a chrome socket
  orbEye(head, -4.4, 20, 11.5, 3, -1, { white: K.eye, lid: K.skinD, browCol: GUN, slant: 0.5, lift: 0.4, pw: 2, ph: 4, inward: 0.3, browR: 1 });
  blob(head, 3.4, 20, 11.5, 3.2, 3.2, 2.6, CHROME);
  blob(head, 3.4, 20, 12.5, 2.2, 2.2, 1.8, K.red, { glow: true, clip: (x, y, z) => z < 14 });
  head.set(2, 21, 14, 0xffe0e0, true);
  capsule(head, [6.6, 23, 12], [1.2, 21.8, 14.4], 0.9, 0.9, GUN);
  // Mega-Tech skull plate + snout plate with rivets
  rbox(head, -3, 19, 2, 2, 20, 7, 1, CHROME);
  stamp(head, BOLT_S, { M: MAG }, { axis: 'y', x: -2, z: 2 });
  rbox(head, -3, 16, 12, 2, 16, 19, 0, K.armor);
  for (let z = 12; z <= 18; z += 3) sym(head, -3, 17, z, CHROME);
  gradY(head, 10, 22, -0.08, 0.06, (x, y, z, c) => isSkin(c));

  // ------------------------------------------------------------ lower jaw + hydraulic hinge
  const JJ = [-0.5, 12, 6];
  const jaw = G();
  blob(jaw, -0.5, 10, 14.5, 4.8, 2.4, 8.6, (x, y) => (y <= 9 ? K.bellyD : K.belly), { p: 2.6 });
  jaw.carve((x, y) => y > 11);
  jaw.forEach((x, y, z) => {
    if (y !== 11) return;
    const rim = !jaw.has(x + 1, 11, z) || !jaw.has(x - 1, 11, z) || !jaw.has(x, 11, z + 1);
    if (rim && z >= 8) { jaw.set(x, 11, z, K.gum); if ((x + z + 41) % 3 === 0) { jaw.set(x, 12, z, TOOTH); jaw.set(x, 13, z, TOOTH); } }
    else jaw.set(x, y, z, Math.abs(x + 0.5) <= 2 && z <= 19 ? TONGUE : MOUTH);
  });
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -6 : 4, x1 = s < 0 ? -5 : 5;
    cyl(jaw, 'x', 12, 6, x0, x1, 1.8, 1.8, CHROME_D);
    capsule(jaw, [s < 0 ? -5.5 : 4.5, 12, 6], [s < 0 ? -5 : 4, 10.5, 11], 0.7, 0.7, CHROME);
  }

  // ------------------------------------------------------------ legs with armoured boots
  const leg = (front) => {
    const g = G();
    const cz = front ? 4 : -8;
    if (!front) blob(g, -6, 10, cz, 3, 3.2, 3.2, skin);
    capsule(g, [-6, 11, cz], [-7.5, 4, cz + 0.5], 2.4, 2.1, skin);
    rbox(g, -10, 0, cz - 2, -5, 4, cz + 3, 1, (x, y) => (y >= 3 ? K.armor : K.armorD));
    for (const dx of [-2, 0, 2]) g.set(-7.5 + dx, 0, cz + 4, TOOTH), g.set(-7.5 + dx, 1, cz + 4, TOOTH);
    return g;
  };
  const legFL = leg(true), legBL = leg(false);

  // ------------------------------------------------------------ tail with spikes and a chrome blade fin
  const TJ = [-0.5, 11, -11];
  const tail = G();
  chain(tail, [[-0.5, 11, -11], [-0.5, 10.5, -15.5], [-0.5, 10, -19.5], [-0.5, 10.5, -23]], [4.2, 3.2, 2.2, 1.2], skin);
  for (const z of [-14, -18]) {
    let top = 12;
    for (let y = 18; y >= 0; y--) if (tail.has(-1, y, z)) { top = y; break; }
    for (const x of [-1, 0]) { tail.set(x, top + 1, z, GUN); tail.set(x, top + 2, z, GUN); }
  }
  const FIN = [[9, -22], [15, -25], [14, -28.5], [10.5, -27.5], [8, -25]];
  for (let y = 7; y <= 16; y++) for (let z = -30; z <= -21; z++) if (inPoly(y + 0.5, z + 0.5, FIN)) for (const x of [-1, 0]) tail.set(x, y, z, y >= 14 ? MAG : CHROME);
  tail.paint((x, y, z, c) => (y <= 9 && isSkin(c) ? K.belly : undefined));

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legFL', legFL, [-6, 11, 4]), jp('legFR', flipX(legFL), [5, 11, 4]),
      jp('legBL', legBL, [-6, 11, -8]), jp('legBR', flipX(legBL), [5, 11, -8]),
      jp('body', body, BODYJ),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.12, 0, 0] }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, 12, 23],
  };
}

// ===========================================================================
// Pixel Pups (Mega-Tech): blocky 8-bit puppies that escaped a game console.
// Boxy chibi sculpt, dithered shading, square angry eyes, a magenta collar with
// a gold bolt tag and cyan/magenta RGB-split glitches on the silhouette.
function pixelPups() {
  const K = { fur: 0xffc83a, furD: 0xe0901a, furL: 0xffe88a, spot: 0xb8601a, cream: 0xfff4d0, cyan: 0x3af2ff, mag: 0xff3ad8, gold: 0xffd23f };
  const furCol = (x, y) => (y >= 21 ? K.furL : y <= 6 ? K.furD : K.fur);
  const spots = (g, list) => { for (const [x0, y0, z0, x1, y1, z1] of list) g.paint((x, y, z, c) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1 ? K.spot : undefined)); };
  // glitch: a horizontal slice of the sculpt is knocked sideways like a torn scanline,
  // leaving a cyan sliver behind it and a magenta one ahead (RGB split)
  const glitch = (g, y0, y1, dx, zMin = -99) => {
    const moved = [];
    g.forEach((x, y, z, c, glow) => { if (y >= y0 && y <= y1 && z >= zMin) moved.push([x, y, z, c, glow]); });
    for (const [x, y, z] of moved) g.del(x, y, z);
    const ends = new Map();
    for (const [x, y, z, c, glow] of moved) {
      g.set(x + dx, y, z, c, glow);
      const k = `${y},${z}`, e = ends.get(k) ?? [1e9, -1e9];
      ends.set(k, [Math.min(e[0], x), Math.max(e[1], x)]);
    }
    for (const [k, [lo, hi]] of ends) {
      const [y, z] = k.split(',').map(Number);
      if (dx > 0) { g.set(lo, y, z, K.cyan); g.set(hi + dx + 1, y, z, K.mag); } else { g.set(hi, y, z, K.mag); g.set(lo + dx - 1, y, z, K.cyan); }
    }
  };

  // ------------------------------------------------------------ body
  const body = G();
  rbox(body, -5, 5, -9, 4, 12, 2, 2, furCol);
  body.paint((x, y, z) => (y <= 6 && Math.abs(x + 0.5) <= 3 ? K.cream : undefined));
  spots(body, [[-6, 9, -7, -3, 12, -4], [1, 10, -5, 5, 13, -2], [-3, 11, -9, 0, 13, -7]]);
  rbox(body, -5, 10, 0, 4, 13, 3, 1, MAG); // collar
  rbox(body, -2, 7, 3, 1, 10, 4, 0, K.gold); // bolt tag
  body.set(-1, 9, 5, MAG); body.set(0, 9, 5, MAG); body.set(-1, 8, 5, MAG);
  glitch(body, 8, 8, -1);

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 11, 0];
  const head = G();
  rbox(head, -8, 11, -3, 7, 23, 8, 2.5, furCol);
  rbox(head, -4, 11, 8, 3, 16, 13, 1.5, K.cream); // snout
  rbox(head, -2, 15, 13, 1, 17, 14, 0.5, INK); // nose
  head.set(-2, 17, 15, WHITE, true);
  spots(head, [[3, 18, -3, 8, 23, 3], [-8, 20, 0, -5, 23, 4]]);
  // square pixel eyes with blocky angry brows
  const EYE_L = [
    'BB......',
    '.BBBB...',
    '.WWBBBB.',
    '.WWWPPW.',
    '.WWWPPW.',
    '.WWWGPW.',
    '..WWWW..',
  ];
  stamp(head, EYE_L, { B: { c: INK, raise: 1 }, W: WHITE, P: INK, G: { c: WHITE, glow: true } }, { axis: 'z', x: -8, y: 22, mirror: true, zmin: 4 });
  // open mouth under the snout: blocky teeth
  head.carve((x, y, z) => y <= 12 && z >= 9 && Math.abs(x + 0.5) <= 3);
  for (let x = -4; x <= 3; x++) {
    for (let y = 11; y <= 12; y++) if (head.has(x, y, 8)) head.set(x, y, 8, MOUTH);
    let fz = 0;
    for (let z = 15; z >= 9; z--) if (head.has(x, 13, z)) { fz = z; break; }
    if (fz && Math.abs(x + 0.5) <= 3) { head.set(x, 12, fz, TOOTH); if (x === -3 || x === 2) head.set(x, 11, fz, TOOTH); }
  }
  glitch(head, 19, 20, 1);
  head.set(-9, 18, 3, K.cyan, true); head.set(8, 21, 1, K.mag, true); // dead pixels

  // ------------------------------------------------------------ jaw (blocky, tongue lolling)
  const JJ = [-0.5, 11, 7];
  const jaw = G();
  rbox(jaw, -4, 8, 7, 3, 10, 12, 1, K.cream);
  for (let x = -3; x <= 2; x++) for (let z = 8; z <= 11; z++) jaw.set(x, 10, z, Math.abs(x + 0.5) <= 1.5 ? TONGUE : MOUTH);
  for (const x of [-3, 2]) jaw.set(x, 11, 11, TOOTH);
  rbox(jaw, -2, 8, 12, 1, 9, 14, 0, TONGUE); // tongue lolling out

  // ------------------------------------------------------------ floppy square ears (wobble)
  const earL = G();
  rbox(earL, -11, 13, 0, -8, 22, 5, 1, K.furD);
  rbox(earL, -11, 14, 3, -10, 20, 4, 0, K.spot);
  const earR = flipX(earL);

  // ------------------------------------------------------------ legs + tail
  const leg = (cz) => {
    const g = G();
    rbox(g, -5, 0, cz - 1, -2, 7, cz + 2, 1, furCol);
    rbox(g, -5, 0, cz, -2, 1, cz + 3, 0, K.cream);
    return g;
  };
  const legFL = leg(0), legBL = leg(-8);
  const TJ = [-0.5, 10, -8];
  const tail = G();
  rbox(tail, -1, 10, -11, 0, 17, -9, 0.5, K.fur);
  rbox(tail, -1, 16, -12, 0, 18, -10, 0, K.cream);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.015, finish: 'gloss',
    parts: [
      jp('legFL', legFL, [-3.5, 7, 0.5]), jp('legFR', flipX(legFL), [2.5, 7, 0.5]),
      jp('legBL', legBL, [-3.5, 7, -7.5]), jp('legBR', flipX(legBL), [2.5, 7, -7.5]),
      jp('body', body, BODYJ),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.1, 0, 0] }),
      jp('antennaL', earL, [-9.5, 22, 2.5], HJ, { parent: 'head' }),
      jp('antennaR', earR, [8.5, 22, 2.5], HJ, { parent: 'head' }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, 13, 15],
  };
}

// ===========================================================================
// Ember Wolf (Fire & Ice): a red-hot wolf with a mane of fire licking back from
// its head, obsidian lava-rock armour with glowing cracks, charred "socks",
// angry yellow eyes, huge fangs and a flame-tipped tail.
function emberWolf() {
  const K = { fur: 0xe8462a, furD: 0xa82418, furL: 0xffb070, muzzle: 0xffc27a, rock: 0x3a2a2e, rockD: 0x221a1e, lava: 0xff7a1a, eye: 0xffffff, inner: 0xffb03a };
  const fur = (x, y, z) => (n3(x, y, z, 4) < 0.08 ? K.furD : K.fur);
  const crack = (g, pts) => { for (const [x, y, z] of pts) g.set(x, y, z, K.lava, true); };

  // ------------------------------------------------------------ body
  const body = G();
  blob(body, -0.5, 12, -2.5, 5.6, 4.8, 8.6, fur, { p: 2.3 });
  blob(body, -0.5, 13.5, 4.5, 5.2, 5.2, 4.2, fur, { p: 2.2 });
  body.paint((x, y, z) => (y <= 8 && Math.abs(x + 0.5) <= 3.6 ? K.furL : z >= 6 && y <= 13 && Math.abs(x + 0.5) <= 3 ? K.furL : undefined));
  // obsidian armour on the hips and shoulders with glowing lava cracks
  for (const s of [-1, 1]) {
    const x = s < 0 ? -4.5 : 3.5;
    blob(body, x, 13.5, -8, 2, 2.4, 2.6, (xx, yy, zz) => (n3(xx, yy, zz, 9) < 0.3 ? K.rockD : K.rock), { p: 3 });
    blob(body, x, 15.5, 3, 1.8, 2, 2.4, (xx, yy, zz) => (n3(xx, yy, zz, 9) < 0.3 ? K.rockD : K.rock), { p: 3 });
  }
  crack(body, [[-7, 13, -8], [-7, 14, -9], [6, 13, -8], [6, 14, -7], [-7, 15, 3], [6, 16, 3]]);
  // flame mane licking back over the shoulders
  for (const [x, z, h, gl] of [[-2, 3, 6], [1, 3, 6], [-0.5, 1, 7, 1], [-2.5, -1, 5], [1.5, -1, 5], [-0.5, -3, 5, 1], [-1.5, -6, 4], [0.5, -8, 3]]) flame(body, x, 16, z, h, { w: 1.5, glow: !!gl });
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 12, z: -2 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 12, z: -6 });
  gradY(body, 5, 17, -0.1, 0.05, (x, y, z, c) => c === K.fur || c === K.furD);

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 15.5, 6];
  const head = G();
  blob(head, -0.5, 20.8, 8, 6.6, 5.6, 5.6, fur, { p: 2.2 });
  blob(head, -0.5, 18, 10, 6.8, 3.6, 4.4, fur, { p: 2.2 });
  capsule(head, [-0.5, 17.8, 12.5], [-0.5, 18.2, 19], 3.1, 2.5, (x, y, z) => (y >= 19.5 ? (Math.abs(x + 0.5) <= 0.6 && z >= 14 ? K.furL : K.fur) : K.muzzle));
  blob(head, -0.5, 19.8, 21, 1.6, 1.2, 1.1, INK); // nose
  head.set(-1, 20, 22, WHITE, true);
  // pointed ears
  for (const s of [-1, 1]) {
    const ex = s < 0 ? -4 : 3;
    capsule(head, [ex, 24, 7], [ex + s * 1.6, 31.5, 5], 2.4, 0.3, fur);
    capsule(head, [ex, 24.4, 8.4], [ex + s * 1.4, 29.6, 6.6], 1.3, 0.2, K.inner);
  }
  // cheek fluff
  for (const s of [-1, 1]) capsule(head, [s < 0 ? -6 : 5, 18, 9], [s < 0 ? -9 : 8, 16, 8.5], 1.6, 0.4, K.furD);
  // angry yellow eyes
  for (const [cx, side] of [[-4, -1], [3, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 22) ?? 11) - 1;
    eyeBall(head, cx, 22.4, cz, [2.2, 2.5, 1.8], side, { white: K.eye, pupil: 0x2a0a06, pw: 2, ph: 3, inward: 0.5, down: 0.6, browCol: K.rockD, browT: 1, browHi: 1.1, browLo: 0.45, browOut: 0 });
  }
  // open mouth: carve the bottom of the snout; teeth + fangs hang from the roof
  head.carve((x, y, z) => y <= 16.5 && z >= 12);
  head.carve((x, y, z) => y < 14);
  for (let x = -4; x <= 3; x++) {
    let fz = 0;
    for (let z = 24; z >= 12; z--) if (head.has(x, 17, z)) { fz = z; break; }
    if (!fz) continue;
    for (let z = 12; z < fz; z++) head.set(x, 17, z, MOUTH);
    head.set(x, 16, fz, TOOTH);
    if (x === -3 || x === 2) for (let y = 14; y <= 16; y++) head.set(x, y, fz, TOOTH);
  }
  for (let x = -4; x <= 3; x++) for (let y = 14; y <= 16; y++) if (head.has(x, y, 11)) head.set(x, y, 11, MOUTH);
  // fire mane crown
  for (const [x, z, h, gl] of [[-0.5, 5, 7, 1], [-2, 3.5, 6], [1, 3.5, 6], [-0.5, 2, 6]]) flame(head, x, 24, z, h, { w: 1.4, lean: -0.55, glow: !!gl });
  gradY(head, 13, 27, -0.08, 0.06, (x, y, z, c) => c === K.fur || c === K.furD);

  // ------------------------------------------------------------ jaw
  const JJ = [-0.5, 16, 11];
  const jaw = G();
  capsule(jaw, [-0.5, 15, 12.5], [-0.5, 15, 18.5], 2.4, 1.8, K.muzzle);
  jaw.carve((x, y) => y > 16);
  for (let x = -3; x <= 2; x++) for (let z = 11; z <= 20; z++) if (jaw.has(x, 16, z)) jaw.set(x, 16, z, Math.abs(x + 0.5) <= 1 ? TONGUE : MOUTH);
  for (let x = -3; x <= 2; x++) {
    let fz = 0;
    for (let z = 21; z >= 11; z--) if (jaw.has(x, 16, z)) { fz = z; break; }
    if (!fz) continue;
    if (x === -2 || x === 1) { jaw.set(x, 17, fz, TOOTH); jaw.set(x, 18, fz, TOOTH); } else if ((x + 3) % 2 === 0) jaw.set(x, 17, fz, TOOTH);
  }

  // ------------------------------------------------------------ legs (charred socks + claws)
  const leg = (front) => {
    const g = G();
    const cx = -3.8, cz = front ? 4.5 : -8;
    if (front) capsule(g, [cx, 11, cz], [cx, 3, cz + 0.5], 2.1, 1.7, fur);
    else { blob(g, cx, 10, cz, 2.8, 3.2, 3.2, fur, { p: 2.2 }); capsule(g, [cx, 8, cz], [cx, 3, cz + 0.5], 1.9, 1.7, fur); }
    g.paint((x, y) => (y <= 6 ? K.rock : undefined));
    blob(g, cx, 1.6, cz + 1.2, 2.3, 1.6, 2.6, K.rockD, { p: 2.4, clip: (x, y) => y < 0 });
    for (const dx of [-1.5, 0, 1.5]) { g.set(Math.round(cx + dx), 0, cz + 4, WHITE); g.set(Math.round(cx + dx), 1, cz + 4, WHITE); }
    g.set(Math.round(cx), 5, cz + 2, K.lava, true);
    return g;
  };
  const legFL = leg(true), legBL = leg(false);

  // ------------------------------------------------------------ bushy tail with a flaming tip
  const TJ = [-0.5, 14, -10.5];
  const tail = G();
  chain(tail, [[-0.5, 14, -10.5], [-0.5, 16, -14.5], [-0.5, 19.5, -16.5], [-0.5, 23, -16]], [1.8, 2.6, 2.6, 1.8], fur);
  tail.paint((x, y) => (y >= 21 ? 0xff8a1f : undefined));
  flame(tail, -0.5, 24, -15.5, 6, { w: 1.6, lean: -0.3, glow: true });

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legFL', legFL, [-3.8, 11, 4.5]), jp('legFR', flipX(legFL), [2.8, 11, 4.5]),
      jp('legBL', legBL, [-3.8, 11, -8]), jp('legBR', flipX(legBL), [2.8, 11, -8]),
      jp('body', body, BODYJ),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.15, 0, 0] }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, 17, 21],
  };
}

// ===========================================================================
// Ice Beetle (Fire & Ice): a rhinoceros beetle with a frosted ice-blue shell,
// ice-crystal spikes, a navy head with big angry eyes and pincer mandibles,
// and a huge crystal horn it fires ice shards from.
function iceBeetle() {
  const K = {
    shell: 0x7ad8ff, shellD: 0x2f8ad8, shellL: 0xd8f6ff, navy: 0x22307a, navyD: 0x141d4c, navyL: 0x4058b8,
    ice: 0x9ff2ff, iceL: 0xe8fdff, iceD: 0x5ac8f0,
  };
  const shell = (x, y, z) => (Math.abs(x + 0.5) <= 0.5 && y >= 9 ? K.shellD : n3(x, y, z, 3) < 0.05 ? K.shellL : y >= 13 && n3(x, y, z, 5) < 0.12 ? K.shellL : K.shell);

  // ------------------------------------------------------------ body: elytra dome + pronotum
  const body = G();
  blob(body, -0.5, 9.5, -4.5, 7.2, 5.8, 7.8, shell, { p: 2.3, clip: (x, y) => y < 4 });
  body.paint((x, y) => (y <= 6 ? K.navy : undefined));
  blob(body, -0.5, 10.5, 3.5, 6, 4.6, 3.4, (x, y) => (y >= 13 ? K.navyL : K.navy), { p: 2.4 });
  body.paint((x, y, z, c) => (y === 7 && c !== K.navy ? K.iceL : undefined)); // frost rim
  crystal(body, [-3.5, 13.5, -5], [-6.5, 18, -7.5], 1.6, { glow: true });
  crystal(body, [2.5, 13.5, -7], [5.5, 17, -9.5], 1.4);
  crystal(body, [-0.5, 13.5, -10], [-0.5, 16.5, -13.5], 1.2);
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 13, z: -3 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 13, z: -7 });
  hollowOut(body, 2);

  // ------------------------------------------------------------ head: big chibi head with angry eyes
  const HJ = [-0.5, 9.5, 6];
  const head = G();
  blob(head, -0.5, 10.5, 10, 5.8, 5, 4.2, (x, y) => (y >= 13 ? K.navyL : K.navy), { p: 2.3 });
  for (const [cx, side] of [[-3.2, -1], [2.2, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 11) ?? 12) - 1;
    eyeBall(head, cx, 11.5, cz, [2.3, 2.5, 1.6], side, { pw: 2, ph: 3, inward: 0.6, down: 0.5, browCol: K.ice, browT: 2, browHi: 1.05, browLo: 0.3, browOut: 0 });
  }
  // mouth
  head.carve((x, y, z) => y <= 8 && z >= 11 && Math.abs(x + 0.5) <= 3.2);
  for (let x = -4; x <= 3; x++) {
    for (let y = 6; y <= 8; y++) if (head.has(x, y, 10)) head.set(x, y, 10, MOUTH);
    let fz = 0;
    for (let z = 16; z >= 10; z--) if (head.has(x, 9, z)) { fz = z; break; }
    if (fz && Math.abs(x + 0.5) <= 3.2) { head.set(x, 8, fz, TOOTH); if ((x + 4) % 2 === 0) head.set(x, 7, fz, TOOTH); }
  }
  // stubby clubbed antennae
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -3 : 2;
    capsule(head, [x0, 14, 11], [x0 + s * 2.4, 16.5, 13], 0.5, 0.4, K.navyD);
    blob(head, x0 + s * 2.6, 16.8, 13.2, 0.9, 0.9, 0.9, K.ice);
  }

  // pincer mandibles
  const JJ = [-0.5, 7.5, 10];
  const jaw = G();
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -3.5 : 2.5;
    chain(jaw, [[x0, 6.6, 11], [x0 + s * 1.3, 6.4, 13.5], [x0 - s * 0.6, 6.4, 15.6]], [1.1, 0.9, 0.4], K.navyL);
    jaw.set(Math.round(x0 - s * 0.3), 7, 14, TOOTH);
  }
  for (let x = -2; x <= 1; x++) jaw.set(x, 7, 12, (x & 1) ? MOUTH : TOOTH);

  // ------------------------------------------------------------ the crystal horn (recoils when it fires)
  const CJ = [-0.5, 13.5, 11];
  const horn = G();
  chain(horn, [[-0.5, 13.5, 11], [-0.5, 17.5, 13.5], [-0.5, 21.5, 14.5], [-0.5, 25, 13.2]], [2.8, 2.2, 1.5, 0.5], (x, y, z) => [K.ice, K.iceL, K.iceD][(Math.abs(x * 3 + y * 5 + z * 7) >> 1) % 3]);
  crystal(horn, [-0.5, 18, 14], [-0.5, 19.5, 17.5], 0.9);
  horn.set(-1, 25, 13, K.iceL, true); horn.set(0, 25, 13, K.iceL, true);

  // ------------------------------------------------------------ six stubby legs
  const leg = (zh, zk, zf) => {
    const g = G();
    capsule(g, [-4.5, 6.5, zh], [-8.5, 8, zk], 1.3, 1.1, K.navy);
    blob(g, -8.5, 8, zk, 1.4, 1.4, 1.4, K.iceD);
    capsule(g, [-8.5, 8, zk], [-9.5, 1, zf], 1.1, 0.8, K.navyD);
    g.set(-10, 0, zf + 1, K.ice); g.set(-9, 0, zf + 1, K.ice);
    return g;
  };
  const legFL = leg(3, 5, 7), legML = leg(-2, -2, -2), legBL = leg(-7, -9, -11);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legFL', legFL, [-4.5, 6.5, 3]), jp('legFR', flipX(legFL), [3.5, 6.5, 3]),
      jp('legL', legML, [-4.5, 6.5, -2]), jp('legR', flipX(legML), [3.5, 6.5, -2]),
      jp('legBL', legBL, [-4.5, 6.5, -7]), jp('legBR', flipX(legBL), [3.5, 6.5, -7]),
      jp('body', body, BODYJ),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head' }),
      jp('cannon', horn, CJ, HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, 24, 14],
  };
}

// ===========================================================================
// Magma Mole (Fire & Ice): a lava-miner mole in a hard hat with a headlamp,
// goggles over angry eyes, a magenta star nose, buck teeth, glowing lava cracks
// in its obsidian back plate and huge molten drill claws.
function magmaMole() {
  const K = {
    fur: 0x7a3e2a, furD: 0x4e2418, furL: 0xb8664a, belly: 0xe8a07a, skin: 0xff9aa8, skinD: 0xe06a80,
    rock: 0x2a2228, rockL: 0x463a40, lava: 0xff6a1a, lavaL: 0xffd23f, hat: 0xffc21a, hatD: 0xd88a0a, lamp: 0xfff6c8, lens: 0xff8a2a,
  };
  const fur = (x, y, z) => (n3(x, y, z, 7) < 0.1 ? K.furD : K.fur);

  // ------------------------------------------------------------ body (pear-shaped)
  const body = G();
  blob(body, -0.5, 11, -2, 7.4, 7.6, 7, fur, { p: 2.2 });
  blob(body, -0.5, 7, -2, 8.4, 5, 7.8, fur, { p: 2.2, clip: (x, y) => y < 2 });
  body.paint((x, y, z) => (z >= 3 && y <= 13 && Math.abs(x + 0.5) <= 5 ? K.belly : undefined));
  // obsidian back plate with glowing lava cracks
  blob(body, -0.5, 12.5, -8, 5.6, 5.4, 2.6, (x, y, z) => (n3(x, y, z, 3) < 0.35 ? K.rockL : K.rock), { p: 2.4, clip: (x, y, z) => z > -7 });
  const CRACK = ['..L....', '..LL...', '...L.L.', '..LLL..', '.L...L.', 'L.....L'];
  stamp(body, CRACK, { L: { c: K.lava, glow: true } }, { axis: '-z', x: -4, y: 15 });
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 13, z: 1 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 13, z: -3 });
  gradY(body, 2, 18, -0.12, 0.05, (x, y, z, c) => c === K.fur || c === K.furD);
  hollowOut(body, 2);

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 14, 2];
  const head = G();
  blob(head, -0.5, 17.5, 3.5, 6.4, 5.2, 5.6, fur, { p: 2.2 });
  capsule(head, [-0.5, 15.5, 7], [-0.5, 14.8, 11.5], 3.4, 2.6, K.furL);
  // magenta star nose
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    capsule(head, [-0.5 + Math.cos(a) * 1.2, 14.8 + Math.sin(a) * 1.2, 13.2], [-0.5 + Math.cos(a) * 3, 14.8 + Math.sin(a) * 3, 14.2], 0.8, 0.5, k % 2 ? MAG : MAG_L);
  }
  blob(head, -0.5, 14.8, 13.8, 1.2, 1.2, 0.8, MAG);
  sym(head, -1, 15, 15, MOUTH);
  // goggles: chrome rims, orange-tinted lenses with angry eyes behind them
  for (const [cx, side] of [[-3.6, -1], [2.6, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 19) ?? 8) - 1;
    blob(head, cx, 19.4, cz, 2.9, 2.9, 1.4, CHROME, { p: 2 });
    eyeBall(head, cx, 19.4, cz + 1, [2, 2, 1.2], side, { white: 0xfff2dc, pw: 2, ph: 2, inward: 0.5, down: 0.3, browCol: K.furD, browT: 2, browHi: 1.25, browLo: 0.45, browOut: 1 });
  }
  head.paint((x, y, z, c) => (c === 0xfff2dc && n3(x, y, z, 11) < 0.25 ? 0xffd8b0 : undefined));
  // goggle strap
  head.paint((x, y, z, c) => (y >= 18 && y <= 20 && z <= 6 && c !== CHROME && Math.abs(x + 0.5) >= 5 ? INK : undefined));
  // hard hat + brim + headlamp
  blob(head, -0.5, 22, 2.5, 6.6, 3.6, 6.4, (x, y) => (y >= 25 ? 0xffe070 : K.hat), { p: 2.2, clip: (x, y) => y < 22 });
  cyl(head, 'y', -0.5, 3.5, 22, 22, 7.6, 7.6, K.hatD);
  rbox(head, -1, 22, -4, 0, 26, 9, 0, K.hatD); // ridge
  cyl(head, 'z', -0.5, 23.5, 8, 10, 1.9, 1.9, CHROME_D);
  stamp(head, ['LL', 'll'], { L: { c: K.lamp, glow: true }, l: 0xfff0a0 }, { axis: 'z', x: -1, y: 24, zmin: 9 });
  stamp(head, BOLT_S, { M: MAG }, { axis: '-x', y: 25, z: 4 });
  stamp(head, rev(BOLT_S), { M: MAG }, { axis: 'x', y: 25, z: 2 });
  // mouth: buck teeth under the snout
  head.carve((x, y, z) => y <= 12.5 && z >= 6 && Math.abs(x + 0.5) <= 3);
  head.carve((x, y) => y < 11);
  for (let x = -3; x <= 2; x++) for (let y = 11; y <= 12; y++) if (head.has(x, y, 5)) head.set(x, y, 5, MOUTH);
  for (const x of [-1, 0]) for (let y = 10; y <= 12; y++) head.set(x, y, 11, TOOTH);
  gradY(head, 11, 26, -0.08, 0.05, (x, y, z, c) => c === K.fur || c === K.furD);

  const JJ = [-0.5, 12, 6];
  const jaw = G();
  blob(jaw, -0.5, 10.6, 8.6, 3, 1.5, 2.8, K.furL, { p: 2.2 });
  jaw.carve((x, y) => y > 11);
  for (let x = -3; x <= 2; x++) for (let z = 6; z <= 11; z++) if (jaw.has(x, 11, z)) jaw.set(x, 11, z, Math.abs(x + 0.5) <= 1 ? TONGUE : MOUTH);
  for (const x of [-2, 1]) jaw.set(x, 12, 10, TOOTH);

  // ------------------------------------------------------------ molten drill claws
  const arm = G();
  capsule(arm, [-7, 12, 2], [-10, 9.5, 5.5], 2.4, 2.1, fur);
  blob(arm, -11, 8.4, 7.4, 2.8, 3, 1.8, K.skin, { p: 2.2 });
  for (let i = 0; i < 4; i++) {
    const x = -12.6 + i * 1.1;
    capsule(arm, [x, 6.4, 8.4], [x - 0.4, 3.6, 11], 0.85, 0.35, (xx, yy, zz, t) => (t > 0.78 ? K.lava : K.rock));
    arm.set(Math.round(x - 0.4), 3, 11, K.lavaL, i % 2 === 0);
  }
  const armR = flipX(arm);

  // ------------------------------------------------------------ feet + tail
  const foot = G();
  capsule(foot, [-4.5, 5, -1], [-4.5, 2.2, 0], 2.4, 2.1, fur);
  blob(foot, -4.5, 1.4, 1.2, 2.4, 1.4, 3.2, K.skin, { p: 2.2, clip: (x, y) => y < 0 });
  for (const dx of [-1, 0, 1]) foot.set(-5 + dx, 0, 4, K.rock);
  const TJ = [-0.5, 6, -9];
  const tail = G();
  capsule(tail, [-0.5, 6, -9], [-0.5, 7.5, -13], 1.3, 0.8, K.skin);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legL', foot, [-4.5, 5, -1]), jp('legR', flipX(foot), [3.5, 5, -1]),
      jp('body', body, BODYJ),
      jp('armL', arm, [-7, 12, 2], BODYJ, { parent: 'body' }),
      jp('armR', armR, [6, 12, 2], BODYJ, { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.1, 0, 0] }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, 12, 14],
  };
}

// ===========================================================================
// Sludge Kraken (Battle Fusion, legendary): a purple kraken from the Lab sewers
// in a steel battle crown. Toxic spots, huge angry eyes, a toothy grin, two
// raised tentacles that slam down, and sludge dripping off everything.
function sludgeKraken() {
  const K = {
    skin: 0x9246ec, skinD: 0x6422c4, skinL: 0xc096f0, under: 0xc896f0, sucker: 0xff8ad8, spot: 0x8cff3a, spotD: 0x4ac81a,
    goo: 0x7cff3a, steel: 0xb8c2d4, steelD: 0x7a849a, gold: 0xffc93a, eye: 0xfff27a,
  };
  const TC = { skin: K.skin, skinD: K.skinD, under: K.under, sucker: K.sucker };
  const skin = (x, y, z) => (n3(x, y, z, 12) < 0.07 ? K.skinD : K.skin);

  // ------------------------------------------------------------ base skirt + ground tentacles
  const body = G();
  blob(body, -0.5, 7, -1.5, 9.4, 4.6, 8.6, skin, { p: 2.2, clip: (x, y) => y < 1 });
  for (const deg of [55, 105, 150, -55, -105, -150]) {
    const a = (deg * Math.PI) / 180;
    const P = (r, y) => [-0.5 + Math.sin(a) * r, y, -1.5 + Math.cos(a) * r];
    const curl = [P(6, 5), P(10, 3), P(14, 2.4), P(17, 3.4), P(17.5, 6.5), P(15.5, 7.5)];
    tentacle(body, curl, [3, 2.6, 2.1, 1.5, 1, 0.5], [0, -1, 0], TC);
  }
  hollowOut(body, 2);

  // ------------------------------------------------------------ head: the mantle (nods into the slam)
  const HJ = [-0.5, 9, 0];
  const head = G();
  blob(head, -0.5, 19, -0.5, 9.4, 9.6, 8.6, skin, { p: 2.2 });
  blob(head, -0.5, 26.5, -4.5, 7.2, 6.8, 7, skin, { p: 2.2 });
  blob(head, -0.5, 12.2, 3.5, 7, 3.6, 4.6, skin, { p: 2.2 }); // lower face / lips
  // toxic spots (a few glowing pores)
  const SPOTS = [[-7, 26, -6], [6, 25, -7], [-3, 31, -6], [3, 30, -2], [-8, 20, -6], [7, 19, -5], [-1, 26, -11], [-6, 14, -6], [5, 14, -8], [0, 21, -9]];
  head.paint((x, y, z, c) => {
    for (const [sx, sy, sz] of SPOTS) {
      const d = Math.hypot(x - sx, y - sy, z - sz);
      if (d <= 1.3) return K.spot;
      if (d <= 2.3) return K.spotD;
    }
    return undefined;
  });
  for (const [sx, sy, sz] of SPOTS.slice(0, 4)) {
    let best = null, bd = 9;
    head.forEach((x, y, z) => { const d = Math.hypot(x - sx, y - sy, z - sz); if (d < bd) { bd = d; best = [x, y, z]; } });
    if (best) head.set(...best, K.goo, true);
  }
  // steel battle crown: band, rivets, spikes and a magenta bolt crest
  head.paint((x, y, z, c) => (y >= 22 && y <= 24 && (c === K.skin || c === K.skinD || c === K.spot || c === K.spotD) ? (y === 23 && (x + z + 40) % 4 === 0 ? K.gold : K.steel) : undefined));
  for (const [a, b] of [[[-0.5, 30, -2], [-0.5, 36, -2.5]], [[-5.5, 28.5, -1], [-8.5, 33.5, -1.5]], [[4.5, 28.5, -1], [7.5, 33.5, -1.5]], [[-8.5, 24, -1], [-12, 27, -1]], [[7.5, 24, -1], [11, 27, -1]]]) {
    capsule(head, a, b, 1.7, 0.3, (x, y, z, t) => (t < 0.25 ? K.steelD : K.steel));
  }
  stamp(head, BOLT, { M: { c: MAG, raise: 1 } }, { axis: 'z', x: -3, y: 27, zmin: 0 });
  // huge angry eyes
  for (const [cx, side] of [[-4.5, -1], [3.5, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 18) ?? 6) - 1;
    eyeBall(head, cx, 18, cz, [3, 3.3, 2.2], side, { white: K.eye, pw: 3, ph: 3, inward: 0.9, down: 0.6, browCol: K.skinD, browT: 3, browHi: 1, browLo: 0.25, browOut: 1 });
  }
  // the grin
  openMouth(head, -7, 6, 10, 14, (x, y) => Math.abs(x + 0.5) <= 6.6 - (14 - y) * 0.6 * (y < 12 ? 1 : 0) && Math.abs(x + 0.5) <= 6.6, { depth: 3, top: 3, bot: 2, period: 3, lipCol: K.skinD, zmin: -2, zmax: 14 });
  // sludge drips from the mouth corners
  for (const [x, len] of [[-7, 3], [6, 2], [-3, 2]]) {
    const y0 = 10;
    const z = frontZ(head, x, y0, -4, 14);
    if (z === null) continue;
    for (let i = 1; i <= len; i++) head.set(x, y0 - i, z, K.goo, i === len);
  }
  hollowOut(head, 2);

  // ------------------------------------------------------------ raised slam tentacles (arms)
  const arm = G();
  tentacle(arm, [[-6, 10, 4], [-10, 13, 7], [-12.5, 18, 8.5], [-12.5, 24, 7.5], [-10.5, 27.5, 5.5], [-8.5, 27, 4]], [3.2, 2.8, 2.4, 1.8, 1.2, 0.6], [1, 0, 0.5], TC);
  arm.set(-9, 26, 4, K.goo, true);
  const armR = flipX(arm);

  // ------------------------------------------------------------ back tentacle (tail, sways)
  const TJ = [-0.5, 7, -8];
  const tail = G();
  tentacle(tail, [[-0.5, 7, -8], [-0.5, 5, -13], [-0.5, 6, -17.5], [-0.5, 10, -20], [-0.5, 14, -19], [-0.5, 15, -16.5]], [3, 2.6, 2.1, 1.6, 1, 0.5], [0, -0.4, 1], TC);

  return {
    gait: 'slide', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('body', body, BODYJ),
      jp('tail', tail, TJ),
      jp('head', head, HJ),
      jp('armL', arm, [-6, 10, 4]),
      jp('armR', armR, [5, 10, 4]),
    ],
    muzzle: [-0.5, 12, 9],
  };
}

// ===========================================================================
// Boom Box (Home Horrors): a possessed boombox. Its speakers are bulging angry
// eyes, the cassette deck is a toothy mouth whose door drops open on every
// BOOM, LED equalizer bars pulse between the eyes and the antenna wobbles.
function boomBox() {
  const K = { case: 0x1fc8d8, caseD: 0x0f8aa8, caseL: 0x8af2ff, grill: 0x1a1d2a, grillL: 0x343a50, eq1: 0x7cff3a, eq2: 0xffd23f, eq3: 0xff3a4a, sole: 0xff1f9e };
  const caseCol = (x, y, z) => (Math.abs(x + 0.5) >= 13 || z <= -4 ? K.caseD : y >= 24 ? K.caseL : K.case);

  // ------------------------------------------------------------ cabinet
  const body = G();
  rbox(body, -14, 5, -5, 13, 25, 5, 2.5, caseCol);
  // chrome trim around the front face
  for (let x = -13; x <= 12; x++) for (const y of [6, 24]) if (body.has(x, y, 5)) body.set(x, y, 5, CHROME);
  // speakers -> eyes
  for (const [cx, side] of [[-7.5, -1], [6.5, 1]]) {
    const cy = 18;
    for (let x = Math.floor(cx - 7); x <= Math.ceil(cx + 7); x++) for (let y = cy - 7; y <= cy + 7; y++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > 6.3) continue;
      if (d > 5.3) { body.set(x, y, 5, CHROME); body.set(x, y, 6, CHROME); continue; }
      body.del(x, y, 5);
      body.set(x, y, 4, (x + y) % 2 ? K.grill : K.grillL);
    }
    eyeBall(body, cx, cy, 4, [3.3, 3.3, 2.6], side, { pw: 3, ph: 3, inward: 1, down: 0.5, browT: 2, browHi: 1.9, browLo: 0.5, browOut: 2, browCol: INK });
  }
  // LED equalizer between the eyes
  const bars = [[-1, 9], [0, 7]];
  for (const [x, n] of bars) for (let i = 0; i < n; i++) {
    const y = 13 + i;
    body.set(x, y, 6, i >= 7 ? K.eq3 : i >= 5 ? K.eq2 : K.eq1, i === n - 1);
  }
  // cassette-deck mouth with teeth hanging from the top edge
  body.carve((x, y, z) => y >= 7 && y <= 11 && z >= 3 && x >= -6 && x <= 5);
  for (let x = -6; x <= 5; x++) {
    for (let y = 7; y <= 11; y++) body.set(x, y, 2, y <= 8 && Math.abs(x + 0.5) <= 3 ? TONGUE : MOUTH);
    body.set(x, 11, 4, TOOTH); body.set(x, 11, 3, TOOTH);
    if ((x + 6) % 3 !== 2) { body.set(x, 10, 4, TOOTH); }
    if ((x + 6) % 3 === 0) body.set(x, 9, 4, TOOTH);
  }
  // top keys + carry handle
  for (const [x, c] of [[-6, WHITE], [-4, INK], [-2, WHITE], [0, K.eq3], [2, WHITE], [4, INK]]) rbox(body, x, 25, 1, x + 1, 26, 3, 0, c);
  chain(body, [[-10, 25, -1], [-9, 29, -1], [-0.5, 30, -1], [8, 29, -1], [9, 25, -1]], [1.2, 1.2, 1.2, 1.2, 1.2], CHROME);
  rbox(body, -4, 29, -2, 3, 31, 0, 1, INK); // grip
  // magenta bolt stickers on the sides + bass ports
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 21, z: 2 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 21, z: -2 });
  for (const x of [-14, 13]) cyl(body, 'x', 11, 0, x, x, 1.8, 1.8, K.grill);
  hollowOut(body, 2);

  // ------------------------------------------------------------ jaw: the cassette door (drops open)
  const JJ = [-0.5, 6, 5];
  const jaw = G();
  rbox(jaw, -6, 6, 4, 5, 8, 5, 0, K.caseD);
  for (let x = -6; x <= 5; x++) if ((x + 6) % 2 === 0) jaw.set(x, 9, 4, TOOTH);
  rbox(jaw, -3, 6, 6, 2, 7, 6, 0, CHROME); // door label

  // ------------------------------------------------------------ telescoping antenna
  const ant = G();
  capsule(ant, [9.5, 25, -3], [11.5, 30, -3.5], 0.8, 0.7, CHROME_D);
  capsule(ant, [11.5, 30, -3.5], [13.5, 35, -4], 0.5, 0.4, CHROME);
  blob(ant, 13.6, 35.6, -4, 0.9, 0.9, 0.9, MAG);
  ant.set(13, 36, -4, MAG_L, true);

  // ------------------------------------------------------------ stubby legs in sneakers + cable arms
  const leg = G();
  capsule(leg, [-6, 6, 0], [-6, 2.6, 0.5], 1.6, 1.5, GUN);
  rbox(leg, -9, 0, -3, -3, 2, 5, 1, WHITE);
  for (let x = -9; x <= -3; x++) for (let z = -3; z <= 5; z++) if (leg.has(x, 0, z)) leg.set(x, 0, z, K.sole);
  rbox(leg, -8, 2, 3, -4, 3, 5, 0.5, WHITE);
  const arm = G();
  capsule(arm, [-14, 15, 0], [-17, 11, 2], 1.2, 1.1, (x, y) => ((y + 40) % 2 ? INK : K.grillL));
  blob(arm, -17.5, 10, 3, 2, 2, 2, WHITE);
  blob(arm, -16.2, 11.4, 4.2, 0.8, 0.8, 0.8, WHITE);

  return {
    gait: 'hop', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legL', leg, [-6, 6, 0]), jp('legR', flipX(leg), [5, 6, 0]),
      jp('body', body, BODYJ),
      jp('jaw', jaw, JJ, BODYJ, { parent: 'body', rot: [0.15, 0, 0] }),
      jp('armL', arm, [-14, 15, 0], BODYJ, { parent: 'body' }),
      jp('armR', flipX(arm), [13, 15, 0], BODYJ, { parent: 'body' }),
      jp('antenna', ant, [9.5, 25, -3], BODYJ, { parent: 'body' }),
    ],
    muzzle: [-0.5, 10, 7],
  };
}

// ===========================================================================
// Mutant Mop (Home Horrors): a shaggy mop head come alive in a yellow mop
// bucket on squeaky casters. Angry eyes peer through the strands, a toothy
// grin, slime-dripping strand arms and the mop handle sticking out of its head.
function mutantMop() {
  const K = {
    bucket: 0xffd23f, bucketD: 0xe09a12, bucketL: 0xfff07a, wring: 0xa4aec4, wringD: 0x5a6378,
    mop: 0xc4d4dc, mopD: 0x8aa2b2, mopL: 0xeaf2f6, slime: 0x7cff3a, slimeD: 0x4ac81a, handle: 0xff3a4a, wheel: 0x23202e,
  };
  const strand = (x, y, z) => {
    const a = Math.atan2(z, x + 0.5);
    const k = ((Math.floor(a * 8) % 3) + 3) % 3;
    return [K.mop, K.mopD, K.mopL][k];
  };

  // ------------------------------------------------------------ bucket on casters
  const body = G();
  rbox(body, -9, 3, -7, 8, 12, 6, 3, (x, y) => (y <= 4 ? K.bucketD : K.bucket));
  rbox(body, -10, 12, -8, 9, 13, 7, 3, K.bucketL);
  body.carve((x, y, z) => y >= 6 && Math.abs(x + 0.5) <= 7.5 && z >= -5 && z <= 4);
  for (let x = -8; x <= 7; x++) for (let z = -5; z <= 4; z++) if (!body.has(x, 11, z)) body.set(x, 10, z, n3(x, 10, z, 2) < 0.2 ? K.slimeD : K.slime);
  body.set(-5, 11, 3, K.slime, true); body.set(4, 11, -4, K.slime, true);
  // wringer on the back rim
  rbox(body, -6, 12, -9, 5, 17, -6, 1, K.wring);
  for (let x = -5; x <= 4; x += 2) body.set(x, 16, -10, K.wringD), body.set(x, 15, -10, K.wringD);
  capsule(body, [5, 16, -8], [9, 20, -8], 0.8, 0.7, K.wringD);
  // magenta bolt sticker + slime drips
  stamp(body, BOLT, { M: MAG }, { axis: 'z', x: -3, y: 10 });
  for (const [x, z, n] of [[-8, 7, 3], [6, 7, 2], [9, 0, 3]]) for (let i = 0; i < n; i++) body.set(x, 11 - i, z, K.slime);
  // caster brackets
  for (const [x, z] of [[-7, 4], [6, 4], [-7, -5], [6, -5]]) rbox(body, x, 2, z, x + 1, 3, z + 1, 0, K.wringD);
  hollowOut(body, 1);

  const wheel = (x, z) => {
    const g = G();
    cyl(g, 'x', 1.6, z, x - 1, x, 1.6, 1.6, K.wheel);
    g.set(x - 1, 2, z, K.wring); g.set(x, 2, z, K.wring);
    return g;
  };

  // ------------------------------------------------------------ head: the shaggy mop
  const HJ = [-0.5, 12, 0];
  const head = G();
  blob(head, -0.5, 17, -0.5, 9, 9, 8, strand, { p: 2.2, clip: (x, y) => y < 12 });
  // fringe strands draped over the bucket rim (sides + back)
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const front = Math.cos(a) > 0.55;
    if (front) continue;
    const x = Math.round(-0.5 + Math.sin(a) * 11.3), z = Math.round(-0.5 + Math.cos(a) * 9.6);
    const len = 4 + Math.floor(n3(k, 1, 2, 3) * 4);
    for (let i = 0; i < len; i++) head.set(x, 15 - i, z, i >= len - 1 && k % 3 === 0 ? K.slime : strand(x, 15, z));
  }
  // eyes peering out of the strands + a toothy grin
  for (const [cx, side] of [[-3.6, -1], [2.6, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 19) ?? 7) - 1;
    eyeBall(head, cx, 19.5, cz, [2.4, 2.6, 1.8], side, { pw: 2, ph: 2, inward: 0.6, down: 0.4, browCol: K.mopD, browT: 2, browHi: 1.1, browLo: 0.25, browOut: 1 });
  }
  openMouth(head, -6, 5, 12, 15, (x, y) => Math.abs(x + 0.5) <= 5.6 - (y === 12 ? 1.5 : 0), { depth: 3, top: 2, bot: 2, period: 2, lipCol: K.mopD });
  // a few strands hanging over the forehead
  for (const [x, len] of [[-6, 3], [-1, 2], [0, 4], [5, 3]]) {
    const z = frontZ(head, x, 23, -10, 12);
    if (z === null) continue;
    for (let i = 0; i < len; i++) head.set(x, 23 - i, z + 1, K.mopD);
  }
  hollowOut(head, 2);

  // ------------------------------------------------------------ strand arms (slap + slime)
  const arm = G();
  chain(arm, [[-9, 17, 1], [-12.5, 14, 3], [-13.5, 10, 5], [-12.5, 7.5, 7]], [2.2, 1.8, 1.4, 1], (x, y, z) => ((x + z + 40) % 3 === 0 ? K.mopD : (x + z + 40) % 3 === 1 ? K.mopL : K.mop));
  for (const [x, y, z] of [[-13, 7, 7], [-12, 6, 8]]) arm.set(x, y, z, K.slime);
  arm.set(-12, 5, 8, K.slime);

  // ------------------------------------------------------------ mop handle (wobbles)
  const handle = G();
  capsule(handle, [-0.5, 24, -3], [2.5, 33, -6.5], 1, 1, (x, y) => ((y + 40) % 6 === 0 ? WHITE : K.handle));
  blob(handle, 2.7, 33.6, -6.8, 1.4, 1, 1.4, INK);

  return {
    gait: 'slide', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('body', body, BODYJ),
      jp('wheelFL', wheel(-7, 4.5), [-7.5, 1.6, 4.5]), jp('wheelFR', wheel(7, 4.5), [6.5, 1.6, 4.5]),
      jp('wheelBL', wheel(-7, -4.5), [-7.5, 1.6, -4.5]), jp('wheelBR', wheel(7, -4.5), [6.5, 1.6, -4.5]),
      jp('head', head, HJ),
      jp('armL', arm, [-9, 17, 1], HJ, { parent: 'head' }),
      jp('armR', flipX(arm), [8, 17, 1], HJ, { parent: 'head' }),
      jp('antenna', handle, [-0.5, 24, -3], HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, 14, 10],
  };
}

export const WAVE2_MODELS = {
  hardHeadPanther,
  voltBat,
  mechaMantis,
  cyberCroc,
  pixelPups,
  emberWolf,
  iceBeetle,
  magmaMole,
  sludgeKraken,
  boomBox,
  mutantMop,
};
