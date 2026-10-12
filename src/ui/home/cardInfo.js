// Card detail modal: big card, rarity/type, stats with green "+N" upgrade
// preview, upgrade with a level-up celebration (stat roll-ups, sparkles,
// Lab XP), shiny finishes, Swarm skins and the Mega form toggle.
import { h, icon, button, modal, bar, sparkle, rollNumber, clear, rich } from '../ui.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { fmt } from '../../core/util.js';
import {
  state, owned, upgradeInfo, upgradeCard, setVariant, setSwarmSkin, megaUnlocked, setMega, labXpInfo,
} from '../../game/state.js';
import { cardDef, isSpell, RARITIES } from '../../data/cards.js';
import { SWARMS, SERIES, VARIANTS, ROLE_INFO, traitText, swarmStats, speedName, MAX_LEVEL } from '../../data/swarms.js';
import { spellPower } from '../../data/spells.js';
import { SWARM_SKINS } from '../../data/season.js';
import { arenaById } from '../../data/arenas.js';
import {
  RARITY_RIBBON, chip, deny, flyText, slam, swarmImg, unlockHint, refreshCtx, showRewards, markCardSeen, notify,
} from './common.js';

// ---------------------------------------------------------------------------
// Stats

/** Stat rows for a card at a level: [{key, icon, label, v (number|string), suffix}] */
export function cardStats(id, level = 1, variant = 'base') {
  const d = cardDef(id);
  const rows = [];
  if (isSpell(id)) {
    const pw = spellPower(level);
    if (d.dmg) rows.push({ key: 'dmg', icon: 'sword', label: 'Damage', v: Math.round(d.dmg * pw) });
    if (d.dmg && d.building) rows.push({ key: 'tdmg', icon: 'tower', label: 'Tower Damage', v: Math.round(d.dmg * pw * d.building) });
    if (d.dps) rows.push({ key: 'dps', icon: 'fire', label: 'Damage per sec', v: Math.round(d.dps * pw) });
    if (d.heal) rows.push({ key: 'heal', icon: 'heart', label: 'Heal', v: Math.round(d.heal * pw * 100), suffix: '%' });
    if (d.hpBoost) rows.push({ key: 'boost', icon: 'hp', label: 'Max HP Boost', v: Math.round(d.hpBoost * pw * 100), suffix: '%' });
    if (d.shield) rows.push({ key: 'shield', icon: 'shield', label: 'Shield', v: Math.round(d.shield * pw * 100), suffix: '% HP' });
    if (d.slow) rows.push({ key: 'slow', icon: 'snow', label: 'Slow', v: Math.round(d.slow * 100) + '%' });
    if (d.freeze) rows.push({ key: 'freeze', icon: 'snow', label: 'Freeze', v: d.freeze + 's' });
    if (d.dur) rows.push({ key: 'dur', icon: 'clock', label: 'Duration', v: d.dur + 's' });
    rows.push({ key: 'radius', icon: 'range', label: 'Radius', v: d.radius ? d.radius.toFixed(1) : 'Your Lab' });
    rows.push({ key: 'cost', icon: 'energy', label: 'Energy Cost', v: String(d.elixir) });
    return rows;
  }
  const s = swarmStats(id, level, variant);
  rows.push({ key: 'hp', icon: 'hp', label: 'Hitpoints', v: s.hp });
  rows.push({ key: 'dmg', icon: 'sword', label: d.traits?.area ? 'Area Damage' : 'Damage', v: s.dmg });
  rows.push({ key: 'dps', icon: 'fire', label: 'Damage per sec', v: Math.round(s.dmg / Math.max(0.1, d.atk)) });
  rows.push({ key: 'atk', icon: 'clock', label: 'Hit Speed', v: d.atk.toFixed(1) + 's' });
  rows.push({ key: 'speed', icon: 'speed', label: 'Speed', v: speedName(d.speed) });
  rows.push({ key: 'range', icon: 'range', label: 'Range', v: d.range < 1.6 ? 'Melee' : d.range.toFixed(1) });
  if (d.count > 1) rows.push({ key: 'count', icon: 'swarm', label: 'Count', v: 'x' + d.count });
  const role = ROLE_INFO[d.role];
  if (role) rows.push({ key: 'role', icon: role.icon, label: 'Type', v: role.name });
  return rows;
}

function statTile(r, next, showPlus) {
  const isNum = typeof r.v === 'number';
  const val = h('b', { class: 'hm-st-v t-d outline' }, isNum ? fmt(r.v) : r.v);
  const delta = isNum && next && typeof next.v === 'number' ? next.v - r.v : 0;
  const plus = delta > 0 && showPlus ? h('span', { class: 'hm-st-plus t-d' }, '+' + fmt(delta) + (r.suffix ?? '')) : null;
  const t = h('div', { class: 'hm-st', 'data-k': r.key },
    icon(r.icon, 'hm-st-ic'),
    h('div', { class: 'hm-st-txt' }, h('span', { class: 'hm-st-l' }, r.label), h('span', { class: 'row', style: { gap: '0.3em' } }, val, r.suffix && isNum ? h('span', { class: 'hm-st-sfx t-d' }, r.suffix) : null, plus)));
  t.val = val;
  t.row = r;
  t.plus = plus;
  return t;
}

// ---------------------------------------------------------------------------

const VAR_ORDER = ['base', 'silver', 'gold', 'chrome'];

export function openCardInfo(id, ctx, opts = {}) {
  const def = cardDef(id);
  if (!def) return null;
  markCardSeen(id);
  const spell = isSpell(id);
  const body = h('div', { class: 'hm-ci' });
  const foot = h('div', { class: 'hm-ci-foot' });
  let busy = false;
  const m = modal({
    title: def.name.toUpperCase(), color: RARITY_RIBBON[def.rarity] ?? 'blue', size: 'wide', cls: 'hm-cimodal hm-r-' + def.rarity,
    body, foot, onClose: () => refreshCtx(ctx),
  });

  let cardWrap, statTiles = [];

  function render() {
    clear(body);
    const own = owned(id);
    const level = own?.level ?? 1;
    const variant = own?.variant ?? 'base';
    const up = upgradeInfo(id);
    const rar = RARITIES[def.rarity];
    const ar = arenaById(def.arena);

    // --- top: big card + identity
    cardWrap = h('div', { class: 'hm-ci-card' }, cardEl(id, { size: 'big', progress: !!own, artSize: 256, locked: false, owned: own ?? { level: 1, variant: 'base' }, priority: true, noLevel: !own }));
    if (own?.mega && def.mega && megaUnlocked(def.mega)) cardWrap.appendChild(h('div', { class: 'hm-ci-mega t-d outline' }, icon('mega', 's'), 'MEGA'));
    const series = SERIES[def.series];
    const role = ROLE_INFO[def.role];
    const info = h('div', { class: 'hm-ci-info' },
      h('div', { class: 'row wrap gap-s' },
        chip(rar?.name ?? def.rarity, 'rar r-' + def.rarity),
        chip([icon(spell ? 'magic' : role?.icon ?? 'swarm', 's'), spell ? 'Spell' : 'Troop'], ''),
        series ? chip(series.name, 'ser') : null),
      h('div', { class: 'hm-ci-desc' }, def.desc ?? ''),
      h('div', { class: 'hm-ci-where' }, icon('island', 's'), h('span', {}, ar ? `Found in ${ar.name} vials (Arena ${ar.index + 1})` : 'Special event')),
      !own ? h('div', { class: 'hm-ci-nf t-d outline' }, icon('lock', 's'), ' NOT FOUND YET') : null,
      own && (own.variant !== 'base') ? h('div', { class: 'hm-ci-shiny' }, icon('chrome', 's'), `${VARIANTS[own.variant].name} finish: +${Math.round(VARIANTS[own.variant].bonus * 100)}% HP & damage`) : null);
    body.appendChild(h('div', { class: 'hm-ci-top' }, cardWrap, info));

    // --- stats
    const cur = cardStats(id, level, variant);
    const nxt = own && level < MAX_LEVEL ? cardStats(id, level + 1, variant) : null;
    const showPlus = !!(own && up && !up.max);
    statTiles = cur.map((r) => statTile(r, nxt?.find((x) => x.key === r.key), showPlus));
    body.appendChild(h('div', { class: 'hm-ci-stats' }, ...statTiles));
    if (!spell) {
      const tr = traitText(def);
      if (tr.length) body.appendChild(h('div', { class: 'row wrap gap-s hm-ci-traits' }, ...tr.map((t) => chip([icon('star', 's'), t], 'trait'))));
    }

    // --- finishes / skins / mega (troops you own)
    if (!spell && own) {
      body.appendChild(variantPicker(own));
      const skins = Object.entries(SWARM_SKINS).filter(([, s]) => s.swarm === id);
      if (skins.length) body.appendChild(skinPicker(own, skins));
      if (def.mega && SWARMS[def.mega]) body.appendChild(megaPanel(own));
    }
    renderFoot();
  }

  function renderFoot() {
    clear(foot);
    const own = owned(id);
    const up = upgradeInfo(id);
    if (!own) {
      const ar = arenaById(def.arena);
      foot.appendChild(h('div', { class: 'hm-ci-lockfoot' }, icon('vial'), h('span', { html: rich(ar ? `Reach *${ar.name}* (${fmt(ar.trophies)} trophies) and open vials to find this card.` : 'Not available yet.') })));
      return;
    }
    if (up.max) {
      foot.appendChild(h('div', { class: 'hm-ci-max t-d outline' }, icon('crown', 'l'), 'MAX LEVEL'));
      return;
    }
    const copies = bar(Math.min(1, up.haveCopies / up.copies), up.enoughCopies ? 'green' : 'blue', `${up.haveCopies}/${up.copies}`, { cls: 'hm-ci-copies', icon: 'cards' });
    const lab = labXpInfo();
    const xpNote = h('span', { class: 't-xs c-blue' }, `+${up.xp} Lab XP`);
    const btn = button(h('span', { class: 'col', style: { gap: 0, alignItems: 'center' } }, h('span', {}, `UPGRADE TO LV ${own.level + 1}`)), () => doUpgrade(btn), up.ok ? 'green lg' : up.enoughCopies ? 'green lg' : 'gray lg', { price: { cur: 'coins', amount: up.coins }, sound: 'tap' });
    btn.classList.add('hm-ci-upbtn');
    if (!up.ok) btn.classList.add('disabled-look');
    if (up.ok) btn.classList.add('shine');
    foot.appendChild(h('div', { class: 'hm-ci-upl' }, h('span', { class: 't-xs c-muted' }, up.enoughCopies ? 'Ready to upgrade!' : `Collect ${up.copies - up.haveCopies} more`), copies, xpNote));
    foot.appendChild(btn);
    if (lab.level) foot.dataset.lab = lab.level;
  }

  function doUpgrade(btn) {
    if (busy) return;
    const own = owned(id);
    const up = upgradeInfo(id);
    if (!own || !up || up.max) return;
    if (!up.enoughCopies) return deny(ctx, `Need *${up.copies - up.haveCopies}* more ${def.name} cards!`, btn);
    if (state.p.coins < up.coins) return deny(ctx, `Not enough Beast Coins! Need *${fmt(up.coins - state.p.coins)}* more.`, btn);
    const before = cardStats(id, own.level, own.variant);
    const res = upgradeCard(id);
    if (!res.ok) return deny(ctx, 'Upgrade failed!', btn);
    busy = true;
    refreshCtx(ctx);
    audio.play('upgrade');
    const after = cardStats(id, own.level, own.variant);
    // phase 1: charge up
    cardWrap.classList.add('charging');
    sparkle(cardWrap, { count: 10, spread: 40 });
    setTimeout(() => {
      if (m.closed) return;
      // phase 2: burst + new level card
      const fresh = cardEl(id, { size: 'big', progress: true, artSize: 256, priority: true });
      cardWrap.replaceChild(fresh, cardWrap.querySelector('.gcard'));
      cardWrap.classList.remove('charging');
      cardWrap.classList.add('burst');
      slam(cardWrap, 'LEVEL UP!', 'c-gold');
      sparkle(cardWrap, { count: 34, spread: 120, colors: ['#ffffff', '#ffd84a', '#a8f07a', '#8fd4ff'] });
      audio.play('levelUp');
      audio.jingle('rare');
      flyText(cardWrap, `+${res.xp} Lab XP`, 'c-blue');
      // roll stats
      for (const t of statTiles) {
        const a = before.find((x) => x.key === t.row.key), b = after.find((x) => x.key === t.row.key);
        if (t.plus) t.plus.classList.add('gone');
        if (a && b && typeof a.v === 'number' && typeof b.v === 'number' && b.v !== a.v) {
          t.classList.add('rolling');
          rollNumber(t.val, a.v, b.v, 0.9);
        }
      }
      renderFoot();
      setTimeout(() => {
        busy = false;
        if (m.closed) return;
        cardWrap.classList.remove('burst');
        render();
        if (res.labUps?.length) {
          const lu = res.labUps[res.labUps.length - 1];
          const list = [];
          for (const u of res.labUps) {
            if (u.reward.coins) list.push({ type: 'coins', amount: u.reward.coins });
            if (u.reward.bucks) list.push({ type: 'bucks', amount: u.reward.bucks });
          }
          showRewards(list, { title: `LAB LEVEL ${lu.level}!`, color: 'blue', note: 'Your Lab and turret got tougher: more HP and damage!', jingle: 'victory' });
        }
      }, 1300);
    }, 520);
  }

  function variantPicker(own) {
    const row = h('div', { class: 'hm-pick' });
    for (const k of VAR_ORDER) {
      const v = VARIANTS[k];
      const have = !!own.variants?.[k];
      const sel = (own.variant ?? 'base') === k;
      const t = h('div', { class: `hm-pk ${sel ? 'sel' : ''} ${have ? '' : 'lock'} v-${k}` },
        h('div', { class: 'hm-pk-art' }, swarmImg(id, k, own.skin ?? null, 112), !have ? icon('lock', 'hm-pk-lock') : null),
        h('div', { class: 'hm-pk-n' }, v.name),
        h('div', { class: 'hm-pk-s' }, k === 'base' ? 'Standard' : `+${Math.round(v.bonus * 100)}% stats`),
        sel ? h('div', { class: 'hm-pk-tick' }, icon('check', 's')) : null);
      t.addEventListener('click', () => {
        if (!have) {
          audio.play('deny');
          notify(ctx, k === 'chrome' ? 'Hyperchrome finishes are super rare! *Hyperchrome Tubes* have 8x shiny odds.' : `Find a *${v.name}* ${def.name} in a vial!`, { icon: 'chrome' });
          return;
        }
        if (sel) return;
        setVariant(id, k);
        audio.play('magic');
        render();
        sparkle(body.querySelector('.hm-ci-card'), { count: 14 });
      });
      row.appendChild(t);
    }
    return h('div', { class: 'hm-ci-sec' }, h('div', { class: 'hm-ci-sh t-d outline' }, icon('chrome', 's'), ' SHINY FINISHES'), row);
  }

  function skinPicker(own, skins) {
    const row = h('div', { class: 'hm-pick' });
    const opts = [[null, { name: 'Classic' }], ...skins];
    for (const [k, s] of opts) {
      const have = k === null || !!state.p.cosmetics.swarmSkins?.[k];
      const sel = (own.skin ?? null) === k;
      const t = h('div', { class: `hm-pk ${sel ? 'sel' : ''} ${have ? '' : 'lock'}` },
        h('div', { class: 'hm-pk-art' }, swarmImg(id, own.variant ?? 'base', k, 112), !have ? icon('lock', 'hm-pk-lock') : null),
        h('div', { class: 'hm-pk-n' }, s.name),
        h('div', { class: 'hm-pk-s' }, have ? (sel ? 'Equipped' : 'Owned') : unlockHint('skin', k)),
        sel ? h('div', { class: 'hm-pk-tick' }, icon('check', 's')) : null);
      t.addEventListener('click', () => {
        if (!have) {
          audio.play('deny');
          notify(ctx, `${s.name}: ${unlockHint('skin', k)}`, { icon: 'paint' });
          return;
        }
        if (sel) return;
        setSwarmSkin(id, k);
        audio.play('magic');
        render();
        sparkle(body.querySelector('.hm-ci-card'), { count: 14 });
      });
      row.appendChild(t);
    }
    return h('div', { class: 'hm-ci-sec' }, h('div', { class: 'hm-ci-sh t-d outline' }, icon('paint', 's'), ' SKINS'), row);
  }

  function megaPanel(own) {
    const megaId = def.mega;
    const mg = SWARMS[megaId];
    const unlocked = megaUnlocked(megaId);
    const on = !!own.mega && unlocked;
    const art = h('div', { class: 'hm-mega-art' }, swarmImg(megaId, 'base', on ? own.megaSkin ?? null : null, 160), !unlocked ? icon('lock', 'hm-pk-lock') : null);
    const st = swarmStats(megaId, own.level);
    const txt = h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.8)' } },
      h('b', { class: 't-d outline t-lg c-pink' }, mg.name),
      h('span', { class: 't-sm' }, mg.desc ?? 'A mega-evolved form with boosted stats.'),
      h('span', { class: 'row wrap gap-s' }, chip([icon('hp', 's'), fmt(st.hp)]), chip([icon('sword', 's'), fmt(st.dmg)]), chip([icon('energy', 's'), String(mg.elixir ?? def.elixir)])));
    let ctrl;
    if (!unlocked) {
      ctrl = h('div', { class: 'hm-mega-lock' }, icon('mega', 's'), h('span', {}, `Unlock with a Mega Serum: ${unlockHint('serum', megaId)}`));
    } else {
      const sw = h('button', { class: `hm-switch ${on ? 'on' : ''}`, type: 'button' }, h('i'), h('span', { class: 't-d' }, on ? 'ON' : 'OFF'));
      sw.addEventListener('click', () => {
        setMega(id, !on);
        audio.play(on ? 'tap' : 'roar');
        render();
        if (!on) sparkle(body.querySelector('.hm-mega'), { count: 24, colors: ['#ff2e88', '#ffd84a', '#ffffff'] });
      });
      ctrl = h('div', { class: 'row gap-s' }, h('span', { class: 't-d outline' }, 'DEPLOY MEGA FORM'), sw);
    }
    const megaSkins = Object.entries(SWARM_SKINS).filter(([, s]) => s.swarm === megaId);
    let skinRow = null;
    if (unlocked && on && megaSkins.length) {
      skinRow = h('div', { class: 'row wrap gap-s' }, ...[[null, { name: 'Classic' }], ...megaSkins].map(([k, s]) => {
        const have = k === null || !!state.p.cosmetics.swarmSkins?.[k];
        const sel = (own.megaSkin ?? null) === k;
        const b = button(s.name, () => {
          if (!have) return notify(ctx, `${s.name}: ${unlockHint('skin', k)}`, { icon: 'paint' });
          own.megaSkin = k;
          state.emit('cards');
          audio.play('magic');
          render();
        }, `${sel ? 'pink' : have ? 'blue' : 'gray'} sm`, { icon: have ? (sel ? 'check' : 'paint') : 'lock' });
        return b;
      }));
    }
    return h('div', { class: `hm-ci-sec hm-mega ${on ? 'on' : ''} ${unlocked ? '' : 'lock'}` },
      h('div', { class: 'hm-ci-sh t-d outline' }, icon('mega', 's'), ' MEGA FORM'),
      h('div', { class: 'row', style: { alignItems: 'center' } }, art, txt), ctrl, skinRow);
  }

  render();
  if (opts.autoUpgrade) setTimeout(() => doUpgrade(foot.querySelector('.hm-ci-upbtn')), 380);
  return m;
}
