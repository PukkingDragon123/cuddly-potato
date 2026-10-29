// Opponent AI for the card-cycle battle. Reads its hand like a player:
// defends threats with counters dropped in front of its base, saves POWER
// to build pushes (tank first, support behind), uses spells on clusters or to
// finish the base, upgrades its base, fires its Commander ability and its MEGA.
// difficulty 0..1 controls reaction speed, patience and placement accuracy.
import { SWARMS } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { BASE_UPGRADES } from '../../data/labs.js';
import { FIELD } from './field.js';

const tankiness = (d) => d.hp * (1 + (d.traits?.armor ?? 0));
const splash = (t = {}) => !!(t.area || t.spin || t.pierce || t.chain || t.deathBomb || t.trail || t.puddle);
const dps = (d) => (d.dmg / d.atk) * (d.count ?? 1) * (splash(d.traits) ? 1.4 : 1);

export class BattleAI {
  constructor(sim, si, opts = {}) {
    this.sim = sim;
    this.si = si;
    this.d = opts.difficulty ?? 0.5;
    this.thinkT = 1.6 - this.d * 0.8;
    this.maxOverclock = opts.maxLab ?? opts.maxOverclock ?? Math.round(1 + this.d * 4);
    this.noSpells = !!opts.noSpells;
    this.sigDelay = opts.sigDelay ?? 0;
    this.patience = 0.78 - this.d * 0.18; // how full energy should be before starting a push
    this.pushStarted = 0;
    this.emotes = opts.onEmote ?? null;
  }

  r() {
    return this.sim.rand();
  }

  /** A drop point with difficulty-based sloppiness, clamped to the deploy zone (same rule as the player). */
  aimX(x) {
    const err = (1 - this.d) * 1.6;
    return this.sim.clampDeploy(this.si, x + (this.r() - 0.5) * err);
  }

  hand() {
    const sim = this.sim, s = sim.sides[this.si];
    return s.hand.map((k, slot) => {
      const card = s.deck[k];
      const def = card.spell ? SPELLS[card.unit] : SWARMS[card.unit];
      return { slot, card, def, cost: sim.cardCost(this.si, slot), spell: card.spell, special: !!card.special, ready: true };
    });
  }

  update(dt) {
    const sim = this.sim;
    if (sim.over || sim.paused || this.hold || sim.cinematic > 0) return;
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = (1.05 - this.d * 0.7) * (0.7 + this.r() * 0.6);
    const si = this.si, s = sim.sides[si];
    const dir = s.dir;
    const myFront = s.lab;
    const enemies = sim.enemiesOf(si).filter((e) => e.state !== 'spawn');
    const allies = sim.alliesOf(si);
    // enemies close to (or past the centre towards) my buildings
    const near = enemies.filter((e) => (e.x - myFront.x) * dir < 9.5);
    const threat = near.reduce((a, e) => a + (e.cost || 2) * (e.hp / e.maxHp) * (e.boss ? 4 : 1), 0);

    if (this.tryCommander(enemies, near)) return;
    if (!this.noSpells && this.trySpell(enemies)) return;
    if (this.trySpecial(threat)) return;

    const hand = this.hand();
    const affordable = hand.filter((h) => h.ready && h.cost <= s.energy);
    if (threat > 0.5) {
      this.defend(near, affordable, myFront);
      return;
    }
    // upgrade the base when safe (smarter rivals invest earlier and further)
    const oc = BASE_UPGRADES[s.overclock];
    if (oc.cost !== null && s.overclock < this.maxOverclock && sim.t < 50 + s.overclock * 30 + this.d * 40 && s.energy >= oc.cost + 1 && this.r() < 0.2 + this.d * 0.5) {
      sim.upgradeLab(si);
      return;
    }
    // support an ongoing push
    const pushing = allies.filter((u) => (u.x - s.labX) * dir > Math.abs(s.labX) - 1);
    if (pushing.length && s.energy >= 3) {
      const sup = affordable.filter((h) => !h.spell && h.def.role !== 'tank' && h.def.role !== 'siege');
      if (sup.length && this.r() < 0.35 + this.d * 0.5) {
        const back = Math.min(...pushing.map((u) => u.x * dir)) * dir;
        const pick = sup.sort((a, b) => dps(b.def) / b.cost - dps(a.def) / a.cost)[0];
        // support drops in just behind the rearmost pushing troop (ranged further back)
        const gap = (pick.def.range ?? 1) > 2 ? 1.8 : 0.9;
        sim.play(si, pick.slot, this.aimX(back - dir * gap));
        return;
      }
    }
    // start a push when energy is high (or don't leak at max)
    const cap = sim.maxPower(si);
    if (s.energy >= cap * this.patience || s.energy >= cap - 0.4) {
      const troops = affordable.filter((h) => !h.spell);
      if (!troops.length) return;
      const tank = troops.filter((h) => h.def.role === 'tank' || h.def.role === 'siege').sort((a, b) => tankiness(b.def) - tankiness(a.def))[0];
      const pick = tank ?? troops.sort((a, b) => b.cost - a.cost)[Math.floor(this.r() * Math.min(2, troops.length))];
      // tanks start at the back so support can stack behind; fast units go to the bridge
      const fast = pick.def.speed >= 1.7;
      const x = fast && !tank ? -dir * 1.2 : s.labX + dir * (FIELD.LAB_HALF + 0.5);
      sim.play(si, pick.slot, this.aimX(x));
      this.pushStarted = sim.t;
    }
  }

  defend(near, affordable, myFront) {
    const sim = this.sim, si = this.si, s = sim.sides[si], dir = s.dir;
    const troops = affordable.filter((h) => !h.spell);
    if (!troops.length) return;
    // the leading attacker
    const lead = near.reduce((a, e) => ((e.x - myFront.x) * dir < (a.x - myFront.x) * dir ? e : a), near[0]);
    const swarm = near.filter((e) => Math.abs(e.x - lead.x) < 2).length >= 3;
    const tanky = lead.maxHp > 1500 || lead.boss;
    const flying = lead.flying;
    const score = (h) => {
      const d = h.def;
      let v = dps(d) / (h.cost + 1);
      const t = d.traits ?? {};
      if (swarm && splash(t)) v *= 2.2;
      // tank killers: swarms, heat-up beams, executioners, shield-breakers vs armour
      if (tanky && (d.role === 'swarm' || dps(d) > 120 || t.heatUp || t.execute || t.wrap || (t.breaker && (lead.st?.traits?.armor || lead.shieldHp > 0)))) v *= 1.8;
      // small fry gets swallowed / stopped / leapt
      if (!tanky && (t.devour || t.stopper || t.leap)) v *= 1.3;
      if (t.siege) v *= 0.1;
      if (flying && (d.role === 'ranged' || d.projectile)) v *= 2;
      if (flying && !d.projectile && d.role !== 'flying') v *= 0.6;
      if (d.traits?.kamikaze && !tanky) v *= 0.4;
      if (d.role === 'siege') v *= 0.2;
      return v * (0.75 + this.r() * 0.5 * (1 - this.d));
    };
    const pick = troops.sort((a, b) => score(b) - score(a))[0];
    // hold back slightly to let the base cannon help (smarter AIs wait for the enemy to reach cannon range)
    const distToFront = (lead.x - myFront.x) * dir;
    if (distToFront > 8.5 && this.r() < this.d * 0.5) return;
    const range = pick.def.range ?? 1;
    // ranged defenders stay by the base (the zapper covers them); melee meets the attacker head-on
    const x = range > 2 ? myFront.x + dir * (FIELD.LAB_HALF + 1.2) : lead.x - dir * (1.3 + this.r() * 0.6);
    sim.play(si, pick.slot, this.aimX(x));
  }

  trySpell(enemies) {
    const sim = this.sim, si = this.si, s = sim.sides[si];
    const hand = this.hand();
    for (const h of hand) {
      if (!h.spell || h.special || h.cost > s.energy) continue;
      const sp = h.def;
      if (sp.id === 'foodThrow') {
        const allies = sim.alliesOf(si);
        let best = null, bc = 0;
        for (const a of allies) {
          let c = 0;
          for (const b of allies) if (Math.abs(a.x - b.x) < sp.radius && b.hp < b.maxHp * 0.7) c += b.cost;
          if (c > bc) { bc = c; best = a.x; }
        }
        if (bc >= 5 && this.r() < 0.4 + this.d * 0.5) return sim.play(si, h.slot, best);
        continue;
      }
      if (sp.id === 'labShield') {
        const b = s.lab;
        if (b.hp < b.maxHp * 0.5 && enemies.some((e) => Math.abs(e.x - b.x) < 4)) return sim.play(si, h.slot, b.x);
        continue;
      }
      // buff spells: on a fighting cluster of my troops
      if (['adrenaline', 'ironCoat', 'titanSerum'].includes(sp.id)) {
        const allies = sim.alliesOf(si);
        let best = null, bc = 0;
        for (const a of allies) {
          if (!enemies.some((e) => Math.abs(e.x - a.x) < 4)) continue;
          let c = 0;
          for (const b of allies) if (Math.abs(a.x - b.x) < sp.radius) c += b.cost || 1;
          if (c > bc) { bc = c; best = a.x; }
        }
        if (bc >= h.cost + 2 && this.r() < 0.35 + this.d * 0.5) return sim.play(si, h.slot, best);
        continue;
      }
      if (sp.id === 'overclockChip') {
        const near = enemies.filter((e) => Math.abs(e.x - s.lab.x) < 6).length;
        if ((near >= 2 || s.energy < 3) && this.r() < 0.4 + this.d * 0.4) return sim.play(si, h.slot, s.lab.x);
        continue;
      }
      // damage spells: clusters worth at least the spell's cost, or finishing a tower
      const fb = sim.frontBuilding(si);
      if (fb && sp.dmg && sp.building && fb.hp <= sp.dmg * sp.building * 0.95 && this.r() < 0.6 + this.d * 0.4) return sim.play(si, h.slot, fb.x);
      let bestX = null, bestV = 0;
      for (const e of enemies) {
        let v = 0;
        for (const o of enemies) if (Math.abs(o.x - e.x) <= sp.radius * 0.85) v += o.boss ? 6 : (o.cost || 1) * (o.hp / o.maxHp);
        if (v > bestV) { bestV = v; bestX = e.x; }
      }
      if (bestX !== null && bestV >= h.cost * (1.2 - this.d * 0.3) && this.r() < 0.3 + this.d * 0.6) return sim.play(si, h.slot, bestX);
    }
    return false;
  }

  /** SPECIAL cards: simple card-game sense (draw when rich, cash in when broke). */
  trySpecial(threat) {
    const sim = this.sim, si = this.si, s = sim.sides[si];
    const hand = this.hand();
    const others = hand.filter((h) => !h.special);
    const troopsOk = others.some((h) => !h.spell && h.cost <= s.energy);
    for (const h of hand) {
      if (!h.special || h.cost > s.energy) continue;
      const id = h.def.id;
      let use = false;
      if (id === 'energyDrink') use = s.energy <= 3 && (threat > 0.5 || this.r() < 0.25);
      else if (id === 'quickDraw') use = s.hand.length <= 4 && s.energy >= 5;
      else if (id === 'couponBook') use = others.length >= 3 && s.energy >= 3;
      else if (id === 'trashCompactor') use = !troopsOk || (others.length && others.every((o) => o.cost >= 5));
      else if (id === 'doubleUp') use = others.some((o) => !o.spell && o.cost + h.cost + 1 <= s.energy);
      else if (id === 'copyCat') use = !!s.last && s.energy >= 4;
      else if (id === 'adrenaline' || id === 'ironCoat') use = sim.alliesOf(si).filter((u) => !u.dead).length >= 3 && (threat > 0.5 || this.r() < 0.4);
      else if (id === 'titanSerum') use = others.some((o) => !o.spell && o.cost + h.cost <= s.energy && o.def.role !== 'swarm');
      else if (id === 'overclockChip') use = threat > 0.5 || s.energy < 4;
      else if (id === 'timeFreeze') use = threat > 2.5 || sim.enemiesOf(si).length >= 6;
      else if (id === 'goldenTicket') use = s.queue.some((k) => !s.deck[k].special && (SWARMS[s.deck[k].unit]?.elixir ?? 0) >= 4) && s.energy >= 3;
      // a card that never gets played clogs the hand: eventually cycle it anyway
      if (!use && s.energy >= sim.maxPower(si) - 1) use = true;
      if (use && this.r() < 0.45 + this.d * 0.5) return sim.play(si, h.slot, null);
    }
    return false;
  }

  tryCommander(enemies, near) {
    const sim = this.sim, si = this.si, s = sim.sides[si];
    // MEGA ultimate: save it for a real threat or a winning push
    if (sim.canMega(si)) {
      const allies = sim.alliesOf(si);
      if ((near.length >= 3 || enemies.some((e) => e.boss || e.mega) || (allies.length >= 4 && enemies.length >= 2)) && this.r() < 0.4 + this.d * 0.5) {
        sim.useMega(si);
        return true;
      }
    }
    if (s.cmd && s.sig >= 1 && sim.t > this.sigDelay) {
      // ULTIMATE: wait for the moment it swings the fight, but never sit on it for long
      this.sigReadyAt ??= sim.t;
      const allies0 = sim.alliesOf(si).filter((u) => !u.mega);
      const id = s.cmd.signature.id;
      const pricey = enemies.reduce((a, e) => a + (e.cost ?? 0), 0);
      let worth = enemies.some((e) => e.boss) || near.length >= 2;
      if (id === 'mutantUprising') worth ||= allies0.length >= 3 || (allies0.length >= 2 && enemies.length >= 2);
      else if (id === 'beastBuyout') worth ||= enemies.length >= 3 || pricey >= 9;
      else if (id === 'orbitalFlop') worth ||= (sim.densestEnemyX(si, 3.4)?.count ?? 0) >= 3;
      else worth ||= enemies.length >= 3 || (allies0.length >= 3 && enemies.length >= 1);
      const losing = s.lab.hp < s.lab.maxHp * 0.5 && enemies.length >= 1;
      const stale = sim.t - this.sigReadyAt > 14 && (enemies.length + allies0.length >= 2);
      if ((worth || losing || stale) && this.r() < 0.35 + this.d * 0.6) {
        if (sim.useSignature(si)) this.sigReadyAt = null;
        return true;
      }
    }
    const allies = sim.alliesOf(si);
    for (let k = 0; k < s.skills.length; k++) {
      if (s.skillCds[k] > 0) continue;
      const sk = s.skills[k];
      let use = false;
      if (['labRally', 'juanDance', 'lastToLeave'].includes(sk.id)) use = allies.length >= 3 && enemies.length >= 2;
      else if (sk.id === 'emergencyRepair') use = s.lab.hp < s.lab.maxHp * 0.6;
      else if (['footballKick', 'subscribeSmash', 'complain'].includes(sk.id)) use = enemies.length >= 3 || near.length >= 2;
      else if (sk.id === 'luckyFail') use = this.r() < 0.5;
      if (use && this.r() < 0.3 + this.d * 0.6) {
        sim.useSkill(si, k);
        return true;
      }
    }
    return false;
  }
}
