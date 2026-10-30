// Builds a battle side config (deck, Commander, research, Lab Level, cosmetics)
// from the player's profile. Shared by battles and the friend-battle lobby.
import { state, deployInfo, researchLevels, currentDeck, labLevel, equippedMega, lineupSize } from '../state.js';
import { COMMANDERS } from '../../data/commanders.js';
import { CMD_SKINS } from '../../data/season.js';

export function commanderCfg(id, level, skinId) {
  const c = COMMANDERS[id];
  if (!c) return null;
  const skin = skinId ? CMD_SKINS[skinId] : null;
  const override = skin ? { ...skin } : null;
  if (override) { delete override.name; delete override.commander; }
  return { id, level, char: c.char, override };
}

/** Card entry for a deck slot: { id (card), unit (what spawns), level, variant, skin }. */
export function deckEntry(id, level, extra = {}) {
  return { id, unit: id, level, variant: 'base', skin: null, ...extra };
}

export function playerSide() {
  const p = state.p;
  const slots = lineupSize();
  const deck = currentDeck().filter((id) => p.cards[id]).slice(0, slots).map((id) => {
    const d = deployInfo(id);
    return { id, unit: d.unit, level: d.level, variant: d.variant, skin: d.skin };
  });
  const cid = p.commanders.equipped;
  const cs = p.commanders.owned[cid];
  const commander = commanderCfg(cid, cs?.level ?? 1, cs?.skin);
  return {
    name: p.name, deck, commander, research: researchLevels(), labLevel: labLevel(), mega: equippedMega(),
    labStyle: p.cosmetics.labSkin === 'default' ? 'default' : p.cosmetics.labSkin,
    banner: p.cosmetics.banner, trophies: p.trophies, lineupSlots: slots,
  };
}
