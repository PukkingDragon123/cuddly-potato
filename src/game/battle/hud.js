// Battle HUD (DOM): a Clash Royale card cycle in a Battle Cats control dock.
//   top    - one slim tug-of-war bar: your (blue) and the rival's (red) base
//            HP meet at a crackling seam that slides toward whoever is losing,
//            names + trophies at the ends, a compact clock with 2x / overtime
//            tags, a WINNING / LOSING lean chip, hit flashes + shakes, a tiny
//            lane strip (camera window, tap / drag to pan) and pause
//   dock   - Battle Cats layout: the big BASE UPGRADE button ("Worker Cat":
//            a 3D model of the next base tier, its cost and a fill bar) on
//            the left, the POWER wallet ("12/30" + a fill bar that ticks up)
//            in the middle, the Commander ULTIMATE ("Cat Cannon": a 3D render
//            in a charging energy ring) on the right, and the hand of 4 cards
//            (up to 6 with DRAW specials) with the NEXT card underneath. The
//            MEGA ultimate, skills and emotes float just above the dock.
// Cards lift, flash and fly to where they deploy, the NEXT card slides into
// the empty slot, drawn cards fan in from the deck and ultimates play a short
// cut-in (3D render, speed lines, name slam). Input on cards is forwarded to
// the battle scene (tap/drag to deploy).
import * as THREE from 'three';
import './battle.css';
import './lineup.css';
import { h, icon, iconURL, button, bigBanner, speech, sparkle, bump, burst, $overlay } from '../../ui/ui.js';
import { cardEl } from '../../ui/cards.js';
import { rankMedal } from '../../ui/rankMedal.js';
import { charPortrait, cardArtImg, swarmThumb, baseSpin } from '../../ui/thumbs.js';
import { cardDef } from '../../data/cards.js';
import { SPELLS } from '../../data/spells.js';
import { BASE_UPGRADES, MEGA } from '../../data/labs.js';
import { MEGAS } from '../../data/megas.js';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { FIELD } from './field.js';
import { plateBounds } from './view.js';
import { HAND_MAX } from './sim.js';
import { LiveChibi } from './liveChibi.js';
import { sigColor } from './sigFx.js';

const fmtT = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const RARITY_COL = { common: '#9fb4e8', rare: '#ff9a2e', epic: '#c063ff', legendary: '#3ff2c8', mythic: '#ff2e88' };
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const _v = new THREE.Vector3();

// Emotes: the Commander acts each one out (wind-up pose + bar, then the big
// reaction with a mood, a voxel emote over its head and themed particles).
// Indices 0-5 are stable (friend battles + AI replies send them).
export const EMOTES = [
  { icon: 'smile', text: 'Good luck!', color: '#3fb8ff', wind: 'crossArms', windMood: 'cool', act: 'thumbsUp', mood: 'confident', vox: 'sparkle', fx: 'sparkle', dur: 1.5 },
  { icon: 'heart', text: 'Thanks!', color: '#ff5aa8', wind: 'bow', windMood: 'happy', act: 'love', mood: 'love', vox: 'heart', fx: 'hearts', dur: 1.7 },
  { icon: 'star', text: 'Well played!', color: '#ffd84a', wind: 'think', windMood: 'think', act: 'clap', mood: 'excited', vox: 'star', fx: 'confetti', dur: 1.6 },
  { icon: 'alert', text: 'Oops!', color: '#8fd4ff', wind: 'shocked', windMood: 'shock', act: 'facepalm', mood: 'embarrassed', vox: 'sweat', fx: 'sweat', dur: 1.6 },
  { icon: 'fire', text: 'WOW!', color: '#ff8a2a', wind: 'nervous', windMood: 'surprised', act: 'celebrate', mood: 'excited', vox: '!!', fx: 'fire', dur: 1.7 },
  { icon: 'skull', text: 'Grrr!', color: '#ff3d55', wind: 'angry', windMood: 'angry', act: 'rage', mood: 'rage', vox: 'anger', fx: 'steam', dur: 1.5 },
  { icon: 'crown', text: 'Too easy!', color: '#c08aff', wind: 'yawn', windMood: 'yawn', act: 'taunt', mood: 'tease', vox: 'note', fx: 'sparkle', dur: 1.6 },
  { icon: 'megaphone', text: "LET'S GO!", color: '#7cff3a', wind: 'stretch', windMood: 'focus', act: 'fistPump', mood: 'determined', vox: '!', fx: 'bolt', dur: 1.5 },
];
const EMOTE_WIND = 0.75;
// reaction stings, by EMOTES index (src/core/audio.js: recorded CC0 clips)
const EMOTE_SFX = ['emGoodLuck', 'emThanks', 'emWellPlayed', 'emOops', 'emWow', 'emGrr', 'emEasy', 'emLetsGo'];
const EMOTE_CD = 4.5;

/**
 * Juicy press feedback for a HUD button: squash on press (the `scale`
 * property, so it composes with any `transform` pulse already running),
 * elastic overshoot on release.
 */
let pfxGlobal = false;
function pfxUp(el) {
  if (!el.classList.contains('prs')) return;
  el.classList.remove('prs');
  el.classList.remove('rel');
  void el.offsetWidth;
  el.classList.add('rel');
}
export function pressFx(el) {
  if (!pfxGlobal && typeof document !== 'undefined') {
    // a press that ends elsewhere (pointer captured by a drag, finger slid off) still springs back
    pfxGlobal = true;
    const release = () => { for (const p of document.querySelectorAll('.pfx.prs')) pfxUp(p); };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
  }
  const down = () => { el.classList.remove('rel'); el.classList.add('prs'); };
  const up = () => pfxUp(el);
  el.classList.add('pfx');
  el.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, up);
  el.addEventListener('animationend', (e) => { if (e.animationName === 'pfxRel') el.classList.remove('rel'); });
  return el;
}

// --------------------------------------------------------------------------- pixel ULT frame
// The ultimate buttons are framed by a hand-built pixel-art containment bezel
// (a stepped octagon, never a CSS circle): 24 charge cells run clockwise from
// the top, lit in the ultimate's colour with a bright tip, chasing white when
// ready; a top-left lit / bottom-right shaded steel rim with rivets + ink lines.
const FN = 44, ULT_CELLS = 24;
const hexRgb = (hex) => { const v = parseInt(String(hex).trim().replace('#', ''), 16) || 0xffd84a; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const octR = (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) / 1.32);
export function drawUltFrame(cv, k, color, state = 'charging', phase = 0) {
  const c = cv.getContext('2d');
  const img = c.createImageData(FN, FN), d = img.data;
  const uc = hexRgb(color), ink = [18, 12, 36], off = state === 'none' || state === 'used' ? [44, 48, 80] : [27, 33, 96];
  const steel = [58, 68, 150], white = [255, 255, 255];
  const lit = state === 'ready' ? ULT_CELLS : Math.floor(Math.min(1, k) * ULT_CELLS + 1e-4);
  const C = (FN - 1) / 2;
  for (let y = 0; y < FN; y++) for (let x = 0; x < FN; x++) {
    const dx = x - C, dy = y - C, r = octR(dx, dy);
    if (r > 21.6 || r < 15.4) continue;
    let col;
    if (r > 20.4 || r < 16.6) col = ink;
    else {
      const t = (r - 16.6) / 3.8; // 0 inner .. 1 outer
      const lightK = (-dx - dy) / (2 * 21.6); // top-left lit
      let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2;
      const u = (a / (Math.PI * 2)) * ULT_CELLS, cell = Math.floor(u), fu = u - cell;
      if (t > 0.78) col = mixRgb(steel, lightK > 0 ? white : ink, Math.abs(lightK) * 0.9); // outer steel rim
      else if (fu < 0.16) col = [10, 12, 42]; // cell divider
      else if (cell < lit) {
        col = mixRgb(uc, t > 0.45 ? white : [0, 0, 0], t > 0.45 ? 0.3 : 0.22);
        if (state === 'ready' && (cell + phase) % 3 === 0) col = mixRgb(col, white, 0.65);
        if (state !== 'ready' && cell === lit - 1 && phase) col = mixRgb(col, white, 0.55);
      } else col = mixRgb(off, t > 0.45 ? [80, 90, 170] : off, 0.35);
    }
    const i = (y * FN + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // rivets on the eight facets
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.round(C + Math.sin(a) * 19.6 * 0.93), y = Math.round(C - Math.cos(a) * 19.6 * 0.93);
    for (const [ox, oy, v] of [[0, 0, 235], [1, 0, 150], [0, 1, 150], [1, 1, 90]]) { const i = ((y + oy) * FN + x + ox) * 4; d[i] = d[i + 1] = v; d[i + 2] = Math.min(255, v + 20); d[i + 3] = 255; }
  }
  c.putImageData(img, 0, 0);
}
const ultFrameCanvas = () => h('canvas', { class: 'u-frame', width: FN, height: FN });

/** A dithered pixel-art contact shadow (octagonal, Bayer-thinned edge) as a data URL. */
let _shadowURL = null;
function pixelShadowURL() {
  if (_shadowURL) return _shadowURL;
  const W = 40, H = 12, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = Math.abs((x + 0.5 - W / 2) / (W / 2)), dy = Math.abs((y + 0.5 - H / 2) / (H / 2));
    const d = Math.max(dx, dy, (dx + dy) / 1.3);
    if (d > 1) continue;
    const dens = d < 0.5 ? 1 : 1 - (d - 0.5) / 0.5;
    if (B[(y & 3) * 4 + (x & 3)] / 16 >= dens) continue;
    g.fillStyle = d < 0.5 ? 'rgba(4,2,20,0.62)' : 'rgba(4,2,20,0.45)';
    g.fillRect(x, y, 1, 1);
  }
  return (_shadowURL = c.toDataURL());
}

/** Burst (ring + rays + sparks) at a screen point. */
function burstAt(x, y, o = {}) {
  const el = h('div', { style: { position: 'absolute', left: x - 20 + 'px', top: y - 20 + 'px', width: '40px', height: '40px', pointerEvents: 'none' } });
  $overlay().appendChild(el);
  burst(el, { ring: false, ...o });
  setTimeout(() => el.remove(), 50);
}

/**
 * Ultimate cut-in: a full-width band slams across the screen with speed lines,
 * the character's 3D render sliding in, a flash and the ability name. ~1.2s,
 * purely visual (never blocks the sim).
 */
export function ultCutIn({ img, title, kicker = 'ULTIMATE', sub = '', color = '#ffd84a', side = 0, dur = 1.25 }) {
  const wrap = h('div', { class: `ult-cut s${side}`, style: { '--uc': color } },
    h('div', { class: 'uc-flash' }),
    h('div', { class: 'uc-band' },
      h('div', { class: 'uc-lines' }),
      h('div', { class: 'uc-lines b' }),
      img ? h('img', { class: 'uc-hero', src: img, alt: '' }) : null,
      h('div', { class: 'uc-txt' },
        h('small', {}, kicker),
        h('b', {}, title),
        sub ? h('em', {}, sub) : null)));
  wrap.style.setProperty('--dur', dur + 's');
  $overlay().appendChild(wrap);
  if (side === 0) audio.play('whoosh', { pitch: 0.7 });
  setTimeout(() => { engine.shake(side === 0 ? 0.35 : 0.2); audio.play('thud', { pitch: 0.9 }); }, 260);
  setTimeout(() => wrap.remove(), dur * 1000 + 80);
  return wrap;
}

export class BattleHUD {
  /**
   * handlers: { press(slot, event), signature(), skill(k), overclock(), mega(), pause(), emote(i), minimap(x) }
   */
  constructor(sim, view, cfg, handlers) {
    this.sim = sim;
    this.view = view;
    this.cfg = cfg;
    this.hd = handlers;
    this.sel = -1;
    const s0 = sim.sides[0];
    const root = (this.root = h('div', { class: 'bhud' }));
    // pixel-art sprites used by the CSS (cost gems, seam spark)
    root.style.setProperty('--ic-energy', `url(${iconURL('energy')})`);
    root.style.setProperty('--ic-spark', `url(${iconURL('spark4')})`);

    // ------------------------------------------------------------ top: tug-of-war bar
    const end = (i) => {
      const c = cfg.sides[i];
      const nm = h('span', { class: `tw-nm s${i}` },
        c.labLevel ? rankMedal(c.labLevel, { cls: 'tw-rank', shine: false }) : null,
        h('b', {}, c.name ?? (i ? 'Rival' : 'You')),
        c.trophies !== undefined ? h('i', { class: 'tr' }, icon('trophy'), String(c.trophies)) : null);
      const pc = h('b', { class: 'pc' }, '100');
      const tier = h('i', { class: 'tn' }, '1');
      const cap = h('div', { class: `tw-cap s${i}` }, icon('lab'), tier, pc);
      const fill = h('i', { class: `tw-f s${i}` });
      return { nm, cap, pc, tier, fill, lastHp: -1, lastTier: -1, frac: 1 };
    };
    this.sides = [end(0), end(1)];
    this.twGhost = h('i', { class: 'tw-ghost' });
    this.twSeam = h('i', { class: 'tw-seam' }, h('i', { class: 'sp' }), h('i', { class: 'chev' }));
    this.twTrack = h('div', { class: 'tw-track' }, this.sides[0].fill, this.sides[1].fill, this.twGhost, h('i', { class: 'tw-mid' }), this.twSeam);
    this.twLean = h('div', { class: 'tw-lean' }, '');
    this.twLaneWin = h('i', { class: 'win' });
    this.twLane = h('div', { class: 'tw-lane' }, this.twLaneWin);
    this.twBar = h('div', { class: 'tw-bar hit' }, this.sides[0].cap, this.twTrack, this.sides[1].cap);
    this.tm = h('b', { class: 'tm' }, fmtT(sim.timeLeft));
    this.tag = h('i', { class: 'tag hidden' }, '2x');
    this.timer = h('div', { class: 'tw-clock' }, icon('clock'), this.tm, this.tag);
    this.top = h('div', { class: 'tw' },
      h('div', { class: 'tw-row' }, this.sides[0].nm, this.timer, this.sides[1].nm),
      this.twBar, this.twLane, this.twLean);
    root.appendChild(this.top);
    this.split = 0.5;
    this.ghostSplit = 0.5;
    this.dots = [];
    // tap / drag the bar (or the lane strip under it) to pan the camera
    const lanePick = (e) => {
      const r = this.twTrack.getBoundingClientRect();
      const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      handlers.minimap?.((k * 2 - 1) * FIELD.VIEW_X);
    };
    for (const el of [this.twBar, this.twLane]) {
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.setPointerCapture?.(e.pointerId); lanePick(e); });
      el.addEventListener('pointermove', (e) => { if (e.buttons) lanePick(e); });
    }
    this.twLane.classList.add('hit');
    this.mini = this.top; // kept for older callers (plate bounds)
    const pause = button('', () => handlers.pause(), 'gray sm icon-only bh-pause', { icon: 'pause' });
    root.appendChild(pause);

    // ------------------------------------------------------------ dock
    // Commander ULTIMATE (signature): 3D portrait in a charging energy ring
    const cmd = cfg.sides[0].commander;
    this.sig = null;
    this.skillEls = [];
    if (s0.cmd) {
      const sg = s0.cmd.signature;
      this.sigCol = sigColor(sg);
      // a LIVE 3D Commander (falls back to a static portrait if WebGL thumbs fail)
      try { this.live = new LiveChibi(cmd, { size: 256, color: this.sigCol }); } catch (e) { console.warn('live chibi failed', e); this.live = null; }
      this.sigImg = this.live ? null : charPortrait(cmd.char ?? cmd.id, { override: cmd.override, size: 128, eyes: 'determined', mouth: 'grin' });
      const u = this.makeUlt('sig', this.live?.canvas ?? this.sigImg, sg.name, this.sigCol, sg.icon ?? 'star');
      this.sig = u.el;
      this.sigU = u;
      this.sig.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        audio.unlock();
        const ready = this.sim.sides[0].sig >= 1 && !this.sim.over;
        if (!ready) { this.live?.poke(); this.showUltTip(true); }
        handlers.signature();
      });
      this.skillEls = s0.skills.map((sk, k) => {
        const cdv = h('div', { class: 'cdv' });
        const cdn = h('div', { class: 'cdn' }, '');
        const el = pressFx(h('div', { class: 'bh-skill hit', title: sk.name }, icon(sk.icon ?? 'star'), cdv, cdn));
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); handlers.skill(k); });
        return { el, cdv, cdn, sk };
      });
    }
    // MEGA ultimate: the figure's 3D render in a containment ring
    this.megaEl = null;
    if (s0.mega) {
      const def = MEGAS[s0.mega.id];
      this.megaImg = swarmThumb(s0.mega.id, s0.mega.variant ?? 'base', null, 192);
      const u = this.makeUlt('mega', this.megaImg, def?.name ?? 'MEGA', def?.bolt ?? '#ff2e88', 'mega');
      this.megaU = u;
      this.megaEl = u.el;
      this.megaEl.style.setProperty('--mc', def?.color ?? '#ff2e88');
      this.megaLock = h('div', { class: 'lockt' }, icon('lock'), h('span', {}, BASE_UPGRADES[MEGA.minTier - 1].name));
      this.megaEl.appendChild(this.megaLock);
      this.megaEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        audio.unlock();
        if (this.sim.canMega(0)) handlers.mega?.();
        else this.megaDeny();
      });
    } else if (!cfg.sides[0].noMegaTeaser) {
      // no MEGA yet: a locked teaser pointing at the Trophy Road
      const nf = ultFrameCanvas();
      drawUltFrame(nf, 0, '#6a74a8', 'none');
      this.megaEl = pressFx(h('div', { class: 'bh-ult mega none hit', title: 'MEGA' },
        nf,
        h('div', { class: 'u-core' }, icon('mega')),
        h('div', { class: 'lockt' }, icon('lock'), h('span', {}, icon('trophy'), '300')),
        h('div', { class: 'u-pct' }, 'MEGA')));
      this.megaEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.hint('Win a MEGA-TECH figure on the Trophy Road at 300 trophies!');
        audio.play('deny');
      });
    }

    // BASE UPGRADE (Battle Cats "Worker Cat"): 3D model of the next tier
    this.ocModel = h('img', { class: 'bb-model', alt: '' });
    this.ocTier = h('div', { class: 'bb-lv' }, 'LV 1');
    this.ocV = h('b', { class: 'bb-name' }, '');
    this.ocC = h('b', {}, '');
    this.ocFill = h('i');
    // no panel: the next tier's 3D model floats and turns over the dock on a pixel contact shadow,
    // with a slim name / cost / fill readout under it
    this.ocBtn = pressFx(h('div', { class: 'bh-basebtn hit', title: 'Upgrade your base (or tap it!)' },
      h('div', { class: 'bb-rays' }),
      h('div', { class: 'bb-stage' }, h('i', { class: 'bb-shadow', style: { backgroundImage: `url(${pixelShadowURL()})` } }), h('div', { class: 'bb-float' }, this.ocModel)),
      h('div', { class: 'bb-info' },
        h('div', { class: 'bb-txt' }, this.ocTier, h('small', {}, icon('up')), this.ocV),
        h('div', { class: 'bb-meter' }, h('div', { class: 'bb-fill' }, this.ocFill), h('div', { class: 'bb-cost' }, icon('power'), this.ocC)))));
    this.ocBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); handlers.overclock(); });
    this.modelTier = 0;
    this.spinFrames = null;

    // POWER wallet: big rolling counter + a fill bar with one tick per point
    this.pwrNow = h('b', { class: 'pw-now' }, '0');
    this.pwrMax = h('span', { class: 'pw-max' }, '/12');
    this.pwrFill = h('i', { class: 'pw-f' });
    this.pwrMark = h('i', { class: 'pw-mark' }, icon('up'));
    this.rate = h('span', { class: 'pw-rate' }, '');
    this.ebar = h('div', { class: 'pw-bar' }, this.pwrFill, h('i', { class: 'pw-ticks' }), this.pwrMark);
    this.energyRow = h('div', { class: 'bh-wallet' },
      h('div', { class: 'pw-num' }, h('img', { class: 'pw-ic', src: iconURL('power'), alt: '' }), this.pwrNow, this.pwrMax, this.rate),
      this.ebar);

    // the hand: 4 cards (up to 6 after a DRAW) + the NEXT card
    this.slots = Array.from({ length: HAND_MAX }, (_, i) => {
      const slot = { el: pressFx(h('div', { class: 'bh-slot empty gone', 'data-slot': String(i) })), key: undefined, card: null, ready: null };
      slot.el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        audio.unlock();
        // read through this.slots: Rollup's tree-shaking otherwise folds the
        // literal `card: null` and drops this call from the production build
        if (this.slots[i]?.card) handlers.press(i, e);
      });
      return slot;
    });
    this.nextEl = h('div', { class: 'bh-nextc' });
    this.nextWrap = h('div', { class: 'bh-nextw' }, h('div', { class: 'lbl' }, 'NEXT'), this.nextEl);
    this.cardsEl = h('div', { class: 'bh-cards' }, this.slots.map((s) => s.el));
    this.lineup = h('div', { class: 'bh-handrow' }, this.nextWrap, this.cardsEl);
    this.echoTag = h('div', { class: 'bh-echo hidden' }, icon('swords'), h('b', {}, 'ECHO'));
    this.lineup.appendChild(this.echoTag);

    // floating controls above the dock: skills + emote (left), MEGA (right)
    // EMOTE: a Beast emblem button with a cooldown shutter
    this.emoteCd = h('i', { class: 'cd' });
    this.emoteBtn = pressFx(h('div', { class: 'bh-emote hit', title: 'Emotes' }, h('img', { class: 'logo', src: iconURL('beastLogo'), alt: '' }), this.emoteCd));
    this.emoteBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); });
    this.emoteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.emoteCdT > 0) { bump(this.emoteBtn, 'shake'); audio.play('deny'); return; }
      audio.play('click');
      this.toggleEmotes();
    });
    this.emoteCdT = 0;
    this.floatL = h('div', { class: 'bh-floatl' }, this.emoteBtn, this.skillEls.map((s) => s.el));
    this.floatR = h('div', { class: 'bh-floatr' });
    this.cmdEl = this.floatL; // kept for older callers (isOverField)
    this.rightEl = this.floatR;
    this.ults = h('div', { class: 'bh-ults' }, this.sig ?? null);
    this.mid = h('div', { class: 'bh-mid' }, this.energyRow, this.lineup);
    this.deck = h('div', { class: 'bh-dock' }, this.ocBtn, this.mid, this.ults);
    root.appendChild(h('div', { class: 'bh-bottom' }, h('div', { class: 'bh-float' }, this.floatL, this.floatR), this.deck));
    this.placeMega();
    this.refreshHand(true);
    this.lastE = -1;
    this.shownE = -1;
    this.ticked = -1;
    // render the base models after the intro has started (they are cached)
    setTimeout(() => this.updateBaseModel(true), 300);
  }

  mount(parent) {
    parent.appendChild(this.root);
  }

  /** An ultimate button: 3D render in a charging ring with liquid + electric arcs. */
  makeUlt(kind, img, name, color, ic) {
    const frame = ultFrameCanvas();
    drawUltFrame(frame, 0, color);
    const liq = h('div', { class: 'u-liq' }, h('i', { class: 'bub' }), h('i', { class: 'bub' }), h('i', { class: 'bub' }));
    const pct = h('div', { class: 'u-pct' }, '0%');
    const el = pressFx(h('div', { class: `bh-ult ${kind}${img instanceof Node ? ' live' : ''} hit`, title: name, style: { '--uc': color } },
      h('div', { class: 'u-rays' }),
      frame,
      h('div', { class: 'u-core' }, liq, h('i', { class: 'u-arc a1' }), h('i', { class: 'u-arc a2' }), h('i', { class: 'u-arc a3' })),
      // the 3D character pops OUT of the octagon: clipped to the window below the frame's waist line,
      // free (in front of the bezel) above it
      img instanceof Node ? (img.classList.add('u-model', 'u-pop'), img) : h('img', { class: 'u-model u-pop', src: img, alt: '' }),
      h('div', { class: 'u-tag' }, icon(ic), kind === 'mega' ? 'MEGA' : 'ULT'),
      pct));
    return { el, liq, pct, frame, color, fkey: '' };
  }

  /** The MEGA sits in the dock in landscape, floats above it in portrait. */
  placeMega() {
    const land = document.body.classList.contains('landscape');
    if (land === this.landLayout) return;
    this.landLayout = land;
    this.root.classList.toggle('land', land);
    if (!this.megaEl) return;
    if (land) this.ults.insertBefore(this.megaEl, this.ults.firstChild);
    else this.floatR.appendChild(this.megaEl);
  }

  /**
   * Keep pixel art true: the ULT / MEGA octagon bezels (FN-cell canvases) get a
   * size that is a whole number of device pixels per cell (no uneven, smeared
   * columns), and HD icons drawn SMALLER than their bitmap downsample smoothly
   * instead of dropping rows (nearest-neighbour downscaling distorts them);
   * icons drawn at or above their size stay pixelated.
   */
  pixelFit() {
    const dpr = window.devicePixelRatio || 1;
    const imgs = this.root.querySelectorAll('img.pi, img.logo, img.pw-ic, .em-b img, .bh-skill img');
    let ready = 0;
    for (const im of imgs) if (im.naturalWidth) ready++;
    const key = `${innerWidth}x${innerHeight}@${dpr}|${imgs.length}|${ready}|${this.landLayout}`;
    if (key === this.fitKey) return;
    this.fitKey = key;
    for (const el of this.root.querySelectorAll('.bh-ult')) {
      el.style.width = el.style.height = '';
      const w = el.offsetWidth;
      if (!w) continue;
      const k = Math.max(1, Math.round((w * dpr) / FN));
      const px = (k * FN) / dpr + 'px';
      el.style.width = el.style.height = px;
    }
    for (const im of imgs) {
      if (!im.naturalWidth) continue;
      const w = im.offsetWidth || im.getBoundingClientRect().width;
      if (!w) continue;
      im.style.imageRendering = w * dpr < im.naturalWidth * 0.98 ? 'auto' : 'pixelated';
    }
  }

  /** % position of a world x on the minimap. */
  mx(x) {
    return ((x / FIELD.VIEW_X + 1) / 2) * 100;
  }

  // -------------------------------------------------------------------------
  // Base upgrade model

  async updateBaseModel(initial = false) {
    const s = this.sim.sides[0];
    const cur = s.overclock + 1;
    const show = BASE_UPGRADES[cur] ? cur + 1 : cur; // the NEXT tier (or the Mega HQ when maxed)
    if (show === this.modelTier) return;
    this.modelTier = show;
    const style = this.cfg.sides[0].labStyle;
    // the player's chibi Commander (equipped skin) rides on the seat; the model rocks to keep them facing out
    const bo = { style, size: 256, zoom: 0.76, cmd: this.cfg.sides[0].commander ?? null, cmdScale: 1.0, sway: 0.75 };
    try {
      const [first] = await baseSpin(show, bo);
      if (this.modelTier !== show) return;
      this.ocModel.src = first;
      if (!initial) { this.ocModel.classList.remove('in'); void this.ocModel.offsetWidth; this.ocModel.classList.add('in'); }
      // turntable frames for the "you can afford it" spin, rendered in the background
      this.spinFrames = null;
      setTimeout(async () => {
        const fr = await baseSpin(show, { ...bo, frames: 24 });
        if (this.modelTier === show) this.spinFrames = fr;
      }, initial ? 1500 : 400);
    } catch (e) { console.warn('base thumb failed', e); }
  }

  /** The turntable: a slow idle turn, faster when affordable, a whirl during the upgrade. */
  spinModel(dt, on) {
    const fr = this.spinFrames;
    if (!fr || reduced()) return;
    this.spinT = (this.spinT ?? 0) + dt * (this.fastSpin > 0 ? 40 : on ? 9 : 2.6);
    if (this.fastSpin > 0) this.fastSpin -= dt;
    const i = Math.floor(this.spinT) % fr.length;
    if (i !== this.spinIdx) { this.spinIdx = i; this.ocModel.src = fr[i]; }
  }

  // -------------------------------------------------------------------------
  // Hand

  handSig() {
    const sim = this.sim, s = sim.sides[0];
    return s.hand.map((k, i) => `${k}:${s.deck[k]?.id}:${sim.cardCost(0, i)}`).join('|') + '#' + (s.queue[0] ?? -1) + '#' + (s.handSize ?? 4);
  }

  /** Card face markup for a hand card (also cloned for the fly / drag ghosts). */
  cardFace(c, cost, extra = {}) {
    const def = cardDef(c.id);
    const base = def?.elixir ?? 3;
    const sp = c.special ? SPELLS[c.unit] : null;
    const desktop = engine.width > engine.height || !('ontouchstart' in window);
    return h('div', { class: 'cf' },
      h('div', { class: 'cf-bg' }),
      h('div', { class: 'art' }, cardArtImg(c.id, c.variant ?? 'base', c.skin ?? null, 128, '')),
      h('div', { class: 'cf-shine' }),
      h('div', { class: 'nm' }, def?.name ?? c.id),
      sp ? h('div', { class: 'kw' }, sp.keywords?.[0] ?? 'SPECIAL') : h('div', { class: 'lv' }, c.spell ? 'SPELL' : `LV${c.level ?? 1}`),
      c.temp ? h('div', { class: 'tmp' }, 'COPY') : null,
      h('div', { class: 'need' }),
      h('div', { class: 'flash' }),
      h('div', { class: `cost${cost < base ? ' cheap' : ''}` }, h('b', {}, String(cost))),
      desktop && extra.key ? h('div', { class: 'key' }, String(extra.key)) : null);
  }
  slotClass(c, i, s) {
    const def = cardDef(c.id);
    const sp = c.special ? SPELLS[c.unit] : null;
    return `bh-slot r-${def?.rarity ?? 'common'}${c.spell && !sp ? ' spell' : ''}${sp ? ' special' : ''}${c.temp ? ' temp' : ''}${i >= (s.handSize ?? 4) ? ' extra' : ''}${c.variant && c.variant !== 'base' ? ' shiny' : ''}`;
  }

  refreshHand(initial = false) {
    const sim = this.sim, s = sim.sides[0];
    this.lastSig = this.handSig();
    const nextR = !initial && this.nextEl.isConnected ? this.nextEl.getBoundingClientRect() : null;
    let drawn = 0;
    const entered = [];
    this.slots.forEach((slot, i) => {
      const k = s.hand[i];
      const c = k === undefined ? null : s.deck[k];
      const cost = c ? sim.cardCost(0, i) : 0;
      const key = c ? `${k}:${c.id}:${cost}` : null;
      if (key === slot.key) return;
      const wasEmpty = !slot.card;
      const sameCard = slot.card && c && slot.key?.split(':')[0] === String(k);
      slot.key = key;
      slot.card = c;
      slot.el.innerHTML = '';
      slot.ready = null;
      if (!c) {
        slot.el.className = 'bh-slot empty gone pfx';
        return;
      }
      const def = cardDef(c.id);
      const sp = c.special ? SPELLS[c.unit] : null;
      slot.el.className = this.slotClass(c, i, s) + ' pfx';
      // only the cost changed: the same card stays picked up / queued
      if (sameCard && i === this.sel) slot.el.classList.add('sel');
      if (sameCard && i === this.queuedSlot) slot.el.classList.add('queued');
      slot.el.style.setProperty('--sc', sp?.color ?? '#3ff2e0');
      slot.el.style.setProperty('--rc', RARITY_COL[def?.rarity] ?? RARITY_COL.common);
      slot.el.appendChild(this.cardFace(c, cost, { key: i + 1 }));
      if (initial || sameCard) {
        // only the cost changed (a discount): pop the badge
        if (sameCard) bump(slot.el.querySelector('.cost'));
        return;
      }
      entered.push({ slot, drawn: wasEmpty && i >= (s.handSize ?? 4) ? drawn++ : -1 });
    });
    // NEXT slides into the empty slot; DRAWs fan in from the deck
    if (entered.length) {
      requestAnimationFrame(() => {
        for (const { slot, drawn: d } of entered) {
          if (!slot.el.isConnected || reduced()) continue;
          const r = slot.el.getBoundingClientRect();
          const from = nextR ?? { left: r.left - r.width, top: r.top + r.height * 0.4, width: r.width, height: r.height };
          const dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2);
          const sc = Math.max(0.35, Math.min(1, from.width / Math.max(1, r.width)));
          if (d >= 0) {
            slot.el.animate([
              { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0 },
              { transform: `translate(${dx * 0.3}px, ${-r.height * 0.45}px) scale(1.12)`, opacity: 1, offset: 0.6 },
              { transform: 'none', opacity: 1 },
            ], { duration: 520, delay: d * 110, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
            setTimeout(() => sparkle(slot.el, { count: 8, colors: ['#3ff2e0', '#ffffff', '#ffd84a'], spread: 40 }), 380 + d * 110);
          } else {
            slot.el.animate([
              { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.6 },
              { transform: `translate(${dx * 0.2}px, ${-r.height * 0.18}px) scale(1.06)`, opacity: 1, offset: 0.65 },
              { transform: 'none', opacity: 1 },
            ], { duration: 380, easing: 'cubic-bezier(.3,.8,.3,1.15)' });
          }
        }
      });
    }
    // NEXT card
    const nk = s.queue[0];
    const nc = nk === undefined ? null : s.deck[nk];
    const nkey = nc ? `${nk}:${nc.id}` : null;
    if (nkey !== this.nextKey) {
      this.nextKey = nkey;
      this.nextEl.innerHTML = '';
      this.nextWrap.classList.toggle('hidden', !nc);
      if (nc) {
        const def = cardDef(nc.id);
        this.nextEl.className = `bh-nextc r-${def?.rarity ?? 'common'}${nc.special ? ' special' : ''}`;
        this.nextEl.style.setProperty('--rc', RARITY_COL[def?.rarity] ?? RARITY_COL.common);
        this.nextEl.append(cardArtImg(nc.id, nc.variant ?? 'base', nc.skin ?? null, 96, ''), h('b', {}, String(def?.elixir ?? '')));
        if (!initial) { this.nextEl.classList.remove('enter'); void this.nextEl.offsetWidth; this.nextEl.classList.add('enter'); }
      }
    }
  }

  select(slot) {
    this.sel = slot;
    this.slots.forEach((s, i) => s.el.classList.toggle('sel', i === slot));
  }
  /** A card dropped before it was affordable waits raised in an amber frame (-1 clears). */
  queued(slot) {
    this.queuedSlot = slot;
    this.slots.forEach((s, i) => s.el.classList.toggle('queued', i === slot));
  }
  slotEl(i) {
    return this.slots[i]?.el;
  }
  /** y (px) of the top of the dock: pointer above it = over the battlefield. */
  deckTop() {
    return this.deck.getBoundingClientRect().top;
  }
  isOverField(x, y) {
    if (y >= this.deckTop() - 4) return false;
    for (const el of [this.floatL, this.floatR]) {
      for (const c of el.children) {
        const r = c.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return false;
      }
    }
    return true;
  }

  /** Floating copy of the card following the finger while dragging. */
  dragStart(slot) {
    this.dragEnd();
    const sl = this.slots[slot];
    const c = sl?.card;
    if (!c) return;
    sl.el.classList.add('dragging');
    const r = sl.el.getBoundingClientRect();
    const face = sl.el.querySelector('.cf')?.cloneNode(true) ?? cardEl(c.id, { owned: { level: c.level, variant: c.variant, skin: c.skin }, noLevel: true });
    this.drag = h('div', { class: sl.el.className.replace('dragging', '') + ' bh-drag', style: { width: r.width + 'px', height: r.height + 'px', '--rc': sl.el.style.getPropertyValue('--rc'), '--sc': sl.el.style.getPropertyValue('--sc') } },
      h('div', { class: 'dg-card' }, face), h('div', { class: 'dg-orb' }, h('img', { src: sl.el.querySelector('.art img')?.src ?? '', alt: '' })));
    this.root.appendChild(this.drag);
    this.dragSlot = slot;
    this.dragX = null;
  }
  dragMove(x, y, overField) {
    if (!this.drag) return;
    const vx = this.dragX === null ? 0 : x - this.dragX;
    this.dragX = x;
    // the card trails the finger a little (a sway, never a tilt: no rotated text)
    this.dragTilt = Math.max(-14, Math.min(14, (this.dragTilt ?? 0) * 0.7 - vx * 0.5));
    this.drag.style.transform = `translate(${x}px, ${y}px)`;
    this.drag.style.setProperty('--sway', this.dragTilt.toFixed(1) + 'px');
    this.drag.classList.toggle('over', !!overField);
    this.dragPt = { x, y, over: !!overField };
  }
  dragEnd() {
    if (this.drag) this.drag.remove();
    this.drag = null;
    if (this.dragSlot !== undefined) this.slots[this.dragSlot]?.el.classList.remove('dragging');
    this.dragSlot = undefined;
  }

  /**
   * Card-use animation: the played card lifts, flashes and flies to where it
   * deploys (the drop point, your base for a tap-deploy, the spell target or
   * the middle of the screen for a SPECIAL), bursting on arrival.
   * Call BEFORE the hand refreshes (right after sim.play).
   */
  cardUsed(slot, c, x) {
    const sl = this.slots[slot];
    if (!sl?.el.isConnected || reduced()) return;
    const face = sl.el.querySelector('.cf');
    if (!face) return;
    const r = sl.el.getBoundingClientRect();
    const col = c.special ? SPELLS[c.unit]?.color ?? '#3ff2e0' : sl.el.style.getPropertyValue('--rc') || '#9fb4e8';
    // where it lands
    let tx, ty;
    if (c.special) { tx = engine.width / 2; ty = Math.max(80, this.deckTop() * 0.55); }
    else {
      const wx = x ?? this.view.lastDropX ?? this.sim.sides[0].labX + 2;
      const s = this.view.engineToScreen(_v.set(wx, c.spell ? 0.3 : 0.7, 0.4));
      tx = s.x; ty = Math.min(s.y, this.deckTop() - 30);
    }
    const dp = this.dragPt?.over ? this.dragPt : null;
    this.dragPt = null;
    const fly = h('div', { class: sl.el.className.replace(/\b(sel|dragging|poor|ready)\b/g, '') + ' bh-fly', style: { width: r.width + 'px', height: r.height + 'px', '--rc': col, '--sc': sl.el.style.getPropertyValue('--sc') } }, face.cloneNode(true));
    this.root.appendChild(fly);
    const sx = dp ? dp.x - r.width / 2 : r.left, sy = dp ? dp.y - r.height * 0.7 : r.top;
    const ex = tx - r.width / 2, ey = ty - r.height / 2;
    const lift = dp ? 0 : -r.height * 0.42;
    const s0 = dp ? 0.55 : 1;
    const dur = c.special ? 560 : 520;
    const kf = c.special
      ? [
        { transform: `translate(${sx}px, ${sy}px) scale(${s0})`, opacity: 1 },
        { transform: `translate(${sx}px, ${sy + lift}px) scale(1.2)`, opacity: 1, offset: 0.22 },
        { transform: `translate(${ex}px, ${ey}px) scale(1.7)`, opacity: 0.9, offset: 0.8 },
        { transform: `translate(${ex}px, ${ey}px) scale(2.3)`, opacity: 0 },
      ]
      : [
        { transform: `translate(${sx}px, ${sy}px) scale(${s0})`, opacity: 1 },
        { transform: `translate(${sx}px, ${sy + lift}px) scale(${dp ? 0.6 : 1.18})`, opacity: 1, offset: 0.24 },
        { transform: `translate(${(sx + ex) / 2}px, ${Math.min(sy + lift, ey) - r.height * 0.5}px) scale(0.7)`, opacity: 1, offset: 0.62 },
        { transform: `translate(${ex}px, ${ey}px) scale(0.22)`, opacity: 0.4 },
      ];
    fly.animate(kf, { duration: dur, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' }).onfinish = () => {
      fly.remove();
      burstAt(tx, ty, { color: col, count: c.special ? 22 : 6, scale: c.special ? 3 : 1.2, colors: [col, '#ffffff', '#ffd84a'] });
    };
    // the empty slot pulses while the next card is on its way
    sl.el.classList.remove('played');
    void sl.el.offsetWidth;
    sl.el.classList.add('played');
    setTimeout(() => sl.el.classList.remove('played'), 400);
  }

  hint(text, y = null) {
    const el = h('div', { class: 'bh-hint' }, text);
    el.style.top = (y ?? this.deckTop() - engine.height * 0.08) + 'px';
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
  needEnergy(cost) {
    this.hint(`Need ${cost} power!`);
    bump(this.energyRow, 'shake');
    audio.play('deny');
  }

  // -------------------------------------------------------------------------
  // Emotes

  toggleEmotes() {
    if (this.emotePop) {
      const pop = this.emotePop;
      this.emotePop = null;
      this.emoteBtn.classList.remove('open');
      pop.classList.add('out');
      setTimeout(() => pop.remove(), 180);
      return;
    }
    const r = this.emoteBtn.getBoundingClientRect();
    const pop = h('div', { class: 'bh-emotes hit' }, EMOTES.map((em, i) => {
      const b = pressFx(h('div', { class: 'em-b', style: { '--ec': em.color, '--i': i } }, h('img', { src: iconURL(em.icon), alt: '' }), h('span', {}, em.text)));
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); this.toggleEmotes(); this.hd.emote(i); });
      return b;
    }));
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
    pop.style.left = Math.max(4, r.left) + 'px';
    pop.style.bottom = engine.height - r.top + 10 + 'px';
    this.root.appendChild(pop);
    this.emotePop = pop;
    this.emoteBtn.classList.add('open');
    // tapping anywhere else closes the tray
    const off = (e) => {
      if (this.emotePop !== pop) return document.removeEventListener('pointerdown', off, true);
      if (pop.contains(e.target) || this.emoteBtn.contains(e.target)) return;
      document.removeEventListener('pointerdown', off, true);
      this.toggleEmotes();
    };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    audio.play('bubblePop', { pitch: 1.2 });
  }
  /** A side's Commander acts out an emote (wind-up bar, then the big reaction + bubble). */
  showEmote(si, i) {
    const em = EMOTES[i];
    if (!em) return;
    audio.play('emote', { pitch: si === 0 ? 1 : 0.85 });
    // the reaction lands after the wind-up: a meme sting per emote (rival's a touch quieter)
    audio.play(EMOTE_SFX[i] ?? 'emote', { delay: EMOTE_WIND, vol: si === 0 ? 1 : 0.8 });
    this.view.emoteAct?.(si, em, EMOTE_WIND);
    if (si === 0) {
      this.live?.emote(em, EMOTE_WIND);
      this.emoteCdT = EMOTE_CD;
      this.emoteBtn.style.setProperty('--ec', em.color);
      bump(this.emoteBtn, 'sent');
    }
  }

  // -------------------------------------------------------------------------
  // Events + per-frame refresh

  onEvent(ev) {
    switch (ev.type) {
      case 'cycle':
      case 'draw':
        if (ev.side === 0) this.refreshHand();
        break;
      case 'special': {
        const sp = SPELLS[ev.id];
        if (!sp) break;
        if (ev.side === 0) {
          bigBanner(sp.name.toUpperCase() + '!', ev.info ?? '', { dur: 0.9, color: sp.color ?? '#3ff2e0' });
          sparkle(this.lineup, { count: 16, colors: [sp.color ?? '#3ff2e0', '#ffffff', '#ffd84a'] });
          audio.play('cardPick', { pitch: 1.4 });
        } else this.rivalPlay(sp, ev.info);
        break;
      }
      case 'energyGain':
        if (ev.side === 0) { bump(this.energyRow, 'gain'); sparkle(this.pwrNow, { count: 10, colors: ['#ffe14a', '#ffffff'], spread: 40 }); }
        break;
      case 'doubleEnergy':
        bigBanner('2X POWER!', 'Last minute: spend it fast!', { dur: 1.6, color: '#ffd84a' });
        audio.play('bell');
        audio.play('vHurry', { delay: 0.35 });
        break;
      case 'overtime':
        bigBanner('OVERTIME!', 'Hit their base to win!', { dur: 1.8, color: '#ffb84a' });
        audio.play('alarm');
        audio.play('vSuddenDeath', { delay: 0.45 });
        break;
      case 'labUp': {
        const sd = this.sides[ev.side];
        bump(sd.cap, 'up');
        sparkle(sd.cap, { count: 14, colors: ['#ffd84a', '#ffffff', '#8fd4ff'] });
        if (ev.side === 0) this.baseUpFx(ev);
        break;
      }
      case 'megaReady':
        if (ev.side === 0 && this.megaEl) {
          bump(this.megaEl, 'pop');
          burst(this.megaEl, { color: '#ff2e88', count: 20, ring: false });
        }
        break;
      case 'sigReady':
        if (ev.side === 0 && this.sig) this.showUltReady();
        break;
      case 'sigStart':
        this.ultTip?.remove();
        // the in-world cinematic (sigCutscene.js) carries the name slam; the live chibi on the button acts it out too
        if (ev.side === 0 && this.sig) { burst(this.sig, { color: this.sigCol, count: 22, scale: 2, ring: false }); this.live?.action(); }
        break;
      case 'signature':
        // no cinematic (e.g. a sim without one): fall back to the cut-in band
        if (!this.view.cine?.sig) this.sigCutIn(ev.side);
        break;
      case 'megaStart':
        this.megaCutIn(ev);
        break;
      default:
        break;
    }
  }

  /** The base button celebrates an upgrade: flash, the 3D base spins, sparks, banner. */
  baseUpFx(ev) {
    const b = this.ocBtn;
    b.classList.remove('upgraded');
    void b.offsetWidth;
    b.classList.add('upgraded');
    setTimeout(() => b.classList.remove('upgraded'), 1100);
    burst(b.querySelector('.bb-stage') ?? b, { color: '#c08aff', count: 28, scale: 1.2, ring: false, colors: ['#ffd84a', '#ffffff', '#c08aff', '#8fd4ff'] });
    // spin the model of the tier we just built, then swap to the next one
    this.fastSpin = 0.9;
    setTimeout(() => this.updateBaseModel(), 900);
    bigBanner(ev.name.toUpperCase() + '!', `Base tier ${ev.tier}: more POWER, max ${this.sim.maxPower(0)}, more HP`, { dur: 1.3, color: '#c08aff' });
    bump(this.energyRow, 'gain');
  }

  sigCutIn(si) {
    const s = this.sim.sides[si];
    const sg = s.cmd?.signature;
    if (!sg) return;
    const cmd = this.cfg.sides[si].commander;
    let img = si === 0 ? this.sigImgFull : null;
    try {
      if (!img && cmd) img = charPortrait(cmd.char ?? cmd.id, { override: cmd.override, size: 256, eyes: si ? 'angry' : 'determined', mouth: 'shout', full: true, yaw: si ? 0.35 : -0.35 });
      if (si === 0) this.sigImgFull = img;
    } catch (e) { img = null; }
    ultCutIn({ img, title: sg.name.toUpperCase(), kicker: si === 0 ? `${s.cmd.name ?? 'COMMANDER'} ULTIMATE` : 'RIVAL ULTIMATE', color: si === 0 ? sigColor(sg) : '#ff3d55', side: si, dur: si === 0 ? 1.25 : 0.95 });
    if (si === 0 && this.sig) { burst(this.sig, { color: this.sigCol, count: 22, scale: 2, ring: false }); this.live?.action(); }
  }
  megaCutIn(ev) {
    const def = MEGAS[ev.id];
    let img = null;
    try { img = swarmThumb(ev.id, ev.variant ?? 'base', null, 256, { pose: 'attack', yaw: ev.side ? -0.62 : 0.62 }); } catch (e) { img = null; }
    ultCutIn({ img, title: (def?.name ?? 'MEGA').toUpperCase(), kicker: ev.side === 0 ? 'MEGA ULTIMATE' : 'RIVAL MEGA!', sub: def?.special?.name ?? '', color: ev.side === 0 ? def?.bolt ?? '#ff2e88' : '#ff3d55', side: ev.side, dur: 1.2 });
  }

  /** A little card toast at the top when the rival plays a SPECIAL. */
  rivalPlay(sp, info) {
    const el = h('div', { class: 'bh-rivalcard', style: { '--sc': sp.color ?? '#ff5a9a' } }, cardArtImg(sp.id, 'base', null, 96, ''),
      h('div', { class: 'tx' }, h('small', {}, 'RIVAL PLAYED'), h('b', {}, sp.name), info ? h('span', {}, info) : null));
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  megaDeny() {
    const s = this.sim.sides[0];
    if (!s.mega || this.sim.over || !this.megaEl) return;
    if (s.mega.used) this.hint('MEGA already used this battle!');
    else if (s.overclock + 1 < MEGA.minTier) this.hint(`Upgrade your base to ${BASE_UPGRADES[MEGA.minTier - 1].name} first!`);
    else if (s.mega.charge < 1) this.hint(`MEGA charging: ${Math.floor(s.mega.charge * 100)}% - deal damage!`);
    bump(this.megaEl, 'shake');
    audio.play('deny');
  }

  /** Ultimate ring + liquid + state. */
  setUlt(u, k, state, label) {
    u.el.style.setProperty('--k', Math.max(0, Math.min(1, k)).toFixed(3));
    const ph = state === 'ready' ? Math.floor(performance.now() / 110) % 3 : Math.floor(performance.now() / 260) % 2;
    const fkey = `${Math.floor(Math.min(1, k) * ULT_CELLS)}|${state}|${ph}`;
    if (fkey !== u.fkey) { u.fkey = fkey; drawUltFrame(u.frame, k, u.color, state, ph); }
    u.liq.style.height = (Math.min(1, k) * 100).toFixed(1) + '%';
    if (u.pct.textContent !== label) u.pct.textContent = label;
    u.el.classList.toggle('ready', state === 'ready');
    u.el.classList.toggle('hot', k >= 0.5 && state !== 'used');
    u.el.classList.toggle('used', state === 'used');
    if (state === 'ready' && u.wasReady === false) { bump(u.el, 'pop'); burst(u.el, { color: getComputedStyle(u.el).getPropertyValue('--uc') || '#ffd84a', count: 16, ring: false }); audio.play('magic', { pitch: 1.3 }); }
    u.wasReady = state === 'ready';
  }

  update(dt) {
    const sim = this.sim, s = sim.sides[0];
    this.layoutT = (this.layoutT ?? 0) - dt;
    if (this.layoutT <= 0) {
      this.layoutT = 0.5;
      this.placeMega();
      this.pixelFit();
      const hidden = this.root.style.display === 'none';
      plateBounds.minY = hidden ? 0 : this.twLane.getBoundingClientRect().bottom + 4;
      plateBounds.maxY = hidden ? engine.height : this.deck.getBoundingClientRect().top;
      plateBounds.clearL = null;
    }
    // timer
    const tl = sim.timeLeft;
    const sec = Math.ceil(tl);
    if (sec !== this.ticked) {
      this.ticked = sec;
      this.tm.textContent = fmtT(tl);
      if (!sim.over && sec <= 10 && sec > 0 && !sim.paused) audio.play('countdown', { pitch: sec <= 3 ? 1.3 : 1 });
    }
    this.timer.classList.toggle('urgent', tl <= 10 && !sim.over);
    this.timer.classList.toggle('ot', sim.overtime);
    const tg = sim.overtime ? 'OT 3x' : sim.doubleEnergy ? '2x' : '';
    if (tg !== this.lastTag) {
      this.lastTag = tg;
      this.tag.textContent = tg || '2x';
      this.tag.className = `tag${sim.overtime ? ' ot' : ''}${tg ? ' in' : ' hidden'}`;
    }
    // emote cooldown shutter + the live Commander in the ULT button
    if (this.emoteCdT > 0) {
      this.emoteCdT = Math.max(0, this.emoteCdT - dt);
      this.emoteCd.style.height = ((this.emoteCdT / EMOTE_CD) * 100).toFixed(1) + '%';
      if (this.emoteCdT === 0) { this.emoteBtn.classList.remove('cool'); bump(this.emoteBtn, 'back'); }
      else this.emoteBtn.classList.add('cool');
    }
    if (this.live) {
      const k = Math.min(1, s.sig);
      this.live.visible = this.root.style.display !== 'none' && !this.root.classList.contains('cine');
      this.live.setState(sim.over ? 'idle' : k >= 1 ? 'ready' : k >= 0.5 ? 'charged' : 'idle');
      this.live.update(dt, k);
    }
    // POWER wallet
    const e = s.energy;
    const max = sim.maxPower(0);
    if (max !== this.lastMax) {
      this.lastMax = max;
      this.pwrMax.textContent = '/' + max;
      this.ebar.style.setProperty('--segs', max);
    }
    if (Math.abs(e - this.lastE) > 0.004) {
      this.lastE = e;
      const whole = Math.floor(e + 1e-6);
      if (whole !== this.shownE) {
        const up = whole > this.shownE && this.shownE >= 0;
        const spent = this.shownE - whole;
        this.shownE = whole;
        this.pwrNow.textContent = String(whole);
        if (up) bump(this.pwrNow, 'tick');
        else if (spent > 0) this.spendFx(spent);
      }
      this.pwrFill.style.width = Math.min(100, (e / max) * 100).toFixed(2) + '%';
      this.energyRow.classList.toggle('maxed', e >= max - 0.001);
    }
    const rate = sim.energyRate?.(0);
    if (rate) {
      const rt = `+${rate.toFixed(1)}/s`;
      if (rt !== this.lastRate) { this.lastRate = rt; this.rate.textContent = rt; }
    }
    this.energyRow.classList.toggle('x2', sim.doubleEnergy && !sim.overtime);
    this.energyRow.classList.toggle('x3', sim.overtime);
    this.energyRow.classList.toggle('oc', s.buffs?.overclock > 0);
    // hand: keep in sync (draws, discounts, friend-battle snapshots) + affordability
    if (this.handSig() !== this.lastSig) this.refreshHand();
    this.echoTag.classList.toggle('hidden', !(s.echo > 0));
    this.slots.forEach((slot, i) => {
      if (!slot.card) return;
      const cost = sim.cardCost(0, i);
      const ready = e >= cost && !sim.over;
      if (ready !== slot.ready) {
        if (ready && slot.ready === false) {
          slot.el.classList.remove('popready');
          void slot.el.offsetWidth;
          slot.el.classList.add('popready');
        }
        slot.ready = ready;
        slot.el.classList.toggle('poor', !ready);
        slot.el.classList.toggle('ready', ready);
      }
      if (!ready) {
        const need = slot.el.querySelector('.need');
        if (need) need.style.height = ((1 - Math.min(1, e / Math.max(0.01, cost))) * 100).toFixed(1) + '%';
      }
    });
    // base upgrade (cost after research discounts)
    const oc = sim.overclockInfo(0);
    const nx = BASE_UPGRADES[s.overclock + 1];
    const lv = `LV ${s.overclock + 1}`;
    if (lv !== this.lastLv) { this.lastLv = lv; this.ocTier.textContent = lv; }
    let afford = false;
    if (!nx) {
      if (!this.ocBtn.classList.contains('max')) {
        this.ocV.textContent = oc.name;
        this.ocC.textContent = 'MAX';
        this.ocFill.style.width = '100%';
        this.ocBtn.classList.add('max');
        this.ocBtn.classList.remove('afford');
        this.pwrMark.style.display = 'none';
      }
    } else {
      if (this.ocV.textContent !== nx.name) this.ocV.textContent = nx.name;
      if (this.ocC.textContent !== String(oc.cost)) this.ocC.textContent = String(oc.cost);
      this.ocFill.style.width = Math.min(100, (e / oc.cost) * 100).toFixed(1) + '%';
      afford = !!sim.canUpgradeLab(0);
      this.ocBtn.classList.toggle('afford', afford);
      this.pwrMark.style.left = Math.min(100, (oc.cost / max) * 100).toFixed(1) + '%';
      this.pwrMark.classList.toggle('on', afford);
    }
    if (this.modelTier && this.modelTier !== (nx ? s.overclock + 2 : s.overclock + 1) && !(this.fastSpin > 0)) this.updateBaseModel();
    this.spinModel(dt, afford);
    // MEGA ultimate
    if (this.megaU && s.mega) {
      const m = s.mega;
      const k = Math.min(1, m.charge);
      const locked = s.overclock + 1 < MEGA.minTier;
      const ready = sim.canMega(0);
      this.setUlt(this.megaU, m.used ? 0 : k, m.used ? 'used' : ready ? 'ready' : 'charging', m.used ? 'USED' : ready ? 'TAP!' : k >= 1 ? 'READY' : `${Math.floor(k * 100)}%`);
      this.megaEl.classList.toggle('locked', locked && !m.used);
    }
    // tug-of-war: each side's HP fraction pushes the seam (who's winning at a glance)
    let hurt = 0;
    for (let i = 0; i < 2; i++) {
      const sd = this.sides[i], b = sim.sides[i].lab;
      const frac = Math.max(0, b.hp / b.maxHp);
      if (b.hp !== sd.lastHp) {
        if (sd.lastHp > 0 && b.hp < sd.lastHp - 0.5 && !reduced()) {
          const big = sd.lastHp - b.hp > b.maxHp * 0.04;
          hurt = Math.max(hurt, big ? 2 : 1);
          bump(sd.cap, big ? 'hurtbig' : 'hurt');
          bump(sd.fill, 'hit');
        }
        sd.lastHp = b.hp;
        sd.frac = frac;
        const pc = String(Math.max(0, Math.ceil(frac * 100)));
        if (sd.pc.textContent !== pc) sd.pc.textContent = pc;
        sd.cap.classList.toggle('low', frac < 0.3);
      }
      const t = sim.sides[i].overclock;
      if (t !== sd.lastTier) {
        sd.lastTier = t;
        sd.tier.textContent = String(t + 1);
        sd.cap.title = `T${t + 1} ${BASE_UPGRADES[t].name}`;
      }
    }
    if (hurt) bump(this.twBar, hurt > 1 ? 'shakebig' : 'shake');
    const f0 = this.sides[0].frac, f1 = this.sides[1].frac;
    const target = f0 + f1 > 0 ? f0 / (f0 + f1) : 0.5;
    this.split += (target - this.split) * Math.min(1, dt * 10);
    this.ghostSplit += (this.split - this.ghostSplit) * Math.min(1, dt * 2.2);
    const sp = this.split * 100, gs = this.ghostSplit * 100;
    this.sides[0].fill.style.width = sp.toFixed(2) + '%';
    this.sides[1].fill.style.left = sp.toFixed(2) + '%';
    this.twSeam.style.left = sp.toFixed(2) + '%';
    this.twGhost.style.left = Math.min(sp, gs).toFixed(2) + '%';
    this.twGhost.style.width = Math.abs(sp - gs).toFixed(2) + '%';
    const lead = target - 0.5;
    const lean = sim.over ? '' : lead > 0.025 ? 'win' : lead < -0.025 ? 'lose' : '';
    if (lean !== this.lastLean) {
      this.lastLean = lean;
      this.twLean.textContent = lean === 'win' ? 'WINNING' : lean === 'lose' ? 'LOSING' : 'EVEN';
      this.twLean.className = `tw-lean ${lean || 'even'}`;
      this.top.classList.toggle('lead0', lean === 'win');
      this.top.classList.toggle('lead1', lean === 'lose');
      if (lean) bump(this.twLean, 'pop');
    }
    this.twLean.style.left = Math.max(14, Math.min(86, sp)).toFixed(2) + '%';
    // commander ultimate + skills
    if (this.sig) {
      const k = Math.min(1, s.sig);
      const ready = k >= 1 && !sim.over;
      this.setUlt(this.sigU, k, ready ? 'ready' : 'charging', ready ? 'TAP!' : `${Math.floor(k * 100)}%`);
      // a hit on your base charges the ULT in a chunk: the button flashes so the comeback reads
      const jump = k - (this.sigPrev ?? k);
      this.sigPrev = k;
      this.sigHitT = (this.sigHitT ?? 0) - dt;
      if (jump > 0.012 && !ready && this.sigHitT <= 0) {
        this.sigHitT = 0.45;
        this.sig.classList.remove('charge-hit');
        void this.sig.offsetWidth;
        this.sig.classList.add('charge-hit');
      }
      // first battle with the new ULT: explain what charges it
      if (!this.ultTipDone && sim.t > 4 && !sim.paused && !sim.cinematic && !ready) {
        this.ultTipDone = true;
        let seen = false;
        try { seen = localStorage.getItem('mbswarmers.tip.ult2') === '1'; localStorage.setItem('mbswarmers.tip.ult2', '1'); } catch (e) { seen = false; }
        if (!seen) this.showUltTip();
      }
      for (let i = 0; i < this.skillEls.length; i++) {
        const se = this.skillEls[i];
        const cd = Math.max(0, s.skillCds[i]);
        se.el.classList.toggle('cool', cd > 0);
        se.cdv.style.height = cd > 0 ? ((cd / se.sk.cd) * 100).toFixed(1) + '%' : '0%';
        se.cdn.textContent = cd > 0 ? String(Math.ceil(cd)) : '';
      }
    }
    // lane strip: camera window + unit ticks
    const units = sim.units.filter((u) => !u.dead && u.state !== 'spawn');
    while (this.dots.length < Math.min(40, units.length)) {
      const d = h('i', { class: 'dot' });
      this.twLane.appendChild(d);
      this.dots.push(d);
    }
    this.dots.forEach((d, i) => {
      const u = units[i];
      if (!u) { if (d.style.display !== 'none') d.style.display = 'none'; return; }
      d.style.display = '';
      const cls = `dot s${u.side}${u.size > 1.5 || u.boss || u.mega ? ' big' : ''}`;
      if (d.className !== cls) d.className = cls;
      d.style.left = this.mx(u.x).toFixed(1) + '%';
    });
    const v = this.view;
    if (v.halfW) {
      const l = this.mx(v.camX - v.halfW), r = this.mx(v.camX + v.halfW);
      this.twLaneWin.style.left = Math.max(0, l).toFixed(1) + '%';
      this.twLaneWin.style.width = Math.max(4, Math.min(100, r) - Math.max(0, l)).toFixed(1) + '%';
    }
  }

  /** POWER spent: the counter flashes and a "-N" chip drops off the wallet. */
  spendFx(n) {
    if (reduced()) return;
    bump(this.energyRow, 'spend');
    const r = this.pwrNow.getBoundingClientRect();
    const el = h('div', { class: 'pw-spent', style: { left: r.right + 'px', top: r.top + 'px' } }, `-${n}`);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  setVisible(on) {
    this.root.style.display = on ? '' : 'none';
  }
  /** What charges the ULTIMATE: a pixel callout over the ULT button. */
  showUltTip(short = false) {
    if (!this.sig) return;
    this.ultTip?.remove();
    clearTimeout(this.ultTipT);
    const pct = Math.floor(Math.min(1, this.sim.sides[0].sig) * 100);
    this.ultTip = h('div', { class: 'u-tip' },
      h('b', {}, short ? `ULT ${pct}%` : 'ULTIMATE'),
      h('span', {}, 'Charges from the POWER you make'),
      h('span', {}, 'and damage to your base'));
    this.sig.appendChild(this.ultTip);
    const el = this.ultTip;
    this.ultTipT = setTimeout(() => { el.classList.add('bye'); setTimeout(() => el.remove(), 300); }, short ? 2200 : 6500);
  }
  /** The ULTIMATE just filled: a callout pops over the button. */
  showUltReady() {
    this.ultTip?.remove();
    clearTimeout(this.ultTipT);
    const name = this.sim.sides[0].cmd?.signature?.name ?? 'ULTIMATE';
    this.ultTip = h('div', { class: 'u-tip ready' }, h('b', {}, 'READY'), h('span', {}, name.toUpperCase()));
    this.sig.appendChild(this.ultTip);
    burst(this.sig, { color: this.sigCol, count: 26, scale: 1.6, ring: false });
    const el = this.ultTip;
    this.ultTipT = setTimeout(() => { el.classList.add('bye'); setTimeout(() => el.remove(), 300); }, 2600);
  }
  /** Tuck the HUD away while a cutscene owns the screen. */
  setCinematic(on) {
    this.root.classList.toggle('cine', !!on);
    document.body.classList.toggle('cine', !!on);
    if (on) { this.dragEnd(); this.emotePop?.remove(); this.emotePop = null; this.emoteBtn.classList.remove('open'); }
  }
  dispose() {
    this.dragEnd();
    this.live?.dispose();
    this.live = null;
    document.body.classList.remove('cine');
    this.root.remove();
  }
}

// (the VS intro lives in vsIntro.js)

/** Card definition helper used by the scene. */
export function cardInfo(c) {
  return cardDef(c.id);
}
