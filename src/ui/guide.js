// Guided first session + progressive unlock presentation (logic in game/progression.js).
//
//   Home:   locked nav tabs / side buttons (lock + "2 WINS"), the unlock REVEAL (spotlight, the lock
//           shakes and pops, the tab springs in, a short voiced line from Jimmy / Nolan / Juan), the
//           GUIDED STEPS (a pointing hand + spotlight that follows whatever you need to tap next:
//           claim the Trophy Road, open your first vial, put a card in your deck, upgrade...), each
//           skippable, and the MAIN QUEST tracker (tap = quest list, CLAIM = reward fly-in).
//   Battle: locked ULT / BASE buttons, battle lessons (base upgrades in your first ranked battle,
//           the ULTIMATE once it unlocks), rival fairness (no rival ULT while yours is locked).
//
// Other screens can mark a tap target for the guide with data-guide="<step target>" (e.g. the
// research tree's start button: data-guide="research").
import './guide.css';
import { h, icon, button, say, pointAt, toast, burst, sparkle, flyIcons, confetti, bar, modal, $overlay, bump, rich, closeDialogue } from './ui.js';
import { audio } from '../core/audio.js';
import { charPortrait } from './thumbs.js';
import { state, upgradeInfo, currentDeck, passClaimable, trophyRoadClaimable } from '../game/state.js';
import { STARTER_CARDS } from '../data/cards.js';
import {
  FEATURES, featureUnlocked, featureRevealed, pendingReveals, markRevealed, lockInfo, guideDone, setGuideDone, releaseDeckHold,
  lessonDone, setLessonDone, MAIN_QUESTS, mainQuest, claimMainQuest,
} from '../game/progression.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const P = () => state.p;

// ---------------------------------------------------------------------------
// Speakers (the dialogue system voices them: voiceOf in data/characters.js)

const WHO = {
  jimmy: { name: 'Jimmy', color: '#2b8cf2', eyes: 'happy', mouth: 'grin' },
  nolan: { name: 'Nolan', color: '#3fbf5f', eyes: 'happy', mouth: 'grin' },
  juan: { name: 'Juan', color: '#ff8a1f', eyes: 'happy', mouth: 'grin' },
};
export function speaker(id, mood = {}) {
  const w = WHO[id] ?? WHO.jimmy;
  const eyes = mood.eyes ?? w.eyes, mouth = mood.mouth ?? w.mouth;
  let portrait = null;
  try { portrait = charPortrait(id, { eyes, mouth }); } catch (e) { /* face cam still works */ }
  return { name: w.name, color: w.color, eyes, mouth, portrait };
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
};
const QUIET = { friends: 'Friend battles unlocked!', train: 'Training unlocked! Practice against the bot any time.', labSkins: 'Lab skins unlocked! Repaint your base in the Lab.' };

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
    feature: 'road', chip: 'Open your vial', who: 'jimmy',
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
    can: () => passClaimable(1, 'free') || passClaimable(0, 'free'),
    done: () => Object.keys(P().pass.free).length > 0,
    targets: [['.pz-card-claim', 'Claim!'], ['.pz-claimall', 'Claim!'], ['.hm-tabbtn[data-tab="pass"]:not(.on)', 'Pass']],
  },
  research: {
    feature: 'lab', chip: 'Start your first research', who: 'jimmy',
    line: 'Pick something in the research tree and hit START. It keeps cooking while you battle.',
    can: () => featureUnlocked('lab'),
    done: () => !!P().research?.active || Object.values(P().research?.levels ?? {}).some((v) => v > 0),
    targets: [['[data-guide="research"]', 'Start!'], ['.hm-tabbtn[data-tab="lab"]:not(.on)', 'Lab']],
  },
};
// reveal / step order for the first session
const SEQ = [
  { reveal: 'road' }, { step: 'road' }, { step: 'vial' },
  { reveal: 'cards' }, { step: 'deck' }, { step: 'upgrade' },
  { reveal: 'shop' }, { step: 'shop' }, { reveal: 'friends' }, { reveal: 'ult' },
  { reveal: 'pass' }, { step: 'pass' }, { reveal: 'train' },
  { reveal: 'lab' }, { step: 'research' }, { reveal: 'labSkins' },
  { reveal: 'commanders' }, { reveal: 'modules' },
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
// screens that sit over the lobby: modals and the island Trophy Road view (ui/home/trophyRoad.js)
const SCREENS = '#overlay .modal-back, #ui .modal-back, #overlay .trd:not(.out)';
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
  if (id === 'commanders' || id === 'modules' || id === 'labSkins') return hm.navBtns?.find((b) => b.dataset.tab === 'lab') ?? null;
  return null;
}

function decorate(hm) {
  for (const id of ['road', 'cards', 'shop', 'friends', 'pass', 'train', 'lab']) {
    const el = featureEl(hm, id);
    if (!el) continue;
    const locked = !featureRevealed(id);
    el.classList.toggle('pg-lock', locked);
    let chip = el.querySelector(':scope > .pg-lk');
    if (locked) {
      const info = lockInfo(id);
      if (!chip) {
        chip = h('i', { class: 'pg-lk' }, icon('lock'), h('b', {}, info.short));
        el.appendChild(chip);
      } else chip.querySelector('b').textContent = info.short;
      el.dataset.tip = info.text;
    } else {
      chip?.remove();
      if (el.dataset.tip && el.dataset.tip.startsWith('Win ')) delete el.dataset.tip;
    }
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
      if (busy()) { await wait(0.4); continue; }
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
    markRevealed(id);
    if (el) { unlockAnim(el); toast(QUIET[id], { icon: FEATURES[id].icon ?? 'star' }); }
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
function unlockAnim(el) {
  el.classList.remove('pg-rattle', 'pg-lock');
  el.querySelector(':scope > .pg-lk')?.remove();
  el.classList.remove('pg-pop');
  void el.offsetWidth;
  el.classList.add('pg-pop');
  setTimeout(() => el.classList.remove('pg-pop'), 900);
  burst(el, { color: '#ffd84a', count: 26, scale: 1.8 });
  sparkle(el, { count: 18, spread: 90 });
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
  const S = STEPS[id];
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
    const kill = () => end('left');
    cleanup.push(kill);
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
// Main quest tracker (home, top left) + quest list

let trackerEl = null;
let trackerKey = '';
let claiming = false;

function mountTracker(hm) {
  trackerKey = '';
  trackerEl = h('button', { class: 'gd-qt', type: 'button' });
  trackerEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const st = mainQuest();
    if (st?.done && !st.finished) claimTracker(hm);
    else { audio.play('tap'); openQuestList(hm); }
  });
  hm.root.appendChild(trackerEl);
  updateTracker();
}
function updateTracker() {
  const el = trackerEl;
  if (!el?.isConnected || claiming) return;
  const st = mainQuest();
  if (!st || st.finished) { el.style.display = 'none'; return; }
  el.style.display = '';
  const q = st.quest;
  const key = `${q.id}|${st.prog}|${st.done}|${st.locked}`;
  if (key === trackerKey) return;
  const fresh = trackerKey && trackerKey.split('|')[0] !== q.id;
  trackerKey = key;
  el.className = `gd-qt ${st.done ? 'ready' : ''}`;
  const pct = st.prog / st.need;
  const bigNeed = st.need >= 100;
  el.replaceChildren(
    h('div', { class: 'gd-qt-face' }, h('img', { src: speaker(q.by).portrait ?? '', alt: '', draggable: 'false' })),
    h('div', { class: 'gd-qt-txt' },
      h('span', { class: 'gd-qt-k' }, `QUEST ${st.step + 1}/${st.steps}`),
      h('b', { class: 'gd-qt-n' }, q.title),
      st.done
        ? h('span', { class: 'gd-qt-claim' }, icon('gift'), 'CLAIM!')
        : st.locked
          ? h('span', { class: 'gd-qt-lock' }, icon('lock'), lockInfo(st.locked).short)
          : bar(Math.max(0.04, pct), 'gold', bigNeed ? `${st.prog.toLocaleString('en-US')}/${st.need.toLocaleString('en-US')}` : `${st.prog}/${st.need}`, { cls: 'gd-qt-bar' })));
  if (fresh) { el.classList.add('gd-qt-in'); setTimeout(() => el.classList.remove('gd-qt-in'), 700); }
}

const REWARD_ICON = { coins: 'coin', bucks: 'bucks', calories: 'calorie', vial: 'vial', card: 'cards' };
function rewardBits(r) {
  const out = [];
  if (r.coins) out.push({ icon: 'coin', text: r.coins.toLocaleString('en-US') });
  if (r.bucks) out.push({ icon: 'bucks', text: String(r.bucks) });
  if (r.calories) out.push({ icon: 'calorie', text: String(r.calories) });
  if (r.vial) out.push({ icon: 'vial', text: '1' });
  if (r.card) out.push({ icon: 'cards', text: String(r.copies ?? 1) });
  return out;
}

async function claimTracker(hm) {
  if (claiming) return;
  const el = trackerEl;
  const got = claimMainQuest();
  if (!got) return;
  claiming = true;
  audio.play('levelUp');
  burst(el, { color: '#ffd84a', count: 26, scale: 1.4 });
  confetti($overlay(), { count: 30, spread: 0.5, life: 3 });
  el.classList.add('gd-qt-claimed');
  // the reward flies to where it lives: coins / bucks into their pills, vials into the slots
  const r = got.quest.reward;
  const flights = [];
  if (r.coins) flights.push(flyIcons(el, 'coin', hm.coinPill, { count: 7 }));
  if (r.bucks) flights.push(flyIcons(el, 'bucks', hm.buckPill, { count: 5 }));
  if (r.calories) flights.push(flyIcons(el, 'calorie', hm.navBtns?.find((b) => b.dataset.tab === 'pass') ?? null, { count: 5 }));
  if (r.vial) flights.push(flyIcons(el, 'vial', hm.slotsEl ?? null, { count: 3, size: 34 }));
  if (r.card) flights.push(flyIcons(el, 'cards', hm.navBtns?.find((b) => b.dataset.tab === 'cards') ?? null, { count: 3 }));
  const lbl = h('div', { class: 'gd-qt-got' }, ...got.rewards.map((x) => h('span', {}, icon(REWARD_ICON[x.kind] ?? x.icon ?? 'star'), x.label)));
  el.appendChild(lbl);
  await Promise.all(flights);
  await wait(0.5);
  claiming = false;
  el.classList.remove('gd-qt-claimed');
  trackerKey = trackerKey.replace(/^[^|]*/, 'x');
  updateTracker();
  hm.refresh?.();
}

function openQuestList(hm) {
  const st = mainQuest();
  const cur = st?.finished ? MAIN_QUESTS.length : st?.step ?? 0;
  const rows = MAIN_QUESTS.map((q, i) => {
    const state_ = i < cur ? 'done' : i === cur ? 'cur' : 'next';
    const bits = rewardBits(q.reward);
    const isCur = state_ === 'cur';
    return h('div', { class: `gd-ql-row ${state_}` },
      h('div', { class: 'gd-ql-face' }, state_ === 'next' && i > cur + 1 ? icon('lock') : h('img', { src: speaker(q.by).portrait ?? '', alt: '' })),
      h('div', { class: 'gd-ql-txt' },
        h('b', {}, i > cur + 1 ? '???' : q.title),
        h('span', {}, i > cur + 1 ? 'Finish the quests above to reveal this one.' : q.text),
        isCur && !st.done ? bar(Math.max(0.04, st.prog / st.need), 'gold', `${st.prog.toLocaleString('en-US')}/${st.need.toLocaleString('en-US')}`, { cls: 'gd-ql-bar' }) : null),
      h('div', { class: 'gd-ql-rw' },
        state_ === 'done' ? icon('check', 'l')
          : isCur && st.done ? button('CLAIM', () => { m.close(); claimTracker(hm); }, 'green sm', { icon: 'gift' })
            : bits.map((b) => h('span', { class: 'gd-ql-bit' }, icon(b.icon), b.text))));
  });
  const foot = [];
  if (featureRevealed('pass')) foot.push(button('DAILY CHALLENGES', () => { m.close(); hm.setTab('pass', false, { sub: 'chal' }); }, 'pink', { icon: 'calorie' }));
  const m = modal({
    title: 'MAIN QUESTS', color: 'gold', size: 'narrow', cls: 'gd-ql-modal',
    body: h('div', { class: 'gd-ql' }, rows),
    foot: foot.length ? foot : null,
  });
  // scroll the active quest into view
  requestAnimationFrame(() => m.body.querySelector('.gd-ql-row.cur')?.scrollIntoView({ block: 'center' }));
}

// ---------------------------------------------------------------------------
// BATTLE: locks, lessons, rival fairness

/** Which in-battle features are locked for this battle mode. */
export function battleLocks(mode) {
  if (mode === 'friend' || mode === 'online') return { base: false, ult: false, modules: false };
  return { base: !featureUnlocked('baseUp'), ult: !featureUnlocked('ult'), modules: !featureUnlocked('modules') };
}
/** Grey the locked ULT / BASE buttons out with a lock + what opens them. */
export function applyBattleLocks(hud, locks) {
  hud.locked = locks;
  const lockOn = (el, text) => {
    if (!el) return;
    el.classList.add('pg-blk');
    el.appendChild(h('div', { class: 'pg-blk-chip' }, icon('lock'), h('span', {}, text)));
  };
  if (locks.ult) lockOn(hud.sig, lockInfo('ult').short);
  if (locks.base) lockOn(hud.ocBtn, 'NEXT BATTLE');
}
/** BattleScene.allowed(): a locked feature says what unlocks it instead. */
export function battleAllowed(sc, what) {
  const L = sc.locks;
  if (!L) return true;
  if (what === 'sig' && L.ult) { sc.hud?.hint(`Your ULTIMATE unlocks after ${FEATURES.ult.wins} wins!`); audio.play('deny'); return false; }
  if (what === 'lab' && L.base) { sc.hud?.hint('Base upgrades unlock next battle!'); audio.play('deny'); return false; }
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
