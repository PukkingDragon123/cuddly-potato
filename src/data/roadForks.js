// Trophy Road forks. Between two arenas the road splits into two trails that rejoin before the next
// arena gate: the COIN TRAIL (the main road, gold pavers) and the VIAL TRAIL (a side road, violet pavers).
// When your best trophies reach the fork you pick one; its chests open right away. The other trail
// opens once you reach the next arena, so nobody misses anything for good.
//
// Every TROPHY_ROAD milestone stays where it was (trunk rewards are untouched): a chapter's milestones
// sit before and after the fork, the fork window is the trophy gap between them and each trail holds
// two bonus chests inside that window. Everything is derived from ARENAS / TROPHY_ROAD, so a retuned
// road just moves the windows. Keys are stable: 'f.<arenaId>.<a|b><1|2>'.
//
//   FORKS[i]  { id (arena id the chapter starts in), chapter, frac, lo, hi, openAt, next (arena), a, b }
//             a / b: { side, trail, items: [{ key, t, reward, fork, side, n }] }
//   TRAILS    { a: COIN TRAIL, b: VIAL TRAIL }
//   forkById(id), forkItems() (every bonus milestone)
import { ARENAS, TROPHY_ROAD } from './arenas.js';

export const TRAILS = {
  a: { side: 'a', name: 'COIN TRAIL', icon: 'coin', color: '#ffc21a', dark: '#8a5a00', line: 'Coins now, coins later. Mostly coins.' },
  b: { side: 'b', name: 'VIAL TRAIL', icon: 'vial', color: '#b072ff', dark: '#4a1a8a', line: 'Vials full of cards. Some of them sticky.' },
};

// chapters (arena index the fork starts in) that get a fork: every chapter with road enough between two
// arenas (the space station's orbit road has no fork)
const FORK_ARENAS = ['lab', 'circle', 'factory', 'mart', 'redlight', 'antarctica', 'reactor', 'pyramid', 'island', 'jungle', 'laser', 'haunted', 'reef'];

const COIN_BASE = [100, 150, 250, 350, 450, 600, 800, 1000, 1300, 1600, 1900, 2200, 2500, 2800];
const round = (v, q) => Math.max(q, Math.round(v / q) * q);

function vialsFor(c) {
  if (c < 1) return ['testTube', 'testTube'];
  if (c < 4) return ['testTube', 'labPack'];
  if (c < 9) return ['labPack', 'labPack'];
  return ['labPack', 'megaLab'];
}

function build() {
  const out = [];
  ARENAS.forEach((A, c) => {
    if (!FORK_ARENAS.includes(A.id)) return;
    const next = ARENAS[c + 1];
    if (!next) return;
    // this chapter's trunk milestones (arena gates excluded)
    const trunk = TROPHY_ROAD.filter((m) => !m.arena && m.t >= A.trophies && m.t < next.trophies).sort((x, y) => x.t - y.t);
    const n = trunk.length;
    const nBefore = Math.ceil(n / 2);
    const lo = nBefore > 0 ? trunk[nBefore - 1].t : A.trophies;
    const hi = nBefore < n ? trunk[nBefore].t : next.trophies;
    if (hi - lo < 4) return;
    // tidy thresholds inside the window (multiples of 10 or 50)
    const span = hi - lo, q = span >= 150 ? 50 : span >= 30 ? 10 : 1;
    const t1 = lo + Math.max(q, Math.round(span / 3 / q) * q);
    const t2 = Math.min(hi - 1, Math.max(t1 + 1, lo + Math.round((span * 2) / 3 / q) * q));
    const coins = COIN_BASE[Math.min(COIN_BASE.length - 1, c)];
    const vials = vialsFor(c);
    const F = { id: A.id, chapter: c, frac: Math.max(0.3, Math.min(0.55, 0.62 - 0.03 * n)), nBefore, lo, hi, openAt: next.trophies, next };
    const item = (side, k, t, reward) => ({ key: `f.${A.id}.${side}${k}`, t, reward, fork: A.id, side, n: k });
    F.a = { side: 'a', trail: TRAILS.a, items: [item('a', 1, t1, { type: 'coins', amount: round(coins, 50) }), item('a', 2, t2, { type: 'coins', amount: round(coins * 1.6, 50) })] };
    F.b = { side: 'b', trail: TRAILS.b, items: [item('b', 1, t1, { type: 'vial', id: vials[0] }), item('b', 2, t2, { type: 'vial', id: vials[1] })] };
    out.push(F);
  });
  return out;
}

export const FORKS = build();
const BY_ID = Object.fromEntries(FORKS.map((F) => [F.id, F]));
export const forkById = (id) => BY_ID[id] ?? null;
export const forkItems = () => FORKS.flatMap((F) => [...F.a.items, ...F.b.items]);
