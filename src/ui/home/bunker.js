// The SHOP's secret bunker: a small live voxel diorama drawn behind the shop tab
// (engine.setBackdrop: same renderer, no extra WebGL context, only while the tab
// covers the island). Concrete block walls with a hazard band, a blast door with
// a blinking warning light, a half-open vault full of gold, a corkboard with a
// map and red string, a cart of CRT monitors, crates of contraband snacks,
// sandbags, camo netting and a swaying caged lamp. Behind the counter stands
// "Lonan" (Nolan in a trench coat, fedora, spy shades and a stick-on mustache):
// he drums on the counter and glances around, peeks over his shades, flashes his
// coat open (cards pinned inside) when you buy something and slides the goods out.
//
// One instance lives for the whole session (built once, in slices, the first
// time the shop opens); closing the shop frees its GPU buffers and textures
// (three re-uploads them on the next visit), so tab hopping never grows memory.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { rbox } from '../../models/kit.js';
import { shade, hash3 } from '../../core/util.js';
import { S2, n3, SPECS, VAULT_HINGE, crtScreens, bakeSpec, toGeometry } from './bunkerProps.js';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { engine } from '../../core/engine.js';
import { buildAccessory } from '../../models/characters/accessories.js';

/** Coat flaps for the seller's trench coat (outer coat layer, satin lining, belt, buttons). */
function buildFlap(def, side) {
  // torso-local voxels (H = 0.05): side -1 = his right side of the coat on screen-left (x -6..-1)
  const g = new VoxGrid(), items = new VoxGrid();
  const coat = def.coat, lining = 0x7a1a2e, belt = 0x4a3020;
  const w = 6;
  for (let i = 0; i < w; i++)
    for (let y = -1; y <= 9; y++) {
      // lapel V: the flap's inner edge recedes towards the collar
      const lap = y >= 5 ? Math.ceil((y - 4) * 0.8) : 0;
      if (i >= w - lap) continue;
      const x = side < 0 ? i : -i; // grows from the hinge towards the middle
      let c = shade(coat, (n3(i, y, side) - 0.5) * 0.06);
      if (i === w - lap - 1 && y >= 5) c = shade(coat, -0.14); // lapel edge
      if (y === 2 || y === 3) c = y === 3 ? shade(belt, 0.1) : belt;
      if (i === 3 && (y === 0 || y === 6) && side < 0) c = 0x2a1a12; // buttons
      g.set(x, y, 1, c);
      g.set(x, y, 0, i === 0 ? shade(coat, -0.2) : lining);
    }
  // belt buckle on the overlapping flap
  if (side < 0) { g.set(4, 2, 2, 0xc8b070); g.set(5, 2, 2, 0xc8b070); g.set(4, 3, 2, 0xc8b070); g.set(5, 3, 2, 0xc8b070); }
  // contraband pinned inside: cards in rarity colours, a fake watch, a chain
  const cards = side < 0 ? [0x8ab0ff, 0xff9a2e, 0xc063ff] : [0x3ff2c8, 0xffd23f, 0xff6ab4];
  cards.forEach((c, k) => {
    const y0 = 7 - k * 3, x0 = 1 + (k % 2);
    for (let i = 0; i < 2; i++) for (let y = y0 - 2; y <= y0; y++) items.set(side < 0 ? x0 + i : -(x0 + i), y, -1, y === y0 ? 0xffffff : c);
  });
  if (side > 0) for (let y = -1; y <= 6; y++) items.set(-4, y, -1, y % 2 ? 0xffd23f : 0xe0a420);
  else { items.set(4, -1, -1, 0xd8dce4); items.set(4, 0, -1, 0x2a6a8a); }
  return { g, items };
}

// ---------------------------------------------------------------------------
// Stencil decals: spray-painted pixel text (the game's pixel display font, thresholded to hard
// pixels, with worn-off specks and the stencil bridges), lit by the scene like paint.

function decal(text, o = {}) {
  const ph = o.px ?? 14; // canvas px per text line
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.font = `${ph}px "Swarm Display", monospace`;
  const lines = String(text).split('\n');
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + 4), hgt = Math.ceil(lines.length * ph * 0.92 + 3);
  c.width = w; c.height = hgt;
  ctx.font = `${ph}px "Swarm Display", monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 2 + i * ph * 0.92));
  const img = ctx.getImageData(0, 0, w, hgt), d = img.data;
  const col = new THREE.Color(o.color ?? 0xe8e2d4);
  const R = Math.round(col.r * 255), G = Math.round(col.g * 255), B = Math.round(col.b * 255);
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let on = d[i + 3] > 110;
      if (on && hash3(x, y, 7) < (o.wear ?? 0.1)) on = false;
      if (on && o.bridges !== false && y === Math.floor(hgt * 0.5) && hash3(x >> 2, 1, 3) < 0.35) on = false;
      const k = 0.88 + hash3(x, y, 11) * 0.12;
      d[i] = R * k; d[i + 1] = G * k; d[i + 2] = B * k; d[i + 3] = on ? 255 : 0;
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
  const hW = o.h * (w / hgt);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(hW, o.h), mat);
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------------------
// CRT screen art (tiny canvases, redrawn a few times a second)

const CRT_W = 40, CRT_H = 30;
function crtPainter(kind) {
  const c = document.createElement('canvas');
  c.width = CRT_W; c.height = CRT_H;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  let t = 0;
  const G = '#7dff9a', GD = '#2a8a4a', BG = '#06140c';
  const draw = (dt, stamp = 0) => {
    t += dt;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, CRT_W, CRT_H);
    if (kind === 0) {
      // security feed: the corridor outside, a Swarm wandering past, REC dot
      ctx.fillStyle = '#0e2a18';
      ctx.fillRect(0, 18, CRT_W, 12);
      ctx.fillStyle = GD;
      for (let x = 0; x < CRT_W; x += 8) ctx.fillRect(x, 18, 1, 12);
      ctx.fillRect(0, 18, CRT_W, 1);
      const px = Math.floor(((t * 6) % (CRT_W + 16)) - 8);
      ctx.fillStyle = G;
      ctx.fillRect(px, 13, 6, 4); ctx.fillRect(px + 1, 11, 2, 2); ctx.fillRect(px + 4, 11, 2, 2); ctx.fillRect(px + (Math.floor(t * 8) % 2), 17, 2, 2); ctx.fillRect(px + 4 - (Math.floor(t * 8) % 2), 17, 2, 2);
      if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#ff4a3a'; ctx.fillRect(2, 2, 3, 3); }
      ctx.fillStyle = G; ctx.fillRect(7, 3, 1, 1); ctx.fillRect(9, 3, 1, 1); ctx.fillRect(11, 3, 1, 1);
    } else if (kind === 1) {
      // stock monitor: bars that jitter, one blinking LOW
      for (let i = 0; i < 6; i++) {
        const hgt = 4 + Math.round((Math.sin(t * 1.3 + i * 1.9) * 0.5 + 0.5) * 14);
        ctx.fillStyle = i === 3 ? (Math.floor(t * 3) % 2 ? '#ffd84a' : GD) : G;
        ctx.fillRect(3 + i * 6, 26 - hgt, 4, hgt);
      }
      ctx.fillStyle = GD; ctx.fillRect(2, 26, 36, 1);
    } else {
      // scrolling ledger lines + a sale blip when something was just bought
      const off = Math.floor(t * 10) % 4;
      for (let row = 0; row < 8; row++) {
        const y = 2 + row * 4 - off;
        if (y < 1 || y > CRT_H - 3) continue;
        const len = 6 + Math.floor(hash3(row + Math.floor(t * 2.5), 3, 1) * 26);
        ctx.fillStyle = row % 3 === 0 ? '#ffd84a' : G;
        for (let x = 2; x < 2 + len; x += 2) if (hash3(x, row, Math.floor(t * 2.5)) > 0.2) ctx.fillRect(x, y, 1, 2);
      }
      if (stamp > 0) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(4, 10, 32, 10); ctx.fillStyle = BG; ctx.fillRect(6, 12, 28, 6); ctx.fillStyle = '#ffd84a'; for (let i = 0; i < 6; i++) ctx.fillRect(9 + i * 4, 14, 2, 2); }
    }
    // scanlines + vignette corners
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 0; y < CRT_H; y += 2) ctx.fillRect(0, y, CRT_W, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (const [x, y] of [[0, 0], [CRT_W - 2, 0], [0, CRT_H - 2], [CRT_W - 2, CRT_H - 2]]) ctx.fillRect(x, y, 2, 2);
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Baking the room: a Web Worker does it off the main thread (started early by prewarmBunker(), so the
// first SHOP visit usually finds it done); without workers it is baked here, one piece per frame.

let bakeJob = null;
function bakeInWorker() {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('./bunkerWorker.js', import.meta.url), { type: 'module' }); } catch (e) { reject(e); return; }
    const kill = setTimeout(() => { w.terminate(); reject(new Error('bunker worker timeout')); }, 20000);
    w.onmessage = (e) => { clearTimeout(kill); w.terminate(); if (Array.isArray(e.data)) resolve(e.data); else reject(new Error(String(e.data?.error ?? 'bunker worker failed'))); };
    w.onerror = (e) => { clearTimeout(kill); w.terminate(); reject(e instanceof Error ? e : new Error(e.message || 'bunker worker error')); };
    w.postMessage('bake');
  });
}
async function bakeHere() {
  const out = [];
  for (const sp of SPECS) { out.push(bakeSpec(sp)); await nextFrame(); }
  return out;
}
function bakeRoom() {
  if (!bakeJob) bakeJob = (typeof Worker !== 'undefined' ? bakeInWorker() : Promise.reject(new Error('no workers'))).catch(() => bakeHere());
  return bakeJob;
}
/** Start baking the room in the background (no main-thread cost when workers are available). */
export function prewarmBunker() {
  if (typeof Worker !== 'undefined') bakeRoom();
}

const GRADE = { exposure: 0.02, sat: -0.02, contrast: 0.12, tint: [0.04, 0.01, -0.03], lift: [0.012, 0.004, 0.0], vignette: 0.4 };
const BLOOM = { strength: 0.55, radius: 0.18, threshold: 1.75 };

export class Bunker {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0a0a);
    this.scene.fog = new THREE.Fog(0x0c0a0a, 14, 30);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    this.grade = GRADE;
    this.bloom = BLOOM;
    this.t = 0;
    this.ready = false;
    this.frameRect = null;
    this.scrollY = 0;
    this.acts = [];
    this.disposables = [];
    this.textures = [];
    this.updateFn = (dt) => this.update(dt);
  }

  /** Build the diorama (sliced over a few frames so the tab never freezes). */
  async build() {
    if (this.ready || this.building) return this.building;
    this.building = (async () => {
      const sc = this.scene;
      // lights: dim cool ambience, the warm swaying lamp (shadows), a lamp over the board, CRT glow, the door's warning light
      sc.add(new THREE.HemisphereLight(0x9aa8c8, 0x3a2e24, 1.1));
      const spot = (this.spot = new THREE.SpotLight(0xffcf96, 34, 12, 0.62, 0.6, 1.6));
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0005;
      spot.shadow.normalBias = 0.02;
      spot.shadow.camera.near = 0.3;
      spot.shadow.camera.far = 8;
      spot.target.position.set(-0.1, 0.8, 0.2);
      sc.add(spot, spot.target);
      const fill = new THREE.PointLight(0xffb878, 3.2, 6, 1.5);
      fill.position.set(-1.35, 2.75, -1.0);
      const crt = (this.crtLight = new THREE.PointLight(0x6aff9a, 1.4, 3, 1.5));
      crt.position.set(1.4, 1.5, -0.4);
      const warn = (this.warnLight = new THREE.PointLight(0xff3a2a, 0, 4, 1.5));
      warn.position.set(1.4, 2.7, -1.0);
      const front = new THREE.DirectionalLight(0xc8d4ff, 0.7);
      front.position.set(1.5, 2.5, 6);
      // a warm bounce on his face (under the hat brim) and a cool rim that lifts him off the wall
      const face = new THREE.PointLight(0xffc890, 3.2, 4.5, 1.6);
      face.position.set(0.5, 1.75, 1.7);
      const rim = new THREE.DirectionalLight(0x8ab4ff, 1.1);
      rim.position.set(-3, 3.5, -4);
      sc.add(fill, crt, warn, front, face, rim);
      // the room's voxels come pre-baked (Web Worker), or are baked here a piece per frame
      const baked = await bakeRoom();
      const geo = {};
      for (const r of baked) geo[r.key] = toGeometry(r);
      await nextFrame();
      const spec = Object.fromEntries(SPECS.map((x) => [x.key, x]));
      const add = (key, o = {}) => {
        const m = new THREE.Mesh(geo[key], Mats.pair);
        m.castShadow = !!spec[key].cast;
        m.receiveShadow = o.receive !== false;
        (o.parent ?? sc).add(m);
        return m;
      };
      for (const k of ['walls', 'floor', 'apron', 'door', 'vault', 'board', 'crates', 'pipes']) add(k);
      add('net', { receive: false });
      const vd = new THREE.Group();
      vd.position.fromArray(VAULT_HINGE);
      vd.rotation.y = -1.75;
      add('vaultDoor', { parent: vd });
      sc.add(vd);
      this.crtMesh = add('crts');
      this.counter = add('counter');
      this.topMesh = add('top');
      this.screens = crtScreens().map((s, i) => {
        const p = crtPainter(i);
        const mat = new THREE.MeshBasicMaterial({ map: p.tex, toneMapped: false });
        mat.color.setScalar(1.9);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
        m.position.set(s.x, s.y, s.z);
        sc.add(m);
        this.textures.push(p.tex);
        this.disposables.push(m.geometry, mat);
        return { ...p, mesh: m, acc: Math.random() * 0.2, stamp: 0 };
      });
      // the swaying lamp over the counter
      this.lamp = new THREE.Group();
      this.lamp.position.set(0.95, 5.0, 0.6);
      add('lamp', { parent: this.lamp, receive: false });
      sc.add(this.lamp);
      // warning light (blinks): its own little mesh so only it changes colour
      const wl = new VoxGrid();
      rbox(wl, -82, 60, -30, -78, 63, -27, 1, 0xff3a2a, { glow: true });
      for (let x = -83; x <= -77; x++) wl.set(x, 59, -29, 0x2a2a2a);
      // a second beacon on the wall over the CRTs (in view on phones)
      rbox(wl, 30, 51, -30, 33, 53, -27, 1, 0xff3a2a, { glow: true });
      for (let x = 29; x <= 34; x++) for (let z = -31; z <= -27; z++) wl.set(x, 50, z, 0x2a2a2a);
      const wlGeo = wl.build({ scale: S2, pivot: 'none', jitter: 0 });
      this.warnMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      const wlm = new THREE.Mesh(wlGeo, [this.warnMat, this.warnMat]);
      sc.add(wlm);
      this.disposables.push(this.warnMat);
      // dust motes in the lamp light (square pixel points)
      const N = 46, pos = new Float32Array(N * 3);
      this.motes = [];
      for (let i = 0; i < N; i++) {
        const m = { x: (Math.random() - 0.5) * 2.4, y: 0.9 + Math.random() * 2.6, z: -0.6 + Math.random() * 1.6, s: 0.4 + Math.random() * 0.6, ph: Math.random() * 6 };
        this.motes.push(m);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({ color: 0xffd8a0, size: 0.022, transparent: true, opacity: 0.7, depthWrite: false });
      this.dust = new THREE.Points(pg, pm);
      this.dust.frustumCulled = false;
      sc.add(this.dust);
      this.disposables.push(pm);
      await nextFrame();
      try { await document.fonts?.load?.('14px "Swarm Display"'); } catch (e) { /* fallback font */ }
      for (const [text, o, x, y, z, ry] of [
        ['NO\nREFUNDS', { h: 0.2, color: 0x1a1410, wear: 0.03, bridges: false, px: 12 }, -0.75, 1.1, 0.758, 0],
        ['B-7', { h: 0.42, color: 0xf0ece0, wear: 0.12 }, -4.0, 2.25, -1.49, 0],
        ['B-7', { h: 0.34, color: 0xe8b830, wear: 0.14 }, -1.3, 2.62, -1.58, 0],
        ['SNACKS', { h: 0.17, color: 0x2a1a10, wear: 0.2, bridges: false }, -2.15, 0.42, 1.86, 0],
        ['NOT VIALS', { h: 0.11, color: 0x2a1a10, wear: 0.2, bridges: false }, -2.15, 1.02, 1.76, 0],
        ['FIZZY', { h: 0.13, color: 0x2a1a10, wear: 0.2, bridges: false }, -1.25, 0.32, 1.96, 0],
        ['KEEP OUT', { h: 0.2, color: 0xd8301e, wear: 0.16 }, 2.15, 2.75, -1.59, 0],
        ['BUCKS ONLY', { h: 0.16, color: 0xe8e0cc, wear: 0.12, bridges: false }, 0, 0.5, 0.958, 0],
      ]) {
        const m = decal(text, o);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        sc.add(m);
        this.textures.push(m.material.map);
        this.disposables.push(m.material);
      }
      this.buildSeller();
      await engine.precompile(sc, this.camera);
      this.ready = true;
    })();
    return this.building;
  }

  /** Lonan: the chibi (shades as their own mesh so he can peek over them) + hinged coat flaps. */
  buildSeller() {
    const def = CHARACTERS.shadyNolan;
    const body = { ...def, acc: def.acc.filter((a) => (a.type ?? a) !== 'spyShades') };
    const ch = (this.nolan = new Chibi(body, { fidget: false }));
    ch.root.position.set(0, 0.5, -0.12);
    this.scene.add(ch.root);
    ch.play('counterTap');
    // spy shades (built by the same accessory code as the face-cam version)
    const sg = new VoxGrid(), sm = new VoxGrid();
    buildAccessory({ type: 'spyShades' }, 'head', sg, sm, def);
    const shades = (this.shades = new THREE.Mesh(sg.build({ scale: S2, pivot: [0, 0, 0], jitter: 0.02 }), Mats.pair));
    shades.castShadow = true;
    ch.head.add(shades);
    // coat flaps hinged at the sides of the torso
    this.flaps = [-1, 1].map((side) => {
      const f = buildFlap(def, side);
      const grp = new THREE.Group();
      grp.position.set((side < 0 ? -6 : 6) * S2, 0, 5 * S2);
      const m = new THREE.Mesh(f.g.build({ scale: S2, pivot: [0, 0, 0], jitter: 0.02 }), [ch.meshes[0]?.material?.[0] ?? Mats.solid, Mats.glow]);
      m.castShadow = true;
      const it = new THREE.Mesh(f.items.build({ scale: S2, pivot: [0, 0, 0], jitter: 0 }), Mats.pair);
      it.visible = false;
      grp.add(m, it);
      ch.torso.add(grp);
      return { grp, items: it, side, a: 0, v: 0, target: 0 };
    });
    // the parcel that slides out of the coat on a sale
    const pg = new VoxGrid();
    rbox(pg, -3, 0, -2, 3, 4, 2, 0, (x, y, z) => (x === 0 || y === 2 ? 0xd83a3a : 0xc8a070));
    pg.set(0, 5, 0, 0xd83a3a); pg.set(-1, 5, 0, 0xd83a3a); pg.set(1, 5, 0, 0xd83a3a);
    this.parcel = makeMesh(pg.build({ scale: S2, pivot: 'center', jitter: 0.03 }), Mats.pair);
    this.parcel.visible = false;
    this.scene.add(this.parcel);
    this.peek = 0; // shades slide down the nose (0..1)
    this.peekT = 0;
    this.mode = 'idle';
    this.modeT = 0;
    this.nextGlance = 3;
  }

  // ------------------------------------------------------------------ show / hide

  attach() {
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
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const t of this.textures) t.dispose();
    if (this.spot?.shadow?.map) { this.spot.shadow.map.dispose(); this.spot.shadow.map = null; }
    this.parcelT = null;
    if (this.parcel) this.parcel.visible = false;
  }

  /** Frame the seller inside a screen rect (CSS px); scrollY slides him up with the page. */
  frame(rect, scrollY = 0) {
    this.frameRect = rect;
    this.scrollY = scrollY;
  }

  layoutCamera() {
    const W = engine.width, H = engine.height, cam = this.camera;
    const r = this.frameRect ?? { left: 0, top: 0, width: W, height: H * 0.45 };
    // subject: counter top to hat top, a little room on the sides
    const subjH = 3.45, subjW = 3.9;
    const upp = Math.max(subjH / Math.max(60, r.height * 0.94), subjW / Math.max(60, r.width));
    const fullH = H * upp;
    const fov = cam.fov;
    const look = this._look ?? (this._look = new THREE.Vector3());
    look.set(0, 1.78, 0);
    const dist = fullH / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    cam.aspect = W / H;
    cam.position.set(0, look.y + dist * 0.12, dist);
    cam.lookAt(look);
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.56 - this.scrollY * 0.55;
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ acting

  /** Seller reactions: 'buy' | 'broke' | 'haggle' | 'talk' | 'startle' | 'hello' | 'idle'. */
  act(kind) {
    const ch = this.nolan;
    if (!ch) return;
    this.mode = kind;
    this.modeT = 0;
    if (kind === 'buy') {
      ch.play('coatOpen', { restart: true });
      ch.mood('rich', 2.2);
      this.flaps.forEach((f) => { f.target = 1; f.items.visible = true; });
      this.parcelT = -0.35;
      if (this.screens?.[2]) this.screens[2].stamp = 1.6;
    } else if (kind === 'broke') {
      ch.play('crossArms', { restart: true, face: false });
      ch.mood('annoyed', 2);
      this.peekT = 1.6;
    } else if (kind === 'haggle') {
      ch.play('think', { restart: true, face: false });
      ch.mood('think', 1.8);
      this.peekT = 1.2;
    } else if (kind === 'talk') {
      ch.play('whisper', { restart: true });
    } else if (kind === 'startle') {
      ch.react('surprised', { boing: true });
      this.peekT = 0.9;
    } else if (kind === 'hello') {
      ch.play('whisper', { restart: true });
      ch.mood('smug', 1.6);
    } else {
      ch.play('counterTap');
    }
  }

  /** Which prop is under a screen point: 'seller' | 'bell' | 'register' | 'crt' | null. */
  pick(x, y) {
    if (!this.ready) return null;
    const hits = engine.raycast(x, y, [this.nolan.root, this.topMesh, this.crtMesh, this.counter], this.camera, true);
    if (!hits.length) return null;
    const o = hits[0].object;
    let n = o;
    while (n) { if (n === this.nolan.root) return 'seller'; n = n.parent; }
    // counter-top props by position
    const p = hits[0].point;
    if (p.y > 0.86 && p.y < 1.25 && p.z > 0.3 && p.z < 0.9) {
      if (p.x < -0.95 && p.x > -1.55) return 'bell';
      if (p.x > 0.75 && p.x < 1.6) return 'register';
    }
    if (p.x > 0.7 && p.x < 2.1 && p.y > 0.1 && p.y < 1.5 && p.z < -0.8) return 'crt';
    return null;
  }

  /** Screen position (CSS px) of a point above the seller's head (speech bubbles). */
  headScreen(out = {}) {
    if (!this.nolan) return null;
    const v = this.nolan.headTop(this._hv ?? (this._hv = new THREE.Vector3()));
    v.y += 0.1;
    const s = engine.toScreen(v, this.camera);
    out.x = s.x; out.y = s.y;
    // on-screen width of the head (for bubbles placed beside it)
    v.x += 0.5;
    out.w = Math.abs(engine.toScreen(v, this.camera).x - s.x) * 2;
    return out;
  }
  /** Screen position of the seller's chest (where the parcel comes from). */
  chestScreen() {
    const v = (this._cv ?? (this._cv = new THREE.Vector3()));
    this.nolan.torso.updateWorldMatrix(true, false);
    v.set(0, 0.25, 0.3).applyMatrix4(this.nolan.torso.matrixWorld);
    return engine.toScreen(v, this.camera);
  }

  // ------------------------------------------------------------------ frame

  update(dt) {
    if (!this.ready) return;
    this.t += dt;
    const t = this.t;
    if (this._w !== engine.width || this._h !== engine.height || this._fr !== this.frameRect || this._sy !== this.scrollY) {
      this._w = engine.width; this._h = engine.height; this._fr = this.frameRect; this._sy = this.scrollY;
      this.layoutCamera();
    }
    // lamp sway, light follows the bulb
    this.lamp.rotation.z = Math.sin(t * 0.7) * 0.05 + Math.sin(t * 1.9) * 0.01;
    this.lamp.rotation.x = Math.sin(t * 0.53 + 1) * 0.035;
    this.lamp.updateMatrixWorld(true);
    this.spot.position.set(0, -1.1, 0).applyMatrix4(this.lamp.matrixWorld);
    this.spot.intensity = 34 * (1 + Math.sin(t * 13) * 0.015 + (Math.sin(t * 0.37) > 0.995 ? -0.35 : 0));
    // warning light blink
    const on = Math.sin(t * 4.2) > 0.35;
    this.warnMat.color.setRGB(on ? 2.4 : 0.35, on ? 0.5 : 0.06, on ? 0.35 : 0.05);
    this.warnLight.intensity = on ? 2.4 : 0;
    // CRTs
    for (const s of this.screens) {
      s.acc += dt;
      if (s.stamp > 0) s.stamp -= dt;
      if (s.acc > 0.14) { s.draw(s.acc, s.stamp); s.acc = 0; }
    }
    this.crtLight.intensity = 1.3 + Math.sin(t * 9) * 0.15;
    // dust
    const pos = this.dust.geometry.attributes.position;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.y += dt * 0.03 * m.s;
      if (m.y > 3.4) m.y = 0.9;
      pos.setXYZ(i, m.x + Math.sin(t * 0.3 * m.s + m.ph) * 0.15, m.y, m.z + Math.cos(t * 0.25 + m.ph) * 0.1);
    }
    pos.needsUpdate = true;
    this.updateSeller(dt);
  }

  updateSeller(dt) {
    const ch = this.nolan;
    this.modeT += dt;
    // reactions run their course, then he goes back to drumming on the counter
    const len = { buy: 2.4, broke: 2.2, haggle: 1.8, startle: 1.0, hello: 1.8 }[this.mode];
    if (len && this.modeT > len) {
      if (this.mode === 'buy') this.flaps.forEach((f) => (f.target = 0));
      this.act('idle');
    }
    // idle: every few seconds a nervous glance over the shoulder or a peek over the shades
    if (this.mode === 'idle') {
      this.nextGlance -= dt;
      if (this.nextGlance <= 0) {
        this.nextGlance = 4 + Math.random() * 5;
        const r = Math.random();
        if (r < 0.4) { ch.play('lookAround', { dur: 2.2, then: 'counterTap', face: false }); ch.mood('nervous', 2.2); }
        else if (r < 0.75) { this.peekT = 1.4; ch.look(Math.random() < 0.5 ? -1.2 : 1.2, -0.3, 1.4); }
        else ch.emote('sweat', 1.4);
      }
    }
    // the shades slide down the nose to peek, then back up
    if (this.peekT > 0) {
      this.peekT -= dt;
      // done peeking: push the shades back up the nose
      if (this.peekT <= 0 && this.mode === 'idle' && ch.anim === 'counterTap') ch.play('pushShades', { dur: 0.55, then: 'counterTap' });
    }
    const pk = this.peekT > 0 ? 1 : 0;
    this.peek += (pk - this.peek) * (1 - Math.exp(-10 * dt));
    this.shades.position.y = -this.peek * 3.2 * S2;
    this.shades.position.z = this.peek * 0.6 * S2;
    // coat flaps: springy hinge
    for (const f of this.flaps) {
      const tgt = f.target * 2.15;
      f.v += ((tgt - f.a) * 160 - f.v * 13) * Math.min(dt, 0.05);
      f.a += f.v * Math.min(dt, 0.05);
      f.grp.rotation.y = f.side * f.a;
      if (f.target === 0 && f.a < 0.05) f.items.visible = false;
    }
    // sub-step the chibi (its squash spring is only stable at <= 1/30 s steps)
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < n; i++) ch.update(dt / n);
    // the parcel slides out of the coat towards you, spins and pops
    if (this.parcelT != null) {
      this.parcelT += dt;
      const u = this.parcelT;
      const p = this.parcel;
      if (u < 0) p.visible = false;
      else if (u < 0.9) {
        p.visible = true;
        const k = u / 0.9, e = 1 - (1 - k) ** 3;
        ch.torso.updateWorldMatrix(true, false);
        const from = (this._pf ?? (this._pf = new THREE.Vector3())).set(0, 0.3, 0.3).applyMatrix4(ch.torso.matrixWorld);
        p.position.set(from.x + Math.sin(k * 3) * 0.08, from.y + Math.sin(k * Math.PI) * 0.5 + e * 0.2, from.z + e * 1.6);
        p.rotation.set(k * 2.2, k * 5, 0);
        p.scale.setScalar(0.4 + e * 0.9);
      } else {
        p.visible = false;
        this.parcelT = null;
        this.onParcel?.(engine.toScreen(p.position, this.camera));
      }
    }
  }
}

let single = null;
/** The session's one bunker (built on first use). */
export function bunker() {
  if (!single) {
    single = new Bunker();
    if (typeof window !== 'undefined') window.__bunker = single; // tests / dev tools
  }
  return single;
}
