// Deck builder: troop slots (with trophy-locked future slots), spells and the
// equipped Commander.
import { h, icon, button, toast } from '../ui.js';
import { audio } from '../../core/audio.js';
import {
  state, owned, setDeck, deckSlotCount, spellSlotCount, equipSpells, upgradeSpell, spellUpgradeCost, deployInfo, upgradeInfo,
} from '../../game/state.js';
import { SWARMS } from '../../data/swarms.js';
import { SPELLS, spellPower } from '../../data/spells.js';
import { COMMANDERS } from '../../data/commanders.js';
import { DECK_SLOTS } from '../../data/arena.js';
import { makeScreen, swarmCard, sectionTitle, cmdImg, fmt, priceTag, unlockHint, deny, sparkle, emptyNote } from './common.js';

const RORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const MAX_SPELL_SLOTS = 3;

export function avgCost(deck = state.p.deck) {
  if (!deck.length) return 0;
  return Math.round(deck.reduce((a, id) => a + SWARMS[deployInfo(id).unit].cost, 0) / deck.length);
}

function slotTrophies(i) {
  return DECK_SLOTS.find((d) => d.slots > i)?.trophies ?? null;
}

export function openDeck(hub, opts = {}) {
  return makeScreen(hub, {
    name: 'deck',
    title: 'BATTLE DECK',
    color: 'orange',
    cls: 'sc-deck',
    data: { swapIn: opts.swapIn ?? null },
    tabs: [
      { id: 'troops', label: 'Troops', icon: 'swarm' },
      { id: 'spells', label: 'Spells', icon: 'magic', dot: () => state.p.spells.equipped.length < Math.min(spellSlotCount(), Object.keys(state.p.spells.owned).length) },
      { id: 'commander', label: 'Commander', icon: 'crown' },
    ],
    tab: opts.tab ?? 'troops',
    render(scr) {
      if (scr.tab === 'spells') return renderSpells(scr);
      if (scr.tab === 'commander') return renderCommander(hub, scr);
      return renderTroops(hub, scr);
    },
  });
}

function renderTroops(hub, scr) {
  const p = state.p;
  const n = deckSlotCount();
  const maxSlots = DECK_SLOTS[DECK_SLOTS.length - 1].slots;
  const swapIn = scr.data.swapIn;
  const root = h('div', { class: 'col' });

  const top = h('div', { class: 'hub-deck-top' });
  top.appendChild(
    h('div', { class: 'row hub-deck-head' },
      h('span', { class: 'display small' }, `DECK ${p.deck.length}/${n}`),
      h('span', { class: 'spacer' }),
      h('span', { class: 'hub-chip' }, icon('energy'), 'Avg cost ', h('b', {}, String(avgCost()))),
    ),
  );
  if (swapIn) {
    top.appendChild(
      h('div', { class: 'hub-swap-note' }, icon('up'), h('span', { class: 'grow', html: `Tap a deck card to swap in <b>${SWARMS[swapIn].name}</b>` }),
        button('Cancel', () => {
          scr.data.swapIn = null;
          scr.rerender();
        }, 'small gray')),
    );
  }
  const row = h('div', { class: 'hub-deck-row' + (swapIn ? ' swapping' : '') });
  for (let i = 0; i < maxSlots; i++) {
    if (i < n) {
      const id = p.deck[i];
      if (id) {
        const c = swarmCard(id, {
          deploy: true,
          showCopies: false,
          cls: swapIn ? 'wiggle-soft' : '',
          onClick: () => {
            if (swapIn) {
              const deck = p.deck.slice();
              const fromIdx = deck.indexOf(swapIn);
              if (fromIdx >= 0) deck[fromIdx] = id;
              deck[i] = swapIn;
              setDeck(deck);
              audio.play('pop');
              toast(`*${SWARMS[swapIn].name}* swapped in!`, { icon: 'check' });
              scr.data.swapIn = null;
            } else {
              setDeck(p.deck.filter((x) => x !== id));
              audio.play('swing');
            }
          },
        });
        c.appendChild(h('div', { class: 'hub-remove' }, icon('x')));
        row.appendChild(c);
      } else {
        const el = h('div', { class: 'hub-slot empty' }, h('span', { class: 'display' }, '+'), h('span', { class: 'tiny' }, 'Empty'));
        el.addEventListener('click', () => {
          if (swapIn) {
            setDeck([...p.deck, swapIn]);
            scr.data.swapIn = null;
            audio.play('pop');
          } else toast('Tap a swarm below to add it');
        });
        row.appendChild(el);
      }
    } else {
      const t = slotTrophies(i);
      row.appendChild(h('div', { class: 'hub-slot locked' }, icon('lock'), h('span', { class: 'tiny' }, icon('trophy', 'ic-xs'), String(t))));
    }
  }
  top.appendChild(row);
  root.appendChild(top);

  // owned swarms
  const ownedIds = Object.keys(p.swarms).filter((id) => SWARMS[id] && !SWARMS[id].hidden && !SWARMS[id].isMega);
  ownedIds.sort((a, b) => SWARMS[a].cost - SWARMS[b].cost || RORDER[SWARMS[a].rarity] - RORDER[SWARMS[b].rarity]);
  const rest = ownedIds.filter((id) => !p.deck.includes(id));
  root.appendChild(sectionTitle('YOUR SWARMS', rest.length ? 'Tap to add' : null));
  if (!rest.length) root.appendChild(emptyNote(ownedIds.length ? 'All your swarms are in the deck!' : 'No swarms yet - open vials!'));
  const grid = h('div', { class: 'hub-grid' });
  for (const id of rest) {
    grid.appendChild(
      swarmCard(id, {
        deploy: true,
        selected: swapIn === id,
        showArrow: true,
        onClick: () => {
          if (p.deck.length < n) {
            setDeck([...p.deck, id]);
            audio.play('pop');
          } else {
            scr.data.swapIn = scr.data.swapIn === id ? null : id;
            if (scr.data.swapIn) toast('Deck full! Tap a deck card to swap.');
            scr.rerender();
          }
        },
      }),
    );
  }
  root.appendChild(grid);
  if (rest.length || ownedIds.length) {
    root.appendChild(h('div', { class: 'row center hub-mt' }, button('Swarm Collection', () => hub.openScreen('collection'), 'small', { icon: 'swarm' })));
  }
  void upgradeInfo;
  return root;
}

function renderSpells(scr) {
  const p = state.p;
  const n = spellSlotCount();
  const root = h('div', { class: 'col' });
  const eq = p.spells.equipped;
  root.appendChild(h('div', { class: 'row hub-deck-head' }, h('span', { class: 'display small' }, `SPELLS ${eq.length}/${n}`), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, 'Cast from your Lab during battle')));
  const row = h('div', { class: 'hub-deck-row spells' });
  for (let i = 0; i < MAX_SPELL_SLOTS; i++) {
    if (i < n) {
      const id = eq[i];
      if (id) {
        const sp = SPELLS[id];
        const el = h('div', { class: 'hub-spell-slot' }, h('div', { class: 'spell-ic', style: { background: sp.color } }, icon(sp.icon)), h('div', { class: 'tiny nm' }, sp.name), h('div', { class: 'hub-remove' }, icon('x')));
        el.addEventListener('click', () => {
          equipSpells(eq.filter((x) => x !== id));
          audio.play('swing');
        });
        row.appendChild(el);
      } else row.appendChild(h('div', { class: 'hub-slot empty spell' }, h('span', { class: 'display' }, '+'), h('span', { class: 'tiny' }, 'Empty')));
    } else row.appendChild(h('div', { class: 'hub-slot locked spell' }, icon('lock'), h('span', { class: 'tiny' }, icon('trophy', 'ic-xs'), '500')));
  }
  root.appendChild(row);
  root.appendChild(sectionTitle('ALL SPELLS'));
  const list = h('div', { class: 'hub-spell-list' });
  for (const sp of Object.values(SPELLS)) {
    const o = p.spells.owned[sp.id];
    const equipped = eq.includes(sp.id);
    const cost = o ? spellUpgradeCost(sp.id) : null;
    const tile = h('div', { class: `hub-spell px-box ${o ? 'light' : 'dark locked'} ${equipped ? 'eq' : ''}` });
    const art = h('div', { class: 'spell-ic big', style: { background: o ? sp.color : '#5a628a' } }, icon(o ? sp.icon : 'lock'));
    tile.appendChild(art);
    tile.appendChild(
      h('div', { class: 'col grow info' },
        h('div', { class: 'row sp-head' }, h('b', { class: 'nm' }, sp.name), o ? h('span', { class: 'hub-lv' }, 'Lv' + o.level) : null),
        h('div', { class: 'small muted desc' }, sp.desc),
        h('div', { class: 'row wrap sp-meta' },
          h('span', { class: 'hub-chip yel' }, icon('energy'), String(sp.cost)),
          o
            ? h('span', { class: 'tiny greent' }, `Power x${spellPower(o.level).toFixed(2)} · ${sp.cd}s cooldown`)
            : h('span', { class: 'tiny gold' }, icon('pin', 'ic-xs'), ' ', unlockHint('spell', sp.id) ?? 'Starter spell - learn it in the Lab')),
      ),
    );
    const acts = h('div', { class: 'col acts' });
    if (o) {
      acts.appendChild(
        button(equipped ? 'Unequip' : 'Equip', () => {
          if (equipped) equipSpells(eq.filter((x) => x !== sp.id));
          else if (eq.length < n) {
            equipSpells([...eq, sp.id]);
            audio.play('magic');
          } else deny('Spell slots full - unequip one first');
        }, equipped ? 'small gray' : 'small'),
      );
      if (cost !== null) {
        const ub = button(h('span', { class: 'row' }, icon('up'), priceTag('coin', fmt(cost))), () => {
          if (upgradeSpell(sp.id)) {
            audio.play('levelUp');
            toast(`*${sp.name}* upgraded to level ${p.spells.owned[sp.id].level}!`, { icon: 'up' });
            requestAnimationFrame(() => sparkle(art, { count: 16 }));
          }
        }, p.coins >= cost ? 'small green' : 'small gray', { onDisabled: () => toast(`Need ${fmt(cost - p.coins)} more coins`, { icon: 'x', color: '#b8282f' }) });
        if (p.coins < cost) ub.classList.add('disabled');
        acts.appendChild(ub);
      } else acts.appendChild(h('span', { class: 'gold tiny display' }, 'MAX'));
    }
    tile.appendChild(acts);
    list.appendChild(tile);
  }
  root.appendChild(list);
  void scr;
  return root;
}

function renderCommander(hub) {
  const p = state.p;
  const id = p.commanders.equipped;
  const cmd = COMMANDERS[id];
  const c = p.commanders.owned[id];
  const root = h('div', { class: 'col' });
  const card = h('div', { class: 'hub-cmd-eq px-box light' },
    h('div', { class: 'hub-cmd-portrait' }, cmdImg(id, c?.skin, 128)),
    h('div', { class: 'col grow' },
      h('div', { class: 'row' }, h('b', { class: 'display small' }, cmd.name.toUpperCase()), h('span', { class: 'hub-lv' }, 'Lv' + (c?.level ?? 1))),
      h('div', { class: 'small muted' }, cmd.desc),
      h('div', { class: 'hub-sig' }, icon(cmd.signature.icon), h('div', { class: 'col' }, h('b', {}, cmd.signature.name), h('span', { class: 'small' }, cmd.signature.desc))),
    ),
  );
  root.appendChild(card);
  root.appendChild(h('div', { class: 'row center hub-mt' },
    button('Change Commander', () => hub.openScreen('commanders'), 'purple', { icon: 'crown' }),
    button('Details', () => hub.openScreen('commander', { id }), '', { icon: 'star' })));
  return root;
}
