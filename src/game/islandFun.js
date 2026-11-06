// Small daily treats for poking things on Beast Island (bee hives, coconut palms, the fishing pier,
// the treasure X, the geyser...). Each spot pays a few coins once per day; state.p.islandFun =
// { day: 'YYYY-MM-DD', got: { spotId: timestamp } } resets when the day changes.
//
//   funReady(id)          true if that spot still has today's treat
//   funClaim(id, coins)   grant it once per day; returns the coins granted (0 if already taken)
import { state, grantReward } from './state.js';
import { todayKey } from '../core/util.js';

function today() {
  const p = state.p;
  const day = todayKey();
  if (!p.islandFun || typeof p.islandFun !== 'object' || p.islandFun.day !== day) p.islandFun = { day, got: {} };
  if (!p.islandFun.got || typeof p.islandFun.got !== 'object') p.islandFun.got = {};
  return p.islandFun;
}
export function funReady(id) {
  const f = state.p?.islandFun;
  return !(f && f.day === todayKey() && f.got?.[id]);
}
export function funClaim(id, coins) {
  if (!state.p || !funReady(id)) return 0;
  today().got[id] = Date.now();
  grantReward({ type: 'coins', amount: coins });
  return coins;
}
