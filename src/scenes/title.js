// Title screen: voxel stage with dancing Swarms, pixel logo, tap to start.
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { rand, pick } from '../core/util.js';
import { VoxGrid, makeMesh } from '../core/voxel.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { createSwarm } from '../models/swarmModels.js';
import { h, $ui } from '../ui/ui.js';
import { state } from '../game/state.js';
import { game } from '../game/game.js';

const LOGO_CSS = `
.title-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: calc(var(--safe-t) + 4vh) 16px calc(var(--safe-b) + 3vh); pointer-events: none; }
.title-logo { font-family: 'Press Start 2P', monospace; text-align: center; line-height: 1.15; animation: floatY 2.4s ease-in-out infinite; }
.title-logo .l1 { font-size: calc(var(--u) * 3.2); color: #fff; text-shadow: 0 4px 0 var(--ink), 4px 0 0 var(--ink), -4px 0 0 var(--ink), 0 -4px 0 var(--ink), 4px 8px 0 var(--pink); letter-spacing: 0.06em; }
.title-logo .l2 { font-size: calc(var(--u) * 5.2); color: var(--blue); text-shadow: 0 5px 0 var(--ink), 5px 0 0 var(--ink), -5px 0 0 var(--ink), 0 -5px 0 var(--ink), 5px 10px 0 var(--ink); margin-top: 0.15em; }
.title-logo .l2 span { display: inline-block; animation: letterBounce 1.6s ease-in-out infinite; }
@keyframes letterBounce { 0%, 100% { transform: translateY(0); } 15% { transform: translateY(-0.18em); } 30% { transform: translateY(0); } }
.title-logo .tag { display: inline-block; margin-top: 0.9em; font-family: 'Pixelify Sans', sans-serif; font-weight: 700; font-size: calc(var(--u) * 1.5); background: var(--pink); padding: 0.2em 0.7em; box-shadow: 0 3px 0 var(--pink-d), 0 -3px 0 var(--ink), 0 6px 0 var(--ink), -3px 0 0 var(--ink), 3px 0 0 var(--ink); transform: rotate(-3deg); }
.title-start { font-family: 'Press Start 2P', monospace; font-size: calc(var(--u) * 1.7); animation: pulse 1s infinite; text-shadow: 0 3px 0 var(--ink), 3px 0 0 var(--ink), -3px 0 0 var(--ink), 0 -3px 0 var(--ink); }
.title-disc { font-size: 0.72em; opacity: 0.75; text-align: center; max-width: 560px; text-shadow: 0 2px 0 var(--ink); }
`;

export class TitleScene {
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x29b6f6);
    s.fog = new THREE.Fog(0x29b6f6, 14, 30);
    this.camera = new THREE.PerspectiveCamera(38, engine.aspect, 0.1, 100);
    addLights(s, { shadowExtent: 8, dir: [3, 9, 6] });
    // stage
    const g = new VoxGrid();
    g.cylinder(-0.5, -0.5, 0, 3, 34, (x, y, z) => (y === 3 ? (((x >> 2) + (z >> 2)) & 1 ? 0xffd23f : 0xff2e88) : 0x1477c9));
    const stage = makeMesh(g.build({ scale: 0.12, pivot: 'bottom' }));
    stage.receiveShadow = true;
    stage.position.y = -0.48;
    s.add(stage);
    // rays background
    const rays = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 40), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x4fc4f8 : 0x1fa8ec, side: THREE.DoubleSide }));
      m.position.y = 20;
      const holder = new THREE.Group();
      holder.add(m);
      holder.rotation.z = (i / 16) * Math.PI * 2;
      rays.add(holder);
    }
    rays.position.set(0, 3, -14);
    s.add(rays);
    this.rays = rays;
    // cast
    this.actors = [];
    const ids = ['cloggedToilet', 'panther', 'feastablesPanther', 'trashedCan', 'atomicSlime', 'fryFiend', 'mutantMailbox'];
    const pos = [[-3.2, 0.6], [-1.6, 1.2], [0, -0.4], [1.7, 1.2], [3.3, 0.6], [-2.4, 2.4], [2.5, 2.4]];
    ids.forEach((id, i) => {
      const rig = createSwarm(id, { scale: id === 'feastablesPanther' ? 0.75 : 1 });
      rig.root.position.set(pos[i][0], 0, pos[i][1]);
      rig.root.rotation.y = -pos[i][0] * 0.12;
      rig.setState('dance');
      rig.danceT = i * 0.3;
      s.add(rig.root);
      this.actors.push(rig);
    });
    this.jimmy = new Chibi(CHARACTERS.jimmy);
    this.jimmy.root.position.set(-0.2, 0, 2.6);
    this.jimmy.play('wave');
    this.jimmy.expr('happy', 'grin');
    s.add(this.jimmy.root);
    this.t = 0;
  }

  enter() {
    audio.music('title');
    const style = h('style', {}, LOGO_CSS);
    const word = 'SWARMERS'.split('').map((c, i) => h('span', { style: { animationDelay: i * 0.08 + 's' } }, c));
    const wrap = h('div', { class: 'title-wrap' },
      h('div', { class: 'title-logo' }, h('div', { class: 'l1' }, 'MRBEAST'), h('div', { class: 'l2' }, word), h('div', { class: 'tag' }, 'Season 1: FOOD SEASON')),
      h('div', { class: 'col center' },
        h('div', { class: 'title-start' }, 'TAP TO START'),
        h('div', { class: 'title-disc' }, 'Unofficial fan-made game. Not affiliated with MrBeast, Beast Industries or Moose Toys.')));
    $ui().append(style, wrap);
    this.onDown = () => this.start();
    window.addEventListener('pointerdown', this.onDown, { once: true });
    window.addEventListener('keydown', this.onDown, { once: true });
  }
  exit() {
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('keydown', this.onDown);
  }
  start() {
    if (this.started) return;
    this.started = true;
    audio.unlock();
    audio.play('bigPop');
    fx.confetti(new THREE.Vector3(0, 2, 1), { count: 100 });
    fx.foam(new THREE.Vector3(0, 0.5, 1), { count: 40, colors: [0xffffff, 0x7cff3a] });
    engine.shake(0.4);
    this.jimmy.play('cheer');
    setTimeout(() => game.go('lab'), 700);
  }
  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.fov = w / hh < 1 ? 60 : 38;
    this.camera.updateProjectionMatrix();
  }
  update(dt) {
    this.t += dt;
    const portrait = this.camera.aspect < 1;
    this.camera.position.set(Math.sin(this.t * 0.2) * 1.2, portrait ? 3.4 : 2.6, portrait ? 13 : 10);
    this.camera.lookAt(0, portrait ? 2.4 : 1.8, 0);
    this.rays.rotation.z += dt * 0.1;
    for (const a of this.actors) a.update(dt);
    this.jimmy.update(dt);
    if (Math.random() < dt * 3) fx.confetti(new THREE.Vector3(rand(-6, 6), 7, rand(-2, 2)), { count: 3, speed: 1 });
    if (Math.random() < dt * 1.5) {
      const a = pick(this.actors);
      a.attack(0.5);
      a.boing(0.4);
    }
  }
}
