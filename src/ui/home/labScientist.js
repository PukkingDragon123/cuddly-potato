// YOUR scientist in the LAB tab's live lab (labStage.js): the equipped Commander
// (or the Lab Recruit with the helmet off) in a lab coat, goggles and nitrile
// gloves, working the lab on a little task scheduler: pouring between beakers,
// stirring, shaking a flask, taking notes, scribbling on the whiteboard, peering
// into the microscope and checking on the Swarm in the tube. When a research is
// running, most of the time goes into THAT project at the main bench (tinkering a
// tiny lab shack with a wrench, hammering armour plating, stirring a glowing
// potion, dosing the MEGA serum vat). Sometimes an experiment fizzes over and he
// jumps back. Hand-held props follow the hands in world space.
import * as THREE from 'three';
import { Chibi, definePoses } from '../../core/chibi.js';
import { Mats, makeMesh } from '../../core/voxel.js';
import { audio } from '../../core/audio.js';
import { HAND, PROJECT } from './labStageProps.js';
import { TILE } from './labStageFx.js';

const sin = Math.sin, cos = Math.cos, max = Math.max, abs = Math.abs;

// ---------------------------------------------------------------------------
// Work poses (registered once on the shared chibi pose table)

const lookDown = (p, k = 0.12) => { p.headRX = k; p.lookY = -1; p.lookOn = 1; };
// arms held out in front of the chest (hands visible under the chin, over the bench)
const holdL = (p, x = -1.15, z = -0.12, el = -0.75, ez = 0.35) => { p.armLX = x; p.armLZ = z; p.elbowL = el; p.elbowLZ = ez; p.hl = 'fist'; };
const holdR = (p, x = -1.15, z = 0.12, el = -0.75, ez = -0.35) => { p.armRX = x; p.armRZ = z; p.elbowR = el; p.elbowRZ = ez; p.hr = 'fist'; };
definePoses({
  labPour(t, p) {
    const tip = max(0, sin(t * 1.4));
    p.y = sin(t * 2.2) * 0.006;
    p.torsoRX = 0.06; lookDown(p, 0.1);
    holdL(p, -1.0, -0.2, -0.75, 0.3);
    holdR(p, -1.6 - tip * 0.3, 0.05, -0.5, -0.3);
    p.headRY = -0.1; p.lookX = -0.6;
  },
  labStir(t, p) {
    p.torsoRX = 0.08; lookDown(p, 0.12);
    holdL(p, -1.0, -0.12, -0.75, 0.4);
    holdR(p, -1.2 + sin(t * 7) * 0.1, 0.0 + cos(t * 7) * 0.12, -0.75, -0.55);
    p.headRZ = sin(t * 3.5) * 0.04;
  },
  labShake(t, p) {
    const s = sin(t * 28);
    p.torsoRX = 0.02; p.headRX = 0.04 + s * 0.02; p.headRZ = sin(t * 9) * 0.05;
    holdL(p, -1.45 + s * 0.08, 0.3, -0.45 + s * 0.12, 0.5);
    holdR(p, -1.45 + s * 0.08, -0.3, -0.45 + s * 0.12, -0.5);
    p.y = abs(s) * 0.01;
  },
  labNotes(t, p) {
    p.torsoRX = 0.14; lookDown(p, 0.16);
    holdR(p, -0.95 + sin(t * 13) * 0.04, -0.12 + cos(t * 11) * 0.05, -0.85, -0.35);
    holdL(p, -0.85, 0.12, -0.95, 0.6); p.hl = 'open';
  },
  labBoard(t, p) {
    const w = sin(t * 9), w2 = sin(t * 4.1);
    p.armRX = -1.85 + w2 * 0.16; p.armRZ = 0.12 + w * 0.06; p.elbowR = -0.35 + w * 0.06; p.hr = 'fist';
    p.armLZ = -0.8; p.armLX = 0.1; p.elbowLZ = 1.9; p.elbowL = 0; p.hl = 'fist';
    p.headRX = -0.12; p.headRZ = w2 * 0.05; p.torsoRY = 0.08;
  },
  labScope(t, p) {
    p.torsoRX = 0.42; p.headRX = 0.3; p.y = -0.02;
    holdL(p, -0.85, 0.12, -0.8, 0.3);
    holdR(p, -0.85, -0.12, -0.8 + sin(t * 2.6) * 0.12, -0.3);
    p.kneeL = p.kneeR = 0.08;
  },
  labTap(t, p) {
    const k = max(0, sin(t * 8));
    p.armRX = -1.5 - k * 0.08; p.armRZ = -0.05; p.elbowR = -0.25 - k * 0.2; p.hr = 'point';
    p.headRX = -0.18; p.lookY = 0.6; p.lookOn = 1;
    p.armLZ = -0.15; p.elbowL = -0.3;
  },
  labWrench(t, p) {
    p.torsoRX = 0.1; lookDown(p, 0.14);
    holdL(p, -1.0, 0.25, -0.8, 0.6);
    holdR(p, -1.15, -0.2, -0.7, -0.35 + sin(t * 6) * 0.32);
    p.headRZ = sin(t * 3) * 0.04;
  },
  labHammer(t, p) {
    const k = max(0, sin(t * 5.5));
    p.torsoRX = 0.08 + k * 0.04; lookDown(p, 0.14);
    holdL(p, -1.0, 0.28, -0.75, 0.6); p.hl = 'open';
    holdR(p, -0.9 - k * 1.3, -0.12, -0.6 - k * 0.5, -0.3);
  },
  labPipette(t, p) {
    p.torsoRX = 0.06; lookDown(p, 0.12);
    holdR(p, -1.55, -0.22, -0.85 + sin(t * 1.6) * 0.06, -0.5);
    holdL(p, -0.9, 0.12, -0.95, 0.6); p.hl = 'open';
    p.y = sin(t * 2) * 0.005;
  },
  labHoldUp(t, p) {
    const b = sin(t * 3);
    p.armLX = p.armRX = -2.2 + b * 0.05; p.armLZ = 0.25; p.armRZ = -0.25; p.elbowL = p.elbowR = -0.5; p.elbowLZ = 0.3; p.elbowRZ = -0.3;
    p.hl = p.hr = 'fist'; p.headRX = -0.2; p.y = abs(b) * 0.03;
  },
});

// ---------------------------------------------------------------------------
// Stations (world): where he stands, what he faces

const STATIONS = {
  bench: { x: 0, z: -0.66, face: 0 },
  notes: { x: 0.55, z: -0.66, face: 0.2 },
  board: { x: -2.24, z: -3.02, lookAt: [-2.55, -3.6] },
  scope: { x: 1.98, z: -0.05, face: Math.PI / 2 },
  tube: { x: -0.58, z: -1.52, lookAt: [-1.3, -2.5] },
};
// waypoints around the containment tube / bench corners
const VIA = { board: [[-2.25, -1.5], [-2.3, -2.6]], scope: [[1.75, -0.78]], tube: [] };

const BRANCH_TASK = { shack: 'wrench', power: 'charge', tanks: 'hammer', spells: 'potion', ultimate: 'serum', other: 'potion' };
const TASKS = {
  pour: { st: 'bench', pose: 'labPour', dur: 5.2 },
  stir: { st: 'bench', pose: 'labStir', dur: 4.5 },
  shake: { st: 'bench', pose: 'labShake', dur: 2.6 },
  notes: { st: 'notes', pose: 'labNotes', dur: 3.8 },
  board: { st: 'board', pose: 'labBoard', dur: 6.5 },
  scope: { st: 'scope', pose: 'labScope', dur: 5 },
  tube: { st: 'tube', pose: 'labTap', dur: 2.6 },
  wrench: { st: 'bench', pose: 'labWrench', dur: 6 },
  charge: { st: 'bench', pose: 'labWrench', dur: 5.5 },
  hammer: { st: 'bench', pose: 'labHammer', dur: 5.5 },
  potion: { st: 'bench', pose: 'labStir', dur: 5.5 },
  serum: { st: 'bench', pose: 'labPipette', dur: 6 },
};
const IDLE_POOL = ['pour', 'stir', 'shake', 'notes', 'board', 'pour', 'stir', 'scope', 'board', 'tube', 'shake'];

/** Research branch (src/data/research.js) -> the bench project the scientist works on. */
const KIND = { shack: 'shack', power: 'power', ult: 'ultimate', brawl: 'tanks', tank: 'tanks', shoot: 'tanks', fly: 'tanks', swarm: 'spells', spell: 'spells' };
export function branchKind(branch) {
  const b = String(branch ?? '').toLowerCase();
  if (KIND[b]) return KIND[b];
  if (/shack|base|build|hq/.test(b)) return 'shack';
  if (/power|energy|battery/.test(b)) return 'power';
  if (/tank|armou?r|brawl|shoot|fly|troop/.test(b)) return 'tanks';
  if (/spell|potion|magic|swarm/.test(b)) return 'spells';
  if (/ult|mega|commander|serum/.test(b)) return 'ultimate';
  return 'other';
}
export const BRANCH_COLOR = { shack: 0x4fb4ff, power: 0xffd23f, tanks: 0xa8b8d8, spells: 0xff5ab4, ultimate: 0xff9a2e, other: 0x7cff3a };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _hl = new THREE.Vector3(), _hr = new THREE.Vector3();
const tintGlow = (hex, k = 1.8) => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); m.color.setHex(hex).multiplyScalar(k); return m; };

export class Scientist {
  /** stage: { scene, fx, benchTop, onBoard(dt), tubeTap(), projectAt, sfx(name,o) } */
  constructor(stage) {
    this.stage = stage;
    this.ch = null;
    this.task = null;
    this.walk = null;
    this.research = null; // { kind, color }
    this.mats = [];
    this.props = {};
    this.lastTask = '';
    this.fizzIn = 22 + Math.random() * 14;
    this.busyT = 0; // reaction lock
    this.t = 0;
    this.ry = 0;
    this.buildProps();
  }

  // ------------------------------------------------------------------ build

  setDef(def, voice) {
    const key = JSON.stringify(def);
    if (this.ch && this.defKey === key) return false;
    const old = this.ch;
    const ch = new Chibi(def, { scale: 1.06 });
    ch.fidgets = false;
    ch.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (old) {
      ch.root.position.copy(old.root.position);
      ch.root.rotation.y = old.root.rotation.y;
      this.stage.scene.remove(old.root);
      old.face.texture?.dispose?.();
      old.facePlane?.material?.dispose?.();
    } else {
      ch.root.position.set(STATIONS.bench.x, 0, STATIONS.bench.z);
    }
    this.stage.scene.add(ch.root);
    this.ch = ch;
    this.defKey = key;
    this.voice = voice;
    this.task = null;
    this.walk = null;
    this.ry = ch.root.rotation.y;
    this.pickTask(true);
    return true;
  }

  buildProps() {
    const sc = this.stage.scene;
    const mk = (geo, mats) => {
      const m = makeMesh(geo, mats);
      m.castShadow = true;
      m.visible = false;
      sc.add(m);
      return m;
    };
    this.liqA = tintGlow(0x7cff3a);
    this.liqB = tintGlow(0xff2e88);
    this.liqF = tintGlow(0x3fe8ff);
    this.liqP = tintGlow(0xc063ff, 1.6);
    this.liqS = tintGlow(0xff2e88, 1.6);
    this.liqC = tintGlow(0xffd23f, 1.7);
    this.mats.push(this.liqA, this.liqB, this.liqF, this.liqP, this.liqS, this.liqC);
    const P = this.props;
    P.beakerL = mk(HAND.beaker(), [Mats.solid, this.liqA]);
    P.beakerR = mk(HAND.beaker(), [Mats.solid, this.liqB]);
    P.flask = mk(HAND.flask(), [Mats.solid, this.liqF]);
    P.rod = mk(HAND.rod(), Mats.pair);
    P.marker = mk(HAND.marker(), Mats.pair);
    P.wrench = mk(HAND.wrench(), Mats.pair);
    P.hammer = mk(HAND.hammer(), Mats.pair);
    P.syringe = mk(HAND.syringe(), Mats.pair);
    // bench projects (one per branch), parked on the bench centre when shown
    P.shack = mk(PROJECT.shack(), Mats.pair);
    P.plate = mk(PROJECT.plate(), Mats.pair);
    P.potion = mk(PROJECT.potion(), [Mats.solid, this.liqP]);
    P.serum = mk(PROJECT.serum(), [Mats.solid, this.liqS]);
    P.cell = mk(PROJECT.cell(), [Mats.solid, this.liqC]);
    // the idle beakers rest on the bench when nobody holds them
    this.rest = { beakerL: new THREE.Vector3(-0.42, 0, 0.22), beakerR: new THREE.Vector3(0.38, 0, 0.26), flask: new THREE.Vector3(-0.66, 0, 0.1) };
  }

  // ------------------------------------------------------------------ research

  setResearch(active) {
    const kind = active ? branchKind(active.branch) : null;
    const prev = this.research?.kind ?? null;
    this.research = active ? { kind, color: active.color ?? BRANCH_COLOR[kind], id: active.id } : null;
    if (this.research) {
      // the project glows in the branch colour
      const c = this.research.color;
      for (const m of [this.liqP, this.liqS, this.liqC]) m.color.setHex(c).multiplyScalar(1.7);
    }
    if (kind !== prev && this.ch && this.busyT <= 0) this.pickTask(true);
  }
  /** The current research project mesh (or null). */
  project() {
    const k = this.research?.kind;
    const P = this.props;
    return k === 'shack' ? P.shack : k === 'power' ? P.cell : k === 'tanks' ? P.plate : k === 'spells' ? P.potion : k === 'ultimate' ? P.serum : k ? P.potion : null;
  }

  // ------------------------------------------------------------------ scheduler

  pickTask(now = false) {
    let name;
    if (this.research && Math.random() < 0.72) name = BRANCH_TASK[this.research.kind] ?? 'potion';
    else {
      const pool = IDLE_POOL.filter((n) => n !== this.lastTask);
      name = pool[Math.floor(Math.random() * pool.length)];
    }
    this.startTask(name, now);
  }
  startTask(name, now = false) {
    const T = TASKS[name];
    if (!T || !this.ch) return;
    this.lastTask = name;
    this.task = { name, ...T, t: 0, beat: 0 };
    const st = STATIONS[T.st];
    const pos = this.ch.root.position;
    const far = Math.hypot(pos.x - st.x, pos.z - st.z) > 0.08;
    if (far && !now) {
      // walk there via the waypoints for that station (and back out via the bench ones)
      const pts = [];
      const fromSt = this.station;
      if (fromSt && fromSt !== 'bench' && fromSt !== 'notes' && VIA[fromSt]) pts.push(...VIA[fromSt].map(([x, z]) => new THREE.Vector3(x, 0, z)));
      if (VIA[T.st]) pts.push(...VIA[T.st].map(([x, z]) => new THREE.Vector3(x, 0, z)));
      pts.push(new THREE.Vector3(st.x, 0, st.z));
      this.walk = { pts, i: 0 };
      this.ch.play('walk');
      this.task.waiting = true;
    } else {
      if (far) pos.set(st.x, 0, st.z);
      this.arrive();
    }
  }
  arrive() {
    const T = this.task;
    this.walk = null;
    this.station = T.st;
    T.waiting = false;
    T.t = 0;
    this.ch.play(T.pose, { restart: true });
    if (T.name === 'board') this.ch.mood('focus', T.dur);
    else if (T.name === 'scope') this.ch.mood('think', T.dur * 0.6);
    else if (T.name === 'tube') this.ch.mood('happy', T.dur);
    else this.ch.mood('focus', T.dur * 0.7);
  }
  faceTarget() {
    const T = this.task, st = STATIONS[T?.st];
    if (!st) return this.ry;
    if (st.lookAt) { const p = this.ch.root.position; return Math.atan2(st.lookAt[0] - p.x, st.lookAt[1] - p.z); }
    return st.face ?? 0;
  }

  // ------------------------------------------------------------------ reactions

  /** Tapped: a short reaction (the voiced line is spoken by the stage UI). */
  poke() {
    const ch = this.ch;
    if (!ch) return;
    this.busyT = 1.6;
    this.walk = null;
    if (this.task) this.task.waiting = false;
    const r = Math.random();
    // turn to the camera for a moment
    this.faceCam = 1.6;
    if (r < 0.33) ch.react('wave', { dur: 1.4 });
    else if (r < 0.66) ch.react('thumbsUp', { dur: 1.4 });
    else ch.react('peace', { dur: 1.4 });
  }
  /** An experiment fizzes over: smoke puff, he jumps back, then shrugs it off. */
  fizz() {
    const ch = this.ch;
    if (!ch || this.station !== 'bench') return;
    const fx = this.stage.fx;
    const at = this.props.beakerR.visible ? this.props.beakerR.position : this.props.flask.visible ? this.props.flask.position : _v.set(0, 0.75, -0.1);
    const col = [0xb05cff, 0x7cff3a, 0xff8ad0, 0x6ad0ff][Math.floor(Math.random() * 4)];
    for (let i = 0; i < 14; i++) fx.spawn({ x: at.x + (Math.random() - 0.5) * 0.2, y: at.y + 0.1 + Math.random() * 0.1, z: at.z + (Math.random() - 0.5) * 0.2, vx: (Math.random() - 0.5) * 0.9, vy: 0.5 + Math.random() * 0.8, vz: (Math.random() - 0.2) * 0.6, drag: 1.6, life: 1.1 + Math.random() * 0.7, size: 0.12, size1: 0.32, tile: TILE.smoke, color: i % 3 ? col : 0xd8d8e8 });
    fx.burst(at, 10, { speed: 2.2, life: 0.5, size: 0.04, tile: TILE.spark, color: [0xffffff, 0xffe080, col], glow: 2.2, grav: -4 });
    this.stage.sfx('fizz', { vol: 0.55 });
    this.stage.sfx('pop', { pitch: 0.7, vol: 0.5 });
    ch.react('shock', { dur: 0.9 });
    ch.emote('!!', 1.2);
    this.jumpBack = 0.9;
    this.busyT = 2.6;
    setTimeout(() => { if (this.ch === ch) ch.react(Math.random() < 0.5 ? 'embarrassed' : 'laugh', { dur: 1.5 }); }, 950);
    this.stage.onFizz?.();
  }
  /** Research finished: hold the result up, cheer. */
  celebrate() {
    const ch = this.ch;
    if (!ch) return;
    this.walk = null;
    if (this.station !== 'bench' && this.station !== 'notes') {
      ch.root.position.set(STATIONS.bench.x, 0, STATIONS.bench.z);
      this.station = 'bench';
    }
    this.task = { name: 'cheer', st: 'bench', pose: 'labHoldUp', dur: 3.2, t: 0 };
    this.busyT = 3.4;
    this.faceCam = 3.2;
    ch.play('celebrate', { restart: true, dur: 1.6, then: 'labHoldUp', face: false });
    ch.mood('excited', 3.2);
    ch.boing(0.3);
  }

  // ------------------------------------------------------------------ frame

  update(dt) {
    const ch = this.ch;
    if (!ch) return;
    this.t += dt;
    const root = ch.root;
    if (this.busyT > 0) this.busyT -= dt;
    if (this.faceCam > 0) this.faceCam -= dt;
    // walking
    if (this.walk) {
      const W = this.walk, tgt = W.pts[W.i];
      const dx = tgt.x - root.position.x, dz = tgt.z - root.position.z, d = Math.hypot(dx, dz);
      const sp = 1.25 * dt;
      if (d <= sp) {
        root.position.x = tgt.x; root.position.z = tgt.z;
        W.i++;
        if (W.i >= W.pts.length) this.arrive();
      } else {
        root.position.x += (dx / d) * sp; root.position.z += (dz / d) * sp;
        this.ry = turn(this.ry, Math.atan2(dx, dz), dt * 9);
      }
    } else if (this.task && !this.task.waiting) {
      const want = this.faceCam > 0 ? Math.atan2(-root.position.x * 0.2, 1) : this.faceTarget();
      this.ry = turn(this.ry, want, dt * 7);
      if (this.busyT <= 0) {
        this.task.t += dt;
        this.tickTask(dt);
        if (this.task.t >= this.task.dur) {
          if (this.task.name === 'cheer') this.stage.onCheerDone?.();
          this.pickTask();
        }
      }
    }
    root.rotation.y = this.ry;
    // jump back from a fizz (and step back in)
    if (this.jumpBack > 0) {
      this.jumpBack -= dt;
      const k = this.jumpBack > 0.6 ? (0.9 - this.jumpBack) / 0.3 : max(0, this.jumpBack / 0.6);
      root.position.z = STATIONS.bench.z - k * 0.22;
      root.position.y = this.stepY() + (this.jumpBack > 0.6 ? sin(((0.9 - this.jumpBack) / 0.3) * Math.PI) * 0.12 : 0);
    } else root.position.y = this.stepY();
    // fizz now and then while pottering at the bench without a research
    if (!this.research && this.busyT <= 0 && this.task && !this.walk && (this.task.name === 'shake' || this.task.name === 'pour')) {
      this.fizzIn -= dt;
      if (this.fizzIn <= 0) { this.fizzIn = 28 + Math.random() * 26; this.fizz(); }
    }
    // the chibi (sub-stepped: its springs like small steps)
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < n; i++) ch.update(dt / n);
    this.placeProps(dt);
  }

  /** Height of the floor under him: the grated step behind the bench lifts him STEP. */
  stepY() {
    const p = this.ch.root.position;
    const PL = this.stage.platform;
    if (!PL) return 0;
    const dx = Math.max(0, Math.abs(p.x - PL.x) - PL.hw), dz = Math.max(0, Math.abs(p.z - PL.z) - PL.hd);
    return PL.h * Math.max(0, 1 - Math.hypot(dx, dz) / 0.25);
  }

  tickTask(dt) {
    const T = this.task, fx = this.stage.fx;
    T.beat += dt;
    if (T.name === 'board') this.stage.onBoard?.(dt);
    if (T.name === 'pour') {
      const tip = max(0, sin(this.ch.animT * 1.4));
      if (tip > 0.6 && T.beat > 0.05) {
        T.beat = 0;
        const a = this.props.beakerR.position;
        fx.spawn({ x: a.x - 0.05, y: a.y + 0.12, z: a.z, vx: -0.35, vy: 0.05, life: 0.42, size: 0.035, tile: TILE.drop, color: 0xff2e88, glow: 1.6, grav: -6 });
        if (Math.random() < 0.15) this.stage.sfx('pour', { vol: 0.25 });
      }
    } else if (T.name === 'shake' || T.name === 'potion') {
      if (T.beat > 0.12) {
        T.beat = 0;
        const a = (T.name === 'shake' ? this.props.flask : this.props.potion).position;
        fx.spawn({ x: a.x + (Math.random() - 0.5) * 0.06, y: a.y + (T.name === 'shake' ? 0.36 : 0.66), z: a.z, vx: (Math.random() - 0.5) * 0.15, vy: 0.4 + Math.random() * 0.3, life: 0.9, size: 0.035, size1: 0.05, tile: TILE.bubble, color: T.name === 'shake' ? 0x9ff4ff : 0xe0b0ff, wobble: 0.3 });
      }
    } else if (T.name === 'hammer') {
      const k = sin(this.ch.animT * 5.5);
      if (T.prevK > 0.2 && k <= 0.2) {
        // the hammer comes down on the plate: sparks + clank
        const a = this.props.plate.position;
        fx.burst(_w.set(a.x + 0.04, a.y + 0.36, a.z + 0.06), 8, { speed: 1.8, life: 0.45, size: 0.035, tile: TILE.spark, color: [0xffffff, 0xffe080, 0xffb040], glow: 2.4, grav: -5, zs: 1 });
        this.stage.sfx('hit', { pitch: 1.6 + Math.random() * 0.3, vol: 0.3 });
      }
      T.prevK = k;
    } else if (T.name === 'serum') {
      if (T.beat > 1.1) {
        T.beat = 0;
        const s = this.props.syringe.position;
        fx.spawn({ x: s.x, y: s.y - 0.06, z: s.z, vy: -0.2, life: 0.6, size: 0.035, tile: TILE.drop, color: 0xff2e88, glow: 2, grav: -4 });
      }
    } else if (T.name === 'charge') {
      if (T.beat > 0.5) {
        T.beat = 0;
        const a = this.props.cell.position;
        fx.burst(_w.set(a.x, a.y + 0.62, a.z), 3, { speed: 0.9, life: 0.35, size: 0.03, tile: TILE.spark, color: [0xffffff, 0xffe680], glow: 2.4, grav: -2 });
      }
    } else if (T.name === 'wrench') {
      if (T.beat > 0.9) { T.beat = 0; this.stage.sfx('tick', { pitch: 1.8, vol: 0.18 }); }
    } else if (T.name === 'tube') {
      if (T.beat > 0.7) { T.beat = 0; this.stage.tubeTap?.(); }
    } else if (T.name === 'scope') {
      if (T.t > T.dur - 1.1 && !T.idea) { T.idea = true; this.ch.react('idea', { dur: 1.1 }); }
    }
  }

  /** Hand props follow the hands (upright, turned with him); parked props sit on the bench. */
  placeProps() {
    const ch = this.ch, P = this.props, T = this.task;
    const name = T && !T.waiting && !this.walk ? T.name : 'walk';
    const use = USE[name] ?? {};
    const benchY = this.stage.benchTop;
    ch.handWorld(_hl, 'L');
    ch.handWorld(_hr, 'R');
    const ry = this.ry, c = cos(ry), s = sin(ry);
    // local (character) offset -> world
    const off = (out, base, x, y, z) => out.set(base.x + x * c + z * s, base.y + y, base.z - x * s + z * c);
    for (const k of ['beakerL', 'beakerR', 'flask', 'rod', 'marker', 'wrench', 'hammer', 'syringe']) {
      const m = P[k];
      const u = use[k];
      if (u) {
        m.visible = true;
        const hand = u.hand === 'L' ? _hl : u.hand === 'mid' ? _v.copy(_hl).add(_hr).multiplyScalar(0.5) : _hr;
        off(m.position, hand, u.x ?? 0, u.y ?? -0.1, u.z ?? 0.03);
        m.rotation.set(0, ry, 0);
        if (u.tilt) m.rotation.z = (typeof u.tilt === 'function' ? u.tilt(ch.animT) : u.tilt);
        if (u.pitch) m.rotation.x = typeof u.pitch === 'function' ? u.pitch(ch.animT) : u.pitch;
      } else if (this.rest[k]) {
        m.visible = true;
        m.position.set(this.rest[k].x, benchY, this.rest[k].z);
        m.rotation.set(0, 0, 0);
      } else m.visible = false;
    }
    // the research project sits on the bench centre (turntable spins while he tinkers)
    const proj = this.project();
    for (const k of ['shack', 'plate', 'potion', 'serum', 'cell']) if (P[k] !== proj && !P[k].userData.pop) P[k].visible = false;
    if (proj && !proj.userData.pop) {
      proj.visible = true;
      proj.position.set(0.02, benchY, 0.18);
      proj.rotation.set(0, proj === P.shack ? this.t * (name === 'wrench' ? 0.6 : 0.15) : proj === P.plate ? -0.25 : 0, 0);
      proj.scale.setScalar(1);
    }
    // hide the resting beakers behind a big project so they never overlap it
    if (proj === P.serum) { P.beakerR.visible = !!use.beakerR; }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.ch?.face.texture?.dispose?.();
    this.ch?.facePlane?.material?.dispose?.();
  }
}

// which props each task holds: hand, local offset from the hand (character space), tilt
const USE = {
  pour: {
    beakerL: { hand: 'L', y: -0.14, z: 0.05 },
    beakerR: { hand: 'R', y: -0.1, z: 0.05, tilt: (t) => max(0, sin(t * 1.4)) * 1.15 },
  },
  stir: { beakerL: { hand: 'L', y: -0.14, z: 0.06 }, rod: { hand: 'R', y: -0.2, z: 0.04, tilt: 0.25 } },
  shake: { flask: { hand: 'mid', y: -0.16, z: 0.07 } },
  notes: { marker: { hand: 'R', y: -0.08, z: 0.04, tilt: -0.6 } },
  board: { marker: { hand: 'R', y: -0.05, z: 0.05, pitch: -1.2 } },
  wrench: { wrench: { hand: 'R', y: -0.06, z: 0.05, pitch: -1.0, tilt: 0.3 } },
  charge: { wrench: { hand: 'R', y: -0.06, z: 0.05, pitch: -1.0, tilt: 0.3 } },
  hammer: { hammer: { hand: 'R', y: -0.04, z: 0.04, pitch: -1.2 } },
  potion: { rod: { hand: 'R', y: -0.18, z: 0.03, tilt: 0.2 } },
  serum: { syringe: { hand: 'R', y: -0.2, z: 0.04 } },
  cheer: {},
};

function turn(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, k);
}
