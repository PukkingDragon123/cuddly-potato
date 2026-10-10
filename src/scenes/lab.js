// The Beast Lab: main hub + Jimmy's interactive tutorial + vial opening,
// briefcase and Mega Form cutscenes.
import * as THREE from 'three';
import './lab/lab.css';
import { engine, addLights } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx, particles } from '../core/particles.js';
import { animate, tween, wait } from '../core/tween.js';
import { damp, rand, pick, clamp } from '../core/util.js';
import { VoxGrid, makeMesh } from '../core/voxel.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { SWARMS } from '../data/swarms.js';
import { VIALS, skipPrice } from '../data/vials.js';
import { createSwarm } from '../models/swarmModels.js';
import * as Props from '../models/props.js';
import { h, icon, button, say, speech, modal, toast, bigBanner, pointAt, $ui, $overlay, closeDialogue } from '../ui/ui.js';
import { charPortrait, objThumb } from '../ui/thumbs.js';
import {
  state, grantSwarm, grantSpell, addVial, takeVial, rollVial, applyVial, findSecret, vialReady, setMega,
} from '../game/state.js';
import { game } from '../game/game.js';
import { openVialSequence } from './lab/openVial.js';
import { revealCard } from './lab/reveal.js';
import { Vial } from './lab/vial.js';

const hubModules = import.meta.glob('../ui/hub.js');

function propOr(name, ...args) {
  try {
    if (typeof Props[name] === 'function') return Props[name](...args);
  } catch (e) {
    console.warn('prop failed', name, e);
  }
  return null;
}
function vox(build, scale = 0.1, pivot = 'bottom') {
  const g = new VoxGrid();
  build(g);
  return makeMesh(g.build({ scale, pivot }));
}

const JIMMY_LINES = [
  'Have you subscribed? ...to the Lab newsletter.',
  'I once spent 50 hours inside that tank. Long story.',
  'Fun fact: Swarms LOVE chocolate.',
  'If you open 1,000 vials I will... probably still be here.',
  "Don't tell Nolan, but his Belly Flop is kinda OP.",
  'Every Swarm is hand-shaken with love.',
  'Juan says the truck is "mostly street legal".',
  'The Tiger is fine. Totally fine. Do NOT tap the glass.',
  "Last one to leave the Lab gets... wait, that's a different video.",
];

export class LabScene {
  constructor() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x1a2660);
    scene.fog = new THREE.Fog(0x1a2660, 18, 38);
    this.camera = new THREE.PerspectiveCamera(42, engine.aspect, 0.1, 100);
    addLights(scene, { hemi: 1.7, sun: 2.0, dir: [4, 10, 7], shadowExtent: 10, sky: 0xe6f3ff, ground: 0x5a5a7a });
    const pink = new THREE.PointLight(0xff2e88, 8, 12);
    pink.position.set(-6, 4, -2);
    const blue = new THREE.PointLight(0x29b6f6, 8, 12);
    blue.position.set(6, 4, -2);
    scene.add(pink, blue);
    this.t = 0;
    this.busy = false;
    this.camPos = new THREE.Vector3(0, 2.7, 7.6);
    this.camLook = new THREE.Vector3(0, 1.55, -0.6);
    this.homePos = this.camPos.clone();
    this.homeLook = this.camLook.clone();
    this.benchPos = new THREE.Vector3(0, 0.95, 1.7);
    this.tigerTaps = 0;
    this.buildRoom();
  }

  // -------------------------------------------------------------------------
  buildRoom() {
    const s = this.scene;
    // floor
    const floor = propOr('makeFloorTiles', 20, 14) || (() => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 14), new THREE.MeshLambertMaterial({ color: 0x3a4466 }));
      g.position.y = -0.1;
      return g;
    })();
    floor.position.z = -1;
    floor.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    s.add(floor);
    // walls
    const back = propOr('makeWallPanel', 20, 7) || new THREE.Mesh(new THREE.BoxGeometry(20, 7, 0.3), new THREE.MeshLambertMaterial({ color: 0x26326e }));
    back.position.set(0, back.isMesh ? 3.5 : 0, -7.5);
    s.add(back);
    for (const side of [-1, 1]) {
      const w = propOr('makeWallPanel', 14, 7) || new THREE.Mesh(new THREE.BoxGeometry(14, 7, 0.3), new THREE.MeshLambertMaterial({ color: 0x1f2a5e }));
      w.rotation.y = side * -Math.PI / 2;
      w.position.set(side * 9.5, w.isMesh ? 3.5 : 0, -1);
      s.add(w);
    }
    // tank with the Beast Tiger
    const tank = propOr('makeTank');
    this.tankPos = new THREE.Vector3(0, 0, -4.4);
    if (tank) {
      tank.root.position.copy(this.tankPos);
      tank.root.scale.setScalar(1.15);
      s.add(tank.root);
      this.tank = tank;
      // keep the creature readable through the liquid
      for (const part of [tank.liquid, tank.glass]) {
        part?.traverse?.((o) => {
          if (o.material && o.material.transparent) o.material.opacity = Math.min(o.material.opacity, part === tank.liquid ? 0.14 : 0.2);
        });
      }
    } else {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4.4, 24, 1, true), new THREE.MeshPhongMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
      glass.position.set(0, 2.6, -4.4);
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4.2, 24), new THREE.MeshPhongMaterial({ color: 0x29e0ff, transparent: true, opacity: 0.25, depthWrite: false }));
      liquid.position.copy(glass.position);
      const base = vox((g) => g.cylinder(-0.5, -0.5, 0, 3, 18, 0x5a6488), 0.1);
      base.position.set(0, 0, -4.4);
      const lid = vox((g) => g.cylinder(-0.5, -0.5, 0, 3, 18, 0x5a6488), 0.1);
      lid.position.set(0, 4.8, -4.4);
      s.add(glass, liquid, base, lid);
      this.tank = { root: glass, glass, liquid };
    }
    this.tiger = createSwarm('beastTiger', { scale: 1.25 });
    this.tiger.root.position.set(0, 1.4, -4.3);
    this.tiger.root.rotation.y = 0.35;
    s.add(this.tiger.root);
    const tankLight = new THREE.PointLight(0x29e0ff, 6, 9);
    tankLight.position.set(0, 3, -3.2);
    s.add(tankLight);
    this.tankLight = tankLight;

    // furniture
    const place = (name, args, x, y, z, ry = 0, sc = 1, fb = null) => {
      const o = propOr(name, ...args) || (fb ? fb() : null);
      if (!o) return null;
      o.position.set(x, y, z);
      o.rotation.y = ry;
      o.scale.multiplyScalar(sc);
      s.add(o);
      return o;
    };
    const fbBox = (w, hh, d, c) => () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), new THREE.MeshLambertMaterial({ color: c }));
      m.position.y = hh / 2;
      const g = new THREE.Group();
      g.add(m);
      return g;
    };
    place('makeMonitorWall', [], -5.2, 0, -6.8, 0, 1, fbBox(5, 3, 0.4, 0x1a2244));
    place('makeMonitorWall', [], 5.2, 0, -6.8, 0, 1, fbBox(5, 3, 0.4, 0x1a2244));
    place('makeConsole', [], -4.6, 0, -3.6, 0.5, 1, fbBox(2, 1.1, 1, 0x5a6488));
    place('makeComputer', [], 4.8, 0, -3.8, -0.5, 1, fbBox(1.6, 1.4, 1, 0x5a6488));
    place('makePipes', [8], -7.5, 0, -6.5, Math.PI / 2, 1, null);
    place('makePipes', [8], 7.5, 0, -6.5, -Math.PI / 2, 1, null);
    place('makeLabShelf', [], -8.3, 0, -1.5, Math.PI / 2, 1, fbBox(0.8, 2.4, 2.4, 0x6a5040));
    place('makeVialRack', [], 8.2, 0, -1.2, -Math.PI / 2, 1, fbBox(0.8, 1.4, 2, 0x6a5040));
    this.door = place('makeLabDoor', [], -9.3, 0, 1.6, Math.PI / 2, 1, fbBox(0.3, 3, 2, 0xff2e88));
    // workbench (front centre) where vials are opened
    const bench = place('makeLabDesk', [], this.benchPos.x, 0, this.benchPos.z, 0, 1, fbBox(2.6, 0.95, 1.2, 0x8a93b8));
    if (bench) {
      bench.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(bench);
      if (isFinite(bb.max.y) && bb.max.y > 0.3) this.benchPos.y = bb.max.y;
    }
    // coffee mug easter egg on the bench corner
    this.mug = place('makeMug', [], this.benchPos.x + 1.05, this.benchPos.y, this.benchPos.z - 0.2, 0.4, 1.2, () => {
      const g = new THREE.Group();
      g.add(vox((gg) => { gg.cylinder(-0.5, -0.5, 0, 3, 1.6, 0xffffff); gg.box(2, 1, 0, 2, 2, 0, 0xffffff); gg.cylinder(-0.5, -0.5, 3, 3, 1, 0x5a3220); }, 0.06));
      return g;
    });
    // display pedestal (holographic, used by the hub to preview Swarms)
    this.pedPos = new THREE.Vector3(3.1, 0, -1.3);
    this.pedestal = new THREE.Group();
    this.pedestal.add(vox((gg) => {
      gg.cylinder(-0.5, -0.5, 0, 1, 8, 0x3a4466);
      gg.cylinder(-0.5, -0.5, 2, 5, 6.5, (x, y, z) => (y === 5 ? 0x5a6488 : (x + z) & 1 ? 0xeaf2ff : 0xd6e4f4));
      gg.cylinder(-0.5, -0.5, 6, 6, 7, 0x29b6f6, 'y', true);
      gg.cylinder(-0.5, -0.5, 6, 6, 5.5, 0x5a6488);
      for (let a = 0; a < 8; a++) gg.set(Math.round(Math.cos(a * 0.785) * 7.6 - 0.5), 3, Math.round(Math.sin(a * 0.785) * 7.6 - 0.5), 0xff2e88, true);
    }, 0.1));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.4, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.9;
    this.pedestal.add(beam);
    this.pedestal.position.copy(this.pedPos);
    s.add(this.pedestal);
    this.pedestalTop = 0.7;
    place('makeTrophyPodium', [], 7.4, 0, -4.6, -0.6, 0.8, null);
    const spot = new THREE.SpotLight(0xffffff, 18, 9, 0.45, 0.6);
    spot.position.set(3.1, 5.5, 1.0);
    spot.target.position.set(3.1, 0.6, -1.3);
    s.add(spot, spot.target);

    // characters
    this.jimmy = new Chibi(CHARACTERS.jimmy, { scale: 1.05 });
    this.jimmy.root.position.set(-2.4, 0, 0.9);
    this.jimmy.root.rotation.y = 0.35;
    s.add(this.jimmy.root);
    this.tech = new Chibi(CHARACTERS.labTech, { scale: 0.95 });
    this.tech.root.position.set(-4.4, 0, -2.6);
    this.tech.root.rotation.y = 2.6;
    this.tech.play('talk');
    s.add(this.tech.root);
    this.techT = 3;
    this.idleT = 6;

    // ceiling lights strip
    for (let i = -2; i <= 2; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.4), new THREE.MeshBasicMaterial({ color: 0xdff6ff }));
      l.position.set(i * 3.6, 6.9, -2);
      s.add(l);
    }
  }

  // -------------------------------------------------------------------------
  async enter(params) {
    this.params = params;
    audio.music('lab');
    this.bindInput();
    const tut = state.p.tutorial;
    if (params.megaTest) {
      this.mountHub();
      return;
    }
    if (tut === 'start' || tut === 'vial') this.tutorialStart();
    else if (tut === 'battle') this.tutorialBattleAgain();
    else if (tut === 'briefcase') this.tutorialBriefcase();
    else {
      this.mountHub();
      if (tut === 'arena') this.arenaNudge();
      else this.greet();
    }
  }

  exit() {
    engine.canvas.removeEventListener('pointerdown', this.onDown);
    this.hub?.destroy?.();
    closeDialogue();
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.fov = w / hh < 1 ? 62 : 42;
    this.camera.updateProjectionMatrix();
  }

  // camera helpers
  camTo(pos, look, dur = 0.8) {
    const p0 = this.camPos.clone(), l0 = this.camLook.clone();
    return animate(dur, (e) => {
      this.camPos.lerpVectors(p0, pos, e);
      this.camLook.lerpVectors(l0, look, e);
    }, { ease: 'inOutCubic' }).promise;
  }
  camHome(dur = 0.8) {
    return this.camTo(this.homePos, this.homeLook, dur);
  }

  update(dt) {
    this.t += dt;
    const cam = this.camera;
    const sway = this.busy ? 0 : 1;
    cam.position.set(this.camPos.x + Math.sin(this.t * 0.3) * 0.08 * sway, this.camPos.y + Math.sin(this.t * 0.4) * 0.04 * sway, this.camPos.z);
    cam.lookAt(this.camLook);
    // tiger floats in the tank
    const tg = this.tiger;
    tg.root.position.y = 1.4 + Math.sin(this.t * 0.9) * 0.12;
    tg.root.rotation.y = 0.35 + Math.sin(this.t * 0.25) * 0.4;
    tg.update(dt);
    if (Math.random() < dt * 6) fx.bubbles(new THREE.Vector3(this.tankPos.x + rand(-1.2, 1.2), 0.6, this.tankPos.z + rand(-0.6, 1)), { count: 1, color: 0x9ff2ff, size: 0.08, speed: 1.4, life: 2.6 });
    this.tankLight.intensity = 5 + Math.sin(this.t * 2) * 1;
    this.tank?.update?.(dt);
    this.jimmy.update(dt);
    this.tech.update(dt);
    if (this.preview) {
      this.preview.root.rotation.y += dt * 0.8;
      this.preview.update(dt);
    }
    // ambient life
    this.techT -= dt;
    if (this.techT <= 0) {
      this.techT = rand(3, 7);
      this.tech.play(pick(['talk', 'shake', 'point', 'idle', 'facepalm']));
      this.tech.expr(pick(['normal', 'happy', 'side', 'determined']), pick(['smile', 'flat', 'o']), 2);
      if (Math.random() < 0.3) fx.sparkle(new THREE.Vector3(-4.6, 1.3, -3.4), { count: 6, colors: [0x9ff2ff, 0xff4fd8], speed: 1 });
    }
    if (!this.busy) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = rand(5, 10);
        const a = pick(['wave', 'idle', 'point', 'talk', 'cheer']);
        this.jimmy.play(a, a === 'cheer' ? { dur: 1.2, then: 'idle' } : {});
        if (a !== 'idle') setTimeout(() => !this.busy && this.jimmy.play('idle'), 1800);
      }
    }
    this.interaction && this.interaction(dt);
  }

  // -------------------------------------------------------------------------
  // Input: taps on the tank, Jimmy, mug, door, pedestal
  bindInput() {
    this.onDown = (e) => {
      if (this.busy) return;
      const hits = engine.raycast(e.clientX, e.clientY, this.scene.children, this.camera);
      if (!hits.length) return;
      const hitObj = (root) => root && hits.some((h0) => isChild(h0.object, root));
      if (hitObj(this.jimmy.root)) return this.pokeJimmy();
      if (hitObj(this.mug)) return this.pokeMug();
      if (hitObj(this.tiger.root) || (this.tank && hitObj(this.tank.root))) return this.pokeTank();
      if (this.door && hitObj(this.door) && state.p.tutorial !== 'start') return this.goArena();
    };
    engine.canvas.addEventListener('pointerdown', this.onDown);
  }

  pokeJimmy() {
    const j = this.jimmy;
    j.boing(0.5);
    audio.play('boing');
    j.play(pick(['shocked', 'wave', 'cheer']), { dur: 1, then: 'idle', restart: true });
    j.expr(pick(['happy', 'wink', 'star', 'shock']), pick(['grin', 'tongue', 'open']), 1.6);
    speech(j, pick(JIMMY_LINES), 2.6);
  }
  pokeMug() {
    audio.play('tap');
    this.mug.scale.multiplyScalar(1.2);
    tween(this.mug.scale, { x: this.mug.scale.x / 1.2, y: this.mug.scale.y / 1.2, z: this.mug.scale.z / 1.2 }, 0.3, { ease: 'outElastic' });
    fx.smoke(this.mug.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { count: 4, scale: 0.4, color: 0xffffff });
    this.jimmy.expr('shock', 'shout', 1.4);
    speech(this.jimmy, "Hey! That's my coffee!", 2);
    const r = findSecret('coffeeMug');
    if (r) toast(`Secret found: *${r.secret.name}*! +50 coins`, { icon: 'star' });
  }
  pokeTank() {
    this.tigerTaps++;
    audio.play('tap', { pitch: 0.6 });
    fx.bubbles(new THREE.Vector3(this.tankPos.x + rand(-0.5, 0.5), 2, this.tankPos.z + 1.2), { count: 8, color: 0x9ff2ff });
    this.tiger.boing(0.3);
    if (this.tigerTaps === 3) speech(this.jimmy, 'Uh... I said do NOT tap the glass.', 2.2);
    if (this.tigerTaps === 6) { this.tiger.attack(0.6); audio.play('growl'); speech(this.jimmy, "He's getting grumpy...", 2); }
    if (this.tigerTaps >= 10) {
      this.tigerTaps = 0;
      this.tiger.attack(1.2);
      audio.play('roar');
      engine.shake(0.8);
      fx.bubbles(new THREE.Vector3(this.tankPos.x, 1.5, this.tankPos.z + 1), { count: 60, color: 0x9ff2ff, radius: 1.2, speed: 3 });
      this.tankLight.color.set(0xff4a4a);
      setTimeout(() => this.tankLight.color.set(0x29e0ff), 900);
      this.jimmy.play('shocked', { restart: true, dur: 0.7, then: 'idle' });
      this.jimmy.expr('shock', 'shout', 2);
      speech(this.jimmy, 'AAAH! Okay, he likes you. I think.', 2.5);
      const r = findSecret('tigerTaps');
      if (r) setTimeout(() => toast(`Secret found: *${r.secret.name}*! +10 Beast Bucks`, { icon: 'bucks' }), 600);
    }
  }
  jimmySay(text, dur = 2) {
    speech(this.jimmy, text, dur);
  }
  jimmyReact(order) {
    const j = this.jimmy;
    if (order >= 3) { j.play('shocked', { restart: true, dur: 0.7, then: 'cheer' }); j.expr('star', 'shout', 2.2); speech(j, pick(['NO WAY!!', 'LEGENDARY?!', "That's INSANE!"]), 2); setTimeout(() => j.play('idle'), 2000); }
    else if (order >= 2) { j.play('cheer', { dur: 1, then: 'idle' }); j.expr('star', 'grin', 1.6); speech(j, pick(['ULTRA RARE!', "Let's gooo!", 'Sheeesh!']), 1.8); }
    else if (order >= 1) { j.expr('happy', 'grin', 1.2); if (Math.random() < 0.5) speech(j, pick(['Nice pull!', 'Ooh, a Rare!']), 1.5); }
  }

  // -------------------------------------------------------------------------
  // Hub
  async mountHub() {
    const loader = hubModules['../ui/hub.js'];
    const ctx = {
      openVial: (slot) => this.openVialFromSlot(slot),
      megaTransform: (baseId) => this.megaTransform(baseId),
      startBattle: (opts = {}) => game.go('battle', { mode: opts.mode ?? 'ranked', arena: opts.arena }),
      goArena: () => this.goArena(),
      previewSwarm: (id, variant, skin) => this.showPreview(id, variant, skin),
    };
    this.hubCtx = ctx;
    if (loader) {
      try {
        const mod = await loader();
        this.hub = mod.mountHub(ctx);
        return;
      } catch (e) {
        console.error('hub failed', e);
      }
    }
    // fallback mini hub
    const el = h('div', { class: 'lab-fallback-hub' },
      button('BATTLE', () => ctx.startBattle(), 'pink big', { icon: 'sword' }),
      button('ARENA', () => ctx.goArena(), 'green big', { icon: 'pin' }));
    $ui().appendChild(el);
    this.hub = { el, destroy: () => el.remove(), refresh() {} };
  }
  hideHub(hide) {
    if (this.hub?.hide) {
      this.hub.hide(hide);
      if (!hide) this.hub.refresh && this.hub.refresh();
      return;
    }
    const el = this.hub?.el;
    if (!el) return;
    el.style.transition = 'opacity 0.25s';
    el.style.opacity = hide ? '0' : '1';
    el.style.pointerEvents = hide ? 'none' : '';
    if (!hide) this.hub.refresh && this.hub.refresh();
  }
  goArena() {
    if (state.p.tutorial === 'start' || state.p.tutorial === 'battle' || state.p.tutorial === 'briefcase') return;
    audio.play('whoosh');
    game.go('arena', { from: 'lab' });
  }
  greet() {
    const j = this.jimmy;
    setTimeout(() => {
      j.play('wave', { dur: 1.5, then: 'idle' });
      j.expr('happy', 'grin', 2);
      speech(j, pick(['Welcome back to the Lab!', `Yo ${state.p.name}! Ready to battle?`, 'Your vials are bubbling!', 'The Tiger missed you. Probably.']), 2.4);
    }, 600);
  }
  arenaNudge() {
    setTimeout(() => {
      speech(this.jimmy, 'The ARENA is waiting! Hit the Arena button!', 3);
      const btn = [...document.querySelectorAll('#ui button')].find((b) => /arena/i.test(b.textContent));
      if (btn) {
        const rm = pointAt(btn, 'Arena!');
        setTimeout(rm, 6000);
      }
    }, 900);
  }

  showPreview(id, variant = 'base', skin = null) {
    if (this.preview) this.scene.remove(this.preview.root);
    const rig = createSwarm(id, { variant, skin });
    const fit = 1.3 / Math.max(rig.height, rig.length * 0.7, 0.5);
    rig.baseScale = fit;
    rig.root.position.set(this.pedPos.x, this.pedestalTop, this.pedPos.z);
    this.scene.add(rig.root);
    rig.boing(0.6);
    fx.sparkle(rig.root.position.clone().setY(this.pedestalTop + 0.5), { count: 20, colors: [0xffffff, 0x29b6f6], speed: 2 });
    audio.play('pop');
    this.preview = rig;
  }

  async openVialFromSlot(slot) {
    if (this.busy) return;
    if (!vialReady(slot)) return;
    const e = takeVial(slot);
    if (!e) return;
    const res = applyVial(rollVial(e.type));
    await openVialSequence(this, e.type, res, { hints: false });
    this.hub?.refresh && this.hub.refresh();
  }

  // -------------------------------------------------------------------------
  // Tutorial
  J(eyes = 'happy', mouth = 'grin') {
    return { name: 'Jimmy', color: '#29b6f6', portrait: charPortrait('jimmy', { eyes, mouth }), chibi: this.jimmy };
  }

  async tutorialStart() {
    this.busy = true;
    const j = this.jimmy;
    // dramatic intro: start on the tank
    this.camPos.set(1.1, 2.5, 0.6);
    this.camLook.set(0, 2.0, -4.4);
    j.root.visible = false;
    audio.play('bubble');
    await wait(1.2);
    this.tiger.attack(0.8);
    audio.play('growl', { pitch: 0.8 });
    await wait(0.9);
    await this.camHome(1.4);
    // Jimmy pops up
    j.root.visible = true;
    j.root.position.y = -2;
    audio.play('boing');
    await animate(0.5, (e) => (j.root.position.y = -2 + 2 * e), { ease: 'outBack' }).promise;
    j.boing(0.6);
    j.play('wave');
    j.expr('happy', 'grin');
    fx.confetti(new THREE.Vector3(j.root.position.x, 2.5, j.root.position.z), { count: 40 });
    await say(this.J(), 'Whoa, a new recruit! Welcome to the *BEAST LAB*, where we make the craziest creatures on the planet!');
    j.play('point');
    await say(this.J('side', 'smirk'), "See the big guy in the tank? That's the *Beast Tiger*. Don't tap the glass. Seriously. He hates that.");
    j.play('talk');
    await say(this.J(), "First things first... what should I call you?");
    await this.askName();
    j.play('cheer', { dur: 1.2, then: 'idle' });
    await say(this.J('star', 'grin'), `Nice to meet you, *${state.p.name}*! Every Swarm starts inside one of THESE...`);
    // starter vial
    j.play('present');
    await say(this.J(), "A *Swarms Vial*! Grab it, SHAKE it until it's ready to blow, then POP it open!");
    state.p.tutorial = 'vial';
    state.save();
    const res = { type: 'starter', coins: 100, bucks: 0, cards: [{ id: 'panther', copies: 1, variant: 'base' }], spells: ['foodThrow'] };
    applyVial(res);
    this.busy = false;
    await openVialSequence(this, 'starter', res, { hints: true });
    this.busy = true;
    j.play('cheer', { dur: 1.2, then: 'idle' });
    await say(this.J('star', 'grin'), 'A *Panther*! Our very first Swarm design. Fast, cheap and fearless. And *Food Throw*: nothing powers up a Swarm like a food challenge!');
    // gift: Clogged Toilet
    j.play('present');
    await say(this.J('wink', 'smirk'), "Here, take my *Clogged Toilet* too. Every Lab needs ranged backup... and plumbing.");
    grantSwarm('cloggedToilet', 1);
    if (!state.p.deck.includes('cloggedToilet')) state.p.deck.push('cloggedToilet');
    state.save();
    const rig = createSwarm('cloggedToilet');
    rig.baseScale = 1.1 / Math.max(rig.height, 0.5);
    rig.root.position.copy(this.benchPos);
    this.scene.add(rig.root);
    rig.boing(0.8);
    audio.play('pop');
    fx.sparkle(this.benchPos.clone().setY(this.benchPos.y + 0.5), { count: 30, colors: [0xffffff, 0xff8a2a], speed: 3 });
    this.interaction = (dt) => rig.update(dt);
    await revealCard({ kind: 'swarm', id: 'cloggedToilet', copies: 1, isNew: true });
    this.interaction = null;
    this.scene.remove(rig.root);
    state.p.tutorial = 'battle';
    state.save();
    await this.challenge();
  }

  async challenge() {
    const j = this.jimmy;
    j.play('point');
    j.expr('determined', 'smirk');
    await say(this.J('determined', 'smirk'), "Now... think you can beat ME? Let's battle! First to destroy the other's Lab wins. My *Mansion Lab* has never lost!");
    const wrap = h('div', { style: { position: 'absolute', left: '0', right: '0', bottom: 'calc(var(--safe-b) + 18%)', display: 'flex', justifyContent: 'center' } });
    const btn = button('BATTLE JIMMY!', () => {
      wrap.remove();
      audio.play('levelUp');
      game.go('battle', { mode: 'tutorial' });
    }, 'pink big pulse', { icon: 'sword' });
    wrap.appendChild(btn);
    $ui().appendChild(wrap);
    this.busy = false;
  }

  async tutorialBattleAgain() {
    this.busy = true;
    await wait(0.4);
    await say(this.J(), `Back for more, ${state.p.name}? My Mansion Lab is ready when you are.`);
    await this.challenge();
  }

  async askName() {
    return new Promise((res) => {
      const input = h('input', { class: 'px-input', maxlength: '14', value: state.p.name === 'Recruit' ? '' : state.p.name, placeholder: 'Recruit' });
      const done = () => {
        const v = input.value.trim().replace(/[<>]/g, '').slice(0, 14);
        state.p.name = v || 'Recruit';
        state.save();
        m.close();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
      const m = modal({ title: 'YOUR NAME', size: 'narrow', closable: false, body: h('div', { class: 'name-input' }, h('div', { class: 'small muted' }, 'Pick a scientist name (shown to opponents).'), input), foot: [button("That's me!", done, 'green')], onClose: res });
      setTimeout(() => input.focus(), 100);
    });
  }

  async tutorialBriefcase() {
    this.busy = true;
    const j = this.jimmy;
    await wait(0.5);
    j.play('shocked', { dur: 0.8, then: 'idle' });
    j.expr('shock', 'open', 2);
    await say(this.J('shock', 'open'), "I can't believe you beat my Mansion Lab! A deal's a deal...");
    j.play('wave');
    await say(this.J('money', 'grin'), 'Winners get the *BRIEFCASE*!');
    await this.briefcaseSequence();
    // home horrors vial + timer skip
    await this.homeVialSequence();
    j.play('point');
    await say(this.J('star', 'grin'), "Your Lab is officially ready! Now the real fun begins: the *ARENA*. Real rivals, bosses, a giant grocery store... go make me proud!");
    state.p.tutorial = 'arena';
    state.save();
    this.busy = false;
    await this.mountHub();
    this.arenaNudge();
  }

  async briefcaseSequence() {
    const j = this.jimmy;
    const bc = propOr('makeBriefcase') || (() => {
      const root = new THREE.Group();
      const body = vox((g) => g.box(-5, 0, -2, 4, 6, 1, 0x2a2a3a), 0.09);
      const lid = new THREE.Group();
      lid.add(vox((g) => g.box(-5, 0, 0, 4, 1, 3, 0x3a3a4a), 0.09));
      lid.position.set(0, 0.6, -0.18);
      root.add(body, lid);
      return { root, lid, body };
    })();
    // Jimmy holds it up
    j.play('holdUp');
    bc.root.scale.setScalar(1.3);
    const hand = j.handWorld(new THREE.Vector3());
    bc.root.position.set(j.root.position.x, j.root.position.y + j.height + 0.4, j.root.position.z);
    this.scene.add(bc.root);
    audio.play('chaching');
    fx.sparkle(bc.root.position, { count: 30, colors: [0xffd23f, 0xffffff], speed: 3 });
    await wait(1);
    // place on bench
    const from = bc.root.position.clone();
    const to = this.benchPos.clone();
    await animate(0.7, (e, k) => {
      bc.root.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 1.2, from.z + (to.z - from.z) * k);
    }, { ease: 'inOutQuad' }).promise;
    audio.play('thud');
    fx.dust(to, { count: 10 });
    j.play('point');
    await this.camTo(new THREE.Vector3(to.x, to.y + 1.3, to.z + 3), new THREE.Vector3(to.x, to.y + 0.4, to.z), 0.7);
    // tap to open
    const prompt = h('div', { class: 'vial-prompt outline pulse' }, 'TAP TO OPEN!');
    $overlay().appendChild(prompt);
    const rm = pointAt(bc.root, '');
    await new Promise((res) => {
      const fn = () => { engine.canvas.removeEventListener('pointerdown', fn); $overlay().removeEventListener('pointerdown', fn); res(); };
      engine.canvas.addEventListener('pointerdown', fn);
      $overlay().addEventListener('pointerdown', fn);
    });
    rm();
    prompt.remove();
    // OPEN: golden light + cash explosion
    const glow = new THREE.PointLight(0xffd23f, 0, 8);
    glow.position.copy(to).add(new THREE.Vector3(0, 0.8, 0.3));
    this.scene.add(glow);
    audio.play('bigPop');
    audio.play('chaching');
    animate(0.5, (e) => { if (bc.lid) bc.lid.rotation.x = -1.9 * e; glow.intensity = 12 * e; }, { ease: 'outBack' });
    engine.shake(0.8);
    engine.hitstop(0.1);
    const top = to.clone().add(new THREE.Vector3(0, 0.6, 0));
    fx.cash(top, 160, { speed: 11, spread: 1.5, coinRatio: 0.25, ground: 0, life: 1.6 });
    fx.sparkle(top, { count: 60, colors: [0xffd23f, 0xffffff, 0x5fdc4a], speed: 6, radius: 1 });
    fx.shockwave(new THREE.Vector3(top.x, to.y, top.z), { radius: 3, color: 0xffd23f });
    audio.play('cheer');
    j.play('cheer');
    j.expr('money', 'grin', 4);
    // cash keeps raining
    let rain = 0;
    this.interaction = (dt) => {
      rain += dt;
      if (rain < 3 && Math.random() < dt * 12) fx.cash(new THREE.Vector3(rand(-4, 4), 6, rand(-1, 2)), 6, { speed: 2, coinRatio: 0.1, ground: 0 });
    };
    // the $100K bag rises out
    await wait(0.8);
    const bag = propOr('makeMoneyBag') || vox((g) => { g.sphere(0, 0, 0, 7, 0xc8a060); g.box(-1, 7, -1, 1, 9, 1, 0x8a6a3a); }, 0.1, 'center');
    bag.position.copy(top);
    bag.scale.setScalar(0.01);
    this.scene.add(bag);
    audio.play('boing', { pitch: 0.6 });
    await animate(0.8, (e) => { bag.scale.setScalar(0.75 * e); bag.position.y = top.y + e * 0.9; bag.rotation.y = e * Math.PI * 2; }, { ease: 'outBack' }).promise;
    grantSpell('moneyDrop');
    await revealCard({ kind: 'spell', id: 'moneyDrop' });
    animate(0.3, (e) => bag.scale.setScalar(0.75 * (1 - e)), { onComplete: () => this.scene.remove(bag) });
    animate(0.3, (e) => bc.root.scale.setScalar(1.3 * (1 - e)), { onComplete: () => this.scene.remove(bc.root) });
    this.scene.remove(glow);
    this.interaction = null;
    j.play('idle');
    await this.camHome(0.6);
  }

  async homeVialSequence() {
    const j = this.jimmy;
    j.play('present');
    await say(this.J('happy', 'grin'), "AND... a *Home Horrors* vial! The fan-favourite series - toilets, trash cans and mailboxes gone FERAL.");
    // show the vial slot with a timer and a skip price
    const type = 'homeHorrors';
    const def = VIALS[type];
    const price = skipPrice(def.time);
    const vimg = objThumb('vial_' + type, () => { const v = new Vial(type); v.update(0); return v.root; }, { size: 128, yaw: 0.2, pitch: 0.15 });
    const priceEl = h('div', { class: 'price-flick' }, icon('bucks'), h('span', { class: 'n' }, String(price)), h('div', { class: 'strike' }));
    const timerEl = h('div', { class: 'timer gold' }, '30:00');
    const panel = h('div', { class: 'slot-demo px-box bounce-in' },
      h('div', { class: 'display small' }, def.name),
      h('img', { class: 'vimg', src: vimg }),
      h('div', { class: 'row small' }, icon('clock'), timerEl),
      h('div', { class: 'tiny muted' }, 'Skip the wait:'),
      priceEl);
    const holder = h('div', { style: { position: 'absolute', right: '8%', top: '18%', zIndex: 21 } }, panel);
    $overlay().appendChild(holder);
    audio.play('pop');
    await say(this.J('sad', 'flat'), `Normally vials take time to open. This one's *30 minutes*... or *${price} Beast Bucks* to skip.`);
    j.play('flick', { restart: true });
    j.expr('wink', 'smirk', 2);
    await say(this.J('wink', 'smirk'), "BUT... your first one's on me. *flick*");
    // dramatic flick: price counts down to zero and the tag spins
    j.play('flick', { restart: true });
    audio.play('flick');
    priceEl.classList.add('struck');
    priceEl.style.transform = 'rotate(-14deg) scale(1.2)';
    const n = priceEl.querySelector('.n');
    for (let v = price; v >= 0; v--) {
      n.textContent = String(v);
      audio.play('tick', { pitch: 1 + (price - v) * 0.1 });
      await wait(0.09);
    }
    priceEl.classList.add('zero');
    priceEl.style.transform = 'rotate(0deg) scale(1.3)';
    timerEl.textContent = 'READY!';
    audio.play('chaching');
    engine.shake(0.2);
    setTimeout(() => (priceEl.style.transform = 'scale(1)'), 250);
    const openBtn = button('OPEN NOW!', null, 'green big pulse');
    panel.appendChild(openBtn);
    await new Promise((r) => openBtn.addEventListener('click', r, { once: true }));
    holder.remove();
    const res = { type, coins: 120, bucks: 0, cards: [{ id: 'toiletRollRipper', copies: 3, variant: 'base' }, { id: 'trashedCan', copies: 1, variant: 'base' }, { id: 'ragingStopSign', copies: 1, variant: 'base' }], spells: [] };
    applyVial(res);
    this.busy = false;
    await openVialSequence(this, type, res, { hints: false });
    this.busy = true;
  }

  // -------------------------------------------------------------------------
  // Mega Form transformation cutscene
  async megaTransform(baseId) {
    const base = SWARMS[baseId];
    const megaId = base?.mega;
    if (!megaId) return;
    this.busy = true;
    this.hideHub(true);
    const bench = this.benchPos.clone();
    await this.camTo(new THREE.Vector3(bench.x + 0.6, bench.y + 1.7, bench.z + 4.8), new THREE.Vector3(bench.x + 0.4, bench.y + 0.8, bench.z), 0.8);
    audio.music(null);
    const rig = createSwarm(baseId, { variant: state.p.swarms[baseId]?.variant ?? 'base' });
    rig.baseScale = 1 / Math.max(rig.height, 0.5);
    rig.root.position.copy(bench);
    rig.root.rotation.y = 0.4;
    this.scene.add(rig.root);
    rig.boing(0.6);
    audio.play('pop');
    this.interaction = (dt) => rig.update(dt);
    this.jimmy.play('point');
    speech(this.jimmy, 'Mega Serum... ready? 3... 2... 1...', 2.4);
    await wait(1.2);
    // serum drips from above
    const serum = new Vial('mega');
    serum.root.position.set(bench.x, bench.y + 2.6, bench.z);
    serum.root.rotation.z = Math.PI * 0.85;
    serum.root.scale.setScalar(0.6);
    this.scene.add(serum.root);
    audio.play('magic');
    for (let i = 0; i < 16; i++) {
      fx.slime(new THREE.Vector3(bench.x, bench.y + 2.2, bench.z), { count: 3, color: 0xff2e88, speed: 0.6, ground: bench.y });
      await wait(0.06);
    }
    this.scene.remove(serum.root);
    // charging: shaking, growing, glowing, lightning
    const light = new THREE.PointLight(0xff2e88, 0, 7);
    light.position.copy(bench).add(new THREE.Vector3(0, 1, 0.6));
    this.scene.add(light);
    audio.play('fizz');
    let t = 0;
    await new Promise((res) => {
      this.interaction = (dt) => {
        t += dt;
        rig.update(dt);
        const k = Math.min(1, t / 2.6);
        rig.baseScale = (1 / Math.max(rig.height, 0.5)) * (1 + k * 0.6);
        rig.root.position.x = bench.x + Math.sin(t * 60) * 0.03 * k;
        light.intensity = k * 14 + Math.sin(t * 30) * 3;
        if (Math.random() < dt * 20) fx.sparkle(rig.root.position.clone().setY(bench.y + 0.6), { count: 3, colors: [0xff2e88, 0xffd23f, 0x7d4a2d], speed: 3, radius: 0.7 });
        if (Math.random() < dt * 8 * k) { fx.chocolate(rig.root.position.clone().setY(bench.y + 0.6), { count: 4, speed: 3, ground: bench.y }); audio.play('zap', { gap: 0.1 }); }
        if (Math.random() < dt * 6) rig.flash(0.05);
        engine.shake(0.03 * k);
        if (t > 2.8) res();
      };
    });
    // BOOM
    audio.play('bigPop');
    audio.play('explode');
    engine.shake(1);
    engine.hitstop(0.12);
    for (const m of rig.meshes) fx.shatter(m, { force: 7 });
    this.scene.remove(rig.root);
    fx.chocolate(bench.clone().setY(bench.y + 0.8), { count: 90, speed: 9 });
    fx.shockwave(bench, { radius: 4, color: 0xff2e88 });
    fx.confetti(bench.clone().setY(bench.y + 1), { count: 60, colors: [0x1d9bf0, 0xff4fa3, 0xffd23f, 0xc0c8d8] });
    const mega = createSwarm(megaId, {});
    const fit = 1.9 / Math.max(mega.height, 0.5);
    this.camTo(new THREE.Vector3(bench.x + 0.9, bench.y + 2.1, bench.z + 5.6), new THREE.Vector3(bench.x + 0.6, bench.y + 1.0, bench.z), 0.6);
    mega.baseScale = fit;
    mega.root.position.copy(bench).add(new THREE.Vector3(-0.3, 0, 0));
    mega.root.rotation.y = 0.35;
    this.scene.add(mega.root);
    mega.boing(1);
    this.interaction = (dt) => {
      mega.update(dt);
      light.intensity = damp(light.intensity, 3, 2, dt);
    };
    await wait(0.4);
    mega.attack(0.8);
    audio.play('roar', { pitch: 0.75 });
    this.jimmy.play('shocked', { restart: true, dur: 0.7, then: 'cheer' });
    this.jimmy.expr('star', 'shout', 3);
    speech(this.jimmy, 'IT\'S... MADE OF CHOCOLATE?!', 2.6);
    bigBanner('MEGA FORM!', SWARMS[megaId].name, { dur: 2.4, color: '#ff2e88' });
    audio.jingle('rare');
    await wait(1.2);
    setMega(baseId, true);
    await revealCard({ kind: 'swarm', id: megaId, copies: 1, isNew: true }, { side: true, tapText: 'Tap to continue' });
    animate(0.4, (e) => mega.root.scale.setScalar(1 - e), { onComplete: () => this.scene.remove(mega.root) });
    this.scene.remove(light);
    this.interaction = null;
    this.jimmy.play('idle');
    audio.music('lab');
    await this.camHome(0.7);
    this.busy = false;
    this.hideHub(false);
  }
}

function isChild(obj, root) {
  let o = obj;
  while (o) {
    if (o === root) return true;
    o = o.parent;
  }
  return false;
}
