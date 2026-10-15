// Beast Island: the trophy road. Each zone is an arena (battlefield theme +
// card unlocks) inspired by a real MrBeast video, with a boss challenge,
// NPC quests and secrets on the island diorama.
import { mulberry32, hashString } from '../core/util.js';
import { ALL_CARDS, cardDef, DECK_SIZE } from './cards.js';

export const ARENAS = [
  {
    id: 'lab', name: 'Beast Lab', trophies: 0, theme: 'lab', color: '#29b6f6',
    video: 'The MrBeast Lab', desc: 'Where every Swarm is born. Bubbling tanks, robot arms and one very grumpy Tiger.',
  },
  {
    id: 'circle', name: 'Last To Leave Circle', trophies: 300, theme: 'circle', color: '#ff4a4a',
    video: 'Last To Leave Circle Wins $500,000', desc: 'A giant painted circle, a mountain of cash and nobody wants to leave.',
  },
  {
    id: 'factory', name: 'Chocolate Factory', trophies: 600, theme: 'factory', color: '#ff4fa3',
    video: "I Built Willy Wonka's Chocolate Factory!", desc: 'Chocolate rivers, lollipop trees and Feastables everywhere.',
  },
  {
    id: 'mart', name: 'Beast Mart', trophies: 1000, theme: 'mart', color: '#ffd23f',
    video: 'I Bought Everything In 5 Stores', desc: 'A megastore of groceries and gadgets. Mind the shopping carts!',
  },
  {
    id: 'redlight', name: 'Red Light Courtyard', trophies: 1400, theme: 'redlight', color: '#ff8ab4',
    video: '$456,000 Squid Game In Real Life!', desc: 'Pastel walls, a giant robot Panther doll and a red finish line.',
  },
  {
    id: 'antarctica', name: 'Antarctica Outpost', trophies: 1800, theme: 'antarctica', color: '#9ff2ff',
    video: 'I Survived 50 Hours In Antarctica', desc: 'Ice cliffs, research domes, penguins and the aurora overhead.',
  },
  {
    id: 'reactor', name: 'Atomic Reactor', trophies: 2300, theme: 'reactor', color: '#7cff3a',
    video: 'The Lab\'s Secret Reactor', desc: 'Cooling towers and glowing toxic pools. Hazmat suits recommended.',
  },
  {
    id: 'pyramid', name: 'Lost Pyramid', trophies: 2800, theme: 'pyramid', color: '#ffb84a',
    video: 'I Spent 100 Hours Inside The Pyramids!', desc: 'A sandstone pyramid guarded by a Panther sphinx and piles of gold.',
  },
  {
    id: 'island', name: 'Beast Island Paradise', trophies: 3400, theme: 'island', color: '#3ff2c8', legendary: true,
    video: 'I Gave My 100,000,000th Subscriber An Island', desc: 'The legendary arena: a private island with a villa, a yacht and a golden Panther.',
  },
  // ---- the Northern Wilds: Beast Island's new region past the Paradise summit
  {
    id: 'jungle', name: 'Lost Jungle Temple', trophies: 4000, theme: 'jungle', color: '#5fdc4a',
    video: 'I Survived 50 Hours In The Amazon Jungle', desc: 'Vine-choked temple ruins, roaring waterfalls and trees taller than the Lab.',
  },
  {
    id: 'laser', name: 'Laser Maze Vault', trophies: 4600, theme: 'laser', color: '#ff3d55',
    video: "World's Deadliest Laser Maze!", desc: 'A cliff-top vault: sweeping laser grids, cameras everywhere and safes stuffed with cash.',
  },
  {
    id: 'haunted', name: 'Haunted Mansion', trophies: 5200, theme: 'haunted', color: '#b05cff',
    video: 'Last To Leave The Haunted Mansion Wins', desc: 'A creaky mansion on a hill, a foggy graveyard, glowing pumpkins and a giant full moon.',
  },
  {
    id: 'reef', name: 'TeamSeas Reef', trophies: 5800, theme: 'reef', color: '#29e0ff',
    video: "I Cleaned The World's Dirtiest Beach #TeamSeas", desc: 'A coral reef, a rusty shipwreck and the cleanup crew hauling trash out of the sea.',
  },
  {
    id: 'volcano', name: 'Volcano Forge', trophies: 6500, theme: 'volcano', color: '#ff6a1f',
    video: 'I Built A Secret Lair Inside A Volcano', desc: 'Lava rivers, obsidian spikes and giant forge hammers pounding molten Beast gold.',
  },
  {
    id: 'space', name: 'Zero-G Space Station', trophies: 7200, theme: 'space', color: '#8f9bff', legendary: true,
    video: 'I Spent 24 Hours In Zero Gravity', desc: 'The new legendary arena: an orbital station high above the island, with Earth spinning below.',
  },
];
ARENAS.forEach((a, i) => (a.index = i));

export const arenaById = (id) => ARENAS.find((a) => a.id === id) ?? null;
/** Highest arena unlocked at a trophy count. */
export function currentArena(trophies) {
  let a = ARENAS[0];
  for (const ar of ARENAS) if (trophies >= ar.trophies) a = ar;
  return a;
}
export const arenaIndex = (trophies) => currentArena(trophies).index;
/** Trophy floor: you can't drop below the gate of an arena you've reached (except the first). */
export const trophyFloor = (best) => {
  const a = currentArena(best);
  return a.index > 0 ? a.trophies : 0;
};
/** Arena ids unlocked at a trophy count. */
export const unlockedArenas = (trophies) => ARENAS.filter((a) => trophies >= a.trophies).map((a) => a.id);
/** Card pool dropping from vials for a player with `best` trophies. */
export function cardPool(best, opts = {}) {
  const ids = new Set(unlockedArenas(best));
  return ALL_CARDS.filter((c) => ids.has(c.arena) && (opts.limited || c.rarity !== 'mythic') && (!opts.series || c.series === opts.series));
}

// Legacy helpers kept for older code paths.
export function unlockedSeries(trophies) {
  return [...new Set(cardPool(trophies).map((c) => c.series).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Trophy road (milestones). Arena gates are flagged `arena`.

export const TROPHY_ROAD = [
  // you start with only 2 troops (Panther + Clogged Toilet); the first wins unlock the rest of the squad
  { t: 10, reward: { type: 'card', id: 'fryFiend', copies: 2 } },
  { t: 30, reward: { type: 'card', id: 'foodThrow', copies: 2 } },
  { t: 50, reward: { type: 'vial', id: 'testTube' } },
  { t: 70, reward: { type: 'card', id: 'trashedCan', copies: 2 } },
  { t: 100, reward: { type: 'coins', amount: 150 } },
  { t: 130, reward: { type: 'card', id: 'pizzaSlicer', copies: 2 } },
  { t: 160, reward: { type: 'vial', id: 'labPack' } },
  { t: 190, reward: { type: 'card', id: 'toiletRollRipper', copies: 2 } },
  { t: 220, reward: { type: 'coins', amount: 400 } },
  { t: 250, reward: { type: 'card', id: 'steelPanther', copies: 1 } },
  { t: 280, reward: { type: 'card', id: 'moneyDrop', copies: 2 } },
  { t: 300, arena: 'circle', reward: { type: 'mega', id: 'panthar' } },
  { t: 360, reward: { type: 'coins', amount: 500 } },
  { t: 420, reward: { type: 'card', id: 'mutantMailbox', copies: 5 } },
  { t: 480, reward: { type: 'bucks', amount: 40 } },
  { t: 540, reward: { type: 'card', id: 'fieryPanther', copies: 1 } },
  { t: 600, arena: 'factory', reward: { type: 'vial', id: 'labPack' } },
  { t: 670, reward: { type: 'coins', amount: 700 } },
  { t: 740, reward: { type: 'card', id: 'chocoChomper', copies: 1 } },
  { t: 820, reward: { type: 'vial', id: 'megaLab' } },
  { t: 900, reward: { type: 'card', id: 'burgerBrute', copies: 5 } },
  { t: 950, reward: { type: 'bucks', amount: 60 } },
  { t: 1000, arena: 'mart', reward: { type: 'vial', id: 'labPack' } },
  { t: 1080, reward: { type: 'coins', amount: 1000 } },
  { t: 1160, reward: { type: 'card', id: 'circuitShark', copies: 5 } },
  { t: 1240, reward: { type: 'vial', id: 'hyperchrome' } },
  { t: 1320, reward: { type: 'card', id: 'hyperchargePanther', copies: 1 } },
  { t: 1400, arena: 'redlight', reward: { type: 'mega', id: 'silverByte' } },
  { t: 1500, reward: { type: 'coins', amount: 1500 } },
  { t: 1600, reward: { type: 'card', id: 'midnightPanther', copies: 5 } },
  { t: 1700, reward: { type: 'bucks', amount: 80 } },
  { t: 1800, arena: 'antarctica', reward: { type: 'vial', id: 'labPack' } },
  { t: 1900, reward: { type: 'coins', amount: 2000 } },
  { t: 2000, reward: { type: 'card', id: 'stoneHybrid', copies: 1 } },
  { t: 2100, reward: { type: 'vial', id: 'megaLab' } },
  { t: 2200, reward: { type: 'bucks', amount: 100 } },
  { t: 2300, arena: 'reactor', reward: { type: 'mega', id: 'necroClaw' } },
  { t: 2450, reward: { type: 'coins', amount: 3000 } },
  { t: 2600, reward: { type: 'card', id: 'reactorRex', copies: 1 } },
  { t: 2700, reward: { type: 'labSkin', id: 'goldVault' } },
  { t: 2800, arena: 'pyramid', reward: { type: 'vial', id: 'cashCase' } },
  { t: 3000, reward: { type: 'coins', amount: 5000 } },
  { t: 3200, reward: { type: 'card', id: 'beastTiger', copies: 1 } },
  { t: 3400, arena: 'island', reward: { type: 'mega', id: 'cyberGlitch' } },
  { t: 3600, reward: { type: 'bucks', amount: 250 } },
  { t: 3800, reward: { type: 'card', id: 'hyperFusionPanther', copies: 1 } },
  // the Northern Wilds
  { t: 4000, arena: 'jungle', reward: { type: 'vial', id: 'megaLab' } },
  { t: 4100, reward: { type: 'card', id: 'vineViper', copies: 5 } },
  { t: 4250, reward: { type: 'coins', amount: 6000 } },
  { t: 4400, reward: { type: 'card', id: 'templeGolem', copies: 1 } },
  { t: 4500, reward: { type: 'bucks', amount: 120 } },
  { t: 4600, arena: 'laser', reward: { type: 'vial', id: 'cashCase' } },
  { t: 4700, reward: { type: 'card', id: 'laserLynx', copies: 5 } },
  { t: 4850, reward: { type: 'banner', id: 'animGoldenTicket' } },
  { t: 5000, reward: { type: 'card', id: 'vaultBot', copies: 5 } },
  { t: 5100, reward: { type: 'coins', amount: 7500 } },
  { t: 5200, arena: 'haunted', reward: { type: 'vial', id: 'hyperchrome' } },
  { t: 5300, reward: { type: 'card', id: 'ghostPanther', copies: 1 } },
  { t: 5450, reward: { type: 'banner', id: 'bossSkull' } },
  { t: 5600, reward: { type: 'card', id: 'pumpkinBrute', copies: 5 } },
  { t: 5700, reward: { type: 'bucks', amount: 150 } },
  { t: 5800, arena: 'reef', reward: { type: 'vial', id: 'megaLab' } },
  { t: 5900, reward: { type: 'card', id: 'sharkByte', copies: 5 } },
  { t: 6050, reward: { type: 'coins', amount: 9000 } },
  { t: 6200, reward: { type: 'card', id: 'jellyZapper', copies: 5 } },
  { t: 6350, reward: { type: 'labSkin', id: 'martLab' } },
  { t: 6500, arena: 'volcano', reward: { type: 'vial', id: 'cashCase' } },
  { t: 6600, reward: { type: 'card', id: 'magmaTitan', copies: 1 } },
  { t: 6750, reward: { type: 'card', id: 'emberImps', copies: 5 } },
  { t: 6900, reward: { type: 'coins', amount: 12000 } },
  { t: 7050, reward: { type: 'bucks', amount: 200 } },
  { t: 7200, arena: 'space', reward: { type: 'vial', id: 'cashCase' } },
  { t: 7300, reward: { type: 'card', id: 'ufoGrabber', copies: 1 } },
  { t: 7400, reward: { type: 'banner', id: 'animStars' } },
  { t: 7500, reward: { type: 'card', id: 'astroPanther', copies: 1 } },
  { t: 7600, reward: { type: 'mega', id: 'cyberGlitch', variant: 'gold' } },
];
TROPHY_ROAD.forEach((m, i) => (m.key = 'r' + m.t, m.index = i));

// ---------------------------------------------------------------------------
// Boss challenges (one per zone). Reached from the zone on Beast Island.

export const BOSSES = {
  jimmyRematch: {
    name: 'Jimmy Rematch', arena: 'lab', minTrophies: 250, boss: null,
    deck: ['panther', 'cloggedToilet', 'trashedCan', 'pizzaSlicer', 'fryFiend', 'steelPanther', 'toiletRollRipper', 'moneyDrop'], level: 4, commander: 'jimmy',
    lab: 'mansion', desc: 'Jimmy wants a rematch and he brought his Mansion Lab. Win to recruit him as a Commander!',
    reward: { coins: 1000, bucks: 60, commander: 'jimmy' },
  },
  kingClog: {
    name: 'King Clog', arena: 'circle', minTrophies: 300, boss: 'atomicToilet', bossScale: 3.0, bossHp: 6200, bossDmg: 1.4,
    deck: ['cloggedToilet', 'toiletRollRipper', 'trashedCan', 'barfBin', 'mutantMailbox', 'badEggsperiment', 'ragingStopSign', 'foodThrow'], level: 4, commander: null,
    desc: 'A colossal toilet king refuses to leave the circle. Flush him out!', reward: { coins: 800, bucks: 40, vial: 'labPack' },
  },
  chocoKing: {
    name: 'Choco Colossus', arena: 'factory', minTrophies: 600, boss: 'chocoChomper', bossScale: 2.8, bossHp: 8000, bossDmg: 1.4,
    deck: ['fryFiend', 'pizzaSlicer', 'donutDasher', 'sodaSurge', 'burgerBrute', 'melonMauler', 'foodThrow', 'sodaRocket'], level: 5, commander: null, lab: 'chocoLab',
    desc: 'The factory\'s biggest chocolate bar came to life. It is VERY sticky.', reward: { coins: 1200, calories: 300, vial: 'megaLab' },
  },
  cartKong: {
    name: 'Cart Kong', arena: 'mart', minTrophies: 1000, boss: 'burgerBrute', bossModel: 'cartKong', bossScale: 3, bossHp: 9000, bossDmg: 1.6,
    deck: ['fryFiend', 'pizzaSlicer', 'donutDasher', 'sodaSurge', 'glitchBot', 'circuitShark', 'droneFang', 'moneyDrop'], level: 5, commander: null, lab: 'mart',
    desc: 'A giant monster made of shopping carts guards the checkout.', reward: { coins: 1500, calories: 300, vial: 'labPack' },
  },
  megaMech: {
    name: 'Red Light Robot', arena: 'redlight', minTrophies: 1400, boss: 'megaTechMech', bossScale: 2.6, bossHp: 11000, bossDmg: 1.3,
    deck: ['glitchBot', 'droneFang', 'circuitShark', 'ragingRat', 'toxicPanther', 'midnightPanther', 'vexViper', 'slimeFlood'], level: 6, commander: null,
    desc: 'RED LIGHT! The giant robot doll walked off its plinth. Don\'t let it catch you moving.', reward: { coins: 2000, bucks: 80, vial: 'megaLab' },
  },
  frostTitan: {
    name: 'Frost Titan', arena: 'antarctica', minTrophies: 1800, boss: 'stoneHybrid', bossScale: 2.6, bossHp: 13000, bossDmg: 1.2,
    deck: ['blazeHybrid', 'frostHybrid', 'midnightPanther', 'vexViper', 'droneFang', 'circuitShark', 'freezeRay', 'moneyDrop'], level: 7, commander: null,
    desc: 'A walking glacier is marching on the outpost.', reward: { coins: 2500, bucks: 100, vial: 'hyperchrome' },
  },
  tigerUnleashed: {
    name: 'Beast Tiger Unleashed', arena: 'reactor', minTrophies: 2300, boss: 'beastTiger', bossScale: 2.4, bossHp: 15000, bossDmg: 1.2,
    deck: ['atomicSlime', 'plutoniumPup', 'reactorRex', 'frostHybrid', 'toxicPanther', 'vexViper', 'slimeFlood', 'freezeRay'], level: 7, commander: null,
    desc: 'The Beast Tiger broke out of its tank! Calm it down to earn its trust.', reward: { coins: 3000, bucks: 120, card: 'beastTiger' },
  },
  pharaohViper: {
    name: 'Pharaoh Viper', arena: 'pyramid', minTrophies: 2800, boss: 'vexViper', bossScale: 3.0, bossHp: 16000, bossDmg: 1.5,
    deck: ['vexViper', 'midnightPanther', 'ragingRat', 'stoneHybrid', 'blazeHybrid', 'megaTechMech', 'slimeFlood', 'sodaRocket'], level: 8, commander: null,
    desc: 'The serpent guarding the pyramid\'s gold has awoken.', reward: { coins: 4000, bucks: 150, vial: 'cashCase' },
  },
  hyperFusion: {
    name: 'Hyper Fusion Showdown', arena: 'island', minTrophies: 3400, boss: 'hyperFusionPanther', bossScale: 2.2, bossHp: 20000, bossDmg: 1.2,
    deck: ['beastTiger', 'steelPanther', 'fieryPanther', 'hyperchargePanther', 'midnightPanther', 'toxicPanther', 'freezeRay', 'sodaRocket'], level: 9, commander: 'jimmy',
    lab: 'goldVault', desc: 'Only 1,000 exist... and one of them is guarding the island. Win the Limited Edition Panther!',
    reward: { coins: 6000, bucks: 250, card: 'hyperFusionPanther' },
  },
  // ---- the Northern Wilds
  templeGuardian: {
    name: 'Temple Guardian', arena: 'jungle', minTrophies: 4000, boss: 'templeGolem', bossScale: 2.4, bossHp: 22000, bossDmg: 1.3,
    deck: ['vineViper', 'templeGolem', 'vexViper', 'stoneHybrid', 'midnightPanther', 'emberWolf', 'slimeFlood', 'foodThrow'], level: 9, commander: 'nolan',
    desc: 'The stone guardian of the lost temple woke up covered in vines. It does not like explorers.', reward: { coins: 7000, bucks: 200, vial: 'megaLab' },
  },
  vaultWarden: {
    name: 'Vault Warden', arena: 'laser', minTrophies: 4600, boss: 'megaTechMech', bossScale: 2.8, bossHp: 24000, bossDmg: 1.4,
    deck: ['laserLynx', 'vaultBot', 'glitchBot', 'droneFang', 'circuitShark', 'voltBat', 'moneyDrop', 'freezeRay'], level: 9, commander: 'juan', lab: 'goldVault',
    desc: 'The vault\'s security mech guards a billion dollars of cash. Dodge the lasers and crack the safe!', reward: { coins: 8000, bucks: 220, vial: 'cashCase' },
  },
  headlessHollow: {
    name: 'Phantom Panther', arena: 'haunted', minTrophies: 5200, boss: 'ghostPanther', bossScale: 3.0, bossHp: 26000, bossDmg: 1.4,
    deck: ['ghostPanther', 'pumpkinBrute', 'midnightPanther', 'vexViper', 'badEggsperiment', 'mutantMop', 'slimeFlood', 'sodaRocket'], level: 10, commander: null,
    desc: 'Something huge and see-through prowls the graveyard at midnight. Who you gonna call?', reward: { coins: 9000, bucks: 240, vial: 'hyperchrome', banner: 'bossSkull' },
  },
  krakenCleanup: {
    name: 'Sludge Kraken', arena: 'reef', minTrophies: 5800, boss: 'sludgeKraken', bossScale: 2.6, bossHp: 28000, bossDmg: 1.4,
    deck: ['sharkByte', 'jellyZapper', 'circuitShark', 'cyberCroc', 'atomicSlime', 'sodaSurge', 'slimeFlood', 'freezeRay'], level: 10, commander: 'jimmy',
    desc: 'A kraken made of ocean trash is clogging the reef. Clean it up for #TeamSeas!', reward: { coins: 10000, bucks: 260, vial: 'megaLab' },
  },
  forgeTitan: {
    name: 'Forge Titan', arena: 'volcano', minTrophies: 6500, boss: 'magmaTitan', bossScale: 2.4, bossHp: 30000, bossDmg: 1.5,
    deck: ['magmaTitan', 'emberImps', 'fieryPanther', 'blazeHybrid', 'emberWolf', 'magmaMole', 'sodaRocket', 'foodThrow'], level: 10, commander: null,
    desc: 'Forged in the heart of the volcano, this molten giant hits like a falling anvil.', reward: { coins: 12000, bucks: 300, vial: 'cashCase' },
  },
  zeroGOverlord: {
    name: 'Zero-G Overlord', arena: 'space', minTrophies: 7200, boss: 'astroPanther', bossScale: 2.6, bossHp: 34000, bossDmg: 1.5,
    deck: ['astroPanther', 'ufoGrabber', 'hyperchargePanther', 'megaTechMech', 'droneFang', 'voltBat', 'freezeRay', 'sodaRocket'], level: 10, commander: 'jimmy', lab: 'goldVault',
    desc: 'The legendary Astro Panther rules the station. Beat it in zero gravity to become a Swarm legend!', reward: { coins: 15000, bucks: 400, card: 'astroPanther' },
  },
};
for (const [id, b] of Object.entries(BOSSES)) b.id = id;
export const bossOfArena = (arenaId) => Object.values(BOSSES).find((b) => b.arena === arenaId) ?? null;

// ---------------------------------------------------------------------------
// NPC quest chains (NPCs stand on their Beast Island zone).

export const QUESTS = {
  nolan1: { npc: 'nolan', title: 'Nolan Needs Backup', text: 'Win {n} battles for Nolan.', stat: 'wins', n: 2, reward: { coins: 300 } },
  nolan2: { npc: 'nolan', title: 'Lost Phone', text: "Nolan lost his phone somewhere in the Last To Leave Circle zone. Tap around to find it!", secret: 'nolanPhone', reward: { bucks: 25 } },
  nolan3: { npc: 'nolan', title: 'Panther Party', text: 'Deploy {n} Panthers.', stat: 'deploy_panther', n: 30, reward: { coins: 500 } },
  nolan4: { npc: 'nolan', title: 'Vial Hoarder', text: 'Open {n} vials.', stat: 'vialsOpened', n: 4, reward: { vial: 'labPack' } },
  nolan5: { npc: 'nolan', title: 'Belly Flop Training', text: 'Defeat the King Clog boss.', boss: 'kingClog', reward: { commander: 'nolan' } },
  juan1: { npc: 'juan', title: 'Welcome to Beast Mart', text: 'Battle {n} time in the Beast Mart arena.', stat: 'martBattles', n: 1, reward: { calories: 200 } },
  juan2: { npc: 'juan', title: 'Cart Chaos', text: 'Smash {n} shopping carts in battles.', stat: 'cartsSmashed', n: 5, reward: { bucks: 30 } },
  juan3: { npc: 'juan', title: 'Checkout Champion', text: 'Defeat Cart Kong.', boss: 'cartKong', reward: { vial: 'snackPack' } },
};
for (const [id, q] of Object.entries(QUESTS)) q.id = id;
export const QUEST_CHAINS = { nolan: ['nolan1', 'nolan2', 'nolan3', 'nolan4', 'nolan5'], juan: ['juan1', 'juan2', 'juan3'] };
export const QUEST_NPC_ZONE = { nolan: 'circle', juan: 'mart', jimmy: 'lab' };

// Secrets / easter eggs (ids tracked in profile.secrets). `zone` = where it hides on Beast Island.
export const SECRETS = {
  tigerTaps: { name: 'Tank Tapper', desc: 'Annoyed the Beast Tiger in the Lab.', reward: { bucks: 10 }, zone: 'lab' },
  coffeeMug: { name: 'Caffeine Scientist', desc: "Clicked Jimmy's coffee mug in the Lab.", reward: { coins: 50 }, zone: 'lab' },
  nolanPhone: { name: 'Found It!', desc: "Found Nolan's lost phone.", reward: { coins: 100 }, zone: 'circle' },
  goldenBar: { name: 'Golden Ticket', desc: 'Found the Golden Chocolate Bar.', reward: { vial: 'hyperchrome' }, zone: 'factory' },
  cartReturn: { name: 'Good Citizen', desc: 'Returned a shopping cart.', reward: { coins: 150 }, zone: 'mart' },
  goldPanther: { name: 'Golden Statue', desc: 'Discovered the hidden Golden Panther statue.', reward: { bucks: 25 }, zone: 'pyramid' },
  subButton: { name: 'Smash That Button', desc: 'Pressed the giant Subscribe button 10 times.', reward: { banner: 'secretSub', bucks: 15 }, zone: 'island' },
};

// ---------------------------------------------------------------------------
// Ghost opponents: AI-controlled rivals with decks/levels scaled to trophies.

const NAME_A = ['Swarm', 'Beast', 'Slime', 'Lab', 'Mega', 'Choco', 'Atomic', 'Toilet', 'Panther', 'Burger', 'Glitch', 'Turbo', 'Fizzy', 'Sneaky', 'Big', 'Lil', 'Hyper', 'Feast'];
const NAME_B = ['Lord', 'King', 'Master', 'Gamer', 'Wizard', 'Goblin', 'Chef', 'Boss', 'Ninja', 'Legend', 'Rex', 'Muncher', 'Queen', 'Hero', 'Gremlin', 'Fan', 'Pro', 'Chomp'];
const CLAN = ['Beast Squad', 'Lab Rats', 'Feastables Fam', 'Panther Pride', 'Slime Time', 'Toilet Titans', 'Circle Campers', null, null];

export function ghostOpponent(trophies, seed = Date.now(), arenaId) {
  const rng = mulberry32((seed ^ hashString(String(trophies))) >>> 0);
  const name = `${NAME_A[Math.floor(rng() * NAME_A.length)]}${NAME_B[Math.floor(rng() * NAME_B.length)]}${rng() < 0.5 ? Math.floor(rng() * 999) : ''}`;
  const arena = arenaId ? arenaById(arenaId) : currentArena(trophies);
  const pool = ALL_CARDS.filter((c) => (arenaById(c.arena)?.trophies ?? 0) <= Math.max(trophies, arena.trophies) && c.rarity !== 'mythic');
  const maxRarity = trophies < 150 ? 1 : trophies < 600 ? 2 : 3;
  const ord = { common: 0, rare: 1, epic: 2, legendary: 3 };
  const cands = pool.filter((c) => ord[c.rarity] <= maxRarity);
  const deck = [];
  const want = (f) => {
    const opts = cands.filter((c) => f(c) && !deck.includes(c.id));
    if (opts.length) deck.push(opts[Math.floor(rng() * opts.length)].id);
  };
  // lineup size grows with trophies (new rivals bring only a few Swarms, like you)
  const size = Math.min(DECK_SIZE, 4 + Math.floor(trophies / 60));
  // a sensible archetype: a cheap card, a tank, ranged support, a spell, then fill
  want((c) => c.kind === 'troop' && c.elixir <= 2);
  want((c) => c.kind === 'troop' && (c.role === 'tank' || c.role === 'siege'));
  want((c) => c.kind === 'troop' && c.role === 'ranged');
  if (size >= 5) want((c) => c.kind === 'spell' && c.id !== 'labShield');
  if (size >= 6) want((c) => c.kind === 'special');
  let guard = 0;
  while (deck.length < size && guard++ < 300) {
    const c = cands[Math.floor(rng() * cands.length)];
    if (!c || deck.includes(c.id)) continue;
    if ((c.kind === 'spell' || c.kind === 'special') && deck.filter((id) => cardDef(id)?.kind === c.kind).length >= 2) continue;
    deck.push(c.id);
  }
  const level = Math.max(1, Math.min(9, 1 + Math.floor(trophies / 400) + (trophies >= 150 && rng() < 0.4 ? 1 : 0)));
  const labLevel = Math.max(1, Math.min(12, 1 + Math.floor(trophies / 330) + (rng() < 0.3 ? 1 : 0)));
  const cmds = ['recruit', 'nolan', 'juan', 'jimmy'].filter((c, i) => trophies >= [0, 350, 250, 500][i]);
  const commander = cmds[Math.floor(rng() * cmds.length)];
  const bannerIds = ['default', 'pinkBolt', 'goldBars', 'feastBanner', 'animStars', 'animFeast'];
  return {
    name, trophies: Math.max(0, trophies + Math.floor((rng() - 0.5) * 60)), deck, level, labLevel, commander,
    clan: CLAN[Math.floor(rng() * CLAN.length)],
    banner: bannerIds[Math.floor(rng() * bannerIds.length)], difficulty: Math.min(0.95, 0.08 + trophies / 2600), ghost: true,
    // early rivals have flimsy bases so new players get satisfying wins
    hpMult: Math.min(1, 0.45 + trophies / 1800),
    // ...and slower POWER (negative surge) until ~700 trophies
    perks: { energySurge: Math.min(0, -40 + trophies / 17) },
    cmdLevel: Math.max(1, Math.min(8, Math.floor(trophies / 450) + 1)),
    // rivals past the Panthar unlock may bring a MEGA of their own
    mega: (() => {
      const ms = TROPHY_ROAD.filter((r) => r.reward?.type === 'mega' && r.t <= trophies + 200).map((r) => r.reward.id);
      if (!ms.length || rng() > Math.min(0.75, (trophies - 250) / 1200)) return null;
      return { id: ms[Math.floor(rng() * ms.length)], variant: rng() < 0.08 ? 'gold' : 'base', level: Math.max(1, labLevel) };
    })(),
  };
}

export const WIN_TROPHIES = 30;
export const LOSS_TROPHIES = 18;
