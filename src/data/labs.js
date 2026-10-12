// Labs: your king tower.
//
// LAB LEVEL (meta progression, like Clash Royale's King Level): earned with
// Lab XP from upgrading cards and winning battles. Raises the HP/damage of
// your Lab and guard turret.
//
// OVERCLOCK (in battle, like The Battle Cats' wallet): spend energy to make
// your Lab produce energy faster for the rest of the match.

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

// Tower stats at Lab Level 1.
export const TOWERS = {
  lab: { hp: 3700, dmg: 80, atk: 1.0, range: 6.6 },
  turret: { hp: 1550, dmg: 50, atk: 0.8, range: 6.4 },
};

// Energy (elixir): 0-10, +1 every 2.8s; x2 in the last minute, x3 in overtime.
export const ENERGY = { max: 10, start: 5, perSec: 1 / 2.8 };

// In-battle Lab overclock levels (multiplier on energy regen) and their cost.
export const OVERCLOCK = [
  { regen: 1.0, cost: 3 },
  { regen: 1.18, cost: 4 },
  { regen: 1.34, cost: 5 },
  { regen: 1.5, cost: null },
];

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
export const LAB_LEVELS = OVERCLOCK.map((o) => ({ max: 10, regen: o.regen, upCost: o.cost }));
