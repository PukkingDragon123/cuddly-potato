// Player profile, persistence and every economy operation.
// Profile v2: Clash Royale-style loop (cards with levels/copies, 8-card decks,
// Lab Level XP, vial slots + cycle + free/crown vials, trophy road, arenas).
import { SWARMS, VARIANTS, MAX_LEVEL } from '../data/swarms.js';
import { SPELLS } from '../data/spells.js';
import { CARDS, cardDef, isSpell, DECK_SIZE, DECK_PRESETS, STARTER_DECK, UPGRADE, UPGRADE_XP } from '../data/cards.js';
import { COMMANDERS, cmdXpForLevel, CMD_MAX_LEVEL, CMD_LEVEL_REWARDS, rollPerk, PERK_ROLL_COST, perkSlotsForLevel } from '../data/commanders.js';
import { VIALS, VIAL_SLOTS, VIAL_CYCLE, FREE_VIAL_EVERY, FREE_VIAL_MAX, CROWN_GOAL, skipPrice, vialId } from '../data/vials.js';
import { PASS_TIERS, SEASON, tierForCalories, SEASON_CHALLENGES, BANNERS, SWARM_SKINS } from '../data/season.js';
import {
  ARENAS, arenaById, currentArena, cardPool, trophyFloor, TROPHY_ROAD, QUESTS, QUEST_CHAINS, SECRETS, BOSSES,
} from '../data/arenas.js';
import { labLevelFor, LAB_XP, LAB_MAX_LEVEL, LAB_LEVEL_REWARDS } from '../data/labs.js';
import { mulberry32, hashString, todayKey, randInt } from '../core/util.js';

const KEY = 'mbswarmers.save.v1';

function newCard() {
  return { level: 1, copies: 0, variants: { base: true }, variant: 'base', skin: null, mega: false, found: Date.now() };
}

function defaultProfile() {
  return {
    v: 2,
    created: Date.now(),
    name: 'Recruit',
    tutorial: 'start',
    coins: 0,
    bucks: 20,
    trophies: 0,
    bestTrophies: 0,
    calories: 0,
    labXp: 0,
    cards: {},
    decks: [[], [], []],
    deckIdx: 0,
    commanders: { owned: { recruit: { level: 1, xp: 0, perks: [null, null, null], skin: null } }, equipped: 'recruit' },
    megaUnlocked: {},
    vials: { slots: Array(VIAL_SLOTS).fill(null), storage: [], cycle: 0, freeNext: 0, freeStock: 1, crowns: 0, crownDay: '', crownClaimed: false },
    shop: { day: '', bought: {}, freeClaimed: false },
    pass: { premium: false, free: {}, premium_: {} },
    challenges: { day: '', ids: [], base: {}, claimed: {} },
    quests: { nolan: { idx: 0, base: null, done: false }, juan: { idx: 0, base: null, done: false } },
    trophyRoad: {},
    arenaSeen: 0,
    bosses: {},
    secrets: {},
    cosmetics: { banners: ['default'], banner: 'default', labSkins: ['default'], labSkin: 'default', swarmSkins: {}, cmdSkins: {} },
    stats: {
      wins: 0, losses: 0, draws: 0, battles: 0, deployed: 0, vialsOpened: 0, signatures: 0, deployFood: 0, martBattles: 0, cartsSmashed: 0,
      crowns: 0, threeCrowns: 0, cardsFound: 0, winStreak: 0, bestStreak: 0,
    },
    settings: { sfx: 0.8, music: 0.45, pixel: 'off', graphics: null, shake: true, muted: false },
    hub: {},
    lastDay: '',
  };
}

const listeners = new Set();

export const state = {
  p: defaultProfile(),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = migrate(JSON.parse(raw));
        this.p = deepMerge(defaultProfile(), data);
        sanitize(this.p);
      }
    } catch (e) {
      console.warn('Save load failed', e);
    }
    return this.p;
  },
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.p));
    } catch (e) { /* storage unavailable */ }
  },
  reset() {
    this.p = defaultProfile();
    this.save();
    this.emit();
  },
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(what) {
    this.save();
    for (const fn of listeners) fn(what);
  },
};

function deepMerge(base, data) {
  if (Array.isArray(base)) return Array.isArray(data) ? data : base;
  if (typeof base !== 'object' || base === null) return data ?? base;
  const out = { ...base };
  for (const k in data) {
    if (k in base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) out[k] = deepMerge(base[k], data[k]);
    else out[k] = data[k];
  }
  return out;
}

/** v1 (Battle Cats lineup) -> v2 (Clash Royale cards & decks). */
function migrate(d) {
  if (!d || (d.v ?? 1) >= 2) return d;
  const out = { ...d, v: 2 };
  out.cards = {};
  for (const [id, e] of Object.entries(d.swarms || {})) {
    if (!SWARMS[id] || SWARMS[id].hidden || SWARMS[id].isMega) continue;
    out.cards[id] = { ...newCard(), ...e, level: Math.min(MAX_LEVEL, e.level ?? 1), copies: e.copies ?? 0 };
  }
  for (const [id, e] of Object.entries(d.spells?.owned || {})) if (SPELLS[id]) out.cards[id] = { ...newCard(), level: Math.min(MAX_LEVEL, e.level ?? 1) };
  const ids = [...(d.deck || []), ...(d.spells?.equipped || [])].filter((id) => out.cards[id]);
  for (const id of Object.keys(out.cards)) if (ids.length < DECK_SIZE && !ids.includes(id)) ids.push(id);
  out.decks = [ids.slice(0, DECK_SIZE), [], []];
  out.deckIdx = 0;
  const v = d.vials || {};
  out.vials = {
    slots: (v.slots || []).slice(0, VIAL_SLOTS).map((s) => (s ? { ...s, type: vialId(s.type) } : null)),
    storage: (v.storage || []).map(vialId),
    cycle: 0, freeNext: 0, freeStock: 1, crowns: 0, crownDay: '', crownClaimed: false,
  };
  while (out.vials.slots.length < VIAL_SLOTS) out.vials.slots.push(null);
  out.trophyRoad = {};
  out.arenaSeen = currentArena(d.bestTrophies ?? 0).index;
  out.labXp = Object.values(out.cards).reduce((a, c) => a + (c.level - 1) * 12, 0);
  if (out.settings) out.settings.pixel = 'off';
  if (d.tutorial === 'arena') out.tutorial = 'done';
  delete out.swarms;
  delete out.spells;
  delete out.deck;
  delete out.arena;
  return out;
}

/** Repair anything inconsistent (unknown cards, short decks after the tutorial...). */
function sanitize(p) {
  for (const id of Object.keys(p.cards)) if (!CARDS[id]) delete p.cards[id];
  if (!Array.isArray(p.decks) || !p.decks.length) p.decks = [[], [], []];
  while (p.decks.length < DECK_PRESETS) p.decks.push([]);
  p.decks = p.decks.map((d) => (Array.isArray(d) ? d.filter((id, i) => p.cards[id] && d.indexOf(id) === i).slice(0, DECK_SIZE) : []));
  p.deckIdx = Math.max(0, Math.min(DECK_PRESETS - 1, p.deckIdx | 0));
  p.vials.slots = p.vials.slots.map((s) => (s && VIALS[vialId(s.type)] ? { ...s, type: vialId(s.type) } : null));
  p.vials.storage = p.vials.storage.map(vialId);
  if (p.tutorial === 'done' || p.tutorial === 'home') {
    for (const id of STARTER_DECK) if (!p.cards[id]) p.cards[id] = newCard();
  }
  // fill empty preset slots from the collection
  const d = p.decks[p.deckIdx];
  for (const id of Object.keys(p.cards)) if (d.length < DECK_SIZE && !d.includes(id)) d.push(id);
}

const P = () => state.p;

// ---------------------------------------------------------------------------
// Currencies

export function addCoins(n) { P().coins += Math.round(n); state.emit('coins'); }
export function addBucks(n) { P().bucks += Math.round(n); state.emit('bucks'); }
export function spendCoins(n) {
  if (P().coins < n) return false;
  P().coins -= n;
  state.emit('coins');
  return true;
}
export function spendBucks(n) {
  if (P().bucks < n) return false;
  P().bucks -= n;
  state.emit('bucks');
  return true;
}
export function addCalories(n) {
  const before = tierForCalories(P().calories);
  P().calories += Math.round(n);
  const after = tierForCalories(P().calories);
  state.emit('calories');
  return after - before;
}
/** Trophies never drop below the gate of the best arena reached. */
export function addTrophies(n) {
  const p = P();
  const floor = trophyFloor(p.bestTrophies);
  let t = p.trophies + n;
  if (n < 0) t = Math.max(t, Math.min(p.trophies, floor));
  p.trophies = Math.max(0, t);
  p.bestTrophies = Math.max(p.bestTrophies, p.trophies);
  state.emit('trophies');
}
export function stat(key, inc = 1) {
  const s = P().stats;
  s[key] = (s[key] ?? 0) + inc;
}

// ---------------------------------------------------------------------------
// Lab Level (king level)

export const labLevel = () => labLevelFor(P().labXp);
export function labXpInfo() {
  const lv = labLevel();
  const cur = LAB_XP[lv - 1] ?? 0, next = LAB_XP[lv] ?? null;
  return { level: lv, xp: P().labXp - cur, need: next === null ? 0 : next - cur, max: lv >= LAB_MAX_LEVEL };
}
/** Returns an array of {level, reward} for each level gained. */
export function addLabXp(n) {
  const p = P();
  const before = labLevel();
  p.labXp += Math.round(n);
  const after = labLevel();
  const ups = [];
  for (let lv = before + 1; lv <= after; lv++) {
    const r = LAB_LEVEL_REWARDS(lv);
    p.coins += r.coins;
    p.bucks += r.bucks;
    ups.push({ level: lv, reward: r });
  }
  state.emit('labXp');
  return ups;
}

// ---------------------------------------------------------------------------
// Cards (troops + spells)

export const owned = (id) => P().cards[id] || null;
export const cardLevel = (id) => P().cards[id]?.level ?? 1;
export const currentDeck = () => P().decks[P().deckIdx];
export const deckSlotCount = () => DECK_SIZE;

export function grantCard(id, copies = 1, variant = 'base') {
  const p = P();
  if (!CARDS[id]) return { isNew: false, newVariant: false };
  let e = p.cards[id];
  const isNew = !e;
  if (!e) {
    e = p.cards[id] = newCard();
    e.copies = Math.max(0, copies - 1);
    p.stats.cardsFound = (p.stats.cardsFound ?? 0) + 1;
  } else e.copies += copies;
  let newVariant = false;
  if (variant !== 'base' && !e.variants[variant]) {
    e.variants[variant] = true;
    newVariant = true;
    e.variant = variant; // auto-equip the shiny!
  }
  const d = currentDeck();
  if (isNew && d.length < DECK_SIZE && !d.includes(id)) d.push(id);
  state.emit('cards');
  return { isNew, newVariant };
}
// legacy names
export const grantSwarm = grantCard;
export function grantSpell(id) { return grantCard(id, 1).isNew; }

export function upgradeInfo(id) {
  const e = owned(id);
  if (!e) return null;
  const d = cardDef(id);
  if (e.level >= MAX_LEVEL) return { max: true, haveCopies: e.copies };
  const t = UPGRADE[d.rarity];
  const copies = t.copies[e.level - 1];
  const coins = t.coins[e.level - 1];
  return {
    copies, coins, haveCopies: e.copies, xp: UPGRADE_XP[d.rarity][e.level - 1],
    ok: e.copies >= copies && P().coins >= coins, enoughCopies: e.copies >= copies,
  };
}
/** Upgrade a card; returns { ok, labUps } */
export function upgradeCard(id) {
  const info = upgradeInfo(id);
  if (!info || info.max || !info.ok) return { ok: false };
  const e = owned(id);
  P().coins -= info.coins;
  e.copies -= info.copies;
  e.level++;
  const labUps = addLabXp(info.xp);
  state.emit('cards');
  return { ok: true, labUps, xp: info.xp };
}
export const upgradeSwarm = (id) => upgradeCard(id).ok;

/** Replace the card in deck slot i (swaps if the card is already in the deck). */
export function setDeckCard(slot, id) {
  const d = currentDeck();
  if (!owned(id)) return;
  const at = d.indexOf(id);
  if (at >= 0) {
    if (slot < d.length) [d[at], d[slot]] = [d[slot], d[at]];
  } else if (slot < d.length) d[slot] = id;
  else if (d.length < DECK_SIZE) d.push(id);
  state.emit('deck');
}
export function setDeck(ids) {
  P().decks[P().deckIdx] = ids.filter((id) => owned(id)).slice(0, DECK_SIZE);
  state.emit('deck');
}
export function selectDeck(i) {
  const p = P();
  p.deckIdx = Math.max(0, Math.min(DECK_PRESETS - 1, i));
  const d = currentDeck();
  if (!d.length) for (const id of p.decks.find((x) => x.length) ?? []) d.push(id);
  state.emit('deck');
}
export const deckReady = () => currentDeck().length >= 1;

export function setVariant(id, v) {
  const e = owned(id);
  if (e && e.variants[v]) { e.variant = v; state.emit('cards'); }
}
export function setSwarmSkin(id, skin) {
  const e = owned(id);
  if (!e) return;
  e.skin = skin;
  state.emit('cards');
}
export function megaUnlocked(megaId) { return !!P().megaUnlocked[megaId]; }
export function unlockMega(megaId) {
  P().megaUnlocked[megaId] = true;
  state.emit('mega');
}
export function setMega(baseId, on) {
  const e = owned(baseId);
  if (!e) return;
  e.mega = on;
  state.emit('cards');
}
/** Resolve which unit actually deploys for a deck entry (mega form, variant, skin). */
export function deployInfo(id) {
  const e = owned(id);
  const base = cardDef(id);
  let unit = id;
  if (e?.mega && base?.mega && megaUnlocked(base.mega)) unit = base.mega;
  const megaSkin = unit !== id ? Object.keys(SWARM_SKINS).find((k) => SWARM_SKINS[k].swarm === unit && P().cosmetics.swarmSkins[k] && e?.megaSkin === k) ?? null : null;
  return { unit, level: e?.level ?? 1, variant: e?.variant ?? 'base', spell: isSpell(id), skin: unit === id ? e?.skin ?? null : megaSkin };
}

// ---------------------------------------------------------------------------
// Commanders

export function grantCommander(id) {
  const c = P().commanders.owned;
  if (c[id]) return false;
  c[id] = { level: 1, xp: 0, perks: [null, null, null], skin: null };
  state.emit('commanders');
  return true;
}
export function equipCommander(id) {
  if (!P().commanders.owned[id]) return;
  P().commanders.equipped = id;
  state.emit('commanders');
}
export function addCmdXp(id, xp) {
  const c = P().commanders.owned[id];
  if (!c) return [];
  const ups = [];
  c.xp += xp;
  while (c.level < CMD_MAX_LEVEL && c.xp >= cmdXpForLevel(c.level)) {
    c.xp -= cmdXpForLevel(c.level);
    c.level++;
    const r = CMD_LEVEL_REWARDS[c.level];
    if (r) {
      if (r.coins) P().coins += r.coins;
      if (r.bucks) P().bucks += r.bucks;
      if (r.banner && !P().cosmetics.banners.includes(r.banner)) P().cosmetics.banners.push(r.banner);
      if (r.skin) P().cosmetics.cmdSkins[id + ':' + r.skin] = true;
    }
    ups.push({ level: c.level, reward: r });
  }
  state.emit('commanders');
  return ups;
}
export function rollCommanderPerk() {
  if (!spendCoins(PERK_ROLL_COST)) return null;
  return rollPerk();
}
export function setPerk(cmdId, slot, perk) {
  const c = P().commanders.owned[cmdId];
  if (!c || slot >= perkSlotsForLevel(c.level)) return;
  c.perks[slot] = perk;
  state.emit('commanders');
}
export function setCmdSkin(cmdId, skinId) {
  const c = P().commanders.owned[cmdId];
  if (!c) return;
  c.skin = skinId;
  state.emit('commanders');
}
export function perkBonuses(cmdId = P().commanders.equipped) {
  const c = P().commanders.owned[cmdId];
  const b = {};
  if (!c) return b;
  c.perks.slice(0, perkSlotsForLevel(c.level)).forEach((pk) => {
    if (pk) b[pk.id] = (b[pk.id] ?? 0) + pk.v;
  });
  return b;
}

// ---------------------------------------------------------------------------
// Vials

/** Put a vial in the first free slot (else storage). Returns slot index or -1. */
export function addVial(type) {
  const v = P().vials;
  type = vialId(type);
  const i = v.slots.findIndex((s) => !s);
  const entry = { type, added: Date.now(), unlockStart: null };
  if (i >= 0) v.slots[i] = entry;
  else v.storage.push(type);
  state.emit('vials');
  return i;
}
export const hasFreeSlot = () => P().vials.slots.some((s) => !s);
export function vialTimeLeft(slot) {
  const e = P().vials.slots[slot];
  if (!e) return 0;
  const total = VIALS[e.type].time;
  if (e.skipped) return 0;
  if (!e.unlockStart) return total;
  return Math.max(0, total - (Date.now() - e.unlockStart) / 1000);
}
export function isUnlocking() {
  return P().vials.slots.some((s, i) => s && s.unlockStart && !s.skipped && vialTimeLeft(i) > 0);
}
export function startUnlock(slot) {
  const e = P().vials.slots[slot];
  if (!e || e.unlockStart) return false;
  if (isUnlocking()) return false;
  e.unlockStart = Date.now();
  state.emit('vials');
  return true;
}
export function vialReady(slot) {
  const e = P().vials.slots[slot];
  return !!e && (VIALS[e.type].time === 0 || e.skipped || (e.unlockStart && vialTimeLeft(slot) <= 0));
}
export function skipVial(slot, price = null) {
  const pr = price ?? skipPrice(vialTimeLeft(slot));
  if (pr > 0 && !spendBucks(pr)) return false;
  P().vials.slots[slot].skipped = true;
  state.emit('vials');
  return true;
}
/** Remove vial from slot (when opened) and pull the next from storage. */
export function takeVial(slot) {
  const v = P().vials;
  const e = v.slots[slot];
  v.slots[slot] = null;
  if (v.storage.length) v.slots[slot] = { type: v.storage.shift(), added: Date.now(), unlockStart: null };
  state.emit('vials');
  return e;
}
/** Next vial type in the win cycle (advances it). */
export function nextCycleVial() {
  const v = P().vials;
  const t = VIAL_CYCLE[v.cycle % VIAL_CYCLE.length];
  v.cycle = (v.cycle + 1) % VIAL_CYCLE.length;
  return t;
}
export const upcomingVials = (n = 8) => Array.from({ length: n }, (_, i) => VIAL_CYCLE[(P().vials.cycle + i) % VIAL_CYCLE.length]);

/** Free vial: one every 4h, stacks up to 2. */
export function freeVialStatus() {
  const v = P().vials;
  const now = Date.now();
  if (v.freeStock < FREE_VIAL_MAX && v.freeNext && now >= v.freeNext) {
    const gained = Math.min(FREE_VIAL_MAX - v.freeStock, 1 + Math.floor((now - v.freeNext) / (FREE_VIAL_EVERY * 1000)));
    v.freeStock += gained;
    v.freeNext = v.freeStock < FREE_VIAL_MAX ? v.freeNext + gained * FREE_VIAL_EVERY * 1000 : 0;
  }
  if (v.freeStock < FREE_VIAL_MAX && !v.freeNext) v.freeNext = now + FREE_VIAL_EVERY * 1000;
  return { count: v.freeStock, ready: v.freeStock > 0, nextIn: v.freeNext ? Math.max(0, (v.freeNext - now) / 1000) : 0 };
}
export function claimFreeVial() {
  const st = freeVialStatus();
  if (!st.ready) return false;
  const v = P().vials;
  v.freeStock--;
  if (!v.freeNext) v.freeNext = Date.now() + FREE_VIAL_EVERY * 1000;
  state.emit('vials');
  return true;
}
/** Crown case: 10 crowns per day. */
export function crownStatus() {
  const v = P().vials;
  const day = todayKey();
  if (v.crownDay !== day) { v.crownDay = day; v.crowns = 0; v.crownClaimed = false; }
  return { crowns: Math.min(CROWN_GOAL, v.crowns), goal: CROWN_GOAL, ready: v.crowns >= CROWN_GOAL && !v.crownClaimed, claimed: v.crownClaimed };
}
export function addCrowns(n) {
  crownStatus();
  if (!P().vials.crownClaimed) P().vials.crowns = Math.min(CROWN_GOAL, P().vials.crowns + n);
}
export function claimCrownVial() {
  if (!crownStatus().ready) return false;
  P().vials.crownClaimed = true;
  state.emit('vials');
  return true;
}

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** Roll vial contents (does NOT apply). Card stacks are ordered like Clash Royale: commons first, best last. */
export function rollVial(type, opts = {}) {
  type = vialId(type);
  const vial = VIALS[type];
  const p = P();
  const rng = opts.rng ?? Math.random;
  const arenaIdx = currentArena(p.bestTrophies).index;
  const coins = Math.round(randInt(vial.coins[0], vial.coins[1]) * (1 + arenaIdx * 0.25));
  const result = { type, coins, bucks: vial.bucks ?? 0, cards: [] };
  if (opts.fixed) return { ...result, ...opts.fixed };
  if (!vial.cards) return result;
  const N = Math.round(vial.cards * (1 + arenaIdx * 0.2));
  const g = vial.guarantee ?? {};
  let legendary = g.legendary ?? (rng() < N * 0.0009 ? 1 : 0);
  let epic = (g.epic ?? 0) + (rng() < N * 0.012 ? 1 : 0);
  let rare = Math.max(g.rare ?? 0, Math.round(N * 0.13 * (0.75 + rng() * 0.5)));
  let common = Math.max(0, N - rare - epic - legendary);
  const pool = cardPool(p.bestTrophies, { series: vial.series });
  const byR = (r) => pool.filter((c) => c.rarity === r);
  // demote rarities that aren't unlocked yet (a guaranteed Legendary falls back to any Legendary)
  if (legendary && !byR('legendary').length) {
    if (g.legendary) { /* premium guarantee: allow any legendary */ } else { epic += legendary; legendary = 0; }
  }
  if (epic && !byR('epic').length) { rare += epic * 4; epic = 0; }
  if (rare && !byR('rare').length) { common += rare; rare = 0; }
  const counts = {};
  const split = (r, n, maxStacks) => {
    if (n <= 0) return;
    let cands = byR(r);
    if (!cands.length && r === 'legendary') cands = Object.values(CARDS).filter((c) => c.rarity === 'legendary');
    if (!cands.length) cands = byR('common').length ? byR('common') : pool;
    if (!cands.length) return;
    const stacks = Math.max(1, Math.min(maxStacks, cands.length, n));
    const chosen = [];
    while (chosen.length < stacks) {
      const c = cands[Math.floor(rng() * cands.length)];
      if (!chosen.includes(c.id)) chosen.push(c.id);
      if (chosen.length >= cands.length) break;
    }
    let left = n;
    chosen.forEach((id, i) => {
      const k = i === chosen.length - 1 ? left : Math.max(1, Math.round((n / chosen.length) * (0.7 + rng() * 0.6)));
      const take = Math.min(left - (chosen.length - 1 - i), k);
      counts[id] = (counts[id] ?? 0) + Math.max(1, take);
      left -= Math.max(1, take);
    });
  };
  split('common', common, N >= 30 ? 4 : N >= 12 ? 3 : 2);
  split('rare', rare, N >= 30 ? 3 : 2);
  split('epic', epic, 2);
  split('legendary', legendary, 1);
  const boost = vial.shinyBoost ?? 1;
  for (const id in counts) {
    let variant = 'base';
    const roll = rng();
    if (!isSpell(id)) {
      if (roll < VARIANTS.chrome.chance * boost) variant = 'chrome';
      else if (roll < (VARIANTS.chrome.chance + VARIANTS.gold.chance) * boost) variant = 'gold';
      else if (roll < (VARIANTS.chrome.chance + VARIANTS.gold.chance + VARIANTS.silver.chance) * boost) variant = 'silver';
    }
    result.cards.push({ id, copies: counts[id], variant });
  }
  result.cards.sort((a, b) => RARITY_ORDER.indexOf(cardDef(a.id).rarity) - RARITY_ORDER.indexOf(cardDef(b.id).rarity) || a.copies - b.copies);
  return result;
}
/** Apply rolled contents; annotates cards with isNew / newVariant / canUpgrade. */
export function applyVial(res) {
  const p = P();
  if (res.coins) p.coins += res.coins;
  if (res.bucks) p.bucks += res.bucks;
  for (const c of res.cards) {
    const r = grantCard(c.id, c.copies, c.variant);
    c.isNew = r.isNew;
    c.newVariant = r.newVariant;
    const up = upgradeInfo(c.id);
    c.after = { level: owned(c.id).level, copies: owned(c.id).copies, need: up && !up.max ? up.copies : null };
    c.canUpgrade = !!(up && !up.max && up.enoughCopies);
  }
  for (const s of res.spells || []) grantCard(s, 1);
  stat('vialsOpened');
  state.emit('vials');
  return res;
}

// ---------------------------------------------------------------------------
// Generic reward grant (pass, trophy road, quests, bosses, secrets).
// Returns display objects [{icon, label, kind, id}].

export function grantReward(r) {
  const p = P();
  const out = [];
  if (!r) return out;
  const push = (o) => out.push(o);
  switch (r.type) {
    case 'coins': p.coins += r.amount; push({ icon: 'coin', label: `${r.amount.toLocaleString('en-US')} Beast Coins`, kind: 'coins', amount: r.amount }); break;
    case 'bucks': p.bucks += r.amount; push({ icon: 'bucks', label: `${r.amount} Beast Bucks`, kind: 'bucks', amount: r.amount }); break;
    case 'calories': addCalories(r.amount); push({ icon: 'calorie', label: `${r.amount} Calories`, kind: 'calories', amount: r.amount }); break;
    case 'vial': { const id = vialId(r.id); addVial(id); push({ icon: 'vial', label: VIALS[id].name, kind: 'vial', id }); break; }
    case 'swarm': case 'card': case 'spell': {
      const g = grantCard(r.id, r.copies ?? 1);
      const d = cardDef(r.id);
      push({ icon: d?.kind === 'spell' ? 'magic' : 'swarm', label: `${d?.name ?? r.id}${(r.copies ?? 1) > 1 ? ' x' + r.copies : ''}`, kind: 'card', id: r.id, copies: r.copies ?? 1, isNew: g.isNew });
      break;
    }
    case 'commander': grantCommander(r.id); push({ icon: 'crown', label: `Commander: ${COMMANDERS[r.id].name}`, kind: 'commander', id: r.id }); break;
    case 'skin': p.cosmetics.swarmSkins[r.id] = true; push({ icon: 'paint', label: 'Swarm Skin', kind: 'skin', id: r.id }); break;
    case 'labSkin': if (!p.cosmetics.labSkins.includes(r.id)) p.cosmetics.labSkins.push(r.id); push({ icon: 'flask', label: 'Lab Skin', kind: 'labSkin', id: r.id }); break;
    case 'cmdSkin': p.cosmetics.cmdSkins[r.id] = true; push({ icon: 'crown', label: 'Commander Outfit', kind: 'cmdSkin', id: r.id }); break;
    case 'banner': if (!p.cosmetics.banners.includes(r.id)) p.cosmetics.banners.push(r.id); push({ icon: 'flag', label: `Banner: ${BANNERS[r.id]?.name ?? r.id}`, kind: 'banner', id: r.id }); break;
    case 'serum': unlockMega(r.id); push({ icon: 'mega', label: `Mega Serum: ${SWARMS[r.id].name}`, kind: 'serum', id: r.id }); break;
    default: break;
  }
  state.emit('reward');
  return out;
}
export function grantBundle(b) {
  const out = [];
  if (!b) return out;
  if (b.coins) out.push(...grantReward({ type: 'coins', amount: b.coins }));
  if (b.bucks) out.push(...grantReward({ type: 'bucks', amount: b.bucks }));
  if (b.calories) out.push(...grantReward({ type: 'calories', amount: b.calories }));
  if (b.vial) out.push(...grantReward({ type: 'vial', id: b.vial }));
  if (b.swarm || b.card) out.push(...grantReward({ type: 'card', id: b.swarm ?? b.card, copies: b.copies ?? 1 }));
  if (b.commander) out.push(...grantReward({ type: 'commander', id: b.commander }));
  if (b.banner) out.push(...grantReward({ type: 'banner', id: b.banner }));
  return out;
}

// ---------------------------------------------------------------------------
// Trophy road + arena unlocks

export function trophyRoadClaimable() {
  const p = P();
  return TROPHY_ROAD.filter((m) => p.bestTrophies >= m.t && !p.trophyRoad[m.key]);
}
export function claimTrophyRoad(m) {
  const p = P();
  if (p.trophyRoad[m.key] || p.bestTrophies < m.t) return [];
  p.trophyRoad[m.key] = true;
  return grantReward(m.reward);
}
/** The arena whose unlock cinematic hasn't been shown yet (or null). */
export function pendingArenaUnlock() {
  const p = P();
  const idx = currentArena(p.bestTrophies).index;
  return idx > (p.arenaSeen ?? 0) ? ARENAS[(p.arenaSeen ?? 0) + 1] : null;
}
export function markArenaSeen(index) {
  P().arenaSeen = Math.max(P().arenaSeen ?? 0, index);
  state.emit('arena');
}

// ---------------------------------------------------------------------------
// Battle pass

export const passTier = () => tierForCalories(P().calories);
export function passClaimable(tier, track) {
  const p = P();
  if (tier >= passTier()) return false;
  if (track === 'premium' && !p.pass.premium) return false;
  const claimed = track === 'premium' ? p.pass.premium_ : p.pass.free;
  return !claimed[tier];
}
export function claimPass(tier, track) {
  if (!passClaimable(tier, track)) return [];
  const p = P();
  (track === 'premium' ? p.pass.premium_ : p.pass.free)[tier] = true;
  return grantReward(PASS_TIERS[tier][track]);
}
export function buyPremiumPass() {
  if (P().pass.premium) return false;
  if (!spendBucks(SEASON.premiumCost)) return false;
  P().pass.premium = true;
  state.emit('pass');
  return true;
}

// ---------------------------------------------------------------------------
// Daily season challenges + shop day roll

export function refreshDaily() {
  const p = P();
  const day = todayKey();
  if (p.challenges.day !== day) {
    const rng = mulberry32(hashString(day));
    const ids = SEASON_CHALLENGES.map((c) => c.id).sort(() => rng() - 0.5).slice(0, 3);
    p.challenges = { day, ids, base: {}, claimed: {} };
    for (const id of ids) {
      const c = SEASON_CHALLENGES.find((x) => x.id === id);
      p.challenges.base[id] = p.stats[c.stat] ?? 0;
    }
  }
  if (p.shop.day !== day) p.shop = { day, bought: {}, freeClaimed: false };
  crownStatus();
  freeVialStatus();
  state.save();
}
export function challengeList() {
  const p = P();
  return p.challenges.ids.map((id) => {
    const c = SEASON_CHALLENGES.find((x) => x.id === id);
    if (!c) return null;
    const prog = Math.min(c.n, (p.stats[c.stat] ?? 0) - (p.challenges.base[id] ?? 0));
    return { ...c, text: c.text.replace('{n}', c.n), prog, done: prog >= c.n, claimed: !!p.challenges.claimed[id] };
  }).filter(Boolean);
}
export function claimChallenge(id) {
  const c = challengeList().find((x) => x.id === id);
  if (!c || !c.done || c.claimed) return 0;
  P().challenges.claimed[id] = true;
  addCalories(c.cal);
  return c.cal;
}

// ---------------------------------------------------------------------------
// Quests (NPC chains)

export function questState(npc) {
  const p = P();
  const chain = QUEST_CHAINS[npc];
  const qs = p.quests[npc];
  if (!chain || !qs) return null;
  if (qs.idx >= chain.length) return { finished: true };
  const q = QUESTS[chain[qs.idx]];
  let prog = 0, need = 1, done = false;
  if (q.stat) {
    need = q.n;
    prog = Math.min(need, (p.stats[q.stat] ?? 0) - (qs.base ?? 0));
    done = qs.base !== null && prog >= need;
  } else if (q.secret) {
    done = !!p.secrets[q.secret];
    prog = done ? 1 : 0;
  } else if (q.boss) {
    done = !!p.bosses[q.boss];
    prog = done ? 1 : 0;
  }
  return { quest: q, accepted: qs.base !== null, prog, need, done, text: q.text.replace('{n}', q.n ?? ''), step: qs.idx, steps: chain.length };
}
export function acceptQuest(npc) {
  const p = P();
  const st = questState(npc);
  if (!st || st.finished) return;
  const q = st.quest;
  p.quests[npc].base = q.stat ? p.stats[q.stat] ?? 0 : 0;
  state.emit('quests');
}
export function completeQuest(npc) {
  const st = questState(npc);
  if (!st || !st.done) return [];
  const p = P();
  p.quests[npc].idx++;
  p.quests[npc].base = null;
  return grantBundle(st.quest.reward);
}

// ---------------------------------------------------------------------------
// Secrets & bosses

export function findSecret(id) {
  const p = P();
  if (p.secrets[id] || !SECRETS[id]) return null;
  p.secrets[id] = Date.now();
  const s = SECRETS[id];
  const r = grantBundle(s.reward);
  state.emit('secret');
  return { secret: s, rewards: r };
}
export function bossDefeated(id) {
  const p = P();
  const first = !p.bosses[id];
  p.bosses[id] = (p.bosses[id] ?? 0) + 1;
  const b = BOSSES[id];
  const rewards = first ? grantBundle(b.reward) : grantBundle({ coins: Math.round((b.reward.coins ?? 300) * 0.25) });
  state.emit('boss');
  return { first, rewards };
}

// ---------------------------------------------------------------------------
// Daily shop

const VIAL_PRICES = { testTube: 20, labPack: 60, snackPack: 55, megaLab: 250, hyperchrome: 180, cashCase: 500 };
const COPY_PRICE = { common: 10, rare: 100, epic: 1000, legendary: 40000 };

export function shopOffers() {
  const p = P();
  const day = todayKey();
  const rng = mulberry32(hashString('shop' + day));
  const vials = ['labPack', 'megaLab', 'hyperchrome', 'cashCase'];
  const pool = cardPool(p.bestTrophies);
  const cards = [];
  let guard = 0;
  const want = ['common', 'common', 'rare', 'rare', 'epic', pool.some((c) => c.rarity === 'legendary') ? 'legendary' : 'rare'];
  while (cards.length < want.length && guard++ < 300) {
    const r = want[cards.length];
    const cands = pool.filter((c) => c.rarity === r && !cards.find((x) => x.id === c.id));
    if (!cands.length) { want[cards.length] = 'common'; continue; }
    const c = cands[Math.floor(rng() * cands.length)];
    const copies = { common: 40, rare: 8, epic: 2, legendary: 1 }[c.rarity];
    const legendaryInBucks = c.rarity === 'legendary';
    cards.push({ id: c.id, copies, price: legendaryInBucks ? 600 : COPY_PRICE[c.rarity] * copies, cur: legendaryInBucks ? 'bucks' : 'coins' });
  }
  const freeIsCoins = rng() < 0.5;
  return {
    free: freeIsCoins ? { type: 'coins', amount: 150 } : { type: 'card', id: (pool.find((c) => c.rarity === 'common') ?? pool[0])?.id, copies: 10 },
    vials: vials.map((v) => ({ id: v, price: VIAL_PRICES[v], cur: 'bucks' })),
    cards,
    deals: [
      { id: 'coinPile', label: 'Pile of Coins', coins: 1000, price: 60, cur: 'bucks' },
      { id: 'coinBag', label: 'Bag of Coins', coins: 5000, price: 250, cur: 'bucks' },
      { id: 'coinVault', label: 'Coin Vault', coins: 25000, price: 1100, cur: 'bucks' },
    ],
  };
}
export function shopBought(key) { return !!P().shop.bought[key]; }
export function markBought(key) { P().shop.bought[key] = true; state.emit('shop'); }

// ---------------------------------------------------------------------------
// Battle results

/**
 * Apply the result of a battle.
 * result: 'win' | 'loss' | 'draw'; crowns: crowns you earned (0-3); enemyCrowns.
 */
export function battleRewards({ result, crowns = 0, enemyCrowns = 0, arenaId, mode = 'ranked', opponentTrophies = 0, bossId = null }) {
  const p = P();
  const win = result === 'win';
  const arenaIdx = Math.max(0, ARENAS.findIndex((a) => a.id === arenaId));
  const res = {
    result, crowns, coins: 0, trophies: 0, calories: 0, vial: null, vialSlot: -1, cmdXp: 0, labXp: 0,
    levelUps: [], labUps: [], bossResult: null, passTiers: 0, slotsFull: false, crownProgress: null,
  };
  const coinMag = 1 + (perkBonuses().coinMagnet ?? 0) / 100;
  const ranked = mode === 'ranked';
  p.stats.battles++;
  if (arenaId === 'mart') p.stats.martBattles++;
  if (crowns) {
    stat('crowns', crowns);
    if (crowns >= 3) stat('threeCrowns');
    if (ranked || mode === 'boss') addCrowns(crowns);
  }
  if (win) {
    p.stats.wins++;
    p.stats.winStreak = (p.stats.winStreak ?? 0) + 1;
    p.stats.bestStreak = Math.max(p.stats.bestStreak ?? 0, p.stats.winStreak);
    res.coins = Math.round((18 + arenaIdx * 6) * (1 + crowns * 0.2) * coinMag);
    if (ranked) res.trophies = Math.max(24, Math.min(36, 30 + Math.round((opponentTrophies - p.trophies) / 25)));
    res.calories = arenaId === 'mart' ? 160 : 100;
    res.cmdXp = 70;
    res.labXp = 6;
    if (ranked || mode === 'boss') {
      if (hasFreeSlot()) {
        res.vial = nextCycleVial();
        res.vialSlot = addVial(res.vial);
      } else res.slotsFull = true;
    }
  } else if (result === 'draw') {
    p.stats.draws = (p.stats.draws ?? 0) + 1;
    res.coins = Math.round(8 * coinMag);
    res.calories = 50;
    res.cmdXp = 35;
  } else {
    p.stats.losses++;
    p.stats.winStreak = 0;
    res.coins = Math.round(5 * coinMag);
    if (ranked) res.trophies = -Math.max(12, Math.min(22, 18 - Math.round((opponentTrophies - p.trophies) / 30)));
    res.calories = 35;
    res.cmdXp = 25;
  }
  if (mode === 'boss' && win && bossId) res.bossResult = bossDefeated(bossId);
  if (mode !== 'ranked') res.trophies = 0;
  p.coins += res.coins;
  const before = p.trophies;
  if (res.trophies) addTrophies(res.trophies);
  res.trophies = p.trophies - before;
  res.passTiers = addCalories(res.calories);
  res.levelUps = addCmdXp(p.commanders.equipped, res.cmdXp);
  if (res.labXp) res.labUps = addLabXp(res.labXp);
  res.crownProgress = crownStatus();
  state.emit('battle');
  return res;
}

export { skipPrice, VIALS };
