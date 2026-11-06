// TROOP MASTERY: every troop card has 5 mastery levels, earned by playing it.
//
//   1 BRONZE    deploy it N times                      -> Beast Coins
//   2 SILVER    win N battles with it in your deck     -> its PICTURE (profile avatar)
//   3 GOLD      knock out N enemies with it            -> its FRAME (troop-themed avatar frame)
//               (siege troops: damage to bases, support troops: deploys)
//   4 PLATINUM  deal N damage with it                  -> its BANNER + coins
//               (support troops: wins with it in the deck)
//   5 MASTER    deploy it N times AND win N battles     -> the "<Troop> Master" TITLE + Beast Bucks
//
// Progress is cumulative (counted from the first battle), so a level can be complete the moment
// the one before it is claimed. Levels are claimed in order (src/ui/home/masteryUI.js).
// Stats per card live in state.p.mastery[id] = { p: deploys, w: wins in deck, k: KOs, d: damage,
// b: damage to bases, c: levels claimed }. They are recorded after every battle from the battle's
// per-card counts (src/scenes/battle.js -> battleRewards -> recordMastery).
//
// Pure data + helpers (take the profile `p`); the state wiring is in src/game/state.js.
import { SWARMS } from './swarms.js';
import { cardDef } from './cards.js';
import { PU } from './labs.js';
import { MASTERY_CARDS, MASTERY_NAMES } from './profileItems.js';

export { MASTERY_CARDS, MASTERY_NAMES };
export const MASTERY_MAX = 5;
/** Level crest colours (badge, panel, claim burst). */
export const MASTERY_COLORS = ['#e9874a', '#cdd5ea', '#ffc21a', '#5ee8f0', '#ff4fa3'];
const COINS = { common: [150, 400], rare: [250, 600], epic: [400, 900], legendary: [600, 1400], mythic: [800, 1800] };
const BUCKS = { common: 25, rare: 35, epic: 50, legendary: 70, mythic: 90 };

export const isMasteryCard = (id) => MASTERY_CARDS.includes(id);
const fmt = (n) => n.toLocaleString('en-US');
const TASK_TEXT = {
  p: (n) => `Deploy it ${fmt(n)} times`,
  w: (n) => `Win ${fmt(n)} battles with it in your deck`,
  k: (n) => `Knock out ${fmt(n)} enemies`,
  d: (n) => `Deal ${fmt(n)} damage`,
  b: (n) => `Deal ${fmt(n)} damage to bases`,
};
export const TASK_ICON = { p: 'swarm', w: 'trophy', k: 'skull', d: 'sword', b: 'tower' };

const trackCache = new Map();
/** The 5 levels of a card: [{ level, name, color, tasks: [{ stat, n, text }], rewards: [reward defs] }] */
export function masteryTrack(id) {
  if (trackCache.has(id)) return trackCache.get(id);
  const d = cardDef(id), sw = SWARMS[id];
  if (!d || !sw) return null;
  const cost = Math.max(1, Math.round((d.elixir ?? 3 * PU) / PU)); // old 1-10 scale: keeps the task counts stable
  const dep = Math.max(5, Math.min(15, Math.round(30 / cost)));
  const role = sw.role, rar = d.rarity ?? 'common';
  const coins = COINS[rar] ?? COINS.common;
  const gold = role === 'siege' ? { stat: 'b', n: 4000 } : role === 'support' ? { stat: 'p', n: dep * 3 } : { stat: 'k', n: role === 'tank' ? 25 : 35 };
  const plat = role === 'siege' ? { stat: 'b', n: 15000 } : role === 'support' ? { stat: 'w', n: 15 } : { stat: 'd', n: role === 'swarm' ? 12000 : 20000 };
  const levels = [
    { tasks: [{ stat: 'p', n: dep }], rewards: [{ type: 'coins', amount: coins[0] }] },
    { tasks: [{ stat: 'w', n: 5 }], rewards: [{ type: 'avatar', id: 'troop_' + id }] },
    { tasks: [gold], rewards: [{ type: 'frame', id: 'm_' + id }] },
    { tasks: [plat], rewards: [{ type: 'banner', id: 'mb_' + id }, { type: 'coins', amount: coins[1] }] },
    { tasks: [{ stat: 'p', n: dep * 6 }, { stat: 'w', n: 20 }], rewards: [{ type: 'title', id: 'tm_' + id }, { type: 'bucks', amount: BUCKS[rar] ?? 25 }] },
  ].map((L, i) => ({ ...L, level: i + 1, name: MASTERY_NAMES[i], color: MASTERY_COLORS[i], tasks: L.tasks.map((t) => ({ ...t, text: TASK_TEXT[t.stat](t.n) })) }));
  trackCache.set(id, levels);
  return levels;
}

const blank = () => ({ p: 0, w: 0, k: 0, d: 0, b: 0, c: 0 });
/** A card's mastery record (read-only view when missing). */
export const masteryOf = (p, id) => p?.mastery?.[id] ?? blank();

/**
 * Where a card stands: { claimed (levels claimed 0-5), level (the next level def or null at max),
 * tasks: [{ ..., have, done }], done (next level complete = claimable), max }
 */
export function masteryStatus(p, id) {
  const tr = masteryTrack(id);
  if (!tr) return null;
  const m = masteryOf(p, id);
  const claimed = Math.max(0, Math.min(MASTERY_MAX, m.c | 0));
  const L = tr[claimed] ?? null;
  const tasks = L ? L.tasks.map((t) => ({ ...t, have: Math.min(t.n, Math.floor(m[t.stat] ?? 0)), done: (m[t.stat] ?? 0) >= t.n })) : [];
  return { id, claimed, level: L, tasks, done: !!L && tasks.every((t) => t.done), max: claimed >= MASTERY_MAX };
}
/** Number of cards with a mastery level ready to claim. */
export function masteryClaimable(p) {
  let n = 0;
  for (const id of Object.keys(p?.cards ?? {})) if (isMasteryCard(id) && masteryStatus(p, id)?.done) n++;
  return n;
}

/**
 * Add one battle's per-card counts. b = { deck: [ids], win, plays: {id: n}, kos, dmg, base }.
 * Returns the cards whose next level just became claimable: [{ id, level }].
 */
export function recordMastery(p, b) {
  if (!p || !b) return [];
  p.mastery ??= {};
  const ids = new Set([...(b.deck ?? []), ...Object.keys(b.plays ?? {}), ...Object.keys(b.kos ?? {}), ...Object.keys(b.dmg ?? {})]);
  const ready = [];
  for (const id of ids) {
    if (!isMasteryCard(id) || !p.cards?.[id]) continue;
    const before = masteryStatus(p, id)?.done;
    const m = (p.mastery[id] ??= blank());
    m.p += Math.max(0, b.plays?.[id] | 0);
    m.k += Math.max(0, b.kos?.[id] | 0);
    m.d += Math.max(0, Math.round(b.dmg?.[id] ?? 0));
    m.b += Math.max(0, Math.round(b.base?.[id] ?? 0));
    if (b.win && b.deck?.includes(id)) m.w += 1;
    const st = masteryStatus(p, id);
    if (st?.done && !before) ready.push({ id, level: st.level.level });
  }
  return ready;
}
