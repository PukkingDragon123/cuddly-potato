// NEW CARD cutscene: plays inside the vial-opening stage (src/scenes/vialOpen.js)
// the first time a card is unlocked.
//
//   1. ENTRANCE - the Swarm (or the spell's object / a holo card for SPECIAL
//      cards) arrives in the style the player has equipped (data/entrances.js):
//      Classic Strut, Superhero Landing, Lab Explosion, Red Carpet, Rocket Drop,
//      Glitch Teleport. Letterbox bars, low tracking camera.
//   2. THE BOTTLE - a lab vial drops in, rumbles in the card's rarity colour and
//      the Swarm smacks the cap off: POP, flash, hit-stop and slow-mo.
//   3. THE POSE - the attack wind-up freezes into a pose while the camera
//      dollies round at a low angle, god rays spin, the name SLAMS in letter by
//      letter, then rarity, series and a stats panel with filling bars.
//   Tap (or SKIP) to jump to the pose; tap again to continue.
//
// const cut = new NewCardCutscene(host, stack, { entrance, preview }); await cut.play();
// The host (VialOpenScene) forwards update(dt, gdt) and taps while `host.cut` is set,
// and gives up its camera to the cutscene. cut.release() hands the hero toy back.
import * as THREE from 'three';
import './newCardCutscene.css';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { animate } from '../core/tween.js';
import { rand, pick } from '../core/util.js';
import { makeVial } from '../models/props/vials.js';
import { makeBeaker, makeSodaRocket } from '../models/props/abilities.js';
import { h, icon, button } from '../ui/ui.js';
import { entranceDef } from '../data/entrances.js';
import { pixelRing, pixelShock, pixelBeam, voxCarpet, voxPost, voxRope, voxCracks } from './vialProps.js';
import { RARITIES, cardDef, isSpell, ALL_CARDS } from '../data/cards.js';
import { SWARMS, SERIES, ROLE_INFO, swarmStats, speedName } from '../data/swarms.js';
import { spellPower } from '../data/spells.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const BENCH_EDGE = 4.9; // the lab bench's front edge (z): cameras stay over the bench
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

// ---------------------------------------------------------------------------
// Stats for the panel

let REF = null;
function statRefs() {
  if (REF) return REF;
  REF = { hp: 1, dmg: 1, dps: 1, range: 1, speed: 0.1 };
  for (const c of ALL_CARDS) {
    if (!SWARMS[c.id] || isSpell(c.id)) continue;
    try {
      const s = swarmStats(c.id, 1);
      REF.hp = Math.max(REF.hp, s.hp);
      REF.dmg = Math.max(REF.dmg, s.dmg);
      REF.dps = Math.max(REF.dps, s.dmg / Math.max(0.1, c.atk ?? 1));
    } catch (e) { /* odd entry */ }
    REF.range = Math.max(REF.range, c.range ?? 0);
    REF.speed = Math.max(REF.speed, c.speed ?? 0);
  }
  return REF;
}
/** [{icon, label, value, frac?}] for the stats panel. */
export function cutStats(id) {
  const d = cardDef(id);
  const rows = [];
  if (!d) return rows;
  if (d.special) {
    if (d.keywords?.length) rows.push({ icon: 'magic', label: 'Keywords', value: d.keywords.join(' · ') });
    if (d.draw) rows.push({ icon: 'cards', label: 'Draw', value: `+${d.draw} cards` });
    if (d.gain) rows.push({ icon: 'power', label: 'POWER', value: `+${d.gain}` });
    rows.push({ icon: 'clock', label: 'Uses', value: d.exhaust ? 'Once per battle' : 'Cycles' });
    return rows.slice(0, 4);
  }
  if (isSpell(id)) {
    const pw = spellPower(1);
    if (d.dmg) rows.push({ icon: 'sword', label: 'Damage', value: Math.round(d.dmg * pw), frac: Math.min(1, d.dmg / 900) });
    if (d.dps) rows.push({ icon: 'fire', label: 'Damage / sec', value: Math.round(d.dps * pw), frac: Math.min(1, d.dps / 200) });
    if (d.freeze) rows.push({ icon: 'snow', label: 'Freeze', value: d.freeze + 's' });
    if (d.slow) rows.push({ icon: 'snow', label: 'Slow', value: Math.round(d.slow * 100) + '%' });
    if (d.shield) rows.push({ icon: 'shield', label: 'Shield', value: Math.round(d.shield * 100) + '% HP' });
    if (d.dur) rows.push({ icon: 'clock', label: 'Duration', value: d.dur + 's' });
    rows.push({ icon: 'range', label: 'Radius', value: d.radius ? d.radius.toFixed(1) : 'Your Lab', frac: d.radius ? Math.min(1, d.radius / 5) : null });
    return rows.slice(0, 4);
  }
  const s = swarmStats(id, 1);
  const R = statRefs();
  const dps = Math.round(s.dmg / Math.max(0.1, d.atk ?? 1));
  rows.push({ icon: 'hp', label: 'Hitpoints', value: s.hp, frac: s.hp / R.hp });
  rows.push({ icon: 'sword', label: d.traits?.area ? 'Area Damage' : 'Damage', value: s.dmg, frac: s.dmg / R.dmg });
  rows.push({ icon: 'fire', label: 'Damage / sec', value: dps, frac: dps / R.dps });
  rows.push({ icon: 'speed', label: 'Speed', value: speedName(d.speed ?? 1), frac: (d.speed ?? 1) / R.speed });
  rows.push({ icon: 'range', label: 'Range', value: (d.range ?? 0) < 1.6 ? 'Melee' : d.range.toFixed(1), frac: Math.max(0.08, (d.range ?? 0) / R.range) });
  const role = ROLE_INFO[d.role];
  if (role) rows.push({ icon: role.icon, label: 'Type', value: role.name + ((d.count ?? 1) > 1 ? ` x${d.count}` : '') });
  return rows;
}

// ---------------------------------------------------------------------------

export class NewCardCutscene {
  constructor(host, st, opts = {}) {
    this.host = host;
    this.st = st;
    this.d = st.def ?? cardDef(st.id);
    this.entrance = entranceDef(opts.entrance).id;
    this.preview = !!opts.preview;
    this.rar = RARITIES[st.rarity] ?? RARITIES.common;
    this.rc = this.rar.hex;
    this.root = new THREE.Group();
    this.root.name = 'newCardCutscene';
    host.scene.add(this.root);
    this.C = new THREE.Vector3(0, 0, 1.05);
    this.speed = 1; // hero animation speed (slow-mo)
    this.t = 0;
    this.jobs = new Set();
    this.extra = []; // per-frame updaters
    this.fast = false;
    this.stage = 'intro';
    // camera
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ax: 0.5, ay: 0.5, fov: 34 };
    this.camT = { ax: 0.5, ay: 0.5, fov: 34 };
    this.path = null;
    this.blend = null;
    this.wobble = 1;
    // lights: a key from the front, a rarity rim from behind
    this.key = new THREE.SpotLight(0xfff4e6, 0, 9, 0.5, 0.6, 1);
    this.key.position.set(0.8, 3.6, 3.6);
    this.key.target.position.copy(this.C);
    this.rim = new THREE.PointLight(this.rc, 0, 4, 1.2);
    this.rim.position.set(-0.2, 1.4, this.C.z - 0.9);
    this.glow = new THREE.PointLight(this.rc, 0, 2.6, 1.4);
    this.root.add(this.key, this.key.target, this.rim, this.glow);
  }

  // ===================================================================== hero
  makeHero() {
    const st = this.st;
    const toy = this.host.makeToy(st);
    const fit = toy.fit;
    const root = toy.root;
    root.scale.setScalar(fit);
    const hero = {
      toy, root, fit, rig: toy.rig ?? null,
      H: toy.height * fit, W: Math.max(0.3, toy.width * fit),
      walk: (on) => toy.rig?.setState(on ? 'walk' : 'idle'),
    };
    this.hero = hero;
    this.root.add(root);
    return hero;
  }

  // ===================================================================== timing
  /** Wait (skipped instantly once the player taps to hurry). */
  wait(sec) {
    if (this.fast || this.dead) return Promise.resolve();
    const j = animate(sec, null);
    this.jobs.add(j);
    return j.promise.then(() => this.jobs.delete(j));
  }
  /** Tween fn(e, k) over sec; finishes instantly when hurried. */
  tween(sec, fn, ease = 'linear') {
    if (this.fast || this.dead) { fn(1, 1); return Promise.resolve(); }
    const j = animate(sec, fn, { ease });
    this.jobs.add(j);
    return j.promise.then(() => this.jobs.delete(j));
  }
  /** Tap: first one hurries to the pose, the next continues. */
  tap() {
    if (this.dead) return;
    if (this.tapResolve && performance.now() > this.tapReadyAt) {
      const r = this.tapResolve;
      this.tapResolve = null;
      r();
      return;
    }
    if (!this.fast && this.stage !== 'hold') this.hurry();
  }
  hurry() {
    if (this.fast) return;
    this.fast = true;
    for (const j of this.jobs) j.finish();
    this.jobs.clear();
  }

  // ===================================================================== camera
  /** Camera follows fn(t) -> [pos, look]; blends from the current shot over `blend` seconds (0 = hard cut). */
  setCam(fn, blend = 0) {
    this.path = { fn, t0: this.t };
    this.blend = blend > 0 ? { from: this.cam.pos.clone(), look: this.cam.look.clone(), t0: this.t, dur: blend } : null;
    if (!blend) this.applyCam(0, true);
  }
  camScale() {
    const asp = engine.width / engine.height;
    const hs = this.hero ? Math.max(1, Math.max(this.hero.H / 1.15, this.hero.W / 1.0)) : 1;
    return Math.max(1.5, Math.min(2.4, 0.95 / asp)) * hs;
  }
  frame(ax, ay) {
    const portrait = engine.height > engine.width;
    this.camT.ax = ax ?? 0.5;
    this.camT.ay = ay ?? (portrait ? 0.46 : 0.5);
  }
  applyCam(dt, instant = false) {
    const cam = this.host.camera;
    const c = this.cam;
    if (this.path) {
      const [p, l] = this.path.fn(this.t - this.path.t0);
      if (this.blend) {
        const k = smooth(clamp01((this.t - this.blend.t0) / this.blend.dur));
        c.pos.lerpVectors(this.blend.from, p, k);
        c.look.lerpVectors(this.blend.look, l, k);
        if (k >= 1) this.blend = null;
      } else {
        c.pos.copy(p);
        c.look.copy(l);
      }
    }
    const kk = instant ? 1 : 1 - Math.exp(-dt * 3.5);
    c.ax += (this.camT.ax - c.ax) * kk;
    c.ay += (this.camT.ay - c.ay) * kk;
    c.fov += (this.camT.fov - c.fov) * kk;
    // shots are authored for a wide screen: pull back on narrow (portrait) screens and for big heroes
    // (horizontal distance only: the low angles must stay above the bench top; past the bench's
    // front edge the rest of the pull-back becomes a wider lens)
    let sc = this.camScale();
    let fovK = 1;
    const dz = c.pos.z - c.look.z;
    if (dz > 0.01 && c.look.z + dz * sc > BENCH_EDGE) {
      const ok = Math.max(1, (BENCH_EDGE - c.look.z) / dz);
      fovK = sc / ok;
      sc = ok;
    }
    _c.set(c.look.x + (c.pos.x - c.look.x) * sc, Math.max(0.06, c.pos.y + (sc - 1) * 0.12), c.look.z + dz * sc);
    // handheld drift
    const w = 0.012 * this.wobble * sc;
    cam.position.set(_c.x + Math.sin(this.t * 1.3) * w, _c.y + Math.sin(this.t * 1.7 + 1) * w * 0.6, _c.z);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * fovK));
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.lookAt(c.look);
    const W = engine.width, H = engine.height;
    cam.setViewOffset(W, H, (0.5 - c.ax) * W, (0.5 - c.ay) * H, W, H);
  }

  // ===================================================================== DOM
  buildUI() {
    const portrait = engine.height > engine.width;
    const e = entranceDef(this.entrance);
    this.el = h('div', { class: `vo-cut r-${this.st.rarity} ${portrait ? 'port' : 'land'}`, style: { '--rc': this.rar.color } },
      h('div', { class: 'vo-cut-bar top' }), h('div', { class: 'vo-cut-bar bot' }),
      h('div', { class: 'vo-cut-ent' }, icon('play', 'vo-cut-ent-ic'), h('span', {}, e.name.toUpperCase())));
    this.skipBtn = button(this.preview ? 'BACK' : 'SKIP', (ev) => { ev?.stopPropagation?.(); this.hurry(); if (this.stage === 'hold') this.tap(); }, 'gray sm vo-cut-skip', { icon: 'arrowR', sound: 'tap' });
    this.skipBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.el.appendChild(this.skipBtn);
    this.host.ui.appendChild(this.el);
    requestAnimationFrame(() => this.el?.classList.add('in'));
  }
  /** Name slam + rarity + stats (staggered). */
  async showPanel() {
    const st = this.st, d = this.d, r = this.rar;
    const name = (d.name ?? st.id).toUpperCase();
    const series = st.spell ? (d.special ? 'SPECIAL CARD' : 'SPELL CARD') : (SERIES[d.series]?.name ?? '').toUpperCase();
    // letters slam in one by one; words never break mid-word and long names shrink to fit
    let li = 0;
    const words = name.split(' ').map((w) => h('span', { class: 'vo-cut-word' }, ...[...w].map((ch) => h('span', { class: 'vo-cut-l1', style: { animationDelay: (li++ * 0.035).toFixed(3) + 's' } }, ch))));
    const longest = Math.max(...name.split(' ').map((w) => w.length));
    const nameEl = h('div', { class: 'vo-cut-name', style: { '--nk': Math.min(1, 9 / Math.max(longest, name.length * 0.62)).toFixed(3) } }, ...words);
    const kicker = h('div', { class: 'vo-cut-kicker' }, h('span', {}, 'NEW CARD UNLOCKED!'));
    const tags = h('div', { class: 'vo-cut-tags' },
      h('span', { class: `vo-cut-rar r-${st.rarity}` }, r.name.toUpperCase()),
      series ? h('span', { class: 'vo-cut-series' }, series) : null,
      h('span', { class: 'vo-cut-cost' }, icon('energy', 'vo-cut-cost-ic'), h('b', {}, String(d.elixir ?? 0))));
    const rows = cutStats(st.id);
    const statEls = rows.map((row, i) => {
      const fill = h('i', { class: 'vo-cut-fill' });
      const val = h('b', { class: 'vo-cut-v' }, typeof row.value === 'number' ? '0' : String(row.value));
      const el = h('div', { class: 'vo-cut-st', style: { animationDelay: (0.08 + i * 0.09).toFixed(2) + 's' } },
        icon(row.icon, 'vo-cut-st-ic'),
        h('div', { class: 'vo-cut-st-t' }, h('span', { class: 'vo-cut-l' }, row.label), val,
          row.frac != null ? h('div', { class: 'vo-cut-bar2' }, fill) : null));
      el.row = row;
      el.val = val;
      el.fill = fill;
      return el;
    });
    const stats = h('div', { class: 'vo-cut-stats' }, ...statEls);
    const desc = d.desc ? h('div', { class: 'vo-cut-desc' }, d.desc) : null;
    const panel = h('div', { class: 'vo-cut-panel' }, kicker, nameEl, tags, stats, desc);
    this.el.appendChild(panel);
    this.panel = panel;
    audio.play('whoosh', { pitch: 1.3 });
    await this.wait(0.12);
    panel.classList.add('in');
    // the letters slam in; one big hit when the last lands
    await this.wait(Math.min(0.9, 0.18 + name.length * 0.035));
    if (this.dead) return;
    audio.play('stamp');
    audio.play('hitHeavy', { pitch: 0.8 });
    engine.shake(0.35);
    nameEl.classList.add('hit');
    this.host.flash(0.25, 0.25);
    await this.wait(0.15);
    if (this.dead) return;
    tags.classList.add('in');
    audio.play(st.order >= 2 ? 'shimmer' : 'reveal', { pitch: 1.1 });
    await this.wait(0.15);
    if (this.dead) return;
    stats.classList.add('in');
    statEls.forEach((el, i) => {
      setTimeout(() => {
        if (this.dead || !el.isConnected) return;
        audio.play('countTick', { pitch: 0.9 + i * 0.08, gap: 0.02 });
        if (el.row.frac != null) el.fill.style.width = Math.round(Math.max(0.06, Math.min(1, el.row.frac)) * 100) + '%';
        if (typeof el.row.value === 'number') {
          const v = el.row.value;
          animate(0.45, (e) => (el.val.textContent = Math.round(v * e).toLocaleString('en-US')), { ease: 'outCubic' });
        }
      }, this.fast ? 0 : 90 + i * 90);
    });
    if (desc) setTimeout(() => desc.isConnected && desc.classList.add('in'), this.fast ? 0 : 420);
  }

  // ===================================================================== main
  async play() {
    const host = this.host;
    this.prev = { lights: host.lightTarget, rayPos: host.rays.position.clone(), fov: host.camera.fov };
    host.cut = this;
    host.setLights(0.32);
    host.ui.classList.add('vo-cutting');
    const hero = this.makeHero();
    this.buildUI();
    audio.play('lightsOut');
    this.key.intensity = 0;
    animate(0.6, (e) => { this.key.intensity = 13 * e; this.rim.intensity = 5 * e; });
    this.frame(0.5);
    try {
      await this.intro(hero);
      if (!this.dead) await this.bottle(hero);
      if (!this.dead) await this.pose(hero);
    } catch (e) {
      console.error('new card cutscene failed', e);
    }
    if (this.dead) return;
    if (this.fast) this.finalState();
    this.stage = 'hold';
    this.fast = false;
    const tapEl = h('div', { class: 'vo-cut-tap' }, this.preview ? 'TAP TO GO BACK' : 'TAP TO CONTINUE');
    this.el.appendChild(tapEl);
    await new Promise((res) => {
      this.tapResolve = res;
      this.tapReadyAt = performance.now() + 350;
    });
    await this.outro();
  }

  /** Everything in its final place (used when the player hurries). */
  finalState() {
    const hero = this.hero;
    const C = this.C;
    for (const o of this.temp ?? []) o.parent?.remove(o);
    this.temp = [];
    this.extra.length = 0;
    hero.root.visible = true;
    hero.root.position.copy(C);
    hero.root.rotation.set(0, 0.3, 0);
    hero.root.scale.setScalar(hero.fit);
    hero.walk(false);
    this.bottleVial?.root.parent?.remove(this.bottleVial.root);
    this.speed = 1;
    engine.timeScale = 1;
    if (hero.rig && !hero.rig.frozen) {
      hero.rig.attack(1);
      hero.rig.atkT = 0.45;
      hero.rig.update(0.001);
      hero.rig.frozen = true;
    }
    this.poseCam(hero, 0);
    if (!this.panel) this.showPanel();
    else this.panel.classList.add('in');
    this.panel?.querySelectorAll('.vo-cut-tags, .vo-cut-stats, .vo-cut-desc').forEach((e) => e.classList.add('in'));
    this.host.rayTarget = [0.45, 0.6, 0.75, 0.9, 0.9][this.st.order] ?? 0.6;
  }

  // ===================================================================== 1. entrances
  async intro(hero) {
    const fn = {
      strut: this.inStrut, heroLanding: this.inLanding, labExplosion: this.inExplosion,
      redCarpet: this.inCarpet, rocketDrop: this.inRocket, glitchTeleport: this.inGlitch,
    }[this.entrance] ?? this.inStrut;
    await fn.call(this, hero);
    hero.root.visible = true;
  }

  async inStrut(hero) {
    const C = this.C, H = hero.H;
    const from = _a.set(C.x + 3.4, 0, C.z + 0.15).clone();
    hero.root.position.copy(from);
    hero.root.rotation.y = -Math.PI / 2;
    hero.walk(true);
    if (hero.rig) hero.rig.walkRate = 0.8;
    this.setCam((t) => [_a.set(C.x - 1.1 + t * 0.18, 0.14, C.z + 2.3 - t * 0.12), _b.copy(hero.root.position).setY(H * 0.55)]);
    let step = 0;
    this.extra.push((dt) => {
      if (this.stage !== 'intro' || !hero.rig || hero.rig.state !== 'walk') return;
      step += dt;
      if (step > 0.28) {
        step = 0;
        audio.play('thud', { pitch: 2.6, vol: 0.35 });
        fx.dust(hero.root.position, { count: 2, scale: 0.8, color: 0x6b7590 });
      }
    });
    audio.play('drum');
    await this.tween(2.0, (e) => hero.root.position.lerpVectors(from, C, e), 'outQuad');
    hero.walk(false);
    audio.play('whoosh', { pitch: 1.4 });
    await this.tween(0.32, (e) => (hero.root.rotation.y = -Math.PI / 2 + e * (Math.PI / 2 + 0.3)), 'outBack');
    hero.toy.boing(0.5);
    audio.play('thud', { pitch: 1.4 });
    fx.dust(C, { count: 8, scale: 1.2, color: 0x8e9ab8 });
    await this.wait(0.25);
  }

  async inLanding(hero) {
    const C = this.C, H = hero.H;
    hero.root.position.set(C.x, 5, C.z);
    hero.root.rotation.y = 0.3;
    // a pixel target ring locks on where it will land
    const sh = pixelRing(Math.max(0.35, hero.W * 0.65), 0xff3a5a, { rVox: 16, dash: 2, gap: 2, thick: 2, opacity: 0 });
    sh.position.set(C.x, 0.012, C.z);
    this.addTemp(sh);
    this.extra.push((dt) => { sh.rotation.y += dt * 2.5; });
    this.setCam((t) => [_a.set(C.x + 0.55, 0.09, C.z + 2.0 + t * 0.05), _b.set(C.x, Math.max(H * 0.5, Math.min(2.4, hero.root.position.y + H * 0.5)), C.z)]);
    this.camT.fov = 40;
    audio.play('whoosh', { pitch: 0.5 });
    await this.tween(0.45, (e) => (sh.material.opacity = 0.9 * e));
    audio.play('whoosh', { pitch: 0.8 });
    await this.tween(0.42, (e) => {
      hero.root.position.y = 5 * (1 - e);
      sh.scale.setScalar((Math.max(0.35, hero.W * 0.65) / 16) * (1.6 - e * 0.6));
    }, 'inQuad');
    hero.root.position.y = 0;
    // IMPACT
    hero.toy.boing(1.4);
    engine.hitstop(0.12);
    engine.shake(0.75);
    this.host.flash(0.55, 0.35);
    audio.play('boom', { pitch: 0.8 });
    audio.play('thud', { pitch: 0.7 });
    pixelShock(this.root, _a.set(C.x, 0.02, C.z), { radius: 3.2, color: 0xffffff });
    pixelShock(this.root, _a.set(C.x, 0.02, C.z), { radius: 1.8, color: this.rc, dur: 0.6 });
    fx.burst(_a.set(C.x, 0.05, C.z), { count: 26, colors: [0x2a3152, 0x1a1f3c, 0x8e9ab8], size: 0.07, speed: 4, up: 1.4, life: 1.1 });
    fx.smoke(_a.set(C.x, 0, C.z), { count: 14, scale: 0.36, radius: 1.3, color: 0x6b7590 });
    sh.visible = false;
    this.crater(C);
    await this.wait(0.55);
    this.camT.fov = 34;
  }

  crater(C) {
    // jagged voxel cracks punched into the bench
    const g = voxCracks(1 + Math.floor(Math.random() * 3));
    g.position.set(C.x, 0.002, C.z);
    g.rotation.y = rand(0, Math.PI * 2);
    this.addTemp(g);
  }

  async inExplosion(hero) {
    const C = this.C, H = hero.H;
    hero.root.visible = false;
    const bk = makeBeaker(0x7cff3a);
    bk.scale.setScalar(3.2);
    bk.position.copy(C);
    this.addTemp(bk);
    const green = new THREE.PointLight(0x7cff3a, 0.6, 3, 1.4);
    green.position.set(C.x, 0.5, C.z + 0.3);
    this.addTemp(green);
    this.setCam((t) => [_a.set(C.x + 0.7 - t * 0.12, 0.42, C.z + 2.5 - t * 0.2), _b.set(C.x, 0.45, C.z)]);
    audio.play('fizz');
    let bub = 0;
    await this.tween(1.0, (e) => {
      bk.position.set(C.x + Math.sin(this.t * 60) * 0.02 * e, 0, C.z + Math.sin(this.t * 47) * 0.015 * e);
      bk.scale.set(3.2 + Math.sin(this.t * 30) * 0.12 * e, 3.2 + e * 0.5, 3.2 + Math.sin(this.t * 30) * 0.12 * e);
      green.intensity = 0.6 + e * 2.4;
      if ((bub += 1) % 4 === 0) {
        fx.bubbles(_a.set(C.x, 0.75, C.z), { count: 2, color: 0x9dff6a, radius: 0.15, speed: 1.4 });
        audio.play('bubble', { pitch: 0.8 + e, gap: 0.05 });
      }
    });
    // KABOOM
    bk.parent?.remove(bk);
    engine.hitstop(0.1);
    engine.shake(0.8);
    this.host.flash(0.7, 0.4);
    audio.play('explode');
    audio.play('boom', { pitch: 0.9 });
    const at = _a.set(C.x, 0.4, C.z);
    fx.burst(at, { count: 30, colors: [0xeaffd0, 0x9dff6a, 0xffffff], size: 0.05, speed: 6, life: 0.9 });
    fx.slime(at, { count: 22, color: 0x7cff3a, speed: 5 });
    fx.smoke(_a.set(C.x, 0, C.z), { count: 26, scale: 0.38, radius: 1.8, color: 0x4fbf3a, rise: 1.3, life: 1.3 });
    fx.smoke(_a.set(C.x, 0, C.z), { count: 14, scale: 0.32, radius: 1.5, color: 0x2a6a2a, life: 1.5 });
    pixelShock(this.root, _a.set(C.x, 0.02, C.z), { radius: 3, color: 0x7cff3a });
    hero.root.visible = true;
    hero.root.rotation.y = 0.3;
    await this.tween(0.55, (e) => {
      hero.root.scale.setScalar(hero.fit * Math.max(0.05, e));
      green.intensity = 3 * (1 - e) + 0.6;
    }, 'outBack');
    hero.toy.boing(0.6);
    this.extra.push(() => { if (this.stage === 'intro' && Math.random() < 0.3) fx.smoke(_c.set(C.x + rand(-0.5, 0.5), 0, C.z + rand(-0.4, 0.4)), { count: 1, scale: 0.35, color: 0x3a8a34 }); });
    await this.wait(0.45);
    animate(0.5, (e) => (green.intensity = 0.6 * (1 - e)));
  }

  async inCarpet(hero) {
    const C = this.C, H = hero.H;
    // the voxel carpet rolls out towards the camera, between velvet ropes
    const carpet = voxCarpet(3.4);
    carpet.position.set(C.x, 0.003, C.z - 2.6);
    carpet.scale.z = 0.001;
    this.addTemp(carpet);
    for (const x of [-0.75, 0.75]) {
      for (const z of [-2.0, -0.5]) {
        const p = voxPost();
        p.position.set(C.x + x, 0, C.z + z);
        this.addTemp(p);
      }
      const rope = voxRope(1.5);
      rope.rotation.y = -Math.PI / 2;
      rope.position.set(C.x + x, 0, C.z - 2.0);
      this.addTemp(rope);
    }
    hero.root.position.set(C.x, 0, C.z - 2.3);
    hero.root.rotation.y = 0;
    this.setCam((t) => [_a.set(C.x + 0.45, 0.22, C.z + 2.0 - t * 0.1), _b.copy(hero.root.position).setY(H * 0.6)]);
    audio.play('whoosh', { pitch: 0.7 });
    await this.tween(0.5, (e) => (carpet.scale.z = Math.max(0.001, e)), 'outCubic');
    audio.play('cheer');
    // paparazzi flashes on both sides
    let next = 0;
    this.extra.push((dt) => {
      if (this.stage !== 'intro') return;
      next -= dt;
      if (next > 0) return;
      next = rand(0.07, 0.2);
      const side = Math.random() < 0.5 ? -1 : 1;
      const p = _c.set(C.x + side * rand(1.0, 1.8), rand(0.3, 1.3), C.z + rand(-2.2, 0.4));
      fx.sparkle(p, { count: 3, color: 0xffffff, size: 0.22, speed: 0.4, life: 0.18 });
      fx.sparkle(p, { count: 4, colors: [0xfff2c8, 0xffffff], size: 0.06, speed: 1.6, life: 0.3 });
      audio.play('tick', { pitch: rand(0.5, 0.8), gap: 0.03 });
      if (Math.random() < 0.25) this.host.flash(0.12, 0.12);
    });
    hero.walk(true);
    if (hero.rig) hero.rig.walkRate = 0.7;
    const from = hero.root.position.clone();
    await this.tween(2.1, (e) => hero.root.position.lerpVectors(from, C, e), 'outQuad');
    hero.walk(false);
    await this.tween(0.3, (e) => (hero.root.rotation.y = e * 0.3), 'outBack');
    hero.toy.boing(0.4);
    await this.wait(0.2);
  }

  async inRocket(hero) {
    const C = this.C, H = hero.H;
    hero.root.visible = false;
    const rk = makeSodaRocket();
    rk.scale.multiplyScalar(2.4);
    this.addTemp(rk);
    const from = new THREE.Vector3(C.x - 4.2, 4.6, C.z - 1.6), to = new THREE.Vector3(C.x, 0.1, C.z);
    const dir = _a.subVectors(to, from).normalize();
    rk.quaternion.setFromUnitVectors(UP, dir); // the nose cone (+Y) leads
    rk.position.copy(from);
    this.setCam((t) => [_a.set(C.x + 1.5, 0.55, C.z + 3.2), _b.copy(rk.parent ? rk.position : C).lerp(_c.set(C.x, H * 0.5, C.z), rk.parent ? 0.45 : 1)]);
    audio.play('engine');
    audio.play('whoosh', { pitch: 0.6 });
    await this.tween(0.8, (e) => {
      rk.position.lerpVectors(from, to, e);
      if (Math.random() < 0.8) fx.fire(rk.position, { count: 2, scale: 1.4 });
      if (Math.random() < 0.6) fx.smoke(rk.position, { count: 1, scale: 0.5, color: 0xdfe6f4 });
    }, 'inQuad');
    rk.parent?.remove(rk);
    engine.hitstop(0.1);
    engine.shake(0.85);
    this.host.flash(0.75, 0.4);
    audio.play('explode');
    audio.play('boom');
    const at = _a.set(C.x, 0.2, C.z);
    fx.burst(at, { count: 30, colors: [0xff5a1f, 0xffa31a, 0xffe14a, 0xffffff], layer: 'glow', size: 0.07, speed: 5, life: 0.7, grav: -4 });
    fx.slime(at, { count: 18, color: 0xc8142e, speed: 5 });
    fx.fire(at, { count: 20, radius: 2, scale: 1.6 });
    fx.smoke(_a.set(C.x, 0, C.z), { count: 18, scale: 0.38, radius: 1.5, color: 0x6b6f7a, life: 1.3 });
    pixelShock(this.root, _a.set(C.x, 0.02, C.z), { radius: 3.2, color: 0xffa31a });
    // the Swarm bails out at the last second and lands
    hero.root.visible = true;
    hero.root.rotation.y = 0;
    audio.play('boing', { pitch: 1.2 });
    await this.tween(0.75, (e, k) => {
      hero.root.position.set(C.x, Math.sin(k * Math.PI) * 1.3, C.z);
      hero.root.rotation.y = 0.3 + (1 - e) * Math.PI * 2;
    }, 'linear');
    hero.root.position.y = 0;
    hero.toy.boing(0.9);
    audio.play('thud');
    engine.shake(0.3);
    fx.dust(C, { count: 10, scale: 1.3, color: 0x8e9ab8 });
    await this.wait(0.3);
  }

  async inGlitch(hero) {
    const C = this.C, H = hero.H;
    // a teleport beam of scrolling pixel rings
    const beam = pixelBeam(0.5, 4.2, 0x3ff2e0);
    const beamMat = beam.userData.mat;
    beamMat.opacity = 0;
    beam.position.set(C.x, 0, C.z);
    this.addTemp(beam);
    this.extra.push((dt) => beam.userData.update(dt));
    hero.root.position.copy(C);
    hero.root.rotation.y = 0.3;
    hero.root.visible = false;
    this.setCam((t) => [_a.set(C.x - 0.3, 0.4, C.z + 2.6 - t * 0.15), _b.set(C.x, H * 0.55, C.z)]);
    audio.play('zap');
    audio.play('laser', { pitch: 0.6 });
    this.host.ui.classList.add('vo-glitch');
    await this.tween(0.3, (e) => (beamMat.opacity = 0.6 * e));
    let n = 0;
    await this.tween(1.0, (e) => {
      beamMat.opacity = 0.45 + Math.random() * 0.4;
      const on = Math.random() < 0.35 + e * 0.6;
      hero.root.visible = on;
      hero.root.position.set(C.x + (Math.random() < 0.3 ? rand(-0.4, 0.4) * (1 - e) : 0), 0, C.z);
      hero.root.scale.set(hero.fit * (1 + rand(-0.4, 0.4) * (1 - e)), hero.fit, hero.fit);
      if ((n++ % 5) === 0) {
        fx.burst(_c.set(C.x + rand(-0.4, 0.4), rand(0.1, H), C.z), { count: 4, colors: [0x3ff2e0, 0xff2e88, 0xffffff], size: 0.05, speed: 2, grav: 0, life: 0.25 });
        audio.play('blip', { pitch: rand(0.6, 1.6), gap: 0.02 });
        if (hero.rig && Math.random() < 0.3) hero.rig.flash(0.04);
        engine.shake(0.05);
      }
    });
    this.host.ui.classList.remove('vo-glitch');
    hero.root.visible = true;
    hero.root.position.copy(C);
    hero.root.scale.setScalar(hero.fit);
    hero.toy.boing(0.7);
    audio.play('zap', { pitch: 1.4 });
    audio.play('bigPop');
    this.host.flash(0.5, 0.3);
    pixelShock(this.root, _a.set(C.x, 0.02, C.z), { radius: 2.6, color: 0x3ff2e0 });
    fx.sparkle(_a.set(C.x, H * 0.5, C.z), { count: 30, colors: [0x3ff2e0, 0xffffff, 0xff2e88], speed: 3.5, radius: 0.8 });
    animate(0.4, (e) => (beamMat.opacity = 0.7 * (1 - e)), { onComplete: () => beam.parent?.remove(beam) });
    await this.wait(0.35);
  }

  // ===================================================================== 2. the bottle
  async bottle(hero) {
    if (this.fast) return;
    this.stage = 'bottle';
    const C = this.C, H = hero.H, rc = this.rc;
    const b = makeVial('testTube', { filled: true, glowColor: rc });
    this.bottleVial = b;
    const s = Math.min(0.42, Math.max(0.26, H * 0.32));
    b.root.scale.setScalar(s);
    const bx = C.x + Math.min(0.75, hero.W * 0.5 + 0.18), bz = C.z + 0.32;
    b.root.position.set(bx, 2.6, bz);
    b.setLiquidColor?.(rc);
    b.setGlowColor(rc);
    b.setGlow(0.4);
    this.root.add(b.root);
    const bh = 1.95 * s;
    // close, low 3/4 on the bottle with the hero behind it
    this.setCam((t) => [_a.set(bx + 0.55, 0.1 + bh * 0.4, bz + 1.35 - t * 0.08), _b.set((bx + C.x) / 2 + 0.1, Math.max(bh * 0.6, H * 0.45), (bz + C.z) / 2)], 0.35);
    audio.play('whoosh', { pitch: 1.6 });
    await this.tween(0.4, (e) => (b.root.position.y = 2.6 * (1 - e)), 'inQuad');
    b.root.position.y = 0;
    b.squash(1);
    audio.play('thud', { pitch: 2.2 });
    fx.dust(b.root.position, { count: 4, scale: 0.6, color: 0x8e9ab8 });
    // rumble, glow in the rarity colour
    audio.play('heartbeat');
    await this.tween(0.75, (e) => {
      b.setRumble(e);
      b.setGlow(0.4 + e * 0.45);
      if (Math.random() < 0.3) fx.sparkle(b.mouth(_c), { count: 1, colors: [0xffffff, rc], speed: 1.2, size: 0.05 });
    });
    if (this.fast) return;
    audio.play('heartbeat', { pitch: 1.2 });
    // the Swarm smacks the cap off
    hero.toy.attack(0.4);
    audio.play('swing');
    await this.wait(0.16);
    b.setRumble(0);
    await b.open();
    if (this.dead) return;
    const m = b.mouth(new THREE.Vector3());
    audio.play('cork', { pitch: 0.9 });
    audio.play('bigPop');
    engine.hitstop(0.08);
    engine.shake(0.45);
    this.host.flash(0.7, 0.45);
    this.setCam(() => [_a.set(C.x + 0.35, 0.16, C.z + 2.5), _b.set(C.x + 0.2, H * 0.5, C.z)], 0.12);
    fx.foam(m, { count: 30, colors: [0xffffff, 0xf2fbff, rc, rc], speed: 1.1, power: 0.55, ground: 0, scale: 0.45 });
    fx.sparkle(m, { count: 24, colors: [0xffffff, rc, 0xffd23f], speed: 4.5, radius: 0.6, size: 0.05 });
    pixelShock(this.root, _a.set(C.x, 0.02, C.z), { radius: 2.4, color: rc });
    fx.rise(_a.set(C.x, 0, C.z), { count: 36, colors: [rc, 0xffffff], radius: Math.max(0.4, hero.W * 0.6) });
    // power-up glow on the hero + SLOW-MO
    this.glow.position.set(C.x, H * 0.5, C.z + 0.4);
    animate(1.2, (e) => (this.glow.intensity = 5 * (1 - e) * (1 - e)));
    hero.rig?.flash(0.025);
    hero.toy.boing(0.8);
    this.slowmo(0.3);
    // the bottle tumbles away
    const p0 = b.root.position.clone();
    animate(1.4, (e, k) => {
      b.root.position.set(p0.x + k * 0.9, p0.y + Math.sin(k * Math.PI) * 0.5, p0.z + k * 0.3);
      b.root.rotation.z = -k * 2.2;
      b.root.scale.setScalar(s * Math.max(0.001, 1 - Math.max(0, k - 0.6) / 0.4));
    }, { onComplete: () => b.root.parent?.remove(b.root) });
    await this.wait(0.35);
  }

  slowmo(k) {
    this.speed = k;
    engine.timeScale = k;
  }

  // ===================================================================== 3. the pose
  poseCam(hero, blend = 0.6) {
    const C = this.C, H = hero.H;
    const portrait = engine.height > engine.width;
    const R = Math.max(1.8, H * 1.9 + 0.6);
    this.setCam((t) => {
      const k = smooth(clamp01(t / 3.2));
      const a = -0.75 + k * 0.95 + Math.sin(t * 0.25) * 0.04 * k;
      const r = R * (1.06 - k * 0.1);
      return [_a.set(C.x + Math.sin(a) * r, 0.1 + k * 0.12 + H * 0.12, C.z + Math.cos(a) * r), _b.set(C.x, H * (0.62 - k * 0.06), C.z)];
    }, blend);
    if (portrait) this.frame(0.5, 0.3);
    else this.frame(0.31, 0.5);
  }

  async pose(hero) {
    if (this.fast) return;
    this.stage = 'pose';
    const st = this.st, rc = this.rc;
    this.poseCam(hero, 0.25);
    // god rays behind the hero
    const host = this.host;
    host.rayMat.color.set(st.order === 0 ? 0x3f7cff : rc).multiplyScalar(st.order >= 3 ? 1 : 0.8);
    host.rays.position.set(this.C.x, hero.H * 0.6, this.C.z - 1.1);
    host.rays.visible = true;
    host.rayTarget = [0.45, 0.6, 0.75, 0.9, 0.9][st.order] ?? 0.6;
    host.raySpin = 0.5;
    // the wind-up freezes into the pose
    hero.rig?.attack(1.1);
    if (!st.spell) audio.play(st.order >= 2 ? 'roar' : 'growl', { pitch: st.order >= 2 ? 0.8 : 1.1 });
    this.extra.push(() => {
      const r = hero.rig;
      if (r && !r.frozen && r.atkT >= 0 && r.atkT / r.atkDur >= 0.43) r.frozen = true;
    });
    if (st.order >= 3) {
      audio.play('fanfare');
      fx.confetti(_a.set(this.C.x - 0.8, 2.4, this.C.z - 0.4), { count: 50, ground: 0 });
      fx.confetti(_a.set(this.C.x + 0.8, 2.4, this.C.z - 0.4), { count: 50, ground: 0 });
    } else audio.jingle(st.order >= 2 ? 'rare' : 'unlock');
    await this.wait(0.55);
    // back to real time (the hero stays frozen in the pose)
    animate(0.5, (e) => this.slowmo(0.3 + 0.7 * e));
    if (!hero.rig) hero.toy.boing(0.5);
    await this.showPanel();
    await this.wait(0.6);
  }

  // ===================================================================== out
  async outro() {
    this.stage = 'out';
    this.el?.classList.add('out');
    audio.play('whoosh', { pitch: 1.1 });
    this.host.flash(0.45, 0.3);
    await new Promise((r) => setTimeout(r, 160));
  }

  addTemp(o) {
    (this.temp ??= []).push(o);
    this.root.add(o);
    return o;
  }

  update(dt, gdt) {
    if (this.dead) return;
    this.t += dt;
    const hero = this.hero;
    if (hero) {
      hero.toy.update(dt * this.speed);
    }
    for (const f of this.extra) f(dt, gdt);
    this.bottleVial?.update(dt * this.speed);
    this.applyCam(dt);
  }

  /** Hand the hero back to the host (it hops onto the pedestal) and tear everything else down. */
  release() {
    const hero = this.hero;
    if (hero?.rig) hero.rig.frozen = false;
    if (hero) this.root.remove(hero.root);
    this.dispose();
    return hero?.toy ?? null;
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const j of this.jobs) j.cancel();
    this.jobs.clear();
    if (this.tapResolve) { const r = this.tapResolve; this.tapResolve = null; r(); }
    engine.timeScale = 1;
    const host = this.host;
    host.cut = null;
    host.ui.classList.remove('vo-cutting', 'vo-glitch');
    host.setLights(this.prev?.lights ?? 1);
    if (this.prev) host.rays.position.copy(this.prev.rayPos);
    host.rayTarget = 0;
    const cam = host.camera;
    cam.fov = this.prev?.fov ?? 30;
    cam.updateProjectionMatrix();
    this.bottleVial?.dispose();
    this.root.parent?.remove(this.root);
    this.key.dispose?.();
    const el = this.el;
    this.el = null;
    if (el) setTimeout(() => el.remove(), 260);
  }
}
