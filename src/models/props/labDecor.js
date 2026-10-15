// Beast Lab room dressing (the start scene, scenes/lab.js): voxel neon signs
// with tube letters, bubbling specimen tubes with creatures floating inside,
// a detailed ceiling (beams, light fixtures, vents with spinning fans, cable
// trays, pipes), corner pipe risers, posters, a wall clock, Feastables crates,
// MrBeast Lab boxes, a tool cart, chemical drums, gas bottles, a glowing floor
// grate and hazard rings - plus the shared interior props (props/interior.js).
//
// Performance: everything static is cached voxel geometry (big flat parts are
// greedy-meshed), repeated items are instanced, every bubble in the room is
// one InstancedMesh, and update() allocates nothing.
import {
  THREE, VoxGrid, Mats, makeMesh, PAL, shade, mixHex, hash3, ring, text, glassMat, tintMat, group, instanced,
} from './common.js';
import { aoGeometry, dense } from './voxmesh.js';
import { blob, capsule, chain, BOLT_SMALL } from '../kit.js';
import {
  tube, gaugeZ, valve, labScreen, tickLabScreens, makeConsole, makeComputer, makeLabShelf, makeVialRack, makeLabDoor,
  makeMonitorWall, makeFloorTiles, makeWallPanel, makeLabDesk, makeMug,
} from './interior.js';

const SCREW = 0xe8edf4;
const CARD = 0xc9a06a, CARD_L = 0xe0bc84, CARD_D = 0x9a7446;

/** Mesh from cached greedy geometry without AO (flat scenery; opts.skip drops never-seen faces). */
function gmesh(id, fn, opts, o = {}) {
  const m = makeMesh(aoGeometry('ld_g_' + id, fn, { ao: false, ...opts }), o.mats ?? Mats.pair);
  m.name = id;
  m.castShadow = !!o.shadow;
  m.receiveShadow = o.receive !== false;
  return m;
}
/** Mesh from cached AO voxel geometry (detailed props). */
function amesh(id, fn, opts, o = {}) {
  const m = makeMesh(aoGeometry('ld_' + id, fn, opts), o.mats ?? Mats.pair);
  m.name = id;
  m.castShadow = o.shadow ?? true;
  m.receiveShadow = !!o.receive;
  return m;
}
const place = (o, x, y, z, ry = 0, s = 1) => { o.position.set(x, y, z); o.rotation.y = ry; if (s !== 1) o.scale.setScalar(s); return o; };

/** Lit pixels of a string in the 3x5 pixel font: [[u, v]] with v = 0 at the bottom. */
function fontPixels(str) {
  const t = new VoxGrid();
  const w = text(t, str, 0, 0, 0, '+z', 1);
  const pts = [];
  t.forEach((x, y) => pts.push([x, y]));
  return { pts, w };
}

// ---------------------------------------------------------------------------
// Neon signs: glowing 1-voxel tubes that trace the pixel font (skeleton
// strokes, not filled blocks), standing off a dark board with a pink light
// spill, clips, a metal frame and corner brackets.

function neonGrid(str, color, color2, o) {
  const s = o.step ?? 3;
  const { pts, w } = fontPixels(str);
  const lit = new Set(pts.map(([u, v]) => u + ',' + v));
  const TW = (w - 1) * s + 1, TH = 4 * s + 1;
  const ox = -Math.floor(TW / 2), oy = -Math.floor(TH / 2);
  const tubes = new Map(); // "x,y" -> colour
  const P = (u, v) => [ox + u * s, oy + v * s];
  const line = (a, b, c) => {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
    for (let i = 0; i <= n; i++) tubes.set(Math.round(a[0] + ((b[0] - a[0]) * i) / n) + ',' + Math.round(a[1] + ((b[1] - a[1]) * i) / n), c);
  };
  const strokes = (set, at, c) => {
    for (const k of set) {
      const [u, v] = k.split(',').map(Number);
      line(at(u, v), at(u, v), c);
      if (set.has(`${u + 1},${v}`)) line(at(u, v), at(u + 1, v), c);
      if (set.has(`${u},${v + 1}`)) line(at(u, v), at(u, v + 1), c);
      for (const du of [1, -1]) if (set.has(`${u + du},${v + 1}`) && !set.has(`${u + du},${v}`) && !set.has(`${u},${v + 1}`)) line(at(u, v), at(u + du, v + 1), c);
    }
  };
  strokes(lit, P, color);
  // optional lightning bolts either side of the text
  const pad = o.pad ?? 4;
  let bx0 = ox - pad, bx1 = ox + TW - 1 + pad;
  if (o.bolts) {
    const bolt = new Set();
    BOLT_SMALL.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'M') bolt.add(`${c},${BOLT_SMALL.length - 1 - r}`); }));
    const bs = 2, bw = 4 * bs + 1, bh = 6 * bs + 1;
    const lx = bx0 - bw + 1, rx = bx1 + 2;
    const by = oy + Math.floor((TH - bh) / 2);
    strokes(bolt, (u, v) => [lx + u * bs, by + v * bs], color2);
    strokes(bolt, (u, v) => [rx + u * bs, by + v * bs], color2);
    bx0 = lx - 3; bx1 = rx + bw + 2;
  }
  const by0 = oy - pad, by1 = oy + TH - 1 + pad;
  const g = dense(bx0 - 1, by0 - 1, -1, bx1 + 1, by1 + (o.hang ?? 0) + 1, 4);
  const board = o.board ?? 0x17112c;
  // light spill (Chebyshev distance 1..2 from a tube)
  const spill = new Map();
  for (const k of tubes.keys()) {
    const [x, y] = k.split(',').map(Number);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const kk = (x + dx) + ',' + (y + dy);
      const prev = spill.get(kk);
      if (!prev || prev.d > d) spill.set(kk, { d, c: tubes.get(k) });
    }
  }
  for (let x = bx0; x <= bx1; x++)
    for (let y = by0; y <= by1; y++) {
      const edge = x === bx0 || x === bx1 || y === by0 || y === by1;
      if (edge) { g.box(x, y, 0, x, y, 2, y === by0 ? PAL.metalDD : PAL.metalD); continue; }
      const sp = spill.get(x + ',' + y);
      const base = (y - by0) % 4 === 0 ? shade(board, 0.06) : board;
      g.box(x, y, 0, x, y, 1, sp ? mixHex(base, sp.c, sp.d <= 1 ? 0.5 : 0.24) : base);
    }
  for (const [x, y] of [[bx0 + 1, by0 + 1], [bx1 - 1, by0 + 1], [bx0 + 1, by1 - 1], [bx1 - 1, by1 - 1]]) g.set(x, y, 2, SCREW);
  // corner brackets (second colour)
  for (const [cx, cy, sx, sy] of [[bx0 + 2, by0 + 2, 1, 1], [bx1 - 2, by0 + 2, -1, 1], [bx0 + 2, by1 - 2, 1, -1], [bx1 - 2, by1 - 2, -1, -1]]) {
    for (let i = 0; i < 4; i++) { g.set(cx + sx * i, cy, 3, color2, true); g.set(cx, cy + sy * i, 3, color2, true); }
  }
  // tubes + clips + electrode caps
  let i = 0;
  for (const [k, c] of tubes) {
    const [x, y] = k.split(',').map(Number);
    g.set(x, y, 3, c, true);
    if ((x * 7 + y * 3 + i++) % 11 === 0) g.set(x, y, 2, PAL.metalL);
  }
  // hanging cables up to the ceiling
  if (o.hang) for (const x of [bx0 + 4, bx1 - 4]) g.box(x, by1 + 1, 1, x, by1 + o.hang, 1, PAL.metalDD);
  return g;
}

/** Voxel neon sign. Returns a group with .material (its own glow material, for flicker). o: { color, color2, vox, bolts, hang } */
export function neonSign(str, o = {}) {
  const color = o.color ?? PAL.pink, color2 = o.color2 ?? PAL.cyan;
  const geo = aoGeometry(`ld_neon_${str}_${color}_${color2}_${o.bolts ? 1 : 0}_${o.hang ?? 0}_${o.step ?? 3}`, () => neonGrid(str, color, color2, o), { scale: o.vox ?? 0.07, pivot: [0, 0, 0], maxSamples: 30 });
  const gm = tintMat();
  gm.color.setScalar(2.6);
  const mesh = new THREE.Mesh(geo, [Mats.solid, gm]);
  mesh.castShadow = false;
  const root = group(mesh);
  root.name = 'neon:' + str;
  root.material = gm;
  return root;
}

// ---------------------------------------------------------------------------
// Bubbles: every rising bubble in the room is one instanced voxel cube.

const bubbleGeo = new THREE.BoxGeometry(1, 1, 1);
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false });
const glassGeos = new Map();
export class BubbleField {
  constructor(max = 200) {
    this.max = max;
    this.n = 0;
    this.mesh = new THREE.InstancedMesh(bubbleGeo, bubbleMat, max);
    this.mesh.name = 'bubbles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    this.st = new Float32Array(max * 10); // cx, cz, r, a, y, speed, size, y0, y1, phase
    this.t = 0;
    this._c = new THREE.Color();
  }
  /** A column of n bubbles rising from y0 to y1 within radius r around (cx, cz). */
  column(cx, cz, y0, y1, r, n, color, size = 0.05) {
    for (let i = 0; i < n && this.n < this.max; i++, this.n++) {
      const k = this.n * 10, st = this.st;
      st[k] = cx; st[k + 1] = cz; st[k + 2] = r * Math.sqrt(Math.random()); st[k + 3] = Math.random() * Math.PI * 2;
      st[k + 4] = y0 + Math.random() * (y1 - y0); st[k + 5] = 0.25 + Math.random() * 0.5; st[k + 6] = size * (0.6 + Math.random() * 0.8);
      st[k + 7] = y0; st[k + 8] = y1; st[k + 9] = Math.random() * 6;
      this.mesh.setColorAt(this.n, this._c.setHex(mixHex(color, 0xffffff, 0.55)));
    }
    this.mesh.count = this.n;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.update(0);
  }
  update(dt) {
    this.t += dt;
    const st = this.st, arr = this.mesh.instanceMatrix.array, t = this.t;
    for (let i = 0; i < this.n; i++) {
      const k = i * 10;
      let y = st[k + 4] + dt * st[k + 5];
      if (y > st[k + 8]) { y = st[k + 7]; st[k + 3] = Math.random() * Math.PI * 2; }
      st[k + 4] = y;
      const s = st[k + 6] * (y > st[k + 8] - 0.08 ? 0.5 : 1);
      const m = i * 16;
      arr[m] = s; arr[m + 1] = 0; arr[m + 2] = 0; arr[m + 3] = 0;
      arr[m + 4] = 0; arr[m + 5] = s; arr[m + 6] = 0; arr[m + 7] = 0;
      arr[m + 8] = 0; arr[m + 9] = 0; arr[m + 10] = s; arr[m + 11] = 0;
      arr[m + 12] = st[k] + Math.cos(st[k + 3]) * st[k + 2] + Math.sin(t * 3 + st[k + 9]) * 0.015;
      arr[m + 13] = y;
      arr[m + 14] = st[k + 1] + Math.sin(st[k + 3]) * st[k + 2];
      arr[m + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Specimens floating in the tubes (0.05 voxels, ~0.6 units tall)

function frontSet(g, x, y, c, glow = false, zmax = 30) {
  for (let z = zmax; z >= -zmax; z--) if (g.has(x, y, z)) { g.set(x, y, z, c, glow); return z; }
  return null;
}
const SPECIMENS = {
  eye() {
    const g = dense(-14, -18, -14, 14, 14, 14);
    blob(g, 0, 0, 0, 5, 5, 5, (x, y) => (y < -3 ? 0xffd2d8 : 0xf6f1ea));
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
      const d = Math.hypot(dx, dy);
      if (d <= 1.2) frontSet(g, dx, dy, PAL.ink);
      else if (d <= 2.9) frontSet(g, dx, dy, d < 2.1 ? 0x1fa8d8 : 0x0d6a9a);
    }
    frontSet(g, -1, 1, 0xffffff, true);
    chain(g, [[0, -4, -3], [1, -8, -4], [-1, -12, -3], [0, -15, -1]], [2, 0.8], 0xd86a7a);
    return g;
  },
  brain() {
    const g = dense(-14, -18, -14, 14, 14, 14);
    blob(g, 0, 0, 0, 6, 4.5, 5, (x, y, z) => ((Math.sin(x * 1.4 + z * 0.5) + Math.cos(z * 1.3 + y * 1.1)) > 0.9 ? 0xc0506e : 0xf08aa8));
    g.paint((x, y, z, c) => ((x === 0 || x === -1) && y > 1 ? 0xb04060 : undefined));
    capsule(g, [0, -3, -1], [0, -11, -2], 1.6, 0.9, 0xe07a96);
    return g;
  },
  squid() {
    const g = dense(-14, -18, -14, 14, 14, 14);
    blob(g, 0, 4, 0, 4, 5, 4, (x, y) => (y > 6 ? 0xc08aff : 0x9a5ae0));
    for (const x of [-3, 2]) { frontSet(g, x, 4, 0xffffff); frontSet(g, x + 1, 4, 0xffffff); frontSet(g, x + (x < 0 ? 1 : 0), 3, PAL.ink); frontSet(g, x + (x < 0 ? 0 : 1), 3, 0xffffff); }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const pts = [];
      for (let k = 0; k <= 4; k++) pts.push([Math.cos(a) * (2 + k * 0.7) + Math.sin(k * 1.4 + i) * 1.2, 0 - k * 3, Math.sin(a) * (2 + k * 0.7)]);
      chain(g, pts, [1.3, 0.3], 0x8a4ad0);
    }
    return g;
  },
  blob() {
    const g = dense(-14, -18, -14, 14, 14, 14);
    blob(g, 0, 0, 0, 6, 5, 5, (x, y) => (y > 3 ? 0x9dff6a : y < -2 ? 0x3fae2a : 0x6ad84a), { p: 2.2 });
    for (const [x, y, r] of [[-3, 2, 1.6], [2, 3, 1.3], [0, -1, 1.1]]) {
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.hypot(dx, dy) <= r) frontSet(g, x + dx, y + dy, 0xffffff);
      frontSet(g, x, y, PAL.ink);
    }
    for (let x = -3; x <= 2; x++) frontSet(g, x, -3, 0x1d4a1a);
    capsule(g, [-6, -1, 0], [-9, -4, 1], 1.4, 0.8, 0x5ac83a);
    capsule(g, [5, -1, 0], [8, 1, 1], 1.4, 0.8, 0x5ac83a);
    return g;
  },
  panther() {
    const g = dense(-14, -18, -14, 14, 14, 14);
    blob(g, 0, -2, -1, 5, 4, 4, PAL.blue);
    blob(g, 0, 4, 1, 4.5, 3.6, 3.6, PAL.blue);
    for (const sx of [-1, 1]) {
      capsule(g, [sx * 3 - (sx < 0 ? 1 : 0), 7, 1], [sx * 4 - (sx < 0 ? 1 : 0), 10, 1], 1.4, 0.4, PAL.blue);
      g.set(sx * 4 - (sx < 0 ? 1 : 0), 9, 2, PAL.pink);
    }
    for (const x of [-3, -2, 1, 2]) frontSet(g, x, 4, PAL.ink);
    frontSet(g, -1, 2, PAL.pink); frontSet(g, 0, 2, PAL.pink);
    for (const [x, y] of [[-1, 7], [0, 6], [-1, 6], [0, 5]]) frontSet(g, x, y, PAL.pink);
    chain(g, [[4, -4, -3], [7, -3, -1], [7, 0, 2], [4, 1, 4]], [1.2, 0.8], PAL.blue);
    g.set(4, 1, 5, PAL.pink).set(3, 1, 5, PAL.pink);
    return g;
  },
  toilet() {
    const g = dense(-14, -18, -14, 14, 14, 14);
    blob(g, 0, 0, 2, 5, 3, 5, 0xffffff, { p: 2.5 });
    g.box(-4, 3, 1, 3, 3, 6, 0xe8ecf2);
    g.box(-4, 1, -5, 3, 9, -2, 0xf4f6fa);
    g.box(-5, 10, -5, 4, 10, -1, 0xd8dde6);
    for (const x of [-3, 1]) { g.set(x, 7, -1, 0xffffff).set(x + 1, 7, -1, PAL.ink).set(x, 6, -1, PAL.ink).set(x + 1, 6, -1, PAL.ink); }
    g.box(-1, -4, 0, 0, -2, 3, 0xe2e8f0);
    g.box(-2, 1, 4, 1, 2, 6, 0x5a3220);
    return g;
  },
};

// ---------------------------------------------------------------------------
// Specimen tube: voxel base (vents, hazard band, LEDs, readout), struts,
// glass, translucent voxel liquid, a floating creature, a cap and a pipe up
// to the ceiling with a valve.

const liquidMats = new Map();
function liquidMat(c) {
  let m = liquidMats.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ vertexColors: true, color: c, transparent: true, opacity: 0.55, depthWrite: false }); liquidMats.set(c, m); }
  return m;
}

function tubeBaseGrid(Rv, Hv, acc) {
  const color = PAL.cyan;
  const g = dense(-(Rv + 6), 0, -(Rv + 6), Rv + 6, 9 + Hv + 10, Rv + 7);
  const ang = (x, z) => Math.atan2(z, x) + Math.PI;
  g.cylinder(0, 0, 0, 1, Rv + 4, PAL.metalDD);
  g.cylinder(0, 0, 2, 6, Rv + 3, (x, y, z) => (y === 2 ? PAL.metalD : y === 6 ? PAL.metalL : (Math.floor((ang(x, z) / (Math.PI * 2)) * 20) % 2 && y === 4) ? 0x2a2f3a : PAL.metal));
  ring(g, 0, 0, 3, 3, Rv + 3, (x, y, z) => ((Math.floor((ang(x, z) / (Math.PI * 2)) * 28) & 1) ? PAL.yellow : PAL.ink), false, 1);
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2 + 0.2;
    g.set(Math.round(Math.cos(t) * (Rv + 3.7)), 5, Math.round(Math.sin(t) * (Rv + 3.7)), a % 2 ? color : PAL.slime, true);
  }
  // readout box on the front
  g.box(-3, 2, Rv + 3, 2, 7, Rv + 4, PAL.ink);
  g.box(-2, 4, Rv + 5, 1, 6, Rv + 5, (x, y) => (y === 5 || (x + y) % 3 === 0 ? color : 0x0d2030));
  g.set(-2, 3, Rv + 5, PAL.slime, true).set(1, 3, Rv + 5, acc);
  // collar + struts + top collar
  ring(g, 0, 0, 7, 8, Rv + 1, PAL.metalL, false, 1);
  const cy = 9 + Hv;
  for (const t of [Math.PI * 0.15, Math.PI * 0.85, Math.PI * 1.5]) {
    const x = Math.round(Math.cos(t) * (Rv + 1)), z = Math.round(Math.sin(t) * (Rv + 1));
    g.box(x, 9, z, x, cy - 1, z, PAL.metalD);
    for (let y = 14; y < cy - 2; y += 12) g.set(Math.round(Math.cos(t) * (Rv + 2)), y, Math.round(Math.sin(t) * (Rv + 2)), SCREW);
  }
  // glass glints
  const ga = Math.PI * 0.64;
  g.box(Math.round(Math.cos(ga) * (Rv - 0.6)), 12, Math.round(Math.sin(ga) * (Rv - 0.6)), Math.round(Math.cos(ga) * (Rv - 0.6)), cy - 6, Math.round(Math.sin(ga) * (Rv - 0.6)), 0xeefcff);
  // cap
  ring(g, 0, 0, cy, cy, Rv + 1, PAL.metalL, false, 2);
  g.cylinder(0, 0, cy + 1, cy + 3, Rv + 2, (x, y) => (y === cy + 2 ? acc : PAL.metal));
  for (let a = 0; a < 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    g.set(Math.round(Math.cos(t) * (Rv + 2.6)), cy + 2, Math.round(Math.sin(t) * (Rv + 2.6)), SCREW);
  }
  g.cylinder(0, 0, cy + 4, cy + 4, Rv, PAL.metalD);
  g.cylinder(0, 0, cy + 5, cy + 5, Math.max(2, Rv - 3), PAL.metal);
  g.box(-1, cy + 6, -1, 0, cy + 6, 0, PAL.metalD);
  return g;
}

/** Pipe from a tube cap (y0) up to the ceiling (y1), voxel units, with flanges and a valve. */
function tubePipeGrid(y0, y1, acc) {
  const g = dense(-6, y0 - 1, -6, 6, y1 + 1, 7);
  tube(g, 'y', y0, y1, 0, 0, 2, PAL.metalL, { every: 18, flange: acc, off: 6 });
  const vy = y0 + 7;
  g.box(0, vy, 3, 0, vy, 4, PAL.metalD);
  valve(g, 0, vy, 5, 3, PAL.red);
  g.box(-4, y1 - 1, -4, 4, y1, 4, PAL.metalD);
  return g;
}

/** Colour-neutral liquid column (tinted by its material): darker at the bottom, white foam on top. */
function tubeLiquidGrid(Rv, Hv) {
  const c = 0xffffff;
  const g = dense(-Rv, 8, -Rv, Rv, 9 + Hv, Rv);
  const top = 9 + Math.round(Hv * 0.86);
  const dark = 0x6a6a6a;
  g.cylinder(0, 0, 9, top, Rv - 1, (x, y, z) => {
    if (y === top) return 0xffffff;
    const yb = Math.floor((y - 9) / 4) * 4;
    return mixHex(dark, c, Math.sqrt(yb / (top - 9)));
  });
  return g;
}

/** A bubbling specimen tube. Returns { root, top (liquid surface y), inner radius, specimen, update(dt, t) }. */
export function specimenTube(o = {}) {
  const color = o.color ?? PAL.cyan, acc = o.accent ?? PAL.pink;
  const V = 0.05;
  const Rv = Math.round((o.r ?? 0.34) / V), Hv = Math.round((o.h ?? 2.4) / V);
  const topV = o.ceiling ? Math.round(o.ceiling / V) : 0;
  const base = amesh(`tube_${Rv}_${Hv}_${acc}`, () => tubeBaseGrid(Rv, Hv, acc), { scale: V, pivot: [0.5, 0, 0.5] });
  const liq = new THREE.Mesh(aoGeometry(`ld_tubeLiq_${Rv}_${Hv}`, () => tubeLiquidGrid(Rv, Hv), { scale: V, pivot: [0.5, 0, 0.5], ao: false, jitter: 0.04 }), liquidMat(color));
  liq.renderOrder = 2;
  const H = Hv * V, R = (Rv + 0.5) * V;
  const gk = R + '|' + H;
  if (!glassGeos.has(gk)) glassGeos.set(gk, new THREE.CylinderGeometry(R, R, H, 20, 1, true));
  const glass = new THREE.Mesh(glassGeos.get(gk), glassMat(0xd8f8ff, 0.16));
  glass.position.y = 9 * V + H / 2;
  glass.renderOrder = 3;
  const root = group(base, liq, glass);
  root.name = 'specimenTube';
  const cy = 9 + Hv;
  if (topV > cy + 16) {
    const pipe = amesh(`tubePipe_${cy + 5}_${topV}_${acc}`, () => tubePipeGrid(cy + 5, topV, acc), { scale: V, pivot: [0.5, 0, 0.5] }, { shadow: false });
    root.add(pipe);
  } else {
    const cap = amesh(`tubeBeacon_${cy}`, () => new VoxGrid().box(-1, cy + 7, -1, 0, cy + 8, 0, color, true), { scale: V, pivot: [0.5, 0, 0.5] }, { shadow: false });
    root.add(cap);
  }
  const top = (9 + Math.round(Hv * 0.86)) * V;
  let spec = null;
  if (o.specimen && SPECIMENS[o.specimen]) {
    spec = makeMesh(aoGeometry('ld_spec_' + o.specimen, SPECIMENS[o.specimen], { scale: V, pivot: 'center', maxSamples: 10 }), Mats.pair);
    spec.castShadow = false;
    spec.position.y = (9 * V + top) / 2;
    spec.rotation.y = o.specRot ?? 0;
    root.add(spec);
  }
  const ph = Math.random() * 6, y0 = spec?.position.y ?? 0;
  return {
    root, top, y0: 9.5 * V, rIn: (Rv - 2) * V, spec,
    update(dt, t) {
      if (!spec) return;
      spec.position.y = y0 + Math.sin(t * 0.9 + ph) * 0.08;
      spec.rotation.y += dt * 0.25;
      spec.rotation.z = Math.sin(t * 0.6 + ph) * 0.12;
    },
  };
}

// ---------------------------------------------------------------------------
// Ceiling

/** Ceiling panels (one merged mesh): 2-unit tiles with grout and bevels, a few vent tiles, beams along x and z. */
function ceilingGrid(nx, nz, beamZ, beamX) {
  const g = dense(0, -3, 0, nx - 1, 0, nz - 1);
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
    const u = x % 20, v = z % 20, k = hash3(Math.floor(x / 20), 4, Math.floor(z / 20)) < 0.12 ? 2 : ((Math.floor(x / 20) + Math.floor(z / 20)) & 1);
    let c = u === 0 || v === 0 ? 0x4a5164 : k ? 0x8a94aa : 0x7f899f;
    if (c !== 0x4a5164 && (u === 1 || v === 1)) c = 0x9aa4b8;
    if (k === 2 && u > 3 && u < 17 && v > 3 && v < 17) c = ((u + v) % 3) ? 0x5a6278 : 0x3d4352;
    g.set(x, 0, z, c);
  }
  for (const zb of beamZ) for (let x = 0; x < nx; x++) for (let y = -3; y <= -1; y++) for (let dz = 0; dz < 3; dz++)
    g.set(x, y, zb + dz, y === -3 ? (dz === 1 && x % 6 === 0 ? SCREW : PAL.metalD) : PAL.metalDD);
  for (const xb of beamX) for (let z = 0; z < nz; z++) for (let y = -2; y <= -1; y++) for (let dx = 0; dx < 2; dx++)
    if (!g.has(xb + dx, y, z)) g.set(xb + dx, y, z, y === -2 ? PAL.metalD : PAL.metalDD);
  return g;
}
function fixtureGrid() {
  const g = dense(-23, -4, -5, 22, 3, 4);
  g.box(-22, -1, -4, 21, 0, 3, PAL.metalDD);
  g.box(-22, -2, -4, 21, -2, 3, PAL.metalD);
  g.box(-21, -3, -3, 20, -3, 2, (x, y, z) => (z === -1 || z === 0 ? 0xe8f6ff : 0xf4f8ff), false);
  g.box(-20, -3, -1, 19, -3, 0, 0xe8f6ff, true);
  for (const x of [-22, 21]) g.box(x, -3, -4, x, -2, 3, PAL.pink);
  for (const x of [-12, 11]) g.box(x, 1, -1, x, 2, 0, PAL.metalD);
  return g;
}

function ventGrid() {
  const g = dense(-11, -6, -11, 10, 1, 10);
  g.box(-9, -4, -9, 8, -1, 8, (x, y, z) => (Math.abs(x + 0.5) > 7.5 || Math.abs(z + 0.5) > 7.5 ? PAL.metalD : null));
  for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) if (z % 2 === 0) g.set(x, -5, z, PAL.metal);
  g.box(-10, -5, -10, 9, -5, -10, PAL.metalL).box(-10, -5, 9, 9, -5, 9, PAL.metalL);
  g.box(-10, -5, -10, -10, -5, 9, PAL.metalL).box(9, -5, -10, 9, -5, 9, PAL.metalL);
  g.box(-8, 0, -8, 7, 0, 7, 0x2a2f3a);
  return g;
}
function fanGrid() {
  const g = dense(-8, 0, -8, 8, 0, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    for (let r = 1; r <= 6; r++) for (let w = -1; w <= 1; w++) {
      const x = Math.round(Math.cos(a) * r - Math.sin(a) * w * (0.6 + r * 0.12)), z = Math.round(Math.sin(a) * r + Math.cos(a) * w * (0.6 + r * 0.12));
      g.set(x, 0, z, PAL.metalL);
    }
  }
  g.box(-1, 0, -1, 1, 0, 1, PAL.pink);
  return g;
}

function trayGrid(n) {
  const g = dense(-7, -10, -2, 6, 3, n + 2);
  const cols = [PAL.red, PAL.blueD, PAL.yellow, 0x2a2f3a, PAL.green, PAL.pink];
  for (let z = 0; z < n; z++) {
    g.box(-4, -3, z, 3, -3, z, (z % 2) ? PAL.metal : PAL.metalD);
    g.box(-4, -2, z, -4, -1, z, PAL.metal).box(3, -2, z, 3, -1, z, PAL.metal);
    for (let i = 0; i < 6; i++) g.set(-3 + i, -2, z, cols[i]);
    if (z % 40 === 0) g.box(-4, -1, z, 3, 2, z, PAL.metalD);
  }
  // drooping loops between hangers
  for (let z = 10; z < n - 30; z += 80) {
    for (const [i, c] of [[1, cols[0]], [4, cols[2]]]) {
      const pts = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([-3 + i + (i === 1 ? -2 : 2) * Math.sin(t * Math.PI), -2 - Math.sin(t * Math.PI) * 6, z + t * 16]); }
      chain(g, pts, 0.2, c);
    }
  }
  return g;
}

function ceilingPipesGrid(nx) {
  const g = dense(-Math.floor(nx / 2) - 1, -10, -2, -Math.floor(nx / 2) + nx + 1, 1, 14);
  const x0 = -Math.floor(nx / 2), x1 = x0 + nx - 1;
  tube(g, 'x', x0, x1, -3, 2, 2, PAL.metalL, { every: 26, flange: PAL.pink, off: 4, bolts: false });
  tube(g, 'x', x0, x1, -3, 8, 1, PAL.blue, { every: 24, flange: PAL.metalD, off: 9 });
  tube(g, 'x', x0, x1, -6, 5, 1, 0xd08a40, { every: 30, flange: PAL.goldD, off: 2 });
  for (let x = x0 + 6; x < x1; x += 30) {
    g.box(x, -1, 0, x, -1, 10, PAL.metalD);
    g.box(x, -7, 5, x, -2, 5, PAL.metalD);
  }
  for (let x = x0 + 20, k = 0; x < x1 - 10; x += 44, k++) {
    g.box(x, -3, 9, x, -3, 10, PAL.metalD);
    if (k % 2) gaugeZ(g, x, -3, 11, 2, { angle: 0.5 + k, depth: 1 });
    else valve(g, x, -3, 11, 2, PAL.red);
  }
  return g;
}

function pendantGrid() {
  const g = dense(-8, -7, -8, 8, 29, 8);
  g.box(0, 0, 0, 0, 28, 0, PAL.metalDD);
  for (let y = -6; y <= -1; y++) {
    const r = 1.5 + (-y) * 1.1;
    for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) {
      const d = Math.hypot(x, z);
      if (d <= r + 0.4 && d > r - 1.2) g.set(x, y, z, y === -6 ? PAL.metalL : PAL.blueD);
    }
  }
  g.box(-1, -1, -1, 1, -1, 1, PAL.blueD);
  g.box(-1, -4, -1, 1, -2, 1, 0xfff1c8, true);
  return g;
}

/**
 * Ceiling (bottom face at local y = 0, world-aligned x/z: from the back wall
 * zBack forward d units): panels, beams, light fixtures, vents with spinning
 * fans, cable trays, a pipe bundle and a pendant lamp over the workbench.
 */
export function makeCeiling(w = 20, d = 15, zBack = -8, o = {}) {
  const root = new THREE.Group();
  root.name = 'ceiling';
  const nx = Math.round(w * 10), nz = Math.round(d * 10);
  const beamZ = [-4.9, -0.9, 3.1].map((z) => Math.round((z - zBack) * 10)), beamX = [-5.1, 4.9].map((x) => Math.round((x + w / 2) * 10));
  const panels = gmesh(`ceil5_${nx}_${nz}`, () => ceilingGrid(nx, nz, beamZ, beamX), { scale: 0.1, pivot: [0, 0, 0], jitter: 0.03, skip: [2] });
  panels.position.set(-w / 2, 0, zBack);
  root.add(panels);
  const fx = instanced(aoGeometry('ld_fixture', fixtureGrid, { scale: 0.05, pivot: [0, 0, 0], maxSamples: 10 }), [
    [-5.6, 0, -6.9], [5.6, 0, -6.9], [-5.6, 0, -2.9], [0, 0, -2.9], [5.6, 0, -2.9], [-5.6, 0, 1.1], [5.6, 0, 1.1],
  ]);
  fx.name = 'fixtures';
  root.add(fx);
  const ventAt = [[-2.9, -2.9], [2.9, -2.9], [-2.9, 1.1], [2.9, 1.1]];
  root.add(instanced(aoGeometry('ld_vent', ventGrid, { scale: 0.05, pivot: [0, 0, 0], maxSamples: 10 }), ventAt.map(([x, z]) => [x, 0, z])));
  const fanGeo = aoGeometry('ld_fan', fanGrid, { scale: 0.05, pivot: [0, 0, 0], maxSamples: 10 });
  const fans = ventAt.map(([x, z]) => {
    const f = makeMesh(fanGeo, Mats.pair);
    f.castShadow = false;
    f.position.set(x - 0.025, -0.12, z - 0.025);
    root.add(f);
    return f;
  });
  const t0 = -5.3, trayN = Math.round((zBack + d - t0) * 20) - 4;
  for (const x of [-4.1, 4.1]) {
    const tr = gmesh(`tray_${trayN}`, () => trayGrid(trayN), { scale: 0.05, pivot: [0, 0, 0], jitter: 0.03, skip: [2] });
    tr.position.set(x, 0, t0);
    root.add(tr);
  }
  const pipes = amesh(`ceilPipes_${nx}`, () => ceilingPipesGrid(nx), { scale: 0.1, pivot: [0, 0, 0], skip: [2] }, { shadow: false });
  pipes.position.set(0, 0, -6.45);
  root.add(pipes);
  const pend = amesh('pendant', pendantGrid, { scale: 0.05, pivot: [0, 28, 0] }, { shadow: false });
  pend.position.set(o.pendant?.[0] ?? 0, 0, o.pendant?.[1] ?? 1.6);
  root.add(pend);
  return {
    root, pendant: pend,
    update(dt) { for (let i = 0; i < fans.length; i++) fans[i].rotation.y += dt * (5 + i); },
  };
}

// ---------------------------------------------------------------------------
// Wall dressing

/** Neon trim tube in a housing along x (0.05 voxels), dashed by mounting clips. */
function trimMesh(len, color) {
  const n = Math.round(len / 0.05);
  const m = gmesh(`trim_${n}_${color}`, () => {
    const g = dense(0, 0, 0, n - 1, 2, 1);
    for (let x = 0; x < n; x++) {
      g.set(x, 0, 0, PAL.metalDD).set(x, 2, 0, PAL.metalDD).set(x, 1, 0, PAL.metalD);
      const clip = x % 24 === 0;
      g.set(x, 1, 1, clip ? PAL.metalL : color, !clip);
    }
    return g;
  }, { scale: 0.05, pivot: [n / 2, 0, 0], skip: [5] });
  return m;
}

/** Vertical pipe riser (floor to ceiling, faces +z): three pipes, flanges, a valve, gauges, a pressure tank. */
function riserGrid(hv) {
  const g = dense(-9, 0, -4, 8, hv + 1, 8);
  tube(g, 'y', 0, hv, 0, 0, 2, PAL.metalL, { every: 14, flange: PAL.pink, off: 10 });
  tube(g, 'y', 0, hv, 4, -1, 1, PAL.blue, { every: 12, flange: PAL.metalD, off: 5 });
  tube(g, 'y', 0, hv, -4, -1, 1, 0xd08a40, { every: 16, flange: PAL.goldD, off: 8 });
  g.cylinder(0, 0, 0, 9, 3.2, (x, y) => (y === 0 || y === 9 ? PAL.metalD : y === 5 ? PAL.yellow : PAL.white2));
  g.set(0, 6, 4, PAL.ink).set(0, 7, 4, PAL.ink);
  for (const y of [20, 46, hv - 6]) g.box(-5, y, -3, 5, y, -2, PAL.metalD);
  g.box(0, 16, 3, 0, 16, 4, PAL.metalD);
  valve(g, 0, 16, 5, 3, PAL.red);
  g.box(4, 28, 1, 4, 28, 2, PAL.metalD);
  gaugeZ(g, 4, 28, 3, 2, { angle: 2.6, depth: 1 });
  g.box(0, 36, 3, 0, 36, 3, PAL.metalD);
  gaugeZ(g, 0, 36, 4, 3, { angle: 1.1, depth: 1 });
  g.box(-7, 22, -2, -5, 27, 1, PAL.metalD).set(-6, 26, 2, PAL.slime, true).set(-6, 24, 2, PAL.red);
  return g;
}

/** Pixel-art drawing surface (y = 0 at the top) turned into a flat voxel panel. */
function pixels(w, h, bg) {
  const px = new Array(w * h).fill(bg);
  const api = {
    w, h, px,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (c != null && x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; },
    rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) api.set(x + i, y + j, c); },
    disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) api.set(cx + x, cy + y, c); },
    text(str, cx, y, c, k = 1) {
      const { pts, w: tw } = fontPixels(str);
      const x0 = Math.round(cx - (tw * k) / 2);
      for (const [u, v] of pts) api.rect(x0 + u * k, y + (4 - v) * k, k, k, c);
    },
    art(rows, pal, x, y, k = 1) { rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch] != null) api.rect(x + i * k, y + j * k, k, k, pal[ch]); })); },
  };
  return api;
}
function posterGrid(p, frame, o = {}) {
  const g = dense(-1, -1, 0, p.w, p.h, 1);
  const { w, h } = p;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.set(x, h - 1 - y, 0, p.px[y * w + x]);
  if (frame) {
    for (let x = -1; x <= w; x++) { g.box(x, -1, 0, x, -1, 1, frame); g.box(x, h, 0, x, h, 1, frame); }
    for (let y = -1; y <= h; y++) { g.box(-1, y, 0, -1, y, 1, frame); g.box(w, y, 0, w, y, 1, frame); }
  } else if (o.tape !== false) {
    for (const [x, y] of [[0, h - 1], [w - 1, h - 1], [0, 0], [w - 1, 0]]) g.set(x, y, 1, 0xfff4b8);
  }
  return g;
}
const POSTERS = {
  subscribe() {
    const p = pixels(24, 32, 0xe8343c);
    p.rect(0, 0, 24, 3, 0xa8202a); p.rect(0, 29, 24, 3, 0xa8202a);
    p.rect(5, 5, 14, 10, 0xffffff); p.set(5, 5, 0xe8343c); p.set(18, 5, 0xe8343c); p.set(5, 14, 0xe8343c); p.set(18, 14, 0xe8343c);
    for (let i = 0; i < 4; i++) p.rect(10 + i, 7 + i, 1, 6 - i * 2, 0xe8343c);
    p.text('SUB', 12, 17, 0xffffff);
    p.text('NOW!', 12, 23, 0xffd23f);
    return p;
  },
  tiger() {
    const p = pixels(24, 32, 0x141c44);
    for (let i = 0; i < 24; i += 3) p.set(i, 1 + (i % 2), 0x8fe3ff);
    p.art(['k..........k', 'ok........ko', 'oookkkkkkooo', 'oooooooooooo', 'okoowooowook', 'oowkwoowkwoo', 'ooowwwwwwooo', 'okowwnnwwoko', '.oowwwwwwoo.', '..ookkkkoo..'],
      { o: 0xff9a2a, k: 0x1a1020, w: 0xfff4e0, n: 0xff4fa3 }, 0, 4, 2);
    p.text('BEAST', 12, 20, 0xffffff);
    p.text('TIGER', 12, 26, 0xffd23f);
    return p;
  },
  safety() {
    const p = pixels(24, 32, 0xffd23f);
    for (let x = 0; x < 24; x++) for (const y of [0, 1, 30, 31]) p.set(x, y, ((x + y) >> 1) & 1 ? PAL.ink : 0xffd23f);
    for (let r = 0; r < 10; r++) p.rect(12 - r, 4 + r, r * 2, 1, PAL.ink);
    for (let r = 2; r < 9; r++) p.rect(12 - r + 2, 4 + r + 1, Math.max(0, r * 2 - 4), 1, 0xffd23f);
    p.rect(11, 8, 2, 3, PAL.ink); p.rect(11, 12, 2, 1, PAL.ink);
    p.text('DONT', 12, 17, PAL.ink);
    p.text('TAP!', 12, 23, 0xe8343c);
    return p;
  },
  jimmy() {
    const p = pixels(24, 32, 0x2b8cf2);
    p.rect(0, 0, 24, 32, 0x2b8cf2);
    p.text('NO.1', 12, 2, 0xffd23f);
    p.art(['..hhhhhhhh..', '.hhhhhhhhhh.', 'hhssssssssh.', 'hssssssssssh', 'sswkssswksss', 'ssbkssssbkss', 'ssssssssssss', 'hssmmmmmmssh', 'hhhhmmmmhhhh', '.hhhhhhhhhh.', '..hhhhhhhh..'],
      { h: 0x6a3a1a, s: 0xf2c49a, w: 0xffffff, k: 0x15121f, b: 0x2b8cf2, m: 0x8a4a2a }, 6, 9, 1);
    p.rect(4, 21, 16, 1, 0xffd23f);
    p.text('JIMMY', 12, 24, 0xffffff);
    return p;
  },
  feast() {
    const p = pixels(24, 32, 0x2a7bff);
    p.rect(3, 4, 18, 11, 0x5a3220);
    for (let x = 3; x < 21; x += 6) p.rect(x, 4, 1, 11, 0x3a1d10);
    p.rect(3, 9, 18, 1, 0x3a1d10);
    p.rect(3, 4, 18, 1, 0x7d4a2d);
    p.rect(8, 6, 8, 7, 0xffffff); p.text('B', 12, 7, 0xff2e88);
    p.text('FEAST', 12, 18, 0xffffff);
    p.text('BARS', 12, 25, 0xffd23f);
    return p;
  },
  swarms() {
    const p = pixels(48, 20, 0x2e1748);
    for (let x = 0; x < 48; x++) { p.set(x, 0, 0xff2e88); p.set(x, 19, 0xff2e88); }
    p.text('SWARMS', 24, 2, 0xff4fa3);
    p.art(['.bb..bb.', 'bbbbbbbb', 'bwkbbwkb', 'bbbppbbb', 'bbwwwwbb', '.bbbbbb.'], { b: 0x29b6f6, w: 0xffffff, k: 0x15121f, p: 0xff2e88 }, 4, 10);
    p.art(['wwwwww..', 'wkwwkw..', 'wwwwwwww', '.wwbbww.', '.wwwwww.', '..wwww..'], { w: 0xf4f6fa, k: 0x15121f, b: 0x5a3220 }, 20, 10);
    p.art(['y.y.y.y.', 'yyyyyyy.', 'rrrrrrr.', 'rwkrwkr.', 'rrrrrrr.', '.rrrrr..'], { y: 0xffd23f, r: 0xe8343c, w: 0xffffff, k: 0x15121f }, 36, 10);
    return p;
  },
};
function posterMesh(kind, frame) {
  return gmesh(`poster_${kind}_${frame ?? 0}`, () => posterGrid(POSTERS[kind](), frame), { scale: 0.05, pivot: [0, 0, 0], jitter: 0.02, skip: [5] }, { receive: false });
}

function clockGrid() {
  const g = dense(-10, -10, 0, 10, 10, 2);
  for (let x = -9; x <= 9; x++) for (let y = -9; y <= 9; y++) {
    const d = Math.hypot(x, y);
    if (d <= 8.5) g.set(x, y, 0, d > 7.5 ? PAL.pink : 0xffffff);
    if (d <= 8.5 && d > 7.5) g.set(x, y, 1, PAL.pinkD);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.set(Math.round(Math.cos(a) * 6.3), Math.round(Math.sin(a) * 6.3), 1, k % 3 ? 0x9aa2b4 : PAL.ink);
  }
  for (let i = 0; i <= 4; i++) g.set(Math.round(Math.cos(2.3) * i), Math.round(Math.sin(2.3) * i), 1, PAL.ink);
  for (let i = 0; i <= 6; i++) g.set(Math.round(Math.cos(0.75) * i), Math.round(Math.sin(0.75) * i), 1, PAL.ink);
  for (let i = 0; i <= 6; i++) g.set(Math.round(Math.cos(-1.4) * i), Math.round(Math.sin(-1.4) * i), 2, PAL.red);
  g.set(0, 0, 2, PAL.ink);
  return g;
}

/** Hazard wall plate behind the MEGA tube (0.1 voxels, faces +z): hazard frame, dark ribbed panel, beacons. */
function megaPlateGrid() {
  const g = dense(-19, 3, 0, 18, 51, 3);
  const X0 = -18, X1 = 17, Y0 = 4, Y1 = 46;
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++) {
    const fr = x - X0 < 3 || X1 - x < 3 || y - Y0 < 3 || Y1 - y < 3;
    g.set(x, y, 0, fr ? ((((x + y) >> 1) & 1) ? PAL.yellow : PAL.ink) : (x % 5 === 0 ? 0x2a2440 : 0x1c1830));
    if (fr) g.set(x, y, 1, ((((x + y) >> 1) & 1) ? PAL.yellow : PAL.ink));
  }
  for (const x of [X0 + 1, X1 - 2]) { g.box(x, Y1 + 1, 0, x + 1, Y1 + 1, 2, PAL.metalD); g.box(x, Y1 + 2, 1, x + 1, Y1 + 3, 2, PAL.orange, true); }
  for (const [x, y] of [[X0 + 5, Y0 + 5], [X1 - 5, Y0 + 5], [X0 + 5, Y1 - 5], [X1 - 5, Y1 - 5]]) g.set(x, y, 1, SCREW);
  return g;
}

// ---------------------------------------------------------------------------
// Floor dressing

function grateGrid(w, d) {
  const g = dense(0, 0, 0, w - 1, 0, d - 1);
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    const fr = x < 2 || x >= w - 2 || z < 2 || z >= d - 2;
    if (fr) { g.set(x, 0, z, (x + z) % 9 === 0 ? SCREW : PAL.metalD); continue; }
    const slot = z % 3 === 0;
    const glowSlot = slot && x > 4 && x < w - 5 && (z % 6 === 0);
    g.set(x, 0, z, glowSlot ? PAL.cyan : slot ? 0x1c2433 : (x % 8 === 4 ? PAL.metal : 0x5a6478), glowSlot);
  }
  // chevrons pointing at the tank (-z)
  for (let k = 0; k < 3; k++) {
    const cz = 8 + k * 14;
    for (let i = -5; i <= 5; i++) g.set(Math.floor(w / 2) + i, 0, cz + Math.abs(i), PAL.yellow);
  }
  return g;
}
function hazardRingGrid(r) {
  const g = dense(-r - 4, 0, -r - 4, r + 4, 0, r + 4);
  for (let x = -r - 3; x <= r + 3; x++) for (let z = -r - 3; z <= r + 3; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d > r - 1.5 && d <= r + 1.5) g.set(x, 0, z, (Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * (r * 1.4)) & 1) ? PAL.yellow : PAL.ink);
  }
  return g;
}

/** Painted floor logo: pink ring, white disc, pink lightning bolt, hazard dashes. */
function emblemGrid() {
  const R = 28;
  const g = dense(-R - 2, 0, -R - 2, R + 2, 0, R + 2);
  for (let x = -R - 1; x <= R; x++) for (let z = -R - 1; z <= R; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d > R + 0.5) continue;
    const a = Math.atan2(z + 0.5, x + 0.5);
    let c = d > R - 3 ? PAL.pink : d > R - 4.2 ? PAL.white : d > R - 6 ? ((Math.floor((a + Math.PI) / (Math.PI * 2) * 36) & 1) ? PAL.ink : PAL.yellow) : 0xf4f6fa;
    g.set(x, 0, z, c);
  }
  // bolt (BOLT_SMALL scaled x4), pointing "up" toward the tank (-z)
  BOLT_SMALL.forEach((row, r) => [...row].forEach((ch, cc) => {
    if (ch !== 'M') return;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.set((cc - 2.5) * 4 + i, 0, (r - 3.5) * 4 + j, PAL.pink);
  }));
  return g;
}

// ---------------------------------------------------------------------------
// Clutter (0.05 voxels)

function feastCrateGrid() {
  const g = dense(-13, 0, -9, 12, 18, 9);
  const X0 = -12, X1 = 11, Z0 = -8, Z1 = 7, Y1 = 13;
  const W = PAL.woodL, WD = PAL.wood, WDD = PAL.woodD;
  for (let x = X0; x <= X1; x++) for (let y = 0; y <= Y1; y++) for (let z = Z0; z <= Z1; z++) {
    const ex = x === X0 || x === X1, ez = z === Z0 || z === Z1;
    if (!ex && !ez && y !== 0) continue;
    const post = (ex && ez) || ((ex || ez) && (y === 0 || y === Y1));
    g.set(x, y, z, post ? WDD : (y % 5 === 4 ? WD : W));
  }
  text(g, 'FEAST', 0, 4, Z1 + 1, '+z', 0x3a1d10, { center: true });
  const wr = [0x2a7bff, PAL.orange, PAL.pink, PAL.yellow, PAL.purple, 0x5fdc4a];
  for (let x = X0 + 1; x < X1; x += 3) for (let z = Z0 + 1; z < Z1 - 1; z += 4) {
    const c = wr[Math.floor(hash3(x, 3, z) * wr.length)];
    const h = Y1 + 1 + Math.floor(hash3(x, 5, z) * 3);
    g.box(x, 6, z, x + 1, h, z + 2, c);
    g.box(x, h - 2, z + 1, x + 1, h - 1, z + 1, 0xffffff);
  }
  return g;
}
function labBoxGrid(open) {
  const g = dense(-9, 0, -8, 9, 20, 9);
  const X0 = -8, X1 = 7, Z0 = -7, Z1 = 7, Y1 = 13;
  g.box(X0, 0, Z0, X1, Y1, Z1, (x, y, z) => ((x === X0 || x === X1) && (z === Z0 || z === Z1) ? CARD_D : y === Y1 ? CARD_L : CARD));
  g.box(-1, Y1, Z0, 0, Y1, Z1, 0xd8c8a8).box(-1, 4, Z1, 0, Y1, Z1, 0xd8c8a8);
  const bolt = BOLT_SMALL;
  bolt.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'M') g.set(-6 + c, 11 - r, Z1 + 1, PAL.pink); }));
  text(g, 'LAB', 4, 1, Z1 + 1, '+z', PAL.ink, { center: true });
  g.box(X1 + 1, 8, -2, X1 + 1, 11, 1, 0xffffff).set(X1 + 1, 10, 0, PAL.red).set(X1 + 1, 9, 0, PAL.red).set(X1 + 1, 9, -1, PAL.red);
  if (open) {
    g.box(X0 + 1, Y1, Z0 + 1, X1 - 1, Y1, Z1 - 1, null);
    g.box(X0, Y1 + 1, Z0, X0, Y1 + 5, Z1, CARD_L).box(X1, Y1 + 1, Z0, X1, Y1 + 4, Z1, CARD_L);
    for (const [x, z, c] of [[-4, -2, PAL.pink], [-1, 2, PAL.cyan], [3, -3, PAL.slime]]) {
      g.box(x, 8, z, x + 1, Y1 + 3, z + 1, 0xd8f4ff);
      g.box(x, 8, z, x + 1, Y1, z + 1, c);
      g.box(x, Y1 + 4, z, x + 1, Y1 + 4, z + 1, PAL.metalD);
    }
    for (let i = 0; i < 18; i++) g.set(X0 + 1 + Math.floor(hash3(i, 1, 2) * 14), Y1, Z0 + 1 + Math.floor(hash3(i, 2, 3) * 13), 0xffffff);
  }
  return g;
}
function cartGrid() {
  const g = dense(-18, 0, -9, 15, 28, 9);
  const X0 = -14, X1 = 13, Z0 = -8, Z1 = 7;
  for (const x of [X0, X1]) for (const z of [Z0, Z1]) { g.box(x, 2, z, x, 20, z, PAL.metalD); g.box(x - 1, 0, z, x + 1, 1, z, PAL.ink); }
  for (const y of [6, 18]) {
    g.box(X0, y, Z0, X1, y, Z1, y === 18 ? PAL.blue : PAL.metal);
    g.box(X0, y + 1, Z0, X1, y + 1, Z0, PAL.metalL).box(X0, y + 1, Z1, X1, y + 1, Z1, PAL.metalL);
  }
  g.box(X0 - 3, 21, Z0 + 2, X0 - 3, 21, Z1 - 2, PAL.red).box(X0 - 2, 19, Z0 + 2, X0 - 1, 19, Z0 + 2, PAL.metalD).box(X0 - 2, 19, Z1 - 2, X0 - 1, 19, Z1 - 2, PAL.metalD);
  g.box(X0 - 3, 19, Z0 + 2, X0 - 3, 20, Z0 + 2, PAL.metalD).box(X0 - 3, 19, Z1 - 2, X0 - 3, 20, Z1 - 2, PAL.metalD);
  // toolbox
  g.box(-12, 19, -6, -2, 24, 0, PAL.red);
  g.box(-12, 22, -6, -2, 22, 0, PAL.redD);
  g.box(-9, 25, -3, -5, 26, -3, PAL.ink).box(-9, 25, -3, -9, 25, -3, PAL.ink);
  g.set(-7, 23, 1, PAL.metalL);
  // wrench + screwdriver + spray bottle
  g.box(0, 19, 2, 9, 19, 2, PAL.metal).box(8, 19, 1, 10, 19, 3, PAL.metal).set(9, 19, 2, null);
  g.box(-1, 19, -5, 3, 19, -5, PAL.yellow).box(4, 19, -5, 8, 19, -5, PAL.metalL);
  g.box(7, 19, -3, 9, 25, -1, PAL.cyan).box(8, 26, -2, 8, 27, -2, 0xffffff).box(8, 27, -1, 8, 27, 0, 0xffffff);
  // bottom shelf: cable coil + jerry can
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.set(-7 + Math.round(Math.cos(a) * 4), 7, Math.round(Math.sin(a) * 4), PAL.ink); g.set(-7 + Math.round(Math.cos(a) * 3), 8, Math.round(Math.sin(a) * 3), PAL.ink); }
  g.box(3, 7, -5, 10, 14, 1, PAL.red).box(5, 15, -3, 8, 15, -3, PAL.redD).set(9, 15, 0, PAL.yellow);
  return g;
}
function drumGrid(col, label) {
  const g = dense(-8, 0, -8, 7, 20, 8);
  g.cylinder(0, 0, 0, 17, 6, (x, y) => (y === 0 || y === 17 || y === 5 || y === 12 ? shade(col, -0.28) : col));
  g.cylinder(0, 0, 18, 18, 5, shade(col, 0.12));
  g.cylinder(3, 2, 18, 19, 1, PAL.metalD);
  g.box(-3, 7, 6, 2, 10, 6, label ?? PAL.yellow);
  g.set(-1, 9, 7, PAL.ink).set(0, 9, 7, PAL.ink).set(-1, 8, 7, PAL.ink).set(0, 8, 7, PAL.ink);
  g.box(4, 12, 5, 4, 17, 5, 0x7cff3a).set(4, 11, 5, 0x7cff3a, true);
  return g;
}
function gasGrid() {
  const g = dense(-9, 0, -5, 11, 34, 5);
  const cols = [0x5fdc4a, 0xf4f6fa, PAL.blue];
  [-5, 1, 7].forEach((x, i) => {
    g.cylinder(x, 0, 0, 30, 2.6, (xx, y) => (y > 26 ? 0x9aa2b4 : y === 3 ? shade(cols[i], -0.3) : cols[i]));
    g.cylinder(x, 0, 31, 32, 1.2, PAL.metalD);
    g.box(x, 33, 0, x + 1, 33, 0, PAL.metal);
  });
  g.box(-8, 22, -3, 10, 23, -3, PAL.metalD);
  for (let x = -7; x <= 9; x += 2) g.set(x, 21 + (x & 2 ? 1 : 0), 3, PAL.metalL);
  return g;
}
function extinguisherGrid() {
  const g = dense(-9, 0, -3, 9, 27, 7);
  g.box(-4, 0, -1, 3, 17, -1, PAL.metalD);
  g.cylinder(0, 2, 2, 14, 2.4, (x, y) => (y === 8 ? 0xffffff : PAL.red));
  g.box(-1, 15, 2, 0, 17, 2, PAL.ink).box(0, 18, 2, 3, 18, 2, PAL.ink);
  chain(g, [[1, 15, 4], [3, 10, 5], [2, 5, 5]], 0.3, PAL.ink);
  g.box(-5, 20, -1, 4, 25, -1, PAL.red);
  text(g, 'FIRE', 0, 21, 0, '+z', 0xffffff, { center: true });
  return g;
}
function flaskRackGrid() {
  const g = dense(-15, 0, -7, 14, 36, 7);
  // little lab table (top surface at y = 0.9) with a hazard bin and a lab box under it
  for (const x of [-13, 12]) for (const z of [-5, 4]) g.box(x, 0, z, x, 15, z, PAL.metalD);
  g.box(-13, 3, -5, 12, 3, 4, PAL.metal);
  g.box(-14, 16, -6, 13, 17, 5, (x, y, z) => (y === 16 ? PAL.metalD : (x === -14 || x === 13 || z === -6 || z === 5) ? PAL.metalL : PAL.white));
  g.box(-10, 4, -3, -4, 9, 2, PAL.yellow).box(-10, 9, -3, -4, 9, 2, PAL.ink).set(-7, 7, 3, PAL.ink).set(-7, 6, 3, PAL.ink);
  g.box(2, 4, -3, 7, 10, 2, CARD).box(2, 10, -3, 7, 10, 2, CARD_L).set(4, 7, 3, PAL.pink).set(5, 8, 3, PAL.pink).set(4, 8, 3, PAL.pink);
  // flask rack on top
  const B = 18;
  g.box(-12, B, -3, 11, B + 1, 2, PAL.metalD);
  g.box(-12, B + 2, -3, 11, B + 2, 2, PAL.metalL);
  const GL = 0xd8f4ff;
  for (const [x, c, k] of FLASKS) {
    if (k === 'cone') {
      for (let y = 3; y <= 10; y++) { const r = Math.max(1, 4 - (y - 3) * 0.45); g.cylinder(x, 0, B + y, B + y, r, y < 8 ? c : GL); }
      g.box(x, B + 11, 0, x, B + 13, 0, GL);
    } else if (k === 'round') {
      blob(g, x, B + 6, 0, 3.2, 3.2, 3.2, (xx, y) => (y < B + 7 ? c : GL));
      g.box(x, B + 10, 0, x, B + 13, 0, GL);
    } else if (k === 'tall') {
      g.cylinder(x, 0, B + 3, B + 14, 1.4, (xx, y) => (y < B + 10 ? c : GL));
      g.set(x, B + 15, 0, PAL.red);
    } else {
      g.cylinder(x, 0, B + 3, B + 9, 2.4, (xx, y) => (y < B + 7 ? c : GL));
      g.cylinder(x, 0, B + 7, B + 9, 1.2, null);
    }
  }
  return g;
}
const FLASKS = [[-9, PAL.pink, 'cone'], [-3, PAL.slime, 'round'], [3, PAL.cyan, 'tall'], [8, PAL.yellow, 'beaker']];

/** Free-standing "DON'T TAP" placard on a post (faces +z). */
function placardGrid() {
  const g = dense(-12, 0, -4, 12, 30, 3);
  g.box(-1, 0, -1, 0, 1, 0, PAL.metalDD);
  g.box(-3, 0, -3, 2, 0, 2, PAL.metalD);
  g.box(-1, 2, -1, 0, 15, -1, PAL.metal);
  const W = 22, H = 15, x0 = -11, y0 = 14;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    g.set(x0 + x, y0 + y, 0, edge ? ((((x + y) >> 1) & 1) ? PAL.ink : PAL.yellow) : PAL.yellow);
    g.set(x0 + x, y0 + y, -1, PAL.metalD);
  }
  text(g, 'DONT', 0, y0 + 8, 1, '+z', PAL.ink, { center: true });
  text(g, 'TAP!', 0, y0 + 2, 1, '+z', PAL.red, { center: true });
  return g;
}

// ---------------------------------------------------------------------------
// The whole room

/**
 * Build the Beast Lab room (floor 22 x 16 centred on z = -1, back wall z = -8,
 * side walls x = +-10, ceiling y = 7.5). Returns { root, update(dt), signs,
 * bubbles, tubes }. The tank, the MEGA tube, creatures and characters are
 * added by the scene.
 */
export function buildLabRoom() {
  const t0 = performance.now();
  const timings = {};
  let tp = t0;
  const mark = (k) => { const n = performance.now(); timings[k] = Math.round(n - tp); tp = n; };
  const root = new THREE.Group();
  root.name = 'labRoom';
  const add = (o, x, y, z, ry = 0, s = 1) => { if (!o) return null; place(o, x, y, z, ry, s); root.add(o); return o; };
  const CEIL = 7.5;

  // shell
  add(makeFloorTiles(22, 16), 0, 0, -1);
  add(makeWallPanel(22, 7.5), 0, 0, -8);
  add(makeWallPanel(16, 7.5), -10, 0, -1, Math.PI / 2);
  add(makeWallPanel(16, 7.5), 10, 0, -1, -Math.PI / 2);
  const ceil = makeCeiling(20, 15, -8);
  add(ceil.root, 0, CEIL, 0);

  mark('shell');
  // neon trims (pink baseboard, cyan chair rail)
  add(trimMesh(19.8, PAL.pink), 0, 0.4, -8);
  add(trimMesh(19.8, PAL.cyan), 0, 3.72, -8);
  for (const sd of [-1, 1]) {
    add(trimMesh(15.6, PAL.pink), sd * 10, 0.4, -0.8, -sd * Math.PI / 2);
    add(trimMesh(15.6, PAL.cyan), sd * 10, 3.72, -0.8, -sd * Math.PI / 2);
  }

  // signs + the MEGA bay
  const sign = neonSign('BEAST LAB', { color: PAL.pink, color2: PAL.yellow, bolts: true, vox: 0.06 });
  add(sign, 0, 6.55, -7.98);
  const sign2 = neonSign('MEGA-TECH', { color: PAL.yellow, color2: PAL.pink, vox: 0.045, step: 2 });
  add(sign2, -5.6, 5.5, -7.98);
  add(amesh('megaPlate', megaPlateGrid, { scale: 0.1, pivot: [0, 0, 0] }, { shadow: false }), -5.6, 0, -7.99);

  mark('signs');
  // furniture (shared interior props)
  const mon = add(makeMonitorWall(), 6.35, 0, -7.7);
  add(makeConsole(), 3.55, 0, -2.85, -0.5);
  add(makeComputer(), 6.6, 0, -3.4, -0.5);
  add(makeLabShelf(), -9.6, 0, -1.6, Math.PI / 2);
  add(makeVialRack(), 9.45, 0, -1.2, -Math.PI / 2);
  add(makeLabDoor(), -9.75, 0, 2.4, Math.PI / 2);
  add(makeLabDesk(), 0, 0, 1.6);
  add(makeMug(), -1.0, 0.9, 1.98, 0.4, 1.2);
  add(amesh('flaskRack', flaskRackGrid, { scale: 0.05, pivot: [0, 0, 0] }), -3.4, 0, -2.8, 0.35);
  add(amesh('placard', placardGrid, { scale: 0.05, pivot: [0, 0, 0] }), -2.05, 0, -2.45, 0.35);
  add(gmesh('emblem', emblemGrid, { scale: 0.05, pivot: [0, 0, 0], skip: [3] }), 0, 0.001, 4.6);

  mark('furniture');
  // corner risers + wall dressing
  const riser = aoGeometry('ld_riser', () => riserGrid(Math.round(CEIL / 0.1)), { scale: 0.1, pivot: [0, 0, 0], maxSamples: 30 });
  for (const [x, ry] of [[-9.55, Math.PI / 4], [9.6, -Math.PI / 4]]) { const m = makeMesh(riser, Mats.pair); m.receiveShadow = true; add(m, x, 0, -7.6, ry); }
  add(posterMesh('tiger', PAL.metalD), -8.95, 1.55, -7.99);
  add(posterMesh('subscribe'), 3.5, 3.05, -7.99);
  add(posterMesh('swarms', 0xffd23f), 5.05, 4.25, -7.99);
  add(posterMesh('safety'), -3.15, 3.9, -7.99, 0, 0.8);
  add(posterMesh('jimmy', PAL.gold), -9.99, 3.95, -1.0, Math.PI / 2);
  add(posterMesh('feast'), 9.99, 1.7, -2.6, -Math.PI / 2);
  add(amesh('clock', clockGrid, { scale: 0.05, pivot: [0, 0, 0] }, { shadow: false }), 8.65, 5.0, -7.99);
  add(amesh('extinguisher', extinguisherGrid, { scale: 0.05, pivot: [0, 0, 0] }, { shadow: false }), -9.99, 0.6, 0.6, Math.PI / 2);
  add(amesh('gas', gasGrid, { scale: 0.05, pivot: [0, 0, 0] }), -9.72, 0, -3.1, Math.PI / 2);

  mark('wall');
  // floor dressing: glowing walkway grate + hazard rings around the tanks
  add(gmesh('grate', () => grateGrid(30, 66), { scale: 0.05, pivot: [15, 0, 66], skip: [3] }, { receive: true }), 0, 0.001, 0.95);
  add(gmesh('ringTank', () => hazardRingGrid(46), { scale: 0.05, pivot: [0, 0, 0], skip: [3] }), 0, 0.001, -4.6);
  add(gmesh('ringMega', () => hazardRingGrid(36), { scale: 0.05, pivot: [0, 0, 0], skip: [3] }), -5.6, 0.001, -5.4);

  // clutter (instanced where repeated)
  root.add(instanced(aoGeometry('ld_crate', feastCrateGrid, { scale: 0.05, pivot: [0, 0, 0], maxSamples: 20 }),
    [[-7.7, 0, -2.7, 0.2], [-7.6, 0.7, -2.65, 0.05], [-8.75, 0, -3.75, 1.4]], { shadow: true, receive: true }));
  root.add(instanced(aoGeometry('ld_box', () => labBoxGrid(false), { scale: 0.05, pivot: [0, 0, 0], maxSamples: 20 }),
    [[-6.7, 0, -2.2, -0.4], [5.35, 0, -1.75, 0.5, 0.9], [2.95, 0, -5.35, 0.2]], { shadow: true, receive: true }));
  add(amesh('boxOpen', () => labBoxGrid(true), { scale: 0.05, pivot: [0, 0, 0] }), 4.55, 0, -0.95, -0.3, 0.9);
  add(amesh('cart', cartGrid, { scale: 0.05, pivot: [0, 0, 0] }), -5.4, 0, -0.85, 0.35);
  const drums = [
    [PAL.blue, PAL.yellow, [[-8.0, 0, -5.0, 0.3], [-7.8, 0, -5.7, 1.2]]],
    [PAL.yellow, 0xffffff, [[8.55, 0, -2.75, 0.7]]],
    [0x5fdc4a, PAL.yellow, [[-8.35, 0, -4.45, 2.2]]],
  ];
  drums.forEach(([c, l, items], i) => {
    root.add(instanced(aoGeometry('ld_drum_' + i, () => drumGrid(c, l), { scale: 0.05, pivot: [0, 0, 0], maxSamples: 20 }), items, { shadow: true, receive: true }));
  });

  mark('floorClutter');
  // specimen tubes + bubbles
  const bubbles = new BubbleField(220);
  root.add(bubbles.mesh);
  const tubes = [];
  const tubeDefs = [
    { x: -2.75, z: -7.15, color: 0x29e0ff, specimen: 'eye', h: 2.5, r: 0.38 },
    { x: 2.75, z: -7.15, color: 0x7cff3a, specimen: 'blob', h: 2.5, r: 0.38 },
    { x: -9.2, z: -5.9, color: 0xff2ea8, specimen: 'squid', h: 2.6, r: 0.4, ry: Math.PI / 2, ceiling: CEIL, accent: PAL.cyan },
    { x: -9.2, z: -4.1, color: 0xffd23f, specimen: 'brain', h: 2.6, r: 0.4, ry: Math.PI / 2, ceiling: CEIL, accent: PAL.cyan },
    { x: 9.2, z: -5.75, color: 0xb05cff, specimen: 'panther', h: 2.6, r: 0.4, ry: -Math.PI / 2, ceiling: CEIL, accent: PAL.cyan },
    { x: 9.25, z: -3.95, color: 0x29e0ff, specimen: 'toilet', h: 2.6, r: 0.4, ry: -Math.PI / 2, ceiling: CEIL, accent: PAL.cyan },
  ];
  for (const d of tubeDefs) {
    const tb = specimenTube({ color: d.color, specimen: d.specimen, h: d.h, r: d.r, accent: d.accent, ceiling: d.ceiling });
    add(tb.root, d.x, 0, d.z, d.ry ?? 0);
    bubbles.column(d.x, d.z, tb.y0, tb.top - 0.04, tb.rIn, 9, d.color, 0.055);
    tubes.push(tb);
  }
  // flask table bubbles
  for (const [lx, c] of FLASKS) {
    const a = 0.35, wx = -3.4 + Math.cos(a) * lx * 0.05, wz = -2.8 - Math.sin(a) * lx * 0.05;
    bubbles.column(wx, wz, 1.08, 1.3, 0.03, 2, c, 0.03);
  }

  mark('tubes');
  let t = 0;
  const signs = [sign, sign2];
  const buildMs = Math.round(performance.now() - t0);
  return {
    root, signs, bubbles, tubes, monitorWall: mon, buildMs, timings,
    update(dt) {
      t += dt;
      bubbles.update(dt);
      ceil.update(dt);
      for (let i = 0; i < tubes.length; i++) tubes[i].update(dt, t);
      tickLabScreens();
    },
  };
}

export { labScreen };
