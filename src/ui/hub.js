// Beast Lab hub UI: top bar (banner/name/trophies/currencies/season), BATTLE +
// ARENA MAP buttons, vial slot strip and the bottom nav that opens every
// management screen. Mounted by the Lab scene:
//   const hub = mountHub(ctx)  ->  { refresh(), destroy(), openScreen(name, opts), el }
import { h, icon, button, toast, modal, $ui } from './ui.js';
import { audio } from '../core/audio.js';
import {
  state, owned, upgradeInfo, deckSlotCount, spellSlotCount, vialTimeLeft, vialReady, isUnlocking, startUnlock, skipVial as skipVialState,
  skipPrice, passTier, trophyRoadClaimable, refreshDaily,
} from '../game/state.js';
import { COLLECTABLE, MEGA_FORMS } from '../data/swarms.js';
import { VIALS, VIAL_SLOTS } from '../data/vials.js';
import { SEASON, PASS_TIERS } from '../data/season.js';
import { PERK_ROLL_COST, perkSlotsForLevel } from '../data/commanders.js';
import { currentArena } from '../data/arena.js';
import { bannerEl, charImg, vialImg, rollNumber, bump, fmt, fmtTime, hubMeta, priceTag, confirmBox, deny, sparkle } from './screens/common.js';
import { openCollection, openSwarmDetail } from './screens/collection.js';
import { openDeck } from './screens/deck.js';
import { openCommanders, openCommanderDetail } from './screens/commanders.js';
import { openMega, megaStatus } from './screens/mega.js';
import { openShop, shopAlerts } from './screens/shop.js';
import { openPass, passAlerts } from './screens/pass.js';
import { openTrophyRoad } from './screens/trophyRoad.js';
import { openVials, vialStatus } from './screens/vials.js';
import { openProfile } from './screens/profile.js';
import { openSettings } from './screens/settings.js';

const SCREENS = {
  vials: (hub) => openVials(hub),
  collection: (hub) => openCollection(hub),
  swarms: (hub) => openCollection(hub),
  swarm: (hub, o) => openSwarmDetail(hub, o.id),
  deck: (hub, o) => openDeck(hub, o),
  commanders: (hub) => openCommanders(hub),
  commander: (hub, o) => openCommanderDetail(hub, o.id ?? state.p.commanders.equipped, o),
  mega: (hub) => openMega(hub),
  shop: (hub, o) => openShop(hub, o),
  pass: (hub, o) => openPass(hub, o),
  season: (hub, o) => openPass(hub, o),
  trophyRoad: (hub) => openTrophyRoad(hub),
  road: (hub) => openTrophyRoad(hub),
  profile: (hub, o) => openProfile(hub, o),
  settings: (hub) => openSettings(hub),
};
// screens that stack on top of whatever is open (detail views)
const STACKED = new Set(['swarm', 'commander']);
const NAV_OF = { swarms: 'collection', swarm: 'collection', commander: 'commanders', season: 'pass', road: 'trophyRoad' };

const NAV = [
  { id: 'vials', label: 'Vials', icon: 'vial' },
  { id: 'collection', label: 'Swarms', icon: 'swarm' },
  { id: 'deck', label: 'Deck', icon: 'sword' },
  { id: 'commanders', label: 'Commanders', short: 'Cmdrs', icon: 'crown' },
  { id: 'mega', label: 'Mega', icon: 'mega' },
  { id: 'shop', label: 'Shop', icon: 'cart' },
  { id: 'pass', label: 'Pass', icon: 'calorie', cls: 'season' },
  { id: 'trophyRoad', label: 'Road', icon: 'trophy' },
];

/** Which nav buttons should show a notification dot. */
export function hubAlerts() {
  const p = state.p;
  const meta = hubMeta();
  const slots = p.vials.slots;
  const busy = isUnlocking();
  const a = {};
  a.vials = slots.some((s, i) => s && vialReady(i)) || (!busy && slots.some((s, i) => s && !s.unlockStart && !vialReady(i)));
  a.collection = COLLECTABLE.some((s) => upgradeInfo(s.id)?.ok) || Object.keys(p.swarms).some((id) => !meta.seenSwarms[id] && COLLECTABLE.some((c) => c.id === id));
  const ownedSwarms = Object.keys(p.swarms).filter((id) => COLLECTABLE.some((c) => c.id === id));
  const ownedSpells = Object.keys(p.spells.owned);
  a.deck = (p.deck.length < deckSlotCount() && ownedSwarms.length > p.deck.length) || (p.spells.equipped.length < spellSlotCount() && ownedSpells.length > p.spells.equipped.length);
  const eq = p.commanders.owned[p.commanders.equipped];
  a.commanders = Object.keys(p.commanders.owned).some((id) => !meta.seenCmds[id] && id !== 'recruit') ||
    (!!eq && p.coins >= PERK_ROLL_COST && eq.perks.slice(0, perkSlotsForLevel(eq.level)).some((x) => !x));
  a.mega = MEGA_FORMS.some((m) => {
    const st = megaStatus(m);
    return st.ready && !st.done;
  });
  a.shop = shopAlerts();
  a.pass = passAlerts();
  a.trophyRoad = trophyRoadClaimable().length > 0;
  return a;
}

export function mountHub(ctx = {}) {
  refreshDaily();
  const root = $ui();
  const el = h('div', { class: 'hub' });
  const screens = [];
  let destroyed = false;
  const shown = { coins: null, bucks: null, trophies: null, tier: null, cal: null };

  const hub = {
    ctx, el, screens,
    refresh, destroy, openScreen, closeAll, runCutscene, openVialNow, skipVial, startUnlockSlot, vialTap,
    /** Hide/show the whole hub (e.g. during Lab cutscenes). Closes open screens when hiding. */
    hide(on = true) {
      if (on) closeAll();
      el.classList.toggle('hidden', !!on);
      if (!on) refresh();
    },
    _screenClosed(scr) {
      const i = screens.indexOf(scr);
      if (i >= 0) screens.splice(i, 1);
      updateNavActive();
    },
  };

  // ---------------------------------------------------------------- top bar
  const top = h('div', { class: 'hub-top' });
  const profileBtn = h('div', { class: 'hub-profile', title: 'Profile' });
  let profileKey = '';
  const trophyVal = h('b', { class: 'val' }, '0');
  const trophyBox = h('div', { class: 'hub-trophies' }, icon('trophy'), trophyVal);
  const nameEl = h('b', { class: 'pf-n outline-sm' });
  const renderProfileChip = () => {
    const key = state.p.cosmetics.banner + '|' + state.p.name;
    if (key === profileKey) return;
    profileKey = key;
    profileBtn.textContent = '';
    profileBtn.appendChild(
      bannerEl(state.p.cosmetics.banner, 'chip',
        h('div', { class: 'pf-av' }, charImg('recruit', { size: 64 })),
        h('div', { class: 'col pf-txt' }, nameEl, trophyBox),
      ),
    );
    nameEl.textContent = state.p.name;
  };
  profileBtn.addEventListener('click', () => {
    audio.unlock();
    audio.play('click');
    openScreen('profile');
  });
  trophyBox.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.play('click');
    openScreen('trophyRoad');
  });

  const calTier = h('b', { class: 'tier' }, '0');
  const calBarI = h('i');
  const calPill = h('div', { class: 'pill hub-pill cal', title: SEASON.name }, icon('calorie'), calTier, h('div', { class: 'bar orange hub-cal-bar' }, calBarI));
  calPill.addEventListener('click', () => {
    audio.unlock();
    audio.play('click');
    openScreen('pass');
  });
  const coinVal = h('b', { class: 'val' }, '0');
  const coinPill = h('div', { class: 'pill hub-pill coins', title: 'Beast Coins' }, icon('coin'), coinVal);
  coinPill.addEventListener('click', () => {
    audio.unlock();
    audio.play('click');
    openScreen('shop', { section: 'deals' });
  });
  const bucksVal = h('b', { class: 'val' }, '0');
  const bucksPill = h('div', { class: 'pill hub-pill bucks', title: 'Beast Bucks' }, icon('bucks'), bucksVal, h('span', { class: 'plus' }, '+'));
  bucksPill.addEventListener('click', () => {
    audio.unlock();
    audio.play('click');
    openScreen('shop', { section: 'vials' });
  });
  const gear = button('', () => openScreen('settings'), 'small icon-only hub-gear', { icon: 'gear' });
  top.append(profileBtn, h('div', { class: 'hub-cur' }, calPill, coinPill, bucksPill), gear);

  // ---------------------------------------------------------------- play buttons
  const arenaName = h('span', { class: 'arena-nm' });
  const battleBtn = button(
    h('span', { class: 'col hub-battle-lbl' }, h('span', { class: 'display bt' }, 'BATTLE'), arenaName),
    () => {
      if (!state.p.deck.length) {
        deny('Add some swarms to your deck first!');
        openScreen('deck');
        return;
      }
      closeAll();
      ctx.startBattle?.({ mode: 'ranked' });
    },
    'yellow hub-battle',
    { icon: 'sword', sound: 'bigPop' },
  );
  const mapBtn = button('ARENA MAP', () => {
    closeAll();
    ctx.goArena?.();
  }, 'green hub-map', { icon: 'pin' });
  const practiceBtn = button('Practice', () => {
    if (!state.p.deck.length) return deny('Add some swarms to your deck first!');
    closeAll();
    ctx.startBattle?.({ mode: 'practice' });
  }, 'hub-practice', { icon: 'swarm' });
  const play = h('div', { class: 'hub-play' }, battleBtn, h('div', { class: 'row hub-play-row' }, mapBtn, practiceBtn));

  // ---------------------------------------------------------------- vial strip
  const vials = h('div', { class: 'hub-vials' });
  const vialSlots = [];
  const storageBadge = h('div', { class: 'hub-storage-badge hidden' });
  storageBadge.addEventListener('click', () => {
    audio.play('click');
    openScreen('vials');
  });
  for (let i = 0; i < VIAL_SLOTS; i++) {
    const s = h('div', { class: 'hub-vslot', 'data-slot': i });
    s.addEventListener('click', () => {
      audio.unlock();
      vialTap(i);
    });
    vialSlots.push(s);
    vials.appendChild(s);
  }
  vials.appendChild(storageBadge);
  const slotKeys = [];
  const renderVials = (force = false) => {
    const p = state.p;
    const busy = isUnlocking();
    for (let i = 0; i < VIAL_SLOTS; i++) {
      const st = vialStatus(i);
      const mode = st.empty ? 'empty' : st.ready ? 'ready' : st.unlocking ? 'unlocking' : busy ? 'waiting' : 'idle';
      const key = `${mode}|${st.e?.type}|${st.e?.added}`;
      const s = vialSlots[i];
      if (key !== slotKeys[i] || force) {
        slotKeys[i] = key;
        s.className = 'hub-vslot ' + mode;
        s.textContent = '';
        if (st.empty) {
          s.appendChild(h('div', { class: 'vs-art' }, icon('vial', 'ghost')));
          s.appendChild(h('div', { class: 'vs-st tiny muted' }, 'Empty'));
        } else {
          s.style.setProperty('--vc', '#' + st.v.liquid.toString(16).padStart(6, '0'));
          s.appendChild(h('div', { class: 'vs-art' }, vialImg(st.e.type, st.ready ? 'bob' : '')));
          s.appendChild(h('div', { class: 'vs-nm' }, st.v.name.replace(' Vial', '')));
          if (st.ready) s.appendChild(h('div', { class: 'vs-st open display' }, 'OPEN!'));
          else if (st.unlocking) s.appendChild(h('div', { class: 'vs-st time' }, icon('clock', 'ic-xs'), h('span', { class: 'js-t' }, fmtTime(st.left))));
          else if (mode === 'idle') s.appendChild(h('div', { class: 'vs-st tap' }, 'Tap to unlock'));
          else s.appendChild(h('div', { class: 'vs-st tiny muted' }, icon('clock', 'ic-xs'), fmtTime(st.v.time)));
          if (st.ready && !force) {
            requestAnimationFrame(() => s.offsetParent && sparkle(s, { count: 12, spread: 50 }));
          }
        }
      } else if (st.unlocking) {
        const t = s.querySelector('.js-t');
        if (t) t.textContent = fmtTime(st.left);
      }
    }
    const n = p.vials.storage.length;
    storageBadge.classList.toggle('hidden', !n);
    storageBadge.textContent = '';
    if (n) storageBadge.append(icon('vial'), h('b', {}, '+' + n), h('span', { class: 'tiny' }, 'stored'));
  };

  // ---------------------------------------------------------------- nav
  const nav = h('nav', { class: 'hub-nav' });
  const navBtns = {};
  for (const n of NAV) {
    const b = h('div', { class: 'hub-nav-btn ' + (n.cls ?? ''), role: 'button', 'data-nav': n.id }, h('div', { class: 'ic' }, icon(n.icon)), h('span', { class: 'lbl' }, h('span', { class: 'l-full' }, n.label), n.short ? h('span', { class: 'l-short' }, n.short) : null), h('i', { class: 'notif-dot hidden' }));
    b.addEventListener('click', () => {
      audio.unlock();
      audio.play('click');
      bump(b.querySelector('.ic'), 'hub-pop');
      const topScr = screens[screens.length - 1];
      if (topScr && (NAV_OF[topScr.name] ?? topScr.name) === n.id && screens.length === 1) {
        closeAll();
        return;
      }
      openScreen(n.id);
    });
    navBtns[n.id] = b;
    nav.appendChild(b);
  }
  const updateNavActive = () => {
    const topScr = screens[0];
    const act = topScr ? NAV_OF[topScr.name] ?? topScr.name : null;
    for (const id in navBtns) navBtns[id].classList.toggle('active', id === act);
    el.classList.toggle('screen-open', screens.length > 0);
  };

  const bottom = h('div', { class: 'hub-bottom' }, h('div', { class: 'hub-mid' }, vials, h('div', { class: 'spacer' }), play), nav);
  el.append(top, bottom);
  root.appendChild(el);

  // keep modal screens between the top bar and the nav (both stay visible)
  const setTopH = () => {
    if (destroyed || el.classList.contains('hidden')) return;
    const r = top.getBoundingClientRect();
    const rn = nav.getBoundingClientRect();
    const de = document.documentElement.style;
    de.setProperty('--hub-top-h', Math.ceil(r.bottom + 4) + 'px');
    if (rn.height) de.setProperty('--hub-nav-h', Math.ceil(window.innerHeight - rn.top + 4) + 'px');
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setTopH) : null;
  ro?.observe(top);
  ro?.observe(nav);
  window.addEventListener('resize', setTopH);

  // ---------------------------------------------------------------- refresh
  function refresh() {
    if (destroyed) return;
    const p = state.p;
    renderProfileChip();
    nameEl.textContent = p.name;
    // while hidden (cutscenes / Lab hideHub) hold the old numbers so the roll-up plays on return
    const hiddenNow = el.classList.contains('hidden') || el.style.opacity === '0';
    const upd = (key, elv, val, dur = 0.7) => {
      if (hiddenNow && shown[key] !== null) return;
      if (shown[key] === null) elv.textContent = fmt(val);
      else if (shown[key] !== val) {
        rollNumber(elv, shown[key], val, dur);
        bump(elv.closest('.pill, .hub-trophies'));
        if (val > shown[key] && key !== 'trophies') audio.play('coin', { pitch: key === 'bucks' ? 1.3 : 1 });
      }
      shown[key] = val;
    };
    upd('coins', coinVal, p.coins);
    upd('bucks', bucksVal, p.bucks);
    upd('trophies', trophyVal, p.trophies);
    const tier = passTier();
    const max = tier >= PASS_TIERS.length;
    if (shown.tier !== null && tier > shown.tier && !hiddenNow) bump(calPill);
    if (!hiddenNow || shown.tier === null) shown.tier = tier;
    calTier.textContent = String(tier);
    calBarI.style.width = (max ? 100 : ((p.calories - tier * SEASON.calPerTier) / SEASON.calPerTier) * 100) + '%';
    arenaName.textContent = currentArena(p.trophies).name;
    renderVials();
    const a = hubAlerts();
    for (const id in navBtns) navBtns[id].querySelector('.notif-dot').classList.toggle('hidden', !a[id]);
    for (const s of screens.slice()) if (!s.closed) s.schedule();
    setTopH();
  }

  let pending = false;
  const unsub = state.on(() => {
    if (pending || destroyed) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (!destroyed) refresh();
    });
  });
  const timer = setInterval(() => {
    if (!destroyed && !el.isConnected) return destroy(); // removed by clearUI() on scene change
    if (destroyed || el.classList.contains('hidden')) return;
    const before = slotKeys.join();
    renderVials();
    if (slotKeys.join() !== before) {
      const a = hubAlerts();
      for (const id in navBtns) navBtns[id].querySelector('.notif-dot').classList.toggle('hidden', !a[id]);
    }
  }, 1000);
  const onKey = (e) => {
    if (e.key !== 'Escape' || destroyed) return;
    const pops = document.querySelectorAll('#overlay .modal-back');
    if (pops.length) {
      const x = pops[pops.length - 1].querySelector('.close-x');
      if (x) x.click();
      e.preventDefault();
      return;
    }
    if (screens.length) {
      e.preventDefault();
      screens[screens.length - 1].close();
    }
  };
  window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- screens
  function openScreen(name, opts = {}) {
    if (destroyed) return null;
    const fn = SCREENS[name];
    if (!fn) {
      console.warn('[hub] unknown screen', name);
      return null;
    }
    if (!STACKED.has(name)) closeAll();
    else {
      // replace a detail view of the same kind
      const topScr = screens[screens.length - 1];
      if (topScr && topScr.name === name) topScr.close();
    }
    const scr = fn(hub, opts);
    if (scr) screens.push(scr);
    updateNavActive();
    return scr;
  }
  function closeAll() {
    for (const s of screens.slice().reverse()) s.close();
    screens.length = 0;
    updateNavActive();
  }

  async function runCutscene(fn) {
    closeAll();
    for (const m of document.querySelectorAll('#overlay .modal-back')) m.remove();
    el.classList.add('hidden');
    try {
      await fn();
    } catch (e) {
      console.error('[hub] cutscene failed', e);
    } finally {
      if (!destroyed) {
        el.classList.remove('hidden');
        refresh();
      }
    }
  }

  // ---------------------------------------------------------------- vials
  function openVialNow(slot) {
    if (!vialReady(slot)) return;
    audio.play('pop');
    return runCutscene(async () => {
      if (ctx.openVial) await ctx.openVial(slot);
    });
  }
  async function skipVial(slot) {
    const st = vialStatus(slot);
    if (st.empty) return;
    if (st.ready) return openVialNow(slot);
    const price = skipPrice(vialTimeLeft(slot));
    if (state.p.bucks < price) return deny(`Need ${price - state.p.bucks} more Beast Bucks`);
    const ok = await confirmBox({
      title: 'OPEN NOW?',
      color: 'pink',
      art: h('div', { class: 'hub-info-art vialbg' }, vialImg(st.e.type, 'bob')),
      text: `Skip the wait and open your <b>${st.v.name}</b> right now?`,
      yes: 'OPEN',
      yesCls: 'pink',
      price: { cur: 'bucks', amount: price },
    });
    if (!ok) return;
    if (!skipVialState(slot)) return deny('Not enough Beast Bucks!');
    audio.play('chaching');
    return openVialNow(slot);
  }
  function startUnlockSlot(slot) {
    const st = vialStatus(slot);
    if (st.empty) return;
    if (startUnlock(slot)) {
      audio.play('magic');
      toast(`Unlocking *${st.v.name}*... ready in ${fmtTime(st.v.time)}`, { icon: 'clock' });
      bump(vialSlots[slot], 'hub-pop');
    } else vialPrompt(slot);
  }
  function vialTap(slot) {
    const st = vialStatus(slot);
    if (st.empty) {
      audio.play('tap');
      toast('Win battles to earn vials!', { icon: 'vial' });
      return;
    }
    if (st.ready) return openVialNow(slot);
    if (!st.unlocking && !isUnlocking()) return startUnlockSlot(slot);
    audio.play('tap');
    vialPrompt(slot);
  }
  function vialPrompt(slot) {
    const st0 = vialStatus(slot);
    if (st0.empty) return;
    const timeEl = h('b', {}, '');
    const priceEl = h('span', {});
    const body = h('div', { class: 'col center hub-vprompt' },
      h('div', { class: 'hub-info-art vialbg' }, vialImg(st0.e.type, 'bob')),
      h('div', { class: 'small center-t' }, st0.v.desc),
      h('div', { class: 'row wrap center tiny hub-vfacts' },
        h('span', { class: 'row' }, icon('swarm', 'ic-xs'), `${st0.v.cards} Swarms`),
        h('span', { class: 'row' }, icon('coin', 'ic-xs'), `${st0.v.coins[0]}-${st0.v.coins[1]}`)),
      h('div', { class: 'row center hub-timer' }, icon('clock'), timeEl),
      !st0.unlocking ? h('div', { class: 'tiny muted center-t' }, 'Another vial is already unlocking. Only one unlocks at a time!') : null,
    );
    const openBtn = button(h('span', { class: 'row' }, h('span', {}, 'OPEN NOW'), h('span', { class: 'price' }, icon('bucks'), priceEl)), async () => {
      const st = vialStatus(slot);
      const price = skipPrice(vialTimeLeft(slot));
      if (!st.ready && state.p.bucks < price) return deny(`Need ${price - state.p.bucks} more Beast Bucks`);
      m.close();
      if (!st.ready) {
        if (!skipVialState(slot)) return deny('Not enough Beast Bucks!');
        audio.play('chaching');
      }
      openVialNow(slot);
    }, 'pink big');
    const m = modal({
      title: st0.v.name.toUpperCase(),
      color: 'green',
      size: 'narrow',
      cls: 'hub-screen',
      body,
      foot: [button('Vial info', () => {
        m.close();
        openScreen('vials');
      }, 'small'), h('span', { class: 'spacer' }), openBtn],
      onClose: () => clearInterval(iv),
    });
    const upd = () => {
      const st = vialStatus(slot);
      if (st.empty) return m.close();
      timeEl.textContent = st.ready ? 'Ready!' : st.unlocking ? fmtTime(st.left) + ' left' : fmtTime(st.v.time);
      priceEl.textContent = String(skipPrice(vialTimeLeft(slot)));
    };
    upd();
    const iv = setInterval(upd, 1000);
  }

  // ---------------------------------------------------------------- teardown
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    unsub();
    clearInterval(timer);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', setTopH);
    ro?.disconnect();
    closeAll();
    el.remove();
    document.documentElement.style.removeProperty('--hub-top-h');
    document.documentElement.style.removeProperty('--hub-nav-h');
  }

  refresh();
  void owned;
  void priceTag;
  return hub;
}
