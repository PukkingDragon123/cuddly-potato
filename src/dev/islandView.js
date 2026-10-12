// Beast Island viewer: ?dev=island[&zone=<index>][&overview=1][&locked=<index>][&unlock=<index>][&tour=1][&t=seconds]
//   zone=k      frame zone k with its camPos / camLook (pushed back in portrait)
//   overview=1  whole island from high up
//   locked=k    lock every zone with index >= k
//   unlock=k    (with locked) play the unlock animation of zone k after 1s
//   tour=1      fly from zone to zone
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { makeBeastIsland } from '../models/island/beastIsland.js';
import { h, $ui } from '../ui/ui.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class IslandViewScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, engine.aspect, 0.5, 3000);
    this.t = 0;
  }
  async enter(params) {
    this.params = params;
    const I = (this.I = await makeBeastIsland());
    this.scene.add(I.root);
    this.tris = countTris(I.root);
    this.scene.background = I.sky;
    this.scene.fog = new THREE.Fog(I.fog.color, I.fog.near, I.fog.far);
    const L = I.lights;
    const { sun } = addLights(this.scene, { sky: L.sky, ground: L.ground, hemi: L.hemi, sun: L.sun, sunColor: L.sunColor, dir: L.dir, rimIntensity: L.rim, rimColor: L.rimColor, shadowExtent: L.shadowExtent, shadowFar: 400 });
    this.sun = sun;
    this.sunDir = new THREE.Vector3(...L.dir).normalize();
    if (params.locked !== undefined) {
      const k0 = +params.locked;
      I.zones.forEach((z) => { if (z.index >= k0) I.setLocked(z.id, true); });
    }
    this.mode = params.overview ? 'overview' : params.tour ? 'tour' : 'zone';
    this.zone = clampIdx(+(params.zone ?? 0), I.zones.length);
    this.hud = h('div', { style: { position: 'absolute', left: '6px', top: '6px', color: '#fff', font: '12px monospace', background: 'rgba(0,0,0,0.5)', padding: '4px', whiteSpace: 'pre' } }, '');
    $ui().appendChild(this.hud);
    this.place();
    const warm = +(params.t ?? 0);
    this.warmFrames = Math.ceil(warm * 30);
    for (let i = 0; i < warm * 30; i++) this.update(1 / 30);
    window.__island = I;
    window.__islandId = Math.random();
  }
  /** Camera framing for zone k at the current aspect. */
  zoneCam(k) {
    const Z = this.I.zones[k];
    const off = Z.camPos.clone().sub(Z.camLook);
    const a = this.camera.aspect;
    off.multiplyScalar(a < 1 ? Math.min(2.1, 0.98 / a) : a < 1.4 ? 1.2 : 1);
    return { pos: Z.camLook.clone().add(off), look: Z.camLook.clone() };
  }
  overviewCam() {
    const O = this.I.overview;
    const off = O.camPos.clone().sub(O.camLook);
    const a = this.camera.aspect;
    off.multiplyScalar(a < 1 ? 1.85 / a * 0.62 : 1);
    return { pos: O.camLook.clone().add(off), look: O.camLook.clone() };
  }
  place() {
    if (!this.I) return;
    let c = this.mode === 'overview' ? this.overviewCam() : this.zoneCam(this.zone);
    if (this.params.cam) {
      const v = String(this.params.cam).split(',').map(Number);
      c = { pos: new THREE.Vector3(v[0], v[1], v[2]), look: new THREE.Vector3(v[3], v[4], v[5]) };
    }
    this.camera.position.copy(c.pos);
    this.camera.lookAt(c.look);
    this.fitShadow(c.look, this.mode === 'overview' ? 105 : 34);
  }
  fitShadow(target, ext) {
    const s = this.sun;
    s.target.position.copy(target);
    s.position.copy(target).addScaledVector(this.sunDir, 160);
    const cam = s.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 1; cam.far = 400;
    cam.updateProjectionMatrix();
    s.target.updateMatrixWorld();
  }
  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    if (this.mode !== 'tour') this.place();
  }
  update(dt) {
    this.t += dt;
    const I = this.I;
    if (!I) return;
    this.frames = (this.frames ?? 0) + 1;
    window.__islandFrames = this.frames - (this.warmFrames ?? 0);
    if (this.params.unlock !== undefined && !this._unlocked && this.t > 1) {
      this._unlocked = true;
      I.setLocked(I.zones[+this.params.unlock].id, false, { animate: true });
    }
    I.update(dt, this.t);
    if (this.mode === 'tour') {
      const per = 5, n = I.zones.length;
      const seg = Math.floor(this.t / per) % n, f = Math.min(1, (this.t % per) / 2.5);
      const A = this.zoneCam(seg), B = this.zoneCam((seg + 1) % n);
      const k = ease(f);
      const pos = A.pos.clone().lerp(B.pos, k), look = A.look.clone().lerp(B.look, k);
      pos.y += Math.sin(k * Math.PI) * 12;
      this.camera.position.copy(pos);
      this.camera.lookAt(look);
      this.fitShadow(look, 40);
    }
    this._hudT = (this._hudT ?? 0) - dt;
    if (this._hudT <= 0) {
      this._hudT = 0.5;
      const z = I.zones[this.zone];
      const T = this.tris;
      this.hud.textContent = window.__islandHud = `beast island  ${this.mode}${this.mode === 'zone' ? ' ' + this.zone + ':' + z.id : ''}  fps ${engine.fps.toFixed(0)}\ntris ${(T.total / 1000).toFixed(0)}k (island ${(T.island / 1000).toFixed(0)}k, dioramas ${(T.dio / 1000).toFixed(0)}k)  meshes ${T.meshes}`;
    }
  }
}

/** Static triangle count (instances included) split into island vs dioramas. */
function countTris(root) {
  const out = { total: 0, island: 0, dio: 0, meshes: 0 };
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    let p = o, dio = false;
    while (p) { if (p.name?.startsWith('arena:')) dio = true; p = p.parent; }
    out.total += n;
    out.meshes++;
    if (dio) out.dio += n; else out.island += n;
  });
  return out;
}

const clampIdx = (v, n) => Math.max(0, Math.min(n - 1, v | 0));
