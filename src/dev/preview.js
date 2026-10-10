// Dev preview scene: ?dev=models | ?dev=models&id=panther | ?dev=chars | ?dev=props
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { createSwarm, MODEL_IDS } from '../models/swarmModels.js';
import { SWARMS } from '../data/swarms.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { h, $ui } from '../ui/ui.js';
import { fx } from '../core/particles.js';

export class PreviewScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a4a7a);
    this.camera = new THREE.PerspectiveCamera(40, engine.aspect, 0.1, 200);
    addLights(this.scene, { shadowExtent: 14 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x6a8a5a }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.items = [];
    this.yaw = 0;
    this.t = 0;
  }
  async enter(params) {
    this.mode = params.mode;
    const ui = $ui();
    const label = (text, pos) => {
      const el = h('div', { class: 'speech', style: { fontSize: '10px', padding: '2px 4px' } }, text);
      document.getElementById('world-ui').appendChild(el);
      this.labels.push({ el, pos });
    };
    this.labels = [];
    if (params.mode === 'models') {
      const ids = params.id ? params.id.split(',') : Object.keys(SWARMS).filter((id) => MODEL_IDS.includes(id) || true);
      const variants = params.variant ? [params.variant] : ['base'];
      const cols = Math.ceil(Math.sqrt(ids.length * 1.6));
      ids.forEach((id, i) => {
        const rig = createSwarm(id, { variant: variants[0], skin: params.skin, scale: params.id ? 1.6 : 1 });
        const x = (i % cols) - (cols - 1) / 2, z = Math.floor(i / cols);
        rig.root.position.set(x * 2.4, 0, z * 2.4);
        rig.root.rotation.y = 0.6;
        this.scene.add(rig.root);
        this.items.push({ rig, i });
        label(id + (MODEL_IDS.includes(id) ? '' : ' (blob)'), new THREE.Vector3(x * 2.4, rig.height + 0.25, z * 2.4));
      });
      const rows = Math.ceil(ids.length / cols);
      const span = Math.max(cols, rows) * 2.4;
      this.target = new THREE.Vector3(0, 0.6, (rows - 1) * 1.2);
      this.dist = params.id && ids.length === 1 ? 6 : Math.max(7, span * 1.1);
    } else if (params.mode === 'chars') {
      const ids = Object.keys(CHARACTERS);
      const anims = ['idle', 'walk', 'talk', 'cheer', 'dance', 'wave', 'sit', 'point', 'angry', 'shake'];
      ids.forEach((id, i) => {
        const c = new Chibi(CHARACTERS[id]);
        c.root.position.set((i - (ids.length - 1) / 2) * 1.8, 0, 0);
        c.play(anims[i % anims.length]);
        const exprs = [['normal', 'smile'], ['happy', 'grin'], ['angry', 'shout'], ['shock', 'open'], ['star', 'grin'], ['money', 'tongue'], ['heart', 'smile'], ['dizzy', 'wobble'], ['sad', 'frown'], ['wink', 'smirk']];
        c.expr(...exprs[i % exprs.length]);
        this.scene.add(c.root);
        this.items.push({ chibi: c });
        label(id + ':' + anims[i % anims.length], new THREE.Vector3(c.root.position.x, 2.4, 0));
      });
      this.target = new THREE.Vector3(0, 1, 0);
      this.dist = ids.length * 1.4;
    } else if (params.mode === 'props') {
      const { PROPS } = await import('../models/props.js');
      const ids = params.id ? params.id.split(',') : Object.keys(PROPS);
      const cols = Math.ceil(Math.sqrt(ids.length * 1.4));
      let maxS = 2;
      ids.forEach((id, i) => {
        const obj = PROPS[id]();
        const x = (i % cols) - (cols - 1) / 2, z = Math.floor(i / cols);
        const box = new THREE.Box3().setFromObject(obj);
        const s = box.getSize(new THREE.Vector3());
        maxS = Math.max(maxS, s.x, s.z);
        obj.userData.slot = [x, z];
        this.scene.add(obj);
        this.items.push({ obj, x, z, h: s.y });
      });
      const step = maxS * 1.2;
      for (const it of this.items) {
        it.obj.position.set(it.x * step, 0, it.z * step);
        label(ids[this.items.indexOf(it)], new THREE.Vector3(it.x * step, it.h + 0.3, it.z * step));
      }
      const rows = Math.ceil(ids.length / cols);
      this.target = new THREE.Vector3(0, 0.6, (rows - 1) * step * 0.5);
      this.dist = Math.max(cols, rows) * step * 1.15;
    }
    let dragging = false, lx = 0;
    const c = engine.canvas;
    c.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; });
    window.addEventListener('pointerup', () => (dragging = false));
    c.addEventListener('pointermove', (e) => {
      if (dragging) { this.yaw += (e.clientX - lx) * 0.01; lx = e.clientX; }
    });
    c.addEventListener('wheel', (e) => { this.dist *= e.deltaY > 0 ? 1.1 : 0.9; });
    ui.appendChild(h('div', { style: { position: 'absolute', top: '6px', left: '6px', fontSize: '12px' }, class: 'px-box', }, `Preview: ${params.mode}  (drag to rotate)`));
    if (params.anim) this.forceAnim = params.anim;
    this.update(0, 0);
  }
  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
  }
  update(dt) {
    this.t += dt;
    if (!this.target) return;
    const cam = this.camera;
    cam.position.set(this.target.x + Math.sin(this.yaw) * this.dist, this.target.y + this.dist * 0.45, this.target.z + Math.cos(this.yaw) * this.dist);
    cam.lookAt(this.target);
    const phase = Math.floor(this.t / 2.5) % 4;
    for (const it of this.items) {
      if (it.rig) {
        const st = this.forceAnim ?? ['idle', 'walk', 'attack', 'dance'][phase];
        if (st === 'attack') {
          it.rig.setState('idle');
          if (!it.rig._lastAtk || this.t - it.rig._lastAtk > 0.9) { it.rig.attack(0.5); it.rig._lastAtk = this.t; }
        } else it.rig.setState(st);
        it.rig.update(dt);
      }
      if (it.chibi) it.chibi.update(dt);
    }
    for (const l of this.labels) {
      const s = engine.toScreen(l.pos, cam);
      l.el.style.left = s.x + 'px';
      l.el.style.top = s.y + 'px';
    }
  }
}
