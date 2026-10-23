// Frozen battle: the title screen's (and loading screen's) cinematic. A
// time-stopped frame of an epic side-view lane fight in the selected arena, built from the real
// battle assets (arena backdrop + atmosphere grade, the two bases with their
// Commanders, the player's deck Swarms vs. the arena's Swarms, spells and
// projectiles) and posed like a paused movie frame: a leap mid-air, a tank
// shove, a rival knocked flying, shots hanging in the air, a $100K bag over a
// cluster, a soda rocket mid-arc, debris / coins / slime suspended.
//
// Time is stopped but the VFX stay alive: suspended debris and rock chunks
// creep and spin in slow motion, sparks hang as streaks of light, glows and an
// anamorphic flare pulse on the focal hit, electric arcs crackle around the
// clash and the Commander, light shafts breathe and motes drift. (No ring /
// shockwave effects: spells and the hit read through filled glow pools,
// radial light streaks and debris.)
//
// Two camera rigs: a Battle Cats side view (pan / zoom / handheld sway) and a
// scripted cinematic one (shots(): slow dolly / crane / truck moves framed per
// aspect, see setShot) that the title screen cuts between. Owns its own
// THREE.Scene + camera; the title scene swaps it in (see title.js).
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { VoxGrid, makeMesh, Mats } from '../core/voxel.js';
import { fx, particles } from '../core/particles.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { SWARMS, SERIES } from '../data/swarms.js';
import { ARENAS } from '../data/arenas.js';
import { cardsOfArena, isSpell } from '../data/cards.js';
import { createSwarm } from '../models/swarmModels.js';
import { makeArenaBattle } from '../models/arenas/index.js';
import { battleCamera, coverFit } from '../models/arenas/kit.js';
import { makeBase } from '../models/props/base.js';
import { makeMoneyBag, makeSodaRocket, makeFood } from '../models/props.js';
import { ChargeAura } from '../game/battle/commandFx.js';
import { voxelPuddle } from '../game/battle/voxfx.js';
import { FIELD } from '../game/battle/field.js';
import { commanderCfg } from '../game/battle/loadout.js';
import { state, currentDeck, deployInfo } from '../game/state.js';

const TEAM = [0x2b9cff, 0xff3d55];
const TEAM_LIGHT = [0x9fe0ff, 0xffb0bc];
const LAB_X = FIELD.LAB_X;
const CUBE = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const LAYERS = ['cube', 'glow', 'bubble'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const hexOf = (css, fb = 0x7cff3a) => (typeof css === 'string' ? parseInt(css.replace('#', ''), 16) : css ?? fb);
const seriesColor = (id) => hexOf(SERIES[SWARMS[id]?.series]?.color);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
/** Commander shrinks on the small early bases (same table as the battle view). */
const cmdScale = (tier = 1) => [0.68, 0.8, 0.9, 1, 1, 1][Math.max(0, Math.min(5, tier - 1))];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Shared pixel textures + meshes (built once, never disposed)

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
/** Pixel-art contact shadow: a dithered blob with a jagged rim (never a clean disc). */
const shadowTex = () => pixelTex('shadow2', 32, (ctx, s) => {
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = x + 0.5 - s / 2, dy = y + 0.5 - s / 2;
    const a = Math.atan2(dy, dx);
    const rim = 1 - 0.1 * Math.abs(Math.sin(a * 3 + 0.6)) - 0.06 * Math.abs(Math.sin(a * 7 + 1.9));
    const d = Math.hypot(dx, dy) / (s / 2) / rim;
    if (d > 1) continue;
    // core solid, then a checker dither band, then sparse pixels at the very rim
    if (d > 0.82 && (x + y) % 2) continue;
    if (d > 0.93 && (x * 3 + y) % 4) continue;
    ctx.fillStyle = `rgba(10,8,30,${d < 0.55 ? 0.5 : 0.36})`;
    ctx.fillRect(x, y, 1, 1);
  }
});
/** Comic-book impact star (8 spikes, white-hot core). */
const starTex = () => pixelTex('star', 48, (ctx, s) => {
  const c = s / 2;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const r = Math.hypot(dx, dy) / c;
    const a = Math.atan2(dy, dx);
    const spikes = Math.pow(Math.abs(Math.cos(a * 4)), 5) * 0.62 + Math.pow(Math.abs(Math.cos(a * 4 + Math.PI / 4)), 9) * 0.3;
    const edge = 0.3 + spikes;
    if (r > edge) continue;
    const k = r / edge;
    ctx.fillStyle = k < 0.42 ? '#ffffff' : k < 0.7 ? '#fff3a8' : k < 0.88 ? '#ffc83a' : '#ff7a1a';
    ctx.fillRect(x, y, 1, 1);
  }
});
/** 4-point pixel glint: tapered cross arms + a faceted diamond core (flares, hot spots). */
const glintTex = () => pixelTex('glint', 32, (ctx, s) => {
  const c = s / 2;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = Math.abs(x + 0.5 - c), dy = Math.abs(y + 0.5 - c);
    const arm = (dx < 1 && dy < c * 0.95) || (dy < 1 && dx < c * 0.95) || (dx < 2 && dy < c * 0.5) || (dy < 2 && dx < c * 0.5);
    const diag = Math.abs(dx - dy) < 1 && dx < c * 0.32;
    const core = dx + dy < c * 0.34;
    const halo = dx + dy < c * 0.55 && (x + y) % 2 === 0;
    if (!(arm || diag || core || halo)) continue;
    const r = Math.max(dx, dy) / c;
    const a = core ? 1 : halo && !arm ? 0.35 : arm ? Math.max(0.25, 1 - r * 0.9) : 0.6;
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    ctx.fillRect(x, y, 1, 1);
  }
});
/** Long tapered pixel shard pointing along +x (light streaks, the anamorphic line). */
const spikeTex = () => pixelTex('spike', 32, (ctx, s) => {
  const c = s / 2;
  for (let x = 0; x < s; x++) {
    const k = 1 - Math.abs(x + 0.5 - c) / c;
    const hh = Math.max(0, Math.round(Math.pow(k, 1.6) * 4));
    for (let y = -hh; y <= hh; y++) {
      const a = (y === 0 ? 1 : 0.75 - Math.abs(y) / (hh + 1) * 0.5) * (0.35 + k * 0.65);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.fillRect(x, c + y, 1, 1);
    }
  }
});
/** Scorch / spell splat: an irregular spiky pixel burst with crack lines and a dithered edge. */
const splatTex = () => pixelTex('splat', 48, (ctx, s) => {
  const c = s / 2;
  const spikes = [0.2, 1.1, 1.9, 2.6, 3.5, 4.3, 5.1, 5.8];
  const radius = (a) => {
    let r = 0.5 + 0.05 * Math.sin(a * 5 + 1);
    for (const sa of spikes) { const d = Math.abs(((a - sa + Math.PI * 3) % (Math.PI * 2)) - Math.PI); r += Math.max(0, 0.42 - d * 1.6) * 0.9; }
    return Math.min(0.98, r);
  };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const a = Math.atan2(dy, dx);
    const d = Math.hypot(dx, dy) / c / radius(a);
    if (d > 1) continue;
    if (d > 0.78 && (x + y) % 2) continue;
    const a1 = d < 0.3 ? 0.95 : d < 0.6 ? 0.6 : 0.32;
    ctx.fillStyle = `rgba(255,255,255,${a1})`;
    ctx.fillRect(x, y, 1, 1);
  }
  // cracks radiating out of the core
  ctx.fillStyle = 'rgba(255,255,255,1)';
  for (const sa of spikes) for (let r = 2; r < c * radius(sa) * 0.95; r++) {
    const w = Math.sin(r * 0.9 + sa * 3) * 0.6;
    ctx.fillRect(Math.round(c + Math.cos(sa + w * 0.12) * r), Math.round(c + Math.sin(sa + w * 0.12) * r), 1, 1);
  }
});

const PROJ_COLORS = {
  sludge: [0x7a6a2a, 0x8fb23a], letters: [0xffffff, 0xf4f0e0], nuke: [0x7cff3a, 0xd4ff9a], zap: [0x9ff2ff, 0xffffff],
  laser: [0xff4fd8, 0x9ff2ff], missile: [0xdddddd, 0xff8a2a], fire: [0xff5a1f, 0xffd23f], fries: [0xffd23f, 0xf7c873],
  soda: [0x8a3a1a, 0xffe0c0], acid: [0x7cff3a, 0xb6ff3a], ice: [0x9ff2ff, 0xffffff], venom: [0x62d834, 0xc6ff3a],
};
const LOB = new Set(['sludge', 'letters', 'nuke', 'fries', 'fire', 'acid']);
const GLOWY = new Set(['nuke', 'laser', 'zap', 'fire', 'ice', 'acid', 'venom']);
const projGeo = {};
function projectileMesh(kind) {
  if (!projGeo[kind]) {
    const c = PROJ_COLORS[kind] || [0xffffff, 0xdddddd];
    const g = new VoxGrid();
    switch (kind) {
      case 'letters': g.box(-2, 0, -1, 1, 0, 1, c[0]).set(-1, 0, 2, 0xff4a4a).set(0, 0, 2, 0x29b6f6); break;
      case 'missile': g.box(-1, -1, -3, 0, 0, 2, 0xdddddd).box(-1, -1, 3, 0, 0, 3, 0xff4a4a).box(-2, -2, -3, 1, 1, -3, 0x5a6488); break;
      case 'laser': g.box(-1, -1, -3, 0, 0, 3, c[0], true); break;
      case 'fries': g.box(0, -3, 0, 0, 3, 0, c[0]).box(1, -2, 0, 1, 2, 0, c[1]); break;
      case 'fire': g.sphere(-0.5, -0.5, -0.5, 1.6, 0xff8a1f, true); g.set(0, 1, 0, 0xffe14a, true); break;
      case 'nuke': g.sphere(-0.5, -0.5, -0.5, 1.8, c[0], true); break;
      case 'soda': g.sphere(-0.5, -0.5, -0.5, 1.4, 0x9a4a2a).set(0, 1, 0, 0xfff0e0); break;
      default: g.sphere(-0.5, -0.5, -0.5, 1.6, (x, y, z) => ((x + y + z) & 1 ? c[0] : c[1]), GLOWY.has(kind));
    }
    projGeo[kind] = g.build({ pivot: 'center', scale: 0.1 });
  }
  const m = makeMesh(projGeo[kind]);
  m.castShadow = false;
  return m;
}

/** Jagged lightning polyline from a to b (midpoint displacement), written into out[]. */
function boltPath(a, b, out, rough, r) {
  out.length = 0;
  out.push(a.clone(), b.clone());
  for (let pass = 0; pass < 3; pass++) {
    const next = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const p0 = out[i - 1], p1 = out[i];
      const mid = p0.clone().lerp(p1, 0.4 + r() * 0.2);
      const len = p0.distanceTo(p1);
      mid.x += (r() - 0.5) * len * rough;
      mid.y += (r() - 0.5) * len * rough;
      mid.z += (r() - 0.5) * len * rough * 0.6;
      next.push(mid, p1);
    }
    out.splice(0, out.length, ...next);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Suspended particles: fx presets are simulated for a moment with the global
// particle system, then snapshotted into our own instanced meshes and held
// mid-air, creeping back and forth in slow motion.

class FrozenBits {
  constructor() {
    this.items = { cube: [], glow: [], bubble: [] };
    this.meshes = [];
    this.acc = 1;
  }
  /** Run fx calls, step the particle sim `age` seconds, keep what is in the air. */
  sim(fn, age = 0.2, o = {}) {
    particles.clear();
    try { fn(); } catch (e) { console.warn('frozen fx failed', e); }
    const n = Math.max(1, Math.round(age * 60));
    for (let i = 0; i < n; i++) particles.update(age / n);
    for (const name of LAYERS) {
      for (const p of particles.layers[name].list) {
        const t = p.life / p.max;
        let k = 1 + p.grow * p.life;
        if (t > p.shrinkStart) k *= 1 - (t - p.shrinkStart) / (1 - p.shrinkStart);
        if (p.fadeIn && p.life < p.fadeIn) k *= p.life / p.fadeIn;
        k *= p.k * (o.scale ?? 1);
        if (k < 0.08) continue;
        if (o.airOnly && p.y < p.ground + p.sy * 0.6 && name !== 'glow') continue;
        this.items[name].push({
          x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz,
          rx: p.rx, ry: p.ry, rz: p.rz, rvx: p.rvx || (Math.random() - 0.5) * 4, rvy: p.rvy || (Math.random() - 0.5) * 4, rvz: p.rvz || (Math.random() - 0.5) * 4,
          sx: p.sx * k, sy: p.sy * k, sz: p.sz * k, r: p.r, g: p.g, b: p.b, ph: Math.random() * 6.28, drift: o.drift ?? 1,
        });
      }
    }
    particles.clear();
  }
  /** Add one suspended bit by hand. */
  add(layer, o) {
    const c = new THREE.Color(o.color ?? 0xffffff);
    const s = o.size ?? 0.1;
    this.items[layer].push({
      x: o.x, y: o.y, z: o.z, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0,
      rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
      rvx: (Math.random() - 0.5) * 3, rvy: (Math.random() - 0.5) * 3, rvz: (Math.random() - 0.5) * 3,
      sx: o.sx ?? s, sy: o.sy ?? s, sz: o.sz ?? s, r: c.r, g: c.g, b: c.b, ph: Math.random() * 6.28, drift: o.drift ?? 1,
    });
  }
  finalize(scene) {
    for (const name of LAYERS) {
      const list = this.items[name];
      if (!list.length) continue;
      const L = particles.layers[name];
      const im = new THREE.InstancedMesh(L.mesh.geometry, L.mesh.material, list.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = false;
      const col = new Float32Array(list.length * 3);
      list.forEach((b, i) => { col[i * 3] = b.r; col[i * 3 + 1] = b.g; col[i * 3 + 2] = b.b; });
      im.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
      im.userData.layer = name;
      scene.add(im);
      this.meshes.push(im);
    }
    this.update(0, 0);
  }
  get count() {
    return this.items.cube.length + this.items.glow.length + this.items.bubble.length;
  }
  update(dt, t) {
    // 30 Hz is plenty for slow-motion creep
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    for (const im of this.meshes) {
      const list = this.items[im.userData.layer];
      const glow = im.userData.layer === 'glow';
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const s = Math.sin(t * 0.42 + b.ph) * 0.034 * b.drift;
        _p.set(b.x + b.vx * s, b.y + b.vy * s, b.z + b.vz * s);
        const rt = t * 0.035 * b.drift;
        _e.set(b.rx + b.rvx * rt, b.ry + b.rvy * rt, b.rz + b.rvz * rt);
        _q.setFromEuler(_e);
        const k = glow ? 0.8 + Math.sin(t * 3.1 + b.ph * 3) * 0.28 : 1;
        _s.set(b.sx * k, b.sy * k, b.sz * k);
        _m.compose(_p, _q, _s);
        im.setMatrixAt(i, _m);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }
  dispose(scene) {
    for (const im of this.meshes) { scene.remove(im); im.dispose(); }
    this.meshes.length = 0;
  }
}

/** Crackling voxel lightning between point pairs (white-hot core + coloured glow). */
class Arcs {
  constructor(scene, color, maxBolts = 5, cubes = 26) {
    this.n = cubes;
    this.max = maxBolts;
    const mk = (hex, mul, op) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(mul), toneMapped: false, transparent: true, opacity: op, depthWrite: false, fog: false });
    this.core = new THREE.InstancedMesh(CUBE, mk(0xffffff, 2.6, 1), cubes * maxBolts);
    this.glow = new THREE.InstancedMesh(CUBE, mk(color, 2.2, 0.5), cubes * maxBolts);
    for (const im of [this.core, this.glow]) { im.count = 0; im.frustumCulled = false; im.renderOrder = 7; scene.add(im); }
    this.pairs = [];
    this.path = [];
    this.regenT = 0;
    this.r = Math.random;
  }
  update(dt, t) {
    this.regenT -= dt;
    if (this.regenT > 0) return;
    this.regenT = 0.06 + this.r() * 0.07;
    let n = 0;
    for (const pr of this.pairs) {
      if (n / this.n >= this.max) break;
      if (this.r() > (pr.p ?? 0.7)) continue;
      _b.copy(pr.b);
      const j = pr.jitter ?? 0.3;
      _b.x += (this.r() - 0.5) * j; _b.y += (this.r() - 0.5) * j; _b.z += (this.r() - 0.5) * j * 0.6;
      const pts = boltPath(pr.a, _b, this.path, pr.rough ?? 0.5, this.r);
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += pts[i - 1].distanceTo(pts[i]);
      const step = total / this.n;
      let seg = 1, segPos = 0;
      for (let c = 0; c < this.n; c++) {
        const d = c * step;
        while (seg < pts.length - 1 && d > segPos + pts[seg - 1].distanceTo(pts[seg])) { segPos += pts[seg - 1].distanceTo(pts[seg]); seg++; }
        const sl = pts[seg - 1].distanceTo(pts[seg]) || 1;
        _p.copy(pts[seg - 1]).lerp(pts[seg], Math.min(1, (d - segPos) / sl));
        const size = (pr.size ?? 0.07) * (1 - (c / this.n) * 0.5);
        _s.setScalar(size);
        _m.compose(_p, _q.identity(), _s);
        this.core.setMatrixAt(n, _m);
        _s.setScalar(size * 2.4);
        _m.compose(_p, _q, _s);
        this.glow.setMatrixAt(n, _m);
        n++;
      }
    }
    this.core.count = this.glow.count = n;
    this.core.instanceMatrix.needsUpdate = this.glow.instanceMatrix.needsUpdate = true;
    this.glow.material.opacity = 0.4 + Math.sin(t * 23) * 0.12;
  }
  dispose(scene) {
    for (const im of [this.core, this.glow]) { scene.remove(im); im.dispose(); im.material.dispose(); }
  }
}

// ---------------------------------------------------------------------------

/** A jagged voxel ice crystal (frozen-ray prison): faceted shards, frosty rim, bright edges. */
function iceGrid(r) {
  const g = new VoxGrid();
  const col = (x, y, z) => ((x + y * 2 + z) % 5 === 0 ? 0xffffff : y > 8 ? 0xdffbff : (x + z) % 3 === 0 ? 0x9ff2ff : 0xbff6ff);
  // a chunky core block with chipped corners, plus shards jutting up and out
  for (let y = 0; y < 10; y++) for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
    const corner = Math.abs(x) + Math.abs(z) > 8 - (y > 6 ? (y - 6) * 1.5 : 0);
    if (!corner) g.set(x, y, z, col(x, y, z));
  }
  const shards = [[-4, 3, 0.35], [3, 4, -0.3], [0, -4, 0.15], [4, -2, -0.5], [-2, 4, 0.5]];
  for (const [sx, sz, lean] of shards) {
    const hh = 12 + Math.floor(r() * 5);
    for (let y = 0; y < hh; y++) {
      const w = Math.max(0, Math.round(2 - y / (hh / 2.2)));
      const ox = Math.round(sx + lean * y * 0.5);
      for (let x = -w; x <= w; x++) for (let z = -w; z <= w; z++) g.set(ox + x, y, sz + z, y > hh - 3 ? 0xffffff : col(x, y, z));
    }
  }
  return g;
}

export class FrozenBattle {
  /** k: arena index; o.locked shows a darkened, padlocked teaser. */
  constructor(k, o = {}) {
    this.k = k;
    this.A = ARENAS[k];
    this.locked = !!o.locked;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 600);
    this.t = 0;
    this.disposables = [];
    this.updaters = [];
    this.disposers = [];
    this.rigs = [];
    this.bases = [];
    this.chibis = [];
    this.r = rng(1013 + k * 7919);
    this.cam = { x: 0, vx: 0, zoom: 1, tz: 1, idle: 0, intro: 0, drag: false, dragX: 0 };
    this.liveGrade = null;
    this.cineShot = null; // cinematic camera shot (title)
  }

  // ------------------------------------------------------------------ build
  async load() {
    const scene = this.scene;
    // build in a few slices so the page can paint (and CSS keeps animating) in between
    const breathe = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const A = (this.arena = await makeArenaBattle(this.A.theme ?? this.A.id, { seed: 1 }));
    await breathe();
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
    this.grade = this.frozenGrade(A.grade ?? {});
    this.liveGrade = { ...this.grade, tint: [...this.grade.tint], lift: [...this.grade.lift] };

    this.shadowMat = this.own(new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false }));
    this.bits = new FrozenBits();
    try {
      this.stage();
    } catch (e) {
      console.error('frozen battle staging failed', e);
    }
    await breathe();
    this.bits.finalize(scene);
    this.addMotes();
    this.resize(engine.width, engine.height);
    this.rest();
    this.updateCamera(0);
    return this;
  }

  own(x) {
    this.disposables.push(x);
    return x;
  }

  /** The "time stopped" grade: cooler, a little desaturated, more contrast and a heavy vignette. */
  frozenGrade(g) {
    const t = g.tint ?? [0, 0, 0], l = g.lift ?? [0, 0, 0];
    const out = {
      exposure: (g.exposure ?? 0) - 0.02,
      sat: (g.sat ?? 0) - 0.2,
      contrast: (g.contrast ?? 0) + 0.08,
      tint: [t[0] - 0.03, t[1] + 0.005, t[2] + 0.06],
      lift: [l[0] + 0.005, l[1] + 0.015, l[2] + 0.05],
      vignette: Math.max(0.42, (g.vignette ?? 0) + 0.16),
    };
    if (this.locked) Object.assign(out, { exposure: out.exposure - 0.38, sat: -0.75, contrast: out.contrast + 0.05, tint: [-0.05, -0.02, 0.08], lift: [0, 0.01, 0.05], vignette: 0.6 });
    return out;
  }

  /** Pick both line-ups and pose the whole frame. */
  stage() {
    const p = state.p;
    const k = this.k;
    const R = this.r;
    // ---- line-ups
    const blue = [];
    for (const id of currentDeck() ?? []) {
      if (!id || isSpell(id)) continue;
      const d = deployInfo(id);
      const unit = d.unit ?? id;
      if (!SWARMS[unit]) continue;
      blue.push({ id: unit, variant: d.variant, skin: d.skin });
    }
    const spells = (currentDeck() ?? []).filter((id) => id && isSpell(id));
    const red = [];
    for (let j = k; j >= 0 && red.length < 6; j--) {
      for (const c of cardsOfArena(ARENAS[j].id)) {
        if (red.length >= 6) break;
        if (isSpell(c.id) || !SWARMS[c.id] || red.some((r) => r.id === c.id)) continue;
        red.push({ id: c.id, variant: 'base', skin: null });
      }
    }
    const fill = (list, other) => {
      const src = list.length ? list.slice() : other.length ? other.slice() : [{ id: 'panther' }];
      let i = 0;
      while (list.length < 5) list.push({ ...src[i++ % src.length] });
      return list;
    };
    fill(blue, red);
    fill(red, blue);
    const take = (list, pred) => {
      const i = list.findIndex(pred);
      return list.splice(i >= 0 ? i : 0, 1)[0];
    };
    const role = (u) => SWARMS[u.id]?.role;
    const size = (u) => SWARMS[u.id]?.size ?? 1;
    const bigFirst = (a, b) => size(b) - size(a);
    // blue: the biggest bruiser shoves at the centre, a melee leaps in, a ranged shoots
    const bShove = take(blue, (u) => role(u) === 'tank') ?? take(blue, () => true);
    blue.sort(bigFirst);
    const bRanged = take(blue, (u) => role(u) === 'ranged' || role(u) === 'support');
    const bLeap = take(blue, (u) => !SWARMS[u.id]?.traits?.flying && role(u) !== 'ranged');
    const bWalk = blue.shift();
    const bBack = blue.shift();
    const rKb = take(red, (u) => size(u) <= 1.2 && role(u) !== 'tank');
    const rRanged = take(red, (u) => role(u) === 'ranged' || role(u) === 'support');
    red.sort(bigFirst);
    const rAtk = red.shift();
    const rMid = red.shift();
    const rBack = red.shift();

    // ---- bases + Commanders
    const megaId = p.megas?.equipped && p.megas.owned?.[p.megas.equipped] ? p.megas.equipped : null;
    const tiers = [clamp(2 + Math.floor(k / 3), 2, 6), clamp(2 + Math.floor((k + 2) / 3), 2, 6)];
    if (megaId) tiers[0] = Math.max(3, tiers[0]);
    const labStyle = p.cosmetics?.labSkin && p.cosmetics.labSkin !== 'default' ? p.cosmetics.labSkin : 'default';
    for (let i = 0; i < 2; i++) {
      let lab = null;
      try { lab = makeBase(tiers[i], { side: i, flip: i === 1, style: i === 0 ? labStyle : 'rival' }); }
      catch (e) { lab = makeBase(tiers[i], { side: i, flip: i === 1 }); }
      lab.root.position.set(i === 0 ? -LAB_X : LAB_X, 0, 0);
      for (const m of lab.meshes ?? []) m.castShadow = true;
      lab.setDamage?.(i === 0 ? 0.12 : 0.42);
      this.scene.add(lab.root);
      this.bases.push(lab);
    }
    const cid = p.commanders?.equipped ?? 'recruit';
    const cfg = commanderCfg(cid, 1, p.commanders?.owned?.[cid]?.skin) ?? commanderCfg('recruit', 1);
    const rivals = ['nolan', 'juan', 'jimmy', 'recruit'].filter((c) => c !== cfg?.char);
    const rivalChar = rivals[k % rivals.length];
    const defs = [{ ...CHARACTERS[cfg?.char ?? 'recruit'], ...(cfg?.override ?? {}) }, CHARACTERS[rivalChar]];
    this.cmds = defs.map((def, i) => {
      const lab = this.bases[i];
      const ch = new Chibi(def, { scale: 0.9 });
      lab.seat.updateWorldMatrix(true, false);
      ch.root.position.setFromMatrixPosition(lab.seat.matrixWorld);
      ch.root.scale.setScalar(cmdScale(lab.tier) * 1.08);
      ch.root.rotation.y = i === 0 ? 0.55 : -0.55;
      if (i === 0) {
        if (megaId) { ch.play('holdUp'); ch.animT = 0.4; ch.expr('star', 'shout'); }
        else { ch.play('throw', { dur: 1 }); ch.animT = 0.6; ch.expr('determined', 'grin'); }
      } else {
        ch.play('panic'); ch.animT = 0.35; ch.expr('shock', 'shout');
      }
      ch.snap();
      this.scene.add(ch.root);
      this.chibis.push(ch);
      return ch;
    });
    // the player's Commander crackles with a fully charged MEGA
    const auraView = { scene: this.scene, sim: { over: false }, engineToScreen: (v) => engine.toScreen(v, this.camera) };
    this.aura = new ChargeAura(auraView, 0, document.createElement('div'));
    this.aura.side = 2; // silent (the battle only crackles for side 0)
    this.updaters.push((dt) => this.aura.update(dt, this.cmds[0], this.locked ? 0.6 : 1, this.locked ? 'charging' : 'ready'));

    // ---- the clash
    const I = (this.focus = new THREE.Vector3(0.15, 0.95, 0.3));
    const B = this.bits;
    const shover = this.unit(bShove, 0, -0.62, 0, 0.15, { atk: 0.52, pitch: 0.14 });
    const kb = this.unit(rKb, 1, 1.0, 1.05, 0.05, { atk: 0.85, pitch: -0.55, roll: 0.35, kb: true });
    this.afterimages(rKb, 1, kb, [[-0.35, -0.38], [-0.66, -0.7]], { pitch: -0.3 });
    let leap;
    if (megaId) {
      const M = { id: megaId, variant: p.megas.owned[megaId].variant ?? 'base' };
      leap = this.unit(M, 0, -1.25, 2.15, -0.75, { atk: 0.42, pitch: 0.42, scale: 2.2, stretch: 0.1 });
      this.afterimages(M, 0, leap, [[-0.7, -0.75], [-1.35, -1.25]], { pitch: 0.3, scale: 2.2 });
      this.unit(bLeap, 0, -2.75, 0.55, 0.55, { atk: 0.4, pitch: 0.25, stretch: 0.12 });
    } else {
      leap = this.unit(bLeap, 0, -1.85, 1.2, -0.3, { atk: 0.4, pitch: 0.34, stretch: 0.14 });
      this.afterimages(bLeap, 0, leap, [[-0.55, -0.55], [-1.1, -0.95]], { pitch: 0.25 });
    }
    const bR = this.unit(bRanged, 0, -4.7, 0, -0.55, { atk: 0.58 });
    this.unit(bWalk, 0, -3.5, 0, 0.78, { walk: 0.3 });
    const back = this.unit(bBack, 0, -7.4, 0.25, 0.25, { atk: 0.2, stretch: 0.18 });
    const rA = this.unit(rAtk, 1, 2.45, 0, -0.62, { atk: 0.36 });
    const rM = this.unit(rMid, 1, 3.55, 0, 0.6, { walk: 0.7 });
    const rR = this.unit(rRanged, 1, 5.5, 0, -0.3, { atk: 0.58 });
    this.unit(rBack, 1, 7.4, 0, 0.42, { walk: 0.1 });
    // who's who, for the cinematic camera's shots and captions
    this.cast = { leap, leapId: megaId ?? bLeap?.id, mega: !!megaId, shover, shoverId: bShove?.id, kb, kbId: rKb?.id, rA, rAtkId: rAtk?.id, rivalChar, cmdChar: cfg?.char ?? 'recruit' };
    // shots frozen mid-flight
    this.shot(bRanged, bR, rA, 0.5);
    this.shot(rRanged, rR, bR, 0.56);

    // the big hit: impact star + anamorphic flare, light streaks bursting out, a scorched glow
    // on the ground, rock chunks, debris + slime hanging in the air
    this.impactStar(I, 1.35, 0);
    this.anamorphic(I, 0xbfe8ff, 7.5);
    this.streaks(I, 0xfff0c0, 14, 2.6);
    this.glowPool(I.x, I.z, 2.4, 0xffa040, 0.55);
    this.chunks(I, 9);
    const kbCol = seriesColor(rKb.id);
    B.sim(() => {
      fx.burst(I, { count: 34, colors: [0xffffff, 0xffe27a, 0xffd23f], size: 0.1, speed: 7, grav: -6 });
      fx.slime(kb.root.position.clone().setY(0.9), { count: 16, color: kbCol, speed: 4 });
      fx.burst(new THREE.Vector3(I.x, 0.1, I.z), { count: 26, colors: [0xd8c4a0, 0xb89a70, 0x8a7050], size: 0.13, speed: 6, ground: -5 });
      fx.sparkle(I, { count: 26, colors: [0xffffff, 0x9ff2ff, 0xffe27a], speed: 5, radius: 1.2 });
    }, 0.16, { airOnly: true });
    B.sim(() => fx.dust(new THREE.Vector3(shover.root.position.x - 0.4, 0, 0.2), { count: 12, scale: 2.4, vx: -1.5 }), 0.2);
    // arcs crackling around the clash (and off the leaper's claws)
    this.arcs = new Arcs(this.scene, 0x5fe8ff, 5);
    this.arcs.pairs.push(
      { a: I.clone(), b: I.clone().add(new THREE.Vector3(-1.1, 0.4, 0.2)), p: 0.8, jitter: 0.6 },
      { a: I.clone(), b: I.clone().add(new THREE.Vector3(1.2, 0.5, -0.1)), p: 0.8, jitter: 0.6 },
      { a: I.clone(), b: new THREE.Vector3(I.x + 0.3, 0.02, I.z + 0.4), p: 0.6, jitter: 1.2 },
      { a: I.clone().add(new THREE.Vector3(0, 0.2, 0)), b: I.clone().add(new THREE.Vector3(0.2, 1.6, 0)), p: 0.45, jitter: 0.8 },
    );
    this.updaters.push((dt, t) => this.arcs.update(dt, t));
    this.disposers.push(() => this.arcs.dispose(this.scene));
    // a light shaft pours onto the focal hit
    this.shaft(I.x - 0.2, 0xfff2c8, 0.16);
    // reinforcements: a vial just shattered behind the blue line
    B.sim(() => {
      const v = new THREE.Vector3(back.root.position.x, 0.35, back.root.position.z);
      fx.burst(v, { count: 18, colors: [0xffffff, 0xcff2ff, 0x9fe6ff], size: 0.06, speed: 4.5 });
      fx.slime(v, { count: 14, color: seriesColor(bBack.id), speed: 3.4 });
      fx.bubbles(v, { count: 6, color: seriesColor(bBack.id) });
    }, 0.14);
    this.glowPool(back.root.position.x, back.root.position.z, 1.5, seriesColor(bBack.id), 0.5);
    this.streaks(new THREE.Vector3(back.root.position.x, 0.5, back.root.position.z), 0xcff2ff, 7, 1.1);
    // smoke off the battered rival base
    const rb = this.bases[1];
    B.sim(() => {
      fx.smoke(new THREE.Vector3(rb.root.position.x - 0.6, Math.min(5, rb.height ?? 3) * 0.8, 0.4), { count: 9, scale: 0.95, rise: 1.4 });
      fx.fire(new THREE.Vector3(rb.root.position.x - 1.2, Math.min(4.5, rb.height ?? 3) * 0.55, 0.9), { count: 10, scale: 1.1 });
      fx.burst(new THREE.Vector3(rb.root.position.x - (rb.width ?? 3.4) * 0.45, 1.6, 0.6), { count: 16, colors: [0xeaf2ff, TEAM[1], 0xff2e88, 0x5a6488], size: 0.12, speed: 5, vx: 2.5 });
    }, 0.45, { airOnly: true, drift: 0.6 });

    // ---- spells
    const SPELL_ORDER = ['moneyDrop', 'sodaRocket', 'freezeRay', 'foodThrow', 'slimeFlood'];
    const blueSpell = SPELL_ORDER.find((s) => spells.includes(s)) ?? 'moneyDrop';
    const redSpell = blueSpell === 'sodaRocket' ? 'freezeRay' : 'sodaRocket';
    this.spell(blueSpell, 0, 3.2, { target: rM });
    this.spell(redSpell, 1, -4.2, { target: bR });
    // a frozen hit flash on the rival commander's roof when the base is battered
    this.flare(new THREE.Vector3(rb.root.position.x - 1.2, Math.min(4.5, rb.height ?? 3) * 0.55, 0.9), 0xff8a2a, 1.6);
  }

  /** Place a posed Swarm. o: { atk (0..1 attack phase), walk (stride phase), pitch, roll, scale, stretch, kb } */
  unit(u, side, x, y, z, o = {}) {
    const id = u?.id ?? 'panther';
    const def = SWARMS[id];
    const sc = (o.scale ?? def?.size ?? 1) * 1.06;
    const rig = createSwarm(id, { variant: u?.variant ?? 'base', skin: u?.skin ?? null, scale: sc });
    const flying = !!def?.traits?.flying;
    const root = rig.root;
    root.rotation.order = 'YXZ';
    root.position.set(x, y + (flying ? 0.9 : 0), z);
    root.rotation.y = side === 0 ? Math.PI / 2 - 0.42 : -Math.PI / 2 + 0.42;
    root.rotation.x = o.pitch ?? 0;
    root.rotation.z = o.roll ?? 0;
    this.pose(rig, o);
    if (o.stretch) {
      const s = rig.baseScale;
      rig.inner.scale.set(s * (1 - o.stretch * 0.5), s * (1 + o.stretch), s * (1 - o.stretch * 0.5));
    }
    this.scene.add(root);
    this.rigs.push(rig);
    // ground decal: a dithered pixel contact shadow (shrinks with height)
    const r = Math.max(0.55, 0.62 * sc);
    const air = Math.max(0, root.position.y);
    const sh = 1 / (1 + air * 0.45);
    this.decal(x, z, r * 1.5 * sh, r * 1.1 * sh, this.shadowMat);
    return rig;
  }

  /** Hold a rig in a pose: attack phase `atk` (windup 0..0.45, strike ~0.5) or a walk stride. */
  pose(rig, o) {
    const dt = 1 / 30;
    const T = 3 + (o.walk ?? 0) * 0.52;
    rig.setState(o.walk !== undefined ? 'walk' : 'idle');
    for (let i = 0; i < 36; i++) {
      rig.t = T - dt;
      if (o.atk !== undefined) { rig.atkDur = 1; rig.atkT = o.atk - dt; }
      rig.squash = rig.squashV = 0;
      rig.update(dt);
    }
    if (o.kb) rig.flash(0, true);
  }

  /** Motion-blur afterimages trailing a frozen mover (team-tinted ghosts). */
  afterimages(u, side, rig, offs, o = {}) {
    const mat = this.own(new THREE.MeshBasicMaterial({ color: TEAM_LIGHT[side], transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const id = u?.id ?? 'panther';
    offs.forEach(([dx, dy], i) => {
      const g = createSwarm(id, { variant: u?.variant ?? 'base', skin: u?.skin ?? null, scale: rig.baseScale });
      for (const m of g.meshes) { m.material = mat; m.castShadow = false; }
      g.root.rotation.order = 'YXZ';
      g.root.rotation.copy(rig.root.rotation);
      g.root.rotation.x = lerp(rig.root.rotation.x, o.pitch ?? 0, (i + 1) / offs.length);
      g.root.position.copy(rig.root.position).add(_a.set(dx, dy, -0.05 * (i + 1)));
      this.pose(g, { atk: 0.2 });
      g.inner.scale.multiplyScalar(1 - i * 0.04);
      this.scene.add(g.root);
      this.rigs.push(g);
      if (i === 0) this.updaters.push((dt, t) => { mat.opacity = 0.11 + Math.sin(t * 2.2) * 0.04; });
    });
  }

  decal(x, z, sx, sz, mat, update) {
    const m = new THREE.Mesh(PLANE, mat);
    m.scale.set(sx, 1, sz);
    m.position.set(x, 0.03, z);
    this.scene.add(m);
    if (update) this.updaters.push((dt, t) => update(t, m));
    return m;
  }

  /** A ranged unit's shot hanging mid-flight, with its trail suspended behind it. */
  shot(u, from, to, k) {
    const kind = SWARMS[u?.id]?.projectile;
    if (!kind || !from || !to) return;
    const a = from.muzzleWorld(new THREE.Vector3());
    const b = to.root.position.clone().setY(to.root.position.y + to.height * 0.55);
    const lob = LOB.has(kind);
    const at = (kk, out) => out.set(lerp(a.x, b.x, kk), lerp(a.y, b.y, kk) + (lob ? Math.sin(kk * Math.PI) * (1 + Math.abs(b.x - a.x) * 0.15) : 0), lerp(a.z, b.z, kk));
    const m = projectileMesh(kind);
    at(k, m.position);
    at(k + 0.02, _a);
    m.lookAt(_a);
    m.scale.setScalar(1.25);
    this.scene.add(m);
    const pos0 = m.position.clone(), dir = _a.clone().sub(m.position).normalize();
    this.updaters.push((dt, t) => {
      m.position.copy(pos0).addScaledVector(dir, Math.sin(t * 0.42) * 0.05);
      if (kind === 'letters' || kind === 'fries') m.rotation.z += dt * 0.25;
    });
    const cols = PROJ_COLORS[kind] || [0xffffff];
    for (let i = 1; i <= 9; i++) {
      const kk = k - i * 0.035;
      if (kk <= 0) break;
      at(kk, _p);
      const f = 1 - i / 10;
      if (kind === 'missile' || kind === 'soda') this.bits.add('cube', { x: _p.x, y: _p.y, z: _p.z, size: 0.12 + i * 0.03, color: 0xe8e8ee, drift: 0.5 });
      else if (kind === 'sludge' || kind === 'acid' || kind === 'venom') this.bits.add('cube', { x: _p.x, y: _p.y - i * 0.02, z: _p.z, size: 0.07 * f + 0.02, color: cols[1], vy: -1 });
      else this.bits.add('glow', { x: _p.x + (this.r() - 0.5) * 0.1, y: _p.y + (this.r() - 0.5) * 0.1, z: _p.z, size: 0.09 * f + 0.02, color: cols[i % cols.length] });
    }
    if (GLOWY.has(kind) || kind === 'zap') this.flare(pos0, cols[0], 0.9);
  }

  /** Comic impact star (additive pixel sprite, pulsing). */
  impactStar(pos, size, hue) {
    void hue;
    const mat = this.own(new THREE.SpriteMaterial({ map: starTex(), color: new THREE.Color(1.55, 1.45, 1.3), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, toneMapped: false, transparent: true }));
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.renderOrder = 8;
    this.scene.add(sp);
    const inner = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: glintTex(), color: new THREE.Color(1.3, 1.25, 1.1), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, toneMapped: false, transparent: true, opacity: 0.45 })));
    inner.position.copy(pos);
    inner.renderOrder = 8;
    this.scene.add(inner);
    this.updaters.push((dt, t) => {
      const k = 1 + Math.sin(t * 5.3) * 0.06 + Math.sin(t * 13.1) * 0.03;
      sp.scale.setScalar(size * k);
      mat.rotation = Math.sin(t * 0.4) * 0.12;
      inner.scale.setScalar(size * 1.25 * (1.05 - Math.sin(t * 5.3) * 0.08));
    });
  }

  /** Small pulsing pixel glint. */
  flare(pos, color, size = 1) {
    const mat = this.own(new THREE.SpriteMaterial({ map: glintTex(), color: new THREE.Color(color).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, transparent: true, opacity: 0.75 }));
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.renderOrder = 6;
    this.scene.add(sp);
    const ph = this.r() * 6;
    this.updaters.push((dt, t) => sp.scale.setScalar(size * (0.9 + Math.sin(t * 3.7 + ph) * 0.12)));
  }

  /** Anamorphic lens flare: a long thin horizontal streak + a soft core (movie lens look). */
  anamorphic(pos, color, len = 7) {
    const col = new THREE.Color(color).multiplyScalar(1.6);
    const mk = (op) => this.own(new THREE.SpriteMaterial({ map: spikeTex(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, toneMapped: false, transparent: true, opacity: op }));
    const line = new THREE.Sprite(mk(0.55)), line2 = new THREE.Sprite(mk(0.3));
    for (const sp of [line, line2]) { sp.position.copy(pos); sp.renderOrder = 9; this.scene.add(sp); }
    this.updaters.push((dt, t) => {
      const k = 1 + Math.sin(t * 5.3) * 0.05 + Math.sin(t * 1.7) * 0.06;
      line.scale.set(len * k, 0.09 * k, 1);
      line2.scale.set(len * 0.45 * k, 0.5, 1);
      line.material.opacity = 0.5 + Math.sin(t * 2.1) * 0.08;
    });
  }

  /** Light streaks bursting out of a hit: thin additive shards frozen mid-flight, flickering. */
  streaks(pos, color, n = 12, reach = 2.4) {
    const col = new THREE.Color(color).multiplyScalar(1.8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (this.r() - 0.5) * 0.5;
      const mat = this.own(new THREE.SpriteMaterial({ map: spikeTex(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, transparent: true, opacity: 0.7 }));
      mat.rotation = a;
      const sp = new THREE.Sprite(mat);
      const d = reach * (0.45 + this.r() * 0.6);
      const len = reach * (0.35 + this.r() * 0.45);
      sp.position.set(pos.x + Math.cos(a) * d * 0.62, pos.y + Math.sin(a) * d * 0.5, pos.z + 0.25 + this.r() * 0.3);
      sp.renderOrder = 8;
      this.scene.add(sp);
      const ph = this.r() * 6.28, th = 0.05 + this.r() * 0.05;
      this.updaters.push((dt, t) => {
        const f = 0.75 + Math.sin(t * 9 + ph) * 0.18 + Math.sin(t * 23 + ph * 2) * 0.07;
        sp.scale.set(len * f, th * 4, 1);
        mat.opacity = 0.42 + f * 0.3;
      });
    }
  }

  /** A pixel-art scorch / spell splat glowing on the ground (spiky, cracked — never a disc or ring). */
  glowPool(x, z, r, color, op = 0.5) {
    const mat = this.own(new THREE.MeshBasicMaterial({ map: splatTex(), color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const ph = this.r() * 6;
    const m = this.decal(x, z, r * 2, r * 1.4, mat, (t, mm) => { mm.material.opacity = op * (0.82 + Math.sin(t * 2.3 + ph) * 0.18); });
    m.rotation.y = this.r() * Math.PI;
    return m;
  }

  /** Chunks of the ground blasted up by a hit, hanging in the air (tumbling slowly). */
  chunks(pos, n = 8) {
    const cols = [0x8a7050, 0x6e5a44, 0xa08a6a, 0x5a4a3a];
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + this.r() * 0.7) * (this.r() < 0.5 ? 1 : -1) + Math.PI / 2;
      const d = 0.6 + this.r() * 1.6;
      const s = 0.12 + this.r() * 0.16;
      this.bits.add('cube', { x: pos.x + Math.cos(a) * d, y: 0.25 + Math.abs(Math.sin(a)) * d * 0.9 + this.r() * 0.6, z: pos.z + (this.r() - 0.3) * 1.1, sx: s, sy: s * (0.7 + this.r() * 0.5), sz: s, color: cols[i % cols.length], vx: Math.cos(a) * 3, vy: 2, drift: 0.8 });
    }
  }

  /** A soft god-ray cone falling onto x (additive vertex-colour gradient, breathing). */
  shaft(x, color, op = 0.4) {
    const geo = this.own(new THREE.CylinderGeometry(0.45, 1.9, 11, 18, 4, true));
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 11 + 0.5; // 0 bottom .. 1 top
      const k = Math.sin(Math.min(1, y * 1.15) * Math.PI) * 0.9 * (0.4 + y * 0.6);
      cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = this.own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false }));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 5.3, -1.4);
    m.rotation.z = -0.2;
    m.renderOrder = 4;
    this.scene.add(m);
    this.updaters.push((dt, t) => { mat.opacity = op * (0.8 + Math.sin(t * 0.9) * 0.15 + Math.sin(t * 2.3) * 0.05); });
  }

  /** Spells frozen mid-cast. side casts at world x. */
  spell(id, side, x, o = {}) {
    const B = this.bits;
    const casterTop = () => {
      const lab = this.bases[side];
      lab.core?.updateWorldMatrix(true, false);
      const v = lab.core ? new THREE.Vector3().setFromMatrixPosition(lab.core.matrixWorld) : lab.root.position.clone().setY(3);
      v.y += 2;
      return v;
    };
    // the spell's target lights up the ground (a soft filled pool, no rings)
    const ringAt = (r, color) => this.glowPool(x, 0.1, r * 0.9, color, 0.45);
    switch (id) {
      case 'moneyDrop': {
        const bag = makeMoneyBag();
        bag.scale.setScalar(1.2);
        const y0 = 3.3;
        bag.position.set(x, y0, 0.15);
        bag.rotation.set(0.12, 0.6, -0.1);
        this.scene.add(bag);
        this.updaters.push((dt, t) => { bag.position.y = y0 + Math.sin(t * 0.8) * 0.06; bag.rotation.y = 0.6 + Math.sin(t * 0.3) * 0.08; });
        ringAt(1.9, 0xffd23f);
        this.decal(x, 0.15, 2.2, 1.5, this.shadowMat);
        B.sim(() => fx.cash(new THREE.Vector3(x, y0 + 0.3, 0.15), 46, { speed: 4.5, coinRatio: 0.35, ground: -5 }), 0.32, { drift: 0.7 });
        // the "$" streak of air it pushes down
        for (let i = 0; i < 8; i++) B.add('glow', { x: x + (this.r() - 0.5) * 1.6, y: y0 + 0.8 + this.r() * 1.8, z: 0.2 + (this.r() - 0.5) * 0.8, sx: 0.04, sy: 0.5 + this.r() * 0.5, sz: 0.04, color: 0xfff27a, vy: -4 });
        break;
      }
      case 'sodaRocket': {
        const rocket = makeSodaRocket();
        const from = casterTop();
        const to = new THREE.Vector3(x, 0.2, 0);
        const at = (kk, out) => out.set(lerp(from.x, to.x, kk), lerp(from.y, to.y, kk) + Math.sin(kk * Math.PI) * 5, 0.2);
        const kk = 0.72;
        at(kk, rocket.position);
        at(kk + 0.02, _a);
        rocket.lookAt(_a);
        rocket.rotateX(Math.PI / 2);
        rocket.scale.setScalar(1.15);
        this.scene.add(rocket);
        const p0 = rocket.position.clone();
        this.updaters.push((dt, t) => { rocket.position.set(p0.x + Math.sin(t * 31) * 0.008, p0.y + Math.sin(t * 27) * 0.008, p0.z); });
        for (let i = 1; i < 26; i++) {
          const k2 = kk - i * 0.022;
          if (k2 <= 0.02) break;
          at(k2, _p);
          B.add('cube', { x: _p.x + (this.r() - 0.5) * 0.2, y: _p.y + (this.r() - 0.5) * 0.2, z: _p.z, size: 0.14 + i * 0.022, color: i < 3 ? 0xffe0c0 : 0xf2f4f8, drift: 0.6, vy: 0.6 });
          if (i < 10 && this.r() < 0.7) B.add('bubble', { x: _p.x, y: _p.y - 0.1, z: _p.z + 0.1, size: 0.09, color: 0xffe0c0, vy: 1 });
        }
        this.flare(p0, 0xffb84a, 1.2);
        ringAt(1.7, 0xff8a2a);
        break;
      }
      case 'freezeRay': {
        const from = casterTop();
        for (let i = 0; i <= 34; i++) {
          const k2 = i / 34;
          B.add('glow', { x: lerp(from.x, x, k2), y: lerp(from.y, 0.8, k2) + Math.sin(k2 * Math.PI) * 1.2, z: 0, size: 0.1 + this.r() * 0.06, color: i % 3 ? 0x9ff2ff : 0xffffff });
        }
        const tgt = o.target;
        const p = tgt ? tgt.root.position : new THREE.Vector3(x, 0, 0);
        const h = Math.max(tgt?.height ?? 0.7, 0.6) * 1.15;
        const ice = new THREE.Mesh(this.own(iceGrid(this.r).build({ pivot: 'bottom', scale: h / 12 })), this.own(new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.55, shininess: 110, specular: 0xffffff, depthWrite: false })));
        ice.position.set(p.x, 0, p.z);
        ice.rotation.y = 0.4;
        this.scene.add(ice);
        B.sim(() => fx.burst(new THREE.Vector3(p.x, 0.6, p.z), { count: 26, colors: [0x9ff2ff, 0xffffff, 0xc8f8ff], size: 0.1, speed: 5, ground: -5 }), 0.15);
        ringAt(1.5, 0x9ff2ff);
        break;
      }
      case 'foodThrow': {
        const from = casterTop();
        const kinds = ['burger', 'pizza', 'donut', 'fries', 'chocoBar', 'apple', 'cake'];
        for (let i = 0; i < 6; i++) {
          const to = new THREE.Vector3(x + (this.r() - 0.5) * 2.6, 0.4, (this.r() - 0.5) * 1.4);
          const kk = 0.55 + i * 0.07;
          const f = makeFood(kinds[i % kinds.length]);
          f.scale.setScalar(1.3);
          f.position.set(lerp(from.x, to.x, kk), lerp(from.y, to.y, kk) + Math.sin(kk * Math.PI) * 3.5, lerp(from.z, to.z, kk));
          f.rotation.set(this.r() * 6, this.r() * 6, this.r() * 6);
          this.scene.add(f);
          const r0 = f.rotation.clone(), sp = (this.r() - 0.5) * 0.3;
          this.updaters.push((dt, t) => { f.rotation.x = r0.x + t * sp; f.rotation.z = r0.z + t * sp * 0.7; });
        }
        ringAt(1.8, 0x5fdc4a);
        break;
      }
      case 'slimeFlood': {
        const pool = voxelPuddle(1.6, 0x7cff3a);
        pool.position.set(x, 0.02, 0);
        this.scene.add(pool);
        B.sim(() => fx.slime(new THREE.Vector3(x, 2.4, 0), { count: 40, speed: 4, color: 0x7cff3a, scale: 1.4, ground: -5 }), 0.18);
        break;
      }
      default:
        break;
    }
  }

  /** Drifting motes / time dust filling the frame (instanced glow cubes). */
  addMotes() {
    const N = 90;
    const mat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.7, 1.9), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    const im = new THREE.InstancedMesh(CUBE, mat, N);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.renderOrder = 5;
    const cols = new Float32Array(N * 3);
    const tint = [[1, 1, 1], [0.7, 0.95, 1], [1, 0.9, 0.6], [0.8, 0.85, 1]];
    const motes = [];
    for (let i = 0; i < N; i++) {
      const c = tint[i % tint.length];
      cols.set(c, i * 3);
      motes.push({ x: (this.r() - 0.5) * 34, y: this.r() * 7, z: -2.5 + this.r() * 7, s: 0.025 + this.r() * 0.05, ph: this.r() * 6.28, sp: 0.05 + this.r() * 0.12 });
    }
    im.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
    this.scene.add(im);
    this.motes = { im, motes, acc: 1 };
    this.disposers.push(() => { this.scene.remove(im); im.dispose(); });
  }
  updateMotes(dt, t) {
    const M = this.motes;
    if (!M) return;
    M.acc += dt;
    if (M.acc < 1 / 30) return;
    M.acc = 0;
    const list = M.motes;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const y = ((m.y + t * m.sp) % 7.5) + 0.1;
      _p.set(m.x + Math.sin(t * 0.21 + m.ph) * 0.6, y, m.z + Math.cos(t * 0.17 + m.ph) * 0.3);
      const tw = 0.55 + Math.sin(t * 2.2 + m.ph * 4) * 0.45;
      _s.setScalar(m.s * tw * smooth(Math.min(y, 7.6 - y) * 1.5));
      _m.compose(_p, _q.identity(), _s);
      M.im.setMatrixAt(i, _m);
    }
    M.im.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ camera
  baseWidth() {
    const a = this.camera.aspect;
    return a < 1 ? 10.2 : clamp(10.5 + a * 2.4, 12.5, 19);
  }
  viewWidth() {
    return this.baseWidth() * this.cam.zoom;
  }
  limits(width = this.viewWidth()) {
    const half = width / 2;
    const lim = Math.min(LAB_X + 0.5, FIELD.VIEW_X - half + 0.4);
    return Math.max(0, lim);
  }
  restX() {
    return this.camera.aspect < 1 ? -0.7 : -0.4;
  }
  /** Snap to the resting framing and replay the dolly-in reveal. */
  rest(intro = true) {
    this.cam.x = this.restX();
    this.cam.vx = 0;
    this.cam.zoom = this.cam.tz = 1;
    this.cam.idle = 0;
    this.cam.intro = intro ? 0 : 1;
  }
  worldPerPx() {
    return this.viewWidth() / Math.max(1, engine.width);
  }
  dragStart() {
    this.cam.drag = true;
    this.cam.vx = 0;
    this.cam.idle = 0;
    this.cam.intro = 1;
  }
  dragMove(dxPx) {
    const d = -dxPx * this.worldPerPx();
    const lim = this.limits();
    const x = this.cam.x + d;
    // rubber-band past the ends
    const over = x < -lim ? x + lim : x > lim ? x - lim : 0;
    this.cam.x = over ? this.cam.x + d * 0.35 : x;
    this.cam.idle = 0;
  }
  dragEnd(vxPx) {
    this.cam.drag = false;
    this.cam.vx = clamp(-vxPx * this.worldPerPx(), -40, 40);
  }
  zoomBy(f) {
    this.cam.tz = clamp(this.cam.tz * f, 0.72, 1.45);
    this.cam.idle = 0;
    this.cam.intro = 1;
  }
  /** World point on the lane plane under a screen point. */
  screenToLane(cx, cy) {
    return engine.rayToZPlane(cx, cy, 0.3, this.camera);
  }

  // ------------------------------------------------------------------ cinematic camera
  /**
   * The title sequence's shots, built from where everything was staged. A shot
   * moves between two keys { look:[x,y,z], yaw, pitch (deg), w (world width in
   * frame), roll } over `dur` seconds; framing adapts to the screen aspect.
   */
  shots() {
    const I = this.focus ?? new THREE.Vector3(0, 1, 0);
    const C = this.cast ?? {};
    const v = (o) => [o.x, o.y, o.z];
    const cmd = this.cmds?.[0]?.root.position ?? new THREE.Vector3(-LAB_X, 3, 0);
    const lp = C.leap?.root.position ?? I;
    const lh = C.leap?.height ?? 1;
    const rb = this.bases[1]?.root.position ?? new THREE.Vector3(LAB_X, 0, 0);
    const rbh = Math.min(5, this.bases[1]?.height ?? 3);
    const name = (id) => SWARMS[id]?.name?.toUpperCase?.() ?? '';
    const ch = (id) => (CHARACTERS[id]?.name ?? '').toUpperCase();
    return [
      // 0: the reveal — tight and low on the clash, pulling up and back to the whole fight
      { id: 'reveal', dur: 9, from: { look: [I.x + 0.1, I.y + 0.05, I.z], yaw: -20, pitch: 2, w: 7, roll: 2 }, to: { look: [I.x - 0.8, 1.6, 0], yaw: -6, pitch: 9, w: 15, roll: 0 } },
      // 1: push in on your Commander crackling with MEGA charge
      { id: 'cmd', dur: 7, from: { look: [cmd.x + 0.2, cmd.y + 0.9, cmd.z], yaw: 30, pitch: 3, w: 4.6, roll: -1 }, to: { look: [cmd.x, cmd.y + 1.0, cmd.z], yaw: 16, pitch: 7, w: 3.1, roll: 0.5 },
        cap: { k: 'COMMANDER', n: (state.p?.name || ch(C.cmdChar) || 'YOU').toUpperCase(), ac: '#4fb0ff' } },
      // 2: truck along your line, Battle Cats style
      { id: 'line', dur: 8, from: { look: [-8.2, 1.1, 0.3], yaw: -9, pitch: 5, w: 7.5 }, to: { look: [-2.2, 1.1, 0.3], yaw: -14, pitch: 7, w: 7 },
        cap: { k: 'YOUR SWARM', n: name(C.shoverId), ac: '#4fb0ff' } },
      // 3: hero low angle on the leaper hanging in the air
      { id: 'leap', dur: 7, from: { look: [lp.x, lp.y + lh * 0.4, lp.z], yaw: -32, pitch: -6, w: 4.6 + lh * 0.9, roll: -3 }, to: { look: [lp.x + 0.4, lp.y + lh * 0.45, lp.z], yaw: -14, pitch: 2, w: 5.8 + lh * 0.9, roll: 0 },
        cap: { k: C.mega ? 'MEGA ULTIMATE' : 'POUNCE', n: name(C.leapId), ac: C.mega ? '#ff4fa3' : '#ffd23f' } },
      // 4: the battered rival base, smoke and fire frozen mid-billow
      { id: 'rival', dur: 7, from: { look: [rb.x - 1.6, rbh * 0.55, 0.2], yaw: 18, pitch: 5, w: 9.5 }, to: { look: [rb.x - 1.2, rbh * 0.6, 0.2], yaw: 31, pitch: 9, w: 7.2, roll: -0.8 },
        cap: { k: 'THE RIVAL', n: C.rivalChar === 'recruit' ? 'RIVAL RECRUIT' : ch(C.rivalChar), ac: '#ff3d55' } },
      // 5: wide crane over the whole lane
      { id: 'wide', dur: 8, from: { look: [-1, 1.2, 0], yaw: -5, pitch: 6, w: 21 }, to: { look: [0.6, 1.7, 0], yaw: 5, pitch: 12, w: 18 },
        cap: { k: this.A.legendary ? 'LEGENDARY ARENA' : `ARENA ${this.k + 1}`, n: (this.A.name ?? '').toUpperCase(), ac: this.A.color ?? '#ffd23f' } },
    ].map((sh) => ({ ...sh, focus: v(I) }));
  }
  /** Put the camera on a shot (title). null returns to the side-view rig. */
  setShot(shot) {
    this.cineShot = shot ? { ...shot, t: 0 } : null;
  }
  /** Camera pose for a shot key, framed for the current aspect. */
  shotPose(k, outPos, outLook) {
    const cam = this.camera, a = cam.aspect;
    const vf = (cam.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * a);
    // portrait screens crop the sides instead of shrinking everything to a sliver
    const w = k.w * (a < 1 ? 0.58 + a * 0.3 : 1);
    const dist = Math.max(w / 2 / Math.tan(hf / 2), (w * 0.42) / 2 / Math.tan(vf / 2));
    const yaw = (k.yaw * Math.PI) / 180, pitch = (k.pitch * Math.PI) / 180;
    // portrait: the logo owns the top of the screen, so the subject sits a little lower
    outLook.set(k.look[0], k.look[1] + (a < 1 ? w * 0.14 : w * 0.03), k.look[2]);
    outPos.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist).add(outLook);
    outPos.y = Math.max(0.35, outPos.y);
  }
  updateShot(dt) {
    const S = this.cineShot, cam = this.camera, t = this.t;
    S.t += dt;
    const u = clamp(S.t / S.dur, 0, 1);
    // steady dolly: mostly linear with a soft start / end (no "game camera" snap)
    const e = u * 0.55 + smooth(u) * 0.45;
    const A = S.from, B = S.to;
    const k = {
      look: [lerp(A.look[0], B.look[0], e), lerp(A.look[1], B.look[1], e), lerp(A.look[2], B.look[2], e)],
      yaw: lerp(A.yaw, B.yaw, e), pitch: lerp(A.pitch, B.pitch, e), w: lerp(A.w, B.w, e),
    };
    this.shotPose(k, _a, _b);
    // a little handheld breathing on top
    cam.position.set(_a.x + Math.sin(t * 0.71) * 0.03, _a.y + Math.sin(t * 0.93) * 0.025, _a.z);
    cam.lookAt(_b.x + Math.sin(t * 0.37) * 0.02, _b.y, _b.z);
    cam.rotateZ((((A.roll ?? 0) + ((B.roll ?? 0) - (A.roll ?? 0)) * e) * Math.PI) / 180 + Math.sin(t * 0.29) * 0.004);
    this.camX = _b.x;
    if (this.sun) {
      const d = this.lightDir;
      this.sun.position.set(_b.x + d[0], d[1], d[2]);
      this.sun.target.position.set(_b.x, 0, 0);
      const ext = Math.max(8, k.w / 2 + 6);
      const sc = this.sun.shadow.camera;
      if (Math.abs(sc.right - ext) > 0.5) {
        sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
        sc.updateProjectionMatrix();
      }
      this.sun.target.updateMatrixWorld();
    }
  }

  updateCamera(dt) {
    if (this.cineShot) { this.updateShot(dt); return; }
    const c = this.cam, cam = this.camera, t = this.t;
    c.idle += dt;
    c.zoom = damp(c.zoom, c.tz, 7, dt);
    const lim = this.limits();
    if (!c.drag) {
      c.x += c.vx * dt;
      c.vx *= Math.exp(-dt * 3.2);
      // spring back inside the lane ends
      if (c.x < -lim) { c.x = damp(c.x, -lim, 9, dt); c.vx *= 0.8; }
      else if (c.x > lim) { c.x = damp(c.x, lim, 9, dt); c.vx *= 0.8; }
    }
    // intro: a slow dolly-in from wide + high as the frame "freezes"
    if (c.intro < 1) c.intro = Math.min(1, c.intro + dt / 2.6);
    const ie = 1 - Math.pow(1 - c.intro, 3);
    // idle: a slow drift along the lane + a handheld sway
    const idleK = smooth((c.idle - 2.5) / 3);
    const drift = (Math.sin(t * 0.11) * 0.9 + Math.sin(t * 0.053 + 1.7) * 0.6) * idleK;
    const a = cam.aspect;
    const width = this.viewWidth() * (1 + (1 - ie) * 0.38);
    const x = clamp(c.x + drift, -lim - 0.6, lim + 0.6) + (1 - ie) * 2.2;
    const portrait = a < 1;
    const R = battleCamera(x, width, a, cam.fov, portrait ? 0.52 : 0.66, portrait ? 0.29 : 0.36);
    const yaw = -0.075 - (x / LAB_X) * 0.045;
    cam.position.set(R.pos[0] + R.dist * Math.sin(yaw) + Math.sin(t * 0.71) * 0.05 + Math.sin(t * 1.9) * 0.015,
      R.pos[1] + (1 - ie) * 2.5 + Math.sin(t * 0.93) * 0.04 + Math.sin(t * 2.3) * 0.012,
      R.pos[2]);
    cam.lookAt(R.look[0] + Math.sin(t * 0.37) * 0.04, R.look[1], R.look[2]);
    cam.rotateZ(-0.012 + Math.sin(t * 0.29) * 0.006 + (1 - ie) * 0.03);
    this.camX = x;
    // the sun follows the camera so shadows stay crisp
    if (this.sun) {
      const d = this.lightDir;
      this.sun.position.set(x + d[0], d[1], d[2]);
      this.sun.target.position.set(x, 0, 0);
      const ext = width / 2 + 4;
      const sc = this.sun.shadow.camera;
      if (Math.abs(sc.right - ext) > 0.5) {
        sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
        sc.updateProjectionMatrix();
      }
      this.sun.target.updateMatrixWorld();
    }
  }

  /** 0..1 how far the view sits toward each end (for the UI pan indicator). */
  panFrac() {
    const lim = this.limits();
    return lim > 0 ? clamp((this.cam.x + lim) / (2 * lim), 0, 1) : 0.5;
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    if (this.scene.background?.isTexture) coverFit(this.scene.background, this.camera.aspect);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.t += dt;
    const t = this.t;
    // the world is held in slow motion (shafts, motes and scenery barely creep)
    try { this.arena?.update?.(dt * 0.06, t * 0.06); } catch (e) { this.arena.update = null; }
    for (const lab of this.bases) lab.update?.(dt * 0.06);
    for (const u of this.updaters) u(dt, t);
    this.bits.update(dt, t);
    this.updateMotes(dt, t);
    // the grade breathes slowly (a held breath in the stopped moment)
    const g = this.liveGrade, G = this.grade;
    if (g) {
      g.exposure = G.exposure + Math.sin(t * 0.6) * 0.012 + Math.sin(t * 0.23) * 0.01;
      g.sat = G.sat + Math.sin(t * 0.31) * 0.03;
    }
    this.updateCamera(dt);
  }

  dispose() {
    for (const d of this.disposers ?? []) { try { d(); } catch (e) { /* ignore */ } }
    try { this.aura?.dispose(); } catch (e) { /* ignore */ }
    this.bits?.dispose(this.scene);
    for (const lab of this.bases) { try { lab.dispose?.(); } catch (e) { /* ignore */ } }
    for (const ch of this.chibis) { try { ch.face?.texture?.dispose(); } catch (e) { /* ignore */ } }
    for (const x of this.disposables) { try { x.dispose(); } catch (e) { /* ignore */ } }
    // free GPU memory held by the arena (cached geometry simply re-uploads if reused)
    const seen = new Set();
    for (const v of Object.values(Mats)) for (const m of Array.isArray(v) ? v : [v]) seen.add(m);
    this.arena?.root?.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m) || m.userData?.shared) continue;
        seen.add(m);
        for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
        m.dispose();
      }
    });
    this.scene.clear();
  }
}

export async function buildFrozenBattle(k, o = {}) {
  const fb = new FrozenBattle(k, o);
  await fb.load();
  return fb;
}
