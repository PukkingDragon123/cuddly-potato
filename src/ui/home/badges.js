// Notification counts for the home lobby's bottom-nav dots.
import { state } from '../../game/state.js';
import { shopBadge } from './shop.js';
import { cardsBadge } from './cards.js';
import { labBadgeCount } from './lab.js';
import { passClaimCount, challengeClaimCount, questClaimCount } from './pass.js';
import { trophyRoadBadge } from './trophyRoad.js';

/**
 * badges() -> { shop, cards, lab, pass, road }
 *   shop:  daily gift waiting
 *   cards: upgradable cards (copies + coins) and newly found cards
 *   lab:   finished research to look at, or a free bench with an affordable research
 *   pass:  claimable pass tiers + finished challenges + finished quests
 *   road:  claimable Trophy Road rewards (bonus: for the trophy button)
 */
export function badges() {
  const safe = (fn) => { try { return fn() | 0; } catch (e) { console.warn('badge', e); return 0; } };
  if (!state.p) return { shop: 0, cards: 0, lab: 0, pass: 0, road: 0 };
  return {
    shop: safe(shopBadge),
    cards: safe(cardsBadge),
    lab: safe(labBadgeCount),
    pass: safe(() => passClaimCount() + challengeClaimCount() + questClaimCount()),
    road: safe(trophyRoadBadge),
  };
}
