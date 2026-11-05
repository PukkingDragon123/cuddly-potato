// Profile modal: your PLAYER CARD (banner + picture in its frame + name + title + rank medal),
// the CUSTOMIZE panel (PICTURE / FRAME / BANNER / TITLE tabs: tap something you own to wear it,
// tap something locked to try it on the card and see how to get it), name editing, career
// stats and the Lab skin.
import './profile.css';
import { h, icon, button, modal, sparkle, bump, clear, rich, bar } from '../ui.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { state, labLevel, equipLook } from '../../game/state.js';
import { ALL_CARDS, cardDef } from '../../data/cards.js';
import { BANNERS, LAB_SKINS } from '../../data/season.js';
import { currentArena, BOSSES, SECRETS } from '../../data/arenas.js';
import { AVATARS, FRAMES, TITLES, ownsItem, itemProgress, howToGet, MASTERY_CARDS, MASTERY_NAMES, profileShopOffers } from '../../data/profileItems.js';
import { featureUnlocked, featureHint } from '../../game/progression.js';
import { rankLabel } from '../rankMedal.js';
import { avatarEl, titleName } from '../avatar.js';
import { bannerEl, labBadge, unlockHint, notify, deny, refreshCtx, fmtN, subHead, chip, segTabs } from './common.js';
import { labSkinImg } from '../thumbs.js';

export const NAME_MAX = 16;
const LAB_TINT = { default: '#29b6f6', martLab: '#ff4fa3', chocoLab: '#8e5a3c', goldVault: '#ffd23f', mansion: '#b05cff' };
const RAR_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };
let lastTab = 'avatar';

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

// ---------------------------------------------------------------------------
// what's wearable (banners use the season.js list; pictures / frames / titles use profileItems)

const owns = (kind, id) => (kind === 'banner' ? state.p.cosmetics.banners.includes(id) : ownsItem(state.p, kind, id));
const equipped = (kind) => state.p.cosmetics[kind];
const nameOf = (kind, id) => (kind === 'avatar' ? AVATARS[id]?.name : kind === 'frame' ? FRAMES[id]?.name : kind === 'title' ? TITLES[id]?.name : BANNERS[id]?.name) ?? '';
const defsOf = (kind) => (kind === 'avatar' ? AVATARS : kind === 'frame' ? FRAMES : kind === 'title' ? TITLES : BANNERS);
/** The mastery card behind an item (troop pictures, frames, banners, titles), or null. */
function masteryCard(kind, id) {
  if (kind === 'banner') return BANNERS[id]?.troop ?? null;
  const it = defsOf(kind)[id];
  return it?.get?.mastery ?? null;
}
/** Full how-to-get line. */
function howTo(kind, id) {
  if (kind === 'banner') {
    const b = BANNERS[id];
    return b?.troop ? `${cardDef(b.troop)?.name ?? 'Troop'} Mastery: Platinum` : unlockHint('banner', id);
  }
  const g = defsOf(kind)[id]?.get;
  if (g?.cmdSkin) return `${howToGet(kind, id)}: ${unlockHint('cmdSkin', g.cmdSkin)}`;
  return howToGet(kind, id);
}
/** Tile-sized hint (a few words). */
function bannerShort(full) {
  const cl = full.match(/^Commander level (\d+)/);
  if (cl) return `Commander Lv ${cl[1]}`;
  if (/^Food Pass/.test(full)) return 'Food Pass';
  if (/^Trophy Road/.test(full)) return 'Trophy Road';
  if (/secret/.test(full)) return 'Island secret';
  if (/boss/i.test(full)) return 'Boss reward';
  return 'Featured shop';
}
function shortHow(kind, id) {
  const mc = masteryCard(kind, id);
  if (mc) return `${MASTERY_NAMES[(kind === 'banner' ? 4 : defsOf(kind)[id].get.level) - 1]} mastery`;
  if (kind === 'banner') return bannerShort(unlockHint('banner', id));
  const g = defsOf(kind)[id]?.get ?? {};
  if (g.shop) return "Lonan's shop";
  if (g.lab) return `Lab Level ${g.lab}`;
  if (g.trophies) return `${fmtN(g.trophies)} trophies`;
  if (g.bosses) return `${g.bosses} bosses`;
  if (g.stat) return howToGet(kind, id);
  if (g.cmd) return 'Commander';
  if (g.cmdSkin) return 'Outfit';
  return 'Locked';
}

const inShopToday = (kind, id) => kind !== 'banner' && profileShopOffers().some((o) => o.kind === kind && o.id === id);

// ---------------------------------------------------------------------------

export function openProfile(ctx) {
  const body = h('div', { class: 'mn-prof pf' });
  const m = modal({ title: 'PROFILE', color: 'blue', size: 'wide', cls: 'mn-profm pf-modal', body, onClose: () => refreshCtx(ctx) });
  let tab = lastTab;
  let preview = null; // { kind, id }: a locked item being tried on
  let sel = null; // { kind, id }: the item the info bar talks about
  let card = null, info = null, gridHost = null;

  // ------------------------------------------------------------------ player card (live preview)
  const look = () => {
    const c = state.p.cosmetics;
    const l = { avatar: c.avatar, frame: c.frame, banner: c.banner, title: c.title };
    if (preview) l[preview.kind] = preview.id;
    return l;
  };
  function playerCard() {
    const p = state.p;
    const l = look();
    const ar = currentArena(p.trophies);
    const av = avatarEl(l.avatar, l.frame, { cls: 'pf-av' });
    const ttl = titleName(l.title);
    const el = bannerEl(l.banner, 'pf-card',
      h('div', { class: 'pf-card-row' },
        h('div', { class: 'pf-card-av' }, av, preview ? h('div', { class: 'pf-tryon t-d' }, icon('eye', 's'), 'TRY ON') : null),
        h('div', { class: 'pf-card-txt' },
          h('b', { class: 't-d outline pf-name' }, p.name),
          ttl ? h('span', { class: 't-d pf-title' }, ttl) : null,
          h('div', { class: 'row wrap gap-s pf-chips' }, chip([icon('trophy', 's'), h('b', {}, fmtN(p.trophies))]), chip([icon('island', 's'), `Arena ${ar.index + 1}`]))),
        h('div', { class: 'col center pf-rank' }, labBadge(labLevel(), 'big'), rankLabel(labLevel()))));
    el.dataset.guide = 'profile-card';
    el._av = av;
    return el;
  }
  function redrawCard(fx = false) {
    const fresh = playerCard();
    if (card?.parentNode) card.replaceWith(fresh);
    card = fresh;
    if (fx) { sparkle(card.querySelector('.pf-card-av') ?? card, { count: 18 }); bump(card.querySelector('.pf-av') ?? card); }
  }

  // ------------------------------------------------------------------ rename
  function nameRow() {
    const p = state.p;
    const input = h('input', { class: 'px-input mn-prof-in', type: 'text', maxlength: String(NAME_MAX), value: p.name, placeholder: 'Your name', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Player name' });
    const save = (btn) => {
      const v = input.value.replace(/[^\w .\-!?']/g, '').trim().slice(0, NAME_MAX);
      if (v.length < 2) return deny(ctx, 'Names need at least 2 letters!', btn);
      if (v === p.name) return;
      p.name = v;
      state.emit('profile');
      audio.play('upgrade');
      notify(ctx, `Name changed to *${v}*`, { icon: 'check' });
      redrawCard(true);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { save(); input.blur(); }
    });
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    const btn = button('SAVE', () => save(btn), 'green', { icon: 'check' });
    return h('div', { class: 'mn-prof-namerow' }, icon('emote', 'l'), input, btn);
  }

  // ------------------------------------------------------------------ customize: info bar + grids
  function infoBar() {
    const el = h('div', { class: 'pf-info sk-panel-dark' });
    const s = sel ?? { kind: tab, id: equipped(tab) };
    const have = owns(s.kind, s.id);
    const on = equipped(s.kind) === s.id;
    const def = defsOf(s.kind)[s.id];
    const desc = s.kind === 'banner' ? (BANNERS[s.id]?.animated ? 'Animated banner. It moves. Rivals notice.' : 'Your card background.') : s.kind === 'title' ? 'Shows under your name.' : def?.desc ?? '';
    const right = [];
    if (on) right.push(h('span', { class: 'pf-state on t-d' }, icon('check', 's'), 'EQUIPPED'));
    else if (have) right.push(button('EQUIP', () => wear(s.kind, s.id), 'green sm', { icon: 'check' }));
    else {
      const pr = s.kind === 'banner' ? null : itemProgress(state.p, s.kind, s.id);
      if (pr) right.push(bar(Math.min(1, pr[0] / pr[1]), 'gold', `${fmtN(Math.min(pr[0], pr[1]))}/${fmtN(pr[1])}`, { cls: 'pf-prog' }));
      else if (inShopToday(s.kind, s.id) && ctx?.openTab) right.push(button('SHOP', () => { m.close(); ctx.openTab('shop'); }, 'yellow sm', { icon: 'shop' }));
    }
    el.append(
      h('div', { class: 'pf-info-txt' },
        h('b', { class: 't-d outline pf-info-n' }, nameOf(s.kind, s.id) || '-'),
        have ? h('span', { class: 'pf-info-s' }, desc) : h('span', { class: 'pf-info-s c-gold', html: rich(inShopToday(s.kind, s.id) ? "*In Lonan's shop today.* Go before he moves it." : `*How to get:* ${howTo(s.kind, s.id)}`) })),
      h('div', { class: 'pf-info-r' }, ...right));
    return el;
  }
  function refreshInfo() {
    const fresh = infoBar();
    info?.replaceWith(fresh);
    info = fresh;
  }

  function wear(kind, id) {
    if (!owns(kind, id)) return;
    if (kind === 'banner') { state.p.cosmetics.banner = id; state.emit('profile'); } else equipLook(kind, id);
    preview = null;
    sel = { kind, id };
    audio.play('magic');
    redrawCard(true);
    drawGrid();
    refreshInfo();
  }
  function pick(kind, id, tile) {
    sel = { kind, id };
    if (owns(kind, id)) {
      if (equipped(kind) !== id) return wear(kind, id);
      preview = null;
      redrawCard();
    } else {
      audio.play('tap');
      preview = { kind, id };
      redrawCard();
      tile?.classList.add('pf-peek');
    }
    for (const t of gridHost.querySelectorAll('.pf-tile.cur')) t.classList.remove('cur');
    tile?.classList.add('cur');
    refreshInfo();
  }

  function tileArt(kind, id) {
    const l = state.p.cosmetics;
    if (kind === 'avatar') return avatarEl(id, l.frame, { cls: 'pf-tile-av', anim: false });
    if (kind === 'frame') return avatarEl(l.avatar, id, { cls: 'pf-tile-av' });
    if (kind === 'banner') return bannerEl(id, 'pf-tile-ban');
    return h('div', { class: 'pf-tile-ttl t-d' }, TITLES[id].name);
  }
  function tile(kind, id, small = false) {
    const have = owns(kind, id), on = equipped(kind) === id;
    const cur = (sel && sel.kind === kind && sel.id === id) || (preview && preview.kind === kind && preview.id === id);
    const def = defsOf(kind)[id];
    const rar = kind === 'banner' ? (BANNERS[id]?.animated ? 'epic' : 'rare') : def?.rarity ?? 'common';
    const t = h('button', { class: `pf-tile k-${kind} r-${rar} ${have ? '' : 'lock'} ${on ? 'on' : ''} ${cur ? 'cur' : ''} ${small ? 'sm' : ''}`, type: 'button', 'aria-label': nameOf(kind, id) },
      h('div', { class: 'pf-tile-art' }, tileArt(kind, id), have ? null : icon('lock', 'pf-tile-lock')),
      kind === 'title' ? null : h('div', { class: 'pf-tile-n' }, small && masteryCard(kind, id) ? cardDef(masteryCard(kind, id))?.name ?? '' : nameOf(kind, id)),
      small && !have
        ? h('div', { class: `pf-tile-s ml-${(kind === 'banner' ? 4 : defsOf(kind)[id]?.get?.level ?? 1)}` }, MASTERY_NAMES[(kind === 'banner' ? 4 : defsOf(kind)[id]?.get?.level ?? 1) - 1])
        : h('div', { class: 'pf-tile-s' }, on ? h('span', { class: 'c-green' }, 'Equipped') : have ? 'Owned' : shortHow(kind, id)),
      on ? h('div', { class: 'pf-tile-tick' }, icon('check', 's')) : null);
    t.addEventListener('click', (e) => { e.stopPropagation(); pick(kind, id, t); });
    return t;
  }
  function drawGrid() {
    if (!gridHost) return;
    clear(gridHost);
    const kind = tab;
    const ids = Object.keys(defsOf(kind));
    const isM = (id) => !!masteryCard(kind, id);
    const rank = (id) => (kind === 'banner' ? 0 : RAR_ORDER[defsOf(kind)[id]?.rarity] ?? 0);
    const yours = ids.filter((id) => owns(kind, id)).sort((a, b) => (equipped(kind) === b) - (equipped(kind) === a) || isM(a) - isM(b) || rank(a) - rank(b));
    const locked = ids.filter((id) => !owns(kind, id) && !isM(id)).sort((a, b) => rank(a) - rank(b));
    // mastery items: troops you have first, the rest after (in collection order)
    const mOrder = (id) => { const c = masteryCard(kind, id); return (state.p.cards[c] ? 0 : 1000) + MASTERY_CARDS.indexOf(c); };
    const mLocked = ids.filter((id) => !owns(kind, id) && isM(id)).sort((a, b) => mOrder(a) - mOrder(b));
    const grid = (list, small) => h('div', { class: `pf-grid k-${kind} ${small ? 'sm' : ''}` }, ...list.map((id) => tile(kind, id, small)));
    gridHost.append(subHead(`YOURS  ${yours.length}`), grid(yours));
    if (locked.length) gridHost.append(subHead('TO UNLOCK', h('span', { class: 't-xs c-muted' }, 'Tap one to try it on')), grid(locked));
    if (mLocked.length) gridHost.append(subHead('TROOP MASTERY', h('span', { class: 't-xs c-muted' }, 'Play a troop to earn its set')), grid(mLocked, true));
  }

  function customize() {
    const wrap = h('div', { class: 'pf-custom', 'data-guide': 'profile-customize' });
    if (!featureUnlocked('profile')) {
      wrap.append(h('div', { class: 'pf-locked sk-panel-dark' }, icon('lock', 'l'),
        h('div', { class: 'col', style: { gap: 'calc(var(--u)*0.5)' } },
          h('b', { class: 't-d outline' }, 'CUSTOMIZE YOUR CARD'),
          h('span', { class: 't-sm', html: rich(featureHint('profile') ?? 'Win more battles to unlock it.') }))));
      return wrap;
    }
    const tabs = [
      { id: 'avatar', label: 'PICTURE', icon: 'emote' },
      { id: 'frame', label: 'FRAME', icon: 'star' },
      { id: 'banner', label: 'BANNER', icon: 'flag' },
      { id: 'title', label: 'TITLE', icon: 'crown' },
    ];
    // a tab switch rebuilds the strip (segTabs lights the chosen one) and redraws card, info and grid
    const onSel = (id) => {
      if (id === tab) return;
      tab = lastTab = id;
      preview = null;
      sel = null;
      const fresh = segTabs(tabs, tab, onSel, 'pf-tabs');
      wrap.querySelector('.pf-tabs')?.replaceWith(fresh);
      redrawCard();
      refreshInfo();
      drawGrid();
    };
    const seg = segTabs(tabs, tab, onSel, 'pf-tabs');
    info = infoBar();
    gridHost = h('div', { class: 'pf-grids' });
    wrap.append(seg, info, gridHost);
    drawGrid();
    return wrap;
  }

  // ------------------------------------------------------------------ career + lab skin
  function stats() {
    const p = state.p;
    const s = p.stats;
    const found = ALL_CARDS.filter((c) => p.cards[c.id]).length;
    const rate = s.battles ? Math.round((s.wins / s.battles) * 100) : 0;
    const fav = favouriteCard();
    const tl = (ic, label, val, cls = '') => h('div', { class: 'mn-pst ' + cls }, icon(ic, 'mn-st-ic'), h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, label), h('b', { class: 'mn-st-v t-d outline' }, val)));
    const favEl = h('div', { class: 'mn-pst fav' },
      fav ? cardEl(fav.id, { size: 'mini', noLevel: true, cost: false }) : icon('heart', 'mn-st-ic'),
      h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, 'Favorite Card'), h('b', { class: 'mn-st-v t-d outline' }, fav ? cardDef(fav.id).name : '-'), fav ? h('span', { class: 'mn-st-l' }, `Deployed ${fmtN(fav.n)} times`) : h('span', { class: 'mn-st-l' }, 'Play some battles!')));
    return h('div', { class: 'mn-pstats' },
      tl('check', 'Wins', fmtN(s.wins)),
      tl('x', 'Losses', fmtN(s.losses)),
      tl('lab', 'Bases Destroyed', fmtN(s.basesDestroyed ?? 0)),
      tl('mega', 'MEGAs Used', fmtN(s.megasUsed ?? 0)),
      tl('trophy', 'Best Trophies', fmtN(p.bestTrophies)),
      tl('cards', 'Cards Found', `${found}/${ALL_CARDS.length}`),
      tl('swords', 'Battles', fmtN(s.battles)),
      tl('star', 'Win Rate', rate + '%'),
      tl('fire', 'Best Win Streak', fmtN(s.bestStreak ?? 0)),
      tl('vial', 'Vials Opened', fmtN(s.vialsOpened)),
      tl('boss', 'Bosses Beaten', `${Object.keys(p.bosses).length}/${Object.keys(BOSSES).length}`),
      tl('eye', 'Secrets Found', `${Object.keys(p.secrets).length}/${Object.keys(SECRETS).length}`),
      favEl);
  }

  function labSkins() {
    const p = state.p;
    const grid = h('div', { class: 'mn-labskins' });
    for (const [id, l] of Object.entries(LAB_SKINS)) {
      const have = p.cosmetics.labSkins.includes(id);
      const on = p.cosmetics.labSkin === id;
      const t = h('div', { class: `mn-pk ${on ? 'sel' : ''} ${have ? '' : 'lock'}` },
        h('div', { class: 'mn-pk-art mn-labskin-art', style: { '--lt': LAB_TINT[id] ?? '#5a628a' } }, labSkinImg(id, 160, 'smooth mn-labskin-3d'), have ? null : icon('lock', 'mn-pk-lock')),
        h('div', { class: 'mn-pk-n' }, l.name),
        h('div', { class: 'mn-pk-s' }, have ? (on ? 'Equipped' : l.desc) : unlockHint('labSkin', id)),
        on ? h('div', { class: 'mn-pk-tick' }, icon('check', 's')) : null);
      t.addEventListener('click', () => {
        if (!have) return deny(ctx, `Locked: ${unlockHint('labSkin', id)}`);
        if (on) return;
        p.cosmetics.labSkin = id;
        state.emit('labSkin');
        audio.play('magic');
        renderSkins();
      });
      grid.appendChild(t);
    }
    return grid;
  }
  let skinsEl = null;
  function renderSkins() {
    const fresh = labSkins();
    skinsEl?.replaceWith(fresh);
    skinsEl = fresh;
  }

  function render() {
    clear(body);
    card = playerCard();
    skinsEl = labSkins();
    body.append(card, nameRow(),
      subHead('CUSTOMIZE', h('span', { class: 't-xs c-muted' }, 'Rivals see this before every battle')), customize(),
      subHead('CAREER'), stats(),
      featureUnlocked('labSkins') ? subHead('LAB SKIN', h('span', { class: 't-xs c-muted' }, 'Your Lab in battle')) : null,
      featureUnlocked('labSkins') ? skinsEl : null);
  }
  render();
  return m;
}
