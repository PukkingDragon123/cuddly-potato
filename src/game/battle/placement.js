// Card placement previews (Clash Royale style, adapted to the side-view lane).
//
// While a troop card is selected or dragged:
//   * the legal deploy zone glows on the ground as lab-floor grid tiles, closed off by pixel
//     hazard tape at its front line (sim.deployRange: your half, or up to your frontmost Swarm);
//   * everything past the line is veiled in a dithered dark red with a scrolling hazard-tape fence
//     and chevrons pointing back into the zone (screen-space pixel art, crisp at any zoom);
//   * a dithered hologram GHOST of the real troop model(s) shows exactly where they land, in the
//     card's formation (multi-count cards show every unit; an ECHO shows the second wave too);
//   * a card dropped before you can afford it waits on the field (ghost + a POWER meter) and
//     deploys the moment you have enough POWER.
// Spells keep the view's pixel reticle (view.setAim). Owned by battle.js; the HUD root hosts the DOM layer.
import * as THREE from 'three';
import './placement.css';
import { h, iconURL } from '../../ui/ui.js';
import { engine } from '../../core/engine.js';
import { createSwarm } from '../../models/swarmModels.js';
import { SWARMS } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { FIELD } from './field.js';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)] / 16;
const INK = '#120c24';
const _v = new THREE.Vector3();

function paint(w, hh, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  const ctx = c.getContext('2d');
  const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  draw(px, ctx);
  return c;
}
function tex(w, hh, draw) {
  const t = new THREE.CanvasTexture(paint(w, hh, draw));
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const url = (w, hh, draw) => `url(${paint(w, hh, draw).toDataURL()})`;

// --- ground textures (one tile = one world unit) ----------------------------------------------
/** Lab floor tile: grid seams, a bevel, corner rivets and a sparse ordered dither fill (tinted). */
const floorTex = () => tex(16, 16, (px) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (x <= 1 || y <= 1) px(x, y, 'rgba(255,255,255,1)');
    else if (x === 2 || y === 2) px(x, y, 'rgba(255,255,255,0.55)');
    else if (x === 15 || y === 15) px(x, y, 'rgba(0,10,40,0.4)');
    else if (bayer(x, y) < 0.25) px(x, y, 'rgba(255,255,255,0.6)');
    else px(x, y, 'rgba(255,255,255,0.24)');
  }
  for (const [x, y] of [[2, 2], [3, 2], [2, 3]]) px(x, y, '#ffffff');
});
/** Out of bounds: dense red dither with a pixel cross per tile. */
const noTex = () => tex(16, 16, (px) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (bayer(x, y) < 0.5) px(x, y, (x + y) & 1 ? 'rgba(255,40,74,0.85)' : 'rgba(150,10,40,0.85)');
  }
  for (let k = 5; k <= 10; k++) { px(k, k, '#ffd0d8'); px(15 - k, k, '#ffd0d8'); }
});
/** Hazard tape across the lane at the front line (x across the band, y along the lane depth). */
const tapeTex = () => tex(16, 16, (px) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (x < 2 || x > 13) { px(x, y, INK); continue; }
    const on = ((x + y) >> 2) & 1;
    px(x, y, on ? '#ffd23a' : '#241a3c');
    if (on && x === 2) px(x, y, '#fff3b0');
  }
});
// --- screen-space pixel art (CSS backgrounds) --------------------------------------------------
let cssArt = null;
function cssVars() {
  if (cssArt) return cssArt;
  cssArt = {
    // veil: two-tone red ordered dither
    '--pl-dith': url(4, 4, (px) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const b = bayer(x, y);
        if (b < 0.25) px(x, y, 'rgba(255,36,80,0.42)');
        else if (b < 0.5) px(x, y, 'rgba(90,0,30,0.38)');
      }
    }),
    // vertical hazard tape (scrolls down)
    '--pl-tape': url(6, 8, (px) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) {
        const on = ((x + y) >> 2) & 1;
        px(x, y, on ? '#ffd23a' : '#241a3c');
        if (on && x === 0) px(x, y, '#fff3b0');
      }
    }),
    // a chevron pointing back into the zone (towards your base)
    '--pl-chev': url(7, 9, (px) => {
      const rows = ['...##..', '..#oo#.', '.#oo#..', '#oo#...', '.#oo#..', '..#oo#.', '...##..', '.......', '.......'];
      rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') px(x, y, 'rgba(18,12,36,0.85)'); else if (ch === 'o') px(x, y, '#ff8a9e'); }));
    }),
    // drop pin over the ghost: a stepped down-arrow with an ink outline and a highlight
    '--pl-pin': url(11, 11, (px) => {
      const rows = ['...#####...', '...#owo#...', '...#owo#...', '...#owo#...', '####owo####', '#oooowoooo#', '.#ooowooo#.', '..#oowoo#..', '...#owo#...', '....#o#....', '.....#.....'];
      rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') px(x, y, INK); else if (ch === 'o') px(x, y, '#5cd0ff'); else if (ch === 'w') px(x, y, '#e6f8ff'); }));
    }),
    // pixel arrow for the edge-pan hint
    '--pl-arrow': url(8, 11, (px) => {
      const rows = ['##......', '#o#.....', '#oo#....', '#ooo#...', '#oooo#..', '#ooooo#.', '#oooo#..', '#ooo#...', '#oo#....', '#o#.....', '##......'];
      rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') px(x, y, INK); else if (ch === 'o') px(x, y, x < 2 ? '#ffffff' : '#9fe6ff'); }));
    }),
  };
  return cssArt;
}

/** Hologram look for the ghost troops: their own colours, team-tinted and see-through, with pixel
 *  scanlines rolling up. A depth-only twin of the model renders first so only the front surface is
 *  blended (no muddy overlapping parts). */
function ghostMaterial(uni) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xc4ecff, emissive: 0x10345c, transparent: true, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uT: uni.uT, uTint: uni.uTint, uMix: uni.uMix, uAlpha: uni.uAlpha, uPx: uni.uPx });
    sh.fragmentShader = 'uniform float uT;\nuniform vec3 uTint;\nuniform float uMix;\nuniform float uAlpha;\nuniform float uPx;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float plRow = mod(floor(gl_FragCoord.y / uPx) + floor(uT * 10.0), 4.0);
      float plHi = step(3.0, plRow);
      float plLo = step(plRow, 0.5);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uTint, uMix) + uTint * 0.22 * plHi;
      gl_FragColor.a = uAlpha * (1.0 - 0.45 * plLo);`);
  };
  m.customProgramCacheKey = () => 'placementGhost';
  return m;
}
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });

// floor bands: the lane, then two steps of apron towards the camera (z0 far .. z1 near)
const BANDS = [[-FIELD.LANE_HALF, FIELD.LANE_HALF], [FIELD.LANE_HALF, 4.6], [4.6, 7.4]];
/** Stretch a floor band over x0..x1 with its texture locked to world units (tiles per unit: kx, kz). */
function lay(m, x0, x1, y, kx, kz, op) {
  const { z0, z1 } = m.userData;
  const len = Math.max(0.001, x1 - x0), dep = z1 - z0;
  m.scale.set(len, 1, dep);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  const t = m.material.map;
  t.repeat.set(len * kx, dep * kz);
  t.offset.set(x0 * kx, -z1 * kz);
  m.material.opacity = m.userData.op * op;
}

export class Placement {
  constructor(view, hud, si = 0) {
    this.view = view;
    this.sim = view.sim;
    this.hud = hud;
    this.si = si;
    this.t = 0;
    this.zoneOn = false;
    this.cur = null; // the ghost formation being shown
    this.sets = new Map();
    this.uni = { uT: { value: 0 }, uTint: { value: new THREE.Color(0x7fd2ff) }, uMix: { value: 0.3 }, uAlpha: { value: 0.7 }, uPx: { value: 2 } };
    this.ghostMat = ghostMaterial(this.uni);
    // ground decals (lie on the lane, drawn over the arena floor)
    const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const decal = (map, color, opacity, off) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off, fog: false, toneMapped: false });
    // the side-view camera sees the lane itself as a thin strip, so the floor treatment carries on over
    // the foreground ground towards the camera, fading out in hard steps (no smooth gradients)
    this.plane = PLANE;
    const ft = floorTex(), nt = noTex(), tt = tapeTex();
    const bands = (map, color, ops, off) => BANDS.map(([z0, z1], i) => {
      const t = map.clone();
      t.needsUpdate = true;
      const m = new THREE.Mesh(PLANE, decal(t, color, ops[i], off));
      m.userData = { z0, z1, op: ops[i] };
      m.renderOrder = 2;
      return m;
    });
    this.floor = bands(ft, 0x5cd0ff, [0.95, 0.72, 0.42], -2);
    this.no = bands(nt, 0xffffff, [0.5, 0.36, 0.2], -2);
    this.tape = bands(tt, 0xffffff, [1, 0.9, 0.6], -4);
    this.root = new THREE.Group();
    this.root.add(...this.floor, ...this.no, ...this.tape);
    this.root.visible = false;
    view.scene.add(this.root);
    this.ghostRoot = new THREE.Group();
    view.scene.add(this.ghostRoot);
    // screen layer (inside the HUD, under its panels)
    this.chev = h('i', { class: 'pl-chev' });
    this.veil = h('div', { class: 'pl-veil' }, this.chev);
    this.fence = h('div', { class: 'pl-fence' });
    this.waitFill = h('i');
    this.waitNum = h('b', {}, '');
    this.wait = h('div', { class: 'pl-wait' }, h('img', { src: iconURL('power'), alt: '' }), h('span', { class: 'pl-wbar' }, this.waitFill), this.waitNum);
    this.pin = h('i', { class: 'pl-pin' });
    this.edgeL = h('i', { class: 'pl-edge l' });
    this.edgeR = h('i', { class: 'pl-edge r' });
    this.layer = h('div', { class: 'pl-layer' }, this.veil, this.fence, this.pin, this.wait, this.edgeL, this.edgeR);
    for (const [k, v] of Object.entries(cssVars())) this.layer.style.setProperty(k, v);
    hud.root.prepend(this.layer);
  }

  /** Show / hide the deploy zone (troop cards only). */
  zone(on) {
    this.zoneOn = !!on;
    this.root.visible = this.zoneOn;
    this.layer.classList.toggle('on', this.zoneOn);
    if (!on) this.fence.classList.remove('hot');
  }

  /** The legal range right now (it follows your front line). */
  range() {
    return this.sim.deployRange(this.si);
  }

  /** Ghost of `card` (a hand card) landing at x; null hides it. opts: { pending, clamped } */
  ghost(card, x, opts = {}) {
    if (!card || card.spell || x === null || x === undefined) {
      this.ghostRoot.visible = false;
      this.cur = null;
      this.wait.classList.remove('on');
      this.pin.classList.remove('on');
      return;
    }
    const s = this.sim.sides[this.si];
    const def = SWARMS[card.unit];
    const n = def?.count ?? 1;
    const echo = s.echo > 0;
    const key = `${card.unit}|${card.variant ?? 'base'}|${card.skin ?? ''}|${card.model ?? ''}`;
    let set = this.sets.get(key);
    if (!set) {
      set = { key, units: [] };
      this.sets.set(key, set);
    }
    const total = n * (echo ? 2 : 1);
    while (set.units.length < total) {
      const rig = createSwarm(card.unit, { variant: card.variant, skin: card.skin, scale: def?.size ?? 1, model: card.model });
      const twin = createSwarm(card.unit, { variant: card.variant, skin: card.skin, scale: def?.size ?? 1, model: card.model });
      for (const m of rig.meshes) { m.material = this.ghostMat; m.castShadow = m.receiveShadow = false; m.renderOrder = 21; }
      for (const m of twin.meshes) { m.material = depthOnly; m.castShadow = m.receiveShadow = false; m.renderOrder = 20; }
      const g = new THREE.Group();
      for (const r of [rig, twin]) {
        r.root.rotation.y = this.si === 0 ? Math.PI / 2 - 0.45 : -Math.PI / 2 + 0.45;
        g.add(r.root);
      }
      set.units.push({ g, rig, twin });
    }
    if (this.cur !== set) {
      for (const ch of [...this.ghostRoot.children]) this.ghostRoot.remove(ch);
      for (const u of set.units) this.ghostRoot.add(u.g);
      this.cur = set;
    }
    this.ghostRoot.visible = true;
    const dir = s.dir;
    const giant = s.nextGiant?.scale ?? 1;
    const flying = !!def?.traits?.flying;
    set.units.forEach((u, i) => {
      const on = i < total;
      u.g.visible = on;
      if (!on) return;
      const k = i % n, wave = i >= n ? 1 : 0;
      // the sim's formation: x - dir * k * 0.42, z spread 0.55 (an ECHO lands 0.6 behind)
      const ux = x - dir * (k * 0.42 + wave * 0.6), uz = (k - (n - 1) / 2) * 0.55 + wave * 0.25;
      for (const r of [u.rig, u.twin]) {
        r.root.position.set(0, flying ? 0.9 : 0, 0);
        r.root.scale.setScalar(giant);
      }
      u.g.position.set(ux, 0, Math.max(-FIELD.LANE_Z, Math.min(FIELD.LANE_Z, uz)));
    });
    this.x = x;
    this.pending = opts.pending ? opts : null;
    this.fence.classList.toggle('hot', !!opts.clamped);
    this.wait.classList.toggle('on', !!opts.pending);
    this.pin.classList.toggle('on', !opts.pending);
    this.top = Math.max(...set.units.slice(0, total).map((u) => u.rig.height ?? 1)) * giant + (flying ? 0.9 : 0);
  }

  hide() {
    this.zone(false);
    this.ghost(null);
  }

  /** Per-frame: track the camera, animate. edge: current edge-pan direction (-1, 0, 1). */
  update(dt, edge = 0) {
    this.t += dt;
    const u = this.uni;
    u.uT.value = this.t;
    u.uPx.value = Math.max(1, Math.round((engine.pixelRatio ?? 1) * 2));
    const pend = this.pending;
    // a waiting card's ghost turns amber and blinks
    u.uMix.value = pend ? 0.5 : 0.24;
    u.uAlpha.value = pend ? (Math.sin(this.t * 7) > 0.3 ? 0.72 : 0.42) : 0.7;
    u.uTint.value.setHex(pend ? 0xffb020 : 0x7fd2ff);
    this.edgeL.classList.toggle('on', edge < 0);
    this.edgeR.classList.toggle('on', edge > 0);
    const deckTop = this.hud.deckTop();
    this.layer.style.setProperty('--pl-h', Math.max(0, deckTop) + 'px');
    if (this.zoneOn) {
      const [a, b] = this.range();
      const s = this.sim.sides[this.si];
      // the line is drawn a body-width past the furthest drop point, so a snapped ghost stands inside it
      const front = (s.dir > 0 ? b : a) + s.dir * 0.4;
      const back = s.dir > 0 ? a : b;
      const far = s.dir * (FIELD.VIEW_X + 3);
      const pulse = 0.85 + Math.sin(this.t * 4) * 0.15;
      for (const m of this.floor) lay(m, Math.min(front, back), Math.max(front, back), 0.03, 1, 1, pulse);
      for (const m of this.no) lay(m, Math.min(front, far), Math.max(front, far), 0.028, 1, 1, 1);
      for (const m of this.tape) {
        lay(m, front - 0.17, front + 0.17, 0.034, 1 / 0.34, 1 / 0.34, 1);
        // the tape's ink edges sit on the band edges; the stripes crawl along the line
        m.material.map.offset.x = 0;
        m.material.map.offset.y -= this.t * 1.2;
      }
      // the screen veil starts where the line meets the middle of the lane
      const p = engine.toScreen(_v.set(front, 0, 0), this.view.camera);
      const sx = Math.round(p.x);
      this.layer.style.setProperty('--pl-x', sx + 'px');
      this.layer.classList.toggle('flip', s.dir < 0);
    }
    if (this.ghostRoot.visible) {
      // a pixel drop pin over the formation (the lane is too flat on screen for ground markers)
      const p = engine.toScreen(_v.set(this.x - this.sim.sides[this.si].dir * 0.2, (this.top ?? 1) + 0.35, 0), this.view.camera);
      const tx = `translate(${Math.round(p.x)}px, ${Math.round(Math.min(p.y, deckTop - 24))}px)`;
      if (pend) this.wait.style.transform = tx;
      else this.pin.style.transform = tx;
    }
    if (pend && this.ghostRoot.visible) {
      const e = this.sim.sides[this.si].energy;
      this.waitFill.style.width = Math.min(100, (e / Math.max(0.01, pend.cost)) * 100).toFixed(1) + '%';
      const txt = String(pend.cost);
      if (this.waitNum.textContent !== txt) this.waitNum.textContent = txt;
    }
  }

  dispose() {
    this.view.scene.remove(this.root, this.ghostRoot);
    this.layer.remove();
  }
}

/** Spell cards aim anywhere (radius preview from the view's reticle). */
export const isAimed = (card) => !!card && card.spell && !card.special && !!SPELLS[card.unit];
