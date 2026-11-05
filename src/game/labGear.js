// LAB MODULES on the player's profile (src/data/labModules.js): which modules
// you built (and their levels), which one sits in each slot, which unlocks you
// have already seen. Stored in state.p.labMods (created on first use, so old
// saves get the starter modules for free).
import { state, labLevel, spendCoins } from './state.js';
import {
  MODULES, MOD_CATS, MOD_MAX, LEVEL_GATE, STARTER_MODULES, moduleCost, unlockMet,
} from '../data/labModules.js';

/** p.labMods = { owned: { id: level }, equipped: { cat: id }, seen: { id: true } } */
export function labMods() {
  const p = state.p;
  let L = p.labMods;
  if (!L || typeof L !== 'object') {
    L = p.labMods = { owned: {}, equipped: {}, seen: {} };
    for (const [cat, id] of Object.entries(STARTER_MODULES)) { L.owned[id] = 1; L.equipped[cat] = id; L.seen[id] = true; }
  }
  L.owned ??= {};
  L.equipped ??= {};
  L.seen ??= {};
  for (const [cat, id] of Object.entries(L.equipped)) if (!MODULES[id] || MODULES[id].cat !== cat || !L.owned[id]) delete L.equipped[cat];
  return L;
}

/** What the unlock rules look at. */
export function unlockProfile() {
  const p = state.p;
  return { bestTrophies: Math.max(p.bestTrophies ?? 0, p.trophies ?? 0), labLevel: labLevel(), research: p.research?.levels ?? {}, quests: p.quests ?? {} };
}

/** Everything the UI needs about one module. */
export function moduleInfo(id) {
  const m = MODULES[id];
  const L = labMods();
  const P = unlockProfile();
  const level = L.owned[id] ?? 0;
  const unlocked = level > 0 || unlockMet(m, P);
  const next = level + 1;
  const max = level >= MOD_MAX;
  const gate = max ? 0 : LEVEL_GATE[next - 1] ?? 0;
  return {
    m, level, unlocked, owned: level > 0, equipped: L.equipped[m.cat] === id, max,
    next, cost: max ? 0 : moduleCost(m, next), gate, gateOk: P.labLevel >= gate, isNew: unlocked && !L.seen[id],
    progress: unlockProgress(m, P),
  };
}
/** Progress toward a trophy / Lab Level unlock: { cur, need } or null. */
function unlockProgress(m, P) {
  const u = m.unlock;
  if (!u) return null;
  if (u.trophies) return { cur: P.bestTrophies, need: u.trophies, icon: 'trophy' };
  if (u.labLevel) return { cur: P.labLevel, need: u.labLevel, icon: 'lab' };
  return null;
}

/** Build (level 1, coins) and equip. Returns false when locked / not affordable. */
export function buildModule(id) {
  const i = moduleInfo(id);
  if (!i.unlocked || i.owned || !i.gateOk) return false;
  if (i.cost > 0 && !spendCoins(i.cost)) return false;
  const L = labMods();
  L.owned[id] = 1;
  L.equipped[i.m.cat] = id;
  L.seen[id] = true;
  state.emit('labMods');
  return true;
}
/** One level up (coins, Lab Level gate). */
export function upgradeModule(id) {
  const i = moduleInfo(id);
  if (!i.owned || i.max || !i.gateOk) return false;
  if (!spendCoins(i.cost)) return false;
  labMods().owned[id] = i.level + 1;
  state.emit('labMods');
  return true;
}
export function equipModule(id) {
  const m = MODULES[id];
  const L = labMods();
  if (!m || !L.owned[id]) return false;
  L.equipped[m.cat] = id;
  state.emit('labMods');
  return true;
}
export function markModulesSeen(cat) {
  const L = labMods();
  let n = 0;
  for (const m of Object.values(MODULES)) if ((!cat || m.cat === cat) && !L.seen[m.id] && moduleInfo(m.id).unlocked) { L.seen[m.id] = true; n++; }
  if (n) state.save();
}

/** The equipped loadout, in slot order: [{ id, level, cat }]. */
export function equippedList() {
  const L = labMods();
  const out = [];
  for (const c of MOD_CATS) {
    const id = L.equipped[c.id];
    if (id && L.owned[id]) out.push({ id, level: L.owned[id], cat: c.id });
  }
  return out;
}
/** For the battle side config: { cat: { id, level } }. */
export function equippedLoadout() {
  const out = {};
  for (const e of equippedList()) out[e.cat] = { id: e.id, level: e.level };
  return out;
}

/** Lab tab badge: freshly unlocked modules you have not looked at yet. */
export function moduleBadgeCount() {
  let n = 0;
  for (const m of Object.values(MODULES)) if (moduleInfo(m.id).isNew) n++;
  return n;
}
/** Can this equipped / built module level up right now (coins + Lab Level)? */
export function canUpgrade(id) {
  const i = moduleInfo(id);
  return i.owned && !i.max && i.gateOk && (state.p.coins ?? 0) >= i.cost;
}

// --------------------------------------------------------------------------- feature gates
// Engineer P's progression (src/game/progression.js, optional) can lock parts of the
// Lab tab until the player gets there: featureUnlocked(id) for 'labModules', 'labSkins',
// 'labCommander', 'research'; featureHint(id) says when it opens. Default: everything open.
const PROG = import.meta.glob('./progression.js', { eager: true });
const prog = Object.values(PROG)[0] ?? null;
export function featureOpen(id) {
  try { return typeof prog?.featureUnlocked === 'function' ? prog.featureUnlocked(id) !== false : true; } catch (e) { return true; }
}
export function featureHint(id) {
  try { return typeof prog?.featureHint === 'function' ? prog.featureHint(id) ?? null : null; } catch (e) { return null; }
}
