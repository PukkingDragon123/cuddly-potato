// LAB tab: your Commander + your Lab Level.
//   Commander: big showcase (level, XP), signature + skills with unlock
//   levels, perk slots (roll for coins, keep or take), outfits, level road
//   and the roster (owned / locked + how to unlock, equip).
//   Lab Level: badge, XP bar, what it does (Lab & turret HP/damage) and the
//   rewards for each level.
import { h, icon, button, modal, bar, sparkle, bump, clear } from '../ui.js';
import { audio } from '../../core/audio.js';
import {
  state, equipCommander, rollCommanderPerk, setPerk, setCmdSkin, labXpInfo,
} from '../../game/state.js';
import {
  COMMANDERS, PERKS, PERK_TIERS, PERK_ROLL_COST, perkText, cmdXpForLevel, CMD_MAX_LEVEL, CMD_LEVEL_REWARDS, perkSlotsForLevel, cmdPower,
} from '../../data/commanders.js';
import { CMD_SKINS } from '../../data/season.js';
import { BOSSES } from '../../data/arenas.js';
import { LAB_XP, LAB_MAX_LEVEL, LAB_LEVEL_REWARDS, TOWERS, labPower } from '../../data/labs.js';
import {
  screenShell, secHead, subHead, chip, cmdImg, cmdFullImg, cmdSkinOwned, cmdSkinsFor, unlockHint, deny, notify, refreshCtx, fmt, fmtN, labBadge,
} from './common.js';
import { openBoss } from './boss.js';

const TIER_COLOR = { common: '#b8c6e8', rare: '#ff9a2e', epic: '#c063ff', legendary: '#3ff2c8' };
const tierName = (t) => PERK_TIERS.find((x) => x.id === t)?.name ?? t;
const SLOT_LEVEL = [1, 4, 8];

/** How a locked Commander is unlocked: { text, action:{label, fn} } */
function unlockInfo(c, ctx) {
  const [kind, id] = String(c.unlock).split(':');
  if (kind === 'boss') {
    const b = BOSSES[id];
    return { text: `Beat the *${b?.name ?? id}* boss challenge${b ? ` (${fmt(b.minTrophies)} trophies)` : ''}.`, action: { label: 'BOSS', icon: 'boss', fn: () => openBoss(id, ctx) } };
  }
  if (kind === 'quest') return { text: `Finish *${c.name}'s* quest chain on Beast Island.`, action: { label: 'QUESTS', icon: 'quest', fn: () => ctx.openTab?.('pass') } };
  if (kind === 'season') return { text: 'Unlock on the free *Food Season Pass* track (tier 4).', action: { label: 'PASS', icon: 'calorie', fn: () => ctx.openTab?.('pass') } };
  return { text: 'Your starter Commander.' };
}
const rich = (t) => String(t).replace(/\*(.+?)\*/g, '<b>$1</b>');

let viewId = null; // which Commander the showcase shows (persists between mounts)

export function mount(el, ctx) {
  viewId = null; // always open on the equipped Commander
  const shell = screenShell(el, { cls: 'mn-lab', render });

  function view() {
    const own = state.p.commanders.owned;
    if (!viewId || !COMMANDERS[viewId]) viewId = state.p.commanders.equipped;
    return { id: viewId, def: COMMANDERS[viewId], cs: own[viewId] ?? null };
  }

  // ---------------------------------------------------------------- showcase
  function showcase() {
    const { id, def, cs } = view();
    const equipped = state.p.commanders.equipped === id;
    const lvl = cs?.level ?? 1;
    const need = cmdXpForLevel(lvl);
    const max = lvl >= CMD_MAX_LEVEL;
    const port = h('div', { class: 'mn-cmd-stage' },
      h('div', { class: 'px-rays w mn-cmd-rays' }),
      h('div', { class: 'mn-cmd-spot' }),
      h('div', { class: 'mn-cmd-ped' }, h('i', { class: 'mn-cmd-pedring' })),
      h('div', { class: 'px-stars mn-cmd-stars' }),
      cmdFullImg(id, cs?.skin ?? null, { w: 200, h: 250, pose: cs ? 'idle' : null }, `mn-cmd-full ${cs ? '' : 'locked'}`),
      h('div', { class: 'mn-cmd-plate t-d' }, cs ? (equipped ? 'COMMANDER' : 'RECRUITED') : 'LOCKED'));
    // tap the figure: it hops and sparkles
    port.addEventListener('click', () => {
      const im = port.querySelector('.mn-cmd-full');
      if (!im || !cs) return;
      im.classList.remove('hop');
      void im.offsetWidth;
      im.classList.add('hop');
      audio.play('pop', { pitch: 1.1 + Math.random() * 0.3 });
      sparkle(im, { count: 10, spread: 50 });
    });
    let action;
    if (!cs) {
      const u = unlockInfo(def, ctx);
      action = h('div', { class: 'mn-cmd-lock' }, icon('lock'), h('span', { html: rich(u.text) }), u.action ? button(u.action.label, u.action.fn, 'blue sm', { icon: u.action.icon }) : null);
    } else if (equipped) {
      action = h('div', { class: 'mn-cmd-eq t-d outline' }, icon('check', 's'), 'EQUIPPED');
    } else {
      action = button('EQUIP', () => {
        equipCommander(id);
        audio.play('levelUp');
        shell.lock(400);
        shell.render();
        refreshCtx(ctx);
        const st = shell.scroll.querySelector('.mn-cmd-stage');
        if (st) { sparkle(st, { count: 24 }); bump(st); }
        notify(ctx, `*${def.name}* is now your Commander!`, { icon: 'crown' });
      }, 'green lg shine', { icon: 'crown' });
    }
    const info = h('div', { class: 'mn-cmd-info' },
      h('div', { class: 'mn-cmd-name t-d outline' }, def.name),
      cs ? h('div', { class: 'mn-cmd-lvrow' },
        h('div', { class: 'mn-cmd-lv t-d outline' }, h('small', {}, 'LV'), h('span', {}, String(lvl))),
        bar(max ? 1 : Math.min(1, cs.xp / need), 'purple', max ? 'MAX LEVEL' : `${fmtN(cs.xp)} / ${fmtN(need)} XP`, { cls: 'mn-cmd-xp' })) : null,
      h('div', { class: 'mn-cmd-desc' }, def.desc),
      cs ? h('div', { class: 'row wrap gap-s' }, chip([icon('magic', 's'), `Ability power +${Math.round((cmdPower(lvl) - 1) * 100)}%`]), chip([icon('star', 's'), `${perkSlotsForLevel(lvl)} perk slot${perkSlotsForLevel(lvl) > 1 ? 's' : ''}`])) : null,
      action);
    return h('div', { class: `panel sk-panel mn-cmd ${cs ? '' : 'is-locked'}` }, port, info);
  }

  // ---------------------------------------------------------------- abilities
  function abilities() {
    const { def, cs } = view();
    const lvl = cs?.level ?? 0;
    const sig = def.signature;
    const rows = [h('div', { class: 'mn-abil sig' },
      h('div', { class: 'mn-abil-ic' }, icon(sig.icon ?? 'star')),
      h('div', { class: 'mn-abil-t' },
        h('div', { class: 'row gap-s' }, h('b', { class: 't-d outline mn-abil-n' }, sig.name), chip('SIGNATURE', 'sigchip')),
        h('span', { class: 'mn-abil-d' }, sig.desc),
        h('span', { class: 'mn-abil-m' }, icon('clock', 's'), `Charges up in ${sig.charge}s during battle`)))];
    for (const sk of def.skills) {
      const open = lvl >= sk.level;
      rows.push(h('div', { class: `mn-abil ${open ? '' : 'lock'}` },
        h('div', { class: 'mn-abil-ic' }, icon(sk.icon ?? 'star'), open ? null : h('div', { class: 'mn-abil-lk' }, icon('lock'))),
        h('div', { class: 'mn-abil-t' },
          h('div', { class: 'row gap-s' }, h('b', { class: 't-d outline mn-abil-n' }, sk.name), open ? chip([icon('clock', 's'), sk.cd + 's']) : chip(`Unlocks at LV ${sk.level}`, 'lockchip')),
          h('span', { class: 'mn-abil-d' }, sk.desc))));
    }
    return h('div', { class: 'mn-box' }, subHead('ABILITIES'), ...rows);
  }

  // ---------------------------------------------------------------- perks
  function perks() {
    const { id, cs } = view();
    if (!cs) return null;
    const unlocked = perkSlotsForLevel(cs.level);
    const slots = [0, 1, 2].map((i) => {
      const pk = cs.perks[i];
      if (i >= unlocked) {
        return h('div', { class: 'mn-perk lock' }, h('div', { class: 'mn-perk-ic' }, icon('lock')), h('div', { class: 'mn-perk-t' }, h('b', { class: 't-d outline' }, `SLOT ${i + 1}`), h('span', { class: 't-xs c-muted' }, `Unlocks at Commander LV ${SLOT_LEVEL[i]}`)));
      }
      const roll = button(pk ? 'REROLL' : 'ROLL', (e) => doRoll(id, i, e.currentTarget), pk ? 'blue sm' : 'green sm', { price: { cur: 'coins', amount: PERK_ROLL_COST }, sound: 'tap' });
      if (state.p.coins < PERK_ROLL_COST) roll.classList.add('poor');
      if (!pk) {
        return h('div', { class: 'mn-perk empty' }, h('div', { class: 'mn-perk-ic' }, h('span', { class: 't-d' }, '?')), h('div', { class: 'mn-perk-t' }, h('b', { class: 't-d outline' }, 'EMPTY SLOT'), h('span', { class: 't-xs c-muted' }, 'Roll a random perk!')), roll);
      }
      const P = PERKS[pk.id];
      return h('div', { class: `mn-perk t-${pk.tier}`, style: { '--tc': TIER_COLOR[pk.tier] } },
        h('div', { class: 'mn-perk-ic' }, icon(P.icon)),
        h('div', { class: 'mn-perk-t' }, h('div', { class: 'row gap-s' }, h('b', { class: 't-d outline' }, P.name), chip(tierName(pk.tier), 'tierchip')), h('span', { class: 'mn-perk-d' }, perkText(pk))),
        roll);
    });
    return h('div', { class: 'mn-box' }, subHead('PERKS', h('span', { class: 't-xs c-muted' }, 'Bonuses for every battle')), ...slots);
  }

  async function doRoll(cmdId, slot, btnEl) {
    if (state.p.coins < PERK_ROLL_COST) return deny(ctx, `Not enough Beast Coins! A roll costs *${PERK_ROLL_COST}*.`, btnEl);
    const cs = state.p.commanders.owned[cmdId];
    const old = cs.perks[slot];
    const perk = rollCommanderPerk();
    if (!perk) return deny(ctx, 'Not enough Beast Coins!', btnEl);
    refreshCtx(ctx);
    shell.lock(99999);
    const choice = await perkRollModal(perk, old);
    shell.lock(0);
    if (choice === 'new') {
      setPerk(cmdId, slot, perk);
      audio.play('upgrade');
    } else audio.play('tap');
    shell.render();
    const el = shell.scroll.querySelectorAll('.mn-perk')[slot];
    if (el && choice === 'new') { sparkle(el, { count: 18, colors: [TIER_COLOR[perk.tier], '#ffffff', '#ffd84a'] }); bump(el); }
  }

  /** Slot-machine perk reveal; resolves 'new' | 'old'. */
  function perkRollModal(perk, old) {
    return new Promise((resolve) => {
      const reel = h('div', { class: 'mn-reel' });
      const ids = Object.keys(PERKS);
      const card = (pk, cls = '') => {
        const P = PERKS[pk.id];
        return h('div', { class: `mn-pcard ${cls}`, style: { '--tc': TIER_COLOR[pk.tier] } },
          h('div', { class: 'mn-pcard-tier t-d' }, tierName(pk.tier).toUpperCase()),
          h('div', { class: 'mn-pcard-ic' }, icon(P.icon)),
          h('b', { class: 't-d outline mn-pcard-n' }, P.name),
          h('span', { class: 'mn-pcard-d' }, perkText(pk)));
      };
      const foot = h('div', { class: 'row center', style: { gap: 'calc(var(--u)*2)' } });
      let done = false;
      const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
      const m = modal({ title: 'PERK ROLL', color: 'purple', size: 'narrow', cls: 'mn-rollm', body: h('div', { class: 'col center' }, reel), foot, closable: false });
      let n = 0;
      const spin = () => {
        if (m.closed) return;
        const fake = { id: ids[Math.floor(Math.random() * ids.length)], tier: PERK_TIERS[Math.floor(Math.random() * 3)].id, v: '?' };
        clear(reel);
        reel.appendChild(card(fake, 'spin'));
        audio.play('tick', { pitch: 0.8 + n * 0.04 });
        n++;
        if (n < 14) setTimeout(spin, 50 + n * n * 1.6);
        else land();
      };
      const land = () => {
        clear(reel);
        const c = card(perk, 'landed');
        reel.appendChild(c);
        audio.play(perk.tier === 'legendary' || perk.tier === 'epic' ? 'levelUp' : 'pop');
        if (perk.tier === 'legendary') audio.jingle('rare');
        setTimeout(() => sparkle(c, { count: perk.tier === 'legendary' ? 40 : 20, colors: [TIER_COLOR[perk.tier], '#ffffff', '#ffd84a'] }), 30);
        if (old) {
          reel.appendChild(h('div', { class: 'mn-reel-vs' }, h('span', { class: 't-xs c-muted' }, 'Current perk:'), h('span', { class: 'mn-reel-old' }, `${PERKS[old.id].name} (${tierName(old.tier)}): ${perkText(old)}`)));
          foot.append(button('KEEP OLD', () => finish('old'), 'gray'), button('TAKE NEW', () => finish('new'), 'green', { icon: 'check' }));
        } else foot.append(button('EQUIP PERK', () => finish('new'), 'green lg', { icon: 'check' }));
      };
      spin();
    });
  }

  // ---------------------------------------------------------------- outfits
  function outfits() {
    const { id, cs } = view();
    if (!cs) return null;
    const opts = [null, ...cmdSkinsFor(id)];
    const row = h('div', { class: 'mn-outfits' });
    for (const sk of opts) {
      const have = sk === null || cmdSkinOwned(id, sk);
      const sel = (cs.skin ?? null) === sk;
      const name = sk ? CMD_SKINS[sk].name : 'Classic';
      const t = h('div', { class: `mn-pk ${sel ? 'sel' : ''} ${have ? '' : 'lock'}` },
        h('div', { class: 'mn-pk-art' }, cmdImg(id, sk, { size: 128 }), have ? null : icon('lock', 'mn-pk-lock')),
        h('div', { class: 'mn-pk-n' }, name),
        h('div', { class: 'mn-pk-s' }, have ? (sel ? 'Wearing' : 'Owned') : unlockHint('cmdSkin', sk)),
        sel ? h('div', { class: 'mn-pk-tick' }, icon('check', 's')) : null);
      t.addEventListener('click', () => {
        if (!have) { audio.play('deny'); return notify(ctx, `${name}: ${unlockHint('cmdSkin', sk)}`, { icon: 'paint' }); }
        if (sel) return;
        setCmdSkin(id, sk);
        audio.play('magic');
        shell.lock(300);
        shell.render();
        refreshCtx(ctx);
        const st = shell.scroll.querySelector('.mn-cmd-stage');
        if (st) sparkle(st, { count: 20 });
      });
      row.appendChild(t);
    }
    return h('div', { class: 'mn-box' }, subHead('OUTFITS'), row);
  }

  // ---------------------------------------------------------------- level road
  function levelRoad() {
    const { cs } = view();
    if (!cs) return null;
    const row = h('div', { class: 'mn-lvroad scroll-x' });
    for (let L = 2; L <= CMD_MAX_LEVEL; L++) {
      const r = CMD_LEVEL_REWARDS[L];
      if (!r) continue;
      const got = cs.level >= L;
      const ic = r.skill !== undefined ? 'magic' : r.banner ? 'flag' : r.skin ? 'paint' : r.bucks ? 'bucks' : r.coins ? 'coin' : 'star';
      row.appendChild(h('div', { class: `mn-lvn ${got ? 'got' : ''} ${cs.level + 1 === L ? 'next' : ''}` },
        h('div', { class: 'mn-lvn-l t-d outline' }, 'LV ' + L),
        h('div', { class: 'mn-lvn-ic' }, icon(ic), got ? h('div', { class: 'mn-lvn-ck' }, icon('check', 's')) : null),
        h('div', { class: 'mn-lvn-t' }, r.text)));
    }
    setTimeout(() => {
      const nx = row.querySelector('.next');
      if (nx) row.scrollLeft = nx.offsetLeft - row.clientWidth / 2 + nx.offsetWidth / 2;
    }, 0);
    return h('div', { class: 'mn-box' }, subHead('COMMANDER LEVELS', h('span', { class: 't-xs c-muted' }, 'Earn XP in every battle')), row);
  }

  // ---------------------------------------------------------------- roster
  function roster() {
    const own = state.p.commanders.owned;
    const eq = state.p.commanders.equipped;
    const { id: vid } = view();
    const grid = h('div', { class: 'mn-roster' });
    for (const [id, c] of Object.entries(COMMANDERS)) {
      const cs = own[id];
      const t = h('div', { class: `mn-rost ${cs ? '' : 'lock'} ${vid === id ? 'view' : ''} ${eq === id ? 'eq' : ''}` },
        h('div', { class: 'mn-rost-art' }, cmdImg(id, cs?.skin ?? null, { size: 128 })),
        h('div', { class: 'mn-rost-n t-d outline' }, c.name),
        cs ? h('div', { class: 'mn-rost-lv t-d' }, 'LV ' + cs.level) : h('div', { class: 'mn-rost-lk' }, icon('lock', 's')),
        eq === id ? h('div', { class: 'mn-rost-eq' }, icon('crown', 's')) : null);
      t.addEventListener('click', () => {
        if (vid === id) return;
        viewId = id;
        audio.play('cardPick');
        shell.render();
        shell.scroll.scrollTo({ top: 0, behavior: 'smooth' });
      });
      grid.appendChild(t);
    }
    return h('div', { class: 'mn-box' }, subHead('COMMANDERS', h('span', { class: 't-xs c-muted' }, `${Object.keys(own).length}/${Object.keys(COMMANDERS).length} recruited`)), grid);
  }

  // ---------------------------------------------------------------- Lab Level
  function labLevelPanel() {
    const info = labXpInfo();
    const L = info.level;
    const pw = labPower(L), pn = labPower(Math.min(LAB_MAX_LEVEL, L + 1));
    const stat = (ic, label, base, cur, nxt) => h('div', { class: 'mn-labst' }, icon(ic, 'mn-st-ic'),
      h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, label), h('span', { class: 'row', style: { gap: '0.3em' } },
        h('b', { class: 'mn-st-v t-d outline' }, fmtN(Math.round(base * cur))),
        !info.max ? h('span', { class: 'mn-st-plus t-d' }, '+' + fmtN(Math.round(base * nxt) - Math.round(base * cur))) : null)));
    const head = h('div', { class: 'mn-labhead' },
      labBadge(L, 'big'),
      h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.8)' } },
        h('span', { class: 't-d outline mn-labhead-t' }, `LAB LEVEL ${L}`),
        bar(info.max ? 1 : info.xp / Math.max(1, info.need), 'blue', info.max ? 'MAX LEVEL' : `${fmtN(info.xp)} / ${fmtN(info.need)} XP`, { cls: 'mn-labxp' }),
        h('span', { class: 't-xs c-muted' }, 'Earn Lab XP by upgrading cards and winning battles.')));
    const stats = h('div', { class: 'mn-labstats' },
      stat('hp', 'Base Hitpoints', TOWERS.lab.hp, pw, pn),
      stat('sword', 'Base Zapper Damage', TOWERS.lab.dmg, pw, pn));
    const road = h('div', { class: 'mn-labroad scroll-x' });
    for (let lv = 2; lv <= LAB_MAX_LEVEL; lv++) {
      const r = LAB_LEVEL_REWARDS(lv);
      const got = L >= lv;
      road.appendChild(h('div', { class: `mn-labn ${got ? 'got' : ''} ${lv === L + 1 ? 'next' : ''}` },
        labBadge(lv, 'sm'),
        h('div', { class: 'mn-labn-r' }, h('span', {}, icon('coin', 's'), fmtN(r.coins)), h('span', {}, icon('bucks', 's'), String(r.bucks))),
        h('div', { class: 'mn-labn-xp' }, got ? icon('check', 's') : `${fmtN(LAB_XP[lv - 1])} XP`)));
    }
    setTimeout(() => {
      const nx = road.querySelector('.next');
      if (nx) road.scrollLeft = nx.offsetLeft - road.clientWidth / 2 + nx.offsetWidth / 2;
    }, 0);
    const how = h('div', { class: 'mn-labhow' },
      h('div', {}, icon('up', 's'), h('span', {}, 'Each Lab Level: *+7%* base HP, zapper damage and MEGA power')),
      h('div', {}, icon('cards', 's'), h('span', {}, 'Upgrade cards: big Lab XP')),
      h('div', {}, icon('swords', 's'), h('span', {}, 'Win battles: +6 Lab XP')));
    how.querySelectorAll('span').forEach((s) => (s.innerHTML = rich(s.textContent)));
    const go = button('UPGRADE CARDS', () => ctx.openTab?.('cards'), 'blue sm', { icon: 'cards' });
    return h('div', { class: 'panel sk-panel mn-labpanel' }, head, stats, subHead('LEVEL REWARDS'), road, h('div', { class: 'row wrap between gap-s' }, how, go));
  }

  function render() {
    const { cs } = view();
    const inner = h('div', { class: 'mn-inner' },
      h('div', { class: 'mn-labcol' }, secHead('COMMANDER', 'purple'), showcase(), roster(), abilities(), perks(), outfits(), levelRoad()),
      h('div', { class: 'mn-labcol' }, secHead('LAB LEVEL', 'blue'), labLevelPanel()));
    if (!cs) inner.classList.add('viewing-locked');
    return inner;
  }

  shell.render();
  return { dispose: () => shell.dispose(), refresh: () => shell.schedule(40) };
}

/** Lab tab notification count: empty perk slots you can afford to roll. */
export function labBadgeCount() {
  const p = state.p;
  const cs = p.commanders.owned[p.commanders.equipped];
  if (!cs || p.coins < PERK_ROLL_COST) return 0;
  const n = perkSlotsForLevel(cs.level);
  return cs.perks.slice(0, n).filter((x) => !x).length;
}
