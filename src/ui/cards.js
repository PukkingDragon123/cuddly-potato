// Game card component (Clash Royale style): 3D-rendered portrait inside a
// rarity-coloured pixel frame, energy-drop cost badge, level band and the
// copies progress bar that turns green with a bouncing arrow when the card
// can be upgraded.
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
  const el = h('div', {
    class: `gcard ${rarity} ${isSpell(id) ? 'spell' : ''} ${locked ? 'locked' : ''} ${opts.size ?? ''} ${opts.cls ?? ''}`,
    style: { '--rc': `var(--r-${rarity})` },
    'data-card': id,
  });
  el.appendChild(h('div', { class: 'art' }, cardArtImg(id, variant, skin, artSize, '', { priority: opts.priority })));
  el.appendChild(h('div', { class: `frame sk-card-${locked ? 'locked' : rarity}` }));
  if (opts.cost !== false) {
    el.appendChild(h('div', { class: 'cost', style: { backgroundImage: `url(${iconURL('energy')})` } }, String(def.elixir ?? '?')));
  }
  if (variant !== 'base' && VARIANTS[variant]) el.appendChild(icon(variant === 'chrome' ? 'chrome' : variant === 'gold' ? 'star' : 'chrome', 'shiny'));
  if (!opts.noLevel) {
    const lvl = opts.level ?? own?.level;
    if (locked) el.appendChild(h('div', { class: 'lvl' }, icon('lock', 's')));
    else if (lvl) el.appendChild(h('div', { class: `lvl ${lvl >= 10 ? 'max' : ''}` }, lvl >= 10 ? 'MAX' : `Level ${lvl}`));
  }
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

/** Rarity display helpers. */
export const RARITY_CSS = { common: 'var(--r-common)', rare: 'var(--r-rare)', epic: 'var(--r-epic)', legendary: 'var(--r-legendary)', mythic: 'var(--r-mythic)' };
