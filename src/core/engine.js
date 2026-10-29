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
// Adaptive quality governor: when frames are sustainedly slow (below ~48 fps) it first
// refreshes the shadow map every other frame (an extra pass over every caster: on Beast
// Island ~40% of the draw calls; a one-frame-old shadow is invisible), then steps the
// render resolution down; when frames are fast again for a while it steps back up
// (waiting longer after each failed step up, so it never oscillates). ?gov=0 turns it off.
const GOV_LEVELS = [
  { res: 1, shadowEvery: 1 },
  { res: 1, shadowEvery: 2 },
  { res: 0.86, shadowEvery: 2 },
  { res: 0.74, shadowEvery: 2 },
  { res: 0.62, shadowEvery: 2 },
];
// Bloom picks pixels by their brightest channel (not luminance), so only HDR
// glow voxels (Mats.glow renders at 2.6x) bloom while sunlit toy plastic and
// white surfaces (max channel ~1.6) stay crisp. Scene thresholds below
// MIN_BLOOM_THRESHOLD are clamped up to it.
const DEFAULT_BLOOM = { strength: 0.45, radius: 0.12, threshold: 1.75 };
const MIN_BLOOM_THRESHOLD = 1.7;
const ENV_GAIN = 0.3;

// ---------------------------------------------------------------------------
// Colour grade (per scene, e.g. per arena): exposure, saturation, an S-curve
// contrast, a colour tint, a shadow lift tint and a vignette, applied right
// after Neutral tone mapping. It lives inside the tone-mapping function, so it
// costs no extra pass: in the composer path it runs once in the OutputPass, in
// the direct path (medium / low quality) it runs in every material's tone
// mapping. The uniforms are shared plain objects (ShaderLib uniform clones keep
// the reference), all zero = identity, so shaders that never receive them
// (custom ShaderMaterials) are unaffected.
const GRADE = { gradeA: { x: 0, y: 0, z: 0, w: 0 }, gradeB: { x: 0, y: 0, z: 0, w: 0 }, gradeC: { x: 0, y: 0, z: 0, w: 0 }, gradeD: { x: 0, y: 0, z: 0, w: 0 } };
const GRADE_UNIFORMS = Object.fromEntries(Object.entries(GRADE).map(([k, v]) => [k, { value: v }]));
(function patchToneMapping() {
  const C = THREE.ShaderChunk;
  if (C.tonemapping_pars_fragment.includes('gradeA')) return;
  C.tonemapping_pars_fragment = C.tonemapping_pars_fragment
    .replace('vec3 NeutralToneMapping( vec3 color ) {', 'vec3 NeutralToneMappingBase( vec3 color ) {')
    + `
uniform vec4 gradeA; // exposure, saturation, contrast, vignette (offsets, 0 = identity)
uniform vec4 gradeB; // tint rgb (multiplier - 1)
uniform vec4 gradeC; // shadow lift rgb
uniform vec4 gradeD; // 1 / drawing buffer size
vec3 NeutralToneMapping( vec3 color ) {
	color = NeutralToneMappingBase( color * ( 1.0 + gradeA.x ) );
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = max( mix( vec3( l ), color, 1.0 + gradeA.y ), 0.0 );
	vec3 p = sqrt( color );
	p = mix( p, p * p * ( 3.0 - 2.0 * p ), gradeA.z );
	color = p * p * ( 1.0 + gradeB.rgb );
	vec3 inv = 1.0 - clamp( color, 0.0, 1.0 );
	color += gradeC.rgb * inv * inv;
	if ( gradeA.w > 0.0 ) {
		vec2 uv = gl_FragCoord.xy * gradeD.xy - 0.5;
		color *= 1.0 - gradeA.w * smoothstep( 0.1, 0.55, dot( uv, uv ) );
	}
	return clamp( color, 0.0, 1.0 );
}`;
  for (const k in THREE.ShaderLib) Object.assign(THREE.ShaderLib[k].uniforms, GRADE_UNIFORMS);
})();

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
    this.frameNo = 0;
    this.covers = new Set();
    // perf stats (read by the ?dev=perf overlay and tests): smoothed frame interval + JS cost, last frame's draw calls / tris
    this.stats = { dt: 1 / 60, cpu: 0, worst: 0, calls: 0, tris: 0 };
    this.gov = { on: true, level: 0, avg: 1 / 60, slowT: 0, okT: 0, coolT: 2, ignoreT: 2, fails: 0, holdT: 0 };
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
    // shader error checks read the program info logs, which forces every shader compile to
    // finish synchronously (a long stall on phones); keep them for development only
    r.debug.checkShaderErrors = !!import.meta.env?.DEV;
    // stats cover the whole frame (shadow map + main pass + post passes), reset in frame()
    r.info.autoReset = false;
    const qs = new URLSearchParams(location.search);
    if (qs.get('gov') === '0') this.gov.on = false;
    if (qs.getAll('dev').includes('perf')) import('./perfHud.js').then((m) => m.mountPerfHud(this)).catch(() => {});
    if (typeof window !== 'undefined') window.__engine = this;

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
    Object.assign(this.outputPass.material.uniforms, GRADE_UNIFORMS);
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

  /**
   * Scene colour grade: { exposure, sat, contrast, tint: [r, g, b], lift: [r, g, b], vignette } as small
   * offsets around 0 (identity). Scenes set `grade`, or a direct child of their scene carries
   * `userData.grade` (battle arenas, Beast Island).
   */
  setGrade(g = null) {
    const { gradeA: A, gradeB: B, gradeC: C } = GRADE;
    A.x = g?.exposure ?? 0; A.y = g?.sat ?? 0; A.z = g?.contrast ?? 0; A.w = g?.vignette ?? 0;
    [B.x, B.y, B.z] = g?.tint ?? [0, 0, 0];
    [C.x, C.y, C.z] = g?.lift ?? [0, 0, 0];
    this.grade = g;
  }
  /** The grade a scene asks for (scene.grade, then scene.scene.userData / its direct children). */
  sceneGrade(sceneObj) {
    if (sceneObj?.grade !== undefined) return sceneObj.grade;
    const sc = sceneObj?.scene;
    if (!sc) return null;
    if (sc.userData?.grade) return sc.userData.grade;
    for (const c of sc.children) if (c.userData?.grade) return c.userData.grade;
    return null;
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
    const base = Math.min(dpr, Q.dpr);
    // the governor scales the resolution down while frames are slow (never below 0.75 CSS px)
    const ratio = this.retro ? clamp(RETRO_TARGET / Math.min(w, h * 1.25), 0.25, dpr) : Math.max(Math.min(base, 0.75), base * GOV_LEVELS[this.gov.level].res);
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    GRADE.gradeD.x = 1 / Math.max(1, Math.round(w * ratio));
    GRADE.gradeD.y = 1 / Math.max(1, Math.round(h * ratio));
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
    this.covers.clear();
    this.trauma = 0;
    this.timeScale = 1;
    this.hitstopT = 0;
    particles.attach(sceneObj.scene);
    particles.clear();
    // the router's fader / loading screen covers the canvas while a scene builds: drawing the
    // half-built scene every frame only slows the build (and the loading animation) down
    this.holdRender = true;
    try {
      if (sceneObj.enter) await sceneObj.enter(params);
      // compile the new scene's shaders now (in parallel where the GPU driver supports it),
      // behind the loading screen, instead of stalling on the first frames
      if (this.current === sceneObj) await this.precompile(sceneObj.scene, sceneObj.camera);
    } finally {
      this.holdRender = false;
    }
    this.gov.ignoreT = 2.5; // scene builds and first frames are not representative
    this.gov.check = undefined;
    this.renderer.shadowMap.needsUpdate = true;
    this.setBloom(sceneObj.bloom || {});
    this.setGrade(this.sceneGrade(sceneObj));
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

  /**
   * Opaque UI covers the whole canvas (e.g. a home tab): skip drawing the 3D scene until it
   * is uncovered (the canvas keeps showing the last frame). Cleared on every scene change.
   */
  cover(key, on = true) {
    if (on) this.covers.add(key);
    else this.covers.delete(key);
  }
  get covered() {
    return this.covers.size > 0;
  }

  onFrame(fn) {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  /**
   * Compile every material in `obj` (a scene, or objects about to be added to `target`)
   * ahead of use. Resolves when the shaders are ready (or after a safety timeout).
   */
  async precompile(obj, camera = this.current?.camera, target = null) {
    const r = this.renderer;
    if (!obj || !camera || !r?.compileAsync) return;
    try {
      const prev = r.getRenderTarget();
      // the composer path renders the scene into a linear HDR target (different shader variants)
      if (this.useComposer) r.setRenderTarget(this.composer.readBuffer);
      // without KHR_parallel_shader_compile the compile is synchronous either way (and
      // compileAsync would log a warning): compile directly, still ahead of the first frame
      const par = r.extensions.has('KHR_parallel_shader_compile');
      let p = null;
      try { if (par) p = r.compileAsync(obj, camera, target); else r.compile(obj, camera, target); } finally { r.setRenderTarget(prev); }
      if (p) await Promise.race([p, new Promise((res) => setTimeout(res, 5000))]);
    } catch (e) { /* precompiling is only an optimisation */ }
  }

  /**
   * Adaptive quality: watch the frame interval and step the resolution / shadow refresh down
   * while it stays slow, back up once it has been fast for a while. A step down that buys
   * nothing (a 30 fps power-save cap, a CPU-bound moment) is undone and not retried soon.
   */
  govern(rawDt) {
    const G = this.gov;
    if (!G.on || this.retro) return;
    if (G.coolT > 0) G.coolT -= rawDt;
    if (G.ignoreT > 0) { G.ignoreT -= rawDt; return; }
    // hitches (loading, tab switches, GC) are not a sustained frame rate
    if (rawDt > 0.25 || document.hidden) return;
    G.avg += (rawDt - G.avg) * 0.06;
    if (G.check !== undefined) {
      // judge the last step down once the new resolution has settled
      G.checkT -= rawDt;
      if (G.checkT <= 0) {
        const gain = G.avg < G.check * 0.93;
        G.check = undefined;
        if (!gain) { G.holdT = 60 * ++G.fails; this.setGovLevel(G.level - 1); return; }
      }
    }
    if (G.holdT > 0) G.holdT -= rawDt;
    const slow = G.avg > 1 / 48;
    const fast = G.avg < 1 / 56;
    G.slowT = slow ? G.slowT + rawDt : Math.max(0, G.slowT - rawDt * 0.5);
    G.okT = fast ? G.okT + rawDt : 0;
    if (G.coolT > 0) return;
    if (G.slowT > 1.5 && G.level < GOV_LEVELS.length - 1 && !(G.holdT > 0)) {
      const before = G.avg;
      // a step up that did not hold makes the next attempt wait longer
      if (G.upAt !== undefined && this.time - G.upAt < 8) G.fails++;
      this.setGovLevel(G.level + 1);
      G.check = before;
      G.checkT = 2;
    } else if (G.okT > Math.min(90, 6 * 2 ** G.fails) && G.level > 0) {
      G.upAt = this.time;
      this.setGovLevel(G.level - 1);
    }
  }
  setGovLevel(l) {
    const G = this.gov;
    const res0 = GOV_LEVELS[G.level].res;
    G.level = clamp(l, 0, GOV_LEVELS.length - 1);
    G.slowT = 0;
    G.okT = 0;
    G.coolT = 3;
    G.ignoreT = 0.6; // the resize itself hitches
    G.check = undefined;
    this.renderer.shadowMap.autoUpdate = true;
    if (GOV_LEVELS[G.level].res !== res0) this.resize();
  }

  frame(now) {
    const t0 = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    this.govern(dt);
    this.frameNo++;
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
    if (!cam || this.holdRender || this.covers.size) return;
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
    const info = this.renderer.info;
    info.reset();
    // under load the shadow map (a full extra pass over every caster) refreshes every other frame
    const every = GOV_LEVELS[this.gov.level].shadowEvery;
    const sm = this.renderer.shadowMap;
    if (every > 1) {
      sm.autoUpdate = false;
      if (this.frameNo % every === 0) sm.needsUpdate = true;
    } else sm.autoUpdate = true;
    this.render(cur.scene, cam);
    if (shaken) cam.position.sub(this.shakeOffset);
    const S = this.stats;
    S.calls = info.render.calls;
    S.tris = info.render.triangles;
    S.dt += (dt - S.dt) * 0.05;
    S.cpu += (performance.now() - t0 - S.cpu) * 0.05;
    S.worst = Math.max(S.worst, dt);
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
    const w = opts.w ?? size, hgt = opts.h ?? size;
    // resizing a WebGL canvas reallocates (and syncs) its drawing buffer: only when it changes
    if (r.getPixelRatio() !== 1) r.setPixelRatio(1);
    const cur = r.getSize(_tsz);
    if (cur.x !== w || cur.y !== hgt) r.setSize(w, hgt, false);
    else r.setViewport(0, 0, w, hgt);
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
    // thumbnails are never graded (the shared grade uniforms belong to the current scene)
    const saved = Object.values(GRADE).map((v) => [v.x, v.y, v.z, v.w]);
    for (const v of Object.values(GRADE)) v.x = v.y = v.z = v.w = 0;
    try {
      r.render(this.thumbScene, this.thumbCam);
    } finally {
      for (const m of swapped) m.envMap = this.envMap;
      Object.values(GRADE).forEach((v, i) => { [v.x, v.y, v.z, v.w] = saved[i]; });
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
const _tsz = new THREE.Vector2();
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
