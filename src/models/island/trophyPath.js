// TROPHY ROAD, built into Beast Island: every milestone of TROPHY_ROAD stands
// beside the island's paved road as a stone pedestal (trophy count on its
// front plate) with a voxel chest on top and the actual reward floating above
// it. Arena thresholds get a stone arch over the road (portcullis down while
// the arena is locked). Past the last arena the road keeps going: floating
// tech tiles spiral up around the space elevator to orbit pads.
//
//   const TP = addTrophyPath({ T, root, roadPoints, roadIdx, zones, plinthR, exclude, updaters });
//   TP.milestones[i]  { m, key, t, s, chapter, gate, color, anchor (pedestal top centre), rewardPos, group }
//   TP.posAt(s, out) / TP.tangentAt(s, out)   along the road polyline (arc length s, 0..TP.length)
//   TP.sOfTrophies(t)  where a player with t trophies stands (between the milestones around t)
//   TP.setState(i, 'locked' | 'ready' | 'claimed')   chest look (grey / glowing + bouncing / open + flag)
//   TP.setGateLocked(arenaId, locked)   portcullis
//   TP.open(i)  plays the lid-pop (then the chest stays open)
//   TP.setFocus(i | -1)  pixel arrow over a milestone's reward
//   TP.atlas { canvas, ctx, cell, rect(i), commit() }  the reward art atlas (painted by the home scene)
//   TP.camDir  horizontal unit vector (x, z) from a road point toward the road camera
//
// Everything still is plain voxel meshes in the island root (static-batched by the home scene);
// the rewards, rays and focus arrow are one instanced pixel-billboard draw.
import * as THREE from 'three';
import { VoxGrid, Mats } from '../../core/voxel.js';
import { text, textW } from '../props/common.js';
import { shade, clamp } from '../../core/util.js';
import { TROPHY_ROAD, ARENAS } from '../../data/arenas.js';
import * as P from './props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// the road camera looks from the south (a touch east), so every plate faces that way
const CAM_DIR = new THREE.Vector2(0.14, 1).normalize();
const FACE_Y = Math.atan2(CAM_DIR.x, CAM_DIR.y);
const PV = 0.1; // pedestal / chest voxel
const GV = 0.125; // gate voxel
const SIDE = 1.5 + 1.35; // pedestal centre offset from the road centre line
const ATLAS = 1024;
let CELL = 102, PER_ROW = 10;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const hex = (c) => (typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c);

// ---------------------------------------------------------------------------
// Voxel grids

const TROPHY = ['#####', '#####', '.###.', '..#..', '.###.'];
/** Stone pedestal with a cream number plate on its +z face (tall digits: they stay legible from above). Top at y = 0 (local), PH tall, a deep skirt below. */
const PH = 1.3;
function pedestalGrid(num, color, tech = false) {
  const g = new VoxGrid();
  const label = String(num);
  const tw = textW(label) + 7;
  const W = (tw + 5) | 1;
  const hw = (W - 1) / 2;
  const D = 5; // half depth
  const st = tech ? [0xd8dce8, 0xb0b6c8, 0xeef0f8] : [0xe6e0d2, 0xcbc2ae, 0xf4f0e6];
  const trim = hex(color), trimD = shade(trim, -0.3), trimL = shade(trim, 0.3);
  for (let x = -hw; x <= hw; x++) for (let z = -D; z <= D; z++) for (let y = -22; y <= -3; y++) {
    // brick courses: 2 voxels tall, joints staggered per course
    const course = Math.floor((y + 40) / 2);
    const joint = (y & 1) === 0 || ((x + z + course * 3) & 7) === 0;
    g.set(x, y, z, joint ? st[1] : ((x * 7 + y * 3 + z) & 5) ? st[0] : st[2]);
  }
  // overhanging cap in the arena colour
  for (let x = -hw - 1; x <= hw + 1; x++) for (let z = -D - 1; z <= D + 1; z++) {
    const edge = Math.abs(x) === hw + 1 || Math.abs(z) === D + 1;
    g.set(x, -2, z, edge ? trimD : trim);
    g.set(x, -1, z, edge ? trim : (((x + z) & 1) ? st[2] : st[0]));
  }
  for (let x = -hw; x <= hw; x += 2) g.set(x, -1, D + 1, trimL);
  // number plate on the front: trophy + count (digits twice as tall as wide)
  const yb = -13;
  const px0 = -Math.ceil(tw / 2) - 1, px1 = px0 + tw + 1;
  g.box(px0, yb - 1, D + 1, px1, yb + 10, D + 1, 0x3a2a18);
  g.box(px0 + 1, yb, D + 1, px1 - 1, yb + 9, D + 1, 0xfff6dc);
  const tx = px0 + 2;
  TROPHY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(tx + c, yb + 7 - r, D + 2, r < 2 ? 0xffd23f : 0xe0a010); }));
  text(g, label, tx + 7, yb, D + 2, '+z', 0x6a3a10, { sy: 2 });
  return g;
}

const CHEST = {
  wood: { body: 0xa8703c, bodyD: 0x7a4a24, bodyL: 0xc98c55, band: 0x8f98aa, bandL: 0xd7dde6, lock: 0xffc21a },
  blue: { body: 0x2b8cf2, bodyD: 0x1460b8, bodyL: 0x6cc0ff, band: 0xffc21a, bandL: 0xffe680, lock: 0xffffff },
  gold: { body: 0xffc21a, bodyD: 0xc8901a, bodyL: 0xffe680, band: 0xb05cff, bandL: 0xe0b0ff, lock: 0xff4fa3 },
  tech: { body: 0xd8dce8, bodyD: 0x8f98aa, bodyL: 0xffffff, band: 0x29e0ff, bandL: 0x9ff4ff, lock: 0x8f9bff },
};
const CW = 6, CD = 4, CH = 5; // half width, half depth, body height
/** Chest body, top open (dark inside). Bottom at y = 0. */
function chestBodyGrid(tier, glow) {
  const C = CHEST[tier], g = new VoxGrid();
  for (let x = -CW; x <= CW - 1; x++) for (let z = -CD; z <= CD - 1; z++) for (let y = 0; y < CH; y++) {
    const ex = x === -CW || x === CW - 1, ez = z === -CD || z === CD - 1;
    const inside = !ex && !ez;
    if (inside && y === CH - 1) { g.set(x, y, z, 0x2a1a10); continue; }
    if (inside && y > 0) continue;
    const band = x === -CW + 2 || x === CW - 3;
    const rim = y === CH - 1 || y === 0;
    const c = band ? C.band : rim ? C.bodyD : (y === CH - 2 ? C.bodyL : C.body);
    g.set(x, y, z, c, glow && (band || (rim && y === CH - 1)));
  }
  // lock plate on the front
  g.box(-1, CH - 3, CD, 0, CH - 1, CD, C.lock, glow);
  return g;
}
/** Chest lid; hinge on its back-bottom edge at local (0, 0, 0), extending toward +z. */
function chestLidGrid(tier, glow) {
  const C = CHEST[tier], g = new VoxGrid();
  for (let x = -CW; x <= CW - 1; x++) for (let z = 0; z < CD * 2; z++) for (let y = 0; y < 4; y++) {
    if (y === 3 && (z === 0 || z === CD * 2 - 1)) continue; // rounded top
    const band = x === -CW + 2 || x === CW - 3;
    const c = band ? (y === 3 ? C.bandL : C.band) : y === 0 ? C.bodyD : y === 3 ? C.bodyL : C.body;
    g.set(x, y, z, c, glow && (band || y === 0));
  }
  g.box(-1, 0, CD * 2, 0, 1, CD * 2, C.lock, glow);
  return g;
}
/** Closed chest in one grid (body + lid), for the instanced bouncing chests. */
function chestClosedGrid(tier, glow) {
  const g = chestBodyGrid(tier, glow);
  chestLidGrid(tier, glow).forEach((x, y, z, c, gl) => g.set(x, y + CH, z - CD, c, gl));
  return g;
}
/** Little claimed flag: pole + green pennant with a white check on both faces. */
function flagGrid() {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 16, 0, 0x6e4224);
  g.set(0, 17, 0, 0xffc21a);
  g.box(1, 10, 0, 8, 16, 0, 0x3fbf4f);
  g.box(1, 10, 0, 8, 10, 0, 0x2a8a3a);
  const chk = ['.....#', '....#.', '#..#..', '.##...'];
  chk.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') { g.set(2 + c, 15 - r, 1, 0xffffff); g.set(2 + c, 15 - r, -1, 0xffffff); } }));
  return g;
}

/** Arena gate: two brick pillars + a beam with the trophy plate (both faces). Road runs along local z. */
function gateGrid(num, color) {
  const g = new VoxGrid();
  const col = hex(color), colD = shade(col, -0.3), colL = shade(col, 0.35);
  const half = 15; // inner half width (voxels)
  const PW = 3; // pillar half width
  const top = 34;
  const st = [0xe6e0d2, 0xcbc2ae, 0xf4f0e6];
  for (const sx of [-1, 1]) {
    const cx = sx * (half + PW);
    for (let x = cx - PW; x <= cx + PW; x++) for (let z = -PW; z <= PW; z++) for (let y = -10; y < top; y++) {
      const edge = Math.abs(x - cx) === PW || Math.abs(z) === PW;
      if (!edge && y > -2) continue;
      const course = Math.floor((y + 40) / 3);
      const joint = (y % 3 === 0) || ((x + z + course * 2) % 5 === 0);
      let c = joint ? st[1] : ((x * 3 + y) & 3) ? st[0] : st[2];
      if (y >= top - 9 && y < top - 6) c = col;
      if (y === top - 6) c = colD;
      g.set(x, y, z, c);
    }
    // cap + torch
    g.box(cx - PW - 1, top, -PW - 1, cx + PW + 1, top + 1, PW + 1, colD);
    g.box(cx - 1, top + 2, -1, cx + 1, top + 2, 1, 0x3d4352);
    g.box(cx - 1, top + 3, -1, cx + 1, top + 5, 1, 0xffb84a, true);
    g.set(cx, top + 6, 0, 0xffe08a, true);
  }
  // beam
  const by0 = top - 6, by1 = top - 1;
  g.box(-half - PW, by0, -2, half + PW, by1, 2, (x, y) => (y === by0 ? colD : y === by1 ? colL : col));
  g.box(-half - PW, by1 + 1, -2, half + PW, by1 + 1, 2, 0xffc21a);
  // trophy plate on both faces
  const label = String(num);
  const tw = textW(label) + 7;
  const x0 = -Math.ceil(tw / 2) - 2, x1 = x0 + tw + 3;
  for (const f of [1, -1]) {
    const z = f * 3;
    const yb = by0;
    g.box(x0, yb - 2, z, x1, yb + 6, z, 0x3a2a18);
    g.box(x0 + 1, yb - 1, z, x1 - 1, yb + 5, z, 0xfff6dc);
    const tx = f > 0 ? x0 + 3 : x1 - 3;
    TROPHY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(tx + (f > 0 ? c : -c), yb + 4 - r, z + f, r < 2 ? 0xffd23f : 0xe0a010); }));
    if (f > 0) text(g, label, tx + 7, yb, z + f, '+z', 0x6a3a10);
    else text(g, label, tx - 7, yb, z + f, '-z', 0x6a3a10);
  }
  // hanging pennants under the beam
  for (const px of [-half + 2, half - 4]) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 3; x++) {
      if (y === 6 && x === 1) continue; // V-cut tail
      g.set(px + x, by0 - 1 - y, 0, y === 1 || y === 4 ? colL : col);
    }
  }
  return g;
}
/** Portcullis between the gate pillars (iron bars). */
function portcullisGrid() {
  const g = new VoxGrid();
  const half = 15, top = 27;
  for (let x = -half; x <= half; x++) for (let y = 0; y < top; y++) {
    const bar = (x + half) % 4 === 1, rail = y % 7 === 3;
    if (!bar && !rail) continue;
    g.set(x, y, 0, bar ? (y === 0 ? 0x3d4352 : 0x6b7386) : 0x4a5262);
    if (bar && y === 0) g.set(x, -1, 0, 0x3d4352);
  }
  return g;
}
/** Floating tech tile (orbit road). */
function skyTileGrid() {
  const g = new VoxGrid();
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    const edge = Math.abs(x) === 4 || Math.abs(z) === 4;
    if (Math.abs(x) === 4 && Math.abs(z) === 4) continue;
    g.set(x, 0, z, edge ? 0x29e0ff : ((x + z) & 1 ? 0xeef0f8 : 0xd8dce8), edge);
    g.set(x, -1, z, 0x8f98aa);
  }
  g.box(-1, -2, -1, 1, -2, 1, 0x9ff4ff, true);
  return g;
}
/** Orbit pad under a milestone past the last arena. */
function orbitPadGrid() {
  const g = new VoxGrid();
  const R = 14;
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
    const o = Math.max(Math.abs(x), Math.abs(z), (Math.abs(x) + Math.abs(z)) / 1.38);
    if (o > R) continue;
    const rim = o > R - 1.5;
    g.set(x, 0, z, rim ? 0x8f9bff : (((x >> 2) + (z >> 2)) & 1 ? 0xeef0f8 : 0xd8dce8), rim && ((x + z) & 3) === 0);
    if (o < R - 1) g.set(x, -1, z, 0xb0b6c8);
    if (o < R - 4) g.set(x, -2, z, 0x8f98aa);
  }
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
    g.box(x - 1, -4, z - 1, x + 1, -3, z + 1, 0x6b7386);
    g.box(x - 1, -5, z - 1, x + 1, -5, z + 1, 0x9ff4ff, true);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Pixel billboards: reward art, glow rays, focus arrow (one instanced draw)

function makeBillboards(n, map) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aFrame = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const aPar = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  geo.setAttribute('aFrame', aFrame);
  geo.setAttribute('aPar', aPar);
  const mat = new THREE.MeshBasicMaterial({ map, fog: true });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFrame;\nattribute vec4 aPar;\nuniform float uTime;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = aFrame.xy + uv * aFrame.zw;
        if (aPar.z > 0.5) vMapUv.x += step(0.5, fract(uTime * 2.5 + aPar.x)) * aFrame.z;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float bsx = length(instanceMatrix[0].xyz), bsy = length(instanceMatrix[1].xyz);
        mvPosition.y += sin(uTime * 2.4 + aPar.x) * aPar.y;
        mvPosition = modelViewMatrix * mvPosition;
        mvPosition.z += aPar.w;
        mvPosition.xy += position.xy * vec2(bsx, bsy);
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        if (diffuseColor.a < 0.5) discard;
        diffuseColor.a = 1.0;`);
  };
  mat.customProgramCacheKey = () => 'trophyBillboard';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.name = 'trophyRewards';
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  return {
    mesh, uTime,
    set(i, pos, sx, sy = sx) {
      _p.copy(pos);
      _s.set(Math.max(1e-4, sx), Math.max(1e-4, sy), 1);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      mesh.instanceMatrix.needsUpdate = true;
    },
    frame(i, r) { aFrame.setXYZW(i, r[0], r[1], r[2], r[3]); aFrame.needsUpdate = true; },
    par(i, phase, bob, frames, zoff) { aPar.setXYZW(i, phase, bob, frames, zoff); aPar.needsUpdate = true; },
    tint(i, k) { mesh.setColorAt(i, c.setScalar(k)); mesh.instanceColor.needsUpdate = true; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ---------------------------------------------------------------------------

/**
 * zones: the island's zone specs ({ id, x, z, y, ground, color }) in arena order;
 * roadIdx[k]: index of zone k's centre in roadPoints.
 */
export function addTrophyPath({ T, root, roadPoints, roadIdx, zones, plinthR, exclude, updaters }) {
  const group = new THREE.Group();
  group.name = 'trophyRoad';
  root.add(group);

  // ------------------------------------------------ the path polyline (+ orbit extension)
  const pts = roadPoints.map((p) => p.clone());
  const last = zones[zones.length - 1];
  const lastArena = ARENAS[ARENAS.length - 1];
  const beyond = TROPHY_ROAD.filter((m) => m.t > lastArena.trophies && !m.arena);
  const skyStart = pts.length;
  if (beyond.length) {
    // out across the anchor plaza, then a rising half-turn in front of the elevator tether
    const cx = last.x, cz = last.z, gy = (last.ground ?? last.y);
    const R = 12, a0 = 0, turn = Math.PI * 1.05;
    const rise = Math.min(20, (last.y - gy) - 6);
    for (let r = 1; r <= R; r++) pts.push(V(cx + r, gy + Math.max(0, r - 8) * 0.2, cz));
    const y0 = gy + 0.8;
    const len = R * turn;
    const n = Math.ceil(Math.hypot(len, rise));
    for (let i = 1; i <= n; i++) {
      const u = i / n, a = a0 + u * turn; // +a swings south (toward the camera) first
      pts.push(V(cx + Math.cos(a) * R, y0 + rise * (u * 0.85 + u * u * 0.15), cz + Math.sin(a) * R));
    }
  }
  const arc = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) arc[i] = arc[i - 1] + pts[i].distanceTo(pts[i - 1]);
  const length = arc[pts.length - 1];
  const idxAt = (s) => {
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
    return lo;
  };
  const posAt = (s, out = new THREE.Vector3()) => {
    s = clamp(s, 0, length);
    const i = idxAt(s), j = Math.min(pts.length - 1, i + 1);
    const u = arc[j] > arc[i] ? (s - arc[i]) / (arc[j] - arc[i]) : 0;
    return out.copy(pts[i]).lerp(pts[j], u);
  };
  const tangentAt = (s, out = new THREE.Vector3()) => {
    const a = posAt(s - 1.5), b = posAt(s + 1.5);
    return out.copy(b).sub(a).setY(0).normalize();
  };

  // ------------------------------------------------ zone gates + chapter ranges
  const zS = zones.map((Z, k) => arc[roadIdx[k]]);
  const near = (p, Z, r) => Math.hypot(p.x - Z.x, p.z - Z.z) < r;
  const exitS = zones.map((Z, k) => {
    let i = roadIdx[k];
    while (i < roadPoints.length - 1 && near(pts[i], Z, plinthR + 2.4)) i++;
    return arc[i];
  });
  const gateS = zones.map((Z, k) => {
    if (k === 0) return 0;
    let i = roadIdx[k];
    while (i > 0 && near(pts[i], Z, plinthR + 3.2)) i--;
    return arc[i];
  });
  if (beyond.length) exitS[zones.length - 1] = arc[skyStart + 10] ?? exitS[zones.length - 1];

  // ------------------------------------------------ milestones
  const arenaIdx = (t) => { let k = 0; for (let i = 0; i < ARENAS.length; i++) if (t >= ARENAS[i].trophies) k = i; return k; };
  const chapters = ARENAS.map(() => []);
  const gates = new Map();
  for (const m of TROPHY_ROAD) {
    const k = m.arena ? ARENAS.findIndex((a) => a.id === m.arena) : -1;
    if (k > 0) gates.set(k, m);
    else chapters[arenaIdx(m.t)].push(m);
  }
  const list = [];
  ARENAS.forEach((A, k) => {
    if (k >= zones.length) return;
    const g = gates.get(k);
    if (g) list.push({ m: g, s: gateS[k] - 2.6, chapter: k, gate: true });
    const items = chapters[k].sort((a, b) => a.t - b.t);
    const a = exitS[k] + 1.4;
    const b = k + 1 < zones.length ? gateS[k + 1] - (gates.get(k + 1) ? 5.2 : 3.2) : length - 2;
    const n = items.length;
    // even spacing along the chapter (Clash Royale style), never closer than the pedestal size
    items.forEach((m, i) => {
      const s = n === 1 ? (a + b) / 2 : a + ((b - a) * i) / Math.max(1, n - 1);
      list.push({ m, s, chapter: k, gate: false });
    });
  });
  list.sort((a, b) => a.m.t - b.m.t);

  const color = (k) => hex(ARENAS[k]?.color ?? '#29b6f6');
  const tierOf = (m) => {
    const r = m.reward ?? {};
    if (m.arena || ['mega', 'labSkin', 'banner', 'cmdSkin', 'skin', 'commander', 'entrance'].includes(r.type)) return 'gold';
    if (r.type === 'vial' && ['megaLab', 'cashCase', 'hyperchrome'].includes(r.id)) return 'gold';
    if (r.type === 'card' || r.type === 'vial') return 'blue';
    return 'wood';
  };
  const chestGeos = {};
  const chestGeo = (tier, look, part) => {
    const key = tier + look + part;
    if (chestGeos[key]) return chestGeos[key];
    const fn = part === 'b' ? () => chestBodyGrid(tier, look === 'glow') : () => chestLidGrid(tier, look === 'glow');
    const grid = look === 'grey' ? () => P.greyGrid(fn()) : fn;
    return (chestGeos[key] = P.geo(`trChest_${key}`, grid, PV, [0, 0, 0]));
  };
  const flagGeo = P.geo('trFlag', flagGrid, PV, 'bottom');
  const skyTileGeo = P.geo('trSkyTile', skyTileGrid, PV, 'bottom');
  const padGeo = P.geo('trOrbitPad', orbitPadGrid, PV, 'bottom');

  const ms = [];
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  let side = 1;
  for (const L of list) {
    const k = L.chapter;
    const sky = idxAt(L.s) >= skyStart;
    // pick a side + a dry, level-ish spot (nudge along the road if the bank is wet or steep)
    let spot = null;
    for (const ds of [0, 0.8, -0.8, 1.6, -1.6, 2.4]) {
      for (const sd of L.gate ? [side, -side] : [side, -side]) {
        const s = L.s + ds;
        posAt(s, tmp);
        tangentAt(s, tan);
        let dir = sd;
        if (sky) dir = Math.hypot(tmp.x - tan.z - last.x, tmp.z + tan.x - last.z) > Math.hypot(tmp.x + tan.z - last.x, tmp.z - tan.x - last.z) ? 1 : -1;
        const off = sky ? 2.4 : SIDE;
        const x = tmp.x - tan.z * off * dir, z = tmp.z + tan.x * off * dir;
        if (!sky) {
          const id = T.colAt(x, z);
          if (id < 0 || T.riverD[id] < T.riverW[id] + 1.4) continue;
          if (T.roadD[id] < T.RW + 0.6) continue;
          const lo = T.minHeight(x, z, 0.75), hi = T.maxHeight(x, z, 0.75);
          if (hi - lo > 1.6 || Math.abs(hi - tmp.y) > 2.2) continue;
          if (zones.some((Z) => Math.hypot(x - Z.x, z - Z.z) < plinthR + 1.2)) continue;
          spot = { s, sd, x, z, y: hi };
        } else spot = { s, sd, x, z, y: tmp.y };
        break;
      }
      if (spot) break;
    }
    if (!spot) {
      posAt(L.s, tmp);
      tangentAt(L.s, tan);
      spot = { s: L.s, sd: side, x: tmp.x - tan.z * SIDE * side, z: tmp.z + tan.x * SIDE * side, y: T.heightAt(tmp.x - tan.z * SIDE * side, tmp.z + tan.x * SIDE * side) };
    }
    if (!L.gate) side = -spot.sd;
    const g = new THREE.Group();
    g.name = 'milestone:' + L.m.key;
    g.position.set(spot.x, spot.y + PH, spot.z);
    g.rotation.y = FACE_Y;
    group.add(g);
    const ped = P.mesh(P.geo(`trPed_${L.m.t}_${k}${sky ? 't' : ''}`, () => pedestalGrid(L.m.t, color(k), sky), PV, [0, 0, 0]), { receive: true });
    g.add(ped);
    if (sky) {
      const pad = P.mesh(padGeo, { receive: true });
      pad.position.y = -PH - 0.6;
      g.add(pad);
    }
    const tier = sky && tierOf(L.m) === 'wood' ? 'tech' : tierOf(L.m);
    const chest = new THREE.Group();
    chest.name = 'chest';
    chest.position.y = 0;
    g.add(chest);
    const body = P.mesh(chestGeo(tier, 'norm', 'b'), {});
    const lid = P.mesh(chestGeo(tier, 'norm', 'l'), {});
    lid.position.set(0, CH * PV, -CD * PV);
    chest.add(body, lid);
    const flag = P.mesh(flagGeo, {});
    flag.position.set(-0.55, 0, -0.25);
    flag.visible = false;
    g.add(flag);
    if (!sky) exclude.push([spot.x, spot.z, 2.4]);
    const anchor = V(spot.x, spot.y + PH, spot.z);
    ms.push({
      m: L.m, key: L.m.key, t: L.m.t, s: spot.s, chapter: k, gate: L.gate, color: color(k), tier, sky,
      anchor, rewardPos: anchor.clone().add(V(0, 1.75, 0)), group: g, chest, body, lid, flag,
      state: 'norm', lidA: 0, lidT: -1, phase: list.indexOf(L) * 1.7,
    });
  }

  // ------------------------------------------------ claimable chests: one instanced draw per chest tier
  // (they hop all the time; as separate meshes each would cost its own draw + shadow draw)
  const hops = {};
  for (const M of ms) {
    let H = hops[M.tier];
    if (!H) {
      const n = ms.filter((q) => q.tier === M.tier).length;
      const im = new THREE.InstancedMesh(P.geo(`trChestC_${M.tier}`, () => chestClosedGrid(M.tier, true), PV, [0, 0, 0]), Mats.pair, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      im.name = 'trophyChestsReady';
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
      group.add(im);
      H = hops[M.tier] = { im, n: 0 };
    }
    M.slot = H.n++;
    M.hop = H;
  }

  // ------------------------------------------------ arena gates (arches + portcullis)
  const gateObjs = {};
  zones.forEach((Z, k) => {
    if (k === 0) return;
    const A = ARENAS[k];
    if (!A) return;
    const s = gateS[k] + 0.6;
    posAt(s, tmp);
    tangentAt(s, tan);
    const ry = Math.atan2(tan.x, tan.z);
    const y = Math.min(T.minHeight(tmp.x, tmp.z, 2.6), tmp.y);
    const arch = P.mesh(P.geo(`trGate_${A.id}_${A.trophies}`, () => gateGrid(A.trophies, A.color), GV, [0, 0, 0]), { receive: true });
    arch.position.set(tmp.x, y, tmp.z);
    arch.rotation.y = ry;
    arch.name = 'gate:' + A.id;
    group.add(arch);
    const bars = P.mesh(P.geo('trPortcullis', portcullisGrid, GV, [0, 0, 0]), {});
    bars.position.set(tmp.x, Math.max(y, tmp.y - 0.05), tmp.z);
    bars.rotation.y = ry;
    bars.visible = false;
    group.add(bars);
    exclude.push([tmp.x, tmp.z, 3.4]);
    gateObjs[A.id] = { arch, bars, s, y0: bars.position.y, lift: null };
  });

  // ------------------------------------------------ orbit road tiles
  if (beyond.length) {
    const tiles = [];
    const mPos = ms.filter((M) => M.sky).map((M) => M.anchor);
    for (let s = arc[skyStart + 9] ?? length; s < length; s += 1.25) {
      posAt(s, tmp);
      tangentAt(s, tan);
      tiles.push([tmp.x, tmp.y - 0.05, tmp.z, Math.atan2(tan.x, tan.z), 1]);
    }
    const im = new THREE.InstancedMesh(skyTileGeo, Mats.pair, tiles.length);
    const o = new THREE.Object3D();
    tiles.forEach(([x, y, z, r], i) => { o.position.set(x, y, z); o.rotation.set(0, r, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = true;
    im.computeBoundingSphere();
    im.name = 'orbitRoad';
    group.add(im);
  }

  // ------------------------------------------------ billboards (reward art, rays, focus arrow)
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  const N = ms.length;
  PER_ROW = Math.max(10, Math.ceil(Math.sqrt(N + 14)));
  CELL = Math.floor(ATLAS / PER_ROW);
  const RAYS = N, ARROW = N * 2;
  const bb = makeBillboards(N * 2 + 1, tex);
  group.add(bb.mesh);
  const rect = (i) => {
    const cx = (i % PER_ROW) * CELL, cy = Math.floor(i / PER_ROW) * CELL;
    return [cx / ATLAS, 1 - (cy + CELL) / ATLAS, CELL / ATLAS, CELL / ATLAS];
  };
  // fixed cells after the reward cells: rays (2 frames side by side) and the arrow
  const raysCell = Math.ceil((N + 0.5) / PER_ROW) * PER_ROW; // start of a fresh row
  const arrowCell = raysCell + 2;
  paintRays(ctx, raysCell, 0), paintRays(ctx, raysCell + 1, 1), paintArrow(ctx, arrowCell);
  const painted = new Array(N).fill(false);
  const hide = new THREE.Vector3(0, -999, 0);
  ms.forEach((M, i) => {
    bb.frame(i, rect(i));
    bb.par(i, M.phase, 0.12, 0, 0);
    bb.set(i, hide, 0);
    bb.frame(RAYS + i, rect(raysCell));
    bb.par(RAYS + i, M.phase, 0, 1, -0.9);
    bb.set(RAYS + i, hide, 0);
  });
  bb.frame(ARROW, rect(arrowCell));
  bb.par(ARROW, 0, 0.18, 0, 0.2);
  bb.set(ARROW, hide, 0);
  let focus = -1;
  const place = (i) => {
    const M = ms[i];
    const big = M.gate || M.tier === 'gold';
    const sz = (painted[i] ? 1.55 : 0) * (big ? 1.18 : 1);
    bb.set(i, M.rewardPos, sz);
    bb.tint(i, M.state === 'grey' ? 0.42 : M.state === 'open' ? 0.0 : 1);
    if (M.state === 'open') bb.set(i, hide, 0);
    const rays = M.state === 'glow';
    bb.set(RAYS + i, rays ? tmp.copy(M.anchor).add(V(0, 1.15, 0)) : hide, rays ? 3.1 : 0);
  };

  // ------------------------------------------------ state + animation
  function setState(i, st) {
    const M = ms[i];
    const look = st === 'locked' ? 'grey' : st === 'ready' ? 'glow' : 'open';
    if (M.state === look) return;
    M.state = look;
    const geoLook = look === 'open' ? 'norm' : look;
    M.body.geometry = chestGeo(M.tier, geoLook, 'b');
    M.lid.geometry = chestGeo(M.tier, geoLook, 'l');
    M.flag.visible = look === 'open';
    if (look === 'open') { if (M.lidT < 0) { M.lidA = 1.95; M.lid.rotation.x = -M.lidA; } }
    else { M.lidA = 0; M.lidT = -1; M.lid.rotation.x = 0; }
    M.chest.position.y = 0;
    M.chest.scale.setScalar(1);
    // a claimable chest hops in the instanced set; the still one hides meanwhile
    M.chest.visible = look !== 'glow';
    if (look !== 'glow') { M.hop.im.setMatrixAt(M.slot, ZERO); M.hop.im.instanceMatrix.needsUpdate = true; }
    place(i);
  }
  function open(i) {
    const M = ms[i];
    M.lidT = 0;
    M.state = 'opening';
    M.body.geometry = chestGeo(M.tier, 'glow', 'b');
    M.lid.geometry = chestGeo(M.tier, 'glow', 'l');
    M.lid.rotation.x = 0;
    M.flag.visible = false;
    M.chest.visible = true;
    M.hop.im.setMatrixAt(M.slot, ZERO);
    M.hop.im.instanceMatrix.needsUpdate = true;
    bb.tint(i, 1);
    bb.set(RAYS + i, hide, 0);
  }
  function setFocus(i) {
    focus = i;
    if (i < 0) bb.set(ARROW, hide, 0);
  }
  const _a = new THREE.Vector3(), _o = new THREE.Object3D();
  updaters.push((dt, t) => {
    bb.uTime.value = t % 1000;
    for (let i = 0; i < N; i++) {
      const M = ms[i];
      if (M.state === 'glow') {
        // hop + squash, a beat apart from the neighbours
        const k = (t * 1.6 + M.phase) % 2;
        const hop = k < 0.5 ? Math.sin((k / 0.5) * Math.PI) : 0;
        M.chest.position.y = hop * 0.28;
        const sq = k < 0.5 ? 1 + Math.sin((k / 0.5) * Math.PI * 2) * 0.06 : 1 - Math.max(0, Math.sin(((k - 0.5) / 0.25) * Math.PI)) * 0.08 * (k < 0.75 ? 1 : 0);
        _o.position.copy(M.anchor);
        _o.position.y += hop * 0.28;
        _o.rotation.set(0, FACE_Y, 0);
        _o.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        _o.updateMatrix();
        M.hop.im.setMatrixAt(M.slot, _o.matrix);
        M.hop.im.instanceMatrix.needsUpdate = true;
      } else if (M.state === 'opening') {
        M.lidT += dt;
        const u = Math.min(1, M.lidT / 0.45);
        const e = 1 - Math.pow(1 - u, 3);
        M.lidA = 2.15 * e - Math.sin(u * Math.PI) * 0.1;
        M.lid.rotation.x = -M.lidA;
        const s = 1 + Math.sin(Math.min(1, M.lidT / 0.3) * Math.PI) * 0.18;
        M.chest.scale.set(s, 2 - s, s);
        M.chest.position.y = Math.sin(Math.min(1, M.lidT / 0.3) * Math.PI) * 0.15;
        // the reward pops up and out
        const ru = Math.min(1, M.lidT / 0.55);
        bb.set(i, _a.copy(M.rewardPos).add(V(0, ru * 1.4, 0)), (1.55 + Math.sin(ru * Math.PI) * 0.8) * (1 - ru * ru));
        if (M.lidT > 0.6) { M.state = 'norm'; M.lidT = -1; setState(i, 'claimed'); M.lidA = 1.95; M.lid.rotation.x = -1.95; }
      }
    }
    for (const id in gateObjs) {
      const G = gateObjs[id];
      if (!G.lift) continue;
      G.lift.t += dt;
      const u = G.lift.t;
      G.bars.position.y = G.y0 + (u < 0.5 ? Math.sin(u * 50) * 0.04 : Math.pow(Math.min(1, (u - 0.5) / 1.1), 2) * 3.6);
      if (u > 1.6) { G.bars.visible = false; G.bars.position.y = G.y0; G.lift = null; }
    }
    if (focus >= 0) {
      const M = ms[focus];
      bb.set(ARROW, _a.copy(M.rewardPos).add(V(0, M.state === 'open' ? 0.2 : 1.55, 0)), 0.9);
    }
  });

  return {
    group, milestones: ms, length, posAt, tangentAt, camDir: CAM_DIR.clone(),
    zoneS: zS, gateS, exitS,
    sOfTrophies(t) {
      // keypoints: each arena's threshold sits just past its plinth, each milestone at its pedestal
      const keys = [];
      ARENAS.forEach((A, k) => { if (k < zones.length) keys.push([A.trophies, exitS[k] - 1.3]); });
      for (const M of ms) if (!M.gate) keys.push([M.t, M.s]);
      keys.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (t <= keys[0][0]) return keys[0][1];
      for (let i = 0; i < keys.length - 1; i++) {
        const [t0, s0] = keys[i], [t1, s1] = keys[i + 1];
        if (t >= t0 && t < t1) return s0 + (s1 - s0) * ((t - t0) / (t1 - t0));
      }
      return Math.min(length - 1, keys[keys.length - 1][1] + 1.5);
    },
    setState(i, st) { setState(i, st); },
    /** Portcullis down (locked) or up; animate: it rattles and slides up out of sight. */
    setGateLocked(id, locked, o = {}) {
      const G = gateObjs[id];
      if (!G || G.lift) return;
      if (!locked && o.animate && G.bars.visible) { G.lift = { t: 0 }; return; }
      G.bars.visible = locked;
    },
    open, setFocus,
    atlas: {
      canvas, ctx, cell: CELL,
      origin: (i) => [(i % PER_ROW) * CELL, Math.floor(i / PER_ROW) * CELL],
      painted(i) { painted[i] = true; place(i); },
      commit() { tex.needsUpdate = true; },
    },
    dispose() { bb.dispose(); tex.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// fixed atlas art

function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
/** Pixel twinkle glow behind claimable chests: an 8-point star with a dithered halo (two frames, alternating long points). */
function paintRays(ctx, cell, f) {
  const x0 = (cell % PER_ROW) * CELL, y0 = Math.floor(cell / PER_ROW) * CELL;
  const S = 41, c = (S - 1) / 2;
  const img = ctx.createImageData(S, S);
  const put = (x, y, col) => { const o = (y * S + x) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = Math.abs(x - c), dy = Math.abs(y - c);
    const r = Math.hypot(dx, dy);
    // long points on the axes (frame 0) or the diagonals (frame 1), short ones on the other set
    const ax = Math.min(dx, dy), dg = Math.abs(dx - dy) / Math.SQRT2;
    const along = f ? dg : ax, other = f ? ax : dg;
    const longP = along <= Math.max(0.5, 2.6 - r * 0.13) && r <= c;
    const shortP = other <= Math.max(0.5, 1.8 - r * 0.16) && r <= c * 0.55;
    const core = r <= 5.5;
    const halo = r <= 11 && ((x + y) & 1) === 0;
    if (core) put(x, y, r < 3 ? [255, 255, 236] : [255, 240, 150]);
    else if (longP || shortP) put(x, y, r < c * 0.45 ? [255, 228, 110] : [255, 200, 50]);
    else if (halo) put(x, y, [255, 214, 80]);
  }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = S;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, x0, y0, CELL, CELL);
}
/** Bouncing gold pixel arrow pointing down at the focused reward. */
function paintArrow(ctx, cell) {
  const x0 = (cell % PER_ROW) * CELL, y0 = Math.floor(cell / PER_ROW) * CELL;
  const A = [
    '....#######....',
    '....#ooooo#....',
    '....#oyyyo#....',
    '....#oyyyo#....',
    '....#oyyyo#....',
    '#####oyyyo#####',
    '#ooooyyyyyoooo#',
    '.#oyyyyyyyyyo#.',
    '..#oyyyyyyyo#..',
    '...#oyyyyyo#...',
    '....#oyyyo#....',
    '.....#oyo#.....',
    '......#o#......',
    '.......#.......',
  ];
  const s = Math.floor(CELL / 16), ox = x0 + Math.round((CELL - 15 * s) / 2), oy = y0 + Math.round((CELL - 14 * s) / 2);
  A.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    px(ctx, ox + c * s, oy + r * s, s, s, ch === '#' ? '#120c24' : ch === 'o' ? '#ffe680' : '#ffc21a');
  }));
}
