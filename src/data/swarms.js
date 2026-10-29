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
  megaTech: { id: 'megaTech', name: 'Mega-Tech', color: '#3d8bff', desc: 'Micro Beasts in futuristic Mega-Tech armour.' },
  fireIce: { id: 'fireIce', name: 'Fire & Ice', color: '#ff6a3d', desc: 'Lava-hot and ice-cold beasts from the Fire & Ice packs.' },
  battleFusion: { id: 'battleFusion', name: 'Battle Fusion', color: '#b45cff', desc: 'Super-mutants fused in the Lab for one thing: battle.' },
  wildlands: { id: 'wildlands', name: 'Wild Lands', color: '#2fd47a', desc: 'Jungle and reef beasts from the wildest corners of Beast Island.' },
  spooky: { id: 'spooky', name: 'Spooky Squad', color: '#7af0c8', desc: 'Ghosts and ghouls from the Haunted Mansion.' },
  cosmic: { id: 'cosmic', name: 'Cosmic Crew', color: '#7a6cff', desc: 'Zero-G beasts from the Beast Space Station.' },
};

// role: melee | ranged | tank | swarm | support | kamikaze | flying | siege
// Every troop has ONE signature mechanic (its `traits`), so no two play alike.
// Classic traits: area, pierce, armor, stun, slow, burn (poison), freeze, chain, split, aura, knock,
//   flying, siege (targets the base only), ambush (first hit xN), kamikaze
// Signature traits (handled in sim.js unit behaviour):
//   pack       +dmg per nearby ally            thorns     reflects melee damage
//   roar       periodic stun burst             fireIce    hits alternate burn / freeze
//   shove      shots push the target back      summon     spawns minions over time
//   wrap       every Nth hit stuns             backline   targets the enemy furthest back
//   stopper    first hit on a target stuns     fragile    explodes when any troop hits it
//   mortar     long range, can't hit up close  splash     bigger splash radius
//   trail      leaves burning ground           blink      teleports back from melee
//   skirmish   hit and retreat                 breaker    ignores armour, x3 vs shields
//   leap       leaps over the front line       poisonStack stacking poison
//   stealth    untargetable until it strikes   expose     target takes +X% damage
//   absorb     grows on every KO               deathBomb  explodes / bursts on death
//   freezeEvery every Nth hit freezes          unstoppable immune to stun/slow/freeze/knock
//   multishot  shoots N targets at once        spin       hits everything around it
//   charge     run-up dash, double hit         healer     heals the most-hurt ally
//   rally      nearby allies faster            devour     swallows small enemies whole
//   lifesteal  heals from damage dealt         execute    bonus vs wounded enemies
//   revive     comes back once (1-UP)          berserk    rages below half HP
//   chill      stacking slow                   burrow     untargetable underground
//   pull       yanks its target to it          root       pins the target in place
//   slam       every Nth hit ground-pounds     heatUp     damage ramps on one target
//   phase      turns intangible on a cycle     scare      enemies run the wrong way
//   feast      KOs heal it and speed it up     erupt      one-time blast at half HP
//   strike     periodic orbital strike         abduct     lifts an enemy, helpless
//   shield     spawns with a shield
// arena: the Beast Island arena where the card unlocks (drops from vials).
export const SWARMS = {
  // ----- Beast Icons
  panther: {
    name: 'Panther', series: 'originals', rarity: 'common', role: 'melee', arena: 'lab',
    elixir: 2, hp: 400, dmg: 70, atk: 1.0, range: 0.75, speed: 1.75, kb: 2, size: 1,
    traits: { pack: { per: 0.2, max: 3, r: 2.6 } },
    desc: 'The Lab mascot hunts in packs: +20% damage for every ally fighting beside it, up to +60%.',
    mega: 'feastablesPanther',
  },
  steelPanther: {
    name: 'Steel Panther', series: 'originals', rarity: 'epic', role: 'tank', arena: 'lab',
    elixir: 6, hp: 2050, dmg: 125, atk: 1.3, range: 0.85, speed: 1.0, kb: 2, size: 1.3,
    traits: { armor: 0.25, thorns: 0.45 },
    desc: 'Spiked Ultra Armor: blocks 25% of all damage and stabs melee attackers for 45% of every hit they land.',
  },
  beastTiger: {
    name: 'Beast Tiger', series: 'originals', rarity: 'legendary', role: 'melee', arena: 'pyramid',
    elixir: 8, hp: 2950, dmg: 210, atk: 1.6, range: 1.3, speed: 1.05, kb: 3, size: 1.9,
    traits: { area: true, roar: { every: 7, r: 3.2, stun: 1.4 } },
    desc: 'The legend from the Lab tank: swipes whole crowds, and every 7s its ROAR stuns every enemy around it.',
  },
  hyperFusionPanther: {
    name: 'Hyper Fusion Panther', series: 'originals', rarity: 'mythic', role: 'melee', arena: 'island',
    elixir: 9, hp: 4400, dmg: 320, atk: 1.3, range: 1.5, speed: 1.25, kb: 4, size: 1.8,
    traits: { area: true, fireIce: { burn: { dps: 50, dur: 3 }, freeze: 1.2 } },
    desc: 'LIMITED EDITION, only 1,000 exist! Its splash swipes alternate fire that burns and ice that freezes.',
  },

  // ----- Home Horrors
  cloggedToilet: {
    name: 'Clogged Toilet', series: 'homeHorrors', rarity: 'common', role: 'ranged', arena: 'lab',
    elixir: 3, hp: 380, dmg: 90, atk: 1.3, range: 4.6, speed: 1.05, kb: 2, size: 1,
    traits: { shove: 0.6 }, projectile: 'sludge',
    desc: 'Lobs sludge from range, and every splat shoves its target a step back.',
  },
  trashedCan: {
    name: 'Trashed Can', series: 'homeHorrors', rarity: 'common', role: 'tank', arena: 'lab',
    elixir: 3, hp: 960, dmg: 58, atk: 1.3, range: 0.75, speed: 0.95, kb: 2, size: 1.1,
    traits: { summon: { unit: 'ragingRat', every: 5, first: 2.5, max: 2, hp: 0.9, dmg: 0.9 } },
    desc: 'A garbage can with a grudge: every 5s a Raging Rat crawls out of it to fight (2 at a time).',
  },
  toiletRollRipper: {
    name: 'Toilet Roll Ripper', series: 'homeHorrors', rarity: 'common', role: 'swarm', arena: 'lab',
    elixir: 2, hp: 110, dmg: 38, atk: 0.9, range: 0.6, speed: 2.2, kb: 1, size: 0.8, count: 3,
    traits: { wrap: { stacks: 4, stun: 1.0, cd: 2.5 } },
    desc: 'A 3-pack of shredders: every 4th hit on a target mummy-wraps it in paper, stunning it for 1s.',
  },
  mutantMailbox: {
    name: 'Mutant Mailbox', series: 'homeHorrors', rarity: 'rare', role: 'ranged', arena: 'circle',
    elixir: 4, hp: 520, dmg: 100, atk: 1.8, range: 5, speed: 1.0, kb: 2, size: 1.1,
    traits: { area: true, backline: true }, projectile: 'letters',
    desc: 'Skips the front line: its junk-mail bombs land on the enemy furthest back in range and splash.',
  },
  ragingStopSign: {
    name: 'Raging Stop Sign', series: 'homeHorrors', rarity: 'rare', role: 'melee', arena: 'circle',
    elixir: 4, hp: 900, dmg: 105, atk: 1.2, range: 0.9, speed: 1.2, kb: 3, size: 1.2,
    traits: { stopper: { stun: 1.2 } },
    desc: 'STOP! Its first hit on every new target stuns it for 1.2s.',
  },
  badEggsperiment: {
    name: 'Bad Eggsperiment', series: 'homeHorrors', rarity: 'rare', role: 'kamikaze', arena: 'circle',
    elixir: 3, hp: 360, dmg: 560, atk: 0.1, range: 0.6, speed: 2.5, kb: 1, size: 0.95,
    traits: { area: true, kamikaze: true, siege: true, fragile: true },
    desc: 'Ignores troops and sprints at the base to EXPLODE, but cracks and blows up early if a troop hits it.',
  },
  barfBin: {
    name: 'Barf Bin', series: 'homeHorrors', rarity: 'rare', role: 'melee', arena: 'circle',
    elixir: 4, hp: 1000, dmg: 66, atk: 1.3, range: 1.9, speed: 1.0, kb: 2, size: 1.15,
    traits: { pierce: true, slow: { amt: 0.45, dur: 2 } },
    desc: 'Barfs a 2-tile cone that hits every enemy in front of it and slows them to a crawl.',
  },
  atomicToilet: {
    name: 'Atomic Toilet', series: 'homeHorrors', rarity: 'epic', role: 'ranged', arena: 'circle',
    elixir: 6, hp: 1000, dmg: 190, atk: 2.6, range: 6.2, speed: 0.85, kb: 2, size: 1.35,
    traits: { area: true, splash: 1.5, mortar: { min: 2.2 } }, projectile: 'nuke',
    desc: 'A walking mortar: flushes nukes from very long range with a huge splash, but cannot hit anything up close.',
  },
  shockSign: {
    name: 'Shock Sign', series: 'homeHorrors', rarity: 'epic', role: 'ranged', arena: 'circle',
    elixir: 5, hp: 760, dmg: 88, atk: 1.6, range: 4.3, speed: 1.05, kb: 2, size: 1.2,
    traits: { chain: 4, stun: { chance: 1, dur: 0.3 } }, projectile: 'zap',
    desc: 'High voltage! Each bolt chains through up to 4 enemies and jolts every one of them to a stop.',
  },
  fieryPanther: {
    name: 'Fiery Panther', series: 'homeHorrors', rarity: 'epic', role: 'melee', arena: 'circle',
    elixir: 4, hp: 900, dmg: 96, atk: 1.0, range: 0.9, speed: 1.6, kb: 2, size: 1.05,
    traits: { burn: { dps: 22, dur: 3 }, trail: { every: 0.35, dur: 3, r: 0.75, dps: 50, kind: 'fire' } },
    desc: 'Leaves a trail of burning paw prints: every enemy that walks through its fire path burns.',
  },

  // ----- Techno Terrors
  glitchBot: {
    name: 'Glitch Bot', series: 'technoTerrors', rarity: 'common', role: 'ranged', arena: 'mart',
    elixir: 3, hp: 330, dmg: 76, atk: 1.0, range: 4.8, speed: 1.1, kb: 2, size: 1,
    traits: { blink: { dist: 3, cd: 5, near: 1.5 } }, projectile: 'laser',
    desc: 'Pew pew. When an enemy gets too close it glitches out and teleports 3 tiles back.',
  },
  droneFang: {
    name: 'Drone Fang', series: 'technoTerrors', rarity: 'rare', role: 'flying', arena: 'mart',
    elixir: 4, hp: 640, dmg: 110, atk: 0.9, range: 1.0, speed: 1.85, kb: 2, size: 1,
    traits: { flying: true, skirmish: { back: 1.5 } },
    desc: 'Flies in hit-and-run strikes: bites, zips back out of reach, then dives in again.',
  },
  circuitShark: {
    name: 'Circuit Shark', series: 'technoTerrors', rarity: 'rare', role: 'melee', arena: 'mart',
    elixir: 4, hp: 880, dmg: 150, atk: 1.0, range: 0.9, speed: 1.7, kb: 3, size: 1.2,
    traits: { breaker: { shield: 3 } },
    desc: 'Shield-breaker: its 10,000-volt bites ignore armour and fry shields at triple damage.',
  },
  hyperchargePanther: {
    name: 'Hypercharge Panther', series: 'technoTerrors', rarity: 'epic', role: 'melee', arena: 'mart',
    elixir: 5, hp: 1200, dmg: 135, atk: 1.1, range: 0.9, speed: 1.55, kb: 2, size: 1.1,
    traits: { chain: 2 },
    desc: 'A glow-in-the-dark electric panther: every swipe arcs lightning into a second enemy.',
  },
  megaTechMech: {
    name: 'Mega-Tech Mech', series: 'technoTerrors', rarity: 'legendary', role: 'siege', arena: 'mart',
    elixir: 7, hp: 2600, dmg: 200, atk: 2.4, range: 5.3, speed: 0.8, kb: 2, size: 1.9,
    traits: { siege: true, area: true }, projectile: 'missile',
    desc: 'Walking artillery: ignores troops and shells the base from so far away that only a Beast Lab can shoot back.',
  },

  // ----- Lab Brats & Creepy Critters (Red Light Courtyard)
  ragingRat: {
    name: 'Raging Rat', series: 'labBrats', rarity: 'common', role: 'swarm', arena: 'redlight',
    elixir: 2, hp: 100, dmg: 38, atk: 0.8, range: 0.55, speed: 2.4, kb: 1, size: 0.75, count: 3,
    traits: { leap: { range: 3.2 } },
    desc: 'Three mutant rats that LEAP over the front line to bite whatever is hiding behind it.',
  },
  toxicPanther: {
    name: 'Toxic Panther', series: 'labBrats', rarity: 'rare', role: 'melee', arena: 'redlight',
    elixir: 3, hp: 680, dmg: 70, atk: 1.0, range: 0.8, speed: 1.6, kb: 2, size: 1,
    traits: { poisonStack: { dps: 18, dur: 4, max: 4 } },
    desc: 'Every bite stacks another dose of poison (up to 4), so its venom keeps hurting long after.',
  },
  midnightPanther: {
    name: 'Midnight Panther', series: 'creepyCritters', rarity: 'rare', role: 'melee', arena: 'redlight',
    elixir: 3, hp: 560, dmg: 92, atk: 1.0, range: 0.8, speed: 1.8, kb: 2, size: 1,
    traits: { stealth: true, ambush: 2.5 },
    desc: 'Invisible until it strikes: nothing can target it, and its first strike deals 2.5x damage.',
  },
  vexViper: {
    name: 'Vex Viper', series: 'creepyCritters', rarity: 'rare', role: 'ranged', arena: 'redlight',
    elixir: 4, hp: 500, dmg: 76, atk: 1.2, range: 4.4, speed: 1.1, kb: 2, size: 1.05,
    traits: { burn: { dps: 14, dur: 3, poison: true }, expose: { amt: 0.3, dur: 3 } }, projectile: 'venom',
    desc: 'Its venom EXPOSES: anything it bites takes 30% more damage from everyone for 3s.',
  },

  // ----- Toxic Troopers
  atomicSlime: {
    name: 'Atomic Slime', series: 'atomic', rarity: 'common', role: 'melee', arena: 'reactor',
    elixir: 3, hp: 700, dmg: 70, atk: 1.1, range: 0.75, speed: 1.2, kb: 2, size: 0.95,
    traits: { absorb: { hp: 0.3, dmg: 0.2, scale: 0.16, max: 4 } },
    desc: 'A hungry blob: every enemy it finishes off gets absorbed, making it bigger, tougher and stronger.',
  },
  plutoniumPup: {
    name: 'Plutonium Pup', series: 'atomic', rarity: 'rare', role: 'support', arena: 'reactor',
    elixir: 4, hp: 900, dmg: 55, atk: 1.0, range: 0.8, speed: 1.3, kb: 2, size: 1.05,
    traits: { aura: { dps: 42, r: 1.9 } },
    desc: 'Glows with a radioactive aura that constantly burns every enemy within 2 tiles.',
  },
  reactorRex: {
    name: 'Reactor Rex', series: 'atomic', rarity: 'epic', role: 'tank', arena: 'reactor',
    elixir: 7, hp: 2250, dmg: 135, atk: 1.6, range: 1.2, speed: 0.95, kb: 3, size: 1.6,
    traits: { area: true, deathBomb: { dmg: 320, r: 2.8, kind: 'nuke', building: 0.4 } },
    desc: 'A dino with a reactor heart: tail-swipes crowds, and when it falls it MELTS DOWN in a nuclear blast.',
  },

  // ----- Hyper Fusion
  blazeHybrid: {
    name: 'Blaze Hybrid', series: 'hybrids', rarity: 'rare', role: 'ranged', arena: 'antarctica',
    elixir: 4, hp: 560, dmg: 56, atk: 0.9, range: 2.6, speed: 1.1, kb: 2, size: 1.05,
    traits: { pierce: true, burn: { dps: 26, dur: 3 } }, projectile: 'fire',
    desc: 'A short-range flamethrower that hoses every enemy in a 2.5-tile cone and sets them ablaze.',
  },
  frostHybrid: {
    name: 'Frost Hybrid', series: 'hybrids', rarity: 'rare', role: 'melee', arena: 'antarctica',
    elixir: 4, hp: 940, dmg: 90, atk: 1.1, range: 0.9, speed: 1.2, kb: 2, size: 1.1,
    traits: { freezeEvery: { n: 3, dur: 1.5 } },
    desc: 'Icy claws: every third hit freezes the target solid for 1.5s.',
  },
  stoneHybrid: {
    name: 'Stone Hybrid', series: 'hybrids', rarity: 'epic', role: 'siege', arena: 'antarctica',
    elixir: 6, hp: 3500, dmg: 180, atk: 1.5, range: 0.9, speed: 0.8, kb: 1, size: 1.5,
    traits: { armor: 0.2, siege: true, unstoppable: true },
    desc: 'An unstoppable boulder: ignores troops, shrugs off stuns, slows, freezes and knockback, and smashes the base.',
  },

  // ----- Snack Squad (FOOD SEASON)
  fryFiend: {
    name: 'Fry Fiend', series: 'food', rarity: 'common', role: 'ranged', arena: 'lab',
    elixir: 2, hp: 220, dmg: 46, atk: 0.9, range: 4.2, speed: 1.2, kb: 2, size: 1,
    traits: { multishot: 2 }, projectile: 'fries', season: 1,
    desc: 'Double-fries: shoots two crispy fries at once at two different enemies.',
  },
  pizzaSlicer: {
    name: 'Pizza Slicer', series: 'food', rarity: 'common', role: 'melee', arena: 'lab',
    elixir: 2, hp: 380, dmg: 62, atk: 0.8, range: 0.7, speed: 1.6, kb: 2, size: 0.95,
    traits: { spin: { r: 1.1 } }, season: 1,
    desc: 'Spins like a buzzsaw, slicing every enemy around it, even the ones behind it.',
  },
  donutDasher: {
    name: 'Donut Dasher', series: 'food', rarity: 'rare', role: 'melee', arena: 'factory',
    elixir: 3, hp: 680, dmg: 90, atk: 1.0, range: 0.8, speed: 1.9, kb: 2, size: 1,
    traits: { charge: { after: 2, speed: 2, mult: 2.2, knock: 4 } }, season: 1,
    desc: 'After a short run-up it rolls at double speed, and the impact deals double damage and bowls enemies over.',
  },
  burgerBrute: {
    name: 'Burger Brute', series: 'food', rarity: 'rare', role: 'support', arena: 'factory',
    elixir: 5, hp: 1900, dmg: 60, atk: 1.4, range: 0.8, speed: 0.9, kb: 2, size: 1.3,
    traits: { healer: { amt: 150, every: 2.5, r: 3.2 } }, season: 1,
    desc: 'A walking snack bar: every 2.5s it tosses a heal to the most-hurt ally nearby.',
  },
  sodaSurge: {
    name: 'Soda Surge', series: 'food', rarity: 'rare', role: 'support', arena: 'factory',
    elixir: 4, hp: 560, dmg: 44, atk: 0.6, range: 3.6, speed: 1.1, kb: 2, size: 1,
    traits: { rally: { r: 2.8, atk: 0.35, spd: 0.25 } }, projectile: 'soda', season: 1,
    desc: 'SUGAR RUSH: allies near it attack 35% faster and move 25% faster.',
  },
  chocoChomper: {
    name: 'Choco Chomper', series: 'food', rarity: 'epic', role: 'melee', arena: 'factory',
    elixir: 5, hp: 1500, dmg: 125, atk: 1.3, range: 1.2, speed: 1.15, kb: 3, size: 1.35,
    traits: { devour: { hp: 380, cd: 5, heal: 0.6 } }, season: 1,
    desc: 'CHOMP! Swallows any enemy with 380 HP or less whole (every 5s) and heals from the snack.',
  },
  melonMauler: {
    name: 'Melon Mauler', series: 'food', rarity: 'epic', role: 'tank', arena: 'factory',
    elixir: 6, hp: 2000, dmg: 105, atk: 1.5, range: 1.0, speed: 0.9, kb: 2, size: 1.5,
    traits: { split: 3, area: true }, season: 1,
    desc: 'A giant melon tank that bursts into 3 angry Seedlings when it finally pops.',
  },

  // ----- Wave 2: Mega-Tech, Fire & Ice, Battle Fusion + more Home Horrors
  hardHeadPanther: {
    name: 'Hard Head Panther', series: 'originals', rarity: 'rare', role: 'tank', arena: 'factory',
    elixir: 4, hp: 1350, dmg: 86, atk: 1.4, range: 0.85, speed: 1.15, kb: 1, size: 1.15,
    traits: { knock: 3.5 },
    desc: 'SPECIAL EDITION battering-ram helmet: every single headbutt sends its target flying back.',
  },
  voltBat: {
    name: 'Volt Bat', series: 'megaTech', rarity: 'rare', role: 'flying', arena: 'mart',
    elixir: 4, hp: 460, dmg: 84, atk: 1.3, range: 3.0, speed: 1.85, kb: 2, size: 0.95,
    traits: { flying: true, chain: 3 }, projectile: 'zap',
    desc: 'A tesla-coil bat that flies over the brawl and zaps lightning that bounces between 3 enemies.',
  },
  mechaMantis: {
    name: 'Mecha Mantis', series: 'megaTech', rarity: 'epic', role: 'melee', arena: 'redlight',
    elixir: 4, hp: 880, dmg: 60, atk: 0.55, range: 1.0, speed: 1.9, kb: 2, size: 1.1,
    traits: { lifesteal: 0.45 },
    desc: 'Chrome scythes slash twice a second, and every cut heals it for 45% of the damage dealt.',
  },
  cyberCroc: {
    name: 'Cyber Croc', series: 'megaTech', rarity: 'epic', role: 'tank', arena: 'reactor',
    elixir: 6, hp: 1900, dmg: 190, atk: 1.8, range: 1.0, speed: 0.95, kb: 1, size: 1.45,
    traits: { armor: 0.15, execute: { below: 0.4, mult: 2 } },
    desc: 'Hydraulic death-roll jaws: bites deal DOUBLE damage to any enemy under 40% HP.',
  },
  pixelPups: {
    name: 'Pixel Pups', series: 'megaTech', rarity: 'common', role: 'swarm', arena: 'lab',
    elixir: 2, hp: 150, dmg: 44, atk: 0.8, range: 0.6, speed: 2.1, kb: 1, size: 0.75, count: 2,
    traits: { revive: { hp: 0.6, delay: 0.7 } },
    desc: 'Two 8-bit pups with a 1-UP each: the first time a pup is knocked out it respawns with 60% HP.',
  },
  emberWolf: {
    name: 'Ember Wolf', series: 'fireIce', rarity: 'rare', role: 'melee', arena: 'antarctica',
    elixir: 3, hp: 660, dmg: 78, atk: 0.9, range: 0.8, speed: 2.0, kb: 2, size: 1.05,
    traits: { burn: { dps: 14, dur: 2 }, berserk: { below: 0.5 } },
    desc: 'Below half HP it goes BERSERK: +40% damage and +30% speed for the rest of the fight.',
  },
  iceBeetle: {
    name: 'Ice Beetle', series: 'fireIce', rarity: 'common', role: 'ranged', arena: 'antarctica',
    elixir: 3, hp: 420, dmg: 70, atk: 1.1, range: 4.4, speed: 1.05, kb: 2, size: 0.95,
    traits: { chill: { per: 0.15, max: 0.6, dur: 2.5 } }, projectile: 'ice',
    desc: 'Every ice shard stacks more chill: 15% slower per hit, up to 60%.',
  },
  magmaMole: {
    name: 'Magma Mole', series: 'fireIce', rarity: 'epic', role: 'siege', arena: 'pyramid',
    elixir: 5, hp: 1450, dmg: 135, atk: 1.3, range: 0.8, speed: 1.4, kb: 1, size: 1.2,
    traits: { siege: true, burrow: true, ambush: 2 },
    desc: 'Tunnels underground where nothing can hit it, then erupts at the base with a double-damage strike.',
  },
  sludgeKraken: {
    name: 'Sludge Kraken', series: 'battleFusion', rarity: 'legendary', role: 'ranged', arena: 'island',
    elixir: 7, hp: 2150, dmg: 135, atk: 2.1, range: 4.5, speed: 0.85, kb: 2, size: 1.6,
    traits: { area: true, backline: true, pull: { power: 3 }, burn: { dps: 26, dur: 3, poison: true } }, projectile: 'acid',
    desc: 'Tentacles grab the enemy furthest back, YANK it into the brawl and splash it with toxic sludge.',
  },
  boomBox: {
    name: 'Boom Box', series: 'homeHorrors', rarity: 'rare', role: 'ranged', arena: 'circle',
    elixir: 4, hp: 780, dmg: 78, atk: 1.6, range: 2.3, speed: 1.05, kb: 2, size: 1.1,
    traits: { spin: { r: 2.3, knock: 2 } },
    desc: 'Drops the bass: every BOOM blasts all enemies around it in a full circle and pushes them back.',
  },
  mutantMop: {
    name: 'Mutant Mop', series: 'homeHorrors', rarity: 'common', role: 'melee', arena: 'circle',
    elixir: 3, hp: 780, dmg: 72, atk: 1.1, range: 1.0, speed: 1.2, kb: 2, size: 1.05,
    traits: { puddle: { r: 1.0, dur: 3.5, slow: 0.5, dps: 0, kind: 'water' } },
    desc: 'Mops a slippery wet floor under its target: every enemy on the puddle is slowed by 50%.',
  },

  // ----- Wave 3: two troops per new arena (Lost Jungle Temple, Laser Maze Vault, Haunted Mansion,
  //       TeamSeas Reef, Volcano Forge, Zero-G Space Station)
  vineViper: {
    name: 'Vine Viper', series: 'wildlands', rarity: 'common', role: 'ranged', arena: 'jungle',
    elixir: 3, hp: 400, dmg: 70, atk: 1.2, range: 4.4, speed: 1.1, kb: 2, size: 1,
    traits: { root: { dur: 1.5, cd: 2 } }, projectile: 'acid',
    desc: 'Spits vine seeds that ROOT the target in place for 1.5s: it can still swing, but it cannot move.',
  },
  templeGolem: {
    name: 'Temple Golem', series: 'wildlands', rarity: 'epic', role: 'tank', arena: 'jungle',
    elixir: 6, hp: 2400, dmg: 135, atk: 1.7, range: 1.0, speed: 0.8, kb: 1, size: 1.4,
    traits: { armor: 0.15, slam: { every: 3, r: 2.1, knock: 4, mult: 1.5 } },
    desc: 'Every third punch is a GROUND POUND that hits everything nearby and knocks it flying.',
  },
  laserLynx: {
    name: 'Laser Lynx', series: 'megaTech', rarity: 'rare', role: 'ranged', arena: 'laser',
    elixir: 4, hp: 500, dmg: 38, atk: 0.4, range: 4.6, speed: 1.25, kb: 2, size: 1.05,
    traits: { heatUp: { per: 0.25, max: 3 } }, projectile: 'laser',
    desc: 'Tank melter: its beam heats up on the same target, +25% damage every shot, up to 4x.',
  },
  vaultBot: {
    name: 'Vault Bot', series: 'technoTerrors', rarity: 'rare', role: 'tank', arena: 'laser',
    elixir: 4, hp: 950, dmg: 100, atk: 1.3, range: 0.85, speed: 1.05, kb: 1, size: 1.15,
    traits: { shield: 0.6 },
    desc: 'Rolls out behind a vault-door shield worth 60% of its HP that has to be cracked first.',
  },
  ghostPanther: {
    name: 'Ghost Panther', series: 'spooky', rarity: 'epic', role: 'flying', arena: 'haunted',
    elixir: 4, hp: 740, dmg: 104, atk: 1.0, range: 0.9, speed: 1.8, kb: 2, size: 1.1,
    traits: { flying: true, phase: { on: 1.3, off: 2.4 } },
    desc: 'Flies, and every few seconds it phases out of reality: for 1.3s nothing can touch it.',
  },
  pumpkinBrute: {
    name: 'Pumpkin Brute', series: 'spooky', rarity: 'common', role: 'melee', arena: 'haunted',
    elixir: 3, hp: 720, dmg: 64, atk: 1.3, range: 0.95, speed: 1.05, kb: 2, size: 1.15,
    traits: { area: true, scare: { every: 6, r: 2.2, dur: 1.3 } },
    desc: 'Its glowing grin SCARES nearby enemies every 6s, sending them running the wrong way.',
  },
  sharkByte: {
    name: 'Shark Byte', series: 'wildlands', rarity: 'rare', role: 'melee', arena: 'reef',
    elixir: 3, hp: 680, dmg: 64, atk: 0.6, range: 0.75, speed: 2.3, kb: 2, size: 1.05,
    traits: { feast: { heal: 0.5, spd: 0.2, max: 3 } },
    desc: 'Feeding frenzy: every knockout heals it by half and makes it faster.',
  },
  jellyZapper: {
    name: 'Jelly Zapper', series: 'wildlands', rarity: 'common', role: 'flying', arena: 'reef',
    elixir: 3, hp: 420, dmg: 68, atk: 1.3, range: 2.8, speed: 1.2, kb: 2, size: 0.95,
    traits: { flying: true, deathBomb: { dmg: 110, r: 2.1, stun: 1.6, kind: 'zap' } }, projectile: 'zap',
    desc: 'Floats over the brawl, and when it pops it releases a shock burst that stuns everything nearby.',
  },
  magmaTitan: {
    name: 'Magma Titan', series: 'fireIce', rarity: 'legendary', role: 'tank', arena: 'volcano',
    elixir: 8, hp: 3000, dmg: 155, atk: 1.8, range: 1.3, speed: 0.75, kb: 3, size: 1.45,
    traits: { area: true, burn: { dps: 30, dur: 3 }, erupt: { below: 0.5, dmg: 320, r: 3.4, burn: { dps: 40, dur: 4 } } },
    desc: 'Slams burning lava over crowds, and at half HP it ERUPTS once, blasting everything nearby.',
  },
  emberImps: {
    name: 'Ember Imps', series: 'fireIce', rarity: 'common', role: 'swarm', arena: 'volcano',
    elixir: 3, hp: 135, dmg: 38, atk: 0.9, range: 1.1, speed: 2.0, kb: 1, size: 0.62, count: 3,
    traits: { flying: true, burn: { dps: 10, dur: 2 } },
    desc: 'Three fire imps that fly over ground troops, so only ranged and flying enemies hit them well.',
  },
  astroPanther: {
    name: 'Astro Panther', series: 'cosmic', rarity: 'legendary', role: 'flying', arena: 'space',
    elixir: 6, hp: 1050, dmg: 120, atk: 1.5, range: 3.6, speed: 1.5, kb: 2, size: 1.35,
    traits: { flying: true, strike: { every: 7, dmg: 200, r: 1.7, range: 7, building: 0.4 } }, projectile: 'missile',
    desc: 'Rocket-flies over the battle, and every 7s calls an ORBITAL STRIKE on the biggest enemy crowd.',
  },
  ufoGrabber: {
    name: 'UFO Grabber', series: 'cosmic', rarity: 'epic', role: 'flying', arena: 'space',
    elixir: 5, hp: 1000, dmg: 110, atk: 1.3, range: 3.2, speed: 1.3, kb: 2, size: 1.15,
    traits: { flying: true, abduct: { cd: 4, dur: 1.6 } }, projectile: 'zap',
    desc: 'Its tractor beam ABDUCTS an enemy every 4s, lifting it helplessly into the air.',
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
  const pc = (v) => `${Math.round(v * 100)}%`;
  if (t.siege) out.push('Targets the base');
  if (t.area) out.push('Area damage');
  if (t.armor) out.push(`Armor ${pc(t.armor)}`);
  if (t.shield) out.push(`Shield ${pc(t.shield)} HP`);
  if (t.stun) out.push(t.stun.chance >= 1 ? 'Jolts' : `${pc(t.stun.chance)} Stun`);
  if (t.freeze) out.push(`${pc(t.freeze.chance)} Freeze`);
  if (t.slow) out.push('Slows');
  if (t.burn) out.push(t.burn.poison ? 'Poisons' : 'Burns');
  if (t.chain) out.push(`Chains x${t.chain}`);
  if (t.split) out.push(`Splits x${t.split}`);
  if (t.aura) out.push('Damage aura');
  if (t.knock) out.push('Knockback');
  if (t.pierce) out.push('Hits a whole line');
  if (t.flying) out.push('Flying');
  if (t.kamikaze) out.push('Explodes');
  if (t.ambush) out.push(`First hit x${t.ambush}`);
  if (t.pack) out.push('Pack hunter');
  if (t.thorns) out.push(`Thorns ${pc(t.thorns)}`);
  if (t.roar) out.push(`Stun roar every ${t.roar.every}s`);
  if (t.fireIce) out.push('Fire + ice');
  if (t.shove) out.push('Shoves back');
  if (t.summon) out.push('Summons rats');
  if (t.wrap) out.push(`Wrap stun every ${t.wrap.stacks} hits`);
  if (t.backline) out.push('Targets the backline');
  if (t.stopper) out.push('First hit stuns');
  if (t.fragile) out.push('Fragile');
  if (t.mortar) out.push('Long range, blind spot');
  if (t.trail) out.push('Fire trail');
  if (t.blink) out.push('Teleports away');
  if (t.skirmish) out.push('Hit and run');
  if (t.breaker) out.push('Breaks shields & armor');
  if (t.leap) out.push('Leaps the front line');
  if (t.poisonStack) out.push(`Poison stacks x${t.poisonStack.max}`);
  if (t.stealth) out.push('Invisible');
  if (t.expose) out.push(`Exposes +${pc(t.expose.amt)}`);
  if (t.absorb) out.push('Grows on KO');
  if (t.deathBomb) out.push(t.deathBomb.stun ? 'Death shock' : 'Death blast');
  if (t.freezeEvery) out.push(`Freezes every ${t.freezeEvery.n} hits`);
  if (t.unstoppable) out.push('Unstoppable');
  if (t.multishot) out.push(`${t.multishot} targets at once`);
  if (t.spin) out.push('Hits all around');
  if (t.charge) out.push('Charge');
  if (t.healer) out.push('Heals allies');
  if (t.rally) out.push('Speeds up allies');
  if (t.devour) out.push('Swallows small foes');
  if (t.lifesteal) out.push(`Lifesteal ${pc(t.lifesteal)}`);
  if (t.execute) out.push(`x${t.execute.mult} vs wounded`);
  if (t.revive) out.push('Extra life');
  if (t.berserk) out.push('Berserk');
  if (t.chill) out.push('Stacking chill');
  if (t.burrow) out.push('Burrows');
  if (t.pull) out.push('Yanks enemies');
  if (t.root) out.push('Roots');
  if (t.slam) out.push(`Ground pound every ${t.slam.every} hits`);
  if (t.heatUp) out.push(`Heats up to x${1 + t.heatUp.max}`);
  if (t.phase) out.push('Phases out');
  if (t.scare) out.push('Scares');
  if (t.feast) out.push('Feeding frenzy');
  if (t.erupt) out.push('Erupts at half HP');
  if (t.strike) out.push(`Orbital strike every ${t.strike.every}s`);
  if (t.abduct) out.push('Abducts');
  if (t.puddle) out.push('Slippery puddles');
  if (t.heal) out.push('Heals on death');
  if (s.count > 1) out.push(`x${s.count} per deploy`);
  return out;
}
