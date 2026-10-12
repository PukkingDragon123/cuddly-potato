// Title screen + first-time flow.
//
// The stage is the Beast Lab diorama (the first arena of Beast Island) with
// the starter Swarms dancing in front of it and Jimmy waving. New players:
//   start      -> Jimmy's intro -> tutorial battle (scenes/battle.js)
//   briefcase  -> (won the tutorial) Jimmy hands over the Starter Tube -> vial opening
//   starterDone-> "those Swarms are yours" -> Beast Island home (tutorial 'home')
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { createSwarm } from '../models/swarmModels.js';
import { makeArenaZone } from '../models/arenas/index.js';
import { skyTexture, paintClouds, paintSun, paintRidge } from '../models/arenas/kit.js';
import { h, $ui, say, icon, closeDialogue } from '../ui/ui.js';
import { charPortrait } from '../ui/thumbs.js';
import { state, rollVial, applyVial, setDeck } from '../game/state.js';
import { STARTER_DECK } from '../data/cards.js';
import { game } from '../game/game.js';

const CSS = `
.tt-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between; pointer-events: none;
  padding: calc(var(--safe-t) + var(--u) * 6) calc(var(--u) * 3) calc(var(--safe-b) + var(--u) * 5); }
.tt-logo { position: relative; text-align: center; font-family: var(--font-d); line-height: 0.82; animation: ttDrop 0.7s cubic-bezier(.2, 1.4, .4, 1) both; }
.tt-logo .l1 { font-size: calc(var(--u) * 13); color: #fff; letter-spacing: 0.04em; text-shadow: var(--outline), 0 calc(var(--px) * 4) 0 #ff2e88, 0 calc(var(--px) * 6) 0 var(--ink); }
.tt-logo .l2 { font-size: calc(var(--u) * 19); letter-spacing: 0.02em; color: #ffd84a; text-shadow: var(--outline), 0 calc(var(--px) * 4) 0 #d8861a, 0 calc(var(--px) * 7) 0 var(--ink); }
.tt-logo .l2 span { display: inline-block; animation: ttBounce 2.2s ease-in-out infinite; }
.tt-logo .bolt { position: absolute; width: calc(var(--u) * 14); height: calc(var(--u) * 14); right: calc(var(--u) * -6); top: calc(var(--u) * -4); rotate: 14deg; filter: drop-shadow(0 calc(var(--px) * 2) 0 var(--ink)); animation: ttZap 1.6s steps(2) infinite; }
.tt-logo .tag { display: inline-block; margin-top: calc(var(--u) * 2.4); padding: 0.15em 0.8em 0.25em; font-size: calc(var(--u) * 4.6); color: #fff; text-shadow: var(--outline-thin);
  background: #2b8cf2; box-shadow: 0 0 0 var(--px) var(--ink), inset 0 calc(var(--px) * -2) 0 #1a52b0, inset 0 var(--px) 0 #8fd4ff; transform: rotate(-3deg); }
@keyframes ttDrop { 0% { transform: translateY(-60%) scale(1.6); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes ttBounce { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-0.12em); } 90% { transform: translateY(0.02em); } }
@keyframes ttZap { 50% { filter: drop-shadow(0 calc(var(--px) * 2) 0 var(--ink)) brightness(1.5); } }
.tt-start { font-family: var(--font-d); font-size: calc(var(--u) * 7.5); text-shadow: var(--outline); animation: btnPulse 1.1s ease-in-out infinite; }
.tt-foot { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 2); }
.tt-disc { font-size: 0.62em; color: #dfe8ff; text-align: center; max-width: calc(var(--u) * 120); text-shadow: var(--outline-thin); opacity: 0.85; }
`;

export class TitleScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, engine.aspect, 0.1, 600);
    this.t = 0;
    this.actors = [];
    this.camMode = 'title';
  }

  async enter(params = {}) {
    this.params = params;
    const s = this.scene;
    const Z = await makeArenaZone('lab');
    this.zone = Z;
    s.add(Z.root);
    s.background = skyTexture('title', [[0, 0x2f9fff], [0.5, 0x8fdcff], [0.72, 0xd8f4ff], [1, 0x6fcf5a]], (ctx, w, h) => {
      paintSun(ctx, w * 0.8, h * 0.18, 6);
      paintClouds(ctx, w, h, { n: 6, y0: 6, y1: h * 0.4, size: 6, seed: 7 });
      paintRidge(ctx, w, h, { base: 0.7, amp: 8, freq: 0.06, seed: 3, color: 0x6aa4d8, rim: 0xb8d8f8, dark: 0x5a86c0, snow: 0xf2f8ff, peaks: true });
    }, { w: 120, h: 160 });
    s.fog = new THREE.Fog(0xbfe8ff, 30, 90);
    addLights(s, { sky: 0xdff0ff, ground: 0x7a8a6a, hemi: 1.2, sun: 2.3, dir: [-8, 16, 12], shadowExtent: 14, rim: 1.0 });
    // ground disc so the diorama isn't floating
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5cc24a }));
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    s.add(ground);
    this.focus = new THREE.Vector3(...(Z.focus ?? [0, 1, 0]));
    // the starter squad dancing in front of the Lab
    const ids = ['panther', 'cloggedToilet', 'fryFiend', 'trashedCan', 'pizzaSlicer', 'toiletRollRipper'];
    const spots = [[-1.7, 5.9], [1.7, 5.9], [-3.1, 5.2], [3.1, 5.2], [-4.4, 4.4], [4.4, 4.4]];
    ids.forEach((id, i) => {
      const rig = createSwarm(id, { scale: 1.15 });
      const [x, z] = spots[i];
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = -x * 0.08;
      rig.setState('dance');
      rig.danceT = i * 0.4;
      s.add(rig.root);
      this.actors.push({ rig, i });
    });
    // Jimmy
    this.jimmy = new Chibi(CHARACTERS.jimmy, { scale: 1.25 });
    this.jimmy.root.position.set(0, 0, 6.6);
    this.jimmy.root.rotation.y = 0;
    this.jimmy.play('wave');
    s.add(this.jimmy.root);
    this.placeCam(true);
    // UI
    if (!document.getElementById('tt-css')) document.head.appendChild(h('style', { id: 'tt-css' }, CSS));
    const name = 'SWARMERS';
    this.ui = h('div', { class: 'tt-wrap' },
      h('div', { class: 'tt-logo' },
        h('div', { class: 'l1' }, 'MrBeast'),
        h('div', { class: 'l2' }, [...name].map((ch, i) => h('span', { style: { animationDelay: `${i * 0.08}s` } }, ch))),
        h('img', { class: 'bolt', src: iconURL_bolt() }),
        h('div', { class: 'tag' }, 'BEAST ISLAND')),
      h('div', { class: 'tt-foot' },
        this.startEl = h('div', { class: 'tt-start' }, 'TAP TO PLAY'),
        h('div', { class: 'tt-disc' }, 'Unofficial fan-made game. Not affiliated with MrBeast or Moose Toys. MrBeast Lab Swarms are toys by Moose Toys.')));
    $ui().appendChild(this.ui);
    audio.music('title');
    // where in the first-time flow are we?
    const p = state.p;
    if (params.tutorial === 'starterDone' || (params.from === 'vial' && p.tutorial === 'briefcase')) return this.starterDone();
    if (params.tutorial === 'briefcase' || p.tutorial === 'briefcase') return this.briefcase();
    this.onTap = (e) => {
      e.preventDefault();
      engine.canvas.removeEventListener('pointerdown', this.onTap);
      this.ui.removeEventListener('pointerdown', this.onTap);
      audio.unlock();
      audio.play('go');
      this.start();
    };
    engine.canvas.addEventListener('pointerdown', this.onTap);
    this.ui.style.pointerEvents = 'auto';
    this.ui.addEventListener('pointerdown', this.onTap);
  }

  placeCam(snap = false) {
    const a = this.camera.aspect;
    let pos, look;
    if (this.camMode === 'jimmy') {
      const j = this.jimmy.root.position;
      look = new THREE.Vector3(j.x, j.y + (a < 1 ? 1.2 : 1.7), j.z);
      pos = look.clone().add(new THREE.Vector3(0.9, 0.9, 6.5).multiplyScalar(a < 1 ? 1.45 : 1));
    } else {
      look = this.focus.clone().add(new THREE.Vector3(0, a < 1 ? 2.6 : 3.4, 2.5));
      const d = a < 1 ? 26 : 21;
      pos = look.clone().add(new THREE.Vector3(Math.sin(this.t * 0.08) * 4, d * 0.32, d));
    }
    this.camTo = { pos, look };
    if (snap || !this.camAt) this.camAt = { pos: pos.clone(), look: look.clone() };
  }

  async start() {
    const p = state.p;
    if (p.tutorial === 'done' || p.tutorial === 'home') {
      game.go('home');
      return;
    }
    // first time: Jimmy's welcome, then the tutorial battle
    this.ui.style.display = 'none';
    this.camMode = 'jimmy';
    this.jimmy.play('wave');
    this.jimmy.expr('happy', 'grin', 4);
    const J = { name: 'Jimmy', color: '#2b8cf2', portrait: charPortrait('jimmy', { eyes: 'happy', mouth: 'grin' }), chibi: this.jimmy };
    await wait(0.8);
    await say(J, "Hey! Welcome to the *MrBeast Lab*! I'm Jimmy. We've been growing something AMAZING in here...");
    this.jimmy.play('point');
    await say(J, "*Lab Swarms*! Tiny mutant toy monsters that come out of these test tubes. Each one is different, and they LOVE to battle.");
    await say(J, "You look like you could be a great *Commander*. Let's see what you've got - I challenge you to a battle!");
    this.jimmy.play('cheer');
    await wait(0.4);
    p.tutorial = 'start';
    state.save();
    game.go('battle', { mode: 'tutorial' });
  }

  async briefcase() {
    this.ui.style.display = 'none';
    this.camMode = 'jimmy';
    this.jimmy.play('holdUp');
    this.jimmy.expr('shock', 'open', 3);
    const J = { name: 'Jimmy', color: '#2b8cf2', portrait: charPortrait('jimmy', { eyes: 'star', mouth: 'grin' }), chibi: this.jimmy };
    await wait(0.8);
    await say(J, "That was INSANE! Okay, a deal's a deal. You won, so you get your very own *Starter Tube* full of Swarms!");
    await say(J, 'Add water, give it a shake... and meet your new team!');
    const res = rollVial('starter', { fixed: { cards: STARTER_DECK.map((id, i) => ({ id, copies: i < 4 ? 3 : 2, variant: 'base' })) } });
    game.go('vialopen', { type: 'starter', result: res, source: 'reward', back: 'title', backParams: { tutorial: 'starterDone' } });
  }

  async starterDone() {
    const p = state.p;
    // make sure the starter deck is owned even if the vial screen was skipped
    if (!STARTER_DECK.every((id) => p.cards[id])) applyVial(rollVial('starter', { fixed: { cards: STARTER_DECK.map((id) => ({ id, copies: 2, variant: 'base' })) } }));
    setDeck(STARTER_DECK.slice());
    this.ui.style.display = 'none';
    this.camMode = 'jimmy';
    this.jimmy.play('cheer');
    this.jimmy.expr('happy', 'grin', 4);
    const J = { name: 'Jimmy', color: '#2b8cf2', portrait: charPortrait('jimmy', { eyes: 'happy', mouth: 'grin' }), chibi: this.jimmy };
    await wait(0.6);
    await say(J, "They're all yours! Those 8 cards are your first *deck*. Now come with me - I want to show you *BEAST ISLAND*...");
    p.tutorial = 'home';
    state.save();
    game.go('home');
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this.placeCam(true);
  }

  update(dt) {
    this.t += dt;
    this.zone?.update?.(dt, this.t);
    for (const a of this.actors) {
      a.rig.update(dt);
      if (Math.random() < dt * 0.15) { a.rig.attack(0.5); a.rig.boing(0.4); }
    }
    this.jimmy?.update(dt);
    if (Math.random() < dt * 0.6) fx.sparkle(new THREE.Vector3((Math.random() - 0.5) * 10, 0.5 + Math.random() * 3, 5 + Math.random() * 2), { count: 1, colors: [0xffd84a, 0xff7ac0, 0x8fd4ff], speed: 0.6 });
    this.placeCam();
    const k = Math.min(1, dt * 2.2);
    this.camAt.pos.lerp(this.camTo.pos, k);
    this.camAt.look.lerp(this.camTo.look, k);
    this.camera.position.copy(this.camAt.pos);
    this.camera.lookAt(this.camAt.look);
  }

  exit() {
    if (this.onTap) engine.canvas.removeEventListener('pointerdown', this.onTap);
    closeDialogue();
  }
}

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** The MrBeast Lab lightning-bolt logo as a tiny pixel-art image. */
let _bolt = null;
function iconURL_bolt() {
  if (_bolt) return _bolt;
  const rows = [
    '......kkkkk', '.....kpppk.', '....kpppk..', '...kpppk...', '..kppppkkk.', '.kppppppppk', 'kkkkkpppk..', '...kpppk...', '..kpppk....', '.kppk......', 'kpk........', 'kk.........',
  ];
  const c = document.createElement('canvas');
  c.width = 11; c.height = 12;
  const ctx = c.getContext('2d');
  const pal = { k: '#120c24', p: '#ff2e88' };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); } }));
  _bolt = c.toDataURL();
  void icon;
  return _bolt;
}
