// Screen transitions: hand-drawn pixel-art wipes on a small low-res canvas.
//
// Every transition is drawn at "art pixel" resolution (2-4 CSS px per pixel,
// scaled up with hard edges) and only redraws on a fixed 20 fps step clock, so
// motion snaps in chunky steps like sprite animation. Two phases:
//   cover  (phase 'in')  - grows until the screen is hidden, then holds
//   reveal (phase 'out') - uncovers the new screen, then removes itself
// Art that both phases share (doors, slab, drips) is kept between them.
//
//   tx.cover(kind)  -> resolves once fully covered (overlay stays up)
//   tx.reveal(kind) -> uncovers; resolves when gone
//   tx.play(kind)   -> one-shot effect over the screen ('roll')
//   tabSwap(host, rect, tab, dir) -> resolves when the panel area is covered;
//                     the reveal then runs by itself
//
// Kinds (full screen): stampede, crack, swarm, blast, goo, tv, roll, dither.
// Kinds (tab panel):   hatch (shop), deal (cards), shutter (lab), chevron (pass), slide (home).
// prefers-reduced-motion swaps all of them for a quick stepped fade.
import { audio } from '../core/audio.js';

const FPS = 20;
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sfx = (n, o) => { try { audio.play(n, o); } catch (e) { /* audio optional */ } };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const smooth = (t) => t * t * (3 - 2 * t);
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(x & 3) + ((y & 3) << 2)];

// palette
const C = {
  ink: '#05081a', navy: '#0b1230', navy2: '#141d45', navy3: '#22306a', navy4: '#3a4a8a',
  gold: '#ffd23f', gold2: '#c9921a', gold3: '#fff3a8', pink: '#ff4fa3', pink2: '#a81e63', teal: '#4fe3ff', teal2: '#9ff2ff',
  green: '#7cff6a', orange: '#ff8a2a', white: '#f4f7ff', red: '#ff3b3b', amber: '#ffb31a',
  st0: '#1d2335', st1: '#2a3248', st2: '#3c465f', st3: '#566179', st4: '#76829a', st5: '#a3aec4',
  hy: '#ffcc1a', hk: '#17171f',
  g0: '#0d3b1a', g1: '#1c7a33', g2: '#38c14a', g3: '#7cff6a', g4: '#d4ffb0',
  lab0: '#3d4a5e', lab1: '#6c7d93', lab2: '#b8c6d6', lab3: '#e6f0f7',
  dust: '#c9a66b', dust2: '#8a7350', steam: '#dfe6f2', steam2: '#a9b4c8',
};

function canvas(w, hh) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, hh);
  return c;
}
/** Draw a pixel bitmap (rows of chars -> colours) at integer scale. */
function bitmap(g, rows, map, x0, y0, k = 1) {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const col = map[r[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x0 + x * k, y0 + y * k, k, k);
    }
  }
}
/** Two-tone rivet. */
function rivet(g, x, y) { g.fillStyle = C.st0; g.fillRect(x + 1, y + 1, 2, 2); g.fillStyle = C.st5; g.fillRect(x, y, 2, 2); g.fillStyle = '#e8eef8'; g.fillRect(x, y, 1, 1); }
/** Diagonal hazard stripes in a box. */
function hazard(g, x0, y0, w, hh, flip = false) {
  g.fillStyle = C.hk; g.fillRect(x0, y0, w, hh);
  g.fillStyle = C.hy;
  for (let y = 0; y < hh; y++) {
    for (let x = -8; x < w; x += 8) {
      const xx = x + (flip ? -(y + y0) : (y + y0)) % 8;
      const a = Math.max(0, xx), b = Math.min(w, xx + 4);
      if (b > a) g.fillRect(x0 + a, y0 + y, b - a, 1);
    }
  }
}
/** Light-on-top / dark-under bevel line pair. */
function bevel(g, x, y, w, hh, lt, dk) {
  g.fillStyle = lt; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, hh);
  g.fillStyle = dk; g.fillRect(x, y + hh - 1, w, 1); g.fillRect(x + w - 1, y, 1, hh);
}

const BOLT = [
  '.......kkkkk',
  '......kyyyk.',
  '.....kyyyk..',
  '....kyyyk...',
  '...kyyyk....',
  '..kyyyykkkk.',
  '.kyyyyyyyyk.',
  '.kkkkyyyyk..',
  '....kyyyk...',
  '...kyyyk....',
  '..kyyk......',
  '.kyyk.......',
  '.kyk........',
  'kyk.........',
  'kk..........',
];

// ---------------------------------------------------------------------------
// particles: a fixed pool, stepped at the transition clock, drawn as squares

function makeParts(n = 220) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, age: 0, life: 0, s: 1, grow: 0, cols: null });
  return a;
}
function spawn(c, x, y, vx, vy, life, cols, s = 1, grav = 0, grow = 0) {
  const P = c.parts;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (p.on) continue;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.age = 0; p.cols = cols; p.s = s; p.g = grav; p.grow = grow;
    return p;
  }
  return null;
}
function stepParts(c) {
  for (const p of c.parts) {
    if (!p.on) continue;
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.92; p.age++;
    if (p.age >= p.life) p.on = false;
  }
}
function drawParts(c) {
  const g = c.g;
  for (const p of c.parts) {
    if (!p.on) continue;
    const k = p.age / p.life;
    const col = p.cols[Math.min(p.cols.length - 1, (k * p.cols.length) | 0)];
    const s = Math.max(1, Math.round(p.s + p.grow * p.age));
    g.fillStyle = col;
    g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
  }
}
const clearParts = (c) => { for (const p of c.parts) p.on = false; };

// ---------------------------------------------------------------------------
// shared shapes

/**
 * Dithered sweep mask along x (dir 1 = left to right): solid behind the edge,
 * a Bayer-dithered band of B art px at the edge, with a chunky stepped jitter.
 * Cover: solid where u < e. Reveal: solid where u > e (the trailing edge leaves
 * in the direction of travel).
 */
function sweepMask(c, t, ph, dir, B, col) {
  const { g, W, H } = c;
  const S = 2;
  const e = ph === 'in' ? t * (W + B + 6) : -B - 6 + t * (W + 2 * B + 12);
  g.fillStyle = col;
  for (let y = 0; y < H; y += S) {
    const ee = e - (hash((y / S) | 0) % 3) * S;
    const X = (u, w) => g.fillRect(dir > 0 ? u : W - u - w, y, w, S);
    if (ph === 'in') {
      const solid = Math.floor((ee - B) / S) * S;
      if (solid > 0) X(0, Math.min(W, solid));
      for (let u = Math.max(0, solid); u < Math.min(W, ee); u += S) if ((ee - u) / B > bayer(u / S, y / S)) X(u, S);
    } else {
      const solid = Math.ceil((ee + B) / S) * S;
      if (solid < W) X(Math.max(0, solid), W - Math.max(0, solid));
      for (let u = Math.max(0, Math.floor(ee / S) * S); u < Math.min(W, solid); u += S) if ((u - ee) / B > bayer(u / S, y / S)) X(u, S);
    }
  }
}
/** Dithered shadow band (density 1 -> 0 over hh rows, down or up). */
function ditherShadow(g, x0, y0, w, hh, down, col = C.ink) {
  g.fillStyle = col;
  for (let y = 0; y < hh; y++) {
    const d = 0.75 * (1 - y / hh);
    const yy = down ? y0 + y : y0 - 1 - y;
    for (let x = x0; x < x0 + w; x += 2) if (d > bayer(x >> 1, yy)) g.fillRect(x, yy, 2, 1);
  }
}

// ---------------------------------------------------------------------------
// sprites (built once, cached)

let _troops = null;
/** Running chibi troops, facing right: 5 colours x 2 frames, 15x16 each. */
function troopSheet() {
  if (_troops) return _troops;
  const TW = 15, TH = 16;
  const cols = [[C.pink, '#ffb0d6', C.pink2], [C.gold, C.gold3, C.gold2], [C.teal, '#d8fbff', '#1d8fb0'], [C.green, '#d4ffb0', '#2b9a3b'], [C.orange, '#ffd0a0', '#b4521a']];
  const cv = canvas(TW * 2, TH * cols.length);
  const g = cv.getContext('2d');
  const shape = (f) => {
    // head with cut corners, body, swinging arm and legs
    const px = [];
    for (let y = 1; y <= 7; y++) for (let x = 3; x <= 11; x++) if (!((y === 1 || y === 7) && (x === 3 || x === 11))) px.push([x, y]);
    px.push([6, 0], [7, 0], [8, 0]); // tuft
    for (let y = 8; y <= 11; y++) for (let x = 4; x <= 9; x++) px.push([x, y]);
    if (f === 0) { px.push([10, 9], [11, 9], [12, 8], [2, 10], [3, 10]); px.push([4, 12], [3, 13], [2, 14], [3, 14], [8, 12], [9, 13], [10, 14], [11, 14]); }
    else { px.push([10, 10], [11, 11], [3, 9], [2, 8]); px.push([5, 12], [5, 13], [5, 14], [6, 14], [7, 12], [7, 13], [7, 14], [8, 14]); }
    return px;
  };
  cols.forEach(([body, hi, dk], ci) => {
    for (let f = 0; f < 2; f++) {
      const ox = f * TW, oy = ci * TH;
      const px = shape(f);
      g.fillStyle = C.ink;
      for (const [x, y] of px) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.fillRect(ox + x + dx + 1, oy + y + dy, 1, 1);
      for (const [x, y] of px) { g.fillStyle = y >= 8 && y <= 11 ? dk : body; g.fillRect(ox + x + 1, oy + y, 1, 1); }
      g.fillStyle = hi; g.fillRect(ox + 5, oy + 2, 4, 1); g.fillRect(ox + 4, oy + 3, 1, 2);
      g.fillStyle = C.white; g.fillRect(ox + 10, oy + 3, 2, 2);
      g.fillStyle = C.ink; g.fillRect(ox + 11, oy + 4, 1, 1); g.fillRect(ox + 9, oy + 6, 3, 1);
      g.fillStyle = C.gold; g.fillRect(ox + 7, oy + 9, 2, 2); // chest badge
    }
  });
  _troops = { cv, TW, TH, n: cols.length };
  return _troops;
}

let _swarm = null;
/** A crowd of chibi silhouettes with fists up: the iris hole, plus a 1px-dilated outline copy. */
function swarmMask() {
  if (_swarm) return _swarm;
  const MW = 44, MH = 30;
  const mask = canvas(MW, MH), mg = mask.getContext('2d');
  const fig = (x0, y0) => {
    mg.fillRect(x0 + 1, y0, 8, 8); mg.fillRect(x0, y0 + 1, 10, 6); // head
    mg.fillRect(x0 + 3, y0 - 2, 2, 2); mg.fillRect(x0 + 6, y0 - 1, 2, 1); // tufts
    mg.fillRect(x0 + 2, y0 + 8, 6, 6); // body
    mg.fillRect(x0 - 2, y0 + 3, 2, 6); mg.fillRect(x0 - 3, y0 + 1, 3, 3); // fist up L
    mg.fillRect(x0 + 10, y0 + 3, 2, 6); mg.fillRect(x0 + 10, y0 + 1, 3, 3); // fist up R
    mg.fillRect(x0 + 2, y0 + 14, 2, 3); mg.fillRect(x0 + 6, y0 + 14, 2, 3); // legs
  };
  mg.fillStyle = '#fff';
  fig(4, 11); fig(30, 11); fig(10, 7); fig(24, 7); fig(17, 4);
  mg.fillRect(6, 20, 32, 8); // the crowd's shoulders merge into one mass
  const ring = canvas(MW, MH), rg = ring.getContext('2d');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) rg.drawImage(mask, dx, dy);
  rg.globalCompositeOperation = 'source-in';
  rg.fillStyle = C.gold; rg.fillRect(0, 0, MW, MH);
  _swarm = { mask, ring, MW, MH, px: 22, py: 18 }; // pivot: centre figure's chest
  return _swarm;
}

let _card = null;
/** Card back, 14x20: ink border, gold frame, magenta field with a bolt. */
function cardBack() {
  if (_card) return _card;
  const cv = canvas(14, 20), g = cv.getContext('2d');
  g.fillStyle = C.ink; g.fillRect(0, 0, 14, 20);
  g.fillStyle = C.gold; g.fillRect(1, 1, 12, 18);
  g.fillStyle = C.pink2; g.fillRect(2, 2, 10, 16);
  g.fillStyle = '#d62f7f';
  for (let y = 2; y < 18; y++) for (let x = 2; x < 12; x++) if (((x + y) & 3) === 0) g.fillRect(x, y, 1, 1);
  bitmap(g, ['..yk', '.yk.', 'yyyy', '.yk.', 'yk..'], { y: C.gold3, k: C.gold2 }, 5, 7);
  g.fillStyle = C.gold3; g.fillRect(1, 1, 12, 1); g.fillRect(1, 1, 1, 18);
  _card = cv;
  return cv;
}

// ---------------------------------------------------------------------------
// transition kinds: { din, dout, init?(c, ph), draw(c, t, ph, step), cues? }

const KINDS = {};

KINDS.fade = {
  din: 0.16, dout: 0.18,
  draw(c, t, ph) {
    const a = ph === 'in' ? t : 1 - t;
    c.g.globalAlpha = Math.round(a * 4) / 4;
    c.g.fillStyle = C.navy; c.g.fillRect(0, 0, c.W, c.H);
    c.g.globalAlpha = 1;
  },
};

// Bayer-dithered diagonal dissolve with a lighter leading fringe (plain scene swaps)
KINDS.dither = {
  din: 0.34, dout: 0.36,
  draw(c, t, ph) {
    const { g, W, H } = c;
    const S = 2, nx = Math.ceil(W / S), ny = Math.ceil(H / S), K = 2.2;
    const tt = ph === 'in' ? t : 1 - t;
    if (tt <= 0) return;
    g.fillStyle = C.navy;
    if (tt >= 1) { g.fillRect(0, 0, W, H); return; }
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = 0; cx < nx; cx++) {
        const diag = (cx / nx + cy / ny) / 2;
        const f = tt * (1 + K) - diag * K;
        if (f <= 0) continue;
        if (f >= 1) { g.fillStyle = C.navy; g.fillRect(cx * S, cy * S, S, S); continue; }
        if (f > bayer(cx, cy)) { g.fillStyle = f < 0.35 ? C.navy3 : C.navy; g.fillRect(cx * S, cy * S, S, S); }
      }
    }
  },
};

// Green lab goo pours down from the top in drips (loading screen in/out)
KINDS.goo = {
  din: 0.62, dout: 0.55,
  cues: { in: [[0, 'slime', { pitch: 0.8, vol: 0.7 }], [0.55, 'bubble', { vol: 0.5 }], [0.85, 'splat', { vol: 0.5 }]], out: [[0, 'slime', { pitch: 1.15, vol: 0.6 }], [0.3, 'bubblePop', { vol: 0.4 }]] },
  init(c) {
    const { W, rnd } = c;
    const drips = [];
    for (let x = -2; x < W;) {
      const w = 3 + ((rnd() * 5) | 0);
      drips.push({ x, w, len: 6 + rnd() * 30, sp: 0.75 + rnd() * 0.7, fell: false });
      x += w + 2 + ((rnd() * 7) | 0);
    }
    const ph1 = rnd() * 6, ph2 = rnd() * 6;
    const wave = new Int8Array(W + 1);
    for (let x = 0; x <= W; x++) wave[x] = Math.round(2 * Math.sin(x * 0.17 + ph1) + 1.5 * Math.sin(x * 0.061 + ph2));
    const strands = [];
    for (let i = 0; i < Math.max(3, W / 40); i++) strands.push({ x: (rnd() * W) | 0, br: 0.35 + rnd() * 0.35 });
    c.st = { drips, wave, strands };
  },
  draw(c, t, ph, step) {
    const { g, W, H, st } = c;
    // body = columns from `top(x)` to `bot(x)`, plus drips hanging under `bot`
    let base, off;
    if (ph === 'in') { base = Math.round(-18 + smooth(t) * (H + 30)); off = 0; }
    else { base = H + 12; off = Math.round(easeIn(t) * (H + 60)); }
    const shape = (dy, col, shrink) => {
      g.fillStyle = col;
      const top = ph === 'in' ? 0 : off - 10;
      for (let x = 0; x < W; x++) {
        const y0 = ph === 'in' ? 0 : Math.max(0, top - st.wave[W - x] + shrink);
        const y1 = base + st.wave[x] + dy + off;
        if (y1 > y0) g.fillRect(x, y0, 1, y1 - y0);
      }
      for (const d of st.drips) {
        const L = Math.round(d.len * clamp01((ph === 'in' ? t * 1.9 : 1) * d.sp) ) - shrink;
        if (L <= 1) continue;
        const y = base + st.wave[Math.max(0, Math.min(W, d.x + 1))] + dy + off;
        g.fillRect(d.x, y - 2, d.w, L + 1);
        if (d.w > 2) g.fillRect(d.x + 1, y + L - 1, d.w - 2, 2); // rounded tip
      }
    };
    shape(1, C.g0, 0); // dark outline under the edge
    shape(0, C.g2, 0); // goo lip
    shape(-4, C.g1, 2); // deep body above the lip
    // shine: one pixel stripe down each drip and along the lip
    g.fillStyle = C.g3;
    for (const d of st.drips) {
      const L = Math.round(d.len * clamp01((ph === 'in' ? t * 1.9 : 1) * d.sp)) - 3;
      if (L > 2) g.fillRect(d.x + 1, base + st.wave[Math.max(0, Math.min(W, d.x + 1))] + off, 1, L);
      if (ph === 'in' && L > d.len * d.sp - 4 && !d.fell && t > 0.4) { d.fell = true; spawn(c, d.x + d.w / 2, base + L + 4, 0, 1, 10, [C.g3, C.g2, C.g1], 2, 0.35); }
    }
    for (let x = 0; x < W; x += 3) if ((hash(x) & 3) === 0) g.fillRect(x, base + st.wave[x] + off - 3, 2, 1);
    // bubbles drifting in the goo
    if (ph === 'in' ? t > 0.2 : t < 0.7) {
      const r = c.rnd;
      if (step % 2 === 0) spawn(c, r() * W, Math.min(H - 4, (ph === 'in' ? base : H) - 10 - r() * 40) + (ph === 'out' ? off : 0), 0, -1.2, 8, [C.g4, C.g3], 2, 0, 0);
    }
    // goo strands still clinging to the top as the sheet slides off
    if (ph === 'out') {
      g.fillStyle = C.g2;
      for (const s of st.strands) if (t < s.br) g.fillRect(s.x, 0, 1 + (s.x & 1), Math.max(0, off - 12 - st.wave[W - s.x]));
      else if (!s.gone) { s.gone = true; spawn(c, s.x, Math.max(2, off * 0.5), 0, 0.5, 12, [C.g3, C.g2], 2, 0.4); }
    }
  },
};

// A swarm-of-troops silhouette iris: the hole is a crowd, fists up, closing to nothing
KINDS.swarm = {
  din: 0.62, dout: 0.5,
  cues: { in: [[0, 'whoosh', { pitch: 0.75, vol: 0.6 }], [0.9, 'stamp', { vol: 0.7 }]], out: [[0, 'whoosh', { pitch: 1.2, vol: 0.5 }]] },
  draw(c, t, ph) {
    const { g, W, H } = c;
    const S = swarmMask();
    const tt = ph === 'in' ? t : 1 - t;
    g.fillStyle = C.navy; g.fillRect(0, 0, W, H);
    // faint pixel grid on the navy (lab floor tiles)
    g.fillStyle = C.navy2;
    for (let y = 7; y < H; y += 16) g.fillRect(0, y, W, 1);
    for (let x = 7; x < W; x += 16) g.fillRect(x, 0, 1, H);
    if (tt >= 0.97) return;
    const s0 = Math.max(W / 4.5, H / 4) * 1.25, s1 = 0.35;
    const s = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * smooth(tt / 0.97));
    const cx = Math.round(W / 2), cy = Math.round(H * 0.52);
    const dx = Math.round(cx - S.px * s), dy = Math.round(cy - S.py * s);
    const dw = Math.round(S.MW * s), dh = Math.round(S.MH * s);
    g.imageSmoothingEnabled = false;
    g.drawImage(S.ring, dx, dy, dw, dh);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(S.mask, dx, dy, dw, dh);
    g.globalCompositeOperation = 'source-over';
    if (ph === 'in' && tt > 0.86 && !c.st.burst) {
      c.st.burst = true;
      for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.283, v = 2 + c.rnd() * 3; spawn(c, cx, cy, Math.cos(a) * v, Math.sin(a) * v, 7 + ((c.rnd() * 4) | 0), [C.white, C.gold, C.pink, C.navy3], 2); }
    }
  },
};

// Riveted lab blast doors slam shut (teeth interlock, bolts shoot, steam), then open
KINDS.blast = {
  din: 0.66, dout: 0.62,
  cues: {
    in: [[0, 'whoosh', { pitch: 0.6, vol: 0.55 }], [0.55, 'boom', { vol: 0.55 }], [0.56, 'thud', { vol: 0.8 }], [0.66, 'latch', { vol: 0.8 }], [0.72, 'fizz', { vol: 0.4 }]],
    out: [[0, 'latch', { pitch: 0.85, vol: 0.7 }], [0.18, 'fizz', { vol: 0.5 }], [0.3, 'whoosh', { pitch: 0.55, vol: 0.5 }]],
  },
  init(c) {
    const { W, H } = c;
    const T = 6, Wh = Math.ceil(W / 2), W2 = Wh + T;
    const door = (phase) => {
      const cv = canvas(W2, H), g = cv.getContext('2d');
      g.fillStyle = C.st2; g.fillRect(0, 0, Wh, H);
      // diamond tread texture
      g.fillStyle = C.st3;
      for (let y = 2; y < H; y += 6) for (let x = 2 + ((y / 6) & 1) * 3; x < Wh - 12; x += 6) { g.fillRect(x, y, 2, 1); g.fillRect(x + 1, y + 1, 2, 1); }
      // panels with bevels
      const pw = Wh - 22;
      for (let y = 8; y < H - 16; y += Math.max(28, Math.round(H / 4))) {
        const ph = Math.min(Math.max(28, Math.round(H / 4)) - 6, H - 8 - y);
        g.fillStyle = C.st1; g.fillRect(8, y, pw, ph);
        bevel(g, 8, y, pw, ph, C.st0, C.st4);
        g.fillStyle = C.st3; g.fillRect(10, y + 2, pw - 4, 1);
      }
      // frame rivets
      for (let y = 4; y < H - 3; y += 10) { rivet(g, 2, y); rivet(g, Wh - 18, y); }
      for (let x = 8; x < Wh - 20; x += 12) { rivet(g, x, 2); rivet(g, x, H - 5); }
      // hazard band along the meeting edge + interlocking teeth
      hazard(g, Wh - 12, 0, 12, H);
      g.fillStyle = C.hk; g.fillRect(Wh - 13, 0, 1, H);
      for (let y = 0; y < H; y += 8) {
        if (((y / 8) & 1) !== phase) continue;
        hazard(g, Wh, y, T, 8);
        g.fillStyle = C.hk; g.fillRect(Wh + T - 1, y, 1, 8); g.fillRect(Wh, y + 7, T, 1);
      }
      // bolt slots
      for (const k of [-1, 0, 1]) { const y = Math.round(H / 2 + k * H * 0.22) - 2; g.fillStyle = C.ink; g.fillRect(Wh - 24, y - 1, 12, 6); g.fillStyle = C.st0; g.fillRect(Wh - 23, y, 10, 4); }
      // lamp housing
      g.fillStyle = C.ink; g.fillRect(Wh - 30, 6, 9, 6);
      return cv;
    };
    const L = door(0), R0 = door(1);
    const R = canvas(W2, H), rg = R.getContext('2d');
    rg.translate(W2, 0); rg.scale(-1, 1); rg.drawImage(R0, 0, 0);
    c.st = { L, R, T, Wh, W2 };
  },
  draw(c, t, ph, step) {
    const { g, W, H, st } = c;
    let o, bolts, shake = 0;
    if (ph === 'in') {
      o = t < 0.55 ? 1 - easeIn(t / 0.55) : 0;
      bolts = clamp01((t - 0.62) / 0.16);
      if (t >= 0.55) shake = Math.round(3 * (1 - (t - 0.55) / 0.45)) * (step & 1 ? 1 : -1);
    } else {
      bolts = 1 - clamp01(t / 0.22);
      o = smooth(clamp01((t - 0.25) / 0.75));
    }
    const off = Math.round(o * (st.W2 + 6));
    g.save();
    g.translate(0, shake);
    g.drawImage(st.L, -off, -0);
    g.drawImage(st.R, W - st.W2 + off, 0);
    // bolts slide out of the right door into the left one
    const bl = Math.round(bolts * 30);
    if (bl > 0 && off === 0) {
      for (const k of [-1, 0, 1]) {
        const y = Math.round(H / 2 + k * H * 0.22) - 2;
        const x = st.Wh + 14 - bl;
        g.fillStyle = C.ink; g.fillRect(x - 1, y - 1, bl + 2, 6);
        g.fillStyle = C.st5; g.fillRect(x, y, bl, 4);
        g.fillStyle = '#e8eef8'; g.fillRect(x, y, bl, 1);
        g.fillStyle = C.gold; g.fillRect(x, y, 2, 4);
      }
    }
    // warning lamps blink while the doors move
    const lit = (step >> 1) & 1;
    const lamp = (x) => { g.fillStyle = lit ? (ph === 'in' ? C.amber : C.red) : '#5a3a10'; g.fillRect(x, 7, 7, 4); if (lit) { g.fillStyle = C.gold3; g.fillRect(x + 1, 7, 2, 1); } };
    lamp(st.Wh - 29 - off);
    lamp(W - st.W2 + off + st.W2 - st.Wh + 22);
    g.restore();
    // steam from the seam at the slam and as the locks release
    const seam = (n) => { for (let i = 0; i < n; i++) spawn(c, W / 2 + (c.rnd() - 0.5) * 8, c.rnd() * H, (c.rnd() - 0.5) * 3.5, -0.4 - c.rnd(), 9 + ((c.rnd() * 6) | 0), [C.white, C.steam, C.steam2], 2, -0.02, 0.35); };
    if (ph === 'in' && t >= 0.55 && !st.slam) { st.slam = true; seam(36); for (let i = 0; i < 14; i++) spawn(c, W / 2 + (c.rnd() - 0.5) * 30, H - 2, (c.rnd() - 0.5) * 4, -1 - c.rnd() * 2, 8, [C.dust, C.dust2], 2, 0.25); }
    if (ph === 'out' && t >= 0.16 && !st.hiss) { st.hiss = true; seam(30); }
  },
};

// The troops stampede across the screen, kicking up dust; the navy floods in behind them
KINDS.stampede = {
  din: 0.8, dout: 0.5,
  cues: { in: [[0, 'whoosh', { pitch: 0.7, vol: 0.5 }], [0.08, 'drum', { vol: 0.45 }], [0.25, 'kick', { vol: 0.5 }], [0.42, 'drum', { vol: 0.45 }], [0.58, 'kick', { vol: 0.5 }], [0.75, 'drum', { vol: 0.4 }]] },
  init(c) {
    const { W, H, rnd } = c;
    const lanes = [];
    const n = Math.max(6, Math.round(H / 14));
    const bh = H / n;
    for (let i = 0; i < n; i++) {
      const big = i % 3 === 2 && H > 120 ? 2 : 1;
      const runners = [];
      const k = 2 + ((rnd() * 2) | 0);
      for (let j = 0; j < k; j++) runners.push({ x0: -18 * big - j * (20 + rnd() * 26) - rnd() * W * 0.35, col: (rnd() * 5) | 0, ph: (rnd() * 2) | 0, sp: 0.9 + rnd() * 0.25 });
      lanes.push({ y0: Math.round(i * bh), y1: Math.round((i + 1) * bh), big, runners });
    }
    c.st = { lanes };
  },
  draw(c, t, ph, step) {
    const { g, W, H, st } = c;
    const T = troopSheet();
    if (ph === 'out') { KINDS.dither.draw(c, t, 'out'); return; }
    g.imageSmoothingEnabled = false;
    for (const L of st.lanes) {
      // where each runner is: everyone has crossed by t = 1
      let tail = Infinity;
      const xs = L.runners.map((r) => {
        const end = W + 26 * L.big;
        const x = Math.round(r.x0 + (end - r.x0) * clamp01(t * r.sp * 1.12));
        tail = Math.min(tail, x);
        return x;
      });
      const fillTo = t >= 1 ? W : Math.max(0, tail - 4);
      g.fillStyle = C.navy; g.fillRect(0, L.y0, fillTo, L.y1 - L.y0);
      // dithered dust edge behind the slowest runner
      if (t < 1) for (let y = L.y0; y < L.y1; y += 2) for (let x = fillTo; x < fillTo + 12; x += 2) if ((1 - (x - fillTo) / 12) * 0.9 > bayer(x >> 1, y >> 1)) { g.fillStyle = (x + y) & 2 ? C.navy : C.navy3; g.fillRect(x, y, 2, 2); }
      L.runners.forEach((r, j) => {
        const x = xs[j];
        if (x > W + 4 || x < -T.TW * L.big) return;
        const f = (step + r.ph) & 1;
        const y = L.y1 - T.TH * L.big - (f ? L.big : 0);
        g.drawImage(T.cv, f * T.TW, r.col * T.TH, T.TW, T.TH, x, y, T.TW * L.big, T.TH * L.big);
        if (f) spawn(c, x + 2, L.y1 - 2, -1.5 - c.rnd() * 2, -0.6 - c.rnd(), 6, [C.dust, C.dust2], L.big + 1, 0.12);
      });
    }
  },
};

// A riveted lab sign slab drops over the screen, cracks from its bolt emblem and falls away in chunks
KINDS.crack = {
  din: 0.42, dout: 0.85,
  cues: { in: [[0, 'whoosh', { pitch: 0.6, vol: 0.4 }], [0.98, 'thud', { vol: 0.8 }]], out: [[0, 'crunch', { vol: 0.7 }], [0.18, 'crunch', { pitch: 0.8, vol: 0.6 }], [0.32, 'shatter', { vol: 0.7 }], [0.5, 'thud', { pitch: 0.7, vol: 0.4 }]] },
  init(c) {
    const { W, H, rnd } = c;
    const cv = canvas(W, H), g = cv.getContext('2d');
    g.fillStyle = C.navy2; g.fillRect(0, 0, W, H);
    for (let i = 0; i < (W * H) / 40; i++) { g.fillStyle = rnd() < 0.5 ? C.navy : C.navy3; g.fillRect((rnd() * W) | 0, (rnd() * H) | 0, 1 + (rnd() < 0.2), 1); }
    hazard(g, 0, 0, W, 6); hazard(g, 0, H - 6, W, 6, true);
    g.fillStyle = C.ink; g.fillRect(0, 6, W, 1); g.fillRect(0, H - 7, W, 1);
    bevel(g, 0, 7, W, H - 14, C.navy4, C.ink);
    bevel(g, 4, 11, W - 8, H - 22, C.ink, C.navy3);
    for (let x = 8; x < W - 6; x += 14) { rivet(g, x, 9); rivet(g, x, H - 12); }
    for (let y = 22; y < H - 16; y += 14) { rivet(g, 1, y); rivet(g, W - 4, y); }
    // the emblem: a big pixel bolt on a plate
    const k = Math.max(2, Math.floor(Math.min(W, H) * 0.32 / 15));
    const bw = 12 * k, bh = 15 * k, bx = Math.round(W / 2 - bw / 2), by = Math.round(H / 2 - bh / 2);
    g.fillStyle = C.ink; g.fillRect(bx - 2 * k, by - k, bw + 4 * k, bh + 2 * k);
    g.fillStyle = C.navy3; g.fillRect(bx - k, by, bw + 2 * k, bh);
    bitmap(g, BOLT, { k: C.ink, y: C.gold }, bx, by, k);
    g.fillStyle = C.gold3;
    BOLT.forEach((r, y) => { const x = r.indexOf('y'); if (x >= 0) g.fillRect(bx + x * k, by + y * k, k, k); });
    // crack rays from the emblem out past the edges, and the wedge chunks between them
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H);
    const n = 9, rays = [];
    const a0 = rnd() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.283 + (rnd() - 0.5) * 0.4;
      const pts = [[cx, cy]];
      for (let d = 6 + rnd() * 6; d < R; d += 8 + rnd() * 12) {
        const j = (rnd() - 0.5) * 8;
        pts.push([Math.round(cx + Math.cos(a) * d - Math.sin(a) * j), Math.round(cy + Math.sin(a) * d + Math.cos(a) * j)]);
      }
      pts.push([cx + Math.cos(a) * R * 1.2, cy + Math.sin(a) * R * 1.2]);
      rays.push({ a, pts });
    }
    const chunks = rays.map((r, i) => {
      const r2 = rays[(i + 1) % n];
      const am = r.a + (((r2.a - r.a) % 6.283) + 6.283) % 6.283 / 2;
      const poly = [...r.pts, [cx + Math.cos(am) * R * 2.5, cy + Math.sin(am) * R * 2.5], ...[...r2.pts].reverse()];
      return { poly, am, vy: -0.12 - rnd() * 0.12, rot: (rnd() - 0.5) * 0.7, push: 0.08 + rnd() * 0.12, delay: rnd() * 0.18 };
    });
    c.st = { cv, rays, chunks, cx, cy };
  },
  draw(c, t, ph) {
    const { g, W, H, st } = c;
    g.imageSmoothingEnabled = false;
    if (ph === 'in') {
      const y = Math.round(-H + easeIn(t) * H);
      g.drawImage(st.cv, 0, y);
      ditherShadow(g, 0, y + H, W, 6, true);
      if (t >= 1 && !st.dust) { st.dust = true; for (let i = 0; i < 30; i++) spawn(c, c.rnd() * W, H - 3, (c.rnd() - 0.5) * 5, -1 - c.rnd() * 2.5, 9, [C.steam, C.dust, C.dust2], 2, 0.2, 0.2); }
      return;
    }
    const tc = 0.3;
    if (t < tc) {
      g.drawImage(st.cv, 0, 0);
      const k = t / tc;
      for (const r of st.rays) {
        const m = Math.max(1, Math.round((r.pts.length - 1) * k));
        for (let i = 0; i < m; i++) line(g, r.pts[i], r.pts[i + 1]);
      }
      if (c.rnd() < 0.8) spawn(c, st.cx + (c.rnd() - 0.5) * 30, st.cy + (c.rnd() - 0.5) * 30, (c.rnd() - 0.5) * 4, -2, 7, [C.gold, C.navy3], 2, 0.4);
      return;
    }
    const u0 = (t - tc) / (1 - tc);
    for (const ch of st.chunks) {
      const u = clamp01((u0 - ch.delay) / (1 - ch.delay));
      const dx = Math.round(Math.cos(ch.am) * ch.push * W * u);
      const dy = Math.round((ch.vy * u + 1.6 * u * u) * H);
      const rot = Math.round(ch.rot * u * 20) / 20;
      g.save();
      g.translate(st.cx + dx, st.cy + dy); g.rotate(rot); g.translate(-st.cx, -st.cy);
      g.beginPath();
      ch.poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.save(); g.clip(); g.drawImage(st.cv, 0, 0); g.restore();
      g.lineWidth = 1.5; g.strokeStyle = C.ink; g.stroke();
      g.restore();
    }
  },
};
/** 1px pixel line with a highlight pixel beside it (cracks). */
function line(g, a, b) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(a[0] + ((b[0] - a[0]) * i) / n), y = Math.round(a[1] + ((b[1] - a[1]) * i) / n);
    g.fillStyle = C.ink; g.fillRect(x, y, 1, 1);
    g.fillStyle = C.navy4; g.fillRect(x + 1, y + 1, 1, 1);
  }
}

// Old TV switching off: interference bars, squeeze to a white line, line to a dot, black
KINDS.tv = {
  din: 0.46, dout: 0.2,
  cues: { in: [[0, 'flick', { vol: 0.6 }], [0.3, 'zap', { pitch: 0.55, vol: 0.35 }], [0.72, 'blip', { pitch: 0.5, vol: 0.5 }]] },
  draw(c, t, ph, step) {
    const { g, W, H, rnd } = c;
    if (ph === 'out') { g.globalAlpha = Math.round((1 - t) * 3) / 3; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; return; }
    const mid = Math.round(H / 2);
    if (t < 0.3) {
      const k = t / 0.3;
      g.globalAlpha = Math.round(k * 3) * 0.1; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      for (let i = 0; i < 3 + k * 6; i++) {
        const y = (rnd() * H) | 0, hh = 1 + ((rnd() * 4) | 0), sh = ((rnd() - 0.5) * 8) | 0;
        g.globalAlpha = 0.5; g.fillStyle = rnd() < 0.5 ? '#000' : C.white; g.fillRect(0, y, W, hh); g.globalAlpha = 0.8;
        g.fillStyle = '#ff2a4a'; g.fillRect(sh, y - 1, W, 1); g.fillStyle = '#2affea'; g.fillRect(-sh, y + hh, W, 1);
        g.globalAlpha = 1;
      }
      for (let y = step & 1; y < H; y += 3) { g.globalAlpha = 0.18; g.fillStyle = '#000'; g.fillRect(0, y, W, 1); }
      g.globalAlpha = 1;
      return;
    }
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (t < 0.72) {
      const v = smooth((t - 0.3) / 0.42);
      const h2 = Math.max(1, Math.round((H / 2) * (1 - v)));
      g.fillStyle = v > 0.5 ? C.white : C.teal2;
      g.fillRect(0, mid - h2, W, h2 * 2);
      g.fillStyle = '#000';
      for (let y = mid - h2 + 1; y < mid + h2; y += 2) { g.globalAlpha = 0.5 * (1 - v); g.fillRect(0, y, W, 1); }
      g.globalAlpha = 1;
      g.fillStyle = C.teal; g.fillRect(0, mid - h2 - 1, W, 1); g.fillRect(0, mid + h2, W, 1);
      return;
    }
    const u = (t - 0.72) / 0.24;
    if (u >= 1) return;
    const w = Math.max(3, Math.round(W * (1 - easeOut(u))));
    const x = Math.round(W / 2 - w / 2);
    g.fillStyle = C.teal; g.fillRect(x + 2, mid - 2, Math.max(1, w - 4), 1); g.fillRect(x + 2, mid + 1, Math.max(1, w - 4), 1);
    g.fillStyle = C.white; g.fillRect(x, mid - 1, w, 2);
    if (w <= 8) { g.fillStyle = C.white; g.fillRect(W / 2 - 1, mid - 3, 2, 6); g.fillRect(W / 2 - 4, mid - 1, 8, 2); }
  },
};

// A rolling interference band sweeps down (the channel lands)
KINDS.roll = {
  din: 0.1, dout: 0.42,
  cues: { out: [[0, 'flick', { pitch: 1.3, vol: 0.4 }]] },
  draw(c, t, ph, step) {
    const { g, W, H, rnd } = c;
    const bh = Math.round(H * 0.2);
    const y0 = Math.round(-bh + t * (H + bh * 2)) - bh;
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + bh); y++) { g.globalAlpha = (y & 1) ? 0.62 : 0.32; g.fillStyle = '#000'; g.fillRect(0, y, W, 1); }
    g.globalAlpha = 0.9;
    const sh = 2 + (step & 1);
    g.fillStyle = '#ff2a4a'; g.fillRect(sh, y0 - 2, W, 1);
    g.fillStyle = '#2affea'; g.fillRect(-sh, y0 + bh + 1, W, 1);
    g.fillStyle = C.white; g.fillRect(0, y0 - 1, W, 1);
    g.globalAlpha = 1;
    // torn specks above the band
    g.fillStyle = C.white;
    for (let i = 0; i < 40; i++) g.fillRect((rnd() * W) | 0, y0 - 3 - ((rnd() * 5) | 0), 1 + ((rnd() * 3) | 0), 1);
    if (t < 0.85) for (let y = step % 3; y < H; y += 3) { g.globalAlpha = 0.08; g.fillStyle = '#000'; g.fillRect(0, y, W, 1); }
    g.globalAlpha = 1;
  },
};

// ---- tab panel kinds -------------------------------------------------------

/** Mask x art: fill the dithered sweep, then paint the art through it. */
function maskedSweep(c, t, ph, art, edgeCol) {
  const { g } = c;
  sweepMask(c, t, ph, c.dir || 1, 10, '#fff');
  g.globalCompositeOperation = 'source-in';
  g.drawImage(art, 0, 0);
  g.globalCompositeOperation = 'source-over';
  if (edgeCol) {
    // bright fizz pixels riding the edge
    const { W, H } = c;
    const e = ph === 'in' ? t * (W + 16) : -16 + t * (W + 32);
    const x = c.dir > 0 ? e : W - e;
    for (let i = 0; i < 10; i++) { const y = (c.rnd() * H) | 0; g.fillStyle = i & 1 ? edgeCol : C.white; g.fillRect(Math.round(x + (c.rnd() - 0.5) * 12), y, 2, 2); }
  }
}

KINDS.slide = {
  din: 0.2, dout: 0.24,
  cues: { in: [[0, 'whoosh', { pitch: 1.3, vol: 0.3, gap: 0.1 }]] },
  init(c) {
    const { W, H } = c;
    const art = canvas(W, H), g = art.getContext('2d');
    g.fillStyle = C.navy; g.fillRect(0, 0, W, H);
    g.fillStyle = C.navy2;
    for (let y = 0; y < H; y++) for (let x = -(y % 12); x < W; x += 12) g.fillRect(x, y, 4, 1);
    g.fillStyle = C.navy3; g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1);
    c.st = { art };
  },
  draw(c, t, ph) { maskedSweep(c, t, ph, c.st.art, C.teal2); },
};

KINDS.chevron = {
  din: 0.2, dout: 0.24,
  cues: { in: [[0, 'whoosh', { pitch: 1.5, vol: 0.3, gap: 0.1 }], [0.5, 'tick', { vol: 0.4 }]] },
  init(c) {
    const { W, H, dir } = c;
    const art = canvas(W, H), g = art.getContext('2d');
    g.fillStyle = '#2a1458'; g.fillRect(0, 0, W, H);
    const mid = H / 2;
    for (let y = 0; y < H; y++) {
      const o = Math.round(Math.abs(y - mid) * 0.8) * (dir > 0 ? -1 : 1);
      for (let x = -32; x < W + 32; x += 18) {
        g.fillStyle = C.gold; g.fillRect(x + o, y, 5, 1);
        g.fillStyle = C.gold2; g.fillRect(x + o + (dir > 0 ? -1 : 5), y, 1, 1);
        g.fillStyle = C.pink; g.fillRect(x + o + 9, y, 2, 1);
      }
    }
    c.st = { art };
  },
  draw(c, t, ph) { maskedSweep(c, t, ph, c.st.art, C.gold); },
};

// shop: a bunker hatch - two diamond-plate halves slam together, a latch drops across the seam
KINDS.hatch = {
  din: 0.22, dout: 0.24,
  cues: { in: [[0, 'swing', { pitch: 0.8, vol: 0.4, gap: 0.1 }], [0.95, 'latch', { vol: 0.55 }]], out: [[0, 'latch', { pitch: 1.2, vol: 0.4 }]] },
  init(c) {
    const { W, H } = c;
    const ph = Math.ceil(H / 2) + 2;
    const plate = (top) => {
      const cv = canvas(W, ph), g = cv.getContext('2d');
      g.fillStyle = '#4a5470'; g.fillRect(0, 0, W, ph);
      g.fillStyle = '#6a7592';
      for (let y = 2; y < ph; y += 5) for (let x = ((y / 5) & 1) * 4 + 1; x < W; x += 8) { g.fillRect(x, y, 2, 1); g.fillRect(x + 1, y + 1, 2, 1); }
      const ey = top ? ph - 6 : 0;
      hazard(g, 0, ey, W, 6, !top);
      g.fillStyle = C.hk; g.fillRect(0, top ? ph - 7 : 6, W, 1); g.fillRect(0, top ? ph - 1 : 0, W, 1);
      for (let x = 5; x < W - 3; x += 16) rivet(g, x, top ? ph - 11 : 8);
      g.fillStyle = '#2f3750'; g.fillRect(0, top ? 0 : ph - 1, W, 1);
      return cv;
    };
    c.st = { top: plate(true), bot: plate(false), ph };
  },
  draw(c, t, ph) {
    const { g, W, H, st } = c;
    const e = ph === 'in' ? easeIn(t) : 1 - smooth(t);
    const y = Math.round((e - 1) * st.ph);
    g.drawImage(st.top, 0, y);
    g.drawImage(st.bot, 0, H - st.ph - y);
    if (e < 1) { ditherShadow(g, 0, y + st.ph, W, 5, true); ditherShadow(g, 0, H - st.ph - y, W, 5, false); }
    if (e >= 1 || (ph === 'out' && t < 0.25)) {
      // latch clamp bridging the seam
      const lx = Math.round(W / 2 - 9), ly = Math.round(H / 2 - 6);
      g.fillStyle = C.ink; g.fillRect(lx - 1, ly - 1, 20, 14);
      g.fillStyle = C.gold2; g.fillRect(lx, ly, 18, 12);
      g.fillStyle = C.gold; g.fillRect(lx, ly, 18, 3); g.fillRect(lx + 6, ly + 3, 6, 6);
      g.fillStyle = C.gold3; g.fillRect(lx + 1, ly, 6, 1);
      rivet(g, lx + 2, ly + 7); rivet(g, lx + 13, ly + 7);
    }
  },
};

// lab: a white-steel roller shutter rolls down with a teal stripe and a handle
KINDS.shutter = {
  din: 0.24, dout: 0.24,
  cues: { in: [[0, 'rattle', { vol: 0.35, gap: 0.1 }], [0.9, 'thud', { vol: 0.35 }]], out: [[0, 'rattle', { pitch: 1.25, vol: 0.3 }]] },
  init(c) {
    const { W, H } = c;
    const cv = canvas(W, H), g = cv.getContext('2d');
    const rows = [C.lab3, C.lab2, C.lab2, C.lab2, C.lab1, C.lab0];
    for (let y = 0; y < H; y++) { g.fillStyle = rows[y % 6]; g.fillRect(0, y, W, 1); }
    g.fillStyle = C.lab1; for (let y = 2; y < H; y += 6) for (let x = 10; x < W - 10; x += 24) g.fillRect(x, y, 4, 1); // vent slots
    g.fillStyle = C.lab0; g.fillRect(0, 0, 3, H); g.fillRect(W - 3, 0, 3, H);
    // bottom bar
    g.fillStyle = C.ink; g.fillRect(0, H - 8, W, 8);
    g.fillStyle = C.lab0; g.fillRect(0, H - 7, W, 6);
    g.fillStyle = C.teal; g.fillRect(0, H - 6, W, 2);
    g.fillStyle = C.teal2; g.fillRect(0, H - 6, W, 1);
    g.fillStyle = C.gold; g.fillRect(Math.round(W / 2 - 6), H - 4, 12, 2);
    g.fillStyle = C.gold2; g.fillRect(Math.round(W / 2 - 6), H - 2, 12, 1);
    c.st = { cv };
  },
  draw(c, t, ph, step) {
    const { g, W, H, st } = c;
    let e = ph === 'in' ? easeIn(t) : 1 - easeIn(t);
    let bump = ph === 'in' && t >= 1 ? 0 : 0;
    if (ph === 'in' && t > 0.85 && t < 1) bump = -2;
    const y = Math.round((e - 1) * H) + bump;
    g.drawImage(st.cv, 0, y);
    if (y + H < H) ditherShadow(g, 0, y + H, W, 6, true);
    if (ph === 'in' && t >= 1 && !st.d) { st.d = true; for (let i = 0; i < 12; i++) spawn(c, c.rnd() * W, H - 2, (c.rnd() - 0.5) * 3, -1 - c.rnd(), 6, [C.lab3, C.lab1], 2, 0.2); }
    void step;
  },
};

// cards: card backs are dealt across the panel, then flip away
KINDS.deal = {
  din: 0.24, dout: 0.26,
  cues: { in: [[0, 'flick', { vol: 0.4, gap: 0.05 }], [0.35, 'flick', { pitch: 1.2, vol: 0.35, gap: 0.05 }], [0.7, 'cardPick', { vol: 0.35 }]], out: [[0, 'flick', { pitch: 1.3, vol: 0.35, gap: 0.05 }]] },
  init(c) {
    const { W, H, rnd, dir } = c;
    const cols = Math.ceil(W / 13) + 1, rows = Math.ceil(H / 19) + 1;
    const cards = [];
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const u = q / cols;
      cards.push({ x: q * 13 - 1, y: r * 19 - 1, d: (dir > 0 ? u : 1 - u) * 0.6 + (r / rows) * 0.15 + rnd() * 0.1 });
    }
    c.st = { cards };
  },
  draw(c, t, ph) {
    const { g, st, dir } = c;
    const cb = cardBack();
    for (const k of st.cards) {
      const p = clamp01((t * 1.6 - k.d) / 0.45);
      if (ph === 'in') {
        if (p <= 0) continue;
        const e = 1 - easeOut(p);
        g.drawImage(cb, Math.round(k.x - dir * 26 * e), Math.round(k.y - 8 * e));
      } else {
        if (p >= 1) continue;
        const w = Math.round(14 * (1 - p));
        if (w <= 0) continue;
        g.drawImage(cb, 0, 0, 14, 20, k.x + ((14 - w) >> 1), k.y, w, 20);
        if (p > 0.3) { g.globalAlpha = 0.4; g.fillStyle = C.ink; g.fillRect(k.x + ((14 - w) >> 1), k.y, w, 20); g.globalAlpha = 1; }
      }
    }
  },
};

const TAB_KIND = { shop: 'hatch', cards: 'deal', lab: 'shutter', pass: 'chevron', battle: 'slide' };

// ---------------------------------------------------------------------------
// the stage: one low-res canvas, a 20 fps step clock and the particle pool

function artPx() {
  const m = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(2, Math.min(4, Math.round(m / 180)));
}

class Stage {
  constructor(z, block) {
    this.z = z; this.block = block;
    this.cv = null; this.c = null; this.id = 0; this.kind = null; this.fin = null;
  }
  mount(host, rect, before = null) {
    const P = artPx();
    const w = rect ? rect.w : host.clientWidth, hh = rect ? rect.h : host.clientHeight;
    const W = Math.max(8, Math.ceil(w / P)), H = Math.max(8, Math.ceil(hh / P));
    if (!this.cv) {
      this.cv = document.createElement('canvas');
      Object.assign(this.cv.style, { position: 'absolute', left: '0', top: '0', imageRendering: 'pixelated', zIndex: String(this.z) });
    }
    const cv = this.cv;
    const sized = cv.width === W && cv.height === H;
    if (!sized) { cv.width = W; cv.height = H; }
    Object.assign(cv.style, { left: (rect ? rect.x : 0) + 'px', top: (rect ? rect.y : 0) + 'px', width: W * P + 'px', height: H * P + 'px' });
    if (cv.parentNode !== host) { if (before && before.parentNode === host) host.insertBefore(cv, before); else host.appendChild(cv); }
    if (!this.c || !sized) {
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      this.c = { g, W, H, P, parts: this.c?.parts ?? makeParts(), st: {}, rnd: Math.random, dir: 1, kind: null };
    }
    return this.c;
  }
  /** Run one phase of a kind. Resolves at its end (a newer run resolves the older one at once). */
  run(host, kindName, ph, o = {}) {
    if (this.fin) this.fin();
    const name = reduced() ? 'fade' : KINDS[kindName] ? kindName : 'dither';
    const K = KINDS[name];
    const wasUp = this.cv?.parentNode === host;
    const c = this.mount(host, o.rect, o.before);
    const keep = ph === 'out' && wasUp && c.kind === name;
    c.dir = o.dir ?? c.dir ?? 1;
    if (!keep) {
      c.rnd = rng((Math.random() * 1e9) | 0);
      c.st = {};
      clearParts(c);
      K.init?.(c, ph);
    }
    c.kind = name;
    const cv = this.cv;
    cv.style.pointerEvents = this.block && ph === 'in' ? 'auto' : 'none';
    const dur = (ph === 'in' ? K.din : K.dout) * (o.speed ?? 1);
    const nSteps = Math.max(1, Math.round(dur * FPS));
    const cues = (K.cues?.[ph] ?? []).slice();
    const id = ++this.id;
    return new Promise((res) => {
      let last = -1, done = false;
      const t0 = performance.now();
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        if (this.fin === finish) this.fin = null;
        if (ph !== 'in' && this.id === id) { cv.remove(); clearParts(c); c.kind = null; }
        res();
      };
      this.fin = finish;
      const safety = setTimeout(() => { if (this.id === id && !done) { frame(nSteps); finish(); } }, dur * 1000 + 1200);
      const frame = (s) => {
        const t = Math.min(1, s / nSteps);
        const n = Math.min(3, s - last);
        for (let i = 0; i < n; i++) stepParts(c);
        last = s;
        const g = c.g;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, c.W, c.H);
        try { K.draw(c, t, ph, s); } catch (e) { console.error('transition', name, e); }
        drawParts(c);
        while (cues.length && cues[0][0] <= t) { const [, snd, so] = cues.shift(); if (!o.silent) sfx(snd, so); }
        return t;
      };
      const tick = (now) => {
        if (done || this.id !== id) { finish(); return; }
        const s = Math.floor(((now - t0) / 1000) * FPS);
        if (s !== last && frame(Math.min(s, nSteps)) >= 1) { finish(); return; }
        requestAnimationFrame(tick);
      };
      frame(0);
      requestAnimationFrame(tick);
    });
  }
  clear() {
    this.id++;
    if (this.fin) this.fin();
    this.cv?.remove();
    if (this.c) { clearParts(this.c); this.c.kind = null; }
  }
}

const screen = new Stage(70, true);
const tabStage = new Stage(5, false);
const app = () => document.getElementById('app');

export const tx = {
  /** Cover the whole screen with `kind`; resolves once covered (the overlay stays up). */
  cover(kind, o = {}) { return screen.run(app(), kind, 'in', o); },
  /** Uncover (defaults to the kind that covered); resolves when gone. */
  reveal(kind, o = {}) { return screen.run(app(), kind ?? screen.c?.kind ?? 'dither', 'out', o); },
  /** A one-shot effect over the screen (no cover). */
  play(kind, o = {}) { return screen.run(app(), kind, 'out', o); },
  /** Drop the overlay at once. */
  clear() { screen.clear(); },
  get covering() { return !!screen.cv?.parentNode; },
};

/**
 * Tab switch over the panel area of `host` (rect in host px). Resolves when the
 * panel is covered (swap the content then); the reveal then plays by itself.
 */
export function tabSwap(host, rect, tab, dir = 1, before = null) {
  const kind = TAB_KIND[tab] ?? 'slide';
  const p = tabStage.run(host, kind, 'in', { rect, dir, before });
  const my = tabStage.id;
  return p.then(() => {
    // a newer switch took over the stage: it plays its own reveal
    if (tabStage.id === my) tabStage.run(host, kind, 'out', { rect, dir, before });
  });
}
export function clearTabSwap() { tabStage.clear(); }
