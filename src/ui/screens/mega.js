// Mega Forms: base troop -> Mega Form transformation (needs the Mega Serum
// from the Season Pass and a base troop at level 3+).
import { h, icon, button, toast } from '../ui.js';
import { audio } from '../../core/audio.js';
import { state, owned, megaUnlocked, setMega } from '../../game/state.js';
import { SWARMS, MEGA_FORMS, swarmStats } from '../../data/swarms.js';
import { SWARM_SKINS } from '../../data/season.js';
import { makeScreen, swarmImg, hubMeta, sectionTitle, unlockHint, fmt, deny, sparkle } from './common.js';

export const MEGA_MIN_LEVEL = 3;

export function megaStatus(mega) {
  const e = owned(mega.base);
  const serum = megaUnlocked(mega.id);
  const lvl = (e?.level ?? 0) >= MEGA_MIN_LEVEL;
  const done = !!hubMeta().megaDone[mega.id] || !!e?.mega;
  return { e, serum, lvl, ready: serum && lvl && !!e, done, on: !!e?.mega };
}

export function openMega(hub) {
  return makeScreen(hub, {
    name: 'mega',
    title: 'MEGA FORMS',
    color: 'pink',
    size: 'mid',
    cls: 'sc-mega',
    render(scr) {
      const root = h('div', { class: 'col' });
      root.appendChild(h('div', { class: 'hub-mega-hero' }, icon('mega'), h('div', { class: 'col grow' }, h('b', { class: 'display small' }, 'MEGA SERUM LAB'), h('span', { class: 'small' }, 'Inject a Mega Serum into a level 3+ troop to unlock its gigantic MEGA FORM. Toggle which form deploys any time.'))));
      for (const mega of MEGA_FORMS) root.appendChild(megaCard(hub, scr, mega));
      root.appendChild(sectionTitle('COMING SOON'));
      const soon = h('div', { class: 'hub-mega-soon' });
      for (let i = 0; i < 3; i++) soon.appendChild(h('div', { class: 'hub-mega-q px-box dark' }, h('span', { class: 'display big' }, '???'), h('span', { class: 'tiny muted' }, 'Future season')));
      root.appendChild(soon);
      return root;
    },
  });
}

function megaCard(hub, scr, mega) {
  const base = SWARMS[mega.base];
  const st = megaStatus(mega);
  const variant = st.e?.variant ?? 'base';
  const megaSkin = state.p.cosmetics.swarmSkins[mega.id];
  const megaSkinId = typeof megaSkin === 'string' ? megaSkin : null;
  const baseImg = swarmImg(mega.base, variant, st.e?.skin ?? null, 128, st.e ? '' : 'silhouette soft');
  const megaImg = swarmImg(mega.id, variant, megaSkinId, 160, st.serum ? '' : 'soft-dim');
  const lvl = st.e?.level ?? 1;
  const bs = swarmStats(mega.base, lvl, variant);
  const ms = swarmStats(mega.id, lvl, variant);
  const card = h('div', { class: `hub-mega-card px-box light ${st.on ? 'on' : ''}` });
  card.appendChild(
    h('div', { class: 'hub-mega-pair' },
      h('div', { class: `col center mg-side ${st.on ? '' : 'active'}` }, h('div', { class: 'hub-pedestal small r-' + base.rarity }, baseImg), h('b', { class: 'small' }, base.name), h('span', { class: 'tiny muted' }, `HP ${fmt(bs.hp)} · DMG ${fmt(bs.dmg)}`)),
      h('div', { class: 'hub-mega-arrow display' }, '»'),
      h('div', { class: `col center mg-side ${st.on ? 'active' : ''}` }, h('div', { class: 'hub-pedestal r-legendary mega' }, h('div', { class: 'rays' }), megaImg), h('b', { class: 'small pinkt' }, mega.name), h('span', { class: 'tiny muted' }, `HP ${fmt(ms.hp)} · DMG ${fmt(ms.dmg)}`)),
    ),
  );
  card.appendChild(h('div', { class: 'small hub-desc px-box dark' }, mega.desc));
  const req = (ok, text) => h('div', { class: 'hub-req ' + (ok ? 'ok' : '') }, icon(ok ? 'check' : 'x'), h('span', {}, text));
  card.appendChild(
    h('div', { class: 'col hub-reqs' },
      req(st.serum, st.serum ? 'Mega Serum unlocked' : `Mega Serum: ${unlockHint('serum', mega.id) ?? 'Season Pass'}`),
      req(st.lvl, `${base.name} level ${MEGA_MIN_LEVEL}+ (yours: ${st.e ? 'Lv' + st.e.level : 'not found'})`),
    ),
  );
  const acts = h('div', { class: 'row center wrap hub-mt' });
  if (!st.done) {
    const b = button('TRANSFORM!', async () => {
      if (!st.ready) return;
      await hub.runCutscene(async () => {
        if (hub.ctx.megaTransform) await hub.ctx.megaTransform(mega.base);
        hubMeta().megaDone[mega.id] = true;
        setMega(mega.base, true);
      });
      hub.openScreen('mega');
      audio.play('levelUp');
      toast(`*${mega.name}* unlocked! It now deploys from your deck.`, { icon: 'mega' });
    }, st.ready ? 'pink big pulse' : 'gray big', {
      icon: 'mega',
      onDisabled: () => deny(!st.serum ? 'You need the Mega Serum first!' : `Level ${base.name} to ${MEGA_MIN_LEVEL} first!`),
    });
    if (!st.ready) b.classList.add('disabled');
    acts.appendChild(b);
  } else {
    const toggle = h('div', { class: 'hub-toggle' });
    for (const [on, label] of [[false, base.name], [true, 'MEGA']]) {
      const t = h('div', { class: 'opt ' + (st.on === on ? 'sel' : '') }, label);
      t.addEventListener('click', () => {
        if (st.on === on) return;
        setMega(mega.base, on);
        audio.play(on ? 'roar' : 'pop');
        if (on) requestAnimationFrame(() => sparkle(card, { count: 24 }));
      });
      toggle.appendChild(t);
    }
    acts.appendChild(h('span', { class: 'small' }, 'Deploys as:'));
    acts.appendChild(toggle);
  }
  card.appendChild(acts);

  // mega form skins (stored as cosmetics.swarmSkins[megaId] = skinId, see deployInfo)
  const skins = Object.entries(SWARM_SKINS).filter(([, s]) => s.swarm === mega.id);
  if (skins.length && st.done) {
    card.appendChild(sectionTitle('MEGA SKINS'));
    const row = h('div', { class: 'hub-opt-row' });
    for (const [sid, sk] of [[null, { name: 'Default' }], ...skins]) {
      const have = sid === null || state.p.cosmetics.swarmSkins[sid] === true;
      const sel = megaSkinId === sid;
      const tile = h('div', { class: `hub-opt ${have ? '' : 'locked'} ${sel ? 'sel' : ''}` }, swarmImg(mega.id, variant, sid, 96, have ? '' : 'soft-dim'), h('div', { class: 'lbl' }, sk.name), !have ? h('div', { class: 'lock-ic' }, icon('lock')) : null, !have ? h('div', { class: 'sub tiny' }, unlockHint('skin', sid) ?? '') : null, sel ? h('div', { class: 'check-ic' }, icon('check')) : null);
      tile.addEventListener('click', () => {
        if (!have) return deny(`Unlock it from the ${unlockHint('skin', sid) ?? 'Season Pass'}`);
        state.p.cosmetics.swarmSkins[mega.id] = sid;
        state.emit('swarms');
        audio.play('magic');
        hub.ctx.previewSwarm?.(mega.id, variant, sid);
      });
      row.appendChild(tile);
    }
    card.appendChild(row);
  }
  void scr;
  return card;
}
