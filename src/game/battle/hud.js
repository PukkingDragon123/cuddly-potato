// Battle HUD (DOM): labs' HP, timer, energy + Lab upgrade, deploy cards,
// spells, Commander signature & skills.
import './battle.css';
import { h, icon, $ui } from '../../ui/ui.js';
import { swarmThumb, charPortrait } from '../../ui/thumbs.js';
import { SWARMS } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { LAB_LEVELS } from '../../data/labs.js';
import { BANNERS } from '../../data/season.js';
import { audio } from '../../core/audio.js';

const fmtT = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class BattleHUD {
  constructor(sim, cfg, handlers) {
    this.sim = sim;
    this.cfg = cfg;
    this.hd = handlers;
    this.cache = {};
    const s0 = sim.sides[0], s1 = sim.sides[1];
    const side = (i) => {
      const c = cfg.sides[i];
      const banner = BANNERS[c.banner] || BANNERS.default;
      const name = h('div', { class: 'bname outline-sm', style: { background: banner.css } },
        i === 1 && c.ghost ? h('span', { class: 'tag' }, 'GHOST AI') : null,
        c.trophies !== undefined ? h('span', {}, icon('trophy'), ' ', String(c.trophies)) : null,
        h('span', {}, c.name));
      if (banner.animated) name.classList.add('anim-' + banner.animated);
      const bar = h('div', { class: 'bar labbar ' + (i === 0 ? 'blue' : 'pink') }, h('i', { style: { width: '100%' } }), h('span', { class: 'outline-sm' }, ''));
      return { el: h('div', { class: 'bplayer' + (i === 1 ? ' right' : '') }, name, bar), bar };
    };
    this.p0 = side(0);
    this.p1 = side(1);
    this.timer = h('div', { class: 'btimer px-box dark' }, '3:00');
    const top = h('div', { class: 'btop' }, this.p0.el, h('div', { class: 'spacer' }), this.timer, h('div', { class: 'spacer' }), this.p1.el);
    this.pauseBtn = h('button', { class: 'btn small gray icon-only bpause', onclick: (e) => { e.stopPropagation(); audio.play('click'); handlers.pause(); } }, h('span', { class: 'display', style: { fontSize: '0.7em' } }, 'II'));

    // energy panel
    this.enNum = h('span', {}, '0');
    this.enMax = h('small', {}, '/0');
    this.enBar = h('i', { style: { width: '0%' } });
    this.labBtn = h('button', { class: 'btn small blabup green', type: 'button' }, h('span', { class: 'l1' }, 'LAB 1'), h('span', { class: 'l2' }, ''));
    this.labBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); handlers.upgradeLab(); });
    this.energy = h('div', { class: 'benergy px-box dark' }, h('div', { class: 'num' }, icon('energy'), this.enNum, this.enMax), h('div', { class: 'bar' }, this.enBar), this.labBtn);

    // cards
    this.cards = s0.deck.map((c, i) => {
      const def = SWARMS[c.id];
      const el = h('div', { class: `bcard ${def.rarity}` },
        h('img', { src: swarmThumb(c.id, c.variant, c.skin, 80), draggable: 'false' }),
        h('div', { class: 'fill' }),
        h('div', { class: 'cd' }),
        h('div', { class: 'bcost' }, icon('energy'), String(sim.cardCost(0, i))),
        h('div', { class: 'key' }, String(i + 1)),
        def.isMega ? h('div', { class: 'mega' }, 'MEGA') : null);
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); handlers.deploy(i); });
      return { el, fill: el.querySelector('.fill'), cd: el.querySelector('.cd') };
    });
    const cardRow = h('div', { class: 'bcards' }, this.cards.map((c) => c.el));

    // spells
    this.spells = s0.spells.map((sp, i) => {
      const def = SPELLS[sp.id];
      const el = h('div', { class: 'bspell', style: { background: def.color } },
        h('div', { class: 'nm outline-sm' }, def.name),
        icon(def.icon),
        h('div', { class: 'cd' }),
        h('div', { class: 'bcost' }, icon('energy'), String(def.cost)));
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); handlers.spell(i); });
      return { el, cd: el.querySelector('.cd') };
    });
    // commander
    const cmd = cfg.sides[0].commander;
    this.sig = null;
    this.skills = [];
    let cmdEl = null;
    if (s0.cmd) {
      const sigEl = h('div', { class: 'bsig' },
        h('img', { class: 'por', src: charPortrait(cmd.char ?? cmd.id, { override: cmd.override }), draggable: 'false' }),
        h('div', { class: 'charge' }),
        icon(s0.cmd.signature.icon, 'sicon'),
        h('div', { class: 'lbl outline-sm' }, s0.cmd.signature.name));
      sigEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); handlers.signature(); });
      this.sig = { el: sigEl, charge: sigEl.querySelector('.charge') };
      this.skills = s0.skills.map((sk, k) => {
        const el = h('div', { class: 'bskill', title: sk.name }, icon(sk.icon), h('div', { class: 'cd' }));
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); handlers.skill(k); });
        return { el, cd: el.querySelector('.cd') };
      });
      cmdEl = h('div', { class: 'bcmd' }, this.skills.length ? h('div', { class: 'bskills' }, this.skills.map((s) => s.el)) : null, sigEl);
    }
    const right = h('div', { class: 'bright' }, h('div', { class: 'bspells' }, this.spells.map((s) => s.el)), cmdEl);
    this.bottom = h('div', { class: 'bbottom' }, this.energy, cardRow, right);
    this.aimTip = h('div', { class: 'baimtip px-box cream hidden' }, 'Tap the battlefield to cast!');
    this.el = h('div', { class: 'bhud' }, top, this.pauseBtn, this.bottom, this.aimTip);
    $ui().appendChild(this.el);
    this.aiming = null;
    this.lastHp = [s0.labHp, s1.labHp];

    this.keyHandler = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '8') handlers.deploy(+k - 1);
      else if (k === 'q') handlers.spell(0);
      else if (k === 'w') handlers.spell(1);
      else if (k === 'e') handlers.spell(2);
      else if (k === ' ') { e.preventDefault(); handlers.signature(); }
      else if (k === 'u') handlers.upgradeLab();
      else if (k === 'z') handlers.skill(0);
      else if (k === 'x') handlers.skill(1);
      else if (k === 'escape') handlers.pause();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  setAiming(idx) {
    this.aiming = idx;
    this.spells.forEach((s, i) => s.el.classList.toggle('aiming', i === idx));
    this.aimTip.classList.toggle('hidden', idx === null);
    if (idx !== null) this.aimTip.textContent = `${SPELLS[this.sim.sides[0].spells[idx].id].name}: tap the battlefield!`;
  }

  set(el, key, prop, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    if (prop === 'text') el.textContent = val;
    else if (prop === 'h') el.style.height = val;
    else if (prop === 'w') el.style.width = val;
    else if (prop === 'cls') {
      const [name, on] = val.split(':');
      el.classList.toggle(name, on === '1');
    }
  }

  update() {
    const sim = this.sim;
    const s = sim.sides[0];
    const info = LAB_LEVELS[s.labLevel - 1];
    this.set(this.enNum, 'en', 'text', String(Math.floor(s.energy)));
    this.set(this.enMax, 'enm', 'text', '/' + info.max);
    this.set(this.enBar, 'enb', 'w', ((s.energy / info.max) * 100).toFixed(1) + '%');
    const l1 = this.labBtn.querySelector('.l1'), l2 = this.labBtn.querySelector('.l2');
    this.set(l1, 'lab1', 'text', `LAB ${s.labLevel}${info.upCost !== null ? ' ▲' : ' MAX'}`);
    this.set(l2, 'lab2', 'text', info.upCost !== null ? `Upgrade ⚡${info.upCost}` : 'Fully charged');
    const canUp = sim.canUpgradeLab(0);
    this.set(this.labBtn, 'labr', 'cls', 'ready:' + (canUp ? 1 : 0));
    this.set(this.labBtn, 'labd', 'cls', 'disabled:' + (canUp ? 0 : 1));
    // cards
    this.cards.forEach((c, i) => {
      const def = SWARMS[s.deck[i].id];
      const cost = sim.cardCost(0, i);
      const cdFrac = Math.max(0, s.cds[i]) / (def.cd || 1);
      this.set(c.cd, 'cd' + i, 'h', (Math.min(1, cdFrac) * 100).toFixed(0) + '%');
      this.set(c.fill, 'fl' + i, 'h', (Math.min(1, s.energy / cost) * 100).toFixed(0) + '%');
      const poor = s.energy < cost;
      this.set(c.el, 'poor' + i, 'cls', 'poor:' + (poor ? 1 : 0));
      const ready = !poor && s.cds[i] <= 0;
      if (this.cache['rdy' + i] === false && ready) {
        c.el.classList.remove('pop');
        void c.el.offsetWidth;
        c.el.classList.add('pop');
      }
      this.cache['rdy' + i] = ready;
      this.set(c.el, 'ready' + i, 'cls', 'ready:' + (ready ? 1 : 0));
    });
    this.spells.forEach((sp, i) => {
      const def = SPELLS[s.spells[i].id];
      this.set(sp.cd, 'scd' + i, 'h', (Math.min(1, Math.max(0, s.spellCds[i]) / def.cd) * 100).toFixed(0) + '%');
      this.set(sp.el, 'spoor' + i, 'cls', 'poor:' + (s.energy < def.cost ? 1 : 0));
    });
    if (this.sig) {
      this.set(this.sig.charge, 'sig', 'h', (s.sig * 100).toFixed(0) + '%');
      this.set(this.sig.el, 'sigr', 'cls', 'ready:' + (s.sig >= 1 ? 1 : 0));
      const lbl = this.sig.el.querySelector('.lbl');
      this.set(lbl, 'sigl', 'text', s.sig >= 1 ? 'READY! TAP!' : `${s.cmd.signature.name} ${Math.floor(s.sig * 100)}%`);
    }
    this.skills.forEach((sk, k) => {
      const def = s.skills[k];
      this.set(sk.cd, 'kcd' + k, 'h', (Math.min(1, Math.max(0, s.skillCds[k]) / def.cd) * 100).toFixed(0) + '%');
      this.set(sk.el, 'kr' + k, 'cls', 'ready:' + (s.skillCds[k] <= 0 ? 1 : 0));
    });
    // labs
    [this.p0, this.p1].forEach((p, i) => {
      const sd = sim.sides[i];
      const f = sd.labHp / sd.labMaxHp;
      this.set(p.bar.firstChild, 'lhp' + i, 'w', (f * 100).toFixed(1) + '%');
      this.set(p.bar.lastChild, 'lht' + i, 'text', `${Math.ceil(sd.labHp)}${sd.shield > 0 ? ' +🛡' + Math.ceil(sd.shield) : ''}`);
      if (sd.labHp < this.lastHp[i]) {
        p.bar.classList.add('flash');
        clearTimeout(p.flashTO);
        p.flashTO = setTimeout(() => p.bar.classList.remove('flash'), 80);
      }
      this.lastHp[i] = sd.labHp;
    });
    const left = sim.timeLimit - sim.t;
    this.set(this.timer, 'time', 'text', (sim.overtime ? 'OT ' : '') + fmtT(left));
    this.set(this.timer, 'ot', 'cls', 'ot:' + (sim.overtime ? 1 : 0));
  }

  hide() {
    this.el.style.transition = 'opacity 0.3s';
    this.el.style.opacity = '0';
    this.el.style.pointerEvents = 'none';
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.el.remove();
  }
}
