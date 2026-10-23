// Spell cards: part of the 8-card deck like any troop. Drag or tap-aim onto
// the battlefield. Level scaling via spellPower(level).
export const SPELLS = {
  foodThrow: {
    name: 'Food Throw', icon: 'burger', color: '#5fdc4a', rarity: 'common', arena: 'lab', elixir: 3, radius: 3.2,
    desc: 'A food-eating challenge! Heals your troops 35% and makes them BIGGER: +50% max HP for 8s.',
    heal: 0.35, grow: 1.35, hpBoost: 0.5, dur: 8,
  },
  moneyDrop: {
    name: '$100K Drop', icon: 'bag', color: '#ffd23f', rarity: 'rare', arena: 'lab', elixir: 4, radius: 2.6,
    desc: 'A giant $100K money bag crashes down: heavy area damage and knockback. 40% damage to towers.',
    dmg: 430, knock: true, building: 0.4,
  },
  labShield: {
    name: 'Lab Shield', icon: 'shield', color: '#29b6f6', rarity: 'rare', arena: 'circle', elixir: 3, radius: 0,
    desc: 'A bubble shield around your base absorbs 30% of their max HP for 10s.',
    shield: 0.3, dur: 10, self: true,
  },
  sodaRocket: {
    name: 'Soda Rocket', icon: 'rocket', color: '#ff4fa3', rarity: 'epic', arena: 'factory', elixir: 6, radius: 2.2,
    desc: 'A shaken soda bottle rockets in and explodes in a sugary blast. 40% damage to towers.',
    dmg: 920, building: 0.4, season: 1,
  },
  slimeFlood: {
    name: 'Slime Flood', icon: 'flask', color: '#7cff3a', rarity: 'rare', arena: 'redlight', elixir: 3, radius: 3.6,
    desc: 'Floods an area with lab slime: enemies are slowed 55% and take damage over time.',
    slow: 0.55, dps: 46, dur: 5,
  },
  freezeRay: {
    name: 'Freeze Ray', icon: 'snow', color: '#9ff2ff', rarity: 'epic', arena: 'antarctica', elixir: 4, radius: 2.8,
    desc: 'Flash-freezes every enemy in the area for 3 seconds.',
    freeze: 3, dmg: 95,
  },

  // ---- Magic lab spells: aimed like Clash Royale spells, each a real spell
  // effect on the battlefield (buff circles, storms, time magic). Ids kept
  // stable for old saves.
  adrenaline: {
    name: 'Rage Potion', icon: 'flask', color: '#ff3d55', rarity: 'rare', arena: 'lab', elixir: 2, radius: 3.4,
    desc: 'Smash a rage potion: your troops in the area go berserk with +40% damage and +30% move & attack speed for 6s.',
    rage: 6, dmgBoost: 0.4, speedBoost: 0.3,
  },
  ironCoat: {
    name: 'Iron Skin Hex', icon: 'shield', color: '#9fb4d8', rarity: 'rare', arena: 'circle', elixir: 3, radius: 3,
    desc: 'A steel hex coats your troops in the area with a shield worth 40% of their max HP.',
    armor: 0.4,
  },
  titanSerum: {
    name: 'Titan Serum', icon: 'dna', color: '#7cff3a', rarity: 'epic', arena: 'factory', elixir: 4, radius: 2.2,
    desc: 'Mutagen rain: your troops in the area grow into TITANS for 10s - 1.4x size, +70% HP and +40% damage.',
    titan: 10, grow: 1.4, hpBoost: 0.7, dmgBoost: 0.4,
  },
  fireball: {
    name: 'Plasma Fireball', icon: 'fire', color: '#ff7a1f', rarity: 'rare', arena: 'mart', elixir: 4, radius: 2.4,
    desc: 'A blazing plasma orb crashes down: area damage, knockback and burns enemies for 3s. 35% damage to bases.',
    dmg: 520, building: 0.35, burn: 40, burnDur: 3,
  },
  lightningStorm: {
    name: 'Tesla Storm', icon: 'lightning', color: '#5fe8ff', rarity: 'epic', arena: 'redlight', elixir: 5, radius: 3.6,
    desc: 'A Tesla storm cloud strikes the 3 toughest enemies in the area with 560 damage bolts and stuns them.',
    dmg: 560, bolts: 3, stun: 0.6, building: 0.3,
  },
  overclockChip: {
    name: 'Overcharge Bolt', icon: 'bolt', color: '#ffd84a', rarity: 'epic', arena: 'antarctica', elixir: 2, radius: 0, self: true,
    desc: 'Lightning strikes your own base: for 8s its zapper fires twice as fast and your POWER fills 60% faster.',
    overclock: 8,
  },
  timeFreeze: {
    name: 'Time Warp', icon: 'clock', color: '#c99aff', rarity: 'legendary', arena: 'reactor', elixir: 4, radius: 4.5,
    desc: 'Rips open a time warp: every enemy in a huge area is frozen in time for 3s and takes 120 damage.',
    freeze: 3, dmg: 120,
  },
};
for (const [id, s] of Object.entries(SPELLS)) {
  s.id = id;
  s.kind = s.special ? 'special' : 'spell';
  s.cost = s.elixir;
  s.radius = s.radius ?? 0;
}
export const isSpecialId = (id) => !!SPELLS[id]?.special;

export const spellPower = (level) => 1 + (level - 1) * 0.1;
/** Legacy (pre-card) coin-only upgrade table; kept for old saves. */
export const SPELL_UPGRADE_COINS = [200, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000];
