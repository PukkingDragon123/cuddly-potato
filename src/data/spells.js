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

  // ---- SPECIAL cards: lab experiments that bend the battle. Tap to play (no
  // aiming). They mix card-game tricks (DRAW, DISCARD, ECHO, COPY, EXHAUST =
  // once per battle) with battlefield effects: army buffs (SURGE = damage,
  // FRENZY = attack speed, HASTE = move speed, ARMOR = shields), GIANT troops
  // and base OVERCLOCK. Ids are kept stable for old saves.
  quickDraw: {
    name: 'Hyperdrive Draw', icon: 'cards', color: '#3ff2e0', rarity: 'common', arena: 'lab', elixir: 1, special: true,
    keywords: ['DRAW 2', 'HASTE'], desc: 'DRAW 2 cards (hand up to 6) and your army gets HASTE: +25% move speed for 6s.',
    draw: 2, haste: 6,
  },
  energyDrink: {
    name: 'Feastables Fuel', icon: 'soda', color: '#ffd23f', rarity: 'common', arena: 'lab', elixir: 0, special: true,
    keywords: ['+4 POWER', 'FRENZY', 'EXHAUST'], desc: 'Gain 4 POWER and your army goes into a FRENZY: +30% attack speed for 6s. EXHAUST: once per battle.',
    gain: 4, frenzy: 6, exhaust: true,
  },
  couponBook: {
    name: 'Black Friday Frenzy', icon: 'ticket', color: '#ff8ab4', rarity: 'rare', arena: 'circle', elixir: 1, special: true,
    keywords: ['HAND -1 COST', 'ARMOR'], desc: 'Every other card in your hand costs 1 less, and troops you deploy in the next 8s arrive with ARMOR (a shield of 25% HP).',
    discount: 1, armorWindow: 8, armor: 0.25,
  },
  trashCompactor: {
    name: 'Recycle Reactor', icon: 'trash', color: '#9be36a', rarity: 'rare', arena: 'factory', elixir: 0, special: true,
    keywords: ['DISCARD HAND', '+1 POWER EACH', 'BLAST'], desc: 'DISCARD your hand and draw a fresh one. +1 POWER per card discarded, and the reactor BLASTS enemies near your base for 90 damage per card.',
    blast: 90, radius: 4.5,
  },
  doubleUp: {
    name: 'Clone Protocol', icon: 'swords', color: '#ff7a3d', rarity: 'epic', arena: 'mart', elixir: 2, special: true,
    keywords: ['ECHO', 'CLONES +20%'], desc: 'ECHO: the next troop card you play deploys twice, and both clones get +20% HP and damage.',
    echo: 1, boost: 0.2,
  },
  copyCat: {
    name: 'Mimic Serum', icon: 'card', color: '#b48aff', rarity: 'epic', arena: 'redlight', elixir: 1, special: true,
    keywords: ['COPY', 'MUTATED +25%'], desc: 'Add a COPY of the last card you played to your hand. It costs 1 less and comes out MUTATED: +25% HP and damage. Copies vanish after use.',
    boost: 0.25,
  },
  goldenTicket: {
    name: 'Golden Ticket Jackpot', icon: 'ticket', color: '#ffd84a', rarity: 'legendary', arena: 'antarctica', elixir: 2, special: true,
    keywords: ['TUTOR', 'COST 0', 'GOLDEN +30%', 'EXHAUST'], desc: 'Draw the most expensive card left in your deck: it costs 0 and is GOLDEN (+30% HP and damage). EXHAUST.',
    exhaust: true, boost: 0.3,
  },
  adrenaline: {
    name: 'Adrenaline Injection', icon: 'flask', color: '#ff3d55', rarity: 'rare', arena: 'circle', elixir: 2, special: true,
    keywords: ['SURGE +40%'], desc: 'Your whole army on the field SURGES: +40% damage for 6s.',
    surge: 6, amt: 0.4,
  },
  ironCoat: {
    name: 'Iron Lab Coat', icon: 'shield', color: '#9fb4d8', rarity: 'rare', arena: 'factory', elixir: 2, special: true,
    keywords: ['ARMOR 35%'], desc: 'Every troop of yours on the field gets ARMOR: a shield that soaks 35% of its max HP.',
    armor: 0.35,
  },
  titanSerum: {
    name: 'Titan Serum', icon: 'dna', color: '#7cff3a', rarity: 'epic', arena: 'mart', elixir: 3, special: true,
    keywords: ['GIANT', '+80% HP', '+40% DMG'], desc: 'The next troop you play drinks it and turns GIANT: 1.5x size, +80% HP, +40% damage.',
    giant: { scale: 1.5, hp: 1.8, dmg: 1.4 },
  },
  overclockChip: {
    name: 'Overclock Chip', icon: 'bolt', color: '#5fe8ff', rarity: 'epic', arena: 'redlight', elixir: 1, special: true,
    keywords: ['BASE OVERCLOCK', 'POWER +60%'], desc: 'For 8s your base zapper fires twice as fast and your POWER fills 60% faster.',
    overclock: 8,
  },
  timeFreeze: {
    name: 'Time Stop Remote', icon: 'clock', color: '#c99aff', rarity: 'legendary', arena: 'reactor', elixir: 3, special: true,
    keywords: ['FREEZE ALL', 'EXHAUST'], desc: 'Pauses time for the enemy: EVERY enemy troop is frozen for 2.5s (bosses 1s). EXHAUST: once per battle.',
    freezeAll: 2.5, exhaust: true,
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
