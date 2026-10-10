// Vials: slot management (unlock / skip / open), storage and a vial guide.
import { h, icon, button } from '../ui.js';
import { state, vialTimeLeft, vialReady, isUnlocking, skipPrice } from '../../game/state.js';
import { VIALS, VIAL_SLOTS } from '../../data/vials.js';
import { RARITIES } from '../../data/swarms.js';
import { makeScreen, vialImg, fmt, fmtTime, priceTag, sectionTitle, seriesTag } from './common.js';

export function vialStatus(i) {
  const e = state.p.vials.slots[i];
  if (!e) return { empty: true };
  const v = VIALS[e.type];
  const ready = vialReady(i);
  const left = vialTimeLeft(i);
  const unlocking = !ready && !!e.unlockStart && left > 0;
  return { e, v, ready, left, unlocking, idle: !ready && !unlocking, price: skipPrice(left) };
}

export function openVials(hub) {
  return makeScreen(hub, {
    name: 'vials',
    title: 'VIALS',
    color: 'green',
    cls: 'sc-vials',
    tick(scr) {
      let needRerender = false;
      scr.panel.querySelectorAll('[data-vslot]').forEach((el) => {
        const i = +el.dataset.vslot;
        const st = vialStatus(i);
        if (st.ready && !el.classList.contains('ready')) needRerender = true;
        const t = el.querySelector('.js-time');
        if (t && st.unlocking) t.textContent = fmtTime(st.left);
        const pr = el.querySelector('.js-price');
        if (pr && !st.empty) pr.textContent = String(st.price);
      });
      if (needRerender) scr.rerender();
    },
    render() {
      const p = state.p;
      const root = h('div', { class: 'col' });
      root.appendChild(sectionTitle('VIAL SLOTS', 'Unlock one vial at a time'));
      const row = h('div', { class: 'hub-vial-cards' });
      const busy = isUnlocking();
      for (let i = 0; i < VIAL_SLOTS; i++) {
        const st = vialStatus(i);
        if (st.empty) {
          row.appendChild(h('div', { class: 'hub-vcard px-box dark empty' }, h('div', { class: 'art' }, icon('vial', 'ghost')), h('span', { class: 'small muted' }, 'Empty slot'), h('span', { class: 'tiny muted' }, 'Win battles to earn vials')));
          continue;
        }
        const card = h('div', { class: `hub-vcard px-box light ${st.ready ? 'ready' : ''} ${st.unlocking ? 'unlocking' : ''}`, 'data-vslot': i, style: { '--vc': '#' + st.v.liquid.toString(16).padStart(6, '0') } },
          h('div', { class: 'art' }, vialImg(st.e.type, st.ready ? 'bob' : '')),
          h('b', { class: 'nm' }, st.v.name),
          h('span', { class: 'tiny muted' }, `${st.v.cards} Swarms · ${st.v.coins[0]}-${st.v.coins[1]} coins`),
        );
        if (st.ready) {
          card.appendChild(button('OPEN!', () => hub.openVialNow(i), 'green big pulse', { icon: 'vial' }));
        } else if (st.unlocking) {
          card.appendChild(h('div', { class: 'row center hub-timer' }, icon('clock'), h('b', { class: 'js-time' }, fmtTime(st.left))));
          card.appendChild(button(h('span', { class: 'row' }, h('span', {}, 'Open now'), h('span', { class: 'price' }, icon('bucks'), h('span', { class: 'js-price' }, String(st.price)))), () => hub.skipVial(i), 'pink small'));
        } else {
          card.appendChild(h('div', { class: 'row center hub-timer muted' }, icon('clock'), h('b', {}, fmtTime(st.v.time))));
          if (!busy) card.appendChild(button('Start unlock', () => hub.startUnlockSlot(i), 'small', { icon: 'clock' }));
          else card.appendChild(h('span', { class: 'tiny muted center-t' }, 'Another vial is unlocking'));
          card.appendChild(button(h('span', { class: 'row' }, h('span', {}, 'Open now'), priceTag('bucks', st.price)), () => hub.skipVial(i), 'pink small'));
        }
        row.appendChild(card);
      }
      root.appendChild(row);

      const stor = p.vials.storage;
      root.appendChild(sectionTitle('STORAGE', stor.length ? `${stor.length} waiting` : null));
      if (!stor.length) root.appendChild(h('div', { class: 'small muted' }, 'Storage is empty. Extra vials wait here when all 4 slots are full, and move into a slot as soon as one opens.'));
      else {
        const counts = {};
        for (const t of stor) counts[t] = (counts[t] ?? 0) + 1;
        const sr = h('div', { class: 'row wrap hub-storage' });
        for (const [t, n] of Object.entries(counts)) sr.appendChild(h('div', { class: 'hub-stored px-box dark' }, vialImg(t), h('span', { class: 'small' }, VIALS[t].name), h('b', { class: 'hub-chip' }, 'x' + n)));
        root.appendChild(sr);
      }

      root.appendChild(sectionTitle('VIAL GUIDE'));
      const guide = h('div', { class: 'hub-vial-guide' });
      for (const v of Object.values(VIALS)) {
        if (v.id === 'starter') continue;
        guide.appendChild(
          h('div', { class: 'hub-vguide px-box dark' },
            h('div', { class: 'art' }, vialImg(v.id)),
            h('div', { class: 'col grow' },
              h('div', { class: 'row wrap' }, h('b', {}, v.name), v.series ? seriesTag(v.series) : null, v.season ? h('span', { class: 'hub-chip pinkbg tiny' }, 'SEASON') : null),
              h('span', { class: 'small' }, v.desc),
              h('div', { class: 'row wrap tiny hub-vfacts' },
                h('span', { class: 'row' }, icon('swarm', 'ic-xs'), `${v.cards} Swarms`),
                h('span', { class: 'row' }, icon('coin', 'ic-xs'), `${v.coins[0]}-${v.coins[1]}`),
                h('span', { class: 'row' }, icon('clock', 'ic-xs'), fmtTime(v.time)),
                v.minRarity ? h('span', { class: 'row', style: { color: RARITIES[v.minRarity].color } }, icon('star', 'ic-xs'), `${RARITIES[v.minRarity].name}+ guaranteed`) : null,
                v.shinyBoost ? h('span', { class: 'row', style: { color: '#9ff2ff' } }, icon('chrome', 'ic-xs'), `${v.shinyBoost}x shiny chance`) : null,
              ),
            ),
          ),
        );
      }
      root.appendChild(guide);
      void fmt;
      return root;
    },
  });
}
