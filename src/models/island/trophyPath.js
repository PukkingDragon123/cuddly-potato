// TROPHY ROAD, built into Beast Island: every milestone of TROPHY_ROAD stands
// beside the island's paved road as a brick pedestal (trophy count on its
// front plate) with a voxel treasure chest on top and the actual reward
// floating above it. Arena thresholds get a stone arch over the road
// (portcullis down while the arena is locked, the trophy count on a sign that
// faces the road camera). Past the last arena the road keeps going: floating
// tech tiles spiral up around the space elevator to orbit pads.
//
// FORKS (data/roadForks.js): between two arenas the road splits. The main road
// is the COIN TRAIL (gold pavers), a side road the VIAL TRAIL (blue pavers);
// both rejoin before the next gate. A signpost stands at the split, each trail
// holds two bonus chests, and the trail you did not pick is barred with a
// barricade until it opens. The camera follows a route through the trails you
// picked (setChoices).
//
//   const TP = addTrophyPath({ T, root, roadPoints, roadIdx, zones, plinthR, exclude, updaters, forks });
//   TP.milestones[i]  { m, key, t, s, chapter, gate, fork, side, tier, anchor, rewardPos, roadPos, group }
//   TP.forks[j]       { F (data), id, chapter, s0, s1, sSign, signPos, signs { a, b: { mesh, pos } }, bars, bpts, mid }
//   TP.posAt(s, out) / TP.tangentAt(s, out)   along the current route (arc length s, 0..TP.length)
//   TP.setChoices({ forkId: 'a' | 'b' })   reroute through the picked trails (milestone s values update)
//   TP.setBarrier(forkId, side | null)   barricade across that trail's entrance
//   TP.sOfTrophies(t, choices)  where a player with t trophies stands
//   TP.setState(i, 'locked' | 'ready' | 'claimed')   chest look (grey / glowing + hopping / open + flag)
//   TP.setGateLocked(arenaId, locked)   portcullis
//   TP.open(i)  plays the lid-pop + coin spill (then the chest stays open)
//   TP.setFocus(i | -1)  pixel arrow over a milestone's reward
//   TP.atlas { canvas, ctx, cell, rect(i), commit() }  the reward art atlas (painted by the home scene)
//   TP.camDir  horizontal unit vector (x, z) from a road point toward the road camera
//
// Everything still is plain voxel meshes in the island root (static-batched by the home scene);
// the rewards, rays and focus arrow are one instanced pixel-billboard draw, the spilled coins one
// instanced draw.
import * as THREE from 'three';
import { VoxGrid, Mats } from '../../core/voxel.js';
import { text, textW } from '../props/common.js';
import { shade, clamp } from '../../core/util.js';
import { TROPHY_ROAD, ARENAS } from '../../data/arenas.js';
import { TRAILS } from '../../data/roadForks.js';
import * as P from './props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// the road camera looks from the south (a touch east), so every plate faces that way
const CAM_DIR = new THREE.Vector2(0.14, 1).normalize();
const FACE_Y = Math.atan2(CAM_DIR.x, CAM_DIR.y);
const PV = 0.1; // pedestal / chest voxel
const GV = 0.125; // gate voxel
const SIDE = 1.5 + 1.45; // pedestal centre offset from the road centre line
const ATLAS = 1024;
let CELL = 102, PER_ROW = 10;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const hex = (c) => (typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c);

// ---------------------------------------------------------------------------
// Voxel grids

const TROPHY = ['#####', '#####', '.###.', '..#..', '.###.'];
/** Brick pedestal with a cream number plate on its +z face (tall digits: they stay legible from above). Top at y = 0 (local), PH tall, a deep skirt below. */
const PH = 1.3;
function pedestalGrid(num, color, tech = false) {
  const g = new VoxGrid();
  const label = String(num);
  const tw = textW(label) + 7;
  const W = (Math.max(tw + 5, 17)) | 1;
  const hw = (W - 1) / 2;
  const D = 6; // half depth
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

// Treasure chests: wood (planks + iron), iron (riveted steel), gold (gold + crimson straps + gems),
// legendary (violet crystal with gold trim and glowing runes).
export const CHEST = {
  wood: { body: [0xa8703c, 0x96602f, 0xb87d46], seam: 0x6e4224, metal: 0x5a6070, metalL: 0x9aa2b4, lock: 0xffc21a, key: 0x1a1020, feet: 0x4a3018, inside: 0x2a1a10 },
  iron: { body: [0x8a94a8, 0x7a8498, 0x9aa4b8], seam: 0x5a6478, metal: 0x3d4352, metalL: 0x6b7386, lock: 0x29b6f6, key: 0x0a1a2a, feet: 0x2e3440, inside: 0x1a1e28, rivet: 0xd7dde6 },
  gold: { body: [0xffc21a, 0xf0b010, 0xffd84a], seam: 0xc8901a, metal: 0xc0303e, metalL: 0xff5a6a, lock: 0xffffff, key: 0x6a1020, feet: 0x8a5a10, inside: 0x3a1a10, gem: 0x29e0ff },
  legendary: { body: [0x3a2a6a, 0x2e2058, 0x4a3a80], seam: 0x22183e, metal: 0xffc21a, metalL: 0xffe680, lock: 0xff4fa3, key: 0x2a0a1a, feet: 0x1a1030, inside: 0x0e0a1e, rune: 0x3ff2c8, gem: 0xff4fa3 },
  tech: { body: [0xd8dce8, 0xc8ccd8, 0xeef0f8], seam: 0x8f98aa, metal: 0x29e0ff, metalL: 0x9ff4ff, lock: 0x8f9bff, key: 0x1a1e3a, feet: 0x6b7386, inside: 0x1a1e28 },
};
const CW = 7, CD = 5, CH = 6; // half width, half depth, body height (voxels)
/** Chest body, top open (a heap of coins inside). Bottom at y = 0. */
function chestBodyGrid(tier, glow) {
  const C = CHEST[tier], g = new VoxGrid();
  const bx = CW - 3; // strap columns
  for (let x = -CW; x <= CW - 1; x++) for (let z = -CD; z <= CD - 1; z++) for (let y = 0; y < CH; y++) {
    const ex = x === -CW || x === CW - 1, ez = z === -CD || z === CD - 1;
    const inside = !ex && !ez;
    if (y === 0) { // feet at the corners only
      if ((x <= -CW + 1 || x >= CW - 2) && (z <= -CD + 1 || z >= CD - 2)) g.set(x, 0, z, C.feet);
      continue;
    }
    if (inside) {
      if (y === CH - 2) g.set(x, y, z, ((x * 3 + z * 5) & 3) === 0 ? 0xffe680 : ((x + z) & 1) ? 0xffc21a : 0xe0a010); // treasure
      else if (y === 1) g.set(x, y, z, C.inside);
      continue;
    }
    const strap = x === -bx || x === bx - 1;
    const corner = (ex && ez) || ((ex || ez) && (y <= 2 || y >= CH - 2) && (ex ? Math.abs(z + 0.5) >= CD - 2.5 : Math.abs(x + 0.5) >= CW - 2.5));
    const rim = y === CH - 1 || y === 1;
    let c = C.body[(y >> 1) % 3];
    if (tier === 'wood' && (y & 1) === 0) c = C.seam; // plank seams
    if (tier === 'iron' && (x === 0 || z === 0)) c = C.seam; // plate seams
    if (rim) c = C.seam;
    let gl = false;
    if (strap || corner) { c = (y === CH - 1 || y === 1) ? C.metalL : C.metal; gl = glow && strap; }
    if (C.rivet && corner && ((x + y + z) & 1) === 0) c = C.rivet;
    if (tier === 'legendary' && !strap && !corner && !rim && ez && ((x * 7 + y * 3) % 5 === 0)) { c = C.rune; gl = true; }
    g.set(x, y, z, c, gl);
  }
  // lock plate + keyhole on the front
  g.box(-2, CH - 4, CD, 1, CH - 1, CD, C.lock, glow);
  g.set(0, CH - 3, CD, C.key).set(-1, CH - 3, CD, C.key).set(0, CH - 4, CD, C.key);
  if (C.gem) for (const x of [-CW + 1, CW - 2]) g.set(x, CH - 3, CD, C.gem, true);
  return g;
}
/** Barrel-top chest lid; hinge on its back-bottom edge at local (0, 0, 0), extending toward +z. */
function chestLidGrid(tier, glow) {
  const C = CHEST[tier], g = new VoxGrid();
  const bx = CW - 3, D2 = CD * 2;
  const inset = [0, 0, 0, 1, 2];
  for (let y = 0; y < 5; y++) for (let x = -CW; x <= CW - 1; x++) for (let z = inset[y]; z < D2 - inset[y]; z++) {
    const shell = y === 4 || z === inset[y] || z === D2 - 1 - inset[y] || x === -CW || x === CW - 1 || y === 0;
    if (!shell) continue;
    const strap = x === -bx || x === bx - 1;
    const edge = x === -CW || x === CW - 1;
    let c = y === 0 ? C.seam : C.body[(z >> 1) % 3];
    if (tier === 'wood' && (z & 1) === 0 && y > 0) c = C.seam;
    let gl = false;
    if (strap || (edge && y > 0)) { c = y === 4 ? C.metalL : C.metal; gl = glow && strap; }
    if (C.rivet && edge && ((y + z) & 1) === 0) c = C.rivet;
    if (tier === 'legendary' && y === 4 && !strap && ((x + z) % 4 === 0)) { c = C.rune; gl = true; }
    g.set(x, y, z, c, gl);
  }
  // hasp over the lock + a gem on the lid for the fancy tiers
  g.box(-2, 0, D2, 1, 2, D2, C.lock, glow);
  g.set(0, 1, D2, C.key).set(-1, 1, D2, C.key);
  if (C.gem) g.box(-1, 4, CD - 1, 0, 5, CD, C.gem, true);
  return g;
}
/** Closed chest in one grid (body + lid), for the instanced hopping chests. */
function chestClosedGrid(tier, glow) {
  const g = chestBodyGrid(tier, glow);
  chestLidGrid(tier, glow).forEach((x, y, z, c, gl) => g.set(x, y + CH, z - CD, c, gl));
  return g;
}
/** Pixel coin for the spill: an octagon-ish disc with a rim and a stamped B. */
function coinGrid() {
  const g = new VoxGrid();
  const M = ['.####.', '#oooo#', '#oBBo#', '#oBBo#', '#oooo#', '.####.'];
  M.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    g.set(c, 5 - r, 0, ch === '#' ? 0xc8901a : ch === 'B' ? 0xffe680 : 0xffc21a);
  }));
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

/** Arena gate: two brick pillars + a beam (no text: the trophy count rides on a sign that faces the camera). Road runs along local z. */
function gateGrid(color) {
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
  // beam with a stud row
  const by0 = top - 6, by1 = top - 1;
  g.box(-half - PW, by0, -2, half + PW, by1, 2, (x, y) => (y === by0 ? colD : y === by1 ? colL : col));
  g.box(-half - PW, by1 + 1, -2, half + PW, by1 + 1, 2, 0xffc21a);
  for (let x = -half; x <= half; x += 4) for (const z of [-3, 3]) g.set(x, by0 + 2, z, 0xffe680);
  // hanging pennants under the beam
  for (const px of [-half + 2, half - 4]) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 3; x++) {
      if (y === 6 && x === 1) continue; // V-cut tail
      g.set(px + x, by0 - 1 - y, 0, y === 1 || y === 4 ? colL : col);
    }
  }
  return g;
}
/** The gate's trophy sign: a framed board with a trophy + the count, on two posts (faces +z). */
function gateSignGrid(num, color) {
  const g = new VoxGrid();
  const col = hex(color), colD = shade(col, -0.35);
  const label = String(num);
  const tw = textW(label, 1) + 8;
  const hw = Math.ceil(tw / 2) + 2;
  // posts
  for (const x of [-hw + 3, hw - 3]) g.box(x, 0, 0, x, 4, 0, 0x3d4352);
  // board: dark frame, arena-colour border, cream face
  g.box(-hw, 5, -1, hw, 19, 0, colD);
  g.box(-hw + 1, 6, 1, hw - 1, 18, 1, col);
  g.box(-hw + 2, 7, 1, hw - 2, 17, 1, 0xfff6dc);
  const tx = -Math.floor(tw / 2);
  TROPHY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(tx + c, 15 - r, 2, r < 2 ? 0xffd23f : 0xe0a010); }));
  text(g, label, tx + 7, 8, 2, '+z', 0x6a3a10, { sy: 2 });
  // little crown of studs on top
  for (let x = -hw + 2; x <= hw - 2; x += 3) g.set(x, 20, -1, 0xffc21a);
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
/** Trail sign at the start of one trail of a fork: a post with a board (the trail's name over an up arrow). Faces +z. */
function trailSignGrid(tr) {
  const g = new VoxGrid();
  const c = hex(tr.color), d = hex(tr.dark), l = shade(c, 0.35);
  const w = textW(tr.name) + 6;
  const hw = Math.ceil(w / 2);
  g.box(-1, 0, -1, 0, 26, 0, (x, y) => ((y & 3) === 0 ? 0x6e4224 : 0x8a5a30));
  // board: dark frame, trail colour face with a light top edge
  g.box(-hw, 15, -1, hw, 27, 0, d);
  g.box(-hw + 1, 16, 1, hw - 1, 26, 1, c);
  g.box(-hw + 1, 26, 1, hw - 1, 26, 1, l);
  text(g, tr.name, -hw + 4, 18, 2, '+z', d);
  text(g, tr.name, -hw + 3, 19, 2, '+z', 0xffffff);
  // arrow on top pointing up the trail
  for (let k = 0; k < 5; k++) g.box(-4 + k, 28 + k, 0, 3 - k, 28 + k, 0, k === 4 ? l : c);
  g.box(-1, 28, 0, 0, 28, 0, d);
  return g;
}
/** Wooden barricade with hazard stripes + a padlock (blocks a trail that is not open yet). Faces +z, spans x. */
function barricadeGrid() {
  const g = new VoxGrid();
  const W = 13;
  for (const x of [-W + 2, W - 2]) {
    g.box(x - 1, 0, -1, x, 9, 0, 0x6e4224);
    g.box(x - 3, 0, -2, x + 2, 0, 1, 0x4a3018);
  }
  for (const [y0, y1] of [[4, 5], [8, 9]]) g.box(-W, y0, 1, W, y1, 1, (x) => (((x + 40) >> 2) & 1 ? 0xffffff : 0xe8343c));
  // padlock in the middle
  g.box(-2, 5, 2, 1, 8, 2, 0xffc21a);
  g.box(-1, 9, 2, 0, 10, 2, 0x8f98aa);
  g.set(-1, 6, 3, 0x3a2a18);
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
// Polylines: arc length, position, tangent

function polyline(pts) {
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
  return { pts, arc, length, idxAt, posAt, tangentAt };
}

// ---------------------------------------------------------------------------

/**
 * zones: the island's zone specs ({ id, x, z, y, ground, color }) in arena order;
 * roadIdx[k]: index of zone k's centre in roadPoints; forks: data/roadForks.js FORKS;
 * T.branches: the side trails the terrain carved ({ chapter, k0, k1, side, pts }).
 */
export function addTrophyPath({ T, root, roadPoints, roadIdx, zones, plinthR, exclude, updaters, forks = [] }) {
  const group = new THREE.Group();
  group.name = 'trophyRoad';
  root.add(group);

  // ------------------------------------------------ the main road polyline (+ orbit extension)
  const main = roadPoints.map((p) => p.clone());
  const last = zones[zones.length - 1];
  const lastArena = ARENAS[ARENAS.length - 1];
  const beyond = TROPHY_ROAD.filter((m) => m.t > lastArena.trophies && !m.arena);
  const skyStart = main.length;
  if (beyond.length) {
    // out across the anchor plaza, then a rising half-turn in front of the elevator tether
    const cx = last.x, cz = last.z, gy = (last.ground ?? last.y);
    const R = 12, a0 = 0, turn = Math.PI * 1.05;
    const rise = Math.min(20, (last.y - gy) - 6);
    for (let r = 1; r <= R; r++) main.push(V(cx + r, gy + Math.max(0, r - 8) * 0.2, cz));
    const y0 = gy + 0.8;
    const len = R * turn;
    const n = Math.ceil(Math.hypot(len, rise));
    for (let i = 1; i <= n; i++) {
      const u = i / n, a = a0 + u * turn; // +a swings south (toward the camera) first
      main.push(V(cx + Math.cos(a) * R, y0 + rise * (u * 0.85 + u * u * 0.15), cz + Math.sin(a) * R));
    }
  }
  main.forEach((p, i) => { p.mi = i; });
  const M0 = polyline(main);

  // ------------------------------------------------ forks: the side trails as 1-unit polylines
  const nearestMain = (p, i0 = 0, i1 = main.length - 1) => {
    let bi = i0, bd = Infinity;
    for (let i = i0; i <= i1; i++) { const d = (main[i].x - p.x) ** 2 + (main[i].z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    return bi;
  };
  const fks = [];
  for (const F of forks) {
    const B = T.branches?.find((b) => b.chapter === F.chapter);
    if (!B) continue;
    const iF = nearestMain(T.road[B.k0]), iJ = nearestMain(T.road[B.k1]);
    if (iJ - iF < 8) continue;
    const bp = [];
    for (let k = 0; k < B.pts.length; k += 4) { const q = B.pts[k]; bp.push(V(q.x, T.heightAt(q.x, q.z), q.z)); }
    const qe = B.pts[B.pts.length - 1];
    bp.push(V(qe.x, T.heightAt(qe.x, qe.z), qe.z));
    // the trail's ends meet the main road: pin them to it
    bp[0].copy(main[iF]);
    bp[bp.length - 1].copy(main[iJ]);
    bp.forEach((p, i) => { p.mi = iF + ((iJ - iF) * i) / (bp.length - 1); });
    fks.push({ F, id: F.id, chapter: F.chapter, B, iF, iJ, bpts: bp, BL: polyline(bp), side: B.side });
  }
  const forkById = Object.fromEntries(fks.map((f) => [f.id, f]));

  // ------------------------------------------------ the route (main road with the picked trails swapped in)
  let route = M0;
  let choices = {};
  function buildRoute() {
    const out = [];
    for (let i = 0; i < main.length; i++) {
      const f = fks.find((q) => q.iF === i);
      if (f && choices[f.id] === 'b') { out.push(...f.bpts.slice(0, -1)); i = f.iJ - 1; continue; }
      out.push(main[i]);
    }
    route = polyline(out);
  }
  /** Arc length on the current route at main-road index mi (fractional). */
  const sOfMi = (mi) => {
    const pts = route.pts;
    let lo = 0, hi = pts.length - 1;
    if (mi <= pts[0].mi) return 0;
    if (mi >= pts[hi].mi) return route.length;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].mi <= mi) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const u = b.mi > a.mi ? (mi - a.mi) / (b.mi - a.mi) : 0;
    return route.arc[lo] + (route.arc[hi] - route.arc[lo]) * u;
  };
  const miOfS0 = (s) => { const i = M0.idxAt(s); const j = Math.min(main.length - 1, i + 1); const u = M0.arc[j] > M0.arc[i] ? (s - M0.arc[i]) / (M0.arc[j] - M0.arc[i]) : 0; return i + u; };

  // ------------------------------------------------ zone gates + chapter ranges (main-road indices)
  const near = (p, Z, r) => Math.hypot(p.x - Z.x, p.z - Z.z) < r;
  const zoneMi = zones.map((Z, k) => roadIdx[k]);
  const exitMi = zones.map((Z, k) => {
    let i = roadIdx[k];
    while (i < roadPoints.length - 1 && near(main[i], Z, plinthR + 2.4)) i++;
    return i;
  });
  const gateMi = zones.map((Z, k) => {
    if (k === 0) return 0;
    let i = roadIdx[k];
    while (i > 0 && near(main[i], Z, plinthR + 3.2)) i--;
    return i;
  });
  if (beyond.length) exitMi[zones.length - 1] = Math.min(main.length - 1, skyStart + 10);

  // ------------------------------------------------ milestones
  const arenaIdx = (t) => { let k = 0; for (let i = 0; i < ARENAS.length; i++) if (t >= ARENAS[i].trophies) k = i; return k; };
  const chapters = ARENAS.map(() => []);
  const gates = new Map();
  for (const m of TROPHY_ROAD) {
    const k = m.arena ? ARENAS.findIndex((a) => a.id === m.arena) : -1;
    if (k > 0) gates.set(k, m);
    else chapters[arenaIdx(m.t)].push(m);
  }
  // list entries: { m, s0 (arc on the main road), chapter, gate, fork, side, onBranch, bs (arc on the branch) }
  const list = [];
  const spread = (items, a, b, chapter) => {
    const n = items.length;
    items.forEach((m, i) => {
      const s0 = n === 1 ? (a + b) / 2 : a + ((b - a) * i) / Math.max(1, n - 1);
      list.push({ m, s0, chapter, gate: false });
    });
  };
  ARENAS.forEach((A, k) => {
    if (k >= zones.length) return;
    const g = gates.get(k);
    if (g) list.push({ m: g, s0: M0.arc[gateMi[k]] - 2.6, chapter: k, gate: true });
    const items = chapters[k].sort((x, y) => x.t - y.t);
    const a = M0.arc[exitMi[k]] + 2.2;
    const b = k + 1 < zones.length ? M0.arc[gateMi[k + 1]] - (gates.get(k + 1) ? 6.4 : 3.6) : M0.length - 2;
    const f = fks.find((q) => q.chapter === k);
    if (!f) { spread(items, a, b, k); return; }
    // trunk milestones before + after the fork, two bonus chests on each trail inside it
    const sF = M0.arc[f.iF], sJ = M0.arc[f.iJ];
    const nb = Math.min(items.length, f.F.nBefore);
    const before = items.slice(0, nb), after = items.slice(nb);
    // before: from the arena exit to just short of the fork sign; after: from the rejoin to the gate
    if (before.length) spread(before, a, Math.max(a, sF - 4.5), k);
    if (after.length) spread(after, Math.min(b, sJ + 3.5), b, k);
    for (const side of ['a', 'b']) {
      const tr = f.F[side];
      tr.items.forEach((m, j) => {
        const u = (j + 1) / (tr.items.length + 1);
        if (side === 'a') list.push({ m, s0: sF + (sJ - sF) * (0.12 + u * 0.76), chapter: k, gate: false, fork: f.id, side });
        else list.push({ m, s0: sF, bs: f.BL.length * (0.12 + u * 0.76), chapter: k, gate: false, fork: f.id, side, onBranch: true });
      });
    }
  });
  list.sort((x, y) => x.m.t - y.m.t || (x.side ?? '').localeCompare(y.side ?? ''));

  const color = (k) => hex(ARENAS[k]?.color ?? '#29b6f6');
  const tierOf = (m) => {
    const r = m.reward ?? {};
    if (['mega', 'commander', 'entrance', 'labSkin'].includes(r.type) || (r.type === 'vial' && r.id === 'cashCase')) return 'legendary';
    if (m.arena || ['banner', 'cmdSkin', 'skin'].includes(r.type)) return 'gold';
    if (r.type === 'vial' && ['megaLab', 'hyperchrome'].includes(r.id)) return 'gold';
    if (r.type === 'card' || r.type === 'vial' || r.type === 'bucks') return 'iron';
    return 'wood';
  };
  const chestGeos = {};
  const chestGeo = (tier, look, part) => {
    const key = tier + look + part;
    if (chestGeos[key]) return chestGeos[key];
    const fn = part === 'b' ? () => chestBodyGrid(tier, look === 'glow') : () => chestLidGrid(tier, look === 'glow');
    const grid = look === 'grey' ? () => P.greyGrid(fn()) : fn;
    return (chestGeos[key] = P.geo(`trChest2_${key}`, grid, PV, [0, 0, 0]));
  };
  const flagGeo = P.geo('trFlag', flagGrid, PV, 'bottom');
  const skyTileGeo = P.geo('trSkyTile', skyTileGrid, PV, 'bottom');
  const padGeo = P.geo('trOrbitPad', orbitPadGrid, PV, 'bottom');

  const ms = [];
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  let side = 1;
  for (const L of list) {
    const k = L.chapter;
    const f = L.fork ? forkById[L.fork] : null;
    const line = L.onBranch ? f.BL : M0;
    const s0 = L.onBranch ? L.bs : L.s0;
    const sky = !L.onBranch && M0.idxAt(s0) >= skyStart;
    // which side of the road: fork chests sit on the outside of their trail
    let sides = [side, -side];
    if (f) { const out = L.side === 'a' ? -f.side : f.side; sides = [out]; }
    // a dry, level-ish spot (nudged along the road if the bank is wet or steep)
    let spot = null;
    for (const ds of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) {
      for (const sd of sides) {
        const s = s0 + ds;
        line.posAt(s, tmp);
        line.tangentAt(s, tan);
        let dir = sd;
        if (sky) dir = Math.hypot(tmp.x - tan.z - last.x, tmp.z + tan.x - last.z) > Math.hypot(tmp.x + tan.z - last.x, tmp.z - tan.x - last.z) ? 1 : -1;
        const off = sky ? 2.4 : SIDE;
        const x = tmp.x - tan.z * off * dir, z = tmp.z + tan.x * off * dir;
        if (!sky) {
          const id = T.colAt(x, z);
          if (id < 0 || T.riverD[id] < T.riverW[id] + 1.4) continue;
          if (T.roadD[id] < T.RW + 0.6) continue;
          const lo = T.minHeight(x, z, 0.8), hi = T.maxHeight(x, z, 0.8);
          if (hi - lo > 1.6 || Math.abs(hi - tmp.y) > 2.2) continue;
          if (zones.some((Z) => Math.hypot(x - Z.x, z - Z.z) < plinthR + 1.2)) continue;
          spot = { s, sd, x, z, y: hi, rp: tmp.clone() };
        } else spot = { s, sd, x, z, y: tmp.y, rp: tmp.clone() };
        break;
      }
      if (spot) break;
    }
    if (!spot) {
      line.posAt(s0, tmp);
      line.tangentAt(s0, tan);
      const sd = sides[0];
      const x = tmp.x - tan.z * SIDE * sd, z = tmp.z + tan.x * SIDE * sd;
      spot = { s: s0, sd, x, z, y: T.heightAt(x, z), rp: tmp.clone() };
    }
    if (!L.gate && !f) side = -spot.sd;
    const g = new THREE.Group();
    g.name = 'milestone:' + L.m.key;
    g.position.set(spot.x, spot.y + PH, spot.z);
    g.rotation.y = FACE_Y;
    group.add(g);
    const trim = f ? hex(TRAILS[L.side].color) : color(k);
    const ped = P.mesh(P.geo(`trPed2_${L.m.t}_${trim.toString(16)}${sky ? 't' : ''}`, () => pedestalGrid(L.m.t, trim, sky), PV, [0, 0, 0]), { receive: true });
    g.add(ped);
    if (sky) {
      const pad = P.mesh(padGeo, { receive: true });
      pad.position.y = -PH - 0.6;
      g.add(pad);
    }
    const tier = sky && tierOf(L.m) === 'wood' ? 'tech' : tierOf(L.m);
    const chest = new THREE.Group();
    chest.name = 'chest';
    g.add(chest);
    const body = P.mesh(chestGeo(tier, 'norm', 'b'), {});
    const lid = P.mesh(chestGeo(tier, 'norm', 'l'), {});
    lid.position.set(0, CH * PV, -CD * PV);
    chest.add(body, lid);
    const flag = P.mesh(flagGeo, {});
    flag.position.set(-0.8, 0, -0.45);
    flag.visible = false;
    g.add(flag);
    if (!sky) exclude.push([spot.x, spot.z, 2.6]);
    const anchor = V(spot.x, spot.y + PH, spot.z);
    // main-road index this milestone belongs to (branch chests: their spot along the trail's span)
    const mi = L.onBranch ? f.iF + ((f.iJ - f.iF) * spot.s) / f.BL.length : miOfS0(spot.s);
    ms.push({
      m: L.m, key: L.m.key, t: L.m.t, s: 0, mi, chapter: k, gate: L.gate, fork: L.fork ?? null, side: L.side ?? null, onBranch: !!L.onBranch,
      color: trim, tier, sky, roadPos: spot.rp,
      anchor, rewardPos: anchor.clone().add(V(0, 1.9, 0)), group: g, chest, body, lid, flag,
      state: 'norm', lidA: 0, lidT: -1, phase: ms.length * 1.7,
    });
  }

  // ------------------------------------------------ claimable chests: one instanced draw per chest tier
  // (they hop all the time; as separate meshes each would cost its own draw + shadow draw)
  const hops = {};
  for (const M of ms) {
    let H = hops[M.tier];
    if (!H) {
      const n = ms.filter((q) => q.tier === M.tier).length;
      const im = new THREE.InstancedMesh(P.geo(`trChestC2_${M.tier}`, () => chestClosedGrid(M.tier, true), PV, [0, 0, 0]), Mats.pair, n);
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

  // ------------------------------------------------ arena gates (arches + portcullis + a camera-facing trophy sign)
  const gateObjs = {};
  zones.forEach((Z, k) => {
    if (k === 0) return;
    const A = ARENAS[k];
    if (!A) return;
    const s = M0.arc[gateMi[k]] + 0.6;
    M0.posAt(s, tmp);
    M0.tangentAt(s, tan);
    const ry = Math.atan2(tan.x, tan.z);
    const y = Math.min(T.minHeight(tmp.x, tmp.z, 2.6), tmp.y);
    const arch = P.mesh(P.geo(`trGate2_${A.id}`, () => gateGrid(A.color), GV, [0, 0, 0]), { receive: true });
    arch.position.set(tmp.x, y, tmp.z);
    arch.rotation.y = ry;
    arch.name = 'gate:' + A.id;
    group.add(arch);
    const sign = P.mesh(P.geo(`trGateSign_${A.id}_${A.trophies}`, () => gateSignGrid(A.trophies, A.color), GV, 'bottom'), {});
    sign.position.set(tmp.x, y + 35 * GV, tmp.z);
    sign.rotation.y = FACE_Y;
    sign.name = 'gateSign';
    group.add(sign);
    const bars = P.mesh(P.geo('trPortcullis', portcullisGrid, GV, [0, 0, 0]), {});
    bars.position.set(tmp.x, Math.max(y, tmp.y - 0.05), tmp.z);
    bars.rotation.y = ry;
    bars.visible = false;
    group.add(bars);
    exclude.push([tmp.x, tmp.z, 3.4]);
    gateObjs[A.id] = { arch, bars, y0: bars.position.y, lift: null };
  });

  // ------------------------------------------------ fork trail signs + barricades
  for (const f of fks) {
    f.signs = {};
    f.bars = {};
    for (const sd of ['a', 'b']) {
      // a sign on the outside of each trail, a few units after the split
      const pl = sd === 'a' ? M0 : f.BL;
      const out = sd === 'a' ? -f.side : f.side;
      const s1 = sd === 'a' ? M0.arc[f.iF] + 4.5 : 4.5;
      pl.posAt(s1, tmp);
      pl.tangentAt(s1, tan);
      let sx = 0, sz = 0;
      for (const off of [SIDE + 0.4, SIDE + 1.4, SIDE + 2.4]) {
        sx = tmp.x - tan.z * off * out; sz = tmp.z + tan.x * off * out;
        const id = T.colAt(sx, sz);
        if (id >= 0 && T.roadD[id] > T.RW + 0.5) break;
      }
      const sign = P.mesh(P.geo(`trTrailSign_${sd}`, () => trailSignGrid(TRAILS[sd]), 0.09, 'bottom'), {});
      const sy = T.heightAt(sx, sz);
      sign.position.set(sx, sy - 0.05, sz);
      sign.rotation.y = FACE_Y;
      sign.name = 'trailSign:' + f.id + sd;
      group.add(sign);
      exclude.push([sx, sz, 2.4]);
      f.signs[sd] = { mesh: sign, pos: V(sx, sy + 2, sz) };
      // the barricade across this trail's entrance (shown when the other trail was picked)
      const s2 = sd === 'a' ? M0.arc[f.iF] + 8.5 : 8.5;
      pl.posAt(s2, tmp);
      pl.tangentAt(s2, tan);
      const bar = P.mesh(P.geo('trBarricade', barricadeGrid, PV, 'bottom'), {});
      bar.position.set(tmp.x, T.heightAt(tmp.x, tmp.z), tmp.z);
      bar.rotation.y = Math.atan2(tan.x, tan.z);
      bar.visible = false;
      bar.name = 'barricade';
      group.add(bar);
      f.bars[sd] = bar;
    }
    // the fork's own spot (for the camera + taps): between the two signs
    f.signPos = f.signs.a.pos.clone().add(f.signs.b.pos).multiplyScalar(0.5);
    f.signGroup = f.signs.a.mesh;
    f.s0 = 0; f.s1 = 0;
    const mid = Math.round((f.iF + f.iJ) / 2);
    const bm = f.bpts[Math.round((f.bpts.length - 1) / 2)];
    f.mid = V((main[mid].x + bm.x) / 2, (main[mid].y + bm.y) / 2, (main[mid].z + bm.z) / 2);
  }

  // ------------------------------------------------ orbit road tiles
  if (beyond.length) {
    const tiles = [];
    for (let s = M0.arc[skyStart + 9] ?? M0.length; s < M0.length; s += 1.25) {
      M0.posAt(s, tmp);
      M0.tangentAt(s, tan);
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

  // ------------------------------------------------ coin spill (one instanced pool shared by every chest)
  const COINS = 40;
  const coinIM = new THREE.InstancedMesh(P.geo('trCoin', coinGrid, 0.055, 'center', 0), Mats.pair, COINS);
  coinIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coinIM.frustumCulled = false;
  coinIM.castShadow = false;
  coinIM.name = 'chestCoins';
  for (let i = 0; i < COINS; i++) coinIM.setMatrixAt(i, ZERO);
  group.add(coinIM);
  const coins = Array.from({ length: COINS }, () => ({ t: -1, p: new THREE.Vector3(), v: new THREE.Vector3(), floor: 0, spin: 0, ax: 0, life: 0 }));
  let coinHead = 0;
  function spill(M, n) {
    for (let k = 0; k < n; k++) {
      const c = coins[coinHead];
      coinHead = (coinHead + 1) % COINS;
      const a = Math.random() * Math.PI * 2, sp = 1.1 + Math.random() * 1.6;
      c.t = -k * 0.025; // a quick stream, not one blob
      c.p.copy(M.anchor).add(V((Math.random() - 0.5) * 0.5, 0.75, (Math.random() - 0.5) * 0.3));
      c.v.set(Math.cos(a) * sp, 3.6 + Math.random() * 2.4, Math.sin(a) * sp * 0.7 + 0.6);
      c.floor = M.anchor.y + 0.03;
      c.edge = M.anchor;
      c.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8);
      c.ax = Math.random() * 6.28;
      c.life = 1.6 + Math.random() * 0.6;
      c.bounced = 0;
    }
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
    const big = M.gate || M.tier === 'gold' || M.tier === 'legendary';
    const sz = (painted[i] ? 1.6 : 0) * (big ? 1.18 : 1);
    bb.set(i, M.rewardPos, sz);
    bb.tint(i, M.state === 'grey' ? 0.42 : M.state === 'open' ? 0.0 : 1);
    if (M.state === 'open') bb.set(i, hide, 0);
    const rays = M.state === 'glow';
    bb.set(RAYS + i, rays ? tmp.copy(M.anchor).add(V(0, 1.2, 0)) : hide, rays ? (M.tier === 'legendary' ? 3.8 : 3.2) : 0);
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
    M.spilled = false;
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
  const _a = new THREE.Vector3(), _o = new THREE.Object3D(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s1 = new THREE.Vector3(1, 1, 1), _m4 = new THREE.Matrix4();
  let coinsLive = false;
  updaters.push((dt, t) => {
    bb.uTime.value = t % 1000;
    for (let i = 0; i < N; i++) {
      const M = ms[i];
      if (M.state === 'glow') {
        // hop + squash, a beat apart from the neighbours
        const k = (t * 1.6 + M.phase) % 2;
        const hop = k < 0.5 ? Math.sin((k / 0.5) * Math.PI) : 0;
        const sq = k < 0.5 ? 1 + Math.sin((k / 0.5) * Math.PI * 2) * 0.06 : 1 - Math.max(0, Math.sin(((k - 0.5) / 0.25) * Math.PI)) * 0.08 * (k < 0.75 ? 1 : 0);
        _o.position.copy(M.anchor);
        _o.position.y += hop * 0.28;
        _o.rotation.set(0, FACE_Y, Math.sin(t * 9 + M.phase) * 0.04 * hop);
        _o.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        _o.updateMatrix();
        M.hop.im.setMatrixAt(M.slot, _o.matrix);
        M.hop.im.instanceMatrix.needsUpdate = true;
      } else if (M.state === 'opening') {
        M.lidT += dt;
        // a rattle, then the lid bursts open with an overshoot and the coins spill out
        const rattle = M.lidT < 0.22 ? Math.sin(M.lidT * 70) * 0.06 * (1 - M.lidT / 0.22) : 0;
        M.chest.rotation.z = rattle;
        const u = clamp((M.lidT - 0.18) / 0.4, 0, 1);
        const e = 1 - Math.pow(1 - u, 3);
        M.lidA = 2.2 * e - Math.sin(u * Math.PI) * 0.15;
        M.lid.rotation.x = -M.lidA;
        const k = clamp((M.lidT - 0.12) / 0.3, 0, 1);
        const sq = 1 + Math.sin(k * Math.PI) * 0.16;
        M.chest.scale.set(sq, 2 - sq, sq);
        M.chest.position.y = Math.sin(k * Math.PI) * 0.18;
        if (!M.spilled && M.lidT > 0.26) {
          M.spilled = true;
          const r = M.m.reward ?? {};
          spill(M, r.type === 'coins' ? 26 : M.tier === 'legendary' ? 22 : 12);
          coinsLive = true;
        }
        // the reward pops up and out
        const ru = clamp((M.lidT - 0.2) / 0.55, 0, 1);
        bb.set(i, _a.copy(M.rewardPos).add(V(0, ru * 1.4, 0)), (1.6 + Math.sin(ru * Math.PI) * 0.8) * (1 - ru * ru));
        if (M.lidT > 0.85) { M.state = 'norm'; M.lidT = -1; M.chest.rotation.z = 0; setState(i, 'claimed'); M.lidA = 1.95; M.lid.rotation.x = -1.95; }
      }
    }
    // spilled coins: ballistic arcs, one bounce on the pedestal (or the ground), then they shrink away
    if (coinsLive) {
      let any = false;
      for (let i = 0; i < COINS; i++) {
        const c = coins[i];
        if (c.t === -1) continue;
        c.t += dt;
        if (c.t < 0) { coinIM.setMatrixAt(i, ZERO); any = true; continue; }
        if (c.t > c.life) { c.t = -1; coinIM.setMatrixAt(i, ZERO); continue; }
        any = true;
        c.v.y -= 16 * dt;
        c.p.addScaledVector(c.v, dt);
        // off the pedestal top: fall on to the ground below it
        const onTop = Math.abs(c.p.x - c.edge.x) < 1.0 && Math.abs(c.p.z - c.edge.z) < 0.75;
        const floor = onTop ? c.floor : c.floor - PH + 0.02;
        if (c.p.y < floor) {
          c.p.y = floor;
          if (c.bounced < 2) { c.v.y = Math.abs(c.v.y) * 0.38; c.v.x *= 0.6; c.v.z *= 0.6; c.bounced++; } else { c.v.set(0, 0, 0); }
        }
        c.ax += c.spin * dt * (c.bounced < 2 ? 1 : 0.2);
        const lie = c.bounced >= 2 ? Math.PI / 2 : 0;
        _e.set(lie, c.ax, 0, 'YXZ');
        _q.setFromEuler(_e);
        const sc = c.t > c.life - 0.3 ? Math.max(0.001, (c.life - c.t) / 0.3) : 1;
        _s1.setScalar(sc);
        coinIM.setMatrixAt(i, _m4.compose(c.p, _q, _s1));
      }
      coinIM.instanceMatrix.needsUpdate = true;
      coinsLive = any;
    }
    for (const id in gateObjs) {
      const G = gateObjs[id];
      if (!G.lift) continue;
      G.lift.t += dt;
      const u = G.lift.t;
      G.bars.position.y = G.y0 + (u < 0.5 ? Math.sin(u * 50) * 0.04 : Math.pow(Math.min(1, (u - 0.5) / 1.1), 2) * 3.6);
      if (u > 1.6) { G.bars.visible = false; G.bars.position.y = G.y0; G.lift = null; }
    }
    for (const f of fks) {
      for (const sd of ['a', 'b']) {
        const A = f.bars[sd].anim;
        if (!A) continue;
        A.t += dt;
        const bar = f.bars[sd];
        if (A.out) {
          // the barricade topples backwards and sinks
          bar.rotation.x = -(Math.min(1, A.t / 0.5) ** 2) * 1.4;
          bar.position.y = A.y0 - Math.max(0, A.t - 0.4) * 3;
          if (A.t > 1.0) { bar.visible = false; bar.rotation.x = 0; bar.position.y = A.y0; f.bars[sd].anim = null; }
        } else {
          const k = Math.min(1, A.t / 0.35);
          bar.scale.set(1, 0.2 + 0.8 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.15, 1);
          if (A.t > 0.35) { bar.scale.set(1, 1, 1); f.bars[sd].anim = null; }
        }
      }
    }
    if (focus >= 0) {
      const M = ms[focus];
      bb.set(ARROW, _a.copy(M.rewardPos).add(V(0, M.state === 'open' ? 0.2 : 1.6, 0)), 0.9);
    }
  });

  // ------------------------------------------------ route + s values
  function reroute() {
    buildRoute();
    for (const M of ms) M.s = sOfMi(M.mi);
    for (const f of fks) { f.s0 = sOfMi(f.iF); f.s1 = sOfMi(f.iJ); f.sSign = f.s0 + 2; }
    api.length = route.length;
    api.zoneS = zoneMi.map(sOfMi);
    api.exitS = exitMi.map(sOfMi);
    api.gateS = gateMi.map(sOfMi);
  }

  const api = {
    group, milestones: ms, forks: fks, length: 0, camDir: CAM_DIR.clone(), faceY: FACE_Y,
    zoneS: [], gateS: [], exitS: [],
    posAt: (s, out) => route.posAt(s, out),
    tangentAt: (s, out) => route.tangentAt(s, out),
    /** Reroute through the picked trails: { forkId: 'a' | 'b' } (unpicked forks follow the main road). */
    setChoices(c) {
      const next = { ...c };
      const same = fks.every((f) => (next[f.id] ?? 'a') === (choices[f.id] ?? 'a'));
      choices = next;
      if (!same || !route.pts.length || api.length === 0) reroute();
    },
    /** Barricade across one trail's entrance (side 'a' | 'b'), or none (null). animate: it pops up / topples. */
    setBarrier(id, sd, o = {}) {
      const f = forkById[id];
      if (!f) return;
      for (const k of ['a', 'b']) {
        const bar = f.bars[k];
        const want = k === sd;
        if (bar.visible === want && !bar.anim) continue;
        if (want) { bar.visible = true; bar.anim = o.animate ? { t: 0, out: false } : null; if (!o.animate) bar.scale.set(1, 1, 1); }
        else if (o.animate && bar.visible) bar.anim = { t: 0, out: true, y0: bar.position.y };
        else { bar.visible = false; bar.anim = null; }
      }
    },
    sOfTrophies(t, ch = choices) {
      // keypoints: each arena's threshold sits just past its plinth, each milestone at its pedestal;
      // a fork with no trail picked keeps you at its signpost
      const keys = [];
      ARENAS.forEach((A, k) => { if (k < zones.length) keys.push([A.trophies, api.exitS[k] - 1.3]); });
      for (const M of ms) {
        if (M.gate) continue;
        if (M.fork && M.side !== (ch[M.fork] ?? 'a')) continue;
        if (M.fork && !ch[M.fork]) continue;
        keys.push([M.t, M.s]);
      }
      for (const f of fks) {
        if (ch[f.id]) continue;
        keys.push([f.F.lo + 0.001, f.sSign], [f.F.hi - 0.001, f.sSign]);
      }
      keys.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (t <= keys[0][0]) return keys[0][1];
      for (let i = 0; i < keys.length - 1; i++) {
        const [t0, s0] = keys[i], [t1, s1] = keys[i + 1];
        if (t >= t0 && t < t1) return s0 + (s1 - s0) * ((t - t0) / (t1 - t0));
      }
      return Math.min(api.length - 1, keys[keys.length - 1][1] + 1.5);
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
  reroute();
  return api;
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
