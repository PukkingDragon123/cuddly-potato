// Procedural pixel art for the ONLINE BATTLE screens: the jagged LIVE badge,
// pixel pills, stepped portrait frames and the animated radar monitor. Everything
// is painted on tiny canvases (top-left light, hue-shifted ramps, Bayer dither,
// ink outlines) and shown with image-rendering: pixelated.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const INK = rgb('#120c24');

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** Pick a colour from a ramp (dark -> light) at t in 0..1 with ordered dithering. */
function ramp(cols, t, x, y) {
  const f = Math.max(0, Math.min(cols.length - 1, t * (cols.length - 1)));
  const i = Math.floor(f);
  return f - i > dith(x, y) && i + 1 < cols.length ? cols[i + 1] : cols[i];
}
const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// ---------------------------------------------------------------------------
// The LIVE badge: a 12-point pixel starburst, magenta with a gold rim

const BURST_N = 38;
const BS = BURST_N / 52;
function burstR(a) {
  // 12 sharp points; slightly irregular so it reads hand-drawn
  const k = (a / (Math.PI * 2)) * 12;
  const tri = Math.abs((k % 1) - 0.5) * 2; // 1 at points, 0 between
  return (18.4 + tri * 6.4) * BS;
}
export function badgeURL() {
  return memo('badge', () => {
    const N = BURST_N, c = canvas(N, N), g = c.getContext('2d');
    const img = g.createImageData(N, N), d = img.data;
    const body = ['#5a0a3c', '#8a0f52', '#c4126a', '#ff2e88', '#ff6ab0', '#ffb0d6'].map(rgb);
    const rim = ['#b8620e', '#ffc21a', '#ffe46a', '#fff6c8'].map(rgb);
    const cx = N / 2 - 0.5, cy = N / 2 - 0.5;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI;
        const R = burstR(a);
        let col = null;
        if (r <= R + 1) col = INK;
        if (r <= R - 0.2) {
          // light from the top-left
          const lt = 0.5 - (dx + dy) / (R * 2.6);
          col = ramp(rim, Math.min(1, lt + 0.15), x, y);
        }
        if (r <= R - 2.2) col = INK;
        if (r <= R - 3.0) {
          // flat cel bands lit from the top-left, one dithered seam between each
          const lt = 0.6 - (dx + dy) / (R * 3.2);
          const band = (v) => (v > 0.66 ? 4 : v > 0.4 ? 3 : 2);
          const seam = ((x + y) & 1) ? 0.035 : -0.035; // a 1-px checker only right on the band seams
          col = body[band(lt + seam)];
          if (r > R - 4.2) col = body[1];
          // glossy highlight crescent
          const hx = dx + 4.5, hy = dy + 5;
          if (Math.hypot(hx, hy) < 4.2 && Math.hypot(hx - 1.3, hy - 1.3) > 2.7) col = rgb('#ffd6ea');
        }
        if (!col) continue;
        const o = (y * N + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // little pixel sparkles on two points
    const spark = (sx, sy) => {
      g.fillStyle = '#fff6c8';
      g.fillRect(sx, sy - 1, 1, 3);
      g.fillRect(sx - 1, sy, 3, 1);
    };
    spark(6, 8);
    spark(31, 29);
    return c.toDataURL();
  });
}
/** The burst's silhouette as a pixel outline (the pulse that ripples out when live). */
export function burstRingURL() {
  return memo('ring', () => {
    const N = BURST_N, c = canvas(N, N), g = c.getContext('2d');
    const img = g.createImageData(N, N), d = img.data;
    const cx = N / 2 - 0.5, cy = N / 2 - 0.5;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), R = burstR(Math.atan2(dy, dx) + Math.PI);
        if (r > R + 1 || r < R - 0.6) continue;
        const o = (y * N + x) * 4;
        d[o] = 255; d[o + 1] = 120; d[o + 2] = 190; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  });
}

// ---------------------------------------------------------------------------
// Stepped pixel panels (pills, portrait frames)

/** A stepped-corner pixel pill / panel: ink outline, lit top, shaded bottom. */
export function pillURL(fill = '#2fbf4a', w = 20, h = 11) {
  return memo(`pill|${fill}|${w}|${h}`, () => {
    const c = canvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    const [r0, g0, b0] = rgb(fill);
    const shade = (f) => [Math.min(255, r0 * f), Math.min(255, g0 * f), Math.min(255, b0 * f)];
    const step = (x, y) => {
      // 2-step corners
      const cx = Math.min(x, w - 1 - x), cy = Math.min(y, h - 1 - y);
      return cx + cy < 2 ? -1 : cx + cy < 3 ? 0 : 1; // -1 outside, 0 outline, 1 inside
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = step(x, y);
        if (s < 0) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) s = 0;
        const col = s === 0 ? INK : y === 1 ? shade(1.45) : y >= h - 3 ? shade(y === h - 2 ? 0.62 : 0.8) : shade(1);
        const o = (y * w + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  });
}

/** A square portrait frame with stepped corners (transparent window), in a team colour. */
export function frameURL(col = '#ff2e88', N = 32) {
  return memo(`frame|${col}|${N}`, () => {
    const c = canvas(N, N), g = c.getContext('2d');
    const img = g.createImageData(N, N), d = img.data;
    const [r0, g0, b0] = rgb(col);
    const lit = [Math.min(255, r0 * 1.5 + 40), Math.min(255, g0 * 1.5 + 40), Math.min(255, b0 * 1.5 + 40)];
    const dark = [r0 * 0.55, g0 * 0.55, b0 * 0.55];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const cx = Math.min(x, N - 1 - x), cy = Math.min(y, N - 1 - y), e = Math.min(cx, cy), cc = cx + cy;
        if (cc < 3) continue; // stepped corner cut
        let col2 = null;
        if (e === 0 || cc === 3) col2 = INK;
        else if (e === 1 || cc === 4) col2 = x + y < N ? lit : rgb(col);
        else if (e === 2 || cc === 5) col2 = x + y < N ? rgb(col) : dark;
        else if (e === 3 || cc === 6) col2 = INK;
        if (!col2) continue;
        const o = (y * N + x) * 4;
        d[o] = col2[0]; d[o + 1] = col2[1]; d[o + 2] = col2[2]; d[o + 3] = 255;
      }
    }
    // rivets
    for (const [x, y] of [[4, 4], [N - 5, 4], [4, N - 5], [N - 5, N - 5]]) {
      const o = (y * N + x) * 4;
      d[o] = 255; d[o + 1] = 246; d[o + 2] = 200; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  });
}

// ---------------------------------------------------------------------------
// Radar monitor: a riveted, stepped-octagon bezel around a green CRT with a
// rotating pixel sweep and blips that light up as the beam passes.

const RN = 96;
function inOct(x, y, inset, cut) {
  const a = x - inset, b = y - inset, w = RN - 1 - inset * 2;
  if (a < 0 || b < 0 || a > w || b > w) return false;
  const cx = Math.min(a, w - a), cy = Math.min(b, w - b);
  return cx + cy >= cut;
}
function radarBase(hot) {
  return memo('radar|' + hot, () => {
    const img = new ImageData(RN, RN), d = img.data;
    const metal = ['#3a4060', '#5a6488', '#8a96b8', '#c4cce4', '#eef4ff'].map(rgb);
    const scr = hot ? ['#3a0a24', '#5a0e36', '#7a124a'].map(rgb) : ['#04141c', '#06222a', '#0a3238'].map(rgb);
    const line = hot ? rgb('#a3285e') : rgb('#13584e');
    const ring = hot ? rgb('#ff5aa8') : rgb('#2fbf8a');
    const c = RN / 2 - 0.5;
    for (let y = 0; y < RN; y++) {
      for (let x = 0; x < RN; x++) {
        let col = null;
        if (inOct(x, y, 0, 22)) col = INK;
        if (inOct(x, y, 1, 21)) col = ramp(metal, Math.max(0, Math.min(1, 0.85 - (x + y) / (RN * 2) * 1.1)), x, y);
        if (inOct(x, y, 6, 18) && !inOct(x, y, 7, 17)) col = INK;
        if (inOct(x, y, 7, 17)) {
          const r = Math.hypot(x - c, y - c);
          col = ramp(scr, Math.max(0, 1 - r / 44), x, y);
          if ((x - 7) % 10 === 0 || (y - 7) % 10 === 0) col = line;
          for (const rr of [13, 26, 39]) if (Math.abs(r - rr) < 0.55) col = ring;
          if (Math.abs(x - c) < 0.6 || Math.abs(y - c) < 0.6) col = ring;
        }
        if (!col) continue;
        const o = (y * RN + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    // bezel rivets + screws
    for (const [x, y] of [[24, 3], [RN - 25, 3], [24, RN - 4], [RN - 25, RN - 4], [3, 24], [3, RN - 25], [RN - 4, 24], [RN - 4, RN - 25]]) {
      for (const [dx, dy, v] of [[0, 0, 240], [1, 0, 150], [0, 1, 150], [1, 1, 60]]) {
        const o = ((y + dy) * RN + x + dx) * 4;
        d[o] = v; d[o + 1] = v; d[o + 2] = v + 10; d[o + 3] = 255;
      }
    }
    return img;
  });
}

export class RadarScreen {
  constructor() {
    this.el = canvas(RN, RN);
    this.el.className = 'ol-radar-cv';
    this.g = this.el.getContext('2d');
    this.blips = [];
    this.fast = false;
    this.hot = false;
    this.a = 0;
    this.last = performance.now();
    this.lit = new Map();
    const loop = (now) => {
      if (!this.el.isConnected && this.started) return;
      this.started = true;
      if (now - this.lastDraw > 66 || !this.lastDraw) { this.draw(now); this.lastDraw = now; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  /** blips: [{ id, x, y (0..1 within the screen), hot }] */
  setBlips(b) { this.blips = b; }
  draw(now) {
    const dt = Math.min(0.2, (now - this.last) / 1000);
    this.last = now;
    this.a = (this.a + dt * (this.fast ? 3.9 : 1.6)) % (Math.PI * 2);
    const base = radarBase(this.hot);
    const img = new ImageData(new Uint8ClampedArray(base.data), RN, RN), d = img.data;
    const c = RN / 2 - 0.5;
    const beam = this.hot ? [255, 170, 210] : [140, 255, 200];
    // the sweep: a pixel wedge trailing the beam, brightest at the leading edge
    for (let y = 8; y < RN - 8; y++) {
      for (let x = 8; x < RN - 8; x++) {
        if (!inOct(x, y, 7, 17)) continue;
        const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
        if (r > 44) continue;
        let da = this.a - (Math.atan2(dy, dx) + Math.PI);
        if (da < 0) da += Math.PI * 2;
        if (da > 1.1) continue;
        const k = 1 - da / 1.1;
        if (k * 0.85 < dith(x, y) * 0.9 + 0.08) continue;
        const o = (y * RN + x) * 4;
        const t = da < 0.06 ? 1 : k * 0.55;
        d[o] = d[o] + (beam[0] - d[o]) * t;
        d[o + 1] = d[o + 1] + (beam[1] - d[o + 1]) * t;
        d[o + 2] = d[o + 2] + (beam[2] - d[o + 2]) * t;
      }
    }
    // blips light up as the beam passes, then fade
    for (const b of this.blips) {
      const bx = Math.round(8 + b.x * (RN - 16)), by = Math.round(8 + b.y * (RN - 16));
      let ang = Math.atan2(by - c, bx - c) + Math.PI, da = this.a - ang;
      if (da < 0) da += Math.PI * 2;
      const glow = Math.max(0.25, 1 - da / 4.5);
      const col = b.hot ? [255, 90, 168] : [125, 255, 176];
      for (const [px, py, s] of [[0, 0, 1], [-1, 0, 0.7], [1, 0, 0.7], [0, -1, 0.7], [0, 1, 0.7], [-1, -1, 0.3], [1, 1, 0.3], [1, -1, 0.3], [-1, 1, 0.3]]) {
        const X = bx + px, Y = by + py;
        if (X < 0 || Y < 0 || X >= RN || Y >= RN) continue;
        const o = (Y * RN + X) * 4, t = Math.min(1, s * glow * 1.2);
        d[o] = d[o] + (col[0] - d[o]) * t;
        d[o + 1] = d[o + 1] + (col[1] - d[o + 1]) * t;
        d[o + 2] = d[o + 2] + (col[2] - d[o + 2]) * t;
      }
    }
    this.g.putImageData(img, 0, 0);
  }
}
