// Friend / online battle networking: the HOST runs the authoritative BattleSim
// and streams snapshots + events; the GUEST runs a RemoteSim replica (mirrored
// so the guest's own Lab is on the left) that the normal view & HUD can read.
//
// Two transports share this code:
//  * WebRTC (src/net/p2p.js): one ordered channel, every tick carries a full
//    snapshot plus all events since the last tick.
//  * the claude.ai room (src/net/roomNet.js RoomLink, `peer.sendState`): the
//    snapshot is latest-wins state (presence), events that change what exists
//    (spawns, deaths, the card cycle, spells, the end...) go on the RELIABLE
//    ordered stream, and purely cosmetic events (hits, shots, attacks) go on
//    the lossy fast path. Every payload stays well under the 4 KiB limit.
import { SWARMS, swarmStats } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { COMMANDERS } from '../../data/commanders.js';
import { BASE_UPGRADES, ENERGY, MEGA } from '../../data/labs.js';
import { MEGAS } from '../../data/megas.js';
import { FIELD } from './field.js';
import { LAB_X, LAB_HALF, DECK_MAX } from './sim.js';

const STATES = ['walk', 'attack', 'kb', 'stun', 'frozen', 'spawn'];
const SEND_HZ = 15;
const ROOM_HZ = 12;
/** Cosmetic events: safe to lose (the snapshot carries the state they hint at). */
const COSMETIC = new Set(['hit', 'attack', 'shoot', 'towerShoot', 'projHit', 'towerHit', 'shieldHit', 'heal', 'kb', 'areaFx', 'areaHit', 'chain', 'moverHit', 'healBurst', 'impact', 'shield', 'shieldBreak', 'energyGain', 'explode', 'ambush', 'bossSlam', 'grow', 'shrink', 'landed']);
const r2 = (v) => Math.round(v * 100) / 100;

const unitFull = (u, t) => {
  const o = {
    i: u.id, s: u.side, ty: u.type, cd: u.card, x: r2(u.x), y: r2(u.y), z: r2(u.z),
    hp: Math.round(u.hp), mh: Math.round(u.maxHp), sz: r2(u.size), c: u.cost, lv: u.st.level, st: u.state, sp: r2(u.spawnT ?? 0),
  };
  // defaults are left out (RemoteSim.toUnit fills them back in)
  if (u.model) o.m = u.model;
  if (u.skin) o.sk = u.skin;
  if (u.variant && u.variant !== 'base') o.v = u.variant;
  if (u.boss) o.b = 1;
  if (u.mega) o.mg = 1;
  if ((u.buffs.growScale ?? 1) !== 1) o.gs = r2(u.buffs.growScale);
  if (t !== undefined) o.ts = r2(t);
  return o;
};
const bref = (b) => ({ bk: b.kind, bs: b.side });

function serEvent(e, t) {
  const o = { type: e.type };
  for (const k in e) {
    if (k === 'type' || k === 't') continue;
    const v = e[k];
    if (v === undefined) continue;
    if (k === 'unit') o.unit = e.type === 'spawn' ? unitFull(v, t) : { i: v.id, x: r2(v.x), size: r2(v.size), side: v.side, type: v.type };
    else if (k === 'src') o.src = v ? (v.building ? bref(v) : v.id ? { i: v.id, size: r2(v.size), side: v.side } : null) : null;
    else if (k === 'proj') {
      o.proj = {
        i: v.id, kind: v.kind, x0: r2(v.x0), tx: r2(v.tx), flight: r2(v.flight), h: r2(v.height ?? 0), s: v.side,
        src: v.src?.building ? bref(v.src) : v.src?.id, tgt: v.target?.building ? bref(v.target) : v.target?.id, tw: v.tower ? 1 : 0,
      };
    } else if (k === 'mover') o.mover = { i: v.id, kind: v.kind, side: v.side, x: r2(v.x), speed: v.speed };
    else if (typeof v === 'number') o[k] = r2(v);
    else o[k] = v;
  }
  return o;
}

/** Split events into messages of at most ~`max` JSON bytes each. */
function chunkEvents(evs, max) {
  const out = [];
  let cur = [], size = 0;
  for (const e of evs) {
    const n = JSON.stringify(e).length + 1;
    if (cur.length && size + n > max) { out.push(cur); cur = []; size = 0; }
    cur.push(e);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Host side: forwards the sim's events and periodic state to the guest. */
export class HostSync {
  constructor(sim, peer) {
    this.sim = sim;
    this.peer = peer;
    this.room = typeof peer.sendState === 'function';
    this.acc = 0;
    this.pending = [];
    this.stats = { maxState: 0, maxRel: 0, maxFx: 0, fxDropped: 0, ticks: 0 };
    const orig = sim.drainEvents.bind(sim);
    sim.drainEvents = () => {
      const evs = orig();
      for (const e of evs) this.pending.push(serEvent(e, sim.t));
      return evs;
    };
    this.offMsg = peer.on((msg) => this.onMsg(msg));
  }
  onMsg(msg) {
    const sim = this.sim;
    if (msg.t !== 'in' || sim.over) return;
    const x = typeof msg.x === 'number' && Number.isFinite(msg.x) ? -msg.x : null;
    const slot = msg.slot | 0;
    switch (msg.a) {
      case 'play': if (slot >= 0 && slot < 8) sim.play(1, slot, x); break;
      case 'sig': sim.useSignature(1); break;
      case 'mega': sim.useMega(1); break;
      case 'skill': sim.useSkill(1, msg.k | 0); break;
      case 'lab': sim.upgradeLab(1); break;
      case 'emote': this.peerEmote && this.peerEmote(msg.e | 0); break;
      case 'surrender': sim.end(0, { reason: 'surrender' }); break;
      default: break;
    }
  }
  snapshot() {
    const sim = this.sim;
    const tw = (b) => [Math.round(b.hp), b.maxHp, b.alive ? 1 : 0, b.active ? 1 : 0, Math.round(b.shield)];
    // room mode: only the temp cards (Copy Cat...) the hand / NEXT point at travel, as [deckIndex, ...card]
    const cards = (s) => {
      if (!this.room) return s.deck.slice(s.baseLen).map((c) => [c.id, c.unit, c.level, c.variant ?? 'base', c.skin ?? null]);
      const out = [];
      for (const k of [...s.hand, s.queue[0] ?? -1]) {
        const c = k >= s.baseLen ? s.deck[k] : null;
        if (c) out.push([k, c.id, c.unit, c.level, c.variant ?? 'base', c.skin ?? null]);
      }
      return out;
    };
    const snap = {
      t: 's', time: +sim.t.toFixed(2), tl: sim.timeLimit, ot: sim.overtime ? 1 : 0, de: sim.doubleEnergy ? 1 : 0, p: sim.paused ? 1 : 0,
      sides: sim.sides.map((s) => [+s.energy.toFixed(2), s.overclock, +s.sig.toFixed(3), s.hand, [s.hand.map((_, k) => sim.cardCost(s.i, k)), s.queue[0] ?? -1, cards(s)], s.skillCds.map((c) => +c.toFixed(1)),
        [+s.buffs.rally.toFixed(1), +s.buffs.dance.toFixed(1), +s.buffs.immortal.toFixed(1)], null, tw(s.lab),
        s.mega ? [+s.mega.charge.toFixed(3), s.mega.used ? 1 : 0] : null]),
      cin: +(sim.cinematic ?? 0).toFixed(2),
      mv: sim.movers.map((m) => [m.id, r2(m.x)]),
    };
    const live = sim.units.filter((u) => !u.dead);
    const flags = (u) => (u.buffs.burnT > 0 ? 1 : 0) | (u.buffs.slowT > 0 && u.buffs.slow > 0 ? 2 : 0);
    if (this.room) {
      // one flat array, 7 numbers per unit: id, x*100, y*100, hp, maxHp, state*4+flags, grow*100
      const f = [];
      for (const u of live) f.push(u.id, Math.round(u.x * 100), Math.round(u.y * 100), Math.round(u.hp), Math.round(u.maxHp), Math.max(0, STATES.indexOf(u.state)) * 4 + flags(u), Math.round((u.buffs.growScale ?? 1) * 100));
      snap.uf = f;
    } else {
      snap.u = live.map((u) => [u.id, +u.x.toFixed(3), +u.y.toFixed(3), Math.round(u.hp), Math.round(u.maxHp), Math.max(0, STATES.indexOf(u.state)), u.buffs.growScale ?? 1, flags(u)]);
    }
    return snap;
  }
  update(dt) {
    this.acc += dt;
    if (this.acc < 1 / (this.room ? ROOM_HZ : SEND_HZ) && !this.sim.over) return;
    this.acc = 0;
    const snap = this.snapshot();
    if (!this.room) {
      snap.e = this.pending;
      this.pending = [];
      this.peer.send(snap);
      return;
    }
    // room: reliable events first (in order), then cosmetic, then the latest state
    const crit = [], fx = [];
    for (const e of this.pending) (COSMETIC.has(e.type) ? fx : crit).push(e);
    this.pending = [];
    for (const batch of chunkEvents(crit, 900)) {
      this.peer.send({ t: 'e', e: batch });
      this.stats.maxRel = Math.max(this.stats.maxRel, JSON.stringify(batch).length);
    }
    if (fx.length) {
      // lossy fast path: keep it to one emit per tick, drop the overflow (projectiles first in line)
      fx.sort((a, b) => (a.proj ? 0 : 1) - (b.proj ? 0 : 1));
      const keep = chunkEvents(fx, 3000);
      for (let i = 1; i < keep.length; i++) this.stats.fxDropped += keep[i].length;
      this.peer.sendFx({ t: 'x', e: keep[0] });
      this.stats.maxFx = Math.max(this.stats.maxFx, JSON.stringify(keep[0]).length);
    }
    this.peer.sendState(snap);
    this.stats.maxState = Math.max(this.stats.maxState, JSON.stringify(snap).length);
    this.stats.ticks++;
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
      const deck = (s.deck || []).slice(0, DECK_MAX).map((c) => ({ ...c, unit: c.unit ?? c.id, spell: !!SPELLS[c.unit ?? c.id], special: !!SPELLS[c.unit ?? c.id]?.special }));
      const mk = (kind, x, half) => ({ building: true, kind, side: i, x, half, hp: 1, maxHp: 1, alive: true, active: true, shield: 0, radius: half, dead: false });
      return {
        i, dir: i === 0 ? 1 : -1, labX: i === 0 ? -LAB_X : LAB_X, name: s.name, deck, hand: deck.slice(0, 4).map((_, k) => k), queue: [], costs: [], baseLen: deck.length,
        energy: ENERGY.start, overclock: 0, sig: 0,
        lab: mk('lab', i === 0 ? -LAB_X : LAB_X, LAB_HALF), turret: null,
        mega: s.mega && MEGAS[s.mega.id] ? { id: s.mega.id, variant: s.mega.variant ?? 'base', level: s.mega.level ?? 1, charge: 0, used: false } : null,
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
    return s.lab;
  }

  onMsg(msg) {
    // room transport: reliable events ('e') and cosmetic events ('x') arrive apart from the state
    if (msg.t === 'e' || msg.t === 'x') {
      if (Array.isArray(msg.e)) for (const e of msg.e) this.applySafe(e, msg.t === 'x');
      return;
    }
    if (msg.t !== 's') return;
    for (const e of msg.e || []) this.applySafe(e, false);
    if (typeof msg.time !== 'number' || !Array.isArray(msg.sides)) return;
    // latest-wins state can arrive out of order on a lossy path: keep the newest
    if (msg.time < this.t - 0.001 && !msg.e) return;
    this.t = msg.time;
    this.timeLimit = msg.tl;
    this.overtime = !!msg.ot;
    this.doubleEnergy = !!msg.de;
    this.paused = !!msg.p;
    this.cinematic = msg.cin ?? 0;
    const room = Array.isArray(msg.uf);
    msg.sides.forEach((arr, hs) => {
      const s = this.sides[mSide(hs)];
      if (!s || !Array.isArray(arr)) return;
      const [energy, overclock, sig, hand, cyc, skillCds] = arr;
      s.energy = energy;
      s.overclock = overclock;
      s.sig = sig;
      s.skillCds = skillCds;
      if (room) {
        // temp cards come as [deckIndex, id, unit, level, variant, skin]
        for (const [k, id, unit, level, variant, skin] of cyc[2]) {
          if (!s.deck[k] || s.deck[k].id !== id) s.deck[k] = { id, unit, level, variant, skin, spell: !!SPELLS[unit], special: !!SPELLS[unit]?.special, temp: true };
        }
      } else {
        while (s.deck.length - s.baseLen < cyc[2].length) {
          const [id, unit, level, variant, skin] = cyc[2][s.deck.length - s.baseLen];
          s.deck.push({ id, unit, level, variant, skin, spell: !!SPELLS[unit], special: !!SPELLS[unit]?.special, temp: true });
        }
      }
      // never point the hand at a card we have not heard of yet
      if (Array.isArray(hand) && hand.every((k) => s.deck[k])) {
        s.hand = hand;
        s.costs = cyc[0];
        s.queue = cyc[1] >= 0 && s.deck[cyc[1]] ? [cyc[1]] : [];
      }
      [s.buffs.rally, s.buffs.dance, s.buffs.immortal] = arr[6];
      const b = s.lab, a = arr[8];
      [b.hp, b.maxHp] = a;
      b.alive = !!a[2];
      b.dead = !b.alive;
      b.active = !!a[3];
      b.shield = a[4];
      if (s.mega && arr[9]) { s.mega.charge = arr[9][0]; s.mega.used = !!arr[9][1]; }
    });
    const alive = new Set();
    const setU = (id, x, y, hp, mh, st, gs, fl) => {
      const u = this.unitMap.get(id);
      if (!u) return;
      alive.add(id);
      u.x = mX(x);
      u.y = y;
      u.hp = hp;
      u.maxHp = mh;
      u.state = STATES[st] ?? 'walk';
      u.buffs.growScale = gs;
      u.buffs.burnT = fl & 1 ? 0.3 : 0;
      u.buffs.slowT = fl & 2 ? 0.3 : 0;
      u.buffs.slow = fl & 2 ? 0.4 : 0;
    };
    if (room) {
      const f = msg.uf;
      for (let i = 0; i + 6 < f.length; i += 7) setU(f[i], f[i + 1] / 100, f[i + 2] / 100, f[i + 3], f[i + 4], f[i + 5] >> 2, f[i + 6] / 100, f[i + 5] & 3);
    } else for (const a of msg.u || []) setU(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]);
    const now = performance.now();
    for (const u of this.units) {
      if (alive.has(u.id) || u.dead) continue;
      // gone from the host's state: only trust a snapshot taken after the unit was born
      const stale = u._ts !== undefined ? msg.time > u._ts + 0.25 : now - u._born > 400;
      if (stale) { u.dead = true; u._deadAt = now; }
    }
    this.units = this.units.filter((u) => !u.dead || now - (u._deadAt ?? 0) < 100);
    for (const m of msg.mv || []) {
      const mv = this.moverMap.get(m[0]);
      if (mv) mv.x = mX(m[1]);
    }
  }

  /** Apply one event from the network; a malformed one is skipped, never fatal. */
  applySafe(e, cosmetic) {
    if (!e || typeof e !== 'object' || typeof e.type !== 'string') return;
    try {
      this.applyEvent(e, cosmetic);
    } catch (err) {
      if (!this._warned) { this._warned = true; console.warn('net event skipped', e.type, err); }
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
      flying: !!def.traits?.flying, level: d.lv ?? 1, mega: !!d.mg,
    };
    if (typeof d.ts === 'number') u._ts = d.ts;
    this.unitMap.set(d.i, u);
    this.units.push(u);
    return u;
  }
  ref(d) {
    if (!d) return d;
    return this.unitMap.get(d.i) || { id: d.i, x: mX(d.x ?? 0), size: d.size ?? 1, side: mSide(d.side ?? 0), type: d.type ?? 'panther', st: swarmStats(d.type ?? 'panther', 1), buffs: {}, dead: true, z: 0, y: 0 };
  }

  applyEvent(e, cosmetic = false) {
    // a cosmetic hint about a unit we no longer track (late, or its death already arrived): skip it
    if (cosmetic && e.unit && !this.unitMap.has(e.unit.i)) return;
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
    if (this.projectiles.some((p) => p.t > p.flight + 1.5)) {
      // the hit that should have removed it was lost on the lossy path
      this.projectiles = this.projectiles.filter((p) => {
        if (p.t <= p.flight + 1.5) return true;
        this.projMap.delete(p.id);
        return false;
      });
    }
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
    return this.sides[si].costs?.[slot] ?? (c.spell ? SPELLS[c.unit] : SWARMS[c.unit])?.elixir ?? 3;
  }
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
  maxPower(si) {
    return BASE_UPGRADES[this.sides[si].overclock].max;
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
  deployRange(si) {
    const s = this.sides[si];
    const back = s.labX + s.dir * (LAB_HALF + 0.2);
    const front = si === 0 ? FIELD.DEPLOY_MAX : -FIELD.DEPLOY_MAX;
    return si === 0 ? [back, front] : [front, back];
  }
  clampDeploy(si, x) {
    const [a, b] = this.deployRange(si);
    return Math.max(a, Math.min(b, x));
  }
  frontBuilding(si) {
    const en = this.sides[1 - si];
    return en.lab.alive ? en.lab : null;
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
  useMega() {
    if (!this.canMega(0)) return false;
    this.send('mega');
    this.sides[0].mega.used = true;
    return true;
  }
  emote(id) {
    this.send('emote', { e: id });
  }
  end() {
    this.send('surrender');
  }
  surrender() {
    this.send('surrender');
  }
  dispose() {
    this.offMsg && this.offMsg();
  }
}
