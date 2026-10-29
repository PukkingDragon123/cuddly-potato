// Loading screen shown while a heavy scene builds (entering a battle, Beast
// Island, the Lab): a lab experiment going wrong. The Commander (the game's 3D
// chibi, rendered into pixel pose frames) stirs bubbling, colour-changing
// chemicals at a lab bench; as loading runs on, everything gets more unstable
// (wobbling glassware, boiling, sparks, smoke, the pressure dial creeping into
// the red, silly captions). When the scene is ready the experiment EXPLODES:
// flash, a pixel-art fireball, flying glass and debris, a soot-faced Commander,
// and the smoke clears onto the next scene.
//
// Every moving part is a CSS transform / opacity animation scheduled up front
// (the instability ramps are layered keyframe animations with delays), so it
// keeps moving on the compositor while the scene build blocks the main thread.
// The cineBackdrop / cineDressing / cineLogo helpers are shared with the title.
import './cinematic.css';
import { h, icon } from '../ui/ui.js';
import { arenaById, currentArena } from '../data/arenas.js';
import { state } from '../game/state.js';
import { audio } from '../core/audio.js';
import * as Art from './labLoadArt.js';

const TIPS = [
  'Tanks in front, shooters behind: let your big Swarms soak the hits.',
  'Cards cost *POWER*. Keep a little in the tank for a counter-push!',
  'Upgrade your *BASE* in battle: more HP, a stronger zapper and faster POWER.',
  'Spells are magic: *Rage Potion* on a brawl, *Time Warp* on a big push. Timing is everything.',
  'Your *MEGA* can be unleashed once per battle from a Trailer Lab base or better.',
  'Your Commander *ULTIMATE* charges from the POWER you make and the damage your base takes.',
  "Save Jimmy's *Beast Buyout* for a big push: he buys the 3 strongest enemy troops!",
  'Win battles for *trophies* and *vials*. New arenas unlock new cards.',
  'Tap the people on *Beast Island*: some of them have quests for you.',
  'Every arena on Beast Island hides a *secret*. Look for the sparkles!',
  'Duplicate cards level up your Swarms in the *CARDS* tab.',
  'You hold 4 cards plus *NEXT*. Plan your cycle a play ahead!',
  'Spells can flip a lost lane: a *Money Drop* or *Soda Rocket* at the right moment wins fights.',
  'Boss gates open on the island once you have enough trophies.',
  'Your base zaps anything that gets close. Fight near it when you are behind.',
  'A free vial refills every 4 hours. Grab it in the *SHOP*!',
];

let stills = []; // object URLs of frozen-battle frames (newest last)
/** title.js hands over the frames it captured from the live frozen battle. */
export function setLoadingStills(urls) {
  const next = urls.filter(Boolean).slice(-4);
  for (const u of stills) if (!next.includes(u)) setTimeout(() => URL.revokeObjectURL(u), 20000);
  stills = next;
}
export function hasLoadingStills() {
  return stills.length > 0;
}

const rich = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*(.+?)\*/g, '<b class="hl">$1</b>');

/** Painted backdrop: two team glows clashing in a dark lab, a slow flare and drifting sparks. */
export function cineBackdrop() {
  const sparks = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const d = 18 + Math.random() * 26;
    sparks.push(h('i', { class: 'sp', style: {
      '--x': `${48 + Math.random() * 4}%`, '--y': `${52 + Math.random() * 4}%`, '--tx': `${Math.cos(a) * d}vmin`, '--ty': `${Math.sin(a) * d * 0.6 - 6}vmin`,
      '--d': `${2.2 + Math.random() * 2.4}s`, '--dl': `${-Math.random() * 4}s`,
    } }));
  }
  return h('div', { class: 'cn-back' }, h('img', { class: 'gl', src: glintURL(), alt: '', draggable: 'false' }), sparks);
}
/** The clash flare as pixel art: an 8-point star burst with tapered arms, dithered halo and a hot core. */
let _glint = null;
function glintURL() {
  if (_glint) return _glint;
  const S = 64, c = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const put = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, ax = Math.abs(dx), ay = Math.abs(dy);
    const r = Math.hypot(dx, dy) / c;
    const main = (ax < 1.5 - r && ay < c * 0.98) || (ay < 1.5 - r && ax < c * 0.98);
    const diag = Math.abs(ax - ay) < 1.2 - r && r < 0.62;
    const core = ax + ay < 7;
    const halo = ax + ay < 15 && (x + y) % 2 === 0;
    const dust = ax + ay < 24 && (x * 7 + y * 3) % 11 === 0;
    if (core) put(x, y, ax + ay < 3.5 ? '#ffffff' : '#fff3c0');
    else if (main) put(x, y, r < 0.4 ? '#ffffff' : r < 0.7 ? '#ffe9a0' : 'rgba(255,214,120,0.7)');
    else if (diag) put(x, y, 'rgba(255,240,200,0.85)');
    else if (halo) put(x, y, 'rgba(255,220,140,0.45)');
    else if (dust) put(x, y, 'rgba(255,230,170,0.5)');
  }
  return (_glint = cv.toDataURL());
}
/** Film dressing shared with the title: vignette, grain, light leak, streaks, letterbox. */
export function cineDressing() {
  return [
    h('i', { class: 'cn-vig' }), h('i', { class: 'cn-leak' }), h('i', { class: 'cn-streak s1' }), h('i', { class: 'cn-streak s2' }), h('i', { class: 'cn-grain' }),
    h('i', { class: 'cn-bar top' }), h('i', { class: 'cn-bar bot' }),
  ];
}
/** The game logo (layered pixel lettering + bolt + tag); `reveal` plays the title-sequence assembly. */
export function cineLogo(o = {}) {
  const name = 'SWARMERS';
  return h('div', { class: `cn-logo ${o.reveal ? 'reveal' : ''} ${o.small ? 'sm' : ''}` },
    h('span', { class: 'l1' }, 'MrBeast'),
    h('span', { class: 'l2' }, [...name].map((ch, i) => h('span', { style: { '--i': i } }, ch))),
    h('img', { class: 'bolt', src: boltURL(), alt: '', draggable: 'false' }),
    o.tag === false ? null : h('div', { class: 'tag' }, 'BEAST ISLAND'),
    h('i', { class: 'sweep' }));
}
let _bolt = null;
function boltURL() {
  if (!_bolt) { try { _bolt = icon('logoBolt').src; } catch (e) { _bolt = ''; } }
  return _bolt;
}

function destination(name, params) {
  if (name === 'battle') {
    const mode = params.mode ?? 'ranked';
    const A = arenaById(params.arena) ?? currentArena(state.p?.trophies ?? 0);
    const k = mode === 'boss' ? 'BOSS FIGHT' : mode === 'practice' ? 'TRAINING' : mode === 'friend' ? 'FRIEND BATTLE' : mode === 'tutorial' ? 'FIRST BATTLE' : 'ENTERING BATTLE';
    return { k, n: (A?.name ?? 'The Arena').toUpperCase(), ac: A?.color ?? '#ffd23f' };
  }
  if (name === 'home') return { k: 'NEXT STOP', n: 'BEAST ISLAND', ac: '#7cff6a' };
  if (name === 'lab') return { k: 'HEADING INTO', n: 'THE BEAST LAB', ac: '#9ff2ff' };
  return { k: 'LOADING', n: '', ac: '#9ff2ff' };
}

// ======================================================================= the lab experiment
const CAPTIONS = [
  ['Calibrating the beakers', 'Warming up the Bunsen burner', 'Labeling the flasks (mostly)'],
  ['Adding a pinch of chaos', 'Stirring counter-clockwise. Important.', 'Adding Swarm DNA'],
  ['Hmm. That color is new.', 'Is it supposed to fizz like that?', 'Smells like victory. And burning.'],
  ['Pressure: probably fine', 'Do NOT shake the flask', 'Safety goggles? What goggles?'],
  ['Pressure: NOT fine', 'Shaking the flask anyway', 'This is fine. Everything is fine.'],
  ['Stand back. SCIENCE!', 'Somebody call Nolan', 'Okay this is a lot of bubbles'],
];
const pick1 = (a) => a[Math.floor(Math.random() * a.length)];
// instability levels: [start s, translate amp (lab px), rotate amp (deg), loop s]
// kept gentle: the experiment simmers and wobbles, it doesn't rattle the whole screen
const LEVELS = [[0, 0.1, 0.4, 0.9], [2.4, 0.2, 1.2, 0.5], [4.8, 0.32, 2, 0.4], [7.2, 0.45, 2.8, 0.32], [9.6, 0.6, 3.5, 0.28]];
let genCSS = null;
/** Random jitter keyframes per instability level (generated once per page, injected as CSS). */
function genKeyframes() {
  if (genCSS) return;
  const css = [];
  const jitter = (name, amp, rot, n = 8, hop = 0) => {
    const st = [];
    for (let i = 0; i <= n; i++) {
      const last = i === n || i === 0;
      const x = last ? 0 : (Math.random() * 2 - 1) * amp, y = last ? 0 : -Math.random() * amp * (hop ? 1.4 : 0.6);
      const r = last ? 0 : (Math.random() * 2 - 1) * rot;
      st.push(`${((i / n) * 100).toFixed(1)}%{transform:translate(calc(var(--lp)*${x.toFixed(2)}),calc(var(--lp)*${y.toFixed(2)})) rotate(${r.toFixed(2)}deg)}`);
    }
    css.push(`@keyframes ${name}{${st.join('')}}`);
  };
  for (let k = 0; k < 4; k++) LEVELS.forEach(([, a, r], L) => jitter(`ldJ${k}_${L}`, a * (k === 3 ? 0.4 : 1), k === 3 ? 0 : r, 8, k < 3));
  jitter('ldCrit', 1.1, 5, 10, 1);
  // pressure needle: climbs from the green into the red with growing jitter, then rattles at max
  const nd = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const base = -125 + (1 - (1 - t) ** 1.6) * 228;
    const j = i === 0 ? 0 : (Math.random() * 2 - 1) * (3 + t * 14);
    nd.push(`${((i / N) * 100).toFixed(1)}%{transform:rotate(${(base + j).toFixed(1)}deg)}`);
  }
  css.push(`@keyframes ldNeedle{${nd.join('')}}`);
  const nm = [];
  for (let i = 0; i <= 6; i++) nm.push(`${((i / 6) * 100).toFixed(1)}%{transform:rotate(${(i === 0 || i === 6 ? 103 : 96 + Math.random() * 18).toFixed(1)}deg)}`);
  css.push(`@keyframes ldNeedleMax{${nm.join('')}}`);
  const sh = [];
  for (let i = 0; i <= 10; i++) { const k = 1 - i / 10; sh.push(`${((i / 10) * 100).toFixed(1)}%{transform:translate(${((Math.random() * 2 - 1) * 8 * k).toFixed(1)}px,${((Math.random() * 2 - 1) * 6 * k).toFixed(1)}px)}`); }
  css.push(`@keyframes ldQuake{${sh.join('')}}`);
  genCSS = document.createElement('style');
  genCSS.id = 'ld-gen';
  genCSS.textContent = css.join('\n');
  document.head.appendChild(genCSS);
}
/** Shake animation list for element `k` (0..3) through every instability level. */
const shakeAnim = (k) => LEVELS.map(([t0, , , dur], L) => `ldJ${k}_${L} ${dur}s linear ${t0}s infinite`).join(', ');

let art = null;
function getArt() {
  if (art) return art;
  const L = Art.LIQ;
  art = {
    wall: Art.labWall(), bench: Art.labBench(),
    erlen: ['green', 'purple', 'pink'].map((k) => Art.vessel('erlen', L[k])), erlenHot: Art.vessel('erlen', L.white),
    beaker: ['cyan', 'orange', 'green'].map((k) => Art.vessel('beaker', L[k])), beakerHot: Art.vessel('beaker', L.white),
    round: ['purple', 'red', 'orange'].map((k) => Art.vessel('round', L[k])), roundHot: Art.vessel('round', L.white),
    tubes: [Art.vessel('tube', L.pink), Art.vessel('tube', L.cyan), Art.vessel('tube', L.orange)],
    brokenErlen: Art.brokenVessel('erlen', L.pink), brokenBeaker: Art.brokenVessel('beaker', L.green), brokenRound: Art.brokenVessel('round', L.orange),
    stopper: Art.stopper(), rod: Art.rod(24), burner: Art.burner(), flame: Art.flameStrip(4), stand: Art.ringStand(),
    gauge: Art.gaugeFace(), needle: Art.gaugeNeedle(), sign: Art.signPlate(),
    bubbles: [Art.bubble(3), Art.bubble(4), Art.bubble(6)],
    sparks: [Art.spark(true), Art.spark(false), Art.spark(true, '#e0fbff', '#4fe8ff')],
    puff: Art.puffStrip(16, 6), puffGreen: Art.puffStrip(16, 6, ['#e4ffd8', '#9ad88a', '#5a8a5a'], 3), puffDark: Art.puffStrip(24, 6, ['#9a92ac', '#5a5470', '#2e2a40'], 7),
    blast: Art.blastStrip(64, 8),
    cloud: Art.puffStrip(40, 6, ['#d4ccdc', '#9a92ac', '#5a5470'], 11),
    cloud2: Art.puffStrip(40, 6, ['#e0d4c4', '#a8988a', '#5e5048'], 23),
    debris: Art.debrisSprites(L.green),
  };
  return art;
}

// the smoke that clears onto the next scene: puffs tiled over the screen (x%, y%)
const CLOUDS = [[10, 12], [45, 8], [85, 14], [25, 34], [68, 30], [100, 38], [0, 55], [40, 56], [80, 58], [18, 80], [58, 84], [96, 86], [50, 34], [30, 100]];

// stage geometry (lab pixels, 128 x 96)
const LW = 128, LH = 96, BENCH = 64;
const lp = (n) => `calc(var(--lp) * ${n})`;
/** Absolutely place a sprite canvas (its pixel size = lab px) at lab coords. */
function sprite(src, x, y, cls = '', o = {}) {
  const c = o.raw ? src : Art.copyOf(src);
  const w = o.w ?? src.width, hh = o.h ?? src.height;
  const el = h('div', { class: `ld-sp ${cls}`, style: { left: lp(x), top: lp(y), width: lp(w), height: lp(hh), ...(o.style ?? {}) } });
  c.style.width = lp(src.width); c.style.height = lp(src.height);
  el.appendChild(c);
  return el;
}
/** A frame strip clipped to one frame, stepping through `n` frames (CSS steps). */
function strip(src, n, x, y, cls, o = {}) {
  const fw = src.width / n, fh = src.height;
  const k = o.scale ?? 1;
  const c = Art.copyOf(src);
  c.className = 'strip';
  c.style.width = lp(src.width * k); c.style.height = lp(fh * k);
  const el = h('div', { class: `ld-strip ${cls}`, style: { left: lp(x - (fw * k) / 2), top: lp(y - (fh * k) / 2), width: lp(fw * k), height: lp(fh * k), '--n': n, '--to': `${(-(n - 1) / n) * 100}%`, ...(o.style ?? {}) } });
  el.appendChild(c);
  return el;
}

/** Rising bubbles inside a vessel: `n` bubbles between x0..x1 from yBot up to yTop. */
function bubbles(A, n, x0, x1, yBot, yTop, start = 0, speed = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = A.bubbles[i % 3 === 2 ? 2 : Math.random() < 0.5 ? 0 : 1];
    const x = x0 + Math.random() * (x1 - x0);
    const d = (0.9 + Math.random() * 0.8) / speed;
    out.push(sprite(b, Math.round(x), yBot, 'ld-bub', { style: { '--rise': lp(yTop - yBot), '--wx': lp((Math.random() - 0.5) * 3), animationDuration: `${d}s`, animationDelay: `${start + Math.random() * d}s` } }));
  }
  return out;
}
/** Sparks spitting from a point, fading in at `start` s. */
function sparks(A, n, x, y, start, spread = 18) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const d = spread * (0.5 + Math.random() * 0.7);
    out.push(sprite(A.sparks[i % 3], x - 3, y - 3, 'ld-spk', { style: { '--dx': lp(Math.cos(a) * d), '--dy': lp(Math.sin(a) * d), '--fall': lp(6 + Math.random() * 8), animationDuration: `${0.45 + Math.random() * 0.4}s`, animationDelay: `${start + Math.random() * 1.2}s` } }));
  }
  return out;
}
/** Smoke puffs rising from a point. */
function smoke(A, n, x, y, start, src, rise = 30, cls = '') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = 1.4 + Math.random() * 0.8;
    out.push(strip(src, 6, x + (Math.random() - 0.5) * 4, y, `ld-smk ${cls}`, { style: { '--rise': lp(-rise - Math.random() * 10), '--wx': lp((Math.random() - 0.5) * 14), '--d': `${d}s`, '--dl': `${start + (i / n) * d}s` } }));
  }
  return out;
}
/** A vessel whose liquid crossfades through its colours (stacked canvases). */
function colourVessel(srcs, hot, x, y, cls, period) {
  const el = h('div', { class: `ld-sp ld-vessel ${cls}`, style: { left: lp(x), top: lp(y), width: lp(srcs[0].width), height: lp(srcs[0].height), '--per': `${period}s` } });
  srcs.forEach((s, i) => { const c = Art.copyOf(s); c.className = `lq lq${i}`; c.style.width = lp(s.width); c.style.height = lp(s.height); el.appendChild(c); });
  const hc = Art.copyOf(hot); hc.className = 'lq hot'; hc.style.width = lp(hot.width); hc.style.height = lp(hot.height);
  el.appendChild(hc);
  return el;
}

/**
 * Show the loading screen for a scene change. Returns { done() } — call done()
 * once the scene is built: the experiment goes critical and explodes, then the
 * smoke clears onto the new scene. done() resolves as the smoke starts to clear.
 */
export function showLoading(name, params = {}) {
  const app = document.getElementById('app');
  const dst = destination(name, params);
  genKeyframes();
  const A = getArt();
  const el = h('div', { class: 'ld lab', style: { '--ac': dst.ac } });

  // ---- the stage
  const stage = h('div', { class: 'ld-stage' });
  const quake = h('div', { class: 'ld-quake', style: { animation: shakeAnim(3) } });
  stage.appendChild(quake);
  const add = (...els) => { for (const e of els.flat()) if (e) quake.appendChild(e); };
  add(sprite(A.wall, 0, 0, 'ld-wall', { raw: false }));
  // pressure dial (top left), piped into the big flask
  const needle = sprite(A.needle, 3, 0, 'ld-needle');
  const gauge = h('div', { class: 'ld-gauge', style: { left: lp(3), top: lp(0), width: lp(28), height: lp(28), animation: shakeAnim(1) } },
    sprite(A.gauge, 0, 0), needle);
  add(gauge);
  // the Commander (pose frames arrive a moment later from the 3D chibi)
  const cmdFrames = { stir1: null, stir2: null, nervous: null, panic: null, soot: null };
  const cmd = h('div', { class: 'ld-cmd', style: { left: lp(34), top: lp(-1), width: lp(60), height: lp(66) } });
  const cmdIn = h('div', { class: 'ld-cmd-in', style: { animation: shakeAnim(2) } });
  for (const k of Object.keys(cmdFrames)) { const c = document.createElement('canvas'); c.width = 60; c.height = 66; c.className = `fr fr-${k}`; cmdFrames[k] = c; cmdIn.appendChild(c); }
  cmd.appendChild(cmdIn);
  add(cmd);
  // bench
  add(sprite(A.bench, 0, BENCH, 'ld-bench'));
  // sign on the cabinet: DAYS SINCE LAST EXPLOSION
  add(h('div', { class: 'ld-sign', style: { left: lp(6), top: lp(BENCH + 8), width: lp(34), height: lp(18) } }, sprite(A.sign, 0, 0),
    h('span', { class: 'ld-sign-t', style: { left: lp(2.5), top: lp(5.5), width: lp(20), fontSize: lp(3.3) } }, 'DAYS SINCE LAST EXPLOSION'),
    h('span', { class: 'ld-sign-n', style: { left: lp(22), top: lp(7.5), width: lp(10), height: lp(10), fontSize: lp(8.5) } }, h('b', { class: 'n1' }, '1'), h('b', { class: 'n0' }, '0'))));

  // round-bottom flask over the burner (right)
  add(sprite(A.stand, 97, BENCH - 40, 'ld-stand'));
  const flame = strip(A.flame, 4, 114, BENCH - 15, 'ld-flame');
  add(sprite(A.burner, 107, BENCH - 14, 'ld-burner'), flame);
  const round = colourVessel(A.round, A.roundHot, 101, BENCH - 48, 'v-round', 2.6);
  round.style.animation = shakeAnim(1);
  add(round, sprite(A.stopper, 108, BENCH - 51, 'ld-stopper s-round'));
  // big Erlenmeyer (left), feeding the dial
  const erlen = colourVessel(A.erlen, A.erlenHot, 4, BENCH - 35, 'v-erlen', 3.4);
  erlen.style.animation = shakeAnim(0);
  add(erlen, sprite(A.stopper, 11, BENCH - 37, 'ld-stopper s-erlen'));
  // test tube rack
  const rack = h('div', { class: 'ld-rack', style: { left: lp(31), top: lp(BENCH - 19), width: lp(20), height: lp(20), animation: shakeAnim(2) } });
  A.tubes.forEach((t, i) => rack.appendChild(sprite(t, 1 + i * 6, 0)));
  rack.appendChild(h('i', { class: 'ld-rackbar' }));
  add(rack);
  // the beaker the Commander is stirring (centre front)
  const beaker = colourVessel(A.beaker, A.beakerHot, 53, BENCH - 21, 'v-beaker', 2.1);
  const stirRod = sprite(A.rod, 66, BENCH - 37, 'ld-rod');
  beaker.style.animation = shakeAnim(2);
  add(stirRod, beaker);

  // bubbles, steam, sparks and smoke, each fading in at its instability level
  const fxA = h('div', { class: 'ld-fx lv0' }), fxB = h('div', { class: 'ld-fx lv1' }), fxC = h('div', { class: 'ld-fx lv2' }), fxD = h('div', { class: 'ld-fx lv3' });
  fxA.append(...bubbles(A, 6, 9, 24, BENCH - 8, BENCH - 33, 0), ...bubbles(A, 4, 57, 70, BENCH - 5, BENCH - 22, 0, 1.2), ...bubbles(A, 5, 106, 117, BENCH - 22, BENCH - 46, 0, 1.4));
  fxB.append(...bubbles(A, 6, 9, 24, BENCH - 8, BENCH - 44, 0, 1.5), ...smoke(A, 3, 113, BENCH - 52, 0, A.puff, 26), ...sparks(A, 5, 113, BENCH - 50, 0, 14));
  fxC.append(...bubbles(A, 6, 56, 72, BENCH - 6, BENCH - 30, 0, 1.8), ...smoke(A, 3, 18, BENCH - 37, 0, A.puffGreen, 30), ...sparks(A, 6, 18, BENCH - 38, 0, 18), ...sparks(A, 6, 113, BENCH - 50, 0.3, 22));
  fxD.append(...smoke(A, 4, 64, BENCH - 24, 0, A.puff, 34), ...sparks(A, 8, 64, BENCH - 22, 0, 26), ...bubbles(A, 8, 104, 119, BENCH - 22, BENCH - 60, 0, 2.2), ...smoke(A, 3, 113, BENCH - 52, 0.4, A.puffGreen, 34));
  add(fxA, fxB, fxC, fxD);

  // ---- the explosion (hidden until done())
  const boom = h('div', { class: 'ld-boom' });
  boom.append(
    strip(A.blast, 8, 64, BENCH - 22, 'ld-blast b1', { scale: 1.6 }),
    strip(A.blast, 8, 18, BENCH - 22, 'ld-blast b2', { scale: 1.1 }),
    strip(A.blast, 8, 112, BENCH - 32, 'ld-blast b3', { scale: 1.2 }),
  );
  // remains on the bench
  const remains = h('div', { class: 'ld-remains' },
    sprite(A.brokenErlen, 4, BENCH - 35), sprite(A.brokenBeaker, 53, BENCH - 21), sprite(A.brokenRound, 101, BENCH - 48));
  // debris + sparks thrown out of the blast
  const deb = h('div', { class: 'ld-debris' });
  for (let i = 0; i < 14; i++) {
    const s = A.debris[i % A.debris.length];
    const ox = [18, 64, 112][i % 3] + (Math.random() - 0.5) * 16, oy = BENCH - 18 - Math.random() * 18;
    const dir = ox < 64 ? -1 : ox > 64 ? 1 : Math.random() < 0.5 ? -1 : 1;
    const big = i % 6 === 0;
    const d = h('div', { class: `ld-deb ${big ? 'big' : ''}`, style: { left: lp(ox), top: lp(oy), '--dx': lp(dir * (14 + Math.random() * 50)), '--up': lp(-(12 + Math.random() * 26)), '--down': lp(30 + Math.random() * 50), '--rot': `${(Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 400)}deg`, '--d': `${0.6 + Math.random() * 0.3}s`, '--dl': `${Math.random() * 0.08}s` } });
    const c = Art.copyOf(s); c.style.width = lp(s.width); c.style.height = lp(s.height);
    d.appendChild(h('i', {}, c));
    deb.appendChild(d);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3, r = 22 + Math.random() * 30;
    deb.appendChild(sprite(A.sparks[i % 3], 61, BENCH - 25, 'ld-bspk', { style: { '--dx': lp(Math.cos(a) * r), '--dy': lp(Math.sin(a) * r * 0.7), animationDelay: `${Math.random() * 0.1}s` } }));
  }
  // soot smoke rolling off the bench and the Commander's head
  const after = h('div', { class: 'ld-after' }, ...smoke(A, 6, 64, BENCH - 10, 0.15, A.puffDark, 40, 'big'), ...smoke(A, 3, 64, 6, 0.4, A.puff, 18));
  add(remains, boom, deb, after);

  // ---- the frame around it
  const cap = h('div', { class: 'ld-caps' });
  CAPTIONS.forEach((set, i) => cap.appendChild(h('span', { class: 'c', style: { '--i': i } }, ((t) => (i < CAPTIONS.length - 1 && !/[.!?]$/.test(t) ? t + '...' : t))(pick1(set)))));
  cap.appendChild(h('span', { class: 'c crit' }, "UH OH. IT'S GONNA BLOW!"));
  cap.appendChild(h('span', { class: 'c ok' }, 'Experiment... successful?'));
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  el.append(
    h('div', { class: 'ld-bg' }),
    h('div', { class: 'ld-shake' },
      h('div', { class: 'ld-main' },
        h('div', { class: 'ld-head' }, cineLogo({ small: true, tag: false })),
        h('div', { class: 'ld-stagebox' }, stage, h('div', { class: 'ld-cam' }, h('i'), 'LAB CAM 01 ', h('b', {}, 'REC')), h('div', { class: 'ld-kaboom' }, 'KA-BOOM!')),
        h('div', { class: 'ld-side' },
          cap,
          h('div', { class: 'ld-foot' },
            h('div', { class: 'ld-dest' }, h('span', { class: 'k' }, dst.k), dst.n ? h('span', { class: 'n' }, dst.n) : null),
            h('div', { class: 'ld-gaugebar' }, h('b', {}, 'PRESSURE'), h('div', { class: 'ld-bar' }, h('i'), h('i', { class: 'hot' }), h('em'))),
            h('div', { class: 'ld-tip' }, h('b', {}, 'TIP'), h('span', { html: rich(tip) })))))),
    h('div', { class: 'ld-alarm' }),
    h('div', { class: 'ld-flash' }),
    h('div', { class: 'ld-clear' }, ...CLOUDS.map(([x, y], i) => {
      const c = Art.copyOf(i % 3 === 1 ? A.cloud2 : A.cloud);
      c.className = 'strip';
      return h('div', { class: 'ld-cloud', style: { '--i': i, '--x': `${x}%`, '--y': `${y}%`, '--s': (0.65 + ((i * 37) % 10) / 18).toFixed(2) } }, c);
    })),
  );
  app.appendChild(el);
  void el.offsetWidth;
  el.classList.add('in');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('run')));

  // the Commander's pose frames (3D chibi -> pixel sprites), just after the first paint
  let alive = true;
  setTimeout(() => {
    Art.commanderFrames().then((fr) => {
      if (!fr || !alive) return;
      for (const [k, c] of Object.entries(cmdFrames)) if (fr[k]) c.getContext('2d').drawImage(fr[k], 0, 0);
      cmd.classList.add('ready');
    });
  }, 16);
  // a little bubbling sound while it brews (timers simply pause while the build blocks)
  let bub = 0;
  const bubT = setInterval(() => { if (++bub < 40) audio.play('bubble', { vol: 0.35 }); }, 520);

  let finished = false;
  return {
    el,
    done() {
      if (finished) return Promise.resolve();
      finished = true;
      clearInterval(bubT);
      el.classList.add('crit');
      audio.play('rattle', { vol: 0.6 });
      return new Promise((res) => {
        // let the new scene render (and compile) a couple of frames under the card first
        let n = 0;
        const step = () => {
          if (++n < 3) { requestAnimationFrame(step); return; }
          // a short pop, not a long demolition: crit 0.18 s, boom 0.6 s, then the smoke clears
          setTimeout(() => {
            el.classList.add('boom');
            audio.play('explode', { vol: 0.7 });
            setTimeout(() => audio.play('shatter', { vol: 0.6 }), 60);
            setTimeout(() => {
              el.classList.add('out');
              setTimeout(res, 120);
              setTimeout(() => { alive = false; el.remove(); }, 1000);
            }, 600);
          }, 180);
        };
        requestAnimationFrame(step);
      });
    },
  };
}

/** Warm the Commander pose frames when the main thread is idle, so the next loading screen has them at once. */
export function prewarmLoading() {
  const run = () => { try { getArt(); Art.commanderFrames(); } catch (e) { /* ignore */ } };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
