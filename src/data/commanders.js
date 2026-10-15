// Commanders sit on top of your Lab. Each has a charged signature ability,
// unique skills unlocked by level, and rollable perk slots.

export const COMMANDERS = {
  recruit: {
    name: 'Lab Recruit', char: 'recruit', season: 0,
    desc: 'You! Fresh out of Beast Lab training and ready to experiment.',
    signature: {
      id: 'beakerBarrage', name: 'Acid Rain Barrage', charge: 26, icon: 'flask',
      desc: 'Hurls 5 bubbling beakers at the front line. Each splashes acid for area damage.',
      dmg: 210, count: 5, radius: 1.6,
    },
    skills: [
      { id: 'labRally', level: 3, name: 'Overclock Surge', cd: 22, icon: 'speed', desc: 'Your troops gain +30% speed and attack speed for 6s.', amt: 0.3, dur: 6 },
      { id: 'emergencyRepair', level: 6, name: 'Nano Rebuild', cd: 40, icon: 'gear', desc: 'Repairs 18% of your Lab HP.', heal: 0.18 },
    ],
    unlock: 'starter',
  },
  jimmy: {
    name: 'Jimmy', char: 'jimmy', season: 0,
    desc: 'The Beast himself. Defeat him in his Mansion rematch to recruit him.',
    signature: {
      id: 'megaGiveaway', name: 'Million Dollar Storm', charge: 32, icon: 'bag',
      desc: 'Cash rains over the whole battlefield! Enemies get distracted (stunned 1.6s), take damage, and you gain +3 energy.',
      dmg: 260, stun: 1.6, energy: 3,
    },
    skills: [
      { id: 'lastToLeave', level: 3, name: 'Unbreakable Circle', cd: 35, icon: 'shield', desc: 'For 4s your troops cannot drop below 1 HP.', dur: 4 },
      { id: 'subscribeSmash', level: 5, name: 'Subscribe Meteor', cd: 30, icon: 'play', desc: 'A giant red SUBSCRIBE button slams down for massive area damage.', dmg: 720, radius: 2.4 },
    ],
    unlock: 'boss:jimmyRematch',
  },
  nolan: {
    name: 'Nolan', char: 'nolan', season: 0,
    desc: 'Always the fall guy. Somehow that works in your favour.',
    signature: {
      id: 'bellyFlop', name: 'Seismic Belly Flop', charge: 28, icon: 'energy',
      desc: 'Nolan cannonballs off the Lab onto the front line: shockwave damage + 2s stun.',
      dmg: 560, stun: 2, radius: 2.4,
    },
    skills: [
      { id: 'complain', level: 3, name: 'Rage Shout', cd: 24, icon: 'quest', desc: 'Enemies near the front are annoyed: -45% speed for 5s.', slow: 0.45, dur: 5 },
      { id: 'luckyFail', level: 5, name: 'Chaos Spill', cd: 30, icon: 'star', desc: 'Nolan trips and spills a vial: spawns 3 free random troops from your deck.', count: 3 },
    ],
    unlock: 'quest:nolanChain',
  },
  juan: {
    name: 'Juan', char: 'juan', season: 1,
    desc: 'FOOD SEASON Commander. Brings the truck, the ball and the party.',
    signature: {
      id: 'juansTruck', name: 'Monster Truck Rampage', charge: 30, icon: 'truck',
      desc: "Juan's truck rampages across the battlefield, damaging and knocking back everything it hits, then crashes into the enemy Lab.",
      dmg: 460, labDmg: 420,
    },
    skills: [
      { id: 'footballKick', level: 3, name: 'Meteor Kick', cd: 20, icon: 'ball', desc: 'Juan kicks a ball straight through ALL enemies in a line for heavy damage.', dmg: 620 },
      { id: 'juanDance', level: 5, name: 'Victory Parade', cd: 45, icon: 'music', desc: 'A parade begins! Troops join the dance: army gets +50% damage, +35% speed & attack speed and heals 25% for 8s.', dmg: 0.5, speed: 0.35, heal: 0.25, dur: 8 },
    ],
    unlock: 'season:juan',
  },
};
for (const [id, c] of Object.entries(COMMANDERS)) c.id = id;

export const CMD_MAX_LEVEL = 10;
export const cmdXpForLevel = (lvl) => 100 + (lvl - 1) * 90; // xp needed to go from lvl -> lvl+1
export const cmdPower = (lvl) => 1 + (lvl - 1) * 0.07;
export const perkSlotsForLevel = (lvl) => (lvl >= 8 ? 3 : lvl >= 4 ? 2 : 1);

// Level rewards shown on the Commander screen.
export const CMD_LEVEL_REWARDS = {
  2: { text: '+7% ability power', coins: 200 },
  3: { text: 'Unlocks Skill #1', skill: 0 },
  4: { text: '2nd Perk slot', bucks: 20 },
  5: { text: 'Unlocks Skill #2', skill: 1 },
  6: { text: 'Gold banner', banner: 'goldBars', coins: 600 },
  7: { text: '+ability power', bucks: 40 },
  8: { text: '3rd Perk slot', coins: 1000 },
  9: { text: 'Animated banner', banner: 'animStars' },
  10: { text: 'Golden outfit', skin: 'gold', bucks: 100 },
};

// Rollable perk pool. value range per tier.
export const PERKS = {
  energySurge: { name: 'Energy Surge', desc: '+{v}% energy regen', range: [5, 18], icon: 'energy' },
  thickWalls: { name: 'Thick Walls', desc: '+{v}% Lab HP', range: [8, 28], icon: 'shield' },
  quickHands: { name: 'Turret Boost', desc: 'Guard turret deals +{v}% damage', range: [6, 20], icon: 'tower' },
  hypeMan: { name: 'Hype Man', desc: 'Signature charges {v}% faster', range: [10, 32], icon: 'star' },
  bargain: { name: 'Bargain Hunter', desc: '{v}% chance a deploy refunds 1 energy', range: [5, 20], icon: 'energy' },
  armorUp: { name: 'Lab Coat Armor', desc: 'Troops take {v}% less damage', range: [3, 11], icon: 'shield' },
  sharpTeeth: { name: 'Sharp Teeth', desc: 'Troops deal +{v}% damage', range: [4, 13], icon: 'sword' },
  spellSlinger: { name: 'Spell Slinger', desc: 'Spell cooldowns -{v}%', range: [8, 22], icon: 'magic' },
  coinMagnet: { name: 'Coin Magnet', desc: '+{v}% coins from battles', range: [10, 35], icon: 'coin' },
  headStart: { name: 'Head Start', desc: 'Start battles with +{v} energy', range: [1, 3], icon: 'energy' },
};
for (const [id, p] of Object.entries(PERKS)) p.id = id;

export const PERK_TIERS = [
  { id: 'common', name: 'Common', weight: 55, t: [0, 0.35] },
  { id: 'rare', name: 'Rare', weight: 30, t: [0.3, 0.6] },
  { id: 'epic', name: 'Ultra Rare', weight: 12, t: [0.55, 0.85] },
  { id: 'legendary', name: 'Legendary', weight: 3, t: [0.85, 1] },
];
export const PERK_ROLL_COST = 250;

export function rollPerk(rng = Math.random) {
  const ids = Object.keys(PERKS);
  const id = ids[Math.floor(rng() * ids.length)];
  let total = 0;
  for (const t of PERK_TIERS) total += t.weight;
  let r = rng() * total;
  let tier = PERK_TIERS[0];
  for (const t of PERK_TIERS) {
    r -= t.weight;
    if (r <= 0) { tier = t; break; }
  }
  const p = PERKS[id];
  const k = tier.t[0] + rng() * (tier.t[1] - tier.t[0]);
  const v = Math.round(p.range[0] + (p.range[1] - p.range[0]) * k);
  return { id, tier: tier.id, v };
}
export function perkText(perk) {
  if (!perk) return '';
  return PERKS[perk.id].desc.replace('{v}', perk.v);
}
