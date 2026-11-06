// Profile avatars: the player's PICTURE inside a pixel-art FRAME, shown wherever a player's
// identity appears (home top bar, profile, VS intro, battle HUD name plates, Beast News, shop).
//
//   avatarEl(avatarId, frameId, { cls, anim })  -> <span class="pav">
//   setAvatar(el, avatarId, frameId)            -> point an element at a new look
//   myAvatarEl(opts)                            -> your own look (state.p.cosmetics), kept in sync by refreshMine()
//   framePreviewEl(frameId) / pictureEl(id)     -> frame alone (over a dark glass window) / picture alone
//
// PICTURES are composited once per (picture, size bucket) into a PNG: a pixel-art backdrop plate
// (dithered two-tone + light rays, upscaled with hard pixels), then the portrait: a 3D chibi
// head render (Commanders, NPCs), a 3D troop render (Troop Mastery), or a pixel-art Beast Lab
// icon painted on the icon set's canvas and shader (src/ui/icons.js). The window has stepped
// pixel corners, matching every frame.
//
// FRAMES are painted on a 48-unit design grid with the icon shader (bevels, hue-shifted ramps,
// selective outline) at a resolution picked from the laid-out size (24 px name plates get a
// small PNG, the 120 px profile card a big one). The ring (3..45) is the element's box; crests,
// horns, flames and drips hang outside it. Animated frames are cheap: either a masked shine
// band (shine) or a pre-rendered sprite strip slid with a stepped transform (goo, laser, holo,
// flame, cosmic); nothing redraws per frame.
import './avatar.css';
import { PixCanvas, renderPixArt } from './icons.js';
import { h } from './ui.js';
import { lazyImg, charPortrait } from './thumbs.js';
import { engine } from '../core/engine.js';
import { createSwarm } from '../models/swarmModels.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { mulberry32, hashString } from '../core/util.js';
import { state } from '../game/state.js';
import { AVATARS, FRAMES, TITLES, DEFAULT_AVATAR, DEFAULT_FRAME } from '../data/profileItems.js';
import { CMD_SKINS } from '../data/season.js';
import { SERIES } from '../data/swarms.js';
import { cardDef } from '../data/cards.js';

// --------------------------------------------------------------------------- geometry (48-unit grid)

const N = 48, M = 2; // design grid; the shader adds a 2-unit outline margin on every side
// the canvas is PAD units bigger on every side than the design grid, so crests, horns and flames
// can rise above the ring (designs keep their 0..48 coordinates, see Shifted)
const PAD = 6, GRID = N + 2 * PAD;
const O0 = 3, O1 = 45, W0 = 8, W1 = 40, CHO = 3, CHW = 2.5;
const BOX = O1 - O0; // the element's box is the ring's outer edge
/** CSS placement of the frame image and the picture window, in % of the element box (see avatar.css). */
export const AV_GEOM = {
  frameInset: -((O0 + PAD + M) / BOX) * 100, frameSize: ((GRID + 2 * M) / BOX) * 100,
  picInset: ((W0 - O0) / BOX) * 100, picSize: ((W1 - W0) / BOX) * 100,
  chamfer: (CHW / (W1 - W0)) * 100,
};
/** PixCanvas adapter: design coordinates (0..48) land PAD units in on the padded canvas. */
class Shifted {
  constructor(p, d) { this.p = p; this.d = d; }
  each(fn, flat, box) { const d = this.d; this.p.each((x, y, i, j) => fn(x - d, y - d, i, j), flat, box ? [box[0] + d, box[1] + d, box[2] + d, box[3] + d] : null); return this; }
  rect(x, y, w, hh, c) { this.p.rect(x + this.d, y + this.d, w, hh, c); return this; }
  rr(x, y, w, hh, r, c) { this.p.rr(x + this.d, y + this.d, w, hh, r, c); return this; }
  circ(x, y, r, c) { this.p.circ(x + this.d, y + this.d, r, c); return this; }
  ell(x, y, rx, ry, c) { this.p.ell(x + this.d, y + this.d, rx, ry, c); return this; }
  poly(pts, c) { this.p.poly(pts.map(([x, y]) => [x + this.d, y + this.d]), c); return this; }
  star(x, y, ro, ri, n, c, rot) { this.p.star(x + this.d, y + this.d, ro, ri, n, c, rot); return this; }
  line(x0, y0, x1, y1, c, t, flat) { this.p.line(x0 + this.d, y0 + this.d, x1 + this.d, y1 + this.d, c, t, flat); return this; }
  dot(i, j, c) { this.p.dot(i + this.d, j + this.d, c); return this; }
  spark(i, j, l, c, c2) { this.p.spark(i + this.d, j + this.d, l, c, c2); return this; }
}

const TAU = Math.PI * 2;
const inBox = (x, y, x0, y0, x1, y1, ch) => {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  return Math.min(x - x0, x1 - x) + Math.min(y - y0, y1 - y) >= ch;
};
const inWin = (x, y) => inBox(x, y, W0, W0, W1, W1, CHW);
const inOuter = (x, y, a = 0) => inBox(x, y, O0 + a, O0 + a, O1 - a, O1 - a, Math.max(0.6, CHO - a * 0.45));
/** Ring band between insets a and b (0 = outer edge, 5 = the window). */
function band(p, a, b, col, test = null) {
  return p.each((x, y) => (inOuter(x, y, a) && !inOuter(x, y, b) && !inWin(x, y) && (!test || test(x, y)) ? col : undefined), false, [O0 + a - 1, O0 + a - 1, O1 - a + 1, O1 - a + 1]);
}
/** Distance along the ring's centre line (0..1, clockwise from the top-left corner) + which side. */
function ringPos(x, y) {
  const c = 24, dx = x - c, dy = y - c;
  return (Math.atan2(dy, dx) / TAU + 1.125) % 1;
}
function rivet(p, x, y, col = '#cdd5ea', r = 1.25) {
  p.circ(x, y, r, col);
  p.dot(Math.floor(x - r * 0.4), Math.floor(y - r * 0.45), '#ffffff');
}
function gem(p, x, y, r, col) {
  p.poly([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], col);
  p.dot(Math.floor(x - r * 0.3), Math.floor(y - r * 0.5), '#ffffff');
}
/** Pointed leaf (lens) from (x, y) along angle a. */
function leaf(p, x, y, a, len, wid, c) {
  const pts = [], ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
  for (let k = 0; k <= 8; k++) { const t = k / 8, w = Math.sin(Math.PI * t) * wid; pts.push([x + ca * len * t + nx * w, y + sa * len * t + ny * w]); }
  for (let k = 7; k >= 1; k--) { const t = k / 8, w = Math.sin(Math.PI * t) * wid * 0.85; pts.push([x + ca * len * t - nx * w, y + sa * len * t - ny * w]); }
  p.poly(pts, c);
}
const CORNERS = [[5.6, 5.6], [42.4, 5.6], [5.6, 42.4], [42.4, 42.4]];
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return '#' + ((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0');
};
function hueShift(hex, deg) {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  hh = (((hh + deg) % 360) + 360) % 360;
  const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((hh / 60) % 2) - 1)), m = l - C / 2;
  [r, g, b] = hh < 60 ? [C, X, 0] : hh < 120 ? [X, C, 0] : hh < 180 ? [0, C, X] : hh < 240 ? [0, X, C] : hh < 300 ? [X, 0, C] : [C, 0, X];
  return '#' + (((Math.round((r + m) * 255)) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255)).toString(16).padStart(6, '0');
}

// --------------------------------------------------------------------------- frame designs
// fn(p, phase, def): paint on a 48-grid PixCanvas. `phase` = sprite-strip frame for animated frames.

const FR = {};

// LAB ISSUE: riveted lab steel with a status light
FR.basic = (p) => {
  band(p, 0, 5, '#9aa6c8');
  band(p, 4, 5, '#5a6690');
  p.rect(19, 3.5, 10, 1.6, '#2b3a6a');
  p.rect(20, 3.8, 8, 1, '#7ae8ff');
  for (const [x, y] of CORNERS) rivet(p, x, y);
  for (const [x, y] of [[24, 42.6], [5.4, 24], [42.6, 24]]) rivet(p, x, y, '#b4bfd8', 0.9);
};

// BRONZE BOLTS: bronze ring with gear-tooth corners and hex bolts
FR.bronze = (p) => {
  band(p, 0, 5, '#cf7d3c');
  band(p, 4, 5, '#7c3e1a');
  for (const [x, y] of CORNERS) {
    p.star(x, y, 3.6, 2.6, 8, '#94501f', Math.PI / 8);
    p.circ(x, y, 1.9, '#f3ad6c');
    p.dot(Math.floor(x - 0.6), Math.floor(y - 0.8), '#ffffff');
  }
  for (const [x, y] of [[24, 5.4], [24, 42.6], [5.4, 24], [42.6, 24]]) p.star(x, y, 1.5, 1.5, 6, '#f3ad6c', 0);
};

// SILVER CIRCUIT: silver ring with teal circuit traces and a chip on top
FR.silver = (p) => {
  band(p, 0, 5, '#cdd5ea');
  band(p, 4, 5, '#5e6a90');
  const tr = '#1fb8a8';
  p.line(9, 5.5, 18, 5.5, tr, 0, true); p.line(30, 5.5, 39, 5.5, tr, 0, true);
  p.line(5.5, 12, 5.5, 20, tr, 0, true); p.line(42.5, 28, 42.5, 36, tr, 0, true);
  p.line(14, 42.5, 22, 42.5, tr, 0, true); p.line(26, 42.5, 34, 42.5, tr, 0, true);
  for (const [x, y] of [[9, 5.5], [39, 5.5], [5.5, 12], [5.5, 20], [42.5, 28], [42.5, 36], [14, 42.5], [34, 42.5]]) { p.rect(x - 0.9, y - 0.9, 1.8, 1.8, '#7ae8ff'); }
  // the chip
  p.rect(19, 1.2, 10, 5.2, '#26304a');
  for (let i = 0; i < 4; i++) { p.rect(19.8 + i * 2.4, 0.2, 0.9, 1.2, '#cdd5ea'); p.rect(19.8 + i * 2.4, 6.2, 0.9, 1.2, '#cdd5ea'); }
  p.rect(20.2, 2.4, 7.6, 2.8, '#3ff2c8');
  for (const [x, y] of CORNERS) rivet(p, x, y, '#ffffff', 1.1);
};

// GOLDEN LAB: gold ring, winged flask crest on top, laurels at the bottom, pink corner gems
FR.gold = (p) => {
  band(p, 0, 5, '#ffc21a');
  band(p, 4, 5, '#9a5410');
  band(p, 0, 1, '#d8861a');
  // laurel sprigs along the bottom edge, from a centre gem outward
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = 24 + side * (3.2 + i * 3.3), y = 45.2 - i * 0.5;
    leaf(p, x, y, side > 0 ? -0.5 : Math.PI + 0.5, 3.8, 1.2, '#4cd24a');
    leaf(p, x + side * 0.8, y, side > 0 ? 0.35 : Math.PI - 0.35, 3, 1, '#238a2e');
  }
  gem(p, 24, 44.8, 2.2, '#ff2e88');
  // crest: wings + flask
  p.poly([[24, 4], [12, -0.5], [13.5, 2.5], [10, 2.2], [14, 6], [24, 7.5]], '#ffe46a');
  p.poly([[24, 4], [36, -0.5], [34.5, 2.5], [38, 2.2], [34, 6], [24, 7.5]], '#ffe46a');
  p.poly([[22.4, -0.8], [25.6, -0.8], [25.6, 2.2], [28.6, 7], [19.4, 7], [22.4, 2.2]], '#e6f6ff');
  p.poly([[21, 4.8], [27, 4.8], [28.4, 7], [19.6, 7]], '#ff2e88');
  p.rect(22, -1.4, 4, 0.9, '#9a5410');
  for (const [x, y] of CORNERS) gem(p, x, y, 2, '#ff2e88');
};

// HAZARD TAPE: diagonal yellow / black stripes, a warning sign on top
FR.hazard = (p) => {
  band(p, 0, 5, '#ffc21a', (x, y) => Math.floor((x + y) / 3.2) % 2 === 0);
  band(p, 0, 5, '#1c1a28', (x, y) => Math.floor((x + y) / 3.2) % 2 === 1);
  band(p, 4.2, 5, '#3a3a48');
  p.poly([[24, -1.6], [30.6, 8.4], [17.4, 8.4]], '#1c1a28');
  p.poly([[24, 0.4], [28.8, 7.4], [19.2, 7.4]], '#ffc21a');
  p.rect(23.4, 2.6, 1.2, 2.6, '#1c1a28');
  p.rect(23.4, 5.8, 1.2, 1, '#1c1a28');
};

// WRAPPER FRAME: chocolate squares, torn pink wrapper at the bottom, gold foil corner
FR.choco = (p) => {
  band(p, 0, 5, '#5a2e14');
  // chocolate squares (each one its own bevelled block between grooves)
  band(p, 0.7, 4.3, '#8a4e2a', (x, y) => { const side = Math.abs(x - 24) > Math.abs(y - 24); const u = side ? y : x; return ((u - 3) % 6 + 6) % 6 > 1.1; });
  band(p, 4.3, 5, '#3a1a0a');
  // the wrapper (bottom), zigzag tear
  p.each((x, y) => (inOuter(x, y, -0.6) && !inWin(x, y) && y > 33.5 + Math.abs(((x * 0.9) % 3) - 1.5) * 1.4 ? '#ff4fa3' : undefined), false, [0, 30, 48, 48]);
  p.each((x, y) => (inOuter(x, y, -0.6) && !inWin(x, y) && y > 39.5 && y < 41.5 ? '#ffd6ea' : undefined), false, [0, 38, 48, 43]);
  // foil corner
  p.poly([[O0 + 0.4, O0 + 3.4], [O0 + 3.4, O0 + 0.4], [O0 + 10, O0 + 0.4], [O0 + 0.4, O0 + 10]], '#ffe46a');
  p.dot(5, 6, '#ffffff');
};

// NEON GOO: dark glass ring dripping green goo (phases: the drips stretch and fall)
FR.neonGoo = (p, ph = 0) => {
  band(p, 0, 5, '#26304a');
  band(p, 4, 5, '#121a34');
  // goo coating along the top and down the sides
  p.each((x, y) => (inOuter(x, y) && !inWin(x, y) && y < 7 + Math.sin(x * 0.9) * 1.2 ? '#4cd24a' : undefined), false, [0, 0, 48, 10]);
  const drips = [[11, 4], [19, 6], [29, 3], [37, 5], [44.2, 10], [3.8, 13]];
  drips.forEach(([x, len], i) => {
    const k = (ph + i * 2) % 6, L = len + k * 0.9, w = 1.4 - (k > 4 ? 0.3 : 0);
    const top = x > 43 || x < 5 ? 8 : 3;
    p.rect(x - w / 2, top, w, L, '#4cd24a');
    p.circ(x, top + L, w * 0.9 + 0.3, '#7cff3a');
    if (k === 5) p.circ(x, top + L + 3, 0.7, '#7cff3a');
  });
  // puddle at the bottom
  p.each((x, y) => (inOuter(x, y, -0.4) && !inWin(x, y) && y > 41.6 - Math.sin(x * 0.7 + ph) * 0.8 ? '#4cd24a' : undefined), false, [0, 38, 48, 48]);
};

// BOSS SLAYER: dark iron with horns and a skull plate
FR.boss = (p) => {
  band(p, 0, 5, '#3a2a5a');
  band(p, 4, 5, '#1a1030');
  band(p, 0, 0.9, '#5e2aa8');
  // horns
  p.poly([[6, 6], [1.4, -1.8], [0.4, 3.6], [2.6, 8.6], [9.6, 4.2]], '#f2ead8');
  p.poly([[42, 6], [46.6, -1.8], [47.6, 3.6], [45.4, 8.6], [38.4, 4.2]], '#f2ead8');
  p.poly([[1.4, -1.8], [0.4, 3.6], [1.6, 1.4]], '#b8b0a0');
  p.poly([[46.6, -1.8], [47.6, 3.6], [46.4, 1.4]], '#b8b0a0');
  // spikes along the sides
  for (const y of [16, 24, 32]) { p.poly([[3, y - 1.6], [-0.6, y], [3, y + 1.6]], '#8a96b8'); p.poly([[45, y - 1.6], [48.6, y], [45, y + 1.6]], '#8a96b8'); }
  // skull plate
  p.rr(18.5, 39.2, 11, 8.6, 3, '#f2ead8');
  p.rect(21, 46.4, 6, 1.6, '#f2ead8');
  p.rect(20.4, 41.6, 2.8, 2.6, '#1a1030'); p.rect(24.8, 41.6, 2.8, 2.6, '#1a1030');
  p.rect(23.4, 44.6, 1.2, 1.2, '#1a1030');
  p.rect(21.6, 46.8, 0.8, 1.2, '#1a1030'); p.rect(25.6, 46.8, 0.8, 1.2, '#1a1030');
};

// LASER VAULT: vault steel with emitters; red beams run the ring channel (phases: beams sweep)
FR.laser = (p, ph = 0) => {
  band(p, 0, 5, '#5a6690');
  band(p, 1.6, 3.4, '#141a34');
  band(p, 4, 5, '#2a3050');
  // beams in the channel: a lit stretch that travels round the ring
  band(p, 2.1, 2.9, '#ff3a4a', (x, y) => { const t = (ringPos(x, y) - ph / 6 + 1) % 1; return t < 0.42 || (t > 0.5 && t < 0.92); });
  for (const [x, y] of CORNERS) {
    p.rr(x - 2.6, y - 2.6, 5.2, 5.2, 1, '#9aa6c8');
    p.circ(x, y, 1.2, ph % 2 ? '#ff8a90' : '#ff3a4a');
    p.dot(Math.floor(x - 0.4), Math.floor(y - 0.6), '#ffffff');
  }
  // vault dial on top
  p.circ(24, 3.6, 3.4, '#9aa6c8');
  p.circ(24, 3.6, 2.2, '#2a3050');
  p.line(24, 3.6, 24 + Math.cos(ph) * 1.8, 3.6 + Math.sin(ph) * 1.8, '#ffc21a', 0, true);
};

// HYPERCHROME: faceted crystal ring whose colours slide through the rainbow (phases = hue)
FR.holo = (p, ph = 0) => {
  const base = ['#ff5ab4', '#ffd84a', '#5af0c8', '#5a9cff', '#b45cff', '#ff7a4a'];
  const off = ph * 60;
  for (let k = 0; k < 12; k++) {
    const col = hueShift(base[k % base.length], off);
    band(p, 0, 5, col, (x, y) => Math.floor(ringPos(x, y) * 12) === k);
  }
  band(p, 4.2, 5, hueShift('#5a2aa8', off));
  // crown gem + side shards
  p.poly([[24, -2.2], [28.4, 2.6], [24, 7.6], [19.6, 2.6]], hueShift('#9ff4ff', off));
  p.poly([[24, -0.6], [26.2, 2.6], [24, 5.6], [21.8, 2.6]], '#ffffff');
  for (const [x, y, s] of [[3, 24, -1], [45, 24, 1]]) p.poly([[x, y - 4], [x + s * 3.4, y], [x, y + 4]], hueShift('#ff9ad0', off + 120));
  const sp = [[8, 2], [40, 3], [2, 40], [46, 42], [24, 46]][ph % 5];
  p.spark(sp[0], sp[1], 2);
};

// VOLCANO FORGE: obsidian with lava cracks, flame tongues licking up the top (phases: flames flicker)
function tongue(p, x, base, hgt, wid, lean, col) {
  const L = [], R = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8, half = wid * Math.pow(1 - t, 0.85) * (0.75 + 0.25 * Math.sin(Math.PI * t + 0.6));
    const cx = x + lean * t * t + Math.sin(t * 4.2) * 0.35 * wid;
    L.push([cx - half, base - hgt * t]);
    R.unshift([cx + half, base - hgt * t]);
  }
  p.poly([...L, ...R], col);
}
FR.flame = (p, ph = 0) => {
  const rng = mulberry32(31 + ph * 7);
  const xs = [8, 16, 24, 32, 40];
  xs.forEach((x) => {
    const peak = 1 - Math.abs(x - 24) / 24;
    const hh = 9 + peak * 3.5 + rng() * 2, lean = (rng() - 0.5) * 2.6 + (x - 24) * 0.06;
    tongue(p, x, 7, hh, 4.6, lean, '#e8401a');
    tongue(p, x + lean * 0.1, 7, hh * 0.74, 3.1, lean * 0.7, '#ff8a1f');
    tongue(p, x + lean * 0.2, 7, hh * 0.48, 1.8, lean * 0.4, '#ffd84a');
  });
  for (const x of [4, 44]) {
    const hh = 9 + rng() * 2.5;
    tongue(p, x, 16, hh, 3, (x < 24 ? -1 : 1) * 2.2, '#e8401a');
    tongue(p, x, 16, hh * 0.6, 1.7, (x < 24 ? -1 : 1) * 1.4, '#ffc21a');
  }
  band(p, 0, 5, '#2a1a2a');
  band(p, 4, 5, '#120a14');
  // lava cracks
  band(p, 1.6, 2.6, '#ff8a1f', (x, y) => { const t = ringPos(x, y) * 48; return Math.abs(Math.sin(t * 1.3 + ph * 0.5)) > 0.55; });
  for (const [x, y] of CORNERS) { p.poly([[x, y - 2.6], [x + 2.2, y], [x, y + 2.6], [x - 2.2, y]], '#ffc21a'); p.dot(Math.floor(x), Math.floor(y - 1), '#fff6c8'); }
  // embers drifting up
  for (let i = 0; i < 3; i++) p.dot(Math.floor(8 + rng() * 32), Math.floor(-3 + rng() * 3), i % 2 ? '#ffe46a' : '#ff8a1f');
};

// ZERO-G: deep space ring, star field, a ringed planet and a tiny rocket (phases: stars twinkle)
FR.cosmic = (p, ph = 0) => {
  band(p, 0, 5, '#1a1450');
  band(p, 4, 5, '#0a0828');
  band(p, 0, 0.9, '#5a4ab0');
  const rng = mulberry32(77);
  for (let i = 0; i < 18; i++) {
    const a = rng(), x = a < 0.5 ? 4 + rng() * 40 : rng() < 0.5 ? 4.2 + rng() * 2.6 : 41.4 + rng() * 2.6;
    const y = a < 0.5 ? (rng() < 0.5 ? 4.2 + rng() * 2.6 : 41.4 + rng() * 2.6) : 6 + rng() * 36;
    if (inWin(x, y)) continue;
    const on = (i + ph) % 3 !== 0;
    p.dot(Math.floor(x), Math.floor(y), on ? '#ffffff' : '#7a6cff');
  }
  // the planet (top right) with its ring
  p.circ(41, 6, 5, '#ff8a4a');
  p.each((x, y) => (Math.abs((y - 6) - (x - 41) * 0.35) < 0.8 && Math.abs(x - 41) < 8 && ((x - 41) ** 2 + (y - 6) ** 2 > 20 || y > 6 + (x - 41) * 0.35) ? '#ffe46a' : undefined), false, [32, 0, 50, 12]);
  // rocket (bottom left)
  p.poly([[2, 46], [7.5, 40.5], [9.6, 42.6], [4.1, 48.1]], '#eef4ff');
  p.poly([[7.5, 40.5], [10.6, 39.4], [9.6, 42.6]], '#ff3a4a');
  p.poly([[2, 46], [0.2, 49], [4.1, 48.1]], ph % 2 ? '#ffc21a' : '#ff8a1f');
  const sp = [[12, 3], [30, 45], [45, 30], [3, 14], [22, 4], [44, 44]][ph % 6];
  p.spark(sp[0], sp[1], 2);
};

// ---- troop mastery frames: series metal + series motif + rarity gems + the mastery star plaque
const RARITY_GEM = { common: '#8fd4ff', rare: '#ff9a2e', epic: '#c063ff', legendary: '#5af0c8', mythic: '#ff4fa3' };
const MOTIF = {
  originals(p, c) { for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.poly([[24 + s * (7 + i * 2.4), -0.4], [24 + s * (8.4 + i * 2.4), -0.4], [24 + s * (6.2 + i * 2.4), 5.6]], '#eef4ff'); p.star(24, 2.6, 3.6, 1.6, 5, c); },
  homeHorrors(p, c) { p.rect(1, 10, 3.2, 28, '#b4bfd8'); p.rect(43.8, 10, 3.2, 28, '#b4bfd8'); for (const y of [10, 37]) { p.rect(0.2, y - 1, 4.8, 2, '#7e8aa8'); p.rect(43, y - 1, 4.8, 2, '#7e8aa8'); } p.rr(20, -1, 8, 6, 2, c); p.rect(23.2, 4.4, 1.6, 3, '#6a3a1e'); },
  technoTerrors(p, c) { p.rr(17, -0.6, 14, 6.4, 1, '#26304a'); p.rect(18.6, 1, 10.8, 3.2, c); for (let i = 0; i < 3; i++) p.rect(20 + i * 3.4, 1.8, 1.6, 1.6, '#ffffff'); p.line(4, 14, 1, 14, c, 0.2); p.line(44, 34, 47, 34, c, 0.2); },
  atomic(p, c) { p.circ(24, 2.6, 4.6, '#1c1a28'); for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * TAU) / 3; p.poly([[24, 2.6], [24 + Math.cos(a - 0.5) * 4, 2.6 + Math.sin(a - 0.5) * 4], [24 + Math.cos(a + 0.5) * 4, 2.6 + Math.sin(a + 0.5) * 4]], c); } p.circ(24, 2.6, 1, '#1c1a28'); for (const x of [9, 39]) { p.rect(x - 0.7, 6, 1.4, 4, c); p.circ(x, 10, 1.1, c); } },
  hybrids(p) { p.poly([[18, 6], [20, -1], [22, 3], [24, -2.4], [24, 6]], '#ff5a1f'); p.poly([[24, 6], [24, -2.4], [26.4, 2], [28.4, -1], [30, 6]], '#8fd4ff'); },
  food(p, c) { p.circ(24, 2.8, 4.6, '#d8861a'); p.circ(24, 2.6, 4, c); p.circ(24, 2.6, 1.4, '#7a4220'); for (const [x, y, col] of [[21.6, 0.8, '#ffe46a'], [26.2, 1.2, '#7ae8ff'], [26, 4.4, '#ffffff'], [21.8, 4.6, '#7cff3a']]) p.rect(x, y, 1.2, 0.8, col); },
  labBrats(p, c) { for (const x of [18.4, 24, 29.6]) { p.rr(x - 1.6, -1.2, 3.2, 7.6, 1.4, '#e6f6ff'); p.rect(x - 1.1, 2.4, 2.2, 3.4, c); } },
  creepyCritters(p, c) { for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.line(24 + s * 3, 2 + i * 1.6, 24 + s * (8 + i), -0.8 + i * 2.6, '#1c1a28', 0.25); p.ell(24, 2.6, 3.2, 2.6, '#1c1a28'); p.dot(22.6, 1.6, c); p.dot(24.6, 1.6, c); },
  megaTech(p, c) { for (const [x, y] of [[4.4, 4.4], [43.6, 4.4], [4.4, 43.6], [43.6, 43.6]]) { p.rr(x - 3.6, y - 3.6, 7.2, 7.2, 1, '#3d8bff'); p.rect(x - 1, y - 1, 2, 2, c); } p.poly([[18, 5], [21, -1], [27, -1], [30, 5]], '#26304a'); p.rect(21.6, 0.8, 4.8, 1.6, '#7ae8ff'); },
  fireIce(p) { p.poly([[14, 6], [16.6, -1.6], [18.6, 3.2], [20.8, -0.6], [22, 6]], '#ff5a1f'); p.poly([[26, 6], [27.6, -0.2], [29.4, 3], [31.4, -1.8], [34, 6]], '#8fd4ff'); p.poly([[30.2, 3.4], [31.4, -1.8], [32.4, 4]], '#eef4ff'); },
  battleFusion(p, c) { p.line(17, -0.8, 31, 7.2, '#cdd5ea', 0.9); p.line(31, -0.8, 17, 7.2, '#cdd5ea', 0.9); p.rect(15.8, -1.4, 2.4, 2.4, c); p.rect(29.8, -1.4, 2.4, 2.4, c); p.circ(24, 3.2, 2.4, c); },
  wildlands(p, c) { for (const [x, y, a] of [[6, 4, -0.6], [10, 1.6, -0.2], [42, 4, 0.6], [38, 1.6, 0.2], [2.6, 12, -1.2], [45.4, 12, 1.2], [2.6, 34, -2], [45.4, 34, 2]]) p.ell(x, y, 2.6, 1.3, '#2fd47a'); p.circ(24, 2.4, 2.6, c); },
  spooky(p, c) { p.poly([[24, 4.6], [14, -1.4], [15.6, 2.4], [12.4, 2.6], [16.2, 6.4]], '#2a1a3a'); p.poly([[24, 4.6], [34, -1.4], [32.4, 2.4], [35.6, 2.6], [31.8, 6.4]], '#2a1a3a'); p.ell(24, 3.4, 3.4, 3.6, '#eef4ff'); p.rect(22.4, 2.6, 1.2, 1.4, '#1c1a28'); p.rect(24.6, 2.6, 1.2, 1.4, '#1c1a28'); p.dot(10, 44, c); },
  cosmic(p, c) { p.circ(24, 2.6, 3.6, c); p.each((x, y) => (Math.abs((y - 2.6) - (x - 24) * 0.3) < 0.7 && Math.abs(x - 24) < 6.4 && ((x - 24) ** 2 + (y - 2.6) ** 2 > 12.5 || y > 2.6 + (x - 24) * 0.3) ? '#ffe46a' : undefined), false, [16, -2, 32, 8]); for (const [x, y] of [[9, 1], [40, 2], [1, 30], [47, 18]]) p.dot(x, y, '#ffffff'); },
};
FR.mastery = (p, ph, def) => {
  const d = cardDef(def.card);
  const col = SERIES[def.series]?.color ?? '#29b6f6';
  band(p, 0, 5, shade(col, -0.18));
  band(p, 0, 1, shade(col, -0.5));
  band(p, 4, 5, shade(col, -0.62));
  band(p, 2.2, 2.8, '#ffc21a');
  (MOTIF[def.series] ?? MOTIF.originals)(p, col);
  const g = RARITY_GEM[d?.rarity] ?? RARITY_GEM.common;
  gem(p, 3.6, 24, 2.2, g);
  gem(p, 44.4, 24, 2.2, g);
  // the mastery star plaque
  p.rr(17.6, 40.4, 12.8, 7, 2, '#ffc21a');
  p.rr(18.8, 41.4, 10.4, 5, 1.4, '#9a5410');
  p.star(24, 43.9, 3.2, 1.4, 5, '#ffe46a');
};

// --------------------------------------------------------------------------- frame rendering + cache

const STRIP = { goo: 6, laser: 6, holo: 6, flame: 4, cosmic: 6 };
const STRIP_DUR = { goo: 1.5, laser: 1.2, holo: 1.8, flame: 0.6, cosmic: 2.4 };
const frameFn = (def) => (def.card ? FR.mastery : FR[def.id] ?? FR.basic);
const MAXQ = 6;
const frameCache = new Map();
function paintFrame(def, q, ph = 0) {
  const p = new PixCanvas(GRID, 1, q);
  frameFn(def)(new Shifted(p, PAD), ph, def);
  const url = renderPixArt(p, { glints: 2 });
  return { url, canvas: renderPixArt.last };
}
/** PNG data URL of a frame at scale q (static: phase 0). */
function frameURL(id, q) {
  const key = id + '|' + q;
  let u = frameCache.get(key);
  if (!u) { u = paintFrame(FRAMES[id] ?? FRAMES[DEFAULT_FRAME], q).url; frameCache.set(key, u); }
  return u;
}
/** Sprite strip (all phases side by side) for an animated frame. */
function stripURL(id, q) {
  const key = id + '|s|' + q;
  let u = frameCache.get(key);
  if (u) return u;
  const def = FRAMES[id], n = STRIP[def?.anim];
  if (!n) return null;
  let c = null;
  for (let k = 0; k < n; k++) {
    const { canvas } = paintFrame(def, q, k);
    if (!c) { c = document.createElement('canvas'); c.width = canvas.width * n; c.height = canvas.height; }
    c.getContext('2d').drawImage(canvas, k * canvas.width, 0);
  }
  u = c.toDataURL();
  frameCache.set(key, u);
  return u;
}

// --------------------------------------------------------------------------- Beast Lab icon pictures (32 grid)

const ICON = {};
ICON.flask = (p) => {
  p.rect(13, 3, 6, 2, '#cfeeff');
  p.rect(13.5, 5, 5, 8, '#cfeeff');
  p.circ(16, 20, 9.5, '#cfeeff');
  p.each((x, y) => ((x - 16) ** 2 + (y - 20) ** 2 <= 8 * 8 && y > 17 + Math.sin(x * 1.1) * 0.8 ? '#4cd24a' : undefined), false, [7, 12, 25, 29]);
  p.rect(14.5, 6, 1.4, 6, '#ffffff');
  for (const [x, y, r] of [[13, 23, 1.4], [18.5, 21, 1], [17, 26, 0.9]]) p.circ(x, y, r, '#a8f07a');
  p.rect(12, 2, 8, 1.6, '#8a96b8');
};
ICON.goggles = (p) => {
  p.rect(1, 13, 30, 4, '#3a4256');
  for (const x of [9.5, 22.5]) { p.rr(x - 7, 8, 14, 13, 4, '#ffc21a'); p.rr(x - 5.4, 9.6, 10.8, 9.8, 3, '#5af0c8'); p.rect(x - 3.8, 11, 2.4, 2.4, '#e6fffa'); }
  p.rect(15, 12, 2, 3, '#ffc21a');
};
ICON.barrel = (p) => {
  p.rr(7, 6, 18, 23, 3, '#ffc21a');
  for (const y of [11, 23]) p.rect(6.4, y, 19.2, 2.2, '#9a5410');
  p.poly([[16, 13.6], [20.2, 20.6], [11.8, 20.6]], '#1c1a28');
  p.poly([[16, 15.6], [18.4, 19.6], [13.6, 19.6]], '#ffc21a');
  p.ell(16, 6.4, 9, 2.6, '#7cff3a');
  p.rect(10, 6, 2.4, 7, '#7cff3a'); p.circ(11.2, 13, 1.3, '#7cff3a');
  p.rect(20, 6, 1.8, 4.4, '#7cff3a'); p.circ(20.9, 10.4, 1, '#7cff3a');
};
ICON.brain = (p) => {
  p.rr(5, 4, 22, 25, 4, '#cfeeff');
  p.rect(4, 3, 24, 3, '#8a96b8');
  p.each((x, y) => (((x - 16) / 8.6) ** 2 + ((y - 17) / 7) ** 2 <= 1 ? '#ff8ac4' : undefined), false, [7, 9, 25, 25]);
  for (const [x0, y0, x1, y1] of [[11, 14, 14, 17], [16, 11, 16, 21], [19, 15, 22, 13], [12, 19, 15, 21], [18, 20, 21, 19]]) p.line(x0, y0, x1, y1, '#b8125e', 0, true);
  p.line(9, 9, 6, 1, '#ffc21a', 0.2); p.line(23, 9, 26, 1, '#ffc21a', 0.2);
  p.rect(5.6, 24, 20.8, 4, '#7ae8ff');
};
ICON.skull = (p) => {
  p.rr(6, 4, 20, 18, 7, '#f2ead8');
  p.rr(10, 19, 12, 8, 2, '#f2ead8');
  p.rr(9, 11, 5.4, 5.4, 2, '#3a1a5a'); p.rr(17.6, 11, 5.4, 5.4, 2, '#3a1a5a');
  p.poly([[16, 17], [17.6, 20], [14.4, 20]], '#3a1a5a');
  for (let i = 0; i < 4; i++) p.rect(11.4 + i * 2.6, 23, 1, 3.4, '#b8b0a0');
  p.dot(11, 12, '#ff2e88'); p.dot(19, 12, '#ff2e88');
  p.poly([[3, 3], [8, 7], [6, 9]], '#ffc21a'); p.poly([[29, 3], [24, 7], [26, 9]], '#ffc21a');
};
ICON.mustache = (p) => {
  // the peel-off sticker card it came on
  p.rr(3, 6, 26, 21, 2, '#eef4ff');
  p.poly([[23, 27], [29, 21], [29, 27]], '#b4bfd8');
  p.rect(6, 23, 9, 1.2, '#8fd4ff'); p.rect(6, 9, 6, 1.2, '#ff8ac4');
  // handlebar mustache: two lobes, curled tips
  p.ell(11.2, 16.6, 6.2, 3.4, '#a0602e');
  p.ell(20.8, 16.6, 6.2, 3.4, '#a0602e');
  p.poly([[6.4, 18], [3.4, 12.6], [5.2, 11.6], [8.8, 15.4]], '#a0602e');
  p.poly([[25.6, 18], [28.6, 12.6], [26.8, 11.6], [23.2, 15.4]], '#a0602e');
  p.circ(4.6, 12, 1.5, '#653818'); p.circ(27.4, 12, 1.5, '#653818');
  p.rect(15.4, 14.4, 1.2, 3.6, '#653818');
};
ICON.choco = (p) => {
  p.rr(5, 5, 22, 23, 2, '#6a3a1e');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.rr(7 + j * 9.8, 7 + i * 6.8, 8.4, 5.6, 1, '#8a4e2a');
  p.each((x, y) => ((x - 27) ** 2 + (y - 7) ** 2 < 25 || (x - 23.6) ** 2 + (y - 4.4) ** 2 < 9 ? null : undefined), false, [18, 0, 32, 14]);
  p.poly([[4, 18], [28, 18], [28, 29], [4, 29]], '#ff4fa3');
  p.poly([[4, 18], [7, 16.4], [10, 18.2], [13, 16.2], [16, 18.2], [19, 16.4], [22, 18.2], [25, 16.4], [28, 18]], '#ff4fa3');
  p.rect(8, 21.6, 16, 3.4, '#ffffff');
  p.rect(10, 22.4, 12, 1.6, '#29b6f6');
};
ICON.duck = (p) => {
  p.ell(16, 22, 11, 7, '#ffd23f');
  p.circ(14, 11, 7, '#ffd23f');
  p.ell(25.4, 18, 4, 2.6, '#ffd23f');
  // gas mask
  p.rr(9.2, 10, 10, 8, 3, '#3a4256');
  p.circ(11.6, 12.6, 1.8, '#5af0c8'); p.circ(16.6, 12.6, 1.8, '#5af0c8');
  p.rr(11.4, 16, 6, 5.4, 2, '#5a6690');
  for (let i = 0; i < 3; i++) p.rect(12.4 + i * 1.6, 17.2, 0.8, 3, '#1c1a28');
  p.rect(6.6, 9.6, 2.6, 2, '#3a4256'); p.rect(19.2, 9.6, 3, 2, '#3a4256');
  p.ell(18, 23, 5, 3, '#ffc21a');
};
ICON.ticket = (p) => {
  p.poly([[2, 9], [30, 4], [30, 23], [2, 28]], '#ffc21a');
  p.each((x, y) => ((x - 2) ** 2 + (y - 18.5) ** 2 < 6 || (x - 30) ** 2 + (y - 13.5) ** 2 < 6 ? null : undefined), false, [0, 14, 32, 22]);
  p.poly([[6, 11], [26, 7.4], [26, 20.4], [6, 24]], '#fff6c8');
  p.star(16, 15.8, 5, 2.2, 5, '#ff4fa3');
  for (let i = 0; i < 4; i++) p.dot(8 + i * 5, 25.4 - i * 0.9, '#d8861a');
};
ICON.case = (p) => {
  p.rr(11, 4, 10, 5, 2, '#1c1a28'); p.rr(13, 5.6, 6, 3, 1, null);
  p.each((x, y) => (x > 13 && x < 19 && y > 5.8 && y < 8.4 ? null : undefined), false, [12, 5, 20, 9]);
  for (let i = 0; i < 4; i++) p.rect(6 + i * 5.4, 6.6 - (i % 2) * 1.6, 4.6, 6, '#4cd24a');
  p.rr(3, 10, 26, 18, 2.6, '#3a4256');
  p.rect(3, 17.4, 26, 2.2, '#26304a');
  p.rr(13.4, 15.6, 5.2, 5.6, 1, '#ffc21a');
  p.rect(15.4, 17.6, 1.2, 1.8, '#9a5410');
  p.rect(6, 7, 3.2, 1.2, '#a8f07a');
};

const iconCache = new Map();
/** Shaded pixel-art canvas for a Beast Lab picture at HD factor q. */
function labIconCanvas(art, q) {
  const key = art + '|' + q;
  let c = iconCache.get(key);
  if (c) return c;
  const p = new PixCanvas(32, 1, q);
  (ICON[art] ?? ICON.flask)(p);
  renderPixArt(p, { glints: 2 });
  c = renderPixArt.last;
  iconCache.set(key, c);
  return c;
}

// --------------------------------------------------------------------------- pictures

const loadImg = (src) => new Promise((res) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => res(null);
  im.src = src;
});
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const plateCache = new Map();
/** Backdrop plate: 24x24 pixel art (dithered two-tone + light rays from below), as a canvas. */
function plateCanvas(c0, c1) {
  const key = c0 + c1;
  if (plateCache.has(key)) return plateCache.get(key);
  const S = 24, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const A = rgb(shade(c0, 0.08)), B = rgb(shade(c1, -0.1)), R = rgb(shade(c0, 0.4));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = y / (S - 1) * 0.9 + Math.abs(x - S / 2) / S * 0.25;
    const pick = t + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.28 > 0.55 ? B : A;
    // light rays fanning from below the portrait
    const ang = Math.atan2(x - S / 2 + 0.5, S * 0.95 - y);
    const ray = Math.floor((ang + 1.6) / 0.27) % 2 === 0 && y < S * 0.86;
    const k = (y * S + x) * 4;
    const col = ray ? [pick[0] + (R[0] - pick[0]) * 0.22, pick[1] + (R[1] - pick[1]) * 0.22, pick[2] + (R[2] - pick[2]) * 0.22] : pick;
    img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  plateCache.set(key, c);
  return c;
}
/** Square 3D troop portrait (bust framing), PNG data URL. */
const troopCache = new Map();
function troopPortrait(id, size) {
  const key = id + '|' + size;
  if (troopCache.has(key)) return troopCache.get(key);
  const rig = createSwarm(id, {});
  rig.setState('idle');
  for (let i = 0; i < 6; i++) rig.update(0.016);
  const url = engine.renderThumb(rig.root, { size, yaw: 0.55, pitch: 0.14, zoom: 0.9, lift: 0.02 });
  troopCache.set(key, url);
  return url;
}
/** Head-and-shoulders chibi portrait framed for a square avatar (the whole head, hat included). */
const headCache = new Map();
function headPortrait(charId, override, size) {
  const key = `${charId}|${size}|${JSON.stringify(override)}`;
  if (headCache.has(key)) return headCache.get(key);
  const c = new Chibi({ ...CHARACTERS[charId], ...(override ?? {}) }, { fidget: false });
  c.expr('normal', 'smile');
  c.face.blinkT = 99;
  c.face.autoLook = false;
  c.snap();
  c.face.redraw();
  const url = engine.renderThumb(c.root, { size, yaw: -0.3, pitch: 0.08, zoom: 0.72, focusHead: true, lift: -0.04 });
  headCache.set(key, url);
  return url;
}
function cmdOverride(skinId) {
  const s = CMD_SKINS[skinId];
  if (!s) return null;
  const { name, commander, ...rest } = s;
  return rest;
}
/** Picture size buckets (px of the composited PNG). */
const PIC_PX = [64, 160];
/** Composite a picture: plate + portrait, clipped to the stepped window. Resolves to a data URL. */
async function composePicture(id, px) {
  const a = AVATARS[id] ?? AVATARS[DEFAULT_AVATAR];
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(plateCanvas(a.plate?.[0] ?? '#2b8cf2', a.plate?.[1] ?? '#122a7a'), 0, 0, px, px);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  if (a.kind === 'lab') {
    const q = px >= 120 ? 4 : 2;
    const ic = labIconCanvas(a.art, q);
    const s = Math.round(px * 1.12), o = Math.round((px - s) / 2);
    g.imageSmoothingEnabled = s < ic.width;
    g.drawImage(ic, o, o + Math.round(px * 0.02), s, s);
  } else {
    let url = null;
    try {
      if (a.kind === 'troop') url = troopPortrait(a.card, Math.round(px * 1.1));
      else if (a.full) url = charPortrait(a.char, { size: Math.round(px * 1.1), full: true, yaw: -0.45 });
      else url = headPortrait(a.char, a.skin ? cmdOverride(a.skin) : null, Math.round(px * 1.1));
    } catch (e) { console.warn('avatar portrait', id, e); }
    const im = url ? await loadImg(url) : null;
    if (im) {
      // troops: whole head + upper body; people: head and shoulders, shoulders cut by the frame
      const s = px * 1.04;
      g.drawImage(im, (px - s) / 2, (px - s) / 2 + px * 0.03, s, s);
    }
  }
  // stepped corner window (matches the frames' window) + a 1px inner shade on the lower edges
  const ch = Math.max(1, Math.round((CHW / (W1 - W0)) * px));
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < ch; i++) {
    const w = ch - i;
    g.fillRect(0, i, w, 1); g.fillRect(px - w, i, w, 1);
    g.fillRect(0, px - 1 - i, w, 1); g.fillRect(px - w, px - 1 - i, w, 1);
  }
  g.globalCompositeOperation = 'source-over';
  return c.toDataURL('image/png');
}
const picKey = (id, px) => `pav|${id}|${px}`;
/** <img> of a picture at a size bucket (lazy: rendered on the thumb queue, cached). */
function picImg(id, px, cls = '', lazy = false) {
  return lazyImg(picKey(id, px), () => composePicture(id, px), 'pav-img ' + cls, lazy ? { visible: true } : { priority: true });
}

// --------------------------------------------------------------------------- the element

const needQ = (el) => {
  const w = el.offsetWidth;
  if (!(w > 0)) return 0;
  return Math.max(1, Math.min(MAXQ, Math.ceil((w * (AV_GEOM.frameSize / 100) * (window.devicePixelRatio || 1)) / (GRID + 2 * M))));
};
const needPx = (el) => {
  const w = el.offsetWidth * (AV_GEOM.picSize / 100) * (window.devicePixelRatio || 1);
  if (!(w > 0)) return 0; // hidden (display: none): no size yet, keep the small picture
  return w <= 72 ? PIC_PX[0] : PIC_PX[1];
};
// frames are painted inside a small time budget per frame; the rest waits for idle time
let spent = 0, spentAt = 0;
const BUDGET = 10;
const backlog = new Set();
let pumping = false;
function later() {
  if (pumping) return;
  pumping = true;
  const run = () => {
    pumping = false;
    const t0 = performance.now();
    for (const el of [...backlog]) {
      if (performance.now() - t0 >= BUDGET) break;
      backlog.delete(el);
      if (el.isConnected) paint(el, true);
    }
    if (backlog.size) later();
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 300 });
  else setTimeout(run, 60);
}
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function paint(el, late = false) {
  const st = el._av;
  if (!st.q) return;
  const now = performance.now();
  if (now - spentAt > 16) { spent = 0; spentAt = now; }
  const def = FRAMES[st.frame] ?? FRAMES[DEFAULT_FRAME];
  // static frame (also the base layer under a strip until the strip exists)
  let url = frameCache.get(def.id + '|' + st.q);
  if (!url) {
    if (late || spent < BUDGET) { const t = performance.now(); url = frameURL(def.id, st.q); spent += performance.now() - t; }
    else {
      // over this frame's budget: show a smaller cached version if there is one, paint the rest in idle time
      for (let q = MAXQ; q >= 1 && !url; q--) url = frameCache.get(def.id + '|' + q);
      backlog.add(el); later();
    }
  }
  if (!url) return;
  if (st.frm.getAttribute('src') !== url) st.frm.src = url;
  el.style.setProperty('--pav-img', `url("${url}")`);
  // the picture waits for its frame: both appear together (never a bare picture, then a frame popping on)
  if (!el.classList.contains('pav-on')) {
    const on = () => el.classList.add('pav-on');
    if (st.frm.complete && st.frm.naturalWidth) on();
    else st.frm.addEventListener('load', on, { once: true });
  }
  // animated strip
  const n = STRIP[def.anim];
  if (n && st.anim && !reduced()) {
    const sk = def.id + '|s|' + st.q;
    let su = frameCache.get(sk);
    if (!su && late) su = stripURL(def.id, st.q);
    if (su) {
      if (!st.strip) { st.strip = h('img', { class: 'pav-stripimg', alt: '', draggable: 'false' }); st.stripBox = h('span', { class: 'pav-strip' }, st.strip); el.insertBefore(st.stripBox, st.frm.nextSibling); }
      st.strip.style.setProperty('--n', n);
      st.stripBox.style.setProperty('--pav-sd', STRIP_DUR[def.anim] + 's');
      if (st.strip.getAttribute('src') !== su) st.strip.src = su;
      el.classList.add('pav-strip-on');
      snapStrip(el);
    } else { backlog.add(el); later(); }
  }
}
/** The sprite strip steps by its box width: keep that a whole number of pixels (centred on the
 * avatar), so every phase lands on the same sub-pixel offset and the animation never shimmers. */
function snapStrip(el) {
  const box = el._av?.stripBox;
  if (!box) return;
  const b = el.getBoundingClientRect().width;
  if (!(b > 0)) return;
  const W = Math.max(1, Math.round(b * (AV_GEOM.frameSize / 100)));
  const o = ((b - W) / 2).toFixed(2) + 'px';
  Object.assign(box.style, { width: W + 'px', height: W + 'px', left: o, top: o });
}
let ro = null;
function watch(el) {
  if (typeof ResizeObserver === 'undefined') { el._av.q = 2; paint(el); return; }
  ro ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const el2 = e.target, st = el2._av;
      // removed from the page (it reports a 0 x 0 box): stop watching it so it can be collected
      if (!st || !el2.isConnected) { ro.unobserve(el2); backlog.delete(el2); continue; }
      const q = needQ(el2);
      if (q > st.q) { st.q = q; paint(el2); }
      snapStrip(el2);
      const px = needPx(el2);
      if (px > st.px) { st.px = px; setPic(el2); }
    }
  });
  ro.observe(el);
}
function setPic(el) {
  const st = el._av;
  const px = st.px || PIC_PX[0];
  const img = picImg(st.avatar, px, '', st.lazy);
  img.classList.add('pav-pic');
  // keep the old picture until the new one has loaded (no blank flash on a size upgrade)
  const old = st.pic;
  if (old && old.parentNode) {
    if (img.classList.contains('loaded')) old.replaceWith(img);
    else {
      el.insertBefore(img, old.nextSibling);
      const swap = () => { if (img.classList.contains('loaded')) { old.remove(); return true; } return false; };
      const iv = setInterval(() => { if (swap() || !img.isConnected) clearInterval(iv); }, 120);
    }
  } else el.insertBefore(img, el.firstChild);
  st.pic = img;
  // the avatar shows once its picture is drawn too (lazy grid tiles show a blinking plate instead);
  // a picture that takes longer than ~4 s shows its plate rather than keep the avatar hidden
  if (!st.lazy && !el.classList.contains('pav-pic-ok')) {
    let n = 0;
    const ok = () => (img.classList.contains('loaded') || ++n > 40 ? (el.classList.add('pav-pic-ok'), true) : false);
    if (!ok()) { const iv = setInterval(() => { if (ok()) clearInterval(iv); }, 100); }
  }
}

/**
 * Avatar element: picture + frame. Size it with --av (CSS) or opts.size (px or any CSS length).
 * opts: { cls, anim (default true: animated frames move), size, lazy (render the picture once scrolled near the view) }
 */
export function avatarEl(avatarId, frameId, opts = {}) {
  const frm = h('img', { class: 'pav-frm', alt: '', draggable: 'false' });
  const el = h('span', { class: `pav ${opts.lazy ? 'pav-lazy ' : ''}${opts.cls ?? ''}`.trim(), role: 'img' }, frm);
  if (opts.size) el.style.setProperty('--av', typeof opts.size === 'number' ? opts.size + 'px' : opts.size);
  el._av = { avatar: null, frame: null, q: 0, px: 0, frm, pic: null, strip: null, stripBox: null, anim: opts.anim !== false, lazy: !!opts.lazy };
  setAvatar(el, avatarId, frameId);
  watch(el);
  return el;
}
/** Point an avatar element at a new picture / frame. */
export function setAvatar(el, avatarId, frameId) {
  const st = el?._av;
  if (!st) return;
  const a = AVATARS[avatarId] ? avatarId : DEFAULT_AVATAR;
  const f = FRAMES[frameId] ? frameId : DEFAULT_FRAME;
  const fd = FRAMES[f];
  el.setAttribute('aria-label', `${AVATARS[a].name}, ${fd.name}`);
  el.classList.remove('pav-a-shine', 'pav-a-goo', 'pav-a-laser', 'pav-a-holo', 'pav-a-flame', 'pav-a-cosmic', 'pav-strip-on');
  if (fd.anim && st.anim) el.classList.add('pav-a-' + fd.anim);
  if (fd.anim === 'shine') el.style.setProperty('--pav-d', -(Math.random() * 5).toFixed(2) + 's');
  if (st.avatar !== a) { st.avatar = a; if (!st.px) st.px = PIC_PX[0]; setPic(el); }
  if (st.frame !== f) {
    st.frame = f;
    if (st.stripBox) { st.stripBox.remove(); st.strip = st.stripBox = null; }
    if (st.q) paint(el);
  }
  if (el.isConnected && !st.q) {
    const q = needQ(el);
    if (q) { st.q = q; paint(el); }
  }
}

/** The player's own look. */
export const myLook = () => {
  const c = state.p.cosmetics ?? {};
  return { avatar: c.avatar ?? DEFAULT_AVATAR, frame: c.frame ?? DEFAULT_FRAME, title: c.title ?? null };
};
const mine = new Set();
/** Your own avatar (it follows equips: call refreshMine() or it updates on the next state change). */
export function myAvatarEl(opts = {}) {
  const l = myLook();
  const el = avatarEl(l.avatar, l.frame, opts);
  mine.add(el);
  return el;
}
export function refreshMine() {
  const l = myLook();
  for (const el of mine) {
    if (!el.isConnected) { mine.delete(el); continue; }
    if (el._av.avatar !== l.avatar || el._av.frame !== l.frame) setAvatar(el, l.avatar, l.frame);
  }
}
state.on((what) => { if (!what || what === 'profile' || what === 'reward' || what === 'mastery') refreshMine(); });

/** A side config's look ({ avatar, frame } on battle side configs; ghosts get theirs from profileItems.ghostLook). */
export function sideAvatarEl(side, opts = {}) {
  return avatarEl(side?.avatar ?? DEFAULT_AVATAR, side?.frame ?? DEFAULT_FRAME, opts);
}
/** Title display name (or ''). */
export const titleName = (id) => TITLES[id]?.name ?? '';

/** A frame on its own over an empty glass window (frame picker tiles). */
export function framePreviewEl(frameId, opts = {}) {
  const el = avatarEl('lab_flask', frameId, opts);
  el.classList.add('pav-empty');
  return el;
}
/** Warm the cache for a few looks (the battle's two players) so the VS intro, the entrance title
 * card and the HUD plates show them already drawn: frames at the common scales + both picture sizes. */
export function prewarmLooks(looks = []) {
  for (const l of looks) {
    if (!l) continue;
    const f = FRAMES[l.frame] ?? FRAMES[DEFAULT_FRAME];
    for (const q of [2, 3]) if (!frameCache.has(f.id + '|' + q)) { try { frameURL(f.id, q); } catch (e) { /* drawn on demand */ } }
    const a = AVATARS[l.avatar] ? l.avatar : DEFAULT_AVATAR;
    // force: the job runs even though this <img> is never attached; later avatarEl()s hit the cache
    for (const px of PIC_PX) lazyImg(picKey(a, px), () => composePicture(a, px), 'pav-img', { priority: true, force: true });
  }
}
/** Stable seed helper for rivals without one. */
export const lookSeed = (name) => hashString(String(name ?? 'rival'));
