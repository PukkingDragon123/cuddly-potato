// Swarm (troop) cards. Stats are level-1 values on a Clash Royale-like scale.
// Units: hp/dmg raw, atk = seconds between attacks, range/speed in world
// units (speed = units per second), elixir = energy cost (1-10).
// Teams use the real MrBeast Lab Swarms team names where one exists.

export const RARITIES = {
  common: { id: 'common', name: 'Common', color: '#b8c6e8', hex: 0xb8c6e8, weight: 64, order: 0 },
  rare: { id: 'rare', name: 'Rare', color: '#ff9a2e', hex: 0xff9a2e, weight: 26, order: 1 },
  epic: { id: 'epic', name: 'Ultra Rare', color: '#c063ff', hex: 0xc063ff, weight: 8, order: 2 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#3ff2c8', hex: 0x3ff2c8, weight: 1.8, order: 3 },
  mythic: { id: 'mythic', name: 'Limited', color: '#ff2e88', hex: 0xff2e88, weight: 0.2, order: 4 },
};

// Shiny finishes (the real figures come in metallic / glow / chrome variants).
export const VARIANTS = {
  base: { id: 'base', name: 'Normal', bonus: 0, chance: 1 },
  silver: { id: 'silver', name: 'Metallic Silver', bonus: 0.04, chance: 0.04, color: '#c8ccd8' },
  gold: { id: 'gold', name: 'Gold', bonus: 0.08, chance: 0.015, color: '#ffd23f' },
  chrome: { id: 'chrome', name: 'Hyperchrome', bonus: 0.12, chance: 0.005, color: '#9ff2ff' },
};

export const SERIES = {
  originals: { id: 'originals', name: 'Beast Icons', color: '#29b6f6', desc: 'The iconic MrBeast Lab panthers and legends.' },
  homeHorrors: { id: 'homeHorrors', name: 'Home Horrors', color: '#ff8a2a', desc: 'Household items and furniture gone feral.' },
  technoTerrors: { id: 'technoTerrors', name: 'Techno Terrors', color: '#5ce1e6', desc: 'Appliances and gadgets with teeth.' },
  atomic: { id: 'atomic', name: 'Toxic Troopers', color: '#7cff3a', desc: 'Glowing toxic-waste mutants.' },
  hybrids: { id: 'hybrids', name: 'Hyper Fusion', color: '#ff5a1f', desc: 'Fire, ice and stone fusions.' },
  food: { id: 'food', name: 'Snack Squad', color: '#ff4fa3', desc: 'FOOD SEASON: snacks that bite back.' },
  labBrats: { id: 'labBrats', name: 'Lab Brats', color: '#9dff3a', desc: 'Lab equipment and mutated experiments.' },
  creepyCritters: { id: 'creepyCritters', name: 'Creepy Critters', color: '#8a5cff', desc: 'Bugs, snakes and night prowlers.' },
};

// role: melee | ranged | tank | swarm | support | kamikaze | flying | siege
// traits: area, pierce, armor, stun, slow, burn, freeze, chain, split, aura, heal, knock, flying,
//         siege (targets buildings only), ambush (first hit x3), kamikaze
// arena: the Beast Island arena where the card unlocks (drops from vials).
export const SWARMS = {
  // ----- Beast Icons
  panther: {
    name: 'Panther', series: 'originals', rarity: 'common', role: 'melee', arena: 'lab',
    elixir: 2, hp: 420, dmg: 82, atk: 1.0, range: 0.75, speed: 1.75, kb: 2, size: 1,
    desc: 'The Lab mascot: magenta lightning bolts, black claws, zero chill. Cheap, fast and fearless.',
    mega: 'feastablesPanther',
  },
  steelPanther: {
    name: 'Steel Panther', series: 'originals', rarity: 'epic', role: 'tank', arena: 'lab',
    elixir: 6, hp: 2500, dmg: 150, atk: 1.3, range: 0.85, speed: 1.0, kb: 2, size: 1.3,
    traits: { armor: 0.3 }, desc: 'Ultra Armor Panther: silver armour, a cape and a spiked mace tail. Shrugs off 30% of damage.',
  },
  beastTiger: {
    name: 'Beast Tiger', series: 'originals', rarity: 'legendary', role: 'melee', arena: 'pyramid',
    elixir: 8, hp: 4100, dmg: 300, atk: 1.6, range: 1.3, speed: 1.05, kb: 3, size: 1.9,
    traits: { area: true, stun: { chance: 0.35, dur: 1.2 } }, desc: 'The legend from the Lab tank. Its roar stuns whole crowds.',
  },
  hyperFusionPanther: {
    name: 'Hyper Fusion Panther', series: 'originals', rarity: 'mythic', role: 'melee', arena: 'island',
    elixir: 9, hp: 4800, dmg: 360, atk: 1.3, range: 1.5, speed: 1.25, kb: 4, size: 1.8,
    traits: { area: true, burn: { dps: 45, dur: 3 }, freeze: { chance: 0.25, dur: 1.2 } },
    desc: 'LIMITED EDITION: only 1,000 exist! Fire and ice fused around a chrome core.',
  },

  // ----- Home Horrors
  cloggedToilet: {
    name: 'Clogged Toilet', series: 'homeHorrors', rarity: 'common', role: 'ranged', arena: 'lab',
    elixir: 3, hp: 380, dmg: 92, atk: 1.3, range: 4.6, speed: 1.05, kb: 2, size: 1,
    projectile: 'sludge', desc: 'Neon porcelain, magenta teeth and a bowl full of sludge it lobs from range.',
  },
  trashedCan: {
    name: 'Trashed Can', series: 'homeHorrors', rarity: 'common', role: 'tank', arena: 'lab',
    elixir: 3, hp: 1150, dmg: 64, atk: 1.3, range: 0.75, speed: 0.95, kb: 2, size: 1.1,
    desc: 'A garbage can with a grudge. Soaks damage for your squad.',
  },
  toiletRollRipper: {
    name: 'Toilet Roll Ripper', series: 'homeHorrors', rarity: 'common', role: 'swarm', arena: 'lab',
    elixir: 2, hp: 135, dmg: 52, atk: 0.85, range: 0.6, speed: 2.2, kb: 1, size: 0.8, count: 3,
    desc: 'Comes in a 3-pack. Shreds anything in front of it.',
  },
  mutantMailbox: {
    name: 'Mutant Mailbox', series: 'homeHorrors', rarity: 'rare', role: 'ranged', arena: 'circle',
    elixir: 4, hp: 520, dmg: 112, atk: 1.8, range: 5, speed: 1.0, kb: 2, size: 1.1,
    traits: { area: true }, projectile: 'letters', desc: 'Delivers explosive junk mail. Area damage.',
  },
  ragingStopSign: {
    name: 'Raging Stop Sign', series: 'homeHorrors', rarity: 'rare', role: 'melee', arena: 'circle',
    elixir: 4, hp: 920, dmg: 115, atk: 1.2, range: 0.9, speed: 1.2, kb: 3, size: 1.2,
    traits: { stun: { chance: 0.3, dur: 1.0 } }, desc: 'STOP! Hits have a chance to stun enemies in place.',
  },
  badEggsperiment: {
    name: 'Bad Eggsperiment', series: 'homeHorrors', rarity: 'rare', role: 'kamikaze', arena: 'circle',
    elixir: 3, hp: 300, dmg: 430, atk: 0.1, range: 0.6, speed: 2.1, kb: 1, size: 0.95,
    traits: { area: true, kamikaze: true }, desc: 'Runs in and EXPLODES. Great against Labs and crowds.',
  },
  barfBin: {
    name: 'Barf Bin', series: 'homeHorrors', rarity: 'rare', role: 'melee', arena: 'circle',
    elixir: 4, hp: 1000, dmg: 82, atk: 1.3, range: 1.4, speed: 1.0, kb: 2, size: 1.15,
    traits: { area: true, slow: { amt: 0.45, dur: 2 } }, desc: 'Barfs a sticky cone that slows everything it hits.',
  },
  atomicToilet: {
    name: 'Atomic Toilet', series: 'homeHorrors', rarity: 'epic', role: 'ranged', arena: 'circle',
    elixir: 6, hp: 1150, dmg: 210, atk: 2.0, range: 4.6, speed: 0.9, kb: 2, size: 1.35,
    traits: { area: true }, projectile: 'nuke', desc: 'Flushes radioactive blasts. Huge area splash.',
  },
  shockSign: {
    name: 'Shock Sign', series: 'homeHorrors', rarity: 'epic', role: 'ranged', arena: 'circle',
    elixir: 5, hp: 820, dmg: 135, atk: 1.6, range: 4.3, speed: 1.05, kb: 2, size: 1.2,
    traits: { chain: 3 }, projectile: 'zap', desc: 'High voltage! Lightning chains between 3 enemies.',
  },
  fieryPanther: {
    name: 'Fiery Panther', series: 'homeHorrors', rarity: 'epic', role: 'melee', arena: 'circle',
    elixir: 4, hp: 1050, dmg: 128, atk: 1.0, range: 0.9, speed: 1.6, kb: 2, size: 1.05,
    traits: { area: true, burn: { dps: 34, dur: 3 } }, desc: 'Orange fur, magenta claws and flames down its back. Sets crowds ablaze.',
  },

  // ----- Techno Terrors
  glitchBot: {
    name: 'Glitch Bot', series: 'technoTerrors', rarity: 'common', role: 'ranged', arena: 'mart',
    elixir: 3, hp: 340, dmg: 80, atk: 1.0, range: 4.8, speed: 1.1, kb: 2, size: 1,
    projectile: 'laser', desc: 'Pew pew. Lasers that glitch through the air.',
  },
  droneFang: {
    name: 'Drone Fang', series: 'technoTerrors', rarity: 'rare', role: 'flying', arena: 'mart',
    elixir: 4, hp: 620, dmg: 98, atk: 1.0, range: 1.0, speed: 1.75, kb: 2, size: 1,
    traits: { flying: true }, desc: 'Flies over the brawl. Melee troops deal half damage to it.',
  },
  circuitShark: {
    name: 'Circuit Shark', series: 'technoTerrors', rarity: 'rare', role: 'melee', arena: 'mart',
    elixir: 4, hp: 860, dmg: 150, atk: 1.0, range: 0.9, speed: 1.7, kb: 3, size: 1.2,
    desc: 'Bites with 10,000 volts. Fast and ferocious.',
  },
  hyperchargePanther: {
    name: 'Hypercharge Panther', series: 'technoTerrors', rarity: 'epic', role: 'melee', arena: 'mart',
    elixir: 5, hp: 1300, dmg: 145, atk: 1.1, range: 0.9, speed: 1.55, kb: 2, size: 1.1,
    traits: { chain: 2 }, desc: 'Glow-in-the-dark electric panther. Every swipe arcs to a second enemy.',
  },
  megaTechMech: {
    name: 'Mega-Tech Mech', series: 'technoTerrors', rarity: 'legendary', role: 'ranged', arena: 'mart',
    elixir: 7, hp: 3100, dmg: 260, atk: 2.4, range: 5.5, speed: 0.8, kb: 2, size: 1.9,
    traits: { area: true }, projectile: 'missile', desc: 'A walking tank firing missile volleys from long range.',
  },

  // ----- Lab Brats & Creepy Critters (Red Light Courtyard)
  ragingRat: {
    name: 'Raging Rat', series: 'labBrats', rarity: 'common', role: 'swarm', arena: 'redlight',
    elixir: 2, hp: 110, dmg: 46, atk: 0.75, range: 0.55, speed: 2.4, kb: 1, size: 0.75, count: 3,
    desc: 'A brown lab rat with green crystals growing inside and a melting yellow head. Comes in threes.',
  },
  toxicPanther: {
    name: 'Toxic Panther', series: 'labBrats', rarity: 'rare', role: 'melee', arena: 'redlight',
    elixir: 3, hp: 720, dmg: 88, atk: 1.0, range: 0.8, speed: 1.6, kb: 2, size: 1,
    traits: { burn: { dps: 26, dur: 3, poison: true } }, desc: 'A green-grape panther dripping toxic goo. Its bite poisons.',
  },
  midnightPanther: {
    name: 'Midnight Panther', series: 'creepyCritters', rarity: 'rare', role: 'melee', arena: 'redlight',
    elixir: 3, hp: 600, dmg: 100, atk: 1.0, range: 0.8, speed: 1.8, kb: 2, size: 1,
    traits: { ambush: 3 }, desc: 'Black fading to blue, glows in the dark. Its first strike deals TRIPLE damage.',
  },
  vexViper: {
    name: 'Vex Viper', series: 'creepyCritters', rarity: 'rare', role: 'ranged', arena: 'redlight',
    elixir: 4, hp: 520, dmg: 78, atk: 1.2, range: 4.4, speed: 1.1, kb: 2, size: 1.05,
    traits: { slow: { amt: 0.35, dur: 2 }, burn: { dps: 18, dur: 3, poison: true } }, projectile: 'venom',
    desc: 'A coiled violet viper. Spits venom that slows and poisons.',
  },

  // ----- Toxic Troopers
  atomicSlime: {
    name: 'Atomic Slime', series: 'atomic', rarity: 'common', role: 'melee', arena: 'reactor',
    elixir: 3, hp: 620, dmg: 70, atk: 1.1, range: 0.75, speed: 1.2, kb: 2, size: 0.95,
    traits: { split: 2 }, desc: 'Splits into two mini slimes when defeated.',
  },
  plutoniumPup: {
    name: 'Plutonium Pup', series: 'atomic', rarity: 'rare', role: 'support', arena: 'reactor',
    elixir: 4, hp: 920, dmg: 62, atk: 1.0, range: 0.8, speed: 1.3, kb: 2, size: 1.05,
    traits: { aura: { dps: 42, r: 1.8 } }, desc: 'Its radioactive aura burns every nearby enemy.',
  },
  reactorRex: {
    name: 'Reactor Rex', series: 'atomic', rarity: 'epic', role: 'tank', arena: 'reactor',
    elixir: 7, hp: 3600, dmg: 180, atk: 1.6, range: 1.2, speed: 0.95, kb: 3, size: 1.6,
    traits: { area: true }, desc: 'A glowing dino with a reactor heart. Tail-swipes everything.',
  },

  // ----- Hyper Fusion
  blazeHybrid: {
    name: 'Blaze Hybrid', series: 'hybrids', rarity: 'rare', role: 'ranged', arena: 'antarctica',
    elixir: 4, hp: 520, dmg: 86, atk: 1.3, range: 4.4, speed: 1.1, kb: 2, size: 1.05,
    traits: { burn: { dps: 30, dur: 3 } }, projectile: 'fire', desc: 'Fireballs that set enemies ablaze.',
  },
  frostHybrid: {
    name: 'Frost Hybrid', series: 'hybrids', rarity: 'rare', role: 'melee', arena: 'antarctica',
    elixir: 4, hp: 960, dmg: 92, atk: 1.2, range: 0.9, speed: 1.2, kb: 2, size: 1.1,
    traits: { freeze: { chance: 0.3, dur: 1.5 } }, desc: 'Icy claws that freeze enemies solid.',
  },
  stoneHybrid: {
    name: 'Stone Hybrid', series: 'hybrids', rarity: 'epic', role: 'siege', arena: 'antarctica',
    elixir: 6, hp: 3900, dmg: 190, atk: 1.5, range: 0.9, speed: 0.8, kb: 1, size: 1.5,
    traits: { armor: 0.2, siege: true }, desc: 'A walking boulder that ignores troops and smashes straight into towers.',
  },

  // ----- Snack Squad (FOOD SEASON)
  fryFiend: {
    name: 'Fry Fiend', series: 'food', rarity: 'common', role: 'ranged', arena: 'lab',
    elixir: 2, hp: 230, dmg: 56, atk: 0.9, range: 4.2, speed: 1.2, kb: 2, size: 1,
    projectile: 'fries', season: 1, desc: 'Launches crispy fries at rapid speed.',
  },
  pizzaSlicer: {
    name: 'Pizza Slicer', series: 'food', rarity: 'common', role: 'melee', arena: 'lab',
    elixir: 2, hp: 380, dmg: 70, atk: 0.8, range: 0.7, speed: 1.6, kb: 2, size: 0.95,
    season: 1, desc: 'A spinning slice of chaos. Extra cheese, extra damage.',
  },
  donutDasher: {
    name: 'Donut Dasher', series: 'food', rarity: 'rare', role: 'melee', arena: 'factory',
    elixir: 3, hp: 660, dmg: 92, atk: 1.0, range: 0.8, speed: 2.3, kb: 2, size: 1,
    traits: { knock: true }, season: 1, desc: 'Rolls in at top speed and knocks enemies back.',
  },
  burgerBrute: {
    name: 'Burger Brute', series: 'food', rarity: 'rare', role: 'tank', arena: 'factory',
    elixir: 5, hp: 2350, dmg: 72, atk: 1.4, range: 0.8, speed: 0.9, kb: 2, size: 1.3,
    traits: { heal: 0.3 }, season: 1, desc: 'A towering burger. Heals nearby allies when it falls.',
  },
  sodaSurge: {
    name: 'Soda Surge', series: 'food', rarity: 'rare', role: 'ranged', arena: 'factory',
    elixir: 4, hp: 480, dmg: 44, atk: 0.5, range: 4.0, speed: 1.1, kb: 2, size: 1,
    traits: { pierce: true }, projectile: 'soda', season: 1, desc: 'Sprays a fizzy stream that pierces every enemy in line.',
  },
  chocoChomper: {
    name: 'Choco Chomper', series: 'food', rarity: 'epic', role: 'melee', arena: 'factory',
    elixir: 5, hp: 1700, dmg: 150, atk: 1.3, range: 1.2, speed: 1.15, kb: 3, size: 1.35,
    traits: { area: true, slow: { amt: 0.35, dur: 2 } }, season: 1, desc: 'A Feastables bar beast. Sticky chocolate slows foes.',
  },
  melonMauler: {
    name: 'Melon Mauler', series: 'food', rarity: 'epic', role: 'tank', arena: 'factory',
    elixir: 6, hp: 2800, dmg: 120, atk: 1.5, range: 1.0, speed: 0.9, kb: 2, size: 1.5,
    traits: { split: 3, area: true }, season: 1, desc: 'Bursts into 3 seedlings when it pops.',
  },

  // ----- Mega Forms (not collectable directly; unlocked with a Mega Serum)
  feastablesPanther: {
    name: 'Feastables Panther', series: 'food', rarity: 'legendary', role: 'melee', isMega: true, base: 'panther',
    elixir: 5, hp: 2600, dmg: 220, atk: 1.15, range: 1.5, speed: 1.45, kb: 4, size: 2.1,
    traits: { area: true, slow: { amt: 0.4, dur: 2 } }, season: 1,
    desc: 'MEGA FORM! A gigantic Panther sculpted from Feastables chocolate. Chocolate shockwaves slow enemies.',
  },

  // ----- Minis spawned by splits (not collectable)
  miniSlime: {
    name: 'Mini Slime', series: 'atomic', rarity: 'common', role: 'melee', hidden: true,
    elixir: 0, hp: 210, dmg: 38, atk: 0.8, range: 0.6, speed: 1.5, kb: 1, size: 0.6,
  },
  seedling: {
    name: 'Seedling', series: 'food', rarity: 'common', role: 'melee', hidden: true,
    elixir: 0, hp: 300, dmg: 50, atk: 0.9, range: 0.6, speed: 1.5, kb: 1, size: 0.6,
  },
};

for (const [id, s] of Object.entries(SWARMS)) {
  s.id = id;
  s.kind = 'troop';
  s.traits = s.traits || {};
  s.cost = s.elixir; // legacy alias
}

export const COLLECTABLE = Object.values(SWARMS).filter((s) => !s.hidden && !s.isMega);
export const MEGA_FORMS = Object.values(SWARMS).filter((s) => s.isMega);

// Level scaling: +10% hp/dmg per level.
export const MAX_LEVEL = 10;
export const statMult = (level) => 1 + (level - 1) * 0.1;

// Copies & coins needed to go from level L to L+1 (index = L-1).
export const UPGRADE = {
  common: { copies: [2, 4, 10, 20, 50, 100, 200, 400, 800], coins: [5, 20, 50, 150, 400, 1000, 2000, 4000, 8000] },
  rare: { copies: [2, 4, 10, 20, 50, 100, 200, 300, 400], coins: [50, 150, 400, 1000, 2000, 4000, 8000, 15000, 20000] },
  epic: { copies: [2, 4, 10, 20, 30, 50, 70, 100, 150], coins: [400, 1000, 2000, 4000, 8000, 15000, 25000, 35000, 50000] },
  legendary: { copies: [2, 4, 6, 10, 15, 20, 25, 30, 40], coins: [5000, 10000, 15000, 20000, 30000, 40000, 50000, 70000, 100000] },
  mythic: { copies: [1, 2, 3, 4, 5, 6, 8, 10, 12], coins: [8000, 15000, 20000, 30000, 40000, 50000, 70000, 90000, 120000] },
};
// Lab XP (king level XP) granted for upgrading a card TO level index+2.
export const UPGRADE_XP = {
  common: [4, 5, 6, 10, 25, 50, 100, 200, 400],
  rare: [6, 10, 25, 50, 100, 200, 400, 600, 800],
  epic: [25, 50, 100, 200, 400, 600, 800, 1000, 1500],
  legendary: [250, 300, 400, 500, 600, 800, 1000, 1500, 2000],
  mythic: [300, 400, 500, 600, 800, 1000, 1500, 2000, 2500],
};

// Global damage scale (kept for compatibility; stats above are already tuned).
export const DMG_SCALE = 1;

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
  kamikaze: { name: 'Kamikaze', icon: 'bomb' },
  flying: { name: 'Flying', icon: 'wing' },
  siege: { name: 'Siege', icon: 'tower' },
};

/** Speed label like Clash Royale. */
export function speedName(v) {
  return v >= 2.1 ? 'Very Fast' : v >= 1.55 ? 'Fast' : v >= 1.0 ? 'Medium' : 'Slow';
}

export function traitText(s) {
  const t = s.traits || {};
  const out = [];
  if (t.siege) out.push('Targets buildings');
  if (t.area) out.push('Area damage');
  if (t.armor) out.push(`Armor ${Math.round(t.armor * 100)}%`);
  if (t.stun) out.push(`${Math.round(t.stun.chance * 100)}% Stun`);
  if (t.freeze) out.push(`${Math.round(t.freeze.chance * 100)}% Freeze`);
  if (t.slow) out.push('Slows');
  if (t.burn) out.push(t.burn.poison ? 'Poisons' : 'Burns');
  if (t.chain) out.push(`Chains x${t.chain}`);
  if (t.split) out.push(`Splits x${t.split}`);
  if (t.aura) out.push('Damage aura');
  if (t.heal) out.push('Heals on death');
  if (t.knock) out.push('Knockback');
  if (t.pierce) out.push('Pierces');
  if (t.flying) out.push('Flying');
  if (t.kamikaze) out.push('Explodes');
  if (t.ambush) out.push(`Ambush x${t.ambush}`);
  if (s.count > 1) out.push(`x${s.count} per deploy`);
  return out;
}
