// Collection: every collectable swarm grouped by series + the swarm detail view
// (stats with level scaling, upgrade, shiny variants, skins, deck shortcut).
import { h, icon, button, toast } from '../ui.js';
import { audio } from '../../core/audio.js';
import { state, owned, upgradeInfo, upgradeSwarm, setVariant, setSwarmSkin, setDeck, deckSlotCount } from '../../game/state.js';
import { SWARMS, COLLECTABLE, SERIES, VARIANTS, swarmStats, traitText, MAX_LEVEL } from '../../data/swarms.js';
import { SWARM_SKINS } from '../../data/season.js';
import { VIALS } from '../../data/vials.js';
import { ARENAS } from '../../data/arena.js';
import {
  makeScreen, swarmCard, swarmImg, hubMeta, sectionTitle, rarityTag, seriesTag, roleTag, fmt, rollNumber, sparkle, slamText, bump,
  unlockHint, deny, priceTag,
} from './common.js';

const RORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const sortSwarms = (a, b) => RORDER[a.rarity] - RORDER[b.rarity] || a.cost - b.cost;

export function seriesProgress(seriesId) {
  const all = COLLECTABLE.filter((s) => s.series === seriesId);
  const got = all.filter((s) => owned(s.id)).length;
  return { got, total: all.length, pct: all.length ? Math.round((got / all.length) * 100) : 0 };
}

export function openCollection(hub) {
  const meta = hubMeta();
  // remember which were new when the screen opened, then mark everything seen
  const fresh = new Set(Object.keys(state.p.swarms).filter((id) => !meta.seenSwarms[id]));
  for (const id of Object.keys(state.p.swarms)) meta.seenSwarms[id] = true;
  state.save();

  return makeScreen(hub, {
    name: 'collection',
    title: 'SWARM COLLECTION',
    color: 'blue',
    cls: 'sc-collection',
    render(scr) {
      const total = COLLECTABLE.length;
      const got = COLLECTABLE.filter((s) => owned(s.id)).length;
      const upg = COLLECTABLE.filter((s) => upgradeInfo(s.id)?.ok).length;
      const root = h('div', { class: 'col sc-col' });
      root.appendChild(
        h('div', { class: 'hub-summary px-box dark' },
          icon('swarm'),
          h('div', { class: 'grow' },
            h('div', {}, h('b', {}, `${got}/${total}`), ' Swarms found'),
            h('div', { class: 'bar yellow hub-mini-bar' }, h('i', { style: { width: (got / total) * 100 + '%' } }))),
          upg ? h('div', { class: 'hub-chip green' }, icon('up'), `${upg} can upgrade!`) : null,
        ),
      );
      for (const ser of Object.values(SERIES)) {
        const list = COLLECTABLE.filter((s) => s.series === ser.id).sort(sortSwarms);
        if (!list.length) continue;
        const pr = seriesProgress(ser.id);
        const head = h('div', { class: 'hub-series-head', style: { '--sc': ser.color } },
          h('span', { class: 'swatch' }),
          h('span', { class: 'display nm' }, ser.name),
          h('span', { class: 'muted small desc' }, ser.desc),
          h('span', { class: 'spacer' }),
          h('span', { class: 'pct ' + (pr.pct === 100 ? 'gold' : '') }, pr.pct === 100 ? icon('star') : null, `${pr.got}/${pr.total} · ${pr.pct}%`),
        );
        const grid = h('div', { class: 'hub-grid' });
        for (const s of list) grid.appendChild(swarmCard(s.id, { isNew: fresh.has(s.id), onClick: () => hub.openScreen('swarm', { id: s.id }) }));
        root.appendChild(h('div', { class: 'hub-series' }, head, grid));
      }
      return root;
    },
  });
}

// ---------------------------------------------------------------------------

const HEAD_COLOR = { common: 'rh-common', rare: 'blue', epic: 'purple', legendary: 'orange', mythic: 'pink' };

function statRows(id, level, variant) {
  const s = SWARMS[id];
  const cur = swarmStats(id, level, variant);
  const nxt = level < MAX_LEVEL ? swarmStats(id, level + 1, variant) : null;
  const cnt = s.count ?? 1;
  const dps = (st) => Math.round((st.dmg / Math.max(0.1, s.atk)) * cnt);
  return [
    { key: 'hp', ic: 'hp', name: 'Health', v: cur.hp, n: nxt?.hp },
    { key: 'dmg', ic: 'sword', name: s.traits.kamikaze ? 'Blast' : 'Damage', v: cur.dmg, n: nxt?.dmg },
    { key: 'dps', ic: 'bolt', name: 'DPS', v: s.traits.kamikaze ? cur.dmg : dps(cur), n: nxt ? (s.traits.kamikaze ? nxt.dmg : dps(nxt)) : undefined },
    { key: 'range', ic: 'range', name: 'Range', v: s.range, txt: s.range >= 2 ? `${s.range} (ranged)` : `${s.range} (melee)` },
    { key: 'speed', ic: 'speed', name: 'Speed', v: s.speed, txt: s.speed >= 2 ? `${s.speed} Fast` : s.speed >= 1.3 ? `${s.speed} Medium` : `${s.speed} Slow` },
    { key: 'cost', ic: 'energy', name: 'Energy', v: s.cost },
    { key: 'cd', ic: 'clock', name: 'Cooldown', v: s.cd, txt: `${s.cd}s` },
  ];
}

function whereToFind(id) {
  const s = SWARMS[id];
  const parts = [];
  const vial = Object.values(VIALS).find((v) => v.series === s.series);
  if (vial) parts.push(vial.name + 's');
  const arenas = ARENAS.filter((a) => a.series.includes(s.series)).map((a) => a.name);
  if (arenas.length) parts.push('Lab Vials once you reach ' + arenas[0]);
  const hint = unlockHint('swarm', id);
  if (hint) parts.unshift(hint);
  if (s.rarity === 'mythic') parts.unshift('Ultra-limited! Super rare vial drop');
  return parts.join(' · ');
}

export function openSwarmDetail(hub, id) {
  const s = SWARMS[id];
  const e0 = owned(id);
  if (e0) hub.ctx.previewSwarm?.(id, e0.variant, e0.skin);
  return makeScreen(hub, {
    name: 'swarm',
    title: s.name.toUpperCase(),
    color: HEAD_COLOR[s.rarity],
    size: 'mid',
    cls: 'sc-swarm',
    renderFoot() {
      const e = owned(id);
      if (!e) return h('span', { class: 'muted small grow' }, 'Open vials to find this swarm!');
      const inDeck = state.p.deck.includes(id);
      return [
        hub.ctx.previewSwarm
          ? button('View in Lab', () => {
            hub.ctx.previewSwarm(id, e.variant, e.skin);
            hub.closeAll();
          }, 'small', { icon: 'play' })
          : null,
        h('span', { class: 'spacer' }),
        inDeck
          ? button('Remove from Deck', () => {
            setDeck(state.p.deck.filter((x) => x !== id));
            toast(`${s.name} removed from deck`);
          }, 'red', { icon: 'x' })
          : button('Add to Deck', () => {
            if (state.p.deck.length < deckSlotCount()) {
              setDeck([...state.p.deck, id]);
              audio.play('pop');
              toast(`*${s.name}* added to your deck!`, { icon: 'check' });
            } else hub.openScreen('deck', { swapIn: id });
          }, 'green', { icon: 'sword' }),
      ];
    },
    render(scr) {
      const e = owned(id);
      const flash = scr.flash;
      const level = e?.level ?? 1;
      const variant = e?.variant ?? 'base';
      const skin = e?.skin ?? null;
      const info = e ? upgradeInfo(id) : null;

      // --- left: big portrait + tags
      const big = swarmImg(id, variant, skin, 192, e ? '' : 'silhouette soft');
      const pedestal = h('div', { class: `hub-pedestal r-${s.rarity}` }, h('div', { class: 'rays' }), big,
        e ? h('div', { class: 'hub-lvl-badge display' }, 'LV ' + level) : h('div', { class: 'hub-lvl-badge display locked' }, icon('lock'), 'NOT FOUND'),
        e && e.mega ? h('div', { class: 'badge mega hub-mega-corner' }, 'MEGA ON') : null,
      );
      const tags = h('div', { class: 'row wrap hub-tags' }, rarityTag(s.rarity), seriesTag(s.series), roleTag(s.role));
      const left = h('div', { class: 'col sc-swarm-left' }, pedestal, tags);

      // --- right: stats
      const rows = statRows(id, level, variant);
      const prev = flash?.levelUp ? statRows(id, level - 1, variant) : null;
      const table = h('div', { class: 'hub-stats' });
      const rollers = [];
      rows.forEach((r, i) => {
        const valEl = h('b', {}, r.txt ?? fmt(r.v));
        const nextEl = e && info && !info.max && r.n !== undefined && r.n !== r.v ? h('span', { class: 'greent nx' }, '+' + fmt(r.n - r.v)) : null;
        const row = h('div', { class: 'hub-stat' + (prev && prev[i].v !== r.v ? ' flash' : '') }, icon(r.ic), h('span', { class: 'nm' }, r.name), h('span', { class: 'spacer' }), valEl, nextEl);
        if (prev && prev[i].v !== r.v && !r.txt) rollers.push([valEl, prev[i].v, r.v]);
        table.appendChild(row);
      });
      const traits = traitText(s);
      const right = h('div', { class: 'col sc-swarm-right' },
        table,
        traits.length ? h('div', { class: 'row wrap hub-traits' }, traits.map((t) => h('span', { class: 'hub-trait' }, t))) : null,
        h('div', { class: 'hub-desc px-box dark' }, s.desc),
      );
      if (!e) right.appendChild(h('div', { class: 'hub-find' }, icon('pin'), h('span', {}, h('b', {}, 'Where to find: '), whereToFind(id))));
      if (s.mega) {
        const mg = SWARMS[s.mega];
        right.appendChild(
          h('div', { class: 'hub-mega-note' }, icon('mega'), h('span', { class: 'grow' }, h('b', {}, 'MEGA FORM: '), mg.name),
            button('Mega Lab', () => hub.openScreen('mega'), 'pink small')),
        );
      }

      const root = h('div', { class: 'col' }, h('div', { class: 'sc-detail' }, left, right));

      // --- upgrade bar
      if (e) {
        const up = h('div', { class: 'hub-upgrade px-box light' });
        if (info.max) {
          up.appendChild(h('div', { class: 'grow center row' }, icon('star'), h('b', { class: 'gold display small' }, 'MAX LEVEL!')));
        } else {
          const f = Math.min(1, info.haveCopies / info.copies);
          up.appendChild(
            h('div', { class: 'grow col hub-up-info' },
              h('div', { class: 'small' }, `Level ${level} → ${level + 1}`),
              h('div', { class: `bar ${info.enoughCopies ? '' : 'blue'}` }, h('i', { style: { width: f * 100 + '%' } }), h('span', { class: 'outline-sm' }, `${info.haveCopies}/${info.copies} copies`))),
          );
          const btn = button(h('span', { class: 'row' }, h('span', {}, 'UPGRADE'), priceTag('coin', fmt(info.coins))), () => {
            const before = level;
            scr.flash = { levelUp: true };
            if (upgradeSwarm(id)) {
              audio.play('upgrade');
              setTimeout(() => audio.play('levelUp'), 250);
              toast(`*${s.name}* is now level ${before + 1}!`, { icon: 'up' });
            } else scr.flash = null;
          }, info.ok ? 'green big pulse' : 'gray big', {
            sound: 'click',
            onDisabled: () => toast(!info.enoughCopies ? `Need ${info.copies - info.haveCopies} more copies` : `Need ${fmt(info.coins - state.p.coins)} more coins`, { icon: 'x', color: '#b8282f' }),
          });
          if (!info.ok) btn.classList.add('disabled');
          up.appendChild(btn);
        }
        root.appendChild(up);
      }

      // --- variants
      root.appendChild(sectionTitle('SHINY VARIANTS', e ? 'Shinies get bonus stats' : null));
      const vrow = h('div', { class: 'hub-opt-row', 'data-sk': 'variants' });
      for (const v of Object.values(VARIANTS)) {
        const have = e?.variants?.[v.id];
        const sel = e && variant === v.id;
        const tile = h('div', { class: `hub-opt ${have ? '' : 'locked'} ${sel ? 'sel' : ''} v-${v.id}` },
          swarmImg(id, v.id, have ? skin : null, 96, have ? '' : 'silhouette soft'),
          h('div', { class: 'lbl' }, v.name),
          h('div', { class: 'sub tiny' }, have ? (v.bonus ? `+${Math.round(v.bonus * 100)}% stats` : 'Standard') : `${(v.chance * 100).toFixed(1)}% drop`),
          !have ? h('div', { class: 'lock-ic' }, icon('lock')) : null,
          sel ? h('div', { class: 'check-ic' }, icon('check')) : null,
        );
        tile.addEventListener('click', () => {
          if (!have) return deny(e ? `No ${v.name} ${s.name} yet - open vials to hunt shinies!` : 'Find this swarm first!');
          if (sel) return;
          audio.play(v.id === 'base' ? 'tap' : 'magic');
          setVariant(id, v.id);
          hub.ctx.previewSwarm?.(id, v.id, skin);
        });
        vrow.appendChild(tile);
      }
      root.appendChild(vrow);

      // --- skins
      const skins = Object.entries(SWARM_SKINS).filter(([, sk]) => sk.swarm === id);
      if (skins.length) {
        root.appendChild(sectionTitle('SKINS'));
        const srow = h('div', { class: 'hub-opt-row', 'data-sk': 'skins' });
        const all = [[null, { name: 'Default' }], ...skins];
        for (const [sid, sk] of all) {
          const have = sid === null || !!state.p.cosmetics.swarmSkins[sid];
          const sel = e && (skin ?? null) === sid;
          const tile = h('div', { class: `hub-opt ${have && e ? '' : 'locked'} ${sel ? 'sel' : ''}` },
            swarmImg(id, have && e ? variant : 'base', sid, 96, have ? '' : 'soft-dim'),
            h('div', { class: 'lbl' }, sk.name),
            h('div', { class: 'sub tiny' }, have ? (sid ? 'Owned' : 'Classic look') : unlockHint('skin', sid) ?? 'Locked'),
            !have ? h('div', { class: 'lock-ic' }, icon('lock')) : null,
            sel ? h('div', { class: 'check-ic' }, icon('check')) : null,
          );
          tile.addEventListener('click', () => {
            if (!e) return deny('Find this swarm first!');
            if (!have) return deny(`Unlock *${sk.name}* from the ${unlockHint('skin', sid) ?? 'Season Pass'}`);
            if (sel) return;
            audio.play('magic');
            setSwarmSkin(id, sid);
            hub.ctx.previewSwarm?.(id, variant, sid);
          });
          srow.appendChild(tile);
        }
        root.appendChild(srow);
      }

      // effects after the DOM is in place
      if (flash?.levelUp) {
        requestAnimationFrame(() => {
          slamText(scr.panel, 'LEVEL UP!');
          sparkle(big, { count: 26, spread: 120 });
          bump(pedestal, 'hub-jump');
          for (const [el, a, b] of rollers) rollNumber(el, a, b, 0.8);
        });
      }
      return root;
    },
  });
}
