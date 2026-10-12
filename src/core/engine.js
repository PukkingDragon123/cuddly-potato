// Engine: owns the WebGL renderer, post-processing (bloom), main loop, current
// scene, camera shake, hit-stop, quality presets and helpers for
// picking/projection and rendering 3D thumbnails for the UI.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { updateTweens } from './tween.js';
import { particles } from './particles.js';
import { allVariantMaterials, variantMaterials, Mats } from './voxel.js';
import { clamp } from './util.js';

/**
 * Quality presets.
 *  high:   MSAA + bloom + soft shadows, up to 2x device pixels
 *  medium: MSAA, soft shadows, up to 1.5x
 *  low:    no AA, basic shadows, 1x
 * The optional "retro" pixel filter renders at a low internal resolution.
 */
const QUALITY = {
  high: { dpr: 2, bloom: true, shadow: THREE.PCFShadowMap, shadowRes: 2048, aa: true },
  medium: { dpr: 1.5, bloom: false, shadow: THREE.PCFShadowMap, shadowRes: 1024, aa: true },
  low: { dpr: 1, bloom: false, shadow: THREE.BasicShadowMap, shadowRes: 1024, aa: false },
};
const RETRO_TARGET = 360;
// Bloom picks pixels by their brightest channel (not luminance), so only HDR
// glow voxels (Mats.glow renders at 2.6x) bloom while sunlit toy plastic and
// white surfaces (max channel ~1.6) stay crisp. Scene thresholds below
// MIN_BLOOM_THRESHOLD are clamped up to it.
const DEFAULT_BLOOM = { strength: 0.45, radius: 0.12, threshold: 1.75 };
const MIN_BLOOM_THRESHOLD = 1.7;
const ENV_GAIN = 0.3;

class Engine {
  constructor() {
    this.current = null;
    this.time = 0;
    this.timeScale = 1;
    this.hitstopT = 0;
    this.trauma = 0;
    this.shakeOffset = new THREE.Vector3();
    this.quality = 'high';
    this.retro = false;
    this.width = 1;
    this.height = 1;
    this.frameListeners = new Set();
    this.raycaster = new THREE.Raycaster();
    this.fps = 60;
    this.slowFrames = 0;
  }

  init() {
    this.canvas = document.getElementById('gl');
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x0b1230, 1);

    // Environment map: glossy toy plastic + chrome / silver / gold variants.
    this.envMap = makeEnvMap(r);
    for (const k of ['chrome', 'silver', 'gold']) variantMaterials(k);
    for (const m of [...allVariantMaterials(), Mats.toy, Mats.toyGloss]) {
      m.envMap = this.envMap;
      m.needsUpdate = true;
    }

    this.buildComposer();
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

  buildComposer() {
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(4, 4), DEFAULT_BLOOM.strength, DEFAULT_BLOOM.radius, DEFAULT_BLOOM.threshold);
    const hp = this.bloomPass.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('float v = luminance( texel.xyz );', 'float v = max( texel.r, max( texel.g, texel.b ) );');
    hp.needsUpdate = true;
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
  }

  /** Per-scene bloom tuning (scenes may also set `bloom` = {strength, radius, threshold}). */
  setBloom(o = {}) {
    const b = { ...DEFAULT_BLOOM, ...o };
    this.bloomPass.strength = b.strength;
    this.bloomPass.radius = Math.min(0.25, b.radius); // wide radii haze the whole screen around big neon signs
    this.bloomPass.threshold = Math.max(MIN_BLOOM_THRESHOLD, b.threshold);
  }

  setQuality(q = 'high', retro = false) {
    this.quality = QUALITY[q] ? q : 'high';
    this.retro = !!retro;
    const Q = QUALITY[this.quality];
    const r = this.renderer;
    if (r.shadowMap.type !== Q.shadow) {
      r.shadowMap.type = Q.shadow;
      r.shadowMap.needsUpdate = true;
      // shadow maps must be rebuilt for a new filter type
      this.current?.scene?.traverse((o) => {
        if (o.isLight && o.shadow?.map) { o.shadow.map.dispose(); o.shadow.map = null; }
      });
    }
    this.shadowRes = Q.shadowRes;
    document.body.classList.toggle('retro', this.retro);
    this.resize();
  }
  /** Back-compat with the old setting name. */
  setPixelMode(mode) {
    this.setQuality(this.quality, mode === 'retro' || mode === 'chunky');
  }

  get useComposer() {
    return QUALITY[this.quality].bloom && !this.retro && this.current?.bloom !== false;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w;
    this.height = h;
    const dpr = window.devicePixelRatio || 1;
    const Q = QUALITY[this.quality];
    const ratio = this.retro ? clamp(RETRO_TARGET / Math.min(w, h * 1.25), 0.25, dpr) : Math.min(dpr, Q.dpr);
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const de = document.documentElement.style;
    de.setProperty('--vw', w + 'px');
    de.setProperty('--vh', h + 'px');
    document.body.classList.toggle('portrait', h > w);
    document.body.classList.toggle('landscape', h <= w);
    if (this.current && this.current.resize) this.current.resize(w, h);
    else if (this.current && this.current.camera && this.current.camera.isPerspectiveCamera) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
    }
  }

  get aspect() {
    return this.width / this.height;
  }
  get portrait() {
    return this.height > this.width;
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
    this.setBloom(sceneObj.bloom || {});
    // apply the current shadow resolution to every shadow-casting light
    sceneObj.scene?.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow) o.shadow.mapSize.set(this.shadowRes ?? 2048, this.shadowRes ?? 2048);
    });
    this.resize();
  }

  /** Add camera trauma (0..1). Shake magnitude grows with trauma². */
  shake(amount) {
    if (this.shakeEnabled === false) return;
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
    // camera shake (screen-space offset along the camera's right/up axes)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * (cur.shakeScale ?? 1);
    let shaken = false;
    if (s > 0.0001) {
      const t = this.time * 38;
      const ox = (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1)) * 0.5 * s * 0.6;
      const oy = (Math.sin(t * 1.7 + 2) + Math.sin(t * 2.9)) * 0.5 * s * 0.6;
      _right.setFromMatrixColumn(cam.matrixWorld, 0);
      _up.setFromMatrixColumn(cam.matrixWorld, 1);
      this.shakeOffset.copy(_right).multiplyScalar(ox).addScaledVector(_up, oy);
      cam.position.add(this.shakeOffset);
      shaken = true;
    }
    this.render(cur.scene, cam);
    if (shaken) cam.position.sub(this.shakeOffset);
  }

  render(scene, cam) {
    if (this.useComposer) {
      this.renderPass.scene = scene;
      this.renderPass.camera = cam;
      this.composer.render();
    } else {
      this.renderer.render(scene, cam);
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
  /** Ray hitting the vertical plane z = z0 (side-view battle lanes). */
  rayToZPlane(clientX, clientY, z0 = 0, camera = this.current?.camera) {
    const ndc = new THREE.Vector2((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z0);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  /** Project a world position to CSS pixels. Returns {x,y,visible}. */
  toScreen(v, camera = this.current?.camera) {
    const p = _proj.copy(v).project(camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height, visible: p.z < 1 && p.z > -1 };
  }

  // ---------------------------------------------------------------------
  // Thumbnails: rendered with a small dedicated renderer (3-point studio
  // lighting, same tone mapping), returned as data URLs and cached by callers.
  renderThumb(obj, opts = {}) {
    const size = opts.size ?? 128;
    if (!this.thumbRenderer) {
      const c = document.createElement('canvas');
      const tr = (this.thumbRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true }));
      tr.outputColorSpace = THREE.SRGBColorSpace;
      tr.toneMapping = THREE.NeutralToneMapping;
      tr.toneMappingExposure = 1.12;
      const sc = (this.thumbScene = new THREE.Scene());
      sc.add(new THREE.HemisphereLight(0xe8f4ff, 0x5a4a6a, 1.5));
      const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
      key.position.set(3, 5, 6);
      const rim = new THREE.DirectionalLight(0x9fe6ff, 2.2);
      rim.position.set(-5, 3, -4);
      const fill = new THREE.DirectionalLight(0xffc8ec, 0.8);
      fill.position.set(-4, -1, 5);
      sc.add(key, rim, fill);
      this.thumbCam = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
      this.thumbEnv = makeEnvMap(tr);
    }
    const r = this.thumbRenderer;
    r.setPixelRatio(1);
    const w = opts.w ?? size, hgt = opts.h ?? size;
    r.setSize(w, hgt, false);
    r.setClearColor(0x000000, 0);
    this.thumbCam.aspect = w / hgt;
    this.thumbCam.updateProjectionMatrix();
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.y = opts.yaw ?? -0.5;
    this.thumbScene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    if (opts.focusHead) c.y = box.max.y - sz.y * 0.3;
    if (opts.lift) c.y += sz.y * opts.lift;
    const fitH = Math.max(sz.y, sz.x * hgt / w, sz.z * 0.8 * hgt / w);
    const rad = fitH * 0.6 * (opts.zoom ?? 1);
    const dist = rad / Math.tan(THREE.MathUtils.degToRad(13));
    const pitch = opts.pitch ?? 0.28;
    this.thumbCam.position.set(c.x, c.y + Math.sin(pitch) * dist, c.z + Math.cos(pitch) * dist);
    this.thumbCam.lookAt(c);
    // the main context's env map can't be sampled here: swap in this renderer's own
    const swapped = [];
    holder.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        if (m.envMap === this.envMap) { m.envMap = this.thumbEnv; swapped.push(m); }
      }
    });
    try {
      r.render(this.thumbScene, this.thumbCam);
    } finally {
      for (const m of swapped) m.envMap = this.envMap;
    }
    const url = r.domElement.toDataURL('image/png');
    this.thumbScene.remove(holder);
    return url;
  }
}

/**
 * Studio reflections for toy plastic + metal finishes. RoomEnvironment is
 * authored to light a scene on its own; our scenes already have sun + sky
 * lights, so it is dimmed (ENV_GAIN) or toy plastic ends up ~4x brighter than
 * the scenery (washed out, and blooming). Built per renderer: a PMREM texture
 * lives in its creator's WebGL context.
 */
function makeEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  room.traverse((o) => {
    if (o.isLight) o.intensity *= ENV_GAIN;
    if (o.material && o.material.emissiveIntensity !== undefined && o.material.emissive?.getHex()) o.material.emissiveIntensity *= ENV_GAIN;
  });
  const tex = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  return tex;
}

const _proj = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
export const engine = new Engine();

/**
 * Standard light rig used by most scenes: sky/ground hemisphere, a warm key
 * sun with soft shadows and a cool rim light from behind for that toy-shelf
 * "pop".
 */
export function addLights(scene, opts = {}) {
  const hemi = new THREE.HemisphereLight(opts.sky ?? 0xd6ecff, opts.ground ?? 0x6b5a6a, opts.hemi ?? 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(opts.sunColor ?? 0xfff1dc, opts.sun ?? 2.4);
  const dir = opts.dir ?? [6, 12, 8];
  sun.position.set(...dir);
  sun.castShadow = opts.shadows !== false;
  const ext = opts.shadowExtent ?? 20;
  sun.shadow.camera.left = -ext;
  sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext;
  sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = opts.shadowFar ?? 80;
  const res = opts.shadowRes ?? engine.shadowRes ?? 2048;
  sun.shadow.mapSize.set(res, res);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);
  let rim = null;
  if (opts.rim !== false) {
    rim = new THREE.DirectionalLight(opts.rimColor ?? 0x9fd8ff, opts.rimIntensity ?? 1.1);
    const rd = opts.rimDir ?? [-dir[0] * 0.6, dir[1] * 0.5, -Math.abs(dir[2])];
    rim.position.set(...rd);
    scene.add(rim);
  }
  return { hemi, sun, rim };
}
