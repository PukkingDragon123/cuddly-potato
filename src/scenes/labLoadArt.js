// Pixel art for the loading screen (scenes/loading.js): a glass lab tube lying
// on its side that fills with green goo. Drawn once per page into tiny canvases
// and scaled up with image-rendering: pixelated; the screen moves them with CSS
// transforms only, so the fill keeps going on the compositor while a scene
// build blocks the main thread.

export const INK = '#120c24';
// goo palette, top to bottom: meniscus, light, base, mid, dark
const GOO = ['#eaffd8', '#b6ff8a', '#7dff4a', '#3fd23f', '#1d8a3a'];
// tube size in art pixels (the interior is TW - 4 by TH - 4)
export const TW = 104, TH = 14;

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
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** Row inset of the rounded tube ends (pixel-stepped caps). */
const inset = (y, H) => (y === 0 || y === H - 1 ? 3 : y === 1 || y === H - 2 ? 1 : 0);

let cache = null;
/**
 * { back, goo, edge, front, bubble }:
 *   back  - ink outline, dark glass wall and the empty interior with measuring ticks
 *   goo   - the interior filled with goo (revealed from the left as loading runs)
 *   edge  - the bright leading edge of the goo (rides on the fill)
 *   front - glass glints drawn over everything
 *   bubble - a tiny goo bubble
 */
export function tubeArt() {
  if (cache) return cache;
  const W = TW, H = TH;
  // ---- back: outline + glass wall + dark interior
  const [back, b] = cnv(W, H);
  for (let y = 0; y < H; y++) {
    const i = inset(y, H);
    for (let x = i; x < W - i; x++) {
      const edgeRow = y === 0 || y === H - 1;
      const edgeCol = x === i || x === W - 1 - i;
      if (edgeRow || edgeCol) { P(b, x, y, INK); continue; }
      const wall = y === 1 || y === H - 2 || x <= i + 1 || x >= W - 2 - i;
      if (wall) { P(b, x, y, y < H / 2 ? '#8fb4e0' : '#4a6a9c'); continue; }
      P(b, x, y, y < 4 ? '#16204a' : '#0b1236');
    }
  }
  // measuring ticks along the bottom of the interior (every 10%)
  for (let k = 1; k < 10; k++) {
    const x = 2 + Math.round(((W - 4) * k) / 10);
    P(b, x, H - 4, '#25336a', 1, 2);
    if (k === 5) P(b, x, H - 6, '#25336a', 1, 2);
  }
  // ---- goo: the interior (W - 4) x (H - 4)
  const GW = W - 4, GH = H - 4;
  const [goo, g] = cnv(GW, GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const t = y / (GH - 1);
    let k = y === 0 ? 0 : y === 1 ? 1 : t < 0.55 ? 2 : t < 0.85 ? 3 : 4;
    // dithered band edges so the shading reads as pixel art, not a gradient
    if (k === 2 && t > 0.42 && bay(x, y) < (t - 0.42) * 6) k = 3;
    if (k === 3 && t > 0.72 && bay(x, y) < (t - 0.72) * 5) k = 4;
    P(g, x, y, GOO[k]);
  }
  // ---- edge: two bright columns with a wobbly meniscus
  const [edge, e] = cnv(2, GH);
  for (let y = 0; y < GH; y++) {
    P(e, 1, y, y % 3 === 1 ? GOO[1] : GOO[0]);
    P(e, 0, y, GOO[1]);
  }
  // ---- front: glass glints
  const [front, f] = cnv(W, H);
  P(f, 6, 2, 'rgba(255,255,255,0.75)', W - 22, 1);
  P(f, W - 13, 2, 'rgba(255,255,255,0.75)', 4, 1);
  P(f, 4, 3, 'rgba(255,255,255,0.25)', 3, 1);
  P(f, 10, H - 3, 'rgba(200,230,255,0.22)', W - 30, 1);
  // ---- bubble: a 4x4 pixel ring, lit from the top left
  const [bubble, bb] = cnv(4, 4);
  P(bb, 1, 0, GOO[0], 2, 1); P(bb, 0, 1, GOO[0], 1, 2); P(bb, 3, 1, GOO[1], 1, 2); P(bb, 1, 3, GOO[1], 2, 1);
  P(bb, 1, 1, 'rgba(234,255,216,0.3)', 2, 2);
  cache = { back, goo, edge, front, bubble };
  return cache;
}
