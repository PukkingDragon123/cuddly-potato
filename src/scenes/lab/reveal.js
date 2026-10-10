// Full-screen reward reveal cards (tap to continue).
import { h, icon, $overlay } from '../../ui/ui.js';
import { swarmThumb, charPortrait } from '../../ui/thumbs.js';
import { SWARMS, RARITIES, SERIES, VARIANTS } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { COMMANDERS } from '../../data/commanders.js';
import { audio } from '../../core/audio.js';
import { animate } from '../../core/tween.js';
import { fmt } from '../../core/util.js';

/**
 * item: {kind:'swarm', id, copies, variant, isNew, newVariant}
 *     | {kind:'coins'|'bucks', amount} | {kind:'spell', id} | {kind:'commander', id} | {kind:'custom', title, img, desc}
 */
export function revealCard(item, opts = {}) {
  return new Promise((resolve) => {
    let ray = 'rgba(255,255,255,0.14)';
    let card;
    if (item.kind === 'swarm') {
      const s = SWARMS[item.id];
      const r = RARITIES[s.rarity];
      ray = r.color + '44';
      const badges = [];
      if (item.isNew) badges.push(h('span', { class: 'new' }, 'NEW!'));
      if (item.variant && item.variant !== 'base') badges.push(h('span', { class: 'shiny' }, `${VARIANTS[item.variant].name.toUpperCase()} SHINY!`));
      if (item.copies > 1 || !item.isNew) badges.push(h('span', { class: 'copies' }, `+${item.copies ?? 1} cop${(item.copies ?? 1) > 1 ? 'ies' : 'y'}`));
      card = h('div', { class: `reveal-card card ${s.rarity} bounce-in` },
        h('img', { class: 'big-img', src: swarmThumb(item.id, item.variant ?? 'base', null, 160) }),
        h('div', { class: 'rname outline-sm' }, s.name),
        h('div', { class: 'row center wrap' }, h('span', { class: `rarity-tag ${s.rarity}` }, r.name), h('span', { class: 'small', style: { color: SERIES[s.series].color } }, SERIES[s.series].name)),
        h('div', { class: 'reveal-badges' }, badges),
        h('div', { class: 'rdesc' }, s.desc));
      if (r.order >= 2) audio.jingle('rare');
      else audio.play('magic');
      if (item.variant && item.variant !== 'base') audio.play('shatter');
    } else if (item.kind === 'coins' || item.kind === 'bucks') {
      const num = h('span', {}, '0');
      card = h('div', { class: 'reveal-card px-box cream bounce-in' },
        h('div', { class: 'reveal-coins outline-sm' }, icon(item.kind === 'coins' ? 'coin' : 'bucks'), num),
        h('div', { class: 'rname', style: { color: 'var(--ink)' } }, item.kind === 'coins' ? 'Beast Coins' : 'Beast Bucks'),
        h('div', { class: 'rdesc' }, item.kind === 'coins' ? 'Use them to upgrade your Swarms.' : 'Premium currency for vials, skips and the Feast Pass.'));
      ray = 'rgba(255,210,63,0.3)';
      let last = 0;
      animate(0.9, (e) => {
        const v = Math.round(item.amount * e);
        num.textContent = fmt(v);
        if (v - last >= Math.max(1, item.amount / 12)) { last = v; audio.play('coin', { gap: 0.04 }); }
      }, { ease: 'outCubic' });
    } else if (item.kind === 'spell') {
      const sp = SPELLS[item.id];
      ray = sp.color + '55';
      card = h('div', { class: 'reveal-card px-box bounce-in', style: { background: sp.color } },
        h('div', { class: 'tiny display outline-sm' }, 'NEW SPELL!'),
        h('img', { class: 'big-img', src: iconBig(sp.icon), style: { width: '55%' } }),
        h('div', { class: 'rname outline-sm' }, sp.name),
        h('div', { class: 'rdesc outline-sm' }, sp.desc),
        h('div', { class: 'row center small outline-sm' }, icon('energy'), `${sp.cost} energy`));
      audio.jingle('unlock');
    } else if (item.kind === 'commander') {
      const c = COMMANDERS[item.id];
      ray = 'rgba(255,46,136,0.3)';
      card = h('div', { class: 'reveal-card px-box bounce-in' },
        h('div', { class: 'tiny display gold' }, 'NEW COMMANDER!'),
        h('img', { class: 'big-img', src: charPortrait(c.char, { size: 160, eyes: 'happy', mouth: 'grin' }) }),
        h('div', { class: 'rname outline-sm' }, c.name),
        h('div', { class: 'rdesc' }, `Signature: ${c.signature.name} - ${c.signature.desc}`));
      audio.jingle('rare');
    } else {
      card = h('div', { class: 'reveal-card px-box bounce-in' },
        item.title ? h('div', { class: 'rname outline-sm' }, item.title) : null,
        item.img ? h('img', { class: 'big-img', src: item.img }) : null,
        item.desc ? h('div', { class: 'rdesc' }, item.desc) : null);
      audio.jingle('unlock');
    }
    const rays = h('div', { class: 'reveal-rays', style: { '--ray': ray } });
    rays.style.setProperty('--ray', ray);
    const back = h('div', { class: 'reveal-back fade-in' + (opts.side ? ' side' : '') }, rays, h('div', { class: 'reveal-col' }, card, h('div', { class: 'reveal-tap outline-sm' }, opts.tapText ?? 'Tap to continue')));
    $overlay().appendChild(back);
    const t0 = performance.now();
    back.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (performance.now() - t0 < 450) return;
      audio.play('tap');
      back.remove();
      resolve();
    });
  });
}

const bigIconCache = {};
function iconBig(name) {
  if (bigIconCache[name]) return bigIconCache[name];
  const img = icon(name);
  bigIconCache[name] = img.src;
  return img.src;
}
