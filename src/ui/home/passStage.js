// FOOD SEASON pass: the live 3D stage. The main engine renderer draws this
// scene instead of Beast Island while the PASS tab is open (engine.setStage),
// so there is no second WebGL context.
//
// What lives here: the candy-tile path (lit gold up to your tier), one stop per
// tier with a free stand (left) and a gold premium stand (right), a 3D reward
// floating over each stand (built only near the camera), the claimed / ready /
// locked looks (check flag, chasing marquee bulbs, dim + padlock), Juan at your
// tier, his friends at their landmarks, the drag / wheel camera with inertia,
// screen-space picking and the claim animation.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { aoGeometry } from '../../models/props/voxmesh.js';
import { text, textW } from '../../models/props/common.js';
import { makeCart } from '../../models/props/grocery.js';
import { makeFeast } from '../../models/props/feast.js';
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { batchStatic } from '../../core/staticBatch.js';
import { damp, clamp, shade } from '../../core/util.js';
import { state, passTier } from '../../game/state.js';
import { PASS_TIERS, SEASON, isMilestoneTier } from '../../data/season.js';
import { makeLayout, buildPassWorld, SIDE } from './passWorld.js';
import { makeRewardItem, setDim, disposeDims } from './passItems.js';

const GOLD = 0xffc21a, GOLD_D = 0xc8901a, GOLD_L = 0xffe680, PINK = 0xff4fa3, BLUE = 0x29b6f6, INK = 0x15121f;
const geo = (id, fn, scale = 0.1, pivot = [0, 0, 0]) => {
  const g = aoGeometry('pzs:' + id, fn, { scale, pivot, jitter: 0.03 });
  g.name = id;
  return g;
};
const ROW = 0.8; // path tile size
const STAND_H = { n: 0.8, ms: 1.0 };

// ---------------------------------------------------------------------------
// Voxel parts

function tileGrid() {
  const g = new VoxGrid();
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
    const e = x === -4 || x === 3 || z === -4 || z === 3;
    g.set(x, 0, z, e ? 0xd6d6d6 : 0xffffff);
  }
  return g;
}
function chevronGrid() {
  const g = new VoxGrid();
  for (const [x, z] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0]]) g.set(x, 0, z, 0xffffff);
  return g;
}
/** Stop pad with the tier number (done: gold, next: pink glow edge, todo: white). */
function padGrid(num, kind, ms) {
  const g = new VoxGrid();
  const r = ms ? 9 : 8;
  const base = kind === 'done' ? GOLD : kind === 'next' ? 0xffffff : 0xfff6fb;
  const rim = kind === 'done' ? GOLD_D : kind === 'next' ? PINK : ms ? GOLD : 0xffb6d8;
  for (let x = -r; x < r; x++) for (let z = -r; z < r; z++) {
    if ((x === -r || x === r - 1) && (z === -r || z === r - 1)) continue;
    const e = x === -r || x === r - 1 || z === -r || z === r - 1;
    g.set(x, 0, z, e ? shade(rim, -0.2) : shade(base, -0.08));
    g.set(x, 1, z, e ? rim : base, e && kind === 'next');
  }
  const str = String(num);
  const ink = kind === 'done' ? 0xffffff : kind === 'next' ? PINK : 0xd04a90;
  const w = textW(str, 2);
  // digits on top, reading from the camera (rows run toward -z)
  text(g, str, -Math.floor(w / 2), 2, 5, '+y', ink, { scale: 2 });
  if (ms) for (const [x, z] of [[-r + 1, -r + 1], [r - 2, -r + 1], [-r + 1, r - 2], [r - 2, r - 2]]) g.set(x, 2, z, kind === 'done' ? 0xffffff : GOLD, true);
  return g;
}
/** Display stand: free = white + blue trim with a ribbon emblem, premium = gold + pink with a crown. */
function standGrid(prem, ms) {
  const g = new VoxGrid();
  const r = ms ? 7 : 6, H = ms ? 9 : 7;
  const body = prem ? GOLD : 0xf4f6fa, bodyD = prem ? GOLD_D : 0xd8dee8, trim = prem ? PINK : BLUE, top = prem ? GOLD_L : 0xffffff;
  g.box(-r - 1, 0, -r - 1, r, 1, r, prem ? 0x8a5c10 : 0x9aa8bc);
  for (let x = -r; x < r; x++) for (let z = -r; z < r; z++) for (let y = 2; y <= H - 2; y++) {
    const corner = (x === -r || x === r - 1) && (z === -r || z === r - 1);
    const stripe = y === 3 || y === H - 3;
    g.set(x, y, z, corner ? trim : stripe ? trim : (x + z) & 1 ? body : bodyD);
  }
  g.box(-r - 1, H - 1, -r - 1, r, H, r, (x, y, z) => (y === H ? top : trim));
  // marquee bulb sockets (they light up while the reward is ready: see bulbGrid)
  bulbRing(r, (x, z) => g.set(x, H - 1, z, prem ? 0xb8862a : 0x9aa8bc));
  // front emblem
  const fz = r;
  if (prem) {
    for (const [x, y] of [[-3, 4], [-3, 5], [-3, 6], [-1, 5], [-1, 6], [0, 5], [0, 6], [2, 4], [2, 5], [2, 6], [-2, 4], [1, 4], [-1, 4], [0, 4]]) g.set(x, y - (ms ? 0 : 1), fz, 0xffffff);
  } else {
    for (const [x, y] of [[-1, 3], [0, 3], [-1, 4], [0, 4], [-1, 5], [0, 5], [-3, 5], [-2, 4], [1, 4], [2, 5], [-1, 6], [0, 6]]) g.set(x, y - (ms ? 0 : 1) + (ms ? 1 : 0), fz, trim);
  }
  return g;
}
/** Lit stage top shown while a reward is ready (pulses, blooms a little). */
function readyTopGrid(ms) {
  const g = new VoxGrid();
  const r = ms ? 7 : 6, H = ms ? 9 : 7;
  for (let x = -r; x < r; x++) for (let z = -r; z < r; z++) {
    const c = ((x + z) & 1) ? 0xfff2a0 : 0xffd23f;
    g.set(x, H + 1, z, (x === -r || x === r - 1 || z === -r || z === r - 1) ? 0xffffff : c);
  }
  return g;
}
/** Every other voxel around a stand's top rim. */
function bulbRing(r, fn) {
  let k = 0;
  const ring = [];
  for (let x = -r - 1; x <= r; x++) ring.push([x, r]);
  for (let z = r - 1; z >= -r - 1; z--) ring.push([r, z]);
  for (let x = r - 1; x >= -r - 1; x--) ring.push([x, -r - 1]);
  for (let z = -r; z <= r - 1; z++) ring.push([-r - 1, z]);
  for (const [x, z] of ring) if (k++ % 2 === 0) fn(x, z, (k >> 1) & 1);
}
/** Lit marquee bulbs (two interleaved sets: set 0 in the solid group, set 1 in the glow group, so they chase). */
function bulbGrid(ms) {
  const g = new VoxGrid();
  const r = ms ? 7 : 6, H = ms ? 9 : 7;
  bulbRing(r, (x, z, set) => g.set(x, H - 1, z, 0xfff0a0, set === 1));
  return g;
}
function flagGrid() {
  const g = new VoxGrid();
  for (let y = 0; y < 26; y++) g.set(0, y, 0, y > 24 ? GOLD : 0xd7dde6);
  return g;
}
function clothGrid() {
  const g = new VoxGrid();
  const check = [[2, 3], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 7], [3, 4], [4, 5]];
  for (let x = 1; x <= 12; x++) for (let y = 0; y <= 9; y++) {
    if (x > 10 && Math.abs(y - 4.5) < (x - 10) * 1.5) continue;
    g.set(x, y, 0, 0x2fbf3a);
  }
  for (const [x, y] of check) g.set(x + 1, y, 1, 0xffffff);
  return g;
}
function padlockGrid() {
  const g = new VoxGrid();
  for (let y = 8; y <= 13; y++) for (const x of [-3, 2]) g.set(x, y, 0, 0xd7dde6);
  for (let x = -3; x <= 2; x++) g.set(x, 14, 0, 0xd7dde6);
  g.box(-5, 0, -1, 4, 8, 1, (x, y) => (y === 8 || y === 0 ? GOLD_D : GOLD));
  g.box(-1, 2, 2, 0, 5, 2, INK);
  g.set(-1, 6, 2, INK).set(0, 6, 2, INK);
  return g;
}
/** Pixel sparkle sprite texture (4-point star). */
let sparkTex = null;
function sparkTexture() {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const x = c.getContext('2d');
  x.fillStyle = '#fff6b0';
  for (const [a, b] of [[4, 0], [4, 1], [4, 2], [4, 3], [4, 5], [4, 6], [4, 7], [4, 8], [0, 4], [1, 4], [2, 4], [3, 4], [5, 4], [6, 4], [7, 4], [8, 4]]) x.fillRect(a, b, 1, 1);
  x.fillStyle = '#ffffff';
  x.fillRect(3, 3, 3, 3);
  sparkTex = new THREE.CanvasTexture(c);
  sparkTex.magFilter = sparkTex.minFilter = THREE.NearestFilter;
  sparkTex.colorSpace = THREE.SRGBColorSpace;
  return sparkTex;
}

// ---------------------------------------------------------------------------

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Build the stage (async: the world is built over a few frames).
 * o: { onDirty() } -> stage { scene, camera, update(dt), ... } (see the API at the bottom)
 */
export async function createPassStage(o = {}) {
  const N = PASS_TIERS.length;
  const L = makeLayout(N);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, engine.aspect, 0.5, 150);
  scene.background = new THREE.Color(0x9fdcff);
  scene.fog = new THREE.Fog(0x9fdcff, 30, 70);
  const owned = { geos: [], mats: [], tex: [] };

  // lights: sky fill, a warm key sun from the camera side (its shadow box follows the camera), cool rim
  const hemi = new THREE.HemisphereLight(0xeef6ff, 0xb8a890, 1.5);
  const sun = new THREE.DirectionalLight(0xfff2de, 2.2);
  sun.castShadow = true;
  const ext = 11;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 70 });
  sun.shadow.mapSize.set(engine.shadowRes ?? 2048, engine.shadowRes ?? 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  const rim = new THREE.DirectionalLight(0xbfe4ff, 0.9);
  scene.add(hemi, sun, sun.target, rim);
  const SUN_DIR = new THREE.Vector3(-0.42, 1, 0.62).normalize();

  const W = await buildPassWorld(L);
  scene.add(W.root);

  // ------------------------------------------------------------- path tiles + progress chevrons
  const rows = [];
  for (let z = L.zStart - 1.2; z > L.tz[N - 1] + 3.0; z -= ROW) rows.push(z);
  const tileGeo = geo('tile', tileGrid);
  const tiles = new THREE.InstancedMesh(tileGeo, Mats.solid, rows.length * 3);
  tiles.receiveShadow = true;
  tiles.castShadow = false;
  const chevGeo = geo('chev', chevronGrid);
  const chevMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  owned.mats.push(chevMat);
  const chevs = new THREE.InstancedMesh(chevGeo, chevMat, rows.length);
  chevs.castShadow = false;
  rows.forEach((z, r) => {
    const x = L.pathX(z), m = L.slope(z);
    const n = Math.hypot(1, m);
    const rx = 1 / n, rz = m / n;
    _q.setFromAxisAngle(_v.set(0, 1, 0), -Math.atan(m));
    for (let k = -1; k <= 1; k++) {
      _v2.set(x + rx * k * ROW, 0, z + rz * k * ROW);
      _m.compose(_v2, _q, _s.set(1, 1, 1));
      tiles.setMatrixAt(r * 3 + k + 1, _m);
    }
    _v2.set(x, 0.1, z);
    _m.compose(_v2, _q, _s.set(1, 1, 1));
    chevs.setMatrixAt(r, _m);
  });
  tiles.instanceMatrix.needsUpdate = true;
  chevs.instanceMatrix.needsUpdate = true;
  tiles.computeBoundingSphere();
  chevs.computeBoundingSphere();
  scene.add(tiles, chevs);
  let litZ = Infinity;
  function paintPath(z) {
    litZ = z;
    rows.forEach((rz, r) => {
      const lit = rz >= z;
      const odd = r & 1;
      for (let k = -1; k <= 1; k++) {
        const edge = k !== 0;
        let col;
        if (lit) col = edge ? (odd ? 0xffe9a0 : 0xfff4c8) : odd ? 0xffc21a : 0xffd23f;
        else col = edge ? (odd ? 0xf2f2f6 : 0xffffff) : odd ? 0xff6fb5 : 0xff82c0;
        tiles.setColorAt(r * 3 + k + 1, _c.setHex(col));
      }
      chevs.setColorAt(r, _c.setHex(lit ? 0xfff6c8 : 0xd8509a).multiplyScalar(lit ? 2.3 : 1));
    });
    tiles.instanceColor.needsUpdate = true;
    chevs.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------- stops + stands
  // the two bulb sets alternate (polygon offset: they sit exactly on the baked sockets)
  const bulbA = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const bulbB = bulbA.clone();
  const bulbMats = [bulbA, bulbB];
  const glowPulse = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const sparkMat = new THREE.SpriteMaterial({ map: sparkTexture(), color: 0xffffff, transparent: true, depthWrite: false, fog: false });
  sparkMat.toneMapped = false;
  owned.mats.push(bulbA, bulbB, glowPulse, sparkMat);
  const flagPole = geo('flagPole', flagGrid, 0.05, 'bottom');
  const flagCloth = geo('flagCloth', clothGrid, 0.05, [0, 0, 0]);
  const lockGeo = geo('padlock', padlockGrid, 0.05, 'center');
  const nodes = [];
  const nodeRoot = new THREE.Group();
  const nodeStill = new THREE.Group(); // stop pads + stand bodies (static-batched)
  scene.add(nodeRoot, nodeStill);
  for (let i = 0; i < N; i++) {
    const z = L.tz[i], x = L.pathX(z), y = L.stageY(i), ms = isMilestoneTier(i) || i === N - 1;
    const node = { i, z, x, y, ms, stands: {}, padKind: null };
    node.pad = new THREE.Mesh(undefined, Mats.pair);
    node.pad.position.set(x, y + 0.02, z);
    node.pad.receiveShadow = true;
    node.pad.castShadow = false;
    nodeStill.add(node.pad);
    for (const track of ['free', 'premium']) {
      const prem = track === 'premium';
      const g = new THREE.Group();
      // across the path (perpendicular to it, should a stop ever sit on a bend)
      const m = L.slope(z), n = Math.hypot(1, m), side = (prem ? SIDE : -SIDE) * (ms ? 1.08 : 1);
      g.position.set(x + side / n, y, z + (side * m) / n - (ms ? 0.1 : 0));
      const body = makeMesh(geo(`stand${prem ? 'P' : 'F'}${ms ? 'm' : ''}`, () => standGrid(prem, ms)), Mats.pair);
      body.receiveShadow = true;
      body.position.copy(g.position);
      nodeStill.add(body);
      const bulbs = new THREE.Mesh(geo(`bulbs${ms ? 'm' : ''}`, () => bulbGrid(ms)), bulbMats);
      bulbs.castShadow = false;
      bulbs.visible = false;
      const lit = new THREE.Mesh(geo(`readyTop${ms ? 'm' : ''}`, () => readyTopGrid(ms)), glowPulse);
      lit.castShadow = false;
      lit.position.y = -0.095;
      bulbs.add(lit);
      g.add(bulbs);
      const top = ms ? STAND_H.ms : STAND_H.n;
      const flag = new THREE.Group();
      flag.position.set(prem ? 0.32 : -0.32, top, -0.3);
      flag.add(makeMesh(flagPole, Mats.pair));
      const cloth = makeMesh(flagCloth, Mats.pair);
      cloth.position.y = 0.78;
      flag.add(cloth);
      flag.visible = false;
      g.add(flag);
      const lock = makeMesh(lockGeo, Mats.toyGlossPair);
      lock.castShadow = false;
      lock.position.set(0, top + 0.55, 0.62);
      lock.visible = false;
      g.add(lock);
      const hold = new THREE.Group();
      hold.position.y = top + 0.22;
      g.add(hold);
      const sparks = [];
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Sprite(sparkMat);
        sp.scale.setScalar(0.18);
        sp.visible = false;
        sp.userData.o = k * 2.1 + i;
        g.add(sp);
        sparks.push(sp);
      }
      nodeRoot.add(g);
      node.stands[track] = { track, i, g, body, bulbs, flag, cloth, lock, hold, sparks, top, item: null, st: null, bounce: 0, fly: null };
    }
    nodes.push(node);
  }

  // ------------------------------------------------------------- characters
  const chars = [];
  const mkChar = (id, opts = {}) => {
    const ch = new Chibi(CHARACTERS[id], { scale: opts.scale ?? 0.95 });
    ch.play('idle');
    // only the big parts cast shadows (hands, face and accessories stay out of the shadow pass)
    ch.root.traverse((o) => { if (o.isMesh) o.castShadow = o.parent === ch.torso || o.parent === ch.head || o.parent === ch.legL || o.parent === ch.legR; });
    scene.add(ch.root);
    const c = { id, ch, home: new THREE.Vector3(), radius: 0.9, t: Math.random() * 5, update: opts.update ?? null, far: false };
    chars.push(c);
    return c;
  };
  const juan = mkChar('juan', { scale: 1 });
  juan.walk = null;
  // the crew hang out in the stand columns between two stops, so they are on screen even in portrait
  const zoneFrom = (id) => (L.zones.find((Z) => Z.id === id)?.from ?? 0);
  const between = (i, side) => {
    const z = (L.tz[i] + L.tz[Math.min(N - 1, i + 1)]) / 2;
    return new THREE.Vector3(L.pathX(z) + side * (SIDE + 0.05), 0, z);
  };
  const place = (c, pos, ry) => { c.ch.root.position.copy(pos); c.ch.root.rotation.y = ry; c.home.copy(pos); };
  // Jimmy leans on a full shopping cart in the parking lot
  const jimmy = mkChar('jimmy', { scale: 0.85 });
  const cart = makeCart({ full: true });
  scene.add(cart.root);
  place(jimmy, between(zoneFrom('lot') + 1, -1).add(_v.set(0, 0, -0.45)), 0.25);
  cart.root.position.copy(jimmy.home).add(_v.set(0.22, 0, 0.82));
  cart.root.rotation.y = -Math.PI / 2 + 0.25;
  jimmy.update = (dt) => { jimmy.t -= dt; if (jimmy.t < 0) { jimmy.t = 4.5 + Math.random() * 3; jimmy.ch.react(['thumbsUp', 'fistPump', 'wave', 'lookAround'][Math.floor(Math.random() * 4)]); } };
  // hands on the cart handle between reactions
  jimmy.post = () => {
    const c = jimmy.ch;
    if (c.anim !== 'idle') return;
    c.armL.rotation.x = c.armR.rotation.x = -1.05;
    c.armL.rotation.z = -0.32; c.armR.rotation.z = 0.32;
    c.elbowL.rotation.x = c.elbowR.rotation.x = -0.35;
  };
  // the Super Fan cheers you on in Produce
  const fan = mkChar('fan', { scale: 0.85 });
  place(fan, between(zoneFrom('produce') + 2, 1), -0.35);
  fan.update = (dt) => { fan.t -= dt; if (fan.t < 0) { fan.t = 1.6 + Math.random() * 1.5; fan.ch.react(['cheer', 'jump', 'clap', 'cheer', 'wave'][Math.floor(Math.random() * 5)]); } };
  // Stocker Stan minds the cereal aisle
  const stan = mkChar('stocker', { scale: 0.85 });
  place(stan, between(zoneFrom('cereal') + 2, -1), 0.35);
  stan.update = (dt) => { stan.t -= dt; if (stan.t < 0) { stan.t = 4 + Math.random() * 3; stan.ch.react(['scratchHead', 'think', 'thumbsUp', 'stretch'][Math.floor(Math.random() * 4)]); } };
  // Nolan sits in the snack aisle eating a donut
  const nolan = mkChar('nolan', { scale: 0.85 });
  place(nolan, between(zoneFrom('snacks') + 2, 1), -0.45);
  nolan.ch.setLoop('sit');
  nolan.ch.play('sit');
  {
    const snack = makeFeast('donut');
    snack.scale.setScalar(0.42);
    snack.position.set(0, -0.12, 0.12);
    nolan.ch.handR.add(snack);
  }
  nolan.update = (dt) => {
    nolan.t -= dt;
    if (nolan.t < 0) { nolan.t = 3 + Math.random() * 2; nolan.ch.mood(Math.random() < 0.5 ? 'yum' : 'love', 1.4); }
  };
  // donut to the mouth every couple of seconds
  nolan.post = () => {
    if (nolan.ch.anim !== 'sit') return;
    const c = nolan.ch;
    const bite = Math.pow(Math.max(0, Math.sin(c.t * 1.7)), 3);
    c.armR.rotation.x = -0.7 - bite * 1.15;
    c.armR.rotation.z = 0.2 + bite * 0.35;
    c.elbowR.rotation.x = -1.0 - bite * 0.9;
  };
  // Cashier Cass waves you through checkout
  const cass = mkChar('cashier', { scale: 0.85 });
  place(cass, between(zoneFrom('checkout') + 2, -1), 0.35);
  cass.update = (dt) => { cass.t -= dt; if (cass.t < 0) { cass.t = 5 + Math.random() * 3; cass.ch.react(['wave', 'peace', 'whistle'][Math.floor(Math.random() * 3)]); } };

  // ------------------------------------------------------------- static batching (everything still in the world)
  let batch = null, nodeBatch = null;
  try { batch = batchStatic(W.still, { cell: 14 }); } catch (e) { console.warn('pass batching skipped', e); }

  // ------------------------------------------------------------- state
  const view = { x: 0, y: 0, w: engine.width, h: engine.height };
  const cam = { z: 0, vz: 0, fly: null, drag: null, fx: 0, shake: 0 };
  // cam.z is the point at the centre of the free area; a framed stop sits FRAME units below it
  const FRAME = 2.2;
  const zMax = -1.5, zMin = L.tz[N - 1] - 0.6;
  let tier = -1, premium = null, t = 0, chaseT = 0, chase = 1, disposed = false;
  let juanIdx = -1;
  const START_Z = -0.9; // where Juan waits before tier 1 (just past the START gate)
  const stopPos = (i) => (i < 0 ? _v.set(L.pathX(START_Z), 0.12, START_Z) : _v.set(nodes[i].x, nodes[i].y + 0.3, nodes[i].z));

  function standState(i, track) {
    const p = state.p;
    const prem = track === 'premium';
    const claimed = !!(prem ? p.pass.premium_[i] : p.pass.free[i]);
    if (claimed) return 'claimed';
    if (prem && !p.pass.premium) return 'plock';
    return i < passTier() ? 'avail' : 'locked';
  }
  function applyStand(s, stNew, instant = false) {
    const prev = s.st;
    s.st = stNew;
    const claimed = stNew === 'claimed';
    if (claimed && prev && prev !== 'claimed' && !instant) {
      // flag pops up with a spring
      s.flag.visible = true;
      s.flag.scale.setScalar(0.01);
      s.flagPop = 0;
    } else s.flag.visible = claimed;
    s.lock.visible = stNew === 'plock';
    s.hold.visible = !claimed || !!s.fly;
    if (s.item) setDim(s.item.obj, dimmed(s));
    for (const sp of s.sparks) sp.visible = stNew === 'avail';
    s.bulbs.visible = stNew === 'avail';
  }
  // locked rewards are dimmed, except the season's grand prize stage (always on show)
  function dimmed(s) { return (s.st === 'locked' || s.st === 'plock') && s.i !== N - 1; }
  function padKind(i) { return i < tier ? 'done' : i === tier ? 'next' : 'todo'; }

  /** Re-read the profile: tier, claims, premium. */
  function refresh(instant = false) {
    const nt = Math.min(passTier(), N);
    const np = !!state.p.pass.premium;
    const tierChanged = nt !== tier;
    tier = nt;
    premium = np;
    for (const node of nodes) {
      const k = padKind(node.i);
      if (k !== node.padKind) {
        node.padKind = k;
        node.pad.geometry = geo(`pad${node.i}_${k}`, () => padGrid(node.i + 1, k, node.ms));
      }
      for (const tr of ['free', 'premium']) {
        const s = node.stands[tr];
        const ns = standState(node.i, tr);
        if (ns !== s.st) applyStand(s, ns, instant);
      }
    }
    if (tierChanged) {
      const target = tier - 1;
      // the lit path runs up to Juan's stop plus this tier's progress toward the next
      const frac = tier >= N ? 0 : clamp((state.p.calories - tier * SEASON.calPerTier) / SEASON.calPerTier, 0, 1);
      const zA = target < 0 ? START_Z : L.tz[target], zB = tier < N ? L.tz[tier] : zA;
      paintPath(zA + (zB - zA) * frac * 0.85);
      if (instant || juanIdx === target) placeJuan(target);
      else walkJuan(target);
    } else {
      const frac = tier >= N ? 0 : clamp((state.p.calories - tier * SEASON.calPerTier) / SEASON.calPerTier, 0, 1);
      const zA = tier - 1 < 0 ? START_Z : L.tz[tier - 1], zB = tier < N ? L.tz[tier] : zA;
      const z = zA + (zB - zA) * frac * 0.85;
      if (Math.abs(z - litZ) > 0.01) paintPath(z);
    }
  }
  function placeJuan(idx) {
    juanIdx = idx;
    juan.walk = null;
    const p = stopPos(idx);
    juan.ch.root.position.copy(p);
    juan.ch.root.rotation.y = 0;
    juan.home.copy(p);
    juan.ch.play(idx >= N - 1 ? 'idle' : 'idle');
  }
  /** Juan walks (runs, if far) from his old stop to the new one along the path; the camera tags along. */
  function walkJuan(idx) {
    const from = juanIdx;
    juanIdx = idx;
    cam.follow = true;
    const z0 = juan.ch.root.position.z, z1 = stopPos(idx).z;
    const dist = Math.abs(z1 - z0);
    juan.walk = { z0, z1, t: 0, dur: Math.min(5, 0.6 + dist / (dist > 8 ? 6.5 : 2.6)), run: dist > 8, from };
    juan.ch.play(dist > 8 ? 'run' : 'walk');
  }

  // ------------------------------------------------------------- items (built near the camera only)
  let buildBudget = 0;
  const dbg = { built: 0, dropped: 0, last: '' };
  function ensureItem(s) {
    if (s.item || buildBudget <= 0) return;
    buildBudget--;
    dbg.built++; dbg.last = 'build ' + s.i + s.track;
    const r = PASS_TIERS[s.i][s.track];
    s.item = makeRewardItem(r, { big: s.i === N - 1 && s.track === 'premium' });
    s.item.obj.rotation.y = (s.track === 'premium' ? -0.5 : 0.5);
    s.hold.add(s.item.obj);
    if (dimmed(s)) setDim(s.item.obj, true);
  }
  function nextToBuild(near, lo = -30, hi = 11) {
    let best = null, bd = Infinity;
    for (const node of nodes) {
      const dz = node.z - near;
      if (dz >= hi || dz <= lo) continue;
      for (const tr of ['free', 'premium']) {
        const s = node.stands[tr];
        if (s.item || s.st === 'claimed') continue;
        const d = Math.abs(dz + 1) + (tr === 'premium' ? 0.1 : 0);
        if (d < bd) { bd = d; best = s; }
      }
    }
    return best;
  }
  function dropItem(s) {
    if (!s.item || s.fly) return;
    dbg.dropped++; dbg.last = 'drop ' + s.i + s.track + ' ' + new Error().stack.split('\n').slice(1, 4).join('|');
    s.item.obj.removeFromParent();
    s.item.obj.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData?.voxels) o.geometry.dispose?.(); });
    s.item.dispose();
    s.item = null;
  }

  // ------------------------------------------------------------- camera
  function rig() {
    const a = view.w / Math.max(1, view.h);
    // portrait: higher and steeper (the path runs up the screen); landscape: lower and closer
    const k = clamp((a - 0.6) / 1.4, 0, 1);
    return { fov: 34 - k * 4, dist: 23 - k * 5, pitch: (54 - k * 6) * Math.PI / 180, width: 7.9 + k * 2 };
  }
  function placeCamera(dt) {
    const R = rig();
    const W2 = engine.width, H2 = engine.height;
    if (camera.fov !== R.fov || camera.aspect !== W2 / H2) {
      camera.fov = R.fov;
      camera.aspect = W2 / H2;
    }
    // fit the stands across the free area in tall views
    const halfV = Math.tan((R.fov * Math.PI) / 360);
    const needDist = (R.width / 2) / (halfV * (view.w / view.h)) * (view.h / H2);
    const dist = Math.max(R.dist, Math.min(30, needDist * Math.cos(R.pitch * 0.35)));
    // the camera follows the path's sideways bends (centred on the framed stop)
    const fx = L.pathX(cam.z + FRAME * 0.6) * 0.9;
    cam.fx = dt > 0 ? damp(cam.fx, fx, 3, dt) : fx;
    const fy = cam.z < L.tz[N - 1] + 3 ? 0.4 : 0;
    camera.position.set(cam.fx, fy + Math.sin(R.pitch) * dist, cam.z + Math.cos(R.pitch) * dist);
    camera.lookAt(cam.fx, fy + 0.4, cam.z);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 2.2);
      const s = cam.shake * cam.shake * 0.25;
      camera.position.x += Math.sin(t * 47) * s;
      camera.position.y += Math.sin(t * 59 + 1) * s;
    }
    // centre the projection on the free area (between the HUD panels)
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    camera.setViewOffset(W2, H2, W2 / 2 - cx, H2 / 2 - cy, W2, H2);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // the sun's shadow box follows the view
    const tz = cam.z - 3;
    sun.target.position.set(cam.fx, 0, tz);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 30);
    rim.position.set(cam.fx + 8, 10, tz - 14);
  }
  /** World units the focus moves per screen pixel dragged. */
  function unitsPerPx() {
    const R = rig();
    const d = camera.position.distanceTo(_v.set(cam.fx, 0, cam.z));
    return (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, engine.height) / Math.max(0.55, Math.sin(R.pitch));
  }
  function flyTo(z, dur = 1.1, then = null) {
    cam.fly = { z0: cam.z, z1: clamp(z, zMin, zMax), t: 0, dur, then };
    cam.vz = 0;
  }
  const tierZ = (i) => (i < 0 ? START_Z : L.tz[clamp(i, 0, N - 1)]);

  // ------------------------------------------------------------- picking (screen space)
  function project(v) {
    const p = _v2.copy(v).project(camera);
    return { x: (p.x * 0.5 + 0.5) * engine.width, y: (-p.y * 0.5 + 0.5) * engine.height, vis: p.z < 1 && p.z > -1 };
  }
  function pxRadius(v, r) {
    const a = project(v);
    const b = project(_v.copy(v).add(_s.set(r, 0, 0)));
    return Math.max(18, Math.hypot(b.x - a.x, b.y - a.y));
  }
  function standAnchor(s, out = new THREE.Vector3()) {
    return out.set(0, s.top + 0.55, 0).applyMatrix4(s.g.matrixWorld);
  }
  function pick(x, y) {
    let best = null, bd = Infinity;
    const consider = (d, r, hit) => { if (d < r && d / r < bd) { bd = d / r; best = hit; } };
    for (const c of chars) {
      if (c.far) continue;
      const p = c.ch.root.position;
      const v = _s.set(p.x, p.y + 0.9, p.z);
      const s = project(v);
      if (!s.vis) continue;
      consider(Math.hypot(s.x - x, s.y - y), pxRadius(v, 0.75), { kind: 'char', id: c.id });
    }
    for (const node of nodes) {
      if (Math.abs(node.z - cam.z) > 40) continue;
      for (const tr of ['free', 'premium']) {
        const s = node.stands[tr];
        const v = standAnchor(s, new THREE.Vector3());
        const sp = project(v);
        if (!sp.vis) continue;
        consider(Math.hypot(sp.x - x, sp.y - y), pxRadius(v, 0.8), { kind: 'stand', i: node.i, track: tr });
      }
      const pv = new THREE.Vector3(node.x, node.y + 0.2, node.z);
      const pp = project(pv);
      if (pp.vis) consider(Math.hypot(pp.x - x, pp.y - y), pxRadius(pv, 0.75), { kind: 'stand', i: node.i, track: null });
    }
    return best;
  }

  // ------------------------------------------------------------- frame update
  const bg = { lot: new THREE.Color(0x9fdcff), store: new THREE.Color(0xffe8d0), vault: new THREE.Color(0x3a2814) };
  const sunCol = { day: new THREE.Color(0xfff2de), vault: new THREE.Color(0xffd890) };
  const fogNear = { lot: 30, store: 26, vault: 18 };
  function update(dt) {
    if (disposed) return;
    t += dt;
    // camera motion: fly > drag > inertia (rubber band at the ends)
    if (cam.fly) {
      const f = cam.fly;
      f.t += dt / f.dur;
      const k = easeIO(Math.min(1, f.t));
      cam.z = f.z0 + (f.z1 - f.z0) * k;
      if (f.t >= 1) { cam.fly = null; f.then?.(); }
    } else if (cam.drag) {
      cam.z = damp(cam.z, cam.drag.z, 22, dt);
    } else if (cam.follow && juan.walk) {
      cam.z = damp(cam.z, clamp(juan.ch.root.position.z - FRAME, zMin, zMax), 3.5, dt);
      cam.vz = 0;
    } else {
      if (cam.follow && !juan.walk) { cam.follow = false; flyTo(tierZ(juanIdx) - FRAME, 0.6); }
      cam.z += cam.vz * dt;
      cam.vz *= Math.exp(-dt * 3.2);
      if (Math.abs(cam.vz) < 0.05) cam.vz = 0;
      if (cam.z > zMax) { cam.z = damp(cam.z, zMax, 9, dt); cam.vz *= 0.5; }
      if (cam.z < zMin) { cam.z = damp(cam.z, zMin, 9, dt); cam.vz *= 0.5; }
    }
    placeCamera(dt);
    // zone colours: sky outside, bright store inside, warm dark in the vault
    const inStore = clamp((L.doorZ + 6 - cam.z) / 10, 0, 1);
    const inVault = clamp((L.vaultZ + 4 - cam.z) / 8, 0, 1);
    _c.copy(bg.lot).lerp(bg.store, inStore).lerp(bg.vault, inVault);
    scene.background.copy(_c);
    scene.fog.color.copy(_c);
    scene.fog.near = (fogNear.lot + (fogNear.store - fogNear.lot) * inStore) * (1 - inVault * 0.2);
    scene.fog.far = scene.fog.near + 34 - inVault * 8;
    hemi.intensity = 1.5 - inVault * 0.3;
    sun.intensity = 2.2 - inVault * 0.4;
    sun.color.copy(sunCol.day).lerp(sunCol.vault, inVault);
    for (const d of W.dyn) d.update(dt, t, cam.z);
    // marquee chase: the two bulb sets swap every few frames
    chaseT += dt;
    if (chaseT > 0.24) { chaseT = 0; chase ^= 1; }
    bulbA.color.setScalar(chase ? 2.6 : 0.55);
    bulbB.color.setScalar(chase ? 0.55 : 2.6);
    glowPulse.color.setScalar(1.25 + Math.sin(t * 4.2) * 0.45);
    // nodes near the camera: build the missing rewards nearest the view first (a few ms per frame), drop far ones, animate
    const near = cam.z;
    const t0 = performance.now();
    for (let k = 0; k < 6 && performance.now() - t0 < 4; k++) {
      const s = nextToBuild(near);
      if (!s) break;
      buildBudget = 1;
      ensureItem(s);
    }
    for (const node of nodes) {
      const dz = node.z - near;
      const inRange = dz < 11 && dz > -30;
      for (const tr of ['free', 'premium']) {
        const s = node.stands[tr];
        if ((dz > 18 || dz < -42) && s.item) dropItem(s);
        if (!inRange) continue;
        if (s.flag.visible) {
          s.cloth.rotation.y = Math.sin(t * 3 + node.i) * 0.25;
          if (s.flagPop !== undefined) {
            s.flagPop += dt;
            const k = Math.min(1, s.flagPop / 0.5);
            s.flag.scale.setScalar(k < 1 ? Math.max(0.01, easeOutBack(k)) : 1);
            if (k >= 1) s.flagPop = undefined;
          }
        }
        if (s.lock.visible) s.lock.position.y = s.top + 0.55 + Math.sin(t * 2 + node.i) * 0.04;
        const it = s.item;
        if (!it) continue;
        const o = it.obj;
        if (s.fly) {
          animateFly(s, dt);
          continue;
        }
        const avail = s.st === 'avail';
        // bob + turn; ready rewards hop every couple of seconds
        let y = Math.sin(t * 1.8 + node.i * 0.7 + (tr === 'premium' ? 1.3 : 0)) * 0.06;
        if (avail) {
          const ph = (t * 0.7 + node.i * 0.13 + (tr === 'premium' ? 0.5 : 0)) % 1.6;
          if (ph < 0.42) y += Math.sin((ph / 0.42) * Math.PI) * 0.32;
          o.rotation.y += dt * 1.1;
          const sq = ph < 0.42 ? 1 + Math.sin((ph / 0.42) * Math.PI) * 0.06 : 1;
          o.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
          s.sparks.forEach((sp, k) => {
            const a = t * 1.3 + sp.userData.o;
            sp.position.set(Math.cos(a) * 0.62, s.top + 0.5 + Math.sin(a * 1.7) * 0.35, Math.sin(a) * 0.42 + 0.1);
            const tw = Math.max(0, Math.sin(t * 4 + k * 2.1));
            sp.scale.setScalar(0.06 + tw * 0.16);
          });
        } else o.rotation.y += dt * (s.st === 'locked' || s.st === 'plock' ? 0.25 : 0.5);
        o.position.y = y;
        if (Math.abs(dz) < 26) it.update(Math.min(dt, 1 / 30));
      }
    }
    // characters: only the ones near the camera run
    for (const c of chars) {
      const dz = c.ch.root.position.z - near;
      c.far = dz > 12 || dz < -36;
      c.ch.root.visible = !c.far;
      if (c.id === 'jimmy') cart.root.visible = !c.far;
      if (c.far) continue;
      c.update?.(dt);
      c.ch.update(Math.min(dt, 1 / 30));
      c.post?.(dt);
    }
    updateJuan(dt);
    batch?.check();
    nodeBatch?.check();
  }
  function easeOutBack(k) { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
  function updateJuan(dt) {
    const w = juan.walk;
    const ch = juan.ch;
    if (w) {
      w.t += dt / w.dur;
      const k = Math.min(1, w.t);
      const e = k * k * (3 - 2 * k);
      const z = w.z0 + (w.z1 - w.z0) * e;
      const x = L.pathX(z);
      const zNext = z + Math.sign(w.z1 - w.z0) * 0.3;
      const dirX = L.pathX(zNext) - x;
      ch.root.position.set(x, 0.18 + (k > 0.9 ? 0.12 * (k - 0.9) * 10 : 0) + (z < L.tz[N - 1] + 2 ? L.stageY(N - 1) : 0), z);
      ch.root.rotation.y = Math.atan2(dirX, zNext - z);
      if (k >= 1) {
        juan.walk = null;
        juan.home.copy(ch.root.position);
        ch.react(juanIdx >= N - 1 ? 'victory' : 'celebrate');
      }
    } else {
      ch.root.rotation.y = damp(ch.root.rotation.y, 0, 5, dt);
    }
  }

  // ------------------------------------------------------------- claim animation
  /** The reward hops, spins up, then flies at the camera and vanishes. Resolves with its last screen position. */
  function claimFx(i, track) {
    const s = nodes[i].stands[track];
    return new Promise((res) => {
      if (!s.item) { buildBudget = 1; ensureItem(s); }
      if (!s.item) { res(project(standAnchor(s))); return; }
      s.fly = { t: 0, res, from: new THREE.Vector3() };
      s.hold.visible = true;
      s.item.obj.getWorldPosition(s.fly.from);
      for (const sp of s.sparks) sp.visible = false;
      s.bulbs.visible = true;
    });
  }
  function animateFly(s, dt) {
    const f = s.fly, o = s.item.obj;
    f.t += dt;
    if (f.t < 0.42) {
      // wind-up hop + fast spin
      const k = f.t / 0.42;
      o.position.y = Math.sin(k * Math.PI) * 0.9;
      o.rotation.y += dt * (6 + k * 18);
      const sq = 1 + Math.sin(k * Math.PI) * 0.25;
      o.scale.setScalar(sq);
    } else {
      // fly toward the camera, growing, then pop
      const k = Math.min(1, (f.t - 0.42) / 0.38);
      if (!f.p0) { f.p0 = new THREE.Vector3(); o.getWorldPosition(f.p0); }
      _v.copy(camera.position).lerp(f.p0, 0.55);
      _v2.copy(f.p0).lerp(_v, easeIO(k));
      s.hold.worldToLocal(_v2);
      o.position.copy(_v2);
      o.rotation.y += dt * 20;
      o.scale.setScalar(1 + k * 0.9);
      if (k >= 1) {
        const scr = project(o.getWorldPosition(_v));
        s.fly = null;
        o.scale.setScalar(1);
        o.position.set(0, 0, 0);
        s.hold.visible = s.st !== 'claimed';
        s.bulbs.visible = s.st === 'avail';
        dropItem(s);
        f.res(scr);
      }
    }
  }

  // ------------------------------------------------------------- API
  refresh(true);
  // stands + pads merge into a few draws (a pad that changes later is handed back automatically)
  try { nodeBatch = batchStatic(nodeStill, { cell: 12 }); } catch (e) { console.warn('pass node batching skipped', e); }
  // the opening view gets its rewards before the curtain lifts
  {
    const zc = tierZ(juanIdx) - FRAME;
    for (let n = 0; n < 16; n++) {
      const s = nextToBuild(zc, -20, 9);
      if (!s) break;
      buildBudget = 1;
      ensureItem(s);
      if (n % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    }
  }
  // Juan walks over from where he stood the last time the pass was open
  let pendingWalk = null;
  if (typeof o.fromTier === 'number' && o.fromTier < juanIdx) { pendingWalk = juanIdx; placeJuan(o.fromTier); juanIdx = pendingWalk; }
  cam.z = clamp(tierZ(juanIdx) - FRAME, zMin, zMax);
  placeCamera(0);

  const stage = {
    scene, camera, layout: L, nodes, juan, dbg,
    update,
    get viewTier() {
      let bi = -1, bd = Infinity;
      for (const n of nodes) { const d = Math.abs(n.z - (cam.z + FRAME)); if (d < bd) { bd = d; bi = n.i; } }
      return bi;
    },
    get juanIdx() { return juanIdx; },
    get camZ() { return cam.z; },
    get busy() { return !!cam.fly; },
    setView(r) { Object.assign(view, r); },
    refresh,
    /** Fly the camera to a tier (-1: the start gate). */
    flyToTier(i, dur = 1.1, then) { flyTo(tierZ(i) - FRAME, dur, then); },
    /** Fly so a world z sits where a framed stop would. */
    flyToZ(z, dur = 1.1, then) { flyTo(z - FRAME, dur, then); },
    /** Opening move: start a little behind and sweep up the path to Juan. */
    intro() {
      if (pendingWalk !== null) {
        const target = pendingWalk;
        pendingWalk = null;
        const zj = clamp(juan.ch.root.position.z - FRAME, zMin, zMax);
        cam.z = clamp(zj + 12, zMin, zMax);
        placeCamera(0);
        flyTo(zj, 1.1, () => { juanIdx = Math.min(juanIdx, target); walkJuan(target); });
        return;
      }
      const z1 = clamp(tierZ(juanIdx) - FRAME, zMin, zMax);
      cam.z = clamp(z1 + 16, zMin, zMax);
      placeCamera(0);
      flyTo(z1, 1.5);
    },
    dragStart(y) { cam.fly = null; cam.follow = false; cam.vz = 0; cam.drag = { y0: y, z0: cam.z, z: cam.z, hist: [[performance.now(), cam.z]] }; },
    dragMove(y) {
      const d = cam.drag;
      if (!d) return;
      // drag the floor: finger down = walk forward (toward -z)
      let z = d.z0 - (y - d.y0) * unitsPerPx();
      if (z > zMax) z = zMax + (z - zMax) * 0.35;
      if (z < zMin) z = zMin + (z - zMin) * 0.35;
      d.z = z;
      d.hist.push([performance.now(), z]);
      if (d.hist.length > 6) d.hist.shift();
    },
    dragEnd() {
      const d = cam.drag;
      if (!d) return;
      cam.drag = null;
      const now = performance.now();
      const old = d.hist.find((h) => now - h[0] < 120) ?? d.hist[0];
      const dtm = Math.max(16, now - old[0]) / 1000;
      cam.vz = clamp((d.z - old[1]) / dtm, -60, 60);
      if (now - d.hist[d.hist.length - 1][0] > 90) cam.vz = 0;
    },
    wheel(dy) {
      cam.fly = null;
      cam.follow = false;
      // wheel up = forward, like scrolling up a map
      cam.vz += clamp(dy, -240, 240) * 0.09;
      cam.vz = clamp(cam.vz, -45, 45);
    },
    pick,
    project(v) { return project(v); },
    standScreen(i, track) { return project(standAnchor(nodes[i].stands[track])); },
    charScreen(id) {
      const c = chars.find((x) => x.id === id);
      if (!c) return null;
      return project(c.ch.headTop(new THREE.Vector3()));
    },
    chibi(id) { return chars.find((x) => x.id === id)?.ch ?? null; },
    claimFx,
    shake(k = 0.6) { cam.shake = Math.max(cam.shake, k); },
    cheer(name = 'celebrate') { if (!juan.walk) juan.ch.react(name); },
    dispose() {
      if (disposed) return;
      disposed = true;
      batch?.dispose();
      nodeBatch?.dispose();
      for (const n of nodes) for (const tr of ['free', 'premium']) { const s = n.stands[tr]; s.fly = null; dropItem(s); }
      for (const c of chars) { c.ch.face?.texture?.dispose?.(); c.ch.facePlane?.material?.dispose?.(); }
      // free the GPU copies of everything this stage drew (shared caches re-upload if drawn again)
      const geos = new Set(), texs = new Set();
      scene.traverse((ob) => {
        if (ob.geometry) geos.add(ob.geometry);
        const ms = Array.isArray(ob.material) ? ob.material : ob.material ? [ob.material] : [];
        for (const m of ms) if (m.map) texs.add(m.map);
      });
      for (const g of geos) g.dispose();
      for (const tx of texs) if (tx !== sparkTex) tx.dispose();
      sun.shadow.map?.dispose();
      W.dispose();
      for (const m of owned.mats) m.dispose();
      tiles.dispose();
      chevs.dispose();
      disposeDims();
      scene.clear();
    },
  };
  return stage;
}
