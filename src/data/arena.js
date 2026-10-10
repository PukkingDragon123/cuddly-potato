// Arena progression: trophy tiers (battlefield themes), trophy road rewards,
// bosses, quests and ghost-opponent generation.
import { mulberry32, hashString } from '../core/util.js';
import { SWARMS } from './swarms.js';

// Battlefield themes double as arenas on the trophy road.
export const ARENAS = [
  { id: 'labYard', name: 'Beast Lab Yard', trophies: 0, theme: 'lab', series: ['originals', 'homeHorrors'], color: '#29b6f6', labHp: 2400 },
  { id: 'suburb', name: 'Suburb of Horrors', trophies: 120, theme: 'suburb', series: ['homeHorrors'], color: '#ff8a2a', labHp: 3000 },
  { id: 'mansion', name: "Jimmy's Mansion", trophies: 320, theme: 'mansion', series: ['originals'], color: '#ffd23f', labHp: 3600 },
  { id: 'mart', name: 'Beast Mart', trophies: 0, theme: 'mart', series: ['food'], color: '#ff4fa3', labHp: 3200, seasonal: true },
  { id: 'techno', name: 'Techno Tower', trophies: 650, theme: 'techno', series: ['technoTerrors'], color: '#5ce1e6', labHp: 4200 },
  { id: 'reactor', name: 'Atomic Reactor', trophies: 1000, theme: 'reactor', series: ['atomic', 'hybrids'], color: '#7cff3a', labHp: 4800 },
  { id: 'factory', name: 'Chocolate Factory', trophies: 1500, theme: 'factory', series: ['food', 'originals'], color: '#8e5a3c', labHp: 5400 },
];
export const arenaById = (id) => ARENAS.find((a) => a.id === id);
export function currentArena(trophies) {
  let a = ARENAS[0];
  for (const ar of ARENAS) if (!ar.seasonal && trophies >= ar.trophies) a = ar;
  return a;
}
/** Series available in vial drop pools at a trophy count. */
export function unlockedSeries(trophies, seasonActive = true) {
  const s = new Set();
  for (const a of ARENAS) {
    if (a.seasonal && !seasonActive) continue;
    if (trophies >= a.trophies) a.series.forEach((x) => s.add(x));
  }
  return [...s];
}

export const DECK_SLOTS = [
  { trophies: 0, slots: 2 },
  { trophies: 60, slots: 3 },
  { trophies: 200, slots: 4 },
  { trophies: 450, slots: 5 },
  { trophies: 800, slots: 6 },
];
export const deckSlots = (best) => DECK_SLOTS.filter((d) => best >= d.trophies).pop().slots;
export const spellSlots = (best) => (best >= 500 ? 3 : 2);

export const TROPHY_ROAD = [
  { trophies: 30, reward: { type: 'coins', amount: 150 } },
  { trophies: 60, reward: { type: 'deckSlot' } },
  { trophies: 90, reward: { type: 'vial', id: 'lab' } },
  { trophies: 120, reward: { type: 'swarm', id: 'trashedCan' } },
  { trophies: 160, reward: { type: 'bucks', amount: 30 } },
  { trophies: 200, reward: { type: 'deckSlot' } },
  { trophies: 250, reward: { type: 'spell', id: 'slimeFlood' } },
  { trophies: 320, reward: { type: 'vial', id: 'homeHorrors' } },
  { trophies: 400, reward: { type: 'coins', amount: 600 } },
  { trophies: 450, reward: { type: 'deckSlot' } },
  { trophies: 500, reward: { type: 'spellSlot' } },
  { trophies: 560, reward: { type: 'swarm', id: 'steelPanther' } },
  { trophies: 650, reward: { type: 'vial', id: 'technoTerrors' } },
  { trophies: 750, reward: { type: 'spell', id: 'freezeRay' } },
  { trophies: 800, reward: { type: 'deckSlot' } },
  { trophies: 900, reward: { type: 'bucks', amount: 80 } },
  { trophies: 1000, reward: { type: 'vial', id: 'atomic' } },
  { trophies: 1150, reward: { type: 'spell', id: 'labShield' } },
  { trophies: 1300, reward: { type: 'vial', id: 'mega' } },
  { trophies: 1500, reward: { type: 'labSkin', id: 'goldVault' } },
  { trophies: 1800, reward: { type: 'vial', id: 'gold' } },
];

// Bosses found on the Arena map.
export const BOSSES = {
  kingClog: {
    name: 'King Clog', arena: 'suburb', minTrophies: 60, boss: 'atomicToilet', bossScale: 3.2, bossHp: 5200, bossDmg: 2.2,
    deck: ['cloggedToilet', 'toiletRollRipper', 'trashedCan', 'barfBin'], level: 3, commander: null,
    desc: 'A colossal toilet king flushing waves of sludge.', reward: { coins: 600, bucks: 40, vial: 'homeHorrors' },
  },
  jimmyRematch: {
    name: 'Jimmy Rematch', arena: 'mansion', minTrophies: 250, boss: null,
    deck: ['panther', 'cloggedToilet', 'ragingStopSign', 'mutantMailbox', 'trashedCan', 'steelPanther'], level: 5, commander: 'jimmy',
    lab: 'mansion', desc: 'Jimmy wants a rematch in his Mansion. Win to recruit him as a Commander!',
    reward: { coins: 1000, bucks: 60, commander: 'jimmy' },
  },
  cartKong: {
    name: 'Cart Kong', arena: 'mart', minTrophies: 0, boss: 'burgerBrute', bossModel: 'cartKong', bossScale: 3, bossHp: 6000, bossDmg: 2.4,
    deck: ['fryFiend', 'pizzaSlicer', 'donutDasher', 'sodaSurge'], level: 3, commander: null, lab: 'mart',
    desc: 'A giant monster made of shopping carts guards the checkout.', reward: { coins: 800, calories: 300, vial: 'food' },
  },
  megaMech: {
    name: 'Mega Mech Prime', arena: 'techno', minTrophies: 600, boss: 'megaTechMech', bossScale: 2.6, bossHp: 9000, bossDmg: 2,
    deck: ['glitchBot', 'droneFang', 'circuitShark'], level: 6, commander: null,
    desc: 'The ultimate Mega-Tech war machine.', reward: { coins: 1500, bucks: 80, vial: 'technoTerrors' },
  },
  tigerUnleashed: {
    name: 'Beast Tiger Unleashed', arena: 'reactor', minTrophies: 950, boss: 'beastTiger', bossScale: 2.4, bossHp: 12000, bossDmg: 1.8,
    deck: ['atomicSlime', 'plutoniumPup', 'reactorRex', 'frostHybrid'], level: 7, commander: null,
    desc: 'The Beast Tiger broke out of its tank! Calm it down to earn its trust.',
    reward: { coins: 2500, bucks: 120, swarm: 'beastTiger' },
  },
};
for (const [id, b] of Object.entries(BOSSES)) b.id = id;

// Quests given by NPCs on the map.
export const QUESTS = {
  nolan1: { npc: 'nolan', title: 'Nolan Needs Backup', text: 'Win {n} battles for Nolan.', stat: 'wins', n: 2, reward: { coins: 300 } },
  nolan2: { npc: 'nolan', title: 'Lost Phone', text: "Find Nolan's phone somewhere in the Suburb of Horrors.", secret: 'nolanPhone', reward: { bucks: 25 } },
  nolan3: { npc: 'nolan', title: 'Panther Party', text: 'Deploy {n} Panthers.', stat: 'deploy_panther', n: 30, reward: { coins: 500 } },
  nolan4: { npc: 'nolan', title: 'Vial Hoarder', text: 'Open {n} vials.', stat: 'vialsOpened', n: 4, reward: { vial: 'homeHorrors' } },
  nolan5: { npc: 'nolan', title: 'Belly Flop Training', text: 'Defeat King Clog.', boss: 'kingClog', reward: { commander: 'nolan' } },
  juan1: { npc: 'juan', title: 'Welcome to Beast Mart', text: 'Battle {n} times at Beast Mart.', stat: 'martBattles', n: 1, reward: { calories: 200 } },
  juan2: { npc: 'juan', title: 'Cart Chaos', text: 'Smash {n} shopping carts on the map or in battle.', stat: 'cartsSmashed', n: 5, reward: { bucks: 30 } },
  juan3: { npc: 'juan', title: 'Checkout Champion', text: 'Defeat Cart Kong.', boss: 'cartKong', reward: { vial: 'food' } },
};
for (const [id, q] of Object.entries(QUESTS)) q.id = id;
export const QUEST_CHAINS = { nolan: ['nolan1', 'nolan2', 'nolan3', 'nolan4', 'nolan5'], juan: ['juan1', 'juan2', 'juan3'] };

// Secrets / easter eggs (ids tracked in profile.secrets).
export const SECRETS = {
  tigerTaps: { name: 'Tank Tapper', desc: 'Annoyed the Beast Tiger.', reward: { bucks: 10 } },
  goldenBar: { name: 'Golden Ticket', desc: 'Found the Golden Chocolate Bar in Beast Mart.', reward: { vial: 'chrome' } },
  subButton: { name: 'Smash That Button', desc: 'Pressed the giant Subscribe button 10 times.', reward: { banner: 'secretSub', bucks: 15 } },
  nolanPhone: { name: 'Found It!', desc: "Found Nolan's lost phone.", reward: { coins: 100 } },
  goldPanther: { name: 'Golden Statue', desc: 'Discovered the hidden Golden Panther statue.', reward: { bucks: 25 } },
  cartReturn: { name: 'Good Citizen', desc: 'Returned a shopping cart.', reward: { coins: 150 } },
  coffeeMug: { name: 'Caffeine Scientist', desc: "Clicked Jimmy's coffee mug.", reward: { coins: 50 } },
};

// ---------------------------------------------------------------------------
// Ghost opponents ("players") - AI-controlled decks scaled to trophies.

const NAME_A = ['Swarm', 'Beast', 'Slime', 'Lab', 'Mega', 'Choco', 'Atomic', 'Toilet', 'Panther', 'Burger', 'Glitch', 'Turbo', 'Fizzy', 'Sneaky', 'Big', 'Lil'];
const NAME_B = ['Lord', 'King', 'Master', 'Gamer', 'Wizard', 'Goblin', 'Chef', 'Boss', 'Ninja', 'Legend', 'Rex', 'Muncher', 'Queen', 'Hero', 'Gremlin', 'Fan'];

export function ghostOpponent(trophies, seed = Date.now(), arenaId) {
  const rng = mulberry32(seed ^ hashString(String(trophies)));
  const name = `${NAME_A[Math.floor(rng() * NAME_A.length)]}${NAME_B[Math.floor(rng() * NAME_B.length)]}${rng() < 0.5 ? Math.floor(rng() * 999) : ''}`;
  const arena = arenaId ? arenaById(arenaId) : currentArena(trophies);
  const pool = Object.values(SWARMS).filter((s) => !s.hidden && !s.isMega && s.rarity !== 'mythic');
  const maxRarity = trophies < 150 ? 1 : trophies < 500 ? 2 : 3;
  const ord = { common: 0, rare: 1, epic: 2, legendary: 3 };
  const prefer = new Set(arena.series);
  const candidates = pool.filter((s) => ord[s.rarity] <= maxRarity);
  const slots = deckSlots(trophies);
  const deck = [];
  const cheap = candidates.filter((s) => s.cost <= 100);
  deck.push(cheap[Math.floor(rng() * cheap.length)].id);
  let guard = 0;
  while (deck.length < slots && guard++ < 200) {
    const s = candidates[Math.floor(rng() * candidates.length)];
    if (deck.includes(s.id)) continue;
    if (!prefer.has(s.series) && rng() < 0.5) continue;
    deck.push(s.id);
  }
  const level = Math.max(1, Math.min(9, 1 + Math.floor(trophies / 220) + (rng() < 0.4 ? 1 : 0)));
  const cmds = ['recruit', 'nolan', 'juan', 'jimmy'].filter((c, i) => trophies >= [0, 150, 0, 400][i]);
  const commander = cmds[Math.floor(rng() * cmds.length)];
  const spells = ['foodThrow', 'moneyDrop', 'slimeFlood', 'freezeRay'].slice(0, trophies < 200 ? 1 : 2);
  const bannerIds = ['default', 'pinkBolt', 'goldBars', 'feastBanner', 'animStars', 'animFeast'];
  return {
    name, trophies: Math.max(0, trophies + Math.floor((rng() - 0.5) * 60)), deck, level, commander, spells,
    banner: bannerIds[Math.floor(rng() * bannerIds.length)], difficulty: Math.min(1, 0.35 + trophies / 2000), ghost: true,
    cmdLevel: Math.max(1, Math.min(8, Math.floor(trophies / 250) + 1)),
  };
}

export const WIN_TROPHIES = 30;
export const LOSS_TROPHIES = 15;
