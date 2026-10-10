// Arena NPCs: chibi characters that wander, face the player, react, show quest
// markers ("!" / "?") and open dialogue when tapped.
import * as THREE from 'three';
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { damp, rand, pick } from '../../core/util.js';
import { speech } from '../../ui/ui.js';
import { audio } from '../../core/audio.js';
import { makeMarker, blobShadow, pickProxy } from './kit.js';

const _contacts = [];

export class NPC {
  constructor(A, charId, opts = {}) {
    this.A = A;
    this.id = opts.id ?? charId;
    this.charId = charId;
    const def = { ...CHARACTERS[charId], ...(opts.override ?? {}) };
    this.def = def;
    this.name = opts.name ?? def.name;
    this.chibi = new Chibi(def, { scale: opts.scale ?? 1 });
    this.root = this.chibi.root;
    this.root.add(blobShadow(0.42 * (opts.scale ?? 1)));
    const [x, z] = opts.pos;
    this.root.position.set(x, A.terrain.heightAt(x, z), z);
    this.home = { x, z };
    this.yaw = opts.facing ?? 0;
    this.root.rotation.y = this.yaw;
    this.wanderR = opts.wander ?? 0;
    this.walkSpeed = opts.speed ?? 1.5;
    this.target = null;
    this.waitT = rand(1, 4);
    this.lines = opts.lines ?? [];
    this.lineT = rand(4, 10);
    this.react = opts.react ?? 'wave';
    this.greet = opts.greet ?? null;
    this.nearBefore = false;
    this.markerFn = opts.marker ?? null;
    this.markerKind = null;
    this.markerMesh = null;
    this.onTalk = opts.onTalk ?? null;
    this.idleAnim = opts.idle ?? 'idle';
    this.busy = false;
    this.radius = 0.4 * (opts.scale ?? 1);
    this.reactT = 0;
    this.chibi.play(this.idleAnim);
    if (opts.expr) this.chibi.expr(...opts.expr);
    A.scene.add(this.root);
    this.proxy = pickProxy(0.7, 2.2);
    this.root.add(this.proxy);
    this.alive = true;
    this.lodSkip = 0;
    if (this.onTalk) {
      this.interactable = A.interact({
        id: 'npc:' + this.id,
        pos: this.root.position,
        range: opts.range ?? 2.3,
        label: opts.label ?? 'TALK',
        icon: opts.icon ?? 'quest',
        hit: this.proxy,
        act: () => this.talk(),
        enabled: () => this.alive && !this.busy,
        npc: this,
      });
    }
    this.followTarget = null;
  }

  get pos() {
    return this.root.position;
  }

  async talk() {
    if (this.busy) return;
    this.busy = true;
    const A = this.A;
    try {
      await A.dialogue(this, () => this.onTalk(this));
    } finally {
      this.busy = false;
    }
  }

  say(text, dur = 2.6) {
    audio.play('pop', { pitch: 1.3 + Math.random() * 0.3, vol: 0.5 });
    return speech(this.chibi, text, dur);
  }

  setMarker(kind) {
    if (kind === this.markerKind) return;
    this.markerKind = kind;
    if (this.markerMesh) {
      this.root.remove(this.markerMesh);
      this.markerMesh = null;
    }
    if (!kind) return;
    const k = typeof kind === 'string' ? { kind, color: 0xffd23f } : kind;
    this.markerMesh = makeMarker(k.kind, k.color);
    this.markerMesh.position.y = this.chibi.height + 0.75;
    this.root.add(this.markerMesh);
  }

  update(dt, t) {
    const A = this.A;
    const p = A.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const far = dist > 34;
    // quest marker (cheap check every ~0.4s)
    if (this.markerFn) {
      this._mT = (this._mT ?? 0) - dt;
      if (this._mT <= 0) {
        this._mT = 0.4;
        this.setMarker(this.markerFn());
      }
      if (this.markerMesh) {
        this.markerMesh.position.y = this.chibi.height + 0.7 + Math.abs(Math.sin(t * 4)) * 0.22;
        this.markerMesh.rotation.y = -this.root.rotation.y + Math.sin(t * 2) * 0.4;
      }
    }
    if (far) {
      this.nearBefore = false;
      // very cheap: tick the animation at a low rate
      this.lodSkip += dt;
      if (this.lodSkip > 0.25) {
        this.chibi.update(this.lodSkip);
        this.lodSkip = 0;
      }
      return;
    }
    let moving = false;
    if (this.busy) {
      this.faceTo(p.x, p.z, dt, 10);
    } else if (this.followTarget) {
      moving = this.walkToward(this.followTarget.x, this.followTarget.z, dt, this.followTarget.speed ?? 3.4, this.followTarget.stop ?? 1.6);
      if (!moving) this.faceTo(p.x, p.z, dt);
    } else if (dist < 3.6 && !A.player.locked) {
      this.target = null;
      this.faceTo(p.x, p.z, dt);
      if (!this.nearBefore) {
        this.nearBefore = true;
        if (this.reactT <= 0) {
          this.reactT = 9;
          this.doReact();
        }
      }
    } else {
      if (dist > 5) this.nearBefore = false;
      if (this.wanderR > 0) moving = this.wander(dt);
    }
    this.reactT -= dt;
    if (!moving) {
      this.chibi.speed = 1;
      if (!this.busy && (this.chibi.anim === 'walk' || this.chibi.anim === 'run')) this.chibi.play(this.idleAnim);
    }
    // ambient lines
    if (this.lines.length && dist < 10 && !this.busy && !A.player.locked) {
      this.lineT -= dt;
      if (this.lineT <= 0) {
        this.lineT = rand(9, 16);
        this.say(pick(this.lines).replace('{name}', A.state.p.name));
      }
    }
    this.root.position.y = damp(this.root.position.y, A.terrain.heightAt(this.pos.x, this.pos.z), 10, dt);
    this.chibi.update(dt);
  }

  doReact() {
    const c = this.chibi;
    if (this.react === 'cheer') {
      c.play('cheer', { dur: 1.6, then: this.idleAnim });
      c.expr('star', 'grin', 1.6);
      audio.play('cheer', { vol: 0.5, gap: 1 });
    } else if (this.react === 'shocked') {
      c.play('shocked');
      c.expr('shock', 'o', 1.2);
    } else if (this.react === 'dance') {
      c.play('dance', { dur: 2, then: this.idleAnim });
      c.expr('happy', 'grin', 2);
    } else if (this.react) {
      c.play('wave', { dur: 1.4, then: this.idleAnim });
      c.expr('happy', 'smile', 1.4);
    }
    if (this.greet) this.say(typeof this.greet === 'function' ? this.greet() : pick(this.greet).replace('{name}', this.A.state.p.name));
  }

  faceTo(x, z, dt, k = 6) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    let d = want - this.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.root.rotation.y += d * Math.min(1, dt * k);
  }

  wander(dt) {
    if (!this.target) {
      this.waitT -= dt;
      if (this.waitT > 0) return false;
      const a = rand(0, Math.PI * 2), r = rand(0.3, 1) * this.wanderR;
      const tx = this.home.x + Math.cos(a) * r, tz = this.home.z + Math.sin(a) * r;
      if (!this.A.world.free(tx, tz, 0.5, 'npc')) {
        this.waitT = 0.5;
        return false;
      }
      this.target = { x: tx, z: tz };
    }
    const moving = this.walkToward(this.target.x, this.target.z, dt, this.walkSpeed, 0.3);
    if (!moving) {
      this.target = null;
      this.waitT = rand(1.5, 5);
    }
    return moving;
  }

  /** Step toward a point with collisions; returns true while still moving. */
  walkToward(x, z, dt, speed, stop = 0.3) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < stop) return false;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (dx / d) * speed * dt;
    this.pos.z += (dz / d) * speed * dt;
    this.A.world.resolve(this.pos, this.radius, 'npc', _contacts);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this._stuck = moved < speed * dt * 0.25 ? (this._stuck ?? 0) + dt : 0;
    if (this._stuck > 0.8) {
      this._stuck = 0;
      this.target = null;
      return false;
    }
    this.faceTo(x, z, dt, 8);
    this.chibi.play(speed > 3 ? 'run' : 'walk');
    this.chibi.speed = speed > 3 ? 1 : 0.75;
    return true;
  }
}

const _v = new THREE.Vector3();
export function npcHead(npc) {
  return npc.chibi.headTop(_v);
}
