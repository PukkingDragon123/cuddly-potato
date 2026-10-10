// Friend-battle networking: the HOST runs the authoritative BattleSim and
// streams snapshots + events; the GUEST runs a RemoteSim replica (mirrored so
// the guest's own Lab is on the left) that the normal view & HUD can read.
import { SWARMS, swarmStats } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { COMMANDERS } from '../../data/commanders.js';
import { LAB_LEVELS } from '../../data/labs.js';
import { LAB_X, LAB_HALF } from './sim.js';

const STATES = ['walk', 'attack', 'kb', 'stun', 'frozen'];
const SEND_HZ = 15;

const unitFull = (u) => ({
  i: u.id, s: u.side, ty: u.type, m: u.model ?? null, sk: u.skin ?? null, v: u.variant, x: +u.x.toFixed(3), y: +u.y.toFixed(3), z: +u.z.toFixed(3),
  hp: Math.round(u.hp), mh: Math.round(u.maxHp), sz: u.size, b: u.boss ? 1 : 0, c: u.cost, lv: u.st.level, gs: u.buffs.growScale ?? 1,
});

function serEvent(e) {
  const o = { type: e.type };
  for (const k in e) {
    if (k === 'type' || k === 't') continue;
    const v = e[k];
    if (k === 'unit') o.unit = e.type === 'spawn' ? unitFull(v) : { i: v.id, x: v.x, size: v.size, side: v.side, type: v.type };
    else if (k === 'src') o.src = v && v.id ? { i: v.id, size: v.size, side: v.side } : null;
    else if (k === 'proj') o.proj = { i: v.id, kind: v.kind, x0: v.x0, tx: v.tx, flight: v.flight, h: v.height, s: v.side, src: v.src?.id, tgt: v.target?.lab !== undefined ? { lab: v.target.lab } : v.target?.id };
    else if (k === 'mover') o.mover = { i: v.id, kind: v.kind, side: v.side, x: v.x, speed: v.speed };
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
    // tap the event stream (view drains it every frame)
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
      case 'deploy': sim.deploy(1, msg.i); break;
      case 'spell': sim.castSpell(1, msg.i, -msg.x); break;
      case 'sig': sim.useSignature(1); break;
      case 'skill': sim.useSkill(1, msg.k); break;
      case 'lab': sim.upgradeLab(1); break;
      case 'surrender': sim.end(0); break;
      default: break;
    }
  }
  snapshot() {
    const sim = this.sim;
    return {
      t: 's', time: +sim.t.toFixed(2), tl: sim.timeLimit, ot: sim.overtime ? 1 : 0, p: sim.paused ? 1 : 0,
      sides: sim.sides.map((s) => [Math.round(s.energy), s.labLevel, Math.round(s.labHp), s.labMaxHp, Math.round(s.shield), +s.sig.toFixed(3),
        s.cds.map((c) => +c.toFixed(2)), s.spellCds.map((c) => +c.toFixed(2)), s.skillCds.map((c) => +c.toFixed(2)),
        [+s.buffs.rally.toFixed(2), +s.buffs.dance.toFixed(2), +s.buffs.immortal.toFixed(2)]]),
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
    this.timeLimit = 150;
    this.overtime = false;
    this.over = false;
    this.winner = -1;
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
      return {
        i, dir: i === 0 ? 1 : -1, labX: i === 0 ? -LAB_X : LAB_X, name: s.name, deck: s.deck, spells: s.spells || [],
        energy: 0, labLevel: 1, labHp: s.labHp, labMaxHp: s.labHp, shield: 0, sig: 0,
        cds: s.deck.map(() => 0), spellCds: (s.spells || []).map(() => 0), cmd, cmdLevel: lvl,
        skills: cmd ? cmd.skills.filter((k) => lvl >= k.level) : [], skillCds: [], perks: s.perks || {},
        buffs: { rally: 0, dance: 0, immortal: 0 }, stats: { deployed: 0, kills: 0, dmg: 0, spells: 0, sigs: 0, food: 0, deployById: {} },
      };
    });
    this.sides.forEach((s) => (s.skillCds = s.skills.map(() => 0)));
    this.offMsg = peer.on((msg) => this.onMsg(msg));
  }

  // ---- incoming
  onMsg(msg) {
    if (msg.t !== 's') return;
    // events first (spawns create units), then state
    for (const e of msg.e || []) this.applyEvent(e);
    this.t = msg.time;
    this.timeLimit = msg.tl;
    this.overtime = !!msg.ot;
    this.paused = !!msg.p;
    msg.sides.forEach((arr, hs) => {
      const s = this.sides[mSide(hs)];
      [s.energy, s.labLevel, s.labHp, s.labMaxHp, s.shield, s.sig] = arr;
      s.cds = arr[6];
      s.spellCds = arr[7];
      s.skillCds = arr[8];
      [s.buffs.rally, s.buffs.dance, s.buffs.immortal] = arr[9];
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
      id: d.i, side: mSide(d.s), type: d.ty, model: d.m ?? undefined, skin: d.sk, variant: d.v ?? 'base', st,
      x: mX(d.x), y: d.y, z: d.z, hp: d.hp, maxHp: d.mh, size: d.sz, boss: !!d.b, cost: d.c ?? def.cost, state: 'walk',
      buffs: { growScale: d.gs ?? 1, burnT: 0, slowT: 0, slow: 0 }, radius: 0.3 * d.sz, dead: false, _born: performance.now(),
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
    if ('winner' in ev) ev.winner = mSide(ev.winner);
    if (typeof ev.x === 'number') ev.x = mX(ev.x);
    if (Array.isArray(ev.xs)) ev.xs = ev.xs.map(mX);
    if (e.unit) ev.unit = e.type === 'spawn' ? this.toUnit(e.unit) : this.ref(e.unit);
    if (e.src) ev.src = this.unitMap.get(e.src.i) || { id: e.src.i, size: e.src.size, side: mSide(e.src.side ?? 0) };
    if (e.proj) {
      const p = e.proj;
      let pr = this.projMap.get(p.i);
      if (!pr) {
        const tgt = p.tgt && typeof p.tgt === 'object' ? { lab: mSide(p.tgt.lab) } : this.unitMap.get(p.tgt) || null;
        pr = { id: p.i, kind: p.kind, x0: mX(p.x0), x: mX(p.x0), tx: mX(p.tx), flight: p.flight, t: 0, height: p.h, side: mSide(p.s), src: this.unitMap.get(p.src) || { id: p.src, x: mX(p.x0), size: 1 }, target: tgt };
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
    if (e.type === 'end') {
      this.over = true;
      this.winner = ev.winner;
    }
    if (e.type === 'deploy' && ev.side === 0) {
      this.sides[0].stats.deployed++;
    }
    this.events.push(ev);
  }

  // ---- interface used by view / HUD / scene
  update(dt) {
    if (this.over) return;
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.target && !p.target.lab && !p.target.dead) p.tx = p.target.x;
      p.x = p.x0 + (p.tx - p.x0) * Math.min(1, p.t / p.flight);
    }
    for (const m of this.movers) m.x += this.sides[m.side].dir * m.speed * dt;
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
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

  // ---- actions: sent to the host (optimistic success if locally valid)
  send(a, extra = {}) {
    this.peer.send({ t: 'in', a, ...extra });
  }
  deploy(si, idx) {
    if (!this.canDeploy(0, idx)) return false;
    this.send('deploy', { i: idx });
    this.sides[0].energy -= this.cardCost(0, idx);
    this.sides[0].cds[idx] = SWARMS[this.sides[0].deck[idx].id].cd;
    return true;
  }
  castSpell(si, idx, x) {
    if (!this.canCast(0, idx)) return false;
    this.send('spell', { i: idx, x: mX(x) });
    this.sides[0].energy -= this.spellCost(0, idx);
    this.sides[0].spellCds[idx] = SPELLS[this.sides[0].spells[idx].id].cd;
    this.sides[0].stats.spells++;
    return true;
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
  end(winner) {
    // surrender: tell the host
    this.send('surrender');
    void winner;
  }
  dispose() {
    this.offMsg && this.offMsg();
  }
}
