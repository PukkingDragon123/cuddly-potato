// Instanced voxel particle system + effect presets (fx).
import * as THREE from 'three';
import { rand, pick, TAU } from './util.js';
import { animate } from './tween.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

class Layer {
  constructor(geo, mat, capacity) {
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.capacity = capacity;
    this.list = [];
    this.free = [];
  }
  spawn(o) {
    if (this.list.length >= this.capacity) {
      // recycle oldest
      const old = this.list.shift();
      this.free.push(old);
    }
    const p = this.free.pop() || {};
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.rx = o.rx ?? rand(0, TAU); p.ry = o.ry ?? rand(0, TAU); p.rz = o.rz ?? rand(0, TAU);
    p.rvx = o.rvx ?? 0; p.rvy = o.rvy ?? 0; p.rvz = o.rvz ?? 0;
    p.sx = o.sx ?? o.size ?? 0.1; p.sy = o.sy ?? o.size ?? 0.1; p.sz = o.sz ?? o.size ?? 0.1;
    p.life = 0; p.max = o.life ?? 1;
    p.grav = o.grav ?? -14;
    p.drag = o.drag ?? 0.6;
    p.ground = o.ground ?? -Infinity;
    p.bounce = o.bounce ?? 0.35;
    p.grow = o.grow ?? 0; // scale multiplier growth per second
    p.fadeIn = o.fadeIn ?? 0;
    p.flutter = o.flutter ?? 0;
    p.shrinkStart = o.shrinkStart ?? 0.65;
    _c.setHex(o.color ?? 0xffffff);
    p.r = _c.r; p.g = _c.g; p.b = _c.b;
    p.k = o.k ?? 1;
    this.list.push(p);
    return p;
  }
  update(dt) {
    const list = this.list;
    // idle layer: nothing to simulate or upload, and no draw call (or shadow draw) at all
    if (!list.length) {
      if (this.mesh.count || this.mesh.visible) { this.mesh.count = 0; this.mesh.visible = false; }
      return;
    }
    this.mesh.visible = true;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.free.push(p);
        continue;
      }
      const dragK = Math.exp(-p.drag * dt);
      p.vx *= dragK; p.vy *= dragK; p.vz *= dragK;
      p.vy += p.grav * dt;
      if (p.flutter) {
        const f = Math.sin(p.life * 7 + p.rx * 3) * p.flutter;
        p.vx += f * dt * 4;
        p.rvx = Math.sin(p.life * 5 + p.ry) * 6;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.rvx * dt; p.ry += p.rvy * dt; p.rz += p.rvz * dt;
      if (p.y < p.ground + p.sy * 0.5) {
        p.y = p.ground + p.sy * 0.5;
        if (p.bounce > 0 && Math.abs(p.vy) > 0.6) {
          p.vy = -p.vy * p.bounce;
          p.vx *= 0.7; p.vz *= 0.7;
          p.rvx *= 0.6; p.rvy *= 0.6; p.rvz *= 0.6;
        } else {
          p.vy = 0; p.vx *= 0.85; p.vz *= 0.85;
          p.rvx *= 0.8; p.rvy *= 0.8; p.rvz *= 0.8;
          if (p.flutter) { p.flutter = 0; p.rx = 0; p.rz = 0; }
        }
      }
      list[w++] = p;
    }
    list.length = w;
    const mesh = this.mesh;
    const col = mesh.instanceColor.array;
    for (let i = 0; i < w; i++) {
      const p = list[i];
      const t = p.life / p.max;
      let k = 1 + p.grow * p.life;
      if (t > p.shrinkStart) k *= 1 - (t - p.shrinkStart) / (1 - p.shrinkStart);
      if (p.fadeIn && p.life < p.fadeIn) k *= p.life / p.fadeIn;
      k *= p.k;
      _e.set(p.rx, p.ry, p.rz);
      _q.setFromEuler(_e);
      _p.set(p.x, p.y, p.z);
      _s.set(p.sx * k + 1e-5, p.sy * k + 1e-5, p.sz * k + 1e-5);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
    }
    mesh.count = w;
    mesh.visible = w > 0;
    // upload only the live instances, not the whole capacity (3500 matrices = 224 KB)
    if (w > 0) {
      const im = mesh.instanceMatrix, ic = mesh.instanceColor;
      im.clearUpdateRanges();
      im.addUpdateRange(0, w * 16);
      im.needsUpdate = true;
      ic.clearUpdateRanges();
      ic.addUpdateRange(0, w * 3);
      ic.needsUpdate = true;
    }
  }
  clear() {
    for (const p of this.list) this.free.push(p);
    this.list.length = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
}

class Particles {
  constructor() {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.layers = {
      cube: new Layer(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), 3500),
      glow: new Layer(
        box,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
        1500,
      ),
      bubble: new Layer(
        new THREE.IcosahedronGeometry(0.5, 1),
        new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, shininess: 90, specular: 0xffffff, depthWrite: false }),
        700,
      ),
    };
    this.layers.cube.mesh.castShadow = true;
    this.group = new THREE.Group();
    this.group.name = 'particles';
    for (const l of Object.values(this.layers)) this.group.add(l.mesh);
    this.rings = [];
  }
  attach(scene) {
    if (this.group.parent) this.group.parent.remove(this.group);
    if (scene) scene.add(this.group);
    this.scene = scene;
  }
  spawn(layer, o) {
    return this.layers[layer].spawn(o);
  }
  update(dt) {
    for (const l of Object.values(this.layers)) l.update(dt);
  }
  clear() {
    for (const l of Object.values(this.layers)) l.clear();
  }
  get count() {
    let n = 0;
    for (const l of Object.values(this.layers)) n += l.list.length;
    return n;
  }
}

export const particles = new Particles();

// ---------------------------------------------------------------------------
// Effect presets

const BILL_COLORS = [0x3fbf4f, 0x52cc5e, 0x2f9e3f, 0x6fdc7a];
const CONFETTI = [0xff2e88, 0x29b6f6, 0xffd23f, 0x7cff6b, 0xb05cff, 0xff8a2a, 0xffffff];
const CHOCO = [0x5a3220, 0x6e3e26, 0x7d4a2d, 0x4a2818];
const WRAPPERS = [0x1d9bf0, 0xff4fa3, 0xffd23f, 0xc0c8d8, 0xff7b29];
const FOODS = [0xe0392b, 0xffd23f, 0xf5f5f0, 0x7ac74f, 0xff9a3c, 0xc0392b, 0x8e5a3c, 0xf7c873, 0x3c9a3f];

function dir3(spread = 1, up = 1) {
  const a = rand(0, TAU);
  const r = Math.sqrt(Math.random()) * spread;
  return [Math.cos(a) * r, up * rand(0.6, 1.2), Math.sin(a) * r];
}

export const fx = {
  /** Generic burst. */
  burst(pos, o = {}) {
    const n = o.count ?? 16;
    const layer = o.layer ?? 'cube';
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = dir3(o.spread ?? 1, o.up ?? 1);
      const sp = (o.speed ?? 4) * rand(0.5, 1.2);
      const size = (o.size ?? 0.1) * rand(0.6, 1.3);
      particles.spawn(layer, {
        x: pos.x + rand(-1, 1) * (o.jitter ?? 0.05),
        y: pos.y + rand(-1, 1) * (o.jitter ?? 0.05),
        z: pos.z + rand(-1, 1) * (o.jitter ?? 0.05),
        vx: dx * sp + (o.vx ?? 0), vy: dy * sp + (o.vy ?? 0), vz: dz * sp * (o.zScale ?? 1) + (o.vz ?? 0),
        rvx: rand(-8, 8), rvy: rand(-8, 8), rvz: rand(-8, 8),
        size, life: (o.life ?? 0.9) * rand(0.7, 1.3),
        grav: o.grav ?? -14, drag: o.drag ?? 0.8,
        ground: o.ground ?? 0, bounce: o.bounce ?? 0.35,
        color: Array.isArray(o.colors) ? pick(o.colors) : o.color ?? 0xffffff,
        grow: o.grow ?? 0, flutter: o.flutter ?? 0,
      });
    }
  },

  /** Shatter a voxel mesh into flying cubes (voxel destruction). */
  shatter(mesh, o = {}) {
    const voxels = mesh.geometry?.userData?.voxels;
    if (!voxels) return;
    mesh.updateMatrixWorld(true);
    const m = mesh.matrixWorld;
    const vsz = (mesh.geometry.userData.voxelSize || 0.1) * mesh.getWorldScale(_s).x;
    const center = new THREE.Vector3();
    mesh.getWorldPosition(center);
    const frac = o.fraction ?? 1;
    const force = o.force ?? 5;
    const dirX = o.dirX ?? 0;
    for (const v of voxels) {
      if (Math.random() > frac) continue;
      _p.set(v[0], v[1], v[2]).applyMatrix4(m);
      const dx = _p.x - center.x, dy = _p.y - center.y + 0.3, dz = _p.z - center.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      particles.spawn('cube', {
        x: _p.x, y: _p.y, z: _p.z,
        vx: (dx / len) * force * rand(0.4, 1.2) + dirX * force * 0.6,
        vy: (dy / len) * force * rand(0.5, 1.3) + force * 0.5,
        vz: (dz / len) * force * rand(0.4, 1.2),
        rvx: rand(-10, 10), rvy: rand(-10, 10), rvz: rand(-10, 10),
        size: vsz * rand(0.85, 1.1), life: (o.life ?? 1.6) * rand(0.7, 1.3),
        grav: -16, drag: 0.4, ground: o.ground ?? 0, bounce: 0.4,
        color: v[3], shrinkStart: 0.75,
      });
    }
  },

  /** Cash explosion: fluttering bills + gold coins. */
  cash(pos, n = 40, o = {}) {
    for (let i = 0; i < n; i++) {
      const isCoin = Math.random() < (o.coinRatio ?? 0.3);
      const [dx, dy, dz] = dir3(o.spread ?? 1.2, 1);
      const sp = (o.speed ?? 7) * rand(0.5, 1.2);
      const scale = o.scale ?? 1;
      particles.spawn('cube', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dx * sp, vy: dy * sp * 1.1, vz: dz * sp * (o.zScale ?? 0.7),
        rvx: rand(-6, 6), rvy: rand(-6, 6), rvz: rand(-6, 6),
        sx: (isCoin ? 0.12 : 0.26) * scale, sy: (isCoin ? 0.12 : 0.012) * scale, sz: (isCoin ? 0.03 : 0.12) * scale,
        life: rand(1.6, 2.8) * (o.life ?? 1), grav: isCoin ? -14 : -4.5, drag: isCoin ? 0.5 : 2.2,
        ground: o.ground ?? 0, bounce: isCoin ? 0.5 : 0, flutter: isCoin ? 0 : 1.2,
        color: isCoin ? pick([0xffd23f, 0xffc21a, 0xffe27a]) : pick(BILL_COLORS),
      });
    }
    fx.sparkle(pos, { count: Math.floor(n / 3), color: 0xfff27a });
  },

  coins(pos, n = 12, o = {}) {
    fx.burst(pos, { count: n, colors: [0xffd23f, 0xffc21a, 0xffe27a], size: 0.1, speed: 5, ground: o.ground ?? 0, bounce: 0.5, life: 1.2 });
  },

  sparkle(pos, o = {}) {
    const n = o.count ?? 12;
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = dir3(1, rand(-1, 1));
      const sp = (o.speed ?? 3) * rand(0.3, 1);
      particles.spawn('glow', {
        x: pos.x + rand(-0.2, 0.2) * (o.radius ?? 1), y: pos.y + rand(-0.2, 0.2) * (o.radius ?? 1), z: pos.z + rand(-0.2, 0.2) * (o.radius ?? 1),
        vx: dx * sp, vy: dy * sp, vz: dz * sp,
        rvx: rand(-6, 6), rvy: rand(-6, 6),
        size: (o.size ?? 0.07) * rand(0.6, 1.4), life: (o.life ?? 0.6) * rand(0.6, 1.4),
        grav: o.grav ?? 0, drag: 2,
        color: Array.isArray(o.colors) ? pick(o.colors) : o.color ?? 0xffffff,
      });
    }
  },

  bubbles(pos, o = {}) {
    const n = o.count ?? 8;
    for (let i = 0; i < n; i++) {
      particles.spawn('bubble', {
        x: pos.x + rand(-1, 1) * (o.radius ?? 0.2), y: pos.y + rand(-0.1, 0.1), z: pos.z + rand(-1, 1) * (o.radius ?? 0.2),
        vx: rand(-0.2, 0.2), vy: rand(0.6, 1.6) * (o.speed ?? 1), vz: rand(-0.2, 0.2),
        size: (o.size ?? 0.09) * rand(0.5, 1.4), life: (o.life ?? 1.4) * rand(0.6, 1.3),
        grav: o.grav ?? 2.5, drag: 1.5, flutter: 0.15, shrinkStart: 0.85,
        color: o.color ?? 0xbfefff,
      });
    }
  },

  foam(pos, o = {}) {
    const n = o.count ?? 50;
    const colors = o.colors ?? [0xffffff, 0xf2fbff, 0xe4f6ff, o.color ?? 0x9ff2ff];
    for (let i = 0; i < n; i++) {
      const [dx, , dz] = dir3(o.spread ?? 0.5, 1);
      particles.spawn(i % 3 === 0 ? 'bubble' : 'cube', {
        x: pos.x + dx * 0.1, y: pos.y, z: pos.z + dz * 0.1,
        vx: dx * (o.speed ?? 3), vy: rand(4, 9) * (o.power ?? 1), vz: dz * (o.speed ?? 3),
        rvx: rand(-5, 5), rvz: rand(-5, 5),
        size: rand(0.08, 0.2) * (o.scale ?? 1), life: rand(0.8, 1.6),
        grav: -12, drag: 1.2, ground: o.ground ?? -10, bounce: 0.1,
        color: pick(colors),
      });
    }
  },

  slime(pos, o = {}) {
    const n = o.count ?? 18;
    const c = o.color ?? 0x7cff3a;
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = dir3(o.spread ?? 1, 1);
      const sp = (o.speed ?? 4) * rand(0.4, 1.1);
      particles.spawn('cube', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dx * sp, vy: dy * sp, vz: dz * sp * 0.6,
        size: rand(0.06, 0.16) * (o.scale ?? 1), sy: rand(0.04, 0.1) * (o.scale ?? 1),
        life: rand(1.2, 2.2), grav: -18, drag: 0.3, ground: o.ground ?? 0, bounce: 0,
        color: Math.random() < 0.3 ? 0xd4ff9a : c, shrinkStart: 0.8,
      });
    }
  },

  smoke(pos, o = {}) {
    const n = o.count ?? 8;
    for (let i = 0; i < n; i++) {
      particles.spawn('cube', {
        x: pos.x + rand(-0.3, 0.3) * (o.radius ?? 1), y: pos.y + rand(0, 0.2), z: pos.z + rand(-0.3, 0.3) * (o.radius ?? 1),
        vx: rand(-0.6, 0.6), vy: rand(0.6, 1.6) * (o.rise ?? 1), vz: rand(-0.4, 0.4),
        rvx: rand(-1, 1), rvy: rand(-1, 1),
        size: rand(0.15, 0.3) * (o.scale ?? 1), grow: 1.2, life: rand(0.8, 1.5) * (o.life ?? 1),
        grav: 0.5, drag: 1.4, shrinkStart: 0.5, fadeIn: 0.1,
        color: o.color ?? pick([0x9aa0aa, 0xb8bec8, 0x80868f]),
      });
    }
  },

  dust(pos, o = {}) {
    const n = o.count ?? 5;
    for (let i = 0; i < n; i++) {
      particles.spawn('cube', {
        x: pos.x + rand(-0.15, 0.15), y: pos.y + 0.05, z: pos.z + rand(-0.15, 0.15),
        vx: rand(-1, 1) + (o.vx ?? 0), vy: rand(0.3, 1.2), vz: rand(-0.5, 0.5),
        size: rand(0.05, 0.11) * (o.scale ?? 1), grow: 1, life: rand(0.3, 0.6),
        grav: 0, drag: 3, color: o.color ?? pick([0xd8c4a0, 0xc8b28a, 0xe8dcc0]),
      });
    }
  },

  confetti(pos, o = {}) {
    const n = o.count ?? 60;
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = dir3(o.spread ?? 1.4, 1);
      const sp = (o.speed ?? 8) * rand(0.5, 1.2);
      particles.spawn('cube', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dx * sp, vy: dy * sp, vz: dz * sp * (o.zScale ?? 0.5),
        sx: 0.09, sy: 0.01, sz: 0.06, life: rand(2, 3.5), grav: -3.5, drag: 2, flutter: 1.5,
        ground: o.ground ?? 0, bounce: 0, color: pick(o.colors ?? CONFETTI),
      });
    }
  },

  chocolate(pos, o = {}) {
    const n = o.count ?? 22;
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = dir3(o.spread ?? 1, 1);
      const sp = (o.speed ?? 5) * rand(0.4, 1.2);
      const wrapper = Math.random() < 0.28;
      particles.spawn('cube', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dx * sp, vy: dy * sp, vz: dz * sp * 0.6,
        rvx: rand(-8, 8), rvy: rand(-8, 8), rvz: rand(-8, 8),
        sx: wrapper ? 0.14 : rand(0.06, 0.15), sy: wrapper ? 0.01 : rand(0.05, 0.12), sz: wrapper ? 0.1 : rand(0.06, 0.15),
        life: rand(1, 1.8), grav: wrapper ? -4 : -16, drag: wrapper ? 2 : 0.4,
        flutter: wrapper ? 1 : 0, ground: o.ground ?? 0, bounce: wrapper ? 0 : 0.15,
        color: wrapper ? pick(WRAPPERS) : pick(CHOCO),
      });
    }
  },

  groceries(pos, o = {}) {
    const n = o.count ?? 14;
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = dir3(o.spread ?? 1.2, 1);
      const sp = (o.speed ?? 6) * rand(0.5, 1.2);
      const s = rand(0.1, 0.22);
      particles.spawn('cube', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dx * sp, vy: dy * sp, vz: dz * sp * 0.7,
        rvx: rand(-9, 9), rvy: rand(-9, 9), rvz: rand(-9, 9),
        sx: s, sy: s * rand(0.8, 1.8), sz: s * rand(0.7, 1),
        life: rand(1.6, 2.6), grav: -16, drag: 0.3, ground: o.ground ?? 0, bounce: 0.45,
        color: pick(FOODS),
      });
    }
  },

  fire(pos, o = {}) {
    const n = o.count ?? 10;
    for (let i = 0; i < n; i++) {
      particles.spawn('glow', {
        x: pos.x + rand(-0.2, 0.2) * (o.radius ?? 1), y: pos.y, z: pos.z + rand(-0.2, 0.2) * (o.radius ?? 1),
        vx: rand(-0.4, 0.4), vy: rand(1.5, 3), vz: rand(-0.3, 0.3),
        size: rand(0.08, 0.18) * (o.scale ?? 1), life: rand(0.3, 0.7), grav: 1, drag: 1,
        color: pick([0xff5a1f, 0xffa31a, 0xffe14a]),
      });
    }
  },

  /** Rising energy column (heal / buff). */
  rise(pos, o = {}) {
    const n = o.count ?? 14;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), r = rand(0.1, o.radius ?? 0.5);
      particles.spawn('glow', {
        x: pos.x + Math.cos(a) * r, y: pos.y + rand(0, 0.4), z: pos.z + Math.sin(a) * r,
        vx: 0, vy: rand(1.2, 2.8), vz: 0,
        size: rand(0.05, 0.11), life: rand(0.5, 1), grav: 0, drag: 0.5,
        color: Array.isArray(o.colors) ? pick(o.colors) : o.color ?? 0x7cff6b,
      });
    }
  },

  /** Expanding flat shockwave ring. */
  shockwave(pos, o = {}) {
    const scene = particles.scene;
    if (!scene) return;
    const geo = new THREE.RingGeometry(0.75, 1, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: o.color ?? 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, (pos.y ?? 0) + 0.05, pos.z);
    scene.add(ring);
    const R = o.radius ?? 3;
    animate(o.dur ?? 0.45, (e) => {
      const s = 0.1 + e * R;
      ring.scale.set(s, s, s);
      mat.opacity = 0.85 * (1 - e);
    }, { ease: 'outCubic', onComplete: () => { scene.remove(ring); geo.dispose(); mat.dispose(); } });
  },

  /** Big impact = shockwave + debris + dust. */
  impact(pos, o = {}) {
    fx.shockwave(pos, { radius: o.radius ?? 2.5, color: o.color ?? 0xffffff });
    fx.burst(pos, { count: o.count ?? 18, colors: o.colors ?? [0xd8c4a0, 0xb89a70, 0x8a7050], speed: 6, size: 0.12, ground: pos.y });
    fx.smoke(pos, { count: 6, scale: 1.2 });
  },
};
