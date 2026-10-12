// BEAST ISLAND: the home-lobby world. One big tropical voxel island in an
// animated pixel-art ocean. The trophy road (a light paved path) starts on the
// beach at the Beast Lab and climbs past every arena diorama - each on its own
// plateau + octagonal plinth - up to Beast Island Paradise on the summit.
//
//   const I = await makeBeastIsland();
//   scene.add(I.root); scene.background = I.sky;
//   scene.fog = new THREE.Fog(I.fog.color, I.fog.near, I.fog.far);   // or I.fogFor(cameraDistance)
//   addLights(scene, I.lights);   // then aim the sun's shadow box at the camera target (extent ~34 per zone)
//   every frame: I.update(dt, t)
//
// API
//   root           THREE.Group (terrain, ocean, river + waterfalls, road, bridges, plinths, dioramas, props, life)
//   zones[k]       { id, index, name, trophies, color, group, center, camPos, camLook, hotspots, radius,
//                    roadIndex (into roadPoints), focus (world), diorama }
//                  camPos/camLook: 3/4 top-down framing for fov ~35 in landscape; for portrait push the
//                  camera back along (camPos - camLook) by ~1/aspect (see src/dev/islandView.js).
//   roadPoints     Vector3[] trophy-road polyline (1 unit spacing, y = walkable surface incl. bridges + plinth tops)
//   setLocked(id, locked, { animate })  cloud cover + padlock + chains + greyed signpost; animate the unlock
//   isLocked(id), heightAt(x, z), overview { camPos, camLook }, sky, fog, fogFor(dist), lights, dispose()
//
// Layout (x east, z south / toward the default camera): beach + dock + lighthouse in the south, the road
// zig-zags north through the zones (heights 1 -> 23), the river runs from the summit lagoon over a tall
// waterfall down to the south beach (two bridges), peaks + the giant panther monument guard the summit.
import * as THREE from 'three';
import { makeArenaZone } from '../arenas/index.js';
import { Mats } from '../../core/voxel.js';
import { instanced } from '../props/common.js';
import { mulberry32, clamp } from '../../core/util.js';
import { buildTerrain, MAT, VY, X0, Z0, NX, CS } from './terrain.js';
import { makeOcean, makeRiver, lagoonTexture, columnWater } from './water.js';
import { makeSky, Billboards, makeDistantIslands, HORIZON } from './sky.js';
import * as P from './props.js';

export const ZONE_ORDER = ['lab', 'circle', 'factory', 'mart', 'redlight', 'antarctica', 'reactor', 'pyramid', 'island'];

// Zone layout: plinth top height y, plateau radius rp, blend width rb.
const ZONES = [
  { id: 'lab', name: 'BEAST LAB', trophies: 0, color: 0x29b6f6, x: -30, z: 50, y: 1.0, rp: 10, rb: 8 },
  { id: 'circle', name: 'THE CIRCLE', trophies: 300, color: 0xff4a4a, x: 10, z: 44, y: 3.0, rp: 10, rb: 6 },
  { id: 'factory', name: 'CHOCO FACTORY', trophies: 600, color: 0xff4fa3, x: 50, z: 26, y: 5.5, rp: 10, rb: 5 },
  { id: 'mart', name: 'BEAST MART', trophies: 1000, color: 0xffd23f, x: 42, z: -4, y: 8.0, rp: 10, rb: 5 },
  { id: 'redlight', name: 'RED LIGHT', trophies: 1400, color: 0xff8ab4, x: 2, z: 12, y: 10.5, rp: 10, rb: 5 },
  { id: 'antarctica', name: 'ANTARCTICA', trophies: 1800, color: 0x9ff2ff, x: -46, z: 8, y: 13.0, rp: 10, rb: 4 },
  { id: 'reactor', name: 'REACTOR', trophies: 2300, color: 0x7cff3a, x: -44, z: -30, y: 16.0, rp: 10, rb: 4 },
  { id: 'pyramid', name: 'LOST PYRAMID', trophies: 2800, color: 0xffb84a, x: -6, z: -40, y: 19.0, rp: 10, rb: 4 },
  { id: 'island', name: 'PARADISE', trophies: 3400, color: 0x3ff2c8, x: 38, z: -44, y: 23.0, rp: 14, rb: 3 },
];
// Trophy road control points (passes through every zone centre).
const ROAD = [
  [-30, 50], [-12, 53], [10, 44], [24, 40], [36, 36], [50, 26], [56, 12], [42, -4], [30, 2], [16, 6], [2, 12],
  [-12, 20], [-28, 16], [-46, 8], [-55, -8], [-54, -20], [-44, -30], [-32, -42], [-18, -36], [-6, -40], [6, -50], [20, -52], [38, -44],
];
const RIVER = [[28, -38], [27, -33], [26, -28.5], [24.5, -23], [21.5, -17], [19.5, -10], [21, -3], [24.5, 3], [25, 10], [22.5, 17], [25, 24], [30, 30], [29.5, 38], [31, 46], [29, 54], [31.5, 62], [33, 70], [34, 80]];
const BASINS = [[24.5, -21.5, 9.5, 6, 3]];
const LAGOON = [28, -38, 4.4, 22.5];
const BIOMES = [
  { id: 1, x: -46, z: 8, r: 24, mat: MAT.SNOW, plaza: [0xe8f2fc, 0xc8dcf0, 0xf6fbff] },
  { id: 2, x: -46, z: -32, r: 22, mat: MAT.ASH, plaza: [0x6a6278, 0x4a4458, 0x7a7288] },
  { id: 3, x: -6, z: -42, r: 24, mat: MAT.DESERT, plaza: [0xf2d8a0, 0xd8b070, 0xfae6b8] },
  { id: 4, x: 52, z: 26, r: 17, mat: MAT.CANDY, plaza: [0xffe0ec, 0xff9ec8, 0xffffff] },
  { id: 5, x: 38, z: -44, r: 22, mat: MAT.LUSH },
  { id: 6, x: 2, z: 12, r: 15, mat: MAT.PASTEL, plaza: [0xffe4ec, 0xf2b8c8, 0xfff2f6] },
];
const PEAKS = [[12, -62, 31, 7], [60, -40, 25, 6], [-24, -60, 25, 6], [-62, -42, 23, 7], [-70, 22, 15, 5]];

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PLINTH_R = (P.PLINTH_A * 0.25);
const CLOUDS_PER_ZONE = 22;
const PAD_Y = 7.4, PAD_S = 0.22;

/**
 * Build Beast Island. opts: { decor (default true), dioramas (default true), seed, log (true | 'verbose') }
 */
export async function makeBeastIsland(opts = {}) {
  const t0 = performance.now();
  const root = new THREE.Group();
  root.name = 'beastIsland';
  const updaters = [];
  const R = mulberry32(opts.seed ?? 1234);

  // ------------------------------------------------------------------ terrain
  const T = buildTerrain({
    zones: ZONES.map((z) => ({ ...z, plinthR: PLINTH_R })),
    road: ROAD, river: RIVER, peaks: PEAKS, biomes: BIOMES,
    biomeById: Object.fromEntries(BIOMES.map((b) => [b.id, b])),
    lagoon: LAGOON, riverStartY: LAGOON[3] - 0.35, basins: BASINS,
    riverWidth: (u) => 1.05 + u * 1.25,
    roadHalf: 1.5,
    log: opts.log === 'verbose',
  });
  const lap = (l) => { if (opts.log === 'verbose') console.log(`[beastIsland] ${l} ${Math.round(performance.now() - t0)}ms`); };
  lap('terrain');
  const terrainMats = [
    new THREE.MeshLambertMaterial({ map: T.colorTex }),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  ];
  const terrain = new THREE.Mesh(T.mesh, terrainMats);
  terrain.name = 'terrain';
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  root.add(terrain);

  // ------------------------------------------------------------------ water
  const ocean = makeOcean(T);
  root.add(ocean.mesh);
  const river = makeRiver(T.river);
  root.add(river.group);
  const lagTex = lagoonTexture();
  const lagCols = [];
  T.forDisc(LAGOON[0], LAGOON[1], LAGOON[2] * 1.5, (id) => {
    if (T.mat[id] === MAT.CHANNEL && T.hv[id] * VY <= LAGOON[3] - 0.75) lagCols.push([id % NX, Math.floor(id / NX)]);
  });
  const lagoon = columnWater(lagCols, LAGOON[3] - 0.32, { X0, Z0, CS }, new THREE.MeshBasicMaterial({ map: lagTex }));
  lagoon.name = 'lagoon';
  root.add(lagoon);
  updaters.push((dt, t) => {
    ocean.update(t);
    river.update(dt, t);
    lagTex.offset.set(Math.sin(t * 0.3) * 0.08, t * 0.04);
  });

  // ------------------------------------------------------------------ road polyline (final heights)
  const roadDense = T.road;
  const bridges = findBridges(T);
  const roadY = (p, k) => {
    for (const Z of ZONES) if (Math.hypot(p.x - Z.x, p.z - Z.z) < PLINTH_R - 0.2) return Z.y;
    for (const B of bridges) if (k >= B.k0 && k <= B.k1) return B.deckAt(k);
    return T.heightAt(p.x, p.z);
  };
  const roadPoints = [];
  const roadIdx = [];
  const zSet = new Set(T.zIdx);
  roadDense.forEach((p, k) => {
    if (k % 4 === 0 || zSet.has(k) || k === roadDense.length - 1) {
      if (zSet.has(k)) roadIdx[T.zIdx.indexOf(k)] = roadPoints.length;
      roadPoints.push(V(p.x, roadY(p, k), p.z));
    }
  });
  // bridges
  for (const B of bridges) {
    const lenV = Math.round(Math.hypot(B.len, B.len * Math.tan(B.pitch)) / 0.125);
    const m = P.mesh(P.geo('bridge' + lenV, () => P.bridgeGrid(lenV, 3), 0.125, [0, 0, 0]), { receive: true });
    m.position.set(B.x0, B.y, B.z0);
    m.rotation.set(-B.pitch, B.ry, 0, 'YXZ');
    m.name = 'bridge';
    root.add(m);
  }

  lap('water+road');
  // ------------------------------------------------------------------ zones
  const billboards = new Billboards(16 + ZONES.length * CLOUDS_PER_ZONE, { name: 'clouds' });
  root.add(billboards.mesh);
  const dioramas = opts.dioramas === false ? ZONES.map(() => null) : await Promise.all(ZONES.map((Z) => makeArenaZone(Z.id).catch((e) => { console.error('island zone failed', Z.id, e); return null; })));
  lap('dioramas');
  const zones = [];
  const lockState = {};
  ZONES.forEach((Z, k) => {
    const c = V(Z.x, Z.y, Z.z);
    // road directions leaving the plinth
    const dirs = [];
    const zi = T.zIdx[k];
    for (const step of [-1, 1]) {
      let q = zi;
      while (q + step >= 0 && q + step < roadDense.length && Math.hypot(roadDense[q].x - Z.x, roadDense[q].z - Z.z) < PLINTH_R + 0.5) q += step;
      if (q === zi || q <= 0 || q >= roadDense.length - 1) continue;
      const d = new THREE.Vector2(roadDense[q].x - Z.x, roadDense[q].z - Z.z).normalize();
      dirs.push(d);
    }
    // camera: from the side away from the next zone, leaning south
    const { toNext, dir } = camDir(k);
    const ry = Math.atan2(dir.x, dir.y);
    const look = V(Z.x + toNext.x * 4, Z.y + 0.8, Z.z + toNext.y * 4);
    const { pos: camPos } = frameCamera(T, look, dir, 46, 50);

    const group = new THREE.Group();
    group.name = 'zone:' + Z.id;
    group.position.copy(c);
    group.rotation.y = ry;
    root.add(group);
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const localDirs = dirs.map((d) => [cs * d.x - sn * d.y, sn * d.x + cs * d.y]);
    const plinth = P.mesh(P.geo('plinth_' + Z.id, () => P.plinthGrid(Z.color, localDirs), 0.25, [0, 0, 0]), { receive: true, shadow: false });
    plinth.name = 'plinth';
    plinth.position.y = -0.03; // dioramas put their ground at y = 0: avoid coplanar z-fighting
    group.add(plinth);
    const dio = dioramas[k];
    if (dio) group.add(dio.root);

    // trophy-road signpost beside the plinth, facing the zone camera
    const perp = new THREE.Vector2(-dir.y, dir.x);
    let sp = null;
    for (const side of [1, -1, 0.6, -0.6]) {
      const q = new THREE.Vector2(Z.x, Z.z).addScaledVector(dir, PLINTH_R + 1.2).addScaledVector(perp, side * 5.2);
      const id = T.colAt(q.x, q.y);
      if (id >= 0 && T.roadD[id] > T.RW + 0.6 && T.riverD[id] > 3) { sp = q; break; }
    }
    sp = sp ?? new THREE.Vector2(Z.x, Z.z).addScaledVector(dir, PLINTH_R + 1.2).addScaledVector(perp, 5.2);
    const sy = T.heightAt(sp.x, sp.y);
    const signCol = P.mesh(P.geo('sign_' + Z.id, () => P.signpostGrid(Z.name, Z.trophies, Z.color), 0.085), { receive: false });
    const signGrey = P.mesh(P.geo('signG_' + Z.id, () => P.greyGrid(P.signpostGrid(Z.name, Z.trophies, Z.color)), 0.085), { receive: false });
    for (const s of [signCol, signGrey]) {
      s.position.set(sp.x, sy, sp.y);
      s.rotation.y = ry;
      root.add(s);
    }
    signGrey.visible = false;

    // lock visuals: padlock + chains (in zone space), cloud cover (billboards)
    const lock = new THREE.Group();
    lock.name = 'lock';
    lock.visible = false;
    group.add(lock);
    const pad = new THREE.Group();
    pad.position.set(0, PAD_Y, 2.8);
    lock.add(pad);
    const body = P.mesh(P.geo('padBody', P.padBodyGrid, PAD_S, 'bottom'), { shadow: true });
    const shackle = P.mesh(P.geo('padShackle', P.padShackleGrid, PAD_S, [0, 0, 0]), { shadow: true });
    shackle.position.set(0, 14 * PAD_S + 0.02, 0.06);
    body.position.y = 0;
    pad.add(body, shackle);
    const chains = makeChains(pad.position, [[-5.6, -5.6], [5.6, -5.6], [-6.2, 4.6], [6.2, 4.6]]);
    lock.add(chains.group);
    const slot0 = 16 + k * CLOUDS_PER_ZONE;
    const clouds = [];
    const CR = mulberry32(100 + k);
    const layers = [[10, 6.2, 8.6, 0.6, 2.6], [7, 2.6, 5.2, 2.8, 4.6], [5, 0, 2.4, 4.6, 5.8]];
    let ci = 0;
    for (const [n, r0, r1, y0, y1] of layers) for (let i = 0; i < n; i++, ci++) {
      const a = (i / n) * Math.PI * 2 + CR() * 0.5 + r0;
      const r = r0 + CR() * (r1 - r0);
      clouds.push({ slot: slot0 + ci, lx: Math.cos(a) * r, lz: Math.sin(a) * r, y: y0 + CR() * (y1 - y0), w: 8 + CR() * 4, f: ci % 4, ph: CR() * 6, flip: CR() < 0.5, ang: a });
      billboards.setTint(slot0 + ci, CR() < 0.5 ? 0xe4e8f8 : 0xf0f2fc);
    }
    const st = { k, locked: false, anim: null, lock, pad, body, shackle, chains, clouds, signCol, signGrey, center: c };
    lockState[Z.id] = st;
    placeLockClouds(st, 0, 0);

    zones.push({
      id: Z.id, index: k, name: Z.name, trophies: Z.trophies, color: Z.color, group, center: c.clone(), camPos, camLook: look,
      hotspots: dio?.hotspots ?? {}, radius: Math.max(PLINTH_R, (dio?.radius ?? 7) + 1), roadIndex: roadIdx[k], diorama: dio,
      focus: dio?.focus ? V(...dio.focus).applyMatrix4(new THREE.Matrix4().makeRotationY(ry)).add(c) : c.clone().add(V(0, 1, 0)),
    });
  });
  for (let i = 0; i < 16; i++) billboards.setFade(i, 1);

  function placeLockClouds(st, t, k01) {
    const Z = ZONES[st.k];
    const visible = st.locked || st.anim;
    for (const C of st.clouds) {
      if (!visible) { billboards.set(C.slot, 0, -999, 0, 0.001, 0.001, 0, 0); continue; }
      const spread = 1 + k01 * 0.9;
      const wob = Math.sin(t * 0.5 + C.ph) * 0.35;
      const a = C.ang + t * 0.03;
      const r = Math.hypot(C.lx, C.lz) * spread + wob;
      const fade = st.anim ? clamp(1 - k01 * 1.7, 0, 1) : 1;
      billboards.set(C.slot, Z.x + Math.cos(a) * r, Z.y + C.y + Math.sin(t * 0.7 + C.ph) * 0.2 + k01 * 1.5, Z.z + Math.sin(a) * r, C.w * (1 + k01 * 0.25), C.w * 0.5 * (1 + k01 * 0.25), C.f, fade, C.flip);
    }
  }

  function setLocked(id, locked, o = {}) {
    const st = lockState[id];
    if (!st) return;
    if (locked) {
      st.locked = true;
      st.anim = null;
      st.lock.visible = true;
      st.pad.scale.setScalar(1);
      st.pad.rotation.set(0, 0, 0);
      st.pad.position.y = PAD_Y;
      st.shackle.position.y = 14 * PAD_S + 0.02;
      st.chains.group.position.y = 0;
      st.chains.group.scale.setScalar(1);
      st.signGrey.visible = true;
      st.signCol.visible = false;
      st.signCol.scale.setScalar(1);
    } else if (o.animate && st.locked) {
      st.locked = false;
      st.anim = { t: 0, dur: 2.6 };
    } else {
      st.locked = false;
      st.anim = null;
      st.lock.visible = false;
      st.signGrey.visible = false;
      st.signCol.visible = true;
    }
    placeLockClouds(st, 0, 0);
    billboards.commit();
  }

  updaters.push((dt, t) => {
    for (const id in lockState) {
      const st = lockState[id];
      if (st.anim) {
        const A = st.anim;
        A.t += dt;
        const u = A.t;
        // shake, pop the shackle, then the lock bursts upward and shrinks away
        const shake = u < 0.8 ? Math.sin(u * 60) * 0.12 * (u / 0.8) : 0;
        st.pad.rotation.z = shake;
        if (u > 0.7) st.shackle.position.y = 14 * PAD_S + 0.02 + Math.min(1, (u - 0.7) / 0.15) * 0.9;
        if (u > 1.0) {
          const k = Math.min(1, (u - 1.0) / 0.8);
          st.pad.position.y = PAD_Y + k * 3;
          st.pad.rotation.y = k * Math.PI * 2;
          st.pad.scale.setScalar(Math.max(0.001, (1 + Math.sin(k * Math.PI) * 0.35) * (1 - k * k)));
        }
        const kc = clamp((u - 0.7) / 1.0, 0, 1);
        st.chains.group.position.y = -kc * kc * 6;
        st.chains.group.scale.setScalar(Math.max(0.001, 1 - kc));
        if (u > 1.3 && !st.signCol.visible) { st.signCol.visible = true; st.signGrey.visible = false; }
        if (st.signCol.visible) { const k = clamp((u - 1.3) / 0.5, 0, 1); st.signCol.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.3); }
        placeLockClouds(st, t, clamp((u - 0.5) / (A.dur - 0.6), 0, 1));
        if (u >= A.dur) {
          st.anim = null;
          st.lock.visible = false;
          st.signCol.scale.setScalar(1);
          placeLockClouds(st, t, 0);
        }
      } else if (st.locked) {
        placeLockClouds(st, t, 0);
        st.pad.rotation.z = Math.sin(t * 1.3 + st.k) * 0.05;
        st.pad.position.y = PAD_Y + Math.sin(t * 1.1 + st.k) * 0.12;
      }
    }
    for (const Z of zones) {
      if (!Z.diorama || lockState[Z.id].locked || Z._broken) continue;
      try {
        Z.diorama.update(dt, t);
      } catch (e) {
        Z._broken = true; // keep the island animating if one diorama throws
        console.error('island diorama update failed', Z.id, e);
      }
    }
  });

  // ------------------------------------------------------------------ sky clouds + distant islands
  // sky clouds orbit over the open sea (never between a zone camera and its arena)
  const skyClouds = [];
  for (let i = 0; i < 16; i++) {
    skyClouds.push({ a: (i / 16) * Math.PI * 2 + R() * 0.3, r: 112 + R() * 95, y: 26 + R() * 22, w: 26 + R() * 20, f: i % 4, flip: R() < 0.5, sp: 0.004 + R() * 0.004 });
  }
  updaters.push((dt, t) => {
    for (let i = 0; i < skyClouds.length; i++) {
      const C = skyClouds[i];
      const a = C.a + t * C.sp;
      billboards.set(i, Math.cos(a) * C.r, C.y, Math.sin(a) * C.r, C.w, C.w * 0.5, C.f, 1, C.flip);
    }
    billboards.commit();
  });
  root.add(makeDistantIslands());

  lap('zones');
  // ------------------------------------------------------------------ landmarks
  const exclude = [];
  addLandmarks({ T, root, updaters, exclude, R });
  lap('landmarks');
  addRoadside({ T, root, bridges, exclude });
  if (opts.decor !== false) addDecor({ T, root, exclude, R });
  lap('decor');
  addLife({ T, root, updaters, R });

  root.updateMatrixWorld(true);
  if (opts.log) console.log(`[beastIsland] built in ${Math.round(performance.now() - t0)}ms`);

  return {
    root,
    zones,
    roadPoints,
    setLocked,
    isLocked: (id) => !!lockState[id]?.locked,
    update(dt, t) { for (const u of updaters) u(dt, t); },
    sky: makeSky(),
    fog: { color: HORIZON, near: 260, far: 900 },
    /** Fog range that keeps the island crisp for a camera this far from its target. */
    fogFor: (camDist) => ({ color: HORIZON, near: Math.max(260, camDist * 1.25), far: Math.max(900, camDist * 3.6) }),
    lights: { sky: 0xd8f0ff, ground: 0x8a7a5a, hemi: 1.15, sun: 2.5, sunColor: 0xfff0d6, dir: [34, 62, 44], rim: 0.7, rimColor: 0xa8dcff, shadowExtent: 34 },
    overview: { camPos: V(2, 172, 150), camLook: V(2, 2, 5) },
    heightAt: (x, z) => T.heightAt(x, z),
    terrain: T,
    dispose() {
      root.removeFromParent();
      T.mesh.dispose();
      T.colorTex.dispose();
      T.distTex.dispose();
      for (const m of terrainMats) m.dispose();
      ocean.mesh.geometry.dispose();
      ocean.mesh.material.dispose();
      river.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
      lagoon.geometry.dispose();
      lagTex.dispose();
    },
  };
}

/** Horizontal direction from a zone toward its camera. */
function camDir(k) {
  const Z = ZONES[k], next = ZONES[k + 1], prev = ZONES[k - 1];
  const toNext = next ? new THREE.Vector2(next.x - Z.x, next.z - Z.z).normalize() : new THREE.Vector2(Z.x - prev.x, Z.z - prev.z).normalize();
  return { toNext, dir: toNext.clone().multiplyScalar(-0.62).add(new THREE.Vector2(0.1, 0.62)).normalize() };
}
const summitDir = () => camDir(ZONES.length - 1).dir;

// ---------------------------------------------------------------------------
// Camera framing: pitch up until the line of sight clears the terrain.
function frameCamera(T, look, dir, dist, pitchDeg) {
  let pitch = pitchDeg;
  let pos;
  for (let tries = 0; tries < 12; tries++) {
    const p = (pitch * Math.PI) / 180;
    pos = V(look.x + dir.x * Math.cos(p) * dist, look.y + Math.sin(p) * dist, look.z + dir.y * Math.cos(p) * dist);
    let blocked = false;
    for (let s = 0.12; s < 1; s += 0.02) {
      const x = look.x + (pos.x - look.x) * s, y = look.y + (pos.y - look.y) * s, z = look.z + (pos.z - look.z) * s;
      if (T.heightAt(x, z) + 0.8 > y) { blocked = true; break; }
    }
    if (!blocked) break;
    pitch += 4;
  }
  return { pos, pitch };
}

// ---------------------------------------------------------------------------
// Bridges where the road crosses the river channel
function findBridges(T) {
  const out = [];
  const road = T.road;
  let k0 = -1;
  const wet = (p) => {
    const id = T.colAt(p.x, p.z);
    return id >= 0 && T.riverD[id] < T.riverW[id] + 0.9;
  };
  for (let k = 0; k < road.length; k++) {
    const w = wet(road[k]);
    if (w && k0 < 0) k0 = k;
    if ((!w || k === road.length - 1) && k0 >= 0) {
      const a = Math.max(0, k0 - 6), b = Math.min(road.length - 1, k + 5);
      const A = road[a], B = road[b];
      const ya = T.heightAt(A.x, A.z) + 0.02, yb = T.heightAt(B.x, B.z) + 0.02;
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const ry = Math.atan2(B.x - A.x, B.z - A.z);
      const pitch = Math.atan2(yb - ya, len);
      out.push({
        k0: a, k1: b, x0: A.x, z0: A.z, y: ya, len, ry, pitch,
        deckAt: (kk) => {
          const u = clamp((kk - a) / Math.max(1, b - a), 0, 1);
          return ya + (yb - ya) * u + Math.round(Math.sin(u * Math.PI) * 3) * 0.125;
        },
      });
      k0 = -1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chains hanging from the padlock to four plinth corners (instanced links)
function makeChains(from, corners) {
  const group = new THREE.Group();
  const linkGeo = P.geo('chainLink', P.chainLinkGrid, 0.075, 'center');
  const mats = [];
  for (const [cx, cz] of corners) {
    const A = V(from.x + Math.sign(cx) * 1.7, from.y + 1.4, from.z - 0.2), B = V(cx, 0.15, cz);
    const len = A.distanceTo(B);
    const n = Math.round(len / 0.3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = A.clone().lerp(B, t);
      p.y -= Math.sin(t * Math.PI) * len * 0.12;
      const t2 = Math.min(1, t + 0.02);
      const q2 = A.clone().lerp(B, t2);
      q2.y -= Math.sin(t2 * Math.PI) * len * 0.12;
      const tan = q2.sub(p).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), tan);
      if (i & 1) quat.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2));
      mats.push(new THREE.Matrix4().compose(p, quat, V(1, 1, 1)));
    }
  }
  const im = new THREE.InstancedMesh(linkGeo, Mats.pair, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = true;
  im.computeBoundingSphere();
  group.add(im);
  return { group };
}

// ---------------------------------------------------------------------------
// Landmarks: dock + yacht, lighthouse, panther monument, icebergs, umbrellas

function addLandmarks({ T, root, updaters, exclude }) {
  // --- dock with the yacht, south of the lab
  const lab = ZONES[0];
  let dz = lab.z + 6;
  const dx = lab.x - 9;
  while (dz < 90 && T.heightAt(dx, dz) > 0) dz += 0.5;
  const dockLen = 56;
  const dock = P.mesh(P.geo('dock', () => P.dockGrid(dockLen), 0.25, [0, 0, 0]), { receive: true });
  dock.position.set(dx, 0.8, dz - 2.5);
  dock.name = 'dock';
  root.add(dock);
  exclude.push([dx, dz, 4]);
  const yacht = P.mesh(P.geo('yacht', P.yachtGrid, 0.2, 'bottom'), {});
  const yx = dx + 6.2, yz = dz + 4.5;
  yacht.position.set(yx, -0.35, yz);
  yacht.name = 'yacht';
  root.add(yacht);
  updaters.push((dt, t) => {
    yacht.position.y = -0.4 + Math.sin(t * 1.1) * 0.08;
    yacht.rotation.z = Math.sin(t * 0.9) * 0.02;
    yacht.rotation.x = Math.sin(t * 0.7 + 1) * 0.012;
  });

  // --- lighthouse on the south-west headland
  let lx = -58, lz = 40;
  for (let k = 0; k < 40 && T.heightAt(lx, lz) < 1; k++) { lx += 0.8; lz -= 0.5; }
  const lh = P.mesh(P.geo('lighthouse', P.lighthouseGrid, 0.25, [0, 0, 0]), {});
  const ly = T.maxHeight(lx, lz, 1.2);
  lh.position.set(lx, ly, lz);
  lh.name = 'lighthouse';
  root.add(lh);
  exclude.push([lx, lz, 3.5]);
  // --- giant panther head monument behind the summit arena, facing its camera
  const S8 = ZONES[8], sd = summitDir();
  const hx = S8.x - sd.x * 14, hz = S8.z - sd.y * 14;
  const head = P.mesh(P.geo('pantherHead', P.pantherHeadGrid, 0.25, 'bottom'), { receive: true });
  head.position.set(hx, T.minHeight(hx, hz, 3) - 1.2, hz);
  head.rotation.y = Math.atan2(sd.x, sd.y);
  head.name = 'pantherMonument';
  root.add(head);
  exclude.push([hx, hz, 8]);

  // --- icebergs off the frozen coast
  const bergs = [];
  for (const [x, z, s] of [[-74, 14, 1], [-70, -4, 0.8], [-80, 4, 1.2], [-66, 28, 0.7], [-76, 26, 0.9], [-84, -10, 1]]) {
    if (T.heightAt(x, z) > 0) continue;
    const m = P.mesh(P.geo('berg' + (bergs.length % 3), () => P.icebergGrid(bergs.length % 3 + 1), 0.3, 'bottom'), {});
    m.position.set(x, -0.9, z);
    m.scale.setScalar(s);
    m.rotation.y = x * 0.3;
    root.add(m);
    bergs.push(m);
  }
  updaters.push((dt, t) => bergs.forEach((m, i) => { m.position.y = -0.9 + Math.sin(t * 0.8 + i * 1.7) * 0.12; m.rotation.z = Math.sin(t * 0.5 + i) * 0.02; }));

  // --- beach umbrellas near the lab
  const um = [];
  for (const [x, z, c] of [[-44, 58, 0], [-18, 59, 1], [-12, 58.5, 0], [-50, 54, 1]]) {
    if (T.matAt(x, z) !== MAT.SAND) continue;
    um.push([x, T.heightAt(x, z), z, x * 0.7, 1, c]);
  }
  for (const c of [0, 1]) {
    const items = um.filter((u) => u[5] === c);
    if (items.length) root.add(instanced(P.geo('umbrella' + c, () => P.umbrellaGrid(c ? 0x29b6f6 : 0xff4fa3), 0.1, 'bottom'), items, { shadow: true }));
  }
}

// ---------------------------------------------------------------------------
// Lamp posts along the trophy road
function addRoadside({ T, root, bridges, exclude }) {
  const items = [];
  const road = T.road;
  let side = 1;
  for (let k = 20; k < road.length - 20; k += 30) {
    const p = road[k], q = road[k + 1];
    if (ZONES.some((Z) => Math.hypot(p.x - Z.x, p.z - Z.z) < Z.rp + 0.5)) continue;
    if (bridges.some((B) => k >= B.k0 - 6 && k <= B.k1 + 6)) continue;
    const tx = q.x - p.x, tz = q.z - p.z, l = Math.hypot(tx, tz) || 1;
    const x = p.x - (tz / l) * (T.RW + 0.45) * side, z = p.z + (tx / l) * (T.RW + 0.45) * side;
    const id = T.colAt(x, z);
    if (id < 0 || T.riverD[id] < T.riverW[id] + 0.6) continue;
    items.push([x, T.heightAt(x, z), z, 0, 1]);
    side = -side;
  }
  const im = instanced(P.geo('lamp', P.lampGrid, 0.085, 'bottom'), items, { shadow: true });
  im.name = 'roadLamps';
  root.add(im);
  void exclude;
}

// ---------------------------------------------------------------------------
// Vegetation + scenery scatter (instanced per kind)
function addDecor({ T, root, exclude, R }) {
  const LP = P.LOWPOLY;
  const kinds = {
    palm: { fn: () => LP.palm(0x4cba3a, 1), s: 0.17, items: [], shadow: true },
    palm2: { fn: () => LP.palm(0x5fd04a, 2), s: 0.17, items: [], shadow: true },
    round: { fn: () => LP.round(0x4cba3a, 1), s: 0.24, items: [], shadow: true },
    round2: { fn: () => LP.round(0x6ad04a, 2), s: 0.24, items: [], shadow: true },
    sakura: { fn: () => LP.round(0xff9ec8, 3), s: 0.22, items: [], shadow: true },
    pine: { fn: () => LP.pine(0x3fae4a), s: 0.2, items: [], shadow: true },
    snowpine: { fn: () => LP.pine(0x3a9a5a, true), s: 0.2, items: [], shadow: true },
    lolly: { fn: P.lollipopGrid, s: 0.12, items: [], shadow: true },
    cane: { fn: P.candyCaneGrid, s: 0.11, items: [], shadow: true },
    cactus: { fn: LP.cactus, s: 0.17, items: [], shadow: true },
    dead: { fn: P.deadTreeGrid, s: 0.14, items: [], shadow: true },
    crystal: { fn: P.crystalGrid, s: 0.14, items: [], shadow: false },
    bush: { fn: () => LP.bush(0x4fb441), s: 0.2, items: [] },
    pinkbush: { fn: () => LP.bush(0xff8ac0), s: 0.2, items: [] },
    rock: { fn: () => LP.rock(0x9aa2b4, 1), s: 0.22, items: [], shadow: true },
    sandrock: { fn: () => LP.rock(0xe0a058, 2), s: 0.22, items: [], shadow: true },
    darkrock: { fn: () => LP.rock(0x4a4256, 3), s: 0.22, items: [], shadow: true },
    icerock: { fn: () => LP.rock(0xcfe8fb, 4), s: 0.22, items: [], shadow: true },
    flowers: { fn: () => LP.flowers(1), s: 0.12, items: [] },
    flowers2: { fn: () => LP.flowers(2), s: 0.12, items: [] },
    tuft: { fn: () => LP.tuft(0x4fb441), s: 0.12, items: [] },
  };
  const table = {
    [MAT.GRASS]: [['round', 0.095], ['round2', 0.08], ['palm', 0.05], ['bush', 0.06], ['rock', 0.04], ['flowers', 0.03], ['flowers2', 0.025], ['tuft', 0.06]],
    [MAT.LUSH]: [['palm', 0.14], ['palm2', 0.12], ['round2', 0.08], ['bush', 0.08], ['flowers', 0.08], ['flowers2', 0.07], ['tuft', 0.05]],
    [MAT.PASTEL]: [['sakura', 0.2], ['pinkbush', 0.08], ['flowers2', 0.07], ['tuft', 0.06], ['round2', 0.05]],
    [MAT.SAND]: [['palm', 0.08], ['palm2', 0.07], ['rock', 0.02]],
    [MAT.SNOW]: [['snowpine', 0.28], ['icerock', 0.06]],
    [MAT.DESERT]: [['cactus', 0.08], ['sandrock', 0.07], ['palm2', 0.02]],
    [MAT.ASH]: [['dead', 0.1], ['crystal', 0.05], ['darkrock', 0.1]],
    [MAT.CANDY]: [['lolly', 0.16], ['cane', 0.08], ['pinkbush', 0.08], ['sakura', 0.06]],
    [MAT.ROCK]: [['rock', 0.08], ['pine', 0.12], ['bush', 0.05]],
  };
  const step = 2.1;
  for (let x = -88; x < 88; x += step) for (let z = -86; z < 86; z += step) {
    const px = x + (R() - 0.5) * step * 0.9, pz = z + (R() - 0.5) * step * 0.9;
    const id = T.colAt(px, pz);
    if (id < 0) continue;
    const m = T.mat[id];
    const tb = table[m];
    if (!tb) continue;
    if (T.roadD[id] < T.RW + 1.0 || T.riverD[id] < T.riverW[id] + 1.0) continue;
    if (ZONES.some((Z) => Math.hypot(px - Z.x, pz - Z.z) < PLINTH_R + 2.6)) continue;
    if (Math.hypot(px - LAGOON[0], pz - LAGOON[1]) < LAGOON[2] + 1.5) continue;
    if (exclude.some(([ex, ez, er]) => Math.hypot(px - ex, pz - ez) < er)) continue;
    const y = T.hv[id] * VY;
    if (y < 0.5) continue;
    // only on flat-ish ground (not on a 1-column ledge)
    if (T.minHeight(px, pz, 0.6) < y - 0.6) continue;
    let r = R();
    for (const [k, p] of tb) {
      if (r < p) {
        const K = kinds[k];
        const big = k === 'palm' || k === 'palm2' || k === 'round' || k === 'round2' || k === 'pine' || k === 'snowpine';
        K.items.push([px, y, pz, R() * Math.PI * 2, (big ? 0.8 + R() * 0.45 : 0.75 + R() * 0.5)]);
        break;
      }
      r -= p;
    }
  }
  for (const [k, K] of Object.entries(kinds)) {
    if (!K.items.length) continue;
    const im = instanced(P.geo('d_' + k, K.fn, K.s, 'bottom'), K.items, { shadow: !!K.shadow, receive: true });
    im.name = 'decor:' + k;
    root.add(im);
  }
}

// ---------------------------------------------------------------------------
// Moving life: boats circling the island, seagull flocks
function addLife({ T, root, updaters, R }) {
  // boats
  const boats = [];
  for (const [kind, rx, rz, sp, ph] of [['speed', 98, 92, 0.07, 0.3], ['sail', 112, 104, -0.03, 2.2], ['tug', 104, 96, 0.04, 4.1], ['speed', 120, 110, -0.05, 5.3]]) {
    const m = P.mesh(P.geo('boat_' + kind, () => P.boatGrid(kind), 0.13, 'bottom'), {});
    m.name = 'boat:' + kind;
    root.add(m);
    boats.push({ m, rx, rz, sp, ph });
  }
  updaters.push((dt, t) => {
    for (const b of boats) {
      const a = b.ph + t * b.sp;
      const x = Math.cos(a) * b.rx, z = Math.sin(a) * b.rz;
      const vx = -Math.sin(a) * b.rx * Math.sign(b.sp), vz = Math.cos(a) * b.rz * Math.sign(b.sp);
      b.m.position.set(x, -0.12 + Math.sin(t * 2 + b.ph) * 0.06, z);
      b.m.rotation.y = Math.atan2(vx, vz);
      b.m.rotation.z = Math.sin(t * 1.7 + b.ph) * 0.05;
    }
  });
  // gulls
  const flocks = [[-30, 9, 60], [-56, 16, 38], [30, 30, -30], [52, 14, 30], [-6, 26, -40]];
  const gulls = [];
  flocks.forEach(([x, y, z], f) => {
    for (let i = 0; i < 3; i++) gulls.push({ cx: x + (R() - 0.5) * 6, cy: y + R() * 4, cz: z + (R() - 0.5) * 6, r: 5 + R() * 6, sp: (0.35 + R() * 0.25) * (f % 2 ? -1 : 1), ph: R() * 6.28, fl: 6 + R() * 3 });
  });
  const bodyGeo = P.geo('gullBody', P.gullBodyGrid, 0.07, 'center');
  const wingGeo = P.geo('gullWing', P.gullWingGrid, 0.07, [0, 0, 0]);
  const bodies = new THREE.InstancedMesh(bodyGeo, Mats.pair, gulls.length);
  const wings = new THREE.InstancedMesh(wingGeo, Mats.pair, gulls.length * 2);
  for (const im of [bodies, wings]) { im.frustumCulled = false; im.castShadow = true; root.add(im); }
  bodies.name = 'gulls';
  const m4 = new THREE.Matrix4(), w4 = new THREE.Matrix4(), _rz = new THREE.Matrix4(), _ry = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  updaters.push((dt, t) => {
    gulls.forEach((G, i) => {
      const a = G.ph + t * G.sp;
      p.set(G.cx + Math.cos(a) * G.r, G.cy + Math.sin(t * 0.7 + G.ph) * 0.8, G.cz + Math.sin(a) * G.r);
      const heading = Math.atan2(-Math.sin(a) * Math.sign(G.sp), Math.cos(a) * Math.sign(G.sp));
      e.set(0, heading, -Math.sign(G.sp) * 0.35, 'YXZ');
      q.setFromEuler(e);
      m4.compose(p, q, one);
      bodies.setMatrixAt(i, m4);
      const flap = Math.sin(t * G.fl + G.ph) * 0.55;
      for (const s of [1, -1]) {
        w4.makeTranslation(0, 0.1, 0);
        w4.multiply(_rz.makeRotationZ(s * flap));
        if (s < 0) w4.multiply(_ry.makeRotationY(Math.PI));
        bodies.getMatrixAt(i, m4);
        m4.multiply(w4);
        wings.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), m4);
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  });
  void T;
}
