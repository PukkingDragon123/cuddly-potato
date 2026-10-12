// Boss challenge modal: who/where, boss art, description, recommended level,
// boss HP, enemy deck, first-clear rewards and status, FIGHT button
// (ctx.battle({ mode: 'boss', bossId })).
import { h, icon, button, modal } from '../ui.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { state, cardLevel, currentDeck } from '../../game/state.js';
import { BOSSES, arenaById } from '../../data/arenas.js';
import { COMMANDERS } from '../../data/commanders.js';
import { rewardTile, rewardLabel, swarmImg, charFullImg, chip, subHead, fmtN, refreshCtx } from './common.js';

function bundleList(b) {
  const out = [];
  if (!b) return out;
  if (b.commander) out.push({ type: 'commander', id: b.commander });
  if (b.card) out.push({ type: 'card', id: b.card });
  if (b.vial) out.push({ type: 'vial', id: b.vial });
  if (b.coins) out.push({ type: 'coins', amount: b.coins });
  if (b.bucks) out.push({ type: 'bucks', amount: b.bucks });
  if (b.calories) out.push({ type: 'calories', amount: b.calories });
  if (b.banner) out.push({ type: 'banner', id: b.banner });
  return out;
}

export function openBoss(bossId, ctx) {
  const b = BOSSES[bossId];
  if (!b) return null;
  const p = state.p;
  const ar = arenaById(b.arena);
  const wins = p.bosses[bossId] ?? 0;
  const locked = p.bestTrophies < b.minTrophies;
  const deck = currentDeck();
  const avgLv = deck.length ? deck.reduce((a, id) => a + cardLevel(id), 0) / deck.length : 1;
  const ready = avgLv >= b.level;

  const art = h('div', { class: 'mn-boss-art', style: { '--ac': ar?.color ?? '#ff4a4a' } },
    h('div', { class: 'mn-boss-rays' }),
    b.boss ? swarmImg(b.boss, 'base', null, 256, 'mn-boss-img') : charFullImg('jimmyBoss', { w: 220, h: 260, pose: 'victory', mouth: 'grin' }, 'mn-boss-img'),
    h('div', { class: 'mn-boss-tag t-d' }, icon('boss', 's'), 'BOSS'),
    wins ? h('div', { class: 'mn-boss-won t-d outline' }, icon('check', 's'), wins > 1 ? `BEATEN x${wins}` : 'BEATEN') : null);
  const info = h('div', { class: 'mn-boss-info' },
    h('div', { class: 'row wrap gap-s' }, chip([icon('island', 's'), ar?.name ?? b.arena]), b.commander ? chip([icon('crown', 's'), `Commander: ${COMMANDERS[b.commander]?.name}`]) : null),
    h('div', { class: 'mn-ci-desc' }, b.desc),
    h('div', { class: 'mn-boss-stats' },
      h('div', { class: 'mn-st' }, icon('star', 'mn-st-ic'), h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, 'Recommended Level'), h('b', { class: `mn-st-v t-d outline ${ready ? '' : 'warn'}` }, `LV ${b.level}`))),
      b.bossHp ? h('div', { class: 'mn-st' }, icon('hp', 'mn-st-ic'), h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, 'Boss Hitpoints'), h('b', { class: 'mn-st-v t-d outline' }, fmtN(b.bossHp)))) : null,
      h('div', { class: 'mn-st' }, icon('lab', 'mn-st-ic'), h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, 'Enemy Lab Level'), h('b', { class: 'mn-st-v t-d outline' }, String(b.level + 1)))),
      h('div', { class: 'mn-st' }, icon('cards', 'mn-st-ic'), h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, 'Your Deck (avg.)'), h('b', { class: `mn-st-v t-d outline ${ready ? 'ok' : 'warn'}` }, `LV ${avgLv.toFixed(1)}`)))));
  const deckRow = h('div', { class: 'mn-boss-deck' }, ...b.deck.map((id) => cardEl(id, { size: 'mini', level: b.level, locked: false, owned: { level: b.level }, artSize: 128 })));
  const first = bundleList(b.reward);
  const rew = h('div', { class: 'mn-boss-rew' },
    ...first.map((r) => h('div', { class: `mn-boss-rw ${wins ? 'got' : ''}` }, rewardTile(r), h('span', { class: 'mn-boss-rwn' }, rewardLabel(r)), wins ? h('div', { class: 'mn-ptile-ck' }, icon('check')) : null)));
  const body = h('div', { class: 'mn-boss' },
    h('div', { class: 'mn-boss-top' }, art, info),
    subHead('BOSS DECK', h('span', { class: 't-xs c-muted' }, `All cards level ${b.level}`)), deckRow,
    subHead(wins ? 'FIRST CLEAR REWARDS (CLAIMED)' : 'FIRST CLEAR REWARDS', h('span', { class: 't-xs c-muted' }, `Repeat wins: ${fmtN(Math.round((b.reward.coins ?? 300) * 0.25))} coins`)), rew);
  const fight = locked
    ? h('div', { class: 'mn-boss-locked' }, icon('lock'), h('span', {}, h('b', {}, `Reach ${fmtN(b.minTrophies)} trophies`), ' to challenge this boss.'))
    : button(wins ? 'REMATCH' : 'FIGHT!', () => {
      audio.play('roar');
      m.close();
      ctx.battle?.({ mode: 'boss', bossId });
    }, 'red xl shine', { icon: 'swords', sound: 'tap' });
  const m = modal({ title: b.name.toUpperCase(), color: 'red', size: 'wide', cls: 'mn-bossm', body, foot: fight, onClose: () => refreshCtx(ctx) });
  return m;
}
