// Trophy Road. On the home lobby the road is a physical part of Beast Island
// (models/island/trophyPath.js + scenes/homeRoad.js): openTrophyRoad() flies
// the island camera onto it and mountIslandRoad() puts the compact HUD on top
// (back, trophies + currencies, the focused stop's card: a chest with CLAIM, a
// fork's trail picker or a road boss with FIGHT, a "to claim" jump chip, the YOU
// tag over your Commander, and while he walks a skip button + a loot bag).
// Without the island (screen bench) it falls back to the full-screen road:
// arena CHAPTERS, each with a big arena banner (diorama snapshot, the video it
// is based on, the cards it unlocks, its gate reward, VIEW + BOSS) followed by
// the milestone rewards earned inside that arena, along a goo-filled tube.
// Everything is read from ARENAS / TROPHY_ROAD, so new arenas just appear.
import './trophyRoad.css';
import { h, icon, iconURL, button, pill, bump, burst, flyIcons, clear, $overlay } from '../ui.js';
import { cardEl } from '../cards.js';
import { arenaImg } from '../thumbs.js';
import { ensureSkin } from '../skin.js';
import { audio } from '../../core/audio.js';
import { state, trophyRoadClaimable, claimTrophyRoad } from '../../game/state.js';
import { ARENAS, TROPHY_ROAD, arenaById, currentArena, bossOfArena } from '../../data/arenas.js';
import { cardsOfArena } from '../../data/cards.js';
import { rewardTile, rewardLabel, showRewards, refreshCtx, fmtN, charImg, flyText, isBigReward, swarmImg } from './common.js';
import { forkClaimable, pendingForks, forkChoice, forkItemState } from '../../game/roadForks.js';
import { blockingBoss } from '../../data/roadBosses.js';
import { TRAILS } from '../../data/roadForks.js';
import { openBoss } from './boss.js';

export function trophyRoadBadge() {
  return trophyRoadClaimable().length + forkClaimable().length + pendingForks().length + (blockingBoss(state.p) ? 1 : 0);
}
/** Claimable rewards on the road, fork bonus chests included. */
const claimCount = () => trophyRoadClaimable().length + forkClaimable().length;

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
// ---------------------------------------------------------------------------
// Island Trophy Road HUD

const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const PARTY = ['#ffd84a', '#ff2e88', '#3ff2e0', '#7aff4a', '#ffffff', '#a35cff', '#ff8a1f'];
/** 2D pixel confetti bursting up from a screen point and falling back (DOM squares, WAAPI). */
function pixelPop(x, y, n = 56, cols = PARTY, o = {}) {
  if (reducedMotion()) n = Math.min(n, 8);
  const layer = $overlay();
  for (let i = 0; i < n; i++) {
    const w = 3 + (i % 3), hh = i % 4 === 0 ? 2 : w;
    const p = h('i', { class: 'trd-px', style: { left: x + 'px', top: y + 'px', background: cols[i % cols.length], width: `calc(var(--px) * ${w})`, height: `calc(var(--px) * ${hh})` } });
    layer.appendChild(p);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (o.spread ?? 2.1), v = (o.speed ?? 1) * (170 + Math.random() * 230);
    const vx = Math.cos(a) * v, vy = Math.sin(a) * v, T = 0.85 + Math.random() * 0.7, g = 620;
    const kf = [];
    for (let k = 0; k <= 8; k++) {
      const t = (T * k) / 8;
      kf.push({ transform: `translate(${Math.round(vx * t)}px, ${Math.round(vy * t + 0.5 * g * t * t)}px)`, opacity: k < 6 ? 1 : 1 - (k - 5) / 3 });
    }
    p.animate(kf, { duration: T * 1000, easing: 'linear', fill: 'forwards' }).onfinish = () => p.remove();
  }
}
/**
 * Pixel smoke poof (a boss going down): lumpy cloud puffs that swell out from the middle, then thin
 * into a dither and vanish. Drawn frame by frame on a tiny canvas scaled up with crisp pixels.
 */
function pixelPoof(x, y, size) {
  const S = 48;
  const cv = h('canvas', { class: 'trd-poof', width: S, height: S, style: { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px' } });
  $overlay().appendChild(cv);
  const c = cv.getContext('2d');
  const puffs = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    return { a, d: 6 + Math.random() * 10, r: 5 + Math.random() * 4, k: 0.8 + Math.random() * 0.5 };
  });
  puffs.push({ a: 0, d: 0, r: 9, k: 1 });
  const DUR = reducedMotion() ? 300 : 820;
  const t0 = performance.now();
  const draw = () => {
    const u = Math.min(1, (performance.now() - t0) / DUR);
    c.clearRect(0, 0, S, S);
    const grow = 1 - Math.pow(1 - Math.min(1, u * 1.8), 3);
    const fade = u < 0.55 ? 0 : (u - 0.55) / 0.45;
    // dark outline pass, then the cloud body, then a highlight
    for (const [pad, col] of [[1.5, '#2a2440'], [0, '#e6e2f0'], [-2.2, '#ffffff']]) {
      c.fillStyle = col;
      for (const P of puffs) {
        const cx = S / 2 + Math.cos(P.a) * P.d * grow * 1.4, cy = S / 2 + Math.sin(P.a) * P.d * grow - u * 6;
        const r = Math.max(0, P.r * P.k * (0.4 + grow * 0.8) * (1 - fade * 0.6) + pad);
        for (let yy = -Math.ceil(r); yy <= r; yy++) for (let xx = -Math.ceil(r); xx <= r; xx++) {
          if (xx * xx + yy * yy > r * r) continue;
          const X = Math.round(cx + xx), Y = Math.round(cy + yy - (pad < 0 ? 1.5 : 0));
          // dissolve: a growing checker of holes
          if (fade > 0.15 && ((X + Y) & 1) === 0) continue;
          if (fade > 0.55 && (X & 1) === 0) continue;
          c.fillRect(X, Y, 1, 1);
        }
      }
    }
    if (u < 1) requestAnimationFrame(draw); else cv.remove();
  };
  draw();
}

const arenaNo = (A) => (A.legendary ? 'LEGENDARY ARENA' : `ARENA ${A.index + 1}`);
const SMALL_KINDS = new Set(['coins', 'bucks', 'calories']);

/** HUD over the island road. road: the controller from scenes/homeRoad.js (road.stops: chests, forks, bosses). */
export function mountIslandRoad(road, ctx) {
  const stops = road.stops;
  const p = state.p;
  const troVal = h('b', { class: 't-d outline trd-tro-n' }, fmtN(p.trophies));
  const bestEl = h('span', { class: 'trd-tro-best' });
  const tro = h('div', { class: 'trd-tro' }, icon('trophy', 'trd-tro-ic'), h('div', { class: 'trd-tro-col' }, troVal, bestEl));
  const coinPill = pill('coin', p.coins, { cls: 'trd-cur' });
  const buckPill = pill('bucks', p.bucks, { cls: 'trd-cur' });
  const back = button('', () => road.close(), 'blue icon-only trd-back', { icon: 'arrowL', sound: 'tap' });
  const top = h('div', { class: 'trd-top' }, back, tro, h('div', { class: 'trd-curs' }, coinPill, buckPill));
  const chapDot = h('i', { class: 'trd-chap-dot' });
  const chapName = h('b', { class: 't-d outline trd-chap-n' });
  const chap = h('div', { class: 'trd-chap' }, chapDot, h('div', { class: 'trd-chap-txt' }, chapName));
  const readyN = h('span', {});
  const readyBtn = button(readyN, () => road.nextClaimable(), 'green sm trd-ready', { icon: 'gift', sound: 'tap' });
  const sub = h('div', { class: 'trd-sub' }, chap, readyBtn);
  // YOU tag over your Commander
  const youVal = h('span', {}, fmtN(p.trophies));
  const youTag = h('div', { class: 'trd-you t-d' }, icon('trophy'), youVal);
  // reward card (chests) / trail picker (forks) / boss card
  const cardArt = h('div', { class: 'trd-art' });
  const kindEl = h('div', { class: 'trd-kind' });
  const nameEl = h('div', { class: 'trd-name t-d outline' });
  const reqEl = h('div', { class: 'trd-req' });
  const actEl = h('div', { class: 'trd-act' });
  const prev = button('', () => road.step(-1), 'gray icon-only sm trd-step', { icon: 'arrowL', sound: 'tap' });
  const next = button('', () => road.step(1), 'gray icon-only sm trd-step', { icon: 'arrowR', sound: 'tap' });
  const body = h('div', { class: 'trd-body' }, cardArt, h('div', { class: 'trd-info' }, kindEl, nameEl, reqEl), actEl);
  const forkEl = h('div', { class: 'trd-fork' });
  const card = h('div', { class: 'panel sk-panel-dark trd-card' }, prev, body, forkEl, next);
  // while your Commander walks: a skip button and the loot bag big rewards fly into
  const skipBtn = button('', () => road.skip(), 'gray icon-only trd-skip', { icon: 'speed', sound: 'tap' });
  const bagN = h('b', { class: 'trd-bag-n t-d' });
  const bag = h('div', { class: 'trd-bag' }, icon('bag', 'trd-bag-ic'), bagN);
  const root = h('div', { class: 'trd' }, h('div', { class: 'trd-vig' }), youTag, top, sub, bag, card, skipBtn);
  $overlay().appendChild(root);
  requestAnimationFrame(() => root.classList.add('in'));

  let shownIdx = -1, shownState = '';
  const stateOf = (k) => road.stateOf(k);
  function setPills() {
    coinPill.set(state.p.coins);
    buckPill.set(state.p.bucks);
  }
  function header() {
    const P = state.p;
    troVal.textContent = fmtN(P.trophies);
    bestEl.textContent = P.bestTrophies > P.trophies ? `Best ${fmtN(P.bestTrophies)}` : '';
    bestEl.style.display = bestEl.textContent ? '' : 'none';
    const n = claimCount(), pick = pendingForks().length, boss = blockingBoss(P);
    // icon + number only: a gift with the count, a skull when a boss waits, a fork sign to pick
    readyBtn.classList.toggle('boss', !n && !pick && !!boss);
    const ic = readyBtn.querySelector('.pi');
    if (ic) ic.src = iconURL(n ? 'gift' : pick ? 'road' : 'skull');
    readyN.textContent = n ? String(n) : pick ? String(pick) : boss ? '1' : '';
    readyBtn.style.display = n || pick || boss ? '' : 'none';
  }
  function chapter(k) {
    const st = stops[k];
    const A = ARENAS[st.kind === 'chest' ? st.M.chapter : st.kind === 'boss' ? st.rb.k - 1 : st.F.chapter];
    if (!A) return;
    chap.style.setProperty('--ac', A.color);
    chap.title = arenaNo(A);
    chapName.textContent = A.name.toUpperCase();
  }
  /** Fill the card for stop k. */
  function fill(k, pop) {
    const st = stops[k];
    const ss = stateOf(k);
    shownIdx = k;
    shownState = ss;
    chapter(k);
    prev.classList.toggle('off', k <= 0);
    next.classList.toggle('off', k >= stops.length - 1);
    if (st.kind === 'fork') fillFork(st, ss);
    else if (st.kind === 'boss') fillBoss(st, ss);
    else fillChest(st.M, ss);
    if (pop) bump(card, 'trd-pop');
  }
  /** Lock + trophies still needed + a progress tube. */
  function needEl(t) {
    const need = Math.max(0, t - state.p.bestTrophies);
    const f = Math.max(0, Math.min(1, state.p.trophies / t));
    return h('div', { class: 'trd-need' }, h('div', { class: 'trd-need-t t-d outline' }, icon('lock', 's'), icon('trophy', 's'), h('span', {}, fmtN(need))),
      h('div', { class: 'trd-need-bar' }, h('i', { style: { width: (f * 100).toFixed(1) + '%' } })));
  }
  function fillChest(M, ss) {
    card.className = `panel sk-panel-dark trd-card ${ss}`;
    clear(cardArt);
    cardArt.appendChild(rewardTile(M.m.reward));
    const A = M.gate ? ARENAS[M.chapter] : null;
    const tr = M.fork ? TRAILS[M.side] : null;
    // icons instead of a kind line: the arena gate, or the trail's coin / vial
    clear(kindEl);
    kindEl.style.color = tr ? tr.color : A ? A.color : '';
    if (A) kindEl.append(icon('gate', 's'));
    else if (tr) kindEl.append(icon(tr.icon, 's'));
    kindEl.style.display = A || tr ? '' : 'none';
    // currencies already show their amount on the tile: only cards, vials and the like get a name
    const small = SMALL_KINDS.has(M.m.reward?.type);
    // the tile already shows the copies (x2): the name goes without them so it never gets cut
    nameEl.textContent = small ? '' : rewardLabel(M.m.reward).replace(/ x\d+$/, '');
    nameEl.classList.toggle('long', nameEl.textContent.length > 15);
    nameEl.style.display = small ? 'none' : '';
    clear(reqEl);
    reqEl.append(icon('trophy', 's'), h('span', { class: 't-d' }, fmtN(M.t)));
    clear(actEl);
    if (ss === 'ready') {
      const b = button('CLAIM', () => claim(shownIdx), `green trd-claim ${claiming ? 'busy' : 'pulse'}`, { icon: 'gift', sound: 'tap' });
      b.dataset.guide = 'road-claim';
      actEl.append(b);
    } else if (ss === 'claimed') actEl.append(h('div', { class: 'trd-got t-d outline' }, icon('check', 's')));
    else if (M.fork && state.p.bestTrophies >= M.t) {
      // reached, but on the trail you did not pick (or have not picked yet)
      const F = stops.find((q) => q.kind === 'fork' && q.F.id === M.fork)?.F;
      const picked = forkChoice(M.fork);
      actEl.append(h('div', { class: 'trd-need trd-need-w' }, h('div', { class: 'trd-need-t t-d outline' }, icon('lock', 's'), h('span', {}, 'LOCKED')),
        h('div', { class: 'trd-need-s' }, picked ? `Opens at ${F?.next?.name ?? 'the next arena'}` : 'Pick this trail at the fork')));
    } else actEl.append(needEl(M.t));
    if (A && ss !== 'locked') actEl.append(button('', () => road.viewArena(A.id), 'blue icon-only sm trd-view', { icon: 'eye', sound: 'tap', tip: `Fly to *${A.name}*` }));
  }
  /** A road boss: its portrait, HP + level, FIGHT (or how far it is, or that it is beaten). */
  function fillBoss(st, ss) {
    const rb = st.rb;
    card.className = `panel sk-panel-dark trd-card boss ${ss}`;
    clear(cardArt);
    cardArt.append(h('div', { class: 'trd-boss-art' }, swarmImg(rb.unit, 'base', null, 160, 'trd-boss-img'), h('i', { class: 'trd-boss-sk' }, icon('skull'))));
    clear(kindEl);
    kindEl.style.color = '#ff6a6a';
    kindEl.style.display = '';
    kindEl.append(icon('boss', 's'));
    nameEl.style.display = '';
    nameEl.textContent = rb.name.toUpperCase();
    nameEl.classList.toggle('long', rb.name.length > 13);
    clear(reqEl);
    reqEl.append(icon('trophy', 's'), h('span', { class: 't-d' }, fmtN(rb.t)));
    clear(actEl);
    if (ss === 'fight') {
      const bank = state.p.roadBoss?.bank ?? 0;
      const b = button('FIGHT', () => fight(shownIdx), 'red trd-fight pulse', { icon: 'swords', sound: 'tap' });
      b.dataset.guide = 'road-boss';
      // trophies won while it blocked you: paid out when it falls
      if (bank > 0) b.appendChild(h('i', { class: 'trd-bank t-d outline', title: 'Banked trophies' }, icon('trophy', 's'), `+${fmtN(bank)}`));
      actEl.append(b);
    } else if (ss === 'open') actEl.append(h('div', { class: 'trd-got t-d outline' }, icon('check', 's')));
    else actEl.append(needEl(rb.t));
  }
  /** The trail picker: both trails side by side with their two chests each. */
  function fillFork(st, ss) {
    const F = st.F;
    card.className = `panel sk-panel-dark trd-card fork ${ss}`;
    clear(forkEl);
    const picked = forkChoice(F.id);
    const title = ss === 'pick' ? 'PICK A TRAIL' : ss === 'ahead' ? 'FORK IN THE ROAD' : ss === 'open' ? 'BOTH TRAILS OPEN' : `${TRAILS[picked].name} PICKED`;
    const note = ss === 'pick' || ss === 'picked' ? `The other trail opens at ${F.next.name}.` : null;
    const opt = (sd) => {
      const tr = TRAILS[sd];
      const items = F[sd].items;
      const mine = picked === sd;
      const open = ss === 'open' || mine;
      const tiles = items.map((m) => {
        const is = forkItemState(m);
        return h('div', { class: `trd-fk-it ${is}` }, rewardTile(m.reward), h('span', { class: 'trd-fk-t t-d outline' }, icon('trophy', 's'), fmtN(m.t)),
          is === 'claimed' ? h('i', { class: 'trd-fk-ck' }, icon('check', 's')) : null);
      });
      let foot;
      if (ss === 'pick') {
        foot = button('PICK', () => choose(sd), `${sd === 'a' ? 'yellow' : 'purple'} sm trd-pick pulse`, { icon: tr.icon, sound: 'tap' });
        foot.dataset.guide = 'road-fork';
      } else if (open) foot = h('div', { class: 'trd-fk-st on t-d outline' }, icon('check', 's'));
      else foot = h('div', { class: 'trd-fk-st t-d outline' }, icon('lock', 's'), picked ? null : h('span', {}, icon('trophy', 's'), fmtN(F.lo)));
      return h('div', { class: `trd-fk-opt ${sd} ${mine ? 'mine' : ''} ${picked && !mine && ss !== 'open' ? 'dim' : ''}`, style: { '--tc': tr.color, '--td': tr.dark } },
        h('div', { class: 'trd-fk-n t-d outline' }, icon(tr.icon, 's'), tr.name),
        h('div', { class: 'trd-fk-row' }, ...tiles), foot);
    };
    forkEl.append(
      h('div', { class: 'trd-fk-head' }, h('div', { class: 'trd-name t-d outline' }, title), note ? h('div', { class: 'trd-fk-note' }, note) : null),
      h('div', { class: 'trd-fk-opts' }, opt('a'), opt('b')));
  }
  function choose(sd) {
    const k = shownIdx;
    if (!road.choose(k, sd)) return;
    const btn = forkEl.querySelector(`.trd-fk-opt.${sd}`);
    if (btn) { burst(btn, { color: TRAILS[sd].color, count: 18 }); }
    refreshCtx(ctx);
    header();
    fill(k, true);
  }
  function fight(k) {
    const st = stops[k];
    if (!st || st.kind !== 'boss' || stateOf(k) !== 'fight') return;
    openBoss(st.rb.id, ctx);
  }
  /** Small rewards fly from a 3D point into the coin / buck pills. */
  function flySmall(from, got) {
    for (const g of got) {
      const to = g.kind === 'coins' ? coinPill : g.kind === 'bucks' ? buckPill : null;
      flyText(from, `+${fmtN(g.amount)}`, g.kind === 'bucks' ? 'c-pink' : 'c-gold');
      flyIcons(from, g.kind === 'coins' ? 'coin' : g.kind === 'bucks' ? 'bucks' : 'calorie', to, { count: 7, size: 30 }).then(() => setPills());
    }
  }
  const anchorAt = (pos3) => {
    const sp = road.screenOf(pos3);
    const a = h('div', { class: 'trd-anchor', style: { left: sp.x + 'px', top: sp.y + 'px' } });
    $overlay().appendChild(a);
    return a;
  };
  let claiming = false;
  async function claim(k) {
    // (a walk back from the last chest is fine: he turns around for this one; a post-win walk is not)
    if (claiming || stateOf(k) !== 'ready' || root.classList.contains('walking')) return;
    const st = stops[k];
    if (st.kind !== 'chest') return;
    const M = st.M;
    claiming = true;
    actEl.querySelector('.trd-claim')?.classList.replace('pulse', 'busy');
    // your Commander walks up and kicks it open first
    const got = await road.walkClaim(k);
    if (!got.length) { claiming = false; if (shownIdx >= 0) fill(shownIdx, false); return; }
    header();
    const from = road.screenOf(M.rewardPos);
    // pixel confetti out of the chest, then the reward art flies from the chest to the UI
    const chest = road.screenOf(M.anchor);
    setTimeout(() => pixelPop(chest.x, chest.y - (from.y - chest.y) * 0.35), 120);
    const anchor = h('div', { class: 'trd-anchor', style: { left: from.x + 'px', top: from.y + 'px' } });
    $overlay().appendChild(anchor);
    const small = got.every((g) => SMALL_KINDS.has(g.kind));
    const done = () => { anchor.remove(); claiming = false; refreshCtx(ctx); if (shownIdx >= 0) fill(shownIdx, true); header(); };
    if (small) {
      setTimeout(() => flySmall(anchor, got), 260);
      setTimeout(done, 1200);
      return;
    }
    // bigger rewards: the tile springs out of the chest into the reward screen
    setTimeout(() => anchor.appendChild(h('div', { class: 'trd-fly' }, rewardTile(got[0]))), 240);
    const big = isBigReward(got[0]) || M.gate;
    setTimeout(() => {
      anchor.remove();
      showRewards(got, { title: `${fmtN(M.t)} TROPHIES!`, note: got.some((g) => g.kind === 'vial') ? 'Vials go to your vial slots on Beast Island.' : null, color: big ? 'gold' : undefined })
        .then(() => { setPills(); done(); });
    }, 900);
  }
  let bagCount = 0;
  let shownYou = state.p.trophies;
  const api = {
    el: root,
    focus(k) { if (k !== shownIdx || stateOf(k) !== shownState) fill(k, k !== shownIdx); },
    claim,
    fight,
    /** While your Commander walks the road: the card steps aside, the skip button shows. */
    walking(on) {
      root.classList.toggle('walking', !!on);
      if (!on && shownIdx >= 0) fill(shownIdx, false);
    },
    /** Loot out of a chest at a 3D point: confetti, coins into the pills, anything bigger into the bag (seq.loot). */
    loot(got, pos3, seq) {
      const sp = road.screenOf(pos3);
      pixelPop(sp.x, sp.y + 30, 34);
      const a = anchorAt(pos3);
      const small = got.filter((g) => SMALL_KINDS.has(g.kind)), big = got.filter((g) => !SMALL_KINDS.has(g.kind));
      if (small.length) flySmall(a, small);
      big.forEach((g, i) => {
        if (seq) seq.loot.push(g);
        const tile = h('div', { class: 'trd-bagfly' }, rewardTile(g));
        tile.style.left = sp.x + 'px';
        tile.style.top = sp.y + 'px';
        $overlay().appendChild(tile);
        bag.classList.add('on');
        const b = bag.getBoundingClientRect();
        const dx = b.left + b.width / 2 - sp.x, dy = b.top + b.height / 2 - sp.y;
        tile.animate([
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, -120%) scale(1.15)', opacity: 1, offset: 0.3 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.35)`, opacity: 0.9 },
        ], { duration: 900, delay: 120 + i * 160, easing: 'cubic-bezier(.45,.05,.55,1)', fill: 'forwards' }).onfinish = () => {
          tile.remove();
          bagCount++;
          bagN.textContent = String(bagCount);
          bump(bag, 'trd-bag-pop');
          audio.play('pop', { pitch: 1.3 });
        };
      });
      setTimeout(() => a.remove(), 1600);
      setTimeout(setPills, 900);
    },
    /** End of a walk: the bag opens into the reward screen. */
    async lootSummary(list) {
      if (!list.length) return;
      await new Promise((r) => setTimeout(r, 450));
      await showRewards(list, { title: 'TREASURE!', color: 'gold', note: list.some((g) => g.kind === 'vial') ? 'Vials go to your vial slots on Beast Island.' : null });
      bagCount = 0;
      bag.classList.remove('on');
      setPills();
      refreshCtx(ctx);
    },
    /** A boss goes down: pixel smoke poof over it (pos3: its middle, h: its height in world units). */
    poof(pos3, hgt) {
      const a = road.screenOf(pos3), b = road.screenOf(pos3.clone().setY(pos3.y + hgt * 0.5));
      const px = Math.max(80, Math.abs(a.y - b.y) * 3.2);
      pixelPoof(a.x, a.y, px);
      pixelPop(a.x, a.y, 40, ['#ffffff', '#e6e2f0', '#ffd84a', '#ff6a6a', '#2a2440'], { speed: 1.2, spread: 3.2 });
    },
    /** Splinters of a broken barricade. */
    debris(pos3) {
      const a = road.screenOf(pos3);
      pixelPop(a.x, a.y, 30, ['#7a4a24', '#5a3418', '#b8202a', '#1a1420', '#e8e0c8', '#8f98aa'], { speed: 1.1, spread: 2.6 });
    },
    refresh() { header(); if (shownIdx >= 0 && stateOf(shownIdx) !== shownState && !claiming) fill(shownIdx, false); },
    frame() {
      // YOU tag rides above your Commander's head (its count climbs while he walks)
      const n = road.youCount?.() ?? state.p.trophies;
      if (n !== shownYou) { shownYou = n; youVal.textContent = fmtN(n); }
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
