// QUEST BOARD: every quest in the game pinned to one cork board on the lab wall.
//
//   STORY  the main quest line (game/progression.js MAIN_QUESTS): the chapter on a clipboard, the
//          current quest as a big folded letter, the next one on a torn notebook page, a TOP SECRET
//          folder for the rest and the finished ones as a kraft pile you can flip through
//   DAILY  the daily challenges (Juan's Food Season calories, data/season.js) on sticky notes
//   CREW   the crew's quest chains (data/arenas.js QUEST_CHAINS) + Jimmy's rematch, as case files
//
// Pictures carry the meaning, not sentences: every note has an illustration of its objective
// (questBoardArt.js questArt), the objective as an icon + count with hand-drawn progress, rewards as
// icons + amounts, a short title, and a polaroid of whoever posted it. Tap the polaroid (or a daily
// note's picture) and they say their line in a speech bubble, in their own voice. Stamps (NEW /
// CLAIMED) mark what changed; claiming slams a CLAIMED stamp, flies the rewards into the counters
// and throws confetti.
//
// The scene (lab wall, lamp, shelf, walnut frame, cork, lamp light, every note's paper) is painted
// procedurally at 1 CSS px per texel by questBoardArt.js, sized to the measured layout and cached.
// The board is a full-screen layer in #overlay (under dialogue, modals and toasts); while it is fully
// up the island stops drawing (engine.cover).
import './questBoard.css';
import { h, icon, animIcon, button, closeDialogue, toast, sparkle, flyIcons, confetti, rollNumber, floatDelta, bump, $overlay, pointAt } from '../ui.js';
import { popWords } from '../dialogue.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { voiceOf } from '../../data/characters.js';
import { state, refreshDaily, challengeList, claimChallenge, questState, acceptQuest, completeQuest, passTier } from '../../game/state.js';
import { QUEST_CHAINS, QUEST_NPC_ZONE, QUESTS, BOSSES } from '../../data/arenas.js';
import {
  MAIN_QUESTS, MAIN_CHAPTERS, chapterOf, mainQuest, claimMainQuest, featureRevealed, lockInfo, FEATURES,
} from '../../game/progression.js';
import { charImg, rewardArt, rewardDef, countdown, tickTimers, midnightMs, showRewards, refreshCtx } from './common.js';
import { openBoss } from './boss.js';
import { ensureBoardArt, tallyURL, drawString, questArt, paperCanvas, cloneCanvas, paintScene, paintFrame, paintLight, PAPER_M, QUEST_OBJ } from './questBoardArt.js';

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

// Juan posts the daily list: a short title for each special, and what he says about it
const DAILY_TITLE = {
  winBattles: 'Win Battles', deployFood: 'Snack Squad', useFoodThrow: 'Food Throw', martBattles: 'Beast Mart', openVials: 'Open Vials',
  unleashMega: 'MEGA Time', useSignature: 'ULTIMATES', deployTroops: 'Troop Drop', smashCarts: 'Cart Smash', bases: 'Base Breaker', baseUp: 'Build It Up',
};
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
const STAMP = { new: 'NEW', done: 'DONE', claimed: 'CLAIMED', secret: 'TOP SECRET', next: 'NEXT' };
const stampEl = (kind, cls = '') => h('div', { class: `qb-stamp s-${kind} ${cls}` }, h('span', {}, STAMP[kind]));
/** A quest illustration. */
const artEl = (key, cls = '') => h('img', { class: `qb-art ${cls}`, src: questArt(key), alt: '', draggable: 'false' });

/** The objective as a picture: icon (+ badge) or a mini illustration. */
function objIcon(key) {
  const o = QUEST_OBJ[key] ?? { ic: 'quest' };
  if (o.art) return h('span', { class: 'qb-oi' }, artEl(o.art, 'oi-art'));
  return h('span', { class: 'qb-oi' }, icon(o.ic), o.b ? h('i', { class: 'qb-oi-b' }, icon(o.b)) : null);
}

/** Hand-drawn progress: tally marks up to 12, a hatched pen bar for bigger numbers, then the count. */
function progressEl(prog, need, done) {
  const lbl = h('b', { class: 'qb-cnt' }, need >= 100 ? `${fmt(prog)}/${fmt(need)}` : `${prog}/${need}`);
  if (need <= 12) {
    const tw = need <= 1 ? 28 : Math.ceil(need / 5) * 30 + 4;
    return h('div', { class: `qb-prog tally ${done ? 'full' : ''}` }, h('img', { class: 'qb-tally', src: tallyURL(prog, need), alt: '', style: { width: tw + 'px' } }), lbl);
  }
  return h('div', { class: `qb-prog bar ${done ? 'full' : ''}` }, h('div', { class: 'qb-bar' }, h('i', { style: { width: Math.max(3, Math.min(100, (prog / need) * 100)) + '%' } })), lbl);
}
/** Objective row: picture + progress. */
const objRow = (key, prog, need, done) => h('div', { class: `qb-obj ${done ? 'full' : ''}` }, objIcon(key), progressEl(prog, need, done));

/** A locked objective: padlock + what opens it, in two words (the GO button tells the full story). */
function lockRow(feature) {
  const L = lockInfo(feature);
  const f = FEATURES[feature]?.alias ? FEATURES[FEATURES[feature].alias] : FEATURES[feature];
  const txt = L.left !== undefined && !f?.trophies ? `${L.left} ${L.left === 1 ? 'WIN' : 'WINS'}` : f?.trophies ? `${f.trophies}` : 'SOON';
  return h('div', { class: 'qb-obj lock' }, h('span', { class: 'qb-oi' }, icon(f?.icon ?? 'lock'), h('i', { class: 'qb-oi-b' }, icon('lock'))),
    h('span', { class: 'qb-lockt' }, f?.trophies ? icon('trophy') : null, txt));
}

/** Reward chips: icons + amounts (the gift ribbon says "you get"). */
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
  if (CUR_ICON[r.type]) return h('span', { class: `qb-rw cur k-${r.type}`, 'data-rw': r.type }, animIcon(CUR_ICON[r.type]), h('b', {}, fmt(r.amount)));
  let art;
  try { art = rewardArt(rewardDef(r)); } catch (e) { art = icon('gift'); }
  return h('span', { class: `qb-rw art k-${r.type}`, 'data-rw': r.type }, h('span', { class: 'qb-rw-art' }, art), r.copies > 1 ? h('b', {}, 'x' + r.copies) : null);
}
const rewardsRow = (b) => h('div', { class: 'qb-rws' }, h('i', { class: 'qb-rws-k', 'aria-hidden': 'true' }, icon('gift')), h('div', { class: 'qb-rws-l' }, rewardList(b).map(rewardChip)));

/** A locked button, blacked out like the home buttons: silhouette + padlock; tap = what opens it. */
function lockedBtn(label, text, cls = '') {
  const b = button(label, () => { audio.play('deny'); b.classList.remove('pg-shake'); void b.offsetWidth; b.classList.add('pg-shake'); toast(text, { icon: 'lock' }); }, `gray sm qb-act pg-lock ${cls}`, { sound: 'tap' });
  b.appendChild(h('i', { class: 'pg-pad', 'aria-hidden': 'true' }, icon('lock')));
  return b;
}

// ---------------------------------------------------------------------------- speech bubble

let bub = null;
function hush() {
  if (!bub) return;
  const b = bub;
  bub = null;
  clearTimeout(b.t);
  b.words?.finish();
  b.anchor?.classList.remove('talking');
  b.el.classList.add('out');
  setTimeout(() => b.el.remove(), 180);
}
/**
 * `who` says `line` in a speech bubble pointing at `anchor` (their polaroid), word by word in their
 * own voice. Tap anywhere (or wait) to close it.
 */
function speak(who, line, anchor, host) {
  if (!line) return;
  const same = bub && bub.anchor === anchor;
  hush();
  if (same) return;
  audio.play('tap');
  const c = crew(who);
  const txt = h('div', { class: 'qb-bub-t' });
  const el = h('div', { class: 'qb-bub', role: 'status' }, h('b', { class: 'qb-bub-n', style: { '--pc': c.color } }, c.name), txt, h('i', { class: 'qb-bub-tail' }));
  host.appendChild(el);
  el.addEventListener('click', (e) => { e.stopPropagation(); hush(); });
  const a = anchor.getBoundingClientRect(), H = host.getBoundingClientRect();
  const bw = Math.min(300, H.width - 24);
  el.style.width = bw + 'px';
  // the words go in now (invisible until they pop), so the bubble already has its final size
  const v = voiceOf(c.char);
  const words = popWords(txt, line, {
    cps: 34,
    onWord: (wd) => {
      const len = wd.text.replace(/[^A-Za-z0-9]/g, '').length;
      if (len) audio.voice(v, { text: wd.text, span: Math.max(0.09, (len + 1) / 34 * 1.1), emph: wd.emph, ask: /\?/.test(wd.text) });
    },
  });
  // over the polaroid when there's room (else under it), kept on screen
  let x = a.left + a.width * 0.5 - H.left - 34;
  x = Math.max(12, Math.min(H.width - bw - 12, x));
  el.style.left = x + 'px';
  const bh = el.offsetHeight, up = a.top - H.top, down = H.bottom - a.bottom;
  const above = up >= bh + 26 || up > down;
  el.classList.add(above ? 'up' : 'down');
  el.style.top = (above ? Math.max(8, up - 14 - bh) : Math.min(H.height - bh - 8, a.bottom - H.top + 14)) + 'px';
  el.style.setProperty('--tx', Math.max(14, Math.min(bw - 30, a.left + a.width * 0.5 - H.left - x - 8)) + 'px');
  anchor.classList.add('talking');
  const me = { el, anchor, words, t: 0 };
  bub = me;
  words.promise.then(() => {
    anchor.classList.remove('talking');
    if (bub === me) me.t = setTimeout(() => { if (bub === me) hush(); }, 1800 + line.length * 28);
  });
}

/** Polaroid of whoever posted the note. Tap = their line, in a speech bubble. */
function poster(who, line, cls, host) {
  const c = crew(who);
  const b = h('button', { class: `qb-poster ${cls}`, type: 'button', 'aria-label': `${c.name} says` },
    h('span', { class: 'qb-photo', style: { '--pc': c.color } }, charImg(c.char, { size: 128, eyes: 'happy', mouth: 'grin' })),
    h('span', { class: 'qb-poster-n' }, c.name.toUpperCase()),
    h('i', { class: 'qb-talk', 'aria-hidden': 'true' }));
  b.addEventListener('click', (e) => { e.stopPropagation(); speak(who, line, b, host()); });
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

  // ------------------------------------------------------------ scene, header, counters, tabs, frame
  const cnt = {};
  // (the vial counter keeps a still icon: its bubbling strip is costly to build on first use)
  const counter = (k, ic, val, tip) => {
    const v = h('b', {}, val);
    const el = h('div', { class: `qb-c k-${k}`, title: tip }, k === 'vial' ? icon(ic) : animIcon(ic), v);
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
  const sign = h('div', { class: 'qb-sign' }, icon('quest'), h('b', {}, 'QUESTS'));
  const tabsEl = h('div', { class: 'qb-tabs' });
  const head = h('div', { class: 'qb-head' }, sign, tabsEl, wallet, closeBtn);
  const page = h('div', { class: 'qb-page' });
  const strings = h('canvas', { class: 'qb-string', 'aria-hidden': 'true' });
  const knots = h('div', { class: 'qb-knots', 'aria-hidden': 'true' });
  const deco = h('div', { class: 'qb-deco', 'aria-hidden': 'true' });
  const sheet = h('div', { class: 'qb-sheet' }, deco, page, strings, knots);
  const cork = h('div', { class: 'qb-cork scroll-y' }, sheet);
  const frameArt = h('canvas', { class: 'qb-frame-art', 'aria-hidden': 'true' });
  const lightEl = h('canvas', { class: 'qb-light', 'aria-hidden': 'true' });
  const frame = h('div', { class: 'qb-frame' }, frameArt, cork, lightEl);
  const sceneEl = h('canvas', { class: 'qb-scene', 'aria-hidden': 'true' });
  const root = h('div', { class: 'qb', role: 'dialog', 'aria-label': 'Quest board' }, sceneEl, head, frame);
  $overlay().appendChild(root);
  const bubHost = () => root;
  audio.play('whoosh', { pitch: 0.9 });
  setTimeout(() => { if (!closed) audio.play('thud'); }, 260);
  const coverT = setTimeout(() => { if (!closed) engine.cover('questBoard', true); }, 520);
  const timer = setInterval(() => { if (root.isConnected) tickTimers(root); }, 1000);
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('#overlay .cdlg, #overlay .modal-back')) { if (bub) hush(); else close(); } };
  window.addEventListener('keydown', onKey);
  let resizeT = 0;
  const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!closed) { paintScenery(); render(false); } }, 160); };
  window.addEventListener('resize', onResize);
  // any tap on the board closes an open speech bubble
  root.addEventListener('pointerdown', (e) => { if (bub && !e.target.closest('.qb-poster, .qb-art-btn, .qb-bub')) hush(); }, true);
  cork.addEventListener('scroll', () => { if (bub) hush(); }, { passive: true });

  /**
   * Paint the wall, the frame and the lamp light for the current layout (cached per size). Each
   * piece is its own task, so a first (uncached) paint never holds up more than one frame.
   */
  let sceneryJob = 0;
  function paintScenery() {
    if (closed) return;
    const job = ++sceneryJob;
    const R = root.getBoundingClientRect();
    const W = Math.round(R.width), H = Math.round(R.height);
    if (W < 10 || H < 10) return;
    const rel = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left - R.left), y: Math.round(r.top - R.top), w: Math.round(r.width), h: Math.round(r.height) }; };
    const fr = rel(frame), cr = rel(cork), signR = rel(sign);
    const heads = [sign, closeBtn, wallet, ...tabsEl.children].map(rel);
    const cs = getComputedStyle(frame);
    const t = Math.round(parseFloat(cs.borderTopWidth)) || 22, b = Math.round(parseFloat(cs.borderBottomWidth)) || t;
    const M = 16;
    const put = (cv, src) => { cv.width = src.width; cv.height = src.height; cv.getContext('2d').drawImage(src, 0, 0); };
    let lampX = null;
    const steps = [
      () => { const sc = paintScene(W, H, { head: heads, frame: fr, sign: signR }); lampX = sc.lampX; put(sceneEl, sc.canvas); },
      () => {
        const fa = paintFrame(fr.w, fr.h, { t, b, M, ledge: b > t + 6 });
        put(frameArt, fa);
        frameArt.style.width = fa.width + 'px'; frameArt.style.height = fa.height + 'px';
        frameArt.style.left = (-t - M) + 'px'; frameArt.style.top = (-t - M) + 'px';
        root.classList.add('painted');
      },
      () => put(lightEl, paintLight(cr.w, cr.h, lampX === null ? null : lampX - cr.x)),
    ];
    const next = () => {
      if (closed || job !== sceneryJob || !steps.length) return;
      steps.shift()();
      if (steps.length) setTimeout(next, 0);
    };
    next();
  }

  /** Tabs are built once (their icons load async); later renders only move the "on" tab and the badges. */
  const tabEls = {};
  function renderTabs() {
    const c = boardCounts();
    const T = [
      { id: 'main', label: 'STORY', icon: 'quest', n: c.main },
      { id: 'daily', label: 'DAILY', icon: 'calorie', n: c.daily, lock: 'pass' },
      { id: 'chars', label: 'CREW', icon: 'friends', n: c.chars, lock: 'pass' },
    ];
    if (!tabsEl.childElementCount) {
      tabsEl.replaceChildren(...T.map((t) => {
        const locked = t.lock && !featureRevealed(t.lock);
        const b = h('button', { class: `qb-tab ${locked ? 'pg-lock' : ''}`, type: 'button', 'data-qbtab': t.id },
          icon(t.icon), h('span', {}, t.label),
          locked ? h('i', { class: 'pg-pad', 'aria-hidden': 'true' }, icon('lock')) : null);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (locked) {
            audio.play('deny');
            b.classList.remove('pg-shake'); void b.offsetWidth; b.classList.add('pg-shake');
            const left = lockInfo(t.lock).left ?? 1;
            toast(`Win ${left} more ${left === 1 ? 'battle' : 'battles'} to open *${t.label}* quests.`, { icon: 'lock' });
            return;
          }
          if (t.id === tab || busy) return;
          audio.play('tap');
          audio.play('tear', { pitch: 1.3, vol: 0.4 });
          hush();
          tab = t.id;
          pileOpen = false;
          render(true);
        });
        tabEls[t.id] = { b, locked, badge: null };
        return b;
      }));
    }
    for (const t of T) {
      const e = tabEls[t.id];
      e.b.classList.toggle('on', t.id === tab);
      const n = e.locked ? 0 : t.n;
      if (n && !e.badge) e.b.appendChild((e.badge = h('i', { class: 'qb-tab-n' })));
      if (e.badge) {
        if (n) e.badge.textContent = String(n);
        else { e.badge.remove(); e.badge = null; }
      }
    }
  }

  // ------------------------------------------------------------ pages
  let paintJob = 0, stringJob = 0;
  function render(anim = false) {
    hush();
    renderTabs();
    const kids = tab === 'daily' ? dailyPage() : tab === 'chars' ? charsPage() : mainPage();
    page.className = `qb-page pg-${tab}`;
    page.replaceChildren(...kids);
    decorate();
    paintPapers();
    sheet.classList.remove('qb-strung');
    if (anim) cork.scrollTop = 0;
    // notes pin in, staggered
    if (anim && !reduced()) {
      [...page.querySelectorAll('.qb-in')].forEach((n, i) => {
        n.style.animationDelay = (0.05 + i * 0.07).toFixed(2) + 's';
        n.classList.add('qb-drop');
      });
      setTimeout(() => page.querySelectorAll('.qb-drop').forEach((n) => { if (!n.getAnimations || !n.getAnimations().some((a) => a.playState === 'running')) n.classList.remove('qb-drop'); }), 1200);
    }
    tickTimers(root);
    // the red string goes up once the notes have landed (their drop animations have finished)
    const job = ++stringJob;
    const settle = () => { if (!closed && job === stringJob) { layoutStrings(); sheet.classList.add('qb-strung'); } };
    const drops = anim && !reduced() && page.getAnimations ? page.getAnimations({ subtree: true }).filter((a) => a.animationName === 'qbDrop') : [];
    if (drops.length) Promise.all(drops.map((a) => a.finished.catch(() => {}))).then(() => setTimeout(settle, 60));
    else setTimeout(settle, 40);
  }

  /**
   * Give every note its painted paper (exact size, cached). The first ones paint right away, the
   * rest a frame at a time, so opening the board never stalls; until then a flat paper colour shows.
   */
  function paintPapers() {
    const job = ++paintJob;
    const notes = [...page.querySelectorAll('[data-paper]')];
    const sizes = notes.map((n) => [n.offsetWidth, n.offsetHeight]);
    let i = 0;
    const step = () => {
      if (job !== paintJob || closed) return;
      const t0 = performance.now();
      while (i < notes.length && (performance.now() - t0 < 14 || i === 0)) {
        const n = notes[i], [w, hh] = sizes[i];
        i++;
        if (!n.isConnected || w < 8 || hh < 8) continue;
        n.querySelector(':scope > .qb-paper')?.remove();
        const c = cloneCanvas(paperCanvas(n.dataset.paper, w, hh, +(n.dataset.seed ?? 1)), 'qb-paper');
        c.style.left = c.style.top = -PAPER_M + 'px';
        c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
        n.prepend(c);
        n.classList.add('papered');
      }
      if (i < notes.length) requestAnimationFrame(step);
    };
    step();
  }

  /** Coffee rings + doodle scraps behind the notes (they differ per page). */
  function decorate() {
    const land = document.body.classList.contains('landscape');
    const D = (land ? {
      main: [['coffee', 76, 64], ['doodle-panther', 2, 70], ['coffee', 40, 86]],
      daily: [['coffee', 60, 62], ['doodle-flask', 82, 2], ['doodle-money', 4, 72]],
      chars: [['coffee', 70, 30], ['doodle-toilet', 86, 70], ['coffee', 2, 88]],
    } : {
      main: [['coffee', 64, 0], ['doodle-panther', 2, 55], ['coffee', 56, 93]],
      daily: [['coffee', 62, 20], ['doodle-money', 2, 74], ['coffee', 40, 95]],
      chars: [['coffee', 66, 30], ['doodle-toilet', 72, 95], ['coffee', 2, 62]],
    })[tab] ?? [];
    deco.replaceChildren(...D.map(([k, x, y]) => h('i', { class: `qb-dc ${k}`, style: { left: x + '%', top: y + '%' } })));
  }

  // STORY ---------------------------------------------------------------------
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

  /** The chapter on a clipboard: number, title, one hand-drawn box per quest (ticked when done). */
  function chapterCard(ch, idx) {
    const inCh = MAIN_QUESTS.slice(ch.from, ch.to);
    const doneN = Math.max(0, Math.min(inCh.length, idx - ch.from));
    return h('div', { class: 'qb-note qb-chap qb-in', 'data-paper': 'clip', 'data-pin': 'chap', 'aria-label': `Chapter ${ch.n} of ${MAIN_CHAPTERS.length}: ${ch.title}` },
      h('div', { class: 'qb-chap-in' },
        h('span', { class: 'qb-chap-no' }, h('small', {}, 'CH'), String(ch.n)),
        h('b', { class: 'qb-chap-t' }, ch.title),
        h('div', { class: 'qb-chap-boxes' }, inCh.map((q, i) => h('span', { class: `qb-box ${i < doneN ? 'on' : i === doneN ? 'cur' : ''}`, title: q.title },
          h('img', { src: tallyURL(i < doneN ? 1 : 0, 1), alt: '' }))))));
  }

  function heroNote(st) {
    const q = st.quest;
    const isNew = !seen[q.id] && !st.done;
    seen[q.id] = 1;
    const locked = st.locked;
    let act;
    if (st.done) act = button('CLAIM', () => claimMain(note), 'green qb-act qb-claim pulse', { icon: 'gift', sound: 'tap' });
    else if (locked) act = lockedBtn('GO', lockInfo(locked).text);
    else if (q.go) act = button('GO', () => go(q.go), 'blue qb-act qb-go', { icon: 'arrowR', sound: 'tap' });
    const note = h('div', { class: `qb-note qb-hero qb-in ${st.done ? 'ready' : ''}`, 'data-paper': 'letter', 'data-seed': String(q.index + 3), 'data-pin': 'hero', 'aria-label': `${q.title}: ${q.goal}` },
      pinEl(crew(q.by).pin, 'top'),
      h('div', { class: 'qb-hero-top' },
        h('div', { class: 'qb-taped' }, poster(q.by, q.line, 'big', bubHost), tapeEl('', 'pt')),
        h('div', { class: 'qb-hero-art' }, artEl(q.id, 'big'))),
      isNew ? stampEl('new', 'qb-corner') : null,
      h('b', { class: 'qb-title' }, q.title),
      locked ? lockRow(locked) : objRow(q.id, st.prog, st.need, st.done),
      h('div', { class: 'qb-foot' }, rewardsRow(q.reward), act));
    return note;
  }

  function nextNote(q) {
    return h('div', { class: 'qb-note qb-next qb-in', 'data-paper': 'notebook', 'data-seed': '5', 'data-pin': 'next', 'aria-label': `Next: ${q.title}` },
      pinEl(crew(q.by).pin, 'top'),
      h('div', { class: 'qb-next-row' }, artEl(q.id, 'md'), h('b', { class: 'qb-title sm' }, q.title)),
      h('div', { class: 'qb-foot' }, rewardsRow(q.reward), stampEl('next', 'sm qb-inl')));
  }

  function folderNote(more) {
    return h('div', { class: 'qb-note qb-folder qb-in', 'data-paper': 'manila', 'data-pin': 'folder', 'aria-label': `${more} more quests` },
      pinEl('red', 'top'),
      stampEl('secret', 'qb-folder-stamp'),
      h('div', { class: 'qb-folder-n' }, icon('quest'), h('b', {}, '+' + more)));
  }

  function pileNote(idx) {
    const b = h('button', { class: `qb-note qb-pile qb-in ${pileOpen ? 'open' : ''}`, type: 'button', 'data-paper': 'kraft', 'data-pin': 'pile', 'aria-label': `${idx} quests done` },
      h('i', { class: 'qb-pile-b b1' }), h('i', { class: 'qb-pile-b b2' }),
      pinEl('yellow', 'top'),
      stampEl('claimed', 'qb-pile-stamp'),
      h('div', { class: 'qb-pile-n' }, icon('check'), h('b', {}, String(idx))),
      h('i', { class: 'qb-pile-eye', 'aria-hidden': 'true' }, icon(pileOpen ? 'x' : 'eye')));
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
      MAIN_QUESTS.slice(0, idx).reverse().map((q) => h('div', { class: 'qb-note qb-mini qb-in', 'data-paper': 'kraft', 'data-seed': String(q.index + 11) },
        pinEl(crew(q.by).pin, 'top'),
        h('div', { class: 'qb-mini-top' }, artEl(q.id, 'xs'), stampEl('claimed', 'sm qb-inl')),
        h('b', { class: 'qb-mini-t' }, q.title))));
  }

  function endNote() {
    return h('div', { class: 'qb-note qb-hero qb-end qb-in', 'data-paper': 'letter', 'data-pin': 'hero' },
      pinEl('blue', 'top'),
      h('div', { class: 'qb-hero-top' },
        h('div', { class: 'qb-taped' }, poster('jimmy', 'Chapter four is on a napkin. Hang tight.', 'big', bubHost), tapeEl('', 'pt')),
        h('div', { class: 'qb-hero-art' }, artEl('end', 'big'))),
      stampEl('claimed', 'qb-corner'),
      h('b', { class: 'qb-title' }, 'Story Complete'),
      h('div', { class: 'qb-obj full' }, h('span', { class: 'qb-oi' }, icon('quest')), h('b', { class: 'qb-cnt' }, `${MAIN_QUESTS.length}/${MAIN_QUESTS.length}`)));
  }

  // DAILY ---------------------------------------------------------------------
  function dailyPage() {
    refreshDaily();
    const list = challengeList();
    const day = P().challenges.day;
    const headCard = h('div', { class: 'qb-note qb-dhead qb-in', 'data-paper': 'receipt', 'data-pin': 'dhead' },
      tapeEl('', 'tc'),
      poster('juan', 'Fresh specials every morning. Eat up.', 'big', bubHost),
      h('div', { class: 'qb-dhead-t' },
        h('b', { class: 'qb-title' }, 'Daily Specials'),
        h('span', { class: 'qb-timer', title: 'New list in' }, icon('clock'), countdown(midnightMs()))));
    const notes = list.map((c, i) => {
      const key = `d:${day}:${c.id}`;
      const isNew = !seen[key] && !c.done && !c.claimed;
      seen[key] = 1;
      const kind = c.claimed ? 'claimed' : c.done ? null : isNew ? 'new' : null;
      const act = c.claimed ? null : c.done ? button('CLAIM', () => claimDaily(c, note), 'green qb-act qb-claim pulse', { icon: 'gift', sound: 'tap' }) : null;
      const pic = h('button', { class: 'qb-art-btn', type: 'button', 'aria-label': 'Juan says' }, artEl(c.stat ?? 'wins', 'md'), h('i', { class: 'qb-talk', 'aria-hidden': 'true' }));
      pic.addEventListener('click', (e) => { e.stopPropagation(); speak('juan', DAILY_LINES[c.id] ?? 'Finish it before midnight. I believe in you. Mostly.', pic, root); });
      const note = h('div', { class: `qb-note qb-daily qb-in ${c.claimed ? 'claimed' : c.done ? 'ready' : ''}`, 'data-paper': DAILY_PAPER[i % DAILY_PAPER.length], 'data-seed': String(i + 2), 'data-pin': 'd' + i, 'aria-label': c.text },
        pinEl(['red', 'blue', 'green'][i % 3], 'top'),
        h('div', { class: 'qb-daily-top' }, pic,
          h('div', { class: 'qb-daily-t' }, h('b', { class: 'qb-title sm' }, DAILY_TITLE[c.id] ?? c.text), objRow(c.stat, c.prog, c.n, c.done))),
        // the stamp sits where the CLAIM button would be
        h('div', { class: 'qb-foot' }, rewardsRow({ calories: c.cal }), act ?? (kind ? stampEl(kind, 'qb-inl') : null)));
      return note;
    });
    const out = [headCard, h('div', { class: 'qb-dgrid' }, notes)];
    if (!list.length) out.push(h('div', { class: 'qb-note qb-in qb-empty', 'data-paper': 'index' }, h('b', {}, 'No specials today. Juan ate the list.')));
    return out;
  }

  // CREW ----------------------------------------------------------------------
  function charsPage() {
    const cards = Object.keys(QUEST_CHAINS).map(chainCard);
    cards.push(rematchCard());
    return [h('div', { class: 'qb-cgrid' }, cards)];
  }
  /** The chain as boxes, ending in the prize (a crown + the commander's photo when there is one). */
  function chainSteps(n, step, finished, prizeChar) {
    return h('div', { class: 'qb-steps' },
      Array.from({ length: n }, (_, k) => h('i', { class: finished || k < step ? 'on' : k === step ? 'cur' : '' })),
      prizeChar ? h('span', { class: 'qb-prize' }, h('i', { class: 'qb-prize-c' }, icon('crown')), h('span', { class: 'qb-prize-f' }, charImg(prizeChar, { size: 96, eyes: 'happy', mouth: 'grin' }))) : null);
  }
  function chainCard(npc) {
    const st = questState(npc);
    const chain = QUEST_CHAINS[npc];
    const lastQ = QUESTS[chain[chain.length - 1]];
    const finalCmd = lastQ?.reward?.commander;
    const c = crew(npc);
    let body, kind = null, act = null;
    if (!st || st.finished) {
      kind = 'claimed';
      body = h('div', { class: 'qb-case-body' }, artEl('end', 'md'), h('div', { class: 'qb-case-q' }, h('b', { class: 'qb-title sm' }, 'All done'),
        h('div', { class: 'qb-obj full' }, h('span', { class: 'qb-oi' }, icon('check')), h('b', { class: 'qb-cnt' }, `${chain.length}/${chain.length}`))));
    } else {
      const q = st.quest;
      kind = !st.accepted ? 'new' : null;
      if (!st.accepted) act = button('ACCEPT', () => { acceptQuest(npc); audio.play('magic'); audio.play('stamp', { vol: 0.5 }); refreshCtx(ctx); render(false); }, 'blue qb-act', { icon: 'quest', sound: 'tap' });
      else if (st.done) act = button('CLAIM', () => claimChain(npc, card), 'green qb-act qb-claim pulse', { icon: 'gift', sound: 'tap' });
      else if (q.boss) act = button('FIGHT', () => { close(); openBoss(q.boss, ctx); }, 'red qb-act', { icon: 'boss', sound: 'tap' });
      else if (q.secret) act = button('SEARCH', () => { close(); ctx.focusArena?.(QUEST_NPC_ZONE[npc]); }, 'teal qb-act', { icon: 'eye', sound: 'tap' });
      body = h('div', { class: 'qb-case-body' },
        artEl(q.id, 'md'),
        h('div', { class: 'qb-case-q' },
          h('b', { class: 'qb-title sm' }, q.title),
          st.accepted || q.boss || q.secret ? objRow(q.id, st.prog, st.need, st.done) : h('div', { class: 'qb-obj' }, objIcon(q.id), h('b', { class: 'qb-cnt' }, 'x' + (q.n ?? 1)))));
      body = [body, h('div', { class: 'qb-foot' }, rewardsRow(q.reward), act)];
    }
    const head = h('div', { class: 'qb-case-head' },
      h('div', { class: 'qb-clipped' }, poster(npc, st && !st.finished ? CHAIN_LINES[st.quest.id] : `Thanks for the help. ${c.name} owes you one. Maybe two.`, 'big', bubHost), h('i', { class: 'qb-clip', 'aria-hidden': 'true' })),
      h('div', { class: 'qb-case-meta' },
        h('b', { class: 'qb-case-n' }, c.name.toUpperCase()),
        chainSteps(chain.length, st?.finished ? chain.length : st?.step ?? 0, !!st?.finished, finalCmd ? CREW[finalCmd]?.char ?? finalCmd : null)));
    const card = h('div', { class: `qb-note qb-case qb-in ${st && !st.finished && st.done ? 'ready' : ''}`, 'data-paper': 'file', 'data-seed': String(npc.length), 'data-pin': 'c-' + npc, 'aria-label': `${c.name}'s quests` },
      pinEl(c.pin, 'top'), kind ? stampEl(kind, 'qb-corner') : null, head, body);
    return card;
  }
  function rematchCard() {
    const has = !!P().commanders.owned.jimmy;
    const b = BOSSES.jimmyRematch;
    const ok = P().bestTrophies >= b.minTrophies;
    const head = h('div', { class: 'qb-case-head' },
      h('div', { class: 'qb-clipped' }, poster('jimmy', has ? 'Fine. You won. I am on your team now. I still want that pizza.' : CHAIN_LINES.jimmyRematch, 'big', bubHost), h('i', { class: 'qb-clip', 'aria-hidden': 'true' })),
      h('div', { class: 'qb-case-meta' },
        h('b', { class: 'qb-case-n' }, 'JIMMY'),
        chainSteps(1, has ? 1 : 0, has, 'jimmy')));
    let act = null;
    if (!has) act = ok ? button('FIGHT', () => { close(); openBoss('jimmyRematch', ctx); }, 'red qb-act', { icon: 'boss', sound: 'tap' })
      : lockedBtn('FIGHT', `Reach *${b.minTrophies} trophies* to challenge Jimmy.`);
    const body = h('div', { class: 'qb-case-body' },
      artEl('jimmyRematch', 'md'),
      h('div', { class: 'qb-case-q' },
        h('b', { class: 'qb-title sm' }, 'The Rematch'),
        has ? h('div', { class: 'qb-obj full' }, h('span', { class: 'qb-oi' }, icon('check')), h('b', { class: 'qb-cnt' }, '1/1'))
          : h('div', { class: `qb-obj ${ok ? 'full' : ''}` }, h('span', { class: 'qb-oi' }, icon('trophy')), h('b', { class: 'qb-cnt' }, `${fmt(Math.min(P().bestTrophies, b.minTrophies))}/${fmt(b.minTrophies)}`))));
    return h('div', { class: 'qb-note qb-case qb-in', 'data-paper': 'file', 'data-seed': '9', 'data-pin': 'c-jimmy', 'aria-label': 'Jimmy rematch' },
      pinEl('blue', 'top'), has ? stampEl('claimed', 'qb-corner') : ok ? stampEl('new', 'qb-corner') : null, head, body,
      h('div', { class: 'qb-foot' }, has ? null : rewardsRow({ commander: 'jimmy' }), act));
  }

  // ------------------------------------------------------------ red string between pins
  // Each link ties the two nearest corners of two notes (in the paper's margin, so the string never
  // runs over writing) with a sagging yarn; curled / dog-eared corners are skipped.
  const LINKS = {
    main: [['chap', 'hero'], ['hero', 'next'], ['next', 'pile'], ['next', 'folder']],
    daily: [['dhead', 'd0'], ['d0', 'd1'], ['d1', 'd2']],
    chars: [['c-nolan', 'c-juan'], ['c-juan', 'c-jimmy']],
  };
  function layoutStrings() {
    if (closed) return;
    const S = sheet.getBoundingClientRect();
    const inset = 9;
    const box = (id) => {
      const el = page.querySelector(`[data-pin="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 4) return null;
      const L = r.left - S.left, T = r.top - S.top, R = r.right - S.left, B = r.bottom - S.top;
      // bottom corners cost a little extra: ties go to the top corners, away from the buttons
      const c = [{ x: L + inset, y: T + inset, k: 0 }, { x: R - inset, y: T + inset, k: 0 }, { x: L + inset, y: B - inset, k: 24 }];
      const k = el.dataset.paper;
      if (k !== 'letter' && !['yellow', 'pink', 'blue', 'green'].includes(k)) c.push({ x: R - inset, y: B - inset, k: 24 });
      return c;
    };
    const segs = [], pts = [];
    for (const [a, b] of LINKS[tab] ?? []) {
      const A = box(a), B = box(b);
      if (!A || !B) continue;
      let best = null, bd = Infinity;
      for (const p of A) for (const q of B) { const d = Math.hypot(p.x - q.x, p.y - q.y) + p.k + q.k; if (d < bd) { bd = d; best = [p, q]; } }
      segs.push(best);
      for (const p of best) if (!pts.some((o) => Math.abs(o.x - p.x) < 2 && Math.abs(o.y - p.y) < 2)) pts.push(p);
    }
    drawString(strings, sheet.scrollWidth, sheet.scrollHeight, 1, segs);
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
      hush();
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
        setTimeout(() => { hero.classList.remove('qb-drop', 'qb-big'); layoutStrings(); }, 900);
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
      hush();
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
      hush();
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
    hush();
    clearTimeout(coverT);
    clearTimeout(resizeT);
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

  renderTabs();
  render(true);
  // the wall / frame / light paint once the first frame is out, while the board is still fading in
  requestAnimationFrame(() => setTimeout(paintScenery, 0));
  state.save();
  open = { close, root, get tab() { return tab; } };
  return open;
}
