// Swarm (troop) definitions. Stats are level-1 base values.
// Units: hp/dmg raw, atk = seconds between attacks, range/speed in world units.

export const RARITIES = {
  common: { id: 'common', name: 'Common', color: '#9aa6c8', hex: 0x9aa6c8, weight: 64, order: 0 },
  rare: { id: 'rare', name: 'Rare', color: '#29b6f6', hex: 0x29b6f6, weight: 26, order: 1 },
  epic: { id: 'epic', name: 'Ultra Rare', color: '#b05cff', hex: 0xb05cff, weight: 8, order: 2 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ffb21a', hex: 0xffb21a, weight: 1.8, order: 3 },
  mythic: { id: 'mythic', name: 'Limited', color: '#ff2e88', hex: 0xff2e88, weight: 0.2, order: 4 },
};

export const VARIANTS = {
  base: { id: 'base', name: 'Normal', bonus: 0, chance: 1 },
  silver: { id: 'silver', name: 'Silver', bonus: 0.04, chance: 0.04, color: '#c8ccd8' },
  gold: { id: 'gold', name: 'Gold', bonus: 0.08, chance: 0.015, color: '#ffd23f' },
  chrome: { id: 'chrome', name: 'Chrome', bonus: 0.12, chance: 0.005, color: '#9ff2ff' },
};

export const SERIES = {
  originals: { id: 'originals', name: 'Beast Originals', color: '#29b6f6', desc: 'The OG Lab creations.' },
  homeHorrors: { id: 'homeHorrors', name: 'Home Horrors', color: '#ff8a2a', desc: 'Household objects gone feral.' },
  technoTerrors: { id: 'technoTerrors', name: 'Techno Terrors', color: '#5ce1e6', desc: 'Glitchy gadgets with teeth.' },
  atomic: { id: 'atomic', name: 'Atomic Series', color: '#7cff3a', desc: 'Glow-in-the-dark mutants.' },
  hybrids: { id: 'hybrids', name: 'Lab Hybrids', color: '#ff5a1f', desc: 'Fire, ice and stone fusions.' },
  food: { id: 'food', name: 'Food Fighters', color: '#ff4fa3', desc: 'Season 1: FOOD SEASON exclusives.' },
};

// role: melee | ranged | tank | swarm | support | kamikaze | flying
// traits: area, pierce, armor, stun, slow, burn, freeze, chain, split, aura, heal, knock, flying
export const SWARMS = {
  // ----- Beast Originals
  panther: {
    name: 'Panther', series: 'originals', rarity: 'common', role: 'melee',
    cost: 50, cd: 2.2, hp: 120, dmg: 18, atk: 0.85, range: 0.7, speed: 1.9, kb: 3, size: 1,
    desc: 'The Lab mascot. Cheap, quick and fearless. Spam it!',
    mega: 'feastablesPanther',
  },
  steelPanther: {
    name: 'Steel Panther', series: 'originals', rarity: 'epic', role: 'tank',
    cost: 330, cd: 9, hp: 980, dmg: 52, atk: 1.2, range: 0.8, speed: 1.3, kb: 2, size: 1.25,
    traits: { armor: 0.3 }, desc: 'Armoured panther. Shrugs off 30% of damage.',
  },
  beastTiger: {
    name: 'Beast Tiger', series: 'originals', rarity: 'legendary', role: 'melee',
    cost: 900, cd: 24, hp: 2700, dmg: 150, atk: 1.6, range: 1.3, speed: 1.15, kb: 3, size: 1.9,
    traits: { area: true, stun: { chance: 0.35, dur: 1.2 } }, desc: 'The legend from the tank. Its roar stuns crowds.',
  },
  hyperFusionPanther: {
    name: 'Hyper Fusion Panther', series: 'originals', rarity: 'mythic', role: 'melee',
    cost: 1150, cd: 30, hp: 3200, dmg: 210, atk: 1.3, range: 1.5, speed: 1.4, kb: 4, size: 1.8,
    traits: { area: true, burn: { dps: 30, dur: 3 }, freeze: { chance: 0.25, dur: 1.2 } },
    desc: 'Only 1,000 exist! Fire + ice fusion with a chrome core.',
  },

  // ----- Home Horrors
  cloggedToilet: {
    name: 'Clogged Toilet', series: 'homeHorrors', rarity: 'common', role: 'ranged',
    cost: 90, cd: 3, hp: 95, dmg: 24, atk: 1.5, range: 3.6, speed: 1.2, kb: 2, size: 1,
    projectile: 'sludge', desc: 'Fires sludge balls from a safe distance. Gross but effective.',
  },
  trashedCan: {
    name: 'Trashed Can', series: 'homeHorrors', rarity: 'common', role: 'tank',
    cost: 150, cd: 5, hp: 460, dmg: 12, atk: 1.2, range: 0.7, speed: 0.95, kb: 2, size: 1.1,
    desc: 'A garbage can with a grudge. Soaks damage for your squad.',
  },
  toiletRollRipper: {
    name: 'Toilet Roll Ripper', series: 'homeHorrors', rarity: 'common', role: 'swarm',
    cost: 75, cd: 2.5, hp: 55, dmg: 12, atk: 0.6, range: 0.6, speed: 2.5, kb: 1, size: 0.8, count: 2,
    desc: 'Comes in a 2-pack. Shreds anything in front of it.',
  },
  mutantMailbox: {
    name: 'Mutant Mailbox', series: 'homeHorrors', rarity: 'rare', role: 'ranged',
    cost: 190, cd: 6, hp: 210, dmg: 40, atk: 2.0, range: 4.2, speed: 1.0, kb: 2, size: 1.1,
    traits: { area: true }, projectile: 'letters', desc: 'Delivers explosive junk mail. Area damage.',
  },
  ragingStopSign: {
    name: 'Raging Stop Sign', series: 'homeHorrors', rarity: 'rare', role: 'melee',
    cost: 200, cd: 6, hp: 320, dmg: 32, atk: 1.1, range: 0.9, speed: 1.4, kb: 3, size: 1.2,
    traits: { stun: { chance: 0.3, dur: 1.0 } }, desc: 'STOP! Hits have a chance to freeze enemies in place.',
  },
  badEggsperiment: {
    name: 'Bad Eggsperiment', series: 'homeHorrors', rarity: 'rare', role: 'kamikaze',
    cost: 160, cd: 7, hp: 150, dmg: 280, atk: 0.1, range: 0.6, speed: 2.1, kb: 1, size: 0.95,
    traits: { area: true, kamikaze: true }, desc: 'Runs in and EXPLODES. A cracking good time.',
  },
  barfBin: {
    name: 'Barf Bin', series: 'homeHorrors', rarity: 'rare', role: 'melee',
    cost: 240, cd: 7, hp: 440, dmg: 30, atk: 1.3, range: 1.4, speed: 1.0, kb: 2, size: 1.15,
    traits: { area: true, slow: { amt: 0.45, dur: 2 } }, desc: 'Barfs a sticky cone that slows enemies.',
  },
  atomicToilet: {
    name: 'Atomic Toilet', series: 'homeHorrors', rarity: 'epic', role: 'ranged',
    cost: 430, cd: 11, hp: 540, dmg: 92, atk: 2.2, range: 3.0, speed: 0.9, kb: 2, size: 1.35,
    traits: { area: true }, projectile: 'nuke', desc: 'Flushes radioactive blasts. Huge area splash.',
  },
  shockSign: {
    name: 'Shock Sign', series: 'homeHorrors', rarity: 'epic', role: 'ranged',
    cost: 390, cd: 10, hp: 360, dmg: 64, atk: 1.7, range: 3.2, speed: 1.1, kb: 2, size: 1.2,
    traits: { chain: 3 }, projectile: 'zap', desc: 'High voltage! Lightning chains between 3 enemies.',
  },

  // ----- Techno Terrors
  glitchBot: {
    name: 'Glitch Bot', series: 'technoTerrors', rarity: 'common', role: 'ranged',
    cost: 110, cd: 3.5, hp: 120, dmg: 26, atk: 1.3, range: 4.0, speed: 1.15, kb: 2, size: 1,
    projectile: 'laser', desc: 'Pew pew. Lasers that glitch through the air.',
  },
  droneFang: {
    name: 'Drone Fang', series: 'technoTerrors', rarity: 'rare', role: 'flying',
    cost: 210, cd: 6, hp: 180, dmg: 34, atk: 0.9, range: 1.0, speed: 2.0, kb: 2, size: 1,
    traits: { flying: true }, desc: 'Flies over the brawl. Melee troops deal half damage to it.',
  },
  circuitShark: {
    name: 'Circuit Shark', series: 'technoTerrors', rarity: 'rare', role: 'melee',
    cost: 230, cd: 6, hp: 360, dmg: 58, atk: 1.0, range: 0.9, speed: 1.8, kb: 3, size: 1.2,
    desc: 'Bites with 10,000 volts. Fast and ferocious.',
  },
  megaTechMech: {
    name: 'Mega-Tech Mech', series: 'technoTerrors', rarity: 'legendary', role: 'ranged',
    cost: 1000, cd: 26, hp: 2200, dmg: 140, atk: 2.4, range: 5.2, speed: 0.8, kb: 2, size: 1.9,
    traits: { area: true }, projectile: 'missile', desc: 'A walking tank firing missile volleys.',
  },

  // ----- Atomic Series
  atomicSlime: {
    name: 'Atomic Slime', series: 'atomic', rarity: 'common', role: 'melee',
    cost: 85, cd: 3, hp: 140, dmg: 15, atk: 1.0, range: 0.7, speed: 1.3, kb: 2, size: 0.95,
    traits: { split: 2 }, desc: 'Splits into two mini slimes when defeated.',
  },
  plutoniumPup: {
    name: 'Plutonium Pup', series: 'atomic', rarity: 'rare', role: 'support',
    cost: 220, cd: 7, hp: 300, dmg: 22, atk: 1.0, range: 0.8, speed: 1.4, kb: 2, size: 1.05,
    traits: { aura: { dps: 18, r: 1.8 } }, desc: 'Radioactive aura burns all nearby enemies.',
  },
  reactorRex: {
    name: 'Reactor Rex', series: 'atomic', rarity: 'epic', role: 'tank',
    cost: 520, cd: 14, hp: 1500, dmg: 80, atk: 1.6, range: 1.1, speed: 1.0, kb: 3, size: 1.6,
    traits: { area: true }, desc: 'A glowing dino with a reactor heart. Tail-swipes everything.',
  },

  // ----- Lab Hybrids
  blazeHybrid: {
    name: 'Blaze Hybrid', series: 'hybrids', rarity: 'rare', role: 'ranged',
    cost: 230, cd: 6, hp: 220, dmg: 30, atk: 1.4, range: 3.2, speed: 1.2, kb: 2, size: 1.05,
    traits: { burn: { dps: 16, dur: 3 } }, projectile: 'fire', desc: 'Fireballs that set enemies ablaze.',
  },
  frostHybrid: {
    name: 'Frost Hybrid', series: 'hybrids', rarity: 'rare', role: 'melee',
    cost: 220, cd: 6, hp: 380, dmg: 28, atk: 1.2, range: 0.9, speed: 1.3, kb: 2, size: 1.1,
    traits: { freeze: { chance: 0.3, dur: 1.5 } }, desc: 'Icy claws that freeze enemies solid.',
  },
  stoneHybrid: {
    name: 'Stone Hybrid', series: 'hybrids', rarity: 'epic', role: 'tank',
    cost: 450, cd: 12, hp: 1700, dmg: 40, atk: 1.5, range: 0.9, speed: 0.75, kb: 1, size: 1.5,
    traits: { armor: 0.35 }, desc: 'A walking boulder. Nearly impossible to push back.',
  },

  // ----- Food Fighters (Season 1)
  fryFiend: {
    name: 'Fry Fiend', series: 'food', rarity: 'common', role: 'ranged',
    cost: 100, cd: 3, hp: 100, dmg: 20, atk: 0.9, range: 3.3, speed: 1.3, kb: 2, size: 1,
    projectile: 'fries', season: 1, desc: 'Launches crispy fries at rapid speed.',
  },
  pizzaSlicer: {
    name: 'Pizza Slicer', series: 'food', rarity: 'common', role: 'melee',
    cost: 80, cd: 2.8, hp: 150, dmg: 20, atk: 0.8, range: 0.7, speed: 1.7, kb: 2, size: 0.95,
    season: 1, desc: 'A spinning slice of chaos. Extra cheese, extra damage.',
  },
  donutDasher: {
    name: 'Donut Dasher', series: 'food', rarity: 'rare', role: 'melee',
    cost: 180, cd: 5, hp: 260, dmg: 36, atk: 1.0, range: 0.8, speed: 2.6, kb: 2, size: 1,
    traits: { knock: true }, season: 1, desc: 'Rolls in at top speed and knocks enemies back.',
  },
  burgerBrute: {
    name: 'Burger Brute', series: 'food', rarity: 'rare', role: 'tank',
    cost: 270, cd: 8, hp: 950, dmg: 28, atk: 1.4, range: 0.8, speed: 0.9, kb: 2, size: 1.3,
    traits: { heal: 0.25 }, season: 1, desc: 'A towering burger. Heals nearby allies when it falls.',
  },
  sodaSurge: {
    name: 'Soda Surge', series: 'food', rarity: 'rare', role: 'ranged',
    cost: 210, cd: 6, hp: 200, dmg: 18, atk: 0.5, range: 3.0, speed: 1.2, kb: 2, size: 1,
    traits: { pierce: true }, projectile: 'soda', season: 1, desc: 'Sprays a fizzy stream that pierces enemies.',
  },
  chocoChomper: {
    name: 'Choco Chomper', series: 'food', rarity: 'epic', role: 'melee',
    cost: 420, cd: 11, hp: 900, dmg: 85, atk: 1.3, range: 1.2, speed: 1.2, kb: 3, size: 1.35,
    traits: { area: true, slow: { amt: 0.35, dur: 2 } }, season: 1, desc: 'A chocolate bar beast. Sticky chocolate slows foes.',
  },
  melonMauler: {
    name: 'Melon Mauler', series: 'food', rarity: 'epic', role: 'tank',
    cost: 480, cd: 13, hp: 1400, dmg: 60, atk: 1.5, range: 1.0, speed: 0.9, kb: 2, size: 1.5,
    traits: { split: 3, area: true }, season: 1, desc: 'Bursts into 3 seedlings when it pops.',
  },

  // ----- Mega Forms (not collectable directly; unlocked via Mega Serum)
  feastablesPanther: {
    name: 'Feastables Panther', series: 'food', rarity: 'legendary', role: 'melee', isMega: true, base: 'panther',
    cost: 560, cd: 14, hp: 2100, dmg: 120, atk: 1.15, range: 1.5, speed: 1.6, kb: 4, size: 2.1,
    traits: { area: true, slow: { amt: 0.4, dur: 2 } }, season: 1,
    desc: 'MEGA FORM! A gigantic Panther made of chocolate and wrappers. Chocolate shockwaves slow enemies.',
  },

  // ----- Mini units spawned by splits (not collectable)
  miniSlime: {
    name: 'Mini Slime', series: 'atomic', rarity: 'common', role: 'melee', hidden: true,
    cost: 0, cd: 0, hp: 45, dmg: 8, atk: 0.8, range: 0.6, speed: 1.6, kb: 1, size: 0.55,
  },
  seedling: {
    name: 'Seedling', series: 'food', rarity: 'common', role: 'melee', hidden: true,
    cost: 0, cd: 0, hp: 120, dmg: 16, atk: 0.9, range: 0.6, speed: 1.6, kb: 1, size: 0.6,
  },
};

for (const [id, s] of Object.entries(SWARMS)) {
  s.id = id;
  s.traits = s.traits || {};
}

export const COLLECTABLE = Object.values(SWARMS).filter((s) => !s.hidden && !s.isMega);
export const MEGA_FORMS = Object.values(SWARMS).filter((s) => s.isMega);

// Level scaling: +10% hp/dmg per level.
export const MAX_LEVEL = 10;
export const statMult = (level) => 1 + (level - 1) * 0.1;

// Copies & coins needed to go from level L to L+1 (index = L-1).
export const UPGRADE = {
  common: { copies: [2, 4, 8, 14, 22, 34, 50, 75, 100], coins: [20, 60, 150, 350, 700, 1300, 2400, 4200, 7000] },
  rare: { copies: [2, 3, 5, 8, 12, 18, 26, 36, 50], coins: [60, 150, 350, 700, 1300, 2400, 4200, 7000, 11000] },
  epic: { copies: [1, 2, 3, 5, 7, 10, 14, 18, 24], coins: [200, 500, 1000, 2000, 3500, 6000, 9000, 13000, 18000] },
  legendary: { copies: [1, 1, 2, 3, 4, 5, 7, 9, 12], coins: [800, 1600, 3000, 5000, 8000, 12000, 17000, 23000, 30000] },
  mythic: { copies: [1, 1, 1, 2, 2, 3, 3, 4, 5], coins: [1500, 3000, 5000, 8000, 12000, 17000, 23000, 30000, 40000] },
};

// Global damage scale (keeps fights snappy relative to HP values).
export const DMG_SCALE = 1.5;

export function swarmStats(id, level = 1, variant = 'base', mods = {}) {
  const s = SWARMS[id];
  const m = statMult(level) * (1 + (VARIANTS[variant]?.bonus ?? 0));
  return {
    ...s,
    level,
    variant,
    hp: Math.round(s.hp * m * (mods.hp ?? 1)),
    dmg: Math.round(s.dmg * m * DMG_SCALE * (mods.dmg ?? 1)),
  };
}

export const ROLE_INFO = {
  melee: { name: 'Melee', icon: 'sword' },
  ranged: { name: 'Ranged', icon: 'range' },
  tank: { name: 'Tank', icon: 'shield' },
  swarm: { name: 'Swarm', icon: 'swarm' },
  support: { name: 'Support', icon: 'heart' },
  kamikaze: { name: 'Kamikaze', icon: 'energy' },
  flying: { name: 'Flying', icon: 'speed' },
};

export function traitText(s) {
  const t = s.traits || {};
  const out = [];
  if (t.area) out.push('Area damage');
  if (t.armor) out.push(`Armor ${Math.round(t.armor * 100)}%`);
  if (t.stun) out.push(`${Math.round(t.stun.chance * 100)}% Stun`);
  if (t.freeze) out.push(`${Math.round(t.freeze.chance * 100)}% Freeze`);
  if (t.slow) out.push('Slows');
  if (t.burn) out.push('Burns');
  if (t.chain) out.push(`Chains x${t.chain}`);
  if (t.split) out.push(`Splits x${t.split}`);
  if (t.aura) out.push('Damage aura');
  if (t.heal) out.push('Heals on death');
  if (t.knock) out.push('Knockback');
  if (t.pierce) out.push('Pierces');
  if (t.flying) out.push('Flying');
  if (t.kamikaze) out.push('Explodes');
  if (s.count > 1) out.push(`x${s.count} per deploy`);
  return out;
}
