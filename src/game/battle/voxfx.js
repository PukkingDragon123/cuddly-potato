// Voxel versions of battle effects that used to be plain primitives:
//   voxelBeam(scene, a, b, color, dur)   a jittering laser of glowing voxel cubes
//   voxelPuddle(radius, color)            a goo puddle (greedy-meshed voxel disc with a bumpy rim)
//   voxelDome(radius, color)              a hex-ish voxel shield shell (translucent)
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry, Mats } from '../../core/voxel.js';
import { animate } from '../../core/tween.js';
import { hpx } from './hitPix.js';

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** A laser made of glowing voxel cubes from a to b; crackles, then fades. */
export function voxelBeam(scene, a, b, color = 0xff2e88, dur = 0.75, thick = 0.22) {
  const len = a.distanceTo(b);
  const n = Math.max(8, Math.round(len / (thick * 0.9)));
  const core = new THREE.InstancedMesh(CUBE, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.6), toneMapped: false, transparent: true, depthWrite: false }), n);
  const glow = new THREE.InstancedMesh(CUBE, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4), toneMapped: false, transparent: true, depthWrite: false }), n * 2);
  core.frustumCulled = glow.frustumCulled = false;
  core.renderOrder = glow.renderOrder = 6;
  scene.add(glow, core);
  const place = (e) => {
    const w = thick * (1 + Math.sin(e * 40) * 0.25) * (1 - e * 0.6);
    for (let i = 0; i < n; i++) {
      _p.copy(a).lerp(b, (i + 0.5) / n);
      _s.setScalar(w * 0.55);
      _m.compose(_p, _q, _s);
      core.setMatrixAt(i, _m);
      for (let k = 0; k < 2; k++) {
        const j = (Math.random() - 0.5) * w * 0.9;
        _p.y += j;
        _p.z += (Math.random() - 0.5) * w * 0.6;
        _s.setScalar(w * (0.8 + Math.random() * 0.5));
        _m.compose(_p, _q, _s);
        glow.setMatrixAt(i * 2 + k, _m);
      }
    }
    core.instanceMatrix.needsUpdate = glow.instanceMatrix.needsUpdate = true;
    core.material.opacity = 1 - e * e;
    glow.material.opacity = 0.75 * (1 - e);
  };
  place(0);
  animate(dur, (e) => place(e), {
    onComplete: () => {
      scene.remove(core, glow);
      core.dispose();
      glow.dispose();
      core.material.dispose();
      glow.material.dispose();
    },
  });
}

const shade = (hex, k) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k)), b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
};

/** A bumpy goo puddle, radius in world units (voxel 0.12), with bubbles and a lighter rim. */
export function voxelPuddle(radius, color = 0x7cff3a) {
  const V = 0.12;
  const R = Math.max(3, Math.round(radius / V));
  const geo = cachedGeometry(`fx:puddle:${R}:${color}`, () => {
    const g = new VoxGrid();
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x, z * 1.05);
        const wob = Math.sin(Math.atan2(z, x) * 5) * 0.9 + Math.sin(Math.atan2(z, x) * 9 + 1) * 0.5;
        if (d > R + wob) continue;
        const edge = d > R + wob - 1.4;
        const c = edge ? shade(color, 1.25) : (x * 7 + z * 13) % 5 === 0 ? shade(color, 0.82) : color;
        g.set(x, 0, z, c);
        if (!edge && (x * 31 + z * 17) % 23 === 0) g.set(x, 1, z, shade(color, 1.4), true); // bubbles
      }
    }
    return g;
  }, { scale: V, pivot: 'bottom', ao: false });
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.85, emissive: new THREE.Color(color).multiplyScalar(0.25) });
  const m = makeMesh(geo, [mat, Mats.glow]);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

/** A translucent voxel shield shell (hex-ish panels with a bright frame). */
export function voxelDome(radius, color = 0x29b6f6) {
  const V = 0.14;
  const R = Math.max(4, Math.round(radius / V));
  const geo = cachedGeometry(`fx:dome:${R}:${color}`, () => {
    const g = new VoxGrid();
    for (let x = -R; x <= R; x++) {
      for (let y = 0; y <= R; y++) {
        for (let z = -R; z <= R; z++) {
          const d = Math.hypot(x, y, z);
          if (d > R || d < R - 1) continue;
          // hex-panel frame lines
          const a = Math.atan2(z, x), e = Math.asin(Math.min(1, y / R));
          const frame = Math.abs(Math.sin(a * 6)) < 0.18 || Math.abs(Math.sin(e * 5)) < 0.16;
          g.set(x, y, z, frame ? shade(color, 1.5) : color, frame);
        }
      }
    }
    return g;
  }, { scale: V, pivot: [0.5, 0, 0.5], ao: false });
  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.32, shininess: 100, depthWrite: false, emissive: new THREE.Color(color).multiplyScalar(0.2) });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.4, depthWrite: false });
  glow.color.setScalar(1.9);
  const m = new THREE.Mesh(geo, [mat, glow]);
  m.renderOrder = 4;
  m.userData.mats = [mat, glow];
  return m;
}

// ---------------------------------------------------------------------------
// Ring-free impacts. Battles used to punctuate every landing / blast / upgrade
// with an expanding flat ring (fx.shockwave); these read as chunky toy-world
// hits instead: a white-hot flash pop, coloured sparks, voxel debris that
// bounces and rolling dust puffs that billow out irregularly (never a circle).
//   groundHit(pos, { radius, color, colors, power, debris, dust, sparks })
import { particles } from '../../core/particles.js';

const DUSTS = [0xe8dcc0, 0xd8c4a0, 0xc8b28a, 0xf2ead8];
const rnd = (a, b) => a + Math.random() * (b - a);
const pickc = (a) => a[(Math.random() * a.length) | 0];
const toHex = (c) => (typeof c === 'number' ? c : c?.isColor ? c.getHex() : 0xffffff);

export function groundHit(pos, o = {}) {
  const R = o.radius ?? 2;
  const col = toHex(o.color ?? 0xffffff);
  const pw = o.power ?? Math.min(1.6, 0.45 + R * 0.28);
  const x = pos.x, z = pos.z ?? 0, y = Math.max(0, pos.y ?? 0);
  const P = { x, y: y + 0.3, z };
  // pixel-art only (hitPix sprites): star flash, sparks, debris chips, dust puffs
  hpx.emit('glow', 'star', { x, y: y + 0.35, z: z + 0.5, life: 0.16, scale: 0.8 + R * 0.25, color: col, fadeOut: 0.3 });
  hpx.sparks(P, { count: o.sparks ?? Math.round(6 + R * 3), speed: 5 * pw, scale: 1, colors: [0xffffff, col, ...(o.colors ?? [])] });
  hpx.chips({ x, y: y + 0.15, z }, { count: o.debris ?? Math.round(4 + R * 2), speed: 4 * pw, scale: Math.min(1.5, 0.8 + R * 0.12), colors: o.debrisColors ?? o.colors ?? DUSTS });
  const nu = o.dust ?? Math.round(4 + R * 2);
  for (let i = 0; i < nu; i++) {
    const a = rnd(0, Math.PI * 2), sp = rnd(0.8, 2.4) * Math.sqrt(R);
    hpx.dust({ x: x + Math.cos(a) * 0.2 * R, z }, { count: 1, vx: Math.cos(a) * sp, spread: 0.3, scale: Math.min(1.8, 0.7 + R * 0.25), color: pickc(o.dustColors ?? DUSTS) });
  }
}
/** Big impact (spell / slam): groundHit + a heavier smoke billow. */
export function groundImpact(pos, o = {}) {
  groundHit(pos, { ...o, color: o.color ?? o.colors?.[0] ?? 0xffffff, debrisColors: o.colors ?? DUSTS, power: o.power ?? 1.2 });
  const R = o.radius ?? 2.5;
  hpx.smoke({ x: pos.x, y: 0.3, z: pos.z ?? 0 }, { count: 4, scale: 0.8 + R * 0.15, radius: R * 0.3 });
}
