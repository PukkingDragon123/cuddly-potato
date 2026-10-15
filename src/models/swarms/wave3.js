// Wave 3 Swarms: two troops for each of the new arenas (Lost Jungle Temple,
// Laser Maze Vault, Haunted Mansion, TeamSeas Reef, Volcano Forge, Zero-G
// Space Station). Hi-res (0.05) vinyl-toy sculpts in the MrBeast Lab Swarms
// house style: chunky chibi silhouettes, big angry faces with teeth, saturated
// colours, the magenta lightning bolt, and glow voxels only as small accents
// (eyes, cores, tips).
// See ../kit.js and ./panthers.js for the conventions (model faces +Z, y = 0 is
// the ground, x symmetric around -0.5, parts modelled in absolute coordinates
// and attached with jp() at their joints).
import { G, blob, rbox, capsule, chain, cyl, stamp, sym, gradY, n3, jp, shade, mixHex, frontZ, topY } from '../kit.js';
import { pantherMold, packPanther } from './panthers.js';

const INK = 0x15121f, WHITE = 0xffffff, MAG = 0xff1f9e, MAG_L = 0xff7ccc;
const MOUTH = 0x3a0a22, TONGUE = 0xff5a8a, TOOTH = 0xffffff;
const CHROME = 0xe0e6f0, CHROME_D = 0x9aa4b8, GUN = 0x353c52;
const BODYJ = [-0.5, 0, 0];

// ---------------------------------------------------------------------------
// Helpers (same toolbox as wave2.js)

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

/** Densify a polyline so tube() gets a sample every `step` voxels. */
function dens(pts, step = 0.5) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n), a[2] + (b[2] - a[2]) * (k / n)]);
  }
  return out;
}

/**
 * Sweep a tube along a dense centreline. rAt(i) radius. col(v) gets
 * { x, y, z, i, s (arc length), oy (vertical offset / r), lat (side offset / r) }.
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

/**
 * Bulging cartoon eyeball on a front-facing surface with a slanted angry brow
 * slab that overhangs it (reads in profile too). side: -1 = model's left.
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
  blob(g, cx, cy, cz, r, r, r, white, { p: 2, glow: !!o.glow });
  const slant = o.slant ?? 0.45, lift = o.lift ?? 0.5;
  const lineY = (x) => cy + r * lift + (x - cx) * side * slant;
  g.paint((x, y, z, c) => (c === white && y >= lineY(x) && Math.hypot(x - cx, y - cy, z - cz) <= r + 0.8 ? lidC : undefined));
  if (o.glow) g.forEach((x, y, z, c) => { if (c === lidC && Math.hypot(x - cx, y - cy, z - cz) <= r + 0.8) g.set(x, y, z, c, false); });
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
    const back = o.backFn ? o.backFn(x, y) : null;
    if (back) g.set(x, y, z - depth, back.c, !!back.glow);
    else g.set(x, y, z - depth, tongue ? TONGUE : (o.back ?? MOUTH));
    if (tongue && !back) g.set(x, y, z - depth + 1, TONGUE);
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

/** A flickering flame tongue rising from (x, y, z): fat red base, glowing yellow tip. dir -1 hangs it downwards. */
function flame(g, x, y, z, h, o = {}) {
  const lean = o.lean ?? -0.4, w = o.w ?? 1.5, dir = o.dir ?? 1;
  for (let i = 0; i < h; i++) {
    const t = i / Math.max(1, h - 1);
    const r = Math.max(0.15, w * (1 - t * 0.85));
    const col = o.cols ? o.cols[Math.min(o.cols.length - 1, Math.floor(t * o.cols.length))] : t > 0.8 ? 0xfff2a0 : t > 0.55 ? 0xffd23f : t > 0.25 ? 0xff8a1f : 0xff4a1a;
    blob(g, x + Math.sin(i * 1.7 + x * 0.9) * 0.35, y + i * dir, z + lean * i, r, 0.5, r, col, { glow: !!o.glow && i === h - 1 });
  }
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

/**
 * Flat leaf (or fin, or petal) from base to tip, `w` half-width, lying in a
 * plane: 'xy' (faces +z, the default), 'zy' (faces +x) or 'xz' (faces +y).
 * The depth coordinate runs linearly from the base's to the tip's plus o.cup *
 * (edge distance)^2, so leaves can cup. C: { leaf, vein, edge }.
 */
function leaf(g, base, tip, w, C, o = {}) {
  const plane = o.plane ?? 'xy';
  const P = plane === 'xy' ? [0, 1, 2] : plane === 'zy' ? [2, 1, 0] : [0, 2, 1];
  const ub = base[P[0]], vb = base[P[1]], db = base[P[2]], ut = tip[P[0]], vt = tip[P[1]], dt = tip[P[2]];
  const du = ut - ub, dv = vt - vb, L = Math.hypot(du, dv) || 1;
  const ax = du / L, ay = dv / L, nx = -ay, ny = ax;
  const th = o.thick ?? 2, R = w + 1.5, shape = o.shape ?? 0.75;
  for (let u = Math.floor(Math.min(ub, ut) - R); u <= Math.ceil(Math.max(ub, ut) + R); u++)
    for (let v = Math.floor(Math.min(vb, vt) - R); v <= Math.ceil(Math.max(vb, vt) + R); v++) {
      const pu = u + 0.5 - (ub + 0.5), pv = v + 0.5 - (vb + 0.5);
      const t = (pu * ax + pv * ay) / L;
      if (t < 0 || t > 1) continue;
      const d = pu * nx + pv * ny;
      const half = w * Math.pow(Math.sin(Math.PI * Math.min(1, t * (o.round ?? 1.0) + (o.blunt ?? 0))), shape);
      if (Math.abs(d) > half + 0.25) continue;
      if (o.clip && o.clip(t, d)) continue;
      const ad = Math.abs(d);
      let col = C.leaf;
      if (C.vein !== undefined && ad < 0.6 && t < 0.92) col = C.vein;
      else if (C.vein !== undefined && o.veins !== false && Math.abs(((t * L - ad * 0.9) % 3.2) - 1.6) < 0.45 && ad < half - 0.6) col = C.vein;
      else if (C.edge !== undefined && ad > half - 0.8) col = C.edge;
      if (typeof col === 'function') col = col(t, d);
      const depth = Math.round(db + (dt - db) * t + (o.cup ?? 0) * (ad / Math.max(1, w)) ** 2);
      for (let k = 0; k < th; k++) {
        const c3 = [0, 0, 0];
        c3[P[0]] = u; c3[P[1]] = v; c3[P[2]] = depth - k * (o.thickDir ?? 1);
        g.set(c3[0], c3[1], c3[2], col);
      }
    }
  return g;
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

/** Paint the upward-facing surface voxels (y >= ymin) with moss where noise allows. */
function mossTop(g, cols, p = 0.55, ymin = -99, seed = 3) {
  const hits = [];
  g.forEach((x, y, z, c, gl) => {
    if (gl || y < ymin || g.has(x, y + 1, z)) return;
    const k = n3(x >> 1, y >> 1, z >> 1, seed);
    if (k < p) hits.push([x, y, z, k < p * 0.3 ? cols[1] : k < p * 0.8 ? cols[0] : cols[2]]);
  });
  for (const [x, y, z, c] of hits) { g.set(x, y, z, c); if (n3(x, y, z, seed + 1) < 0.18) g.set(x, y - 1, z, c); }
  return g;
}

/** Vine wound along a tube centreline at radius rAt(i): returns sample points of the vine. */
function vineAlong(pts, rAt, turns, phase = 0) {
  const out = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let tx = q[0] - o[0], ty = q[1] - o[1], tz = q[2] - o[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // n1 = t x up (horizontal), n2 = n1 x t
    let n1x = -tz, n1z = tx;
    const nl = Math.hypot(n1x, n1z) || 1; n1x /= nl; n1z /= nl;
    const n2x = -n1z * ty, n2y = n1z * tx - n1x * tz, n2z = n1x * ty;
    const a = s * turns + phase, r = rAt(i);
    const dx = n1x * Math.cos(a) + n2x * Math.sin(a), dy = n2y * Math.sin(a), dz = n1z * Math.cos(a) + n2z * Math.sin(a);
    out.push({ p: [pts[i][0] + dx * r, pts[i][1] + dy * r, pts[i][2] + dz * r], n: [dx, dy, dz], s });
  }
  return out;
}

// ===========================================================================
// Vine Viper (Lost Jungle Temple): an emerald jungle viper with a creeping vine
// wound round its coils, a cobra hood of two big jungle leaves, a magenta
// orchid crown, angry yellow slit eyes and fangs dripping glowing venom. Rears
// back and spits venom that slows and poisons.
function vineViper() {
  const K = {
    g: 0x1fbf8f, gD: 0x0c7a5c, gL: 0x86f0c8, belly: 0xf6f0a0, bellyD: 0xe0d478,
    vine: 0x7a6224, vineD: 0x4e3e18, leaf: 0x62d834, leafD: 0x2a8a22, leafL: 0xb8f070,
    eye: 0xfff04a, venom: 0xc6ff3a, pod: 0x9a6a30, podD: 0x5e3c1c, pollen: 0xffd23f, roof: 0xff5aa8,
  };
  const scales = (v) => {
    if (v.oy < -0.42) return (Math.floor(v.s / 1.4) % 2 === 0) ? K.belly : K.bellyD;
    // diamond leaf-scale pattern down the back
    const ph = ((v.s / 5 + Math.abs(v.lat) * 0.35) % 1 + 1) % 1;
    if (v.oy > 0.1 && ph < 0.2) return K.gD;
    if (v.oy > 0.5 && ph > 0.5 && ph < 0.62) return K.gL;
    return n3(v.x, v.y, v.z, 4) < 0.06 ? K.gD : K.g;
  };
  const leafC = { leaf: K.leaf, vein: K.leafD, edge: K.leafL };

  // ------------------------------------------------------------ coiled body + rising neck
  const CZ = -4;
  const coil = [];
  const N = 130;
  for (let i = 0; i <= N; i++) {
    const f = i / N, a = f * 1.25 * Math.PI * 2;
    const R = 7.4 - 3 * f;
    coil.push([-0.5 + R * Math.cos(a), 3.1 + 4 * f, CZ + R * Math.sin(a)]);
  }
  const neck = dens([coil[N], [-0.5, 10.5, 1.6], [-0.5, 14, 2.4], [-0.5, 16.5, 2.6]]).slice(1);
  const pts = coil.concat(neck);
  const rAt = (i) => (i <= N ? 3.2 - 0.6 * (i / N) : 2.6 - 0.2 * ((i - N) / neck.length));
  const body = G();
  tube(body, pts, rAt, scales);
  // the creeping vine wound round the coils, sprouting pointed leaves
  const vine = vineAlong(pts, (i) => rAt(i) + 0.2, 0.3, 1.2);
  for (let i = 1; i < vine.length; i += 1) capsule(body, vine[i - 1].p, vine[i].p, 0.7, 0.7, (x, y, z) => (n3(x, y, z, 6) < 0.3 ? K.vineD : K.vine));
  let lastLeaf = -9;
  vine.forEach((v, i) => {
    if (v.s - lastLeaf < 7.5 || v.n[1] < -0.45 || v.p[1] < 2.5) return;
    lastLeaf = v.s;
    const [px, py, pz] = v.p, [nx, ny, nz] = v.n;
    const tip = [px + nx * 2.8, py + ny * 2.8 + 1, pz + nz * 2.8];
    capsule(body, v.p, tip, 1.05, 0.25, (x, y, z, t) => (t < 0.2 ? K.leafD : n3(x, y, z, 2) < 0.25 ? K.leafL : K.leaf));
  });
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 8, z: -2 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 8, z: -6 });
  gradY(body, 0, 16, -0.12, 0.05, (x, y, z, c) => c === K.g || c === K.gD);
  hollowOut(body, 2);

  // ------------------------------------------------------------ tail: the coil's outer end, ending in a thorny seed-pod rattle
  const TJ = coil[0].slice();
  const tail = G();
  const tpts = [];
  for (let i = 0; i <= 26; i++) {
    const f = i / 26;
    tpts.push([coil[0][0] - Math.sin(f * 2.1) * 3.6, 3.1 + f * 1.6, coil[0][2] - f * 10]);
  }
  tube(tail, tpts, (i) => 3 - 2.1 * (i / 26), (v) => scales({ ...v, s: -v.s }));
  const pe = tpts[26];
  blob(tail, pe[0] - 0.6, pe[1] + 1.2, pe[2] - 1.8, 1.9, 1.9, 2.2, (x, y, z) => ((x + y + z) % 3 === 0 ? K.podD : K.pod));
  for (const [dx, dy, dz] of [[0, 2.6, -1], [-2.2, 1.2, -1.8], [2, 1, -1.5], [-0.8, 1.6, -4], [1.2, -0.4, -3.6]]) {
    capsule(tail, [pe[0] - 0.6 + dx * 0.5, pe[1] + 1.2 + dy * 0.5, pe[2] - 1.8 + dz * 0.5], [pe[0] - 0.6 + dx, pe[1] + 1.2 + dy, pe[2] - 1.8 + dz], 0.5, 0.15, K.podD);
  }

  // ------------------------------------------------------------ head: arrow-shaped viper head, orchid crown, venom fangs
  const HJ = [-0.5, 16, 2.6];
  const head = G();
  tube(head, dens([[-0.5, 16, 2.6], [-0.5, 18, 3.4], [-0.5, 19.6, 4.4]]), () => 2.55, scales);
  const hw = (z) => 6.2 * (1 - 0.5 * Math.max(0, (z - 5) / 7.5));
  blob(head, -0.5, 21.8, 7, 6.2, 3.4, 6.8, (x, y, z) => {
    if (y >= 23 && (Math.abs(x + 0.5) + z) % 5 === 0) return K.gD; // scale lines across the crown
    return y >= 22 ? K.g : K.gL;
  }, { p: 2.4, clip: (x, y, z) => Math.abs(x + 0.5) > hw(z) + 0.4 });
  for (const s of [-1, 1]) blob(head, s < 0 ? -5.2 : 4.2, 20.4, 3.6, 2.3, 2.3, 2.6, K.g, { p: 2.2 }); // venom-gland cheeks
  // open mouth: hollow under the roof, pink roof, two huge fangs dripping venom
  head.carve((x, y, z) => y <= 20 && z >= 4.5);
  for (let x = -7; x <= 6; x++) for (let z = 4; z <= 14; z++) if (head.has(x, 21, z) && !head.has(x, 20, z) && Math.abs(x + 0.5) < hw(z) - 0.6) head.set(x, 21, z, K.roof);
  for (const fx of [-3, 2]) {
    capsule(head, [fx, 20.6, 10.6], [fx + (fx < 0 ? 0.3 : -0.3), 16.6, 11.2], 1, 0.25, WHITE);
    head.set(fx, 16, 11, K.venom, true);
  }
  for (const x of [-2, -1, 0, 1]) head.set(x, 20, 12, WHITE);
  for (const x of [-5, 4]) head.set(x, 20, 8, WHITE);
  for (const x of [-2, 1]) head.set(x, 22, 13, INK); // nostrils
  // angry yellow slit eyes
  orbEye(head, -3.7, 23.6, 8.4, 2.6, -1, { white: K.eye, lid: K.gD, browCol: K.vineD, slant: 0.42, lift: 0.55, pw: 1, ph: 3, inward: 0.2 });
  orbEye(head, 2.7, 23.6, 8.4, 2.6, 1, { white: K.eye, lid: K.gD, browCol: K.vineD, slant: 0.42, lift: 0.55, pw: 1, ph: 3, inward: 0.2 });
  // orchid crown: stem + five magenta petals round a golden centre
  capsule(head, [-0.5, 24.5, 4.5], [-0.5, 26.6, 3.4], 0.7, 0.6, K.leafD);
  const FC = [-0.5, 28, 3];
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (k * Math.PI * 2) / 5;
    const px = FC[0] + Math.cos(a) * 2.7, py = FC[1] + Math.sin(a) * 2.5, pz = FC[2] - Math.sin(a) * 0.8;
    blob(head, px, py, pz, 1.9, 1.7, 0.8, (x, y, z) => (Math.hypot(x - FC[0], y - FC[1]) < 2.2 ? WHITE : Math.hypot(x - FC[0], y - FC[1]) < 3.1 ? MAG_L : MAG), { p: 2.2 });
  }
  blob(head, FC[0], FC[1], FC[2] + 0.8, 1, 1, 0.6, K.pollen);
  head.set(-1, 28, Math.round(FC[2] + 2), 0xfff7c0);
  stamp(head, BOLT_S, { M: MAG }, { axis: '-x', y: 23, z: 4 });
  stamp(head, rev(BOLT_S), { M: MAG }, { axis: 'x', y: 23, z: 2 });

  // ------------------------------------------------------------ leaf hood (two big jungle leaves fanned like a cobra hood; wobble)
  const hood = G();
  leaf(hood, [-4.5, 19, 3], [-14, 27.5, 0.5], 3.4, leafC, { cup: 1.4 });
  leaf(hood, [-4.5, 17.5, 2.5], [-11.5, 17.2, -1.5], 2.4, leafC, { cup: 1 });
  const hoodR = flipX(hood);

  // ------------------------------------------------------------ lower jaw with a forked tongue (drops on attacks)
  const JJ = [-0.5, 19.6, 3.6];
  const jaw = G();
  blob(jaw, -0.5, 18.4, 7.8, 5.2, 1.6, 6, K.belly, { p: 2.3, clip: (x, y, z) => Math.abs(x + 0.5) > hw(z) - 0.2 || y > 19 });
  for (let x = -6; x <= 5; x++) for (let z = 4; z <= 14; z++) if (jaw.has(x, 19, z) && Math.abs(x + 0.5) < hw(z) - 1.4) jaw.set(x, 19, z, MOUTH);
  for (const x of [-3, 2]) jaw.set(x, 20, 11, WHITE);
  capsule(jaw, [-0.5, 19.4, 6], [-0.5, 19.8, 13.5], 0.7, 0.6, 0xff4a6a);
  capsule(jaw, [-0.5, 19.8, 13.5], [-1.8, 20.4, 15.6], 0.5, 0.3, 0xff4a6a);
  capsule(jaw, [-0.5, 19.8, 13.5], [0.8, 20.4, 15.6], 0.5, 0.3, 0xff4a6a);

  return {
    gait: 'slide', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('body', body, BODYJ),
      jp('tail', tail, TJ),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.3, 0, 0] }),
      jp('antennaL', hood, [-4.5, 18.5, 3], HJ, { parent: 'head' }),
      jp('antennaR', hoodR, [3.5, 18.5, 3], HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, 19.5, 13],
  };
}

// ===========================================================================
// Temple Golem (Lost Jungle Temple): a hulking golem of mossy temple blocks.
// Its head is a stepped-pyramid temple with angry carved brows over glowing
// jade eyes and a stone jaw full of teeth; a golden sun-disc with the magenta
// bolt on its chest, vines draped over boulder shoulders, long gorilla arms
// ending in huge carved stone fists. Slow, armoured, knocks enemies back.
function templeGolem() {
  const K = {
    st: 0x8f9a8c, stD: 0x626e64, stL: 0xbcc6b2, mortar: 0x4d564f, moss: 0x5aa83a, mossD: 0x3a7a2a, mossL: 0x9ad85a,
    gold: 0xffc93a, goldD: 0xd08a12, jade: 0x46ffc8, jadeD: 0x13a07e, red: 0xd2482c, tooth: 0xf2ecd8, vine: 0x3f7a26,
  };
  // temple brickwork: staggered blocks with dark mortar lines + mottling
  const brick = (x, y, z) => {
    const row = Math.floor((y + 40) / 4);
    if ((y + 40) % 4 === 0) return K.mortar;
    if ((x + z + 40 + (row % 2) * 3) % 6 === 0) return K.mortar;
    const k = n3(x >> 1, y >> 2, z >> 1, 7);
    return k < 0.18 ? K.stD : k > 0.86 ? K.stL : K.st;
  };
  const isStone = (c) => c === K.st || c === K.stD || c === K.stL || c === K.mortar;
  const MOSS = [K.moss, K.mossD, K.mossL];
  const GLYPH = ['GGGGGG', 'G....G', 'G.GG.G', 'G.G..G', 'G.GGGG', 'G.....', 'GGGGGG'];

  // ------------------------------------------------------------ legs: stubby temple columns on block feet
  const leg = G();
  cyl(leg, 'y', -5.5, 0, 3, 12, 3.6, 3.4, brick);
  cyl(leg, 'y', -5.5, 0, 8, 8, 3.9, 3.9, K.gold);
  cyl(leg, 'y', -5.5, 0, 9, 9, 3.8, 3.8, K.goldD);
  rbox(leg, -10, 0, -4.5, -1, 3, 5, 1, (x, y, z) => (y === 3 ? K.stL : K.stD));
  for (const x of [-9, -6, -3]) rbox(leg, x, 0, 5, x + 1, 2, 7, 0.5, K.stL); // toes
  mossTop(leg, MOSS, 0.22, 3);

  // ------------------------------------------------------------ torso
  const body = G();
  rbox(body, -12, 10, -8.5, 11, 25, 6.5, 3, brick);
  rbox(body, -9, 8, -7, 8, 12, 5.5, 2, K.stD); // pelvis block
  // boulder shoulders
  for (const s of [-1, 1]) blob(body, s < 0 ? -12.5 : 11.5, 23, -1, 4.4, 3.8, 5.6, brick, { p: 3 });
  // recess for the jaw
  body.carve((x, y, z) => y >= 20 && z >= 2 && Math.abs(x + 0.5) <= 7.5);
  // golden sun disc with rays and the magenta bolt
  cyl(body, 'z', -0.5, 16, 6, 7, 5.6, 5.6, (x, y) => {
    const a = Math.atan2(y - 16, x + 0.5), r = Math.hypot(x + 0.5, y - 16);
    if (r > 4.8) return Math.round(((a + Math.PI) / (Math.PI * 2)) * 12) % 2 ? K.goldD : K.gold;
    if (r > 3.8) return K.red;
    return K.gold;
  });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    capsule(body, [-0.5 + Math.cos(a) * 5.6, 16 + Math.sin(a) * 5.6, 6.5], [-0.5 + Math.cos(a) * 7.4, 16 + Math.sin(a) * 7.4, 6.2], 0.7, 0.3, k % 2 ? K.goldD : K.gold);
  }
  stamp(body, BOLT, { M: { c: MAG, raise: 1 } }, { axis: 'z', x: -3, y: 19, zmin: 6 });
  // carved glyph panels on the flanks + the bolt on the back
  stamp(body, GLYPH, { G: K.mortar }, { axis: '-x', y: 21, z: 3 });
  stamp(body, rev(GLYPH), { G: K.mortar }, { axis: 'x', y: 21, z: -2 });
  stamp(body, BOLT, { M: MAG }, { axis: '-z', x: -3, y: 21 });
  // moss on the shoulders + vines draped down the chest
  mossTop(body, MOSS, 0.34, 24);
  for (const [x0, z0, len] of [[-9.5, 6.4, 8], [8.5, 6.4, 6], [-12.5, 4.5, 10], [11.5, 4.8, 9]]) {
    const pts = [];
    for (let i = 0; i <= len; i++) pts.push([x0 + Math.sin(i * 0.9) * 0.6, 25 - i, z0 + 0.4 + (i > 2 ? 0.4 : 0)]);
    for (let i = 1; i < pts.length; i++) capsule(body, pts[i - 1], pts[i], 0.55, 0.55, K.vine);
    for (let i = 2; i < pts.length; i += 3) blob(body, pts[i][0] + (i % 2 ? 1 : -1), pts[i][1], pts[i][2] + 0.5, 1, 0.6, 0.7, i % 2 ? K.moss : K.mossL);
  }
  hollowOut(body, 2);

  // ------------------------------------------------------------ head: stepped temple-pyramid mask
  const HJ = [-0.5, 24, 1];
  const head = G();
  rbox(head, -9, 24, -6, 8, 32, 8, 2, brick);
  rbox(head, -7, 32, -5, 6, 34, 6, 1, brick);
  rbox(head, -5, 34, -3, 4, 36, 4, 1, brick);
  rbox(head, -3, 36, -1, 2, 38, 2, 0.5, K.stL);
  rbox(head, -2, 38, 0, 1, 39, 1, 0, K.gold);
  for (const y of [32, 34, 36]) head.paint((x, yy, z, c) => (yy === y && isStone(c) && !head.has(x, yy + 1, z) ? K.stL : undefined)); // step edges
  // angry V-brow slab overhanging the eyes
  for (let x = -9; x <= 8; x++) {
    const yb = Math.round(28.6 + Math.abs(x + 0.5) * 0.36);
    for (let y = yb; y <= yb + 1; y++) for (let z = 8; z <= 9; z++) head.set(x, y, z, y === yb + 1 ? K.stL : K.st);
  }
  // carved eye sockets with glowing jade eyes and dark pupils
  for (const [x0, side] of [[-8, -1], [1, 1]]) {
    for (let x = x0; x <= x0 + 6; x++) {
      const yt = Math.round(28.6 + Math.abs(x + 0.5) * 0.36) - 1;
      for (let y = 26; y <= yt; y++) {
        head.del(x, y, 8);
        const edge = x === x0 || x === x0 + 6 || y === 26;
        head.set(x, y, 7, edge ? K.jadeD : K.jade, !edge);
      }
    }
    const px = side < 0 ? x0 + 4 : x0 + 1;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) head.set(px + dx, 26 + dy, 8, INK);
    head.set(side < 0 ? px : px + 1, 27, 8, WHITE, true);
  }
  // carved stone nose + cheek war-paint
  rbox(head, -2, 25, 8, 1, 27, 9, 0.5, K.stL);
  stamp(head, BOLT_S, { M: MAG }, { axis: 'z', x: -9, y: 30, zmin: 7 });
  stamp(head, rev(BOLT_S), { M: MAG }, { axis: 'z', x: 6, y: 30, zmin: 7 });
  // gold ear flares
  for (const x of [-10, 9]) cyl(head, 'x', 28, 2, x, x, 2.6, 2.6, (xx, y, z) => (Math.hypot(y - 28, z - 2) < 1.3 ? K.jadeD : K.gold));
  // upper teeth hanging from the lip + dark mouth roof
  for (let x = -7; x <= 6; x++) {
    for (let z = 2; z <= 7; z++) if (head.has(x, 24, z)) head.set(x, 24, z, MOUTH);
    head.set(x, 24, 8, K.tooth);
    if ((x + 7) % 2 === 0) { head.set(x, 23, 8, K.tooth); head.set(x, 23, 7, K.tooth); }
  }
  mossTop(head, MOSS, 0.3, 32, 9);
  // vines trailing off the temple steps
  for (const [x0, z0, len] of [[-8, 5, 7], [7, 6, 5], [-6, -3, 6]]) {
    for (let i = 0; i < len; i++) head.set(x0 + (i % 3 === 2 ? 1 : 0), 32 - i, z0 + 1, i % 3 === 1 ? K.mossL : K.vine);
  }
  hollowOut(head, 2);

  // ------------------------------------------------------------ jaw: stone slab with teeth (drops on attacks)
  const JJ = [-0.5, 24, 1];
  const jaw = G();
  rbox(jaw, -7, 20, 1, 6, 23, 8, 1, brick);
  for (let x = -7; x <= 6; x++) {
    for (let z = 1; z <= 7; z++) if (jaw.has(x, 23, z)) jaw.set(x, 23, z, z >= 3 && Math.abs(x + 0.5) <= 3 ? TONGUE : MOUTH);
    if ((x + 7) % 2 === 1) { jaw.set(x, 24, 8, K.tooth); jaw.set(x, 24, 7, K.tooth); }
  }
  rbox(jaw, -3, 19, 6, 2, 20, 8, 0.5, K.stD); // chin

  // ------------------------------------------------------------ arms: long gorilla arms with carved stone fists
  const arm = G();
  capsule(arm, [-13, 23, 0], [-15.5, 13, 1], 3.6, 3.1, brick);
  cyl(arm, 'y', -15.5, 1, 10, 12, 3.4, 3.4, (x, y) => (y === 11 ? K.goldD : K.gold)); // bracer
  rbox(arm, -20, 2, -4, -11, 10, 5, 2.2, brick);
  for (const x of [-18, -15, -12]) for (let y = 5; y <= 9; y++) arm.set(x, y, 5, K.mortar); // knuckle grooves
  for (const x of [-19, -16, -13]) arm.set(x, 9, 6, K.stL), arm.set(x + 1, 9, 6, K.stL);
  rbox(arm, -12, 5, 3, -10, 8, 6, 1, K.stD); // thumb
  mossTop(arm, MOSS, 0.28, 9, 4);
  hollowOut(arm, 2);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('legL', leg, [-5.5, 11, 0]), jp('legR', flipX(leg), [4.5, 11, 0]),
      jp('body', body, BODYJ),
      jp('armL', arm, [-13, 23, 0], BODYJ, { parent: 'body' }),
      jp('armR', flipX(arm), [12, 23, 0], BODYJ, { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.08, 0, 0] }),
    ],
    muzzle: [-0.5, 22, 10],
  };
}

// ===========================================================================
// Laser Lynx (Laser Maze Vault): an ice-grey snow lynx with navy rosettes, big
// snowshoe paws, black ear tufts and a spiky cheek ruff, magenta bolt war paint
// and a Mega-Tech harness carrying a shoulder laser cannon whose beam pierces
// every enemy in line.
function laserLynx() {
  const K = {
    fur: 0x8f9fe0, furD: 0x5a68b0, furL: 0xdfe6fa, spot: 0x2a3478, ruff: 0xf4f6ff, inner: 0xff8ac8, nose: 0xff5aa8,
    strap: 0x2a3150, cyan: 0x5ff6ff, lens: 0xff3aa8,
  };
  const spotted = (x, y, z) => {
    const k = n3(Math.floor((x + 40) / 2.5), Math.floor((y + 40) / 2), Math.floor((z + 40) / 2.5), 13);
    return k < 0.15 ? K.spot : k < 0.2 ? K.furD : K.fur;
  };

  // ------------------------------------------------------------ body + harness
  const body = G();
  blob(body, -0.5, 12, -2.5, 5.6, 4.6, 8.4, spotted, { p: 2.3 });
  blob(body, -0.5, 13.5, 4.5, 5.2, 5.2, 4.2, spotted, { p: 2.2 });
  body.paint((x, y, z) => (y <= 8 && Math.abs(x + 0.5) <= 3.6 ? K.furL : z >= 6 && y <= 13 && Math.abs(x + 0.5) <= 3 ? K.ruff : undefined));
  // harness: chest strap + back plate
  body.paint((x, y, z, c) => (z >= 1 && z <= 2 && c !== K.ruff ? K.strap : undefined));
  rbox(body, -4, 16, -6, 3, 17, 1, 1, GUN);
  rbox(body, -3, 17, -5, 2, 17, 0, 0, CHROME_D);
  body.set(-1, 17, -6, K.cyan, true);
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 13, z: -3 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 13, z: -7 });
  gradY(body, 5, 17, -0.1, 0.05, (x, y, z, c) => c === K.fur || c === K.furD || c === K.spot);
  hollowOut(body, 2);

  // ------------------------------------------------------------ shoulder laser cannon (recoils on every shot)
  const CJ = [5.5, 17, -1];
  const cannon = G();
  rbox(cannon, 4, 15, -3, 7, 17, 1, 1, GUN); // shoulder mount
  capsule(cannon, [5.5, 17, -1], [8.5, 21.4, -1], 1.2, 1, CHROME_D);
  capsule(cannon, [8.5, 22.5, -4.5], [8.5, 22.5, 2], 2.3, 2.1, (x, y, z) => (y >= 24 ? 0x56608a : (z + 40) % 3 === 0 ? INK : GUN));
  for (let z = -4; z <= 0; z += 2) cannon.set(8, 25, z, K.cyan, z === -2);
  cyl(cannon, 'z', 8.5, 22.5, 2, 10, 1.1, 1.1, CHROME);
  for (const z of [4, 6]) cyl(cannon, 'z', 8.5, 22.5, z, z, 1.6, 1.6, GUN);
  cyl(cannon, 'z', 8.5, 22.5, 9, 10, 1.7, 1.7, MAG);
  cannon.set(8, 22, 11, K.lens, true); cannon.set(9, 23, 11, WHITE, true);
  stamp(cannon, BOLT_S, { M: MAG }, { axis: 'x', y: 24, z: 0 });

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 15.5, 6];
  const head = G();
  blob(head, -0.5, 21, 9, 6.8, 5.8, 5.6, spotted, { p: 2.2 });
  blob(head, -0.5, 18.2, 10.6, 6.4, 3.6, 4.2, spotted, { p: 2.2 });
  blob(head, -0.5, 18.4, 13.6, 3.6, 2.6, 2.2, K.ruff, { p: 2.2 }); // muzzle pads
  head.paint((x, y, z, c) => (y >= 24 && c === K.spot && z > 11 ? K.fur : undefined));
  blob(head, -0.5, 20, 15.4, 1.3, 0.9, 0.8, K.nose);
  // tufted ears
  for (const s of [-1, 1]) {
    const ex = s < 0 ? -4 : 3;
    capsule(head, [ex, 24.5, 8], [ex + s * 1.3, 31, 6.6], 2.5, 0.6, K.fur);
    capsule(head, [ex, 25, 9.4], [ex + s * 1.1, 29.6, 8], 1.3, 0.3, K.inner);
    capsule(head, [ex + s * 1.3, 30.5, 6.6], [ex + s * 1.9, 35.5, 5.6], 0.7, 0.2, INK);
  }
  // spiky cheek ruff (white with dark bars)
  for (const s of [-1, 1]) {
    const cx = s < 0 ? -6 : 5;
    capsule(head, [cx, 19, 9], [cx + s * 4.2, 15.4, 9.5], 1.8, 0.4, (x, y) => ((y + 40) % 3 === 0 ? K.furD : K.ruff));
    capsule(head, [cx, 16.5, 9.6], [cx + s * 3.4, 12.8, 10], 1.5, 0.3, (x, y) => ((y + 40) % 3 === 0 ? INK : K.ruff));
    capsule(head, [cx + s * 0.5, 21.5, 8], [cx + s * 3.8, 19.8, 7.6], 1.3, 0.3, K.ruff);
  }
  // angry eyes + bolt war paint under them
  for (const [cx, side] of [[-3.6, -1], [2.6, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 22) ?? 12) - 1;
    eyeBall(head, cx, 22.2, cz, [2.3, 2.4, 1.8], side, { pupil: 0x1a2a6a, pw: 2, ph: 3, inward: 0.6, down: 0.6, browCol: K.spot, browT: 1, browHi: 1.2, browLo: 0.35, browOut: 0 });
  }
  stamp(head, ['MM.', '.MM', 'MM.', 'M..'], { M: MAG }, { axis: 'z', x: -7, y: 20, zmin: 10 });
  stamp(head, ['.MM', 'MM.', '.MM', '..M'], { M: MAG }, { axis: 'z', x: 4, y: 20, zmin: 10 });
  // open mouth with fangs
  head.carve((x, y, z) => y <= 16.5 && z >= 11 && Math.abs(x + 0.5) <= 3.6);
  head.carve((x, y, z) => y < 14 && z >= 8);
  for (let x = -4; x <= 3; x++) {
    let fz = 0;
    for (let z = 20; z >= 11; z--) if (head.has(x, 17, z)) { fz = z; break; }
    if (!fz) continue;
    for (let z = 11; z < fz; z++) head.set(x, 17, z, MOUTH);
    head.set(x, 16, fz, TOOTH);
    if (x === -3 || x === 2) for (let y = 14; y <= 16; y++) head.set(x, y, fz, TOOTH);
  }
  for (let x = -4; x <= 3; x++) for (let y = 14; y <= 16; y++) if (head.has(x, y, 10)) head.set(x, y, 10, MOUTH);
  // tech headset: chrome ear cuff with a cyan status light
  cyl(head, 'y', -4.4, 8, 25, 26, 2.8, 2.8, CHROME_D, { hollow: 1 });
  head.set(-7, 26, 8, K.cyan, true);
  gradY(head, 13, 27, -0.08, 0.06, (x, y, z, c) => c === K.fur || c === K.furD);
  hollowOut(head, 2);

  // ------------------------------------------------------------ jaw
  const JJ = [-0.5, 16, 11];
  const jaw = G();
  capsule(jaw, [-0.5, 15, 11.5], [-0.5, 15, 15.5], 2.6, 2.1, K.ruff);
  jaw.carve((x, y) => y > 16);
  for (let x = -3; x <= 2; x++) for (let z = 10; z <= 18; z++) if (jaw.has(x, 16, z)) jaw.set(x, 16, z, Math.abs(x + 0.5) <= 1 ? TONGUE : MOUTH);
  for (let x = -3; x <= 2; x++) {
    let fz = 0;
    for (let z = 19; z >= 10; z--) if (jaw.has(x, 16, z)) { fz = z; break; }
    if (!fz) continue;
    if (x === -2 || x === 1) { jaw.set(x, 17, fz, TOOTH); jaw.set(x, 18, fz, TOOTH); } else if ((x + 3) % 2 === 0) jaw.set(x, 17, fz, TOOTH);
  }

  // ------------------------------------------------------------ legs with big snowshoe paws
  const leg = (front) => {
    const g = G();
    const cx = -3.9, cz = front ? 4.5 : -8;
    if (front) capsule(g, [cx, 11, cz], [cx, 3, cz + 0.5], 2.1, 1.8, spotted);
    else { blob(g, cx, 10, cz, 2.9, 3.3, 3.3, spotted, { p: 2.2 }); capsule(g, [cx, 8, cz], [cx, 3, cz + 0.5], 1.9, 1.8, spotted); }
    blob(g, cx, 1.7, cz + 1.2, 2.8, 1.7, 3.2, K.furL, { p: 2.4, clip: (x, y) => y < 0 });
    for (const dx of [-1.6, 0, 1.6]) { g.set(Math.round(cx + dx), 0, cz + 4, INK); g.set(Math.round(cx + dx), 1, cz + 4, INK); }
    if (front) rbox(g, -6, 5, cz - 1, -2, 6, cz + 2, 0.5, GUN); // tech anklet
    return g;
  };
  const legFL = leg(true), legBL = leg(false);

  // ------------------------------------------------------------ bobbed tail with a black tip
  const TJ = [-0.5, 14, -10];
  const tail = G();
  chain(tail, [[-0.5, 14, -10], [-0.5, 15.5, -12.5], [-0.5, 17, -13.5]], [1.9, 2, 1.6], spotted);
  blob(tail, -0.5, 17.6, -13.8, 1.5, 1.2, 1.4, INK);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('legFL', legFL, [-3.9, 11, 4.5]), jp('legFR', flipX(legFL), [2.9, 11, 4.5]),
      jp('legBL', legBL, [-3.9, 11, -8]), jp('legBR', flipX(legBL), [2.9, 11, -8]),
      jp('body', body, BODYJ),
      jp('cannon', cannon, CJ, BODYJ, { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.15, 0, 0] }),
      jp('tail', tail, TJ),
    ],
    muzzle: [8.5, 22.5, 12],
  };
}

// ===========================================================================
// Vault Bot (Laser Maze Vault): a walking bank safe. Its round vault door is a
// mouth ringed with steel fangs that drops open on every punch to show the gold
// bars and cash inside; glowing angry eyes in a visor slot, brass corner guards,
// a spinning alarm beacon, hydraulic arms and big brass-knuckle fists.
function vaultBot() {
  const K = {
    st: 0x6a7a9c, stD: 0x46526e, stL: 0x9aaccc, brass: 0xffc93a, brassD: 0xc88a12, visor: 0x161a28,
    eye: 0xfff6c8, pupil: 0xff2f45, gold: 0xffd23f, goldD: 0xd8a020, cash: 0x5ad86a, cashD: 0x2f9a45, inside: 0x241c30, siren: 0xff2f45,
  };
  const steel = (x, y, z) => ((y + 40) % 6 === 0 ? K.stD : n3(x, y, z, 5) < 0.05 ? K.stL : K.st);
  const DC = [-0.5, 15.5]; // door centre (x, y)
  const dr = (x, y) => Math.hypot(x - DC[0], y - DC[1]);

  // ------------------------------------------------------------ the safe
  const body = G();
  rbox(body, -10, 7, -7, 9, 28, 7, 2.5, steel);
  // brass corner guards
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const cx = x < 0 ? -11 : 6, cy = y < 0 ? 6 : 25, cz = z < 0 ? -8 : 4;
    rbox(body, cx, cy, cz, cx + 4, cy + 4, cz + 4, 1.4, (xx, yy, zz) => (yy === cy + 4 || yy === cy ? K.brassD : K.brass));
    body.set(x < 0 ? cx - 1 : cx + 5, cy + 2, cz + 2, CHROME);
  }
  // the vault opening: a deep cavity full of gold bars and cash
  body.carve((x, y, z) => z >= 3 && dr(x, y) <= 5.6);
  for (let x = -7; x <= 6; x++) for (let y = 9; y <= 22; y++) if (dr(x, y) <= 5.6) body.set(x, y, 2, K.inside);
  for (const [x0, y0, z0] of [[-5, 10, 3], [-1, 10, 3], [3, 10, 3], [-3, 12, 3], [1, 12, 3], [-1, 14, 3]]) rbox(body, x0, y0, z0, x0 + 2, y0 + 1, z0 + 2, 0, (x, y) => (y === y0 + 1 ? K.gold : K.goldD));
  for (const [x0, z0] of [[-5, 4], [3, 4]]) for (let y = 15; y <= 17; y++) rbox(body, x0, y, z0 - 1, x0 + 1, y, z0, 0, y === 17 ? K.cash : K.cashD);
  // steel fangs ringing the opening (the grin)
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.11;
    for (let r = 5.1; r <= 7.2; r += 0.5) {
      const w = (7.2 - r) * 0.18;
      for (const da of [-w, 0, w]) {
        const x = Math.round(DC[0] + Math.cos(a + da / r * 3) * r), y = Math.round(DC[1] + Math.sin(a + da / r * 3) * r);
        for (const z of [7, 8]) body.set(x, y, z, r > 6.7 ? CHROME_D : TOOTH);
      }
    }
  }
  // hinges on the door side
  for (const y of [11, 20]) cyl(body, 'y', -8.5, 8, y, y + 1, 1.2, 1.2, CHROME);
  // visor slot with glowing angry eyes and steel brow plates
  rbox(body, -8, 22, 7, 7, 26, 8, 0.5, K.visor);
  const EYE = ['....WW', '..WWWW', 'WWWPPW', 'WWWPPW'];
  const EP = { W: { c: K.eye, raise: 0 }, P: { c: K.pupil, glow: true } };
  stamp(body, EYE, EP, { axis: 'z', x: -7, y: 25, zmin: 7 });
  stamp(body, rev(EYE), EP, { axis: 'z', x: 0, y: 25, zmin: 7 });
  for (let x = -9; x <= 8; x++) {
    const yb = Math.round(25.4 + Math.abs(x + 0.5) * 0.3);
    if (Math.abs(x + 0.5) < 1) continue;
    for (let y = yb; y <= yb + 1; y++) for (const z of [8, 9]) body.set(x, y, z, y === yb + 1 ? K.stL : CHROME_D);
  }
  // big magenta bolts on the flanks, a combination pad + vents on the sides
  stamp(body, BOLT, { M: { c: MAG, raise: 1 } }, { axis: '-x', y: 21, z: 2 });
  stamp(body, BOLT_R, { M: { c: MAG, raise: 1 } }, { axis: 'x', y: 21, z: -2 });
  for (const y of [12, 14]) for (let z = -4; z <= 4; z++) { body.set(-11, y, z, K.stD); body.set(10, y, z, K.stD); }
  stamp(body, ['ccc', 'cgc', 'ccc'], { c: GUN, g: { c: 0x7cff3a, glow: true } }, { axis: 'x', y: 18, z: -3 });
  hollowOut(body, 2);

  // ------------------------------------------------------------ jaw: the round vault door (hinged at the bottom, falls open)
  const JJ = [-0.5, 9.5, 8];
  const door = G();
  cyl(door, 'z', DC[0], DC[1], 7, 8, 5.4, 5.4, (x, y) => (dr(x, y) > 4.6 ? CHROME : dr(x, y) > 3.9 ? GUN : (x + y) % 2 ? K.stD : 0x56627e));
  // spoked handle wheel + combination dial with the bolt
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    capsule(door, [DC[0], DC[1], 9], [DC[0] + Math.cos(a) * 3.6, DC[1] + Math.sin(a) * 3.6, 9], 0.5, 0.5, K.brass);
    blob(door, DC[0] + Math.cos(a) * 3.8, DC[1] + Math.sin(a) * 3.8, 9.5, 0.9, 0.9, 0.9, K.brassD);
  }
  cyl(door, 'z', DC[0], DC[1], 9, 10, 1.9, 1.9, (x, y) => (Math.abs(x - DC[0]) < 0.6 && y > DC[1] ? WHITE : GUN));
  stamp(door, ['.MM', 'MM.', 'MMM', '.MM', 'MM.'], { M: MAG }, { axis: 'z', x: -2, y: 17.5, zmin: 9 });
  for (const [x, y] of [[-5, 14], [-5, 17], [4, 14], [4, 17]]) door.set(x, y, 9, CHROME); // locking bolts

  // ------------------------------------------------------------ alarm beacon (spins) + whip antenna
  const SJ = [-0.5, 28, 0];
  const beacon = G();
  cyl(beacon, 'y', -0.5, 0, 28, 29, 2.2, 2.2, CHROME_D);
  blob(beacon, -0.5, 30.5, 0, 1.8, 1.8, 1.8, K.siren, { clip: (x, y) => y < 30 });
  beacon.set(-1, 31, 1, WHITE, true); beacon.set(0, 30, 1, K.siren, true);
  rbox(beacon, 0, 30, -1, 1, 31, 0, 0, CHROME); // reflector
  const ant = G();
  capsule(ant, [6, 28, -5], [7.5, 34, -5.5], 0.5, 0.4, GUN);
  ant.set(7, 35, -6, 0x7cff3a, true);

  // ------------------------------------------------------------ hydraulic arms with brass-knuckle fists
  const arm = G();
  blob(arm, -11, 22, 0, 2.4, 2.4, 2.4, CHROME_D);
  capsule(arm, [-11, 22, 0], [-13, 15, 1.5], 1.5, 1.3, CHROME);
  capsule(arm, [-12, 21.5, -1], [-13.4, 16, 0.5], 0.6, 0.6, GUN); // piston
  blob(arm, -13, 14.5, 1.8, 1.8, 1.8, 1.8, GUN);
  capsule(arm, [-13, 14.5, 1.8], [-13.4, 10, 3.5], 1.7, 1.6, steel);
  rbox(arm, -16.5, 4, 1, -10.5, 9, 7, 1.8, steel);
  for (let x = -16; x <= -11; x++) for (const y of [7, 8]) arm.set(x, y, 8, (x & 1) ? K.brass : K.brassD); // brass knuckles
  rbox(arm, -11, 5, 4, -10, 7, 6, 0, K.stL); // thumb

  // ------------------------------------------------------------ piston legs on tread feet
  const leg = G();
  cyl(leg, 'y', -5.5, 0, 3, 7, 2, 2, CHROME);
  cyl(leg, 'y', -5.5, 0, 5, 5, 2.4, 2.4, GUN);
  rbox(leg, -9, 0, -4, -2, 3, 5, 1, (x, y, z) => (y === 0 ? INK : (z + 40) % 2 ? GUN : 0x4a5478));
  rbox(leg, -8, 1, 5, -3, 2, 6, 0.5, K.brass);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('legL', leg, [-5.5, 7, 0]), jp('legR', flipX(leg), [4.5, 7, 0]),
      jp('body', body, BODYJ),
      jp('jaw', door, JJ, BODYJ, { parent: 'body' }),
      jp('spin', beacon, SJ, BODYJ, { parent: 'body' }),
      jp('antenna', ant, [6, 28, -5], BODYJ, { parent: 'body' }),
      jp('armL', arm, [-11, 22, 0], BODYJ, { parent: 'body' }),
      jp('armR', flipX(arm), [10, 22, 0], BODYJ, { parent: 'body' }),
    ],
    muzzle: [-0.5, 15, 11],
  };
}

// ===========================================================================
// Ghost Panther (Haunted Mansion): the Panther sculpt as a see-through phantom.
// Pale ecto-mint fur fading to teal, glowing green eyes, the magenta bolts, a
// wispy spectral tail instead of hind legs, ghost-fire licking up its back and
// broken iron shackles rattling on its front paws. Flies.
function ghostPanther() {
  const K = {
    fur: 0xc8fff0, top: 0xeafffa, low: 0x3ab8aa, dark: 0x1f8a86, light: 0xf2fffb, muzzle: 0xe4fff8, inner: 0xb08aff,
    claw: 0x2a1a4a, socket: 0x24163e, pupil: 0x8cffb0, iron: 0x5a5a72, ironL: 0x9a9ab4, ecto: 0x7cffd0,
  };
  // hollow ghost eyes: dark sockets with glowing ecto pupils
  const S = { fur: K.fur, dark: K.dark, light: K.light, muzzle: K.muzzle, bolt: MAG, claw: K.claw, inner: K.inner, nose: 0x2a1a4a, iris: 0x2a1a4a, eye: K.socket, pupil: K.pupil };
  // fur fades from bright ecto-white on top to teal underneath
  const furFn = (x, y, z) => mixHex(K.low, K.top, Math.max(0, Math.min(1, (y - 4) / 22)));
  const m = pantherMold(S, { furFn });
  const g = m.grids, j = m.joints;
  g.head.forEach((x, y, z, c) => { if (c === K.pupil) g.head.set(x, y, z, c, true); });
  // the rear of the body thins into the spectral wisp (no hind legs)
  g.body.carve((x, y, z) => z < -5 && y < 10 - (z + 5) * 0.4);
  // ghost-fire licking up the spine
  const EC = [K.low, K.ecto, 0xbffff0, WHITE];
  for (const [x, z, h, gl] of [[-0.5, 2, 5], [-2, -1, 6, 1], [1, -1, 5], [-0.5, -4, 6], [-1.5, -7, 4, 1], [0.5, -8, 4]]) flame(g.body, x, 16.5, z, h, { w: 1.3, lean: -0.5, glow: !!gl, cols: EC });
  // ecto drips off the jaw
  for (const [x, z, n] of [[-4, 17, 2], [3, 15, 3]]) for (let i = 0; i < n; i++) g.jaw.set(x, 8 - i, z, K.ecto, i === n - 1);
  // broken shackles on the front paws: iron cuff + dangling chain links
  for (const k of ['legFL', 'legFR']) {
    const L = g[k], cx = k === 'legFL' ? -5 : 4, cz = 4;
    cyl(L, 'y', cx, cz + 0.5, 4, 6, 3.2, 3.2, (x, y) => (y === 5 ? K.ironL : K.iron), { hollow: 1.2 });
    let px = cx + (k === 'legFL' ? -3 : 3), py = 4.5, pz = cz - 1;
    for (let i = 0; i < 3; i++) {
      const vert = i % 2 === 0;
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2;
        const ox = vert ? 0 : Math.round(Math.cos(t) * 1.2), oy = Math.round(Math.sin(t) * 1.4), oz = vert ? Math.round(Math.cos(t) * 1.2) : 0;
        L.set(Math.round(px + ox), Math.round(py + oy), Math.round(pz + oz), a % 3 === 0 ? K.ironL : K.iron);
      }
      py -= 1.8; pz -= 1.1; px += k === 'legFL' ? -0.4 : 0.4;
    }
  }
  // the spectral wisp tail: swirls back and curls up to a flickering tip
  const TJ = [-0.5, 11, -8];
  const tail = G();
  const wp = [[-0.5, 11, -8], [-0.5, 8.5, -12], [0.2, 6.8, -16.5], [1.6, 7.6, -20.5], [2.2, 11, -22.5], [1.2, 14.5, -21.5], [0, 16, -18.8]];
  chain(tail, wp, [5.4, 4.6, 3.6, 2.8, 2, 1.3, 0.6], (x, y, z) => {
    const sw = Math.sin((z + y) * 0.55 + x * 0.3);
    return sw > 0.75 ? K.dark : sw < -0.8 ? K.top : mixHex(K.low, K.top, Math.max(0, Math.min(1, (y - 5) / 14)));
  });
  tail.set(0, 16, -19, WHITE, true); tail.set(-1, 16, -18, K.ecto, true);
  return {
    gait: 'float', voxel: 0.05, jitter: 0.02, finish: 'translucent',
    parts: [
      jp('legFL', g.legFL, j.legFL), jp('legFR', g.legFR, j.legFR),
      jp('body', g.body, BODYJ),
      jp('head', g.head, j.head),
      jp('jaw', g.jaw, j.jaw, j.head, { parent: 'head', rot: [0.12, 0, 0] }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, 14, 22],
  };
}

// ===========================================================================
// Pumpkin Brute (Haunted Mansion): a hulking jack-o'-lantern. Ribbed pumpkin
// body with an angry carved face lit by the candle inside (glowing eyes with
// dark pupils, a jagged grin of square pumpkin teeth), a cut lid with a curly
// stem that pops up when it smashes, thick vine arms with warty gourd fists
// and stubby root legs. Smashes whole groups at once.
function pumpkinBrute() {
  const K = {
    or: 0xff8a1a, orD: 0xd2560e, orL: 0xffb04a, groove: 0xb84408, flesh: 0xffd08a, candle: 0xd8861a, candleD: 0xe8701a, lit: 0xffd84a, inside: 0x3a1408,
    vine: 0x3f8a2a, vineD: 0x24601c, vineL: 0x7cc84a, gourd: 0x4a9a2a, wart: 0x9ad85a, stem: 0x6a5a2a, stemD: 0x4a3a1a, root: 0x7a5232, rootD: 0x4e321c,
  };
  const PC = [-0.5, 15.5, 0], AX = 11, AY = 8.6, AZ = 9.6;
  const ang = (x, z) => Math.atan2(z - PC[2], x - PC[0]);
  const lobe = (x, z) => (1 + Math.cos(ang(x, z) * 10)) / 2; // 0 lobe centre (one faces front) .. 1 groove
  // the carved face sits on a smooth front: lobes fade out within ~55 degrees of +z
  const faceSector = (x, z) => Math.max(0, 1 - Math.abs(ang(x, z) - Math.PI / 2) / 0.95);
  const pumpkin = (x, y, z) => {
    const gr = lobe(x, z) * (1 - faceSector(x, z) * 0.85);
    if (gr > 0.86) return K.groove;
    const t = (y - (PC[1] - AY)) / (AY * 2);
    const base = t > 0.72 ? K.orL : t < 0.25 ? K.orD : K.or;
    return gr > 0.6 ? shade(base, -0.1) : base;
  };

  // ------------------------------------------------------------ the pumpkin (body)
  const body = G();
  blob(body, PC[0], PC[1], PC[2], AX, AY, AZ, pumpkin, { p: 2.1 });
  body.carve((x, y, z) => {
    const d = ((x + 0.5 - PC[0] - 0.5) / (AX + 0.35)) ** 2 + ((y + 0.5 - PC[1] - 0.5) / (AY + 0.35)) ** 2 + ((z + 0.5 - PC[2] - 0.5) / (AZ + 0.35)) ** 2;
    return d > 1 - 0.1 * lobe(x, z) * (1 - faceSector(x, z));
  });
  // the lid is cut out of the top (zig-zag cut line)
  const cutY = (x, z) => 22 + ((Math.round(ang(x, z) * 4) & 1) ? 1 : 0);
  const lidIn = (x, y, z) => Math.hypot(x - PC[0], z - PC[2]) < 5.6 && y >= cutY(x, z);
  const lid = G();
  body.forEach((x, y, z, c) => { if (lidIn(x, y, z)) lid.set(x, y, z, c); });
  body.carve((x, y, z) => lidIn(x, y, z));
  body.forEach((x, y, z) => { if (Math.hypot(x - PC[0], z - PC[2]) < 6.4 && Math.hypot(x - PC[0], z - PC[2]) >= 5.6 && y >= 21 && !body.has(x, y + 1, z)) body.set(x, y, z, K.groove); });
  // carved face: angry triangle eyes lit from inside, pupils, a nose and a jagged grin
  const carveFace = (poly, backCol, glowFn) => {
    for (let x = -12; x <= 11; x++) for (let y = 4; y <= 24; y++) {
      if (!inPoly(x + 0.5, y + 0.5, poly)) continue;
      const z = frontZ(body, x, y, -5, 14);
      if (z === null) continue;
      for (let k = 0; k < 3; k++) body.del(x, y, z - k);
      const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => inPoly(x + dx + 0.5, y + dy + 0.5, poly));
      const gl = glowFn ? glowFn(x, y, inner) : false;
      body.set(x, y, z - 3, gl === 'pupil' ? INK : gl === 'rim' ? K.candleD : gl === 'lit' ? K.lit : backCol, gl === true);
      if (gl === 'pupil') body.set(x, y, z - 2, INK);
    }
  };
  const eyeL = [[-8.8, 23], [-1.4, 20], [-3.8, 16.4], [-8.2, 17.4]];
  const eyeR = eyeL.map(([x, y]) => [-1 - x, y]);
  const eyeFn = (px) => (x, y, inner) => (x >= px && x <= px + 1 && y >= 17 && y <= 18 ? 'pupil' : inner && y <= 19 ? true : inner ? 'lit' : 'rim');
  carveFace(eyeL, K.candle, eyeFn(-4));
  carveFace(eyeR, K.candle, eyeFn(2));
  carveFace([[-1.9, 16.2], [0.9, 16.2], [-0.5, 14.2]], K.inside);
  const grin = [[-8.4, 14.4], [-5, 13.2], [-0.5, 12.8], [4, 13.2], [7.4, 14.4], [5.2, 10.2], [-0.5, 8.8], [-6.2, 10.2]];
  carveFace(grin, K.inside, (x, y) => (Math.abs(x + 0.5) <= 1 && y <= 9 ? true : Math.abs(x + 0.5) <= 2.5 && y <= 10 ? 'rim' : false));
  // square pumpkin-flesh teeth left standing in the grin (two hang from the top, three rise from the bottom)
  const colY = (x, top) => { let r = null; for (let y = 4; y <= 16; y++) if (inPoly(x + 0.5, y + 0.5, grin)) { if (top) r = y; else if (r === null) r = y; } return r; };
  for (const [x0, top] of [[-5, true], [-1, true], [3, true], [-3, false], [1, false]]) {
    for (let x = x0; x <= x0 + 1; x++) {
      const ye = colY(x, top);
      if (ye === null) continue;
      for (let k = 0; k < (top ? 2 : 1); k++) {
        const y = top ? ye - k : ye + k;
        const z = frontZ(body, x, y, -5, 14);
        if (z !== null) body.set(x, y, z + 1, K.flesh);
      }
    }
  }
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 19, z: -3 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 19, z: 1 });
  hollowOut(body, 2);

  // ------------------------------------------------------------ lid: stem, curly tendril and a leaf (pops up on attacks)
  const LJ = [-0.5, 22, -5];
  chain(lid, [[-0.5, 23, 0], [-0.3, 26, -0.5], [0.6, 28.5, -1.4], [1.8, 29.6, -1]], [1.7, 1.5, 1.3, 1], (x, y) => ((y + 40) % 2 ? K.stem : K.stemD));
  const curl = [];
  for (let i = 0; i <= 16; i++) { const a = i * 0.55, r = 3.2 - i * 0.14; curl.push([-2.5 + Math.cos(a) * r, 25.5 + i * 0.25, -1 + Math.sin(a) * r]); }
  for (let i = 1; i < curl.length; i++) capsule(lid, curl[i - 1], curl[i], 0.5, 0.5, K.vine);
  leaf(lid, [1.5, 24, -1], [8, 26.5, -4], 2.6, { leaf: K.vine, vein: K.vineD, edge: K.vineL }, { plane: 'xz', cup: -1 });

  // ------------------------------------------------------------ vine arms with warty gourd fists
  const arm = G();
  chain(arm, [[-10, 16, 0], [-13, 13, 1], [-14.5, 9.5, 2.5]], [2.4, 2.1, 2], (x, y, z) => ((x + y + z + 60) % 4 === 0 ? K.vineD : (x + y + 60) % 5 === 0 ? K.vineL : K.vine));
  for (const [a, b] of [[[-11, 15, 2.4], [-12.6, 16.8, 3.4]], [[-13.6, 11.2, 3.6], [-15.4, 12.6, 4.6]]]) capsule(arm, a, b, 0.5, 0.3, K.vineL); // tendrils
  blob(arm, -15, 6.5, 3.5, 3.5, 3.4, 3.6, (x, y, z) => (n3(x, y, z, 8) < 0.12 ? K.wart : (y + 40) % 3 === 0 ? K.vineD : K.gourd), { p: 2.2 });
  for (const [x, y, z] of [[-17, 8, 6], [-14, 9, 6], [-12, 6, 6], [-17, 4, 5]]) blob(arm, x, y, z, 0.8, 0.8, 0.8, K.wart);

  // ------------------------------------------------------------ root legs
  const leg = G();
  capsule(leg, [-4.5, 8, 0], [-5, 3, 0.5], 2.4, 2.2, (x, y) => ((y + 40) % 3 === 0 ? K.vineD : K.vine));
  blob(leg, -5, 1.5, 1, 3, 1.6, 3.2, K.root, { p: 2.3, clip: (x, y) => y < 0 });
  for (const dx of [-2, 0, 2]) capsule(leg, [-5 + dx, 1, 3], [-5 + dx * 1.3, 0.4, 5.6], 0.8, 0.5, K.rootD);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('legL', leg, [-4.5, 8, 0]), jp('legR', flipX(leg), [3.5, 8, 0]),
      jp('body', body, BODYJ),
      jp('lid', lid, LJ, BODYJ, { parent: 'body' }),
      jp('armL', arm, [-10, 16, 0], BODYJ, { parent: 'body' }),
      jp('armR', flipX(arm), [9, 16, 0], BODYJ, { parent: 'body' }),
    ],
    muzzle: [-0.5, 10, 12],
  };
}

// ===========================================================================
// Shark Byte (TeamSeas Reef): a chunky hammerhead that walks the reef in yellow
// scuba flippers and a red-and-white swim ring. Angry eyes on the tips of its
// hammer, a huge grin of triangle teeth, a dorsal fin with a bite taken out of
// it (the "byte") and the magenta bolt. Very fast and bites constantly.
function sharkByte() {
  const K = {
    top: 0x3f6aa8, main: 0x6a9ad8, light: 0xa8ccf4, belly: 0xf4f8ff, bellyD: 0xd6e2f0, gum: 0xff4f7a,
    fin: 0xffd23f, finD: 0xe09a12, ring: 0xff3a3a, ringW: 0xffffff, eye: 0xffffff,
  };
  const skin = (bellyY) => (x, y, z) => (y <= bellyY ? K.belly : y >= bellyY + 7 ? K.top : n3(x, y, z, 3) < 0.07 ? K.light : K.main);

  // ------------------------------------------------------------ body: torpedo + swim ring + bitten dorsal fin
  const body = G();
  blob(body, -0.5, 12, -3, 5.8, 5.4, 9.2, skin(9.5), { p: 2.2 });
  // gill slits
  for (const s of [-1, 1]) for (const z of [2, 0, -2]) for (let y = 10; y <= 14; y++) {
    const xs = s < 0 ? -9 : 8;
    for (let x = xs; s < 0 ? x <= -1 : x >= 0; x -= s) if (body.has(x, y, z)) { body.set(x, y, z, K.top); break; }
  }
  // lifebuoy swim ring round the waist
  for (let k = 0; k < 220; k++) {
    const a = (k / 220) * Math.PI * 2;
    const cx = -0.5 + Math.cos(a) * 6.9, cz = -4 + Math.sin(a) * 8.6;
    const col = Math.floor(((a + 0.4) / (Math.PI * 2)) * 8) % 2 ? K.ringW : K.ring;
    blob(body, cx, 9.5, cz, 1.6, 1.6, 1.6, col);
  }
  // the dorsal fin with a bite taken out of it
  const FIN = [[1.5, 15.5], [-1.5, 20.5], [-5, 24.5], [-8.8, 26.2], [-7.6, 23], [-7.4, 19.5], [-9.6, 15.5]];
  for (let y = 14; y <= 27; y++) for (let z = -12; z <= 3; z++) {
    if (!inPoly(z + 0.5, y + 0.5, FIN)) continue;
    if (Math.hypot(z + 0.5 + 7.6, y + 0.5 - 20.6) < 1.9) continue; // the "byte"
    const xs = y <= 17 ? [-2, -1, 0, 1] : [-1, 0];
    for (const x of xs) body.set(x, y, z, y >= 23 ? K.top : K.main);
  }
  stamp(body, BOLT_S, { M: MAG }, { axis: '-x', y: 22, z: -3 });
  stamp(body, rev(BOLT_S), { M: MAG }, { axis: 'x', y: 22, z: -6 });
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 15, z: -4 });
  stamp(body, BOLT_R, { M: MAG }, { axis: 'x', y: 15, z: -8 });
  gradY(body, 6, 18, -0.08, 0.05, (x, y, z, c) => c === K.main || c === K.top);
  hollowOut(body, 2);

  // ------------------------------------------------------------ head: the hammer
  const HJ = [-0.5, 12, 4];
  const head = G();
  blob(head, -0.5, 14, 8, 5.4, 4.4, 5.4, skin(11.5), { p: 2.2 });
  blob(head, -0.5, 16.2, 10.6, 12.4, 2.7, 3.4, skin(14.5), { p: 2.6 });
  blob(head, -0.5, 15.4, 12.8, 4.2, 2.4, 2.2, skin(14), { p: 2.2 }); // snout
  for (const x of [-4, 3]) head.set(x, 16, 14, INK); // nostrils
  // angry eyes on the tips of the hammer
  orbEye(head, -12, 16.8, 11.2, 2.4, -1, { lid: K.top, browCol: INK, slant: 0.5, lift: 0.35, pw: 2, ph: 2, inward: 0.6, browR: 0.8 });
  orbEye(head, 11, 16.8, 11.2, 2.4, 1, { lid: K.top, browCol: INK, slant: 0.5, lift: 0.35, pw: 2, ph: 2, inward: 0.6, browR: 0.8 });
  // the grin: carve under the hammer, gum line + zig-zag upper teeth
  head.carve((x, y, z) => y <= 12.5 && z >= 7);
  head.carve((x, y) => y < 10);
  head.forEach((x, y, z) => {
    if (y !== 13 || z < 7) return;
    const rim = !head.has(x, 13, z + 1) || !head.has(x + 1, 13, z) || !head.has(x - 1, 13, z);
    if (!rim) { head.set(x, y, z, MOUTH); return; }
    head.set(x, 13, z, K.gum);
    head.set(x, 12, z, TOOTH);
    if ((x + z + 40) % 2 === 0) head.set(x, 11, z, TOOTH);
  });
  for (let x = -6; x <= 5; x++) for (let y = 10; y <= 12; y++) if (head.has(x, y, 6)) head.set(x, y, 6, MOUTH);
  gradY(head, 9, 20, -0.06, 0.06, (x, y, z, c) => c === K.main || c === K.top);

  // ------------------------------------------------------------ jaw (drops wide on every bite)
  const JJ = [-0.5, 12, 5];
  const jaw = G();
  blob(jaw, -0.5, 10.6, 9.8, 5, 1.9, 4.6, (x, y) => (y <= 9 ? K.bellyD : K.belly), { p: 2.4 });
  jaw.carve((x, y) => y > 11);
  jaw.forEach((x, y, z) => {
    if (y !== 11) return;
    const rim = !jaw.has(x, 11, z + 1) || !jaw.has(x + 1, 11, z) || !jaw.has(x - 1, 11, z);
    if (rim) { jaw.set(x, 11, z, K.gum); jaw.set(x, 12, z, TOOTH); if ((x + z + 41) % 2 === 0) jaw.set(x, 13, z, TOOTH); }
    else jaw.set(x, y, z, Math.abs(x + 0.5) <= 2 && z <= 12 ? TONGUE : MOUTH);
  });

  // ------------------------------------------------------------ pectoral fins (arms)
  const arm = G();
  leaf(arm, [-5.5, 10.5, 1], [-12, 8, -2.5], 2.3, { leaf: K.main, vein: K.top, edge: K.top }, { plane: 'xz', veins: false });

  // ------------------------------------------------------------ crescent tail fin
  const TJ = [-0.5, 12.5, -11];
  const tail = G();
  chain(tail, [[-0.5, 12.5, -11], [-0.5, 13, -14.5], [-0.5, 13.5, -17]], [2.8, 2, 1.4], skin(11));
  leaf(tail, [-0.5, 13.5, -16.5], [-0.5, 22, -22], 2.2, { leaf: K.top, edge: K.main }, { plane: 'zy', thick: 2 });
  leaf(tail, [-0.5, 13, -16.5], [-0.5, 7, -20.5], 1.7, { leaf: K.top, edge: K.main }, { plane: 'zy', thick: 2 });
  tail.forEach((x, y, z, c) => { if (x === -1 && c !== undefined) tail.set(0, y, z, c); });

  // ------------------------------------------------------------ legs in yellow scuba flippers
  const leg = G();
  capsule(leg, [-3.6, 7.5, -2], [-3.8, 2.6, -1.5], 2, 1.8, skin(5));
  leaf(leg, [-3.8, 1, -3.5], [-3.8, 0.5, 7], 2.8, { leaf: K.fin, vein: K.finD, edge: K.finD }, { plane: 'xz', thick: 2, thickDir: -1, round: 0.7, blunt: 0.25 });
  rbox(leg, -6, 1, -3, -2, 3, 0, 1, K.finD); // strap

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('legL', leg, [-3.6, 7.5, -2]), jp('legR', flipX(leg), [2.6, 7.5, -2]),
      jp('body', body, BODYJ),
      jp('armL', arm, [-5.5, 10.5, 1], BODYJ, { parent: 'body' }),
      jp('armR', flipX(arm), [4.5, 10.5, 1], BODYJ, { parent: 'body' }),
      jp('tail', tail, TJ),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.25, 0, 0] }),
    ],
    muzzle: [-0.5, 12, 15],
  };
}

// ===========================================================================
// Jelly Zapper (TeamSeas Reef): a cyan jellyfish with a frilly magenta skirt,
// an angry toothy face on its bell, a crackling yellow spark core and the
// magenta bolt on top. Frilly oral arms whip up to zap, and lightning-bent
// tentacles with glowing tips trail beneath it. Floats over the brawl and
// chains its zaps.
function jellyZapper() {
  const K = {
    bell: 0x5ad8ff, bellD: 0x2a9ad8, bellL: 0xc8f4ff, dot: 0xffffff, frill: 0xff5ac8, frillD: 0xd83aa8,
    arm: 0xff8ad8, armD: 0xc84ab8, tent: 0x7ae8ff, tentD: 0x3ab8e0, spark: 0xfff27a, core: 0xfff27a,
  };
  const bellCol = (x, y, z) => {
    if (n3(x, y, z, 5) < 0.06 && y > 19) return K.dot;
    return y >= 24 ? K.bellL : y <= 18 ? K.bellD : K.bell;
  };

  // ------------------------------------------------------------ the bell (body) with the face
  const body = G();
  blob(body, -0.5, 18, 0, 9.6, 9, 9.6, bellCol, { p: 2.1, clip: (x, y) => y < 15 });
  body.carve((x, y, z) => y <= 17 && Math.hypot(x + 0.5, z) < 6.6); // hollow underside of the bell
  // scalloped frill skirt round the rim
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const r = 9.4;
    const x = Math.round(-0.5 + Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    const len = 1 + (Math.cos(a * 12) > 0 ? 2 : 0);
    for (let i = 0; i < len; i++) body.set(x, 15 - i, z, i === len - 1 ? K.frillD : K.frill);
  }
  // angry eyes + a toothy grin on the front of the bell
  for (const [cx, side] of [[-3.9, -1], [2.9, 1]]) {
    const cz = (frontZ(body, Math.round(cx), 21) ?? 8) - 1;
    eyeBall(body, cx, 21.2, cz, [2.5, 2.7, 1.8], side, { pw: 2, ph: 3, inward: 0.7, down: 0.6, browCol: K.bellD, browT: 2, browHi: 0.85, browLo: 0.15, browOut: 0 });
  }
  openMouth(body, -5, 4, 16, 19, (x, y) => Math.abs(x + 0.5) <= 4.6 - (y === 16 ? 1.5 : 0) - (y === 19 ? 0.8 : 0), { depth: 3, top: 2, bot: 1, period: 3, zmin: -2, zmax: 14 });
  // spark core on top + magenta bolt crest
  blob(body, -0.5, 27.2, -0.5, 0.9, 0.6, 0.9, K.core, { glow: true });
  stamp(body, BOLT, { M: { c: MAG, raise: 1 } }, { axis: 'y', x: -3, z: -5 });
  hollowOut(body, 2);

  // ------------------------------------------------------------ frilly oral arms (whip up to zap)
  const arm = G();
  const ap = [[-2.8, 15, 3], [-3.6, 12, 4.2], [-2.8, 9, 4.6], [-3.8, 6, 4.4], [-3, 3.5, 4]];
  chain(arm, ap, [1.7, 1.6, 1.4, 1.1, 0.6], (x, y, z) => ((y + 40) % 3 === 0 ? K.armD : K.arm));
  for (let i = 1; i < ap.length - 1; i++) for (const dx of [-1.8, 1.8]) blob(arm, ap[i][0] + dx, ap[i][1], ap[i][2] + 0.4, 0.8, 1.1, 0.8, K.frill);

  // ------------------------------------------------------------ lightning-bent tentacles with glowing tips
  const tent = (x0, z0, phase) => {
    const g = G();
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push([x0 + ((i + phase) % 2 ? 1.3 : -1.3) * Math.min(1, i / 2), 15 - i * 2.2, z0 + (i % 2 ? 0.6 : -0.4)]);
    chain(g, pts, [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4], (x, y) => ((y + 40) % 4 === 0 ? K.tentD : K.tent));
    const e = pts[6];
    g.set(Math.round(e[0]), Math.round(e[1]) - 1, Math.round(e[2]), K.spark, true);
    return g;
  };
  const legFL = tent(-5.5, 4, 0), legBL = tent(-5, -4.5, 1);
  tent(-2, 0.5, 1).forEach((x, y, z, c, gl) => legFL.set(x, y, z, c, gl)); // + a shorter inner tentacle

  return {
    gait: 'float', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('body', body, BODYJ),
      jp('armL', arm, [-2.8, 15, 3], BODYJ, { parent: 'body' }),
      jp('armR', flipX(arm), [1.8, 15, 3], BODYJ, { parent: 'body' }),
      jp('legFL', legFL, [-5.5, 15, 4], BODYJ, { parent: 'body' }),
      jp('legFR', flipX(legFL), [4.5, 15, 4], BODYJ, { parent: 'body' }),
      jp('legBL', legBL, [-5, 15, -4.5], BODYJ, { parent: 'body' }),
      jp('legBR', flipX(legBL), [4, 15, -4.5], BODYJ, { parent: 'body' }),
    ],
    muzzle: [-0.5, 12, 6],
  };
}

// ===========================================================================
// Magma Titan (Volcano Forge, legendary): a colossal obsidian titan cracked
// with glowing lava. A caged magma core in its chest under the magenta bolt,
// erupting volcano cones for shoulders, curved obsidian horns and a crown of
// fire, blazing eyes over a lava-filled roar, and boulder fists. Every slam
// splashes burning magma over a whole crowd.
function magmaTitan() {
  const K = {
    rock: 0x2e2428, rockD: 0x1c161a, rockL: 0x4c3c44, crust: 0x7a2a16, lava: 0xff6a1a, lavaL: 0xffb03a, lavaY: 0xffe14a,
    horn: 0x3a2e36, hornL: 0x8a6a5a, tooth: 0xfff0d0, eye: 0xfff2a0, ember: 0xffd23f,
  };
  // obsidian plates (3D Voronoi cells) with lava running along the seams between them;
  // seam voxels are orange paint and only a few of them actually glow
  const CELL = 7;
  const feat = (i, j, k, seed) => [(i + n3(i, j, k, seed)) * CELL, (j + n3(i, j, k, seed + 1)) * CELL, (k + n3(i, j, k, seed + 2)) * CELL];
  const magma = (seed) => (x, y, z) => {
    const ci = Math.floor(x / CELL), cj = Math.floor(y / CELL), ck = Math.floor(z / CELL);
    let d1 = 1e9, d2 = 1e9, best = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const f = feat(ci + a, cj + b, ck + c, seed);
      const d = Math.hypot(x + 0.5 - f[0], y + 0.5 - f[1], z + 0.5 - f[2]);
      if (d < d1) { d2 = d1; d1 = d; best = f; } else if (d < d2) d2 = d;
    }
    const gap = d2 - d1;
    if (gap < 0.32) return K.lava;
    if (gap < 0.75) return K.crust;
    const k = n3(Math.floor(best[0]), Math.floor(best[1]), Math.floor(best[2]), seed + 5); // each plate its own tone
    return k < 0.3 ? K.rockD : k > 0.8 ? K.rockL : K.rock;
  };
  const glowCracks = (g, p = 0.12, seed = 1) => g.forEach((x, y, z, c) => { if (c === K.lava && n3(x, y, z, seed) < p * 0.3) g.set(x, y, z, K.lavaL, true); });

  // ------------------------------------------------------------ legs
  const leg = G();
  capsule(leg, [-6, 13, 0], [-7, 5, 0.5], 4.4, 3.9, magma(3));
  blob(leg, -7, 8.5, 3, 2.8, 2.6, 2, K.rockL, { p: 2.6 }); // knee plate
  rbox(leg, -12, 0, -4, -2, 4, 6, 1.6, magma(5));
  for (const x of [-10.5, -7, -3.5]) capsule(leg, [x, 1.5, 6], [x, 0.6, 8.6], 1.1, 0.5, (xx, yy, zz, t) => (t > 0.7 ? K.lavaL : K.rockD));
  glowCracks(leg, 0.1, 2);
  hollowOut(leg, 2);

  // ------------------------------------------------------------ torso
  const body = G();
  blob(body, -0.5, 21.5, -0.5, 12.6, 9.6, 8.4, magma(1), { p: 2.6 });
  blob(body, -0.5, 13, -0.5, 9, 3.6, 7, magma(4), { p: 2.4 }); // pelvis
  // the magma core shows through a lightning-bolt window in the chest, rimmed in magenta
  const BIG = ['....MMMM', '...MMMM.', '..MMMM..', '.MMMM...', '.MMMMMMM', '...MMMM.', '..MMMM..', '..MMM...', '.MMM....', '.MM.....'];
  const win = new Set();
  BIG.forEach((row, v) => [...row].forEach((ch, u) => { if (ch === 'M') win.add(`${-4 + u},${26 - v}`); }));
  for (const k of win) {
    const [x, y] = k.split(',').map(Number);
    const z = frontZ(body, x, y, -2, 14);
    if (z === null) continue;
    body.del(x, y, z); body.del(x, y, z - 1);
    const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => win.has(`${x + dx},${y + dy}`));
    body.set(x, y, z - 2, inner ? K.lavaL : K.lava, inner);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (win.has(`${x + dx},${y + dy}`)) continue;
      const zz = frontZ(body, x + dx, y + dy, -2, 14);
      if (zz !== null) body.set(x + dx, y + dy, zz, MAG);
    }
  }
  // volcano shoulders with lava in their craters
  for (const s of [-1, 1]) {
    const x = s < 0 ? -11.5 : 10.5;
    cyl(body, 'y', x, -1, 26, 33, 5, 2.4, magma(7));
    cyl(body, 'y', x, -1, 33, 33, 1.5, 1.5, K.lava);
    cyl(body, 'y', x, -1, 32, 32, 1, 1, K.lavaY, { glow: true });
    body.del(Math.round(x), 33, -1);
    for (let i = 1; i <= 3; i++) body.set(Math.round(x) + (i % 2 ? s : 0), 33 - i * 1.6 | 0, (i % 2 ? 3 : 2), K.lava); // dribble
  }
  // obsidian spikes down the spine + bolt on the back
  for (const [y, z] of [[29, -6], [25, -8], [20, -8.6]]) capsule(body, [-0.5, y, z], [-0.5, y + 2.4, z - 3.6], 1.6, 0.3, K.horn);
  stamp(body, BOLT, { M: MAG }, { axis: '-z', x: -3, y: 19 });
  glowCracks(body, 0.1, 6);
  hollowOut(body, 2);

  // ------------------------------------------------------------ head: horned, fire crown, blazing eyes, lava roar
  const HJ = [-0.5, 29, 2];
  const head = G();
  blob(head, -0.5, 34.5, 4, 6.8, 5.6, 6, magma(9), { p: 2.3 });
  blob(head, -0.5, 31, 6.5, 6.2, 3, 4.4, magma(9), { p: 2.4 }); // heavy jaw line
  // brow ridge (angry V)
  for (let x = -7; x <= 6; x++) {
    const yb = Math.round(36 + Math.abs(x + 0.5) * 0.32);
    for (let y = yb; y <= yb + 1; y++) for (let z = 7; z <= 10; z++) if (z <= 10 - (y - yb)) head.set(x, y, z, y === yb + 1 ? K.rockL : K.rock);
  }
  for (const [cx, side] of [[-3.4, -1], [2.4, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 34) ?? 9) - 1;
    eyeBall(head, cx, 34.2, cz, [1.7, 1.4, 1.2], side, { white: K.eye, glow: true, pupil: 0x3a0a06, pw: 2, ph: 2, inward: 0.5, down: 0.3, brow: false, glint: false });
  }
  openMouth(head, -6, 5, 29, 32, (x, y) => Math.abs(x + 0.5) <= 5.2 - (y === 29 ? 1.4 : 0), {
    depth: 3, top: 2, bot: 0, period: 3, tooth: K.tooth, lipCol: K.rockD, zmin: 0, zmax: 16,
    backFn: (x, y) => (y <= 30 && Math.abs(x + 0.5) <= 2.5 ? { c: K.lavaL, glow: n3(x, y, 1, 4) < 0.5 } : { c: K.crust }),
  });
  // curved obsidian horns
  for (const s of [-1, 1]) {
    const X = (v) => (s < 0 ? v : -1 - v);
    const pts = [[-5.5, 37.5, 3], [-9, 39.5, 3.5], [-10.6, 42.8, 5], [-9.6, 45.5, 7]].map(([x, y, z]) => [X(x), y, z]);
    chain(head, pts, [2.2, 1.8, 1.2, 0.5], (x, y, z) => (y >= 43 ? K.hornL : (y + 40) % 3 === 0 ? K.rockD : K.horn));
  }
  // crown of fire
  for (const [x, z, h, gl] of [[-0.5, 4, 6, 1], [-2.6, 3, 4], [1.6, 3, 4], [-0.5, 1, 4]]) flame(head, x, 39.5, z, h, { w: 1.5, lean: -0.3, glow: !!gl });
  glowCracks(head, 0.08, 3);
  hollowOut(head, 2);

  // ------------------------------------------------------------ jaw: underbite with lava-tipped tusks
  const JJ = [-0.5, 29.5, 4];
  const jaw = G();
  blob(jaw, -0.5, 28.4, 7.6, 5.6, 1.8, 4, magma(11), { p: 2.4 });
  jaw.carve((x, y) => y > 29);
  for (let x = -5; x <= 4; x++) for (let z = 4; z <= 11; z++) if (jaw.has(x, 29, z)) jaw.set(x, 29, z, Math.abs(x + 0.5) <= 2 ? K.lavaL : K.crust);
  for (const x of [-5, 4]) capsule(jaw, [x, 29.5, 10.2], [x + (x < 0 ? -0.4 : 0.4), 32.5, 10.6], 0.9, 0.4, K.tooth);
  for (const x of [-2, 1]) jaw.set(x, 30, 11, K.tooth);

  // ------------------------------------------------------------ arms with boulder fists
  const arm = G();
  blob(arm, -13, 27, -0.5, 4.2, 4, 4.4, magma(13), { p: 2.4 }); // shoulder mass
  capsule(arm, [-13.5, 26, 0], [-17, 18, 1.5], 3.9, 3.4, magma(13));
  capsule(arm, [-17, 18, 1.5], [-18, 11.5, 3], 3.4, 3.2, magma(14));
  blob(arm, -18.5, 7.5, 4, 4.6, 4.2, 4.6, magma(15), { p: 2.5 });
  stamp(arm, BOLT, { M: MAG }, { axis: '-x', y: 23, z: 3 });
  for (const [x, y] of [[-21, 9], [-18.5, 10], [-16, 9]]) capsule(arm, [x, y, 7.4], [x, y + 0.4, 9.2], 1, 0.4, K.rockL); // knuckle spikes
  glowCracks(arm, 0.12, 8);
  hollowOut(arm, 2);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('legL', leg, [-6, 13, 0]), jp('legR', flipX(leg), [5, 13, 0]),
      jp('body', body, BODYJ),
      jp('armL', arm, [-13.5, 26, 0], BODYJ, { parent: 'body' }),
      jp('armR', flipX(arm), [12.5, 26, 0], BODYJ, { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.1, 0, 0] }),
    ],
    muzzle: [-0.5, 30, 13],
  };
}

// ===========================================================================
// Ember Imps (Volcano Forge): a trio of little red fire imps. Huge horned
// heads with a flame tuft, pointed ears, yellow slit eyes and a wicked grin,
// fluttering bat wings, goat legs on black hooves, a spade-tipped tail and a
// pitchfork with red-hot prongs. Every jab sets the target on fire.
function emberImps() {
  const K = {
    red: 0xe8302a, redD: 0xa81a1a, redL: 0xff6a4a, belly: 0xffa05a, bellyD: 0xe87a3a, horn: 0x2a1a22, hornL: 0xfff0d0, hoof: 0x1a1018, soot: 0x3a1a1e,
    wing: 0x8a1a3a, wingD: 0x5a0a22, eye: 0xfff27a, iron: 0x4a3a4a, ironL: 0x7a6a7a, hot: 0xff8a1f, gold: 0xffc93a,
  };
  const skin = (x, y, z) => (n3(x, y, z, 2) < 0.06 ? K.redD : K.red);

  // ------------------------------------------------------------ body: pot belly + belt
  const body = G();
  blob(body, -0.5, 12.5, -0.5, 5.4, 5, 4.6, skin, { p: 2.2 });
  body.paint((x, y, z) => (z >= 1 && y <= 13.5 && Math.abs(x + 0.5) <= 3.6 ? ((y + 40) % 3 === 0 && y >= 10 ? K.bellyD : K.belly) : undefined));
  body.paint((x, y) => (y >= 8 && y <= 9 ? K.soot : undefined)); // sooty belt
  rbox(body, -2, 8, 3, 1, 9, 4, 0, K.gold); // buckle
  stamp(body, BOLT, { M: MAG }, { axis: 'z', x: -3, y: 16, zmin: 1 });
  gradY(body, 7, 17, -0.1, 0.05, (x, y, z, c) => c === K.red || c === K.redD);
  hollowOut(body, 2);

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 16, 0.5];
  const head = G();
  blob(head, -0.5, 23.5, 1.5, 8.6, 7.4, 7, skin, { p: 2.2 });
  blob(head, -0.5, 19.6, 4.6, 6.6, 3.8, 4.6, skin, { p: 2.2 }); // cheeks + chin
  blob(head, -0.5, 21.2, 9.6, 1.8, 1.3, 1.2, K.redL); // snout
  for (const x of [-2, 1]) head.set(x, 21, 11, K.redD); // nostrils
  // pointed ears with a pierced gold ring
  for (const s of [-1, 1]) {
    const ex = s < 0 ? -8 : 7;
    capsule(head, [ex, 23, 1], [ex + s * 6.2, 26.2, -1.4], 2.4, 0.4, skin);
    capsule(head, [ex + s * 0.6, 23.2, 2.2], [ex + s * 5, 25.6, 0.2], 1.1, 0.2, K.redL);
  }
  cyl(head, 'x', 24.4, -0.6, -12, -12, 1.4, 1.4, K.gold, { hollow: 0.8 });
  // ridged horns with bone tips
  for (const s of [-1, 1]) {
    const X = (v) => (s < 0 ? v : -1 - v);
    chain(head, [[-4.6, 29, 2], [-6.6, 33, 0.8], [-7, 36.6, -1.6]].map(([x, y, z]) => [X(x), y, z]), [2, 1.3, 0.35], (x, y) => (y >= 35 ? K.hornL : (y + 40) % 2 ? K.horn : 0x3e2a34));
  }
  // flame tuft
  for (const [x, z, h, gl] of [[-0.5, 2.5, 7, 1], [-2.6, 0.5, 5], [1.6, 0.5, 5], [-0.5, -1.5, 4]]) flame(head, x, 30, z, h, { w: 1.6, lean: -0.4, glow: !!gl });
  // angry yellow slit eyes
  for (const [cx, side] of [[-4.2, -1], [3.2, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 24) ?? 8) - 1;
    eyeBall(head, cx, 24.2, cz, [2.7, 2.9, 1.9], side, { white: K.eye, pw: 1, ph: 4, inward: 0.3, down: 0.5, browCol: K.horn, browT: 2, browHi: 1.2, browLo: 0.2, browOut: 1 });
  }
  // soot freckles + wicked grin full of sharp teeth
  for (const [x, y] of [[-7, 21], [-6, 20], [-8, 20], [6, 21], [5, 20], [7, 20]]) { const z = frontZ(head, x, y, -4, 14); if (z !== null) head.set(x, y, z, K.redD); }
  openMouth(head, -6, 5, 16, 19, (x, y) => Math.abs(x + 0.5) <= 5.6 - (y === 16 ? 2 : y === 17 ? 0.8 : 0) + (y === 19 ? 0.4 : 0), { depth: 3, top: 3, bot: 2, period: 3, lipCol: K.redD, zmin: -2, zmax: 14 });
  gradY(head, 15, 31, -0.08, 0.06, (x, y, z, c) => c === K.red || c === K.redD);
  hollowOut(head, 2);

  // ------------------------------------------------------------ arms: a clawed hand + the red-hot pitchfork
  const armL = G();
  capsule(armL, [-5.6, 14.5, 0], [-8.8, 10.4, 2.2], 1.6, 1.3, skin);
  blob(armL, -9.2, 9.4, 2.8, 1.9, 1.8, 1.9, skin);
  for (const dx of [-1, 0, 1]) capsule(armL, [-9.4 + dx * 1.1, 8.4, 4], [-9.6 + dx * 1.3, 7, 5], 0.45, 0.3, K.horn);
  const armR = G();
  capsule(armR, [4.6, 14.5, 0], [7.6, 10.8, 3], 1.6, 1.3, skin);
  blob(armR, 7.8, 10.2, 3.6, 1.9, 1.8, 1.9, skin);
  capsule(armR, [7.8, 1.5, 4], [7.8, 26, 4], 0.75, 0.75, (x, y) => (y >= 9 && y <= 11 ? K.soot : (y + 40) % 6 === 0 ? K.ironL : K.iron));
  capsule(armR, [4.4, 26, 4], [11.2, 26, 4], 0.75, 0.75, K.iron);
  for (const x of [4.4, 7.8, 11.2]) {
    capsule(armR, [x, 26, 4], [x, 31.5, 4], 0.7, 0.35, (xx, y) => (y >= 30 ? 0xffd23f : y >= 28 ? K.hot : K.iron));
    armR.set(Math.round(x - 0.5), 32, 4, 0xfff2a0, x === 7.8);
  }

  // ------------------------------------------------------------ bat wings
  const wing = G();
  const WP = [[0, 0], [4.6, 7], [9.4, 6.6], [11.2, 1.4], [8.2, -2.4], [4.4, -1.8]];
  for (let u = 0; u <= 12; u += 0.4) for (let v = -3; v <= 8; v += 0.4) {
    if (!inPoly(u, v, WP)) continue;
    if (Math.hypot(u - 8, v + 0.2) < 1.8 || Math.hypot(u - 11, v - 3.6) < 1.6) continue; // scallops
    const vein = Math.abs(v - u * 0.6) < 0.5 || Math.abs(v - u * 0.15) < 0.45;
    wing.set(Math.round(-4 - u * 0.85), Math.round(15 + v), Math.round(-3.5 - u * 0.5), vein ? K.wingD : K.wing);
  }
  capsule(wing, [-4, 15, -3.5], [-7.9, 22, -5.8], 0.7, 0.5, K.horn);
  capsule(wing, [-7.9, 22, -5.8], [-12, 21.6, -8.2], 0.5, 0.35, K.horn);
  capsule(wing, [-7.9, 22, -5.8], [-13.5, 16.4, -9.1], 0.4, 0.3, K.horn);
  wing.set(-8, 23, -6, K.hornL);

  // ------------------------------------------------------------ goat legs on cloven hooves
  const leg = G();
  capsule(leg, [-3.4, 9, 0], [-4, 5, -1.2], 2.2, 1.7, skin);
  capsule(leg, [-4, 5, -1.2], [-3.8, 2, 0.4], 1.5, 1.3, (x, y) => (y <= 3 ? K.soot : K.redD));
  rbox(leg, -5.6, 0, -1.2, -2, 1.6, 2.6, 0.6, (x) => (x === -4 ? INK : K.hoof));

  // ------------------------------------------------------------ spade-tipped tail
  const TJ = [-0.5, 9.5, -4];
  const tail = G();
  chain(tail, [[-0.5, 9.5, -4], [-0.5, 7.5, -8], [-0.5, 10, -12], [-0.5, 14, -13.4]], [1.1, 0.9, 0.8, 0.6], K.redD);
  const SP = [[0, 0], [-2.8, 2.4], [-1.2, 3.4], [0, 6.4], [1.2, 3.4], [2.8, 2.4]];
  for (let y = 13; y <= 21; y++) for (let z = -17; z <= -10; z++) {
    const u = z + 13.4, v = y - 14;
    if (!inPoly(u, v, SP)) continue;
    const edge = !inPoly(u + 1, v, SP) || !inPoly(u - 1, v, SP) || !inPoly(u, v + 1, SP);
    for (const x of [-1, 0]) tail.set(x, y, z, edge ? K.red : K.horn);
  }

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('legL', leg, [-3.4, 9, 0]), jp('legR', flipX(leg), [2.4, 9, 0]),
      jp('body', body, BODYJ),
      jp('wingL', wing, [-4, 15, -3.5], BODYJ, { parent: 'body' }),
      jp('wingR', flipX(wing), [3, 15, -3.5], BODYJ, { parent: 'body' }),
      jp('armL', armL, [-5.6, 14.5, 0], BODYJ, { parent: 'body' }),
      jp('armR', armR, [4.6, 14.5, 0], BODYJ, { parent: 'body' }),
      jp('tail', tail, TJ),
      jp('head', head, HJ),
    ],
    muzzle: [7.8, 30, 5],
  };
}

// ===========================================================================
// Astro Panther (Zero-G Space Station, legendary): the Panther sculpt in
// cosmic indigo fur full of stars, wearing white-and-orange space armour with a
// MrBeast mission patch, a gold visor pushed up on its forehead and a radio
// antenna, and riding twin rocket tanks on its back. Hovers on jet flames and
// fires mini-rocket volleys from the tank noses.
function astroPanther() {
  const K = {
    fur: 0x4c3ce0, nebula: 0x8a3ae0, dark: 0x2a1e9a, light: 0xb0a4ff, muzzle: 0xd8d0ff, star: 0xfff6d0,
    suit: 0xf4f6fa, suitD: 0xc8d0e0, orange: 0xff8a1f, gold: 0xffc93a, goldD: 0xd08a12, visor: 0xffb02a,
  };
  const furFn = (x, y, z) => {
    const k = n3(x, y, z, 17);
    if (k < 0.025) return K.star;
    const neb = n3(x >> 2, y >> 2, z >> 2, 19);
    return neb < 0.25 ? K.nebula : K.fur;
  };
  const S = { fur: K.fur, dark: K.dark, light: K.light, muzzle: K.muzzle, bolt: MAG, claw: INK, inner: 0xff8ad8, nose: INK, iris: INK };
  const m = pantherMold(S, { furFn, noFlankBolt: true });
  const g = m.grids, j = m.joints;
  // a few stars actually twinkle
  g.body.forEach((x, y, z, c) => { if (c === K.star && n3(x, y, z, 23) < 0.12) g.body.set(x, y, z, c, true); });

  // ------------------------------------------------------------ space armour
  const b = g.body;
  b.paint((x, y, z, c) => {
    if (z >= 5 && y >= 8 && y <= 17) return y === 13 ? K.orange : K.suit; // chest plate
    if (y >= 15 && z <= 4 && z >= -9 && Math.abs(x + 0.5) <= 5.6) return (z + 40) % 5 === 0 ? K.suitD : K.suit; // back plate
    return undefined;
  });
  cyl(b, 'z', -0.5, 12, 10, 10, 2.4, 2.4, (x, y) => (Math.hypot(x + 0.5, y - 12) > 1.8 ? K.gold : 0x2a3a8a)); // mission patch
  stamp(b, ['.MM', 'MM.', 'MMM', '.MM', 'MM.'], { M: MAG }, { axis: 'z', x: -2, y: 14, zmin: 10 });
  for (const s of [-1, 1]) blob(b, s < 0 ? -6.5 : 5.5, 15, 4, 3, 2.2, 3.2, (x, y) => (y >= 16 ? K.suit : K.orange), { p: 2.4 }); // shoulder pads
  stamp(b, BOLT, { M: MAG }, { axis: '-x', y: 13, z: -5 });
  stamp(b, BOLT_R, { M: MAG }, { axis: 'x', y: 13, z: -2 });
  // space boots
  for (const k of ['legFL', 'legFR', 'legBL', 'legBR']) g[k].paint((x, y, z, c) => (y <= 3 && c !== INK ? K.suit : y === 4 ? K.orange : undefined));
  // gold visor pushed up on the forehead + radio antenna
  const hd = g.head;
  rbox(hd, -8, 27, 9, 7, 29, 14, 1.2, (x, y, z) => (z >= 13 || y === 27 ? K.suitD : K.suit));
  rbox(hd, -6, 27, 14, 5, 28, 15, 0.5, K.visor);
  hd.set(-5, 28, 15, WHITE, false);
  // star on the tail tip
  const tl = g.tail;
  blob(tl, -0.5, 25, -13.5, 1.9, 1.9, 1.9, K.gold);
  tl.set(-1, 27, -13, K.star, true);

  // ------------------------------------------------------------ antenna (wobbles)
  const ant = G();
  capsule(ant, [6.5, 26, 8], [8.5, 33, 6], 0.5, 0.4, K.suitD);
  blob(ant, 8.7, 33.8, 5.9, 1, 1, 1, MAG);
  ant.set(8, 34, 6, MAG_L, true);

  // ------------------------------------------------------------ twin rocket tanks (recoil when the rockets fire)
  const CJ = [-0.5, 18, -4];
  const pods = G();
  for (const x of [-4.4, 3.4]) {
    cyl(pods, 'z', x, 19.5, -11, 2, 2.5, 2.5, (xx, y, z) => ((z + 40) % 5 === 0 ? K.orange : y >= 21 ? K.suit : K.suitD));
    cyl(pods, 'z', x, 19.5, 3, 6, 2.2, 0.5, (xx, y, z) => (z >= 5 ? MAG : K.orange)); // nose cone (rocket)
    cyl(pods, 'z', x, 19.5, -13, -12, 1.6, 2.2, GUN); // nozzle
  }
  // flames pointing backwards from the nozzles
  for (const x of [-4.4, 3.4]) for (let i = 0; i < 5; i++) {
    const r = 1.6 - i * 0.3;
    blob(pods, x, 19.5, -14 - i, r, r, 0.6, i >= 3 ? 0xe8fdff : i >= 1 ? 0x9ff2ff : 0xffd23f, { glow: i === 4 });
  }
  rbox(pods, -2, 17, -8, 1, 18, 0, 0.5, GUN); // saddle strap
  stamp(pods, BOLT_S, { M: MAG }, { axis: '-x', y: 22, z: -6 });
  stamp(pods, rev(BOLT_S), { M: MAG }, { axis: 'x', y: 22, z: -8 });

  const parts = [
    jp('legFL', g.legFL, j.legFL), jp('legFR', g.legFR, j.legFR), jp('legBL', g.legBL, j.legBL), jp('legBR', g.legBR, j.legBR),
    jp('body', g.body, BODYJ),
    jp('cannon', pods, CJ, BODYJ, { parent: 'body' }),
    jp('head', g.head, j.head),
    jp('jaw', g.jaw, j.jaw, j.head, { parent: 'head', rot: [0.12, 0, 0] }),
    jp('antenna', ant, [6.5, 26, 8], j.head, { parent: 'head' }),
    jp('tail', g.tail, j.tail),
  ];
  return { gait: 'float', voxel: 0.05, jitter: 0.02, parts, muzzle: [-4.4, 19.5, 7] };
}

// ===========================================================================
// UFO Grabber (Zero-G Space Station): a living flying saucer. A green alien
// critter with angry eyes, a toothy grin and glowing antennae rides in the
// glass cockpit, a ring of lights spins round the rim, two pincer arms reach
// out and an arcade-machine claw dangles under the stun-beam emitter.
function ufoGrabber() {
  const K = {
    hull: 0x7a5ae8, hullD: 0x4a34b0, hullL: 0xb8a4ff, rim: CHROME, rimD: CHROME_D, glass: 0xbff4ff, glassD: 0x8ad8f0,
    alien: 0x8af04a, alienD: 0x4aa82a, alienL: 0xc8ff8a, beam: 0x7cff3a, light1: 0xffd23f, light2: MAG, gold: 0xffc93a,
  };

  // ------------------------------------------------------------ saucer hull
  const body = G();
  blob(body, -0.5, 13, 0, 13, 2.8, 13, (x, y, z) => {
    if (y === 13) return (Math.round(Math.atan2(z, x + 0.5) * 6) & 1) ? K.rim : K.rimD;
    if (y > 13) return n3(x, y, z, 4) < 0.05 ? K.hullL : (x + z + 40) % 9 === 0 ? K.hullD : K.hull;
    return K.hullD;
  }, { p: 2 });
  // cockpit ring
  cyl(body, 'y', -0.5, 0, 15, 16, 6.6, 6.6, K.rim, { hollow: 1.2 });
  // portholes round the underside
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const x = Math.round(-0.5 + Math.cos(a) * 8.6), z = Math.round(Math.sin(a) * 8.6);
    for (let y = 9; y <= 13; y++) if (body.has(x, y, z) && !body.has(x, y - 1, z)) { body.set(x, y, z, K.glassD); break; }
  }
  // stun-beam emitter under the belly
  cyl(body, 'y', -0.5, 0, 8, 10, 2.8, 2.4, GUN);
  cyl(body, 'y', -0.5, 0, 7, 7, 1.6, 1.6, K.beam);
  body.set(-1, 7, 0, K.beam, true); body.set(0, 7, -1, K.beam, true);
  stamp(body, BOLT, { M: { c: MAG, raise: 1 } }, { axis: 'y', x: -3, z: 6 });
  hollowOut(body, 2);

  // ------------------------------------------------------------ the spinning ring of rim lights
  const SJ = [-0.5, 13, 0];
  const ring = G();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = Math.round(-0.5 + Math.cos(a) * 13.6), z = Math.round(Math.sin(a) * 13.6);
    ring.set(x, 13, z, k % 2 ? K.light1 : K.light2, k % 4 === 0);
    ring.set(x, 12, z, K.rimD);
  }

  // ------------------------------------------------------------ the alien pilot (head)
  const HJ = [-0.5, 15, 0];
  const head = G();
  capsule(head, [-0.5, 15, 0], [-0.5, 18, 0.5], 2.6, 2.4, K.alienD);
  blob(head, -0.5, 22, 0.8, 6.2, 5.4, 5.2, (x, y, z) => (n3(x, y, z, 6) < 0.06 ? K.alienL : y <= 18 ? K.alienD : K.alien), { p: 2.2 });
  for (const [cx, side] of [[-3.2, -1], [2.2, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 23) ?? 6) - 1;
    eyeBall(head, cx, 23, cz, [2.4, 2.7, 1.8], side, { pupil: 0x2a0a4a, pw: 2, ph: 3, inward: 0.7, down: 0.6, browCol: K.alienD, browT: 2, browHi: 1.1, browLo: 0.2, browOut: 0 });
  }
  openMouth(head, -4, 3, 18, 20, (x, y) => Math.abs(x + 0.5) <= 3.8 - (y === 18 ? 1.4 : 0), { depth: 2, top: 2, bot: 1, period: 2, zmin: -2, zmax: 12 });
  stamp(head, BOLT_S, { M: MAG }, { axis: 'y', x: -2, z: -2 });
  // glass canopy behind the pilot (open at the front so the face reads)
  blob(head, -0.5, 16, 0, 8.4, 9.4, 8.4, (x, y, z) => ((x + y + z + 60) % 7 === 0 ? WHITE : K.glass), { p: 2, hollow: 1, clip: (x, y, z) => y < 16 || z > -1 + (y - 16) * -0.4 || (z > -3 && y > 23) });

  // ------------------------------------------------------------ jaw
  const JJ = [-0.5, 18.5, 3];
  const jaw = G();
  blob(jaw, -0.5, 17.4, 4.4, 3.4, 1.2, 2, K.alienD, { p: 2.2 });
  jaw.carve((x, y) => y > 18);
  for (let x = -3; x <= 2; x++) jaw.set(x, 18, 5, (x & 1) ? TOOTH : MOUTH);

  // ------------------------------------------------------------ antennae with glowing tips
  const antL = G();
  capsule(antL, [-3, 26.5, 0.5], [-5.5, 31.5, -0.5], 0.5, 0.4, K.alienD);
  blob(antL, -5.7, 32.2, -0.6, 1.1, 1.1, 1.1, K.beam);
  antL.set(-6, 33, -1, WHITE, true);

  // ------------------------------------------------------------ pincer arms
  const arm = G();
  capsule(arm, [-12, 12.5, 2], [-14.5, 8, 4], 1, 0.9, K.rimD);
  blob(arm, -14.6, 7.6, 4.2, 1.5, 1.5, 1.5, GUN);
  for (const s of [-1, 1]) {
    capsule(arm, [-14.6, 7, 4.6], [-14.6 + s * 1.4, 4.4, 6.2], 0.6, 0.4, K.rim);
    capsule(arm, [-14.6 + s * 1.4, 4.4, 6.2], [-14.6 + s * 0.4, 3.2, 7.4], 0.4, 0.3, K.gold);
  }

  // ------------------------------------------------------------ the arcade claw (dangles and sways)
  const TJ = [-0.5, 8, 0];
  const claw = G();
  capsule(claw, [-0.5, 8, 0], [-0.5, 4.8, 0], 0.5, 0.5, (x, y) => ((y + 40) % 2 ? K.rimD : GUN));
  blob(claw, -0.5, 4, 0, 1.6, 1.1, 1.6, K.gold);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    chain(claw, [[-0.5 + dx * 1.2, 3.6, dz * 1.2], [-0.5 + dx * 3, 2, dz * 3], [-0.5 + dx * 2.2, 0.4, dz * 2.2]], [0.6, 0.5, 0.35], K.rim);
  }

  return {
    gait: 'float', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('body', body, BODYJ),
      jp('spin', ring, SJ, BODYJ, { parent: 'body' }),
      jp('tail', claw, TJ, BODYJ, { parent: 'body' }),
      jp('armL', arm, [-12, 12.5, 2], BODYJ, { parent: 'body' }),
      jp('armR', flipX(arm), [11, 12.5, 2], BODYJ, { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.1, 0, 0] }),
      jp('antennaL', antL, [-3, 26.5, 0.5], HJ, { parent: 'head' }),
      jp('antennaR', flipX(antL), [2, 26.5, 0.5], HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, 7, 0],
  };
}

export const WAVE3_MODELS = {
  vineViper,
  templeGolem,
  laserLynx,
  vaultBot,
  ghostPanther,
  pumpkinBrute,
  sharkByte,
  jellyZapper,
  magmaTitan,
  emberImps,
  astroPanther,
  ufoGrabber,
};
