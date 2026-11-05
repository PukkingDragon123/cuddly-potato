// Battle ENTRANCE art (data/entrances.js): a little pixel-art movie poster per entrance, drawn on tiny canvases (no CSS circles / gradients-as-shapes):
// a dithered night backdrop with pixel spotlight rays, a stage floor, the move's own
// pixel FX layer (cracks, smoke clouds, red carpet + camera flashes, rocket trail,
// glitch bars, brick wall, rope, city lights, bunting...) and the entrance's hero (a pixel
// sprite: the box, the board, the chopper, the limo, the jetpack, or its icon) looping its move.
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
    } else if (id === 'boxSneak') {
      // a searchlight sweeping the yard
      for (let y = 0; y < FY; y++) { const x0 = 30 - y * 0.6; for (let x = Math.round(x0); x < x0 + 6 + y * 0.35; x++) if ((x + y) & 1) { g.globalAlpha = 0.28; px(x, y, '#fff2a0'); } }
      g.globalAlpha = 1;
      for (let i = 0; i < 4; i++) rect(5 + i * 3, FY + 2 + (i & 1), 2, 1, '#5c6a9c');
    } else if (id === 'skateKickflip') {
      // a quarter pipe on the right + speed lines
      for (let y = 0; y < 12; y++) { const w = Math.round(12 - Math.sqrt(144 - (12 - y) * (12 - y))); rect(W - 2 - w - 2, FY - 12 + y, w + 2, 1, y === 0 ? '#ffd23f' : (y & 1 ? '#3a4a8a' : '#2e3c76')); }
      rect(W - 2, FY - 13, 2, 13, '#c8ccd8');
      for (const [x, y, w] of [[3, 14, 8], [6, 18, 10], [2, 22, 7]]) rect(x, y, w, 1, '#8fa0e8');
    } else if (id === 'wallBurst') {
      // a brick wall with a hole punched through it
      for (let y = 6; y < FY; y++) for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / 9, dy = (y - 17) / 8;
        if (Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) / 1.3) + ((x * 7 + y * 3) % 5) * 0.04 < 1) { px(x, y, '#120c18'); continue; }
        const row = y >> 2, off = row & 1 ? 3 : 0;
        px(x, y, y % 4 === 0 || (x + off) % 7 === 0 ? '#d8cbb8' : ['#c8603e', '#b8553a', '#a84a32'][(Math.floor((x + off) / 7) + row) % 3]);
      }
      for (const [x, y] of [[8, 25], [37, 24], [14, 26], [31, 26]]) rect(x, y, 3, 2, '#b8553a');
    } else if (id === 'heliDrop') {
      // rope from the top + downwash lines on the floor
      for (let y = 9; y < FY - 1; y++) px(W / 2 + 4, y, y & 1 ? '#d8b880' : '#a07a4a');
      for (const [x, w] of [[4, 6], [12, 5], [31, 5], [38, 6]]) rect(x, FY + 2, w, 1, '#8fa0e8');
    } else if (id === 'jetpack') {
      // pixel clouds
      for (const [cx, cy, w] of [[6, 8, 10], [30, 5, 12], [36, 15, 8]]) { rect(cx, cy, w, 2, '#3a3a8a'); rect(cx + 2, cy - 1, w - 4, 1, '#4a4aa0'); }
      for (let i = 0; i < 5; i++) rect(14 + i * 4, FY + 2 + (i & 1), 2, 1, '#5c6a9c');
    } else if (id === 'limo') {
      // night city: lit windows behind the stage
      for (const [x, w, hh] of [[0, 8, 14], [9, 6, 18], [16, 9, 12], [27, 7, 16], [35, 13, 13]]) {
        rect(x, FY - hh, w, hh, '#141838');
        for (let y = FY - hh + 2; y < FY - 1; y += 3) for (let xx = x + 1; xx < x + w - 1; xx += 2) if ((xx * 3 + y) % 5 !== 0) px(xx, y, (xx + y) % 3 ? '#ffd27a' : '#6a5a3a');
      }
      for (let x = 4; x < W - 4; x++) px(x, FY + 3, '#d8243a');
    } else if (id === 'moneyRain') {
      // cash piles on the floor
      for (const [x, n] of [[5, 3], [36, 4], [13, 2], [29, 2]]) for (let i = 0; i < n; i++) { rect(x, FY - 1 - i, 6, 1, i & 1 ? '#8fe07a' : '#4fb04a'); px(x + 3, FY - 1 - i, '#ffffff'); }
    } else if (id === 'hypeParade') {
      // bunting across the top
      const cols = ['#ff4fa3', '#ffd23f', '#29b6f6', '#5fdc4a'];
      for (let x = 0; x < W; x++) px(x, 6 + Math.round(Math.sin((x / W) * Math.PI) * 3), '#c8ccd8');
      for (let k = 0; k < 8; k++) { const x0 = 2 + k * 6, y0 = 7 + Math.round(Math.sin(((x0 + 2) / W) * Math.PI) * 3); for (let r = 0; r < 4; r++) rect(x0 + r * 0.5, y0 + r, 4 - r, 1, cols[k % 4]); }
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
    } else if (id === 'boxSneak') {
      rect(W / 2 - 1, 4, 3, 7, '#ffd23f'); rect(W / 2 - 1, 13, 3, 3, '#ffd23f'); rect(W / 2, 5, 1, 5, '#fff2a0');
    } else if (id === 'skateKickflip') {
      for (const [x, y, c] of [[30, FY - 1, '#ffd23f'], [33, FY - 2, '#ffffff'], [27, FY - 2, '#ff8a2a'], [35, FY, '#ffd23f']]) rect(x, y, 2, 1, c);
    } else if (id === 'wallBurst') {
      for (const [x, y] of [[6, 10], [40, 8], [3, 18], [43, 16], [10, 4], [36, 3]]) { rect(x, y, 3, 2, '#c8603e'); px(x, y, '#d8cbb8'); }
    } else if (id === 'heliDrop') {
      rect(8, 3, 32, 1, '#c8ccd8'); rect(14, 2, 20, 1, 'rgba(200,204,216,0.5)');
    } else if (id === 'jetpack') {
      for (const [x, y, c] of [[W / 2 - 3, 24, '#ffe14a'], [W / 2 + 2, 24, '#ffe14a'], [W / 2 - 3, 26, '#ffa31a'], [W / 2 + 2, 26, '#ffa31a'], [W / 2 - 3, 28, '#ff5a1f'], [W / 2 + 2, 28, '#ff5a1f']]) rect(x, y, 2, 2, c);
    } else if (id === 'limo') {
      const star = (x, y) => { px(x, y, '#ffffff'); px(x - 1, y, '#fff2c8'); px(x + 1, y, '#fff2c8'); px(x, y - 1, '#fff2c8'); px(x, y + 1, '#fff2c8'); };
      star(8, 9); star(40, 7); star(24, 4);
    } else if (id === 'moneyRain') {
      for (const [x, y] of [[4, 3], [14, 9], [24, 2], [34, 11], [42, 5], [9, 17], [38, 19], [19, 14], [29, 19]]) { rect(x, y, 4, 2, '#6fcf5f'); px(x + 1, y, '#ffffff'); px(x + 3, y + 1, '#3f8f45'); }
    } else if (id === 'hypeParade') {
      const cols = ['#ff4fa3', '#ffd23f', '#29b6f6', '#5fdc4a', '#ffffff'];
      for (let i = 0; i < 18; i++) rect((i * 13 + 3) % W, (i * 7 + 11) % 24 + 2, 1 + (i & 1), 2 - (i & 1), cols[i % cols.length]);
    } else {
      for (const [x, y] of [[10, 8], [38, 6], [30, 14], [14, 16]]) { px(x, y, '#ffffff'); px(x + 1, y + 1, '#8fd4ff'); }
    }
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

// Pixel heroes for the newer entrances (palette letter per pixel, '.' = clear).
const HERO_PAL = {
  k: '#15121f', b: '#c8955a', d: '#a87440', t: '#e6d2a0', s: '#1c120a', w: '#ffffff', r: '#d8243a',
  p: '#ff4fa3', P: '#c2185b', g: '#3a3a46', m: '#b8c0cc', c: '#fff1d6', y: '#ffd23f',
  B: '#1477c9', L: '#8fd8ff', W: '#f4f6fa', n: '#3d4352', o: '#ff8a2a', O: '#ffe14a',
  x: '#17171f', v: '#2a1f48', V: '#5a4a8a', G: '#ffc21a', e: '#e8ecf4',
  H: '#6fcf5f', h: '#3f8f45',
};
const HEROES = {
  boxSneak: [
    'kkkkkkkkkkkkkkkkkk',
    'kbbbbbbbttbbbbbbbk',
    'kdddddddttdddddddk',
    'kbbbbbbbttbbbbbbbk',
    'kbbbsssssssssbbbbk',
    'kbbbswwsssswwsbbbk',
    'kbbbsssssssssbbbbk',
    'kbbbbbbbttbbbbbbbk',
    'kbbbbbbbbbbbbbbbbk',
    'kbbrrrrrrbbbbbbbbk',
    'kbbbbbbbbbbbbbbbbk',
    'kddddddddddddddddk',
    'kkkkkkkkkkkkkkkkkk',
  ],
  skateKickflip: [
    'pp..................pp',
    '.pPpppppppppppppppppP.',
    '..gggggggggggggggggg..',
    '....mm..........mm....',
    '...cc.cc......cc.cc...',
  ],
  heliDrop: [
    '..nnnnnnnnnnnnnnnnnnnn....',
    '...........nn.............',
    'y.......WWWWWWWWW.........',
    'yy.....WWWWWWWWWLLL.......',
    'BBBBBBBBBBBBBBBBLLLL......',
    'y....BBBBBBBBBBBBBBBB.....',
    '.......kBBBBBBBBBBBB......',
    '.......n.....n....n.......',
    '......nnnnnnnnnnnnnnn.....',
  ],
  limo: [
    '.......nnnnnnnnnnnnnnnnnnn.......',
    '......nxxxxxxxxxxxxxxxxxxxxn.....',
    '.....nxvVvvxvvVvvxvvvVvxvvLLn....',
    '.....nxvvvvxvvvvvxvvvvvxvvLLLn...',
    '.nnnnnxxxxxxxxxxxxxxxxxxxxxxxxnn.',
    'nxxxxxGGGGGGGGGGGGGGGGGGGGGGGGGxn',
    'nrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxW',
    'nrxxmmmmmmmmmmmmmmmmmmmmmmmmmmxxW',
    'nxxxkkkxxxxxxxxxxxxxxxxxxxkkkxxxn',
    '.nnkkmkknnnnnnnnnnnnnnnnnkkmkknn.',
    '....kkk...................kkk....',
  ],
  wallBurst: [
    '....kkkkk...',
    '..kkcccccck.',
    '.kccckccckck',
    'kcccckccckck',
    'kcccckccckck',
    'kccccccccckk',
    'kckkcccccck.',
    'kccckkkkkk..',
    '.kcccccck...',
    '..kkkkkk....',
  ],
  moneyRain: [
    '..kkkkkkkkkkkk..',
    '.kGGGGGGGGGGGGk.',
    '.kGgGGGwGGGGgGk.',
    'kkkkkkkkkkkkkkkk',
    'kHHHHHHwHHHHHHHk',
    'kHhHHHwwwHHHHhHk',
    'kHHHHHHwHHHHHHHk',
    'kkkkkkkkkkkkkkkk',
    'kHHHHHHwHHHHHHHk',
    'kHhHHHwwwHHHHhHk',
    'kkkkkkkkkkkkkkkk',
  ],
  jetpack: [
    '...WWWWWW...',
    '..WWWWWWWW..',
    '.mWWWppWWWm.',
    '.mWWWppWWWm.',
    '.mWWWWWWWWm.',
    '.mWWWWWWWWm.',
    '.nn......nn.',
    '.OO......OO.',
    '.oO......Oo.',
    '..o......o..',
  ],
};
const heroCache = new Map();
function heroURL(id) {
  if (heroCache.has(id)) return heroCache.get(id);
  const rows = HEROES[id];
  const w = Math.max(...rows.map((r) => r.length)), hh = rows.length;
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && HERO_PAL[ch]) { g.fillStyle = HERO_PAL[ch]; g.fillRect(x, y, 1, 1); } }));
  const url = c.toDataURL();
  heroCache.set(id, url);
  return url;
}

export function entranceArt(id, cls = '') {
  const e = entranceDef(id);
  const img = (layer, c) => h('img', { class: c, src: draw(e.id, layer), draggable: 'false', alt: '' });
  const hero = HEROES[e.id] ? h('img', { class: 'ent-ic ent-px', src: heroURL(e.id), draggable: 'false', alt: '' }) : icon(e.icon ?? 'star', 'ent-ic');
  return h('div', { class: `ent-art ent-${e.id} ${cls}`, style: { '--ec': e.color } },
    img('base', 'ent-bg'),
    img('fx', 'ent-fx'),
    h('div', { class: 'ent-hero' }, hero),
    h('div', { class: 'ent-clap' }));
}
