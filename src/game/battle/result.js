// Battle end cinematics.
//
// finalBlow(parent, { win, view }): the slow-mo base collapse beat (letterbox,
//   vignette, speed lines, camera push, BASE DESTROYED slam) layered over the
//   3D collapse that view.labDestroyed plays.
//
// showResult(parent, opts): resolves with the id of the button pressed.
//   1. VERDICT: VICTORY! / DEFEAT / DRAW slams over gold rays (or rain) while
//      the winning Commander celebrates in live 3D (the loser sulks behind).
//   2. BREAKING NEWS sting.
//   3. BEAST NEWS: anchor Nora Newsly (3D chibi) at the news desk presents the
//      battle report: headline, base HP left, battle time, troops deployed,
//      damage, Swarms defeated, spells + specials, Commander ults, the MVP
//      card, trophies and rewards with animated counters, a scrolling ticker,
//      then the buttons. Tap to fast-forward any phase.
//
// opts: { result: 'win'|'loss'|'draw', bases: [{ frac, alive, tier }] x2 (mine, theirs), names: [mine, theirs],
//         rewards (battleRewards result | null), mode, buttons: [{ id, label, color, icon }], vialThumb?,
//         summary? (else read from the battle scene: scene.battleSummary()) }
import './result.css';
import * as THREE from 'three';
import { h, icon, animIcon, button, rollNumber, sparkle, burst, confetti, bump } from '../../ui/ui.js';
import { popWords } from '../../ui/dialogue.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { animate } from '../../core/tween.js';
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { VIALS } from '../../data/vials.js';
import { BASE_UPGRADES } from '../../data/labs.js';
import { debrisSprites, copyOf } from '../../scenes/labLoadArt.js';
import { cardDef } from '../../data/cards.js';
import { cardArtImg } from '../../ui/thumbs.js';
import { Stage3D } from '../../ui/stage3d.js';
import { VoxGrid, makeMesh } from '../../core/voxel.js';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const fmtBig = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e5 ? Math.round(n / 1e3) + 'K' : fmtN(n));
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function sfx(fn) {
  if (!audio.ctx || audio.muted) return;
  try { fn(audio); } catch (e) { /* optional */ }
}
const SND = {
  // "da-da-da DUM" news sting
  news: () => sfx((a) => {
    const n = [392, 392, 523.3, 784];
    n.forEach((f, i) => {
      const d = i * 0.11 + (i === 3 ? 0.08 : 0);
      a.tone({ type: 'sawtooth', f0: f, dur: i === 3 ? 0.7 : 0.1, vol: 0.05, lp: 2600, hold: i === 3 ? 0.25 : 0.02, delay: d });
      a.tone({ type: 'square', f0: f / 2, dur: i === 3 ? 0.6 : 0.09, vol: 0.03, lp: 1400, delay: d });
    });
    a.thump(140, 45, 0.3, 0.35, 0.41);
    a.noise({ dur: 0.5, vol: 0.06, type: 'highpass', f0: 5000, attack: 0.002, delay: 0.41 });
  }),
  swoosh: () => sfx((a) => a.noise({ dur: 0.35, vol: 0.18, type: 'bandpass', f0: 300, f1: 3400, q: 1.1, attack: 0.12 })),
  slowmo: () => sfx((a) => {
    a.tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 1.1, vol: 0.05, lp: 900 });
    a.noise({ dur: 1.1, vol: 0.07, type: 'lowpass', f0: 1200, f1: 200, attack: 0.05 });
  }),
  tickRoll: (p = 1) => audio.play('countTick', { pitch: p, gap: 0.04 }),
};
// recorded versions (src/core/audio.js) win; the procedural voices above are the fallback
for (const [k, id] of Object.entries({ news: 'news', swoosh: 'whoosh', slowmo: 'slowmo' })) { const f = SND[k]; SND[k] = (...a) => (audio.ctx && !audio.muted && audio.play(id)) || f(...a); }

/** A pausable sequence clock: wait(ms) resolves early once skip() is called. */
function clock() {
  let skipping = false;
  const pending = new Set();
  return {
    get skipping() { return skipping; },
    wait(ms) {
      if (skipping) return Promise.resolve();
      return new Promise((r) => {
        const e = { r, id: setTimeout(() => { pending.delete(e); r(); }, ms) };
        pending.add(e);
      });
    },
    skip() {
      skipping = true;
      for (const e of pending) { clearTimeout(e.id); e.r(); }
      pending.clear();
    },
  };
}

/** A little pixel-art "recording" light (7x7 sprite with a highlight, no CSS circles). */
let _dot = null;
function recDot(cls = '') {
  if (!_dot) {
    const rows = ['..kkk..', '.krrrk.', 'krwrrrk', 'krrrrdk', 'krrrrdk', '.krddk.', '..kkk..'];
    const pal = { k: '#3a0610', r: '#ff3a52', w: '#ffd0d8', d: '#c8102e' };
    const c = document.createElement('canvas');
    c.width = c.height = 7;
    const g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
    _dot = c.toDataURL();
  }
  return h('img', { class: 'recdot ' + cls, src: _dot, alt: '', draggable: 'false' });
}

function chibiFor(cmd) {
  if (!cmd) return null;
  const base = CHARACTERS[cmd.char ?? cmd.id];
  if (!base) return null;
  try { return new Chibi({ ...base, ...(cmd.override ?? {}) }, { fidget: false }); } catch (e) { return null; }
}


// ---------------------------------------------------------------------------
// BEAST NEWS desk: a voxel anchor desk (glossy top with a chrome lip, panelled
// front with a red LED strip, a pixel-art logo screen, a monitor, a mug and a
// stack of scripts) that the anchor stands behind.

let deskGeo = null;
function deskLogoTex() {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 24;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#120c24'; g.fillRect(0, 0, 96, 24);
  g.fillStyle = '#ffffff'; g.fillRect(2, 2, 46, 20);
  g.fillStyle = '#e0263f'; g.fillRect(48, 2, 46, 20);
  g.fillStyle = '#ffd84a'; g.fillRect(2, 19, 92, 3);
  g.font = 'bold 15px "Jersey 10", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#e0263f'; g.fillText('BEAST', 25, 11);
  g.fillStyle = '#ffffff'; g.fillText('NEWS', 71, 11);
  // crisp the anti-aliased glyph edges to hard pixels
  const d = g.getImageData(0, 0, 96, 24);
  for (let i = 0; i < d.data.length; i += 4) {
    const k = i / 4, x = k % 96, y = (k / 96) | 0;
    if (y < 2 || y > 18) continue;
    const red = x >= 48;
    const lum = d.data[i] + d.data[i + 1] + d.data[i + 2];
    const on = red ? lum > 560 : d.data[i + 1] < 160;
    const col = red ? (on ? [255, 255, 255] : [224, 38, 63]) : (on ? [224, 38, 63] : [255, 255, 255]);
    d.data[i] = col[0]; d.data[i + 1] = col[1]; d.data[i + 2] = col[2]; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeNewsDesk() {
  if (!deskGeo) {
    const g = new VoxGrid();
    const W = 20; // half width
    const top = 0x1a2150, trim = 0xdfe6f6, panel = 0x24308a, panelHi = 0x3446b0, base = 0x0c1238, red = 0xff3a52;
    for (let x = -W; x < W; x++) {
      const edge = Math.abs(x + 0.5) > W - 3; // rounded-off wing ends step back
      const z1 = edge ? 4 : 5;
      // plinth + kick plate
      for (let z = -2; z <= z1 - 1; z++) g.set(x, 0, z, base);
      // front panel with vertical seams
      for (let y = 1; y <= 7; y++) {
        const seam = ((x + W) % 8) === 0;
        g.set(x, y, z1, y === 6 ? red : seam ? panelHi : panel, y === 6);
        g.set(x, y, z1 - 1, panel);
      }
      // desk top slab, chrome lip on the front edge
      for (let z = -4; z <= z1 + 1; z++) g.set(x, 8, z, z >= z1 + 1 ? trim : top);
      g.set(x, 9, z1 + 1, trim);
    }
    // a small monitor at the far end (screen glows), angled toward the anchor
    g.box(-19, 9, -2, -15, 9, 0, 0x22283a);
    g.box(-18, 10, -1, -16, 10, -1, 0x22283a);
    g.box(-20, 11, -1, -14, 15, -1, 0x14182a);
    for (let x = -19; x <= -15; x++) for (let y = 12; y <= 14; y++) g.set(x, y, 0, (x + y) % 4 === 0 ? 0xffd84a : y === 14 ? 0xe0263f : 0x2a6ae8, true);
    // mug + scripts on the other side
    g.cylinder(13, 2, 9, 11, 1.2, 0xffffff);
    g.set(13, 11, 2, 0x5a3418);
    g.set(15, 10, 2, 0xffffff);
    g.box(6, 9, 1, 10, 9, 3, 0xf4f6ff);
    g.box(6, 10, 1, 10, 10, 2, 0xe8eef8);
    g.set(9, 10, 3, 0xe0263f);
    deskGeo = g.build({ pivot: [0, 0, 0] });
  }
  const grp = new THREE.Group();
  grp.add(makeMesh(deskGeo));
  // the logo screen on the front
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.36), new THREE.MeshBasicMaterial({ map: deskLogoTex(), toneMapped: false }));
  logo.position.set(0, 0.36, 0.565);
  grp.add(logo);
  return grp;
}

// ---------------------------------------------------------------------------
// 0. Final blow (over the 3D base collapse)

export function finalBlow(parent, { win = true, view = null } = {}) {
  // pixel debris blasted off the stamp when it lands (shards, bolts, gears, splinters)
  const chunks = h('div', { class: 'cfb-chunks' });
  const spr = debrisSprites();
  for (let i = 0; i < 22; i++) {
    const s = spr[i % spr.length], c = copyOf(s);
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.25, r = 22 + Math.random() * 30;
    c.style.width = `calc(var(--px) * ${s.width * 1.6})`;
    chunks.appendChild(h('i', { style: { '--dx': `${(Math.cos(a) * r).toFixed(1)}vmin`, '--dy': `${(Math.sin(a) * r * 0.75).toFixed(1)}vmin`, '--fall': `${(14 + Math.random() * 22).toFixed(1)}vmin`, '--rot': `${Math.round((Math.random() < 0.5 ? -1 : 1) * (300 + Math.random() * 700))}deg`, '--d': `${(0.7 + Math.random() * 0.5).toFixed(2)}s` } }, c));
  }
  const el = h('div', { class: `cfb ${win ? 'win' : 'loss'}` },
    h('i', { class: 'cfb-vig' }), h('i', { class: 'cfb-lines' }),
    h('i', { class: 'cfb-bar t' }), h('i', { class: 'cfb-bar b' }),
    h('div', { class: 'cfb-tag' }, recDot(), 'SLOW-MO', h('b', {}, 'x0.2')),
    crackCanvas(),
    chunks,
    h('div', { class: 'cfb-stamp' }, h('b', {}, win ? 'BASE' : 'YOUR BASE'), h('span', {}, win ? 'DESTROYED!' : 'HAS FALLEN!')),
    h('i', { class: 'cfb-flash' }), h('i', { class: 'cfb-impact' }));
  parent.appendChild(el);
  SND.slowmo();
  audio.play('heartbeat', { pitch: 0.8 });
  // camera push toward the collapsing base, eased back by the result screen's own framing
  if (view) {
    const z0 = view.zoom;
    animate(1.4, (e) => { view.zoom = z0 + (Math.max(0.7, z0 * 0.72) - z0) * e; }, { ease: 'outCubic' });
  }
  // the stamp slams in on the collapse (baseFall.js COLLAPSE beat at 0.9 s)
  setTimeout(() => {
    if (!el.isConnected) return;
    el.classList.add('hit');
    audio.play('explode', { pitch: 0.55 });
    audio.play('stamp', { pitch: 0.7 });
  }, 950);
  setTimeout(() => el.classList.add('out'), 2350);
  setTimeout(() => el.remove(), 2900);
  return el;
}

/** The lens cracks on the collapse: jagged pixel fracture lines from an impact point (lower third). */
function crackCanvas() {
  const W = 240, H = Math.round(240 * (window.innerHeight / Math.max(1, window.innerWidth)));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.className = 'cfb-crack';
  const g = cv.getContext('2d');
  const ox = W * (0.3 + Math.random() * 0.4), oy = H * (0.58 + Math.random() * 0.12);
  const P = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const branch = (x, y, a, len, depth) => {
    for (let i = 0; i < len; i++) {
      a += (Math.random() - 0.5) * 0.5;
      x += Math.cos(a); y += Math.sin(a);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      P(x, y, 'rgba(255,255,255,0.9)');
      P(x + 1, y + 1, 'rgba(10,8,30,0.55)');
      if (depth < 2 && Math.random() < 0.035) branch(x, y, a + (Math.random() < 0.5 ? -0.8 : 0.8), len * 0.45, depth + 1);
    }
  };
  for (let i = 0; i < 9; i++) branch(ox, oy, (i / 9) * Math.PI * 2 + Math.random() * 0.4, 50 + Math.random() * 90, 0);
  // the shattered spot at the impact point
  for (let y = -5; y <= 5; y++) for (let x = -6; x <= 6; x++) if (Math.abs(x) + Math.abs(y) < 7 && (x * 7 + y * 3) % 3 === 0) P(ox + x, oy + y, 'rgba(255,255,255,0.75)');
  return cv;
}

// ---------------------------------------------------------------------------

export async function showResult(parent, opts) {
  const { result } = opts;
  const names = opts.names ?? ['You', 'Rival'];
  const bases = opts.bases ?? [{ frac: 1, alive: true, tier: 0 }, { frac: 1, alive: true, tier: 0 }];
  const r = opts.rewards;
  let sum = opts.summary;
  if (sum === undefined) { try { sum = engine.current?.battleSummary?.() ?? null; } catch (e) { sum = null; } }
  const W = window.innerWidth, H = window.innerHeight;
  const portrait = H > W;
  const win = result === 'win', loss = result === 'loss';
  const title = win ? 'VICTORY!' : loss ? 'DEFEAT' : 'DRAW';

  const root = h('div', { class: `cres r-${result} ${portrait ? 'portrait' : 'landscape'}` });
  parent.appendChild(root);
  const stageHost = h('div', { class: 'cres-stage' });
  const stage = new Stage3D({ fov: 26, maxPixels: 1.3e6, rimA: win ? 0xffd84a : 0x6a8cff, rimB: win ? 0xff7ac8 : 0x8a5aff, rimI: 3 });
  let alive = true;
  const end = () => { alive = false; stage.dispose(); };

  // ======================= 1. VERDICT =======================
  const seq = clock();
  root.addEventListener('pointerdown', () => seq.skip());
  const letters = [...title].map((ch, i) => h('span', { style: { '--i': i } }, ch));
  const verdict = h('div', { class: 'cres-verdict' },
    h('i', { class: 'cv-bg' }), h('i', { class: 'px-rays w cv-rays' }), win ? h('i', { class: 'cv-spots' }) : null, loss ? h('i', { class: 'cv-rain' }) : null,
    stageHost,
    h('div', { class: 'cv-head' },
      win ? icon('crown', 'cv-crown') : loss ? icon('skull', 'cv-crown') : null,
      h('div', { class: 'cv-title' }, letters),
      h('div', { class: `cv-sub sk-ribbon-${win ? 'pink' : loss ? 'blue' : 'purple'}` }, win ? `${names[0]} WINS!` : loss ? `${names[1]} WINS` : 'NOBODY BLINKED')),
    h('i', { class: 'cv-bar t' }), h('i', { class: 'cv-bar b' }, h('span', { class: 'cv-skip' }, 'TAP TO CONTINUE')),
    h('i', { class: 'cv-flash' }));
  root.appendChild(verdict);

  // 3D: the winner celebrates centre stage, the loser sulks behind
  const sides = sum?.sides ?? [];
  const winSide = win ? 0 : loss ? 1 : 0;
  const champ = chibiFor(sides[winSide]?.commander);
  const other = chibiFor(sides[1 - winSide]?.commander);
  const cam = stage.camera;
  cam.position.set(0, 1.25, 10);
  cam.lookAt(0, 1.25, 0);
  const visH = () => 2 * cam.position.z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const placeAt = (ch, sx, sy, frac, z = 0) => {
    const p = stage.screenToWorld(sx, sy, z);
    ch.root.position.copy(p);
    ch.root.scale.setScalar((frac * visH() * (cam.position.z - z)) / cam.position.z / ch.height);
  };
  const layoutVerdict = () => {
    cam.updateMatrixWorld();
    if (champ) placeAt(champ, portrait ? 0.5 : 0.62, portrait ? 0.9 : 1.0, portrait ? 0.44 : 0.5);
    if (other) placeAt(other, portrait ? 0.2 : 0.3, portrait ? 0.83 : 0.93, portrait ? 0.24 : 0.3, -2);
  };
  if (champ) { stage.add(champ.root); champ.root.rotation.y = 0.12; }
  if (other) { stage.add(other.root); other.root.rotation.y = 0.5; }
  let camT = 0;
  stage.onUpdate((dt) => {
    camT += dt;
    if (phase === 'verdict') {
      cam.position.z = 10 - Math.min(1, camT / 3) * 0.8;
      cam.position.x = Math.sin(camT * 0.6) * 0.15;
      cam.lookAt(0, 1.25, 0);
      layoutVerdict();
    }
    const n = Math.max(1, Math.ceil(dt * 30));
    for (const c of [champ, other, anchor]) if (c) for (let i = 0; i < n; i++) c.update(dt / n);
  });
  stage.onResize = () => phase === 'verdict' && layoutVerdict();
  let phase = 'verdict';
  let anchor = null;
  stage.mount(stageHost);
  stage.start();
  if (import.meta.env.DEV) window.__resStage = stage;

  if (champ) {
    if (result === 'draw') champ.react('shrug', { dur: 3 });
    else { champ.play('victory'); champ.mood('excited'); champ.boing(0.5); }
  }
  if (other) {
    if (result === 'draw') other.react('shrug', { dur: 3 });
    else { other.play('sad'); other.mood('cry'); }
  }
  audio.play(win ? 'fanfare' : loss ? 'error' : 'bell');
  setTimeout(() => { if (root.isConnected) { engine.shake?.(loss ? 0.3 : 0.2); audio.play('stamp', { pitch: loss ? 0.7 : 1 }); } }, 140 + title.length * 60);
  if (win) {
    audio.play('cheer');
    confetti(verdict, { count: 50, life: 5, spread: 1.4 });
    setTimeout(() => root.isConnected && burst(verdict.querySelector('.cv-title'), { color: '#ffd84a', count: 26, scale: 1.2 }), 160 + title.length * 60);
  }
  // celebration beats
  setTimeout(() => { if (alive && champ && result !== 'draw') champ.react(win ? 'celebrate' : 'laugh', { dur: 1.8 }); }, 1100);
  await seq.wait(2900);
  // dev: window.__resHold = true keeps the verdict up (screenshots on slow machines)
  while (import.meta.env.DEV && window.__resHold && root.isConnected) await new Promise((res) => setTimeout(res, 300));
  if (!root.isConnected) { end(); return 'ok'; }

  // ======================= 2. BREAKING NEWS sting =======================
  const sting = h('div', { class: 'cres-sting' },
    h('i', { class: 'cs-band a' }), h('i', { class: 'cs-band b' }),
    h('div', { class: 'cs-txt' }, h('b', {}, 'BREAKING'), h('span', {}, 'NEWS')));
  root.appendChild(sting);
  SND.swoosh();
  SND.news();
  await new Promise((res) => setTimeout(res, 420));
  verdict.remove();
  phase = 'news';
  if (champ) stage.remove(champ.root);
  if (other) stage.remove(other.root);

  // ======================= 3. BEAST NEWS =======================
  const news = buildNews({ result, names, bases, r, sum, portrait, opts });
  root.appendChild(news.el);
  setTimeout(() => sting.remove(), 700);
  // the anchor at her desk
  anchor = chibiFor({ char: 'anchor' });
  try {
    const desk = makeNewsDesk();
    desk.position.set(0.15, -0.36, 0.62);
    stage.add(desk);
  } catch (e) { /* the studio works without its desk */ }
  if (anchor) {
    stage.add(anchor.root);
    anchor.root.rotation.y = 0.28;
    anchor.play('talk');
    anchor.expr('happy', 'grin');
  }
  const aim = new THREE.Vector3();
  const frameAnchor = () => {
    if (!anchor) return;
    cam.fov = 24;
    cam.updateProjectionMatrix();
    // frame from the hair tip down to just below the desk top (whatever the model's proportions)
    anchor.root.updateMatrixWorld(true);
    const top = new THREE.Box3().setFromObject(anchor.root).max.y + 0.1;
    const bottom = 0.2;
    const vh = top - bottom;
    const dist = vh / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // anchor sits left of centre (the BEAST NEWS screen fills the right)
    const off = (portrait ? 0.15 : 0.1) * vh * cam.aspect;
    aim.set(off, (top + bottom) / 2, 0);
    cam.position.set(aim.x + Math.sin(0.12) * dist, aim.y + 0.12, Math.cos(0.12) * dist);
    cam.lookAt(aim);
  };
  stage.onResize = () => frameAnchor();
  stage.mount(news.cam);
  frameAnchor();

  const seq2 = clock();
  root.addEventListener('pointerdown', () => seq2.skip());
  const anchorSay = (on) => anchor?.talk(on);
  await seq2.wait(380);
  // headline, read out by the anchor
  anchorSay(true);
  const hl = popWords(news.headline, news.headlineText, {
    cps: 34,
    onWord: (wd) => {
      audio.play('blip', { pitch: wd.emph ? 1.15 : 1.3 + Math.random() * 0.15, gap: 0.05 });
      if (wd.emph) anchor?.boing(0.12);
    },
  });
  root.addEventListener('pointerdown', () => hl.finish());
  if (seq2.skipping) hl.finish();
  await hl.promise;
  anchorSay(false);
  anchor?.play('point', { dur: 1.4, then: 'talk' });
  // reveal the report, item by item
  for (const step of news.steps) {
    if (!root.isConnected) break;
    if (step.say) anchorSay(true);
    await step.run(seq2);
    if (step.react && anchor) step.react(anchor);
    anchorSay(false);
    await seq2.wait(step.gap ?? 150);
  }
  anchor?.play('talk');
  news.el.classList.add('done');

  const buttons = opts.buttons ?? [{ id: 'ok', label: 'OK', color: 'blue' }];
  return new Promise((resolve) => {
    const foot = h('div', { class: 'res-foot cres-foot' }, buttons.map((b) => button(b.label, () => {
      root.remove();
      end();
      resolve(b.id);
    }, `${b.color ?? 'blue'} lg`, { icon: b.icon })));
    news.footSlot.appendChild(foot);
    // the screen was torn down from outside (scene change)
    const watch = setInterval(() => { if (!root.isConnected) { clearInterval(watch); end(); } }, 500);
  });
}

// ---------------------------------------------------------------------------
// BEAST NEWS layout + reveal steps

function buildNews({ result, names, bases, r, sum, portrait, opts }) {
  const win = result === 'win', loss = result === 'loss';
  const me = names[0] ?? 'You', riv = names[1] ?? 'Rival';
  const st = sum?.sides?.[0]?.stats ?? {};
  const time = sum?.time ?? 0;
  const smashed = !bases[1].alive, fell = !bases[0].alive;
  const headlineText = win
    ? (smashed ? `*${me}* SMASHES *${riv}*'s base${time >= 5 ? ` in ${fmtTime(time)}` : ''}!` : `*${me}* OUTLASTS *${riv}* on base HP!`)
    : loss
      ? (fell ? `*${riv}* FLATTENS *${me}*'s base! Rematch incoming?` : `*${riv}* edges out *${me}* at the buzzer!`)
      : `STALEMATE! *${me}* and *${riv}* can't be split!`;

  const cam = h('div', { class: 'cn-cam' });
  const headline = h('div', { class: 'cn-hl' });
  const footSlot = h('div', { class: 'cn-footslot' });
  const arenaName = sum?.arena?.name ?? 'Beast Island';

  // studio: wall, big screen, anchor (3D), desk, logo bug, LIVE
  const studio = h('div', { class: 'cn-studio' },
    h('i', { class: 'cn-wall' }), h('i', { class: 'cn-lights' }),
    h('div', { class: 'cn-screen' },
      h('i', { class: 'cn-screen-glow' }),
      h('div', { class: 'cn-screen-in' },
        h('small', {}, 'BATTLE REPORT'),
        h('b', {}, win ? 'VICTORY' : loss ? 'DEFEAT' : 'DRAW'),
        h('span', {}, arenaName))),
    cam,
    h('div', { class: 'cn-bug' }, h('b', {}, 'BEAST'), h('span', {}, 'NEWS')),
    h('div', { class: 'cn-live sk-plate-dark' }, recDot(), 'LIVE'));
  const lower = h('div', { class: 'cn-lower' },
    h('div', { class: 'cn-tag sk-chip-red' }, 'BREAKING'),
    h('div', { class: 'cn-hlw sk-plate-dark' }, headline, h('div', { class: 'cn-by' }, 'NORA NEWSLY  /  BEAST NEWS ', h('b', {}, arenaName.toUpperCase()))));

  // ---- the report board
  const board = h('div', { class: 'cn-board' });
  const steps = [];

  // bases: HP left
  const baseRow = (i) => {
    const b = bases[i];
    const fill = h('i', { class: 'f' });
    const pct = h('span', { class: 'pc' }, '100%');
    const el = h('div', { class: `cn-base s${i}` },
      h('div', { class: 'nm' }, h('span', {}, i ? riv : me), h('small', {}, icon('lab'), BASE_UPGRADES[b.tier ?? 0]?.name ?? 'Base')),
      h('b', { class: 'bar sk-well' }, h('i', { class: 'fw' }, fill), pct));
    return { el, fill, pct, b };
  };
  const bRows = [baseRow(0), baseRow(1)];
  const basesEl = h('div', { class: 'cn-card cn-bases sk-panel-dark' }, h('div', { class: 'cn-cap' }, 'BASE HP LEFT'), bRows[0].el, bRows[1].el);
  board.appendChild(basesEl);
  steps.push({
    say: true,
    run: async (seq) => {
      basesEl.classList.add('in');
      audio.play('whoosh', { pitch: 1.5, vol: 0.5 });
      await seq.wait(160);
      await Promise.all(bRows.map((t, k) => new Promise((res) => {
        const to = Math.max(0, t.b.frac), dur = seq.skipping ? 1 : 650;
        const t0 = performance.now() + k * 120;
        const stepF = (now) => {
          const q = Math.max(0, Math.min(1, (now - t0) / dur));
          const v = 1 - (1 - to) * (1 - Math.pow(1 - q, 3));
          t.fill.style.width = (v * 100).toFixed(1) + '%';
          t.pct.textContent = Math.round(v * 100) + '%';
          if (q < 1 && !seq.skipping) requestAnimationFrame(stepF);
          else {
            t.fill.style.width = (to * 100).toFixed(1) + '%';
            t.pct.textContent = Math.round(to * 100) + '%';
            if (!t.b.alive) { t.el.appendChild(h('div', { class: 'cn-stamp sk-chip-red' }, 'DESTROYED')); audio.play('stamp'); bump(t.el, 'cn-hit'); }
            else if (t.b.frac >= 0.999) { t.el.appendChild(h('div', { class: 'cn-stamp good sk-chip-green' }, 'FLAWLESS')); audio.play('stamp', { pitch: 1.2 }); }
            res();
          }
        };
        requestAnimationFrame(stepF);
      })));
    },
    gap: 120,
  });

  // stat tiles
  const spells = st.spells ?? 0;
  const tiles = [
    { ic: 'clock', label: 'BATTLE TIME', value: time, fmt: fmtTime },
    { ic: 'swords', label: 'TROOPS DEPLOYED', value: st.deployed ?? 0 },
    { ic: 'bolt', label: 'DAMAGE DEALT', value: Math.round(st.dmg ?? 0), fmt: fmtBig },
    { ic: 'skull', label: 'SWARMS DEFEATED', value: st.kills ?? 0 },
    { ic: 'magic', label: 'SPELLS + SPECIALS', value: spells },
    { ic: 'star', label: 'COMMANDER ULTS', value: (st.sigs ?? 0) + (sum?.megas ?? 0) },
  ];
  const grid = h('div', { class: 'cn-grid' });
  board.appendChild(grid);
  tiles.forEach((tl, k) => {
    const v = h('b', { class: 'v' }, tl.fmt ? tl.fmt(0) : '0');
    const el = h('div', { class: 'cn-card cn-tile sk-panel-dark' }, h('div', { class: 'ic' }, icon(tl.ic)), v, h('small', {}, tl.label));
    grid.appendChild(el);
    steps.push({
      say: k % 2 === 0,
      run: async (seq) => {
        el.classList.add('in');
        SND.tickRoll(1 + k * 0.06);
        if (seq.skipping) v.textContent = tl.fmt ? tl.fmt(tl.value) : fmtN(tl.value);
        else rollNumber(v, 0, tl.value, 0.55, tl.fmt ?? fmtN);
        await seq.wait(140);
      },
      gap: 40,
    });
  });

  // MVP card + trophies
  const mvp = sum?.mvp;
  const mvpDef = mvp ? cardDef(mvp.id) : null;
  const row = h('div', { class: 'cn-row' });
  board.appendChild(row);
  if (mvpDef) {
    let art = null;
    try { art = cardArtImg(mvp.id, 'base', null, 160, 'cn-mvp-art'); } catch (e) { art = null; }
    const dmgV = h('b', {}, '0');
    const el = h('div', { class: 'cn-card cn-mvp sk-panel-gold' },
      h('div', { class: 'cn-mvp-tag sk-chip-gold' }, icon('star'), 'MVP'),
      h('div', { class: 'cn-mvp-frame sk-pod-gold' }, h('i', { class: 'px-rays w' }), art),
      h('div', { class: 'cn-mvp-info' }, h('span', { class: 'nm' }, mvpDef.name ?? mvp.id),
        mvp.dmg ? h('span', { class: 'd' }, dmgV, ' DMG') : null,
        mvp.count ? h('small', {}, `deployed x${mvp.count}`) : null));
    row.appendChild(el);
    steps.push({
      say: true,
      run: async (seq) => {
        el.classList.add('in');
        audio.play('reveal', { pitch: 1.1 });
        if (mvp.dmg) { if (seq.skipping) dmgV.textContent = fmtN(mvp.dmg); else rollNumber(dmgV, 0, mvp.dmg, 0.7, fmtN); }
        setTimeout(() => el.isConnected && sparkle(el, { count: 12, colors: ['#ffd84a', '#ffffff'] }), 200);
        await seq.wait(420);
      },
      react: (a) => a.react('thumbsUp', { dur: 1.3 }),
      gap: 120,
    });
  }
  const tr = r?.trophies ?? 0;
  if (r && (tr || opts.mode === 'ranked' || opts.mode === 'online')) {
    const tv = h('b', { class: 'v' }, '0');
    const el = h('div', { class: `cn-card cn-trophy sk-panel-gold ${tr < 0 ? 'neg' : ''}` }, h('i', { class: 'px-rays w' }), animIcon('trophy'), tv, h('small', {}, 'TROPHIES'));
    row.appendChild(el);
    steps.push({
      say: false,
      run: async (seq) => {
        el.classList.add('in');
        audio.play(tr >= 0 ? 'crown' : 'error');
        if (seq.skipping) tv.textContent = (tr > 0 ? '+' : '') + tr;
        else rollNumber(tv, 0, tr, 0.6, (n) => (tr > 0 && n > 0 ? '+' : '') + n);
        if (tr > 0) setTimeout(() => el.isConnected && burst(el, { color: '#ffd84a', count: 18 }), 300);
        await seq.wait(380);
      },
      react: (a) => (tr > 0 ? a.react('clap', { dur: 1.4 }) : tr < 0 ? a.react('shrug', { dur: 1.3 }) : null),
      gap: 120,
    });
  }
  if (!row.children.length) row.remove();

  // rewards chips
  if (r) {
    const items = [];
    const add = (ic, value, label, o = {}) => {
      const v = h('b', {}, '0');
      const el = h('div', { class: `cn-chip sk-pod${o.neg ? '-dim neg' : ''} k-${ic}` }, o.img ?? animIcon(ic), h('div', {}, v, h('small', {}, label)));
      items.push({ el, v, value, text: o.text });
    };
    if (r.coins) add('coin', r.coins, 'Coins');
    if (r.vial) {
      const vd = VIALS[r.vial];
      let img = null;
      const vt = opts.vialThumb;
      try { img = vt ? h('img', { class: 'vial3d', src: vt(r.vial, 96) }) : null; } catch (e) { img = null; }
      if (!img) {
        img = icon('vial');
        import('../../ui/vialThumb.js').then((m) => {
          try { const src = m.vialThumb(r.vial, 96); if (src && img.isConnected) { img.src = src; img.classList.add('vial3d'); } } catch (e) { /* keep the icon */ }
        }).catch(() => {});
      }
      add('vial', 0, vd?.name ?? 'Vial', { img, text: 'NEW!' });
    } else if (r.slotsFull && result === 'win') add('vial', 0, 'Slots full!', { text: 'FULL', neg: true });
    if (r.calories) add('calorie', r.calories, 'Calories');
    if (r.cmdXp) add('star', r.cmdXp, 'Cmdr XP');
    if (r.labXp) add('lab', r.labXp, 'Lab XP');
    if (items.length) {
      const chips = h('div', { class: 'cn-chips' }, items.map((it) => it.el));
      board.appendChild(chips);
      steps.push({
        say: false,
        run: async (seq) => {
          for (const [k, it] of items.entries()) {
            it.el.classList.add('in');
            if (it.text) it.v.textContent = it.text;
            else if (seq.skipping) it.v.textContent = '+' + fmtN(it.value);
            else rollNumber(it.v, 0, it.value, 0.5, (n) => '+' + fmtN(n));
            audio.play('coin', { pitch: 1 + k * 0.08 });
            await seq.wait(130);
          }
        },
        gap: 60,
      });
    }
    const ups = [...(r.levelUps ?? []).map((lu) => `Commander level ${lu.level ?? lu}!`), ...(r.labUps ?? []).map((lu) => `Lab Level ${lu.level ?? lu}!`)];
    if (ups.length) {
      const el = h('div', { class: 'cn-ups' }, ups.map((u) => h('span', {}, icon('up'), u)));
      board.appendChild(el);
      steps.push({ say: false, run: async () => { el.classList.add('in'); audio.play('levelUp'); }, gap: 100 });
    }
  }

  // ticker
  const bits = [
    headlineText.replace(/\*/g, ''),
    mvpDef ? `MVP: ${mvpDef.name}${mvp.dmg ? ` dealt ${fmtN(mvp.dmg)} damage` : ''}` : null,
    `${fmtN(st.deployed ?? 0)} troops deployed`,
    `${fmtN(st.kills ?? 0)} Swarms defeated`,
    r?.trophies ? `TROPHIES ${tr > 0 ? '+' : ''}${tr}` : null,
    `Live from ${arenaName}`,
    'Beast Tiger "totally fine", says Jimmy',
    'Feastables stock up 300%',
    'Lab Packs flying off the shelves',
  ].filter(Boolean);
  const tickTxt = bits.map((b) => h('span', {}, h('i', {}, '◆'), b.toUpperCase()));
  const ticker = h('div', { class: 'cn-ticker' }, h('b', { class: 'cn-ticker-tag' }, 'BEAST NEWS'), h('div', { class: 'cn-ticker-run' }, h('div', { class: 'cn-ticker-in' }, tickTxt, tickTxt.map((e) => e.cloneNode(true)))));

  const el = h('div', { class: 'cres-news' },
    h('div', { class: 'cn-left' }, studio, lower),
    h('div', { class: 'cn-right' }, board, footSlot),
    ticker);
  return { el, cam, headline, headlineText, steps, footSlot };
}

export { button };
