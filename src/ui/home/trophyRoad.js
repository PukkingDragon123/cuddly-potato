// Trophy Road (Clash Royale style): a full-screen vertical road from 0
// trophies upward. Arena milestones show the arena, the MrBeast video it is
// based on, the cards it unlocks and a VIEW button (ctx.focusArena); reward
// nodes alternate sides and are claimed in place. The road auto-scrolls to
// your trophy marker.
import { h, icon, button, sparkle, bump, clear, $overlay } from '../ui.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { state, trophyRoadClaimable, claimTrophyRoad } from '../../game/state.js';
import { ARENAS, TROPHY_ROAD, arenaById, currentArena, bossOfArena } from '../../data/arenas.js';
import { cardsOfArena } from '../../data/cards.js';
import { rewardTile, rewardLabel, showRewards, refreshCtx, fmtN, charImg } from './common.js';
import { openBoss } from './boss.js';

export function trophyRoadBadge() {
  return trophyRoadClaimable().length;
}

export function openTrophyRoad(ctx) {
  const root = h('div', { class: 'mn-tr' });
  const scroll = h('div', { class: 'mn-tr-scroll scroll-y' });
  const pillVal = h('b', { class: 't-d outline' }, fmtN(state.p.trophies));
  const claimN = h('span', {});
  const head = h('div', { class: 'mn-tr-head' },
    h('div', { class: 'mn-tr-pill' }, icon('trophy', 'mn-tr-pill-ic'), h('div', { class: 'col', style: { gap: 0, lineHeight: 1 } }, pillVal, h('span', { class: 't-xs c-muted' }, `Best ${fmtN(state.p.bestTrophies)}`))),
    h('div', { class: 'ribbon sk-ribbon-gold mn-tr-title' }, h('span', {}, 'TROPHY ROAD')),
    claimN,
    button('', () => close(), 'red sm icon-only mn-tr-x', { icon: 'x', sound: 'tap' }));
  root.append(h('div', { class: 'mn-tr-sky' }), head, scroll);
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

  function claim(m, btn) {
    const got = claimTrophyRoad(m);
    if (!got.length) return;
    audio.play('chaching');
    const row = btn.closest('.mn-tr-node-card, .mn-tr-arena');
    if (row) { sparkle(row, { count: 22 }); bump(row); }
    refreshCtx(ctx);
    showRewards(got, { title: `${fmtN(m.t)} TROPHIES!`, note: got.some((g) => g.kind === 'vial') ? 'Vials go to your vial slots on Beast Island.' : null }).then(() => render(true));
  }

  function claimCtl(m) {
    const best = state.p.bestTrophies;
    if (state.p.trophyRoad[m.key]) return h('div', { class: 'mn-tr-got t-d outline' }, icon('check', 's'), 'CLAIMED');
    if (best >= m.t) return button('CLAIM', (e) => claim(m, e.currentTarget), 'green sm pulse', { icon: 'gift', sound: 'tap' });
    return h('div', { class: 'mn-tr-need' }, icon('lock', 's'), h('span', {}, fmtN(m.t)));
  }

  function arenaRow(ar, m) {
    const best = state.p.bestTrophies;
    const open = best >= ar.trophies;
    const here = currentArena(state.p.trophies).id === ar.id;
    const cards = cardsOfArena(ar.id);
    const boss = bossOfArena(ar.id);
    const el = h('div', { class: `mn-tr-row arena ${open ? 'open' : 'lock'} ${here ? 'here' : ''}`, 'data-t': ar.trophies },
      h('div', { class: 'mn-tr-gate t-d outline', 'data-node': '1' }, icon('trophy', 's'), fmtN(ar.trophies)),
      h('div', { class: 'mn-tr-arena', style: { '--ac': ar.color } },
        here ? h('div', { class: 'mn-tr-here t-d' }, 'YOU ARE HERE') : null,
        h('div', { class: 'mn-tr-ar-top' },
          h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.4)', minWidth: 0 } },
            h('span', { class: 't-d mn-tr-ar-no' }, `ARENA ${ar.index + 1}${ar.legendary ? ' · LEGENDARY' : ''}`),
            h('span', { class: 't-d outline mn-tr-ar-n' }, ar.name)),
          button('VIEW', () => { close(); setTimeout(() => ctx.focusArena?.(ar.id), 120); }, 'blue sm', { icon: 'eye' })),
        h('div', { class: 'mn-tr-video' }, icon('play', 's'), h('span', {}, h('i', {}, 'Based on: '), `"${ar.video}"`)),
        h('div', { class: 'mn-tr-desc' }, ar.desc),
        cards.length ? h('div', { class: 'mn-tr-cards' }, h('span', { class: 't-d outline mn-tr-unl' }, open ? 'CARDS' : 'UNLOCKS'),
          h('div', { class: 'mn-tr-cardrow' }, ...cards.map((c) => cardEl(c.id, { size: 'mini', noLevel: true, locked: !state.p.cards[c.id] && !open, artSize: 128 })))) : null,
        h('div', { class: 'mn-tr-ar-foot' },
          m ? h('div', { class: 'mn-tr-gr' }, rewardTile(m.reward), h('div', { class: 'col', style: { gap: 'calc(var(--u)*0.5)' } }, h('span', { class: 't-xs c-muted' }, 'Arena reward'), h('b', { class: 'mn-tr-gr-n' }, rewardLabel(m.reward))), claimCtl(m)) : h('span', { class: 't-sm c-muted' }, 'Where every Lab begins!'),
          boss ? button('BOSS', () => openBoss(boss.id, ctx), 'red sm', { icon: 'boss' }) : null),
        !open ? h('div', { class: 'mn-tr-lockveil' }, icon('lock'), h('span', { class: 't-d outline' }, `${fmtN(ar.trophies)} TROPHIES`)) : null));
    return el;
  }

  function rewardRow(m, side) {
    const best = state.p.bestTrophies;
    const reached = best >= m.t;
    const claimed = !!state.p.trophyRoad[m.key];
    const card = h('div', { class: `mn-tr-node-card ${claimed ? 'claimed' : reached ? 'ready' : ''}` },
      rewardTile(m.reward),
      h('div', { class: 'col', style: { gap: 'calc(var(--u)*0.6)', minWidth: 0 } }, h('b', { class: 'mn-tr-rn' }, rewardLabel(m.reward)), claimCtl(m)));
    return h('div', { class: `mn-tr-row rew ${side} ${reached ? 'reached' : ''}`, 'data-t': m.t },
      side === 'l' ? card : h('div'),
      h('div', { class: 'mn-tr-node t-d outline', 'data-node': '1' }, fmtN(m.t)),
      side === 'r' ? card : h('div'));
  }

  function render(keepScroll = false) {
    const st = scroll.scrollTop;
    clear(scroll);
    const road = h('div', { class: 'mn-tr-road' });
    const fill = h('div', { class: 'mn-tr-fill' });
    const you = h('div', { class: 'mn-tr-you' }, h('div', { class: 'mn-tr-you-port' }, charImg('recruit', { size: 96 })), h('b', { class: 't-d outline' }, icon('trophy', 's'), fmtN(state.p.trophies)));
    road.append(h('div', { class: 'mn-tr-line' }), fill);
    const items = [{ kind: 'arena', ar: ARENAS[0], m: null, t: 0 }];
    let side = 0;
    for (const m of TROPHY_ROAD) {
      if (m.arena) items.push({ kind: 'arena', ar: arenaById(m.arena), m, t: m.t });
      else items.push({ kind: 'rew', m, t: m.t, side: side++ % 2 ? 'r' : 'l' });
    }
    road.appendChild(h('div', { class: 'mn-tr-top' }, h('span', { class: 't-d outline' }, 'MORE OF BEAST ISLAND'), h('span', { class: 't-xs c-muted' }, 'coming in future seasons...')));
    for (const it of items.slice().reverse()) road.appendChild(it.kind === 'arena' ? arenaRow(it.ar, it.m) : rewardRow(it.m, it.side));
    road.appendChild(you);
    scroll.appendChild(road);
    const n = trophyRoadClaimable().length;
    claimN.className = n ? 'badge mn-tr-badge' : '';
    claimN.textContent = n ? String(n) : '';
    pillVal.textContent = fmtN(state.p.trophies);
    // position fill + marker
    requestAnimationFrame(() => {
      const nodes = [...road.querySelectorAll('[data-node]')].map((el) => {
        const row = el.closest('[data-t]');
        let y = 0, e = el;
        while (e && e !== road) { y += e.offsetTop; e = e.offsetParent; }
        return { t: +row.dataset.t, y: y + el.offsetHeight / 2 };
      }).sort((a, b) => a.t - b.t);
      const T = state.p.trophies;
      let y = nodes[0].y;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i], b = nodes[i + 1];
        if (T >= a.t && (!b || T < b.t)) { y = b ? a.y + (b.y - a.y) * ((T - a.t) / (b.t - a.t)) : a.y; break; }
      }
      fill.style.top = y + 'px';
      fill.style.height = Math.max(0, nodes[0].y - y) + 'px';
      you.style.top = y + 'px';
      if (keepScroll) scroll.scrollTop = st;
      else scroll.scrollTop = Math.max(0, y - scroll.clientHeight * 0.55);
    });
  }

  render();
  return { close, el: root };
}
