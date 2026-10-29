// Profile modal: banner header with name/trophies/Lab Level, name editing,
// career stats (wins, losses, bases destroyed, MEGAs, best trophies, cards found,
// favourite card...), banner and Lab skin choice.
import { h, icon, button, modal, sparkle, bump, clear } from '../ui.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { state, labLevel } from '../../game/state.js';
import { ALL_CARDS, cardDef } from '../../data/cards.js';
import { BANNERS, LAB_SKINS } from '../../data/season.js';
import { currentArena, BOSSES, SECRETS } from '../../data/arenas.js';
import { COMMANDERS } from '../../data/commanders.js';
import { rankLabel } from '../rankMedal.js';
import { bannerEl, cmdImg, labBadge, unlockHint, notify, deny, refreshCtx, fmtN, subHead, chip } from './common.js';
import { labSkinImg } from '../thumbs.js';

export const NAME_MAX = 16;
const LAB_TINT = { default: '#29b6f6', martLab: '#ff4fa3', chocoLab: '#8e5a3c', goldVault: '#ffd23f', mansion: '#b05cff' };

function favouriteCard() {
  const s = state.p.stats;
  let best = null, n = 0;
  for (const k in s) {
    if (!k.startsWith('deploy_')) continue;
    const id = k.slice(7);
    if (cardDef(id) && s[k] > n) { n = s[k]; best = id; }
  }
  return best ? { id: best, n } : null;
}

export function openProfile(ctx) {
  const body = h('div', { class: 'mn-prof' });
  const m = modal({ title: 'PROFILE', color: 'blue', size: 'wide', cls: 'mn-profm', body, onClose: () => refreshCtx(ctx) });

  function header() {
    const p = state.p;
    const cmd = p.commanders.equipped;
    const ar = currentArena(p.trophies);
    return bannerEl(p.cosmetics.banner, 'mn-prof-ban',
      h('div', { class: 'mn-prof-hrow' },
        h('div', { class: 'mn-prof-port' }, cmdImg(cmd, p.commanders.owned[cmd]?.skin ?? null, { size: 128 })),
        h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.6)', minWidth: 0 } },
          h('b', { class: 't-d outline mn-prof-name' }, p.name),
          h('div', { class: 'row wrap gap-s' }, chip([icon('trophy', 's'), h('b', {}, fmtN(p.trophies))]), chip([icon('island', 's'), ar.name])),
          h('span', { class: 't-xs outline-sm' }, `Commander: ${COMMANDERS[cmd]?.name ?? '-'}`)),
        h('div', { class: 'col center mn-prof-rank', style: { gap: 0 } }, labBadge(labLevel(), 'big'), rankLabel(labLevel()), h('span', { class: 't-xs t-d outline' }, 'LAB LEVEL'))));
  }

  function nameRow() {
    const p = state.p;
    const input = h('input', { class: 'px-input mn-prof-in', type: 'text', maxlength: String(NAME_MAX), value: p.name, placeholder: 'Your name', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const save = (btn) => {
      const v = input.value.replace(/[^\w .\-!?']/g, '').trim().slice(0, NAME_MAX);
      if (v.length < 2) return deny(ctx, 'Names need at least 2 letters!', btn);
      if (v === p.name) return;
      p.name = v;
      state.emit('profile');
      audio.play('upgrade');
      notify(ctx, `Name changed to *${v}*`, { icon: 'check' });
      render();
      const n = body.querySelector('.mn-prof-name');
      if (n) { sparkle(n, { count: 16 }); bump(n); }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { save(); input.blur(); }
    });
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    const btn = button('SAVE', () => save(btn), 'green', { icon: 'check' });
    return h('div', { class: 'mn-prof-namerow' }, icon('emote', 'l'), input, btn);
  }

  function stats() {
    const p = state.p;
    const s = p.stats;
    const found = ALL_CARDS.filter((c) => p.cards[c.id]).length;
    const rate = s.battles ? Math.round((s.wins / s.battles) * 100) : 0;
    const fav = favouriteCard();
    const tile = (ic, label, val, cls = '') => h('div', { class: 'mn-pst ' + cls }, icon(ic, 'mn-st-ic'), h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, label), h('b', { class: 'mn-st-v t-d outline' }, val)));
    const favEl = h('div', { class: 'mn-pst fav' },
      fav ? cardEl(fav.id, { size: 'mini', noLevel: true, cost: false }) : icon('heart', 'mn-st-ic'),
      h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, 'Favorite Card'), h('b', { class: 'mn-st-v t-d outline' }, fav ? cardDef(fav.id).name : '-'), fav ? h('span', { class: 'mn-st-l' }, `Deployed ${fmtN(fav.n)} times`) : h('span', { class: 'mn-st-l' }, 'Play some battles!')));
    return h('div', { class: 'mn-pstats' },
      tile('check', 'Wins', fmtN(s.wins)),
      tile('x', 'Losses', fmtN(s.losses)),
      tile('lab', 'Bases Destroyed', fmtN(s.basesDestroyed ?? 0)),
      tile('mega', 'MEGAs Used', fmtN(s.megasUsed ?? 0)),
      tile('trophy', 'Best Trophies', fmtN(p.bestTrophies)),
      tile('cards', 'Cards Found', `${found}/${ALL_CARDS.length}`),
      tile('swords', 'Battles', fmtN(s.battles)),
      tile('star', 'Win Rate', rate + '%'),
      tile('fire', 'Best Win Streak', fmtN(s.bestStreak ?? 0)),
      tile('vial', 'Vials Opened', fmtN(s.vialsOpened)),
      tile('boss', 'Bosses Beaten', `${Object.keys(p.bosses).length}/${Object.keys(BOSSES).length}`),
      tile('eye', 'Secrets Found', `${Object.keys(p.secrets).length}/${Object.keys(SECRETS).length}`),
      favEl);
  }

  function banners() {
    const p = state.p;
    const grid = h('div', { class: 'mn-bans' });
    for (const [id, b] of Object.entries(BANNERS)) {
      const have = p.cosmetics.banners.includes(id);
      const sel = p.cosmetics.banner === id;
      const t = h('div', { class: `mn-banopt ${have ? '' : 'lock'} ${sel ? 'sel' : ''}` },
        bannerEl(id, 'mn-banopt-b', h('span', { class: 't-d outline' }, b.name)),
        h('div', { class: 'mn-banopt-m' },
          b.animated ? chip('ANIMATED', 'anim') : null,
          h('span', { class: 'spacer' }),
          have ? (sel ? h('span', { class: 'c-green row gap-s' }, icon('check', 's'), 'Equipped') : h('span', { class: 'c-muted' }, 'Owned')) : h('span', { class: 'c-gold row gap-s' }, icon('lock', 's'), unlockHint('banner', id))));
      t.addEventListener('click', () => {
        if (!have) return deny(ctx, `Locked: ${unlockHint('banner', id)}`);
        if (sel) return;
        p.cosmetics.banner = id;
        state.emit('profile');
        audio.play('magic');
        render();
        const ban = body.querySelector('.mn-prof-ban');
        if (ban) sparkle(ban, { count: 20 });
      });
      grid.appendChild(t);
    }
    return grid;
  }

  function labSkins() {
    const p = state.p;
    const grid = h('div', { class: 'mn-labskins' });
    for (const [id, l] of Object.entries(LAB_SKINS)) {
      const have = p.cosmetics.labSkins.includes(id);
      const sel = p.cosmetics.labSkin === id;
      const t = h('div', { class: `mn-pk ${sel ? 'sel' : ''} ${have ? '' : 'lock'}` },
        h('div', { class: 'mn-pk-art mn-labskin-art', style: { '--lt': LAB_TINT[id] ?? '#5a628a' } }, labSkinImg(id, 160, 'smooth mn-labskin-3d'), have ? null : icon('lock', 'mn-pk-lock')),
        h('div', { class: 'mn-pk-n' }, l.name),
        h('div', { class: 'mn-pk-s' }, have ? (sel ? 'Equipped' : l.desc) : unlockHint('labSkin', id)),
        sel ? h('div', { class: 'mn-pk-tick' }, icon('check', 's')) : null);
      t.addEventListener('click', () => {
        if (!have) return deny(ctx, `Locked: ${unlockHint('labSkin', id)}`);
        if (sel) return;
        p.cosmetics.labSkin = id;
        state.emit('labSkin');
        audio.play('magic');
        render();
      });
      grid.appendChild(t);
    }
    return grid;
  }

  function render() {
    const st = m.body.scrollTop;
    clear(body);
    body.append(header(), nameRow(), subHead('CAREER'), stats(), subHead('BANNERS', h('span', { class: 't-xs c-muted' }, 'Shown to opponents before battle')), banners(), subHead('LAB SKIN', h('span', { class: 't-xs c-muted' }, 'Your Lab in battle')), labSkins());
    m.body.scrollTop = st;
  }
  render();
  return m;
}
