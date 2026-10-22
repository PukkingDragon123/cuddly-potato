// Live 3D "stage" for cinematic UI: dialogue face close-ups, the battle VS
// intro and the result / news screens render real chibi characters into a
// transparent canvas that sits inside the DOM (so pixel UI can layer above
// and below it).
//
// One small WebGL renderer is shared by every stage (only one stage shows at a
// time: the newest one to start() owns the canvas; the previous one just
// freezes). It has its own studio env map (a PMREM texture can't be shared
// across WebGL contexts), so materials that reflect the main engine's env map
// are swapped to ours for the duration of each render, and the main scene's
// colour grade is neutralised while we draw.
//
//   const st = new Stage3D({ fov: 24 });
//   st.mount(hostEl);            // canvas fills hostEl
//   st.add(chibi.root); st.onUpdate((dt) => chibi.update(dt));
//   st.start(); ... st.dispose();
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { engine } from '../core/engine.js';

let R = null;
let envTex = null;
let owner = null;

function sharedRenderer() {
  if (R) return R;
  const c = document.createElement('canvas');
  c.className = 'stage3d';
  R = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.NeutralToneMapping;
  R.toneMappingExposure = 1.08;
  R.setClearColor(0x000000, 0);
  const pmrem = new THREE.PMREMGenerator(R);
  const room = new RoomEnvironment();
  room.traverse((o) => {
    if (o.isLight) o.intensity *= 0.3;
    if (o.material && o.material.emissiveIntensity !== undefined && o.material.emissive?.getHex()) o.material.emissiveIntensity *= 0.3;
  });
  envTex = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  c.addEventListener('webglcontextlost', (e) => e.preventDefault());
  return R;
}

// the main scene's colour grade lives in uniforms shared by every built-in material
function gradeUniforms() {
  const u = THREE.ShaderLib.physical?.uniforms;
  return u && u.gradeA ? [u.gradeA.value, u.gradeB.value, u.gradeC.value, u.gradeD.value] : [];
}

const _swap = [];
export class Stage3D {
  constructor(opts = {}) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 26, 1, 0.05, 200);
    this.camera.position.set(0, 1.4, 8);
    this.updaters = [];
    this.host = null;
    this.w = 0;
    this.h = 0;
    this.maxDpr = opts.maxDpr ?? 2;
    this.maxPixels = opts.maxPixels ?? 1.4e6;
    this.exposure = opts.exposure ?? 1.08;
    if (opts.lights !== false) this.studioLights(opts);
  }

  /** Key / rim / fill studio rig; rimA + rimB are coloured edge lights (team colours etc.). */
  studioLights(o = {}) {
    const sc = this.scene;
    this.hemi = new THREE.HemisphereLight(0xeaf4ff, 0x4a3a6a, o.hemi ?? 1.35);
    this.key = new THREE.DirectionalLight(0xfff2e2, o.key ?? 2.5);
    this.key.position.set(2.5, 4.5, 6);
    this.rimA = new THREE.DirectionalLight(o.rimA ?? 0x7fd8ff, o.rimI ?? 2.6);
    this.rimA.position.set(-5, 3, -3);
    this.rimB = new THREE.DirectionalLight(o.rimB ?? 0xff7ac8, o.rimI ?? 2.2);
    this.rimB.position.set(5, 2.5, -3);
    this.fill = new THREE.DirectionalLight(0xffd8f0, 0.6);
    this.fill.position.set(-3, -1, 5);
    sc.add(this.hemi, this.key, this.rimA, this.rimB, this.fill);
  }

  add(...objs) { for (const o of objs) this.scene.add(o); return this; }
  remove(...objs) { for (const o of objs) this.scene.remove(o); return this; }
  onUpdate(fn) { this.updaters.push(fn); return this; }

  /** Put the (shared) canvas inside `host` (it fills it) once this stage owns it. */
  mount(host) {
    this.host = host;
    if (owner === this) this.attach();
    return this;
  }
  attach() {
    const r = sharedRenderer();
    if (this.host && r.domElement.parentNode !== this.host) this.host.appendChild(r.domElement);
    this.w = this.h = 0; // force a resize
  }

  start() {
    if (this.off) return this;
    owner = this;
    this.attach();
    this.off = engine.onFrame((dt) => this.frame(dt));
    this.frame(0);
    return this;
  }

  get active() { return owner === this && !!this.off; }

  /** World point on the plane z = z0 under the normalised screen point (0..1, 0..1, top-left origin). */
  screenToWorld(sx, sy, z0 = 0, out = new THREE.Vector3()) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const v = new THREE.Vector3(sx * 2 - 1, -(sy * 2 - 1), 0.5).unproject(cam);
    const dir = v.sub(cam.position).normalize();
    const t = (z0 - cam.position.z) / dir.z;
    return out.copy(cam.position).addScaledVector(dir, t);
  }

  resize() {
    const host = this.host;
    if (!host) return false;
    const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
    if (w < 2 || h < 2) return false;
    if (w === this.w && h === this.h) return true;
    this.w = w;
    this.h = h;
    let dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr, engine.quality === 'low' ? 1 : 2);
    if (w * h * dpr * dpr > this.maxPixels) dpr = Math.max(0.5, Math.sqrt(this.maxPixels / (w * h)));
    R.setPixelRatio(dpr);
    R.setSize(w, h, false);
    R.domElement.style.width = w + 'px';
    R.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h);
    return true;
  }

  frame(dt) {
    if (owner !== this || !this.off) return;
    if (!this.host?.isConnected) return;
    for (const fn of this.updaters) fn(dt);
    if (!this.resize()) return;
    this.render();
  }

  render() {
    const mainEnv = engine.envMap;
    _swap.length = 0;
    this.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : null;
      if (!mats) return;
      for (const m of mats) if (m.envMap && m.envMap === mainEnv) { m.envMap = envTex; _swap.push(m); }
    });
    const gr = gradeUniforms();
    const saved = gr.map((v) => [v.x, v.y, v.z, v.w]);
    for (const v of gr) v.x = v.y = v.z = v.w = 0;
    R.toneMappingExposure = this.exposure;
    try {
      if (this.renderFn) {
        // custom passes (e.g. one clipped render per character); always leave the renderer clean
        try { this.renderFn(R, this.scene, this.camera); } finally { R.clippingPlanes = []; R.autoClear = true; }
      } else R.render(this.scene, this.camera);
    } catch (e) {
      if (!this._warned) { this._warned = true; console.warn('stage3d render failed', e); }
    } finally {
      for (const m of _swap) m.envMap = mainEnv;
      gr.forEach((v, i) => { [v.x, v.y, v.z, v.w] = saved[i]; });
    }
  }

  stop() {
    this.off?.();
    this.off = null;
    if (owner === this) {
      owner = null;
      R?.domElement.remove();
    }
  }

  dispose() {
    this.stop();
    this.updaters.length = 0;
    this.scene.clear();
  }
}

/** Camera that frames a chibi's face (head-and-shoulders close-up). k = 0 wide .. 1 tight. */
export function headTarget(ch, out = new THREE.Vector3()) {
  ch.head.updateWorldMatrix(true, false);
  return out.set(0, 0.48, 0.1).applyMatrix4(ch.head.matrixWorld);
}
