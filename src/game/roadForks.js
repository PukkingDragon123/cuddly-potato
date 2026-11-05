// Trophy Road forks: which trail you picked at each fork + the bonus chests on the trails
// (data in data/roadForks.js). Picks live in state.p.roadForks ({ forkId: 'a' | 'b' }); claimed bonus
// chests share state.p.trophyRoad with the trunk milestones (keys 'f.<arenaId>.<side><n>'), so old saves
// need no migration: every trunk reward you already claimed stays claimed, and every fork starts unpicked.
//
//   forkChoice(id)        'a' | 'b' | null
//   forkReached(F)        your best trophies reached the fork (you can pick)
//   pendingForks()        reached, unpicked and the other trail not open yet (the road asks you to pick)
//   trailOpen(F, side)    that trail's chests can be claimed (picked, or you reached the next arena)
//   chooseFork(id, side)  pick a trail (once)
//   forkItemState(m)      'claimed' | 'ready' | 'locked'
//   forkClaimable()       bonus chests ready to claim
//   claimForkItem(m)      grant it; returns the reward display objects ([] if it isn't ready)
import { state, grantReward } from './state.js';
import { FORKS, forkById, forkItems } from '../data/roadForks.js';

const P = () => state.p;
const picks = () => {
  const p = P();
  if (!p.roadForks || typeof p.roadForks !== 'object') p.roadForks = {};
  return p.roadForks;
};

export function forkChoice(id) {
  const c = P()?.roadForks?.[id];
  return c === 'a' || c === 'b' ? c : null;
}
export const forkReached = (F) => (P()?.bestTrophies ?? 0) >= F.lo;
/** Both trails are open once you reach the next arena. */
export const forkDone = (F) => (P()?.bestTrophies ?? 0) >= F.openAt;
export function pendingForks() {
  return FORKS.filter((F) => forkReached(F) && !forkDone(F) && !forkChoice(F.id));
}
export function trailOpen(F, side) {
  return forkDone(F) || forkChoice(F.id) === side;
}
export function chooseFork(id, side) {
  const F = forkById(id);
  if (!F || (side !== 'a' && side !== 'b') || forkChoice(id) || !forkReached(F)) return false;
  picks()[id] = side;
  state.emit('roadFork');
  return true;
}
export function forkItemState(m) {
  const p = P();
  if (p.trophyRoad?.[m.key]) return 'claimed';
  const F = forkById(m.fork);
  if (F && p.bestTrophies >= m.t && trailOpen(F, m.side)) return 'ready';
  return 'locked';
}
export function forkClaimable() {
  return forkItems().filter((m) => forkItemState(m) === 'ready');
}
export function claimForkItem(m) {
  if (forkItemState(m) !== 'ready') return [];
  P().trophyRoad[m.key] = true;
  return grantReward(m.reward);
}
