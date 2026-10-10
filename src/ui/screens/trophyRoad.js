// Trophy Road: arenas + milestone rewards on a vertical road with a
// "you are here" marker.
import { h, icon, button } from '../ui.js';
import { audio } from '../../core/audio.js';
import { state, trophyRoadClaimable, claimTrophyRoad } from '../../game/state.js';
import { ARENAS, TROPHY_ROAD, currentArena, deckSlots } from '../../data/arena.js';
import { SERIES } from '../../data/swarms.js';
import { makeScreen, rewardArt, rewardLabel, showRewards, fmt } from './common.js';

export function openTrophyRoad(hub) {
  let scrolled = false;
  return makeScreen(hub, {
    name: 'trophyRoad',
    title: 'TROPHY ROAD',
    color: 'yellow',
    size: 'mid',
    cls: 'sc-road',
    afterRender(scr) {
      if (scrolled) return;
      scrolled = true;
      requestAnimationFrame(() => {
        const me = scr.panel.querySelector('.hub-road-you');
        if (me) scr.m.body.scrollTop = Math.max(0, me.offsetTop - scr.m.body.clientHeight / 2);
      });
    },
    render() {
      const p = state.p;
      const tro = p.trophies;
      const best = p.bestTrophies;
      const cur = currentArena(tro);
      const claimable = trophyRoadClaimable();
      const root = h('div', { class: 'col' });
      root.appendChild(
        h('div', { class: 'hub-road-head px-box dark' },
          icon('trophy', 'big-ic'),
          h('div', { class: 'col grow' }, h('b', { class: 'display small' }, `${fmt(tro)} TROPHIES`), h('span', { class: 'small muted' }, `Best: ${fmt(best)} · Arena: ${cur.name}`)),
          claimable.length > 1
            ? button(`Claim all (${claimable.length})`, () => {
              const all = [];
              for (const t of claimable) all.push(...claimTrophyRoad(t));
              showRewards(all, { title: 'TROPHY ROAD!' });
            }, 'green small pulse', { icon: 'chest' })
            : null,
        ),
      );
      const seasonal = ARENAS.filter((a) => a.seasonal);
      for (const a of seasonal) {
        root.appendChild(
          h('div', { class: 'hub-road-seasonal', style: { '--ac': a.color } }, icon('cart'), h('div', { class: 'col grow' }, h('b', {}, `SEASONAL ARENA: ${a.name}`), h('span', { class: 'small' }, `Open to everyone during FOOD SEASON · ${a.series.map((s) => SERIES[s]?.name).join(', ')}`))),
        );
      }

      // merge arenas + rewards + you marker
      const items = [];
      for (const a of ARENAS.filter((x) => !x.seasonal)) items.push({ kind: 'arena', t: a.trophies, a, o: 0 });
      for (const r of TROPHY_ROAD) items.push({ kind: 'reward', t: r.trophies, r, o: 1 });
      items.push({ kind: 'you', t: tro, o: 2 });
      items.sort((x, y) => x.t - y.t || x.o - y.o);

      const road = h('div', { class: 'hub-road' });
      for (const it of items) {
        const reached = tro >= it.t;
        const row = h('div', { class: `hub-road-row ${it.kind} ${reached ? 'reached' : ''}` });
        row.appendChild(h('div', { class: 'rail' }, h('i', { class: 'line' }), h('i', { class: 'knob' })));
        if (it.kind === 'arena') {
          const a = it.a;
          const isCur = a.id === cur.id;
          row.appendChild(
            h('div', { class: `hub-road-arena ${isCur ? 'cur' : ''} ${reached ? '' : 'locked'}`, style: { '--ac': a.color } },
              h('div', { class: 'row' }, h('span', { class: 'display small nm outline-sm' }, a.name), h('span', { class: 'spacer' }), h('span', { class: 'hub-chip' }, icon('trophy'), fmt(a.trophies))),
              h('div', { class: 'small' }, 'Swarms: ', a.series.map((s) => SERIES[s]?.name).join(', ')),
              h('div', { class: 'tiny' }, `Deck slots here: ${deckSlots(a.trophies)} · Lab HP ${fmt(a.labHp)}`),
              isCur ? h('div', { class: 'cur-tag display' }, 'YOU ARE HERE') : !reached ? h('div', { class: 'lock-tag' }, icon('lock')) : null,
            ),
          );
        } else if (it.kind === 'reward') {
          const r = it.r;
          const claimed = !!p.trophyRoad[r.trophies];
          const can = !claimed && best >= r.trophies;
          const box = h('div', { class: `hub-road-reward px-box ${claimed ? 'dark claimed' : can ? 'light can' : 'dark'}` },
            h('div', { class: 'art' }, rewardArt(r.reward, 96)),
            h('div', { class: 'col grow' }, h('b', {}, rewardLabel(r.reward)), h('span', { class: 'tiny muted row' }, icon('trophy', 'ic-xs'), fmt(r.trophies))),
          );
          if (can) {
            box.appendChild(button('CLAIM', () => {
              const got = claimTrophyRoad(r);
              audio.play('chaching');
              showRewards(got, { title: `${r.trophies} TROPHIES!` });
            }, 'green pulse'));
          } else if (claimed) box.appendChild(h('div', { class: 'ok' }, icon('check')));
          else box.appendChild(h('div', { class: 'lk' }, icon('lock')));
          row.appendChild(box);
        } else {
          row.appendChild(h('div', { class: 'hub-road-you' }, icon('trophy'), h('b', { class: 'display small' }, `YOU · ${fmt(tro)}`)));
        }
        road.appendChild(row);
      }
      root.appendChild(road);
      return root;
    },
  });
}
