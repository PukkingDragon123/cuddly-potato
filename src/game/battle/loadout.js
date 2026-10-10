// Builds a battle side config (deck, spells, Commander, perks, cosmetics)
// from the player's profile. Shared by battles and the friend-battle lobby.
import { state, deployInfo, perkBonuses } from '../state.js';
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

export function playerSide() {
  const p = state.p;
  const deck = p.deck.filter((id) => p.swarms[id]).map((id) => {
    const d = deployInfo(id);
    return { id: d.unit, baseId: id, level: d.level, variant: d.variant, skin: d.skin };
  });
  const spells = p.spells.equipped.filter((id) => p.spells.owned[id]).map((id) => ({ id, level: p.spells.owned[id].level }));
  const cid = p.commanders.equipped;
  const cs = p.commanders.owned[cid];
  const commander = commanderCfg(cid, cs?.level ?? 1, cs?.skin);
  if (commander && cid === 'recruit') commander.override = { ...(commander.override || {}) };
  return {
    name: p.name, deck, spells, commander, perks: perkBonuses(), labStyle: p.cosmetics.labSkin === 'default' ? 'default' : p.cosmetics.labSkin,
    banner: p.cosmetics.banner, trophies: p.trophies,
  };
}

