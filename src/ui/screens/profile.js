// Profile: name, banner, lab skin and career stats.
import { h, icon, button, toast } from '../ui.js';
import { audio } from '../../core/audio.js';
import { state } from '../../game/state.js';
import { BANNERS, LAB_SKINS } from '../../data/season.js';
import { CMD_LEVEL_REWARDS } from '../../data/commanders.js';
import { SECRETS, BOSSES, currentArena } from '../../data/arena.js';
import { COLLECTABLE } from '../../data/swarms.js';
import { makeScreen, bannerEl, sectionTitle, fmt, unlockHint, deny, sparkle, charImg } from './common.js';

export const NAME_MAX = 16;

function bannerHint(id) {
  const ph = unlockHint('banner', id);
  if (ph) return ph;
  const L = Object.keys(CMD_LEVEL_REWARDS).find((k) => CMD_LEVEL_REWARDS[k].banner === id);
  if (L) return `Commander level ${L}`;
  if (Object.values(SECRETS).some((s) => s.reward?.banner === id)) return 'Find a secret...';
  if (Object.values(BOSSES).some((b) => b.reward?.banner === id)) return 'Defeat a boss';
  return 'Special event';
}
function labHint(id) {
  return unlockHint('labSkin', id) ?? 'Special event';
}

export function openProfile(hub, opts = {}) {
  return makeScreen(hub, {
    name: 'profile',
    title: 'PROFILE',
    color: 'blue',
    size: 'mid',
    cls: 'sc-profile',
    tabs: [
      { id: 'me', label: 'Profile', icon: 'star' },
      { id: 'banners', label: 'Banners', icon: 'flag' },
      { id: 'lab', label: 'Lab Skins', icon: 'flask' },
    ],
    tab: opts.tab ?? 'me',
    render(scr) {
      if (scr.tab === 'banners') return renderBanners();
      if (scr.tab === 'lab') return renderLab();
      return renderMe(scr);
    },
  });
}

function renderMe() {
  const p = state.p;
  const root = h('div', { class: 'col' });
  const card = bannerEl(p.cosmetics.banner, 'hub-profile-card',
    h('div', { class: 'pf-portrait' }, charImg('recruit', { size: 128 })),
    h('div', { class: 'col grow' },
      h('b', { class: 'display outline pf-name' }, p.name),
      h('span', { class: 'row outline-sm' }, icon('trophy'), h('b', {}, fmt(p.trophies)), h('span', { class: 'small' }, ` · Best ${fmt(p.bestTrophies)}`)),
      h('span', { class: 'small outline-sm' }, currentArena(p.trophies).name),
    ),
  );
  root.appendChild(card);

  // name editor
  const input = h('input', { class: 'px-input', type: 'text', maxlength: String(NAME_MAX), value: p.name, placeholder: 'Your name', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
  const save = () => {
    const v = input.value.replace(/[^\w .\-!?']/g, '').trim().slice(0, NAME_MAX);
    if (!v) return deny('Name cannot be empty');
    if (v === p.name) return;
    p.name = v;
    state.emit('profile');
    audio.play('upgrade');
    toast(`Name changed to *${v}*`, { icon: 'check' });
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      save();
      input.blur();
    }
  });
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.appendChild(sectionTitle('NAME'));
  root.appendChild(h('div', { class: 'row hub-name-row' }, input, button('Save', save, 'green', { icon: 'check' })));

  // stats
  const s = p.stats;
  const found = Object.keys(p.swarms).filter((id) => COLLECTABLE.some((c) => c.id === id)).length;
  const winRate = s.battles ? Math.round((s.wins / s.battles) * 100) : 0;
  const stat = (ic, label, val) => h('div', { class: 'hub-pstat px-box dark' }, icon(ic), h('div', { class: 'col' }, h('span', { class: 'tiny muted' }, label), h('b', {}, val)));
  root.appendChild(sectionTitle('CAREER'));
  root.appendChild(
    h('div', { class: 'hub-pstats' },
      stat('trophy', 'Best trophies', fmt(p.bestTrophies)),
      stat('sword', 'Battles', fmt(s.battles)),
      stat('check', 'Wins', fmt(s.wins)),
      stat('x', 'Losses', fmt(s.losses)),
      stat('star', 'Win rate', winRate + '%'),
      stat('vial', 'Vials opened', fmt(s.vialsOpened)),
      stat('swarm', 'Swarms found', `${found}/${COLLECTABLE.length}`),
      stat('skull', 'Bosses beaten', `${Object.keys(p.bosses).length}/${Object.keys(BOSSES).length}`),
      stat('magic', 'Secrets found', `${Object.keys(p.secrets).length}/${Object.keys(SECRETS).length}`),
      stat('energy', 'Troops deployed', fmt(s.deployed)),
    ),
  );
  return root;
}

function renderBanners() {
  const p = state.p;
  const root = h('div', { class: 'col' });
  root.appendChild(h('div', { class: 'small muted' }, 'Your banner shows on your profile and to opponents before battle. Animated banners move!'));
  const grid = h('div', { class: 'hub-banner-grid' });
  for (const [id, b] of Object.entries(BANNERS)) {
    const have = p.cosmetics.banners.includes(id);
    const sel = p.cosmetics.banner === id;
    const tile = h('div', { class: `hub-banner-opt ${have ? '' : 'locked'} ${sel ? 'sel' : ''}` },
      bannerEl(id, 'opt', h('b', { class: 'outline-sm' }, b.name)),
      h('div', { class: 'row tiny meta' }, b.animated ? h('span', { class: 'hub-chip pinkbg' }, 'ANIMATED') : null, b.season ? h('span', { class: 'hub-chip' }, 'S' + b.season) : null, h('span', { class: 'spacer' }), have ? (sel ? h('span', { class: 'greent row' }, icon('check', 'ic-xs'), 'Equipped') : h('span', { class: 'muted' }, 'Owned')) : h('span', { class: 'gold row' }, icon('lock', 'ic-xs'), bannerHint(id))),
    );
    tile.addEventListener('click', () => {
      if (!have) return deny(`Locked: ${bannerHint(id)}`);
      if (sel) return;
      p.cosmetics.banner = id;
      state.emit('profile');
      audio.play('magic');
      requestAnimationFrame(() => sparkle(tile, { count: 12 }));
    });
    grid.appendChild(tile);
  }
  root.appendChild(grid);
  return root;
}

function renderLab() {
  const p = state.p;
  const root = h('div', { class: 'col' });
  root.appendChild(h('div', { class: 'small muted' }, 'Lab skins change how your Lab looks in the hub and in battle.'));
  const grid = h('div', { class: 'hub-lab-grid' });
  const tint = { default: '#29b6f6', martLab: '#ff4fa3', chocoLab: '#8e5a3c', goldVault: '#ffd23f' };
  for (const [id, l] of Object.entries(LAB_SKINS)) {
    const have = p.cosmetics.labSkins.includes(id);
    const sel = p.cosmetics.labSkin === id;
    const tile = h('div', { class: `hub-lab-opt px-box ${have ? 'light' : 'dark locked'} ${sel ? 'sel' : ''}` },
      h('div', { class: 'lab-art', style: { background: tint[id] ?? '#5a628a' } }, h('div', { class: 'lab-bld' }, h('i'), h('i'), h('i')), icon(have ? 'flask' : 'lock')),
      h('b', {}, l.name),
      h('span', { class: 'tiny muted' }, l.desc),
      h('span', { class: 'tiny ' + (have ? (sel ? 'greent' : 'muted') : 'gold') }, have ? (sel ? 'Equipped' : 'Owned') : labHint(id)),
    );
    tile.addEventListener('click', () => {
      if (!have) return deny(`Locked: ${labHint(id)}`);
      if (sel) return;
      p.cosmetics.labSkin = id;
      state.emit('labSkin');
      audio.play('magic');
      requestAnimationFrame(() => sparkle(tile, { count: 14 }));
    });
    grid.appendChild(tile);
  }
  root.appendChild(grid);
  return root;
}
