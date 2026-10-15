// Title screen + first-time flow.
//
// The stage is the Beast Lab diorama (the first arena of Beast Island) on a
// little voxel island: terraced grass hills, sandy paths, beaches with
// umbrellas, palm trees, flowers, rocks, a lighthouse, the MrBeast yacht and
// gulls, all inside the pixel-art ocean, under a painted pixel sky with a
// rainbow and distant islands. The starter Swarms dance in front of the Lab
// and Jimmy waves. TAP TO PLAY:
//   new players -> inside the Lab (scenes/lab.js): Jimmy, your name, your
//                  FIRST PACK, then the tutorial battle and back to the Lab
//   everyone else -> Beast Island home
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { Chibi } from '../core/chibi.js';
import { Mats, makeMesh } from '../core/voxel.js';
import { mulberry32 } from '../core/util.js';
import { CHARACTERS } from '../data/characters.js';
import { createSwarm } from '../models/swarmModels.js';
import { makeArenaZone } from '../models/arenas/index.js';
import { paintGradient, paintClouds, paintSun, px, canvasTex, rockGrid } from '../models/arenas/kit.js';
import { instanced, vnoise, hash3 } from '../models/props/common.js';
import { aoGeometry, dense } from '../models/props/voxmesh.js';
import { makeOcean } from '../models/island/water.js';
import { makeDistantIslands, HORIZON } from '../models/island/sky.js';
import * as IP from '../models/island/props.js';
import { h, $ui, icon, closeDialogue } from '../ui/ui.js';
import { state } from '../game/state.js';
import { game } from '../game/game.js';

const CSS = `
.tt-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between; pointer-events: none;
  padding: calc(var(--safe-t) + var(--u) * 6) calc(var(--u) * 3) calc(var(--safe-b) + var(--u) * 5); }
.tt-logo { position: relative; text-align: center; font-family: var(--font-d); line-height: 0.82; animation: ttDrop 0.7s cubic-bezier(.2, 1.4, .4, 1) both; }
.tt-logo .l1 { font-size: calc(var(--u) * 13); color: #fff; letter-spacing: 0.04em; text-shadow: var(--outline), 0 calc(var(--px) * 4) 0 #ff2e88, 0 calc(var(--px) * 6) 0 var(--ink); }
.tt-logo .l2 { font-size: calc(var(--u) * 19); letter-spacing: 0.02em; color: #ffd84a; text-shadow: var(--outline), 0 calc(var(--px) * 4) 0 #d8861a, 0 calc(var(--px) * 7) 0 var(--ink); }
.tt-logo .l2 span { display: inline-block; animation: ttBounce 2.2s ease-in-out infinite; }
.tt-logo .bolt { position: absolute; width: calc(var(--u) * 14); height: calc(var(--u) * 14); right: calc(var(--u) * -6); top: calc(var(--u) * -4); rotate: 14deg; filter: drop-shadow(0 calc(var(--px) * 2) 0 var(--ink)); animation: ttZap 1.6s steps(2) infinite; }
.tt-logo .tag { display: inline-block; margin-top: calc(var(--u) * 2.4); padding: 0.15em 0.8em 0.25em; font-size: calc(var(--u) * 4.6); color: #fff; text-shadow: var(--outline-thin);
  background: #2b8cf2; box-shadow: 0 0 0 var(--px) var(--ink), inset 0 calc(var(--px) * -2) 0 #1a52b0, inset 0 var(--px) 0 #8fd4ff; transform: rotate(-3deg); }
@keyframes ttDrop { 0% { transform: translateY(-60%) scale(1.6); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes ttBounce { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-0.12em); } 90% { transform: translateY(0.02em); } }
@keyframes ttZap { 50% { filter: drop-shadow(0 calc(var(--px) * 2) 0 var(--ink)) brightness(1.5); } }
.tt-start { font-family: var(--font-d); font-size: calc(var(--u) * 7.5); text-shadow: var(--outline); animation: btnPulse 1.1s ease-in-out infinite; }
.tt-foot { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 2); }
.tt-disc { font-size: 0.62em; color: #dfe8ff; text-align: center; max-width: calc(var(--u) * 120); text-shadow: var(--outline-thin); opacity: 0.85; }
`;

// ---------------------------------------------------------------------------
// The voxel island around the Lab diorama

const VS = 0.5; // terrain voxel size
const WATER = -0.6;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Signed distance (units, approx.) inside the island's shoreline. */
function shoreDist(x, z) {
  const dx = x / 28, dz = (z + 7) / 26;
  const a = Math.atan2(dz, dx), r = Math.hypot(dx, dz);
  const R = 1 + 0.1 * Math.sin(a * 3 + 0.7) + 0.07 * Math.sin(a * 5 + 2.1) + (vnoise(Math.cos(a) * 2.5 + 5, Math.sin(a) * 2.5 + 5, 0.5) - 0.5) * 0.22;
  return (R - r) * 26;
}
const BUMPS = [[-7, -17, 3.6, 8], [6, -21, 2.7, 7], [-18, -6, 1.8, 5.5], [17, -9, 1.5, 5], [1, -28, 2.2, 9], [-13, -26, 2.6, 7], [14, -22, 2.0, 6]];
const PATHS = [
  [[0, 6.6], [0.7, 9.5], [-0.5, 12.5], [0.4, 15.5], [0, 19.5]],
  [[-4.6, -5.4], [-5.8, -9], [-6.4, -12.5], [-7, -15.5]],
  [[6.4, 2.6], [9.5, 3.4], [13, 2.2], [17, 3.2], [21, 2.4]],
];
function pathDist(x, z) {
  let best = 99;
  for (const P of PATHS)
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L));
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
  return best;
}
/** Column info: { h (units, quantised), s (shore distance), pd (path distance) } or null for open water. */
const _col = { h: 0, s: 0, pd: 0 };
function column(x, z) {
  const s = shoreDist(x, z);
  if (s < 0) return null;
  const pd = pathDist(x, z);
  let h = s < 3 ? -0.5 : 0;
  const k = smooth(3, 8, s) * smooth(8.5, 12, Math.hypot(x, z)) * (0.55 + 0.45 * smooth(0.6, 2.2, pd));
  if (k > 0) {
    let hill = (vnoise(x * 0.17, 3.3, z * 0.17) - 0.5) * 1.1;
    for (const [bx, bz, bh, br] of BUMPS) hill += bh * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (br * br));
    h += Math.max(0, hill) * k;
  }
  _col.h = Math.round(h / VS) * VS; _col.s = s; _col.pd = pd;
  return _col;
}
/** Ground height (units) or null for open water. */
function groundAt(x, z) { const c = column(x, z); return c ? c.h : null; }

function terrainGrid() {
  const g = dense(-72, -5, -78, 72, 14, 42);
  for (let i = -72; i <= 72; i++)
    for (let k = -78; k <= 42; k++) {
      const x = (i + 0.5) * VS, z = (k + 0.5) * VS;
      const col = column(x, z);
      if (!col) continue;
      const { s, pd } = col;
      const top = Math.round(col.h / VS) - 1;
      const sand = s < 3;
      let tc;
      if (sand) tc = s < 0.9 ? 0xdcc48e : hash3(i, 7, k) < 0.12 ? 0xf8ecc4 : 0xf0dca6;
      else if (pd < 0.8) tc = hash3(i, 3, k) < 0.5 ? 0xe8d6a8 : 0xdcc89a;
      else if (pd < 1.15 && hash3(i, 4, k) < 0.55) tc = hash3(i, 5, k) < 0.5 ? 0xb8b0a0 : 0xa09888;
      else {
        const n = vnoise(x * 0.16, 1.7, z * 0.16);
        tc = n > 0.63 ? 0x72d65c : n < 0.36 ? 0x4aa83c : 0x5cc24a;
        if (hash3(i, 9, k) < 0.03) tc = 0x8ee05a;
      }
      for (let y = -4; y <= top; y++) {
        let c = tc;
        if (y < top) c = sand ? (y > top - 2 ? 0xe2cc92 : 0xc8b07a) : y === top - 1 ? 0x6e8a3a : y > -2 ? ((y + i + k) % 3 === 0 ? 0x7a5a3c : 0x8a6a4a) : 0x8a8f9c;
        g.set(i, y, k, c);
      }
    }
  return g;
}

/** Shore-distance field for the pixel ocean shader (foam rings, shallows -> deep). */
function shoreTexture() {
  const N = 160, S = 1.25, X0 = -100, Z0 = -100;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const s = shoreDist(X0 + (i + 0.5) * S, Z0 + (j + 0.5) * S);
      const d = s >= 0 ? 0 : -s;
      const id = (j * N + i) * 4;
      data[id] = Math.round(Math.min(1, d / 32) * 255);
      data[id + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  tex.userData.rect = [X0, Z0, N * S, N * S];
  return tex;
}

/**
 * Palm tree (0.1 voxels): ringed trunk bending toward +x, coconuts, four long
 * axis-aligned fronds with straight leaflet rows (greedy-friendly) and four
 * short diagonal fronds.
 */
function palmGrid(seed) {
  const g = dense(-22, 0, -22, 28, 46, 22);
  const H = 32 + seed * 3;
  const bendAt = (y) => Math.round(((y / H) ** 2) * 6);
  for (let y = 0; y < H; y++) {
    const cx = bendAt(y), r = y < 3 ? 2.2 : 1.5;
    g.cylinder(cx, 0, y, y, r, (y >> 1) % 2 ? 0xa8763e : 0x8a5c30);
  }
  const tx = bendAt(H), ty = H;
  g.ellipsoid(tx, ty, 0, 2.4, 1.4, 2.4, 0x3f8e34);
  for (const [dx, dz] of [[-2, 1], [1, 2], [1, -2]]) g.sphere(tx + dx, ty - 2, dz, 1.1, 0x6e4224);
  const L = [0x3f9e3a, 0x4fb441, 0x5cc24a, 0x8ee05a];
  const droop = (s, n) => Math.round(1 + 4 * (s / n) - 11 * (s / n) ** 2);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = 15;
    for (let s = 1; s <= n; s++) {
      const x = tx + dx * s, z = dz * s, y = ty + droop(s, n);
      g.set(x, y, z, 0x2f7a2a);
      const w = Math.round(3.6 * Math.sin(Math.PI * Math.min(1, s / (n - 1))));
      const c = L[s > n - 3 ? 3 : (s >> 2) % 3];
      if (w > 0) {
        if (dx) { g.box(x, y - 1, z - w, x, y - 1, z - 1, c); g.box(x, y - 1, z + 1, x, y - 1, z + w, c); }
        else { g.box(x - w, y - 1, z, x - 1, y - 1, z, c); g.box(x + 1, y - 1, z, x + w, y - 1, z, c); }
      }
    }
  }
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const n = 9;
    for (let s = 1; s <= n; s++) {
      const x = tx + dx * s, z = dz * s, y = ty + droop(s, n) + 1;
      g.set(x, y, z, L[1]);
      if (s % 2 === 0 && s < n) { g.set(x + dx, y - 1, z, L[0]); g.set(x, y - 1, z + dz, L[2]); }
    }
  }
  return g;
}
/** Tiny flower (0.06 voxels): stem, leaves, four petals and a centre. */
function flowerGrid(c) {
  const g = dense(-3, 0, -3, 3, 7, 3);
  g.box(0, 0, 0, 0, 4, 0, 0x3f9e3a).set(1, 1, 0, 0x5cc24a).set(-1, 2, 0, 0x5cc24a);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(dx, 5, dz, c);
  g.set(0, 5, 0, 0xffe066).set(0, 6, 0, c);
  return g;
}
function tuftGrid() {
  const g = dense(-3, 0, -3, 3, 6, 3);
  for (const [x, z, hh] of [[0, 0, 5], [1, 1, 3], [-1, 0, 4], [1, -1, 4], [-1, 1, 2], [0, -1, 3]]) g.box(x, 0, z, x, hh - 1, z, hh > 3 ? 0x6fd45a : 0x4fb441);
  return g;
}
function bushGrid(berry) {
  const g = dense(-6, 0, -6, 6, 9, 6);
  g.ellipsoid(0, 3, 0, 4.5, 3.2, 4, (x, y, z) => (y > 4 ? 0x6fd45a : hash3(x, y, z) < 0.3 ? 0x3f9e3a : 0x4fb441));
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, y = 2 + (i % 4);
    g.set(Math.round(Math.cos(a) * 4.2), y, Math.round(Math.sin(a) * 3.8), berry);
  }
  return g;
}
function beachBallGrid() {
  const g = dense(-4, 0, -4, 4, 8, 4);
  const cols = [0xff2e88, 0xffffff, 0x29b6f6, 0xffd23f];
  g.sphere(0, 4, 0, 3.4, (x, y, z) => (y > 6 ? 0xffffff : cols[Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 2)) & 3]));
  return g;
}

function buildIsland() {
  const root = new THREE.Group();
  root.name = 'titleIsland';
  const updaters = [];
  const R = mulberry32(17);
  const timings = {};
  let tp = performance.now();
  const mark = (k) => { const n = performance.now(); timings[k] = Math.round(n - tp); tp = n; };
  const terrain = makeMesh(aoGeometry('title_terrain', terrainGrid, { scale: VS, pivot: [0, 0, 0], jitter: 0.03, skip: [3] }), Mats.pair);
  terrain.position.y = -0.03;
  terrain.castShadow = false;
  terrain.receiveShadow = true;
  root.add(terrain);
  mark('terrain');
  // pixel-art ocean with foam rings around the shore
  const ocean = makeOcean({ distTex: shoreTexture() }, 1400);
  ocean.mesh.position.y = WATER;
  root.add(ocean.mesh);
  updaters.push((dt, t) => ocean.update(t));
  mark('ocean');

  // scatter helpers
  const ground = (x, z) => groundAt(x, z);
  const free = (x, z, o = {}) => {
    const s = shoreDist(x, z);
    if (s < (o.sMin ?? 3.5) || s > (o.sMax ?? 99)) return false;
    if (Math.hypot(x, z) < (o.plaza ?? 9.6)) return false;
    if (pathDist(x, z) < (o.path ?? 1.4)) return false;
    return true;
  };
  const scatter = (n, o, tries = 400) => {
    const out = [];
    for (let k = 0; k < tries && out.length < n; k++) {
      const x = (R() - 0.5) * 60, z = -36 + R() * 50;
      if (!free(x, z, o)) continue;
      if (o.spread && out.some(([px2, , pz]) => Math.hypot(px2 - x, pz - z) < o.spread)) continue;
      out.push([x, ground(x, z), z, R() * Math.PI * 2, (o.s0 ?? 1) + R() * (o.s1 ?? 0)]);
    }
    return out;
  };
  const inst = (id, fn, scale, items, o = {}) => {
    if (!items.length) return null;
    const m = instanced(aoGeometry('title_' + id, fn, { scale, pivot: o.pivot ?? 'bottom', skip: [3] }), items, { shadow: o.shadow ?? false, receive: true });
    m.name = id;
    root.add(m);
    return m;
  };
  // palms: a ring around the beaches + a few on the hills, framing the Lab
  const palmSpots = [[-11.5, 3.5], [-13.5, -2], [11.8, 4.5], [14, -1.5], [-20, -12], [21, -14], [-9.5, -9], [9, -11], [-16, 6], [17.5, 7], [3, -26], [-3, -31], [16, -25], [-21, -22]];
  const palms = [[], [], []];
  palmSpots.forEach(([x, z], i) => {
    const gh = ground(x, z);
    if (gh === null) return;
    // detailed palms up front, chunky low-poly ones on the far hills
    palms[z < -11 ? 2 : i % 2].push([x, gh, z, R() * Math.PI * 2, (z < -11 ? 0.22 : 1) * (0.85 + R() * 0.35)]);
  });
  palms.forEach((it, k) => inst('palm' + k, () => (k < 2 ? palmGrid(k) : IP.LOWPOLY.palm(0x4cba3a, 3)), k < 2 ? 0.1 : 1, it, { pivot: k < 2 ? [0, 0, 0] : 'bottom', shadow: true }));
  inst('bushA', () => bushGrid(0xff4f8a), 0.11, scatter(9, { spread: 3 }), { shadow: true });
  inst('bushB', () => bushGrid(0xffd23f), 0.11, scatter(8, { spread: 3 }), { shadow: true });
  const flowerCols = [0xff4a5a, 0xffd23f, 0xffffff, 0xff6fb8, 0xb88cff];
  flowerCols.forEach((c, k) => inst('flower' + k, () => flowerGrid(c), 0.06, scatter(24, { plaza: 8.2, path: 1.0 }), {}));
  inst('tuft', tuftGrid, 0.07, scatter(64, { plaza: 8.2, path: 1.0 }), {});
  inst('rockA', () => rockGrid({ color: 0x9aa2b4, r: 3 }), 0.12, scatter(10, { sMin: 0.5, sMax: 6, spread: 2 }), { shadow: true });
  inst('rockB', () => rockGrid({ color: 0x7f9a74, r: 4 }), 0.12, scatter(7, { sMin: 5, spread: 3 }), { shadow: true });
  inst('ball', beachBallGrid, 0.06, [[-19.5, ground(-19.5, -4) ?? -0.5, -4, 0, 1], [20.5, ground(20.5, 2) ?? -0.5, 2, 1, 1]], {});
  mark('scatter');
  // beach umbrellas + towels
  for (const [c, spots] of [[0xff4fa3, [[-21, -1], [22, -6]]], [0x29b6f6, [[-23, -8], [20.5, 5]]]]) {
    const items = spots.map(([x, z]) => [x, ground(x, z) ?? -0.5, z, R() * 6, 1]).filter((it) => shoreDist(it[0], it[2]) > 0);
    if (items.length) {
      const m = instanced(IP.geo('umbrella' + (c === 0xff4fa3 ? 0 : 1), () => IP.umbrellaGrid(c), 0.1, 'bottom'), items, { shadow: true });
      root.add(m);
    }
  }
  // lighthouse on the big hill
  const lh = IP.mesh(IP.geo('lighthouse', IP.lighthouseGrid, 0.25, [0, 0, 0]), {});
  lh.position.set(-7, (ground(-7, -17) ?? 0) - 0.1, -17);
  lh.scale.setScalar(0.42);
  root.add(lh);
  // the MrBeast yacht off the back-right beach
  const yacht = IP.mesh(IP.geo('yacht', IP.yachtGrid, 0.2, 'bottom'), {});
  yacht.scale.setScalar(0.6);
  yacht.position.set(25, WATER - 0.25, -27);
  yacht.rotation.y = -2.2;
  root.add(yacht);
  updaters.push((dt, t) => {
    yacht.position.y = WATER - 0.25 + Math.sin(t * 1.1) * 0.06;
    yacht.rotation.z = Math.sin(t * 0.9) * 0.02;
  });
  // gulls circling over the island
  const gulls = [];
  for (let i = 0; i < 6; i++) gulls.push({ cx: (R() - 0.5) * 24, cy: 6.5 + R() * 3, cz: -10 - R() * 14, r: 4 + R() * 5, sp: (0.35 + R() * 0.25) * (i % 2 ? -1 : 1), ph: R() * 6.28, fl: 6 + R() * 3 });
  const bodies = new THREE.InstancedMesh(IP.geo('gullBody', IP.gullBodyGrid, 0.07, 'center'), Mats.pair, gulls.length);
  const wings = new THREE.InstancedMesh(IP.geo('gullWing', IP.gullWingGrid, 0.07, [0, 0, 0]), Mats.pair, gulls.length * 2);
  for (const im of [bodies, wings]) { im.frustumCulled = false; root.add(im); }
  const m4 = new THREE.Matrix4(), w4 = new THREE.Matrix4(), rz = new THREE.Matrix4(), ry = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  updaters.push((dt, t) => {
    gulls.forEach((G, i) => {
      const a = G.ph + t * G.sp;
      p.set(G.cx + Math.cos(a) * G.r, G.cy + Math.sin(t * 0.7 + G.ph) * 0.6, G.cz + Math.sin(a) * G.r);
      e.set(0, Math.atan2(-Math.sin(a) * Math.sign(G.sp), Math.cos(a) * Math.sign(G.sp)), -Math.sign(G.sp) * 0.35, 'YXZ');
      q.setFromEuler(e);
      m4.compose(p, q, one);
      bodies.setMatrixAt(i, m4);
      const flap = Math.sin(t * G.fl + G.ph) * 0.55;
      for (const sd of [1, -1]) {
        w4.makeTranslation(0, 0.1, 0);
        w4.multiply(rz.makeRotationZ(sd * flap));
        if (sd < 0) w4.multiply(ry.makeRotationY(Math.PI));
        bodies.getMatrixAt(i, m4);
        m4.multiply(w4);
        wings.setMatrixAt(i * 2 + (sd > 0 ? 0 : 1), m4);
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  });
  // distant islands on the horizon (pre-hazed pixel cards)
  const far = makeDistantIslands(7, 520);
  far.scale.setScalar(0.34);
  root.add(far);
  mark('props');
  return { root, timings, update: (dt, t) => { for (const u of updaters) u(dt, t); } };
}

/**
 * Painted pixel sky card far behind the island, sized to the band the title
 * camera sees above the sea (y -10..90 at z = -420): dithered gradient, sun
 * with rays, a rainbow, clouds and little birds.
 */
function makeSkyCard() {
  const W = 256, H = 46;
  const tex = canvasTex('titleSky4', W, H, (ctx) => {
    paintGradient(ctx, 0, 0, W, H, [[0, 0x2a86f0], [0.45, 0x6cc4ff], [0.72, 0xaee4ff], [0.84, HORIZON], [1, HORIZON]], { bands: 12 });
    // rainbow rising from the sea on the left
    const rb = [0xff4a5a, 0xff9a3a, 0xffe066, 0x6fe06a, 0x4ab8ff, 0xa87aff];
    const rcx = 84, rcy = 44;
    for (let y = 0; y < 40; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - rcx) * 0.55, y - rcy);
      const band = Math.floor(30 - d);
      if (band >= 0 && band < 6) px(ctx, x, y, 1, 1, rb[band], 0.5 * Math.min(1, (40 - y) / 8));
    }
    // sun + pixel rays
    const sx = 152, sy = 11;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13;
      for (let r = 7; r < (k % 2 ? 11 : 14); r++) px(ctx, Math.round(sx + Math.cos(a) * r * 1.6), Math.round(sy + Math.sin(a) * r), 1, 1, 0xfff6c8, 0.6);
    }
    paintSun(ctx, sx, sy, 5, 0xfff2b0, 0xfffbe8);
    // clouds: small high ones, a puffy band low over the horizon
    paintClouds(ctx, W, H, { n: 6, y0: 4, y1: 16, size: 3, seed: 11, shade: 0xd0e6fa });
    paintClouds(ctx, W, H, { n: 9, y0: 27, y1: 35, size: 4, seed: 4, shade: 0xd6ecfb, light: 0xffffff });
    for (const [bx, by] of [[118, 9], [124, 7], [131, 10], [64, 15]]) { px(ctx, bx - 2, by, 2, 1, 0x2a3a5a); px(ctx, bx, by + 1, 1, 1, 0x2a3a5a); px(ctx, bx + 1, by, 2, 1, 0x2a3a5a); }
  }, { mip: false });
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(560, 100), mat);
  m.position.set(0, 40, -420);
  m.renderOrder = -10;
  m.name = 'skyCard';
  return m;
}

export class TitleScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, engine.aspect, 0.1, 600);
    this.t = 0;
    this.actors = [];
    this.camMode = 'title';
    this.focus = new THREE.Vector3(0, 1.2, 0);
  }

  async enter(params = {}) {
    this.params = params;
    const s = this.scene;
    const Z = await makeArenaZone('lab');
    this.zone = Z;
    s.add(Z.root);
    s.background = new THREE.Color(HORIZON);
    s.add(makeSkyCard());
    s.fog = new THREE.Fog(HORIZON, 45, 170);
    addLights(s, { sky: 0xdff0ff, ground: 0x7a8a6a, hemi: 1.2, sun: 2.3, dir: [-8, 16, 12], shadowExtent: 16, rim: 1.0 });
    // the voxel island (replaces the old flat ground disc)
    const t0 = performance.now();
    this.island = buildIsland();
    s.add(this.island.root);
    this.buildMs = performance.now() - t0;
    this.focus = new THREE.Vector3(...(Z.focus ?? [0, 1, 0]));
    // the starter squad dancing in front of the Lab
    const ids = ['panther', 'cloggedToilet', 'fryFiend', 'trashedCan', 'pizzaSlicer', 'toiletRollRipper'];
    const spots = [[-1.7, 5.9], [1.7, 5.9], [-3.1, 5.2], [3.1, 5.2], [-4.4, 4.4], [4.4, 4.4]];
    ids.forEach((id, i) => {
      const rig = createSwarm(id, { scale: 1.15 });
      const [x, z] = spots[i];
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = -x * 0.08;
      rig.setState('dance');
      rig.danceT = i * 0.4;
      s.add(rig.root);
      this.actors.push({ rig, i });
    });
    // Jimmy
    this.jimmy = new Chibi(CHARACTERS.jimmy, { scale: 1.25 });
    this.jimmy.root.position.set(0, 0, 6.6);
    this.jimmy.root.rotation.y = 0;
    this.jimmy.play('wave');
    s.add(this.jimmy.root);
    this.placeCam(true);
    // UI
    if (!document.getElementById('tt-css')) document.head.appendChild(h('style', { id: 'tt-css' }, CSS));
    const name = 'SWARMERS';
    this.ui = h('div', { class: 'tt-wrap' },
      h('div', { class: 'tt-logo' },
        h('div', { class: 'l1' }, 'MrBeast'),
        h('div', { class: 'l2' }, [...name].map((ch, i) => h('span', { style: { animationDelay: `${i * 0.08}s` } }, ch))),
        h('img', { class: 'bolt', src: iconURL_bolt() }),
        h('div', { class: 'tag' }, 'BEAST ISLAND')),
      h('div', { class: 'tt-foot' },
        this.startEl = h('div', { class: 'tt-start' }, 'TAP TO PLAY'),
        h('div', { class: 'tt-disc' }, 'Unofficial fan-made game. Not affiliated with MrBeast or Moose Toys. MrBeast Lab Swarms are toys by Moose Toys.')));
    $ui().appendChild(this.ui);
    audio.music('title');
    // a tutorial that was interrupted after the battle picks up in the Lab
    if (state.p.tutorial === 'briefcase') { this.ui.style.display = 'none'; setTimeout(() => game.go('lab', { step: 'won' }), 300); return; }
    this.onTap = (e) => {
      e.preventDefault();
      engine.canvas.removeEventListener('pointerdown', this.onTap);
      this.ui.removeEventListener('pointerdown', this.onTap);
      audio.unlock();
      audio.play('go');
      this.start();
    };
    engine.canvas.addEventListener('pointerdown', this.onTap);
    this.ui.style.pointerEvents = 'auto';
    this.ui.addEventListener('pointerdown', this.onTap);
  }

  placeCam(snap = false) {
    const a = this.camera.aspect;
    let pos, look;
    if (this.camMode === 'jimmy' && this.jimmy) {
      const j = this.jimmy.root.position;
      look = new THREE.Vector3(j.x, j.y + (a < 1 ? 1.2 : 1.7), j.z);
      pos = look.clone().add(new THREE.Vector3(0.9, 0.9, 6.5).multiplyScalar(a < 1 ? 1.95 : 1.1));
    } else {
      // low enough that the sea horizon sits under the logo with sky above it
      const port = a < 1;
      const D = port ? 29 : 24, H = port ? 7.4 : 6.6, pitch = (8 * Math.PI) / 180;
      look = new THREE.Vector3(this.focus.x, H - D * Math.tan(pitch), this.focus.z);
      pos = new THREE.Vector3(this.focus.x + Math.sin(this.t * 0.08) * 4, H, this.focus.z + D);
    }
    this.camTo = { pos, look };
    if (snap || !this.camAt) this.camAt = { pos: pos.clone(), look: look.clone() };
  }

  async start() {
    const p = state.p;
    if (p.tutorial === 'done' || p.tutorial === 'home') {
      game.go('home');
      return;
    }
    // first time: into the Lab to meet Jimmy and open your first pack
    this.ui.style.display = 'none';
    this.camMode = 'jimmy';
    this.jimmy.play('wave');
    this.jimmy.expr('happy', 'grin', 2);
    audio.play('whoosh');
    await wait(0.5);
    game.go('lab');
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this.placeCam(true);
  }

  update(dt) {
    this.t += dt;
    this.zone?.update?.(dt, this.t);
    this.island?.update(dt, this.t);
    for (const a of this.actors) {
      a.rig.update(dt);
      if (Math.random() < dt * 0.15) { a.rig.attack(0.5); a.rig.boing(0.4); }
    }
    this.jimmy?.update(dt);
    if (this.jimmy && Math.random() < dt * 0.6) fx.sparkle(new THREE.Vector3((Math.random() - 0.5) * 10, 0.5 + Math.random() * 3, 5 + Math.random() * 2), { count: 1, colors: [0xffd84a, 0xff7ac0, 0x8fd4ff], speed: 0.6 });
    this.placeCam();
    const k = Math.min(1, dt * 2.2);
    this.camAt.pos.lerp(this.camTo.pos, k);
    this.camAt.look.lerp(this.camTo.look, k);
    this.camera.position.copy(this.camAt.pos);
    this.camera.lookAt(this.camAt.look);
  }

  exit() {
    if (this.onTap) engine.canvas.removeEventListener('pointerdown', this.onTap);
    closeDialogue();
  }
}

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** The MrBeast Lab lightning-bolt logo as a tiny pixel-art image. */
let _bolt = null;
function iconURL_bolt() {
  if (_bolt) return _bolt;
  const rows = [
    '......kkkkk', '.....kpppk.', '....kpppk..', '...kpppk...', '..kppppkkk.', '.kppppppppk', 'kkkkkpppk..', '...kpppk...', '..kpppk....', '.kppk......', 'kpk........', 'kk.........',
  ];
  const c = document.createElement('canvas');
  c.width = 11; c.height = 12;
  const ctx = c.getContext('2d');
  const pal = { k: '#120c24', p: '#ff2e88' };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); } }));
  _bolt = c.toDataURL();
  void icon;
  return _bolt;
}
