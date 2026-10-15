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

  // ---- SPECIAL cards: card-game tricks that play with your hand and your draw.
  // Tap to play (no aiming). Keywords: DRAW (pull cards from your deck into
  // your hand, up to 6), DISCARD (send cards to the back of your deck), ECHO
  // (the next troop deploys twice), COPY (a temporary card that vanishes after
  // use), EXHAUST (once per battle: it leaves your deck when played).
  quickDraw: {
    name: 'Quick Draw', icon: 'cards', color: '#3ff2e0', rarity: 'common', arena: 'lab', elixir: 1, special: true,
    keywords: ['DRAW 2'], desc: 'Draw 2 extra cards from your deck. Your hand can hold up to 6.',
    draw: 2,
  },
  energyDrink: {
    name: 'Energy Drink', icon: 'soda', color: '#ffd23f', rarity: 'common', arena: 'lab', elixir: 0, special: true,
    keywords: ['+3 POWER', 'EXHAUST'], desc: 'Gain 3 POWER right now. EXHAUST: it can only be played once per battle.',
    gain: 3, exhaust: true,
  },
  couponBook: {
    name: 'Coupon Book', icon: 'ticket', color: '#ff8ab4', rarity: 'rare', arena: 'circle', elixir: 1, special: true,
    keywords: ['HAND -1 COST'], desc: 'Every other card in your hand costs 1 less until you play it.',
    discount: 1,
  },
  trashCompactor: {
    name: 'Trash Compactor', icon: 'trash', color: '#9be36a', rarity: 'rare', arena: 'factory', elixir: 0, special: true,
    keywords: ['DISCARD HAND', '+1 POWER EACH'], desc: 'DISCARD your whole hand and draw a fresh one. Gain 1 POWER for each card discarded.',
  },
  doubleUp: {
    name: 'Double Up', icon: 'swords', color: '#ff7a3d', rarity: 'epic', arena: 'mart', elixir: 2, special: true,
    keywords: ['ECHO'], desc: 'ECHO: the next troop card you play deploys twice.',
    echo: 1,
  },
  copyCat: {
    name: 'Copy Cat', icon: 'card', color: '#b48aff', rarity: 'epic', arena: 'redlight', elixir: 1, special: true,
    keywords: ['COPY', 'DRAW'], desc: 'Add a COPY of the last card you played to your hand. It costs 1 less. Copies vanish after use.',
  },
  goldenTicket: {
    name: 'Golden Ticket', icon: 'ticket', color: '#ffd84a', rarity: 'legendary', arena: 'antarctica', elixir: 2, special: true,
    keywords: ['TUTOR', 'COST 0', 'EXHAUST'], desc: 'Draw the most expensive card left in your deck. It costs 0 POWER. EXHAUST.',
    exhaust: true,
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
