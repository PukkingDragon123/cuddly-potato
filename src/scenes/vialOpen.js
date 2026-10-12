// Vial opening (the game's chest opening), themed as a MrBeast Lab experiment.
//
// A dark lab bench under a spotlight. The vial drops in and glows in the
// colour of the best rarity inside. Test tubes: tap to pour water in (the bag
// dissolves, it fizzes), tap to shake (foam rises), the cap pops. Boxes and
// cases: tap to pop the latches, tap to swing the lid open. Then, Clash
// Royale style, every card stack flies out as its 3D toy onto a pedestal next
// to the pixel card (count, NEW!, level, copies bar filling) with rarity
// fanfares, and a summary of everything gained.
//
// game.go('vialopen', { type, slot?, source?: 'slot'|'free'|'crown'|'shop'|'reward', result?, back = 'home', backParams })
// The caller removes/claims the vial (takeVial / claimFreeVial / claimCrownVial);
// this scene rolls (when no `result` is given) and applies the rewards exactly
// once, the moment it starts, then saves.
import * as THREE from 'three';
import './vialOpen.css';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { animate } from '../core/tween.js';
import { damp, rand, pick, fmt } from '../core/util.js';
import { Mats, makeMesh } from '../core/voxel.js';
import { G, rbox, cyl, capsule, stamp, shade, n3, BOLT_SMALL } from '../models/kit.js';
import { makeVial, LAB_BADGE } from '../models/props/vials.js';
import { makeBeaker, makeMoneyBag, makeSodaRocket, makeFood } from '../models/props/abilities.js';
import { createSwarm } from '../models/swarmModels.js';
import { h, icon, button, pill, bar, ribbon, bigBanner, pointAt, rollNumber, bump, sparkle, $ui } from '../ui/ui.js';
import { cardEl } from '../ui/cards.js';
import { vialThumb } from '../ui/vialThumb.js';
import { VIALS, vialId } from '../data/vials.js';
import { cardDef, isSpell, RARITIES } from '../data/cards.js';
import { VARIANTS, SERIES } from '../data/swarms.js';
import { state, rollVial, applyVial, owned, upgradeInfo } from '../game/state.js';
import { game } from '../game/game.js';

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
  cyl(p, 'y', -0.5, -0.5, 4, 4, 12.6, 12.6, (x, y, z) => (Math.hypot(x + 0.5, z + 0.5) > 11.3 ? 0xc8d4ee : n3(x, y, z) < 0.05 ? 0xe2e8f6 : 0xf0f4fc));
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
      const m = new THREE.MeshStandardMaterial({ color: 0x9ff2ff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9 });
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), m);
      c.scale.set(0.8, 1.3, 0.8);
      c.position.y = 0.65;
      g.add(c);
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), m);
        s.position.set(Math.cos(i * 1.6) * 0.5, 0.25 + (i % 2) * 0.2, Math.sin(i * 1.6) * 0.4);
        s.scale.set(0.7, 1.3, 0.7);
        g.add(s);
      }
      break;
    }
    case 'labShield': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x29b6f6, roughness: 0.1, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      g.add(m);
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
    const spot = (this.spot = new THREE.SpotLight(0xfff0dc, 26, 18, 0.42, 0.55, 1));
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
    for (const [x, y] of [[-3.1, 1.7], [3.1, 1.7], [-3.1, 2.9], [3.1, 2.9]]) {
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
    const tankLiq = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 2.05, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2bd96a, emissive: 0x1fbf55, emissiveIntensity: 0.55, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
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
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.022, 6, 56), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = PED_TOP + 0.01;
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
    this.params = params;
    const type = vialId(params.type ?? params.vial ?? 'testTube');
    this.type = type;
    this.def = VIALS[type];
    this.product = this.def.product ?? 'testTube';
    this.back = params.back ?? 'home';
    this.backParams = params.backParams ?? {};
    this.source = params.source ?? null;

    // ---- rewards: roll + apply exactly once, right now, then save
    const res = params.result ?? rollVial(type);
    this.result = res;
    const raw = [...(res.cards ?? [])];
    for (const sp of res.spells ?? []) raw.push({ id: sp, copies: 1, variant: 'base' });
    const before = {};
    for (const c of raw) { const o = owned(c.id); before[c.id] = o ? { level: o.level, copies: o.copies } : null; }
    const applied = !!res._applied || (res.cards ?? []).some((c) => c.after);
    this.coinsAfter = state.p.coins + (applied ? 0 : res.coins ?? 0);
    this.bucksAfter = state.p.bucks + (applied ? 0 : res.bucks ?? 0);
    if (!applied) {
      applyVial(res);
      res._applied = true;
    }
    state.save();
    this.coinsShown = this.coinsAfter - (res.coins ?? 0);
    this.bucksShown = this.bucksAfter - (res.bucks ?? 0);
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
    this.totalCards = this.stacks.reduce((a, s) => a + s.copies, 0);
    this.best = this.stacks.reduce((a, s) => Math.max(a, s.order), -1);
    this.bestRarity = this.best >= 0 ? Object.values(RARITIES).find((r) => r.order === this.best).id : null;
    this.rareColor = this.best >= 0 ? RARITIES[this.bestRarity].hex : 0xffd23f;
    this.items = [];
    if (res.coins) this.items.push({ kind: 'coins', amount: res.coins });
    if (res.bucks) this.items.push({ kind: 'bucks', amount: res.bucks });
    for (const s of this.stacks) this.items.push({ kind: 'card', st: s });

    // ---- vial
    this.vial = makeVial(type, { glowColor: this.def.liquid });
    this.vial.root.position.set(0, 6, 0);
    this.scene.add(this.vial.root);
    this.hint = new THREE.Object3D();
    this.hint.position.set(0, Math.min(1.1, this.vial.height * 0.55), 0.2);
    this.vial.body.add(this.hint);
    this.jug.visible = this.product === 'testTube';
    this.framing('vial', true);

    this.buildUI();
    this.onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.onTap(); }
      if (e.key === 'Escape') { if (this.summaryShown) this.finish(); else this.skip(); }
    };
    window.addEventListener('keydown', this.onKey);
    audio.music && audio.trackName == null && audio.music('lab');
    this.flow = this.run().catch((e) => {
      console.error('vial open flow failed', e);
      if (!this.dead) this.showSummary();
    });
    if (typeof window !== 'undefined') window.__vialOpen = this;
  }

  exit() {
    this.dead = true;
    window.removeEventListener('keydown', this.onKey);
    if (this.unpoint) { this.unpoint(); this.unpoint = null; }
    this.hurry();
    if (this.tapResolve) { const r = this.tapResolve; this.tapResolve = null; r(); }
    this.vial?.dispose();
    if (window.__vialOpen === this) window.__vialOpen = null;
  }

  // ===================================================================== UI
  buildUI() {
    const d = this.def;
    const root = (this.ui = h('div', { class: `vo-root p-${this.product}` }));
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .btn, .vo-sum-box')) return;
      audio.unlock();
      this.onTap();
    });
    this.coinPill = pill('coin', fmt(this.coinsShown));
    this.bucksPill = pill('bucks', fmt(this.bucksShown));
    this.skipBtn = button('SKIP', () => this.skip(), 'gray sm vo-skip vo-hide', { icon: 'arrowR', sound: 'tap' });
    const top = h('div', { class: 'vo-top' }, h('div', { class: 'vo-pills' }, this.coinPill, this.bucksPill), this.skipBtn);
    const srcTag = { free: 'FREE!', crown: 'CROWN REWARD', shop: 'FROM THE SHOP', reward: 'REWARD!' }[this.source];
    this.titleEl = h('div', { class: 'vo-title' },
      ribbon(d.name.toUpperCase(), RIBBON[d.rarity] ?? 'blue'),
      h('div', { class: 'vo-title-sub row center' },
        srcTag ? h('span', { class: 'vo-src' }, srcTag) : null,
        this.totalCards ? h('span', { class: 'row', style: { gap: '0.25em' } }, icon('cards'), `x${this.totalCards}`) : null,
        h('span', { class: 'row', style: { gap: '0.25em' } }, icon('coin'), fmt(this.result.coins ?? 0)),
        this.result.bucks ? h('span', { class: 'row', style: { gap: '0.25em' } }, icon('bucks'), fmt(this.result.bucks)) : null));
    this.promptEl = h('div', { class: 'vo-prompt vo-hide' });
    this.pipsEl = h('div', { class: 'vo-pips vo-hide' });
    this.tapEl = h('div', { class: 'vo-tap vo-hide' }, 'TAP TO CONTINUE');
    this.counterNum = h('b', {}, String(this.totalCards));
    this.counterEl = h('div', { class: 'vo-counter vo-hide' }, h('img', { class: 'vo-counter-img', src: vialThumb(this.type, 96), draggable: 'false' }), h('div', { class: 'vo-counter-n' }, this.counterNum, h('span', {}, 'cards left')));
    this.flashEl = h('div', { class: 'vo-flash' });
    root.append(top, this.titleEl, this.promptEl, this.pipsEl, this.tapEl, this.counterEl, this.flashEl);
    $ui().appendChild(root);
  }

  setPrompt(text, step = -1, steps = 0) {
    if (!text) {
      this.promptEl.classList.add('vo-hide');
      this.pipsEl.classList.add('vo-hide');
      if (this.unpoint) { this.unpoint(); this.unpoint = null; }
      return;
    }
    this.promptEl.textContent = text;
    this.promptEl.classList.remove('vo-hide');
    bump(this.promptEl, 'vo-pop');
    if (steps > 1) {
      this.pipsEl.replaceChildren(...Array.from({ length: steps }, (_, i) => h('i', { class: i < step ? 'on' : i === step ? 'cur' : '' })));
      this.pipsEl.classList.remove('vo-hide');
    } else this.pipsEl.classList.add('vo-hide');
    if (!this.unpoint && !this.hinted) this.unpoint = pointAt(this.hint, '', {});
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
      v.hv = Math.max(vh * (portrait ? 2.65 : 2.15), (vw * (portrait ? 1.8 : 2.8)) / asp, 3.2);
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
    if (this.product === 'testTube') await this.tubeInteract();
    else await this.boxInteract();
    if (this.halt()) return;
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
    fx.shockwave(new THREE.Vector3(0, 0.01, 0), { radius: 1.6, color: 0xb8c6e8, dur: 0.4 });
    await animate(0.3, (e, k) => (v.root.position.y = Math.sin(k * Math.PI) * 0.16)).promise;
    if (this.dead) return;
    v.root.position.y = 0;
    v.squash(0.5);
    audio.play('thud', { pitch: 1.6 });
    // the glow hints at what's inside
    v.setGlowColor(this.best >= 1 ? this.rareColor : this.def.liquid);
    v.setGlow(0.22 + Math.max(0, this.best) * 0.06);
    this.idleSparkle = true;
    await this.beat(0.2);
  }

  /** One escalating tap on the vial (shake / latch). */
  shakeHit(i, n) {
    const v = this.vial;
    const k = (i + 1) / n;
    const best = Math.max(0, this.best);
    v.shake(0.75 + i * 0.4);
    engine.shake(0.12 + i * 0.07 + best * 0.025);
    this.flareK = Math.max(this.flareK, 0.25 + i * 0.2 + best * 0.08);
    const c = new THREE.Color(this.def.liquid).lerp(new THREE.Color(this.rareColor), Math.min(1, k * 1.4));
    v.setGlowColor(c.getHex());
    v.setGlow(0.3 + k * 0.55 + best * 0.05);
    const m = v.mouth();
    fx.sparkle(m.clone().setY(v.height * 0.6), { count: 6 + i * 6 + best * 4, colors: [0xffffff, this.rareColor], speed: 2.5 + i, radius: 1.2 });
    if (this.product === 'testTube') {
      audio.play('rattle', { pitch: 0.9 + i * 0.15 });
      audio.play('slosh', { pitch: 0.8 + i * 0.25 });
      const f0 = v.foamK;
      animate(0.45, (e) => v.setFoam(f0 + (k * 0.9 - f0) * e), { ease: 'outBack' });
      fx.bubbles(new THREE.Vector3(0, 1.25, 0), { count: 6 + i * 4, color: this.def.liquid, radius: 0.18, size: 0.05, speed: 0.8 });
      this.fizzT = Math.max(this.fizzT, 1.2);
      for (let b = 0; b < 3; b++) setTimeout(() => !this.dead && audio.play('bubble', { pitch: 0.9 + Math.random() * 0.6 }), b * 70);
    } else {
      audio.play('latch', { pitch: 1 - i * 0.08 });
      audio.play('rattle', { pitch: 0.7 });
      v.unlatch(i);
      const l = v.latches[i];
      if (l) {
        const p = l.getWorldPosition(new THREE.Vector3());
        p.y += 0.25;
        fx.sparkle(p, { count: 10, colors: [0xffffff, this.rareColor, 0xffd23f], speed: 3, radius: 0.4 });
        fx.burst(p, { count: 5, colors: [0xd2d9e8, 0x7a849c], size: 0.04, speed: 2.5, life: 0.6 });
      }
    }
  }

  async tubeInteract() {
    const v = this.vial;
    this.setPrompt('TAP TO ADD WATER!');
    await this.waitTap(0.15);
    if (this.halt()) return;
    this.setPrompt(null);
    this.hinted = true;
    await this.pourWater();
    if (this.halt()) return;
    // the fizz tablet kicks in: the bag dissolves, the water changes colour
    audio.play('fizz');
    v.dissolve(1.0);
    animate(1.1, (e) => v.setFill(v.fill, e));
    v.setGlow(0.35 + Math.max(0, this.best) * 0.05);
    this.fizzT = 2.2;
    animate(0.9, (e) => v.setFoam(e * 0.25), { ease: 'outCubic' });
    await this.beat(0.7);
    const N = 3;
    for (let i = 0; i < N; i++) {
      if (this.halt()) return;
      this.setPrompt(i === 0 ? 'TAP TO SHAKE IT!' : i === N - 1 ? 'TAP TO POP IT!' : 'SHAKE IT MORE!', i, N);
      await this.waitTap(0.12);
      if (this.halt()) return;
      this.setPrompt(null);
      if (i < N - 1) this.shakeHit(i, N);
    }
  }

  async pourWater() {
    const v = this.vial;
    const jug = this.jug;
    const rest = this.jugRest.clone();
    const pourPos = new THREE.Vector3(0.76, 2.24, 0.05);
    const TILT = 1.2;
    // unscrew the cap and hold it aside while the jug swings over
    audio.play('squeak', { pitch: 0.8 });
    v.capAside(1, 0.5);
    audio.play('whoosh', { pitch: 1.2 });
    const r0 = jug.rotation.y;
    await animate(0.42, (e) => {
      jug.position.lerpVectors(rest, pourPos, e);
      jug.position.y += Math.sin(e * Math.PI) * 0.3;
      jug.rotation.y = r0 * (1 - e);
      jug.rotation.z = e * 0.5;
    }, { ease: 'outCubic' }).promise;
    if (this.dead) return;
    await animate(0.2, (e) => (jug.rotation.z = 0.5 + e * (TILT - 0.5)), { ease: 'inOutQuad' }).promise;
    if (this.dead) return;
    this.stream.visible = true;
    audio.play('pour');
    await animate(1.05, (e) => {
      v.setFill(e * 0.64, 0);
      this.jugWater.scale.y = Math.max(0.05, 1 - e * 0.85);
      this.jugWater.position.y = 0.08 + 0.18 * this.jugWater.scale.y;
    }).promise;
    if (this.dead) return;
    this.stream.visible = false;
    fx.bubbles(new THREE.Vector3(0, 0.9, 0), { count: 10, color: 0xbfefff, radius: 0.18, size: 0.05 });
    // jug goes home, cap screws back on
    animate(0.42, (e) => {
      jug.rotation.z = TILT * (1 - e);
      jug.position.lerpVectors(pourPos, rest, e);
      jug.rotation.y = r0 * e;
    }, { ease: 'inOutCubic' });
    await v.capAside(0, 0.45);
    if (this.dead) return;
    audio.play('latch', { pitch: 1.3 });
    v.shake(0.25);
  }

  async boxInteract() {
    const v = this.vial;
    const N = v.latchCount + 1;
    for (let i = 0; i < N; i++) {
      if (this.halt()) return;
      const txt = i === N - 1 ? 'TAP TO OPEN!' : i === 0 ? (this.product === 'cashCase' ? 'TAP TO UNLOCK!' : 'TAP TO UNLATCH!') : 'TAP AGAIN!';
      this.setPrompt(txt, i, N);
      await this.waitTap(0.12);
      if (this.halt()) return;
      this.setPrompt(null);
      this.hinted = true;
      if (i < N - 1) this.shakeHit(i, N);
    }
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
    fx.shockwave(new THREE.Vector3(0, 0.02, 0), { radius: 2.6, color: rc });
    this.beamBurst(rc, 1.2);
    if (this.product === 'testTube') {
      fx.foam(m, { count: 70, colors: [0xffffff, 0xf2fbff, this.def.liquid, this.def.liquid], speed: 2.2, power: 0.9, ground: 0 });
      fx.bubbles(m, { count: 18, color: this.def.liquid, radius: 0.35, speed: 1.6 });
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
    if (this.product === 'testTube') fx.foam(from, { count: 14, colors: [0xffffff, this.def.liquid], speed: 1.4, power: 0.6, ground: 0 });
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

  makeToy(st) {
    let toy;
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
      fx.shockwave(new THREE.Vector3(0, PED_TOP + 0.02, PED_Z), { radius: 2, color: rc });
      this.rayMat.color.set(rc);
      this.rayTarget = 0.4;
      this.raySpin = 0.4;
      engine.shake(0.15);
    } else if (st.order === 2) {
      audio.jingle('rare');
      audio.play('magic');
      fx.rise(new THREE.Vector3(0, PED_TOP, PED_Z), { count: 40, colors: [rc, 0xffffff, 0xe2c4ff], radius: 0.7 });
      fx.shockwave(new THREE.Vector3(0, PED_TOP + 0.02, PED_Z), { radius: 2.6, color: rc });
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
      fx.shockwave(new THREE.Vector3(0, PED_TOP + 0.02, PED_Z), { radius: 3.4, color: rc });
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
    this.skipped = true;
    this.hurry();
    if (this.tapResolve) { const r = this.tapResolve; this.tapResolve = null; r(); }
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
      h('div', { class: 'vo-sum-head' }, ribbon(this.def.name.toUpperCase(), RIBBON[this.def.rarity] ?? 'blue')),
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
    if (this.phase === 'reveal' && this.vial && this.vialHome) {
      this.vialHome = this.vialRevealPos();
      this.vial.root.position.copy(this.vialHome);
    }
  }

  update(dt, gdt) {
    this.t += dt;
    const t = this.t;
    this.vial?.update(gdt);
    // camera: damped look/height/anchor, framed through a view offset
    const v = this.view, vt = this.viewT;
    const k = 1 - Math.exp(-dt * 4.5);
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
    // lights (dimming for drama, spotlight flare)
    this.lightK = damp(this.lightK, this.lightTarget, this.lightTarget < this.lightK ? 3.5 : 5, dt);
    this.flareK = Math.max(0, this.flareK - dt * 1.6);
    for (const [l, base, min] of this.lightBase) l.intensity = base * (min + (1 - min) * this.lightK);
    this.spot.intensity = 26 * this.lightK * (1 + this.flareK * 1.4);
    const sTarget = this.phase === 'reveal' ? new THREE.Vector3(0, PED_TOP + 0.4, PED_Z) : this.phase === 'summary' ? new THREE.Vector3(0, 0.6, 0) : this.vial ? new THREE.Vector3(this.vial.root.position.x, 0.6, this.vial.root.position.z) : new THREE.Vector3();
    this.spot.target.position.lerp(sTarget, k);
    this.updateCone();
    this.coneMat.opacity = 0.06 * this.lightK * (1 + this.flareK * 0.8);
    // rays
    this.rayK = damp(this.rayK, this.rayTarget, 4, dt);
    this.rays.visible = this.rayK > 0.01;
    this.rayMat.opacity = this.rayK * 0.55;
    this.rays.rotation.z -= dt * this.raySpin;
    if (this.phase === 'summary') this.rays.position.lerp(new THREE.Vector3(0, 1.0, -0.6), k);
    // pedestal bounce + ring pulse
    if (this.pedBounce > 0) {
      this.pedBounce = Math.max(0, this.pedBounce - dt * 3);
      const b = Math.sin(this.pedBounce * Math.PI * 3) * this.pedBounce * 0.06;
      this.ped.scale.set(1 + b, 1 - b, 1 + b);
    }
    this.ringMat.opacity = 0.6 + Math.sin(t * 4) * 0.25;
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
      const sp = this.spout.getWorldPosition(new THREE.Vector3());
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
        fx.bubbles(p, { count: 1, color: this.def.liquid, radius: 0.05, size: 0.035, life: 0.6, speed: 0.6 });
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
    const dir = new THREE.Vector3().subVectors(a, b);
    const len = dir.length();
    this.cone.position.copy(b).addScaledVector(dir, 0.5);
    this.cone.scale.set(Math.tan(this.spot.angle) * len * 0.75, len, Math.tan(this.spot.angle) * len * 0.75);
    this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }
}

function cheerLater(sc) {
  setTimeout(() => !sc.dead && audio.play('cheer'), 250);
}
