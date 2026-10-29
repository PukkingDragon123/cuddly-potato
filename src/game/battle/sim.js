// Battle simulation: pure game logic (no rendering).
//
// Clash Royale card cycle in a Battle Cats side-view lane:
//   * electric POWER 0-10 (+1 / 2.8s), x2 in the last minute, x3 in overtime
//   * an 8-card deck cycling through a hand of 4 (+ the NEXT card): a played
//     card goes to the back of the deck and the next one slides in
//   * (legacy) SPECIAL card-trick support below; the current card set uses only
//     your hand: DRAW extra cards (hand up to 6), DISCARD, ECHO, COPY, cost
//     cuts and EXHAUST (once per battle)
//   * troops pop out of your base and march forward to fight automatically;
//     spells are aimed anywhere on the field
//   * each side has ONE base: it starts as a tent and can be upgraded mid-battle
//     (6 tiers: more POWER regen, bigger POWER tank, more HP, stronger cannon);
//     destroy the enemy base to win
//   * 3:00 regulation, overtime, then the base with more HP% wins
//   * Commanders on the base with a charged signature + skills, bosses, and the
//     MEGA ultimate: charged by fighting, unleashed once per battle in a cinematic.
// Fixed time-step with its own seeded RNG (host-authoritative friend battles).
import { SWARMS, swarmStats } from '../../data/swarms.js';
import { SPELLS, spellPower } from '../../data/spells.js';
import { COMMANDERS, cmdPower } from '../../data/commanders.js';
import { TOWERS, ENERGY, BASE_UPGRADES, MEGA, labPower } from '../../data/labs.js';
import { MEGAS } from '../../data/megas.js';
import { mulberry32 } from '../../core/util.js';
import { FIELD } from './field.js';

export const LAB_X = FIELD.LAB_X;
export const LAB_HALF = FIELD.LAB_HALF;
export const TURRET_X = FIELD.TURRET_X;
export const STEP = 1 / 30;
const GRAV = 32;
const REGULATION = 180;
const DOUBLE_AT = 120;
const OT_LEN = 60;
const DEPLOY_DELAY = 0.65;
const SIG_CINEMATIC = 1.35; // Commander ultimate wind-up (sim seconds, the battle holds still)
export const DECK_MAX = 8;
export const HAND_SIZE = 4;
export const HAND_MAX = 6;
// legacy name (old callers)
export const LINEUP_MAX = HAND_MAX;
/** Normal hand size for a deck of n cards: always keep a NEXT card when you can. */
export const handSizeFor = (n) => (n <= 2 ? n : Math.min(HAND_SIZE, n - 1));
/** Kept for old callers: cards no longer recharge (they cycle). */
export function rechargeTime() {
  return 0;
}

let UID = 1;

export class BattleSim {
  /**
   * cfg: { seed, timeLimit, sides: [SideCfg, SideCfg], boss?, noOvertime? }
   * SideCfg: { name, deck: [{ id, unit?, level, variant, skin, spell? }], commander: { id, level } | null,
   *            perks: {}, labLevel, hpMult? }
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed ?? ((Date.now() * 9301) >>> 0));
    this.t = 0;
    this.acc = 0;
    this.units = [];
    this.projectiles = [];
    this.zones = [];
    this.timers = [];
    this.movers = [];
    this.events = [];
    this.over = false;
    this.winner = -1;
    this.draw = false;
    this.regulation = cfg.timeLimit ?? REGULATION;
    this.timeLimit = this.regulation;
    this.noOvertime = !!cfg.noOvertime;
    this.overtime = false;
    this.doubleEnergy = false;
    this.paused = false;
    this.sides = cfg.sides.map((s, i) => this.makeSide(s, i));
    if (cfg.boss) this.spawnBoss(cfg.boss);
  }

  makeSide(s, i) {
    const perks = s.perks || {};
    const dir = i === 0 ? 1 : -1;
    const pow = labPower(s.labLevel ?? 1) * (s.hpMult ?? 1);
    const mk = (kind, x, half, T, hpMult = 1) => ({
      building: true, kind, side: i, x, half, hp: Math.round(T.hp * pow * hpMult), maxHp: Math.round(T.hp * pow * hpMult),
      dmg: T.dmg * labPower(s.labLevel ?? 1),
      atk: T.atk, range: T.range, cool: 0.6, alive: true, active: true, shield: 0, shieldT: 0, radius: half, dead: false, id: UID++,
    });
    const lab = mk('lab', i === 0 ? -LAB_X : LAB_X, LAB_HALF, TOWERS.lab, 1 + (perks.thickWalls ?? 0) / 100);
    lab.active = true;
    lab.baseHp = lab.maxHp;
    lab.baseDmg = lab.dmg * (1 + (perks.quickHands ?? 0) / 100);
    this.applyTier(lab, 0);
    const cmd = s.commander ? COMMANDERS[s.commander.id] : null;
    const lvl = s.commander?.level ?? 1;
    const skills = cmd ? cmd.skills.filter((k) => lvl >= k.level) : [];
    const deck = (s.deck || []).slice(0, DECK_MAX).map((c) => {
      const unit = c.unit ?? c.id;
      return { ...c, unit, spell: !!SPELLS[unit], special: !!SPELLS[unit]?.special };
    });
    const order = deck.map((_, k) => k);
    if (!s.noShuffle) {
      for (let k = order.length - 1; k > 0; k--) {
        const j = Math.floor(this.rng() * (k + 1));
        [order[k], order[j]] = [order[j], order[k]];
      }
    }
    const handSize = handSizeFor(deck.length);
    return {
      i, dir, labX: lab.x, name: s.name, deck,
      // the card cycle: `hand` and `queue` hold deck indices; `mod` = per-card cost change while in hand
      hand: order.slice(0, handSize), queue: order.slice(handSize), handSize, mod: deck.map(() => 0),
      echo: 0, last: null, exhausted: 0, baseLen: deck.length, cds: [],
      energy: Math.min(ENERGY.max, ENERGY.start + (perks.headStart ?? 0)), overclock: 0,
      lab, turret: null,
      mega: s.mega && MEGAS[s.mega.id] ? { id: s.mega.id, variant: s.mega.variant ?? 'base', level: s.mega.level ?? 1, charge: s.mega.charge ?? 0, used: false } : null,
      cmd, cmdLevel: lvl, sig: 0.15, skills, skillCds: skills.map((k) => Math.min(k.cd, 10)),
      perks, buffs: { rally: 0, dance: 0, immortal: 0, surge: 0, frenzy: 0, haste: 0, armorWin: 0, overclock: 0 },
      nextGiant: null,
      stats: { deployed: 0, kills: 0, dmg: 0, spells: 0, sigs: 0, food: 0, deployById: {}, towerDmg: 0 },
      power: cmdPower(lvl),
    };
  }

  /** Base stats for upgrade tier index k (0 = tent). */
  applyTier(b, k) {
    const T = BASE_UPGRADES[k];
    const oldMax = b.maxHp;
    b.maxHp = Math.round(b.baseHp * T.hp);
    if (k > 0) b.hp = Math.min(b.maxHp, b.hp + (b.maxHp - oldMax) + b.maxHp * 0.06);
    b.dmg = b.baseDmg * T.dmg;
    b.range = T.range;
  }
  /** Max POWER for a side (grows with the base tier). */
  maxPower(si) {
    const s = this.sides[si];
    return BASE_UPGRADES[s.overclock].max;
  }

  emit(type, data = {}) {
    data.type = type;
    data.t = this.t;
    this.events.push(data);
  }
  later(delay, fn) {
    this.timers.push({ at: this.t + delay, fn });
  }
  rand() {
    return this.rng();
  }

  // -------------------------------------------------------------------------
  // Queries

  buildings(si) {
    const s = this.sides[si];
    return s.lab.alive ? [s.lab] : [];
  }
  /** The enemy base facing side si's troops. */
  frontBuilding(si) {
    const en = this.sides[1 - si];
    return en.lab.alive ? en.lab : null;
  }
  /** x of the face of a building that troops of side `fromSide` hit. */
  faceX(b, fromSide) {
    return b.x - this.sides[fromSide].dir * b.half;
  }
  handCard(si, slot) {
    const s = this.sides[si];
    const k = s.hand[slot];
    return k === undefined ? null : s.deck[k];
  }
  nextCard(si) {
    const s = this.sides[si];
    return s.queue.length ? s.deck[s.queue[0]] : null;
  }
  cardCost(si, slot) {
    const c = this.handCard(si, slot);
    if (!c) return Infinity;
    const s = this.sides[si];
    return Math.max(0, ((c.spell ? SPELLS[c.unit] : SWARMS[c.unit])?.elixir ?? 3) + (s.mod[s.hand[slot]] ?? 0));
  }
  /** Cards don't recharge any more (they cycle); kept for old callers. */
  slotCd() {
    return 0;
  }
  slotRecharge() {
    return 1;
  }
  canPlay(si, slot) {
    return !this.over && !!this.handCard(si, slot) && this.sides[si].energy >= this.cardCost(si, slot);
  }
  overclockInfo(si) {
    return BASE_UPGRADES[this.sides[si].overclock];
  }
  canUpgradeLab(si) {
    const s = this.sides[si];
    const info = BASE_UPGRADES[s.overclock];
    return !this.over && info.cost !== null && s.energy >= info.cost;
  }
  canMega(si) {
    const s = this.sides[si];
    return !this.over && !this.cinematic && !!s.mega && !s.mega.used && s.mega.charge >= 1 && s.overclock + 1 >= MEGA.minTier;
  }
  /** Allowed deploy range [min, max] in x for a side's troops. */
  deployRange(si) {
    const s = this.sides[si];
    const en = this.sides[1 - si];
    const back = s.labX + s.dir * (LAB_HALF + 0.2);
    const front = si === 0 ? FIELD.DEPLOY_MAX : -FIELD.DEPLOY_MAX; // own half up to the centre line
    void en;
    return si === 0 ? [back, front] : [front, back];
  }
  clampDeploy(si, x) {
    const [a, b] = this.deployRange(si);
    return Math.max(a, Math.min(b, x));
  }
  enemiesOf(si) {
    return this.units.filter((u) => !u.dead && u.side !== si);
  }
  alliesOf(si) {
    return this.units.filter((u) => !u.dead && u.side === si);
  }
  /** The enemy unit closest to side si's Lab. */
  frontEnemyX(si) {
    const s = this.sides[si];
    let best = null, bd = Infinity;
    for (const e of this.units) {
      if (e.dead || e.side === si) continue;
      const d = (e.x - s.labX) * s.dir;
      if (d < bd) { bd = d; best = e; }
    }
    return best ? best.x : null;
  }
  /** Frontmost ally of side si (closest to the enemy Lab). */
  frontAllyX(si) {
    const s = this.sides[si];
    let best = s.labX + s.dir * (LAB_HALF + 1), bd = -Infinity;
    for (const u of this.units) {
      if (u.dead || u.side !== si) continue;
      const d = u.x * s.dir;
      if (d > bd) { bd = d; best = u.x; }
    }
    return best;
  }
  densestEnemyX(si, radius = 2) {
    const es = this.enemiesOf(si);
    let best = null, bc = 0;
    for (const a of es) {
      let c = 0;
      for (const b of es) if (Math.abs(a.x - b.x) <= radius) c += b.boss ? 3 : 1 + b.cost / 6;
      if (c > bc) { bc = c; best = a.x; }
    }
    return best === null ? null : { x: best, count: bc };
  }

  // -------------------------------------------------------------------------
  // Player actions

  /**
   * Play the card in hand slot `slot`. x = drop position (troops: clamped to
   * your half, default just in front of your Lab; spells: required target).
   */
  play(si, slot, x = null, free = false) {
    const s = this.sides[si];
    const card = this.handCard(si, slot);
    if (!card || this.over) return false;
    const cost = this.cardCost(si, slot);
    if (!free) {
      if (s.energy < cost) return false;
      s.energy -= cost;
      if (s.perks.bargain && this.rand() * 100 < s.perks.bargain) {
        s.energy = Math.min(this.maxPower(si), s.energy + 1);
        this.emit('refund', { side: si });
      }
    }
    // cycle: the played card goes to the back of the deck, the next one slides in
    this.cycleOut(si, slot, card.temp || (card.special && SPELLS[card.unit].exhaust));
    if (card.special) {
      this.castSpecial(si, card);
    } else if (card.spell) {
      const tx = x ?? this.densestEnemyX(si)?.x ?? this.sides[1 - si].labX;
      this.castSpell(si, card, Math.max(-FIELD.VIEW_X, Math.min(FIELD.VIEW_X, tx)));
    } else {
      // troops pop out of the base (tap) or drop where you dragged them in your half
      const dx = x === null ? s.labX + s.dir * (LAB_HALF + 0.35) : this.clampDeploy(si, x);
      const echoing = s.echo > 0;
      const dcard = echoing ? { ...card, echoBoost: SPELLS.doubleUp.boost } : card;
      this.deployTroop(si, dcard, dx);
      // ECHO: deploy it again
      if (echoing) {
        s.echo--;
        this.later(0.45, () => { if (!this.over) this.deployTroop(si, dcard, dx - s.dir * 0.6, true); });
        this.emit('echo', { side: si, card: card.id, x: dx });
      }
    }
    if (!card.special) s.last = { ...card, temp: false };
    this.emit('cycle', { side: si, slot, card: card.id, cost, special: card.special });
    return true;
  }

  /** Remove hand slot `slot`: back of the deck (or gone if exhausted), refill from the deck. */
  cycleOut(si, slot, exhaust = false) {
    const s = this.sides[si];
    const k = s.hand[slot];
    s.mod[k] = 0;
    // a GOLDEN draw is golden once
    if (s.deck[k].goldenOnce) s.deck[k] = { ...s.deck[k], boost: 0, goldenOnce: false };
    if (exhaust) {
      s.exhausted++;
      const pool = s.hand.length - 1 + s.queue.length;
      s.handSize = Math.min(s.handSize, handSizeFor(pool));
    } else s.queue.push(k);
    if (s.hand.length > s.handSize || !s.queue.length) s.hand.splice(slot, 1);
    else s.hand[slot] = s.queue.shift();
  }
  /** DRAW n cards from the deck into the hand (up to HAND_MAX). Returns how many were drawn. */
  drawCards(si, n) {
    const s = this.sides[si];
    let d = 0;
    while (d < n && s.hand.length < HAND_MAX && s.queue.length) {
      s.hand.push(s.queue.shift());
      d++;
    }
    if (d) this.emit('draw', { side: si, n: d });
    return d;
  }

  /** SPECIAL cards: tricks that play with your hand and your draw. */
  castSpecial(si, card) {
    const s = this.sides[si];
    const id = card.unit;
    const def = SPELLS[id];
    s.stats.spells++;
    s.stats['cast_' + id] = (s.stats['cast_' + id] ?? 0) + 1;
    let info = '';
    switch (id) {
      case 'quickDraw': {
        const n = this.drawCards(si, def.draw);
        s.buffs.haste = def.haste;
        info = (n ? `Drew ${n}` : 'Hand full!') + ' + HASTE';
        break;
      }
      case 'energyDrink': {
        s.energy = Math.min(this.maxPower(si), s.energy + def.gain);
        s.buffs.frenzy = def.frenzy;
        info = `+${def.gain} POWER + FRENZY`;
        break;
      }
      case 'couponBook': {
        for (const k of s.hand) s.mod[k] -= def.discount;
        s.buffs.armorWin = def.armorWindow;
        info = 'Hand -1 cost + ARMOR';
        break;
      }
      case 'adrenaline': {
        s.buffs.surge = def.surge;
        info = `SURGE +${Math.round(def.amt * 100)}% damage`;
        break;
      }
      case 'ironCoat': {
        let n = 0;
        for (const u of this.alliesOf(si)) { if (u.mega) continue; u.shieldHp = Math.max(u.shieldHp ?? 0, u.maxHp * def.armor); n++; this.emit('shield', { unit: u }); }
        info = n ? `${n} troops ARMORED` : 'No troops on the field';
        break;
      }
      case 'titanSerum': {
        s.nextGiant = { ...def.giant };
        info = 'Next troop turns GIANT';
        break;
      }
      case 'overclockChip': {
        s.buffs.overclock = def.overclock;
        info = 'Base OVERCLOCKED';
        break;
      }
      case 'timeFreeze': {
        let n = 0;
        for (const e of this.enemiesOf(si)) {
          if (e.mega) continue;
          e.buffs.freeze = Math.max(e.buffs.freeze, def.freezeAll * (e.boss ? 0.4 : 1));
          n++;
        }
        info = `${n} enemies FROZEN`;
        break;
      }
      case 'trashCompactor': {
        const n = s.hand.length;
        for (const k of s.hand) {
          s.mod[k] = 0;
          if (!s.deck[k].temp) s.queue.push(k);
        }
        s.hand = [];
        // the compactor itself goes to the very bottom of the deck
        const me = s.queue.filter((k) => s.deck[k].unit === id);
        s.queue = s.queue.filter((k) => s.deck[k].unit !== id).concat(me);
        s.handSize = handSizeFor(s.queue.length);
        while (s.hand.length < s.handSize && s.queue.length) s.hand.push(s.queue.shift());
        s.energy = Math.min(this.maxPower(si), s.energy + n);
        if (n) {
          const bx = s.labX + s.dir * 3.5;
          this.areaDamage(si, bx, def.radius, def.blast * n, { kind: 'acid' });
          this.emit('impact', { x: bx, radius: def.radius, kind: 'acid', side: si });
        }
        info = `Discarded ${n}: +${n} POWER + BLAST`;
        break;
      }
      case 'doubleUp': {
        s.echo += def.echo;
        info = 'Next troop x2';
        break;
      }
      case 'copyCat': {
        if (s.last && s.hand.length < HAND_MAX) {
          s.deck.push({ ...s.last, temp: true, boost: (s.last.boost ?? 0) + def.boost });
          const k = s.deck.length - 1;
          s.mod.push(-1);
          s.hand.push(k);
          info = 'Copied ' + ((s.last.spell ? SPELLS[s.last.unit] : SWARMS[s.last.unit])?.name ?? '');
        } else info = s.last ? 'Hand full!' : 'Nothing to copy';
        break;
      }
      case 'goldenTicket': {
        const costOf = (k) => (s.deck[k].spell ? SPELLS[s.deck[k].unit] : SWARMS[s.deck[k].unit])?.elixir ?? 0;
        let best = -1;
        for (let q = 0; q < s.queue.length; q++) if (!s.deck[s.queue[q]].special && (best < 0 || costOf(s.queue[q]) > costOf(s.queue[best]))) best = q;
        if (best >= 0 && s.hand.length < HAND_MAX) {
          const k = s.queue.splice(best, 1)[0];
          s.mod[k] = -99;
          s.deck[k] = { ...s.deck[k], boost: def.boost, goldenOnce: true };
          s.hand.push(k);
          info = 'Free ' + ((s.deck[k].spell ? SPELLS[s.deck[k].unit] : SWARMS[s.deck[k].unit])?.name ?? '');
        } else info = 'Nothing to draw';
        break;
      }
      default:
        break;
    }
    this.emit('special', { side: si, id, info, x: s.labX });
  }
  // legacy alias used by old callers: deploy(si, slot)
  deploy(si, slot, free = false) {
    return this.play(si, slot, null, free);
  }

  deployTroop(si, card, x, echo = false) {
    const s = this.sides[si];
    const def = SWARMS[card.unit];
    const n = def.count ?? 1;
    // stat boosts: MUTATED / GOLDEN cards, ECHO clones, GIANT serum, ARMOR window
    let hp = 1 + (card.boost ?? 0), dmg = 1 + (card.boost ?? 0), scale = 1;
    const g = echo ? s.lastGiant : s.nextGiant;
    if (g) { hp *= g.hp; dmg *= g.dmg; scale = g.scale; }
    if (!echo) { s.lastGiant = g; s.nextGiant = null; }
    if (card.echoBoost) { hp *= 1 + card.echoBoost; dmg *= 1 + card.echoBoost; }
    const armor = s.buffs.armorWin > 0 ? SPELLS.couponBook.armor : 0;
    for (let k = 0; k < n; k++) {
      const u = this.spawnUnit(si, card, { x: x - s.dir * k * 0.42, z: (k - (n - 1) / 2) * 0.55, delay: DEPLOY_DELAY + k * 0.05, hpMult: hp, dmgMult: dmg, scale });
      if (armor) u.shieldHp = u.maxHp * armor;
      if (g) this.emit('giant', { unit: u });
    }
    s.stats.deployed += n;
    const key = card.id;
    s.stats.deployById[key] = (s.stats.deployById[key] ?? 0) + n;
    if (def.series === 'food') s.stats.food += n;
    this.emit('deploy', { side: si, id: card.unit, card: card.id, x, count: n, echo });
  }

  upgradeLab(si) {
    if (!this.canUpgradeLab(si)) return false;
    const s = this.sides[si];
    s.energy -= BASE_UPGRADES[s.overclock].cost;
    s.overclock++;
    this.applyTier(s.lab, s.overclock);
    this.emit('labUp', { side: si, level: s.overclock + 1, tier: s.overclock + 1, name: BASE_UPGRADES[s.overclock].name });
    return true;
  }

  // -------------------------------------------------------------------------
  // MEGA ultimate

  addMegaCharge(si, amt) {
    const m = this.sides[si]?.mega;
    if (!m || m.used || m.charge >= 1) return;
    m.charge = Math.min(1, m.charge + amt);
    if (m.charge >= 1) this.emit('megaReady', { side: si });
  }
  /** Unleash the Mega: a cinematic (the battle freezes), then it breaks out. */
  useMega(si) {
    if (!this.canMega(si)) return false;
    const s = this.sides[si];
    s.mega.used = true;
    this.cinematic = MEGA.cinematic;
    this.cinematicSide = si;
    this.cinematicKind = 'mega';
    this.emit('megaStart', { side: si, id: s.mega.id, variant: s.mega.variant, x: s.labX + s.dir * (LAB_HALF + 2.2) });
    return true;
  }
  megaArrive(si) {
    const s = this.sides[si];
    const def = MEGAS[s.mega.id];
    const x = s.labX + s.dir * (LAB_HALF + 2.2);
    const u = this.spawnUnit(si, { id: s.mega.id, unit: s.mega.id, level: s.mega.level, variant: s.mega.variant }, { x, z: 0, delay: 0, kb: 1, hpMult: labPower(s.mega.level) });
    u.mega = true;
    u.life = MEGA.life;
    u.specT = 2.2;
    u.z = 0;
    // breakout shockwave: everything nearby is blasted back and stunned
    for (const e of this.enemiesOf(si)) {
      if (Math.abs(e.x - x) > 9) continue;
      e.buffs.stun = Math.max(e.buffs.stun, e.boss ? 0.8 : 2);
      this.damage(e, 300 * labPower(s.mega.level), u, { kind: 'slam' });
      if (!e.dead) this.knock(e, 6);
    }
    this.emit('megaLand', { unit: u, side: si, id: def.id, x });
  }
  megaSpecial(u) {
    const def = MEGAS[u.type];
    const sp = def.special;
    const s = this.sides[u.side];
    const pw = labPower(s.mega?.level ?? 1);
    const es = this.enemiesOf(u.side).filter((e) => e.state !== 'spawn');
    switch (sp.id) {
      case 'pounce': {
        // leap onto the densest crowd within 7
        let best = null, bc = 0;
        for (const e of es) {
          if ((e.x - u.x) * s.dir < -1 || Math.abs(e.x - u.x) > 7) continue;
          let c = 0;
          for (const o of es) if (Math.abs(o.x - e.x) < sp.radius) c++;
          if (c > bc) { bc = c; best = e.x; }
        }
        if (best === null) return false;
        const tx = best;
        this.emit('megaSpecial', { unit: u, id: sp.id, from: u.x, x: tx });
        this.later(0.55, () => {
          if (u.dead) return;
          u.x = tx;
          this.clampUnit(u);
          this.areaDamage(u.side, tx, sp.radius, sp.dmg * pw, { kind: 'slam', knock: 5, building: 0.5, src: u });
          for (const e of this.enemiesOf(u.side)) if (Math.abs(e.x - tx) <= sp.radius) e.buffs.stun = Math.max(e.buffs.stun, sp.stun);
          this.emit('impact', { x: tx, radius: sp.radius, kind: 'megaSlam', side: u.side });
        });
        return true;
      }
      case 'beam': {
        if (!es.some((e) => (e.x - u.x) * s.dir > 0 && Math.abs(e.x - u.x) < sp.length)) {
          const fb = this.frontBuilding(u.side);
          if (!fb || Math.abs(this.faceX(fb, u.side) - u.x) > sp.length) return false;
        }
        this.emit('megaSpecial', { unit: u, id: sp.id, from: u.x, x: u.x + s.dir * sp.length });
        this.later(0.6, () => {
          if (u.dead) return;
          for (const e of this.enemiesOf(u.side)) {
            const d = (e.x - u.x) * s.dir;
            if (d < -0.5 || d > sp.length) continue;
            this.damage(e, sp.dmg * pw, u, { kind: 'laser' });
            if (!e.dead) e.buffs.stun = Math.max(e.buffs.stun, sp.stun);
          }
          const fb = this.frontBuilding(u.side);
          if (fb && (this.faceX(fb, u.side) - u.x) * s.dir <= sp.length) this.damageBuilding(fb, sp.dmg * pw * 0.6, u);
        });
        return true;
      }
      case 'drain': {
        if (!es.some((e) => Math.abs(e.x - u.x) < sp.radius + 1)) return false;
        this.emit('megaSpecial', { unit: u, id: sp.id, x: u.x });
        this.later(0.5, () => {
          if (u.dead) return;
          let dealt = 0;
          for (const e of this.enemiesOf(u.side)) {
            if (Math.abs(e.x - u.x) > sp.radius) continue;
            const before = e.hp;
            this.damage(e, sp.dmg * pw, u, { kind: 'acid' });
            dealt += before - Math.max(0, e.hp);
            if (!e.dead) this.knock(e, 3);
          }
          this.heal(u, dealt * sp.heal);
          this.emit('impact', { x: u.x, radius: sp.radius, kind: 'acid', side: u.side });
        });
        return true;
      }
      case 'glitch': {
        if (!es.length) return false;
        const ahead = es.filter((e) => (e.x - u.x) * s.dir > 0).sort((a, b) => (a.x - b.x) * s.dir)[0];
        const tx = ahead ? ahead.x - s.dir * 1 : u.x + s.dir * sp.blink;
        this.emit('megaSpecial', { unit: u, id: sp.id, from: u.x, x: tx });
        this.later(0.35, () => {
          if (u.dead) return;
          u.x = tx;
          this.clampUnit(u);
          for (const e of this.enemiesOf(u.side)) {
            if (Math.abs(e.x - u.x) > sp.radius) continue;
            this.damage(e, sp.dmg * pw, u, { kind: 'zap' });
            if (!e.dead) e.buffs.stun = Math.max(e.buffs.stun, sp.stun * (e.boss ? 0.4 : 1));
          }
          this.emit('impact', { x: tx, radius: sp.radius, kind: 'glitch', side: u.side });
        });
        return true;
      }
      default:
        return false;
    }
  }

  castSpell(si, card, x) {
    const s = this.sides[si];
    const id = card.unit ?? card.id;
    const def = SPELLS[id];
    const pw = spellPower(card.level ?? 1);
    s.stats.spells++;
    s.stats['cast_' + id] = (s.stats['cast_' + id] ?? 0) + 1;
    const R = def.radius;
    switch (id) {
      case 'foodThrow': {
        this.emit('spell', { side: si, id, x, delay: 0.55, radius: R });
        this.later(0.55, () => {
          for (const u of this.alliesOf(si)) {
            if (Math.abs(u.x - x) > R) continue;
            this.applyGrow(u, def.dur, def.hpBoost * pw, def.grow);
            this.heal(u, u.maxHp * def.heal * pw);
          }
        });
        break;
      }
      case 'moneyDrop': {
        this.emit('spell', { side: si, id, x, delay: 0.7, radius: R });
        this.later(0.7, () => {
          this.areaDamage(si, x, R, def.dmg * pw, { kind: 'money', knock: 7, building: def.building });
          this.emit('impact', { x, radius: R, kind: 'money', side: si });
        });
        break;
      }
      case 'slimeFlood': {
        this.emit('spell', { side: si, id, x, delay: 0.3, radius: R, dur: def.dur });
        this.later(0.3, () => this.zones.push({ side: si, x, r: R, t: def.dur, slow: def.slow, dps: def.dps * pw, kind: 'slime' }));
        break;
      }
      case 'freezeRay': {
        this.emit('spell', { side: si, id, x, delay: 0.35, radius: R });
        this.later(0.35, () => {
          for (const e of this.enemiesOf(si)) {
            if (Math.abs(e.x - x) > R + e.radius) continue;
            e.buffs.freeze = Math.max(e.buffs.freeze, def.freeze * (e.boss ? 0.4 : 1));
            this.damage(e, def.dmg * pw, null, { kind: 'ice' });
          }
          for (const b of this.buildings(1 - si)) if (Math.abs(b.x - x) <= R + b.half) b.frozen = def.freeze;
        });
        break;
      }
      case 'sodaRocket': {
        this.emit('spell', { side: si, id, x, delay: 0.9, radius: R });
        this.later(0.9, () => {
          this.areaDamage(si, x, R, def.dmg * pw, { kind: 'soda', knock: 5, building: def.building });
          this.emit('impact', { x, radius: R, kind: 'soda', side: si });
        });
        break;
      }
      case 'adrenaline': {
        this.emit('spell', { side: si, id, x, delay: 0.35, radius: R });
        this.later(0.35, () => {
          for (const u of this.alliesOf(si)) {
            if (Math.abs(u.x - x) > R + u.radius) continue;
            u.buffs.rageT = def.rage * pw;
            this.emit('buff', { unit: u, kind: 'rage' });
          }
        });
        break;
      }
      case 'ironCoat': {
        this.emit('spell', { side: si, id, x, delay: 0.3, radius: R });
        this.later(0.3, () => {
          for (const u of this.alliesOf(si)) {
            if (u.mega || Math.abs(u.x - x) > R + u.radius) continue;
            u.shieldHp = Math.max(u.shieldHp ?? 0, u.maxHp * def.armor * pw);
            this.emit('shield', { unit: u });
          }
        });
        break;
      }
      case 'titanSerum': {
        this.emit('spell', { side: si, id, x, delay: 0.5, radius: R });
        this.later(0.5, () => {
          for (const u of this.alliesOf(si)) {
            if (u.mega || u.boss || Math.abs(u.x - x) > R + u.radius) continue;
            this.applyGrow(u, def.titan, def.hpBoost * pw, def.grow);
            u.buffs.titanT = def.titan;
            this.emit('giant', { unit: u });
          }
        });
        break;
      }
      case 'fireball': {
        this.emit('spell', { side: si, id, x, delay: 0.75, radius: R });
        this.later(0.75, () => {
          this.areaDamage(si, x, R, def.dmg * pw, { kind: 'fire', knock: 6, building: def.building });
          for (const e of this.enemiesOf(si)) {
            if (Math.abs(e.x - x) > R + e.radius) continue;
            e.buffs.burn = Math.max(e.buffs.burn, def.burn * pw);
            e.buffs.burnT = Math.max(e.buffs.burnT, def.burnDur);
          }
          this.emit('impact', { x, radius: R, kind: 'fire', side: si });
        });
        break;
      }
      case 'lightningStorm': {
        const targets = this.enemiesOf(si).filter((e) => Math.abs(e.x - x) <= R + e.radius).sort((a, b) => b.hp - a.hp).slice(0, def.bolts);
        const xs = targets.map((e) => e.x);
        const fb = this.frontBuilding(si);
        if (targets.length < def.bolts && fb && Math.abs(fb.x - x) <= R + fb.half) xs.push(fb.x);
        this.emit('spell', { side: si, id, x, delay: 0.5, radius: R, xs });
        targets.forEach((e, k) => this.later(0.5 + k * 0.18, () => {
          if (e.dead) return;
          this.damage(e, def.dmg * pw, null, { kind: 'shock' });
          if (!e.dead) e.buffs.stun = Math.max(e.buffs.stun, def.stun * (e.boss ? 0.4 : 1));
          this.emit('impact', { x: e.x, radius: 0.8, kind: 'shock', side: si });
        }));
        if (targets.length < def.bolts && fb && Math.abs(fb.x - x) <= R + fb.half) {
          this.later(0.5 + targets.length * 0.18, () => { if (fb.alive) this.damageBuilding(fb, def.dmg * pw * def.building, null); });
        }
        break;
      }
      case 'overclockChip': {
        s.buffs.overclock = def.overclock;
        this.emit('spell', { side: si, id, x: s.labX, delay: 0, radius: 0 });
        break;
      }
      case 'timeFreeze': {
        this.emit('spell', { side: si, id, x, delay: 0.4, radius: R });
        this.later(0.4, () => {
          for (const e of this.enemiesOf(si)) {
            if (e.mega || Math.abs(e.x - x) > R + e.radius) continue;
            e.buffs.freeze = Math.max(e.buffs.freeze, def.freeze * (e.boss ? 0.4 : 1));
            this.damage(e, def.dmg * pw, null, { kind: 'ice' });
          }
        });
        break;
      }
      case 'labShield': {
        for (const b of this.buildings(si)) {
          b.shield = b.maxHp * def.shield * pw;
          b.shieldT = def.dur;
        }
        this.emit('spell', { side: si, id, x: s.labX, delay: 0, radius: 0 });
        break;
      }
      default:
        break;
    }
    return true;
  }

  /**
   * Unleash the Commander's ultimate: a short cinematic wind-up (the battle
   * freezes in sim time, like the MEGA's, so friend / replayed battles stay in
   * step), then fireSignature() lands it.
   */
  useSignature(si) {
    const s = this.sides[si];
    if (!s.cmd || s.sig < 1 || this.over || this.cinematic > 0) return false;
    s.sig = 0;
    s.stats.sigs++;
    if (this.noSigCinematic) { this.fireSignature(si); return true; }
    this.cinematic = SIG_CINEMATIC;
    this.cinematicSide = si;
    this.cinematicKind = 'sig';
    this.emit('sigStart', { side: si, id: s.cmd.signature.id });
    return true;
  }
  /** Tap-to-skip: end a Commander wind-up early (the ability lands right away). */
  skipCinematic() {
    if (this.cinematicKind === 'sig' && this.cinematic > 0) this.cinematic = 1e-6;
  }

  fireSignature(si) {
    const s = this.sides[si];
    const sg = s.cmd.signature;
    const pw = s.power;
    const en = 1 - si;
    switch (sg.id) {
      case 'beakerBarrage': {
        const es = this.enemiesOf(si).sort((a, b) => (a.x - s.labX) * s.dir - (b.x - s.labX) * s.dir);
        const xs = [];
        const fb = this.frontBuilding(si);
        const fx = this.frontEnemyX(si) ?? (fb ? this.faceX(fb, si) : this.sides[en].labX);
        for (let k = 0; k < sg.count; k++) xs.push(es[k] ? es[k].x : fx + s.dir * (k - 2) * 1.2);
        this.emit('signature', { side: si, id: sg.id, xs });
        xs.forEach((x, k) => this.later(0.6 + k * 0.12, () => {
          this.areaDamage(si, x, sg.radius, sg.dmg * pw, { kind: 'acid', building: 0.35 });
          this.emit('impact', { x, radius: sg.radius, kind: 'acid', side: si });
        }));
        break;
      }
      case 'megaGiveaway': {
        this.emit('signature', { side: si, id: sg.id });
        this.later(0.8, () => {
          for (const e of this.enemiesOf(si)) {
            e.buffs.stun = Math.max(e.buffs.stun, sg.stun * (e.boss ? 0.4 : 1));
            this.damage(e, sg.dmg * pw, null, { kind: 'money' });
          }
          s.energy = Math.min(this.maxPower(si), s.energy + sg.energy);
          this.emit('energyGain', { side: si, amount: sg.energy });
        });
        break;
      }
      case 'bellyFlop': {
        const x = this.frontEnemyX(si) ?? this.frontAllyX(si) + s.dir * 2;
        const tx = Math.max(-LAB_X + 2.5, Math.min(LAB_X - 2.5, x));
        this.emit('signature', { side: si, id: sg.id, x: tx });
        this.later(1.0, () => {
          this.areaDamage(si, tx, sg.radius, sg.dmg * pw, { kind: 'flop', stun: sg.stun, knock: 3, building: 0.3 });
          this.emit('impact', { x: tx, radius: sg.radius, kind: 'flop', side: si });
        });
        break;
      }
      case 'juansTruck': {
        this.emit('signature', { side: si, id: sg.id });
        this.later(0.5, () => {
          const m = { kind: 'truck', side: si, x: s.labX + s.dir * LAB_HALF, speed: 12, dmg: sg.dmg * pw, labDmg: sg.labDmg * pw, hit: new Set(), id: UID++ };
          this.movers.push(m);
          this.emit('moverStart', { mover: m });
        });
        break;
      }
      default:
        break;
    }
    return true;
  }

  useSkill(si, k) {
    const s = this.sides[si];
    const sk = s.skills[k];
    if (!sk || s.skillCds[k] > 0 || this.over) return false;
    s.skillCds[k] = sk.cd;
    const pw = s.power;
    switch (sk.id) {
      case 'labRally':
        s.buffs.rally = sk.dur;
        this.emit('skill', { side: si, id: sk.id });
        break;
      case 'emergencyRepair': {
        const b = s.lab;
        const amt = b.maxHp * sk.heal * pw;
        b.hp = Math.min(b.maxHp, b.hp + amt);
        this.emit('skill', { side: si, id: sk.id, amount: amt, kind: b.kind });
        break;
      }
      case 'lastToLeave':
        s.buffs.immortal = sk.dur;
        this.emit('skill', { side: si, id: sk.id });
        break;
      case 'subscribeSmash': {
        const c = this.densestEnemyX(si, 2.4);
        const fb = this.frontBuilding(si);
        const x = c ? c.x : fb ? this.faceX(fb, si) - s.dir * 1.2 : 0;
        this.emit('skill', { side: si, id: sk.id, x });
        this.later(0.9, () => {
          this.areaDamage(si, x, sk.radius, sk.dmg * pw, { kind: 'button', knock: 5, building: 0.35 });
          this.emit('impact', { x, radius: sk.radius, kind: 'button', side: si });
        });
        break;
      }
      case 'complain': {
        const fx = this.frontAllyX(si);
        for (const e of this.enemiesOf(si)) if (Math.abs(e.x - fx) < 7) { e.buffs.slow = Math.max(e.buffs.slow, sk.slow); e.buffs.slowT = sk.dur; }
        this.emit('skill', { side: si, id: sk.id, x: fx });
        break;
      }
      case 'luckyFail': {
        this.emit('skill', { side: si, id: sk.id });
        const troops = s.deck.filter((c) => !c.spell);
        for (let i = 0; i < sk.count && troops.length; i++) {
          const card = troops[Math.floor(this.rand() * troops.length)];
          this.later(0.4 + i * 0.25, () => this.deployTroop(si, card, s.labX + s.dir * (LAB_HALF + 0.4)));
        }
        break;
      }
      case 'footballKick': {
        this.emit('skill', { side: si, id: sk.id });
        this.later(0.45, () => {
          const m = { kind: 'ball', side: si, x: s.labX + s.dir * LAB_HALF, speed: 17, dmg: sk.dmg * pw, labDmg: sk.dmg * 0.35 * pw, hit: new Set(), id: UID++ };
          this.movers.push(m);
          this.emit('moverStart', { mover: m });
        });
        break;
      }
      case 'juanDance': {
        s.buffs.dance = sk.dur;
        for (const u of this.alliesOf(si)) this.heal(u, u.maxHp * sk.heal);
        this.emit('skill', { side: si, id: sk.id, dur: sk.dur });
        break;
      }
      default:
        break;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Units

  spawnUnit(si, card, opts = {}) {
    const s = this.sides[si];
    const id = card.unit ?? card.id;
    const def = SWARMS[id];
    const mods = { dmg: 1 + (s.perks.sharpTeeth ?? 0) / 100 };
    const st = swarmStats(id, card.level ?? 1, card.variant ?? 'base', mods);
    const size = def.size ?? 1;
    const kb = opts.kb ?? def.kb ?? 2;
    const thresholds = [];
    for (let k = 1; k < kb; k++) thresholds.push(1 - k / kb);
    const x = opts.x ?? s.labX + s.dir * (LAB_HALF + 0.3);
    const u = {
      id: UID++, side: si, type: id, card: card.id, model: opts.model ?? card.model, skin: card.skin ?? null, variant: card.variant ?? 'base',
      st, hp: st.hp * (opts.hpMult ?? 1), maxHp: st.hp * (opts.hpMult ?? 1), baseMaxHp: st.hp * (opts.hpMult ?? 1),
      dmgMult: opts.dmgMult ?? 1, x, y: 0, vx: 0, vy: 0, radius: 0.3 * size * (opts.scale ?? 1),
      size: size * (opts.scale ?? 1), state: 'spawn', spawnT: opts.delay ?? 0, cool: this.rand() * 0.3, atkPhase: 0, atkTarget: null,
      kbIndex: 0, kbThresholds: thresholds, kbT: 0,
      buffs: { stun: 0, freeze: 0, slow: 0, slowT: 0, burn: 0, burnT: 0, growT: 0, growScale: 1, auraT: 0, rageT: 0, titanT: 0 },
      z: opts.z !== undefined ? Math.max(-FIELD.LANE_Z, Math.min(FIELD.LANE_Z, opts.z + (this.rand() - 0.5) * 0.6)) : (this.rand() - 0.5) * 2 * FIELD.LANE_Z,
      born: this.t, dead: false, boss: !!opts.boss, cost: def.elixir ?? 0,
      speedMult: opts.speedMult ?? 1, flying: !!def.traits?.flying, siege: !!def.traits?.siege, ambush: def.traits?.ambush ?? 0,
      level: card.level ?? 1,
    };
    this.units.push(u);
    this.emit('spawn', { unit: u, dropped: opts.delay > 0 });
    return u;
  }

  spawnBoss(b) {
    const card = { id: b.unit, unit: b.unit, level: b.level ?? 1, model: b.model };
    const u = this.spawnUnit(1, card, {
      x: TURRET_X - FIELD.TURRET_HALF - 2.4, boss: true, kb: 3, scale: b.scale / (SWARMS[b.unit].size ?? 1), delay: 0,
      hpMult: b.hp / swarmStats(b.unit, b.level ?? 1).hp, dmgMult: b.dmg ?? 2, model: b.model, speedMult: 0.5,
    });
    u.bossId = b.id;
    u.slamT = 6;
    this.boss = u;
  }

  applyGrow(u, dur, hpBoost, scale) {
    if (u.buffs.growT <= 0) {
      const add = u.baseMaxHp * hpBoost;
      u.maxHp = u.baseMaxHp + add;
      u.hp += add;
    }
    u.buffs.growT = dur;
    u.buffs.growScale = scale;
    this.emit('grow', { unit: u });
  }

  heal(u, amt) {
    if (u.dead) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amt);
    if (u.hp - before > 0.5) this.emit('heal', { unit: u, amount: Math.round(u.hp - before) });
  }

  findTarget(u) {
    const s = this.sides[u.side];
    const dir = s.dir;
    const reach = u.st.range + u.radius;
    let best = null, bd = Infinity;
    if (!u.siege) {
      for (const e of this.units) {
        if (e.dead || e.side === u.side || e.state === 'spawn') continue;
        const d = (e.x - u.x) * dir;
        if (d < -(u.radius + e.radius)) continue;
        if (d - e.radius <= reach && d < bd) { best = e; bd = d; }
      }
    }
    const b = this.frontBuilding(u.side);
    if (b) {
      const gap = (this.faceX(b, u.side) - u.x) * dir;
      if (gap <= reach && gap < bd) best = b;
    }
    return best;
  }

  updateUnit(u, dt) {
    const b = u.buffs;
    const s = this.sides[u.side];
    if (u.state === 'spawn') {
      u.spawnT -= dt;
      if (u.spawnT <= 0) { u.state = 'walk'; this.emit('landed', { unit: u }); }
      return;
    }
    // status timers
    if (b.burnT > 0) {
      b.burnT -= dt;
      this.damage(u, b.burn * dt, null, { kind: 'burn', silent: true });
      if (u.dead) return;
    }
    if (b.slowT > 0) { b.slowT -= dt; if (b.slowT <= 0) b.slow = 0; }
    if (b.rageT > 0) b.rageT -= dt;
    if (b.titanT > 0) b.titanT -= dt;
    if (b.growT > 0) {
      b.growT -= dt;
      if (b.growT <= 0) {
        u.maxHp = u.baseMaxHp;
        u.hp = Math.min(u.hp, u.maxHp);
        b.growScale = 1;
        this.emit('shrink', { unit: u });
      }
    }
    if (u.st.traits.aura) {
      b.auraT -= dt;
      if (b.auraT <= 0) {
        b.auraT = 0.5;
        const a = u.st.traits.aura;
        for (const e of this.units) if (!e.dead && e.side !== u.side && Math.abs(e.x - u.x) <= a.r) this.damage(e, a.dps * 0.5 * u.dmgMult, u, { kind: 'aura', silent: true });
      }
    }
    // knockback flight
    if (u.state === 'kb') {
      u.x += u.vx * dt;
      u.vy -= GRAV * dt;
      u.y += u.vy * dt;
      u.vx *= Math.exp(-2 * dt);
      if (u.y <= 0) { u.y = 0; if (u.vy < 0) u.vy = 0; }
      u.kbT -= dt;
      this.clampUnit(u);
      if (u.kbT <= 0 && u.y <= 0) { u.state = 'walk'; u.y = 0; }
      return;
    }
    if (b.freeze > 0) { b.freeze -= dt; u.state = 'frozen'; u.atkPhase = 0; return; }
    if (b.stun > 0) { b.stun -= dt; u.state = 'stun'; u.atkPhase = 0; return; }

    const dance = s.buffs.dance > 0, rally = s.buffs.rally > 0;
    const rage = b.rageT > 0 ? 1 + SPELLS.adrenaline.speedBoost : 1;
    const spd = (1 - b.slow) * (dance ? 1.35 : 1) * (rally ? 1.3 : 1) * (s.buffs.haste > 0 ? 1.25 : 1) * rage;
    const atkSpd = (1 - b.slow * 0.5) * (dance ? 1.35 : 1) * (rally ? 1.3 : 1) * (s.buffs.frenzy > 0 ? 1.3 : 1) * rage;

    if (u.mega) {
      u.life -= dt;
      if (u.life <= 0) {
        this.emit('megaEnd', { unit: u });
        this.kill(u, null, { silent: true });
        return;
      }
      u.specT -= dt;
      if (u.specT <= 0 && u.atkPhase <= 0) {
        u.specT = this.megaSpecial(u) ? MEGAS[u.type].special.every : 0.6;
      }
    }
    if (u.boss) {
      u.slamT -= dt;
      if (u.slamT <= 0) {
        u.slamT = 7;
        this.emit('bossSlam', { unit: u });
        this.later(0.6, () => {
          if (u.dead) return;
          for (const e of this.units) {
            if (e.dead || e.side === u.side || Math.abs(e.x - u.x) > 3.5) continue;
            e.buffs.stun = Math.max(e.buffs.stun, 1.0);
            this.damage(e, 120 * u.dmgMult, u, { kind: 'slam' });
            this.knock(e, 4);
          }
        });
      }
    }

    if (u.atkPhase > 0) {
      u.atkPhase -= dt * atkSpd;
      if (u.atkPhase <= 0) {
        this.resolveAttack(u);
        u.cool = u.st.atk;
      }
      return;
    }
    u.cool -= dt * atkSpd;
    const tgt = this.findTarget(u);
    if (tgt) {
      u.state = 'attack';
      if (u.st.traits.kamikaze) {
        this.explode(u);
        return;
      }
      if (u.cool <= 0) {
        const wind = Math.min(0.32, u.st.atk * 0.4);
        u.atkPhase = wind;
        u.atkTarget = tgt;
        this.emit('attack', { unit: u, dur: wind / 0.5 });
      }
    } else {
      u.state = 'walk';
      u.x += s.dir * u.st.speed * u.speedMult * spd * dt;
      this.clampUnit(u);
    }
  }

  clampUnit(u) {
    const s = this.sides[u.side];
    // can't walk through the enemy's front building
    const fb = this.frontBuilding(u.side);
    if (fb) {
      const lim = this.faceX(fb, u.side) - s.dir * u.radius * 0.6;
      if ((u.x - lim) * s.dir > 0) u.x = lim;
    }
    const min = -LAB_X + LAB_HALF * 0.6, max = LAB_X - LAB_HALF * 0.6;
    if (u.x < min) u.x = min;
    if (u.x > max) u.x = max;
  }

  resolveAttack(u) {
    let t = u.atkTarget;
    if (!t || t.dead || (t.building && !t.alive)) t = this.findTarget(u);
    if (!t) return;
    const tx = t.building ? this.faceX(t, u.side) : t.x;
    if (u.st.projectile) {
      const dist = Math.abs(tx - u.x);
      const flight = 0.18 + dist / 13;
      const p = { id: UID++, side: u.side, src: u, x0: u.x, x: u.x, tx, t: 0, flight, target: t, kind: u.st.projectile, height: 0.6 * u.size };
      this.projectiles.push(p);
      this.emit('shoot', { unit: u, proj: p });
    } else {
      this.applyHit(u, t, tx);
    }
  }

  unitDamage(u) {
    const sb = this.sides[u.side].buffs;
    let dmg = u.st.dmg * u.dmgMult * (sb.dance > 0 ? 1.5 : 1) * (sb.surge > 0 ? 1.4 : 1)
      * (u.buffs.rageT > 0 ? 1 + SPELLS.adrenaline.dmgBoost : 1) * (u.buffs.titanT > 0 ? 1 + SPELLS.titanSerum.dmgBoost : 1);
    if (u.ambush) {
      dmg *= u.ambush;
      u.ambush = 0;
      this.emit('ambush', { unit: u });
    }
    return dmg;
  }

  applyHit(u, t, tx) {
    const tr = u.st.traits;
    const dmg = this.unitDamage(u);
    const kind = u.st.projectile ?? 'melee';
    if (tr.area) {
      this.areaDamage(u.side, tx, 0.9 + u.radius * 0.5, dmg, { src: u, kind, building: 1, front: true });
      this.emit('areaHit', { unit: u, x: tx, kind });
    } else if (tr.chain) {
      if (t.building) this.damageBuilding(t, dmg, u);
      const hitList = [];
      let cur = t.building ? null : t;
      if (cur) {
        hitList.push(cur);
        for (let k = 1; k < tr.chain; k++) {
          let nb = null, nd = 2.6;
          for (const e of this.units) {
            if (e.dead || e.side === u.side || hitList.includes(e)) continue;
            const d = Math.abs(e.x - cur.x);
            if (d < nd) { nd = d; nb = e; }
          }
          if (!nb) break;
          hitList.push(nb);
          cur = nb;
        }
        hitList.forEach((e, k) => this.damage(e, dmg * Math.pow(0.75, k), u, { kind }));
      }
      this.emit('chain', { unit: u, xs: [t.building ? tx : null, ...hitList.slice(t.building ? 0 : 1).map((e) => e.x)].filter((v) => v !== null), from: tx });
    } else if (tr.pierce) {
      const dir = this.sides[u.side].dir;
      for (const e of this.units) {
        if (e.dead || e.side === u.side) continue;
        const d = (e.x - u.x) * dir;
        if (d >= -0.2 && d <= u.st.range + u.radius + e.radius) this.damage(e, dmg, u, { kind });
      }
      if (t.building) this.damageBuilding(t, dmg, u);
    } else if (t.building) {
      this.damageBuilding(t, dmg, u);
    } else {
      this.damage(t, dmg, u, { kind });
      if (tr.knock && !t.dead) this.knock(t, 3);
    }
  }

  /** Damage every enemy (units + buildings) of side si within r of x. */
  areaDamage(si, x, r, dmg, o = {}) {
    for (const e of this.units) {
      if (e.dead || e.side === si) continue;
      if (Math.abs(e.x - x) > r + e.radius) continue;
      this.damage(e, dmg, o.src ?? null, { kind: o.kind });
      if (!e.dead && o.stun) e.buffs.stun = Math.max(e.buffs.stun, o.stun * (e.boss ? 0.4 : 1));
      if (!e.dead && o.knock) this.knock(e, o.knock);
    }
    if (o.building) {
      for (const b of this.buildings(1 - si)) {
        if (Math.abs(b.x - x) <= r + b.half) this.damageBuilding(b, dmg * o.building, o.src ?? null, { spell: !o.src });
      }
    }
    if (o.kind && o.kind !== 'melee') this.emit('areaFx', { side: si, x, r, kind: o.kind });
  }

  explode(u) {
    this.areaDamage(u.side, u.x + this.sides[u.side].dir * 0.6, 1.6, u.st.dmg * u.dmgMult, { src: u, kind: 'explode', knock: 4, building: 1 });
    this.emit('explode', { unit: u, x: u.x });
    this.kill(u, null, { silent: true });
  }

  knock(e, power) {
    if (e.dead || e.state === 'spawn') return;
    if (e.mega) return;
    if (e.boss || e.siege) power *= 0.3;
    const dir = this.sides[e.side].dir;
    e.state = 'kb';
    e.vx = -dir * power * 1.2;
    e.vy = 3 + power * 0.6;
    e.kbT = 0.45;
    e.atkPhase = 0;
    e.cool = Math.max(e.cool, 0.25);
    this.emit('kb', { unit: e });
  }

  damage(e, amount, src, o = {}) {
    if (e.dead) return;
    let d = amount;
    if (e.st.traits.armor) d *= 1 - e.st.traits.armor;
    const def = this.sides[e.side];
    if (def.perks.armorUp) d *= 1 - def.perks.armorUp / 100;
    if (src && src.st && e.flying && !src.st.projectile) d *= 0.5;
    if (e.buffs.freeze > 0 && o.kind !== 'ice') d *= 1.25;
    if (d <= 0) return;
    // ARMOR shields soak damage first
    if (e.shieldHp > 0) {
      const soak = Math.min(e.shieldHp, d);
      e.shieldHp -= soak;
      d -= soak;
      if (e.shieldHp <= 0) this.emit('shieldBreak', { unit: e });
      if (d <= 0) { if (!o.silent) this.emit('hit', { unit: e, amount: 0, kind: 'shield', src }); return; }
    }
    const before = e.hp;
    e.hp -= d;
    if (e.hp <= 0 && def.buffs.immortal > 0) e.hp = 1;
    if (src && src.side !== undefined) {
      this.sides[src.side].stats.dmg += Math.min(before, d);
      if (!src.mega) this.addMegaCharge(src.side, Math.min(before, d) / MEGA.chargeDmg);
    }
    if (!o.silent) this.emit('hit', { unit: e, amount: Math.round(d), kind: o.kind ?? 'melee', src, crit: d >= e.maxHp * 0.3 });
    if (e.hp <= 0) {
      this.kill(e, src);
      return;
    }
    if (src && src.st) {
      const tr = src.st.traits;
      if (tr.stun && this.rand() < tr.stun.chance) e.buffs.stun = Math.max(e.buffs.stun, tr.stun.dur * (e.boss ? 0.4 : 1));
      if (tr.freeze && this.rand() < tr.freeze.chance) e.buffs.freeze = Math.max(e.buffs.freeze, tr.freeze.dur * (e.boss ? 0.4 : 1));
      if (tr.slow) { e.buffs.slow = Math.max(e.buffs.slow, tr.slow.amt); e.buffs.slowT = tr.slow.dur; }
      if (tr.burn) { e.buffs.burn = tr.burn.dps; e.buffs.burnT = tr.burn.dur; e.buffs.poison = !!tr.burn.poison; }
    }
    const frac = e.hp / e.maxHp;
    if (e.kbIndex < e.kbThresholds.length && frac <= e.kbThresholds[e.kbIndex] && e.state !== 'kb') {
      while (e.kbIndex < e.kbThresholds.length && frac <= e.kbThresholds[e.kbIndex]) e.kbIndex++;
      this.knock(e, 3);
    }
  }

  kill(e, src, o = {}) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    const killerSide = 1 - e.side;
    const ks = this.sides[killerSide];
    ks.stats.kills++;
    if (!o.silent) {
      ks.sig = Math.min(1, ks.sig + 0.03);
      if (!src?.mega) this.addMegaCharge(killerSide, MEGA.killBonus * (e.boss ? 5 : 1));
    }
    this.emit('death', { unit: e, killerSide, silent: !!o.silent });
    const tr = e.st.traits;
    if (tr.split) {
      const mini = e.type === 'melonMauler' ? 'seedling' : 'miniSlime';
      for (let k = 0; k < tr.split; k++) {
        const m = this.spawnUnit(e.side, { id: mini, unit: mini, level: e.st.level }, { x: e.x + (k - (tr.split - 1) / 2) * 0.5, delay: 0 });
        m.vy = 4; m.state = 'kb'; m.kbT = 0.4; m.vx = (k - 0.5) * 2;
      }
    }
    if (tr.heal) {
      for (const a of this.units) if (!a.dead && a.side === e.side && Math.abs(a.x - e.x) < 2.5) this.heal(a, a.maxHp * tr.heal);
      this.emit('healBurst', { x: e.x, side: e.side });
    }
    if (e.boss) this.emit('bossDown', { unit: e });
  }

  damageBuilding(b, d, src, o = {}) {
    if (!b.alive || this.over) return;
    if (b.shield > 0) {
      const ab = Math.min(b.shield, d);
      b.shield -= ab;
      d -= ab;
      this.emit('shieldHit', { side: b.side, kind: b.kind });
    }
    if (d <= 0) return;
    b.hp -= d;
    // tutorial safety net: your base can't fall below this fraction (Jimmy "goes easy")
    if (this.cfg.baseFloor && b.side === 0) b.hp = Math.max(b.hp, b.maxHp * this.cfg.baseFloor);
    const atk = 1 - b.side;
    this.sides[atk].stats.dmg += d;
    this.sides[atk].stats.towerDmg += d;
    if (!src?.mega) this.addMegaCharge(atk, (d * MEGA.baseDmgMult) / MEGA.chargeDmg);
    this.emit('towerHit', { side: b.side, kind: b.kind, amount: Math.round(d), src, spell: !!o.spell });
    if (b.hp <= 0) this.destroyBuilding(b);
  }

  destroyBuilding(b) {
    b.hp = 0;
    b.alive = false;
    b.dead = true;
    this.emit('towerDown', { side: b.side, kind: 'lab' });
    this.end(1 - b.side, { reason: 'base' });
  }

  updateBuilding(b, dt) {
    if (!b.alive) return;
    if (b.shieldT > 0) { b.shieldT -= dt; if (b.shieldT <= 0) b.shield = 0; }
    if (b.frozen > 0) { b.frozen -= dt; return; }
    if (!b.active) return;
    b.cool -= dt * (this.sides[b.side].buffs.overclock > 0 ? 2 : 1);
    if (b.cool > 0) return;
    // nearest enemy in range
    let best = null, bd = Infinity;
    for (const e of this.units) {
      if (e.dead || e.side === b.side || e.state === 'spawn') continue;
      const d = Math.abs(e.x - b.x) - e.radius;
      if (d <= b.range && d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    b.cool = b.atk;
    const dist = Math.abs(best.x - b.x);
    const p = {
      id: UID++, side: b.side, src: b, x0: b.x, x: b.x, tx: best.x, t: 0, flight: 0.15 + dist / 22, target: best,
      kind: 'labCannon', dmg: b.dmg, height: 3.4, tower: true,
    };
    this.projectiles.push(p);
    this.emit('towerShoot', { side: b.side, kind: b.kind, proj: p });
  }

  end(winner, o = {}) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.draw = winner < 0;
    this.emit('end', { winner, draw: this.draw, reason: o.reason ?? 'base' });
  }

  /** Tiebreak: the base with more HP% left wins. */
  tiebreak() {
    const frac = (si) => { const b = this.sides[si].lab; return b.alive ? b.hp / b.maxHp : 0; };
    const a = frac(0), b = frac(1);
    if (Math.abs(a - b) < 1e-4) return -1;
    return a > b ? 0 : 1;
  }

  // -------------------------------------------------------------------------
  // Main update

  update(dt) {
    if (this.paused || this.over) return;
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP);
      if (this.over) break;
    }
  }

  energyRate(si) {
    const s = this.sides[si];
    return ENERGY.perSec * BASE_UPGRADES[s.overclock].regen * (1 + (s.perks.energySurge ?? 0) / 100) * (this.overtime ? 3 : this.doubleEnergy ? 2 : 1) * (s.buffs.overclock > 0 ? 1.6 : 1);
  }

  tick(dt) {
    // Mega cinematic: the battle freezes while the containment breaks open
    if (this.cinematic > 0) {
      this.cinematic -= dt;
      if (this.cinematic <= 0) {
        this.cinematic = 0;
        if (this.cinematicKind === 'sig') { this.cinematicKind = null; this.fireSignature(this.cinematicSide); }
        else this.megaArrive(this.cinematicSide);
      }
      return;
    }
    this.t += dt;
    if (this.timers.length) {
      const due = this.timers.filter((tm) => tm.at <= this.t);
      if (due.length) {
        this.timers = this.timers.filter((tm) => tm.at > this.t);
        for (const tm of due) tm.fn();
      }
    }
    for (const s of this.sides) {
      s.energy = Math.min(this.maxPower(s.i), s.energy + this.energyRate(s.i) * dt);
      for (let k = 0; k < s.skillCds.length; k++) if (s.skillCds[k] > 0) s.skillCds[k] -= dt;
      if (s.cmd && s.sig < 1) s.sig = Math.min(1, s.sig + dt / (s.cmd.signature.charge * (1 - (s.perks.hypeMan ?? 0) / 100)));
      for (const k in s.buffs) if (s.buffs[k] > 0) s.buffs[k] -= dt;
      this.updateBuilding(s.lab, dt);
    }
    // zones
    for (const z of this.zones) {
      z.t -= dt;
      for (const e of this.units) {
        if (e.dead || e.side === z.side || Math.abs(e.x - z.x) > z.r) continue;
        e.buffs.slow = Math.max(e.buffs.slow, z.slow);
        e.buffs.slowT = Math.max(e.buffs.slowT, 0.3);
        this.damage(e, z.dps * dt, null, { kind: 'slime', silent: true });
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
    // movers (truck / ball)
    for (const m of this.movers) {
      const s = this.sides[m.side];
      m.x += s.dir * m.speed * dt;
      for (const e of this.units) {
        if (e.dead || e.side === m.side || m.hit.has(e.id)) continue;
        if (Math.abs(e.x - m.x) < 0.7 + e.radius) {
          m.hit.add(e.id);
          this.damage(e, m.dmg, null, { kind: m.kind });
          if (!e.dead) this.knock(e, m.kind === 'truck' ? 8 : 4);
          this.emit('moverHit', { mover: m, unit: e });
        }
      }
      const fb = this.frontBuilding(m.side);
      if (fb && (this.faceX(fb, m.side) - m.x) * s.dir <= 0) {
        m.done = true;
        this.damageBuilding(fb, m.labDmg, null, { spell: true });
        this.emit('moverEnd', { mover: m, x: this.faceX(fb, m.side) });
      } else if (!fb) m.done = true;
    }
    this.movers = this.movers.filter((m) => !m.done);
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt);
    // projectiles
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.target && !p.target.building && !p.target.dead) p.tx = p.target.x;
      p.x = p.x0 + (p.tx - p.x0) * Math.min(1, p.t / p.flight);
      if (p.t < p.flight) continue;
      p.done = true;
      if (p.tower) {
        if (p.target && !p.target.dead) this.damage(p.target, p.dmg, null, { kind: p.kind });
        this.emit('projHit', { proj: p });
        continue;
      }
      const u = p.src;
      let t = p.target;
      if (t && (t.dead || (t.building && !t.alive))) {
        t = null;
        for (const e of this.units) if (!e.dead && e.side !== p.side && Math.abs(e.x - p.tx) < 0.8 + e.radius) { t = e; break; }
        if (!t) { const fb = this.frontBuilding(p.side); if (fb && Math.abs(this.faceX(fb, p.side) - p.tx) < 1) t = fb; }
      }
      if (t) this.applyHit(u, t, p.tx);
      else if (u.st.traits.area) this.applyHit(u, { x: p.tx, dead: false, none: true }, p.tx);
      this.emit('projHit', { proj: p });
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
    if (this.units.length > 40 && this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);
    else if (this.t % 2 < dt) this.units = this.units.filter((u) => !u.dead);
    this.updateClock();
  }

  updateClock() {
    if (this.over) return;
    if (!this.doubleEnergy && !this.noOvertime && this.t >= this.regulation - (REGULATION - DOUBLE_AT)) {
      this.doubleEnergy = true;
      this.emit('doubleEnergy');
    }
    if (this.t < this.timeLimit) return;
    if (!this.overtime && !this.noOvertime) {
      this.overtime = true;
      this.timeLimit = this.regulation + OT_LEN;
      this.emit('overtime');
      return;
    }
    this.end(this.tiebreak(), { reason: 'tiebreak' });
  }

  get timeLeft() {
    return Math.max(0, this.timeLimit - this.t);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
