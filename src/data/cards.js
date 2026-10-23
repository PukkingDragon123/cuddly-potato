// Unified card catalogue: troop cards (Swarms) + spell cards share levels,
// copies, rarity and the 8-card deck, exactly like Clash Royale. SPECIAL cards
// (hand / draw tricks) live in SPELLS with `special: true`.
import { SWARMS, COLLECTABLE, RARITIES, UPGRADE, UPGRADE_XP, MAX_LEVEL } from './swarms.js';
import { SPELLS } from './spells.js';

export const CARDS = {};
for (const s of COLLECTABLE) CARDS[s.id] = s;
for (const s of Object.values(SPELLS)) CARDS[s.id] = s;
export const ALL_CARDS = Object.values(CARDS);

export const cardDef = (id) => CARDS[id] ?? SWARMS[id] ?? SPELLS[id] ?? null;
export const isSpell = (id) => !!SPELLS[id];
export const cardElixir = (id) => cardDef(id)?.elixir ?? 3;
export const rarityOf = (id) => RARITIES[cardDef(id)?.rarity ?? 'common'];
export const isSpecial = (id) => !!SPELLS[id]?.special;
// Clash Royale deck: 8 cards cycling through a hand of 4 (+ the NEXT card)
export const DECK_SIZE = 8;
// full 8-card deck from the very first battle, like Clash Royale
export const LINEUP_UNLOCKS = [0, 0, 0, 0, 0, 0, 0, 0];
export const lineupSlots = (bestTrophies = 0) => LINEUP_UNLOCKS.filter((t) => bestTrophies >= t).length;
export const DECK_PRESETS = 3;
export { MAX_LEVEL, UPGRADE, UPGRADE_XP, RARITIES };

/** Average elixir of a deck (array of ids). */
export function avgElixir(deck) {
  const ids = deck.filter(Boolean);
  if (!ids.length) return 0;
  return ids.reduce((a, id) => a + cardElixir(id), 0) / ids.length;
}

/** Cards that unlock in a given arena id. */
export const cardsOfArena = (arenaId) => ALL_CARDS.filter((c) => c.arena === arenaId);

/** Starter deck given after the tutorial (all Beast Lab cards). */
export const STARTER_DECK = ['panther', 'cloggedToilet', 'toiletRollRipper', 'trashedCan', 'pizzaSlicer', 'fryFiend', 'foodThrow', 'moneyDrop'];
// every Commander starts with just two troops (like the Cat and the Tank Cat); the rest unlock as you play
export const STARTER_TROOPS = ['panther', 'cloggedToilet'];
// the whole Beast Lab starter deck: a full 8 cards from the start
export const STARTER_CARDS = STARTER_DECK;
