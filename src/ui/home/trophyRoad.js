// Trophy Road. On the home lobby the road is a physical part of Beast Island
// (models/island/trophyPath.js + scenes/homeRoad.js): openTrophyRoad() flies
// the island camera onto it and mountIslandRoad() puts the compact HUD on top
// (back, trophies + currencies, the focused milestone's reward card with
// CLAIM, a "to claim" jump chip and the YOU tag over your Commander).
// Without the island (screen bench) it falls back to the full-screen road:
// arena CHAPTERS, each with a big arena banner (diorama snapshot, the video it
// is based on, the cards it unlocks, its gate reward, VIEW + BOSS) followed by
// the milestone rewards earned inside that arena, along a goo-filled tube.
// Everything is read from ARENAS / TROPHY_ROAD, so new arenas just appear.
import './trophyRoad.css';
import { h, icon, iconURL, button, pill, sparkle, bump, burst, flyIcons, clear, $overlay } from '../ui.js';
import { cardEl } from '../cards.js';
import { arenaImg } from '../thumbs.js';
import { ensureSkin } from '../skin.js';
import { audio } from '../../core/audio.js';
import { state, trophyRoadClaimable, claimTrophyRoad } from '../../game/state.js';
import { ARENAS, TROPHY_ROAD, arenaById, currentArena, bossOfArena } from '../../data/arenas.js';
import { cardsOfArena } from '../../data/cards.js';
import { rewardTile, rewardLabel, rewardKind, showRewards, refreshCtx, fmtN, charImg, flyText, isBigReward } from './common.js';
import { openBoss } from './boss.js';

export function trophyRoadBadge() {
  return trophyRoadClaimable().length;
}

const SMALL = new Set(['coins', 'bucks', 'calories']);

/** Road layout: arena chapters (lowest first), each with the milestones earned inside that arena. */
function chapters() {
  const gates = new Map(TROPHY_ROAD.filter((m) => m.arena).map((m) => [m.arena, m]));
  const list = ARENAS.map((ar) => ({ ar, gate: gates.get(ar.id) ?? null, items: [] }));
  for (const m of TROPHY_ROAD) {
    if (m.arena && arenaById(m.arena)) continue;
    const k = Math.max(0, currentArena(m.t).index);
    (list[k] ?? list[list.length - 1]).items.push(m);
  }
  for (const c of list) c.items.sort((a, b) => a.t - b.t);
  return list;
}

export function openTrophyRoad(ctx) {
  if (ctx?.islandRoad) { ctx.islandRoad(); return { close() {}, el: null }; }
  const root = h('div', { class: 'mn-tr' });
  const scroll = h('div', { class: 'mn-tr-scroll scroll-y' });
  const pillVal = h('b', { class: 't-d outline' }, fmtN(state.p.trophies));
  const claimN = h('span', {});
  const coinPill = pill('coin', state.p.coins, { cls: 'tr-cur' });
  const buckPill = pill('bucks', state.p.bucks, { cls: 'tr-cur' });
  const nextEl = h('div', { class: 'tr-next' });
  const head = h('div', { class: 'mn-tr-head' },
    h('div', { class: 'mn-tr-pill' }, icon('trophy', 'mn-tr-pill-ic'), h('div', { class: 'col', style: { gap: 0, lineHeight: 1 } }, pillVal, h('span', { class: 't-xs c-muted' }, `Best ${fmtN(state.p.bestTrophies)}`))),
    h('div', { class: 'ribbon sk-ribbon-gold mn-tr-title' }, h('span', {}, 'TROPHY ROAD')),
    claimN,
    button('', () => close(), 'red sm icon-only mn-tr-x', { icon: 'x', sound: 'tap' }));
  const sub = h('div', { class: 'tr-subbar' }, h('div', { class: 'tr-curs' }, coinPill, buckPill), nextEl);
  root.append(h('div', { class: 'mn-tr-sky' }), head, sub, scroll);
  $overlay().appendChild(root);
  audio.play('whoosh', { pitch: 0.8 });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    root.classList.add('out');
    setTimeout(() => root.remove(), 220);
    refreshCtx(ctx);
  }
  root.addEventListener('keydown', (e) => e.key === 'Escape' && close());

  const setPill = (el, v) => { el.val.textContent = fmtN(v); };
  function claim(m, btn) {
    const got = claimTrophyRoad(m);
    if (!got.length) return;
    audio.play('chaching');
    const card = btn.closest('.tr-pod, .tr-arena');
    const art = card?.querySelector('.mn-rw') ?? card;
    if (card) { burst(art, { color: '#ffd84a', count: 22, rays: isBigReward(got[0]) || !!m.arena }); bump(card, 'jelly'); card.classList.add('claimed'); }
    refreshCtx(ctx);
    if (got.every((g) => SMALL.has(g.kind))) {
      for (const g of got) {
        const to = g.kind === 'coins' ? coinPill : g.kind === 'bucks' ? buckPill : null;
        flyIcons(art, g.kind === 'coins' ? 'coin' : g.kind === 'bucks' ? 'bucks' : 'calorie', to, { count: 6, onLand: () => { setPill(coinPill, state.p.coins); setPill(buckPill, state.p.bucks); } });
        flyText(art, `+${fmtN(g.amount)}`, g.kind === 'bucks' ? 'c-pink' : 'c-gold');
      }
      setTimeout(() => render(true), 900);
      return;
    }
    showRewards(got, { title: `${fmtN(m.t)} TROPHIES!`, note: got.some((g) => g.kind === 'vial') ? 'Vials go to your vial slots on Beast Island.' : null }).then(() => render(true));
  }

  function claimCtl(m) {
    const best = state.p.bestTrophies;
    if (state.p.trophyRoad[m.key]) return h('div', { class: 'mn-tr-got t-d outline' }, icon('check', 's'), 'CLAIMED');
    if (best >= m.t) return button('CLAIM', (e) => claim(m, e.currentTarget), 'green sm pulse', { icon: 'gift', sound: 'tap' });
    return h('div', { class: 'mn-tr-need' }, icon('lock', 's'), icon('trophy', 's'), h('span', {}, fmtN(m.t)));
  }

  /** Big arena chapter banner. */
  function arenaCard(ar, m) {
    const best = state.p.bestTrophies;
    const open = best >= ar.trophies;
    const here = currentArena(state.p.trophies).id === ar.id;
    const cards = cardsOfArena(ar.id);
    const boss = bossOfArena(ar.id);
    const claimed = m && state.p.trophyRoad[m.key];
    const ready = m && open && !claimed;
    const art = h('div', { class: 'tr-ar-art' },
      h('div', { class: 'px-rays w tr-ar-rays' }),
      h('div', { class: 'tr-ar-isle', style: { backgroundImage: `url(${iconURL('island')})` } }),
      arenaImg(ar.theme ?? ar.id, 'smooth tr-ar-dio', { w: 400, h: 210 }),
      h('div', { class: 'tr-ar-no t-d' }, ar.legendary ? icon('crown', 's') : icon('gate', 's'), ar.legendary ? 'LEGENDARY ARENA' : `ARENA ${ar.index + 1}`),
      here ? h('div', { class: 'tr-here t-d' }, h('span', {}, 'YOU ARE HERE')) : null,
      !open ? h('div', { class: 'tr-ar-lock' }, icon('lock', 'tr-ar-lock-ic'), h('span', { class: 't-d outline' }, icon('trophy', 's'), `${fmtN(ar.trophies)}`)) : null);
    const foot = h('div', { class: 'tr-ar-foot' },
      m ? h('div', { class: `tr-ar-rew ${ready ? 'ready' : ''} ${claimed ? 'claimed' : ''}` }, rewardTile(m.reward),
        h('div', { class: 'col', style: { gap: 'calc(var(--u)*0.4)', minWidth: 0 } }, h('span', { class: 't-xs c-muted' }, 'Arena reward'), h('b', { class: 'tr-ar-rn' }, rewardLabel(m.reward)), claimCtl(m)))
        : h('div', { class: 'tr-ar-rew start' }, icon('flask', 'tr-ar-start-ic'), h('span', { class: 't-sm' }, 'Where every Lab begins!')),
      h('div', { class: 'tr-ar-btns' },
        button('VIEW', () => { close(); setTimeout(() => ctx.focusArena?.(ar.id), 120); }, 'blue sm', { icon: 'eye' }),
        boss ? button('BOSS', () => openBoss(boss.id, ctx), 'red sm', { icon: 'boss' }) : null));
    return h('div', { class: `tr-arena ${ensureSkin('plate', ar.color)} ${open ? 'open' : 'lock'} ${here ? 'here' : ''} ${ar.legendary ? 'legend' : ''}`, style: { '--ac': ar.color } },
      art,
      h('div', { class: 'tr-ar-body' },
        h('div', { class: 't-d tr-ar-n t-3d' }, ar.name),
        ar.video ? h('div', { class: 'tr-ar-video' }, icon('play', 's'), h('span', {}, h('i', {}, 'Based on: '), `"${ar.video}"`)) : null,
        ar.desc ? h('div', { class: 'tr-ar-desc' }, ar.desc) : null,
        cards.length ? h('div', { class: 'tr-ar-cards' }, h('span', { class: 't-d outline tr-ar-unl' }, open ? 'CARDS FOUND HERE' : 'UNLOCKS'),
          h('div', { class: 'tr-ar-cardrow' }, ...cards.map((c) => cardEl(c.id, { size: 'mini', noLevel: true, locked: !state.p.cards[c.id] && !open, artSize: 128 })))) : null,
        foot));
  }

  /** A milestone: reward pod beside a valve node on the tube. */
  function rewardRow(m, side) {
    const best = state.p.bestTrophies;
    const reached = best >= m.t;
    const claimed = !!state.p.trophyRoad[m.key];
    const sk = claimed ? 'sk-pod-dim' : reached ? 'sk-pod-green' : 'sk-pod';
    const pod = h('div', { class: `tr-pod ${sk} ${claimed ? 'claimed' : reached ? 'ready' : 'future'}` },
      h('div', { class: 'tr-pod-art' }, rewardTile(m.reward)),
      h('div', { class: 'tr-pod-txt' }, h('b', { class: 'tr-pod-n' }, rewardLabel(m.reward)), claimCtl(m)),
      claimed ? h('div', { class: 'tr-pod-ck' }, icon('check')) : null);
    return h('div', { class: `tr-row ${side} ${reached ? 'reached' : ''} ${claimed ? 'claimed' : ''}`, 'data-t': m.t },
      side === 'l' ? pod : h('div'),
      h('div', { class: 'tr-node t-d outline', 'data-node': '1' }, h('span', {}, fmtN(m.t))),
      side === 'r' ? pod : h('div'));
  }

  /** Header strip: progress to the next arena (or next reward). */
  function nextInfo() {
    clear(nextEl);
    const T = state.p.trophies;
    const cur = currentArena(T);
    const nxt = ARENAS[cur.index + 1];
    if (!nxt) { nextEl.append(icon('crown', 's'), h('span', { class: 't-d outline' }, 'TOP OF BEAST ISLAND!')); return; }
    const f = Math.max(0, Math.min(1, (T - cur.trophies) / Math.max(1, nxt.trophies - cur.trophies)));
    nextEl.append(
      h('span', { class: 't-xs c-muted tr-next-l' }, 'NEXT ARENA'),
      h('div', { class: 'tr-next-tube' }, h('i', { style: { width: f * 100 + '%' } }), h('span', { class: 't-d outline' }, `${fmtN(T)} / ${fmtN(nxt.trophies)}`)),
      h('b', { class: 't-d outline tr-next-n', style: { color: nxt.color } }, nxt.name));
  }

  function render(keepScroll = false) {
    const st = scroll.scrollTop;
    clear(scroll);
    const road = h('div', { class: 'mn-tr-road' });
    const fill = h('div', { class: 'tr-fill' });
    const cmd = state.p.commanders?.equipped;
    const you = h('div', { class: 'tr-you' }, h('div', { class: 'tr-you-port' }, charImg(cmd === 'jimmy' || cmd === 'nolan' || cmd === 'juan' ? cmd : 'recruit', { size: 96 })), h('b', { class: 't-d outline' }, icon('trophy', 's'), fmtN(state.p.trophies)));
    road.append(h('div', { class: 'tr-tube' }), fill);
    road.appendChild(h('div', { class: 'tr-top' }, icon('island', 'tr-top-ic'), h('span', { class: 't-d outline' }, 'MORE OF BEAST ISLAND'), h('span', { class: 't-xs c-muted' }, 'coming in future seasons...')));
    let side = 0;
    const chs = chapters();
    // the road reads bottom-up: highest arena at the top
    const rows = [];
    for (const c of chs) {
      const block = [];
      block.push(h('div', { class: 'tr-gate-row', 'data-t': c.ar.trophies }, h('div', { class: 'tr-gate t-d outline', 'data-node': '1' }, icon('trophy', 's'), fmtN(c.ar.trophies))));
      block.push(arenaCard(c.ar, c.gate));
      for (const m of c.items) block.push(rewardRow(m, side++ % 2 ? 'r' : 'l'));
      rows.push(h('div', { class: 'tr-chap', style: { '--ac': c.ar.color } }, ...block.reverse()));
    }
    for (const r of rows.reverse()) road.appendChild(r);
    road.appendChild(you);
    scroll.appendChild(road);
    const n = trophyRoadClaimable().length;
    claimN.className = n ? 'badge mn-tr-badge' : '';
    claimN.textContent = n ? String(n) : '';
    pillVal.textContent = fmtN(state.p.trophies);
    setPill(coinPill, state.p.coins);
    setPill(buckPill, state.p.bucks);
    nextInfo();
    // position the goo + your marker (animated in from the bottom on first open)
    requestAnimationFrame(() => {
      const nodes = [...road.querySelectorAll('[data-node]')].map((el) => {
        const row = el.closest('[data-t]');
        let y = 0, e = el;
        while (e && e !== road) { y += e.offsetTop; e = e.offsetParent; }
        return { t: +row.dataset.t, y: y + el.offsetHeight / 2 };
      }).sort((a, b) => a.t - b.t);
      if (!nodes.length) return;
      const T = state.p.trophies;
      let y = nodes[0].y;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i], b = nodes[i + 1];
        if (T >= a.t && (!b || T < b.t)) { y = b ? a.y + (b.y - a.y) * ((T - a.t) / (b.t - a.t)) : a.y; break; }
      }
      const H = road.offsetHeight;
      const tube = road.querySelector('.tr-tube');
      const top = nodes[nodes.length - 1].y;
      tube.style.top = top + 'px';
      tube.style.height = Math.max(0, nodes[0].y - top) + 'px';
      fill.style.bottom = H - nodes[0].y + 'px';
      const hgt = Math.max(0, nodes[0].y - y);
      if (keepScroll) {
        fill.style.transition = 'none';
        you.style.transition = 'none';
        fill.style.height = hgt + 'px';
        you.style.top = y + 'px';
        scroll.scrollTop = st;
      } else {
        // the goo rises the last stretch into view, the marker rides its front
        const from = Math.max(0, hgt - scroll.clientHeight * 0.6);
        fill.style.height = from + 'px';
        you.style.top = nodes[0].y - from + 'px';
        scroll.scrollTop = Math.max(0, y - scroll.clientHeight * 0.55);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          fill.style.height = hgt + 'px';
          you.style.top = y + 'px';
        }));
      }
    });
  }

  render();
  return { close, el: root };
}

// ---------------------------------------------------------------------------
// Island Trophy Road HUD

/** 2D pixel confetti bursting up from a screen point and falling back (DOM squares, WAAPI). */
function pixelPop(x, y, n = 56) {
  if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) n = 8;
  const cols = ['#ffd84a', '#ff2e88', '#3ff2e0', '#7aff4a', '#ffffff', '#a35cff', '#ff8a1f'];
  const layer = $overlay();
  for (let i = 0; i < n; i++) {
    const w = 3 + (i % 3), hh = i % 4 === 0 ? 2 : w;
    const p = h('i', { class: 'trd-px', style: { left: x + 'px', top: y + 'px', background: cols[i % cols.length], width: `calc(var(--px) * ${w})`, height: `calc(var(--px) * ${hh})` } });
    layer.appendChild(p);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1, v = 170 + Math.random() * 230;
    const vx = Math.cos(a) * v, vy = Math.sin(a) * v, T = 0.85 + Math.random() * 0.7, g = 620;
    const kf = [];
    for (let k = 0; k <= 8; k++) {
      const t = (T * k) / 8;
      kf.push({ transform: `translate(${Math.round(vx * t)}px, ${Math.round(vy * t + 0.5 * g * t * t)}px)`, opacity: k < 6 ? 1 : 1 - (k - 5) / 3 });
    }
    p.animate(kf, { duration: T * 1000, easing: 'linear', fill: 'forwards' }).onfinish = () => p.remove();
  }
}

const arenaNo = (A) => (A.legendary ? 'LEGENDARY ARENA' : `ARENA ${A.index + 1}`);

/** HUD over the island road. road: the controller from scenes/homeRoad.js. */
export function mountIslandRoad(road, ctx) {
  const ms = road.milestones;
  const p = state.p;
  const troVal = h('b', { class: 't-d outline trd-tro-n' }, fmtN(p.trophies));
  const bestEl = h('span', { class: 'trd-tro-best' });
  const tro = h('div', { class: 'trd-tro' }, icon('trophy', 'trd-tro-ic'), h('div', { class: 'trd-tro-col' }, troVal, bestEl));
  const coinPill = pill('coin', p.coins, { cls: 'trd-cur' });
  const buckPill = pill('bucks', p.bucks, { cls: 'trd-cur' });
  const back = button('', () => road.close(), 'blue icon-only trd-back', { icon: 'arrowL', sound: 'tap' });
  const top = h('div', { class: 'trd-top' }, back, tro, h('div', { class: 'trd-curs' }, coinPill, buckPill));
  const chapDot = h('i', { class: 'trd-chap-dot' });
  const chapNo = h('span', { class: 'trd-chap-no' });
  const chapName = h('b', { class: 't-d outline trd-chap-n' });
  const chap = h('div', { class: 'trd-chap' }, chapDot, h('div', { class: 'trd-chap-txt' }, chapNo, chapName));
  const readyN = h('span', {});
  const readyBtn = button(readyN, () => road.nextClaimable(), 'green sm trd-ready', { icon: 'gift', sound: 'tap' });
  const sub = h('div', { class: 'trd-sub' }, chap, readyBtn);
  // YOU tag over your Commander
  const youVal = h('span', {}, fmtN(p.trophies));
  const youTag = h('div', { class: 'trd-you t-d' }, icon('trophy'), youVal);
  // reward card
  const cardArt = h('div', { class: 'trd-art' });
  const kindEl = h('div', { class: 'trd-kind' });
  const nameEl = h('div', { class: 'trd-name t-d outline' });
  const reqEl = h('div', { class: 'trd-req' });
  const actEl = h('div', { class: 'trd-act' });
  const prev = button('', () => road.step(-1), 'gray icon-only sm trd-step', { icon: 'arrowL', sound: 'tap' });
  const next = button('', () => road.step(1), 'gray icon-only sm trd-step', { icon: 'arrowR', sound: 'tap' });
  const card = h('div', { class: 'panel sk-panel-dark trd-card' }, prev, cardArt, h('div', { class: 'trd-info' }, kindEl, nameEl, reqEl), actEl, next);
  const root = h('div', { class: 'trd' }, h('div', { class: 'trd-vig' }), youTag, top, sub, card);
  $overlay().appendChild(root);
  requestAnimationFrame(() => root.classList.add('in'));

  let shownIdx = -1, shownState = '';
  const stateOf = (i) => road.stateOf(i);
  function setPills() {
    coinPill.set(state.p.coins);
    buckPill.set(state.p.bucks);
  }
  function header() {
    const P = state.p;
    troVal.textContent = fmtN(P.trophies);
    youVal.textContent = fmtN(P.trophies);
    bestEl.textContent = P.bestTrophies > P.trophies ? `Best ${fmtN(P.bestTrophies)}` : '';
    bestEl.style.display = bestEl.textContent ? '' : 'none';
    const n = trophyRoadClaimable().length;
    readyN.textContent = n === 1 ? '1 TO CLAIM' : `${n} TO CLAIM`;
    readyBtn.style.display = n ? '' : 'none';
  }
  function chapter(i) {
    const M = ms[i];
    const A = ARENAS[M.chapter];
    if (!A) return;
    chap.style.setProperty('--ac', A.color);
    chapNo.textContent = arenaNo(A);
    chapName.textContent = A.name.toUpperCase();
  }
  /** Fill the reward card for milestone i. */
  function fill(i, pop) {
    const M = ms[i];
    const st = stateOf(i);
    shownIdx = i;
    shownState = st;
    chapter(i);
    clear(cardArt);
    cardArt.appendChild(rewardTile(M.m.reward));
    const A = M.gate ? ARENAS[M.chapter] : null;
    kindEl.textContent = A ? `${arenaNo(A)} REWARD` : rewardKind(M.m.reward).toUpperCase();
    nameEl.textContent = rewardLabel(M.m.reward);
    clear(reqEl);
    reqEl.append(icon('trophy', 's'), h('span', { class: 't-d' }, fmtN(M.t)));
    clear(actEl);
    card.className = `panel sk-panel-dark trd-card ${st}`;
    if (st === 'ready') {
      const b = button('CLAIM', () => claim(i), 'green trd-claim pulse', { icon: 'gift', sound: 'tap' });
      b.dataset.guide = 'road-claim';
      actEl.append(b);
    }
    else if (st === 'claimed') actEl.append(h('div', { class: 'trd-got t-d outline' }, icon('check', 's'), 'CLAIMED'));
    else {
      const need = M.t - state.p.bestTrophies;
      const f = Math.max(0, Math.min(1, state.p.trophies / M.t));
      actEl.append(h('div', { class: 'trd-need' }, h('div', { class: 'trd-need-t t-d outline' }, icon('lock', 's'), h('span', {}, `${fmtN(need)} to go`)),
        h('div', { class: 'trd-need-bar' }, h('i', { style: { width: (f * 100).toFixed(1) + '%' } }))));
    }
    if (A && !(st === 'locked')) actEl.append(button('', () => road.viewArena(A.id), 'blue icon-only sm trd-view', { icon: 'eye', sound: 'tap', tip: `Fly to *${A.name}*` }));
    prev.classList.toggle('off', i <= 0);
    next.classList.toggle('off', i >= ms.length - 1);
    if (pop) bump(card, 'trd-pop');
  }
  let claiming = false;
  function claim(i) {
    if (claiming || stateOf(i) !== 'ready') return;
    const M = ms[i];
    const from = road.screenOf(M.rewardPos);
    const got = road.claim(i);
    if (!got.length) return;
    claiming = true;
    header();
    // pixel confetti out of the chest, then the reward art flies from the chest to the UI
    const chest = road.screenOf(M.anchor);
    pixelPop(chest.x, chest.y - (from.y - chest.y) * 0.35);
    const anchor = h('div', { class: 'trd-anchor', style: { left: from.x + 'px', top: from.y + 'px' } });
    $overlay().appendChild(anchor);
    sparkle(anchor, { count: 16, spread: 80, colors: ['#ffffff', '#ffd84a', '#fff6b8', '#7aff4a'] });
    const small = got.every((g) => g.kind === 'coins' || g.kind === 'bucks' || g.kind === 'calories');
    const done = () => { anchor.remove(); claiming = false; refreshCtx(ctx); fill(i, true); header(); };
    if (small) {
      for (const g of got) {
        const to = g.kind === 'coins' ? coinPill : g.kind === 'bucks' ? buckPill : null;
        flyText(anchor, `+${fmtN(g.amount)}`, g.kind === 'bucks' ? 'c-pink' : 'c-gold');
        flyIcons(anchor, g.kind === 'coins' ? 'coin' : g.kind === 'bucks' ? 'bucks' : 'calorie', to, { count: 7, size: 30 }).then(() => setPills());
      }
      setTimeout(done, 900);
      return;
    }
    // bigger rewards: the tile springs out of the chest into the reward screen
    const tile = h('div', { class: 'trd-fly' }, rewardTile(got[0]));
    anchor.appendChild(tile);
    const big = isBigReward(got[0]) || M.gate;
    setTimeout(() => {
      anchor.remove();
      showRewards(got, { title: `${fmtN(M.t)} TROPHIES!`, note: got.some((g) => g.kind === 'vial') ? 'Vials go to your vial slots on Beast Island.' : null, color: big ? 'gold' : undefined })
        .then(() => { setPills(); done(); });
    }, 640);
  }
  const api = {
    el: root,
    focus(i) { if (i !== shownIdx || stateOf(i) !== shownState) fill(i, i !== shownIdx); },
    claim,
    refresh() { header(); if (shownIdx >= 0 && stateOf(shownIdx) !== shownState && !claiming) fill(shownIdx, false); },
    frame() {
      // YOU tag rides above your Commander's head
      const o = road.youObj();
      const sp = road.screenOf(o.position.clone().setY(o.position.y + 4.75));
      if (!sp.visible) { youTag.style.display = 'none'; return; }
      youTag.style.display = '';
      youTag.style.transform = `translate(${Math.round(sp.x)}px, ${Math.round(sp.y)}px)`;
    },
    close() {
      root.classList.remove('in');
      root.classList.add('out');
      setTimeout(() => root.remove(), 260);
    },
  };
  header();
  return api;
}
