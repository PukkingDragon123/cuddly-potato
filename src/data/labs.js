// Labs: your base.
//
// LAB LEVEL (meta progression, like Clash Royale's King Level): earned with
// Lab XP from upgrading cards and winning battles. Raises the HP/damage of
// your base and its cannon.
//
// BASE UPGRADES (in battle, like The Battle Cats' wallet): spend POWER to turn
// your tent into a Mega HQ: faster POWER, bigger tank, more HP, stronger cannon.

export const LAB_XP = [0, 20, 60, 130, 260, 480, 850, 1400, 2300, 3700, 5800, 8800, 13000, 19000];
export const LAB_MAX_LEVEL = LAB_XP.length;
/** Level for a total XP amount. */
export function labLevelFor(xp) {
  let lv = 1;
  for (let i = 1; i < LAB_XP.length; i++) if (xp >= LAB_XP[i]) lv = i + 1;
  return lv;
}
export const labPower = (level) => 1 + (level - 1) * 0.07;
export const LAB_LEVEL_REWARDS = (level) => ({ coins: 100 * level, bucks: level % 3 === 0 ? 20 : 5 });

// Your BASE (the only building on each side) at Lab Level 1. It fires a
// cannon at enemies in range; upgrades make it stronger.
export const TOWERS = {
  lab: { hp: 3600, dmg: 70, atk: 1.0, range: 6.4 },
};

// Electric POWER (the card currency): +1 every 2.8s; x2 in the last minute,
// x3 in overtime. The max grows with your base tier.
export const ENERGY = { max: 10, start: 4, perSec: 1 / 2.8 };
export const POWER = ENERGY;

// In-battle BASE UPGRADES: every battle starts in a tent. `cost` is the POWER
// needed to upgrade FROM that tier to the next one.
export const BASE_UPGRADES = [
  { tier: 1, name: 'Camp Tent', regen: 1.0, max: 10, hp: 1.0, dmg: 0.55, range: 5.4, cost: 4 },
  { tier: 2, name: 'Lab Shack', regen: 1.12, max: 11, hp: 1.12, dmg: 0.75, range: 5.8, cost: 5 },
  { tier: 3, name: 'Trailer Lab', regen: 1.25, max: 12, hp: 1.26, dmg: 0.95, range: 6.1, cost: 6 },
  { tier: 4, name: 'Field Lab', regen: 1.38, max: 13, hp: 1.42, dmg: 1.15, range: 6.4, cost: 7 },
  { tier: 5, name: 'Beast Lab', regen: 1.52, max: 14, hp: 1.6, dmg: 1.35, range: 6.8, cost: 8 },
  { tier: 6, name: 'Mega HQ', regen: 1.7, max: 15, hp: 1.8, dmg: 1.6, range: 7.2, cost: null },
];
// legacy shape used by older callers: { regen, cost } per tier
export const OVERCLOCK = BASE_UPGRADES;

// MEGA ultimate: charged only by fighting (damage dealt + knockouts), needs a
// Trailer Lab (tier 3) or better, once per battle.
export const MEGA = { chargeDmg: 7000, baseDmgMult: 1.5, killBonus: 0.02, minTier: 3, cinematic: 5.6, life: 24 };

// Lab building styles for battles (visual only).
export const LAB_STYLES = {
  default: { name: 'Beast Lab' },
  mansion: { name: "Jimmy's Mansion Lab" },
  martLab: { name: 'Beast Mart Lab' },
  mart: { name: 'Checkout Fortress' },
  chocoLab: { name: 'Chocolate Lab' },
  goldVault: { name: 'Gold Vault' },
  rival: { name: 'Rival Lab' },
};

// Legacy export kept for old code paths (energy-per-second Battle Cats model).
export const LAB_LEVELS = BASE_UPGRADES.map((o) => ({ max: o.max, regen: o.regen, upCost: o.cost }));
