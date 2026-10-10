// Shopping cart physics for Beast Mart: push by walking into them, rolling friction,
// caster alignment, spin, bounces off walls/shelves/each other, products knocked off
// shelves, smash on hard impacts (with respawn) and the Cart Corral return secret.
import * as THREE from 'three';
import { fx, particles } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { rand, pick, clamp } from '../../core/util.js';
import { floatText, speech } from '../../ui/ui.js';
import { state, stat } from '../../game/state.js';
import { prop, bboxSize, fit } from './kit.js';

const _v = new THREE.Vector3();
const _contacts = [];
const CART_R = 0.6;
const SMASH = 6.4;
const KNOCK = 2.6;

export class Carts {
  constructor(A, opts) {
    this.A = A;
    this.corral = opts.corral; // [x0,z0,x1,z1]
    this.spawns = opts.spawns;
    this.list = [];
    this.returned = 0;
  }

  add(x, z, ang = 0) {
    const p = prop('makeCart', []);
    const raw = p.raw;
    // normalise: long axis along +z, ~1.4 units long
    const holder = new THREE.Group();
    holder.add(p.root);
    const sz = bboxSize(p.root);
    let wheelAxis = 'x';
    if (sz.x > sz.z * 1.05) {
      p.root.rotation.y = Math.PI / 2;
      wheelAxis = 'z';
    }
    if (p.real) fit(holder, { max: 1.4, clamp: 1.2 });
    const root = new THREE.Group();
    root.add(holder);
    const body = raw.body ?? findVoxMesh(p.root);
    const wheels = raw.wheels ?? [];
    this.A.scene.add(root);
    const c = { root, model: p.root, body, wheels, wheelAxis, x, z, vx: 0, vz: 0, ang, angV: 0, r: CART_R, broken: false, parked: false, respawnT: 0, squeakT: 0, lastPush: 0, lastHit: 0, tilt: 0 };
    this.list.push(c);
    this.sync(c);
    return c;
  }

  sync(c) {
    c.root.position.set(c.x, Math.max(0, this.A.terrain.heightAt(c.x, c.z)), c.z);
    c.root.rotation.y = c.ang;
    c.root.rotation.z = c.tilt;
  }

  /** Player overlaps a cart -> push it (called right after the player moves). */
  pushFrom(pl) {
    const now = performance.now() / 1000;
    for (const c of this.list) {
      if (c.broken || c.parked) continue;
      const dx = c.x - pl.pos.x, dz = c.z - pl.pos.z;
      const R = c.r + pl.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d, ov = R - d;
      c.x += nx * ov * 0.85;
      c.z += nz * ov * 0.85;
      pl.pos.x -= nx * ov * 0.15;
      pl.pos.z -= nz * ov * 0.15;
      const vrel = (pl.vel.x - c.vx) * nx + (pl.vel.z - c.vz) * nz;
      if (vrel > 0) {
        const k = 1.45;
        c.vx += nx * vrel * k;
        c.vz += nz * vrel * k;
        const fx_ = Math.sin(c.ang), fz = Math.cos(c.ang);
        c.angV += (fx_ * nz - fz * nx) * vrel * 1.1;
        if (vrel > 1.5 && now - c.lastPush > 0.3) {
          c.lastPush = now;
          audio.play('squeak', { pitch: rand(0.85, 1.15) });
          if (vrel > 5) audio.play('whoosh', { pitch: 1.4, vol: 0.6 });
        }
      } else if (vrel < -4.5 && now - c.lastHit > 0.8) {
        // the cart ran into the player!
        c.lastHit = now;
        pl.vel.x -= nx * 5;
        pl.vel.z -= nz * 5;
        pl.chibi.play('hit');
        pl.chibi.expr('dizzy', 'wobble', 1);
        audio.play('boing');
        speech(pl.chibi, pick(['OOF!', 'Runaway cart!', 'Ow, my shins!']), 1.2);
      }
    }
  }

  update(dt) {
    const A = this.A;
    const list = this.list;
    for (const c of list) {
      if (c.broken) {
        c.respawnT -= dt;
        if (c.respawnT <= 0) this.respawn(c);
        continue;
      }
      if (c.parked) {
        c.parkT -= dt;
        c.x += (c.parkX - c.x) * Math.min(1, dt * 4);
        c.z += (c.parkZ - c.z) * Math.min(1, dt * 4);
        c.ang += (c.parkAng - c.ang) * Math.min(1, dt * 5);
        this.sync(c);
        if (c.parkT <= 0) this.respawn(c);
        continue;
      }
      let speed = Math.hypot(c.vx, c.vz);
      if (speed < 0.02 && Math.abs(c.angV) < 0.02) {
        c.vx = c.vz = c.angV = 0;
        c.tilt *= 0.9;
        this.sync(c);
        continue;
      }
      // rolling friction + caster alignment (lateral slip is damped harder)
      const fr = Math.exp(-0.55 * dt);
      const fwx = Math.sin(c.ang), fwz = Math.cos(c.ang);
      let vf = c.vx * fwx + c.vz * fwz;
      let lx = c.vx - fwx * vf, lz = c.vz - fwz * vf;
      const lat = Math.exp(-2.2 * dt);
      c.vx = (fwx * vf + lx * lat) * fr;
      c.vz = (fwz * vf + lz * lat) * fr;
      speed = Math.hypot(c.vx, c.vz);
      if (speed > 0.3) {
        let target = Math.atan2(c.vx, c.vz);
        let diff = wrap(target - c.ang);
        if (Math.abs(diff) > Math.PI / 2) diff = wrap(diff + Math.PI);
        c.ang += diff * Math.min(1, dt * speed * 0.9);
      }
      c.ang += c.angV * dt;
      c.angV *= Math.exp(-2.4 * dt);
      // integrate with substeps
      const steps = Math.max(1, Math.ceil((speed * dt) / 0.25));
      for (let s = 0; s < steps; s++) {
        c.x += (c.vx * dt) / steps;
        c.z += (c.vz * dt) / steps;
        const pos = _v.set(c.x, 0, c.z);
        A.world.resolve(pos, c.r, 'cart', _contacts);
        c.x = pos.x;
        c.z = pos.z;
        for (const ct of _contacts) {
          const vn = c.vx * ct.nx + c.vz * ct.nz;
          if (vn >= 0) continue;
          const impact = -vn;
          const bounce = ct.c?.bounce ?? 0.45;
          c.vx -= (1 + bounce) * vn * ct.nx;
          c.vz -= (1 + bounce) * vn * ct.nz;
          c.angV += (Math.random() < 0.5 ? -1 : 1) * impact * 0.7;
          this.impact(c, ct, impact);
          if (c.broken) break;
        }
        if (c.broken) break;
      }
      if (c.broken) continue;
      // carts vs NPCs (they jump out of the way, sort of)
      for (const n of A.npcs) {
        const dx = c.x - n.pos.x, dz = c.z - n.pos.z;
        const R = c.r + n.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        c.x += nx * (R - d);
        c.z += nz * (R - d);
        const vn = c.vx * nx + c.vz * nz;
        if (vn < 0) {
          c.vx -= 1.5 * vn * nx;
          c.vz -= 1.5 * vn * nz;
          if (-vn > 2 && !n.busy) {
            n.chibi.play('shocked');
            n.chibi.expr('shock', 'o', 1);
            if (Math.random() < 0.6) n.say(pick(['Hey! Watch the cart!', 'AAAH!', 'Cart crossing!', 'Not again...']), 1.4);
            audio.play('boing', { pitch: 1.3 });
          }
        }
      }
      // wheels & squeak
      const dist = Math.hypot(c.vx, c.vz) * dt;
      for (const w of c.wheels) w.rotation[c.wheelAxis] += dist / 0.08;
      c.squeakT -= dt;
      if (speed > 2.5 && c.squeakT <= 0) {
        c.squeakT = clamp(1.4 / speed, 0.12, 0.5);
        const near = A.player.pos.distanceTo(c.root.position);
        if (near < 14) audio.play('squeak', { pitch: 0.8 + speed * 0.06 + rand(-0.05, 0.05), vol: 0.35, gap: 0.08 });
      }
      c.tilt = Math.sin(performance.now() * 0.03) * Math.min(0.06, speed * 0.008);
      if (speed > 5 && Math.random() < dt * 20) fx.dust(_v.set(c.x, 0, c.z), { count: 1, color: 0xffffff });
      this.sync(c);
      // corral
      const k = this.corral;
      if (k && speed < 4.5 && c.x > k[0] && c.x < k[2] && c.z > k[1] && c.z < k[3]) this.park(c);
    }
    // cart vs cart
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.broken || a.parked) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.broken || b.parked) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const R = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d, ov = (R - d) / 2;
        a.x -= nx * ov;
        a.z -= nz * ov;
        b.x += nx * ov;
        b.z += nz * ov;
        const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vrel > 0) {
          const e = 0.75;
          const jimp = ((1 + e) * vrel) / 2;
          a.vx -= jimp * nx;
          a.vz -= jimp * nz;
          b.vx += jimp * nx;
          b.vz += jimp * nz;
          a.angV += rand(-1, 1) * vrel;
          b.angV += rand(-1, 1) * vrel;
          if (vrel > 1.5) {
            audio.play('hit', { pitch: rand(1.3, 1.6), vol: Math.min(1, vrel / 6) });
            fx.sparkle(_v.set((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2), { count: 4, color: 0xffffff, speed: 2 });
          }
        }
        this.sync(a);
        this.sync(b);
      }
    }
  }

  impact(c, ct, impact) {
    const A = this.A;
    const px = c.x - ct.nx * c.r, pz = c.z - ct.nz * c.r;
    if (impact > 1.6) {
      audio.play('thud', { pitch: rand(1.2, 1.6), vol: Math.min(1, impact / 7) });
      fx.dust(_v.set(px, 0.2, pz), { count: 3, color: 0xffffff });
    }
    const tag = ct.c?.tag;
    if (tag === 'shelf' && impact > KNOCK && ct.c.data?.knock) {
      ct.c.data.knock(px, pz, impact);
      A.engineShake(Math.min(0.3, impact * 0.03));
    }
    if (impact > SMASH && tag !== 'soft') this.smash(c, impact, ct);
  }

  smash(c, impact, ct) {
    const A = this.A;
    c.broken = true;
    c.respawnT = 6;
    c.root.visible = false;
    const pos = _v.set(c.x, 0.6, c.z);
    if (c.body?.geometry?.userData?.voxels) fx.shatter(c.body, { force: 5 + impact * 0.3, ground: 0, dirX: ct.nx });
    else fx.burst(pos, { count: 40, colors: [0xc8ccd8, 0x9aa2b4, 0xe8343c, 0x2a2a30], speed: 7, size: 0.1, ground: 0 });
    fx.burst(pos, { count: 10, colors: [0x2a2a30], speed: 6, size: 0.12, ground: 0 });
    fx.smoke(pos, { count: 6 });
    fx.shockwave(pos, { radius: 2 });
    audio.play('crunch');
    audio.play('shatter');
    audio.play('hitHeavy', { pitch: 0.8 });
    A.engineShake(0.4);
    stat('cartsSmashed');
    state.save();
    const n = state.p.stats.cartsSmashed;
    floatText(_v.set(c.x, 1.6, c.z), 'SMASHED!', 'crit');
    setTimeout(() => floatText(new THREE.Vector3(c.x, 1.6, c.z), `Carts smashed: ${n}`, 'info', { life: 1.4 }), 350);
    A.hud.refreshQuests();
    this.A.onCartSmashed?.(c);
  }

  park(c) {
    const k = this.corral;
    c.parked = true;
    c.parkT = 5;
    c.vx = c.vz = c.angV = 0;
    this.returned++;
    const slot = (this.returned % 3) - 1;
    c.parkX = (k[0] + k[2]) / 2;
    c.parkZ = (k[1] + k[3]) / 2 + slot * 0.25;
    c.parkAng = Math.PI;
    audio.play('coin');
    if (!this.A.secret('cartReturn', new THREE.Vector3(c.x, 1.2, c.z))) {
      floatText(_v.set(c.x, 1.6, c.z), '+1 Good Citizen', 'info');
      fx.sparkle(_v.set(c.x, 1, c.z), { count: 10, color: 0x7cff6b });
    }
  }

  respawn(c) {
    const [x, z, ang] = pick(this.spawns);
    // avoid stacking on another cart
    let ox = 0;
    for (const o of this.list) if (o !== c && !o.broken && Math.hypot(o.x - x, o.z - z) < 1.3) ox += 1.4;
    c.x = x + ox;
    c.z = z;
    c.ang = ang ?? 0;
    c.vx = c.vz = c.angV = 0;
    c.broken = false;
    c.parked = false;
    c.root.visible = true;
    c.root.scale.setScalar(0.01);
    this.sync(c);
    fx.smoke(_v.set(c.x, 0.3, c.z), { count: 8, color: 0xffffff });
    let t = 0;
    this.A.onUpdate((dt) => {
      t = Math.min(1, t + dt * 3);
      const e = 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t);
      c.root.scale.setScalar(Math.max(0.01, t * e));
      return t >= 1;
    });
  }
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function findVoxMesh(root) {
  let best = null;
  root.traverse((o) => {
    if (o.isMesh && o.geometry?.userData?.voxels && (!best || o.geometry.userData.voxels.length > best.geometry.userData.voxels.length)) best = o;
  });
  return best;
}
