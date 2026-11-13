// Profile BANNER art: every banner is a little animated pixel-art scene captured from a real 3D set.
//
//   set     one of the Beast Island zone dioramas (src/models/arenas/*.js buildZone: the lab yard
//           with its bubbling tanks, the volcano, Beast Mart, the bank vault, the haunted manor...)
//           on a ground plane under a dithered sky, plus loop-safe FX (bubbles, embers, snow,
//           falling coins, confetti, blinking bulbs, flying food...)
//   troops  a stampede of real troop rigs (createSwarm) marching across the front; Troop Mastery
//           banners add the troop itself, big, bobbing on the right
//   frames  N frames of one seamless loop (every moving thing is a function of the loop phase; the
//           rigs' walk cycles are stepped by whole strides), each drawn by the thumbnail renderer
//           (engine.drawScene) at LOW resolution in banner aspect, then run through the 3D -> 2D
//           pixel pass (spriteFx.js spriteize: stepped light bands, palette clamp, depth outlines)
//           with an ordered dither on the sky
//   strip   the frames side by side in one PNG (a blob: URL), played by CSS steps() on a
//           background-position (no JS per frame, no big composited layers), scaled up crisp with
//           image-rendering: pixelated. prefers-reduced-motion holds frame 0.
//
// Cost: renders are lazy (only banners near the viewport), queued one at a time and spread over
// animation frames (one 3D frame per tick), cached per banner id for the session. Until a strip is
// ready (or if WebGL fails) the banner keeps its flat CSS look (BANNERS[id].css) underneath.
import * as THREE from 'three';
import './bannerArt.css';
import { h } from './ui.js';
import { engine } from '../core/engine.js';
import { spriteize } from '../core/spriteFx.js';
import { BANNERS } from '../data/season.js';
import { cardDef } from '../data/cards.js';
import { mulberry32, hashString } from '../core/util.js';

export const BAN_W = 160, BAN_H = 50, BAN_N = 10; // one frame (3.2 : 1), frames per loop
const LOOP_S = 1.2; // seconds per loop on screen (CSS)
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------------------------------------------------------------------------- sets

// zone: Beast Island diorama id. sky: [top, middle, horizon]. ground: plane colour round the
// diorama. fx: loop FX (see addFx). cam: { y, z, ty, tz, fov }. fog: [near, far] (horizon colour).
const SETS = {
  lab:        { zone: 'lab', sky: ['#1b5fb8', '#5fb8f4', '#d4f1ff'], ground: '#8fa6c8', fx: [['fizz', '#5af2d0'], ['sparkle', '#ffffff']] },
  reactor:    { zone: 'reactor', sky: ['#14361c', '#3c8a3a', '#c4f58a'], ground: '#5a6a58', fx: [['bubbles', '#9dff3a'], ['motes', '#c4ff5a']], light: '#d8ffb0' },
  volcano:    { zone: 'volcano', sky: ['#2a0a24', '#a8281a', '#ffa84a'], ground: '#4a2420', fx: [['embers', '#ffd23f'], ['embers', '#ff6a1a']], light: '#ffe0c0', hemi: 1.7 },
  mart:       { zone: 'mart', sky: ['#ff5aa8', '#ffb0d8', '#fff0c8'], ground: '#4a4a5a', fx: [['blink', '#ffd23f']] },
  vault:      { zone: 'laser', sky: ['#2a1a06', '#8a5a0a', '#ffe08a'], ground: '#3a3020', fx: [['coins', '#ffd23f'], ['sparkle', '#fff6b8']], light: '#ffe6a8' },
  space:      { zone: 'space', sky: ['#05031a', '#1a0f4a', '#5a2ad0'], ground: '#2a2a4a', fx: [['stars', '#ffffff'], ['sparkle', '#b4a8ff']], light: '#d8d0ff', hemi: 1.1 },
  haunted:    { zone: 'haunted', sky: ['#0a0618', '#2a1450', '#7a4ab8'], ground: '#2a2238', fx: [['motes', '#7af0c8'], ['bats', '#120c24']], light: '#c8b8ff', hemi: 1.05 },
  jungle:     { zone: 'jungle', sky: ['#1a6a8a', '#6ad0c8', '#e8ffd0'], ground: '#3f8a3a', fx: [['motes', '#fff27a'], ['leaves', '#5cc24a']] },
  ice:        { zone: 'antarctica', sky: ['#1a3a8a', '#7ab8f0', '#e8f8ff'], ground: '#dceeff', fx: [['snow', '#ffffff']], light: '#e8f4ff' },
  factory:    { zone: 'factory', sky: ['#ff4fa3', '#ffb0d0', '#fff2d8'], ground: '#5fc24a', fx: [['sprinkles', null]] },
  choco:      { zone: 'factory', sky: ['#2a120a', '#7a3a1a', '#e8a060'], ground: '#5a3220', fx: [['drips', '#5a3220'], ['sparkle', '#ffd23f']], light: '#ffd8b0' },
  circle:     { zone: 'circle', sky: ['#1d4fa0', '#29b6f6', '#c8f0ff'], ground: '#5cc24a', fx: [['confetti', null]] },
  reef:       { zone: 'reef', sky: ['#062a5a', '#1a7ab8', '#7ae8f0'], ground: '#e8d8a0', fx: [['bubbles', '#c8f8ff']], light: '#c8f0ff' },
  pyramid:    { zone: 'pyramid', sky: ['#c8601a', '#ffb04a', '#fff0b0'], ground: '#e8c070', fx: [['sparkle', '#fff6b8'], ['coins', '#ffd23f']], light: '#fff0c8' },
  redlight:   { zone: 'redlight', sky: ['#5a0a3a', '#d0207a', '#ffb0d8'], ground: '#c8a080', fx: [['zap', '#ff2e88'], ['blink', '#ffffff']] },
  island:     { zone: 'island', sky: ['#7a0a0a', '#e01a1a', '#ff9a8a'], ground: '#e8d8a0', fx: [['blink', '#ffffff'], ['sparkle', '#ffffff']] },
};

// base banners: set + troops (marching left -> right) + optional hero + extra fx
const BASE = {
  default:          { set: 'lab', troops: ['panther', 'steelPanther', 'hardHeadPanther', 'panther'] },
  pinkBolt:         { set: 'redlight', troops: ['shockSign', 'voltBat', 'jellyZapper'], fx: [['zap', '#ffd23f']] },
  goldBars:         { set: 'vault', troops: ['vaultBot', 'steelPanther', 'vaultBot'] },
  feastBanner:      { set: 'factory', troops: ['donutDasher', 'pizzaSlicer', 'fryFiend', 'burgerBrute'] },
  animStars:        { set: 'space', troops: ['astroPanther', 'ufoGrabber', 'astroPanther'] },
  animDrip:         { set: 'choco', troops: ['chocoChomper', 'chocoChomper', 'chocoChomper'] },
  animFeast:        { set: 'mart', troops: ['burgerBrute', 'pizzaSlicer', 'melonMauler'], fx: [['food', null]] },
  animGoldenTicket: { set: 'pyramid', troops: ['beastTiger', 'steelPanther', 'beastTiger'] },
  bossSkull:        { set: 'volcano', troops: ['emberImps', 'emberImps', 'emberImps', 'emberImps'], hero: 'magmaTitan' },
  secretSub:        { set: 'island', troops: ['panther', 'hyperchargePanther', 'panther'] },
  sprinkleParty:    { set: 'factory', troops: ['donutDasher', 'donutDasher', 'donutDasher'], fx: [['confetti', null]] },
  picnicBanner:     { set: 'jungle', troops: ['melonMauler', 'pizzaSlicer', 'vineViper'] },
  animSoda:         { set: 'reef', troops: ['sodaSurge', 'sharkByte', 'sodaSurge'], fx: [['bubbles', '#ff6a7a']] },
  animChampion:     { set: 'circle', troops: ['burgerBrute', 'donutDasher', 'pizzaSlicer'], hero: 'hyperFusionPanther', fx: [['sparkle', '#ffd23f']] },
};
// Troop Mastery banners: the series' set (a few troops get their own home)
const SERIES_SET = {
  originals: 'lab', homeHorrors: 'redlight', technoTerrors: 'vault', atomic: 'reactor', hybrids: 'volcano', food: 'mart',
  labBrats: 'lab', creepyCritters: 'haunted', megaTech: 'space', fireIce: 'ice', battleFusion: 'circle', wildlands: 'jungle',
  spooky: 'haunted', cosmic: 'space',
};
const TROOP_SET = {
  emberWolf: 'volcano', magmaMole: 'volcano', magmaTitan: 'volcano', emberImps: 'volcano', sharkByte: 'reef', jellyZapper: 'reef',
  templeGolem: 'pyramid', sludgeKraken: 'reef', chocoChomper: 'choco', donutDasher: 'factory', sodaSurge: 'reef', vaultBot: 'vault',
  plutoniumPup: 'reactor', glitchBot: 'vault', laserLynx: 'vault',
};

function recipe(id) {
  const b = BANNERS[id] ?? BANNERS.default;
  if (BASE[id]) return { ...BASE[id], fx: [...SETS[BASE[id].set].fx, ...(BASE[id].fx ?? [])] };
  if (b.troop) {
    const d = cardDef(b.troop);
    const set = TROOP_SET[b.troop] ?? SERIES_SET[d?.series] ?? 'lab';
    return { set, troops: [b.troop, b.troop, b.troop], hero: b.troop, small: true, fx: SETS[set].fx };
  }
  return { ...BASE.default, fx: SETS.lab.fx };
}

// ---------------------------------------------------------------------------- shared bits

let modsP = null;
const mods = () => (modsP ??= Promise.all([import('../models/arenas/index.js'), import('../models/swarmModels.js'), import('../models/props.js')])
  .then(([A, S, P]) => ({ A, S, P })));

// zone dioramas are cached and shared (one scene uses a zone at a time); a small LRU caps memory
const zones = new Map();
async function zoneFor(A, id) {
  if (zones.has(id)) { const z = zones.get(id); zones.delete(id); zones.set(id, z); return z; }
  const z = await A.makeArenaZone(id);
  zones.set(id, z);
  while (zones.size > 4) zones.delete(zones.keys().next().value);
  return z;
}

function skyTex(cols) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, cols[0]);
  gr.addColorStop(0.55, cols[1]);
  gr.addColorStop(1, cols[2]);
  g.fillStyle = gr;
  g.fillRect(0, 0, 2, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Linear-in-log view depth packed into R (high byte) + G (low byte): outlines at RELATIVE depth jumps. */
function makeLogDepthMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { zN: { value: 1 }, zF: { value: 60 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <batching_pars_vertex>
      varying float vZ;
      void main() {
        #include <begin_vertex>
        #include <batching_vertex>
        #include <project_vertex>
        vZ = -mvPosition.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform float zN, zF;
      varying float vZ;
      void main() {
        float d = clamp(log(max(vZ, zN) / zN) / log(zF / zN), 0.0, 1.0) * 255.0;
        gl_FragColor = vec4(floor(d) / 255.0, fract(d), 0.0, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}
let depthMat = null;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Depth pass of the scene just drawn by engine.drawScene (same renderer + camera). ImageData or null. */
function depthPass(scene, camera, w, hh) {
  const r = engine.thumbRenderer;
  if (!r) return null;
  depthMat ??= makeLogDepthMaterial();
  depthMat.uniforms.zN.value = 2;
  depthMat.uniforms.zF.value = 70;
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible || !(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (o.userData.banNoDepth || o.isSprite || o.isPoints || o.isLine || ms.every((m) => !m || (m.transparent && m.opacity < 0.7) || m.blending === THREE.AdditiveBlending || m.depthWrite === false)) {
      o.visible = false;
      hidden.push(o);
    }
  });
  const bg = scene.background, fog = scene.fog;
  scene.background = null;
  scene.fog = null;
  scene.overrideMaterial = depthMat;
  const cur = r.getSize(new THREE.Vector2());
  const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
  try {
    r.setViewport(0, 0, w, hh);
    r.setClearColor(0xffffff, 1);
    r.clear();
    r.render(scene, camera);
    const c = depthPass.c ?? (depthPass.c = document.createElement('canvas'));
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, hh);
    g.drawImage(r.domElement, 0, cur.y - hh, w, hh, 0, 0, w, hh);
    return g.getImageData(0, 0, w, hh);
  } catch (e) {
    return null;
  } finally {
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = fog;
    r.setClearColor(cc, ca);
    r.setViewport(0, 0, cur.x, cur.y);
    for (const o of hidden) o.visible = true;
  }
}

// ---------------------------------------------------------------------------- loop FX
// Every FX item is placed by f((phase + offset) mod 1), so frame N wraps onto frame 0.

const CONFETTI = ['#ff2e88', '#ffd23f', '#29b6f6', '#5fdc4a', '#b05cff', '#ffffff', '#ff8a2a'];
function addFx(root, kind, color, rnd, own, P) {
  const items = [];
  const mat = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, fog: false, ...o }); own.push(m); return m; };
  const geo = (g) => { own.push(g); return g; };
  const N = { fizz: 10, bubbles: 14, embers: 16, snow: 26, coins: 9, stars: 30, sparkle: 8, confetti: 24, sprinkles: 24, drips: 10, motes: 12, leaves: 8, bats: 4, food: 3, zap: 2, blink: 12 }[kind] ?? 8;
  const col = (i) => (color ?? CONFETTI[i % CONFETTI.length]);
  for (let i = 0; i < N; i++) {
    const o = rnd(), x0 = -9 + rnd() * 18, z0 = -2 + rnd() * 6.5, sp = 1 + Math.floor(rnd() * 2);
    let m = null, place = null;
    switch (kind) {
      case 'bubbles': case 'fizz': {
        const top = kind === 'fizz' ? 1.6 : 4.2;
        m = new THREE.Mesh(geo(new THREE.IcosahedronGeometry(0.07 + rnd() * 0.07, 0)), mat(col(i), { transparent: true, opacity: 0.85 }));
        place = (p) => { const k = (p * sp + o) % 1; m.position.set(x0 + Math.sin(k * 6.28 * 2 + o * 9) * 0.15, 0.15 + k * top, z0); m.visible = k < 0.92; };
        break;
      }
      case 'embers': case 'motes': {
        const s = kind === 'embers' ? 0.07 : 0.06;
        m = new THREE.Mesh(geo(new THREE.BoxGeometry(s, s, s)), mat(col(i)));
        place = (p) => {
          const k = (p * sp + o) % 1;
          if (kind === 'embers') m.position.set(x0 + Math.sin(k * 12 + o * 7) * 0.3, k * 4.5, z0);
          else { m.position.set(x0 + Math.sin((p + o) * 6.283) * 0.4, 0.6 + o * 2.6 + Math.cos((p + o) * 6.283 * sp) * 0.25, z0); }
          m.visible = kind === 'motes' ? ((i + Math.floor(p * BAN_N)) % 4) !== 0 : k < 0.9;
        };
        break;
      }
      case 'snow': case 'drips': case 'confetti': case 'sprinkles': case 'leaves': {
        const g = kind === 'snow' ? new THREE.BoxGeometry(0.06, 0.06, 0.06) : kind === 'drips' ? new THREE.SphereGeometry(0.09, 6, 5)
          : kind === 'sprinkles' ? new THREE.BoxGeometry(0.035, 0.14, 0.035) : new THREE.BoxGeometry(0.13, 0.09, 0.01);
        m = new THREE.Mesh(geo(g), mat(col(i), kind === 'confetti' || kind === 'leaves' ? { side: THREE.DoubleSide } : {}));
        if (kind === 'drips') m.scale.set(1, 1.5, 1);
        place = (p) => {
          const k = (p * sp + o) % 1;
          m.position.set(x0 + Math.sin((k + o) * 6.283) * (kind === 'drips' ? 0 : 0.35), 4.6 - k * 4.8, z0);
          m.rotation.set(k * 6.283 * 2, o * 6, k * 6.283 * sp);
        };
        break;
      }
      case 'coins': {
        m = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 10)), new THREE.MeshStandardMaterial({ color: col(i), emissive: 0x8a5a00, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.35 }));
        own.push(m.material);
        place = (p) => { const k = (p * sp + o) % 1; m.position.set(x0, 4.6 - k * 4.8, z0); m.rotation.set(1.2 + k * 6.283 * 2, o * 3, 0.3); };
        break;
      }
      case 'stars': {
        m = new THREE.Mesh(geo(new THREE.BoxGeometry(0.22, 0.22, 0.22)), mat(col(i)));
        m.userData.banNoDepth = true;
        const sx = -26 + rnd() * 52, sy = 3 + rnd() * 9;
        place = (p) => { m.position.set(sx, sy, -30); const tw = (i * 3 + Math.floor(p * BAN_N)) % 5; m.visible = tw !== 0; m.scale.setScalar(tw === 2 ? 1.6 : 1); };
        break;
      }
      case 'sparkle': {
        m = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.16, 0)), mat(col(i)));
        const sy = 0.6 + rnd() * 3;
        place = (p) => { const k = (p + o) % 1; m.position.set(x0, sy, z0); m.scale.set(0.5 + Math.sin(k * Math.PI) * 0.9, (0.5 + Math.sin(k * Math.PI)) * 1.4, 0.5); m.rotation.y = k * 3; m.visible = k < 0.7; };
        break;
      }
      case 'blink': {
        // a string of bulbs along the top (chasing)
        m = new THREE.Mesh(geo(new THREE.SphereGeometry(0.13, 8, 6)), mat(col(i)));
        const bx = -9 + (i / (N - 1)) * 18;
        const by = 4.2 - Math.sin((i / (N - 1)) * Math.PI) * 0.6;
        if (i < N - 1) {
          const nx = -9 + ((i + 1) / (N - 1)) * 18, ny = 4.2 - Math.sin(((i + 1) / (N - 1)) * Math.PI) * 0.6;
          const cab = new THREE.Mesh(geo(new THREE.BoxGeometry(Math.hypot(nx - bx, ny - by), 0.04, 0.04)), mat('#2a1a3a'));
          cab.position.set((bx + nx) / 2, (by + ny) / 2 + 0.12, -1);
          cab.rotation.z = Math.atan2(ny - by, nx - bx);
          root.add(cab);
        }
        place = (p) => { m.position.set(bx, by, -1); const on = (i + Math.floor(p * BAN_N)) % 3 === 0; m.material.color.set(on ? col(i) : '#3a2a4a'); m.scale.setScalar(on ? 1.25 : 0.8); };
        break;
      }
      case 'zap': {
        // a lightning bolt (zig-zag boxes) that strikes on some frames
        const g = new THREE.Group();
        const mm = mat(col(i));
        let px = 0, py = 0;
        for (let s = 0; s < 6; s++) {
          const nx = px + (s % 2 ? 0.45 : -0.35), ny = py - 0.75;
          const seg = new THREE.Mesh(geo(new THREE.BoxGeometry(0.1, Math.hypot(nx - px, ny - py) + 0.06, 0.1)), mm);
          seg.position.set((px + nx) / 2, (py + ny) / 2, 0);
          seg.rotation.z = Math.atan2(nx - px, -(ny - py));
          g.add(seg);
          px = nx;
          py = ny;
        }
        m = g;
        const bx = i ? 5.5 : -5;
        place = (p) => { const f = Math.floor(p * BAN_N); m.visible = (f + i * 5) % BAN_N < 2; m.position.set(bx + (f % 2) * 0.3, 4.8, -2.5); };
        break;
      }
      case 'bats': {
        const g = new THREE.Group();
        const mm = mat(col(i), { side: THREE.DoubleSide });
        const body = new THREE.Mesh(geo(new THREE.BoxGeometry(0.16, 0.12, 0.1)), mm);
        const wl = new THREE.Mesh(geo(new THREE.BoxGeometry(0.3, 0.03, 0.14)), mm);
        const wr = wl.clone();
        g.add(body, wl, wr);
        m = g;
        place = (p) => {
          const k = (p + o) % 1, f = Math.floor(p * BAN_N * 2) % 2;
          m.position.set(-9 + k * 18, 3.2 + o * 1.2 + Math.sin(k * 12) * 0.2, -3);
          wl.position.set(-0.2, f ? 0.08 : -0.04, 0); wl.rotation.z = f ? 0.5 : -0.3;
          wr.position.set(0.2, f ? 0.08 : -0.04, 0); wr.rotation.z = f ? -0.5 : 0.3;
        };
        break;
      }
      case 'food': {
        const kinds = ['burger', 'pizza', 'donut', 'fries', 'soda'];
        m = P.makeFood(kinds[i % kinds.length]);
        m.scale.setScalar(1.6);
        place = (p) => { const k = (p + i / N) % 1; m.position.set(-8 + k * 16, 1.2 + Math.sin(k * Math.PI) * 2.6, 0.5 + i * 0.6); m.rotation.set(k * 6.283, k * 3.14, 0); };
        break;
      }
      default: continue;
    }
    root.add(m);
    items.push(place);
  }
  return (p) => { for (const f of items) f(p); };
}

// ---------------------------------------------------------------------------- troops

const GAIT_LOOP = { walk: (2 * Math.PI) / 12, slide: (2 * Math.PI) / (12 * 0.7), hop: (2 * Math.PI) / 4.5, float: (2 * Math.PI) / 3, roll: (2 * Math.PI) / 12 };
/** A troop rig sized to `ht` world units tall (and at most `wd` long). */
function troop(S, id, ht, wd) {
  const rig = S.createSwarm(id);
  rig.setState('walk');
  for (let i = 0; i < 4; i++) rig.update(1 / 30);
  const box = new THREE.Box3().setFromObject(rig.root), sz = box.getSize(new THREE.Vector3());
  const k = Math.min(ht / Math.max(0.05, sz.y), wd / Math.max(0.05, Math.max(sz.x, sz.z)));
  rig.root.scale.multiplyScalar(k);
  rig.t0 = rig.t;
  return rig;
}
/** Step a rig's own clock to loop phase p (whole gait cycles per loop, so it wraps cleanly). */
function poseRig(rig, p, cycles = 1) {
  const L = (GAIT_LOOP[rig.gait] ?? GAIT_LOOP.walk) * cycles;
  const dt = 1 / 60;
  rig.t = rig.t0 + p * L - dt;
  if (rig.gait === 'roll') rig.rollAngle = p * Math.PI * 2 * cycles - dt * 9;
  rig.update(dt);
}

// ---------------------------------------------------------------------------- one strip

let renderGate = 0; // ms timestamp: when the last heavy step ended (keeps steps one per frame)

async function renderStrip(id) {
  const R = recipe(id), set = SETS[R.set] ?? SETS.lab;
  const { A, S, P } = await mods();
  await nextFrame();
  const own = [];
  const scene = new THREE.Scene();
  const sky = skyTex(set.sky);
  own.push(sky);
  scene.background = sky;
  scene.fog = new THREE.Fog(new THREE.Color(set.sky[2]), set.fog?.[0] ?? 16, set.fog?.[1] ?? 46);
  // light rig (hemisphere + key + rim + fill, like the thumbnail studio, so shaders are shared)
  const tint = new THREE.Color(set.light ?? '#fff2e0');
  scene.add(new THREE.HemisphereLight(new THREE.Color('#e8f0ff').lerp(tint, 0.4), new THREE.Color(set.ground).lerp(new THREE.Color('#3a3060'), 0.5), set.hemi ?? 1.4));
  const key = new THREE.DirectionalLight(tint, 2.5);
  key.position.set(-4, 8, 9);
  const rim = new THREE.DirectionalLight(new THREE.Color(set.sky[1]).lerp(new THREE.Color('#ffffff'), 0.35), 2.2);
  rim.position.set(5, 4, -6);
  const fill = new THREE.DirectionalLight('#c8dcff', 0.6);
  fill.position.set(6, 2, 6);
  scene.add(key, rim, fill);
  // ground round the diorama, out to the horizon
  const gm = new THREE.MeshStandardMaterial({ color: set.ground, roughness: 0.95 });
  const gg = new THREE.PlaneGeometry(200, 200);
  own.push(gm, gg);
  const ground = new THREE.Mesh(gg, gm);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  scene.add(ground);
  // the set: a Beast Island zone diorama
  let zone = null;
  try { zone = await zoneFor(A, set.zone); } catch (e) { console.warn('banner zone', set.zone, e); }
  await nextFrame();
  if (zone) scene.add(zone.root);
  // FX
  const rnd = mulberry32(hashString(id));
  const fxRoot = new THREE.Group();
  scene.add(fxRoot);
  const fx = (R.fx ?? []).map(([k, c]) => addFx(fxRoot, k, c, rnd, own, P));
  // troops: a column marching left -> right across the front (wraps by one spacing per loop)
  const T = new THREE.Group();
  scene.add(T);
  const list = R.troops ?? [];
  const n = Math.max(1, list.length), span = 14, gap = span / n;
  const march = list.map((tid, i) => {
    const rig = troop(S, tid, R.small ? 1.05 : 1.3, 2.1);
    rig.root.rotation.y = Math.PI / 2 - 0.35;
    T.add(rig.root);
    return { rig, i, z: R.hero ? 2.6 + (i % 2) * 0.5 : 3.4 + (i % 2) * 0.6 };
  });
  let hero = null;
  if (R.hero) {
    hero = troop(S, R.hero, 2.05, 3.0);
    hero.root.rotation.y = -0.55;
    hero.root.position.set(3.1, 0, 4.7);
    T.add(hero.root);
  }
  // camera: low, wide, looking into the diorama
  const cam = new THREE.PerspectiveCamera(set.cam?.fov ?? 30, BAN_W / BAN_H, 0.5, 120);
  cam.position.set(0, set.cam?.y ?? 2.3, set.cam?.z ?? 10);
  cam.lookAt(0, set.cam?.ty ?? 1.45, set.cam?.tz ?? 0);
  // frames
  const W = BAN_W, H = BAN_H, NF = BAN_N;
  const strip = document.createElement('canvas');
  strip.width = W * NF;
  strip.height = H;
  const sg = strip.getContext('2d');
  try {
    for (let f = 0; f < NF; f++) {
      const p = f / NF;
      try { zone?.update?.(LOOP_S / NF, 2 + p * LOOP_S); } catch (e) { /* animated bits are optional */ }
      for (const u of fx) u(p);
      for (const m of march) {
        const x = -span / 2 + ((m.i + p) * gap) % span;
        m.rig.root.position.set(x, 0, m.z);
        poseRig(m.rig, p, 2);
      }
      if (hero) {
        poseRig(hero, p, 2);
        hero.root.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * 0.1;
      }
      scene.updateMatrixWorld(true);
      // one 3D frame per animation frame: the UI never waits on more than one small draw
      const wait = 14 - (performance.now() - renderGate);
      if (wait > 0) await nextFrame();
      const c = await engine.drawScene(scene, cam, { w: W, h: H });
      const fc = renderStrip.fc ?? (renderStrip.fc = document.createElement('canvas'));
      if (fc.width !== W || fc.height !== H) { fc.width = W; fc.height = H; }
      const fg = fc.getContext('2d', { willReadFrequently: true });
      fg.clearRect(0, 0, W, H);
      fg.drawImage(c, 0, 0);
      const img = fg.getImageData(0, 0, W, H);
      const depth = depthPass(scene, cam, W, H);
      // ordered dither on the sky / far ground (depth = far) so the gradients band like hand-pixelled ones
      if (depth) {
        const d = depth.data, px = img.data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (d[i] < 250 && !(d[i + 3] === 0)) continue;
          const o = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * 22;
          px[i] = Math.max(0, Math.min(255, px[i] + o));
          px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + o));
          px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + o));
        }
      }
      spriteize(img, W, H, depth, { bands: 8, maxColors: 56, innerThr: 0.06, rim: false, outline: false });
      sg.putImageData(img, f * W, 0);
      renderGate = performance.now();
      await nextFrame();
    }
  } finally {
    if (zone) scene.remove(zone.root);
    for (const o of own) o.dispose?.();
  }
  return await new Promise((res) => {
    if (typeof strip.toBlob !== 'function') return res(strip.toDataURL('image/png'));
    strip.toBlob((b) => res(b ? URL.createObjectURL(b) : strip.toDataURL('image/png')), 'image/png');
  });
}

// one strip at a time; every banner renders once per session
let chain = Promise.resolve();
const strips = new Map();
const done = new Map();
/** Promise of the banner's sprite-strip URL (BAN_N frames of BAN_W x BAN_H, side by side), or null. */
export function bannerStrip(id) {
  if (!BANNERS[id]) id = 'default';
  if (!strips.has(id)) {
    const job = chain.then(() => renderStrip(id)).then((u) => { if (u) done.set(id, u); return u; })
      .catch((e) => { console.warn('banner art', id, e); return null; });
    chain = job;
    strips.set(id, job);
  }
  return strips.get(id);
}
/** The strip URL if it has already been rendered (no work started). */
export const bannerStripReady = (id) => done.get(BANNERS[id] ? id : 'default') ?? null;

// ---------------------------------------------------------------------------- the element

let io = null;
const starts = new WeakMap();
function whenVisible(el, start) {
  if (typeof IntersectionObserver === 'undefined') return start();
  io ??= new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const f = starts.get(e.target);
      starts.delete(e.target);
      f?.();
    }
  }, { rootMargin: '120px 0px' });
  starts.set(el, start);
  io.observe(el);
}

/**
 * The animated pixel-art layer of a banner (absolutely fills its parent). Renders lazily once it
 * nears the viewport. o.render = false: only show an already-rendered strip (battle overlays).
 */
export function bannerArtEl(id, o = {}) {
  const fr = h('i', { class: 'mn-ban-pxf' });
  const el = h('div', { class: 'mn-ban-px', 'aria-hidden': 'true' }, fr);
  const show = (url) => {
    if (!url) return;
    fr.style.backgroundImage = `url("${url}")`;
    el.classList.add('on');
    el.parentElement?.classList.add('px-on');
  };
  const hit = bannerStripReady(id);
  if (hit) { show(hit); requestAnimationFrame(() => el.parentElement?.classList.add('px-on')); return el; }
  if (o.render === false) return el;
  const start = () => bannerStrip(id).then(show);
  requestAnimationFrame(() => (el.isConnected ? whenVisible(el, start) : setTimeout(() => (el.isConnected ? whenVisible(el, start) : null), 80)));
  return el;
}
