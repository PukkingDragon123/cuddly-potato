// Road bosses: a boss blocks the Trophy Road in front of every arena gate (Beast Island:
// models/island/trophyPath.js draws its barricade, scenes/homeRoad.js the boss itself).
// Your trophies stop at its checkpoint until you beat it. Trophies won meanwhile wait in a
// small BANK that pays out the moment it falls, so a win is never wasted. The fight is a
// normal boss battle (battle mode 'boss', ui/home/boss.js) tuned to YOUR deck level when you
// start it, and it gets a little easier after every loss: always a fair, winnable fight.
// Separate from the optional arena boss challenges (BOSSES in arenas.js).
//
// Old saves need no migration: a checkpoint your best trophies already passed counts as beaten.
//
//   ROAD_BOSSES[i]   { id 'rb.<gate arena id>', gate, k (gate arena index), arena (where you fight), chapter, t, name, unit, line, reward }
//   roadBoss(id)  isRoadBoss(id)
//   roadBossState(p, rb)     'beaten' | 'fight' (reached: it blocks you) | 'ahead'
//   roadBossBeaten(p, rb)    won a fight, or your best trophies are past its checkpoint
//   blockingBoss(p)          the road boss you are stuck at, or null
//   roadCap(p)               the trophy ceiling (Infinity when no boss is ahead)
//   roadBossBattle(id, p)    the boss battle config (same shape as a BOSSES entry), tuned to p
//   BANK_MAX
import { ARENAS, TROPHY_ROAD, ghostOpponent } from './arenas.js';
import { labLevelFor } from './labs.js';
import { hashString } from '../core/util.js';

/** Trophies a blocked player can bank (about three wins). */
export const BANK_MAX = 100;

// one boss per arena gate (index = gate arena index - 1): who stands there, and its line
const CAST = [
  { unit: 'steelPanther', name: 'Bouncer Panther', line: 'Your name is not on the list. Nobody\'s name is on the list.' },
  { unit: 'ragingStopSign', name: 'Stop Sign Supreme', line: 'Knows one word. Uses it a lot.' },
  { unit: 'hardHeadPanther', name: 'Helmet Head', line: 'Wore a helmet to a chocolate factory. Respect.' },
  { unit: 'circuitShark', name: 'Checkout Shark', line: 'Bites through coupons, receipts and shields.', hpK: 1.15 },
  { unit: 'mechaMantis', name: 'Green Light Mantis', line: 'Moves on green. Also on red. Rules are for dolls.', hpK: 1.15 },
  { unit: 'frostHybrid', name: 'Brain Freeze', line: 'Every third hit freezes you solid. Bring a scarf.', hpK: 1.15 },
  { unit: 'reactorRex', name: 'Meltdown Rex', line: 'Do not let it fall near your base.' },
  { unit: 'magmaMole', name: 'Tomb Mole', line: 'Digs under every wall. Still lost.' },
  { unit: 'cyberCroc', name: 'Dock Croc', line: 'Guards the yacht. Nobody hired it.' },
  { unit: 'vineViper', name: 'Vine Queen', line: 'Roots you to the spot, then calls you slow.', hpK: 1.2 },
  { unit: 'vaultBot', name: 'Vault Bot XL', line: 'Its shield is a vault door. The vault is empty.', hpK: 0.6 },
  { unit: 'pumpkinBrute', name: 'Pumpkin King', line: 'Scares everyone off the road. Including itself.', hpK: 1.1 },
  { unit: 'sharkByte', name: 'Mega Byte', line: 'Every knockout makes it hungrier.' },
  { unit: 'ufoGrabber', name: 'Big Grabber', line: 'Wants to beam up the whole space elevator.' },
];

function build() {
  const out = [];
  for (let k = 1; k < ARENAS.length; k++) {
    const G = ARENAS[k], A = ARENAS[k - 1], C = CAST[k - 1];
    if (!C) continue;
    // the checkpoint sits between the chapter's last reward and the gate (a tidy number)
    const last = Math.max(A.trophies, ...TROPHY_ROAD.filter((m) => !m.arena && m.t < G.trophies).map((m) => m.t));
    const span = G.trophies - last, q = span >= 100 ? 50 : 10;
    let t = Math.round((last + G.trophies) / 2 / q) * q;
    if (t <= last || t >= G.trophies) t = Math.round((last + G.trophies) / 2);
    const chapter = k - 1;
    out.push({
      id: 'rb.' + G.id, gate: G.id, k, arena: A.id, chapter, t, ...C,
      reward: { coins: Math.round((200 + chapter * 150) / 50) * 50, vial: chapter < 3 ? 'testTube' : chapter < 7 ? 'labPack' : 'megaLab' },
    });
  }
  return out;
}

export const ROAD_BOSSES = build();
const BY_ID = Object.fromEntries(ROAD_BOSSES.map((b) => [b.id, b]));
export const roadBoss = (id) => BY_ID[id] ?? null;
export const isRoadBoss = (id) => !!BY_ID[id];

export function roadBossBeaten(p, rb) {
  return !!p?.roadBoss?.won?.[rb.id] || (p?.bestTrophies ?? 0) > rb.t;
}
export function roadBossState(p, rb) {
  if (roadBossBeaten(p, rb)) return 'beaten';
  return (p?.bestTrophies ?? 0) >= rb.t ? 'fight' : 'ahead';
}
export function blockingBoss(p) {
  return ROAD_BOSSES.find((rb) => roadBossState(p, rb) === 'fight') ?? null;
}
export function roadCap(p) {
  const rb = ROAD_BOSSES.find((b) => !roadBossBeaten(p, b));
  return rb ? rb.t : Infinity;
}

/** Average level of the cards in p's current deck. */
function deckLevel(p) {
  const deck = (p.decks?.[p.deckIdx] ?? []).filter((id) => p.cards?.[id]);
  if (!deck.length) return 1;
  return deck.reduce((a, id) => a + (p.cards[id].level ?? 1), 0) / deck.length;
}

/**
 * Battle config for a road boss (the BOSSES shape battle.js + ui/home/boss.js read), tuned to the
 * player right now: the boss deck plays at your deck's level, the boss swarm's HP grows with the
 * chapter and shrinks a bit after each loss (balance: scratch sim probes, ~70-100% for an average
 * AI player at matching levels).
 */
export function roadBossBattle(id, p) {
  const rb = roadBoss(id);
  if (!rb) return null;
  const level = Math.max(1, Math.min(10, Math.floor(deckLevel(p) + 0.01)));
  const ch = rb.chapter;
  const losses = Math.max(0, p?.roadBoss?.lost?.[id] ?? 0);
  const ease = 1 - 0.08 * Math.min(4, losses);
  const hp = Math.round((2200 + 1100 * (level - 1)) * 1.45 * (0.7 + 0.07 * ch) * (rb.hpK ?? 1) * ease);
  const g = ghostOpponent(rb.t, hashString(rb.id) >>> 0, rb.arena);
  const deck = g.deck.length >= 8 ? g.deck : [...g.deck, ...['panther', 'cloggedToilet', 'trashedCan', 'fryFiend', 'pizzaSlicer', 'foodThrow', 'toiletRollRipper', 'pixelPups'].filter((x) => !g.deck.includes(x))].slice(0, 8);
  return {
    id: rb.id, road: true, name: rb.name, arena: rb.arena, minTrophies: rb.t, boss: rb.unit, bossScale: 2.4,
    bossHp: hp, bossDmg: (0.85 + 0.05 * ch) * 1.15, deck, level, commander: null, desc: rb.line, reward: rb.reward,
    labLevel: labLevelFor(p?.labXp ?? 0), hpMult: 1, difficulty: Math.min(0.9, 0.35 + 0.025 * ch)
  };
}
