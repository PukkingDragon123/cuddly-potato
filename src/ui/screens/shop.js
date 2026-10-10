// Daily rotating shop: free gift, vials (Beast Bucks), swarm cards (coins),
// coin deals. Resets at local midnight.
import { h, icon, button, toast } from '../ui.js';
import { audio } from '../../core/audio.js';
import {
  state, owned, upgradeInfo, shopOffers, shopBought, markBought, spendBucks, spendCoins, addVial, grantReward, refreshDaily,
} from '../../game/state.js';
import { SWARMS, RARITIES } from '../../data/swarms.js';
import { VIALS } from '../../data/vials.js';
import { makeScreen, vialImg, swarmImg, rewardArt, rewardLabel, showRewards, confirmBox, fmt, fmtTime, priceTag, deny, sectionTitle, sparkle } from './common.js';

export function shopAlerts() {
  return !state.p.shop.freeClaimed && !shopBought('free');
}

function secsToMidnight() {
  const now = new Date();
  return (new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 1000;
}

const CUR_ICON = { bucks: 'bucks', coins: 'coin' };

async function buy({ key, cur, price, title, art, text, grant, color = 'green' }) {
  if (shopBought(key)) return;
  const have = cur === 'bucks' ? state.p.bucks : state.p.coins;
  if (have < price) return deny(`Not enough ${cur === 'bucks' ? 'Beast Bucks' : 'Beast Coins'}!`);
  const ok = await confirmBox({ title, art, text, yes: 'BUY', price: { cur: CUR_ICON[cur], amount: price }, yesCls: color, color: 'green' });
  if (!ok) return;
  const paid = cur === 'bucks' ? spendBucks(price) : spendCoins(price);
  if (!paid) return deny('Not enough funds!');
  markBought(key);
  audio.play('chaching');
  grant();
}

export function openShop(hub, opts = {}) {
  return makeScreen(hub, {
    name: 'shop',
    title: 'DAILY SHOP',
    color: 'green',
    cls: 'sc-shop',
    tick(scr) {
      const s = secsToMidnight();
      const el = scr.panel.querySelector('.js-reset');
      if (el) el.textContent = fmtTime(s);
      if (s < 1.5) {
        setTimeout(() => {
          refreshDaily();
          state.emit('shop');
        }, 1600);
      }
    },
    afterRender(scr) {
      if (opts.section && !scr.data.jumped) {
        scr.data.jumped = true;
        const el = scr.panel.querySelector(`[data-sec="${opts.section}"]`);
        if (el) scr.m.body.scrollTop = el.offsetTop - 8;
      }
    },
    render() {
      const off = shopOffers();
      const p = state.p;
      const root = h('div', { class: 'col' });
      root.appendChild(h('div', { class: 'hub-shop-head' }, icon('cart'), h('b', {}, 'Fresh offers every day!'), h('span', { class: 'spacer' }), h('span', { class: 'hub-chip' }, icon('clock'), 'Resets in ', h('b', { class: 'js-reset' }, fmtTime(secsToMidnight())))));

      // --- free gift + deals row
      const top = h('div', { class: 'hub-shop-grid' });
      const freeDone = p.shop.freeClaimed || shopBought('free');
      const gift = h('div', { class: `hub-offer gift px-box ${freeDone ? 'dark sold' : 'light'}` },
        h('div', { class: 'tag display' }, 'DAILY GIFT'),
        h('div', { class: 'art' }, rewardArt(off.free, 96)),
        h('div', { class: 'nm' }, rewardLabel(off.free)),
        freeDone
          ? h('div', { class: 'sold-tag display' }, 'CLAIMED')
          : button('FREE!', () => {
            p.shop.freeClaimed = true;
            markBought('free');
            const got = grantReward(off.free);
            audio.play('coin');
            showRewards(got, { title: 'DAILY GIFT!' });
          }, 'green pulse'),
      );
      top.appendChild(gift);
      for (const d of off.deals) {
        const key = 'deal:' + d.id;
        const sold = shopBought(key);
        top.appendChild(
          h('div', { class: `hub-offer px-box ${sold ? 'dark sold' : 'light'}` },
            h('div', { class: 'tag display' }, d.coins >= 5000 ? 'BEST VALUE' : 'DEAL'),
            h('div', { class: 'art' }, h('div', { class: 'hub-rart cur coinpile' + (d.coins >= 5000 ? ' vault' : '') }, icon(d.coins >= 5000 ? 'chest' : 'coin', 'big-ic'), h('b', { class: 'outline-sm' }, fmt(d.coins)))),
            h('div', { class: 'nm' }, d.label),
            sold
              ? h('div', { class: 'sold-tag display' }, 'SOLD')
              : button(priceTag('bucks', fmt(d.price)), () => buy({
                key, cur: d.cur, price: d.price, title: d.label.toUpperCase(), text: `Get <b>${fmt(d.coins)} Beast Coins</b>?`,
                art: h('div', { class: 'hub-info-art' }, rewardArt({ type: 'coins', amount: d.coins })),
                grant: () => showRewards(grantReward({ type: 'coins', amount: d.coins }), { title: 'KA-CHING!' }),
              }), 'pink'),
          ),
        );
      }
      root.appendChild(h('div', { 'data-sec': 'deals' }, sectionTitle('SPECIAL OFFERS'), top));

      // --- vials
      const vg = h('div', { class: 'hub-shop-grid' });
      for (const v of off.vials) {
        const key = 'vial:' + v.id;
        const sold = shopBought(key);
        const def = VIALS[v.id];
        const full = p.vials.slots.every((s) => s);
        vg.appendChild(
          h('div', { class: `hub-offer vial px-box ${sold ? 'dark sold' : 'light'}` },
            h('div', { class: 'art vialbg' }, vialImg(v.id, sold ? '' : 'bob')),
            h('div', { class: 'nm' }, def.name),
            h('div', { class: 'tiny muted' }, `${def.cards} Swarms · ${fmtTime(def.time)}`),
            sold
              ? h('div', { class: 'sold-tag display' }, 'SOLD')
              : button(priceTag('bucks', fmt(v.price)), () => buy({
                key, cur: v.cur, price: v.price, title: def.name.toUpperCase(),
                text: `${def.desc}${full ? '<br><small>Your vial slots are full - it will wait in storage.</small>' : ''}`,
                art: h('div', { class: 'hub-info-art vialbg' }, vialImg(v.id, 'bob')),
                grant: () => {
                  const slot = addVial(v.id);
                  toast(slot >= 0 ? `*${def.name}* added to slot ${slot + 1}!` : `*${def.name}* sent to storage`, { icon: 'vial' });
                },
              }), 'pink'),
          ),
        );
      }
      root.appendChild(h('div', { 'data-sec': 'vials' }, sectionTitle('VIALS'), vg));

      // --- swarm cards
      const sg = h('div', { class: 'hub-shop-grid' });
      for (const s of off.swarms) {
        const key = 'swarm:' + s.id;
        const sold = shopBought(key);
        const def = SWARMS[s.id];
        const e = owned(s.id);
        const info = e ? upgradeInfo(s.id) : null;
        sg.appendChild(
          h('div', { class: `hub-offer swarm px-box ${sold ? 'dark sold' : 'light'} r-${def.rarity}` },
            h('div', { class: 'tag display', style: { background: RARITIES[def.rarity].color } }, RARITIES[def.rarity].name.toUpperCase()),
            h('div', { class: 'art' }, swarmImg(s.id, 'base', null, 96), h('b', { class: 'qty outline-sm' }, 'x' + s.copies)),
            h('div', { class: 'nm' }, def.name),
            h('div', { class: 'tiny muted' }, e ? (info?.max ? `Lv${e.level} · MAX` : `Lv${e.level} · ${e.copies}/${info.copies}`) : 'NEW swarm!'),
            sold
              ? h('div', { class: 'sold-tag display' }, 'SOLD')
              : button(priceTag('coin', fmt(s.price)), () => buy({
                key, cur: s.cur, price: s.price, title: def.name.toUpperCase(), text: `Buy <b>${s.copies}x ${def.name}</b>?`,
                art: h('div', { class: 'hub-info-art' }, rewardArt({ type: 'swarm', id: s.id, copies: s.copies }, 128)),
                grant: () => showRewards(grantReward({ type: 'swarm', id: s.id, copies: s.copies }), { title: 'NEW CARDS!' }),
              }), 'yellow'),
          ),
        );
      }
      root.appendChild(h('div', { 'data-sec': 'swarms' }, sectionTitle('SWARM CARDS'), sg));
      void sparkle;
      return root;
    },
  });
}
