// FOOD SEASON pass: free + premium reward track, premium purchase and the
// daily Season Challenges.
import { h, icon, button, toast, modal } from '../ui.js';
import { audio } from '../../core/audio.js';
import { state, passTier, passClaimable, claimPass, buyPremiumPass, challengeList, claimChallenge } from '../../game/state.js';
import { SEASON, PASS_TIERS } from '../../data/season.js';
import {
  makeScreen, rewardArt, rewardLabel, rewardKind, showRewards, confirmBox, fmt, fmtTime, sparkle, slamText, deny, sectionTitle,
} from './common.js';

export function passAlerts() {
  const t = passTier();
  for (let i = 0; i < t; i++) if (passClaimable(i, 'free') || passClaimable(i, 'premium')) return true;
  return challengeList().some((c) => c.done && !c.claimed);
}

function secsToMidnight() {
  const now = new Date();
  const m = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return (m - now) / 1000;
}

function tierProgress() {
  const cal = state.p.calories;
  const t = passTier();
  const max = t >= PASS_TIERS.length;
  const into = max ? SEASON.calPerTier : cal - t * SEASON.calPerTier;
  return { t, max, into, frac: max ? 1 : into / SEASON.calPerTier };
}

function infoPopup(r, tierIdx, track) {
  const m = modal({
    title: `TIER ${tierIdx + 1} · ${track === 'premium' ? 'PREMIUM' : 'FREE'}`,
    color: track === 'premium' ? 'yellow' : 'pink',
    size: 'narrow',
    cls: 'hub-screen',
    body: h('div', { class: 'col center hub-info-pop' }, h('div', { class: 'hub-info-art' }, rewardArt(r, 160)), h('b', { class: 'big' }, rewardLabel(r)), h('span', { class: 'muted small' }, rewardKind(r))),
    foot: button('OK', () => m.close(), 'small'),
  });
}

export function openPass(hub, opts = {}) {
  let scrolled = false;
  return makeScreen(hub, {
    name: 'pass',
    title: 'SEASON PASS',
    color: 'pink',
    cls: 'sc-pass',
    tabs: [
      { id: 'track', label: 'Rewards', icon: 'star', dot: () => { const t = passTier(); for (let i = 0; i < t; i++) if (passClaimable(i, 'free') || passClaimable(i, 'premium')) return true; return false; } },
      { id: 'challenges', label: 'Challenges', icon: 'quest', dot: () => challengeList().some((c) => c.done && !c.claimed) },
    ],
    tab: opts.tab ?? 'track',
    tick(scr) {
      const el = scr.panel.querySelector('.js-reset');
      if (el) el.textContent = fmtTime(secsToMidnight());
    },
    render(scr) {
      const root = h('div', { class: 'col' });
      root.appendChild(header(scr));
      if (scr.tab === 'challenges') root.appendChild(renderChallenges());
      else root.appendChild(renderTrack(scr));
      return root;
    },
    afterRender(scr) {
      if (scrolled || scr.tab !== 'track') return;
      scrolled = true;
      const tr = scr.panel.querySelector('.hub-pass-track');
      const cur = scr.panel.querySelector('.hub-pass-col.cur') || scr.panel.querySelector('.hub-pass-col.claimable');
      if (tr && cur) tr.scrollLeft = Math.max(0, cur.offsetLeft - tr.clientWidth / 2 + cur.clientWidth / 2);
    },
    onTab(scr, t) {
      if (t === 'track') {
        scrolled = false;
        scr.rerender();
      }
    },
  });
}

function header(scr) {
  const p = state.p;
  const tp = tierProgress();
  const hero = h('div', { class: 'hub-pass-hero' },
    h('div', { class: 'hero-stripes' }),
    (scr.heroRow = h('div', { class: 'hero-row' },
      h('div', { class: 'col hero-title' }, h('span', { class: 'display outline title' }, SEASON.name), h('span', { class: 'outline-sm tag' }, SEASON.tagline)),
      h('div', { class: 'col grow hero-prog' },
        h('div', { class: 'row' }, icon('calorie'), h('b', { class: 'outline-sm' }, `Tier ${tp.t}/${PASS_TIERS.length}`), h('span', { class: 'spacer' }), h('span', { class: 'small outline-sm' }, `${fmt(p.calories)} Calories`)),
        h('div', { class: 'bar orange' }, h('i', { style: { width: tp.frac * 100 + '%' } }), h('span', { class: 'outline-sm' }, tp.max ? 'COMPLETE!' : `${tp.into}/${SEASON.calPerTier} to tier ${tp.t + 1}`)),
      ),
      p.pass.premium
        ? h('div', { class: 'hub-premium-badge display' }, icon('crown'), 'PREMIUM')
        : button(h('span', { class: 'col' }, h('span', {}, 'GET PREMIUM'), h('span', { class: 'row tiny' }, icon('bucks'), String(SEASON.premiumCost))), async () => {
          const ok = await confirmBox({
            title: 'PREMIUM PASS',
            color: 'yellow',
            text: `Unlock the <b>FOOD SEASON Premium Pass</b>: an extra reward every tier, including skins, animated banners, Lab skins and the Golden Juan outfit!`,
            yes: 'BUY',
            price: { cur: 'bucks', amount: SEASON.premiumCost },
            yesCls: 'yellow',
          });
          if (!ok) return;
          if (!buyPremiumPass()) return deny('Not enough Beast Bucks!');
          audio.jingle('victory');
          audio.play('chaching');
          requestAnimationFrame(() => {
            slamText(scr.panel, 'PREMIUM!', 'gold');
            sparkle(scr.panel, { count: 50, spread: 220 });
          });
        }, 'yellow pulse'),
    )),
  );
  return hero;
}

function renderTrack(scr) {
  const p = state.p;
  const t = passTier();
  const wrap = h('div', { class: 'col' });
  const claimables = [];
  for (let i = 0; i < t; i++) {
    if (passClaimable(i, 'free')) claimables.push([i, 'free']);
    if (passClaimable(i, 'premium')) claimables.push([i, 'premium']);
  }
  const doClaim = (i, track) => {
    const got = claimPass(i, track);
    if (!got.length) return;
    showRewards(got, { title: `TIER ${i + 1} REWARD!` });
  };
  if (claimables.length > 1) {
    const hero = scr.heroRow;
    const btn = button(`Claim all (${claimables.length})`, () => {
      const all = [];
      for (const [i, tr] of claimables) all.push(...claimPass(i, tr));
      showRewards(all, { title: 'SEASON REWARDS!' });
    }, 'green pulse hub-claim-all', { icon: 'chest' });
    if (hero) hero.insertBefore(btn, hero.lastChild);
    else wrap.appendChild(h('div', { class: 'row center' }, btn));
  }
  const track = h('div', { class: 'hub-pass-track', 'data-sk': 'track' });
  track.appendChild(h('div', { class: 'hub-pass-labels' }, h('div', { class: 'lab free' }, h('span', { class: 'display' }, 'FREE')), h('div', { class: 'lab mid' }), h('div', { class: 'lab prem' }, h('span', { class: 'display' }, 'PREMIUM'))));
  PASS_TIERS.forEach((tier, i) => {
    const reached = i < t;
    const isCur = i === t;
    const col = h('div', { class: `hub-pass-col ${reached ? 'reached' : ''} ${isCur ? 'cur' : ''}` });
    for (const track of ['free', 'premium']) {
      const r = tier[track];
      const claimed = track === 'premium' ? !!p.pass.premium_[i] : !!p.pass.free[i];
      const can = passClaimable(i, track);
      const premLocked = track === 'premium' && !p.pass.premium;
      if (can) col.classList.add('claimable');
      const tile = h('div', { class: `hub-pass-tile ${track} ${claimed ? 'claimed' : ''} ${can ? 'can' : ''} ${!reached ? 'future' : ''} ${premLocked ? 'plock' : ''}` },
        rewardArt(r, 96),
        h('div', { class: 'lbl tiny' }, rewardLabel(r)),
        claimed ? h('div', { class: 'ov check' }, icon('check')) : null,
        !claimed && (premLocked || !reached) ? h('div', { class: 'ov lock' }, icon('lock')) : null,
      );
      tile.addEventListener('click', () => {
        if (can) {
          audio.play('tap');
          doClaim(i, track);
        } else {
          audio.play('tap');
          infoPopup(r, i, track);
        }
      });
      if (can) tile.appendChild(h('div', { class: 'claim-tag display' }, 'CLAIM'));
      if (track === 'free') {
        col.appendChild(tile);
        col.appendChild(h('div', { class: 'hub-pass-node' }, h('div', { class: 'line' }), h('div', { class: 'num display' }, String(i + 1))));
      } else col.appendChild(tile);
    }
    track.appendChild(col);
  });
  wrap.appendChild(track);
  wrap.appendChild(h('div', { class: 'tiny muted center-t' }, 'Earn Calories from battles and Season Challenges to climb tiers. Tap a reward to inspect it.'));
  void scr;
  return wrap;
}

function renderChallenges() {
  const root = h('div', { class: 'col' });
  root.appendChild(sectionTitle('DAILY CHALLENGES', h('span', { class: 'row tiny' }, icon('clock', 'ic-xs'), 'New in ', h('b', { class: 'js-reset' }, fmtTime(secsToMidnight())))));
  const list = challengeList();
  if (!list.length) root.appendChild(h('div', { class: 'muted' }, 'No challenges today. Check back tomorrow!'));
  for (const c of list) {
    const row = h('div', { class: `hub-chal px-box ${c.claimed ? 'dark claimed' : 'light'} ${c.done && !c.claimed ? 'can' : ''}` },
      h('div', { class: 'ch-ic' }, icon(c.claimed ? 'check' : c.done ? 'star' : 'quest')),
      h('div', { class: 'col grow' },
        h('b', {}, c.text),
        h('div', { class: 'bar orange' }, h('i', { style: { width: (c.prog / c.n) * 100 + '%' } }), h('span', { class: 'outline-sm' }, `${c.prog}/${c.n}`)),
      ),
      h('div', { class: 'col center ch-rew' }, h('span', { class: 'row' }, icon('calorie'), h('b', {}, '+' + c.cal))),
    );
    if (c.done && !c.claimed) {
      row.appendChild(button('CLAIM', () => {
        const cal = claimChallenge(c.id);
        if (cal) {
          audio.play('chaching');
          toast(`+${cal} Calories!`, { icon: 'calorie' });
          requestAnimationFrame(() => sparkle(row, { count: 16, colors: ['#ff8a2a', '#ffd23f', '#ff4fa3'] }));
        }
      }, 'green pulse'));
    } else if (c.claimed) row.appendChild(h('span', { class: 'greent display tiny' }, 'DONE'));
    root.appendChild(row);
  }
  root.appendChild(h('div', { class: 'tiny muted hub-mt' }, 'Challenges reset every day at midnight. Progress counts from when the challenge appears.'));
  return root;
}
