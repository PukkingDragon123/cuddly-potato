// LAB MODULES in the battle sim (src/data/labModules.js): the equipped gear on
// each side's base. Pure logic, deterministic (the sim's own clock and rng).
//
//   mergeModules(rs, cfg)  folds the research-style keys into side.rs and
//                          returns side.lm ({ fx, ids, timers }) or null
//   tick(sim, side, dt)    the base's module weapons, repairs, healing, clones
//   regenBonus(sim, side)  extra POWER regen right now (Hamster Dynamo)
//   onBaseHit(sim, b)      Nuclear Reactor meltdown at 25% HP
//
// Events (sim.emit('modFire', { side, mod, ... })) drive the 3D effects in
// src/game/battle/modFx.js.
import { moduleMods } from '../../data/labModules.js';
import { SWARMS } from '../../data/swarms.js';
import { FIELD } from './field.js';
import { untargetable, immune } from './troopTraits.js';

const LAB_HALF = FIELD.LAB_HALF;
const R_TESLA = 5.8, R_TESLA_JUMP = 2.8, R_GOO = 7.6, R_LASER = 6.2, LASER_CD = 0.5;

/** Add the module keys the sim already knows (regen, ULT, zapper...) onto rs; returns side.lm or null. */
export function mergeModules(rs, cfg) {
  if (!cfg?.modules) return null;
  const m = moduleMods(cfg.modules, cfg.labLevel ?? 1);
  if (!m.list.length) return null;
  for (const [k, v] of Object.entries(m.rs)) rs[k] = (rs[k] ?? 0) + v;
  const fx = m.fx;
  return {
    fx, ids: m.ids, list: m.list,
    // first shots come a little after the start (no instant free damage)
    tesla: 1.2, goo: 1.6, laser: 0.6, acid: 1, drone: fx.droneCd || 0, snack: 0.5, clone: fx.cloneCd ? fx.cloneCd * 0.7 : 0,
    laserTarget: null, laserRamp: 0, melted: false, acidOn: false,
  };
}

/** Extra POWER regen fraction right now. */
export function regenBonus(sim, s) {
  const fx = s.lm?.fx;
  return fx && fx.earlyRegen && sim.t < fx.earlyT ? fx.earlyRegen : 0;
}

/** Weapon damage multiplier from the in-battle base tier (Camp Lab 0.85 .. Mega HQ 1.15). */
const tierK = (s) => 0.85 + 0.06 * (s.overclock ?? 0);
const front = (s) => s.labX + s.dir * LAB_HALF;

function targetable(sim, e, si) {
  return !e.dead && e.side !== si && e.state !== 'spawn' && !untargetable(e);
}

export function tick(sim, s, dt) {
  const lm = s.lm;
  const b = s.lab;
  if (!lm || !b.alive || sim.over) return;
  const fx = lm.fx, si = s.i;
  const stopped = b.frozen > 0 || s.buffs.stopped > 0;
  const k = tierK(s);

  // ---- DEFENSE: Tesla Coil (chain zap)
  if (fx.teslaDmg && !stopped && (lm.tesla -= dt) <= 0) {
    let best = null, bd = Infinity;
    for (const e of sim.units) {
      if (!targetable(sim, e, si)) continue;
      const d = Math.abs(e.x - b.x) - e.radius;
      if (d <= R_TESLA && d < bd) { bd = d; best = e; }
    }
    if (best) {
      lm.tesla = fx.teslaCd;
      const hit = [best];
      let cur = best;
      while (hit.length < fx.teslaJumps) {
        let nx = null, nd = Infinity;
        for (const e of sim.units) {
          if (hit.includes(e) || !targetable(sim, e, si)) continue;
          const d = Math.abs(e.x - cur.x);
          if (d <= R_TESLA_JUMP && d < nd) { nd = d; nx = e; }
        }
        if (!nx) break;
        hit.push(nx);
        cur = nx;
      }
      sim.emit('modFire', { side: si, mod: 'teslaCoil', targets: hit.map((u) => ({ id: u.id, x: u.x, z: u.z ?? 0, unit: u })) });
      hit.forEach((u, i) => sim.damage(u, fx.teslaDmg * k * 0.8 ** i, null, { kind: 'zap' }));
    } else lm.tesla = 0.25;
  }

  // ---- DEFENSE: Goo Cannon (slow zone on the biggest crowd)
  if (fx.gooDps && !stopped && (lm.goo -= dt) <= 0) {
    let bx = null, bc = 0;
    for (const a of sim.units) {
      if (!targetable(sim, a, si) || Math.abs(a.x - b.x) > R_GOO) continue;
      let c = 0;
      for (const e of sim.units) if (targetable(sim, e, si) && Math.abs(e.x - a.x) <= 1.4) c += e.boss ? 3 : 1 + (e.cost ?? 0) / 6;
      if (c > bc) { bc = c; bx = a.x; }
    }
    if (bx !== null) {
      lm.goo = fx.gooCd;
      const x = bx, dur = 3.2;
      sim.emit('modFire', { side: si, mod: 'gooCannon', x, r: 1.4, dur, flight: 0.55 });
      sim.later(0.55, () => sim.zones.push({ side: si, x, r: 1.4, t: dur, slow: fx.gooSlow, dps: fx.gooDps * k, kind: 'slime' }));
    } else lm.goo = 0.3;
  }

  // ---- DEFENSE: Laser Turret (ramps up on the same target)
  if (fx.laserDmg && !stopped && (lm.laser -= dt) <= 0) {
    let best = null, bd = Infinity;
    for (const e of sim.units) {
      if (!targetable(sim, e, si)) continue;
      const d = Math.abs(e.x - b.x) - e.radius;
      if (d <= R_LASER && d < bd) { bd = d; best = e; }
    }
    if (best) {
      lm.laser = LASER_CD;
      if (lm.laserTarget === best.id) lm.laserRamp = Math.min(8, lm.laserRamp + 1);
      else { lm.laserTarget = best.id; lm.laserRamp = 0; }
      sim.emit('modFire', { side: si, mod: 'laserTurret', target: { id: best.id, x: best.x, z: best.z ?? 0, unit: best }, ramp: lm.laserRamp });
      sim.damage(best, fx.laserDmg * k * (1 + fx.laserRamp * lm.laserRamp), null, { kind: 'laser' });
    } else { lm.laser = 0.2; lm.laserTarget = null; lm.laserRamp = 0; }
  }

  // ---- DEFENSE: Acid Sprinkler (everything close to the base)
  if (fx.acidDmg && !stopped && (lm.acid -= dt) <= 0) {
    lm.acid = 1;
    const fx0 = front(s);
    let n = 0;
    for (const e of sim.units) {
      if (e.dead || e.side === si || e.state === 'spawn' || immune(e)) continue;
      if ((e.x - fx0) * s.dir > fx.acidR || (e.x - fx0) * s.dir < -LAB_HALF * 2) continue;
      sim.damage(e, fx.acidDmg * k, null, { kind: 'acid' });
      n++;
    }
    if (n || lm.acidOn) sim.emit('modFire', { side: si, mod: 'acidSprinkler', on: n > 0, r: fx.acidR });
    lm.acidOn = n > 0;
  }

  // ---- UTILITY: Repair Drone
  if (fx.droneHeal && (lm.drone -= dt) <= 0) {
    lm.drone = fx.droneCd;
    if (b.hp < b.maxHp) {
      const amt = Math.min(b.maxHp - b.hp, b.maxHp * fx.droneHeal);
      b.hp += amt;
      sim.emit('modFire', { side: si, mod: 'repairDrone', amount: Math.round(amt) });
    }
  }

  // ---- UTILITY: Snack Dispenser (heals your troops near the base)
  if (fx.snackHeal && (lm.snack -= dt) <= 0) {
    lm.snack = 0.5;
    const fx0 = front(s);
    let n = 0;
    for (const u of sim.units) {
      if (u.dead || u.side !== si || u.state === 'spawn' || u.hp >= u.maxHp) continue;
      if ((u.x - fx0) * s.dir > fx.snackR || (u.x - fx0) * s.dir < -LAB_HALF * 2) continue;
      sim.heal(u, u.maxHp * fx.snackHeal * 0.5);
      n++;
    }
    if (n && (lm.snackFx = (lm.snackFx ?? 0) + 1) % 3 === 1) sim.emit('modFire', { side: si, mod: 'snackDispenser', count: n });
  }

  // ---- UTILITY: Cloning Vat (a free copy of your cheapest troop card)
  if (fx.cloneCd && !stopped && (lm.clone -= dt) <= 0) {
    lm.clone = fx.cloneCd;
    let card = null;
    for (const c of s.deck) {
      if (c.spell) continue;
      const cost = SWARMS[c.unit]?.elixir ?? 9;
      if (!card || cost < card.cost || (cost === card.cost && c.id < card.c.id)) card = { c, cost };
    }
    if (card) {
      const u = sim.spawnUnit(si, card.c, { x: front(s) + s.dir * 0.4, z: -0.4, delay: 0.6 });
      u.clone = true;
      sim.emit('modFire', { side: si, mod: 'cloningVat', unit: u });
    }
  }
}

/** Nuclear Reactor: the first time the base drops below 25% HP it melts down (area damage + knockback). */
export function onBaseHit(sim, b) {
  const s = sim.sides[b.side];
  const lm = s.lm;
  if (!lm?.fx.meltdown || lm.melted || b.hp > b.maxHp * 0.25) return;
  lm.melted = true;
  const x = front(s) + s.dir * 1.6;
  sim.emit('modFire', { side: b.side, mod: 'reactor', kind: 'meltdown', x, r: 4.6 });
  sim.areaDamage(b.side, x, 4.6, lm.fx.meltdown * tierK(s), { kind: 'nuke', knock: 6 });
}
