// Game card component (premium collectible style): the 3D-rendered portrait
// on a lit specimen stage (rarity spotlight, pixel sunburst, pedestal) inside
// an ornate HD rarity frame (corner brackets / cut gems grow with rarity), a
// faceted POWER cost gem, a rarity crest gem, a name banner, a folded level
// ribbon, an idle shine sweep, holo foil for shiny variants and SPECIAL cards,
// and the copies progress bar that turns green with a bouncing arrow when the
// card can be upgraded.
import { h, icon, iconURL, bar } from './ui.js';
import { cardArtImg } from './thumbs.js';
import { cardDef, isSpell } from '../data/cards.js';
import { VARIANTS } from '../data/swarms.js';
import { state, upgradeInfo } from '../game/state.js';

/**
 * cardEl(id, opts)
 * opts: { size: ''|'mini'|'big', level, variant, skin, owned (default from profile), progress (bool),
 *         cost (bool, default true), locked, onClick, cls, artSize, noLevel, isNew }
 */
export function cardEl(id, opts = {}) {
  const def = cardDef(id);
  if (!def) return h('div', { class: 'gcard' });
  const own = opts.owned ?? state.p.cards?.[id] ?? null;
  const locked = opts.locked ?? !own;
  const rarity = def.rarity ?? 'common';
  const variant = opts.variant ?? own?.variant ?? 'base';
  const skin = opts.skin ?? own?.skin ?? null;
  const artSize = opts.artSize ?? (opts.size === 'big' ? 256 : 160);
  const shiny = variant !== 'base' && VARIANTS[variant];
  const el = h('div', {
    class: `gcard ${rarity} ${isSpell(id) ? 'spell' : ''} ${def.special ? 'special' : ''} ${locked ? 'locked' : ''} ${shiny ? 'foil v-' + variant : ''} ${opts.size ?? ''} ${opts.cls ?? ''}`,
    style: { '--rc': `var(--r-${rarity})`, '--sc': def.color ?? '#3ff2e0', '--nl': Math.max(6, (def.name ?? '').length), '--sd': `${-(hashDelay(id))}s` },
    'data-card': id,
  });
  el.appendChild(h('div', { class: 'art' }, h('i', { class: 'stage' }), cardArtImg(id, variant, skin, artSize, '', { priority: opts.priority }), shiny ? h('i', { class: 'foil-fx' }) : null));
  el.appendChild(h('div', { class: `frame sk-card-${locked ? 'locked' : rarity}` }));
  if (!locked) el.appendChild(h('i', { class: 'sheen' }));
  if (!locked && opts.size !== 'mini') el.appendChild(h('img', { class: 'rgem', src: iconURL('rarity_' + rarity), alt: '', draggable: 'false' }));
  if (opts.cost !== false) {
    el.appendChild(h('div', { class: 'cost' }, h('span', {}, String(def.elixir ?? '?'))));
  }
  if (def.special && opts.size !== 'mini') {
    const kw = def.keywords?.[0] ?? 'SPECIAL';
    el.appendChild(h('div', { class: 'sp-tag', style: { '--kl': Math.max(6, kw.length) } }, kw));
  }
  if (shiny) el.appendChild(icon(variant === 'chrome' ? 'chrome' : variant === 'gold' ? 'star' : 'chrome', 'shiny'));
  // foot: name banner over the stage floor + the level ribbon under it
  const foot = h('div', { class: 'foot' });
  if (def.name && opts.size !== 'mini') foot.appendChild(h('div', { class: 'nm' }, h('span', {}, def.name)));
  if (!opts.noLevel) {
    const lvl = opts.level ?? own?.level;
    if (locked) foot.appendChild(h('div', { class: 'lvl' }, icon('lock', 's')));
    else if (lvl) foot.appendChild(h('div', { class: `lvl ${lvl >= 10 ? 'max' : ''}` }, lvl >= 10 ? 'MAX' : `Level ${lvl}`));
  }
  if (foot.firstChild) el.appendChild(foot);
  if (opts.progress && own) {
    const up = upgradeInfo(id);
    if (up && !up.max) {
      const ready = up.enoughCopies;
      const b = bar(Math.min(1, up.haveCopies / up.copies), ready ? 'green' : 'blue', `${up.haveCopies}/${up.copies}`, { cls: 'copies' + (ready ? ' ready' : '') });
      if (ready) b.appendChild(icon('up', 'up'));
      el.appendChild(b);
    } else if (up?.max) {
      el.appendChild(bar(1, 'gold', 'MAX', { cls: 'copies' }));
    }
  }
  if (opts.isNew) el.appendChild(h('div', { class: 'new-tag', style: { right: '-4%', top: '-3%' } }, 'NEW!'));
  if (opts.onClick) el.addEventListener('click', (e) => opts.onClick(e, el));
  return el;
}

/** Stable per-card offset for the idle shine so a grid of cards doesn't flash in unison. */
function hashDelay(id) {
  let x = 0;
  for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) % 997;
  return ((x % 70) / 10).toFixed(1);
}

/** Rarity display helpers. */
export const RARITY_CSS = { common: 'var(--r-common)', rare: 'var(--r-rare)', epic: 'var(--r-epic)', legendary: 'var(--r-legendary)', mythic: 'var(--r-mythic)' };
