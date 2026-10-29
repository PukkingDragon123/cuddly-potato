// Troop signature traits: per-unit behaviour hooks for BattleSim (sim.js).
// Every collectable troop has one signature mechanic (see the trait table in
// data/swarms.js). sim.js calls these hooks from its unit code; everything here
// is pure game logic (no rendering). Visual-only events emitted from here:
//   roar, summon, wrap, stop, spin, trail, puddle, blink, charge, chargeHit, leap, leapLand,
//   reveal, burrow, surface, phase, expose, absorb, deathBomb, revive, erupt, strike, strikeHit,
//   abduct, pull, root, slam, freezeHit, heatUp, devour, execute, feast, scare, healPulse, rally,
//   shove, thorns (a 'hit' with kind 'thorns'), plus 'buff' { kind: 'rage' } for berserk.
import { statMult } from '../../data/swarms.js';
import { FIELD } from './field.js';

const GRAV = 32;
const FEAR_SPEED = 0.85;
const RETREAT_SPEED = 1.35;

/** Can't be damaged at all right now (intangible / underground). */
export function immune(e) {
  return !!(e.phased || e.burrowing);
}
/** Can't be picked as a target (invisible, intangible, underground or mid-leap). */
export function untargetable(e) {
  return !!(e.cloaked || e.phased || e.burrowing || e.state === 'leap');
}
const lvlMult = (u) => statMult(u.level ?? 1);
const isTroop = (t) => t && !t.building && !t.none && t.st;
const TICK_TRAITS = ['phase', 'burrow', 'charge', 'trail', 'rally', 'healer', 'roar', 'scare', 'summon', 'strike', 'blink', 'leap', 'unstoppable', 'skirmish', 'abduct', 'devour', 'puddle'];

/** Called once from spawnUnit. */
export function initTraits(sim, u) {
  const t = u.st.traits;
  const ts = (u.ts = { lastX: u.x });
  // does this troop need the per-tick trait update at all?
  ts.active = TICK_TRAITS.some((k) => t[k]);
  if (t.shield) u.shieldHp = u.maxHp * t.shield;
  if (t.stealth) u.cloaked = true;
  if (t.roar) ts.roarT = t.roar.first ?? 0.6;
  if (t.summon) ts.summonT = t.summon.first ?? t.summon.every;
  if (t.strike) ts.strikeT = t.strike.first ?? 2.5;
  if (t.healer) ts.healT = 1;
  if (t.scare) ts.scareT = t.scare.first ?? 1;
  if (t.phase) ts.phaseT = t.phase.off;
}

/**
 * Boss versions of troops keep the fight readable: no blind spots, phasing, burrowing,
 * hit-and-run or leaps, and a ranged artillery boss fights troops instead of only the base.
 */
const BOSS_DROP = ['mortar', 'phase', 'stealth', 'burrow', 'fragile', 'blink', 'skirmish', 'leap', 'kamikaze', 'unstoppable', 'healer'];
export function bossTraits(traits, projectile) {
  const t = { ...traits };
  for (const k of BOSS_DROP) delete t[k];
  if (t.siege && projectile) delete t.siege;
  return t;
}

/** Back the unit off towards its own base (fear / hit-and-run / blink), never behind its own base face. */
function stepBack(sim, u, dist) {
  const s = sim.sides[u.side];
  const back = s.labX + s.dir * (FIELD.LAB_HALF + 0.3);
  u.x -= s.dir * dist;
  if ((u.x - back) * s.dir < 0) u.x = back;
}

/**
 * Per-tick trait behaviour, called from updateUnit after the status timers.
 * Returns true when it used up the unit's turn (leaping, fleeing, retreating...).
 */
export function tickTraits(sim, u, dt) {
  const b = u.buffs, ts = u.ts;
  // debuffs any troop can carry
  if (b.exposeT > 0) b.exposeT -= dt;
  if (b.rootT > 0) b.rootT -= dt;
  if (b.rootCd > 0) b.rootCd -= dt;
  if (b.wrapCd > 0) b.wrapCd -= dt;
  if (b.rallyT > 0) b.rallyT -= dt;
  if (b.liftT > 0) {
    b.liftT -= dt;
    const k = 1 - Math.max(0, b.liftT) / (b.liftDur || 1);
    u.y = Math.sin(Math.PI * Math.min(1, k)) * 1.6;
    if (b.liftT <= 0) u.y = 0;
  }
  if (b.fearT > 0 && !(b.freeze > 0 || b.stun > 0) && u.state !== 'kb' && u.state !== 'leap') {
    // SCARED: run the wrong way
    b.fearT -= dt;
    u.state = 'walk';
    u.atkPhase = 0;
    stepBack(sim, u, u.st.speed * FEAR_SPEED * dt);
    return true;
  }
  if (!ts.active) return false;
  const t = u.st.traits, s = sim.sides[u.side], dir = s.dir;
  const moved = Math.abs(u.x - ts.lastX);
  ts.lastX = u.x;
  if (t.unstoppable) { b.stun = 0; b.freeze = 0; b.slow = 0; b.fearT = 0; b.rootT = 0; }
  if (ts.abductCd > 0) ts.abductCd -= dt;
  if (ts.devourCd > 0) ts.devourCd -= dt;
  if (ts.blinkCd > 0) ts.blinkCd -= dt;
  if (ts.puddleCd > 0) ts.puddleCd -= dt;

  // LEAP: mid-air over the front line
  if (u.state === 'leap') {
    ts.leapT += dt;
    u.x += u.vx * dt;
    u.vy -= GRAV * dt;
    u.y = Math.max(0, u.y + u.vy * dt);
    if (ts.leapT >= ts.leapDur) {
      u.y = 0; u.vy = 0; u.vx = 0;
      u.state = 'walk';
      u.cool = 0;
      sim.clampUnit(u);
      sim.emit('leapLand', { unit: u, x: u.x });
    }
    return true;
  }
  if (u.state === 'kb') { ts.run = 0; if (ts.charging) { ts.charging = false; sim.emit('chargeEnd', { unit: u }); } return false; }

  // PHASE: intangible on a cycle
  if (t.phase) {
    ts.phaseT -= dt;
    if (ts.phaseT <= 0) {
      u.phased = !u.phased;
      ts.phaseT = u.phased ? t.phase.on : t.phase.off;
      sim.emit('phase', { unit: u, on: u.phased });
    }
  }
  // BURROW: underground (untouchable) until it reaches something to hit
  if (u.burrowing) {
    u.y = -1.2;
    if (sim.findTarget(u, true)) {
      u.burrowing = false;
      u.y = 0;
      sim.emit('surface', { unit: u, x: u.x });
    }
  } else if (t.burrow && !ts.surfaced && !ts.dug) {
    ts.dug = true;
    u.burrowing = true;
    u.y = -1.2;
    sim.emit('burrow', { unit: u, x: u.x });
  }

  const held = b.freeze > 0 || b.stun > 0;
  if (held) {
    ts.run = 0;
    if (ts.charging) { ts.charging = false; sim.emit('chargeEnd', { unit: u }); }
    return false;
  }
  // HIT-AND-RUN: zip back out of reach after a strike
  if (ts.retreatT > 0) {
    ts.retreatT -= dt;
    u.state = 'walk';
    stepBack(sim, u, u.st.speed * RETREAT_SPEED * dt);
    return true;
  }

  // CHARGE: a run-up builds into a charge
  if (t.charge) {
    if (u.state === 'walk') ts.run = (ts.run ?? 0) + moved;
    if (!ts.charging && (ts.run ?? 0) >= t.charge.after) {
      ts.charging = true;
      sim.emit('charge', { unit: u });
    }
  }
  // FIRE TRAIL: burning ground every step or so, and under the brawl while it fights
  if (t.trail) {
    const tr = t.trail;
    let at = null;
    if (u.state === 'walk') {
      ts.trailD = (ts.trailD ?? tr.r * 2) + moved;
      if (ts.trailD >= tr.r * 2) at = u.x;
    } else if (u.state === 'attack') {
      ts.trailT = (ts.trailT ?? 0) - dt;
      if (ts.trailT <= 0) at = u.x + dir * (u.radius + 0.45);
    }
    if (at !== null) {
      ts.trailD = 0;
      ts.trailT = tr.dur;
      sim.zones.push({ side: u.side, x: at, r: tr.r, t: tr.dur, slow: 0, dps: tr.dps * lvlMult(u) * u.dmgMult, kind: tr.kind ?? 'fire' });
      sim.emit('trail', { unit: u, side: u.side, x: at, z: u.z, r: tr.r, dur: tr.dur, kind: tr.kind ?? 'fire' });
    }
  }
  // SUGAR RUSH aura
  if (t.rally) {
    ts.rallyT = (ts.rallyT ?? 0) - dt;
    if (ts.rallyT <= 0) {
      ts.rallyT = 0.25;
      let n = 0;
      for (const a of sim.units) {
        if (a.dead || a.side !== u.side || a.state === 'spawn' || Math.abs(a.x - u.x) > t.rally.r) continue;
        a.buffs.rallyT = 0.45;
        a.buffs.rallyAtk = t.rally.atk;
        a.buffs.rallySpd = t.rally.spd;
        n++;
      }
      ts.rallyFx = (ts.rallyFx ?? 0) - 0.25;
      if (ts.rallyFx <= 0 && n > 1) { ts.rallyFx = 1.2; sim.emit('rally', { unit: u, r: t.rally.r }); }
    }
  }
  // HEALER
  if (t.healer) {
    ts.healT -= dt;
    if (ts.healT <= 0) {
      let best = null, bf = 0.97;
      for (const a of sim.units) {
        if (a.dead || a.side !== u.side || a.state === 'spawn' || a.mega || Math.abs(a.x - u.x) > t.healer.r) continue;
        const f = a.hp / a.maxHp;
        if (f < bf) { bf = f; best = a; }
      }
      if (best) {
        sim.heal(best, t.healer.amt * lvlMult(u));
        sim.emit('healPulse', { unit: u, target: best });
        ts.healT = t.healer.every;
      } else ts.healT = 0.3;
    }
  }
  // ROAR: stun burst
  if (t.roar) {
    ts.roarT -= dt;
    if (ts.roarT <= 0) {
      const hit = sim.units.filter((e) => !e.dead && e.side !== u.side && e.state !== 'spawn' && !immune(e) && Math.abs(e.x - u.x) <= t.roar.r + e.radius);
      if (hit.length) {
        for (const e of hit) if (!e.mega && !e.st.traits.unstoppable) e.buffs.stun = Math.max(e.buffs.stun, t.roar.stun * (e.boss ? 0.4 : 1));
        sim.emit('roar', { unit: u, r: t.roar.r, n: hit.length });
        ts.roarT = t.roar.every;
      } else ts.roarT = 0.25;
    }
  }
  // SCARE
  if (t.scare) {
    ts.scareT -= dt;
    if (ts.scareT <= 0) {
      const hit = sim.units.filter((e) => !e.dead && e.side !== u.side && e.state !== 'spawn' && !e.boss && !e.mega && !immune(e) && !e.st.traits.unstoppable && Math.abs(e.x - u.x) <= t.scare.r + e.radius);
      if (hit.length) {
        for (const e of hit) { e.buffs.fearT = t.scare.dur; e.atkPhase = 0; }
        sim.emit('scare', { unit: u, r: t.scare.r, ids: hit.map((e) => e.id) });
        ts.scareT = t.scare.every;
      } else ts.scareT = 0.25;
    }
  }
  // SUMMONER
  if (t.summon) {
    ts.summonT -= dt;
    if (ts.summonT <= 0) {
      ts.summonT = t.summon.every;
      let alive = 0;
      for (const m of sim.units) if (!m.dead && m.summoner === u.id) alive++;
      if (alive < t.summon.max) {
        const sm = t.summon;
        const m = sim.spawnUnit(u.side, { id: sm.unit, unit: sm.unit, level: u.level }, { x: u.x - dir * 0.45, z: u.z, delay: 0.3, hpMult: sm.hp ?? 1, dmgMult: (sm.dmg ?? 1) * u.dmgMult, scale: sm.scale ?? 0.9 });
        m.summoner = u.id;
        m.summoned = true;
        sim.emit('summon', { unit: u, minion: m, x: m.x });
      }
    }
  }
  // ORBITAL STRIKE on the biggest enemy crowd in range
  if (t.strike) {
    ts.strikeT -= dt;
    if (ts.strikeT <= 0) {
      const st = t.strike;
      let bx = null, bc = 0;
      for (const a of sim.units) {
        if (a.dead || a.side === u.side || a.state === 'spawn' || immune(a) || Math.abs(a.x - u.x) > st.range) continue;
        let c = 0;
        for (const o of sim.units) if (!o.dead && o.side !== u.side && Math.abs(o.x - a.x) <= st.r) c += 1 + (o.cost || 1) / 4;
        if (c > bc) { bc = c; bx = a.x; }
      }
      if (bx === null) {
        const fb = sim.frontBuilding(u.side);
        if (fb && Math.abs(sim.faceX(fb, u.side) - u.x) <= st.range) bx = sim.faceX(fb, u.side) - dir * 0.6;
      }
      if (bx !== null) {
        const x = bx, dmg = st.dmg * lvlMult(u) * u.dmgMult;
        sim.emit('strike', { unit: u, side: u.side, x, r: st.r, delay: 0.7 });
        sim.later(0.7, () => {
          if (sim.over) return;
          sim.areaDamage(u.side, x, st.r, dmg, { src: u, kind: 'missile', building: st.building ?? 0.4, knock: 2 });
          sim.emit('strikeHit', { side: u.side, x, r: st.r });
        });
        ts.strikeT = st.every;
      } else ts.strikeT = 0.3;
    }
  }
  // BLINK: teleport back when an enemy gets too close
  if (t.blink && !(ts.blinkCd > 0)) {
    for (const e of sim.units) {
      if (e.dead || e.side === u.side || e.state === 'spawn' || untargetable(e) || e.st.projectile) continue;
      const d = (e.x - u.x) * dir;
      if (d > -0.2 && d <= t.blink.near + e.radius) {
        const from = u.x;
        stepBack(sim, u, t.blink.dist);
        ts.blinkCd = t.blink.cd;
        u.atkPhase = 0;
        sim.emit('blink', { unit: u, from, to: u.x });
        break;
      }
    }
  }
  // LEAP over the front line (once)
  if (t.leap && !ts.leapt && u.state !== 'spawn') {
    let front = null, fd = Infinity;
    for (const e of sim.units) {
      if (e.dead || e.side === u.side || e.state === 'spawn' || e.flying || untargetable(e)) continue;
      const d = (e.x - u.x) * dir;
      if (d > 0.2 && d <= t.leap.range && d < fd) { fd = d; front = e; }
    }
    if (front) {
      // land next to whatever hides behind the front line (or just past it)
      let back = null, bd = fd + 0.4;
      for (const e of sim.units) {
        if (e.dead || e.side === u.side || e.state === 'spawn' || untargetable(e)) continue;
        const d = (e.x - u.x) * dir;
        if (d > bd && d <= fd + 3.2) { bd = d; back = e; }
      }
      let lx = back ? back.x - dir * (back.radius + u.radius + 0.15) : front.x + dir * (front.radius + u.radius + 0.35);
      const fb = sim.frontBuilding(u.side);
      if (fb) { const lim = sim.faceX(fb, u.side) - dir * (u.radius + 0.1); if ((lx - lim) * dir > 0) lx = lim; }
      const dist = Math.abs(lx - u.x);
      ts.leapt = true;
      ts.leapT = 0;
      ts.leapDur = 0.42 + dist * 0.05;
      u.state = 'leap';
      u.atkPhase = 0;
      u.vx = (lx - u.x) / ts.leapDur;
      u.vy = (GRAV * ts.leapDur) / 2;
      sim.emit('leap', { unit: u, from: u.x, to: lx, dur: ts.leapDur });
      return true;
    }
  }
  return false;
}

/** Move-speed multiplier from traits / trait debuffs. */
export function moveMult(u) {
  const b = u.buffs, t = u.st.traits, ts = u.ts;
  if (b.rootT > 0) return 0;
  let m = 1;
  if (b.rallyT > 0) m *= 1 + (b.rallySpd ?? 0);
  if (ts?.charging) m *= t.charge.speed;
  if (ts?.feast) m *= 1 + t.feast.spd * ts.feast;
  return m;
}
/** Attack-speed multiplier from traits. */
export function atkMult(u) {
  return u.buffs.rallyT > 0 ? 1 + (u.buffs.rallyAtk ?? 0) : 1;
}
/** Mortar: an enemy is inside its blind spot, so it holds its ground instead of walking into it. */
export function holdGround(sim, u) {
  const t = u.st.traits;
  if (!t.mortar) return false;
  const dir = sim.sides[u.side].dir;
  for (const e of sim.units) {
    if (e.dead || e.side === u.side || e.state === 'spawn' || untargetable(e)) continue;
    const d = (e.x - u.x) * dir;
    if (d > -(u.radius + e.radius) && d < t.mortar.min) return true;
  }
  return false;
}
/** Outgoing damage multiplier that doesn't depend on the target (PACK). */
export function dmgMult(sim, u) {
  const t = u.st.traits;
  if (!t.pack) return 1;
  let n = 0;
  for (const a of sim.units) {
    if (a === u || a.dead || a.side !== u.side || a.state === 'spawn') continue;
    if (Math.abs(a.x - u.x) <= t.pack.r && ++n >= t.pack.max) break;
  }
  return 1 + t.pack.per * n;
}

/** Extra shots for MULTISHOT units (the primary projectile is already out). */
export function extraShots(sim, u, primary, mkProj) {
  const n = (u.st.traits.multishot ?? 1) - 1;
  if (n <= 0) return;
  const dir = sim.sides[u.side].dir;
  const reach = u.st.range + u.radius;
  const c = [];
  for (const e of sim.units) {
    if (e === primary || e.dead || e.side === u.side || e.state === 'spawn' || untargetable(e)) continue;
    const d = (e.x - u.x) * dir;
    if (d >= -(u.radius + e.radius) && d - e.radius <= reach) c.push([d, e]);
  }
  c.sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < Math.min(n, c.length); k++) mkProj(c[k][1], c[k][1].x);
}

/**
 * Before a hit lands: DEVOUR can swallow the target whole (returns true = hit consumed).
 * Also handles the STEALTH reveal.
 */
export function beforeHit(sim, u, t) {
  const tr = u.st.traits, ts = u.ts ?? (u.ts = {});
  if (u.cloaked) { u.cloaked = false; sim.emit('reveal', { unit: u }); }
  if (tr.devour && isTroop(t) && !t.dead && !t.boss && !t.mega && !(ts.devourCd > 0) && t.hp <= tr.devour.hp * lvlMult(u)) {
    ts.devourCd = tr.devour.cd;
    const gain = t.maxHp * tr.devour.heal;
    sim.emit('devour', { unit: u, victim: t, x: t.x });
    sim.kill(t, u);
    sim.heal(u, gain);
    return true;
  }
  return false;
}
/** Damage multiplier against this particular target (EXECUTE, HEAT-UP, CHARGE). */
export function hitMult(sim, u, t) {
  const tr = u.st.traits, ts = u.ts ?? (u.ts = {});
  let m = 1;
  if (tr.fireIce) ts.alt = !ts.alt;
  if (tr.execute && isTroop(t) && t.hp / t.maxHp < tr.execute.below) {
    m *= tr.execute.mult;
    sim.emit('execute', { unit: u, target: t });
  }
  if (tr.heatUp) {
    if (ts.heatTarget === t && !t.none && !t.building) ts.heat = Math.min(tr.heatUp.max, (ts.heat ?? 0) + tr.heatUp.per);
    else { ts.heat = 0; ts.heatTarget = t; }
    m *= 1 + ts.heat;
    if (ts.heat >= tr.heatUp.max && !ts.heatMax) { ts.heatMax = true; sim.emit('heatUp', { unit: u, target: t, max: true }); }
    if (ts.heat < tr.heatUp.max) ts.heatMax = false;
  }
  if (ts.charging) m *= tr.charge.mult;
  return m;
}
/** After the hit (or volley) landed. */
export function afterHit(sim, u, t, tx, dmg) {
  const tr = u.st.traits, ts = u.ts ?? (u.ts = {});
  const troop = isTroop(t) && !t.dead;
  // CHARGE impact
  if (tr.charge) {
    if (ts.charging) {
      ts.charging = false;
      if (troop) sim.knock(t, tr.charge.knock);
      sim.emit('chargeHit', { unit: u, target: t, x: tx });
    }
    ts.run = 0;
  }
  // SHOVE: push the target a step back
  if (tr.shove && troop && !t.mega && !t.st.traits.unstoppable && t.state !== 'kb') {
    const tdir = sim.sides[t.side].dir;
    t.x -= tdir * tr.shove * (t.boss || t.siege ? 0.3 : 1) / Math.max(1, t.size);
    sim.clampUnit(t);
    sim.emit('shove', { unit: t, src: u });
  }
  // PULL: yank the target into the brawl
  if (tr.pull && troop && !t.boss && !t.mega && !t.flying && !t.st.traits.unstoppable && !immune(t)) {
    const dir = sim.sides[u.side].dir;
    const dest = u.x + dir * (u.radius + t.radius + 0.8);
    const dist = Math.min(tr.pull.power, Math.abs(t.x - dest));
    if (dist > 0.4) {
      t.state = 'kb';
      t.vx = Math.sign(dest - t.x) * dist / 0.3;
      t.vy = 4;
      t.kbT = 0.45;
      t.atkPhase = 0;
      t.cool = Math.max(t.cool, 0.25);
      sim.emit('pull', { unit: t, src: u, to: dest });
    }
  }
  // ABDUCT
  if (tr.abduct && troop && !(ts.abductCd > 0) && !t.boss && !t.mega && !t.flying && !t.st.traits.unstoppable) {
    ts.abductCd = tr.abduct.cd;
    t.buffs.stun = Math.max(t.buffs.stun, tr.abduct.dur);
    t.buffs.liftT = t.buffs.liftDur = tr.abduct.dur;
    t.atkPhase = 0;
    sim.emit('abduct', { unit: t, src: u, dur: tr.abduct.dur });
  }
  // WET FLOOR puddle
  if (tr.puddle && !(ts.puddleCd > 0)) {
    const p = tr.puddle;
    ts.puddleCd = 1.2;
    sim.zones.push({ side: u.side, x: tx, r: p.r, t: p.dur, slow: p.slow, dps: (p.dps ?? 0) * lvlMult(u), kind: p.kind ?? 'water' });
    sim.emit('puddle', { unit: u, side: u.side, x: tx, r: p.r, dur: p.dur, kind: p.kind ?? 'water' });
  }
  // GROUND POUND every Nth hit
  if (tr.slam) {
    ts.hits = (ts.hits ?? 0) + 1;
    if (ts.hits % tr.slam.every === 0) {
      sim.areaDamage(u.side, tx, tr.slam.r, dmg * (tr.slam.mult - 1), { src: u, kind: 'slam', knock: tr.slam.knock, building: 0.5 });
      sim.emit('slam', { unit: u, x: tx, r: tr.slam.r });
    }
  }
  // FREEZE every Nth hit
  if (tr.freezeEvery) {
    ts.fz = (ts.fz ?? 0) + 1;
    if (ts.fz % tr.freezeEvery.n === 0 && troop && !t.st.traits.unstoppable && !t.mega) {
      t.buffs.freeze = Math.max(t.buffs.freeze, tr.freezeEvery.dur * (t.boss ? 0.4 : 1));
      sim.emit('freezeHit', { unit: t, src: u });
    }
  }
  // HIT AND RUN
  if (tr.skirmish) ts.retreatT = tr.skirmish.back / (u.st.speed * RETREAT_SPEED);
}

/**
 * Incoming damage on e (after armour). Returns the new amount, or -1 to cancel the hit
 * (intangible / underground, or a FRAGILE troop that blows up instead).
 */
export function incoming(sim, e, d, src, o) {
  if (immune(e)) return -1;
  const t = e.st.traits;
  if (t.fragile && src && src.st && !src.building && !e.dead) {
    // FRAGILE: a troop cracks it open early: a weaker splat right where it stands
    e.dead = true;
    sim.areaDamage(e.side, e.x, 1.5, e.st.dmg * e.dmgMult * (t.fragile.mult ?? 0.5), { src: e, kind: 'explode', knock: 3, building: 1 });
    sim.emit('explode', { unit: e, x: e.x, cracked: true });
    e.dead = false;
    sim.kill(e, src);
    return -1;
  }
  if (e.buffs.exposeT > 0) d *= 1 + (e.buffs.expose ?? 0);
  return d;
}
/** Shield damage multiplier for the attacker (SHIELD-BREAKER). */
export const shieldMult = (src) => src?.st?.traits?.breaker?.shield ?? 1;
/** Armour is ignored by SHIELD-BREAKERS. */
export const ignoresArmor = (src) => !!src?.st?.traits?.breaker;

/** After e lost `dealt` HP to src (THORNS, LIFESTEAL, BERSERK, ERUPT). */
export function damaged(sim, e, dealt, src, o) {
  if (dealt <= 0) return;
  const kind = o.kind;
  if (src && src.st && !src.dead && kind !== 'thorns') {
    const ls = src.st.traits.lifesteal;
    if (ls) sim.heal(src, dealt * ls);
    const th = e.st.traits.thorns;
    if (th && !src.st.projectile && !src.building && kind !== 'aura' && kind !== 'burn') sim.damage(src, dealt * th, e, { kind: 'thorns' });
  }
  if (e.hp <= 0) return;
  const t = e.st.traits, ts = e.ts ?? (e.ts = {});
  const frac = e.hp / e.maxHp;
  if (t.berserk && !ts.berserk && frac < t.berserk.below) {
    ts.berserk = true;
    e.buffs.rageT = 1e9;
    sim.emit('buff', { unit: e, kind: 'rage' });
  }
  if (t.erupt && !ts.erupted && frac < t.erupt.below) {
    ts.erupted = true;
    const er = t.erupt;
    sim.emit('erupt', { unit: e, x: e.x, r: er.r });
    sim.areaDamage(e.side, e.x, er.r, er.dmg * lvlMult(e) * e.dmgMult, { src: e, kind: 'fire', building: 0.5, knock: 3 });
    if (er.burn) {
      for (const a of sim.units) {
        if (a.dead || a.side === e.side || Math.abs(a.x - e.x) > er.r + a.radius) continue;
        a.buffs.burn = er.burn.dps; a.buffs.burnT = er.burn.dur; a.buffs.poison = false;
      }
    }
  }
}

/** On-hit statuses applied by the attacker's traits (per damage instance, target survived). */
export function hitStatus(sim, src, e) {
  const t = src.st.traits, b = e.buffs;
  if (e.building) return;
  const tough = !!e.st.traits.unstoppable || !!e.mega;
  if (t.poisonStack) {
    const p = t.poisonStack;
    const n = Math.min(p.max, (b.burnT > 0 && b.poison ? b.pStacks ?? 0 : 0) + 1);
    b.pStacks = n;
    b.burn = p.dps * n;
    b.burnT = p.dur;
    b.poison = true;
  }
  if (t.expose) {
    if (!(b.exposeT > 0)) sim.emit('expose', { unit: e });
    b.expose = t.expose.amt;
    b.exposeT = t.expose.dur;
  }
  if (tough) return;
  if (t.fireIce) {
    const fi = t.fireIce;
    if (src.ts?.alt) { b.burn = fi.burn.dps; b.burnT = fi.burn.dur; b.poison = false; }
    else b.freeze = Math.max(b.freeze, fi.freeze * (e.boss ? 0.4 : 1));
  }
  if (t.chill) {
    const cur = b.slowT > 0 ? b.slow : 0;
    b.slow = Math.min(t.chill.max, cur + t.chill.per);
    b.slowT = t.chill.dur;
  }
  if (t.root && !e.flying && !(b.rootCd > 0)) {
    b.rootT = t.root.dur * (e.boss ? 0.4 : 1);
    b.rootCd = t.root.dur + t.root.cd;
    sim.emit('root', { unit: e, dur: b.rootT });
  }
  if (t.wrap && !(b.wrapCd > 0)) {
    b.wrapN = (b.wrapN ?? 0) + 1;
    if (b.wrapN >= t.wrap.stacks) {
      b.wrapN = 0;
      b.stun = Math.max(b.stun, t.wrap.stun * (e.boss ? 0.4 : 1));
      b.wrapCd = t.wrap.stun + t.wrap.cd;
      e.atkPhase = 0;
      sim.emit('wrap', { unit: e, src });
    }
  }
  if (t.stopper) {
    const seen = (src.ts.stopped ??= new Set());
    if (!seen.has(e.id)) {
      seen.add(e.id);
      b.stun = Math.max(b.stun, t.stopper.stun * (e.boss ? 0.4 : 1));
      e.atkPhase = 0;
      sim.emit('stop', { unit: e, src });
    }
  }
}

/** After e was knocked out by src (DEATH BLAST, 1-UP, ABSORB, FEAST). */
export function onKilled(sim, e, src, o) {
  const t = e.st.traits;
  if (t.deathBomb) {
    const db = t.deathBomb;
    sim.emit('deathBomb', { unit: e, x: e.x, r: db.r, kind: db.kind ?? 'explode' });
    sim.areaDamage(e.side, e.x, db.r, db.dmg * lvlMult(e) * e.dmgMult, { src: e, kind: db.kind ?? 'explode', building: db.building ?? 0, stun: db.stun, knock: db.stun ? 0 : 2.5 });
  }
  if (t.revive && !e.revived && !o.noRevive) {
    const card = { id: e.card ?? e.type, unit: e.type, level: e.level, variant: e.variant, skin: e.skin, model: e.model };
    const m = sim.spawnUnit(e.side, card, { x: e.x, z: e.z, delay: t.revive.delay, hpMult: e.baseMaxHp / Math.max(1, e.st.hp), dmgMult: e.dmgMult });
    m.hp = m.maxHp * t.revive.hp;
    m.revived = true;
    m.summoner = e.summoner;
    sim.emit('revive', { unit: m, from: e, x: e.x });
  }
  if (src && src.st && !src.dead && !src.building) {
    const st = src.st.traits, ts = src.ts ?? (src.ts = {});
    if (st.absorb && (ts.absorbed ?? 0) < st.absorb.max) {
      ts.absorbed = (ts.absorbed ?? 0) + 1;
      const add = src.baseMaxHp * st.absorb.hp;
      src.baseMaxHp += add;
      src.maxHp += add;
      src.hp += add;
      src.dmgMult += st.absorb.dmg;
      src.buffs.growScale = (src.buffs.growScale ?? 1) + st.absorb.scale;
      src.radius *= 1 + st.absorb.scale * 0.6;
      sim.emit('grow', { unit: src });
      sim.emit('absorb', { unit: src, victim: e, n: ts.absorbed });
    }
    if (st.feast && (ts.feast ?? 0) < st.feast.max) {
      ts.feast = (ts.feast ?? 0) + 1;
      sim.heal(src, src.maxHp * st.feast.heal);
      sim.emit('feast', { unit: src, n: ts.feast });
    }
  }
}
