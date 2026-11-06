// LAB MODULES: gear you bolt onto your base. Four slots (one module per
// category), every module has 5 levels bought with coins, and each one does a
// real thing in battle (src/game/battle/labMods.js) and has its own 3D model on
// the base (src/models/props/labModules.js), in the Lab tab and in battle.
//
//   POWER CORE  feeds the POWER meter (regen, start / max POWER)
//   DEFENSE     a second weapon on the base (zaps, goo, laser, acid)
//   UTILITY     support (base repairs, deploy range, healing, free clones)
//   SIGNAL MAST the mast behind the base: ULTIMATE / MEGA / zapper boosts
//
// moduleMods(loadout) folds an equipped loadout ({ cat: { id, level } } or
// { id: level }) into { rs, fx }: rs = keys the sim already knows from research
// (added onto side.rs), fx = module-only effects (side.lm in the sim).
// AI rivals get a loadout for their trophies (modulesForTrophies) so the fight
// stays fair.
import { labPower } from './labs.js';

export const MOD_MAX = 5;

export const MOD_CATS = [
  { id: 'power', name: 'POWER CORE', short: 'POWER', color: '#ffd23f', ink: '#5a3c00', icon: 'energy', hint: 'Feeds your POWER meter' },
  { id: 'defense', name: 'DEFENSE', short: 'DEFENSE', color: '#ff5a5a', ink: '#5a0814', icon: 'shield', hint: 'A second weapon on your base' },
  { id: 'utility', name: 'UTILITY', short: 'UTILITY', color: '#5fe08a', ink: '#0a4a1e', icon: 'gear', hint: 'Repairs, healing, reach and clones' },
  { id: 'roof', name: 'SIGNAL MAST', short: 'MAST', color: '#7ae8ff', ink: '#0a3a4a', icon: 'flag', hint: 'Boosts your Commander, MEGA and zapper' },
];
export const MOD_CAT = Object.fromEntries(MOD_CATS.map((c) => [c.id, c]));

// Coins per level by grade: [build (level 1), level 2, 3, 4, 5]
export const GRADE_COINS = [
  [0, 150, 500, 1500, 4000],
  [300, 700, 1800, 4500, 10000],
  [1200, 2500, 6000, 12000, 25000],
  [3000, 6000, 14000, 28000, 50000],
];
/** Lab Level needed for each module level (1..5). */
export const LEVEL_GATE = [1, 2, 4, 7, 10];

const pct = (v) => `${Math.round(v * 100)}%`;
const sec = (v) => `${Math.round(v * 10) / 10}s`;

// unlock: null (starter) | { trophies } | { labLevel } | { research: nodeId, name } | { quest: npc, name }
// ai: trophies where AI rivals start bringing it
export const MODULES = {
  // ------------------------------------------------------------------ POWER CORE
  potatoBattery: {
    cat: 'power', name: 'Potato Battery', grade: 0, unlock: null, ai: 40,
    fx: { startPower: [10, 20, 20, 30, 30], maxPower: [0, 0, 10, 10, 20] },
    text: (v) => (v.maxPower ? `Start with +${v.startPower} POWER. Max POWER +${v.maxPower}.` : `Start with +${v.startPower} POWER.`),
    line: 'Forty potatoes, a lot of wire and one very sad lemon.',
  },
  hamsterDynamo: {
    cat: 'power', name: 'Hamster Dynamo', grade: 1, unlock: { research: 'hamster', name: 'Hamster Wheel' }, ai: 350,
    fx: { earlyRegen: [0.08, 0.1, 0.12, 0.14, 0.16], earlyT: [40, 40, 45, 45, 50] },
    text: (v) => `POWER fills ${pct(v.earlyRegen)} faster for the first ${v.earlyT}s.`,
    line: 'Gerald got a promotion. And a bigger wheel.',
  },
  solarPanels: {
    cat: 'power', name: 'Solar Panels', grade: 2, unlock: { trophies: 700 }, ai: 800,
    fx: { regen: [0.02, 0.025, 0.03, 0.035, 0.04] },
    text: (v) => `POWER fills ${pct(v.regen)} faster all battle.`,
    line: 'Works on cloudy days too. We checked once.',
  },
  reactor: {
    cat: 'power', name: 'Nuclear Reactor', grade: 3, unlock: { labLevel: 8 }, ai: 1700,
    fx: { regen: [0.015, 0.02, 0.025, 0.03, 0.035], meltdown: [380, 460, 540, 630, 720] },
    text: (v) => `POWER fills ${pct(v.regen)} faster. At 25% base HP it melts down once: ${v.meltdown} damage to every enemy near your base.`,
    line: 'The warning label is just a picture of Jimmy screaming.',
  },

  // ------------------------------------------------------------------ DEFENSE
  teslaCoil: {
    cat: 'defense', name: 'Tesla Coil', grade: 0, unlock: null, ai: 80,
    fx: { teslaDmg: [70, 78, 86, 96, 108], teslaJumps: [2, 2, 3, 3, 4], teslaCd: [2.4, 2.3, 2.2, 2.1, 2] },
    text: (v) => `Every ${sec(v.teslaCd)} a zap hits ${v.teslaJumps} enemies in a chain for ${v.teslaDmg} damage.`,
    line: 'Hair goes up, enemies go down.',
  },
  gooCannon: {
    cat: 'defense', name: 'Goo Cannon', grade: 1, unlock: { trophies: 400 }, ai: 450,
    fx: { gooSlow: [0.3, 0.32, 0.35, 0.38, 0.42], gooDps: [8, 10, 12, 14, 16], gooCd: [4.6, 4.4, 4.2, 4, 3.8] },
    text: (v) => `Every ${sec(v.gooCd)} it lobs goo at the biggest crowd: ${pct(v.gooSlow)} slower, ${v.gooDps} damage per second.`,
    line: 'Lime flavour. Do not eat the ammo.',
  },
  laserTurret: {
    cat: 'defense', name: 'Laser Turret', grade: 2, unlock: { labLevel: 4 }, ai: 900,
    fx: { laserDmg: [30, 34, 39, 45, 52], laserRamp: [0.12, 0.14, 0.16, 0.18, 0.2] },
    text: (v) => `Burns the closest enemy for ${v.laserDmg} damage twice a second, +${pct(v.laserRamp)} per hit on the same target.`,
    line: 'Pointed at enemies. Mostly. Wear the goggles.',
  },
  acidSprinkler: {
    cat: 'defense', name: 'Acid Sprinkler', grade: 2, unlock: { quest: 'nolan', name: "Nolan's quests" }, ai: 1200,
    fx: { acidDmg: [34, 38, 43, 49, 56], acidR: [4, 4.2, 4.4, 4.7, 5] },
    text: (v) => `Sprays every enemy within ${v.acidR} of your base for ${v.acidDmg} damage per second.`,
    line: 'It was a lawn sprinkler. Now it is a crime.',
  },

  // ------------------------------------------------------------------ UTILITY
  repairDrone: {
    cat: 'utility', name: 'Repair Drone', grade: 1, unlock: { trophies: 150 }, ai: 200,
    fx: { droneHeal: [0.01, 0.012, 0.014, 0.016, 0.019], droneCd: [8, 8, 7.5, 7, 6.5] },
    text: (v) => `Every ${sec(v.droneCd)} it patches ${(v.droneHeal * 100).toFixed(1)}% of your base HP back.`,
    line: 'Holds a wrench and a roll of tape. Bad at small talk.',
  },
  radarDish: {
    cat: 'utility', name: 'Radar Dish', grade: 1, unlock: { labLevel: 3 }, ai: 500,
    fx: { deploy: [0.6, 0.9, 1.2, 1.5, 1.8] },
    text: (v) => `Drop troops ${v.deploy} further forward.`,
    line: 'Picks up enemies, satellites and three cooking channels.',
  },
  snackDispenser: {
    cat: 'utility', name: 'Snack Dispenser', grade: 2, unlock: { quest: 'juan', name: "Juan's quests" }, ai: 1000,
    fx: { snackHeal: [0.02, 0.024, 0.028, 0.033, 0.04], snackR: [4.5, 4.6, 4.8, 5, 5.2] },
    text: (v) => `Troops within ${v.snackR} of your base heal ${(v.snackHeal * 100).toFixed(1)}% HP per second.`,
    line: 'Free snacks for anyone on your team. Juan restocks it.',
  },
  cloningVat: {
    cat: 'utility', name: 'Cloning Vat', grade: 3, unlock: { trophies: 2000 }, ai: 2100,
    fx: { cloneCd: [34, 31, 28, 25, 22] },
    text: (v) => `Every ${v.cloneCd}s it clones your cheapest troop card for free.`,
    line: 'Copy, paste, attack.',
  },

  // ------------------------------------------------------------------ ROOFTOP
  beastFlag: {
    cat: 'roof', name: 'Beast Flag', grade: 0, unlock: null, ai: 60,
    fx: { ultStart: [0.08, 0.11, 0.14, 0.17, 0.2] },
    text: (v) => `Your Commander's ULTIMATE starts ${pct(v.ultStart)} charged.`,
    line: 'It flaps in slow motion when you look at it.',
  },
  satUplink: {
    cat: 'roof', name: 'Satellite Uplink', grade: 1, unlock: { trophies: 900 }, ai: 950,
    fx: { ultCharge: [0.06, 0.08, 0.1, 0.12, 0.15] },
    text: (v) => `ULTIMATE charges ${pct(v.ultCharge)} faster.`,
    line: 'Streams the battle live to 40 million people. And Karl.',
  },
  searchlight: {
    cat: 'roof', name: 'Searchlight', grade: 1, unlock: { labLevel: 5 }, ai: 650,
    fx: { zapRange: [0.08, 0.1, 0.12, 0.15, 0.18], zapDmg: [0.1, 0.14, 0.18, 0.23, 0.28] },
    text: (v) => `Base zapper range +${pct(v.zapRange)}, zapper damage +${pct(v.zapDmg)}.`,
    line: 'Lights up anything sneaking toward the base.',
  },
  boltSpire: {
    cat: 'roof', name: 'Bolt Spire', grade: 2, unlock: { research: 'megaMagnet', name: 'Mega Magnet' }, ai: 1400,
    fx: { megaCharge: [0.08, 0.11, 0.14, 0.17, 0.2] },
    text: (v) => `Your MEGA charges ${pct(v.megaCharge)} faster.`,
    line: 'A lightning rod shaped like a lightning bolt. Very on brand.',
  },
};
for (const [id, m] of Object.entries(MODULES)) m.id = id;
export const MODULE_LIST = Object.values(MODULES);
export const modulesIn = (cat) => MODULE_LIST.filter((m) => m.cat === cat);
/** The modules you own from the start (equipped on a fresh save). */
export const STARTER_MODULES = { power: 'potatoBattery', defense: 'teslaCoil', roof: 'beastFlag' };

/** Effect values of a module at a level (1..5). */
export function moduleFx(m, level) {
  const out = {};
  if (!m || !(level > 0)) return out;
  for (const [k, arr] of Object.entries(m.fx)) out[k] = arr[Math.min(arr.length, Math.max(1, Math.floor(level))) - 1];
  return out;
}
export const moduleText = (m, level) => m.text(moduleFx(m, Math.max(1, level)));
/** Coins for a level (1 = build). */
export const moduleCost = (m, level) => GRADE_COINS[m.grade]?.[Math.max(1, Math.min(MOD_MAX, level)) - 1] ?? 0;

/** Unlock text for a locked module. */
export function unlockText(m) {
  const u = m.unlock;
  if (!u) return 'Starter module';
  if (u.trophies) return `Reach ${u.trophies.toLocaleString('en-US')} trophies`;
  if (u.labLevel) return `Reach Lab Level ${u.labLevel}`;
  if (u.research) return `Research ${u.name}`;
  if (u.quest) return `Finish ${u.name}`;
  return 'Locked';
}
/**
 * Is a module unlocked for a profile snapshot { bestTrophies, labLevel, research: {id: lv}, quests: {npc: {done}} }?
 */
export function unlockMet(m, P) {
  const u = m.unlock;
  if (!u) return true;
  if (u.trophies) return (P.bestTrophies ?? 0) >= u.trophies;
  if (u.labLevel) return (P.labLevel ?? 1) >= u.labLevel;
  if (u.research) return (P.research?.[u.research] ?? 0) >= 1;
  if (u.quest) return !!P.quests?.[u.quest]?.done;
  return false;
}

// --------------------------------------------------------------------------- battle

const ZERO_FX = {
  earlyRegen: 0, earlyT: 0, meltdown: 0,
  teslaDmg: 0, teslaJumps: 0, teslaCd: 0, gooSlow: 0, gooDps: 0, gooCd: 0, laserDmg: 0, laserRamp: 0, acidDmg: 0, acidR: 0,
  droneHeal: 0, droneCd: 0, deploy: 0, snackHeal: 0, snackR: 0, cloneCd: 0,
};
// keys the battle sim already reads from side.rs (research)
const RS_KEYS = new Set(['regen', 'startPower', 'maxPower', 'ultStart', 'ultCharge', 'zapRange', 'zapDmg', 'megaCharge']);

/** Normalise a loadout: { cat: { id, level } } | { id: level } | [{ id, level }] -> [{ id, level }]. */
export function loadoutList(lo) {
  if (!lo) return [];
  const out = [];
  const seen = new Set();
  const add = (id, level) => {
    const m = MODULES[id];
    if (!m || seen.has(m.cat)) return;
    seen.add(m.cat);
    out.push({ id, level: Math.max(1, Math.min(MOD_MAX, Math.floor(Number(level) || 1))) });
  };
  if (Array.isArray(lo)) for (const e of lo) add(e?.id, e?.level);
  else for (const [k, v] of Object.entries(lo)) {
    if (v && typeof v === 'object') add(v.id, v.level);
    else if (MODULES[k]) add(k, v);
  }
  return out;
}

/** Battle modifiers of an equipped loadout: { rs: {research keys}, fx: {module keys}, ids: {cat: id}, list }. */
export function moduleMods(lo, labLevel = 1) {
  const rs = {}, fx = { ...ZERO_FX };
  const list = loadoutList(lo);
  const ids = {};
  for (const { id, level } of list) {
    const m = MODULES[id];
    ids[m.cat] = id;
    for (const [k, v] of Object.entries(moduleFx(m, level))) {
      if (RS_KEYS.has(k)) rs[k] = (rs[k] ?? 0) + v;
      else fx[k] = (fx[k] ?? 0) + v;
    }
  }
  // weapon damage grows with the Lab Level like the base zapper
  const pw = labPower(labLevel);
  for (const k of ['teslaDmg', 'gooDps', 'laserDmg', 'acidDmg', 'meltdown']) fx[k] *= pw;
  return { rs, fx, ids, list };
}

/**
 * The loadout an AI rival brings at a trophy count: per category the best module
 * a player there would have, at a level its Lab Level allows. Seeded (rng).
 */
export function modulesForTrophies(trophies = 0, labLevel = 1, rng = Math.random) {
  const out = {};
  const maxLv = LEVEL_GATE.filter((g) => labLevel >= g).length;
  for (const c of MOD_CATS) {
    const open = modulesIn(c.id).filter((m) => trophies >= m.ai);
    if (!open.length) continue;
    // mostly the newest unlock, sometimes an older favourite
    open.sort((a, b) => b.ai - a.ai);
    const m = rng() < 0.7 ? open[0] : open[Math.floor(rng() * open.length)];
    const lv = Math.max(1, Math.min(maxLv, 1 + Math.floor(Math.max(0, trophies - m.ai) / 600) + (rng() < 0.3 ? 1 : 0)));
    out[c.id] = { id: m.id, level: lv };
  }
  return out;
}
