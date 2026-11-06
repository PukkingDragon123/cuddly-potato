// QUEST BOARD pixel art (ui/home/questBoard.js): everything is painted texel by texel on tiny
// canvases (seeded, so it looks the same every time) and handed to CSS as custom properties
// (url(data:...)), scaled up by --px with nearest-neighbour filtering. Made once, on first open.
//
//   --qb-cork        tileable cork (granules in five tones, old pin holes)
//   --qb-wood        walnut frame, 9-slice (grain along each bar, mitred corners, brass nails)
//   --qb-plank       header sign plank, 9-slice (nails, burnt edges)
//   --qb-paper-*     notes, 9-slice: cream (dog-eared), sticky yellow / pink / blue (curled foot),
//                    index card, manila folder (with tab), kraft (the done pile)
//   --qb-tape / --qb-tape-l / --qb-tape-r   masking tape: straight, and drawn tilted (art only)
//   --qb-pin-*       push pins (red, blue, green, yellow) with needle + cork shadow
//   --qb-coffee      coffee ring stain (broken ring, drip, splats)
//   --qb-doodle-*    marker doodles on torn notebook scraps (panther, flask, toilet, money guy)
//   --qb-ink         worn rubber-stamp ink (mask)
//   --qb-lockbit-*   padlock shards for the unlock reveal (body halves, shackle)
//
// Also: tallyURL(done, total) (hand-drawn tally marks / a pen checkbox) and drawString() (the red
// string between pins, drawn per layout on a canvas).

const INK = '#1c1208';
const hex = (c) => { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const shade = (c, f) => (f >= 0 ? mix(c, '#ffffff', f) : mix(c, '#000000', -f));

/** Tiny pixel painter. */
function painter(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(w, h);
  const d = img.data;
  const P = {
    w, h, c,
    set(x, y, col, a = 255) {
      x |= 0; y |= 0;
      if (!col || x < 0 || y < 0 || x >= w || y >= h) return;
      const [R, G, B] = hex(col);
      const i = (y * w + x) * 4;
      if (a >= 255 || d[i + 3] === 0) { d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = a; return; }
      // alpha-over onto what's there
      const t = a / 255;
      d[i] = d[i] * (1 - t) + R * t; d[i + 1] = d[i + 1] * (1 - t) + G * t; d[i + 2] = d[i + 2] * (1 - t) + B * t; d[i + 3] = Math.min(255, d[i + 3] + a);
    },
    alpha(x, y) { return x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]; },
    clear(x, y) { if (x >= 0 && y >= 0 && x < w && y < h) d[(y * w + x) * 4 + 3] = 0; },
    rect(x, y, rw, rh, col, a) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) P.set(x + i, y + j, col, a); },
    line(x0, y0, x1, y1, col, a, wid = 1) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        P.set(x0, y0, col, a);
        if (wid > 1) { P.set(x0 + 1, y0, col, a); P.set(x0, y0 + 1, col, a); }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    poly(pts, col, a, wid) { for (let i = 1; i < pts.length; i++) P.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col, a, wid); },
    done() { g.putImageData(img, 0, 0); return c.toDataURL(); },
  };
  return P;
}

// ---------------------------------------------------------------------------- cork

function corkTile(n = 64) {
  const P = painter(n, n);
  const R = rng(7);
  const base = '#b27843';
  const tones = ['#c48a50', '#a36a37', '#93602f', '#d29b5e', '#83532a', '#bd8249'];
  P.rect(0, 0, n, n, base);
  // dithered warm / cool blotches so the board isn't flat
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = Math.sin(x * 0.21 + y * 0.07) + Math.sin(y * 0.17 - x * 0.05 + 1.3);
    if (v > 1.1 && R() < 0.35) P.set(x, y, '#ba7f48');
    if (v < -1.2 && R() < 0.35) P.set(x, y, '#a86f3b');
  }
  const blob = (x, y, s, c) => {
    const shapes = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]];
    for (const [i, j] of shapes[Math.min(shapes.length - 1, s)]) P.set((x + i) % n, (y + j) % n, c);
  };
  for (let k = 0; k < 520; k++) blob((R() * n) | 0, (R() * n) | 0, (R() * R() * 6) | 0, tones[(R() * tones.length) | 0]);
  // bright granule tops + dark granule gaps
  for (let k = 0; k < 90; k++) P.set((R() * n) | 0, (R() * n) | 0, '#e0ad6c');
  for (let k = 0; k < 120; k++) P.set((R() * n) | 0, (R() * n) | 0, '#6e4321');
  // old pin holes: a dark dot with a lit lower lip
  for (let k = 0; k < 6; k++) {
    const x = (R() * (n - 2)) | 0, y = (R() * (n - 2)) | 0;
    P.set(x, y, '#3a210c'); P.set(x + 1, y, '#5a3516'); P.set(x, y + 1, '#dca66a');
  }
  return P.done();
}

// ---------------------------------------------------------------------------- wood (9-slice)

/** Walnut frame: T texels thick, grain runs along each bar. Returns { url, slice }. */
function woodFrame(n = 40, T = 11) {
  const P = painter(n, n);
  const R = rng(21);
  const body = ['#6b3d1c', '#7a4722', '#87532a', '#5e3417', '#93602f'];
  const grain = (u, v, seed) => {
    // u along the bar, v across it: long streaks, a knot now and then
    const s = Math.sin(v * 1.7 + Math.sin(u * 0.13 + seed) * 1.6 + seed * 3.1);
    const k = Math.sin(u * 0.05 + seed * 7) * Math.sin(v * 0.9 + seed);
    return s * 0.7 + k * 0.5;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dl = x, dt = y, dr = n - 1 - x, db = n - 1 - y;
    const d = Math.min(dl, dt, dr, db);
    if (d >= T) continue;
    // which bar owns this texel (mitred corners: the nearer edge wins)
    const side = d === dt ? 't' : d === db ? 'b' : d === dl ? 'l' : 'r';
    const u = side === 't' || side === 'b' ? x : y, v = d;
    const seed = side === 't' ? 1 : side === 'b' ? 2 : side === 'l' ? 3 : 4;
    const gv = grain(u, v, seed) + (R() - 0.5) * 0.35;
    let c = gv > 0.75 ? body[4] : gv > 0.25 ? body[2] : gv > -0.35 ? body[1] : gv > -0.85 ? body[0] : body[3];
    // bevel: lit top / left, shaded bottom / right
    if (v === 1) c = side === 't' || side === 'l' ? '#b07a44' : '#4a2911';
    if (v === 2 && (side === 't' || side === 'l')) c = mix(c, '#b07a44', 0.45);
    if (v === T - 3) c = side === 'b' || side === 'r' ? mix(c, '#b07a44', 0.35) : mix(c, '#3a1f0c', 0.35);
    if (v === T - 2) c = '#3a1f0c';
    if (v === 0 || v === T - 1) c = INK;
    // mitre seam
    if (v > 0 && v < T - 1 && (Math.min(dl, dr) === Math.min(dt, db)) && Math.min(dl, dr) < T) c = '#3a1f0c';
    P.set(x, y, c);
  }
  // brass nails in the corners
  const nail = (cx, cy) => {
    P.set(cx - 1, cy - 1, '#fff2b0'); P.set(cx, cy - 1, '#ffd84a'); P.set(cx + 1, cy - 1, '#d49a22');
    P.set(cx - 1, cy, '#ffd84a'); P.set(cx, cy, '#e8b030'); P.set(cx + 1, cy, '#a8700e');
    P.set(cx - 1, cy + 1, '#d49a22'); P.set(cx, cy + 1, '#a8700e'); P.set(cx + 1, cy + 1, '#6a4006');
    P.set(cx + 2, cy + 2, '#2a1606', 140);
  };
  const m = Math.floor(T / 2);
  nail(m, m); nail(n - 1 - m, m); nail(m, n - 1 - m); nail(n - 1 - m, n - 1 - m);
  return { url: P.done(), slice: T };
}

/** Header sign plank: 9-slice, horizontal grain, burnt edge, two nails at the ends. */
function plank(w = 48, hh = 20, S = 7) {
  const P = painter(w, hh);
  const R = rng(5);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const edge = Math.min(x, y, w - 1 - x, hh - 1 - y);
    // stepped rounded corners
    if ((x < 2 || x > w - 3) && (y < 2 || y > hh - 3) && !(x === 1 && y === 1) && !(x === w - 2 && y === 1) && !(x === 1 && y === hh - 2) && !(x === w - 2 && y === hh - 2)) continue;
    const gv = Math.sin(y * 1.3 + Math.sin(x * 0.09) * 2.2) + (R() - 0.5) * 0.5;
    let c = gv > 0.8 ? '#c48a4a' : gv > 0.1 ? '#b07438' : gv > -0.6 ? '#9c6430' : '#8a5426';
    if (y === 1) c = '#e0aa66';
    if (y === 2) c = mix(c, '#e0aa66', 0.4);
    if (y === hh - 3) c = '#7a4620';
    if (y === hh - 2) c = '#5a3214';
    if (edge === 0 || (x === 1 && (y === 1 || y === hh - 2)) || (x === w - 2 && (y === 1 || y === hh - 2))) c = INK;
    else if (edge === 1 && (x === 1 || x === w - 2)) c = '#6a3c18';
    P.set(x, y, c);
  }
  const nail = (cx, cy) => { P.set(cx, cy, '#e8e4f0'); P.set(cx + 1, cy, '#9a96aa'); P.set(cx, cy + 1, '#9a96aa'); P.set(cx + 1, cy + 1, '#4a4658'); };
  nail(3, Math.floor(hh / 2) - 1); nail(w - 5, Math.floor(hh / 2) - 1);
  return { url: P.done(), slice: S };
}

// ---------------------------------------------------------------------------- paper (9-slice)

/**
 * A note. kind: 'dog' (cream, dog-eared bottom right), 'sticky' (curled foot), 'card' (index card:
 * blue header line + red margin), 'folder' (manila with a tab), 'plain'. Returns { url, slice }.
 */
function paper(fill, kind = 'plain', n = 18, S = 6) {
  const P = painter(n, n);
  const out = mix(fill, '#2a1606', 0.72), lo = shade(fill, -0.12), lo2 = shade(fill, -0.22), hi = shade(fill, 0.55);
  const top = kind === 'folder' ? 3 : 0;
  for (let y = top; y < n; y++) for (let x = 0; x < n; x++) {
    let c = fill;
    if (y === top + 1) c = hi;
    if (kind === 'sticky' && y >= n - 4) c = y === n - 2 ? lo2 : lo; // curled foot catches shadow
    if (kind === 'card' && y === top + 4) c = '#e05a6a';
    if (x === n - 2 || y === n - 2) c = c === fill || c === hi ? lo : c;
    if (x === 0 || y === top || x === n - 1 || y === n - 1) c = out;
    P.set(x, y, c);
  }
  if (kind === 'folder') {
    // tab on the top left
    for (let y = 0; y <= 3; y++) for (let x = 2; x < 10; x++) {
      if (y === 0 && (x === 2 || x === 9)) continue;
      P.set(x, y, y === 0 || x === 2 || x === 9 ? out : y === 1 ? hi : fill);
    }
    P.set(3, 3, fill); P.set(8, 3, fill);
  }
  if (kind === 'dog') {
    // folded bottom-right corner: the corner is cut along a crease and its flap lies on the note
    const k = 5, bx = n - k, by = n - k;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const x = bx + i, y = by + j, s = i + j;
      if (s > k - 1) P.clear(x, y);
      else if (s === k - 1) P.set(x, y, out);
      else P.set(x, y, i === 0 || j === 0 ? out : s === k - 2 ? lo2 : shade(fill, -0.16));
    }
  }
  return { url: P.done(), slice: S };
}

// ---------------------------------------------------------------------------- tape + pins

function tape(tilt = 0, w = 22, hh = 8) {
  const H = hh + Math.abs(tilt) * 2;
  const P = painter(w, H);
  const R = rng(11 + tilt * 3);
  const col = '#efe0b8', hi = '#fbf3da', lo = '#cdb98a';
  const jag = [0, 1, 0, 2, 1, 0, 1, 2, 0, 1];
  for (let x = 0; x < w; x++) {
    const off = Math.round(((tilt * (x - w / 2)) / w) * 2) + Math.abs(tilt);
    for (let y = 0; y < hh; y++) {
      // torn ends
      if (x < jag[y % jag.length] || x > w - 1 - jag[(y + 3) % jag.length]) continue;
      let c = col;
      if (y === 0) c = hi;
      if (y === hh - 1) c = lo;
      if (R() < 0.07) c = lo;
      P.set(x, y + off, c, y === 0 || y === hh - 1 ? 235 : 205);
    }
  }
  return P.done();
}

function pin(c) {
  const P = painter(11, 13);
  const out = mix(c, '#000000', 0.7), lo = shade(c, -0.3), hi = shade(c, 0.5);
  // cork shadow (offset down-right)
  for (const [x, y] of [[4, 8], [5, 8], [6, 8], [7, 9], [8, 10], [5, 9], [6, 9], [7, 10]]) P.set(x, y, '#2a1606', 90);
  // needle
  P.set(5, 8, '#c8ccd8'); P.set(6, 9, '#8a8ea0'); P.set(7, 10, '#5a5e70');
  // head: a chunky dome (stepped)
  const rows = [[3, 7], [2, 8], [1, 9], [1, 9], [2, 8], [3, 7]];
  rows.forEach(([a, b], j) => {
    for (let x = a; x <= b; x++) {
      const edge = x === a || x === b || j === 0 || j === rows.length - 1;
      let col = c;
      if (j >= 4 || x >= b - 1) col = lo;
      if (j <= 1 && x <= a + 2) col = hi;
      P.set(x, j + 1, edge ? out : col);
    }
  });
  P.set(3, 2, '#ffffff'); P.set(4, 2, '#ffffff'); P.set(3, 3, '#ffffff');
  // collar under the dome
  P.set(4, 7, out); P.set(5, 7, lo); P.set(6, 7, out);
  return P.done();
}

// ---------------------------------------------------------------------------- stains + doodles

function coffee() {
  const n = 40;
  const P = painter(n, n);
  const R = rng(33);
  const col = '#5c3412';
  const cx = 19.5, cy = 18.5;
  const gaps = [[0.6, 1.1], [3.6, 3.9]];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - cx, dy = y - cy;
    const a = Math.atan2(dy, dx) + Math.PI;
    const r0 = 13.4 + Math.sin(a * 3 + 1) * 0.9 + Math.sin(a * 7) * 0.4;
    const d = Math.hypot(dx, dy);
    if (d < r0 - 2.2) { if (R() < 0.5) P.set(x, y, col, 26); continue; }
    if (d > r0 + 0.6) continue;
    if (gaps.some(([g0, g1]) => a > g0 && a < g1)) continue;
    const edge = d > r0 - 0.6;
    P.set(x, y, edge ? '#3e2008' : col, edge ? 150 + ((R() * 40) | 0) : 85 + ((R() * 30) | 0));
  }
  // a drip off the bottom and a couple of splats
  for (let j = 0; j < 6; j++) P.set(24, 31 + j, col, 120 - j * 12);
  P.set(25, 33, col, 90); P.set(24, 37, col, 80); P.set(25, 37, col, 60);
  for (const [x, y] of [[4, 8], [5, 8], [34, 30], [35, 31], [33, 6]]) P.set(x, y, col, 110);
  return P.done();
}

/** A doodle on a torn notebook scrap: strokes = polylines in a 32x28 field. */
function doodle(strokes, ink = '#23306e', w = 34, hh = 30) {
  const P = painter(w, hh);
  const R = rng(strokes.length * 13 + w);
  const paperC = '#f7f4ea', rule = '#b7c9ea', out = '#6a5a40';
  // torn top edge, straight elsewhere
  const tear = Array.from({ length: w }, (_, x) => (x % 5 === 0 ? 1 : 0) + (R() < 0.35 ? 1 : 0));
  for (let x = 0; x < w; x++) for (let y = tear[x]; y < hh; y++) {
    let c = paperC;
    if ((y - 4) % 6 === 0 && y > 3) c = rule;
    if (x === 4) c = '#f0a0a8';
    if (y === tear[x] || x === 0 || x === w - 1 || y === hh - 1) c = out;
    else if (y === hh - 2 || x === w - 2) c = c === paperC ? '#e2dccb' : c;
    P.set(x, y, c);
  }
  for (const s of strokes) P.poly(s.map(([x, y]) => [x + 1, y + 1]), ink, 235);
  return P.done();
}
const DOODLES = {
  // panther head (the Beast logo, as drawn by someone in a hurry)
  panther: [
    [[8, 10], [10, 5], [13, 9], [20, 9], [23, 5], [25, 10], [26, 15], [24, 20], [20, 23], [13, 23], [9, 20], [7, 15], [8, 10]],
    [[12, 13], [14, 13]], [[19, 13], [21, 13]], [[15, 17], [16, 18], [17, 18], [18, 17]], [[16, 18], [16, 20]],
  ],
  // flask with bubbles
  flask: [
    [[13, 4], [13, 11], [7, 22], [8, 24], [25, 24], [26, 22], [20, 11], [20, 4]], [[12, 4], [21, 4]],
    [[10, 18], [23, 18]], [[14, 21], [15, 21]], [[18, 20], [19, 20]], [[22, 2], [23, 1]], [[25, 4], [26, 4]],
  ],
  // toilet (a Clogged Toilet fan sketch)
  toilet: [
    [[9, 3], [21, 3], [21, 11], [9, 11], [9, 3]], [[7, 12], [25, 12], [23, 17], [19, 19], [19, 24], [12, 24], [12, 19], [8, 17], [7, 12]],
    [[24, 9], [27, 6]], [[27, 4], [28, 3]], [[26, 2], [26, 1]],
  ],
  // stick figure with a money bag
  money: [
    [[10, 4], [13, 4], [14, 6], [13, 8], [10, 8], [9, 6], [10, 4]], [[11, 8], [11, 17]], [[11, 11], [6, 14]], [[11, 11], [18, 12]],
    [[11, 17], [7, 24]], [[11, 17], [15, 24]], [[19, 10], [24, 10], [27, 15], [26, 20], [19, 20], [17, 15], [19, 10]],
    [[22, 12], [22, 18]], [[24, 13], [21, 13], [21, 15], [24, 15], [24, 17], [20, 17]],
  ],
};

/** "!" sticker: a chunky red starburst with an ink rim and a lit top-left (the "!" is CSS text). */
function bangSticker(n = 22) {
  const P = painter(n, n);
  const c = (n - 1) / 2;
  const R = (a) => 8.6 + 1.9 * Math.cos(a * 9);
  const inside = (x, y) => { const dx = x - c, dy = y - c; return Math.hypot(dx, dy) <= R(Math.atan2(dy, dx)); };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!inside(x, y)) { if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) P.set(x, y, '#3a0610'); continue; }
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    const l = (c - x) + (c - y);
    P.set(x, y, edge ? (l > 0 ? '#ff8a90' : '#9a1420') : l > 6 ? '#ff5a62' : l < -7 ? '#c41e2a' : '#e8303a');
  }
  return P.done();
}

/** Worn stamp ink: an opaque tile with clustered holes (mask). */
function inkMask(n = 24) {
  const P = painter(n, n);
  const R = rng(91);
  P.rect(0, 0, n, n, '#ffffff');
  for (let k = 0; k < 10; k++) {
    const x = (R() * n) | 0, y = (R() * n) | 0;
    P.clear(x, y);
    if (R() < 0.3) P.clear((x + 1) % n, y);
  }
  for (let k = 0; k < 36; k++) { const x = (R() * n) | 0, y = (R() * n) | 0; P.clear(x, y); P.set(x, y, '#ffffff', 175); }
  return P.done();
}

/** Padlock shards for the unlock reveal. */
function lockBits() {
  const body = (flip) => {
    const P = painter(7, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 7; x++) {
      const edge = y === 0 || y === 7 || (flip ? x === 6 : x === 0);
      const crack = flip ? x === Math.max(0, 1 + (y % 3) - 1) : x === 6 - (y % 3);
      if (flip ? x < (y % 3) : x > 6 - (y % 3)) continue;
      P.set(x, y, edge || crack ? '#3a2a06' : y < 2 ? '#fff0a0' : y > 5 ? '#c08a14' : '#ffcc33');
    }
    return P.done();
  };
  const P = painter(9, 7);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) {
    const ring = (y === 0 && x >= 2 && x <= 6) || ((x === 1 || x === 7) && y >= 1) || ((x === 2 || x === 6) && y === 0);
    if (!ring) continue;
    P.set(x, y, '#c8ccd8');
  }
  P.set(2, 1, '#ffffff'); P.set(1, 2, '#ffffff');
  return { l: body(false), r: body(true), shackle: P.done() };
}

// ---------------------------------------------------------------------------- tally marks

const tallyCache = new Map();
/**
 * Hand-drawn progress: a pen checkbox for 1, tally marks (groups of five, the fifth struck through)
 * up to 12. Done marks in ink, the rest as faint pencil. Returns a data URL (one texel = 1 px art).
 */
export function tallyURL(done, total) {
  const key = done + '/' + total;
  if (tallyCache.has(key)) return tallyCache.get(key);
  const ink = '#1d2a6e', pencil = '#9a8e74';
  let url;
  if (total <= 1) {
    const P = painter(14, 14);
    P.poly([[1, 2], [11, 1], [12, 12], [2, 12], [1, 2]], '#3a2a14', 230);
    if (done >= 1) P.poly([[3, 7], [6, 10], [13, 1]], '#c81e2a', 255, 2);
    url = P.done();
  } else {
    const groups = Math.ceil(total / 5);
    const W = groups * 15 + 2, H = 14;
    const P = painter(W, H);
    for (let i = 0; i < total; i++) {
      const g = Math.floor(i / 5), k = i % 5;
      const col = i < done ? ink : pencil, a = i < done ? 255 : 150;
      const x0 = 2 + g * 15;
      if (k < 4) {
        const x = x0 + k * 3;
        P.line(x, 2 + (k % 2), x + (k === 2 ? 1 : 0), 11 + ((k + 1) % 2), col, a, i < done ? 2 : 1);
      } else P.line(x0 - 1, 10, x0 + 11, 3, col, a, i < done ? 2 : 1);
    }
    url = P.done();
  }
  tallyCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------- red string

/**
 * Draw red string between points (in CSS px, relative to the canvas) with a little sag, as chunky
 * pixels: one art texel = `px` CSS px. pts: [{x, y}] in order; segments: [[i, j], ...].
 */
export function drawString(canvas, w, hh, px, segs) {
  const W = Math.max(1, Math.ceil(w / px)), H = Math.max(1, Math.ceil(hh / px));
  canvas.width = W; canvas.height = H;
  canvas.style.width = W * px + 'px';
  canvas.style.height = H * px + 'px';
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  const dot = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  for (const [a, b] of segs) {
    const x0 = a.x / px, y0 = a.y / px, x1 = b.x / px, y1 = b.y / px;
    const len = Math.hypot(x1 - x0, y1 - y0);
    // slack yarn: short ties droop more than long runs
    const sag = Math.max(5, Math.min(16, len * 0.22));
    const steps = Math.ceil(len * 1.6) + 2;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag]);
    }
    // shadow on the cork, then the string with a lit top edge
    for (const [x, y] of pts) dot(x + 1, y + 2, 'rgba(40,16,4,0.35)');
    for (const [x, y] of pts) { dot(x, y, '#c81e2a'); dot(x, y + 1, '#7a0c14'); }
    // twisted yarn: a lit fleck every few texels
    for (let i = 0; i < pts.length; i += 4) dot(pts[i][0], pts[i][1], '#ff6a70');
  }
}

// ---------------------------------------------------------------------------- inject

let injected = false;
/** Paint every board texture once and expose them as CSS custom properties. */
export function ensureBoardArt() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const v = {};
  const nine = {};
  v['--qb-cork'] = corkTile();
  const wood = woodFrame();
  v['--qb-wood'] = wood.url; nine['--qb-wood-s'] = wood.slice;
  const pl = plank();
  v['--qb-plank'] = pl.url; nine['--qb-plank-s'] = pl.slice;
  const papers = {
    cream: paper('#fbf1d6', 'dog'), white: paper('#f7f7fb', 'card'), yellow: paper('#ffe46a', 'sticky'), pink: paper('#ffb0d2', 'sticky'),
    blue: paper('#a8dcff', 'sticky'), green: paper('#c4f29a', 'sticky'), manila: paper('#e9c47c', 'folder'), kraft: paper('#d6b07a', 'plain'),
    dim: paper('#d9d2c0', 'plain'), ink: paper('#2a2633', 'plain'),
  };
  for (const [k, p] of Object.entries(papers)) { v['--qb-paper-' + k] = p.url; nine['--qb-paper-s'] = p.slice; }
  v['--qb-tape'] = tape(0); v['--qb-tape-l'] = tape(-2); v['--qb-tape-r'] = tape(2);
  for (const [k, c] of Object.entries({ red: '#e8303a', blue: '#2b8cf2', green: '#3ec43a', yellow: '#ffc21a' })) v['--qb-pin-' + k] = pin(c);
  v['--qb-coffee'] = coffee();
  for (const [k, s] of Object.entries(DOODLES)) v['--qb-doodle-' + k] = doodle(s, k === 'toilet' ? '#1c1430' : '#23306e');
  v['--qb-ink'] = inkMask();
  v['--qb-bang'] = bangSticker();
  const lb = lockBits();
  v['--qb-lockbit-l'] = lb.l; v['--qb-lockbit-r'] = lb.r; v['--qb-lockbit-s'] = lb.shackle;
  const css = `:root{${Object.entries(v).map(([k, u]) => `${k}:url(${u})`).join(';')};${Object.entries(nine).map(([k, n]) => `${k}:${n}`).join(';')}}`;
  const st = document.createElement('style');
  st.id = 'quest-board-art';
  st.textContent = css;
  document.head.appendChild(st);
}
