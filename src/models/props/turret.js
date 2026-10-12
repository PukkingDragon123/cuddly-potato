// Guard turret (the "princess tower"): a Lab-tech pillar topped by a
// swivelling Panther Cannon head with ears, angry eyes and a cannon barrel
// in its mouth. Team-coloured trim (blue = you, red = rival).
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { G, blob, rbox, cyl, capsule, stamp, shade, n3 } from '../kit.js';

const V = 0.07;
const TEAM = [
  { main: 0x29b6f6, dark: 0x1477c9, light: 0x9fe6ff, glow: 0x6fe3ff },
  { main: 0xff4a5a, dark: 0xb8202e, light: 0xffb0b8, glow: 0xff7a86 },
];
const METAL = 0xb8c2d6, METAL_D = 0x6b7590, METAL_DD = 0x434a60, WHITE = 0xf0f4fc, INK = 0x15121f, PINK = 0xff1f9e, YEL = 0xffd23f;

const cache = new Map();

function buildGrids(side) {
  const T = TEAM[side];
  // ---------------------------------------------------------------- tower body
  const body = G();
  // plinth with hazard ring
  cyl(body, 'y', -0.5, -0.5, 0, 3, 13, 13, (x, y, z) => (y === 3 ? METAL : (Math.floor((Math.atan2(z + 0.5, x + 0.5) + 4) * 4) & 1) ? YEL : INK));
  cyl(body, 'y', -0.5, -0.5, 0, 0, 13.5, 13.5, METAL_DD);
  // pillar
  cyl(body, 'y', -0.5, -0.5, 4, 27, 9.5, 8.5, (x, y, z) => {
    const a = Math.atan2(z + 0.5, x + 0.5);
    const seam = Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) < 0.08;
    if (y % 6 === 0) return METAL_D;
    if (seam) return shade(WHITE, -0.12);
    return n3(x, y, z) < 0.06 ? shade(WHITE, -0.06) : WHITE;
  });
  // team stripe up the front + glowing window slots
  for (let y = 6; y <= 25; y++) for (let x = -2; x <= 1; x++) {
    for (let z = 12; z >= 0; z--) if (body.has(x, y, z)) { body.set(x, y, z, (y % 6 === 3) ? T.light : T.main); break; }
  }
  // bolt emblem on the pillar front
  stamp(body, ['..MMM', '.MMM.', 'MMMMM', '..MM.', '.MM..', 'MM...'], { M: { c: PINK, raise: 1 } }, { axis: 'z', x: -3, y: 21 });
  // collar ring under the head
  cyl(body, 'y', -0.5, -0.5, 27, 29, 11.5, 11.5, (x, y) => (y === 28 ? T.main : METAL_D));
  for (let a = 0; a < 12; a++) {
    const x = Math.round(Math.cos((a / 12) * Math.PI * 2) * 11.2 - 0.5), z = Math.round(Math.sin((a / 12) * Math.PI * 2) * 11.2 - 0.5);
    body.set(x, 29, z, T.glow, true);
  }
  // side vents
  for (const s of [-1, 1]) for (let y = 10; y <= 18; y += 2) body.box(s < 0 ? -10 : 9, y, -3, s < 0 ? -10 : 9, y, 2, METAL_DD);

  // ---------------------------------------------------------------- head (faces +X so it aims along the lane; rotated per side)
  const head = G();
  // dome
  blob(head, -0.5, 6, -0.5, 9.5, 7, 9.5, (x, y, z) => (y >= 10 ? T.main : y <= 1 ? METAL_D : WHITE), { p: 2.2, clip: (x, y) => y < 0 });
  // ears
  for (const s of [-1, 1]) {
    capsule(head, [-0.5, 11, s * 6], [-1.5, 16, s * 7.5], 3, 0.6, T.main);
    capsule(head, [0.5, 11.5, s * 6], [-0.4, 15, s * 7.2], 1.5, 0.4, PINK);
  }
  // face on +X: angry eyes + brows + muzzle ring with the cannon
  const face = (rows, pal, y, z0) => {
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const z = z0 + c, yy = y - r;
      for (let x = 14; x >= -2; x--) if (head.has(x, yy, z)) { head.set(x + (pal[ch].raise ? 1 : 0), yy, z, pal[ch].c, !!pal[ch].glow); break; }
    }));
  };
  face([
    'BBB.........BBB',
    '.BBBB.....BBBB.',
    '..WWWB...BWWW..',
    '..WPPW...WPPW..',
    '..WPPW...WPPW..',
    '...WW.....WW...',
  ], { B: { c: T.dark, raise: true }, W: { c: 0xffffff }, P: { c: T.glow, glow: true } }, 11, -8);
  // cannon barrel out of the "mouth"
  const barrel = G();
  cyl(barrel, 'x', 4, 0, 6, 18, 3.4, 2.8, (x) => (x >= 16 ? METAL_DD : x % 4 === 0 ? METAL_D : METAL));
  cyl(barrel, 'x', 4, 0, 17, 18, 3.6, 3.6, T.main);
  cyl(barrel, 'x', 4, 0, 18, 18, 1.8, 1.8, INK);
  barrel.set(18, 4, 0, T.glow, true);
  // jaw/teeth around the barrel
  for (let z = -4; z <= 4; z += 2) { head.set(9, 1, z, 0xffffff); head.set(9, 7, z, 0xffffff); }
  return { body, head, barrel };
}

function geos(side) {
  if (cache.has(side)) return cache.get(side);
  const g = buildGrids(side);
  const out = {
    body: g.body.build({ scale: V, pivot: [-0.5, 0, -0.5], jitter: 0.02, maxSamples: 260 }),
    head: g.head.build({ scale: V, pivot: [-0.5, 0, -0.5], jitter: 0.02, maxSamples: 160 }),
    barrel: g.barrel.build({ scale: V, pivot: [6, 4, 0], jitter: 0.02, maxSamples: 40 }),
  };
  cache.set(side, out);
  return out;
}

/**
 * makeTurret({ side }) -> { root, head, muzzle, meshes, height, aim(targetX), fire(), setDamage(f), update(dt), dead }
 * side 0 faces +X (towards the enemy), side 1 faces -X.
 */
export function makeTurret({ side = 0 } = {}) {
  const G0 = geos(side);
  const root = new THREE.Group();
  root.name = 'turret';
  const body = makeMesh(G0.body, Mats.toyPair);
  body.receiveShadow = true;
  root.add(body);
  const headPivot = new THREE.Group();
  headPivot.position.y = 29.5 * V;
  root.add(headPivot);
  const head = makeMesh(G0.head, Mats.toyPair);
  headPivot.add(head);
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(6 * V, 4 * V, 0);
  headPivot.add(barrelPivot);
  const barrel = makeMesh(G0.barrel, Mats.toyPair);
  barrelPivot.add(barrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(13 * V, 0, 0);
  barrelPivot.add(muzzle);
  const facing = side === 0 ? 0 : Math.PI;
  headPivot.rotation.y = facing;
  const meshes = [body, head, barrel];
  let aimYaw = facing, recoil = 0, idleT = Math.random() * 6;
  const height = 29.5 * V + 16 * V;
  return {
    root, head: headPivot, muzzle, meshes, height, dead: false,
    /** Aim the head at a world x (and slightly at the target z). */
    aim(tx, tz = 0) {
      const p = root.position;
      aimYaw = Math.atan2(-(tz - p.z), tx - p.x);
      idleT = 2;
    },
    fire() { recoil = 1; },
    update(dt) {
      if (this.dead) return;
      idleT -= dt;
      if (idleT < 0) aimYaw = facing + Math.sin(performance.now() / 1300 + side) * 0.35;
      headPivot.rotation.y += ((aimYaw - headPivot.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8);
      recoil = Math.max(0, recoil - dt * 5);
      barrel.position.x = -recoil * 0.12;
      headPivot.position.y = 29.5 * V + Math.sin(performance.now() / 600 + side) * 0.012;
    },
    setDamage(f) {
      const t = Math.max(0, Math.min(1, f));
      head.rotation.z = (side === 0 ? -1 : 1) * t * 0.08;
    },
  };
}
