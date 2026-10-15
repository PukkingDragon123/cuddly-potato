// The Beast Lab: where every new Commander starts.
//
//   intro      -> camera opens on the Beast Tiger's tank, Jimmy pops up, asks
//                 your name and hands you your FIRST PACK on the workbench
//                 (scenes/vialOpen.js, back here with step 'afterPack')
//   afterPack  -> "those cards are your deck" -> BATTLE JIMMY! (tutorial battle)
//   won        -> (tutorial won) Jimmy shows off the MEGA containment tube,
//                 then off to Beast Island (home)
//   visit      -> later visits from home: wander-free lab with Jimmy's lines
//
// The room is a bubbly toy lab: bubbling tubes along the walls, glowing
// neon, the specimen tank with the Beast Tiger, a MEGA-TECH containment tube
// with Panthar floating inside, consoles, monitors and pipes.
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { animate } from '../core/tween.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { createSwarm } from '../models/swarmModels.js';
import * as Props from '../models/props.js';
import { makeVial } from '../models/props/vials.js';
import { glassMat } from '../models/props/common.js';
import { h, button, say, speech, modal, pointAt, $ui, closeDialogue } from '../ui/ui.js';
import { charPortrait } from '../ui/thumbs.js';
import { state, rollVial, applyVial, setDeck } from '../game/state.js';
import { STARTER_TROOPS } from '../data/cards.js';
import { game } from '../game/game.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const glow = (c, k = 2.4, opacity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });

const CSS = `
.lb-wrap { position: absolute; inset: 0; pointer-events: none; }
.lb-cta { position: absolute; left: 0; right: 0; bottom: calc(var(--safe-b) + 14%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 2); pointer-events: none; }
.lb-cta > * { pointer-events: auto; }
.lb-cta .btn { animation: btnPulse 1.1s ease-in-out infinite; }
.lb-back { position: absolute; left: calc(var(--safe-l) + var(--u) * 3); top: calc(var(--safe-t) + var(--u) * 3); pointer-events: auto; }
.lb-name { display: flex; flex-direction: column; gap: calc(var(--u) * 2); align-items: stretch; }
.lb-name input {
  font-family: var(--font-d); font-size: 1.4em; text-align: center; padding: 0.3em 0.5em; color: var(--ink); background: #fff;
  border: none; outline: none; box-shadow: 0 0 0 var(--px) var(--ink), inset 0 calc(var(--px) * 2) 0 #d8e4ff; border-radius: calc(var(--u) * 2);
}
`;

const JIMMY_LINES = [
  'Have you subscribed? ...to the Lab newsletter.',
  'I once spent 50 hours inside that tank. Long story.',
  'Fun fact: Swarms LOVE chocolate.',
  'The Tiger is fine. Totally fine. Do NOT tap the glass.',
  'That MEGA tube hums at night. I sleep with the lights on now.',
  'Every Swarm is hand-shaken with love.',
  "Don't tell Nolan, but his Belly Flop is kinda OP.",
  'Upgrade your base early - a tent will NOT stop a Steel Panther.',
];

/** Neon sign: glowing tube letters on a dark backing board (redrawn once the pixel font loads). */
function neonSign(text, color = '#ff2e88', w = 1024, hgt = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    ctx.clearRect(0, 0, w, hgt);
    ctx.font = `${Math.round(hgt * 0.78)}px "Jersey 10", "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // soft halo, coloured tube, white-hot core
    ctx.shadowColor = color;
    ctx.shadowBlur = hgt * 0.12;
    ctx.strokeStyle = color;
    ctx.lineWidth = hgt * 0.07;
    ctx.strokeText(text, w / 2, hgt / 2 + hgt * 0.04);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff6fb';
    ctx.fillText(text, w / 2, hgt / 2 + hgt * 0.04);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load?.(`${Math.round(hgt * 0.78)}px "Jersey 10"`).then(draw).catch(() => {});
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1.9, 1.9, 1.9) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w / hgt, 1), mat);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w / hgt + 0.3, 1.15, 0.08), new THREE.MeshStandardMaterial({ color: 0x120c24, roughness: 0.6 }));
  board.position.z = -0.06;
  const root = new THREE.Group();
  root.add(board, m);
  root.material = mat;
  return root;
}

/** A glass tube of glowing liquid with bubbles rising through it. */
function bubbleTube(color, H = 2.6, R = 0.34) {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a93aa, roughness: 0.35, metalness: 0.7 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.1, R + 0.14, 0.26, 18), metal);
  base.position.y = 0.13;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.08, 0.2, 18), metal);
  cap.position.y = H + 0.36;
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, H * 0.86, 18), glow(color, 1.15, 0.72));
  liquid.position.y = 0.26 + (H * 0.86) / 2;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 18, 1, true), glassMat(0xd8f8ff, 0.22));
  glass.position.y = 0.26 + H / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.035, 6, 20).rotateX(Math.PI / 2), glow(color, 2.6));
  ring.position.y = 0.3 + H * 0.86;
  root.add(base, liquid, glass, cap, ring);
  const bubbles = [];
  const bMat = glow(0xeaffff, 1.6, 0.8);
  for (let i = 0; i < 9; i++) {
    const s = 0.04 + Math.random() * 0.05;
    const b = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), bMat);
    b.userData = { a: Math.random() * 6.28, r: Math.random() * (R - 0.1), sp: 0.35 + Math.random() * 0.6, ph: Math.random() * 6 };
    b.position.y = 0.3 + Math.random() * H * 0.8;
    root.add(b);
    bubbles.push(b);
  }
  let t = 0;
  return {
    root,
    update(dt) {
      t += dt;
      for (const b of bubbles) {
        const u = b.userData;
        b.position.y += dt * u.sp;
        if (b.position.y > 0.26 + H * 0.84) b.position.y = 0.32;
        b.position.x = Math.cos(u.a) * u.r + Math.sin(t * 3 + u.ph) * 0.03;
        b.position.z = Math.sin(u.a) * u.r;
      }
      ring.material.opacity = 1;
      liquid.material.opacity = 0.66 + Math.sin(t * 2 + R * 10) * 0.06;
    },
  };
}

export class LabScene {
  constructor() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x14205a);
    scene.fog = new THREE.Fog(0x14205a, 20, 42);
    this.camera = new THREE.PerspectiveCamera(42, engine.aspect, 0.1, 100);
    addLights(scene, { hemi: 1.6, sun: 2.0, dir: [4, 10, 7], shadowExtent: 11, sky: 0xe6f3ff, ground: 0x5a5a7a });
    const pink = new THREE.PointLight(0xff2e88, 9, 13);
    pink.position.set(-6.5, 4, -2);
    const blue = new THREE.PointLight(0x29b6f6, 9, 13);
    blue.position.set(6.5, 4, -2);
    scene.add(pink, blue);
    this.t = 0;
    this.updaters = [];
    this.benchPos = new THREE.Vector3(0, 0.9, 1.6);
    this.camPos = new THREE.Vector3(0, 2.7, 7.6);
    this.camLook = new THREE.Vector3(0, 1.55, -0.6);
    this.tigerTaps = 0;
    this.buildRoom();
  }

  // -------------------------------------------------------------------------
  buildRoom() {
    const s = this.scene;
    const P = (name, ...args) => {
      try { return typeof Props[name] === 'function' ? Props[name](...args) : null; } catch (e) { console.warn('prop failed', name, e); return null; }
    };
    const place = (o, x, y, z, ry = 0, sc = 1) => {
      if (!o) return null;
      o.position.set(x, y, z);
      o.rotation.y = ry;
      o.scale.multiplyScalar(sc);
      s.add(o);
      return o;
    };
    // floor + walls
    const floor = P('makeFloorTiles', 22, 16);
    if (floor) { floor.position.z = -1; floor.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }); s.add(floor); }
    const back = P('makeWallPanel', 22, 7.5);
    if (back) { back.position.set(0, 0, -8); s.add(back); }
    for (const side of [-1, 1]) {
      const w = P('makeWallPanel', 16, 7.5);
      if (!w) continue;
      w.rotation.y = side * -Math.PI / 2;
      w.position.set(side * 10, 0, -1);
      s.add(w);
    }
    // neon signs
    const sign = neonSign('BEAST LAB', '#ff2e88');
    sign.scale.setScalar(1.15);
    sign.position.set(0, 6.85, -7.85);
    s.add(sign);
    const sign2 = neonSign('MEGA-TECH', '#ffd84a', 512, 128);
    sign2.scale.setScalar(0.62);
    sign2.position.set(-5.6, 5.25, -5.9);
    s.add(sign2);
    this.signs = [sign, sign2];

    // the Beast Tiger's specimen tank (back centre)
    const tank = P('makeTank');
    this.tankPos = new THREE.Vector3(0, 0, -4.6);
    if (tank) {
      tank.root.position.copy(this.tankPos);
      tank.root.scale.setScalar(1.15);
      s.add(tank.root);
      for (const part of [tank.liquid, tank.glass]) part?.traverse?.((o) => { if (o.material?.transparent) o.material.opacity = Math.min(o.material.opacity, part === tank.liquid ? 0.16 : 0.2); });
      this.updaters.push((dt) => tank.update(dt));
    }
    this.tiger = createSwarm('beastTiger', { scale: 1.25 });
    this.tiger.root.position.set(0, 1.4, -4.5);
    this.tiger.root.rotation.y = 0.35;
    s.add(this.tiger.root);
    const tankLight = new THREE.PointLight(0x29e0ff, 7, 9);
    tankLight.position.set(0, 3, -3.4);
    s.add(tankLight);
    this.tankLight = tankLight;

    // MEGA containment tube (back left) with Panthar floating inside
    const megaTank = P('makeTank', { color: 0xff2ea8 });
    this.megaPos = new THREE.Vector3(-5.6, 0, -5.4);
    if (megaTank) {
      megaTank.root.position.copy(this.megaPos);
      megaTank.root.scale.setScalar(0.95);
      s.add(megaTank.root);
      for (const part of [megaTank.liquid, megaTank.glass]) part?.traverse?.((o) => { if (o.material?.transparent) o.material.opacity = Math.min(o.material.opacity, part === megaTank.liquid ? 0.22 : 0.2); });
      this.updaters.push((dt) => megaTank.update(dt));
    }
    try {
      this.panthar = createSwarm('panthar', { scale: 1.05 });
      this.panthar.root.position.set(this.megaPos.x, 1.1, this.megaPos.z);
      this.panthar.root.rotation.y = 0.55;
      this.panthar.setState('idle');
      s.add(this.panthar.root);
    } catch (e) { this.panthar = null; }
    const megaLight = new THREE.PointLight(0xff2ea8, 7, 8);
    megaLight.position.set(this.megaPos.x + 1, 3, this.megaPos.z + 1.6);
    s.add(megaLight);
    this.megaLight = megaLight;

    // bubbling tubes along the walls
    const tubeCols = [0x29e0ff, 0xff2ea8, 0x7cff3a, 0xffd23f, 0xb05cff, 0x29e0ff];
    const tubeSpots = [[-9.2, -6.6], [-9.2, -4.6], [9.2, -6.6], [9.2, -4.6], [3.6, -7.3], [-2.7, -7.3]];
    tubeSpots.forEach(([x, z], i) => {
      const tb = bubbleTube(tubeCols[i], 2.4 + (i % 3) * 0.4, 0.32 + (i % 2) * 0.06);
      tb.root.position.set(x, 0, z);
      s.add(tb.root);
      this.updaters.push(tb.update);
    });
    // small tube cluster on the shelf side
    for (let i = 0; i < 4; i++) {
      const tb = bubbleTube(tubeCols[(i + 2) % tubeCols.length], 0.9, 0.16);
      tb.root.position.set(6.4 + i * 0.42, 0.95, -3.0 - (i % 2) * 0.3);
      s.add(tb.root);
      this.updaters.push(tb.update);
    }

    // furniture
    place(P('makeMonitorWall'), 5.4, 0, -7.4);
    place(P('makeConsole'), -3.2, 0, -3.2, 0.55);
    place(P('makeComputer'), 6.6, 0, -3.4, -0.5);
    place(P('makePipes', 8), -7.8, 0, -7.2, Math.PI / 2);
    place(P('makePipes', 8), 7.8, 0, -7.2, -Math.PI / 2);
    place(P('makeLabShelf'), -9, 0, -1.5, Math.PI / 2);
    place(P('makeVialRack'), 9, 0, -1.2, -Math.PI / 2);
    this.door = place(P('makeLabDoor'), -9.7, 0, 2, Math.PI / 2);
    // workbench where the first pack waits
    place(P('makeLabDesk'), this.benchPos.x, 0, this.benchPos.z);
    place(P('makeMug'), this.benchPos.x - 1.0, this.benchPos.y, this.benchPos.z + 0.38, 0.4, 1.2);
    // ceiling light strips
    for (let i = -2; i <= 2; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.4), glow(0xdff6ff, 1.9));
      l.position.set(i * 3.8, 7.3, -2);
      s.add(l);
    }
    // neon trims along the walls (pink baseboard, cyan chair rail) for that bubbly lab glow
    const trim = (w, y, col, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.05), glow(col, 2.1));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      s.add(m);
    };
    trim(19.6, 0.16, 0xff2e88, 0, -7.9, 0);
    trim(19.6, 3.9, 0x29e0ff, 0, -7.9, 0);
    for (const side of [-1, 1]) {
      trim(15.6, 0.16, 0xff2e88, side * 9.9, -1, Math.PI / 2);
      trim(15.6, 3.9, 0x29e0ff, side * 9.9, -1, Math.PI / 2);
    }
    // glowing floor strip to the bench
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 7).rotateX(-Math.PI / 2), glow(0x29e0ff, 2.2, 0.85));
    strip.position.set(-0.9, 0.02, -1.6);
    const strip2 = strip.clone();
    strip2.position.x = 0.9;
    s.add(strip, strip2);

    // characters
    this.jimmy = new Chibi(CHARACTERS.jimmy, { scale: 1.05 });
    this.jimmy.root.position.set(-2.2, 0, 1.0);
    this.jimmy.root.rotation.y = 0.35;
    s.add(this.jimmy.root);
    this.tech = new Chibi(CHARACTERS.labTech, { scale: 0.95 });
    this.tech.root.position.set(-3.9, 0, -2.3);
    this.tech.root.rotation.y = 2.5;
    this.tech.play('talk');
    s.add(this.tech.root);
    this.techT = 3;
  }

  // -------------------------------------------------------------------------
  async enter(params = {}) {
    this.params = params;
    if (!document.getElementById('lb-css')) document.head.appendChild(h('style', { id: 'lb-css' }, CSS));
    this.ui = h('div', { class: 'lb-wrap' });
    $ui().appendChild(this.ui);
    audio.music('lab');
    this.resize(engine.width, engine.height);
    this.onDown = (e) => this.tap(e);
    engine.canvas.addEventListener('pointerdown', this.onDown);
    const p = state.p;
    const step = params.step ?? (params.from === 'vial' ? 'afterPack' : null);
    // (story steps start after the scene transition - never await them inside enter())
    const run = (fn) => setTimeout(() => !this.dead && fn.call(this), 450);
    if (step === 'afterPack') run(this.afterPack);
    else if (step === 'won' || p.tutorial === 'briefcase') run(this.won);
    else if (p.tutorial === 'done' || p.tutorial === 'home') run(this.visit);
    else if (p.tutorial === 'pack' || p.tutorial === 'battle') run(this.afterPack);
    else run(this.intro);
  }

  exit() {
    this.dead = true;
    engine.canvas.removeEventListener('pointerdown', this.onDown);
    this.removePtr?.();
    clearTimeout(this.chatT);
    closeDialogue();
  }

  /** Dialogue that goes inert once this scene has exited. */
  say(text, eyes = 'happy', mouth = 'grin', opts) {
    if (this.dead) return new Promise(() => {});
    return say({ name: 'Jimmy', color: '#2b8cf2', portrait: charPortrait('jimmy', { eyes, mouth }), chibi: this.jimmy }, text, opts);
  }

  camTo(pos, look, dur = 0.9) {
    const p0 = this.camPos.clone(), l0 = this.camLook.clone();
    return animate(dur, (e) => {
      this.camPos.lerpVectors(p0, pos, e);
      this.camLook.lerpVectors(l0, look, e);
    }, { ease: 'inOutCubic' }).promise;
  }
  /** Default framing: the whole lab, pulled back further in portrait. */
  homeShot() {
    const port = this.camera.aspect < 1;
    return { pos: new THREE.Vector3(0, port ? 3.6 : 2.8, port ? 10.6 : 7.8), look: new THREE.Vector3(0, port ? 1.9 : 1.6, -0.8) };
  }
  camHome(dur = 0.9) {
    const s = this.homeShot();
    return this.camTo(s.pos, s.look, dur);
  }

  // -------------------------------------------------------------------------
  // Story

  async intro() {
    const j = this.jimmy;
    // dramatic open: start on the tank
    this.camPos.set(1.2, 2.6, 0.4);
    this.camLook.set(0, 2.1, -4.6);
    j.root.visible = false;
    audio.play('bubble');
    fx.bubbles(new THREE.Vector3(0, 1.2, -3.4), { count: 30, color: 0xcff2ff, radius: 1.2, speed: 1.6 });
    await wait(1.1);
    this.tiger.attack(0.8);
    audio.play('growl', { pitch: 0.8 });
    await wait(0.8);
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
    await this.say('Whoa, a new recruit! Welcome to the *BEAST LAB*, where we make the craziest creatures on the planet!');
    j.play('point');
    await this.say("See the big guy in the tank? That's the *Beast Tiger*. Don't tap the glass. Seriously. He hates that.", 'side', 'smirk');
    j.play('talk');
    await this.say('First things first... what should I call you?');
    await this.askName();
    j.play('cheer', { dur: 1.2, then: 'idle' });
    await this.say(`Nice to meet you, *${state.p.name}*! Every Swarm starts inside a *Lab Pack*... and I've got one with YOUR name on it.`, 'star', 'grin');
    // the first pack appears on the bench
    j.play('present');
    this.showBenchVial();
    const port = this.camera.aspect < 1;
    await this.camTo(new THREE.Vector3(0.6, this.benchPos.y + (port ? 2.6 : 1.5), this.benchPos.z + (port ? 5.2 : 3.4)), this.benchPos.clone().setY(this.benchPos.y + 0.45), 1.1);
    await this.say('Your *FIRST PACK*! Add water, give it a shake and POP it open. Your first Swarms are inside!');
    state.p.tutorial = 'pack';
    state.save();
    await this.cta('OPEN YOUR FIRST PACK!', 'pink', 'vial');
    audio.play('cork');
    this.openFirstPack();
  }

  openFirstPack() {
    const res = rollVial('starter', { fixed: { cards: STARTER_TROOPS.map((id) => ({ id, copies: 3, variant: 'base' })) } });
    game.go('vialopen', { type: 'starter', result: res, source: 'reward', back: 'lab', backParams: { step: 'afterPack' } });
  }

  async afterPack() {
    const p = state.p;
    // make sure the starter deck is owned even if the vial screen was skipped
    if (!STARTER_TROOPS.every((id) => p.cards[id])) applyVial(rollVial('starter', { fixed: { cards: STARTER_TROOPS.map((id) => ({ id, copies: 2, variant: 'base' })) } }));
    setDeck(STARTER_TROOPS.slice());
    p.tutorial = 'pack';
    state.save();
    const j = this.jimmy;
    const s = this.homeShot();
    this.camPos.copy(s.pos);
    this.camLook.copy(s.look);
    j.play('cheer', { dur: 1.2, then: 'idle' });
    j.expr('happy', 'grin', 3);
    fx.confetti(new THREE.Vector3(j.root.position.x, 2.6, j.root.position.z), { count: 40 });
    await wait(0.5);
    await this.say("LOOK at them! A *Panther* and a *Clogged Toilet*: your very first *lineup*. Win battles and climb the *Trophy Road* to unlock way more Swarms!", 'star', 'grin');
    j.play('point');
    j.expr('determined', 'smirk');
    await this.say("Now... think you can beat ME? First one to *smash the other's base* wins. Don't worry, I'll go easy on you. Probably.", 'determined', 'smirk');
    await this.cta('BATTLE JIMMY!', 'yellow', 'swords');
    p.tutorial = 'battle';
    state.save();
    audio.play('go');
    game.go('battle', { mode: 'tutorial' });
  }

  async won() {
    const j = this.jimmy;
    const s = this.homeShot();
    this.camPos.copy(s.pos);
    this.camLook.copy(s.look);
    j.play('shocked');
    j.expr('shock', 'open', 3);
    await wait(0.5);
    await this.say("NO WAY! You actually beat me?! That MEGA sure helped... speaking of which, come look at this.", 'shock', 'open');
    // show the MEGA containment tube
    const mp = this.megaPos;
    await this.camTo(new THREE.Vector3(mp.x + 2.4, 2.6, mp.z + 5.4), new THREE.Vector3(mp.x, 2.2, mp.z), 1.2);
    audio.play('heartbeat');
    this.panthar?.attack(0.7);
    fx.bubbles(new THREE.Vector3(mp.x, 1.5, mp.z + 0.8), { count: 40, color: 0xffb0e0, radius: 1, speed: 2 });
    await this.say('That is a *MEGA-TECH MUTATOR*: Panthar. The ultimate Swarm. In battle your *MEGA* charges up as you deal damage, then BOOM - it breaks out of its tube!', 'star', 'grin');
    await this.say('You need at least a *Trailer Lab* base to unleash one, and only ONCE per battle. Climb the *Trophy Road* to *300 trophies* and Panthar is YOURS.', 'happy', 'grin');
    await this.camHome(1);
    j.play('cheer', { dur: 1.2, then: 'idle' });
    await this.say('Okay, enough lab talk! Come with me - I want to show you *BEAST ISLAND*...', 'happy', 'grin');
    state.p.tutorial = 'home';
    state.save();
    game.go('home');
  }

  visit() {
    const s = this.homeShot();
    this.camPos.copy(s.pos);
    this.camLook.copy(s.look);
    this.jimmy.play('wave');
    this.ui.appendChild(h('div', { class: 'lb-back' }, button('ISLAND', () => game.go('home'), 'blue', { icon: 'island' })));
    const chat = () => {
      if (this.dead) return;
      speech(this.jimmy, JIMMY_LINES[Math.floor(Math.random() * JIMMY_LINES.length)], 3.2, { offsetY: 2.4 });
      this.chatT = setTimeout(chat, 9000 + Math.random() * 6000);
    };
    this.chatT = setTimeout(chat, 700);
  }

  // -------------------------------------------------------------------------

  async askName() {
    const input = h('input', { type: 'text', maxlength: '14', value: state.p.name && state.p.name !== 'Recruit' ? state.p.name : '', placeholder: 'Your name' });
    return new Promise((resolve) => {
      const done = () => {
        const v = input.value.trim().replace(/[<>]/g, '').slice(0, 14);
        state.p.name = v || 'Recruit';
        state.save();
        m.close();
      };
      const m = modal({
        title: 'YOUR NAME', color: 'blue', size: 'narrow', closable: false,
        body: h('div', { class: 'lb-name' }, input),
        foot: button("THAT'S ME!", done, 'green lg', { icon: 'check' }),
        onClose: () => resolve(),
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
      setTimeout(() => input.focus(), 200);
    });
  }

  /** Big call-to-action button; resolves when pressed. */
  cta(label, color = 'pink', ic = 'play') {
    return new Promise((resolve) => {
      if (this.dead) return;
      const wrap = h('div', { class: 'lb-cta' });
      const btn = button(label, () => { this.removePtr?.(); this.removePtr = null; wrap.remove(); resolve(); }, `${color} lg`, { icon: ic });
      wrap.appendChild(btn);
      this.ui.appendChild(wrap);
      this.removePtr = pointAt(btn, '');
      this.ctaResolve = () => btn.click();
    });
  }

  showBenchVial() {
    if (this.vial) return;
    try {
      const v = makeVial('starter');
      v.root.position.copy(this.benchPos);
      v.root.scale.setScalar(0.9);
      this.scene.add(v.root);
      this.vial = v;
      v.root.scale.setScalar(0.01);
      animate(0.5, (e) => v.root.scale.setScalar(0.01 + 0.89 * e), { ease: 'outBack' });
    } catch (e) {
      console.warn('vial model failed', e);
    }
    audio.play('pop');
    fx.sparkle(this.benchPos.clone().setY(this.benchPos.y + 0.6), { count: 40, colors: [0xffffff, 0xffd84a, 0xff7ac0], speed: 3 });
    const spot = new THREE.SpotLight(0xffffff, 22, 7, 0.4, 0.6);
    spot.position.set(this.benchPos.x, 5, this.benchPos.z + 1);
    spot.target.position.copy(this.benchPos);
    this.scene.add(spot, spot.target);
  }

  // -------------------------------------------------------------------------
  tap(e) {
    // tapping the Beast Tiger's tank (he hates that)
    const ray = new THREE.Raycaster();
    const r = engine.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hitTiger = ray.intersectObject(this.tiger.root, true).length > 0;
    if (hitTiger) {
      this.tigerTaps++;
      this.tiger.attack(0.8);
      this.tiger.boing(0.5);
      audio.play('growl', { pitch: 0.7 + Math.random() * 0.3 });
      engine.shake(0.2);
      fx.bubbles(new THREE.Vector3(0, 1.4, -3.6), { count: 20, color: 0xcff2ff, radius: 1, speed: 2 });
      if (this.tigerTaps === 3) this.jimmy.expr('shock', 'open', 2);
      return;
    }
    if (this.vial && this.ctaResolve && ray.intersectObject(this.vial.root, true).length) this.ctaResolve();
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.fov = w / hh < 1 ? 60 : 42;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    for (const u of this.updaters) u(dt);
    this.tiger.update(dt);
    this.tiger.root.position.y = 1.4 + Math.sin(this.t * 1.2) * 0.08;
    if (this.panthar) {
      this.panthar.update(dt);
      this.panthar.root.position.y = 1.1 + Math.sin(this.t * 0.9 + 1) * 0.1;
      this.panthar.root.rotation.y = 0.55 + Math.sin(this.t * 0.4) * 0.15;
    }
    this.jimmy.update(dt);
    this.tech.update(dt);
    this.vial?.update?.(dt);
    if (this.vial) this.vial.root.rotation.y += dt * 0.6;
    this.techT -= dt;
    if (this.techT <= 0) {
      this.techT = 3 + Math.random() * 4;
      this.tech.play(['talk', 'point', 'idle', 'facepalm'][Math.floor(Math.random() * 4)]);
    }
    // flickery neon + pulsing tank lights
    this.signs[0].material.color.setScalar(Math.random() < 0.012 ? 0.5 : 1.9);
    this.tankLight.intensity = 7 + Math.sin(this.t * 2) * 1.2;
    this.megaLight.intensity = 6 + Math.sin(this.t * 3.1) * 2;
    if (Math.random() < dt * 1.5) fx.bubbles(new THREE.Vector3((Math.random() - 0.5) * 14, 0.2, -2 - Math.random() * 4), { count: 2, color: [0x9ff2ff, 0xffb0e0, 0xc8ff9a][Math.floor(Math.random() * 3)], speed: 0.8 });
    const c = this.camera;
    c.position.copy(this.camPos);
    c.position.x += Math.sin(this.t * 0.3) * 0.08;
    c.lookAt(this.camLook);
  }
}
