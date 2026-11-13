// The title logo as a physical object: chunky voxel letters on a turf-and-rock plinth,
// rendered live in a transparent 3D stage (ui/stage3d.js) over the title cinematic.
//
//   * letters: hand-drawn 11-row letterforms (slab-serif feet, a peaked W, a bowled B,
//     a drooping T) extruded into voxels: a 2-deep painted face (banded colour, lit
//     top / left bevel, shaded bottom / right) on a 2-deep ink backing that is one
//     voxel wider, so every letter reads as a mounted sign. Each letter is a little
//     different: sunk unevenly into the turf, nudged, turned a hair, chipped corners,
//     a sticker or two and lab goo dripping off a few tops.
//   * MRBEAST stands on a raised rock tier behind SWARMERS; BEAST ISLAND is a painted
//     board nailed to the front of the plinth.
//   * entrance: the letters crash down from the sky one by one under gravity, bounce,
//     squash, throw voxel debris + dust clouds and shake the camera; the board drops
//     in last; then real swarm troops leap onto the letters (stand, peek over, climb
//     the side, hang off the T) and idle there.
// Everything is lit by a warm sun that casts real shadows. Text is never left tilted.
//
//   const logo = titleLogo3d(hostEl); ... logo.dispose();
import * as THREE from 'three';
import { Stage3D } from '../ui/stage3d.js';
import { VoxGrid, Mats } from '../core/voxel.js';
import { createSwarm } from '../models/swarmModels.js';
import { GLYPHS } from '../ui/bigType.js';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';

/* prettier-ignore */
const LOGO = {
  M: ['.###.....###.', '.####...####.', '.#####.#####.', '.###.###.###.', '.###..#..###.', '.###.....###.', '.###.....###.', '.###.....###.', '.###.....###.', '.###.....###.', '#####...#####'],
  R: ['#########...', '.###....###.', '.###.....###', '.###.....###', '.###....###.', '.########...', '.###..###...', '.###...###..', '.###....###.', '.###.....###', '#####...####'],
  B: ['#########...', '.###....###.', '.###.....###', '.###....###.', '.########...', '.###....###.', '.###.....###', '.###.....###', '.###.....###', '.###....###.', '##########..'],
  E: ['###########', '.###.....##', '.###.......', '.###..##...', '.#######...', '.###..##...', '.###.......', '.###.......', '.###.....##', '.###....###', '###########'],
  A: ['....#####....', '...###.###...', '...###.###...', '..###...###..', '..###...###..', '.###########.', '.###.....###.', '.###.....###.', '.###.....###.', '.###.....###.', '#####...#####'],
  S: ['..#########', '.###.....##', '.###.......', '.####......', '..########.', '......#####', '.......####', '........###', '##......###', '####...####', '.#########.'],
  T: ['#############', '##...###...##', '#....###....#', '.....###.....', '.....###.....', '.....###.....', '.....###.....', '.....###.....', '.....###.....', '.....###.....', '....#####....'],
  W: ['####.......####', '.###.......###.', '.###.......###.', '.###.......###.', '.###...#...###.', '.###..###..###.', '.###.#####.###.', '.#############.', '.#####...#####.', '.####.....####.', '.###.......###.'],
};

const PAINT = {
  pink: { b: [0xffb0da, 0xff86c4, 0xff4fa6, 0xe02e82], hi: 0xffe4f2, lo: 0x9a1050, side: 0xa81c60 },
  gold: { b: [0xfff07a, 0xffd630, 0xffb20c, 0xff8a00], hi: 0xfffbe0, lo: 0xb84e06, side: 0xc05a0a },
};
const INK = 0x1c1030;
const GOO = [0x9cff5a, 0x5ee02c, 0x3aa81e];
const STICK = [[0xffffff, 0x2fb8ff], [0xffffff, 0xff3f6e]];

const mixC = (a, b, k) => {
  const r = (a >> 16) & 255, g = (a >> 8) & 255, bl = a & 255;
  return (Math.round(r + (((b >> 16) & 255) - r) * k) << 16) | (Math.round(g + (((b >> 8) & 255) - g) * k) << 8) | Math.round(bl + ((b & 255) - bl) * k);
};
function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** One voxel letter (grid units: x 0..W-1, y 0..H-1 bottom-up, z 0..3; backing one voxel wider). */
function letterGrid(rows, paint, seed, o = {}) {
  const H = rows.length, W = rows[0].length;
  const cell = (x, y) => y >= 0 && y < H && x >= 0 && x < W && rows[H - 1 - y][x] === '#';
  const g = new VoxGrid();
  const r = rng(seed);
  // ink backing, dilated by one (diagonal-only neighbours left out: rounder corners)
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    if (cell(x, y)) { g.box(x, y, 0, x, y, 1, INK); continue; }
    if (cell(x - 1, y) || cell(x + 1, y) || cell(x, y - 1) || cell(x, y + 1)) g.box(x, y, 0, x, y, 1, INK);
  }
  const band = (y) => { const k = (H - 1 - y) / H; return k < 0.22 ? 0 : k < 0.42 ? 1 : k < 0.74 ? 2 : 3; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!cell(x, y)) continue;
    const bi = band(y), base = paint.b[bi];
    let c = base;
    const up = cell(x, y + 1), dn = cell(x, y - 1), lf = cell(x - 1, y), rt = cell(x + 1, y);
    if (!up) c = mixC(base, paint.hi, 0.45);
    else if (!dn) c = paint.lo;
    else if (!lf) c = mixC(base, paint.hi, 0.2);
    else if (!rt) c = mixC(base, paint.lo, 0.35);
    else if (bi === 2 && band(y + 1) === 1) c = mixC(base, paint.hi, 0.35); // glossy split line
    g.set(x, y, 3, c);
    g.set(x, y, 2, mixC(base, paint.side, 0.55));
  }
  // chipped corners: a few exposed corner voxels knocked off the face
  const corners = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!cell(x, y)) continue;
    const v = !cell(x, y + 1) || !cell(x, y - 1), hz = !cell(x - 1, y) || !cell(x + 1, y);
    if (v && hz) corners.push([x, y]);
  }
  for (let i = 0; i < 3 && corners.length; i++) {
    const [x, y] = corners.splice(Math.floor(r() * corners.length), 1)[0];
    g.set(x, y, 3, null);
    if (r() < 0.4) g.set(x, y, 2, mixC(paint.side, INK, 0.4));
  }
  // sticker: a 3x3 decal on a solid patch of the face
  if (o.sticker) {
    const [bg, fg] = o.sticker;
    outer: for (let y = 2; y < H - 3; y++) for (let x = 0; x < W - 2; x++) {
      let ok = true;
      for (let dy = 0; dy < 3 && ok; dy++) for (let dx = 0; dx < 3; dx++) if (!cell(x + dx, y + dy) || !cell(x + dx, y + dy + 1)) { ok = false; break; }
      if (!ok || r() < 0.55) continue;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) g.set(x + dx, y + dy, 3, (dx === 1 || dy === 1) && !(dx === 1 && dy === 1) ? fg : bg);
      g.set(x + 1, y + 1, 3, 0xffffff);
      break outer;
    }
  }
  // lab goo poured over the top, dripping down the face
  if (o.goo) {
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) {
      if (!cell(x, y)) continue;
      if (cell(x, y + 1)) break;
      g.box(x, y + 1, 1, x, y + 1, 4, GOO[r() < 0.7 ? 0 : 1]);
      g.set(x, y, 4, GOO[1]);
      if (r() < 0.35) {
        const n = 1 + Math.floor(r() * 4);
        for (let k = 1; k <= n && cell(x, y - k); k++) g.set(x, y - k, 4, k === n ? GOO[2] : GOO[1]);
      }
      break;
    }
  }
  return { g, W, H };
}

/** Turf + rock plinth (0.2 voxels): a front slab (top y 0) and a raised back tier (top y TIER). */
const PV = 0.2, TIER = 1.2;
function plinthGrid() {
  const g = new VoxGrid();
  const r = rng(77);
  const turf = (x, z) => [0x6fd64a, 0x5cc43c, 0x7ee05a, 0x4fb036][Math.floor(r() * 4)];
  const dirt = () => [0x8a5a34, 0x7a4c2c, 0x93653c][Math.floor(r() * 3)];
  const rock = () => [0x6a6478, 0x5a5468, 0x77708a, 0x4e4a5e][Math.floor(r() * 4)];
  // front slab x -29..29, y -5..-1, z -2..4
  for (let x = -29; x <= 29; x++) for (let z = -2; z <= 4; z++) {
    const edge = Math.abs(x) > 26 || z === 4;
    for (let y = -5; y <= -1; y++) {
      if (edge && y < -3 && r() < 0.45) continue;
      if (Math.abs(x) === 29 && (z === 4 || z === -2) && r() < 0.6) continue;
      g.set(x, y, z, y === -1 ? turf() : y === -2 ? (r() < 0.5 ? turf() : dirt()) : y === -3 ? dirt() : rock());
    }
    // hanging rock chunks under the slab
    if (r() < 0.18 && Math.abs(x) < 26) for (let y = -6; y >= -6 - Math.floor(r() * 3); y--) g.set(x, y, z, rock());
  }
  // grass tufts poking up at the front edge
  for (let x = -28; x <= 28; x += 1) if (r() < 0.12) g.set(x, 0, 4, 0x8ae86a);
  // raised back tier x -22..21, y -5..5, z -8..-3
  for (let x = -22; x <= 21; x++) for (let z = -8; z <= -3; z++) for (let y = -5; y <= 5; y++) {
    const side = x === -22 || x === 21 || z === -3;
    if (side && y < 4 && r() < 0.12) continue;
    g.set(x, y, z, y === 5 ? turf() : y === 4 ? (r() < 0.45 ? turf() : dirt()) : rock());
  }
  for (let x = -21; x <= 20; x++) if (r() < 0.1) g.set(x, 6, -3, 0x8ae86a);
  return g;
}

/** BEAST ISLAND on a painted board (2D Swarm Block glyphs, 1 voxel per cell). */
function boardGrid(text) {
  const g = new VoxGrid();
  const chars = [...text];
  let w = 0;
  for (const c of chars) w += (GLYPHS[c] ? GLYPHS[c][0].length : 3) + 1;
  w -= 1;
  const W = w + 6, H = 13;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rim = y === 0 || y === H - 1 || x === 0 || x === W - 1;
    if (rim && (x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
    const plank = Math.floor((y - 1) / 4) % 2;
    g.box(x, y, 0, x, y, 1, rim ? INK : plank ? 0x2a6fd8 : (y - 1) % 4 === 0 ? 0x4c96f0 : 0x3a86ea);
  }
  let cx = 3;
  for (const c of chars) {
    const rows = GLYPHS[c];
    if (!rows) { cx += 4; continue; }
    for (let ry = 0; ry < 7; ry++) for (let x = 0; x < rows[0].length; x++) {
      if (rows[ry][x] !== '#') continue;
      const y = H - 4 - ry;
      g.set(cx + x, y, 2, ry < 2 ? 0xffffff : ry < 5 ? 0xf2f6ff : 0xc8dcff);
      if (!(rows[ry + 1]?.[x] === '#')) g.set(cx + x, y - 1, 2, INK);
    }
    cx += rows[0].length + 1;
  }
  for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) g.set(x, y, 2, 0xb8bcc8);
  return { g, W, H };
}

// troops: role, letter (line 0 MRBEAST / 1 SWARMERS, index), size (world), start time
const CAST = [
  { id: 'fryFiend', role: 'stand', line: 0, at: 0, h: 0.72, yaw: 0.45 },
  { id: 'cloggedToilet', role: 'peek', line: 0, at: 3, h: 0.85 },
  { id: 'trashedCan', role: 'stand', line: 1, at: 0, h: 0.72, yaw: 0.5 },
  { id: 'toiletRollRipper', role: 'climb', line: 1, at: 0, h: 0.62 },
  { id: 'panther', role: 'stand', line: 1, at: -1, h: 0.78, yaw: -0.5 },
  { id: 'pizzaSlicer', role: 'hang', line: 0, at: -1, h: 0.5 },
];

export function titleLogo3d(host) {
  const st = new Stage3D({ fov: 20, maxPixels: 1.5e6, rimA: 0xff8ad0, rimB: 0xffd84a, rimI: 1.3, key: 2.4, hemi: 0.85, exposure: 0.98 });
  const sc = st.scene;
  const sun = st.key;
  sun.color.set(0xfff0d8);
  sun.position.set(-4.5, 10, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -5, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  st.renderFn = (R, scene, cam) => {
    if (!R.shadowMap.enabled) { R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap; }
    R.render(scene, cam);
  };
  const disposables = [];
  const meshOf = (geo, mats) => {
    const m = new THREE.Mesh(geo, mats);
    m.castShadow = m.receiveShadow = true;
    disposables.push(geo);
    return m;
  };
  const rest = new THREE.Group();
  sc.add(rest);
  rest.add(meshOf(plinthGrid().build({ scale: PV, pivot: [0, 0, 0], jitter: 0.04 }), Mats.pair));

  // ---- letters
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const letters = [];
  const word = (text, paint, v, y0, z0, t0, gap, line, opts) => {
    const built = [...text].map((ch, i) => {
      const seed = line * 100 + i * 7 + 3;
      const r = rng(seed * 13);
      const { g, W, H } = letterGrid(LOGO[ch], paint, seed, opts(i, ch));
      return { geo: g.build({ scale: v, pivot: [W / 2, -1, 2], jitter: 0.035 }), W, H, r };
    });
    const total = built.reduce((s, b) => s + (b.W + 2) * v, 0) + gap * (built.length - 1);
    let x = -total / 2;
    built.forEach((b, i) => {
      const w = (b.W + 2) * v;
      const holder = new THREE.Group();
      const mesh = meshOf(b.geo, Mats.toyPair);
      holder.add(mesh);
      // hand-made: sunk unevenly, nudged, turned a hair
      const sink = (b.r() - 0.5) * v * 1.6;
      holder.position.set(x + w / 2 + (b.r() - 0.5) * v * 0.8, y0 + sink, z0 + (b.r() - 0.5) * v * 2);
      mesh.rotation.set(0, (b.r() - 0.5) * 0.12, (b.r() - 0.5) * 0.05);
      rest.add(holder);
      letters.push({
        holder, mesh, line, i, w, v, H: b.H, paint, top: y0 + sink + (b.H + 1) * v, depth: 4 * v, rest: holder.position.clone(),
        t0: t0 + i * (line ? 0.13 : 0.11), y: 0, vy: 0, sq: 0, sqv: 0, state: reduce ? 'rest' : 'wait', hits: 0, spin: (b.r() - 0.5) * 0.5,
      });
      x += w + gap;
    });
  };
  word('MRBEAST', PAINT.pink, 0.075, TIER, -1.0, 0.3, 0.06, 0, (i) => ({ sticker: i === 2 ? STICK[0] : null }));
  word('SWARMERS', PAINT.gold, 0.1, 0, 0.32, 1.25, 0.06, 1, (i) => ({ goo: i === 1 || i === 4 || i === 6, sticker: i === 2 ? STICK[1] : i === 5 ? STICK[0] : null }));
  const lines = [letters.filter((l) => l.line === 0), letters.filter((l) => l.line === 1)];

  // ---- the board
  const bd = boardGrid('BEAST ISLAND');
  const BV = 0.062;
  const board = { holder: new THREE.Group(), y: 0, vy: 0, sq: 0, sqv: 0, state: reduce ? 'rest' : 'wait', t0: 2.45, hits: 0, spin: 0.2, w: bd.W * BV, v: BV, paint: PAINT.gold, line: 2 };
  board.mesh = meshOf(bd.g.build({ scale: BV, pivot: [bd.W / 2, 0, 0], jitter: 0.03 }), Mats.pair);
  board.holder.add(board.mesh);
  board.holder.position.set(0, -0.93, 1.0);
  board.rest = board.holder.position.clone();
  board.top = board.rest.y + bd.H * BV;
  rest.add(board.holder);
  const fallers = [...letters, board];
  for (const f of fallers) f.holder.visible = f.state === 'rest';

  // ---- voxel debris + dust (one instanced mesh)
  const MAXP = 420;
  const pGeo = new THREE.BoxGeometry(1, 1, 1);
  const pMat = new THREE.MeshLambertMaterial();
  const pts = new THREE.InstancedMesh(pGeo, pMat, MAXP);
  pts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pts.frustumCulled = false;
  pts.castShadow = true;
  const col = new THREE.Color();
  for (let i = 0; i < MAXP; i++) pts.setColorAt(i, col.set(0xffffff));
  sc.add(pts);
  disposables.push(pGeo, pMat);
  const P = Array.from({ length: MAXP }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), rv: new THREE.Vector3(), s: 0, dust: false, floor: 0 }));
  let pi = 0;
  const spawn = (pos, color, s, vel, life, dust, floor) => {
    const q = P[pi];
    pts.setColorAt(pi, col.set(color));
    pi = (pi + 1) % MAXP;
    q.life = q.max = life; q.p.copy(pos); q.v.copy(vel); q.s = s; q.dust = dust; q.floor = floor;
    q.r.set(Math.random() * 3, Math.random() * 3, 0); q.rv.set(rr(-9, 9), rr(-9, 9), rr(-9, 9));
    pts.instanceColor.needsUpdate = true;
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
  const tickParticles = (dt) => {
    for (let i = 0; i < MAXP; i++) {
      const q = P[i];
      if (q.life <= 0) { _m.makeScale(0, 0, 0); pts.setMatrixAt(i, _m); continue; }
      q.life -= dt;
      const k = q.life / q.max;
      if (q.dust) {
        q.v.multiplyScalar(Math.exp(-dt * 3.2));
        q.v.y += dt * 0.6;
        _s.setScalar(q.s * Math.min(1, (1 - k) * 6) * Math.max(0, k) ** 0.6);
      } else {
        q.v.y -= 22 * dt;
        q.r.x += q.rv.x * dt; q.r.y += q.rv.y * dt; q.r.z += q.rv.z * dt;
        _s.setScalar(q.s * Math.min(1, k * 4));
      }
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.floor + q.s / 2 && q.v.y < 0) {
        q.p.y = q.floor + q.s / 2;
        q.v.y *= -0.32; q.v.x *= 0.55; q.v.z *= 0.55; q.rv.multiplyScalar(0.5);
      }
      _q.setFromEuler(q.r);
      _m.compose(q.p, _q, _s);
      pts.setMatrixAt(i, _m);
    }
  };
  const rr = (a, b) => a + Math.random() * (b - a);

  let shake = 0;
  const impact = (f, speed) => {
    const p = f.rest;
    const big = f.line === 1 ? 1 : 0.75;
    const n = Math.round(10 * big);
    const cols = [f.paint.b[2], f.paint.b[1], f.paint.b[3], INK];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = rr(1.2, 3.4) * big;
      spawn(_v.set(p.x + rr(-0.5, 0.5) * f.w, p.y + rr(0.02, 0.15), p.z + rr(-0.15, 0.25)), cols[k % 4], rr(0.05, 0.1) * big, new THREE.Vector3(Math.cos(a) * sp, rr(2.5, 5.5) * big, Math.abs(Math.sin(a)) * sp * 0.8), rr(0.9, 1.5), false, p.y - 0.02);
    }
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2;
      spawn(_v.set(p.x + rr(-0.4, 0.4) * f.w, p.y + 0.03, p.z + rr(-0.1, 0.3)), [0x5cc43c, 0x7ee05a, 0x8a5a34][k % 3], rr(0.06, 0.11), new THREE.Vector3(Math.cos(a) * 2, rr(3, 5), Math.abs(Math.sin(a)) * 1.6), rr(0.8, 1.2), false, p.y - 0.02);
    }
    for (let k = 0; k < Math.round(12 * big); k++) {
      const side = k % 2 ? 1 : -1;
      spawn(_v.set(p.x + side * f.w * rr(0.2, 0.55), p.y + rr(0.03, 0.12), p.z + rr(-0.05, 0.35)), [0xf2e8d2, 0xd8ccb0, 0xe8dcc4][k % 3], rr(0.13, 0.26) * big, new THREE.Vector3(side * rr(1.2, 3.2) * big, rr(0.2, 0.9), rr(-0.2, 0.9)), rr(0.7, 1.1), true, -99);
    }
    shake = Math.min(0.32, shake + (f.line === 1 ? 0.13 : 0.08));
    engine.shake?.(f.line === 1 ? 0.07 : 0.04);
    audio.play('stamp', { vol: 0.35 * Math.min(1, speed / 20), pitch: f.line === 1 ? rr(0.75, 0.9) : rr(0.95, 1.15), gap: 0.03 });
  };
  const puffAt = (pos, s = 1) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      spawn(_v.copy(pos).add(new THREE.Vector3(0, 0.05, 0)), [0xf2e8d2, 0xd8ccb0][k % 2], rr(0.09, 0.16) * s, new THREE.Vector3(Math.cos(a) * 1.4 * s, rr(0.2, 0.7), Math.sin(a) * 0.9 * s), rr(0.5, 0.8), true, -99);
    }
  };

  // ---- troops
  const actors = [];
  for (const c of CAST) {
    const L = lines[c.line];
    const lt = L[c.at < 0 ? L.length + c.at : c.at];
    if (!lt) continue;
    let rig;
    try { rig = createSwarm(c.id, {}); } catch (e) { continue; }
    rig.posed = true;
    for (let i = 0; i < 4; i++) rig.update(0.016);
    const box = new THREE.Box3().setFromObject(rig.root);
    const h0 = Math.max(0.05, box.max.y - box.min.y);
    const s = c.h / h0;
    rig.root.scale.setScalar(s);
    rig.root.position.y = -box.min.y * s;
    const body = new THREE.Group();
    body.add(rig.root);
    const pivot = new THREE.Group();
    pivot.add(body);
    pivot.visible = false;
    sc.add(pivot);
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const depth = (box.max.z - box.min.z) * s, width = (box.max.x - box.min.x) * s;
    const p = lt.rest;
    const tgt = new THREE.Vector3();
    if (c.role === 'stand') tgt.set(p.x + (c.yaw > 0 ? -0.04 : 0.04), lt.top, p.z);
    else if (c.role === 'peek') tgt.set(p.x, TIER, p.z - lt.depth / 2 - depth / 2 - 0.08);
    else if (c.role === 'climb') tgt.set(p.x - lt.w / 2 - depth * 0.38, 0.05, p.z + 0.02);
    else if (c.role === 'hang') tgt.set(p.x + lt.w * 0.32, lt.top - 3 * lt.v, p.z + 0.02);
    pivot.position.copy(tgt);
    actors.push({ ...c, rig, body, pivot, tgt, lt, H: c.h, depth, width, k: actors.length, t: Infinity, nextMove: rr(2, 4.5), from: new THREE.Vector3(tgt.x * 1.25 + (tgt.x < 0 ? -1.5 : 1.5), -3.2, 3.5) });
  }

  // ---- camera framing: the whole sign in the lower part of the stage, sky above for the crash-ins
  const camBase = new THREE.Vector3(), look = new THREE.Vector3();
  st.onResize = (w, hh) => {
    const asp = w / hh, tn = Math.tan(THREE.MathUtils.degToRad(st.camera.fov / 2));
    const halfW = 6.3, logoH = 4.6, cy = 0.75;
    const d = Math.max(halfW / (tn * asp), logoH / 2 / tn / 0.6);
    const visH = 2 * d * tn;
    look.set(0, cy + (0.62 - 0.5) * visH, 0);
    camBase.set(0, look.y + d * Math.tan(THREE.MathUtils.degToRad(7)), d);
    st.camera.position.copy(camBase);
    st.camera.lookAt(look);
  };

  const yAxis = new THREE.Vector3(0, 1, 0);
  let landedAt = reduce ? 0 : -1; // when the board (the last piece) came to rest
  const stepFallers = (dt) => {
    for (const f of fallers) {
      if (f.state === 'wait') {
        if (t < f.t0) continue;
        f.state = 'fall'; f.y = 7.5; f.vy = -4; f.holder.visible = true;
      }
      if (f.state === 'fall') {
        f.vy -= 58 * dt;
        f.y += f.vy * dt;
        if (f.y <= 0 && f.vy < 0) {
          const sp = -f.vy;
          if (f.hits === 0) impact(f, sp);
          f.hits++;
          f.sqv += sp * 0.11;
          f.y = 0;
          f.vy = sp * (f.hits === 1 ? 0.26 : 0.18);
          if (f.vy < 1.1) { f.vy = 0; f.state = 'rest'; if (f === board) landedAt = t; }
        }
      }
      // squash spring about the base
      f.sqv += (-f.sq * 260 - f.sqv * 13) * dt;
      f.sq += f.sqv * dt;
    }
  };
  let t0 = 0, frames = 0;
  let t = 0;
  st.onUpdate(() => {
    // wall-clock timeline, started once the first frames (shader compiles) are out of the way;
    // physics in small fixed substeps so a slow frame rate never desyncs it
    if (++frames < 3) return;
    if (!t0) t0 = performance.now();
    const now = (performance.now() - t0) / 1000;
    const rdt = Math.min(0.3, Math.max(0, now - t));
    const n = Math.max(1, Math.ceil(rdt / 0.016));
    for (let i = 0; i < n; i++) { t += rdt / n; stepFallers(rdt / n); tickParticles(rdt / n); }
    const dt = Math.min(0.05, rdt);
    for (const f of fallers) {
      const sq = Math.max(-0.25, Math.min(0.35, f.sq));
      f.holder.scale.set(1 + sq * 0.55, 1 - sq, 1 + sq * 0.55);
      f.holder.position.y = f.rest.y + Math.max(0, f.y);
      f.holder.rotation.z = f.state === 'fall' ? f.spin * Math.min(1, f.y / 7.5) : 0;
    }
    if (landedAt >= 0) for (const a of actors) if (a.t === Infinity) a.t = landedAt + 0.2 + a.k * 0.2;
    // troops leap on once the sign has landed
    for (const a of actors) {
      if (t < a.t) continue;
      const T = t - a.t, rig = a.rig, body = a.body;
      if (!a.on) { a.on = true; a.pivot.visible = true; }
      const leap = 0.62;
      if (T < leap) {
        const k = T / leap;
        const p = _v.copy(a.from).lerp(a.tgt, k);
        p.y += Math.sin(k * Math.PI) * 2.2;
        a.pivot.position.copy(p);
        body.quaternion.setFromAxisAngle(yAxis, (1 - k) * 0.8);
        body.rotation.x = (1 - k) * -0.4;
        if (a.role === 'hang') body.rotation.z = k * Math.PI;
        rig.update(dt);
        continue;
      }
      if (!a.landed) {
        a.landed = true;
        a.pivot.position.copy(a.tgt);
        rig.boing(0.6);
        if (a.role !== 'hang') puffAt(a.tgt, a.role === 'stand' ? 1 : 0.7);
        shake = Math.min(0.32, shake + 0.04);
        audio.play('boing', { vol: 0.22, pitch: rr(1.1, 1.5), gap: 0.08 });
      }
      body.rotation.x = 0;
      const U = T - leap;
      if (a.role === 'stand') {
        body.quaternion.setFromAxisAngle(yAxis, a.yaw + Math.sin(U * 0.7 + a.t) * 0.3);
        if ((a.nextMove -= dt) < 0) { a.nextMove = rr(3, 5.5); rig.play(Math.random() < 0.5 ? 'roar' : 'stomp', 1.1); rig.boing(0.25); }
      } else if (a.role === 'peek') {
        // hops up behind MRBEAST to look over it, twice, then rests out of sight
        const c = U % 3.6;
        const hop = c < 0.75 ? Math.sin((c / 0.75) * Math.PI) : c > 1.0 && c < 1.75 ? Math.sin(((c - 1.0) / 0.75) * Math.PI) : 0;
        body.position.y = hop * a.lt.H * a.lt.v * 0.62;
        if (c < dt || Math.abs(c - 0.75) < dt || Math.abs(c - 1.75) < dt) rig.boing(0.3);
        body.quaternion.setFromAxisAngle(yAxis, Math.sin(U * 1.7) * 0.5);
      } else if (a.role === 'climb') {
        // grips the outside of the S, facing it: climbs, hangs on, slips, climbs again
        const c = U % 5.2, top = a.lt.H * a.lt.v * 0.55;
        let y;
        if (c < 2.6) { y = (c / 2.6) * top; rig.setState('walk'); }
        else if (c < 3.6) { y = top; rig.setState('idle'); }
        else if (c < 3.85) { y = top * (1 - ((c - 3.6) / 0.25) * 0.55); if (!a.slip) { a.slip = true; rig.boing(0.4); } }
        else { y = top * 0.45 * (1 - (c - 3.85) / 1.35); rig.setState('walk'); a.slip = false; }
        rig.walkRate = 0.55;
        body.quaternion.setFromAxisAngle(yAxis, Math.PI / 2 - 0.4);
        body.position.set(0, y, 0);
      } else if (a.role === 'hang') {
        // upside down under the T's arm, swinging
        const amp = 0.14 + 0.7 * Math.exp(-U * 1.4);
        a.pivot.rotation.z = Math.sin(U * 2.6) * amp;
        body.rotation.set(0, 0, Math.PI);
        if ((a.nextMove -= dt) < 0) { a.nextMove = rr(2.6, 4.5); rig.play('claw', 0.8); }
      }
      rig.update(dt);
    }
    pts.instanceMatrix.needsUpdate = true;
    // camera shake (decays fast)
    shake *= Math.exp(-dt * 7);
    st.camera.position.set(camBase.x + Math.sin(t * 71) * shake * 0.35, camBase.y + Math.sin(t * 89 + 1) * shake * 0.3, camBase.z);
    st.camera.lookAt(look.x + Math.sin(t * 53) * shake * 0.12, look.y, look.z);
  });

  const hostEl = host;
  st.mount(hostEl);
  st.start();
  return {
    dispose() {
      st.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
