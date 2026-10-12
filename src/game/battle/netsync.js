// Friend-battle networking: the HOST runs the authoritative BattleSim and
// streams snapshots + events; the GUEST runs a RemoteSim replica (mirrored so
// the guest's own Lab is on the left) that the normal view & HUD can read.
import { SWARMS, swarmStats } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { COMMANDERS } from '../../data/commanders.js';
import { OVERCLOCK, ENERGY } from '../../data/labs.js';
import { FIELD } from './field.js';
import { LAB_X, LAB_HALF, TURRET_X } from './sim.js';

const STATES = ['walk', 'attack', 'kb', 'stun', 'frozen', 'spawn'];
const SEND_HZ = 15;

const unitFull = (u) => ({
  i: u.id, s: u.side, ty: u.type, cd: u.card, m: u.model ?? null, sk: u.skin ?? null, v: u.variant, x: +u.x.toFixed(3), y: +u.y.toFixed(3), z: +u.z.toFixed(3),
  hp: Math.round(u.hp), mh: Math.round(u.maxHp), sz: u.size, b: u.boss ? 1 : 0, c: u.cost, lv: u.st.level, gs: u.buffs.growScale ?? 1, st: u.state, sp: u.spawnT ?? 0,
});
const bref = (b) => ({ bk: b.kind, bs: b.side });

function serEvent(e) {
  const o = { type: e.type };
  for (const k in e) {
    if (k === 'type' || k === 't') continue;
    const v = e[k];
    if (k === 'unit') o.unit = e.type === 'spawn' ? unitFull(v) : { i: v.id, x: v.x, size: v.size, side: v.side, type: v.type };
    else if (k === 'src') o.src = v ? (v.building ? bref(v) : v.id ? { i: v.id, size: v.size, side: v.side } : null) : null;
    else if (k === 'proj') {
      o.proj = {
        i: v.id, kind: v.kind, x0: v.x0, tx: v.tx, flight: v.flight, h: v.height, s: v.side,
        src: v.src?.building ? bref(v.src) : v.src?.id, tgt: v.target?.building ? bref(v.target) : v.target?.id, tw: v.tower ? 1 : 0,
      };
    } else if (k === 'mover') o.mover = { i: v.id, kind: v.kind, side: v.side, x: v.x, speed: v.speed };
    else o[k] = v;
  }
  return o;
}

/** Host side: forwards the sim's events and periodic state to the guest. */
export class HostSync {
  constructor(sim, peer) {
    this.sim = sim;
    this.peer = peer;
    this.acc = 0;
    this.pending = [];
    const orig = sim.drainEvents.bind(sim);
    sim.drainEvents = () => {
      const evs = orig();
      for (const e of evs) this.pending.push(serEvent(e));
      return evs;
    };
    this.offMsg = peer.on((msg) => this.onMsg(msg));
  }
  onMsg(msg) {
    const sim = this.sim;
    if (msg.t !== 'in' || sim.over) return;
    switch (msg.a) {
      case 'play': sim.play(1, msg.slot, msg.x === null ? null : -msg.x); break;
      case 'sig': sim.useSignature(1); break;
      case 'skill': sim.useSkill(1, msg.k); break;
      case 'lab': sim.upgradeLab(1); break;
      case 'emote': this.peerEmote && this.peerEmote(msg.e); break;
      case 'surrender': sim.end(0, { reason: 'surrender' }); break;
      default: break;
    }
  }
  snapshot() {
    const sim = this.sim;
    const tw = (b) => [Math.round(b.hp), b.maxHp, b.alive ? 1 : 0, b.active ? 1 : 0, Math.round(b.shield)];
    return {
      t: 's', time: +sim.t.toFixed(2), tl: sim.timeLimit, ot: sim.overtime ? 1 : 0, de: sim.doubleEnergy ? 1 : 0, p: sim.paused ? 1 : 0,
      sides: sim.sides.map((s) => [+s.energy.toFixed(2), s.overclock, +s.sig.toFixed(3), s.hand, s.queue, s.skillCds.map((c) => +c.toFixed(2)),
        [+s.buffs.rally.toFixed(2), +s.buffs.dance.toFixed(2), +s.buffs.immortal.toFixed(2)], tw(s.turret), tw(s.lab), s.crowns]),
      u: sim.units.filter((u) => !u.dead).map((u) => [u.id, +u.x.toFixed(3), +u.y.toFixed(3), Math.round(u.hp), Math.round(u.maxHp), Math.max(0, STATES.indexOf(u.state)), u.buffs.growScale ?? 1,
        (u.buffs.burnT > 0 ? 1 : 0) | (u.buffs.slowT > 0 && u.buffs.slow > 0 ? 2 : 0)]),
      mv: sim.movers.map((m) => [m.id, +m.x.toFixed(3)]),
    };
  }
  update(dt) {
    this.acc += dt;
    if (this.acc < 1 / SEND_HZ && !this.sim.over) return;
    this.acc = 0;
    const snap = this.snapshot();
    snap.e = this.pending;
    this.pending = [];
    this.peer.send(snap);
  }
  dispose() {
    this.offMsg && this.offMsg();
  }
}

// ---------------------------------------------------------------------------
// Guest replica

const mSide = (s) => 1 - s;
const mX = (x) => -x;

export class RemoteSim {
  /** cfg.sides: [me, host] in GUEST perspective (index 0 = me). */
  constructor(cfg, peer) {
    this.cfg = cfg;
    this.peer = peer;
    this.t = 0;
    this.timeLimit = 180;
    this.regulation = 180;
    this.overtime = false;
    this.doubleEnergy = false;
    this.over = false;
    this.winner = -1;
    this.draw = false;
    this.paused = true;
    this.units = [];
    this.unitMap = new Map();
    this.projectiles = [];
    this.projMap = new Map();
    this.movers = [];
    this.moverMap = new Map();
    this.events = [];
    this.sides = cfg.sides.map((s, i) => {
      const cmd = s.commander ? COMMANDERS[s.commander.id] : null;
      const lvl = s.commander?.level ?? 1;
      const deck = (s.deck || []).map((c) => ({ ...c, unit: c.unit ?? c.id, spell: !!SPELLS[c.unit ?? c.id] }));
      const mk = (kind, x, half) => ({ building: true, kind, side: i, x, half, hp: 1, maxHp: 1, alive: true, active: kind === 'turret', shield: 0, radius: half, dead: false });
      return {
        i, dir: i === 0 ? 1 : -1, labX: i === 0 ? -LAB_X : LAB_X, name: s.name, deck, hand: deck.slice(0, 4).map((_, k) => k), queue: deck.slice(4).map((_, k) => k + 4),
        energy: ENERGY.start, overclock: 0, sig: 0, crowns: 0,
        lab: mk('lab', i === 0 ? -LAB_X : LAB_X, LAB_HALF), turret: mk('turret', i === 0 ? -TURRET_X : TURRET_X, FIELD.TURRET_HALF),
        cmd, cmdLevel: lvl, skills: cmd ? cmd.skills.filter((k) => lvl >= k.level) : [], skillCds: [], perks: s.perks || {},
        buffs: { rally: 0, dance: 0, immortal: 0 }, stats: { deployed: 0, kills: 0, dmg: 0, spells: 0, sigs: 0, food: 0, deployById: {}, towerDmg: 0 },
      };
    });
    this.sides.forEach((s) => (s.skillCds = s.skills.map(() => 0)));
    this.offMsg = peer.on((msg) => this.onMsg(msg));
  }

  bld(r) {
    if (!r) return null;
    const s = this.sides[mSide(r.bs)];
    return r.bk === 'lab' ? s.lab : s.turret;
  }

  onMsg(msg) {
    if (msg.t !== 's') return;
    for (const e of msg.e || []) this.applyEvent(e);
    this.t = msg.time;
    this.timeLimit = msg.tl;
    this.overtime = !!msg.ot;
    this.doubleEnergy = !!msg.de;
    this.paused = !!msg.p;
    msg.sides.forEach((arr, hs) => {
      const s = this.sides[mSide(hs)];
      [s.energy, s.overclock, s.sig, s.hand, s.queue, s.skillCds] = arr;
      [s.buffs.rally, s.buffs.dance, s.buffs.immortal] = arr[6];
      for (const [b, a] of [[s.turret, arr[7]], [s.lab, arr[8]]]) {
        [b.hp, b.maxHp] = a;
        b.alive = !!a[2];
        b.dead = !b.alive;
        b.active = !!a[3];
        b.shield = a[4];
      }
      s.crowns = arr[9];
    });
    const alive = new Set();
    for (const a of msg.u) {
      const u = this.unitMap.get(a[0]);
      if (!u) continue;
      alive.add(a[0]);
      u.x = mX(a[1]);
      u.y = a[2];
      u.hp = a[3];
      u.maxHp = a[4];
      u.state = STATES[a[5]] ?? 'walk';
      u.buffs.growScale = a[6];
      u.buffs.burnT = a[7] & 1 ? 0.3 : 0;
      u.buffs.slowT = a[7] & 2 ? 0.3 : 0;
      u.buffs.slow = a[7] & 2 ? 0.4 : 0;
    }
    for (const u of this.units) if (!alive.has(u.id) && !u.dead && performance.now() - u._born > 400) u.dead = true;
    this.units = this.units.filter((u) => !u.dead || performance.now() - (u._deadAt ?? 0) < 100);
    for (const m of msg.mv || []) {
      const mv = this.moverMap.get(m[0]);
      if (mv) mv.x = mX(m[1]);
    }
  }

  toUnit(d) {
    let u = this.unitMap.get(d.i);
    if (u) return u;
    const def = SWARMS[d.ty] || SWARMS.panther;
    const st = swarmStats(d.ty, d.lv ?? 1, d.v ?? 'base');
    u = {
      id: d.i, side: mSide(d.s), type: d.ty, card: d.cd, model: d.m ?? undefined, skin: d.sk, variant: d.v ?? 'base', st,
      x: mX(d.x), y: d.y, z: -d.z, hp: d.hp, maxHp: d.mh, size: d.sz, boss: !!d.b, cost: d.c ?? def.elixir, state: d.st ?? 'walk', spawnT: d.sp ?? 0,
      buffs: { growScale: d.gs ?? 1, burnT: 0, slowT: 0, slow: 0 }, radius: 0.3 * d.sz, dead: false, _born: performance.now(),
      flying: !!def.traits?.flying, level: d.lv ?? 1,
    };
    this.unitMap.set(d.i, u);
    this.units.push(u);
    return u;
  }
  ref(d) {
    if (!d) return d;
    return this.unitMap.get(d.i) || { id: d.i, x: mX(d.x ?? 0), size: d.size ?? 1, side: mSide(d.side ?? 0), type: d.type ?? 'panther', st: swarmStats(d.type ?? 'panther', 1), buffs: {}, dead: true, z: 0, y: 0 };
  }

  applyEvent(e) {
    const ev = { ...e };
    if ('side' in ev && typeof ev.side === 'number') ev.side = mSide(ev.side);
    if ('killerSide' in ev) ev.killerSide = mSide(ev.killerSide);
    if ('winner' in ev) ev.winner = ev.winner < 0 ? -1 : mSide(ev.winner);
    for (const k of ['x', 'from']) if (typeof ev[k] === 'number') ev[k] = mX(ev[k]);
    if (Array.isArray(ev.xs)) ev.xs = ev.xs.map(mX);
    if (e.unit) ev.unit = e.type === 'spawn' ? this.toUnit(e.unit) : this.ref(e.unit);
    if (e.src) ev.src = e.src.bk ? this.bld(e.src) : this.unitMap.get(e.src.i) || { id: e.src.i, size: e.src.size, side: mSide(e.src.side ?? 0) };
    if (e.proj) {
      const p = e.proj;
      let pr = this.projMap.get(p.i);
      if (!pr) {
        const tgt = p.tgt && typeof p.tgt === 'object' ? this.bld(p.tgt) : this.unitMap.get(p.tgt) || null;
        const src = p.src && typeof p.src === 'object' ? this.bld(p.src) : this.unitMap.get(p.src) || { id: p.src, x: mX(p.x0), size: 1 };
        pr = { id: p.i, kind: p.kind, x0: mX(p.x0), x: mX(p.x0), tx: mX(p.tx), flight: p.flight, t: 0, height: p.h, side: mSide(p.s), src, target: tgt, tower: !!p.tw };
        this.projMap.set(p.i, pr);
        this.projectiles.push(pr);
      }
      ev.proj = pr;
      if (e.type === 'projHit') {
        this.projMap.delete(p.i);
        this.projectiles = this.projectiles.filter((q) => q !== pr);
      }
    }
    if (e.mover) {
      const m = e.mover;
      let mv = this.moverMap.get(m.i);
      if (!mv) {
        mv = { id: m.i, kind: m.kind, side: mSide(m.side), x: mX(m.x), speed: m.speed };
        this.moverMap.set(m.i, mv);
        this.movers.push(mv);
      }
      ev.mover = mv;
      if (e.type === 'moverEnd') {
        this.moverMap.delete(m.i);
        this.movers = this.movers.filter((q) => q !== mv);
      }
    }
    if (e.type === 'death' && ev.unit) {
      ev.unit.dead = true;
      ev.unit._deadAt = performance.now();
    }
    if (e.type === 'landed' && ev.unit) ev.unit.state = 'walk';
    if (e.type === 'end') {
      this.over = true;
      this.winner = ev.winner;
      this.draw = !!e.draw;
    }
    if (e.type === 'deploy' && ev.side === 0) this.sides[0].stats.deployed += e.count ?? 1;
    this.events.push(ev);
  }

  // ---- interface used by view / HUD / scene
  update(dt) {
    if (this.over) return;
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.target && !p.target.building && !p.target.dead) p.tx = p.target.x;
      p.x = p.x0 + (p.tx - p.x0) * Math.min(1, p.t / p.flight);
    }
    for (const m of this.movers) m.x += this.sides[m.side].dir * m.speed * dt;
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  get timeLeft() {
    return Math.max(0, this.timeLimit - this.t);
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
    return (c.spell ? SPELLS[c.unit] : SWARMS[c.unit])?.elixir ?? 3;
  }
  canPlay(si, slot) {
    return !this.over && !!this.handCard(si, slot) && this.sides[si].energy >= this.cardCost(si, slot);
  }
  overclockInfo(si) {
    return OVERCLOCK[this.sides[si].overclock];
  }
  canUpgradeLab(si) {
    const s = this.sides[si];
    const info = OVERCLOCK[s.overclock];
    return !this.over && info.cost !== null && s.energy >= info.cost;
  }
  deployRange(si) {
    const s = this.sides[si], en = this.sides[1 - si];
    const back = s.labX + s.dir * (LAB_HALF + 0.2);
    let front = si === 0 ? FIELD.DEPLOY_MAX : -FIELD.DEPLOY_MAX;
    if (!en.turret.alive) front = en.turret.x - s.dir * 1.6;
    return si === 0 ? [back, front] : [front, back];
  }
  clampDeploy(si, x) {
    const [a, b] = this.deployRange(si);
    return Math.max(a, Math.min(b, x));
  }
  frontBuilding(si) {
    const en = this.sides[1 - si];
    return en.turret.alive ? en.turret : en.lab.alive ? en.lab : null;
  }
  enemiesOf(si) {
    return this.units.filter((u) => !u.dead && u.side !== si);
  }
  alliesOf(si) {
    return this.units.filter((u) => !u.dead && u.side === si);
  }
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
  densestEnemyX() {
    return null;
  }

  // ---- actions: sent to the host (optimistic if locally valid)
  send(a, extra = {}) {
    this.peer.send({ t: 'in', a, ...extra });
  }
  play(si, slot, x = null) {
    if (!this.canPlay(0, slot)) return false;
    const card = this.handCard(0, slot);
    const xx = x === null ? null : card.spell ? x : this.clampDeploy(0, x);
    this.send('play', { slot, x: xx === null ? null : mX(xx) });
    this.sides[0].energy -= this.cardCost(0, slot);
    return true;
  }
  deploy(si, slot) {
    return this.play(si, slot, null);
  }
  useSignature() {
    if (this.sides[0].sig < 1 || this.over) return false;
    this.send('sig');
    this.sides[0].sig = 0;
    this.sides[0].stats.sigs++;
    return true;
  }
  useSkill(si, k) {
    const s = this.sides[0];
    if (!s.skills[k] || s.skillCds[k] > 0 || this.over) return false;
    this.send('skill', { k });
    s.skillCds[k] = s.skills[k].cd;
    return true;
  }
  upgradeLab() {
    if (!this.canUpgradeLab(0)) return false;
    this.send('lab');
    return true;
  }
  emote(id) {
    this.send('emote', { e: id });
  }
  end() {
    this.send('surrender');
  }
  dispose() {
    this.offMsg && this.offMsg();
  }
}
