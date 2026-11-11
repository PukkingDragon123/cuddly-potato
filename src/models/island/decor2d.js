// Beast Island background life: MoleForge title-forest grass + ground cover around the arena plateaus (one
// instanced draw per zone, culled with the zone), hand-pixeled 2D sprites (flowers, bushes, signs,
// background people, bunnies, butterflies, circling birds; one draw for the whole island) and rolling
// parody ad boards beside the first zones, facing each zone's camera.
import { mulberry32 } from '../../core/util.js';
import { MAT } from './terrain.js';
import { makeForestGrass, forestGrassMaterial, MIX } from '../arenas/meadow.js';
import { SpriteLayer, addAdBoard, LIFE } from '../arenas/pix2d.js';
import { ArenaKit } from '../arenas/kit.js';

const GREEN = [MAT.GRASS, MAT.MEADOW, MAT.LUSH, MAT.FOREST, MAT.PASTEL, MAT.TOWN, MAT.JUNGLE];
const ADS = [['lab', 'feast', 'news'], ['cash', 'burger', 'alert'], ['feast', 'sale', 'lab'], ['sale', 'news', 'burger'], ['alert', 'cash', 'feast']];
const SIGNS = { lab: 'LAB', circle: 'FANS', factory: 'SWEET', mart: 'SALE', redlight: 'GO', pyramid: 'DIG', island: 'BEACH', haunted: 'BOO', antarctica: 'COLD', volcano: 'HOT', reactor: 'KEEP OUT' };

/** ctx: { T, root, updaters, zones, exclude } */
export function addIslandDecor2D({ T, root, updaters, zones, exclude = [] }) {
  const R = mulberry32(9137);
  const free = (x, z, r) => !exclude.some(([ex, ez, er]) => Math.hypot(x - ex, z - ez) < er + r);
  const offZones = (x, z, pad) => zones.every((Z) => Math.hypot(x - Z.center.x, z - Z.center.z) > Z.radius + pad);
  const ground = (x, z, r, mats = GREEN) => {
    const id = T.colAt(x, z);
    if (id < 0 || T.hv[id] < 1 || !mats.includes(T.mat[id])) return -1;
    if (T.roadD[id] < (T.RW ?? 1.5) + r + 0.4 || T.riverD[id] < T.riverW[id] + r + 0.8) return -1;
    if (T.maxHeight(x, z, r) !== T.minHeight(x, z, r)) return -1;
    return id;
  };

  // ---- MoleForge forest grass: one field per zone ring (culled with it), mixes picked by the ground type
  const gmat = forestGrassMaterial({ light: { bright: 1.05, back: 0.3 } });
  const rng = mulberry32(4413);
  const range = (a, b) => a + rng() * (b - a);
  const rr = Object.assign(() => rng(), { range });
  const S = 2.4; // the island is seen from much further away than the forest clearing
  const patches = [];
  zones.forEach((Z, k) => {
    const items = [];
    const cx = Z.center.x, cz = Z.center.z, r0 = Z.radius + 1, r1 = Z.radius + 18;
    for (let i = 0, n = 0; i < 6000 && n < (k < 5 ? 2600 : 1500); i++) {
      const a = rng() * Math.PI * 2, d = r0 + Math.sqrt(rng()) * (r1 - r0);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const id = ground(x, z, 0.2);
      if (id < 0 || !offZones(x, z, 0.6) || !free(x, z, 0.2)) continue;
      const m = T.mat[id], roll = rng(), drift = Math.sin(x * 0.11 + 3) * Math.cos(z * 0.13);
      const nearRoad = T.roadD[id] < (T.RW ?? 1.5) + 3;
      const mix = m === MAT.FOREST ? (drift > 0.55 ? MIX.bluebell : drift < -0.6 ? MIX.anemone : MIX.floor)
        : m === MAT.JUNGLE ? MIX.shade : nearRoad ? MIX.verge : d < r0 + 3 ? MIX.turf : MIX.meadow;
      const [cell, size] = mix(roll, rr);
      items.push({ x, y: T.heightAt(x, z) - 0.03, z, rot: rng() * 6.28, size: size * S, cell, tint: (0.85 + rng() * 0.3) * (m === MAT.FOREST ? 0.92 : 1) });
      n++;
    }
    if (items.length < 20) return;
    const G = makeForestGrass(items, { mat: gmat, seed: k + 1, name: 'forestGrass:' + Z.id });
    root.add(G.mesh);
    patches.push(G);
  });
  updaters.push((dt, t) => { for (const G of patches) G.update(t); });

  // ---- 2D sprites
  const stat = [], movers = [];
  zones.forEach((Z, k) => {
    const cx = Z.center.x, cz = Z.center.z;
    const tries = (n, rMin, rMax, fn) => {
      for (let i = 0, got = 0; i < n * 6 && got < n; i++) {
        const a = R() * Math.PI * 2, d = rMin + R() * (rMax - rMin);
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (ground(x, z, 0.3) < 0 || !offZones(x, z, 0.6) || !free(x, z, 0.4)) continue;
        fn(x, T.heightAt(x, z), z); got++;
      }
    };
    const P = LIFE[k === 0 ? 'lab' : k < 5 ? 'meadow' : 'jungle'];
    tries(22, Z.radius + 1, Z.radius + 12, (x, y, z) => stat.push([P.flowers[Math.floor(R() * P.flowers.length)], x, y, z, 0.12, R() < 0.5]));
    tries(5, Z.radius + 3, Z.radius + 14, (x, y, z) => { stat.push(['bush', x, y, z, 0.15, R() < 0.5]); exclude.push([x, z, 0.8]); });
    if (SIGNS[Z.id]) tries(1, Z.radius + 2, Z.radius + 4, (x, y, z) => stat.push(['sign:' + SIGNS[Z.id], x, y, z, 0.13, false]));
    if (k < 6) {
      tries(3, Z.radius + 2, Z.radius + 9, (x, y, z) => movers.push({ kind: 'wave', name: P.people[Math.floor(R() * P.people.length)] ?? 'manRed', x, y, z, p: 0.12, ph: R() * 6, rate: 0.5 + R() * 0.8, flip: R() < 0.5 }));
      tries(2, Z.radius + 2, Z.radius + 12, (x, y, z) => movers.push({ kind: 'hop', name: R() < 0.5 ? 'bun' : 'bunBrown', x, y, z, p: 0.11, ph: R() * 10, a: R() * 6 }));
      for (let i = 0; i < 3; i++) movers.push({ kind: 'fly', name: ['fly', 'flyBlue', 'flyYellow'][i], x: cx, y: Z.center.y + 1.2, z: cz, p: 0.1, ph: R() * 20, sp: 0.25 + R() * 0.2, r: Z.radius + 2 + R() * 6 });
      movers.push({ kind: 'bird', name: 'bird', x: cx, y: Z.center.y + 9 + R() * 4, z: cz, p: 0.15, ph: R() * 6, sp: 0.18 + R() * 0.1, r: Z.radius + 10 + R() * 8 });
    }
  });
  const L = new SpriteLayer(stat.length + movers.length, { name: 'islandSprites' });
  stat.forEach((s, i) => L.put(i, s[0], s[1], s[2], s[3], s[4], s[5]));
  const off = stat.length;
  const step = (t) => {
    movers.forEach((m, k) => {
      const i = off + k;
      if (m.kind === 'wave') {
        const up = Math.sin(t * m.rate * 3 + m.ph) > 0.2 && Math.sin(t * 0.35 + m.ph) > -0.2;
        L.put(i, m.name + (up ? 'B' : 'A'), m.x, m.y, m.z, m.p, m.flip);
      } else if (m.kind === 'fly') {
        const a = t * m.sp + m.ph;
        L.put(i, m.name + (Math.sin(t * 20 + m.ph) > 0 ? 'A' : 'B'), m.x + Math.cos(a) * m.r, m.y + Math.abs(Math.sin(a * 3.1)) * 0.6, m.z + Math.sin(a) * m.r * 0.8, m.p, Math.sin(a) > 0);
      } else if (m.kind === 'bird') {
        const a = t * m.sp + m.ph;
        L.put(i, m.name + (Math.sin(t * 8 + m.ph) > 0 ? 'A' : 'B'), m.x + Math.cos(a) * m.r, m.y + Math.sin(t * 0.7 + m.ph) * 0.5, m.z + Math.sin(a) * m.r, m.p, Math.sin(a) > 0);
      } else if (m.kind === 'hop') {
        // short hops on the spot, turning now and then
        const cyc = (t * 0.6 + m.ph) % 3, hop = cyc < 1.2 ? Math.abs(Math.sin(cyc * Math.PI * 2.5)) : 0;
        L.put(i, m.name + (hop > 0.25 ? 'B' : 'A'), m.x, m.y + hop * 0.35, m.z, m.p, Math.floor((t * 0.6 + m.ph) / 3) % 2 === 0);
      }
    });
    L.commit();
  };
  step(0);
  root.add(L.mesh);
  updaters.push((dt, t) => step(t));

  // ---- ad boards beside the first zones, facing that zone's camera
  const K = new ArenaKit('islandAds', 3);
  root.add(K.root);
  zones.slice(0, 5).forEach((Z, k) => {
    const c = Z.center, cam = Z.camPos;
    const dx = cam.x - c.x, dz = cam.z - c.z, base = Math.atan2(dz, dx);
    for (let i = 0; i < 40; i++) {
      const a = base + (i & 1 ? 1 : -1) * (0.9 + (i >> 1) * 0.06), d = Z.radius + 4 + (i % 5);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (ground(x, z, 2.6, [...GREEN, MAT.SAND]) < 0 || !free(x, z, 2.8) || !offZones(x, z, 2.5)) continue;
      const y = T.minHeight(x, z, 2.6);
      addAdBoard(K, { x, y, z, ry: Math.atan2(cam.x - x, cam.z - z), w: 4.6, legH: 1.8, ads: ADS[k % ADS.length], ph: k * 1.7, updaters });
      exclude.push([x, z, 3]);
      break;
    }
  });
  return { patches, sprites: L };
}
