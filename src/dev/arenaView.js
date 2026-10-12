// Arena viewer: ?dev=arena&theme=lab[&cam=full|left|mid|right|portrait][&zone=1][&t=seconds]
// Battle mode reproduces the battle camera with placeholder Labs, turrets and
// a few Swarms for scale. Zone mode orbits the Beast Island diorama.
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { makeArenaBattle, makeArenaZone } from '../models/arenas/index.js';
import { battleCamera } from '../models/arenas/kit.js';
import { createSwarm } from '../models/swarmModels.js';
import { makeLabBuilding } from '../models/props.js';
import { FIELD } from '../game/battle/field.js';
import { h, $ui } from '../ui/ui.js';

export class ArenaViewScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 600);
    this.t = 0;
    this.rigs = [];
  }
  async enter(params) {
    this.params = params;
    const theme = params.theme ?? 'lab';
    this.zoneMode = !!params.zone;
    const A = this.zoneMode ? await makeArenaZone(theme) : await makeArenaBattle(theme);
    this.A = A;
    this.scene.add(A.root);
    const L = A.lights ?? {};
    const { sun } = addLights(this.scene, { sky: L.sky, ground: L.ground, hemi: L.hemi, sun: L.sun, sunColor: L.sunColor, dir: L.dir, rimIntensity: L.rim, rimColor: L.rimColor, shadowExtent: 26 });
    this.sun = sun;
    if (A.sky?.isTexture) this.scene.background = A.sky;
    else this.scene.background = new THREE.Color(A.sky ?? 0x8fd3ff);
    if (A.fog) this.scene.fog = new THREE.Fog(A.fog.color, A.fog.near, A.fog.far);
    if (A.bloom) this.bloom = A.bloom;
    if (!this.zoneMode) {
      for (const side of [0, 1]) {
        const lab = makeLabBuilding({ style: side ? 'rival' : 'default', flip: side === 1 });
        lab.root.position.set(side ? FIELD.LAB_X : -FIELD.LAB_X, 0, 0);
        this.scene.add(lab.root);
        const tur = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 1.5), new THREE.MeshLambertMaterial({ color: side ? 0xff4a4a : 0x29b6f6 }));
        tur.position.set(side ? FIELD.TURRET_X : -FIELD.TURRET_X, 1.3, 0);
        tur.castShadow = true;
        this.scene.add(tur);
      }
      const ids = ['panther', 'cloggedToilet', 'trashedCan', 'beastTiger', 'toxicPanther', 'steelPanther'];
      ids.forEach((id, i) => {
        const rig = createSwarm(id, { scale: id === 'beastTiger' ? 1.9 : 1 });
        const side = i % 2;
        rig.root.position.set((side ? 1 : -1) * (1.5 + i * 1.2), 0, ((i * 37) % 10) / 10 * 1.6 - 0.8);
        rig.root.rotation.y = side ? -Math.PI / 2 : Math.PI / 2;
        rig.setState('walk');
        this.scene.add(rig.root);
        this.rigs.push(rig);
      });
    }
    $ui().appendChild(h('div', { style: { position: 'absolute', left: '6px', top: '6px', color: '#fff', font: '12px monospace', background: 'rgba(0,0,0,0.5)', padding: '4px' } },
      `arena=${theme} ${this.zoneMode ? 'zone' : 'battle cam=' + (params.cam ?? 'full')}`));
    this.place();
    const warm = +(params.t ?? 0);
    for (let i = 0; i < warm * 30; i++) this.update(1 / 30);
  }
  place() {
    const cam = this.camera;
    if (this.zoneMode) return;
    const mode = this.params.cam ?? 'full';
    const want = mode === 'full' ? FIELD.VIEW_X * 2 : cam.aspect < 1 ? 13 : 20;
    const x = mode === 'left' ? -FIELD.VIEW_X + want / 2 : mode === 'right' ? FIELD.VIEW_X - want / 2 : 0;
    const c = battleCamera(x, want, cam.aspect, cam.fov, cam.aspect < 1 ? 0.56 : 0.6);
    cam.position.set(...c.pos);
    cam.lookAt(...c.look);
  }
  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this.place();
  }
  update(dt) {
    this.t += dt;
    this.A?.update?.(dt, this.t);
    for (const r of this.rigs) r.update(dt);
    if (this.zoneMode) {
      const f = this.A.focus ?? [0, 1, 0], R = (this.A.radius ?? 7) * 2.2;
      const a = this.t * 0.25 + 0.6;
      this.camera.position.set(f[0] + Math.sin(a) * R, f[1] + R * 0.7, f[2] + Math.cos(a) * R);
      this.camera.lookAt(f[0], f[1], f[2]);
    }
  }
}
