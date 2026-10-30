// Commanders sit on top of your Lab. Each has an ULTIMATE (`signature`): a
// game-changing ability charged ONLY by the POWER your side generates and the
// damage your base takes (`charge` = POWER worth of a full meter, see
// BattleSim.addSigCharge), played as a full cinematic (sigCutscene.js); plus
// unique skills unlocked by level. (The old rollable perk slots became the
// Lab's research tree: src/data/research.js.) `cry` is the line the Commander
// says (voiced) in the ultimate's cutscene.

export const COMMANDERS = {
  recruit: {
    name: 'Lab Recruit', char: 'recruit', season: 0,
    desc: 'You! Fresh out of Beast Lab training and ready to experiment.',
    signature: {
      id: 'mutantUprising', name: 'Mutant Uprising', cry: "Drink up, team. Doctor's orders.", charge: 72, icon: 'flask', color: '#7cff3a',
      desc: "Smashes a vat of MEGA serum over your side. Every troop you have turns giant for 14s (full heal, double HP, +40% damage, +30% speed) and 3 free squads of your strongest troops burst out of your base.",
      dur: 14, hp: 1, scale: 1.5, spawn: 3,
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
      id: 'beastBuyout', name: 'Beast Buyout', cry: "Switch sides. I'll pay double.", charge: 84, icon: 'bag', color: '#ffd84a',
      desc: "Jimmy buys the 3 strongest enemy troops: they switch to your side, fully healed. If there aren't 3 to buy, he hires the rest from the rival's deck. Every other enemy is stunned for 3s by falling cash and takes damage, and you get +6 POWER.",
      buy: 3, dmg: 240, stun: 3, energy: 6,
    },
    skills: [
      { id: 'lastToLeave', level: 3, name: 'Unbreakable Circle', cd: 35, icon: 'shield', desc: 'For 4s your troops cannot drop below 1 HP.', dur: 4 },
      { id: 'subscribeSmash', level: 5, name: 'Subscribe Meteor', cd: 30, icon: 'play', desc: 'A giant red SUBSCRIBE button slams down and flattens everything under it.', dmg: 720, radius: 2.4 },
    ],
    unlock: 'boss:jimmyRematch',
  },
  nolan: {
    name: 'Nolan', char: 'nolan', season: 0,
    desc: 'Always the fall guy. Somehow that works out for you.',
    signature: {
      id: 'orbitalFlop', name: 'Orbital Belly Flop', cry: "Hold my soda.", charge: 76, icon: 'energy', color: '#3fb8ff',
      desc: "Nolan rides a soda rocket into orbit and belly flops onto the biggest enemy crowd: 1200 damage and a 2.5s stun in a wide blast (half damage to a base in range). The quake hits every other enemy for 320 with a 1.5s stun, cracks the rival base for 350 and leaves a burning crater that slows enemies 55% for 10s.",
      dmg: 1200, radius: 4.2, stun: 2.5, quake: 320, crater: 10, slow: 0.55, burn: 70, building: 0.5, quakeStun: 1.5, baseDmg: 350,
    },
    skills: [
      { id: 'complain', level: 3, name: 'Rage Shout', cd: 24, icon: 'quest', desc: 'Enemies near the front are annoyed: -45% speed for 5s.', slow: 0.45, dur: 5 },
      { id: 'luckyFail', level: 5, name: 'Chaos Spill', cd: 30, icon: 'star', desc: 'Nolan trips and spills a vial: spawns 3 free random troops from your deck.', count: 3 },
    ],
    unlock: 'quest:nolanChain',
  },
  juan: {
    name: 'Juan', char: 'juan', season: 1,
    desc: 'FOOD SEASON Commander. Brings the whistle, the ball and the party.',
    signature: {
      id: 'tiempoMuerto', name: 'Tiempo Muerto', cry: "Tiempo. Nobody moves.", charge: 80, icon: 'clock', color: '#ff8a2a',
      desc: "Juan blows the final whistle and time stops for the rival for 7s. Their troops (even new ones) and base freeze in amber and their POWER stops, while yours charges twice as fast and your army moves 25% faster. When time restarts, every frozen enemy loses 40% of its max HP and the rival base loses 10%.",
      dur: 7, shatter: 0.4, baseShatter: 0.1,
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

// Level rewards shown on the Commander screen.
export const CMD_LEVEL_REWARDS = {
  2: { text: '+7% ability power', coins: 200 },
  3: { text: 'Unlocks Skill #1', skill: 0 },
  4: { text: '20 Beast Bucks', bucks: 20 },
  5: { text: 'Unlocks Skill #2', skill: 1 },
  6: { text: 'Gold banner', banner: 'goldBars', coins: 600 },
  7: { text: '+ability power', bucks: 40 },
  8: { text: '1,000 Beast Coins', coins: 1000 },
  9: { text: 'Animated banner', banner: 'animStars' },
  10: { text: 'Golden outfit', skin: 'gold', bucks: 100 },
};

// Legacy perk ids: perks were replaced by the research tree (src/data/research.js).
// Only the parked online lobby (src/net/lobby.js) still reads these keys.
export const PERKS = {
  energySurge: { name: 'Power Surge' }, thickWalls: { name: 'Thick Walls' }, quickHands: { name: 'Turret Boost' },
  hypeMan: { name: 'Hype Man' }, bargain: { name: 'Bargain Hunter' }, armorUp: { name: 'Lab Coat Armor' },
  sharpTeeth: { name: 'Sharp Teeth' }, spellSlinger: { name: 'Spell Slinger' }, coinMagnet: { name: 'Coin Magnet' }, headStart: { name: 'Head Start' },
};
