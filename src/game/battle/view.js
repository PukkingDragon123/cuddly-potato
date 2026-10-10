// Battle 3D view: renders the simulation with voxel models, particles,
// camera work, Commander reactions and lots of juice.
import * as THREE from 'three';
import { engine, addLights } from '../../core/engine.js';
import { VoxGrid, makeMesh, Mats } from '../../core/voxel.js';
import { fx, particles } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { animate, tween } from '../../core/tween.js';
import { damp, rand, pick, clamp, lerp } from '../../core/util.js';
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { SWARMS, SERIES } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { createSwarm } from '../../models/swarmModels.js';
import * as Props from '../../models/props.js';
import { floatText, speech } from '../../ui/ui.js';
import { LAB_X, LAB_HALF } from './sim.js';
import { state } from '../state.js';

const THEMES = {
  lab: { sky: 0x8fd3ff, fog: 0xbfe6ff, ground: 0x7ac75a, lane: 0xcbb98a },
  suburb: { sky: 0xffb38a, fog: 0xffd2b0, ground: 0x6fbf55, lane: 0x8a8f9a },
  mansion: { sky: 0x9ad8ff, fog: 0xd0ecff, ground: 0x5fb84a, lane: 0xe8d8a0 },
  mart: { sky: 0xfff0d8, fog: 0xffe8c8, ground: 0xe8e4dc, lane: 0xf4f0e8 },
  techno: { sky: 0x1a1f4a, fog: 0x2a2f6a, ground: 0x3a4466, lane: 0x5a6488 },
  reactor: { sky: 0x1a3a2a, fog: 0x2a5a3a, ground: 0x4a6a4a, lane: 0x6a7a5a },
  factory: { sky: 0xd8a87a, fog: 0xe8c09a, ground: 0x7d4a2d, lane: 0xb07a4a },
};

const SIDE_COLORS = [0x5fdc4a, 0xff4a4a];
const PROJ_COLORS = {
  sludge: [0x7a6a2a, 0x8fb23a], letters: [0xffffff, 0xf4f0e0], nuke: [0x7cff3a, 0xd4ff9a], zap: [0x9ff2ff, 0xffffff],
  laser: [0xff4fd8, 0x9ff2ff], missile: [0xdddddd, 0xff8a2a], fire: [0xff5a1f, 0xffd23f], fries: [0xffd23f, 0xf7c873],
  soda: [0x8a3a1a, 0xffe0c0], acid: [0x7cff3a, 0xb6ff3a],
};

// ---------------------------------------------------------------------------
// Fallback visuals (used if a prop factory is missing)

function fallbackLab(style, flip) {
  const g = new VoxGrid();
  const main = style === 'mansion' ? 0xf4ead0 : style === 'rival' ? 0x6a3a8a : 0xeaf2ff;
  const trim = style === 'mansion' ? 0xffd23f : 0xff2e88;
  g.box(-8, 0, -8, 7, 22, 7, main);
  g.box(-9, 22, -9, 8, 23, 8, trim);
  g.box(-3, 4, 8, 2, 16, 8, 0x29b6f6, true);
  g.box(-6, 0, 8, 5, 2, 8, trim);
  const root = new THREE.Group();
  const mesh = makeMesh(g.build({ scale: 0.2 }));
  root.add(mesh);
  const seat = new THREE.Object3D();
  seat.position.set(flip ? -1.2 : 1.2, 4.7, 0.3);
  root.add(seat);
  const core = new THREE.Object3D();
  core.position.set(0, 2, 1.7);
  root.add(core);
  return { root, seat, core, height: 4.7, width: 3.4, meshes: [mesh], setLevel() {}, setDamage() {}, update() {} };
}

function fallbackBackdrop(theme) {
  const t = THEMES[theme] || THEMES.lab;
  const root = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 40), new THREE.MeshLambertMaterial({ color: t.ground }));
  ground.position.set(0, -0.5, -12);
  ground.receiveShadow = true;
  root.add(ground);
  const lane = new THREE.Mesh(new THREE.BoxGeometry(64, 0.04, 6), new THREE.MeshLambertMaterial({ color: t.lane }));
  lane.position.y = 0.02;
  lane.receiveShadow = true;
  root.add(lane);
  for (let i = 0; i < 30; i++) {
    const h = rand(1, 5);
    const b = new THREE.Mesh(new THREE.BoxGeometry(rand(1, 3), h, rand(1, 3)), new THREE.MeshLambertMaterial({ color: pick([0x6a8acf, 0x8fbf6a, 0xcf8a6a, 0xdcdcdc]) }));
    b.position.set(rand(-34, 34), h / 2, rand(-22, -6));
    root.add(b);
  }
  return { root, breakables: [], update() {} };
}

function propOr(name, ...args) {
  try {
    if (typeof Props[name] === 'function') return Props[name](...args);
  } catch (e) {
    console.warn('prop failed', name, e);
  }
  return null;
}

function simpleVox(build, scale = 0.1) {
  const g = new VoxGrid();
  build(g);
  return makeMesh(g.build({ scale, pivot: 'center' }));
}

const projGeo = {};
function projectileMesh(kind) {
  if (!projGeo[kind]) {
    const c = PROJ_COLORS[kind] || [0xffffff, 0xdddddd];
    const g = new VoxGrid();
    switch (kind) {
      case 'letters':
        g.box(-2, 0, -1, 1, 0, 1, c[0]).set(-1, 0, 2, 0xff4a4a).set(0, 0, 2, 0x29b6f6);
        break;
      case 'missile':
        g.box(-1, -1, -3, 0, 0, 2, 0xdddddd).box(-1, -1, 3, 0, 0, 3, 0xff4a4a).box(-2, -2, -3, 1, 1, -3, 0x5a6488);
        break;
      case 'laser':
        g.box(-1, -1, -3, 0, 0, 3, c[0], true);
        break;
      case 'fries':
        g.box(0, -3, 0, 0, 3, 0, c[0]).box(1, -2, 0, 1, 2, 0, c[1]);
        break;
      case 'fire':
        g.sphere(-0.5, -0.5, -0.5, 1.6, 0xff8a1f, true);
        g.set(0, 1, 0, 0xffe14a, true);
        break;
      case 'nuke':
        g.sphere(-0.5, -0.5, -0.5, 1.8, c[0], true);
        break;
      case 'soda':
        g.sphere(-0.5, -0.5, -0.5, 1.4, 0x9a4a2a).set(0, 1, 0, 0xfff0e0);
        break;
      default:
        g.sphere(-0.5, -0.5, -0.5, 1.6, (x, y, z) => ((x + y + z) & 1 ? c[0] : c[1]));
    }
    projGeo[kind] = g.build({ pivot: 'center', scale: 0.1 });
  }
  const m = makeMesh(projGeo[kind]);
  m.castShadow = false;
  return m;
}

// ---------------------------------------------------------------------------

class UnitActor {
  constructor(view, u) {
    this.view = view;
    this.u = u;
    const rig = (this.rig = createSwarm(u.type, { variant: u.variant, skin: u.skin, scale: u.size, model: u.model }));
    rig.root.position.set(u.x, 0, u.z);
    rig.root.rotation.y = u.side === 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
    view.scene.add(rig.root);
    this.flying = !!SWARMS[u.type]?.traits?.flying;
    // hp bar
    const bw = Math.max(0.5, 0.42 * u.size);
    this.barW = bw;
    const bg = new THREE.Mesh(view.barGeo, view.barBgMat);
    bg.scale.set(bw + 0.06, 0.1, 0.02);
    const fill = new THREE.Mesh(view.barGeo, u.side === 0 ? view.barMat0 : view.barMat1);
    fill.scale.set(bw, 0.06, 0.03);
    fill.position.z = 0.01;
    this.bar = new THREE.Group();
    this.bar.add(bg, fill);
    this.barFill = fill;
    this.bar.visible = false;
    view.scene.add(this.bar);
    this.lastHp = u.hp;
    this.dustT = 0;
    this.danceT = 0;
    this.iceMesh = null;
    this.statusT = 0;
    this.scaleNow = 0.01;
    rig.inner.scale.setScalar(0.01);
    this.spawnT = 0;
  }
  update(dt) {
    const u = this.u, rig = this.rig;
    const p = rig.root.position;
    p.x = damp(p.x, u.x, 25, dt);
    const hover = this.flying ? 0.9 + Math.sin(this.view.t * 3 + u.id) * 0.1 : 0;
    p.y = u.y + hover;
    // state
    if (this.danceT > 0) {
      this.danceT -= dt;
      rig.setState('dance');
    } else if (u.state === 'walk') rig.setState('walk');
    else if (u.state === 'stun') rig.setState('stun');
    else rig.setState('idle');
    rig.frozen = u.state === 'frozen';
    rig.walkRate = (u.st.speed / 1.5) * (this.view.sim.sides[u.side].buffs.dance > 0 ? 1.35 : 1);
    // spawn pop-in + grow buff scale
    this.spawnT += dt;
    const target = u.size * (u.buffs.growScale ?? 1);
    if (this.spawnT < 0.35) {
      const k = this.spawnT / 0.35;
      rig.baseScale = target * (k < 0.7 ? (k / 0.7) * 1.2 : 1.2 - ((k - 0.7) / 0.3) * 0.2);
    } else rig.baseScale = damp(rig.baseScale, target, 8, dt);
    rig.update(dt);
    // knockback tumble
    rig.root.rotation.z = u.state === 'kb' ? damp(rig.root.rotation.z, (u.side === 0 ? 1 : -1) * 0.5, 12, dt) : damp(rig.root.rotation.z, 0, 10, dt);
    // dust
    if (u.state === 'walk' && !this.flying) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.35 + Math.random() * 0.3;
        fx.dust(new THREE.Vector3(p.x, 0, p.z), { count: 2, scale: 0.8 * u.size, color: this.view.dustColor });
      }
    }
    // hp bar
    const frac = Math.max(0, u.hp / u.maxHp);
    if (u.hp < u.maxHp - 0.5) this.bar.visible = true;
    this.barFill.scale.x = Math.max(0.001, this.barW * frac);
    this.barFill.position.x = -(this.barW * (1 - frac)) / 2;
    this.bar.position.set(p.x, p.y + rig.height * (rig.baseScale / Math.max(0.01, rig._h0 ?? rig.baseScale)) + 0.25, p.z + 0.3);
    // status fx
    this.statusT -= dt;
    if (this.statusT <= 0) {
      this.statusT = 0.15;
      const top = new THREE.Vector3(p.x, p.y + rig.height * 0.9, p.z);
      if (u.state === 'stun') fx.sparkle(top, { count: 2, color: 0xffd23f, speed: 1.5, life: 0.4 });
      if (u.buffs.burnT > 0) fx.fire(new THREE.Vector3(p.x, p.y + 0.3, p.z), { count: 2, scale: 0.7 });
      if (u.buffs.slowT > 0 && u.buffs.slow > 0) fx.slime(new THREE.Vector3(p.x, p.y + 0.2, p.z), { count: 1, speed: 0.5, color: 0x7cff3a, scale: 0.6 });
      if (this.view.sim.sides[u.side].buffs.dance > 0) fx.sparkle(top, { count: 1, colors: [0xff4fa3, 0xffd23f, 0x5fdc4a, 0x29b6f6], speed: 1, life: 0.6 });
      if (this.view.sim.sides[u.side].buffs.immortal > 0) fx.sparkle(top, { count: 1, color: 0xffe27a, speed: 0.8 });
    }
    // frozen ice block
    if (u.state === 'frozen' && !this.iceMesh) {
      this.iceMesh = new THREE.Mesh(this.view.iceGeo, this.view.iceMat);
      this.view.scene.add(this.iceMesh);
    }
    if (this.iceMesh) {
      if (u.state !== 'frozen') {
        fx.burst(this.iceMesh.position, { count: 10, colors: [0x9ff2ff, 0xffffff], size: 0.08, speed: 3 });
        this.view.scene.remove(this.iceMesh);
        this.iceMesh = null;
      } else {
        const s = Math.max(rig.height, 0.6) * 1.1;
        this.iceMesh.scale.set(s * 0.9, s, s * 0.9);
        this.iceMesh.position.set(p.x, p.y + s / 2, p.z);
      }
    }
  }
  dispose() {
    this.view.scene.remove(this.rig.root);
    this.view.scene.remove(this.bar);
    if (this.iceMesh) this.view.scene.remove(this.iceMesh);
  }
}

// ---------------------------------------------------------------------------

export class BattleView {
  constructor(sim, cfg) {
    this.sim = sim;
    this.cfg = cfg;
    this.t = 0;
    const theme = (this.theme = cfg.theme || 'lab');
    const T = THEMES[theme] || THEMES.lab;
    this.dustColor = theme === 'mart' ? 0xdedad0 : theme === 'techno' ? 0x8090b0 : undefined;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(T.sky);
    scene.fog = new THREE.Fog(T.fog, 30, 70);
    this.camera = new THREE.PerspectiveCamera(34, engine.aspect, 0.1, 200);
    const { sun } = addLights(scene, { shadowExtent: 24, dir: [-6, 14, 10], sun: theme === 'techno' ? 1.4 : 2.1, hemi: theme === 'techno' ? 1.6 : 1.25 });
    this.sun = sun;

    // backdrop
    const bd = propOr('makeBattleBackdrop', theme) || fallbackBackdrop(theme);
    this.backdrop = bd;
    scene.add(bd.root);
    this.breakables = (bd.breakables || []).map((b) => ({ ...b, alive: true }));

    // shared meshes
    this.barGeo = new THREE.BoxGeometry(1, 1, 1);
    this.barBgMat = new THREE.MeshBasicMaterial({ color: 0x15121f });
    this.barMat0 = new THREE.MeshBasicMaterial({ color: 0x5fdc4a });
    this.barMat1 = new THREE.MeshBasicMaterial({ color: 0xff4a4a });
    this.iceGeo = new THREE.BoxGeometry(1, 1, 1);
    this.iceMat = new THREE.MeshPhongMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.45, shininess: 100, depthWrite: false });

    // labs
    this.labs = [0, 1].map((i) => {
      const style = cfg.sides[i].labStyle || (i === 0 ? 'default' : 'rival');
      const lab = propOr('makeLabBuilding', { style, flip: i === 1 }) || fallbackLab(style, i === 1);
      lab.root.position.set(i === 0 ? -LAB_X - 0.4 : LAB_X + 0.4, 0, 0);
      scene.add(lab.root);
      lab.style = style;
      lab.shakeT = 0;
      return lab;
    });
    // commanders on labs
    this.cmds = [0, 1].map((i) => {
      const c = cfg.sides[i].commander;
      if (!c) return null;
      const def = { ...CHARACTERS[c.char ?? c.id], ...(c.override ?? {}) };
      const ch = new Chibi(def, { scale: 0.9 });
      ch.play('sit');
      const lab = this.labs[i];
      lab.seat.updateWorldMatrix(true, false);
      const wp = new THREE.Vector3().setFromMatrixPosition(lab.seat.matrixWorld);
      ch.root.position.copy(wp);
      ch.root.rotation.y = i === 0 ? 0.55 : -0.55;
      ch.home = wp.clone();
      scene.add(ch.root);
      ch.side = i;
      ch.reactT = 0;
      return ch;
    });

    this.actors = new Map();
    this.projs = new Map();
    this.movers = new Map();
    this.zones = [];
    // camera
    this.camX = -6;
    this.camTargetX = -6;
    this.manualT = 0;
    this.zoom = 1;
    this.aimRing = null;
    this.updateCamera(0, true);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------------------
  updateCamera(dt, snap = false) {
    const sim = this.sim;
    const aspect = this.camera.aspect;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const wantWidth = aspect >= 1 ? 22 : 12.5;
    let dist = (wantWidth / (2 * tanV * aspect)) * this.zoom;
    dist = clamp(dist, 9, 46);
    this.dist = dist;
    const halfW = dist * tanV * aspect;
    if (this.manualT > 0) this.manualT -= dt;
    else {
      // auto-follow: frame the battle front
      const f0 = sim.frontAllyX(0);
      const fe = sim.frontEnemyX(0);
      let tx = f0;
      if (fe !== null) tx = (f0 + fe) / 2;
      tx = Math.max(tx - 2, -LAB_X + halfW - 2.5);
      this.camTargetX = tx;
    }
    const minX = -LAB_X - 3 + halfW, maxX = LAB_X + 3 - halfW;
    this.camTargetX = minX > maxX ? 0 : clamp(this.camTargetX, minX, maxX);
    this.camX = snap ? this.camTargetX : damp(this.camX, this.camTargetX, 3.5, dt);
    const cam = this.camera;
    cam.position.set(this.camX, 2.2 + dist * 0.16, dist);
    cam.lookAt(this.camX, 1.25 + dist * 0.02, 0);
    // sun follows camera so shadows stay crisp
    this.sun.position.set(this.camX - 6, 14, 10);
    this.sun.target.position.set(this.camX, 0, 0);
  }
  pan(dxPixels) {
    const worldPerPx = (2 * this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect) / engine.width;
    this.camTargetX -= dxPixels * worldPerPx;
    this.camX -= dxPixels * worldPerPx;
    this.manualT = 4;
  }
  zoomBy(f) {
    this.zoom = clamp(this.zoom * f, 0.6, 1.6);
  }
  focus(x, hold = 2) {
    this.camTargetX = x;
    this.manualT = hold;
  }

  setAim(spellId, x) {
    if (!spellId) {
      if (this.aimRing) {
        this.scene.remove(this.aimRing);
        this.aimRing = null;
      }
      return;
    }
    const sp = SPELLS[spellId];
    if (!this.aimRing) {
      const geo = new THREE.RingGeometry(0.9, 1, 40);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(sp.color), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
      this.aimRing = new THREE.Mesh(geo, mat);
      this.aimRing.rotation.x = -Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(sp.color), transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      this.aimRing.add(disc);
      this.scene.add(this.aimRing);
    }
    this.aimRing.material.color.set(sp.color);
    const r = Math.max(0.8, sp.radius);
    this.aimRing.scale.set(r, r, r);
    this.aimRing.position.set(clamp(x, -LAB_X + 1, LAB_X - 1), 0.06, 0);
  }

  // -------------------------------------------------------------------------
  update(dt, gdt) {
    this.t += dt;
    const sim = this.sim;
    for (const ev of sim.drainEvents()) this.onEvent(ev);
    for (const a of this.actors.values()) a.update(gdt);
    this.updateProjectiles(gdt);
    this.updateMovers(gdt);
    for (const lab of this.labs) {
      lab.update && lab.update(gdt);
      if (lab.shakeT > 0) {
        lab.shakeT -= dt;
        lab.root.position.y = Math.sin(this.t * 60) * 0.03 * (lab.shakeT > 0 ? 1 : 0);
      }
    }
    this.backdrop.update && this.backdrop.update(dt);
    this.updateCommanders(dt);
    for (const z of this.zones) z.update(gdt);
    this.zones = this.zones.filter((z) => !z.done);
    if (this.aimRing) this.aimRing.rotation.z += dt * 0.8;
    this.updateCamera(dt);
  }

  updateCommanders(dt) {
    for (const ch of this.cmds) {
      if (!ch) continue;
      ch.update(dt);
      if (ch.busy) continue;
      ch.reactT -= dt;
      const s = this.sim.sides[ch.side];
      if (ch.reactT <= 0 && !this.sim.over) {
        if (s.sig >= 1) {
          ch.play('sitCheer');
          ch.expr('star', 'grin');
        } else if (s.labHp < s.labMaxHp * 0.35) {
          ch.play('sitWorried');
          ch.expr('shock', 'wobble');
        } else {
          ch.play('sit');
          ch.expr('normal', 'smile');
        }
        ch.reactT = 0.5;
      }
    }
  }

  react(side, anim, eyes, mouth, dur = 1.2, line) {
    const ch = this.cmds[side];
    if (!ch || ch.busy) return;
    ch.play(anim);
    ch.expr(eyes, mouth, dur);
    ch.reactT = dur;
    if (line) speech(ch, line, Math.min(2.2, dur + 0.6));
  }

  /** Commander stands up, performs an animation, then sits back down. */
  async perform(side, anim, dur, eyes = 'determined', mouth = 'grin') {
    const ch = this.cmds[side];
    if (!ch) return;
    ch.busy = true;
    ch.play(anim, { restart: true, dur, then: 'idle' });
    ch.expr(eyes, mouth, dur + 0.2);
    ch.boing(0.3);
    await new Promise((r) => setTimeout(r, dur * 1000 + 200));
    ch.play('sit');
    ch.busy = false;
  }

  // -------------------------------------------------------------------------
  // Event handling

  onEvent(ev) {
    switch (ev.type) {
      case 'spawn': {
        const a = new UnitActor(this, ev.unit);
        a.rig._h0 = a.rig.baseScale;
        this.actors.set(ev.unit.id, a);
        const p = new THREE.Vector3(ev.unit.x, 0.3, ev.unit.z);
        const col = SERIES[SWARMS[ev.unit.type]?.series]?.color ?? '#7cff3a';
        fx.slime(p, { count: 10, color: parseInt(col.slice(1), 16), speed: 3 });
        fx.bubbles(p, { count: 5, color: parseInt(col.slice(1), 16) });
        if (ev.unit.boss) {
          engine.shake(0.6);
          audio.play('roar', { pitch: 0.7 });
        } else audio.play('spawn', { pitch: 0.9 + Math.random() * 0.3, gap: 0.05 });
        break;
      }
      case 'deploy':
        if (ev.side === 0) this.react(0, 'sitCheer', 'happy', 'grin', 0.6);
        break;
      case 'attack': {
        const a = this.actors.get(ev.unit.id);
        if (a) {
          a.rig.attack(Math.max(0.3, ev.dur));
          if (SWARMS[ev.unit.type]?.traits?.kamikaze) break;
        }
        const role = SWARMS[ev.unit.type]?.role;
        if (role !== 'ranged') audio.play('swing', { pitch: 1.4 / Math.max(0.6, ev.unit.size), gap: 0.05 });
        break;
      }
      case 'hit': {
        const a = this.actors.get(ev.unit.id);
        if (!a) break;
        a.rig.flash(0.07);
        a.rig.boing(-0.15);
        const p = a.rig.root.position;
        const at = new THREE.Vector3(p.x, p.y + a.rig.height * 0.6, p.z + 0.2);
        const kind = ev.kind;
        if (kind === 'melee') fx.burst(at, { count: 5, colors: [0xffffff, 0xffe27a], size: 0.06, speed: 3, life: 0.3, grav: -5 });
        else if (kind === 'sludge') fx.slime(at, { count: 6, color: 0x8fb23a, speed: 2.5 });
        else if (kind === 'fries') fx.burst(at, { count: 6, colors: [0xffd23f, 0xf7c873], size: 0.07, speed: 3 });
        else if (kind === 'fire' || kind === 'burn') fx.fire(at, { count: 4 });
        else if (kind === 'zap' || kind === 'laser') fx.sparkle(at, { count: 6, colors: [0x9ff2ff, 0xffffff, 0xff4fd8], speed: 3 });
        else if (kind === 'money') fx.cash(at, 4, { speed: 3, ground: 0 });
        else fx.burst(at, { count: 4, colors: [0xffffff], size: 0.05, speed: 2, life: 0.3 });
        if (ev.amount >= 1) floatText(at, String(ev.amount), ev.crit ? 'crit' : 'dmg', { life: ev.crit ? 1.1 : 0.8 });
        audio.play(kind === 'melee' ? (ev.src?.size > 1.4 ? 'hitHeavy' : pick(['hit', 'bite', 'chomp'])) : kind === 'sludge' ? 'splat' : 'hit', { pitch: 0.8 + Math.random() * 0.4, gap: 0.04 });
        if (ev.crit || (ev.src && ev.src.size > 1.6)) {
          engine.shake(0.18);
          engine.hitstop(0.04);
        }
        break;
      }
      case 'kb': {
        const a = this.actors.get(ev.unit.id);
        if (a) {
          a.rig.boing(0.4);
          a.rig.flash(0.12, true);
          fx.dust(a.rig.root.position, { count: 6, scale: 1.4 });
          audio.play('boing', { pitch: 1.2, gap: 0.08 });
        }
        break;
      }
      case 'death': {
        const a = this.actors.get(ev.unit.id);
        if (a) {
          const big = ev.unit.size > 1.5 || ev.unit.boss;
          for (const m of a.rig.meshes) fx.shatter(m, { force: big ? 7 : 5, dirX: ev.unit.side === 0 ? -0.6 : 0.6, life: big ? 2.2 : 1.5 });
          const p = a.rig.root.position.clone();
          fx.smoke(p, { count: big ? 10 : 4, scale: big ? 1.6 : 0.8 });
          if (ev.unit.type === 'feastablesPanther' || ev.unit.type === 'chocoChomper') fx.chocolate(p.clone().setY(0.6), { count: 30 });
          if (SWARMS[ev.unit.type]?.series === 'food') fx.groceries(p.clone().setY(0.5), { count: 6 });
          audio.play(big ? 'explode' : 'death', { pitch: 0.8 + Math.random() * 0.4, gap: 0.03 });
          if (big) {
            engine.shake(0.5);
            engine.hitstop(0.08);
          }
          if (ev.bounty && ev.killerSide === 0 && !ev.silent) floatText(p.clone().setY(1.2), `+${ev.bounty}`, 'energy', { life: 1.1, rise: 70 });
          if (ev.killerSide === 0 && Math.random() < 0.3) this.react(0, 'sitCheer', 'happy', 'grin', 0.8);
          if (ev.killerSide === 1 && Math.random() < 0.3) this.react(1, 'sitCheer', 'happy', 'tongue', 0.8);
          a.dispose();
          this.actors.delete(ev.unit.id);
          this.smashNear(p.x, big ? 2 : 0.8, ev.unit.side);
        }
        break;
      }
      case 'shoot':
        this.addProjectile(ev.proj);
        break;
      case 'projHit':
        this.removeProjectile(ev.proj);
        break;
      case 'areaHit':
        this.areaFxAt(ev.x, ev.kind, ev.unit.side, 0.9);
        break;
      case 'areaFx':
        break;
      case 'chain':
        this.lightning(ev.unit, ev.xs);
        break;
      case 'explode': {
        const p = new THREE.Vector3(ev.x, 0.5, ev.unit.z);
        fx.burst(p, { count: 30, colors: [0xffd23f, 0xfff4e0, 0xff8a2a], size: 0.12, speed: 7 });
        fx.fire(p, { count: 16, radius: 3 });
        fx.shockwave(p.clone().setY(0), { radius: 3, color: 0xffd23f });
        fx.smoke(p, { count: 10, scale: 1.4 });
        audio.play('explode');
        engine.shake(0.45);
        engine.hitstop(0.06);
        const a = this.actors.get(ev.unit.id);
        if (a) {
          for (const m of a.rig.meshes) fx.shatter(m, { force: 8 });
          a.dispose();
          this.actors.delete(ev.unit.id);
        }
        this.smashNear(ev.x, 2.2, ev.unit.side);
        break;
      }
      case 'labHit': {
        const lab = this.labs[ev.side];
        lab.shakeT = 0.12;
        const s = this.sim.sides[ev.side];
        lab.setDamage && lab.setDamage(1 - s.labHp / s.labMaxHp);
        const fx0 = ev.side === 0 ? -LAB_X + LAB_HALF : LAB_X - LAB_HALF;
        const p = new THREE.Vector3(fx0, rand(0.8, 3), rand(-0.5, 1.2));
        fx.burst(p, { count: 4, colors: lab.style === 'mansion' ? [0xf4ead0, 0xffd23f] : [0xeaf2ff, 0x29b6f6, 0xff2e88], size: 0.12, speed: 4, vx: ev.side === 0 ? 2 : -2 });
        if (ev.amount >= 1) floatText(p, String(ev.amount), ev.amount > 150 ? 'crit' : 'dmg', { life: 0.9 });
        audio.play('crunch', { pitch: 0.7 + Math.random() * 0.3, gap: 0.08 });
        if (ev.amount > 120) engine.shake(0.25);
        if (Math.random() < 0.15) this.react(ev.side, 'sitWorried', 'shock', 'shout', 0.9, ev.side === 1 ? pick(['Hey!', 'My Lab!', 'Not the Lab!', 'OUCH!']) : null);
        break;
      }
      case 'shieldHit': {
        const lab = this.labs[ev.side];
        if (lab.bubble) {
          lab.bubble.material.opacity = 0.6;
        }
        break;
      }
      case 'labUp': {
        const lab = this.labs[ev.side];
        lab.setLevel && lab.setLevel(ev.level);
        lab.core.updateWorldMatrix(true, false);
        const p = new THREE.Vector3().setFromMatrixPosition(lab.core.matrixWorld);
        fx.sparkle(p, { count: 24, colors: [0x29b6f6, 0xff2e88, 0xffd23f], speed: 4, radius: 2 });
        fx.rise(p.clone().setY(0.2), { count: 20, colors: [0x29b6f6, 0x9ff2ff], radius: 1.4 });
        if (ev.side === 0) {
          floatText(p.clone().setY(p.y + 1.6), `LAB LV ${ev.level}!`, 'big', { life: 1.4, rise: 40 });
          audio.play('upgrade');
          this.react(0, 'sitCheer', 'star', 'grin', 1);
        }
        lab.root.scale.set(1.06, 0.94, 1.06);
        tween(lab.root.scale, { x: 1, y: 1, z: 1 }, 0.4, { ease: 'outElastic' });
        break;
      }
      case 'grow': {
        const a = this.actors.get(ev.unit.id);
        if (a) {
          a.rig.boing(0.6);
          fx.rise(a.rig.root.position, { count: 10, colors: [0x5fdc4a, 0xd4ff9a], radius: 0.5 });
        }
        break;
      }
      case 'shrink': {
        const a = this.actors.get(ev.unit.id);
        if (a) a.rig.boing(-0.3);
        break;
      }
      case 'heal': {
        const a = this.actors.get(ev.unit.id);
        if (a && ev.amount > 3) {
          const p = a.rig.root.position;
          floatText(new THREE.Vector3(p.x, p.y + a.rig.height + 0.2, p.z), `+${ev.amount}`, 'heal', { life: 0.8 });
        }
        break;
      }
      case 'healBurst':
        fx.rise(new THREE.Vector3(ev.x, 0.1, 0), { count: 20, colors: [0x5fdc4a, 0xd4ff9a], radius: 2.4 });
        audio.play('heal');
        break;
      case 'energyGain':
        if (ev.side === 0) audio.play('chaching');
        break;
      case 'spell':
        this.spellFx(ev);
        break;
      case 'impact':
        this.impactFx(ev);
        break;
      case 'signature':
        this.signatureFx(ev);
        break;
      case 'skill':
        this.skillFx(ev);
        break;
      case 'moverStart':
        this.addMover(ev.mover);
        break;
      case 'moverHit': {
        const a = this.actors.get(ev.unit.id);
        if (a) {
          const p = a.rig.root.position;
          if (ev.mover.kind === 'truck') {
            fx.burst(new THREE.Vector3(p.x, 0.6, p.z), { count: 10, colors: [0xffffff, 0xffd23f], speed: 6, size: 0.08 });
            audio.play('hitHeavy', { pitch: 1.2, gap: 0.05 });
            engine.shake(0.2);
          } else {
            fx.sparkle(new THREE.Vector3(p.x, 0.6, p.z), { count: 8, color: 0xffffff, speed: 4 });
            audio.play('kick', { gap: 0.05 });
          }
        }
        break;
      }
      case 'moverEnd':
        this.endMover(ev.mover, ev.x);
        break;
      case 'bossSlam': {
        const a = this.actors.get(ev.unit.id);
        if (a) {
          a.rig.attack(0.7);
          audio.play('roar', { pitch: 0.6 });
          setTimeout(() => {
            if (!a.rig.root.parent) return;
            const p = a.rig.root.position;
            fx.impact(new THREE.Vector3(p.x - 1.5, 0, p.z), { radius: 4, colors: [0x8fb23a, 0x7a6a2a, 0xd8c4a0] });
            engine.shake(0.6);
            audio.play('thud', { pitch: 0.6 });
            this.smashNear(p.x, 3.5, 1);
          }, 550);
        }
        break;
      }
      case 'bossDown':
        engine.timeScale = 0.35;
        setTimeout(() => (engine.timeScale = 1), 900);
        fx.confetti(new THREE.Vector3(ev.unit.x, 2, 0), { count: 80 });
        audio.play('cheer');
        break;
      case 'overtime':
        audio.play('bell');
        break;
      case 'end':
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Projectiles

  addProjectile(p) {
    const mesh = projectileMesh(p.kind);
    const a = this.actors.get(p.src.id);
    const start = a ? a.rig.muzzleWorld(new THREE.Vector3()) : new THREE.Vector3(p.x0, p.height, 0);
    mesh.position.copy(start);
    this.scene.add(mesh);
    const z1 = 0;
    this.projs.set(p.id, { p, mesh, start, z1, trailT: 0 });
    const snd = { sludge: 'splat', letters: 'whoosh', nuke: 'zap', zap: 'zap', laser: 'laser', missile: 'whoosh', fire: 'whoosh', fries: 'swing', soda: 'fizz' }[p.kind] || 'shoot';
    audio.play(snd, { pitch: 1 + Math.random() * 0.3, gap: 0.05 });
    if (p.kind === 'laser' || p.kind === 'zap') fx.sparkle(start, { count: 4, colors: PROJ_COLORS[p.kind], speed: 2 });
  }
  updateProjectiles(dt) {
    for (const pr of this.projs.values()) {
      const p = pr.p;
      const k = Math.min(1, p.t / p.flight);
      const lob = ['sludge', 'letters', 'nuke', 'fries', 'fire', 'acid'].includes(p.kind);
      let tz = 0;
      const ta = p.target && !p.target.lab ? this.actors.get(p.target.id) : null;
      const ty = ta ? ta.rig.root.position.y + ta.rig.height * 0.5 : 1.2;
      if (ta) tz = ta.rig.root.position.z;
      const x = pr.start.x + (p.tx - pr.start.x) * k;
      const yLine = pr.start.y + (ty - pr.start.y) * k;
      const arc = lob ? Math.sin(k * Math.PI) * (1 + Math.abs(p.tx - pr.start.x) * 0.15) : 0;
      const z = pr.start.z + (tz - pr.start.z) * k;
      const m = pr.mesh;
      const prev = m.position.clone();
      m.position.set(x, yLine + arc, z);
      if (p.kind === 'letters' || p.kind === 'fries') { m.rotation.x += dt * 14; m.rotation.z += dt * 9; }
      else m.lookAt(m.position.clone().add(m.position.clone().sub(prev)));
      pr.trailT -= dt;
      if (pr.trailT <= 0) {
        pr.trailT = 0.04;
        const cols = PROJ_COLORS[p.kind] || [0xffffff];
        if (p.kind === 'missile') fx.smoke(m.position, { count: 1, scale: 0.4, life: 0.5 });
        else if (p.kind === 'fire') fx.fire(m.position, { count: 2, radius: 0.3 });
        else if (['nuke', 'laser', 'zap'].includes(p.kind)) fx.sparkle(m.position, { count: 1, colors: cols, speed: 0.3, life: 0.3 });
        else if (p.kind === 'soda') fx.bubbles(m.position, { count: 1, color: 0xffe0c0, radius: 0.05 });
        else if (p.kind === 'sludge') fx.slime(m.position, { count: 1, color: cols[1], speed: 0.3, scale: 0.6 });
      }
    }
  }
  removeProjectile(p) {
    const pr = this.projs.get(p.id);
    if (!pr) return;
    this.scene.remove(pr.mesh);
    this.projs.delete(p.id);
    const pos = pr.mesh.position.clone();
    const cols = PROJ_COLORS[p.kind] || [0xffffff];
    switch (p.kind) {
      case 'nuke':
        fx.burst(pos, { count: 18, colors: [0x7cff3a, 0xd4ff9a, 0xffffff], size: 0.1, speed: 5, layer: 'glow' });
        fx.shockwave(pos.clone().setY(0), { radius: 1.6, color: 0x7cff3a });
        audio.play('explode', { pitch: 1.5, gap: 0.05 });
        engine.shake(0.15);
        break;
      case 'missile':
        fx.burst(pos, { count: 14, colors: [0xffd23f, 0xff8a2a, 0x555555], size: 0.1, speed: 5 });
        fx.smoke(pos, { count: 4 });
        audio.play('explode', { pitch: 1.8, vol: 0.6, gap: 0.05 });
        engine.shake(0.12);
        break;
      case 'letters':
        fx.burst(pos, { count: 10, colors: [0xffffff, 0xf4f0e0, 0xff4a4a, 0x29b6f6], size: 0.07, speed: 4, flutter: 0.6 });
        break;
      case 'soda':
        fx.bubbles(pos, { count: 6, color: 0xffe0c0 });
        break;
      default:
        fx.burst(pos, { count: 6, colors: cols, size: 0.07, speed: 3 });
    }
  }

  lightning(unit, xs) {
    const a = this.actors.get(unit.id);
    let from = a ? a.rig.muzzleWorld(new THREE.Vector3()) : new THREE.Vector3(unit.x, 1, 0);
    for (const x of xs) {
      const to = new THREE.Vector3(x, 0.7, rand(-0.6, 0.6));
      const n = Math.ceil(from.distanceTo(to) / 0.15);
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const jitter = Math.sin(k * Math.PI) * 0.25;
        particles.spawn('glow', {
          x: lerp(from.x, to.x, k) + rand(-jitter, jitter), y: lerp(from.y, to.y, k) + rand(-jitter, jitter), z: lerp(from.z, to.z, k),
          size: 0.07, life: 0.18, grav: 0, color: pick([0x9ff2ff, 0xffffff, 0xffd23f]),
        });
      }
      from = to;
    }
    audio.play('zap', { pitch: 1.3 });
  }

  areaFxAt(x, kind, side, r) {
    const p = new THREE.Vector3(x, 0.4, rand(-0.4, 0.4));
    if (kind === 'melee') {
      fx.burst(p, { count: 10, colors: [0xffffff, 0xffe27a, 0xd8c4a0], size: 0.08, speed: 5 });
      fx.shockwave(p.clone().setY(0), { radius: r * 1.4, color: 0xffffff });
    } else if (kind === 'nuke') {
      // handled by projectile impact
    } else if (kind === 'letters') {
      // handled by projectile
    }
  }

  smashNear(x, r, side) {
    for (const b of this.breakables) {
      if (!b.alive || Math.abs(b.x - x) > r) continue;
      b.alive = false;
      b.obj.updateMatrixWorld(true);
      b.obj.traverse((o) => { if (o.isMesh) fx.shatter(o, { force: 5, life: 1.8 }); });
      const wp = new THREE.Vector3();
      b.obj.getWorldPosition(wp);
      if (b.kind === 'cart' || b.kind === 'shelf' || b.kind === 'products') fx.groceries(wp.clone().setY(0.6), { count: 10 });
      b.obj.visible = false;
      audio.play(b.kind === 'cart' ? 'crunch' : 'shatter', { gap: 0.05 });
      if (b.kind === 'cart') this.cartsSmashed = (this.cartsSmashed ?? 0) + 1;
      setTimeout(() => { b.obj.visible = true; b.alive = true; b.obj.scale.setScalar(0.01); tween(b.obj.scale, { x: 1, y: 1, z: 1 }, 0.5, { ease: 'outBack' }); }, 14000);
    }
  }

  // -------------------------------------------------------------------------
  // Spells

  labTop(side) {
    const lab = this.labs[side];
    lab.core.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(lab.core.matrixWorld);
    p.y += 2;
    return p;
  }

  /** Throw an object in an arc from a to b over dur seconds. */
  lob(obj, a, b, dur, height = 3, spin = 8) {
    obj.position.copy(a);
    this.scene.add(obj);
    return animate(dur, (e, k) => {
      obj.position.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k) + Math.sin(k * Math.PI) * height, lerp(a.z, b.z, k));
      obj.rotation.x += 0.016 * spin;
      obj.rotation.z += 0.016 * spin * 0.7;
    }, { onComplete: () => this.scene.remove(obj) }).promise;
  }

  spellFx(ev) {
    const side = ev.side;
    const x = ev.x;
    const ground = new THREE.Vector3(x, 0, 0);
    switch (ev.id) {
      case 'foodThrow': {
        audio.play('whoosh');
        this.react(side, 'sitCheer', 'happy', 'grin', 1, side === 0 ? null : 'Eat up!');
        const from = this.labTop(side);
        const foods = ['burger', 'pizza', 'donut', 'fries', 'chocoBar', 'apple', 'cake'];
        for (let i = 0; i < 7; i++) {
          const f = propOr('makeFood', pick(foods)) || simpleVox((g) => g.sphere(0, 0, 0, 2, pick([0xe0392b, 0xffd23f, 0xff9a3c])));
          f.scale.setScalar(1.3);
          const to = new THREE.Vector3(x + rand(-ev.radius * 0.7, ev.radius * 0.7), 0.4, rand(-0.8, 0.8));
          setTimeout(() => this.lob(f, from, to, ev.delay, 3.5).then(() => {
            fx.groceries(to, { count: 4, speed: 3 });
            fx.burst(to, { count: 6, colors: [0xffffff, 0xffe27a], size: 0.06, speed: 3 });
          }), i * 40);
        }
        setTimeout(() => {
          fx.rise(ground, { count: 40, colors: [0x5fdc4a, 0xd4ff9a, 0xffffff], radius: ev.radius });
          fx.shockwave(ground, { radius: ev.radius, color: 0x5fdc4a });
          audio.play('chomp');
          audio.play('heal');
        }, ev.delay * 1000);
        break;
      }
      case 'moneyDrop': {
        this.react(side, 'sitCheer', 'money', 'grin', 1.2);
        const bag = propOr('makeMoneyBag') || simpleVox((g) => { g.sphere(0, 0, 0, 7, 0xc8a060); g.box(-1, 7, -1, 1, 9, 1, 0x8a6a3a); g.box(-2, -2, 6, 1, 2, 7, 0x2f9e3f); });
        bag.position.set(x, 14, 0);
        bag.scale.setScalar(1.15);
        this.scene.add(bag);
        // shadow ring telegraph
        fx.shockwave(ground, { radius: ev.radius, color: 0xffd23f, dur: ev.delay });
        audio.play('whoosh', { pitch: 0.6 });
        animate(ev.delay, (e) => {
          bag.position.y = 14 * (1 - e);
          bag.rotation.y += 0.05;
        }, { ease: 'inQuad', onComplete: () => {
          bag.position.y = 0;
          bag.scale.set(1.5, 0.7, 1.5);
          tween(bag.scale, { x: 1.15, y: 1.15, z: 1.15 }, 0.3, { ease: 'outElastic' });
          setTimeout(() => {
            animate(0.35, (e) => bag.scale.setScalar(1.15 * (1 - e)), { onComplete: () => this.scene.remove(bag) });
          }, 900);
        } });
        break;
      }
      case 'slimeFlood': {
        audio.play('slime');
        const geo = new THREE.CylinderGeometry(ev.radius, ev.radius, 0.08, 24);
        const mat = new THREE.MeshLambertMaterial({ color: 0x7cff3a, transparent: true, opacity: 0.6, emissive: 0x2a6a10 });
        const pool = new THREE.Mesh(geo, mat);
        pool.position.set(x, 0.05, 0);
        pool.scale.set(0.01, 1, 0.01);
        this.scene.add(pool);
        fx.slime(new THREE.Vector3(x, 3, 0), { count: 40, speed: 4, color: 0x7cff3a, scale: 1.4 });
        tween(pool.scale, { x: 1, z: 1 }, 0.4, { ease: 'outBack' });
        let t = 0;
        const z = {
          done: false,
          update: (dt) => {
            t += dt;
            if (Math.random() < dt * 12) fx.bubbles(new THREE.Vector3(x + rand(-ev.radius, ev.radius) * 0.8, 0.1, rand(-1, 1)), { count: 1, color: 0x9fff6a });
            if (t > ev.dur + 0.3) {
              mat.opacity = Math.max(0, 0.6 - (t - ev.dur - 0.3));
              if (mat.opacity <= 0) { this.scene.remove(pool); z.done = true; }
            }
          },
        };
        this.zones.push(z);
        break;
      }
      case 'freezeRay': {
        const from = this.labTop(side);
        const n = 26;
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          particles.spawn('glow', { x: lerp(from.x, x, k), y: lerp(from.y, 0.8, k) + Math.sin(k * Math.PI) * 1.2, z: 0, size: 0.12, life: 0.4, grav: 0, color: pick([0x9ff2ff, 0xffffff]) });
        }
        audio.play('laser', { pitch: 0.7 });
        setTimeout(() => {
          fx.burst(new THREE.Vector3(x, 0.5, 0), { count: 30, colors: [0x9ff2ff, 0xffffff, 0xc8f8ff], size: 0.1, speed: 5 });
          fx.shockwave(ground, { radius: ev.radius, color: 0x9ff2ff });
          audio.play('freeze');
        }, ev.delay * 1000);
        break;
      }
      case 'sodaRocket': {
        const rocket = propOr('makeSodaRocket') || simpleVox((g) => { g.cylinder(0, 0, 0, 8, 1.5, 0x5fbf4f); g.box(-1, 9, -1, 0, 10, 0, 0xff4a4a); });
        const from = this.labTop(side);
        rocket.position.copy(from);
        this.scene.add(rocket);
        audio.play('fizz');
        const to = new THREE.Vector3(x, 0.2, 0);
        animate(ev.delay, (e, k) => {
          const px = lerp(from.x, to.x, k), py = lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * 5;
          const prev = rocket.position.clone();
          rocket.position.set(px, py, 0);
          rocket.lookAt(rocket.position.clone().add(rocket.position.clone().sub(prev)));
          rocket.rotateX(Math.PI / 2);
          fx.bubbles(rocket.position, { count: 1, color: 0xffe0c0 });
          fx.smoke(rocket.position, { count: 1, scale: 0.4, life: 0.5, color: 0xfff0e0 });
        }, { onComplete: () => this.scene.remove(rocket) });
        break;
      }
      case 'labShield': {
        const lab = this.labs[side];
        const geo = new THREE.SphereGeometry(3.6, 20, 14);
        const mat = new THREE.MeshPhongMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.3, shininess: 120, depthWrite: false, emissive: 0x0a3a6a });
        const bubble = new THREE.Mesh(geo, mat);
        bubble.position.copy(lab.root.position).setY(1.8);
        bubble.scale.setScalar(0.01);
        this.scene.add(bubble);
        tween(bubble.scale, { x: 1, y: 1, z: 1 }, 0.5, { ease: 'outElastic' });
        lab.bubble = bubble;
        audio.play('magic');
        const z = {
          done: false,
          update: (dt) => {
            mat.opacity = damp(mat.opacity, 0.25, 4, dt);
            bubble.rotation.y += dt * 0.5;
            if (this.sim.sides[side].shield <= 0) {
              fx.burst(bubble.position, { count: 30, colors: [0x9ff2ff, 0xffffff], size: 0.08, speed: 6, layer: 'glow' });
              audio.play('shatter');
              this.scene.remove(bubble);
              lab.bubble = null;
              z.done = true;
            }
          },
        };
        this.zones.push(z);
        break;
      }
      default:
        break;
    }
  }

  impactFx(ev) {
    const p = new THREE.Vector3(ev.x, 0, 0);
    switch (ev.kind) {
      case 'money':
        fx.cash(p.clone().setY(0.6), 70, { speed: 9 });
        fx.impact(p, { radius: ev.radius * 1.3, colors: [0xd8c4a0, 0xc8a060] });
        audio.play('thud');
        audio.play('chaching');
        engine.shake(0.7);
        engine.hitstop(0.09);
        this.smashNear(ev.x, ev.radius, ev.side);
        break;
      case 'soda':
        fx.burst(p.clone().setY(0.5), { count: 40, colors: [0x8a3a1a, 0xffe0c0, 0x5fbf4f, 0xffffff], speed: 8, size: 0.1 });
        fx.bubbles(p.clone().setY(0.3), { count: 30, color: 0xffe0c0, radius: 1.5, speed: 2 });
        fx.shockwave(p, { radius: ev.radius * 1.4, color: 0xffe0c0 });
        audio.play('explode');
        audio.play('fizz');
        engine.shake(0.6);
        engine.hitstop(0.07);
        this.smashNear(ev.x, ev.radius, ev.side);
        break;
      case 'acid':
        fx.slime(p.clone().setY(0.4), { count: 18, color: 0x7cff3a, speed: 4 });
        fx.burst(p.clone().setY(0.4), { count: 8, colors: [0xffffff, 0x9ff2ff], size: 0.06, speed: 4, layer: 'glow' });
        fx.shockwave(p, { radius: ev.radius, color: 0x7cff3a });
        audio.play('shatter', { gap: 0.05 });
        audio.play('splat', { gap: 0.05 });
        engine.shake(0.15);
        break;
      case 'flop':
        fx.impact(p, { radius: ev.radius * 1.6, colors: [0xd8c4a0, 0xb89a70] });
        fx.burst(p.clone().setY(0.3), { count: 20, colors: [0x6fe3ff, 0xffffff], speed: 6, size: 0.1 });
        audio.play('thud', { pitch: 0.7 });
        audio.play('splat');
        engine.shake(0.75);
        engine.hitstop(0.1);
        this.smashNear(ev.x, ev.radius, ev.side);
        break;
      case 'button':
        fx.impact(p, { radius: ev.radius * 1.6, colors: [0xff4a4a, 0xffffff] });
        fx.confetti(p.clone().setY(1), { count: 40 });
        audio.play('thud');
        audio.play('bell');
        engine.shake(0.7);
        engine.hitstop(0.08);
        this.smashNear(ev.x, ev.radius, ev.side);
        break;
      default:
        fx.impact(p, { radius: ev.radius });
    }
  }

  // -------------------------------------------------------------------------
  // Commander abilities

  signatureFx(ev) {
    const side = ev.side;
    const ch = this.cmds[side];
    switch (ev.id) {
      case 'beakerBarrage': {
        this.perform(side, 'throw', 0.9, 'determined', 'grin');
        if (ch) speech(ch, 'Science time!', 1.6);
        const from = this.labTop(side);
        ev.xs.forEach((x, i) => {
          setTimeout(() => {
            const b = propOr('makeBeaker', pick([0x7cff3a, 0xff4fd8, 0x29b6f6])) || simpleVox((g) => g.box(-1, 0, -1, 1, 3, 1, 0x7cff3a, true));
            b.scale.setScalar(1.6);
            audio.play('whoosh', { pitch: 1.4, gap: 0.02 });
            this.lob(b, from, new THREE.Vector3(x, 0.3, rand(-0.5, 0.5)), 0.6, 3, 14);
          }, i * 120);
        });
        break;
      }
      case 'megaGiveaway': {
        this.perform(side, 'holdUp', 1.6, 'money', 'grin');
        if (ch) speech(ch, 'MEGA GIVEAWAY!', 2);
        audio.play('chaching');
        audio.play('cheer');
        const enemyLabX = this.sim.sides[1 - side].labX;
        for (let i = 0; i < 14; i++) {
          setTimeout(() => {
            const x = lerp(-LAB_X + 3, LAB_X - 3, Math.random()) * 0.5 + enemyLabX * 0.0 + rand(-6, 6);
            fx.cash(new THREE.Vector3(x, 8, rand(-1, 1)), 18, { speed: 3, coinRatio: 0.15, spread: 1.6 });
          }, i * 70);
        }
        setTimeout(() => {
          for (const a of this.actors.values()) {
            if (a.u.side === side) continue;
            speech(a.rig.root, '$_$', 1.2, { offsetY: 10 });
          }
          engine.shake(0.3);
        }, 800);
        break;
      }
      case 'bellyFlop': {
        if (!ch) break;
        ch.busy = true;
        if (side === 0 || true) speech(ch, 'CANNONBALL!!', 1.6);
        audio.play('boing', { pitch: 0.8 });
        const from = ch.root.position.clone();
        const to = new THREE.Vector3(ev.x, 0, 0.5);
        ch.play('shocked', { restart: true, dur: 0.3, then: 'bellyflop' });
        ch.expr('shock', 'shout', 1.8);
        animate(1.0, (e, k) => {
          ch.root.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * 6, lerp(from.z, to.z, k));
          ch.root.rotation.z = (side === 0 ? -1 : 1) * k * Math.PI * 2;
        }, { onComplete: () => {
          ch.root.rotation.z = 0;
          ch.play('bellyflop');
          ch.expr('dizzy', 'wobble', 1.5);
          setTimeout(() => {
            ch.play('run');
            ch.expr('happy', 'grin');
            const back = ch.home.clone();
            const start = ch.root.position.clone();
            ch.root.rotation.y = side === 0 ? -Math.PI / 2 : Math.PI / 2;
            animate(1.2, (e, k) => {
              ch.root.position.set(lerp(start.x, back.x, k), lerp(start.y, back.y, k) + Math.sin(k * Math.PI) * 4, lerp(start.z, back.z, k));
            }, { onComplete: () => {
              ch.root.position.copy(back);
              ch.root.rotation.y = side === 0 ? 0.55 : -0.55;
              ch.play('sit');
              ch.busy = false;
            } });
          }, 900);
        } });
        break;
      }
      case 'juansTruck': {
        this.perform(side, 'point', 1.2, 'determined', 'grin');
        if (ch) speech(ch, 'BRING THE TRUCK!', 1.8);
        audio.play('horn');
        break;
      }
      default:
        break;
    }
  }

  skillFx(ev) {
    const side = ev.side;
    const ch = this.cmds[side];
    switch (ev.id) {
      case 'labRally':
        this.perform(side, 'cheer', 1.2, 'star', 'shout');
        if (ch) speech(ch, 'GO GO GO!', 1.5);
        audio.play('cheer');
        for (const a of this.actors.values()) if (a.u.side === side) fx.rise(a.rig.root.position, { count: 6, colors: [0x29b6f6, 0xffffff], radius: 0.4 });
        break;
      case 'emergencyRepair': {
        this.perform(side, 'shake', 1.2, 'determined', 'flat');
        const p = this.labTop(side);
        fx.sparkle(p, { count: 30, colors: [0xffd23f, 0xffffff], radius: 2, speed: 3 });
        fx.rise(new THREE.Vector3(p.x, 0.2, 0), { count: 30, colors: [0x5fdc4a, 0xffffff], radius: 2 });
        audio.play('upgrade');
        if (side === 0) floatText(p, `+${Math.round(ev.amount)}`, 'heal', { life: 1.3 });
        break;
      }
      case 'lastToLeave':
        this.perform(side, 'point', 1, 'determined', 'grin');
        if (ch) speech(ch, 'Last to leave WINS!', 2);
        audio.play('magic');
        break;
      case 'subscribeSmash': {
        this.perform(side, 'holdUp', 1.1, 'star', 'shout');
        if (ch) speech(ch, 'SMASH SUBSCRIBE!', 1.6);
        const btn = propOr('makeSubscribeButton') || simpleVox((g) => { g.cylinder(0, 0, 0, 3, 10, 0xff2020); g.box(-2, 4, -3, 2, 4, 3, 0xffffff); }, 0.12);
        btn.position.set(ev.x, 16, 0);
        this.scene.add(btn);
        audio.play('whoosh', { pitch: 0.5 });
        animate(0.9, (e) => (btn.position.y = 16 * (1 - e)), { ease: 'inCubic', onComplete: () => {
          btn.scale.set(1.3, 0.6, 1.3);
          tween(btn.scale, { x: 1, y: 1, z: 1 }, 0.3, { ease: 'outElastic' });
          setTimeout(() => animate(0.4, (e) => btn.scale.setScalar(1 - e), { onComplete: () => this.scene.remove(btn) }), 900);
        } });
        break;
      }
      case 'complain':
        this.perform(side, 'angry', 1.4, 'angry', 'shout');
        if (ch) speech(ch, 'This is SO unfair!!', 1.8);
        audio.play('error');
        for (const a of this.actors.values()) if (a.u.side !== side && Math.abs(a.u.x - ev.x) < 7) speech(a.rig.root, '😤', 1.2);
        break;
      case 'luckyFail':
        this.perform(side, 'shocked', 1, 'shock', 'open');
        if (ch) speech(ch, 'Oops! ...wait, it worked?', 2);
        audio.play('shatter');
        break;
      case 'footballKick': {
        if (ch) speech(ch, 'GOOOAL!', 1.6);
        this.perform(side, 'kick', 0.8, 'determined', 'grin');
        break;
      }
      case 'juanDance': {
        this.perform(side, 'dance', ev.dur ?? 8, 'happy', 'grin');
        if (ch) speech(ch, '¡VAMOS! Dance party!', 2.4);
        audio.play('cheer');
        const prevTrack = audio.trackName;
        audio.music('dance');
        setTimeout(() => {
          if (!this.sim.over && audio.trackName === 'dance') audio.music(prevTrack || 'battle');
        }, (ev.dur ?? 8) * 1000);
        // troops near the Lab join the dance
        const labX = this.sim.sides[side].labX;
        for (const a of this.actors.values()) {
          if (a.u.side !== side) continue;
          a.danceT = Math.abs(a.u.x - labX) < 9 ? 1.8 : 0.9;
        }
        this.parade(side, ev.dur ?? 8);
        break;
      }
      default:
        break;
    }
  }

  /** A festive parade marching across the background with confetti & papel-picado colours. */
  parade(side, dur) {
    const marchers = [];
    const defs = ['fan', 'cashier', 'stocker', 'labTech', 'juan'];
    const dir = side === 0 ? 1 : -1;
    const startX = this.sim.sides[side].labX - dir * 2;
    for (let i = 0; i < 8; i++) {
      const c = new Chibi({ ...CHARACTERS[defs[i % defs.length]], hat: i % 2 ? { type: 'cap', color: pick([0xff2e88, 0xffd23f, 0x5fdc4a, 0x29b6f6]) } : CHARACTERS[defs[i % defs.length]].hat }, { scale: 0.8 });
      c.root.position.set(startX - dir * i * 1.3, 0, -2.4 - (i % 2) * 0.8);
      c.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      c.play('dance');
      c.expr(pick(['happy', 'star', 'wink']), pick(['grin', 'tongue', 'open']));
      this.scene.add(c.root);
      marchers.push(c);
    }
    let t = 0;
    let confT = 0;
    const z = {
      done: false,
      update: (dt) => {
        t += dt;
        confT -= dt;
        for (const c of marchers) {
          c.root.position.x += dir * dt * 3.2;
          c.update(dt);
        }
        if (confT <= 0) {
          confT = 0.25;
          const lead = marchers[0].root.position;
          fx.confetti(new THREE.Vector3(lead.x - dir * 3, 3, -2.5), { count: 8, colors: [0xff2e88, 0xffd23f, 0x5fdc4a, 0x29b6f6, 0xff8a2a, 0xb05cff], speed: 4 });
        }
        if (t > dur + 4) {
          for (const c of marchers) this.scene.remove(c.root);
          z.done = true;
        }
      },
    };
    this.zones.push(z);
  }

  addMover(m) {
    const side = m.side;
    const dir = side === 0 ? 1 : -1;
    let obj, wheels = [];
    if (m.kind === 'truck') {
      const t = propOr('makeTruck');
      if (t) { obj = t.root; wheels = t.wheels || []; }
      else obj = simpleVox((g) => { g.box(-15, 3, -6, 15, 10, 5, 0xff8a2a); g.box(2, 10, -5, 12, 16, 4, 0x9ff2ff); for (const x of [-10, 10]) for (const z of [-7, 6]) g.cylinder(x, 4, z, z, 3, 0x222222, 'z'); }, 0.1);
      obj.rotation.y = dir > 0 ? 0 : Math.PI;
      obj.scale.setScalar(1.15);
      audio.play('engine');
      audio.play('horn');
      // Juan rides along in the truck
      const juan = new Chibi(CHARACTERS.juan, { scale: 0.7 });
      juan.play('cheer');
      juan.expr('star', 'shout');
      juan.root.position.set(-0.6, 1.4, 0);
      juan.root.rotation.y = Math.PI / 2;
      obj.add(juan.root);
      this.movers.set(m.id, { m, obj, wheels, rider: juan, smokeT: 0 });
    } else {
      obj = propOr('makeFootball') || simpleVox((g) => g.sphere(0, 0, 0, 2, (x, y, z) => ((x + y + z) & 1 ? 0xffffff : 0x111111)));
      obj.scale.setScalar(1.6);
      audio.play('kick');
      this.movers.set(m.id, { m, obj, wheels, smokeT: 0 });
    }
    obj.position.set(m.x, m.kind === 'ball' ? 0.6 : 0, 0.8);
    this.scene.add(obj);
  }
  updateMovers(dt) {
    for (const mv of this.movers.values()) {
      const m = mv.m;
      mv.obj.position.x = damp(mv.obj.position.x, m.x, 30, dt);
      if (m.kind === 'truck') {
        for (const w of mv.wheels) w.rotation.z -= dt * 20;
        mv.obj.position.y = Math.abs(Math.sin(this.t * 18)) * 0.06;
        mv.rider && mv.rider.update(dt);
        mv.smokeT -= dt;
        if (mv.smokeT <= 0) {
          mv.smokeT = 0.05;
          fx.smoke(new THREE.Vector3(mv.obj.position.x - (m.side === 0 ? 1.6 : -1.6), 0.4, 0.8), { count: 1, scale: 0.6, life: 0.6 });
          fx.dust(new THREE.Vector3(mv.obj.position.x, 0, 0.8), { count: 2, scale: 1.6 });
        }
        this.smashNear(m.x, 1.2, m.side);
        engine.shake(0.05);
      } else {
        mv.obj.rotation.z -= dt * 25 * (m.side === 0 ? 1 : -1);
        mv.obj.position.y = 0.6 + Math.abs(Math.sin(this.t * 10)) * 0.4;
        mv.smokeT -= dt;
        if (mv.smokeT <= 0) {
          mv.smokeT = 0.03;
          particles.spawn('glow', { x: mv.obj.position.x, y: mv.obj.position.y, z: 0.8, size: 0.1, life: 0.3, grav: 0, color: 0xffffff });
        }
      }
    }
  }
  endMover(m, x) {
    const mv = this.movers.get(m.id);
    if (!mv) return;
    this.movers.delete(m.id);
    const p = new THREE.Vector3(x, 0.8, 0.5);
    if (m.kind === 'truck') {
      fx.burst(p, { count: 40, colors: [0xff8a2a, 0xffd23f, 0x555555, 0xffffff], speed: 9, size: 0.14 });
      fx.fire(p, { count: 20, radius: 3, scale: 1.5 });
      fx.smoke(p, { count: 14, scale: 1.8 });
      fx.shockwave(p.clone().setY(0), { radius: 4, color: 0xff8a2a });
      audio.play('explode', { pitch: 0.8 });
      engine.shake(0.8);
      engine.hitstop(0.1);
      mv.obj.traverse((o) => { if (o.isMesh) fx.shatter(o, { force: 7 }); });
      // Juan flies back to his seat, unharmed
      const ch = this.cmds[m.side];
      if (ch) { ch.expr('star', 'grin', 2); speech(ch, '¡OLÉ!', 1.4); }
    } else {
      fx.sparkle(p, { count: 20, color: 0xffffff, speed: 5 });
      audio.play('kick');
      engine.shake(0.3);
    }
    this.scene.remove(mv.obj);
  }

  // -------------------------------------------------------------------------
  // Endgame

  async labDestroyed(side) {
    const lab = this.labs[side];
    this.focus(lab.root.position.x + (side === 0 ? 4 : -4), 10);
    engine.timeScale = 0.3;
    const p = lab.root.position.clone().setY(2);
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        fx.burst(p.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(-1, 2), rand(-1, 1))), { count: 30, colors: [0xffd23f, 0xff8a2a, 0xffffff, 0x555555], size: 0.15, speed: 8 });
        fx.fire(p, { count: 14, radius: 3, scale: 1.4 });
        audio.play('explode', { pitch: 0.6 + i * 0.1 });
        engine.shake(0.6);
      }, i * 160);
    }
    setTimeout(() => {
      lab.setDamage && lab.setDamage(1);
      for (const m of lab.meshes || []) fx.shatter(m, { force: 9, life: 3, fraction: 0.6 });
      fx.smoke(p, { count: 30, scale: 2.5, life: 2 });
      fx.shockwave(p.clone().setY(0), { radius: 7, color: 0xffffff });
      if (side === 1 && this.theme === 'mart') fx.groceries(p, { count: 40, speed: 10 });
      if (lab.style === 'mansion') fx.cash(p, 120, { speed: 10 });
      engine.shake(1);
      engine.timeScale = 1;
      // commander tumbles
      const ch = this.cmds[side];
      if (ch) {
        ch.busy = true;
        ch.play('shocked', { restart: true, dur: 0.4, then: 'sad' });
        ch.expr('dizzy', 'shout');
        const from = ch.root.position.clone();
        const to = new THREE.Vector3(from.x + (side === 0 ? 2.5 : -2.5), 0, 1.5);
        animate(0.9, (e, k) => {
          ch.root.position.set(lerp(from.x, to.x, k), lerp(from.y, 0, k) + Math.sin(k * Math.PI) * 2.5, lerp(from.z, to.z, k));
          ch.root.rotation.x = k * Math.PI * 2;
        }, { onComplete: () => { ch.root.rotation.x = 0; ch.play('sad'); ch.expr('sad', 'frown'); fx.dust(ch.root.position, { count: 10, scale: 2 }); } });
      }
      const win = this.cmds[1 - side];
      if (win) {
        win.busy = true;
        win.play('victory');
        win.expr('star', 'grin');
      }
      fx.confetti(new THREE.Vector3(this.camX, 6, 0), { count: 120, spread: 2.5 });
    }, 1000);
    await new Promise((r) => setTimeout(r, 2200));
  }

  /** Units of the winning side celebrate. */
  celebrate(side) {
    for (const a of this.actors.values()) {
      if (a.u.side === side) a.danceT = 99;
    }
  }

  dispose() {
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
  }
}
