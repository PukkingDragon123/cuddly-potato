// Ambient life: pond ducks, butterflies, pigeons/seagulls that scatter when you
// run at them, and fish jumping out of the sea.
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry } from '../../core/voxel.js';
import { fx } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { rand, pick, damp } from '../../core/util.js';
import { floatText, speech } from '../../ui/ui.js';
import { pickProxy } from './kit.js';
import { POND } from './zones/park.js';

const _v = new THREE.Vector3();

export function buildCritters(A) {
  ducks(A);
  butterflies(A);
  birds(A, [[-2.5, 41], [3, 36], [-6, 46], [5.5, 45], [1, 30.6]], 'pigeon');
  birds(A, [[0.4, 60], [-0.6, 63.5], [2.4, 65], [-2.2, 64.8]], 'gull');
  birds(A, [[-30, 22.5], [-44, 40.6], [8, -10], [-10, 5]], 'pigeon');
  fish(A);
}

// ---------------------------------------------------------------------------

function duckGeo() {
  return cachedGeometry('arena:duck', () => {
    const g = new VoxGrid();
    g.ellipsoid(0, 2, 0, 2.5, 1.8, 3.5, 0xffffff);
    g.box(-1, 3, 2, 1, 6, 4, 0xffffff);
    g.box(-1, 4, 5, 1, 4, 6, 0xff9a1a);
    g.set(-2, 5, 3, 0x15121f);
    g.set(2, 5, 3, 0x15121f);
    g.box(-1, 3, -4, 1, 4, -4, 0xf0f0f0);
    g.carve((x, y) => y < 0);
    return g;
  }, { scale: 0.08 });
}

function ducks(A) {
  const list = [];
  for (let i = 0; i < 4; i++) {
    const m = makeMesh(duckGeo());
    m.castShadow = false;
    if (i === 3) m.scale.setScalar(0.6); // duckling
    A.scene.add(m);
    const proxy = pickProxy(0.4, 0.6);
    m.add(proxy);
    const d = { m, a: (i / 4) * Math.PI * 2, r: rand(1.6, 3.4), sp: rand(0.25, 0.4) * (i % 2 ? 1 : -1), flee: 0, quackT: 0 };
    list.push(d);
    A.interact({
      id: 'duck' + i, pos: m.position, range: 2.6, label: 'QUACK', icon: 'heart', color: 'yellow', hit: proxy, ringR: 0.4, noRing: true, face: true,
      act: () => quack(d, true),
    });
  }
  const quack = (d, forced) => {
    if (d.quackT > 0 && !forced) return;
    d.quackT = 1.5;
    audio.play('squeak', { pitch: rand(0.45, 0.6), vol: 0.8 });
    floatText(_v.set(d.m.position.x, 0.8, d.m.position.z), pick(['Quack!', 'QUACK', 'quack?']), 'info', { life: 0.8, rise: 30 });
    d.flee = 1.5;
    fx.bubbles(d.m.position, { count: 4, radius: 0.3 });
  };
  A.onUpdate((dt, t) => {
    const p = A.player.pos;
    for (const d of list) {
      d.quackT -= dt;
      d.flee = Math.max(0, d.flee - dt);
      const near = Math.hypot(p.x - d.m.position.x, p.z - d.m.position.z) < 2.6;
      if (near) quack(d);
      d.a += dt * d.sp * (1 + d.flee * 3);
      const x = POND.x + Math.cos(d.a) * d.r, z = POND.z + Math.sin(d.a) * d.r * 0.85;
      d.m.position.set(x, -0.3 + Math.sin(t * 3 + d.a) * 0.03, z);
      d.m.rotation.y = -d.a + (d.sp > 0 ? 0 : Math.PI);
      d.m.rotation.z = Math.sin(t * 4 + d.a) * 0.08;
    }
  }, POND.x, POND.z, 30);
}

// ---------------------------------------------------------------------------

function butterflyGeo(col) {
  return cachedGeometry('arena:butterfly' + col, () => {
    const g = new VoxGrid();
    g.box(0, 0, -1, 0, 0, 1, 0x15121f);
    g.box(-3, 0, -1, -1, 0, 2, col);
    g.box(1, 0, -1, 3, 0, 2, col);
    g.box(-2, 0, -2, -1, 0, -2, col);
    g.box(1, 0, -2, 2, 0, -2, col);
    g.set(-2, 0, 1, 0xffffff);
    g.set(2, 0, 1, 0xffffff);
    return g;
  }, { scale: 0.06, pivot: 'center' });
}

function butterflies(A) {
  const spots = [[-3.5, 3.5], [3.5, 3.5], [-6.3, 27.4], [6.3, 27.4], [-11, -3], [-12.5, 38.5], [-44.5, -8], [-36.5, -2.5], [6, 8], [-3, 50], [-31.5, 32], [11, -18]];
  const cols = [0xff4fa3, 0xffd23f, 0x29b6f6, 0xffffff, 0xff8a2a, 0xb05cff];
  spots.forEach(([x, z], i) => {
    const m = makeMesh(butterflyGeo(cols[i % cols.length]));
    m.castShadow = false;
    A.scene.add(m);
    const s = { x, z, ph: rand(0, 6), fl: 0, ox: 0, oz: 0 };
    A.onUpdate((dt, t) => {
      const p = A.player.pos;
      const d = Math.hypot(p.x - (s.x + s.ox), p.z - (s.z + s.oz));
      if (d < 1.6 && A.player.speed > 2) s.fl = 1;
      s.fl = Math.max(0, s.fl - dt * 0.4);
      const k = t * 0.9 + s.ph;
      s.ox = Math.sin(k * 1.3) * 1.1 + Math.sin(k * 0.4) * 0.6;
      s.oz = Math.cos(k * 1.1) * 0.9;
      const y = 0.8 + Math.sin(k * 2.2) * 0.3 + s.fl * 2.5;
      m.position.set(s.x + s.ox, y, s.z + s.oz);
      m.rotation.y = Math.atan2(Math.cos(k * 1.3) * 1.43, -Math.sin(k * 1.1) * 0.99);
      m.scale.x = 0.25 + Math.abs(Math.sin(t * 16 + s.ph)) * 0.75;
    }, x, z, 24);
  });
}

// ---------------------------------------------------------------------------

function birdGeo(kind) {
  return cachedGeometry('arena:bird' + kind, () => {
    const g = new VoxGrid();
    const body = kind === 'gull' ? 0xffffff : 0x8a93b8, wing = kind === 'gull' ? 0xc8ccd8 : 0x6a7290, beak = kind === 'gull' ? 0xffd23f : 0x3a3f50;
    g.ellipsoid(0, 3, 0, 1.6, 1.5, 2.5, body);
    g.box(-1, 4, 2, 0, 6, 3, kind === 'gull' ? 0xffffff : 0x5a8a7a);
    g.set(-1, 5, 4, beak);
    g.set(0, 5, 4, beak);
    g.box(-2, 3, -1, -2, 4, 1, wing);
    g.box(1, 3, -1, 1, 4, 1, wing);
    g.box(-1, 2, -4, 0, 3, -3, wing);
    g.set(-1, 0, 0, 0xff9a1a);
    g.set(0, 0, 0, 0xff9a1a);
    g.set(-2, 6, 3, 0x15121f);
    g.set(1, 6, 3, 0x15121f);
    return g;
  }, { scale: 0.07 });
}

function birds(A, spots, kind) {
  for (const [x, z] of spots) {
    const m = makeMesh(birdGeo(kind));
    m.castShadow = false;
    A.scene.add(m);
    const y0 = Math.max(0, A.terrain.heightAt(x, z));
    const s = { x, z, y: y0, state: 'idle', t: rand(0, 3), vx: 0, vz: 0, vy: 0, hop: 0, yaw: rand(0, 6) };
    m.position.set(x, y0, z);
    A.onUpdate((dt, t) => {
      const p = A.player.pos;
      s.t -= dt;
      if (s.state === 'idle') {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if ((d < 2.2 && A.player.speed > 1.5) || d < 1) {
          s.state = 'fly';
          s.t = 7;
          const a = Math.atan2(s.x - p.x, s.z - p.z) + rand(-0.6, 0.6);
          s.vx = Math.sin(a) * 4;
          s.vz = Math.cos(a) * 4;
          s.vy = 3.2;
          s.yaw = a;
          audio.play(kind === 'gull' ? 'squeak' : 'swing', { pitch: kind === 'gull' ? 0.9 : 1.6, vol: 0.4 });
          fx.burst(_v.set(s.x, s.y + 0.3, s.z), { count: 3, colors: kind === 'gull' ? [0xffffff] : [0x8a93b8, 0xc8ccd8], speed: 1.5, size: 0.05, grav: -2, life: 1.2, flutter: 1 });
        } else {
          // peck & hop
          if (s.t <= 0) {
            s.t = rand(0.6, 2.2);
            if (Math.random() < 0.4) {
              s.hop = 0.25;
              s.yaw += rand(-1.2, 1.2);
              const nx = s.x + Math.sin(s.yaw) * 0.3, nz = s.z + Math.cos(s.yaw) * 0.3;
              if (A.terrain.walkable(nx, nz) && Math.hypot(nx - x, nz - z) < 1.5) {
                s.x = nx;
                s.z = nz;
              }
            }
          }
          s.hop = Math.max(0, s.hop - dt);
          m.position.set(s.x, s.y + Math.sin((s.hop / 0.25) * Math.PI) * 0.12, s.z);
          m.rotation.y = s.yaw;
          m.rotation.x = Math.sin(t * 9 + x) > 0.7 ? 0.5 : 0; // peck
          m.scale.set(1, 1, 1);
        }
      } else if (s.state === 'fly') {
        s.vy = Math.max(1, s.vy - dt * 0.6);
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        const fy = m.position.y + s.vy * dt;
        m.position.set(s.x, fy, s.z);
        m.rotation.y = s.yaw;
        m.rotation.x = -0.3;
        m.scale.x = 1 + Math.abs(Math.sin(t * 22)) * 1.4;
        if (s.t <= 0) {
          // come back later
          s.state = 'idle';
          s.x = x;
          s.z = z;
          s.t = rand(1, 3);
          m.scale.set(1, 1, 1);
          m.rotation.x = 0;
          m.position.set(x, y0, z);
          s.y = y0;
          m.visible = Math.hypot(p.x - x, p.z - z) > 6;
          if (!m.visible) {
            s.state = 'wait';
            s.t = 4;
          }
        }
      } else if (s.state === 'wait') {
        if (s.t <= 0) {
          if (Math.hypot(p.x - x, p.z - z) > 6) {
            m.visible = true;
            s.state = 'idle';
          } else s.t = 2;
        }
      }
    }, x, z, 30);
  }
}

// ---------------------------------------------------------------------------

function fish(A) {
  const geo = cachedGeometry('arena:fish', () => {
    const g = new VoxGrid();
    g.ellipsoid(0, 2, 0, 1, 1.5, 3, 0xff8a2a);
    g.box(0, 1, -5, 0, 3, -4, 0xff8a2a);
    g.set(1, 3, 2, 0x15121f);
    g.set(-1, 3, 2, 0x15121f);
    return g;
  }, { scale: 0.08, pivot: 'center' });
  const m = makeMesh(geo);
  m.castShadow = false;
  m.visible = false;
  A.scene.add(m);
  const s = { t: 3, active: false, x: 0, z: 0, a: 0, u: 0 };
  A.onUpdate((dt) => {
    s.t -= dt;
    const p = A.player.pos;
    if (!s.active && s.t <= 0) {
      s.t = rand(3, 7);
      // pick a water spot near the player
      for (let k = 0; k < 8; k++) {
        const a = rand(0, Math.PI * 2), r = rand(5, 11);
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (A.terrain.heightAt(x, z) < -1.2) {
          s.active = true;
          s.x = x;
          s.z = z;
          s.a = rand(0, Math.PI * 2);
          s.u = 0;
          m.visible = true;
          fx.bubbles(_v.set(x, -0.5, z), { count: 6, color: 0xffffff });
          audio.play('slosh', { pitch: 1.6, vol: 0.4 });
          break;
        }
      }
    }
    if (s.active) {
      s.u += dt / 0.9;
      const u = s.u;
      const x = s.x + Math.sin(s.a) * u * 1.6, z = s.z + Math.cos(s.a) * u * 1.6;
      m.position.set(x, -0.55 + Math.sin(u * Math.PI) * 1.4, z);
      m.rotation.y = s.a;
      m.rotation.x = -Math.cos(u * Math.PI) * 1.1;
      if (u >= 1) {
        s.active = false;
        m.visible = false;
        fx.foam(_v.set(x, -0.55, z), { count: 10, power: 0.4, ground: -0.6 });
        audio.play('splat', { pitch: 1.8, vol: 0.4 });
      }
    }
  });
}
