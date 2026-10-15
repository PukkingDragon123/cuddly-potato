// CARDS tab: Clash Royale-style deck builder + collection.
//   - 3 deck preset tabs, the 8-card battle deck with average energy
//   - tap a card -> context pop (Info / Use / Upgrade)
//   - "Use" -> swap mode: the chosen card floats under the deck and the deck
//     cards wiggle until you tap the one to replace
//   - collection sorted by rarity / energy / arena, NOT FOUND cards locked
import { h, icon, button, sparkle } from '../ui.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { state, upgradeInfo, currentDeck, setDeckCard, selectDeck, deckSlotCount } from '../../game/state.js';
import { ALL_CARDS, cardDef, DECK_SIZE, DECK_PRESETS, avgElixir, RARITIES, LINEUP_UNLOCKS } from '../../data/cards.js';
import { arenaById } from '../../data/arenas.js';
import { screenShell, secHead, chip, isCardNew, markCardSeen, refreshCtx, fmtN } from './common.js';
import { openCardInfo } from './cardInfo.js';

const SORTS = [
  { id: 'rarity', label: 'By Rarity', short: 'Rarity', icon: 'star' },
  { id: 'energy', label: 'By Energy', short: 'Power', icon: 'energy' },
  { id: 'arena', label: 'By Arena', short: 'Arena', icon: 'island' },
];
let sortMode = 'rarity';
const arenaIdx = (c) => arenaById(c.arena)?.index ?? 99;
const rOrder = (c) => RARITIES[c.rarity]?.order ?? 0;

function sortCards(list) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (sortMode === 'energy') return list.sort((a, b) => a.elixir - b.elixir || rOrder(a) - rOrder(b) || byName(a, b));
  if (sortMode === 'arena') return list.sort((a, b) => arenaIdx(a) - arenaIdx(b) || rOrder(a) - rOrder(b) || a.elixir - b.elixir);
  return list.sort((a, b) => rOrder(b) - rOrder(a) || a.elixir - b.elixir || byName(a, b));
}

export function mount(el, ctx) {
  let swapId = null; // card waiting to be placed into the deck
  let pop = null; // open context pop element
  let justPlaced = -1;

  const shell = screenShell(el, { cls: 'mn-cards', render });
  shell.root.addEventListener('pointerdown', (e) => {
    if (pop && !pop.contains(e.target) && !e.target.closest('.mn-cc.picked')) closePop();
  }, true);

  function closePop() {
    if (!pop) return;
    const p = pop;
    pop = null;
    p.cell?.classList.remove('picked');
    p.classList.add('out');
    setTimeout(() => p.remove(), 140);
  }

  function openPop(cell, id, where, slot) {
    const wasSame = pop && pop.cardId === id && pop.where === where;
    closePop();
    if (wasSame) return;
    audio.play('cardPick');
    markCardSeen(id);
    cell.querySelector('.new-tag')?.remove();
    const up = upgradeInfo(id);
    const canUp = up && !up.max && up.enoughCopies;
    const btns = [
      button('INFO', () => { closePop(); openCardInfo(id, ctx); }, 'blue sm', { icon: 'info' }),
    ];
    if (where === 'coll') btns.push(button('USE', () => { closePop(); startSwap(id); }, 'green sm', { icon: 'swords' }));
    if (canUp) btns.push(button('UPGRADE', () => { closePop(); openCardInfo(id, ctx, { autoUpgrade: true }); }, 'yellow sm', { sub: `${fmtN(up.coins)} coins` }));
    const p = h('div', { class: 'mn-cpop' }, h('div', { class: 'mn-cpop-arrow' }), ...btns);
    p.cardId = id;
    p.where = where;
    p.cell = cell;
    cell.classList.add('picked');
    const host = shell.scroll.firstChild;
    host.appendChild(p);
    // position under the card, clamped to the content box
    const hr = host.getBoundingClientRect(), cr = cell.getBoundingClientRect();
    const pw = p.offsetWidth;
    const cx = cr.left - hr.left + cr.width / 2;
    const left = Math.max(4, Math.min(hr.width - pw - 4, cx - pw / 2));
    p.style.left = left + 'px';
    p.style.top = cr.bottom - hr.top + cell.querySelector('.gcard').offsetWidth * 0.3 + 'px';
    p.querySelector('.mn-cpop-arrow').style.left = cx - left + 'px';
    pop = p;
    requestAnimationFrame(() => {
      const sr = shell.scroll.getBoundingClientRect(), pr = p.getBoundingClientRect();
      if (pr.bottom > sr.bottom - 6) shell.scroll.scrollBy({ top: pr.bottom - sr.bottom + 12, behavior: 'smooth' });
    });
  }

  function startSwap(id) {
    swapId = id;
    audio.play('whoosh', { pitch: 1.3 });
    shell.render();
    shell.scroll.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelSwap() {
    swapId = null;
    shell.render();
  }
  function placeInto(slot) {
    const id = swapId;
    swapId = null;
    setDeckCard(slot, id);
    justPlaced = currentDeck().indexOf(id);
    audio.play('cardPick', { pitch: 1.3 });
    audio.play('pop', { pitch: 0.9 });
    shell.lock(300);
    shell.render();
    refreshCtx(ctx);
  }

  function deckSection() {
    const p = state.p;
    const deck = currentDeck();
    const tabs = h('div', { class: 'mn-dtabs' },
      h('span', { class: 't-d outline mn-dtabs-l' }, 'DECK'),
      ...Array.from({ length: DECK_PRESETS }, (_, i) => {
        const b = h('button', { class: `mn-dtab ${i === p.deckIdx ? 'on sk-btn-yellow' : 'sk-btn-blue'}`, type: 'button' }, h('span', {}, String(i + 1)));
        b.addEventListener('click', () => {
          if (i === p.deckIdx) return;
          audio.play('tap');
          swapId = null;
          selectDeck(i);
          shell.lock(200);
          shell.render();
          refreshCtx(ctx);
        });
        return b;
      }));
    // the Battle Cats-style lineup: 10 slots, 2 rows of 5
    const grid = h('div', { class: `mn-deck lineup ${swapId ? 'swapping' : ''}`, style: { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', rowGap: 'calc(var(--u) * 5.4)', columnGap: 'calc(var(--u) * 1)' } });
    const slots = deckSlotCount();
    for (let i = 0; i < DECK_SIZE; i++) {
      const id = deck[i];
      const cell = h('div', { class: `mn-cc ${i === justPlaced ? 'placed' : ''}`, style: { '--i': i, '--cwl': 'calc(var(--u) * 17)' } });
      if (id) {
        const up = upgradeInfo(id);
        const ce = cardEl(id, { progress: true, priority: true });
        ce.style.width = 'min(100%, calc(var(--u) * 17))';
        cell.appendChild(ce);
        if (up && !up.max && up.ok) cell.classList.add('can-up');
      } else if (i >= slots) {
        // locked lineup slot: opens at a trophy count
        const em = h('div', { class: 'gcard mn-empty' }, h('div', { class: 'mn-empty-in sk-slot', style: { flexDirection: 'column', opacity: 0.8 } },
          icon('lock', 's'), h('span', { class: 't-d c-gold', style: { fontSize: '0.8em', display: 'flex', alignItems: 'center', gap: '0.15em' } }, icon('trophy', 's'), String(LINEUP_UNLOCKS[i]))));
        em.style.width = 'min(100%, calc(var(--u) * 17))';
        cell.classList.add('lockd-slot');
        cell.appendChild(em);
      } else {
        const em = h('div', { class: 'gcard mn-empty' }, h('div', { class: 'mn-empty-in sk-slot' }, h('span', { class: 't-d' }, '+')));
        em.style.width = 'min(100%, calc(var(--u) * 17))';
        cell.appendChild(em);
      }
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (i >= slots) { audio.play('deny'); ctx.toast?.(`Lineup slot ${i + 1} unlocks at *${LINEUP_UNLOCKS[i]}* trophies!`, { icon: 'trophy' }); return; }
        if (swapId) return placeInto(i);
        if (id) openPop(cell, id, 'deck', i);
        else audio.play('deny');
      });
      grid.appendChild(cell);
    }
    if (justPlaced >= 0) {
      const c = grid.children[justPlaced];
      setTimeout(() => c?.isConnected && sparkle(c, { count: 16 }), 60);
      justPlaced = -1;
    }
    const avg = avgElixir(deck);
    const foot = h('div', { class: 'mn-deck-foot' },
      h('div', { class: 'mn-avg' }, icon('energy', 'l'), h('div', { class: 'col', style: { gap: 0 } }, h('span', { class: 't-xs c-muted' }, 'Average POWER'), h('b', { class: 't-d outline t-lg' }, avg ? avg.toFixed(1) : '-'))),
      h('span', { class: 'spacer' }),
      chip([icon('cards', 's'), h('b', {}, `${deck.length}/${deckSlotCount()}`)], deck.length < deckSlotCount() ? 'warn' : ''));
    const box = h('div', { class: 'panel sk-panel mn-deckbox' }, tabs, grid, foot);
    const parts = [secHead('BATTLE LINEUP', 'blue'), box];
    if (swapId) {
      const d = cardDef(swapId);
      parts.push(h('div', { class: 'mn-swapbar panel sk-panel-gold' },
        h('div', { class: 'mn-swapcard' }, cardEl(swapId, { priority: true })),
        h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.6)' } },
          h('b', { class: 't-d outline t-lg c-gold' }, d.name),
          h('span', { class: 'mn-swap-tip' }, deck.length < deckSlotCount() ? 'Tap an empty slot or a Swarm in your lineup to swap it in!' : 'Tap a Swarm in your lineup to swap it out!'),
          button('CANCEL', cancelSwap, 'red sm', { icon: 'x' }))));
    }
    return parts;
  }

  function collectionSection() {
    const p = state.p;
    const deck = currentDeck();
    const foundAll = ALL_CARDS.filter((c) => p.cards[c.id]);
    const coll = sortCards(foundAll.filter((c) => !deck.includes(c.id)));
    const missing = sortCards(ALL_CARDS.filter((c) => !p.cards[c.id]));
    // sorting chips (segmented): the lit chip is the current order
    const sortBtn = h('div', { class: 'mn-sortchips', role: 'tablist' }, ...SORTS.map((so) => {
      const b = h('button', { class: `mn-sortchip ${so.id === sortMode ? 'on' : ''}`, type: 'button', 'data-tip': so.label },
        icon(so.icon, 's'), h('span', {}, so.short));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (so.id === sortMode) return;
        audio.play('tap');
        sortMode = so.id;
        shell.root.classList.add('mn-resort');
        shell.render();
        setTimeout(() => shell.root.classList.remove('mn-resort'), 700);
      });
      return b;
    }));
    const found = h('div', { class: 'mn-found' },
      h('span', { class: 't-xs c-muted' }, 'Found'),
      h('b', { class: 't-d outline' }, `${foundAll.length}/${ALL_CARDS.length}`));
    const grid = h('div', { class: 'mn-cgrid' });
    coll.forEach((c, i) => {
      const up = upgradeInfo(c.id);
      const cell = h('div', { class: `mn-cc ${up && !up.max && up.ok ? 'can-up' : ''}`, style: { '--i': Math.min(i, 20) } },
        cardEl(c.id, { progress: true, isNew: isCardNew(c.id) }));
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        openPop(cell, c.id, 'coll');
      });
      grid.appendChild(cell);
    });
    const out = [
      h('div', { class: 'mn-sec-row' }, secHead('COLLECTION', 'pink'), h('div', { class: 'mn-coll-tools' }, found)),
      h('div', { class: 'mn-sortrow' }, h('span', { class: 't-d outline mn-sortl' }, 'SORT'), sortBtn,
        h('div', { class: 'mn-collbar' }, h('i', { style: { width: (foundAll.length / ALL_CARDS.length) * 100 + '%' } }))),
    ];
    if (coll.length) out.push(grid);
    else out.push(h('div', { class: 'mn-empty-note' }, 'All your cards are in your deck! Open vials to find more Swarms.'));
    if (missing.length) {
      const mg = h('div', { class: 'mn-cgrid locked' });
      missing.forEach((c) => {
        const ar = arenaById(c.arena);
        const cell = h('div', { class: 'mn-cc lockd' }, cardEl(c.id, { locked: true }),
          h('div', { class: 'mn-cc-arena' }, ar ? `Arena ${ar.index + 1}` : '???'));
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          audio.play('tap');
          openCardInfo(c.id, ctx);
        });
        mg.appendChild(cell);
      });
      out.push(h('div', { class: 'mn-divider' }, h('span', { class: 't-d outline' }, 'NOT FOUND YET'), h('span', { class: 't-xs c-muted' }, 'Unlock arenas on Beast Island to find them in vials')), mg);
    }
    return out;
  }

  function render() {
    pop = null;
    const inner = h('div', { class: `mn-inner ${swapId ? 'is-swapping' : ''}` },
      h('div', { class: 'mn-deckcol' }, ...deckSection()),
      h('div', { class: 'mn-collcol' }, ...collectionSection()));
    return inner;
  }

  shell.render();
  return { dispose: () => shell.dispose(), refresh: () => shell.schedule(40) };
}

/** Number of things to look at in the Cards tab (upgradable + new cards). */
export function cardsBadge() {
  let n = 0;
  for (const id of Object.keys(state.p.cards)) {
    const up = upgradeInfo(id);
    if ((up && !up.max && up.ok) || isCardNew(id)) n++;
  }
  return n;
}
