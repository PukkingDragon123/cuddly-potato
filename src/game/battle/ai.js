// Opponent AI: periodically evaluates the lane and spends energy on troops,
// Lab upgrades, spells and Commander abilities. difficulty 0..1.
import { SWARMS } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { LAB_LEVELS } from '../../data/labs.js';

export class BattleAI {
  constructor(sim, si, opts = {}) {
    this.sim = sim;
    this.si = si;
    this.d = opts.difficulty ?? 0.5;
    this.thinkT = 2.5 - this.d;
    this.want = null;
    this.maxLab = opts.maxLab ?? 8;
    this.noSpells = !!opts.noSpells;
    this.sigDelay = opts.sigDelay ?? 0;
  }

  r() {
    return this.sim.rand();
  }

  update(dt) {
    const sim = this.sim;
    if (sim.over || sim.paused) return;
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    const d = this.d;
    this.thinkT = (1.5 - d * 1.1) * (0.7 + this.r() * 0.6);
    const si = this.si;
    const s = sim.sides[si];
    const enemies = sim.enemiesOf(si);
    const allies = sim.alliesOf(si);
    const fx = sim.frontEnemyX(si);
    const threatDist = fx === null ? 99 : Math.abs(fx - s.labX);
    const threatened = threatDist < 10;
    const info = LAB_LEVELS[s.labLevel - 1];

    // Commander signature
    if (s.cmd && s.sig >= 1 && sim.t > this.sigDelay) {
      const worth = enemies.length >= 3 || threatDist < 8 || enemies.some((e) => e.boss);
      if (worth && this.r() < 0.35 + d * 0.6) {
        sim.useSignature(si);
        return;
      }
    }
    // Skills
    for (let k = 0; k < s.skills.length; k++) {
      if (s.skillCds[k] > 0) continue;
      const sk = s.skills[k];
      let use = false;
      if (['labRally', 'juanDance', 'lastToLeave'].includes(sk.id)) use = allies.length >= 3 && enemies.length >= 2;
      else if (sk.id === 'emergencyRepair') use = s.labHp < s.labMaxHp * 0.6;
      else if (['footballKick', 'subscribeSmash', 'complain'].includes(sk.id)) use = enemies.length >= 3 || threatDist < 8;
      else if (sk.id === 'luckyFail') use = this.r() < 0.5;
      if (use && this.r() < 0.3 + d * 0.6) {
        sim.useSkill(si, k);
        return;
      }
    }
    // Spells
    if (!this.noSpells) {
      for (let k = 0; k < s.spells.length; k++) {
        if (!sim.canCast(si, k)) continue;
        const sp = SPELLS[s.spells[k].id];
        if (sp.id === 'foodThrow') {
          let best = null, bc = 0;
          for (const a of allies) {
            let c = 0;
            for (const b of allies) if (Math.abs(a.x - b.x) < sp.radius && b.hp < b.maxHp * 0.7) c++;
            if (c > bc) { bc = c; best = a.x; }
          }
          if (bc >= 2 && this.r() < 0.4 + d * 0.5) { sim.castSpell(si, k, best); return; }
        } else if (sp.id === 'labShield') {
          if (s.labHp < s.labMaxHp * 0.55 && threatened) { sim.castSpell(si, k, s.labX); return; }
        } else {
          const c = sim.densestEnemyX(si, sp.radius * 0.8);
          if (c && (c.count >= 4 - Math.round(d * 1.5) || (Math.abs(c.x - s.labX) < 7 && c.count >= 2)) && this.r() < 0.35 + d * 0.55) {
            sim.castSpell(si, k, c.x);
            return;
          }
        }
      }
    }
    // Lab upgrade
    if (info.upCost !== null && s.labLevel < this.maxLab && !threatened) {
      const targetLevel = Math.min(8, 1 + Math.floor(sim.t / (26 - d * 12)) + (d > 0.6 ? 1 : 0));
      if ((s.labLevel < targetLevel || s.energy >= info.max * 0.95) && s.energy >= info.upCost) {
        if (this.r() < 0.5 + d * 0.5) {
          sim.upgradeLab(si);
          return;
        }
      }
    }
    // Deploy
    const ready = [];
    for (let k = 0; k < s.deck.length; k++) if (s.deck[k] && s.cds[k] <= 0) ready.push(k);
    if (!ready.length) return;
    const affordable = ready.filter((k) => sim.cardCost(si, k) <= s.energy);
    if (threatened) {
      // panic: cheapest / tankiest that we can afford right now
      if (affordable.length) {
        affordable.sort((a, b) => this.score(b, true) - this.score(a, true));
        sim.deploy(si, affordable[0]);
      }
      return;
    }
    if (this.want === null || s.deck[this.want] === undefined || s.cds[this.want] > 0) {
      // choose a card to aim for (weighted by preference)
      const opts = ready.map((k) => ({ k, w: this.score(k, false) }));
      let tot = opts.reduce((a, o) => a + o.w, 0);
      let rr = this.r() * tot;
      this.want = opts[0].k;
      for (const o of opts) { rr -= o.w; if (rr <= 0) { this.want = o.k; break; } }
    }
    const cost = sim.cardCost(si, this.want);
    if (s.energy >= cost) {
      sim.deploy(si, this.want);
      this.want = null;
    } else if (s.energy >= info.max * 0.98 && affordable.length) {
      sim.deploy(si, affordable[Math.floor(this.r() * affordable.length)]);
    }
  }

  score(k, panic) {
    const s = this.sim.sides[this.si];
    const def = SWARMS[s.deck[k].id];
    if (panic) return (def.role === 'tank' ? 2 : 1) + 300 / (def.cost + 50);
    // prefer a mix: count of existing allies of that role
    const allies = this.sim.alliesOf(this.si);
    const same = allies.filter((a) => a.type === def.id).length;
    let w = 1 / (1 + same * 0.6);
    if (def.role === 'tank' && !allies.some((a) => SWARMS[a.type]?.role === 'tank')) w *= 2;
    if (def.role === 'ranged' && allies.some((a) => SWARMS[a.type]?.role === 'tank')) w *= 1.6;
    if (def.cost > 600) w *= 0.6 + this.d * 0.8;
    return w;
  }
}
