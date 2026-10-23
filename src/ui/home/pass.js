// PASS tab: FOOD SEASON pass (free + premium tracks, tiers from Calories,
// claim / claim all, buy premium), daily season challenges and the NPC quest
// chains (Jimmy's rematch, Nolan, Juan).
// The pass is a food-truck season poster (3D hero renders, spinning 3D food,
// season clock, the CALORIE METER) above a diner-kitchen track: free trays |
// a spinning 3D dish per tier on a conveyor belt that fills with hot sauce up
// to your tier | premium trays. Every 5th tier is a golden Feastables feast on
// a cake stand. Tap a dish: it spins up, hops and shows the tier's menu card.
// Claims burst, coins fly into the top bar. Unknown reward kinds render as a
// mystery prize.
import { h, icon, iconURL, button, bar, sparkle, bump, rich, burst, flyIcons } from '../ui.js';
import { audio } from '../../core/audio.js';
import {
  state, passTier, passClaimable, claimPass, buyPremiumPass, refreshDaily, challengeList, claimChallenge,
  questState, acceptQuest, completeQuest,
} from '../../game/state.js';
import { SEASON, PASS_TIERS, seasonEndMs, isMilestoneTier } from '../../data/season.js';
import { QUEST_CHAINS, QUEST_NPC_ZONE, BOSSES, arenaById } from '../../data/arenas.js';
import {
  screenShell, secHead, segTabs, chip, timerChip, midnightMs, rewardTile, rewardLabel, rewardDef, rewardArt, showRewards, confirmBox, deny,
  refreshCtx, flyText, charImg, fmtN, countdown, currencyPill, swarmImg, cmdFullImg,
} from './common.js';
import { openBoss } from './boss.js';
import { foodSpin, spinBurst } from '../foodSpin.js';
import { FEAST_KINDS, FEAST_NAMES, FEAST_KCAL } from '../../models/props/feast.js';
import { popIn } from '../tween.js';
import './pass.css';

const CH_ICON = {
  wins: 'swords', deployFood: 'burger', castfoodThrow: 'burger', martBattles: 'cart', vialsOpened: 'vial', signatures: 'star',
  deployed: 'swarm', cartsSmashed: 'cart', basesDestroyed: 'lab', baseUpgrades: 'up', megasUsed: 'mega',
};
const NPC_NAME = { jimmy: 'Jimmy', nolan: 'Nolan', juan: 'Juan' };

let sub = 'pass';

/** The dish served at each tier: milestones are a golden Feastables feast, the rest cycle the menu. */
const MENU = ['burger', 'pizza', 'donut', 'fries', 'feast', 'soda', 'hotdog', 'icecream', 'popcorn', 'cupcake', 'feastPink'].filter((k) => FEAST_KINDS.includes(k));
export function tierFood(i) {
  return isMilestoneTier(i) ? 'feastGold' : MENU[(i - Math.floor((i + 1) / 5)) % MENU.length];
}

export function passClaimCount() {
  const t = passTier();
  let n = 0;
  for (let i = 0; i < Math.min(t, PASS_TIERS.length); i++) {
    if (passClaimable(i, 'free')) n++;
    if (passClaimable(i, 'premium')) n++;
  }
  return n;
}
export function challengeClaimCount() {
  refreshDaily();
  return challengeList().filter((c) => c.done && !c.claimed).length;
}
export function questClaimCount() {
  return Object.keys(QUEST_CHAINS).filter((npc) => questState(npc)?.done).length;
}

export function mount(el, ctx, opts = {}) {
  if (opts.sub) sub = opts.sub;
  let scrolledTo = false;
  let spineShown = false;
  const shell = screenShell(el, { cls: 'mn-pass', render, after });

  function after() {
    if (sub !== 'pass') return;
    layoutSpine();
    if (scrolledTo) return;
    scrolledTo = true;
    const target = shell.scroll.querySelector('.ps-pod.claim') ?? shell.scroll.querySelector('.ps-row.cur');
    if (target) {
      const row = target.closest('.ps-row');
      shell.scroll.scrollTop = Math.max(0, row.offsetTop - shell.scroll.clientHeight * 0.42);
    }
  }
  /** The goo-filled spine runs from the first flask to the last; the fill stops at your progress. */
  function layoutSpine() {
    const trk = shell.scroll.querySelector('.ps-track');
    if (!trk) return;
    const nodes = [...trk.querySelectorAll('.ps-node')];
    if (!nodes.length) return;
    const cy = (n) => n.offsetTop + n.closest('.ps-row').offsetTop + n.offsetHeight / 2;
    const y0 = cy(nodes[0]), y1 = cy(nodes[nodes.length - 1]);
    const spine = trk.querySelector('.ps-spine'), fill = trk.querySelector('.ps-spine-fill');
    spine.style.top = y0 + 'px';
    spine.style.height = Math.max(0, y1 - y0) + 'px';
    const tier = passTier();
    const frac = tier >= PASS_TIERS.length ? 0 : (state.p.calories - tier * SEASON.calPerTier) / SEASON.calPerTier;
    let y = y0;
    if (tier >= nodes.length) y = y1;
    else if (tier > 0) { const a = cy(nodes[tier - 1]), b = cy(nodes[tier]); y = a + (b - a) * frac; }
    else y = y0 + (cy(nodes[Math.min(1, nodes.length - 1)]) - y0) * frac * 0.5;
    fill.style.top = y0 + 'px';
    const hgt = Math.max(0, y - y0);
    if (!spineShown) {
      // first open: the goo pours down the spine to your tier
      spineShown = true;
      fill.style.height = '0px';
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.height = hgt + 'px'; }));
    } else {
      fill.style.transition = 'none';
      fill.style.height = hgt + 'px';
    }
    trk.style.setProperty('--fy', hgt + 'px');
  }

  // ---------------------------------------------------------------- pass
  const SMALL = new Set(['coins', 'bucks', 'calories']);
  function claim(i, track, podEl) {
    const got = claimPass(i, track);
    if (!got.length) return;
    audio.play('chaching');
    shell.lock(1100);
    if (podEl) {
      podEl.classList.add('claimed', 'just');
      podEl.classList.remove('claim');
      burst(podEl.querySelector('.mn-rw') ?? podEl, { color: track === 'premium' ? '#ffd84a' : '#7aff6a', count: 20 });
    }
    refreshCtx(ctx);
    if (got.every((g) => SMALL.has(g.kind))) {
      // quick claim: currencies fly into the top bar, no popup
      for (const g of got) {
        if (g.kind !== 'calories') flyIcons(podEl, g.kind === 'coins' ? 'coin' : 'bucks', currencyPill(g.kind), { count: 6 });
        flyText(podEl, `+${fmtN(g.amount)}`, g.kind === 'bucks' ? 'c-pink' : 'c-gold');
      }
      setTimeout(() => shell.render(), 950);
      return;
    }
    const vial = got.some((g) => g.kind === 'vial');
    showRewards(got, { title: `TIER ${i + 1}!`, color: track === 'premium' ? 'gold' : 'pink', note: vial ? 'Vials go to your vial slots on Beast Island.' : null }).then(() => shell.render());
  }
  function claimAll() {
    const got = [];
    const pods = [...shell.scroll.querySelectorAll('.ps-pod.claim')];
    for (let i = 0; i < Math.min(passTier(), PASS_TIERS.length); i++) {
      for (const tr of ['free', 'premium']) if (passClaimable(i, tr)) got.push(...claimPass(i, tr));
    }
    if (!got.length) return;
    audio.play('chaching');
    pods.slice(0, 6).forEach((el, k) => setTimeout(() => burst(el, { count: 10, rays: false }), k * 70));
    refreshCtx(ctx);
    // merge currencies so the popup stays readable
    const merged = [];
    const sum = {};
    for (const g of got) {
      if (g.kind === 'coins' || g.kind === 'bucks' || g.kind === 'calories') sum[g.kind] = (sum[g.kind] ?? 0) + g.amount;
      else merged.push(g);
    }
    for (const k of ['coins', 'bucks', 'calories']) if (sum[k]) merged.unshift({ type: k, amount: sum[k] });
    shell.lock(500);
    setTimeout(() => showRewards(merged, { title: 'CLAIMED ALL!', note: got.some((g) => g.kind === 'vial') ? 'Vials go to your vial slots on Beast Island.' : null }).then(() => shell.render()), 420);
  }
  async function buyPremium(btn) {
    if (state.p.pass.premium) return;
    if (state.p.bucks < SEASON.premiumCost) return deny(ctx, `Not enough Beast Bucks! The Premium Pass costs *${SEASON.premiumCost}*.`, btn);
    const ok = await confirmBox({
      title: 'PREMIUM PASS', color: 'gold', yes: 'BUY', price: { cur: 'bucks', amount: SEASON.premiumCost },
      art: h('div', { class: 'mn-premart' }, h('div', { class: 'px-rays' }), rewardArt(SEASON.showcase[2] ?? { type: 'cmdSkin', id: 'juanGold' })),
      text: `Unlock the <b>Premium track</b>: ${PASS_TIERS.length} extra rewards including Golden Juan, new Swarms, outfits, the Mansion Lab and a <b>Golden MEGA</b>!`,
    });
    if (!ok) return;
    if (!buyPremiumPass()) return deny(ctx, 'Not enough Beast Bucks!', btn);
    audio.play('chaching');
    audio.jingle('victory');
    refreshCtx(ctx);
    shell.render();
    const hd = shell.scroll.querySelector('.ps-prem');
    if (hd) { burst(hd, { count: 36, colors: ['#ffd84a', '#ffffff', '#ff7ac0'], scale: 1 }); bump(hd); }
  }

  function passView() {
    const p = state.p;
    const N = PASS_TIERS.length;
    const tier = passTier();
    const max = tier >= N;
    const into = max ? SEASON.calPerTier : p.calories - tier * SEASON.calPerTier;
    const claimN = passClaimCount();
    return [hero(tier, into, max), premiumPanel(), lanesHead(claimN), track(tier), seasonEnd()];
  }

  /** Season poster: pixel food + sunburst, 3D hero renders, title, season clock and the Calorie tube. */
  function hero(tier, into, max) {
    const N = PASS_TIERS.length;
    const frac = max ? 1 : into / SEASON.calPerTier;
    // the season buffet: spinning 3D dishes on the poster's picnic table (tap one for a spin)
    const buffet = h('div', { class: 'ps-buffet' }, ...['feast', 'burger', 'donut', 'pizza', 'icecream'].map((k, i) => {
      const f = foodSpin(k, { plate: 'plate', size: 144, cls: `ps-hfood f${i}` });
      f.addEventListener('click', (e) => { e.stopPropagation(); audio.play('boing'); spinBurst(f, { hop: 16 }); sparkle(f, { count: 10, colors: ['#ffd84a', '#ff7ac0', '#ffffff', '#ff8a1f'] }); });
      return f;
    }));
    const foods = [];
    const art = h('div', { class: 'ps-hero-art' },
      h('div', { class: 'px-rays ps-hero-rays' }),
      swarmImg(SEASON.hero.swarm, 'base', null, 192, 'ps-hero-swarm'),
      cmdFullImg(SEASON.hero.cmd, SEASON.hero.cmdSkin, { w: 120, h: 150, priority: true }, 'ps-hero-cmd'));
    // CALORIE METER: order tickets for this tier / the next, a sizzling hot-sauce gauge between
    const ticket = (n, cls, lbl) => h('div', { class: 'ps-tk ' + cls }, h('small', { class: 't-d' }, lbl), h('b', { class: 't-d' }, String(n)));
    const pct = Math.max(0, Math.min(1, frac));
    const xp = h('div', { class: 'ps-xp ps-meter' },
      ticket(Math.min(tier, N), 'cur', 'TIER'),
      h('div', { class: 'ps-meter-body' },
        h('div', { class: 'ps-meter-cap t-d' }, icon('calorie', 's'), 'CALORIE METER'),
        h('div', { class: 'ps-tube' },
          h('i', { class: 'ps-tube-fill', style: { width: pct * 100 + '%' } }, h('span', { class: 'ps-meter-flame' }, icon('fire'))),
          h('span', { class: 'ps-meter-ticks' }),
          h('span', { class: 'ps-tube-lbl t-d outline' }, max ? 'PASS COMPLETE!' : `${fmtN(into)} / ${SEASON.calPerTier} CAL`))),
      ticket(max ? N : tier + 1, 'next', max ? 'DONE' : 'NEXT'));
    return h('div', { class: 'ps-hero sk-plate-hazard' },
      h('div', { class: 'ps-hero-bg' }), ...foods, art,
      h('div', { class: 'ps-hero-txt' },
        h('div', { class: 'ps-hero-chips' },
          h('span', { class: 'ps-sn t-d' }, icon('ticket', 's'), `SEASON ${SEASON.id}`),
          h('span', { class: 'ps-timer' }, icon('clock', 's'), h('span', { class: 'c-muted' }, 'Ends in'), countdown(seasonEndMs(), 'c-gold t-d', true))),
        h('div', { class: 'ps-title t-d t-3d' }, ...SEASON.name.split(' ').map((w) => h('span', {}, w))),
        h('div', { class: 'ps-tagline' }, SEASON.tagline),
        h('div', { class: 'ps-tiers t-d' }, `TIER ${Math.min(tier, N)} / ${N}`)),
      buffet, xp);
  }

  function premiumPanel() {
    const p = state.p;
    const show = h('div', { class: 'ps-show' }, ...SEASON.showcase.map((r, i) => h('div', { class: `ps-show-i s${i}` }, rewardArt(r))));
    if (p.pass.premium) {
      return h('div', { class: 'ps-prem on panel sk-panel-gold' }, h('div', { class: 'px-stars' }), show,
        h('div', { class: 'ps-prem-txt' }, h('b', { class: 't-d ps-prem-t' }, icon('crown', 's'), ' PREMIUM ACTIVE'), h('span', { class: 't-xs' }, 'Both tracks unlocked. Enjoy the feast!')));
    }
    const b = button('BUY', (e) => buyPremium(e.currentTarget), 'yellow shine ps-prem-buy', { price: { cur: 'bucks', amount: SEASON.premiumCost }, sound: 'tap' });
    if (p.bucks < SEASON.premiumCost) b.classList.add('poor');
    return h('div', { class: 'ps-prem panel sk-panel-gold' }, h('div', { class: 'px-stars' }), show,
      h('div', { class: 'ps-prem-txt' },
        h('b', { class: 't-d ps-prem-t' }, 'PREMIUM PASS'),
        h('span', { class: 't-xs' }, `${PASS_TIERS.length} extra rewards: Golden Juan, new Swarms, the Mansion Lab and a GOLDEN MEGA!`)),
      b);
  }

  function lanesHead(claimN) {
    return h('div', { class: 'ps-lanes' },
      h('span', { class: 'ps-lane free t-d outline' }, h('span', { class: 'ps-awn' }), h('span', { class: 'ps-lane-t' }, icon('gift', 's'), 'FREE MENU')),
      claimN > 1 ? button(`CLAIM ALL (${claimN})`, claimAll, 'green sm pulse', { icon: 'gift' }) : h('span', { class: 'ps-lane mid t-d outline' }, `${PASS_TIERS.length} COURSES`),
      h('span', { class: `ps-lane prem t-d outline ${state.p.pass.premium ? '' : 'locked'}` }, h('span', { class: 'ps-awn' }), h('span', { class: 'ps-lane-t' }, icon(state.p.pass.premium ? 'crown' : 'lock', 's'), 'CHEF\'S SPECIAL')));
  }

  function track(tier) {
    const trk = h('div', { class: 'ps-track' }, h('div', { class: 'ps-spine' }), h('div', { class: 'ps-spine-fill' }));
    PASS_TIERS.forEach((t, i) => {
      const reached = i < tier, cur = i === tier, ms = isMilestoneTier(i);
      const kind = tierFood(i);
      const dish = foodSpin(kind, { plate: ms ? 'gold' : 'plate', gold: ms, size: ms ? 176 : 144, cls: 'ps-dish' });
      const node = h('div', { class: 'ps-node', role: 'button', 'aria-label': `Tier ${i + 1}: ${FEAST_NAMES[kind] ?? kind}` },
        dish,
        h('b', { class: 'ps-node-n t-d outline' }, String(i + 1)),
        cur ? h('div', { class: 'ps-you t-d' }, icon('calorie', 's'), 'NEXT') : null);
      node.addEventListener('click', (e) => { e.stopPropagation(); dishInfo(i, kind, node, dish, t, reached); });
      trk.appendChild(h('div', { class: `ps-row ${reached ? 'reached' : ''} ${cur ? 'cur' : ''} ${ms ? 'ms' : ''}`, 'data-i': i },
        ms ? h('div', { class: 'ps-ms-tag t-d' }, h('span', {}, `TIER ${i + 1}`)) : null,
        passTile(i, 'free', t.free, reached, ms), node, passTile(i, 'premium', t.premium, reached, ms)));
    });
    return trk;
  }

  function seasonEnd() {
    return h('div', { class: 'ps-end sk-plate-dark plate' },
      icon('gate', 'ps-end-ic'),
      h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.4)', minWidth: 0 } },
        h('b', { class: 't-d outline ps-end-t' }, `SEASON ${SEASON.id + 1}: COMING SOON`),
        h('span', { class: 't-xs c-muted' }, 'A brand new theme, new Swarms and new rewards when this season ends.')),
      h('span', { class: 'ps-timer' }, icon('clock', 's'), countdown(seasonEndMs(), 'c-gold t-d', true)));
  }

  function passTile(i, trackName, r, reached, ms = false) {
    const p = state.p;
    const premium = trackName === 'premium';
    const claimed = !!(premium ? p.pass.premium_[i] : p.pass.free[i]);
    const can = passClaimable(i, trackName);
    const locked = premium && !p.pass.premium;
    const sk = can ? 'sk-pod-green' : claimed ? 'sk-pod-dim' : premium ? 'sk-pod-gold' : 'sk-pod';
    const tile = h('div', { class: `ps-pod ${sk} ${premium ? 'prem' : 'free'} ${claimed ? 'claimed' : ''} ${can ? 'claim' : ''} ${locked ? 'plock' : ''} ${reached ? 'reached' : 'future'} ${ms ? 'ms' : ''}` },
      ms && !claimed ? h('div', { class: 'px-rays w ps-pod-rays' }) : null,
      premium && !claimed && !locked ? h('div', { class: 'px-stars' }) : null,
      h('div', { class: 'ps-pod-art' }, safeTile(r)),
      h('div', { class: 'ps-pod-n' }, safeLabel(r)),
      can ? h('div', { class: 'ps-pod-claim t-d outline' }, 'CLAIM!') : null,
      claimed ? h('div', { class: 'ps-pod-ck' }, icon('check')) : null,
      locked ? h('div', { class: 'ps-pod-lk' }, icon('lock')) : null);
    tile.addEventListener('click', () => {
      if (can) return claim(i, trackName, tile);
      if (claimed) return audio.play('tap');
      audio.play('deny');
      bump(tile, 'shake-x');
      if (locked) ctx.toast?.('Get the *Premium Pass* to unlock this reward!', { icon: 'crown' });
      else ctx.toast?.(`Reach *Tier ${i + 1}* (${fmtN((i + 1) * SEASON.calPerTier)} Calories) to claim ${safeLabel(r)}.`, { icon: 'calorie' });
    });
    return tile;
  }

  /** Reward kinds this screen doesn't know yet (new season data) show as a mystery prize instead of breaking the track. */
  function safeTile(r) {
    try {
      const d = rewardDef(r);
      if (d && d.type && d.type !== 'unknown' && rewardLabel(d) !== '???') return rewardTile(d);
    } catch (e) { console.warn('pass reward', r, e); }
    return h('div', { class: 'mn-rw k-mystery' }, h('div', { class: 'mn-ra mystery' }, icon('gift', 'mn-ra-ic big')), h('div', { class: 'mn-rw-amt t-d outline' }, '?'));
  }
  function safeLabel(r) {
    try { const l = rewardLabel(r); if (l && l !== '???') return l; } catch (e) { /* unknown */ }
    return 'Mystery Prize';
  }

  /** Tap a dish: it spins up and hops, crumbs fly, and the tier's menu card pops up. */
  let tipEl = null, tipT = 0;
  function dishInfo(i, kind, node, dish, t, reached) {
    audio.play('boing');
    setTimeout(() => audio.play('chomp', { vol: 0.5 }), 120);
    spinBurst(dish);
    sparkle(dish, { count: 14, spread: 70, colors: isMilestoneTier(i) ? ['#ffd84a', '#fff6c0', '#ffffff'] : ['#ffd84a', '#ff7ac0', '#ffffff', '#ff8a1f', '#7aff6a'] });
    tipEl?.remove();
    clearTimeout(tipT);
    const p = state.p;
    const need = (i + 1) * SEASON.calPerTier - p.calories;
    const status = reached ? h('span', { class: 'ps-mc-st ok t-d' }, icon('check', 's'), 'SERVED!')
      : i === passTier() ? h('span', { class: 'ps-mc-st cur t-d' }, icon('calorie', 's'), `${fmtN(Math.max(0, need))} CAL TO GO`)
        : h('span', { class: 'ps-mc-st t-d' }, icon('lock', 's'), `${fmtN((i + 1) * SEASON.calPerTier)} CAL`);
    const line = (cls, ic, r) => h('div', { class: 'ps-mc-l ' + cls }, icon(ic, 's'), h('span', {}, safeLabel(r)));
    tipEl = h('div', { class: 'ps-menucard' + (isMilestoneTier(i) ? ' gold' : '') },
      h('div', { class: 'ps-mc-h' }, h('b', { class: 't-d' }, FEAST_NAMES[kind] ?? 'Mystery Dish'), h('span', { class: 'ps-mc-k t-d' }, `${FEAST_KCAL[kind] ?? 500} kcal`)),
      h('div', { class: 'ps-mc-t t-d' }, `COURSE ${i + 1}`, isMilestoneTier(i) ? ' · FEAST!' : ''),
      line('free', 'gift', t.free), line('prem', 'crown', t.premium), status);
    node.appendChild(tipEl);
    popIn(tipEl);
    const kill = tipEl;
    tipT = setTimeout(() => { if (kill.isConnected) kill.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -6px) scale(0.9)' }], { duration: 180 }).onfinish = () => kill.remove(); }, 2800);
  }

  // ---------------------------------------------------------------- challenges
  function challengesView() {
    refreshDaily();
    const list = challengeList();
    const rows = list.map((c) => {
      const row = h('div', { class: `mn-chal ${c.claimed ? 'claimed' : c.done ? 'done' : ''}` },
        h('div', { class: 'mn-chal-ic' }, icon(CH_ICON[c.stat] ?? 'star')),
        h('div', { class: 'mn-chal-t' },
          h('b', { class: 'mn-chal-n' }, c.text),
          bar(c.prog / c.n, c.done ? 'green' : 'orange', `${c.prog}/${c.n}`, { cls: 'mn-chal-bar' })),
        h('div', { class: 'mn-chal-r' },
          h('div', { class: 'mn-chal-cal t-d outline' }, icon('calorie', 's'), '+' + c.cal),
          c.claimed ? h('div', { class: 'mn-chal-ok t-d outline' }, icon('check', 's'), 'DONE')
            : c.done ? button('CLAIM', (e) => {
              const btn = e.currentTarget;
              const before = passTier();
              const cal = claimChallenge(c.id);
              if (!cal) return;
              audio.play('coin');
              audio.play('levelUp');
              shell.lock(900);
              sparkle(row, { count: 20, colors: ['#ff8a1f', '#ffd84a', '#ffffff'] });
              flyText(btn, `+${cal} Calories`, 'c-gold');
              row.classList.add('claimed');
              refreshCtx(ctx);
              if (passTier() > before) ctx.toast?.(`Food Pass *Tier ${passTier()}* reached! Claim your rewards.`, { icon: 'calorie' });
              setTimeout(() => shell.render(), 900);
            }, 'green sm pulse') : null));
      return row;
    });
    return [
      h('div', { class: 'mn-sec-row' }, secHead('DAILY CHALLENGES', 'gold'), timerChip(midnightMs(), 'New in')),
      h('div', { class: 'mn-box' }, h('div', { class: 't-sm c-muted' }, 'Complete challenges in battles to earn Calories for the Food Pass.'), ...rows),
    ];
  }

  // ---------------------------------------------------------------- quests
  function questCard(npc) {
    const st = questState(npc);
    const portrait = h('div', { class: 'mn-npc-port' }, charImg(npc, { size: 128 }));
    const head = h('div', { class: 'mn-npc-head' }, h('b', { class: 't-d outline mn-npc-name' }, NPC_NAME[npc]),
      st && !st.finished ? h('div', { class: 'mn-steps' }, ...Array.from({ length: st.steps }, (_, k) => h('i', { class: k < st.step ? 'done' : k === st.step ? 'cur' : '' }))) : null);
    const zone = arenaById(QUEST_NPC_ZONE[npc]);
    let body;
    if (!st) body = h('div', { class: 'c-muted' }, 'No quests right now.');
    else if (st.finished) body = h('div', { class: 'mn-quest-done' }, icon('check', 'l'), h('span', {}, `All of ${NPC_NAME[npc]}'s quests complete!`));
    else {
      const q = st.quest;
      const rewards = h('div', { class: 'row wrap gap-s mn-qrew' }, h('span', { class: 't-xs c-muted' }, 'Reward:'), ...rewardsOf(q.reward).map((r) => chip([rewardTile(r, { cls: 'xs' }), rewardLabel(r)], 'rwchip')));
      let action = null;
      if (!st.accepted) action = button('ACCEPT', () => { acceptQuest(npc); audio.play('magic'); refreshCtx(ctx); shell.render(); }, 'blue sm', { icon: 'quest' });
      else if (st.done) {
        action = button('CLAIM', async () => {
          const got = completeQuest(npc);
          if (!got.length) return;
          audio.play('chaching');
          refreshCtx(ctx);
          shell.lock(600);
          await showRewards(got, { title: 'QUEST DONE!', color: 'green' });
          shell.render();
        }, 'green sm pulse', { icon: 'gift' });
      } else if (q.boss) action = button('FIGHT', () => openBoss(q.boss, ctx), 'red sm', { icon: 'boss' });
      else if (q.secret) action = button('SEARCH', () => ctx.focusArena?.(QUEST_NPC_ZONE[npc]), 'teal sm', { icon: 'eye' });
      body = h('div', { class: 'mn-quest' },
        h('div', { class: 'row gap-s' }, h('b', { class: 't-d outline c-gold mn-quest-t' }, q.title), chip(`Quest ${st.step + 1}/${st.steps}`)),
        h('span', { class: 'mn-quest-x', html: rich(st.text) }),
        st.accepted && q.stat ? bar(st.prog / st.need, st.done ? 'green' : 'blue', `${st.prog}/${st.need}`, { cls: 'mn-quest-bar' }) : null,
        q.secret && st.accepted && !st.done && zone ? h('span', { class: 't-xs c-blue' }, icon('island', 's'), ` Hidden in the ${zone.name} zone`) : null,
        h('div', { class: 'row between wrap gap-s' }, rewards, action));
    }
    return h('div', { class: `mn-npc n-${npc} ${st?.done ? 'ready' : ''}` }, portrait, h('div', { class: 'mn-npc-main' }, head, body));
  }
  function jimmyCard() {
    const has = !!state.p.commanders.owned.jimmy;
    const b = BOSSES.jimmyRematch;
    const ok = state.p.bestTrophies >= b.minTrophies;
    const body = has
      ? h('div', { class: 'mn-quest-done' }, icon('check', 'l'), h('span', {}, 'You beat Jimmy! He joined your Lab as a Commander.'))
      : h('div', { class: 'mn-quest' },
        h('b', { class: 't-d outline c-gold mn-quest-t' }, 'The Rematch'),
        h('span', { class: 'mn-quest-x' }, b.desc),
        h('div', { class: 'row between wrap gap-s' },
          h('div', { class: 'row wrap gap-s mn-qrew' }, h('span', { class: 't-xs c-muted' }, 'Reward:'), chip([rewardTile({ type: 'commander', id: 'jimmy' }, { cls: 'xs' }), 'Jimmy (Commander)'], 'rwchip')),
          button(ok ? 'FIGHT' : `${b.minTrophies}`, () => openBoss('jimmyRematch', ctx), ok ? 'red sm' : 'gray sm', { icon: ok ? 'boss' : 'trophy' })));
    return h('div', { class: 'mn-npc n-jimmy' }, h('div', { class: 'mn-npc-port' }, charImg('jimmy', { size: 128 })), h('div', { class: 'mn-npc-main' }, h('div', { class: 'mn-npc-head' }, h('b', { class: 't-d outline mn-npc-name' }, 'Jimmy')), body));
  }
  function rewardsOf(b) {
    const out = [];
    if (!b) return out;
    if (b.coins) out.push({ type: 'coins', amount: b.coins });
    if (b.bucks) out.push({ type: 'bucks', amount: b.bucks });
    if (b.calories) out.push({ type: 'calories', amount: b.calories });
    if (b.vial) out.push({ type: 'vial', id: b.vial });
    if (b.card || b.swarm) out.push({ type: 'card', id: b.card ?? b.swarm, copies: b.copies ?? 1 });
    if (b.commander) out.push({ type: 'commander', id: b.commander });
    if (b.banner) out.push({ type: 'banner', id: b.banner });
    return out.map(rewardDef);
  }
  function questsView() {
    return [
      secHead('BEAST ISLAND QUESTS', 'green'),
      h('div', { class: 't-sm c-muted center-t' }, 'Help the crew around Beast Island for big rewards and new Commanders!'),
      jimmyCard(), ...Object.keys(QUEST_CHAINS).map(questCard),
    ];
  }

  function render() {
    const tabs = segTabs([
      { id: 'pass', label: 'PASS', icon: 'calorie', badge: passClaimCount() },
      { id: 'chal', label: 'DAILY', icon: 'star', badge: challengeClaimCount() },
      { id: 'quests', label: 'QUESTS', icon: 'quest', badge: questClaimCount() },
    ], sub, (id) => { sub = id; scrolledTo = false; shell.render(); shell.scroll.scrollTop = 0; }, 'mn-passtabs');
    const content = sub === 'chal' ? challengesView() : sub === 'quests' ? questsView() : passView();
    return h('div', { class: `mn-inner sub-${sub}` }, tabs, ...content);
  }

  shell.render();
  return { dispose: () => shell.dispose(), refresh: () => shell.schedule(40) };
}
