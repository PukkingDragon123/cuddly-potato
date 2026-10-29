// Card detail modal: big card, rarity/type, stats with green "+N" upgrade
// preview, upgrade with a level-up celebration (stat roll-ups, sparkles,
// Lab XP), shiny finishes, Swarm skins and the Mega form toggle.
import * as THREE from 'three';
import { h, icon, button, modal, bar, sparkle, rollNumber, clear, rich, burst, confetti, $overlay } from '../ui.js';
import { setRankMedal } from '../rankMedal.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { createSwarm } from '../../models/swarmModels.js';
import { fmt } from '../../core/util.js';
import {
  state, owned, upgradeInfo, upgradeCard, setVariant, setSwarmSkin, megaUnlocked, setMega, labXpInfo,
} from '../../game/state.js';
import { cardDef, isSpell, RARITIES, ALL_CARDS } from '../../data/cards.js';
import { SWARMS, SERIES, VARIANTS, ROLE_INFO, traitText, swarmStats, speedName, MAX_LEVEL } from '../../data/swarms.js';
import { spellPower } from '../../data/spells.js';
import { SWARM_SKINS } from '../../data/season.js';
import { arenaById } from '../../data/arenas.js';
import {
  RARITY_RIBBON, chip, deny, flyText, slam, swarmImg, unlockHint, refreshCtx, showRewards, markCardSeen, notify, labBadge, fmtN,
} from './common.js';

// ---------------------------------------------------------------------------
// Stats

/** Stat rows for a card at a level: [{key, icon, label, v (number|string), suffix}] */
export function cardStats(id, level = 1, variant = 'base') {
  const d = cardDef(id);
  const rows = [];
  if (d.special) {
    if (d.draw) rows.push({ key: 'draw', icon: 'cards', label: 'Draw', v: '+' + d.draw + ' cards' });
    if (d.gain) rows.push({ key: 'gain', icon: 'power', label: 'POWER Gain', v: '+' + d.gain });
    if (d.discount) rows.push({ key: 'disc', icon: 'ticket', label: 'Hand Discount', v: '-' + d.discount });
    if (d.echo) rows.push({ key: 'echo', icon: 'swords', label: 'Echo', v: 'Next troop x2' });
    if (d.haste) rows.push({ key: 'haste', icon: 'speed', label: 'Haste', v: `+25% speed ${d.haste}s` });
    if (d.frenzy) rows.push({ key: 'frenzy', icon: 'fire', label: 'Frenzy', v: `+30% atk speed ${d.frenzy}s` });
    if (d.surge) rows.push({ key: 'surge', icon: 'sword', label: 'Surge', v: `+${Math.round(d.amt * 100)}% damage ${d.surge}s` });
    if (d.armor) rows.push({ key: 'armor', icon: 'shield', label: 'Armor', v: `${Math.round(d.armor * 100)}% HP shield` });
    if (d.giant) rows.push({ key: 'giant', icon: 'dna', label: 'Giant', v: `x${d.giant.scale} size, +${Math.round((d.giant.hp - 1) * 100)}% HP` });
    if (d.overclock) rows.push({ key: 'oc', icon: 'bolt', label: 'Overclock', v: `${d.overclock}s` });
    if (d.freezeAll) rows.push({ key: 'freeze', icon: 'snow', label: 'Freeze All', v: `${d.freezeAll}s` });
    if (d.blast) rows.push({ key: 'blast', icon: 'bomb', label: 'Blast / card', v: String(d.blast) });
    if (d.boost) rows.push({ key: 'boost', icon: 'up', label: 'Stat Boost', v: `+${Math.round(d.boost * 100)}%` });
    rows.push({ key: 'kw', icon: 'magic', label: 'Keywords', v: (d.keywords ?? []).join(' / ') || 'SPECIAL' });
    rows.push({ key: 'once', icon: 'clock', label: 'Uses', v: d.exhaust ? 'Once per battle' : 'Cycles' });
    rows.push({ key: 'cost', icon: 'energy', label: 'Power Cost', v: String(d.elixir) });
    return rows;
  }
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
    if (d.rage) rows.push({ key: 'rage', icon: 'fire', label: 'Rage', v: `+${Math.round(d.dmgBoost * 100)}% dmg, +${Math.round(d.speedBoost * 100)}% speed` });
    if (d.armor) rows.push({ key: 'armor', icon: 'shield', label: 'Shield', v: Math.round(d.armor * 100) + '% HP' });
    if (d.titan) rows.push({ key: 'titan', icon: 'dna', label: 'Titan', v: `x${d.grow} size, +${Math.round(d.dmgBoost * 100)}% dmg` });
    if (d.bolts) rows.push({ key: 'bolts', icon: 'lightning', label: 'Bolts', v: 'x' + d.bolts });
    if (d.burn) rows.push({ key: 'burn', icon: 'fire', label: 'Burn', v: `${d.burn}/s for ${d.burnDur}s` });
    if (d.overclock) rows.push({ key: 'oc', icon: 'bolt', label: 'Overcharge', v: d.overclock + 's' });
    if (d.dur || d.rage || d.titan) rows.push({ key: 'dur', icon: 'clock', label: 'Duration', v: (d.dur ?? d.rage ?? d.titan) + 's' });
    rows.push({ key: 'radius', icon: 'range', label: 'Radius', v: d.radius ? d.radius.toFixed(1) : 'Your Lab' });
    rows.push({ key: 'cost', icon: 'energy', label: 'Power Cost', v: String(d.elixir) });
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
  const val = h('b', { class: 'mn-st-v t-d outline' }, isNum ? fmt(r.v) : r.v);
  const delta = isNum && next && typeof next.v === 'number' ? next.v - r.v : 0;
  const plus = delta > 0 && showPlus ? h('span', { class: 'mn-st-plus t-d' }, '+' + fmt(delta) + (r.suffix ?? '')) : null;
  const t = h('div', { class: 'mn-st', 'data-k': r.key },
    icon(r.icon, 'mn-st-ic'),
    h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, r.label), h('span', { class: 'row', style: { gap: '0.3em' } }, val, r.suffix && isNum ? h('span', { class: 'mn-st-sfx t-d' }, r.suffix) : null, plus)));
  t.val = val;
  t.row = r;
  t.plus = plus;
  return t;
}

// ---------------------------------------------------------------------------
// Stat bars: each numeric stat against the best Swarm in the game at that level

const refCache = new Map();
function statRefs(level) {
  if (refCache.has(level)) return refCache.get(level);
  const ref = { hp: 1, dmg: 1, dps: 1, range: 1, speed: 0.1 };
  for (const c of ALL_CARDS) {
    if (isSpell(c.id) || !SWARMS[c.id]) continue;
    const d = cardDef(c.id);
    try {
      const st = swarmStats(c.id, level, 'base');
      ref.hp = Math.max(ref.hp, st.hp);
      ref.dmg = Math.max(ref.dmg, st.dmg);
      ref.dps = Math.max(ref.dps, st.dmg / Math.max(0.1, d.atk));
    } catch (e) { /* skip odd entries */ }
    ref.range = Math.max(ref.range, d.range ?? 0);
    ref.speed = Math.max(ref.speed, d.speed ?? 0);
  }
  refCache.set(level, ref);
  return ref;
}
function statFrac(id, key, v, level) {
  if (isSpell(id)) return null;
  const d = cardDef(id), ref = statRefs(level);
  if (key === 'hp' || key === 'dmg' || key === 'dps') return typeof v === 'number' ? v / ref[key] : null;
  if (key === 'range') return Math.max(0.08, (d.range ?? 0) / ref.range);
  if (key === 'speed') return (d.speed ?? 0) / ref.speed;
  return null;
}

// ---------------------------------------------------------------------------
// 3D turntable: the Swarm spins on its card stage at a stepped pixel-art frame
// rate (frames rendered once, one per animation frame, then cached). Drag the
// card to spin it by hand.

const TT_N = 12;
const ttCache = new Map();
function turntableFrames(id, variant, skin, w = 224) {
  const key = `${id}|${variant}|${skin}|${w}`;
  let e = ttCache.get(key);
  if (e) return e;
  e = { frames: [], done: false, subs: new Set() };
  ttCache.set(key, e);
  const hh = Math.round(w * 1.25);
  let root = null, spin = null, i = 0;
  const step = () => {
    try {
      if (!root) {
        const rig = createSwarm(id, { variant, skin });
        rig.setState('idle');
        for (let k = 0; k < 6; k++) rig.update(0.016);
        spin = new THREE.Group();
        spin.add(rig.root);
        root = new THREE.Group();
        root.add(spin);
        // an invisible spin-radius hull keeps the camera framing identical in every frame
        const box = new THREE.Box3().setFromObject(rig.root);
        let R = 0;
        for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) R = Math.max(R, Math.hypot(x, z));
        R *= 0.82;
        const hull = new THREE.Mesh(new THREE.BoxGeometry(R * 2, Math.max(0.01, box.max.y - box.min.y), R * 2));
        hull.visible = false;
        hull.position.y = (box.min.y + box.max.y) / 2;
        root.add(hull);
      }
      spin.rotation.y = 0.62 + (i / TT_N) * Math.PI * 2;
      e.frames.push(engine.renderThumb(root, { w, h: hh, yaw: 0, pitch: 0.16, zoom: 0.74, lift: -0.02 }));
    } catch (err) {
      console.warn('turntable', err);
      e.done = true;
      return;
    }
    i++;
    for (const f of e.subs) f();
    if (i < TT_N) requestAnimationFrame(step);
    else { e.done = true; for (const f of e.subs) f(); e.subs.clear(); }
  };
  // let the modal pop in first
  setTimeout(() => requestAnimationFrame(step), 420);
  return e;
}
/** Make the big card's art spin (stepped) once its turntable frames exist. */
function attachTurntable(card, id, variant, skin) {
  if (!card || isSpell(id) || !SWARMS[id]) return;
  const img = card.querySelector('.art img');
  if (!img) return;
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tt = turntableFrames(id, variant, skin);
  let k = 0, drag = null, iv = 0, idle = 0;
  const show = () => { if (tt.frames.length) img.src = tt.frames[((k % tt.frames.length) + tt.frames.length) % tt.frames.length]; };
  const start = () => {
    if (iv || !tt.done || !tt.frames.length) return;
    card.classList.add('spinning');
    img.classList.add('loaded');
    iv = setInterval(() => {
      if (!img.isConnected) { clearInterval(iv); return; }
      if (drag || performance.now() < idle) return;
      k++;
      show();
    }, 150);
  };
  if (tt.done) start();
  else tt.subs.add(start);
  card.appendChild(h('div', { class: 'mn-ci-360 t-d', 'data-tip': 'Drag to spin' }, icon('arrowL', 's'), '360', icon('arrowR', 's')));
  card.addEventListener('pointerdown', (e) => {
    if (!tt.done) return;
    drag = { x: e.clientX, k };
    card.setPointerCapture?.(e.pointerId);
  });
  card.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const nk = drag.k + Math.round((e.clientX - drag.x) / 14);
    if (nk !== k) { k = nk; show(); }
  });
  const end = () => { if (drag) { drag = null; idle = performance.now() + 1200; } };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------------------

const VAR_ORDER = ['base', 'silver', 'gold', 'chrome'];

export function openCardInfo(id, ctx, opts = {}) {
  const def = cardDef(id);
  if (!def) return null;
  markCardSeen(id);
  const spell = isSpell(id);
  const body = h('div', { class: 'mn-ci' });
  const foot = h('div', { class: 'mn-ci-foot' });
  let busy = false;
  const m = modal({
    title: def.name.toUpperCase(), color: RARITY_RIBBON[def.rarity] ?? 'blue', size: 'wide', cls: 'mn-cimodal mn-r-' + def.rarity,
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
    cardWrap = h('div', { class: 'mn-ci-card' }, cardEl(id, { size: 'big', progress: !!own, artSize: 256, locked: false, owned: own ?? { level: 1, variant: 'base' }, priority: true, noLevel: !own }));
    if (own?.mega && def.mega && megaUnlocked(def.mega)) cardWrap.appendChild(h('div', { class: 'mn-ci-mega t-d outline' }, icon('mega', 's'), 'MEGA'));
    cardWrap.prepend(h('div', { class: 'px-rays w mn-ci-rays' }));
    attachTurntable(cardWrap.querySelector('.gcard'), id, variant, own?.skin ?? null);
    const series = SERIES[def.series];
    const role = ROLE_INFO[def.role];
    const info = h('div', { class: 'mn-ci-info' },
      h('div', { class: 'row wrap gap-s' },
        chip(rar?.name ?? def.rarity, 'rar r-' + def.rarity),
        chip([icon(def.special ? 'cards' : spell ? 'magic' : role?.icon ?? 'swarm', 's'), def.special ? 'Special' : spell ? 'Spell' : 'Troop'], def.special ? 'special' : ''),
        series ? chip(series.name, 'ser') : null),
      h('div', { class: 'mn-ci-desc' }, def.desc ?? ''),
      h('div', { class: 'mn-ci-where' }, icon('island', 's'), h('span', {}, ar ? `Found in ${ar.name} vials (Arena\u00a0${ar.index + 1})` : 'Special event')),
      !own ? h('div', { class: 'mn-ci-nf t-d outline' }, icon('lock', 's'), ' NOT FOUND YET') : null,
      own && (own.variant !== 'base') ? h('div', { class: 'mn-ci-shiny' }, icon('chrome', 's'), `${VARIANTS[own.variant].name} finish: +${Math.round(VARIANTS[own.variant].bonus * 100)}% HP & damage`) : null);
    body.appendChild(h('div', { class: 'mn-ci-top' }, cardWrap, info));

    // --- stats (beside the card on wide screens, below it on portrait)
    const wide = window.innerWidth > window.innerHeight * 1.25;
    const statHost = wide ? info : body;
    const cur = cardStats(id, level, variant);
    const nxt = own && level < MAX_LEVEL ? cardStats(id, level + 1, variant) : null;
    const showPlus = !!(own && up && !up.max);
    statTiles = cur.map((r, i) => {
      const t = statTile(r, nxt?.find((x) => x.key === r.key), showPlus);
      const f = statFrac(id, r.key, r.v, level);
      if (f !== null && Number.isFinite(f)) {
        const nv = nxt?.find((x) => x.key === r.key);
        const nf = showPlus && nv ? statFrac(id, r.key, nv.v, level) : null;
        t.appendChild(h('div', { class: `mn-st-bar k-${r.key}`, style: { '--f': Math.min(1, f).toFixed(3), '--nf': Math.min(1, nf ?? f).toFixed(3), '--d': i * 0.06 + 's' } }, h('i', { class: 'nx' }), h('i', { class: 'cu' })));
        t.classList.add('has-bar');
      }
      return t;
    });
    statHost.appendChild(h('div', { class: 'mn-ci-stats' }, ...statTiles));
    if (!spell) {
      const tr = traitText(def);
      if (tr.length) statHost.appendChild(h('div', { class: 'row wrap gap-s mn-ci-traits' }, ...tr.map((t) => chip([icon('star', 's'), t], 'trait'))));
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
      foot.appendChild(h('div', { class: 'mn-ci-lockfoot' }, icon('vial'), h('span', { html: rich(ar ? `Reach *${ar.name}* (${fmt(ar.trophies)} trophies) and open vials to find this card.` : 'Not available yet.') })));
      return;
    }
    if (up.max) {
      foot.appendChild(h('div', { class: 'mn-ci-max t-d outline' }, icon('crown', 'l'), 'MAX LEVEL'));
      return;
    }
    const copies = bar(Math.min(1, up.haveCopies / up.copies), up.enoughCopies ? 'green' : 'blue', `${up.haveCopies}/${up.copies}`, { cls: 'mn-ci-copies', icon: 'cards' });
    const lab = labXpInfo();
    const xpNote = h('span', { class: 't-xs c-blue' }, `+${up.xp} Lab XP`);
    const btn = button(h('span', { class: 'col', style: { gap: 0, alignItems: 'center' } }, h('span', {}, `UPGRADE TO LV ${own.level + 1}`)), () => doUpgrade(btn), up.ok ? 'green lg' : up.enoughCopies ? 'green lg' : 'gray lg', { price: { cur: 'coins', amount: fmtN(up.coins) }, sound: 'tap' });
    btn.classList.add('mn-ci-upbtn');
    if (!up.ok) btn.classList.add('disabled-look');
    if (up.ok) btn.classList.add('shine');
    foot.appendChild(h('div', { class: 'mn-ci-upl' }, h('span', { class: 't-xs c-muted' }, up.enoughCopies ? 'Ready to upgrade!' : `Collect ${up.copies - up.haveCopies} more`), copies, xpNote));
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
      attachTurntable(fresh, id, own.variant ?? 'base', own.skin ?? null);
      burst(cardWrap.querySelector('.gcard') ?? cardWrap, { color: '#a8f07a', count: 30, scale: 1.25 });
      confetti($overlay(), { count: 30, life: 3.6, spread: 0.4 });
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
          const coins = res.labUps.reduce((a, u) => a + (u.reward.coins ?? 0), 0);
          const bucks = res.labUps.reduce((a, u) => a + (u.reward.bucks ?? 0), 0);
          const list = [];
          if (coins) list.push({ type: 'coins', amount: coins });
          if (bucks) list.push({ type: 'bucks', amount: bucks });
          // the rank medal arrives at the old level and pops up to the new one
          const hero = labBadge(Math.max(1, lu.level - res.labUps.length), 'big mn-rw-hero');
          showRewards(list, { title: `LAB LEVEL ${lu.level}!`, color: 'blue', hero, note: 'Your base got tougher: +7% HP and damage per level!', jingle: 'victory' });
          setTimeout(() => setRankMedal(hero, lu.level, { pop: true }), 650);
        }
      }, 1300);
    }, 520);
  }

  function variantPicker(own) {
    const row = h('div', { class: 'mn-pick' });
    for (const k of VAR_ORDER) {
      const v = VARIANTS[k];
      const have = !!own.variants?.[k];
      const sel = (own.variant ?? 'base') === k;
      const t = h('div', { class: `mn-pk ${sel ? 'sel' : ''} ${have ? '' : 'lock'} v-${k}` },
        h('div', { class: 'mn-pk-art' }, swarmImg(id, k, own.skin ?? null, 112), !have ? icon('lock', 'mn-pk-lock') : null),
        h('div', { class: 'mn-pk-n' }, v.name),
        h('div', { class: 'mn-pk-s' }, k === 'base' ? 'Standard' : `+${Math.round(v.bonus * 100)}% stats`),
        sel ? h('div', { class: 'mn-pk-tick' }, icon('check', 's')) : null);
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
        sparkle(body.querySelector('.mn-ci-card'), { count: 14 });
      });
      row.appendChild(t);
    }
    return h('div', { class: 'mn-ci-sec' }, h('div', { class: 'mn-ci-sh t-d outline' }, icon('chrome', 's'), ' SHINY FINISHES'), row);
  }

  function skinPicker(own, skins) {
    const row = h('div', { class: 'mn-pick' });
    const opts = [[null, { name: 'Classic' }], ...skins];
    for (const [k, s] of opts) {
      const have = k === null || !!state.p.cosmetics.swarmSkins?.[k];
      const sel = (own.skin ?? null) === k;
      const t = h('div', { class: `mn-pk ${sel ? 'sel' : ''} ${have ? '' : 'lock'}` },
        h('div', { class: 'mn-pk-art' }, swarmImg(id, own.variant ?? 'base', k, 112), !have ? icon('lock', 'mn-pk-lock') : null),
        h('div', { class: 'mn-pk-n' }, s.name),
        h('div', { class: 'mn-pk-s' }, have ? (sel ? 'Equipped' : 'Owned') : unlockHint('skin', k)),
        sel ? h('div', { class: 'mn-pk-tick' }, icon('check', 's')) : null);
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
        sparkle(body.querySelector('.mn-ci-card'), { count: 14 });
      });
      row.appendChild(t);
    }
    return h('div', { class: 'mn-ci-sec' }, h('div', { class: 'mn-ci-sh t-d outline' }, icon('paint', 's'), ' SKINS'), row);
  }

  function megaPanel(own) {
    const megaId = def.mega;
    const mg = SWARMS[megaId];
    const unlocked = megaUnlocked(megaId);
    const on = !!own.mega && unlocked;
    const art = h('div', { class: 'mn-mega-art' }, swarmImg(megaId, 'base', on ? own.megaSkin ?? null : null, 160), !unlocked ? icon('lock', 'mn-pk-lock') : null);
    const st = swarmStats(megaId, own.level);
    const txt = h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.8)' } },
      h('b', { class: 't-d outline t-lg c-pink' }, mg.name),
      h('span', { class: 't-sm' }, mg.desc ?? 'The MEGA Serum form: bigger, tougher, hits harder.'),
      h('span', { class: 'row wrap gap-s' }, chip([icon('hp', 's'), fmt(st.hp)]), chip([icon('sword', 's'), fmt(st.dmg)]), chip([icon('energy', 's'), String(mg.elixir ?? def.elixir)])));
    let ctrl;
    if (!unlocked) {
      ctrl = h('div', { class: 'mn-mega-lock' }, icon('mega', 's'), h('span', {}, `Unlock with a Mega Serum: ${unlockHint('serum', megaId)}`));
    } else {
      const sw = h('button', { class: `mn-switch ${on ? 'on' : ''}`, type: 'button' }, h('i'), h('span', { class: 't-d' }, on ? 'ON' : 'OFF'));
      sw.addEventListener('click', () => {
        setMega(id, !on);
        audio.play(on ? 'tap' : 'roar');
        render();
        if (!on) sparkle(body.querySelector('.mn-mega'), { count: 24, colors: ['#ff2e88', '#ffd84a', '#ffffff'] });
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
    return h('div', { class: `mn-ci-sec mn-mega ${on ? 'on' : ''} ${unlocked ? '' : 'lock'}` },
      h('div', { class: 'mn-ci-sh t-d outline' }, icon('mega', 's'), ' MEGA FORM'),
      h('div', { class: 'row', style: { alignItems: 'center' } }, art, txt), ctrl, skinRow);
  }

  render();
  if (opts.autoUpgrade) setTimeout(() => doUpgrade(foot.querySelector('.mn-ci-upbtn')), 380);
  return m;
}
