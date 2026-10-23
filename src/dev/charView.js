// Dev character viewer: ?dev=chars
//   (default)        every CHARACTERS entry, cycling reactions
//   &id=jimmy        one character up close (click the buttons to try poses / moods)
//   &skins=1         every Commander with every outfit skin
//   &faces=jimmy     a grid of one character's head in every mood
//   &heads=a,b|all   close-up heads, one row per &moods=x,y (default neutral), &skin=gold adds an outfit skin
//   &anim=dance      force a pose for everyone      &mood=happy  force a mood
//   &react=laugh     force a reaction (loops)       &cycle=0     no auto cycling
//   &yaw=0.4         turn everyone                  &seated=1    sit everyone down first
//   &zoom=0.6        camera distance multiplier        &anims=a,b,c one pose / reaction per character
//   &cyaw=0.6        orbit the camera
//   &id=jimmy,jimmy  repeat a character (e.g. with &anims=)
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { Chibi, POSE_NAMES, REACTION_NAMES, MOODS } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { COMMANDERS } from '../data/commanders.js';
import { CMD_SKINS } from '../data/season.js';
import { h, $ui } from '../ui/ui.js';

export class CharViewScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2f3d6a);
    this.camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 200);
    addLights(this.scene, { shadowExtent: 14 });
    const ground = (this.ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshLambertMaterial({ color: 0x5a7a9a })));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.items = [];
    this.labels = [];
    this.t = 0;
    this.yaw = 0;
  }

  async enter(params) {
    const P = (k, d) => params[k] ?? d;
    this.cycle = P('cycle', '1') !== '0';
    this.force = { anim: params.anim, mood: params.mood, react: params.react, list: params.anims ? params.anims.split(',') : null };
    const yaw = Number(P('yaw', '0.25'));
    const list = [];
    if (params.heads) {
      // close-up head grid: &heads=jimmy,nolan (or all) [&moods=neutral,angry] -> one row per mood
      const ids = params.heads === 'all' ? Object.keys(CHARACTERS) : params.heads.split(',');
      const moods = params.moods ? params.moods.split(',') : ['neutral'];
      const skin = params.skin ? CMD_SKINS[params.skin] : null; // &skin=gold: layer a Commander outfit skin
      const { name: _n, commander: _c, ...over } = skin ?? {}; // eslint-disable-line no-unused-vars
      for (const m of moods) for (const id of ids) if (CHARACTERS[id]) list.push({ id, def: { ...CHARACTERS[id], ...over }, label: `${id} ${m}`, mood: m, fixed: true, row: moods.indexOf(m), col: ids.indexOf(id), cols: ids.length, rows: moods.length });
    } else if (params.faces) {
      const id = params.faces;
      const moods = params.moods ? params.moods.split(',') : Object.keys(MOODS);
      for (const m of moods) list.push({ id, def: CHARACTERS[id], label: m, mood: m, fixed: true });
    } else if (params.skins) {
      for (const [cid, c] of Object.entries(COMMANDERS)) {
        list.push({ id: c.char, def: CHARACTERS[c.char], label: cid });
        for (const [sid, sk] of Object.entries(CMD_SKINS)) {
          if (sk.commander !== cid && sk.commander !== '*') continue;
          const { name, commander, ...over } = sk; // eslint-disable-line no-unused-vars
          list.push({ id: c.char, def: { ...CHARACTERS[c.char], ...over }, label: sid });
        }
      }
    } else {
      const ids = params.id ? params.id.split(',') : Object.keys(CHARACTERS);
      for (const id of ids) if (CHARACTERS[id]) list.push({ id, def: CHARACTERS[id], label: id });
    }
    const n = list.length;
    const single = n === 1;
    const faces = !!params.faces || !!params.heads || !!params.stack || !!params.anims;
    const cols = params.faces ? Math.ceil(Math.sqrt(n * 2.6)) : faces ? Math.min(n, 6) : single ? 1 : Math.min(n, params.skins ? 6 : 6);
    const sx = params.faces ? 1.2 : faces ? 1.9 : 1.75, sz = faces ? 1.6 : 2.6;
    list.forEach((it, i) => {
      const c = new Chibi(it.def, { scale: single ? 1.4 : 1 });
      const x = (i % cols) - (cols - 1) / 2, z = Math.floor(i / cols);
      if (it.row !== undefined) c.root.position.set((it.col - (it.cols - 1) / 2) * 1.25, -it.row * 1.2, it.row * 0.5);
      else if (faces) c.root.position.set(x * sx, -z * 2.6, 0);
      else c.root.position.set(x * sx, 0, z * sz);
      c.root.rotation.y = faces ? 0 : yaw;
      if (params.seated) c.play('sit');
      if (it.mood) c.mood(it.mood);
      this.scene.add(c.root);
      const item = { chibi: c, i, label: it.label, k: 0, next: 0.4 + i * 0.25, fixed: it.fixed };
      this.items.push(item);
      item.el = this.label(it.label, c);
    });
    const rows = Math.ceil(n / cols);
    if (params.heads) {
      const hc = list[0].cols, hr = list[0].rows;
      this.target = new THREE.Vector3(0, 1.45 - (hr - 1) * 0.6, (hr - 1) * 0.25);
      this.dist = Math.max(hc * 1.25 * 1.75, hr * 1.2 * 2.4) + 1;
      this.pitch = 0.0;
      this.ground.visible = false;
    } else if (faces) {
      this.target = new THREE.Vector3(0, 1.1 - (rows - 1) * 1.3, 0);
      this.dist = Math.max(cols * sx * 1.1, rows * 2.6 * 1.25) * 1.75;
      this.pitch = 0.0;
      this.ground.visible = false;
    } else if (single) {
      this.target = new THREE.Vector3(1.1, 1.35, 0);
      this.dist = 9.5;
      this.pitch = 0.12;
    } else {
      this.target = new THREE.Vector3(0, 0.95, (rows - 1) * sz * 0.5);
      this.dist = Math.max(cols * sx, rows * sz) * 1.6 + 2;
      this.pitch = 0.3;
    }
    this.dist *= Number(P('zoom', '1'));
    this.yaw = Number(P('cyaw', '0')); // &cyaw=0.6 orbits the camera
    const ui = $ui();
    ui.appendChild(h('div', { class: 'px-box', style: { position: 'absolute', top: '6px', left: '6px', fontSize: '11px', pointerEvents: 'none' } }, `Characters (${n}) - drag to rotate`));
    if (single) this.buildPanel(ui);
    let dragging = false, lx = 0;
    const cv = engine.canvas;
    cv.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; });
    window.addEventListener('pointerup', () => (dragging = false));
    cv.addEventListener('pointermove', (e) => { if (dragging) { this.yaw += (e.clientX - lx) * 0.01; lx = e.clientX; } });
    cv.addEventListener('wheel', (e) => { this.dist *= e.deltaY > 0 ? 1.1 : 0.9; });
    for (const it of this.items) this.apply(it, true);
    this.update(0);
  }

  label(text, chibi) {
    const el = h('div', { class: 'speech', style: { fontSize: '9px', padding: '1px 4px', whiteSpace: 'nowrap' } }, text);
    document.getElementById('world-ui').appendChild(el);
    this.labels.push({ el, chibi });
    return el;
  }

  buildPanel(ui) {
    const it = this.items[0];
    const btn = (txt, fn) => h('button', { style: { fontSize: '8px', margin: '1px', padding: '1px 3px' }, onclick: () => { this.cycle = false; fn(); it.el.textContent = txt; } }, txt);
    ui.appendChild(h('div', { style: { position: 'absolute', right: '4px', top: '4px', width: '34%', maxHeight: '96%', overflow: 'auto', pointerEvents: 'auto', background: 'rgba(0,0,0,0.35)', padding: '3px' } },
      h('div', { style: { color: '#fff', fontSize: '10px' } }, 'reactions'),
      ...REACTION_NAMES.map((r) => btn(r, () => it.chibi.react(r, { dur: 2.4 }))),
      h('div', { style: { color: '#fff', fontSize: '10px' } }, 'poses'),
      ...POSE_NAMES.map((a) => btn(a, () => it.chibi.play(a, { restart: true }))),
      h('div', { style: { color: '#fff', fontSize: '10px' } }, 'moods'),
      ...Object.keys(MOODS).map((m) => btn(m, () => it.chibi.mood(m)))));
  }

  apply(it, first = false) {
    const c = it.chibi;
    if (it.fixed) return;
    const f = this.force;
    if (f.list) {
      const name = f.list[it.i % f.list.length];
      if (first) { if (REACTION_NAMES.includes(name)) c.react(name, { dur: 1e6 }); else c.play(name); }
      it.el.textContent = `${it.label}: ${name}`;
      return;
    }
    if (f.anim) { if (first) c.play(f.anim); if (f.mood) c.mood(f.mood); it.el.textContent = `${it.label}: ${f.anim}`; return; }
    if (f.react) { c.react(f.react, { dur: 2.2 }); it.el.textContent = `${it.label}: ${f.react}`; return; }
    if (f.mood) { if (first) c.mood(f.mood); it.el.textContent = `${it.label}: ${f.mood}`; return; }
    if (!this.cycle) return;
    const r = REACTION_NAMES[(it.i * 5 + it.k) % REACTION_NAMES.length];
    it.k++;
    c.react(r, { dur: 2.2 });
    it.el.textContent = `${it.label}: ${r}`;
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    const cam = this.camera;
    cam.position.set(this.target.x + Math.sin(this.yaw) * this.dist, this.target.y + this.dist * this.pitch, this.target.z + Math.cos(this.yaw) * this.dist);
    cam.lookAt(this.target);
    for (const it of this.items) {
      it.next -= dt;
      if (it.next <= 0) { it.next = 2.6; this.apply(it); }
      it.chibi.update(dt);
    }
    const _v = this._v ?? (this._v = new THREE.Vector3());
    for (const l of this.labels) {
      l.chibi.root.updateMatrixWorld(true);
      const s = engine.toScreen(l.chibi.root.getWorldPosition(_v).setY(-0.05), cam);
      l.el.style.left = s.x + 'px';
      l.el.style.top = s.y + 'px';
    }
  }

  exit() {
    for (const l of this.labels) l.el.remove();
  }
}
