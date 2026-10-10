// Player profile, persistence and every economy operation.
import { SWARMS, COLLECTABLE, RARITIES, VARIANTS, UPGRADE, MAX_LEVEL } from '../data/swarms.js';
import { SPELLS, SPELL_UPGRADE_COINS } from '../data/spells.js';
import { COMMANDERS, cmdXpForLevel, CMD_MAX_LEVEL, CMD_LEVEL_REWARDS, rollPerk, PERK_ROLL_COST, perkSlotsForLevel } from '../data/commanders.js';
import { VIALS, VIAL_SLOTS, skipPrice } from '../data/vials.js';
import { PASS_TIERS, SEASON, tierForCalories, SEASON_CHALLENGES, BANNERS } from '../data/season.js';
import { unlockedSeries, deckSlots, spellSlots, TROPHY_ROAD, QUESTS, QUEST_CHAINS, SECRETS, BOSSES, currentArena, ARENAS } from '../data/arena.js';
import { mulberry32, hashString, todayKey, weightedPick, randInt } from '../core/util.js';

const KEY = 'mbswarmers.save.v1';

function defaultProfile() {
  return {
    v: 1,
    created: Date.now(),
    name: 'Recruit',
    tutorial: 'start',
    coins: 0,
    bucks: 20,
    trophies: 0,
    bestTrophies: 0,
    calories: 0,
    swarms: {},
    deck: [],
    spells: { owned: {}, equipped: [] },
    commanders: { owned: { recruit: { level: 1, xp: 0, perks: [null, null, null], skin: null } }, equipped: 'recruit' },
    megaUnlocked: {},
    vials: { slots: Array(VIAL_SLOTS).fill(null), storage: [] },
    shop: { day: '', bought: {}, freeClaimed: false },
    pass: { premium: false, free: {}, premium_: {} },
    challenges: { day: '', ids: [], base: {}, claimed: {} },
    quests: { nolan: { idx: 0, base: null, done: false }, juan: { idx: 0, base: null, done: false } },
    trophyRoad: {},
    bosses: {},
    secrets: {},
    cosmetics: { banners: ['default'], banner: 'default', labSkins: ['default'], labSkin: 'default', swarmSkins: {}, cmdSkins: {} },
    arena: { pos: null, visited: {} },
    stats: { wins: 0, losses: 0, battles: 0, deployed: 0, vialsOpened: 0, signatures: 0, deployFood: 0, martBattles: 0, cartsSmashed: 0 },
    settings: { sfx: 0.8, music: 0.45, pixel: 'retro', shake: true, muted: false },
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
        const data = JSON.parse(raw);
        this.p = deepMerge(defaultProfile(), data);
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
export function addTrophies(n) {
  const p = P();
  p.trophies = Math.max(0, p.trophies + n);
  p.bestTrophies = Math.max(p.bestTrophies, p.trophies);
  state.emit('trophies');
}
export function stat(key, inc = 1) {
  const s = P().stats;
  s[key] = (s[key] ?? 0) + inc;
}

// ---------------------------------------------------------------------------
// Swarms

export const owned = (id) => P().swarms[id] || null;
export const deckSlotCount = () => deckSlots(P().bestTrophies);
export const spellSlotCount = () => spellSlots(P().bestTrophies) + (P().extraSpellSlot ? 0 : 0);

export function grantSwarm(id, copies = 1, variant = 'base') {
  const p = P();
  let e = p.swarms[id];
  const isNew = !e;
  if (!e) e = p.swarms[id] = { level: 1, copies: 0, variants: { base: true }, variant: 'base', skin: null, mega: false, found: Date.now() };
  else e.copies += copies;
  if (isNew && copies > 1) e.copies += copies - 1;
  let newVariant = false;
  if (variant !== 'base' && !e.variants[variant]) {
    e.variants[variant] = true;
    newVariant = true;
    e.variant = variant; // auto-equip the shiny!
  }
  // auto-add to deck if there's room
  if (isNew && p.deck.length < deckSlotCount() && !p.deck.includes(id)) p.deck.push(id);
  state.emit('swarms');
  return { isNew, newVariant };
}

export function upgradeInfo(id) {
  const e = owned(id);
  if (!e) return null;
  const s = SWARMS[id];
  if (e.level >= MAX_LEVEL) return { max: true };
  const t = UPGRADE[s.rarity];
  const copies = t.copies[e.level - 1];
  const coins = t.coins[e.level - 1];
  return { copies, coins, haveCopies: e.copies, ok: e.copies >= copies && P().coins >= coins, enoughCopies: e.copies >= copies };
}
export function upgradeSwarm(id) {
  const info = upgradeInfo(id);
  if (!info || info.max || !info.ok) return false;
  const e = owned(id);
  P().coins -= info.coins;
  e.copies -= info.copies;
  e.level++;
  state.emit('swarms');
  return true;
}
export function setDeck(deck) {
  P().deck = deck.slice(0, deckSlotCount());
  state.emit('deck');
}
export function setVariant(id, v) {
  const e = owned(id);
  if (e && e.variants[v]) { e.variant = v; state.emit('swarms'); }
}
export function setSwarmSkin(id, skin) {
  const e = owned(id);
  if (!e) return;
  e.skin = skin;
  state.emit('swarms');
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
  state.emit('swarms');
}
/** Resolve which unit actually deploys for a deck entry (mega form, variant, skin). */
export function deployInfo(id) {
  const e = owned(id);
  const base = SWARMS[id];
  let unit = id;
  if (e?.mega && base.mega && megaUnlocked(base.mega)) unit = base.mega;
  const skinOwner = owned(unit) || e;
  return { unit, level: e?.level ?? 1, variant: e?.variant ?? 'base', skin: unit === id ? e?.skin : P().cosmetics.swarmSkins[unit] ?? null };
}

// ---------------------------------------------------------------------------
// Spells

export function grantSpell(id) {
  const sp = P().spells;
  const isNew = !sp.owned[id];
  if (isNew) sp.owned[id] = { level: 1 };
  if (isNew && sp.equipped.length < spellSlotCount()) sp.equipped.push(id);
  state.emit('spells');
  return isNew;
}
export function equipSpells(list) {
  P().spells.equipped = list.slice(0, spellSlotCount());
  state.emit('spells');
}
export function spellUpgradeCost(id) {
  const s = P().spells.owned[id];
  if (!s || s.level >= 10) return null;
  return SPELL_UPGRADE_COINS[s.level - 1];
}
export function upgradeSpell(id) {
  const c = spellUpgradeCost(id);
  if (c === null || !spendCoins(c)) return false;
  P().spells.owned[id].level++;
  state.emit('spells');
  return true;
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
/** Roll a perk (costs coins). Returns the perk or null. Caller decides to keep it via setPerk. */
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
/** Aggregate perk bonuses for the equipped commander. */
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

export function addVial(type) {
  const v = P().vials;
  const i = v.slots.findIndex((s) => !s);
  const entry = { type, added: Date.now(), unlockStart: null };
  if (i >= 0) v.slots[i] = entry;
  else v.storage.push(type);
  state.emit('vials');
  return i;
}
export function vialTimeLeft(slot) {
  const e = P().vials.slots[slot];
  if (!e) return 0;
  const total = VIALS[e.type].time;
  if (e.skipped) return 0;
  if (!e.unlockStart) return total;
  return Math.max(0, total - (Date.now() - e.unlockStart) / 1000);
}
export function isUnlocking() {
  return P().vials.slots.some((s, i) => s && s.unlockStart && vialTimeLeft(i) > 0);
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
/** Remove vial from slot (when opened) and pull from storage. */
export function takeVial(slot) {
  const v = P().vials;
  const e = v.slots[slot];
  v.slots[slot] = null;
  if (v.storage.length) v.slots[slot] = { type: v.storage.shift(), added: Date.now(), unlockStart: null };
  state.emit('vials');
  return e;
}

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** Roll vial contents (does NOT apply). */
export function rollVial(type, opts = {}) {
  const vial = VIALS[type];
  const p = P();
  const rng = opts.rng ?? Math.random;
  const arenaIdx = Math.max(0, ARENAS.indexOf(currentArena(p.bestTrophies)));
  const coins = Math.round(randInt(vial.coins[0], vial.coins[1]) * (1 + arenaIdx * 0.15));
  const result = { type, coins, bucks: 0, cards: [], spells: [] };
  if (opts.fixed) return { ...result, ...opts.fixed };
  const series = vial.series ? [vial.series] : unlockedSeries(p.bestTrophies);
  const pool = COLLECTABLE.filter((s) => series.includes(s.series));
  const counts = {};
  const minIdx = RARITY_ORDER.indexOf(vial.minRarity ?? 'common');
  let gotMin = false;
  for (let i = 0; i < vial.cards; i++) {
    let r = weightedPick(Object.values(RARITIES), (x) => x.weight, rng).id;
    if (i === vial.cards - 1 && !gotMin && minIdx > 0) r = RARITY_ORDER[Math.max(minIdx, RARITY_ORDER.indexOf(r))];
    let ri = RARITY_ORDER.indexOf(r);
    let cand = pool.filter((s) => s.rarity === r);
    // nothing of that rarity in this series: look down first, then up
    for (let d = 1; !cand.length && d < RARITY_ORDER.length; d++) {
      for (const k of [ri - d, ri + d]) {
        if (k < 0 || k >= RARITY_ORDER.length || RARITY_ORDER[k] === 'mythic') continue;
        cand = pool.filter((s) => s.rarity === RARITY_ORDER[k]);
        if (cand.length) { ri = k; break; }
      }
    }
    if (!cand.length) continue;
    if (ri >= minIdx) gotMin = true;
    const s = cand[Math.floor(rng() * cand.length)];
    counts[s.id] = (counts[s.id] ?? 0) + 1;
  }
  const boost = vial.shinyBoost ?? 1;
  for (const id in counts) {
    let variant = 'base';
    const roll = rng();
    if (roll < VARIANTS.chrome.chance * boost) variant = 'chrome';
    else if (roll < (VARIANTS.chrome.chance + VARIANTS.gold.chance) * boost) variant = 'gold';
    else if (roll < (VARIANTS.chrome.chance + VARIANTS.gold.chance + VARIANTS.silver.chance) * boost) variant = 'silver';
    result.cards.push({ id, copies: counts[id], variant });
  }
  result.cards.sort((a, b) => RARITY_ORDER.indexOf(SWARMS[a.id].rarity) - RARITY_ORDER.indexOf(SWARMS[b.id].rarity));
  if (type === 'gold' || type === 'mega') result.bucks = type === 'gold' ? 20 : 5;
  return result;
}
/** Apply rolled contents; annotates cards with isNew/newVariant. */
export function applyVial(res) {
  if (res.coins) P().coins += res.coins;
  if (res.bucks) P().bucks += res.bucks;
  for (const c of res.cards) {
    const r = grantSwarm(c.id, c.copies, c.variant);
    c.isNew = r.isNew;
    c.newVariant = r.newVariant;
  }
  for (const s of res.spells || []) grantSpell(s);
  stat('vialsOpened');
  state.emit('vials');
  return res;
}

// ---------------------------------------------------------------------------
// Generic reward grant (pass, trophy road, quests, bosses, secrets).
// Returns a display object {icon, label, kind, id}.

export function grantReward(r) {
  const p = P();
  const out = [];
  if (!r) return out;
  const push = (o) => out.push(o);
  switch (r.type) {
    case 'coins': p.coins += r.amount; push({ icon: 'coin', label: `${r.amount} Beast Coins` }); break;
    case 'bucks': p.bucks += r.amount; push({ icon: 'bucks', label: `${r.amount} Beast Bucks` }); break;
    case 'calories': addCalories(r.amount); push({ icon: 'calorie', label: `${r.amount} Calories` }); break;
    case 'vial': addVial(r.id); push({ icon: 'vial', label: VIALS[r.id].name, kind: 'vial', id: r.id }); break;
    case 'swarm': { const g = grantSwarm(r.id, r.copies ?? 1); push({ icon: 'swarm', label: `${SWARMS[r.id].name}${r.copies > 1 ? ' x' + r.copies : ''}`, kind: 'swarm', id: r.id, isNew: g.isNew }); break; }
    case 'spell': grantSpell(r.id); push({ icon: 'magic', label: `Spell: ${SPELLS[r.id].name}`, kind: 'spell', id: r.id }); break;
    case 'commander': grantCommander(r.id); push({ icon: 'crown', label: `Commander: ${COMMANDERS[r.id].name}`, kind: 'commander', id: r.id }); break;
    case 'skin': p.cosmetics.swarmSkins[r.id] = true; push({ icon: 'paint', label: 'Swarm Skin', kind: 'skin', id: r.id }); break;
    case 'labSkin': if (!p.cosmetics.labSkins.includes(r.id)) p.cosmetics.labSkins.push(r.id); push({ icon: 'flask', label: 'Lab Skin', kind: 'labSkin', id: r.id }); break;
    case 'cmdSkin': p.cosmetics.cmdSkins[r.id] = true; push({ icon: 'crown', label: 'Commander Outfit', kind: 'cmdSkin', id: r.id }); break;
    case 'banner': if (!p.cosmetics.banners.includes(r.id)) p.cosmetics.banners.push(r.id); push({ icon: 'flag', label: `Banner: ${BANNERS[r.id]?.name ?? r.id}`, kind: 'banner', id: r.id }); break;
    case 'serum': unlockMega(r.id); push({ icon: 'mega', label: `Mega Serum: ${SWARMS[r.id].name}`, kind: 'serum', id: r.id }); break;
    case 'deckSlot': push({ icon: 'swarm', label: '+1 Deck Slot' }); break;
    case 'spellSlot': push({ icon: 'magic', label: '+1 Spell Slot' }); break;
    default: break;
  }
  state.emit('reward');
  return out;
}
/** Shorthand reward bundles {coins, bucks, vial, swarm, commander, calories, banner}. */
export function grantBundle(b) {
  const out = [];
  if (!b) return out;
  if (b.coins) out.push(...grantReward({ type: 'coins', amount: b.coins }));
  if (b.bucks) out.push(...grantReward({ type: 'bucks', amount: b.bucks }));
  if (b.calories) out.push(...grantReward({ type: 'calories', amount: b.calories }));
  if (b.vial) out.push(...grantReward({ type: 'vial', id: b.vial }));
  if (b.swarm) out.push(...grantReward({ type: 'swarm', id: b.swarm }));
  if (b.commander) out.push(...grantReward({ type: 'commander', id: b.commander }));
  if (b.banner) out.push(...grantReward({ type: 'banner', id: b.banner }));
  return out;
}

// ---------------------------------------------------------------------------
// Trophy road

export function trophyRoadClaimable() {
  const p = P();
  return TROPHY_ROAD.filter((t) => p.bestTrophies >= t.trophies && !p.trophyRoad[t.trophies]);
}
export function claimTrophyRoad(t) {
  const p = P();
  if (p.trophyRoad[t.trophies] || p.bestTrophies < t.trophies) return [];
  p.trophyRoad[t.trophies] = true;
  return grantReward(t.reward);
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
// Daily season challenges

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
  state.save();
}
export function challengeList() {
  const p = P();
  return p.challenges.ids.map((id) => {
    const c = SEASON_CHALLENGES.find((x) => x.id === id);
    const prog = Math.min(c.n, (p.stats[c.stat] ?? 0) - (p.challenges.base[id] ?? 0));
    return { ...c, text: c.text.replace('{n}', c.n), prog, done: prog >= c.n, claimed: !!p.challenges.claimed[id] };
  });
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
  return { quest: q, accepted: qs.base !== null, prog, need, done, text: q.text.replace('{n}', q.n ?? '') };
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
  if (p.secrets[id]) return null;
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

const VIAL_PRICES = { lab: 30, homeHorrors: 80, technoTerrors: 90, atomic: 90, hybrids: 100, food: 80, mega: 220, chrome: 260, gold: 480 };
const COPY_PRICE = { common: 15, rare: 140, epic: 1100, legendary: 9000 };

export function shopOffers() {
  const p = P();
  const day = todayKey();
  const rng = mulberry32(hashString('shop' + day));
  const vialIds = Object.keys(VIAL_PRICES).filter((v) => v !== 'lab');
  const vials = [];
  vials.push('lab');
  while (vials.length < 4) {
    const v = vialIds[Math.floor(rng() * vialIds.length)];
    if (!vials.includes(v)) vials.push(v);
  }
  const series = unlockedSeries(p.bestTrophies);
  const pool = COLLECTABLE.filter((s) => series.includes(s.series) && s.rarity !== 'mythic');
  const swarms = [];
  let guard = 0;
  while (swarms.length < 3 && guard++ < 100) {
    const s = pool[Math.floor(rng() * pool.length)];
    if (!s || swarms.find((x) => x.id === s.id)) continue;
    const copies = { common: 20, rare: 4, epic: 1, legendary: 1 }[s.rarity];
    swarms.push({ id: s.id, copies, price: COPY_PRICE[s.rarity] * copies, cur: 'coins' });
  }
  return {
    free: rng() < 0.5 ? { type: 'coins', amount: 120 } : { type: 'bucks', amount: 8 },
    vials: vials.map((v) => ({ id: v, price: VIAL_PRICES[v], cur: 'bucks' })),
    swarms,
    deals: [
      { id: 'coinPile', label: 'Pile of Coins', coins: 1000, price: 60, cur: 'bucks' },
      { id: 'coinVault', label: 'Coin Vault', coins: 6000, price: 300, cur: 'bucks' },
    ],
  };
}
export function shopBought(key) { return !!P().shop.bought[key]; }
export function markBought(key) { P().shop.bought[key] = true; state.emit('shop'); }

// ---------------------------------------------------------------------------
// Battle results

export function battleRewards({ win, arenaId, mode = 'ranked', opponentTrophies = 0, bossId = null }) {
  const p = P();
  const arenaIdx = Math.max(0, ARENAS.findIndex((a) => a.id === arenaId));
  const res = { coins: 0, trophies: 0, calories: 0, vial: null, cmdXp: 0, levelUps: [], bossResult: null, passTiers: 0 };
  const coinMag = 1 + (perkBonuses().coinMagnet ?? 0) / 100;
  p.stats.battles++;
  if (arenaId === 'mart') p.stats.martBattles++;
  if (win) {
    p.stats.wins++;
    res.coins = Math.round((40 + arenaIdx * 14) * coinMag);
    if (mode === 'ranked') res.trophies = Math.max(18, Math.min(42, 30 + Math.round((opponentTrophies - p.trophies) / 20)));
    res.calories = arenaId === 'mart' ? 160 : 100;
    res.cmdXp = 70;
    if (p.vials.slots.some((s) => !s)) {
      const series = ARENAS.find((a) => a.id === arenaId)?.series?.[0];
      const r = Math.random();
      res.vial = r < 0.02 ? 'gold' : r < 0.1 ? 'mega' : r < 0.42 && series && VIALS[series] ? series : arenaId === 'mart' && r < 0.6 ? 'food' : 'lab';
      addVial(res.vial);
    }
  } else {
    p.stats.losses++;
    res.coins = Math.round(12 * coinMag);
    if (mode === 'ranked') res.trophies = -Math.max(8, Math.min(20, 15 - Math.round((opponentTrophies - p.trophies) / 30)));
    res.calories = 35;
    res.cmdXp = 25;
  }
  if (mode === 'boss' && win && bossId) res.bossResult = bossDefeated(bossId);
  if (mode === 'boss' && !win) res.trophies = 0;
  p.coins += res.coins;
  if (res.trophies) addTrophies(res.trophies);
  res.passTiers = addCalories(res.calories);
  res.levelUps = addCmdXp(p.commanders.equipped, res.cmdXp);
  state.emit('battle');
  return res;
}

export { skipPrice };
