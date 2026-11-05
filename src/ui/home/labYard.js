// The LAB tab's 3D lab compound: YOUR base (the one you defend in battle,
// src/models/props/base.js, in your Lab skin) big in the middle of a night-time
// lab yard, with your equipped LAB MODULES bolted on (src/models/props/labModules.js)
// and your Commander standing in front of it. Drawn behind the tab by the main
// renderer (engine.setBackdrop: no extra WebGL context, only while the tab covers
// the island), like the shop bunker and the pass.
//
//   setBase(tier, style, o)      swap the base (skin / tier) with a build animation
//   setModules(list, o)          equip: old part poofs, new one pops on
//   upgrade(cat, list)           scaffolding + welding sparks, then the new part pops on
//   setCommander(def, voice)     dress the Commander chibi
//   focus(target)                'yard' | 'base' | <module cat> | 'cmd' (smooth camera moves)
//   frame(rect)                  the screen rect to centre the shot in (CSS px)
//   pick(x, y)                   'cmd' | 'base' | <module cat> | null
//
// One instance for the session; release() frees GPU buffers when the tab closes.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { Chibi } from '../../core/chibi.js';
import { batchStatic } from '../../core/staticBatch.js';
import { neonSign } from '../../models/props/labDecor.js';
import { makeBase, makeScaffold } from '../../models/props/base.js';
import { attachModules, moduleSlot } from '../../models/props/labModules.js';
import { MODULES } from '../../data/labModules.js';
import { PixelFx, TILE } from './labStageFx.js';
import * as YP from './labYardProps.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const smooth = (x) => x * x * (3 - 2 * x);
const GRADE = { exposure: 0.06, sat: 0.12, contrast: 0.1, tint: [-0.005, 0.0, 0.02], lift: [0.006, 0.008, 0.02], vignette: 0.32 };
const BLOOM = { strength: 0.75, radius: 0.28, threshold: 1.5 };
const CMD_AT = new THREE.Vector3(2.4, 0, 0.5); // moved next to the base's front (the lane exit) by placeCmd()

export class LabYard {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    this.grade = GRADE;
    this.bloom = BLOOM;
    this.t = 0;
    this.ready = false;
    this.frameRect = null;
    this.target = 'yard';
    this.view = null; // current camera { cx, cy, cz, w, h }
    this.list = [];
    this.anims = [];
    this.updateFn = (dt) => this.update(dt);
    this.sfx = null; // (name, opts) => audio.play
  }

  // ------------------------------------------------------------------ build

  async build({ tier = 5, style = 'default', list = [], cmd = null } = {}) {
    if (this.ready || this.building) return this.building;
    this.building = (async () => {
      const sc = this.scene;
      sc.background = (this.skyTex = YP.skyTexture());
      sc.fog = new THREE.Fog(0x1a1838, 18, 34);
      this.buildLights();
      const env = (this.env = new THREE.Group());
      env.name = 'yardStill';
      sc.add(env);
      env.add(YP.floorMesh());
      const hangar = YP.hangarMesh();
      hangar.position.set(0, 0, YP.YARD.wallZ);
      env.add(hangar);
      await nextFrame();
      const sign = (this.sign = neonSign('BEAST LAB', { color: 0xff2e88, color2: 0xffd23f, bolts: true, vox: 0.07, step: 2 }));
      sign.position.set(0, 5.05, YP.YARD.wallZ + 0.9);
      sc.add(sign);
      for (const [x0, len] of [[-13.5, 7.2], [6.3, 7.2]]) {
        const f = YP.fenceMesh(len);
        f.position.set(x0, 0, YP.YARD.fenceZ);
        env.add(f);
      }
      const put = (m, x, z, ry = 0) => { m.position.set(x, 0, z); m.rotation.y = ry; m.castShadow = true; env.add(m); return m; };
      put(YP.crateStackMesh(), -7.4, -2.6, 0.3);
      put(YP.barrelsMesh(), 6.4, -2.4, -0.4);
      put(YP.conesMesh(), 5.2, 3.4, 0.2);
      put(YP.cableReelMesh(), -7.2, 2.6, -0.6);
      this.towers = [];
      for (const [x, z, d] of [[-6.2, -3.6, 1], [6.2, -3.6, -1]]) {
        const tw = YP.floodTowerMesh(d);
        put(tw.mesh, x, z, d * 0.5);
        this.towers.push(tw);
      }
      await nextFrame();
      this.fx = new PixelFx(600);
      sc.add(this.fx.points);
      // the base + modules
      this.baseGrp = new THREE.Group();
      sc.add(this.baseGrp);
      this.tier = tier;
      this.style = style;
      this.list = list;
      this.base = this.makeBase(tier, style);
      this.mods = attachModules(this.base, list, { side: 0 });
      await nextFrame();
      // your Commander
      this.cmdGrp = new THREE.Group();
      this.cmdGrp.position.copy(CMD_AT);
      sc.add(this.cmdGrp);
      if (cmd) this.setCommander(cmd);
      this.focus('yard', true);
      await engine.precompile(sc, this.camera);
      this.ready = true;
    })();
    return this.building;
  }

  buildLights() {
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(0x9aaae0, 0x2a2238, 2.3));
    const key = (this.key = new THREE.DirectionalLight(0xfff0dc, 2.8));
    key.position.set(5, 11, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sh = key.shadow.camera;
    sh.left = -8; sh.right = 8; sh.top = 8; sh.bottom = -6; sh.near = 1; sh.far = 30;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    sc.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x7aa8ff, 1.4);
    rim.position.set(-6, 6, -8);
    sc.add(rim);
    // floodlights + coloured accents
    this.flood = [new THREE.PointLight(0xfff0c8, 14, 14, 1.6), new THREE.PointLight(0xfff0c8, 14, 14, 1.6)];
    this.flood[0].position.set(-5.4, 5.4, -2.6);
    this.flood[1].position.set(5.4, 5.4, -2.6);
    this.neon = new THREE.PointLight(0xff2e88, 9, 9, 1.6);
    this.neon.position.set(0, 4.8, YP.YARD.wallZ + 1.6);
    this.door = new THREE.PointLight(0xffb060, 6, 7, 1.6);
    this.door.position.set(0, 0.6, YP.YARD.wallZ + 1.2);
    sc.add(...this.flood, this.neon, this.door);
  }

  makeBase(tier, style) {
    const b = makeBase(tier, { side: 0, style });
    // centre the footprint on the yard origin
    b.root.position.x = -(b.centerX ?? 0);
    for (const m of b.meshes ?? []) { m.castShadow = true; m.receiveShadow = true; }
    this.baseGrp.add(b.root);
    // your Commander stands at the lane exit, between the turret and the utility pad
    const x1 = Math.max(b.bounds?.x0 ?? 0, b.bounds?.x1 ?? 1.9) - (b.centerX ?? 0);
    CMD_AT.set(x1 + 1.75, 0, 0.85);
    this.cmdGrp?.position.copy(CMD_AT);
    return b;
  }

  // ------------------------------------------------------------------ show / hide (engine backdrop)

  attach() {
    if (!this.batch && this.env) { try { this.batch = batchStatic(this.env, { cell: 16 }); } catch (e) { this.batch = null; } }
    if (engine.backdrop?.owner !== this) engine.setBackdrop({ scene: this.scene, camera: this.camera, update: this.updateFn, bloom: this.bloom, grade: this.grade, owner: this });
  }
  detach() {
    if (engine.backdrop?.owner === this) engine.setBackdrop(null);
  }
  get live() {
    return engine.bdLive?.owner === this;
  }
  /** Free GPU buffers / textures / the shadow map (everything re-uploads on the next visit). */
  release() {
    this.detach();
    this.batch?.dispose();
    this.batch = null;
    for (const a of this.anims) a.finish?.();
    this.anims = [];
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.key?.shadow?.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    this.fx?.clear();
  }

  // ------------------------------------------------------------------ content

  setCommander(def) {
    if (!this.cmdGrp) return;
    const key = JSON.stringify(def);
    if (key === this.cmdKey) return;
    this.cmdKey = key;
    if (this.cmd) { this.cmdGrp.remove(this.cmd.root); this.cmd.dispose?.(); }
    const ch = (this.cmd = new Chibi(def, { scale: 1.0 }));
    ch.play('idle');
    ch.root.rotation.y = -0.25;
    this.cmdGrp.add(ch.root);
    ch.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.puff(CMD_AT.clone().setY(0.8), 18, [0xffffff, 0xffd23f, 0xff8ac0]);
  }

  /** Swap the base (tier / skin). o.animate: scaffolding + pop. */
  setBase(tier, style, o = {}) {
    if (!this.ready) { this.tier = tier; this.style = style; return; }
    if (tier === this.tier && style === this.style) return;
    this.tier = tier;
    this.style = style;
    const old = this.base, oldMods = this.mods;
    const swap = () => {
      this.baseGrp.remove(old.root);
      oldMods?.dispose();
      setTimeout(() => old.dispose?.(), 0);
      this.base = this.makeBase(tier, style);
      this.mods = attachModules(this.base, this.list, { side: 0 });
    };
    if (!o.animate) { swap(); return; }
    const w = Math.max(old.width ?? 4, 4) + 0.4, hgt = Math.max(old.height ?? 4, 4.5) + 0.4;
    let sc = null;
    try { sc = makeScaffold(w, hgt, { progress: 0 }); sc.root.position.x = 0; this.scene.add(sc.root); } catch (e) { sc = null; }
    this.sfx?.('drum', { pitch: 1.2 });
    let t = 0, swapped = false;
    const dur = 1.0;
    const a = {
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        sc?.setProgress(k);
        sc?.update(dt);
        if (Math.random() < dt * 18) this.weld(new THREE.Vector3((Math.random() - 0.5) * w, 0.4 + Math.random() * hgt, 0.8 + Math.random() * 0.8));
        if (!swapped) old.root.scale.set(1 + k * 0.04, Math.max(0.03, 1 - k * k), 1 + k * 0.04);
        if (t >= dur && !swapped) {
          swapped = true;
          swap();
          this.base.root.scale.set(1.2, 0.05, 1.2);
          this.pop(this.base.root, 0.7);
          this.puff(new THREE.Vector3(0, 0.3, 1), 40, [0xffffff, 0xd8d4cc, 0xffd23f]);
          this.confetti(new THREE.Vector3(0, Math.min(6, this.base.height ?? 4) + 0.6, 0.5), 70);
          this.sfx?.('levelUp');
          engine.shake(0.25);
        }
        if (t >= dur + 0.35) { a.finish(); return true; }
        return false;
      },
      finish: () => { if (sc) { this.scene.remove(sc.root); sc = null; } if (!swapped) { swapped = true; swap(); } },
    };
    this.anims.push(a);
  }

  /** Equip a new loadout. o.cat: the slot that changed (poof + pop); o.quiet: no fx. */
  setModules(list, o = {}) {
    this.list = list;
    if (!this.ready) return;
    const prev = this.mods;
    this.mods = attachModules(this.base, list, { side: 0 });
    prev?.dispose();
    const cat = o.cat;
    const m = cat && this.mods.get(cat);
    if (!m || o.quiet) return;
    const at = this.slotWorld(cat).setY(0.5);
    this.puff(at, 22, [0xffffff, 0xc8d0e0]);
    m.root.scale.set(1.3, 0.05, 1.3);
    this.pop(m.root, 0.55);
    this.stars(at.setY(m.height * 0.7), 16, [0xffffff, 0xffd23f, MODULE_TINT[cat] ?? 0x7ae8ff]);
    this.sfx?.('pop', { pitch: 1.1 });
  }

  /** Module upgrade: scaffolding + welding, then the new part pops on (~1.4 s). Resolves when the part lands. */
  upgrade(cat, list) {
    return new Promise((resolve) => {
      if (!this.ready) { this.list = list; resolve(); return; }
      const cur = this.mods.get(cat);
      const at = this.slotWorld(cat);
      const h = Math.max(1.6, (cur?.height ?? 1.6) + 0.3);
      let sc = null;
      try {
        sc = makeScaffold(1.6, h, { progress: 0 });
        sc.root.scale.set(0.8, 1, 0.42);
        sc.root.position.set(at.x, 0, at.z + 0.35);
        this.scene.add(sc.root);
      } catch (e) { sc = null; }
      this.sfx?.('drum', { pitch: 1.35 });
      let t = 0, swapped = false;
      const dur = 1.25;
      const swap = () => {
        swapped = true;
        this.setModules(list, { quiet: true });
        const m = this.mods.get(cat);
        if (m) {
          m.root.scale.set(1.35, 0.05, 1.35);
          this.pop(m.root, 0.6);
          m.fire?.();
        }
        const top = at.clone().setY((m?.height ?? 1.5) * 0.8);
        this.puff(at.clone().setY(0.4), 26, [0xffffff, 0xd8d4cc]);
        this.stars(top, 26, [0xffffff, 0xffd23f, MODULE_TINT[cat] ?? 0x7ae8ff]);
        this.confetti(top.setY(top.y + 0.6), 50, 1.2);
        this.sfx?.('levelUp');
        engine.shake(0.15);
        resolve();
      };
      const a = {
        update: (dt) => {
          t += dt;
          const k = Math.min(1, t / dur);
          sc?.setProgress(k);
          sc?.update(dt);
          if (cur) cur.root.position.y = Math.sin(t * 60) * 0.01;
          if (Math.random() < dt * 22) {
            this.weld(new THREE.Vector3(at.x + (Math.random() - 0.5) * 1.1, 0.3 + Math.random() * h, at.z + 0.55));
            if (Math.random() < 0.3) this.sfx?.('tick', { pitch: 1.5 + Math.random(), gap: 0.06, vol: 0.5 });
          }
          if (t >= dur && !swapped) swap();
          if (t >= dur + 0.3) { a.finish(); return true; }
          return false;
        },
        finish: () => { if (sc) { this.scene.remove(sc.root); sc = null; } if (!swapped) swap(); },
      };
      this.anims.push(a);
    });
  }

  /** World position of a module slot (on the ground). */
  slotWorld(cat, out = new THREE.Vector3()) {
    const b = this.base;
    const [x, z] = moduleSlot(b, cat);
    return out.set(x + b.root.position.x, 0, z);
  }

  // ------------------------------------------------------------------ pixel fx

  weld(p) {
    this.fx.burst(p, 4, { speed: 2.4, life: 0.35, size: 0.05, size1: 0.02, tile: TILE.spark, color: [0xffffff, 0xffe680, 0xffb02e], glow: 2.4, grav: -6, up: 1 });
  }
  puff(p, n = 16, colors = [0xffffff]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.2;
      this.fx.spawn({ x: p.x + Math.cos(a) * 0.3, y: p.y + Math.random() * 0.3, z: p.z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: 0.4 + Math.random() * 0.8, vz: Math.sin(a) * s * 0.6, drag: 2.4, life: 0.8 + Math.random() * 0.5, size: 0.14, size1: 0.36, tile: TILE.smoke, color: colors[i % colors.length], fadeIn: 0.05 });
    }
  }
  stars(p, n = 16, colors = [0xffffff]) {
    this.fx.burst(p, n, { speed: 3, life: 0.8, size: 0.13, size1: 0.04, tile: TILE.star, color: colors, glow: 2, grav: -3, up: 1.2 });
  }
  confetti(p, n = 60, spread = 1.6) {
    const conf = [0xff2e88, 0x29b6f6, 0xffd23f, 0x7cff6b, 0xb05cff, 0xff8a2a, 0xffffff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.2;
      this.fx.spawn({ x: p.x + (Math.random() - 0.5) * spread * 0.4, y: p.y, z: p.z, vx: Math.cos(a) * s * 0.7, vy: 1.8 + Math.random() * 2.4, vz: Math.sin(a) * s * 0.35 + 0.4, grav: -3.4, drag: 1.5, life: 2.2 + Math.random(), size: 0.11, flip: true, color: conf[i % conf.length], wobble: 1.2, floor: 0.02 });
    }
  }
  pop(obj, dur = 0.6) {
    let t = 0;
    const s0 = obj.scale.clone();
    const sx = obj.scale.x < 0 ? -1 : 1;
    const a = {
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        // elastic out
        const e = k === 1 ? 1 : 1 - Math.pow(2, -9 * k) * Math.cos(k * 9.5);
        obj.scale.set(sx * Math.abs(s0.x + (1 - Math.abs(s0.x)) * e), s0.y + (1 - s0.y) * e, s0.z + (1 - s0.z) * e);
        return k >= 1;
      },
      finish: () => obj.scale.set(sx, 1, 1),
    };
    this.anims.push(a);
  }

  // ------------------------------------------------------------------ camera

  /** Camera target: 'yard' | 'base' | 'cmd' | <module cat>. */
  focus(target, snap = false) {
    this.target = target;
    const want = this.shotFor(target);
    if (snap || !this.view) this.view = { ...want };
    this.want = want;
  }
  shotFor(target) {
    const b = this.base;
    const H = Math.min(6.6, b?.height ?? 4.5);
    if (target === 'cmd') return { cx: CMD_AT.x - 0.15, cy: 1.15, cz: CMD_AT.z, w: 2.6, h: 2.9, yaw: -0.2, pitch: 0.1 };
    if (target === 'base') return { cx: 0, cy: H * 0.5, cz: 0, w: 5.6, h: H + 0.9, yaw: -0.1, pitch: 0.16 };
    if (MODULES_CATS.has(target)) {
      const p = this.slotWorld(target);
      const m = this.mods?.get(target);
      const mh = Math.max(1.3, m?.height ?? 1.6);
      return { cx: p.x, cy: Math.max(1.1, mh * 0.5), cz: p.z, w: Math.max(4, mh * 1.1), h: Math.max(3, mh + 1.2), yaw: p.x < 0 ? 0.3 : -0.26, pitch: 0.17 };
    }
    return { cx: 0.45, cy: H * 0.46 + 0.1, cz: 0.4, w: 8.2, h: H + 1.4, yaw: -0.16, pitch: 0.2 };
  }
  frame(rect) {
    this.frameRect = rect;
  }
  layoutCamera(dt) {
    const W = engine.width, Hs = engine.height, cam = this.camera;
    const r = this.frameRect ?? { left: 0, top: 0, width: W, height: Hs * 0.55 };
    const v = this.view, w = this.want ?? v;
    const k = 1 - Math.exp(-dt * 3.2);
    for (const key of ['cx', 'cy', 'cz', 'w', 'h', 'yaw', 'pitch']) v[key] += (w[key] - v[key]) * k;
    // distance that fits w x h into the frame rect
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fitH = v.h / (2 * th) * (Hs / Math.max(80, r.height));
    const fitW = v.w / (2 * th * (W / Hs)) * (W / Math.max(80, r.width));
    const dist = Math.max(fitH, fitW) * 1.04;
    const yaw = v.yaw + Math.sin(this.t * 0.13) * 0.05;
    const pitch = v.pitch;
    const look = (this._look ??= new THREE.Vector3()).set(v.cx, v.cy, v.cz);
    cam.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.aspect = W / Hs;
    cam.lookAt(look);
    // fog starts just behind the subject (the hangar fades into the night, the base never does)
    this.scene.fog.near = dist + 3;
    this.scene.fog.far = dist + 26;
    cam.far = dist + 60;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    cam.setViewOffset(W, Hs, W / 2 - cx, Hs / 2 - cy, W, Hs);
    cam.updateProjectionMatrix();
  }

  /** What's under a screen point (CSS px). */
  pick(x, y) {
    if (!this.ready) return null;
    const objs = [];
    if (this.cmd) objs.push(this.cmd.root);
    for (const c of Object.keys(this.mods?.mods ?? {})) objs.push(this.mods.mods[c].root);
    objs.push(this.base.root);
    const hit = engine.raycast(x, y, objs, this.camera, true)[0];
    if (!hit) return null;
    for (let o = hit.object; o; o = o.parent) {
      if (o === this.cmd?.root) return 'cmd';
      for (const [c, m] of Object.entries(this.mods?.mods ?? {})) if (o === m.root) return c;
      if (o === this.base.root) return 'base';
    }
    return null;
  }
  /** Screen point above the Commander's head (speech bubble anchor). */
  cmdHead(out = {}) {
    if (!this.cmd || !this.cmdGrp.visible) return null;
    const v = (this._hv ??= new THREE.Vector3());
    this.cmd.root.updateWorldMatrix(true, true);
    v.set(0, (this.cmd.headTopY ?? 1.1) * 1.25 + 0.15, 0);
    this.cmd.root.localToWorld(v);
    const s = engine.toScreen(v, this.camera);
    out.x = s.x; out.y = s.y;
    return out;
  }
  /** Screen point of a module slot's top (for labels / taps). */
  slotScreen(cat) {
    const m = this.mods?.get(cat);
    const p = this.slotWorld(cat, this._sv ??= new THREE.Vector3()).setY((m?.height ?? 1.4) + 0.15);
    return engine.toScreen(p, this.camera);
  }

  // ------------------------------------------------------------------ frame

  update(dt) {
    if (!this.ready) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t;
    this.layoutCamera(dt);
    this.base?.update(dt);
    this.mods?.update(dt);
    this.cmd?.update(dt);
    // module close-ups: the Commander steps out of the shot (he stands right in front of the lane-side slots)
    if (this.cmdGrp) {
      const want = MODULES_CATS.has(this.target) ? 0 : 1;
      const k = this.cmdGrp.scale.x + (want - this.cmdGrp.scale.x) * Math.min(1, dt * 9);
      this.cmdGrp.scale.setScalar(Math.abs(k - want) < 0.02 ? want : k);
      this.cmdGrp.visible = this.cmdGrp.scale.x > 0.03;
    }
    // the Commander idles: glances at the base now and then
    if (this.cmd && t > (this.nextIdle ?? 3)) {
      this.nextIdle = t + 5 + Math.random() * 5;
      if (!this.cmd.animDur) this.cmd.play(Math.random() < 0.5 ? 'lookAround' : 'crossArms', { dur: 2.2 });
    }
    for (let i = this.anims.length - 1; i >= 0; i--) if (this.anims[i].update(dt)) this.anims.splice(i, 1);
    // ambient module fx: reactor steam, tesla crackle, acid drips
    this.ambient(dt);
    this.neon.intensity = 8.5 + Math.sin(t * 7) * 0.4 + (Math.random() < 0.01 ? -5 : 0);
    this.sign.material && (this.sign.material.color.setScalar(2.6 * (this.neon.intensity > 6 ? 1 : 0.55)));
    this.batch?.check?.();
    this.fx.update(dt, this.camera);
  }
  ambient(dt) {
    const mods = this.mods?.mods ?? {};
    const p = this._ap ??= new THREE.Vector3();
    for (const [cat, m] of Object.entries(mods)) {
      m.acc = (m.acc ?? Math.random()) + dt;
      if (m.id === 'reactor' && m.acc > 0.22) {
        m.acc = 0;
        for (const v of m.vents ?? []) {
          p.set(...v);
          m.root.localToWorld(p);
          this.fx.spawn({ x: p.x + (Math.random() - 0.5) * 0.2, y: p.y, z: p.z, vx: 0.15 + Math.random() * 0.1, vy: 0.5 + Math.random() * 0.3, drag: 0.6, life: 2.4, size: 0.18, size1: 0.6, tile: TILE.smoke, color: 0xe8ecf4, fadeIn: 0.2 });
        }
      } else if (m.id === 'teslaCoil' && m.acc > 1.6) {
        m.acc = 0;
        const top = m.muzzle(p);
        this.fx.burst(top, 6, { speed: 2.4, life: 0.25, size: 0.06, size1: 0.02, tile: TILE.spark, color: [0xbff6ff, 0xffffff, 0xff4fd8], glow: 2.6, grav: 0 });
        this.sfx?.('zap', { pitch: 1.6, vol: 0.12, gap: 0.4 });
      } else if (m.id === 'acidSprinkler' && m.acc > 0.12) {
        m.acc = 0;
        const top = m.muzzle(p);
        const a = Math.random() * Math.PI * 2;
        this.fx.spawn({ x: top.x + Math.cos(a) * 0.4, y: top.y - 0.05, z: top.z + Math.sin(a) * 0.4, vx: Math.cos(a) * 0.6, vy: 0.2, vz: Math.sin(a) * 0.4, grav: -5, life: 0.8, size: 0.06, tile: TILE.drop, color: 0x7cff3a, glow: 1.6, floor: 0.06 });
      } else if (m.id === 'cloningVat' && m.acc > 0.3) {
        m.acc = 0;
        const c = m.muzzle(p);
        this.fx.spawn({ x: c.x + (Math.random() - 0.5) * 0.3, y: 0.45, z: c.z + (Math.random() - 0.5) * 0.3, vy: 0.4 + Math.random() * 0.2, life: 1.8, size: 0.05, tile: TILE.bubble, color: 0xb8ff7a, glow: 1.4 });
      }
      void cat;
    }
  }
}

const MODULES_CATS = new Set(['power', 'defense', 'utility', 'roof']);
const MODULE_TINT = { power: 0xffd23f, defense: 0xff5a5a, utility: 0x5fe08a, roof: 0x7ae8ff };
void MODULES;

let single = null;
/** The session's one lab yard (built on first use). */
export function labYard() {
  single ??= new LabYard();
  return single;
}
