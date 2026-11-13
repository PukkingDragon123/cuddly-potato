// The battle's top TUG-OF-WAR bar: a hand-drawn pixel-art tube (steel frame,
// rivets, your blue and the rival's red base HP meeting at a white-hot zig-zag
// crack, energy stripes streaming toward the seam, a cream damage trail) with
// the two Commanders as live 3D chibis standing in it, leaning into each other
// right at the seam and sliding with it. They strain in a loop, lunge forward /
// stumble back when the balance shifts, and the winner of a big swing throws a
// cheer. Sweat drops, effort puffs, impact sparks, dust and cheer stars are 2D
// pixel sprites drawn over the render.
// Cost: the tube is a ~100 x 16 ImageData redrawn at 30 fps; both chibis share
// one small 3D render (a corner of the engine's thumbnail renderer, ~24 fps)
// blitted into a 2D canvas a few hundred device pixels across.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { Chibi, CHIBI_HEIGHT, definePoses } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { h } from '../../ui/ui.js';

const { sin, abs, max, min, PI } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Poses (chibi.js conventions: torsoRX > 0 leans forward, armX < 0 raises an arm forward)

// shoulder in, arms locked on the rival, back leg driving: a trembling strain loop
function pushPose(t, p) {
  const s = sin(t * 5.2), tr = sin(t * 41) * 0.6 + sin(t * 57) * 0.4;
  p.torsoRX = 0.4 + s * 0.05; p.torsoRZ = tr * 0.025;
  p.headRX = -0.3 - s * 0.03; p.headRZ = tr * 0.03;
  p.armLX = -1.3 + s * 0.06 + tr * 0.03; p.armRX = -1.36 + s * 0.06 - tr * 0.03;
  p.armLZ = -0.16; p.armRZ = 0.16; p.elbowL = p.elbowR = -0.4;
  p.hl = p.hr = 'open';
  p.legLX = -0.5; p.kneeL = 0.7; p.legRX = 0.62 + s * 0.04; p.kneeR = 0.12;
  p.y = -0.07 + s * 0.012; p.sy = 0.97 + s * 0.02; p.sx = 1.02 - s * 0.012;
}
definePoses({
  tugPush: pushPose,
  // a shove: dip, explode forward, settle back into the push
  tugLunge(t, p, k, d) {
    const e = sin(clamp(t / (d || 0.5), 0, 1) * PI);
    pushPose(t, p);
    p.torsoRX = 0.4 + e * 0.32; p.headRX = -0.3 - e * 0.12;
    p.armLX = p.armRX = -1.33 - e * 0.25; p.elbowL = p.elbowR = -0.4 + e * 0.35;
    p.hl = p.hr = 'fist';
    p.legRX = 0.62 + e * 0.35; p.kneeL = 0.7 + e * 0.25; p.legLX = -0.5 - e * 0.25;
    p.y = -0.07 + e * 0.05; p.sx = 1.02 + e * 0.05; p.sy = 0.97 - e * 0.03;
  },
  // shoved back: lean back, arms windmill, front foot kicks up
  tugStumble(t, p, k, d) {
    const e = sin(clamp(t / (d || 0.6), 0, 1) * PI), w = sin(t * 24);
    pushPose(t, p);
    const m = (a, b) => a + (b - a) * e;
    p.torsoRX = m(0.4, -0.28); p.headRX = m(-0.3, 0.18); p.headRZ = w * 0.08 * e;
    p.armLX = m(-1.3, -2.3 + w * 0.5); p.armRX = m(-1.36, -1.9 - w * 0.5);
    p.armLZ = m(-0.16, -0.7); p.armRZ = m(0.16, 0.7); p.elbowL = p.elbowR = m(-0.4, -0.2);
    p.legLX = m(-0.5, -0.9); p.kneeL = m(0.7, 0.2); p.legRX = m(0.62, 0.15); p.kneeR = m(0.12, 0.6);
    p.y = -0.07 + e * 0.06;
  },
});

// ---------------------------------------------------------------------------
// Pixel sprites (one char per art pixel; '.' transparent)
const PAL = {
  k: '#0a0820', w: '#ffffff', b: '#9fe6ff', B: '#3aa8ff', d: '#1c5fd0',
  y: '#ffe45c', Y: '#ffb21a', o: '#f07a10', g: '#d8d2e6', G: '#8e86a8', s: '#f4f1ff',
};
const SPR = {
  sweat: ['..k..', '.kbk.', 'kbwbk', 'kbbBk', 'kBBdk', '.kkk.'],
  puff0: ['.s.', 'sss', '.s.'],
  puff1: ['.ss.', 'sssg', 'sggg', '.gg.'],
  puff2: ['..s.s.', '.ssss.', 'ssgsgs', '.gg.gg', '..g...'],
  star: ['...k...', '..kyk..', '..kyk..', 'kkywykk', '.kyYyk.', '..kYk..', '.kY.Yk.', '.k...k.'],
  spark: ['..w..', '..y..', 'wywyw', '..y..', '..w..'],
  sparkS: ['.w.', 'wyw', '.w.'],
  dust: ['.gg.', 'gGGg', '.G..'],
  dustS: ['gG', 'G.'],
};
const sprites = {};
function sprite(name, tint) {
  const key = tint ? name + tint : name;
  if (sprites[key]) return sprites[key];
  const rows = SPR[name];
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.') return;
    x.fillStyle = tint && ch !== 'k' && ch !== 'w' ? tint : PAL[ch];
    x.fillRect(i, j, 1, 1);
  }));
  return (sprites[key] = c);
}

// tube palettes (rows top -> bottom inside the frame) per team
const TEAM = [
  { hi: [200, 240, 255], a: [79, 180, 255], b: [43, 140, 242], c: [20, 96, 192], floor: [10, 52, 128], glow: '#4fb4ff', conf: '#6fd0ff' },
  { hi: [255, 216, 220], a: [255, 122, 138], b: [255, 61, 85], c: [176, 28, 52], floor: [110, 14, 32], glow: '#ff5a70', conf: '#ff8a9a' },
];
const INK = [10, 8, 32], STEEL_HI = [214, 222, 244], STEEL = [132, 142, 184], STEEL_LO = [58, 62, 104];

const OUT8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const _v = new THREE.Vector3();
const _sz = new THREE.Vector2();

export class TugBar {
  /** cfg: the battle config (cfg.sides[i].commander). */
  constructor(cfg) {
    this.art = h('canvas', { class: 'tw-art' });
    this.push = h('canvas', { class: 'tw-push' });
    this.el = h('div', { class: 'tw-track' }, this.art, this.push);
    this.actx = this.art.getContext('2d');
    this.pctx = this.push.getContext('2d');
    this.split = 0.5;
    this.target = 0.5;
    this.ghost = 0.5;
    this.ref = 0.5;
    this.t = 0;
    this.artT = 0;
    this.frameT = 0;
    this.measureT = 0;
    this.flash = [0, 0];
    this.parts = [];
    this.lungeCd = 0;
    this.cheerCd = 0;
    this.shift = 0; // pair shove offset (world units, + = toward the rival)
    this.shiftV = 0;
    this.visible = true;
    this.lean = 0;
    try { this.build3D(cfg); } catch (e) { console.warn('tug chibis failed', e); this.ch = null; }
  }

  build3D(cfg) {
    const mk = (i) => {
      const cmd = cfg.sides[i]?.commander ?? { char: i ? 'recruit' : 'recruit' };
      const def = { ...(CHARACTERS[cmd.char ?? cmd.id] ?? CHARACTERS.recruit), ...(cmd.override ?? {}) };
      const ch = new Chibi(def, { scale: 1 });
      ch.root.rotation.y = (i ? -1 : 1) * (PI / 2 - 0.8); // 3/4: facing the rival, face to camera
      ch.play('tugPush');
      ch.mood('determined');
      ch.animT = i * 0.37; // out of phase
      return { ch, side: i, ox: 0, oxV: 0, sweatT: 0.4 + i * 0.5, puffT: 0.8 + i * 0.3 };
    };
    this.ch = [mk(0), mk(1)];
    const sc = (this.scene = new THREE.Scene());
    sc.add(new THREE.HemisphereLight(0xeaf4ff, 0x40305a, 1.7));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
    key.position.set(1, 5, 6);
    const rimB = new THREE.DirectionalLight(0x4fb4ff, 2.2);
    rimB.position.set(-6, 2, -2);
    const rimR = new THREE.DirectionalLight(0xff4a64, 2.2);
    rimR.position.set(6, 2, -2);
    sc.add(key, rimB, rimR, this.ch[0].ch.root, this.ch[1].ch.root);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
    this.cam.position.set(0, 0.9, 12);
    this.cam.lookAt(0, 0.9, 0);
    this.envSwap = [];
  }

  /** A hit on side i's base: that half of the tube flashes. */
  hit(i, big) {
    this.flash[i] = big ? 0.22 : 0.12;
  }

  measure() {
    const r = this.el.getBoundingClientRect();
    if (!r.width) return false;
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
    const dpr = min(2, window.devicePixelRatio || 1);
    const key = `${r.width | 0}x${r.height | 0}@${px}|${dpr}`;
    if (key === this.mkey) return true;
    this.mkey = key;
    this.px = px;
    this.dpr = dpr;
    // the tube: one canvas pixel per art pixel, scaled up crisp
    this.cols = max(24, Math.round(r.width / px));
    this.rows = max(10, Math.round(r.height / px));
    this.art.width = this.cols;
    this.art.height = this.rows;
    this.img = this.actx.createImageData(this.cols, this.rows);
    // the pushers: tube height x 1.5 tall (room above for sweat / stars), 2.6 wide
    this.th = this.rows * px;
    const cw = Math.round(this.th * 2.6), chh = Math.round(this.th * 1.55);
    this.cw = cw;
    this.chh = chh;
    this.push.style.width = cw + 'px';
    this.push.style.height = chh + 'px';
    this.push.width = Math.round(cw * dpr);
    this.push.height = Math.round(chh * dpr);
    // ortho frame: the floor (inner bottom row of the tube) at y = 0, a standing chibi spans the inner tube
    const inner = (this.rows - 4) * px; // css px between the steel rails
    const wpp = (CHIBI_HEIGHT * 1.02) / inner; // world units per css px
    this.wpp = wpp;
    const floorUp = 2 * px; // floor sits 2 art px above the tube's bottom edge
    this.cam.left = (-cw / 2) * wpp;
    this.cam.right = (cw / 2) * wpp;
    this.cam.bottom = -floorUp * wpp;
    this.cam.top = (chh - floorUp) * wpp;
    this.cam.position.set(0, 0, 12);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateProjectionMatrix();
    this.frameT = 0;
    return true;
  }

  /** target: your share of the combined base HP (0..1); o: { over, visible } */
  update(dt, target, o = {}) {
    this.t += dt;
    this.target = target;
    this.split += (target - this.split) * min(1, dt * 10);
    this.ghost += (this.split - this.ghost) * min(1, dt * 2.2);
    this.visible = o.visible !== false;
    this.measureT -= dt;
    if (this.measureT <= 0 || !this.img) { this.measureT = 0.5; if (!this.measure()) return; }
    if (!this.visible) return;
    this.flash[0] = max(0, this.flash[0] - dt);
    this.flash[1] = max(0, this.flash[1] - dt);
    const calm = reduced();
    this.act(dt, o.over, calm);
    this.place();
    this.artT -= dt;
    if (this.artT <= 0) { this.artT = 1 / 30; this.drawTube(); }
    this.stepParts(dt);
    this.frameT -= dt;
    if (this.frameT <= 0 && this.push.isConnected) { this.frameT = 1 / 24; this.drawPushers(); }
  }

  // ------------------------------------------------------------------ acting
  act(dt, over, calm) {
    if (!this.ch) return;
    const [a, b] = this.ch;
    this.lungeCd -= dt;
    this.cheerCd -= dt;
    // the balance vs a slow reference: a quick move = a shove, a big one = a surge + cheer
    const d = this.target - this.ref;
    this.ref += d * min(1, dt * 1.1);
    if (over) {
      if (!this.overDone) {
        this.overDone = true;
        const win = this.target >= 0.5 ? a : b, lose = win === a ? b : a;
        win.ch.play('cheer'); win.ch.mood('excited');
        lose.ch.play('sad'); lose.ch.mood('ko');
        this.burst(win, 10);
      }
    } else if (!calm) {
      if (abs(d) > 0.06 && this.cheerCd <= 0) {
        const win = d > 0 ? a : b, lose = d > 0 ? b : a;
        this.cheerCd = 2.6;
        this.lungeCd = 1.5;
        this.ref = this.target;
        this.shove(win, lose, 1.6);
        setTimeout(() => {
          if (!this.ch || this.overDone) return;
          win.ch.play('cheer', { restart: true, dur: 1.0, then: 'tugPush' }); win.ch.mood('excited', 1.1); win.ch.boing(0.4);
          lose.ch.mood('dizzy', 1.3);
          this.burst(win, 7);
        }, 280);
      } else if (abs(d) > 0.018 && this.lungeCd <= 0) {
        const win = d > 0 ? a : b, lose = d > 0 ? b : a;
        this.lungeCd = 0.75;
        this.ref += d * 0.6;
        this.shove(win, lose, 1);
      }
    }
    // who's ahead sets the faces (and how much the loser sweats)
    const lead = this.target - 0.5;
    const lean = over ? 9 : lead > 0.05 ? 1 : lead < -0.05 ? -1 : 0;
    if (lean !== this.lean && !over) {
      this.lean = lean;
      a.ch.mood(lean > 0 ? 'proud' : lean < 0 ? 'nervous' : 'determined');
      b.ch.mood(lean < 0 ? 'proud' : lean > 0 ? 'nervous' : 'determined');
    }
    // springs: the pair shove and each chibi's own step
    const h2 = min(dt, 0.05);
    this.shiftV += (-this.shift * 90 - this.shiftV * 11) * h2;
    this.shift += this.shiftV * h2;
    for (const c of this.ch) {
      c.oxV += (-c.ox * 120 - c.oxV * 12) * h2;
      c.ox += c.oxV * h2;
      const n = min(3, Math.ceil(dt / (1 / 40)));
      for (let i = 0; i < n; i++) c.ch.update(dt / n);
      // sweat + effort puffs
      if (!calm && !over) {
        const losing = (c.side === 0 ? -lead : lead) > 0.05;
        c.sweatT -= dt * (losing ? 2.2 : 1);
        c.puffT -= dt;
        if (c.sweatT <= 0) { c.sweatT = 0.7 + Math.random() * 0.8; this.emit(c, 'sweat'); }
        if (c.puffT <= 0) { c.puffT = 1.1 + Math.random() * 1.2; this.emit(c, 'puff'); }
      }
    }
  }

  shove(win, lose, k) {
    const dir = win.side === 0 ? 1 : -1;
    win.ch.play('tugLunge', { restart: true, dur: 0.5, then: 'tugPush', face: false });
    lose.ch.play('tugStumble', { restart: true, dur: 0.6 * k, then: 'tugPush', face: false });
    win.ch.mood('rage', 0.6);
    lose.ch.mood(k > 1 ? 'shock' : 'hurt', 0.7);
    win.ch.boing(-0.2);
    win.oxV += dir * 2.2 * k;
    lose.oxV += dir * 3.4 * k;
    this.shiftV += dir * 1.6 * k;
    // impact at the contact + dust off the back foot
    const cp = this.contact();
    if (cp) {
      this.add({ spr: 'spark', x: cp.x, y: cp.y, vx: 0, vy: 0, life: 0.18, g: 0 });
      for (let i = 0; i < 4 + k * 2; i++) {
        const a = Math.random() * PI * 2, s = 30 + Math.random() * 40;
        this.add({ spr: 'sparkS', x: cp.x, y: cp.y, vx: Math.cos(a) * s, vy: sin(a) * s - 10, life: 0.25 + Math.random() * 0.2, g: 60 });
      }
    }
    const f = this.anchor(win, -0.55, 0.02);
    if (f) for (let i = 0; i < 3 * k; i++) this.add({ spr: i ? 'dustS' : 'dust', x: f.x, y: f.y, vx: -dir * (20 + Math.random() * 30), vy: -6 - Math.random() * 10, life: 0.4 + Math.random() * 0.2, g: 20 });
  }

  burst(c, n) {
    const p = this.anchor(c, 0, 1.75);
    if (!p) return;
    for (let i = 0; i < n; i++) {
      const a = -PI / 2 + (i / (n - 1 || 1) - 0.5) * 2.4;
      const s = 40 + Math.random() * 30;
      this.add({ spr: i % 2 ? 'star' : 'sparkS', x: p.x, y: p.y, vx: Math.cos(a) * s, vy: sin(a) * s, life: 0.7 + Math.random() * 0.3, g: 70 });
    }
    // team confetti: 2x1 chips that flip as they fall
    for (let i = 0; i < n; i++) this.add({ conf: TEAM[c.side].conf, x: p.x + (Math.random() - 0.5) * 20, y: p.y, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 30, life: 0.9 + Math.random() * 0.4, g: 90 });
  }

  emit(c, kind) {
    const back = c.side === 0 ? -1 : 1;
    if (kind === 'sweat') {
      const p = this.anchor(c, 0.12, 1.55);
      if (p) this.add({ spr: 'sweat', x: p.x, y: p.y, vx: back * (18 + Math.random() * 16), vy: -28 - Math.random() * 12, life: 0.75, g: 120 });
    } else {
      const p = this.anchor(c, -0.35, 1.7);
      if (p) this.add({ puff: 0, x: p.x, y: p.y, vx: back * 8, vy: -14, life: 0.6, g: -4 });
    }
  }

  add(p) {
    if (this.parts.length > 48) this.parts.shift();
    p.t = 0;
    this.parts.push(p);
  }

  stepParts(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { ps.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** Canvas (css px) position of a point on a chibi: fwd along its facing, up from the floor (world units). */
  anchor(c, fwd, up) {
    if (!this.wpp) return null;
    const dir = c.side === 0 ? 1 : -1;
    _v.set(c.ch.root.position.x + dir * fwd * 0.6, up, 0);
    return { x: this.cw / 2 + _v.x / this.wpp, y: this.chh - 2 * this.px - _v.y / this.wpp };
  }
  contact() {
    if (!this.ch) return null;
    const a = this.anchor(this.ch[0], 0, 1.05), b = this.anchor(this.ch[1], 0, 1.05);
    return a && b ? { x: (a.x + b.x) / 2, y: a.y } : null;
  }

  /** Slide the pair to the seam (clamped so both stay in the tube) and space them. */
  place() {
    if (!this.cw) return;
    const W = this.cols * this.px;
    const seam = this.split * W;
    const half = this.cw * 0.36;
    const x = clamp(seam, half, W - half);
    this.push.style.transform = `translate(${(x - this.cw / 2).toFixed(1)}px, 0)`;
    this.pairOff = x;
    if (!this.ch) return;
    const gap = 0.9;
    const [a, b] = this.ch;
    a.ch.root.position.x = -gap + this.shift * 0.12 + min(0, a.ox) * 0.12 + max(0, a.ox) * 0.06;
    b.ch.root.position.x = gap + this.shift * 0.12 + max(0, b.ox) * 0.12 + min(0, b.ox) * 0.06;
  }

  // ------------------------------------------------------------------ the tube (pixel art)
  drawTube() {
    const W = this.cols, H = this.rows, d = this.img.data;
    const sx = Math.round(this.split * W), gx = Math.round(this.ghost * W);
    const g0 = min(sx, gx), g1 = max(sx, gx);
    const t = this.t;
    const set = (x, y, c, k = 1) => {
      const i = (y * W + x) * 4;
      d[i] = c[0] * k; d[i + 1] = c[1] * k; d[i + 2] = c[2] * k; d[i + 3] = 255;
    };
    const mix = (c, m, k) => [c[0] + (m[0] - c[0]) * k, c[1] + (m[1] - c[1]) * k, c[2] + (m[2] - c[2]) * k];
    const WH = [255, 255, 255];
    const lead = this.split - 0.5;
    // stripe scroll: each half streams toward the seam, the leading half faster
    const off0 = Math.floor(t * (8 + max(0, lead) * 60)), off1 = Math.floor(t * (8 + max(0, -lead) * 60));
    const inner0 = 2, inner1 = H - 3; // rows inside the steel rails
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // frame: ink outline, lit top rail, shaded bottom rail, rivets
        if (y === 0 || y === H - 1 || x === 0 || x === W - 1) { set(x, y, INK); continue; }
        if (y === 1) { set(x, y, (x % 12 === 6) ? STEEL_LO : (x % 12 === 7) ? WH : STEEL_HI); continue; }
        if (y === H - 2) { set(x, y, (x % 12 === 6) ? INK : STEEL_LO); continue; }
        if (x === 1) { set(x, y, STEEL); continue; }
        if (x === W - 2) { set(x, y, STEEL_LO); continue; }
        const side = x < sx ? 0 : 1;
        const T = TEAM[side];
        const r = (y - inner0) / max(1, inner1 - inner0); // 0 top .. 1 bottom
        let c = y === inner0 ? T.hi : y === inner1 ? T.floor : r < 0.42 ? T.a : r < 0.74 ? T.b : T.c;
        if (x >= g0 && x < g1 && x !== sx) c = (Math.floor(t * 12) % 2) ? [255, 246, 220] : [255, 232, 170];
        else if (y > inner0 && y < inner1) {
          // energy chevrons ">>>" toward the seam
          const u = side === 0 ? x + abs(y - (inner0 + inner1) / 2) - off0 : -x + abs(y - (inner0 + inner1) / 2) - off1;
          if (((u % 7) + 7) % 7 < 2) c = mix(c, WH, 0.28);
        }
        if (this.flash[side] > 0) c = mix(c, WH, min(1, this.flash[side] * 5) * 0.75);
        set(x, y, c);
      }
    }
    // centre notch (the even line)
    const cx = W >> 1;
    set(cx, 0, [255, 216, 74]); set(cx, 1, [255, 216, 74]); set(cx, H - 2, [255, 216, 74]); set(cx, H - 1, [255, 216, 74]);
    // the seam: a flickering zig-zag crack, white core with gold edges
    for (let y = 1; y < H - 1; y++) {
      const j = ((y + Math.floor(t * 18)) % 4 < 2) ? 0 : 1;
      const x = clamp(sx - 1 + j, 2, W - 3);
      set(x, y, WH);
      if (x + 1 < W - 2) set(x + 1, y, [255, 228, 92]);
      if (x - 1 > 1 && y % 2) set(x - 1, y, [255, 178, 26]);
    }
    this.actx.putImageData(this.img, 0, 0);
  }

  // ------------------------------------------------------------------ the pushers (3D + pixel fx)
  drawPushers() {
    const c = this.pctx, Wd = this.push.width, Hd = this.push.height;
    c.clearRect(0, 0, Wd, Hd);
    if (this.ch) this.render3D(c, Wd, Hd);
    // pixel fx, one art pixel = --px css px
    const P = Math.max(1, Math.round(this.px * this.dpr * 0.75));
    const s = this.dpr;
    c.imageSmoothingEnabled = false;
    for (const p of this.parts) {
      const k = p.t / p.life;
      const x = Math.round(p.x * s / P) * P, y = Math.round(p.y * s / P) * P;
      if (p.conf) {
        c.fillStyle = p.conf;
        const flip = Math.floor(p.t * 14) % 2;
        c.fillRect(x, y, flip ? P * 2 : P, flip ? P : P * 2);
        continue;
      }
      const name = p.puff !== undefined ? (k < 0.3 ? 'puff0' : k < 0.65 ? 'puff1' : 'puff2') : p.spr;
      const im = sprite(name);
      c.globalAlpha = k > 0.75 ? 1 - (k - 0.75) * 4 : 1;
      c.drawImage(im, x - ((im.width * P) >> 1), y - ((im.height * P) >> 1), im.width * P, im.height * P);
      c.globalAlpha = 1;
    }
  }

  render3D(c2, Wd, Hd) {
    const r = engine.thumbRenderer ?? (engine.renderThumb(new THREE.Group(), { size: 4 }), engine.thumbRenderer);
    if (!r) return;
    if (r.getPixelRatio() !== 1) r.setPixelRatio(1);
    const sz = r.getSize(_sz);
    if (sz.x < Wd || sz.y < Hd) { r.setSize(max(Wd, sz.x), max(Hd, sz.y), false); r.getSize(sz); }
    r.setViewport(0, 0, Wd, Hd);
    r.setClearColor(0x000000, 0);
    const sw = this.envSwap;
    sw.length = 0;
    for (const { ch } of this.ch) ch.root.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) if (m.envMap && m.envMap === engine.envMap) { m.envMap = engine.thumbEnv; sw.push(m); }
    });
    const g = engine.grade;
    engine.setGrade(null);
    const sil = (this.sil ??= document.createElement('canvas'));
    if (sil.width !== Wd || sil.height !== Hd) { sil.width = Wd; sil.height = Hd; }
    const sc = sil.getContext('2d');
    const o = Math.max(1, Math.round(this.dpr * 1.1));
    const src = r.domElement, sy = sz.y - Hd;
    try {
      // one chibi at a time (the rival behind, yours in front), each with its own team-colour +
      // ink pixel outline, so two look-alike Commanders still read as two people
      for (const i of [1, 0]) {
        this.ch[0].ch.root.visible = i === 0;
        this.ch[1].ch.root.visible = i === 1;
        r.render(this.scene, this.cam);
        sc.globalCompositeOperation = 'copy';
        sc.drawImage(src, 0, sy, Wd, Hd, 0, 0, Wd, Hd);
        sc.globalCompositeOperation = 'source-in';
        sc.fillStyle = TEAM[i].glow;
        sc.fillRect(0, 0, Wd, Hd);
        for (const [dx, dy] of OUT8) c2.drawImage(sil, dx * o * 2, dy * o * 2);
        sc.fillStyle = PAL.k;
        sc.fillRect(0, 0, Wd, Hd);
        for (const [dx, dy] of OUT8) c2.drawImage(sil, dx * o, dy * o);
        c2.drawImage(src, 0, sy, Wd, Hd, 0, 0, Wd, Hd);
      }
    } finally {
      this.ch[0].ch.root.visible = this.ch[1].ch.root.visible = true;
      for (const m of sw) m.envMap = engine.envMap;
      engine.setGrade(g);
      r.setViewport(0, 0, sz.x, sz.y);
    }
  }

  dispose() {
    if (this.ch) for (const { ch } of this.ch) this.scene.remove(ch.root);
    this.ch = null;
    this.el.remove();
  }
}
