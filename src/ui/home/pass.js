// PASS tab: the FOOD SEASON pass as a 3D challenge path through BEAST MART.
// The path itself is a live voxel scene (ui/home/passStage.js) drawn by the main
// renderer as the engine backdrop while this tab covers the island. On top sits
// a thin DOM layer: season title + clock, the Calorie bar, the Premium button,
// the challenges drawer, the reward card for a tapped stop and the claim juice.
//
// Drag / swipe (or the mouse wheel) walks the camera along the path with
// inertia; opening the tab sweeps it up to Juan, who stands at your tier. Tap a
// stand for its reward card, tap Juan or a friend to hear them out.
//
// Rewards you can claim are hard to miss: a REWARDS READY button in the foot,
// a CLAIM tag over every ready stand (tap it to claim), arrows to ready stands
// above or below the view, and the season track along the edge (one pip per
// tier, free and premium halves, ready ones lit) that you can tap or scrub.
import { h, icon, button, bar, sparkle, bump, rich, burst, flyIcons, confetti, say, $overlay } from '../ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import {
  state, passTier, passClaimable, claimPass, buyPremiumPass, refreshDaily, challengeList, claimChallenge,
  questState, acceptQuest, completeQuest,
} from '../../game/state.js';
import { SEASON, PASS_TIERS, seasonEndMs, isMilestoneTier } from '../../data/season.js';
import { QUEST_CHAINS, QUEST_NPC_ZONE, BOSSES, arenaById } from '../../data/arenas.js';
import { CHARACTERS, voiceOf } from '../../data/characters.js';
import {
  segTabs, chip, timerChip, midnightMs, rewardTile, rewardLabel, rewardKind, rewardDef, rewardArt, showRewards, confirmBox, deny,
  refreshCtx, flyText, charImg, fmtN, countdown, currencyPill, tickTimers, isBigReward,
} from './common.js';
import { openBoss } from './boss.js';
import './pass.css';

const CH_ICON = {
  wins: 'swords', deployFood: 'burger', castfoodThrow: 'burger', martBattles: 'cart', vialsOpened: 'vial', signatures: 'star',
  deployed: 'swarm', cartsSmashed: 'cart', basesDestroyed: 'lab', baseUpgrades: 'up', megasUsed: 'mega',
};
const NPC_NAME = { jimmy: 'Jimmy', nolan: 'Nolan', juan: 'Juan' };
const SMALL = new Set(['coins', 'bucks', 'calories']);

let drawerSub = 'chal';
let lastJuanTier = null; // Juan walks from here to your tier the next time the pass opens

export function passClaimCount() {
  const t = passTier();
  let n = 0;
  for (let i = 0; i < Math.min(t, PASS_TIERS.length); i++) {
    if (passClaimable(i, 'free')) n++;
    if (passClaimable(i, 'premium')) n++;
  }
  return n;
}
export function challengeClaimCount() {
  refreshDaily();
  return challengeList().filter((c) => c.done && !c.claimed).length;
}
export function questClaimCount() {
  return Object.keys(QUEST_CHAINS).filter((npc) => questState(npc)?.done).length;
}

/** Reward kinds this screen doesn't know yet show as a mystery prize instead of breaking the card. */
function safeTile(r) {
  try {
    const d = rewardDef(r);
    if (d && d.type && d.type !== 'unknown' && rewardLabel(d) !== '???') return rewardTile(d);
  } catch (e) { console.warn('pass reward', r, e); }
  return h('div', { class: 'mn-rw k-mystery' }, h('div', { class: 'mn-ra mystery' }, icon('gift', 'mn-ra-ic big')));
}
function safeLabel(r) {
  try { const l = rewardLabel(r); if (l && l !== '???') return l; } catch (e) { /* unknown */ }
  return 'Mystery Prize';
}

// what the crew says when you tap them
const LINES = {
  jimmy: [
    'Clear the whole store before the season ends and it goes in the *video*.',
    'This cart is full of chocolate. For *science*.',
    'Rule one: no running in the store. Rule two: ignore rule one.',
  ],
  nolan: [
    "I'm not eating the snacks. I'm *testing* them.",
    "Snack aisle is the best aisle. I'm not leaving.",
    'Ten donuts in. Still going.',
  ],
  fan: [
    'I watched every grocery challenge twice. This one is my *favorite*.',
    'Can I get a picture with *Juan*? Please?',
    "My phone is at 2 percent and I'm still filming.",
  ],
  cashier: [
    'Scan it, bag it, *claim it*.',
    'Paper or plastic? Kidding. It all goes in the *vault*.',
    'Lane 3 is open. Lane 3 is always open.',
  ],
  stocker: [
    'I stocked this whole aisle this morning. Please don\'t knock anything over.',
    "Cereal goes on the top shelf so kids can't reach it. That's the point.",
    'Watch the floor. I just mopped.',
  ],
};
const CHEERS = ['Nice!', 'Into the cart!', "Let's go!", 'Big haul!', 'Ka-ching!'];

export function mount(el, ctx, opts = {}) {
  if (opts.sub === 'chal' || opts.sub === 'quests') drawerSub = opts.sub;
  el.classList.add('pz-tab');
  let disposed = false, out = false, live = false, busy = false;
  let stage = null;
  const lineIdx = {};

  // ------------------------------------------------------------- DOM
  const touch = h('div', { class: 'pz-touch' });
  const hud = h('div', { class: 'pz-hud' });
  const foot = h('div', { class: 'pz-foot' });
  const tags = h('div', { class: 'pz-tags' });
  const fxLayer = h('div', { class: 'pz-fx' }); // confetti falls from under the season plate, never over its text
  const curtain = h('div', { class: 'pz-curtain' },
    h('div', { class: 'pz-cur-in' },
      h('div', { class: 'pz-cur-cart' }, icon('cart', 'xl')),
      h('div', { class: 'pz-cur-t t-d' }, ...SEASON.name.split(' ').map((w) => h('span', {}, w))),
      h('div', { class: 'pz-cur-s t-d' }, 'Opening Beast Mart')));
  const root = h('div', { class: 'pz-root' }, touch, tags, fxLayer, hud, foot, curtain);
  el.appendChild(root);

  // ------------------------------------------------------------- HUD (season, clock, Calorie bar, premium)
  const N = PASS_TIERS.length;
  const hudTier = h('b', { class: 't-d' });
  const hudNext = h('b', { class: 't-d' });
  const nextArt = h('div', { class: 'pz-next-art' });
  const nextBox = h('button', { class: 'pz-tierbox next', type: 'button', 'aria-label': 'Next reward', onclick: () => {
    const i = Math.min(passTier(), N - 1);
    if (!stage || !live || passTier() >= N) return;
    audio.play('tap');
    stage.flyToTier(i, 0.8, () => openCard(i, 'free'));
  } }, h('small', { class: 't-d' }, 'NEXT'), nextArt, h('span', { class: 'pz-next-n' }, hudNext));
  const xpBar = bar(0, 'orange', '', { cls: 'pz-xpbar' });
  const premSlot = h('div', { class: 'pz-prem-slot' });
  hud.append(
    h('div', { class: 'pz-hud-row' },
      h('div', { class: 'pz-season' },
        h('div', { class: 'pz-title t-d' }, SEASON.name),
        h('div', { class: 'pz-season-sub' },
          h('span', { class: 'pz-sn t-d' }, `SEASON ${SEASON.id}`),
          h('span', { class: 'pz-clock' }, icon('clock', 's'), h('span', {}, 'Ends in'), countdown(seasonEndMs(), 'c-gold t-d', true)))),
      premSlot),
    h('div', { class: 'pz-xp' },
      h('div', { class: 'pz-tierbox cur' }, h('small', { class: 't-d' }, 'TIER'), hudTier),
      h('div', { class: 'pz-xpmid' }, xpBar),
      nextBox));

  function renderHud() {
    const tier = Math.min(passTier(), N);
    const max = tier >= N;
    const into = max ? SEASON.calPerTier : state.p.calories - tier * SEASON.calPerTier;
    hudTier.textContent = String(tier);
    hudNext.replaceChildren(max ? icon('check') : String(tier + 1));
    nextArt.replaceChildren(...(max ? [] : [safeTile(PASS_TIERS[tier].free)]));
    nextBox.classList.toggle('done', max);
    nextBox.querySelector('small').textContent = max ? 'DONE' : 'NEXT';
    xpBar.set(max ? 1 : into / SEASON.calPerTier, max ? 'PASS COMPLETE' : `${fmtN(Math.max(0, SEASON.calPerTier - into))} CAL TO TIER ${tier + 1}`);
    if (!xpBar.querySelector('.pz-cal')) xpBar.appendChild(icon('calorie', 'pz-cal'));
    premSlot.replaceChildren(state.p.pass.premium
      ? h('div', { class: 'pz-prem-on t-d', role: 'button', onclick: () => { audio.play('tap'); ctx.toast?.('*Premium* is active: both tracks are yours.', { icon: 'crown' }); } }, icon('crown', 's'), 'PREMIUM')
      : button('PREMIUM', (e) => buyPremium(e.currentTarget), 'yellow shine pz-prem-buy', { icon: 'crown', price: { cur: 'bucks', amount: SEASON.premiumCost }, sound: 'tap' }));
  }

  // ------------------------------------------------------------- foot (challenges, claim all, back to Juan)
  const chalBtn = button('CHALLENGES', () => openDrawer(), 'blue sm pz-chal-btn', { icon: 'star', sound: 'tap' });
  const midSlot = h('div', { class: 'pz-mid-slot' });
  // back to Juan (shows once the camera has wandered off)
  const homeBtn = button(charImg('juan', { size: 64 }, 'pz-juan-ic'), () => {
    if (!stage) return;
    stage.flyToTier(stage.juanIdx, 0.9);
  }, 'teal sm icon-only pz-home-btn', { sound: 'tap' });
  homeBtn.setAttribute('aria-label', 'Back to Juan');
  foot.append(chalBtn, midSlot, homeBtn);
  function renderFoot() {
    const badge = challengeClaimCount() + questClaimCount();
    chalBtn.querySelector('.badge')?.remove();
    if (badge > 0) chalBtn.appendChild(h('div', { class: 'badge' }, badge > 9 ? '9+' : String(badge)));
    const n = passClaimCount();
    if (n === shownReady) return;
    shownReady = n;
    const cta = n > 0 ? button(h('span', { class: 'pz-cb' },
      h('b', { class: 't-d' }, n === 1 ? '1 REWARD READY' : `${n} REWARDS READY`),
      h('small', { class: 't-d' }, n === 1 ? 'TAP TO CLAIM' : 'CLAIM ALL')), n === 1 ? claimFirst : claimAll, 'green pz-claimbar', { icon: 'gift', sound: 'tap' })
      : null;
    midSlot.replaceChildren(...(cta ? [cta] : []));
  }
  let shownReady = -1;
  /** One reward ready: walk the camera to it and claim it there, so its stand plays the claim. */
  function claimFirst() {
    const r = firstReady();
    if (!r || !stage || busy) return;
    stage.flyToTier(r.i, 0.7, () => claim(r.i, r.track));
  }
  function firstReady() {
    for (let i = 0; i < Math.min(passTier(), PASS_TIERS.length); i++) for (const tr of ['free', 'premium']) if (passClaimable(i, tr)) return { i, track: tr };
    return null;
  }

  // ------------------------------------------------------------- season track (minimap): one pip per tier, free | premium
  const pips = [];
  const trackIn = h('div', { class: 'pz-trk-in' });
  for (let i = 0; i < N; i++) {
    const f = h('i', { class: 'f' }), p = h('i', { class: 'p' });
    const el = h('div', { class: `pz-pip${isMilestoneTier(i) || i === N - 1 ? ' ms' : ''}` }, f, p);
    trackIn.appendChild(el);
    pips.push({ el, f, p });
  }
  const trkWin = h('i', { class: 'pz-trk-win' });
  const trkMe = h('div', { class: 'pz-trk-me t-d' });
  trackIn.append(trkWin, trkMe);
  const track = h('div', { class: 'pz-track', role: 'slider', 'aria-label': 'Season track: tap a tier to go there' },
    h('span', { class: 'pz-trk-end t-d' }, String(N)), trackIn, h('span', { class: 'pz-trk-end t-d' }, '1'));
  function renderTrack() {
    const tier = Math.min(passTier(), N);
    const P = state.p.pass;
    pips.forEach((q, i) => {
      q.f.className = `f ${P.free[i] ? 'c' : i < tier ? 'r' : ''}`;
      q.p.className = `p ${P.premium_[i] ? 'c' : !P.premium ? 'l' : i < tier ? 'r' : ''}`;
      q.el.classList.toggle('got', i < tier);
    });
    trkMe.style.display = tier > 0 ? '' : 'none';
    trkMe.style.setProperty('--m', ((tier - 0.5) / N).toFixed(4));
    trkMe.textContent = String(tier);
  }
  let trkPtr = null, trkLast = -1;
  const trackPick = (e) => {
    const r = trackIn.getBoundingClientRect();
    const f = document.body.classList.contains('landscape') ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height;
    return Math.max(0, Math.min(N - 1, Math.floor(f * N)));
  };
  const trackGo = (e, dur) => {
    const i = trackPick(e);
    if (i === trkLast) return;
    trkLast = i;
    stage.flyToTier(i, dur);
    audio.play('tick', { gap: 0.04 });
  };
  track.addEventListener('pointerdown', (e) => {
    if (!stage || !live || busy) return;
    e.stopPropagation();
    closeCard();
    trkPtr = e.pointerId;
    trkLast = -1;
    try { track.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    trackGo(e, 0.5);
  });
  track.addEventListener('pointermove', (e) => { if (trkPtr === e.pointerId) trackGo(e, 0.32); });
  const trkUp = (e) => { if (trkPtr === e.pointerId) trkPtr = null; };
  track.addEventListener('pointerup', trkUp);
  track.addEventListener('pointercancel', trkUp);
  root.appendChild(track);

  // ------------------------------------------------------------- ready rewards: CLAIM tags over the stands, arrows to the ones off screen
  let ready = []; // [{ i, track }] claimable right now, lowest tier first
  function collectReady() {
    ready = [];
    for (let i = 0; i < Math.min(passTier(), N); i++) for (const tr of ['free', 'premium']) if (passClaimable(i, tr)) ready.push({ i, track: tr });
  }
  const tagEls = new Map(); // "i:track" -> tag element
  function claimTag(i, tr) {
    const prem = tr === 'premium';
    const el = h('button', { class: `pz-ctag ${prem ? 'prem' : 'free'}`, type: 'button', 'aria-label': `Claim tier ${i + 1} ${prem ? 'premium' : 'free'} reward` },
      h('span', { class: 'pz-ctag-in t-d' }, icon(prem ? 'crown' : 'gift', 's'), 'CLAIM'));
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); });
    el.addEventListener('click', (e) => { e.stopPropagation(); audio.play('tap'); claim(i, tr); });
    tags.appendChild(el);
    return el;
  }
  const offUp = h('button', { class: 'pz-off up', type: 'button' }, icon('up', 's'), h('span', { class: 't-d' }));
  const offDn = h('button', { class: 'pz-off down', type: 'button' }, icon('up', 's pz-flip'), h('span', { class: 't-d' }));
  /** Fly to the nearest ready stand above (dir 1) or below (dir -1) the view. */
  function jumpReady(dir) {
    if (!stage || !live) return;
    const [lo, hi] = stage.visibleTiers();
    const list = ready.map((r) => r.i);
    const target = dir > 0 ? list.find((i) => i > hi) : [...list].reverse().find((i) => i < lo);
    if (target === undefined) return;
    audio.play('whoosh', { pitch: 1.3, vol: 0.5 });
    stage.flyToTier(target, 0.75);
  }
  for (const [b, dir] of [[offUp, 1], [offDn, -1]]) {
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); jumpReady(dir); });
  }
  // FREE / PREMIUM column labels that ride on the stand columns at the bottom of the view
  const laneF = h('span', { class: 'pz-lane free t-d' }, 'FREE');
  const laneP = h('span', { class: 'pz-lane prem t-d' }, icon('crown', 's'), 'PREMIUM');
  root.append(offUp, offDn, laneF, laneP);
  const vr = { top: 0, bot: 0, w: 0, right: 0 }; // the 3D view, relative to the tab
  function tickReady() {
    const used = new Set();
    let up = 0, down = 0;
    if (stage && live) {
      const o = root.getBoundingClientRect();
      for (const r of ready) {
        const p = stage.standTag(r.i, r.track);
        const x = p.x - o.left, y = p.y - o.top;
        const inView = p.vis && y > vr.top + 6 && y < vr.bot - 4 && x > 0 && x < vr.right;
        if (!inView) {
          if (p.vis ? y <= vr.top + 6 : r.i > stage.viewTier) up++;
          else down++;
          continue;
        }
        const key = r.i + ':' + r.track;
        used.add(key);
        let el = tagEls.get(key);
        if (!el) { el = claimTag(r.i, r.track); tagEls.set(key, el); }
        const k = Math.max(0.78, Math.min(1.1, p.s / 80));
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%) scale(${k.toFixed(2)})`;
        el.style.zIndex = String(Math.round(y));
      }
      // column labels along the bottom of the view, under the nearest stop's stands
      const [lo] = stage.visibleTiers();
      if (lo >= 0) {
        const pf = stage.standTag(lo, 'free'), pp = stage.standTag(lo, 'premium');
        // kept inside the view (clear of the track)
        const at = (lb, x) => {
          const w = lb.offsetWidth / 2 + 4;
          return Math.round(Math.max(w, Math.min(vr.right - w, x)));
        };
        laneF.style.transform = `translate(${at(laneF, pf.x - o.left)}px, ${Math.round(vr.bot)}px) translate(-50%, -100%)`;
        laneP.style.transform = `translate(${at(laneP, pp.x - o.left)}px, ${Math.round(vr.bot)}px) translate(-50%, -100%)`;
      }
      laneF.classList.toggle('show', lo >= 0);
      laneP.classList.toggle('show', lo >= 0);
    }
    for (const [key, el] of tagEls) if (!used.has(key)) { el.remove(); tagEls.delete(key); }
    for (const [b, n, word] of [[offUp, up, 'ABOVE'], [offDn, down, 'BELOW']]) {
      b.classList.toggle('show', n > 0);
      if (n > 0) b.lastChild.textContent = `${n} READY ${word}`;
    }
  }
  function tickTrackWindow() {
    if (!stage || !live) return;
    const [lo, hi] = stage.visibleTiers();
    trkWin.style.display = lo < 0 ? 'none' : '';
    if (lo >= 0) {
      trkWin.style.setProperty('--a', (lo / N).toFixed(4));
      trkWin.style.setProperty('--b', ((hi + 1) / N).toFixed(4));
    }
  }

  // ------------------------------------------------------------- view rect (the 3D frames itself between the panels)
  // offset* sizes ignore transforms, so the tab's slide-in / slide-out never skews the framing
  function layout() {
    const land = document.body.classList.contains('landscape');
    const hudH = hud.offsetHeight, footH = foot.offsetHeight, W = el.offsetWidth, H = el.offsetHeight;
    // the season track: under the season plate in landscape, down the right edge in portrait
    const trkW = land ? 0 : track.offsetWidth;
    const trkH = land ? track.offsetHeight : 0;
    track.style.top = hudH + 'px';
    track.style.bottom = land ? '' : footH + 'px';
    vr.top = hudH + trkH;
    vr.bot = H - (land ? 0 : footH);
    vr.right = W - trkW;
    fxLayer.style.top = hudH + 'px';
    root.style.setProperty('--pz-foot', footH + 'px');
    // portrait: centred on the path; landscape: on the open floor at the left
    offUp.style.top = (vr.top + 8) + 'px';
    offDn.style.bottom = (H - vr.bot + (land ? footH + 8 : 30)) + 'px';
    for (const b of [offUp, offDn]) b.classList.toggle('side', land);
    for (const b of [offUp, offDn]) b.style.left = land ? '' : (vr.right / 2) + 'px';
    if (!stage) return;
    const pr = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const x = pr.left + el.offsetLeft, y0 = pr.top + el.offsetTop;
    // portrait: the button row spans the width, frame above it; landscape: the buttons sit in the corners
    stage.setView({ x, y: y0 + vr.top, w: vr.right, h: Math.max(80, vr.bot - vr.top) });
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layout()) : null;
  ro?.observe(el); ro?.observe(hud); ro?.observe(foot); ro?.observe(track);
  window.addEventListener('resize', layout);

  // ------------------------------------------------------------- input: drag / wheel / tap
  let ptr = null;
  touch.addEventListener('pointerdown', (e) => {
    if (ptr || !stage || !live) return;
    audio.unlock();
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
    try { touch.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    stage.dragStart(e.clientY);
  });
  touch.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    if (!ptr.moved && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > 9) { ptr.moved = true; closeCard(); }
    if (ptr.moved) stage.dragMove(e.clientY);
  });
  const up = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr;
    ptr = null;
    stage?.dragEnd();
    // a tap: no drag and a short press (event timestamps, so a slow frame in between doesn't turn it into a hold)
    if (!p.moved && e.type === 'pointerup' && e.timeStamp - p.t < 900) tap(e.clientX, e.clientY);
  };
  touch.addEventListener('pointerup', up);
  touch.addEventListener('pointercancel', up);
  touch.addEventListener('wheel', (e) => {
    if (!stage || !live) return;
    e.preventDefault();
    closeCard();
    stage.wheel(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1));
  }, { passive: false });

  function tap(x, y) {
    if (busy) return;
    const hit = stage.pick(x, y);
    if (!hit) { closeCard(); return; }
    if (hit.kind === 'char') talk(hit.id);
    else openCard(hit.i, hit.track);
  }

  // ------------------------------------------------------------- reward card
  let card = null;
  function closeCard() {
    if (!card) return;
    const c = card;
    card = null;
    c.el.classList.add('out');
    setTimeout(() => c.el.remove(), 180);
  }
  function openCard(i, focus = null) {
    if (!PASS_TIERS[i]) return;
    const same = card && card.i === i;
    if (card) { card.el.remove(); card = null; }
    if (!same) audio.play('pop', { pitch: 1.15 });
    const T = PASS_TIERS[i];
    const tier = passTier();
    const reached = i < tier;
    const need = (i + 1) * SEASON.calPerTier - state.p.calories;
    const col = (track) => {
      const prem = track === 'premium';
      const r = T[track];
      const claimed = !!(prem ? state.p.pass.premium_[i] : state.p.pass.free[i]);
      const can = passClaimable(i, track);
      const locked = prem && !state.p.pass.premium;
      let act;
      if (claimed) act = h('div', { class: 'pz-card-st ok t-d' }, icon('check', 's'), 'CLAIMED');
      else if (can) act = button('CLAIM', () => claim(i, track), 'green pulse pz-card-claim', { icon: 'gift', sound: 'tap' });
      else if (locked) act = button('UNLOCK', (e) => buyPremium(e.currentTarget), 'yellow sm pz-card-claim', { icon: 'crown', sound: 'tap' });
      else act = h('div', { class: 'pz-card-st t-d' }, icon('lock', 's'), `TIER ${i + 1}`);
      return h('div', { class: `pz-card-col ${prem ? 'prem' : 'free'} ${focus === track ? 'focus' : ''} ${claimed ? 'claimed' : ''} ${can ? 'ready' : ''}` },
        h('div', { class: 'pz-card-track t-d' }, icon(prem ? 'crown' : 'gift', 's'), prem ? 'PREMIUM' : 'FREE'),
        h('div', { class: 'pz-card-art' }, can ? h('div', { class: `px-rays ${prem ? '' : 'w'}`, style: { '--rs': '150%', '--ro': 0.5 } }) : null, safeTile(r)),
        h('div', { class: 'pz-card-name' }, safeLabel(r)),
        h('div', { class: 'pz-card-kind' }, rewardKind(r)),
        act);
    };
    const status = reached ? (passClaimable(i, 'free') || passClaimable(i, 'premium') ? 'READY' : 'REACHED')
      : `${fmtN(Math.max(0, need))} CAL TO GO`;
    const el2 = h('div', { class: `pz-card ${isMilestoneTier(i) ? 'ms' : ''} ${reached ? 'reached' : ''}` },
      h('div', { class: 'pz-card-head' },
        h('b', { class: 'pz-card-tier t-d' }, `TIER ${i + 1}`),
        h('span', { class: `pz-card-status t-d ${reached ? 'ok' : ''}` }, icon(reached ? 'check' : 'calorie', 's'), status),
        button('', () => { audio.play('tap'); closeCard(); }, 'red sm icon-only pz-card-x', { icon: 'x', sound: 'tap' })),
      h('div', { class: 'pz-card-cols' }, col('free'), col('premium')),
      !state.p.pass.premium && !state.p.pass.premium_[i] ? h('div', { class: 'pz-card-hint' }, icon('crown', 's'), h('span', { html: rich(`Premium unlocks the gold stands for *${SEASON.premiumCost}* Bucks.`) })) : null);
    root.appendChild(el2);
    card = { el: el2, i };
  }

  // ------------------------------------------------------------- claim juice
  /** A copy of the reward art flies from a screen point into the UI (top-bar pill, a nav tab...). */
  function flyArt(from, r, kind) {
    const pill = currencyPill(kind === 'coins' || kind === 'bucks' ? kind : '');
    const nav = (t) => document.querySelector(`.hm-tabbtn[data-tab="${t}"]`);
    const target = pill ?? (kind === 'card' || kind === 'skin' || kind === 'serum' || kind === 'mega' ? nav('cards')
      : kind === 'vial' ? nav('battle') : kind === 'commander' || kind === 'cmdSkin' || kind === 'labSkin' ? nav('lab')
        : document.querySelector('.hm-prof'));
    const anchor = h('div', { class: 'pz-anchor', style: { left: from.x + 'px', top: from.y + 'px' } });
    $overlay().appendChild(anchor);
    burst(anchor, { ring: false, count: 22, scale: 2.2, colors: ['#ffd84a', '#ffffff', '#ff7ac0', '#7aff6a'] });
    setTimeout(() => anchor.remove(), 1200);
    if (pill && (kind === 'coins' || kind === 'bucks')) {
      flyIcons(anchor, kind === 'coins' ? 'coin' : 'bucks', pill, { count: 8, size: 30 });
      return;
    }
    if (!target) return;
    const art = h('div', { class: 'pz-flyart' }, rewardArt(r));
    $overlay().appendChild(art);
    const b = target.getBoundingClientRect();
    const tx = b.left + b.width / 2, ty = b.top + b.height / 2;
    const mx = (from.x + tx) / 2 + (tx > from.x ? -60 : 60), my = Math.min(from.y, ty) - 90;
    const a = art.animate([
      { transform: `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) scale(0.5)`, opacity: 0 },
      { transform: `translate(${from.x}px, ${from.y - 30}px) translate(-50%, -50%) scale(1.25)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${mx}px, ${my}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.32)`, opacity: 0.9 },
    ], { duration: 900, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
    a.onfinish = () => { art.remove(); bump(target); sparkle(target, { count: 10 }); audio.play('pop', { pitch: 1.3 }); };
  }
  /** Juan shouts a word over his head (pixel bubble that follows him). */
  let bubble = null;
  function juanSays(text) {
    bubble?.el.remove();
    const el2 = h('div', { class: 'pz-bubble t-d' }, text);
    tags.appendChild(el2);
    bubble = { el: el2, t: 0 };
    try { audio.babble?.(voiceOf('juan'), text, 0.45); } catch (e) { /* voice optional */ }
  }
  function tickTags(dt) {
    if (!bubble || !stage) return;
    bubble.t += dt;
    const p = stage.charScreen('juan');
    if (!p || !p.vis || bubble.t > 1.5) { bubble.el.remove(); bubble = null; return; }
    const o = root.getBoundingClientRect();
    bubble.el.style.transform = `translate(${Math.round(p.x - o.left)}px, ${Math.round(p.y - o.top - 14)}px) translate(-50%, -100%)`;
    bubble.el.classList.toggle('out', bubble.t > 1.3);
  }

  async function claim(i, track) {
    if (busy || !passClaimable(i, track) || !stage) return;
    busy = true;
    closeCard();
    const r = PASS_TIERS[i][track];
    const fx = stage.claimFx(i, track);
    const got = claimPass(i, track);
    if (!got.length) { busy = false; return; }
    collectReady();
    audio.play('whoosh', { pitch: 1.4, vol: 0.6 });
    stage.refresh();
    stage.cheer('celebrate');
    juanSays(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    const scr = await fx;
    audio.play('chaching');
    if (track === 'premium' || isBigReward(r)) audio.play('magic', { vol: 0.6 });
    stage.shake(0.35);
    const kind = rewardDef(r).type;
    flyArt(scr, r, kind);
    confetti(fxLayer, { count: isMilestoneTier(i) || isBigReward(r) ? 56 : 30 });
    refreshCtx(ctx);
    renderAll();
    if (got.every((g) => SMALL.has(g.kind))) {
      for (const g of got) flyText(midSlot, `+${fmtN(g.amount)} ${g.kind === 'coins' ? 'Coins' : g.kind === 'bucks' ? 'Bucks' : 'Calories'}`, g.kind === 'bucks' ? 'c-pink' : 'c-gold');
      setTimeout(() => { busy = false; }, 500);
      return;
    }
    await new Promise((res) => setTimeout(res, 650));
    const vial = got.some((g) => g.kind === 'vial');
    await showRewards(got, { title: `TIER ${i + 1}`, color: track === 'premium' ? 'gold' : 'pink', note: vial ? 'Vials go to your vial slots on Beast Island.' : null });
    busy = false;
    renderAll();
  }
  async function claimAll() {
    if (busy || !stage) return;
    const list = [];
    for (let i = 0; i < Math.min(passTier(), PASS_TIERS.length); i++) for (const tr of ['free', 'premium']) if (passClaimable(i, tr)) list.push({ i, track: tr });
    if (!list.length) return;
    busy = true;
    closeCard();
    // the stands in view fly their rewards; the rest just get their flags
    const viewI = stage.viewTier;
    const shown = list.filter((x) => Math.abs(x.i - viewI) <= 3).slice(0, 6);
    const fxs = shown.map((x) => stage.claimFx(x.i, x.track));
    const got = [];
    for (const x of list) got.push(...claimPass(x.i, x.track));
    collectReady();
    stage.refresh();
    stage.cheer('victory');
    juanSays('Big haul!');
    audio.play('whoosh', { pitch: 1.2, vol: 0.6 });
    const pos = await Promise.all(fxs);
    audio.play('chaching');
    stage.shake(0.5);
    pos.forEach((p, k) => setTimeout(() => { const a = h('div', { class: 'pz-anchor', style: { left: p.x + 'px', top: p.y + 'px' } }); $overlay().appendChild(a); burst(a, { ring: false, count: 14, scale: 1.8 }); setTimeout(() => a.remove(), 1000); }, k * 70));
    confetti(fxLayer, { count: 60 });
    refreshCtx(ctx);
    renderAll();
    // merge currencies so the popup stays readable
    const merged = [], sum = {};
    for (const g of got) {
      if (SMALL.has(g.kind)) sum[g.kind] = (sum[g.kind] ?? 0) + g.amount;
      else merged.push(g);
    }
    for (const k of ['calories', 'bucks', 'coins']) if (sum[k]) merged.unshift({ type: k, amount: sum[k] });
    await new Promise((res) => setTimeout(res, 500));
    await showRewards(merged, { title: 'CLAIMED ALL', note: got.some((g) => g.kind === 'vial') ? 'Vials go to your vial slots on Beast Island.' : null });
    busy = false;
    renderAll();
  }
  async function buyPremium(btn) {
    if (state.p.pass.premium) return;
    if (state.p.bucks < SEASON.premiumCost) return deny(ctx, `Not enough Beast Bucks! The Premium Pass costs *${SEASON.premiumCost}*.`, btn);
    const ok = await confirmBox({
      title: 'PREMIUM PASS', color: 'gold', yes: 'BUY', price: { cur: 'bucks', amount: SEASON.premiumCost },
      art: h('div', { class: 'mn-premart' }, h('div', { class: 'px-rays' }), rewardArt(SEASON.showcase[2] ?? { type: 'cmdSkin', id: 'juanGold' })),
      text: `Unlock the <b>gold stands</b>: ${PASS_TIERS.length} extra rewards including Golden Juan, new Swarms, outfits, the Mansion Lab and a <b>Golden MEGA</b>.`,
    });
    if (!ok) return;
    if (!buyPremiumPass()) return deny(ctx, 'Not enough Beast Bucks!', btn);
    audio.play('chaching');
    audio.jingle('victory');
    refreshCtx(ctx);
    stage?.refresh();
    stage?.shake(0.6);
    stage?.cheer('victory');
    juanSays('Gold stands!');
    confetti(fxLayer, { count: 70, colors: ['#ffd84a', '#fff27a', '#ffffff', '#ff7ac0'] });
    renderAll();
    const hd = premSlot.firstElementChild;
    if (hd) { burst(hd, { ring: false, count: 30, colors: ['#ffd84a', '#ffffff', '#ff7ac0'] }); bump(hd); }
  }

  // ------------------------------------------------------------- talking to the crew
  async function talk(id) {
    if (busy || !stage) return;
    busy = true;
    closeCard();
    const ch = stage.chibi(id);
    ch?.react(id === 'nolan' ? 'love' : 'wave', { boing: true });
    audio.play('bubblePop');
    let text;
    if (id === 'juan') {
      const N = PASS_TIERS.length, tier = passTier(), ready = passClaimCount();
      if (tier >= N) text = 'We made it to the *vault*. Best shopping trip ever.';
      else if (ready > 0) text = ready === 1 ? 'One reward is waiting on a *glowing stand*. Tap it!' : `You have *${ready} rewards* waiting on the glowing stands. Tap them!`;
      else if (tier === 0) text = `Win battles to earn *Calories*. Every ${SEASON.calPerTier} gets us one stop closer to the vault.`;
      else {
        const pool = [
          'Every battle burns *Calories*. Calories move us down the aisle.',
          'The vault is at the back of the store. I can smell the *gold* from here.',
          'Last one to the vault pays for the groceries.',
          "I already ate the free samples. Don't tell *Jimmy*.",
          `${N - tier} more stops to the *vault*. Let's keep moving.`,
        ];
        lineIdx.juan = ((lineIdx.juan ?? Math.floor(Math.random() * pool.length)) + 1) % pool.length;
        text = pool[lineIdx.juan];
      }
    } else {
      const pool = LINES[id] ?? ['Hi!'];
      lineIdx[id] = ((lineIdx[id] ?? Math.floor(Math.random() * pool.length)) + 1) % pool.length;
      text = pool[lineIdx[id]];
    }
    const def = CHARACTERS[id];
    try {
      await say({ name: def?.name ?? id, char: id, chibi: ch, color: def?.color }, text);
    } catch (e) { console.warn('pass talk', e); }
    busy = false;
  }

  // ------------------------------------------------------------- challenges drawer (daily + quests)
  let drawer = null;
  function openDrawer(sub) {
    if (sub) drawerSub = sub;
    if (drawer) return;
    closeCard();
    const body = h('div', { class: 'pz-drawer-body scroll-y' });
    const tabsEl = h('div', { class: 'pz-drawer-tabs' });
    const panel = h('div', { class: 'pz-drawer panel' },
      h('div', { class: 'pz-drawer-head' },
        h('b', { class: 'pz-drawer-t t-d' }, icon('star', 's'), 'CHALLENGES'),
        button('', () => closeDrawer(), 'red sm icon-only', { icon: 'x', sound: 'tap' })),
      tabsEl, body);
    const back = h('div', { class: 'pz-drawer-back', onclick: (e) => { if (e.target === back) closeDrawer(); } }, panel);
    root.appendChild(back);
    drawer = { back, body, tabsEl, lock: 0 };
    renderDrawer();
  }
  function closeDrawer() {
    if (!drawer) return;
    const d = drawer;
    drawer = null;
    d.back.classList.add('out');
    setTimeout(() => d.back.remove(), 220);
    renderFoot();
  }
  function renderDrawer() {
    if (!drawer) return;
    const st = drawer.body.scrollTop;
    drawer.tabsEl.replaceChildren(segTabs([
      { id: 'chal', label: 'DAILY', icon: 'star', badge: challengeClaimCount() },
      { id: 'quests', label: 'QUESTS', icon: 'quest', badge: questClaimCount() },
    ], drawerSub, (id) => { drawerSub = id; renderDrawer(); drawer.body.scrollTop = 0; }, 'mn-passtabs pz-seg'));
    drawer.body.replaceChildren(...(drawerSub === 'quests' ? questsView() : challengesView()));
    drawer.body.scrollTop = st;
    tickTimers(drawer.body);
  }
  function challengesView() {
    refreshDaily();
    const list = challengeList();
    const rows = list.map((c) => {
      const row = h('div', { class: `mn-chal ${c.claimed ? 'claimed' : c.done ? 'done' : ''}` },
        h('div', { class: 'mn-chal-ic' }, icon(CH_ICON[c.stat] ?? 'star')),
        h('div', { class: 'mn-chal-t' },
          h('b', { class: 'mn-chal-n' }, c.text),
          bar(c.prog / c.n, c.done ? 'green' : 'orange', `${c.prog}/${c.n}`, { cls: 'mn-chal-bar' })),
        h('div', { class: 'mn-chal-r' },
          h('div', { class: 'mn-chal-cal t-d outline' }, icon('calorie', 's'), '+' + c.cal),
          c.claimed ? h('div', { class: 'mn-chal-ok t-d outline' }, icon('check', 's'), 'DONE')
            : c.done ? button('CLAIM', (e) => {
              const btn = e.currentTarget;
              const before = passTier();
              const cal = claimChallenge(c.id);
              if (!cal) return;
              audio.play('coin');
              audio.play('levelUp');
              sparkle(row, { count: 20, colors: ['#ff8a1f', '#ffd84a', '#ffffff'] });
              flyText(btn, `+${cal} Calories`, 'c-gold');
              row.classList.add('claimed');
              refreshCtx(ctx);
              if (passTier() > before) {
                ctx.toast?.(`Food Pass *Tier ${passTier()}* reached! Juan is on the move.`, { icon: 'calorie' });
                setTimeout(() => { closeDrawer(); stage?.refresh(); stage?.flyToTier(passTier() - 1, 1.2); }, 700);
              }
              setTimeout(() => renderDrawer(), 900);
            }, 'green sm pulse') : null));
      return row;
    });
    return [
      h('div', { class: 'pz-drawer-row' }, h('span', { class: 't-sm c-muted' }, 'Finish these in battles to earn Calories.'), timerChip(midnightMs(), 'New in')),
      ...rows,
    ];
  }
  function questCard(npc) {
    const st = questState(npc);
    const portrait = h('div', { class: 'mn-npc-port' }, charImg(npc, { size: 128 }));
    const head = h('div', { class: 'mn-npc-head' }, h('b', { class: 't-d outline mn-npc-name' }, NPC_NAME[npc]),
      st && !st.finished ? h('div', { class: 'mn-steps' }, ...Array.from({ length: st.steps }, (_, k) => h('i', { class: k < st.step ? 'done' : k === st.step ? 'cur' : '' }))) : null);
    const zone = arenaById(QUEST_NPC_ZONE[npc]);
    let body;
    if (!st) body = h('div', { class: 'c-muted' }, 'No quests right now.');
    else if (st.finished) body = h('div', { class: 'mn-quest-done' }, icon('check', 'l'), h('span', {}, `All of ${NPC_NAME[npc]}'s quests complete!`));
    else {
      const q = st.quest;
      const rewards = h('div', { class: 'row wrap gap-s mn-qrew' }, h('span', { class: 't-xs c-muted' }, 'Reward:'), ...rewardsOf(q.reward).map((r) => chip([rewardTile(r, { cls: 'xs' }), rewardLabel(r)], 'rwchip')));
      let action = null;
      if (!st.accepted) action = button('ACCEPT', () => { acceptQuest(npc); audio.play('magic'); refreshCtx(ctx); renderDrawer(); }, 'blue sm', { icon: 'quest' });
      else if (st.done) {
        action = button('CLAIM', async () => {
          const got = completeQuest(npc);
          if (!got.length) return;
          audio.play('chaching');
          refreshCtx(ctx);
          await showRewards(got, { title: 'QUEST DONE!', color: 'green' });
          renderDrawer();
        }, 'green sm pulse', { icon: 'gift' });
      } else if (q.boss) action = button('FIGHT', () => openBoss(q.boss, ctx), 'red sm', { icon: 'boss' });
      else if (q.secret) action = button('SEARCH', () => ctx.focusArena?.(QUEST_NPC_ZONE[npc]), 'teal sm', { icon: 'eye' });
      body = h('div', { class: 'mn-quest' },
        h('div', { class: 'row gap-s' }, h('b', { class: 't-d outline c-gold mn-quest-t' }, q.title), chip(`Quest ${st.step + 1}/${st.steps}`)),
        h('span', { class: 'mn-quest-x', html: rich(st.text) }),
        st.accepted && q.stat ? bar(st.prog / st.need, st.done ? 'green' : 'blue', `${st.prog}/${st.need}`, { cls: 'mn-quest-bar' }) : null,
        q.secret && st.accepted && !st.done && zone ? h('span', { class: 't-xs c-blue' }, icon('island', 's'), ` Hidden in the ${zone.name} zone`) : null,
        h('div', { class: 'row between wrap gap-s' }, rewards, action));
    }
    return h('div', { class: `mn-npc n-${npc} ${st?.done ? 'ready' : ''}` }, portrait, h('div', { class: 'mn-npc-main' }, head, body));
  }
  function jimmyCard() {
    const has = !!state.p.commanders.owned.jimmy;
    const b = BOSSES.jimmyRematch;
    const ok = state.p.bestTrophies >= b.minTrophies;
    const body = has
      ? h('div', { class: 'mn-quest-done' }, icon('check', 'l'), h('span', {}, 'You beat Jimmy! He joined your Lab as a Commander.'))
      : h('div', { class: 'mn-quest' },
        h('b', { class: 't-d outline c-gold mn-quest-t' }, 'The Rematch'),
        h('span', { class: 'mn-quest-x' }, b.desc),
        h('div', { class: 'row between wrap gap-s' },
          h('div', { class: 'row wrap gap-s mn-qrew' }, h('span', { class: 't-xs c-muted' }, 'Reward:'), chip([rewardTile({ type: 'commander', id: 'jimmy' }, { cls: 'xs' }), 'Jimmy (Commander)'], 'rwchip')),
          button(ok ? 'FIGHT' : `${b.minTrophies}`, () => openBoss('jimmyRematch', ctx), ok ? 'red sm' : 'gray sm', { icon: ok ? 'boss' : 'trophy' })));
    return h('div', { class: 'mn-npc n-jimmy' }, h('div', { class: 'mn-npc-port' }, charImg('jimmy', { size: 128 })), h('div', { class: 'mn-npc-main' }, h('div', { class: 'mn-npc-head' }, h('b', { class: 't-d outline mn-npc-name' }, 'Jimmy')), body));
  }
  function rewardsOf(b) {
    const out2 = [];
    if (!b) return out2;
    if (b.coins) out2.push({ type: 'coins', amount: b.coins });
    if (b.bucks) out2.push({ type: 'bucks', amount: b.bucks });
    if (b.calories) out2.push({ type: 'calories', amount: b.calories });
    if (b.vial) out2.push({ type: 'vial', id: b.vial });
    if (b.card || b.swarm) out2.push({ type: 'card', id: b.card ?? b.swarm, copies: b.copies ?? 1 });
    if (b.commander) out2.push({ type: 'commander', id: b.commander });
    if (b.banner) out2.push({ type: 'banner', id: b.banner });
    return out2.map(rewardDef);
  }
  function questsView() {
    return [
      h('div', { class: 'pz-drawer-row' }, h('span', { class: 't-sm c-muted' }, 'Help the crew around Beast Island for big rewards and new Commanders.')),
      jimmyCard(), ...Object.keys(QUEST_CHAINS).map(questCard),
    ];
  }

  // ------------------------------------------------------------- refresh on profile changes
  let refT = 0;
  function renderAll() {
    collectReady();
    renderHud();
    renderFoot();
    renderTrack();
    if (card && !busy) openCard(card.i, null);
    tickTimers(hud);
  }
  const offState = state.on(() => {
    clearTimeout(refT);
    refT = setTimeout(() => {
      if (disposed) return;
      collectReady();
      renderHud();
      renderFoot();
      renderTrack();
      if (!busy) stage?.refresh();
      if (drawer && !drawer.lock) renderDrawer();
    }, 90);
  });
  const timer = setInterval(() => { if (!disposed) { tickTimers(hud); if (drawer) tickTimers(drawer.body); } }, 1000);

  // the back-to-Juan button only shows when the camera has wandered off
  let lastT = performance.now(), raf = 0, layoutAt = 0, winAt = 0;
  const loop = () => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (!stage || !live) return;
    if (now - layoutAt > 500) { layoutAt = now; layout(); }
    const away = Math.abs(stage.viewTier - Math.max(0, stage.juanIdx)) > 2;
    homeBtn.classList.toggle('show', away);
    tickTags(dt);
    tickReady();
    if (now - winAt > 120) { winAt = now; tickTrackWindow(); }
  };
  raf = requestAnimationFrame(loop);

  // ------------------------------------------------------------- leaving: the tab slides away as a solid panel
  function leave() {
    if (out) return;
    out = true;
    live = false;
    curtain.classList.remove('gone');
    curtain.classList.add('instant');
    closeCard();
    if (stage && engine.backdrop?.owner === stage) engine.setBackdrop(null);
    engine.cover('passTab', false);
    if (stage) lastJuanTier = stage.juanIdx;
  }
  const mo = new MutationObserver(() => { if (el.classList.contains('hm-tab-out')) leave(); });
  mo.observe(el, { attributes: true, attributeFilter: ['class'] });

  // ------------------------------------------------------------- build the 3D stage, then reveal it
  collectReady();
  renderHud();
  renderFoot();
  renderTrack();
  layout();
  tickTimers(hud);
  (async () => {
    try {
      const m = await import('./passStage.js');
      if (disposed || out) return;
      const st = await m.createPassStage({ fromTier: lastJuanTier });
      if (disposed || out) { st.dispose(); return; }
      stage = st;
      layout();
      await engine.precompile(st.scene, st.camera);
      if (disposed || out) return;
      engine.cover('passTab', true);
      engine.setBackdrop({ scene: st.scene, camera: st.camera, update: (dt) => st.update(dt), bloom: { strength: 0.5, radius: 0.12, threshold: 1.75 }, grade: { sat: 0.12, contrast: 0.1, vignette: 0.18 }, owner: st });
      live = true;
      st.intro();
      requestAnimationFrame(() => curtain.classList.add('gone'));
      audio.play('whoosh', { pitch: 0.9, vol: 0.5 });
      if (opts.sub === 'chal' || opts.sub === 'quests') setTimeout(() => openDrawer(), 400);
    } catch (e) {
      console.error('pass stage failed', e);
      curtain.querySelector('.pz-cur-s').textContent = 'The store is closed right now. Try again in a moment.';
    }
  })();

  return {
    dispose() {
      disposed = true;
      leave();
      mo.disconnect();
      ro?.disconnect();
      window.removeEventListener('resize', layout);
      cancelAnimationFrame(raf);
      clearInterval(timer);
      clearTimeout(refT);
      offState();
      bubble?.el.remove();
      card?.el.remove();
      stage?.dispose();
      stage = null;
      root.remove();
      el.classList.remove('pz-tab');
    },
    refresh: () => { collectReady(); renderHud(); renderFoot(); renderTrack(); stage?.refresh(); },
  };
}
