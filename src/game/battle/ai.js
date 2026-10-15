// Opponent AI for the lineup battle. Reads its lineup (slots + recharge) like a player:
// defends threats with counters dropped in front of its base, saves POWER
// to build pushes (tank first, support behind), uses spells on clusters or to
// finish the base, upgrades its base, fires its Commander ability and its MEGA.
// difficulty 0..1 controls reaction speed, patience and placement accuracy.
import { SWARMS } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { BASE_UPGRADES } from '../../data/labs.js';
import { FIELD } from './field.js';

const tankiness = (d) => d.hp * (1 + (d.traits?.armor ?? 0));
const dps = (d) => (d.dmg / d.atk) * (d.count ?? 1) * (d.traits?.area ? 1.4 : 1);

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

  hand() {
    const sim = this.sim, s = sim.sides[this.si];
    return s.hand.map((k, slot) => {
      const card = s.deck[k];
      const def = card.spell ? SPELLS[card.unit] : SWARMS[card.unit];
      return { slot, card, def, cost: sim.cardCost(this.si, slot), spell: card.spell, ready: sim.slotCd(this.si, slot) <= 0 };
    });
  }

  update(dt) {
    const sim = this.sim;
    if (sim.over || sim.paused || this.hold) return;
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
        void back;
        sim.play(si, pick.slot, null);
        return;
      }
    }
    // start a push when energy is high (or don't leak at max)
    if (s.energy >= 10 * this.patience || s.energy >= 9.6) {
      const troops = affordable.filter((h) => !h.spell);
      if (!troops.length) return;
      const tank = troops.filter((h) => h.def.role === 'tank' || h.def.role === 'siege').sort((a, b) => tankiness(b.def) - tankiness(a.def))[0];
      const pick = tank ?? troops.sort((a, b) => b.cost - a.cost)[Math.floor(this.r() * Math.min(2, troops.length))];
      // tanks start at the back so support can stack behind; fast units go to the bridge
      const fast = pick.def.speed >= 1.7;
      const x = fast && !tank ? sim.clampDeploy(si, -dir * 1.2) : s.labX + dir * (FIELD.LAB_HALF + 0.5);
      void x;
      sim.play(si, pick.slot, null);
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
      if (swarm && d.traits?.area) v *= 2.2;
      if (tanky && (d.role === 'swarm' || dps(d) > 120)) v *= 1.8;
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
    const x = range > 2 ? myFront.x + dir * 0.4 : lead.x - dir * (1.3 + this.r() * 0.6);
    void x;
    sim.play(si, pick.slot, null);
  }

  trySpell(enemies) {
    const sim = this.sim, si = this.si, s = sim.sides[si];
    const hand = this.hand();
    for (const h of hand) {
      if (!h.spell || !h.ready || h.cost > s.energy) continue;
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
      const worth = enemies.length >= 3 || near.length >= 2 || enemies.some((e) => e.boss);
      if (worth && this.r() < 0.35 + this.d * 0.6) {
        sim.useSignature(si);
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
