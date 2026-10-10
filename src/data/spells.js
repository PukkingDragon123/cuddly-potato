// Lab spells: cast from the Lab onto a target spot on the battlefield.
export const SPELLS = {
  foodThrow: {
    name: 'Food Throw', icon: 'heart', color: '#5fdc4a', cost: 120, cd: 14, radius: 3.2,
    desc: 'A food-eating challenge! Heals your troops 35% and makes them BIGGER: +50% max HP for 8s.',
    heal: 0.35, grow: 1.35, hpBoost: 0.5, dur: 8,
  },
  moneyDrop: {
    name: '$100K Drop', icon: 'bag', color: '#ffd23f', cost: 200, cd: 18, radius: 2.6,
    desc: 'A giant $100K money bag crashes down, dealing heavy damage and knocking enemies back.',
    dmg: 320, knock: true,
  },
  slimeFlood: {
    name: 'Slime Flood', icon: 'flask', color: '#7cff3a', cost: 150, cd: 16, radius: 3.6,
    desc: 'Floods an area with lab slime. Enemies are slowed 55% and take damage over time.',
    slow: 0.55, dps: 30, dur: 5,
  },
  freezeRay: {
    name: 'Freeze Ray', icon: 'chrome', color: '#9ff2ff', cost: 170, cd: 20, radius: 2.8,
    desc: 'Flash-freezes every enemy in the area for 2.5 seconds.',
    freeze: 2.5, dmg: 60,
  },
  sodaRocket: {
    name: 'Soda Rocket', icon: 'energy', color: '#ff4fa3', cost: 240, cd: 22, radius: 2.2,
    desc: 'FOOD SEASON: a shaken soda bottle rockets in and explodes in a sugary blast.',
    dmg: 420, season: 1,
  },
  labShield: {
    name: 'Lab Shield', icon: 'shield', color: '#29b6f6', cost: 160, cd: 25, radius: 0,
    desc: 'Your Lab gets a bubble shield that absorbs 30% of its max HP for 10s.',
    shield: 0.3, dur: 10, self: true,
  },
};
for (const [id, s] of Object.entries(SPELLS)) s.id = id;

export const spellPower = (level) => 1 + (level - 1) * 0.08;
export const SPELL_UPGRADE_COINS = [200, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000];
