// Engine: owns the WebGL renderer, main loop, current scene, camera shake,
// hit-stop, render scale ("pixel look") and helpers for picking/projection.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { updateTweens } from './tween.js';
import { particles } from './particles.js';
import { allVariantMaterials, variantMaterials } from './voxel.js';
import { clamp } from './util.js';

const PIXEL_TARGETS = { chunky: 260, retro: 400, crisp: 620, hd: 0 };

class Engine {
  constructor() {
    this.current = null;
    this.time = 0;
    this.timeScale = 1;
    this.hitstopT = 0;
    this.trauma = 0;
    this.shakeOffset = new THREE.Vector3();
    this.pixelMode = 'retro';
    this.width = 1;
    this.height = 1;
    this.frameListeners = new Set();
    this.raycaster = new THREE.Raycaster();
    this.fps = 60;
  }

  init() {
    this.canvas = document.getElementById('gl');
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.BasicShadowMap;
    r.setClearColor(0x0b1230, 1);

    // Environment map for chrome/gold/silver variants.
    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    for (const k of ['chrome', 'silver', 'gold']) variantMaterials(k);
    for (const m of allVariantMaterials()) {
      m.envMap = this.envMap;
      m.needsUpdate = true;
    }

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
  }

  setPixelMode(mode) {
    this.pixelMode = PIXEL_TARGETS[mode] !== undefined ? mode : 'retro';
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const target = PIXEL_TARGETS[this.pixelMode];
    const ratio = target ? clamp(target / Math.min(w, h * 1.25), 0.25, dpr) : dpr;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    document.documentElement.style.setProperty('--vw', w + 'px');
    document.documentElement.style.setProperty('--vh', h + 'px');
    if (this.current && this.current.resize) this.current.resize(w, h);
    else if (this.current && this.current.camera && this.current.camera.isPerspectiveCamera) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
    }
  }

  get aspect() {
    return this.width / this.height;
  }

  async setScene(sceneObj, params) {
    const prev = this.current;
    if (prev && prev.exit) prev.exit();
    this.current = sceneObj;
    this.trauma = 0;
    this.timeScale = 1;
    this.hitstopT = 0;
    particles.attach(sceneObj.scene);
    particles.clear();
    if (sceneObj.enter) await sceneObj.enter(params);
    this.resize();
  }

  /** Add camera trauma (0..1). Shake magnitude grows with trauma². */
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  hitstop(sec) {
    this.hitstopT = Math.max(this.hitstopT, sec);
  }

  onFrame(fn) {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 0.0001;
    this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    this.time += dt;
    updateTweens(dt);
    let gdt = dt * this.timeScale;
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      gdt *= 0.04;
    }
    for (const fn of this.frameListeners) fn(dt, gdt);
    const cur = this.current;
    if (!cur) return;
    try {
      if (cur.update) cur.update(dt, gdt);
    } catch (e) {
      // keep rendering even if a subsystem throws; report each distinct error once
      const key = String(e && e.message);
      if (!this._errs) this._errs = new Set();
      if (!this._errs.has(key)) {
        this._errs.add(key);
        console.error('Scene update error:', e);
      }
    }
    particles.update(gdt);

    const cam = cur.camera;
    if (!cam) return;
    // camera shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * (cur.shakeScale ?? 1);
    if (s > 0.0001) {
      const t = this.time * 38;
      this.shakeOffset.set(
        (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1)) * 0.5 * s * 0.6,
        (Math.sin(t * 1.7 + 2) + Math.sin(t * 2.9)) * 0.5 * s * 0.6,
        0,
      );
      cam.position.add(this.shakeOffset);
      this.renderer.render(cur.scene, cam);
      cam.position.sub(this.shakeOffset);
    } else {
      this.renderer.render(cur.scene, cam);
    }
  }

  /** Raycast from CSS client coords into objects. */
  raycast(clientX, clientY, objects, camera = this.current?.camera, recursive = true) {
    const ndc = new THREE.Vector2((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }
  /** Ray hitting a horizontal plane at height y. */
  rayToPlane(clientX, clientY, y = 0, camera = this.current?.camera) {
    const ndc = new THREE.Vector2((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  /** Project a world position to CSS pixels. Returns {x,y,visible}. */
  toScreen(v, camera = this.current?.camera) {
    const p = _proj.copy(v).project(camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height, visible: p.z < 1 && p.z > -1 };
  }

  // ---------------------------------------------------------------------
  // Thumbnails: rendered with a tiny dedicated renderer, cached as data URLs.
  renderThumb(obj, opts = {}) {
    const size = opts.size ?? 96;
    if (!this.thumbRenderer) {
      const c = document.createElement('canvas');
      this.thumbRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: false, alpha: true, preserveDrawingBuffer: true });
      this.thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.thumbScene = new THREE.Scene();
      this.thumbScene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5040, 1.6));
      const d = new THREE.DirectionalLight(0xffffff, 2.2);
      d.position.set(2, 4, 5);
      this.thumbScene.add(d);
      this.thumbCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    }
    const r = this.thumbRenderer;
    r.setPixelRatio(1);
    r.setSize(size, size, false);
    r.setClearColor(0x000000, 0);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.y = opts.yaw ?? -0.5;
    this.thumbScene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    if (opts.focusHead) c.y = box.max.y - sz.y * 0.3;
    const rad = Math.max(sz.x, sz.y, sz.z) * 0.62 * (opts.zoom ?? 1);
    const dist = rad / Math.tan(THREE.MathUtils.degToRad(15));
    const pitch = opts.pitch ?? 0.28;
    this.thumbCam.position.set(c.x, c.y + Math.sin(pitch) * dist, c.z + Math.cos(pitch) * dist);
    this.thumbCam.lookAt(c);
    r.render(this.thumbScene, this.thumbCam);
    const url = r.domElement.toDataURL('image/png');
    this.thumbScene.remove(holder);
    return url;
  }
}

const _proj = new THREE.Vector3();
export const engine = new Engine();

/** Standard light rig helper used by most scenes. */
export function addLights(scene, opts = {}) {
  const hemi = new THREE.HemisphereLight(opts.sky ?? 0xcfe6ff, opts.ground ?? 0x6b5a4a, opts.hemi ?? 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(opts.sunColor ?? 0xfff3dd, opts.sun ?? 2.1);
  const dir = opts.dir ?? [6, 12, 8];
  sun.position.set(...dir);
  sun.castShadow = opts.shadows !== false;
  const ext = opts.shadowExtent ?? 20;
  sun.shadow.camera.left = -ext;
  sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext;
  sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.mapSize.set(opts.shadowRes ?? 1024, opts.shadowRes ?? 1024);
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}
