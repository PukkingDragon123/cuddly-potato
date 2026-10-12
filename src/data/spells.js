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
    desc: 'A bubble shield around your Lab and turret absorbs 30% of their max HP for 10s.',
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
};
for (const [id, s] of Object.entries(SPELLS)) {
  s.id = id;
  s.kind = 'spell';
  s.cost = s.elixir;
}

export const spellPower = (level) => 1 + (level - 1) * 0.1;
/** Legacy (pre-card) coin-only upgrade table; kept for old saves. */
export const SPELL_UPGRADE_COINS = [200, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000];
