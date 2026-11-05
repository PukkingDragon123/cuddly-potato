// Progression: features unlock one at a time instead of all at once, plus the MAIN QUEST LINE.
// Pure game logic (no DOM): the reveals, the guided tutorial and the quest tracker live in ui/guide.js.
//
//   featureUnlocked(id)   true once the feature's rule is met (or it was revealed, or the save is legacy)
//   featureRevealed(id)   true once its unlock reveal has played (home tabs open on this)
//   onFeatureUnlock(fn)   fn(id) when a feature is revealed
//   lockInfo(id)          { short: '2 WINS', text: 'Win 1 more battle to unlock the Shop.' }
//   mainQuest() / claimMainQuest()   the story quest chain on the home tracker
//
// Unlock schedule (wins = battles won, any mode; Training is itself locked until 3 wins):
//   start   BATTLE only (the tutorial taught cards + Food Throw; base upgrades open right after it)
//   1 win   TROPHY ROAD + CARDS        2 wins  SHOP + FRIENDS + in-battle ULTIMATE
//   3 wins  BATTLE PASS + TRAINING     4 wins  LAB (research)
//   5 wins  LAB SKINS (in the Lab)     6 wins  COMMANDERS (in the Lab)    8 wins  LAB MODULES (in the Lab)
// Saves from before this system (prog.legacy) have everything unlocked.
import { state, currentDeck, grantBundle } from './state.js';

const P = () => state.p;
const wins = (p = P()) => p?.stats?.wins ?? 0;

/**
 * Feature table. wins: battles won to unlock. tab: a home nav tab. quiet: unlocks with a small pop
 * (no voiced reveal). battle: an in-battle feature (taught by a battle lesson). who: who announces it.
 */
export const FEATURES = {
  baseUp: { name: 'Base Upgrades', after: 'tutorial', battle: true },
  road: { name: 'Trophy Road', wins: 1, icon: 'road', who: 'jimmy' },
  cards: { name: 'Cards', wins: 1, tab: true, icon: 'cards', who: 'jimmy' },
  shop: { name: 'Shop', wins: 2, tab: true, icon: 'shop', who: 'nolan' },
  friends: { name: 'Friend Battles', wins: 2, quiet: true, icon: 'friends' },
  ult: { name: 'ULTIMATE', wins: 2, battle: true, icon: 'star', who: 'jimmy' },
  pass: { name: 'Battle Pass', wins: 3, tab: true, icon: 'calorie', who: 'juan' },
  train: { name: 'Training', wins: 3, quiet: true, icon: 'sword' },
  lab: { name: 'Lab', wins: 4, tab: true, icon: 'lab', who: 'jimmy' },
  commanders: { name: 'Commanders', wins: 6, icon: 'crown', who: 'nolan' },
  modules: { name: 'Lab Modules', wins: 8, icon: 'flask', who: 'jimmy' },
  labSkins: { name: 'Lab Skins', wins: 5, quiet: true, icon: 'paint' },
  // names the Lab tab (src/ui/home/lab.js via game/labGear.js featureOpen) asks for
  research: { alias: 'lab' },
  labCommander: { alias: 'commanders' },
  labModules: { alias: 'modules' },
};
for (const [id, f] of Object.entries(FEATURES)) f.id = id;

function ruleMet(f, p) {
  if (f.after === 'tutorial') return p.tutorial === 'done' || p.tutorial === 'home';
  return wins(p) >= (f.wins ?? 0);
}
const prog = (p = P()) => p?.prog ?? { legacy: true, seen: {} };

export function featureUnlocked(id) {
  const p = P();
  const f = FEATURES[id];
  if (f?.alias) return featureUnlocked(f.alias);
  if (!f || !p) return true;
  const g = prog(p);
  return !!(g.legacy || g.seen?.[id] || ruleMet(f, p));
}
/** Has the unlock reveal played (or is the save legacy)? Home tabs stay locked until then. */
export function featureRevealed(id) {
  if (FEATURES[id]?.alias) return featureRevealed(FEATURES[id].alias);
  const g = prog();
  return !FEATURES[id] || !!(g.legacy || g.seen?.[id]);
}
/** Features whose rule is met but whose reveal hasn't played yet, in unlock order. */
export function pendingReveals() {
  const p = P();
  if (!p || prog(p).legacy) return [];
  return Object.values(FEATURES).filter((f) => !f.alias && (!f.battle || f.who)).filter((f) => !prog(p).seen?.[f.id] && ruleMet(f, p)).map((f) => f.id);
}

const unlockFns = new Set();
/** fn(id) runs when a feature is revealed. Returns an unsubscribe function. */
export function onFeatureUnlock(fn) {
  unlockFns.add(fn);
  return () => unlockFns.delete(fn);
}
export function markRevealed(id) {
  const p = P();
  if (!p.prog.seen) p.prog.seen = {};
  if (p.prog.seen[id]) return;
  p.prog.seen[id] = Date.now();
  state.emit('prog');
  for (const fn of unlockFns) { try { fn(id); } catch (e) { console.warn('unlock listener', e); } }
}

/** Short lock label + a sentence for a locked feature. */
export function lockInfo(id) {
  if (FEATURES[id]?.alias) return lockInfo(FEATURES[id].alias);
  const f = FEATURES[id];
  if (!f) return { short: '', text: '' };
  if (f.after === 'tutorial') return { short: 'LOCKED', text: `${f.name} unlock after the tutorial.` };
  const left = Math.max(1, f.wins - wins());
  const short = f.wins === 1 ? '1 WIN' : `${f.wins} WINS`;
  const text = left === 1 ? `Win 1 more battle to unlock the *${f.name}*.` : `Win ${left} more battles to unlock the *${f.name}*.`;
  return { short, text, left };
}

/** One sentence on when a locked feature opens (null once it's open). */
export function featureHint(id) {
  return featureUnlocked(id) ? null : lockInfo(id).text;
}

// ---------------------------------------------------------------------------
// Guided tutorial + battle lesson bookkeeping (steps themselves live in ui/guide.js)

export const guideDone = (id) => !!prog().guide?.[id] || !!prog().legacy || !!prog().guide?.all;
export function setGuideDone(id) {
  const p = P();
  if (!p.prog.guide) p.prog.guide = {};
  p.prog.guide[id] = true;
  // the deck step taught "USE": new cards go straight into free deck slots from now on
  if (id === 'deck' || id === 'all') releaseDeckHold();
  state.emit('prog');
}
export function releaseDeckHold() {
  const p = P();
  if (!p.prog.holdDeck) return;
  p.prog.holdDeck = false;
  const d = currentDeck();
  for (const cid of Object.keys(p.cards)) if (d.length < 8 && !d.includes(cid)) d.push(cid);
  state.emit('deck');
}
export const lessonDone = (id) => !!prog().lessons?.[id] || !!prog().legacy;
export function setLessonDone(id) {
  const p = P();
  if (!p.prog.lessons) p.prog.lessons = {};
  p.prog.lessons[id] = true;
  state.save();
}

// ---------------------------------------------------------------------------
// Main quest line: a short story chain from Jimmy and friends. `val(p)` = current progress
// (absolute), or `stat` + since: counted from when the quest became active.

const researchStarted = (p) => (p.research?.active ? 1 : 0) + Object.values(p.research?.levels ?? {}).reduce((a, b) => a + b, 0);
const upgradedAny = (p) => Math.max(p.stats.upgrades ?? 0, Object.values(p.cards).filter((c) => c.level > 1).length);

export const MAIN_QUESTS = [
  { id: 'firstWin', by: 'jimmy', title: 'Beat Somebody', text: 'Win a battle. Any battle. Jimmy is not picky.', need: 1, val: (p) => p.stats.wins, reward: { coins: 100 } },
  { id: 'openVial', by: 'jimmy', title: 'Pop The Cap', text: 'Open a vial. Shake first, ask questions later.', need: 1, val: (p) => p.stats.vialsOpened, reward: { bucks: 10 } },
  { id: 'upgrade', by: 'jimmy', title: 'Leg Day', text: 'Upgrade a card in the CARDS tab.', need: 1, val: upgradedAny, reward: { coins: 150 }, feature: 'cards' },
  { id: 'deck5', by: 'nolan', title: 'Squad Goals', text: 'Have 5 cards in your battle deck.', need: 5, val: () => currentDeck().length, reward: { vial: 'testTube' }, feature: 'cards' },
  { id: 'baseUps', by: 'jimmy', title: 'Home Improvement', text: 'Upgrade your base 3 times in battles. A tarp is not a building.', need: 3, stat: 'baseUpgrades', since: true, reward: { coins: 200 } },
  { id: 'toilets', by: 'nolan', title: 'Plumbing Emergency', text: 'Deploy 12 Clogged Toilets. Nolan is not cleaning that.', need: 12, stat: 'deploy_cloggedToilet', since: true, reward: { calories: 150 } },
  { id: 'streak', by: 'juan', title: 'On A Roll', text: 'Win 3 battles in a row.', need: 3, val: (p) => p.stats.bestStreak ?? 0, reward: { bucks: 20 } },
  { id: 'research', by: 'jimmy', title: 'For Science', text: 'Start a research in the LAB tab.', need: 1, val: researchStarted, reward: { coins: 300 }, feature: 'lab' },
  { id: 'deck8', by: 'nolan', title: 'Full House', text: 'Fill all 8 deck slots.', need: 8, val: () => currentDeck().length, reward: { vial: 'labPack' }, feature: 'cards' },
  { id: 'ult', by: 'jimmy', title: 'Ultimate Flex', text: 'Use your Commander ULTIMATE 3 times.', need: 3, stat: 'signatures', since: true, reward: { coins: 400 }, feature: 'ult' },
  { id: 'arena2', by: 'nolan', title: 'Leave The Lab', text: 'Reach 300 trophies to open Arena 2.', need: 300, val: (p) => p.bestTrophies, reward: { vial: 'labPack' } },
  { id: 'kingClog', by: 'nolan', title: 'Flush The King', text: 'Beat the King Clog boss in Arena 2.', need: 1, val: (p) => (p.bosses?.kingClog ? 1 : 0), reward: { bucks: 40 } },
  { id: 'arena3', by: 'juan', title: 'Chocolate Or Bust', text: 'Reach 600 trophies to open the Chocolate Factory.', need: 600, val: (p) => p.bestTrophies, reward: { vial: 'megaLab' } },
];
MAIN_QUESTS.forEach((q, i) => (q.index = i));

function mainState() {
  const p = P();
  if (!p.prog.main || typeof p.prog.main !== 'object') p.prog.main = { idx: 0, base: null };
  return p.prog.main;
}
/** The active main quest: { quest, prog, need, done, step, steps, locked } or { finished: true }. */
export function mainQuest() {
  const p = P();
  if (!p?.prog) return null;
  const m = mainState();
  if (m.idx >= MAIN_QUESTS.length) return { finished: true, step: MAIN_QUESTS.length, steps: MAIN_QUESTS.length };
  const q = MAIN_QUESTS[m.idx];
  if (q.since && (m.base === null || m.base === undefined)) { m.base = p.stats[q.stat] ?? 0; state.save(); }
  const raw = q.since ? (p.stats[q.stat] ?? 0) - (m.base ?? 0) : q.val(p);
  const prog = Math.max(0, Math.min(q.need, raw | 0));
  return {
    quest: q, prog, need: q.need, done: prog >= q.need, step: m.idx, steps: MAIN_QUESTS.length,
    locked: q.feature && !featureUnlocked(q.feature) ? q.feature : null,
  };
}
export const mainQuestClaimable = () => !!mainQuest()?.done;
/** Claim the finished main quest: grants its reward, moves to the next one. Returns reward display objects. */
export function claimMainQuest() {
  const st = mainQuest();
  if (!st || st.finished || !st.done) return null;
  const m = mainState();
  m.idx++;
  m.base = null;
  const got = grantBundle(st.quest.reward);
  mainQuest(); // snapshot the next quest's starting point
  state.emit('quests');
  return { quest: st.quest, rewards: got };
}
