// Vial (blind-box) definitions inspired by the toy tubes.
export const VIALS = {
  starter: {
    name: 'Starter Vial', series: null, time: 0, cards: 0, coins: [100, 100], rarity: 'common',
    cap: 0xff7b29, liquid: 0x7cff3a, label: 0xffd23f, desc: 'Your very first vial!',
  },
  lab: {
    name: 'Lab Vial', series: null, time: 5 * 60, cards: 3, coins: [40, 90], rarity: 'common',
    cap: 0xff7b29, liquid: 0x6fe3ff, label: 0xffd23f, desc: '3 random Swarms from your unlocked arenas.',
  },
  homeHorrors: {
    name: 'Home Horrors Vial', series: 'homeHorrors', time: 30 * 60, cards: 5, coins: [80, 160], minRarity: 'rare', rarity: 'rare',
    cap: 0xff8a2a, liquid: 0xb6ff3a, label: 0xff4a4a, desc: '5 Home Horrors Swarms. At least 1 Rare!',
  },
  technoTerrors: {
    name: 'Techno Terrors Vial', series: 'technoTerrors', time: 45 * 60, cards: 5, coins: [90, 180], minRarity: 'rare', rarity: 'rare',
    cap: 0x5ce1e6, liquid: 0x4a7dff, label: 0x222244, desc: '5 Techno Terrors Swarms. At least 1 Rare!',
  },
  atomic: {
    name: 'Atomic Vial', series: 'atomic', time: 45 * 60, cards: 5, coins: [90, 180], minRarity: 'rare', rarity: 'rare',
    cap: 0x2a2a2a, liquid: 0x7cff3a, label: 0xffd23f, glow: true, desc: 'Glow-in-the-dark Atomic Swarms.',
  },
  hybrids: {
    name: 'Hybrid Vial', series: 'hybrids', time: 60 * 60, cards: 5, coins: [100, 200], minRarity: 'rare', rarity: 'rare',
    cap: 0xff5a1f, liquid: 0x9ff2ff, label: 0x7a5a4a, desc: 'Fire, ice and stone fusions.',
  },
  food: {
    name: 'Feast Vial', series: 'food', time: 40 * 60, cards: 5, coins: [100, 200], minRarity: 'rare', rarity: 'rare', season: 1,
    cap: 0xff4fa3, liquid: 0xffb84a, label: 0x1d9bf0, desc: 'FOOD SEASON exclusive Food Fighters!',
  },
  mega: {
    name: 'Mega Vial', series: null, time: 3 * 3600, cards: 10, coins: [300, 600], minRarity: 'epic', rarity: 'epic',
    cap: 0xb05cff, liquid: 0xff2e88, label: 0xffd23f, desc: '10 Swarms with a guaranteed Ultra Rare.',
  },
  gold: {
    name: 'Gold Vial', series: null, time: 8 * 3600, cards: 14, coins: [800, 1500], minRarity: 'legendary', rarity: 'legendary', shinyBoost: 2,
    cap: 0xffd23f, liquid: 0xfff27a, label: 0x111111, desc: '14 Swarms with a guaranteed Legendary!',
  },
  chrome: {
    name: 'Chrome Vial', series: null, time: 2 * 3600, cards: 6, coins: [200, 400], minRarity: 'rare', rarity: 'epic', shinyBoost: 8,
    cap: 0xc8ccd8, liquid: 0x9ff2ff, label: 0xffffff, chrome: true, desc: '8x shiny chance! Hunt Chrome, Silver and Gold variants.',
  },
};
for (const [id, v] of Object.entries(VIALS)) v.id = id;

export const VIAL_SLOTS = 4;
/** Beast Bucks to skip remaining time. */
export const skipPrice = (secLeft) => (secLeft <= 0 ? 0 : Math.max(1, Math.ceil(secLeft / 60 / 6)));
