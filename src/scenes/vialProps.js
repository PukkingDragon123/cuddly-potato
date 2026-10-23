// Crafted voxel props + pixel effects for the vial opening and the NEW CARD
// cutscene (no rings, circles, discs or plain boxes): glowing voxel chevrons /
// arrows / reticle brackets (tintable), ring-free impacts (the battle's pixel-star
// ground hit), a beam of dashed pixel bars, a voxel red carpet with velvet-rope
// posts, crack decals for the Superhero Landing and a voxel trading-card frame
// for SPECIAL cards.
import * as THREE from 'three';
import { Mats, makeMesh } from '../core/voxel.js';
import { groundHit } from '../game/battle/voxfx.js';
import { G, cyl, n3, shade } from '../models/kit.js';

const geoCache = new Map();
const cached = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};
const tintMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});

/** Build a flat-ish voxel sprite from pixel rows (x right, z toward the camera), white vertex colours (tinted by material). */
function spriteGeo(key, rows, depth = 1) {
  return cached(key, () => {
    const g = G();
    rows.forEach((row, z) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      for (let y = 0; y < depth; y++) g.set(x - (row.length >> 1), y, z - (rows.length >> 1), ch === 'W' ? 0xffffff : 0xa8b4cc);
    }));
    return g.build({ scale: 1, pivot: [0, 0, 0], jitter: 0, ao: false, maxSamples: 4 });
  });
}
const ARROW = ['..W..', '.WWW.', 'WWwWW', '..w..', '..w..'];
const CORNER = ['WWWW', 'Wwww', 'Ww..', 'Ww..'];

/**
 * Pixel "light studs" around a radius (no ring: eight little glowing voxel chevrons pointing in),
 * tinted by the returned group's `material`. Used round the reveal pedestal.
 */
export function pixelStuds(radius, color = 0xffffff, n = 8) {
  const grp = new THREE.Group();
  const mat = tintMat(color, 1);
  const geo = spriteGeo('arrow', ARROW, 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(radius * 0.05);
    m.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    m.rotation.y = Math.PI / 2 - a; // tips point at the centre
    m.renderOrder = 7;
    grp.add(m);
  }
  grp.material = mat;
  return grp;
}

/** "Fill to here" marks: two glowing voxel arrows pointing at the tube from either side. */
export function fillMarks(halfWidth, color = 0x7fe6ff) {
  const grp = new THREE.Group();
  const mat = tintMat(color, 1);
  const geo = spriteGeo('arrow', ARROW, 1);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(0.045);
    m.position.set(sx * (halfWidth + 0.14), 0, 0.12);
    // stand the arrow up facing the camera, tip pointing in
    m.rotation.order = 'ZYX';
    m.rotation.set(Math.PI / 2, 0, sx * Math.PI / 2);
    m.renderOrder = 7;
    grp.add(m);
  }
  grp.material = mat;
  return grp;
}

/** Targeting reticle on the ground: four pixel corner brackets (Superhero Landing). */
export function pixelReticle(size, color = 0xff3a5a) {
  const grp = new THREE.Group();
  const mat = tintMat(color, 1);
  const geo = spriteGeo('corner', CORNER, 1);
  [[-1, -1, 0], [1, -1, -Math.PI / 2], [1, 1, Math.PI], [-1, 1, Math.PI / 2]].forEach(([sx, sz, r]) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(size * 0.09);
    m.position.set(sx * size * 0.5, 0, sz * size * 0.5);
    m.rotation.y = r;
    grp.add(m);
  });
  // centre cross
  const c = new THREE.Mesh(spriteGeo('cross', ['.W.', 'WWW', '.W.'], 1), mat);
  c.scale.setScalar(size * 0.06);
  grp.add(c);
  grp.material = mat;
  return grp;
}

/** Impact flash without rings: the battle's pixel-star ground hit (sparks, debris, dust). */
export function pixelShock(scene, pos, o = {}) {
  groundHit({ x: pos.x, y: pos.y ?? 0, z: pos.z ?? 0 }, { radius: o.radius ?? 2, color: o.color ?? 0xffffff, power: o.power });
}

/** A teleport beam of dashed vertical pixel bars (on a square) whose dashes scroll upward. */
export function pixelBeam(radius, height, color) {
  const grp = new THREE.Group();
  const mat = tintMat(color, 0.9);
  const segs = Math.round(height / 0.09);
  const geo = cached('beambar:' + segs, () => {
    const g = G();
    for (let y = 0; y < segs; y++) if (y % 4 !== 3) g.set(0, y, 0, y % 4 === 0 ? 0xffffff : 0xa8c0d8);
    return g.build({ scale: 1, pivot: [0, 0, 0], jitter: 0, ao: false, maxSamples: 4 });
  });
  const bars = [];
  const per = 4;
  for (let side = 0; side < 4; side++) for (let k = 0; k < per; k++) {
    const t = (k + 0.5) / per * 2 - 1;
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(0.045, height / segs, 0.045);
    const [x, z] = side === 0 ? [t, -1] : side === 1 ? [1, t] : side === 2 ? [-t, 1] : [-1, -t];
    m.position.set(x * radius, 0, z * radius);
    m.userData.off = (side * per + k) * 0.37;
    m.renderOrder = 7;
    grp.add(m);
    bars.push(m);
  }
  let tt = 0;
  grp.userData = {
    mat,
    update(dt) {
      tt += dt;
      // dashes climb: shift each bar up by a fraction of a dash, wrapping
      for (const m of bars) m.position.y = -(((tt * 1.6 + m.userData.off) % 1) * 4 * (height / segs));
      grp.rotation.y = Math.sin(tt * 3) * 0.05;
    },
  };
  grp.userData.update(0);
  return grp;
}

/** Voxel red carpet (length along +z from the origin) with gold trim and a woven pattern. */
export function voxCarpet(len = 3.4) {
  const V = 0.05;
  const L = Math.round(len / V), W = 9;
  const geo = cached('carpet:' + L, () => {
    const g = G();
    for (let z = 0; z < L; z++) for (let x = -W; x <= W; x++) {
      const edge = Math.abs(x) >= W - 1;
      let c = edge ? (Math.abs(x) === W ? 0xb8860b : 0xffd23f) : ((x + z) % 6 === 0 || (x - z) % 6 === 0) ? 0xa00e24 : n3(x, 0, z) < 0.08 ? 0xd8243a : 0xc8142e;
      g.set(x, 0, z, c);
    }
    // the rolled-up end at the back
    cyl(g, 'x', 1.6, 1.5, -W, W, 1.6, 1.6, (x, y, z) => (Math.abs(x) >= W - 1 ? 0xffd23f : 0x9a0c20));
    return g.build({ scale: V, pivot: [0, 0, 0], jitter: 0.02, maxSamples: 60 });
  });
  const m = makeMesh(geo, Mats.toyPair);
  m.receiveShadow = true;
  return m;
}

/** Gold velvet-rope post (voxel). */
export function voxPost() {
  const geo = cached('post', () => {
    const g = G();
    cyl(g, 'y', -0.5, -0.5, 0, 1, 2.6, 2.6, 0xb8860b);
    cyl(g, 'y', -0.5, -0.5, 2, 2, 1.8, 1.8, 0xffd23f);
    cyl(g, 'y', -0.5, -0.5, 3, 12, 0.9, 0.9, (x, y) => (y % 3 === 0 ? 0xfff2a0 : 0xffd23f));
    cyl(g, 'y', -0.5, -0.5, 13, 14, 1.7, 1.7, 0xffd23f);
    g.set(0, 15, 0, 0xfff2a0).set(-1, 15, 0, 0xffd23f);
    return g.build({ scale: 0.035, pivot: 'bottom', jitter: 0.02, maxSamples: 40 });
  });
  return makeMesh(geo, Mats.toyGlossPair);
}
/** A sagging velvet rope between two posts (dx apart, along x). */
export function voxRope(dx) {
  const n = Math.round(dx / 0.035);
  const geo = cached('rope:' + n, () => {
    const g = G();
    for (let i = 0; i <= n; i++) {
      const y = Math.round(12 - Math.sin((i / n) * Math.PI) * 4);
      g.set(i, y, 0, 0x8a0a2e).set(i, y - 1, 0, (i & 1) ? 0x6a0822 : 0x8a0a2e);
    }
    return g.build({ scale: 0.035, pivot: [0, 0, 0], jitter: 0, maxSamples: 20 });
  });
  return makeMesh(geo, Mats.toyPair);
}

/** Jagged crack decal (dark voxels, one layer) for an impact on the bench. */
export function voxCracks(seed = 1) {
  const geo = cached('cracks:' + seed, () => {
    const g = G();
    for (let k = 0; k < 9; k++) {
      let a = (k / 9) * Math.PI * 2 + n3(k, seed, 3) * 0.6;
      let x = 0, z = 0;
      const len = 7 + Math.floor(n3(k, seed, 7) * 9);
      for (let i = 0; i < len; i++) {
        a += (n3(k, i, seed) - 0.5) * 0.9;
        x += Math.cos(a);
        z += Math.sin(a);
        g.set(Math.round(x), 0, Math.round(z), i < 3 ? 0x05060f : 0x0b0d22);
        if (i < 4) g.set(Math.round(x) + 1, 0, Math.round(z), 0x0b0d22);
      }
    }
    // the dent in the middle
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.abs(x) + Math.abs(z) <= 3) g.set(x, 0, z, 0x05060f);
    return g.build({ scale: 0.05, pivot: [0, 0, 0], jitter: 0, ao: false, maxSamples: 4 });
  });
  const m = makeMesh(geo, Mats.pair);
  m.position.y = 0.002;
  return m;
}

/** Voxel trading-card frame (rarity colour, bevelled corners, gem) for the SPECIAL card hologram; art plane goes inside. */
export function voxCardFrame(color) {
  const geo = cached('cardframe:' + color, () => {
    const g = G();
    const W = 7, H = 10; // half-sizes in voxels (0.05)
    const hi = shade(color, 0.25), lo = shade(color, -0.3);
    for (let x = -W; x <= W; x++) for (let y = -H; y <= H; y++) {
      const ax = Math.abs(x), ay = Math.abs(y);
      if (ax + ay > W + H - 2) continue; // bevelled corners
      const border = ax >= W - 1 || ay >= H - 1;
      if (!border) { g.set(x, y, -1, 0x1050b4); continue; } // the back
      g.set(x, y, 0, ax === W || ay === H ? lo : y > 0 ? hi : color);
      g.set(x, y, -1, lo);
    }
    // a gem on top
    g.set(0, H + 1, 0, 0xffffff, true).set(-1, H, 1, 0xff2e88).set(1, H, 1, 0xff2e88).set(0, H, 1, 0xff7ac0);
    return g.build({ scale: 0.05, pivot: 'center', jitter: 0.02, maxSamples: 40 });
  });
  return makeMesh(geo, Mats.toyGlossPair);
}
