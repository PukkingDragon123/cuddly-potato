// Rank medals: the player's Lab Level badge, used everywhere a level sits next
// to a player name (home top bar, profile, Lab tab, VS intro, battle HUD,
// Beast News result, level-up rewards).
//
// The level picks a TIER and the tier picks the medal:
//   Bronze      1-2   gear-edged bronze medal on a lab-blue neck ribbon
//   Silver      3-4   faceted silver star with a medallion core, striped ribbon bar
//   Gold        5-7   gold medallion in a laurel wreath, star crest, red ribbon tails
//   Platinum    8-10  crowned platinum crest with teal enamel and ribbon tails
//   Diamond     11-13 gem-encrusted hex crest, brilliant-cut crown gem, crystal wings
//   Lab Legend  14+   glowing pink-goo flask with golden wings and a sunburst
// Each tier has 1-3 sub-ranks ("Gold III"); the medal shows them as studs that
// light up (crown gems on Platinum, rim gems on Diamond...).
//
// The art is painted procedurally on the same pixel canvas and shader as the
// icon set (src/ui/icons.js), at a resolution picked from the size the medal
// is shown at (one cached PNG data URL per tier + sub-rank + scale). The level
// number is live text (Swarm Display, ink outline, never rotated) placed on
// the medal's face, so it stays sharp at 24 px and at 96 px.
//
//   rankMedal(level, { cls, shine })  -> <span class="rmedal">
//   setRankMedal(el, level, { pop })  -> update (pop = level-up animation)
//   popRankMedal(el)                  -> the level-up pop on its own
//   rankInfo(level)                   -> { tier, sub, subs, name: 'Gold III' }
import { PixCanvas, renderPixArt, ICON_COLORS as C } from './icons.js';
import { h, sparkle } from './ui.js';
import { LAB_MAX_LEVEL } from '../data/labs.js';
import './rankMedal.css';

// --------------------------------------------------------------------------- tiers

/** fx/fy: face centre in design units (48 grid), fr: face radius; spark: level-up sparkle colours. */
export const RANK_TIERS = [
  { id: 'bronze', name: 'Bronze', from: 1, fx: 24, fy: 30.5, fr: 12, spark: ['#ffffff', '#ffb070', '#e07a34', '#8fd4ff'] },
  { id: 'silver', name: 'Silver', from: 3, fx: 24, fy: 29.5, fr: 11.5, spark: ['#ffffff', '#dfe8ff', '#9fb2d8', '#ff6a7a'] },
  { id: 'gold', name: 'Gold', from: 5, fx: 24, fy: 25.5, fr: 11.5, spark: ['#ffffff', '#ffe46a', '#ffc21a', '#ff5a6a'] },
  { id: 'platinum', name: 'Platinum', from: 8, fx: 24, fy: 30, fr: 11.5, spark: ['#ffffff', '#c8fbff', '#5ee8f0', '#ffd84a'] },
  { id: 'diamond', name: 'Diamond', from: 11, fx: 24, fy: 29, fr: 11.5, spark: ['#ffffff', '#9ff4ff', '#b48aff', '#ff8ad0'] },
  { id: 'legend', name: 'Lab Legend', from: LAB_MAX_LEVEL, fx: 24, fy: 36.6, fr: 10.4, spark: ['#ffffff', '#ff8ac4', '#ff2e88', '#ffe46a'] },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** Tier + sub-rank for a Lab Level. */
export function rankInfo(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  let i = 0;
  while (i + 1 < RANK_TIERS.length && lv >= RANK_TIERS[i + 1].from) i++;
  const tier = RANK_TIERS[i], next = RANK_TIERS[i + 1];
  const subs = next ? next.from - tier.from : 1;
  const sub = Math.min(subs, lv - tier.from + 1);
  return { level: lv, tier, index: i, sub, subs, name: subs > 1 ? `${tier.name} ${ROMAN[sub - 1]}` : tier.name };
}
export const rankName = (level) => rankInfo(level).name;
/** Tier name label ("Gold III") in the tier's colour. */
export function rankLabel(level, cls = '') {
  const r = rankInfo(level);
  return h('b', { class: `rm-tname rm-t-${r.tier.id} t-d outline ${cls}`.trim() }, r.name);
}

// --------------------------------------------------------------------------- drawing helpers

const TAU = Math.PI * 2;
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
const pol = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
const deg = (d) => (d * Math.PI) / 180;
function inPoly(pts, X, Y) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
/** Flat (unshaded) polygon: for hand-lit facets. */
function polyF(p, pts, c) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return p.each((x, y) => (inPoly(pts, x, y) ? c : undefined), true, [x0, y0, x1, y1]);
}
/** Light from the top-left: -1 (facing away) .. 1 (facing the light) for an outward angle a. */
const lit = (a) => Math.cos(a - deg(-125));
/** Pointed leaf (lens) from base (x, y) along angle a. */
function leaf(p, x, y, a, len, wid, c) {
  const pts = [], ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
  for (let k = 0; k <= 8; k++) { const t = k / 8, w = Math.sin(Math.PI * t) * wid; pts.push([x + ca * len * t + nx * w, y + sa * len * t + ny * w]); }
  for (let k = 7; k >= 1; k--) { const t = k / 8, w = Math.sin(Math.PI * t) * wid * 0.85; pts.push([x + ca * len * t - nx * w, y + sa * len * t - ny * w]); }
  p.poly(pts, c);
}
/** Ribbon tail with a V-notched end, from (x0, y0) to (x1, y1), width w. */
function tail(p, x0, y0, x1, y1, w, c, notch = 0.32) {
  const L = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L, nx = -dy * w / 2, ny = dx * w / 2;
  p.poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - dx * w * notch, y1 - dy * w * notch], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], c);
}
/** Small rhombus stud (sub-rank pip): lit or an empty socket. */
function stud(p, x, y, r, on, onCol, offCol) {
  p.poly([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], on ? onCol : offCol);
  if (on) p.dot(Math.floor(x - r * 0.35), Math.floor(y - r * 0.45), C.white);
}
/** Positions of n studs spread along a bottom arc (angles in degrees around 90 = straight down). */
const arcStuds = (cx, cy, r, n, step) => Array.from({ length: n }, (_, i) => pol(cx, cy, r, deg(90 + (i - (n - 1) / 2) * -step)));

// --------------------------------------------------------------------------- the six medals (48 x 48 design grid)

const ART = {};

// BRONZE: a gear-edged lab medal hanging from a blue V neck ribbon
ART.bronze = (p, sub, subs) => {
  const B = { deep: '#5a2a12', dark: '#94501f', base: '#cf7d3c', light: '#f3ad6c', face: '#7c3e1a' };
  const cx = 24, cy = 30.5;
  // neck ribbon (right strap behind, left strap in front), white centre stripes
  p.poly([[27, 0], [38.5, 0], [30.5, 18], [21.5, 15]], '#1f4fb4');
  p.line(32.8, 0, 26.4, 15.5, '#7cc4ff', 0.4);
  p.poly([[9.5, 0], [21, 0], [26.5, 15], [17.5, 18]], '#2f72e6');
  p.line(15.2, 0, 21.8, 15.5, '#bfe6ff', 0.4);
  // gear rim: 12 square teeth
  p.each((x, y) => {
    const d = dist(x, y, cx, cy);
    if (d > 17.6) return undefined;
    const k = (((Math.atan2(y - cy, x - cx) / TAU) * 12 + 100.25) % 1);
    return d <= (k < 0.5 ? 17.6 : 15.6) ? B.dark : undefined;
  }, false, [cx - 18, cy - 18, cx + 18, cy + 18]);
  p.ring(cx, cy, 15, 12.6, B.base);
  // bright bevel on the lit side of the rim, dark on the far side
  p.each((x, y) => { const d = dist(x, y, cx, cy); if (d > 15 || d < 13.9) return undefined; const l = lit(Math.atan2(y - cy, x - cx)); return l > 0.55 ? B.light : l < -0.6 ? B.dark : undefined; });
  p.circ(cx, cy, 12.6, B.face);
  // recessed face: a shadow lip under the top edge
  p.each((x, y) => { const d = dist(x, y, cx, cy); return d <= 12.6 && d > 11.4 && y < cy - 3 ? B.deep : undefined; });
  // rivets between the teeth
  for (const a of [-135, -45, 45, 135]) { const [x, y] = pol(cx, cy, 13.8, deg(a)); p.dot(Math.round(x - 0.5), Math.round(y - 0.5), '#ffd6a8'); }
  // ribbon clasp
  p.rr(17, 11, 14, 4.4, 1.6, B.dark);
  p.rect(18.4, 11.6, 11.2, 1, B.light);
  arcStuds(cx, cy, 13.8, subs, 18).forEach(([x, y], i) => stud(p, x, y, 1.7, i < sub, '#fff0b0', B.deep));
  p.spark(41, 15, 2);
};

// SILVER: faceted five-point star around a blue enamel medallion, red striped ribbon bar
ART.silver = (p, sub, subs) => {
  const S = { deep: '#46506e', dark: '#7a87aa', base: '#c2cde4', light: '#eef3ff', face: '#2a4cb4' };
  const cx = 24, cy = 29.5, ro = 21.6, ri = 11.2;
  // ribbon bar: red with white edge stripes and a blue centre stripe
  p.rr(12, 0.6, 24, 8.6, 1.4, '#d8283e');
  p.rect(14.2, 0.6, 2, 8.6, C.snow).rect(31.8, 0.6, 2, 8.6, C.snow);
  p.rect(22.4, 0.6, 3.2, 8.6, '#2f72e6');
  for (let i = 0; i < subs; i++) stud(p, 24 + (i - (subs - 1) / 2) * 6.4, 4.9, 1.7, i < sub, '#fff0b0', '#8a1426');
  p.rect(21.6, 8.6, 4.8, 3.4, S.dark);
  // star: each arm split into a lit and a shaded facet (flat hand-lit tones)
  const tones = [S.deep, S.dark, S.base, S.light];
  for (let i = 0; i < 5; i++) {
    const a = deg(-90 + i * 72), tip = pol(cx, cy, ro, a), l = pol(cx, cy, ri, a - deg(36)), r = pol(cx, cy, ri, a + deg(36));
    const tl = lit(a - deg(26)), tr = lit(a + deg(26));
    const tone = (v) => tones[Math.max(0, Math.min(3, Math.round((v + 1) * 1.5)))];
    polyF(p, [[cx, cy], l, tip], tone(tl));
    polyF(p, [[cx, cy], tip, r], tone(tr));
    // ridge line down the middle of each arm
    p.line(cx + (tip[0] - cx) * 0.5, cy + (tip[1] - cy) * 0.5, tip[0], tip[1], tl > 0 ? S.light : S.base, 0, true);
  }
  // medallion core
  p.circ(cx, cy, 12.4, S.dark);
  p.ring(cx, cy, 12.4, 10.6, S.base);
  p.each((x, y) => { const d = dist(x, y, cx, cy); if (d > 12.4 || d < 11.4) return undefined; const l = lit(Math.atan2(y - cy, x - cx)); return l > 0.5 ? S.light : l < -0.5 ? S.deep : undefined; });
  p.circ(cx, cy, 10.6, S.face);
  p.each((x, y) => { const d = dist(x, y, cx, cy); return d <= 10.6 && d > 9.6 && y < cy - 3 ? '#16286e' : undefined; });
  p.spark(42, 10, 2).spark(5, 40, 1);
};

// GOLD: crimson-enamel gold medallion inside a laurel wreath, star crest, ribbon tails
ART.gold = (p, sub, subs) => {
  const G = { deep: '#9a5410', dark: '#d8861a', base: '#ffc21a', light: '#ffe46a', face: '#c41e3a' };
  const cx = 24, cy = 25.5;
  // ribbon tails behind the bottom of the wreath
  tail(p, 22, 38, 12.5, 47.4, 7, '#b8182e');
  tail(p, 26, 38, 35.5, 47.4, 7, '#e0283e');
  // laurel: a stem arc on each side with leaf pairs
  for (const side of [-1, 1]) {
    const a0 = side < 0 ? 112 : 68, a1 = side < 0 ? 238 : -58;
    for (let k = 0; k <= 30; k++) { const a = deg(a0 + ((a1 - a0) * k) / 30), [x, y] = pol(cx, cy, 19, a); p.circ(x, y, 0.9, '#1f7a2a'); }
    for (let k = 0; k < 6; k++) {
      const t = (k + 0.5) / 6, ad = a0 + (a1 - a0) * t, a = deg(ad), [x, y] = pol(cx, cy, 19, a);
      const tang = a + (side < 0 ? Math.PI / 2 : -Math.PI / 2); // along the stem, toward the top
      leaf(p, x, y, tang - side * deg(-38), 7.4 - k * 0.35, 2.3, k % 2 ? '#3fb43c' : '#4ccc48');
      leaf(p, x, y, tang - side * deg(42), 6.4 - k * 0.3, 2, '#2a9a34');
    }
  }
  // star crest on top
  p.star(cx, 4.6, 4.6, 2.1, 5, G.base);
  p.star(cx - 0.6, 4, 2.2, 1, 5, '#fff2b0');
  // medallion: beaded gold edge, rim, enamel face
  p.each((x, y) => {
    const d = dist(x, y, cx, cy);
    const a = Math.atan2(y - cy, x - cx);
    return d <= 14.6 + 0.7 * Math.cos(a * 22) ? G.dark : undefined;
  }, false, [cx - 16, cy - 16, cx + 16, cy + 16]);
  p.ring(cx, cy, 13.6, 11.6, G.base);
  p.each((x, y) => { const d = dist(x, y, cx, cy); if (d > 13.6 || d < 12.6) return undefined; const l = lit(Math.atan2(y - cy, x - cx)); return l > 0.5 ? G.light : l < -0.55 ? G.dark : undefined; });
  p.circ(cx, cy, 11.6, G.face);
  p.each((x, y) => { const d = dist(x, y, cx, cy); return d <= 11.6 && d > 10.5 && y < cy - 3 ? '#7e0c22' : undefined; });
  // ribbon band across the foot of the medallion: the sub-rank studs sit on it
  p.rr(15.4, 37.4, 17.2, 4.8, 1.6, '#e0283e');
  p.rect(16.4, 37.9, 15.2, 0.8, '#ff8a90');
  for (let i = 0; i < subs; i++) stud(p, 24 + (i - (subs - 1) / 2) * 5.2, 39.9, 1.6, i < sub, '#fff6c8', '#7e0c22');
  p.spark(42, 6, 2).spark(6, 44, 1);
};

// PLATINUM: crowned octagonal crest, teal enamel, ribbon tails; the crown gems are the sub-rank
ART.platinum = (p, sub, subs) => {
  const P = { deep: '#2e5a76', dark: '#5f98b4', base: '#b4e2ee', light: '#effcff', face: '#0c7a8a' };
  const cx = 24, cy = 30;
  tail(p, 19, 40, 9.5, 47.6, 7.4, '#5a2aa8');
  tail(p, 29, 40, 38.5, 47.6, 7.4, '#7a3ad8');
  const oct = (r) => Array.from({ length: 8 }, (_, i) => pol(cx, cy, r, deg(22.5 + i * 45)));
  p.poly(oct(17.4), P.dark);
  p.poly(oct(15.8), P.base);
  // facet light on the crest rim: brighter top-left edges, darker bottom-right
  const o1 = oct(15.8), o2 = oct(13);
  for (let i = 0; i < 8; i++) {
    const a = deg(22.5 + i * 45 + 22.5), l = lit(a);
    if (Math.abs(l) < 0.35) continue;
    polyF(p, [o1[i], o1[(i + 1) % 8], o2[(i + 1) % 8], o2[i]], l > 0 ? P.light : P.dark);
  }
  p.poly(o2, P.deep);
  p.poly(oct(12.2), P.face);
  p.each((x, y) => (inPoly(oct(12.2), x, y) && !inPoly(oct(12.2).map(([a, b]) => [a, b + 1.2]), x, y) ? '#064652' : undefined));
  // crown
  const G = { base: '#ffc21a', light: '#ffe46a', dark: '#d8861a' };
  p.poly([[12.5, 15], [11, 4.4], [17.2, 9.4], [24, 1.6], [30.8, 9.4], [37, 4.4], [35.5, 15]], G.base);
  p.poly([[14.2, 13], [13.6, 8.4], [17.4, 11.6], [24, 5.2], [30.6, 11.6], [34.4, 8.4], [33.8, 13]], '#ffd84a');
  p.rr(11.6, 11.8, 24.8, 4.8, 1.2, G.dark);
  p.rect(12.4, 12.2, 23.2, 1, G.light);
  for (const [x, y] of [[11, 4.4], [24, 1.6], [37, 4.4]]) { p.circ(x, y + 0.4, 1.7, C.pearl); p.dot(Math.floor(x - 1), Math.floor(y - 0.6), C.white); }
  // sub-rank gems on the crown band
  for (let i = 0; i < subs; i++) { const x = 24 + (i - (subs - 1) / 2) * 6.6; stud(p, x, 14.2, 1.9, i < sub, ['#ff3e98', '#7ae8ff', '#4cd24a'][i % 3], '#7a4a10'); }
  p.spark(43, 22, 2).spark(4, 24, 1);
};

// DIAMOND: gem-encrusted hex crest with a brilliant-cut crown gem and crystal wings
ART.diamond = (p, sub, subs) => {
  const D = { deep: '#3c4a7a', dark: '#7c8ec0', base: '#d6e2fa', light: '#f6faff', face: '#3a249e' };
  const cx = 24, cy = 29;
  // crystal wings: three shards per side
  for (const s of [-1, 1]) {
    const X = (x) => cx + s * x;
    p.poly([[X(10), 22], [X(23.6), 13], [X(17), 27]], s < 0 ? '#5ad8f0' : '#3ab8e0');
    p.poly([[X(11), 27], [X(24), 25], [X(14.5), 34]], s < 0 ? '#7ae8ff' : '#4ac8ec');
    p.poly([[X(11), 32], [X(21.6), 37.5], [X(11.6), 38.6]], s < 0 ? '#5ad8f0' : '#3ab8e0');
  }
  const hex = (r, dy = 0) => Array.from({ length: 6 }, (_, i) => pol(cx, cy + dy, r, deg(i * 60)));
  p.poly(hex(17.6), D.dark);
  p.poly(hex(16), D.base);
  const o1 = hex(16), o2 = hex(13.2);
  for (let i = 0; i < 6; i++) {
    const l = lit(deg(i * 60 + 30));
    if (Math.abs(l) < 0.3) continue;
    polyF(p, [o1[i], o1[(i + 1) % 6], o2[(i + 1) % 6], o2[i]], l > 0 ? D.light : D.dark);
  }
  p.poly(o2, D.deep);
  p.poly(hex(12.4), D.face);
  p.each((x, y) => (inPoly(hex(12.4), x, y) && !inPoly(hex(12.4, 1.2), x, y) ? '#1e1260' : undefined));
  // faint star sparkles in the enamel, kept clear of the number
  p.dot(16, 26, '#8a7ae8').dot(31, 33, '#8a7ae8');
  // set gems on the four side corners; the bottom three are the sub-rank
  for (const i of [5, 4]) { const [x, y] = o1[i === 5 ? 5 : 4]; p.circ(x, y, 2.4, D.dark); p.circ(x, y, 1.7, i === 5 ? '#ff4aa0' : '#7ae8ff'); p.dot(Math.floor(x - 1), Math.floor(y - 1), C.white); }
  arcStuds(cx, cy, 15.6, subs, 26).forEach(([x, y], i) => { p.circ(x, y, 2.5, D.dark); stud(p, x, y, 2, i < sub, '#7ae8ff', '#28305a'); });
  // brilliant-cut crown gem on top
  const gx = 24, gy = 3.4, gw = 15, gh = 11;
  p.poly([[gx - gw / 2, gy + gh * 0.32], [gx - gw * 0.26, gy], [gx + gw * 0.26, gy], [gx + gw / 2, gy + gh * 0.32], [gx, gy + gh]], '#3ab8e0');
  polyF(p, [[gx - gw / 2, gy + gh * 0.32], [gx - 1.8, gy + gh * 0.32], [gx, gy + gh]], '#8ff0ff');
  polyF(p, [[gx + gw / 2, gy + gh * 0.32], [gx + 1.8, gy + gh * 0.32], [gx, gy + gh]], '#1c86c0');
  polyF(p, [[gx - gw * 0.26, gy], [gx + gw * 0.26, gy], [gx + 1.8, gy + gh * 0.32], [gx - 1.8, gy + gh * 0.32]], '#d8fbff');
  p.line(gx - gw / 2 + 1, gy + gh * 0.32, gx + gw / 2 - 1, gy + gh * 0.32, '#ffffff', 0, true);
  p.spark(19, 4, 2).spark(44, 40, 2).spark(3, 12, 1);
};

// LAB LEGEND: a glowing flask of pink goo, golden wings, a sunburst behind
ART.legend = (p) => {
  const cx = 24;
  // sunburst behind the top half: 12 alternating rays
  for (let i = 0; i < 12; i++) {
    const a = deg(-90 + i * 30), w = deg(8.5), r = i % 2 ? 20 : 24;
    p.poly([[cx, 23], pol(cx, 23, r, a - w), pol(cx, 23, r, a + w)], i % 2 ? '#ff9ad0' : '#ffd84a');
  }
  // golden wings off the flask shoulders: three feathers per side, light inner vanes
  for (const s of [-1, 1]) {
    const X = (x) => cx + s * x;
    const F = [[[7, 16.6], [23.6, 5.4], [22.4, 10.6], [8.6, 21]], [[8, 21], [23.8, 13.4], [22, 18.8], [9.6, 25.4]], [[9.4, 25.2], [22.8, 21.6], [20, 26.8], [10.6, 29.4]]];
    F.forEach((f, k) => {
      p.poly(f.map(([x, y]) => [X(x), y]), ['#ffd23c', '#ffc21a', '#f0a810'][k]);
      p.line(X(f[0][0] + 1.6), f[0][1] + 0.6, X(f[1][0] - 2), f[1][1] + 1.4, '#fff2b0', 0, true);
    });
  }
  // flask: gold lip, neck, wide conical body
  const body = [[19.6, 14.6], [28.4, 14.6], [41, 37], [41, 41.6], [38.2, 45.2], [9.8, 45.2], [7, 41.6], [7, 37]];
  p.poly(body, C.glass);
  p.rect(19.6, 6.4, 8.8, 9, C.glass);
  p.rr(16.4, 2.4, 15.2, 5, 1.5, C.gold);
  p.rect(17.4, 2.9, 13.2, 1, '#fff2b0');
  // goo with a wavy lit surface and bubbles (kept clear of the number)
  const goo = (x, y) => y > 26.4 + Math.sin(x * 0.9) * 0.6 && y < 43.8 && inPoly(body, x, y) && inPoly(body, x - 1.2, y) && inPoly(body, x + 1.2, y);
  p.each((x, y) => (goo(x, y) ? (y < 28.4 ? '#ff8ac4' : '#ff2e88') : undefined), false, [7, 24, 41, 45]);
  for (const [x, y, r] of [[11.6, 40.6, 1.3], [36.6, 40, 1.5], [31.6, 29.6, 0.9], [16.4, 30, 0.8]]) p.ring(x, y, r + 0.55, r - 0.45, '#ffd6ea');
  // glass highlights
  p.line(21.2, 8, 21.2, 15, C.white, 0, true);
  p.line(18.8, 17.4, 12.4, 29.6, C.white, 0, true);
  p.spark(42, 4, 3).spark(5, 5, 2).spark(45, 44, 1);
};

// --------------------------------------------------------------------------- raster cache

const N = 48;
const urlCache = new Map();
const artKey = (level) => { const i = rankInfo(level); return `${i.tier.id}|${i.sub}`; };
/** PNG data URL of a medal for the level at scale q (q = 1 -> 52 px, 2 -> 104 px ...). */
export function medalURL(level, q = 2) {
  const key = artKey(level) + '|' + q;
  let u = urlCache.get(key);
  if (!u) {
    const info = rankInfo(level);
    const p = new PixCanvas(N, 1, q);
    ART[info.tier.id](p, info.sub, info.subs);
    u = renderPixArt(p, { glints: 1 });
    urlCache.set(key, u);
  }
  return u;
}

// Painting budget: a screen full of new medals (the Lab Level road) must not
// stall a frame, so a frame paints at most ~10 ms of medals; the rest (and
// every big, slow resolution) show a quick draft or a cached copy first and
// sharpen when the main thread is idle.
const BUDGET = 10;
let spent = 0, resetting = false, pumping = false;
const backlog = new Set();
function charge(ms) {
  spent += ms;
  if (resetting) return;
  resetting = true;
  requestAnimationFrame(() => { spent = 0; resetting = false; });
}
const timed = (fn) => { const t0 = performance.now(); const r = fn(); charge(performance.now() - t0); return r; };
function later() {
  if (pumping) return;
  pumping = true;
  const run = () => {
    pumping = false;
    const t0 = performance.now();
    for (const el of [...backlog]) {
      if (performance.now() - t0 >= BUDGET) break;
      backlog.delete(el);
      if (el.isConnected) drawArt(el, true);
    }
    if (backlog.size) later();
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 400 });
  else setTimeout(run, 100);
}

function drawArt(el, late = false) {
  const st = el._rm;
  if (!st.q) return; // not laid out yet: the ResizeObserver paints it at the right size
  const key = artKey(st.level);
  let url = urlCache.get(key + '|' + st.q) ?? (late ? medalURL(st.level, st.q) : null);
  if (!url) {
    // big resolutions are never painted inside the frame that first shows the medal
    const q0 = Math.min(st.q, 3);
    if (spent < BUDGET) url = urlCache.get(key + '|' + q0) ?? timed(() => medalURL(st.level, q0));
    for (let q = MAXQ; q >= 1 && !url; q--) url = urlCache.get(key + '|' + q);
    url ??= timed(() => medalURL(st.level, 1));
    if (!urlCache.has(key + '|' + st.q)) { backlog.add(el); later(); }
  }
  if (st.art.getAttribute('src') !== url) st.art.src = url;
  if (st.shine) el.style.setProperty('--rm-img', `url("${url}")`);
}

// --------------------------------------------------------------------------- the element

const MAXQ = 6;
// layout width (not the on-screen box): pops and modal scale-ins must not change the pick
const needQ = (el) => {
  const w = el.offsetWidth;
  if (!(w > 0)) return 0;
  return Math.max(1, Math.min(MAXQ, Math.ceil((w * (window.devicePixelRatio || 1)) / (N + 4))));
};
let ro = null;
function sharpen(el) {
  const st = el._rm;
  const q = needQ(el);
  if (q > st.q) { st.q = q; drawArt(el); }
}
function watch(el) {
  if (typeof ResizeObserver === 'undefined') { el._rm.q = 2; drawArt(el); return; }
  ro ??= new ResizeObserver((entries) => { for (const e of entries) if (e.target._rm) sharpen(e.target); });
  ro.observe(el);
}
function paint(el) {
  const st = el._rm, t = rankInfo(st.level).tier;
  el.className = el.className.replace(/\brm-t-\w+/g, '').trim() + ` rm-t-${t.id}`;
  // design units -> % of the image (the shader adds a 2-unit outline margin on every side)
  el.style.setProperty('--fx', (((t.fx + 2) / (N + 4)) * 100).toFixed(2) + '%');
  el.style.setProperty('--fy', (((t.fy + 2) / (N + 4)) * 100).toFixed(2) + '%');
  el.style.setProperty('--fr', ((t.fr * 2) / (N + 4)).toFixed(3));
  drawArt(el);
}

/**
 * Rank medal element for a Lab Level. Size it with --rm (CSS); the art resolution follows the laid-out size.
 * opts: { cls, shine (default true): the slow shine sweep }
 */
export function rankMedal(level, opts = {}) {
  const art = h('img', { class: 'rm-art', alt: '', draggable: 'false' });
  const num = h('b', { class: 'rm-n' });
  const el = h('span', { class: `rmedal ${opts.shine === false ? '' : 'rm-shiny'} ${opts.cls ?? ''}`.trim(), role: 'img' },
    art, opts.shine === false ? null : h('i', { class: 'rm-shine' }), num);
  el._rm = { level: 0, q: 0, art, num, shine: opts.shine !== false };
  // medals on one screen shine at different moments
  if (el._rm.shine) el.style.setProperty('--rm-d', -(Math.random() * 6).toFixed(2) + 's');
  setRankMedal(el, level);
  watch(el);
  return el;
}

/** Point a medal at a new level; pop = play the level-up pop (art + number swap at its peak). */
export function setRankMedal(el, level, opts = {}) {
  const st = el?._rm;
  if (!st) return;
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  if (opts.pop && st.level && lv !== st.level) { popRankMedal(el, lv); return; }
  const tierChanged = !st.level || rankInfo(st.level).tier !== rankInfo(lv).tier || rankInfo(st.level).sub !== rankInfo(lv).sub;
  st.level = lv;
  st.num.textContent = String(lv);
  st.num.dataset.n = String(lv);
  el.classList.toggle('rm-d2', lv >= 10);
  el.setAttribute('aria-label', `Lab Level ${lv}: ${rankName(lv)}`);
  if (tierChanged) paint(el);
  if (el.isConnected && st.q < MAXQ) sharpen(el);
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Level-up pop: squash, swell, flash white, swap to the new level at the peak, settle with a wobble-free bounce. */
export function popRankMedal(el, level = el?._rm?.level) {
  const st = el?._rm;
  if (!st) return;
  const from = st.level, to = Math.max(1, Math.floor(Number(level) || 1));
  const newTier = from && rankInfo(from).tier !== rankInfo(to).tier;
  if (reduced() || !el.isConnected) { setRankMedal(el, to); return; }
  st.popAnim?.cancel();
  const swell = newTier ? 1.6 : 1.42;
  st.popAnim = el.animate([
    { scale: '1' },
    { scale: '0.82', offset: 0.14 },
    { scale: String(swell), offset: 0.38 },
    { scale: '0.92', offset: 0.62 },
    { scale: '1.06', offset: 0.8 },
    { scale: '1' },
  ], { duration: newTier ? 900 : 720, easing: 'cubic-bezier(.3,.7,.4,1)' });
  const flash = h('i', { class: 'rm-flash' });
  flash.style.setProperty('--rm-img', `url("${st.art.src}")`);
  el.appendChild(flash);
  setTimeout(() => {
    if (from !== to) setRankMedal(el, to);
    flash.style.setProperty('--rm-img', `url("${st.art.src}")`);
    const t = rankInfo(to).tier;
    sparkle(el, { count: newTier ? 22 : 14, spread: Math.max(40, el.getBoundingClientRect().width * (newTier ? 1.3 : 0.95)), colors: t.spark });
  }, newTier ? 330 : 260);
  flash.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.35 }, { opacity: 0 }], { duration: newTier ? 900 : 720, easing: 'ease-out' }).onfinish = () => flash.remove();
}
