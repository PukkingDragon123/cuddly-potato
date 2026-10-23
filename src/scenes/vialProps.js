// Crafted voxel props + pixel effects for the vial opening and the NEW CARD
// cutscene (no plain rings, discs or boxes): pixel rings (dashed glowing voxel
// loops, tintable), a pixel shockwave, a pixel light beam, a voxel red carpet
// with velvet-rope posts, crack decals for the Superhero Landing and a voxel
// trading-card frame for SPECIAL cards.
import * as THREE from 'three';
import { Mats, makeMesh } from '../core/voxel.js';
import { animate } from '../core/tween.js';
import { G, cyl, n3, shade } from '../models/kit.js';

const geoCache = new Map();
const cached = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};
const tintMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});

/** Dashed loop of voxels (radius in voxels) lying flat; white vertex colours, tinted by the material. */
function ringGeo(r, dash = 3, gap = 1, thick = 1) {
  return cached(`ring:${r}:${dash}:${gap}:${thick}`, () => {
    const g = G();
    const n = Math.round(Math.PI * 2 * r);
    for (let i = 0; i < n; i++) {
      if (i % (dash + gap) >= dash) continue;
      const a = (i / n) * Math.PI * 2;
      for (let t = 0; t < thick; t++) {
        const rr = r - t;
        // brighter pixel at the start of each dash: a little chase-light look
        g.set(Math.round(Math.cos(a) * rr), 0, Math.round(Math.sin(a) * rr), i % (dash + gap) === 0 ? 0xffffff : 0xb8c4d8);
      }
    }
    return g.build({ scale: 1, pivot: [0, 0, 0], jitter: 0, ao: false, maxSamples: 4 });
  });
}

/**
 * A glowing pixel ring (flat, radius in world units). Returns a Mesh whose material
 * colour tints it; voxel size = world radius / rVox.
 */
export function pixelRing(radius, color = 0xffffff, o = {}) {
  const rVox = o.rVox ?? 14;
  const m = new THREE.Mesh(ringGeo(rVox, o.dash ?? 3, o.gap ?? 1, o.thick ?? 1), tintMat(color, o.opacity ?? 1));
  m.scale.setScalar(radius / rVox);
  m.renderOrder = 7;
  return m;
}

/** Pixel shockwave: a dashed voxel ring that blasts outward and fades (replaces flat ring meshes). */
export function pixelShock(scene, pos, o = {}) {
  if (!scene) return;
  const ring = pixelRing(1, o.color ?? 0xffffff, { rVox: 18, dash: 2, gap: 1, thick: 2 });
  ring.position.set(pos.x, (pos.y ?? 0) + 0.04, pos.z);
  scene.add(ring);
  const R = o.radius ?? 2.5;
  animate(o.dur ?? 0.5, (e) => {
    ring.scale.setScalar(Math.max(0.01, 0.1 + e * R) / 18);
    ring.material.opacity = 0.95 * (1 - e) * (1 - e * 0.3);
    ring.rotation.y = e * 0.4;
  }, { ease: 'outCubic', onComplete: () => { scene.remove(ring); ring.material.dispose(); } });
}

/** A beam of light made of stacked pixel rings that scroll upward (Glitch Teleport, upgrade). */
export function pixelBeam(radius, height, color) {
  const grp = new THREE.Group();
  const mat = tintMat(color, 0.9);
  const n = Math.max(6, Math.round(height / 0.22));
  const rings = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(ringGeo(10, 2, 1, 1), mat);
    m.scale.setScalar(radius / 10);
    m.renderOrder = 7;
    grp.add(m);
    rings.push(m);
  }
  let t = 0;
  grp.userData = {
    mat,
    update(dt) {
      t += dt;
      rings.forEach((m, i) => {
        const k = ((i / n) + t * 0.55) % 1;
        m.position.y = k * height;
        m.rotation.y = t * 1.5 + i;
        m.scale.setScalar((radius / 10) * (1 - k * 0.25));
      });
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
