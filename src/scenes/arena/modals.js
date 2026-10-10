// Arena modals: ranked matchmaking card (ghost opponents), boss challenge card,
// practice confirm and secret-discovery celebration.
import * as THREE from 'three';
import { h, button, icon, modal, toast, bigBanner } from '../../ui/ui.js';
import { swarmThumb, charPortrait } from '../../ui/thumbs.js';
import { audio } from '../../core/audio.js';
import { fx } from '../../core/particles.js';
import { fmt } from '../../core/util.js';
import { state } from '../../game/state.js';
import { game } from '../../game/game.js';
import { ghostOpponent, currentArena, BOSSES, arenaById } from '../../data/arena.js';
import { SWARMS } from '../../data/swarms.js';
import { VIALS } from '../../data/vials.js';
import { COMMANDERS } from '../../data/commanders.js';
import { BANNERS } from '../../data/season.js';

const _v = new THREE.Vector3();

function safeSwarmThumb(id) {
  try {
    return swarmThumb(id);
  } catch (e) {
    return null;
  }
}
function safePortrait(id) {
  try {
    return charPortrait(id);
  } catch (e) {
    return null;
  }
}
function img(src, cls) {
  return src ? h('img', { src, class: cls }) : icon('swarm', cls);
}

export function rewardToasts(list) {
  (list || []).forEach((r, i) => setTimeout(() => toast('+ ' + r.label, { icon: r.icon }), i * 260));
}

export function openSecretReward(A, r, pos) {
  const pl = A.player;
  const p = pos ? _v.copy(pos) : _v.set(pl.pos.x, 1.2, pl.pos.z);
  audio.jingle('rare');
  bigBanner('SECRET FOUND!', r.secret.name, { color: '#ffd23f', dur: 2 });
  fx.confetti(_v.set(p.x, Math.max(1, p.y), p.z), { count: 90 });
  fx.sparkle(_v, { count: 30, color: 0xfff27a, radius: 2 });
  A.engineShake?.(0.25);
  pl.emote('victory', 2);
  pl.chibi.expr('star', 'grin', 2);
  setTimeout(() => {
    toast(r.secret.desc, { icon: 'star' });
    rewardToasts(r.rewards);
  }, 900);
}

// ---------------------------------------------------------------------------
// Ranked matchmaking

export function openMatchmaking(A) {
  const p = state.p;
  const arena = currentArena(p.trophies);
  let opp = null;
  const body = h('div', { class: 'ar-mm' });
  const noDeck = !p.deck || p.deck.length === 0;
  const fight = button('FIGHT!', () => go(), 'pink big pulse', { icon: 'sword', sound: 'bigPop' });
  const reroll = button('Another', () => search(), 'small', { icon: 'speed' });
  const m = modal({
    title: 'RANKED BATTLE',
    color: 'pink',
    size: 'narrow',
    body,
    foot: [reroll, fight],
    onClose: () => {
      A.player.locked = false;
    },
  });
  A.player.locked = true;
  A.player.cancelPath();

  function search() {
    fight.classList.add('disabled');
    reroll.classList.add('disabled');
    body.textContent = '';
    body.appendChild(
      h('div', { class: 'ar-search' }, h('div', { class: 'dots' }, 'SEARCHING'), h('div', { class: 'muted small' }, `${arena.name} · ${fmt(p.trophies)} trophies`)),
    );
    audio.play('whoosh');
    setTimeout(() => {
      if (m.closed) return;
      opp = ghostOpponent(p.trophies, Date.now());
      render();
      audio.play('spawn');
      if (!noDeck) fight.classList.remove('disabled');
      reroll.classList.remove('disabled');
    }, 850);
  }

  function render() {
    body.textContent = '';
    const b = BANNERS[opp.banner] ?? BANNERS.default;
    const strip = h('div', { class: 'banner-strip' + (b.animated === 'pan' ? ' pan' : ''), style: { background: b.css } },
      h('div', { class: 'opp-name' }, opp.name), h('span', { class: 'ar-ghost-tag' }, 'GHOST PLAYER (AI)'));
    body.appendChild(strip);
    const myCmd = COMMANDERS[p.commanders.equipped]?.char ?? 'recruit';
    const oppCmd = COMMANDERS[opp.commander]?.char ?? opp.commander;
    body.appendChild(
      h('div', { class: 'ar-vs-row' },
        h('div', { class: 'ar-who' }, img(safePortrait(myCmd), 'por'), h('b', {}, p.name), h('span', { class: 'stat' }, icon('trophy'), fmt(p.trophies))),
        h('div', { class: 'ar-vs outline' }, 'VS'),
        h('div', { class: 'ar-who' }, img(safePortrait(oppCmd), 'por'), h('b', {}, opp.name), h('span', { class: 'stat' }, icon('trophy'), fmt(opp.trophies))),
      ),
    );
    const deck = h('div', { class: 'ar-deck' });
    for (const id of opp.deck) deck.appendChild(h('div', { class: 'slot' }, img(safeSwarmThumb(id)), h('span', {}, SWARMS[id]?.name ?? id)));
    body.appendChild(h('div', { class: 'section-title' }, `Their deck · Lv.${opp.level}`));
    body.appendChild(deck);
    body.appendChild(h('div', { class: 'tiny muted center', style: { textAlign: 'center' } },
      `Arena: ${arena.name}. Ghost Players are AI-controlled decks matched to your trophies.`));
    if (noDeck) body.appendChild(h('div', { class: 'small redt' }, 'Your deck is empty! Visit the Lab to build one.'));
  }

  function go() {
    if (!opp || noDeck) return;
    m.close();
    A.leaving = true;
    audio.play('horn');
    game.go('battle', { mode: 'ranked', arena: arena.id, opponent: opp });
  }

  search();
  return m;
}

// ---------------------------------------------------------------------------
// Boss challenge

function rewardChips(r) {
  const out = [];
  if (!r) return out;
  if (r.coins) out.push(h('span', { class: 'stat' }, icon('coin'), fmt(r.coins)));
  if (r.bucks) out.push(h('span', { class: 'stat' }, icon('bucks'), fmt(r.bucks)));
  if (r.calories) out.push(h('span', { class: 'stat' }, icon('calorie'), fmt(r.calories)));
  if (r.vial) out.push(h('span', { class: 'stat' }, icon('vial'), VIALS[r.vial]?.name ?? r.vial));
  if (r.swarm) out.push(h('span', { class: 'stat' }, icon('swarm'), SWARMS[r.swarm]?.name ?? r.swarm));
  if (r.commander) out.push(h('span', { class: 'stat' }, icon('crown'), 'Commander: ' + (COMMANDERS[r.commander]?.name ?? r.commander)));
  return out;
}

export function openBossModal(A, bossId) {
  const b = BOSSES[bossId];
  if (!b) return null;
  const p = state.p;
  const defeated = p.bosses?.[bossId] ?? 0;
  const ok = p.bestTrophies >= (b.minTrophies ?? 0);
  const thumb = b.commander === 'jimmy' ? safePortrait('jimmyBoss') : safeSwarmThumb(b.boss ?? 'blob');
  const arena = arenaById(b.arena);
  const challenge = button('CHALLENGE', () => {
    m.close();
    A.leaving = true;
    audio.play('roar');
    game.go('battle', { mode: 'boss', bossId, arena: b.arena });
  }, 'red big' + (ok ? ' pulse' : ''), { icon: 'skull', sound: 'bigPop', onDisabled: () => toast(`Reach ${b.minTrophies} trophies first!`, { icon: 'lock' }) });
  if (!ok) challenge.classList.add('disabled');
  const m = modal({
    title: 'BOSS: ' + b.name.toUpperCase(),
    color: 'purple',
    size: 'narrow',
    body: h('div', { class: 'col' },
      h('div', { class: 'ar-boss' },
        img(thumb, 'bthumb'),
        h('div', { class: 'info' },
          h('div', {}, b.desc),
          h('div', { class: 'small muted' }, `Arena: ${arena?.name ?? b.arena} · Level ${b.level}`),
          h('div', { class: 'row small' }, icon('trophy'), h('span', { class: ok ? 'greent' : 'redt' }, `Requires ${b.minTrophies} best trophies`)),
          h('div', { class: 'row small' }, icon('skull'), defeated ? `Defeated ${defeated}x` : 'Not defeated yet'),
        ),
      ),
      h('div', { class: 'section-title' }, defeated ? 'First-win reward (claimed) · Rematch: bonus coins' : 'Reward'),
      h('div', { class: 'ar-rewards' }, ...rewardChips(defeated ? { coins: Math.round((b.reward.coins ?? 300) * 0.25) } : b.reward)),
    ),
    foot: [challenge],
    onClose: () => {
      A.player.locked = false;
    },
  });
  A.player.locked = true;
  A.player.cancelPath();
  audio.play('growl');
  return m;
}

export function openPractice(A) {
  const go = button('PRACTICE', () => {
    m.close();
    A.leaving = true;
    game.go('battle', { mode: 'practice' });
  }, 'green big', { icon: 'sword' });
  const m = modal({
    title: 'PRACTICE RANGE',
    color: 'green',
    size: 'narrow',
    body: h('div', { class: 'col' },
      h('div', {}, 'Test your deck against training dummies.'),
      h('div', { class: 'small muted' }, 'No trophies won or lost. Great for trying new combos!'),
    ),
    foot: [go],
    onClose: () => {
      A.player.locked = false;
    },
  });
  A.player.locked = true;
  A.player.cancelPath();
  return m;
}
