// LAB MODULES in the battle view: the module models bolted onto each base
// (src/models/props/labModules.js) and their effects for the sim's 'modFire'
// events (src/game/battle/labMods.js): Tesla chain zaps, goo shells and puddles,
// laser beams, acid spray, the repair drone, snacks, clones and the reactor
// meltdown. Pixel / voxel effects only (hitPix, particles, voxfx).
import * as THREE from 'three';
import { fx, particles } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { rand, pick, lerp } from '../../core/util.js';
import { attachModules } from '../../models/props/labModules.js';
import { loadoutList } from '../../data/labModules.js';
import { floatText } from '../../ui/ui.js';
import { hpx } from './hitPix.js';
import { voxelBeam, voxelPuddle, groundImpact } from './voxfx.js';

/**
 * Bolt a side's equipped modules onto a freshly built base (makeBase / makeLabBuilding result).
 * Wraps base.update / base.setDamage so the parts animate and hide with the rubble.
 */
export function attachBaseModules(base, modules, side) {
  const list = loadoutList(modules);
  if (!list.length || !base?.root) return null;
  let mods = null;
  try { mods = attachModules(base, list, { side, flip: side === 1 }); } catch (e) { console.warn('lab modules failed', e); return null; }
  for (const k of Object.keys(mods.mods)) for (const m of mods.mods[k].meshes) { m.castShadow = true; base.meshes?.push(m); }
  const up = base.update?.bind(base), dmg = base.setDamage?.bind(base);
  base.update = (dt) => { up?.(dt); mods.update(dt); };
  base.setDamage = (f) => { dmg?.(f); mods.setDamage(f); };
  base.mods = mods;
  return mods;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const GOO_GEO = new THREE.BoxGeometry(0.22, 0.22, 0.22);

export class ModFx {
  constructor(view) {
    this.view = view;
    this.off = view.on((ev) => { if (ev.type === 'modFire') { try { this.fire(ev); } catch (e) { console.warn('module fx', e); } } });
  }
  mod(side, cat) {
    return this.view.labs?.[side]?.mods?.get(cat) ?? null;
  }
  unitPos(t, out = new THREE.Vector3()) {
    const a = t?.unit ? this.view.actors.get(t.unit.id) : null;
    if (a && !a.hidden) {
      const p = a.rig.root.position;
      return out.set(p.x, p.y + Math.max(0.3, a.rig.height * 0.55), p.z);
    }
    return out.set(t?.x ?? 0, 0.6, t?.z ?? 0);
  }
  fire(ev) {
    const side = ev.side;
    const me = side === 0;
    switch (ev.mod) {
      case 'teslaCoil': {
        const m = this.mod(side, 'defense');
        m?.fire();
        let from = m ? m.muzzle(_a) : _a.set(this.view.sim.sides[side].labX, 3, -1.4);
        from = from.clone();
        for (const t of ev.targets ?? []) {
          const to = this.unitPos(t, _b).clone();
          this.bolt(from, to);
          hpx.hit(to, 'zap', 0.9, me ? 1 : -1);
          from = to;
        }
        audio.play('zap', { pitch: 1.1 + Math.random() * 0.3, vol: 0.7, gap: 0.05 });
        break;
      }
      case 'laserTurret': {
        const m = this.mod(side, 'defense');
        const to = this.unitPos(ev.target, _b).clone();
        if (m) {
          m.aim(to);
          m.fire();
          const from = m.muzzle(_a).clone();
          voxelBeam(this.view.scene, from, to, 0xff4fd8, 0.2, 0.07 + Math.min(8, ev.ramp ?? 0) * 0.012);
        }
        audio.play('laser', { pitch: 1.4 + Math.min(8, ev.ramp ?? 0) * 0.05, vol: 0.35, gap: 0.12 });
        break;
      }
      case 'gooCannon': {
        const m = this.mod(side, 'defense');
        const x = ev.x;
        if (m) { m.aim(_b.set(x, 0, 0)); m.fire(); }
        const from = m ? m.muzzle(_a).clone() : _a.set(this.view.sim.sides[side].labX, 2, -1.4).clone();
        const to = new THREE.Vector3(x, 0.05, rand(-0.3, 0.3));
        audio.play('shoot', { pitch: 0.6, vol: 0.6 });
        const ball = new THREE.Mesh(GOO_GEO, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7cff3a).multiplyScalar(1.8), toneMapped: false }));
        ball.position.copy(from);
        this.view.scene.add(ball);
        const flight = ev.flight ?? 0.55, peak = Math.max(from.y, 2) + 1.4;
        let t = 0, landed = false, pool = null, poolT = 0;
        const z = {
          done: false,
          update: (dt) => {
            t += dt;
            if (!landed) {
              const k = Math.min(1, t / flight);
              ball.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * (peak - Math.max(from.y, to.y)), lerp(from.z, to.z, k));
              ball.rotation.set(t * 9, t * 7, 0);
              if (Math.random() < dt * 30) particles.spawn('glow', { x: ball.position.x, y: ball.position.y, z: ball.position.z, size: 0.08, life: 0.25, grav: -2, color: pick([0x7cff3a, 0xb8ff7a]) });
              if (k >= 1) {
                landed = true;
                this.view.scene.remove(ball);
                ball.material.dispose();
                hpx.splat(to.clone().setY(0.3), { color: 0x7cff3a, scale: 1.3 });
                fx.slime(to.clone().setY(0.4), { count: 18, speed: 3, color: 0x7cff3a, scale: 1 });
                audio.play('splat', { pitch: 0.9, vol: 0.7 });
                pool = voxelPuddle(ev.r ?? 1.4, 0x7cff3a);
                pool.position.set(to.x, 0.02, 0);
                pool.scale.set(0.05, 1, 0.05);
                this.view.scene.add(pool);
              }
              return;
            }
            poolT += dt;
            const grow = Math.min(1, poolT / 0.25);
            pool.scale.set(0.05 + grow * 0.95, 1, 0.05 + grow * 0.95);
            if (Math.random() < dt * 6) fx.bubbles(new THREE.Vector3(to.x + rand(-1, 1) * (ev.r ?? 1.4) * 0.7, 0.1, rand(-0.8, 0.8)), { count: 1, color: 0x9fff6a });
            const left = (ev.dur ?? 3) - poolT;
            if (left < 0.4) {
              const mat = pool.material[0];
              mat.transparent = true;
              mat.opacity = Math.max(0, left / 0.4);
            }
            if (left <= 0) { this.view.scene.remove(pool); z.done = true; }
          },
        };
        this.view.zones.push(z);
        break;
      }
      case 'acidSprinkler': {
        const m = this.mod(side, 'defense');
        if (!ev.on || !m) break;
        m.fire();
        const top = m.muzzle(_a);
        const dir = me ? 1 : -1;
        for (let i = 0; i < 14; i++) {
          const sp = rand(2.2, 4.4);
          particles.spawn('glow', { x: top.x, y: top.y, z: top.z, vx: dir * sp * rand(0.5, 1.1), vy: rand(1.5, 3.2), vz: rand(-0.6, 1.4), size: 0.09, life: rand(0.6, 0.9), grav: -9, color: pick([0x7cff3a, 0x9dff3a, 0xd4ff9a]) });
        }
        audio.play('fizz', { pitch: 1.3, vol: 0.35, gap: 0.5 });
        break;
      }
      case 'repairDrone': {
        const m = this.mod(side, 'utility');
        const lab = this.view.labs[side];
        lab.core.updateWorldMatrix(true, false);
        const p = new THREE.Vector3().setFromMatrixPosition(lab.core.matrixWorld);
        if (m) m.fire();
        fx.sparkle(p, { count: 18, colors: [0x7cff6b, 0xffffff, 0xffd23f], speed: 3, radius: 1.2 });
        hpx.chips(p, { count: 4, colors: [0xc9d1dd, 0xffd23f], speed: 2.5 });
        floatText(p.clone().setY(Math.min(5.6, (lab.plateY ?? 4) - 0.6)), `+${ev.amount}`, 'heal hitn', { life: 1, rise: 36 });
        if (me) audio.play('heal', { vol: 0.5 });
        break;
      }
      case 'snackDispenser': {
        const m = this.mod(side, 'utility');
        if (!m) break;
        m.fire();
        const at = m.muzzle(_a);
        hpx.chips(at, { count: 3, colors: [0xff4fa3, 0xffd23f, 0x29b6f6], speed: 3, vx: me ? 2 : -2 });
        fx.sparkle(at.clone().setY(at.y + 0.4), { count: 6, colors: [0xff5aa8, 0xffffff], speed: 2, life: 0.6, grav: 1 });
        break;
      }
      case 'cloningVat': {
        const m = this.mod(side, 'utility');
        if (m) {
          m.fire();
          const c = m.muzzle(_a);
          fx.sparkle(c, { count: 20, colors: [0x7cff3a, 0xffffff], speed: 3, radius: 0.6 });
        }
        const u = ev.unit;
        if (u) {
          const p = new THREE.Vector3(u.x, 0.4, u.z ?? 0);
          fx.rise(p, { count: 16, colors: [0x7cff3a, 0xd4ff9a], radius: 0.6 });
          floatText(p.clone().setY(1.6), 'CLONE!', 'heal', { life: 1, rise: 34 });
        }
        audio.play('spawn', { pitch: 1.3, vol: 0.6 });
        break;
      }
      case 'reactor': {
        // MELTDOWN: a big pixel blast in front of the base, a green flash and a hard shake
        const m = this.mod(side, 'power');
        if (m) m.fire();
        const x = ev.x;
        const p = new THREE.Vector3(x, 0.8, 0.2);
        hpx.boom(p, { scale: 2.6, color: 0x9dff3a, flames: 6 });
        hpx.boom(p.clone().setX(x + (me ? -1.2 : 1.2)).setY(1.4), { scale: 1.6, color: 0x7cff3a });
        groundImpact(p.clone().setY(0), { radius: ev.r ?? 4.6, color: 0x9dff3a });
        for (let i = 0; i < 40; i++) particles.spawn('glow', { x: x + rand(-2, 2), y: rand(0.2, 2), z: rand(-1, 1.2), vy: rand(1, 4), vx: rand(-2, 2), size: 0.1, life: rand(0.5, 1), grav: -3, color: pick([0x9dff3a, 0xd4ff9a, 0xffffff]) });
        floatText(p.clone().setY(3.2), 'MELTDOWN!', 'big', { life: 1.6, rise: 40 });
        audio.play('explode', { pitch: 0.7 });
        audio.play('alarm', { vol: 0.5 });
        engine.shake(0.6);
        engine.hitstop(0.08);
        break;
      }
    }
  }
  /** Pixel lightning between two points (jagged, a few glow pixels per step). */
  bolt(from, to) {
    const n = Math.max(6, Math.ceil(from.distanceTo(to) / 0.14));
    const mid = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const j = Math.sin(k * Math.PI) * 0.3;
      mid.lerpVectors(from, to, k);
      particles.spawn('glow', { x: mid.x + rand(-j, j), y: mid.y + rand(-j, j), z: mid.z + rand(-0.1, 0.1), size: 0.08, life: 0.16, grav: 0, color: pick([0xbff6ff, 0xffffff, 0xff4fd8]) });
    }
  }
  dispose() {
    this.off?.();
  }
}
