// Commanders: roster (owned + locked with unlock hints) and detail view with
// level/XP, signature + skills, level reward track, perk slots (slot-machine
// roll), outfits and EQUIP.
import { h, icon, button, toast, modal } from '../ui.js';
import { audio } from '../../core/audio.js';
import { state, equipCommander, rollCommanderPerk, setPerk, setCmdSkin } from '../../game/state.js';
import {
  COMMANDERS, cmdXpForLevel, CMD_MAX_LEVEL, CMD_LEVEL_REWARDS, PERKS, PERK_TIERS, PERK_ROLL_COST, perkSlotsForLevel, perkText, cmdPower,
} from '../../data/commanders.js';
import { CMD_SKINS, PASS_TIERS } from '../../data/season.js';
import { BOSSES, arenaById } from '../../data/arena.js';
import { makeScreen, cmdImg, sectionTitle, fmt, priceTag, deny, sparkle, slamText, hubMeta, unlockHint } from './common.js';

const TIER_COLOR = { common: 'var(--r-common)', rare: 'var(--r-rare)', epic: 'var(--r-epic)', legendary: 'var(--r-legendary)' };
const TIER_HEX = { common: '#9aa6c8', rare: '#29b6f6', epic: '#b05cff', legendary: '#ffb21a' };
const tierName = (t) => PERK_TIERS.find((x) => x.id === t)?.name ?? t;
const perkSlotLevel = (i) => [1, 4, 8][i];

export function cmdUnlockHint(id) {
  const u = COMMANDERS[id].unlock ?? '';
  if (u === 'starter') return 'Starter Commander';
  if (u.startsWith('boss:')) {
    const b = BOSSES[u.slice(5)];
    return b ? `Beat the ${b.name} boss in ${arenaById(b.arena)?.name ?? 'the Arena'}` : 'Beat a boss on the Arena Map';
  }
  if (u.startsWith('quest:')) return `Complete ${COMMANDERS[id].name}'s quest chain on the Arena Map`;
  if (u.startsWith('season:')) {
    const i = PASS_TIERS.findIndex((t) => (t.free.type === 'commander' && t.free.id === id) || (t.premium.type === 'commander' && t.premium.id === id));
    return i >= 0 ? `FOOD SEASON Pass - tier ${i + 1}` : 'Season Pass reward';
  }
  return 'Keep exploring!';
}

function ownsSkin(cmdId, skinId) {
  const cs = state.p.cosmetics.cmdSkins;
  return !!(cs[skinId] || cs[`${cmdId}:${skinId}`]);
}
export function cmdSkinsFor(cmdId) {
  return Object.entries(CMD_SKINS).filter(([, s]) => s.commander === cmdId || s.commander === '*');
}

export function openCommanders(hub) {
  return makeScreen(hub, {
    name: 'commanders',
    title: 'COMMANDERS',
    color: 'purple',
    cls: 'sc-commanders',
    render() {
      const p = state.p;
      const meta = hubMeta();
      const root = h('div', { class: 'col' });
      root.appendChild(h('div', { class: 'small muted hub-intro' }, 'Commanders ride on top of your Lab. Each has a charged Signature, skills that unlock as they level, and rollable Perks.'));
      const grid = h('div', { class: 'hub-cmd-grid' });
      for (const cmd of Object.values(COMMANDERS)) {
        const c = p.commanders.owned[cmd.id];
        const eq = p.commanders.equipped === cmd.id;
        const card = h('div', { class: `hub-cmd-card px-box ${c ? 'light' : 'dark locked'} ${eq ? 'eq' : ''}` },
          h('div', { class: 'hub-cmd-portrait' }, cmdImg(cmd.id, c?.skin, 128, c ? '' : 'silhouette soft')),
          h('div', { class: 'col grow info' },
            h('div', { class: 'row' }, h('b', { class: 'nm' }, cmd.name), cmd.season ? h('span', { class: 'hub-chip pinkbg tiny' }, 'S' + cmd.season) : null),
            c
              ? [h('div', { class: 'row small' }, h('span', { class: 'hub-lv' }, 'Lv' + c.level), h('span', { class: 'muted' }, cmd.signature.name)),
                h('div', { class: 'bar purple hub-mini-bar' }, h('i', { style: { width: (c.level >= CMD_MAX_LEVEL ? 1 : c.xp / cmdXpForLevel(c.level)) * 100 + '%' } }))]
              : h('div', { class: 'tiny gold hint' }, icon('lock', 'ic-xs'), ' ', cmdUnlockHint(cmd.id)),
          ),
          eq ? h('div', { class: 'hub-eq-tag display' }, 'EQUIPPED') : null,
          c && cmd.id !== 'recruit' && !meta.seenCmds[cmd.id] ? h('div', { class: 'hub-new' }, 'NEW!') : null,
        );
        card.addEventListener('click', () => {
          audio.play('tap');
          hub.openScreen('commander', { id: cmd.id });
        });
        grid.appendChild(card);
      }
      root.appendChild(grid);
      return root;
    },
  });
}

// ---------------------------------------------------------------------------

export function openCommanderDetail(hub, id, opts = {}) {
  const cmd = COMMANDERS[id];
  const meta = hubMeta();
  if (state.p.commanders.owned[id] && !meta.seenCmds[id]) {
    meta.seenCmds[id] = true;
    state.save();
  }
  return makeScreen(hub, {
    name: 'commander',
    title: cmd.name.toUpperCase(),
    color: 'purple',
    size: 'mid',
    cls: 'sc-cmd',
    tabs: [
      { id: 'abilities', label: 'Abilities', icon: 'bolt' },
      { id: 'perks', label: 'Perks', icon: 'dna', hidden: () => !state.p.commanders.owned[id] },
      { id: 'levels', label: 'Rewards', icon: 'star' },
      { id: 'outfits', label: 'Outfits', icon: 'paint', hidden: () => !state.p.commanders.owned[id] },
    ],
    tab: opts.tab ?? 'abilities',
    renderFoot() {
      const c = state.p.commanders.owned[id];
      if (!c) return h('span', { class: 'small gold grow' }, icon('lock', 'ic-xs'), ' ', cmdUnlockHint(id));
      const eq = state.p.commanders.equipped === id;
      return [
        h('span', { class: 'spacer' }),
        eq
          ? h('span', { class: 'hub-chip green' }, icon('check'), 'Equipped')
          : button('EQUIP', () => {
            equipCommander(id);
            audio.play('levelUp');
            toast(`*${cmd.name}* is now your Commander!`, { icon: 'crown' });
          }, 'green big', { icon: 'crown' }),
      ];
    },
    render(scr) {
      const c = state.p.commanders.owned[id];
      const left = h('div', { class: 'col sc-cmd-left' });
      const portrait = h('div', { class: 'hub-pedestal cmd' }, h('div', { class: 'rays' }), cmdImg(id, c?.skin, 192, c ? '' : 'silhouette soft'));
      left.appendChild(portrait);
      if (c) {
        const lvl = c.level;
        const need = cmdXpForLevel(lvl);
        left.appendChild(
          h('div', { class: 'col hub-cmd-lv' },
            h('div', { class: 'row' }, h('span', { class: 'hub-lv big' }, 'LEVEL ' + lvl), h('span', { class: 'spacer' }), h('span', { class: 'small greent' }, `Power x${cmdPower(lvl).toFixed(2)}`)),
            h('div', { class: 'bar purple' }, h('i', { style: { width: (lvl >= CMD_MAX_LEVEL ? 100 : (c.xp / need) * 100) + '%' } }), h('span', { class: 'outline-sm' }, lvl >= CMD_MAX_LEVEL ? 'MAX' : `${c.xp}/${need} XP`)),
            h('div', { class: 'tiny muted' }, 'Earn XP by battling with this Commander equipped.'),
          ),
        );
      } else left.appendChild(h('div', { class: 'hub-find' }, icon('lock'), h('span', {}, h('b', {}, 'Unlock: '), cmdUnlockHint(id))));
      left.appendChild(h('div', { class: 'small muted' }, cmd.desc));

      let right;
      if (scr.tab === 'perks' && c) right = renderPerks(scr, id, c);
      else if (scr.tab === 'levels') right = renderLevels(id, c);
      else if (scr.tab === 'outfits' && c) right = renderOutfits(id, c);
      else right = renderAbilities(id, c);
      return h('div', { class: 'sc-detail cmd' }, left, h('div', { class: 'col sc-cmd-right' }, right));
    },
  });
}

function renderAbilities(id, c) {
  const cmd = COMMANDERS[id];
  const root = h('div', { class: 'col' });
  const sig = cmd.signature;
  root.appendChild(
    h('div', { class: 'hub-sig-card' },
      h('div', { class: 'sig-ic' }, icon(sig.icon)),
      h('div', { class: 'col grow' },
        h('div', { class: 'row' }, h('span', { class: 'tiny display gold' }, 'SIGNATURE'), h('span', { class: 'spacer' }), h('span', { class: 'hub-chip' }, icon('bolt'), `Charge ${sig.charge}s`)),
        h('b', { class: 'big' }, sig.name),
        h('div', { class: 'small' }, sig.desc),
      ),
    ),
  );
  root.appendChild(sectionTitle('SKILLS'));
  for (const sk of cmd.skills) {
    const open = c && c.level >= sk.level;
    root.appendChild(
      h('div', { class: `hub-skill px-box ${open ? 'light' : 'dark locked'}` },
        h('div', { class: 'sk-ic' }, icon(open ? sk.icon : 'lock')),
        h('div', { class: 'col grow' },
          h('div', { class: 'row' }, h('b', {}, sk.name), h('span', { class: 'spacer' }), open ? h('span', { class: 'hub-chip' }, icon('clock'), `${sk.cd}s`) : h('span', { class: 'hub-chip gold' }, `Unlocks at Lv${sk.level}`)),
          h('div', { class: 'small' }, sk.desc),
        ),
      ),
    );
  }
  return root;
}

function perkTile(perk, opts = {}) {
  if (!perk) return h('div', { class: 'hub-perk empty' + (opts.locked ? ' locked' : '') }, icon(opts.locked ? 'lock' : 'dna'), h('span', { class: 'small' }, opts.locked ? `Unlocks at Lv${opts.lvl}` : 'Empty slot'));
  const def = PERKS[perk.id];
  return h('div', { class: 'hub-perk', style: { '--tc': TIER_COLOR[perk.tier] } },
    h('div', { class: 'pk-ic' }, icon(def.icon)),
    h('div', { class: 'col grow' }, h('div', { class: 'row' }, h('b', {}, def.name), h('span', { class: 'spacer' }), h('span', { class: 'pk-tier tiny' }, tierName(perk.tier))), h('span', { class: 'small' }, perkText(perk))),
  );
}

function renderPerks(scr, id, c) {
  const root = h('div', { class: 'col' });
  const slots = perkSlotsForLevel(c.level);
  root.appendChild(h('div', { class: 'small muted' }, 'Perks are passive bonuses for your army. Roll for a random perk, then choose which slot it goes in. Higher tiers roll bigger numbers!'));
  for (let i = 0; i < 3; i++) {
    const locked = i >= slots;
    const t = perkTile(locked ? null : c.perks[i], { locked, lvl: perkSlotLevel(i) });
    root.appendChild(h('div', { class: 'row hub-perk-row' }, h('span', { class: 'display tiny slotn' }, String(i + 1)), t));
  }
  const btn = button(h('span', { class: 'row' }, icon('dna'), h('span', {}, 'ROLL PERK'), priceTag('coin', fmt(PERK_ROLL_COST))), () => rollReveal(scr, id), state.p.coins >= PERK_ROLL_COST ? 'purple big' : 'gray big', {
    onDisabled: () => toast(`Need ${fmt(PERK_ROLL_COST - state.p.coins)} more coins`, { icon: 'x', color: '#b8282f' }),
  });
  if (state.p.coins < PERK_ROLL_COST) btn.classList.add('disabled');
  root.appendChild(h('div', { class: 'row center hub-mt' }, btn));
  root.appendChild(h('div', { class: 'row wrap center hub-tier-legend' }, PERK_TIERS.map((t) => h('span', { class: 'tiny', style: { color: TIER_COLOR[t.id] } }, `${t.name} ${t.weight}%`))));
  return root;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rollReveal(scr, cmdId) {
  const perk = rollCommanderPerk();
  if (!perk) return deny('Not enough coins!');
  const release = scr.hold();
  audio.play('coin');
  const ids = Object.keys(PERKS);
  const reelIc = h('div', { class: 'pk-ic' });
  const reelName = h('b', { class: 'big' });
  const reelVal = h('div', { class: 'small' });
  const reelTier = h('div', { class: 'pk-tier tiny' });
  const win = h('div', { class: 'hub-reel' }, h('div', { class: 'reel-inner' }, reelIc, h('div', { class: 'col' }, reelTier, reelName, reelVal)));
  const actions = h('div', { class: 'col hub-reel-acts' });
  const m = modal({ title: 'PERK ROLL', color: 'purple', size: 'narrow', closable: false, cls: 'hub-screen hub-roll', body: h('div', { class: 'col center' }, h('div', { class: 'hub-reel-frame' }, win), actions) });
  const show = (pk) => {
    const d = PERKS[pk.id];
    reelIc.textContent = '';
    reelIc.appendChild(icon(d.icon));
    reelName.textContent = d.name;
    reelVal.textContent = perkText(pk);
    reelTier.textContent = tierName(pk.tier);
    win.style.setProperty('--tc', TIER_COLOR[pk.tier]);
    win.classList.remove('tickle');
    void win.offsetWidth;
    win.classList.add('tickle');
  };
  let delay = 45;
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    let pk;
    if (i === steps - 1) pk = perk;
    else {
      const pid = ids[Math.floor(Math.random() * ids.length)];
      const tier = PERK_TIERS[Math.floor(Math.random() * PERK_TIERS.length)].id;
      const r = PERKS[pid].range;
      pk = { id: pid, tier, v: Math.round(r[0] + Math.random() * (r[1] - r[0])) };
    }
    show(pk);
    audio.play('tick', { pitch: 0.9 + i * 0.03 });
    await sleep(delay);
    delay *= 1.11;
  }
  win.classList.add('landed');
  audio.play(perk.tier === 'legendary' || perk.tier === 'epic' ? 'chaching' : 'magic');
  if (perk.tier === 'legendary' || perk.tier === 'epic') audio.jingle('rare');
  sparkle(win, { count: perk.tier === 'legendary' ? 40 : 20, colors: [TIER_HEX[perk.tier], '#ffffff', TIER_HEX[perk.tier], '#ffd23f'] });
  slamText(m.panel, tierName(perk.tier).toUpperCase() + '!', 'tier-' + perk.tier);

  const c = state.p.commanders.owned[cmdId];
  const slots = perkSlotsForLevel(c.level);
  actions.appendChild(h('div', { class: 'small muted center-t' }, 'Choose a slot for your new perk:'));
  for (let i = 0; i < slots; i++) {
    const cur = c.perks[i];
    actions.appendChild(
      button(cur ? `Slot ${i + 1}: replace ${PERKS[cur.id].name} (${perkText(cur)})` : `Slot ${i + 1}: empty`, () => {
        setPerk(cmdId, i, perk);
        audio.play('upgrade');
        toast(`Perk equipped: *${PERKS[perk.id].name}*`, { icon: 'dna' });
        m.close();
        release();
      }, cur ? 'small' : 'small green'),
    );
  }
  actions.appendChild(button('Discard', () => {
    m.close();
    release();
  }, 'small gray', { icon: 'x' }));
}

function renderLevels(id, c) {
  const lvl = c?.level ?? 0;
  const root = h('div', { class: 'col' });
  root.appendChild(h('div', { class: 'small muted' }, 'Level up your Commander by battling. Rewards are granted automatically!'));
  const track = h('div', { class: 'hub-lvl-track', 'data-sk': 'lvltrack' });
  for (let L = 1; L <= CMD_MAX_LEVEL; L++) {
    const r = CMD_LEVEL_REWARDS[L];
    const reached = lvl >= L;
    const cur = lvl === L;
    const ics = [];
    if (r?.coins) ics.push(h('span', { class: 'row tiny' }, icon('coin', 'ic-xs'), fmt(r.coins)));
    if (r?.bucks) ics.push(h('span', { class: 'row tiny' }, icon('bucks', 'ic-xs'), fmt(r.bucks)));
    if (r?.banner) ics.push(h('span', { class: 'row tiny' }, icon('flag', 'ic-xs'), 'Banner'));
    if (r?.skin) ics.push(h('span', { class: 'row tiny' }, icon('paint', 'ic-xs'), 'Outfit'));
    if (r?.skill !== undefined) ics.push(h('span', { class: 'row tiny' }, icon('bolt', 'ic-xs'), COMMANDERS[id].skills[r.skill]?.name ?? 'Skill'));
    track.appendChild(
      h('div', { class: `hub-lvl-node ${reached ? 'done' : ''} ${cur ? 'cur' : ''}` },
        h('div', { class: 'dot display' }, reached ? icon('check') : String(L)),
        h('div', { class: 'tiny lbl' }, L === 1 ? 'Start' : r?.text ?? ''),
        h('div', { class: 'col ics' }, ics),
      ),
    );
  }
  root.appendChild(track);
  return root;
}

function renderOutfits(id, c) {
  const root = h('div', { class: 'col' });
  const list = [[null, { name: 'Default' }], ...cmdSkinsFor(id)];
  const grid = h('div', { class: 'hub-opt-row wrap' });
  for (const [sid, sk] of list) {
    const have = sid === null || ownsSkin(id, sid);
    const sel = (c.skin ?? null) === sid;
    const hint = sid === 'gold' ? 'Reach Commander level 10' : unlockHint('cmdSkin', sid) ?? 'Locked';
    const tile = h('div', { class: `hub-opt big ${have ? '' : 'locked'} ${sel ? 'sel' : ''}` },
      cmdImg(id, sid, 128, have ? '' : 'soft-dim'),
      h('div', { class: 'lbl' }, sk.name),
      h('div', { class: 'sub tiny' }, have ? (sel ? 'Wearing' : 'Owned') : hint),
      !have ? h('div', { class: 'lock-ic' }, icon('lock')) : null,
      sel ? h('div', { class: 'check-ic' }, icon('check')) : null,
    );
    tile.addEventListener('click', () => {
      if (!have) return deny(`Unlock *${sk.name}*: ${hint}`);
      if (sel) return;
      setCmdSkin(id, sid);
      audio.play('magic');
      requestAnimationFrame(() => sparkle(tile, { count: 14 }));
    });
    grid.appendChild(tile);
  }
  root.appendChild(grid);
  return root;
}
