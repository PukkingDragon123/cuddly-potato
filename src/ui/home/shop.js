// SHOP tab: the secret bunker.
//   A live voxel bunker (bunker.js, drawn behind the tab by the main renderer) with
//   "Lonan" behind the counter: Nolan in a trench coat, fedora, spy shades and a
//   stick-on mustache. Tap him (or TALK) for a voiced chat with choices, one haggle
//   a day for a small discount, and he reacts to every sale and every empty wallet.
//   The goods: the daily gift, the free vial, 6 daily card deals (the counter), the
//   featured vial (the vault), featured cosmetics, entrance cutscenes, vials for
//   Beast Bucks (opened right away via ctx.openVial) and coin bundles. Everything
//   resets at local midnight (the CRT says when).
import './shop.css';
import { h, icon, animIcon, button, sparkle, say, closeDialogue, $overlay } from '../ui.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { mulberry32, hashString, todayKey, fmt } from '../../core/util.js';
import {
  state, upgradeInfo, shopOffers, shopBought, markBought, spendBucks, spendCoins, addCoins, grantReward, refreshDaily, freeVialStatus,
  ownsEntrance, equipEntrance, equippedEntrance,
} from '../../game/state.js';
import { cardDef, isSpell, RARITIES } from '../../data/cards.js';
import { VIALS } from '../../data/vials.js';
import { BANNERS, SWARM_SKINS, CMD_SKINS } from '../../data/season.js';
import { COMMANDERS } from '../../data/commanders.js';
import { ENTRANCES } from '../../data/entrances.js';
import { CHARACTERS, voiceOf } from '../../data/characters.js';
import { entranceArt } from '../entranceArt.js';
import { game } from '../../game/game.js';
import {
  screenShell, countdown, midnightMs, vialArt, rewardArt, rewardLabel, showRewards, confirmBox,
  refreshCtx, fmtN, bannerEl, swarmImg, cmdFullImg, cmdSkinOwned, charFullImg,
} from './common.js';
import { bunker, prewarmBunker } from './bunker.js';
import { injectBunkerArt } from './shopArt.js';
import * as T from './shopTalk.js';

// Featured cosmetics rotate daily (3 a day) from this pool.
const FEATURED_POOL = [
  ...Object.keys(SWARM_SKINS).map((id) => ({ type: 'skin', id, price: 260 })),
  ...['pinkBolt', 'goldBars', 'feastBanner', 'animStars', 'animDrip', 'animFeast'].filter((id) => BANNERS[id]).map((id) => ({ type: 'banner', id, price: BANNERS[id].animated ? 220 : 120 })),
  ...['juanChef', 'juanGold'].filter((id) => CMD_SKINS[id]).map((id) => ({ type: 'cmdSkin', id, price: 380 })),
];
export function featuredOffers() {
  const rng = mulberry32(hashString('featured' + todayKey()));
  const pool = FEATURED_POOL.slice();
  const out = [];
  // one of each kind when possible, so the row always looks varied
  for (const kind of ['skin', 'cmdSkin', 'banner']) {
    const c = pool.filter((o) => o.type === kind);
    if (!c.length) continue;
    const o = c[Math.floor(rng() * c.length)];
    out.push(o);
    pool.splice(pool.indexOf(o), 1);
  }
  return out;
}
export function cosmeticOwned(o) {
  const c = state.p.cosmetics;
  if (o.type === 'skin') return !!c.swarmSkins?.[o.id];
  if (o.type === 'banner') return c.banners.includes(o.id);
  if (o.type === 'cmdSkin') return cmdSkinOwned(CMD_SKINS[o.id]?.commander, o.id);
  return false;
}
const VIAL_BLURB = {
  labPack: '18+ cards. 2 Rares guaranteed.',
  megaLab: '42+ cards. An Ultra Rare guaranteed.',
  hyperchrome: '12+ cards. 8x shiny odds.',
  cashCase: '70+ cards. A Legendary guaranteed.',
  snackPack: '15+ Snack Squad cards.',
  testTube: '7+ cards.',
};
const COIN_ART = { coinPile: 'coinStack', coinBag: 'coinPile', coinVault: 'coinChest' };
// The daily hero offer: one premium vial in the vault (rotates every day).
const HERO_POOL = ['cashCase', 'megaLab', 'hyperchrome', 'cashCase'];
export function heroVialId(off) {
  const rng = mulberry32(hashString('hero' + todayKey()));
  const ids = off.vials.map((v) => v.id);
  const pick = HERO_POOL.filter((id) => ids.includes(id));
  return pick.length ? pick[Math.floor(rng() * pick.length)] : ids[ids.length - 1];
}
const HERO_TAG = { cashCase: 'LEGENDARY INSIDE', megaLab: 'ULTRA RARE INSIDE', hyperchrome: '8x SHINY ODDS', labPack: '2 RARES INSIDE' };
const RAR_TAG = { legendary: ['RARE FIND', 'teal'], epic: ['HOT', 'pink'] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Haggling: one discount a day on one daily card deal (lives in state.p.shop, which resets at midnight)

function haggle() {
  const s = state.p.shop;
  return s.haggle && s.haggle.day === s.day ? s.haggle : null;
}
/** Price after today's haggle (if this offer is the haggled one). */
function priceOf(key, price) {
  const hg = haggle();
  return hg && hg.key === key ? Math.max(1, Math.round(price * (1 - hg.pct / 100))) : price;
}

// ---------------------------------------------------------------------------
// 2D pixel confetti (a tiny low-res canvas scaled up with hard pixels)

const CONFETTI = ['#ffd84a', '#ff4aa8', '#4fc8ff', '#7aff4a', '#ffffff', '#ff8a2a', '#b05cff'];
function pixConfetti(x, y, o = {}) {
  const S = 4; // CSS px per confetti pixel
  const W = Math.ceil(innerWidth / S), H = Math.ceil(innerHeight / S);
  const cv = h('canvas', { class: 'bk-confetti', width: W, height: H });
  $overlay().appendChild(cv);
  const g = cv.getContext('2d');
  const n = o.count ?? 46;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (o.spread ?? 2.4);
    const v = (o.power ?? 70) * (0.45 + Math.random() * 0.75);
    parts.push({ x: x / S, y: y / S, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: CONFETTI[i % CONFETTI.length], w: 1 + (i % 3 === 0 ? 1 : 0), ph: Math.random() * 6, life: 1 + Math.random() * 0.6 });
  }
  const t0 = performance.now();
  let last = t0, t = 0;
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t = (now - t0) / 1000; // lifetimes run on the wall clock (slow frames never keep confetti around)
    g.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      if (t > p.life) continue;
      alive++;
      p.vy += 95 * dt;
      p.vx *= 1 - 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const flip = Math.sin(t * 14 + p.ph) > 0;
      g.globalAlpha = t > p.life - 0.25 ? Math.max(0, (p.life - t) / 0.25) : 1;
      g.fillStyle = p.c;
      g.fillRect(Math.round(p.x), Math.round(p.y), flip ? p.w + 1 : 1, flip ? 1 : p.w + 1);
    }
    if (alive && cv.isConnected) requestAnimationFrame(step);
    else cv.remove();
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------

export function mount(el, ctx) {
  injectBunkerArt();
  refreshDaily();
  let day = todayKey();
  let disposed = false;
  const bk = bunker();
  const firstVisit = !bk.ready; // the roller shutter only plays while the bunker is first built
  el.classList.add('hm-tab-bunker');
  const shell = screenShell(el, {
    cls: 'mn-shop bk-shop', render,
    tick() {
      if (todayKey() !== day) {
        day = todayKey();
        refreshDaily();
        shell.render();
        refreshCtx(ctx);
        bubble('Restocked. Fresh off the truck.', { act: 'hello' });
      }
      ambientTick();
    },
    dispose: cleanup,
  });
  const root = shell.root, scroll = shell.scroll;

  const have = (cur) => (cur === 'bucks' ? state.p.bucks : state.p.coins);
  const curName = (cur, n) => (cur === 'bucks' ? (n === 1 ? 'Buck' : 'Bucks') : n === 1 ? 'coin' : 'coins');
  const pay = (cur, n) => (cur === 'bucks' ? spendBucks(n) : spendCoins(n));

  // ------------------------------------------------------------------ the stage (window into the bunker)

  const bubbleTxt = h('div', { class: 'bk-bubble-t' });
  const bubbleEl = h('div', { class: 'bk-bubble' }, bubbleTxt, h('i', { class: 'bk-bubble-tail' }));
  const talkBtn = button('TALK', () => talk(), 'yellow bk-talk', { icon: 'emote', sound: 'tap' });
  const fallback = h('div', { class: 'bk-fallback' });
  const stage = h('div', { class: 'bk-stage' },
    fallback,
    h('div', { class: 'bk-shutter' }, h('i', { class: 'bk-shutter-bar' }), h('div', { class: 'bk-shutter-t t-d' }, 'KNOCK TWICE')),
    h('div', { class: 'bk-signbox' },
      h('div', { class: 'bk-sign' }, h('span', { class: 't-d' }, "LONAN'S STASH")),
      h('div', { class: 'bk-note' }, h('span', {}, 'not Nolan'))),
    h('div', { class: 'bk-restock' }, h('span', { class: 'bk-restock-k' }, 'RESTOCK'), countdown(midnightMs(), 'bk-restock-v')),
    talkBtn,
    bubbleEl);
  root.insertBefore(stage, scroll);
  if (!firstVisit) root.classList.add('bk-quick');
  root.insertBefore(h('div', { class: 'bk-curtain' }), stage);
  scroll.classList.add('bk-goods');

  // tap the bunker: the seller talks, the bell rings, the screens / register grumble
  let down = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.btn')) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  stage.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    tapStage(e.clientX, e.clientY);
  });
  function tapStage(x, y) {
    if (talking) return;
    if (!bk.live) { talk(); return; }
    let what = bk.pick(x, y);
    if (!what) {
      const c = bk.chestScreen();
      if (Math.hypot(c.x - x, c.y - y) < Math.min(130, stage.clientWidth * 0.28)) what = 'seller';
    }
    if (what === 'seller') talk();
    else if (what === 'bell') { audio.play('bell', { pitch: 1.3 }); bk.act('startle'); bubble(T.pick(T.BELL), { mood: 'shock' }); }
    else if (what === 'register') { audio.play('chaching', { vol: 0.5 }); bubble(T.pick(T.REGISTER), { mood: 'smug' }); }
    else if (what === 'crt') { audio.play('zap', { pitch: 1.6, vol: 0.4 }); bubble(T.pick(T.CRT), { mood: 'nervous' }); }
  }

  // frame the seller in the stage window (re-measured on resize / orientation change)
  let rectDirty = true;
  const measure = () => {
    const r = stage.getBoundingClientRect();
    bk.frame({ left: r.left, top: r.top, width: r.width, height: r.height });
    rectDirty = false;
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { rectDirty = true; }) : null;
  ro?.observe(stage);
  const onResize = () => { rectDirty = true; };
  window.addEventListener('resize', onResize);

  // per-frame: liveness (lift the shutter once the bunker is on screen), bubble follows his head
  let liveSince = 0, opened = false, mountedAt = performance.now(), bubbleUntil = 0;
  const offFrame = engine.onFrame(() => {
    if (disposed) return;
    if (rectDirty && !root.closest('.hm-tab-out')) measure();
    const live = bk.live;
    if (live && !liveSince) liveSince = performance.now();
    if (!opened && ((live && performance.now() - liveSince > 120) || performance.now() - mountedAt > 6000)) openShutter(live);
    // the bunker finished building after the flat fallback went up: swap to the live one
    if (opened && live && root.classList.contains('bk-flat') && performance.now() - liveSince > 120) { root.classList.remove('bk-flat'); fallback.textContent = ''; }
    if (bubbleEl.classList.contains('on')) placeBubble();
    if (bubbleUntil && performance.now() > bubbleUntil) hideBubble();
  });

  function openShutter(live) {
    opened = true;
    if (!live) {
      // no 3D (no WebGL, a test bench, or still building): a rendered portrait behind the counter
      root.classList.add('bk-flat');
      fallback.appendChild(charFullImg('shadyNolan', { w: 220, h: 280, pose: 'counterTap', mouth: 'smirk', yaw: -0.2 }, 'bk-fallback-img'));
    }
    root.classList.add('bk-open');
    if (firstVisit) audio.play('rattle', { vol: 0.5, pitch: 0.8 });
    setTimeout(() => { if (!disposed && !talking) bubble(openLine(), { act: 'hello' }); }, 900);
  }

  // ------------------------------------------------------------------ speech bubble + talk

  function placeBubble() {
    const sr = root.getBoundingClientRect(), st = stage.getBoundingClientRect();
    let ax, ay, hw;
    if (bk.live) {
      const p = bk.headScreen(_hp);
      ax = p.x; ay = p.y; hw = p.w ?? 60;
    } else {
      const img = fallback.firstElementChild?.getBoundingClientRect();
      ax = img ? img.left + img.width / 2 : st.left + st.width / 2;
      ay = img ? img.top + img.height * 0.08 : st.top + st.height * 0.3;
      hw = img ? img.width * 0.32 : 60;
    }
    const m = 8;
    // beside his head when there is room on the right (clear of the sign and the CRT), else above it
    const room = st.right - (ax + hw * 0.5) - 12 - m;
    const side = room >= Math.min(170, st.width * 0.4);
    bubbleEl.style.maxWidth = side ? room + 'px' : '';
    bubbleEl.classList.toggle('side', side);
    const w = bubbleEl.offsetWidth, hh = bubbleEl.offsetHeight;
    let left, top;
    if (side) {
      left = Math.min(st.right - m - w, ax + hw * 0.5 + 12);
      top = Math.max(st.top + m, Math.min(st.bottom - hh - m, ay + hw * 0.55 - hh * 0.3));
      bubbleEl.style.setProperty('--ty', Math.round(Math.max(6, Math.min(hh - 22, ay + hw * 0.6 - top - 8))) + 'px');
    } else {
      left = Math.max(st.left + m, Math.min(st.right - m - w, ax - w * 0.3));
      top = Math.max(st.top + m, ay - hh - 10);
      bubbleEl.style.setProperty('--tx', Math.round(Math.max(14, Math.min(w - 20, ax - left))) + 'px');
    }
    bubbleEl.style.transform = `translate(${Math.round(left - sr.left)}px, ${Math.round(top - sr.top)}px)`;
  }
  const _hp = {};
  let talkOff = 0;
  /** Say a line in a bubble over his head (voiced babble, mouth flaps, optional reaction). */
  function bubble(text, o = {}) {
    if (disposed || !text) return;
    if (document.querySelector('.cdlg') && !o.force) return;
    bubbleTxt.innerHTML = '';
    bubbleTxt.appendChild(h('span', { html: rich(text) }));
    bubbleEl.classList.remove('on');
    void bubbleEl.offsetWidth;
    bubbleEl.classList.add('on');
    root.classList.add('bk-bubbling');
    placeBubble();
    const plain = String(text).replace(/\*/g, '');
    const span = Math.min(2.4, 0.35 + plain.length * 0.045);
    bubbleUntil = performance.now() + (o.dur ?? 1800 + plain.length * 55);
    audio.play('bubblePop', { gap: 0.08, vol: 0.6 });
    audio.babble(voiceOf('shadyNolan'), plain, span);
    if (o.act) bk.act(o.act);
    const ch = bk.nolan;
    if (ch) {
      if (o.mood) ch.mood(o.mood, span + 0.6);
      ch.talk(true);
      clearTimeout(talkOff);
      talkOff = setTimeout(() => ch.talk(false), span * 1000);
    }
  }
  function hideBubble() {
    bubbleUntil = 0;
    bubbleEl.classList.remove('on');
    root.classList.remove('bk-bubbling');
  }

  // ambient one-liners: one when the shutter goes up, then every so often while you browse
  let ambientIn = 34;
  function ambientTick() {
    if (!opened || talking || document.hidden) return;
    if (--ambientIn > 0) return;
    ambientIn = 30 + Math.floor(Math.random() * 25);
    if (!bubbleEl.classList.contains('on')) bubble(openLine(true));
  }
  function openLine(later = false) {
    const off = shopOffers();
    const p = state.p;
    if (!(p.shop.freeClaimed || shopBought('free')) && Math.random() < 0.7) return T.AMBIENT_GIFT;
    if (freeVialStatus().ready && Math.random() < 0.5) return T.AMBIENT_FREEVIAL;
    const left = off.cards.filter((o) => !shopBought('card:' + o.id)).length;
    if (!left && later) return T.AMBIENT_ALLSOLD;
    return T.pick(T.AMBIENT);
  }

  // landscape: the conversation sits over the goods, so Lonan stays in view on the left
  const sayH = (who, text, opts) => {
    const p = say(who, text, opts);
    const d = $overlay().querySelector('.cdlg:not(.closing)');
    if (d && document.body.classList.contains('landscape')) {
      d.classList.add('bk-dlg');
      d.style.setProperty('--bk-left', Math.round(stage.getBoundingClientRect().right) + 'px');
    }
    return p;
  };
  const sellerWho = (mood = 'smug') => ({ ...T.SELLER, color: CHARACTERS.shadyNolan.color, chibi: bk.live ? bk.nolan : null, mood });
  let talking = false, denies = 0;
  const choiceBtns = () => T.CHOICES.map((label, i) => ({ label, cls: i === 3 ? 'gray sm' : i === 2 ? 'green sm' : i === 1 ? 'pink sm' : 'blue sm' }));
  async function talk() {
    if (talking || disposed) return;
    talking = true;
    hideBubble();
    root.classList.add('bk-talking');
    bk.act('hello');
    let line = T.pick(T.OPENERS), mood = 'smug';
    try {
      for (let guard = 0; guard < 40; guard++) {
        const i = await sayH(sellerWho(mood), line, { choices: choiceBtns() });
        if (disposed) return;
        if (i === 0) {
          const off = shopOffers();
          const legend = off.cards.find((o) => cardDef(o.id)?.rarity === 'legendary' && !shopBought('card:' + o.id));
          const deals = off.cards.filter((o) => !shopBought('card:' + o.id)).length;
          line = T.pick(T.sellingLine({ hero: VIALS[heroVialId(off)]?.name ?? 'vault vial', legend: legend ? cardDef(legend.id).name : null, deals: deals || null }));
          mood = 'cool';
          bk.act('talk');
        } else if (i === 1) {
          line = T.DENY[Math.min(denies, T.DENY.length - 1)];
          denies = denies >= T.DENY.length - 1 ? 1 : denies + 1;
          mood = line.startsWith('...') ? 'embarrassed' : 'nervous';
          bk.act(line.startsWith('...') ? 'startle' : 'broke');
        } else if (i === 2) {
          const r = await doHaggle();
          if (disposed) return;
          line = r.line;
          mood = r.mood;
        } else {
          bk.act('hello');
          await sayH(sellerWho('cool'), T.pick(T.BYE));
          break;
        }
      }
    } finally {
      talking = false;
      root.classList.remove('bk-talking');
      if (!disposed) bk.act('idle');
    }
  }
  async function doHaggle() {
    if (haggle()) return { line: T.HAGGLE_DONE, mood: 'annoyed' };
    const off = shopOffers();
    const open = off.cards.filter((o) => !shopBought('card:' + o.id));
    if (!open.length) return { line: T.HAGGLE_NONE, mood: 'shrug' };
    bk.act('haggle');
    audio.play('drumroll', { vol: 0.5 });
    await sayH(sellerWho('think'), T.HAGGLE_THINK);
    if (disposed) return { line: '', mood: 'smug' };
    const o = open[Math.floor(Math.random() * open.length)];
    const pct = [8, 10, 10, 12, 15][Math.floor(Math.random() * 5)];
    const small = Math.random() < 0.12;
    const s = state.p.shop;
    s.haggle = { day: s.day, key: 'card:' + o.id, pct: small ? 5 : pct };
    state.save();
    audio.play('chaching', { pitch: 1.2 });
    shell.render();
    const name = cardDef(o.id).name;
    setTimeout(() => {
      const t = scroll.querySelector(`[data-key="card:${o.id}"]`);
      if (t) { t.classList.add('bk-haggled'); sparkle(t, { count: 16 }); }
    }, 60);
    return { line: small ? T.HAGGLE_SMALL(name) : T.haggleLine(pct, name), mood: small ? 'smug' : 'happy' };
  }

  // ------------------------------------------------------------------ buying

  function broke(cur, price, btn) {
    audio.play('deny');
    if (btn) { btn.classList.remove('shake-x'); void btn.offsetWidth; btn.classList.add('shake-x'); }
    const short = price - have(cur);
    const pre = `*${fmt(short)} ${curName(cur, short)}* short.`;
    bubble(`${pre} ${T.pick(cur === 'bucks' ? T.BROKE : T.BROKE_COINS)}`, { act: 'broke', mood: 'annoyed', force: true });
  }

  /** Stamp + crate pop + confetti + the coat flash; resolves when the reward should show. */
  async function saleFx(tile, kind) {
    audio.play('chaching');
    bk.act('buy');
    bk.onParcel = (p) => { if (!disposed && p.visible) pixConfetti(p.x, p.y, { count: 34, power: 55 }); };
    const line = T.BUY_KIND[kind] && Math.random() < 0.6 ? T.pick(T.BUY_KIND[kind]) : T.pick(T.BUY);
    bubble(line, { mood: 'rich', force: true });
    if (tile?.isConnected) {
      tile.classList.add('bk-opening');
      const r = tile.getBoundingClientRect();
      pixConfetti(r.left + r.width / 2, r.top + r.height * 0.4);
      await wait(260);
      stampOn(tile, 'SOLD OUT');
    }
    await wait(650);
  }
  function stampOn(tile, text) {
    if (!tile?.isConnected) return;
    tile.classList.add('sold');
    tile.querySelector('.bk-stamp')?.remove();
    tile.appendChild(h('div', { class: 'bk-stamp slam' }, h('span', { class: 't-d' }, text)));
    audio.play('stamp');
    tile.classList.remove('bk-thud');
    void tile.offsetWidth;
    tile.classList.add('bk-thud');
  }

  async function buy({ key, cur, price, tile, title, art, text, sub, onPaid, yesCls = 'green', kind = 'card' }) {
    if (shopBought(key)) { bubble(T.pick(T.SOLD_OUT), { mood: 'shrug' }); return; }
    const btn = tile?.querySelector('.btn');
    if (have(cur) < price) { broke(cur, price, btn); return; }
    const ok = await confirmBox({ title, art, text, sub, yes: 'BUY', yesCls, price: { cur, amount: price }, color: 'green' });
    if (!ok || disposed) return;
    if (have(cur) < price || !pay(cur, price)) { broke(cur, price, btn); return; }
    markBought(key);
    shell.lock(2400);
    refreshCtx(ctx);
    await saleFx(tile, kind);
    await onPaid();
    shell.render();
  }

  // ------------------------------------------------------------------ tiles

  const stampEl = (text) => h('div', { class: 'bk-stamp' }, h('span', { class: 't-d' }, text));
  /** Tapping something already sold gets a word from the seller. */
  const soldTap = (tile) => tile.addEventListener('click', () => {
    if (!tile.classList.contains('sold') || tile.classList.contains('owned')) return;
    audio.play('tap', { vol: 0.6 });
    bubble(T.pick(T.SOLD_OUT), { mood: 'shrug', act: 'hello' });
  });
  const ribbon = (text, cls = '') => h('div', { class: 'bk-ribbon ' + cls }, h('span', { class: 't-d' }, text));

  function priceButton(cur, price, sold, onClick, o = {}) {
    if (sold) return null;
    const b = button(o.label ?? null, onClick, (o.cls ?? 'green') + ' bk-buy', { price: { cur, amount: price }, sound: 'tap' });
    if (have(cur) < price) b.classList.add('poor');
    return b;
  }

  function giftTile(off) {
    const done = state.p.shop.freeClaimed || shopBought('free');
    const r = off.free;
    const tile = h('div', { class: `bk-wide bk-gift ${done ? 'sold' : ''}` },
      h('div', { class: 'bk-wide-art' }, h('div', { class: 'px-rays bk-wide-rays' }), rewardArt(r)),
      h('div', { class: 'bk-wide-txt' },
        h('span', { class: 'bk-wide-k t-d' }, 'DAILY GIFT'),
        h('b', { class: 'bk-wide-n' }, rewardLabel(r)),
        h('span', { class: 'bk-wide-s' }, 'On the house. Once a day.')),
      done ? null : button('FREE', () => {
        if (state.p.shop.freeClaimed || shopBought('free')) return;
        state.p.shop.freeClaimed = true;
        markBought('free');
        const got = grantReward(r);
        audio.play('coin');
        shell.lock(1400);
        refreshCtx(ctx);
        tile.classList.add('bk-opening');
        const rr = tile.getBoundingClientRect();
        pixConfetti(rr.left + rr.width * 0.25, rr.top + rr.height / 2, { count: 30 });
        bubble('Free. Don\'t get used to it.', { act: 'hello', mood: 'smug', force: true });
        setTimeout(() => stampOn(tile, 'CLAIMED'), 250);
        setTimeout(() => showRewards(got, { title: 'DAILY GIFT!' }).then(() => shell.render()), 700);
      }, 'yellow bk-buy pulse', { icon: 'gift' }),
      done ? stampEl('CLAIMED') : null);
    return tile;
  }

  // the free vial: refills every few hours (stacks up to a few), opens instantly
  function freeVialTile() {
    const fs = freeVialStatus();
    const tile = h('div', { class: `bk-wide bk-freevial ${fs.ready ? 'ready' : 'waiting'}` },
      h('div', { class: 'bk-wide-art' }, h('div', { class: 'px-rays bk-wide-rays' }), vialArt('free')),
      h('div', { class: 'bk-wide-txt' },
        h('span', { class: 'bk-wide-k t-d c-green' }, 'FREE VIAL'),
        h('b', { class: 'bk-wide-n' }, fs.ready ? (fs.count > 1 ? `${fs.count} waiting` : 'Ready to open') : 'Refilling'),
        fs.ready ? h('span', { class: 'bk-wide-s' }, 'A new one every 4 hours.') : h('span', { class: 'bk-wide-s' }, 'Next one in ', countdown(Date.now() + fs.nextIn * 1000, 'c-gold'))),
      fs.ready ? button('OPEN', () => ctx.openFree?.(), 'green bk-buy pulse', { icon: 'vial' }) : h('div', { class: 'bk-soon t-d' }, icon('clock', 's'), 'SOON'));
    return tile;
  }

  function cardTile(o) {
    const d = cardDef(o.id);
    const key = 'card:' + o.id;
    const sold = shopBought(key);
    const isNew = !state.p.cards[o.id];
    const price = priceOf(key, o.price);
    const deal = price !== o.price;
    const rt = !sold && RAR_TAG[d.rarity];
    const tile = h('div', { class: `bk-crate bk-r-${d.rarity} ${sold ? 'sold' : ''} ${deal ? 'deal' : ''}`, 'data-key': key },
      h('div', { class: 'bk-crate-top' }, h('span', { class: 'bk-qty t-d' }, 'x' + o.copies), rt ? h('span', { class: `bk-rtag t-d ${rt[1]}` }, rt[0]) : null),
      h('div', { class: 'bk-crate-art' }, cardEl(o.id, { size: 'mini', noLevel: true, locked: false, owned: state.p.cards[o.id] ?? { level: 1 } }),
        !sold ? h('span', { class: 'bk-left t-d' }, '1 LEFT') : null,
        isNew ? h('span', { class: 'bk-new t-d' }, 'NEW') : null),
      h('div', { class: 'bk-crate-n' }, d.name),
      deal && !sold ? h('div', { class: 'bk-was' }, h('s', {}, fmtN(o.price)), h('span', { class: 'bk-off t-d' }, `-${haggle().pct}%`)) : null,
      sold ? stampEl('SOLD OUT') : priceButton(o.cur, price, false, () => buy({
        key, cur: o.cur, price, tile, kind: d.rarity === 'legendary' ? 'legendary' : 'card',
        title: 'BUY CARDS', art: cardEl(o.id, { noLevel: true, locked: false, owned: state.p.cards[o.id] ?? { level: 1 } }),
        text: `Buy <b>${o.copies} x ${d.name}</b>?`,
        sub: h('div', { class: 'center-t t-sm c-muted' }, deal ? `Haggled down from ${fmtN(o.price)}.` : `${RARITIES[d.rarity]?.name ?? ''} card`),
        async onPaid() {
          const got = grantReward({ type: 'card', id: o.id, copies: o.copies });
          const up = upgradeInfo(o.id);
          await showRewards(got, { title: 'CARDS!', note: up && !up.max && up.enoughCopies ? `${d.name} is ready to upgrade!` : null });
        },
      })),
      deal && !sold ? h('div', { class: 'bk-burst t-d' }, `-${haggle().pct}%`) : null);
    soldTap(tile);
    return tile;
  }

  function heroTile(off) {
    const id = heroVialId(off);
    const o = off.vials.find((v) => v.id === id);
    if (!o) return null;
    const v = VIALS[id];
    const key = 'vial:' + id;
    const sold = shopBought(key);
    const tile = h('div', { class: `bk-vault vr-${v.rarity} ${sold ? 'sold' : ''}` },
      h('div', { class: 'bk-vault-glow' }),
      h('div', { class: 'bk-vault-art' }, h('div', { class: 'px-rays bk-vault-rays' }), vialArt(id, 'bk-vault-vial', { size: 320 })),
      h('div', { class: 'bk-vault-txt' },
        h('span', { class: 'bk-vault-k t-d' }, icon('lock', 's'), 'FROM THE VAULT'),
        h('b', { class: 'bk-vault-n t-d' }, v.name.toUpperCase()),
        h('span', { class: 'bk-vault-tag t-d' }, HERO_TAG[id] ?? 'TODAY ONLY'),
        h('span', { class: 'bk-vault-s' }, VIAL_BLURB[id] ?? v.desc ?? ''),
        h('div', { class: 'bk-vault-chips' },
          h('span', { class: 'bk-chip' }, icon('cards', 's'), `x${v.cards}`),
          h('span', { class: 'bk-chip' }, icon('coin', 's'), `${fmtN(v.coins[0])}+`),
          v.bucks ? h('span', { class: 'bk-chip' }, icon('bucks', 's'), String(v.bucks)) : null),
        h('div', { class: 'bk-vault-buy' },
          sold ? null : (() => {
            const b = button('BUY', () => buy({
              key, cur: 'bucks', price: o.price, tile, kind: 'vial',
              title: v.name.toUpperCase(), art: vialArt(id, 'mn-confirm-vial'), text: v.desc, sub: h('div', { class: 'center-t t-sm c-gold' }, 'Opens right away. No timer.'), yesCls: 'yellow',
              async onPaid() { ctx.openVial?.({ type: id, source: 'shop' }); },
            }), 'yellow lg shine bk-buy', { price: { cur: 'bucks', amount: o.price }, sound: 'tap' });
            if (have('bucks') < o.price) b.classList.add('poor');
            return b;
          })(),
          h('span', { class: 'bk-chip bk-chip-t' }, icon('clock', 's'), 'Ends in ', countdown(midnightMs(), 'c-gold')))),
      sold ? stampEl('SOLD OUT') : null);
    tile.heroId = id;
    soldTap(tile);
    return tile;
  }

  function featuredTile(o) {
    const owned = cosmeticOwned(o);
    const key = 'feat:' + o.type + ':' + o.id;
    let art, name, sub;
    if (o.type === 'skin') {
      const sk = SWARM_SKINS[o.id];
      art = swarmImg(sk.swarm, 'base', o.id, 160);
      name = sk.name;
      sub = `Swarm skin for ${cardDef(sk.swarm)?.name ?? sk.swarm}`;
    } else if (o.type === 'cmdSkin') {
      const sk = CMD_SKINS[o.id];
      art = cmdFullImg(sk.commander, o.id, { w: 160, h: 200, priority: false });
      name = sk.name;
      sub = `Outfit for ${COMMANDERS[sk.commander]?.name ?? 'Commanders'}`;
    } else {
      art = bannerEl(o.id, 'bk-feat-ban', h('span', { class: 't-d outline' }, BANNERS[o.id].name));
      name = BANNERS[o.id].name;
      sub = BANNERS[o.id].animated ? 'Animated profile banner' : 'Profile banner';
    }
    const tile = h('div', { class: `bk-plate bk-feat k-${o.type} ${owned ? 'sold owned' : ''}` },
      h('div', { class: 'bk-kind t-d' }, o.type === 'skin' ? 'SKIN' : o.type === 'cmdSkin' ? 'OUTFIT' : 'BANNER'),
      h('div', { class: 'bk-feat-art' }, art),
      h('div', { class: 'bk-plate-n t-d' }, name),
      h('div', { class: 'bk-plate-s' }, sub),
      owned ? h('div', { class: 'bk-owned t-d' }, icon('check', 's'), 'OWNED') : priceButton('bucks', o.price, false, () => buy({
        key, cur: 'bucks', price: o.price, tile, kind: 'look',
        title: 'FEATURED', art: rewardArt({ type: o.type, id: o.id }), text: `Get <b>${name}</b>?`, sub: h('div', { class: 'center-t t-sm c-muted' }, sub),
        async onPaid() {
          const got = grantReward({ type: o.type, id: o.id });
          await showRewards(got, { title: 'NEW LOOK!', note: o.type === 'banner' ? 'Equip it from your Profile.' : o.type === 'skin' ? 'Equip it from the card info.' : 'Equip it in the Lab tab.' });
        },
      })));
    return tile;
  }

  /** Preview an entrance with one of your best troops (plays the cutscene, then comes back here). */
  function previewEntrance(id) {
    const owned = Object.keys(state.p.cards).filter((c) => cardDef(c) && !isSpell(c));
    const order = (c) => RARITIES[cardDef(c).rarity]?.order ?? 0;
    const card = owned.sort((a, b) => order(b) - order(a))[0] ?? 'panther';
    game.go('vialopen', { type: 'testTube', preview: { entrance: id, card }, back: 'home', backParams: { tab: 'shop' } });
  }

  function entranceTile(e) {
    const owned = ownsEntrance(e.id);
    const equipped = equippedEntrance() === e.id;
    const key = 'ent:' + e.id;
    const tile = h('div', { class: `bk-plate bk-ent ${owned ? 'owned' : ''} ${equipped ? 'eq' : ''}`, style: { '--ec': e.color } },
      equipped ? ribbon('EQUIPPED', 'teal') : e.pass && !owned ? ribbon('FOOD PASS', 'pink') : null,
      h('div', { class: 'bk-ent-art' }, entranceArt(e.id)),
      h('div', { class: 'bk-plate-n t-d' }, e.name),
      h('div', { class: 'bk-plate-s' }, e.desc),
      h('div', { class: 'bk-ent-btns' },
        button('', () => previewEntrance(e.id), 'blue sm bk-ent-pv', { icon: 'play', sound: 'tap' }),
        owned
          ? equipped ? h('div', { class: 'bk-owned t-d' }, icon('check', 's'), 'IN USE')
            : button('EQUIP', () => { equipEntrance(e.id); audio.play('upgrade'); sparkle(tile, { count: 14 }); shell.render(); }, 'yellow sm', { sound: 'tap' })
          : e.pass ? h('div', { class: 'bk-pass t-d' }, icon('calorie', 's'), 'PASS REWARD')
            : priceButton('bucks', e.price, false, () => buy({
              key, cur: 'bucks', price: e.price, tile, kind: 'entrance',
              title: 'ENTRANCE', art: entranceArt(e.id, 'mn-ent-confirm'), text: `Get the <b>${e.name}</b> entrance?`,
              sub: h('div', { class: 'center-t t-sm c-muted' }, 'Plays every time you unlock a NEW card.'),
              async onPaid() {
                const got = grantReward({ type: 'entrance', id: e.id });
                equipEntrance(e.id);
                await showRewards(got, { title: 'NEW ENTRANCE!', note: 'Equipped! It plays when you unlock a new card.' });
              },
            }), { cls: 'green sm' })));
    return tile;
  }

  function vialTile(o) {
    const v = VIALS[o.id];
    const key = 'vial:' + o.id;
    const sold = shopBought(key);
    const tile = h('div', { class: `bk-plate bk-vtile vr-${v.rarity} ${sold ? 'sold' : ''}` },
      !sold && o.id === 'hyperchrome' ? ribbon('8x SHINY', 'teal') : null,
      h('div', { class: 'bk-vtile-art' }, h('i', { class: 'bk-vtile-glow' }), vialArt(o.id)),
      h('div', { class: 'bk-plate-n t-d' }, v.name),
      h('div', { class: 'bk-plate-s' }, VIAL_BLURB[o.id] ?? v.desc),
      sold ? stampEl('SOLD OUT') : priceButton('bucks', o.price, false, () => buy({
        key, cur: 'bucks', price: o.price, tile, kind: 'vial',
        title: v.name.toUpperCase(), art: vialArt(o.id, 'mn-confirm-vial'), text: v.desc, sub: h('div', { class: 'center-t t-sm c-gold' }, 'Opens right away. No timer.'),
        async onPaid() { ctx.openVial?.({ type: o.id, source: 'shop' }); },
      })));
    soldTap(tile);
    return tile;
  }

  function coinTile(o, i, all) {
    const key = 'deal:' + o.id;
    const sold = shopBought(key);
    const ic = COIN_ART[o.id] ?? 'coin';
    const ratio = (x) => x.coins / Math.max(1, x.price);
    const baseR = Math.min(...all.map(ratio));
    const bonus = Math.round((ratio(o) / baseR - 1) * 100);
    const best = all.every((x) => ratio(x) <= ratio(o));
    const tile = h('div', { class: `bk-plate bk-coin ${sold ? 'sold' : ''} ${best ? 'best' : ''}` },
      !sold && best ? ribbon('BEST VALUE', 'gold') : null,
      !sold && bonus >= 5 ? h('div', { class: 'bk-bonus t-d' }, `+${bonus}%`) : null,
      h('div', { class: 'bk-coin-art' }, h('div', { class: 'px-rays bk-coin-rays' }), animIcon(ic, 'bk-coin-ic')),
      h('div', { class: 'bk-coin-amt t-d' }, fmtN(o.coins)),
      h('div', { class: 'bk-plate-s' }, o.label),
      sold ? stampEl('SOLD OUT') : priceButton('bucks', o.price, false, () => buy({
        key, cur: 'bucks', price: o.price, tile, kind: 'coins', title: o.label.toUpperCase(), art: icon(ic, 'mn-confirm-ic'), text: `Get <b>${fmtN(o.coins)} Beast Coins</b>?`,
        async onPaid() {
          addCoins(o.coins);
          audio.play('coin');
          await showRewards([{ type: 'coins', amount: o.coins }], { title: 'COINS!' });
        },
      })));
    soldTap(tile);
    return tile;
  }

  /** Section sign: a stencilled steel plate with hazard ends + a line of small print. */
  function head(title, sub, right = null) {
    return h('div', { class: 'bk-head' },
      h('div', { class: 'bk-head-plate' }, h('i', { class: 'bk-haz l' }), h('span', { class: 'bk-head-t t-d' }, title), h('i', { class: 'bk-haz r' })),
      sub ? h('span', { class: 'bk-head-s' }, sub) : null,
      right);
  }

  // ------------------------------------------------------------------ render

  function render() {
    refreshDaily();
    const off = shopOffers();
    const inner = h('div', { class: 'mn-inner bk-inner' });
    const left = off.cards.filter((o) => !shopBought('card:' + o.id)).length;
    // the counter: daily gift, free vial, today's card crates
    inner.appendChild(h('div', { class: 'bk-sec bk-counter' },
      head('DAILY DEALS', left ? `${left} of ${off.cards.length} left. Fell off a truck.` : 'Sold out. Restock at midnight.'),
      h('div', { class: 'bk-wides' }, giftTile(off), freeVialTile()),
      h('div', { class: 'bk-crates' }, ...off.cards.map(cardTile))));
    // the vault: the featured vial
    const hero = heroTile(off);
    if (hero) inner.appendChild(h('div', { class: 'bk-sec' }, head('THE VAULT', 'One a day. Opens on the spot.'), hero));
    // featured looks
    const feat = featuredOffers();
    if (feat.length) inner.appendChild(h('div', { class: 'bk-sec' }, head('FEATURED LOOKS', 'New every day.'), h('div', { class: 'bk-grid3' }, ...feat.map(featuredTile))));
    // entrance cutscenes
    inner.appendChild(h('div', { class: 'bk-sec' }, head('ENTRANCES', 'Your NEW card cutscene.'), h('div', { class: 'bk-ents' }, ...Object.values(ENTRANCES).map(entranceTile))));
    // vials
    const restVials = off.vials.filter((v) => v.id !== hero?.heroId);
    if (restVials.length) inner.appendChild(h('div', { class: 'bk-sec' }, head('VIALS', 'No timers. Shake right away.'), h('div', { class: 'bk-grid3' }, ...restVials.map(vialTile))));
    // coins
    inner.appendChild(h('div', { class: 'bk-sec' }, head('BEAST COINS', 'Counted twice. Probably.'), h('div', { class: 'bk-grid3' }, ...off.deals.map((d, i, all) => coinTile(d, i, all)))));
    inner.appendChild(h('div', { class: 'bk-note-foot' }, icon('bucks', 's'), h('span', {}, 'Beast Bucks come from the Trophy Road, Lab Levels, the Food Pass, bosses and secrets on Beast Island.')));
    return inner;
  }

  function cleanup() {
    disposed = true;
    if (talking) closeDialogue();
    offFrame();
    ro?.disconnect();
    window.removeEventListener('resize', onResize);
    clearTimeout(talkOff);
    bk.onParcel = null;
    if (bk.nolan) bk.nolan.talk(false);
    bk.release();
  }

  shell.render();
  // build the bunker (first visit only), then show it behind the tab
  bk.build().then(() => { if (!disposed) { bk.act('idle'); rectDirty = true; bk.attach(); } }).catch((e) => console.warn('bunker unavailable', e));
  return { dispose: () => shell.dispose(), refresh: () => shell.schedule(40) };
}

// bake the bunker's voxels in a worker a few seconds after the lobby loads (this module comes in
// with the nav badges), so the first SHOP visit opens without a wait
if (typeof window !== 'undefined') setTimeout(() => { try { prewarmBunker(); } catch (e) { /* baked on first visit instead */ } }, 4000);

const rich = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*(.+?)\*/g, '<b>$1</b>');

/** Shop notification count (free gift waiting). */
export function shopBadge() {
  refreshDaily();
  return (state.p.shop.freeClaimed || shopBought('free') ? 0 : 1) + (freeVialStatus().ready ? 1 : 0);
}
