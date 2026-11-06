// Lonan's PROFILE GEAR shelf in the SHOP (the bunker): today's 4 profile items
// (2 pictures, a frame, a title; src/data/profileItems.js profileShopOffers) for coins or bucks.
// Owned ones can be worn right here. shop.js passes its own helpers (section sign, buy flow with
// the confirm + stamp + coat flash, price button) so the shelf behaves like every other tile.
import { h, icon, button, sparkle } from '../ui.js';
import { audio } from '../../core/audio.js';
import { state, grantReward, equipLook } from '../../game/state.js';
import { profileShopOffers, itemDef, ownsItem } from '../../data/profileItems.js';
import { featureUnlocked } from '../../game/progression.js';
import { avatarEl } from '../avatar.js';
import { rewardArt, showRewards } from './common.js';

const KIND = { avatar: 'PICTURE', frame: 'FRAME', title: 'TITLE' };

/** The PROFILE GEAR section (null until the Profile is unlocked). */
export function profileGearSection({ head, buy, priceButton, rerender }) {
  if (!featureUnlocked('profile')) return null;
  const c = state.p.cosmetics;
  const tile = (o) => {
    const it = itemDef(o.kind, o.id);
    const own = ownsItem(state.p, o.kind, o.id);
    const on = c[o.kind] === o.id;
    const art = o.kind === 'avatar' ? avatarEl(o.id, c.frame, { cls: 'bk-gear-av' })
      : o.kind === 'frame' ? avatarEl(c.avatar, o.id, { cls: 'bk-gear-av' })
        : h('div', { class: 'bk-gear-ttl' }, h('span', { class: 'bk-gear-ttl-nm t-d' }, state.p.name), h('b', { class: 't-d' }, it.name));
    const el = h('div', { class: `bk-plate bk-feat bk-gear k-${o.kind} r-${it.rarity ?? 'common'} ${own ? 'owned' : ''}` },
      h('div', { class: 'bk-kind t-d' }, KIND[o.kind]),
      h('div', { class: 'bk-feat-art bk-gear-art' }, art),
      h('div', { class: 'bk-plate-n t-d' }, it.name),
      on ? h('div', { class: 'bk-owned t-d' }, icon('check', 's'), 'WEARING')
        : own ? button('WEAR', () => { equipLook(o.kind, o.id); audio.play('magic'); sparkle(el, { count: 14 }); rerender(); }, 'yellow sm', { sound: 'tap' })
          : priceButton(o.cur, o.price, false, () => buy({
            key: `gear:${o.kind}:${o.id}`, cur: o.cur, price: o.price, tile: el, kind: 'look',
            title: 'PROFILE GEAR', art: rewardArt({ type: o.kind, id: o.id }), text: `Get <b>${it.name}</b>?`,
            async onPaid() {
              const got = grantReward({ type: o.kind, id: o.id });
              await showRewards(got, { title: 'NEW LOOK!', note: 'Wear it from your Profile, or tap WEAR here.' });
            },
          })));
    return el;
  };
  return h('div', { class: 'bk-sec', 'data-guide': 'profile-gear' },
    head('PROFILE GEAR'),
    h('div', { class: 'bk-gears' }, ...profileShopOffers().map(tile)));
}
