// Base tier viewer: ?dev=bases
//   &tier=all|1..6|2,4     which tiers (default all, side by side)
//   &side=0|1 &flip=0|1    colours / mirroring of the main row (default player side, unflipped)
//   &rival=1               add a second row with the flipped rival versions
//   &dmg=0..1|stages       damage fraction, or 'stages' = one tier at 0 / .4 / .7 / .95 / 1
//   &cam=row|battle|close  row = elevated front view, battle = arena + battle camera at x = ±12
//                          (&pos=left|right|full, &arena=lab), close = orbit one tier (&yaw=)
//   &pitch=deg &zoom=k     row/close camera tweaks
//   &scaffold=0..1         show construction scaffolding at that progress
//   &cmd=0                 hide the Commanders sitting on the seats
//   &t=sec                 pre-warm animations
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { makeBase, makeScaffold, BASE_TIERS } from '../models/props/base.js';
import { battleCamera } from '../models/arenas/kit.js';
import { FIELD } from '../game/battle/field.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { h, $ui, $world } from '../ui/ui.js';

export class BaseViewScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 600);
    this.t = 0;
    this.bases = [];
    this.cmds = [];
    this.scaffolds = [];
    this.labels = [];
    this.rigs = [];
  }

  async enter(params) {
    this.params = params;
    const p = params;
    const mode = p.cam ?? 'row';
    this.mode = mode;
    const tiers = !p.tier || p.tier === 'all' ? [1, 2, 3, 4, 5, 6] : String(p.tier).split(',').map(Number);
    const side = +(p.side ?? 0), flip = p.flip !== undefined ? p.flip === '1' : side === 1;
    const dmg = p.dmg ?? '0';
    const showCmd = p.cmd !== '0';

    if (mode === 'battle') {
      const { makeArenaBattle } = await import('../models/arenas/index.js');
      const A = await makeArenaBattle(p.arena ?? 'lab');
      this.A = A;
      this.scene.add(A.root);
      const L = A.lights ?? {};
      addLights(this.scene, { sky: L.sky, ground: L.ground, hemi: L.hemi, sun: L.sun, sunColor: L.sunColor, dir: L.dir ?? [-6, 14, 10], rimIntensity: L.rim, rimColor: L.rimColor, shadowExtent: 16, shadowFar: 70 });
      if (A.sky?.isTexture) this.scene.background = A.sky;
      else this.scene.background = new THREE.Color(A.sky ?? 0x8fd3ff);
      if (A.fog) this.scene.fog = new THREE.Fog(A.fog.color, A.fog.near, A.fog.far);
      if (A.bloom) this.bloom = A.bloom;
      const t0 = tiers[0] ?? 1;
      const t1 = tiers[1] ?? t0;
      for (const s of [0, 1]) {
        const b = makeBase(s ? t1 : t0, { side: s, flip: s === 1 });
        b.root.position.set(s ? FIELD.LAB_X : -FIELD.LAB_X, 0, 0);
        b.setDamage(dmg === 'stages' ? 0 : +dmg);
        this.addBase(b, showCmd, s);
        const tur = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 1.5), new THREE.MeshLambertMaterial({ color: s ? 0xff4a4a : 0x29b6f6 }));
        tur.position.set(s ? FIELD.TURRET_X : -FIELD.TURRET_X, 1.3, 0);
        tur.castShadow = true;
        this.scene.add(tur);
      }
      try {
        const { createSwarm } = await import('../models/swarmModels.js');
        ['panther', 'cloggedToilet', 'beastTiger', 'trashedCan'].forEach((id, i) => {
          const rig = createSwarm(id, { scale: id === 'beastTiger' ? 1.9 : 1 });
          const s = i % 2;
          rig.root.position.set((s ? 1 : -1) * (FIELD.LAB_X - 2.2 - i * 0.9), 0, (i % 3) * 0.6 - 0.6);
          rig.root.rotation.y = s ? Math.PI / 2 : -Math.PI / 2;
          rig.setState('attack');
          this.scene.add(rig.root);
          this.rigs.push(rig);
        });
      } catch (e) { console.warn(e); }
    } else {
      this.scene.background = new THREE.Color(0x9fd8ff);
      addLights(this.scene, { dir: [-6, 14, 10], shadowExtent: 30, shadowFar: 90 });
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 120), new THREE.MeshLambertMaterial({ color: 0x6fbf5a }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(220, 1.8), new THREE.MeshLambertMaterial({ color: 0xd8dde6 }));
      lane.rotation.x = -Math.PI / 2;
      lane.position.y = 0.005;
      lane.receiveShadow = true;
      this.scene.add(lane);
      const rows = [{ side, flip, z: 0 }];
      if (p.rival === '1') rows.push({ side: 1, flip: true, z: -7.5 });
      const list = dmg === 'stages' ? [0, 0.4, 0.7, 0.95, 1].map((d) => ({ tier: tiers[0], d })) : tiers.map((tier) => ({ tier, d: +dmg }));
      const gap = 1.2;
      for (const row of rows) {
        const made = list.map((it) => {
          const b = makeBase(it.tier, { side: row.side, flip: row.flip });
          b.setDamage(it.d);
          return { b, it };
        });
        const ws = made.map(({ b }) => b.bounds.x1 - b.bounds.x0);
        const total = ws.reduce((a, c) => a + c, 0) + gap * (ws.length - 1);
        let x = -total / 2;
        made.forEach(({ b, it }, i) => {
          b.root.position.set(x - b.bounds.x0, 0, row.z);
          x += ws[i] + gap;
          this.addBase(b, showCmd && it.d < 1, row.side);
          const name = BASE_TIERS[it.tier - 1].name;
          const lbl = dmg === 'stages' ? `${name} dmg ${it.d}` : `${it.tier}. ${name}`;
          this.label(`${lbl}  (${b.width.toFixed(2)} x ${b.height.toFixed(2)})`, new THREE.Vector3(b.root.position.x + (b.bounds.x0 + b.bounds.x1) / 2, -0.25, row.z + 2.2));
          // front face marker (troops hit here)
          const mk = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 2.4), new THREE.MeshBasicMaterial({ color: 0xff2e88 }));
          mk.position.set(b.root.position.x + b.front, 0.02, row.z);
          this.scene.add(mk);
        });
        this.rowWidth = Math.max(this.rowWidth ?? 0, total);
      }
      this.rows = rows.length;
    }
    if (p.scaffold !== undefined) {
      for (const b of this.bases) {
        const s = makeScaffold(b.width + 0.4, b.height + 0.3, { flip: b.flip, progress: +p.scaffold });
        s.root.position.copy(b.root.position).add(new THREE.Vector3((b.bounds.x0 + b.bounds.x1) / 2, 0, 0));
        this.scene.add(s.root);
        this.scaffolds.push(s);
      }
    }
    $ui().appendChild(h('div', { style: { position: 'absolute', left: '6px', top: '6px', color: '#fff', font: '12px monospace', background: 'rgba(0,0,0,0.5)', padding: '4px' } },
      `bases cam=${mode} tier=${tiers.join(',')} side=${side} dmg=${dmg}`));
    this.place();
    const warm = +(p.t ?? 1);
    for (let i = 0; i < warm * 30; i++) this.update(1 / 30);
  }

  addBase(b, showCmd, side) {
    this.scene.add(b.root);
    this.bases.push(b);
    if (!showCmd) return;
    const ch = new Chibi(CHARACTERS[side ? 'nolan' : 'jimmy'], { scale: 0.9 });
    ch.play('sit');
    b.root.updateMatrixWorld(true);
    const wp = new THREE.Vector3().setFromMatrixPosition(b.seat.matrixWorld);
    ch.root.position.copy(wp);
    ch.root.rotation.y = side ? -0.55 : 0.55;
    this.scene.add(ch.root);
    this.cmds.push(ch);
  }

  label(text, pos) {
    const el = h('div', { style: { position: 'absolute', transform: 'translate(-50%, 0)', color: '#fff', font: 'bold 11px monospace', background: 'rgba(10,20,50,0.7)', padding: '2px 5px', whiteSpace: 'nowrap', pointerEvents: 'none' } }, text);
    $world().appendChild(el);
    this.labels.push({ el, pos });
  }

  place() {
    const cam = this.camera, p = this.params;
    if (this.mode === 'battle') {
      const pos = p.pos ?? 'left';
      const want = pos === 'full' ? FIELD.VIEW_X * 2 : cam.aspect < 1 ? 11.5 : Math.min(FIELD.VIEW_X * 2, 15 + cam.aspect * 2);
      const x = pos === 'left' ? -FIELD.VIEW_X + want / 2 : pos === 'right' ? FIELD.VIEW_X - want / 2 : 0;
      const c = battleCamera(x, want, cam.aspect, cam.fov, cam.aspect < 1 ? 0.56 : 0.6);
      cam.position.set(...c.pos);
      cam.lookAt(...c.look);
      return;
    }
    const zoom = +(p.zoom ?? 1);
    const pitch = (+(p.pitch ?? (this.rows > 1 ? 24 : 9)) * Math.PI) / 180;
    if (this.mode === 'close') {
      const b = this.bases[0];
      const yaw = (+(p.yaw ?? 25) * Math.PI) / 180;
      const R = (Math.max(b.width, b.height) * 2.6 + 2) / zoom;
      const tgt = new THREE.Vector3(b.root.position.x + (b.bounds.x0 + b.bounds.x1) / 2, b.height * 0.45, 0);
      cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * R, tgt.y + Math.sin(pitch) * R, Math.cos(yaw) * Math.cos(pitch) * R);
      cam.lookAt(tgt);
      return;
    }
    const W = (this.rowWidth ?? 30) + 1.5;
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const dist = W / (2 * tanV * cam.aspect) / zoom;
    const tgtY = this.rows > 1 ? 1.5 : 2.6;
    const tz = this.rows > 1 ? -3.5 : 0;
    cam.position.set(0, tgtY + Math.sin(pitch) * dist, tz + Math.cos(pitch) * dist);
    cam.lookAt(0, tgtY, tz);
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this.place();
  }

  exit() {
    for (const l of this.labels) l.el.remove();
  }

  update(dt) {
    this.t += dt;
    this.A?.update?.(dt, this.t);
    for (const b of this.bases) b.update(dt);
    for (const s of this.scaffolds) s.update(dt);
    for (const c of this.cmds) c.update(dt);
    for (const r of this.rigs) r.update(dt);
    if (this.mode === 'close' && this.params.spin === '1') {
      this.params.yaw = String(+(this.params.yaw ?? 25) + dt * 20);
      this.place();
    }
    for (const l of this.labels) {
      const s = engine.toScreen(l.pos, this.camera);
      l.el.style.left = s.x + 'px';
      l.el.style.top = s.y + 'px';
    }
  }
}
