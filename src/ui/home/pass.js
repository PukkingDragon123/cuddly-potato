// PASS tab: FOOD SEASON pass (free + premium tracks, tiers from Calories,
// claim / claim all, buy premium), daily season challenges and the NPC quest
// chains (Jimmy's rematch, Nolan, Juan).
import { h, icon, button, bar, sparkle, bump, rich } from '../ui.js';
import { audio } from '../../core/audio.js';
import {
  state, passTier, passClaimable, claimPass, buyPremiumPass, refreshDaily, challengeList, claimChallenge,
  questState, acceptQuest, completeQuest,
} from '../../game/state.js';
import { SEASON, PASS_TIERS } from '../../data/season.js';
import { QUEST_CHAINS, QUEST_NPC_ZONE, BOSSES, arenaById } from '../../data/arenas.js';
import {
  screenShell, secHead, segTabs, chip, timerChip, midnightMs, rewardTile, rewardLabel, rewardDef, showRewards, confirmBox, deny,
  refreshCtx, flyText, charImg, fmtN,
} from './common.js';
import { openBoss } from './boss.js';

const CH_ICON = {
  wins: 'swords', deployFood: 'burger', castfoodThrow: 'burger', martBattles: 'cart', vialsOpened: 'vial', signatures: 'star',
  deployed: 'swarm', cartsSmashed: 'cart', basesDestroyed: 'lab', baseUpgrades: 'up', megasUsed: 'mega',
};
const NPC_NAME = { jimmy: 'Jimmy', nolan: 'Nolan', juan: 'Juan' };

let sub = 'pass';

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
  const shell = screenShell(el, { cls: 'mn-pass', render, after });

  function after() {
    if (sub !== 'pass' || scrolledTo) return;
    scrolledTo = true;
    const target = shell.scroll.querySelector('.mn-prow .claim') ?? shell.scroll.querySelector('.mn-prow.cur');
    if (target) {
      const row = target.closest('.mn-prow');
      shell.scroll.scrollTop = Math.max(0, row.offsetTop - shell.scroll.clientHeight * 0.4);
    }
  }

  // ---------------------------------------------------------------- pass
  function claim(i, track, tileEl) {
    const got = claimPass(i, track);
    if (!got.length) return;
    audio.play('chaching');
    shell.lock(800);
    if (tileEl) { tileEl.classList.add('claimed', 'just'); sparkle(tileEl, { count: 18 }); }
    refreshCtx(ctx);
    const vial = got.some((g) => g.kind === 'vial');
    showRewards(got, { title: `TIER ${i + 1}!`, color: track === 'premium' ? 'gold' : 'pink', note: vial ? 'Vials go to your vial slots on Beast Island.' : null }).then(() => shell.render());
  }
  function claimAll() {
    const got = [];
    for (let i = 0; i < Math.min(passTier(), PASS_TIERS.length); i++) {
      for (const tr of ['free', 'premium']) if (passClaimable(i, tr)) got.push(...claimPass(i, tr));
    }
    if (!got.length) return;
    audio.play('chaching');
    refreshCtx(ctx);
    // merge currencies so the popup stays readable
    const merged = [];
    const sum = {};
    for (const g of got) {
      if (g.kind === 'coins' || g.kind === 'bucks' || g.kind === 'calories') sum[g.kind] = (sum[g.kind] ?? 0) + g.amount;
      else merged.push(g);
    }
    for (const k of ['coins', 'bucks', 'calories']) if (sum[k]) merged.unshift({ type: k, amount: sum[k] });
    showRewards(merged, { title: 'CLAIMED ALL!', note: got.some((g) => g.kind === 'vial') ? 'Vials go to your vial slots on Beast Island.' : null }).then(() => shell.render());
  }
  async function buyPremium(btn) {
    if (state.p.pass.premium) return;
    if (state.p.bucks < SEASON.premiumCost) return deny(ctx, `Not enough Beast Bucks! The Premium Pass costs *${SEASON.premiumCost}*.`, btn);
    const ok = await confirmBox({
      title: 'PREMIUM PASS', color: 'gold', yes: 'BUY', price: { cur: 'bucks', amount: SEASON.premiumCost },
      art: h('div', { class: 'mn-premart' }, icon('crown', 'mn-premart-ic'), icon('burger', 'mn-premart-b')),
      text: 'Unlock the <b>Premium track</b>: Chef Juan &amp; Golden Juan outfits, Swarm skins, animated banners, Lab skins and way more vials!',
    });
    if (!ok) return;
    if (!buyPremiumPass()) return deny(ctx, 'Not enough Beast Bucks!', btn);
    audio.play('chaching');
    audio.jingle('victory');
    refreshCtx(ctx);
    shell.render();
    const hd = shell.scroll.querySelector('.mn-passhead');
    if (hd) { sparkle(hd, { count: 40, colors: ['#ffd84a', '#ffffff', '#ff7ac0'] }); bump(hd); }
  }

  function passView() {
    const p = state.p;
    const tier = passTier();
    const max = tier >= PASS_TIERS.length;
    const into = p.calories - tier * SEASON.calPerTier;
    const claimN = passClaimCount();
    const head = h('div', { class: 'mn-passhead panel sk-panel-pink' },
      h('div', { class: 'mn-passhead-art' }, icon('burger', 'mn-ph-b1'), icon('calorie', 'mn-ph-b2')),
      h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.6)', zIndex: 1 } },
        h('span', { class: 't-xs c-pink t-d' }, `SEASON ${SEASON.id}`),
        h('span', { class: 't-d outline mn-passhead-t' }, SEASON.name),
        h('span', { class: 't-sm' }, SEASON.tagline),
        h('div', { class: 'mn-passbar-row' },
          h('div', { class: 'mn-tierbadge t-d outline' }, h('small', {}, 'TIER'), h('span', {}, String(tier))),
          bar(max ? 1 : into / SEASON.calPerTier, 'orange', max ? 'PASS COMPLETE!' : `${fmtN(into)} / ${SEASON.calPerTier}`, { icon: 'calorie', cls: 'mn-calbar' }))));
    const prem = p.pass.premium
      ? h('div', { class: 'mn-premium on' }, icon('crown', 'l'), h('div', { class: 'col grow', style: { gap: 0 } }, h('b', { class: 't-d outline c-gold t-lg' }, 'PREMIUM ACTIVE'), h('span', { class: 't-xs' }, 'Both tracks unlocked. Enjoy the feast!')))
      : h('div', { class: 'mn-premium panel sk-panel-gold' },
        icon('crown', 'l'),
        h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.3)' } }, h('b', { class: 't-d outline c-gold t-lg' }, 'GET THE PREMIUM PASS'), h('span', { class: 't-xs' }, 'Outfits, skins, animated banners and extra vials on every tier!')),
        (() => { const b = button('BUY', (e) => buyPremium(e.currentTarget), 'yellow shine', { price: { cur: 'bucks', amount: SEASON.premiumCost }, sound: 'tap' }); if (p.bucks < SEASON.premiumCost) b.classList.add('poor'); return b; })());
    const ctrl = h('div', { class: 'mn-trackhead' },
      h('span', { class: 't-d outline' }, 'FREE'),
      claimN > 1 ? button(`CLAIM ALL (${claimN})`, claimAll, 'green sm pulse', { icon: 'gift' }) : h('span', { class: 't-d outline c-muted' }, 'TIERS'),
      h('span', { class: 't-d outline c-gold' }, icon('crown', 's'), ' PREMIUM'));
    const track = h('div', { class: 'mn-track' });
    PASS_TIERS.forEach((t, i) => {
      const reached = i < tier;
      const cur = i === tier;
      const row = h('div', { class: `mn-prow ${reached ? 'reached' : ''} ${cur ? 'cur' : ''} ${i === tier - 1 ? 'last' : ''}` },
        passTile(i, 'free', t.free, reached),
        h('div', { class: 'mn-pnode' }, h('span', { class: 't-d outline' }, String(i + 1)), cur ? h('div', { class: 'mn-pnode-you' }, icon('calorie', 's')) : null),
        passTile(i, 'premium', t.premium, reached));
      track.appendChild(row);
    });
    const fill = tier <= 0 ? 0 : Math.min(1, (Math.min(tier, PASS_TIERS.length) - 0.5) / PASS_TIERS.length);
    track.style.setProperty('--f', fill.toFixed(4));
    return [head, prem, ctrl, track];
  }

  function passTile(i, trackName, r, reached) {
    const p = state.p;
    const premium = trackName === 'premium';
    const claimed = !!(premium ? p.pass.premium_[i] : p.pass.free[i]);
    const can = passClaimable(i, trackName);
    const locked = premium && !p.pass.premium;
    const tile = h('div', { class: `mn-ptile ${premium ? 'prem' : 'free'} ${claimed ? 'claimed' : ''} ${can ? 'claim' : ''} ${locked ? 'plock' : ''} ${reached ? '' : 'future'}` },
      rewardTile(r),
      h('div', { class: 'mn-ptile-txt' }, h('div', { class: 'mn-ptile-n' }, rewardLabel(r)), can ? h('div', { class: 'mn-ptile-claim t-d outline' }, 'CLAIM!') : null),
      claimed ? h('div', { class: 'mn-ptile-ck' }, icon('check')) : null,
      locked ? h('div', { class: 'mn-ptile-lk' }, icon('lock', 's')) : null);
    tile.addEventListener('click', () => {
      if (can) return claim(i, trackName, tile);
      if (claimed) return audio.play('tap');
      audio.play('deny');
      if (locked) ctx.toast?.('Get the *Premium Pass* to unlock this reward!', { icon: 'crown' });
      else ctx.toast?.(`Reach *Tier ${i + 1}* (${fmtN((i + 1) * SEASON.calPerTier)} Calories) to claim ${rewardLabel(r)}.`, { icon: 'calorie' });
    });
    return tile;
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
