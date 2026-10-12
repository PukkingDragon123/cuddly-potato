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

const geoCache = new Map();

// Toy finishes seen on the real figures: glossy PVC (default), metallic,
// translucent ("stealth") and glow-in-the-dark.
const finishCache = {};
export function finishMaterials(finish = 'toy') {
  if (finishCache[finish]) return finishCache[finish];
  let pair;
  if (finish === 'gloss') pair = Mats.toyGlossPair;
  else if (finish === 'metal') {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.65, envMapIntensity: 1.4 });
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
    const k = 18;
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

    const walkPhase = t * (this.gait === 'hop' ? 9 : 12) * (this.walkRate ?? 1);
    if (moving && !frozen) {
      if (this.gait === 'hop') {
        const h = Math.abs(Math.sin(walkPhase * 0.5));
        bob = h * 0.12 * this.baseScale;
        this.inner.rotation.x = damp(this.inner.rotation.x, -0.12 + h * 0.15, 10, dt);
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
      if (this.gait === 'hop') this.inner.rotation.x = damp(this.inner.rotation.x, 0, 10, dt);
    }
    if (this.state === 'dance' && !frozen) {
      this.danceT += dt;
      bob = Math.abs(Math.sin(this.danceT * 8)) * 0.15 * this.baseScale;
      lean = Math.sin(this.danceT * 8) * 0.25;
      this.inner.rotation.y = Math.sin(this.danceT * 4) * 0.5;
    } else {
      this.inner.rotation.y = damp(this.inner.rotation.y, 0, 8, dt);
    }

    // squash spring
    this.squashV += (-this.squash * 170 - this.squashV * 11) * dt;
    this.squash += this.squashV * dt;
    let sq = this.squash;
    if (a >= 0) sq += wind * 0.08;
    if (this.state === 'stun') lean = Math.sin(t * 20) * 0.05;
    this.inner.position.y = bob;
    this.inner.rotation.z = damp(this.inner.rotation.z, lean, 10, dt);
    const s = this.baseScale;
    this.inner.scale.set(s * (1 - sq * 0.45), s * (1 + sq), s * (1 - sq * 0.45));
    if (this.gait === 'roll' && P.body) P.body.rotation.x = this.rollAngle;

    // per-part animation
    const sw = moving && !frozen ? Math.sin(walkPhase) : 0;
    for (const name in P) {
      const g = P[name];
      const br = g.userData.baseRot;
      const bp = g.userData.base;
      let rx = br.x, ry = br.y, rz = br.z, px = bp.x, py = bp.y, pz = bp.z;
      switch (name) {
        case 'legFL': case 'legBR': rx += sw * 0.7; break;
        case 'legFR': case 'legBL': rx -= sw * 0.7; break;
        case 'legL': rx += sw * 0.8; break;
        case 'legR': rx -= sw * 0.8; break;
        case 'armL': rx += -sw * 0.6 - wind * 1.6; break;
        case 'armR': rx += sw * 0.6 - wind * 1.9; break;
        case 'head':
          rx += -wind * 0.35 + (moving ? Math.sin(walkPhase * 2) * 0.04 : Math.sin(t * 1.7) * 0.03);
          pz += wind < 0 ? -wind * 0.12 : 0;
          break;
        case 'jaw': rx += open * 0.8; break;
        case 'lid': rx += -open * 1.4 + (this.state === 'idle' ? Math.max(0, Math.sin(t * 5)) * -0.06 : 0); break;
        case 'tail': ry += Math.sin(t * (moving ? 10 : 4)) * 0.5; rx += -0.2; break;
        case 'flag': rz += -open * 1.4; break;
        case 'spin': ry += (this.spinAngle += dt * (8 + open * 20)); break;
        case 'prop': ry += t * 30; break;
        case 'cannon': pz -= open > 0 ? 0 : Math.max(0, -wind) * 0.12; break;
        case 'wingL': rz += Math.sin(t * 22) * 0.6; break;
        case 'wingR': rz -= Math.sin(t * 22) * 0.6; break;
        case 'antenna': case 'antennaL': case 'antennaR': rz += Math.sin(t * 6 + (name === 'antennaR' ? 1 : 0)) * 0.2; break;
        default:
          if (name.startsWith('wheel')) rx += t * (moving ? 10 : 0);
          else if (name.startsWith('prop')) ry += t * 30;
          else if (name.startsWith('spin')) ry += t * (8 + (a >= 0 ? 16 : 0));
          else if (name.startsWith('antenna')) rz += Math.sin(t * 6 + name.length) * 0.2;
          else if (name.startsWith('arm')) rx += (name.endsWith('L') ? -sw : sw) * 0.5 - wind * 1.2;
          else if (name.startsWith('leg')) rx += (name.length % 2 ? sw : -sw) * 0.7;
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
