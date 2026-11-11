// Beast Island background life: MoleForge-style meadow grass patches around the arena plateaus (one
// instanced draw per zone, culled with the zone), hand-pixeled 2D sprites (flowers, bushes, signs,
// background people, bunnies, butterflies, circling birds; one draw for the whole island) and rolling
// parody ad boards beside the first zones, facing each zone's camera.
import { mulberry32 } from '../../core/util.js';
import { MAT } from './terrain.js';
import { makeGrassField, grassMaterial, MOLE_GRASS } from '../arenas/meadow.js';
import { SpriteLayer, addAdBoard, LIFE } from '../arenas/pix2d.js';
import { ArenaKit } from '../arenas/kit.js';

const GREEN = [MAT.GRASS, MAT.MEADOW, MAT.LUSH, MAT.FOREST, MAT.PASTEL, MAT.TOWN, MAT.JUNGLE];
const GRASS_COLS = {
  [MAT.JUNGLE]: [0x2a7a3e, 0x3a9a46, 0x55a83e, 0x6ac04a],
  [MAT.FOREST]: [0x2e8a3a, 0x3a9a40, 0x4aa84a, 0x5ab84a],
  [MAT.PASTEL]: [0x7ae0a8, 0x8af0b8, 0x9ae0c8, 0x6ad09a],
};
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

  // ---- grass: one patch per zone ring
  const gmat = grassMaterial({ amp: 0.5, freq: 0.35 });
  const patches = [];
  zones.forEach((Z, k) => {
    const items = [], cols = new Map();
    const cx = Z.center.x, cz = Z.center.z, r0 = Z.radius + 1.2, r1 = Z.radius + 17;
    for (let i = 0, n = 0; i < 2400 && n < (k < 5 ? 900 : 640)  i++) {
      // patchy: a patch centre and 3-6 clumps around it (MoleForge clump [3, 5])
      const a = R() * Math.PI * 2, d = r0 + Math.sqrt(R()) * (r1 - r0);
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      const m = 3 + Math.floor(R() * 4);
      for (let j = 0; j < m; j++) {
        const x = px + (R() - 0.5) * 1.6, z = pz + (R() - 0.5) * 1.6;
        const id = ground(x, z, 0.25);
        if (id < 0 || !offZones(x, z, 0.8) || !free(x, z, 0.3)) continue;
        items.push([x, T.heightAt(x, z), z, 0.85 + R() * 0.35]);
        cols.set(T.mat[id], (cols.get(T.mat[id]) ?? 0) + 1);
        n++;
      }
    }
    if (items.length < 20) return;
    const main = [...cols.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const G = makeGrassField(items, { mat: gmat, cols: GRASS_COLS[main] ?? MOLE_GRASS, h: [0.75, 1.15], w: 2.1, lit: 1.3, dark: 0.88, seed: k + 1, name: 'meadow:' + Z.id, blades: 5 });
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
    tries(22, Z.radius + 1, Z.radius + 12, (x, y, z) => stat.push([P.flowers[Math.floor(R() * P.flowers.length)], x, y, z, 0.085, R() < 0.5]));
    tries(5, Z.radius + 3, Z.radius + 14, (x, y, z) => { stat.push(['bush', x, y, z, 0.11, R() < 0.5]); exclude.push([x, z, 0.8]); });
    if (SIGNS[Z.id]) tries(1, Z.radius + 2, Z.radius + 4, (x, y, z) => stat.push(['sign:' + SIGNS[Z.id], x, y, z, 0.1, false]));
    if (k < 6) {
      tries(3, Z.radius + 2, Z.radius + 9, (x, y, z) => movers.push({ kind: 'wave', name: P.people[Math.floor(R() * P.people.length)] ?? 'manRed', x, y, z, p: 0.09, ph: R() * 6, rate: 0.5 + R() * 0.8, flip: R() < 0.5 }));
      tries(2, Z.radius + 2, Z.radius + 12, (x, y, z) => movers.push({ kind: 'hop', name: R() < 0.5 ? 'bun' : 'bunBrown', x, y, z, p: 0.08, ph: R() * 10, a: R() * 6 }));
      for (let i = 0; i < 3; i++) movers.push({ kind: 'fly', name: ['fly', 'flyBlue', 'flyYellow'][i], x: cx, y: Z.center.y + 1.2, z: cz, p: 0.075, ph: R() * 20, sp: 0.25 + R() * 0.2, r: Z.radius + 2 + R() * 6 });
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
