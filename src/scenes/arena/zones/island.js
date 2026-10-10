// Island-wide terrain and decoration: Trophy Road & paths, coastline palms and rocks,
// scattered trees/bushes/flowers between zones, instanced grass tufts.
import * as THREE from 'three';
import { TROPHY_ROAD, PATHS, ZONES, inRect, GRID, HALF } from '../layout.js';
import { distSeg } from '../terrain.js';
import { makeGrassTuft } from '../fallbacks.js';
import { Mats } from '../../../core/voxel.js';
import { mulberry32 } from '../../../core/util.js';

export function buildIsland(A) {
  const T = A.terrain;
  // Roads are painted after zone grounds so they stay on top.
  A.post(() => {
    T.line(TROPHY_ROAD, 5, 'roadEdge', { onlyLand: true });
    T.line(TROPHY_ROAD, 3.2, 'road', { onlyLand: true });
    for (const [pts, w, type] of PATHS) {
      if (type === 'road') T.line(pts, w + 1.6, 'roadEdge', { onlyLand: true });
      T.line(pts, w, type, { onlyLand: true });
    }
  }, 0);
  A.post(() => scatter(A), 10);
}

function nearRoad(x, z, d) {
  for (let k = 0; k < TROPHY_ROAD.length - 1; k++) {
    const [ax, az] = TROPHY_ROAD[k], [bx, bz] = TROPHY_ROAD[k + 1];
    if (distSeg(x, z, ax, az, bx, bz) < d) return true;
  }
  return false;
}

function scatter(A) {
  const T = A.terrain;
  const rng = mulberry32(1234);
  const inZone = (x, z, pad = 1.5) => ZONES.some((zn) => zn.id !== 'park' && inRect(x, z, zn.rect, pad));
  const placed = [];
  const farFrom = (x, z, d) => placed.every(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 > d * d);
  // Trees & bushes in the gaps between zones and around the coast.
  for (let n = 0; n < 900 && placed.length < 150; n++) {
    const x = (rng() - 0.5) * 122, z = (rng() - 0.5) * 122;
    const t = T.typeAt(x, z);
    if (t !== 'grass' && t !== 'sand') continue;
    if (inZone(x, z, 1.2) || nearRoad(x, z, 3.6)) continue;
    if (inRect(x, z, [-15, -24, 15, 12], 0) && rng() < 0.75) continue; // park handles its own
    if (!farFrom(x, z, 3.2)) continue;
    if (!A.world.free(x, z, 1.3)) continue;
    placed.push([x, z]);
    const seed = Math.floor(rng() * 9);
    if (t === 'sand') {
      if (rng() < 0.6) A.put('makeTree', ['palm', seed], { x, z, rot: rng() * 6.28, collide: { r: 0.35 }, fit: { h: 4.2, clamp: 1.6 } });
      else A.put('makeRock', [0.9 + rng() * 0.6, seed], { x, z, rot: rng() * 6.28, collide: { r: 0.6 } });
      continue;
    }
    const r = rng();
    if (r < 0.55) A.put('makeTree', [rng() < 0.3 ? 'pine' : 'round', seed], { x, z, rot: rng() * 6.28, collide: { r: 0.4 }, fit: { h: 3.6, clamp: 1.6 } });
    else if (r < 0.75) A.put('makeBush', [seed], { x, z, rot: rng() * 6.28, collide: { r: 0.55 }, fit: { h: 0.9, clamp: 1.8 } });
    else if (r < 0.88) A.put('makeRock', [0.8 + rng() * 0.7, seed], { x, z, rot: rng() * 6.28, collide: { r: 0.55 } });
    else A.put('makeFlowers', [seed], { x, z, collide: false });
  }
  // Rocks poking out of the shallow sea.
  for (let n = 0; n < 220; n++) {
    const x = (rng() - 0.5) * 132, z = (rng() - 0.5) * 132;
    if (T.typeAt(x, z) !== 'seabed' || T.heightAt(x, z) < -2.1) continue;
    if (rng() < 0.7) continue;
    const m = A.put('makeRock', [1.4 + rng() * 1.2, Math.floor(rng() * 9)], { x, z, y: -1.2, rot: rng() * 6.28, collide: false });
  }
  // Grass tufts: instanced per 32x32 region so frustum culling works.
  const geo = makeGrassTuft();
  const max = 1800;
  const R = 32;
  const regions = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let k = 0;
  for (let n = 0; n < 12000 && k < max; n++) {
    const x = (rng() - 0.5) * 124, z = (rng() - 0.5) * 124;
    const t = T.typeAt(x, z);
    if (t !== 'grass' && t !== 'darkgrass' && t !== 'toxic' && t !== 'lawn') continue;
    if (t === 'lawn' && rng() < 0.7) continue;
    if (!A.world.free(x, z, 0.3)) continue;
    e.set(0, rng() * 6.28, 0);
    q.setFromEuler(e);
    const sc = 0.8 + rng() * 0.7;
    s.set(sc, sc * (0.8 + rng() * 0.6), sc);
    p.set(x, T.heightAt(x, z), z);
    m4.compose(p, q, s);
    const key = Math.floor(x / R) + ',' + Math.floor(z / R);
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key).push(m4.clone());
    k++;
  }
  for (const list of regions.values()) {
    const inst = new THREE.InstancedMesh(geo, Mats.solid, list.length);
    list.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    A.scene.add(inst);
  }
}
