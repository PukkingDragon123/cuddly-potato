// QUEST BOARD: every quest in the game pinned to one cork board in the lab.
//
//   MAIN STORY  the main quest line (game/progression.js MAIN_QUESTS): chapter card, the current
//               quest as a big pinned note, the next one, a TOP SECRET folder for the rest and the
//               finished ones as a pile you can flip through
//   DAILY       the daily challenges (Juan's Food Season calories, data/season.js)
//   CHARACTERS  the crew's quest chains (data/arenas.js QUEST_CHAINS) + Jimmy's rematch
//
// Each note shows who posted it (chibi photo: tap it and they say their line through the
// dialogue system), the objective, hand-drawn progress (tally marks or a hatched bar), the rewards
// and a status stamp (NEW / IN PROGRESS / DONE / CLAIMED). Claiming slams a CLAIMED stamp on the
// note, flies the rewards into the counters on the frame and throws confetti.
//
// The board is a full-screen layer in #overlay (under dialogue, modals and toasts). While it is
// fully up the island stops drawing (engine.cover). All art: ui/home/questBoardArt.js.
import './questBoard.css';
import { h, icon, animIcon, button, say, closeDialogue, toast, sparkle, flyIcons, confetti, rollNumber, floatDelta, bump, rich, $overlay, pointAt } from '../ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { state, refreshDaily, challengeList, claimChallenge, questState, acceptQuest, completeQuest, passTier } from '../../game/state.js';
import { QUEST_CHAINS, QUEST_NPC_ZONE, QUESTS, BOSSES, arenaById } from '../../data/arenas.js';
import { VIALS } from '../../data/vials.js';
import {
  MAIN_QUESTS, MAIN_CHAPTERS, chapterOf, mainQuest, claimMainQuest, featureRevealed, lockInfo,
} from '../../game/progression.js';
import { charImg, rewardArt, rewardDef, rewardLabel, countdown, tickTimers, midnightMs, showRewards, refreshCtx } from './common.js';
import { openBoss } from './boss.js';
import { ensureBoardArt, tallyURL, drawString } from './questBoardArt.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const P = () => state.p;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------- who's who

const CREW = {
  jimmy: { name: 'Jimmy', char: 'jimmy', color: '#2b8cf2', pin: 'blue' },
  nolan: { name: 'Nolan', char: 'nolan', color: '#3fbf5f', pin: 'green' },
  juan: { name: 'Juan', char: 'juan', color: '#1f9e4a', pin: 'yellow' },
  lonan: { name: 'Lonan', char: 'shadyNolan', color: '#d8a548', pin: 'red' },
};
const crew = (id) => CREW[id] ?? CREW.jimmy;
/** Dialogue speaker (dialogue.js picks the 3D model from `char`). */
const voiceOf = (id) => ({ name: crew(id).name, char: crew(id).char, color: crew(id).color });

// Juan posts the daily list; what he says about each one
const DAILY_LINES = {
  winBattles: 'Three wins today. I am keeping score on a napkin, so no pressure.',
  deployFood: 'Deploy Snack Squad troops. Deploy them. Do not eat them. Nolan.',
  useFoodThrow: 'Throw food at people. In battle. Only in battle. We talked about this.',
  martBattles: 'Battle at Beast Mart. The carts are free. The damage is not.',
  openVials: 'Open two vials. Pop, pop. That is the whole challenge.',
  unleashMega: 'Use your MEGA twice. Maybe stand back a little.',
  useSignature: 'Four ULTIMATES today. Make them loud. I want to hear them from the snack aisle.',
  deployTroops: 'Deploy forty troops. Yes, forty. Count out loud, it helps.',
  smashCarts: 'Smash shopping carts. Somebody has to return them anyway.',
  bases: 'Destroy three rival bases. Leave a nice note.',
  baseUp: 'Upgrade your base six times. Build it so tall it gets its own weather.',
};
const DAILY_ICON = {
  wins: 'swords', deployFood: 'burger', castfoodThrow: 'burger', martBattles: 'cart', vialsOpened: 'vial', signatures: 'star',
  deployed: 'swarm', cartsSmashed: 'cart', basesDestroyed: 'lab', baseUpgrades: 'up', megasUsed: 'mega',
};
const DAILY_PAPER = ['yellow', 'pink', 'blue', 'green'];
// the crew's chains: what they say about each quest
const CHAIN_LINES = {
  nolan1: 'I need backup. Two wins. I will cheer for you. Quietly. From behind you.',
  nolan2: 'I lost my phone in the Last To Leave Circle. It is on silent. Of course it is.',
  nolan3: 'Thirty Panthers. I want to see a Panther traffic jam.',
  nolan4: 'Open four vials and tell me what was inside. I am not allowed to open them anymore.',
  nolan5: 'Beat King Clog and I join your team. I will even bring snacks. Some snacks.',
  juan1: 'Come battle at Beast Mart. Aisle three is the arena. Aisle four is the snacks.',
  juan2: 'Smash five shopping carts. The manager said yes. Mostly.',
  juan3: 'Cart Kong runs this store. Beat him and checkout is on me.',
  jimmyRematch: 'You beat my crew. Now beat me. Loser buys the whole lab pizza.',
};
const CHAIN_INTRO = {
  nolan: 'Help Nolan out and he joins your Lab as a Commander.',
  juan: 'Juan runs Beast Mart. He has errands. Weird ones.',
};

// ---------------------------------------------------------------------------- counts (tabs, tracker)

export function boardCounts() {
  const st = mainQuest();
  let daily = 0, chars = 0;
  try {
    if (featureRevealed('pass')) {
      refreshDaily();
      daily = challengeList().filter((c) => c.done && !c.claimed).length;
      chars = Object.keys(QUEST_CHAINS).filter((npc) => questState(npc)?.done).length;
    }
  } catch (e) { /* no save yet */ }
  return { main: st?.done && !st.finished ? 1 : 0, daily, chars };
}

// ---------------------------------------------------------------------------- small parts

const pinEl = (c = 'red', cls = '') => h('i', { class: `qb-pin p-${c} ${cls}`, 'aria-hidden': 'true' });
const tapeEl = (k = '', cls = '') => h('i', { class: `qb-tape ${k} ${cls}`, 'aria-hidden': 'true' });
const STAMP = { new: 'NEW', prog: 'IN PROGRESS', done: 'DONE', claimed: 'CLAIMED', secret: 'TOP SECRET', locked: 'LOCKED' };
const stampEl = (kind, cls = '') => h('div', { class: `qb-stamp s-${kind} ${cls}` }, h('span', {}, STAMP[kind]));

let talking = false;
async function talk(who, line, el) {
  if (talking || !line) return;
  talking = true;
  audio.play('tap');
  el?.classList.add('talking');
  try { await say(voiceOf(who), line, { place: 'bottom' }); } catch (e) { /* closed */ }
  el?.classList.remove('talking');
  talking = false;
}

/** Polaroid of whoever posted the note. Tap = their line. */
function poster(who, line, cls = '') {
  const c = crew(who);
  const b = h('button', { class: `qb-poster ${cls}`, type: 'button', 'aria-label': `${c.name} says` },
    h('span', { class: 'qb-photo', style: { '--pc': c.color } }, charImg(c.char, { size: 128, eyes: 'happy', mouth: 'grin' })),
    h('span', { class: 'qb-poster-n' }, c.name.toUpperCase()),
    h('i', { class: 'qb-voice' }, icon('sound')));
  b.addEventListener('click', (e) => { e.stopPropagation(); talk(who, line, b); });
  return b;
}

/** Reward chips: currency as icon + amount, everything else as its art + name. */
function rewardList(b) {
  const out = [];
  if (!b) return out;
  if (b.coins) out.push({ type: 'coins', amount: b.coins });
  if (b.bucks) out.push({ type: 'bucks', amount: b.bucks });
  if (b.calories) out.push({ type: 'calories', amount: b.calories });
  if (b.vial) out.push({ type: 'vial', id: b.vial });
  if (b.card || b.swarm) out.push({ type: 'card', id: b.card ?? b.swarm, copies: b.copies ?? 1 });
  if (b.commander) out.push({ type: 'commander', id: b.commander });
  if (b.banner) out.push({ type: 'banner', id: b.banner });
  return out;
}
const CUR_ICON = { coins: 'coin', bucks: 'bucks', calories: 'calorie' };
function rewardChip(r) {
  if (CUR_ICON[r.type]) {
    return h('span', { class: `qb-rw cur k-${r.type}`, 'data-rw': r.type }, animIcon(CUR_ICON[r.type]), h('b', {}, fmt(r.amount)));
  }
  let art;
  try { art = rewardArt(rewardDef(r)); } catch (e) { art = icon('gift'); }
  const name = r.type === 'vial' ? (VIALS[r.id]?.name ?? 'Vial') : rewardLabel(r);
  return h('span', { class: `qb-rw art k-${r.type}`, 'data-rw': r.type }, h('span', { class: 'qb-rw-art' }, art), h('b', {}, name));
}
function rewardsRow(b, label = 'REWARD') {
  return h('div', { class: 'qb-rws' }, h('span', { class: 'qb-rws-k' }, label), h('div', { class: 'qb-rws-l' }, rewardList(b).map(rewardChip)));
}

/** Hand-drawn progress: tally marks up to 12, a hatched pen bar for bigger numbers. */
function progressEl(prog, need, done) {
  const lbl = h('span', { class: 'qb-cnt-t' }, need >= 100 ? `${fmt(prog)} / ${fmt(need)}` : `${prog} / ${need}`);
  if (need <= 12) {
    return h('div', { class: `qb-prog tally ${done ? 'full' : ''}` }, h('img', { class: 'qb-tally', src: tallyURL(prog, need), alt: '', style: { '--tw': need <= 1 ? 14 : Math.ceil(need / 5) * 15 + 2 } }), lbl);
  }
  return h('div', { class: `qb-prog bar ${done ? 'full' : ''}` }, h('div', { class: 'qb-bar' }, h('i', { style: { width: Math.max(3, Math.min(100, (prog / need) * 100)) + '%' } })), lbl);
}

/** A locked button, blacked out like the home buttons: silhouette + padlock; tap = what opens it. */
function lockedBtn(label, text, cls = '') {
  const b = button(label, () => { audio.play('deny'); b.classList.remove('pg-shake'); void b.offsetWidth; b.classList.add('pg-shake'); toast(text, { icon: 'lock' }); }, `gray sm qb-act pg-lock ${cls}`, { sound: 'tap' });
  b.appendChild(h('i', { class: 'pg-pad', 'aria-hidden': 'true' }, icon('lock')));
  return b;
}

// ---------------------------------------------------------------------------- the board

let open = null;
export const boardOpen = () => !!open;
export function closeQuestBoard() { open?.close(); }

/**
 * Open the board over the home lobby. hm = HomeScene (for GO buttons, counters, ctx).
 * opts: { tab: 'main' | 'daily' | 'chars' }
 */
export function openQuestBoard(hm, opts = {}) {
  if (open) return open;
  ensureBoardArt();
  closeDialogue();
  const ctx = hm?.ctx?.() ?? {};
  let tab = opts.tab ?? 'main';
  if (tab !== 'main' && !featureRevealed('pass')) tab = 'main';
  let busy = false, closed = false, pileOpen = false;
  if (!P().prog.qbSeen || typeof P().prog.qbSeen !== 'object') P().prog.qbSeen = {};
  const seen = P().prog.qbSeen;
  // forget yesterday's daily notes
  for (const k of Object.keys(seen)) if (k.startsWith('d:') && !k.startsWith(`d:${P().challenges?.day}:`)) delete seen[k];

  // ------------------------------------------------------------ frame, header, counters, tabs
  const cnt = {};
  const counter = (k, ic, val, tip) => {
    const v = h('b', {}, val);
    const el = h('div', { class: `qb-c k-${k}`, title: tip }, animIcon(ic), v);
    cnt[k] = { el, v, val: null };
    return el;
  };
  const vialCount = () => P().vials.slots.filter(Boolean).length;
  const wallet = h('div', { class: 'qb-wallet' },
    counter('coins', 'coin', fmt(P().coins), 'Beast Coins'),
    counter('bucks', 'bucks', fmt(P().bucks), 'Beast Bucks'),
    featureRevealed('pass') ? counter('calories', 'calorie', fmt(P().calories), 'Calories') : null,
    counter('vial', 'vial', `${vialCount()}/${P().vials.slots.length}`, 'Vial slots'));
  cnt.coins.val = P().coins; cnt.bucks.val = P().bucks;
  if (cnt.calories) cnt.calories.val = P().calories;
  const closeBtn = button('', () => close(), 'red icon-only qb-x', { icon: 'x', sound: 'tap' });
  const sign = h('div', { class: 'qb-sign' }, h('b', {}, 'QUEST BOARD'));
  const tabsEl = h('div', { class: 'qb-tabs' });
  const head = h('div', { class: 'qb-head' }, sign, tabsEl, wallet, closeBtn);
  const page = h('div', { class: 'qb-page' });
  const strings = h('canvas', { class: 'qb-string', 'aria-hidden': 'true' });
  const knots = h('div', { class: 'qb-knots', 'aria-hidden': 'true' });
  const deco = h('div', { class: 'qb-deco', 'aria-hidden': 'true' });
  const sheet = h('div', { class: 'qb-sheet' }, deco, page, strings, knots);
  const cork = h('div', { class: 'qb-cork scroll-y' }, sheet);
  const frame = h('div', { class: 'qb-frame' }, cork);
  const root = h('div', { class: 'qb', role: 'dialog', 'aria-label': 'Quest board' }, h('div', { class: 'qb-wall' }), head, frame);
  $overlay().appendChild(root);
  audio.play('whoosh', { pitch: 0.9 });
  setTimeout(() => { if (!closed) audio.play('thud'); }, 260);
  const coverT = setTimeout(() => { if (!closed) engine.cover('questBoard', true); }, 520);
  const timer = setInterval(() => { if (root.isConnected) tickTimers(root); }, 1000);
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('#overlay .cdlg, #overlay .modal-back')) close(); };
  window.addEventListener('keydown', onKey);
  const onResize = () => requestAnimationFrame(() => layoutStrings());
  window.addEventListener('resize', onResize);

  function renderTabs() {
    const c = boardCounts();
    const T = [
      { id: 'main', label: 'MAIN STORY', icon: 'quest', n: c.main },
      { id: 'daily', label: 'DAILY', icon: 'calorie', n: c.daily, lock: 'pass' },
      { id: 'chars', label: 'CHARACTERS', icon: 'friends', n: c.chars, lock: 'pass' },
    ];
    tabsEl.replaceChildren(...T.map((t) => {
      const locked = t.lock && !featureRevealed(t.lock);
      const b = h('button', { class: `qb-tab ${t.id === tab ? 'on' : ''} ${locked ? 'pg-lock' : ''}`, type: 'button', 'data-qbtab': t.id },
        icon(t.icon), h('span', {}, t.label),
        !locked && t.n ? h('i', { class: 'qb-tab-n' }, String(t.n)) : null,
        locked ? h('i', { class: 'pg-pad', 'aria-hidden': 'true' }, icon('lock')) : null);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (locked) {
          audio.play('deny');
          b.classList.remove('pg-shake'); void b.offsetWidth; b.classList.add('pg-shake');
          const left = lockInfo(t.lock).left ?? 1;
          toast(`Win ${left} more ${left === 1 ? 'battle' : 'battles'} to open *${t.label === 'DAILY' ? 'DAILY' : 'CHARACTER'}* quests.`, { icon: 'lock' });
          return;
        }
        if (t.id === tab || busy) return;
        audio.play('tap');
        audio.play('tear', { pitch: 1.3, vol: 0.4 });
        tab = t.id;
        pileOpen = false;
        render(true);
      });
      return b;
    }));
  }

  // ------------------------------------------------------------ pages
  function render(anim = false) {
    renderTabs();
    const kids = tab === 'daily' ? dailyPage() : tab === 'chars' ? charsPage() : mainPage();
    page.className = `qb-page pg-${tab}`;
    page.replaceChildren(...kids);
    decorate();
    sheet.classList.remove('qb-strung');
    if (anim) cork.scrollTop = 0;
    // notes pin in, staggered
    if (anim && !reduced()) {
      [...page.querySelectorAll('.qb-in')].forEach((n, i) => {
        n.style.animationDelay = (0.05 + i * 0.07).toFixed(2) + 's';
        n.classList.add('qb-drop');
      });
      setTimeout(() => page.querySelectorAll('.qb-drop').forEach((n) => n.classList.remove('qb-drop')), 1200);
    }
    tickTimers(root);
    // red string goes up once the notes have landed
    setTimeout(() => { layoutStrings(); sheet.classList.add('qb-strung'); }, anim && !reduced() ? 1150 : 40);
  }

  /** Coffee rings + doodle scraps behind the notes (they differ per page). */
  function decorate() {
    const land = document.body.classList.contains('landscape');
    // portrait notes fill the width: stains go where the cork shows (the margins and the foot)
    const D = (land ? {
      main: [['coffee', 74, 2], ['doodle-panther', 3, 54], ['coffee', 8, 82]],
      daily: [['coffee', 60, 62], ['doodle-flask', 76, 4], ['doodle-money', 6, 70]],
      chars: [['coffee', 70, 30], ['doodle-toilet', 80, 72], ['coffee', 2, 90]],
    } : {
      main: [['coffee', 70, 1], ['doodle-panther', 3, 54], ['coffee', 56, 93]],
      daily: [['coffee', 64, 21], ['doodle-flask', 76, 4], ['doodle-money', 2, 76], ['coffee', 40, 95]],
      chars: [['coffee', 66, 30], ['doodle-toilet', 74, 95], ['coffee', 2, 62]],
    })[tab] ?? [];
    deco.replaceChildren(...D.map(([k, x, y]) => h('i', { class: `qb-dc ${k}`, style: { left: x + '%', top: y + '%' } })));
  }

  // MAIN STORY ---------------------------------------------------------------
  function mainPage() {
    const st = mainQuest();
    const idx = !st ? 0 : st.finished ? MAIN_QUESTS.length : st.step;
    const ch = chapterOf(Math.min(idx, MAIN_QUESTS.length - 1));
    // one grid, laid out per orientation in CSS (grid areas: chap, hero, next, pile, folder)
    const items = [chapterCard(ch, idx), st?.finished ? endNote() : heroNote(st)];
    const next = MAIN_QUESTS[idx + 1];
    if (next && !st?.finished) items.push(nextNote(next));
    if (idx > 0) items.push(pileNote(idx));
    else items.push(h('div', { class: 'qb-scrap qb-in', style: { gridArea: 'pile' } }, h('i', { class: 'qb-dc doodle-money' })));
    const more = MAIN_QUESTS.length - (idx + 2);
    if (more > 0) items.push(folderNote(more));
    else if (idx > 0) items.push(h('div', { class: 'qb-scrap qb-in', style: { gridArea: 'folder' } }, h('i', { class: 'qb-dc doodle-flask' })));
    const out = [h('div', { class: 'qb-main' }, items)];
    if (pileOpen && idx > 0) out.push(doneList(idx));
    return out;
  }

  function chapterCard(ch, idx) {
    const inCh = MAIN_QUESTS.slice(ch.from, ch.to);
    const doneN = Math.max(0, Math.min(inCh.length, idx - ch.from));
    return h('div', { class: 'qb-note qb-chap paper-white qb-in', 'data-pin': 'chap' },
      tapeEl('l', 'tl'), tapeEl('r', 'tr'),
      h('div', { class: 'qb-chap-l' },
        h('span', { class: 'qb-k' }, `CHAPTER ${ch.n} OF ${MAIN_CHAPTERS.length}`),
        h('b', { class: 'qb-chap-t' }, ch.title),
        h('span', { class: 'qb-scrib' }, ch.sub)),
      h('div', { class: 'qb-chap-r' },
        h('div', { class: 'qb-chap-pins' }, inCh.map((q, i) => h('i', { class: `qb-cp ${i < doneN ? 'on' : i === doneN ? 'cur' : ''}` }))),
        h('b', { class: 'qb-chap-n' }, `${doneN}/${inCh.length}`)));
  }

  function heroNote(st) {
    const q = st.quest;
    const isNew = !seen[q.id] && !st.done;
    seen[q.id] = 1;
    const kind = st.done ? 'done' : isNew ? 'new' : 'prog';
    const locked = st.locked;
    let act;
    if (st.done) act = button('CLAIM', () => claimMain(note), 'green lg qb-act qb-claim pulse', { icon: 'gift', sound: 'tap' });
    else if (locked) act = lockedBtn('GO', lockInfo(locked).text);
    else if (q.go) act = button('GO', () => go(q.go), 'blue qb-act qb-go', { icon: 'arrowR', sound: 'tap' });
    const note = h('div', { class: `qb-note qb-hero paper-cream qb-in ${st.done ? 'ready' : ''}`, 'data-pin': 'hero' },
      pinEl(crew(q.by).pin, 'top'),
      h('div', { class: 'qb-hero-top' },
        poster(q.by, q.line, 'big'),
        h('div', { class: 'qb-hero-meta' },
          h('div', { class: 'qb-kline' }, h('span', { class: 'qb-k' }, `QUEST ${st.step + 1} OF ${st.steps}`), stampEl(kind, 'inl')),
          h('b', { class: 'qb-title' }, q.title),
          h('span', { class: 'qb-by' }, `Posted by ${crew(q.by).name}`))),
      h('div', { class: 'qb-goal' }, icon('quest'), h('span', {}, q.goal ?? q.text)),
      h('p', { class: 'qb-scrib' }, q.text),
      locked
        ? h('div', { class: 'qb-prog lockline' }, icon('lock'), h('span', { html: rich(lockInfo(locked).text) }))
        : progressEl(st.prog, st.need, st.done),
      h('div', { class: 'qb-foot' }, rewardsRow(q.reward), act));
    return note;
  }

  function nextNote(q) {
    return h('div', { class: 'qb-note qb-next paper-dim qb-in', 'data-pin': 'next' },
      pinEl(crew(q.by).pin, 'top'),
      h('span', { class: 'qb-k' }, 'UP NEXT'),
      h('div', { class: 'qb-next-row' },
        poster(q.by, q.line, 'sm'),
        h('div', { class: 'qb-next-t' }, h('b', { class: 'qb-title sm' }, q.title), h('span', { class: 'qb-goal sm' }, q.goal))),
      rewardsRow(q.reward));
  }

  function folderNote(more) {
    return h('div', { class: 'qb-note qb-folder paper-manila qb-in', 'data-pin': 'folder' },
      pinEl('red', 'top'),
      stampEl('secret', 'qb-folder-stamp'),
      h('b', { class: 'qb-folder-n' }, String(more)),
      h('span', { class: 'qb-folder-t' }, more === 1 ? 'more quest' : 'more quests'),
      h('span', { class: 'qb-scrib sm' }, 'Jimmy says no peeking.'));
  }

  function pileNote(idx) {
    const last = MAIN_QUESTS[idx - 1];
    const b = h('button', { class: `qb-note qb-pile paper-kraft qb-in ${pileOpen ? 'open' : ''}`, type: 'button', 'data-pin': 'pile' },
      h('i', { class: 'qb-pile-b b1' }), h('i', { class: 'qb-pile-b b2' }),
      pinEl('yellow', 'top'),
      h('span', { class: 'qb-k' }, 'DONE PILE'),
      h('b', { class: 'qb-pile-n' }, String(idx)),
      h('span', { class: 'qb-pile-last' }, last.title),
      stampEl('claimed', 'qb-pile-stamp'),
      h('span', { class: 'qb-pile-hint' }, pileOpen ? 'Tap to close' : 'Tap to flip through'));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.play('tear', { pitch: 1.4, vol: 0.5 });
      pileOpen = !pileOpen;
      render(false);
      if (pileOpen) requestAnimationFrame(() => { const d = page.querySelector('.qb-donelist'); if (d) cork.scrollTo({ top: d.offsetTop - 12, behavior: 'smooth' }); });
    });
    return b;
  }

  function doneList(idx) {
    return h('div', { class: 'qb-donelist' },
      MAIN_QUESTS.slice(0, idx).reverse().map((q) => h('div', { class: 'qb-note qb-mini paper-kraft qb-in' },
        pinEl(crew(q.by).pin, 'top'),
        poster(q.by, q.line, 'xs'),
        h('div', { class: 'qb-mini-t' }, h('span', { class: 'qb-k' }, `QUEST ${q.index + 1}`), h('b', {}, q.title), h('span', { class: 'qb-goal sm' }, q.goal)),
        stampEl('claimed', 'sm'))));
  }

  function endNote() {
    return h('div', { class: 'qb-note qb-hero qb-end paper-cream qb-in', 'data-pin': 'hero' },
      pinEl('blue', 'top'),
      h('div', { class: 'qb-hero-top' },
        poster('jimmy', 'You finished the whole story. I am writing chapter four right now. On a napkin. It is going great.', 'big'),
        h('div', { class: 'qb-hero-meta' },
          h('div', { class: 'qb-kline' }, h('span', { class: 'qb-k' }, `ALL ${MAIN_QUESTS.length} QUESTS DONE`), stampEl('claimed', 'inl')),
          h('b', { class: 'qb-title' }, 'Story Complete'),
          h('span', { class: 'qb-by' }, 'Posted by Jimmy'))),
      h('p', { class: 'qb-scrib' }, 'Chapter 4 is being written on a napkin. Daily and character quests keep coming.'));
  }

  // DAILY ---------------------------------------------------------------------
  function dailyPage() {
    refreshDaily();
    const list = challengeList();
    const day = P().challenges.day;
    const headCard = h('div', { class: 'qb-note qb-dhead paper-white qb-in', 'data-pin': 'dhead' },
      tapeEl('l', 'tl'), tapeEl('r', 'tr'),
      poster('juan', 'Daily specials, fresh every morning. Finish them for Calories. Calories fill the Food Pass. The Food Pass fills your pockets.', 'big'),
      h('div', { class: 'qb-dhead-t' },
        h('span', { class: 'qb-k' }, 'POSTED BY JUAN'),
        h('b', { class: 'qb-title' }, 'Daily Specials'),
        h('span', { class: 'qb-scrib' }, 'Calories fill the Food Pass.'),
        h('span', { class: 'qb-timer' }, icon('clock'), 'New list in ', countdown(midnightMs()))));
    const notes = list.map((c, i) => {
      const key = `d:${day}:${c.id}`;
      const isNew = !seen[key] && !c.done && !c.claimed;
      seen[key] = 1;
      const kind = c.claimed ? 'claimed' : c.done ? 'done' : isNew ? 'new' : c.prog > 0 ? 'prog' : 'new';
      const act = c.claimed ? null : c.done ? button('CLAIM', () => claimDaily(c, note), 'green qb-act qb-claim pulse', { icon: 'gift', sound: 'tap' }) : null;
      const note = h('div', { class: `qb-note qb-daily paper-${DAILY_PAPER[i % DAILY_PAPER.length]} qb-in ${c.claimed ? 'claimed' : c.done ? 'ready' : ''}`, 'data-pin': 'd' + i },
        pinEl(['red', 'blue', 'green'][i % 3], 'top'),
        stampEl(kind, 'qb-d-stamp'),
        h('button', { class: 'qb-d-ic', type: 'button', 'aria-label': 'Juan says', onclick: (e) => { e.stopPropagation(); talk('juan', DAILY_LINES[c.id] ?? 'Finish it before midnight. I believe in you. Mostly.', e.currentTarget); } }, icon(DAILY_ICON[c.stat] ?? 'star')),
        h('b', { class: 'qb-goal big' }, c.text),
        progressEl(c.prog, c.n, c.done),
        h('div', { class: 'qb-foot' }, rewardsRow({ calories: c.cal }), act));
      return note;
    });
    const out = [headCard, h('div', { class: 'qb-dgrid' }, notes)];
    if (!list.length) out.push(h('div', { class: 'qb-note paper-white qb-in qb-empty' }, h('b', {}, 'No specials today. Juan ate the list.')));
    return out;
  }

  // CHARACTERS ----------------------------------------------------------------
  function charsPage() {
    const cards = Object.keys(QUEST_CHAINS).map(chainCard);
    cards.push(rematchCard());
    return [h('div', { class: 'qb-cgrid' }, cards)];
  }
  function chainSteps(n, step, finished) {
    return h('div', { class: 'qb-steps' }, Array.from({ length: n }, (_, k) => h('i', { class: finished || k < step ? 'on' : k === step ? 'cur' : '' })));
  }
  function chainCard(npc) {
    const st = questState(npc);
    const chain = QUEST_CHAINS[npc];
    const lastQ = QUESTS[chain[chain.length - 1]];
    const finalCmd = lastQ?.reward?.commander;
    const c = crew(npc);
    const head = h('div', { class: 'qb-case-head' },
      poster(npc, st && !st.finished ? CHAIN_LINES[st.quest.id] : `Thanks for the help. ${c.name} owes you one. Maybe two.`, 'big'),
      h('div', { class: 'qb-case-meta' },
        h('div', { class: 'qb-kline' }, h('b', { class: 'qb-case-n' }, c.name.toUpperCase()), h('i', { class: 'qb-case-st' })),
        h('span', { class: 'qb-scrib sm' }, CHAIN_INTRO[npc] ?? ''),
        chainSteps(chain.length, st?.finished ? chain.length : st?.step ?? 0, !!st?.finished),
        finalCmd ? h('span', { class: 'qb-case-prize' }, icon('crown'), `Finish all ${chain.length}: ${c.name} joins as a Commander`) : null));
    let body, kind = 'prog', act = null;
    if (!st || st.finished) {
      kind = 'claimed';
      body = h('div', { class: 'qb-case-body' }, h('b', { class: 'qb-title sm' }, 'All done'), h('span', { class: 'qb-goal sm' }, `Every one of ${c.name}'s quests is finished.`));
    } else {
      const q = st.quest;
      kind = !st.accepted ? 'new' : st.done ? 'done' : 'prog';
      if (!st.accepted) act = button('ACCEPT', () => { acceptQuest(npc); audio.play('magic'); audio.play('stamp', { vol: 0.5 }); refreshCtx(ctx); render(false); }, 'blue qb-act', { icon: 'quest', sound: 'tap' });
      else if (st.done) act = button('CLAIM', () => claimChain(npc, card), 'green qb-act qb-claim pulse', { icon: 'gift', sound: 'tap' });
      else if (q.boss) act = button('FIGHT', () => { close(); openBoss(q.boss, ctx); }, 'red qb-act', { icon: 'boss', sound: 'tap' });
      else if (q.secret) act = button('SEARCH', () => { close(); ctx.focusArena?.(QUEST_NPC_ZONE[npc]); }, 'teal qb-act', { icon: 'eye', sound: 'tap' });
      const zone = arenaById(QUEST_NPC_ZONE[npc]);
      body = h('div', { class: 'qb-case-body' },
        h('span', { class: 'qb-k' }, `QUEST ${st.step + 1} OF ${st.steps}`),
        h('b', { class: 'qb-title sm' }, q.title),
        h('span', { class: 'qb-goal sm', html: rich(st.text) }),
        st.accepted && q.stat ? progressEl(st.prog, st.need, st.done) : null,
        q.secret && st.accepted && !st.done && zone ? h('span', { class: 'qb-scrib sm' }, `Hidden somewhere in the ${zone.name} zone.`) : null,
        h('div', { class: 'qb-foot' }, rewardsRow(q.reward), act));
    }
    head.querySelector('.qb-case-st').replaceWith(stampEl(kind, 'inl'));
    const card = h('div', { class: `qb-note qb-case paper-white qb-in ${kind === 'done' ? 'ready' : ''}`, 'data-pin': 'c-' + npc },
      pinEl(c.pin, 'top'), head, body);
    return card;
  }
  function rematchCard() {
    const has = !!P().commanders.owned.jimmy;
    const b = BOSSES.jimmyRematch;
    const ok = P().bestTrophies >= b.minTrophies;
    const head = h('div', { class: 'qb-case-head' },
      poster('jimmy', has ? 'Fine. You won. I am on your team now. I still want that pizza.' : CHAIN_LINES.jimmyRematch, 'big'),
      h('div', { class: 'qb-case-meta' },
        h('div', { class: 'qb-kline' }, h('b', { class: 'qb-case-n' }, 'JIMMY'), stampEl(has ? 'claimed' : ok ? 'new' : 'locked', 'inl')),
        h('span', { class: 'qb-scrib sm' }, 'The boss of the lab wants a rematch.'),
        h('span', { class: 'qb-case-prize' }, icon('crown'), 'Win: Jimmy joins as a Commander')));
    let act = null;
    if (!has) act = ok ? button('FIGHT', () => { close(); openBoss('jimmyRematch', ctx); }, 'red qb-act', { icon: 'boss', sound: 'tap' })
      : lockedBtn('FIGHT', `Reach *${b.minTrophies} trophies* to challenge Jimmy.`);
    const body = h('div', { class: 'qb-case-body' },
      h('b', { class: 'qb-title sm' }, 'The Rematch'),
      h('span', { class: 'qb-goal sm' }, has ? 'You beat Jimmy. He joined your Lab.' : b.desc),
      h('div', { class: 'qb-foot' }, has ? null : rewardsRow({ commander: 'jimmy' }), act));
    return h('div', { class: 'qb-note qb-case paper-white qb-in', 'data-pin': 'c-jimmy' },
      pinEl('blue', 'top'), head, body);
  }

  // ------------------------------------------------------------ red string between pins
  // Each link ties the two nearest corners of two notes (pins in the paper's margin, so the string
  // never runs over writing) with a sagging pixel string.
  const LINKS = {
    main: [['chap', 'hero'], ['hero', 'next'], ['next', 'pile'], ['next', 'folder']],
    daily: [['dhead', 'd0'], ['d0', 'd1'], ['d1', 'd2']],
    chars: [['c-nolan', 'c-juan'], ['c-juan', 'c-jimmy']],
  };
  function layoutStrings() {
    if (closed) return;
    const S = sheet.getBoundingClientRect();
    const cs = getComputedStyle(document.documentElement);
    const px = parseFloat(cs.getPropertyValue('--px')) || 2;
    const inset = px * 6 * 0.6;
    const box = (id) => {
      const el = page.querySelector(`[data-pin="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 4) return null;
      const L = r.left - S.left, T = r.top - S.top, R = r.right - S.left, B = r.bottom - S.top;
      const c = [{ x: L + inset, y: T + inset }, { x: R - inset, y: T + inset }, { x: L + inset, y: B - inset }];
      // a dog-eared note has no bottom-right corner to pin
      if (!el.classList.contains('paper-cream')) c.push({ x: R - inset, y: B - inset });
      return c;
    };
    const segs = [], pts = [];
    for (const [a, b] of LINKS[tab] ?? []) {
      const A = box(a), B = box(b);
      if (!A || !B) continue;
      let best = null, bd = Infinity;
      for (const p of A) for (const q of B) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; best = [p, q]; } }
      segs.push(best);
      for (const p of best) if (!pts.some((o) => Math.abs(o.x - p.x) < 2 && Math.abs(o.y - p.y) < 2)) pts.push(p);
    }
    drawString(strings, sheet.scrollWidth, sheet.scrollHeight, px, segs);
    knots.replaceChildren(...pts.map((p) => h('i', { class: 'qb-knot', style: { left: p.x + 'px', top: p.y + 'px' } })));
  }

  // ------------------------------------------------------------ claiming
  function counterFor(type) {
    return type === 'coins' ? cnt.coins : type === 'bucks' ? cnt.bucks : type === 'calories' ? cnt.calories ?? null : type === 'vial' ? cnt.vial : null;
  }
  function rollCounters() {
    const p = P();
    for (const [k, v] of [['coins', p.coins], ['bucks', p.bucks], ['calories', p.calories]]) {
      const c = cnt[k];
      if (!c || c.val === v) continue;
      rollNumber(c.v, c.val, v, 0.7);
      floatDelta(c.el, v - c.val, 'qb-delta');
      c.val = v;
      bump(c.el, 'qb-c-bump');
    }
    cnt.vial.v.textContent = `${vialCount()}/${p.vials.slots.length}`;
  }
  /** Stamp slam + dust + shake on a note. */
  async function slam(note, kind = 'claimed') {
    note.querySelectorAll('.qb-stamp').forEach((s) => s.classList.add('gone'));
    const st = stampEl(kind, 'qb-slam');
    note.appendChild(st);
    audio.play('whoosh', { pitch: 1.4, vol: 0.5 });
    await wait(0.18);
    audio.play('stamp');
    audio.play('thud', { pitch: 0.8, vol: 0.6 });
    frame.classList.remove('qb-shake'); void frame.offsetWidth; frame.classList.add('qb-shake');
    dust(st);
    await wait(0.25);
  }
  /** Pixel dust puffs off the stamp edges. */
  function dust(el) {
    if (!el?.isConnected || reduced()) return;
    const r = el.getBoundingClientRect();
    const cols = ['#c81e2a', '#fbf1d6', '#e8d6a8', '#ffffff'];
    for (let i = 0; i < 18; i++) {
      const side = i % 4;
      const x = side === 0 ? r.left : side === 1 ? r.right : r.left + Math.random() * r.width;
      const y = side === 2 ? r.top : side === 3 ? r.bottom : r.top + Math.random() * r.height;
      const d = h('i', { class: 'qb-dust', style: { left: x + 'px', top: y + 'px', background: cols[i % cols.length] } });
      $overlay().appendChild(d);
      const dx = (side === 0 ? -1 : side === 1 ? 1 : (Math.random() - 0.5)) * (14 + Math.random() * 26);
      const dy = (side === 2 ? -1 : side === 3 ? 1 : (Math.random() - 0.5)) * (10 + Math.random() * 20);
      d.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`, opacity: 0 }],
        { duration: 380 + Math.random() * 260, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => d.remove();
    }
  }
  /** Rewards fly from the note into the counters on the frame. */
  async function payout(note, reward) {
    const flights = [];
    for (const r of rewardList(reward)) {
      const c = counterFor(r.type);
      const from = note.querySelector(`.qb-rw[data-rw="${r.type}"]`) ?? note;
      const ic = r.type === 'coins' ? 'coin' : r.type === 'bucks' ? 'bucks' : r.type === 'calories' ? 'calorie' : r.type === 'vial' ? 'vial' : null;
      if (c && ic) flights.push(flyIcons(from, ic, c.el, { count: r.type === 'vial' ? 3 : 7, size: r.type === 'vial' ? 34 : 28 }));
    }
    setTimeout(() => audio.play('coin'), 520);
    setTimeout(rollCounters, 620);
    await Promise.all(flights);
    rollCounters();
  }
  async function claimMain(note) {
    if (busy) return;
    const got = claimMainQuest();
    if (!got) return;
    busy = true;
    try {
      note.classList.add('claiming');
      note.querySelector('.qb-claim')?.remove();
      await slam(note);
      audio.play('levelUp');
      sparkle(note, { count: 22, spread: 110 });
      confetti($overlay(), { count: 34, spread: 0.5, life: 3 });
      await payout(note, got.quest.reward);
      refreshCtx(ctx);
      await wait(0.35);
      // the note comes off the board onto the done pile
      const pile = page.querySelector('.qb-pile');
      if (pile && !reduced()) {
        const a = note.getBoundingClientRect(), b = pile.getBoundingClientRect();
        audio.play('tear');
        await note.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(0.3)`, opacity: 0.2 }],
          { duration: 420, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished.catch(() => {});
      }
      if (closed) return;
      render(false);
      // the next quest drops in with its NEW stamp
      const hero = page.querySelector('.qb-hero');
      if (hero && !reduced()) {
        hero.classList.add('qb-drop', 'qb-big');
        setTimeout(() => hero.classList.remove('qb-drop', 'qb-big'), 900);
        setTimeout(() => audio.play('cork'), 300);
      }
      onChange();
    } finally { busy = false; }
  }
  async function claimDaily(c, note) {
    if (busy) return;
    const before = passTier();
    const cal = claimChallenge(c.id);
    if (!cal) return;
    busy = true;
    try {
      note.classList.add('claiming');
      note.querySelector('.qb-claim')?.remove();
      await slam(note);
      audio.play('levelUp');
      sparkle(note, { count: 18, spread: 90, colors: ['#ff8a1f', '#ffd84a', '#ffffff'] });
      confetti($overlay(), { count: 24, spread: 0.4, life: 2.6 });
      await payout(note, { calories: cal });
      refreshCtx(ctx);
      if (passTier() > before) toast(`Food Pass *Tier ${passTier()}* reached! Juan is on the move.`, { icon: 'calorie' });
      await wait(0.3);
      if (!closed) render(false);
      onChange();
    } finally { busy = false; }
  }
  async function claimChain(npc, card) {
    if (busy) return;
    const st = questState(npc);
    const got = completeQuest(npc);
    if (!got.length) return;
    busy = true;
    try {
      card.classList.add('claiming');
      card.querySelector('.qb-claim')?.remove();
      await slam(card);
      audio.play('chaching');
      sparkle(card, { count: 22, spread: 110 });
      confetti($overlay(), { count: 30, spread: 0.5, life: 3 });
      await payout(card, st.quest.reward);
      refreshCtx(ctx);
      // a new Commander (or anything that isn't a counter) gets the big reward card
      const big = got.filter((g) => !['coins', 'bucks', 'calories', 'vial'].includes(g.kind));
      if (big.length) await showRewards(big, { title: 'QUEST DONE!', color: 'green' });
      if (!closed) render(false);
      onChange();
    } finally { busy = false; }
  }
  function onChange() {
    try { hm?.refresh?.(); } catch (e) { /* home gone */ }
  }

  // ------------------------------------------------------------ GO buttons
  function go(where) {
    close();
    if (!hm || hm.exited) return;
    if (where === 'battle') setTimeout(() => { if (!hm.exited && hm.tab === 'battle') hm.battle?.(); }, 260);
    else if (where === 'cards' || where === 'lab') hm.setTab?.(where);
    else if (where === 'vials') {
      const slot = hm.slotsEl?.querySelector('.hm-slot.ready, .hm-slot.locked:not(.empty)') ?? hm.slotsEl;
      if (slot) { const off = pointAt(slot, 'Tap!'); setTimeout(off, 2600); }
    }
  }

  // ------------------------------------------------------------ close
  function close() {
    if (closed) return;
    closed = true;
    open = null;
    clearTimeout(coverT);
    clearInterval(timer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    engine.cover('questBoard', false);
    state.save();
    audio.play('whoosh', { pitch: 1.2, vol: 0.6 });
    root.classList.add('out');
    setTimeout(() => root.remove(), 260);
    onChange();
  }

  render(true);
  state.save();
  open = { close, root, get tab() { return tab; } };
  return open;
}
