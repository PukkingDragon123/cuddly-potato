// SwarmRig: builds a multi-part voxel model from a model definition and
// animates it procedurally based on part names and gait.
//
// Model definition (returned by a builder in swarmModels.js):
// {
//   parts: [ { name, grid: VoxGrid, at: [x,y,z] (voxels, pivot position in parent space),
//              pivot: [px,py,pz] (grid coords of pivot, default [0,0,0]), parent: 'body' | undefined } ],
//   gait: 'walk' | 'hop' | 'roll' | 'slide' | 'float',
//   muzzle: [x,y,z] (voxels, projectile origin in model space; defaults to front-middle)
//   voxel: world size of a voxel (default VOX)
// }
// Animated part names: body, head, jaw, lid, tail, armL, armR, legL, legR, legFL, legFR, legBL, legBR,
// wheel*, spin, prop, flag, antenna*, cannon, wingL, wingR.
import * as THREE from 'three';
import { VOX, Mats, makeMesh, variantMaterials, variantColor } from '../core/voxel.js';
import { damp } from '../core/util.js';
import { newPose, resetPose, applyMove, applyHold } from './swarmMoves.js';

const geoCache = new Map();
const TAU = Math.PI * 2;
const wrapPi = (v) => ((((v + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

// Toy finishes seen on the real figures: glossy PVC (default), metallic,
// translucent ("stealth") and glow-in-the-dark.
const finishCache = {};
export function finishMaterials(finish = 'toy') {
  if (finishCache[finish]) return finishCache[finish];
  let pair;
  if (finish === 'gloss') pair = Mats.toyGlossPair;
  else if (finish === 'metal') {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.65, envMapIntensity: 2.8 }); // env map is dimmed engine-side
    m.envMap = Mats.toy.envMap;
    pair = [m, Mats.glow];
  } else if (finish === 'translucent') {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.78, envMapIntensity: 1.3 });
    m.envMap = Mats.toy.envMap;
    pair = [m, Mats.glow];
  } else if (finish === 'glow') {
    // glow-in-the-dark: the figure's own colours feed its emissive term
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.0, envMapIntensity: 0.8 });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.42;');
    };
    m.customProgramCacheKey = () => 'toyGlowInDark';
    m.envMap = Mats.toy.envMap;
    pair = [m, Mats.glow];
  } else pair = Mats.toyPair;
  finishCache[finish] = pair;
  return pair;
}

export class SwarmRig {
  /**
   * @param {object} def model definition
   * @param {object} opts { variant, cacheKey, scale }
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.variant = opts.variant ?? 'base';
    const V = def.voxel ?? VOX;
    this.V = V;
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.baseScale = opts.scale ?? 1;
    this.inner.scale.setScalar(this.baseScale);
    this.parts = {};
    this.meshes = [];
    const mats = this.variant !== 'base' ? variantMaterials(this.variant) : finishMaterials(def.finish);
    this.mats = mats;
    const pending = [];
    for (const p of def.parts) {
      const key = opts.cacheKey ? `${opts.cacheKey}|${this.variant}|${p.name}` : null;
      let geo = key && geoCache.get(key);
      if (!geo) {
        let grid = p.grid;
        if (this.variant !== 'base') {
          grid = grid.clone();
          const kind = this.variant;
          grid.paint((x, y, z, c) => variantColor(kind, c));
        }
        geo = grid.build({ pivot: p.pivot ?? [0, 0, 0], scale: V, jitter: def.jitter ?? 0.025, maxSamples: 420 });
        if (key) geoCache.set(key, geo);
      }
      const g = new THREE.Group();
      g.name = p.name;
      const at = p.at ?? [0, 0, 0];
      g.position.set(at[0] * V, at[1] * V, at[2] * V);
      g.userData.base = g.position.clone();
      g.userData.baseRot = new THREE.Euler(...(p.rot ?? [0, 0, 0]));
      g.rotation.copy(g.userData.baseRot);
      const mesh = makeMesh(geo, mats);
      g.add(mesh);
      this.meshes.push(mesh);
      this.parts[p.name] = g;
      pending.push([g, p.parent]);
    }
    for (const [g, parent] of pending) {
      if (parent && this.parts[parent]) this.parts[parent].add(g);
      else this.inner.add(g);
      g.userData.top = g.parent === this.inner;
    }
    // compute height
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.inner);
    this.height = box.max.y - box.min.y;
    this.length = box.max.z - box.min.z;
    this.width = box.max.x - box.min.x;
    const m = def.muzzle;
    this.muzzle = new THREE.Object3D();
    if (m) this.muzzle.position.set(m[0] * V, m[1] * V, m[2] * V);
    else this.muzzle.position.set(0, this.height * 0.55 / this.baseScale, box.max.z / this.baseScale);
    this.inner.add(this.muzzle);
    // creature moves (swarmMoves.js): what the body can do, how far it reaches, where it bites
    const P = this.parts, s0 = this.baseScale;
    this.has = {
      head: !!P.head, legF: !!(P.legFL || P.legFR), legB: !!(P.legBL || P.legBR), legs2: !!(P.legL || P.legR),
      arms: !!(P.armL || P.armR), tail: !!P.tail, jaw: !!P.jaw, lid: !!P.lid,
    };
    // pitch pivots: the planted feet (front / hind legs) or, legless, part-way along the body
    let zf = 0, zb = 0, legsZ = false;
    for (const name of ['legFL', 'legFR', 'legBL', 'legBR', 'legL', 'legR']) {
      const g = P[name];
      if (!g || !g.userData.top) continue;
      legsZ = true;
      zf = Math.max(zf, g.userData.base.z);
      zb = Math.max(zb, -g.userData.base.z);
    }
    this.zf = legsZ ? Math.max(0.04, zf) : Math.max(0.1, box.max.z / s0) * 0.6;
    this.zb = legsZ ? Math.max(0.04, zb) : Math.max(0.1, -box.min.z / s0) * 0.6;
    this.hc = (this.height / s0) * 0.45;
    this.hw = (this.width / s0) * 0.5;
    let legMin = Infinity;
    for (const name in P) {
      const g = P[name];
      if (!g.userData.top || !/^leg/.test(name)) continue;
      g.userData.L = Math.max(0.05, g.userData.base.y);
      g.userData.front = name === 'legFL' || name === 'legFR' || name === 'legL';
      legMin = Math.min(legMin, g.userData.L);
    }
    this.legMin = Number.isFinite(legMin) ? legMin : 0;
    // grip point: the front of the mouth, riding on the head (or the body) so grabbed prey follows every shake
    const holder = P.head ?? P.body ?? this.inner;
    this.grip = new THREE.Object3D();
    this.root.updateMatrixWorld(true);
    holder.updateWorldMatrix(true, false);
    const mw = new THREE.Vector3();
    this.muzzle.updateWorldMatrix(true, false);
    mw.setFromMatrixPosition(this.muzzle.matrixWorld);
    mw.z = Math.max(mw.z, box.max.z * 0.92);
    this.grip.position.copy(holder.worldToLocal(mw));
    holder.add(this.grip);
    this.pose = newPose();
    this.ext = { x: 0, y: 0, z: 0, rx: 0, rz: 0, sq: 0 }; // offsets owned by the battle actor (hit flinch, carry tilt)
    this.posed = false; // battle actors opt in: the rig then owns the inner transform (see update)
    this.mv = null; this.mvT = 0; this.mvDur = 1; this.mvSide = 1; this.mvAmp = 1; this.mvKind = '';
    this.hl = null; this.hlK = 0; this.hlT = 0; this.hlSide = 1;
    this.hopRx = 0; this.leanZ = 0;

    this.gait = def.gait ?? 'walk';
    this.state = 'idle';
    this.t = Math.random() * 10;
    this.atkT = -1; // attack anim timer
    this.atkDur = 0.45;
    this.moveSpeed = 0;
    this.flashT = 0;
    this.squash = 0;
    this.squashV = 0;
    this.spinAngle = 0;
    this.rollAngle = 0;
    this.stunned = false;
    this.frozen = false;
    this.danceT = 0;
  }

  setState(s) {
    this.state = s;
  }
  /** Start an attack animation. strikeAt = fraction of atkDur when the hit lands. */
  attack(dur = 0.45) {
    this.atkT = 0;
    this.atkDur = dur;
  }
  /** Play a creature move (swarmMoves.js) over dur seconds; side = which paw (+1 right / -1 left). */
  play(move, dur = 0.6, side = 1, amp = 1, kind = '') {
    this.mv = move;
    this.mvT = 0;
    this.mvDur = Math.max(0.05, dur);
    this.mvSide = side;
    this.mvAmp = amp;
    this.mvKind = kind;
  }
  stopMove() {
    this.mv = null;
  }
  /** Hold a state pose (crouch, air, pinning, pinned, grabbed, lifted, charge) while the caller keeps setting it; null clears. */
  hold(name, k = 0, side = 1) {
    if (name !== this.hl) { this.hl = name; this.hlT = 0; }
    this.hlK = k;
    this.hlSide = side;
  }
  /** World position of the grip point (front of the mouth / claws). */
  gripWorld(out = new THREE.Vector3()) {
    this.grip.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.grip.matrixWorld);
  }
  flash(sec = 0.07, red = false) {
    this.flashT = sec;
    this.flashRed = red;
  }
  boing(a = 0.3) {
    this.squashV += a * 14;
  }

  update(dt) {
    this.t += dt;
    const P = this.parts;
    const t = this.t;
    const moving = this.state === 'walk';
    const frozen = this.frozen;
    const spd = frozen ? 0 : 1;
    const posed = this.posed;
    let bob = 0;
    let lean = 0;

    // attack progress
    let a = -1;
    if (this.atkT >= 0) {
      this.atkT += dt * spd;
      a = this.atkT / this.atkDur;
      if (a >= 1) { this.atkT = -1; a = -1; }
    }
    // attack curve: windup (0..0.45) then strike (0.45..0.65) then recover
    const wind = a < 0 ? 0 : a < 0.45 ? a / 0.45 : a < 0.6 ? 1 - (a - 0.45) / 0.15 * 1.8 : -0.8 * (1 - (a - 0.6) / 0.4);
    const open = a < 0 ? 0 : a < 0.45 ? a / 0.45 : a < 0.55 ? 1 - (a - 0.45) / 0.1 : 0;

    // creature move + held state pose (battle actors only)
    const Q = this.pose;
    resetPose(Q);
    if (posed) {
      if (this.hl) { this.hlT += dt * spd; applyHold(Q, this.hl, this.hlK, this); }
      if (this.mv) {
        this.mvT += dt * spd;
        const k = this.mvT / this.mvDur;
        if (k >= 1) this.mv = null;
        else applyMove(Q, this.mv, k, this);
      }
    }
    const active = posed && (this.mv || this.hl);

    const walkPhase = t * (this.gait === 'hop' ? 9 : 12) * (this.walkRate ?? 1);
    let hopRx = 0;
    if (moving && !frozen) {
      if (this.gait === 'hop') {
        const h = Math.abs(Math.sin(walkPhase * 0.5));
        bob = h * 0.12 * this.baseScale;
        hopRx = -0.12 + h * 0.15;
      } else if (this.gait === 'walk') {
        bob = Math.abs(Math.sin(walkPhase)) * 0.035 * this.baseScale;
      } else if (this.gait === 'float') {
        bob = 0.25 + Math.sin(t * 3) * 0.06;
      } else if (this.gait === 'roll') {
        this.rollAngle += dt * 9;
      } else if (this.gait === 'slide') {
        bob = Math.abs(Math.sin(walkPhase * 0.7)) * 0.02;
        lean = Math.sin(walkPhase * 0.7) * 0.06;
      }
    } else {
      if (this.gait === 'float') bob = 0.25 + Math.sin(t * 2.4) * 0.08;
      else if (!frozen) bob = Math.sin(t * 2.5) * 0.008;
    }
    if (posed) this.hopRx = damp(this.hopRx, hopRx, 10, dt);
    else if (this.gait === 'hop') this.inner.rotation.x = damp(this.inner.rotation.x, hopRx, 10, dt);
    let danceYaw = 0, dancing = false;
    if (this.state === 'dance' && !frozen) {
      this.danceT += dt;
      bob = Math.abs(Math.sin(this.danceT * 8)) * 0.15 * this.baseScale;
      lean = Math.sin(this.danceT * 8) * 0.25;
      danceYaw = Math.sin(this.danceT * 4) * 0.5;
      dancing = true;
    }

    // squash spring
    this.squashV += (-this.squash * 170 - this.squashV * 11) * dt;
    this.squash += this.squashV * dt;
    let sq = this.squash;
    if (a >= 0) sq += wind * 0.08;
    if (this.state === 'stun') lean = Math.sin(t * 20) * 0.05;
    const s = this.baseScale;
    if (posed) {
      // the rig owns the inner transform: gait + creature move + the actor's offsets (hit flinch, carry tilt)
      const E = this.ext;
      const pitch = Q.brx + E.rx;
      // pitch about the foot that stays planted: rear-ups pivot on the hind feet, lunges on the front ones
      const plant = pitch < 0 ? -Math.sin(pitch) * this.zb : Math.sin(pitch) * this.zf * 0.55;
      let rx = 0, ry = 0;
      if (Q.roll) { rx = Math.sin(Q.roll) * this.hc; ry = (1 - Math.cos(Q.roll)) * this.hc; } // death roll about the body's middle
      if (Q.lie) ry += Math.abs(Math.sin(Q.lie)) * this.hw * 0.85; // knocked onto its side: lifted so the flank rests on the ground
      if (this.inner.rotation.order !== 'YXZ') this.inner.rotation.order = 'YXZ'; // yaw first, then pitch about the body's own axis
      this.leanZ = damp(this.leanZ, lean, 10, dt);
      const yaw = Q.yaw ? Q.bry : Q.bry + danceYaw;
      this.inner.rotation.set(this.hopRx + pitch, dancing || Q.yaw || Q.bry ? yaw : damp(wrapPi(this.inner.rotation.y), 0, 8, dt), this.leanZ + Q.brz + Q.roll + Q.lie + E.rz);
      this.inner.position.set((Q.bx + rx) * s + E.x, bob + (Q.by + ry + plant * 0.9) * s + E.y, Q.bz * s + E.z);
      sq += Q.sq + E.sq;
      if (this.legMin === 0 && Q.crouch) sq -= Q.crouch * 0.18; // legless bodies squat instead
      this.inner.scale.set(s * (1 - sq * 0.45), s * (1 + sq), s * (1 - sq * 0.45) * (1 + Q.sz));
    } else {
      if (dancing) this.inner.rotation.y = danceYaw;
      else this.inner.rotation.y = damp(this.inner.rotation.y, 0, 8, dt);
      this.inner.position.y = bob;
      this.inner.rotation.z = damp(this.inner.rotation.z, lean, 10, dt);
      this.inner.scale.set(s * (1 - sq * 0.45), s * (1 + sq), s * (1 - sq * 0.45));
    }
    if (this.gait === 'roll' && P.body) P.body.rotation.x = this.rollAngle;

    // per-part animation
    const k = active ? 42 : 18;
    const sw = moving && !frozen ? Math.sin(walkPhase) : 0;
    const crouch = Q.crouch > 0 && this.legMin > 0 ? Math.min(Q.crouch, 1) * this.legMin * 0.55 : 0;
    const flap = 22 * (1 + Q.wing);
    for (const name in P) {
      const g = P[name];
      const br = g.userData.baseRot;
      const bp = g.userData.base;
      let rx = br.x, ry = br.y, rz = br.z, px = bp.x, py = bp.y, pz = bp.z;
      switch (name) {
        case 'legFL': rx += sw * 0.7 + Q.flrx; rz += Q.flrz; break;
        case 'legBR': rx += sw * 0.7 + Q.brrx; break;
        case 'legFR': rx -= sw * 0.7 - Q.frrx; rz += Q.frrz; break;
        case 'legBL': rx -= sw * 0.7 - Q.blrx; break;
        case 'legL': rx += sw * 0.8 + Q.llrx; break;
        case 'legR': rx -= sw * 0.8 - Q.lrrx; break;
        case 'armL': rx += -sw * 0.6 - wind * 1.6 + Q.alrx; rz += Q.alrz; break;
        case 'armR': rx += sw * 0.6 - wind * 1.9 + Q.arrx; rz += Q.arrz; break;
        case 'head':
          rx += -wind * 0.35 + (moving ? Math.sin(walkPhase * 2) * 0.04 : Math.sin(t * 1.7) * 0.03) + Q.hrx;
          ry += Q.hry; rz += Q.hrz;
          py += Q.hpy;
          pz += (wind < 0 ? -wind * 0.12 : 0) + Q.hpz;
          break;
        case 'jaw': rx += open * 0.8 + Q.jaw; break;
        case 'lid': rx += -open * 1.4 + Q.lid + (this.state === 'idle' ? Math.max(0, Math.sin(t * 5)) * -0.06 : 0); break;
        case 'tail': ry += Math.sin(t * (moving ? 10 : 4)) * 0.5 + Q.tly; rx += -0.2 + Q.trx; break;
        case 'flag': rz += -open * 1.4; break;
        case 'spin': ry += (this.spinAngle += dt * (8 + open * 20)); break;
        case 'prop': ry += t * 30; break;
        case 'cannon': pz -= open > 0 ? 0 : Math.max(0, -wind) * 0.12; pz += Q.cannon; break;
        case 'wingL': rz += Math.sin(t * flap) * 0.6; break;
        case 'wingR': rz -= Math.sin(t * flap) * 0.6; break;
        case 'antenna': case 'antennaL': case 'antennaR': rz += Math.sin(t * 6 + (name === 'antennaR' ? 1 : 0)) * 0.2; break;
        default:
          if (name.startsWith('wheel')) rx += t * (moving ? 10 : 0);
          else if (name.startsWith('prop')) ry += t * 30;
          else if (name.startsWith('spin')) ry += t * (8 + (a >= 0 ? 16 : 0));
          else if (name.startsWith('antenna')) rz += Math.sin(t * 6 + name.length) * 0.2;
          else if (name.startsWith('arm')) rx += (name.endsWith('L') ? -sw : sw) * 0.5 - wind * 1.2;
          else if (name.startsWith('leg')) rx += (name.length % 2 ? sw : -sw) * 0.7;
      }
      if (crouch && g.userData.top) {
        // crouch: everything sinks; legs fold (front feet forward, hind feet back) so the paws stay on the ground
        py -= crouch;
        const L = g.userData.L;
        if (L) {
          const th = Math.acos(Math.max(0.15, 1 - crouch / L));
          rx += g.userData.front ? -th : th;
        }
      }
      g.rotation.set(damp(g.rotation.x, rx, k, dt), damp(g.rotation.y, ry, k, dt), damp(g.rotation.z, rz, k, dt));
      if (name.startsWith('spin') || name.startsWith('prop') || name.startsWith('wheel')) g.rotation.set(rx, ry, rz);
      g.position.set(damp(g.position.x, px, k, dt), damp(g.position.y, py, k, dt), damp(g.position.z, pz, k, dt));
    }

    // hit flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      const m = on ? (this.flashRed ? Mats.flashRedPair : Mats.flashPair) : this.mats;
      for (const mesh of this.meshes) mesh.material = m;
    }
  }

  muzzleWorld(out = new THREE.Vector3()) {
    this.muzzle.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.muzzle.matrixWorld);
  }
}
