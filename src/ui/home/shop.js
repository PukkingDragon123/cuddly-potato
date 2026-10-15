// SHOP tab: Clash Royale-style daily shop.
//   Daily gift (free) + 6 daily card deals (coins / bucks), featured
//   cosmetics (Swarm skins, banners, Commander outfits), vials for Beast
//   Bucks (opened right away via ctx.openVial) and coin bundles.
//   Everything resets at local midnight.
import { h, icon, button, sparkle } from '../ui.js';
import { cardEl } from '../cards.js';
import { audio } from '../../core/audio.js';
import { mulberry32, hashString, todayKey } from '../../core/util.js';
import {
  state, upgradeInfo, shopOffers, shopBought, markBought, spendBucks, spendCoins, addCoins, grantReward, refreshDaily,
} from '../../game/state.js';
import { cardDef, RARITIES } from '../../data/cards.js';
import { VIALS } from '../../data/vials.js';
import { BANNERS, SWARM_SKINS, CMD_SKINS } from '../../data/season.js';
import { COMMANDERS } from '../../data/commanders.js';
import {
  screenShell, secHead, timerChip, midnightMs, vialArt, rewardArt, rewardLabel, showRewards, confirmBox, deny,
  refreshCtx, fmt, fmtN, bannerEl, swarmImg, cmdFullImg, cmdSkinOwned,
} from './common.js';

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
  labPack: '18+ cards · 2 Rare guaranteed',
  megaLab: '42+ cards · Ultra Rare guaranteed',
  hyperchrome: '12+ cards · 8x shiny odds!',
  cashCase: '70+ cards · Legendary guaranteed!',
  snackPack: '15+ Snack Squad cards',
  testTube: '7+ cards',
};
const COIN_ART = { coinPile: 'coinStack', coinBag: 'coinPile', coinVault: 'coinChest' };

export function mount(el, ctx) {
  let day = todayKey();
  const shell = screenShell(el, {
    cls: 'mn-shop', render,
    tick() {
      if (todayKey() !== day) {
        day = todayKey();
        refreshDaily();
        shell.render();
        refreshCtx(ctx);
      }
    },
  });

  const have = (cur) => (cur === 'bucks' ? state.p.bucks : state.p.coins);
  const curName = (cur) => (cur === 'bucks' ? 'Beast Bucks' : 'Beast Coins');
  const pay = (cur, n) => (cur === 'bucks' ? spendBucks(n) : spendCoins(n));

  /** Mark a tile sold with a stamp + juice (before the re-render catches up). */
  function soldFx(tile) {
    if (!tile?.isConnected) return;
    tile.classList.add('sold', 'just');
    tile.appendChild(h('div', { class: 'mn-stamp t-d' }, 'SOLD'));
    sparkle(tile, { count: 18 });
  }

  async function buy({ key, cur, price, tile, title, art, text, sub, onPaid, yesCls = 'green' }) {
    if (shopBought(key)) return;
    const btn = tile?.querySelector('.btn');
    if (have(cur) < price) return deny(ctx, `Not enough ${curName(cur)}! You need *${fmt(price - have(cur))}* more.`, btn);
    const ok = await confirmBox({ title, art, text, sub, yes: 'BUY', yesCls, price: { cur, amount: price }, color: 'green' });
    if (!ok) return;
    if (!pay(cur, price)) return deny(ctx, `Not enough ${curName(cur)}!`, btn);
    markBought(key);
    audio.play('chaching');
    shell.lock(900);
    soldFx(tile);
    refreshCtx(ctx);
    await onPaid();
    shell.render();
  }

  // ------------------------------------------------------------------ tiles

  function priceButton(cur, price, sold, onClick, label = null) {
    if (sold) return h('div', { class: 'mn-soldtag t-d outline' }, icon('check', 's'), 'SOLD OUT');
    const b = button(label, onClick, 'green sm', { price: { cur, amount: price }, sound: 'tap' });
    if (have(cur) < price) b.classList.add('poor');
    return b;
  }

  function giftTile(off) {
    const p = state.p;
    const done = p.shop.freeClaimed || shopBought('free');
    const r = off.free;
    const tile = h('div', { class: `mn-gift panel sk-panel-gold ${done ? 'sold' : ''}` },
      h('div', { class: 'px-rays mn-gift-rays' }),
      h('div', { class: 'mn-gift-art' }, rewardArt(r)),
      h('div', { class: 'col grow', style: { gap: 'calc(var(--u)*0.6)', zIndex: 1 } },
        h('span', { class: 't-d outline t-lg c-gold' }, 'DAILY GIFT'),
        h('b', { class: 'mn-gift-n' }, rewardLabel(r)),
        h('span', { class: 't-xs c-muted' }, 'A free goodie from the Lab, every day!')),
      done ? h('div', { class: 'mn-soldtag t-d outline' }, icon('check', 's'), 'CLAIMED') : button('FREE!', () => {
        if (state.p.shop.freeClaimed || shopBought('free')) return;
        state.p.shop.freeClaimed = true;
        markBought('free');
        const got = grantReward(r);
        audio.play('coin');
        shell.lock(900);
        soldFx(tile);
        refreshCtx(ctx);
        showRewards(got, { title: 'DAILY GIFT!' }).then(() => shell.render());
      }, 'yellow pulse', { icon: 'gift' }));
    return tile;
  }

  function cardTile(o) {
    const d = cardDef(o.id);
    const key = 'card:' + o.id;
    const sold = shopBought(key);
    const isNew = !state.p.cards[o.id];
    const tile = h('div', { class: `mn-offer mn-r-${d.rarity} ${sold ? 'sold' : ''}` },
      h('div', { class: 'mn-offer-top' }, h('span', { class: 'mn-qty t-d outline' }, 'x' + o.copies), isNew ? h('span', { class: 'mn-newcard t-d' }, 'NEW') : null),
      h('div', { class: 'mn-offer-art' }, cardEl(o.id, { size: 'mini', noLevel: true, locked: false, owned: state.p.cards[o.id] ?? { level: 1 } })),
      h('div', { class: 'mn-offer-n' }, d.name),
      priceButton(o.cur, o.price, sold, () => buy({
        key, cur: o.cur, price: o.price, tile,
        title: 'BUY CARDS', art: cardEl(o.id, { noLevel: true, locked: false, owned: state.p.cards[o.id] ?? { level: 1 } }),
        text: `Buy <b>${o.copies} x ${d.name}</b>?`,
        sub: h('div', { class: 'center-t t-sm c-muted' }, `${RARITIES[d.rarity]?.name ?? ''} card`),
        async onPaid() {
          const got = grantReward({ type: 'card', id: o.id, copies: o.copies });
          const up = upgradeInfo(o.id);
          await showRewards(got, { title: 'CARDS!', note: up && !up.max && up.enoughCopies ? `${d.name} is ready to upgrade!` : null });
        },
      })));
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
      art = bannerEl(o.id, 'mn-feat-ban', h('span', { class: 't-d outline' }, BANNERS[o.id].name));
      name = BANNERS[o.id].name;
      sub = BANNERS[o.id].animated ? 'Animated profile banner' : 'Profile banner';
    }
    const tile = h('div', { class: `mn-feat panel sk-panel-pink ${owned ? 'sold owned' : ''} k-${o.type}` },
      h('div', { class: 'mn-feat-tag t-d' }, o.type === 'skin' ? 'SKIN' : o.type === 'cmdSkin' ? 'OUTFIT' : 'BANNER'),
      h('div', { class: 'mn-feat-art' }, art),
      h('div', { class: 'mn-feat-n t-d outline' }, name),
      h('div', { class: 'mn-feat-s' }, sub),
      owned ? h('div', { class: 'mn-soldtag t-d outline' }, icon('check', 's'), 'OWNED') : priceButton('bucks', o.price, false, () => buy({
        key, cur: 'bucks', price: o.price, tile,
        title: 'FEATURED', art: rewardArt({ type: o.type, id: o.id }), text: `Get <b>${name}</b>?`, sub: h('div', { class: 'center-t t-sm c-muted' }, sub),
        async onPaid() {
          const got = grantReward({ type: o.type, id: o.id });
          await showRewards(got, { title: 'NEW LOOK!', note: o.type === 'banner' ? 'Equip it from your Profile.' : o.type === 'skin' ? 'Equip it from the card info.' : 'Equip it in the Lab tab.' });
        },
      })));
    return tile;
  }

  function vialTile(o) {
    const v = VIALS[o.id];
    const key = 'vial:' + o.id;
    const sold = shopBought(key);
    const tile = h('div', { class: `mn-vtile vr-${v.rarity} ${sold ? 'sold' : ''}` },
      h('div', { class: 'mn-vtile-glow' }),
      h('div', { class: 'mn-vtile-art' }, vialArt(o.id)),
      h('div', { class: 'mn-vtile-n t-d outline' }, v.name),
      h('div', { class: 'mn-vtile-s' }, VIAL_BLURB[o.id] ?? v.desc),
      priceButton('bucks', o.price, sold, () => buy({
        key, cur: 'bucks', price: o.price, tile,
        title: v.name.toUpperCase(), art: vialArt(o.id, 'mn-confirm-vial'), text: v.desc, sub: h('div', { class: 'center-t t-sm c-gold' }, 'Opens instantly - no waiting!'),
        async onPaid() {
          ctx.openVial?.({ type: o.id, source: 'shop' });
        },
      })));
    return tile;
  }

  function coinTile(o) {
    const key = 'deal:' + o.id;
    const sold = shopBought(key);
    const ic = COIN_ART[o.id] ?? 'coin';
    const tile = h('div', { class: `mn-ctile ${sold ? 'sold' : ''}` },
      h('div', { class: 'mn-ctile-art' }, h('div', { class: 'px-rays mn-ctile-rays' }), icon(ic, 'mn-ctile-ic')),
      h('div', { class: 'mn-ctile-amt t-d outline c-gold' }, fmtN(o.coins)),
      h('div', { class: 'mn-ctile-n' }, o.label),
      priceButton('bucks', o.price, sold, () => buy({
        key, cur: 'bucks', price: o.price, tile, title: o.label.toUpperCase(), art: icon(ic, 'mn-confirm-ic'), text: `Get <b>${fmtN(o.coins)} Beast Coins</b>?`,
        async onPaid() {
          addCoins(o.coins);
          audio.play('coin');
          await showRewards([{ type: 'coins', amount: o.coins }], { title: 'COINS!' });
        },
      })));
    return tile;
  }

  // ------------------------------------------------------------------ render

  function render() {
    refreshDaily();
    const off = shopOffers();
    const inner = h('div', { class: 'mn-inner' });
    // hero header
    inner.appendChild(h('div', { class: 'mn-shophead' },
      h('div', { class: 'mn-shophead-ic' }, icon('shop')),
      h('div', { class: 'col', style: { gap: 0 } }, h('span', { class: 't-d outline mn-shophead-t' }, 'BEAST SHOP'), h('span', { class: 't-xs c-muted' }, 'Fresh deals from the Lab every day')),
      h('span', { class: 'spacer' }),
      timerChip(midnightMs(), 'New in')));
    // daily deals
    inner.appendChild(h('div', { class: 'mn-shopsec' }, secHead('DAILY DEALS', 'gold'), giftTile(off),
      h('div', { class: 'mn-offers' }, ...off.cards.map(cardTile))));
    // featured
    const feat = featuredOffers();
    if (feat.length) inner.appendChild(h('div', { class: 'mn-shopsec' }, secHead('FEATURED', 'pink'), h('div', { class: 'mn-feats' }, ...feat.map(featuredTile))));
    // vials
    inner.appendChild(h('div', { class: 'mn-shopsec' }, secHead('VIALS', 'blue'), h('div', { class: 'mn-vials' }, ...off.vials.map(vialTile))));
    // coins
    inner.appendChild(h('div', { class: 'mn-shopsec' }, secHead('BEAST COINS', 'green'), h('div', { class: 'mn-coins' }, ...off.deals.map(coinTile))));
    inner.appendChild(h('div', { class: 'mn-shopnote' }, icon('bucks', 's'), h('span', {}, 'Earn Beast Bucks from the Trophy Road, Lab Levels, the Food Pass, bosses and secrets on Beast Island.')));
    return inner;
  }

  shell.render();
  return { dispose: () => shell.dispose(), refresh: () => shell.schedule(40) };
}

/** Shop notification count (free gift waiting). */
export function shopBadge() {
  refreshDaily();
  return state.p.shop.freeClaimed || shopBought('free') ? 0 : 1;
}
