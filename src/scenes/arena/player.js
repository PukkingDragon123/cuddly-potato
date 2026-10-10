// Player avatar + input for the Arena: tap-to-walk (A* path), left-half virtual
// joystick, WASD/arrows, auto-sprint, collisions, footstep dust and emotes.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { fx } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { damp, clamp } from '../../core/util.js';
import { h, $ui, $world } from '../../ui/ui.js';
import { blobShadow } from './kit.js';

export const WALK = 4.4;
export const RUN = 7.6;
const RADIUS = 0.38;

export class Input {
  constructor(A) {
    this.A = A;
    this.keys = new Set();
    this.joy = { id: null, active: false, ox: 0, oy: 0, x: 0, y: 0 };
    this.pending = new Map();
    this.enabled = true;
    const cv = engine.canvas;
    this.onDown = (e) => this.down(e);
    this.onMove = (e) => this.move(e);
    this.onUp = (e) => this.up(e);
    this.onKey = (e) => this.key(e, true);
    this.onKeyUp = (e) => this.key(e, false);
    this.onBlur = () => this.keys.clear();
    cv.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    // joystick DOM
    this.joyBase = h('div', { class: 'ar-joy hidden' }, (this.joyKnob = h('div', { class: 'ar-joy-knob' })));
    $ui().appendChild(this.joyBase);
  }
  dispose() {
    const cv = engine.canvas;
    cv.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.joyBase.remove();
  }
  get R() {
    return Math.min(engine.width, engine.height) * 0.11;
  }
  down(e) {
    if (!this.enabled) return;
    const left = e.clientX < engine.width * 0.5;
    this.pending.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), left, moved: 0 });
  }
  move(e) {
    const p = this.pending.get(e.pointerId);
    if (p) {
      p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x, e.clientY - p.y));
      if (p.left && p.moved > 12 && !this.joy.active && this.enabled) {
        this.joy.active = true;
        this.joy.id = e.pointerId;
        this.joy.ox = p.x;
        this.joy.oy = p.y;
        this.joyBase.classList.remove('hidden');
        this.joyBase.style.left = p.x + 'px';
        this.joyBase.style.top = p.y + 'px';
        this.A.player?.cancelPath();
      }
    }
    if (this.joy.active && e.pointerId === this.joy.id) {
      const R = this.R;
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // drag the base along (floating joystick)
        this.joy.ox += (dx / d) * (d - R);
        this.joy.oy += (dy / d) * (d - R);
        dx = e.clientX - this.joy.ox;
        dy = e.clientY - this.joy.oy;
        this.joyBase.style.left = this.joy.ox + 'px';
        this.joyBase.style.top = this.joy.oy + 'px';
      }
      this.joy.x = dx / R;
      this.joy.y = dy / R;
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }
  up(e) {
    const p = this.pending.get(e.pointerId);
    this.pending.delete(e.pointerId);
    if (this.joy.active && e.pointerId === this.joy.id) {
      this.joy.active = false;
      this.joy.id = null;
      this.joy.x = this.joy.y = 0;
      this.joyBase.classList.add('hidden');
      this.joyKnob.style.transform = '';
      return;
    }
    if (p && this.enabled && p.moved < 14 && performance.now() - p.t < 600) this.A.onTap(p.x, p.y);
  }
  key(e, down) {
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(k)) {
      if (down) this.keys.add(k);
      else this.keys.delete(k);
      if (down && this.enabled) this.A.player?.cancelPath();
    }
    if (down && !e.repeat && this.enabled) {
      if (k === 'Space' || k === 'KeyE' || k === 'Enter') this.A.hud?.pressAction();
      if (k === 'KeyQ') this.A.emote();
      if (k === 'KeyM') this.A.hud?.openMap();
    }
  }
  /** Desired move direction in world space (x east, z south) with magnitude 0..1. */
  dir(out = { x: 0, z: 0, mag: 0, walk: false }) {
    out.x = out.z = out.mag = 0;
    out.walk = false;
    if (!this.enabled) return out;
    const K = this.keys;
    let x = 0, z = 0;
    if (K.has('KeyA') || K.has('ArrowLeft')) x -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) x += 1;
    if (K.has('KeyW') || K.has('ArrowUp')) z -= 1;
    if (K.has('KeyS') || K.has('ArrowDown')) z += 1;
    if (x || z) {
      const l = Math.hypot(x, z);
      out.x = x / l;
      out.z = z / l;
      out.mag = 1;
      out.walk = K.has('ShiftLeft') || K.has('ShiftRight');
      return out;
    }
    if (this.joy.active) {
      const l = Math.hypot(this.joy.x, this.joy.y);
      if (l > 0.18) {
        out.x = this.joy.x / l;
        out.z = this.joy.y / l;
        out.mag = clamp((l - 0.18) / 0.62, 0.25, 1);
        out.walk = out.mag < 0.75;
      }
    }
    return out;
  }
}

const _d = { x: 0, z: 0, mag: 0 };
const _contacts = [];

export class Avatar {
  constructor(A) {
    this.A = A;
    const def = { ...CHARACTERS.recruit, name: A.state.p.name };
    this.chibi = new Chibi(def);
    this.root = this.chibi.root;
    this.root.add(blobShadow(0.42));
    A.scene.add(this.root);
    this.pos = this.root.position;
    this.vel = { x: 0, z: 0 };
    this.facing = 0;
    this.moveT = 0;
    this.path = null;
    this.goal = null;
    this.stepAcc = 0;
    this.radius = RADIUS;
    this.speed = 0;
    this.locked = false; // during cutscenes / dialogue
    this.emoteT = 0;
    this.sitting = null;
    this.y = 0;
    this.nameEl = h('div', { class: 'ar-name outline-sm' }, A.state.p.name || 'Recruit');
    $world().appendChild(this.nameEl);
    this.lastSafe = new THREE.Vector3();
    this.tapMarker = null;
  }

  dispose() {
    this.nameEl.remove();
  }

  place(x, z) {
    this.pos.set(x, this.A.terrain.heightAt(x, z), z);
    this.vel.x = this.vel.z = 0;
    this.y = this.pos.y;
    this.cancelPath();
  }

  cancelPath() {
    this.path = null;
    this.goal = null;
    this.A.hideTapMarker?.();
  }

  /** Walk to (x,z); optional goal {range, onArrive}. */
  walkTo(x, z, goal = null) {
    const p = this.A.world.findPath(this.pos.x, this.pos.z, x, z);
    this.sitting = null;
    if (!p) {
      this.path = null;
      this.goal = null;
      return false;
    }
    this.path = p;
    this.goal = goal;
    return true;
  }

  face(x, z) {
    this.facing = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  update(dt) {
    const A = this.A;
    const c = this.chibi;
    let dx = 0, dz = 0, mag = 0, walkOnly = false;
    if (!this.locked) {
      const d = A.input.dir(_d);
      if (d.mag > 0) {
        dx = d.x;
        dz = d.z;
        mag = d.mag;
        walkOnly = d.walk;
        if (this.path) this.cancelPath();
      } else if (this.path) {
        const tgt = this.path[0];
        const ex = tgt[0] - this.pos.x, ez = tgt[1] - this.pos.z;
        const dist = Math.hypot(ex, ez);
        const last = this.path.length === 1;
        const goalR = last && this.goal ? this.goal.range ?? 0.6 : 0.35;
        if (this.goal && this.goal.target) {
          const gx = this.goal.target.x - this.pos.x, gz = this.goal.target.z - this.pos.z;
          if (Math.hypot(gx, gz) <= (this.goal.range ?? 1.5)) {
            this.arrive();
            return this.animate(dt, 0);
          }
        }
        if (dist < goalR) {
          this.path.shift();
          if (!this.path.length) this.arrive();
        } else {
          dx = ex / dist;
          dz = ez / dist;
          mag = last ? clamp(dist / 1.2, 0.35, 1) : 1;
        }
      }
    }
    // auto sprint: keep moving for a bit to break into a run
    if (mag > 0.05) this.moveT += dt;
    else this.moveT = 0;
    const running = !walkOnly && mag > 0.7 && this.moveT > 0.55;
    const target = mag * (running ? RUN : WALK);
    const tvx = dx * target, tvz = dz * target;
    const accel = mag > 0 ? 14 : 18;
    this.vel.x = damp(this.vel.x, tvx, accel, dt);
    this.vel.z = damp(this.vel.z, tvz, accel, dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.02) {
      const steps = Math.max(1, Math.ceil((this.speed * dt) / 0.2));
      for (let s = 0; s < steps; s++) {
        this.pos.x += (this.vel.x * dt) / steps;
        this.pos.z += (this.vel.z * dt) / steps;
        const contacts = A.world.resolve(this.pos, this.radius, 'player', _contacts);
        for (const ct of contacts) {
          // remove velocity into the wall
          const vn = this.vel.x * ct.nx + this.vel.z * ct.nz;
          if (vn < 0) {
            this.vel.x -= vn * ct.nx;
            this.vel.z -= vn * ct.nz;
          }
          if (ct.c && ct.c.onBump) ct.c.onBump(ct, this, -vn);
        }
      }
      A.dynamicCollide?.(this);
      if (this.speed > 0.4) {
        const want = Math.atan2(this.vel.x, this.vel.z);
        this.facing = want;
      }
    }
    if (A.terrain.walkable(this.pos.x, this.pos.z)) this.lastSafe.copy(this.pos);
    const gh = A.terrain.heightAt(this.pos.x, this.pos.z);
    this.y = damp(this.y, Math.max(-0.35, gh), 14, dt);
    this.pos.y = this.y;
    this.animate(dt, running ? 2 : this.speed > 0.35 ? 1 : 0);
  }

  arrive() {
    const g = this.goal;
    this.path = null;
    this.goal = null;
    this.A.hideTapMarker?.();
    if (g && g.onArrive) g.onArrive();
  }

  animate(dt, mode) {
    const c = this.chibi;
    // smooth yaw
    let dy = this.facing - this.root.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.root.rotation.y += dy * Math.min(1, dt * 14);
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      if (mode > 0) this.emoteT = 0;
    }
    if (mode > 0) this.sitting = null;
    if (this.sitting) c.play('sit');
    else if (this.emoteT > 0) c.play(this.emoteAnim);
    else if (mode === 2) c.play('run');
    else if (mode === 1) c.play('walk');
    else if (!['shocked', 'hit', 'throw', 'kick', 'flick'].includes(c.anim) || !c.animDur) c.play('idle');
    c.speed = mode === 1 ? clamp(this.speed / WALK, 0.6, 1.2) : 1;
    c.update(dt);
    // footsteps
    if (mode > 0) {
      this.stepAcc += this.speed * dt;
      const stride = mode === 2 ? 1.25 : 0.9;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const t = this.A.terrain.typeAt(this.pos.x, this.pos.z);
        const col = DUST[t] ?? DUST.grass;
        fx.dust(this.pos, { count: mode === 2 ? 4 : 2, color: col, scale: mode === 2 ? 1.2 : 0.9, vx: -this.vel.x * 0.1 });
        if (t === 'sand' || t === 'path' || t === 'dirt') audio.play('tick', { pitch: 0.35 + Math.random() * 0.1, vol: 0.4, gap: 0.1 });
      }
    }
    // name tag
    const s = engine.toScreen(_hp.set(this.pos.x, this.pos.y + 2.3, this.pos.z));
    this.nameEl.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
  }

  emote(anim = 'dance', dur = 2.6) {
    this.emoteAnim = anim;
    this.emoteT = dur;
    this.cancelPath();
  }
}

const _hp = new THREE.Vector3();
const DUST = {
  grass: 0xb9d98f, lawn: 0xb9d98f, darkgrass: 0x9fc27a, path: 0xe8d8b0, road: 0xf2dc9a, sand: 0xf6e6b0, plaza: 0xe8eef6,
  asphalt: 0x9aa0aa, metal: 0x9aa8c0, toxic: 0xb6ff7a, choco: 0xb07650, tile: 0xffffff, marble: 0xffffff, gold: 0xffe27a,
};
