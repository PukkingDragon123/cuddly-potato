// Vials = the game's chests, modelled on the real MrBeast Lab Swarms products:
//   Test Tube  - clear tube with a coloured screw cap, a fizz tablet and a
//                dissolvable bag of Micro Beasts (add water, shake, reveal)
//   Lab Pack   - a lab-kit box holding several tubes
//   Mega Lab   - the big lab play-set box
//   Cash Case  - the briefcase-style collector case
//   Hyperchrome Tube - chrome-capped tube with boosted shiny odds
// `product` drives the 3D model used in the opening scene.
export const VIALS = {
  starter: {
    name: 'Starter Tube', product: 'testTube', time: 0, cards: 0, coins: [100, 100], rarity: 'common',
    cap: 0xff2e88, liquid: 0x7cff3a, label: 0xffffff, desc: 'Your very first Swarms test tube!',
  },
  free: {
    name: 'Free Tube', product: 'testTube', time: 0, cards: 4, coins: [20, 45], rarity: 'common',
    cap: 0x5fdc4a, liquid: 0x9ff2ff, label: 0xffffff, desc: 'A free test tube from the Lab. Comes every 4 hours.',
  },
  testTube: {
    name: 'Test Tube', product: 'testTube', time: 15 * 60, cards: 7, coins: [35, 70], rarity: 'common',
    cap: 0x29b6f6, liquid: 0x9ff2ff, label: 0xffffff, desc: 'Add water, shake and reveal Micro Beasts from your unlocked arenas.',
  },
  labPack: {
    name: 'Lab Pack', product: 'labPack', time: 60 * 60, cards: 18, coins: [120, 220], rarity: 'rare', guarantee: { rare: 2 },
    cap: 0xff8a2a, liquid: 0xb6ff3a, label: 0xff2e88, desc: 'A lab kit full of tubes. At least 2 Rare Swarms.',
  },
  snackPack: {
    name: 'Snack Pack', product: 'labPack', series: 'food', time: 45 * 60, cards: 15, coins: [100, 200], rarity: 'rare', guarantee: { rare: 2 }, season: 1,
    cap: 0xff4fa3, liquid: 0xffb84a, label: 0x1d9bf0, desc: 'FOOD SEASON: a Lab Pack stuffed with Snack Squad Swarms.',
  },
  megaLab: {
    name: 'Mega Lab Pack', product: 'megaLab', time: 3 * 3600, cards: 42, coins: [400, 750], rarity: 'epic', guarantee: { rare: 6, epic: 1 },
    cap: 0xb05cff, liquid: 0xff2e88, label: 0xffd23f, desc: 'The big lab set! Guaranteed Ultra Rare.',
  },
  hyperchrome: {
    name: 'Hyperchrome Tube', product: 'testTube', time: 2 * 3600, cards: 12, coins: [200, 350], rarity: 'epic', guarantee: { rare: 2 }, shinyBoost: 8, chrome: true,
    cap: 0xd8dde8, liquid: 0x9ff2ff, label: 0x15121f, desc: '8x shiny chance! Hunt Metallic Silver, Gold and Hyperchrome finishes.',
  },
  cashCase: {
    name: 'Cash Case', product: 'cashCase', time: 8 * 3600, cards: 70, coins: [2000, 3200], bucks: 25, rarity: 'legendary', guarantee: { rare: 10, epic: 3, legendary: 1 },
    cap: 0xffd23f, liquid: 0x6fcf5f, label: 0x15121f, desc: 'The collector briefcase: piles of cash and a guaranteed Legendary!',
  },
  crown: {
    name: 'Crown Case', product: 'cashCase', time: 0, cards: 20, coins: [250, 450], bucks: 6, rarity: 'rare', guarantee: { rare: 3 },
    cap: 0xffd23f, liquid: 0xffd23f, label: 0xff2e88, desc: 'Earn 10 crowns in battles to open it. Resets every day.',
  },
};
for (const [id, v] of Object.entries(VIALS)) v.id = id;

export const VIAL_SLOTS = 4;
export const FREE_VIAL_EVERY = 4 * 3600; // seconds
export const FREE_VIAL_MAX = 2;
export const CROWN_GOAL = 10;

/** Clash Royale-style chest cycle: the next win reward follows this loop. */
export const VIAL_CYCLE = [
  'testTube', 'testTube', 'labPack', 'testTube', 'testTube', 'testTube', 'labPack', 'testTube', 'hyperchrome', 'testTube',
  'testTube', 'labPack', 'testTube', 'megaLab', 'testTube', 'testTube', 'labPack', 'testTube', 'testTube', 'testTube',
  'labPack', 'testTube', 'testTube', 'hyperchrome', 'testTube', 'labPack', 'testTube', 'testTube', 'megaLab', 'testTube',
  'labPack', 'testTube', 'testTube', 'testTube', 'labPack', 'testTube', 'testTube', 'labPack', 'testTube', 'cashCase',
];

/** Old (v1 save) vial ids -> new products. */
export const LEGACY_VIAL = {
  lab: 'testTube', homeHorrors: 'labPack', technoTerrors: 'labPack', atomic: 'labPack', hybrids: 'labPack',
  food: 'snackPack', mega: 'megaLab', gold: 'cashCase', chrome: 'hyperchrome',
};
export const vialId = (id) => (VIALS[id] ? id : LEGACY_VIAL[id] ?? 'testTube');

/** Beast Bucks to skip remaining time (about 1 Buck per 6 minutes). */
export const skipPrice = (secLeft) => (secLeft <= 0 ? 0 : Math.max(1, Math.ceil(secLeft / 60 / 6)));
