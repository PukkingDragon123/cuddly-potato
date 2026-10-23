// Entrance animation art (NEW CARD cutscene cosmetics): a little pixel-art movie
// poster per entrance, drawn on tiny canvases (no CSS circles / gradients-as-shapes):
// a dithered night backdrop with pixel spotlight rays, a stage floor, the move's own
// pixel FX layer (cracks, smoke clouds, red carpet + camera flashes, rocket trail,
// glitch bars) and the entrance's pixel icon looping its move on top.
// Used by the shop, the pass and reward popups (common.js rewardArt).
import './entranceArt.css';
import { h, icon } from './ui.js';
import { entranceDef } from '../data/entrances.js';

const W = 48, H = 36;
const cache = new Map();

const hexRgb = (hx) => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

function draw(id, layer) {
  const key = id + ':' + layer;
  if (cache.has(key)) return cache.get(key);
  const e = entranceDef(id);
  const ec = hexRgb(e.color);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = typeof col === 'string' ? col : css(col); g.fillRect(x | 0, y | 0, 1, 1); };
  const rect = (x, y, w, hh, col) => { g.fillStyle = typeof col === 'string' ? col : css(col); g.fillRect(x | 0, y | 0, w | 0, hh | 0); };
  const FY = 27; // floor line
  if (layer === 'base') {
    // dithered backdrop bands: deep navy -> entrance colour glow at the floor
    const top = [13, 16, 51], mid = [27, 20, 80], low = mix([27, 20, 80], ec, 0.55);
    for (let y = 0; y < FY; y++) {
      const k = y / FY;
      const a = k < 0.6 ? mix(top, mid, k / 0.6) : mix(mid, low, (k - 0.6) / 0.4);
      const b = k < 0.6 ? mix(top, mid, Math.min(1, k / 0.6 + 0.12)) : mix(mid, low, Math.min(1, (k - 0.6) / 0.4 + 0.15));
      for (let x = 0; x < W; x++) px(x, y, (x + y) & 1 ? a : b);
    }
    // pixel spotlight rays fanning up from the stage
    const ray = mix(ec, [255, 255, 255], 0.35);
    for (let r = 0; r < 7; r++) {
      const ang = -Math.PI / 2 + (r - 3) * 0.32;
      for (let t = 4; t < 30; t++) {
        const x = Math.round(W / 2 + Math.cos(ang) * t), y = Math.round(FY - 2 + Math.sin(ang) * t);
        if (y < 0 || x < 0 || x >= W) continue;
        if ((t + r) % 3 === 0) continue; // dashed
        g.globalAlpha = 0.16 + (1 - t / 30) * 0.3;
        px(x, y, ray);
      }
    }
    g.globalAlpha = 1;
    // stars
    for (let i = 0; i < 9; i++) px((i * 17 + 5) % W, (i * 7 + 2) % 12, i % 3 ? '#8fa0e8' : '#ffffff');
    // the stage floor: chequer + a bright lip
    for (let y = FY; y < H; y++) for (let x = 0; x < W; x++) px(x, y, ((x >> 1) + (y >> 1)) & 1 ? '#1a1f3c' : '#232a52');
    rect(0, FY, W, 1, mix(ec, [255, 255, 255], 0.5));
    rect(0, FY + 1, W, 1, mix(ec, [0, 0, 0], 0.3));
    // entrance-specific set dressing (static)
    if (id === 'redCarpet') {
      for (let y = FY + 1; y < H; y++) {
        const half = 4 + (y - FY) * 1.6;
        for (let x = Math.round(W / 2 - half); x <= Math.round(W / 2 + half); x++) {
          const edge = x <= Math.round(W / 2 - half) + 1 || x >= Math.round(W / 2 + half) - 1;
          px(x, y, edge ? '#ffd23f' : (x + y) % 5 === 0 ? '#a00e24' : '#d8243a');
        }
      }
      for (const x of [9, 38]) { rect(x, FY - 6, 2, 7, '#ffd23f'); rect(x - 1, FY - 7, 4, 1, '#fff2a0'); }
      for (let x = 11; x < 38; x++) if (x < 18 || x > 29) px(x, FY - 5 + Math.round(Math.sin(((x < 18 ? x - 11 : x - 30) / 7) * Math.PI) * 2), '#8a0a2e');
    } else if (id === 'heroLanding') {
      const cr = '#05060f';
      for (const [dx, dy] of [[-1, 0], [-2, 1], [-4, 1], [-5, 2], [-7, 2], [1, 0], [3, 1], [4, 1], [6, 2], [8, 3], [0, 1], [-1, 2], [1, 3], [2, 4]]) px(W / 2 + dx, FY + 1 + dy, cr);
      for (const [dx, dy] of [[-9, -3], [8, -4], [-6, -6], [11, -2], [-12, -1]]) rect(W / 2 + dx, FY + dy, 2, 2, '#8e9ab8');
    } else if (id === 'labExplosion') {
      const cl = (cx, cy, r, col) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.abs(x) + Math.abs(y) <= r + ((x * y) & 1)) px(cx + x, cy + y, col); };
      cl(12, FY - 3, 4, '#2a6a2a'); cl(36, FY - 4, 4, '#2a6a2a'); cl(16, FY - 6, 3, '#4fbf3a'); cl(32, FY - 7, 3, '#4fbf3a'); cl(24, FY - 10, 3, '#3a8a34');
      for (const [x, y] of [[8, 10], [40, 8], [18, 4], [30, 3], [6, 18], [42, 16]]) { px(x, y, '#9dff6a'); px(x + 1, y, '#eaffd0'); }
    } else if (id === 'rocketDrop') {
      for (let t = 0; t < 14; t++) {
        const x = 4 + t * 1.4, y = 2 + t * 1.3;
        rect(x, y, 2 + (t >> 2), 2 + (t >> 2), t % 2 ? '#9aa0aa' : '#b8bec8');
      }
      for (const [x, y, col] of [[17, 18, '#ffe14a'], [19, 20, '#ffa31a'], [16, 21, '#ff5a1f'], [21, 18, '#ffa31a']]) rect(x, y, 2, 2, col);
    } else if (id === 'glitchTeleport') {
      for (let y = 0; y < FY; y += 3) rect(W / 2 - 7, y, 14, 1, 'rgba(63,242,224,0.45)');
      rect(W / 2 - 8, 0, 1, FY, '#3ff2e0');
      rect(W / 2 + 7, 0, 1, FY, '#3ff2e0');
    } else {
      // classic strut: footprints across the stage
      for (let i = 0; i < 5; i++) { rect(4 + i * 4, FY + 3 + (i & 1) * 2, 2, 1, '#5c6a9c'); }
    }
  } else {
    // FX layer (blinks / scrolls on top)
    if (id === 'redCarpet') {
      const star = (x, y) => { px(x, y, '#ffffff'); px(x - 1, y, '#fff2c8'); px(x + 1, y, '#fff2c8'); px(x, y - 1, '#fff2c8'); px(x, y + 1, '#fff2c8'); px(x - 2, y, 'rgba(255,255,255,0.5)'); px(x + 2, y, 'rgba(255,255,255,0.5)'); };
      star(5, 12); star(42, 9); star(39, 20); star(8, 21);
    } else if (id === 'heroLanding') {
      for (const [dx, dy] of [[-8, 0], [-5, -1], [-3, 0], [3, 0], [5, -1], [8, 0], [-10, 1], [10, 1]]) rect(W / 2 + dx, FY + dy - 1, 2, 1, '#dfe6f4');
    } else if (id === 'labExplosion') {
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
        const d = Math.abs(x) + Math.abs(y);
        if (d <= 6) px(W / 2 + x, FY - 8 + y, d < 2 ? '#ffffff' : d < 4 ? '#eaffd0' : '#9dff6a');
      }
    } else if (id === 'rocketDrop') {
      for (let y = -4; y <= 4; y++) for (let x = -7; x <= 7; x++) if (Math.abs(x) / 7 + Math.abs(y) / 4 <= 1) px(W / 2 + x, FY - 2 + y, Math.abs(x) < 3 && Math.abs(y) < 2 ? '#fff2a0' : (x + y) & 1 ? '#ffa31a' : '#ff5a1f');
    } else if (id === 'glitchTeleport') {
      for (const [y, x, w, col] of [[6, 10, 14, '#ff2e88'], [11, 26, 12, '#3ff2e0'], [17, 6, 9, '#ffffff'], [22, 30, 10, '#ff2e88']]) rect(x, y, w, 1, col);
    } else {
      for (const [x, y] of [[10, 8], [38, 6], [30, 14], [14, 16]]) { px(x, y, '#ffffff'); px(x + 1, y + 1, '#8fd4ff'); }
    }
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function entranceArt(id, cls = '') {
  const e = entranceDef(id);
  const img = (layer, c) => h('img', { class: c, src: draw(e.id, layer), draggable: 'false', alt: '' });
  return h('div', { class: `ent-art ent-${e.id} ${cls}`, style: { '--ec': e.color } },
    img('base', 'ent-bg'),
    img('fx', 'ent-fx'),
    h('div', { class: 'ent-hero' }, icon(e.icon ?? 'star', 'ent-ic')),
    h('div', { class: 'ent-clap' }));
}
