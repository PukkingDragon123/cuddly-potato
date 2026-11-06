// Guided first session + progressive unlock presentation (logic in game/progression.js).
//
//   Home:   locked nav tabs / side buttons / TRAIN / vial slots / profile picture are BLACKED OUT (a
//           dark silhouette of the button with a small padlock; tap = shake + what unlocks it), the
//           unlock REVEAL (spotlight, the padlock rattles and breaks, the button floods back from black
//           to full colour, a short voiced line from Jimmy / Nolan / Juan), the GUIDED STEPS (a
//           pointing hand + spotlight that follows whatever you need to tap next: claim the Trophy
//           Road, open your first vial, put a card in your deck, upgrade...), each skippable, and the
//           MAIN QUEST tracker (a pinned note: quest, objective, progress, reward, "!" when claimable;
//           tap = the QUEST BOARD, ui/home/questBoard.js).
//   Battle: locked ULT / BASE buttons (blacked out the same way), battle lessons (base upgrades in your
//           first ranked battle, the ULTIMATE once it unlocks), rival fairness (no rival ULT while
//           yours is locked).
//
// Other screens can mark a tap target for the guide with data-guide="<step target>" (e.g. the
// research tree's start button: data-guide="research").
import './guide.css';
import { h, icon, animIcon, button, say, pointAt, toast, burst, sparkle, confetti, $overlay, rich, closeDialogue, iconURL } from './ui.js';
import { audio } from '../core/audio.js';
import { charPortrait } from './thumbs.js';
import { frameSkin } from './skin.js';
import { ensureBoardArt, tallyURL } from './home/questBoardArt.js';
import { state, upgradeInfo, currentDeck, passClaimable, trophyRoadClaimable, refreshDaily, challengeList, questState } from '../game/state.js';
import { QUEST_CHAINS } from '../data/arenas.js';
import { STARTER_CARDS } from '../data/cards.js';
import {
  FEATURES, featureUnlocked, featureRevealed, pendingReveals, markRevealed, lockInfo, guideDone, setGuideDone, releaseDeckHold,
  lessonDone, setLessonDone, mainQuest, chapterOf,
} from '../game/progression.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const P = () => state.p;

// ---------------------------------------------------------------------------
// Speakers (the dialogue system voices them: voiceOf in data/characters.js)

const WHO = {
  jimmy: { name: 'Jimmy', char: 'jimmy', color: '#2b8cf2', eyes: 'happy', mouth: 'grin' },
  nolan: { name: 'Nolan', char: 'nolan', color: '#3fbf5f', eyes: 'happy', mouth: 'grin' },
  juan: { name: 'Juan', char: 'juan', color: '#ff8a1f', eyes: 'happy', mouth: 'grin' },
  // the Shop's "totally different guy" (Nolan in a fedora)
  lonan: { name: 'Lonan', char: 'shadyNolan', color: '#d8a548', eyes: 'normal', mouth: 'smile' },
};
export function speaker(id, mood = {}) {
  const w = WHO[id] ?? WHO.jimmy;
  const eyes = mood.eyes ?? w.eyes, mouth = mood.mouth ?? w.mouth;
  let portrait = null;
  try { portrait = charPortrait(w.char, { eyes, mouth }); } catch (e) { /* face cam still works */ }
  return { name: w.name, char: w.char, color: w.color, eyes, mouth, portrait };
}

// ---------------------------------------------------------------------------
// Copy: reveal lines (short, specific, in the lab's voice)

const REVEAL = {
  road: { who: 'jimmy', cap: 'TROPHY ROAD', line: 'Your first win! Trophies push you up the *TROPHY ROAD*, and every few steps there is a new Swarm waiting. Go grab yours.' },
  cards: { who: 'jimmy', cap: 'CARDS', line: 'New cards go in the *CARDS* tab. That is where you build your deck and make your Swarms bigger.' },
  shop: { who: 'nolan', cap: 'SHOP', line: 'Psst. The *SHOP* is open. There is a guy in a bunker. Do not ask where he gets the cards. Free gift every day though!' },
  ult: { who: 'jimmy', cap: 'ULTIMATE', line: 'Next battle your Commander gets an *ULTIMATE*. It charges while you fight. When it glows, smash that button.' },
  pass: { who: 'juan', cap: 'BATTLE PASS', line: 'Every battle feeds you *Calories*. Calories fill the *BATTLE PASS*. Tier 2 is a free new troop. You are welcome.' },
  lab: { who: 'jimmy', cap: 'THE LAB', line: 'You earned a key to *THE LAB*. Research makes every Swarm stronger, even while you sleep. Science!' },
  commanders: { who: 'nolan', cap: 'COMMANDERS', line: 'You can swap *COMMANDERS* in the Lab now. Beat the right people and they join your team. Like me. Eventually.' },
  modules: { who: 'jimmy', cap: 'LAB MODULES', line: 'Your base can take *MODULES* now. Bolt stuff onto it in the Lab. What could go wrong?' },
  baseUp: { who: 'jimmy', cap: 'BASE UPGRADES', line: 'Next battle you can *UPGRADE YOUR BASE* mid-fight. A tarp becomes a shack, a shack becomes a lab. More POWER every step.' },
  profile: { who: 'nolan', cap: 'PROFILE', line: 'You have a *PROFILE* now. Tap your name up top to dress it up. Rivals see it before every battle, so make it loud.' },
  entrances: { who: 'juan', cap: 'BATTLE ENTRANCES', line: 'Big news: *BATTLE ENTRANCES*. Your Commander can arrive in style now. Smoke, lasers, a shopping cart. Your call.' },
};
const QUIET = {
  vials: 'Vial slots unlocked! Wins drop vials in here.',
  friends: 'Friend battles unlocked!',
  emotes: 'Emotes unlocked! Tap the Beast logo in battle to taunt your rival.',
  train: 'Training unlocked! Practice against the bot any time.',
  labSkins: 'Lab skins unlocked! Repaint your base in the Lab.',
  mastery: 'Troop mastery unlocked! Your Swarms level up their skills as you play them.',
};

// ---------------------------------------------------------------------------
// Guided steps: each one points at the next thing to tap (first visible target wins)

const hasSpare = () => Object.keys(P().cards).some((id) => !currentDeck().includes(id));
const canUpgradeAny = () => Object.keys(P().cards).some((id) => { const u = upgradeInfo(id); return u && !u.max && u.ok; });
const upgradedAny = () => (P().stats.upgrades ?? 0) > 0 || Object.values(P().cards).some((c) => c.level > 1);

const STEPS = {
  road: {
    feature: 'road', chip: 'Claim your first Trophy Road reward',
    can: () => trophyRoadClaimable().length > 0,
    done: () => Object.keys(P().trophyRoad).length > 0,
    targets: [['[data-guide="road-claim"]', 'Claim!'], ['.trd-claim', 'Claim!'], ['.trd-ready', 'Tap!'], ['.mn-tr .btn.sk-btn-green.pulse', 'Claim!'], ['.hm-sb-road', 'Road']],
  },
  vial: {
    feature: 'vials', chip: 'Open your vial', who: 'jimmy',
    line: 'Battles drop *vials*. This one comes pre-shaken. Tap it and pour out your loot!',
    can: () => P().vials.slots.some(Boolean),
    done: () => (P().stats.vialsOpened ?? 0) > 0,
    targets: [['.modal-back .btn.sk-btn-purple', 'Open!'], ['.hm-slot.ready', 'Open!'], ['.hm-slot.locked', 'Tap!']],
  },
  deck: {
    feature: 'cards', chip: 'Put a new card in your deck', who: 'jimmy',
    line: 'Your new card is not in your deck yet. Tap it, hit *USE*, then drop it in an empty slot.',
    can: () => hasSpare() && currentDeck().length < 8,
    done: () => currentDeck().some((id) => !STARTER_CARDS.includes(id)),
    targets: [['.mn-deck.swapping .mn-cc:has(.mn-empty)', 'Here!'], ['.mn-cpop .btn.sk-btn-green', 'Use'], ['.mn-cgrid:not(.locked) .mn-cc', 'Tap!'], ['.hm-tabbtn[data-tab="cards"]:not(.on)', 'Cards']],
  },
  upgrade: {
    feature: 'cards', chip: 'Upgrade a card', who: 'nolan',
    line: 'See the green arrow? That card has enough copies to level up. Bigger Swarm, bigger hits.',
    can: () => canUpgradeAny(),
    done: () => upgradedAny(),
    targets: [['[data-guide="upgrade"]', 'Upgrade!'], ['.modal-back .btn.sk-btn-yellow', 'Upgrade!'], ['.mn-cpop .btn.sk-btn-yellow', 'Upgrade'], ['.mn-cc.can-up', 'Tap!'], ['.hm-tabbtn[data-tab="cards"]:not(.on)', 'Cards']],
  },
  shop: {
    feature: 'shop', chip: 'Grab the free daily gift', who: 'nolan',
    can: () => !(P().shop.freeClaimed || P().shop.bought?.free),
    done: () => !!(P().shop.freeClaimed || P().shop.bought?.free),
    targets: [['.bk-gift .btn', 'Free!'], ['.hm-tabbtn[data-tab="shop"]:not(.on)', 'Shop']],
  },
  pass: {
    feature: 'pass', chip: 'Claim your free troop on tier 2',
    can: () => passClaimable(1, 'free'),
    done: () => !!P().pass.free[1],
    targets: [['.pz-ctag[aria-label="Claim tier 2 free reward"]', 'Free troop!'], ['.pz-card-claim', 'Claim!'], ['.pz-claimbar', 'Claim!'], ['.pz-ctag.free', 'Claim!'], ['.hm-tabbtn[data-tab="pass"]:not(.on)', 'Pass']],
  },
  profile: {
    feature: 'profile', chip: 'Open your profile', visit: true,
    targets: [['.hm-prof', 'Profile']],
  },
  commanders: {
    feature: 'commanders', chip: 'Meet the Commanders in the Lab', visit: true,
    targets: [['[data-seg="commander"]', 'Commanders'], ['.lx-seg .mn-seg-b:nth-child(4)', 'Commanders'], ['.hm-tabbtn[data-tab="lab"]:not(.on)', 'Lab']],
    visitSel: '[data-seg="commander"], .lx-seg .mn-seg-b:nth-child(4)',
  },
  modules: {
    feature: 'modules', chip: 'Bolt a module onto your base', visit: true,
    targets: [['[data-seg="modules"]', 'Modules'], ['.lx-seg .mn-seg-b:nth-child(2)', 'Modules'], ['.hm-tabbtn[data-tab="lab"]:not(.on)', 'Lab']],
    visitSel: '[data-seg="modules"], .lx-seg .mn-seg-b:nth-child(2)',
  },
  research: {
    feature: 'lab', chip: 'Start your first research', who: 'jimmy',
    line: 'Pick something in the research tree and hit START. It keeps cooking while you battle.',
    can: () => featureUnlocked('lab'),
    done: () => !!P().research?.active || Object.values(P().research?.levels ?? {}).some((v) => v > 0),
    targets: [['[data-guide="research"]', 'Start!'], ['.rs-sh-foot .btn.sk-btn-green', 'Start!'], ['.rs-bench-act .btn.sk-btn-green', 'Pick!'], ['.lx-rs', 'Research'], ['.hm-tabbtn[data-tab="lab"]:not(.on)', 'Lab']],
  },
};
// reveal / step order for the first session
const SEQ = [
  { reveal: 'road' }, { step: 'road' }, { reveal: 'vials' }, { step: 'vial' },
  { reveal: 'cards' }, { step: 'deck' }, { step: 'upgrade' }, { reveal: 'baseUp' },
  { reveal: 'shop' }, { step: 'shop' }, { reveal: 'friends' }, { reveal: 'emotes' },
  { reveal: 'pass' }, { step: 'pass' }, { reveal: 'ult' },
  { reveal: 'lab' }, { step: 'research' }, { reveal: 'train' },
  { reveal: 'profile' }, { step: 'profile' }, { reveal: 'labSkins' },
  { reveal: 'commanders' }, { step: 'commanders' }, { reveal: 'mastery' },
  { reveal: 'entrances' },
  { reveal: 'modules' }, { step: 'modules' },
];

// ---------------------------------------------------------------------------
// Target resolution: the first selector with a visible element (inside an open modal if there is one)

function visible(el, onScreen = true) {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (onScreen && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) return false;
  for (let e = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
  }
  return true;
}
/** Scroll the nearest real scroll box (overflow auto / scroll) so el sits in its middle. Never
 *  scrollIntoView: that also scrolls overflow:hidden layers and shifts the whole screen. */
function scrollToEl(el) {
  for (let sc = el.parentElement; sc; sc = sc.parentElement) {
    const oy = getComputedStyle(sc).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight + 2) {
      const r = el.getBoundingClientRect(), b = sc.getBoundingClientRect();
      sc.scrollBy({ top: r.top + r.height / 2 - (b.top + b.height / 2), behavior: 'smooth' });
      return;
    }
  }
}
function blocked() {
  return !!document.querySelector('#overlay .cdlg:not(.passive), #overlay .vo-wrap, #overlay .res-wrap');
}
// screens that sit over the lobby: modals, the island Trophy Road view (ui/home/trophyRoad.js) and the
// QUEST BOARD (ui/home/questBoard.js)
const SCREENS = '#overlay .modal-back, #ui .modal-back, #overlay .trd:not(.out), #overlay .qb:not(.out)';
const busy = () => blocked() || !!document.querySelector(SCREENS);
function resolveTarget(targets) {
  if (blocked()) return null;
  const modals = [...document.querySelectorAll(SCREENS)];
  const top = modals[modals.length - 1] ?? null;
  for (const [sel, tip] of targets) {
    for (const el of document.querySelectorAll(sel)) {
      if (top && !top.contains(el)) continue;
      if (!visible(el, false) || el.closest('.out')) continue;
      // scrolled away or clipped by a scroll box (or under the nav)? scroll it into view once
      const r = el.getBoundingClientRect();
      const hit = r.bottom > 0 && r.top < innerHeight ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      if ((!hit || (hit !== el && !el.contains(hit))) && !el._gdScrolled) {
        el._gdScrolled = true;
        scrollToEl(el);
      }
      return { el, tip };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Spotlight: dims the screen around a rectangle, framed by stepped pixel corner brackets

function spotlight(getEl, o = {}) {
  const el = h('div', { class: `gd-spot ${o.strong ? 'strong' : ''}` }, h('i', { class: 'tl' }), h('i', { class: 'tr' }), h('i', { class: 'bl' }), h('i', { class: 'br' }));
  $overlay().appendChild(el);
  let raf = 0, alive = true;
  const tick = () => {
    if (!alive) return;
    const t = getEl();
    if (!t || !t.isConnected) el.classList.add('off');
    else {
      const r = t.getBoundingClientRect();
      const pad = o.pad ?? 6;
      el.classList.remove('off');
      el.style.left = r.left - pad + 'px';
      el.style.top = r.top - pad + 'px';
      el.style.width = r.width + pad * 2 + 'px';
      el.style.height = r.height + pad * 2 + 'px';
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return { el, remove() { alive = false; cancelAnimationFrame(raf); el.classList.add('bye'); setTimeout(() => el.remove(), 260); } };
}

// ---------------------------------------------------------------------------
// HOME: locks, reveals, steps, quest tracker

let home = null;
let cleanup = [];
const alive = (hm) => hm && home === hm && !hm.exited && hm.root?.isConnected;

/** Which home element stands for a feature. */
function featureEl(hm, id) {
  if (!hm?.root) return null;
  const f = FEATURES[id];
  if (f?.tab) return hm.navBtns?.find((b) => b.dataset.tab === id) ?? null;
  if (id === 'road') return hm.roadBtn ?? hm.root.querySelector('.hm-sb-road');
  if (id === 'friends') return hm.root.querySelector('.hm-sb-fr');
  if (id === 'train') return hm.practiceBtn ?? null;
  if (id === 'vials') return hm.slotsEl ?? null;
  if (id === 'profile') return hm.root.querySelector('.hm-prof');
  if (id === 'commanders' || id === 'modules' || id === 'labSkins') return hm.navBtns?.find((b) => b.dataset.tab === 'lab') ?? null;
  return null;
}

// Locked = BLACKED OUT: the element keeps its shape as a dark silhouette (CSS: guide.css .pg-lock),
// its icon / label go black, and a small padlock sits on it. No "2 WINS" text: a tap shakes it and a
// toast says what opens it.
let padIcon = false;
function padEl(cls = '') {
  if (!padIcon) {
    padIcon = true;
    try {
      document.documentElement.style.setProperty('--pg-lock-ic', `url(${iconURL('lock')})`);
      // the blacked-out jelly button: same 9-slice geometry as the .sk-btn-* skins, all ink
      const sk = frameSkin({ w: 20, h: 22, r: 4, lip: 3, topRows: 8, dither: true, gloss: false, glint: false, bubbles: false, deep: 3, shadow: '#000000', fill: '#15131f', top: '#1d1b2b', lipColor: '#07060c', hi: '#3a3a56', lo: '#0c0b14', deepColor: '#110f1a', outline: '#000000' });
      document.documentElement.style.setProperty('--pg-dark-btn', `url(${sk.url})`);
    } catch (e) { /* plain fallback in CSS */ }
  }
  return h('i', { class: `pg-pad ${cls}`, 'aria-hidden': 'true' });
}
function setPads(host, n, on) {
  const have = host.querySelectorAll(':scope > .pg-pad');
  if (!on) { have.forEach((p) => p.remove()); return; }
  if (have.length === n) return;
  have.forEach((p) => p.remove());
  for (let k = 0; k < n; k++) host.appendChild(padEl(n > 1 ? `k${k}` : ''));
}

function decorate(hm) {
  for (const id of ['road', 'vials', 'cards', 'shop', 'friends', 'pass', 'train', 'lab', 'profile', 'roadSign']) {
    // the arena sign opens the Trophy Road too: same gate, no second lock
    const el = id === 'roadSign' ? hm.zBox : featureEl(hm, id);
    if (!el) continue;
    if (id === 'roadSign') {
      el.classList.toggle('pg-gate', !featureRevealed('road'));
      if (!el._pgGate) {
        el._pgGate = true;
        el.addEventListener('click', (e) => { if (!el.classList.contains('pg-gate')) return; e.stopImmediatePropagation(); e.preventDefault(); denyLocked('road', hm.roadBtn); }, true);
      }
      continue;
    }
    if (el.classList.contains('pg-unveil')) continue; // mid-reveal
    const locked = !featureRevealed(id);
    el.classList.toggle('pg-lock', locked);
    el.querySelector(':scope > .pg-lk')?.remove(); // the old "2 WINS" chip (older builds)
    // the profile keeps your name + Lab Level readable: only the picture blacks out
    const host = id === 'profile' ? el.querySelector('.hm-av') ?? el : el;
    setPads(host, id === 'vials' ? hm.slotEls?.length ?? 4 : 1, locked);
    if (locked) el.dataset.tip = lockInfo(id).text;
    else if (el.dataset.tip && el.dataset.tip.startsWith('Win ')) delete el.dataset.tip;
    if (!el._pgGate) {
      el._pgGate = true;
      // locked: swallow the tap before the element's own handler runs
      el.addEventListener('click', (e) => {
        if (!el.classList.contains('pg-lock')) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        denyLocked(id, el);
      }, true);
    }
  }
}
function denyLocked(id, el) {
  audio.play('deny');
  el?.classList.remove('pg-shake');
  void el?.offsetWidth;
  el?.classList.add('pg-shake');
  toast(lockInfo(id).text, { icon: 'lock' });
}

/** Called by HomeScene.setTab: false (and a "locked" toast) for a tab that hasn't unlocked yet. */
export function tabAllowed(id) {
  if (id === 'battle' || !FEATURES[id] || featureRevealed(id)) return true;
  denyLocked(id, featureEl(home, id));
  return false;
}

/** HomeScene.buildUI: lock decorations + the quest tracker. */
export function mountHome(hm) {
  home = hm;
  // safety net: never keep new cards out of the deck for long
  if (P().prog?.holdDeck && (P().stats.wins ?? 0) >= 3) releaseDeckHold();
  decorate(hm);
  mountTracker(hm);
}
/** HomeScene.refresh */
export function refreshHome(hm) {
  if (home !== hm || !hm.root) return;
  if (!revealing) decorate(hm);
  updateTracker();
}
/** HomeScene.afterEnter (lobby on screen): play pending reveals, then the next guided step. */
export async function homeReady(hm) {
  home = hm;
  if (hm._guideRunning) return;
  hm._guideRunning = true;
  try {
    await wait(0.6);
    while (alive(hm)) {
      const p = P();
      if (!p.prog || p.prog.legacy || p.tutorial !== 'done') break;
      // first session order: a reveal, then its steps, then the next reveal. A step you already saw on
      // an earlier visit waits behind any newly unlocked reveal (so it never holds a tab locked).
      const rvs = pendingReveals();
      const todo = SEQ.filter((x) => (x.reveal ? rvs.includes(x.reveal) : !guideDone(x.step) && featureRevealed(STEPS[x.step].feature)));
      let it = todo[0];
      if (!it) break;
      if (it.step && p.prog.said?.[it.step] && todo.some((x) => x.reveal)) it = todo.find((x) => x.reveal);
      // nothing new talks over an open screen (card info, the Trophy Road view...)
      if (busy() || (it.reveal && hm.tab !== 'battle')) { await wait(0.4); continue; }
      if (it.reveal) { await reveal(hm, it.reveal); continue; }
      const r = await runStep(hm, it.step);
      if (r === 'left') break;
    }
  } catch (e) { console.warn('guide stopped', e); }
  hm._guideRunning = false;
}
export function leaveHome(hm) {
  if (home === hm) home = null;
  for (const fn of cleanup) { try { fn(); } catch (e) { /* gone */ } }
  cleanup = [];
  trackerEl = null;
}

// ---------------------------------------------------------------------------
// The unlock reveal

let revealing = false;
async function reveal(hm, id) {
  const el = featureEl(hm, id);
  if (QUIET[id]) {
    // a short rattle, then the padlock snaps (decorate() waits so the pads are still there to break)
    revealing = true;
    try {
      if (el && alive(hm)) {
        el.classList.add('pg-rattle');
        audio.play('rattle');
        await wait(0.45);
      }
      markRevealed(id);
      if (el) unlockAnim(el);
      audio.play('shatter', { vol: 0.6 });
    } finally { revealing = false; }
    toast(QUIET[id], { icon: FEATURES[id].icon ?? 'star' });
    audio.play('levelUp');
    await wait(0.5);
    return;
  }
  const R = REVEAL[id];
  revealing = true;
  closeDialogue();
  // the tab under the spotlight: back on the island first so it's in view
  if (hm.tab && hm.tab !== 'battle' && FEATURES[id]?.tab) hm.setTab('battle');
  const catcher = h('div', { class: 'gd-catch' });
  $overlay().appendChild(catcher);
  const spot = el ? spotlight(() => el, { strong: true, pad: 4 }) : null;
  const cap = h('div', { class: 'gd-cap' }, h('span', { class: 'gd-cap-k' }, 'UNLOCKED'), h('b', {}, R?.cap ?? FEATURES[id].name.toUpperCase()));
  try {
    audio.play('whoosh', { pitch: 0.8 });
    await wait(0.55);
    if (el) {
      el.classList.add('pg-rattle');
      audio.play('rattle');
      await wait(0.75);
    }
    markRevealed(id);
    $overlay().appendChild(cap);
    placeCap(cap, el);
    audio.play('shatter');
    audio.play('levelUp');
    if (el) unlockAnim(el);
    confetti($overlay(), { count: 28, spread: 0.4, life: 3 });
    await wait(1.5);
    // the caption makes way for the line
    cap.classList.add('bye');
    if (R && alive(hm)) {
      const r = el?.getBoundingClientRect();
      await say(speaker(R.who), R.line, { place: r && r.top > innerHeight * 0.5 ? 'top' : 'bottom' });
    }
  } finally {
    cap.classList.add('bye');
    setTimeout(() => cap.remove(), 300);
    spot?.remove();
    catcher.remove();
    revealing = false;
    if (alive(hm)) decorate(hm);
  }
}
function placeCap(cap, el) {
  const r = el?.getBoundingClientRect();
  if (!r) { cap.style.left = '50%'; cap.style.top = '40%'; return; }
  const cx = Math.max(110, Math.min(innerWidth - 110, r.left + r.width / 2));
  cap.style.left = cx + 'px';
  // above the element when it sits low (nav tabs), under it otherwise (side buttons)
  if (r.top > innerHeight * 0.5) { cap.style.top = r.top - 14 + 'px'; cap.classList.add('up'); } else cap.style.top = r.bottom + 14 + 'px';
}
/** The padlock snaps: its two halves and the shackle fly off as pixel shards. */
function breakPad(pad) {
  const r = pad.getBoundingClientRect();
  pad.remove();
  if (!r.width || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const parts = [['l', -1, 0.3], ['r', 1, 0.3], ['s', 0.2, -1]];
  for (const [k, dx, dy] of parts) {
    const sh = h('i', { class: `pg-shard ${k}`, style: { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' } });
    $overlay().appendChild(sh);
    const ex = dx * (24 + Math.random() * 20), ey = dy * (26 + Math.random() * 12);
    sh.animate([
      { transform: 'translate(0, 0)', opacity: 1 },
      { transform: `translate(${ex * 0.6}px, ${ey * 0.6 - 14}px)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${ex}px, ${ey + 46}px) rotate(${dx * 90}deg)`, opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.3,.6,.6,1)' }).onfinish = () => sh.remove();
  }
  sparkle(pad.isConnected ? pad : { getBoundingClientRect: () => r, isConnected: true }, { count: 10, spread: 34, colors: ['#ffd84a', '#ffffff', '#c8ccd8'] });
}
function unlockAnim(el) {
  el.querySelectorAll('.pg-pad').forEach(breakPad);
  el.classList.remove('pg-rattle', 'pg-lock', 'pg-unveil');
  el.querySelector(':scope > .pg-lk')?.remove();
  void el.offsetWidth;
  // black silhouette -> white flash -> full colour, with a springy pop
  el.classList.add('pg-unveil');
  setTimeout(() => el.classList.remove('pg-unveil'), 1150);
  setTimeout(() => {
    burst(el, { color: '#ffd84a', count: 26, scale: 1.8, ring: false });
    sparkle(el, { count: 18, spread: 90 });
  }, 380);
  // the NEW tag stays until the feature is first used
  if (!el.querySelector(':scope > .pg-newtag')) {
    const tag = h('i', { class: 'pg-newtag' }, 'NEW');
    el.appendChild(tag);
    const off = () => { tag.remove(); el.removeEventListener('click', off); };
    el.addEventListener('click', off);
  }
}

// ---------------------------------------------------------------------------
// A guided step

async function runStep(hm, id) {
  const S0 = STEPS[id];
  // "visit" steps (profile, commanders, modules) finish when you tap what they point at
  let hit = false;
  const S = S0.visit ? { ...S0, can: () => featureRevealed(S0.feature), done: () => hit } : S0;
  const p = P();
  if (S.done()) { setGuideDone(id); return 'done'; }
  if (!S.can()) { setGuideDone(id); return 'na'; }
  if (!p.prog.said) p.prog.said = {};
  // let an open screen (trophy road, card info...) close before the next step talks
  while (alive(hm) && busy()) await wait(0.3);
  if (!alive(hm)) return 'left';
  if (S.done()) { setGuideDone(id); return 'done'; }
  const first = !p.prog.said[id];
  p.prog.said[id] = true;
  state.save();
  if (S.line && first) {
    const t = resolveTarget(S.targets);
    const r = t?.el.getBoundingClientRect();
    await say(speaker(S.who ?? 'jimmy'), S.line, { place: r && r.top > innerHeight * 0.5 ? 'top' : 'bottom' });
    if (!alive(hm)) return 'left';
  }
  return new Promise((resolve) => {
    let cur = null, ptr = null, iv = 0, finished = false;
    const spot = spotlight(() => cur?.el ?? null, { pad: 5 });
    const chip = h('div', { class: 'gd-chip' },
      h('i', { class: 'gd-chip-ic' }, icon('quest')),
      h('span', { class: 'gd-chip-t', html: rich(S.chip) }),
      button('SKIP', () => end('skip'), 'gray sm gd-skip', { sound: 'tap' }));
    hm.root.appendChild(chip);
    const end = (how) => {
      if (finished) return;
      finished = true;
      clearInterval(iv);
      document.removeEventListener('click', onHit, true);
      ptr?.();
      spot.remove();
      if (how === 'done' || how === 'skip') setGuideDone(id);
      if (how === 'done') {
        chip.classList.add('ok');
        chip.querySelector('.gd-chip-t').textContent = 'Nice!';
        audio.play('coin', { pitch: 1.3 });
        sparkle(chip, { count: 14 });
        setTimeout(() => chip.remove(), 900);
      } else chip.remove();
      cleanup = cleanup.filter((f) => f !== kill);
      setTimeout(() => resolve(how), how === 'done' ? 950 : 50);
    };
    const kill = () => { document.removeEventListener('click', onHit, true); end('left'); };
    cleanup.push(kill);
    const visitSel = S0.visitSel ?? S0.targets[0][0];
    const onHit = (e) => { if (S0.visit && e.target instanceof Element && e.target.closest(visitSel)) hit = true; };
    if (S0.visit) document.addEventListener('click', onHit, true);
    const tick = () => {
      if (!alive(hm)) return end('left');
      if (S.done()) return end('done');
      if (!S.can() && !S.done()) return end('skip');
      const t = resolveTarget(S.targets);
      chip.classList.toggle('hide', blocked());
      // the chip keeps clear of what it points at: at the top when the target sits low, else at the bottom
      if (t) {
        const r = t.el.getBoundingClientRect();
        const low = r.top + r.height / 2 > innerHeight * 0.5;
        chip.classList.toggle('top', low);
        chip.classList.toggle('bot', !low);
      }
      if ((t?.el ?? null) !== (cur?.el ?? null) || t?.tip !== cur?.tip) {
        ptr?.();
        ptr = null;
        cur = t;
        if (t) ptr = pointAt(() => (cur && cur.el.isConnected && !blocked() ? cur.el : null), t.tip);
      }
    };
    iv = setInterval(tick, 150);
    tick();
  });
}

// ---------------------------------------------------------------------------
// Main quest tracker (home, top left): a pinned paper note; tap = the QUEST BOARD

let trackerEl = null;
let trackerKey = '';

/** Daily + character quests ready to claim (the board's other tabs). */
function sideClaims() {
  if (!featureRevealed('pass')) return 0;
  try {
    refreshDaily();
    return challengeList().filter((c) => c.done && !c.claimed).length + Object.keys(QUEST_CHAINS).filter((n) => questState(n)?.done).length;
  } catch (e) { return 0; }
}
let boardMod = null;
async function openBoard(hm, opts = {}) {
  try {
    boardMod = boardMod ?? (await import('./home/questBoard.js'));
    if (alive(hm) && !boardMod.boardOpen()) boardMod.openQuestBoard(hm, opts);
  } catch (e) { console.warn('quest board', e); }
}
/** Other screens (pass drawer, dev links) can open the board. */
export function openQuestBoardFromHome(opts) { if (home) openBoard(home, opts); }

function mountTracker(hm) {
  trackerKey = '';
  try { ensureBoardArt(); } catch (e) { /* plain paper fallback in CSS */ }
  trackerEl = h('button', { class: 'gd-qt', type: 'button', 'aria-label': 'Open the quest board' });
  trackerEl.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.play('tap');
    audio.play('tear', { pitch: 1.5, vol: 0.35 });
    openBoard(hm);
  });
  hm.root.appendChild(trackerEl);
  cleanup.push(() => boardMod?.closeQuestBoard());
  updateTracker();
}

const REWARD_ICON = { coins: 'coin', bucks: 'bucks', calories: 'calorie', vial: 'vial', card: 'cards', commander: 'crown' };
function rewardPeek(r) {
  const k = ['coins', 'bucks', 'calories', 'vial', 'card', 'commander'].find((x) => r?.[x]);
  if (!k) return null;
  const amt = k === 'coins' || k === 'bucks' || k === 'calories' ? r[k].toLocaleString('en-US') : k === 'card' ? 'x' + (r.copies ?? 1) : '1';
  return h('span', { class: 'gd-qt-rw' }, animIcon(REWARD_ICON[k]), h('b', {}, amt));
}

function updateTracker() {
  const el = trackerEl;
  if (!el?.isConnected) return;
  const st = mainQuest();
  if (!st) { el.style.display = 'none'; return; }
  el.style.display = '';
  const side = sideClaims();
  const q = st.quest;
  const key = `${q?.id ?? 'end'}|${st.prog}|${st.done}|${st.locked}|${side}|${featureRevealed('pass')}`;
  if (key === trackerKey) return;
  const fresh = trackerKey && trackerKey.split('|')[0] !== (q?.id ?? 'end');
  trackerKey = key;
  const bang = (st.done && !st.finished) || side > 0;
  el.className = `gd-qt ${st.done && !st.finished ? 'ready' : ''} ${bang ? 'bang' : ''}`;
  let face, k, title, goal, row;
  if (st.finished) {
    face = speaker('jimmy').portrait;
    k = 'QUEST BOARD';
    title = 'Story complete';
    goal = featureRevealed('pass') ? 'Daily specials + crew quests' : 'Jimmy is writing more';
    row = side > 0 ? h('span', { class: 'gd-qt-claim' }, icon('gift'), side === 1 ? '1 READY TO CLAIM' : `${side} READY TO CLAIM`) : null;
  } else {
    const ch = chapterOf(st.step);
    face = speaker(q.by).portrait;
    k = [h('span', {}, `CHAPTER ${ch.n}`), h('i', { class: 'gd-qt-sep' }), h('span', {}, `QUEST ${st.step + 1}/${st.steps}`)];
    title = q.title;
    goal = q.goal ?? q.text;
    if (st.done) row = h('span', { class: 'gd-qt-claim' }, icon('gift'), 'DONE! TAP TO CLAIM');
    else if (st.locked) row = h('span', { class: 'gd-qt-lock' }, icon('lock'), h('span', { html: rich(lockInfo(st.locked).text.replace(/\*/g, '')) }));
    else {
      const small = st.need <= 12;
      row = h('div', { class: 'gd-qt-row' },
        small
          ? h('img', { class: 'gd-qt-tally', src: tallyURL(st.prog, st.need), alt: '', style: { '--tw': st.need <= 1 ? 14 : Math.ceil(st.need / 5) * 15 + 2 } })
          : h('div', { class: 'gd-qt-bar' }, h('i', { style: { width: Math.max(3, (st.prog / st.need) * 100) + '%' } })),
        h('b', { class: 'gd-qt-cnt' }, st.need >= 100 ? `${st.prog.toLocaleString('en-US')}/${st.need.toLocaleString('en-US')}` : `${st.prog}/${st.need}`),
        rewardPeek(q.reward));
    }
  }
  el.replaceChildren(
    h('i', { class: 'gd-qt-pin', 'aria-hidden': 'true' }),
    h('div', { class: 'gd-qt-face' }, h('img', { src: face ?? '', alt: '', draggable: 'false' })),
    h('div', { class: 'gd-qt-txt' },
      h('span', { class: 'gd-qt-k' }, ...[k].flat()),
      h('b', { class: 'gd-qt-n' }, title),
      h('span', { class: 'gd-qt-goal' }, goal),
      row),
    ...(bang ? [h('i', { class: 'gd-qt-bang', 'aria-hidden': 'true' }, h('b', {}, '!'))] : []));
  if (fresh) { el.classList.add('gd-qt-in'); setTimeout(() => el.classList.remove('gd-qt-in'), 700); }
  // the guided-step chip hangs under the tracker
  requestAnimationFrame(() => { if (el.isConnected) el.parentElement?.style.setProperty('--gd-qt-b', el.offsetTop + el.offsetHeight + 'px'); });
}

// ---------------------------------------------------------------------------
// BATTLE: locks, lessons, rival fairness

/** Which in-battle features are locked for this battle mode. */
export function battleLocks(mode) {
  if (mode === 'friend' || mode === 'online') return { base: false, ult: false, modules: false, emotes: false };
  return { base: !featureUnlocked('baseUp'), ult: !featureUnlocked('ult'), modules: !featureUnlocked('modules'), emotes: !featureUnlocked('emotes') };
}
/** Black the locked ULT / BASE buttons out (silhouette + padlock); a tap says what opens them. */
export function applyBattleLocks(hud, locks) {
  hud.locked = locks;
  const lockOn = (el) => {
    if (!el) return;
    el.classList.add('pg-blk');
    el.appendChild(padEl('pg-blk-pad'));
  };
  if (locks.ult) lockOn(hud.sig);
  if (locks.base) lockOn(hud.ocBtn);
  // emotes simply aren't there yet
  if (locks.emotes && hud.emoteBtn) hud.emoteBtn.style.display = 'none';
}
/** BattleScene.allowed(): a locked feature says what unlocks it instead. */
export function battleAllowed(sc, what) {
  const L = sc.locks;
  if (!L) return true;
  if (what === 'sig' && L.ult) { sc.hud?.hint(`Your ULTIMATE unlocks after ${FEATURES.ult.wins} wins!`); audio.play('deny'); return false; }
  if (what === 'emote' && L.emotes) return false;
  if (what === 'lab' && L.base) { sc.hud?.hint('Base upgrades unlock after your first win!'); audio.play('deny'); return false; }
  return true;
}

/** Ranked battles: teach a newly unlocked battle feature the first time it can be used. */
export async function battleLessons(sc) {
  const sim = sc.sim;
  if (!sim || sc.mode !== 'ranked' || P().prog?.legacy) return;
  const gone = () => sc.dead || sc.ended || sim.over;
  const until = (fn, max) => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (gone() || fn() || performance.now() - t0 > max * 1000) { clearInterval(iv); res(!gone() && fn()); }
    }, 120);
  });
  const quiet = () => !sim.cinematic && !sc.view?.cine && !document.querySelector('#overlay .cdlg');
  const talk = async (who, text) => {
    sim.paused = true;
    if (sc.ai) sc.ai.hold = true;
    try { await say(speaker(who), text, { place: 'top' }); } finally {
      if (!sc.ended) sim.paused = false;
      if (sc.ai) sc.ai.hold = false;
    }
  };
  const point = async (el, tip, doneFn, max = 9) => {
    const off = pointAt(el, tip);
    await until(doneFn, max);
    off();
  };
  // 1) base upgrades (your first ranked battle)
  if (!lessonDone('baseUp') && featureUnlocked('baseUp') && !sc.locks?.base) {
    const ok = await until(() => quiet() && sim.sides[0].energy >= (sim.overclockInfo(0).cost ?? 99) && sim.t > 6, 70);
    if (gone()) return;
    setLessonDone('baseUp');
    if (ok) {
      await talk('jimmy', 'New trick: tap the *BASE* button to upgrade your base. More HP, a bigger zapper and *more POWER* every second.');
      if (gone()) return;
      const t0 = sim.sides[0].overclock;
      await point(sc.hud.ocBtn, 'Upgrade!', () => sim.sides[0].overclock > t0, 10);
    }
  }
  // 2) the ULTIMATE (once it unlocks)
  if (!lessonDone('ult') && featureUnlocked('ult') && !sc.locks?.ult && sc.hud?.sig) {
    const ok = await until(() => quiet() && sim.sides[0].sig >= 1, 120);
    if (gone()) return;
    setLessonDone('ult');
    if (ok) {
      await talk('jimmy', `Your *ULTIMATE* is charged! It fills from the POWER you make and from hits on your base. Tap *ULT* for *${sim.sides[0].cmd?.signature?.name ?? 'your ULTIMATE'}*.`);
      if (gone()) return;
      const s0 = sim.sides[0].stats?.sigs ?? 0;
      await point(sc.hud.sig, 'Tap it!', () => (sim.sides[0].stats?.sigs ?? 0) > s0 || sim.sides[0].sig < 1, 10);
    }
  }
}

if (import.meta.env?.DEV && typeof window !== 'undefined') window.__guide = { resolve: (id) => { const t = resolveTarget(STEPS[id].targets); return t && { tip: t.tip, cls: t.el.className }; }, visible };
