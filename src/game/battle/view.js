// Battle 3D view: renders the simulation inside a voxel arena with the
// Battle Cats side-view camera — each side's BASE (a tent that rebuilds into
// a Mega HQ as it's upgraded) with its Commander, Swarms dropped in from
// shattering vials, the MEGA ultimate cutscene,
// team-coloured HP plates, tower projectiles, spells, Commander abilities and
// lots of juice (hit-stop, shake, particles, slow-mo finishes).
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
import { makeLabBuilding } from '../../models/props/lab.js';
import { playMegaCutscene, megaSpecialFx, megaEndFx } from './megaCutscene.js';
import { makeArenaBattle } from '../../models/arenas/index.js';
import { battleCamera, coverFit } from '../../models/arenas/kit.js';
import { h, $world, floatText, speech } from '../../ui/ui.js';
import { FIELD } from './field.js';
import { LAB_X, LAB_HALF } from './sim.js';
import { BASE_UPGRADES } from '../../data/labs.js';

// base tier models (tent -> Mega HQ) come from props/base.js; until that module
// exists the full Lab building stands in for every tier
const BASE_MOD = import.meta.glob('../../models/props/base.js', { eager: true });
const baseModule = Object.values(BASE_MOD)[0] ?? null;

export const TEAM_COLORS = [0x2b9cff, 0xff3d55];
const TEAM_LIGHT = [0x9fe0ff, 0xffb0bc];
const PROJ_COLORS = {
  sludge: [0x7a6a2a, 0x8fb23a], letters: [0xffffff, 0xf4f0e0], nuke: [0x7cff3a, 0xd4ff9a], zap: [0x9ff2ff, 0xffffff],
  laser: [0xff4fd8, 0x9ff2ff], missile: [0xdddddd, 0xff8a2a], fire: [0xff5a1f, 0xffd23f], fries: [0xffd23f, 0xf7c873],
  soda: [0x8a3a1a, 0xffe0c0], acid: [0x7cff3a, 0xb6ff3a], ice: [0x9ff2ff, 0xffffff],
};
const LOB = new Set(['sludge', 'letters', 'nuke', 'fries', 'fire', 'acid', 'labCannon']);

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

const hexOf = (css, fb = 0x7cff3a) => (typeof css === 'string' ? parseInt(css.replace('#', ''), 16) : css ?? fb);
const seriesColor = (id) => hexOf(SERIES[SWARMS[id]?.series]?.color);

// ---------------------------------------------------------------------------
// Shared meshes

const projGeo = {};
function projectileMesh(kind, side = 0) {
  const key = kind + side;
  if (!projGeo[key]) {
    const c = PROJ_COLORS[kind] || [0xffffff, 0xdddddd];
    const g = new VoxGrid();
    let scale = 0.1;
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
      case 'turretBolt':
        // elongated team-coloured plasma slug with a white-hot core
        g.box(-1, -1, -4, 0, 0, 3, TEAM_COLORS[side], true);
        g.box(-1, -1, 1, 0, 0, 4, 0xffffff, true);
        scale = 0.07;
        break;
      case 'labCannon':
        g.sphere(-0.5, -0.5, -0.5, 2.6, (x, y, z) => ((x + y + z) & 1 ? TEAM_COLORS[side] : TEAM_LIGHT[side]), true);
        g.set(0, 0, 3, 0xffffff, true);
        scale = 0.09;
        break;
      default:
        g.sphere(-0.5, -0.5, -0.5, 1.6, (x, y, z) => ((x + y + z) & 1 ? c[0] : c[1]));
    }
    projGeo[key] = g.build({ pivot: 'center', scale });
  }
  const m = makeMesh(projGeo[key]);
  m.castShadow = false;
  return m;
}

// pixel-art decal textures: team ring under units + soft blob shadow
const texCache = {};
function pixelTex(key, size, paint) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  paint(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = t;
  return t;
}
const ringTex = () => pixelTex('ring', 32, (ctx, s) => {
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2) / (s / 2);
    if (d > 0.98) continue;
    if (d > 0.78) { ctx.fillStyle = d > 0.9 ? '#ffffff' : '#dfe8ff'; ctx.fillRect(x, y, 1, 1); }
    else if (d > 0.7) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, 1, 1); }
  }
});
const shadowTex = () => pixelTex('shadow', 32, (ctx, s) => {
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2) / (s / 2);
    if (d > 1) continue;
    const a = d < 0.6 ? 0.5 : d < 0.82 ? 0.34 : 0.16;
    ctx.fillStyle = `rgba(10,8,30,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
});
const stripeTex = () => {
  const t = pixelTex('stripes', 16, (ctx, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const on = ((x + y) & 7) < 3;
      ctx.fillStyle = on ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(x, y, 1, 1);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const decalMat = (tex, color, opacity = 1) => new THREE.MeshBasicMaterial({
  map: tex, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false,
});

// lab test-tube vial that Swarms are dropped in with
const vialGeo = {};
function vialMesh(color) {
  if (!vialGeo[color]) {
    const g = new VoxGrid();
    const r2 = (x, z) => (x + 0.5) ** 2 + (z + 0.5) ** 2;
    for (let y = 0; y <= 13; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) {
      const d = r2(x, z);
      if (d > 4.6) continue;
      if (y === 0 && d > 2) continue;
      if (y <= 8) g.set(x, y, z, y === 8 ? 0xffffff : color, y < 8);
      else g.set(x, y, z, d > 2 ? 0xdff4ff : 0xb8e6ff);
    }
    for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (r2(x, z) <= 4.6) g.set(x, 13, z, 0xffffff);
    for (let y = 14; y <= 16; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) g.set(x, y, z, y === 16 ? 0xd89a5a : 0xb07a4a);
    // label band
    for (let y = 4; y <= 6; y++) for (let x = -1; x <= 0; x++) g.set(x, y, 2, y === 5 ? 0xff2e88 : 0xffffff);
    vialGeo[color] = g.build({ scale: 0.06, pivot: [-0.5, 0, -0.5] });
  }
  const m = makeMesh(vialGeo[color]);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// HP plates (DOM, crisp pixel art, anchored to world positions)

const _v = new THREE.Vector3();
/** Plates never rise above this screen y (the HUD's top bar sets it). */
export const plateBounds = { minY: 0 };
function placeEl(el, pos, dy = 0) {
  const s = engine.toScreen(pos);
  if (!s.visible || s.x < -80 || s.x > engine.width + 80) {
    if (el.style.display !== 'none') el.style.display = 'none';
    return;
  }
  if (el.style.display === 'none') el.style.display = '';
  const y = Math.max(plateBounds.minY + (el.offsetHeight || 0), s.y - dy);
  el.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(y)}px, 0)`;
}

// ---------------------------------------------------------------------------

class UnitActor {
  constructor(view, u) {
    this.view = view;
    this.u = u;
    const rig = (this.rig = createSwarm(u.type, { variant: u.variant, skin: u.skin, scale: u.size, model: u.model }));
    rig.root.position.set(u.x, 0, u.z);
    this.face = u.side === 0 ? Math.PI / 2 - 0.45 : -Math.PI / 2 + 0.45;
    rig.root.rotation.y = this.face;
    view.scene.add(rig.root);
    this.flying = !!SWARMS[u.type]?.traits?.flying;
    this.h0 = rig.height / Math.max(0.01, rig.baseScale);
    // ground decals: soft shadow + team ring
    const r = Math.max(0.55, 0.62 * u.size) * (u.boss ? 1.3 : 1);
    this.shadow = new THREE.Mesh(PLANE, view.shadowMat);
    this.shadow.scale.set(r * 1.5, 1, r * 1.1);
    this.ring = new THREE.Mesh(PLANE, view.ringMats[u.side]);
    this.ring.scale.set(r * 1.6, 1, r * 1.15);
    this.shadow.position.set(u.x, 0.025, u.z);
    this.ring.position.set(u.x, 0.03, u.z);
    view.scene.add(this.shadow, this.ring);
    // HP plate
    const lvl = h('i', { class: 'lv' }, String(u.level ?? 1));
    this.hpFill = h('i', { class: 'f' });
    this.hpGhost = h('i', { class: 'g' });
    this.plate = h('div', { class: `uplate s${u.side}${u.boss ? ' boss' : ''}${u.mega ? ' boss mega' : ''}` }, lvl, h('b', { class: 'hpb' }, this.hpGhost, this.hpFill));
    if (u.mega) {
      this.lifeFill = h('i', { class: 'lf' });
      this.plate.prepend(h('div', { class: 'mname' }, SWARMS[u.type]?.name ?? 'MEGA'));
      this.plate.append(h('b', { class: 'life' }, this.lifeFill));
    }
    view.plateLayer.appendChild(this.plate);
    this.showT = 1.6;
    this.ghostFrac = 1;
    this.dustT = 0;
    this.danceT = 0;
    this.iceMesh = null;
    this.statusT = 0;
    this.spawnT = 0;
    this.landed = !(u.state === 'spawn' && u.spawnT > 0.05);
    this.hidden = !this.landed;
    if (this.hidden) {
      rig.root.visible = false;
      this.ring.visible = this.shadow.visible = false;
      this.plate.style.display = 'none';
    }
    rig.inner.scale.setScalar(0.01);
    this.bounceT = 0;
  }
  land() {
    if (this.landed) return;
    this.landed = true;
    this.hidden = false;
    this.rig.root.visible = this.ring.visible = this.shadow.visible = true;
    this.plate.style.display = '';
    this.spawnT = 0;
    const p = this.rig.root.position;
    fx.dust(new THREE.Vector3(p.x, 0, p.z), { count: 4, scale: 0.9 * this.u.size });
  }
  update(dt) {
    const u = this.u, rig = this.rig;
    if (this.hidden) {
      rig.root.position.set(u.x, 0, u.z);
      return;
    }
    const p = rig.root.position;
    p.x = damp(p.x, u.x, 25, dt);
    p.z = damp(p.z, u.z, 10, dt);
    const hover = this.flying ? 0.9 + Math.sin(this.view.t * 3 + u.id) * 0.1 : 0;
    p.y = u.y + hover;
    if (this.jump) {
      // Mega pounce arc
      const j = this.jump;
      j.t += dt;
      const k = Math.min(1, j.t / j.dur);
      p.y += Math.sin(k * Math.PI) * j.h;
      if (k >= 1) {
        this.jump = null;
        engine.shake(0.6);
        fx.dust(new THREE.Vector3(p.x, 0, p.z), { count: 20, scale: 2.4 });
      }
    }
    if (this.glitchT > 0) {
      // Cyber Glitch teleport flicker
      this.glitchT -= dt;
      rig.root.visible = this.glitchT <= 0 || Math.sin(this.view.t * 90) > -0.2;
      p.x += (Math.random() - 0.5) * 0.5;
    }
    // state
    if (this.danceT > 0) {
      this.danceT -= dt;
      rig.setState('dance');
    } else if (u.state === 'walk') rig.setState('walk');
    else if (u.state === 'stun') rig.setState('stun');
    else rig.setState('idle');
    rig.frozen = u.state === 'frozen';
    rig.walkRate = ((u.st?.speed ?? 1.5) / 1.5) * (this.view.sim.sides[u.side].buffs.dance > 0 ? 1.35 : 1) * (u.buffs.slowT > 0 ? 1 - (u.buffs.slow ?? 0) : 1);
    // spawn pop-in (overshoot) + grow buff scale
    this.spawnT += dt;
    const target = u.size * (u.buffs.growScale ?? 1);
    if (u.mega) rig.baseScale = damp(rig.baseScale, target, 8, dt);
    else if (this.spawnT < 0.4) {
      const k = this.spawnT / 0.4;
      rig.baseScale = target * (k < 0.6 ? (k / 0.6) * 1.28 : 1.28 - ((k - 0.6) / 0.4) * 0.28);
    } else rig.baseScale = damp(rig.baseScale, target, 8, dt);
    rig.update(dt);
    // knockback tumble
    const tumble = u.state === 'kb' ? (u.side === 0 ? 1 : -1) * 0.55 : 0;
    rig.root.rotation.z = damp(rig.root.rotation.z, tumble, u.state === 'kb' ? 12 : 10, dt);
    // decals
    const air = Math.max(0, p.y);
    const sh = 1 / (1 + air * 0.35);
    this.shadow.position.set(p.x, 0.025, p.z);
    this.ring.position.set(p.x, 0.03, p.z);
    this.shadow.material.opacity = 1;
    this.shadow.scale.x = this.ring.scale.x * 0.95 * sh;
    // dust
    if (u.state === 'walk' && !this.flying) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.35 + Math.random() * 0.3;
        fx.dust(new THREE.Vector3(p.x, 0, p.z), { count: 2, scale: 0.8 * u.size, color: this.view.dustColor });
      }
    }
    // HP plate: shown briefly after landing (level badge) and whenever damaged
    const frac = Math.max(0, u.hp / u.maxHp);
    this.showT -= dt;
    const show = this.showT > 0 || frac < 0.999 || u.boss || u.mega;
    if (this.lifeFill) this.lifeFill.style.width = (Math.max(0, u.life ?? 0) / 24 * 100).toFixed(1) + '%';
    this.plate.classList.toggle('hide', !show);
    this.hpFill.style.width = (frac * 100).toFixed(1) + '%';
    this.ghostFrac = Math.max(frac, damp(this.ghostFrac, frac, 3.5, dt));
    this.hpGhost.style.width = (this.ghostFrac * 100).toFixed(1) + '%';
    const top = p.y + this.h0 * rig.baseScale + 0.18;
    placeEl(this.plate, _v.set(p.x, top, p.z));
    // status fx
    this.statusT -= dt;
    if (this.statusT <= 0) {
      this.statusT = 0.15;
      const tp = new THREE.Vector3(p.x, p.y + rig.height * 0.9, p.z);
      if (u.state === 'stun') fx.sparkle(tp, { count: 2, color: 0xffd23f, speed: 1.5, life: 0.4 });
      if (u.buffs.burnT > 0) fx.fire(new THREE.Vector3(p.x, p.y + 0.3, p.z), { count: 2, scale: 0.7 });
      if (u.buffs.slowT > 0 && u.buffs.slow > 0) fx.slime(new THREE.Vector3(p.x, p.y + 0.2, p.z), { count: 1, speed: 0.5, color: 0x7cff3a, scale: 0.6 });
      if (this.view.sim.sides[u.side].buffs.dance > 0) fx.sparkle(tp, { count: 1, colors: [0xff4fa3, 0xffd23f, 0x5fdc4a, 0x29b6f6], speed: 1, life: 0.6 });
      if (this.view.sim.sides[u.side].buffs.immortal > 0) fx.sparkle(tp, { count: 1, color: 0xffe27a, speed: 0.8 });
      if (u.buffs.growT > 0) fx.sparkle(tp, { count: 1, colors: [0x5fdc4a, 0xd4ff9a], speed: 0.8 });
    }
    // frozen ice block
    if (u.state === 'frozen' && !this.iceMesh) {
      this.iceMesh = new THREE.Mesh(this.view.iceGeo, this.view.iceMat);
      this.view.scene.add(this.iceMesh);
    }
    if (this.iceMesh) {
      if (u.state !== 'frozen') {
        fx.burst(this.iceMesh.position, { count: 10, colors: [0x9ff2ff, 0xffffff], size: 0.08, speed: 3 });
        audio.play('shatter', { pitch: 1.4, vol: 0.5, gap: 0.05 });
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
    this.view.scene.remove(this.rig.root, this.shadow, this.ring);
    this.plate.remove();
    if (this.iceMesh) this.view.scene.remove(this.iceMesh);
  }
}

// ---------------------------------------------------------------------------
// Base HP plate

class TowerPlate {
  constructor(layer, side, kind, b, name) {
    this.b = b;
    this.kind = kind;
    this.num = h('span', { class: 'n' }, String(b.hp));
    this.fill = h('i', { class: 'f' });
    this.ghost = h('i', { class: 'g' });
    this.zz = kind === 'lab' ? h('div', { class: 'zz' }, 'z', h('span', {}, 'z'), h('span', {}, 'z')) : null;
    this.el = h('div', { class: `tplate s${side} ${kind}` },
      kind === 'lab' && name ? h('div', { class: 'tname' }, name) : null,
      h('div', { class: 'tbar' }, this.ghost, this.fill, this.num), this.zz);
    layer.appendChild(this.el);
    this.ghostFrac = 1;
    this.shown = -1;
  }
  update(dt, pos) {
    const b = this.b;
    const frac = Math.max(0, b.hp / b.maxHp);
    const hp = Math.max(0, Math.ceil(b.hp));
    if (hp !== this.shown) {
      this.shown = hp;
      this.num.textContent = String(hp);
      this.fill.style.width = (frac * 100).toFixed(1) + '%';
    }
    this.ghostFrac = Math.max(frac, damp(this.ghostFrac, frac, 2.5, dt));
    this.ghost.style.width = (this.ghostFrac * 100).toFixed(1) + '%';
    if (this.zz) this.zz.style.display = b.active || !b.alive ? 'none' : '';
    this.el.classList.toggle('low', frac < 0.3);
    this.el.classList.toggle('shield', b.shield > 0);
    if (!b.alive) this.el.style.display = 'none';
    else placeEl(this.el, pos);
  }
  dispose() {
    this.el.remove();
  }
}

// ---------------------------------------------------------------------------

export class BattleView {
  constructor(sim, cfg) {
    this.sim = sim;
    this.cfg = cfg;
    this.t = 0;
    this.theme = cfg.theme || 'lab';
    this.scene = cfg.scene ?? new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fd3ff);
    this.camera = cfg.camera ?? new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 600);
    this.listeners = new Set();
    this.plateLayer = h('div', { class: 'bt-plates' });
    $world().appendChild(this.plateLayer);

    // shared materials
    this.shadowMat = decalMat(shadowTex(), 0xffffff, 1);
    this.ringMats = TEAM_COLORS.map((c) => decalMat(ringTex(), c, 0.95));
    this.iceGeo = new THREE.BoxGeometry(1, 1, 1);
    this.iceMat = new THREE.MeshPhongMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.45, shininess: 100, depthWrite: false });

    this.actors = new Map();
    this.projs = new Map();
    this.movers = new Map();
    this.zones = [];
    this.vials = [];
    this.breakables = [];
    this.cartsSmashed = 0;
    // camera
    this.zoom = 1;
    this.camX = -FIELD.VIEW_X;
    this.camTargetX = this.camX;
    this.manualT = 0;
    this.edge = 0;
    this.aimRing = null;
    this.ghost = null;
    this.zone = null;
  }

  /** Build the arena, bases and Commanders (async: arena modules are code-split). */
  async load() {
    const cfg = this.cfg, scene = this.scene;
    const A = await makeArenaBattle(this.theme, { seed: cfg.seed ?? 1 });
    this.arena = A;
    scene.add(A.root);
    const L = A.lights ?? {};
    this.lightDir = L.dir ?? [-6, 14, 10];
    const { sun } = addLights(scene, {
      sky: L.sky, ground: L.ground, hemi: L.hemi, sun: L.sun, sunColor: L.sunColor, dir: this.lightDir,
      rimIntensity: L.rim, rimColor: L.rimColor, shadowExtent: 16, shadowFar: 70,
    });
    this.sun = sun;
    if (A.sky?.isTexture) { scene.background = A.sky; coverFit(A.sky, this.camera.aspect); }
    else scene.background = new THREE.Color(A.sky ?? 0x8fd3ff);
    if (A.fog) scene.fog = new THREE.Fog(A.fog.color, A.fog.near, A.fog.far);
    this.bloom = A.bloom ?? null;
    this.dustColor = A.dust;
    this.breakables = (A.breakables || []).map((b) => ({ ...b, alive: true }));

    // bases: every battle starts in a tent
    this.labs = [0, 1].map((i) => this.makeBaseFor(i, (this.sim.sides[i].overclock ?? 0) + 1));
    for (const lab of this.labs) scene.add(lab.root);
    // base HP plates
    this.towerPlates = [0, 1].map((i) => ({
      lab: new TowerPlate(this.plateLayer, i, 'lab', this.sim.sides[i].lab, cfg.sides[i].name),
    }));
    // Commanders sit on the Lab roofs
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
    // deploy zone overlay + ghost preview
    const zmat = new THREE.MeshBasicMaterial({ map: stripeTex(), color: 0x4ab4ff, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, fog: false });
    this.zone = new THREE.Mesh(PLANE, zmat);
    this.zone.visible = false;
    scene.add(this.zone);
    const nmat = zmat.clone();
    nmat.color = new THREE.Color(0xff3d55);
    nmat.opacity = 0.4;
    this.noZone = new THREE.Mesh(PLANE, nmat);
    this.noZone.visible = false;
    scene.add(this.noZone);
    // bright front edge of the deploy zone
    this.zoneEdge = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, fog: false }));
    this.zoneEdge.visible = false;
    scene.add(this.zoneEdge);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, depthWrite: false });
    this.ghostRing = new THREE.Mesh(PLANE, decalMat(ringTex(), TEAM_COLORS[0], 1));
    this.ghostRing.visible = false;
    scene.add(this.ghostRing);
    this.loaded = true;
    this.updateCamera(0, true);
  }

  /** Build the base model for a side at an upgrade tier (1 = tent ... 6 = Mega HQ). */
  makeBaseFor(i, tier) {
    const cfg = this.cfg;
    const style = cfg.sides[i].labStyle || (i === 0 ? 'default' : 'rival');
    let lab = null;
    try {
      if (baseModule?.makeBase) lab = baseModule.makeBase(tier, { side: i, flip: i === 1, style });
    } catch (e) {
      console.warn('base tier failed', tier, e);
    }
    if (!lab) {
      try {
        lab = makeLabBuilding({ style, flip: i === 1 });
      } catch (e) {
        lab = makeLabBuilding({ style: i === 0 ? 'default' : 'rival', flip: i === 1 });
      }
      lab.setLevel?.(Math.min(8, tier + 1));
    }
    lab.root.position.set(i === 0 ? -LAB_X : LAB_X, 0, 0);
    for (const m of lab.meshes ?? []) m.castShadow = true;
    lab.style = style;
    lab.tier = tier;
    lab.shakeT = 0;
    lab.onChunk = (mesh) => {
      fx.shatter(mesh, { force: 5, dirX: i === 0 ? 0.4 : -0.4, life: 2 });
      audio.play('crunch', { pitch: 0.6, gap: 0.1 });
      engine.shake(0.25);
    };
    const b = this.sim.sides[i].lab;
    lab.setDamage?.(1 - b.hp / b.maxHp);
    return lab;
  }

  /** Upgrade animation: scaffolding rises, the old base collapses into dust and the new one pops up. */
  swapBase(i, tier) {
    const old = this.labs[i];
    const nb = this.makeBaseFor(i, tier);
    const x = old.root.position.x;
    const w = Math.max(old.width ?? 3.4, nb.width ?? 3.4);
    const hgt = Math.max(old.height ?? 3, nb.height ?? 3);
    let scaffold = null;
    try { scaffold = baseModule?.makeScaffold ? baseModule.makeScaffold(w + 0.6, hgt + 0.6) : null; } catch (e) { scaffold = null; }
    if (scaffold) {
      scaffold.root.position.set(x, 0, 0);
      this.scene.add(scaffold.root);
    }
    audio.play('drum', { pitch: 1.2 });
    const sparkle = () => fx.sparkle(new THREE.Vector3(x + rand(-w / 2, w / 2), rand(0.4, hgt), rand(-0.6, 0.8)), { count: 3, colors: [0xffd23f, 0xffffff], speed: 3, life: 0.4 });
    let t = 0;
    const dur = 1.1;
    const z = {
      done: false,
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        scaffold?.setProgress?.(k);
        scaffold?.update?.(dt);
        if (Math.random() < dt * 14) { sparkle(); audio.play('tick', { pitch: 1.6 + Math.random(), gap: 0.08 }); }
        old.root.scale.set(1 + k * 0.05, Math.max(0.02, 1 - k * k), 1 + k * 0.05);
        if (t >= dur && !z.swapped) {
          z.swapped = true;
          this.scene.remove(old.root);
          this.labs[i] = nb;
          this.scene.add(nb.root);
          nb.root.scale.set(1.25, 0.05, 1.25);
          tween(nb.root.scale, { x: 1, y: 1, z: 1 }, 0.7, { ease: 'outElastic' });
          fx.dust(new THREE.Vector3(x, 0, 0.5), { count: 26, scale: 2.4 });
          fx.confetti(new THREE.Vector3(x, (nb.height ?? 3) + 1, 0), { count: 50, spread: 1.6 });
          fx.shockwave(new THREE.Vector3(x, 0.05, 0), { radius: 3.6, color: TEAM_COLORS[i] });
          engine.shake(0.35);
          audio.play('levelUp');
          // the Commander climbs onto the new roof
          const ch = this.cmds?.[i];
          if (ch) {
            nb.seat.updateWorldMatrix(true, false);
            const wp = new THREE.Vector3().setFromMatrixPosition(nb.seat.matrixWorld);
            ch.home = wp.clone();
            if (!ch.busy) {
              const from = ch.root.position.clone();
              animate(0.6, (e, kk) => ch.root.position.set(lerp(from.x, wp.x, kk), lerp(from.y, wp.y, kk) + Math.sin(kk * Math.PI) * 1.4, lerp(from.z, wp.z, kk)));
            }
          }
          if (scaffold) setTimeout(() => this.scene.remove(scaffold.root), 300);
        }
        if (t >= dur + 0.4) z.done = true;
      },
    };
    this.zones.push(z);
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    if (this.scene.background?.isTexture) coverFit(this.scene.background, this.camera.aspect);
    this.updateCamera(0, true);
  }

  // -------------------------------------------------------------------------
  // Camera: Battle Cats side view that follows the front line; the player can
  // drag to pan and pinch to zoom; dragging a card to the screen edge pans.

  viewWidth() {
    const a = this.camera.aspect;
    const base = a < 1 ? 11.5 : Math.min(FIELD.VIEW_X * 2, 15 + a * 2);
    return clamp(base * this.zoom, 9, FIELD.VIEW_X * 2 + 2);
  }
  updateCamera(dt, snap = false) {
    const sim = this.sim;
    const cam = this.camera;
    const width = this.viewWidth();
    const halfW = width / 2;
    const minX = -FIELD.VIEW_X + halfW, maxX = FIELD.VIEW_X - halfW;
    if (this.manualT > 0) this.manualT -= dt;
    else if (this.edge) this.camTargetX += this.edge * dt * 9;
    else if (this.autoFollow !== false) {
      const s0 = sim.sides[0];
      const fe = sim.frontEnemyX(0);
      const fa = sim.frontAllyX(0);
      let tx;
      if (fe !== null && fe < 1) tx = Math.min(fe + halfW * 0.15, (fa + fe) / 2); // defend: keep the closest threat in view
      else if (fe !== null) tx = (Math.max(fa, s0.labX + 2) + fe) / 2;
      else tx = fa - halfW * 0.2;
      this.camTargetX = tx;
    }
    this.camTargetX = minX > maxX ? 0 : clamp(this.camTargetX, minX, maxX);
    this.camX = snap ? this.camTargetX : damp(this.camX, this.camTargetX, this.manualT > 0 || this.edge ? 10 : 2.6, dt);
    if (minX <= maxX) this.camX = clamp(this.camX, minX, maxX);
    const c = battleCamera(this.camX, width, cam.aspect, cam.fov, cam.aspect < 1 ? 0.56 : 0.6);
    cam.position.set(...c.pos);
    cam.lookAt(...c.look);
    this.dist = c.dist;
    this.halfW = halfW;
    // the sun follows the camera so shadows stay crisp
    if (this.sun) {
      const d = this.lightDir;
      this.sun.position.set(this.camX + d[0], d[1], d[2]);
      this.sun.target.position.set(this.camX, 0, 0);
      const ext = halfW + 3;
      const sc = this.sun.shadow.camera;
      if (Math.abs(sc.right - ext) > 0.5) {
        sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
        sc.updateProjectionMatrix();
      }
    }
  }
  /** World units per CSS pixel at the lane. */
  worldPerPx() {
    return (this.halfW * 2) / engine.width;
  }
  pan(dxPixels) {
    const d = dxPixels * this.worldPerPx();
    this.camTargetX -= d;
    this.camX -= d;
    this.manualT = 3.5;
  }
  zoomBy(f) {
    this.zoom = clamp(this.zoom * f, 0.7, 1.9);
    this.manualT = Math.max(this.manualT, 1.5);
  }
  focus(x, hold = 2) {
    this.camTargetX = x;
    this.manualT = hold;
  }
  /** Card dragged near a screen edge: pan that way (-1, 0, 1). */
  setEdgePan(dir) {
    this.edge = dir;
    if (dir) this.manualT = 0;
  }
  /** World x under a screen point (on the lane plane). */
  screenToX(clientX, clientY) {
    const p = engine.rayToZPlane(clientX, clientY, 0, this.camera);
    return p ? p.x : null;
  }
  xToScreen(x, y = 0.6) {
    return engine.toScreen(_v.set(x, y, 0), this.camera);
  }

  // -------------------------------------------------------------------------
  // Deploy previews

  /** Highlight the deploy range (x0..x1) while a troop card is held. */
  showDeployZone(range) {
    if (!this.zone) return;
    if (!range) {
      this.zone.visible = this.noZone.visible = this.zoneEdge.visible = false;
      return;
    }
    const [a, b] = range;
    const zw = FIELD.LANE_HALF * 2 - 0.2;
    this.zone.visible = true;
    this.zone.scale.set(b - a, 1, zw);
    this.zone.position.set((a + b) / 2, 0.035, 0);
    this.zone.material.map.repeat.set((b - a) / 1.2, zw / 1.2);
    const nx0 = b, nx1 = LAB_X + LAB_HALF;
    this.noZone.visible = nx1 > nx0;
    this.noZone.scale.set(nx1 - nx0, 1, zw);
    this.noZone.position.set((nx0 + nx1) / 2, 0.034, 0);
    this.zoneEdge.visible = true;
    this.zoneEdge.scale.set(0.12, 1, zw);
    this.zoneEdge.position.set(b, 0.04, 0);
  }

  /** Translucent preview of the troop at x (null to hide). */
  setGhost(unitId, x, valid = true) {
    if (!unitId || x === null) {
      if (this.ghost) this.ghost.rig.root.visible = false;
      this.ghostRing.visible = false;
      return;
    }
    if (!this.ghost || this.ghost.id !== unitId) {
      if (this.ghost) this.scene.remove(this.ghost.rig.root);
      const def = SWARMS[unitId];
      const rig = createSwarm(unitId, { scale: def?.size ?? 1 });
      for (const m of rig.meshes) { m.material = this.ghostMat; m.castShadow = false; }
      rig.root.rotation.y = Math.PI / 2 - 0.45;
      rig.setState('idle');
      this.scene.add(rig.root);
      this.ghost = { id: unitId, rig, count: def?.count ?? 1 };
    }
    const g = this.ghost;
    g.rig.root.visible = true;
    g.rig.root.position.set(x, 0, 0);
    this.ghostMat.color.setHex(valid ? 0xbfe6ff : 0xff8a9a);
    this.ghostRing.visible = true;
    const r = 0.9 + (g.count > 1 ? 0.4 : 0);
    this.ghostRing.scale.set(r * 1.8, 1, r * 1.3);
    this.ghostRing.position.set(x - (g.count > 1 ? 0.2 * (g.count - 1) : 0), 0.04, 0);
    this.ghostRing.material.color.setHex(valid ? TEAM_COLORS[0] : 0xff3d55);
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
      const geo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(sp.color), transparent: true, opacity: 0.9, depthWrite: false, fog: false });
      this.aimRing = new THREE.Mesh(geo, mat);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(sp.color), transparent: true, opacity: 0.2, depthWrite: false, fog: false }));
      this.aimRing.add(disc);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(sp.color), transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
      beam.position.y = 3.5;
      this.aimRing.add(beam);
      this.scene.add(this.aimRing);
    }
    const r = Math.max(0.8, sp.radius || 1.2);
    this.aimRing.scale.set(r, 1, Math.min(r, FIELD.LANE_HALF));
    this.aimRing.position.set(clamp(x, -FIELD.VIEW_X, FIELD.VIEW_X), 0.06, 0);
  }

  // -------------------------------------------------------------------------
  update(dt, gdt) {
    if (!this.loaded) return;
    this.t += dt;
    const sim = this.sim;
    for (const ev of sim.drainEvents()) {
      try {
        this.onEvent(ev);
      } catch (e) {
        console.error('battle fx error', ev.type, e);
      }
      for (const fn of this.listeners) fn(ev);
    }
    for (const a of this.actors.values()) a.update(gdt);
    this.updateProjectiles(gdt);
    this.updateMovers(gdt);
    this.updateVials(gdt);
    for (let i = 0; i < 2; i++) {
      const lab = this.labs[i];
      lab.update(gdt);
      if (lab.shakeT > 0) {
        lab.shakeT -= dt;
        lab.root.position.x = (i === 0 ? -LAB_X : LAB_X) + (lab.shakeT > 0 ? Math.sin(this.t * 70) * 0.04 : 0);
      }
      const tp = this.towerPlates[i];
      tp.lab.update(dt, _v.set(lab.root.position.x, (lab.height ?? 3) + 0.55, 0));
    }
    if (this.ghost?.rig.root.visible) this.ghost.rig.update(dt);
    if (this.arena?.update && !this.arenaBroken) {
      try {
        this.arena.update(dt, this.t);
      } catch (e) {
        this.arenaBroken = true;
        console.error('arena update failed', e);
      }
    }
    this.updateCommanders(dt);
    for (const z of this.zones) z.update(gdt);
    this.zones = this.zones.filter((z) => !z.done);
    if (this.aimRing) this.aimRing.children[0].material.opacity = 0.16 + Math.sin(this.t * 6) * 0.06;
    if (this.zone?.visible) {
      this.zone.material.opacity = 0.45 + Math.sin(this.t * 5) * 0.1;
      this.zoneEdge.material.opacity = 0.6 + Math.sin(this.t * 8) * 0.35;
      this.zone.material.map.offset.x = -this.t * 0.4;
    }
    if (this.cine && !this.cine.done && this.cine.ownsCamera) this.cine.update(dt);
    else {
      if (this.cine?.done) this.cine = null;
      this.updateCamera(dt);
    }
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
        } else if (s.lab.hp < s.lab.maxHp * 0.35) {
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
  // Deploy: a lab vial falls from the sky, shatters and the Swarm pops out

  dropVial(side, unitId, x, count = 1, delay = 0.65) {
    const col = seriesColor(unitId);
    const mesh = vialMesh(col);
    mesh.position.set(x, 7, 0.1);
    mesh.rotation.set(0, 0, (side === 0 ? -1 : 1) * 0.3);
    this.scene.add(mesh);
    const tele = new THREE.Mesh(PLANE, decalMat(ringTex(), TEAM_COLORS[side], 0.9));
    tele.position.set(x - (count > 1 ? (side === 0 ? 0.21 : -0.21) * (count - 1) : 0), 0.04, 0);
    this.scene.add(tele);
    this.vials.push({ mesh, tele, side, x, col, t: 0, dur: Math.max(0.3, delay - 0.05), count });
    audio.play('whoosh', { pitch: 1.6, vol: 0.5, gap: 0.03 });
  }
  updateVials(dt) {
    for (const v of this.vials) {
      v.t += dt;
      const k = Math.min(1, v.t / v.dur);
      v.mesh.position.y = 7 * (1 - k * k) + 0.05;
      v.mesh.rotation.z += dt * (v.side === 0 ? -9 : 9);
      v.mesh.rotation.y += dt * 4;
      const r = 1.6 - k * 0.6;
      v.tele.scale.set(r * 1.6, 1, r * 1.1);
      v.tele.material.opacity = 0.35 + k * 0.6;
      if (k >= 1 && !v.done) {
        v.done = true;
        const p = new THREE.Vector3(v.x, 0.35, 0);
        v.mesh.updateMatrixWorld(true);
        fx.shatter(v.mesh, { force: 4, life: 0.9 });
        fx.burst(p, { count: 14, colors: [0xffffff, 0xcff2ff, 0x9fe6ff], size: 0.06, speed: 4.5, life: 0.5 });
        fx.slime(p, { count: 10 + v.count * 2, color: v.col, speed: 3.4 });
        fx.bubbles(p, { count: 5, color: v.col });
        fx.shockwave(new THREE.Vector3(v.tele.position.x, 0.02, 0), { radius: 1.3, color: TEAM_COLORS[v.side] });
        audio.play('shatter', { pitch: 1.5 + Math.random() * 0.3, vol: 0.55, gap: 0.03 });
        audio.play('spawn', { pitch: 0.9 + Math.random() * 0.3, gap: 0.05 });
        this.scene.remove(v.mesh, v.tele);
      }
    }
    this.vials = this.vials.filter((v) => !v.done);
  }

  // -------------------------------------------------------------------------
  // Event handling

  buildingObj(side, kind) {
    void kind;
    return this.labs[side];
  }
  /** Screen position of a tower (for HUD crown flights). */
  towerScreen(side, kind) {
    const o = this.buildingObj(side, kind);
    return engine.toScreen(_v.set(o.root.position.x, (o.height ?? 3) * 0.7, 0), this.camera);
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'spawn': {
        const a = new UnitActor(this, ev.unit);
        this.actors.set(ev.unit.id, a);
        if (a.landed) {
          const p = new THREE.Vector3(ev.unit.x, 0.3, ev.unit.z);
          const col = seriesColor(ev.unit.type);
          fx.slime(p, { count: 8, color: col, speed: 3 });
          fx.bubbles(p, { count: 4, color: col });
          if (ev.unit.boss) {
            engine.shake(0.6);
            audio.play('roar', { pitch: 0.7 });
          } else audio.play('spawn', { pitch: 0.9 + Math.random() * 0.3, gap: 0.05 });
        }
        break;
      }
      case 'landed': {
        const a = this.actors.get(ev.unit.id);
        if (a) a.land();
        break;
      }
      case 'deploy':
        this.dropVial(ev.side, ev.id, ev.x, ev.count ?? 1);
        if (ev.side === 0) this.react(0, 'sitCheer', 'happy', 'grin', 0.6);
        break;
      case 'cycle':
        if (ev.side === 0 && ev.cost) {
          const x = this.lastDropX ?? this.sim.sides[0].labX;
          floatText(new THREE.Vector3(x, 1.6, 0), `-${ev.cost}`, 'cost', { life: 0.9, rise: 40 });
        }
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
        if (!a || a.hidden) break;
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
        else if (kind === 'turretBolt' || kind === 'labCannon') fx.sparkle(at, { count: 8, colors: [TEAM_LIGHT[1 - ev.unit.side], 0xffffff], speed: 3.5 });
        else fx.burst(at, { count: 4, colors: [0xffffff], size: 0.05, speed: 2, life: 0.3 });
        if (ev.amount >= 1 && (ev.crit || ev.amount >= 60)) floatText(at, String(ev.amount), ev.crit ? 'crit' : 'dmg', { life: ev.crit ? 1.1 : 0.8 });
        audio.play(kind === 'melee' ? (ev.src?.size > 1.4 ? 'hitHeavy' : pick(['hit', 'bite', 'chomp'])) : kind === 'sludge' ? 'splat' : 'hit', { pitch: 0.8 + Math.random() * 0.4, gap: 0.04 });
        if (ev.crit || (ev.src && ev.src.size > 1.6)) {
          engine.shake(0.18);
          engine.hitstop(0.045);
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
          if (!a.hidden) for (const m of a.rig.meshes) fx.shatter(m, { force: big ? 7 : 5, dirX: ev.unit.side === 0 ? -0.6 : 0.6, life: big ? 2.2 : 1.5 });
          const p = a.rig.root.position.clone();
          fx.smoke(p, { count: big ? 10 : 4, scale: big ? 1.6 : 0.8 });
          fx.slime(p.clone().setY(0.3), { count: big ? 12 : 5, color: seriesColor(ev.unit.type), speed: 3 });
          if (ev.unit.type === 'feastablesPanther' || ev.unit.type === 'chocoChomper') fx.chocolate(p.clone().setY(0.6), { count: 30 });
          if (SWARMS[ev.unit.type]?.series === 'food') fx.groceries(p.clone().setY(0.5), { count: 6 });
          audio.play(big ? 'explode' : 'death', { pitch: 0.8 + Math.random() * 0.4, gap: 0.03 });
          if (big) {
            engine.shake(0.5);
            engine.hitstop(0.08);
          }
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
      case 'towerShoot': {
        const lab = this.labs[ev.side];
        lab.root.scale.set(1.03, 0.97, 1.03);
        tween(lab.root.scale, { x: 1, y: 1, z: 1 }, 0.25, { ease: 'outElastic' });
        this.addProjectile(ev.proj);
        break;
      }
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
      case 'towerHit':
        this.towerHitFx(ev);
        break;
      case 'labActivate': {
        const lab = this.labs[ev.side];
        lab.core.updateWorldMatrix(true, false);
        const p = new THREE.Vector3().setFromMatrixPosition(lab.core.matrixWorld);
        fx.sparkle(p, { count: 26, colors: [TEAM_COLORS[ev.side], 0xffffff, 0xffd23f], speed: 4, radius: 1.6 });
        fx.shockwave(new THREE.Vector3(lab.root.position.x, 0.05, 0), { radius: 3.2, color: TEAM_COLORS[ev.side] });
        floatText(p.clone().setY(lab.height + 1.2), ev.side === 0 ? 'LAB ONLINE!' : 'RIVAL LAB ONLINE!', 'big', { life: 1.5, rise: 30 });
        audio.play('alarm', { vol: 0.6 });
        audio.play('upgrade', { pitch: 0.8 });
        lab.root.scale.set(1.08, 0.92, 1.08);
        tween(lab.root.scale, { x: 1, y: 1, z: 1 }, 0.5, { ease: 'outElastic' });
        this.react(ev.side, 'sitWorried', 'shock', 'shout', 1.1, ev.side === 0 ? 'Lab defenses ON!' : pick(['Wake up, Lab!', 'Defenses up!']));
        break;
      }
      case 'towerDown':
        this.labDestroyed(ev.side);
        break;
      case 'megaReady': {
        const lab = this.labs[ev.side];
        fx.rise(new THREE.Vector3(lab.root.position.x, 0.2, 0.4), { count: 26, colors: [0xff2e88, 0xffd84a, 0x9ff2ff], radius: 1.6 });
        if (ev.side === 0) { audio.play('magic', { pitch: 0.7 }); audio.play('alarm', { vol: 0.4 }); }
        break;
      }
      case 'megaStart':
        this.cine = playMegaCutscene(this, ev);
        break;
      case 'megaLand':
        this.cine?.finish?.(ev);
        break;
      case 'megaSpecial':
        megaSpecialFx(this, ev);
        break;
      case 'megaEnd':
        megaEndFx(this, ev);
        break;
      case 'shieldHit': {
        const lab = this.buildingObj(ev.side, ev.kind ?? 'lab');
        if (lab.bubble) lab.bubble.material.opacity = 0.6;
        break;
      }
      case 'labUp': {
        const lab = this.labs[ev.side];
        const x = lab.root.position.x;
        fx.rise(new THREE.Vector3(x, 0.2, 0.3), { count: 24, colors: [0x29b6f6, 0x9ff2ff, 0xffd84a], radius: 1.8 });
        this.swapBase(ev.side, ev.tier ?? ev.level);
        const name = BASE_UPGRADES[(ev.tier ?? ev.level) - 1]?.name ?? 'BASE UP';
        floatText(new THREE.Vector3(x, (lab.height ?? 3) + 1.6, 0), `${name.toUpperCase()}!`, 'big', { life: 1.8, rise: 40 });
        if (ev.side === 0) {
          audio.play('upgrade');
          this.react(0, 'sitCheer', 'star', 'grin', 1.2, pick(['Upgrade!', 'Way better!', 'Now THAT is a base!']));
        }
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
      case 'refund':
        if (ev.side === 0) floatText(new THREE.Vector3(this.sim.sides[0].labX, 2.4, 0), '+1 REFUND', 'energy', { life: 1.1 });
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
      default:
        break;
    }
  }

  towerHitFx(ev) {
    const b = this.sim.sides[ev.side].lab;
    const obj = this.buildingObj(ev.side, ev.kind);
    obj.shakeT = 0.12;
    const frac = 1 - b.hp / b.maxHp;
    if (ev.kind === 'lab') obj.setDamage(frac);
    else obj.setDamage(frac);
    const fx0 = b.x - (ev.side === 0 ? -1 : 1) * b.half;
    const p = new THREE.Vector3(fx0, rand(0.6, (obj.height ?? 3) * 0.8), rand(-0.4, 0.9));
    const chips = ev.kind === 'lab' ? (obj.style === 'mansion' ? [0xf4ead0, 0xffd23f] : [0xeaf2ff, TEAM_COLORS[ev.side], 0xff2e88]) : [0xf0f4fc, TEAM_COLORS[ev.side], 0xb8c2d6];
    fx.burst(p, { count: 5, colors: chips, size: 0.11, speed: 4, vx: ev.side === 0 ? 2 : -2 });
    if (ev.amount >= 1) floatText(p, String(ev.amount), ev.amount > 150 ? 'crit' : 'tower', { life: 0.9 });
    audio.play('crunch', { pitch: 0.7 + Math.random() * 0.3, gap: 0.08 });
    if (ev.amount > 120) engine.shake(0.22);
    if (Math.random() < 0.12) this.react(ev.side, 'sitWorried', 'shock', 'shout', 0.9, ev.side === 1 ? pick(['Hey!', 'My Lab!', 'Not the Lab!', 'OUCH!']) : null);
  }



  // -------------------------------------------------------------------------
  // Projectiles (troop shots + tower bolts / Lab cannon balls)

  projStart(p) {
    if (p.tower) {
      return this.labTop(p.side).add(new THREE.Vector3(p.side === 0 ? 0.6 : -0.6, -1.2, 0));
    }
    const a = this.actors.get(p.src.id);
    return a ? a.rig.muzzleWorld(new THREE.Vector3()) : new THREE.Vector3(p.x0, p.height ?? 1, 0);
  }
  addProjectile(p) {
    const mesh = projectileMesh(p.kind, p.side);
    const start = this.projStart(p);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.projs.set(p.id, { p, mesh, start, trailT: 0 });
    if (p.tower) {
      const big = p.kind === 'labCannon';
      audio.play(big ? 'boom' : 'laser', { pitch: big ? 0.9 : 1.5 + Math.random() * 0.2, vol: big ? 0.7 : 0.45, gap: 0.05 });
      fx.sparkle(start, { count: big ? 10 : 5, colors: [TEAM_LIGHT[p.side], 0xffffff], speed: 2.5, life: 0.3 });
      if (big) fx.smoke(start, { count: 2, scale: 0.6, life: 0.5 });
      return;
    }
    const snd = { sludge: 'splat', letters: 'whoosh', nuke: 'zap', zap: 'zap', laser: 'laser', missile: 'whoosh', fire: 'whoosh', fries: 'swing', soda: 'fizz' }[p.kind] || 'shoot';
    audio.play(snd, { pitch: 1 + Math.random() * 0.3, gap: 0.05 });
    if (p.kind === 'laser' || p.kind === 'zap') fx.sparkle(start, { count: 4, colors: PROJ_COLORS[p.kind], speed: 2 });
  }
  updateProjectiles(dt) {
    for (const pr of this.projs.values()) {
      const p = pr.p;
      const k = Math.min(1, p.t / p.flight);
      const lob = LOB.has(p.kind);
      let tz = 0;
      const ta = p.target && !p.target.building ? this.actors.get(p.target.id) : null;
      const ty = ta ? ta.rig.root.position.y + ta.rig.height * 0.5 : p.target?.building ? 1.4 : 0.8;
      if (ta) tz = ta.rig.root.position.z;
      const x = pr.start.x + (p.tx - pr.start.x) * k;
      const yLine = pr.start.y + (ty - pr.start.y) * k;
      const arc = lob ? Math.sin(k * Math.PI) * (p.kind === 'labCannon' ? 1.2 : 1 + Math.abs(p.tx - pr.start.x) * 0.15) : 0;
      const z = pr.start.z + (tz - pr.start.z) * k;
      const m = pr.mesh;
      const prev = m.position.clone();
      m.position.set(x, yLine + arc, z);
      if (p.kind === 'letters' || p.kind === 'fries') { m.rotation.x += dt * 14; m.rotation.z += dt * 9; }
      else if (p.kind === 'labCannon') { m.rotation.x += dt * 8; m.rotation.y += dt * 5; }
      else if (m.position.distanceToSquared(prev) > 1e-8) m.lookAt(m.position.clone().add(m.position.clone().sub(prev)));
      pr.trailT -= dt;
      if (pr.trailT <= 0) {
        pr.trailT = 0.035;
        const cols = PROJ_COLORS[p.kind] || [0xffffff];
        if (p.kind === 'missile') fx.smoke(m.position, { count: 1, scale: 0.4, life: 0.5 });
        else if (p.kind === 'fire') fx.fire(m.position, { count: 2, radius: 0.3 });
        else if (p.kind === 'turretBolt' || p.kind === 'labCannon') particles.spawn('glow', { x: m.position.x, y: m.position.y, z: m.position.z, size: p.kind === 'labCannon' ? 0.16 : 0.09, life: 0.22, grav: 0, color: TEAM_LIGHT[p.side] });
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
      case 'turretBolt':
        fx.burst(pos, { count: 8, colors: [TEAM_LIGHT[p.side], 0xffffff], size: 0.06, speed: 3.5, layer: 'glow', life: 0.3 });
        break;
      case 'labCannon':
        fx.burst(pos, { count: 16, colors: [TEAM_COLORS[p.side], TEAM_LIGHT[p.side], 0xffffff], size: 0.1, speed: 5, layer: 'glow' });
        fx.shockwave(pos.clone().setY(0.03), { radius: 1.2, color: TEAM_COLORS[p.side] });
        audio.play('explode', { pitch: 1.6, vol: 0.5, gap: 0.05 });
        engine.shake(0.1);
        break;
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
      const o = b.obj;
      if (!b.home) b.home = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
      const shatter = () => {
        o.updateMatrixWorld(true);
        o.traverse((m) => { if (m.isMesh) fx.shatter(m, { force: 5, life: 1.8 }); });
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        if (['cart', 'shelf', 'products'].includes(b.kind)) fx.groceries(wp.clone().setY(0.6), { count: 10 });
        o.visible = false;
        audio.play(b.kind === 'cart' ? 'crunch' : 'shatter', { gap: 0.05 });
      };
      const dir = Math.sign(b.x - x) || (side === 0 ? 1 : -1);
      if (b.kind === 'cart') {
        // shopping-cart physics: launched, tumbling, bouncing, then wrecked
        this.cartsSmashed = (this.cartsSmashed ?? 0) + 1;
        audio.play('squeak', { pitch: 0.8 });
        const p0 = o.position.clone();
        let vx = dir * rand(3, 6), vy = rand(4.5, 7), vz = rand(-1, 1.5);
        let px = p0.x, py = p0.y, pz = p0.z, bounces = 0;
        const spin = rand(6, 12) * dir;
        animate(1.4, () => {
          const dt = 1 / 60;
          vy -= 18 * dt;
          px += vx * dt; py += vy * dt; pz += vz * dt;
          if (py < p0.y) { py = p0.y; vy = -vy * 0.45; vx *= 0.7; bounces++; audio.play('squeak', { pitch: 1 + bounces * 0.2, gap: 0.08 }); fx.dust(new THREE.Vector3(px, 0, pz), { count: 3 }); }
          o.position.set(px, py, pz);
          o.rotation.z -= spin * dt;
          o.rotation.y += spin * 0.3 * dt;
        }, { onComplete: shatter });
      } else if (b.kind === 'shelf') {
        // topples over and spills its products
        const r0 = o.rotation.x;
        audio.play('crunch', { pitch: 0.6 });
        animate(0.55, (e) => { o.rotation.x = r0 - e * 1.45 * (o.position.z < 0 ? -1 : 1); }, { ease: 'inQuad', onComplete: () => {
          engine.shake(0.2);
          fx.groceries(o.getWorldPosition(new THREE.Vector3()).setY(0.5), { count: 18, speed: 5 });
          setTimeout(shatter, 500);
        } });
      } else {
        shatter();
      }
      setTimeout(() => {
        o.visible = true;
        o.position.copy(b.home.p);
        o.rotation.copy(b.home.r);
        o.scale.setScalar(0.01);
        tween(o.scale, { x: b.home.s.x, y: b.home.s.y, z: b.home.s.z }, 0.5, { ease: 'outBack' });
        b.alive = true;
      }, 15000);
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
        audio.play('magic');
        const sd = this.sim.sides[side];
        const mk = (obj, b, r, y) => {
          const geo = new THREE.SphereGeometry(r, 24, 16);
          const mat = new THREE.MeshPhongMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.3, shininess: 120, depthWrite: false, emissive: 0x0a3a6a });
          const bubble = new THREE.Mesh(geo, mat);
          bubble.position.copy(obj.root.position).setY(y);
          bubble.scale.setScalar(0.01);
          this.scene.add(bubble);
          tween(bubble.scale, { x: 1, y: 1, z: 1 }, 0.5, { ease: 'outElastic' });
          obj.bubble = bubble;
          const z = {
            done: false,
            update: (dt) => {
              mat.opacity = damp(mat.opacity, 0.25, 4, dt);
              bubble.rotation.y += dt * 0.5;
              if (b.shield <= 0 || !b.alive) {
                fx.burst(bubble.position, { count: 30, colors: [0x9ff2ff, 0xffffff], size: 0.08, speed: 6, layer: 'glow' });
                audio.play('shatter');
                this.scene.remove(bubble);
                obj.bubble = null;
                z.done = true;
              }
            },
          };
          this.zones.push(z);
        };
        mk(this.labs[side], sd.lab, 3.4, 1.8);
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
      case 'megaSlam':
        fx.impact(p, { radius: ev.radius * 1.6, colors: [0xd8c4a0, 0xffffff, 0xffd84a] });
        fx.shockwave(p, { radius: ev.radius * 1.8, color: 0xffd84a });
        fx.burst(p.clone().setY(0.5), { count: 30, colors: [0xffd84a, 0xffffff, 0xff7a1a], speed: 9, size: 0.12 });
        audio.play('thud', { pitch: 0.55 });
        audio.play('explode', { pitch: 0.7 });
        engine.shake(0.85);
        engine.hitstop(0.1);
        this.smashNear(ev.x, ev.radius, ev.side);
        break;
      case 'glitch':
        fx.burst(p.clone().setY(1.2), { count: 50, colors: [0xff2ea8, 0x29e0ff, 0xffffff], speed: 8, size: 0.14 });
        fx.shockwave(p, { radius: ev.radius * 1.4, color: 0x29e0ff });
        audio.play('zap', { pitch: 0.5 });
        audio.play('laser', { pitch: 1.4 });
        engine.shake(0.6);
        engine.hitstop(0.08);
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
    const halfW = this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
    const startX = this.camX - dir * (halfW + 1);
    for (let i = 0; i < 8; i++) {
      const c = new Chibi({ ...CHARACTERS[defs[i % defs.length]], hat: i % 2 ? { type: 'cap', color: pick([0xff2e88, 0xffd23f, 0x5fdc4a, 0x29b6f6]) } : CHARACTERS[defs[i % defs.length]].hat }, { scale: 0.8 });
      c.root.position.set(startX - dir * i * 1.3, 0, 2.2 + (i % 2) * 0.7);
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
          c.root.position.x += dir * dt * 2.6;
          c.update(dt);
        }
        if (confT <= 0) {
          confT = 0.25;
          const lead = marchers[0].root.position;
          fx.confetti(new THREE.Vector3(lead.x - dir * 3, 3, 2.4), { count: 8, colors: [0xff2e88, 0xffd23f, 0x5fdc4a, 0x29b6f6, 0xff8a2a, 0xb05cff], speed: 4 });
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
      juan.root.position.set(t ? -0.95 : -0.6, t ? 1.75 : 1.4, 0);
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
        const ball = mv.obj.userData.ball || mv.obj;
        ball.rotation.z -= dt * 25 * (m.side === 0 ? 1 : -1);
        mv.obj.position.y = (mv.obj.userData.ball ? 0.1 : 0.6) + Math.abs(Math.sin(this.t * 10)) * 0.4;
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

  /** Lab destroyed: slow-mo chain explosions, the Commander tumbles off the roof. */
  async labDestroyed(side) {
    const lab = this.labs[side];
    this.autoFollow = false;
    this.focus(lab.root.position.x + (side === 0 ? 3 : -3), 10);
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
      lab.setDamage(1);
      for (const m of lab.meshes || []) if (m.visible) fx.shatter(m, { force: 9, life: 3, fraction: 0.6 });
      fx.smoke(p, { count: 30, scale: 2.5, life: 2 });
      fx.shockwave(p.clone().setY(0), { radius: 7, color: 0xffffff });
      if (this.theme === 'mart') fx.groceries(p, { count: 40, speed: 10 });
      if (lab.style === 'mansion' || lab.style === 'goldVault') fx.cash(p, 120, { speed: 10 });
      engine.shake(1);
      engine.timeScale = 1;
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

  /** Units of the winning side celebrate; the camera settles on the loser's side. */
  celebrate(side) {
    for (const a of this.actors.values()) {
      if (a.u.side === side) a.danceT = 99;
    }
    const ch = this.cmds[side];
    if (ch && !ch.busy) {
      ch.busy = true;
      ch.play('victory');
      ch.expr('star', 'grin');
    }
  }

  dispose() {
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
    for (const tp of this.towerPlates ?? []) tp.lab.dispose();
    this.plateLayer.remove();
    this.listeners.clear();
    // free GPU memory held by the arena (cached geometry simply re-uploads if reused)
    const seen = new Set();
    for (const v of Object.values(Mats)) for (const m of Array.isArray(v) ? v : [v]) seen.add(m);
    const free = (root) => root && root.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m) || m.userData?.shared) continue;
        seen.add(m);
        for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k] && !seen.has(m[k]) && !Object.values(texCache).includes(m[k])) { seen.add(m[k]); m[k].dispose(); }
        m.dispose();
      }
    });
    free(this.arena?.root);
  }
}
