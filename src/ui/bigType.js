// "Swarm Arcade": the game's headline face for BIG text (VICTORY / DEFEAT / DRAW, VS,
// LEVEL UP, the big banners). Hand-drawn here as pixel bitmaps in the style of classic
// arcade / SNES title lettering: 10 px caps, a consistent 2 px stroke, 1 px corner
// rounding on the round letters, a 2-tone fill, a 1 px ink outline and a hard drop
// shadow (1 right, 2 down). Normal text keeps the Swarm Pixel faces (fonts.css); the
// game name itself is always the 3D voxel sign (scenes/titleLogo3d.js).
//
// Pixel perfect: each letter is a tiny canvas shown with image-rendering: pixelated at a
// WHOLE number of device pixels per font pixel. The size comes from the element's
// font-size (1em = one 14 px letter box) and is snapped down to an integer scale once
// the element is in the page, and again on resize.
//
//   bigText('VICTORY', { theme: 'gold', drop: 'stamp', delay: 0.1 })  -> <div class="bt">
//   created with { play: false }, el.classList.add('go') starts the entrance.
// Entrances are snappy and stepped (no tweening): 'stamp' = one frame at 2x, then the
// letter in place with a single white flash frame; 'drop' = two frames falling, then
// the flash frame. Letters go one after another.
import './bigType.css';

export const BOX_H = 14; // letter box height in font px: 10 cap + outline + shadow

/* prettier-ignore */
const G = {
  A: ['.######.', '########', '##....##', '##....##', '##....##', '########', '########', '##....##', '##....##', '##....##'],
  B: ['#######.', '########', '##....##', '##....##', '#######.', '#######.', '##....##', '##....##', '########', '#######.'],
  C: ['.#######', '########', '##......', '##......', '##......', '##......', '##......', '##......', '########', '.#######'],
  D: ['#######.', '########', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '########', '#######.'],
  E: ['#######', '#######', '##.....', '##.....', '######.', '######.', '##.....', '##.....', '#######', '#######'],
  F: ['#######', '#######', '##.....', '##.....', '######.', '######.', '##.....', '##.....', '##.....', '##.....'],
  G: ['.#######', '########', '##......', '##......', '##..####', '##..####', '##....##', '##....##', '########', '.#######'],
  H: ['##....##', '##....##', '##....##', '##....##', '########', '########', '##....##', '##....##', '##....##', '##....##'],
  I: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '######', '######'],
  J: ['..######', '..######', '......##', '......##', '......##', '......##', '##....##', '##....##', '########', '.######.'],
  K: ['##....##', '##...###', '##..###.', '##.###..', '#####...', '#####...', '##.###..', '##..###.', '##...###', '##....##'],
  L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######', '#######'],
  M: ['##......##', '###....###', '####..####', '##.####.##', '##..##..##', '##......##', '##......##', '##......##', '##......##', '##......##'],
  N: ['##....##', '###...##', '####..##', '#####.##', '##.#####', '##..####', '##...###', '##....##', '##....##', '##....##'],
  O: ['.######.', '########', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '########', '.######.'],
  P: ['#######.', '########', '##....##', '##....##', '########', '#######.', '##......', '##......', '##......', '##......'],
  Q: ['.######.', '########', '##....##', '##....##', '##....##', '##....##', '##..####', '##...###', '########', '.#######'],
  R: ['#######.', '########', '##....##', '##....##', '########', '#######.', '##..###.', '##...###', '##....##', '##....##'],
  S: ['.#######', '########', '##......', '##......', '#######.', '.#######', '......##', '......##', '########', '#######.'],
  T: ['########', '########', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
  U: ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '########', '.######.'],
  V: ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '###..###', '.######.', '..####..', '...##...'],
  W: ['##......##', '##......##', '##......##', '##......##', '##......##', '##..##..##', '##.####.##', '##########', '###....###', '##......##'],
  X: ['##....##', '##....##', '###..###', '.######.', '..####..', '..####..', '.######.', '###..###', '##....##', '##....##'],
  Y: ['##....##', '##....##', '##....##', '###..###', '.######.', '..####..', '...##...', '...##...', '...##...', '...##...'],
  Z: ['########', '########', '.....###', '....###.', '...###..', '..###...', '.###....', '###.....', '########', '########'],
  0: ['.######.', '########', '##...###', '##..####', '##.##.##', '####..##', '###...##', '##....##', '########', '.######.'],
  1: ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '..##..', '..##..', '######', '######'],
  2: ['.######.', '########', '##....##', '......##', '.######.', '#######.', '##......', '##......', '########', '########'],
  3: ['#######.', '########', '......##', '......##', '.######.', '.######.', '......##', '......##', '########', '#######.'],
  4: ['##....##', '##....##', '##....##', '##....##', '########', '########', '......##', '......##', '......##', '......##'],
  5: ['########', '########', '##......', '##......', '#######.', '########', '......##', '......##', '########', '#######.'],
  6: ['.#######', '########', '##......', '##......', '#######.', '########', '##....##', '##....##', '########', '.######.'],
  7: ['########', '########', '......##', '.....###', '....###.', '...###..', '..###...', '..##....', '..##....', '..##....'],
  8: ['.######.', '########', '##....##', '##....##', '.######.', '.######.', '##....##', '##....##', '########', '.######.'],
  9: ['.######.', '########', '##....##', '##....##', '########', '.#######', '......##', '......##', '########', '#######.'],
  '!': ['##', '##', '##', '##', '##', '##', '##', '..', '##', '##'],
  '?': ['.######.', '########', '##....##', '.....###', '...####.', '...###..', '...##...', '........', '...##...', '...##...'],
  "'": ['##', '##', '##', '..', '..', '..', '..', '..', '..', '..'],
  '.': ['##', '##', '..', '..', '..', '..', '..', '..', '..', '..'].reverse(),
  ',': ['##', '##', '..', '..', '..', '..', '..', '..', '..', '..'].reverse(),
  ':': ['..', '..', '##', '##', '..', '..', '##', '##', '..', '..'],
  '-': ['......', '......', '......', '......', '######', '######', '......', '......', '......', '......'],
  '+': ['......', '......', '..##..', '..##..', '######', '######', '..##..', '..##..', '......', '......'],
};
G['’'] = G["'"];
export const GLYPHS = G;
const ROWS = 10, SPACE = 4;

// ---------------------------------------------------------------- palettes (2 tones + outline + shadow)
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, k) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const THEMES = {
  gold: { hi: '#ffec6a', lo: '#ffb320', ink: '#120c24', sh: '#5a1e08' },
  pink: { hi: '#ffc0e0', lo: '#ff5fac', ink: '#120c24', sh: '#5a0a34' },
  ice: { hi: '#eef3ff', lo: '#9cb0ff', ink: '#0a0820', sh: '#1c1c5a' },
  violet: { hi: '#f0e0ff', lo: '#b08aff', ink: '#120c24', sh: '#2a1270' },
  white: { hi: '#ffffff', lo: '#d2dcf6', ink: '#120c24', sh: '#2a2c5a' },
};
const NAMED = { '#ffd84a': 'gold', '#ffd23f': 'gold', '#fff': 'white', '#ffffff': 'white' };
function themeOf(t) {
  if (!t) return THEMES.gold;
  if (THEMES[t]) return THEMES[t];
  let c = String(t).toLowerCase();
  if (NAMED[c]) return THEMES[NAMED[c]];
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(c)) return THEMES.gold;
  if (c.length === 4) c = '#' + [...c.slice(1)].map((x) => x + x).join('');
  return (THEMES[c] = { hi: mix(c, '#ffffff', 0.5), lo: c, ink: '#120c24', sh: mix(c, '#120424', 0.72) });
}

// ---------------------------------------------------------------- glyph art
const artCache = new Map();
/** { url, flash, w } for one glyph: w x BOX_H font px, face at (1, 1). */
function glyphArt(ch, T) {
  const key = ch + '|' + T.hi + T.lo + T.sh;
  let a = artCache.get(key);
  if (a) return a;
  const rows = G[ch], gw = rows[0].length;
  const W = gw + 3, H = BOX_H;
  const face = (x, y) => { x -= 1; y -= 1; return y >= 0 && y < ROWS && x >= 0 && x < gw && rows[y][x] === '#'; };
  const sil = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (face(x + dx, y + dy)) return true; return false; };
  const paint = (flash) => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H);
    const put = (x, y, c) => { const [r, gg, b] = hex(c); const i = (y * W + x) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (face(x, y)) put(x, y, flash ? '#ffffff' : y - 1 < 5 ? T.hi : T.lo);
      else if (sil(x, y)) put(x, y, T.ink);
      else if (sil(x - 1, y - 2)) put(x, y, T.sh);
    }
    g.putImageData(img, 0, 0);
    return cv.toDataURL();
  };
  a = { url: paint(false), flash: paint(true), w: W };
  artCache.set(key, a);
  return a;
}
const glyphAdv = (ch) => (G[ch] ? G[ch][0].length + 2 : SPACE);

/** Width of a headline in em (1em = one letter box), for fitting it to the screen. */
export function bigTextWidth(text) {
  return ([...String(text).toUpperCase()].reduce((s, c) => s + glyphAdv(c), 0) + 1) / BOX_H;
}

// ---------------------------------------------------------------- integer-scale snapping
/** Pick the largest whole number of device pixels per font pixel that fits the font-size. */
export function snapBigText(el) {
  const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
  if (!fs) return false;
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.floor((fs * dpr) / BOX_H + 0.02));
  el.style.setProperty('--ap', `${k / dpr}px`);
  return true;
}
const pending = new Set();
let raf = 0;
function snapSoon(el) {
  pending.add(el);
  if (raf) return;
  let tries = 0;
  const step = () => {
    raf = 0;
    for (const e of pending) if (e.isConnected && snapBigText(e)) pending.delete(e);
    if (pending.size && ++tries < 120) raf = requestAnimationFrame(step);
    else pending.clear();
  };
  raf = requestAnimationFrame(step);
}
if (typeof window !== 'undefined') {
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { for (const e of document.querySelectorAll('.bt')) snapBigText(e); }, 60); });
}

// ---------------------------------------------------------------- the element
const DROPS = { stamp: 0.15, drop: 0.2, none: 0 };
const ALIAS = { slam: 'stamp', pop: 'stamp', thud: 'drop' };

/**
 * Big headline text. Returns <div class="bt bt-{drop}"> (inline-flex, 1em tall).
 * o: { theme: 'gold'|'pink'|'ice'|'violet'|'white'|'#hex', drop: 'stamp'|'drop'|'none',
 *      delay, stagger (s), play (default true), cls }
 */
export function bigText(text, o = {}) {
  const T = themeOf(o.theme ?? o.color);
  let drop = o.drop ?? 'stamp';
  drop = ALIAS[drop] ?? drop;
  if (!(drop in DROPS)) drop = 'stamp';
  const dur = DROPS[drop];
  const delay = o.delay ?? 0, stagger = o.stagger ?? (drop === 'drop' ? 0.08 : 0.05);
  const el = document.createElement('div');
  el.className = `bt bt-${drop} ${o.cls ?? ''}`;
  el.setAttribute('aria-label', text);
  el.setAttribute('role', 'img');
  let i = 0;
  for (const ch of String(text).toUpperCase()) {
    if (!G[ch]) { const sp = document.createElement('span'); sp.className = 'bt-sp'; sp.style.setProperty('--w', SPACE); el.appendChild(sp); continue; }
    const art = glyphArt(ch, T);
    const s = document.createElement('span');
    s.className = 'bt-ch';
    s.style.setProperty('--w', art.w);
    s.style.setProperty('--d', (delay + i * stagger).toFixed(3) + 's');
    const im = document.createElement('img');
    im.className = 'bt-g'; im.alt = ''; im.draggable = false; im.src = art.url;
    s.appendChild(im);
    if (drop !== 'none') {
      const fl = document.createElement('img');
      fl.className = 'bt-fl'; fl.alt = ''; fl.draggable = false; fl.src = art.flash;
      s.appendChild(fl);
    }
    el.appendChild(s);
    i++;
  }
  el._end = delay + Math.max(0, i - 1) * stagger + dur; // when the last letter has landed (s)
  if (o.play !== false) el.classList.add('go');
  snapSoon(el);
  return el;
}
