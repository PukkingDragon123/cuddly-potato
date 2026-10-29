// Pixel art for the loading screen's lab experiment (scenes/loading.js): the lab
// wall and bench, glassware with bubbling liquids (one canvas per liquid colour so
// the colour change is a cheap opacity crossfade), bunsen burner + flame frames,
// a pressure dial, and the particle sprites (bubbles, sparks, smoke puff frames,
// the blast frames, flying debris). Everything is drawn once per page into tiny
// canvases and scaled up with image-rendering: pixelated; the screen animates
// them with CSS transform / opacity only, so it keeps moving on the compositor
// while a scene build blocks the main thread.
//
// The Commander is the game's own 3D voxel chibi rendered into a few pose
// frames (stirring, nervous, panic, soot-faced) through engine.renderThumb, then
// pixel-snapped and ink outlined so it sits in the same pixel world.

export const INK = '#120c24';

export function cnv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
/** Fresh copy of a sprite canvas (a canvas can only live in one place in the DOM). */
export function copyOf(src) {
  const [c, g] = cnv(src.width, src.height);
  g.drawImage(src, 0, 0);
  return c;
}
const P = (g, x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
// tiny deterministic hash noise
const hsh = (x, y, s = 0) => {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** 1 px ink outline around every opaque pixel (4-neighbour), in place. */
export function outline(c, col = INK, alphaMin = 40) {
  const g = c.getContext('2d');
  const w = c.width, h = c.height;
  const d = g.getImageData(0, 0, w, h).data;
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  g.fillStyle = col;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a(x, y) > alphaMin) continue;
    if (a(x - 1, y) > alphaMin || a(x + 1, y) > alphaMin || a(x, y - 1) > alphaMin || a(x, y + 1) > alphaMin) g.fillRect(x, y, 1, 1);
  }
  return c;
}

// liquid palettes [highlight, base, mid, dark]
export const LIQ = {
  green: ['#e4ffc8', '#7dff4a', '#33cf3a', '#16803a'],
  purple: ['#f4d8ff', '#c46bff', '#8a3ae0', '#4c1a8a'],
  pink: ['#ffe0f0', '#ff5fb8', '#d8308a', '#8a1a52'],
  cyan: ['#e0fcff', '#4fe8ff', '#1fb0d8', '#11608a'],
  orange: ['#fff4c0', '#ffbe3a', '#f07a1a', '#9a3c0c'],
  red: ['#ffd8c8', '#ff5a3a', '#d8261e', '#7a0e14'],
  white: ['#ffffff', '#fffbe8', '#fff0b0', '#ffd860'],
};

// ------------------------------------------------------------------ glassware
const VESSELS = {
  // Erlenmeyer flask: narrow neck, conical body
  erlen: { w: 24, h: 30, level: 15, inside(x, y) {
    const cx = 12, hw = y < 9 ? 3 : 3 + ((y - 9) / 20) * 8.6 - (y >= 29 ? 1 : 0);
    return Math.abs(x + 0.5 - cx) < hw;
  } },
  // round-bottom flask (sits in the ring stand)
  round: { w: 20, h: 26, level: 13, inside(x, y) {
    const cx = 10;
    if (y < 10) return Math.abs(x + 0.5 - cx) < 2.6;
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - 17) ** 2 < 8.8 ** 2;
  } },
  // beaker with a pour lip
  beaker: { w: 18, h: 17, level: 7, inside(x, y) {
    if (y >= 16 && (x === 0 || x === 17)) return false;
    return x >= 0 && x < 18 && y >= 0 && y < 17;
  } },
  tube: { w: 4, h: 15, level: 6, inside(x, y) {
    if (y >= 13) return Math.abs(x + 0.5 - 2) < (y === 13 ? 1.8 : 1.1);
    return x >= 0 && x < 4;
  } },
};
const PAD = 2;
/**
 * A glass vessel with liquid, wall glints and an ink outline. `pal` = LIQ entry
 * (or null for empty glass). Same size for every colour so the canvases stack.
 */
export function vessel(kind, pal, o = {}) {
  const V = VESSELS[kind];
  const W = V.w + PAD * 2, H = V.h + PAD * 2 + 1;
  const [c, g] = cnv(W, H);
  const ins = (x, y) => y >= 0 && y < V.h && x >= -1 && x <= V.w && V.inside(x, y);
  const level = o.level ?? V.level;
  // glass walls first (any pixel next to the interior)
  for (let y = 0; y < V.h + 1; y++) for (let x = -1; x <= V.w; x++) {
    if (ins(x, y)) continue;
    let n = false;
    for (let dy = -1; dy <= 1 && !n; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && ins(x + dx, y + dy)) { n = true; break; }
    if (!n) continue;
    const left = ins(x + 1, y);
    P(g, x + PAD, y + PAD, left ? 'rgba(240,252,255,0.95)' : 'rgba(170,220,240,0.9)');
  }
  // rim lip: the mouth flares a pixel each side
  let top = -1;
  for (let x = 0; x < V.w; x++) if (ins(x, 0)) { if (top < 0) top = x; }
  if (top >= 0) {
    let right = top; while (ins(right + 1, 0)) right++;
    P(g, top - 2 + PAD, PAD - 1, '#e8fbff', right - top + 5, 1);
    P(g, top - 2 + PAD, PAD, 'rgba(200,236,250,0.9)', 1, 1);
    P(g, right + 2 + PAD, PAD, 'rgba(160,210,232,0.9)', 1, 1);
  }
  // interior: air (faint glass tint) and liquid
  for (let y = 0; y < V.h; y++) for (let x = 0; x < V.w; x++) {
    if (!ins(x, y)) continue;
    const X = x + PAD, Y = y + PAD;
    if (!pal || y < level) { P(g, X, Y, 'rgba(160,230,255,0.16)'); continue; }
    const edgeR = !ins(x + 1, y) || !ins(x + 2, y);
    const edgeL = !ins(x - 1, y);
    const bottom = !ins(x, y + 1) || !ins(x, y + 2);
    let col = pal[1];
    if (y === level) col = pal[0];
    else if (y === level + 1) col = (x & 1) ? pal[0] : pal[1];
    else if (edgeR || bottom) col = pal[3];
    else if (!ins(x + 3, y) || !ins(x, y + 3)) col = pal[2];
    else if (edgeL) col = pal[2];
    // suspended micro bubbles
    if (y > level + 2 && hsh(x, y, kind.length) > 0.93 && !edgeR) col = pal[0];
    P(g, X, Y, col);
  }
  // glass glints: a long streak down the left, a short one on the right
  for (let y = 1; y < V.h - 2; y++) {
    let lx = -1; for (let x = 0; x < V.w; x++) if (ins(x, y)) { lx = x; break; }
    if (lx < 0) continue;
    if (y % 9 !== 7) P(g, lx + 1 + PAD, y + PAD, y < level ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.55)');
  }
  outline(c);
  return c;
}

/** Rubber stopper + bent glass pipe for the flask mouths. */
export function stopper() {
  const [c, g] = cnv(10, 6);
  P(g, 2, 1, '#6a3a2a', 6, 4); P(g, 2, 1, '#a8603a', 6, 1); P(g, 3, 2, '#8a4a30', 4, 2);
  outline(c);
  return c;
}
/** Glass stirring rod. */
export function rod(len = 24) {
  const [c, g] = cnv(4, len);
  for (let y = 1; y < len - 1; y++) { P(g, 1, y, 'rgba(230,250,255,0.95)'); P(g, 2, y, 'rgba(150,210,235,0.9)'); }
  outline(c);
  return c;
}
/** Bunsen burner (base + barrel + collar). */
export function burner() {
  const [c, g] = cnv(14, 14);
  P(g, 2, 11, '#2a3044', 10, 2); P(g, 3, 10, '#4a5470', 8, 1); P(g, 2, 11, '#5a6688', 10, 1);
  P(g, 5, 2, '#9aa8c4', 4, 8); P(g, 5, 2, '#d8e4f4', 1, 8); P(g, 8, 2, '#6a7898', 1, 8);
  P(g, 4, 6, '#c8a040', 6, 2); P(g, 4, 6, '#ffe08a', 6, 1);
  P(g, 10, 10, '#5a3a3a', 3, 1); // gas hose
  outline(c);
  return c;
}
/** Burner flame frames (strip, `n` frames of 8x12): blue cone with a cyan core. */
export function flameStrip(n = 4) {
  const fw = 8, fh = 13;
  const [c, g] = cnv(fw * n, fh);
  for (let f = 0; f < n; f++) {
    const sway = [0, 1, 0, -1][f % 4];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const t = y / (fh - 1); // 0 top .. 1 base
      const hw = 0.4 + t * 2.7 + (f % 2) * 0.3 * (1 - t);
      const cx = 4 + sway * (1 - t) * 1.2;
      const d = Math.abs(x + 0.5 - cx);
      if (d > hw || y < (f % 2)) continue;
      let col = d > hw - 1 ? 'rgba(80,120,255,0.75)' : '#5aa0ff';
      if (d < hw * 0.5 && t > 0.35) col = '#bff4ff';
      if (t < 0.18) col = 'rgba(160,200,255,0.6)';
      P(g, f * fw + x, y, col);
    }
  }
  return c;
}
/** Retort ring stand (rod + ring clamp) for the round flask. */
export function ringStand() {
  const [c, g] = cnv(30, 40);
  P(g, 2, 36, '#2a3044', 26, 3); P(g, 2, 36, '#56608a', 26, 1);
  P(g, 25, 2, '#9aa8c4', 2, 35); P(g, 25, 2, '#d8e4f4', 1, 35);
  P(g, 6, 15, '#9aa8c4', 20, 2); P(g, 6, 15, '#e0ecfa', 20, 1); // ring arm
  P(g, 23, 13, '#5a6688', 4, 6); P(g, 24, 14, '#c8a040', 2, 2);
  outline(c);
  return c;
}

// ------------------------------------------------------------------ the room
/** Lab wall (tiles, shelf with glowing jars, pipes, hazard plate) 128 x 66. */
export function labWall(W = 128, H = 66) {
  const [c, g] = cnv(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = x % 8, ty = y % 8;
    const grout = tx === 7 || ty === 7;
    const v = hsh(x >> 3, y >> 3, 7);
    let col = grout ? '#101a34' : v > 0.82 ? '#22355e' : v > 0.4 ? '#1d2d52' : '#1a284a';
    if (!grout && tx === 0) col = '#263c66';
    if (!grout && ty === 0) col = '#2a4270';
    // vertical gradient: darker up high
    if (y < 12 && bay(x, y) > y / 12) col = '#121c38';
    P(g, x, y, col);
  }
  // wainscot hazard band low on the wall
  for (let x = 0; x < W; x++) for (let y = H - 6; y < H - 2; y++) P(g, x, y, ((x + y) >> 2) % 2 ? '#ffd23f' : '#1a1a24');
  P(g, 0, H - 7, '#0c1226', W, 1); P(g, 0, H - 2, '#0c1226', W, 2);
  // pipes across the top
  P(g, 0, 0, '#4a5878', W, 3); P(g, 0, 0, '#8a9ac0', W, 1); P(g, 0, 3, '#0c1226', W, 1);
  for (let x = 40; x < W; x += 30) { P(g, x, 0, '#c8a040', 3, 4); P(g, x, 0, '#ffe08a', 1, 4); }
  // gauge feed pipe (the dial hangs top-left, piped down into the big flask)
  P(g, 16, 26, '#4a5878', 3, 8); P(g, 16, 26, '#8a9ac0', 1, 8);
  // drop pipe + valve (right)
  P(g, 122, 3, '#4a5878', 3, 26); P(g, 122, 3, '#8a9ac0', 1, 26); P(g, 119, 18, '#d83a3a', 9, 2); P(g, 120, 17, '#ff7a6a', 7, 1);
  // shelf with specimen jars (top right)
  const shelfY = 15;
  P(g, 78, shelfY, '#6a4a3a', 40, 2); P(g, 78, shelfY, '#a8784a', 40, 1); P(g, 80, shelfY + 2, '#3a2a2a', 2, 3); P(g, 114, shelfY + 2, '#3a2a2a', 2, 3);
  const jars = [[81, 'green', 9], [91, 'purple', 7], [100, 'cyan', 10], [110, 'pink', 6]];
  for (const [jx, k, jh] of jars) {
    const p = LIQ[k];
    for (let y = 0; y < jh; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || x === 6;
      P(g, jx + x, shelfY - jh + y, edge ? '#9fd8ea' : y < 2 ? 'rgba(170,230,255,0.25)' : x === 1 ? p[0] : x >= 5 ? p[3] : p[1]);
    }
    P(g, jx - 1, shelfY - jh - 1, '#c0c8d8', 9, 1); P(g, jx, shelfY - jh - 2, '#7a849a', 7, 1); // lid
  }
  // a little "specimen" floating in the green jar
  P(g, 83, shelfY - 6, '#1a5a22', 3, 2); P(g, 84, shelfY - 7, '#1a5a22', 1, 1);
  // books on a low shelf behind the beaker side
  P(g, 40, 30, '#6a4a3a', 22, 2); P(g, 40, 30, '#a8784a', 22, 1);
  const books = ['#d83a5a', '#3a7ad8', '#ffd23f', '#5fdc4a', '#b05cff'];
  let bx = 42;
  for (let i = 0; i < 5; i++) { const bh = 7 + (i * 3) % 4; P(g, bx, 30 - bh, books[i], 3, bh); P(g, bx, 30 - bh, 'rgba(255,255,255,0.35)', 1, bh); bx += 4; }
  return c;
}
/** Lab bench: black epoxy top + cabinet front 128 x 32. */
export function labBench(W = 128, H = 32) {
  const [c, g] = cnv(W, H);
  P(g, 0, 0, '#3a4258', W, 1); P(g, 0, 1, '#262c40', W, 3); P(g, 0, 4, '#12141e', W, 1);
  for (let x = 0; x < W; x += 1) if (hsh(x, 1, 3) > 0.9) P(g, x, 2, '#3a4460');
  // cabinet front
  for (let y = 5; y < H; y++) for (let x = 0; x < W; x++) {
    const v = hsh(x, y, 11);
    P(g, x, y, y === 5 ? '#c8d0e0' : v > 0.92 ? '#a8b2c8' : '#b4bed2');
  }
  const doors = 4, dw = Math.floor(W / doors);
  for (let i = 0; i < doors; i++) {
    const x0 = i * dw;
    P(g, x0, 5, '#5a6480', 1, H - 5);
    P(g, x0 + 3, 9, '#8a96b0', dw - 6, 1); P(g, x0 + 3, 9, '#8a96b0', 1, H - 13); P(g, x0 + dw - 4, 9, '#e4eaf4', 1, H - 13); P(g, x0 + 3, H - 5, '#e4eaf4', dw - 6, 1);
    const hx = i % 2 ? x0 + 6 : x0 + dw - 9;
    P(g, hx, 14, '#2a3044', 3, 6); P(g, hx, 14, '#6a7898', 1, 6);
  }
  // stickers on the doors
  P(g, 76, 14, '#ffd23f', 6, 6); P(g, 78, 15, '#1a1a24', 2, 3); P(g, 78, 19, '#1a1a24', 2, 1); // "!" hazard
  P(g, 104, 18, '#5fdc4a', 7, 5); P(g, 105, 19, '#ffffff', 5, 1); P(g, 105, 21, '#ffffff', 3, 1);
  P(g, 0, H - 2, '#5a6480', W, 2);
  return c;
}
/** Pressure dial face 28 x 28 (needle drawn separately so it can rotate). */
export function gaugeFace() {
  const S = 28, c0 = S / 2;
  const [c, g] = cnv(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c0, dy = y + 0.5 - c0, r = Math.hypot(dx, dy);
    if (r > 13) continue;
    if (r > 11.2) { P(g, x, y, dy < -dx * 0.3 ? '#ffe08a' : dy > 4 ? '#8a6418' : '#c8a040'); continue; }
    if (r > 10.4) { P(g, x, y, '#5a4410'); continue; }
    let col = '#f4eedc';
    if (dy > 2 && bay(x, y) < 0.3) col = '#ddd4ba';
    // coloured zones on the arc (from -135deg .. +135deg, 0 = up)
    const ang = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (r > 7.6 && r < 10.2 && ang > -135 && ang < 135) {
      col = ang < 20 ? '#4ad84a' : ang < 75 ? '#ffd23f' : '#ff3a3a';
      if (r > 9.4) col = ang < 20 ? '#2a9a3a' : ang < 75 ? '#d8a020' : '#a81e1e';
    }
    // ticks
    for (let a = -135; a <= 135; a += 27) if (Math.abs(ang - a) < 3.2 && r > 6.4 && r < 7.8) col = '#2a2430';
    P(g, x, y, col);
  }
  // tiny skull in the red zone + glass glint
  P(g, 19, 18, '#2a2430', 3, 2); P(g, 19, 20, '#2a2430', 1, 1); P(g, 21, 20, '#2a2430', 1, 1);
  P(g, 7, 6, 'rgba(255,255,255,0.8)', 3, 1); P(g, 6, 7, 'rgba(255,255,255,0.6)', 1, 2);
  P(g, 12, 17, '#2a2430', 4, 4); P(g, 13, 18, '#7a6a80', 2, 2); // hub base
  outline(c);
  return c;
}
export function gaugeNeedle() {
  const S = 28;
  const [c, g] = cnv(S, S);
  for (let y = 5; y < 15; y++) P(g, 13, y, y < 8 ? '#ff2e2e' : '#d81e1e', 2, 1);
  P(g, 13, 4, '#ff7a6a', 2, 1);
  P(g, 12, 13, '#2a2430', 4, 2); P(g, 13, 12, '#2a2430', 2, 4); P(g, 13, 13, '#c8c0d0', 1, 1);
  return c;
}
/** "DAYS SINCE LAST EXPLOSION" plate (the number is DOM text). */
export function signPlate(w = 34, h = 18) {
  const [c, g] = cnv(w, h);
  P(g, 1, 1, '#f4eedc', w - 2, h - 2);
  P(g, 1, 1, '#ffd23f', w - 2, 5);
  for (let x = 1; x < w - 1; x++) if (((x >> 1) & 1)) P(g, x, 1, '#1a1a24', 1, 1);
  P(g, w - 12, 8, '#1a1a24', 10, 9); P(g, w - 11, 9, '#2a3044', 8, 7);
  P(g, 3, h - 3, '#c8c0a8', w - 6, 1);
  P(g, 2, 2, '#9a9480', 1, 1); P(g, w - 3, 2, '#9a9480', 1, 1);
  outline(c);
  return c;
}

// ------------------------------------------------------------------ particles
/** Bubble: pixel ring with a hot glint. s = 3 | 4 | 6 */
export function bubble(s = 4, tint = '#d8fff4') {
  const [c, g] = cnv(s + 2, s + 2);
  const r = s / 2, cc = (s + 2) / 2;
  for (let y = 0; y < s + 2; y++) for (let x = 0; x < s + 2; x++) {
    const d = Math.hypot(x + 0.5 - cc, y + 0.5 - cc);
    if (d <= r && d > r - 1.05) P(g, x, y, tint);
    else if (d <= r - 1.05) P(g, x, y, 'rgba(220,255,250,0.18)');
  }
  P(g, Math.floor(cc - r * 0.4), Math.floor(cc - r * 0.45), '#ffffff');
  return c;
}
/** 4-point spark star: 7x7 (big) or 5x5. */
export function spark(big = true, hot = '#fff6c0', mid = '#ffd23f') {
  const s = big ? 7 : 5, m = s >> 1;
  const [c, g] = cnv(s, s);
  for (let i = 0; i < s; i++) { const e = Math.abs(i - m); const col = e === 0 ? '#ffffff' : e === 1 ? hot : mid; P(g, i, m, col); P(g, m, i, col); }
  if (big) { P(g, m - 1, m - 1, hot); P(g, m + 1, m + 1, hot); P(g, m - 1, m + 1, hot); P(g, m + 1, m - 1, hot); }
  return c;
}
/**
 * Smoke puff frames (strip, n x S): a lumpy cloud that grows, then breaks up
 * with ordered dither. tone = [light, mid, dark].
 */
export function puffStrip(S = 16, n = 6, tone = ['#e4e0f0', '#a8a0c0', '#6a6488'], seed = 1) {
  const [c, g] = cnv(S * n, S);
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push([(hsh(i, 1, seed) - 0.5) * 0.5, (hsh(i, 2, seed) - 0.5) * 0.4, 0.55 + hsh(i, 3, seed) * 0.4]);
  for (let f = 0; f < n; f++) {
    const u = f / (n - 1);
    const R = S * (0.18 + u * 0.3);
    const fade = Math.max(0, (u - 0.35) / 0.65);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let best = 9, shade = 0;
      for (const [bx, by, br] of blobs) {
        const dx = (x + 0.5 - S / 2) / R - bx * (1 + u), dy = (y + 0.5 - S / 2) / R - by * (1 + u) + u * 0.25;
        const d = Math.hypot(dx, dy) / br;
        if (d < best) { best = d; shade = dx + dy; }
      }
      if (best > 1) continue;
      if (bay(x + f, y) < fade * 1.05) continue;
      const col = best > 0.82 ? tone[2] : shade < -0.35 ? tone[0] : shade > 0.45 ? tone[2] : tone[1];
      P(g, f * S + x, y, col);
    }
  }
  return c;
}
/**
 * Explosion frames (strip, n x S): white-hot flash star -> lumpy fireball with
 * banded heat colours and spiky rim -> rolling dark smoke that breaks up.
 */
export function blastStrip(S = 64, n = 8) {
  const [c, g] = cnv(S * n, S);
  const c0 = S / 2;
  const HEAT = ['#ffffff', '#fff6c0', '#ffd23f', '#ff9a1a', '#ff5a1a', '#c8261e', '#5a1a24'];
  const SMOKE = ['#8a8098', '#5a5070', '#3a3450', '#24203a'];
  for (let f = 0; f < n; f++) {
    const u = f / (n - 1);
    const R = S * (f === 0 ? 0.2 : 0.3 + Math.min(1, u * 1.6) * 0.17);
    const heat = Math.max(0, 1 - u * 1.45); // 1 -> hot, 0 -> all smoke
    const erode = Math.max(0, (u - 0.55) / 0.45);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c0, dy = y + 0.5 - c0 + u * S * 0.06;
      const a = Math.atan2(dy, dx);
      const lump = 1 + 0.16 * Math.sin(a * 5 + f * 0.9) + 0.09 * Math.sin(a * 11 - f * 1.7) + (f === 0 ? 0.55 * Math.max(0, Math.cos(a * 4)) ** 8 : 0) + (f === 1 ? 0.4 * Math.max(0, Math.cos(a * 4 + 0.4)) ** 10 : 0);
      const r = Math.hypot(dx, dy) / (R * lump);
      if (r > 1) continue;
      // smoke ring creeps inward as it cools; the centre goes from hot to sooty
      const smokeEdge = 1 - (1 - heat) * 0.95 - 0.12;
      const k = (r + hsh(x, y, f) * 0.12);
      let col;
      if (k > smokeEdge) {
        const si = Math.min(3, Math.floor(((k - smokeEdge) / Math.max(0.05, 1 - smokeEdge)) * 3 + (dy > 0 ? 1 : 0) - (dx + dy < -R * 0.4 ? 1 : 0)));
        col = SMOKE[Math.max(0, si)];
      } else {
        const hk = k / Math.max(0.05, smokeEdge);
        const hi = Math.min(HEAT.length - 1, Math.floor(hk * 4.2 + (1 - heat) * 3));
        col = HEAT[hi];
      }
      if (erode && bay(x, y) < erode * (0.6 + r * 0.6)) continue;
      P(g, f * S + x, y, col);
    }
  }
  return c;
}
/** Flying debris sprites: glass shards, flask necks, corks, gears, bolts, splinters, goo. */
export function debrisSprites(liq = LIQ.green) {
  const out = [];
  const mk = (w, h, draw) => { const [c, g] = cnv(w, h); draw(g); outline(c); out.push(c); };
  mk(7, 6, (g) => { P(g, 1, 1, '#e8fbff', 4, 1); P(g, 1, 2, '#bfe8f6', 3, 1); P(g, 1, 3, '#9fd0ea', 2, 1); P(g, 1, 4, '#9fd0ea', 1, 1); }); // shard
  mk(5, 7, (g) => { P(g, 1, 1, '#e8fbff', 1, 5); P(g, 2, 2, '#bfe8f6', 2, 3); P(g, 3, 1, '#9fd0ea', 1, 1); }); // shard 2
  mk(6, 9, (g) => { P(g, 1, 1, '#e8fbff', 4, 1); P(g, 2, 2, 'rgba(200,240,255,0.9)', 2, 5); P(g, 1, 7, '#9fd0ea', 4, 1); }); // flask neck
  mk(6, 5, (g) => { P(g, 1, 1, '#a8603a', 4, 3); P(g, 1, 1, '#d8905a', 4, 1); }); // cork
  mk(8, 8, (g) => { P(g, 2, 1, '#9aa8c4', 4, 6); P(g, 1, 2, '#9aa8c4', 6, 4); P(g, 3, 3, '#3a4258', 2, 2); P(g, 2, 1, '#d8e4f4', 2, 1); }); // gear
  mk(4, 7, (g) => { P(g, 1, 1, '#c8d0e0', 2, 2); P(g, 1, 3, '#7a849a', 2, 3); }); // bolt
  mk(9, 4, (g) => { P(g, 1, 1, '#c8a06a', 7, 2); P(g, 1, 1, '#ffe0a8', 5, 1); }); // splinter
  mk(6, 6, (g) => { P(g, 1, 2, liq[1], 4, 3); P(g, 2, 1, liq[1], 2, 1); P(g, 2, 2, liq[0], 1, 1); P(g, 3, 4, liq[3], 2, 1); }); // goo blob
  mk(4, 12, (g) => { P(g, 1, 1, 'rgba(230,250,255,0.95)', 2, 8); P(g, 1, 6, LIQ.pink[1], 2, 4); P(g, 1, 10, LIQ.pink[3], 2, 1); }); // test tube
  mk(10, 4, (g) => { P(g, 1, 1, '#5a3a3a', 8, 2); P(g, 1, 1, '#8a5a5a', 8, 1); }); // hose bit
  return out;
}
/** Big "KABOOM" letters are DOM text; these are the fire tongues behind them. */

// ------------------------------------------------------------------ the Commander
const frameCache = new Map();
/**
 * Pose frames of the player's Commander as pixel sprites: stir1, stir2, nervous,
 * panic, soot. Rendered through the thumbnail renderer (synchronous, ~5 small
 * renders), cached per character. Returns null if 3D isn't available.
 */
export async function commanderFrames(W = 60, H = 66) {
  let charId = 'jimmy', override = null;
  try {
    const { state } = await import('../game/state.js');
    const { COMMANDERS } = await import('../data/commanders.js');
    const { CMD_SKINS } = await import('../data/season.js');
    const p = state.p;
    const id = p?.commanders?.equipped;
    const cm = COMMANDERS[id];
    if (cm && cm.char !== 'recruit') {
      charId = cm.char;
      const sk = p.commanders.owned?.[id]?.skin;
      if (sk && CMD_SKINS[sk]) { override = { ...CMD_SKINS[sk] }; delete override.name; delete override.commander; }
    }
  } catch (e) { /* no profile yet: Jimmy runs the lab */ }
  const key = `${charId}|${JSON.stringify(override)}|${W}x${H}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const job = (async () => {
    const THREE = await import('three');
    const { engine } = await import('../core/engine.js');
    const { Chibi, CHIBI_HEIGHT } = await import('../core/chibi.js');
    const { CHARACTERS } = await import('../data/characters.js');
    const def = { ...CHARACTERS[charId], ...(override ?? {}) };
    const c = new Chibi(def, { fidget: false });
    // invisible framing box: every pose renders with the same camera (no size jumps)
    const box = new THREE.Mesh(new THREE.BoxGeometry(CHIBI_HEIGHT * 0.95, CHIBI_HEIGHT * 0.62, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
    box.position.y = CHIBI_HEIGHT * 0.73;
    c.root.add(box);
    c.face.autoLook = false;
    const frames = {};
    const POSE = {
      stir1: { eyes: 'happy', mouth: 'grin', arm: [[-1.05, 0.2, -0.28, -0.55], [-1.5, -0.25, 0.42, -0.9]], torso: 0.12, head: [0.16, -0.08, 0.06] },
      stir2: { eyes: 'happy', mouth: 'grin', arm: [[-1.35, 0.25, -0.35, -0.85], [-1.15, -0.1, 0.3, -0.5]], torso: 0.1, head: [0.12, 0.1, -0.05] },
      nervous: { eyes: 'worried', mouth: 'grimace', fx: ['sweat'], arm: [[-0.95, 0.15, -0.5, -0.6], [-0.95, -0.15, 0.5, -0.6]], torso: -0.06, head: [0.02, 0.18, 0.08] },
      panic: { eyes: 'shock', mouth: 'scream', fx: ['sweat'], arm: [[0.1, 0, -2.5, -0.45], [-0.1, 0, 2.35, -0.3]], torso: -0.16, head: [-0.14, 0, 0.04] },
      soot: { eyes: 'dizzy', mouth: 'open', arm: [[0, 0, -0.55, -0.2], [0.1, 0, 0.62, -0.25]], torso: -0.04, head: [0.06, -0.12, 0.18] },
    };
    for (const [name, ps] of Object.entries(POSE)) {
      c.play('idle');
      c.expr(ps.eyes, ps.mouth);
      for (const f of ps.fx ?? []) c.face.fx(f, true);
      c.face.blinkT = 99;
      c.snap();
      const [L, R] = ps.arm;
      c.armL.rotation.set(L[0], L[1], L[2]); c.elbowL.rotation.set(L[3], 0, 0);
      c.armR.rotation.set(R[0], R[1], R[2]); c.elbowR.rotation.set(R[3], 0, 0);
      c.torso.rotation.set(ps.torso, 0, 0);
      c.head.rotation.set(ps.head[0], ps.head[1], ps.head[2]);
      c.setHand('L', name.startsWith('stir') ? 'fist' : 'open');
      c.setHand('R', name.startsWith('stir') ? 'fist' : 'open');
      c.face.redraw?.();
      engine.renderThumb(c.root, { w: W * 2, h: H * 2, yaw: 0.22, pitch: 0.1, zoom: 1, lift: 0 });
      const src = engine.thumbCanvas;
      // 2x render -> pixel sprite: nearest downsample keeps it crisp
      const [cv, g] = cnv(W, H);
      g.imageSmoothingEnabled = true;
      g.drawImage(src, 0, 0, W, H);
      // snap alpha (no soft fringe in pixel land)
      const id = g.getImageData(0, 0, W, H);
      for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] > 110 ? 255 : 0;
      g.putImageData(id, 0, 0);
      if (name === 'soot') sootify(cv);
      outline(cv);
      frames[name] = cv;
    }
    c.root.remove(box);
    return frames;
  })().catch((e) => { console.warn('loading commander frames', e); frameCache.delete(key); return null; });
  frameCache.set(key, job);
  return job;
}
/** Blackened, smoking, frazzled: dithered soot over the sprite + spiky singed hair on top. */
function sootify(c) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const id = g.getImageData(0, 0, W, H);
  const d = id.data;
  let top = H, minX = W, maxX = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (y < top) top = y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!d[i + 3]) continue;
    // keep the eye whites readable: soot darkens, never fully blacks out
    const blot = hsh(x >> 1, y >> 1, 5) * 0.6 + hsh(x >> 2, y >> 2, 9) * 0.5;
    const k = blot > 0.62 ? 0.62 : blot > 0.42 && bay(x, y) < 0.5 ? 0.45 : 0.22;
    d[i] = d[i] * (1 - k) + 30 * k; d[i + 1] = d[i + 1] * (1 - k) + 26 * k; d[i + 2] = d[i + 2] * (1 - k) + 34 * k;
  }
  g.putImageData(id, 0, 0);
  // singed spikes sticking up off the head
  const cx = (minX + maxX) / 2;
  for (let i = -5; i <= 5; i++) {
    const x = Math.round(cx + i * 2.2);
    const hgt = 2 + Math.round(hsh(i, 3, 2) * 4);
    for (let y = 0; y < hgt; y++) P(g, x + (y > 1 ? (i % 2 ? 1 : -1) : 0), top + 1 - y, y === hgt - 1 ? '#5a4a40' : '#24202a');
  }
}

/** What's left of a vessel after the blast: the bottom with a jagged broken rim and a little liquid. */
export function brokenVessel(kind, pal) {
  const c = vessel(kind, pal, { level: VESSELS[kind].h - 4 });
  const g = c.getContext('2d');
  const H = c.height, W = c.width;
  const cut = Math.round(H * 0.58);
  for (let x = 0; x < W; x++) {
    const y0 = cut + Math.round((hsh(x, 1, 4) - 0.5) * 6 + ((x % 5) < 2 ? -2 : 1));
    g.clearRect(x, 0, 1, Math.max(0, y0));
    // charred edge
    g.fillStyle = 'rgba(40,30,40,0.85)';
    const d = g.getImageData(x, y0, 1, 1).data;
    if (d[3]) g.fillRect(x, y0, 1, 1);
  }
  return c;
}
