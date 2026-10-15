// Battle HUD (DOM): a Clash Royale card cycle in a Battle Cats control dock.
//   top    - your (blue) and the rival's (red) name banners with each base's
//            HP bar + tier, the match timer with 2x / overtime tags, a lane
//            minimap and pause
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

const fmtT = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const RARITY_COL = { common: '#9fb4e8', rare: '#ff9a2e', epic: '#c063ff', legendary: '#3ff2c8', mythic: '#ff2e88' };
// signature ability colours (cut-in band, ring)
const SIG_COL = { beakerBarrage: '#7cff3a', megaGiveaway: '#ffd84a', bellyFlop: '#3fb8ff', juansTruck: '#ff8a2a' };
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const _v = new THREE.Vector3();

export const EMOTES = [
  { icon: 'smile', text: 'Good luck!' },
  { icon: 'heart', text: 'Thanks!' },
  { icon: 'star', text: 'Well played!' },
  { icon: 'alert', text: 'Oops!' },
  { icon: 'fire', text: 'WOW!' },
  { icon: 'skull', text: 'Grrr!' },
];

/** Burst (ring + rays + sparks) at a screen point. */
function burstAt(x, y, o = {}) {
  const el = h('div', { style: { position: 'absolute', left: x - 20 + 'px', top: y - 20 + 'px', width: '40px', height: '40px', pointerEvents: 'none' } });
  $overlay().appendChild(el);
  burst(el, o);
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

    // ------------------------------------------------------------ top
    const side = (i) => {
      const c = cfg.sides[i];
      const fill = h('i', { class: 'f' }), ghost = h('i', { class: 'g' });
      const tier = h('span', { class: 'tn' }, BASE_UPGRADES[0].name);
      const hpv = h('span', { class: 'hv' }, '');
      const el = h('div', { class: `bh-side s${i}` },
        h('div', { class: 'bh-name' },
          h('span', { class: 'nm' }, c.name ?? (i ? 'Rival' : 'You')),
          c.trophies !== undefined ? h('span', { class: 'tr' }, icon('trophy'), String(c.trophies)) : null),
        c.clan || c.ghost ? h('div', { class: 'bh-sub' }, c.clan ?? '', c.ghost ? (c.clan ? ' - ' : '') + 'AI rival' : '') : null,
        h('div', { class: 'bh-base' }, icon('lab'), h('div', { class: 'bb' }, h('b', { class: 'bhp' }, ghost, fill, hpv), tier)));
      return { el, fill, ghost, tier, hpv, ghostFrac: 1, lastHp: -1, lastTier: -1 };
    };
    this.sides = [side(0), side(1)];
    this.tm = h('div', { class: 'tm' }, fmtT(sim.timeLeft));
    this.tag = h('div', { class: 'tag hidden' }, '2x POWER');
    this.timer = h('div', { class: 'bh-timer' }, h('div', { class: 'lbl' }, 'Time left'), this.tm, this.tag);
    root.appendChild(h('div', { class: 'bh-top' }, this.sides[0].el, this.timer, this.sides[1].el));

    // minimap
    this.mini = h('div', { class: 'bh-mini hit' }, h('i', { class: 'mid' }));
    this.miniWin = h('i', { class: 'win' });
    this.mini.appendChild(this.miniWin);
    this.miniTowers = [];
    for (const si of [0, 1]) {
      const b = sim.sides[si].lab;
      const el = h('i', { class: `twr lab s${si}` });
      el.style.left = this.mx(b.x) + '%';
      this.mini.appendChild(el);
      this.miniTowers.push({ el, b });
    }
    this.dots = [];
    const miniPick = (e) => {
      const r = this.mini.getBoundingClientRect();
      const k = (e.clientX - r.left) / r.width;
      handlers.minimap?.((k * 2 - 1) * FIELD.VIEW_X);
    };
    this.mini.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.mini.setPointerCapture(e.pointerId); miniPick(e); });
    this.mini.addEventListener('pointermove', (e) => { if (e.buttons) miniPick(e); });
    root.appendChild(this.mini);
    const pause = button('', () => handlers.pause(), 'gray sm icon-only bh-pause', { icon: 'pause' });
    root.appendChild(pause);

    // ------------------------------------------------------------ dock
    // Commander ULTIMATE (signature): 3D portrait in a charging energy ring
    const cmd = cfg.sides[0].commander;
    this.sig = null;
    this.skillEls = [];
    if (s0.cmd) {
      const sg = s0.cmd.signature;
      this.sigCol = SIG_COL[sg.id] ?? '#ffd84a';
      this.sigImg = charPortrait(cmd.char ?? cmd.id, { override: cmd.override, size: 128, eyes: 'determined', mouth: 'grin' });
      const u = this.makeUlt('sig', this.sigImg, sg.name, this.sigCol, sg.icon ?? 'star');
      this.sig = u.el;
      this.sigU = u;
      this.sig.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); handlers.signature(); });
      this.skillEls = s0.skills.map((sk, k) => {
        const cdv = h('div', { class: 'cdv' });
        const cdn = h('div', { class: 'cdn' }, '');
        const el = h('div', { class: 'bh-skill hit', title: sk.name }, icon(sk.icon ?? 'star'), cdv, cdn);
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); handlers.skill(k); });
        return { el, cdv, cdn, sk };
      });
    }
    // MEGA ultimate: the figure's 3D render in a containment ring
    this.megaEl = null;
    if (s0.mega) {
      const def = MEGAS[s0.mega.id];
      this.megaImg = swarmThumb(s0.mega.id, s0.mega.variant ?? 'base', null, 128);
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
      this.megaEl = h('div', { class: 'bh-ult mega none hit', title: 'MEGA' },
        h('div', { class: 'u-core' }, icon('mega')),
        h('div', { class: 'lockt' }, icon('lock'), h('span', {}, icon('trophy'), '300')),
        h('div', { class: 'u-pct' }, 'MEGA'));
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
    this.ocBtn = h('div', { class: 'bh-basebtn hit', title: 'Upgrade your base (or tap it!)' },
      h('div', { class: 'bb-rays' }),
      h('div', { class: 'bb-stage' }, h('i', { class: 'bb-plinth' }), this.ocModel),
      this.ocTier,
      h('div', { class: 'bb-txt' }, h('small', {}, 'UPGRADE'), this.ocV),
      h('div', { class: 'bb-cost' }, icon('power'), this.ocC),
      h('div', { class: 'bb-fill' }, this.ocFill),
      h('div', { class: 'bb-shine' }));
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
      const slot = { el: h('div', { class: 'bh-slot empty gone', 'data-slot': String(i) }), key: undefined, card: null, ready: null };
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
    this.emoteBtn = button('', () => this.toggleEmotes(), 'blue sm icon-only bh-emote', { icon: 'emote' });
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
    const liq = h('div', { class: 'u-liq' }, h('i', { class: 'bub' }), h('i', { class: 'bub' }), h('i', { class: 'bub' }));
    const pct = h('div', { class: 'u-pct' }, '0%');
    const el = h('div', { class: `bh-ult ${kind} hit`, title: name, style: { '--uc': color } },
      h('div', { class: 'u-rays' }),
      h('div', { class: 'u-ring' }),
      h('div', { class: 'u-core' }, liq, h('img', { class: 'u-model', src: img, alt: '' }), h('i', { class: 'u-arc a1' }), h('i', { class: 'u-arc a2' }), h('i', { class: 'u-arc a3' })),
      h('div', { class: 'u-tag' }, icon(ic), kind === 'mega' ? 'MEGA' : 'ULT'),
      pct);
    return { el, liq, pct };
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
    try {
      const [first] = await baseSpin(show, { style, size: 128 });
      if (this.modelTier !== show) return;
      this.ocModel.src = first;
      if (!initial) { this.ocModel.classList.remove('in'); void this.ocModel.offsetWidth; this.ocModel.classList.add('in'); }
      // turntable frames for the "you can afford it" spin, rendered in the background
      this.spinFrames = null;
      setTimeout(async () => {
        const fr = await baseSpin(show, { style, size: 128, frames: 12 });
        if (this.modelTier === show) this.spinFrames = fr;
      }, initial ? 1500 : 400);
    } catch (e) { console.warn('base thumb failed', e); }
  }

  /** Step the turntable when affordable (or during the upgrade spin). */
  spinModel(dt, on) {
    const fr = this.spinFrames;
    if (!fr || reduced()) return;
    this.spinT = (this.spinT ?? 0) + dt * (this.fastSpin > 0 ? 34 : on ? 7 : 0);
    if (this.fastSpin > 0) this.fastSpin -= dt;
    if (!on && !(this.fastSpin > 0)) {
      // settle back on the hero angle
      if (this.spinIdx) { this.spinIdx = 0; this.ocModel.src = fr[0]; this.spinT = 0; }
      return;
    }
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
        slot.el.className = 'bh-slot empty gone';
        return;
      }
      const def = cardDef(c.id);
      const sp = c.special ? SPELLS[c.unit] : null;
      slot.el.className = this.slotClass(c, i, s);
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
              { transform: `translate(${dx}px, ${dy}px) rotate(-35deg) scale(${sc})`, opacity: 0 },
              { transform: `translate(${dx * 0.3}px, ${-r.height * 0.45}px) rotate(${8 - d * 4}deg) scale(1.12)`, opacity: 1, offset: 0.6 },
              { transform: 'none', opacity: 1 },
            ], { duration: 520, delay: d * 110, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
            setTimeout(() => sparkle(slot.el, { count: 8, colors: ['#3ff2e0', '#ffffff', '#ffd84a'], spread: 40 }), 380 + d * 110);
          } else {
            slot.el.animate([
              { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.6 },
              { transform: `translate(${dx * 0.2}px, ${-r.height * 0.18}px) scale(1.06) rotate(3deg)`, opacity: 1, offset: 0.65 },
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
    this.dragTilt = Math.max(-18, Math.min(18, (this.dragTilt ?? 0) * 0.7 + vx * 0.9));
    this.drag.style.transform = `translate(${x}px, ${y}px)`;
    this.drag.style.setProperty('--tilt', this.dragTilt.toFixed(1) + 'deg');
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
    const rot = tx > sx ? 14 : -14;
    const s0 = dp ? 0.55 : 1;
    const dur = c.special ? 560 : 520;
    const kf = c.special
      ? [
        { transform: `translate(${sx}px, ${sy}px) scale(${s0})`, opacity: 1 },
        { transform: `translate(${sx}px, ${sy + lift}px) scale(1.2) rotate(-4deg)`, opacity: 1, offset: 0.22 },
        { transform: `translate(${ex}px, ${ey}px) scale(1.7) rotateY(180deg)`, opacity: 0.9, offset: 0.8 },
        { transform: `translate(${ex}px, ${ey}px) scale(2.3) rotateY(360deg)`, opacity: 0 },
      ]
      : [
        { transform: `translate(${sx}px, ${sy}px) scale(${s0})`, opacity: 1 },
        { transform: `translate(${sx}px, ${sy + lift}px) scale(${dp ? 0.6 : 1.18}) rotate(${-rot * 0.3}deg)`, opacity: 1, offset: 0.24 },
        { transform: `translate(${(sx + ex) / 2}px, ${Math.min(sy + lift, ey) - r.height * 0.5}px) scale(0.7) rotate(${rot}deg)`, opacity: 1, offset: 0.62 },
        { transform: `translate(${ex}px, ${ey}px) scale(0.22) rotate(${rot * 2}deg)`, opacity: 0.4 },
      ];
    fly.animate(kf, { duration: dur, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' }).onfinish = () => {
      fly.remove();
      burstAt(tx, ty, { color: col, count: c.special ? 22 : 14, scale: c.special ? 3 : 2.2, colors: [col, '#ffffff', '#ffd84a'] });
      if (!c.special) this.dropRing(tx, ty, col);
    };
    // the empty slot pulses while the next card is on its way
    sl.el.classList.remove('played');
    void sl.el.offsetWidth;
    sl.el.classList.add('played');
    setTimeout(() => sl.el.classList.remove('played'), 400);
  }
  /** Ground ring where a card lands. */
  dropRing(x, y, col) {
    const el = h('div', { class: 'bh-dropring', style: { left: x + 'px', top: y + 'px', '--rc': col } });
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 600);
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
      this.emotePop.remove();
      this.emotePop = null;
      return;
    }
    const r = this.emoteBtn.getBoundingClientRect();
    const pop = h('div', { class: 'bh-emotes' }, EMOTES.map((em, i) => button(em.text, () => { this.toggleEmotes(); this.hd.emote(i); }, 'white sm', { icon: em.icon })));
    pop.style.left = Math.max(4, r.left) + 'px';
    pop.style.bottom = engine.height - r.top + 8 + 'px';
    this.root.appendChild(pop);
    this.emotePop = pop;
  }
  /** Show an emote bubble over a side's Commander (or Lab). */
  showEmote(si, i) {
    const em = EMOTES[i];
    if (!em) return;
    const ch = this.view.cmds?.[si];
    const target = ch ?? this.view.labs?.[si]?.seat;
    if (!target) return;
    speech(target, em.text, 2.2, { offsetY: 6 });
    audio.play('emote', { pitch: si === 0 ? 1 : 0.85 });
    if (ch && !ch.busy) { ch.play('sitCheer'); ch.expr(em.icon === 'skull' ? 'angry' : 'happy', em.icon === 'alert' ? 'open' : 'grin', 1.4); ch.reactT = 1.4; }
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
        bigBanner('2X POWER!', 'Last minute - spend it fast!', { dur: 1.6, color: '#ffd84a' });
        audio.play('bell');
        break;
      case 'overtime':
        bigBanner('OVERTIME!', 'Hit their base to win!', { dur: 1.8, color: '#ffb84a' });
        audio.play('alarm');
        break;
      case 'labUp': {
        const sd = this.sides[ev.side];
        bump(sd.el.querySelector('.bh-base'));
        sparkle(sd.el.querySelector('.bh-base'), { count: 14, colors: ['#ffd84a', '#ffffff', '#8fd4ff'] });
        if (ev.side === 0) this.baseUpFx(ev);
        break;
      }
      case 'megaReady':
        if (ev.side === 0 && this.megaEl) {
          bump(this.megaEl);
          burst(this.megaEl, { color: '#ff2e88', count: 20 });
        }
        break;
      case 'signature':
        this.sigCutIn(ev.side);
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
    burst(b, { color: '#c08aff', count: 24, scale: 1.4, colors: ['#ffd84a', '#ffffff', '#c08aff', '#8fd4ff'] });
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
    ultCutIn({ img, title: sg.name.toUpperCase() + '!', kicker: si === 0 ? `${s.cmd.name ?? 'COMMANDER'} ULTIMATE` : 'RIVAL ULTIMATE', color: si === 0 ? SIG_COL[sg.id] ?? '#ffd84a' : '#ff3d55', side: si, dur: si === 0 ? 1.25 : 0.95 });
    if (si === 0 && this.sig) burst(this.sig, { color: this.sigCol, count: 22, scale: 2 });
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
    u.liq.style.height = (Math.min(1, k) * 100).toFixed(1) + '%';
    if (u.pct.textContent !== label) u.pct.textContent = label;
    u.el.classList.toggle('ready', state === 'ready');
    u.el.classList.toggle('hot', k >= 0.5 && state !== 'used');
    u.el.classList.toggle('used', state === 'used');
    if (state === 'ready' && u.wasReady === false) { bump(u.el, 'pop'); burst(u.el, { color: getComputedStyle(u.el).getPropertyValue('--uc') || '#ffd84a', count: 16 }); audio.play('magic', { pitch: 1.3 }); }
    u.wasReady = state === 'ready';
  }

  update(dt) {
    const sim = this.sim, s = sim.sides[0];
    this.layoutT = (this.layoutT ?? 0) - dt;
    if (this.layoutT <= 0) {
      this.layoutT = 0.5;
      this.placeMega();
      const hidden = this.root.style.display === 'none';
      plateBounds.minY = hidden ? 0 : this.mini.getBoundingClientRect().bottom + 4;
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
    if (sim.overtime) { this.tag.textContent = 'OVERTIME 3x'; this.tag.className = 'tag ot'; }
    else if (sim.doubleEnergy) { this.tag.textContent = '2x POWER'; this.tag.className = 'tag'; }
    else this.tag.className = 'tag hidden';
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
    // base upgrade
    const oc = BASE_UPGRADES[s.overclock];
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
    // base HP banners (+ a shake / flash when hit)
    for (let i = 0; i < 2; i++) {
      const sd = this.sides[i], b = sim.sides[i].lab;
      const frac = Math.max(0, b.hp / b.maxHp);
      if (b.hp !== sd.lastHp) {
        if (sd.lastHp > 0 && b.hp < sd.lastHp - 0.5 && !reduced()) {
          const big = sd.lastHp - b.hp > b.maxHp * 0.04;
          bump(sd.el, big ? 'hurtbig' : 'hurt');
        }
        sd.lastHp = b.hp;
        sd.fill.style.width = (frac * 100).toFixed(1) + '%';
        sd.hpv.textContent = String(Math.max(0, Math.ceil(b.hp)));
        sd.el.classList.toggle('low', frac < 0.3);
      }
      sd.ghostFrac = Math.max(frac, sd.ghostFrac + (frac - sd.ghostFrac) * Math.min(1, dt * 3));
      sd.ghost.style.width = (sd.ghostFrac * 100).toFixed(1) + '%';
      const t = sim.sides[i].overclock;
      if (t !== sd.lastTier) {
        sd.lastTier = t;
        sd.tier.textContent = `T${t + 1} ${BASE_UPGRADES[t].name}`;
      }
    }
    // commander ultimate + skills
    if (this.sig) {
      const k = Math.min(1, s.sig);
      const ready = k >= 1 && !sim.over;
      this.setUlt(this.sigU, k, ready ? 'ready' : 'charging', ready ? 'TAP!' : `${Math.floor(k * 100)}%`);
      for (let i = 0; i < this.skillEls.length; i++) {
        const se = this.skillEls[i];
        const cd = Math.max(0, s.skillCds[i]);
        se.el.classList.toggle('cool', cd > 0);
        se.cdv.style.height = cd > 0 ? ((cd / se.sk.cd) * 100).toFixed(1) + '%' : '0%';
        se.cdn.textContent = cd > 0 ? String(Math.ceil(cd)) : '';
      }
    }
    // minimap
    const units = sim.units.filter((u) => !u.dead);
    while (this.dots.length < units.length) {
      const d = h('i', { class: 'dot' });
      this.mini.appendChild(d);
      this.dots.push(d);
    }
    this.dots.forEach((d, i) => {
      const u = units[i];
      if (!u) { d.style.display = 'none'; return; }
      d.style.display = '';
      d.className = `dot s${u.side}${u.size > 1.5 || u.boss ? ' big' : ''}`;
      d.style.left = this.mx(u.x) + '%';
    });
    for (const t of this.miniTowers) t.el.classList.toggle('dead', !t.b.alive);
    const v = this.view;
    if (v.halfW) {
      const l = this.mx(v.camX - v.halfW), r = this.mx(v.camX + v.halfW);
      this.miniWin.style.left = Math.max(0, l) + '%';
      this.miniWin.style.width = Math.max(4, Math.min(100, r) - Math.max(0, l)) + '%';
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
  /** Tuck the HUD away while a cutscene owns the screen. */
  setCinematic(on) {
    this.root.classList.toggle('cine', !!on);
    document.body.classList.toggle('cine', !!on);
    if (on) { this.dragEnd(); this.emotePop?.remove(); this.emotePop = null; }
  }
  dispose() {
    this.dragEnd();
    document.body.classList.remove('cine');
    this.root.remove();
  }
}

// ---------------------------------------------------------------------------
// VS intro: two team bands slam in with Commander portraits, names, trophies
// and decks, then slide away.

export async function vsIntro(parent, cfg, opts = {}) {
  const band = (s, i) => {
    const cmd = s.commander;
    const por = cmd ? charPortrait(cmd.char ?? cmd.id, { override: cmd.override, size: 160, eyes: i ? 'angry' : 'determined', mouth: 'grin' }) : opts.portraits?.[i];
    return h('div', { class: `vs-band s${i}` },
      por ? h('img', { class: 'por', src: por }) : null,
      h('div', { class: 'info' },
        h('div', { class: 'nm' }, s.name ?? (i ? 'Rival' : 'You')),
        h('div', { class: 'meta' },
          s.trophies !== undefined ? h('span', { class: 'row', style: { gap: '0.2em' } }, icon('trophy'), String(s.trophies)) : null,
          s.labLevel ? h('span', { class: 'row', style: { gap: '0.2em' } }, icon('lab'), `Lv ${s.labLevel}`) : null,
          s.clan ? h('span', { class: 'c-muted' }, s.clan) : null),
        opts.showDecks !== false ? h('div', { class: 'deck' }, (s.deck || []).slice(0, 8).map((c) => {
          const el = cardEl(c.id, { owned: { level: c.level }, size: 'mini', noLevel: true, cost: false });
          el.style.width = 'calc(var(--u) * 7.4)';
          return el;
        })) : null));
  };
  const wrap = h('div', { class: 'vs-wrap' }, h('div', { class: 'vs-flash' }), band(cfg.sides[1], 1),
    h('div', { class: 'vs-mid' }, h('div', { class: 'px-rays vs-rays' }), h('div', { class: 'vs-bolt' }), h('div', { class: 'vs-x' }, 'VS')), band(cfg.sides[0], 0));
  parent.appendChild(wrap);
  audio.play('whoosh', { pitch: 0.8 });
  setTimeout(() => { audio.play('thud'); engine.shake(0.2); }, 380);
  await new Promise((r) => setTimeout(r, opts.hold ?? 1900));
  wrap.classList.add('out');
  audio.play('whoosh', { pitch: 1.2 });
  await new Promise((r) => setTimeout(r, 380));
  wrap.remove();
}

/** Card definition helper used by the scene. */
export function cardInfo(c) {
  return cardDef(c.id);
}
