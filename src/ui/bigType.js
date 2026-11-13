// "Swarm Block": the game's own headline face, hand-drawn here as glyph bitmaps and
// rendered to pixel art per letter (no web font). Used only for BIG text: the game
// logo, VICTORY / DEFEAT / DRAW, VS and the big banners. Normal text keeps the
// Swarm Pixel faces (fonts.css).
//
// Each glyph is drawn on a 7-row grid with 2-cell stems. One cell = 4 art pixels;
// a letter is then built like a toy sign:
//   face       4 hard colour bands (light cap, glossy split, saturated belly)
//   bevel      lit top + left edges, shaded bottom + right edges, a white glint
//              in every exposed top-left corner, rounded outer corners
//   extrusion  a 4 px drop straight down in two dark shades (never tilted)
//   outline    a 2 px ink rim around face + extrusion
// The art is cached per glyph + theme as a data URL and shown with
// image-rendering: pixelated, sized in em (1em = the full letter box height).
//
//   bigText('VICTORY', { theme: 'gold', drop: 'slam', delay: 0.1 })  -> <div class="bt">
//   el.classList.add('go') starts the entrance when created with { play: false }.
// Entrances (bigType.css): per-letter slam / thud / pop with squash, a shine sweep
// across the word and a pixel dust + sparkle burst where each letter lands.
import './bigType.css';

const C = 4; // art px per glyph cell
const OL = 2; // outline
const EX = 4; // extrusion depth
const ROWS = 7;
export const BOX_H = ROWS * C + EX + OL * 2; // 36: letter box height in art px (= 1em)

/* prettier-ignore */
const G = {
  A: ['.####.', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  B: ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '#####.'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##..##', '.####.'],
  D: ['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
  E: ['#####', '##...', '##...', '####.', '##...', '##...', '#####'],
  F: ['#####', '##...', '##...', '####.', '##...', '##...', '##...'],
  G: ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '.#####'],
  H: ['##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  I: ['##', '##', '##', '##', '##', '##', '##'],
  J: ['....##', '....##', '....##', '....##', '##..##', '##..##', '.####.'],
  K: ['##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##'],
  L: ['##...', '##...', '##...', '##...', '##...', '##...', '#####'],
  M: ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##', '##...##'],
  N: ['##..##', '###.##', '######', '##.###', '##..##', '##..##', '##..##'],
  O: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  P: ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....'],
  Q: ['.####.', '##..##', '##..##', '##..##', '##.###', '##.##.', '.##.##'],
  R: ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
  S: ['.#####', '##....', '##....', '.####.', '....##', '....##', '#####.'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  V: ['##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '..##..'],
  W: ['##...##', '##...##', '##...##', '##.#.##', '#######', '###.###', '##...##'],
  X: ['##..##', '##..##', '.####.', '..##..', '.####.', '##..##', '##..##'],
  Y: ['##..##', '##..##', '##..##', '.####.', '..##..', '..##..', '..##..'],
  Z: ['######', '....##', '...##.', '..##..', '.##...', '##....', '######'],
  0: ['.####.', '##..##', '##.###', '######', '###.##', '##..##', '.####.'],
  1: ['.##.', '###.', '.##.', '.##.', '.##.', '.##.', '####'],
  2: ['.####.', '##..##', '....##', '...##.', '..##..', '.##...', '######'],
  3: ['#####.', '....##', '....##', '..###.', '....##', '....##', '#####.'],
  4: ['...###', '..####', '.##.##', '##..##', '######', '....##', '....##'],
  5: ['######', '##....', '#####.', '....##', '....##', '##..##', '.####.'],
  6: ['.####.', '##....', '##....', '#####.', '##..##', '##..##', '.####.'],
  7: ['######', '....##', '...##.', '..##..', '..##..', '..##..', '..##..'],
  8: ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '.####.'],
  9: ['.####.', '##..##', '##..##', '.#####', '....##', '....##', '.####.'],
  '!': ['##', '##', '##', '##', '##', '..', '##'],
  '?': ['.####.', '##..##', '....##', '..###.', '..##..', '......', '..##..'],
  "'": ['##', '##', '..', '..', '..', '..', '..'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '..', '##', '##'],
  ':': ['..', '##', '##', '..', '##', '##', '..'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '+': ['......', '..##..', '..##..', '######', '..##..', '..##..', '......'],
  $: ['..##..', '.#####', '##....', '.####.', '....##', '#####.', '..##..'],
};
G['’'] = G["'"];
export const GLYPHS = G;

// ---------------------------------------------------------------- palettes
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, k) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

const THEMES = {
  gold: { b: ['#fffbe0', '#ffe868', '#ffc21a', '#ff9414'], hi: '#ffffff', lo: '#c25a0a', sd: ['#c8560e', '#7a2a08'], ink: '#170b24', dust: ['#fff2b0', '#ffd84a', '#e8c89a'] },
  pink: { b: ['#fff0f7', '#ffbedd', '#ff6fb4', '#e8418f'], hi: '#ffffff', lo: '#a8145a', sd: ['#b51a63', '#5e0a36'], ink: '#170b24', dust: ['#ffd0e6', '#ff8ac4', '#f0d8e8'] },
  ice: { b: ['#ffffff', '#dbe6ff', '#a8beff', '#7a8cf0'], hi: '#ffffff', lo: '#3a3ab0', sd: ['#3c42b8', '#1a1a5e'], ink: '#0a0820', dust: ['#dbe6ff', '#a8beff', '#8a90b8'] },
  violet: { b: ['#ffffff', '#f0e2ff', '#c9a4ff', '#9a6aff'], hi: '#ffffff', lo: '#5a2ad0', sd: ['#5a30c0', '#2a1270'], ink: '#120c24', dust: ['#f0e2ff', '#c9a4ff', '#b0a0c8'] },
  white: { b: ['#ffffff', '#f4f6ff', '#dfe6ff', '#b8c4f0'], hi: '#ffffff', lo: '#6a74b0', sd: ['#5a6098', '#2a2c5a'], ink: '#120c24', dust: ['#ffffff', '#dfe6ff', '#b8c4f0'] },
};
const NAMED = { '#ffd84a': 'gold', '#ffd23f': 'gold', '#fff': 'white', '#ffffff': 'white' };

function themeOf(t) {
  if (!t) return THEMES.gold;
  if (THEMES[t]) return THEMES[t];
  let c = String(t).toLowerCase();
  if (NAMED[c]) return THEMES[NAMED[c]];
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(c)) return THEMES.gold;
  if (c.length === 4) c = '#' + [...c.slice(1)].map((x) => x + x).join('');
  return (THEMES[c] = {
    b: [mix(c, '#ffffff', 0.85), mix(c, '#ffffff', 0.5), c, mix(c, '#2a0830', 0.2)],
    hi: '#ffffff', lo: mix(c, '#14061e', 0.42), sd: [mix(c, '#20082a', 0.45), mix(c, '#120424', 0.72)], ink: '#170b24',
    dust: [mix(c, '#ffffff', 0.6), c, mix(c, '#c8c0d0', 0.6)],
  });
}

// ---------------------------------------------------------------- glyph art
const artCache = new Map();

/** Pixel art for one glyph: { url, mask, w } (w in art px, height BOX_H). */
function glyphArt(ch, theme) {
  const key = ch + '|' + theme.b[2] + theme.sd[1];
  let a = artCache.get(key);
  if (a) return a;
  const rows = G[ch];
  const gw = rows[0].length;
  const W = gw * C + OL * 2, H = BOX_H;
  const cell = (x, y) => y >= 0 && y < ROWS && x >= 0 && x < gw && rows[y][x] === '#';
  // face mask with rounded outer corners
  const M = new Uint8Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : M[y * W + x]);
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < gw; cx++) {
    if (!cell(cx, cy)) continue;
    const x0 = OL + cx * C, y0 = OL + cy * C;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) M[(y0 + y) * W + x0 + x] = 1;
    const up = cell(cx, cy - 1), dn = cell(cx, cy + 1), lf = cell(cx - 1, cy), rt = cell(cx + 1, cy);
    if (!up && !lf) M[y0 * W + x0] = 0;
    if (!up && !rt) M[y0 * W + x0 + C - 1] = 0;
    if (!dn && !lf) M[(y0 + C - 1) * W + x0] = 0;
    if (!dn && !rt) M[(y0 + C - 1) * W + x0 + C - 1] = 0;
  }
  // extrusion (k px below the face) and outline (2 px rim, rounded)
  const X = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (M[y * W + x]) continue;
    for (let k = 1; k <= EX; k++) if (at(x, y - k)) { X[y * W + x] = k; break; }
  }
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (M[y * W + x] || X[y * W + x]);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const mk = document.createElement('canvas');
  mk.width = W; mk.height = H;
  const mg = mk.getContext('2d');
  const mimg = mg.createImageData(W, H);
  const put = (x, y, c) => { const [r, gg, b] = hex(c); const i = (y * W + x) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255; };
  const faceTop = OL, capH = ROWS * C;
  const band = (y) => { const k = (y - faceTop) / capH; return k < 0.2 ? 0 : k < 0.46 ? 1 : k < 0.76 ? 2 : 3; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (M[y * W + x]) {
      const bi = band(y);
      let c = theme.b[bi];
      const up = at(x, y - 1), dn = at(x, y + 1), lf = at(x - 1, y), rt = at(x + 1, y);
      if (!up) c = theme.hi;
      else if (!dn) c = theme.lo;
      else if (!lf) c = mix(theme.b[bi], theme.hi, 0.55);
      else if (!rt) c = mix(theme.b[bi], theme.lo, 0.45);
      else if (!at(x, y - 2) && bi < 2) c = mix(theme.b[bi], theme.hi, 0.5);
      // glossy split line between the light cap and the saturated belly
      if (up && dn && lf && rt && band(y - 1) === 1 && bi === 2) c = mix(theme.b[2], theme.hi, 0.35);
      put(x, y, c);
      const i = (y * W + x) * 4; mimg.data[i] = mimg.data[i + 1] = mimg.data[i + 2] = mimg.data[i + 3] = 255;
    } else if (X[y * W + x]) {
      const k = X[y * W + x];
      let c = k === 1 ? theme.sd[0] : theme.sd[1];
      if (k > 1 && !solid(x - 1, y)) c = mix(theme.sd[1], theme.sd[0], 0.4);
      put(x, y, c);
    } else {
      // outline: within 2 px of the solid (square minus the far corners)
      let near = false;
      for (let dy = -OL; dy <= OL && !near; dy++) for (let dx = -OL; dx <= OL; dx++) {
        if (Math.abs(dx) === OL && Math.abs(dy) === OL) continue;
        if (solid(x + dx, y + dy)) { near = true; break; }
      }
      if (near) put(x, y, theme.ink);
    }
  }
  // white glints in exposed top-left corners of the face
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < gw; cx++) {
    if (!cell(cx, cy) || cell(cx, cy - 1) || cell(cx - 1, cy)) continue;
    const x0 = OL + cx * C, y0 = OL + cy * C;
    put(x0 + 1, y0 + 1, '#ffffff'); put(x0 + 2, y0 + 1, '#ffffff'); put(x0 + 1, y0 + 2, '#ffffff');
  }
  g.putImageData(img, 0, 0);
  mg.putImageData(mimg, 0, 0);
  a = { url: cv.toDataURL(), mask: mk.toDataURL(), w: W, canvas: cv };
  artCache.set(key, a);
  return a;
}

/** Width of a glyph box in art px (spaces 12). */
function glyphW(ch) { return G[ch] ? G[ch][0].length * C + OL * 2 : 12; }

// ---------------------------------------------------------------- the element
const DROPS = { slam: [0.56, 0.27], thud: [0.62, 0.38], pop: [0.42, 0.2], none: [0, 0] };
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * Big headline text. Returns <div class="bt bt-{drop}"> (inline-flex, 1em tall).
 * o: { theme: 'gold'|'pink'|'ice'|'violet'|'white'|'#hex', drop: 'slam'|'thud'|'pop'|'none',
 *      delay, stagger (s), dust (default on unless drop 'none'), shine: true|false|'loop', play (default true), cls }
 */
export function bigText(text, o = {}) {
  const theme = themeOf(o.theme ?? o.color);
  const drop = o.drop ?? 'slam';
  const [dur, land] = DROPS[drop] ?? DROPS.slam;
  const delay = o.delay ?? 0, stagger = o.stagger ?? (drop === 'thud' ? 0.09 : drop === 'pop' ? 0.035 : 0.07);
  const dust = o.dust ?? drop !== 'none';
  const shine = o.shine ?? true;
  const el = document.createElement('div');
  el.className = `bt bt-${drop}${shine === 'loop' ? ' bt-loop' : ''}${shine ? ' bt-shiny' : ''} ${o.cls ?? ''}`;
  el.setAttribute('aria-label', text);
  el.setAttribute('role', 'img');
  const chars = [...String(text).toUpperCase()];
  const n = chars.filter((c) => c !== ' ').length;
  let i = 0;
  for (const ch of chars) {
    if (!G[ch]) { const sp = document.createElement('span'); sp.className = 'bt-sp'; sp.style.setProperty('--w', glyphW(ch)); el.appendChild(sp); continue; }
    const art = glyphArt(ch, theme);
    const s = document.createElement('span');
    s.className = 'bt-ch';
    const d = delay + i * stagger;
    s.style.setProperty('--w', art.w);
    s.style.setProperty('--d', d.toFixed(3) + 's');
    s.style.setProperty('--dur', dur + 's');
    s.style.setProperty('--sd', (delay + n * stagger + dur * 0.7 + i * 0.045).toFixed(3) + 's');
    const im = document.createElement('img');
    im.className = 'bt-g'; im.alt = ''; im.draggable = false; im.src = art.url;
    s.appendChild(im);
    if (shine) {
      const sh = document.createElement('i');
      sh.className = 'bt-sh';
      sh.style.setProperty('--m', `url("${art.mask}")`);
      s.appendChild(sh);
    }
    if (dust) s.appendChild(dustBurst(theme, d + land, art.w, drop));
    el.appendChild(s);
    i++;
  }
  el._n = n;
  el._end = delay + n * stagger + dur; // when the last letter has settled (s)
  if (o.play !== false) el.classList.add('go');
  return el;
}

/** Pixel dust puffs out sideways from a letter's feet, a few sparkles pop up. */
function dustBurst(theme, at, w, drop) {
  const b = document.createElement('b');
  b.className = 'bt-dust';
  const n = drop === 'pop' ? 6 : 10;
  for (let k = 0; k < n; k++) {
    const p = document.createElement('i');
    const side = k % 2 ? 1 : -1;
    const s = pickInt(2, 4);
    p.style.cssText = `--s:${s};--c:${theme.dust[k % 3]};--x:${Math.round(rnd(-0.3, 0.3) * w)};--dx:${Math.round(side * rnd(w * 0.35, w * 0.95))};--dy:${Math.round(-rnd(2, drop === 'thud' ? 8 : 14))};--t:${rnd(0.45, 0.7).toFixed(2)}s;--at:${(at + rnd(0, 0.04)).toFixed(3)}s`;
    b.appendChild(p);
  }
  if (drop !== 'thud') for (let k = 0; k < 2; k++) {
    const p = document.createElement('i');
    p.className = 'sp';
    p.style.cssText = `--s:5;--c:${k ? theme.hi : theme.b[1]};--x:${Math.round(rnd(-0.4, 0.4) * w)};--dx:${Math.round(rnd(-8, 8))};--dy:${Math.round(-rnd(26, 40))};--t:${rnd(0.5, 0.65).toFixed(2)}s;--at:${(at + 0.03 + k * 0.05).toFixed(3)}s`;
    b.appendChild(p);
  }
  return b;
}
const pickInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** Draw a word in Swarm Block onto a 2D canvas (centred at x, top at y, letter box height hpx). */
export function drawBigText(g, text, x, y, hpx, theme = 'gold') {
  const T = themeOf(theme);
  const chars = [...String(text).toUpperCase()];
  const k = hpx / BOX_H;
  const total = chars.reduce((s, c) => s + glyphW(c), 0) * k;
  let cx = x - total / 2;
  g.imageSmoothingEnabled = false;
  for (const ch of chars) {
    if (G[ch]) { const a = glyphArt(ch, T); g.drawImage(a.canvas, Math.round(cx), Math.round(y), Math.round(a.w * k), Math.round(BOX_H * k)); }
    cx += glyphW(ch) * k;
  }
}

/** Width of a headline in em (letter boxes are 1em tall), for fitting it to the screen. */
export function bigTextWidth(text) {
  return [...String(text).toUpperCase()].reduce((s, c) => s + glyphW(c), 0) / BOX_H;
}

/** A one-off pixel dust puff (e.g. a troop landing on a letter): absolutely place it, font-size = letter size. */
export function dustPuff(theme = 'gold', w = 26) {
  const el = document.createElement('div');
  el.className = 'bt go bt-puff';
  el.appendChild(dustBurst(themeOf(theme), 0, w, 'slam'));
  return el;
}
