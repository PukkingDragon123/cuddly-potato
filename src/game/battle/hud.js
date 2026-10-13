// Battle HUD (DOM), Clash Royale layout in the bubbly lab skin:
//   top    - your (blue) and the rival's (red) name banners with each base's
//            HP bar + tier, the match timer with 2x / overtime tags, a lane
//            minimap
//   bottom - Commander portrait (signature charge) + skills, the hand of 4
//            cards with the NEXT card, the segmented electric POWER bar (one
//            cell per point; grows with the base tier), the BASE upgrade
//            button, the MEGA ultimate button and emotes.
// Input on cards is forwarded to the battle scene (tap/drag to deploy).
import './battle.css';
import { h, icon, iconURL, button, bigBanner, speech, sparkle, bump } from '../../ui/ui.js';
import { cardEl } from '../../ui/cards.js';
import { charPortrait } from '../../ui/thumbs.js';
import { cardDef } from '../../data/cards.js';
import { BASE_UPGRADES, MEGA } from '../../data/labs.js';
import { MEGAS } from '../../data/megas.js';
import { swarmThumb } from '../../ui/thumbs.js';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { FIELD } from './field.js';
import { plateBounds } from './view.js';

const fmtT = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const EMOTES = [
  { icon: 'smile', text: 'Good luck!' },
  { icon: 'heart', text: 'Thanks!' },
  { icon: 'star', text: 'Well played!' },
  { icon: 'alert', text: 'Oops!' },
  { icon: 'fire', text: 'WOW!' },
  { icon: 'skull', text: 'Grrr!' },
];

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

    // ------------------------------------------------------------ bottom
    // Commander: signature portrait + skills
    const cmd = cfg.sides[0].commander;
    this.cmdEl = h('div', { class: 'bh-cmd' });
    if (s0.cmd) {
      this.sigChg = h('div', { class: 'chg' });
      this.sigPct = h('div', { class: 'pct' }, '');
      this.sig = h('div', { class: 'bh-sig hit', title: s0.cmd.signature.name },
        this.sigChg,
        h('img', { class: 'por', src: charPortrait(cmd.char ?? cmd.id, { override: cmd.override, size: 96, eyes: 'determined', mouth: 'grin' }) }),
        h('div', { class: 'ab' }, icon(s0.cmd.signature.icon ?? 'star')),
        this.sigPct);
      this.sig.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); handlers.signature(); });
      this.cmdEl.appendChild(this.sig);
      this.skillEls = s0.skills.map((sk, k) => {
        const cdv = h('div', { class: 'cdv' });
        const cdn = h('div', { class: 'cdn' }, '');
        const el = h('div', { class: 'bh-skill hit', title: sk.name }, icon(sk.icon ?? 'star'), cdv, cdn);
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); handlers.skill(k); });
        return { el, cdv, cdn, sk };
      });
      if (this.skillEls.length) this.cmdEl.appendChild(h('div', { class: 'bh-skills' }, this.skillEls.map((s) => s.el)));
    }
    // right: emote + base upgrade + MEGA ultimate
    this.ocV = h('span', { class: 'ocv' }, '');
    this.ocC = h('small', { class: 'occ' }, '');
    this.ocBtn = button(h('span', { class: 'oc' }, h('b', {}, 'UPGRADE BASE'), this.ocV, this.ocC), () => handlers.overclock(), 'purple sm bh-oc', { icon: 'lab' });
    this.emoteBtn = button('', () => this.toggleEmotes(), 'blue sm icon-only bh-emote', { icon: 'emote' });
    this.megaEl = null;
    if (s0.mega) {
      const def = MEGAS[s0.mega.id];
      this.megaLiq = h('div', { class: 'liq' }, h('i', { class: 'bub' }), h('i', { class: 'bub' }), h('i', { class: 'bub' }));
      this.megaPct = h('div', { class: 'pct' }, '0%');
      this.megaLock = h('div', { class: 'lockt' }, icon('lock'), `Needs ${BASE_UPGRADES[MEGA.minTier - 1].name}`);
      this.megaEl = h('div', { class: 'bh-mega hit', title: def?.name ?? 'MEGA', style: { '--mc': def?.color ?? '#ff2e88', '--mb': def?.bolt ?? '#ff2e88' } },
        this.megaLiq,
        h('img', { class: 'mg', src: swarmThumb(s0.mega.id, s0.mega.variant ?? 'base', null, 128), alt: '' }),
        h('div', { class: 'tg' }, icon('mega'), 'MEGA'),
        this.megaPct, this.megaLock);
      this.megaEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        audio.unlock();
        if (this.sim.canMega(0)) handlers.mega?.();
        else this.megaDeny();
      });
    }
    this.rightEl = h('div', { class: 'bh-right' }, this.emoteBtn, this.ocBtn, this.megaEl);

    // hand + next
    this.slots = [0, 1, 2, 3].map((i) => {
      const el = h('div', { class: 'bh-slot', 'data-slot': String(i) });
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); handlers.press(i, e); });
      return { el, key: null, dim: null };
    });
    this.nextBox = h('div', { class: 'bh-next' }, h('div', { class: 'lbl' }, 'NEXT'));
    this.nextKey = null;
    this.drop = h('div', { class: 'bh-drop', style: { backgroundImage: `url(${iconURL('power')})` } }, '5');
    this.segs = [];
    this.rate = h('span', { class: 'rate hidden' }, '');
    this.ebar = h('div', { class: 'bh-ebar' }, this.rate);
    this.setSegs(sim.maxPower(0));
    this.energyRow = h('div', { class: 'bh-energy' }, this.drop, this.ebar);
    this.deck = h('div', { class: 'bh-deck' },
      h('div', { class: 'bh-row' }, this.nextBox, h('div', { class: 'bh-hand' }, this.slots.map((s) => s.el))),
      this.energyRow);
    root.appendChild(h('div', { class: 'bh-bottom' }, h('div', { class: 'bh-above' }, this.cmdEl, this.rightEl), this.deck));
    this.refreshHand(true);
    this.lastE = -1;
    this.ticked = -1;
  }

  mount(parent) {
    parent.appendChild(this.root);
  }

  /** (Re)build the POWER cells: one per point of max power. */
  setSegs(n) {
    if (n === this.segs.length) return;
    for (const seg of this.segs) seg.remove();
    this.segs = Array.from({ length: n }, () => h('div', { class: 'seg' }, h('i')));
    for (const seg of this.segs) this.ebar.insertBefore(seg, this.rate);
    this.ebar.style.setProperty('--segs', n);
    this.lastE = -1;
  }

  /** % position of a world x on the minimap. */
  mx(x) {
    return ((x / FIELD.VIEW_X + 1) / 2) * 100;
  }

  // -------------------------------------------------------------------------
  // Hand

  refreshHand(initial = false) {
    const s = this.sim.sides[0];
    this.slots.forEach((slot, i) => {
      const k = s.hand[i];
      const c = k === undefined ? null : s.deck[k];
      const key = c ? `${k}` : null;
      if (key === slot.key) return;
      slot.key = key;
      slot.el.innerHTML = '';
      if (!c) return;
      const card = cardEl(c.id, { owned: { level: c.level, variant: c.variant, skin: c.skin }, level: c.level, priority: true });
      slot.el.appendChild(card);
      slot.dim = h('div', { class: 'dim' });
      card.appendChild(slot.dim);
      if (engine.width > engine.height || !('ontouchstart' in window)) slot.el.appendChild(h('div', { class: 'key' }, String(i + 1)));
      if (!initial) {
        slot.el.classList.remove('enter');
        void slot.el.offsetWidth;
        slot.el.classList.add('enter');
      }
      slot.card = c;
    });
    const nx = this.sim.nextCard(0);
    const nk = nx ? nx.id + nx.level : null;
    if (nk !== this.nextKey) {
      this.nextKey = nk;
      this.nextBox.querySelector('.gcard')?.remove();
      if (nx) this.nextBox.appendChild(cardEl(nx.id, { owned: { level: nx.level, variant: nx.variant, skin: nx.skin }, size: 'mini', noLevel: true }));
    }
  }

  select(slot) {
    this.sel = slot;
    this.slots.forEach((s, i) => s.el.classList.toggle('sel', i === slot));
  }
  slotEl(i) {
    return this.slots[i]?.el;
  }
  /** y (px) of the top of the deck panel: pointer above it = over the battlefield. */
  deckTop() {
    return this.deck.getBoundingClientRect().top;
  }
  isOverField(x, y) {
    if (y >= this.deckTop() - 4) return false;
    const r = this.rightEl.getBoundingClientRect(), c = this.cmdEl.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return false;
    if (x >= c.left && x <= c.right && y >= c.top && y <= c.bottom) return false;
    return true;
  }

  /** Floating copy of the card following the finger while dragging. */
  dragStart(slot) {
    this.dragEnd();
    const c = this.slots[slot].card;
    if (!c) return;
    this.slots[slot].el.classList.add('dragging');
    this.drag = h('div', { class: 'bh-drag' }, cardEl(c.id, { owned: { level: c.level, variant: c.variant, skin: c.skin }, noLevel: true }));
    this.root.appendChild(this.drag);
    this.dragSlot = slot;
  }
  dragMove(x, y, overField) {
    if (!this.drag) return;
    this.drag.style.transform = `translate(${x}px, ${y}px)`;
    this.drag.classList.toggle('over', !!overField);
  }
  dragEnd() {
    if (this.drag) this.drag.remove();
    this.drag = null;
    if (this.dragSlot !== undefined) this.slots[this.dragSlot]?.el.classList.remove('dragging');
    this.dragSlot = undefined;
  }

  hint(text, y = null) {
    const el = h('div', { class: 'bh-hint' }, text);
    el.style.top = (y ?? this.deckTop() - engine.height * 0.08) + 'px';
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
  needEnergy(cost) {
    this.hint(`Need ${cost} power!`);
    this.energyRow.classList.remove('shake');
    void this.energyRow.offsetWidth;
    this.energyRow.classList.add('shake');
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
    pop.style.right = Math.max(4, engine.width - r.right) + 'px';
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
    const b = speech(target, em.text, 2.2, { offsetY: 6 });
    void b;
    audio.play('emote', { pitch: si === 0 ? 1 : 0.85 });
    if (ch && !ch.busy) { ch.play('sitCheer'); ch.expr(em.icon === 'skull' ? 'angry' : 'happy', em.icon === 'alert' ? 'open' : 'grin', 1.4); ch.reactT = 1.4; }
  }

  // -------------------------------------------------------------------------
  // Events + per-frame refresh

  onEvent(ev) {
    switch (ev.type) {
      case 'cycle':
        if (ev.side === 0) this.refreshHand();
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
        if (ev.side === 0) {
          bump(this.ocBtn);
          bigBanner(ev.name.toUpperCase() + '!', `Base tier ${ev.tier} - more POWER, more HP`, { dur: 1.3, color: '#a35cff' });
        }
        break;
      }
      case 'megaReady':
        if (ev.side === 0 && this.megaEl) {
          bump(this.megaEl);
          sparkle(this.megaEl, { count: 24, colors: ['#ffd84a', '#ffffff', '#ff2e88'] });
        }
        break;
      default:
        break;
    }
  }

  megaDeny() {
    const s = this.sim.sides[0];
    if (!s.mega || this.sim.over) return;
    if (s.mega.used) this.hint('MEGA already used this battle!');
    else if (s.overclock + 1 < MEGA.minTier) this.hint(`Upgrade your base to ${BASE_UPGRADES[MEGA.minTier - 1].name} first!`);
    else if (s.mega.charge < 1) this.hint(`MEGA charging: ${Math.floor(s.mega.charge * 100)}% - deal damage!`);
    this.megaEl.classList.remove('shake');
    void this.megaEl.offsetWidth;
    this.megaEl.classList.add('shake');
    audio.play('deny');
  }

  update(dt) {
    const sim = this.sim, s = sim.sides[0];
    this.layoutT = (this.layoutT ?? 0) - dt;
    if (this.layoutT <= 0) {
      this.layoutT = 0.5;
      plateBounds.minY = this.root.style.display === 'none' ? 0 : this.mini.getBoundingClientRect().bottom + 4;
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
    // power
    this.setSegs(sim.maxPower(0));
    const e = s.energy;
    if (Math.abs(e - this.lastE) > 0.004) {
      this.lastE = e;
      const whole = Math.floor(e + 1e-6);
      this.drop.textContent = String(whole);
      this.segs.forEach((seg, i) => {
        const f = Math.max(0, Math.min(1, e - i));
        seg.classList.toggle('full', f >= 1);
        seg.firstChild.style.width = f >= 1 ? '' : (f * 100).toFixed(1) + '%';
      });
      this.ebar.classList.toggle('maxed', e >= sim.maxPower(0) - 0.001);
    }
    this.ebar.classList.toggle('x2', sim.doubleEnergy && !sim.overtime);
    this.ebar.classList.toggle('x3', sim.overtime);
    // cards: affordability dim
    this.slots.forEach((slot, i) => {
      const cost = sim.cardCost(0, i);
      const poor = e < cost;
      slot.el.classList.toggle('poor', poor);
      if (slot.dim) slot.dim.style.height = poor ? ((1 - e / cost) * 100).toFixed(1) + '%' : '0%';
    });
    // base upgrade
    const oc = BASE_UPGRADES[s.overclock];
    const nx = BASE_UPGRADES[s.overclock + 1];
    if (!nx) {
      this.ocV.textContent = oc.name;
      this.ocC.textContent = 'MAX TIER';
      this.ocBtn.classList.add('disabled', 'max');
    } else {
      this.ocV.textContent = `> ${nx.name}`;
      this.ocC.textContent = `${oc.cost} power`;
      this.ocBtn.classList.toggle('disabled', !sim.canUpgradeLab(0));
      this.ocBtn.classList.toggle('afford', sim.canUpgradeLab(0));
    }
    // mega ultimate
    if (this.megaEl) {
      const m = s.mega;
      const k = Math.min(1, m.charge);
      const locked = s.overclock + 1 < MEGA.minTier;
      const ready = sim.canMega(0);
      this.megaLiq.style.height = (m.used ? 0 : k * 100).toFixed(1) + '%';
      this.megaPct.textContent = m.used ? 'USED' : ready ? 'UNLEASH!' : k >= 1 ? 'READY' : `${Math.floor(k * 100)}%`;
      this.megaEl.classList.toggle('ready', ready);
      this.megaEl.classList.toggle('locked', locked && !m.used);
      this.megaEl.classList.toggle('used', !!m.used);
      this.megaEl.classList.toggle('full', k >= 1 && !m.used);
    }
    // base HP banners
    for (let i = 0; i < 2; i++) {
      const sd = this.sides[i], b = sim.sides[i].lab;
      const frac = Math.max(0, b.hp / b.maxHp);
      if (b.hp !== sd.lastHp) {
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
    // commander
    if (this.sig) {
      const k = Math.min(1, s.sig);
      this.sigChg.style.height = (k * 100).toFixed(1) + '%';
      const ready = k >= 1 && !sim.over;
      this.sig.classList.toggle('ready', ready);
      this.sigPct.textContent = ready ? 'TAP!' : `${Math.floor(k * 100)}%`;
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
  const wrap = h('div', { class: 'vs-wrap' }, band(cfg.sides[1], 1), h('div', { class: 'vs-x' }, 'VS'), band(cfg.sides[0], 0));
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
