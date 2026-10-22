// Entrance animation art (NEW CARD cutscene cosmetics): a mini movie-poster
// tile with the entrance's colour, spotlight rays, a clapperboard stripe and a
// little looping CSS animation of the move. Used by the shop, the pass and
// reward popups (common.js rewardArt), and the vial-opening cutscene.
import './entranceArt.css';
import { h, icon } from './ui.js';
import { entranceDef } from '../data/entrances.js';

export function entranceArt(id, cls = '') {
  const e = entranceDef(id);
  return h('div', { class: `ent-art ent-${e.id} ${cls}`, style: { '--ec': e.color } },
    h('div', { class: 'ent-rays' }),
    h('div', { class: 'ent-clap' }),
    h('div', { class: 'ent-floor' }),
    h('div', { class: 'ent-fx' }),
    h('div', { class: 'ent-hero' }, icon(e.icon ?? 'star', 'ent-ic')));
}
