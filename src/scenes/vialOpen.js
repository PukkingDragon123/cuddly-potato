// Vial opening (the game's chest opening), themed as a MrBeast Lab experiment.
//
// A dark lab bench under a spotlight. The vial drops in and glows in the
// colour of the best rarity inside. Test tubes: POUR the water in yourself
// (drag the jug over the tube, or tilt your phone), the bag dissolves and it
// fizzes; then SHAKE it (real phone shake via DeviceMotion, or swipe it back
// and forth / Space): every strong shake has a chance to UPGRADE the vial a
// rarity tier (Clash Royale chest upgrades: more cards + the tier's guarantee),
// the last shake pops the cap. Boxes and cases: shake the latches loose. Then,
// Clash Royale style, every card stack flies out as its 3D toy onto a pedestal
// next to the pixel card (count, NEW!, level, copies bar filling) with rarity
// fanfares, and a summary of everything gained. A card found for the first
// time gets the NEW CARD cutscene (newCardCutscene.js) with the player's
// equipped entrance animation.
//
// game.go('vialopen', { type, slot?, source?: 'slot'|'free'|'crown'|'shop'|'reward', result?, back = 'home', backParams,
//                       preview?: { entrance, card } })
// The caller removes/claims the vial (takeVial / claimFreeVial / claimCrownVial).
// This scene pre-rolls the contents (re-rolled at the higher tier on each upgrade),
// remembers the pending vial in the save (state.setOpeningVial, recovered on the
// next load if the tab dies) and applies the rewards exactly once when the vial
// pops (or on SKIP / leaving), then saves. `preview` only plays the cutscene
// (shop entrance previews). Dev URL params: &forceUpgrade=1 (every shake upgrades),
// &newcut=1 (cutscene for every card), &entrance=<id>, &preview=<entrance>&card=<id>.
import * as THREE from 'three';
import './vialOpen.css';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { animate } from '../core/tween.js';
import { damp, rand, pick, fmt } from '../core/util.js';
import { Mats, makeMesh } from '../core/voxel.js';
import { G, rbox, cyl, capsule, stamp, shade, n3 } from '../models/kit.js';
import { makeVial, LAB_BADGE } from '../models/props/vials.js';
import { makeBeaker, makeMoneyBag, makeSodaRocket, makeFood } from '../models/props/abilities.js';
import { createSwarm } from '../models/swarmModels.js';
import { voxelDome } from '../game/battle/voxfx.js';
import { h, icon, button, pill, bar, ribbon, bigBanner, pointAt, rollNumber, bump, sparkle, $ui } from '../ui/ui.js';
import { cardEl } from '../ui/cards.js';
import { vialThumb } from '../ui/vialThumb.js';
import { VIALS, vialId, VIAL_SHAKES, VIAL_UPGRADE_CHANCE, VIAL_TIER_LOOK, maxVialUpgrades, vialTier, upgradedName } from '../data/vials.js';
import { cardDef, isSpell, RARITIES } from '../data/cards.js';
import { VARIANTS, SERIES } from '../data/swarms.js';
import { state, rollVial, applyVial, owned, upgradeInfo, setOpeningVial, equippedEntrance, stat } from '../game/state.js';
import { game } from '../game/game.js';
import { spellThumbAsync } from '../ui/thumbs.js';
import { ShakeInput, TiltInput, requestMotion, motionNeedsPermission, isTouchDevice } from './vialGestures.js';
import { NewCardCutscene } from './newCardCutscene.js';
import { pixelStuds, fillMarks, pixelShock, voxCardFrame } from './vialProps.js';

const INK = 0x15121f, WHITE = 0xf6f8ff, BLUE = 0x1d7cf2, BLUE_D = 0x1050b4, BLUE_L = 0x8fd4ff, PINK = 0xff1f9e, YEL = 0xffd23f;
const PED_Z = 0.9, PED_TOP = 0.25;
const TOY_H = 1.15;
const SHINY_COLORS = {
  silver: [0xffffff, 0xd8dde8, 0xa8b4cc],
  gold: [0xfff2a0, 0xffd23f, 0xffb21a],
  chrome: [0xff9ad8, 0x9ff2ff, 0xfff27a, 0xc8a8ff, 0xffffff],
};
const RIBBON = { common: 'blue', rare: 'pink', epic: 'purple', legendary: 'gold', mythic: 'pink' };
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
// pouring: where the jug tips over the tube, how far it tips, how full the tube gets
const POUR_POS = new THREE.Vector3(0.76, 2.24, 0.05), POUR_TILT = 1.2, FILL_TARGET = 0.64;

// ---------------------------------------------------------------------------
// Pixel-art shake-meter cell: a little test tube (empty / filled / next / tier-coloured)

const TUBE_ART = [
  '..kkkkkkkk..',
  '.kMMMMMMMMk.',
  '.kmmmmmmmmk.',
  '..kkkkkkkk..',
  '..kGHggggk..',
  '..kGHggggk..',
  '..kGgggggk..',
  '..kGLLLLLk..',
  '..kGLLLLLk..',
  '..kGLlLLLk..',
  '..kGLLLLLk..',
  '..kGLLLlLk..',
  '..kGLLLLLk..',
  '..kGLlLLLk..',
  '..kGLLLLLk..',
  '..kGLLLLLk..',
  '...kLLLLk...',
  '....kkkk....',
];
const tubeSprites = new Map();
function tubeSprite(state, liquid = '#29b6f6') {
  const key = state + liquid;
  if (tubeSprites.has(key)) return tubeSprites.get(key);
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = TUBE_ART.length;
  const g = c.getContext('2d');
  const on = state === 'on';
  const cur = state === 'cur';
  const pal = {
    k: cur ? '#ffffff' : '#15121f', M: cur ? '#ffffff' : '#d2d9e8', m: '#7a849c',
    G: on ? '#e8fbff' : '#4a5a9a', H: on ? '#ffffff' : '#6f84c8', g: on ? '#bdf3ff' : '#141c4c',
    L: on ? liquid : '#101642', l: on ? '#ffffff' : '#1a2470',
  };
  TUBE_ART.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  const url = c.toDataURL();
  tubeSprites.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------
// Textures & stage pieces (built once)

function canvasTex(w, hgt, draw, nearest = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  draw(c.getContext('2d'), w, hgt);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}
const TEX = {};
function tex(name) {
  if (TEX[name]) return TEX[name];
  if (name === 'cone') {
    TEX.cone = canvasTex(4, 64, (g, w, hh) => {
      for (let y = 0; y < hh; y++) {
        const v = 1 - y / (hh - 1);
        const a = 0.06 + 0.94 * v * v;
        g.fillStyle = `rgba(255,255,255,${a})`;
        g.fillRect(0, y, w, 1);
      }
    });
  } else if (name === 'ray') {
    TEX.ray = canvasTex(32, 64, (g, w, hh) => {
      const img = g.createImageData(w, hh);
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        const v = y / (hh - 1); // 0 top (tip) .. 1 bottom (base)
        const u = Math.abs(x / (w - 1) - 0.5) * 2;
        const a = Math.pow(v, 1.6) * Math.max(0, 1 - u * (0.35 + 0.65 * (1 - v)));
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * a);
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
  } else if (name === 'wall') {
    TEX.wall = canvasTex(160, 90, (g, w, hh) => {
      g.fillStyle = '#18225a';
      g.fillRect(0, 0, w, hh);
      for (let y = 0; y < 66; y += 11) for (let x = (y / 11) % 2 ? -10 : 0; x < w; x += 20) {
        g.fillStyle = (x * 7 + y * 3) % 5 === 0 ? '#26357e' : '#212e70';
        g.fillRect(x + 1, y + 1, 18, 9);
      }
      g.fillStyle = '#121a48';
      g.fillRect(0, 66, w, 24);
      for (let x = 0; x < w; x += 4) {
        g.fillStyle = ((x / 4) & 1) ? '#3a2e0c' : '#0b0b16';
        g.fillRect(x, 66, 4, 3);
      }
      // pegboard dots
      g.fillStyle = '#141c4c';
      for (let y = 8; y < 60; y += 4) for (let x = 6; x < 46; x += 4) g.fillRect(x, y, 1, 1);
      for (let y = 8; y < 60; y += 4) for (let x = 116; x < 156; x += 4) g.fillRect(x, y, 1, 1);
    }, true);
  }
  return TEX[name];
}

let STAGE_GEO = null;
function stageGeos() {
  if (STAGE_GEO) return STAGE_GEO;
  // lab bench (0.1 voxels): dark epoxy tiles, metal edge, branded front
  const t = G();
  const X0 = -45, X1 = 44, Z0 = -26, Z1 = 52;
  rbox(t, X0, -6, Z0, X1, -1, Z1, 1, (x, y, z) => {
    if (y === -1) {
      if (z >= Z1 - 1 || x <= X0 + 1 || x >= X1 - 1) return 0x8e9ab8;
      if ((x - X0) % 9 === 0 || (z - Z0) % 9 === 0) return 0x1b2040;
      return n3(x, 0, z) < 0.07 ? 0x323a5e : 0x2a3152;
    }
    if (z >= Z1) {
      if (y === -2) return 0x5e6a8c;
      if (y === -5) return PINK;
      if (y === -6) return INK;
      return (x & 15) === 0 ? 0x1a5fc8 : BLUE_D;
    }
    return 0x1a1f3c;
  });
  // pedestal for the revealed toy (0.05 voxels)
  const p = G();
  cyl(p, 'y', -0.5, -0.5, 0, 1, 14, 14, INK);
  cyl(p, 'y', -0.5, -0.5, 2, 3, 13.4, 13.4, (x, y, z) => (y === 2 ? BLUE_D : (Math.floor(Math.atan2(z + 0.5, x + 0.5) * 6) & 1 ? BLUE : 0x2a8cff)));
  cyl(p, 'y', -0.5, -0.5, 4, 4, 12.6, 12.6, (x, y, z) => (Math.hypot(x + 0.5, z + 0.5) > 11.3 ? 0xb4c2e2 : n3(x, y, z) < 0.05 ? 0xcfd8ec : 0xdce4f4));
  stamp(p, LAB_BADGE, { W: BLUE_L, B: BLUE, M: PINK }, { axis: 'y', x: -6, z: -6 });
  // test-tube rack prop (0.04)
  const r = G();
  rbox(r, -14, 0, -4, 13, 1, 3, 1, 0xe8eef8);
  for (const x of [-14, 13]) r.box(x, 2, -1, x, 12, 0, 0xc8d0e0);
  rbox(r, -14, 12, -4, 13, 13, 3, 0, 0xe8eef8);
  [[-9, 0x7cff3a, PINK], [-1, 0xff2e88, BLUE], [7, 0x29d6ff, YEL]].forEach(([cx, liq, cap]) => {
    cyl(r, 'y', cx + 0.5, -0.5, 2, 17, 2.3, 2.3, (x, y) => (y <= 9 ? (y === 9 ? shade(liq, 0.3) : liq) : 0xd8f2ff));
    cyl(r, 'y', cx + 0.5, -0.5, 18, 20, 2.8, 2.8, cap);
  });
  r.box(-14, 6, 3, 13, 7, 3, BLUE);
  // water jug handle/rim/marks (0.04)
  const j = G();
  cyl(j, 'y', -0.5, -0.5, 0, 1, 7.2, 7.2, 0xc8d6ee);
  cyl(j, 'y', -0.5, -0.5, 15, 15, 7.0, 7.0, 0xe8f2ff, 'y');
  j.carve((x, y, z) => y === 15 && Math.hypot(x + 0.5, z + 0.5) < 6);
  j.box(-10, 14, -2, -8, 15, 1, 0xe8f2ff);
  capsule(j, [6, 13, -0.5], [10, 12, -0.5], 1.2, 1.2, BLUE);
  capsule(j, [10, 12, -0.5], [10, 4, -0.5], 1.2, 1.2, BLUE);
  capsule(j, [10, 4, -0.5], [6, 3, -0.5], 1.2, 1.2, BLUE);
  for (let y = 4; y <= 12; y += 4) for (let a = -0.6; a <= 0.6; a += 0.2) j.set(Math.round(Math.sin(a) * 7.2 - 0.5), y, Math.round(Math.cos(a) * 7.2 - 0.5), 0xffffff);
  // neon sign: pink bolt + LAB letters
  const s = G();
  stamp(s.box(0, 0, 0, 22, 8, 0, 0x0c1030), [
    '.MM..CC....CCC..CCCC..',
    '..MM.CC...CC.CC.CC.CC.',
    '.MMMMCC...CC.CC.CCCC..',
    '..MM.CC...CCCCC.CC.CC.',
    '.MM..CCCC.CC.CC.CCCC..',
  ], { M: { c: PINK, glow: true, raise: 1 }, C: { c: 0x29d6ff, glow: true, raise: 1 } }, { axis: 'z', x: 0, y: 6 });
  // shelf plank with brackets (0.06)
  const sh = G();
  rbox(sh, -16, 0, -4, 15, 1, 3, 0, 0x3a3f5c);
  for (const x of [-12, 11]) sh.box(x, -4, -4, x, -1, -4, 0x6b7590).box(x, -1, -4, x, -1, 0, 0x6b7590);
  // background tank caps (0.06)
  const tk = G();
  cyl(tk, 'y', -0.5, -0.5, 0, 3, 10, 10, (x, y) => (y === 3 ? 0x8e9ab8 : 0x434a68));
  cyl(tk, 'y', -0.5, -0.5, 38, 41, 10, 10, (x, y) => (y === 38 ? 0x8e9ab8 : 0x434a68));
  cyl(tk, 'y', -0.5, -0.5, 42, 43, 4, 4, 0x6b7590);
  const sil = G();
  rbox(sil, -5, 0, -4, 4, 12, 3, 4, 0x0a0618);
  sil.box(-5, 12, -1, -3, 16, 0, 0x0a0618).box(2, 12, -1, 4, 16, 0, 0x0a0618);
  sil.set(-3, 9, 4, 0xff2e88, true).set(2, 9, 4, 0xff2e88, true);
  const b = (g, scale, pivot = [0, 0, 0]) => g.build({ scale, pivot, jitter: 0.03, maxSamples: 40 });
  STAGE_GEO = {
    table: b(t, 0.1), ped: b(p, 0.05), rack: b(r, 0.04, 'bottom'), jug: b(j, 0.04), sign: b(s, 0.07, 'center'), shelf: b(sh, 0.06, 'bottom'), tank: b(tk, 0.06), tankSil: b(sil, 0.06, 'bottom'),
  };
  return STAGE_GEO;
}

/** A small 3D stand-in for spell cards (props from the abilities kit). */
function spellModel(id) {
  const g = new THREE.Group();
  const add = (o, x = 0, y = 0, z = 0, s = 1, ry = 0) => { if (!o) return; o.position.set(x, y, z); o.scale.multiplyScalar(s); o.rotation.y = ry; g.add(o); };
  switch (id) {
    case 'foodThrow':
      add(makeFood('burger'), -0.25, 0, 0, 1.4, 0.4);
      add(makeFood('pizza'), 0.35, 0.05, 0.25, 1.2, -0.6);
      add(makeFood('donut'), 0.05, 0.42, -0.1, 1.1, 0.2);
      break;
    case 'moneyDrop': add(makeMoneyBag(), 0, 0, 0, 1.1, 0.4); break;
    case 'sodaRocket': { const r = makeSodaRocket(); r.rotation.z = -0.4; add(r, 0, 0, 0, 1.2); break; }
    case 'freezeRay': {
      // a cluster of voxel ice crystals with glowing tips
      const g = G();
      const crystal = (cx, cz, r, hgt, lean) => {
        for (let y = 0; y <= hgt; y++) {
          const k = y / hgt;
          const rr = r * (k < 0.75 ? 1 : (1 - k) / 0.25);
          const ox = Math.round(lean * y);
          for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++) for (let z = -Math.ceil(rr); z <= Math.ceil(rr); z++) {
            if (Math.abs(x) + Math.abs(z) > rr + 0.3) continue;
            const edge = Math.abs(x) + Math.abs(z) >= rr - 0.5;
            g.set(cx + x + ox, y, cz + z, y >= hgt - 1 ? 0xffffff : edge ? 0xbff6ff : x < 0 ? 0x5fd0ff : 0x9ff2ff, y >= hgt - 1);
          }
        }
      };
      crystal(0, 0, 3, 22, 0);
      crystal(-5, 2, 2, 12, -0.18);
      crystal(5, 1, 2, 14, 0.15);
      crystal(1, -4, 1.6, 9, 0.05);
      crystal(-2, 4, 1.4, 7, -0.1);
      const mesh = makeMesh(g.build({ scale: 0.05, pivot: 'bottom', jitter: 0.03, maxSamples: 60 }), Mats.toyGlossPair);
      g.dispose?.();
      add(mesh);
      break;
    }
    case 'labShield': {
      g.add(voxelDome(0.62, 0x29b6f6));
      add(makeBeaker(0x29b6f6), 0, 0, 0, 1.4);
      break;
    }
    case 'slimeFlood': add(makeBeaker(0x7cff3a), 0, 0, 0, 2.2, 0.3); break;
    default: add(makeBeaker(0xff2e88), 0, 0, 0, 2);
  }
  return g;
}

// ---------------------------------------------------------------------------

export class VialOpenScene {
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x070918);
    s.fog = new THREE.Fog(0x070918, 9, 24);
    this.camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 60);
    this.bloom = { strength: 0.55, radius: 0.16, threshold: 1.7 };
    this.shakeScale = 0.55;
    this.t = 0;
    this.lightK = 1;
    this.lightTarget = 1;
    this.flareK = 0;
    this.fizzT = 0;
    this.beats = new Set();
    this.phase = 'drop';
    this.view = { look: new THREE.Vector3(0, 0.9, 0), hv: 4.4, ax: 0.5, ay: 0.5, pitch: 0.2 };
    this.viewT = { look: new THREE.Vector3(0, 0.9, 0), hv: 4.4, ax: 0.5, ay: 0.5, pitch: 0.2 };
    this.buildStage();
  }

  // ===================================================================== setup
  buildStage() {
    const s = this.scene;
    const gs = stageGeos();
    // ---- lights
    this.hemi = new THREE.HemisphereLight(0x8a9cff, 0x1a0f2a, 0.7);
    const spot = (this.spot = new THREE.SpotLight(0xfff0dc, 21, 18, 0.42, 0.55, 1));
    spot.position.set(0.5, 6.6, 2.8);
    spot.target.position.set(0, 0.6, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 2;
    spot.shadow.camera.far = 14;
    this.rimL = new THREE.DirectionalLight(0xff4fd8, 1.6);
    this.rimL.position.set(-5, 3.5, -4);
    this.rimR = new THREE.DirectionalLight(0x4fd0ff, 1.4);
    this.rimR.position.set(5, 3, -4.5);
    this.fill = new THREE.DirectionalLight(0xb0c4ff, 0.6);
    this.fill.position.set(-1, 2.5, 6);
    s.add(this.hemi, spot, spot.target, this.rimL, this.rimR, this.fill);
    this.lightBase = [[this.hemi, 0.7, 0.08], [this.rimL, 1.6, 0.15], [this.rimR, 1.4, 0.15], [this.fill, 0.6, 0.03]];
    // visible light cone
    const coneMat = new THREE.MeshBasicMaterial({ map: tex('cone'), color: 0xfff0d0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.coneMat = coneMat;
    this.cone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 1, 1, 32, 1, true), coneMat);
    this.cone.renderOrder = 8;
    s.add(this.cone);
    // ---- bench + wall + props
    const table = makeMesh(gs.table, Mats.pair);
    table.receiveShadow = true;
    s.add(table);
    const wallMat = new THREE.MeshLambertMaterial({ map: tex('wall') });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(18, 10.125), wallMat);
    wall.position.set(0, 2.6, -4.6);
    s.add(wall);
    const sign = makeMesh(gs.sign, Mats.pair);
    sign.position.set(2.9, 3.8, -4.5);
    s.add(sign);
    for (const [x, y] of [[-3.1, 1.9], [3.1, 1.9]]) {
      const sh = makeMesh(gs.shelf, Mats.pair);
      sh.position.set(x, y, -4.32);
      s.add(sh);
      const cols = [0x7cff3a, 0xff2e88, 0x29d6ff, 0xffd23f, 0xb05cff];
      for (let i = 0; i < 3; i++) {
        const bk = makeBeaker(cols[(i + Math.round(x + y * 3)) % cols.length & 3]);
        bk.scale.setScalar(1.25 + ((i + y * 2) % 2) * 0.35);
        bk.position.set(x - 0.6 + i * 0.6, y + 0.12, -4.25);
        s.add(bk);
      }
    }
    // big specimen tank (back right) with a sleeping silhouette
    const tank = new THREE.Group();
    tank.add(makeMesh(gs.tank, Mats.toyPair));
    this.tankMat = new THREE.MeshStandardMaterial({ color: 0x2bd96a, emissive: 0x1fbf55, emissiveIntensity: 0.5, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const tankLiq = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 2.05, 24, 1, true), this.tankMat);
    tankLiq.position.y = 0.24 + 1.025;
    const tankSil = makeMesh(gs.tankSil, Mats.toyPair);
    tankSil.position.set(0, 0.55, 0);
    this.tankSil = tankSil;
    tank.add(tankSil, tankLiq);
    tank.position.set(3.55, 0, -2.6);
    s.add(tank);
    this.tankPos = tank.position.clone();
    // bench props: rack, bubbling flask, water jug
    const rack = makeMesh(gs.rack, Mats.toyPair);
    rack.position.set(-1.95, 0, -0.8);
    rack.rotation.y = 0.25;
    s.add(rack);
    const flask = makeBeaker(0x7cff3a);
    flask.scale.setScalar(1.7);
    flask.position.set(2.35, 0, -1.5);
    s.add(flask);
    this.flaskTop = new THREE.Vector3(2.35, 0.62, -1.5);
    this.buildJug();
    // ---- reveal pieces: pedestal + rarity ring, rays, light beam
    this.ped = new THREE.Group();
    const pm = makeMesh(gs.ped, Mats.toyGlossPair);
    pm.receiveShadow = true;
    this.ped.add(pm);
    // glowing voxel chevrons round the pedestal top (tinted per rarity)
    const ring = pixelStuds(0.6, 0xffffff, 8);
    this.ringMat = ring.material;
    this.pedRing = ring;
    ring.position.y = PED_TOP + 0.005;
    this.ped.add(ring);
    this.ped.position.set(0, 0, PED_Z);
    this.ped.scale.setScalar(0.001);
    this.ped.visible = false;
    s.add(this.ped);
    this.rays = new THREE.Group();
    this.rayMat = new THREE.MeshBasicMaterial({ map: tex('ray'), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
    const rg = new THREE.PlaneGeometry(0.55, 4.2);
    rg.translate(0, 2.1, 0);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(rg, this.rayMat);
      m.rotation.z = (i / 16) * Math.PI * 2;
      m.scale.x = i % 2 ? 0.6 : 1;
      this.rays.add(m);
    }
    this.rays.position.set(0, PED_TOP + 0.62, PED_Z - 0.55);
    this.rays.renderOrder = 1;
    this.rays.visible = false;
    s.add(this.rays);
    this.rayK = 0;
    this.rayTarget = 0;
    this.raySpin = 0.35;
    this.beamMat = new THREE.MeshBasicMaterial({ map: tex('cone'), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const bg = new THREE.CylinderGeometry(0.75, 0.3, 1, 24, 1, true);
    bg.translate(0, 0.5, 0);
    const buv = bg.attributes.uv;
    for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i)); // bright end at the narrow base
    this.beam = new THREE.Mesh(bg, this.beamMat);
    this.beam.visible = false;
    this.beam.renderOrder = 9;
    s.add(this.beam);
  }

  buildJug() {
    const gs = stageGeos();
    const jug = new THREE.Group();
    jug.add(makeMesh(gs.jug, Mats.toyPair));
    this.jugGlassMat = new THREE.MeshStandardMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2 });
    if (Mats.toy.envMap) this.jugGlassMat.envMap = Mats.toy.envMap;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.28, 0.56, 24, 1, true), this.jugGlassMat);
    glass.position.y = 0.33;
    glass.renderOrder = 4;
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x5fc0ff, emissive: 0x2a7fd0, emissiveIntensity: 0.35, transparent: true, opacity: 0.75, roughness: 0.1, depthWrite: false });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.36, 20), this.waterMat);
    water.position.y = 0.26;
    water.renderOrder = 3;
    jug.add(water, glass);
    this.jugWater = water;
    this.spout = new THREE.Object3D();
    this.spout.position.set(-0.38, 0.62, 0);
    jug.add(this.spout);
    jug.position.set(1.35, 0, 0.45);
    jug.rotation.y = -0.4;
    this.scene.add(jug);
    this.jug = jug;
    this.jugRest = jug.position.clone();
    const sg = new THREE.CylinderGeometry(0.035, 0.028, 1, 10, 1, true);
    sg.translate(0, -0.5, 0);
    this.stream = new THREE.Mesh(sg, this.waterMat);
    this.stream.visible = false;
    this.stream.renderOrder = 3;
    this.scene.add(this.stream);
  }

  // ===================================================================== enter
  enter(params = {}) {
    let q = null;
    try { q = new URLSearchParams(location.search); } catch (e) { /* no location */ }
    this.devOpts = {
      forceUpgrade: q?.get('forceUpgrade') === '1', noUpgrade: q?.get('forceUpgrade') === '0',
      newCut: q?.get('newcut') === '1', entrance: q?.get('entrance') || null,
    };
    if (!params.preview && q?.get('preview') && q.getAll('dev').includes('vial')) params = { ...params, preview: { entrance: q.get('preview'), card: q.get('card') || 'panther' } };
    this.params = params;
    const type = vialId(params.type ?? params.vial ?? 'testTube');
    this.type = type;
    this.def = VIALS[type];
    this.product = this.def.product ?? 'testTube';
    this.back = params.back ?? 'home';
    this.backParams = params.backParams ?? {};
    this.source = params.source ?? null;
    this.preview = params.preview ?? null;
    this.touch = isTouchDevice();

    // ---- rewards: pre-rolled now (re-rolled on each shake upgrade), applied once when the vial pops
    this.up = 0;
    this.maxUp = params.result || this.preview || this.devOpts.noUpgrade ? 0 : maxVialUpgrades(this.def);
    this.shakesMax = this.product === 'testTube' ? VIAL_SHAKES.testTube : VIAL_SHAKES.box;
    this.shakesDone = 0;
    this.committed = false;
    this.liq = this.def.liquid;
    const res = this.preview ? { type, coins: 0, bucks: 0, cards: [], _applied: true } : params.result ?? rollVial(type, { upgrade: 0 });
    this.result = res;
    const applied0 = !!res._applied || (res.cards ?? []).some((c) => c.after);
    this.coinsShown = state.p.coins - (applied0 ? res.coins ?? 0 : 0);
    this.bucksShown = state.p.bucks - (applied0 ? res.bucks ?? 0 : 0);
    this.coinsAfter = this.coinsShown + (res.coins ?? 0);
    this.bucksAfter = this.bucksShown + (res.bucks ?? 0);
    if (!this.preview && !applied0) setOpeningVial({ type, source: this.source, result: res });
    this.preRoll();
    this.stacks = [];
    this.items = [];

    // ---- vial
    this.vial = makeVial(type, { glowColor: this.def.liquid });
    this.vial.root.position.set(0, 6, 0);
    this.scene.add(this.vial.root);
    this.hint = new THREE.Object3D();
    this.hint.position.set(0, Math.min(1.1, this.vial.height * 0.55), 0.2);
    this.vial.body.add(this.hint);
    this.ghost = new THREE.Object3D(); // the tutorial hand follows this (pour / shake demos)
    this.scene.add(this.ghost);
    this.jug.visible = this.product === 'testTube';
    this.placeJug();
    this.framing('vial', true);

    this.buildUI();
    this.onKey = (e) => {
      if (this.summaryShown) {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.finish(); }
        return;
      }
      if (e.key === 'Escape') { this.skip(); return; }
      if (this.mode === 'shake') return; // ShakeInput handles Space / arrows
      if (this.mode === 'pour') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (this.pourS) this.pourS.auto = true; }
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.onTap(); }
    };
    window.addEventListener('keydown', this.onKey);
    audio.music && audio.trackName == null && audio.music('lab');
    this.flow = (this.preview ? this.runPreview() : this.run()).catch((e) => {
      console.error('vial open flow failed', e);
      if (!this.dead) this.preview ? this.finish() : this.showSummary();
    });
    if (typeof window !== 'undefined') window.__vialOpen = this;
  }

  /** Card / rarity info of the current (not yet applied) roll: drives the glow hints + the title. */
  preRoll() {
    const res = this.result;
    const raw = [...(res.cards ?? [])];
    for (const sp of res.spells ?? []) raw.push({ id: sp, copies: 1 });
    const ok = raw.filter((c) => cardDef(c.id));
    this.totalCards = ok.reduce((a, c) => a + c.copies, 0);
    this.best = ok.reduce((a, c) => Math.max(a, RARITIES[cardDef(c.id).rarity ?? 'common']?.order ?? 0), -1);
    this.bestRarity = this.best >= 0 ? Object.values(RARITIES).find((r) => r.order === this.best).id : null;
    this.rareColor = this.best >= 0 ? RARITIES[this.bestRarity].hex : 0xffd23f;
  }

  /** Apply the rolled rewards (exactly once) and build the reveal stacks. */
  commit() {
    if (this.committed) return;
    this.committed = true;
    const res = this.result;
    const raw = [...(res.cards ?? [])];
    for (const sp of res.spells ?? []) raw.push({ id: sp, copies: 1, variant: 'base' });
    const before = {};
    for (const c of raw) { const o = owned(c.id); before[c.id] = o ? { level: o.level, copies: o.copies } : null; }
    const applied = !!res._applied || (res.cards ?? []).some((c) => c.after);
    if (!applied) {
      applyVial(res);
      res._applied = true;
    }
    if (!this.preview) setOpeningVial(null);
    state.save();
    this.stacks = raw.filter((c) => cardDef(c.id)).map((c) => {
      const d = cardDef(c.id);
      const o = owned(c.id);
      const up = upgradeInfo(c.id);
      const b = before[c.id];
      const after = { level: o?.level ?? 1, copies: o?.copies ?? 0, need: up && !up.max ? up.copies : null, max: !!up?.max };
      // copies before this vial (a brand new card starts at 0; its first copy is the card itself)
      const isNew = c.isNew ?? (applied ? false : !b);
      const beforeCopies = !applied ? (b ? b.copies : 0) : isNew ? 0 : Math.max(0, after.copies - c.copies);
      return {
        ...c, def: d, rarity: d.rarity ?? 'common', order: RARITIES[d.rarity ?? 'common']?.order ?? 0, spell: isSpell(c.id),
        isNew, variant: c.variant ?? 'base', beforeCopies, after, canUpgrade: !!(up && !up.max && up.enoughCopies),
      };
    });
    this.totalCards = this.stacks.reduce((a, st) => a + st.copies, 0);
    this.items = [];
    if (res.coins) this.items.push({ kind: 'coins', amount: res.coins });
    if (res.bucks) this.items.push({ kind: 'bucks', amount: res.bucks });
    for (const st of this.stacks) this.items.push({ kind: 'card', st });
    this.counterNum.textContent = String(this.totalCards);
  }

  /** The water jug's resting spot (closer to the tube on narrow portrait screens so it stays in shot). */
  placeJug() {
    const portrait = engine.height > engine.width;
    this.jugRest.set(portrait ? 0.92 : 1.35, 0, portrait ? 0.62 : 0.45);
    if (this.mode !== 'pour' && this.phase === 'drop') this.jug.position.copy(this.jugRest);
  }

  /** Dev/test helper: screen positions of the jug, the pour spot and the vial. */
  dbgPos() {
    const sc = (v) => { const p = engine.toScreen(v, this.camera); return [Math.round(p.x), Math.round(p.y)]; };
    return { jug: sc(this.jug.position.clone().setY(0.45)), pour: sc(POUR_POS.clone().setY(POUR_POS.y + 0.2)), vial: sc(this.vial.root.position.clone().setY(this.vial.height * 0.5)), mode: this.mode, up: this.up, shakes: this.shakesDone, fill: this.pourS?.fill, grab: !!this.pourS?.grab, rz: +this.jug.rotation.z.toFixed(2), jp: this.jug.position.toArray().map((x) => +x.toFixed(2)), sp: this.spout.getWorldPosition(new THREE.Vector3()).toArray().map((x) => +x.toFixed(2)), stream: this.stream.visible, fps: Math.round(engine.fps) };
  }

  /** The vial's current rarity tier (after shake upgrades). */
  tier() {
    return vialTier(this.def, this.up);
  }
  vialName() {
    return upgradedName(this.def, this.up);
  }
  ribbonColor() {
    return this.up > 0 ? VIAL_TIER_LOOK[this.tier()].ribbon : RIBBON[this.def.rarity] ?? 'blue';
  }

  exit() {
    this.dead = true;
    // never lose a vial: anything rolled but not yet applied is applied now
    if (!this.committed) { try { this.commit(); } catch (e) { console.warn(e); } }
    this.shakeIn?.stop();
    this.tilt?.stop();
    this.cut?.dispose();
    engine.timeScale = 1;
    this.camera.clearViewOffset?.();
    this.spot.dispose(); // frees the shadow map
    window.removeEventListener('keydown', this.onKey);
    if (this.unpoint) { this.unpoint(); this.unpoint = null; }
    this.hurry();
    if (this.tapResolve) { const r = this.tapResolve; this.tapResolve = null; r(); }
    for (const k of ['pourDone', 'shakeDone']) if (this[k]) { const r = this[k]; this[k] = null; r(); }
    this.vial?.dispose();
    if (window.__vialOpen === this) window.__vialOpen = null;
  }

  // ===================================================================== UI
  buildUI() {
    const root = (this.ui = h('div', { class: `vo-root p-${this.product}` }));
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .btn, .vo-sum-box')) return;
      audio.unlock();
      if (this.mode === 'pour') { this.pourDown(e); return; }
      if (this.mode === 'shake') return; // ShakeInput listens on this element
      if (this.cut) { this.cut.tap(); return; }
      this.onTap();
    });
    // iOS only grants motion / orientation access from a click or touchend
    const askMotion = () => {
      if (!this.touch || this.motionAsked || !motionNeedsPermission()) return;
      this.motionAsked = true;
      requestMotion().then((r) => {
        this.motionDenied = r !== 'granted';
        if (this.mode === 'shake' || this.mode === 'pour') this.refreshPrompt();
      });
    };
    root.addEventListener('click', askMotion);
    root.addEventListener('touchend', askMotion);
    this.coinPill = pill('coin', fmt(this.coinsShown));
    this.bucksPill = pill('bucks', fmt(this.bucksShown));
    this.skipBtn = button(this.preview ? 'BACK' : 'SKIP', () => (this.preview ? this.finish() : this.skip()), 'gray sm vo-skip vo-hide', { icon: 'arrowR', sound: 'tap' });
    const top = h('div', { class: 'vo-top' }, h('div', { class: 'vo-pills' }, this.coinPill, this.bucksPill), this.skipBtn);
    this.titleEl = h('div', { class: 'vo-title' });
    this.renderTitle();
    this.promptEl = h('div', { class: 'vo-prompt vo-hide' });
    this.subEl = h('div', { class: 'vo-sub vo-hide' });
    // shake meter: one charge cell per allowed shake + the upgrade odds
    this.cells = Array.from({ length: this.shakesMax }, () => h('i'));
    this.shakeN = h('b', {}, `0/${this.shakesMax}`);
    this.oddsEl = h('div', { class: 'vo-odds' });
    this.shakeEl = h('div', { class: 'vo-shake vo-hide' },
      h('div', { class: 'vo-shake-head' }, icon('vial', 'vo-shake-ic'), h('span', {}, 'SHAKES'), this.shakeN),
      h('div', { class: 'vo-shake-cells' }, ...this.cells),
      this.oddsEl);
    this.tapEl = h('div', { class: 'vo-tap vo-hide' }, 'TAP TO CONTINUE');
    this.counterNum = h('b', {}, String(this.totalCards));
    this.counterEl = h('div', { class: 'vo-counter vo-hide' }, h('img', { class: 'vo-counter-img', src: vialThumb(this.type, 96), draggable: 'false' }), h('div', { class: 'vo-counter-n' }, this.counterNum, h('span', {}, 'cards left')));
    this.flashEl = h('div', { class: 'vo-flash' });
    root.append(top, this.titleEl, this.promptEl, this.subEl, this.shakeEl, this.tapEl, this.counterEl, this.flashEl);
    if (this.preview) { top.querySelector('.vo-pills').style.visibility = 'hidden'; this.titleEl.classList.add('vo-hide'); }
    $ui().appendChild(root);
  }

  /** Vial name ribbon + contents line (re-rendered when the vial upgrades). */
  renderTitle(bumped = false) {
    const srcTag = { free: 'FREE!', crown: 'CROWN REWARD', shop: 'FROM THE SHOP', reward: 'REWARD!' }[this.source];
    const res = this.result;
    this.titleEl.replaceChildren(
      ribbon(this.vialName().toUpperCase(), this.ribbonColor()),
      h('div', { class: 'vo-title-sub row center' },
        this.up ? h('span', { class: `vo-uptag t-${this.tier()}` }, icon('up'), this.up > 1 ? `UPGRADED x${this.up}` : 'UPGRADED!') : srcTag ? h('span', { class: 'vo-src' }, srcTag) : null,
        this.totalCards ? h('span', { class: 'row', style: { gap: '0.25em' } }, icon('cards'), `x${this.totalCards}`) : null,
        h('span', { class: 'row', style: { gap: '0.25em' } }, icon('coin'), fmt(res.coins ?? 0)),
        res.bucks ? h('span', { class: 'row', style: { gap: '0.25em' } }, icon('bucks'), fmt(res.bucks)) : null));
    if (bumped) bump(this.titleEl, 'vo-titlebump');
  }

  setPrompt(text, sub = null) {
    if (!text) {
      this.promptEl.classList.add('vo-hide');
      this.subEl.classList.add('vo-hide');
      if (this.unpoint) { this.unpoint(); this.unpoint = null; }
      return;
    }
    if (this.promptEl.textContent !== text || this.promptEl.classList.contains('vo-hide')) {
      this.promptEl.textContent = text;
      this.promptEl.classList.remove('vo-hide');
      bump(this.promptEl, 'vo-pop');
    }
    this.subEl.textContent = sub ?? '';
    this.subEl.classList.toggle('vo-hide', !sub);
  }
  /** Prompt for the current interactive step (depends on touch + motion permission). */
  refreshPrompt() {
    if (this.mode === 'pour') {
      this.setPrompt('POUR IN THE WATER!', this.touch ? (this.motionDenied ? 'Drag the jug over the tube' : 'Drag the jug over the tube, or tilt your phone') : 'Drag the jug over the tube (or hold SPACE)');
    } else if (this.mode === 'shake') {
      const last = this.shakesDone >= this.shakesMax - 1;
      const big = this.touch && !this.motionDenied ? (last ? 'ONE MORE SHAKE!' : 'SHAKE YOUR PHONE!') : last ? 'ONE MORE SHAKE!' : 'SHAKE IT!';
      const sub = this.touch
        ? this.motionDenied ? 'Motion is off: swipe the vial left & right!' : 'or swipe the vial left & right'
        : 'Swipe the vial left & right (or press SPACE)';
      this.setPrompt(big, sub);
    }
  }
  /** Shake meter cells + upgrade odds. */
  updateShakeMeter(pop = -1) {
    const liq = '#' + new THREE.Color(this.up ? VIAL_TIER_LOOK[this.tier()].liquid : 0x29b6f6).getHexString();
    this.cells.forEach((c, i) => {
      const st = i < this.shakesDone ? 'on' : i === this.shakesDone ? 'cur' : 'off';
      c.className = st === 'off' ? '' : st;
      c.style.backgroundImage = `url(${tubeSprite(st, liq)})`;
      if (i === pop) bump(c, 'vo-cellpop');
    });
    this.shakeN.textContent = `${this.shakesDone}/${this.shakesMax}`;
    const o = this.oddsEl;
    if (this.maxUp <= 0 && this.up === 0) { o.classList.add('vo-hide'); return; }
    o.classList.remove('vo-hide');
    if (this.up >= this.maxUp) {
      o.className = `vo-odds max t-${this.tier()}`;
      o.replaceChildren(icon('star', 'vo-odds-ic'), h('span', {}, 'MAX UPGRADE!'));
      return;
    }
    const next = vialTier(this.def, this.up + 1);
    const pct = Math.round((this.devOpts.forceUpgrade ? 1 : VIAL_UPGRADE_CHANCE[this.up] ?? 0) * 100);
    o.className = `vo-odds t-${next}`;
    o.replaceChildren(icon('up', 'vo-odds-ic'), h('span', {}, `${pct}% per shake to upgrade to `), h('b', {}, VIAL_TIER_LOOK[next].name.toUpperCase()));
  }

  flash(a = 0.6, dur = 0.35) {
    const f = this.flashEl;
    if (!f) return;
    f.style.transition = 'none';
    f.style.opacity = String(a);
    void f.offsetWidth;
    f.style.transition = `opacity ${dur}s ease-out`;
    f.style.opacity = '0';
  }

  // ===================================================================== flow helpers
  halt() {
    return this.dead || this.skipped;
  }
  /** A dramatic pause; tapping hurries it. */
  beat(sec) {
    if (this.halt()) return Promise.resolve();
    const j = animate(sec, null);
    this.beats.add(j);
    return j.promise.then(() => this.beats.delete(j));
  }
  hurry() {
    for (const j of this.beats) j.finish();
    this.beats.clear();
  }
  waitTap(minDelay = 0.2) {
    if (this.halt()) return Promise.resolve();
    return new Promise((res) => {
      this.tapResolve = res;
      this.tapReadyAt = performance.now() + minDelay * 1000;
    });
  }
  onTap() {
    if (this.summaryShown || this.dead) return;
    if (this.tapResolve && performance.now() >= this.tapReadyAt) {
      const r = this.tapResolve;
      this.tapResolve = null;
      r();
      return;
    }
    this.hurry();
  }

  setLights(k, instant = false) {
    this.lightTarget = k;
    if (instant) this.lightK = k;
  }

  /** Camera framing per phase (also re-run on resize). */
  framing(kind, instant = false) {
    const W = engine.width, H = engine.height;
    const asp = W / H, portrait = H > W;
    const v = this.viewT;
    if (kind === 'vial' || kind === 'drop') {
      const vh = this.vial?.height ?? 1.9, vw = Math.max(this.vial?.width ?? 1, (this.vial?.depth ?? 1) * 0.7);
      v.hv = Math.max(vh * (portrait ? 2.65 : 1.95), (vw * (portrait ? 1.8 : 2.8)) / asp, 3.2);
      v.look.set(0, vh * 0.5, 0);
      v.ax = 0.5;
      v.ay = portrait ? 0.47 : 0.52;
      v.pitch = this.product === 'cashCase' ? 0.5 : this.product === 'testTube' ? 0.24 : 0.32;
    } else if (kind === 'reveal') {
      v.hv = portrait ? Math.max(4.4, 2.3 / asp) : 3.0;
      v.look.set(0, PED_TOP + TOY_H * 0.55, PED_Z);
      v.ax = portrait ? 0.5 : 0.3;
      v.ay = portrait ? 0.32 : 0.5;
      v.pitch = 0.22;
    } else if (kind === 'summary') {
      v.hv = portrait ? Math.max(5.2, 2.6 / asp) : 3.6;
      v.look.set(0, 0.9, 0);
      v.ax = 0.5;
      v.ay = 0.5;
      v.pitch = 0.2;
    }
    this.frameKind = kind;
    if (instant) {
      this.view.look.copy(v.look);
      this.view.hv = v.hv;
      this.view.ax = v.ax;
      this.view.ay = v.ay;
      this.view.pitch = v.pitch;
    }
  }

  /** Where the opened vial waits during the card reveal (behind / beside the pedestal) and its scale. */
  vialRevealPos() {
    const portrait = engine.height > engine.width;
    return portrait ? new THREE.Vector3(0, 0, -1.55) : new THREE.Vector3(-1.2, 0, -1.3);
  }
  vialRevealScale() {
    return { testTube: 0.7, labPack: 0.66, megaLab: 0.54, cashCase: 0.62 }[this.product] ?? 0.7;
  }

  // ===================================================================== main flow
  async run() {
    await this.dropIn();
    if (this.halt()) return;
    this.skipBtn.classList.remove('vo-hide');
    if (this.product === 'testTube') await this.pourPhase();
    if (this.halt()) return;
    await this.shakePhase();
    if (this.halt()) return;
    this.commit();
    await this.burst();
    if (this.halt()) return;
    await this.toReveal();
    for (let i = 0; i < this.items.length; i++) {
      if (this.halt()) return;
      const it = this.items[i];
      if (it.kind === 'card') await this.revealCard(it.st, i);
      else await this.revealCurrency(it);
    }
    if (this.halt()) return;
    this.showSummary();
  }

  /** Shop preview of an entrance: straight into the NEW CARD cutscene, then back. */
  async runPreview() {
    const pv = this.preview;
    const id = cardDef(pv.card) ? pv.card : 'panther';
    const d = cardDef(id);
    const st = { id, def: d, copies: 1, rarity: d.rarity ?? 'common', order: RARITIES[d.rarity ?? 'common']?.order ?? 0, spell: isSpell(id), isNew: true, variant: 'base' };
    this.committed = true;
    this.phase = 'reveal';
    const v = this.vial;
    v.root.position.copy(this.vialRevealPos());
    v.root.scale.setScalar(this.vialRevealScale());
    if (this.product === 'testTube') { v.setFill(0.6, 1); v.capAside(1, 0.01); }
    v.setGlowColor(RARITIES[st.rarity].hex);
    v.setGlow(0.5);
    this.jug.position.set(this.jugRest.x + 1.5, 0, this.jugRest.z - 0.9);
    this.skipBtn.classList.add('vo-hide');
    await this.beat(0.2);
    if (this.dead) return;
    const cut = new NewCardCutscene(this, st, { entrance: pv.entrance, preview: true });
    await cut.play();
    if (this.dead) return;
    cut.dispose();
    this.finish();
  }

  async dropIn() {
    const v = this.vial;
    v.root.position.set(0, 6, 0);
    await this.beat(0.3);
    if (this.dead) return;
    audio.play('whoosh', { pitch: 0.7 });
    await animate(0.42, (e) => (v.root.position.y = 6 * (1 - e)), { ease: 'inQuad' }).promise;
    if (this.dead) return;
    v.root.position.y = 0;
    v.squash(1.2);
    v.shake(0.35);
    audio.play('thud', { pitch: 1.05 });
    engine.shake(0.3);
    const r = Math.max(v.width, v.depth) * 0.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      fx.dust(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.7), { count: 3, scale: 1.4, vx: Math.cos(a) * 1.2, color: pick([0x8e9ab8, 0x6b7590, 0xb8c2d6]) });
    }
    pixelShock(this.scene, new THREE.Vector3(0, 0.01, 0), { radius: 1.6, color: 0xb8c6e8, dur: 0.4 });
    await animate(0.3, (e, k) => (v.root.position.y = Math.sin(k * Math.PI) * 0.16)).promise;
    if (this.dead) return;
    v.root.position.y = 0;
    v.squash(0.5);
    audio.play('thud', { pitch: 1.6 });
    // the glow hints at what's inside
    v.setGlowColor(this.best >= 1 ? this.rareColor : this.liq);
    v.setGlow(0.22 + Math.max(0, this.best) * 0.06);
    this.idleSparkle = true;
    await this.beat(0.2);
  }

  /** One escalating shake of the vial (k = progress 0..1, strength 0..1). */
  shakeHit(i, n, strength = 0.8) {
    const v = this.vial;
    const k = (i + 1) / n;
    const best = Math.max(0, this.best);
    const sMul = 0.6 + strength * 0.6;
    v.shake((0.7 + k * 1.1) * sMul);
    v.squash(-0.5 * sMul);
    engine.shake((0.1 + k * 0.22 + best * 0.02) * sMul);
    this.flareK = Math.max(this.flareK, 0.2 + k * 0.6 + best * 0.06);
    const c = new THREE.Color(this.liq).lerp(new THREE.Color(this.rareColor), Math.min(1, k * 1.2));
    v.setGlowColor(c.getHex());
    v.setGlow(0.3 + k * 0.6 + best * 0.05);
    const m = v.mouth();
    fx.sparkle(m.clone().setY(v.height * 0.6), { count: 6 + i * 4 + best * 4, colors: [0xffffff, this.rareColor], speed: 2.5 + i * 0.6, radius: 1.2 });
    if (this.product === 'testTube') {
      audio.play('rattle', { pitch: 0.9 + k * 0.5 });
      audio.play('slosh', { pitch: 0.8 + k * 0.7 });
      const f0 = v.foamK;
      animate(0.45, (e) => v.setFoam(f0 + (Math.min(0.95, k * 0.95) - f0) * e), { ease: 'outBack' });
      fx.bubbles(new THREE.Vector3(v.root.position.x, v.surfaceY() + 0.05, 0), { count: 6 + i * 3, color: this.liq, radius: 0.14, size: 0.045, speed: 0.8 });
      this.fizzT = Math.max(this.fizzT, 1.4);
      for (let b = 0; b < 3; b++) setTimeout(() => !this.dead && audio.play('bubble', { pitch: 0.9 + Math.random() * 0.6 }), b * 70);
    } else {
      audio.play('rattle', { pitch: 0.7 + k * 0.3 });
      audio.play('latch', { pitch: 1.2 - k * 0.3, vol: 0.5 });
      // the latches rattle loose on the shakes just before the last one
      const L = v.latchCount ?? 0;
      const li = i - (n - 1 - L);
      if (li >= 0 && li < L && v.latches[li]) {
        audio.play('latch', { pitch: 1 - li * 0.08 });
        v.unlatch(li);
        const p = v.latches[li].getWorldPosition(new THREE.Vector3());
        p.y += 0.25;
        fx.sparkle(p, { count: 10, colors: [0xffffff, this.rareColor, 0xffd23f], speed: 3, radius: 0.4 });
        fx.burst(p, { count: 5, colors: [0xd2d9e8, 0x7a849c], size: 0.04, speed: 2.5, life: 0.6 });
      }
    }
  }

  // ===================================================================== POUR (test tubes)
  async pourPhase() {
    const v = this.vial;
    audio.play('squeak', { pitch: 0.8 });
    v.capAside(1, 0.5);
    this.buildFillLine();
    this.tilt = new TiltInput();
    this.tilt.start();
    this.pourS = { grab: null, fill: 0, auto: false, sndT: 0, r0: this.jug.rotation.y, tilt: 0, pt: new THREE.Vector3(), target: this.jugRest.clone() };
    this.mode = 'pour';
    this.refreshPrompt();
    await new Promise((res) => (this.pourDone = res));
    this.pourDone = null;
    this.mode = null;
    this.tilt?.stop();
    this.setPrompt(null);
    this.hinted = true;
    if (this.halt()) return;
    // the fizz tablet kicks in: the bag dissolves, the water changes colour
    this.stream.visible = false;
    audio.play('latch', { pitch: 1.3 });
    const jug = this.jug, p0 = jug.position.clone(), rz = jug.rotation.z, ry = jug.rotation.y;
    animate(0.45, (e) => {
      jug.position.lerpVectors(p0, this.jugRest, e);
      jug.rotation.z = rz * (1 - e);
      jug.rotation.y = ry + (this.pourS.r0 - ry) * e;
    }, { ease: 'inOutCubic' });
    animate(0.4, (e) => (this.fillLine.scale.setScalar(1 + e * 0.6), this.fillLineMat.opacity = 0.9 * (1 - e)), { onComplete: () => (this.fillLine.visible = false) });
    await v.capAside(0, 0.45);
    if (this.halt()) return;
    v.shake(0.25);
    audio.play('fizz');
    v.dissolve(1.0);
    animate(1.1, (e) => v.setFill(v.fill, e));
    v.setGlow(0.35 + Math.max(0, this.best) * 0.05);
    this.fizzT = 2.2;
    animate(0.9, (e) => v.setFoam(e * 0.2), { ease: 'outCubic' });
    await this.beat(0.6);
  }

  /** Glowing "fill to here" ring around the tube. */
  buildFillLine() {
    if (!this.fillLine) {
      this.fillLine = fillMarks(0.27, 0x7fe6ff);
      this.fillLineMat = this.fillLine.material;
      this.scene.add(this.fillLine);
    }
    this.fillLine.position.set(0, 0.34 + 1.52 * FILL_TARGET, 0);
    this.fillLine.scale.setScalar(1);
    this.fillLine.visible = true;
  }

  pourDown(e) {
    const P = this.pourS;
    if (!P || P.grab) return;
    const pt = engine.rayToZPlane(e.clientX, e.clientY, this.jugRest.z);
    if (!pt) return;
    P.grab = { id: e.pointerId, off: this.jug.position.clone().sub(pt) };
    P.target.copy(this.jug.position);
    audio.play('tap', { pitch: 0.8 });
    if (this.unpoint) { this.unpoint(); this.unpoint = null; }
    const move = (ev) => {
      if (ev.pointerId !== P.grab?.id) return;
      const q = engine.rayToZPlane(ev.clientX, ev.clientY, this.jugRest.z);
      if (q) P.target.copy(q).add(P.grab.off);
    };
    const up = (ev) => {
      if (ev.pointerId !== P.grab?.id) return;
      P.grab = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Per frame while pouring: the jug follows the drag / phone tilt, tips over the tube and fills it. */
  updatePour(dt) {
    const P = this.pourS, jug = this.jug, v = this.vial;
    if (!P) return;
    const rest = this.jugRest;
    const want = _v3;
    let tiltT = 0, yawT = P.r0;
    const tk = this.tilt?.available ? Math.max(0, Math.min(1, (Math.abs(this.tilt.deg) - 10) / 28)) : 0;
    if (P.grab) {
      want.copy(P.target);
      want.x = Math.max(0.35, Math.min(2.3, want.x));
      want.y = Math.max(0, Math.min(2.7, want.y));
      // magnet: near the pour spot the jug snaps over the tube and tips
      const d = Math.hypot(want.x - POUR_POS.x, (want.y - POUR_POS.y) * 0.8);
      const over = Math.max(0, Math.min(1, 1 - (d - 0.12) / 0.6));
      want.lerp(POUR_POS, over * 0.65);
      want.z = rest.z + (POUR_POS.z - rest.z) * Math.min(1, over * 1.4);
      tiltT = 0.1 + over * (POUR_TILT - 0.1);
      yawT = P.r0 * (1 - over);
    } else if (P.auto || tk > 0.03) {
      const k = P.auto ? 1 : tk;
      want.copy(rest).lerp(POUR_POS, Math.min(1, k * 1.5));
      want.y += Math.sin(Math.min(1, k * 1.5) * Math.PI) * 0.25;
      tiltT = Math.min(1, k * 1.15) * POUR_TILT;
      yawT = P.r0 * (1 - Math.min(1, k * 1.5));
    } else want.copy(rest);
    const kp = 1 - Math.exp(-dt * 12);
    jug.position.lerp(want, kp);
    jug.rotation.z += (tiltT - jug.rotation.z) * (1 - Math.exp(-dt * 9));
    jug.rotation.y += (yawT - jug.rotation.y) * kp;
    // water only goes in when the spout is over the open tube and the jug is tipped
    jug.updateMatrixWorld(true);
    const sp = this.spout.getWorldPosition(_v2);
    const pouring = jug.rotation.z > 0.85 && Math.abs(sp.x - v.root.position.x) < 0.24 && Math.abs(sp.z - v.root.position.z) < 0.22 && sp.y > 1.9 && sp.y < 2.9;
    this.stream.visible = pouring;
    if (pouring) {
      P.fill = Math.min(FILL_TARGET, P.fill + dt * 0.6);
      v.setFill(P.fill, 0);
      this.jugWater.scale.y = Math.max(0.05, 1 - (P.fill / FILL_TARGET) * 0.85);
      this.jugWater.position.y = 0.08 + 0.18 * this.jugWater.scale.y;
      P.sndT -= dt;
      if (P.sndT <= 0) { P.sndT = 0.42; audio.play('pour', { vol: 0.8 }); }
      if (Math.random() < dt * 10) fx.bubbles(new THREE.Vector3(rand(-0.1, 0.1), v.surfaceY(), rand(-0.1, 0.1)), { count: 1, color: 0xbfefff, radius: 0.06, size: 0.04 });
    }
    this.fillLineMat.opacity = 0.55 + Math.sin(this.t * 6) * 0.35;
    // demo hand: drag from the jug to the tube while nothing has happened yet
    if (!P.grab && P.fill < 0.02 && tk < 0.03 && !P.auto) {
      const c = (this.t % 2.2) / 2.2;
      const a = Math.min(1, Math.max(0, (c - 0.15) / 0.55));
      const e = a * a * (3 - 2 * a);
      this.ghost.position.set(rest.x + (POUR_POS.x + 0.15 - rest.x) * e, 0.62 + (POUR_POS.y + 0.1 - 0.62) * e, rest.z);
      if (!this.unpoint) this.unpoint = pointAt(this.ghost, '', {});
    } else if (this.unpoint) { this.unpoint(); this.unpoint = null; }
    if (P.fill >= FILL_TARGET - 1e-4 && this.pourDone) {
      fx.bubbles(new THREE.Vector3(0, v.surfaceY(), 0), { count: 10, color: 0xbfefff, radius: 0.14, size: 0.045 });
      audio.play('reveal', { pitch: 1.3 });
      fx.sparkle(this.fillLine.position, { count: 14, colors: [0xffffff, 0x7fe6ff], speed: 2, radius: 0.5 });
      if (this.unpoint) { this.unpoint(); this.unpoint = null; }
      const r = this.pourDone;
      this.pourDone = null;
      r();
    }
  }

  // ===================================================================== SHAKE (+ upgrades)
  async shakePhase() {
    this.mode = 'shake';
    this.updateShakeMeter();
    this.shakeEl.classList.remove('vo-hide');
    bump(this.shakeEl, 'vo-pop');
    this.refreshPrompt();
    this.idleT = 0;
    this.dragK = 0;
    this.shakeIn = new ShakeInput({
      el: this.ui,
      onShake: (s, src) => this.onShake(s, src),
      onDrag: (k) => (this.dragK = k),
      onJiggle: (k) => { if (!this.busy) { this.vial.shake(k * 0.18); audio.play('slosh', { pitch: 1.4, vol: 0.4, gap: 0.12 }); } },
    });
    this.shakeIn.start();
    await new Promise((res) => (this.shakeDone = res));
    this.shakeDone = null;
    this.shakeIn?.stop();
    this.shakeIn = null;
    this.mode = null;
    this.dragK = 0;
    this.setPrompt(null);
    this.hinted = true;
    if (this.halt()) return;
    this.shakeEl.classList.add('vo-out');
    setTimeout(() => this.shakeEl?.classList.add('vo-hide'), 300);
  }

  async onShake(strength) {
    if (this.mode !== 'shake' || this.busy || this.halt()) return;
    const i = this.shakesDone++;
    const N = this.shakesMax;
    const last = this.shakesDone >= N;
    this.idleT = 0;
    if (this.unpoint) { this.unpoint(); this.unpoint = null; }
    this.updateShakeMeter(i);
    this.shakeHit(i, N, strength);
    navigator.vibrate?.(last ? 60 : 25);
    if (this.up < this.maxUp) {
      const chance = this.devOpts.forceUpgrade ? 1 : VIAL_UPGRADE_CHANCE[this.up] ?? 0;
      if (Math.random() < chance) {
        this.busy = true;
        await this.upgradeFx();
        this.busy = false;
        if (this.halt()) return;
      }
    }
    if (last) {
      const r = this.shakeDone;
      this.shakeDone = null;
      r?.();
    } else this.refreshPrompt();
  }

  /** UPGRADE! The vial transforms one rarity tier up and the contents are re-rolled at that tier. */
  async upgradeFx() {
    const v = this.vial;
    this.up++;
    const tier = this.tier();
    const look = VIAL_TIER_LOOK[tier];
    const rcol = RARITIES[tier];
    this.result = rollVial(this.type, { upgrade: this.up });
    setOpeningVial({ type: this.type, source: this.source, result: this.result });
    this.preRoll();
    stat('vialUpgrades');
    // 1. charge: lights down, rumble, rays in the new tier's colour
    this.shakeIn && (this.shakeIn.last = performance.now() + 900);
    audio.play('heartbeat');
    audio.play('flare', { pitch: 0.9 + this.up * 0.15 });
    this.setLights(0.3);
    this.ui.classList.add('vo-dark');
    v.setRumble(0.9);
    v.setGlowColor(look.glow);
    v.setGlow(1.3);
    this.rays.position.set(v.root.position.x, v.height * 0.55, v.root.position.z - 0.45);
    this.rayMat.color.set(look.glow);
    this.rayTarget = 0.85;
    this.raySpin = 1.4;
    fx.rise(new THREE.Vector3(v.root.position.x, 0, 0), { count: 30, colors: [look.glow, 0xffffff], radius: 0.6 });
    await animate(0.6, null).promise;
    if (this.dead) return;
    // 2. transform: flash, new colours, burst
    v.setRumble(0);
    engine.hitstop(0.08);
    engine.shake(0.55);
    this.flash(0.85, 0.5);
    audio.play('bigPop');
    audio.play('upgrade');
    audio.play('shimmer');
    audio.jingle(tier === 'legendary' ? 'rare' : 'unlock');
    if (this.product === 'testTube') {
      this.liq = look.liquid;
      v.setLiquidColor(look.liquid);
      if (look.cap) v.setCapColor(look.cap);
    }
    v.squash(1.3);
    v.shake(0.9);
    const mid = new THREE.Vector3(v.root.position.x, v.height * 0.6, 0.1);
    fx.sparkle(mid, { count: 50, colors: [0xffffff, look.glow, 0xffd23f], speed: 5, radius: 1.2 });
    pixelShock(this.scene, new THREE.Vector3(v.root.position.x, 0.02, 0), { radius: 2.8, color: look.glow });
    fx.burst(mid, { count: 24, layer: 'glow', colors: [0xffffff, look.glow], size: 0.06, speed: 5, grav: -3, life: 0.8 });
    if (tier === 'legendary' || tier === 'epic') fx.confetti(mid.clone().setY(v.height + 0.6), { count: 60, ground: 0, colors: [look.glow, 0xffffff, 0xffd23f, 0xff2e88] });
    bigBanner('UPGRADE!', this.vialName().toUpperCase(), { color: rcol?.color ?? '#fff', cls: 'vo-banner vo-upbanner', dur: 1.5 });
    this.renderTitle(true);
    this.updateShakeMeter();
    this.rareColor = Math.max(0, this.best) >= 1 ? this.rareColor : look.glow;
    this.setLights(1);
    this.ui.classList.remove('vo-dark');
    await animate(0.9, null).promise;
    this.rayTarget = 0;
    this.raySpin = 0.35;
    v.setGlow(0.6);
  }

  async burst() {
    const v = this.vial;
    const best = Math.max(0, this.best);
    const rc = this.rareColor;
    this.idleSparkle = false;
    // anticipation: rumble + light flare (longer for better contents)
    v.setGlowColor(rc);
    const build = this.best >= 1 ? 0.4 + best * 0.32 : 0.18;
    audio.play(this.best >= 1 ? 'flare' : 'rattle', { pitch: 1 + best * 0.05 });
    if (this.best >= 2) this.setLights(0.55);
    const j = animate(build, (e) => {
      v.setRumble(e * (0.7 + best * 0.3));
      v.setGlow(0.7 + e * (0.5 + best * 0.15));
      this.flareK = Math.max(this.flareK, e * (0.35 + best * 0.25));
      if (this.best >= 1) engine.shake(0.012 * (1 + best));
    });
    this.beats.add(j);
    await j.promise;
    this.beats.delete(j);
    v.setRumble(0);
    if (this.dead) return;
    await v.open();
    if (this.dead) return;
    // ---- POP!
    this.setLights(1);
    const m = v.mouth();
    audio.play('cork', { pitch: 0.9 + Math.random() * 0.2 });
    audio.play('bigPop');
    engine.shake(0.45 + best * 0.08);
    engine.hitstop(0.07);
    this.flash(this.best >= 2 ? 0.8 : 0.5);
    this.flareK = 1.4;
    fx.sparkle(m, { count: 30 + best * 15, colors: [0xffffff, rc, rc], speed: 5, radius: 1 });
    pixelShock(this.scene, new THREE.Vector3(0, 0.02, 0), { radius: 2.6, color: rc });
    this.beamBurst(rc, 1.2);
    if (this.product === 'testTube') {
      fx.foam(m, { count: 70, colors: [0xffffff, 0xf2fbff, this.liq, this.liq], speed: 2.2, power: 0.9, ground: 0 });
      fx.bubbles(m, { count: 18, color: this.liq, radius: 0.35, speed: 1.6 });
      animate(0.4, (e) => v.overflow(e), { ease: 'outBack' });
      v.setFoam(1);
      audio.play('slime', { pitch: 0.9 });
    } else {
      fx.burst(m, { count: 24, layer: 'glow', colors: [0xffffff, rc], size: 0.06, speed: 5, grav: -2, life: 0.9 });
      if (this.product === 'cashCase') {
        fx.cash(m, 46, { speed: 5.5, ground: 0, coinRatio: 0.35 });
        audio.play('chaching');
      }
    }
    if (this.best >= 2) fx.confetti(m.clone().setY(m.y + 0.4), { count: 70, ground: 0 });
    v.setGlow(1.1);
    await this.beat(0.75);
  }

  beamBurst(color, dur = 1) {
    const b = this.beam;
    const m = this.vial.mouth();
    b.position.copy(m);
    b.position.y -= 0.05;
    b.visible = true;
    this.beamMat.color.set(color).multiplyScalar(1.2);
    animate(dur, (e, k) => {
      b.scale.set(0.45 + k * 0.4, 0.2 + Math.min(1, k * 3) * 3.4, 0.45 + k * 0.4);
      this.beamMat.opacity = 0.42 * (1 - k) * (1 - k);
    }, { onComplete: () => (b.visible = false) });
  }

  async toReveal() {
    this.phase = 'reveal';
    this.rays.position.set(0, PED_TOP + 0.62, PED_Z - 0.55);
    this.titleEl.classList.add('vo-out');
    this.framing('reveal');
    const v = this.vial;
    const from = v.root.position.clone();
    const to = this.vialRevealPos();
    const sc = this.vialRevealScale();
    this.vialHome = to;
    audio.play('whoosh', { pitch: 0.9 });
    animate(0.6, (e) => {
      v.root.position.lerpVectors(from, to, e);
      v.root.scale.setScalar(1 - e * (1 - sc));
    }, { ease: 'inOutCubic' });
    this.ped.visible = true;
    animate(0.5, (e) => this.ped.scale.setScalar(Math.max(0.001, e)), { ease: 'outBack', delay: 0.2 });
    // the water jug makes room for the pedestal
    if (this.jug.visible) {
      const j0 = this.jug.position.clone();
      animate(0.5, (e) => this.jug.position.set(j0.x + e * 1.5, j0.y, j0.z - e * 0.9), { ease: 'inOutCubic' });
    }
    v.setGlow(0.3);
    if (this.totalCards) this.counterEl.classList.remove('vo-hide');
    await this.beat(0.55);
  }

  // ===================================================================== reveal: coins & bucks
  async revealCurrency(it) {
    if (this.halt()) return;
    const isCoins = it.kind === 'coins';
    const v = this.vial;
    this.dismissToy();
    this.dismissPanel();
    v.shake(0.6);
    const m = v.mouth();
    fx.cash(m, isCoins ? 30 : 14, { coinRatio: isCoins ? 0.9 : 0.15, speed: 4.5, ground: 0 });
    audio.play('chaching');
    this.rayTarget = 0.35;
    this.rayMat.color.set(isCoins ? 0xffd23f : 0xff4fa3);
    this.ringMat.color.set(isCoins ? 0xffd23f : 0xff4fa3);
    const num = h('b', { class: 'vo-cur-n' }, '0');
    const ic = icon(isCoins ? 'coin' : 'bucks', 'vo-cur-ic');
    const panel = h('div', { class: `vo-cur ${isCoins ? 'coins' : 'bucks'}` }, ic, h('div', { class: 'col', style: { gap: '0' } }, num, h('span', { class: 'vo-cur-l' }, isCoins ? 'Beast Coins' : 'Beast Bucks')));
    this.ui.appendChild(panel);
    this.panel = panel;
    let last = 0;
    animate(0.9, (e) => {
      const val = Math.round(it.amount * e);
      num.textContent = '+' + fmt(val);
      if (val - last >= Math.max(1, it.amount / 14)) { last = val; audio.play('coin', { gap: 0.04, pitch: 0.9 + e * 0.4 }); }
    }, { ease: 'outCubic' });
    // coins fly up into the wallet pill
    const pillEl = isCoins ? this.coinPill : this.bucksPill;
    const target = pillEl.querySelector('.pi') ?? pillEl;
    const nFly = Math.min(12, 4 + Math.round(Math.log2(it.amount + 1)));
    for (let i = 0; i < nFly; i++) {
      setTimeout(() => {
        if (this.dead || !panel.isConnected) return;
        const a = ic.getBoundingClientRect(), b = target.getBoundingClientRect();
        const f = icon(isCoins ? 'coin' : 'bucks', 'vo-fly');
        const sx = a.left + a.width / 2, sy = a.top + a.height / 2, ex = b.left + b.width / 2, ey = b.top + b.height / 2;
        f.style.left = sx + 'px';
        f.style.top = sy + 'px';
        this.ui.appendChild(f);
        const mx = (sx + ex) / 2 + rand(-80, 80), my = Math.min(sy, ey) - rand(20, 90);
        f.animate([
          { transform: 'translate(-50%,-50%) scale(0.6)', offset: 0 },
          { transform: `translate(calc(-50% + ${mx - sx}px), calc(-50% + ${my - sy}px)) scale(1.15)`, offset: 0.45 },
          { transform: `translate(calc(-50% + ${ex - sx}px), calc(-50% + ${ey - sy}px)) scale(0.7)`, offset: 1 },
        ], { duration: 650, easing: 'cubic-bezier(.4,.1,.4,1)' }).onfinish = () => {
          f.remove();
          if (this.dead) return;
          audio.play('coin', { gap: 0.03, pitch: 1.2 });
          bump(pillEl, 'bump');
          if (i === nFly - 1) {
            const fromV = isCoins ? this.coinsShown : this.bucksShown;
            if (isCoins) this.coinsShown += it.amount; else this.bucksShown += it.amount;
            rollNumber(pillEl.val, fromV, fromV + it.amount, 0.5);
            sparkle(pillEl, { count: 10, colors: isCoins ? ['#ffd84a', '#fff', '#ffc21a'] : ['#ff7ac0', '#fff'] });
          }
        };
      }, 250 + i * 70);
    }
    await this.beat(1.0);
    if (this.halt()) return;
    this.showTapHint();
    await this.waitTap(0.25);
    this.hideTapHint();
  }

  // ===================================================================== reveal: cards
  async revealCard(st, idx) {
    if (this.halt()) return;
    const v = this.vial;
    const rc = RARITIES[st.rarity].hex;
    this.dismissToy();
    this.dismissPanel();
    this.rayTarget = 0;
    // remaining counter
    const left = this.stacks.slice(this.stacks.indexOf(st) + 1).reduce((a, s) => a + s.copies, 0);
    // a card found for the first time: the NEW CARD cutscene, then it hops onto the pedestal
    if ((st.isNew || this.devOpts.newCut) && !this.skipped) {
      rollNumber(this.counterNum, left + st.copies, left, 0.35);
      await this.newCardCutscene(st);
      return;
    }
    // pre-launch build-up per rarity
    if (st.order >= 3) await this.legendaryBuild(st);
    else if (st.order === 2) await this.epicBuild(st);
    else if (st.order === 1) await this.rareBuild(st);
    if (this.halt()) return;
    rollNumber(this.counterNum, left + st.copies, left, 0.35);
    bump(this.counterEl, 'vo-pop');
    audio.play('countTick');
    // launch the toy out of the vial onto the pedestal
    const toy = this.makeToy(st);
    this.toy = toy;
    this.ringMat.color.set(rc).multiplyScalar(st.order >= 2 ? 1.8 : 1.1);
    const from = v.mouth();
    const to = new THREE.Vector3(0, PED_TOP, PED_Z);
    toy.root.position.copy(from);
    toy.root.scale.setScalar(toy.fit * 0.2);
    this.scene.add(toy.root);
    v.shake(0.55);
    audio.play('pop', { pitch: 0.75 + Math.random() * 0.2 });
    audio.play('whoosh', { pitch: 1.4 });
    if (this.product === 'testTube') fx.foam(from, { count: 14, colors: [0xffffff, this.liq], speed: 1.4, power: 0.6, ground: 0 });
    else fx.sparkle(from, { count: 12, colors: [0xffffff, rc], speed: 3 });
    const yaw = 0.42;
    const flight = animate(0.52, (e, k) => {
      toy.root.position.lerpVectors(from, to, e);
      toy.root.position.y += Math.sin(k * Math.PI) * 1.05;
      toy.root.rotation.y = yaw - (1 - e) * Math.PI * 2;
      toy.root.scale.setScalar(toy.fit * (0.2 + 0.8 * Math.min(1, k * 1.5)));
    }, { ease: 'outQuad' });
    await flight.promise;
    if (this.dead) return;
    toy.root.position.copy(to);
    toy.root.rotation.y = yaw;
    toy.root.scale.setScalar(toy.fit);
    toy.boing(0.8);
    this.pedBounce = 1;
    audio.play('thud', { pitch: 1.5 });
    fx.dust(new THREE.Vector3(0, PED_TOP, PED_Z), { count: 8, scale: 1.2, color: 0xdfe6f4 });
    this.landFx(st, toy);
    this.showCardPanel(st);
    setTimeout(() => {
      if (this.dead || this.toy !== toy) return;
      toy.attack(0.6);
      if (!st.spell) audio.play(st.order >= 3 ? 'roar' : 'growl', { pitch: st.order >= 3 ? 1 : 1.2 + Math.random() * 0.3 });
    }, 320);
    if (st.variant && st.variant !== 'base') await this.shinyReveal(st, toy);
    await this.beat(st.order >= 3 ? 1.0 : st.order >= 1 ? 0.6 : 0.35);
    if (this.halt()) return;
    this.showTapHint();
    await this.waitTap(0.25);
    this.hideTapHint();
    void idx;
  }

  /** NEW CARD cutscene (entrance + bottle + pose + stats), then the hero hops onto the pedestal. */
  async newCardCutscene(st) {
    const v = this.vial;
    v.shake(0.8);
    v.setGlowColor(RARITIES[st.rarity].hex);
    v.setGlow(1);
    audio.play('magic', { pitch: 0.7 });
    fx.sparkle(v.mouth(), { count: 24, colors: [0xffffff, RARITIES[st.rarity].hex], speed: 3.5, radius: 0.6 });
    const ped0 = this.ped.scale.x;
    animate(0.3, (e) => this.ped.scale.setScalar(Math.max(0.001, ped0 * (1 - e))), { ease: 'inBack' });
    await this.beat(0.3);
    if (this.halt()) return;
    const cut = new NewCardCutscene(this, st, { entrance: this.devOpts.entrance ?? equippedEntrance() });
    await cut.play();
    if (this.halt()) { cut.dispose(); return; }
    const toy = cut.release();
    // back to the reveal stage: the hero lands on the pedestal next to its card
    this.ped.visible = true;
    this.ped.scale.setScalar(1);
    this.framing('reveal', true);
    v.setGlow(0.15);
    if (!toy) return;
    this.toy = toy;
    this.ringMat.color.set(RARITIES[st.rarity].hex).multiplyScalar(st.order >= 2 ? 1.8 : 1.1);
    toy.root.position.set(0, PED_TOP + 0.9, PED_Z);
    toy.root.rotation.set(0, 0.42, 0);
    toy.root.scale.setScalar(toy.fit);
    this.scene.add(toy.root);
    await animate(0.28, (e) => (toy.root.position.y = PED_TOP + 0.9 * (1 - e)), { ease: 'inQuad' }).promise;
    if (this.dead) return;
    toy.boing(0.8);
    this.pedBounce = 1;
    audio.play('thud', { pitch: 1.5 });
    fx.dust(new THREE.Vector3(0, PED_TOP, PED_Z), { count: 8, scale: 1.2, color: 0xdfe6f4 });
    this.rayMat.color.set(RARITIES[st.rarity].hex);
    this.rayTarget = st.order >= 2 ? 0.6 : 0.3;
    this.showCardPanel(st);
    if (st.variant && st.variant !== 'base') await this.shinyReveal(st, toy);
    await this.beat(0.5);
    if (this.halt()) return;
    this.showTapHint();
    await this.waitTap(0.25);
    this.hideTapHint();
  }

  makeToy(st) {
    let toy;
    if (st.def?.special || cardDef(st.id)?.special) return this.makeHoloCard(st);
    if (st.spell) {
      const root = spellModel(st.id);
      const inner = new THREE.Group();
      inner.add(root);
      const holder = new THREE.Group();
      holder.add(inner);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      root.position.y -= box.min.y;
      const hh = box.max.y - box.min.y, ww = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      let sq = 0, sqV = 0, atk = -1, t = 0;
      toy = {
        root: holder, height: hh, width: ww,
        update(dt) {
          t += dt;
          sqV += (-sq * 160 - sqV * 10) * dt;
          sq += sqV * dt;
          if (atk >= 0) { atk += dt; if (atk > 0.6) atk = -1; }
          inner.rotation.y = Math.sin(t * 1.2) * 0.25 + (atk >= 0 ? Math.sin(atk * 20) * 0.3 : 0);
          inner.position.y = Math.sin(t * 2.2) * 0.03;
          inner.scale.set(1 - sq * 0.05, 1 + sq * 0.1, 1 - sq * 0.05);
        },
        boing(a) { sqV += a * 10; },
        attack() { atk = 0; },
      };
    } else {
      const rig = createSwarm(st.id, { variant: st.variant ?? 'base' });
      rig.setState('idle');
      toy = {
        root: rig.root, height: rig.height, width: Math.max(rig.width ?? 0, rig.length ?? 0), rig,
        update: (dt) => rig.update(dt), boing: (a) => rig.boing(a), attack: (d) => rig.attack(d),
      };
    }
    toy.fit = TOY_H / Math.max(toy.height, toy.width * 0.8, 0.45);
    toy.idleT = 2.4;
    return toy;
  }

  /** SPECIAL cards: a floating holo trading card with the card's art. */
  makeHoloCard(st) {
    const d = st.def ?? cardDef(st.id);
    const rc = RARITIES[st.rarity ?? d.rarity ?? 'common']?.color ?? '#b8c6e8';
    const W = 256, H = 352;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const draw = (img) => {
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#15121f';
      g.fillRect(0, 0, W, H);
      g.fillStyle = rc;
      g.fillRect(6, 6, W - 12, H - 12);
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1b2a6a');
      grd.addColorStop(1, '#0b0f30');
      g.fillStyle = grd;
      g.fillRect(18, 18, W - 36, H - 36);
      g.fillStyle = d.color ?? '#3ff2e0';
      g.globalAlpha = 0.25;
      for (let i = 0; i < 12; i++) g.fillRect(18, 18 + i * 26, W - 36, 10);
      g.globalAlpha = 1;
      if (img) g.drawImage(img, 28, 34, W - 56, (W - 56) * 1.25);
      g.fillStyle = '#15121f';
      g.fillRect(18, H - 74, W - 36, 56);
      g.fillStyle = '#fff';
      g.font = 'bold 26px sans-serif';
      g.textAlign = 'center';
      g.fillText((d.name ?? '').toUpperCase().slice(0, 18), W / 2, H - 38);
      // cost gem (a stepped pixel diamond)
      for (let r = 0; r < 7; r++) {
        const wd = (r < 4 ? r + 1 : 7 - r) * 6;
        g.fillStyle = '#15121f';
        g.fillRect(42 - wd - 3, 18 + r * 7 - 1, wd * 2 + 6, 9);
      }
      for (let r = 0; r < 7; r++) {
        const wd = (r < 4 ? r + 1 : 7 - r) * 6;
        g.fillStyle = r < 2 ? '#ff8ac4' : r < 5 ? '#ff2e88' : '#c4126a';
        g.fillRect(42 - wd, 18 + r * 7, wd * 2, 7);
      }
      g.fillStyle = '#fff';
      g.font = 'bold 30px sans-serif';
      g.fillText(String(d.elixir ?? 0), 42, 53);
    };
    draw(null);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    spellThumbAsync(st.id, 256).then((url) => {
      const img = new Image();
      img.onload = () => { draw(img); tx.needsUpdate = true; };
      img.src = url;
    }).catch(() => {});
    // a voxel card frame in the rarity colour with the art as a lit panel inside it
    const front = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.35, metalness: 0.1, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.35 });
    const card = new THREE.Group();
    const frame = voxCardFrame(new THREE.Color(rc).getHex());
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.86), front);
    art.position.z = 0.004;
    card.add(frame, art);
    const inner = new THREE.Group();
    card.position.y = 0.62;
    inner.add(card);
    const holder = new THREE.Group();
    holder.add(inner);
    let sq = 0, sqV = 0, atk = -1, t = 0;
    const toy = {
      root: holder, height: 1.15, width: 0.72,
      update(dt) {
        t += dt;
        sqV += (-sq * 160 - sqV * 10) * dt;
        sq += sqV * dt;
        if (atk >= 0) { atk += dt; if (atk > 0.6) atk = -1; }
        inner.rotation.y = Math.sin(t * 1.1) * 0.35 + (atk >= 0 ? Math.sin(atk * Math.PI / 0.6) * Math.PI * 2 : 0);
        inner.position.y = Math.sin(t * 2) * 0.04;
        inner.scale.set(1 - sq * 0.05, 1 + sq * 0.1, 1 - sq * 0.05);
      },
      boing(a) { sqV += a * 10; },
      attack() { atk = 0; },
    };
    toy.fit = TOY_H / 1.15;
    toy.idleT = 2.4;
    return toy;
  }

  dismissToy() {
    const toy = this.toy;
    if (!toy) return;
    this.toy = null;
    const p0 = toy.root.position.clone();
    const s0 = toy.root.scale.x;
    const side = engine.height > engine.width ? (Math.random() < 0.5 ? -1 : 1) : -1;
    animate(0.32, (e) => {
      toy.root.position.set(p0.x + side * e * 1.6, p0.y + Math.sin(e * Math.PI) * 0.5, p0.z + e * 0.4);
      toy.root.scale.setScalar(Math.max(0.001, s0 * (1 - e)));
      toy.update(0.016);
    }, { ease: 'inQuad', onComplete: () => this.scene.remove(toy.root) });
  }

  dismissPanel() {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    p.classList.add('vo-leave');
    setTimeout(() => p.remove(), 220);
  }

  showTapHint() {
    this.tapEl.classList.remove('vo-hide');
  }
  hideTapHint() {
    this.tapEl.classList.add('vo-hide');
  }

  async rareBuild(st) {
    const v = this.vial;
    const rc = RARITIES[st.rarity].hex;
    v.setGlowColor(rc);
    v.setGlow(1.0);
    v.shake(0.7);
    audio.play('magic', { pitch: 0.8 });
    fx.sparkle(v.mouth(), { count: 18, colors: [0xffffff, rc], speed: 3, radius: 0.6 });
    await this.beat(0.35);
  }

  async epicBuild(st) {
    const v = this.vial;
    const rc = RARITIES[st.rarity].hex;
    v.setGlowColor(rc);
    this.setLights(0.45);
    audio.play('flare', { pitch: 1.1 });
    for (let i = 0; i < 3; i++) {
      if (this.halt()) return;
      audio.play('drum');
      audio.play('heartbeat', { pitch: 1.2 });
      v.shake(0.45 + i * 0.25);
      v.setGlow(0.8 + i * 0.3);
      engine.shake(0.08 + i * 0.05);
      this.flareK = Math.max(this.flareK, 0.3 + i * 0.2);
      fx.sparkle(v.mouth(), { count: 10 + i * 6, colors: [0xffffff, rc], speed: 3 + i, radius: 0.7 });
      await this.beat(0.26);
    }
    this.setLights(1);
  }

  async legendaryBuild(st) {
    const v = this.vial;
    const rc = RARITIES[st.rarity].hex;
    // lights out...
    audio.play('lightsOut');
    this.setLights(0.06);
    this.ui.classList.add('vo-dark');
    v.setGlowColor(rc);
    v.setGlow(0.4);
    await this.beat(0.6);
    // ...slow heartbeat build with beams appearing
    const beats = [0.55, 0.45, 0.36, 0.28];
    this.rayMat.color.set(rc);
    this.raySpin = 0.15;
    for (let i = 0; i < beats.length; i++) {
      if (this.halt()) break;
      audio.play('heartbeat', { pitch: 0.9 + i * 0.06 });
      v.shake(0.4 + i * 0.3);
      v.setGlow(0.7 + i * 0.35);
      v.setRumble(0.2 + i * 0.25);
      engine.shake(0.06 + i * 0.06);
      this.rayTarget = 0.18 + i * 0.16;
      this.rays.visible = true;
      fx.rise(new THREE.Vector3(v.root.position.x, 0, v.root.position.z), { count: 10 + i * 6, colors: [rc, 0xffffff], radius: 0.6 });
      await this.beat(beats[i]);
    }
    if (this.dead) return;
    v.setRumble(0);
    audio.play('flare', { pitch: 1.3 });
    await this.beat(0.25);
    this.ui.classList.remove('vo-dark');
  }

  landFx(st, toy) {
    const rc = RARITIES[st.rarity].hex;
    const at = new THREE.Vector3(0, PED_TOP + 0.5, PED_Z);
    const v = this.vial;
    if (st.order === 0) {
      audio.play('reveal', { pitch: 1 });
      fx.sparkle(at, { count: 16, colors: [0xffffff, BLUE_L, rc], speed: 3, radius: 0.6 });
      this.rayMat.color.set(0x8fb8ff);
      this.rayTarget = 0.18;
      this.raySpin = 0.3;
    } else if (st.order === 1) {
      audio.play('reveal', { pitch: 0.9 });
      audio.jingle('unlock');
      fx.burst(at, { count: 28, layer: 'glow', colors: [0xffffff, rc, 0xffd23f], size: 0.06, speed: 4.5, grav: -3, life: 0.8, ground: 0 });
      pixelShock(this.scene, new THREE.Vector3(0, PED_TOP + 0.02, PED_Z), { radius: 2, color: rc });
      this.rayMat.color.set(rc);
      this.rayTarget = 0.4;
      this.raySpin = 0.4;
      engine.shake(0.15);
    } else if (st.order === 2) {
      audio.jingle('rare');
      audio.play('magic');
      fx.rise(new THREE.Vector3(0, PED_TOP, PED_Z), { count: 40, colors: [rc, 0xffffff, 0xe2c4ff], radius: 0.7 });
      pixelShock(this.scene, new THREE.Vector3(0, PED_TOP + 0.02, PED_Z), { radius: 2.6, color: rc });
      fx.confetti(new THREE.Vector3(0, 2.2, PED_Z - 0.2), { count: 40, ground: 0, colors: [rc, 0xffffff, 0xff2e88, 0xffd23f] });
      this.rayMat.color.set(rc);
      this.rayTarget = 0.75;
      this.raySpin = 0.5;
      this.flash(0.35);
      engine.shake(0.3);
    } else {
      this.setLights(1);
      audio.play('bigPop');
      audio.play('fanfare');
      this.flash(0.95, 0.6);
      engine.shake(0.55);
      engine.hitstop(0.08);
      pixelShock(this.scene, new THREE.Vector3(0, PED_TOP + 0.02, PED_Z), { radius: 3.4, color: rc });
      fx.confetti(new THREE.Vector3(-0.8, 2.6, PED_Z - 0.3), { count: 70, ground: 0 });
      fx.confetti(new THREE.Vector3(0.8, 2.6, PED_Z - 0.3), { count: 70, ground: 0 });
      fx.sparkle(at, { count: 50, colors: [0xffffff, rc, 0xffd23f], speed: 5, radius: 1 });
      if (st.order >= 4 || this.product === 'cashCase') fx.cash(at.clone().setY(2.2), 30, { ground: 0, speed: 3 });
      this.rayMat.color.set(rc);
      this.rayTarget = 1;
      this.raySpin = 1.4;
      setTimeout(() => (this.raySpin = 0.45), 900);
      const r = RARITIES[st.rarity];
      bigBanner(r.name.toUpperCase() + '!', st.def.name, { color: r.color, cls: 'vo-banner', dur: 1.6 });
      cheerLater(this);
    }
    v.setGlowColor(rc);
    v.setGlow(0.15);
    void toy;
  }

  async shinyReveal(st, toy) {
    const vd = VARIANTS[st.variant];
    if (!vd) return;
    await this.beat(0.45);
    if (this.halt()) return;
    const cols = SHINY_COLORS[st.variant] ?? [0xffffff];
    audio.play('shimmer');
    audio.play('shatter');
    engine.shake(0.15);
    const at = new THREE.Vector3(0, PED_TOP + toy.fit * toy.height * 0.5, PED_Z);
    fx.sparkle(at, { count: 60, colors: cols, speed: 3.2, radius: 0.9, life: 1.3 });
    fx.rise(new THREE.Vector3(0, PED_TOP, PED_Z), { count: 30, colors: cols, radius: 0.7 });
    toy.boing(0.5);
    this.panel?.classList.add('vo-shiny', 'sh-' + st.variant);
    const tag = h('div', { class: `vo-shiny-tag sh-${st.variant}` }, `${vd.name.toUpperCase()}!`);
    this.panel?.querySelector('.vo-tags')?.appendChild(tag);
    if (this.panel) sparkle(this.panel.querySelector('.vo-card-wrap') ?? this.panel, { count: 22, colors: cols.map(css), spread: 90 });
    await this.beat(0.6);
  }

  showCardPanel(st) {
    const d = st.def;
    const r = RARITIES[st.rarity];
    const card = cardEl(st.id, { variant: st.variant, priority: true, cls: 'vo-card', artSize: 192 });
    const countN = h('span', {}, '1');
    const count = h('div', { class: 'vo-count' }, 'x', countN);
    const series = st.spell ? 'Spell card' : SERIES[d.series]?.name ?? '';
    // copies progress (before -> after)
    const need = st.after.need;
    let prog;
    if (st.after.max) prog = bar(1, 'gold', 'MAX LEVEL', { cls: 'vo-prog' });
    else {
      const f0 = need ? Math.min(1, st.beforeCopies / need) : 0;
      prog = bar(f0, 'blue', `${st.beforeCopies}/${need}`, { cls: 'vo-prog' });
    }
    const info = h('div', { class: 'vo-info' },
      h('div', { class: 'vo-tags' }, h('div', { class: `vo-rar r-${st.rarity}` }, r.name.toUpperCase())),
      h('div', { class: 'vo-name' }, d.name),
      series ? h('div', { class: 'vo-series' }, series) : null,
      count,
      h('div', { class: 'vo-prog-wrap' }, prog, h('span', { class: 'vo-lvl' }, st.after.max ? '' : `Lvl ${st.after.level}`)));
    const wrap = h('div', { class: 'vo-card-wrap' }, card);
    const panel = h('div', { class: `vo-reveal r-${st.rarity}`, style: { '--rc': r.color } }, wrap, info);
    this.ui.appendChild(panel);
    this.panel = panel;
    // count roll-up
    const n = st.copies;
    if (n > 1) {
      let last = 1;
      animate(Math.min(0.7, 0.2 + n * 0.02), (e) => {
        const val = Math.max(1, Math.round(n * e));
        if (val !== last) { last = val; countN.textContent = String(val); audio.play('countTick', { gap: 0.025, pitch: 0.9 + e * 0.5 }); }
      }, { ease: 'outCubic', delay: 0.15 });
    }
    setTimeout(() => { if (panel.isConnected) bump(count, 'vo-slam'); }, n > 1 ? 160 + Math.min(700, 200 + n * 20) : 120);
    if (st.isNew) {
      setTimeout(() => {
        if (!panel.isConnected) return;
        wrap.appendChild(h('div', { class: 'vo-new' }, 'NEW!'));
        audio.play('stamp');
        sparkle(wrap, { count: 14, colors: ['#ff3a5a', '#ffd84a', '#fff'], spread: 70 });
      }, 260);
    }
    // bar fills to the new total
    if (!st.after.max && need) {
      setTimeout(() => {
        if (!panel.isConnected) return;
        prog.set(Math.min(1, st.after.copies / need));
        const lbl = prog.querySelector('.lbl');
        let c = st.beforeCopies;
        animate(0.45, (e) => {
          const val = Math.round(st.beforeCopies + (st.after.copies - st.beforeCopies) * e);
          if (val !== c) { c = val; lbl.textContent = `${val}/${need}`; }
        });
        if (st.canUpgrade) {
          setTimeout(() => {
            if (!panel.isConnected) return;
            prog.classList.remove('blue');
            prog.classList.add('ready');
            prog.appendChild(icon('up', 'up'));
            panel.classList.add('can-up');
            audio.play('upgrade');
            sparkle(prog, { count: 10, colors: ['#a8f07a', '#fff', '#4cd24a'], spread: 50 });
          }, 480);
        }
      }, 420);
    }
  }

  // ===================================================================== skip & summary
  skip() {
    if (this.skipped || this.summaryShown || this.dead) return;
    if (this.preview) { this.finish(); return; }
    this.skipped = true;
    this.hurry();
    if (this.tapResolve) { const r = this.tapResolve; this.tapResolve = null; r(); }
    for (const k of ['pourDone', 'shakeDone']) if (this[k]) { const r = this[k]; this[k] = null; r(); }
    this.shakeIn?.stop();
    this.tilt?.stop();
    this.mode = null;
    this.stream.visible = false;
    if (this.fillLine) this.fillLine.visible = false;
    this.shakeEl.classList.add('vo-hide');
    if (this.cut) { const t = this.cut.release(); if (t) this.scene.remove(t.root); }
    this.commit();
    this.setPrompt(null);
    this.setLights(1);
    this.ui.classList.remove('vo-dark');
    if (!this.vial.opened) {
      this.vial.open();
      this.vial.setGlowColor(this.rareColor);
      audio.play('bigPop');
      if (this.product === 'testTube') { this.vial.setFill(0.5, 1); this.vial.overflow(1); this.vial.dissolve(0.2); }
    }
    this.showSummary();
  }

  showSummary() {
    if (this.summaryShown || this.dead) return;
    this.summaryShown = true;
    this.phase = 'summary';
    this.dismissToy();
    this.dismissPanel();
    this.hideTapHint();
    this.setPrompt(null);
    this.titleEl.classList.add('vo-out');
    this.counterEl.classList.add('vo-hide');
    this.skipBtn.classList.add('vo-hide');
    this.rayTarget = 0.25;
    this.rayMat.color.set(this.rareColor);
    this.raySpin = 0.2;
    this.ped.visible = false;
    this.framing('summary');
    const v = this.vial;
    const p0 = v.root.position.clone(), s0 = v.root.scale.x, s1 = Math.min(1, this.vialRevealScale() * 1.25);
    animate(0.5, (e) => {
      v.root.position.lerpVectors(p0, new THREE.Vector3(0, 0, -0.4), e);
      v.root.scale.setScalar(s0 + (s1 - s0) * e);
    }, { ease: 'inOutCubic' });
    v.setGlowColor(this.rareColor);
    v.setGlow(0.6);
    // wallet catches up
    if (this.coinsShown !== this.coinsAfter) rollNumber(this.coinPill.val, this.coinsShown, this.coinsAfter, 0.6);
    if (this.bucksShown !== this.bucksAfter) rollNumber(this.bucksPill.val, this.bucksShown, this.bucksAfter, 0.6);
    this.coinsShown = this.coinsAfter;
    this.bucksShown = this.bucksAfter;

    const res = this.result;
    const cur = h('div', { class: 'vo-sum-cur' },
      res.coins ? h('div', { class: 'vo-sum-c coins' }, icon('coin'), h('b', {}, '+' + fmt(res.coins))) : null,
      res.bucks ? h('div', { class: 'vo-sum-c bucks' }, icon('bucks'), h('b', {}, '+' + fmt(res.bucks))) : null);
    const cells = this.stacks.slice().sort((a, b) => b.order - a.order || b.copies - a.copies).map((st, i) => {
      const c = h('div', { class: `vo-sum-cell r-${st.rarity}`, style: { animationDelay: (0.12 + i * 0.05).toFixed(2) + 's' } },
        cardEl(st.id, { size: 'mini', variant: st.variant, priority: i < 8 }),
        h('b', { class: 'vo-sum-x' }, 'x' + st.copies),
        st.isNew ? h('span', { class: 'vo-sum-new' }, 'NEW') : null,
        st.canUpgrade ? icon('up', 'vo-sum-up') : null);
      return c;
    });
    const grid = this.stacks.length ? h('div', { class: 'vo-sum-grid scroll-y' }, cells) : h('div', { class: 'vo-sum-empty' }, 'Coins for your Lab!');
    const ok = button('OK', () => this.finish(), 'green lg vo-sum-ok', { sound: 'click' });
    const box = h('div', { class: 'vo-sum-box panel sk-panel' },
      h('div', { class: 'vo-sum-head' }, ribbon(this.vialName().toUpperCase(), this.ribbonColor())),
      this.up ? h('div', { class: `vo-sum-upg t-${this.tier()}` }, icon('up'), this.up > 1 ? `SHAKE UPGRADED x${this.up}!` : 'SHAKE UPGRADED!') : null,
      h('div', { class: 'vo-sum-title' }, this.totalCards ? `${this.totalCards} CARDS FOUND` : 'VIAL OPENED!'),
      cur, grid, h('div', { class: 'vo-sum-foot' }, ok));
    const wrapEl = h('div', { class: 'vo-sum' }, box);
    this.ui.appendChild(wrapEl);
    audio.play('levelUp');
  }

  finish() {
    if (this.leaving) return;
    this.leaving = true;
    state.save();
    game.go(this.back, { from: 'vial', vial: this.type, ...this.backParams });
  }

  // ===================================================================== frame
  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this.framing(this.frameKind ?? 'vial', true);
    if (this.vial) this.placeJug();
    if (this.phase === 'reveal' && this.vial && this.vialHome) {
      this.vialHome = this.vialRevealPos();
      this.vial.root.position.copy(this.vialHome);
    }
  }

  update(dt, gdt) {
    this.t += dt;
    const t = this.t;
    this.vial?.update(gdt);
    if (this.mode === 'pour') this.updatePour(dt);
    if (this.vial && !this.vial.opened && this.phase === 'drop') {
      // the vial follows a shake-drag left / right
      const tx = this.mode === 'shake' ? (this.dragK ?? 0) * 0.32 : 0;
      const vr = this.vial.root;
      vr.position.x += (tx - vr.position.x) * (1 - Math.exp(-dt * 14));
      vr.rotation.z += (-tx * 0.6 - vr.rotation.z) * (1 - Math.exp(-dt * 12));
    }
    if (this.mode === 'shake') this.updateShakeHint(dt);
    const k = 1 - Math.exp(-dt * 4.5);
    if (this.cut) this.cut.update(dt, gdt);
    else this.updateCamera(dt, k);
    this.updateWorld(dt, gdt, k);
  }

  /** Waiting for shakes: a hop now and then + a demo hand swiping the vial left and right. */
  updateShakeHint(dt) {
    if (this.busy) return;
    this.idleT = (this.idleT ?? 0) + dt;
    if (this.idleT > 2.2) {
      const c = (this.t % 1.1) / 1.1;
      const s = Math.sin(c * Math.PI * 2);
      this.ghost.position.set(this.vial.root.position.x + s * 0.55, this.vial.height * 0.55, 0.35);
      if (!this.unpoint) this.unpoint = pointAt(this.ghost, '', {});
      this.jiggleT = (this.jiggleT ?? 1.5) - dt;
      if (this.jiggleT <= 0) {
        this.jiggleT = 2.2 + Math.random() * 1.2;
        this.vial.shake(0.22);
        this.vial.squash(-0.6);
        audio.play('rattle', { pitch: 1.4, vol: 0.5 });
      }
    }
  }

  updateCamera(dt, k) {
    const t = this.t;
    const v = this.view, vt = this.viewT;
    v.look.lerp(vt.look, k);
    v.hv += (vt.hv - v.hv) * k;
    v.ax += (vt.ax - v.ax) * k;
    v.ay += (vt.ay - v.ay) * k;
    v.pitch += (vt.pitch - v.pitch) * k;
    const cam = this.camera;
    const fov = THREE.MathUtils.degToRad(cam.fov);
    const dist = v.hv / (2 * Math.tan(fov / 2));
    const sway = Math.sin(t * 0.35) * 0.05;
    cam.position.set(v.look.x + Math.sin(sway) * dist, v.look.y + Math.sin(v.pitch) * dist, v.look.z + Math.cos(v.pitch) * dist);
    cam.lookAt(v.look);
    const W = engine.width, H = engine.height;
    cam.setViewOffset(W, H, (0.5 - v.ax) * W, (0.5 - v.ay) * H, W, H);
  }

  updateWorld(dt, gdt, k) {
    const t = this.t;
    // lights (dimming for drama, spotlight flare)
    this.lightK = damp(this.lightK, this.lightTarget, this.lightTarget < this.lightK ? 3.5 : 5, dt);
    this.flareK = Math.max(0, this.flareK - dt * 1.6);
    for (const [l, base, min] of this.lightBase) l.intensity = base * (min + (1 - min) * this.lightK);
    this.spot.intensity = 21 * this.lightK * (1 + this.flareK * 1.1);
    this.tankMat.emissiveIntensity = 0.5 * (0.15 + 0.85 * this.lightK);
    const sTarget = _v1;
    if (this.phase === 'reveal') sTarget.set(0, PED_TOP + 0.4, PED_Z);
    else if (this.phase === 'summary') sTarget.set(0, 0.6, 0);
    else if (this.vial) sTarget.set(this.vial.root.position.x, 0.6, this.vial.root.position.z);
    this.spot.target.position.lerp(sTarget, k);
    this.updateCone();
    this.coneMat.opacity = 0.06 * this.lightK * (1 + this.flareK * 0.8);
    // rays
    this.rayK = damp(this.rayK, this.rayTarget, 4, dt);
    this.rays.visible = this.rayK > 0.01;
    this.rayMat.opacity = this.rayK * 0.55;
    this.rays.rotation.z -= dt * this.raySpin;
    if (this.phase === 'summary') this.rays.position.lerp(_v1.set(0, 1.0, -0.6), k);
    // pedestal bounce + ring pulse
    if (this.pedBounce > 0) {
      this.pedBounce = Math.max(0, this.pedBounce - dt * 3);
      const b = Math.sin(this.pedBounce * Math.PI * 3) * this.pedBounce * 0.06;
      this.ped.scale.set(1 + b, 1 - b, 1 + b);
    }
    this.ringMat.opacity = 0.6 + Math.sin(t * 4) * 0.25;
    this.pedRing.rotation.y += dt * 0.5;
    if (this.fillLine?.visible) this.fillLine.children.forEach((m, i) => (m.position.x = (i ? 1 : -1) * (0.41 + Math.abs(Math.sin(t * 5)) * 0.05)));
    // toy idle: a wiggle every few seconds
    if (this.toy) {
      this.toy.update(gdt);
      this.toy.idleT -= dt;
      if (this.toy.idleT <= 0) {
        this.toy.idleT = 2.6 + Math.random() * 1.5;
        this.toy.attack(0.5);
      }
    }
    // the jug stream follows the spout
    if (this.stream.visible) {
      const sp = this.spout.getWorldPosition(_v2);
      const surf = this.vial.surfaceY();
      this.stream.position.copy(sp);
      this.stream.position.x += Math.sin(t * 30) * 0.008;
      this.stream.scale.set(1 + Math.sin(t * 40) * 0.15, Math.max(0.05, sp.y - surf), 1);
      if (Math.random() < dt * 14) fx.bubbles(new THREE.Vector3(rand(-0.12, 0.12), surf, rand(-0.1, 0.1)), { count: 1, color: 0xbfefff, radius: 0.05, size: 0.04, life: 0.5 });
    }
    // ambience: fizz inside the tube, dust in the light, bubbling flask + tank, rarity sparkles
    if (this.fizzT > 0 && this.vial && this.product === 'testTube' && !this.vial.opened) {
      this.fizzT -= dt;
      if (Math.random() < dt * 22) {
        const p = this.vial.body.localToWorld(new THREE.Vector3(rand(-0.2, 0.2), 0.4 + Math.random() * 0.8 * this.vial.fill, rand(-0.2, 0.2)));
        fx.bubbles(p, { count: 1, color: this.liq, radius: 0.05, size: 0.035, life: 0.6, speed: 0.6 });
      }
      if (Math.random() < dt * 4) audio.play('bubble', { pitch: 0.9 + Math.random() * 0.8, gap: 0.06 });
    }
    if (Math.random() < dt * 5) {
      const y = rand(0.4, 4.5);
      const sp = this.spot.position, tg = this.spot.target.position;
      const f = (sp.y - y) / (sp.y - tg.y);
      fx.sparkle(new THREE.Vector3(sp.x + (tg.x - sp.x) * f + rand(-0.4, 0.4) * f, y, sp.z + (tg.z - sp.z) * f + rand(-0.3, 0.3) * f), { count: 1, color: 0xfff2d0, size: 0.022, speed: 0.08, life: 2.4 });
    }
    if (Math.random() < dt * 2.2) fx.bubbles(this.flaskTop, { count: 2, color: 0x9dff6a, radius: 0.08, size: 0.05, speed: 0.6 });
    if (Math.random() < dt * 3) fx.bubbles(new THREE.Vector3(this.tankPos.x + rand(-0.35, 0.35), 0.4 + Math.random() * 1.6, this.tankPos.z + rand(-0.3, 0.3)), { count: 1, color: 0xa8ffc0, radius: 0.05, size: 0.06, speed: 0.8, life: 1.4 });
    if (this.tankSil) this.tankSil.position.y = 0.55 + Math.sin(t * 0.7) * 0.06;
    if (this.idleSparkle && this.vial && Math.random() < dt * (2 + Math.max(0, this.best) * 2.5)) {
      const vp = this.vial.root.position;
      const a = Math.random() * Math.PI * 2, r = Math.max(this.vial.width, this.vial.depth) * 0.6;
      fx.sparkle(new THREE.Vector3(vp.x + Math.cos(a) * r, rand(0.2, this.vial.height * 1.05), vp.z + Math.sin(a) * r * 0.6), { count: 1, color: this.best >= 1 ? this.rareColor : 0xffffff, size: 0.05, speed: 0.4, life: 0.9 });
    }
  }

  updateCone() {
    const a = this.spot.position, b = this.spot.target.position;
    const dir = _v1.subVectors(a, b);
    const len = dir.length();
    this.cone.position.copy(b).addScaledVector(dir, 0.5);
    this.cone.scale.set(Math.tan(this.spot.angle) * len * 0.75, len, Math.tan(this.spot.angle) * len * 0.75);
    this.cone.quaternion.setFromUnitVectors(UP, dir.normalize());
  }
}

function cheerLater(sc) {
  setTimeout(() => !sc.dead && audio.play('cheer'), 250);
}
