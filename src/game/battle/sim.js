// Battle simulation: pure game logic (no rendering). Two Labs at either end of
// a 1D lane; Swarms advance automatically and fight. Fixed time-step and its
// own seeded RNG so it could be driven by networked inputs later.
import { SWARMS, swarmStats } from '../../data/swarms.js';
import { SPELLS, spellPower } from '../../data/spells.js';
import { COMMANDERS, cmdPower } from '../../data/commanders.js';
import { LAB_LEVELS } from '../../data/labs.js';
import { mulberry32 } from '../../core/util.js';

export const LAB_X = 16;
export const LAB_HALF = 1.7;
export const STEP = 1 / 30;
const GRAV = 32;

let UID = 1;

export class BattleSim {
  /**
   * cfg: { seed, timeLimit, sides: [SideCfg, SideCfg], boss? }
   * SideCfg: { name, deck:[{id, level, variant, skin}], spells:[{id, level}], commander:{id, level}|null,
   *            perks:{}, labHp, ai:boolean }
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
    this.timeLimit = cfg.timeLimit ?? 180;
    this.overtime = false;
    this.paused = false;
    this.sides = cfg.sides.map((s, i) => this.makeSide(s, i));
    if (cfg.boss) this.spawnBoss(cfg.boss);
  }

  makeSide(s, i) {
    const perks = s.perks || {};
    const labMax = Math.round(s.labHp * (1 + (perks.thickWalls ?? 0) / 100));
    const cmd = s.commander ? COMMANDERS[s.commander.id] : null;
    const lvl = s.commander?.level ?? 1;
    const skills = cmd ? cmd.skills.filter((k) => lvl >= k.level) : [];
    return {
      i, dir: i === 0 ? 1 : -1, labX: i === 0 ? -LAB_X : LAB_X,
      name: s.name, deck: s.deck, spells: s.spells || [],
      energy: 60 + (perks.headStart ?? 0), labLevel: 1, labHp: labMax, labMaxHp: labMax, shield: 0, shieldT: 0,
      cds: s.deck.map(() => 0.6), spellCds: (s.spells || []).map(() => 4),
      cmd, cmdLevel: lvl, sig: 0.15, skills, skillCds: skills.map((k) => Math.min(k.cd, 10)),
      perks, buffs: { rally: 0, dance: 0, immortal: 0 },
      stats: { deployed: 0, kills: 0, dmg: 0, spells: 0, sigs: 0, food: 0, deployById: {} },
      power: cmdPower(lvl),
    };
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
  labLevelInfo(si) {
    return LAB_LEVELS[this.sides[si].labLevel - 1];
  }
  cardCost(si, idx) {
    const s = this.sides[si];
    const c = s.deck[idx];
    if (!c) return Infinity;
    return Math.round(SWARMS[c.id].cost * (1 - (s.perks.bargain ?? 0) / 100));
  }
  canDeploy(si, idx) {
    const s = this.sides[si];
    return !this.over && s.deck[idx] && s.cds[idx] <= 0 && s.energy >= this.cardCost(si, idx);
  }
  spellCost(si, idx) {
    const sp = this.sides[si].spells[idx];
    return sp ? SPELLS[sp.id].cost : Infinity;
  }
  canCast(si, idx) {
    const s = this.sides[si];
    return !this.over && s.spells[idx] && s.spellCds[idx] <= 0 && s.energy >= this.spellCost(si, idx);
  }
  canUpgradeLab(si) {
    const s = this.sides[si];
    const info = LAB_LEVELS[s.labLevel - 1];
    return !this.over && info.upCost !== null && s.energy >= info.upCost;
  }
  enemiesOf(si) {
    return this.units.filter((u) => !u.dead && u.side !== si);
  }
  alliesOf(si) {
    return this.units.filter((u) => !u.dead && u.side === si);
  }
  /** The enemy unit closest to side si's lab. */
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
  /** Frontmost ally of side si (closest to enemy lab). */
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
      for (const b of es) if (Math.abs(a.x - b.x) <= radius) c += b.boss ? 3 : 1;
      if (c > bc) { bc = c; best = a.x; }
    }
    return best === null ? null : { x: best, count: bc };
  }

  // -------------------------------------------------------------------------
  // Player actions

  deploy(si, idx, free = false) {
    const s = this.sides[si];
    const card = s.deck[idx];
    if (!card) return false;
    if (!free) {
      if (!this.canDeploy(si, idx)) return false;
      s.energy -= this.cardCost(si, idx);
      s.cds[idx] = SWARMS[card.id].cd * (1 - (s.perks.quickHands ?? 0) / 100);
    }
    const n = SWARMS[card.id].count ?? 1;
    for (let k = 0; k < n; k++) this.spawnUnit(si, card, { back: k * 0.45 });
    s.stats.deployed += n;
    s.stats.deployById[card.baseId ?? card.id] = (s.stats.deployById[card.baseId ?? card.id] ?? 0) + n;
    if (SWARMS[card.id].series === 'food') s.stats.food += n;
    this.emit('deploy', { side: si, idx, id: card.id });
    return true;
  }

  upgradeLab(si) {
    if (!this.canUpgradeLab(si)) return false;
    const s = this.sides[si];
    s.energy -= LAB_LEVELS[s.labLevel - 1].upCost;
    s.labLevel++;
    this.emit('labUp', { side: si, level: s.labLevel });
    return true;
  }

  castSpell(si, idx, x) {
    if (!this.canCast(si, idx)) return false;
    const s = this.sides[si];
    const sp = s.spells[idx];
    const def = SPELLS[sp.id];
    const pw = spellPower(sp.level ?? 1);
    s.energy -= def.cost;
    s.spellCds[idx] = def.cd * (1 - (s.perks.spellSlinger ?? 0) / 100);
    s.stats.spells++;
    s.stats['cast_' + sp.id] = (s.stats['cast_' + sp.id] ?? 0) + 1;
    x = Math.max(-LAB_X + 1, Math.min(LAB_X - 1, x));
    const R = def.radius;
    const en = 1 - si;
    switch (sp.id) {
      case 'foodThrow': {
        this.emit('spell', { side: si, id: sp.id, x, delay: 0.55, radius: R });
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
        this.emit('spell', { side: si, id: sp.id, x, delay: 0.7, radius: R });
        this.later(0.7, () => {
          this.areaDamage(si, x, R, def.dmg * pw, { kind: 'money', knock: 7, labMult: 0.5 });
          this.emit('impact', { x, radius: R, kind: 'money', side: si });
        });
        break;
      }
      case 'slimeFlood': {
        this.emit('spell', { side: si, id: sp.id, x, delay: 0.3, radius: R, dur: def.dur });
        this.later(0.3, () => this.zones.push({ side: si, x, r: R, t: def.dur, slow: def.slow, dps: def.dps * pw, kind: 'slime' }));
        break;
      }
      case 'freezeRay': {
        this.emit('spell', { side: si, id: sp.id, x, delay: 0.35, radius: R });
        this.later(0.35, () => {
          for (const e of this.enemiesOf(si)) {
            if (Math.abs(e.x - x) > R) continue;
            e.buffs.freeze = Math.max(e.buffs.freeze, def.freeze * (e.boss ? 0.4 : 1));
            this.damage(e, def.dmg * pw, null, { kind: 'ice' });
          }
        });
        break;
      }
      case 'sodaRocket': {
        this.emit('spell', { side: si, id: sp.id, x, delay: 0.9, radius: R });
        this.later(0.9, () => {
          this.areaDamage(si, x, R, def.dmg * pw, { kind: 'soda', knock: 5, labMult: 0.6 });
          this.emit('impact', { x, radius: R, kind: 'soda', side: si });
        });
        break;
      }
      case 'labShield': {
        s.shield = s.labMaxHp * def.shield * pw;
        s.shieldT = def.dur;
        this.emit('spell', { side: si, id: sp.id, x: s.labX, delay: 0, radius: 0 });
        break;
      }
      default:
        break;
    }
    return true;
  }

  useSignature(si) {
    const s = this.sides[si];
    if (!s.cmd || s.sig < 1 || this.over) return false;
    s.sig = 0;
    s.stats.sigs++;
    const sg = s.cmd.signature;
    const pw = s.power;
    const en = 1 - si;
    switch (sg.id) {
      case 'beakerBarrage': {
        const es = this.enemiesOf(si).sort((a, b) => (a.x - s.labX) * s.dir - (b.x - s.labX) * s.dir);
        const xs = [];
        const fx = this.frontEnemyX(si) ?? this.sides[en].labX - this.sides[en].dir * 3;
        for (let k = 0; k < sg.count; k++) xs.push(es[k] ? es[k].x : fx + s.dir * (k - 2) * 1.2);
        this.emit('signature', { side: si, id: sg.id, xs });
        xs.forEach((x, k) => this.later(0.6 + k * 0.12, () => {
          this.areaDamage(si, x, sg.radius, sg.dmg * pw, { kind: 'acid', labMult: 0.5 });
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
          s.energy = Math.min(this.labLevelInfo(si).max, s.energy + sg.energy);
          this.emit('energyGain', { side: si, amount: sg.energy });
        });
        break;
      }
      case 'bellyFlop': {
        const x = this.frontEnemyX(si) ?? this.frontAllyX(si) + s.dir * 2;
        const tx = Math.max(-LAB_X + 2.5, Math.min(LAB_X - 2.5, x));
        this.emit('signature', { side: si, id: sg.id, x: tx });
        this.later(1.0, () => {
          this.areaDamage(si, tx, sg.radius, sg.dmg * pw, { kind: 'flop', stun: sg.stun, knock: 3, labMult: 0.4 });
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
        const amt = s.labMaxHp * sk.heal * pw;
        s.labHp = Math.min(s.labMaxHp, s.labHp + amt);
        this.emit('skill', { side: si, id: sk.id, amount: amt });
        break;
      }
      case 'lastToLeave':
        s.buffs.immortal = sk.dur;
        this.emit('skill', { side: si, id: sk.id });
        break;
      case 'subscribeSmash': {
        const c = this.densestEnemyX(si, 2.4);
        const x = c ? c.x : this.sides[1 - si].labX - this.sides[1 - si].dir * 2.5;
        this.emit('skill', { side: si, id: sk.id, x });
        this.later(0.9, () => {
          this.areaDamage(si, x, sk.radius, sk.dmg * pw, { kind: 'button', knock: 5, labMult: 0.5 });
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
        for (let i = 0; i < sk.count; i++) {
          const idx = Math.floor(this.rand() * s.deck.length);
          this.later(0.4 + i * 0.25, () => this.deploy(si, idx, true));
        }
        break;
      }
      case 'footballKick': {
        this.emit('skill', { side: si, id: sk.id });
        this.later(0.45, () => {
          const m = { kind: 'ball', side: si, x: s.labX + s.dir * LAB_HALF, speed: 17, dmg: sk.dmg * pw, labDmg: sk.dmg * 0.4 * pw, hit: new Set(), id: UID++ };
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
    const def = SWARMS[card.id];
    const mods = { dmg: 1 + (s.perks.sharpTeeth ?? 0) / 100 };
    const st = swarmStats(card.id, card.level ?? 1, card.variant ?? 'base', mods);
    const size = def.size ?? 1;
    const kb = opts.kb ?? def.kb ?? 2;
    const thresholds = [];
    for (let k = 1; k < kb; k++) thresholds.push(1 - k / kb);
    const x = opts.x ?? s.labX + s.dir * (LAB_HALF + 0.3 - (opts.back ?? 0));
    const u = {
      id: UID++, side: si, type: card.id, model: opts.model ?? card.model, skin: card.skin, variant: card.variant ?? 'base',
      st, hp: st.hp * (opts.hpMult ?? 1), maxHp: st.hp * (opts.hpMult ?? 1), baseMaxHp: st.hp * (opts.hpMult ?? 1),
      dmgMult: opts.dmgMult ?? 1, x, y: 0, vx: 0, vy: 0, radius: 0.3 * size * (opts.scale ?? 1),
      size: size * (opts.scale ?? 1), state: 'walk', cool: this.rand() * 0.3, atkPhase: 0, atkTarget: null,
      kbIndex: 0, kbThresholds: thresholds, kbT: 0,
      buffs: { stun: 0, freeze: 0, slow: 0, slowT: 0, burn: 0, burnT: 0, growT: 0, growScale: 1, auraT: 0 },
      z: (this.rand() - 0.5) * 1.6, born: this.t, dead: false, boss: !!opts.boss, cost: def.cost,
      speedMult: opts.speedMult ?? 1,
    };
    if (def.traits?.flying) u.y = 0;
    this.units.push(u);
    this.emit('spawn', { unit: u, fromLab: !opts.x });
    return u;
  }

  spawnBoss(b) {
    const card = { id: b.unit, level: b.level ?? 1, model: b.model };
    const u = this.spawnUnit(1, card, {
      x: LAB_X - LAB_HALF - 2.2, boss: true, kb: 3, scale: b.scale / (SWARMS[b.unit].size ?? 1),
      hpMult: b.hp / swarmStats(b.unit, b.level ?? 1).hp, dmgMult: b.dmg ?? 2, model: b.model, speedMult: 0.55,
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
    for (const e of this.units) {
      if (e.dead || e.side === u.side) continue;
      const d = (e.x - u.x) * dir;
      if (d < -(u.radius + e.radius)) continue;
      if (d - e.radius <= reach && d < bd) { best = e; bd = d; }
    }
    if (best) return best;
    const en = this.sides[1 - u.side];
    const front = en.labX + (en.dir === 1 ? LAB_HALF : -LAB_HALF);
    const gap = (front - u.x) * dir;
    if (gap <= reach) return { lab: en.i };
    return null;
  }

  updateUnit(u, dt) {
    const b = u.buffs;
    const s = this.sides[u.side];
    // status timers
    if (b.burnT > 0) {
      b.burnT -= dt;
      this.damage(u, b.burn * dt, null, { kind: 'burn', silent: true });
      if (u.dead) return;
    }
    if (b.slowT > 0) { b.slowT -= dt; if (b.slowT <= 0) b.slow = 0; }
    if (b.growT > 0) {
      b.growT -= dt;
      if (b.growT <= 0) {
        u.maxHp = u.baseMaxHp;
        u.hp = Math.min(u.hp, u.maxHp);
        b.growScale = 1;
        this.emit('shrink', { unit: u });
      }
    }
    // aura
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
    const spd = (1 - b.slow) * (dance ? 1.35 : 1) * (rally ? 1.3 : 1);
    const atkSpd = (1 - b.slow * 0.5) * (dance ? 1.35 : 1) * (rally ? 1.3 : 1);

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
            this.damage(e, 60 * u.dmgMult, u, { kind: 'slam' });
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
      u.x += s.dir * u.st.speed * u.speedMult * spd * dt * 0.75;
      this.clampUnit(u);
    }
  }

  clampUnit(u) {
    const min = -LAB_X + LAB_HALF * 0.6, max = LAB_X - LAB_HALF * 0.6;
    if (u.x < min) u.x = min;
    if (u.x > max) u.x = max;
  }

  resolveAttack(u) {
    let t = u.atkTarget;
    if (!t || (t.dead && !t.lab)) t = this.findTarget(u);
    if (!t) return;
    const tx = t.lab !== undefined ? this.sides[t.lab].labX + (this.sides[t.lab].dir === 1 ? LAB_HALF : -LAB_HALF) : t.x;
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

  applyHit(u, t, tx) {
    const tr = u.st.traits;
    const dmg = u.st.dmg * u.dmgMult * (this.sides[u.side].buffs.dance > 0 ? 1.5 : 1);
    const kind = u.st.projectile ?? 'melee';
    if (tr.area) {
      this.areaDamage(u.side, tx, 0.9 + u.radius * 0.5, dmg, { src: u, kind, front: true, ux: u.x });
      if (t.lab !== undefined) this.damageLab(t.lab, dmg, u);
      else if (this.areaHitsLab(u.side, tx, 0.9)) this.damageLab(1 - u.side, dmg, u);
      this.emit('areaHit', { unit: u, x: tx, kind });
    } else if (tr.chain) {
      const hitList = [];
      let cur = t.lab !== undefined ? null : t;
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
        this.emit('chain', { unit: u, xs: hitList.map((e) => e.x) });
      } else this.damageLab(t.lab, dmg, u);
    } else if (tr.pierce) {
      const dir = this.sides[u.side].dir;
      for (const e of this.units) {
        if (e.dead || e.side === u.side) continue;
        const d = (e.x - u.x) * dir;
        if (d >= -0.2 && d <= u.st.range + u.radius + e.radius) this.damage(e, dmg, u, { kind });
      }
      if (t.lab !== undefined) this.damageLab(t.lab, dmg, u);
    } else if (t.lab !== undefined) {
      this.damageLab(t.lab, dmg, u);
    } else {
      this.damage(t, dmg, u, { kind });
      if (tr.knock && !t.dead) this.knock(t, 3);
    }
  }

  areaHitsLab(si, x, r) {
    const en = this.sides[1 - si];
    const front = en.labX + (en.dir === 1 ? LAB_HALF : -LAB_HALF);
    return Math.abs(front - x) <= r + 0.4;
  }

  areaDamage(si, x, r, dmg, o = {}) {
    for (const e of this.units) {
      if (e.dead || e.side === si) continue;
      if (Math.abs(e.x - x) > r + e.radius) continue;
      this.damage(e, dmg, o.src ?? null, { kind: o.kind });
      if (!e.dead && o.stun) e.buffs.stun = Math.max(e.buffs.stun, o.stun * (e.boss ? 0.4 : 1));
      if (!e.dead && o.knock) this.knock(e, o.knock);
    }
    if (o.labMult && this.areaHitsLab(si, x, r)) this.damageLab(1 - si, dmg * o.labMult, o.src ?? null);
    if (o.kind && o.kind !== 'melee') this.emit('areaFx', { side: si, x, r, kind: o.kind });
  }

  explode(u) {
    const tr = u.st.traits;
    this.areaDamage(u.side, u.x + this.sides[u.side].dir * 0.6, 1.6, u.st.dmg * u.dmgMult, { src: u, kind: 'explode', knock: 4, labMult: 1 });
    this.emit('explode', { unit: u, x: u.x });
    this.kill(u, null, { silent: true, noBounty: true });
    void tr;
  }

  knock(e, power) {
    if (e.dead) return;
    if (e.boss) power *= 0.25;
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
    if (src && src.st && e.st.traits.flying && !src.st.projectile) d *= 0.5;
    if (e.buffs.freeze > 0 && o.kind !== 'ice') d *= 1.25;
    if (d <= 0) return;
    const before = e.hp;
    e.hp -= d;
    if (e.hp <= 0 && def.buffs.immortal > 0) e.hp = 1;
    if (src && src.side !== undefined) this.sides[src.side].stats.dmg += Math.min(before, d);
    if (!o.silent) this.emit('hit', { unit: e, amount: Math.round(d), kind: o.kind ?? 'melee', src, crit: d >= e.maxHp * 0.3 });
    if (e.hp <= 0) {
      this.kill(e, src);
      return;
    }
    // on-hit effects from the attacker
    if (src && src.st) {
      const tr = src.st.traits;
      if (tr.stun && this.rand() < tr.stun.chance) e.buffs.stun = Math.max(e.buffs.stun, tr.stun.dur * (e.boss ? 0.4 : 1));
      if (tr.freeze && this.rand() < tr.freeze.chance) e.buffs.freeze = Math.max(e.buffs.freeze, tr.freeze.dur * (e.boss ? 0.4 : 1));
      if (tr.slow) { e.buffs.slow = Math.max(e.buffs.slow, tr.slow.amt); e.buffs.slowT = tr.slow.dur; }
      if (tr.burn) { e.buffs.burn = tr.burn.dps; e.buffs.burnT = tr.burn.dur; }
    }
    // knockback thresholds
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
    const silent = !!o.silent;
    const killerSide = 1 - e.side;
    const bounty = e.cost > 0 && !o.noBounty ? Math.round(e.cost * 0.35) : 0;
    const ks = this.sides[killerSide];
    if (bounty) ks.energy = Math.min(this.labLevelInfo(killerSide).max, ks.energy + bounty);
    ks.stats.kills++;
    ks.sig = Math.min(1, ks.sig + 0.03);
    this.emit('death', { unit: e, bounty, killerSide, silent });
    const tr = e.st.traits;
    if (tr.split) {
      const mini = e.type === 'melonMauler' ? 'seedling' : 'miniSlime';
      for (let k = 0; k < tr.split; k++) {
        const m = this.spawnUnit(e.side, { id: mini, level: e.st.level }, { x: e.x + (k - (tr.split - 1) / 2) * 0.5 });
        m.vy = 4; m.state = 'kb'; m.kbT = 0.4; m.vx = (k - 0.5) * 2;
      }
    }
    if (tr.heal) {
      for (const a of this.units) if (!a.dead && a.side === e.side && Math.abs(a.x - e.x) < 2.5) this.heal(a, a.maxHp * tr.heal);
      this.emit('healBurst', { x: e.x, side: e.side });
    }
    if (e.boss) this.emit('bossDown', { unit: e });
  }

  damageLab(si, d, src) {
    const s = this.sides[si];
    if (this.over) return;
    if (s.shield > 0) {
      const ab = Math.min(s.shield, d);
      s.shield -= ab;
      d -= ab;
      this.emit('shieldHit', { side: si });
    }
    if (d <= 0) return;
    // siege pressure: troops hit Labs harder, ramping up late in the match
    if (src && src.st) d *= 1.5 * (this.t > 90 ? 1.5 : 1) * (this.overtime ? 1.5 : 1);
    s.labHp -= d;
    if (src && src.side !== undefined) this.sides[src.side].stats.dmg += d;
    this.emit('labHit', { side: si, amount: Math.round(d), src });
    if (s.labHp <= 0) {
      s.labHp = 0;
      this.end(1 - si);
    }
  }

  end(winner) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.emit('end', { winner });
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

  tick(dt) {
    this.t += dt;
    // scheduled actions
    if (this.timers.length) {
      const due = this.timers.filter((tm) => tm.at <= this.t);
      if (due.length) {
        this.timers = this.timers.filter((tm) => tm.at > this.t);
        for (const tm of due) tm.fn();
      }
    }
    // sides
    for (const s of this.sides) {
      const info = LAB_LEVELS[s.labLevel - 1];
      const regen = info.regen * (1 + (s.perks.energySurge ?? 0) / 100) * (this.overtime ? 2 : 1);
      s.energy = Math.min(info.max, s.energy + regen * dt);
      for (let k = 0; k < s.cds.length; k++) if (s.cds[k] > 0) s.cds[k] -= dt;
      for (let k = 0; k < s.spellCds.length; k++) if (s.spellCds[k] > 0) s.spellCds[k] -= dt;
      for (let k = 0; k < s.skillCds.length; k++) if (s.skillCds[k] > 0) s.skillCds[k] -= dt;
      if (s.cmd && s.sig < 1) s.sig = Math.min(1, s.sig + dt / (s.cmd.signature.charge * (1 - (s.perks.hypeMan ?? 0) / 100)));
      for (const k in s.buffs) if (s.buffs[k] > 0) s.buffs[k] -= dt;
      if (s.shieldT > 0) { s.shieldT -= dt; if (s.shieldT <= 0) s.shield = 0; }
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
      const en = this.sides[1 - m.side];
      const front = en.labX + (en.dir === 1 ? LAB_HALF : -LAB_HALF);
      if ((front - m.x) * s.dir <= 0) {
        m.done = true;
        this.damageLab(en.i, m.labDmg, null);
        this.emit('moverEnd', { mover: m, x: front });
      }
    }
    this.movers = this.movers.filter((m) => !m.done);
    // units
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt);
    // projectiles
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.target && !p.target.lab && !p.target.dead) p.tx = p.target.x;
      p.x = p.x0 + (p.tx - p.x0) * Math.min(1, p.t / p.flight);
      if (p.t >= p.flight) {
        p.done = true;
        const u = p.src;
        let t = p.target;
        if (t && !t.lab && t.dead) {
          // retarget to anything near the landing spot
          t = null;
          for (const e of this.units) if (!e.dead && e.side !== p.side && Math.abs(e.x - p.tx) < 0.8 + e.radius) { t = e; break; }
        }
        if (t) this.applyHit(u, t, p.tx);
        else if (u.st.traits.area) this.applyHit(u, { x: p.tx, dead: false, none: true }, p.tx);
        this.emit('projHit', { proj: p });
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
    // cleanup dead
    if (this.units.length > 40 && this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);
    else if (this.t % 2 < dt) this.units = this.units.filter((u) => !u.dead);
    // time
    if (this.t >= this.timeLimit && !this.overtime) {
      this.overtime = true;
      this.timeLimit += 45;
      this.emit('overtime');
    } else if (this.t >= this.timeLimit && this.overtime) {
      const f0 = this.sides[0].labHp / this.sides[0].labMaxHp, f1 = this.sides[1].labHp / this.sides[1].labMaxHp;
      this.end(f0 >= f1 ? 0 : 1);
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
