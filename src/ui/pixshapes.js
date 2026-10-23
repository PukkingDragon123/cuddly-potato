// Pixel-art shape sprites for the DOM UI, so nothing on screen is a plain
// smooth CSS circle / ellipse / soft radial blob. Each sprite is drawn texel by
// texel (stepped edges, Bayer-dithered falloff) and exposed on :root as a CSS
// custom property (url(data:...)). White sprites are meant as MASKS (colour them
// with background-color / a gradient; Chromium + WebKit honour image-rendering:
// pixelated on masks); the rest are ready-made images.
//
//   --pxs-ring      stepped ring, 2 texels thick            (mask)
//   --pxs-ring-ell  stepped elliptical ring (pedestal halo) (mask)
//   --pxs-disc      stepped solid disc                      (mask)
//   --pxs-ell       stepped ellipse (shadows, pedestals)    (mask)
//   --pxs-glow      dithered round glow, 4 bands            (mask)
//   --pxs-glow-ell  dithered elliptical glow                (mask)
//   --pxs-glow-w    white dithered glow                     (image, over a colour)
//   --pxs-shadow    dithered ink contact shadow             (image)
//   --pxs-bubble    lab bubble: outline + highlight         (image)
//   --pxs-ped       lit pedestal disc: rim, top, lip bands  (mask; colour with --ped-* gradient)
//   --pxs-brackets  lock-on corner brackets                 (mask)
//   --pxs-burst     pixel starburst                         (mask)
//   --pxs-diamond   stepped diamond ring                    (mask)
//   --ic-energy     the POWER gem icon (card cost badge)    (image)
import { iconURL } from './icons.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function sprite(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = fn(x, y, (x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }
  return `url(${c.toDataURL()})`;
}
const W = '#ffffff';

let done = false;
export function injectPixShapes() {
  if (done || typeof document === 'undefined') return;
  done = true;
  const v = {};
  // ring: |r - R| < thickness (in texels), stepped by the texel grid
  v['--pxs-ring'] = sprite(24, 24, (x, y, u, w) => { const r = Math.hypot(u, w) * 12; return r <= 11.6 && r > 9.4 ? W : null; });
  v['--pxs-ring-ell'] = sprite(40, 16, (x, y, u, w) => { const r = Math.hypot(u, w); return r <= 0.97 && r > 0.8 ? W : null; });
  v['--pxs-disc'] = sprite(16, 16, (x, y, u, w) => (Math.hypot(u, w) <= 0.96 ? W : null));
  v['--pxs-ell'] = sprite(32, 10, (x, y, u, w) => (Math.hypot(u, w) <= 0.98 ? W : null));
  // dithered glows: alpha bands by distance, ordered dither between bands
  const glow = (r, x, y) => { const t = 1 - r; return t <= 0 ? 0 : t + (bay(x, y) - 0.5) * 0.35; };
  v['--pxs-glow'] = sprite(32, 32, (x, y, u, w) => {
    const k = glow(Math.hypot(u, w), x, y);
    return k > 0.62 ? W : k > 0.38 ? 'rgba(255,255,255,0.66)' : k > 0.14 ? 'rgba(255,255,255,0.33)' : null;
  });
  v['--pxs-glow-ell'] = sprite(40, 16, (x, y, u, w) => {
    const k = glow(Math.hypot(u, w), x, y);
    return k > 0.6 ? W : k > 0.36 ? 'rgba(255,255,255,0.6)' : k > 0.12 ? 'rgba(255,255,255,0.28)' : null;
  });
  v['--pxs-glow-w'] = sprite(32, 32, (x, y, u, w) => {
    const k = glow(Math.hypot(u, w * 1.08), x, y);
    return k > 0.66 ? 'rgba(255,255,255,0.42)' : k > 0.4 ? 'rgba(255,255,255,0.26)' : k > 0.16 ? 'rgba(255,255,255,0.12)' : null;
  });
  v['--pxs-shadow'] = sprite(32, 10, (x, y, u, w) => {
    const k = glow(Math.hypot(u, w), x, y);
    return k > 0.5 ? 'rgba(10,4,30,0.55)' : k > 0.2 ? 'rgba(10,4,30,0.3)' : null;
  });
  v['--pxs-bubble'] = sprite(8, 8, (x, y, u, w) => {
    const r = Math.hypot(u, w);
    if (r > 1.02) return null;
    if (r > 0.7) return 'rgba(255,255,255,0.85)';
    if (x === 2 && y === 2 || x === 3 && y === 2 || x === 2 && y === 3) return W;
    return 'rgba(255,255,255,0.16)';
  });
  // pedestal: a top ellipse (bright rim, top face) over a darker lip band; colour comes from the
  // element's background (a stepped vertical gradient), the sprite only shapes + shades it
  v['--pxs-ped'] = sprite(40, 14, (x, y) => {
    const u = (x + 0.5 - 20) / 20, top = Math.hypot(u, (y + 0.5 - 5.5) / 5.2), lip = Math.hypot(u, (y + 0.5 - 8.5) / 5.2);
    if (top <= 0.98) return top > 0.84 ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.86)';
    if (lip <= 0.98 && y > 5) return 'rgba(255,255,255,0.55)';
    return null;
  });
  // lock-on brackets: four stepped L corners with a notch (tutorial pointer target)
  v['--pxs-brackets'] = sprite(32, 32, (x, y) => {
    const ex = Math.min(x, 31 - x), ey = Math.min(y, 31 - y);
    if (ex < 3 && ey < 10 || ey < 3 && ex < 10) return W;
    if (ex === 3 && ey === 3) return W; // inner corner step
    if (ex === 13 && ey < 2 || ey === 13 && ex < 2) return 'rgba(255,255,255,0.7)'; // tick
    return null;
  });
  // pixel starburst: 8 rays of square texels with gaps, a plus core (tap flash)
  v['--pxs-burst'] = sprite(25, 25, (x, y) => {
    const dx = x - 12, dy = y - 12, ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax + ay <= 1) return W;
    const onAxis = (dx === 0 || dy === 0) && Math.max(ax, ay) >= 4 && Math.max(ax, ay) <= 11 && Math.max(ax, ay) % 4 !== 3;
    const onDiag = ax === ay && ax >= 3 && ax <= 8 && ax % 3 !== 2;
    return onAxis ? W : onDiag ? 'rgba(255,255,255,0.75)' : null;
  });
  // stepped diamond ring (claim shockwave)
  v['--pxs-diamond'] = sprite(24, 24, (x, y) => { const d = Math.abs(x - 11.5) + Math.abs(y - 11.5); return d <= 11.5 && d > 9 ? W : null; });
  try { v['--ic-energy'] = `url(${iconURL('energy')})`; } catch (e) { /* icons unavailable */ }
  const de = document.documentElement.style;
  for (const k in v) de.setProperty(k, v[k]);
}
